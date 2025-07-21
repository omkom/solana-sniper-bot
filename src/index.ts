/**
 * Unified Entry Point for Solana Token Analyzer
 * Consolidates all previous entry points into a single, configurable system
 */

import { initializeSingletons, getConfig } from './core/singleton-manager';
import { UnifiedDetector } from './detection/unified-detector';
import { UnifiedSimulationEngine } from './simulation/unified-engine';
import { Dashboard } from './monitoring/dashboard';
import { logger } from './monitoring/logger';
import { ConnectionProvider } from './utils/common-patterns';
import { UnifiedTokenInfo, SimulationConfig, DetectionConfig } from './types/unified';

/**
 * Main Application Class
 * Orchestrates all components with unified configuration
 */
export class TokenAnalyzerApp {
  private config: any;
  private detector!: UnifiedDetector;
  private simulationEngine!: UnifiedSimulationEngine;
  private dashboard!: Dashboard;
  private isRunning = false;
  private initialized = false;
  
  // App modes
  private mode: 'rapid' | 'real' | 'unified' | 'analysis';
  
  constructor(mode: 'rapid' | 'real' | 'unified' | 'analysis' = 'unified') {
    this.mode = mode;
    
    console.log('🎓 Educational Token Analyzer initializing...');
    console.log('📚 This system is for learning and analysis purposes only');
    console.log(`🎯 Mode: ${mode.toUpperCase()}`);
  }

