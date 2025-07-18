import { Connection, PublicKey, Logs } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { ConnectionManager } from '../core/connection';
import { TokenInfo } from '../types';
import { TransactionParser } from '../utils/transaction-parser';

export class RaydiumMonitor extends EventEmitter {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private subscriptionId: number | null = null;
  private isMonitoring = false;
  private processedTransactions: Set<string> = new Set();
  private transactionParser: TransactionParser;
  
  // Optimized batching system for 429 handling
  private transactionBatch: string[] = [];
  private batchProcessingActive = false;
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchSize = 25; // Process 25 transactions per batch for better efficiency
  private minBatchSize = 5; // Minimum batch size before processing
  private batchDelay = 2000; // 2 seconds between batches to accumulate more transactions
  private maxWaitTime = 5000; // Maximum wait time for accumulating transactions
  private rateLimitBackoff = 1000; // Start with 1 second backoff (reduced from 2s)
  private maxBackoff = 15000; // Max 15 seconds backoff (reduced from 30s)
  
  // Raydium program addresses
  private static readonly RAYDIUM_PROGRAMS = {
    AMM_V4: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
    SERUM_PROGRAM: new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'),
    RAYDIUM_FEE: new PublicKey('7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'),
    OPENBOOK_PROGRAM: new PublicKey('opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb'),
  };

  private static readonly MONITORED_ADDRESSES = [
    // Raydium pool authority and fee collectors
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
    'GThUX1Atko4tqhN2NaiTazWSeFWMuiUiswPztEUf5g6n',
    'E5mrLLGJfpNBqc9CgVjCn9TvBSzLJCgJFEfBj5JCG1K7',
  ];

  constructor() {
    super();
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    this.transactionParser = new TransactionParser(this.connection);
    
    // Configure batch processing from environment variables
    this.batchSize = parseInt(process.env.RAYDIUM_BATCH_SIZE || '25');
    this.minBatchSize = parseInt(process.env.RAYDIUM_MIN_BATCH_SIZE || '5');
    this.batchDelay = parseInt(process.env.RAYDIUM_BATCH_DELAY || '2000');
    this.maxWaitTime = parseInt(process.env.RAYDIUM_MAX_WAIT_TIME || '5000');
    
    // Set optimized rate limiting for better batch processing
    this.connectionManager.setRateLimit(5, 200); // Max 5 concurrent, 200ms delay
    
    console.log(`🌊 Raydium Monitor initialized with optimized batch processing:`);
    console.log(`   - Batch size: ${this.batchSize}`);
    console.log(`   - Min batch size: ${this.minBatchSize}`);
    console.log(`   - Batch delay: ${this.batchDelay}ms`);
    console.log(`   - Max wait time: ${this.maxWaitTime}ms`);
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Raydium Monitor already running');
      return;
    }

