import { EventEmitter } from 'events';
import { Connection, PublicKey, Logs } from '@solana/web3.js';
import { logger } from '../monitoring/logger';
import { TokenInfo } from '../types';
import { UnifiedTokenInfo, DetectionConfig, DetectionResult } from '../types/unified';
import { ConnectionManager } from '../core/connection';
import { getApiGateway } from '../core/api-gateway';
import { BlockchainTransactionAnalyzer } from '../core/blockchain-transaction-analyzer';
import { DexScreenerClient } from './dexscreener-client';
import { UnifiedTokenFilter } from './unified-token-filter';
import { SolscanApiClient } from '../services/solscan-api';

export interface EnhancedDetectionConfig extends DetectionConfig {
  enableBlockchainAnalysis: boolean;
  enableMultiSourceValidation: boolean;
  enableRealTimeStreaming: boolean;
  enableSmartFiltering: boolean;
  enableMarketDataEnrichment: boolean;
  enableSocialSentiment: boolean;
  detectionSources: {
    websocket: boolean;
    dexscreener: boolean;
    solscan: boolean;
    blockchain: boolean;
    social: boolean;
  };
  prioritySettings: {
    pumpTokens: number;
    newTokens: number;
    highVolume: number;
    lowAge: number;
    highLiquidity: number;
  };
}

export interface TokenDetectionResult {
  token: UnifiedTokenInfo;
  confidence: number;
  sources: string[];
  detectionTime: number;
  metadata: {
    priority: number;
    signals: string[];
    riskScore: number;
    opportunityScore: number;
    socialScore?: number;
    technicalScore: number;
    marketScore: number;
  };
}

export interface DetectionStats {
  totalDetected: number;
  totalProcessed: number;
  totalFiltered: number;
  successRate: number;
  averageConfidence: number;
  averageDetectionTime: number;
  sourceBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
}

export class EnhancedTokenDetection extends EventEmitter {
  private config: EnhancedDetectionConfig;
  private connectionManager: ConnectionManager;
  private connection: Connection;
  private apiGateway = getApiGateway();
  private blockchainAnalyzer: BlockchainTransactionAnalyzer;
  private dexScreenerClient: DexScreenerClient;
  private solscanClient: SolscanApiClient;
  private tokenFilter: UnifiedTokenFilter;
  
  private isRunning = false;
  private subscriptions = new Map<string, number>();
  private detectionQueue: Array<{
    signature: string;
    source: string;
    priority: number;
    timestamp: number;
  }> = [];
  private processedSignatures = new Set<string>();
  private detectionStats: DetectionStats = {
    totalDetected: 0,
    totalProcessed: 0,
    totalFiltered: 0,
    successRate: 0,
    averageConfidence: 0,
    averageDetectionTime: 0,
    sourceBreakdown: {},
    priorityBreakdown: {}
  };

  // Multi-source detection strategies
  private detectionStrategies = new Map<string, DetectionStrategy>();
  
  // Smart caching for recently detected tokens
  private tokenCache = new Map<string, TokenDetectionResult>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(config: Partial<EnhancedDetectionConfig> = {}) {
    super();
    
    this.config = {
      sources: {
        blockchain: {
          rpcEndpoints: ['https://api.mainnet-beta.solana.com'],
          blockAnalysisDepth: 3,
          mempoolScanning: true
        },
        dexScreener: { enabled: true, websocket: true },
        jupiter: { enabled: true, polling: false },
        raydium: { directPoolMonitoring: true }
      },
      maxLatency: 50,
      parallelProcessing: true,
      enableRaydium: true,
      enablePumpFun: true,
      enableDexScreener: true,
      enableMultiDex: true,
      enableRealTime: true,
      enableBlockchainAnalysis: true,
      enableMultiSourceValidation: true,
      enableRealTimeStreaming: true,
      enableSmartFiltering: true,
      enableMarketDataEnrichment: true,
      enableSocialSentiment: false, // Disabled by default
      minLiquidity: 1000,
      maxAge: 3600000,
      minConfidence: 60,
      filterHoneypots: true,
      filterRugs: true,
      enabledSources: ['websocket', 'dexscreener', 'blockchain', 'solscan'],
      scanInterval: 30000,
      batchSize: 5,
      maxConcurrentRequests: 2,
      rateLimitDelay: 3000,
      cacheTimeout: 120000,
      detectionSources: {
        websocket: true,
        dexscreener: true,
        solscan: false,
        blockchain: true,
        social: false
      },
      prioritySettings: {
        pumpTokens: 10,
        newTokens: 8,
        highVolume: 7,
        lowAge: 6,
        highLiquidity: 5
      },
      ...config
    };

    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    this.blockchainAnalyzer = new BlockchainTransactionAnalyzer();
    this.dexScreenerClient = new DexScreenerClient();
    this.solscanClient = new SolscanApiClient();
    this.tokenFilter = new UnifiedTokenFilter(this.connection);

    this.initializeDetectionStrategies();
    this.setupEventListeners();
    this.startDetectionQueue();

    logger.info('🔍 Enhanced Token Detection System initialized', {
      config: this.config,
      strategies: this.detectionStrategies.size
    });
  }

