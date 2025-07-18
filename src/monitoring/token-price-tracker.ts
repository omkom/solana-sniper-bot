import { EventEmitter } from 'events';
import { DexScreenerClient } from '../detection/dexscreener-client';
import { RealTokenInfo } from '../types/dexscreener';
import { logger } from '../monitoring/logger';

export interface TrackedToken {
  address: string;
  symbol: string;
  name: string;
  detectedAt: number;
  initialPrice: number;
  currentPrice: number;
  priceHistory: PricePoint[];
  status: 'DETECTED' | 'TRACKING' | 'MIGRATED' | 'FAILED';
  dexScreenerListed: boolean;
  lastPriceUpdate: number;
  priceChange24h: number;
  volume24h: number;
  liquidityUsd: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
  liquidity: number;
}

export class TokenPriceTracker extends EventEmitter {
  private trackedTokens: Map<string, TrackedToken> = new Map();
  private dexScreenerClient: DexScreenerClient;
  private trackingInterval: NodeJS.Timeout | null = null;
  private readonly TRACKING_INTERVAL = 30000; // 30 seconds
  private readonly MAX_TRACKED_TOKENS = 100;
  private readonly PRICE_HISTORY_LIMIT = 100;

  constructor() {
    super();
    this.dexScreenerClient = new DexScreenerClient();
    this.startTracking();
  }

  addToken(tokenInfo: RealTokenInfo): void {
    const trackedToken: TrackedToken = {
      address: tokenInfo.address,
      symbol: tokenInfo.symbol,
      name: tokenInfo.name,
      detectedAt: Date.now(),
      initialPrice: tokenInfo.priceUsd,
      currentPrice: tokenInfo.priceUsd,
      priceHistory: [{
        timestamp: Date.now(),
        price: tokenInfo.priceUsd,
        volume: tokenInfo.volume24h || 0,
        liquidity: tokenInfo.liquidityUsd || 0
      }],
      status: 'TRACKING',
      dexScreenerListed: true, // Already from DexScreener
      lastPriceUpdate: Date.now(),
      priceChange24h: tokenInfo.priceChange24h || 0,
      volume24h: tokenInfo.volume24h || 0,
      liquidityUsd: tokenInfo.liquidityUsd || 0
    };

    // Remove oldest tokens if we exceed limit
    if (this.trackedTokens.size >= this.MAX_TRACKED_TOKENS) {
      const oldestToken = Array.from(this.trackedTokens.values())
        .sort((a, b) => a.detectedAt - b.detectedAt)[0];
      this.trackedTokens.delete(oldestToken.address);
    }

    this.trackedTokens.set(tokenInfo.address, trackedToken);
    
    logger.info('Token added to price tracking with LIVE PRICE', {
      symbol: tokenInfo.symbol,
      address: tokenInfo.address,
      initialPrice: tokenInfo.priceUsd,
      liquidityUsd: tokenInfo.liquidityUsd
    });

    console.log(`💰 LIVE PRICE TRACKING: ${tokenInfo.symbol} at $${tokenInfo.priceUsd}`);

    this.emit('tokenAdded', trackedToken);
  }

  private startTracking(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
    }

    this.trackingInterval = setInterval(() => {
      this.updateAllTokenPrices();
    }, this.TRACKING_INTERVAL);

    logger.info('LIVE PRICE TRACKING STARTED', {
      interval: this.TRACKING_INTERVAL,
      maxTokens: this.MAX_TRACKED_TOKENS
    });
    
