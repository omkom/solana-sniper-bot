import axios from 'axios';
import { logger } from '../monitoring/logger';
import { DexScreenerResponse, DexScreenerPair, RealTokenInfo, MarketFilters } from '../types/dexscreener';

export class DexScreenerClient {
  private baseUrl = 'https://api.dexscreener.com';
  private lastRequestTime = 0;
  private rateLimitDelay = 2000; // 2 seconds between requests
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTimeout = 30000; // 30 seconds cache

  constructor() {
    console.log('🔗 DexScreener API client initialized');
  }

  private async throttleRequest(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const delay = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  private getCachedData(cacheKey: string): any | null {
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCachedData(cacheKey: string, data: any): void {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  async getTrendingTokens(filters?: Partial<MarketFilters>): Promise<RealTokenInfo[]> {
    const defaultFilters: MarketFilters = {
      chainIds: ['solana'],
      dexIds: ['pumpfun', 'raydium', 'orca', 'meteora', 'pumpswap'],
      rankBy: 'trendingScoreM5',
      order: 'desc',
      minLiquidity: 500, // $500 min liquidity for real tokens
      maxAge: 3, // 3 hours max age
      minVolume: 100 // $100 min volume (relaxed for testing)
    };

    const finalFilters = { ...defaultFilters, ...filters };
    const cacheKey = `trending_${JSON.stringify(finalFilters)}`;
    
    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      logger.verbose('Retrieved trending tokens from cache', { count: cached.length });
      return cached;
    }

    await this.throttleRequest();

    try {
      // Use the search endpoint to find trending pairs
      const url = `${this.baseUrl}/latest/dex/search`;
      const searchQuery = 'SOL'; // Search for SOL pairs
      
      logger.info('Fetching latest trading pairs', { filters: finalFilters });
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Educational-Token-Analyzer/1.0'
        },
        params: {
          q: searchQuery
        }
      });

      let allTokens: RealTokenInfo[] = [];

      if (response.data) {
        // Handle DexScreener trading pairs response format
        let pairs = [];
        if (response.data.pairs) {
          pairs = response.data.pairs;
          logger.info(`Trading pairs returned ${pairs.length} pairs`);
        } else {
          logger.warn('No pairs found in response', { keys: Object.keys(response.data) });
        }
        
        if (pairs.length > 0) {
          // Filter to Solana chain first
          const solanaPairs = pairs.filter((pair: any) => pair.chainId === 'solana');
          logger.info(`Found ${solanaPairs.length} Solana pairs`);
          
          // Apply basic filtering and convert to our format
          const filteredPairs = solanaPairs.filter((pair: any) => {
            return pair.priceUsd && parseFloat(pair.priceUsd) > 0 &&
                   pair.liquidity?.usd && 
                   (finalFilters.minLiquidity === undefined || pair.liquidity.usd >= finalFilters.minLiquidity);
          });
          
          const tokens = filteredPairs.map((pair: any) => this.convertPairToTokenInfo(pair));
          logger.info(`After filtering: ${tokens.length} tokens`);
          allTokens = tokens;
        }
      }
      
      // Remove duplicates and sort by trending score
      const uniqueTokens = this.removeDuplicatesAndSort(allTokens);
      const limitedTokens = uniqueTokens.slice(0, 10); // Limit to top 10
      
      // Cache the results
      this.setCachedData(cacheKey, limitedTokens);
      
      logger.info('Successfully fetched trending tokens', { 
        totalFound: allTokens.length,
        uniqueTokens: uniqueTokens.length,
        filtered: limitedTokens.length 
      });

      return limitedTokens;

    } catch (error) {
      logger.error('Failed to fetch trending tokens', {
        error: error instanceof Error ? error.message : String(error),
        filters: finalFilters
      });
      
      // Return empty array if API fails - no demo tokens
      return [];
    }
  }

  async getTokenDetails(address: string): Promise<RealTokenInfo | null> {
    const cacheKey = `token_${address}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    await this.throttleRequest();

    try {
      const url = `${this.baseUrl}/latest/dex/tokens/${address}`;
      
      logger.verbose('Fetching token details', { address });
      
      const response = await axios.get<DexScreenerResponse>(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Educational-Token-Analyzer/1.0'
        }
      });

      if (!response.data || !response.data.pairs || response.data.pairs.length === 0) {
        return null;
      }

      // Use the first pair (usually the most liquid)
      const pair = response.data.pairs[0];
      const tokenInfo = this.convertPairToTokenInfo(pair);
      
      this.setCachedData(cacheKey, tokenInfo);
      
      return tokenInfo;

    } catch (error) {
      logger.warn('Failed to fetch token details', {
        address,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  async searchNewTokens(): Promise<RealTokenInfo[]> {
    // Get tokens created in the last 30 minutes
    const filters: Partial<MarketFilters> = {
      maxAge: 3, // 3 hours in hours
      minLiquidity: 500, // Real minimum for serious tokens
      minVolume: 1000, // Real minimum volume
      rankBy: 'trendingScoreM5'
    };

    return this.getTrendingTokens(filters);
  }

  private removeDuplicatesAndSort(tokens: RealTokenInfo[]): RealTokenInfo[] {
    // Remove duplicates by address
    const uniqueTokens = new Map<string, RealTokenInfo>();
    
    for (const token of tokens) {
      const key = token.address;
      const existingToken = uniqueTokens.get(key);
      const currentScore = token.trendingScore || 0;
      const existingScore = existingToken?.trendingScore || 0;
      
      if (!existingToken || currentScore > existingScore) {
        uniqueTokens.set(key, token);
      }
    }
    
    // Convert back to array and sort by trending score
    return Array.from(uniqueTokens.values())
      .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0));
  }



  private processPairsData(pairs: DexScreenerPair[], filters: MarketFilters): RealTokenInfo[] {
    const now = Date.now();
    const maxAgeMs = filters.maxAge ? filters.maxAge * 60 * 60 * 1000 : Infinity;
    
    return pairs
      .filter(pair => {
        // Filter by DEX (chainId already filtered in calling function)
        if (!filters.dexIds.includes(pair.dexId)) return false;
        
        // Filter by age
        if (pair.pairCreatedAt && (now - pair.pairCreatedAt) > maxAgeMs) return false;
        
        // Filter by liquidity
        if (filters.minLiquidity && (!pair.liquidity?.usd || pair.liquidity.usd < filters.minLiquidity)) return false;
        
        // Filter by volume
        if (filters.minVolume && pair.volume.h24 < filters.minVolume) return false;
        
        // Must have USD price
        if (!pair.priceUsd || parseFloat(pair.priceUsd) <= 0) return false;
        
        return true;
      })
      .map(pair => this.convertPairToTokenInfo(pair))
      .slice(0, 50); // Limit to 50 tokens
  }

  private convertPairToTokenInfo(pair: DexScreenerPair): RealTokenInfo {
    const now = Date.now();
    
    return {
      chainId: pair.chainId,
      address: pair.baseToken.address,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      priceUsd: parseFloat(pair.priceUsd || '0'),
      priceNative: pair.priceNative,
      volume24h: pair.volume.h24,
      volume1h: pair.volume.h1,
      volume5m: pair.volume.m5,
      priceChange24h: pair.priceChange.h24,
      priceChange1h: pair.priceChange.h1,
      priceChange5m: pair.priceChange.m5,
      liquidityUsd: pair.liquidity?.usd || 0,
      marketCap: pair.marketCap,
      fdv: pair.fdv,
      txns24h: (pair.txns.h24.buys + pair.txns.h24.sells),
      txns1h: (pair.txns.h1.buys + pair.txns.h1.sells),
      txns5m: (pair.txns.m5.buys + pair.txns.m5.sells),
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      pairCreatedAt: pair.pairCreatedAt,
      imageUrl: pair.info?.imageUrl,
      websites: pair.info?.websites?.map(w => w.url),
      socials: pair.info?.socials,
      trendingScore: this.calculateTrendingScore(pair),
      detected: true,
      detectedAt: now
    };
  }

  private calculateTrendingScore(pair: DexScreenerPair): number {
    // Simple trending score calculation
    let score = 0;
    
    // Volume momentum (40% weight)
    const volumeRatio = pair.volume.m5 / Math.max(pair.volume.h1 / 12, 1); // m5 vs average h1
    score += Math.min(volumeRatio * 40, 40);
    
    // Price change momentum (30% weight)
    if (pair.priceChange.m5 > 0) {
      score += Math.min(pair.priceChange.m5 * 30, 30);
    }
    
    // Transaction activity (20% weight)
    const txnActivity = (pair.txns.m5.buys + pair.txns.m5.sells) / Math.max((pair.txns.h1.buys + pair.txns.h1.sells) / 12, 1);
    score += Math.min(txnActivity * 20, 20);
    
    // Liquidity bonus (10% weight)
    if (pair.liquidity?.usd && pair.liquidity.usd > 10000) {
      score += 10;
    } else if (pair.liquidity?.usd && pair.liquidity.usd > 5000) {
      score += 5;
    }
    
    return Math.round(Math.min(score, 100));
  }

  // Get current price for a token (for live tracking)
  async getCurrentPrice(address: string): Promise<number | null> {
    const tokenInfo = await this.getTokenDetails(address);
    return tokenInfo ? tokenInfo.priceUsd : null;
  }

  // Get latest boosted tokens for pump detection
  async getLatestBoosts(): Promise<RealTokenInfo[]> {
    const cacheKey = 'latest_boosts';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      logger.verbose('Retrieved latest boosts from cache', { count: cached.length });
      return cached;
    }

    await this.throttleRequest();

    try {
      // Use search endpoint to find active pairs for boost analysis
      const url = `${this.baseUrl}/latest/dex/search`;
      
      logger.info('Fetching latest trading pairs for boost analysis');
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Educational-Token-Analyzer/1.0'
        },
        params: {
          q: 'SOL'
        }
      });

      let boostedTokens: RealTokenInfo[] = [];

      if (response.data && response.data.pairs) {
        const pairs = response.data.pairs;
        logger.info(`Trading pairs returned ${pairs.length} pairs for boost analysis`);
        
        // Filter for high-volume/trending tokens as boost candidates
        const boostCandidates = pairs.filter((pair: any) => {
          return pair.priceChange?.m5 > 10 || // 10%+ price increase in 5 minutes
                 pair.volume?.m5 > 5000 ||      // High 5-minute volume
                 (pair.txns?.m5?.buys + pair.txns?.m5?.sells) > 20; // High transaction activity
        });
        
        logger.info(`Found ${boostCandidates.length} boost candidate pairs`);
        boostedTokens = boostCandidates.map((pair: DexScreenerPair) => this.convertPairToTokenInfo(pair));
      }

      // Cache the results
      this.setCachedData(cacheKey, boostedTokens);
      
      logger.info('Successfully fetched latest boosted tokens', { 
        count: boostedTokens.length
      });

      return boostedTokens;

    } catch (error) {
      logger.error('Failed to fetch latest boosted tokens', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  // Get top boosted tokens
  async getTopBoosts(): Promise<RealTokenInfo[]> {
    const cacheKey = 'top_boosts';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      logger.verbose('Retrieved top boosts from cache', { count: cached.length });
      return cached;
    }

    await this.throttleRequest();

    try {
      // Use search endpoint to find top active pairs
      const url = `${this.baseUrl}/latest/dex/search`;
      
      logger.info('Fetching trading pairs for top activity analysis');
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Educational-Token-Analyzer/1.0'
        },
        params: {
          q: 'USDC' // Search for USDC pairs for better liquidity
        }
      });

      let topBoostedTokens: RealTokenInfo[] = [];

      if (response.data && response.data.pairs) {
        const pairs = response.data.pairs;
        logger.info(`Trading pairs returned ${pairs.length} pairs for top activity analysis`);
        
        // Filter for top performing tokens (highest activity/momentum)
        const topCandidates = pairs
          .filter((pair: any) => pair.volume?.h24 > 10000) // Minimum 24h volume
          .sort((a: any, b: any) => {
            // Sort by a combination of volume and price change
            const scoreA = (a.volume?.h24 || 0) * (1 + (a.priceChange?.h24 || 0) / 100);
            const scoreB = (b.volume?.h24 || 0) * (1 + (b.priceChange?.h24 || 0) / 100);
            return scoreB - scoreA;
          })
          .slice(0, 20); // Top 20
        
        logger.info(`Found ${topCandidates.length} top activity pairs`);
        topBoostedTokens = topCandidates.map((pair: DexScreenerPair) => this.convertPairToTokenInfo(pair));
      }

      // Cache the results
      this.setCachedData(cacheKey, topBoostedTokens);
      
      logger.info('Successfully fetched top boosted tokens', { 
        count: topBoostedTokens.length
      });

      return topBoostedTokens;

    } catch (error) {
      logger.error('Failed to fetch top boosted tokens', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  // Combined method to get all boosted tokens for pump detection
  async getBoostedTokens(): Promise<RealTokenInfo[]> {
    try {
      const [latestBoosts, topBoosts] = await Promise.all([
        this.getLatestBoosts(),
        this.getTopBoosts()
      ]);

      // Combine and deduplicate
      const allBoosts = [...latestBoosts, ...topBoosts];
      const uniqueBoosts = this.removeDuplicatesAndSort(allBoosts);
      
      logger.info('Combined boosted tokens', {
        latest: latestBoosts.length,
        top: topBoosts.length,
        unique: uniqueBoosts.length
      });

      return uniqueBoosts;
    } catch (error) {
      logger.error('Failed to fetch boosted tokens', { error });
      return [];
    }
  }

  // Clear cache manually if needed
  clearCache(): void {
    this.cache.clear();
    logger.info('DexScreener cache cleared');
  }
}