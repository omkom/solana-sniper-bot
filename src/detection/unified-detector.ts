import { Logs } from '@solana/web3.js';
import { BaseEventEmitter, ConnectionProvider, DEX_CONSTANTS, ValidationUtils, TransactionUtils, ArrayUtils } from '../utils/common-patterns';
import { UnifiedTokenInfo, DetectionResult, DetectionConfig } from '../types/unified';
import { logger } from '../monitoring/logger';
import { DexScreenerClient } from './dexscreener-client';
import { UnifiedTokenFilter, TokenFilterCriteria } from './unified-token-filter';

/**
 * Unified Detection System
 * Consolidates functionality from:
 * - token-monitor.ts
 * - real-token-monitor.ts  
 * - multi-dex-monitor.ts
 * - enhanced-detector.ts
 * - pump-detector.ts
 * - live-price-integrator.ts
 */
export class UnifiedDetector extends BaseEventEmitter {
  private isRunning = false;
  private processedTransactions = new Set<string>();
  private detectedTokens = new Map<string, UnifiedTokenInfo>();
  private dexScreenerClient: DexScreenerClient;
  private tokenFilter: UnifiedTokenFilter;
  private config: DetectionConfig;
  
  // Detection strategies
  private strategies = new Map<string, DetectionStrategy>();
  
  constructor(config: Partial<DetectionConfig> = {}) {
    super();
    
    this.config = {
      enabledSources: ['websocket', 'dexscreener', 'scanning'],
      scanInterval: 5000,
      batchSize: 10,
      maxConcurrentRequests: 3,
      rateLimitDelay: 300,
      cacheTimeout: 30000,
      ...config
    };
    
    this.dexScreenerClient = new DexScreenerClient();
    this.tokenFilter = new UnifiedTokenFilter(ConnectionProvider.getConnection());
    
    this.initializeStrategies();
    logger.info('🎯 Unified Detector initialized', { config: this.config });
  }

  private initializeStrategies(): void {
    // WebSocket-based real-time detection
    this.strategies.set('websocket', new WebSocketStrategy(this.config));
    
    // DexScreener API-based detection
    this.strategies.set('dexscreener', new DexScreenerStrategy(this.dexScreenerClient, this.config));
    
    // Blockchain scanning detection
    this.strategies.set('scanning', new ScanningStrategy(this.config));
    
    // Pump detection strategy
    this.strategies.set('pump', new PumpStrategy(this.dexScreenerClient, this.config));
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Unified detector already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting unified token detection');

    try {
      // Start enabled detection strategies
      for (const [name, strategy] of this.strategies) {
        if (this.config.enabledSources.includes(name)) {
          await strategy.start();
          strategy.on('tokensDetected', (result: DetectionResult) => {
            this.handleDetectionResult(result);
          });
          logger.info(`✅ Started ${name} detection strategy`);
        }
      }

      // Start periodic cleanup
      this.startCleanupTask();
      
      this.emit('started');
      logger.info('🎯 Unified detector started successfully');
      
    } catch (error) {
      logger.error('❌ Failed to start unified detector:', error);
      this.isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('🛑 Stopping unified detector');

    // Stop all strategies
    for (const [name, strategy] of this.strategies) {
      try {
        await strategy.stop();
        logger.info(`⏹️ Stopped ${name} strategy`);
      } catch (error) {
        logger.warn(`Failed to stop ${name} strategy:`, error);
      }
    }

    await this.cleanup();
    this.emit('stopped');
    logger.info('🛑 Unified detector stopped');
  }

  private async handleDetectionResult(result: DetectionResult): Promise<void> {
    try {
      logger.debug(`Processing detection result from ${result.source}`, {
        tokenCount: result.tokens.length,
        processingTime: result.processingTime
      });

      // Apply unified filtering
      const filteredTokens: UnifiedTokenInfo[] = [];
      
      for (const token of result.tokens) {
        // Skip if already detected
        if (this.detectedTokens.has(token.address)) {
          continue;
        }

        // Apply token filter
        const filterResult = await this.tokenFilter.filterToken(token, UnifiedTokenFilter.AGGRESSIVE_CRITERIA);
        
        if (filterResult.passed) {
          filteredTokens.push(token);
          this.detectedTokens.set(token.address, token);
          
          logger.info(`✅ New token detected: ${token.symbol} (${token.address.slice(0, 8)}...)`, {
            source: result.source,
            score: filterResult.score,
            dex: token.dexId
          });
        } else {
          logger.debug(`❌ Token failed filter: ${token.symbol}`, {
            reasons: filterResult.reasons.join(', ')
          });
        }
      }

      // Emit filtered tokens
      if (filteredTokens.length > 0) {
        this.emit('tokenDetected', filteredTokens);
      }

      // Update metrics
      this.emit('detectionResult', {
        ...result,
        filteredCount: filteredTokens.length
      });

    } catch (error) {
      logger.error('Error handling detection result:', error);
      this.emit('error', error);
    }
  }

  private startCleanupTask(): void {
    const cleanupInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(cleanupInterval);
        return;
      }

      // Clean up old processed transactions
      if (this.processedTransactions.size > 10000) {
        const oldEntries = Array.from(this.processedTransactions).slice(0, 5000);
        oldEntries.forEach(entry => this.processedTransactions.delete(entry));
      }

      // Clean up old detected tokens (keep last 1000)
      if (this.detectedTokens.size > 1000) {
        const sortedTokens = Array.from(this.detectedTokens.entries())
          .sort((a, b) => b[1].detectedAt - a[1].detectedAt);
        
        this.detectedTokens.clear();
        sortedTokens.slice(0, 1000).forEach(([address, token]) => {
          this.detectedTokens.set(address, token);
        });
      }
    }, 60000); // Clean up every minute

    this.addInterval(cleanupInterval);
  }

  // Public API methods
  getDetectedTokens(limit: number = 50): UnifiedTokenInfo[] {
    const tokens = Array.from(this.detectedTokens.values());
    return tokens
      .sort((a, b) => b.detectedAt - a.detectedAt)
      .slice(0, limit);
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      detectedTokensCount: this.detectedTokens.size,
      processedTransactionsCount: this.processedTransactions.size,
      enabledStrategies: this.config.enabledSources,
      strategies: Object.fromEntries(
        Array.from(this.strategies.entries()).map(([name, strategy]) => [
          name,
          strategy.getStatus()
        ])
      )
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const connection = ConnectionProvider.getConnection();
      await connection.getSlot();
      return this.isRunning;
    } catch (error) {
      logger.error('Health check failed:', error);
      return false;
    }
  }
}

