import { Connection, PublicKey, TransactionSignature, Logs, GetTransactionConfig } from '@solana/web3.js';
import { TokenInfo } from '../types';
import { UnifiedTokenInfo } from '../types/unified';
import { logger } from '../monitoring/logger';
import { TransactionParser, ParsedTokenInfo } from '../utils/transaction-parser';
import { EnhancedTokenExtractor } from '../extraction/enhanced-token-extractor';
import { SolscanApiClient, SolscanTransactionDetail } from '../services/solscan-api';
import { DexScreenerClient } from '../detection/dexscreener-client';
import { ConnectionManager } from './connection';
import { EventEmitter } from 'events';

export interface BlockchainAnalysisConfig {
  enableSolscanIntegration: boolean;
  enableDexScreenerEnhancement: boolean;
  enableRealTimeMonitoring: boolean;
  enableMultiSourceValidation: boolean;
  maxConcurrentAnalysis: number;
  analysisTimeout: number;
  retryAttempts: number;
  minLiquidityThreshold: number;
  maxTokenAge: number;
}

export interface AnalysisResult {
  tokens: UnifiedTokenInfo[];
  confidence: number;
  sources: string[];
  analysisTime: number;
  metadata: {
    transactionSignature: string;
    blockTime?: number;
    programsInvolved: string[];
    solMovement: number;
    tokenChanges: number;
    liquidityEstimate: number;
    validationResults: ValidationResult[];
  };
}

export interface ValidationResult {
  source: string;
  success: boolean;
  confidence: number;
  data?: any;
  error?: string;
}

export class BlockchainTransactionAnalyzer extends EventEmitter {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private transactionParser: TransactionParser;
  private tokenExtractor: EnhancedTokenExtractor;
  private solscanClient: SolscanApiClient;
  private dexScreenerClient: DexScreenerClient;
  private config: BlockchainAnalysisConfig;
  
