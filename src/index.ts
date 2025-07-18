/**
 * Unified Entry Point for Solana Token Analyzer
 * Consolidates all previous entry points into a single, configurable system
 */

import { Config } from './core/config';
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
  private config: Config;
  private detector: UnifiedDetector;
  private simulationEngine: UnifiedSimulationEngine;
  private dashboard: Dashboard;
  private isRunning = false;
  
  // App modes
  private mode: 'rapid' | 'real' | 'unified' | 'analysis';
  
  constructor(mode: 'rapid' | 'real' | 'unified' | 'analysis' = 'unified') {
    this.mode = mode;
    this.config = Config.getInstance();
    
    // Initialize components based on mode
    this.initializeComponents();
    
    console.log('🎓 Educational Token Analyzer initialized in DRY_RUN mode');
    console.log('📚 This system is for learning and analysis purposes only');
    console.log(`🎯 Mode: ${mode.toUpperCase()}`);
  }

  private initializeComponents(): void {
    // Configure detection based on mode
    const detectionConfig: Partial<DetectionConfig> = this.getDetectionConfig();
    this.detector = new UnifiedDetector(detectionConfig);
    
    // Configure simulation based on mode
    const simulationConfig: Partial<SimulationConfig> = this.getSimulationConfig();
    this.simulationEngine = new UnifiedSimulationEngine(simulationConfig);
    
    // Initialize dashboard
    this.dashboard = new Dashboard();
    
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
    });

    this.detector.on('detectionResult', (result: any) => {
      logger.debug('Detection result:', result);
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
      await this.detector.stop();
      await this.simulationEngine.stop();
      await this.dashboard.stop();
      
      this.isRunning = false;
      logger.info('🛑 Token Analyzer stopped successfully');
      
    } catch (error) {
      logger.error('❌ Error stopping Token Analyzer:', error);
      throw error;
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
      totalValue: portfolio.totalValue.toFixed(4),
      totalPnL: `${portfolio.totalPnLPercent.toFixed(2)}%`,
      winRate: `${portfolio.winRate.toFixed(1)}%`
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
  
  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
      await app.stop();
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('UNHANDLED_REJECTION');
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