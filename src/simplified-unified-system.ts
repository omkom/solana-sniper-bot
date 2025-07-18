#!/usr/bin/env node

import { EventEmitter } from 'events';
import { Connection } from '@solana/web3.js';
import { logger } from './monitoring/logger';
import { EfficientTokenService } from './services/efficient-token-service';
import { SimplePriceTracker } from './services/simple-price-tracker';
import { EfficientApiService } from './services/efficient-api-service';

export interface SimplifiedSystemConfig {
  mode: 'educational' | 'analysis' | 'monitoring';
  rpcUrl: string;
  maxTokens: number;
  updateInterval: number;
  enableRealTimeUpdates: boolean;
  enableDashboard: boolean;
  dashboardPort: number;
  minLiquidity: number;
  maxTokenAge: number;
}

export interface SystemStats {
  isRunning: boolean;
  uptime: number;
  tokensTracked: number;
  tokensDetected: number;
  priceUpdates: number;
  apiCalls: number;
  errors: number;
  memoryUsage: number;
  startTime: number;
  components: {
    tokenService: any;
    priceTracker: any;
    apiService: any;
  };
}

export class SimplifiedUnifiedSystem extends EventEmitter {
  private config: SimplifiedSystemConfig;
  private connection: Connection;
  private tokenService: EfficientTokenService;
  private priceTracker: SimplePriceTracker;
  private apiService: EfficientApiService;
  
  private isRunning = false;
  private startTime = 0;
  private stats = {
    tokensDetected: 0,
    tokensTracked: 0,
    priceUpdates: 0,
    apiCalls: 0,
    errors: 0
  };

  constructor(config: Partial<SimplifiedSystemConfig> = {}) {
    super();
    
    this.config = {
      mode: 'educational',
      rpcUrl: process.env.RPC_PRIMARY || 'https://api.mainnet-beta.solana.com',
      maxTokens: 100,
      updateInterval: 30000,
      enableRealTimeUpdates: true,
      enableDashboard: false,
      dashboardPort: 3000,
      minLiquidity: 1000,
      maxTokenAge: 3600000,
      ...config
    };

    // Initialize connection
    this.connection = new Connection(this.config.rpcUrl, 'confirmed');
    
    // Initialize services
    this.tokenService = new EfficientTokenService(this.connection, {
      maxTokensTracked: this.config.maxTokens,
      updateIntervalMs: this.config.updateInterval,
      enableRealTimeUpdates: this.config.enableRealTimeUpdates,
      minLiquidityThreshold: this.config.minLiquidity,
      maxTokenAgeMs: this.config.maxTokenAge
    });

    this.priceTracker = new SimplePriceTracker();
    this.apiService = new EfficientApiService();

    this.setupEventHandlers();
    logger.info('🚀 Simplified Unified System initialized', { config: this.config });
  }

