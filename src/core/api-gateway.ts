import axios, { AxiosInstance, AxiosResponse, AxiosRequestConfig } from 'axios';
import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';

export interface ApiEndpoint {
  name: string;
  baseUrl: string;
  rateLimit: number; // requests per minute
  timeout: number;
  retryAttempts: number;
  priority: number; // 1-5, 5 being highest
  headers?: Record<string, string>;
  healthCheck?: string;
}

export interface RequestMetrics {
  endpoint: string;
  method: string;
  url: string;
  timestamp: number;
  duration: number;
  success: boolean;
  statusCode?: number;
  error?: string;
  retryCount: number;
}

export interface ApiGatewayConfig {
  defaultTimeout: number;
  defaultRetryAttempts: number;
  rateLimitBuffer: number; // percentage buffer for rate limits
  enableMetrics: boolean;
  enableHealthChecks: boolean;
  healthCheckInterval: number;
  maxConcurrentRequests: number;
  fallbackDelay: number;
}

export class ApiGateway extends EventEmitter {
  private endpoints: Map<string, ApiEndpoint> = new Map();
  private clients: Map<string, AxiosInstance> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private healthStatus: Map<string, boolean> = new Map();
  private requestMetrics: RequestMetrics[] = [];
  private config: ApiGatewayConfig;
  private concurrentRequests = 0;
  private requestQueue: Array<{
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    fn: () => Promise<any>;
  }> = [];

  constructor(config: Partial<ApiGatewayConfig> = {}) {
    super();
    
    this.config = {
      defaultTimeout: 30000,
      defaultRetryAttempts: 3,
      rateLimitBuffer: 20,
      enableMetrics: true,
      enableHealthChecks: true,
      healthCheckInterval: 60000,
      maxConcurrentRequests: 10,
      fallbackDelay: 1000,
      ...config
    };

    this.setupDefaultEndpoints();
    this.startHealthChecks();
    this.processRequestQueue();

    logger.info('🌐 API Gateway initialized', {
      endpoints: this.endpoints.size,
      config: this.config
    });
  }

