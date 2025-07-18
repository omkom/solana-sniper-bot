// @ts-nocheck
import { Config } from './core/config';
import { RapidTokenAnalyzer } from './core/rapid-token-analyzer';
import { RealTokenMonitor } from './detection/real-token-monitor';
import { SecurityAnalyzer } from './analysis/security-analyzer';
import { DryRunEngine } from './simulation/dry-run-engine';
import { RealPriceSimulationEngine } from './simulation/real-price-engine';
import { UltraSniperEngine } from './simulation/ultra-sniper-engine';
import { EducationalDashboard } from './monitoring/dashboard';
import { TokenPriceTracker } from './monitoring/token-price-tracker';
import { MigrationMonitor } from './monitoring/migration-monitor';
import { KPITracker } from './monitoring/kpi-tracker';
import { PumpDetector, PumpSignal } from './detection/pump-detector';
import { ConnectionMonitor } from './monitoring/connection-monitor';
import { ConnectionManager } from './core/connection';
import { logger } from './monitoring/logger';
import { LogCleaner } from './utils/log-cleaner';
import { PriceConverter } from './utils/price-converter';
import { TokenInfo } from './types';

interface UnifiedAnalyzerConfig {
  mode: 'rapid' | 'real' | 'hybrid' | 'sniper';
  enablePumpDetection: boolean;
  enableRealPrices: boolean;
  enableDemoMode: boolean;
  enableMultiDex: boolean;
  enableUltraSniper?: boolean;
}

class UnifiedTokenAnalyzer {
  private config: Config;
  private rapidAnalyzer?: RapidTokenAnalyzer;
  private realTokenMonitor?: RealTokenMonitor;
  private securityAnalyzer: SecurityAnalyzer;
  private simulationEngine: DryRunEngine | RealPriceSimulationEngine | UltraSniperEngine;
  private dashboard: EducationalDashboard;
  private tokenPriceTracker: TokenPriceTracker;
  private migrationMonitor: MigrationMonitor;
  private kpiTracker: KPITracker;
  private pumpDetector?: PumpDetector;
  private connectionMonitor: ConnectionMonitor;
  private connectionManager: ConnectionManager;
  private logCleaner: LogCleaner;
  private priceConverter: PriceConverter;
  private isRunning: boolean = false;
  private analyzerConfig: UnifiedAnalyzerConfig;
  
  // Token tracking for dashboard
  private foundTokens: Map<string, any> = new Map();
  private analyzedTokens: Map<string, any> = new Map();
  private stats = {
    totalDetected: 0,
    totalProcessed: 0,
    totalViable: 0,
    totalPositions: 0,
    errors: 0,
    startTime: Date.now()
  };
  
  // Priority processing queue
  private processingQueue: Array<{
    tokenInfo: TokenInfo;
    priority: number;
    pumpSignal?: PumpSignal;
    timestamp: number;
  }> = [];
  private isProcessingQueue = false;

  constructor(analyzerConfig: UnifiedAnalyzerConfig) {
    this.analyzerConfig = analyzerConfig;
    console.log('🎓 Initializing Unified Educational Token Analyzer');
    console.log(`📊 Mode: ${analyzerConfig.mode.toUpperCase()}`);
    
    this.config = Config.getInstance();
    this.connectionManager = new ConnectionManager();
    this.connectionMonitor = new ConnectionMonitor(this.connectionManager);
    this.logCleaner = new LogCleaner();
    this.priceConverter = new PriceConverter();
    this.securityAnalyzer = new SecurityAnalyzer();
    
    // Initialize monitoring components
    this.tokenPriceTracker = new TokenPriceTracker();
    this.migrationMonitor = new MigrationMonitor();
    this.kpiTracker = new KPITracker();
    
    // Initialize simulation engine based on configuration
    if (analyzerConfig.mode === 'sniper' || analyzerConfig.enableUltraSniper) {
      this.realTokenMonitor = new RealTokenMonitor();
      this.simulationEngine = new UltraSniperEngine(this.realTokenMonitor);
      console.log('🎯 ULTRA SNIPER ENGINE ACTIVATED - INSTANT BUY MODE');
    } else if (analyzerConfig.enableRealPrices && analyzerConfig.mode !== 'rapid') {
      this.realTokenMonitor = new RealTokenMonitor();
      this.simulationEngine = new RealPriceSimulationEngine(this.realTokenMonitor);
      console.log('💰 Using Real Price Simulation Engine for live price data');
    } else {
      this.simulationEngine = new DryRunEngine();
      console.log('🎮 Using Dry Run Engine for simulated prices');
    }
    
    // Initialize components based on configuration
    if (analyzerConfig.mode === 'rapid' || analyzerConfig.mode === 'hybrid') {
      // Pass the actual simulation engine (could be DryRunEngine or RealPriceSimulationEngine)
      this.rapidAnalyzer = new RapidTokenAnalyzer(this.simulationEngine);
    }
    
    if (analyzerConfig.enablePumpDetection && (analyzerConfig.mode === 'real' || analyzerConfig.mode === 'hybrid')) {
      this.pumpDetector = new PumpDetector();
    }
    
    this.dashboard = new EducationalDashboard(
      this.simulationEngine, 
      this.tokenPriceTracker, 
      this.migrationMonitor, 
      this.kpiTracker, 
      this
    );
    
    this.setupEventListeners();
    this.setupErrorHandling();
    this.startProcessingQueue();
  }
  