  /**
   * Initialize detection strategies
   */
  private initializeDetectionStrategies(): void {
    // WebSocket real-time detection
    if (this.config.detectionSources.websocket) {
      this.detectionStrategies.set('websocket', new WebSocketDetectionStrategy(this.config));
    }

    // DexScreener trending detection
    if (this.config.detectionSources.dexscreener) {
      this.detectionStrategies.set('dexscreener', new DexScreenerDetectionStrategy(this.config, this.dexScreenerClient));
    }

    // Blockchain transaction analysis
    if (this.config.detectionSources.blockchain) {
      this.detectionStrategies.set('blockchain', new BlockchainDetectionStrategy(this.config, this.blockchainAnalyzer));
    }

    // Solscan API detection
    if (this.config.detectionSources.solscan) {
      this.detectionStrategies.set('solscan', new SolscanDetectionStrategy(this.config, this.solscanClient));
    }

    // Social sentiment detection (optional)
    if (this.config.detectionSources.social && this.config.enableSocialSentiment) {
      this.detectionStrategies.set('social', new SocialDetectionStrategy(this.config));
    }
  }

  /**
   * Setup event listeners for detection strategies
   */
  private setupEventListeners(): void {
    // Listen to blockchain analyzer events
    this.blockchainAnalyzer.on('analysisComplete', (result) => {
      this.handleAnalysisResult(result, 'blockchain');
    });

    // Listen to detection strategy events
    for (const [name, strategy] of this.detectionStrategies) {
      strategy.on('tokenDetected', (tokens: UnifiedTokenInfo[]) => {
        this.handleTokenDetection(tokens, name);
      });

      strategy.on('error', (error) => {
        logger.error(`Detection strategy error (${name}):`, error);
      });
    }
  }

  /**
   * Start the enhanced detection system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Enhanced detection system already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting enhanced token detection system');

    try {
      // Start all detection strategies
      for (const [name, strategy] of this.detectionStrategies) {
        await strategy.start();
        logger.info(`✅ Started ${name} detection strategy`);
      }

      // Start blockchain analyzer real-time monitoring
      if (this.config.enableRealTimeStreaming) {
        await this.blockchainAnalyzer.startRealTimeMonitoring();
      }

      // Start periodic cleanup
      this.startCleanupTasks();

      this.emit('started');
      logger.info('🎯 Enhanced token detection system started successfully');

    } catch (error) {
      logger.error('❌ Failed to start enhanced detection system:', error);
      this.isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the detection system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('🛑 Stopping enhanced token detection system');

    // Stop all detection strategies
    for (const [name, strategy] of this.detectionStrategies) {
      try {
        await strategy.stop();
        logger.info(`⏹️ Stopped ${name} strategy`);
      } catch (error) {
        logger.warn(`Failed to stop ${name} strategy:`, error);
      }
    }

    // Clean up subscriptions
    for (const [name, subscriptionId] of this.subscriptions) {
      try {
        await this.connection.removeOnLogsListener(subscriptionId);
        logger.info(`🔌 Removed ${name} subscription`);
      } catch (error) {
        logger.warn(`Failed to remove ${name} subscription:`, error);
      }
    }

    this.subscriptions.clear();
    this.emit('stopped');
    logger.info('🛑 Enhanced token detection system stopped');
  }

  /**
   * Handle token detection from strategies
   */
  private async handleTokenDetection(tokens: UnifiedTokenInfo[], source: string): Promise<void> {
    logger.info(`📡 Processing ${tokens.length} tokens from ${source}`);

    for (const token of tokens) {
      try {
        // Check if token already processed recently
        if (this.isRecentlyProcessed(token.address)) {
          continue;
        }

        // Apply smart filtering
        const filterResult = await this.tokenFilter.filterToken(token);
        if (!filterResult.passed) {
          this.detectionStats.totalFiltered++;
          continue;
        }

        // Enrich with additional data
        const enrichedToken = await this.enrichTokenData(token, source);
        
        // Calculate detection result
        const detectionResult = await this.calculateDetectionResult(enrichedToken, source);
        
        // Cache the result
        this.tokenCache.set(token.address, detectionResult);
        
        // Update statistics
        this.updateDetectionStats(detectionResult, source);
        
        // Emit the detection
        this.emit('tokenDetected', detectionResult);
        
        logger.info(`✅ Detected token: ${token.symbol} (${token.address.slice(0, 8)}...) - Confidence: ${detectionResult.confidence}%`);

      } catch (error) {
        logger.error(`Error processing token ${token.symbol}:`, error);
      }
    }
  }

