/**
 * Consolidated Simulation Engine
 * Merges functionality from all simulation engines into a single, well-structured class
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { UnifiedTokenInfo } from '../types/unified';
import { Config } from '../core/config';

export interface SimulationConfig {
  mode: 'DRY_RUN' | 'PAPER_TRADING' | 'ANALYSIS';
  startingBalance: number;
  baseInvestment: number;
  maxPositions: number;
  minConfidenceScore: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxHoldTime: number;
  enableStopLoss: boolean;
  enableTakeProfit: boolean;
  riskManagement: {
    maxPositionSize: number;
    maxDailyLoss: number;
    maxDrawdown: number;
  };
}

export interface SimulationPosition {
  id: string;
  token: UnifiedTokenInfo;
  entryPrice: number;
  entryTime: number;
  amount: number;
  solAmount: number;
  currentPrice: number;
  unrealizedPnL: number;
  percentageChange: number;
  stopLoss?: number;
  takeProfit?: number;
  strategy: string;
  confidence: number;
}

export interface SimulationTrade {
  id: string;
  token: UnifiedTokenInfo;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  entryTime: number;
  exitTime?: number;
  amount: number;
  solAmount: number;
  realizedPnL: number;
  percentageChange: number;
  reason: string;
  strategy: string;
  confidence: number;
}

export interface Portfolio {
  balance: number;
  totalInvested: number;
  totalRealized: number;
  unrealizedPnL: number;
  netPnL: number;
  totalValue: number;
}

export interface SimulationStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  totalReturn: number;
  roi: number;
}

export class ConsolidatedSimulationEngine extends EventEmitter {
  private config: SimulationConfig;
  private portfolio: Portfolio;
  private positions: Map<string, SimulationPosition> = new Map();
  private trades: SimulationTrade[] = [];
  private isRunning = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private priceHistory: Map<string, { price: number; timestamp: number }[]> = new Map();
  
  constructor(config: Partial<SimulationConfig> = {}) {
    super();
    
    const defaultConfig: SimulationConfig = {
      mode: 'DRY_RUN',
      startingBalance: 10,
      baseInvestment: 0.003,
      maxPositions: 500,
      minConfidenceScore: 5,
      stopLossPercent: -30,
      takeProfitPercent: 100,
      maxHoldTime: 7200000, // 2 hours
      enableStopLoss: true,
      enableTakeProfit: true,
      riskManagement: {
        maxPositionSize: 0.1,
        maxDailyLoss: 0.05,
        maxDrawdown: 0.2
      }
    };
    
    this.config = { ...defaultConfig, ...config };
    
    this.portfolio = {
      balance: this.config.startingBalance,
      totalInvested: 0,
      totalRealized: 0,
      unrealizedPnL: 0,
      netPnL: 0,
      totalValue: this.config.startingBalance
    };
    
    logger.info('🎮 Consolidated Simulation Engine initialized', {
      mode: this.config.mode,
      startingBalance: this.config.startingBalance
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Simulation engine already running');
      return;
    }
    
    this.isRunning = true;
    this.startMonitoring();
    
    this.emit('started');
    logger.info('🚀 Simulation engine started');
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
    
    // Close all positions
    await this.closeAllPositions('ENGINE_STOP');
    
    this.emit('stopped');
    logger.info('🛑 Simulation engine stopped');
  }

  isEngineRunning(): boolean {
    return this.isRunning;
  }

  async analyzeToken(token: UnifiedTokenInfo): Promise<{
    confidence: number;
    recommendation: 'BUY' | 'HOLD' | 'SELL';
    reason: string;
  }> {
    // Calculate confidence score based on token properties
    let confidence = 0;
    let reason = '';
    
    // Age factor (newer tokens get higher confidence)
    const age = Date.now() - token.detectedAt;
    if (age < 300000) { // 5 minutes
      confidence += 30;
    } else if (age < 900000) { // 15 minutes
      confidence += 20;
    } else if (age < 1800000) { // 30 minutes
      confidence += 10;
    }
    
    // Liquidity factor
    const liquidity = token.liquidity?.usd || 0;
    if (liquidity > 50000) {
      confidence += 25;
    } else if (liquidity > 10000) {
      confidence += 15;
    } else if (liquidity > 5000) {
      confidence += 10;
    }
    
    // Source factor
    if (token.source === 'pump.fun') {
      confidence += 20;
    } else if (token.source === 'raydium') {
      confidence += 15;
    } else {
      confidence += 10;
    }
    
    // Volume factor (if available)
    if (token.metadata?.volume24h) {
      const volume = token.metadata.volume24h;
      if (volume > 100000) {
        confidence += 15;
      } else if (volume > 50000) {
        confidence += 10;
      } else if (volume > 10000) {
        confidence += 5;
      }
    }
    
    // Determine recommendation
    let recommendation: 'BUY' | 'HOLD' | 'SELL' = 'HOLD';
    
    if (confidence >= this.config.minConfidenceScore) {
      if (this.canOpenPosition(token)) {
        recommendation = 'BUY';
        reason = `High confidence (${confidence}%) - favorable conditions`;
        
        // Try to open position
        await this.openPosition(token, confidence);
      } else {
        recommendation = 'HOLD';
        reason = `High confidence but cannot open position (max positions: ${this.config.maxPositions})`;
      }
    } else {
      recommendation = 'HOLD';
      reason = `Low confidence (${confidence}%) - below threshold of ${this.config.minConfidenceScore}%`;
    }
    
    return { confidence, recommendation, reason };
  }

  private canOpenPosition(token: UnifiedTokenInfo): boolean {
    // Check if we already have a position for this token
    if (this.positions.has(token.address)) {
      return false;
    }
    
    // Check max positions limit
    if (this.positions.size >= this.config.maxPositions) {
      return false;
    }
    
    // Check if we have enough balance
    if (this.portfolio.balance < this.config.baseInvestment) {
      return false;
    }
    
    return true;
  }

  private async openPosition(token: UnifiedTokenInfo, confidence: number): Promise<void> {
    const positionSize = this.calculatePositionSize(token, confidence);
    const entryPrice = this.getTokenPrice(token);
    
    if (entryPrice <= 0) {
      logger.warn(`Cannot open position for ${token.symbol} - invalid price`);
      return;
    }
    
    const position: SimulationPosition = {
      id: `${token.address}-${Date.now()}`,
      token,
      entryPrice,
      entryTime: Date.now(),
      amount: positionSize / entryPrice,
      solAmount: positionSize,
      currentPrice: entryPrice,
      unrealizedPnL: 0,
      percentageChange: 0,
      strategy: 'MOMENTUM',
      confidence,
      stopLoss: this.config.enableStopLoss ? 
        entryPrice * (1 + this.config.stopLossPercent / 100) : undefined,
      takeProfit: this.config.enableTakeProfit ? 
        entryPrice * (1 + this.config.takeProfitPercent / 100) : undefined
    };
    
    // Update portfolio
    this.portfolio.balance -= positionSize;
    this.portfolio.totalInvested += positionSize;
    
    // Add position
    this.positions.set(token.address, position);
    
    // Record trade
    const trade: SimulationTrade = {
      id: position.id,
      token,
      action: 'BUY',
      entryPrice,
      entryTime: Date.now(),
      amount: position.amount,
      solAmount: positionSize,
      realizedPnL: 0,
      percentageChange: 0,
      reason: 'MOMENTUM_BUY',
      strategy: 'MOMENTUM',
      confidence
    };
    
    this.trades.push(trade);
    
    this.emit('positionOpened', position);
    logger.info(`📈 Position opened: ${token.symbol} (${positionSize.toFixed(4)} SOL) at $${entryPrice.toFixed(8)}`);
  }

  private calculatePositionSize(token: UnifiedTokenInfo, confidence: number): number {
    let size = this.config.baseInvestment;
    
    // Age factor
    const age = Date.now() - token.detectedAt;
    if (age < 300000) { // 5 minutes
      size *= 3.0;
    } else if (age < 900000) { // 15 minutes
      size *= 2.0;
    } else if (age < 1800000) { // 30 minutes
      size *= 1.5;
    }
    
    // Confidence factor
    if (confidence >= 90) {
      size *= 2.5;
    } else if (confidence >= 80) {
      size *= 2.0;
    } else if (confidence >= 70) {
      size *= 1.5;
    }
    
    // Liquidity factor
    const liquidity = token.liquidity?.usd || 0;
    if (liquidity > 100000) {
      size *= 2.5;
    } else if (liquidity > 50000) {
      size *= 2.0;
    } else if (liquidity > 25000) {
      size *= 1.5;
    }
    
    // Ensure we don't exceed max position size
    const maxSize = this.portfolio.balance * this.config.riskManagement.maxPositionSize;
    size = Math.min(size, maxSize);
    
    // Ensure we don't exceed available balance
    size = Math.min(size, this.portfolio.balance);
    
    return size;
  }

  private getTokenPrice(token: UnifiedTokenInfo): number {
    // Try to get price from various sources
    return token.metadata?.priceUsd || 
           token.metadata?.price || 
           0.000001; // Default very small price for simulation
  }

  private async updatePositions(): Promise<void> {
    for (const [address, position] of this.positions) {
      const currentPrice = this.getTokenPrice(position.token);
      
      // Update position
      position.currentPrice = currentPrice;
      position.unrealizedPnL = (currentPrice - position.entryPrice) * position.amount;
      position.percentageChange = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      
      // Update price history
      this.updatePriceHistory(address, currentPrice);
      
      // Check exit conditions
      const shouldExit = this.shouldExitPosition(position);
      if (shouldExit.exit) {
        await this.closePosition(address, shouldExit.reason);
      }
      
      this.emit('positionUpdated', position);
    }
    
    // Update portfolio
    this.updatePortfolio();
  }

  private shouldExitPosition(position: SimulationPosition): { exit: boolean; reason: string } {
    // Check stop loss
    if (position.stopLoss && position.currentPrice <= position.stopLoss) {
      return { exit: true, reason: 'STOP_LOSS' };
    }
    
    // Check take profit
    if (position.takeProfit && position.currentPrice >= position.takeProfit) {
      return { exit: true, reason: 'TAKE_PROFIT' };
    }
    
    // Check max hold time
    const holdTime = Date.now() - position.entryTime;
    if (holdTime > this.config.maxHoldTime) {
      return { exit: true, reason: 'MAX_HOLD_TIME' };
    }
    
    // Advanced exit strategies based on percentage gains
    if (position.percentageChange >= 500) {
      return { exit: true, reason: 'EXTREME_PROFIT' };
    }
    
    if (position.percentageChange >= 200) {
      return { exit: true, reason: 'HIGH_PROFIT' };
    }
    
    if (position.percentageChange >= 100) {
      return { exit: true, reason: 'PROFIT_TAKING' };
    }
    
    return { exit: false, reason: '' };
  }

  private async closePosition(address: string, reason: string): Promise<void> {
    const position = this.positions.get(address);
    if (!position) {
      return;
    }
    
    const exitPrice = position.currentPrice;
    const exitTime = Date.now();
    const realizedPnL = position.unrealizedPnL;
    
    // Update portfolio
    this.portfolio.balance += position.solAmount + realizedPnL;
    this.portfolio.totalRealized += realizedPnL;
    
    // Update trade record
    const trade = this.trades.find(t => t.id === position.id);
    if (trade) {
      trade.exitPrice = exitPrice;
      trade.exitTime = exitTime;
      trade.realizedPnL = realizedPnL;
      trade.percentageChange = position.percentageChange;
      trade.reason = reason;
    }
    
    // Remove position
    this.positions.delete(address);
    
    this.emit('positionClosed', { position, realizedPnL, reason });
    logger.info(`📉 Position closed: ${position.token.symbol} - ${reason} - PnL: ${realizedPnL.toFixed(4)} SOL (${position.percentageChange.toFixed(2)}%)`);
  }

  private async closeAllPositions(reason: string): Promise<void> {
    const addresses = Array.from(this.positions.keys());
    for (const address of addresses) {
      await this.closePosition(address, reason);
    }
  }

  private updatePriceHistory(address: string, price: number): void {
    if (!this.priceHistory.has(address)) {
      this.priceHistory.set(address, []);
    }
    
    const history = this.priceHistory.get(address)!;
    history.push({ price, timestamp: Date.now() });
    
    // Keep only last 100 price points
    if (history.length > 100) {
      history.shift();
    }
  }

  private updatePortfolio(): void {
    let totalUnrealized = 0;
    
    for (const position of this.positions.values()) {
      totalUnrealized += position.unrealizedPnL;
    }
    
    this.portfolio.unrealizedPnL = totalUnrealized;
    this.portfolio.netPnL = this.portfolio.totalRealized + totalUnrealized;
    this.portfolio.totalValue = this.portfolio.balance + this.portfolio.totalInvested + this.portfolio.netPnL;
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }
      
      try {
        await this.updatePositions();
      } catch (error) {
        logger.error('Error updating positions:', error);
      }
    }, 30000); // Update every 30 seconds
  }

  // Public API methods
  getPositions(): SimulationPosition[] {
    return Array.from(this.positions.values());
  }

  getPortfolio(): Portfolio {
    return { ...this.portfolio };
  }

  getTrades(): SimulationTrade[] {
    return [...this.trades];
  }

  getStats(): SimulationStats {
    const trades = this.trades.filter(t => t.exitTime);
    const winningTrades = trades.filter(t => t.realizedPnL > 0);
    const losingTrades = trades.filter(t => t.realizedPnL < 0);
    
    const totalWins = winningTrades.reduce((sum, t) => sum + t.realizedPnL, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.realizedPnL, 0));
    
    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      averageWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      averageLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : 0,
      maxDrawdown: this.calculateMaxDrawdown(),
      sharpeRatio: this.calculateSharpeRatio(),
      totalReturn: this.portfolio.netPnL,
      roi: ((this.portfolio.totalValue - this.config.startingBalance) / this.config.startingBalance) * 100
    };
  }

  private calculateMaxDrawdown(): number {
    // Simplified max drawdown calculation
    let maxDrawdown = 0;
    let peak = this.config.startingBalance;
    
    for (const trade of this.trades) {
      if (trade.exitTime) {
        const currentValue = peak + trade.realizedPnL;
        if (currentValue > peak) {
          peak = currentValue;
        }
        const drawdown = (peak - currentValue) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }
    
    return maxDrawdown * 100;
  }

  private calculateSharpeRatio(): number {
    // Simplified Sharpe ratio calculation
    const trades = this.trades.filter(t => t.exitTime);
    if (trades.length === 0) return 0;
    
    const returns = trades.map(t => t.percentageChange / 100);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    if (returns.length < 2) return 0;
    
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    return stdDev > 0 ? avgReturn / stdDev : 0;
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      portfolio: this.portfolio,
      activePositions: this.positions.size,
      totalTrades: this.trades.length,
      config: this.config
    };
  }
}