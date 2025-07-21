/**
 * Advanced Rate Limiter
 * Manages API rate limits across multiple endpoints and services
 * Essential for maintaining service availability and avoiding rate limit bans
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';

interface RateLimitConfig {
  windowSize: number;      // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  burstAllowance: number;  // Additional requests allowed for bursts
  backoffMultiplier: number; // Exponential backoff multiplier
  maxBackoffTime: number;  // Maximum backoff time
}

interface EndpointConfig extends RateLimitConfig {
  endpoint: string;
  priority: number;        // Higher number = higher priority
  weight: number;          // Request weight (some requests cost more)
}

interface RateLimitState {
  requests: number;
  windowStart: number;
  backoffUntil: number;
  consecutiveFailures: number;
  totalRequests: number;
  totalRejected: number;
  lastRequest: number;
}

interface RequestInfo {
  timestamp: number;
  weight: number;
  endpoint: string;
  priority: number;
}

export class RateLimiter extends EventEmitter {
  private endpointConfigs = new Map<string, EndpointConfig>();
  private endpointStates = new Map<string, RateLimitState>();
  private requestQueue: RequestInfo[] = [];
  private globalState: RateLimitState;
  private isStarted = false;
  private processingInterval: NodeJS.Timeout | null = null;
  
  // Global rate limiting
  private globalConfig: RateLimitConfig = {
    windowSize: 60000,       // 1 minute
    maxRequests: 1000,       // 1000 requests per minute globally
    burstAllowance: 100,     // Allow 100 burst requests
    backoffMultiplier: 1.5,  // 1.5x backoff increase
    maxBackoffTime: 300000   // 5 minutes max backoff
  };

  constructor(globalConfig: Partial<RateLimitConfig> = {}) {
    super();
    
    this.globalConfig = { ...this.globalConfig, ...globalConfig };
    
    this.globalState = {
      requests: 0,
      windowStart: Date.now(),
      backoffUntil: 0,
      consecutiveFailures: 0,
      totalRequests: 0,
      totalRejected: 0,
      lastRequest: 0
    };
    
    this.setupDefaultEndpoints();
    
    logger.info('🚦 Rate Limiter initialized', {
      globalLimit: this.globalConfig.maxRequests,
      windowSize: this.globalConfig.windowSize,
      endpoints: this.endpointConfigs.size
    });
  }

  start(): void {
    if (this.isStarted) {
      logger.warn('Rate limiter already started');
      return;
    }

    this.isStarted = true;
    this.startRequestProcessing();
    
    logger.info('🚀 Rate limiter started');
  }

  stop(): void {
    if (!this.isStarted) return;

    this.isStarted = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.requestQueue = [];
    
    logger.info('🛑 Rate limiter stopped');
  }

  private setupDefaultEndpoints(): void {
    // DexScreener endpoints
    this.addEndpoint('dexscreener_token', {
      endpoint: 'dexscreener_token',
      windowSize: 60000,        // 1 minute
      maxRequests: 300,         // 300 requests per minute
      burstAllowance: 50,
      backoffMultiplier: 2.0,
      maxBackoffTime: 180000,   // 3 minutes
      priority: 8,
      weight: 1
    });
    
    this.addEndpoint('dexscreener_pairs', {
      endpoint: 'dexscreener_pairs',
      windowSize: 60000,
      maxRequests: 200,         // More expensive calls
      burstAllowance: 30,
      backoffMultiplier: 2.0,
      maxBackoffTime: 180000,
      priority: 7,
      weight: 2
    });
    
    // Solana RPC endpoints
    this.addEndpoint('solana_rpc', {
      endpoint: 'solana_rpc',
      windowSize: 60000,
      maxRequests: 2000,        // High limit for RPC
      burstAllowance: 200,
      backoffMultiplier: 1.2,
      maxBackoffTime: 60000,    // 1 minute
      priority: 9,              // Highest priority
      weight: 1
    });
    
    // Jupiter API
    this.addEndpoint('jupiter_api', {
      endpoint: 'jupiter_api',
      windowSize: 60000,
      maxRequests: 600,
      burstAllowance: 60,
      backoffMultiplier: 1.5,
      maxBackoffTime: 120000,   // 2 minutes
      priority: 6,
      weight: 1
    });
    
    // Generic API endpoints
    this.addEndpoint('generic_api', {
      endpoint: 'generic_api',
      windowSize: 60000,
      maxRequests: 100,
      burstAllowance: 20,
      backoffMultiplier: 2.0,
      maxBackoffTime: 300000,   // 5 minutes
      priority: 5,
      weight: 1
    });
  }

  addEndpoint(name: string, config: EndpointConfig): void {
    this.endpointConfigs.set(name, config);
    this.endpointStates.set(name, {
      requests: 0,
      windowStart: Date.now(),
      backoffUntil: 0,
      consecutiveFailures: 0,
      totalRequests: 0,
      totalRejected: 0,
      lastRequest: 0
    });
    
    logger.debug(`➕ Added rate limit endpoint: ${name}`, {
      maxRequests: config.maxRequests,
      windowSize: config.windowSize,
      priority: config.priority
    });
  }

  async checkRateLimit(endpoint: string, weight: number = 1): Promise<{
    allowed: boolean;
    delay?: number;
    reason?: string;
  }> {
    const now = Date.now();
    
    // Check global rate limit first
    const globalCheck = this.checkGlobalLimit(now, weight);
    if (!globalCheck.allowed) {
      return globalCheck;
    }
    
    // Check endpoint-specific rate limit
    const endpointCheck = this.checkEndpointLimit(endpoint, now, weight);
    if (!endpointCheck.allowed) {
      return endpointCheck;
    }
    
    return { allowed: true };
  }

  private checkGlobalLimit(now: number, weight: number): { allowed: boolean; delay?: number; reason?: string } {
    // Check if in backoff period
    if (now < this.globalState.backoffUntil) {
      return {
        allowed: false,
        delay: this.globalState.backoffUntil - now,
        reason: 'Global backoff active'
      };
    }
    
    // Reset window if needed
    this.resetWindowIfNeeded(this.globalState, this.globalConfig, now);
    
    // Check if we can make the request
    const currentLoad = this.globalState.requests + weight;
    const maxAllowed = this.globalConfig.maxRequests + this.globalConfig.burstAllowance;
    
    if (currentLoad > maxAllowed) {
      return {
        allowed: false,
        delay: this.calculateDelay(this.globalState, this.globalConfig),
        reason: 'Global rate limit exceeded'
      };
    }
    
    return { allowed: true };
  }

  private checkEndpointLimit(endpoint: string, now: number, weight: number): { 
    allowed: boolean; 
    delay?: number; 
    reason?: string;
  } {
    const config = this.endpointConfigs.get(endpoint);
    const state = this.endpointStates.get(endpoint);
    
    if (!config || !state) {
      // If endpoint not configured, use generic limits
      const genericConfig = this.endpointConfigs.get('generic_api');
      if (genericConfig) {
        return this.checkEndpointLimit('generic_api', now, weight);
      }
      return { allowed: true };
    }
    
    // Check if in backoff period
    if (now < state.backoffUntil) {
      return {
        allowed: false,
        delay: state.backoffUntil - now,
        reason: `${endpoint} backoff active`
      };
    }
    
    // Reset window if needed
    this.resetWindowIfNeeded(state, config, now);
    
    // Check if we can make the request
    const currentLoad = state.requests + weight;
    const maxAllowed = config.maxRequests + config.burstAllowance;
    
    if (currentLoad > maxAllowed) {
      return {
        allowed: false,
        delay: this.calculateDelay(state, config),
        reason: `${endpoint} rate limit exceeded`
      };
    }
    
    return { allowed: true };
  }

  private resetWindowIfNeeded(state: RateLimitState, config: RateLimitConfig, now: number): void {
    if (now - state.windowStart >= config.windowSize) {
      state.requests = 0;
      state.windowStart = now;
      
      // Reset consecutive failures if window reset successfully
      if (state.consecutiveFailures > 0) {
        state.consecutiveFailures = Math.max(0, state.consecutiveFailures - 1);
      }
    }
  }

  private calculateDelay(state: RateLimitState, config: RateLimitConfig): number {
    const windowRemaining = config.windowSize - (Date.now() - state.windowStart);
    const backoffTime = Math.min(
      config.maxBackoffTime,
      1000 * Math.pow(config.backoffMultiplier, state.consecutiveFailures)
    );
    
    return Math.max(windowRemaining, backoffTime);
  }

  async makeRequest(endpoint: string, weight: number = 1, priority: number = 5): Promise<boolean> {
    const check = await this.checkRateLimit(endpoint, weight);
    
    if (check.allowed) {
      this.recordRequest(endpoint, weight);
      return true;
    } else {
      this.recordRejection(endpoint, check.reason || 'Unknown');
      
      // Emit rate limit event
      this.emit('rateLimitExceeded', {
        endpoint,
        delay: check.delay,
        reason: check.reason
      });
      
      return false;
    }
  }

  async makeRequestWithRetry(
    endpoint: string, 
    maxRetries: number = 3, 
    weight: number = 1, 
    priority: number = 5
  ): Promise<boolean> {
    let attempts = 0;
    
    while (attempts <= maxRetries) {
      const success = await this.makeRequest(endpoint, weight, priority);
      
      if (success) {
        return true;
      }
      
      attempts++;
      
      if (attempts <= maxRetries) {
        const delay = this.calculateRetryDelay(attempts);
        
        logger.debug(`🔄 Rate limited, retrying ${endpoint} in ${delay}ms (attempt ${attempts}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    logger.warn(`❌ Failed to make request to ${endpoint} after ${maxRetries} retries`);
    return false;
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000 * Math.pow(1.5, attempt - 1);
    const jitter = Math.random() * 0.2 * baseDelay;
    return Math.floor(baseDelay + jitter);
  }

  private recordRequest(endpoint: string, weight: number): void {
    const now = Date.now();
    
    // Update global state
    this.globalState.requests += weight;
    this.globalState.totalRequests += 1;
    this.globalState.lastRequest = now;
    
    // Update endpoint state
    const state = this.endpointStates.get(endpoint);
    if (state) {
      state.requests += weight;
      state.totalRequests += 1;
      state.lastRequest = now;
      
      // Reset consecutive failures on successful request
      state.consecutiveFailures = 0;
    }
  }

  private recordRejection(endpoint: string, reason: string): void {
    // Update global state
    this.globalState.totalRejected += 1;
    this.globalState.consecutiveFailures += 1;
    
    // Update endpoint state
    const state = this.endpointStates.get(endpoint);
    const config = this.endpointConfigs.get(endpoint);
    
    if (state && config) {
      state.totalRejected += 1;
      state.consecutiveFailures += 1;
      
      // Calculate backoff time
      const backoffTime = Math.min(
        config.maxBackoffTime,
        1000 * Math.pow(config.backoffMultiplier, state.consecutiveFailures)
      );
      
      state.backoffUntil = Date.now() + backoffTime;
      
      logger.debug(`⏰ Applied backoff to ${endpoint}: ${backoffTime}ms`, {
        reason,
        consecutiveFailures: state.consecutiveFailures
      });
    }
  }

  applyBackoff(endpoint: string, duration?: number): void {
    const state = this.endpointStates.get(endpoint);
    const config = this.endpointConfigs.get(endpoint);
    
    if (state && config) {
      const backoffDuration = duration || Math.min(
        config.maxBackoffTime,
        5000 * Math.pow(config.backoffMultiplier, state.consecutiveFailures + 1)
      );
      
      state.backoffUntil = Date.now() + backoffDuration;
      state.consecutiveFailures += 1;
      
      logger.info(`🚫 Applied manual backoff to ${endpoint}: ${backoffDuration}ms`);
      
      this.emit('backoffApplied', {
        endpoint,
        duration: backoffDuration,
        reason: 'Manual backoff'
      });
    }
  }

  increaseDelay(percentage: number): void {
    logger.info(`⏰ Increasing all rate limit delays by ${(percentage * 100).toFixed(1)}%`);
    
    for (const [endpoint, config] of this.endpointConfigs) {
      config.maxRequests = Math.floor(config.maxRequests * (1 - percentage));
      config.burstAllowance = Math.floor(config.burstAllowance * (1 - percentage));
      
      logger.debug(`📉 Reduced limits for ${endpoint}`, {
        maxRequests: config.maxRequests,
        burstAllowance: config.burstAllowance
      });
    }
    
    // Also reduce global limits
    this.globalConfig.maxRequests = Math.floor(this.globalConfig.maxRequests * (1 - percentage));
    this.globalConfig.burstAllowance = Math.floor(this.globalConfig.burstAllowance * (1 - percentage));
  }

  decreaseDelay(percentage: number): void {
    logger.info(`⏰ Decreasing all rate limit delays by ${(percentage * 100).toFixed(1)}%`);
    
    for (const [endpoint, config] of this.endpointConfigs) {
      config.maxRequests = Math.floor(config.maxRequests * (1 + percentage));
      config.burstAllowance = Math.floor(config.burstAllowance * (1 + percentage));
    }
    
    // Also increase global limits
    this.globalConfig.maxRequests = Math.floor(this.globalConfig.maxRequests * (1 + percentage));
    this.globalConfig.burstAllowance = Math.floor(this.globalConfig.burstAllowance * (1 + percentage));
  }

  private startRequestProcessing(): void {
    this.processingInterval = setInterval(async () => {
      await this.processRequestQueue();
    }, 100); // Process queue every 100ms
  }

  private async processRequestQueue(): Promise<void> {
    if (this.requestQueue.length === 0) return;
    
    // Sort by priority (higher priority first), then by timestamp
    this.requestQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.timestamp - b.timestamp;
    });
    
    const now = Date.now();
    const processedRequests: number[] = [];
    
    for (let i = 0; i < this.requestQueue.length && i < 10; i++) {
      const request = this.requestQueue[i];
      
      const success = await this.makeRequest(request.endpoint, request.weight, request.priority);
      if (success) {
        processedRequests.push(i);
      }
    }
    
    // Remove processed requests (in reverse order to maintain indices)
    processedRequests.reverse().forEach(index => {
      this.requestQueue.splice(index, 1);
    });
  }

  // Statistics and monitoring
  getEndpointStats(endpoint: string): any {
    const config = this.endpointConfigs.get(endpoint);
    const state = this.endpointStates.get(endpoint);
    
    if (!config || !state) {
      return null;
    }
    
    const now = Date.now();
    const windowProgress = (now - state.windowStart) / config.windowSize;
    
    return {
      endpoint: config.endpoint,
      currentRequests: state.requests,
      maxRequests: config.maxRequests,
      burstAllowance: config.burstAllowance,
      utilization: (state.requests / config.maxRequests * 100).toFixed(1) + '%',
      windowProgress: (windowProgress * 100).toFixed(1) + '%',
      backoffActive: now < state.backoffUntil,
      backoffRemaining: Math.max(0, state.backoffUntil - now),
      consecutiveFailures: state.consecutiveFailures,
      totalRequests: state.totalRequests,
      totalRejected: state.totalRejected,
      successRate: state.totalRequests > 0 ? 
        ((state.totalRequests - state.totalRejected) / state.totalRequests * 100).toFixed(1) + '%' : 
        'N/A'
    };
  }

  getAllStats(): any {
    const endpointStats: Record<string, any> = {};
    
    for (const endpoint of this.endpointConfigs.keys()) {
      endpointStats[endpoint] = this.getEndpointStats(endpoint);
    }
    
    return {
      global: {
        currentRequests: this.globalState.requests,
        maxRequests: this.globalConfig.maxRequests,
        totalRequests: this.globalState.totalRequests,
        totalRejected: this.globalState.totalRejected,
        queueLength: this.requestQueue.length,
        successRate: this.globalState.totalRequests > 0 ? 
          ((this.globalState.totalRequests - this.globalState.totalRejected) / this.globalState.totalRequests * 100).toFixed(1) + '%' : 
          'N/A'
      },
      endpoints: endpointStats,
      isStarted: this.isStarted
    };
  }

  getStatus(): any {
    return this.getAllStats();
  }

  async healthCheck(): Promise<boolean> {
    return this.isStarted;
  }
}