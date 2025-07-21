import { Connection, Commitment } from '@solana/web3.js';
import { logger } from '../monitoring/logger';
import { RateLimiter } from '../utils/rate-limiter';

interface RequestQueueItem {
  request: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  retryCount: number;
  maxRetries: number;
  priority: number;
}

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private currentIndex: number = 0;
  private requestQueue: RequestQueueItem[] = [];
  private isProcessingQueue = false;
  private activeRequests = 0;
  private maxConcurrentRequests = 2; // Reduced from 3 to prevent overload
  private requestDelay = 2000; // Increased to 2s for better rate limiting
  private lastRequestTime = 0;
  private retryDelays = [5000, 15000, 30000, 60000]; // Much longer backoff delays for 429s
  private initialized = false;
  private rateLimiter: RateLimiter;

  constructor() {
    // Initialize rate limiter with conservative settings
    this.rateLimiter = new RateLimiter({
      windowSize: 60000,      // 1 minute window
      maxRequests: 30,        // Only 30 requests per minute
      burstAllowance: 5,      // Small burst allowance
      backoffMultiplier: 2.0, // Aggressive backoff
      maxBackoffTime: 300000  // 5 minute max backoff
    });
  }

  async initialize(config: any): Promise<void> {
    if (this.initialized) return;

    try {
      this.initializeConnections(config);
      this.rateLimiter.start();
      this.startQueueProcessor();
      this.initialized = true;
      logger.info('🔗 ConnectionManager initialized successfully with rate limiting');
    } catch (error) {
      logger.error('❌ Failed to initialize ConnectionManager:', error);
      throw error;
    }
  }

  private initializeConnections(config: any): void {
    const endpoints = [
      config.getRPCEndpoint(),
      config.getFallbackRPC(),
      // Add reliable fallback endpoints
      'https://api.mainnet-beta.solana.com'
    ];

    for (const endpoint of endpoints) {
      try {
        const connection = new Connection(endpoint, {
          commitment: 'processed' as Commitment,
          confirmTransactionInitialTimeout: 15000, // Increased timeout for stability
          wsEndpoint: endpoint.replace('https://', 'wss://').replace('http://', 'ws://'),
          httpHeaders: {
            'Content-Type': 'application/json',
            'User-Agent': 'Educational-Token-Analyzer/1.0'
          }
        });
        
        this.connections.set(endpoint, connection);
        console.log(`📡 Connected to RPC: ${endpoint}`);
      } catch (error) {
        logger.warn(`Failed to initialize connection to ${endpoint}`, { error });
      }
    }
    
    if (this.connections.size === 0) {
      throw new Error('No RPC connections could be established');
    }
  }

  getConnection(): Connection {
    if (this.connections.size === 0) {
      // If not initialized, create a fallback connection
      logger.warn('ConnectionManager not initialized, creating fallback connection');
      return new Connection(
        'https://api.mainnet-beta.solana.com',
        { commitment: 'processed' }
      );
    }
    
    const endpoints = Array.from(this.connections.keys());
    const endpoint = endpoints[this.currentIndex % endpoints.length];
    this.currentIndex++;
    
    return this.connections.get(endpoint)!;
  }

  // Get connection with load balancing
  async getOptimalConnection(): Promise<Connection> {
    try {
      return await this.getHealthiestConnection();
    } catch (error) {
      logger.warn('Failed to get healthiest connection, using round-robin', { error });
      return this.getConnection();
    }
  }

  async getHealthiestConnection(): Promise<Connection> {
    const healthChecks = await Promise.all(
      Array.from(this.connections.entries()).map(async ([endpoint, conn]) => {
        try {
          const start = Date.now();
          await conn.getLatestBlockhash('processed');
          const latency = Date.now() - start;
          return { endpoint, conn, latency, healthy: true };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`RPC health check failed for ${endpoint}`, { 
            error: errorMessage,
            endpoint,
            timestamp: new Date().toISOString()
          });
          return { endpoint, conn, latency: Infinity, healthy: false };
        }
      })
    );

    const healthiest = healthChecks
      .filter(c => c.healthy)
      .sort((a, b) => a.latency - b.latency)[0];

    if (!healthiest) {
      // Instead of throwing, fall back to round-robin
      logger.warn('No healthy RPC connections available, falling back to round-robin');
      return this.getConnection();
    }

    return healthiest.conn;
  }

  async checkLatency(connection: Connection): Promise<number> {
    const start = Date.now();
    try {
      await connection.getLatestBlockhash('processed');
      return Date.now() - start;
    } catch {
      return Infinity;
    }
  }

  private startQueueProcessor(): void {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.isProcessingQueue) {
      if (this.requestQueue.length === 0 || this.activeRequests >= this.maxConcurrentRequests) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Increased wait time
        continue;
      }

      // Sort queue by priority
      this.requestQueue.sort((a, b) => b.priority - a.priority);
      const queueItem = this.requestQueue.shift();
      
      if (!queueItem) continue;

      // Check rate limiter before making request
      const canMakeRequest = await this.rateLimiter.makeRequest('solana_rpc', 1, queueItem.priority);
      
      if (!canMakeRequest) {
        // Put request back at end of queue
        this.requestQueue.push(queueItem);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before checking again
        continue;
      }

      this.activeRequests++;
      this.lastRequestTime = Date.now();
      
      this.executeRequest(queueItem);
    }
  }

  private async executeRequest(queueItem: RequestQueueItem): Promise<void> {
    try {
      const result = await queueItem.request();
      queueItem.resolve(result);
    } catch (error) {
      // Check if this is a 429 rate limit error
      const is429Error = this.is429Error(error);
      
      if (is429Error) {
        // Apply backoff to rate limiter for this endpoint
        this.rateLimiter.applyBackoff('solana_rpc', 30000); // 30 second backoff for 429s
        logger.warn(`429 Rate limit hit - applying 30s backoff. Queue length: ${this.requestQueue.length}`);
      }
      
      if (queueItem.retryCount < queueItem.maxRetries && this.shouldRetry(error)) {
        queueItem.retryCount++;
        let retryDelay = this.retryDelays[Math.min(queueItem.retryCount - 1, this.retryDelays.length - 1)];
        
        // For 429 errors, use much longer delays
        if (is429Error) {
          retryDelay = Math.max(retryDelay, 30000 * Math.pow(2, queueItem.retryCount - 1)); // Exponential backoff starting at 30s
        }
        
        logger.debug(`Request failed, retrying in ${retryDelay/1000}s (attempt ${queueItem.retryCount}/${queueItem.maxRetries})`);
        
        setTimeout(() => {
          this.requestQueue.push(queueItem); // Add to end of queue for 429s to reduce pressure
        }, retryDelay);
      } else {
        queueItem.reject(error);
      }
    } finally {
      this.activeRequests--;
    }
  }

  private is429Error(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const statusCode = error.status || error.response?.status;
    
    return statusCode === 429 || 
           errorMessage.includes('429') || 
           errorMessage.includes('too many requests') ||
           errorMessage.includes('rate limit');
  }

  private shouldRetry(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || '';
    
    // Retry on network errors, timeouts, and 429s
    return errorMessage.includes('timeout') ||
           errorMessage.includes('network') ||
           errorMessage.includes('fetch failed') ||
           errorMessage.includes('429') ||
           errorMessage.includes('too many requests') ||
           errorCode === 'UND_ERR_CONNECT_TIMEOUT' ||
           errorCode === 'ECONNRESET' ||
           errorCode === 'ENOTFOUND';
  }

  // Queued request wrapper
  async queueRequest<T>(request: () => Promise<T>, priority: number = 1, maxRetries: number = 3): Promise<T> {
    return new Promise((resolve, reject) => {
      const queueItem: RequestQueueItem = {
        request,
        resolve,
        reject,
        retryCount: 0,
        maxRetries,
        priority
      };
      
      this.requestQueue.push(queueItem);
    });
  }

  // Optimized method to get parsed transaction with retry logic
  async getParsedTransactionWithRetry(signature: string, maxRetries: number = 3): Promise<any> {
    return this.queueRequest(async () => {
      const connection = await this.getOptimalConnection();
      return await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
    }, 2, maxRetries); // Higher priority for transaction parsing
  }

  // Optimized method to get latest blockhash with retry logic
  async getLatestBlockhashWithRetry(commitment: Commitment = 'processed'): Promise<any> {
    return this.queueRequest(async () => {
      const connection = await this.getOptimalConnection();
      return await connection.getLatestBlockhash(commitment);
    }, 3, 2); // High priority, fewer retries
  }

  // Get queue status for monitoring
  getQueueStatus(): { queueLength: number; activeRequests: number; maxConcurrent: number } {
    return {
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrentRequests
    };
  }

  // Adjust rate limiting parameters
  setRateLimit(maxConcurrent: number, requestDelay: number): void {
    this.maxConcurrentRequests = maxConcurrent;
    this.requestDelay = requestDelay;
    // Reduce frequent rate limit update logging
    // logger.info('Rate limit parameters updated', { maxConcurrent, requestDelay });
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    this.isProcessingQueue = false;
    
    // Wait for active requests to complete
    while (this.activeRequests > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Clear queue
    this.requestQueue.length = 0;
    logger.info('Connection manager cleaned up');
  }
}