import { logger } from '../monitoring/logger';
import { DexScreenerResponse, DexScreenerPair, RealTokenInfo } from '../types/unified';
import { UnifiedTokenFilter, TokenFilterCriteria } from './unified-token-filter';
import { getConnectionManager } from '../core/singleton-manager';
// import { executeRequest } from '../core/request-manager'; // Removed - file deleted
import { apiCoordinator } from '../core/centralized-api-coordinator';

export class DexScreenerClient {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTimeout = 60000; // 60 seconds cache to reduce API calls
  private tokenFilter: UnifiedTokenFilter | null = null;
  private connectionManager: any = null;
  private apiGateway: any = null;
  private initialized = false;

  constructor() {
    this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    if (this.initialized) return;

    try {
      this.connectionManager = await getConnectionManager();
      // this.apiGateway = await getApiGateway(); // Disabled - api-gateway removed
      this.tokenFilter = new UnifiedTokenFilter(this.connectionManager.getConnection());
      this.initialized = true;
      logger.info('🔗 DexScreener client initialized (api-gateway disabled)');
    } catch (error) {
      logger.error('❌ Failed to initialize DexScreener client:', error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeAsync();
    }
  }

  // Throttling is now handled by the API gateway

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

  async getTrendingTokens(criteria?: TokenFilterCriteria): Promise<RealTokenInfo[]> {
    await this.ensureInitialized();
    
    const filterCriteria = criteria || UnifiedTokenFilter.AGGRESSIVE_CRITERIA;
    const endpoint = '/token-profiles/latest/v1';
    
    logger.info('Fetching latest Solana trading pairs via centralized coordinator', { criteria: filterCriteria });
    
    try {
      // Use centralized API coordinator - DISABLED (api-gateway removed)
      // const response = await apiCoordinator.makeRequest(...)
      logger.info('API Gateway disabled - returning empty result');
      const response = { success: false, error: 'API Gateway disabled', data: null, cached: false };

      if (!response.success) {
        logger.warn('Failed to fetch trending tokens via centralized coordinator', {
          error: response.error,
          cached: response.cached
        });
        return [];
      }

      const data = response.data as any;

      let allTokens: RealTokenInfo[] = [];
      if (data && data.pairs) {
        // Handle DexScreener trading pairs response format
        const pairs = data.pairs;
        logger.info(`Trading pairs returned ${pairs.length} pairs`);
        
        if (pairs.length > 0) {
          // Log sample pairs for debugging - commented out to reduce logs
           logger.info('Sample DexScreener pairs', {
             samplePairs: pairs.slice(0, 3).map((pair: any) => ({
               chainId: pair.chainId,
               dexId: pair.dexId,
               symbol: pair.baseToken?.symbol,
               priceUsd: pair.priceUsd,
               liquidity: pair.liquidity?.usd
             }))
           });
          
          // Convert all pairs to token info first
          const rawTokens = pairs
            .filter((pair: any) => pair.chainId === 'solana' && pair.priceUsd && parseFloat(pair.priceUsd) > 0)
            .map((pair: any) => this.convertPairToTokenInfo(pair))
            .filter((token: RealTokenInfo | null) => token !== null);
          
          logger.info(`Found ${rawTokens.length} Solana tokens from ${pairs.length} total pairs`);
          
          // Apply unified token filtering
          const filteredTokens = await this.tokenFilter!.filterTrendingTokens(rawTokens);
          logger.info(`After unified filtering: ${filteredTokens.length} tokens`);
          
          allTokens = filteredTokens;
        } else {
          logger.warn('No pairs found in response', { keys: Object.keys(data) });
        }
      }
      
      // Remove duplicates and sort by trending score
      const uniqueTokens = this.removeDuplicatesAndSort(allTokens);
      const limitedTokens = uniqueTokens.slice(0, 10); // Limit to top 10
      
      logger.info('Successfully fetched trending tokens via centralized coordinator', { 
        totalFound: allTokens.length,
        uniqueTokens: uniqueTokens.length,
        filtered: limitedTokens.length,
        cached: response.cached
      });

      return limitedTokens;

    } catch (error: any) {
      // Centralized coordinator handles rate limiting and retries automatically
      logger.warn('Failed to fetch trending tokens via centralized coordinator', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return empty array if API fails
      return [];
    }
  }

  async getTokenDetails(address: string): Promise<RealTokenInfo | null> {
    const cacheKey = `token_${address}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = `/latest/dex/tokens/${address}`;
      
      logger.verbose('Fetching token details via API gateway', { address });
      
      // const response = await this.apiGateway!.requestDexScreener(url) as DexScreenerResponse;
      logger.warn('API Gateway disabled - returning null');
      const response = null as any;

      if (!response || !response.pairs || response.pairs.length === 0) {
        return null;
      }

      // Use the first pair (usually the most liquid)
      const pair = response.pairs[0];
      const tokenInfo = this.convertPairToTokenInfo(pair);
      if (!tokenInfo) {
        logger.warn(`Invalid token address for ${pair.baseToken.symbol}, skipping`);
        return null;
      }
      
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
  
  // Alias for compatibility
  async getTokenByAddress(address: string): Promise<RealTokenInfo | null> {
    return this.getTokenDetails(address);
  }

  async searchNewTokens(): Promise<RealTokenInfo[]> {
    // Use aggressive criteria for maximum detection
    return this.getTrendingTokens(UnifiedTokenFilter.AGGRESSIVE_CRITERIA);
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




  private convertPairToTokenInfo(pair: DexScreenerPair): RealTokenInfo | null {
    const now = Date.now();
     
    // Validate Solana address format before processing
    if (!this.isValidSolanaAddress(pair.baseToken.address)) {
      logger.warn(`Skipping token with invalid Solana address: ${pair.baseToken.symbol} (${pair.baseToken.address})`);
      return null;
    }
    
    return {
      chainId: pair.chainId,
      address: pair.baseToken.address,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      decimals: 9,
      supply: '1000000000',
      price: parseFloat(pair.priceUsd || '0'),
      liquidity: {
        usd: pair.liquidity?.usd || 0,
        sol: (pair.liquidity?.usd || 0) / 150
      },
      age: pair.pairCreatedAt ? Math.floor((Date.now() - pair.pairCreatedAt) / 1000) : 0,
      source: 'dexscreener',
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

  private convertBoostToTokenInfo(boost: any): RealTokenInfo | null {
    const now = Date.now();
    
    // Validate Solana address format before processing
    if (!this.isValidSolanaAddress(boost.tokenAddress)) {
      logger.warn(`Skipping boost with invalid Solana address: ${boost.description} (${boost.tokenAddress})`);
      return null;
    }
    
    // Extract symbol from description (fallback to first word)
    const symbol = boost.description ? boost.description.split(' ')[0].toUpperCase() : 'BOOST';
    
    return {
      chainId: boost.chainId,
      address: boost.tokenAddress,
      name: boost.description || 'Boosted Token',
      symbol: symbol,
      decimals: 9,
      supply: '1000000000',
      price: 0,
      liquidity: {
        usd: 0,
        sol: 0
      },
      age: 0,
      source: 'dexscreener_boost',
      priceUsd: 0, // Not available in boost data
      priceNative: '0',
      volume24h: 0, // Not available in boost data
      volume1h: 0,
      volume5m: 0,
      priceChange24h: 0, // Not available in boost data
      priceChange1h: 0,
      priceChange5m: 0,
      liquidityUsd: 0, // Not available in boost data
      marketCap: 0,
      fdv: 0,
      txns24h: 0, // Not available in boost data
      txns1h: 0,
      txns5m: 0,
      pairAddress: '', // Not available in boost data
      dexId: 'boost', // Mark as boost source
      pairCreatedAt: now,
      imageUrl: boost.icon,
      websites: boost.links ? boost.links.filter((link: any) => link.type === 'website').map((link: any) => link.url) : [],
      socials: boost.links ? boost.links.filter((link: any) => link.type !== 'website').map((link: any) => ({ type: link.type, url: link.url })) : [],
      trendingScore: Math.min(100, (boost.totalAmount || 0) + (boost.amount || 0)), // Use boost amounts as trending score
      riskScore: 50, // Default risk score for boosted tokens
      detected: true,
      detectedAt: now
    };
  }

  private isValidSolanaAddress(address: string): boolean {
    try {
      // Check basic format - Solana addresses are base58 and typically 32-44 characters
      if (!address || address.length < 32 || address.length > 44) {
        return false;
      }
      
      // Check for Ethereum address format (0x...)
      if (address.startsWith('0x')) {
        return false;
      }
      
      // Check for valid base58 characters only
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(address)) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
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
    return tokenInfo ? (tokenInfo.priceUsd || null) : null;
  }

  // Get latest boosted tokens for pump detection
  async getLatestBoosts(): Promise<RealTokenInfo[]> {
    const endpoint = '/token-boosts/latest/v1';
    
    try {
      // Use centralized API coordinator for global rate limiting and deduplication
      const response = await apiCoordinator.makeRequest(
        endpoint,
        () => { throw new Error('API Gateway disabled'); },
        'DexScreenerClient-getLatestBoosts',
        {
          priority: 1, // High priority for boosted tokens
          maxRetries: 1,
          cacheTtl: this.cacheTimeout,
          deduplicationKey: 'latest_boosts'
        }
      );

      if (!response.success) {
        logger.warn('Failed to fetch latest boosts via centralized coordinator', {
          error: response.error,
          cached: response.cached
        });
        return [];
      }

      const data = response.data;

      let boostedTokens: RealTokenInfo[] = [];
      if (data && data.length) {
        const pairs = data;
        logger.info(`Trading pairs returned ${pairs.length} pairs for boost analysis`);
        
        // Convert boost data to tokens (different format than pairs)
        const rawTokens = pairs
          .filter((boost: any) => boost.chainId === 'solana')
          .map((boost: any) => this.convertBoostToTokenInfo(boost))
          .filter((token: RealTokenInfo | null) => token !== null);
        
        // Apply aggressive filtering for high-momentum tokens
        const boostCriteria: TokenFilterCriteria = {
          ...UnifiedTokenFilter.AGGRESSIVE_CRITERIA,
          minPriceChangePercent: 5,
          minVolume5m: 1000,
          minTransactions5m: 10
        };
        
        const filteredTokens: RealTokenInfo[] = [];
        for (const token of rawTokens) {
          const result = await this.tokenFilter!.filterToken(token, boostCriteria);
          if (result.passed) {
            filteredTokens.push(token);
          }
        }
        
        logger.info(`Found ${filteredTokens.length} boost candidate tokens after filtering`);
        boostedTokens = filteredTokens;
      }

      logger.info('Successfully fetched latest boosted tokens via centralized coordinator', { 
        count: boostedTokens.length,
        cached: response.cached
      });

      return boostedTokens;

    } catch (error) {
      logger.debug('Primary boost endpoint failed, trying fallback strategies', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Try fallback strategies
      try {
        // Strategy 1: Use top boosts as fallback
        const topBoosts = await this.getTopBoostsFallback();
        if (topBoosts.length > 0) {
          logger.info(`Using ${topBoosts.length} top boost tokens as fallback for latest boosts`);
          return topBoosts;
        }
        
        // Strategy 2: Use trending tokens as last resort
        const trendingTokens = await this.getTrendingTokensFallback();
        if (trendingTokens.length > 0) {
          logger.info(`Using ${trendingTokens.length} trending tokens as fallback for latest boosts`);
          return trendingTokens;
        }
        
      } catch (fallbackError) {
        logger.debug('Fallback strategies also failed', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
      }
      
      // Log as info instead of warn since we have fallback strategies
      logger.info('All boost strategies failed, returning empty array - this is normal during high load periods');
      return [];
    }
  }

  // Get top boosted tokens
  async getTopBoosts(): Promise<RealTokenInfo[]> {
    const endpoint = '/token-boosts/top/v1';
    
    try {
      // Use centralized API coordinator for global rate limiting and deduplication
      logger.info('Fetching Solana trading pairs for top activity analysis via centralized coordinator');
      
      const response = await apiCoordinator.makeRequest(
        endpoint,
        () => { throw new Error('API Gateway disabled'); },
        'DexScreenerClient-getTopBoosts',
        {
          priority: 1, // High priority for top boosted tokens
          maxRetries: 1,
          cacheTtl: this.cacheTimeout,
          deduplicationKey: 'top_boosts'
        }
      );

      if (!response.success) {
        logger.warn('Failed to fetch top boosts via centralized coordinator', {
          error: response.error,
          cached: response.cached
        });
        return [];
      }

      const data = response.data;

      let topBoostedTokens: RealTokenInfo[] = [];

      if (data && data.pairs) {
        const pairs = data.pairs;
        logger.info(`Trading pairs returned ${pairs.length} pairs for top activity analysis`);
        
        // Convert and filter for top performing tokens
        const rawTokens = pairs
          .filter((pair: any) => pair.chainId === 'solana')
          .map((pair: any) => this.convertPairToTokenInfo(pair))
          .filter((token: RealTokenInfo | null) => token !== null);
        
        // Apply conservative filtering for top tokens
        const topCriteria: TokenFilterCriteria = {
          ...UnifiedTokenFilter.CONSERVATIVE_CRITERIA,
          minVolume24h: 10000,
          minTransactions24h: 50
        };
        
        const filteredTokens: RealTokenInfo[] = [];
        for (const token of rawTokens) {
          const result = await this.tokenFilter!.filterToken(token, topCriteria);
          if (result.passed) {
            filteredTokens.push(token);
          }
        }
        
        // Sort by trending score and take top 20
        topBoostedTokens = filteredTokens
          .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
          .slice(0, 20);
        
        logger.info(`Found ${topBoostedTokens.length} top activity tokens after filtering`);
      }

      logger.info('Successfully fetched top boosted tokens via centralized coordinator', { 
        count: topBoostedTokens.length,
        cached: response.cached
      });

      return topBoostedTokens;

    } catch (error) {
      logger.warn('Failed to fetch top boosted tokens via centralized coordinator', {
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

      // Combine and deduplicate using unified filter
      const allBoosts = [...latestBoosts, ...topBoosts];
      const uniqueBoosts = this.removeDuplicatesAndSort(allBoosts);
      
      // Final filtering pass with aggressive criteria
      const finalFiltered = await this.tokenFilter!.filterTrendingTokens(uniqueBoosts);
      
      logger.info('Combined boosted tokens', {
        latest: latestBoosts.length,
        top: topBoosts.length,
        unique: uniqueBoosts.length
      });

      return finalFiltered;
    } catch (error) {
      logger.error('Failed to fetch boosted tokens', { error });
      return [];
    }
  }

  // Fallback method for getting top boosts when latest fails
  private async getTopBoostsFallback(): Promise<RealTokenInfo[]> {
    try {
      const topBoosts = await this.getTopBoosts();
      // Return only a subset to simulate "latest" behavior
      return topBoosts.slice(0, 10);
    } catch (error) {
      logger.debug('Top boosts fallback failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  // Fallback method for getting trending tokens when boosts fail
  private async getTrendingTokensFallback(): Promise<RealTokenInfo[]> {
    try {
      const trendingTokens = await this.getTrendingTokens();
      // Return only a subset to simulate "latest" behavior
      return trendingTokens.slice(0, 5);
    } catch (error) {
      logger.debug('Trending tokens fallback failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  // Clear cache manually if needed
  clearCache(): void {
    this.cache.clear();
    logger.info('DexScreener cache cleared');
  }

  // Get API gateway statistics
  getApiStats(): any {
    return this.apiGateway.getStats();
  }

  // Get client statistics including cache and filter stats
  getClientStats(): any {
    return {
      cacheSize: this.cache.size,
      cacheTimeout: this.cacheTimeout,
      apiGatewayStats: this.apiGateway?.getStats(),
      filterStats: this.tokenFilter?.getFilterStats()
    };
  }
}