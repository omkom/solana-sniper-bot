/**
 * Connection Pool with Multi-RPC Failover
 * Provides high-availability RPC connections with automatic failover and load balancing
 */

import { Connection, ConnectionConfig, Commitment } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { PerformanceProfiler } from '../utils/performance-profiler';

interface RpcEndpoint {
  url: string;
  priority: number;
  healthy: boolean;
  lastCheck: number;
  responseTime: number;
  errorCount: number;
  successCount: number;
  rateLimit?: {
    requests: number;
    resetTime: number;
    limit: number;
  };
}

interface ConnectionPoolConfig {
  endpoints: string[];
  poolSize: number;
  healthCheckInterval: number;
  maxRetries: number;
  connectionTimeout: number;
  commitment?: Commitment;
  maxErrorRate: number;
  rateLimitBuffer: number;
  loadBalanceStrategy: 'round-robin' | 'fastest' | 'least-loaded';
}

interface ConnectionWrapper {
  connection: Connection;
  endpoint: RpcEndpoint;
  activeRequests: number;
  lastUsed: number;
  id: string;
}

export class ConnectionPool extends EventEmitter {
  private config: ConnectionPoolConfig;
  private endpoints: Map<string, RpcEndpoint> = new Map();
  private connections: Map<string, ConnectionWrapper> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private currentIndex = 0;
  private isStarted = false;
  private performanceProfiler: PerformanceProfiler;

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    super();
    
    this.config = {
      endpoints: [
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana',
        'https://solana.public-rpc.com'
      ],
      poolSize: 20,
      healthCheckInterval: 30000,
      maxRetries: 3,
      connectionTimeout: 10000,
      commitment: 'confirmed',
      maxErrorRate: 0.1, // 10% error rate threshold
      rateLimitBuffer: 0.8, // Use 80% of rate limit
      loadBalanceStrategy: 'fastest',
      ...config
    };

    this.performanceProfiler = new PerformanceProfiler();
    this.initializeEndpoints();
    
