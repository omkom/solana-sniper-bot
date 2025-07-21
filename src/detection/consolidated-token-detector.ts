/**
 * Consolidated Token Detector
 * Merges functionality from unified-detector.ts, enhanced-token-detection.ts, 
 * multi-dex-monitor.ts, and real-token-monitor.ts
 */

import { EventEmitter } from 'events';
import { Connection, Logs, PublicKey } from '@solana/web3.js';
import { logger } from '../monitoring/logger';
import { UnifiedTokenInfo } from '../types/unified';
import { apiCoordinator } from '../core/centralized-api-coordinator';
import { getConnectionManager, getApiGateway } from '../core/singleton-manager';

export interface DetectionConfig {
  enabledSources: DetectionSource[];
  enabledDexes: string[];
  minLiquidity: number;
  maxAge: number;
  minConfidence: number;
  scanInterval: number;
  batchSize: number;
  maxConcurrentRequests: number;
  rateLimitDelay: number;
  cacheTimeout: number;
  filterHoneypots: boolean;
  filterRugs: boolean;
  enableRealTimeMonitoring: boolean;
  enableBlockchainScanning: boolean;
  enableApiPolling: boolean;
}

export type DetectionSource = 'websocket' | 'api' | 'blockchain' | 'dexscreener' | 'pump' | 'scanning';

export interface DetectionStrategy extends EventEmitter {
  name: string;
  source: DetectionSource;
  priority: number;
  isEnabled: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): DetectionStrategyStatus;
}

export interface DetectionStrategyStatus {
  isRunning: boolean;
  tokensDetected: number;
  lastDetection: number;
  errors: number;
  avgProcessingTime: number;
}

export interface DetectionResult {
  tokens: UnifiedTokenInfo[];
  source: DetectionSource;
  strategy: string;
  timestamp: number;
  processingTime: number;
  originalCount: number;
  filteredCount: number;
  errors: string[];
  metadata: any;
}

export interface TokenFilter {
  passed: boolean;
  score: number;
  reasons: string[];
}

export class ConsolidatedTokenDetector extends EventEmitter {
  private config: DetectionConfig;
  private strategies: Map<string, DetectionStrategy> = new Map();
  private detectedTokens: Map<string, UnifiedTokenInfo> = new Map();
  private isRunning = false;
  private connectionManager: any;
  private apiGateway: any;
  private initialized = false;
  
  // DEX program IDs for monitoring
  private readonly DEX_PROGRAMS = {
    'raydium': new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
    'orca': new PublicKey('9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'),
    'jupiter': new PublicKey('JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'),
    'pump': new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    'meteora': new PublicKey('24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi'),
    'serum': new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin')
  };
  
  // Pool creation instruction patterns
  private readonly POOL_CREATION_PATTERNS = [
    'initialize',
    'initializepoolinstruction',
    'createpool',
    'initializepool',
    'createliquiditypool',
    'initializepair'
  ];
  