    try {
      console.log('🚀 Starting Raydium pool monitoring...');
      
      // Monitor logs for Raydium AMM program with broader filtering
      this.subscriptionId = this.connection.onLogs(
        RaydiumMonitor.RAYDIUM_PROGRAMS.AMM_V4,
        (logs: Logs) => {
          this.handleRaydiumLogs(logs);
        },
        'confirmed'
      );

      this.startFeeAccountMonitoring();
      this.isMonitoring = true;
      console.log('✅ Raydium monitoring started');
      
      this.emit('monitoringStarted');
    } catch (error) {
      console.error('❌ Error starting Raydium monitoring:', error);
      this.emit('error', error);
    }
  }

  private async startFeeAccountMonitoring(): Promise<void> {
    for (const address of RaydiumMonitor.MONITORED_ADDRESSES) {
      try {
        const pubkey = new PublicKey(address);
        this.connection.onAccountChange(
          pubkey,
          (accountInfo, context) => {
            this.handleAccountChange(accountInfo, context, address);
          },
          'confirmed'
        );
      } catch (error) {
        console.error(`❌ Error monitoring account ${address}:`, error);
      }
    }
  }

  private async handleRaydiumLogs(logs: Logs): Promise<void> {
    try {
      const signature = logs.signature;
      
      // Skip if already processed
      if (this.processedTransactions.has(signature)) {
        return;
      }

      // IMPROVED: More comprehensive log filtering
      const relevantLogs = logs.logs.filter(log => {
        const lowerLog = log.toLowerCase();
        return (
          lowerLog.includes('initialize') ||
          lowerLog.includes('createpool') ||
          lowerLog.includes('initializepool') ||
          lowerLog.includes('ray_log') ||
          lowerLog.includes('swap') ||
          lowerLog.includes('deposit') ||
          lowerLog.includes('liquidity') ||
          // Look for any instruction that might indicate pool activity
          logs.logs.some(l => l.includes('Program log:')) ||
          // Look for error logs that might still contain useful info
          lowerLog.includes('program') ||
          // Catch-all for any Raydium activity
          logs.logs.length > 0
        );
      });

      // IMPROVED: Process transactions even with minimal logs
      if (relevantLogs.length === 0 && logs.logs.length === 0) {
        return; // Only skip if absolutely no logs
      }
      
      this.processedTransactions.add(signature);
      
      // Clean up old processed transactions
      if (this.processedTransactions.size > 5000) {
        const oldEntries = Array.from(this.processedTransactions).slice(0, 2500);
        oldEntries.forEach(entry => this.processedTransactions.delete(entry));
      }

      console.log(`🔍 Raydium transaction queued: ${signature.slice(0, 8)}... (${relevantLogs.length} logs)`);
      this.addToBatch(signature);

    } catch (error) {
      console.error('❌ Error processing Raydium logs:', error);
      this.emit('error', error);
    }
  }

  private addToBatch(signature: string): void {
    this.transactionBatch.push(signature);
    
    if (!this.batchProcessingActive) {
      this.startBatchProcessing();
    }
    
    // Only process immediately if we have a full batch
    if (this.transactionBatch.length >= this.batchSize) {
      this.processBatch();
    }
    // Don't process small batches immediately - let them accumulate
  }

  private startBatchProcessing(): void {
    if (this.batchProcessingActive) return;
    
    this.batchProcessingActive = true;
    
    // Use longer wait time to accumulate more transactions
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.maxWaitTime);
  }

  private async processBatch(): Promise<void> {
    if (this.transactionBatch.length === 0) {
      this.batchProcessingActive = false;
      return;
    }

    // Check if we have enough transactions to process efficiently
    // But process small batches if we've waited long enough (maxWaitTime passed)
    if (this.transactionBatch.length < this.minBatchSize && this.batchTimeout) {
      console.log(`⏳ Waiting for more transactions (${this.transactionBatch.length}/${this.minBatchSize}). Will process in ${this.batchDelay}ms...`);
      
      // Wait a bit more for additional transactions, but force process after maxWaitTime
      this.batchTimeout = setTimeout(() => {
        this.forceProcessBatch();
      }, this.batchDelay);
      return;
    }

    const currentBatch = this.transactionBatch.splice(0, this.batchSize);
    console.log(`🔄 Processing optimized batch of ${currentBatch.length} transactions`);

    await this.processBatchCore(currentBatch);

    // Schedule next batch with optimized timing
    if (this.transactionBatch.length > 0) {
      // Use shorter delay if we have a good batch size, longer if we need to accumulate
      const nextDelay = this.transactionBatch.length >= this.minBatchSize ? this.batchDelay : this.maxWaitTime;
      
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, nextDelay);
    } else {
      this.batchProcessingActive = false;
    }
  }

  private async forceProcessBatch(): Promise<void> {
    if (this.transactionBatch.length === 0) {
      this.batchProcessingActive = false;
      return;
    }

    console.log(`⚡ Force processing batch of ${this.transactionBatch.length} transactions (timeout reached)`);
    
    // Force process whatever we have
    const currentBatch = this.transactionBatch.splice(0, this.batchSize);
    await this.processBatchCore(currentBatch);
    
    // Schedule next batch if needed
    if (this.transactionBatch.length > 0) {
      const nextDelay = this.transactionBatch.length >= this.minBatchSize ? this.batchDelay : this.maxWaitTime;
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, nextDelay);
    } else {
      this.batchProcessingActive = false;
    }
  }

  private async processBatchCore(currentBatch: string[]): Promise<void> {
    // Process transactions in parallel with controlled concurrency
    const processingPromises = currentBatch.map(async (signature, index) => {
      try {
        // Small stagger delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, index * 50));
        
        await this.processTransaction(signature);
        return { signature, success: true };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          return { signature, success: false, retry: true, error: errorMessage };
        } else {
          console.error(`❌ Error processing transaction ${signature.slice(0, 8)}:`, error);
          return { signature, success: false, retry: false, error: errorMessage };
        }
      }
    });

    // Wait for all transactions to complete
    const results = await Promise.allSettled(processingPromises);
    
    // Handle results
    const retryTransactions: string[] = [];
    let successCount = 0;
    let rateLimitHit = false;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { signature, success, retry } = result.value;
        if (success) {
          successCount++;
        } else if (retry) {
          retryTransactions.push(signature);
          rateLimitHit = true;
        }
      }
    }

    // Reset backoff on successful processing
    if (successCount > 0) {
      this.rateLimitBackoff = 1000;
    }

    // Handle rate limit retries
    if (rateLimitHit && retryTransactions.length > 0) {
      console.log(`⚠️ Rate limit hit, backing off for ${this.rateLimitBackoff}ms and retrying ${retryTransactions.length} transactions`);
      
      // Add failed transactions back to the front of the batch
      this.transactionBatch.unshift(...retryTransactions);
      
      // Increase backoff
      this.rateLimitBackoff = Math.min(this.rateLimitBackoff * 1.5, this.maxBackoff);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, this.rateLimitBackoff));
    }
    
    if (successCount > 0) {
      console.log(`✅ Successfully processed ${successCount}/${currentBatch.length} transactions`);
    }
  }

  private async processTransaction(signature: string): Promise<void> {
    console.log(`🔍 [RAYDIUM] Processing transaction: ${signature.slice(0, 8)}...`);
    
    try {
      // Get transaction with retries
      const transaction = await this.connectionManager.getParsedTransactionWithRetry(signature, 3);

      if (!transaction) {
        console.log(`⚠️ Transaction not found: ${signature.slice(0, 8)}`);
        return;
      }

      console.log(`✅ Transaction fetched: ${signature.slice(0, 8)}...`);

      // Use the enhanced parser with fallbacks
      let tokenInfo: TokenInfo | null = null;

      // Primary approach: Enhanced transaction parser
      try {
        const parsedTokenInfo = await this.transactionParser.extractTokenInfoFromTransaction(transaction, signature);
        if (parsedTokenInfo) {
          tokenInfo = this.transactionParser.convertToTokenInfo(parsedTokenInfo, signature, 'RAYDIUM_MONITOR');
          console.log(`✅ Enhanced parser success: ${tokenInfo.symbol}`);
        }
      } catch (error) {
        console.log(`⚠️ Enhanced parser failed: ${error instanceof Error ? error.message : error}`);
      }

      // Fallback approach: Internal enhanced parser
      if (!tokenInfo) {
        console.log(`🔄 Trying internal enhanced parser for ${signature.slice(0, 8)}...`);
        tokenInfo = await this.parseRaydiumTransactionEnhanced(transaction, signature);
      }

      // Last resort: Minimal extraction
      if (!tokenInfo) {
        console.log(`🔄 Trying minimal extraction for ${signature.slice(0, 8)}...`);
        tokenInfo = await this.extractMinimalTokenInfo(transaction, signature);
      }

      if (tokenInfo) {
        console.log(`🎯 Token detected: ${tokenInfo.symbol} (${(tokenInfo.mint || tokenInfo.address).slice(0, 8)}...)`);
        console.log(`💧 Liquidity: ${tokenInfo.liquidity?.usd?.toFixed(2) || 0} USD`);
        
        this.emit('tokenDetected', tokenInfo);
      } else {
        console.log(`❌ No token extracted from ${signature.slice(0, 8)} with any method`);
        // Optional: Log transaction structure for debugging
        if (process.env.DEBUG_TRANSACTIONS === 'true') {
          this.logTransactionStructure(transaction, signature);
        }
      }
    } catch (error) {
      console.error(`❌ Critical error processing ${signature.slice(0, 8)}:`, error);
    }
  }

  // SIMPLIFIED internal parser focused on core functionality
  private async parseRaydiumTransactionEnhanced(transaction: any, signature: string): Promise<TokenInfo | null> {
    try {
      const { meta, transaction: txn } = transaction;
      
      if (!meta || !txn) {
        console.log(`⚠️ Missing meta/transaction data for ${signature.slice(0, 8)}`);
        return null;
      }

      const preTokenBalances = meta.preTokenBalances || [];
      const postTokenBalances = meta.postTokenBalances || [];
      
      console.log(`📊 Token balances - Pre: ${preTokenBalances.length}, Post: ${postTokenBalances.length}`);

      // SIMPLIFIED: Find any valid non-SOL token
      const validTokens = postTokenBalances.filter((balance: any) => {
        const mint = balance.mint;
        
        // Basic validation
        if (!mint || mint.length < 32) return false;
        
        // Skip SOL variants
        if (mint === '11111111111111111111111111111112' || 
            mint === 'So11111111111111111111111111111111111111112') {
          return false;
        }

        // Accept any token with valid structure
        return true;
      });

      console.log(`🔍 Found ${validTokens.length} valid tokens`);

      if (validTokens.length === 0) {
        console.log(`❌ No valid tokens found`);
        return null;
      }

      // Select the best token (prefer those with balances)
      let selectedToken = validTokens.find((token: any) => {
        const amount = parseFloat(token.uiTokenAmount?.amount || '0');
        return amount > 0;
      }) || validTokens[0];

      const mint = selectedToken.mint;
      console.log(`🎯 Selected token: ${mint.slice(0, 8)}...`);

      // SIMPLIFIED metadata extraction
      const instructions = txn.message.instructions || [];
      const metadata = this.extractSimpleMetadata(instructions, mint);

      // SIMPLIFIED liquidity calculation
      const liquidity = this.calculateSimpleLiquidity(meta);

      const tokenInfo: TokenInfo = {
        address: mint,
        mint,
        symbol: metadata.symbol || this.generateSymbol(mint),
        name: metadata.name || `Raydium Token ${mint.slice(0, 8)}`,
        decimals: selectedToken.uiTokenAmount?.decimals || 9,
        supply: selectedToken.uiTokenAmount?.amount || '0',
        signature,
        timestamp: Date.now(),
        createdAt: Date.now(),
        source: 'RAYDIUM_MONITOR',
        detected: true,
        detectedAt: Date.now(),
        liquidity: {
          sol: liquidity.sol,
          usd: liquidity.usd,
          poolAddress: metadata.poolAddress
        },
        metadata: {
          raydiumPool: true,
          transactionSignature: signature,
          detectedAt: Date.now(),
          instructions: instructions.length,
          detectionMethod: 'simplified_internal',
          tokenCount: validTokens.length
        }
      };

      return tokenInfo;

    } catch (error) {
      console.error(`❌ Simplified parsing error for ${signature.slice(0, 8)}:`, error);
      return null;
    }
  }

  // Simplified minimal extraction as last resort
  private async extractMinimalTokenInfo(transaction: any, signature: string): Promise<TokenInfo | null> {
    try {
      const { meta } = transaction;
      
      if (!meta?.postTokenBalances) {
        return null;
      }

      // Find ANY non-SOL token
      const tokenBalance = meta.postTokenBalances.find((balance: any) => {
        const mint = balance.mint;
        return mint && 
               mint !== '11111111111111111111111111111112' && 
               mint !== 'So11111111111111111111111111111111111111112' &&
               mint.length >= 32;
      });

      if (!tokenBalance) {
        return null;
      }

      const mint = tokenBalance.mint;
      console.log(`🔧 Minimal extraction found: ${mint.slice(0, 8)}...`);

      return {
        address: mint,
        mint,
        symbol: this.generateSymbol(mint),
        name: `Token ${mint.slice(0, 8)}`,
        decimals: tokenBalance.uiTokenAmount?.decimals || 9,
        supply: tokenBalance.uiTokenAmount?.amount || '0',
        signature,
        timestamp: Date.now(),
        createdAt: Date.now(),
        source: 'RAYDIUM_MONITOR',
        detected: true,
        detectedAt: Date.now(),
        liquidity: { sol: 0, usd: 0 },
        metadata: {
          raydiumPool: true,
          transactionSignature: signature,
          detectedAt: Date.now(),
          detectionMethod: 'minimal_fallback'
        }
      };

    } catch (error) {
      console.error(`❌ Minimal extraction error:`, error);
      return null;
    }
  }

  private hasSignificantBalanceChange(preBalances: any[], postBalance: any): boolean {
    const preBalance = preBalances.find(pre => 
      pre.mint === postBalance.mint && pre.accountIndex === postBalance.accountIndex
    );

    if (!preBalance) return true;

    const preAmount = parseFloat(preBalance.uiTokenAmount?.amount || '0');
    const postAmount = parseFloat(postBalance.uiTokenAmount?.amount || '0');

    return Math.abs(postAmount - preAmount) > 0;
  }

  private extractSimpleMetadata(instructions: any[], mint: string): any {
    const metadata: any = {
      symbol: null,
      name: null,
      poolAddress: null,
      programIds: [],
      isRaydium: false
    };

    try {
      for (const instruction of instructions) {
        // Track program IDs
        if (instruction.programId) {
          metadata.programIds.push(instruction.programId);
          
          // Check if this is a Raydium transaction
          if (instruction.programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') {
            metadata.isRaydium = true;
          }
        }

        // Extract basic parsed data
        if (instruction.parsed?.info) {
          const info = instruction.parsed.info;
          
          if (info.pool || info.ammId) {
            metadata.poolAddress = info.pool || info.ammId;
          }
          
          if (info.symbol) metadata.symbol = info.symbol;
          if (info.name) metadata.name = info.name;
        }
      }
    } catch (error) {
      console.error('❌ Error extracting simple metadata:', error);
    }

    return metadata;
  }

  private calculateSimpleLiquidity(meta: any): { sol: number; usd: number } {
    try {
      // Calculate SOL movement from balance changes
      const preBalances = meta.preBalances || [];
      const postBalances = meta.postBalances || [];
      
      let totalMovement = 0;
      for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
        totalMovement += Math.abs((postBalances[i] || 0) - (preBalances[i] || 0));
      }

      const solLiquidity = totalMovement / 1e9; // Convert lamports to SOL
      const usdLiquidity = solLiquidity * 180; // SOL price estimate

      return {
        sol: Math.max(0, solLiquidity),
        usd: Math.max(0, usdLiquidity)
      };
    } catch (error) {
      console.error('❌ Error calculating simple liquidity:', error);
      return { sol: 0, usd: 0 };
    }
  }

  private generateSymbol(mint: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let symbol = '';
    
    // Use multiple positions in the mint for better randomness
    const positions = [1, 8, 16, 24];
    
    for (const pos of positions) {
      if (pos < mint.length) {
        const char = mint[pos];
        const index = parseInt(char, 16) % chars.length;
        symbol += chars[index];
      }
    }
    
    return symbol || 'RAYG'; // Fallback
  }

  private logTransactionStructure(transaction: any, signature: string): void {
    try {
      const { meta, transaction: txn } = transaction;
      
      console.log(`📋 [DEBUG] Transaction structure for ${signature.slice(0, 8)}:`);
      console.log(`  - Has meta: ${!!meta}`);
      console.log(`  - Has transaction: ${!!txn}`);
      
      if (meta) {
        console.log(`  - Pre token balances: ${meta.preTokenBalances?.length || 0}`);
        console.log(`  - Post token balances: ${meta.postTokenBalances?.length || 0}`);
        console.log(`  - Fee: ${meta.fee}`);
        console.log(`  - Status: ${meta.err ? 'ERROR' : 'SUCCESS'}`);
      }
      
      if (txn) {
        console.log(`  - Instructions: ${txn.message?.instructions?.length || 0}`);
        console.log(`  - Account keys: ${txn.message?.accountKeys?.length || 0}`);
      }
      
      // Log first few token balances for debugging
      if (meta?.postTokenBalances?.length > 0) {
        console.log(`  - Sample token balances:`, 
          meta.postTokenBalances.slice(0, 3).map((b: any) => ({
            mint: b.mint?.slice(0, 8) + '...',
            amount: b.uiTokenAmount?.amount,
            decimals: b.uiTokenAmount?.decimals
          }))
        );
      }
    } catch (error) {
      console.error('❌ Error logging transaction structure:', error);
    }
  }

  private handleAccountChange(accountInfo: any, context: any, address: string): void {
    try {
      console.log(`📊 Account change detected: ${address.slice(0, 8)}...`);
      
      this.emit('accountChanged', {
        address,
        accountInfo,
        context,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error(`❌ Error handling account change for ${address}:`, error);
    }
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      if (this.subscriptionId) {
        await this.connection.removeOnLogsListener(this.subscriptionId);
        this.subscriptionId = null;
      }

      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
        this.batchTimeout = null;
      }
      
      this.batchProcessingActive = false;
      this.transactionBatch.length = 0;

      this.isMonitoring = false;
      console.log('⏹️ Raydium monitoring stopped');
      this.emit('monitoringStopped');
    } catch (error) {
      console.error('❌ Error stopping Raydium monitoring:', error);
      this.emit('error', error);
    }
  }

  getStatus(): any {
    return {
      isMonitoring: this.isMonitoring,
      subscriptionId: this.subscriptionId,
      monitoredPrograms: Object.keys(RaydiumMonitor.RAYDIUM_PROGRAMS).length,
      monitoredAddresses: RaydiumMonitor.MONITORED_ADDRESSES.length,
      queuedTransactions: this.transactionBatch.length,
      processedCount: this.processedTransactions.size,
      batchConfig: {
        batchSize: this.batchSize,
        minBatchSize: this.minBatchSize,
        batchDelay: this.batchDelay,
        maxWaitTime: this.maxWaitTime
      },
      batchProcessingActive: this.batchProcessingActive
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const slot = await this.connection.getSlot();
      return slot > 0 && this.isMonitoring;
    } catch (error) {
      console.error('❌ Health check failed:', error);
      return false;
    }
  }
}