import { Connection, PublicKey, Logs } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { ConnectionManager } from '../core/connection';
import { TokenInfo } from '../types';

export class RaydiumMonitor extends EventEmitter {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private subscriptionId: number | null = null;
  private isMonitoring = false;
  private processedTransactions: Set<string> = new Set();
  
  // Batching system for 429 handling
  private transactionBatch: string[] = [];
  private batchProcessingActive = false;
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchSize = 1; // Process one at a time
  private batchDelay = 5000; // 5 seconds between batches
  private rateLimitBackoff = 5000; // Start with 5 second backoff
  private maxBackoff = 60000; // Max 60 seconds backoff
  
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
    
    // Set very conservative rate limiting for Raydium monitoring
    this.connectionManager.setRateLimit(1, 2000); // Max 1 concurrent, 2000ms delay
    
    console.log('🌊 Raydium Monitor initialized with rate limiting');
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Raydium Monitor already running');
      return;
    }

    try {
      console.log('🚀 Starting Raydium pool monitoring...');
      
      // Method 1: Monitor logs for Raydium AMM program
      this.subscriptionId = this.connection.onLogs(
        RaydiumMonitor.RAYDIUM_PROGRAMS.AMM_V4,
        (logs: Logs) => {
          this.handleRaydiumLogs(logs);
        },
        'confirmed'
      );

      // Method 2: Monitor specific fee account changes
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
      
      console.log(`🔍 Raydium transaction detected: ${signature}`);

      // Filter for specific instruction types
      const relevantLogs = logs.logs.filter(log => 
        log.includes('initialize') || 
        log.includes('CreatePool') ||
        log.includes('InitializePool') ||
        log.includes('initialize2') ||
        log.includes('ray_log')
      );

      if (relevantLogs.length === 0) {
        return;
      }
      
      // Mark as processed
      this.processedTransactions.add(signature);
      
      // Clean up old processed transactions to prevent memory leak
      if (this.processedTransactions.size > 5000) {
        const oldEntries = Array.from(this.processedTransactions).slice(0, 2500);
        oldEntries.forEach(entry => this.processedTransactions.delete(entry));
      }

      console.log(`📊 Processing ${relevantLogs.length} relevant log entries`);

      // Add to batch instead of immediate processing
      this.addToBatch(signature);

    } catch (error) {
      console.error('❌ Error processing Raydium logs:', error);
      this.emit('error', error);
    }
  }

  private addToBatch(signature: string): void {
    this.transactionBatch.push(signature);
    
    // Start batch processing if not already active
    if (!this.batchProcessingActive) {
      this.startBatchProcessing();
    }
    
    // Process immediately if batch is full
    if (this.transactionBatch.length >= this.batchSize) {
      this.processBatch();
    }
  }

  private startBatchProcessing(): void {
    if (this.batchProcessingActive) return;
    
    this.batchProcessingActive = true;
    
    // Process batch every batchDelay milliseconds
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.batchDelay);
  }

  private async processBatch(): Promise<void> {
    if (this.transactionBatch.length === 0) {
      this.batchProcessingActive = false;
      console.log(`🔄 [DEBUG] Batch processing complete - no transactions left`);
      return;
    }

    const currentBatch = this.transactionBatch.splice(0, this.batchSize);
    console.log(`🔄 Processing batch of ${currentBatch.length} transactions`);
    console.log(`📋 [DEBUG] Current batch signatures:`, currentBatch.slice(0, 3).map(s => s.slice(0, 8)));

    for (const signature of currentBatch) {
      try {
        console.log(`🔄 [DEBUG] Processing transaction in batch: ${signature.slice(0, 8)}...`);
        await this.processTransaction(signature);
        
        // Reset backoff on successful processing
        this.rateLimitBackoff = 1000;
        
        // Small delay between transactions in batch
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
          console.log(`⚠️ Rate limit hit, backing off for ${this.rateLimitBackoff}ms`);
          
          // Add signature back to batch for retry
          this.transactionBatch.unshift(signature);
          
          // Wait with backoff
          await new Promise(resolve => setTimeout(resolve, this.rateLimitBackoff));
          
          // Increase backoff exponentially
          this.rateLimitBackoff = Math.min(this.rateLimitBackoff * 2, this.maxBackoff);
          break; // Stop processing this batch
        } else {
          console.error(`❌ Error processing transaction ${signature}:`, error);
        }
      }
    }

    // Schedule next batch processing
    if (this.transactionBatch.length > 0) {
      console.log(`🔄 [DEBUG] Scheduling next batch processing - ${this.transactionBatch.length} transactions remaining`);
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, this.batchDelay);
    } else {
      this.batchProcessingActive = false;
      console.log(`🔄 [DEBUG] All batches processed`);
    }
  }

  private async processTransaction(signature: string): Promise<void> {
    console.log(`🔍 [DEBUG] Starting to process transaction: ${signature}`);
    
    try {
      // Get full transaction details using optimized connection manager
      console.log(`📡 [DEBUG] Fetching transaction details for: ${signature}`);
      const transaction = await this.connectionManager.getParsedTransactionWithRetry(signature, 2);

      if (!transaction) {
        console.log(`⚠️ Transaction not found: ${signature}`);
        return;
      }

      console.log(`✅ [DEBUG] Transaction fetched successfully: ${signature}`);
      console.log(`📊 [DEBUG] Transaction structure:`, {
        hasMeta: !!transaction.meta,
        hasTransaction: !!transaction.transaction,
        metaKeys: transaction.meta ? Object.keys(transaction.meta) : 'NO META',
        transactionKeys: transaction.transaction ? Object.keys(transaction.transaction) : 'NO TRANSACTION'
      });

      // Parse transaction for token creation
      console.log(`🔬 [DEBUG] Starting to parse transaction: ${signature}`);
      const tokenInfo = await this.parseRaydiumTransaction(transaction, signature);
      
      if (tokenInfo) {
        console.log(`🎯 New Raydium token detected: ${tokenInfo.symbol} (${tokenInfo.mint})`);
        console.log(`💧 Token liquidity: ${tokenInfo.liquidity?.usd?.toFixed(2) || 0} USD`);
        
        // Emit with high priority for immediate processing
        this.emit('tokenDetected', tokenInfo);
      } else {
        console.log(`⚠️ No valid token info parsed from transaction: ${signature}`);
      }
    } catch (error) {
      console.error(`❌ Error processing transaction ${signature}:`, error);
      console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    }
  }

  private async parseRaydiumTransaction(transaction: any, signature: string): Promise<TokenInfo | null> {
    console.log(`🔬 [DEBUG] parseRaydiumTransaction called for: ${signature}`);
    
    try {
      const { meta, transaction: txn } = transaction;
      
      console.log(`📊 [DEBUG] Transaction structure check:`, {
        hasMeta: !!meta,
        hasTransaction: !!txn,
        metaType: typeof meta,
        transactionType: typeof txn
      });
      
      if (!meta || !txn) {
        console.log(`⚠️ No meta or transaction data for ${signature}`);
        return null;
      }

      // Look for token accounts in pre/post balances
      const tokenBalances = meta.postTokenBalances || [];
      console.log(`📊 Found ${tokenBalances.length} token balances in transaction ${signature}`);
      
      if (tokenBalances.length > 0) {
        console.log(`🔍 [DEBUG] Sample token balances:`, tokenBalances.slice(0, 3).map((balance: any) => ({
          mint: balance.mint,
          amount: balance.uiTokenAmount?.amount,
          decimals: balance.uiTokenAmount?.decimals,
          owner: balance.owner
        })));
      }
      
      const newTokens = tokenBalances.filter((balance: any) => {
        // Filter for newly created tokens (amount > 0 and not SOL)
        const isValidAmount = balance.uiTokenAmount?.amount !== '0';
        const isNotSol = balance.mint !== '11111111111111111111111111111112';
        
        console.log(`🔍 [DEBUG] Token filter check for ${balance.mint}:`, {
          amount: balance.uiTokenAmount?.amount,
          isValidAmount,
          isNotSol,
          passes: isValidAmount && isNotSol
        });
        
        return isValidAmount && isNotSol;
      });

      console.log(`🔍 Found ${newTokens.length} new tokens (non-SOL with amount > 0)`);
      
      if (newTokens.length === 0) {
        console.log(`⚠️ No new tokens found in transaction ${signature}`);
        console.log(`📊 [DEBUG] All token balances:`, tokenBalances.map((balance: any) => ({
          mint: balance.mint,
          amount: balance.uiTokenAmount?.amount,
          decimals: balance.uiTokenAmount?.decimals
        })));
        return null;
      }

      // Process the most likely candidate (usually first new token)
      const tokenBalance = newTokens[0];
      const mint = tokenBalance.mint;
      console.log(`🎯 [DEBUG] Processing token: ${mint}`);

      // Extract additional metadata from instruction data
      const instructions = txn.message.instructions || [];
      console.log(`📋 [DEBUG] Found ${instructions.length} instructions`);
      
      const metadata = this.extractTokenMetadata(instructions, mint);
      console.log(`📋 [DEBUG] Extracted metadata:`, metadata);

      // Calculate liquidity from SOL balances
      const liquidity = this.calculateLiquidity(meta.preBalances, meta.postBalances);
      console.log(`💧 [DEBUG] Calculated liquidity:`, liquidity);

      const tokenInfo: TokenInfo = {
        mint,
        symbol: metadata.symbol || this.generateSymbol(mint),
        name: metadata.name || `Raydium Token ${mint.slice(0, 8)}`,
        decimals: tokenBalance.uiTokenAmount?.decimals || 9,
        supply: tokenBalance.uiTokenAmount?.amount || '0',
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
          poolData: metadata.poolData
        }
      };

      console.log(`✅ Created TokenInfo for ${tokenInfo.symbol} (${mint}) - Liquidity: ${liquidity.usd.toFixed(2)} USD`);
      return tokenInfo;

    } catch (error) {
      console.error('❌ Error parsing Raydium transaction:', error);
      console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      return null;
    }
  }

  private extractTokenMetadata(instructions: any[], mint: string): any {
    const metadata: any = {
      symbol: null,
      name: null,
      poolAddress: null,
      poolData: {}
    };

    try {
      // Look for initialize instructions
      for (const instruction of instructions) {
        if (instruction.parsed?.type === 'initialize' || 
            instruction.parsed?.type === 'initialize2') {
          
          const info = instruction.parsed?.info;
          if (info) {
            metadata.poolAddress = info.ammId || info.pool;
            metadata.symbol = info.symbol || this.generateSymbol(mint);
            metadata.name = info.name || `Token ${mint.slice(0, 8)}`;
            metadata.poolData = info;
          }
        }
      }
    } catch (error) {
      console.error('❌ Error extracting token metadata:', error);
    }

    return metadata;
  }

  private calculateLiquidity(preBalances: number[], postBalances: number[]): { sol: number; usd: number } {
    try {
      // Calculate SOL difference (approximation)
      const solDifference = postBalances.reduce((sum, balance, index) => {
        const pre = preBalances[index] || 0;
        return sum + Math.abs(balance - pre);
      }, 0);

      const solLiquidity = solDifference / 1e9; // Convert lamports to SOL
      const usdLiquidity = solLiquidity * 150; // Rough SOL to USD conversion

      return {
        sol: Math.max(0, solLiquidity),
        usd: Math.max(0, usdLiquidity)
      };
    } catch (error) {
      console.error('❌ Error calculating liquidity:', error);
      return { sol: 0, usd: 0 };
    }
  }

  private generateSymbol(mint: string): string {
    // Generate a symbol from mint address
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let symbol = '';
    
    for (let i = 0; i < 4; i++) {
      const index = parseInt(mint[i * 8], 16) % chars.length;
      symbol += chars[index];
    }
    
    return symbol;
  }

  private handleAccountChange(accountInfo: any, context: any, address: string): void {
    try {
      console.log(`📊 Account change detected: ${address}`);
      
      // This could indicate new pool creation or fee collection
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

      // Clean up batch processing
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
      monitoredAddresses: RaydiumMonitor.MONITORED_ADDRESSES.length
    };
  }

  // Health check for the monitoring system
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