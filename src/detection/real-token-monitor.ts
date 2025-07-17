import { EventEmitter } from 'events';
import { DexScreenerClient } from './dexscreener-client';
import { RealTokenInfo } from '../types/dexscreener';
import { TokenInfo } from '../types';
import { logger } from '../monitoring/logger';

export class RealTokenMonitor extends EventEmitter {
  private dexClient: DexScreenerClient;
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceTrackingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private trackedTokens: Map<string, RealTokenInfo> = new Map();
  private seenTokens: Set<string> = new Set();

  constructor() {
    super();
    this.dexClient = new DexScreenerClient();
  }

  // Expose DexScreenerClient for testing
  getDexScreenerClient(): DexScreenerClient {
    return this.dexClient;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('⚠️ Real token monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('🔍 Starting real token monitor with DexScreener API');

    try {
      // Start monitoring for new/trending tokens
      await this.startTokenDiscovery();
      
      console.log('✅ Real token monitor started successfully');
      
      logger.info('Real token monitor started', {
        mode: 'live_data',
        source: 'dexscreener'
      });

    } catch (error) {
      console.error('❌ Failed to start real token monitor:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // Stop main monitoring interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Stop all price tracking intervals
    for (const interval of this.priceTrackingIntervals.values()) {
      clearInterval(interval);
    }
    this.priceTrackingIntervals.clear();

    console.log('🛑 Real token monitor stopped');
    logger.info('Real token monitor stopped');
  }

  private async startTokenDiscovery(): Promise<void> {
    // Initial fetch
    await this.discoverTrendingTokens();

    // Set up periodic discovery (every 15 seconds for new tokens)
    this.monitoringInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.discoverTrendingTokens();
      } catch (error) {
        logger.warn('Error during token discovery', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 15000); // 15 seconds for faster detection of new tokens

    console.log('🔄 Started periodic token discovery (15s intervals)');
  }

  private async discoverTrendingTokens(): Promise<void> {
    try {
      // Get trending tokens from DexScreener - LAST 30 MINUTES ONLY
      const trendingTokens = await this.dexClient.getTrendingTokens({
        minLiquidity: 2000,    // $2000 min liquidity for real activity
        maxAge: 0.5,           // 30 minutes max age (0.5 hours)
        minVolume: 1000        // $1000 min volume for serious tokens
      });

      logger.verbose('Discovered trending tokens', { 
        count: trendingTokens.length 
      });

      // Process new tokens
      for (const token of trendingTokens) {
        if (!this.seenTokens.has(token.address)) {
          await this.processNewToken(token);
        }
      }

      // Also look for very new tokens (last 5 minutes)
      const newTokens = await this.dexClient.searchNewTokens();
      
      for (const token of newTokens) {
        if (!this.seenTokens.has(token.address)) {
          await this.processNewToken(token);
        }
      }

    } catch (error) {
      logger.error('Failed to discover trending tokens', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async processNewToken(realToken: RealTokenInfo): Promise<void> {
    // Additional filter: ensure token is within last 30 minutes
    const now = Date.now();
    const tokenAge = realToken.pairCreatedAt ? now - realToken.pairCreatedAt : Infinity;
    const thirtyMinutesMs = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    if (tokenAge > thirtyMinutesMs) {
      return; // Skip tokens older than 30 minutes
    }

    // Mark as seen
    this.seenTokens.add(realToken.address);
    
    const ageInMinutes = Math.floor(tokenAge / (60 * 1000));
    console.log(`\n🆕 NEW TOKEN DETECTED (${ageInMinutes}m old): ${realToken.symbol || realToken.address.slice(0, 8)}`);
    console.log(`💵 Price: $${realToken.priceUsd.toFixed(8)}`);
    console.log(`💧 Liquidity: $${realToken.liquidityUsd.toLocaleString()}`);
    console.log(`📊 Volume 24h: $${realToken.volume24h.toLocaleString()}`);
    console.log(`📈 5m Change: ${realToken.priceChange5m.toFixed(2)}%`);
    console.log(`🔥 Trending Score: ${realToken.trendingScore}/100`);
    console.log(`🏭 DEX: ${realToken.dexId}`);
    
    // Convert to our TokenInfo format
    const tokenInfo: TokenInfo = {
      mint: realToken.address,
      symbol: realToken.symbol,
      name: realToken.name,
      decimals: 9, // Most Solana tokens use 9 decimals
      supply: '0', // Not available from DexScreener
      signature: 'dexscreener_api',
      timestamp: Date.now(),
      source: `dexscreener_live_${realToken.dexId}`,
      createdAt: realToken.pairCreatedAt || (Date.now() - 300000),
      metadata: {
        realData: true,
        dexId: realToken.dexId,
        pairAddress: realToken.pairAddress,
        imageUrl: realToken.imageUrl,
        websites: realToken.websites,
        socials: realToken.socials,
        trendingScore: realToken.trendingScore,
        ageMinutes: ageInMinutes,
        isNewToken: ageInMinutes <= 30
      },
      liquidity: {
        sol: realToken.liquidityUsd / 50, // Rough SOL conversion (assuming $50/SOL)
        usd: realToken.liquidityUsd,
        poolAddress: realToken.pairAddress
      }
    };

    // Store for price tracking
    this.trackedTokens.set(realToken.address, realToken);

    // Start price tracking for this token
    this.startPriceTracking(realToken.address);

    console.log(`📊 New token detected: ${realToken.symbol} ($${realToken.priceUsd.toFixed(6)})`);
    console.log(`💰 Liquidity: $${realToken.liquidityUsd.toLocaleString()}`);
    console.log(`📈 24h Change: ${realToken.priceChange24h.toFixed(2)}%`);
    console.log(`🔥 Trending Score: ${realToken.trendingScore}/100`);

    logger.log('analysis', 'Real token detected', {
      address: realToken.address,
      symbol: realToken.symbol,
      priceUsd: realToken.priceUsd,
      liquidity: realToken.liquidityUsd,
      volume24h: realToken.volume24h,
      trendingScore: realToken.trendingScore,
      dexId: realToken.dexId
    });

    // Emit for analysis
    this.emit('tokenDetected', tokenInfo);
  }

  private startPriceTracking(address: string): void {
    // Track price every 10 seconds for active tokens
    const interval = setInterval(async () => {
      if (!this.isRunning || !this.trackedTokens.has(address)) {
        clearInterval(interval);
        this.priceTrackingIntervals.delete(address);
        return;
      }

      try {
        const currentPrice = await this.dexClient.getCurrentPrice(address);
        if (currentPrice !== null) {
          const token = this.trackedTokens.get(address)!;
          const previousPrice = token.priceUsd;
          
          // Update price
          token.priceUsd = currentPrice;
          
          // Calculate price change
          const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;
          
          // Emit price update
          this.emit('priceUpdate', {
            address,
            symbol: token.symbol,
            price: currentPrice,
            previousPrice,
            change: priceChange,
            timestamp: Date.now()
          });

          // Log significant price movements
          if (Math.abs(priceChange) > 5) {
            logger.verbose('Significant price movement', {
              address,
              symbol: token.symbol,
              oldPrice: previousPrice,
              newPrice: currentPrice,
              change: priceChange
            });
          }
        }
      } catch (error) {
        logger.warn('Failed to update price', {
          address,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 10000); // 10 seconds

    this.priceTrackingIntervals.set(address, interval);
  }

  // Get current price for a token
  async getCurrentTokenPrice(address: string): Promise<number | null> {
    const token = this.trackedTokens.get(address);
    if (token) {
      return token.priceUsd;
    }
    
    // Fallback to API call
    return await this.dexClient.getCurrentPrice(address);
  }

  // Get token info by address
  getTokenInfo(address: string): RealTokenInfo | null {
    return this.trackedTokens.get(address) || null;
  }

  // Get all tracked tokens
  getTrackedTokens(): RealTokenInfo[] {
    return Array.from(this.trackedTokens.values());
  }

  // Stop tracking a specific token
  stopTrackingToken(address: string): void {
    const interval = this.priceTrackingIntervals.get(address);
    if (interval) {
      clearInterval(interval);
      this.priceTrackingIntervals.delete(address);
    }
    this.trackedTokens.delete(address);
  }

  // Get stats about monitoring
  getMonitoringStats(): any {
    return {
      isRunning: this.isRunning,
      trackedTokensCount: this.trackedTokens.size,
      seenTokensCount: this.seenTokens.size,
      activeIntervals: this.priceTrackingIntervals.size
    };
  }
}