    logger.info('🔗 Connection Pool initialized', {
      endpoints: this.config.endpoints.length,
      poolSize: this.config.poolSize,
      strategy: this.config.loadBalanceStrategy
    });
  }

  private initializeEndpoints(): void {
    this.config.endpoints.forEach((url, index) => {
      this.endpoints.set(url, {
        url,
        priority: index + 1,
        healthy: true,
        lastCheck: 0,
        responseTime: 0,
        errorCount: 0,
        successCount: 0,
        rateLimit: {
          requests: 0,
          resetTime: Date.now() + 60000,
          limit: 100 // Default rate limit per minute
        }
      });
    });
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      logger.warn('Connection pool already started');
      return;
    }

    logger.info('🚀 Starting connection pool...');
    
    try {
      // Create initial connections
      await this.createInitialConnections();
      
      // Start health monitoring
      this.startHealthChecking();
      
      this.isStarted = true;
      this.emit('started');
      
      logger.info('✅ Connection pool started successfully', {
        activeConnections: this.connections.size,
        healthyEndpoints: this.getHealthyEndpoints().length
      });
      
    } catch (error) {
      logger.error('❌ Failed to start connection pool:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return;

    logger.info('🛑 Stopping connection pool...');
    
    this.isStarted = false;
    
    // Stop health checking
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Close all connections
    this.connections.clear();
    
    this.emit('stopped');
    logger.info('🛑 Connection pool stopped');
  }

  private async createInitialConnections(): Promise<void> {
    const healthyEndpoints = this.getHealthyEndpoints();
    const connectionsPerEndpoint = Math.ceil(this.config.poolSize / healthyEndpoints.length);
    
    const connectionPromises: Promise<void>[] = [];
    
    for (const endpoint of healthyEndpoints) {
      for (let i = 0; i < connectionsPerEndpoint && this.connections.size < this.config.poolSize; i++) {
        connectionPromises.push(this.createConnection(endpoint));
      }
    }
    
    await Promise.all(connectionPromises);
  }

  private async createConnection(endpoint: RpcEndpoint): Promise<void> {
    try {
      const connectionConfig: ConnectionConfig = {
        commitment: this.config.commitment,
        confirmTransactionInitialTimeout: this.config.connectionTimeout,
        wsEndpoint: endpoint.url.replace('http', 'ws')
      };
      
      const connection = new Connection(endpoint.url, connectionConfig);
      const connectionId = `${endpoint.url}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Test connection
      await this.testConnection(connection, endpoint);
      
      const wrapper: ConnectionWrapper = {
        connection,
        endpoint,
        activeRequests: 0,
        lastUsed: Date.now(),
        id: connectionId
      };
      
      this.connections.set(connectionId, wrapper);
      
      logger.debug(`✅ Connection created: ${endpoint.url}`);
      
    } catch (error) {
      logger.error(`❌ Failed to create connection to ${endpoint.url}:`, error);
      endpoint.healthy = false;
      endpoint.errorCount++;
    }
  }

  private async testConnection(connection: Connection, endpoint: RpcEndpoint): Promise<void> {
    const timer = this.performanceProfiler.startTimer();
    
    try {
      await Promise.race([
        connection.getSlot(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), this.config.connectionTimeout)
        )
      ]);
      
      const responseTime = timer();
      endpoint.responseTime = responseTime;
      endpoint.successCount++;
      endpoint.healthy = true;
      
    } catch (error) {
      endpoint.healthy = false;
      endpoint.errorCount++;
      throw error;
    }
  }

  getConnection(): Connection {
    const wrapper = this.selectOptimalConnection();
    
    if (!wrapper) {
      throw new Error('No healthy connections available');
    }
    
    wrapper.activeRequests++;
    wrapper.lastUsed = Date.now();
    
    // Track rate limiting
    this.trackRateLimit(wrapper.endpoint);
    
    return wrapper.connection;
  }

  getConnectionWithEndpoint(): { connection: Connection; endpoint: string } {
    const wrapper = this.selectOptimalConnection();
    
    if (!wrapper) {
      throw new Error('No healthy connections available');
    }
    
    wrapper.activeRequests++;
    wrapper.lastUsed = Date.now();
    
    return {
      connection: wrapper.connection,
      endpoint: wrapper.endpoint.url
    };
  }

  private selectOptimalConnection(): ConnectionWrapper | null {
    const availableConnections = Array.from(this.connections.values())
      .filter(wrapper => 
        wrapper.endpoint.healthy && 
        !this.isRateLimited(wrapper.endpoint)
      );
    
    if (availableConnections.length === 0) {
      logger.warn('⚠️ No healthy connections available, attempting to create new ones');
      this.attemptConnectionRecovery();
      return null;
    }
    
    switch (this.config.loadBalanceStrategy) {
      case 'round-robin':
        return this.selectRoundRobin(availableConnections);
      
      case 'fastest':
        return this.selectFastest(availableConnections);
      
      case 'least-loaded':
        return this.selectLeastLoaded(availableConnections);
      
      default:
        return availableConnections[0];
    }
  }

  private selectRoundRobin(connections: ConnectionWrapper[]): ConnectionWrapper {
    const connection = connections[this.currentIndex % connections.length];
    this.currentIndex++;
    return connection;
  }

  private selectFastest(connections: ConnectionWrapper[]): ConnectionWrapper {
    return connections.reduce((fastest, current) => 
      current.endpoint.responseTime < fastest.endpoint.responseTime ? current : fastest
    );
  }

  private selectLeastLoaded(connections: ConnectionWrapper[]): ConnectionWrapper {
    return connections.reduce((leastLoaded, current) => 
      current.activeRequests < leastLoaded.activeRequests ? current : leastLoaded
    );
  }

  private isRateLimited(endpoint: RpcEndpoint): boolean {
    if (!endpoint.rateLimit) return false;
    
    const now = Date.now();
    if (now > endpoint.rateLimit.resetTime) {
      // Reset rate limit window
      endpoint.rateLimit.requests = 0;
      endpoint.rateLimit.resetTime = now + 60000;
      return false;
    }
    
    const usedCapacity = endpoint.rateLimit.requests / endpoint.rateLimit.limit;
    return usedCapacity >= this.config.rateLimitBuffer;
  }

  private trackRateLimit(endpoint: RpcEndpoint): void {
    if (endpoint.rateLimit) {
      endpoint.rateLimit.requests++;
      
      if (this.isRateLimited(endpoint)) {
        logger.warn(`⚠️ Approaching rate limit for ${endpoint.url}`, {
          requests: endpoint.rateLimit.requests,
          limit: endpoint.rateLimit.limit
        });
        
        this.emit('rateLimitWarning', {
          endpoint: endpoint.url,
          usage: endpoint.rateLimit.requests / endpoint.rateLimit.limit
        });
      }
    }
  }

  releaseConnection(connection: Connection): void {
    const wrapper = Array.from(this.connections.values())
      .find(w => w.connection === connection);
    
    if (wrapper) {
      wrapper.activeRequests = Math.max(0, wrapper.activeRequests - 1);
    }
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
    
    // Initial health check
    setTimeout(() => this.performHealthChecks(), 1000);
  }

  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises: Promise<void>[] = [];
    
    for (const endpoint of this.endpoints.values()) {
      healthCheckPromises.push(this.checkEndpointHealth(endpoint));
    }
    
    await Promise.all(healthCheckPromises);
    
    // Remove connections to unhealthy endpoints
    await this.pruneUnhealthyConnections();
    
    // Ensure minimum healthy connections
    await this.ensureMinimumConnections();
    
    this.emit('healthCheckComplete', {
      totalEndpoints: this.endpoints.size,
      healthyEndpoints: this.getHealthyEndpoints().length,
      totalConnections: this.connections.size,
      activeConnections: this.getActiveConnections()
    });
  }

  private async checkEndpointHealth(endpoint: RpcEndpoint): Promise<void> {
    const timer = this.performanceProfiler.startTimer();
    
    try {
      const connection = new Connection(endpoint.url, { commitment: this.config.commitment });
      
      await Promise.race([
        connection.getSlot(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);
      
      const responseTime = timer();
      const errorRate = endpoint.errorCount / (endpoint.errorCount + endpoint.successCount);
      
      // Update endpoint status
      endpoint.responseTime = (endpoint.responseTime + responseTime) / 2; // Moving average
      endpoint.lastCheck = Date.now();
      endpoint.successCount++;
      endpoint.healthy = errorRate <= this.config.maxErrorRate;
      
      if (!endpoint.healthy && errorRate > this.config.maxErrorRate) {
        logger.warn(`📊 Endpoint marked unhealthy due to high error rate: ${endpoint.url}`, {
          errorRate: (errorRate * 100).toFixed(2) + '%',
          threshold: (this.config.maxErrorRate * 100).toFixed(2) + '%'
        });
      }
      
    } catch (error) {
      endpoint.errorCount++;
      endpoint.healthy = false;
      endpoint.lastCheck = Date.now();
      
      logger.warn(`❌ Health check failed for ${endpoint.url}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCount: endpoint.errorCount
      });
    }
  }

  private async pruneUnhealthyConnections(): Promise<void> {
    const connectionsToRemove: string[] = [];
    
    for (const [id, wrapper] of this.connections) {
      if (!wrapper.endpoint.healthy) {
        connectionsToRemove.push(id);
      }
    }
    
    connectionsToRemove.forEach(id => {
      this.connections.delete(id);
      logger.debug(`🗑️ Removed unhealthy connection: ${id}`);
    });
  }

  private async ensureMinimumConnections(): Promise<void> {
    const healthyEndpoints = this.getHealthyEndpoints();
    const minConnections = Math.max(1, Math.floor(this.config.poolSize * 0.3)); // At least 30% of pool size
    
    if (this.connections.size < minConnections && healthyEndpoints.length > 0) {
      logger.info(`🔧 Creating additional connections (current: ${this.connections.size}, minimum: ${minConnections})`);
      
      const connectionsNeeded = minConnections - this.connections.size;
      const connectionPromises: Promise<void>[] = [];
      
      for (let i = 0; i < connectionsNeeded; i++) {
        const endpoint = healthyEndpoints[i % healthyEndpoints.length];
        connectionPromises.push(this.createConnection(endpoint));
      }
      
      await Promise.allSettled(connectionPromises);
    }
  }

  private async attemptConnectionRecovery(): Promise<void> {
    logger.info('🔄 Attempting connection recovery...');
    
    // Force health check on all endpoints
    const recoveryPromises: Promise<void>[] = [];
    
    for (const endpoint of this.endpoints.values()) {
      recoveryPromises.push(this.checkEndpointHealth(endpoint));
    }
    
    await Promise.all(recoveryPromises);
    
    // Try to create connections to recovered endpoints
    const healthyEndpoints = this.getHealthyEndpoints();
    if (healthyEndpoints.length > 0) {
      await this.createConnection(healthyEndpoints[0]);
    }
  }

  scaleDown(targetSize: number): void {
    if (targetSize >= this.connections.size) return;
    
    logger.info(`📉 Scaling down connection pool from ${this.connections.size} to ${targetSize}`);
    
    const connections = Array.from(this.connections.entries())
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed); // Sort by least recently used
    
    const connectionsToRemove = connections
      .slice(targetSize)
      .map(([id]) => id);
    
    connectionsToRemove.forEach(id => {
      this.connections.delete(id);
    });
    
    this.emit('scaledDown', {
      previousSize: this.connections.size + connectionsToRemove.length,
      currentSize: this.connections.size
    });
  }

  scaleUp(targetSize: number): void {
    if (targetSize <= this.connections.size) return;
    
    logger.info(`📈 Scaling up connection pool from ${this.connections.size} to ${targetSize}`);
    
    const healthyEndpoints = this.getHealthyEndpoints();
    if (healthyEndpoints.length === 0) {
      logger.warn('Cannot scale up: no healthy endpoints available');
      return;
    }
    
    const connectionsNeeded = targetSize - this.connections.size;
    const creationPromises: Promise<void>[] = [];
    
    for (let i = 0; i < connectionsNeeded; i++) {
      const endpoint = healthyEndpoints[i % healthyEndpoints.length];
      creationPromises.push(this.createConnection(endpoint));
    }
    
    Promise.allSettled(creationPromises).then(() => {
      this.emit('scaledUp', {
        previousSize: this.connections.size - connectionsNeeded,
        currentSize: this.connections.size
      });
    });
  }

  // Public API methods
  getHealthyEndpoints(): RpcEndpoint[] {
    return Array.from(this.endpoints.values()).filter(endpoint => endpoint.healthy);
  }

  getActiveConnections(): number {
    return Array.from(this.connections.values())
      .reduce((sum, wrapper) => sum + wrapper.activeRequests, 0);
  }

  getStatus(): any {
    const endpoints = Array.from(this.endpoints.values());
    const connections = Array.from(this.connections.values());
    
    return {
      isStarted: this.isStarted,
      totalEndpoints: endpoints.length,
      healthyEndpoints: endpoints.filter(e => e.healthy).length,
      totalConnections: connections.length,
      activeRequests: this.getActiveConnections(),
      loadBalanceStrategy: this.config.loadBalanceStrategy,
      endpoints: endpoints.map(endpoint => ({
        url: endpoint.url,
        healthy: endpoint.healthy,
        responseTime: endpoint.responseTime,
        errorCount: endpoint.errorCount,
        successCount: endpoint.successCount,
        errorRate: endpoint.errorCount / (endpoint.errorCount + endpoint.successCount + 1) * 100
      })),
      connections: connections.length,
      poolUtilization: (this.getActiveConnections() / this.config.poolSize * 100).toFixed(2) + '%'
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.isStarted && this.getHealthyEndpoints().length > 0 && this.connections.size > 0;
  }

  getStats(): any {
    const endpoints = Array.from(this.endpoints.values());
    return {
      poolSize: this.config.poolSize,
      activeConnections: this.connections.size,
      totalRequests: endpoints.reduce((sum, e) => sum + e.successCount + e.errorCount, 0),
      totalErrors: endpoints.reduce((sum, e) => sum + e.errorCount, 0),
      averageResponseTime: endpoints.reduce((sum, e) => sum + e.responseTime, 0) / endpoints.length,
      healthyEndpoints: this.getHealthyEndpoints().length,
      config: this.config
    };
  }
}