  constructor(config: Partial<DetectionConfig> = {}) {
    super();
    
    this.config = {
      enabledSources: ['websocket', 'api', 'blockchain'],
      enabledDexes: ['raydium', 'orca', 'jupiter', 'pump', 'meteora'],
      minLiquidity: 1000,
      maxAge: 3600000, // 1 hour
      minConfidence: 5,
      scanInterval: 90000, // 90 seconds
      batchSize: 5,
      maxConcurrentRequests: 2,
      rateLimitDelay: 2000,
      cacheTimeout: 60000,
      filterHoneypots: true,
      filterRugs: true,
      enableRealTimeMonitoring: true,
      enableBlockchainScanning: true,
      enableApiPolling: true,
      ...config
    };
    
    this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.connectionManager = await getConnectionManager();
      this.apiGateway = await getApiGateway();
      
      this.initializeStrategies();
      this.initialized = true;
      
      logger.info('🔍 Consolidated Token Detector initialized', {
        enabledSources: this.config.enabledSources,
        enabledDexes: this.config.enabledDexes
      });
    } catch (error) {
      logger.error('❌ Failed to initialize token detector:', error);
      throw error;
    }
  }

  private initializeStrategies(): void {
    // WebSocket real-time strategy
    if (this.config.enabledSources.includes('websocket')) {
      this.strategies.set('websocket', new WebSocketDetectionStrategy(this.config, this.connectionManager));
    }
    
    // API polling strategy
    if (this.config.enabledSources.includes('api')) {
      this.strategies.set('api', new ApiPollingStrategy(this.config, this.apiGateway));
    }
    
    // Blockchain scanning strategy
    if (this.config.enabledSources.includes('blockchain')) {
      this.strategies.set('blockchain', new BlockchainScanningStrategy(this.config, this.connectionManager));
    }
    
    // DexScreener strategy
    if (this.config.enabledSources.includes('dexscreener')) {
      this.strategies.set('dexscreener', new DexScreenerStrategy(this.config, this.apiGateway));
    }
    
    // Pump detection strategy
    if (this.config.enabledSources.includes('pump')) {
      this.strategies.set('pump', new PumpDetectionStrategy(this.config, this.apiGateway));
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Token detector already running');
      return;
    }
    
    await this.ensureInitialized();
    
    this.isRunning = true;
    logger.info('🚀 Starting consolidated token detection');
    
    try {
      // Start strategies with staggered timing
      let delayOffset = 0;
      
      for (const [name, strategy] of this.strategies) {
        if (strategy.isEnabled) {
          if (delayOffset > 0) {
            logger.info(`⏱️ Delaying ${name} strategy start by ${delayOffset}ms`);
            await new Promise(resolve => setTimeout(resolve, delayOffset));
          }
          
          await strategy.start();
          this.setupStrategyEvents(strategy);
          
          logger.info(`✅ Started ${name} detection strategy`);
          delayOffset += 30000; // 30 second intervals
        }
      }
      
      this.startCleanupTask();
      this.emit('started');
      
      logger.info('🎯 Consolidated token detector started successfully');
    } catch (error) {
      logger.error('❌ Failed to start token detector:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    logger.info('🛑 Stopping consolidated token detector');
    
    // Stop all strategies
    for (const [name, strategy] of this.strategies) {
      try {
        await strategy.stop();
        logger.info(`⏹️ Stopped ${name} strategy`);
      } catch (error) {
        logger.warn(`Failed to stop ${name} strategy:`, error);
      }
    }
    
    this.emit('stopped');
    logger.info('🛑 Token detector stopped');
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeAsync();
    }
  }

  private setupStrategyEvents(strategy: DetectionStrategy): void {
    strategy.on('tokensDetected', (result: DetectionResult) => {
      this.handleDetectionResult(result);
    });
    
    strategy.on('error', (error: any) => {
      logger.error(`Strategy ${strategy.name} error:`, error);
      this.emit('error', error);
    });
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
        const filterResult = await this.filterToken(token);
        
        if (filterResult.passed) {
          filteredTokens.push(token);
          this.detectedTokens.set(token.address, token);
          
          logger.info(`✅ New token detected: ${token.symbol} (${token.address.slice(0, 8)}...)`, {
            source: result.source,
            score: filterResult.score,
            liquidity: token.liquidity?.usd || 0
          });
        } else {
          logger.debug(`❌ Token failed filter: ${token.symbol}`, {
            reasons: filterResult.reasons.join(', ')
          });
        }
      }
      
      // Emit filtered tokens
      if (filteredTokens.length > 0) {
        this.emit('tokensDetected', filteredTokens);
      }
      
      // Update and emit detection result
      const enhancedResult = {
        ...result,
        filteredCount: filteredTokens.length,
        detectedCount: filteredTokens.length,
        hasTokens: filteredTokens.length > 0,
        timestamp: result.timestamp || Date.now()
      };
      
      this.emit('detectionResult', enhancedResult);
      
    } catch (error) {
      logger.error('Error handling detection result:', error);
      this.emit('error', error);
    }
  }

  private async filterToken(token: UnifiedTokenInfo): Promise<TokenFilter> {
    let score = 0;
    const reasons: string[] = [];
    
    // Age filter
    const age = Date.now() - token.detectedAt;
    if (age <= this.config.maxAge) {
      score += 20;
    } else {
      reasons.push('token_too_old');
    }
    
    // Liquidity filter
    const liquidity = token.liquidity?.usd || 0;
    if (liquidity >= this.config.minLiquidity) {
      score += 25;
    } else {
      reasons.push('insufficient_liquidity');
    }
    
    // Address validation
    if (this.isValidSolanaAddress(token.address)) {
      score += 10;
    } else {
      reasons.push('invalid_address');
    }
    
    // Metadata validation
    if (token.symbol && token.name) {
      score += 10;
    } else {
      reasons.push('missing_metadata');
    }
    
    // Source credibility
    const sourceScore = this.getSourceScore(token.source || 'unknown');
    score += sourceScore;
    
    // Honeypot filter
    if (this.config.filterHoneypots && await this.isHoneypot(token)) {
      score -= 50;
      reasons.push('honeypot_detected');
    }
    
    // Rug filter
    if (this.config.filterRugs && await this.isRugPull(token)) {
      score -= 50;
      reasons.push('rug_risk_detected');
    }
    
    const passed = score >= this.config.minConfidence;
    
    return {
      passed,
      score,
      reasons
    };
  }

  private isValidSolanaAddress(address: string): boolean {
    try {
      if (!address || address.length < 32 || address.length > 44) {
        return false;
      }
      
      if (address.startsWith('0x')) {
        return false;
      }
      
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      return base58Regex.test(address);
    } catch {
      return false;
    }
  }

  private getSourceScore(source: string): number {
    const sourceScores: { [key: string]: number } = {
      'pump.fun': 20,
      'raydium': 15,
      'orca': 15,
      'jupiter': 15,
      'meteora': 10,
      'serum': 10,
      'dexscreener': 10,
      'websocket': 15,
      'api': 10,
      'blockchain': 20
    };
    
    return sourceScores[source] || 5;
  }

  private async isHoneypot(token: UnifiedTokenInfo): Promise<boolean> {
    // Basic honeypot detection logic
    try {
      // Check for suspicious patterns
      if (token.symbol && token.symbol.includes('HONEY')) {
        return true;
      }
      
      // Check liquidity patterns
      const liquidity = token.liquidity?.usd || 0;
      if (liquidity > 0 && liquidity < 100) {
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  private async isRugPull(token: UnifiedTokenInfo): Promise<boolean> {
    // Basic rug pull detection logic
    try {
      // Check for suspicious metadata
      if (!token.name || !token.symbol) {
        return true;
      }
      
      // Check for very low liquidity
      const liquidity = token.liquidity?.usd || 0;
      if (liquidity < 500) {
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  private startCleanupTask(): void {
    const cleanupInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(cleanupInterval);
        return;
      }
      
      // Clean up old detected tokens
      if (this.detectedTokens.size > 1000) {
        const sortedTokens = Array.from(this.detectedTokens.entries())
          .sort(([, a], [, b]) => b.detectedAt - a.detectedAt);
        
        this.detectedTokens.clear();
        sortedTokens.slice(0, 1000).forEach(([address, token]) => {
          this.detectedTokens.set(address, token);
        });
      }
    }, 60000); // Clean up every minute
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
      enabledStrategies: Array.from(this.strategies.keys()).filter(
        key => this.strategies.get(key)?.isEnabled
      ),
      strategies: Object.fromEntries(
        Array.from(this.strategies.entries()).map(([name, strategy]) => [
          name,
          strategy.getStatus()
        ])
      ),
      config: this.config
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const connection = this.connectionManager.getConnection();
      await connection.getSlot();
      return this.isRunning;
    } catch (error) {
      logger.error('Health check failed:', error);
      return false;
    }
  }

  updateConfig(newConfig: Partial<DetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('🔧 Detection config updated', newConfig);
  }
}

// Base class for detection strategies
abstract class BaseDetectionStrategy extends EventEmitter implements DetectionStrategy {
  public name: string;
  public source: DetectionSource;
  public priority: number;
  public isEnabled: boolean;
  
  protected config: DetectionConfig;
  protected isRunning = false;
  protected stats: DetectionStrategyStatus;
  
  constructor(name: string, source: DetectionSource, config: DetectionConfig) {
    super();
    this.name = name;
    this.source = source;
    this.config = config;
    this.priority = 1;
    this.isEnabled = true;
    
    this.stats = {
      isRunning: false,
      tokensDetected: 0,
      lastDetection: 0,
      errors: 0,
      avgProcessingTime: 0
    };
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;

  getStatus(): DetectionStrategyStatus {
    return { ...this.stats };
  }

  protected recordDetection(processingTime: number): void {
    this.stats.tokensDetected++;
    this.stats.lastDetection = Date.now();
    this.stats.avgProcessingTime = 
      (this.stats.avgProcessingTime * (this.stats.tokensDetected - 1) + processingTime) / 
      this.stats.tokensDetected;
  }

  protected recordError(): void {
    this.stats.errors++;
  }
}

// WebSocket detection strategy
class WebSocketDetectionStrategy extends BaseDetectionStrategy {
  private connection: Connection | null = null;
  private subscriptions: Map<string, number> = new Map();
  
  constructor(config: DetectionConfig, private connectionManager: any) {
    super('websocket', 'websocket', config);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.stats.isRunning = true;
    
    this.connection = this.connectionManager?.getConnection();
    
    if (!this.connection) {
      throw new Error('Connection not available');
    }
    
    // Subscribe to DEX programs
    for (const [dexName, programId] of Object.entries(this.DEX_PROGRAMS)) {
      if (this.config.enabledDexes.includes(dexName)) {
        try {
          const subscriptionId = this.connection.onLogs(
            programId,
            (logs: Logs) => {
              this.handleLogs(logs, dexName);
            },
            'confirmed'
          );
          
          this.subscriptions.set(dexName, subscriptionId);
          logger.debug(`✅ Subscribed to ${dexName} program logs`);
        } catch (error) {
          logger.error(`Failed to subscribe to ${dexName}:`, error);
          this.recordError();
        }
      }
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stats.isRunning = false;
    
    if (this.connection) {
      for (const [dexName, subscriptionId] of this.subscriptions) {
        try {
          await this.connection.removeOnLogsListener(subscriptionId);
          logger.debug(`✅ Unsubscribed from ${dexName} program logs`);
        } catch (error) {
          logger.warn(`Failed to unsubscribe from ${dexName}:`, error);
        }
      }
      this.subscriptions.clear();
    }
  }

  private async handleLogs(logs: Logs, dexName: string): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Filter for token creation patterns
      const hasTokenCreation = logs.logs.some(log => 
        this.POOL_CREATION_PATTERNS.some(pattern => 
          log.toLowerCase().includes(pattern.toLowerCase())
        )
      );
      
      if (hasTokenCreation) {
        const tokens = await this.processTransaction(logs.signature, dexName);
        const processingTime = Date.now() - startTime;
        
        if (tokens.length > 0) {
          this.recordDetection(processingTime);
          
          this.emit('tokensDetected', {
            tokens,
            source: this.source,
            strategy: this.name,
            timestamp: Date.now(),
            processingTime,
            originalCount: tokens.length,
            filteredCount: tokens.length,
            errors: [],
            metadata: { 
              signature: logs.signature,
              dex: dexName
            }
          });
        }
      }
    } catch (error) {
      logger.warn(`Error processing ${dexName} logs:`, error);
      this.recordError();
    }
  }

  private async processTransaction(signature: string, dexName: string): Promise<UnifiedTokenInfo[]> {
    try {
      const transaction = await this.connection?.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!transaction) {
        return [];
      }
      
      // Extract token information from transaction
      const tokens: UnifiedTokenInfo[] = [];
      
      // This is a simplified extraction - in reality, you'd parse the transaction
      // instructions to extract token mint addresses and other details
      
      return tokens;
    } catch (error) {
      logger.warn(`Error processing transaction ${signature}:`, error);
      return [];
    }
  }

  private readonly DEX_PROGRAMS = {
    'raydium': new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
    'orca': new PublicKey('9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP'),
    'jupiter': new PublicKey('JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'),
    'pump': new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
    'meteora': new PublicKey('24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi'),
    'serum': new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin')
  };

  private readonly POOL_CREATION_PATTERNS = [
    'initialize',
    'initializepoolinstruction',
    'createpool',
    'initializepool',
    'createliquiditypool',
    'initializepair'
  ];
}