  /**
   * Handle analysis results from blockchain analyzer
   */
  private async handleAnalysisResult(result: any, source: string): Promise<void> {
    if (result.tokens.length > 0) {
      await this.handleTokenDetection(result.tokens, source);
    }
  }

  /**
   * Enrich token data with additional information
   */
  private async enrichTokenData(token: UnifiedTokenInfo, source: string): Promise<UnifiedTokenInfo> {
    const enrichedToken = { ...token };

    try {
      // Enrich with DexScreener data if not already from DexScreener
      if (source !== 'dexscreener' && this.config.enableMarketDataEnrichment) {
        const marketData = await this.dexScreenerClient.getTokenByAddress(token.address);
        if (marketData) {
          enrichedToken.metadata = {
            ...enrichedToken.metadata,
            marketData,
            priceUsd: marketData.priceUsd,
            volume24h: marketData.volume24h,
            liquidityUsd: marketData.liquidityUsd,
            marketCap: marketData.marketCap
          };
        }
      }

      // Add social sentiment data if enabled
      if (this.config.enableSocialSentiment) {
        const socialData = await this.getSocialSentiment(token.address);
        if (socialData) {
          enrichedToken.metadata = {
            ...enrichedToken.metadata,
            socialSentiment: socialData
          };
        }
      }

      // Add technical analysis data
      enrichedToken.metadata = {
        ...enrichedToken.metadata,
        technicalAnalysis: await this.performTechnicalAnalysis(enrichedToken),
        enrichedAt: Date.now(),
        enrichedBy: source
      };

    } catch (error) {
      logger.warn(`Failed to enrich token ${token.symbol}:`, error);
    }

    return enrichedToken;
  }

  /**
   * Calculate comprehensive detection result
   */
  private async calculateDetectionResult(token: UnifiedTokenInfo, source: string): Promise<TokenDetectionResult> {
    const detectionTime = Date.now();
    const signals: string[] = [];
    
    // Calculate confidence score
    let confidence = 70; // Base confidence
    
    // Source-based confidence adjustments
    switch (source) {
      case 'blockchain':
        confidence += 15;
        signals.push('blockchain_verified');
        break;
      case 'dexscreener':
        confidence += 10;
        signals.push('market_activity');
        break;
      case 'websocket':
        confidence += 12;
        signals.push('real_time_detection');
        break;
      case 'solscan':
        confidence += 8;
        signals.push('transaction_analysis');
        break;
    }

    // Liquidity-based confidence
    const liquidityUsd = token.liquidity?.usd || 0;
    if (liquidityUsd >= 50000) {
      confidence += 10;
      signals.push('high_liquidity');
    } else if (liquidityUsd >= 10000) {
      confidence += 5;
      signals.push('medium_liquidity');
    }

    // Age-based confidence
    const age = Date.now() - token.detectedAt;
    if (age < 300000) { // 5 minutes
      confidence += 8;
      signals.push('very_new');
    } else if (age < 900000) { // 15 minutes
      confidence += 5;
      signals.push('new');
    }

    // Volume-based confidence
    if (token.metadata?.volume24h > 100000) {
      confidence += 8;
      signals.push('high_volume');
    } else if (token.metadata?.volume24h > 10000) {
      confidence += 4;
      signals.push('medium_volume');
    }

    // Price change signals
    if (token.metadata?.priceChange24h > 20) {
      confidence += 6;
      signals.push('pumping');
    } else if (token.metadata?.priceChange24h > 10) {
      confidence += 3;
      signals.push('rising');
    }

    // Calculate scores
    const riskScore = this.calculateRiskScore(token);
    const opportunityScore = this.calculateOpportunityScore(token);
    const technicalScore = this.calculateTechnicalScore(token);
    const marketScore = this.calculateMarketScore(token);
    const socialScore = this.calculateSocialScore(token);

    // Priority calculation
    const priority = this.calculatePriority(token, signals);

    return {
      token,
      confidence: Math.min(confidence, 100),
      sources: [source],
      detectionTime: detectionTime - token.detectedAt,
      metadata: {
        priority,
        signals,
        riskScore,
        opportunityScore,
        socialScore,
        technicalScore,
        marketScore
      }
    };
  }

