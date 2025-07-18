// @ts-nocheck
import { EventEmitter } from 'events';
import { DexScreenerClient } from '../detection/dexscreener-client';

export interface TrackedToken {
  mint: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceHistory: PricePoint[];
  volume24h: number;
  liquidityUsd: number;
  priceChange24h: number;
  addedAt: number;
  lastUpdated: number;
  source: string;
}

export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
}

export class TokenPriceTracker extends EventEmitter {
  private trackedTokens: Map<string, TrackedToken> = new Map();
  private dexScreenerClient: DexScreenerClient;
  private updateInterval: NodeJS.Timer | null = null;
  private isUpdateLoopRunning = false;
  private updateIntervalMs = 30000; // 30 seconds
  private maxHistoryPoints = 100;
  private maxTrackedTokens = 100;

  constructor() {
    super();
    this.dexScreenerClient = new DexScreenerClient();
    console.log('📊 Token Price Tracker initialized');
  }

  /**
   * Add a token to the tracking list
   */
  addToken(mint: string, symbol: string, name: string, source: string = 'unknown'): void {
    if (this.trackedTokens.has(mint)) {
      console.log(`📊 Token ${symbol} already being tracked`);
      return;
    }

    // Check if we've reached the maximum number of tracked tokens
    if (this.trackedTokens.size >= this.maxTrackedTokens) {
      this.removeOldestToken();
    }

    const trackedToken: TrackedToken = {
      mint,
      symbol,
      name,
      priceUsd: 0,
      priceHistory: [],
      volume24h: 0,
      liquidityUsd: 0,
      priceChange24h: 0,
      addedAt: Date.now(),
      lastUpdated: 0,
      source
    };

    this.trackedTokens.set(mint, trackedToken);
    console.log(`📊 Added token to tracking: ${symbol} (${mint.slice(0, 8)}...) from ${source}`);
    
    // Emit event
    this.emit('tokenAdded', trackedToken);
    
    // Start price updates if this is the first token
    if (this.trackedTokens.size === 1) {
      this.startPriceUpdates();
    }

    // Get initial price
    this.updateTokenPrice(mint);
  }

  /**
   * Remove a token from tracking
   */
  removeToken(mint: string): void {
    const token = this.trackedTokens.get(mint);
    if (token) {
      this.trackedTokens.delete(mint);
      console.log(`📊 Removed token from tracking: ${token.symbol}`);
      this.emit('tokenRemoved', token);
      
      // Stop price updates if no tokens are being tracked
      if (this.trackedTokens.size === 0) {
        this.stopPriceUpdates();
      }
    }
  }

  /**
   * Get all tracked tokens
   */
  getTrackedTokens(): TrackedToken[] {
    return Array.from(this.trackedTokens.values());
  }

  /**
   * Get a specific tracked token
   */
  getTrackedToken(mint: string): TrackedToken | undefined {
    return this.trackedTokens.get(mint);
  }

  /**
   * Start the price update loop
   */
  startPriceUpdates(): void {
    if (this.isUpdateLoopRunning) {
      return;
    }

    console.log('🔄 Starting token price update loop');
    this.isUpdateLoopRunning = true;
    
    this.updateInterval = setInterval(() => {
      this.updateAllTokenPrices();
    }, this.updateIntervalMs);

    // Initial update
    this.updateAllTokenPrices();
  }

  /**
   * Stop the price update loop
   */
  stopPriceUpdates(): void {
    if (!this.isUpdateLoopRunning) {
      return;
    }

    console.log('⏹️ Stopping token price update loop');
    this.isUpdateLoopRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Update prices for all tracked tokens
   */
  private async updateAllTokenPrices(): Promise<void> {
    if (this.trackedTokens.size === 0) {
      return;
    }

    console.log(`🔄 Updating prices for ${this.trackedTokens.size} tracked tokens`);
    
    const promises = Array.from(this.trackedTokens.keys()).map(mint => 
      this.updateTokenPrice(mint)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Update price for a specific token
   */
  private async updateTokenPrice(mint: string): Promise<void> {
    const token = this.trackedTokens.get(mint);
    if (!token) {
      return;
    }

    try {
      const tokenData = await this.dexScreenerClient.getTokenByAddress(mint);
      
      if (tokenData) {
        const now = Date.now();
        const oldPrice = token.priceUsd;
        
        // Update token data
        token.priceUsd = tokenData.priceUsd;
        token.volume24h = tokenData.volume24h;
        token.liquidityUsd = tokenData.liquidityUsd;
        token.priceChange24h = tokenData.priceChange24h;
        token.lastUpdated = now;
        
        // Add to price history
        token.priceHistory.push({
          timestamp: now,
          price: tokenData.priceUsd,
          volume: tokenData.volume24h
        });

        // Limit history size
        if (token.priceHistory.length > this.maxHistoryPoints) {
          token.priceHistory = token.priceHistory.slice(-this.maxHistoryPoints);
        }

        // Emit price update event
        this.emit('priceUpdate', {
          mint,
          symbol: token.symbol,
          priceUsd: token.priceUsd,
          priceChange: token.priceUsd - oldPrice,
          priceChangePercent: oldPrice > 0 ? ((token.priceUsd - oldPrice) / oldPrice) * 100 : 0,
          volume24h: token.volume24h,
          liquidityUsd: token.liquidityUsd,
          timestamp: now
        });

        console.log(`📊 Updated ${token.symbol}: $${token.priceUsd.toFixed(8)} (${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(2)}%)`);
      }
    } catch (error) {
      console.error(`❌ Error updating price for ${token.symbol}:`, error);
    }
  }

  /**
   * Remove the oldest token when at capacity
   */
  private removeOldestToken(): void {
    let oldestToken: TrackedToken | null = null;
    let oldestMint = '';

    for (const [mint, token] of this.trackedTokens) {
      if (!oldestToken || token.addedAt < oldestToken.addedAt) {
        oldestToken = token;
        oldestMint = mint;
      }
    }

    if (oldestToken) {
      console.log(`📊 Removing oldest token to make space: ${oldestToken.symbol}`);
      this.removeToken(oldestMint);
    }
  }

  /**
   * Get tracking statistics
   */
  getStats(): any {
    return {
      totalTracked: this.trackedTokens.size,
      maxTracked: this.maxTrackedTokens,
      isUpdateLoopRunning: this.isUpdateLoopRunning,
      updateInterval: this.updateIntervalMs,
      lastUpdate: Math.max(...Array.from(this.trackedTokens.values()).map(t => t.lastUpdated))
    };
  }

  /**
   * Get price history for a token
   */
  getTokenHistory(mint: string, limit: number = 50): PricePoint[] {
    const token = this.trackedTokens.get(mint);
    if (!token) {
      return [];
    }
    return token.priceHistory.slice(-limit);
  }

  /**
   * Clear all tracked tokens
   */
  clearAll(): void {
    console.log('🗑️ Clearing all tracked tokens');
    this.trackedTokens.clear();
    this.stopPriceUpdates();
    this.emit('tokensCleared');
  }

  /**
   * Check if a token is being tracked
   */
  isTracking(mint: string): boolean {
    return this.trackedTokens.has(mint);
  }
}