// API polling strategy
class ApiPollingStrategy extends BaseDetectionStrategy {
  private pollingInterval: NodeJS.Timeout | null = null;
  
  constructor(config: DetectionConfig, private apiGateway: any) {
    super('api', 'api', config);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.stats.isRunning = true;
    
    this.pollingInterval = setInterval(async () => {
      await this.pollTokens();
    }, this.config.scanInterval);
    
    // Initial poll
    await this.pollTokens();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stats.isRunning = false;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async pollTokens(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Poll from various APIs
      const tokens = await this.fetchTokensFromAPIs();
      const processingTime = Date.now() - startTime;
      
      if (tokens.length > 0) {
        this.recordDetection(processingTime);
        
        this.emit('tokensDetected', {
          tokens,
          source: this.source,
          strategy: this.name,
          timestamp: Date.now(),
          processingTime,
          originalCount: tokens.length,
          filteredCount: tokens.length,
          errors: [],
          metadata: { method: 'api_polling' }
        });
      }
    } catch (error) {
      logger.warn('API polling error:', error);
      this.recordError();
    }
  }

  private async fetchTokensFromAPIs(): Promise<UnifiedTokenInfo[]> {
    const tokens: UnifiedTokenInfo[] = [];
    
    // Implementation would fetch from various APIs
    // This is a placeholder
    
    return tokens;
  }
}

