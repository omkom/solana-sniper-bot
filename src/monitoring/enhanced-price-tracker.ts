import { EventEmitter } from 'events';
import { logger } from './logger';
import { DexScreenerClient } from '../detection/dexscreener-client';
import { getApiGateway } from '../core/api-gateway';
import { ConnectionManager } from '../core/connection';
import { Connection, PublicKey } from '@solana/web3.js';

export interface SwapAvailability {
  dexId: string;
  dexName: string;
  available: boolean;
  liquidity: number;
  priceImpact: number;
  minTradeSize: number;
  maxTradeSize: number;
  fees: number;
  slippage: number;
  lastChecked: number;
  pairAddress?: string;
}

export interface EnhancedTrackedToken {
  mint: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceHistory: PricePoint[];
  volume24h: number;
  liquidityUsd: number;
  priceChange24h: number;
  priceChange5m: number;
  priceChange1h: number;
  addedAt: number;
  lastUpdated: number;
  source: string;
  swapAvailability: SwapAvailability[];
  technicalIndicators: TechnicalIndicators;
  riskMetrics: RiskMetrics;
  tradingSignals: TradingSignal[];
  alertsTriggered: Alert[];
  isActive: boolean;
  marketData?: {
    marketCap: number;
    fdv: number;
    holders: number;
    transactions24h: number;
    ath: number;
    atl: number;
    rank?: number;
  };
}

export interface PricePoint {
  timestamp: number;
  price: number;
  volume: number;
  liquidity: number;
  marketCap?: number;
  holders?: number;
}

export interface TechnicalIndicators {
  sma20: number;
  sma50: number;
  ema12: number;
  ema26: number;
  rsi: number;
  macd: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  volumeProfile: {
    averageVolume: number;
    volumeRatio: number;
    volumeTrend: 'increasing' | 'decreasing' | 'stable';
  };
  momentum: {
    score: number;
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
  };
}

export interface RiskMetrics {
  volatility: number;
  liquidityRisk: number;
  marketCapRisk: number;
  concentrationRisk: number;
  rugPullRisk: number;
  overallRisk: number;
  riskLevel: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
}

export interface TradingSignal {
  type: 'buy' | 'sell' | 'hold';
  strength: number;
  confidence: number;
  source: string;
  timestamp: number;
  reason: string;
  metadata?: any;
}

export interface Alert {
  id: string;
  type: 'price_change' | 'volume_spike' | 'liquidity_change' | 'technical' | 'risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  data?: any;
  acknowledged: boolean;
}

export interface PriceAlert {
  id: string;
  mint: string;
  type: 'price_above' | 'price_below' | 'price_change' | 'volume_spike' | 'liquidity_drop';
  threshold: number;
  active: boolean;
  createdAt: number;
  lastTriggered?: number;
  triggerCount: number;
}

export class EnhancedPriceTracker extends EventEmitter {
  private trackedTokens: Map<string, EnhancedTrackedToken> = new Map();
  private priceAlerts: Map<string, PriceAlert> = new Map();
  private dexScreenerClient: DexScreenerClient;
  private apiGateway = getApiGateway();
  private connectionManager: ConnectionManager;
  private connection: Connection;
  
  private updateInterval: NodeJS.Timer | null = null;
  private swapCheckInterval: NodeJS.Timer | null = null;
  private alertCheckInterval: NodeJS.Timer | null = null;
  
  private isUpdateLoopRunning = false;
  private isSwapCheckRunning = false;
  private isAlertCheckRunning = false;
  
  private readonly UPDATE_INTERVAL = 10000; // 10 seconds for price updates
  private readonly SWAP_CHECK_INTERVAL = 30000; // 30 seconds for swap availability
  private readonly ALERT_CHECK_INTERVAL = 5000; // 5 seconds for alerts
  private readonly MAX_HISTORY_POINTS = 1000;
  private readonly MAX_TRACKED_TOKENS = 500;
  
  // DEX endpoints for swap availability checking
  private readonly DEX_ENDPOINTS = {
    raydium: 'https://api.raydium.io/v2/main/pairs',
    orca: 'https://api.orca.so/v1/whirlpools',
    jupiter: 'https://quote-api.jup.ag/v6/quote',
    serum: 'https://serum-api.bonfida.com/pools',
    meteora: 'https://app.meteora.ag/pools'
  };

