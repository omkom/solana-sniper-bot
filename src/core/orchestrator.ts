/**
 * Main Orchestrator
 * Coordinates all systems for hyper-efficient token sniping
 * Maintains educational boundaries while demonstrating advanced techniques
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { Config } from './config';
import { ConnectionPool } from './connection-pool';
import { UnifiedDetector } from '../detection/unified-detector';
import { BlockchainAnalyzer } from '../detection/blockchain-analyzer';
import { MempoolScanner } from '../detection/mempool-scanner';
import { SecurityScanner } from '../analysis/security-scanner';
import { SimulationEngine } from '../trading/simulation-engine';
import { ExecutionEngine } from '../trading/execution-engine';
import { ExitStrategy } from '../trading/exit-strategy';
import { WebSocketServer } from '../monitoring/websocket-server';
import { TokenActionLogger } from '../monitoring/token-action-logger';
import { PerformanceProfiler } from '../utils/performance-profiler';
import { RateLimiter } from '../utils/rate-limiter';
import { UnifiedTokenInfo, DetectionConfig, TradingStrategy, ExitStrategyConfig, SecurityInfo } from '../types/unified';

interface OrchestratorConfig {
  // Detection configuration
  detection: DetectionConfig;
  
  // Trading configuration
  trading: TradingStrategy;
  
  // Exit strategy configuration
  exitStrategy: ExitStrategyConfig;
  
  // Performance settings
  performance: {
    maxLatency: number;
    parallelProcessing: boolean;
    maxParallelDetections: number;
    maxSimultaneousSimulations: number;
    connectionPoolSize: number;
  };
  
  // Risk management
  riskManagement: {
    maxPositions: number;
    maxPositionSize: number;
    dailyLossLimit: number;
    autoStopConditions: string[];
  };
  
  // Educational boundaries
  educational: {
    dryRunMode: boolean;
    maxTestDuration: number;
    logAllDecisions: boolean;
    explainStrategies: boolean;
  };
}

export class Orchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private isRunning = false;
  private startTime = 0;
  
  // Core systems
  private connectionPool!: ConnectionPool;
  private detector!: UnifiedDetector;
  private blockchainAnalyzer!: BlockchainAnalyzer;
  private mempoolScanner!: MempoolScanner;
  private securityScanner!: SecurityScanner;
  private simulationEngine!: SimulationEngine;
  private executionEngine!: ExecutionEngine;
  private exitStrategy!: ExitStrategy;
  private webSocketServer!: WebSocketServer;
  private actionLogger!: TokenActionLogger;
  
  // Utilities
  private performanceProfiler!: PerformanceProfiler;
  private rateLimiter!: RateLimiter;
  
  // Performance tracking
  private metrics = {
    tokensDetected: 0,
    tokensAnalyzed: 0,
    positionsOpened: 0,
    positionsClosed: 0,
    totalProfit: 0,
    averageLatency: 0,
    successRate: 0
  };

  constructor(config: Partial<OrchestratorConfig> = {}) {
    super();
    
    // Load base config
    const baseConfig = Config.getInstance().getConfig();
    
    this.config = {
      detection: {
        sources: {
          blockchain: {
            rpcEndpoints: [baseConfig.rpc.primary, baseConfig.rpc.secondary],
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
        minLiquidity: baseConfig.minLiquiditySol * 1000,
        maxAge: baseConfig.maxAnalysisAge,
        minConfidence: baseConfig.minConfidenceScore,
        filterHoneypots: false,
        filterRugs: false
      },
      
      trading: {
        simulation: {
          enabledFor: 'TOKENS_UNDER_10_MINUTES',
          amount: 0.003,
          parallelSimulations: 5
        },
        analysis: {
          timeWindow: 10800000,
          metricsTracked: ['volume', 'holders', 'priceAction', 'socialSignals']
        },
        execution: {
          mode: 'AGGRESSIVE',
          slippage: 30,
          gasMultiplier: 1.5
        }
      },
      
      exitStrategy: {
        targetROI: {
          primary: 100,
          trailing: true
        },
        bagManagement: {
          initialSell: 90,
          holdPercentage: 10,
          microSells: true
        },
        rugPullProtection: {
          liquidityMonitoring: 'REAL_TIME',
          ownerActivityTracking: true,
          exitTriggers: [
            'LIQUIDITY_REMOVAL_DETECTED',
            'LARGE_HOLDER_DUMP',
            'SOCIAL_SENTIMENT_CRASH'
          ],
          maxExitTime: 100
        }
      },
      
      performance: {
        maxLatency: 50,
        parallelProcessing: true,
        maxParallelDetections: 50,
        maxSimultaneousSimulations: 10,
        connectionPoolSize: 20
      },
      
      riskManagement: {
        maxPositions: 10,
        maxPositionSize: 0.01,
        dailyLossLimit: 0.1,
        autoStopConditions: [
          'DAILY_LOSS_EXCEEDED',
          'UNUSUAL_NETWORK_ACTIVITY',
          'RPC_DEGRADATION'
        ]
      },
      
      educational: {
        dryRunMode: true, // ALWAYS true for educational purposes
        maxTestDuration: 24 * 60 * 60 * 1000, // 24 hours max
        logAllDecisions: true,
        explainStrategies: true
      },
      
      ...config
    };

    // Force educational mode for safety
    this.config.educational.dryRunMode = true;
    
    this.initializeSystems();
    this.setupEventHandlers();
    
    logger.info('🎯 Orchestrator initialized with hyper-efficient configuration', {
      maxLatency: this.config.performance.maxLatency,
      maxPositions: this.config.riskManagement.maxPositions,
      dryRunMode: this.config.educational.dryRunMode
    });
  }

  private initializeSystems(): void {
    // Initialize utilities first
    this.performanceProfiler = new PerformanceProfiler();
    this.rateLimiter = new RateLimiter();
    
    // Initialize connection pool
    this.connectionPool = new ConnectionPool({
      endpoints: this.config.detection.sources.blockchain.rpcEndpoints,
      poolSize: this.config.performance.connectionPoolSize,
      healthCheckInterval: 30000,
      maxRetries: 3
    });
    
    // Initialize detection systems
    this.detector = new UnifiedDetector({
      enableRaydium: true,
      enablePumpFun: true,
      enableDexScreener: this.config.detection.sources.dexScreener.enabled,
      enableMultiDex: true,
      enableRealTime: true,
      minLiquidity: 1000,
      maxAge: 600000, // 10 minutes for aggressive sniping
      minConfidence: 5, // Very permissive for maximum coverage
      scanInterval: 30000, // 30 second intervals
      maxConcurrentRequests: this.config.performance.maxParallelDetections
    });
    
    this.blockchainAnalyzer = new BlockchainAnalyzer(this.connectionPool);
    this.mempoolScanner = new MempoolScanner(this.connectionPool);
    
    // Initialize analysis systems
    this.securityScanner = new SecurityScanner(this.connectionPool, {
      infoOnly: true, // Never filter tokens, only provide security info
      comprehensiveAnalysis: true,
      realTimeMonitoring: true
    });
    
    // Initialize trading systems
    this.simulationEngine = new SimulationEngine();
    
    this.executionEngine = new ExecutionEngine();
    
    this.exitStrategy = new ExitStrategy();
    
    // Initialize monitoring
    this.webSocketServer = new WebSocketServer(3001);
    this.actionLogger = new TokenActionLogger(this.webSocketServer);
  }

  private setupEventHandlers(): void {
    // Detection events
    this.detector.on('tokenDetected', this.handleTokenDetected.bind(this));
    this.detector.on('detectionResult', this.updateDetectionMetrics.bind(this));
    
    // Blockchain analysis events
    this.blockchainAnalyzer.on('tokenLaunch', this.handleTokenLaunch.bind(this));
    this.mempoolScanner.on('pendingLaunch', this.handlePendingLaunch.bind(this));
    
    // Security analysis events
    this.securityScanner.on('analysisComplete', this.handleSecurityAnalysis.bind(this));
    
    // Trading events
    this.simulationEngine.on('positionOpened', this.handlePositionOpened.bind(this));
    this.simulationEngine.on('positionClosed', this.handlePositionClosed.bind(this));
    this.simulationEngine.on('tradeExecuted', this.handleTradeExecuted.bind(this));
    
    // Exit strategy events
    this.exitStrategy.on('exitSignal', this.handleExitSignal.bind(this));
    this.exitStrategy.on('rugPullDetected', this.handleRugPullDetected.bind(this));
    
    // Performance events
    this.performanceProfiler.on('latencyAlert', this.handleLatencyAlert.bind(this));
    this.rateLimiter.on('rateLimitExceeded', this.handleRateLimitExceeded.bind(this));
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Orchestrator already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    
    logger.info('🚀 Starting hyper-efficient token sniping orchestrator...');
    
    try {
      // Start systems in optimal order
      await this.startSystems();
      
      // Verify all systems are operational
      await this.performSystemsCheck();
      
      this.emit('started');
      logger.info('✅ Orchestrator fully operational - Ready for hyper-efficient token sniping!');
      
      // Log educational reminder
      logger.info('📚 EDUCATIONAL MODE: All trading is simulated for learning purposes');
      
    } catch (error) {
      logger.error('❌ Failed to start orchestrator:', error);
      this.isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }

  private async startSystems(): Promise<void> {
    const startPromises: Promise<void>[] = [];
    
    // Start connection pool first
    startPromises.push(this.connectionPool.start());
    
    // Start detection systems
    startPromises.push(this.detector.start());
    startPromises.push(this.blockchainAnalyzer.start());
    startPromises.push(this.mempoolScanner.start());
    
    // Start analysis systems
    startPromises.push(this.securityScanner.start());
    
    // Start trading systems
    startPromises.push(this.simulationEngine.start());
    startPromises.push(this.executionEngine.start());
    startPromises.push(this.exitStrategy.start());
    
    // Start monitoring
    startPromises.push(this.webSocketServer.start());
    this.actionLogger.start();
    
    // Start utilities
    this.performanceProfiler.start();
    this.rateLimiter.start();
    
    await Promise.all(startPromises);
  }

  private async performSystemsCheck(): Promise<void> {
    const healthChecks = [
      this.connectionPool.healthCheck(),
      this.detector.healthCheck(),
      this.simulationEngine.healthCheck(),
      this.webSocketServer.healthCheck()
    ];
    
    const results = await Promise.all(healthChecks);
    const failedChecks = results.filter(result => !result);
    
    if (failedChecks.length > 0) {
      throw new Error(`System health check failed: ${failedChecks.length} systems unhealthy`);
    }
    
    logger.info('✅ All systems healthy and operational');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('🛑 Stopping orchestrator...');
    
    try {
      // Stop systems in reverse order
      await this.stopSystems();
      
      this.emit('stopped');
      logger.info('🛑 Orchestrator stopped successfully');
      
    } catch (error) {
      logger.error('Error stopping orchestrator:', error);
      throw error;
    }
  }

  private async stopSystems(): Promise<void> {
    const stopPromises: Promise<void>[] = [];
    
    // Stop utilities
    this.performanceProfiler.stop();
    this.rateLimiter.stop();
    
    // Stop monitoring
    this.actionLogger.stop();
    stopPromises.push(this.webSocketServer.stop());
    
    // Stop trading systems
    stopPromises.push(this.exitStrategy.stop());
    stopPromises.push(this.executionEngine.stop());
    stopPromises.push(this.simulationEngine.stop());
    
    // Stop analysis systems
    stopPromises.push(this.securityScanner.stop());
    
    // Stop detection systems
    stopPromises.push(this.mempoolScanner.stop());
    stopPromises.push(this.blockchainAnalyzer.stop());
    stopPromises.push(this.detector.stop());
    
    // Stop connection pool last
    stopPromises.push(this.connectionPool.stop());
    
    await Promise.all(stopPromises);
  }

  // Event Handlers
  private async handleTokenDetected(tokens: UnifiedTokenInfo[]): Promise<void> {
    const processingStart = this.performanceProfiler.startTimer();
    
    try {
      for (const token of tokens) {
        this.metrics.tokensDetected++;
        
        // Log token detection action
        this.actionLogger.logTokenDetected(token.address, token.symbol, {
          name: token.name,
          price: token.metadata?.priceUsd,
          volume: token.metadata?.volume24h,
          liquidity: token.liquidity?.usd,
          source: token.source,
          dex: token.metadata?.dex
        });
        
        // Emit real-time event
        this.webSocketServer.emit('token:detected', {
          ...token,
          detectionLatency: Date.now() - token.detectedAt
        });
        
        // Start parallel analysis and trading evaluation
        await Promise.all([
          this.analyzeTokenSecurity(token),
          this.evaluateTradeOpportunity(token)
        ]);
      }
    } catch (error) {
      logger.error('Error handling token detection:', error);
      
      // Log error for each token
      for (const token of tokens) {
        this.actionLogger.logError(token.address, token.symbol, error.message, {
          name: token.name
        });
      }
    } finally {
      const latency = processingStart();
      this.updateAverageLatency(latency);
    }
  }

  private async handleTokenLaunch(launch: any): Promise<void> {
    logger.info(`🚀 Token launch detected: ${launch.token.symbol}`, {
      address: launch.token.address,
      dex: launch.dex,
      liquidity: launch.liquidity
    });
    
    // Fast-track high-priority tokens
    await this.evaluateTradeOpportunity(launch.token, { priority: 'HIGH' });
  }

  private async handlePendingLaunch(pending: any): Promise<void> {
    logger.info(`⏳ Pre-launch detection: ${pending.token.symbol}`, {
      address: pending.token.address,
      estimatedLaunch: pending.estimatedLaunch
    });
    
    // Pre-analyze token for instant execution when launch confirms
    await this.analyzeTokenSecurity(pending.token);
  }

  private async handleSecurityAnalysis(result: { token: UnifiedTokenInfo; analysis: SecurityInfo }): Promise<void> {
    this.metrics.tokensAnalyzed++;
    
    // Log token analysis action
    this.actionLogger.logTokenAnalyzed(result.token.address, result.token.symbol, {
      name: result.token.name,
      securityScore: result.analysis.score,
      price: result.token.metadata?.priceUsd,
      reason: `Security analysis completed - Score: ${result.analysis.score}/100 (${result.analysis.recommendation})`
    });
    
    // Emit security analysis (info only, no filtering)
    this.webSocketServer.emit('token:analyzed', {
      ...result.token,
      securityInfo: result.analysis
    });
    
    if (this.config.educational.explainStrategies) {
      logger.info(`🔒 Security analysis complete: ${result.token.symbol}`, {
        score: result.analysis.score,
        recommendation: result.analysis.recommendation,
        flags: result.analysis.flags
      });
    }
  }

  private async handlePositionOpened(position: any): Promise<void> {
    this.metrics.positionsOpened++;
    
    // Log buy action
    this.actionLogger.logTradeBuy(position.token.address, position.token.symbol, {
      name: position.token.name,
      amount: position.amount,
      price: position.entryPrice,
      reason: `Position opened with ${position.strategy} strategy`
    });
    
    logger.info(`📈 Position opened: ${position.token.symbol}`, {
      size: position.amount,
      price: position.entryPrice,
      strategy: position.strategy
    });
    
    this.webSocketServer.emit('position:opened', position);
  }

  private async handlePositionClosed(position: any): Promise<void> {
    this.metrics.positionsClosed++;
    this.metrics.totalProfit += position.pnl || 0;
    
    // Log sell action
    this.actionLogger.logTradeSell(position.token.address, position.token.symbol, {
      name: position.token.name,
      amount: position.amount,
      price: position.exitPrice,
      roi: position.roi,
      reason: `Position closed: ${position.exitReason}`
    });
    
    logger.info(`📉 Position closed: ${position.token.symbol}`, {
      pnl: position.pnl,
      roi: position.roi,
      holdTime: position.exitTime - position.entryTime,
      reason: position.exitReason
    });
    
    this.webSocketServer.emit('position:closed', position);
  }

  private async handleTradeExecuted(trade: any): Promise<void> {
    this.webSocketServer.emit('trade:executed', trade);
    
    if (this.config.educational.logAllDecisions) {
      logger.info(`💫 Trade executed: ${trade.type} ${trade.token.symbol}`, {
        amount: trade.amount,
        price: trade.price,
        reason: trade.reason
      });
    }
  }

  private async handleExitSignal(signal: any): Promise<void> {
    logger.info(`🚨 Exit signal: ${signal.token.symbol}`, {
      reason: signal.reason,
      urgency: signal.urgency,
      recommendedAction: signal.action
    });
    
    // Execute exit strategy
    await this.simulationEngine.handleExitSignal(signal);
  }

  private async handleRugPullDetected(alert: any): Promise<void> {
    // Log rugpull alert
    this.actionLogger.logAlert(alert.token.address, alert.token.symbol, {
      name: alert.token.name,
      reason: `RUG PULL DETECTED - Confidence: ${alert.confidence}%`,
      severity: 'CRITICAL'
    });
    
    logger.warn(`🚨 RUG PULL DETECTED: ${alert.token.symbol}`, {
      indicators: alert.indicators,
      confidence: alert.confidence
    });
    
    this.webSocketServer.emit('alert:rugpull', {
      tokenAddress: alert.token.address,
      action: 'EMERGENCY_EXIT'
    });
    
    // Execute emergency exit
    await this.simulationEngine.emergencyExit(alert.token.address);
  }

  private handleLatencyAlert(alert: any): void {
    logger.warn(`⚠️ High latency detected: ${alert.latency}ms`, {
      system: alert.system,
      threshold: alert.threshold
    });
    
    // Implement latency mitigation strategies
    this.optimizeForLatency();
  }

  private handleRateLimitExceeded(info: any): void {
    logger.warn(`⚠️ Rate limit exceeded: ${info.endpoint}`, {
      current: info.current,
      limit: info.limit
    });
    
    // Implement backoff strategy
    this.rateLimiter.applyBackoff(info.endpoint);
  }

  // Core processing methods
  private async analyzeTokenSecurity(token: UnifiedTokenInfo): Promise<void> {
    try {
      await this.securityScanner.analyzeToken(token);
    } catch (error) {
      logger.error(`Error analyzing token security ${token.symbol}:`, error);
    }
  }

  private async evaluateTradeOpportunity(token: UnifiedTokenInfo, options: { priority?: string } = {}): Promise<void> {
    try {
      // Check if token is within age limit for aggressive sniping
      const tokenAge = Date.now() - token.detectedAt;
      const maxAge = this.config.trading.analysis.timeWindow || 600000; // 10 minutes
      
      if (tokenAge > maxAge) {
        logger.debug(`Token too old for aggressive sniping: ${token.symbol} (${tokenAge}ms)`);
        return;
      }
      
      // Evaluate with simulation engine
      await this.simulationEngine.processToken(token);
      
    } catch (error) {
      logger.error(`Error evaluating trade opportunity ${token.symbol}:`, error);
    }
  }

  private optimizeForLatency(): void {
    // Implement dynamic optimization strategies
    logger.info('🔧 Applying latency optimization strategies...');
    
    // Reduce concurrent operations
    const currentConnections = this.connectionPool.getActiveConnections();
    if (currentConnections > 10) {
      this.connectionPool.scaleDown(Math.floor(currentConnections * 0.8));
    }
    
    // Increase rate limiting
    this.rateLimiter.increaseDelay(0.1); // 10% increase
  }

  private updateDetectionMetrics(result: any): void {
    if (result.detectedCount > 0) {
      this.metrics.tokensDetected += result.detectedCount;
    }
  }

  private updateAverageLatency(latency: number): void {
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
  }

  // Public API
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      metrics: this.metrics,
      systems: {
        connectionPool: this.connectionPool.getStatus(),
        detector: this.detector.getStatus(),
        simulationEngine: this.simulationEngine.getStatus(),
        webSocketServer: this.webSocketServer.getStatus()
      },
      config: {
        maxLatency: this.config.performance.maxLatency,
        maxPositions: this.config.riskManagement.maxPositions,
        dryRunMode: this.config.educational.dryRunMode
      }
    };
  }

  getMetrics(): any {
    return {
      ...this.metrics,
      successRate: this.metrics.positionsClosed > 0 ? 
        (this.metrics.totalProfit > 0 ? 1 : 0) * 100 : 0
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isRunning) return false;
    
    try {
      await this.performSystemsCheck();
      return true;
    } catch {
      return false;
    }
  }
}