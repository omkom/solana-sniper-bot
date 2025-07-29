/**
 * Direct API Client
 * Makes direct HTTP requests to APIs without coordinator dependency
 * Solves the connection test and token detection issues
 */

import axios, { AxiosResponse } from 'axios';
import { logger } from '../monitoring/logger';

export interface DirectApiConfig {
  timeout: number;
  retries: number;
  baseDelay: number;
  maxDelay: number;
}

export class DirectApiClient {
  private config: DirectApiConfig;
  
  constructor(config: Partial<DirectApiConfig> = {}) {
    this.config = {
      timeout: 10000, // 10 seconds
      retries: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 5000, // 5 seconds
      ...config
    };
  }

  async makeRequest(url: string, options: any = {}): Promise<any> {
    const maxRetries = options.retries || this.config.retries;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response: AxiosResponse = await axios.get(url, {
          timeout: this.config.timeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TokenAnalyzer/1.0)',
            'Accept': 'application/json',
            ...options.headers
          },
          ...options
        });
        
        if (response.status === 200 && response.data) {
          return { success: true, data: response.data };
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries;
        
        if (isLastAttempt) {
          logger.error(`API request failed after ${maxRetries + 1} attempts:`, {
            url,
            error: error.message,
            attempts: attempt + 1
          });
          return { success: false, error: error.message };
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.config.baseDelay * Math.pow(2, attempt),
          this.config.maxDelay
        );
        
        logger.warn(`API request failed, retrying in ${delay}ms:`, {
          url,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          error: error.message
        });
        
        await this.sleep(delay);
      }
    }
    
    return { success: false, error: 'Max retries exceeded' };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // DexScreener specific methods
  async getDexScreenerTokens(): Promise<any> {
    try {
      // Try multiple endpoints to get token data
      const endpoints = [
        'https://api.dexscreener.com/latest/dex/search/?q=SOL', // Search for Solana tokens
        'https://api.dexscreener.com/orders/v1/solana', // Orders endpoint
        'https://api.dexscreener.com/token-boosts/latest/v1' // Boosted tokens
      ];
      
      for (const url of endpoints) {
        try {
          const result = await this.makeRequest(url);
          if (result.success) return result;
        } catch (error) {
          // Continue to next endpoint
          continue;
        }
      }
      
      return { success: false, error: 'All DexScreener endpoints unavailable' };
    } catch (error) {
      logger.error('DexScreener tokens request failed:', error);
      return { success: false, error: 'DexScreener API unavailable' };
    }
  }

  async getDexScreenerPairs(chainId: string = 'solana'): Promise<any> {
    try {
      // Use the correct DexScreener endpoint for getting pairs
      const url = `https://api.dexscreener.com/latest/dex/search/?q=${chainId}`;
      const result = await this.makeRequest(url);
      
      if (result.success && result.data?.pairs) {
        return result;
      }
      
      // Fallback to token profiles endpoint
      const fallbackUrl = `https://api.dexscreener.com/token-profiles/latest/v1`;
      return await this.makeRequest(fallbackUrl);
    } catch (error) {
      logger.error('DexScreener pairs request failed:', error);
      return { success: false, error: 'DexScreener pairs API unavailable' };
    }
  }

  async getDexScreenerSearch(query: string): Promise<any> {
    try {
      const url = `https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(query)}`;
      return await this.makeRequest(url);
    } catch (error) {
      logger.error('DexScreener search request failed:', error);
      return { success: false, error: 'DexScreener search API unavailable' };
    }
  }

  // Jupiter specific methods
  async getJupiterTokens(): Promise<any> {
    try {
      const url = 'https://token.jup.ag/all';
      return await this.makeRequest(url);
    } catch (error) {
      logger.error('Jupiter tokens request failed:', error);
      return { success: false, error: 'Jupiter API unavailable' };
    }
  }

  // Generic token info method
  async getTokenInfo(address: string): Promise<any> {
    try {
      const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;
      return await this.makeRequest(url);
    } catch (error) {
      logger.error(`Token info request failed for ${address}:`, error);
      return { success: false, error: 'Token info API unavailable' };
    }
  }

  // Simple connection test
  async testConnection(): Promise<boolean> {
    try {
      // Test with a simple, reliable endpoint
      const result = await this.getTokenInfo('So11111111111111111111111111111111111111112'); // WSOL
      return result.success;
    } catch (error) {
      logger.error('Connection test failed:', error);
      return false;
    }
  }
}

// Singleton instance
export const directApiClient = new DirectApiClient();