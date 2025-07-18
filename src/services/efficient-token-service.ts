import { EventEmitter } from 'events';
import { Connection, PublicKey, Logs } from '@solana/web3.js';
import { logger } from '../monitoring/logger';
import { TokenInfo } from '../types';

export interface TokenServiceConfig {
  maxTokensTracked: number;
  updateIntervalMs: number;
  enableRealTimeUpdates: boolean;
  minLiquidityThreshold: number;
  maxTokenAgeMs: number;
}

export interface SimpleTokenInfo {
  address: string;
  symbol: string;
  name: string;
  price: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  detectedAt: number;
  lastUpdated: number;
  source: string;
  active: boolean;
}

export class EfficientTokenService extends EventEmitter {
  private config: TokenServiceConfig;
  private connection: Connection;
  private tokens: Map<string, SimpleTokenInfo> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private subscriptions: Map<string, number> = new Map();
  
  // Performance tracking
  private stats = {
    tokensDetected: 0,
    tokensTracked: 0,
    updatesPerformed: 0,
    errors: 0,
    avgUpdateTime: 0,
    startTime: Date.now()
  };

  constructor(connection: Connection, config: Partial<TokenServiceConfig> = {}) {
    super();
    this.connection = connection;
    this.config = {
      maxTokensTracked: 100,
      updateIntervalMs: 30000,
      enableRealTimeUpdates: true,
      minLiquidityThreshold: 1000,
      maxTokenAgeMs: 3600000,
      ...config
    };

    logger.info('🚀 Efficient Token Service initialized', {
      maxTokens: this.config.maxTokensTracked,
      updateInterval: this.config.updateIntervalMs
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Token service already running');
      return;
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();

    // Start price update loop
    this.startPriceUpdates();

    // Start real-time monitoring if enabled
    if (this.config.enableRealTimeUpdates) {
      this.startRealTimeMonitoring();
    }

    // Start cleanup task
    this.startCleanupTask();

    logger.info('✅ Efficient Token Service started');
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop price updates
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Remove WebSocket subscriptions
    this.subscriptions.forEach(async (subscriptionId, programId) => {
      try {
        await this.connection.removeOnLogsListener(subscriptionId);
        logger.debug(`Removed subscription for ${programId}`);
      } catch (error) {
        logger.warn(`Failed to remove subscription for ${programId}:`, error);
      }
    });
    this.subscriptions.clear();

    logger.info('⏹️ Efficient Token Service stopped');
    this.emit('stopped');
  }

  addToken(address: string, symbol: string, name: string, source: string): void {
    // Check if already tracking
    if (this.tokens.has(address)) {
      logger.debug(`Token ${symbol} already tracked`);
      return;
    }

    // Check capacity
    if (this.tokens.size >= this.config.maxTokensTracked) {
      this.removeOldestToken();
    }

    const token: SimpleTokenInfo = {
      address,
      symbol,
      name,
      price: 0,
      liquidity: 0,
      volume24h: 0,
      priceChange24h: 0,
      detectedAt: Date.now(),
      lastUpdated: 0,
      source,
      active: true
    };

    this.tokens.set(address, token);
    this.stats.tokensTracked++;
    this.stats.tokensDetected++;

    logger.info(`📊 Added token: ${symbol} (${address.slice(0, 8)}...) from ${source}`);
    this.emit('tokenAdded', token);

    // Immediately update price
    this.updateTokenPrice(address);
  }

  removeToken(address: string): void {
    const token = this.tokens.get(address);
    if (token) {
      this.tokens.delete(address);
      logger.info(`🗑️ Removed token: ${token.symbol}`);
      this.emit('tokenRemoved', token);
    }
  }

  getToken(address: string): SimpleTokenInfo | undefined {
    return this.tokens.get(address);
  }

  getAllTokens(): SimpleTokenInfo[] {
    return Array.from(this.tokens.values());
  }

  getActiveTokens(): SimpleTokenInfo[] {
    return Array.from(this.tokens.values()).filter(token => token.active);
  }

  private startPriceUpdates(): void {
    this.updateInterval = setInterval(async () => {
      await this.updateAllTokenPrices();
    }, this.config.updateIntervalMs);

    // Initial update
    this.updateAllTokenPrices();
  }

  private async updateAllTokenPrices(): Promise<void> {
    if (this.tokens.size === 0) {
      return;
    }

    const startTime = Date.now();
    const promises: Promise<void>[] = [];

    // Update all tokens in parallel
    this.tokens.forEach((token, address) => {
      promises.push(this.updateTokenPrice(address));
    });

    try {
      await Promise.allSettled(promises);
      
      const updateTime = Date.now() - startTime;
      this.stats.updatesPerformed++;
      this.stats.avgUpdateTime = (this.stats.avgUpdateTime * (this.stats.updatesPerformed - 1) + updateTime) / this.stats.updatesPerformed;

      logger.debug(`📊 Updated ${this.tokens.size} tokens in ${updateTime}ms`);
      this.emit('pricesUpdated', {
        count: this.tokens.size,
        duration: updateTime,
        timestamp: Date.now()
      });

    } catch (error) {
      this.stats.errors++;
      logger.error('Error updating token prices:', error);
    }
  }

  private async updateTokenPrice(address: string): Promise<void> {
    const token = this.tokens.get(address);
    if (!token || !token.active) {
      return;
    }

    try {
      // Simple price update using a mock implementation
      // In a real implementation, this would call DexScreener or similar API
      const priceData = await this.fetchTokenPrice(address);
      
      if (priceData) {
        const oldPrice = token.price;
        
        token.price = priceData.price;
        token.liquidity = priceData.liquidity;
        token.volume24h = priceData.volume24h;
        token.priceChange24h = priceData.priceChange24h;
        token.lastUpdated = Date.now();

        // Emit price update event
        this.emit('priceUpdate', {
          address,
          symbol: token.symbol,
          price: token.price,
          priceChange: token.price - oldPrice,
          liquidity: token.liquidity,
          volume24h: token.volume24h,
          timestamp: Date.now()
        });

        // Check if token meets minimum requirements
        if (token.liquidity < this.config.minLiquidityThreshold) {
          token.active = false;
          logger.warn(`Token ${token.symbol} deactivated due to low liquidity: $${token.liquidity}`);
        }
      }

    } catch (error) {
      this.stats.errors++;
      logger.error(`Error updating price for ${token.symbol}:`, error);
    }
  }

  private async fetchTokenPrice(address: string): Promise<any> {
    // Mock implementation - replace with actual API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          price: Math.random() * 0.001,
          liquidity: Math.random() * 50000 + 1000,
          volume24h: Math.random() * 10000,
          priceChange24h: (Math.random() - 0.5) * 50
        });
      }, 100);
    });
  }

  private startRealTimeMonitoring(): void {
    // Monitor major DEX programs
    const programs = [
      { id: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', name: 'Raydium' },
      { id: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', name: 'Pump.fun' },
      { id: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', name: 'Orca' }
    ];

    for (const program of programs) {
      try {
        const subscriptionId = this.connection.onLogs(
          new PublicKey(program.id),
          (logs: Logs) => {
            this.handleProgramLogs(logs, program.name);
          },
          'confirmed'
        );

        this.subscriptions.set(program.id, subscriptionId);
        logger.info(`📡 Monitoring ${program.name} program`);

      } catch (error) {
        logger.error(`Failed to subscribe to ${program.name}:`, error);
      }
    }
  }

  private handleProgramLogs(logs: Logs, programName: string): void {
    try {
      // Simple log parsing for token creation patterns
      const hasTokenCreation = logs.logs.some(log => 
        log.toLowerCase().includes('initialize') ||
        log.toLowerCase().includes('create') ||
        log.toLowerCase().includes('mint')
      );

      if (hasTokenCreation) {
        logger.debug(`Potential token creation detected in ${programName}: ${logs.signature.slice(0, 8)}...`);
        
        // Emit event for further processing
        this.emit('potentialTokenDetected', {
          signature: logs.signature,
          program: programName,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      logger.error(`Error processing logs from ${programName}:`, error);
    }
  }

  private startCleanupTask(): void {
    setInterval(() => {
      this.performCleanup();
    }, 60000); // Every minute
  }

  private performCleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    // Remove old or inactive tokens
    this.tokens.forEach((token, address) => {
      const age = now - token.detectedAt;
      
      if (age > this.config.maxTokenAgeMs || !token.active) {
        this.tokens.delete(address);
        removedCount++;
      }
    });

    if (removedCount > 0) {
      logger.info(`🧹 Cleaned up ${removedCount} old/inactive tokens`);
    }
  }

  private removeOldestToken(): void {
    let oldestToken: SimpleTokenInfo | null = null;
    let oldestAddress = '';

    for (const [address, token] of Array.from(this.tokens.entries())) {
      if (!oldestToken || token.detectedAt < oldestToken.detectedAt) {
        oldestToken = token;
        oldestAddress = address;
      }
    }

    if (oldestToken) {
      this.tokens.delete(oldestAddress);
      logger.info(`🗑️ Removed oldest token: ${oldestToken.symbol}`);
    }
  }

  getStats(): any {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      trackedTokens: this.tokens.size,
      activeTokens: this.getActiveTokens().length,
      subscriptions: this.subscriptions.size,
      uptime: Date.now() - this.stats.startTime,
      config: this.config
    };
  }

  // Health check
  isHealthy(): boolean {
    return this.isRunning && this.tokens.size <= this.config.maxTokensTracked;
  }
}