  /**
   * Calculate risk score (0-100, lower is better)
   */
  private calculateRiskScore(token: UnifiedTokenInfo): number {
    let risk = 50; // Base risk

    // Liquidity risk
    const liquidityUsd = token.liquidity?.usd || 0;
    if (liquidityUsd < 5000) risk += 20;
    else if (liquidityUsd < 20000) risk += 10;
    else if (liquidityUsd > 100000) risk -= 10;

    // Age risk
    const age = Date.now() - token.detectedAt;
    if (age < 300000) risk += 15; // Very new tokens are riskier
    else if (age > 86400000) risk -= 5; // Older tokens are less risky

    // Volume risk
    if (token.metadata?.volume24h < 1000) risk += 15;
    else if (token.metadata?.volume24h > 50000) risk -= 5;

    // Market cap risk
    if (token.metadata?.marketCap < 100000) risk += 10;
    else if (token.metadata?.marketCap > 1000000) risk -= 5;

    return Math.max(0, Math.min(100, risk));
  }

  /**
   * Calculate opportunity score (0-100, higher is better)
   */
  private calculateOpportunityScore(token: UnifiedTokenInfo): number {
    let opportunity = 50; // Base opportunity

    // Price momentum
    if (token.metadata?.priceChange24h > 50) opportunity += 20;
    else if (token.metadata?.priceChange24h > 20) opportunity += 10;
    else if (token.metadata?.priceChange24h < -20) opportunity -= 10;

    // Volume momentum
    if (token.metadata?.volume24h > 100000) opportunity += 15;
    else if (token.metadata?.volume24h > 50000) opportunity += 10;

    // Liquidity opportunity
    const liquidityUsd = token.liquidity?.usd || 0;
    if (liquidityUsd > 50000 && liquidityUsd < 500000) opportunity += 10;

    // Age opportunity (sweet spot)
    const age = Date.now() - token.detectedAt;
    if (age > 300000 && age < 1800000) opportunity += 10; // 5-30 minutes

    return Math.max(0, Math.min(100, opportunity));
  }

  /**
   * Calculate technical score
   */
  private calculateTechnicalScore(token: UnifiedTokenInfo): number {
    let technical = 50;

    // Price trend analysis
    if (token.metadata?.priceChange5m > 10) technical += 15;
    if (token.metadata?.priceChange1h > 20) technical += 10;

    // Volume trend
    if (token.metadata?.volume5m > token.metadata?.volume1h / 12) technical += 10;

    // Transaction activity
    if (token.metadata?.txns5m > 20) technical += 10;

    return Math.max(0, Math.min(100, technical));
  }

  /**
   * Calculate market score
   */
  private calculateMarketScore(token: UnifiedTokenInfo): number {
    let market = 50;

    // Market presence
    if (token.metadata?.dexId) market += 10;
    if (token.metadata?.pairAddress) market += 5;

    // Liquidity distribution
    const liquidityUsd = token.liquidity?.usd || 0;
    if (liquidityUsd > 100000) market += 15;
    else if (liquidityUsd > 50000) market += 10;

    // Trading activity
    if (token.metadata?.txns24h > 100) market += 10;

    return Math.max(0, Math.min(100, market));
  }

