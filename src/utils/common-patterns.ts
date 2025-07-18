import { EventEmitter } from 'events';
import { Connection, PublicKey } from '@solana/web3.js';
import { ConnectionManager } from '../core/connection';
import { logger } from '../monitoring/logger';

/**
 * Base class for all EventEmitter-based components
 * Consolidates common patterns found across 16 files
 */
export abstract class BaseEventEmitter extends EventEmitter {
  protected intervals: Set<NodeJS.Timeout> = new Set();
  protected subscriptions: Map<string, number> = new Map();

  constructor() {
    super();
    this.setupErrorHandling();
  }

  protected setupErrorHandling(): void {
    this.on('error', (error) => {
      logger.error(`Error in ${this.constructor.name}:`, error);
    });
  }

  protected addInterval(interval: NodeJS.Timeout): void {
    this.intervals.add(interval);
  }

  protected addSubscription(name: string, id: number): void {
    this.subscriptions.set(name, id);
  }

  protected async cleanupIntervals(): Promise<void> {
    this.intervals.forEach(clearInterval);
    this.intervals.clear();
  }

  protected async cleanupSubscriptions(connection: Connection): Promise<void> {
    for (const [name, id] of this.subscriptions) {
      try {
        await connection.removeOnLogsListener(id);
        logger.debug(`Unsubscribed from ${name}`);
      } catch (error) {
        logger.warn(`Failed to unsubscribe from ${name}:`, error);
      }
    }
    this.subscriptions.clear();
  }

  async cleanup(): Promise<void> {
    await this.cleanupIntervals();
    this.removeAllListeners();
  }
}

/**
 * Singleton Connection Provider
 * Eliminates duplicate ConnectionManager instances across 8 files
 */
export class ConnectionProvider {
  private static instance: ConnectionManager;
  private static connection: Connection;

  static getConnectionManager(): ConnectionManager {
    if (!ConnectionProvider.instance) {
      ConnectionProvider.instance = new ConnectionManager();
    }
    return ConnectionProvider.instance;
  }

  static getConnection(): Connection {
    if (!ConnectionProvider.connection) {
      ConnectionProvider.connection = ConnectionProvider.getConnectionManager().getConnection();
    }
    return ConnectionProvider.connection;
  }
}

/**
 * Centralized DEX Constants
 * Eliminates duplication across 5 files
 */
export const DEX_CONSTANTS = {
  PROGRAMS: {
    RAYDIUM_AMM: new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
    RAYDIUM_SERUM: new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'),
    RAYDIUM_FEE: new PublicKey('7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'),
    ORCA_WHIRLPOOL: new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'),
    METEORA: new PublicKey('Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'),
    PUMP_FUN: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    JUPITER_V6: new PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'),
    OPENBOOK: new PublicKey('opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb'),
    SPL_TOKEN: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
  },
  
  POOL_CREATION_INSTRUCTIONS: [
    'initialize', 'initializePool', 'initialize2', 'createPool', 
    'InitializePool', 'CreatePool', 'InitializeInstruction', 'create', 'openPosition'
  ],

  TOKEN_CREATION_PATTERNS: [
    'initialize', 'createPool', 'InitializePool', 'createAccount', 'mint', 'create'
  ],

  KNOWN_ADDRESSES: {
    SOL: '11111111111111111111111111111112',
    WSOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  }
};

/**
 * Common validation utilities
 * Consolidates validation logic found across multiple files
 */
export class ValidationUtils {
  static isValidSolanaAddress(address: string): boolean {
    try {
      if (!address || address.length < 32 || address.length > 44) {
        return false;
      }
      
      if (address.startsWith('0x')) {
        return false;
      }
      
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(address)) {
        return false;
      }
      
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  static isKnownToken(address: string): boolean {
    return Object.values(DEX_CONSTANTS.KNOWN_ADDRESSES).includes(address);
  }

  static generateTokenSymbol(address: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let symbol = '';
    
    for (let i = 0; i < 4; i++) {
      const charIndex = address.charCodeAt(i) % chars.length;
      symbol += chars[charIndex];
    }
    
    return symbol;
  }
}

/**
 * Common transaction processing utilities
 * Consolidates patterns found across multiple transaction parsers
 */
export class TransactionUtils {
  static extractTokenMints(transaction: any): string[] {
    const mints: string[] = [];
    
    if (!transaction?.meta?.postTokenBalances) {
      return mints;
    }

    for (const balance of transaction.meta.postTokenBalances) {
      if (balance.mint && 
          !ValidationUtils.isKnownToken(balance.mint) &&
          ValidationUtils.isValidSolanaAddress(balance.mint)) {
        mints.push(balance.mint);
      }
    }

    return [...new Set(mints)]; // Remove duplicates
  }

