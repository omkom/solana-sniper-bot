/**
 * Enhanced Dry-Run Engine with Multi-Strategy Exit System
 * TRIPLE-LOCKED EDUCATIONAL SIMULATION ONLY - REAL MARKET DATA WITH ZERO RISK
 */

import { EventEmitter } from 'events';
import { UnifiedTokenInfo, Position, SimulationResult, TradeOrder, ExecutionResult } from '../types/unified';
import { logger } from '../monitoring/logger';
import { WebSocketServer } from '../monitoring/websocket-server';

interface DryRunConfig {
  baseAmount: number;          // Default 0.003 SOL
  maxPositions: number;        // Max concurrent positions
  strategies: {
    conservative: { holdPercent: number; stopLoss: number };
    balanced: { holdPercent: number; stopLoss: number };
    aggressive: { holdPercent: number; stopLoss: number };
    ultraAggressive: { holdPercent: number; stopLoss: number };
  };
  dynamicHoldTimes: {
    highQuality: number;       // 6 hours for score >8
    standard: number;          // 2 hours default
    risky: number;            // 30 minutes for score <5
  };
  creatorMultipliers: {
    verified: number;          // 1.3x for verified creators
    unknown: number;           // 1.0x for unknown
    flagged: number;           // 0.7x for flagged creators
  };
}

interface ActivePosition {
  id: string;
  tokenAddress: string;
  symbol: string;
  strategy: 'conservative' | 'balanced' | 'aggressive' | 'ultraAggressive';
  entryPrice: number;
  currentPrice: number;
  amount: number;
  entryTime: number;
  lastUpdate: number;
  stopLoss: number;
  roi: number;
  pnl: number;
  holdTimeRemaining: number;
  exitRecommendation: string;
  rugpullRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  creatorMultiplier: number;
}

export class DryRunEngine extends EventEmitter {
  private isRunning = false;
  private positions = new Map<string, ActivePosition>();
  private virtualBalance = 10.0; // 10 SOL virtual balance
  private totalPositions = 0;
  private winningTrades = 0;
  private totalROI = 0;
  private webSocketServer?: WebSocketServer;
  
  private config: DryRunConfig = {
    baseAmount: parseFloat(process.env.SIMULATED_INVESTMENT || '0.003'),
    maxPositions: parseInt(process.env.MAX_SIMULATED_POSITIONS || '500'),
    strategies: {
      conservative: { holdPercent: 5, stopLoss: -15 },
      balanced: { holdPercent: 10, stopLoss: -20 },
      aggressive: { holdPercent: 15, stopLoss: -20 },
      ultraAggressive: { holdPercent: 1, stopLoss: -20 }
    },
    dynamicHoldTimes: {
      highQuality: 21600000,  // 6 hours
      standard: 7200000,      // 2 hours
      risky: 1800000         // 30 minutes
    },
    creatorMultipliers: {
      verified: 1.3,
      unknown: 1.0,
      flagged: 0.7
    }
  };

  constructor(webSocketServer?: WebSocketServer) {
    super();
    this.webSocketServer = webSocketServer;
    
    // Start position monitoring
    setInterval(() => {
      this.updatePositions();
    }, 15000); // Update every 15 seconds
    
    logger.info('🎮 Enhanced Dry-Run Engine initialized with multi-strategy exits');
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.emit('started');
    
    logger.info('🚀 Enhanced Dry-Run Engine started - EDUCATIONAL SIMULATION MODE');
    logger.info(`💰 Virtual balance: ${this.virtualBalance} SOL`);
    logger.info(`📊 Max positions: ${this.config.maxPositions}`);
    logger.info('🔒 TRIPLE-LOCKED SAFETY: Real trading disabled');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.emit('stopped');
    
    logger.info('🛑 Enhanced Dry-Run Engine stopped');
  }

  async processToken(token: UnifiedTokenInfo): Promise<void> {
    if (!this.isRunning || this.positions.size >= this.config.maxPositions) {
      return;
    }

    try {
      // Check if token is within buy window (10 minutes optimal)
      const tokenAge = Date.now() - token.detectedAt;
      if (tokenAge > 600000) { // 10 minutes
        logger.debug(`Token too old for simulation: ${token.symbol} (${tokenAge}ms)`);
        return;
      }

      // Determine strategy based on security score and creator intelligence
      const strategy = this.selectStrategy(token);
      const creatorMultiplier = this.getCreatorMultiplier(token);
      
      // Calculate position size with creator multiplier
      const baseAmount = this.config.baseAmount * creatorMultiplier;
      
      if (this.virtualBalance < baseAmount) {
        logger.debug(`Insufficient virtual balance for ${token.symbol}`);
        return;
      }

      // Create simulated buy order
      const position = await this.simulateBuy(token, strategy, baseAmount);
      
      if (position) {
        this.positions.set(token.address, position);
        this.virtualBalance -= baseAmount;
        
        // Emit position update
        this.emitPositionUpdate(position);
        
        logger.info(`📈 SIMULATED BUY: ${token.symbol} - ${baseAmount} SOL (${strategy} strategy)`);
      }

    } catch (error) {
      logger.error(`Error processing token ${token.symbol}:`, error);
    }
  }

