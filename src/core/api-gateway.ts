/**
 * API Gateway - Unified gateway for all external API communications
 * Replaces the deleted api-gateway.ts with enhanced functionality
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { apiCoordinator } from './centralized-api-coordinator';

export interface ApiEndpointConfig {
  name: string;
  baseUrl: string;
  rateLimitPerSecond: number;
  timeout: number;
  retryCount: number;
  headers?: Record<string, string>;
  healthCheckPath?: string;
}

export interface ApiGatewayConfig {
  endpoints: ApiEndpointConfig[];
  loadBalancing: 'round-robin' | 'random' | 'health-based';
  healthCheckInterval: number;
  circuitBreakerThreshold: number;
  defaultTimeout: number;
}

export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  params?: Record<string, any>;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

export interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
  headers?: Record<string, string>;
  cached?: boolean;
  responseTime: number;
  endpoint: string;
}

export class ApiGateway extends EventEmitter {
  private config: ApiGatewayConfig;
  private endpoints = new Map<string, ApiEndpointConfig>();
  private endpointHealth = new Map<string, boolean>();
  private circuitBreakers = new Map<string, { failures: number; lastFailure: number; isOpen: boolean }>();
  private loadBalancerIndex = 0;
  private healthCheckInterval?: NodeJS.Timeout;
  private initialized = false;

  constructor(config: Partial<ApiGatewayConfig> = {}) {
    super();
    
    this.config = {
      endpoints: [
        {
          name: 'dexscreener',
          baseUrl: 'https://api.dexscreener.com',
          rateLimitPerSecond: 10,
          timeout: 10000,
          retryCount: 2,
          healthCheckPath: '/latest/dex/pairs/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        },
        {
          name: 'solscan',
          baseUrl: 'https://api.solscan.io',
          rateLimitPerSecond: 5,
          timeout: 15000,
          retryCount: 3,
          healthCheckPath: '/v2.0/system/status'
        },
        {
          name: 'jupiter',
          baseUrl: 'https://tokens.jup.ag',
          rateLimitPerSecond: 20,
          timeout: 5000,
          retryCount: 2,
          healthCheckPath: '/v6/tokens/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        }
      ],
      loadBalancing: 'health-based',
      healthCheckInterval: 60000,
      circuitBreakerThreshold: 5,
      defaultTimeout: 10000,
      ...config
    };

    this.initialize();
  }

  private initialize(): void {
    try {
      // Initialize endpoints map
      for (const endpoint of this.config.endpoints) {
        this.endpoints.set(endpoint.name, endpoint);
        this.endpointHealth.set(endpoint.name, true);
        this.circuitBreakers.set(endpoint.name, {
          failures: 0,
          lastFailure: 0,
          isOpen: false
        });
      }

      // Start health monitoring
      this.startHealthChecks();
      
      this.initialized = true;
      logger.info('🌐 API Gateway initialized', {
        endpoints: Array.from(this.endpoints.keys()),
        loadBalancing: this.config.loadBalancing
      });

    } catch (error) {
      logger.error('❌ Failed to initialize API Gateway:', error);
      throw error;
    }
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    const healthPromises = Array.from(this.endpoints.entries()).map(async ([name, config]) => {
      try {
        if (!config.healthCheckPath) {
          this.endpointHealth.set(name, true);
          return;
        }

        const startTime = Date.now();
        const response = await fetch(`${config.baseUrl}${config.healthCheckPath}`, {
          method: 'GET',
          signal: AbortSignal.timeout(config.timeout)
        });

        const responseTime = Date.now() - startTime;
        const isHealthy = response.ok && responseTime < (config.timeout * 0.8);
        
        this.endpointHealth.set(name, isHealthy);
        
        if (isHealthy) {
          // Reset circuit breaker on successful health check
          const breaker = this.circuitBreakers.get(name);
          if (breaker) {
            breaker.failures = 0;
            breaker.isOpen = false;
            this.circuitBreakers.set(name, breaker);
          }
        }

        logger.debug(`Health check for ${name}: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'} (${responseTime}ms)`);

      } catch (error) {
        this.endpointHealth.set(name, false);
        logger.warn(`Health check failed for ${name}:`, error);
      }
    });

    await Promise.allSettled(healthPromises);
  }

  private selectEndpoint(endpointName?: string): ApiEndpointConfig | null {
    // If specific endpoint requested, return it if healthy
    if (endpointName) {
      const endpoint = this.endpoints.get(endpointName);
      if (endpoint && this.isEndpointAvailable(endpointName)) {
        return endpoint;
      }
      return null;
    }

    // Get all healthy endpoints
    const healthyEndpoints = Array.from(this.endpoints.entries())
      .filter(([name]) => this.isEndpointAvailable(name));

    if (healthyEndpoints.length === 0) {
      logger.error('No healthy endpoints available');
      return null;
    }

    // Apply load balancing strategy
    switch (this.config.loadBalancing) {
      case 'round-robin':
        const index = this.loadBalancerIndex % healthyEndpoints.length;
        this.loadBalancerIndex++;
        return healthyEndpoints[index][1];

      case 'random':
        const randomIndex = Math.floor(Math.random() * healthyEndpoints.length);
        return healthyEndpoints[randomIndex][1];

      case 'health-based':
        // Prefer endpoints with fewer recent failures
        healthyEndpoints.sort(([nameA], [nameB]) => {
          const breakerA = this.circuitBreakers.get(nameA)!;
          const breakerB = this.circuitBreakers.get(nameB)!;
          return breakerA.failures - breakerB.failures;
        });
        return healthyEndpoints[0][1];

      default:
        return healthyEndpoints[0][1];
    }
  }

  private isEndpointAvailable(name: string): boolean {
    const isHealthy = this.endpointHealth.get(name) || false;
    const breaker = this.circuitBreakers.get(name);
    
    if (!breaker) return isHealthy;
    
    // Check if circuit breaker is open
    if (breaker.isOpen) {
      // Check if we should try again (after 60 seconds)
      if (Date.now() - breaker.lastFailure > 60000) {
        breaker.isOpen = false;
        this.circuitBreakers.set(name, breaker);
        return isHealthy;
      }
      return false;
    }
    
    return isHealthy;
  }

  private updateCircuitBreaker(endpointName: string, success: boolean): void {
    const breaker = this.circuitBreakers.get(endpointName);
    if (!breaker) return;

    if (success) {
      breaker.failures = Math.max(0, breaker.failures - 1);
    } else {
      breaker.failures++;
      breaker.lastFailure = Date.now();
      
      if (breaker.failures >= this.config.circuitBreakerThreshold) {
        breaker.isOpen = true;
        logger.warn(`Circuit breaker OPEN for ${endpointName} (${breaker.failures} failures)`);
      }
    }

    this.circuitBreakers.set(endpointName, breaker);
  }

  async makeRequest(request: ApiRequest, endpointName?: string): Promise<ApiResponse> {
    const endpoint = this.selectEndpoint(endpointName);
    if (!endpoint) {
      throw new Error(`No available endpoint${endpointName ? ` for ${endpointName}` : ''}`);
    }

    const url = `${endpoint.baseUrl}${request.path}`;
    const timeout = request.timeout || endpoint.timeout;
    
    // Use apiCoordinator for rate limiting and caching
    try {
      const response = await apiCoordinator.makeRequest(
        url,
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          
          const fetchOptions: any = {
            method: request.method,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Solana-Token-Analyzer/1.0',
              ...endpoint.headers,
              ...request.headers
            },
            signal: controller.signal
          };

          try {
            let response;
            if (request.method !== 'GET' && request.params) {
              fetchOptions.body = JSON.stringify(request.params);
              response = await fetch(url, fetchOptions);
            } else if (request.method === 'GET' && request.params) {
              const urlParams = new URLSearchParams(request.params);
              const fullUrl = `${url}?${urlParams.toString()}`;
              response = await fetch(fullUrl, fetchOptions);
            } else {
              response = await fetch(url, fetchOptions);
            }
            
            clearTimeout(timeoutId);
            return response;
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        },
        endpoint.name,
        { 
          priority: 3,
          maxRetries: request.retries || endpoint.retryCount
        }
      );

      this.updateCircuitBreaker(endpoint.name, response.success);
      
      if (!response.success) {
        throw new Error(response.error || 'Request failed');
      }

      return {
        success: true,
        data: response.data,
        cached: response.cached,
        responseTime: 0, // apiCoordinator doesn't provide this
        endpoint: endpoint.name
      };

    } catch (error) {
      this.updateCircuitBreaker(endpoint.name, false);
      logger.error(`API request failed for ${endpoint.name}:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: 0,
        endpoint: endpoint.name
      };
    }
  }

  // Convenience methods for different endpoints
  async requestDexScreener(path: string, params?: any): Promise<ApiResponse> {
    return this.makeRequest({
      method: 'GET',
      path,
      params
    }, 'dexscreener');
  }

  async requestSolscan(path: string, params?: any): Promise<ApiResponse> {
    return this.makeRequest({
      method: 'GET',
      path,
      params
    }, 'solscan');
  }

  async requestJupiter(path: string, params?: any): Promise<ApiResponse> {
    return this.makeRequest({
      method: 'GET',
      path,
      params
    }, 'jupiter');
  }

  getHealth(): Record<string, any> {
    const endpointHealth: Record<string, any> = {};
    
    for (const [name, config] of this.endpoints.entries()) {
      const breaker = this.circuitBreakers.get(name)!;
      endpointHealth[name] = {
        healthy: this.endpointHealth.get(name),
        available: this.isEndpointAvailable(name),
        failures: breaker.failures,
        circuitOpen: breaker.isOpen,
        baseUrl: config.baseUrl
      };
    }

    return {
      initialized: this.initialized,
      totalEndpoints: this.endpoints.size,
      healthyEndpoints: Array.from(this.endpointHealth.values()).filter(Boolean).length,
      endpoints: endpointHealth
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.initialized) return false;
    
    const healthyCount = Array.from(this.endpointHealth.values()).filter(Boolean).length;
    return healthyCount > 0;
  }

  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down API Gateway...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
    
    this.initialized = false;
    logger.info('✅ API Gateway shut down successfully');
  }
}

// Create singleton instance
export const apiGateway = new ApiGateway();