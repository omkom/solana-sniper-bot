import { Connection, Commitment } from '@solana/web3.js';
import { logger } from '../monitoring/logger';

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
  private requestDelay = 500; // Increased to 500ms for better rate limiting
  private lastRequestTime = 0;
  private retryDelays = [1000, 2000, 5000, 10000]; // Longer backoff delays
  private initialized = false;

  constructor() {
    // Don't initialize immediately - let singleton manager handle it
  }

  async initialize(config: any): Promise<void> {
    if (this.initialized) return;

    try {
      this.initializeConnections(config);
      this.startQueueProcessor();
      this.initialized = true;
      logger.info('🔗 ConnectionManager initialized successfully');
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
        await new Promise(resolve => setTimeout(resolve, 50));
        continue;
      }

      // Sort queue by priority
      this.requestQueue.sort((a, b) => b.priority - a.priority);
      const queueItem = this.requestQueue.shift();
      
      if (!queueItem) continue;

      // Rate limiting
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < this.requestDelay) {
        await new Promise(resolve => setTimeout(resolve, this.requestDelay - timeSinceLastRequest));
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
      if (queueItem.retryCount < queueItem.maxRetries && this.shouldRetry(error)) {
        queueItem.retryCount++;
        const retryDelay = this.retryDelays[Math.min(queueItem.retryCount - 1, this.retryDelays.length - 1)];
        
        // Comment out excessive retry logging
        // logger.warn(`Request failed, retrying in ${retryDelay}ms (attempt ${queueItem.retryCount}/${queueItem.maxRetries})`, { error });
        
        setTimeout(() => {
          this.requestQueue.unshift(queueItem); // Add back to front for priority
        }, retryDelay);
      } else {
        queueItem.reject(error);
      }
    } finally {
      this.activeRequests--;
    }
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