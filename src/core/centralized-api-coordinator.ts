import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';

export interface ApiRequest {
  id: string;
  endpoint: string;
  method: string;
  params?: any;
  priority: number;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  source: string;
}

export interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  cached: boolean;
  timestamp: number;
}

export interface RequestOptions {
  priority?: number;
  maxRetries?: number;
  cacheTtl?: number;
  deduplicationKey?: string;
  params?: any;
}

/**
 * Centralized API Request Coordinator
 * Solves the 429 rate limiting issue by:
 * 1. Consolidating all API requests through a single queue
 * 2. Implementing global rate limiting across all strategies
 * 3. Sharing cached results between strategies
 * 4. Smart retry logic with global backoff
 * 5. Request deduplication to prevent simultaneous requests
 */
export class CentralizedApiCoordinator extends EventEmitter {
  private static instance: CentralizedApiCoordinator;
  
  // Global rate limiting
  private globalRequestQueue: ApiRequest[] = [];
  private activeRequests = new Map<string, Promise<ApiResponse>>();
  private processingQueue = false;
  
  // Global rate limiting parameters
  private maxConcurrentRequests = 1; // Very conservative: only 1 concurrent request
  private requestDelay = 2000; // 2 seconds between requests
  private lastRequestTime = 0;
  private currentConcurrentRequests = 0;
  
  // Global cache shared across all strategies
  private globalCache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  
  // Global backoff state
  private globalBackoff = {
    isActive: false,
    backoffUntil: 0,
    failureCount: 0,
    lastFailure: 0
  };
  
  // Request deduplication
  private pendingRequests = new Map<string, Promise<ApiResponse>>();
  