  private setupEventHandlers(): void {
    // Token service events
    this.tokenService.on('tokenAdded', (token) => {
      this.stats.tokensDetected++;
      this.stats.tokensTracked++;
      
      // Add to price tracker
      this.priceTracker.addToken(token.address, token.symbol);
      
      logger.info(`📊 New token detected: ${token.symbol} (${token.address.slice(0, 8)}...)`);
      this.emit('tokenDetected', token);
    });

    this.tokenService.on('tokenRemoved', (token) => {
      this.stats.tokensTracked--;
      
      // Remove from price tracker
      this.priceTracker.removeToken(token.address);
      
      logger.info(`🗑️ Token removed: ${token.symbol}`);
      this.emit('tokenRemoved', token);
    });

    this.tokenService.on('priceUpdate', (update) => {
      this.stats.priceUpdates++;
      this.emit('priceUpdate', update);
    });

    this.tokenService.on('potentialTokenDetected', (detection) => {
      logger.debug(`🔍 Potential token detected: ${detection.signature.slice(0, 8)}... from ${detection.program}`);
      this.emit('potentialTokenDetected', detection);
    });

    // Price tracker events
    this.priceTracker.on('priceUpdate', (update) => {
      this.stats.priceUpdates++;
      this.emit('priceUpdate', update);
    });

    this.priceTracker.on('alertTriggered', (alert) => {
      logger.warn(`🚨 Price alert triggered: ${alert.message}`);
      this.emit('alertTriggered', alert);
    });

    // Error handling
    this.tokenService.on('error', (error) => {
      this.stats.errors++;
      logger.error('Token service error:', error);
      this.emit('error', error);
    });

    this.priceTracker.on('error', (error) => {
      this.stats.errors++;
      logger.error('Price tracker error:', error);
      this.emit('error', error);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('System already running');
      return;
    }

    try {
      this.isRunning = true;
      this.startTime = Date.now();

      logger.info('🔧 Starting Simplified Unified System...');

      // Start token service
      await this.tokenService.start();
      logger.info('✅ Token service started');

      // Start price tracker
      this.priceTracker.start();
      logger.info('✅ Price tracker started');

      // Test RPC connection
      const slot = await this.connection.getSlot();
      logger.info(`📡 RPC connection healthy, current slot: ${slot}`);

      logger.info('🎉 Simplified Unified System fully operational!');
      logger.info(`📊 Mode: ${this.config.mode}`);
      logger.info(`🔍 Max tokens: ${this.config.maxTokens}`);
      logger.info(`⏱️ Update interval: ${this.config.updateInterval}ms`);
      logger.info(`🌐 Real-time updates: ${this.config.enableRealTimeUpdates ? 'enabled' : 'disabled'}`);

      this.emit('started');

    } catch (error) {
      this.isRunning = false;
      logger.error('Failed to start system:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      logger.info('⏹️ Stopping Simplified Unified System...');

      // Stop services
      await this.tokenService.stop();
      this.priceTracker.stop();

      this.isRunning = false;
      logger.info('✅ System stopped gracefully');
      this.emit('stopped');

    } catch (error) {
      logger.error('Error stopping system:', error);
      throw error;
    }
  }

  // Public API methods
  getStats(): SystemStats {
    const uptime = this.isRunning ? Date.now() - this.startTime : 0;
    const memoryUsage = process.memoryUsage();

    return {
      isRunning: this.isRunning,
      uptime,
      tokensTracked: this.stats.tokensTracked,
      tokensDetected: this.stats.tokensDetected,
      priceUpdates: this.stats.priceUpdates,
      apiCalls: this.stats.apiCalls,
      errors: this.stats.errors,
      memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // MB
      startTime: this.startTime,
      components: {
        tokenService: this.tokenService.getStats(),
        priceTracker: this.priceTracker.getStats(),
        apiService: this.apiService.getStats()
      }
    };
  }

  isHealthy(): boolean {
    return this.isRunning && 
           this.tokenService.isHealthy() && 
           this.priceTracker.isHealthy() && 
           this.apiService.isHealthy();
  }

  // Token management
  getAllTokens() {
    return this.tokenService.getAllTokens();
  }

  getActiveTokens() {
    return this.tokenService.getActiveTokens();
  }

  getToken(address: string) {
    return this.tokenService.getToken(address);
  }

  // Price tracking
  getPrice(address: string) {
    return this.priceTracker.getPrice(address);
  }

  getAllPrices() {
    return this.priceTracker.getAllPrices();
  }

  addPriceAlert(address: string, type: 'price_above' | 'price_below' | 'price_change', threshold: number) {
    return this.priceTracker.addAlert(address, type, threshold);
  }

  removePriceAlert(alertId: string) {
    this.priceTracker.removeAlert(alertId);
  }

  // API service
  async getDexScreenerToken(address: string) {
    this.stats.apiCalls++;
    return this.apiService.getDexScreenerToken(address);
  }

  async getJupiterQuote(inputMint: string, outputMint: string, amount: number) {
    this.stats.apiCalls++;
    return this.apiService.getJupiterQuote(inputMint, outputMint, amount);
  }

  clearApiCache() {
    this.apiService.clearCache();
  }

  // Demo mode for testing
  async startDemoMode(): Promise<void> {
    if (this.config.mode !== 'educational') {
      logger.warn('Demo mode only available in educational mode');
      return;
    }

    logger.info('🎮 Starting demo mode...');
    
    // Generate some demo tokens
    const demoTokens = [
      { address: '11111111111111111111111111111111', symbol: 'DEMO1', name: 'Demo Token 1', source: 'demo' },
      { address: '22222222222222222222222222222222', symbol: 'DEMO2', name: 'Demo Token 2', source: 'demo' },
      { address: '33333333333333333333333333333333', symbol: 'DEMO3', name: 'Demo Token 3', source: 'demo' }
    ];

    for (const token of demoTokens) {
      this.tokenService.addToken(token.address, token.symbol, token.name, token.source);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Spread out additions
    }

    logger.info('🎯 Demo mode activated with sample tokens');
  }

  // System diagnostics
  async runDiagnostics(): Promise<any> {
    logger.info('🔍 Running system diagnostics...');

    const diagnostics = {
      timestamp: Date.now(),
      system: {
        isRunning: this.isRunning,
        uptime: this.isRunning ? Date.now() - this.startTime : 0,
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      },
      components: {
        tokenService: {
          status: this.tokenService.isHealthy() ? 'healthy' : 'unhealthy',
          stats: this.tokenService.getStats()
        },
        priceTracker: {
          status: this.priceTracker.isHealthy() ? 'healthy' : 'unhealthy',
          stats: this.priceTracker.getStats()
        },
        apiService: {
          status: this.apiService.isHealthy() ? 'healthy' : 'unhealthy',
          stats: this.apiService.getStats()
        }
      },
      performance: {
        totalTokensDetected: this.stats.tokensDetected,
        totalPriceUpdates: this.stats.priceUpdates,
        totalApiCalls: this.stats.apiCalls,
        totalErrors: this.stats.errors,
        errorRate: this.stats.errors / Math.max(1, this.stats.tokensDetected + this.stats.priceUpdates + this.stats.apiCalls)
      }
    };

    // Generate recommendations
    const recommendations = [];
    
    if (diagnostics.performance.errorRate > 0.1) {
      recommendations.push('High error rate detected. Check logs for recurring issues.');
    }
    
    if (diagnostics.system.memoryUsage.heapUsed / 1024 / 1024 > 500) {
      recommendations.push('Memory usage is high. Consider reducing max tokens or restarting.');
    }
    
    if (diagnostics.components.tokenService.stats.trackedTokens === 0) {
      recommendations.push('No tokens currently tracked. Consider starting demo mode or checking detection sources.');
    }

    return {
      ...diagnostics,
      recommendations,
      overallHealth: this.isHealthy() ? 'healthy' : 'unhealthy'
    };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0] || 'educational';
  const enableRealTime = args[1] !== 'false';

  const system = new SimplifiedUnifiedSystem({
    mode: mode as 'educational' | 'analysis' | 'monitoring',
    enableRealTimeUpdates: enableRealTime,
    enableDashboard: false // Keep dashboard disabled for now
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('🛑 Received SIGINT, shutting down gracefully...');
    await system.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('🛑 Received SIGTERM, shutting down gracefully...');
    await system.stop();
    process.exit(0);
  });

  // Start system
  system.start().catch(error => {
    logger.error('Failed to start system:', error);
    process.exit(1);
  });

  // Log stats periodically
  setInterval(() => {
    if (system.isHealthy()) {
      const stats = system.getStats();
      logger.info(`📊 System Status: ${stats.tokensTracked} tokens tracked, ${stats.priceUpdates} price updates, ${stats.apiCalls} API calls, ${stats.errors} errors`);
    }
  }, 60000); // Every minute
}

export default SimplifiedUnifiedSystem;