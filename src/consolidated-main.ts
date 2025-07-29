/**
 * Consolidated Main Entry Point
 * Uses all consolidated classes to create a unified, efficient system
 */

import { EventEmitter } from 'events';
import { logger } from './monitoring/logger';
import { launchLogger } from './utils/launch-logger';
import { ConsolidatedTokenDetector } from './detection/consolidated-token-detector';
import { ConsolidatedSimulationEngine } from './simulation/consolidated-simulation-engine';
import { ConsolidatedDashboard } from './monitoring/consolidated-dashboard';
import { ConsolidatedApiService } from './services/consolidated-api-service';
import { UnifiedTokenInfo } from './types/unified';
import { UnifiedEngine } from './simulation/unified-engine';

export interface AppConfig {
  mode: 'rapid' | 'real' | 'analysis' | 'unified';
  startingBalance: number;
  baseInvestment: number;
  maxPositions: number;
  dashboardPort: number;
  enabledFeatures: {
    detection: boolean;
    simulation: boolean;
    dashboard: boolean;
    priceTracking: boolean;
    migration: boolean;
    analytics: boolean;
  };
}

export class ConsolidatedTokenAnalyzer extends EventEmitter {
  private config: AppConfig;
  private detector!: ConsolidatedTokenDetector;
  private simulationEngine!: ConsolidatedSimulationEngine;
  private unifiedEngine!: UnifiedEngine;
  private dashboard!: ConsolidatedDashboard;
  private apiService!: ConsolidatedApiService;
  private isRunning = false;
  private initialized = false;
  private startTime = Date.now();
  private statusInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<AppConfig> = {}) {
    super();
    
    // Initialize launch logging
    launchLogger.logStartupPhase('CONSTRUCTOR STARTED');
    launchLogger.logEnvironmentInfo();
    
    this.config = {
      mode: 'unified',
      startingBalance: 10,
      baseInvestment: 0.003,
      maxPositions: 500,
      dashboardPort: 3000,
      enabledFeatures: {
        detection: true,
        simulation: true,
        dashboard: true,
        priceTracking: true,
        migration: true,
        analytics: true
      },
      ...config
    };

    launchLogger.logConfigurationLoaded(this.config);
    launchLogger.logStartupPhase('WELCOME MESSAGE');
    this.logWelcome();
    
    launchLogger.logStartupPhase('COMPONENT INITIALIZATION');
    this.initializeComponents();
  }

  private getUnifiedEngineConfig(): any {
    return {
      mode: 'DRY_RUN',
      startingBalance: this.config.startingBalance,
      baseInvestment: this.config.baseInvestment,
      maxPositions: Math.min(this.config.maxPositions, 5), // Limit for unified engine
      positionSizePercent: 5, // Conservative 5% per position
      maxRiskPercent: 2,
      updateInterval: 3000, // 3 second updates for more responsive trading
      strategies: ['momentum', 'breakout'], // Enable specific strategies
      exitStrategies: {
        targetROI: 50,
        stopLossPercent: -15,
        trailingStopPercent: -8,
        maxHoldTime: 1800000 // 30 minutes max hold
      }
    };
  }

  private logWelcome(): void {
    console.log('\n🎓 ===== EDUCATIONAL SOLANA TOKEN ANALYZER =====');
    console.log('📚 This system is for educational purposes only');
    console.log('🔒 All trading is simulated - no real funds at risk');
    console.log(`🎯 Mode: ${this.config.mode.toUpperCase()}`);
    console.log(`💰 Starting Balance: ${this.config.startingBalance} SOL`);
    console.log(`📊 Dashboard: http://localhost:${this.config.dashboardPort}`);
    
    // Enhanced Codespaces integration
    if (process.env.CODESPACES) {
      const codespaceUrl = `https://${process.env.CODESPACE_NAME}-${this.config.dashboardPort}.app.github.dev`;
      console.log(`🌐 Codespaces URL: ${codespaceUrl}`);
      console.log('🚀 Port forwarding will be automatic in GitHub Codespaces');
      
      // Auto-open browser in Codespaces if enabled
      if (process.env.AUTO_OPEN_BROWSER === 'true') {
        this.autoOpenBrowser(codespaceUrl);
      }
    }
    
    console.log('===============================================\n');
  }

  private async autoOpenBrowser(url: string): Promise<void> {
    // Disable auto-open functionality due to ES module compatibility issues
    // Just provide the URL for manual opening
    console.log(`🌐 Please manually open: ${url}`);
    logger.info(`Dashboard URL provided: ${url}`);
  }

  private initializeComponents(): void {
    try {
      // Initialize API service first
      launchLogger.logComponentInit('ConsolidatedApiService', 'STARTING');
      this.apiService = new ConsolidatedApiService(this.getApiServiceConfig());
      launchLogger.logComponentInit('ConsolidatedApiService', 'SUCCESS');
      
      // Initialize detector with consolidated configuration
      launchLogger.logComponentInit('ConsolidatedTokenDetector', 'STARTING');
      this.detector = new ConsolidatedTokenDetector(this.getDetectorConfig());
      launchLogger.logComponentInit('ConsolidatedTokenDetector', 'SUCCESS');
      
      // Initialize simulation engine
      launchLogger.logComponentInit('ConsolidatedSimulationEngine', 'STARTING');
      this.simulationEngine = new ConsolidatedSimulationEngine(this.getSimulationConfig());
      launchLogger.logComponentInit('ConsolidatedSimulationEngine', 'SUCCESS');
      
      // Initialize unified engine for advanced trading
      launchLogger.logComponentInit('UnifiedEngine', 'STARTING');
      this.unifiedEngine = new UnifiedEngine(this.getUnifiedEngineConfig());
      launchLogger.logComponentInit('UnifiedEngine', 'SUCCESS');
      
      // Initialize dashboard
      launchLogger.logComponentInit('ConsolidatedDashboard', 'STARTING');
      this.dashboard = new ConsolidatedDashboard(this.getDashboardConfig());
      launchLogger.logComponentInit('ConsolidatedDashboard', 'SUCCESS');
      
      // Setup event handlers
      launchLogger.logStartupPhase('EVENT HANDLERS SETUP');
      this.setupEventHandlers();
      
      this.initialized = true;
      launchLogger.logStartupPhase('COMPONENTS INITIALIZED', { 
        componentsCount: 5,
        memoryUsage: process.memoryUsage()
      });
      logger.info('✅ Consolidated components initialized successfully');
      
    } catch (error) {
      launchLogger.logError('INITIALIZATION', error as Error, { phase: 'component initialization' });
      logger.error('❌ Failed to initialize components:', error);
      throw error;
    }
  }

  private getApiServiceConfig(): any {
    return {
      enableDexScreener: true,
      enableSolscan: false, // Disable to reduce API load
      enableJupiter: false, // Disable to reduce API load
      cacheTimeout: 300000, // 5 minutes cache
      rateLimitDelay: 10000, // 10 second minimum delay
      maxRetries: 2,
      priority: {
        dexscreener: 5,
        solscan: 4,
        jupiter: 3
      }
    };
  }

  private getDetectorConfig(): any {
    const baseConfig = {
      minLiquidity: 1000,
      maxAge: 3600000, // 1 hour
      minConfidence: 5,
      batchSize: 1, // Reduce batch size to 1
      maxConcurrentRequests: 1, // Reduce to 1
      cacheTimeout: 300000, // 5 minute cache
      filterHoneypots: true,
      filterRugs: true,
      enableRealTimeMonitoring: true,
      enableBlockchainScanning: false, // DISABLE blockchain scanning
      enableApiPolling: false // DISABLE API polling
    };

    switch (this.config.mode) {
      case 'rapid':
        return {
          ...baseConfig,
          enabledSources: ['websocket'], // Only websocket to avoid API spam
          scanInterval: 300000, // 5 minutes instead of 30 seconds
          maxConcurrentRequests: 1, // Reduce to 1 to avoid overwhelming APIs
          rateLimitDelay: 15000 // 15 second delay
        };
      
      case 'real':
        return {
          ...baseConfig,
          enabledSources: ['websocket'], // Only websocket for now
          scanInterval: 300000, // 5 minutes instead of 1 minute
          maxConcurrentRequests: 1, // Only 1 concurrent request
          rateLimitDelay: 20000 // 20 second delay
        };
      
      case 'analysis':
        return {
          ...baseConfig,
          enabledSources: ['websocket'], // Only websocket, no API polling
          scanInterval: 300000, // 5 minutes
          maxConcurrentRequests: 1,
          rateLimitDelay: 10000 // 10 second delay
        };
      
      default: // unified
        return {
          ...baseConfig,
          enabledSources: ['websocket'], // ONLY websocket to prevent 429 errors
          scanInterval: 300000, // 5 minutes instead of 90 seconds
          maxConcurrentRequests: 1, // Only 1 concurrent request
          rateLimitDelay: 15000 // 15 second rate limit delay
        };
    }
  }

  private getSimulationConfig(): any {
    const baseConfig = {
      mode: 'DRY_RUN',
      startingBalance: this.config.startingBalance,
      baseInvestment: this.config.baseInvestment,
      maxPositions: this.config.maxPositions,
      minConfidenceScore: 5,
      stopLossPercent: -30,
      takeProfitPercent: 100,
      maxHoldTime: 7200000, // 2 hours
      enableStopLoss: true,
      enableTakeProfit: true,
      riskManagement: {
        maxPositionSize: 0.1,
        maxDailyLoss: 0.05,
        maxDrawdown: 0.2
      }
    };

    switch (this.config.mode) {
      case 'rapid':
        return {
          ...baseConfig,
          maxPositions: 1000,
          baseInvestment: 0.001,
          minConfidenceScore: 1,
          takeProfitPercent: 50
        };
      
      case 'real':
        return {
          ...baseConfig,
          maxPositions: 200,
          baseInvestment: 0.005,
          minConfidenceScore: 10,
          takeProfitPercent: 150
        };
      
      case 'analysis':
        return {
          ...baseConfig,
          maxPositions: 50,
          baseInvestment: 0.01,
          minConfidenceScore: 20,
          takeProfitPercent: 300
        };
      
      default: // unified
        return baseConfig;
    }
  }

  private getDashboardConfig(): any {
    return {
      port: this.config.dashboardPort,
      enableRealTimeUpdates: true,
      enableMetrics: true,
      enableAnalytics: true,
      updateInterval: 30000,
      maxHistorySize: 1000,
      features: this.config.enabledFeatures
    };
  }

  private setupEventHandlers(): void {
    // Token detection events
    this.detector.on('tokensDetected', (tokens: UnifiedTokenInfo[]) => {
      this.handleTokensDetected(tokens);
      
      // Forward to dashboard
      this.dashboard.emit('tokenDetected', tokens);
    });

    this.detector.on('detectionResult', (result: any) => {
      this.dashboard.emit('detectionResult', result);
    });

    this.detector.on('enhancedAnalysis', (analysis: any) => {
      logger.info(`🤖 Enhanced analysis: ${analysis.token.symbol} - ${analysis.recommendation}`);
      this.dashboard.emit('enhancedAnalysis', analysis);
    });

    this.detector.on('poolDetected', (data: any) => {
      logger.info(`🏊 Pool detected: ${data.poolInfo.baseSymbol} on ${data.poolInfo.dexName}`);
      this.dashboard.emit('poolDetected', data);
    });

    this.detector.on('arbitrageOpportunity', (opportunity: any) => {
      logger.info(`⚡ Arbitrage: ${opportunity.profitPotential}% between DEXes`);
      this.dashboard.emit('arbitrageOpportunity', opportunity);
    });

    // Simulation events
    this.simulationEngine.on('positionOpened', (position: any) => {
      logger.info(`📈 Position opened: ${position.token.symbol} (${position.solAmount.toFixed(4)} SOL)`);
      this.dashboard.emit('positionOpened', position);
    });

    this.simulationEngine.on('positionClosed', (data: any) => {
      const { position, realizedPnL, reason } = data;
      logger.info(`📉 Position closed: ${position.token.symbol} - ${reason} - PnL: ${realizedPnL.toFixed(4)} SOL`);
      this.dashboard.emit('positionClosed', data);
    });

    this.simulationEngine.on('portfolioUpdated', (portfolio: any) => {
      this.dashboard.emit('portfolioUpdated', portfolio);
    });

    // Unified Engine events (advanced trading)
    this.unifiedEngine.on('positionOpened', (position: any) => {
      logger.info(`🎯 Advanced position opened: ${position.token.symbol} - ${position.solAmount.toFixed(4)} SOL`);
      this.dashboard.emit('unifiedPositionOpened', position);
    });

    this.unifiedEngine.on('positionClosed', (data: any) => {
      const { position, realizedPnL, reason } = data;
      logger.info(`🎯 Advanced position closed: ${position.token.symbol} - ${reason} - PnL: ${realizedPnL.toFixed(4)} SOL`);
      this.dashboard.emit('unifiedPositionClosed', data);
    });

    this.unifiedEngine.on('portfolioUpdated', (portfolio: any) => {
      this.dashboard.emit('unifiedPortfolioUpdated', portfolio);
    });

    // Error handling
    this.detector.on('error', (error: Error) => {
      logger.error('Detector error:', error);
      this.dashboard.addError(`Detector error: ${error.message}`);
    });

    this.simulationEngine.on('error', (error: Error) => {
      logger.error('Simulation error:', error);
      this.dashboard.addError(`Simulation error: ${error.message}`);
    });

    // API service events
    this.apiService.on('priceUpdate', (data: any) => {
      this.dashboard.emit('priceUpdate', data);
    });

    this.apiService.on('liquidityUpdate', (data: any) => {
      this.dashboard.emit('liquidityUpdate', data);
    });

    this.apiService.on('volumeUpdate', (data: any) => {
      this.dashboard.emit('volumeUpdate', data);
    });
  }

  private async handleTokensDetected(tokens: UnifiedTokenInfo[]): Promise<void> {
    logger.info(`🎯 Processing ${tokens.length} detected tokens`);
    
    // Process each token through both simulation engines
    for (const token of tokens) {
      try {
        // Analyze with basic simulation engine
        await this.simulationEngine.analyzeToken(token);
        
        // Also analyze with advanced unified engine
        await this.unifiedEngine.analyzeToken(token);
      } catch (error) {
        logger.error(`Error analyzing token ${token.symbol}:`, error);
      }
    }
  }

  private startStatusLogging(): void {
    this.statusInterval = setInterval(() => {
      this.logStatus();
    }, 60000); // Every minute
  }

  private stopStatusLogging(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  private logStatus(): void {
    const detectorStatus = this.detector.getStatus();
    const simulationStatus = this.simulationEngine.getStatus();
    const portfolio = this.simulationEngine.getPortfolio();
    const unifiedStatus = this.unifiedEngine.getStatus();
    const unifiedPortfolio = this.unifiedEngine.getPortfolio();
    const uptime = Date.now() - this.startTime;
    const uptimeMinutes = Math.floor(uptime / 60000);

    logger.info('📊 System Status:', {
      mode: this.config.mode,
      uptime: `${uptimeMinutes}m`,
      detectedTokens: detectorStatus.detectedTokensCount,
      // Basic simulation engine
      basicEngine: {
        activePositions: simulationStatus.activePositions,
        balance: `${portfolio.balance.toFixed(4)} SOL`,
        totalValue: `${portfolio.totalValue.toFixed(4)} SOL`,
        netPnL: `${portfolio.netPnL.toFixed(4)} SOL`,
        totalTrades: simulationStatus.totalTrades
      },
      // Advanced unified engine
      advancedEngine: {
        activePositions: unifiedStatus.activePositions,
        balance: `${unifiedPortfolio.balance.toFixed(4)} SOL`,
        totalValue: `${unifiedPortfolio.totalValue.toFixed(4)} SOL`,
        netPnL: `${unifiedPortfolio.netPnL.toFixed(4)} SOL`,
        totalTrades: unifiedStatus.totalTrades,
        winRate: `${unifiedPortfolio.winRate.toFixed(1)}%`
      },
      isRunning: this.isRunning
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      launchLogger.log('WARN', 'START', 'Application already running');
      logger.warn('Application already running');
      return;
    }

    if (!this.initialized) {
      const error = new Error('Components not initialized');
      launchLogger.logError('START', error);
      throw error;
    }

    try {
      launchLogger.logStartupPhase('APPLICATION START', { mode: this.config.mode });
      logger.info(`🚀 Starting Consolidated Token Analyzer in ${this.config.mode.toUpperCase()} mode`);

      // Start components in order
      if (this.config.enabledFeatures.simulation) {
        launchLogger.logComponentInit('SimulationEngine', 'STARTING');
        await this.simulationEngine.start();
        launchLogger.logComponentInit('SimulationEngine', 'SUCCESS');
      }

      // Start unified engine for advanced trading
      launchLogger.logComponentInit('UnifiedEngine-Start', 'STARTING');
      await this.unifiedEngine.start();
      launchLogger.logComponentInit('UnifiedEngine-Start', 'SUCCESS');
      logger.info('✅ Unified Engine started (advanced trading)');

      // Temporarily disable token detection to allow dashboard to start
      // if (this.config.enabledFeatures.detection) {
      //   launchLogger.logComponentInit('TokenDetector-Start', 'STARTING');
      //   await this.detector.start();
      //   launchLogger.logComponentInit('TokenDetector-Start', 'SUCCESS');
      //   logger.info('✅ Token detection enabled and started');
      // }

      if (this.config.enabledFeatures.dashboard) {
        launchLogger.logComponentInit('Dashboard-Start', 'STARTING');
        await this.dashboard.start();
        launchLogger.logComponentInit('Dashboard-Start', 'SUCCESS');
      }

      this.isRunning = true;
      this.startStatusLogging();

      // Log application ready
      const urls = [
        `http://localhost:${this.config.dashboardPort}`,
        ...(process.env.CODESPACES ? [`https://${process.env.CODESPACE_NAME}-${this.config.dashboardPort}.app.github.dev`] : [])
      ];
      launchLogger.logApplicationReady(this.config.dashboardPort, urls);

      logger.info('✅ Consolidated Token Analyzer started successfully');
      this.logStatus();

      this.emit('started');

    } catch (error) {
      launchLogger.logError('START', error as Error, { phase: 'application start' });
      logger.error('❌ Failed to start application:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      launchLogger.log('WARN', 'STOP', 'Application not running');
      return;
    }

    launchLogger.logStartupPhase('APPLICATION SHUTDOWN');
    logger.info('🛑 Stopping Consolidated Token Analyzer...');

    try {
      this.stopStatusLogging();

      // Stop components in reverse order
      const shutdownPromises = [];

      if (this.config.enabledFeatures.dashboard) {
        launchLogger.logComponentInit('Dashboard-Stop', 'STARTING');
        shutdownPromises.push(this.dashboard.stop());
      }

      if (this.config.enabledFeatures.detection) {
        launchLogger.logComponentInit('TokenDetector-Stop', 'STARTING');
        shutdownPromises.push(this.detector.stop());
      }

      // Stop unified engine
      launchLogger.logComponentInit('UnifiedEngine-Stop', 'STARTING');
      shutdownPromises.push(this.unifiedEngine.stop());

      if (this.config.enabledFeatures.simulation) {
        launchLogger.logComponentInit('SimulationEngine-Stop', 'STARTING');
        shutdownPromises.push(this.simulationEngine.stop());
      }

      await Promise.all(shutdownPromises);

      this.isRunning = false;
      launchLogger.logShutdown('Normal shutdown requested');
      logger.info('✅ Consolidated Token Analyzer stopped successfully');

      this.emit('stopped');

    } catch (error) {
      launchLogger.logError('STOP', error as Error, { phase: 'application shutdown' });
      logger.error('❌ Error stopping application:', error);
      throw error;
    }
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      mode: this.config.mode,
      uptime: Date.now() - this.startTime,
      config: this.config,
      detector: this.detector.getStatus(),
      simulation: this.simulationEngine.getStatus(),
      portfolio: this.simulationEngine.getPortfolio(),
      dashboard: {
        port: this.config.dashboardPort,
        url: `http://localhost:${this.config.dashboardPort}`,
        isRunning: this.dashboard.isRunning()
      }
    };
  }

  // Health check for monitoring
  async healthCheck(): Promise<boolean> {
    try {
      const detectorHealth = await this.detector.healthCheck();
      const simulationHealth = this.simulationEngine.isEngineRunning();
      const dashboardHealth = this.dashboard.isRunning();
      
      return this.isRunning && detectorHealth && simulationHealth && dashboardHealth;
    } catch (error) {
      logger.error('Health check failed:', error);
      return false;
    }
  }

  // Test API connectivity
  async testConnections(): Promise<boolean> {
    try {
      const apiTest = await this.apiService.testConnection();
      logger.info(`🔌 API connectivity test: ${apiTest ? 'PASSED' : 'FAILED'}`);
      return apiTest;
    } catch (error) {
      logger.error('Connection test failed:', error);
      return false;
    }
  }
}

/**
 * Create application instance based on command line arguments
 */
export function createConsolidatedApp(): ConsolidatedTokenAnalyzer {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const modeArg = args.find(arg => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] as any : 'unified';
  
  const portArg = args.find(arg => arg.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1]) : 3000;
  
  const balanceArg = args.find(arg => arg.startsWith('--balance='));
  const balance = balanceArg ? parseFloat(balanceArg.split('=')[1]) : 10;
  
  const config: Partial<AppConfig> = {
    mode,
    dashboardPort: port,
    startingBalance: balance
  };
  
  return new ConsolidatedTokenAnalyzer(config);
}

/**
 * Main execution function with enhanced error handling
 */
export async function main(): Promise<void> {
  const app = createConsolidatedApp();
  
  let shutdownInProgress = false;
  
  const shutdown = async (signal: string) => {
    if (shutdownInProgress) {
      logger.warn(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }
    
    shutdownInProgress = true;
    logger.info(`Received ${signal}, shutting down...`);
    
    const shutdownTimeout = setTimeout(() => {
      logger.warn('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, 15000);
    
    try {
      await app.stop();
      clearTimeout(shutdownTimeout);
      logger.info('Shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };
  
  // Signal handlers
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));
  
  // Error handlers
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('UNHANDLED_REJECTION');
  });
  
  try {
    // Test connections before starting - temporarily disabled to allow startup
    // const connectionsOk = await app.testConnections();
    // if (!connectionsOk) {
    //   logger.warn('⚠️ Some API connections failed, but continuing...');
    // }
    
    await app.start();
    
    // Keep process running
    process.stdin.resume();
    
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Auto-start if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}