  /**
   * Calculate social score
   */
  private calculateSocialScore(token: UnifiedTokenInfo): number {
    if (!token.metadata?.socialSentiment) return 50;

    const social = token.metadata.socialSentiment;
    let score = 50;

    if (social.mentions > 100) score += 15;
    else if (social.mentions > 50) score += 10;

    if (social.sentiment > 0.6) score += 10;
    else if (social.sentiment < 0.4) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate priority score
   */
  private calculatePriority(token: UnifiedTokenInfo, signals: string[]): number {
    let priority = 1;

    // Signal-based priority
    if (signals.includes('pumping')) priority += this.config.prioritySettings.pumpTokens;
    if (signals.includes('very_new')) priority += this.config.prioritySettings.newTokens;
    if (signals.includes('high_volume')) priority += this.config.prioritySettings.highVolume;
    if (signals.includes('high_liquidity')) priority += this.config.prioritySettings.highLiquidity;

    // Age-based priority
    const age = Date.now() - token.detectedAt;
    if (age < 300000) priority += this.config.prioritySettings.lowAge;

    return Math.min(priority, 10);
  }

  /**
   * Check if token was recently processed
   */
  private isRecentlyProcessed(address: string): boolean {
    const cached = this.tokenCache.get(address);
    if (!cached) return false;

    const age = Date.now() - cached.token.detectedAt;
    return age < this.CACHE_DURATION;
  }

  /**
   * Start detection queue processing
   */
  private startDetectionQueue(): void {
    setInterval(() => {
      this.processDetectionQueue();
    }, 1000);
  }

  /**
   * Process detection queue
   */
  private async processDetectionQueue(): Promise<void> {
    if (this.detectionQueue.length === 0) return;

    // Sort by priority and age
    this.detectionQueue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.timestamp - b.timestamp;
    });

    const batchSize = Math.min(this.config.batchSize || 50, this.detectionQueue.length);
    const batch = this.detectionQueue.splice(0, batchSize);

    for (const item of batch) {
      try {
        if (!this.processedSignatures.has(item.signature)) {
          await this.blockchainAnalyzer.analyzeTransaction(item.signature);
          this.processedSignatures.add(item.signature);
        }
      } catch (error) {
        logger.error(`Error processing queued signature ${item.signature}:`, error);
      }
    }
  }

  /**
   * Update detection statistics
   */
  private updateDetectionStats(result: TokenDetectionResult, source: string): void {
    this.detectionStats.totalDetected++;
    this.detectionStats.totalProcessed++;

    // Update source breakdown
    this.detectionStats.sourceBreakdown[source] = (this.detectionStats.sourceBreakdown[source] || 0) + 1;

    // Update priority breakdown
    const priority = result.metadata.priority.toString();
    this.detectionStats.priorityBreakdown[priority] = (this.detectionStats.priorityBreakdown[priority] || 0) + 1;

    // Update averages
    this.detectionStats.averageConfidence = 
      (this.detectionStats.averageConfidence * (this.detectionStats.totalDetected - 1) + result.confidence) / 
      this.detectionStats.totalDetected;

    this.detectionStats.averageDetectionTime = 
      (this.detectionStats.averageDetectionTime * (this.detectionStats.totalDetected - 1) + result.detectionTime) / 
      this.detectionStats.totalDetected;

    this.detectionStats.successRate = 
      (this.detectionStats.totalDetected / this.detectionStats.totalProcessed) * 100;
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    setInterval(() => {
      // Clean processed signatures
      if (this.processedSignatures.size > 10000) {
        const signatures = Array.from(this.processedSignatures);
        this.processedSignatures.clear();
        signatures.slice(-5000).forEach(sig => this.processedSignatures.add(sig));
      }

      // Clean token cache
      const now = Date.now();
      for (const [address, result] of this.tokenCache) {
        if (now - result.token.detectedAt > this.CACHE_DURATION) {
          this.tokenCache.delete(address);
        }
      }
    }, 60000);
  }

  /**
   * Get social sentiment data (placeholder)
   */
  private async getSocialSentiment(address: string): Promise<any> {
    // Placeholder for social sentiment integration
    return null;
  }

  /**
   * Perform technical analysis
   */
  private async performTechnicalAnalysis(token: UnifiedTokenInfo): Promise<any> {
    // Placeholder for technical analysis
    return {
      trend: 'unknown',
      momentum: 'neutral',
      support: 0,
      resistance: 0
    };
  }

  /**
   * Get comprehensive system statistics
   */
  getStats(): DetectionStats & { systemStats: any } {
    return {
      ...this.detectionStats,
      systemStats: {
        isRunning: this.isRunning,
        queueSize: this.detectionQueue.length,
        cacheSize: this.tokenCache.size,
        processedSignatures: this.processedSignatures.size,
        activeStrategies: this.detectionStrategies.size,
        subscriptions: this.subscriptions.size
      }
    };
  }

  /**
   * Get recently detected tokens
   */
  getRecentTokens(limit: number = 50): TokenDetectionResult[] {
    return Array.from(this.tokenCache.values())
      .sort((a, b) => b.token.detectedAt - a.token.detectedAt)
      .slice(0, limit);
  }
}