  private readonly DEX_PROGRAMS = new Map([
    ['675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', 'Raydium AMM V4'],
    ['58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2', 'Raydium AMM V3'],
    ['whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', 'Orca Whirlpool'],
    ['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', 'Pump.fun'],
    ['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', 'Jupiter V6'],
    ['9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', 'Serum V3'],
    ['Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', 'Meteora'],
    ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'SPL Token Program']
  ]);

  constructor(config: Partial<BlockchainAnalysisConfig> = {}) {
    super();
    
    this.config = {
      enableSolscanIntegration: true,
      enableDexScreenerEnhancement: true,
      enableRealTimeMonitoring: true,
      enableMultiSourceValidation: true,
      maxConcurrentAnalysis: 10,
      analysisTimeout: 30000,
      retryAttempts: 3,
      minLiquidityThreshold: 1000,
      maxTokenAge: 3600000, // 1 hour
      ...config
    };

    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    this.transactionParser = new TransactionParser(this.connection);
    this.tokenExtractor = new EnhancedTokenExtractor();
    this.solscanClient = new SolscanApiClient();
    this.dexScreenerClient = new DexScreenerClient();

    logger.info('🔬 Blockchain Transaction Analyzer initialized', {
      config: this.config,
      availableSources: this.getAvailableSources()
    });
  }

  /**
   * Main analysis method - processes blockchain transactions for new tokens
   */
  async analyzeTransaction(signature: string): Promise<AnalysisResult> {
    const startTime = Date.now();
    logger.info(`🔍 Starting comprehensive transaction analysis: ${signature.slice(0, 8)}...`);

    try {
      // Run multiple analysis methods in parallel
      const validationResults = await this.runMultiSourceValidation(signature);
      
      // Consolidate results from all sources
      const consolidatedTokens = this.consolidateTokenResults(validationResults);
      
      // Enhance with market data
      const enhancedTokens = await this.enhanceTokensWithMarketData(consolidatedTokens);
      
      // Calculate overall confidence
      const confidence = this.calculateOverallConfidence(validationResults);
      
      // Extract metadata
      const metadata = this.extractAnalysisMetadata(validationResults, signature);
      
      const result: AnalysisResult = {
        tokens: enhancedTokens,
        confidence,
        sources: validationResults.map(r => r.source),
        analysisTime: Date.now() - startTime,
        metadata
      };

      logger.info(`✅ Analysis complete: ${enhancedTokens.length} tokens found`, {
        confidence,
        sources: result.sources,
        analysisTime: result.analysisTime
      });

      this.emit('analysisComplete', result);
      return result;

    } catch (error) {
      logger.error('❌ Transaction analysis failed:', error);
      const errorResult: AnalysisResult = {
        tokens: [],
        confidence: 0,
        sources: [],
        analysisTime: Date.now() - startTime,
        metadata: {
          transactionSignature: signature,
          programsInvolved: [],
          solMovement: 0,
          tokenChanges: 0,
          liquidityEstimate: 0,
          validationResults: []
        }
      };
      
      this.emit('analysisError', { signature, error });
      return errorResult;
    }
  }

  /**
   * Run validation across multiple sources
   */
  private async runMultiSourceValidation(signature: string): Promise<ValidationResult[]> {
    const validationPromises: Promise<ValidationResult>[] = [];

    // 1. Direct RPC Transaction Analysis
    validationPromises.push(this.validateWithRpcParser(signature));

    // 2. Enhanced Token Extractor
    validationPromises.push(this.validateWithEnhancedExtractor(signature));

    // 3. Solscan API Integration
    if (this.config.enableSolscanIntegration) {
      validationPromises.push(this.validateWithSolscan(signature));
    }

    // 4. DexScreener Cross-Reference
    if (this.config.enableDexScreenerEnhancement) {
      validationPromises.push(this.validateWithDexScreener(signature));
    }

    // Execute all validations with timeout
    const results = await Promise.allSettled(
      validationPromises.map(promise => 
        Promise.race([
          promise,
          new Promise<ValidationResult>((_, reject) => 
            setTimeout(() => reject(new Error('Validation timeout')), this.config.analysisTimeout)
          )
        ])
      )
    );

    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<ValidationResult>).value);
  }

  /**
   * Validate using direct RPC transaction parser
   */
  private async validateWithRpcParser(signature: string): Promise<ValidationResult> {
    try {
      const transaction = await this.connectionManager.getParsedTransactionWithRetry(signature, 2);
      
      if (!transaction) {
        return {
          source: 'rpc_parser',
          success: false,
          confidence: 0,
          error: 'Transaction not found'
        };
      }

      const parsedInfo = await this.transactionParser.extractTokenInfoFromTransaction(transaction, signature);
      
      return {
        source: 'rpc_parser',
        success: !!parsedInfo,
        confidence: parsedInfo ? 75 : 0,
        data: parsedInfo
      };
    } catch (error) {
      return {
        source: 'rpc_parser',
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate using enhanced token extractor
   */
  private async validateWithEnhancedExtractor(signature: string): Promise<ValidationResult> {
    try {
      const tokens = await this.tokenExtractor.extractTokensFromTransaction(signature);
      
      return {
        source: 'enhanced_extractor',
        success: tokens.length > 0,
        confidence: tokens.length > 0 ? 80 : 0,
        data: tokens
      };
    } catch (error) {
      return {
        source: 'enhanced_extractor',
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate using Solscan API
   */
  private async validateWithSolscan(signature: string): Promise<ValidationResult> {
    try {
      const transactionDetail = await this.solscanClient.getTransactionDetail(signature);
      
      if (!transactionDetail) {
        return {
          source: 'solscan',
          success: false,
          confidence: 0,
          error: 'Transaction not found in Solscan'
        };
      }

      const extractedInfo = this.solscanClient.extractTokenInformation(transactionDetail);
      const isTokenCreation = this.solscanClient.isTokenCreationTransaction(transactionDetail);
      
      return {
        source: 'solscan',
        success: extractedInfo.newTokens.length > 0,
        confidence: isTokenCreation ? 90 : 60,
        data: extractedInfo
      };
    } catch (error) {
      return {
        source: 'solscan',
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate using DexScreener cross-reference
   */
  private async validateWithDexScreener(signature: string): Promise<ValidationResult> {
    try {
      // For DexScreener, we need to extract tokens first then validate them
      const tokens = await this.tokenExtractor.extractTokensFromTransaction(signature);
      
      if (tokens.length === 0) {
        return {
          source: 'dexscreener',
          success: false,
          confidence: 0,
          error: 'No tokens to validate'
        };
      }

      const validatedTokens = [];
      for (const token of tokens) {
        const tokenAddress = token.mint || token.address;
        if (tokenAddress) {
          const marketData = await this.dexScreenerClient.getTokenByAddress(tokenAddress);
          if (marketData) {
            validatedTokens.push({ token, marketData });
          }
        }
      }

      return {
        source: 'dexscreener',
        success: validatedTokens.length > 0,
        confidence: validatedTokens.length > 0 ? 85 : 30,
        data: validatedTokens
      };
    } catch (error) {
      return {
        source: 'dexscreener',
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Consolidate results from multiple validation sources
   */
  private consolidateTokenResults(validationResults: ValidationResult[]): UnifiedTokenInfo[] {
    const tokenMap = new Map<string, UnifiedTokenInfo>();

    for (const result of validationResults) {
      if (!result.success || !result.data) continue;

      // Handle different data formats from different sources
      const tokens = this.extractTokensFromValidationResult(result);
      
      for (const token of tokens) {
        const existing = tokenMap.get(token.address);
        
        if (!existing) {
          tokenMap.set(token.address, token);
        } else {
          // Merge data from multiple sources
          this.mergeTokenData(existing, token, result.source);
        }
      }
    }

    return Array.from(tokenMap.values());
  }

  /**
   * Extract tokens from validation result based on source
   */
  private extractTokensFromValidationResult(result: ValidationResult): UnifiedTokenInfo[] {
    const tokens: UnifiedTokenInfo[] = [];

    switch (result.source) {
      case 'rpc_parser':
        if (result.data) {
          tokens.push(this.convertParsedTokenToUnified(result.data));
        }
        break;

      case 'enhanced_extractor':
        if (Array.isArray(result.data)) {
          tokens.push(...result.data.map((t: TokenInfo) => this.convertTokenInfoToUnified(t)));
        }
        break;

      case 'solscan':
        if (result.data?.newTokens) {
          tokens.push(...result.data.newTokens.map((t: any) => this.convertSolscanTokenToUnified(t)));
        }
        break;

      case 'dexscreener':
        if (Array.isArray(result.data)) {
          tokens.push(...result.data.map(item => this.convertDexScreenerTokenToUnified(item)));
        }
        break;
    }

    return tokens;
  }

  /**
   * Convert different token formats to unified format
   */
  private convertParsedTokenToUnified(parsed: ParsedTokenInfo): UnifiedTokenInfo {
    return {
      address: parsed.mint,
      mint: parsed.mint,
      name: parsed.name || 'Unknown Token',
      symbol: parsed.symbol || 'UNKNOWN',
      decimals: parsed.decimals,
      chainId: 'solana',
      detected: true,
      detectedAt: Date.now(),
      timestamp: Date.now(),
      source: 'rpc_parser',
      liquidity: {
        usd: parsed.liquidity?.usd || 0,
        sol: parsed.liquidity?.sol,
        poolAddress: parsed.liquidity?.poolAddress
      },
      metadata: {
        ...parsed.metadata,
        detectionMethod: 'rpc_parser'
      }
    };
  }

  private convertTokenInfoToUnified(token: TokenInfo): UnifiedTokenInfo {
    return {
      address: token.mint || token.address,
      mint: token.mint,
      name: token.name || 'Unknown Token',
      symbol: token.symbol || 'UNKNOWN',
      decimals: token.decimals,
      chainId: 'solana',
      detected: true,
      detectedAt: Date.now(),
      timestamp: Date.now(),
      source: 'enhanced_extractor',
      liquidity: {
        usd: token.liquidity?.usd || 0,
        sol: token.liquidity?.sol,
        poolAddress: token.liquidity?.poolAddress
      },
      metadata: {
        ...token.metadata,
        detectionMethod: 'enhanced_extractor'
      }
    };
  }

  private convertSolscanTokenToUnified(solscanToken: any): UnifiedTokenInfo {
    return {
      address: solscanToken.token_address,
      mint: solscanToken.token_address,
      name: solscanToken.token_name || 'Unknown Token',
      symbol: solscanToken.token_symbol || 'UNKNOWN',
      decimals: solscanToken.token_decimals || 9,
      chainId: 'solana',
      detected: true,
      detectedAt: Date.now(),
      timestamp: Date.now(),
      source: 'solscan',
      liquidity: {
        usd: 0,
        sol: undefined,
        poolAddress: undefined
      },
      metadata: {
        balanceChange: solscanToken.balance_change,
        preBalance: solscanToken.pre_balance,
        postBalance: solscanToken.post_balance,
        detectionMethod: 'solscan'
      }
    };
  }

  private convertDexScreenerTokenToUnified(item: any): UnifiedTokenInfo {
    const { token, marketData } = item;
    return {
      address: token.mint,
      mint: token.mint,
      name: marketData.name || token.name || 'Unknown Token',
      symbol: marketData.symbol || token.symbol || 'UNKNOWN',
      decimals: token.decimals,
      chainId: 'solana',
      detected: true,
      detectedAt: Date.now(),
      timestamp: Date.now(),
      source: 'dexscreener',
      liquidity: {
        usd: marketData.liquidityUsd || 0,
        sol: marketData.liquiditySol,
        poolAddress: marketData.pairAddress
      },
      metadata: {
        priceUsd: marketData.priceUsd,
        volume24h: marketData.volume24h,
        priceChange24h: marketData.priceChange24h,
        marketCap: marketData.marketCap,
        detectionMethod: 'dexscreener'
      }
    };
  }

  /**
   * Merge token data from multiple sources
   */
  private mergeTokenData(existing: UnifiedTokenInfo, newToken: UnifiedTokenInfo, source: string): void {
    // Merge metadata
    existing.metadata = {
      ...existing.metadata,
      ...newToken.metadata,
      sources: [...(existing.metadata?.sources || []), source]
    };

    // Update liquidity if new source has better data
    if (newToken.liquidity && existing.liquidity) {
      const newLiquidityUsd = newToken.liquidity.usd || 0;
      const existingLiquidityUsd = existing.liquidity.usd || 0;
      if (newLiquidityUsd > existingLiquidityUsd) {
        existing.liquidity = newToken.liquidity;
      }
    } else if (newToken.liquidity && !existing.liquidity) {
      existing.liquidity = newToken.liquidity;
    }

    // Update name/symbol if new source has better data
    if (newToken.name !== 'Unknown Token' && existing.name === 'Unknown Token') {
      existing.name = newToken.name;
    }
    if (newToken.symbol !== 'UNKNOWN' && existing.symbol === 'UNKNOWN') {
      existing.symbol = newToken.symbol;
    }
  }

  /**
   * Enhance tokens with additional market data
   */
  private async enhanceTokensWithMarketData(tokens: UnifiedTokenInfo[]): Promise<UnifiedTokenInfo[]> {
    const enhancedTokens: UnifiedTokenInfo[] = [];

    for (const token of tokens) {
      try {
        // Get latest market data from DexScreener
        const marketData = await this.dexScreenerClient.getTokenByAddress(token.address);
        
        if (marketData) {
          token.metadata = {
            ...token.metadata,
            currentPrice: marketData.priceUsd,
            currentVolume: marketData.volume24h,
            currentMarketCap: marketData.marketCap,
            currentLiquidity: marketData.liquidityUsd,
            dexId: marketData.dexId,
            pairAddress: marketData.pairAddress,
            enhanced: true,
            enhancedAt: Date.now()
          };
          
          // Update liquidity with latest data
          if (marketData.liquidityUsd && token.liquidity) {
            const currentLiquidityUsd = token.liquidity.usd || 0;
            if (marketData.liquidityUsd > currentLiquidityUsd) {
              token.liquidity = {
                usd: marketData.liquidityUsd,
                sol: marketData.liquidity,
                poolAddress: marketData.pairAddress
              };
            }
          } else if (marketData.liquidityUsd && !token.liquidity) {
            token.liquidity = {
              usd: marketData.liquidityUsd,
              sol: marketData.liquidity,
              poolAddress: marketData.pairAddress
            };
          }
        }

        enhancedTokens.push(token);
      } catch (error) {
        // Continue with original token if enhancement fails
        enhancedTokens.push(token);
      }
    }

    return enhancedTokens;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(validationResults: ValidationResult[]): number {
    const successfulResults = validationResults.filter(r => r.success);
    
    if (successfulResults.length === 0) return 0;
    
    const totalConfidence = successfulResults.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = totalConfidence / successfulResults.length;
    
    // Boost confidence if multiple sources agree
    const sourceBonus = Math.min(successfulResults.length * 5, 20);
    
    return Math.min(averageConfidence + sourceBonus, 100);
  }

  /**
   * Extract analysis metadata
   */
  private extractAnalysisMetadata(validationResults: ValidationResult[], signature: string): AnalysisResult['metadata'] {
    const programsInvolved = new Set<string>();
    let solMovement = 0;
    let tokenChanges = 0;
    let liquidityEstimate = 0;

    for (const result of validationResults) {
      if (result.success && result.data) {
        // Extract programs from different sources
        if (result.source === 'solscan' && result.data.programsInvolved) {
          result.data.programsInvolved.forEach((p: string) => programsInvolved.add(p));
          solMovement = Math.max(solMovement, result.data.liquidityInfo?.totalSolMovement || 0);
          tokenChanges = Math.max(tokenChanges, result.data.newTokens?.length || 0);
          liquidityEstimate = Math.max(liquidityEstimate, result.data.liquidityInfo?.estimatedLiquidityUsd || 0);
        }
      }
    }

    return {
      transactionSignature: signature,
      programsInvolved: Array.from(programsInvolved),
      solMovement,
      tokenChanges,
      liquidityEstimate,
      validationResults
    };
  }

  /**
   * Get available analysis sources
   */
  private getAvailableSources(): string[] {
    const sources = ['rpc_parser', 'enhanced_extractor'];
    
    if (this.config.enableSolscanIntegration) {
      sources.push('solscan');
    }
    
    if (this.config.enableDexScreenerEnhancement) {
      sources.push('dexscreener');
    }
    
    return sources;
  }

  /**
   * Start real-time monitoring of blockchain transactions
   */
  async startRealTimeMonitoring(): Promise<void> {
    if (!this.config.enableRealTimeMonitoring) {
      logger.warn('Real-time monitoring disabled in configuration');
      return;
    }

    logger.info('🔄 Starting real-time blockchain monitoring...');

    // Monitor all major DEX programs
    for (const [programId, dexName] of this.DEX_PROGRAMS) {
      try {
        const subscription = this.connection.onLogs(
          new PublicKey(programId),
          async (logs: Logs) => {
            await this.handleRealTimeLog(logs, dexName);
          },
          'confirmed'
        );

        logger.info(`📡 Monitoring ${dexName} (${programId.slice(0, 8)}...)`);
        this.emit('subscriptionStarted', { programId, dexName, subscription });
      } catch (error) {
        logger.error(`❌ Failed to subscribe to ${dexName}:`, error);
      }
    }
  }

  /**
   * Handle real-time log events
   */
  private async handleRealTimeLog(logs: Logs, dexName: string): Promise<void> {
    try {
      // Filter for potential token creation/launch patterns
      const hasTokenCreation = logs.logs.some(log => 
        log.toLowerCase().includes('initialize') ||
        log.toLowerCase().includes('create') ||
        log.toLowerCase().includes('mint') ||
        log.toLowerCase().includes('pool')
      );

      if (hasTokenCreation) {
        logger.info(`🔍 Potential token creation detected in ${dexName}: ${logs.signature.slice(0, 8)}...`);
        
        // Analyze the transaction
        const analysis = await this.analyzeTransaction(logs.signature);
        
        if (analysis.tokens.length > 0) {
          this.emit('tokensDetected', {
            tokens: analysis.tokens,
            source: `realtime_${dexName.toLowerCase()}`,
            analysis
          });
        }
      }
    } catch (error) {
      logger.error(`Error processing real-time log from ${dexName}:`, error);
    }
  }

  /**
   * Get analyzer statistics
   */
  getStats(): any {
    return {
      config: this.config,
      availableSources: this.getAvailableSources(),
      solscanStats: this.solscanClient.getUsageStats(),
      connectionStats: this.connectionManager.getQueueStatus()
    };
  }
}