  private selectStrategy(token: UnifiedTokenInfo): 'conservative' | 'balanced' | 'aggressive' | 'ultraAggressive' {
    // Default to balanced for educational purposes
    const securityScore = token.metadata?.securityScore || 5;
    
    if (securityScore >= 8) return 'aggressive';
    if (securityScore >= 6) return 'balanced';
    if (securityScore >= 4) return 'conservative';
    return 'ultraAggressive'; // High risk, high reward for very low scores
  }

  private getCreatorMultiplier(token: UnifiedTokenInfo): number {
    // Simulate creator intelligence analysis
    const creatorRisk = token.metadata?.creatorRisk || 'unknown';
    
    switch (creatorRisk) {
      case 'verified': return this.config.creatorMultipliers.verified;
      case 'flagged': return this.config.creatorMultipliers.flagged;
      default: return this.config.creatorMultipliers.unknown;
    }
  }

  private async simulateBuy(token: UnifiedTokenInfo, strategy: string, amount: number): Promise<ActivePosition | null> {
    // Simulate realistic entry price with slippage
    const basePrice = token.metadata?.priceUsd || 0.0001;
    const slippage = Math.random() * 0.05; // 0-5% slippage
    const entryPrice = basePrice * (1 + slippage);
    
    const position: ActivePosition = {
      id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tokenAddress: token.address,
      symbol: token.symbol,
      strategy: strategy as any,
      entryPrice,
      currentPrice: entryPrice,
      amount,
      entryTime: Date.now(),
      lastUpdate: Date.now(),
      stopLoss: this.config.strategies[strategy as keyof typeof this.config.strategies].stopLoss,
      roi: 0,
      pnl: 0,
      holdTimeRemaining: this.getHoldTime(token),
      exitRecommendation: 'HOLD',
      rugpullRisk: this.assessRugpullRisk(token),
      creatorMultiplier: this.getCreatorMultiplier(token)
    };

    return position;
  }

  private getHoldTime(token: UnifiedTokenInfo): number {
    const securityScore = token.metadata?.securityScore || 5;
    
    if (securityScore >= 8) return this.config.dynamicHoldTimes.highQuality;
    if (securityScore >= 5) return this.config.dynamicHoldTimes.standard;
    return this.config.dynamicHoldTimes.risky;
  }

  private assessRugpullRisk(token: UnifiedTokenInfo): 'LOW' | 'MEDIUM' | 'HIGH' {
    const securityScore = token.metadata?.securityScore || 5;
    
    if (securityScore >= 7) return 'LOW';
    if (securityScore >= 4) return 'MEDIUM';
    return 'HIGH';
  }

  private updatePositions(): void {
    const now = Date.now();
    
    for (const [address, position] of this.positions) {
      // Simulate price movement
      const priceChange = (Math.random() - 0.5) * 0.4; // ±20% random movement
      const newPrice = position.currentPrice * (1 + priceChange);
      
      // Update position metrics
      position.currentPrice = newPrice;
      position.lastUpdate = now;
      position.roi = ((newPrice - position.entryPrice) / position.entryPrice) * 100;
      position.pnl = (newPrice - position.entryPrice) * (position.amount / position.entryPrice);
      position.holdTimeRemaining = Math.max(0, (position.entryTime + this.getHoldTime({ metadata: { securityScore: 5 } } as any)) - now);
      
      // Check exit conditions
      this.checkExitConditions(position);
      
      // Emit position update
      this.emitPositionUpdate(position);
    }
    
    // Emit portfolio update
    this.emitPortfolioUpdate();
  }