  private async initializeApp(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize singleton services first
      await initializeSingletons();
      
      // Get config from singleton manager
      this.config = await getConfig();
      
      // Initialize components based on mode
      await this.initializeComponents();
      
      this.initialized = true;
      logger.info('✅ TokenAnalyzerApp initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize TokenAnalyzerApp:', error);
      throw error;
    }
  }

  private async initializeComponents(): Promise<void> {
    // Configure detection based on mode
    const detectionConfig: Partial<DetectionConfig> = this.getDetectionConfig();
    this.detector = new UnifiedDetector(detectionConfig);
    
    // Configure simulation based on mode
    const simulationConfig: Partial<SimulationConfig> = this.getSimulationConfig();
    this.simulationEngine = new UnifiedSimulationEngine(simulationConfig);
    
    // Initialize dashboard
    this.dashboard = new Dashboard(this.simulationEngine as any);
    
    // Wire up event handlers
    this.setupEventHandlers();
  }

  private getDetectionConfig(): Partial<DetectionConfig> {
    switch (this.mode) {
      case 'rapid':
        return {
          enabledSources: ['websocket', 'dexscreener', 'pump'],
          scanInterval: 3000,
          maxConcurrentRequests: 5,
          rateLimitDelay: 200
        };
      
      case 'real':
        return {
          enabledSources: ['websocket', 'dexscreener'],
          scanInterval: 15000,
          maxConcurrentRequests: 2,
          rateLimitDelay: 1000
        };
      
      case 'analysis':
        return {
          enabledSources: ['dexscreener'],
          scanInterval: 30000,
          maxConcurrentRequests: 1,
          rateLimitDelay: 2000
        };
      
      default: // unified
        return {
          enabledSources: ['websocket', 'dexscreener', 'scanning', 'pump'],
          scanInterval: 5000,
          maxConcurrentRequests: 3,
          rateLimitDelay: 300
        };
    }
  }

  private getSimulationConfig(): Partial<SimulationConfig> {
    switch (this.mode) {
      case 'rapid':
        return {
          mode: 'DRY_RUN',
          maxPositions: 1000,
          baseInvestment: 0.001,
          startingBalance: 5,
          maxAnalysisAge: 1800000, // 30 minutes
          minConfidenceScore: 1,
          takeProfitPercent: 50
        };
      
      case 'real':
        return {
          mode: 'DRY_RUN',
          maxPositions: 200,
          baseInvestment: 0.005,
          startingBalance: 20,
          maxAnalysisAge: 1800000, // 30 minutes
          minConfidenceScore: 10,
          takeProfitPercent: 100
        };
      
      case 'analysis':
        return {
          mode: 'ANALYSIS',
          maxPositions: 50,
          baseInvestment: 0.01,
          startingBalance: 50,
          maxAnalysisAge: 7200000, // 2 hours
          minConfidenceScore: 30,
          takeProfitPercent: 200
        };
      
      default: // unified
        return {
          mode: 'DRY_RUN',
          maxPositions: 500,
          baseInvestment: 0.003,
          startingBalance: 10,
          maxAnalysisAge: 3600000, // 1 hour
          minConfidenceScore: 5,
          takeProfitPercent: 100
        };
    }
  }

  private setupEventHandlers(): void {
    // Token detection events
    this.detector.on('tokenDetected', (tokens: UnifiedTokenInfo[]) => {
      this.handleTokensDetected(tokens);
      
      // Forward to dashboard for real-time updates
      if (this.dashboard) {
        this.dashboard.emit('newTokensDetected', tokens);
      }
    });

    this.detector.on('detectionResult', (result: any) => {
      logger.debug('Detection result:', result);
      
      // Forward detection results to dashboard
      if (this.dashboard) {
        this.dashboard.emit('detectionResult', result);
      }
    });

    // Simulation events
    this.simulationEngine.on('positionOpened', (position: any) => {
      logger.info(`📈 Position opened: ${position.token.symbol}`);
    });

    this.simulationEngine.on('positionClosed', (position: any) => {
      logger.info(`📉 Position closed: ${position.token.symbol} (${position.pnlPercent?.toFixed(2)}%)`);
    });

    this.simulationEngine.on('portfolioUpdated', (portfolio: any) => {
      logger.verbose('Portfolio updated:', {
        totalValue: portfolio.totalValue,
        activePositions: portfolio.activePositions,
        totalPnL: portfolio.totalPnL
      });
    });

    // Error handling
    this.detector.on('error', (error: Error) => {
      logger.error('Detector error:', error);
    });

    this.simulationEngine.on('error', (error: Error) => {
      logger.error('Simulation error:', error);
    });
  }

  private async handleTokensDetected(tokens: UnifiedTokenInfo[]): Promise<void> {
    logger.info(`🎯 Detected ${tokens.length} tokens`);
    
    // Process each token through simulation engine
    for (const token of tokens) {
      try {
        await this.simulationEngine.processToken(token);
      } catch (error) {
        logger.error(`Error processing token ${token.symbol}:`, error);
      }
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Application already running');
      return;
    }

    try {
      // Initialize app first
      await this.initializeApp();
      
      logger.info(`🚀 Starting Token Analyzer in ${this.mode.toUpperCase()} mode`);
      
      // Start core components
      await this.detector.start();
      await this.simulationEngine.start();
      await this.dashboard.start();
      
      this.isRunning = true;
      logger.info('✅ Token Analyzer started successfully');
      
      // Log initial status
      this.logStatus();
      
      // Set up periodic status logging
      setInterval(() => {
        this.logStatus();
      }, 60000); // Every minute
      
    } catch (error) {
      logger.error('❌ Failed to start Token Analyzer:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('🛑 Stopping Token Analyzer...');
    
    try {
      // Use Promise.allSettled for parallel shutdown to speed up Ctrl+C
      const shutdownPromises = [
        this.detector.stop().catch(error => {
          logger.warn('⚠️  Detector stop error:', error);
          return null;
        }),
        this.simulationEngine.stop().catch(error => {
          logger.warn('⚠️  Simulation engine stop error:', error);
          return null;
        }),
        this.dashboard.stop().catch(error => {
          logger.warn('⚠️  Dashboard stop error:', error);
          return null;
        })
      ];

      // Wait for all services to stop (or fail gracefully)
      const results = await Promise.allSettled(shutdownPromises);
      
      // Check if any critical shutdowns failed
      const failedShutdowns = results
        .filter(result => result.status === 'rejected')
        .map(result => (result as PromiseRejectedResult).reason);

      if (failedShutdowns.length > 0) {
        logger.warn(`⚠️  ${failedShutdowns.length} services failed to stop cleanly`);
      }
      
      this.isRunning = false;
      logger.info('🛑 Token Analyzer stopped successfully');
      
    } catch (error) {
      logger.error('❌ Error stopping Token Analyzer:', error);
      
      // Don't throw error during shutdown to prevent hanging
      logger.warn('⚠️  Continuing with shutdown despite errors');
      this.isRunning = false;
    }
  }

  private logStatus(): void {
    const detectorStatus = this.detector.getStatus();
    const simulationStatus = this.simulationEngine.getStatus();
    const portfolio = this.simulationEngine.getPortfolio();
    
    logger.info('📊 System Status:', {
      mode: this.mode,
      detectedTokens: detectorStatus.detectedTokensCount,
      activePositions: portfolio.activePositions,
      totalValue: (portfolio.totalValue || 0).toFixed(4),
      totalPnL: `${(portfolio.totalPnLPercent || 0).toFixed(2)}%`,
      winRate: `${(portfolio.winRate || 0).toFixed(1)}%`
    });
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      detector: this.detector.getStatus(),
      simulation: this.simulationEngine.getStatus(),
      portfolio: this.simulationEngine.getPortfolio()
    };
  }
}

