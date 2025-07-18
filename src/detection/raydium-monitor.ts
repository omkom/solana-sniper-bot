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
  
  // Batching system for 429 handling
  private transactionBatch: string[] = [];
  private batchProcessingActive = false;
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchSize = 1; // Process one at a time
  private batchDelay = 3000; // 3 seconds between batches
  private rateLimitBackoff = 2000; // Start with 2 second backoff
  private maxBackoff = 30000; // Max 30 seconds backoff
  
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
    
    // Set conservative rate limiting
    this.connectionManager.setRateLimit(1, 1500); // Max 1 concurrent, 1500ms delay
    
    console.log('🌊 Raydium Monitor initialized with enhanced token detection');
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
    
    if (this.transactionBatch.length >= this.batchSize) {
      this.processBatch();
    }
  }

  private startBatchProcessing(): void {
    if (this.batchProcessingActive) return;
    
    this.batchProcessingActive = true;
    
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.batchDelay);
  }

  private async processBatch(): Promise<void> {
    if (this.transactionBatch.length === 0) {
      this.batchProcessingActive = false;
      return;
    }

    const currentBatch = this.transactionBatch.splice(0, this.batchSize);
    console.log(`🔄 Processing batch of ${currentBatch.length} transactions`);

    for (const signature of currentBatch) {
      try {
        await this.processTransaction(signature);
        
        // Reset backoff on successful processing
        this.rateLimitBackoff = 2000;
        
        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          console.log(`⚠️ Rate limit hit, backing off for ${this.rateLimitBackoff}ms`);
          
          this.transactionBatch.unshift(signature);
          await new Promise(resolve => setTimeout(resolve, this.rateLimitBackoff));
          this.rateLimitBackoff = Math.min(this.rateLimitBackoff * 1.5, this.maxBackoff);
          break;
        } else {
          console.error(`❌ Error processing transaction ${signature.slice(0, 8)}:`, error);
        }
      }
    }

    // Schedule next batch
    if (this.transactionBatch.length > 0) {
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, this.batchDelay);
    } else {
      this.batchProcessingActive = false;
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
        console.log(`🎯 Token detected: ${tokenInfo.symbol} (${tokenInfo.mint.slice(0, 8)}...)`);
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
        mint,
        symbol: metadata.symbol || this.generateSymbol(mint),
        name: metadata.name || `Raydium Token ${mint.slice(0, 8)}`,
        decimals: selectedToken.uiTokenAmount?.decimals || 9,
        supply: selectedToken.uiTokenAmount?.amount || '0',
        signature,
        timestamp: Date.now(),
        createdAt: Date.now(),
        source: 'RAYDIUM_MONITOR',
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
        mint,
        symbol: this.generateSymbol(mint),
        name: `Token ${mint.slice(0, 8)}`,
        decimals: tokenBalance.uiTokenAmount?.decimals || 9,
        supply: tokenBalance.uiTokenAmount?.amount || '0',
        signature,
        timestamp: Date.now(),
        createdAt: Date.now(),
        source: 'RAYDIUM_MONITOR',
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
      processedCount: this.processedTransactions.size
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