    console.log(`💰 LIVE PRICE TRACKING: Updates every ${this.TRACKING_INTERVAL/1000} seconds`);
  }

  private async updateAllTokenPrices(): Promise<void> {
    const tokens = Array.from(this.trackedTokens.values());
    
    if (tokens.length === 0) {
      return;
    }

    // Update tokens in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      await Promise.all(batch.map(token => this.updateTokenPrice(token)));
      
      // Small delay between batches
      if (i + batchSize < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async updateTokenPrice(token: TrackedToken): Promise<void> {
    try {
      const updatedInfo = await this.dexScreenerClient.getTokenDetails(token.address);
      
      if (updatedInfo) {
        const oldPrice = token.currentPrice;
        token.currentPrice = updatedInfo.priceUsd;
        token.priceChange24h = updatedInfo.priceChange24h || 0;
        token.volume24h = updatedInfo.volume24h || 0;
        token.liquidityUsd = updatedInfo.liquidityUsd || 0;
        token.lastPriceUpdate = Date.now();
        token.status = 'TRACKING';

        // Add to price history
        token.priceHistory.push({
          timestamp: Date.now(),
          price: updatedInfo.priceUsd,
          volume: updatedInfo.volume24h || 0,
          liquidity: updatedInfo.liquidityUsd || 0
        });

        // Trim history if too long
        if (token.priceHistory.length > this.PRICE_HISTORY_LIMIT) {
          token.priceHistory = token.priceHistory.slice(-this.PRICE_HISTORY_LIMIT);
        }

        // Calculate price change percentage
        const priceChangePercent = ((token.currentPrice - oldPrice) / oldPrice) * 100;
        
        console.log(`💰 LIVE PRICE UPDATE: ${token.symbol} $${oldPrice.toFixed(8)} → $${token.currentPrice.toFixed(8)} (${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%)`);
        
        // Emit update event
        this.emit('priceUpdate', {
          token,
          priceChange: priceChangePercent,
          oldPrice,
          newPrice: token.currentPrice
        });

        // Check for significant price changes (lower threshold for more alerts)
        if (Math.abs(priceChangePercent) > 5) {
          console.log(`⚡ SIGNIFICANT PRICE CHANGE: ${token.symbol} ${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%`);
          this.emit('significantPriceChange', {
            token,
            changePercent: priceChangePercent,
            timeframe: 'since_last_update'
          });
        }

      } else {
        // Token not found on DexScreener anymore
        console.log(`⚠️ Token ${token.symbol} not found on DexScreener anymore`);
        token.status = 'FAILED';
        token.lastPriceUpdate = Date.now();
        
        this.emit('tokenLost', token);
      }
    } catch (error) {
      logger.warn('Failed to update token price', {
        symbol: token.symbol,
        address: token.address,
        error: error instanceof Error ? error.message : String(error)
      });
      
      token.status = 'FAILED';
      token.lastPriceUpdate = Date.now();
    }
  }

  getTrackedTokens(): TrackedToken[] {
    return Array.from(this.trackedTokens.values())
      .sort((a, b) => b.detectedAt - a.detectedAt);
  }

  getTokenByAddress(address: string): TrackedToken | undefined {
    return this.trackedTokens.get(address);
  }

  getActiveTokens(): TrackedToken[] {
    return this.getTrackedTokens().filter(token => 
      token.status === 'TRACKING' || token.status === 'DETECTED'
    );
  }

  getPriceHistory(address: string): PricePoint[] {
    const token = this.trackedTokens.get(address);
    return token ? token.priceHistory : [];
  }

  getTrackingStats(): {
    total: number;
    tracking: number;
    migrated: number;
    failed: number;
    avgPriceChange: number;
  } {
    const tokens = this.getTrackedTokens();
    const tracking = tokens.filter(t => t.status === 'TRACKING').length;
    const migrated = tokens.filter(t => t.status === 'MIGRATED').length;
    const failed = tokens.filter(t => t.status === 'FAILED').length;
    
    const avgPriceChange = tokens.length > 0 
      ? tokens.reduce((sum, token) => sum + token.priceChange24h, 0) / tokens.length
      : 0;

    return {
      total: tokens.length,
      tracking,
      migrated,
      failed,
      avgPriceChange
    };
  }

  removeToken(address: string): void {
    this.trackedTokens.delete(address);
    this.emit('tokenRemoved', address);
  }

  clearOldTokens(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [address, token] of this.trackedTokens.entries()) {
      if (now - token.detectedAt > maxAge) {
        toRemove.push(address);
      }
    }

    toRemove.forEach(address => this.removeToken(address));
    
    if (toRemove.length > 0) {
      logger.info('Cleaned up old tracked tokens', { removed: toRemove.length });
    }
  }

  stop(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
    
    logger.info('Token price tracking stopped');
  }
}