/**
 * Application factory function
 * Creates the appropriate app instance based on command line arguments or environment
 */
export function createApp(): TokenAnalyzerApp {
  // Determine mode from command line args or environment
  const args = process.argv.slice(2);
  const modeArg = args.find(arg => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.split('=')[1] as any : 'unified';
  
  return new TokenAnalyzerApp(mode);
}

/**
 * Main execution function
 * Handles graceful shutdown and error recovery
 */
export async function main(): Promise<void> {
  const app = createApp();
  
  // Enhanced graceful shutdown handling with optimization for Ctrl+C
  let shutdownInProgress = false;
  let shutdownTimeout: NodeJS.Timeout;
  
  const shutdown = async (signal: string) => {
    // Prevent multiple shutdown attempts
    if (shutdownInProgress) {
      logger.warn(`⚠️  Shutdown already in progress, ignoring ${signal}`);
      return;
    }
    
    shutdownInProgress = true;
    logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
    
    // Set a timeout for forced shutdown (prevents hanging on Ctrl+C)
    shutdownTimeout = setTimeout(() => {
      logger.warn('⚠️  Graceful shutdown taking too long, forcing exit...');
      process.exit(1);
    }, 10000); // 10 seconds timeout
    
    try {
      // Show immediate feedback for Ctrl+C
      if (signal === 'SIGINT') {
        console.log('\n🔄 Stopping services... (Press Ctrl+C again to force quit)');
      }
      
      await app.stop();
      
      // Clear timeout if shutdown completes successfully
      if (shutdownTimeout) {
        clearTimeout(shutdownTimeout);
      }
      
      logger.info('✅ Shutdown completed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      
      // Clear timeout before exit
      if (shutdownTimeout) {
        clearTimeout(shutdownTimeout);
      }
      
      process.exit(1);
    }
  };

  // Enhanced signal handling with double Ctrl+C support
  let sigintCount = 0;
  process.on('SIGINT', () => {
    sigintCount++;
    
    if (sigintCount === 1) {
      // First Ctrl+C - graceful shutdown
      shutdown('SIGINT');
    } else if (sigintCount >= 2) {
      // Second Ctrl+C - force exit
      console.log('\n💥 Force quit requested, exiting immediately...');
      process.exit(1);
    }
  });
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));

  // Handle uncaught errors with enhanced cleanup
  process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception:', error);
    console.error('💥 Critical error occurred, shutting down...');
    
    // Force shutdown for uncaught exceptions
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout);
    }
    
    // Try graceful shutdown but with shorter timeout
    const emergencyShutdown = setTimeout(() => {
      console.error('💥 Emergency shutdown timeout, forcing exit...');
      process.exit(1);
    }, 5000); // 5 seconds for emergency shutdown
    
    app.stop().then(() => {
      clearTimeout(emergencyShutdown);
      process.exit(1);
    }).catch(() => {
      clearTimeout(emergencyShutdown);
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('💥 Unhandled promise rejection, shutting down...');
    
    // For unhandled rejections, try graceful shutdown
    if (!shutdownInProgress) {
      shutdown('UNHANDLED_REJECTION');
    }
  });

  try {
    await app.start();
    
    // Keep the process running
    process.stdin.resume();
    
  } catch (error) {
    logger.error('💥 Failed to start application:', error);
    process.exit(1);
  }
}

// Auto-start if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}