import { BaseEventEmitter, ArrayUtils, CacheUtils } from '../utils/common-patterns';
import { UnifiedTokenInfo, Position, Trade, Portfolio, Strategy, SimulationConfig } from '../types/unified';
import { logger } from '../monitoring/logger';
import { Config } from '../core/config';

/**
 * Unified Simulation Engine
 * Consolidates functionality from:
 * - dry-run-engine.ts
 * - real-price-engine.ts
 * - ultra-sniper-engine.ts
 */
export class UnifiedSimulationEngine extends BaseEventEmitter {
  private config: SimulationConfig;
  private portfolio: Portfolio;
  private strategies: Map<string, Strategy>;
  private positions: Map<string, Position> = new Map();
  private trades: Trade[] = [];
  private priceHistory: Map<string, number[]> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  // Pricing strategies
  private pricingStrategies = new Map<string, PricingStrategy>();
  private currentPricingStrategy: PricingStrategy;
  
  // Risk management
  private riskManager: RiskManager;
  
  constructor(config: Partial<SimulationConfig> = {}) {
    super();
    
    this.config = {
      mode: 'DRY_RUN',
      maxPositions: 500,
      baseInvestment: 0.003,
      startingBalance: 10,
      maxAnalysisAge: 3600000, // 1 hour
      minConfidenceScore: 5,
      stopLossPercent: -30,
      takeProfitPercent: 100,
      maxHoldTime: 7200000, // 2 hours
      ...config
    };
    
    this.initializePortfolio();
    this.initializeStrategies();
    this.initializePricingStrategies();
    this.riskManager = new RiskManager(this.config);
    
    logger.info('🎮 Unified Simulation Engine initialized', {
      mode: this.config.mode,
      maxPositions: this.config.maxPositions,
      baseInvestment: this.config.baseInvestment
    });
  }

  private initializePortfolio(): void {
    this.portfolio = {
      totalValue: this.config.startingBalance,
      totalPnL: 0,
      totalPnLPercent: 0,
      activePositions: 0,
      totalPositions: 0,
      winRate: 0,
      avgHoldTime: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      balance: {
        sol: this.config.startingBalance,
        usd: this.config.startingBalance * 150 // Rough SOL price
      },
      positions: [],
      recentTrades: []
    };
  }

  private initializeStrategies(): void {
    this.strategies = new Map([
      ['DEMO', {
        name: 'DEMO',
        priority: 'ULTRA_HIGH',
        weight: 0.3,
        baseAllocation: 0.01,
        maxPositions: 100,
        enabled: true,
        config: { riskLevel: 'HIGH' }
      }],
      ['PUMP_FUN', {
        name: 'PUMP_FUN',
        priority: 'ULTRA_HIGH',
        weight: 0.25,
        baseAllocation: 0.01,
        maxPositions: 100,
        enabled: true,
        config: { riskLevel: 'HIGH' }
      }],
      ['RAYDIUM', {
        name: 'RAYDIUM',
        priority: 'HIGH',
        weight: 0.2,
        baseAllocation: 0.008,
        maxPositions: 80,
        enabled: true,
        config: { riskLevel: 'MEDIUM' }
      }],
      ['ORCA', {
        name: 'ORCA',
        priority: 'MEDIUM',
        weight: 0.15,
        baseAllocation: 0.006,
        maxPositions: 60,
        enabled: true,
        config: { riskLevel: 'MEDIUM' }
      }],
      ['DEXSCREENER', {
        name: 'DEXSCREENER',
        priority: 'MEDIUM',
        weight: 0.1,
        baseAllocation: 0.005,
        maxPositions: 40,
        enabled: true,
        config: { riskLevel: 'LOW' }
      }]
    ]);
  }

  private initializePricingStrategies(): void {
    this.pricingStrategies.set('simulation', new SimulationPricingStrategy());
    this.pricingStrategies.set('realistic', new RealisticPricingStrategy());
    this.pricingStrategies.set('conservative', new ConservativePricingStrategy());
    
    // Default to realistic pricing
    this.currentPricingStrategy = this.pricingStrategies.get('realistic')!;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Simulation engine already running');
      return;
    }

    this.isRunning = true;
    
    // Start position monitoring
    this.startPositionMonitoring();
    
    this.emit('started');
    logger.info('🚀 Unified simulation engine started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.emit('stopped');
    logger.info('🛑 Unified simulation engine stopped');
  }

  async processToken(token: UnifiedTokenInfo): Promise<void> {
    try {
      // Check if we should create a position
      const shouldEnter = await this.shouldEnterPosition(token);
      
      if (shouldEnter) {
        await this.createPosition(token);
      }
    } catch (error) {
      logger.error('Error processing token:', error);
      this.emit('error', error);
    }
  }

