import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from '../monitoring/logger';

export interface ApiEndpoint {
  name: string;
  baseUrl: string;
  rateLimit: number;
  timeout: number;
  headers?: Record<string, string>;
}

export interface ApiRequest {
  endpoint: string;
  path: string;
  method: 'GET' | 'POST';
  params?: any;
  data?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  source: string;
}

export class EfficientApiService {
  private endpoints: Map<string, ApiEndpoint> = new Map();
  private clients: Map<string, AxiosInstance> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private lastRequests: Map<string, number> = new Map();
  
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds
  
  constructor() {
    this.setupDefaultEndpoints();
    logger.info('🌐 Efficient API Service initialized');
  }

  private setupDefaultEndpoints(): void {
    // DexScreener
    this.addEndpoint({
      name: 'dexscreener',
      baseUrl: 'https://api.dexscreener.com',
      rateLimit: 5, // requests per second
      timeout: 30000,
      headers: {
        'User-Agent': 'Solana-Educational-Bot/1.0'
      }
    });

    // Solscan
    this.addEndpoint({
      name: 'solscan',
      baseUrl: 'https://pro-api.solscan.io',
      rateLimit: 2, // requests per second
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SOLSCAN_API_KEY && { 'token': process.env.SOLSCAN_API_KEY })
      }
    });

    // Jupiter
    this.addEndpoint({
      name: 'jupiter',
      baseUrl: 'https://quote-api.jup.ag',
      rateLimit: 10, // requests per second
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  addEndpoint(endpoint: ApiEndpoint): void {
    this.endpoints.set(endpoint.name, endpoint);
    
    // Create axios instance
    const client = axios.create({
      baseURL: endpoint.baseUrl,
      timeout: endpoint.timeout,
      headers: endpoint.headers || {}
    });

    // Add request interceptor for rate limiting
    client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit(endpoint.name);
      return config;
    });

    // Add response interceptor for logging
    client.interceptors.response.use(
      (response) => {
        this.recordRequest(endpoint.name, true);
        return response;
      },
      (error) => {
        this.recordRequest(endpoint.name, false);
        return Promise.reject(error);
      }
    );

    this.clients.set(endpoint.name, client);
    this.requestCounts.set(endpoint.name, 0);
    this.lastRequests.set(endpoint.name, 0);

    logger.info(`📡 Added API endpoint: ${endpoint.name}`);
  }

  async request<T = any>(request: ApiRequest): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const cacheKey = `${request.endpoint}:${request.path}:${JSON.stringify(request.params || {})}`;
    
    // Check cache first
    if (request.method === 'GET') {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          success: true,
          data: cached,
          duration: Date.now() - startTime,
          source: `${request.endpoint}:cache`
        };
      }
    }

    const client = this.clients.get(request.endpoint);
    if (!client) {
      return {
        success: false,
        error: `Endpoint ${request.endpoint} not found`,
        duration: Date.now() - startTime,
        source: request.endpoint
      };
    }

    try {
      const response = await client.request({
        method: request.method,
        url: request.path,
        params: request.params,
        data: request.data
      });

      // Cache successful GET requests
      if (request.method === 'GET' && response.data) {
        this.setCache(cacheKey, response.data);
      }

      return {
        success: true,
        data: response.data,
        duration: Date.now() - startTime,
        source: request.endpoint
      };

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      
      logger.warn(`API request failed: ${request.endpoint}${request.path}`, {
        error: errorMessage,
        status: error.response?.status
      });

      return {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
        source: request.endpoint
      };
    }
  }

  // Convenient methods for common requests
  async getDexScreenerToken(address: string): Promise<ApiResponse> {
    return this.request({
      endpoint: 'dexscreener',
      path: `/latest/dex/tokens/${address}`,
      method: 'GET'
    });
  }

  async getDexScreenerTrending(): Promise<ApiResponse> {
    return this.request({
      endpoint: 'dexscreener',
      path: '/token-profiles/latest/v1',
      method: 'GET'
    });
  }

  async getSolscanTransaction(signature: string): Promise<ApiResponse> {
    return this.request({
      endpoint: 'solscan',
      path: '/v2.0/transaction/detail',
      method: 'GET',
      params: { tx: signature }
    });
  }

  async getJupiterQuote(inputMint: string, outputMint: string, amount: number): Promise<ApiResponse> {
    return this.request({
      endpoint: 'jupiter',
      path: '/v6/quote',
      method: 'GET',
      params: {
        inputMint,
        outputMint,
        amount,
        slippageBps: 50
      }
    });
  }

  private async enforceRateLimit(endpointName: string): Promise<void> {
    const endpoint = this.endpoints.get(endpointName);
    if (!endpoint) return;

    const now = Date.now();
    const lastRequest = this.lastRequests.get(endpointName) || 0;
    const minInterval = 1000 / endpoint.rateLimit; // Convert to milliseconds

    const timeSinceLastRequest = now - lastRequest;
    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequests.set(endpointName, Date.now());
  }

  private recordRequest(endpointName: string, success: boolean): void {
    const current = this.requestCounts.get(endpointName) || 0;
    this.requestCounts.set(endpointName, current + 1);

    if (!success) {
      logger.warn(`API request failed for ${endpointName}`);
    }
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.CACHE_DURATION) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Clean up old cache entries
    if (this.cache.size > 1000) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 100 entries
      for (let i = 0; i < 100; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }

  getStats(): any {
    const endpointStats = new Map();
    
    this.endpoints.forEach((endpoint, name) => {
      endpointStats.set(name, {
        baseUrl: endpoint.baseUrl,
        rateLimit: endpoint.rateLimit,
        timeout: endpoint.timeout,
        requestCount: this.requestCounts.get(name) || 0,
        lastRequest: this.lastRequests.get(name) || 0
      });
    });

    return {
      endpoints: this.endpoints.size,
      totalRequests: Array.from(this.requestCounts.values()).reduce((a, b) => a + b, 0),
      cacheSize: this.cache.size,
      cacheDuration: this.CACHE_DURATION,
      endpointStats: Object.fromEntries(endpointStats)
    };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('API cache cleared');
  }

  isHealthy(): boolean {
    return this.endpoints.size > 0 && this.clients.size > 0;
  }
}