/**
 * Base Detection Strategy
 */
abstract class DetectionStrategy extends BaseEventEmitter {
  protected config: DetectionConfig;
  protected isRunning = false;

  constructor(config: DetectionConfig) {
    super();
    this.config = config;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract getStatus(): any;
}

/**
 * WebSocket Detection Strategy
 * Monitors DEX program logs for real-time token creation
 */
class WebSocketStrategy extends DetectionStrategy {
  private connection = ConnectionProvider.getConnection();

  async start(): Promise<void> {
    this.isRunning = true;
    
    // Subscribe to all DEX programs
    for (const [name, programId] of Object.entries(DEX_CONSTANTS.PROGRAMS)) {
      try {
        const subscriptionId = this.connection.onLogs(
          programId,
          (logs: Logs) => {
            this.handleDexLogs(logs, name);
          },
          'confirmed'
        );
        
        this.addSubscription(name, subscriptionId);
      } catch (error) {
        logger.error(`Failed to subscribe to ${name}:`, error);
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.cleanupSubscriptions(this.connection);
  }

  private async handleDexLogs(logs: Logs, dexName: string): Promise<void> {
    try {
      // Filter for token creation patterns
      const hasTokenCreation = logs.logs.some(log => 
        DEX_CONSTANTS.POOL_CREATION_INSTRUCTIONS.some(pattern => 
          log.toLowerCase().includes(pattern.toLowerCase())
        )
      );

      if (hasTokenCreation) {
        const startTime = Date.now();
        const tokens = await this.processTransaction(logs.signature, dexName);
        const processingTime = Date.now() - startTime;

        this.emit('tokensDetected', {
          tokens,
          source: `websocket-${dexName}`,
          timestamp: Date.now(),
          processingTime,
          errors: [],
          metadata: { signature: logs.signature }
        });
      }
    } catch (error) {
      logger.warn(`Error processing ${dexName} logs:`, error);
    }
  }

  private async processTransaction(signature: string, dexName: string): Promise<UnifiedTokenInfo[]> {
    try {
      const connection = ConnectionProvider.getConnection();
      const transaction = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!transaction) {
        return [];
      }

      const tokenMints = TransactionUtils.extractTokenMints(transaction);
      const liquidity = TransactionUtils.calculateLiquidityFromTransaction(transaction.meta);
      
      return tokenMints.map(mint => ({
        address: mint,
        mint, // Legacy compatibility
        name: `${dexName} Token ${mint.slice(0, 8)}`,
        symbol: ValidationUtils.generateTokenSymbol(mint),
        decimals: 9,
        chainId: 'solana',
        detected: true,
        detectedAt: Date.now(),
        timestamp: Date.now(),
        source: `websocket-${dexName}`,
        dexId: dexName.toLowerCase(),
        liquidity,
        metadata: {
          signature,
          dex: dexName,
          detectionMethod: 'websocket'
        }
      }));
    } catch (error) {
      logger.warn(`Error processing transaction ${signature}:`, error);
      return [];
    }
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      subscriptions: this.subscriptions.size
    };
  }
}

/**
 * DexScreener Detection Strategy
 * Fetches tokens from DexScreener API
 */
class DexScreenerStrategy extends DetectionStrategy {
  private dexScreenerClient: DexScreenerClient;
  private lastFetch = 0;