  private async shouldEnterPosition(token: UnifiedTokenInfo): Promise<boolean> {
    // Check basic constraints
    if (this.positions.size >= this.config.maxPositions) {
      return false;
    }

    // Check if already have position for this token
    if (this.positions.has(token.address)) {
      return false;
    }

    // Check age constraint
    const tokenAge = Date.now() - token.detectedAt;
    if (tokenAge > this.config.maxAnalysisAge) {
      return false;
    }

    // Check confidence score
    const confidenceScore = token.trendingScore || 0;
    if (confidenceScore < this.config.minConfidenceScore) {
      return false;
    }

    // Risk management check
    return this.riskManager.shouldEnterPosition(token, this.portfolio);
  }

  private async createPosition(token: UnifiedTokenInfo): Promise<void> {
    try {
      const strategy = this.selectStrategy(token);
      const positionSize = this.calculatePositionSize(token, strategy);
      const entryPrice = this.currentPricingStrategy.getEntryPrice(token);
      
      const position: Position = {
        id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        token,
        entryPrice,
        amount: positionSize,
        value: positionSize * entryPrice,
        timestamp: Date.now(),
        source: token.source || 'unknown',
        strategy: strategy.name,
        status: 'ACTIVE'
      };

      // Execute buy trade
      const buyTrade = await this.executeTrade(position, 'BUY', entryPrice, positionSize);
      
      if (buyTrade.success) {
        this.positions.set(token.address, position);
        this.updatePortfolio();
        
        logger.info(`📈 Opened position: ${token.symbol}`, {
          size: positionSize,
          price: entryPrice,
          strategy: strategy.name
        });
        
        this.emit('positionOpened', position);
      }
    } catch (error) {
      logger.error('Error creating position:', error);
    }
  }

  private selectStrategy(token: UnifiedTokenInfo): Strategy {
    // Select strategy based on token source and characteristics
    const source = token.source || 'unknown';
    const dexId = token.dexId || 'unknown';
    
    // Priority order: source-specific -> dex-specific -> default
    const strategyName = 
      source.toUpperCase().includes('PUMP') ? 'PUMP_FUN' :
      dexId.toUpperCase().includes('RAYDIUM') ? 'RAYDIUM' :
      dexId.toUpperCase().includes('ORCA') ? 'ORCA' :
      source.toUpperCase().includes('DEXSCREENER') ? 'DEXSCREENER' :
      'DEMO';
    
    return this.strategies.get(strategyName) || this.strategies.get('DEMO')!;
  }

  private calculatePositionSize(token: UnifiedTokenInfo, strategy: Strategy): number {
    let baseSize = strategy.baseAllocation;
    
    // Age factor (newer = larger position)
    const tokenAge = Date.now() - token.detectedAt;
    const ageMinutes = tokenAge / (1000 * 60);
    
    let ageFactor = 1.0;
    if (ageMinutes < 5) ageFactor = 3.0;
    else if (ageMinutes < 15) ageFactor = 2.0;
    else if (ageMinutes < 30) ageFactor = 1.5;
    
    // Confidence factor
    const confidenceScore = token.trendingScore || 0;
    let confidenceFactor = 1.0;
    if (confidenceScore >= 95) confidenceFactor = 2.5;
    else if (confidenceScore >= 90) confidenceFactor = 2.0;
    else if (confidenceScore >= 80) confidenceFactor = 1.5;
    else if (confidenceScore >= 70) confidenceFactor = 1.2;
    
    // Liquidity factor
    const liquidityUSD = token.liquidityUsd || 0;
    let liquidityFactor = 1.0;
    if (liquidityUSD > 100000) liquidityFactor = 2.5;
    else if (liquidityUSD > 50000) liquidityFactor = 2.0;
    else if (liquidityUSD > 25000) liquidityFactor = 1.5;
    else if (liquidityUSD > 10000) liquidityFactor = 1.2;
    
    // Volume factor
    const volume24h = token.volume24h || 0;
    let volumeFactor = 1.0;
    if (volume24h > 1000000) volumeFactor = 2.0;
    else if (volume24h > 100000) volumeFactor = 1.5;
    else if (volume24h > 10000) volumeFactor = 1.2;
    
    const finalSize = baseSize * ageFactor * confidenceFactor * liquidityFactor * volumeFactor;
    return Math.min(finalSize, this.config.baseInvestment * 5); // Cap at 5x base
  }

  private async executeTrade(position: Position, type: 'BUY' | 'SELL', price: number, amount: number): Promise<Trade> {
    const trade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      position,
      type,
      price,
      amount,
      value: price * amount,
      timestamp: Date.now(),
      fees: 0.002, // 0.2% fees
      slippage: 0.001, // 0.1% slippage
      success: true,
      error: undefined
    };