  /**
   * Setup default API endpoints
   */
  private setupDefaultEndpoints(): void {
    // DexScreener endpoints
    this.addEndpoint({
      name: 'dexscreener_main',
      baseUrl: 'https://api.dexscreener.com',
      rateLimit: 300, // 5 requests per second
      timeout: 30000,
      retryAttempts: 3,
      priority: 5,
      headers: {
        'User-Agent': 'Educational-Token-Analyzer/1.0'
      },
      healthCheck: '/latest/dex/search?q=SOL'
    });

    // Solscan endpoints
    this.addEndpoint({
      name: 'solscan_v2',
      baseUrl: 'https://pro-api.solscan.io',
      rateLimit: 100, // More conservative for paid API
      timeout: 20000,
      retryAttempts: 2,
      priority: 4,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SOLSCAN_API_KEY && { 'token': process.env.SOLSCAN_API_KEY })
      },
      healthCheck: '/v2.0/account/transactions?account=11111111111111111111111111111112&limit=1'
    });

    // Jupiter API
    this.addEndpoint({
      name: 'jupiter_v6',
      baseUrl: 'https://quote-api.jup.ag',
      rateLimit: 200,
      timeout: 15000,
      retryAttempts: 3,
      priority: 3,
      headers: {
        'Content-Type': 'application/json'
      },
      healthCheck: '/v6/tokens'
    });

    // Backup DexScreener
    this.addEndpoint({
      name: 'dexscreener_backup',
      baseUrl: 'https://api.dexscreener.com',
      rateLimit: 150, // Lower rate limit for backup
      timeout: 45000,
      retryAttempts: 2,
      priority: 2,
      headers: {
        'User-Agent': 'Educational-Token-Analyzer-Backup/1.0'
      }
    });
  }

  /**
   * Add a new API endpoint
   */
  addEndpoint(endpoint: ApiEndpoint): void {
    this.endpoints.set(endpoint.name, endpoint);
    
    // Create axios instance with custom config
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

    // Add response interceptor for metrics
    client.interceptors.response.use(
      (response) => {
        this.recordMetrics(endpoint.name, response.config, response, true);
        return response;
      },
      (error) => {
        this.recordMetrics(endpoint.name, error.config, error.response, false, error.message);
        return Promise.reject(error);
      }
    );

    this.clients.set(endpoint.name, client);
    this.rateLimiters.set(endpoint.name, new RateLimiter(endpoint.rateLimit));
    this.healthStatus.set(endpoint.name, true);

    logger.info(`📡 Added API endpoint: ${endpoint.name}`, {
      baseUrl: endpoint.baseUrl,
      rateLimit: endpoint.rateLimit,
      priority: endpoint.priority
    });
  }

  /**
   * Make an optimized API request with automatic fallback
   */
  async request<T = any>(
    endpointName: string,
    path: string,
    options: AxiosRequestConfig = {},
    fallbackEndpoints: string[] = []
  ): Promise<T> {
    return this.queueRequest(async () => {
      const primaryResult = await this.attemptRequest<T>(endpointName, path, options);
      
      if (primaryResult.success) {
        return primaryResult.data;
      }

      // Try fallback endpoints
      for (const fallbackName of fallbackEndpoints) {
        if (this.healthStatus.get(fallbackName)) {
          logger.warn(`🔄 Attempting fallback to ${fallbackName} for ${path}`);
          
          const fallbackResult = await this.attemptRequest<T>(fallbackName, path, options);
          
          if (fallbackResult.success) {
            return fallbackResult.data;
          }
          
          // Small delay between fallback attempts
          await this.delay(this.config.fallbackDelay);
        }
      }

      throw new Error(`All endpoints failed for ${path}`);
    });
  }

  /**
   * Make a request with intelligent endpoint selection
   */
  async smartRequest<T = any>(
    path: string,
    options: AxiosRequestConfig = {},
    preferredEndpoints: string[] = []
  ): Promise<T> {
    // Get available endpoints sorted by priority and health
    const availableEndpoints = this.getAvailableEndpoints(preferredEndpoints);
    
    if (availableEndpoints.length === 0) {
      throw new Error('No healthy endpoints available');
    }

    // Try endpoints in order of priority
    for (const endpointName of availableEndpoints) {
      try {
        return await this.request<T>(endpointName, path, options);
      } catch (error) {
        logger.warn(`❌ Smart request failed on ${endpointName}:`, error);
        
        // Mark endpoint as unhealthy if it's failing consistently
        this.checkEndpointHealth(endpointName);
        
        // Continue to next endpoint
        continue;
      }
    }

    throw new Error(`All smart request attempts failed for ${path}`);
  }

  /**
   * Batch multiple requests with optimal distribution
   */
  async batchRequest<T = any>(
    requests: Array<{
      path: string;
      options?: AxiosRequestConfig;
      preferredEndpoints?: string[];
    }>
  ): Promise<Array<T | null>> {
    const batchSize = Math.min(requests.length, this.config.maxConcurrentRequests);
    const results: Array<T | null> = [];

    // Process requests in batches
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (req) => {
        try {
          return await this.smartRequest<T>(req.path, req.options, req.preferredEndpoints);
        } catch (error) {
          logger.warn(`❌ Batch request failed for ${req.path}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid overwhelming APIs
      if (i + batchSize < requests.length) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Make DexScreener specific requests with optimizations
   */
  async requestDexScreener<T = any>(
    path: string,
    options: AxiosRequestConfig = {}
  ): Promise<T> {
    const dexScreenerEndpoints = ['dexscreener_main', 'dexscreener_backup'];
    return this.smartRequest<T>(path, options, dexScreenerEndpoints);
  }

  /**
   * Make Solscan specific requests
   */
  async requestSolscan<T = any>(
    path: string,
    options: AxiosRequestConfig = {}
  ): Promise<T> {
    return this.request<T>('solscan_v2', path, options);
  }

  /**
   * Make Jupiter specific requests
   */
  async requestJupiter<T = any>(
    path: string,
    options: AxiosRequestConfig = {}
  ): Promise<T> {
    return this.request<T>('jupiter_v6', path, options);
  }

  /**
   * Attempt a request on a specific endpoint
   */
  private async attemptRequest<T = any>(
    endpointName: string,
    path: string,
    options: AxiosRequestConfig
  ): Promise<{ success: boolean; data?: T; error?: any }> {
    const endpoint = this.endpoints.get(endpointName);
    const client = this.clients.get(endpointName);
    
    if (!endpoint || !client) {
      return { success: false, error: `Endpoint ${endpointName} not found` };
    }

    if (!this.healthStatus.get(endpointName)) {
      return { success: false, error: `Endpoint ${endpointName} is unhealthy` };
    }

    let lastError: any;
    
    for (let attempt = 1; attempt <= endpoint.retryAttempts; attempt++) {
      try {
        const response = await client.request<T>({
          url: path,
          method: options.method || 'GET',
          ...options
        });

        return { success: true, data: response.data };
      } catch (error) {
        lastError = error;
        
        if (attempt < endpoint.retryAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.delay(delay);
        }
      }
    }

    return { success: false, error: lastError };
  }

  /**
   * Queue request to manage concurrency
   */
  private queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        resolve,
        reject,
        fn: requestFn
      });
    });
  }

  /**
   * Process the request queue
   */
  private processRequestQueue(): void {
    setInterval(() => {
      while (this.requestQueue.length > 0 && this.concurrentRequests < this.config.maxConcurrentRequests) {
        const request = this.requestQueue.shift();
        if (request) {
          this.concurrentRequests++;
          
          request.fn()
            .then(result => {
              request.resolve(result);
            })
            .catch(error => {
              request.reject(error);
            })
            .finally(() => {
              this.concurrentRequests--;
            });
        }
      }
    }, 10);
  }

  /**
   * Get available endpoints sorted by priority and health
   */
  private getAvailableEndpoints(preferredEndpoints: string[] = []): string[] {
    const allEndpoints = Array.from(this.endpoints.entries());
    
    // Filter healthy endpoints
    const healthyEndpoints = allEndpoints.filter(([name]) => 
      this.healthStatus.get(name) === true
    );

    // Sort by preference first, then priority
    healthyEndpoints.sort(([nameA, endpointA], [nameB, endpointB]) => {
      const aPreferred = preferredEndpoints.includes(nameA);
      const bPreferred = preferredEndpoints.includes(nameB);
      
      if (aPreferred && !bPreferred) return -1;
      if (!aPreferred && bPreferred) return 1;
      
      return endpointB.priority - endpointA.priority;
    });

    return healthyEndpoints.map(([name]) => name);
  }

  /**
   * Enforce rate limiting for an endpoint
   */
  private async enforceRateLimit(endpointName: string): Promise<void> {
    const rateLimiter = this.rateLimiters.get(endpointName);
    if (rateLimiter) {
      await rateLimiter.waitForToken();
    }
  }

  /**
   * Record request metrics
   */
  private recordMetrics(
    endpointName: string,
    config: any,
    response: any,
    success: boolean,
    error?: string
  ): void {
    if (!this.config.enableMetrics) return;

    const metric: RequestMetrics = {
      endpoint: endpointName,
      method: config?.method || 'GET',
      url: config?.url || '',
      timestamp: Date.now(),
      duration: response?.config?.metadata?.endTime - response?.config?.metadata?.startTime || 0,
      success,
      statusCode: response?.status,
      error,
      retryCount: 0
    };

    this.requestMetrics.push(metric);
    
    // Keep only last 1000 metrics
    if (this.requestMetrics.length > 1000) {
      this.requestMetrics = this.requestMetrics.slice(-1000);
    }

    this.emit('metricRecorded', metric);
  }

  /**
   * Start health checks for all endpoints
   */
  private startHealthChecks(): void {
    if (!this.config.enableHealthChecks) return;

    setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health checks on all endpoints
   */
  private async performHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.endpoints.entries()).map(
      async ([name, endpoint]) => {
        if (endpoint.healthCheck) {
          const isHealthy = await this.checkEndpointHealth(name, endpoint.healthCheck);
          this.healthStatus.set(name, isHealthy);
        }
      }
    );

    await Promise.all(healthPromises);
  }

  /**
   * Check health of a specific endpoint
   */
  private async checkEndpointHealth(endpointName: string, healthCheckPath?: string): Promise<boolean> {
    const client = this.clients.get(endpointName);
    if (!client) return false;

    try {
      const path = healthCheckPath || '/';
      const response = await client.get(path, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.warn(`❌ Health check failed for ${endpointName}:`, error);
      return false;
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get comprehensive API gateway statistics
   */
  getStats(): any {
    const now = Date.now();
    const last24Hours = now - 24 * 60 * 60 * 1000;
    
    const recentMetrics = this.requestMetrics.filter(m => m.timestamp > last24Hours);
    const endpointStats = new Map<string, any>();

    // Calculate stats per endpoint
    for (const [name, endpoint] of this.endpoints) {
      const endpointMetrics = recentMetrics.filter(m => m.endpoint === name);
      const successfulRequests = endpointMetrics.filter(m => m.success);
      
      endpointStats.set(name, {
        totalRequests: endpointMetrics.length,
        successfulRequests: successfulRequests.length,
        successRate: endpointMetrics.length > 0 ? (successfulRequests.length / endpointMetrics.length) * 100 : 0,
        avgResponseTime: successfulRequests.length > 0 ? 
          successfulRequests.reduce((sum, m) => sum + m.duration, 0) / successfulRequests.length : 0,
        isHealthy: this.healthStatus.get(name),
        rateLimit: endpoint.rateLimit,
        priority: endpoint.priority
      });
    }

    return {
      totalEndpoints: this.endpoints.size,
      healthyEndpoints: Array.from(this.healthStatus.values()).filter(Boolean).length,
      totalRequests: recentMetrics.length,
      successfulRequests: recentMetrics.filter(m => m.success).length,
      concurrentRequests: this.concurrentRequests,
      queuedRequests: this.requestQueue.length,
      endpointStats: Object.fromEntries(endpointStats),
      config: this.config
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.requestMetrics = [];
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(limit: number = 100): RequestMetrics[] {
    return this.requestMetrics.slice(-limit);
  }
}

/**
 * Simple rate limiter implementation
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number; // tokens per minute

  constructor(rateLimit: number) {
    this.maxTokens = rateLimit;
    this.refillRate = rateLimit;
    this.tokens = rateLimit;
    this.lastRefill = Date.now();
  }

  async waitForToken(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // Calculate wait time for next token
    const waitTime = (60 * 1000) / this.refillRate;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    this.refill();
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor((timePassed / 60000) * this.refillRate);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}

// Singleton instance
let apiGateway: ApiGateway | null = null;

export function getApiGateway(): ApiGateway {
  if (!apiGateway) {
    apiGateway = new ApiGateway();
  }
  return apiGateway;
}