// Base detection strategy class
abstract class DetectionStrategy extends EventEmitter {
  protected config: EnhancedDetectionConfig;
  protected isRunning = false;

  constructor(config: EnhancedDetectionConfig) {
    super();
    this.config = config;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract getStats(): any;
}

// WebSocket detection strategy
class WebSocketDetectionStrategy extends DetectionStrategy {
  private connection: Connection;
  private subscriptions = new Map<string, number>();

  constructor(config: EnhancedDetectionConfig) {
    super(config);
    this.connection = new ConnectionManager().getConnection();
  }

  async start(): Promise<void> {
    this.isRunning = true;
    // Implementation for WebSocket detection
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    // Cleanup subscriptions
  }

  getStats(): any {
    return {
      isRunning: this.isRunning,
      subscriptions: this.subscriptions.size
    };
  }
}

// DexScreener detection strategy
class DexScreenerDetectionStrategy extends DetectionStrategy {
  private dexScreenerClient: DexScreenerClient;
  private intervalId?: NodeJS.Timeout;

  constructor(config: EnhancedDetectionConfig, dexScreenerClient: DexScreenerClient) {
    super(config);
    this.dexScreenerClient = dexScreenerClient;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.intervalId = setInterval(async () => {
      try {
        const tokens = await this.dexScreenerClient.getTrendingTokens();
        const unifiedTokens = tokens.map(token => this.convertToUnified(token));
        this.emit('tokenDetected', unifiedTokens);
      } catch (error) {
        logger.error('DexScreener detection error:', error);
      }
    }, this.config.scanInterval);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private convertToUnified(token: any): UnifiedTokenInfo {
    return {
      address: token.address,
      mint: token.address,
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals || 9,
      chainId: 'solana',
      detected: true,
      detectedAt: Date.now(),
      timestamp: Date.now(),
      source: 'dexscreener',
      liquidity: token.liquidityUsd || 0,
      metadata: token
    };
  }

  getStats(): any {
    return {
      isRunning: this.isRunning,
      hasInterval: !!this.intervalId
    };
  }
}

// Blockchain detection strategy
class BlockchainDetectionStrategy extends DetectionStrategy {
  private blockchainAnalyzer: BlockchainTransactionAnalyzer;

  constructor(config: EnhancedDetectionConfig, blockchainAnalyzer: BlockchainTransactionAnalyzer) {
    super(config);
    this.blockchainAnalyzer = blockchainAnalyzer;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    // Blockchain analyzer handles its own startup
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  getStats(): any {
    return {
      isRunning: this.isRunning,
      analyzerStats: this.blockchainAnalyzer.getStats()
    };
  }
}

// Solscan detection strategy
class SolscanDetectionStrategy extends DetectionStrategy {
  private solscanClient: SolscanApiClient;

  constructor(config: EnhancedDetectionConfig, solscanClient: SolscanApiClient) {
    super(config);
    this.solscanClient = solscanClient;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    // Implementation for Solscan detection
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  getStats(): any {
    return {
      isRunning: this.isRunning,
      solscanStats: this.solscanClient.getUsageStats()
    };
  }
}

// Social detection strategy
class SocialDetectionStrategy extends DetectionStrategy {
  async start(): Promise<void> {
    this.isRunning = true;
    // Implementation for social detection
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  getStats(): any {
    return {
      isRunning: this.isRunning
    };
  }
}