    // Simulate execution
    const totalCost = trade.value * (1 + trade.fees + trade.slippage);
    
    if (type === 'BUY') {
      if (this.portfolio.balance.sol >= totalCost) {
        this.portfolio.balance.sol -= totalCost;
        this.portfolio.activePositions++;
        this.portfolio.totalPositions++;
      } else {
        trade.success = false;
        trade.error = 'Insufficient balance';
      }
    } else {
      const totalReceived = trade.value * (1 - trade.fees - trade.slippage);
      this.portfolio.balance.sol += totalReceived;
      this.portfolio.activePositions--;
      
      // Update position
      position.status = 'CLOSED';
      position.exitPrice = price;
      position.exitTimestamp = Date.now();
      position.pnl = totalReceived - position.value;
      position.pnlPercent = (position.pnl / position.value) * 100;
      position.holdTime = Date.now() - position.timestamp;
    }

    this.trades.push(trade);
    this.portfolio.recentTrades = this.trades.slice(-50); // Keep last 50 trades
    
    this.emit('tradeExecuted', trade);
    return trade;
  }

  private startPositionMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.monitorPositions();
    }, 5000); // Check every 5 seconds
  }

  private async monitorPositions(): Promise<void> {
    const now = Date.now();
    const positionsToClose: Position[] = [];

    for (const [address, position] of this.positions) {
      if (position.status !== 'ACTIVE') continue;

      const currentPrice = this.currentPricingStrategy.getCurrentPrice(position.token);
      const holdTime = now - position.timestamp;
      const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      // Check exit conditions
      const shouldExit = this.shouldExitPosition(position, currentPrice, holdTime, pnlPercent);
      
      if (shouldExit.exit) {
        position.exitReason = shouldExit.reason;
        positionsToClose.push(position);
      }
    }

    // Close positions that should be exited
    for (const position of positionsToClose) {
      await this.closePosition(position);
    }
  }

  private shouldExitPosition(position: Position, currentPrice: number, holdTime: number, pnlPercent: number): { exit: boolean; reason?: string } {
    // Max hold time
    if (holdTime > this.config.maxHoldTime) {
      return { exit: true, reason: 'Max hold time reached' };
    }

    // Stop loss
    if (pnlPercent <= this.config.stopLossPercent) {
      return { exit: true, reason: 'Stop loss triggered' };
    }

    // Take profit strategies
    if (pnlPercent >= 500) {
      return { exit: true, reason: 'Take profit 500%+' };
    }

    if (pnlPercent >= 200) {
      return { exit: true, reason: 'Take profit 200%+' };
    }

    if (pnlPercent >= this.config.takeProfitPercent) {
      return { exit: true, reason: 'Take profit target reached' };
    }

    return { exit: false };
  }

  private async closePosition(position: Position): Promise<void> {
    try {
      const currentPrice = this.currentPricingStrategy.getCurrentPrice(position.token);
      const sellTrade = await this.executeTrade(position, 'SELL', currentPrice, position.amount);
      
      if (sellTrade.success) {
        this.positions.delete(position.token.address);
        this.updatePortfolio();
        
        logger.info(`📉 Closed position: ${position.token.symbol}`, {
          pnl: position.pnl,
          pnlPercent: position.pnlPercent,
          holdTime: position.holdTime,
          reason: position.exitReason
        });
        
        this.emit('positionClosed', position);
      }
    } catch (error) {
      logger.error('Error closing position:', error);
    }
  }

  private updatePortfolio(): void {
    const activePositions = Array.from(this.positions.values()).filter(p => p.status === 'ACTIVE');
    const closedPositions = this.trades.filter(t => t.type === 'SELL' && t.success);
    
    // Calculate total value
    let totalPositionValue = 0;
    for (const position of activePositions) {
      const currentPrice = this.currentPricingStrategy.getCurrentPrice(position.token);
      totalPositionValue += position.amount * currentPrice;
    }
    
    this.portfolio.totalValue = this.portfolio.balance.sol + totalPositionValue;
    this.portfolio.activePositions = activePositions.length;
    this.portfolio.positions = activePositions;
    
    // Calculate P&L
    this.portfolio.totalPnL = this.portfolio.totalValue - this.config.startingBalance;
    this.portfolio.totalPnLPercent = (this.portfolio.totalPnL / this.config.startingBalance) * 100;
    
    // Calculate win rate
    if (closedPositions.length > 0) {
      const winningTrades = closedPositions.filter(t => t.position.pnl && t.position.pnl > 0);
      this.portfolio.winRate = (winningTrades.length / closedPositions.length) * 100;
    }
    
    // Calculate average hold time
    if (closedPositions.length > 0) {
      const totalHoldTime = closedPositions.reduce((sum, t) => sum + (t.position.holdTime || 0), 0);
      this.portfolio.avgHoldTime = totalHoldTime / closedPositions.length;
    }
    
    this.emit('portfolioUpdated', this.portfolio);
  }

  // Public API methods
  getPortfolio(): Portfolio {
    return { ...this.portfolio };
  }

  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getRecentTrades(limit: number = 50): Trade[] {
    return this.trades.slice(-limit);
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      mode: this.config.mode,
      activePositions: this.positions.size,
      totalTrades: this.trades.length,
      totalValue: this.portfolio.totalValue,
      totalPnL: this.portfolio.totalPnL,
      winRate: this.portfolio.winRate
    };
  }

  setPricingStrategy(strategyName: string): void {
    const strategy = this.pricingStrategies.get(strategyName);
    if (strategy) {
      this.currentPricingStrategy = strategy;
      logger.info(`Pricing strategy changed to: ${strategyName}`);
    }
  }
}