  constructor(dexScreenerClient: DexScreenerClient, config: DetectionConfig) {
    super(config);
    this.dexScreenerClient = dexScreenerClient;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.startPeriodicFetch();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.cleanupIntervals();
  }

  private startPeriodicFetch(): void {
    const fetchInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(fetchInterval);
        return;
      }

      try {
        const startTime = Date.now();
        const tokens = await this.dexScreenerClient.getTrendingTokens();
        const processingTime = Date.now() - startTime;

        this.lastFetch = Date.now();

        this.emit('tokensDetected', {
          tokens,
          source: 'dexscreener',
          timestamp: Date.now(),
          processingTime,
          errors: [],
          metadata: { endpoint: 'trending' }
        });
      } catch (error) {
        logger.warn('DexScreener fetch error:', error);
      }
    }, this.config.scanInterval);

    this.addInterval(fetchInterval);
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      lastFetch: this.lastFetch,
      nextFetch: this.lastFetch + this.config.scanInterval
    };
  }
}

/**
 * Scanning Detection Strategy
 * Scans blockchain for token creation activity
 */
class ScanningStrategy extends DetectionStrategy {
  private connection = ConnectionProvider.getConnection();
  private lastScan = 0;

  async start(): Promise<void> {
    this.isRunning = true;
    this.startPeriodicScan();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.cleanupIntervals();
  }

  private startPeriodicScan(): void {
    const scanInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(scanInterval);
        return;
      }

      try {
        const startTime = Date.now();
        const tokens = await this.scanRecentActivity();
        const processingTime = Date.now() - startTime;

        this.lastScan = Date.now();

        if (tokens.length > 0) {
          this.emit('tokensDetected', {
            tokens,
            source: 'scanning',
            timestamp: Date.now(),
            processingTime,
            errors: [],
            metadata: { method: 'recent_activity' }
          });
        }
      } catch (error) {
        logger.warn('Scanning error:', error);
      }
    }, this.config.scanInterval);

    this.addInterval(scanInterval);
  }

  private async scanRecentActivity(): Promise<UnifiedTokenInfo[]> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        DEX_CONSTANTS.PROGRAMS.SPL_TOKEN,
        { limit: 20 }
      );

      const tokens: UnifiedTokenInfo[] = [];

      for (const sig of signatures.slice(0, 5)) {
        try {
          const transaction = await this.connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });

          if (transaction && this.looksLikeTokenCreation(transaction)) {
            const tokenMints = TransactionUtils.extractTokenMints(transaction);
            
            for (const mint of tokenMints) {
              tokens.push({
                address: mint,
                mint,
                name: `Scanned Token ${mint.slice(0, 8)}`,
                symbol: ValidationUtils.generateTokenSymbol(mint),
                decimals: 9,
                chainId: 'solana',
                detected: true,
                detectedAt: Date.now(),
                timestamp: Date.now(),
                source: 'scanning',
                metadata: {
                  signature: sig.signature,
                  detectionMethod: 'scanning'
                }
              });
            }
          }
        } catch {
          // Skip failed transactions
        }
      }

      return tokens;
    } catch (error) {
      logger.warn('Error scanning recent activity:', error);
      return [];
    }
  }

  private looksLikeTokenCreation(transaction: any): boolean {
    const instructions = transaction.transaction.message.instructions || [];
    
    return instructions.some((ix: any) => {
      if (ix.parsed) {
        const type = ix.parsed.type;
        return type === 'initializeMint' || 
               type === 'createAccount' || 
               type === 'initializeAccount' ||
               type === 'initialize';
      }
      return false;
    });
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      lastScan: this.lastScan,
      nextScan: this.lastScan + this.config.scanInterval
    };
  }
}

/**
 * Pump Detection Strategy
 * Specialized for detecting pumping tokens
 */
class PumpStrategy extends DetectionStrategy {
  private dexScreenerClient: DexScreenerClient;
  private lastPumpScan = 0;

  constructor(dexScreenerClient: DexScreenerClient, config: DetectionConfig) {
    super(config);
    this.dexScreenerClient = dexScreenerClient;
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.startPumpScanning();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.cleanupIntervals();
  }

  private startPumpScanning(): void {
    const pumpInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(pumpInterval);
        return;
      }

      try {
        const startTime = Date.now();
        const tokens = await this.dexScreenerClient.getBoostedTokens();
        const processingTime = Date.now() - startTime;

        this.lastPumpScan = Date.now();

        if (tokens.length > 0) {
          this.emit('tokensDetected', {
            tokens,
            source: 'pump',
            timestamp: Date.now(),
            processingTime,
            errors: [],
            metadata: { method: 'boosted_tokens' }
          });
        }
      } catch (error) {
        logger.warn('Pump scanning error:', error);
      }
    }, this.config.scanInterval * 2); // Less frequent pump scanning

    this.addInterval(pumpInterval);
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      lastPumpScan: this.lastPumpScan,
      nextPumpScan: this.lastPumpScan + (this.config.scanInterval * 2)
    };
  }
}