  private calculateTokenPriority(tokenInfo: TokenInfo, pumpSignal?: PumpSignal): number {
    let priority = 1; // Base priority
    
    // Pump tokens get highest priority
    if (pumpSignal) {
      priority = 5;
      return priority;
    }
    
    // Source-based priority
    const source = tokenInfo.source?.toLowerCase() || '';
    if (source.includes('pump')) {
      priority = 4; // Very high priority for pump-related sources
    } else if (source.includes('raydium') || source.includes('websocket')) {
      priority = 3; // High priority for Raydium and WebSocket sources
    } else if (source.includes('multi_dex') || source.includes('scanner') || source.includes('real_monitor')) {
      priority = 3; // High priority for multi-dex and scanner sources
    } else if (source.includes('orca') || source.includes('jupiter')) {
      priority = 2; // Medium priority for other major DEXes
    } else if (source === 'demo' || source === 'educational') {
      priority = 1; // Low priority for demo tokens
    }
    
    // Age-based priority boost (newer tokens get higher priority)
    const ageMs = Date.now() - (tokenInfo.createdAt || tokenInfo.timestamp);
    if (ageMs < 60000) { // < 1 minute
      priority += 2;
    } else if (ageMs < 300000) { // < 5 minutes
      priority += 1;
    }
    
    // Liquidity-based priority boost
    const liquidityUsd = tokenInfo.liquidity?.usd || 0;
    if (liquidityUsd >= 50000) {
      priority += 1;
    } else if (liquidityUsd >= 10000) {
      priority += 0.5;
    }
    
    // Metadata-based priority boosts
    if (tokenInfo.metadata) {
      if (tokenInfo.metadata.pumpDetected || tokenInfo.metadata.pumpScore) {
        priority += 2;
      }
      if (tokenInfo.metadata.urgency === 'high') {
        priority += 1;
      }
    }
    
    return Math.min(priority, 5); // Cap at 5 for consistency
  }

  private addToProcessingQueue(tokenInfo: TokenInfo, priority?: number, pumpSignal?: PumpSignal): void {
    // Calculate priority if not provided
    const calculatedPriority = priority || this.calculateTokenPriority(tokenInfo, pumpSignal);
    
    this.processingQueue.push({
      tokenInfo,
      priority: calculatedPriority,
      pumpSignal,
      timestamp: Date.now()
    });
    
    // Sort by priority (highest first)
    this.processingQueue.sort((a, b) => b.priority - a.priority);
    
    // Limit queue size to prevent memory issues
    if (this.processingQueue.length > 100) {
      this.processingQueue = this.processingQueue.slice(0, 100);
    }
    
    console.log(`📋 Added to processing queue: ${tokenInfo.symbol || tokenInfo.mint?.slice(0, 8)} (Priority: ${calculatedPriority}, Queue size: ${this.processingQueue.length})`);
  }
  
  private startProcessingQueue(): void {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    this.processNextInQueue();
  }
  
  private async processNextInQueue(): Promise<void> {
    if (!this.isRunning || this.processingQueue.length === 0) {
      setTimeout(() => this.processNextInQueue(), 100);
      return;
    }
    
    const item = this.processingQueue.shift();
    if (!item) {
      setTimeout(() => this.processNextInQueue(), 100);
      return;
    }
    
    const processingTime = Date.now() - item.timestamp;
    console.log(`🔄 Processing token from queue: ${item.tokenInfo.symbol || item.tokenInfo.mint?.slice(0, 8)} (Priority: ${item.priority}, Queue wait: ${processingTime}ms, Remaining: ${this.processingQueue.length})`);
    
    try {
      if (item.pumpSignal) {
        console.log(`🚨 Processing pump token with signal strength: ${item.pumpSignal.pumpStrength}`);
        await this.analyzePumpToken(item.tokenInfo, item.pumpSignal);
      } else {
        console.log(`🔍 Processing regular token from source: ${item.tokenInfo.source}`);
        await this.analyzeToken(item.tokenInfo);
      }
      
      console.log(`✅ Queue processing completed for ${item.tokenInfo.symbol || item.tokenInfo.mint?.slice(0, 8)}`);
    } catch (error) {
      console.error('❌ Error processing token from queue:', error);
      this.stats.errors++;
    }
    
    // Process next item immediately
    setImmediate(() => this.processNextInQueue());
  }

