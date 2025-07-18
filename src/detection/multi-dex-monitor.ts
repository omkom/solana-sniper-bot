import { Connection, PublicKey, Logs } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { ConnectionManager } from '../core/connection';
import { TokenInfo } from '../types';
import { RaydiumMonitor } from './raydium-monitor';
import { TransactionParser } from '../utils/transaction-parser';

export class MultiDexMonitor extends EventEmitter {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private raydiumMonitor: RaydiumMonitor;
  private subscriptions: Map<string, number> = new Map();
  private isMonitoring = false;
  private detectedTokens: Map<string, TokenInfo> = new Map();
  private processedTransactions: Set<string> = new Set();
  private transactionCacheTimeout = 300000; // 5 minutes
  private transactionParser: TransactionParser;
  
  // DEX program addresses
  private static readonly DEX_PROGRAMS = {
    RAYDIUM_AMM: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
    ORCA_WHIRLPOOL: new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
    METEORA: new PublicKey('Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'),
    PUMP_FUN: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    JUPITER_V6: new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),
    SERUM_V3: new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'),
  };

  private static readonly POOL_CREATION_INSTRUCTIONS = [
    'initialize',
    'initializePool',
    'initialize2',
    'createPool',
    'InitializePool',
    'CreatePool',
    'InitializeInstruction',
    'create',
    'openPosition'
  ];

  constructor() {
    super();
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    this.raydiumMonitor = new RaydiumMonitor();
    this.transactionParser = new TransactionParser(this.connection);
    
    // Set up Raydium monitor event forwarding
    this.raydiumMonitor.on('tokenDetected', (tokenInfo: TokenInfo) => {
      this.handleTokenDetected(tokenInfo, 'RAYDIUM_DIRECT');
    });
    
    // Set optimized rate limiting for DEX monitoring
    this.connectionManager.setRateLimit(3, 300); // Max 3 concurrent, 300ms delay
    
    console.log('🌐 Multi-DEX Monitor initialized with enhanced parsing and optimized rate limiting');
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Multi-DEX Monitor already running');
      return;
    }

    try {
      console.log('🚀 Starting multi-DEX monitoring...');
      
      // Start specialized Raydium monitoring
      await this.raydiumMonitor.startMonitoring();
      
      // Start monitoring other DEX programs
      await this.startDexProgramMonitoring();
      
      // Enable transaction stream monitoring for comprehensive detection
      await this.startTransactionStreamMonitoring();
      
      this.isMonitoring = true;
      console.log('✅ Multi-DEX monitoring started');
      
      this.emit('monitoringStarted');
    } catch (error) {
      console.error('❌ Error starting multi-DEX monitoring:', error);
      this.emit('error', error);
    }
  }

  private async startDexProgramMonitoring(): Promise<void> {
    for (const [dexName, programId] of Object.entries(MultiDexMonitor.DEX_PROGRAMS)) {
      try {
        const subscriptionId = this.connection.onLogs(
          programId,
          (logs: Logs) => {
            this.handleDexLogs(logs, dexName, programId.toString());
          },
          'confirmed'
        );
        
        this.subscriptions.set(dexName, subscriptionId);
        console.log(`📡 Monitoring ${dexName}: ${programId.toString()}`);
      } catch (error) {
        console.error(`❌ Error monitoring ${dexName}:`, error);
      }
    }
  }

  private async startTransactionStreamMonitoring(): Promise<void> {
    try {
      // Monitor all transactions for rapid detection
      const subscriptionId = this.connection.onLogs(
        'all',
        (logs: Logs) => {
          this.handleAllTransactionLogs(logs);
        },
        'confirmed'
      );
      
      this.subscriptions.set('ALL_TRANSACTIONS', subscriptionId);
      console.log('📊 Transaction stream monitoring enabled');
    } catch (error) {
      console.error('❌ Error starting transaction stream monitoring:', error);
    }
  }

  private async handleDexLogs(logs: Logs, dexName: string, programId: string): Promise<void> {
    try {
      const signature = logs.signature;
      
      // Filter for pool creation instructions
      const poolCreationLogs = logs.logs.filter(log => 
        MultiDexMonitor.POOL_CREATION_INSTRUCTIONS.some(instruction => 
          log.toLowerCase().includes(instruction.toLowerCase())
        )
      );

      if (poolCreationLogs.length === 0) {
        return;
      }

      //console.log(`🔍 ${dexName} pool creation detected: ${signature}`);
      
      // Process transaction with context
      //console.log(`🔍 Processing transaction for token extraction...`);
      const tokenInfo = await this.processTransaction(signature, dexName, programId);
      
      if (tokenInfo) {
        console.log(`✅ Token extracted successfully: ${tokenInfo.symbol || 'Unknown'} (${tokenInfo.mint})`);
        this.handleTokenDetected(tokenInfo, dexName);
      } else {
        console.log(`❌ No token info extracted from transaction ${signature}`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${dexName} logs:`, error);
    }
  }

  private async handleAllTransactionLogs(logs: Logs): Promise<void> {
    try {
      // Only process logs that might be related to token creation
      const tokenRelatedLogs = logs.logs.filter(log => {
        const logLower = log.toLowerCase();
        return logLower.includes('mint') || 
               logLower.includes('token') || 
               logLower.includes('create') ||
               logLower.includes('initialize') ||
               logLower.includes('pool');
      });

      if (tokenRelatedLogs.length === 0) {
        return;
      }

      // Additional filtering for known patterns
      const suspiciousLogs = tokenRelatedLogs.filter(log => {
        const logLower = log.toLowerCase();
        return logLower.includes('new') || 
               logLower.includes('launch') ||
               logLower.includes('deploy') ||
               logLower.includes('mint to');
      });

      if (suspiciousLogs.length > 0) {
        console.log(`🔍 Suspicious token activity: ${logs.signature}`);
        
        // Process with lower priority and debouncing
        setTimeout(() => {
          this.processTransaction(logs.signature, 'UNKNOWN_DEX', 'UNKNOWN').catch(error => {
            console.error('❌ Error processing unknown transaction:', error);
          });
        }, 1000); // Reduced delay for faster detection
      }

    } catch (error) {
      console.error('❌ Error processing all transaction logs:', error);
    }
  }

  private async processTransaction(signature: string, dexName: string, programId: string): Promise<TokenInfo | null> {
    try {
      // Skip if already processed
      if (this.processedTransactions.has(signature)) {
        console.log(`⏭️ Transaction already processed: ${signature}`);
        return null;
      }
      
      // Mark as processed
      this.processedTransactions.add(signature);
      
      // Clean up old processed transactions to prevent memory leak
      if (this.processedTransactions.size > 10000) {
        const oldEntries = Array.from(this.processedTransactions).slice(0, 5000);
        oldEntries.forEach(entry => this.processedTransactions.delete(entry));
      }
      
      console.log(`📡 Fetching transaction data for ${signature}...`);
      
      // Use optimized connection manager with retry logic
      const transaction = await this.connectionManager.getParsedTransactionWithRetry(signature, 3);

      if (!transaction) {
        console.log(`❌ Failed to fetch transaction data for ${signature}`);
        return null;
      }
      
      console.log(`✅ Transaction data fetched, extracting token info...`);

      // Extract token information using enhanced parser
      const parsedTokenInfo = await this.transactionParser.extractTokenInfoFromTransaction(transaction, signature);
      
      if (parsedTokenInfo) {
        // Convert to TokenInfo format
        const tokenInfo = this.transactionParser.convertToTokenInfo(parsedTokenInfo, signature, `${dexName}_MONITOR`);
        console.log(`✅ Token info extracted using enhanced parser: ${tokenInfo.mint}`);
        console.log(`📊 Transfer logs found: ${parsedTokenInfo.transfers.length}`);
        return tokenInfo;
      } else {
        console.log(`❌ No token info found in transaction using enhanced parser`);
        return null;
      }

    } catch (error) {
      console.error(`❌ Error processing transaction ${signature}:`, error);
      return null;
    }
  }

  private async extractTokenInfo(transaction: any, signature: string, dexName: string, programId: string): Promise<TokenInfo | null> {
    try {
      const { meta, transaction: txn } = transaction;
      
      if (!meta || !txn) {
        return null;
      }

      // Look for new token mints in the transaction
      const tokenBalances = meta.postTokenBalances || [];
      
      // First, try to find tokens with amounts > 0 (the ideal case)
      let newTokens = tokenBalances.filter((balance: any) => {
        const isValidAmount = balance.uiTokenAmount?.amount !== '0';
        const isNotSol = balance.mint !== '11111111111111111111111111111112';
        const isNotWSol = balance.mint !== 'So11111111111111111111111111111111111111112';
        const isNew = !this.detectedTokens.has(balance.mint);
        const hasValidMint = balance.mint && balance.mint.length >= 32;
        return isValidAmount && isNotSol && isNotWSol && isNew && hasValidMint;
      });
      
      // If no tokens with amounts found, try looking for mint creation events
      if (newTokens.length === 0) {
        const preTokenBalances = meta.preTokenBalances || [];
        const postTokenBalances = meta.postTokenBalances || [];
        
        // Look for newly created token accounts
        const newMints = postTokenBalances.filter((post: any) => {
          const wasNotPresent = !preTokenBalances.some((pre: any) => pre.mint === post.mint);
          const isNotSol = post.mint !== '11111111111111111111111111111112';
          const isNotWSol = post.mint !== 'So11111111111111111111111111111111111111112';
          const isNew = !this.detectedTokens.has(post.mint);
          const hasValidMint = post.mint && post.mint.length >= 32;
          return wasNotPresent && isNotSol && isNotWSol && isNew && hasValidMint;
        });
        
        newTokens = newMints;
      }

      if (newTokens.length === 0) {
        return null;
      }

      const tokenBalance = newTokens[0];
      const mint = tokenBalance.mint;

      // Extract program-specific metadata
      const metadata = this.extractDexSpecificMetadata(txn.message.instructions, dexName, mint);
      
      // Calculate liquidity
      const liquidity = this.calculateTransactionLiquidity(meta, dexName);

      const tokenInfo: TokenInfo = {
        mint,
        symbol: metadata.symbol || this.generateSymbol(mint),
        name: metadata.name || `${dexName} Token ${mint.slice(0, 8)}`,
        decimals: tokenBalance.uiTokenAmount?.decimals || 9,
        supply: tokenBalance.uiTokenAmount?.amount || '0',
        signature,
        timestamp: Date.now(),
        createdAt: Date.now(),
        source: `${dexName}_MONITOR`,
        liquidity: {
          sol: liquidity.sol,
          usd: liquidity.usd,
          poolAddress: metadata.poolAddress
        },
        metadata: {
          dex: dexName,
          programId,
          transactionSignature: signature,
          detectedAt: Date.now(),
          detectionMethod: 'WEBSOCKET_LOGS',
          ...metadata
        }
      };

      return tokenInfo;

    } catch (error) {
      console.error('❌ Error extracting token info:', error);
      return null;
    }
  }

  private extractDexSpecificMetadata(instructions: any[], dexName: string, mint: string): any {
    const metadata: any = {
      symbol: null,
      name: null,
      poolAddress: null,
      dexSpecific: {}
    };

    try {
      for (const instruction of instructions) {
        switch (dexName) {
          case 'ORCA_WHIRLPOOL':
            if (instruction.parsed?.type === 'initializePool') {
              metadata.poolAddress = instruction.parsed?.info?.whirlpool;
              metadata.dexSpecific.tickSpacing = instruction.parsed?.info?.tickSpacing;
            }
            break;
            
          case 'METEORA':
            if (instruction.parsed?.type === 'initialize') {
              metadata.poolAddress = instruction.parsed?.info?.pool;
              metadata.dexSpecific.fee = instruction.parsed?.info?.fee;
            }
            break;
            
          case 'PUMP_FUN':
            if (instruction.parsed?.type === 'create') {
              metadata.symbol = instruction.parsed?.info?.symbol;
              metadata.name = instruction.parsed?.info?.name;
            }
            break;
            
          default:
            // Generic extraction
            if (instruction.parsed?.info) {
              metadata.poolAddress = instruction.parsed.info.pool || 
                                   instruction.parsed.info.ammId ||
                                   instruction.parsed.info.market;
            }
        }
      }
    } catch (error) {
      console.error(`❌ Error extracting ${dexName} metadata:`, error);
    }

    return metadata;
  }

  private calculateTransactionLiquidity(meta: any, dexName: string): { sol: number; usd: number } {
    try {
      const preBalances = meta.preBalances || [];
      const postBalances = meta.postBalances || [];
      
      // Calculate total SOL movement
      const totalSolMovement = postBalances.reduce((sum: number, balance: number, index: number) => {
        const pre = preBalances[index] || 0;
        return sum + Math.abs(balance - pre);
      }, 0);

      const solLiquidity = totalSolMovement / 1e9; // Convert lamports to SOL
      const usdLiquidity = solLiquidity * 150; // Rough conversion

      return {
        sol: Math.max(0, solLiquidity),
        usd: Math.max(0, usdLiquidity)
      };
    } catch (error) {
      console.error('❌ Error calculating transaction liquidity:', error);
      return { sol: 0, usd: 0 };
    }
  }

  private generateSymbol(mint: string): string {
    // Generate a deterministic symbol from mint address
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let symbol = '';
    
    for (let i = 0; i < 4; i++) {
      const charIndex = mint.charCodeAt(i) % chars.length;
      symbol += chars[charIndex];
    }
    
    return symbol;
  }

  private handleTokenDetected(tokenInfo: TokenInfo, source: string): void {
    // Deduplication
    if (this.detectedTokens.has(tokenInfo.mint)) {
      return;
    }

    this.detectedTokens.set(tokenInfo.mint, tokenInfo);
    
    console.log(`🎯 New token detected from ${source}: ${tokenInfo.symbol} (${tokenInfo.mint})`);
    
    // Emit with source information
    this.emit('tokenDetected', {
      ...tokenInfo,
      metadata: {
        ...tokenInfo.metadata,
        detectionSource: source
      }
    });
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      // Stop Raydium monitor
      await this.raydiumMonitor.stopMonitoring();
      
      // Stop all other subscriptions
      for (const [dexName, subscriptionId] of this.subscriptions) {
        await this.connection.removeOnLogsListener(subscriptionId);
        console.log(`⏹️ Stopped monitoring ${dexName}`);
      }
      
      this.subscriptions.clear();
      this.isMonitoring = false;
      
      console.log('⏹️ Multi-DEX monitoring stopped');
      this.emit('monitoringStopped');
    } catch (error) {
      console.error('❌ Error stopping multi-DEX monitoring:', error);
      this.emit('error', error);
    }
  }

  getStatus(): any {
    return {
      isMonitoring: this.isMonitoring,
      subscriptions: Array.from(this.subscriptions.keys()),
      detectedTokensCount: this.detectedTokens.size,
      raydiumMonitorStatus: this.raydiumMonitor.getStatus(),
      monitoredDexes: Object.keys(MultiDexMonitor.DEX_PROGRAMS).length
    };
  }

  // Get recently detected tokens
  getRecentTokens(limit: number = 10): TokenInfo[] {
    const tokens = Array.from(this.detectedTokens.values());
    return tokens
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Clear detected tokens cache
  clearTokenCache(): void {
    this.detectedTokens.clear();
    console.log('🧹 Token cache cleared');
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const slot = await this.connection.getSlot();
      const raydiumHealth = await this.raydiumMonitor.healthCheck();
      
      return slot > 0 && this.isMonitoring && raydiumHealth;
    } catch (error) {
      console.error('❌ Health check failed:', error);
      return false;
    }
  }
}