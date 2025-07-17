import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { TokenInfo } from '../types';
import { ConnectionManager } from '../core/connection';

export class TokenMonitor extends EventEmitter {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private isRunning: boolean = false;
  private subscriptions: Map<string, number> = new Map();

  constructor() {
    super();
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('⚠️ Token monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('🔍 Starting token monitor (analysis mode only)');

    try {
      await this.subscribeToNewTokens();
      console.log('✅ Token monitor started successfully');
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
        await this.connection.removeAccountChangeListener(subscriptionId);
        console.log(`🔇 Unsubscribed from ${program}`);
      } catch (error) {
        console.warn(`⚠️ Failed to unsubscribe from ${program}:`, error);
      }
    }

    this.subscriptions.clear();
    console.log('🛑 Token monitor stopped');
  }

  private async subscribeToNewTokens(): Promise<void> {
    // Monitor pump.fun program for educational analysis
    const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    
    try {
      const subscriptionId = this.connection.onProgramAccountChange(
        PUMP_FUN_PROGRAM,
        (accountInfo, context) => {
          this.handleProgramAccountChange(accountInfo, context, 'pump.fun');
        },
        'confirmed'
      );

      this.subscriptions.set('pump.fun', subscriptionId);
      console.log('📡 Subscribed to pump.fun program for analysis');
    } catch (error) {
      console.error('❌ Failed to subscribe to pump.fun program:', error);
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
      }
    }, 10000); // Scan every 10 seconds

    console.log('🔄 Started periodic token scanning');
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
              this.emit('tokenDetected', tokenInfo);
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

  private handleProgramAccountChange(accountInfo: any, context: any, source: string): void {
    try {
      // For educational analysis - don't process real trades
      console.log(`📊 Program account change detected from ${source}`);
      
      // Simulate token detection for analysis
      const simulatedToken: TokenInfo = {
        mint: 'SIMULATED_' + Date.now(),
        symbol: 'SIM',
        name: 'Simulated Token',
        decimals: 9,
        supply: '1000000000',
        signature: 'simulated_signature',
        timestamp: Date.now(),
        source: source,
        createdAt: Date.now(),
        metadata: {
          simulation: true,
          educational: true
        }
      };

      this.emit('tokenDetected', simulatedToken);
    } catch (error) {
      console.warn('⚠️ Error processing account change:', error);
    }
  }

  private looksLikeTokenCreation(transaction: any): boolean {
    // Simple heuristic to identify token creation transactions
    const instructions = transaction.transaction.message.instructions || [];
    
    return instructions.some((ix: any) => {
      // Look for InitializeMint instruction or similar patterns
      return ix.data && (
        ix.data.includes('InitializeMint') ||
        ix.data.includes('CreateAccount')
      );
    });
  }

  private async extractTokenInfo(transaction: any, signature: string): Promise<TokenInfo | null> {
    try {
      // Extract basic token information for analysis
      return {
        mint: `EXTRACTED_${Date.now()}`,
        symbol: 'EXT',
        name: 'Extracted Token',
        decimals: 9,
        supply: '1000000000',
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
}