import { Connection, PublicKey, Logs, AccountInfo, Context } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { ConnectionManager } from '../core/connection';
import { TokenInfo } from '../types';
import axios from 'axios';

export class EnhancedDetector extends EventEmitter {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private isRunning = false;
  private subscriptions: Map<string, number> = new Map();
  private detectedTokens: Map<string, TokenInfo> = new Map();
  
  // Enhanced program monitoring with more DEX programs
  private static readonly ENHANCED_PROGRAMS = {
    // Main DEX programs
    RAYDIUM_AMM_V4: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
    RAYDIUM_AMM_V5: new PublicKey('5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h'),
    ORCA_WHIRLPOOL: new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
    ORCA_V1: new PublicKey('9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'),
    METEORA_DLMM: new PublicKey('Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'),
    METEORA_POOLS: new PublicKey('24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi'),
    PUMP_FUN: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    JUPITER_V6: new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),
    SERUM_V3: new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'),
    OPENBOOK_V2: new PublicKey('opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb'),
    
    // Token creation programs
    SPL_TOKEN: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    SPL_TOKEN_2022: new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'),
    
    // Associated programs
    ASSOCIATED_TOKEN: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    METADATA: new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
  };

  // Enhanced API endpoints with better parameters
  private static readonly ENHANCED_APIS = {
    DEXSCREENER_NEWEST: {
      url: 'https://api.dexscreener.com/latest/dex/pairs/solana',
      params: { sort: 'pairCreatedAt', order: 'desc', limit: 50 }
    },
    DEXSCREENER_TRENDING: {
      url: 'https://api.dexscreener.com/latest/dex/pairs/solana',
      params: { sort: 'volume24h', order: 'desc', limit: 50 }
    },
    BIRDEYE_NEW: {
      url: 'https://public-api.birdeye.so/defi/tokenlist',
      params: { sort_by: 'created_at', sort_type: 'desc', limit: 50 }
    },
    COINGECKO_NEW: {
      url: 'https://api.coingecko.com/api/v3/coins/markets',
      params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 50, page: 1, sparkline: false }
    }
  };

  private static readonly INSTRUCTION_FILTERS = [
    'initialize',
    'initializePool',
    'initialize2',
    'createPool',
    'InitializePool',
    'CreatePool',
    'createAmmConfig',
    'createPersonalPosition',
    'createPosition',
    'openPosition',
    'depositAllToken',
    'mintTo',
    'createAccount',
    'create',
    'launch',
    'deploy'
  ];

  constructor() {
    super();
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    
    // Set conservative rate limiting for enhanced monitoring
    this.connectionManager.setRateLimit(1, 500); // Max 1 concurrent, 500ms delay
    
    console.log('🚀 Enhanced Detector initialized with rate limiting');
  }

  async startEnhancedMonitoring(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Enhanced monitoring already running');
      return;
    }

    try {
      console.log('🚀 Starting enhanced multi-source monitoring...');
      
      // Start all monitoring methods
      await this.startProgramMonitoring();
      await this.startSignatureMonitoring();
      await this.startAPIPolling();
      await this.startAccountMonitoring();
      
      this.isRunning = true;
      console.log('✅ Enhanced monitoring started');
      this.emit('monitoringStarted');
      
    } catch (error) {
      console.error('❌ Error starting enhanced monitoring:', error);
      this.emit('error', error);
    }
  }

  private async startProgramMonitoring(): Promise<void> {
    console.log('📡 Starting enhanced program monitoring...');
    
    for (const [name, programId] of Object.entries(EnhancedDetector.ENHANCED_PROGRAMS)) {
      try {
        // Use 'processed' commitment for fastest detection
        const subscriptionId = this.connection.onLogs(
          programId,
          (logs: Logs) => {
            this.handleEnhancedLogs(logs, name, programId.toString());
          },
          'processed' // Fastest commitment level
        );
        
        this.subscriptions.set(`PROGRAM_${name}`, subscriptionId);
        console.log(`📡 Monitoring ${name}: ${programId.toString()}`);
      } catch (error) {
        console.error(`❌ Error monitoring ${name}:`, error);
      }
    }
  }

  private async startSignatureMonitoring(): Promise<void> {
    console.log('📝 Starting signature monitoring...');
    
    // Monitor signatures for key programs
    const keyPrograms = [
      EnhancedDetector.ENHANCED_PROGRAMS.RAYDIUM_AMM_V4,
      EnhancedDetector.ENHANCED_PROGRAMS.PUMP_FUN,
      EnhancedDetector.ENHANCED_PROGRAMS.ORCA_WHIRLPOOL
    ];

    for (const programId of keyPrograms) {
      setInterval(async () => {
        try {
          const signatures = await this.connection.getSignaturesForAddress(
            programId,
            { limit: 20 }
          );
          
          await this.processRecentSignatures(signatures, programId.toString());
        } catch (error) {
          console.error(`❌ Error fetching signatures for ${programId.toString()}:`, error);
        }
      }, 2000); // Every 2 seconds
    }
  }

  private async startAPIPolling(): Promise<void> {
    console.log('🌐 Starting enhanced API polling...');
    
    // Poll multiple APIs with staggered timing
    let apiIndex = 0;
    const apiKeys = Object.keys(EnhancedDetector.ENHANCED_APIS);
    
    setInterval(async () => {
      const apiName = apiKeys[apiIndex % apiKeys.length];
      apiIndex++;
      
      try {
        await this.pollAPI(apiName);
      } catch (error) {
        console.error(`❌ Error polling ${apiName}:`, error);
      }
    }, 3000); // Every 3 seconds, rotating through APIs
  }

  private async startAccountMonitoring(): Promise<void> {
    console.log('👤 Starting account monitoring...');
    
    // Monitor key accounts that indicate new token activity
    const keyAccounts = [
      '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Raydium fee account
      'GThUX1Atko4tqhN2NaiTazWSeFWMuiUiswPztEUf5g6n', // Another key account
    ];

    for (const accountStr of keyAccounts) {
      try {
        const accountPubkey = new PublicKey(accountStr);
        const subscriptionId = this.connection.onAccountChange(
          accountPubkey,
          (accountInfo: AccountInfo<Buffer>, context: Context) => {
            this.handleAccountChange(accountInfo, context, accountStr);
          },
          'processed'
        );
        
        this.subscriptions.set(`ACCOUNT_${accountStr}`, subscriptionId);
        console.log(`👤 Monitoring account: ${accountStr}`);
      } catch (error) {
        console.error(`❌ Error monitoring account ${accountStr}:`, error);
      }
    }
  }

  private async handleEnhancedLogs(logs: Logs, programName: string, programId: string): Promise<void> {
    try {
      const signature = logs.signature;
      
      // Enhanced filtering for token creation patterns
      const relevantLogs = logs.logs.filter(log => {
        const logLower = log.toLowerCase();
        return EnhancedDetector.INSTRUCTION_FILTERS.some(instruction => 
          logLower.includes(instruction.toLowerCase())
        ) || logLower.includes('mint') || logLower.includes('token');
      });

      if (relevantLogs.length === 0) {
        return;
      }

      console.log(`🔍 Enhanced detection: ${programName} activity - ${signature}`);
      
      // Process immediately for fastest detection
      setImmediate(async () => {
        await this.processTransactionImmediate(signature, programName, programId);
      });

    } catch (error) {
      console.error(`❌ Error processing ${programName} logs:`, error);
    }
  }

  private async processTransactionImmediate(signature: string, source: string, programId: string): Promise<void> {
    try {
      // Use processed commitment for fastest retrieval
      const transaction = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!transaction || !transaction.meta) {
        return;
      }

      // Extract tokens with enhanced detection
      const tokenInfo = await this.extractTokenInfoEnhanced(transaction, signature, source, programId);
      
      if (tokenInfo && !this.detectedTokens.has(tokenInfo.mint)) {
        this.detectedTokens.set(tokenInfo.mint, tokenInfo);
        
        console.log(`🎯 Enhanced token detected: ${tokenInfo.symbol} from ${source}`);
        this.emit('tokenDetected', tokenInfo);
      }

    } catch (error) {
      console.error(`❌ Error processing transaction immediately:`, error);
    }
  }

  private async extractTokenInfoEnhanced(transaction: any, signature: string, source: string, programId: string): Promise<TokenInfo | null> {
    try {
      const { meta, transaction: txn, blockTime } = transaction;
      
      if (!meta || !txn) {
        return null;
      }

      // Enhanced token extraction with multiple methods
      const tokenBalances = meta.postTokenBalances || [];
      const preTokenBalances = meta.preTokenBalances || [];
      
      // Find new tokens (present in post but not in pre, or with increased amounts)
      const newTokens = tokenBalances.filter((postBalance: any) => {
        const preBalance = preTokenBalances.find((pre: any) => pre.mint === postBalance.mint);
        
        return !preBalance || 
               (parseInt(postBalance.uiTokenAmount?.amount || '0') > parseInt(preBalance.uiTokenAmount?.amount || '0'));
      });

      if (newTokens.length === 0) {
        return null;
      }

      const tokenBalance = newTokens[0];
      const mint = tokenBalance.mint;

      // Skip if already detected
      if (this.detectedTokens.has(mint)) {
        return null;
      }

      // Enhanced metadata extraction
      const metadata = this.extractEnhancedMetadata(txn.message.instructions, mint, source);
      
      // Enhanced liquidity calculation
      const liquidity = this.calculateEnhancedLiquidity(meta, source);

      const tokenInfo: TokenInfo = {
        mint,
        symbol: metadata.symbol || this.generateEnhancedSymbol(mint),
        name: metadata.name || `${source} Token ${mint.slice(0, 8)}`,
        decimals: tokenBalance.uiTokenAmount?.decimals || 9,
        supply: tokenBalance.uiTokenAmount?.amount || '0',
        signature,
        timestamp: blockTime ? blockTime * 1000 : Date.now(),
        createdAt: blockTime ? blockTime * 1000 : Date.now(),
        source: `ENHANCED_${source}`,
        liquidity: {
          sol: liquidity.sol,
          usd: liquidity.usd,
          poolAddress: metadata.poolAddress
        },
        metadata: {
          detectionMethod: 'ENHANCED_WEBSOCKET',
          programId,
          source,
          instructions: txn.message.instructions.length,
          enhancedData: metadata,
          detectedAt: Date.now(),
          freshness: Date.now() - (blockTime ? blockTime * 1000 : Date.now())
        }
      };

      return tokenInfo;

    } catch (error) {
      console.error('❌ Error extracting enhanced token info:', error);
      return null;
    }
  }

  private extractEnhancedMetadata(instructions: any[], mint: string, source: string): any {
    const metadata: any = {
      symbol: null,
      name: null,
      poolAddress: null,
      enhancedData: {}
    };

    try {
      for (const instruction of instructions) {
        const parsed = instruction.parsed;
        const program = instruction.program;
        
        if (parsed) {
          // Enhanced instruction parsing based on program
          switch (program) {
            case 'spl-token':
              if (parsed.type === 'mintTo' || parsed.type === 'initializeMint') {
                metadata.enhancedData.tokenProgram = 'SPL';
                metadata.enhancedData.mintInfo = parsed.info;
              }
              break;
              
            case 'spl-token-2022':
              metadata.enhancedData.tokenProgram = 'SPL-2022';
              break;
              
            default:
              // Custom program instruction parsing
              if (parsed.info) {
                Object.assign(metadata.enhancedData, parsed.info);
              }
          }
        }
        
        // Extract data from instruction data
        if (instruction.data && typeof instruction.data === 'string') {
          try {
            const decoded = Buffer.from(instruction.data, 'base64');
            metadata.enhancedData.instructionData = decoded.toString('hex');
          } catch (e) {
            // Ignore decode errors
          }
        }
      }
    } catch (error) {
      console.error('❌ Error extracting enhanced metadata:', error);
    }

    return metadata;
  }

  private calculateEnhancedLiquidity(meta: any, source: string): { sol: number; usd: number } {
    try {
      const preBalances = meta.preBalances || [];
      const postBalances = meta.postBalances || [];
      
      // Calculate total SOL movement with enhanced accuracy
      let totalSolChange = 0;
      
      for (let i = 0; i < Math.max(preBalances.length, postBalances.length); i++) {
        const pre = preBalances[i] || 0;
        const post = postBalances[i] || 0;
        const change = Math.abs(post - pre);
        
        // Weight changes based on account significance
        if (change > 1000000) { // > 0.001 SOL
          totalSolChange += change;
        }
      }

      const solLiquidity = totalSolChange / 1e9;
      
      // Enhanced USD calculation with source-specific multipliers
      const multiplier = this.getSourceMultiplier(source);
      const usdLiquidity = solLiquidity * 150 * multiplier;

      return {
        sol: Math.max(0, solLiquidity),
        usd: Math.max(0, usdLiquidity)
      };
    } catch (error) {
      console.error('❌ Error calculating enhanced liquidity:', error);
      return { sol: 0, usd: 0 };
    }
  }

  private getSourceMultiplier(source: string): number {
    // Different sources may have different liquidity characteristics
    switch (source) {
      case 'RAYDIUM_AMM_V4':
      case 'RAYDIUM_AMM_V5':
        return 1.2; // Raydium tends to have higher liquidity
      case 'PUMP_FUN':
        return 0.8; // Pump.fun may have lower initial liquidity
      case 'ORCA_WHIRLPOOL':
        return 1.1;
      default:
        return 1.0;
    }
  }

  private generateEnhancedSymbol(mint: string): string {
    // Enhanced symbol generation with better randomization
    const segments = [
      mint.slice(0, 4),
      mint.slice(10, 14),
      mint.slice(20, 24),
      mint.slice(30, 34)
    ];
    
    let symbol = '';
    for (const segment of segments.slice(0, 2)) {
      const num = parseInt(segment, 16) || 0;
      const char = String.fromCharCode(65 + (num % 26)); // A-Z
      symbol += char;
    }
    
    return symbol.padEnd(4, 'X');
  }

  private async processRecentSignatures(signatures: any[], programId: string): Promise<void> {
    // Process only the most recent signatures to avoid processing old data
    const recentSignatures = signatures.slice(0, 5);
    
    for (const sig of recentSignatures) {
      if (sig.blockTime && (Date.now() - sig.blockTime * 1000) < 30000) { // Only last 30 seconds
        await this.processTransactionImmediate(sig.signature, 'SIGNATURE_MONITOR', programId);
      }
    }
  }

  private async pollAPI(apiName: string): Promise<void> {
    const apiConfig = (EnhancedDetector.ENHANCED_APIS as any)[apiName];
    if (!apiConfig) return;

    try {
      const response = await axios.get(apiConfig.url, {
        params: apiConfig.params,
        timeout: 5000,
        headers: {
          'User-Agent': 'Enhanced-Token-Detector/1.0'
        }
      });

      const tokens = this.parseAPIResponse(response.data, apiName);
      
      for (const token of tokens.slice(0, 5)) { // Process only newest 5
        if (token && !this.detectedTokens.has(token.mint)) {
          this.detectedTokens.set(token.mint, token);
          console.log(`🌐 API token detected: ${token.symbol} from ${apiName}`);
          this.emit('tokenDetected', token);
        }
      }

    } catch (error) {
      console.error(`❌ Error polling ${apiName}:`, error);
    }
  }

  private parseAPIResponse(data: any, source: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    
    try {
      let pairs = data.pairs || data.tokens || data.data || [];
      
      if (!Array.isArray(pairs)) {
        pairs = [pairs];
      }

      for (const pair of pairs) {
        if (pair.baseToken?.address) {
          const token: TokenInfo = {
            mint: pair.baseToken.address,
            symbol: pair.baseToken.symbol || 'UNK',
            name: pair.baseToken.name || pair.baseToken.symbol || 'Unknown',
            decimals: 9,
            supply: '1000000000000000000',
            signature: `API_${source}_${Date.now()}`,
            timestamp: Date.now(),
            createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).getTime() : Date.now(),
            source: `API_${source}`,
            liquidity: {
              sol: (pair.liquidity?.usd || 0) / 150,
              usd: pair.liquidity?.usd || 0
            },
            metadata: {
              detectionMethod: 'API_POLLING',
              source,
              apiData: pair,
              detectedAt: Date.now()
            }
          };
          
          tokens.push(token);
        }
      }
    } catch (error) {
      console.error(`❌ Error parsing API response from ${source}:`, error);
    }

    return tokens;
  }

  private handleAccountChange(accountInfo: AccountInfo<Buffer>, context: Context, accountAddress: string): void {
    console.log(`👤 Account change detected: ${accountAddress}`);
    
    // This indicates potential new token activity
    this.emit('accountActivity', {
      address: accountAddress,
      accountInfo,
      context,
      timestamp: Date.now()
    });
  }

  async stopEnhancedMonitoring(): Promise<void> {
    if (!this.isRunning) return;

    try {
      console.log('⏹️ Stopping enhanced monitoring...');
      
      // Stop all subscriptions
      for (const [name, subscriptionId] of this.subscriptions) {
        try {
          if (name.startsWith('PROGRAM_') || name.startsWith('ACCOUNT_')) {
            await this.connection.removeOnLogsListener(subscriptionId);
          }
        } catch (error) {
          console.error(`❌ Error stopping subscription ${name}:`, error);
        }
      }
      
      this.subscriptions.clear();
      this.isRunning = false;
      
      console.log('⏹️ Enhanced monitoring stopped');
      this.emit('monitoringStopped');
      
    } catch (error) {
      console.error('❌ Error stopping enhanced monitoring:', error);
    }
  }

  getEnhancedStats(): any {
    return {
      isRunning: this.isRunning,
      activeSubscriptions: this.subscriptions.size,
      detectedTokensCount: this.detectedTokens.size,
      monitoredPrograms: Object.keys(EnhancedDetector.ENHANCED_PROGRAMS).length,
      monitoredAPIs: Object.keys(EnhancedDetector.ENHANCED_APIS).length,
      recentDetections: Array.from(this.detectedTokens.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10)
    };
  }

  // Get tokens detected in the last N minutes
  getRecentTokens(minutes: number = 5): TokenInfo[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    
    return Array.from(this.detectedTokens.values())
      .filter(token => token.timestamp > cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // Clear old tokens to prevent memory issues
  clearOldTokens(hours: number = 1): void {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    
    for (const [mint, token] of this.detectedTokens) {
      if (token.timestamp < cutoff) {
        this.detectedTokens.delete(mint);
      }
    }
  }
}