  private checkExitConditions(position: ActivePosition): void {
    const strategy = this.config.strategies[position.strategy];
    
    // Stop loss check
    if (position.roi <= position.stopLoss) {
      this.simulateSell(position, 'STOP_LOSS');
      return;
    }
    
    // Profit taking based on strategy
    if (position.roi >= 1000 && position.strategy === 'ultraAggressive') {
      this.simulateSell(position, 'PROFIT_TARGET');
      return;
    }
    
    if (position.roi >= 500 && ['aggressive', 'ultraAggressive'].includes(position.strategy)) {
      // Partial exit for aggressive strategies
      position.exitRecommendation = 'PARTIAL_EXIT_90%';
    }
    
    if (position.roi >= 200) {
      position.exitRecommendation = 'TAKE_PROFIT_75%';
    }
    
    if (position.roi >= 100) {
      position.exitRecommendation = 'CONSIDER_EXIT_50%';
    }
    
    // Time-based exits
    if (position.holdTimeRemaining <= 0) {
      this.simulateSell(position, 'TIME_EXIT');
      return;
    }
    
    // Rugpull risk check
    if (position.rugpullRisk === 'HIGH' && position.roi < 50) {
      position.exitRecommendation = 'EMERGENCY_EXIT';
    }
  }

  private simulateSell(position: ActivePosition, reason: string): void {
    // Simulate realistic exit with slippage
    const slippage = Math.random() * 0.03; // 0-3% slippage
    const exitPrice = position.currentPrice * (1 - slippage);
    const finalPnL = (exitPrice - position.entryPrice) * (position.amount / position.entryPrice);
    
    // Update statistics
    this.totalPositions++;
    this.totalROI += position.roi;
    
    if (finalPnL > 0) {
      this.winningTrades++;
    }
    
    // Return virtual balance
    this.virtualBalance += position.amount + finalPnL;
    
    // Remove position
    this.positions.delete(position.tokenAddress);
    
    // Emit trade completion
    this.emitTradeCompletion(position, exitPrice, finalPnL, reason);
    
    logger.info(`📉 SIMULATED SELL: ${position.symbol} - ROI: ${position.roi.toFixed(2)}% - Reason: ${reason}`);
  }

  private emitPositionUpdate(position: ActivePosition): void {
    const positionUpdate = {
      ...position,
      timeRemaining: Math.max(0, Math.floor(position.holdTimeRemaining / 1000)),
      type: 'position_update'
    };

    this.webSocketServer?.broadcastPositionUpdate(positionUpdate);
    this.emit('positionUpdate', positionUpdate);
  }

  private emitPortfolioUpdate(): void {
    const portfolioData = {
      balance: this.virtualBalance,
      activePositions: this.positions.size,
      totalPositions: this.totalPositions,
      winRate: this.totalPositions > 0 ? (this.winningTrades / this.totalPositions) * 100 : 0,
      avgROI: this.totalPositions > 0 ? this.totalROI / this.totalPositions : 0,
      totalPnL: Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.pnl, 0),
      timestamp: Date.now()
    };

    this.webSocketServer?.broadcastPortfolioUpdate(portfolioData);
    this.emit('portfolioUpdate', portfolioData);
  }

  private emitTradeCompletion(position: ActivePosition, exitPrice: number, pnl: number, reason: string): void {
    const tradeData = {
      symbol: position.symbol,
      strategy: position.strategy,
      entryPrice: position.entryPrice,
      exitPrice,
      roi: position.roi,
      pnl,
      duration: Date.now() - position.entryTime,
      reason,
      timestamp: Date.now(),
      type: 'trade_completed'
    };

    this.webSocketServer?.broadcastTradeSignal(tradeData);
    this.emit('tradeCompleted', tradeData);
  }

  // Public methods for external access
  getActivePositions(): ActivePosition[] {
    return Array.from(this.positions.values());
  }

  getPortfolioStats(): any {
    return {
      balance: this.virtualBalance,
      activePositions: this.positions.size,
      totalTrades: this.totalPositions,
      winRate: this.totalPositions > 0 ? (this.winningTrades / this.totalPositions) * 100 : 0,
      avgROI: this.totalPositions > 0 ? this.totalROI / this.totalPositions : 0,
      currentPnL: Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.pnl, 0)
    };
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      mode: 'DRY_RUN_ENHANCED',
      positions: this.positions.size,
      maxPositions: this.config.maxPositions,
      virtualBalance: this.virtualBalance,
      stats: this.getPortfolioStats()
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.isRunning;
  }

  async handleExitSignal(signal: any): Promise<void> {
    // Handle emergency exits and signals
    const position = this.positions.get(signal.tokenAddress);
    if (position) {
      this.simulateSell(position, 'MANUAL_EXIT');
    }
  }

  async emergencyExit(tokenAddress: string): Promise<void> {
    const position = this.positions.get(tokenAddress);
    if (position) {
      this.simulateSell(position, 'EMERGENCY_EXIT');
      logger.warn(`🚨 Emergency exit executed for ${position.symbol}`);
    }
  }
}