  private setupEventListeners(): void {
    // Rapid analyzer events
    if (this.rapidAnalyzer) {
      this.rapidAnalyzer.on('tokenDetected', (tokenInfo: TokenInfo) => {
        this.stats.totalDetected++;
        this.trackFoundToken(tokenInfo);
        console.log(`🔍 Rapid token detected: ${tokenInfo.symbol} from ${tokenInfo.metadata?.detectionSource}`);
        
        // Add to token price tracker for monitoring
        this.tokenPriceTracker.addToken(
          tokenInfo.mint, 
          tokenInfo.symbol || 'Unknown', 
          tokenInfo.name || tokenInfo.symbol || 'Unknown Token',
          tokenInfo.metadata?.detectionSource || 'rapid'
        );
        
        // Record KPI
        this.kpiTracker.recordTokenDetected(tokenInfo.metadata?.detectionSource || 'rapid');
        
        // Route tokens through unified processing queue with priority-based handling
        const priority = this.calculateTokenPriority(tokenInfo);
        console.log(`🎯 Routing rapid token through unified queue (Priority: ${priority})`);
        
        // Add to unified processing queue instead of duplicate processing
        this.addToProcessingQueue(tokenInfo, priority);
      });
      
      this.rapidAnalyzer.on('viableTokenFound', ({ tokenInfo, securityAnalysis }) => {
        this.stats.totalViable++;
        console.log(`✅ Viable token: ${tokenInfo.symbol} (Score: ${securityAnalysis.score})`);
      });
      
      this.rapidAnalyzer.on('honeypotDetected', (tokenInfo) => {
        console.log(`🍯 Honeypot detected: ${tokenInfo.symbol}`);
      });
      
      this.rapidAnalyzer.on('processingError', ({ tokenInfo, error }) => {
        this.stats.errors++;
        console.error(`❌ Processing error for ${tokenInfo.symbol}:`, error.message);
      });
    }

    // Real token monitor events
    if (this.realTokenMonitor) {
      this.realTokenMonitor.on('tokenDetected', async (tokenInfo: TokenInfo) => {
        try {
          this.stats.totalDetected++;
          this.trackFoundToken(tokenInfo);
          
          // Add to token price tracker for monitoring
          this.tokenPriceTracker.addToken(
            tokenInfo.mint, 
            tokenInfo.symbol || 'Unknown', 
            tokenInfo.name || tokenInfo.symbol || 'Unknown Token',
            'real_monitor'
          );
          
          // Record KPI
          this.kpiTracker.recordTokenDetected('real_monitor');
          
          logger.log('analysis', 'Real token detected for analysis', {
            mint: tokenInfo.mint,
            symbol: tokenInfo.symbol,
            source: tokenInfo.source,
            timestamp: tokenInfo.timestamp,
            liquidity: tokenInfo.liquidity
          });

          // Add to priority queue with calculated priority
          const priority = this.calculateTokenPriority(tokenInfo);
          console.log(`🎯 Routing real token through unified queue (Priority: ${priority})`);
          this.addToProcessingQueue(tokenInfo, priority);
        } catch (error) {
          this.stats.errors++;
          logger.error('Error analyzing real token', { error, tokenInfo });
        }
      });
    }

    // Pump detector events
    if (this.pumpDetector) {
      this.pumpDetector.on('pumpDetected', async (tokenInfo: TokenInfo, pumpSignal: PumpSignal) => {
        try {
          this.stats.totalDetected++;
          this.trackFoundToken(tokenInfo, true);
          
          // Add to token price tracker for monitoring with pump priority
          this.tokenPriceTracker.addToken(
            tokenInfo.mint, 
            tokenInfo.symbol || 'Unknown', 
            tokenInfo.name || tokenInfo.symbol || 'Unknown Token',
            'pump_detector'
          );
          
          // Record KPI
          this.kpiTracker.recordTokenDetected('pump_detector');
          
          console.log(`\\n🚨 PUMP ALERT: Processing high-priority pump signal for ${tokenInfo.symbol}`);
          logger.log('analysis', 'Pump detected - high priority analysis', {
            mint: tokenInfo.mint,
            symbol: tokenInfo.symbol,
            pumpStrength: pumpSignal.pumpStrength,
            signals: pumpSignal.signals,
            source: 'pump_detector'
          });

          // Add pump tokens to priority queue with highest priority (always 5)
          const priority = this.calculateTokenPriority(tokenInfo, pumpSignal);
          console.log(`🚨 Routing pump token through unified queue (Priority: ${priority})`);
          this.addToProcessingQueue(tokenInfo, priority, pumpSignal);
        } catch (error) {
          this.stats.errors++;
          logger.error('Error analyzing pump token', { error, tokenInfo, pumpSignal });
        }
      });
    }

    // Simulation engine events
    this.simulationEngine.on('trade', (trade) => {
      const emoji = trade.type === 'BUY' ? '💰' : '🔄';
      console.log(`${emoji} ${trade.type}: ${trade.symbol} - ${trade.amount.toFixed(4)} SOL`);
      
      // Update tracked token with actual action taken
      if (trade.type === 'BUY') {
        const existingToken = this.analyzedTokens.get(trade.mint);
        if (existingToken) {
          existingToken.action = 'BUY';
          existingToken.reason = trade.reason || 'Position taken';
          this.analyzedTokens.set(trade.mint, existingToken);
        }
      }
    });

    this.simulationEngine.on('tokenSkipped', (skipInfo) => {
      // Update tracked token with skip reason
      const existingToken = this.analyzedTokens.get(skipInfo.mint);
      if (existingToken) {
        existingToken.action = 'SKIP';
        existingToken.reason = skipInfo.reason;
        this.analyzedTokens.set(skipInfo.mint, existingToken);
      }
    });

    this.simulationEngine.on('positionOpened', (position) => {
      this.stats.totalPositions++;
      console.log(`📈 Position opened: ${position.symbol} - ${position.simulatedInvestment.toFixed(4)} SOL`);
      
      // Record KPI
      this.kpiTracker.recordPositionOpened(position.mint, position.simulatedInvestment);
    });

    this.simulationEngine.on('positionClosed', (position) => {
      const profitEmoji = (position.roi || 0) > 0 ? '💚' : '💔';
      console.log(`📊 Position closed: ${position.symbol} - ROI: ${(position.roi || 0).toFixed(2)}% ${profitEmoji}`);
      
      // Record KPI for successful trades (positive ROI)
      if ((position.roi || 0) > 0) {
        const holdTime = position.exitTime ? (position.exitTime - position.entryTime) : 0;
        this.kpiTracker.recordSuccessfulTrade(position.mint, position.roi || 0, holdTime);
      }
      
      // Remove from price tracker when position is closed
      this.tokenPriceTracker.removeToken(position.mint);
    });

    this.simulationEngine.on('portfolioUpdate', (stats) => {
      if (stats.totalTrades > 0 && stats.totalTrades % 5 === 0) {
        console.log(`📊 Portfolio: ${stats.totalPortfolioValue.toFixed(4)} SOL | ROI: ${stats.totalROI.toFixed(2)}% | Trades: ${stats.totalTrades}`);
      }
    });

    // Process termination handlers
    process.on('SIGINT', () => {
      console.log('\\n🛑 Shutting down Unified Token Analyzer...');
      this.stop().then(() => {
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\\n🛑 Shutting down Unified Token Analyzer...');
      this.stop().then(() => {
        process.exit(0);
      });
    });
  }

  private setupErrorHandling(): void {
    // Enhanced error handling
    process.on('uncaughtException', (error) => {
      // Filter out EPIPE errors which are common with broken network connections
      if (error.message?.includes('EPIPE') || error.code === 'EPIPE') {
        console.warn('⚠️ Network connection broken (EPIPE), continuing...');
        return;
      }
      
      console.error('❌ Uncaught Exception:', error);
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      const errorStack = reason instanceof Error ? reason.stack : undefined;
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', errorMessage);
      logger.error('Unhandled rejection', { 
        reason: errorMessage,
        stack: errorStack,
        promise: promise.toString(),
        timestamp: new Date().toISOString()
      });
      // Don't exit on unhandled rejection, just log it
    });
  }

  private trackFoundToken(tokenInfo: TokenInfo, isPump: boolean = false): void {
    const realToken = this.realTokenMonitor?.getTokenInfo(tokenInfo.mint);
    const ageInMinutes = tokenInfo.metadata?.ageMinutes || 0;
    
    const tokenData = {
      id: tokenInfo.mint,
      name: tokenInfo.name || tokenInfo.symbol || 'Unknown',
      symbol: tokenInfo.symbol || 'UNK',
      price: realToken?.priceUsd || 0,
      age: ageInMinutes,
      liquidity: realToken?.liquidityUsd || tokenInfo.liquidity?.usd || 0,
      volume24h: realToken?.volume24h || 0,
      priceChange5m: realToken?.priceChange5m || 0,
      trendingScore: realToken?.trendingScore || 0,
      dexId: realToken?.dexId || tokenInfo.source,
      foundAt: Date.now(),
      isPump: isPump,
      source: tokenInfo.source,
      pairAddress: realToken?.pairAddress
    };
    
    this.foundTokens.set(tokenInfo.mint, tokenData);
    
    // Keep only last 100 found tokens
    if (this.foundTokens.size > 100) {
      const firstKey = this.foundTokens.keys().next().value;
      if (firstKey) {
        this.foundTokens.delete(firstKey);
      }
    }
  }

  private trackAnalyzedToken(tokenInfo: TokenInfo, securityScore: number, action: string, reason?: string): void {
    const realToken = this.realTokenMonitor?.getTokenInfo(tokenInfo.mint);
    const ageInMinutes = tokenInfo.metadata?.ageMinutes || 0;
    
    // Generate detailed analysis reason
    const analysisReason = reason || this.generateAnalysisReason(tokenInfo, securityScore, action, realToken);
    
    const analyzedData = {
      id: tokenInfo.mint,
      name: tokenInfo.name || tokenInfo.symbol || 'Unknown',
      symbol: tokenInfo.symbol || 'UNK',
      price: realToken?.priceUsd || 0,
      age: ageInMinutes,
      securityScore: securityScore,
      liquidity: realToken?.liquidityUsd || tokenInfo.liquidity?.usd || 0,
      volume24h: realToken?.volume24h || 0,
      priceChange5m: realToken?.priceChange5m || 0,
      trendingScore: realToken?.trendingScore || 0,
      dexId: realToken?.dexId || tokenInfo.source,
      analyzedAt: Date.now(),
      action: action,
      reason: analysisReason,
      isPump: tokenInfo.source === 'pump_detector',
      source: tokenInfo.source
    };
    
    this.analyzedTokens.set(tokenInfo.mint, analyzedData);
    
    // Keep only last 100 analyzed tokens
    if (this.analyzedTokens.size > 100) {
      const firstKey = this.analyzedTokens.keys().next().value;
      if (firstKey) {
        this.analyzedTokens.delete(firstKey);
      }
    }
  }

  private generateAnalysisReason(tokenInfo: TokenInfo, securityScore: number, action: string, realToken?: any): string {
    if (action === 'BUY') {
      const reasons = [];
      
      // Security score
      if (securityScore >= 90) {
        reasons.push('excellent security');
      } else if (securityScore >= 75) {
        reasons.push('good security');
      } else if (securityScore >= 60) {
        reasons.push('adequate security');
      }
      
      // Token age
      const ageMs = Date.now() - tokenInfo.createdAt;
      if (ageMs < 300000) { // 5 minutes
        reasons.push('fresh token');
      } else if (ageMs < 900000) { // 15 minutes
        reasons.push('recent token');
      }
      
      // Liquidity
      const liquidityUsd = realToken?.liquidityUsd || tokenInfo.liquidity?.usd || 0;
      if (liquidityUsd >= 50000) {
        reasons.push('high liquidity');
      } else if (liquidityUsd >= 10000) {
        reasons.push('adequate liquidity');
      }
      
      // Pump detection
      if (tokenInfo.source === 'pump_detector') {
        reasons.push('pump signal');
      }
      
      // Volume
      if (realToken?.volume24h > 100000) {
        reasons.push('high volume');
      }
      
      return reasons.length > 0 ? `BUY: ${reasons.join(', ')}` : 'BUY: meets criteria';
    } else {
      // Skip reasons
      if (securityScore < 60) {
        return `SKIP: low security score (${securityScore})`;
      }
      
      const ageMs = Date.now() - tokenInfo.createdAt;
      if (ageMs > 1800000) { // 30 minutes
        return `SKIP: token too old (${Math.round(ageMs/60000)}m)`;
      }
      
      const liquidityUsd = realToken?.liquidityUsd || tokenInfo.liquidity?.usd || 0;
      if (liquidityUsd < 5000) {
        return `SKIP: low liquidity ($${liquidityUsd.toLocaleString()})`;
      }
      
      return `SKIP: ${action.toLowerCase()}`;
    }
  }

  private async analyzeToken(tokenInfo: TokenInfo): Promise<void> {
    const realToken = this.realTokenMonitor?.getTokenInfo(tokenInfo.mint);
    
    console.log(`\\n🔍 UNIFIED ANALYZER: Processing token: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`📡 Source: ${tokenInfo.source}`);
    console.log(`💰 Liquidity: $${tokenInfo.liquidity?.usd || 0}`);
    console.log(`💵 Price: $${tokenInfo.metadata?.priceUsd || tokenInfo.metadata?.price || 'N/A'}`);
    console.log(`🕐 Age: ${Math.round((Date.now() - tokenInfo.createdAt) / 60000)} minutes`);
    console.log(`🎮 Is Demo Token: ${tokenInfo.metadata?.demo === true ? 'YES' : 'NO'}`);
    
    if (realToken) {
      console.log(`💵 Real Price: $${realToken.priceUsd.toFixed(8)}`);
      console.log(`📈 24h Change: ${realToken.priceChange24h.toFixed(2)}%`);
      console.log(`💧 Real Liquidity: $${realToken.liquidityUsd.toLocaleString()}`);
      console.log(`📊 Volume 24h: $${realToken.volume24h.toLocaleString()}`);
      console.log(`🔥 Trending Score: ${realToken.trendingScore}/100`);
    }

    try {
      this.stats.totalProcessed++;
      
      // Step 1: Security Analysis
      const securityAnalysis = await this.securityAnalyzer.analyzeToken(tokenInfo);
      
      logger.log('analysis', 'Security analysis completed', {
        mint: tokenInfo.mint,
        score: securityAnalysis.score,
        passed: securityAnalysis.overall,
        warnings: securityAnalysis.warnings.length,
        priceUsd: realToken?.priceUsd,
        liquidity: realToken?.liquidityUsd
      });

      // Step 2: Honeypot Check (only for non-pump tokens)
      if (tokenInfo.source !== 'pump_detector') {
        const isHoneypot = await this.securityAnalyzer.checkForHoneypot(tokenInfo);
        
        if (isHoneypot) {
          console.log('🍯 Honeypot detected - skipping token');
          logger.log('analysis', 'Token identified as potential honeypot', {
            mint: tokenInfo.mint,
            symbol: tokenInfo.symbol
          });
          
          this.trackAnalyzedToken(tokenInfo, securityAnalysis.score, 'SKIP_HONEYPOT', 'SKIP: honeypot detected');
          return;
        }
      }

      // Track analyzed token - this will be updated by the simulation engine
      this.trackAnalyzedToken(tokenInfo, securityAnalysis.score, 'ANALYZED');

      // Step 3: Process with simulation engine
      console.log(`🎯 ABOUT TO PASS TOKEN TO SIMULATION ENGINE:`);
      console.log(`   Token: ${tokenInfo.symbol || 'Unknown'} (${tokenInfo.mint.slice(0, 8)})`);
      console.log(`   Security Score: ${securityAnalysis.score}`);
      console.log(`   Price Available: ${!!tokenInfo.metadata?.priceUsd || !!tokenInfo.metadata?.price}`);
      console.log(`   Simulation Engine: ${this.simulationEngine.constructor.name}`);
      
      await this.simulationEngine.processTokenDetection(tokenInfo, securityAnalysis);
      
      console.log(`✅ SIMULATION ENGINE CALL COMPLETED for ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);

    } catch (error) {
      this.stats.errors++;
      console.error('❌ Error during token analysis:', error);
      logger.error('Token analysis failed', {
        mint: tokenInfo.mint,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async analyzePumpToken(tokenInfo: TokenInfo, pumpSignal: PumpSignal): Promise<void> {
    const realToken = this.realTokenMonitor?.getTokenInfo(tokenInfo.mint);
    
    console.log(`\\n🚨 ANALYZING PUMP TOKEN: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`🔥 Pump Strength: ${pumpSignal.pumpStrength.toFixed(1)}/100`);
    console.log(`📡 Source: ${tokenInfo.source}`);
    console.log(`⚡ Pump Signals: ${pumpSignal.signals.join(', ')}`);
    
    if (realToken) {
      console.log(`💵 Current Price: $${realToken.priceUsd.toFixed(8)}`);
      console.log(`📈 5m Change: ${realToken.priceChange5m.toFixed(2)}%`);
      console.log(`📊 Volume 5m: $${realToken.volume5m.toLocaleString()}`);
      console.log(`💧 Liquidity: $${realToken.liquidityUsd.toLocaleString()}`);
      console.log(`🔥 Trending Score: ${realToken.trendingScore}/100`);
    }

    try {
      this.stats.totalProcessed++;
      
      // Fast-track security analysis for pumps
      const securityAnalysis = await this.securityAnalyzer.analyzeToken(tokenInfo);
      
      // Give pump tokens a slight security boost due to activity
      if (pumpSignal.pumpStrength > 30) {
        securityAnalysis.score += 5;
      }
      
      logger.log('analysis', 'Security analysis completed for pump token', {
        mint: tokenInfo.mint,
        score: securityAnalysis.score,
        passed: securityAnalysis.overall,
        warnings: securityAnalysis.warnings.length,
        pumpStrength: pumpSignal.pumpStrength,
        priceUsd: realToken?.priceUsd,
        liquidity: realToken?.liquidityUsd
      });

      // Skip honeypot check for pumps to act faster
      console.log('⚡ Skipping honeypot check for pump token (speed optimization)');

      // Track analyzed pump token with detailed reason
      const pumpReason = `PUMP: strength ${pumpSignal.pumpStrength.toFixed(1)}, signals: ${pumpSignal.signals.join(', ')}`;
      this.trackAnalyzedToken(tokenInfo, securityAnalysis.score, 'PUMP', pumpReason);

      // Process with simulation engine - HIGH PRIORITY
      console.log(`🚨 ABOUT TO PASS PUMP TOKEN TO SIMULATION ENGINE:`);
      console.log(`   Token: ${tokenInfo.symbol || 'Unknown'} (${tokenInfo.mint.slice(0, 8)})`);
      console.log(`   Security Score: ${securityAnalysis.score} (boosted for pump)`);
      console.log(`   Pump Strength: ${pumpSignal.pumpStrength}`);
      console.log(`   Price Available: ${!!tokenInfo.metadata?.priceUsd || !!tokenInfo.metadata?.price}`);
      console.log(`   Simulation Engine: ${this.simulationEngine.constructor.name}`);
      
      await this.simulationEngine.processTokenDetection(tokenInfo, securityAnalysis);
      
      console.log(`✅ PUMP TOKEN SIMULATION ENGINE CALL COMPLETED for ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);

    } catch (error) {
      this.stats.errors++;
      console.error('❌ Error during pump token analysis:', error);
      logger.error('Pump token analysis failed', {
        mint: tokenInfo.mint,
        pumpStrength: pumpSignal.pumpStrength,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private startDemoMode(): void {
    // Only start demo mode if explicitly enabled
    if (!this.analyzerConfig.enableDemoMode) {
      console.log('🎯 Demo mode disabled - using real token detection only');
      return;
    }
    
    console.log('🎮 Demo mode enabled for testing - generating simulated token detections');
    console.log(`🔍 isRunning status: ${this.isRunning}`);
    
    let demoCounter = 1;
    const demoInterval = setInterval(() => {
      console.log(`🎮 Demo interval triggered - isRunning: ${this.isRunning}, counter: ${demoCounter}`);
      
      if (!this.isRunning) {
        console.log('⚠️ Demo mode stopped - isRunning is false');
        clearInterval(demoInterval);
        return;
      }

      const demoToken: TokenInfo = {
        mint: `DEMO_${Date.now()}_${demoCounter}`,
        symbol: `DEMO${demoCounter}`,
        name: `Demo Token ${demoCounter}`,
        decimals: 9,
        supply: '1000000000',
        signature: `demo_sig_${demoCounter}`,
        timestamp: Date.now(),
        source: 'demo',
        createdAt: Date.now(),
        metadata: {
          demo: true,
          educational: true,
          priceUsd: 0.000001 + Math.random() * 0.00001 // Add a demo price
        },
        liquidity: {
          sol: Math.random() * 50 + 10, // Higher liquidity
          usd: Math.random() * 10000 + 2000 // $2k-12k liquidity
        }
      };

      console.log(`🎯 Demo token detected: ${demoToken.symbol}`);
      console.log(`📊 Demo token details: Price=$${demoToken.metadata?.priceUsd || 'N/A'}, Liquidity=$${demoToken.liquidity?.usd || 0}`);
      console.log(`🚀 Calling analyzeToken for ${demoToken.symbol}...`);
      
      this.analyzeToken(demoToken).then(() => {
        console.log(`✅ analyzeToken completed for ${demoToken.symbol}`);
      }).catch(error => {
        console.error(`❌ analyzeToken failed for ${demoToken.symbol}:`, error);
      });
      
      demoCounter++;
    }, 5000); // Changed to 5 seconds for testing
    
    console.log('✅ Demo mode interval started');
  }

  private logStats(): void {
    const runtime = (Date.now() - this.stats.startTime) / 1000 / 60; // minutes
    const successRate = this.stats.totalProcessed > 0 ? (this.stats.totalViable / this.stats.totalProcessed) * 100 : 0;
    const tokensPerMinute = runtime > 0 ? this.stats.totalDetected / runtime : 0;
    const queueStats = this.getProcessingQueueStats();

    console.log('\\n📊 === UNIFIED ANALYZER STATS ===');
    console.log(`🔍 Mode: ${this.analyzerConfig.mode.toUpperCase()}`);
    console.log(`🔍 Tokens detected: ${this.stats.totalDetected}`);
    console.log(`🔬 Tokens processed: ${this.stats.totalProcessed}`);
    console.log(`✅ Viable tokens: ${this.stats.totalViable}`);
    console.log(`💰 Positions taken: ${this.stats.totalPositions}`);
    console.log(`📈 Success rate: ${successRate.toFixed(2)}%`);
    console.log(`⚡ Detection rate: ${tokensPerMinute.toFixed(2)} tokens/min`);
    console.log(`⚠️ Errors: ${this.stats.errors}`);
    console.log(`⏱️ Runtime: ${runtime.toFixed(2)} minutes`);
    
    // Queue statistics
    console.log(`📋 Queue length: ${queueStats.queueLength}`);
    console.log(`🎯 Avg priority: ${queueStats.avgPriority.toFixed(1)}`);
    console.log(`⏰ Oldest item age: ${Math.round(queueStats.oldestItemAge / 1000)}s`);
    
    if (Object.keys(queueStats.priorityBreakdown).length > 0) {
      console.log(`📊 Priority breakdown: ${JSON.stringify(queueStats.priorityBreakdown)}`);
    }
    if (Object.keys(queueStats.sourceBreakdown).length > 0) {
      console.log(`📡 Source breakdown: ${JSON.stringify(queueStats.sourceBreakdown)}`);
    }
    
    console.log('=====================================\\n');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Analyzer is already running');
      return;
    }

    try {
      console.log('🚀 Starting Unified Educational Token Analyzer...');
      
      // Clean logs on startup
      console.log('🧹 Performing startup log cleanup...');
      await this.logCleaner.cleanLogs(true);
      
      // Update SOL price if real prices are enabled
      if (this.analyzerConfig.enableRealPrices) {
        await this.priceConverter.updateSolPrice();
        this.priceConverter.startAutoUpdate();
      }
      
      // Start connection monitoring
      this.connectionMonitor.startMonitoring(10000);
      
      // Start dashboard
      await this.dashboard.start();
      
      // Start pump detector if enabled
      if (this.pumpDetector) {
        await this.pumpDetector.start();
      }
      
      // Start real token monitor if enabled
      if (this.realTokenMonitor) {
        await this.realTokenMonitor.start();
      }
      
      // Start rapid analyzer if enabled
      if (this.rapidAnalyzer) {
        await this.rapidAnalyzer.startAnalyzing();
      }
      
      this.isRunning = true;
      
      logger.info('Unified Educational Token Analyzer started successfully', {
        mode: this.analyzerConfig.mode,
        enablePumpDetection: this.analyzerConfig.enablePumpDetection,
        enableRealPrices: this.analyzerConfig.enableRealPrices,
        enableDemoMode: this.analyzerConfig.enableDemoMode,
        educational: true
      });
      
      console.log('✅ Unified Educational Token Analyzer is running');
      console.log('📊 Dashboard: http://localhost:3000');
      console.log('🎓 This is an educational simulation - no real trading occurs');
      
      // Show configuration
      console.log('\\n🔧 CONFIGURATION:');
      console.log(`• Mode: ${this.analyzerConfig.mode.toUpperCase()}`);
      console.log(`• Pump Detection: ${this.analyzerConfig.enablePumpDetection ? 'ENABLED' : 'DISABLED'}`);
      console.log(`• Real Prices: ${this.analyzerConfig.enableRealPrices ? 'ENABLED' : 'DISABLED'}`);
      console.log(`• Multi-DEX: ${this.analyzerConfig.enableMultiDex ? 'ENABLED' : 'DISABLED'}`);
      console.log(`• Demo Mode: ${this.analyzerConfig.enableDemoMode ? 'ENABLED' : 'DISABLED - REAL TOKENS ONLY'}`);
      
      // Start demo mode if enabled
      this.startDemoMode();
      
      // Log stats every 60 seconds
      setInterval(() => {
        this.logStats();
      }, 60000);
      
    } catch (error) {
      console.error('❌ Failed to start analyzer:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    try {
      console.log('🛑 Stopping connection monitoring...');
      this.connectionMonitor.stopMonitoring();
      
      if (this.rapidAnalyzer) {
        console.log('🛑 Stopping rapid analyzer...');
        await this.rapidAnalyzer.stopAnalyzing();
      }
      
      if (this.realTokenMonitor) {
        console.log('🛑 Stopping real token monitor...');
        await this.realTokenMonitor.stop();
      }
      
      if (this.pumpDetector) {
        console.log('🛑 Stopping pump detector...');
        await this.pumpDetector.stop();
      }
      
      console.log('🛑 Stopping dashboard...');
      await this.dashboard.stop();
      
      console.log('🛑 Cleaning up connection manager...');
      await this.connectionManager.cleanup();
      
      logger.info('Unified Educational Token Analyzer stopped');
      console.log('✅ Unified Educational Token Analyzer stopped successfully');
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  getStats() {
    const portfolioStats = this.simulationEngine.getPortfolioStats();
    const rapidStats = this.rapidAnalyzer?.getStats();
    const realStats = this.realTokenMonitor?.getMonitoringStats();
    const pumpStats = this.pumpDetector?.getStats();
    
    return {
      isRunning: this.isRunning,
      mode: this.analyzerConfig.mode,
      unified: {
        totalDetected: this.stats.totalDetected,
        totalProcessed: this.stats.totalProcessed,
        totalViable: this.stats.totalViable,
        totalPositions: this.stats.totalPositions,
        errors: this.stats.errors,
        successRate: this.stats.totalProcessed > 0 ? (this.stats.totalViable / this.stats.totalProcessed) * 100 : 0,
        runtime: (Date.now() - this.stats.startTime) / 1000 / 60
      },
      processingQueue: this.getProcessingQueueStats(),
      portfolio: portfolioStats,
      rapid: rapidStats,
      real: realStats,
      pump: pumpStats,
      activePositions: this.simulationEngine.getActivePositions().length,
      totalTrades: this.simulationEngine.getRecentTrades(1000).length,
      tokens: {
        found: this.foundTokens.size,
        analyzed: this.analyzedTokens.size
      },
      connection: this.connectionManager.getQueueStatus()
    };
  }

  private getProcessingQueueStats() {
    const priorityBreakdown = this.processingQueue.reduce((acc, item) => {
      const priority = Math.floor(item.priority);
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const sourceBreakdown = this.processingQueue.reduce((acc, item) => {
      const source = item.tokenInfo.source || 'unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const oldestItem = this.processingQueue.length > 0 ? this.processingQueue[this.processingQueue.length - 1] : null;
    const newestItem = this.processingQueue.length > 0 ? this.processingQueue[0] : null;

    return {
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessingQueue,
      priorityBreakdown,
      sourceBreakdown,
      oldestItemAge: oldestItem ? Date.now() - oldestItem.timestamp : 0,
      newestItemAge: newestItem ? Date.now() - newestItem.timestamp : 0,
      avgPriority: this.processingQueue.length > 0 ? 
        this.processingQueue.reduce((sum, item) => sum + item.priority, 0) / this.processingQueue.length : 0
    };
  }

  // Dashboard integration methods
  getFoundTokens() {
    return Array.from(this.foundTokens.values())
      .sort((a, b) => b.foundAt - a.foundAt)
      .slice(0, 50);
  }

  getAnalyzedTokens() {
    return Array.from(this.analyzedTokens.values())
      .sort((a, b) => b.analyzedAt - a.analyzedAt)
      .slice(0, 50);
  }
}

// Configuration presets
const ANALYZER_PRESETS = {
  rapid: {
    mode: 'rapid' as const,
    enablePumpDetection: false,
    enableRealPrices: false,
    enableDemoMode: false,
    enableMultiDex: true
  },
  real: {
    mode: 'real' as const,
    enablePumpDetection: true,
    enableRealPrices: true,
    enableDemoMode: false,
    enableMultiDex: false
  },
  hybrid: {
    mode: 'hybrid' as const,
    enablePumpDetection: true,
    enableRealPrices: true,
    enableDemoMode: false,
    enableMultiDex: true
  },
  sniper: {
    mode: 'sniper' as const,
    enablePumpDetection: true,
    enableRealPrices: true,
    enableDemoMode: false,
    enableMultiDex: true,
    enableUltraSniper: true
  },
  demo: {
    mode: 'rapid' as const,
    enablePumpDetection: false,
    enableRealPrices: false,
    enableDemoMode: true,
    enableMultiDex: false
  }
};

// Main execution
async function main() {
  try {
    // Determine mode from command line arguments or environment
    const mode = process.argv[2] || process.env.ANALYZER_MODE || 'hybrid';
    
    if (!ANALYZER_PRESETS[mode as keyof typeof ANALYZER_PRESETS]) {
      console.error(`❌ Invalid mode: ${mode}. Available modes: ${Object.keys(ANALYZER_PRESETS).join(', ')}`);
      process.exit(1);
    }
    
    const config = ANALYZER_PRESETS[mode as keyof typeof ANALYZER_PRESETS];
    const analyzer = new UnifiedTokenAnalyzer(config);
    
    await analyzer.start();
    
    console.log('\\n🎯 UNIFIED ANALYZER FEATURES:');
    console.log('• Multi-mode operation (rapid/real/hybrid)');
    console.log('• Advanced pump detection system');
    console.log('• Real-time price tracking');
    console.log('• Multi-DEX monitoring');
    console.log('• Enhanced connection management');
    console.log('• Comprehensive error handling');
    console.log('• Educational simulation only');
    
  } catch (error) {
    console.error('❌ Failed to start Unified Educational Token Analyzer:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}

export { UnifiedTokenAnalyzer, ANALYZER_PRESETS };