  static calculateLiquidityFromTransaction(meta: any): { sol: number; usd: number } {
    try {
      const preBalances = meta.preBalances || [];
      const postBalances = meta.postBalances || [];
      
      const totalSolMovement = postBalances.reduce((sum: number, balance: number, index: number) => {
        const pre = preBalances[index] || 0;
        return sum + Math.abs(balance - pre);
      }, 0);

      const solLiquidity = totalSolMovement / 1e9; // Convert lamports to SOL
      const usdLiquidity = solLiquidity * 150; // Rough SOL price conversion

      return {
        sol: Math.max(0, solLiquidity),
        usd: Math.max(0, usdLiquidity)
      };
    } catch (error) {
      logger.warn('Error calculating transaction liquidity:', error);
      return { sol: 0, usd: 0 };
    }
  }
}

/**
 * Common caching utilities
 * Consolidates cache patterns found across multiple classes
 */
export class CacheUtils {
  private static caches: Map<string, Map<string, { data: any; timestamp: number }>> = new Map();

  static getCache(cacheName: string): Map<string, { data: any; timestamp: number }> {
    if (!CacheUtils.caches.has(cacheName)) {
      CacheUtils.caches.set(cacheName, new Map());
    }
    return CacheUtils.caches.get(cacheName)!;
  }

  static getCachedData(cacheName: string, key: string, timeoutMs: number = 30000): any | null {
    const cache = CacheUtils.getCache(cacheName);
    const cached = cache.get(key);
    
    if (cached && (Date.now() - cached.timestamp) < timeoutMs) {
      return cached.data;
    }
    
    return null;
  }

  static setCachedData(cacheName: string, key: string, data: any): void {
    const cache = CacheUtils.getCache(cacheName);
    cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  static clearCache(cacheName: string): void {
    const cache = CacheUtils.getCache(cacheName);
    cache.clear();
  }

  static clearAllCaches(): void {
    CacheUtils.caches.clear();
  }
}

/**
 * Common array processing utilities
 * Consolidates deduplication logic found across multiple files
 */
export class ArrayUtils {
  static removeDuplicatesByKey<T>(array: T[], keyFn: (item: T) => string): T[] {
    const unique = new Map<string, T>();
    
    for (const item of array) {
      const key = keyFn(item);
      if (!unique.has(key)) {
        unique.set(key, item);
      }
    }
    
    return Array.from(unique.values());
  }

  static removeDuplicateTokens<T extends { address: string; trendingScore?: number }>(tokens: T[]): T[] {
    const unique = new Map<string, T>();
    
    for (const token of tokens) {
      const key = token.address;
      const existing = unique.get(key);
      const currentScore = token.trendingScore || 0;
      const existingScore = existing?.trendingScore || 0;
      
      if (!existing || currentScore > existingScore) {
        unique.set(key, token);
      }
    }
    
    return Array.from(unique.values())
      .sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0));
  }

  static batchArray<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }
}

/**
 * Rate limiting utilities
 * Consolidates rate limiting patterns found across multiple classes
 */
export class RateLimitUtils {
  private static lastRequests: Map<string, number> = new Map();

  static async throttle(key: string, delayMs: number): Promise<void> {
    const now = Date.now();
    const lastRequest = RateLimitUtils.lastRequests.get(key) || 0;
    const timeSinceLastRequest = now - lastRequest;
    
    if (timeSinceLastRequest < delayMs) {
      const delay = delayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    RateLimitUtils.lastRequests.set(key, Date.now());
  }

  static clearRateLimits(): void {
    RateLimitUtils.lastRequests.clear();
  }
}