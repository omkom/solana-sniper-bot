/**
 * Consolidated API Service
 * Merges functionality from all API clients and services:
 * - DexScreenerClient
 * - SolscanAPI
 * - EfficientAPIService
 * - EfficientTokenService
 * - SimplePriceTracker
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { apiCoordinator } from '../core/centralized-api-coordinator';
import { getApiGateway } from '../core/singleton-manager';
import { UnifiedTokenInfo } from '../types/unified';

export interface ApiServiceConfig {
  enableDexScreener: boolean;
  enableSolscan: boolean;
  enableJupiter: boolean;
  enabledEndpoints: string[];
  cacheTimeout: number;
  rateLimitDelay: number;
  maxRetries: number;
  priority: {
    dexscreener: number;
    solscan: number;
    jupiter: number;
  };
}

export interface TokenData {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  price: number;
  priceUsd: number;
  volume24h: number;
  volume1h: number;
  volume5m: number;
  liquidity: {
    usd: number;
    sol: number;
  };
  marketCap: number;
  fdv: number;
  priceChange24h: number;
  priceChange1h: number;
  priceChange5m: number;
  transactions: {
    h24: number;
    h1: number;
    m5: number;
  };
  dexId: string;
  pairAddress: string;
  source: string;
  timestamp: number;
}

export interface PriceData {
  address: string;
  symbol: string;
  price: number;
  priceUsd: number;
  timestamp: number;
  source: string;
  change24h: number;
  volume24h: number;
}

export interface LiquidityData {
  address: string;
  symbol: string;
  liquidity: {
    usd: number;
    sol: number;
  };
  timestamp: number;
  source: string;
}

export interface TransactionData {
  signature: string;
  timestamp: number;
  type: string;
  amount: number;
  price: number;
  from: string;
  to: string;
  token: string;
  success: boolean;
}

export class ConsolidatedApiService extends EventEmitter {
  private config: ApiServiceConfig;
  private apiGateway: any;
  private initialized = false;
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  
  // Statistics
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    cachedRequests: 0,
    averageResponseTime: 0,
    lastRequest: 0
  };

  constructor(config: Partial<ApiServiceConfig> = {}) {
    super();
    
    this.config = {
      enableDexScreener: true,
      enableSolscan: true,
      enableJupiter: true,
      enabledEndpoints: ['dexscreener', 'solscan', 'jupiter'],
      cacheTimeout: 60000, // 1 minute
      rateLimitDelay: 1000,
      maxRetries: 2,
      priority: {
        dexscreener: 5,
        solscan: 4,
        jupiter: 3
      },
      ...config
    };
    
    this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.apiGateway = await getApiGateway();
      this.initialized = true;
      
      logger.info('🌐 Consolidated API Service initialized', {
        enabledEndpoints: this.config.enabledEndpoints
      });
    } catch (error) {
      logger.error('❌ Failed to initialize API service:', error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeAsync();
    }
  }

  // Token Information Methods
  async getTokenInfo(address: string): Promise<TokenData | null> {
    await this.ensureInitialized();
    
    const cacheKey = `token_info_${address}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cachedRequests++;
      return cached;
    }
    
    try {
      // Try DexScreener first (highest priority)
      if (this.config.enableDexScreener) {
        const dexScreenerData = await this.getDexScreenerTokenInfo(address);
        if (dexScreenerData) {
          this.setCache(cacheKey, dexScreenerData, this.config.cacheTimeout);
          return dexScreenerData;
        }
      }
      
      // Try Solscan as fallback
      if (this.config.enableSolscan) {
        const solscanData = await this.getSolscanTokenInfo(address);
        if (solscanData) {
          this.setCache(cacheKey, solscanData, this.config.cacheTimeout);
          return solscanData;
        }
      }
      
      // Try Jupiter as last resort
      if (this.config.enableJupiter) {
        const jupiterData = await this.getJupiterTokenInfo(address);
        if (jupiterData) {
          this.setCache(cacheKey, jupiterData, this.config.cacheTimeout);
          return jupiterData;
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get token info for ${address}:`, error);
      this.stats.failedRequests++;
      return null;
    }
  }

  async getTrendingTokens(limit: number = 20): Promise<TokenData[]> {
    await this.ensureInitialized();
    
    const cacheKey = `trending_tokens_${limit}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cachedRequests++;
      return cached;
    }
    
    try {
      const startTime = Date.now();
      
      // Use centralized API coordinator
      const response = await apiCoordinator.makeRequest(
        '/token-profiles/latest/v1',
        () => this.apiGateway.requestDexScreener('/token-profiles/latest/v1'),
        'ConsolidatedApiService-getTrendingTokens',
        {
          priority: this.config.priority.dexscreener,
          maxRetries: this.config.maxRetries,
          cacheTtl: this.config.cacheTimeout,
          deduplicationKey: `trending_${limit}`
        }
      );
      
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, response.success);
      
      if (response.success && response.data) {
        const tokens = this.parseDexScreenerTrendingResponse(response.data, limit);
        this.setCache(cacheKey, tokens, this.config.cacheTimeout);
        return tokens;
      }
      
      return [];
    } catch (error) {
      logger.error('Failed to get trending tokens:', error);
      this.stats.failedRequests++;
      return [];
    }
  }

  async getBoostedTokens(limit: number = 20): Promise<TokenData[]> {
    await this.ensureInitialized();
    
    const cacheKey = `boosted_tokens_${limit}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cachedRequests++;
      return cached;
    }
    
    try {
      const startTime = Date.now();
      
      // Use centralized API coordinator
      const response = await apiCoordinator.makeRequest(
        '/token-boosts/latest/v1',
        () => this.apiGateway.requestDexScreener('/token-boosts/latest/v1'),
        'ConsolidatedApiService-getBoostedTokens',
        {
          priority: this.config.priority.dexscreener,
          maxRetries: this.config.maxRetries,
          cacheTtl: this.config.cacheTimeout,
          deduplicationKey: `boosted_${limit}`
        }
      );
      
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime, response.success);
      
      if (response.success && response.data) {
        const tokens = this.parseDexScreenerBoostedResponse(response.data, limit);
        this.setCache(cacheKey, tokens, this.config.cacheTimeout);
        return tokens;
      }
      
      return [];
    } catch (error) {
      logger.error('Failed to get boosted tokens:', error);
      this.stats.failedRequests++;
      return [];
    }
  }

  // Price Information Methods
  async getTokenPrice(address: string): Promise<PriceData | null> {
    await this.ensureInitialized();
    
    const cacheKey = `price_${address}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cachedRequests++;
      return cached;
    }
    
    try {
      const tokenInfo = await this.getTokenInfo(address);
      if (tokenInfo) {
        const priceData: PriceData = {
          address: tokenInfo.address,
          symbol: tokenInfo.symbol,
          price: tokenInfo.price,
          priceUsd: tokenInfo.priceUsd,
          timestamp: Date.now(),
          source: tokenInfo.source,
          change24h: tokenInfo.priceChange24h,
          volume24h: tokenInfo.volume24h
        };
        
        this.setCache(cacheKey, priceData, 30000); // 30 seconds for price data
        return priceData;
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get price for ${address}:`, error);
      this.stats.failedRequests++;
      return null;
    }
  }

  async getMultipleTokenPrices(addresses: string[]): Promise<Map<string, PriceData>> {
    await this.ensureInitialized();
    
    const results = new Map<string, PriceData>();
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (address) => {
        const priceData = await this.getTokenPrice(address);
        if (priceData) {
          results.set(address, priceData);
        }
      });
      
      await Promise.all(batchPromises);
      
      // Add small delay between batches
      if (i + batchSize < addresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  // Liquidity Information Methods
  async getTokenLiquidity(address: string): Promise<LiquidityData | null> {
    await this.ensureInitialized();
    
    try {
      const tokenInfo = await this.getTokenInfo(address);
      if (tokenInfo) {
        const liquidityData: LiquidityData = {
          address: tokenInfo.address,
          symbol: tokenInfo.symbol,
          liquidity: tokenInfo.liquidity,
          timestamp: Date.now(),
          source: tokenInfo.source
        };
        
        return liquidityData;
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to get liquidity for ${address}:`, error);
      this.stats.failedRequests++;
      return null;
    }
  }

  // Transaction Information Methods
  async getTokenTransactions(address: string, limit: number = 20): Promise<TransactionData[]> {
    await this.ensureInitialized();
    
    const cacheKey = `transactions_${address}_${limit}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cachedRequests++;
      return cached;
    }
    
    try {
      if (this.config.enableSolscan) {
        const transactions = await this.getSolscanTransactions(address, limit);
        this.setCache(cacheKey, transactions, this.config.cacheTimeout);
        return transactions;
      }
      
      return [];
    } catch (error) {
      logger.error(`Failed to get transactions for ${address}:`, error);
      this.stats.failedRequests++;
      return [];
    }
  }

  // Private API-specific methods
  private async getDexScreenerTokenInfo(address: string): Promise<TokenData | null> {
    try {
      const response = await apiCoordinator.makeRequest(
        `/latest/dex/tokens/${address}`,
        () => this.apiGateway.requestDexScreener(`/latest/dex/tokens/${address}`),
        'ConsolidatedApiService-getDexScreenerTokenInfo',
        {
          priority: this.config.priority.dexscreener,
          maxRetries: this.config.maxRetries,
          cacheTtl: this.config.cacheTimeout,
          deduplicationKey: `dexscreener_token_${address}`
        }
      );
      
      if (response.success && response.data?.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        return this.convertDexScreenerPairToTokenData(pair);
      }
      
      return null;
    } catch (error) {
      logger.debug(`DexScreener API error for ${address}:`, error);
      return null;
    }
  }

  private async getSolscanTokenInfo(address: string): Promise<TokenData | null> {
    try {
      const response = await apiCoordinator.makeRequest(
        `/v2.0/account/token?address=${address}`,
        () => this.apiGateway.requestSolscan(`/v2.0/account/token?address=${address}`),
        'ConsolidatedApiService-getSolscanTokenInfo',
        {
          priority: this.config.priority.solscan,
          maxRetries: this.config.maxRetries,
          cacheTtl: this.config.cacheTimeout,
          deduplicationKey: `solscan_token_${address}`
        }
      );
      
      if (response.success && response.data) {
        return this.convertSolscanResponseToTokenData(response.data, address);
      }
      
      return null;
    } catch (error) {
      logger.debug(`Solscan API error for ${address}:`, error);
      return null;
    }
  }

  private async getJupiterTokenInfo(address: string): Promise<TokenData | null> {
    try {
      const response = await apiCoordinator.makeRequest(
        `/v6/tokens/${address}`,
        () => this.apiGateway.requestJupiter(`/v6/tokens/${address}`),
        'ConsolidatedApiService-getJupiterTokenInfo',
        {
          priority: this.config.priority.jupiter,
          maxRetries: this.config.maxRetries,
          cacheTtl: this.config.cacheTimeout,
          deduplicationKey: `jupiter_token_${address}`
        }
      );
      
      if (response.success && response.data) {
        return this.convertJupiterResponseToTokenData(response.data, address);
      }
      
      return null;
    } catch (error) {
      logger.debug(`Jupiter API error for ${address}:`, error);
      return null;
    }
  }

  private async getSolscanTransactions(address: string, limit: number): Promise<TransactionData[]> {
    try {
      const response = await apiCoordinator.makeRequest(
        `/v2.0/account/transactions?address=${address}&limit=${limit}`,
        () => this.apiGateway.requestSolscan(`/v2.0/account/transactions?address=${address}&limit=${limit}`),
        'ConsolidatedApiService-getSolscanTransactions',
        {
          priority: this.config.priority.solscan,
          maxRetries: this.config.maxRetries,
          cacheTtl: this.config.cacheTimeout,
          deduplicationKey: `solscan_transactions_${address}_${limit}`
        }
      );
      
      if (response.success && response.data) {
        return this.convertSolscanTransactionsResponse(response.data);
      }
      
      return [];
    } catch (error) {
      logger.debug(`Solscan transactions error for ${address}:`, error);
      return [];
    }
  }

  // Response conversion methods
  private convertDexScreenerPairToTokenData(pair: any): TokenData {
    return {
      address: pair.baseToken.address,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      decimals: 9,
      price: parseFloat(pair.priceUsd || '0'),
      priceUsd: parseFloat(pair.priceUsd || '0'),
      volume24h: pair.volume.h24 || 0,
      volume1h: pair.volume.h1 || 0,
      volume5m: pair.volume.m5 || 0,
      liquidity: {
        usd: pair.liquidity?.usd || 0,
        sol: pair.liquidity?.sol || 0
      },
      marketCap: pair.marketCap || 0,
      fdv: pair.fdv || 0,
      priceChange24h: pair.priceChange.h24 || 0,
      priceChange1h: pair.priceChange.h1 || 0,
      priceChange5m: pair.priceChange.m5 || 0,
      transactions: {
        h24: (pair.txns.h24.buys + pair.txns.h24.sells) || 0,
        h1: (pair.txns.h1.buys + pair.txns.h1.sells) || 0,
        m5: (pair.txns.m5.buys + pair.txns.m5.sells) || 0
      },
      dexId: pair.dexId,
      pairAddress: pair.pairAddress,
      source: 'dexscreener',
      timestamp: Date.now()
    };
  }

  private convertSolscanResponseToTokenData(data: any, address: string): TokenData {
    return {
      address,
      name: data.name || 'Unknown',
      symbol: data.symbol || 'UNK',
      decimals: data.decimals || 9,
      price: 0, // Solscan doesn't provide price directly
      priceUsd: 0,
      volume24h: 0,
      volume1h: 0,
      volume5m: 0,
      liquidity: {
        usd: 0,
        sol: 0
      },
      marketCap: 0,
      fdv: 0,
      priceChange24h: 0,
      priceChange1h: 0,
      priceChange5m: 0,
      transactions: {
        h24: 0,
        h1: 0,
        m5: 0
      },
      dexId: 'solscan',
      pairAddress: '',
      source: 'solscan',
      timestamp: Date.now()
    };
  }

  private convertJupiterResponseToTokenData(data: any, address: string): TokenData {
    return {
      address,
      name: data.name || 'Unknown',
      symbol: data.symbol || 'UNK',
      decimals: data.decimals || 9,
      price: 0, // Jupiter doesn't provide price directly
      priceUsd: 0,
      volume24h: 0,
      volume1h: 0,
      volume5m: 0,
      liquidity: {
        usd: 0,
        sol: 0
      },
      marketCap: 0,
      fdv: 0,
      priceChange24h: 0,
      priceChange1h: 0,
      priceChange5m: 0,
      transactions: {
        h24: 0,
        h1: 0,
        m5: 0
      },
      dexId: 'jupiter',
      pairAddress: '',
      source: 'jupiter',
      timestamp: Date.now()
    };
  }

  private convertSolscanTransactionsResponse(data: any): TransactionData[] {
    const transactions: TransactionData[] = [];
    
    if (data.transactions && Array.isArray(data.transactions)) {
      for (const tx of data.transactions) {
        transactions.push({
          signature: tx.signature,
          timestamp: tx.timestamp || Date.now(),
          type: tx.type || 'unknown',
          amount: tx.amount || 0,
          price: tx.price || 0,
          from: tx.from || '',
          to: tx.to || '',
          token: tx.token || '',
          success: tx.success !== false
        });
      }
    }
    
    return transactions;
  }

  private parseDexScreenerTrendingResponse(data: any, limit: number): TokenData[] {
    const tokens: TokenData[] = [];
    
    if (data.pairs && Array.isArray(data.pairs)) {
      for (const pair of data.pairs.slice(0, limit)) {
        if (pair.chainId === 'solana') {
          tokens.push(this.convertDexScreenerPairToTokenData(pair));
        }
      }
    }
    
    return tokens;
  }

  private parseDexScreenerBoostedResponse(data: any, limit: number): TokenData[] {
    const tokens: TokenData[] = [];
    
    if (Array.isArray(data)) {
      for (const boost of data.slice(0, limit)) {
        if (boost.chainId === 'solana') {
          tokens.push({
            address: boost.tokenAddress,
            name: boost.description || 'Boosted Token',
            symbol: boost.description?.split(' ')[0] || 'BOOST',
            decimals: 9,
            price: 0,
            priceUsd: 0,
            volume24h: 0,
            volume1h: 0,
            volume5m: 0,
            liquidity: {
              usd: 0,
              sol: 0
            },
            marketCap: 0,
            fdv: 0,
            priceChange24h: 0,
            priceChange1h: 0,
            priceChange5m: 0,
            transactions: {
              h24: 0,
              h1: 0,
              m5: 0
            },
            dexId: 'boost',
            pairAddress: '',
            source: 'dexscreener_boost',
            timestamp: Date.now()
          });
        }
      }
    }
    
    return tokens;
  }

  // Cache management
  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    
    if (cached) {
      this.cache.delete(key);
    }
    
    return null;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    
    // Cleanup old cache entries
    if (this.cache.size > 1000) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      
      this.cache.clear();
      entries.slice(0, 800).forEach(([k, v]) => this.cache.set(k, v));
    }
  }

  private updateStats(processingTime: number, success: boolean): void {
    this.stats.totalRequests++;
    this.stats.lastRequest = Date.now();
    
    if (success) {
      this.stats.successfulRequests++;
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (this.stats.successfulRequests - 1) + processingTime) / 
        this.stats.successfulRequests;
    } else {
      this.stats.failedRequests++;
    }
  }

  // Public API methods
  clearCache(): void {
    this.cache.clear();
    logger.info('🧹 API service cache cleared');
  }

  getStats(): any {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      successRate: this.stats.totalRequests > 0 ? 
        (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 0,
      config: this.config
    };
  }

  updateConfig(newConfig: Partial<ApiServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('🔧 API service config updated', newConfig);
  }

  // Utility methods
  async testConnection(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      
      // Test DexScreener connection
      const testToken = await this.getDexScreenerTokenInfo('So11111111111111111111111111111111111111112'); // WSOL
      return testToken !== null;
    } catch (error) {
      logger.error('Connection test failed:', error);
      return false;
    }
  }

  // Event emission methods
  emitPriceUpdate(address: string, price: number): void {
    this.emit('priceUpdate', { address, price, timestamp: Date.now() });
  }

  emitLiquidityUpdate(address: string, liquidity: any): void {
    this.emit('liquidityUpdate', { address, liquidity, timestamp: Date.now() });
  }

  emitVolumeUpdate(address: string, volume: any): void {
    this.emit('volumeUpdate', { address, volume, timestamp: Date.now() });
  }
}