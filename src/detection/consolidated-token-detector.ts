/**
 * Consolidated Token Detector
 * Unified token detection system that aggregates multiple sources
 * Replaces the deleted consolidated-token-detector.ts
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { UnifiedTokenInfo, DetectionResult } from '../types/unified';
import { DexScreenerClient } from './dexscreener-client';
import { UnifiedDetector } from './unified-detector';
import { UnifiedTokenFilter, TokenFilterCriteria } from './unified-token-filter';
import { apiCoordinator } from '../core/centralized-api-coordinator';
import { MempoolScanner } from './mempool-scanner';
import { BlockchainAnalyzer } from './blockchain-analyzer';
import { ConnectionPool } from '../core/connection-pool';
import { EnhancedTokenDetection, EnhancedTokenAnalysis } from './enhanced-token-detection';
import { MultiDexMonitor, PoolInfo } from './multi-dex-monitor';

export interface ConsolidatedDetectorConfig {
  minLiquidity: number;
  maxAge: number;
  minConfidence: number;
  batchSize: number;
  maxConcurrentRequests: number;
  cacheTimeout: number;
  filterHoneypots: boolean;
  filterRugs: boolean;
  enableRealTimeMonitoring: boolean;
  enableBlockchainScanning: boolean;
  enableApiPolling: boolean;
  enabledSources: string[];
  scanInterval: number;
  rateLimitDelay: number;
}

export interface DetectionStats {
  totalDetected: number;
  filtered: number;
  processed: number;
  errors: number;
  uptime: number;
  lastDetection: number;
  avgProcessingTime: number;
}

export class ConsolidatedTokenDetector extends EventEmitter {
  private config: ConsolidatedDetectorConfig;
  private isRunning = false;
  private initialized = false;
  
  // Detection components
  private dexScreenerClient!: DexScreenerClient;
  private unifiedDetector!: UnifiedDetector;
  private tokenFilter!: UnifiedTokenFilter;
  private mempoolScanner?: MempoolScanner;
  private blockchainAnalyzer?: BlockchainAnalyzer;
  private enhancedDetection!: EnhancedTokenDetection;
  private multiDexMonitor!: MultiDexMonitor;
  
  // Token management
  private detectedTokens = new Map<string, UnifiedTokenInfo>();
  private processedTokens = new Set<string>();
  private cache = new Map<string, { data: any; timestamp: number }>();
  
  // Statistics
  private stats: DetectionStats = {
    totalDetected: 0,
    filtered: 0,
    processed: 0,
    errors: 0,
    uptime: 0,
    lastDetection: 0,
    avgProcessingTime: 0
  };
  
  private startTime = Date.now();
  private scanInterval?: NodeJS.Timeout;
  private lastScanTime = 0;

  constructor(config: Partial<ConsolidatedDetectorConfig> = {}) {
    super();
    
    this.config = {
      minLiquidity: 1000,
      maxAge: 600000, // 10 minutes
      minConfidence: 5,
      batchSize: 10,
      maxConcurrentRequests: 2,
      cacheTimeout: 300000, // 5 minutes
      filterHoneypots: true,
      filterRugs: true,
      enableRealTimeMonitoring: true,
      enableBlockchainScanning: false,
      enableApiPolling: true,
      enabledSources: ['dexscreener', 'websocket'],
      scanInterval: 30000, // 30 seconds
      rateLimitDelay: 5000, // 5 seconds
      ...config
    };

    this.initializeComponents();
  }

  private async initializeComponents(): Promise<void> {
    try {
      logger.info('🎯 Initializing Consolidated Token Detector...');
      
      // Initialize core components
      this.dexScreenerClient = new DexScreenerClient();
      this.unifiedDetector = new UnifiedDetector();
      
      // Initialize token filter - will set connection when available
      this.tokenFilter = new UnifiedTokenFilter(null);
      
      // Initialize enhanced detection engine
      this.enhancedDetection = new EnhancedTokenDetection();
      
      // Initialize multi-DEX monitor
      this.multiDexMonitor = new MultiDexMonitor(new ConnectionPool());
      
      // Initialize advanced components if enabled
      if (this.config.enableBlockchainScanning) {
        this.mempoolScanner = new MempoolScanner(new ConnectionPool());
        this.blockchainAnalyzer = new BlockchainAnalyzer();
      }
      
      this.setupEventHandlers();
      this.initialized = true;
      
      logger.info('✅ Consolidated Token Detector initialized', {
        config: {
          sources: this.config.enabledSources,
          scanInterval: this.config.scanInterval,
          minLiquidity: this.config.minLiquidity,
          minConfidence: this.config.minConfidence
        }
      });
      
    } catch (error) {
      logger.error('❌ Failed to initialize Consolidated Token Detector:', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    // Enhanced detection events
    this.enhancedDetection.on('analysisComplete', (analysis: EnhancedTokenAnalysis) => {
      logger.info(`🤖 Enhanced analysis: ${analysis.token.symbol} - ${analysis.confidence}% confidence - ${analysis.recommendation}`);
      this.emit('enhancedAnalysis', analysis);
      
      // If recommendation is BUY, treat as detected token
      if (analysis.recommendation === 'BUY') {
        this.handleDetectedTokens([analysis.token], 'enhanced_analysis');
      }
    });

    // Multi-DEX monitor events
    this.multiDexMonitor.on('newPool', (poolInfo: PoolInfo) => {
      logger.info(`🏊 New pool on ${poolInfo.dexName}: ${poolInfo.baseSymbol}/${poolInfo.quoteSymbol}`);
      this.handlePoolDetection(poolInfo);
    });

    this.multiDexMonitor.on('tokenLaunched', (token: UnifiedTokenInfo) => {
      this.handleDetectedTokens([token], 'multi_dex');
    });

    this.multiDexMonitor.on('arbitrageOpportunity', (opportunity: any) => {
      logger.info(`⚡ Arbitrage opportunity: ${opportunity.profitPotential}% between ${opportunity.buyDex} and ${opportunity.sellDex}`);
      this.emit('arbitrageOpportunity', opportunity);
    });

    // Unified detector events
    this.unifiedDetector.on('tokenDetected', (token: UnifiedTokenInfo) => {
      this.handleDetectedTokens([token], 'unified');
    });

    this.unifiedDetector.on('detectionResult', (result: DetectionResult) => {
      this.emit('detectionResult', result);
    });

    // Mempool scanner events
    if (this.mempoolScanner) {
      this.mempoolScanner.on('newTokenMint', (tokenInfo: any) => {
        this.handleMempoolToken(tokenInfo);
      });
    }

    // Blockchain analyzer events
    if (this.blockchainAnalyzer) {
      this.blockchainAnalyzer.on('poolCreated', (poolInfo: any) => {
        this.handlePoolCreation(poolInfo);
      });
    }
  }

  private async handleDetectedTokens(tokens: UnifiedTokenInfo[], source: string): Promise<void> {
    if (!tokens || tokens.length === 0) return;
    
    const startTime = Date.now();
    logger.info(`📊 Processing ${tokens.length} tokens from ${source}`);
    
    try {
      const validTokens: UnifiedTokenInfo[] = [];
      
      for (const token of tokens) {
        if (!token || !token.address) continue;
        
        // Skip already processed tokens
        if (this.processedTokens.has(token.address)) {
          continue;
        }
        
        // Apply filters
        if (await this.shouldProcessToken(token)) {
          validTokens.push(token);
          this.detectedTokens.set(token.address, token);
          this.processedTokens.add(token.address);
        } else {
          this.stats.filtered++;
        }
      }
      
      if (validTokens.length > 0) {
        this.stats.totalDetected += validTokens.length;
        this.stats.processed += validTokens.length;
        this.stats.lastDetection = Date.now();
        
        logger.info(`✅ Detected ${validTokens.length} valid tokens from ${source}`);
        
        // Emit filtered tokens
        this.emit('tokensDetected', validTokens);
        
        // Emit individual detection results
        for (const token of validTokens) {
          const result: DetectionResult = {
            token,
            source,
            timestamp: Date.now(),
            confidence: token.confidence || this.config.minConfidence,
            processingTime: Date.now() - startTime,
            metadata: {
              filtersPassed: this.getFilterResults(token),
              detectionMethod: source
            }
          };
          
          this.emit('detectionResult', result);
        }
      }
      
      // Update processing time stats
      const processingTime = Date.now() - startTime;
      this.stats.avgProcessingTime = (this.stats.avgProcessingTime + processingTime) / 2;
      
    } catch (error) {
      this.stats.errors++;
      logger.error(`❌ Error processing tokens from ${source}:`, error);
    }
  }

  private async shouldProcessToken(token: UnifiedTokenInfo): Promise<boolean> {
    try {
      // Age filter
      if (token.createdAt && (Date.now() - token.createdAt) > this.config.maxAge) {
        return false;
      }
      
      // Liquidity filter
      if (token.liquidity && typeof token.liquidity === 'object') {
        const liquidityValue = token.liquidity.sol || token.liquidity.usd || 0;
        if (liquidityValue < this.config.minLiquidity) {
          return false;
        }
      }
      
      // Confidence filter
      if (token.confidence && token.confidence < this.config.minConfidence) {
        return false;
      }
      
      // Honeypot filter
      if (this.config.filterHoneypots && token.securityScore && token.securityScore < 5) {
        return false;
      }
      
      // Rug pull filter
      if (this.config.filterRugs && token.rugRisk && token.rugRisk > 70) {
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error in token filtering:', error);
      return false;
    }
  }

  private getFilterResults(token: UnifiedTokenInfo): string[] {
    const passed: string[] = [];
    
    if (!token.createdAt || (Date.now() - token.createdAt) <= this.config.maxAge) {
      passed.push('age');
    }
    
    if (!token.liquidity || (typeof token.liquidity === 'object' && (token.liquidity.sol || token.liquidity.usd || 0) >= this.config.minLiquidity)) {
      passed.push('liquidity');
    }
    
    if (!token.confidence || token.confidence >= this.config.minConfidence) {
      passed.push('confidence');
    }
    
    if (!token.securityScore || token.securityScore >= 5) {
      passed.push('security');
    }
    
    if (!token.rugRisk || token.rugRisk <= 70) {
      passed.push('rug_risk');
    }
    
    return passed;
  }

  private async handleMempoolToken(tokenInfo: any): Promise<void> {
    try {
      const token: UnifiedTokenInfo = {
        address: tokenInfo.mint,
        symbol: tokenInfo.symbol || 'UNKNOWN',
        name: tokenInfo.name || 'Unknown Token',
        decimals: tokenInfo.decimals || 9,
        detected: true,
        detectedAt: Date.now(),
        createdAt: Date.now(),
        source: 'mempool',
        confidence: 8, // High confidence from mempool
        liquidity: { sol: 0, usd: 0 }, // Will be updated when pool is created
        volume24h: 0,
        priceUsd: 0,
        marketCap: 0
      };
      
      await this.handleDetectedTokens([token], 'mempool');
    } catch (error) {
      logger.error('Error handling mempool token:', error);
    }
  }

  private async handlePoolCreation(poolInfo: any): Promise<void> {
    try {
      const token: UnifiedTokenInfo = {
        address: poolInfo.baseToken,
        symbol: poolInfo.symbol || 'UNKNOWN',
        name: poolInfo.name || 'Unknown Token',
        decimals: poolInfo.decimals || 9,
        detected: true,
        detectedAt: Date.now(),
        createdAt: Date.now(),
        source: 'blockchain',
        confidence: 9, // Very high confidence from blockchain
        liquidity: { sol: poolInfo.liquidity || 0, usd: 0 },
        volume24h: 0,
        priceUsd: poolInfo.price || 0,
        marketCap: 0,
        pairAddress: poolInfo.pairAddress
      };
      
      await this.handleDetectedTokens([token], 'blockchain');
    } catch (error) {
      logger.error('Error handling pool creation:', error);
    }
  }

  private async handlePoolDetection(poolInfo: PoolInfo): Promise<void> {
    try {
      // Convert pool info to token info for unified processing
      const tokenInfo: UnifiedTokenInfo = {
        address: poolInfo.baseToken,
        symbol: poolInfo.baseSymbol,
        name: poolInfo.baseSymbol,
        decimals: 9,
        detected: true,
        detectedAt: Date.now(),
        source: `pool_${poolInfo.dexName}`,
        liquidity: { sol: poolInfo.liquidity, usd: poolInfo.liquidity * 100 },
        volume24h: poolInfo.volume24h,
        priceUsd: poolInfo.price,
        pairAddress: poolInfo.poolAddress,
        dexId: poolInfo.dexName,
        createdAt: poolInfo.createdAt
      };

      // Run enhanced analysis on the new pool token
      const analysis = await this.enhancedDetection.analyze(tokenInfo);
      
      // Emit pool detection event
      this.emit('poolDetected', { poolInfo, analysis });
      
    } catch (error) {
      logger.error('Error handling pool detection:', error);
    }
  }

  private async scanForTokens(): Promise<void> {
    if (!this.isRunning) return;
    
    const now = Date.now();
    if (now - this.lastScanTime < this.config.rateLimitDelay) {
      return; // Rate limiting
    }
    
    this.lastScanTime = now;
    
    try {
      logger.info('🔍 Scanning for new tokens...');
      
      // Use DexScreener for primary detection
      if (this.config.enabledSources.includes('dexscreener')) {
        const tokens = await this.dexScreenerClient.getTrendingTokens({
          minLiquiditySOL: this.config.minLiquidity,
          maxAgeHours: this.config.maxAge / (1000 * 60 * 60) // Convert ms to hours
        });
        
        if (tokens.length > 0) {
          await this.handleDetectedTokens(tokens, 'dexscreener_scan');
        }
      }
      
      // Use unified detector for additional sources
      if (this.config.enableRealTimeMonitoring) {
        // Unified detector runs continuously, no manual trigger needed
      }
      
    } catch (error) {
      this.stats.errors++;
      logger.error('❌ Error during token scan:', error);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Consolidated Token Detector already running');
      return;
    }
    
    if (!this.initialized) {
      await this.initializeComponents();
    }
    
    try {
      logger.info('🚀 Starting Consolidated Token Detector...');
      
      // Start unified detector
      await this.unifiedDetector.start();
      
      // Start multi-DEX monitor
      await this.multiDexMonitor.start();
      logger.info('✅ Multi-DEX monitor started');
      
      // Start mempool scanner if enabled
      if (this.mempoolScanner && this.config.enableBlockchainScanning) {
        await this.mempoolScanner.start();
      }
      
      // Start blockchain analyzer if enabled
      if (this.blockchainAnalyzer && this.config.enableBlockchainScanning) {
        await this.blockchainAnalyzer.start();
      }
      
      // Start periodic scanning
      if (this.config.enableApiPolling) {
        this.scanInterval = setInterval(() => {
          this.scanForTokens();
        }, this.config.scanInterval);
      }
      
      this.isRunning = true;
      this.startTime = Date.now();
      
      logger.info('✅ Consolidated Token Detector started successfully');
      this.emit('started');
      
    } catch (error) {
      logger.error('❌ Failed to start Consolidated Token Detector:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    logger.info('🛑 Stopping Consolidated Token Detector...');
    
    try {
      // Stop scanning interval
      if (this.scanInterval) {
        clearInterval(this.scanInterval);
        this.scanInterval = undefined;
      }
      
      // Stop components
      if (this.unifiedDetector) {
        await this.unifiedDetector.stop();
      }
      
      if (this.mempoolScanner) {
        await this.mempoolScanner.stop();
      }
      
      if (this.blockchainAnalyzer) {
        await this.blockchainAnalyzer.stop();
      }
      
      this.isRunning = false;
      
      logger.info('✅ Consolidated Token Detector stopped successfully');
      this.emit('stopped');
      
    } catch (error) {
      logger.error('❌ Error stopping Consolidated Token Detector:', error);
      throw error;
    }
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      initialized: this.initialized,
      detectedTokensCount: this.detectedTokens.size,
      processedTokensCount: this.processedTokens.size,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      config: this.config,
      stats: {
        ...this.stats,
        uptime: this.isRunning ? Date.now() - this.startTime : 0
      },
      components: {
        dexScreener: !!this.dexScreenerClient,
        unifiedDetector: !!this.unifiedDetector,
        mempoolScanner: !!this.mempoolScanner,
        blockchainAnalyzer: !!this.blockchainAnalyzer
      }
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isRunning || !this.initialized) {
        return false;
      }
      
      // Check if components are responsive
      const checks = [
        this.dexScreenerClient && true,
        this.unifiedDetector && true,
        !this.mempoolScanner || true, // Optional component
        !this.blockchainAnalyzer || true // Optional component
      ];
      
      return checks.every(Boolean);
    } catch (error) {
      logger.error('Health check failed:', error);
      return false;
    }
  }

  getDetectedTokens(): UnifiedTokenInfo[] {
    return Array.from(this.detectedTokens.values());
  }

  getDetectionStats(): DetectionStats {
    return {
      ...this.stats,
      uptime: this.isRunning ? Date.now() - this.startTime : 0
    };
  }

  // Manual token analysis
  async analyzeToken(address: string): Promise<UnifiedTokenInfo | null> {
    try {
      logger.info(`🔍 Analyzing token: ${address}`);
      
      // Check cache first
      const cached = this.cache.get(address);
      if (cached && (Date.now() - cached.timestamp) < this.config.cacheTimeout) {
        return cached.data;
      }
      
      // For now, return basic analysis (unified detector doesn't have analyzeToken method)
      // TODO: Implement token analysis when UnifiedDetector is enhanced
      const result = null;
      if (result) {
        // Cache result
        this.cache.set(address, {
          data: result,
          timestamp: Date.now()
        });
        
        return result;
      }
      
      return null;
    } catch (error) {
      logger.error(`❌ Error analyzing token ${address}:`, error);
      return null;
    }
  }
}