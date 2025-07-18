import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { TokenInfo } from '../types';
import { ConnectionManager } from '../core/connection';
import { UnifiedTokenFilter, TokenFilterCriteria } from './unified-token-filter';

export class TokenMonitor extends EventEmitter {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private isRunning: boolean = false;
  private subscriptions: Map<string, number> = new Map();
  private tokenFilter: UnifiedTokenFilter;

  constructor() {
    super();
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    this.tokenFilter = new UnifiedTokenFilter(this.connection);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('⚠️ Token monitor is already running');
      return;
    }

    this.isRunning = true;
    // console.log('🔍 Starting token monitor (analysis mode only)');

    try {
      await this.subscribeToNewTokens();
      // console.log('✅ Token monitor started successfully');
    } catch (error) {
      console.error('❌ Failed to start token monitor:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // Unsubscribe from all subscriptions
    for (const [program, subscriptionId] of this.subscriptions) {
      try {
        await this.connection.removeOnLogsListener(subscriptionId);
        console.log(`🔇 Unsubscribed from ${program}`);
      } catch (error) {
        console.warn(`⚠️ Failed to unsubscribe from ${program}:`, error);
      }
    }

    this.subscriptions.clear();
    console.log('🛑 Token monitor stopped');
  }

  private async subscribeToNewTokens(): Promise<void> {
    // Monitor key DEX programs for real token detection
    const DEX_PROGRAMS = {
      'pump.fun': new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
      'raydium': new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
      'orca': new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
      'meteora': new PublicKey('Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB')
    };
    
    for (const [name, programId] of Object.entries(DEX_PROGRAMS)) {
      try {
        const subscriptionId = this.connection.onLogs(
          programId,
          (logs) => {
            this.handleProgramLogs(logs, name);
          },
          'confirmed'
        );

        this.subscriptions.set(name, subscriptionId);
        console.log(`📡 Subscribed to ${name} program for token detection`);
      } catch (error) {
        console.error(`❌ Failed to subscribe to ${name} program:`, error);
      }
    }

    // Monitor for general token creation patterns
    this.startGeneralTokenScanning();
  }

  private async startGeneralTokenScanning(): Promise<void> {
    // Periodic scanning for educational purposes
    const scanInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(scanInterval);
        return;
      }

      try {
        await this.scanRecentActivity();
      } catch (error) {
        console.warn('⚠️ Error during token scanning:', error);
        // Add reconnection logic
        await this.reconnectIfNeeded();
      }
    }, 5000); // Scan every 5 seconds for better detection

    console.log('🔄 Started periodic token scanning (5s intervals)');
  }
  
  private async reconnectIfNeeded(): Promise<void> {
    try {
      // Test connection
      await this.connection.getSlot();
    } catch (error) {
      console.log('🔄 Connection lost, attempting to reconnect...');
      try {
        this.connection = this.connectionManager.getConnection();
        console.log('✅ Reconnected to Solana RPC');
      } catch (reconnectError) {
        console.error('❌ Failed to reconnect:', reconnectError);
      }
    }
  }

  private async scanRecentActivity(): Promise<void> {
    try {
      // Get recent signatures and analyze for token creation patterns
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // SPL Token Program
        { limit: 20 }
      );

      for (const sig of signatures.slice(0, 5)) { // Analyze only recent 5
        try {
          const tx = await this.connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });

          if (tx && this.looksLikeTokenCreation(tx)) {
            const tokenInfo = await this.extractTokenInfo(tx, sig.signature);
            if (tokenInfo) {
              // Apply unified token filtering with aggressive criteria
              const filterResult = await this.tokenFilter.filterToken(tokenInfo, UnifiedTokenFilter.AGGRESSIVE_CRITERIA);
              
              if (filterResult.passed) {
                console.log(`✅ Scanned token passed filter: ${tokenInfo.symbol}`);
                this.emit('tokenDetected', tokenInfo);
              }
            }
          }
        } catch (error) {
          // Skip individual transaction errors
        }
      }
    } catch (error) {
      console.warn('⚠️ Error during activity scan:', error);
    }
  }

  private async handleProgramLogs(logs: any, source: string): Promise<void> {
    try {
      // Look for token creation patterns in logs
      const tokenCreationPatterns = [
        'initialize',
        'createPool',
        'InitializePool',
        'createAccount',
        'mint',
        'create'
      ];

      const hasTokenCreation = logs.logs.some((log: string) => 
        tokenCreationPatterns.some(pattern => 
          log.toLowerCase().includes(pattern.toLowerCase())
        )
      );

      if (hasTokenCreation) {
        console.log(`🔍 Potential token creation detected from ${source}: ${logs.signature}`);
        
        // Process the transaction to extract real token info
        try {
          const tokenInfo = await this.processTokenCreationTransaction(logs.signature, source);
          
          if (tokenInfo) {
            // Apply unified token filtering with aggressive criteria
            const filterResult = await this.tokenFilter.filterToken(tokenInfo, UnifiedTokenFilter.AGGRESSIVE_CRITERIA);
            
            if (filterResult.passed) {
              console.log(`✅ Token passed filter with score ${filterResult.score}: ${tokenInfo.symbol}`);
              this.emit('tokenDetected', tokenInfo);
            } else {
              console.log(`❌ Token failed filter: ${tokenInfo.symbol} - ${filterResult.reasons.join(', ')}`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Error processing token creation from ${source}:`, error);
          // Continue processing other transactions
        }
      }
    } catch (error) {
      console.warn('⚠️ Error processing program logs:', error);
    }
  }

  private looksLikeTokenCreation(transaction: any): boolean {
    const instructions = transaction.transaction.message.instructions || [];
    
    return instructions.some((ix: any) => {
      // Check for SPL token program instructions
      const programId = ix.programId || ix.programIdIndex;
      
      // Look for token creation patterns
      if (ix.parsed) {
        const type = ix.parsed.type;
        return type === 'initializeMint' || 
               type === 'createAccount' || 
               type === 'initializeAccount' ||
               type === 'initialize';
      }
      
      return false;
    });
  }

  private async extractTokenInfo(transaction: any, signature: string): Promise<TokenInfo | null> {
    try {
      const { meta } = transaction;
      
      if (!meta || !meta.postTokenBalances) {
        return null;
      }

      // Find new token mints
      const newTokens = meta.postTokenBalances.filter((balance: any) => {
        const isValidMint = balance.mint && balance.mint.length >= 32;
        const isNotSol = balance.mint !== '11111111111111111111111111111112';
        const isNotWSol = balance.mint !== 'So11111111111111111111111111111111111111112';
        return isValidMint && isNotSol && isNotWSol;
      });

      if (newTokens.length === 0) {
        return null;
      }

      const tokenBalance = newTokens[0];
      const mint = tokenBalance.mint;

      return {
        mint: mint,
        symbol: this.generateSymbol(mint),
        name: `New Token ${mint.slice(0, 8)}`,
        decimals: tokenBalance.uiTokenAmount?.decimals || 9,
        supply: tokenBalance.uiTokenAmount?.amount || '0',
        signature: signature,
        timestamp: Date.now(),
        source: 'scanner',
        createdAt: Date.now(),
        metadata: {
          extracted: true,
          educational: true
        }
      };
    } catch (error) {
      console.warn('⚠️ Error extracting token info:', error);
      return null;
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

  private async processTokenCreationTransaction(signature: string, source: string): Promise<TokenInfo | null> {
    try {
      const transaction = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!transaction) {
        return null;
      }

      return this.extractTokenInfo(transaction, signature);
    } catch (error) {
      console.warn('⚠️ Error processing token creation transaction:', error);
      return null;
    }
  }
}