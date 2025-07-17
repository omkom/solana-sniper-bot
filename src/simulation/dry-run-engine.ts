import { EventEmitter } from 'events';
import { TokenInfo, SecurityAnalysis, SimulatedPosition, SimulatedTrade, AnalysisConfig } from '../types';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';
import { Config } from '../core/config';

export class DryRunEngine extends EventEmitter implements EventEmittingSimulationEngine {
  private config: AnalysisConfig;
  private positions: Map<string, SimulatedPosition> = new Map();
  private trades: SimulatedTrade[] = [];
  private portfolio = {
    startingBalance: 10, // 10 SOL starting balance for simulation
    currentBalance: 10,
    totalInvested: 0,
    totalRealized: 0,
    unrealizedPnL: 0
  };

  constructor() {
    super();
    this.config = Config.getInstance().getConfig();
    console.log('🎮 Dry Run Engine initialized');
    console.log('💰 Starting with simulated balance: 10 SOL');
  }

  async processTokenDetection(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void> {
    console.log(`\n📊 Processing token: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`🔒 Security score: ${securityAnalysis.score}/100`);

    // Check if we should simulate a buy
    const shouldBuy = this.shouldSimulateBuy(tokenInfo, securityAnalysis);
    
    if (shouldBuy) {
      await this.simulateBuy(tokenInfo, securityAnalysis.score);
    } else {
      console.log(`❌ Skipping token: ${this.getSkipReason(tokenInfo, securityAnalysis)}`);
    }

    this.updatePortfolioMetrics();
    this.emit('portfolioUpdate', this.getPortfolioStats());
  }

  private shouldSimulateBuy(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): boolean {
    // Check security score
    if (securityAnalysis.score < this.config.minConfidenceScore) {
      return false;
    }

    // Check if we have too many positions
    if (this.positions.size >= this.config.maxSimulatedPositions) {
      return false;
    }

    // Check if we have enough balance
    if (this.portfolio.currentBalance < this.config.simulatedInvestment) {
      return false;
    }

    // Check token age
    const ageMs = Date.now() - tokenInfo.createdAt;
    if (ageMs > this.config.maxAnalysisAge) {
      return false;
    }

    // Simulate random market conditions (for educational variety)
    const marketCondition = Math.random();
    if (marketCondition < 0.2) { // 20% chance to skip due to "market conditions"
      return false;
    }

    return true;
  }

  private getSkipReason(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): string {
    if (securityAnalysis.score < this.config.minConfidenceScore) {
      return `Low security score (${securityAnalysis.score} < ${this.config.minConfidenceScore})`;
    }

    if (this.positions.size >= this.config.maxSimulatedPositions) {
      return `Max positions reached (${this.positions.size}/${this.config.maxSimulatedPositions})`;
    }

    if (this.portfolio.currentBalance < this.config.simulatedInvestment) {
      return `Insufficient balance (${this.portfolio.currentBalance.toFixed(3)} SOL)`;
    }

    const ageMs = Date.now() - tokenInfo.createdAt;
    if (ageMs > this.config.maxAnalysisAge) {
      return `Token too old (${Math.round(ageMs / 1000)}s > ${this.config.maxAnalysisAge / 1000}s)`;
    }

    return 'Market conditions unfavorable';
  }

  private async simulateBuy(tokenInfo: TokenInfo, securityScore: number): Promise<void> {
    const positionId = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate position size based on security score
    let positionSize = this.config.simulatedInvestment;
    if (securityScore >= 90) {
      positionSize *= 1.5; // Increase position size for high-confidence tokens
    } else if (securityScore >= 80) {
      positionSize *= 1.2;
    }

    // Ensure we don't exceed available balance
    positionSize = Math.min(positionSize, this.portfolio.currentBalance);

    // Simulate entry price (random for demo)
    const entryPrice = Math.random() * 0.001 + 0.0001; // Random price between 0.0001-0.0011

    const position: SimulatedPosition = {
      id: positionId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      entryTime: Date.now(),
      simulatedInvestment: positionSize,
      entryPrice: entryPrice,
      status: 'ACTIVE'
    };

    const trade: SimulatedTrade = {
      id: tradeId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      type: 'BUY',
      timestamp: Date.now(),
      price: entryPrice,
      amount: positionSize,
      reason: `Security score: ${securityScore}`,
      simulation: true
    };

    // Update portfolio
    this.portfolio.currentBalance -= positionSize;
    this.portfolio.totalInvested += positionSize;

    // Store position and trade
    this.positions.set(positionId, position);
    this.trades.push(trade);

    console.log(`✅ Simulated BUY: ${position.symbol}`);
    console.log(`💰 Amount: ${positionSize.toFixed(4)} SOL at $${entryPrice.toFixed(6)}`);
    console.log(`📊 Confidence: ${securityScore}/100`);

    this.emit('trade', trade);
    this.emit('positionOpened', position);

    // Start monitoring this position for exit conditions
    this.monitorPosition(positionId);
  }

  private monitorPosition(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position) return;

    // Simulate price movements and exit conditions
    const monitoringInterval = setInterval(() => {
      if (!this.positions.has(positionId)) {
        clearInterval(monitoringInterval);
        return;
      }

      this.updatePositionPrice(positionId);
      this.checkExitConditions(positionId);
    }, 5000); // Check every 5 seconds

    // Auto-close position after max time (for demo purposes)
    setTimeout(() => {
      if (this.positions.has(positionId)) {
        this.simulateSell(positionId, 'Time limit reached');
      }
      clearInterval(monitoringInterval);
    }, 120000); // Close after 2 minutes max
  }

  private updatePositionPrice(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE') return;

    // Simulate price movement (random walk with slight upward bias for demo)
    const volatility = 0.05; // 5% volatility
    const bias = 0.001; // Slight upward bias
    const change = (Math.random() - 0.5) * volatility + bias;
    
    const currentPrice = position.currentPrice || position.entryPrice;
    position.currentPrice = Math.max(0.0001, currentPrice * (1 + change));

    // Calculate ROI
    position.roi = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;

    this.positions.set(positionId, position);
  }

  private checkExitConditions(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE' || !position.roi) return;

    let shouldExit = false;
    let exitReason = '';

    // Stop loss at -20%
    if (position.roi <= -20) {
      shouldExit = true;
      exitReason = 'Stop loss triggered (-20%)';
    }
    // Take profit at +50% (for demo)
    else if (position.roi >= 50) {
      shouldExit = true;
      exitReason = `Take profit triggered (+${position.roi.toFixed(1)}%)`;
    }
    // Random exit for demo variety
    else if (Math.random() < 0.01) { // 1% chance per check
      shouldExit = true;
      exitReason = 'Random exit (demo)';
    }

    if (shouldExit) {
      this.simulateSell(positionId, exitReason);
    }
  }

  private simulateSell(positionId: string, reason: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE') return;

    const currentPrice = position.currentPrice || position.entryPrice;
    const roi = position.roi || 0;
    const exitValue = position.simulatedInvestment * (1 + roi / 100);

    // Close position
    position.status = 'CLOSED';
    position.reason = reason;
    position.roi = roi;

    // Create sell trade
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sellTrade: SimulatedTrade = {
      id: tradeId,
      mint: position.mint,
      symbol: position.symbol,
      type: 'SELL',
      timestamp: Date.now(),
      price: currentPrice,
      amount: exitValue,
      reason: reason,
      simulation: true
    };

    // Update portfolio
    this.portfolio.currentBalance += exitValue;
    this.portfolio.totalRealized += (exitValue - position.simulatedInvestment);
    this.portfolio.totalInvested -= position.simulatedInvestment;

    this.trades.push(sellTrade);
    this.positions.set(positionId, position);

    const profitLoss = exitValue - position.simulatedInvestment;
    const profitLossText = profitLoss >= 0 ? `+${profitLoss.toFixed(4)}` : profitLoss.toFixed(4);

    console.log(`🔄 Simulated SELL: ${position.symbol}`);
    console.log(`💰 Exit: ${exitValue.toFixed(4)} SOL (${profitLossText} SOL, ${roi.toFixed(1)}%)`);
    console.log(`📝 Reason: ${reason}`);

    this.emit('trade', sellTrade);
    this.emit('positionClosed', position);
  }

  private updatePortfolioMetrics(): void {
    // Calculate unrealized PnL
    let unrealizedPnL = 0;
    for (const position of this.positions.values()) {
      if (position.status === 'ACTIVE' && position.roi !== undefined) {
        const currentValue = position.simulatedInvestment * (1 + position.roi / 100);
        unrealizedPnL += (currentValue - position.simulatedInvestment);
      }
    }

    this.portfolio.unrealizedPnL = unrealizedPnL;
  }

  getPortfolioStats() {
    const activePositions = Array.from(this.positions.values()).filter(p => p.status === 'ACTIVE').length;
    const closedPositions = Array.from(this.positions.values()).filter(p => p.status === 'CLOSED');
    
    const totalPortfolioValue = this.portfolio.currentBalance + this.portfolio.totalInvested + this.portfolio.unrealizedPnL;
    const totalROI = ((totalPortfolioValue - this.portfolio.startingBalance) / this.portfolio.startingBalance) * 100;

    const winningTrades = closedPositions.filter(p => (p.roi || 0) > 0).length;
    const winRate = closedPositions.length > 0 ? (winningTrades / closedPositions.length) * 100 : 0;

    return {
      currentBalance: this.portfolio.currentBalance,
      totalInvested: this.portfolio.totalInvested,
      unrealizedPnL: this.portfolio.unrealizedPnL,
      totalRealized: this.portfolio.totalRealized,
      totalPortfolioValue,
      totalROI,
      activePositions,
      closedPositions: closedPositions.length,
      totalTrades: this.trades.length,
      winRate,
      startingBalance: this.portfolio.startingBalance
    };
  }

  getActivePositions(): SimulatedPosition[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'ACTIVE');
  }

  getRecentTrades(limit: number = 10): SimulatedTrade[] {
    return this.trades.slice(-limit).reverse();
  }

  getPositions(): SimulatedPosition[] {
    return Array.from(this.positions.values());
  }
}