// Blockchain scanning strategy
class BlockchainScanningStrategy extends BaseDetectionStrategy {
  private scanningInterval: NodeJS.Timeout | null = null;
  
  constructor(config: DetectionConfig, private connectionManager: any) {
    super('blockchain', 'blockchain', config);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.stats.isRunning = true;
    
    this.scanningInterval = setInterval(async () => {
      await this.scanBlockchain();
    }, this.config.scanInterval);
    
    // Initial scan
    await this.scanBlockchain();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stats.isRunning = false;
    
    if (this.scanningInterval) {
      clearInterval(this.scanningInterval);
      this.scanningInterval = null;
    }
  }

  private async scanBlockchain(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Scan blockchain for new tokens
      const tokens = await this.scanForNewTokens();
      const processingTime = Date.now() - startTime;
      
      if (tokens.length > 0) {
        this.recordDetection(processingTime);
        
        this.emit('tokensDetected', {
          tokens,
          source: this.source,
          strategy: this.name,
          timestamp: Date.now(),
          processingTime,
          originalCount: tokens.length,
          filteredCount: tokens.length,
          errors: [],
          metadata: { method: 'blockchain_scanning' }
        });
      }
    } catch (error) {
      logger.warn('Blockchain scanning error:', error);
      this.recordError();
    }
  }

  private async scanForNewTokens(): Promise<UnifiedTokenInfo[]> {
    const tokens: UnifiedTokenInfo[] = [];
    
    // Implementation would scan blockchain for new tokens
    // This is a placeholder
    
    return tokens;
  }
}