  // Statistics
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    cachedRequests: 0,
    deduplicatedRequests: 0,
    rateLimitedRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastReset: Date.now()
  };

  private constructor() {
    super();
    this.startQueueProcessor();
    this.startStatsReset();
    logger.info('🎯 Centralized API Coordinator initialized');
  }

  static getInstance(): CentralizedApiCoordinator {
    if (!CentralizedApiCoordinator.instance) {
      CentralizedApiCoordinator.instance = new CentralizedApiCoordinator();
    }
    return CentralizedApiCoordinator.instance;
  }

  /**
   * Main API request method - all strategies should use this
   */
  async makeRequest(
    endpoint: string,
    requestFn: () => Promise<any>,
    source: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse> {
    const requestId = `${source}-${endpoint}-${Date.now()}`;
    const deduplicationKey = options.deduplicationKey || `${endpoint}-${JSON.stringify(options.params || {})}`;
    
    this.stats.totalRequests++;

    // Check for existing pending request (deduplication)
    if (this.pendingRequests.has(deduplicationKey)) {
      this.stats.deduplicatedRequests++;
      logger.debug(`📋 Deduplicating request: ${deduplicationKey}`);
      return this.pendingRequests.get(deduplicationKey)!;
    }

    // Check global cache first
    const cachedResult = this.checkGlobalCache(deduplicationKey);
    if (cachedResult) {
      this.stats.cachedRequests++;
      logger.debug(`💾 Serving from global cache: ${deduplicationKey}`);
      return {
        success: true,
        data: cachedResult.data,
        cached: true,
        timestamp: cachedResult.timestamp
      };
    }

    // Check global backoff
    if (this.isGlobalBackoffActive()) {
      const backoffRemaining = this.globalBackoff.backoffUntil - Date.now();
      logger.warn(`⏸️ Global backoff active, rejecting request. Remaining: ${backoffRemaining}ms`);
      return {
        success: false,
        error: `Global backoff active for ${backoffRemaining}ms`,
        cached: false,
        timestamp: Date.now()
      };
    }

    // Create API request
    const apiRequest: ApiRequest = {
      id: requestId,
      endpoint,
      method: 'GET',
      params: options.params,
      priority: options.priority || 1,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries || 2,
      source
    };

    // Create promise and add to deduplication map
    const requestPromise = this.queueRequest(apiRequest, requestFn, options.cacheTtl || 60000);
    this.pendingRequests.set(deduplicationKey, requestPromise);

    // Clean up deduplication map when request completes
    requestPromise.finally(() => {
      this.pendingRequests.delete(deduplicationKey);
    });

    return requestPromise;
  }

  /**
   * Queue a request for processing
   */
  private async queueRequest(
    request: ApiRequest,
    requestFn: () => Promise<any>,
    cacheTtl: number
  ): Promise<ApiResponse> {
    return new Promise((resolve, reject) => {
      // Add to global queue
      this.globalRequestQueue.push(request);
      
      // Sort queue by priority (higher priority first)
      this.globalRequestQueue.sort((a, b) => b.priority - a.priority);

      // Store the request function and resolve/reject callbacks
      this.activeRequests.set(request.id, new Promise(async (res, rej) => {
        try {
          const result = await this.executeRequest(request, requestFn, cacheTtl);
          resolve(result);
          res(result);
        } catch (error) {
          reject(error);
          rej(error);
        }
      }));
    });
  }

  /**
   * Execute the actual API request with global coordination
   */
  private async executeRequest(
    request: ApiRequest,
    requestFn: () => Promise<any>,
    cacheTtl: number
  ): Promise<ApiResponse> {
    const startTime = Date.now();
    
    try {
      // Wait for global rate limiting
      await this.waitForGlobalRateLimit();
      
      // Execute the request
      this.currentConcurrentRequests++;
      logger.debug(`🚀 Executing request: ${request.source} -> ${request.endpoint}`);
      
      const data = await requestFn();
      
      // Update global cache
      const cacheKey = `${request.endpoint}-${JSON.stringify(request.params || {})}`;
      this.updateGlobalCache(cacheKey, data, cacheTtl);
      
      // Update statistics
      this.stats.successfulRequests++;
      this.updateAverageResponseTime(Date.now() - startTime);
      
      // Reset global backoff on success
      this.resetGlobalBackoff();
      
      logger.debug(`✅ Request successful: ${request.source} -> ${request.endpoint}`);
      
      return {
        success: true,
        data,
        cached: false,
        timestamp: Date.now()
      };
      
    } catch (error: any) {
      // Handle rate limiting specifically
      if (this.isRateLimitError(error)) {
        this.stats.rateLimitedRequests++;
        this.activateGlobalBackoff();
        
        logger.warn(`⚠️ Rate limit detected, activating global backoff: ${request.source} -> ${request.endpoint}`);
        
        // Retry after backoff if retries remaining
        if (request.retryCount < request.maxRetries) {
          request.retryCount++;
          logger.info(`🔄 Retrying request after backoff: ${request.source} -> ${request.endpoint} (attempt ${request.retryCount}/${request.maxRetries})`);
          
          // Wait for backoff period
          await this.waitForGlobalBackoff();
          
          // Retry the request
          return this.executeRequest(request, requestFn, cacheTtl);
        }
      }
      
      // Update failure statistics
      this.stats.failedRequests++;
      this.updateGlobalBackoff(error);
      
      logger.error(`❌ Request failed: ${request.source} -> ${request.endpoint}`, {
        error: error.message,
        retryCount: request.retryCount,
        maxRetries: request.maxRetries
      });
      
      return {
        success: false,
        error: error.message,
        cached: false,
        timestamp: Date.now()
      };
      
    } finally {
      this.currentConcurrentRequests--;
      this.activeRequests.delete(request.id);
      this.lastRequestTime = Date.now();
    }
  }

  /**
   * Global rate limiting - wait for next available slot
   */
  private async waitForGlobalRateLimit(): Promise<void> {
    // Wait for concurrent request limit
    while (this.currentConcurrentRequests >= this.maxConcurrentRequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Wait for request delay
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.requestDelay) {
      const waitTime = this.requestDelay - timeSinceLastRequest;
      logger.debug(`⏳ Global rate limit wait: ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Check if global backoff is active
   */
  private isGlobalBackoffActive(): boolean {
    return this.globalBackoff.isActive && Date.now() < this.globalBackoff.backoffUntil;
  }

  /**
   * Wait for global backoff to end
   */
  private async waitForGlobalBackoff(): Promise<void> {
    if (this.isGlobalBackoffActive()) {
      const waitTime = this.globalBackoff.backoffUntil - Date.now();
      logger.warn(`⏸️ Waiting for global backoff: ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Activate global backoff with exponential backoff
   */
  private activateGlobalBackoff(): void {
    this.globalBackoff.failureCount++;
    this.globalBackoff.lastFailure = Date.now();
    
    // Exponential backoff: 5s, 10s, 20s, 40s, 60s (max)
    const backoffTime = Math.min(5000 * Math.pow(2, this.globalBackoff.failureCount - 1), 60000);
    
    this.globalBackoff.isActive = true;
    this.globalBackoff.backoffUntil = Date.now() + backoffTime;
    
    logger.warn(`🔥 Global backoff activated: ${backoffTime}ms (failure count: ${this.globalBackoff.failureCount})`);
    
    // Emit event for monitoring
    this.emit('globalBackoffActivated', {
      failureCount: this.globalBackoff.failureCount,
      backoffTime,
      backoffUntil: this.globalBackoff.backoffUntil
    });
  }

  /**
   * Reset global backoff on successful request
   */
  private resetGlobalBackoff(): void {
    if (this.globalBackoff.failureCount > 0) {
      logger.info(`✅ Global backoff reset after successful request`);
      this.globalBackoff.failureCount = 0;
      this.globalBackoff.isActive = false;
      this.globalBackoff.backoffUntil = 0;
    }
  }

  /**
   * Update global backoff state on failure
   */
  private updateGlobalBackoff(error: any): void {
    if (this.isRateLimitError(error)) {
      this.activateGlobalBackoff();
    }
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const statusCode = error.response?.status || error.status || 0;
    
    return statusCode === 429 || 
           errorMessage.includes('rate limit') || 
           errorMessage.includes('too many requests') ||
           errorMessage.includes('429');
  }

  /**
   * Global cache management
   */
  private checkGlobalCache(key: string): { data: any; timestamp: number } | null {
    const cached = this.globalCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return { data: cached.data, timestamp: cached.timestamp };
    }
    
    // Remove expired cache entries
    if (cached) {
      this.globalCache.delete(key);
    }
    
    return null;
  }

  /**
   * Update global cache
   */
  private updateGlobalCache(key: string, data: any, ttl: number): void {
    this.globalCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    
    // Cleanup old cache entries (keep last 100)
    if (this.globalCache.size > 100) {
      const entries = Array.from(this.globalCache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      
      this.globalCache.clear();
      entries.slice(0, 100).forEach(([k, v]) => this.globalCache.set(k, v));
    }
  }

  /**
   * Process the global request queue
   */
  private startQueueProcessor(): void {
    if (this.processingQueue) return;
    
    this.processingQueue = true;
    
    const processQueue = async () => {
      while (this.processingQueue) {
        if (this.globalRequestQueue.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        // Skip processing if global backoff is active
        if (this.isGlobalBackoffActive()) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        // Skip if at concurrent limit
        if (this.currentConcurrentRequests >= this.maxConcurrentRequests) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        // Process next request
        const request = this.globalRequestQueue.shift();
        if (request) {
          logger.debug(`📋 Processing queued request: ${request.source} -> ${request.endpoint}`);
          // Request is already being processed by executeRequest
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    };
    
    processQueue().catch(error => {
      logger.error('Queue processor error:', error);
      this.processingQueue = false;
    });
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(responseTime: number): void {
    const currentAvg = this.stats.averageResponseTime;
    const totalRequests = this.stats.successfulRequests;
    
    this.stats.averageResponseTime = ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests;
  }

  /**
   * Reset statistics periodically
   */
  private startStatsReset(): void {
    setInterval(() => {
      // Reset non-cumulative stats every hour
      this.stats.averageResponseTime = 0;
      this.stats.lastReset = Date.now();
      
      // Clean up old cache entries
      this.cleanupCache();
      
      logger.info('📊 API Coordinator stats reset');
    }, 3600000); // Every hour
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, value] of this.globalCache.entries()) {
      if (now - value.timestamp > value.ttl) {
        this.globalCache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.debug(`🧹 Cleaned up ${removedCount} expired cache entries`);
    }
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): any {
    return {
      ...this.stats,
      queue: {
        length: this.globalRequestQueue.length,
        activeConcurrent: this.currentConcurrentRequests,
        maxConcurrent: this.maxConcurrentRequests
      },
      cache: {
        size: this.globalCache.size,
        hitRate: this.stats.totalRequests > 0 ? (this.stats.cachedRequests / this.stats.totalRequests) * 100 : 0
      },
      backoff: {
        isActive: this.globalBackoff.isActive,
        failureCount: this.globalBackoff.failureCount,
        backoffUntil: this.globalBackoff.backoffUntil,
        remainingMs: this.isGlobalBackoffActive() ? this.globalBackoff.backoffUntil - Date.now() : 0
      },
      rateLimiting: {
        requestDelay: this.requestDelay,
        lastRequestTime: this.lastRequestTime,
        timeSinceLastRequest: Date.now() - this.lastRequestTime
      }
    };
  }

  /**
   * Update rate limiting parameters
   */
  updateRateLimiting(maxConcurrent: number, requestDelay: number): void {
    this.maxConcurrentRequests = maxConcurrent;
    this.requestDelay = requestDelay;
    
    logger.info(`🔧 Rate limiting updated: concurrent=${maxConcurrent}, delay=${requestDelay}ms`);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.globalCache.clear();
    this.pendingRequests.clear();
    logger.info('🧹 All caches cleared');
  }

  /**
   * Emergency stop - clears all queues and stops processing
   */
  emergencyStop(): void {
    this.processingQueue = false;
    this.globalRequestQueue.length = 0;
    this.activeRequests.clear();
    this.pendingRequests.clear();
    
    logger.warn('🚨 Emergency stop activated - all requests cleared');
  }

  /**
   * Get queue status
   */
  getQueueStatus(): any {
    return {
      queueLength: this.globalRequestQueue.length,
      activeConcurrent: this.currentConcurrentRequests,
      maxConcurrent: this.maxConcurrentRequests,
      isProcessing: this.processingQueue,
      pendingDeduplication: this.pendingRequests.size,
      nextRequestIn: Math.max(0, this.requestDelay - (Date.now() - this.lastRequestTime))
    };
  }
}

// Export singleton instance
export const apiCoordinator = CentralizedApiCoordinator.getInstance();