/**
 * Pricing Strategy Interface
 */
interface PricingStrategy {
  getEntryPrice(token: UnifiedTokenInfo): number;
  getCurrentPrice(token: UnifiedTokenInfo): number;
}

/**
 * Simulation Pricing Strategy
 * Generates realistic price movements for educational purposes
 */
class SimulationPricingStrategy implements PricingStrategy {
  private priceHistory: Map<string, number[]> = new Map();

  getEntryPrice(token: UnifiedTokenInfo): number {
    const basePrice = token.priceUsd || 0.000001;
    const history = [basePrice];
    this.priceHistory.set(token.address, history);
    return basePrice;
  }

  getCurrentPrice(token: UnifiedTokenInfo): number {
    const history = this.priceHistory.get(token.address) || [0.000001];
    const lastPrice = history[history.length - 1];
    
    // Generate realistic price movement
    const volatility = 0.05; // 5% volatility
    const trend = Math.random() - 0.4; // Slight upward bias
    const change = trend * volatility;
    const newPrice = lastPrice * (1 + change);
    
    history.push(newPrice);
    
    // Keep only last 100 prices
    if (history.length > 100) {
      history.shift();
    }
    
    return Math.max(newPrice, 0.000000001); // Prevent negative prices
  }
}

/**
 * Realistic Pricing Strategy
 * Uses actual market data when available
 */
class RealisticPricingStrategy implements PricingStrategy {
  getEntryPrice(token: UnifiedTokenInfo): number {
    return token.priceUsd || 0.000001;
  }

  getCurrentPrice(token: UnifiedTokenInfo): number {
    // In a real implementation, this would fetch current price from DexScreener
    // For now, simulate realistic price movements
    const basePrice = token.priceUsd || 0.000001;
    const timeElapsed = Date.now() - token.detectedAt;
    const hoursPassed = timeElapsed / (1000 * 60 * 60);
    
    // Simulate price decay over time with some pumps
    const decay = Math.exp(-hoursPassed / 24); // 24-hour half-life
    const pumpChance = Math.random();
    const pumpMultiplier = pumpChance < 0.1 ? (2 + Math.random() * 3) : (0.8 + Math.random() * 0.4);
    
    return basePrice * decay * pumpMultiplier;
  }
}

/**
 * Conservative Pricing Strategy
 * More conservative price movements
 */
class ConservativePricingStrategy implements PricingStrategy {
  getEntryPrice(token: UnifiedTokenInfo): number {
    return token.priceUsd || 0.000001;
  }

  getCurrentPrice(token: UnifiedTokenInfo): number {
    const basePrice = token.priceUsd || 0.000001;
    const timeElapsed = Date.now() - token.detectedAt;
    const hoursPassed = timeElapsed / (1000 * 60 * 60);
    
    // Conservative movements with gradual decay
    const decay = Math.exp(-hoursPassed / 48); // 48-hour half-life
    const movement = 0.9 + Math.random() * 0.2; // -10% to +10%
    
    return basePrice * decay * movement;
  }
}

/**
 * Risk Manager
 * Handles risk assessment and position sizing
 */
class RiskManager {
  private config: SimulationConfig;

  constructor(config: SimulationConfig) {
    this.config = config;
  }

  shouldEnterPosition(token: UnifiedTokenInfo, portfolio: Portfolio): boolean {
    // Check portfolio limits
    if (portfolio.activePositions >= this.config.maxPositions) {
      return false;
    }

    // Check available balance
    const minBalance = this.config.baseInvestment * 2; // Keep 2x base investment as reserve
    if (portfolio.balance.sol < minBalance) {
      return false;
    }

    // Check max drawdown
    if (portfolio.totalPnLPercent < -50) { // Max 50% drawdown
      return false;
    }

    return true;
  }
}