// DexScreener strategy
class DexScreenerStrategy extends BaseDetectionStrategy {
  private pollingInterval: NodeJS.Timeout | null = null;
  
  constructor(config: DetectionConfig, private apiGateway: any) {
    super('dexscreener', 'dexscreener', config);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.stats.isRunning = true;
    
    this.pollingInterval = setInterval(async () => {
      await this.fetchDexScreenerTokens();
    }, this.config.scanInterval);
    
    // Initial fetch
    await this.fetchDexScreenerTokens();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stats.isRunning = false;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async fetchDexScreenerTokens(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Use centralized API coordinator
      const response = await apiCoordinator.makeRequest(
        '/token-profiles/latest/v1',
        () => this.apiGateway.requestDexScreener('/token-profiles/latest/v1'),
        'DexScreenerStrategy',
        {
          priority: 2,
          maxRetries: 1,
          cacheTtl: this.config.cacheTimeout,
          deduplicationKey: 'dexscreener-trending'
        }
      );
      
      const processingTime = Date.now() - startTime;
      
      if (response.success && response.data) {
        const tokens = this.parseDexScreenerResponse(response.data);
        
        if (tokens.length > 0) {
          this.recordDetection(processingTime);
          
          this.emit('tokensDetected', {
            tokens,
            source: this.source,
            strategy: this.name,
            timestamp: Date.now(),
            processingTime,
            originalCount: tokens.length,
            filteredCount: tokens.length,
            errors: [],
            metadata: { 
              cached: response.cached,
              endpoint: 'trending'
            }
          });
        }
      }
    } catch (error) {
      logger.warn('DexScreener fetch error:', error);
      this.recordError();
    }
  }

