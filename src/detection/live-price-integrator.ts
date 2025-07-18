import { EventEmitter } from 'events';
import { DexScreenerClient } from './dexscreener-client';
import { RealTokenInfo } from '../types/dexscreener';
import { logger } from '../monitoring/logger';

export interface LivePriceUpdate {
  address: string;
  symbol: string;
  oldPrice: number;
  newPrice: number;
  priceChange: number;
  liquidityUsd: number;
  volume24h: number;
  timestamp: number;
}

/**
 * Live Price Integrator - Ensures real-time price data for all detected tokens
 * This component bridges DexScreener data with our trading system
 */
export class LivePriceIntegrator extends EventEmitter {
  private dexScreenerClient: DexScreenerClient;
  private trackedTokens: Map<string, RealTokenInfo> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL = 15000; // 15 seconds for live updates
  private isRunning = false;

  constructor() {
    super();
    this.dexScreenerClient = new DexScreenerClient();
    console.log('💰 Live Price Integrator initialized');
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🔄 Starting live price integration...');
    
    // Start periodic price updates
    this.updateInterval = setInterval(() => {
      this.updateAllPrices();
    }, this.UPDATE_INTERVAL);
    
    // Initial fetch
    this.fetchLatestTokens();
    
    console.log(`✅ Live price updates every ${this.UPDATE_INTERVAL/1000} seconds`);
  }

  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    console.log('🛑 Live price integration stopped');
  }

  /**
   * Fetch latest tokens from DexScreener
   */
  private async fetchLatestTokens(): Promise<void> {
    try {
      console.log('🔍 Fetching latest tokens from DexScreener...');
      
      const latestTokens = await this.dexScreenerClient.getTrendingTokens({
        minLiquidityUSD: 10, // Very low threshold for maximum coverage
        maxAgeHours: 2, // 2 hours max age
        minVolume24h: 50 // Low volume threshold
      });

      console.log(`📊 Found ${latestTokens.length} tokens with live prices`);
      
      // Process each token
      for (const token of latestTokens) {
        this.processToken(token);
      }

      // Emit batch update
      this.emit('batchPriceUpdate', Array.from(this.trackedTokens.values()));
      
    } catch (error) {
      console.error('❌ Error fetching latest tokens:', error);
    }
  }

  /**
   * Process a single token and track its price
   */
  private processToken(token: RealTokenInfo): void {
    const existingToken = this.trackedTokens.get(token.address);
    
    if (existingToken) {
      // Check for price change
      const oldPrice = existingToken.priceUsd;
      const newPrice = token.priceUsd;
      const priceChange = ((newPrice - oldPrice) / oldPrice) * 100;
      
      if (Math.abs(priceChange) > 0.1) { // 0.1% threshold
        console.log(`💹 Price update: ${token.symbol} ${oldPrice.toFixed(8)} → ${newPrice.toFixed(8)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);
        
        const priceUpdate: LivePriceUpdate = {
          address: token.address,
          symbol: token.symbol,
          oldPrice,
          newPrice,
          priceChange,
          liquidityUsd: token.liquidityUsd,
          volume24h: token.volume24h,
          timestamp: Date.now()
        };
        
        this.emit('priceUpdate', priceUpdate);
      }
    } else {
      console.log(`💰 New token with live price: ${token.symbol} at $${token.priceUsd.toFixed(8)}`);
      this.emit('newTokenWithPrice', token);
    }
    
    // Update tracked token
    this.trackedTokens.set(token.address, token);
    
    // Limit tracked tokens to prevent memory issues
    if (this.trackedTokens.size > 200) {
      const firstKey = this.trackedTokens.keys().next().value;
      if (firstKey) {
        this.trackedTokens.delete(firstKey);
      }
    }
  }

  /**
   * Update all tracked token prices
   */
  private async updateAllPrices(): Promise<void> {
    if (this.trackedTokens.size === 0) {
      await this.fetchLatestTokens();
      return;
    }

    console.log(`🔄 Updating prices for ${this.trackedTokens.size} tracked tokens...`);
    
    // Update tokens in batches to avoid rate limits
    const tokens = Array.from(this.trackedTokens.values());
    const batchSize = 10;
    
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      await Promise.all(batch.map(token => this.updateTokenPrice(token)));
      
      // Small delay between batches
      if (i + batchSize < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Update price for a specific token
   */
  private async updateTokenPrice(token: RealTokenInfo): Promise<void> {
    try {
      const updatedToken = await this.dexScreenerClient.getTokenDetails(token.address);
      
      if (updatedToken) {
        this.processToken(updatedToken);
      } else {
        // Token not found anymore
        console.log(`⚠️ Token ${token.symbol} no longer available on DexScreener`);
        this.trackedTokens.delete(token.address);
        this.emit('tokenLost', token);
      }
    } catch (error) {
      // Silently handle individual token update failures
      logger.verbose('Failed to update token price', {
        symbol: token.symbol,
        address: token.address,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get current price for a specific token
   */
  async getCurrentPrice(address: string): Promise<number | null> {
    const trackedToken = this.trackedTokens.get(address);
    if (trackedToken) {
      return trackedToken.priceUsd;
    }
    
    // Fetch from DexScreener if not tracked
    try {
      const token = await this.dexScreenerClient.getTokenDetails(address);
      if (token) {
        this.processToken(token);
        return token.priceUsd;
      }
    } catch (error) {
      console.warn(`Failed to get current price for ${address}:`, error);
    }
    
    return null;
  }

  /**
   * Get all tokens with live prices
   */
  getAllTokensWithPrices(): RealTokenInfo[] {
    return Array.from(this.trackedTokens.values())
      .sort((a, b) => b.detectedAt - a.detectedAt); // Most recent first
  }

  /**
   * Get statistics
   */
  getStats() {
    const tokens = Array.from(this.trackedTokens.values());
    const avgPrice = tokens.length > 0 
      ? tokens.reduce((sum, token) => sum + token.priceUsd, 0) / tokens.length 
      : 0;
    
    const totalLiquidity = tokens.reduce((sum, token) => sum + token.liquidityUsd, 0);
    
    return {
      totalTokens: tokens.length,
      isRunning: this.isRunning,
      updateInterval: this.UPDATE_INTERVAL,
      avgPrice: avgPrice,
      totalLiquidity: totalLiquidity,
      latestUpdate: Date.now()
    };
  }
}