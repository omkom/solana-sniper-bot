import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';

/**
 * Request Manager - Handles request deduplication and intelligent rate limiting
 */
export class RequestManager extends EventEmitter {
  private static instance: RequestManager;
  private activeRequests: Map<string, Promise<any>> = new Map();
  private requestHistory: Map<string, { timestamp: number; count: number }> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private globalRateLimit: RateLimiter;

  private constructor() {
    super();
    this.setMaxListeners(100);
    
    // Global rate limiter - 30 requests per minute across all endpoints
    this.globalRateLimit = new RateLimiter(30, 60000);
    
    // Initialize endpoint-specific rate limiters
    this.initializeRateLimiters();
    
    // Cleanup old requests every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  static getInstance(): RequestManager {
    if (!RequestManager.instance) {
      RequestManager.instance = new RequestManager();
    }
    return RequestManager.instance;
  }

  /**
   * Initialize rate limiters for different endpoints
   */
  private initializeRateLimiters(): void {
    // DexScreener - 1 request per 2 seconds
    this.rateLimiters.set('dexscreener', new RateLimiter(30, 60000));
    
    // Solscan - 1 request per 3 seconds
    this.rateLimiters.set('solscan', new RateLimiter(20, 60000));
    
    // Jupiter - 1 request per 1 second
    this.rateLimiters.set('jupiter', new RateLimiter(60, 60000));
    
    // RPC endpoints - 1 request per 0.5 seconds
    this.rateLimiters.set('rpc', new RateLimiter(120, 60000));
  }

  /**
   * Execute a request with deduplication and rate limiting
   */
  async executeRequest<T>(
    key: string,
    requestFn: () => Promise<T>,
    options: {
      deduplicate?: boolean;
      rateLimitKey?: string;
      priority?: number;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const {
      deduplicate = true,
      rateLimitKey = 'default',
      priority = 1,
      maxRetries = 2
    } = options;

    // Check for duplicate request
    if (deduplicate && this.activeRequests.has(key)) {
      logger.debug(`📋 Deduplicating request: ${key}`);
      return this.activeRequests.get(key) as Promise<T>;
    }

    // Apply rate limiting
    await this.applyRateLimit(rateLimitKey);

    // Create and execute request
    const requestPromise = this.executeWithRetry(requestFn, maxRetries, key);

    // Store active request for deduplication
    if (deduplicate) {
      this.activeRequests.set(key, requestPromise);
    }

    try {
      const result = await requestPromise;
      
      // Update request history
      this.updateRequestHistory(key);
      
      return result;
    } catch (error) {
      logger.warn(`❌ Request failed: ${key}`, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      // Clean up active request
      if (deduplicate) {
        this.activeRequests.delete(key);
      }
    }
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    maxRetries: number,
    key: string
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Check if we should retry
        if (attempt < maxRetries && this.shouldRetry(error)) {
          const delay = this.calculateRetryDelay(attempt);
          logger.debug(`🔄 Retrying request ${key} in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
          await this.delay(delay);
          continue;
        }
        
        break;
      }
    }
    
    throw lastError;
  }

  /**
   * Apply rate limiting for a specific endpoint
   */
  private async applyRateLimit(rateLimitKey: string): Promise<void> {
    // Apply global rate limit first
    await this.globalRateLimit.waitForToken();
    
    // Apply endpoint-specific rate limit
    const rateLimiter = this.rateLimiters.get(rateLimitKey);
    if (rateLimiter) {
      await rateLimiter.waitForToken();
    }
  }

  /**
   * Check if error should trigger a retry
   */
  private shouldRetry(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || '';
    const statusCode = error.response?.status || 0;
    
    // Retry on rate limits, network errors, and server errors
    return (
      statusCode === 429 ||
      statusCode >= 500 ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('econnreset') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('too many requests') ||
      errorCode === 'UND_ERR_CONNECT_TIMEOUT'
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    
    // Exponential backoff with jitter
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * 0.1 * delay;
    
    return Math.floor(delay + jitter);
  }

  /**
   * Update request history for analytics
   */
  private updateRequestHistory(key: string): void {
    const now = Date.now();
    const history = this.requestHistory.get(key) || { timestamp: now, count: 0 };
    
    history.count++;
    history.timestamp = now;
    
    this.requestHistory.set(key, history);
  }

  /**
   * Cleanup old requests and history
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    // Clean up request history
    for (const [key, history] of this.requestHistory) {
      if (now - history.timestamp > maxAge) {
        this.requestHistory.delete(key);
      }
    }
    
    // Clean up active requests that might be stuck
    for (const [key, promise] of this.activeRequests) {
      // Check if promise is still pending (this is a simple check)
      Promise.race([promise, this.delay(100)]).then(() => {
        // If we get here quickly, the promise resolved
      }).catch(() => {
        // If we get here, there might be an issue
        this.activeRequests.delete(key);
      });
    }
    
    logger.debug('🧹 RequestManager cleanup completed', {
      activeRequests: this.activeRequests.size,
      historyEntries: this.requestHistory.size
    });
  }

  /**
   * Get request statistics
   */
  getStats(): any {
    return {
      activeRequests: this.activeRequests.size,
      historyEntries: this.requestHistory.size,
      rateLimiters: Array.from(this.rateLimiters.keys()),
      globalRateLimit: this.globalRateLimit.getStatus()
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Enhanced Rate Limiter with burst support
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private maxTokens: number;
  private refillRate: number;
  private refillInterval: number;

  constructor(maxRequests: number, intervalMs: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.refillRate = maxRequests;
    this.refillInterval = intervalMs;
    this.lastRefill = Date.now();
  }

  async waitForToken(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }

    // Calculate wait time for next token
    const waitTime = this.refillInterval / this.refillRate;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
    }
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    
    if (timePassed >= this.refillInterval) {
      const tokensToAdd = Math.floor((timePassed / this.refillInterval) * this.refillRate);
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  getStatus(): any {
    return {
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      refillRate: this.refillRate,
      refillInterval: this.refillInterval
    };
  }
}

// Global instance
export const requestManager = RequestManager.getInstance();

// Convenience functions
export async function executeRequest<T>(
  key: string,
  requestFn: () => Promise<T>,
  options?: {
    deduplicate?: boolean;
    rateLimitKey?: string;
    priority?: number;
    maxRetries?: number;
  }
): Promise<T> {
  return requestManager.executeRequest(key, requestFn, options);
}

export function getRequestStats(): any {
  return requestManager.getStats();
}