  private parseDexScreenerResponse(data: any): UnifiedTokenInfo[] {
    const tokens: UnifiedTokenInfo[] = [];
    
    // Parse DexScreener response format
    if (data.pairs && Array.isArray(data.pairs)) {
      for (const pair of data.pairs) {
        if (pair.chainId === 'solana' && pair.baseToken) {
          const token: UnifiedTokenInfo = {
            address: pair.baseToken.address,
            name: pair.baseToken.name,
            symbol: pair.baseToken.symbol,
            decimals: 9,
            chainId: 'solana',
            detected: true,
            detectedAt: Date.now(),
            timestamp: Date.now(),
            source: 'dexscreener',
            liquidity: {
              usd: pair.liquidity?.usd || 0,
              sol: pair.liquidity?.sol || 0
            },
            metadata: {
              priceUsd: parseFloat(pair.priceUsd || '0'),
              volume24h: pair.volume?.h24 || 0,
              priceChange24h: pair.priceChange?.h24 || 0,
              dexId: pair.dexId,
              pairAddress: pair.pairAddress
            }
          };
          
          tokens.push(token);
        }
      }
    }
    
    return tokens;
  }
}

// Pump detection strategy
class PumpDetectionStrategy extends BaseDetectionStrategy {
  private pollingInterval: NodeJS.Timeout | null = null;
  
  constructor(config: DetectionConfig, private apiGateway: any) {
    super('pump', 'pump', config);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.stats.isRunning = true;
    
    this.pollingInterval = setInterval(async () => {
      await this.fetchPumpTokens();
    }, this.config.scanInterval * 2); // Less frequent
    
    // Initial fetch
    await this.fetchPumpTokens();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.stats.isRunning = false;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private async fetchPumpTokens(): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Use centralized API coordinator
      const response = await apiCoordinator.makeRequest(
        '/token-boosts/latest/v1',
        () => this.apiGateway.requestDexScreener('/token-boosts/latest/v1'),
        'PumpDetectionStrategy',
        {
          priority: 1,
          maxRetries: 1,
          cacheTtl: this.config.cacheTimeout,
          deduplicationKey: 'pump-boosted-tokens'
        }
      );
      
      const processingTime = Date.now() - startTime;
      
      if (response.success && response.data) {
        const tokens = this.parsePumpResponse(response.data);
        
        if (tokens.length > 0) {
          this.recordDetection(processingTime);
          
          this.emit('tokensDetected', {
            tokens,
            source: this.source,
            strategy: this.name,
            timestamp: Date.now(),
            processingTime,
            originalCount: tokens.length,
            filteredCount: tokens.length,
            errors: [],
            metadata: { 
              cached: response.cached,
              endpoint: 'boosted'
            }
          });
        }
      }
    } catch (error) {
      logger.warn('Pump detection error:', error);
      this.recordError();
    }
  }

  private parsePumpResponse(data: any): UnifiedTokenInfo[] {
    const tokens: UnifiedTokenInfo[] = [];
    
    // Parse pump response format
    if (Array.isArray(data)) {
      for (const boost of data) {
        if (boost.chainId === 'solana' && boost.tokenAddress) {
          const token: UnifiedTokenInfo = {
            address: boost.tokenAddress,
            name: boost.description || 'Pumping Token',
            symbol: boost.description?.split(' ')[0] || 'PUMP',
            decimals: 9,
            chainId: 'solana',
            detected: true,
            detectedAt: Date.now(),
            timestamp: Date.now(),
            source: 'pump',
            liquidity: {
              usd: 0,
              sol: 0
            },
            metadata: {
              boostAmount: boost.amount || 0,
              totalAmount: boost.totalAmount || 0,
              icon: boost.icon
            }
          };
          
          tokens.push(token);
        }
      }
    }
    
    return tokens;
  }
}