  constructor() {
    super();
    this.dexScreenerClient = new DexScreenerClient();
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    
    logger.info('📊 Enhanced Price Tracker initialized with multi-DEX support');
  }

  /**
   * Add a token to enhanced tracking
   */
  async addToken(mint: string, symbol: string, name: string, source: string = 'unknown'): Promise<void> {
    if (this.trackedTokens.has(mint)) {
      logger.info(`📊 Token ${symbol} already being tracked`);
      return;
    }

    // Check capacity
    if (this.trackedTokens.size >= this.MAX_TRACKED_TOKENS) {
      this.removeOldestToken();
    }

    // Initialize enhanced tracked token
    const enhancedToken: EnhancedTrackedToken = {
      mint,
      symbol,
      name,
      priceUsd: 0,
      priceHistory: [],
      volume24h: 0,
      liquidityUsd: 0,
      priceChange24h: 0,
      priceChange5m: 0,
      priceChange1h: 0,
      addedAt: Date.now(),
      lastUpdated: 0,
      source,
      swapAvailability: [],
      technicalIndicators: this.initializeTechnicalIndicators(),
      riskMetrics: this.initializeRiskMetrics(),
      tradingSignals: [],
      alertsTriggered: [],
      isActive: true
    };

    this.trackedTokens.set(mint, enhancedToken);
    logger.info(`📊 Added token to enhanced tracking: ${symbol} (${mint.slice(0, 8)}...) from ${source}`);

    // Start tracking loops if this is the first token
    if (this.trackedTokens.size === 1) {
      this.startAllTracking();
    }

    // Get initial data
    await this.updateTokenData(mint);
    await this.checkSwapAvailability(mint);

    this.emit('tokenAdded', enhancedToken);
  }

  /**
   * Remove token from tracking
   */
  removeToken(mint: string): void {
    const token = this.trackedTokens.get(mint);
    if (token) {
      token.isActive = false;
      this.trackedTokens.delete(mint);
      
      // Remove related alerts
      for (const [alertId, alert] of this.priceAlerts) {
        if (alert.mint === mint) {
          this.priceAlerts.delete(alertId);
        }
      }
      
      logger.info(`📊 Removed token from tracking: ${token.symbol}`);
      this.emit('tokenRemoved', token);
      
      // Stop tracking if no tokens left
      if (this.trackedTokens.size === 0) {
        this.stopAllTracking();
      }
    }
  }

  /**
   * Start all tracking loops
   */
  private startAllTracking(): void {
    this.startPriceUpdates();
    this.startSwapAvailabilityChecks();
    this.startAlertChecks();
  }

  /**
   * Stop all tracking loops
   */
  private stopAllTracking(): void {
    this.stopPriceUpdates();
    this.stopSwapAvailabilityChecks();
    this.stopAlertChecks();
  }

  /**
   * Start price update loop
   */
  private startPriceUpdates(): void {
    if (this.isUpdateLoopRunning) return;

    logger.info('🔄 Starting enhanced price update loop');
    this.isUpdateLoopRunning = true;
    
    this.updateInterval = setInterval(() => {
      this.updateAllTokenPrices();
    }, this.UPDATE_INTERVAL);

    // Initial update
    this.updateAllTokenPrices();
  }

  /**
   * Stop price update loop
   */
  private stopPriceUpdates(): void {
    if (!this.isUpdateLoopRunning) return;

    logger.info('⏹️ Stopping price update loop');
    this.isUpdateLoopRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Start swap availability checking
   */
  private startSwapAvailabilityChecks(): void {
    if (this.isSwapCheckRunning) return;

    logger.info('🔄 Starting swap availability checks');
    this.isSwapCheckRunning = true;
    
    this.swapCheckInterval = setInterval(() => {
      this.checkAllSwapAvailability();
    }, this.SWAP_CHECK_INTERVAL);

    // Initial check
    this.checkAllSwapAvailability();
  }

  /**
   * Stop swap availability checking
   */
  private stopSwapAvailabilityChecks(): void {
    if (!this.isSwapCheckRunning) return;

    logger.info('⏹️ Stopping swap availability checks');
    this.isSwapCheckRunning = false;
    
    if (this.swapCheckInterval) {
      clearInterval(this.swapCheckInterval);
      this.swapCheckInterval = null;
    }
  }

  /**
   * Start alert checking
   */
  private startAlertChecks(): void {
    if (this.isAlertCheckRunning) return;

    logger.info('🔄 Starting alert checks');
    this.isAlertCheckRunning = true;
    
    this.alertCheckInterval = setInterval(() => {
      this.checkAllAlerts();
    }, this.ALERT_CHECK_INTERVAL);
  }

  /**
   * Stop alert checking
   */
  private stopAlertChecks(): void {
    if (!this.isAlertCheckRunning) return;

    logger.info('⏹️ Stopping alert checks');
    this.isAlertCheckRunning = false;
    
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
      this.alertCheckInterval = null;
    }
  }

