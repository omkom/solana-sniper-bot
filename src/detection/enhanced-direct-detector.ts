/**
 * Enhanced Direct Token Detector
 * Uses direct API calls to detect tokens from multiple sources
 * Bypasses the broken coordinator system
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { directApiClient } from '../core/direct-api-client';
import { UnifiedTokenInfo } from '../types/unified';
import { pumpFunDetector, PumpFunToken } from './pump-fun-detector';

export interface TokenDetectionConfig {
  scanInterval: number;
  sources: string[];
  minLiquidity: number;
  maxAge: number;
  batchSize: number;
}

export interface DetectedToken {
  address: string;
  symbol: string;
  name: string;
  price: number;
  priceUsd: number;
  volume24h: number;
  volume1h: number;
  liquidity: {
    usd: number;
    sol: number;
  };
  marketCap: number;
  priceChange24h: number;
  priceChange1h: number;
  pairAddress: string;
  dexId: string;
  chainId: string;
  createdAt: number;
  source: string;
  confidence: number;
}

export class EnhancedDirectDetector extends EventEmitter {
  private config: TokenDetectionConfig;
  private isRunning = false;
  private scanInterval?: NodeJS.Timeout;
  private detectedTokens = new Map<string, DetectedToken>();
  private lastScanTime = 0;
  
  // Statistics
  private stats = {
    totalDetected: 0,
    processed: 0,
    errors: 0,
    uptime: 0,
    lastDetection: 0
  };

  constructor(config: Partial<TokenDetectionConfig> = {}) {
    super();
    
    this.config = {
      scanInterval: 30000, // 30 seconds
      sources: ['dexscreener', 'jupiter', 'pumpfun'],
      minLiquidity: 1000,
      maxAge: 600000, // 10 minutes
      batchSize: 50,
      ...config
    };
    
    logger.info('🎯 Enhanced Direct Detector initialized', this.config);
    
    // Set up Pump.fun detector integration
    this.setupPumpFunIntegration();
  }

  private setupPumpFunIntegration(): void {
    // Forward Pump.fun token detections to our main detector
    pumpFunDetector.on('tokenDetected', (pumpFunToken: PumpFunToken) => {
      try {
        // Convert PumpFunToken to DetectedToken format
        const detectedToken = this.convertPumpFunToken(pumpFunToken);
        
        if (detectedToken && !this.detectedTokens.has(detectedToken.address)) {
          this.detectedTokens.set(detectedToken.address, detectedToken);
          this.stats.totalDetected++;
          
          logger.info(`✅ New Pump.fun token forwarded: ${detectedToken.symbol} (${detectedToken.address.substring(0, 8)}...)`, {
            source: 'pump.fun-websocket',
            marketCap: detectedToken.marketCap,
            confidence: detectedToken.confidence
          });
          
          this.emit('tokenDetected', detectedToken);
        }
      } catch (error) {
        logger.error('Error processing Pump.fun token:', error);
        this.stats.errors++;
      }
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Direct detector already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting Enhanced Direct Token Detector...');
    
    // Start Pump.fun WebSocket detector if enabled
    if (this.config.sources.includes('pumpfun')) {
      logger.info('🎪 Starting Pump.fun WebSocket integration...');
      await pumpFunDetector.start();
    }
    
    // Start immediate scan
    await this.performScan();
    
    // Start periodic scanning
    this.scanInterval = setInterval(async () => {
      try {
        await this.performScan();
      } catch (error) {
        logger.error('Scan error:', error);
        this.stats.errors++;
      }
    }, this.config.scanInterval);
    
    logger.info('✅ Enhanced Direct Detector started successfully');
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('🛑 Stopping Enhanced Direct Detector...');
    this.isRunning = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }
    
    // Stop Pump.fun detector if it was started
    if (this.config.sources.includes('pumpfun')) {
      logger.info('🎪 Stopping Pump.fun WebSocket integration...');
      await pumpFunDetector.stop();
    }
    
    logger.info('✅ Enhanced Direct Detector stopped');
    this.emit('stopped');
  }

  private async performScan(): Promise<void> {
    const startTime = Date.now();
    this.lastScanTime = startTime;
    
    logger.info('🔍 Starting token detection scan...', {
      sources: this.config.sources,
      lastScan: new Date(this.lastScanTime).toISOString()
    });

    const promises: Promise<void>[] = [];
    
    // Scan DexScreener
    if (this.config.sources.includes('dexscreener')) {
      promises.push(
        this.scanDexScreener().catch(error => {
          logger.error('DexScreener scan promise failed:', error);
          this.stats.errors++;
        })
      );
    }
    
    // Scan Jupiter
    if (this.config.sources.includes('jupiter')) {
      promises.push(
        this.scanJupiter().catch(error => {
          logger.error('Jupiter scan promise failed:', error);
          this.stats.errors++;
        })
      );
    }
    
    // Wait for all scans to complete - use Promise.allSettled to handle failures gracefully
    const results = await Promise.allSettled(promises);
    
    // Log any rejection reasons
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error(`Scan ${index} was rejected:`, result.reason);
      }
    });
    
    const duration = Date.now() - startTime;
    logger.info('✅ Token detection scan completed', {
      duration: `${duration}ms`,
      tokensDetected: this.stats.totalDetected,
      errors: this.stats.errors
    });
  }

  private async scanDexScreener(): Promise<void> {
    try {
      logger.info('🔍 Scanning DexScreener for new tokens...');
      
      // Get latest pairs from DexScreener
      const result = await directApiClient.getDexScreenerPairs('solana');
      
      if (!result.success) {
        logger.warn('DexScreener scan failed:', result.error);
        return;
      }
      
      // Handle different response formats
      let pairs = [];
      if (result.data?.pairs) {
        pairs = result.data.pairs;
      } else if (Array.isArray(result.data)) {
        pairs = result.data;
      } else if (result.data) {
        // Single token object
        pairs = [result.data];
      }
      
      if (pairs.length === 0) {
        logger.info('📊 DexScreener scan: No tokens found');
        return;
      }
      
      let newTokensCount = 0;
      
      for (const pair of pairs.slice(0, this.config.batchSize)) {
        try {
          if (this.isValidToken(pair)) {
            const token = this.convertDexScreenerPair(pair);
            
            if (token && !this.detectedTokens.has(token.address)) {
              this.detectedTokens.set(token.address, token);
              this.stats.totalDetected++;
              newTokensCount++;
              
              logger.info(`✅ New token detected: ${token.symbol} (${token.address.substring(0, 8)}...)`, {
                source: 'dexscreener',
                price: token.priceUsd,
                liquidity: token.liquidity.usd,
                volume24h: token.volume24h
              });
              
              this.emit('tokenDetected', token);
            }
          }
        } catch (tokenError) {
          logger.debug('Error processing individual token:', tokenError);
          continue; // Skip this token and continue with others
        }
      }
      
      logger.info(`📊 DexScreener scan completed: ${newTokensCount} new tokens found`);
      
    } catch (error) {
      logger.error('DexScreener scan error:', error);
      this.stats.errors++;
    }
  }

  private async scanJupiter(): Promise<void> {
    try {
      logger.info('🔍 Scanning Jupiter for token list...');
      
      const result = await directApiClient.getJupiterTokens();
      
      if (!result.success || !result.data) {
        logger.warn('Jupiter scan failed:', result.error);
        return;
      }
      
      const tokens = Array.isArray(result.data) ? result.data : [];
      let newTokensCount = 0;
      
      // Process recent Jupiter tokens (filter by some criteria)
      for (const tokenData of tokens.slice(0, this.config.batchSize)) {
        if (tokenData.address && tokenData.symbol && !this.detectedTokens.has(tokenData.address)) {
          const token: DetectedToken = {
            address: tokenData.address,
            symbol: tokenData.symbol,
            name: tokenData.name || tokenData.symbol,
            price: 0, // Jupiter doesn't provide price
            priceUsd: 0,
            volume24h: 0,
            volume1h: 0,
            liquidity: { usd: 0, sol: 0 },
            marketCap: 0,
            priceChange24h: 0,
            priceChange1h: 0,
            pairAddress: '',
            dexId: 'jupiter',
            chainId: 'solana',
            createdAt: Date.now(),
            source: 'jupiter',
            confidence: 60 // Lower confidence without price data
          };
          
          this.detectedTokens.set(token.address, token);
          this.stats.totalDetected++;
          newTokensCount++;
          
          logger.info(`✅ New token detected: ${token.symbol} (${token.address.substring(0, 8)}...)`, {
            source: 'jupiter'
          });
          
          this.emit('tokenDetected', token);
        }
      }
      
      logger.info(`📊 Jupiter scan completed: ${newTokensCount} new tokens found`);
      
    } catch (error) {
      logger.error('Jupiter scan error:', error);
      this.stats.errors++;
    }
  }

  private isValidToken(pair: any): boolean {
    if (!pair || !pair.baseToken) return false;
    
    // Check age requirement
    if (pair.pairCreatedAt) {
      const ageMs = Date.now() - pair.pairCreatedAt;
      if (ageMs > this.config.maxAge) return false;
    }
    
    // Check liquidity requirement
    if (pair.liquidity?.usd && pair.liquidity.usd < this.config.minLiquidity) {
      return false;
    }
    
    // Check for valid token data
    if (!pair.baseToken.address || !pair.baseToken.symbol) {
      return false;
    }
    
    return true;
  }

  private convertDexScreenerPair(pair: any): DetectedToken {
    const baseToken = pair.baseToken;
    
    return {
      address: baseToken.address,
      symbol: baseToken.symbol,
      name: baseToken.name || baseToken.symbol,
      price: parseFloat(pair.priceNative) || 0,
      priceUsd: parseFloat(pair.priceUsd) || 0,
      volume24h: parseFloat(pair.volume?.h24) || 0,
      volume1h: parseFloat(pair.volume?.h1) || 0,
      liquidity: {
        usd: parseFloat(pair.liquidity?.usd) || 0,
        sol: parseFloat(pair.liquidity?.base) || 0
      },
      marketCap: parseFloat(pair.marketCap) || 0,
      priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
      priceChange1h: parseFloat(pair.priceChange?.h1) || 0,
      pairAddress: pair.pairAddress,
      dexId: pair.dexId,
      chainId: pair.chainId,
      createdAt: pair.pairCreatedAt || Date.now(),
      source: 'dexscreener',
      confidence: 90 // High confidence from DexScreener
    };
  }

  // Public methods
  getDetectedTokens(): DetectedToken[] {
    return Array.from(this.detectedTokens.values());
  }

  getStats() {
    const baseStats = {
      ...this.stats,
      uptime: Date.now() - this.lastScanTime,
      totalTokens: this.detectedTokens.size,
      isRunning: this.isRunning
    };
    
    // Include Pump.fun stats if enabled
    if (this.config.sources.includes('pumpfun')) {
      const pumpFunStats = pumpFunDetector.getStats();
      return {
        ...baseStats,
        pumpFun: {
          totalDetected: pumpFunStats.totalDetected,
          isConnected: pumpFunStats.isConnected,
          connections: pumpFunStats.connections,
          reconnects: pumpFunStats.reconnects,
          errors: pumpFunStats.errors
        }
      };
    }
    
    return baseStats;
  }

  private convertPumpFunToken(pumpFunToken: PumpFunToken): DetectedToken {
    return {
      address: pumpFunToken.address,
      symbol: pumpFunToken.symbol,
      name: pumpFunToken.name,
      price: 0, // Will be calculated based on reserves
      priceUsd: 0,
      volume24h: 0, // Not available from WebSocket
      volume1h: 0,
      liquidity: {
        usd: pumpFunToken.marketCap, // Approximate using market cap
        sol: pumpFunToken.virtualSolReserves
      },
      marketCap: pumpFunToken.marketCap,
      priceChange24h: 0, // Not available initially
      priceChange1h: 0,
      pairAddress: '', // Not applicable for bonding curve tokens
      dexId: 'pump.fun',
      chainId: 'solana',
      createdAt: pumpFunToken.createdTimestamp,
      source: 'pump.fun-websocket',
      confidence: pumpFunToken.confidence
    };
  }

  clearOldTokens(): void {
    const now = Date.now();
    const maxAge = this.config.maxAge;
    let removedCount = 0;
    
    for (const [address, token] of this.detectedTokens.entries()) {
      if (now - token.createdAt > maxAge) {
        this.detectedTokens.delete(address);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.info(`🧹 Cleaned up ${removedCount} old tokens`);
    }
    
    // Also clean up old Pump.fun tokens
    if (this.config.sources.includes('pumpfun')) {
      pumpFunDetector.clearOldTokens();
    }
  }
}

// Export singleton instance
export const enhancedDirectDetector = new EnhancedDirectDetector();