  /**
   * Update all token prices and data
   */
  private async updateAllTokenPrices(): Promise<void> {
    if (this.trackedTokens.size === 0) return;

    logger.debug(`🔄 Updating prices for ${this.trackedTokens.size} tracked tokens`);
    
    const promises = Array.from(this.trackedTokens.keys()).map(mint => 
      this.updateTokenData(mint)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Update comprehensive token data
   */
  private async updateTokenData(mint: string): Promise<void> {
    const token = this.trackedTokens.get(mint);
    if (!token || !token.isActive) return;

    try {
      // Get market data from DexScreener
      const marketData = await this.dexScreenerClient.getTokenByAddress(mint);
      
      if (marketData) {
        const now = Date.now();
        const oldPrice = token.priceUsd;
        
        // Update basic price data
        token.priceUsd = marketData.priceUsd || 0;
        token.volume24h = marketData.volume24h || 0;
        token.liquidityUsd = marketData.liquidityUsd || 0;
        token.priceChange24h = marketData.priceChange24h || 0;
        token.priceChange5m = marketData.priceChange5m || 0;
        token.priceChange1h = marketData.priceChange1h || 0;
        token.lastUpdated = now;
        
        // Update market data
        token.marketData = {
          marketCap: marketData.marketCap || 0,
          fdv: marketData.fdv || 0,
          holders: marketData.holders || 0,
          transactions24h: marketData.txns24h || 0,
          ath: token.marketData?.ath || token.priceUsd,
          atl: token.marketData?.atl || token.priceUsd
        };

        // Update ATH/ATL
        if (token.priceUsd > token.marketData.ath) {
          token.marketData.ath = token.priceUsd;
        }
        if (token.priceUsd < token.marketData.atl) {
          token.marketData.atl = token.priceUsd;
        }
        
        // Add to price history
        token.priceHistory.push({
          timestamp: now,
          price: token.priceUsd,
          volume: token.volume24h,
          liquidity: token.liquidityUsd,
          marketCap: token.marketData.marketCap,
          holders: token.marketData.holders
        });

        // Limit history size
        if (token.priceHistory.length > this.MAX_HISTORY_POINTS) {
          token.priceHistory = token.priceHistory.slice(-this.MAX_HISTORY_POINTS);
        }

        // Update technical indicators
        this.updateTechnicalIndicators(token);
        
        // Update risk metrics
        this.updateRiskMetrics(token);
        
        // Generate trading signals
        this.generateTradingSignals(token);

        // Emit price update event
        this.emit('priceUpdate', {
          mint,
          symbol: token.symbol,
          priceUsd: token.priceUsd,
          priceChange: token.priceUsd - oldPrice,
          priceChangePercent: oldPrice > 0 ? ((token.priceUsd - oldPrice) / oldPrice) * 100 : 0,
          volume24h: token.volume24h,
          liquidityUsd: token.liquidityUsd,
          timestamp: now,
          technicalIndicators: token.technicalIndicators,
          riskMetrics: token.riskMetrics,
          tradingSignals: token.tradingSignals.slice(-5) // Last 5 signals
        });

        logger.debug(`📊 Updated ${token.symbol}: $${token.priceUsd.toFixed(8)} (${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(2)}%)`);
      }
    } catch (error) {
      logger.error(`❌ Error updating data for ${token.symbol}:`, error);
    }
  }

  /**
   * Check swap availability across all DEXes
   */
  private async checkAllSwapAvailability(): Promise<void> {
    if (this.trackedTokens.size === 0) return;

    logger.debug(`🔄 Checking swap availability for ${this.trackedTokens.size} tokens`);
    
    const promises = Array.from(this.trackedTokens.keys()).map(mint => 
      this.checkSwapAvailability(mint)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Check swap availability for a specific token
   */
  private async checkSwapAvailability(mint: string): Promise<void> {
    const token = this.trackedTokens.get(mint);
    if (!token || !token.isActive) return;

    try {
      const swapAvailability: SwapAvailability[] = [];
      
      // Check Raydium
      const raydiumAvailability = await this.checkRaydiumAvailability(mint);
      if (raydiumAvailability) swapAvailability.push(raydiumAvailability);
      
      // Check Orca
      const orcaAvailability = await this.checkOrcaAvailability(mint);
      if (orcaAvailability) swapAvailability.push(orcaAvailability);
      
      // Check Jupiter (aggregator)
      const jupiterAvailability = await this.checkJupiterAvailability(mint);
      if (jupiterAvailability) swapAvailability.push(jupiterAvailability);
      
      // Update token's swap availability
      token.swapAvailability = swapAvailability;
      
      this.emit('swapAvailabilityUpdated', {
        mint,
        symbol: token.symbol,
        swapAvailability,
        timestamp: Date.now()
      });

      logger.debug(`🔄 Updated swap availability for ${token.symbol}: ${swapAvailability.length} DEXes available`);
    } catch (error) {
      logger.error(`❌ Error checking swap availability for ${token.symbol}:`, error);
    }
  }

  /**
   * Check Raydium swap availability
   */
  private async checkRaydiumAvailability(mint: string): Promise<SwapAvailability | null> {
    try {
      // Implementation for Raydium API check
      const response = await this.apiGateway.request('raydium', '/v2/main/pairs', {
        params: { mint }
      });
      
      if (response && response.data) {
        return {
          dexId: 'raydium',
          dexName: 'Raydium',
          available: true,
          liquidity: response.data.liquidity || 0,
          priceImpact: response.data.priceImpact || 0,
          minTradeSize: 0.001,
          maxTradeSize: response.data.liquidity * 0.1,
          fees: 0.0025,
          slippage: 0.5,
          lastChecked: Date.now(),
          pairAddress: response.data.pairAddress
        };
      }
    } catch (error) {
      logger.debug(`No Raydium availability for ${mint}:`, error);
    }
    return null;
  }

  /**
   * Check Orca swap availability
   */
  private async checkOrcaAvailability(mint: string): Promise<SwapAvailability | null> {
    try {
      // Implementation for Orca API check
      const response = await this.apiGateway.request('orca', '/v1/whirlpools', {
        params: { tokenMint: mint }
      });
      
      if (response && response.data) {
        return {
          dexId: 'orca',
          dexName: 'Orca',
          available: true,
          liquidity: response.data.tvl || 0,
          priceImpact: 0,
          minTradeSize: 0.001,
          maxTradeSize: response.data.tvl * 0.05,
          fees: 0.003,
          slippage: 0.5,
          lastChecked: Date.now(),
          pairAddress: response.data.address
        };
      }
    } catch (error) {
      logger.debug(`No Orca availability for ${mint}:`, error);
    }
    return null;
  }

  /**
   * Check Jupiter swap availability
   */
  private async checkJupiterAvailability(mint: string): Promise<SwapAvailability | null> {
    try {
      // Jupiter is an aggregator - check if token is supported
      const response = await this.apiGateway.requestJupiter('/v6/quote', {
        params: {
          inputMint: mint,
          outputMint: 'So11111111111111111111111111111111111111112', // SOL
          amount: 1000000, // 1 token (assuming 6 decimals)
          slippageBps: 50
        }
      });
      
      if (response && response.data) {
        return {
          dexId: 'jupiter',
          dexName: 'Jupiter',
          available: true,
          liquidity: 0, // Jupiter doesn't provide direct liquidity info
          priceImpact: response.data.priceImpactPct || 0,
          minTradeSize: 0.0001,
          maxTradeSize: 1000000,
          fees: 0.001,
          slippage: 0.5,
          lastChecked: Date.now()
        };
      }
    } catch (error) {
      logger.debug(`No Jupiter availability for ${mint}:`, error);
    }
    return null;
  }

  /**
   * Check all alerts for triggers
   */
  private async checkAllAlerts(): Promise<void> {
    for (const [alertId, alert] of this.priceAlerts) {
      if (alert.active) {
        await this.checkAlert(alert);
      }
    }
  }

  /**
   * Check specific alert for trigger
   */
  private async checkAlert(alert: PriceAlert): Promise<void> {
    const token = this.trackedTokens.get(alert.mint);
    if (!token || !token.isActive) return;

    let triggered = false;
    let alertData: any = {};

    switch (alert.type) {
      case 'price_above':
        if (token.priceUsd >= alert.threshold) {
          triggered = true;
          alertData = { currentPrice: token.priceUsd, threshold: alert.threshold };
        }
        break;
        
      case 'price_below':
        if (token.priceUsd <= alert.threshold) {
          triggered = true;
          alertData = { currentPrice: token.priceUsd, threshold: alert.threshold };
        }
        break;
        
      case 'price_change':
        if (Math.abs(token.priceChange24h) >= alert.threshold) {
          triggered = true;
          alertData = { priceChange: token.priceChange24h, threshold: alert.threshold };
        }
        break;
        
      case 'volume_spike':
        if (token.volume24h >= alert.threshold) {
          triggered = true;
          alertData = { volume: token.volume24h, threshold: alert.threshold };
        }
        break;
        
      case 'liquidity_drop':
        if (token.liquidityUsd <= alert.threshold) {
          triggered = true;
          alertData = { liquidity: token.liquidityUsd, threshold: alert.threshold };
        }
        break;
    }

    if (triggered) {
      const now = Date.now();
      alert.lastTriggered = now;
      alert.triggerCount++;

      const alertObj: Alert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: alert.type === 'price_above' || alert.type === 'price_below' ? 'price_change' : 
              alert.type === 'volume_spike' ? 'volume_spike' : 'liquidity_change',
        severity: this.calculateAlertSeverity(alert.type, alertData),
        message: this.generateAlertMessage(token, alert, alertData),
        timestamp: now,
        data: alertData,
        acknowledged: false
      };

      token.alertsTriggered.push(alertObj);
      
      // Keep only last 50 alerts per token
      if (token.alertsTriggered.length > 50) {
        token.alertsTriggered = token.alertsTriggered.slice(-50);
      }

      this.emit('alertTriggered', {
        mint: alert.mint,
        symbol: token.symbol,
        alert: alertObj,
        token
      });

      logger.info(`🚨 Alert triggered for ${token.symbol}: ${alertObj.message}`);
    }
  }

  /**
   * Calculate alert severity
   */
  private calculateAlertSeverity(type: string, data: any): 'low' | 'medium' | 'high' | 'critical' {
    switch (type) {
      case 'price_above':
      case 'price_below':
        return 'medium';
      case 'price_change':
        if (Math.abs(data.priceChange) > 100) return 'critical';
        if (Math.abs(data.priceChange) > 50) return 'high';
        return 'medium';
      case 'volume_spike':
        return data.volume > 1000000 ? 'high' : 'medium';
      case 'liquidity_drop':
        return data.liquidity < 10000 ? 'high' : 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(token: EnhancedTrackedToken, alert: PriceAlert, data: any): string {
    switch (alert.type) {
      case 'price_above':
        return `${token.symbol} price reached $${data.currentPrice.toFixed(8)} (above $${data.threshold.toFixed(8)})`;
      case 'price_below':
        return `${token.symbol} price dropped to $${data.currentPrice.toFixed(8)} (below $${data.threshold.toFixed(8)})`;
      case 'price_change':
        return `${token.symbol} price changed ${data.priceChange.toFixed(2)}% (threshold: ${data.threshold}%)`;
      case 'volume_spike':
        return `${token.symbol} volume spiked to $${data.volume.toLocaleString()} (threshold: $${data.threshold.toLocaleString()})`;
      case 'liquidity_drop':
        return `${token.symbol} liquidity dropped to $${data.liquidity.toLocaleString()} (threshold: $${data.threshold.toLocaleString()})`;
      default:
        return `Alert triggered for ${token.symbol}`;
    }
  }

  /**
   * Initialize technical indicators
   */
  private initializeTechnicalIndicators(): TechnicalIndicators {
    return {
      sma20: 0,
      sma50: 0,
      ema12: 0,
      ema26: 0,
      rsi: 50,
      macd: 0,
      bollingerBands: {
        upper: 0,
        middle: 0,
        lower: 0
      },
      volumeProfile: {
        averageVolume: 0,
        volumeRatio: 1,
        volumeTrend: 'stable'
      },
      momentum: {
        score: 0,
        direction: 'neutral',
        strength: 'weak'
      }
    };
  }

  /**
   * Initialize risk metrics
   */
  private initializeRiskMetrics(): RiskMetrics {
    return {
      volatility: 0,
      liquidityRisk: 0,
      marketCapRisk: 0,
      concentrationRisk: 0,
      rugPullRisk: 0,
      overallRisk: 0,
      riskLevel: 'medium'
    };
  }

  /**
   * Update technical indicators
   */
  private updateTechnicalIndicators(token: EnhancedTrackedToken): void {
    const history = token.priceHistory;
    if (history.length < 10) return;

    const prices = history.map(p => p.price);
    const volumes = history.map(p => p.volume);
    
    // Simple Moving Averages
    if (prices.length >= 20) {
      token.technicalIndicators.sma20 = this.calculateSMA(prices, 20);
    }
    if (prices.length >= 50) {
      token.technicalIndicators.sma50 = this.calculateSMA(prices, 50);
    }
    
    // Exponential Moving Averages
    token.technicalIndicators.ema12 = this.calculateEMA(prices, 12);
    token.technicalIndicators.ema26 = this.calculateEMA(prices, 26);
    
    // RSI
    token.technicalIndicators.rsi = this.calculateRSI(prices);
    
    // MACD
    token.technicalIndicators.macd = token.technicalIndicators.ema12 - token.technicalIndicators.ema26;
    
    // Bollinger Bands
    const sma20 = token.technicalIndicators.sma20;
    const std = this.calculateStandardDeviation(prices.slice(-20));
    token.technicalIndicators.bollingerBands = {
      upper: sma20 + (2 * std),
      middle: sma20,
      lower: sma20 - (2 * std)
    };
    
    // Volume Profile
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    token.technicalIndicators.volumeProfile = {
      averageVolume: avgVolume,
      volumeRatio: token.volume24h / avgVolume,
      volumeTrend: this.calculateVolumeTrend(volumes)
    };
    
    // Momentum
    token.technicalIndicators.momentum = this.calculateMomentum(token);
  }

  /**
   * Update risk metrics
   */
  private updateRiskMetrics(token: EnhancedTrackedToken): void {
    const history = token.priceHistory;
    if (history.length < 10) return;

    const prices = history.map(p => p.price);
    
    // Volatility (standard deviation of returns)
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }
    token.riskMetrics.volatility = this.calculateStandardDeviation(returns) * 100;
    
    // Liquidity risk
    token.riskMetrics.liquidityRisk = token.liquidityUsd < 10000 ? 80 : 
                                      token.liquidityUsd < 50000 ? 60 : 
                                      token.liquidityUsd < 100000 ? 40 : 20;
    
    // Market cap risk
    const marketCap = token.marketData?.marketCap || 0;
    token.riskMetrics.marketCapRisk = marketCap < 100000 ? 90 : 
                                      marketCap < 1000000 ? 70 : 
                                      marketCap < 10000000 ? 50 : 30;
    
    // Concentration risk (placeholder)
    token.riskMetrics.concentrationRisk = 50;
    
    // Rug pull risk (based on various factors)
    token.riskMetrics.rugPullRisk = this.calculateRugPullRisk(token);
    
    // Overall risk
    token.riskMetrics.overallRisk = (
      token.riskMetrics.volatility * 0.3 +
      token.riskMetrics.liquidityRisk * 0.25 +
      token.riskMetrics.marketCapRisk * 0.2 +
      token.riskMetrics.concentrationRisk * 0.15 +
      token.riskMetrics.rugPullRisk * 0.1
    );
    
    // Risk level
    token.riskMetrics.riskLevel = token.riskMetrics.overallRisk > 80 ? 'very_high' :
                                  token.riskMetrics.overallRisk > 60 ? 'high' :
                                  token.riskMetrics.overallRisk > 40 ? 'medium' :
                                  token.riskMetrics.overallRisk > 20 ? 'low' : 'very_low';
  }

  /**
   * Generate trading signals
   */
  private generateTradingSignals(token: EnhancedTrackedToken): void {
    const signals: TradingSignal[] = [];
    const now = Date.now();
    
    // Price momentum signal
    if (token.priceChange24h > 20) {
      signals.push({
        type: 'buy',
        strength: Math.min(token.priceChange24h / 10, 10),
        confidence: 70,
        source: 'price_momentum',
        timestamp: now,
        reason: `Strong upward momentum: ${token.priceChange24h.toFixed(2)}%`
      });
    } else if (token.priceChange24h < -20) {
      signals.push({
        type: 'sell',
        strength: Math.min(Math.abs(token.priceChange24h) / 10, 10),
        confidence: 65,
        source: 'price_momentum',
        timestamp: now,
        reason: `Strong downward momentum: ${token.priceChange24h.toFixed(2)}%`
      });
    }
    
    // Volume signal
    if (token.technicalIndicators.volumeProfile.volumeRatio > 3) {
      signals.push({
        type: 'buy',
        strength: Math.min(token.technicalIndicators.volumeProfile.volumeRatio, 10),
        confidence: 75,
        source: 'volume_spike',
        timestamp: now,
        reason: `Volume spike: ${token.technicalIndicators.volumeProfile.volumeRatio.toFixed(2)}x average`
      });
    }
    
    // RSI signal
    if (token.technicalIndicators.rsi < 30) {
      signals.push({
        type: 'buy',
        strength: (30 - token.technicalIndicators.rsi) / 3,
        confidence: 60,
        source: 'rsi_oversold',
        timestamp: now,
        reason: `RSI oversold: ${token.technicalIndicators.rsi.toFixed(2)}`
      });
    } else if (token.technicalIndicators.rsi > 70) {
      signals.push({
        type: 'sell',
        strength: (token.technicalIndicators.rsi - 70) / 3,
        confidence: 60,
        source: 'rsi_overbought',
        timestamp: now,
        reason: `RSI overbought: ${token.technicalIndicators.rsi.toFixed(2)}`
      });
    }
    
    // Add new signals to token
    token.tradingSignals.push(...signals);
    
    // Keep only last 100 signals
    if (token.tradingSignals.length > 100) {
      token.tradingSignals = token.tradingSignals.slice(-100);
    }
  }

  // Helper calculation methods
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    return ema;
  }

  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;
    
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateVolumeTrend(volumes: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (volumes.length < 5) return 'stable';
    const recent = volumes.slice(-5);
    const older = volumes.slice(-10, -5);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    if (recentAvg > olderAvg * 1.2) return 'increasing';
    if (recentAvg < olderAvg * 0.8) return 'decreasing';
    return 'stable';
  }

  private calculateMomentum(token: EnhancedTrackedToken): any {
    const priceChange = token.priceChange24h;
    const volume = token.technicalIndicators.volumeProfile.volumeRatio;
    
    let score = 0;
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let strength: 'strong' | 'moderate' | 'weak' = 'weak';
    
    // Calculate momentum score
    score += priceChange * 0.6; // Weight price change heavily
    score += (volume - 1) * 20; // Volume ratio contribution
    score += (token.technicalIndicators.rsi - 50) * 0.4; // RSI contribution
    
    // Determine direction
    if (score > 10) direction = 'bullish';
    else if (score < -10) direction = 'bearish';
    
    // Determine strength
    const absScore = Math.abs(score);
    if (absScore > 30) strength = 'strong';
    else if (absScore > 15) strength = 'moderate';
    
    return { score, direction, strength };
  }

  private calculateRugPullRisk(token: EnhancedTrackedToken): number {
    let risk = 0;
    
    // Age factor
    const age = Date.now() - token.addedAt;
    if (age < 86400000) risk += 30; // Less than 1 day
    
    // Liquidity factor
    if (token.liquidityUsd < 10000) risk += 40;
    else if (token.liquidityUsd < 50000) risk += 20;
    
    // Volume factor
    if (token.volume24h < 1000) risk += 30;
    
    // Volatility factor
    if (token.riskMetrics.volatility > 50) risk += 25;
    
    return Math.min(risk, 100);
  }

  private removeOldestToken(): void {
    let oldestToken: EnhancedTrackedToken | null = null;
    let oldestMint = '';

    for (const [mint, token] of this.trackedTokens) {
      if (!oldestToken || token.addedAt < oldestToken.addedAt) {
        oldestToken = token;
        oldestMint = mint;
      }
    }

    if (oldestToken) {
      logger.info(`📊 Removing oldest token to make space: ${oldestToken.symbol}`);
      this.removeToken(oldestMint);
    }
  }

  // Public API methods
  
  /**
   * Add price alert
   */
  addPriceAlert(
    mint: string,
    type: 'price_above' | 'price_below' | 'price_change' | 'volume_spike' | 'liquidity_drop',
    threshold: number
  ): string {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const alert: PriceAlert = {
      id: alertId,
      mint,
      type,
      threshold,
      active: true,
      createdAt: Date.now(),
      triggerCount: 0
    };
    
    this.priceAlerts.set(alertId, alert);
    logger.info(`🚨 Added price alert for ${mint}: ${type} ${threshold}`);
    
    return alertId;
  }

  /**
   * Remove price alert
   */
  removePriceAlert(alertId: string): void {
    if (this.priceAlerts.delete(alertId)) {
      logger.info(`🚨 Removed price alert: ${alertId}`);
    }
  }

  /**
   * Get all tracked tokens
   */
  getTrackedTokens(): EnhancedTrackedToken[] {
    return Array.from(this.trackedTokens.values());
  }

  /**
   * Get specific tracked token
   */
  getTrackedToken(mint: string): EnhancedTrackedToken | undefined {
    return this.trackedTokens.get(mint);
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): any {
    const tokens = Array.from(this.trackedTokens.values());
    const activeAlerts = Array.from(this.priceAlerts.values()).filter(a => a.active);
    
    return {
      totalTracked: tokens.length,
      maxTracked: this.MAX_TRACKED_TOKENS,
      activeAlerts: activeAlerts.length,
      isUpdateLoopRunning: this.isUpdateLoopRunning,
      isSwapCheckRunning: this.isSwapCheckRunning,
      isAlertCheckRunning: this.isAlertCheckRunning,
      updateInterval: this.UPDATE_INTERVAL,
      swapCheckInterval: this.SWAP_CHECK_INTERVAL,
      alertCheckInterval: this.ALERT_CHECK_INTERVAL,
      averagePrice: tokens.reduce((sum, t) => sum + t.priceUsd, 0) / tokens.length || 0,
      totalVolume: tokens.reduce((sum, t) => sum + t.volume24h, 0),
      totalLiquidity: tokens.reduce((sum, t) => sum + t.liquidityUsd, 0),
      riskDistribution: this.getRiskDistribution(tokens),
      dexAvailability: this.getDexAvailability(tokens)
    };
  }

  private getRiskDistribution(tokens: EnhancedTrackedToken[]): any {
    const distribution = { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 };
    tokens.forEach(token => {
      distribution[token.riskMetrics.riskLevel]++;
    });
    return distribution;
  }

  private getDexAvailability(tokens: EnhancedTrackedToken[]): any {
    const dexStats = new Map<string, { available: number, total: number }>();
    
    tokens.forEach(token => {
      token.swapAvailability.forEach(swap => {
        const stats = dexStats.get(swap.dexId) || { available: 0, total: 0 };
        stats.total++;
        if (swap.available) stats.available++;
        dexStats.set(swap.dexId, stats);
      });
    });
    
    return Object.fromEntries(dexStats);
  }

  /**
   * Get token price history
   */
  getTokenHistory(mint: string, limit: number = 100): PricePoint[] {
    const token = this.trackedTokens.get(mint);
    if (!token) return [];
    return token.priceHistory.slice(-limit);
  }

  /**
   * Clear all tracked tokens
   */
  clearAll(): void {
    logger.info('🗑️ Clearing all tracked tokens');
    this.trackedTokens.clear();
    this.priceAlerts.clear();
    this.stopAllTracking();
    this.emit('tokensCleared');
  }

  /**
   * Check if token is being tracked
   */
  isTracking(mint: string): boolean {
    return this.trackedTokens.has(mint);
  }

  /**
   * Get best swap option for a token
   */
  getBestSwapOption(mint: string): SwapAvailability | null {
    const token = this.trackedTokens.get(mint);
    if (!token || token.swapAvailability.length === 0) return null;
    
    // Sort by liquidity and fees
    const sorted = token.swapAvailability
      .filter(swap => swap.available)
      .sort((a, b) => {
        const aScore = a.liquidity * (1 - a.fees);
        const bScore = b.liquidity * (1 - b.fees);
        return bScore - aScore;
      });
    
    return sorted[0] || null;
  }
}