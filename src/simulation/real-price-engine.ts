import { EventEmitter } from 'events';
import { TokenInfo, SecurityAnalysis, SimulatedPosition, SimulatedTrade, AnalysisConfig } from '../types';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';
import { RealTokenInfo } from '../types/dexscreener';
import { RealTokenMonitor } from '../detection/real-token-monitor';
import { Config } from '../core/config';
import { logger } from '../monitoring/logger';
import { PriceConverter } from '../utils/price-converter';
import { EnhancedTransactionWorkflows } from '../trading/enhanced-transaction-workflows';

export class RealPriceSimulationEngine extends EventEmitter implements EventEmittingSimulationEngine {
  private config: AnalysisConfig;
  private realTokenMonitor: RealTokenMonitor;
  private positions: Map<string, SimulatedPosition> = new Map();
  private trades: SimulatedTrade[] = [];
  private priceHistory: Map<string, Array<{price: number, timestamp: number}>> = new Map();
  private priceConverter: PriceConverter;
  private enhancedWorkflows: EnhancedTransactionWorkflows;
  
  private portfolio = {
    startingBalance: 1, // 1 SOL starting balance for simulation
    currentBalance: 1,
    totalInvested: 0,
    totalRealized: 0,
    unrealizedPnL: 0
  };

  constructor(realTokenMonitor: RealTokenMonitor) {
    super();
    this.config = Config.getInstance().getConfig();
    this.realTokenMonitor = realTokenMonitor;
    this.priceConverter = new PriceConverter();
    this.enhancedWorkflows = new EnhancedTransactionWorkflows();
    this.setupPriceUpdateListener();
    this.startPeriodicSummary();
    
    const portfolioValue = this.priceConverter.formatPortfolioValue(1);
    console.log('🎮 Real Price Simulation Engine initialized');
    console.log(`💰 Starting with simulated balance: ${portfolioValue.combined}`);
  }

  private setupPriceUpdateListener(): void {
    // Listen to real price updates from the monitor
    this.realTokenMonitor.on('priceUpdate', (priceData: any) => {
      this.handlePriceUpdate(priceData);
    });
  }

  private handlePriceUpdate(priceData: any): void {
    const { address, price, change, timestamp } = priceData;
    
    // Store price history
    if (!this.priceHistory.has(address)) {
      this.priceHistory.set(address, []);
    }
    
    const history = this.priceHistory.get(address)!;
    history.push({ price, timestamp });
    
    // Keep only last 100 price points
    if (history.length > 100) {
      history.shift();
    }

    // Update any active positions with this token
    const position = Array.from(this.positions.values()).find(p => p.mint === address);
    if (position && position.status === 'ACTIVE') {
      this.updatePositionWithRealPrice(position, price);
      this.checkExitConditions(position.id);
    }
  }

  private updatePositionWithRealPrice(position: SimulatedPosition, currentPrice: number): void {
    const previousPrice = position.currentPrice;
    const previousRoi = position.roi || 0;
    
    position.currentPrice = currentPrice;
    
    // Calculate ROI based on real price movement
    position.roi = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    
    this.positions.set(position.id, position);
    
    // Display live position update
    this.displayLivePositionUpdate(position, previousPrice, previousRoi);
    
    // Update portfolio metrics
    this.updatePortfolioMetrics();
  }

  async processTokenDetection(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void> {
    // Check if this is a demo token
    if (tokenInfo.source === 'demo' || tokenInfo.metadata?.demo === true) {
      console.log(`🎮 Processing demo token: ${tokenInfo.symbol}`);
      // Handle demo tokens with simulated data
      await this.processDemoToken(tokenInfo, securityAnalysis);
      return;
    }
    
    // Get real token data for non-demo tokens
    const realToken = this.realTokenMonitor.getTokenInfo(tokenInfo.mint);
    
    if (!realToken) {
      console.log(`❌ No real market data available for ${tokenInfo.symbol}`);
      return;
    }

    console.log(`\n📊 Processing token with real data: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`💵 Current Price: $${realToken.priceUsd.toFixed(8)}`);
    console.log(`📈 24h Change: ${realToken.priceChange24h.toFixed(2)}%`);
    console.log(`💧 Liquidity: $${realToken.liquidityUsd.toLocaleString()}`);
    console.log(`⏰ Token Age: ${this.formatTokenAge(realToken.pairCreatedAt)}`);
    console.log(`🔒 Security Score: ${securityAnalysis.score}/100`);

    // Enhanced decision making with real market data
    const shouldBuy = this.shouldSimulateBuy(tokenInfo, securityAnalysis, realToken);
    
    if (shouldBuy) {
      await this.simulateBuy(tokenInfo, securityAnalysis.score, realToken);
    } else {
      console.log(`❌ Skipping token: ${this.getSkipReason(tokenInfo, securityAnalysis, realToken)}`);
    }

    this.updatePortfolioMetrics();
    this.emit('portfolioUpdate', this.getPortfolioStats());
  }

  private shouldSimulateBuy(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, realToken: RealTokenInfo): boolean {
    // Use enhanced transaction workflows for decision making
    try {
      const decision = this.enhancedWorkflows.evaluateTradeOpportunity(tokenInfo, securityAnalysis);
      console.log(`🎯 ENHANCED DECISION: ${decision.action} - ${decision.reason}`);
      
      if (decision.action === 'BUY' || decision.action === 'PRIORITY_BUY') {
        // Additional production-ready validation for real tokens
        return this.validateRealTokenForTrading(tokenInfo, securityAnalysis, realToken);
      }
      
      return false;
    } catch (error) {
      console.error('❌ Error in enhanced workflows decision making:', error);
      return this.fallbackShouldBuy(tokenInfo, securityAnalysis, realToken);
    }
  }

  private validateRealTokenForTrading(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, realToken: RealTokenInfo): boolean {
    // Production-ready validation for real tokens
    
    // Security score must be high
    if (securityAnalysis.score < 70) {
      console.log(`⚠️ Security score too low: ${securityAnalysis.score} < 70`);
      return false;
    }

    // Position limits
    if (this.positions.size >= this.config.maxSimulatedPositions) {
      console.log(`⚠️ Max positions reached: ${this.positions.size}/${this.config.maxSimulatedPositions}`);
      return false;
    }

    // Balance check
    if (this.portfolio.currentBalance < this.config.simulatedInvestment) {
      console.log(`⚠️ Insufficient balance: ${this.portfolio.currentBalance.toFixed(3)} SOL`);
      return false;
    }

    // Liquidity must be substantial
    if (realToken.liquidityUsd < 15000) {
      console.log(`⚠️ Liquidity too low: $${realToken.liquidityUsd.toLocaleString()} < $15,000`);
      return false;
    }

    // Volume must show activity
    if (realToken.volume24h < 5000) {
      console.log(`⚠️ Volume too low: $${realToken.volume24h.toLocaleString()} < $5,000`);
      return false;
    }

    // Price change filters - avoid extreme volatility
    if (Math.abs(realToken.priceChange5m) > 100) {
      console.log(`⚠️ Too volatile: ${realToken.priceChange5m.toFixed(1)}% in 5m`);
      return false;
    }

    // Avoid tokens in freefall
    if (realToken.priceChange1h < -50) {
      console.log(`⚠️ Token in freefall: ${realToken.priceChange1h.toFixed(1)}% in 1h`);
      return false;
    }

    // Market cap should be reasonable
    if (realToken.marketCap && realToken.marketCap < 50000) {
      console.log(`⚠️ Market cap too low: $${realToken.marketCap.toLocaleString()}`);
      return false;
    }

    // Age filter - only very fresh tokens
    const ageMs = Date.now() - tokenInfo.createdAt;
    if (ageMs > 30 * 60 * 1000) { // 30 minutes
      console.log(`⚠️ Token too old: ${Math.round(ageMs / 60000)} minutes`);
      return false;
    }

    console.log(`✅ Real token validation passed for ${tokenInfo.symbol}`);
    return true;
  }

  private fallbackShouldBuy(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, realToken: RealTokenInfo): boolean {
    // Conservative fallback logic if enhanced workflows fail
    console.log(`⚠️ Using fallback logic for ${tokenInfo.symbol}`);
    
    if (securityAnalysis.score < 80) {
      return false;
    }

    if (this.positions.size >= this.config.maxSimulatedPositions) {
      return false;
    }

    if (this.portfolio.currentBalance < this.config.simulatedInvestment) {
      return false;
    }

    // Conservative real market data checks for fallback
    
    // High liquidity requirement
    if (realToken.liquidityUsd < 25000) {
      return false;
    }

    // High volume requirement
    if (realToken.volume24h < 15000) {
      return false;
    }

    // Strict volatility limits
    if (Math.abs(realToken.priceChange5m) > 25) {
      return false;
    }

    // Avoid any negative momentum
    if (realToken.priceChange1h < -15) {
      return false;
    }

    // Higher market cap requirement
    if (realToken.marketCap && realToken.marketCap < 100000) {
      return false;
    }

    // Higher transaction activity requirement
    if (realToken.txns5m < 10) {
      return false;
    }

    console.log(`✅ Fallback validation passed for ${tokenInfo.symbol}`);
    return true;
  }

  private getSkipReason(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, realToken: RealTokenInfo): string {
    if (securityAnalysis.score < this.config.minConfidenceScore) {
      return `Low security score (${securityAnalysis.score} < ${this.config.minConfidenceScore})`;
    }

    if (this.positions.size >= this.config.maxSimulatedPositions) {
      return `Max positions reached (${this.positions.size}/${this.config.maxSimulatedPositions})`;
    }

    if (this.portfolio.currentBalance < this.config.simulatedInvestment) {
      return `Insufficient balance (${this.portfolio.currentBalance.toFixed(3)} SOL)`;
    }

    if (realToken.liquidityUsd < 5000) {
      return `Low liquidity ($${realToken.liquidityUsd.toLocaleString()})`;
    }

    if (realToken.volume24h < 1000) {
      return `Low volume ($${realToken.volume24h.toLocaleString()})`;
    }

    if (Math.abs(realToken.priceChange5m) > 50) {
      return `High volatility (${realToken.priceChange5m.toFixed(1)}% in 5m)`;
    }

    if (realToken.priceChange1h < -30) {
      return `Negative momentum (${realToken.priceChange1h.toFixed(1)}% in 1h)`;
    }

    if (realToken.marketCap && realToken.marketCap < 10000) {
      return `Market cap too low ($${realToken.marketCap.toLocaleString()})`;
    }

    if (realToken.txns5m < 3) {
      return `Low trading activity (${realToken.txns5m} txns in 5m)`;
    }

    return 'Market conditions unfavorable';
  }

  private async simulateBuy(tokenInfo: TokenInfo, securityScore: number, realToken: RealTokenInfo): Promise<void> {
    const positionId = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate position size based on security score and market conditions
    let positionSize = this.config.simulatedInvestment;
    
    // Increase size for high-confidence tokens with good liquidity
    if (securityScore >= 90 && realToken.liquidityUsd > 20000) {
      positionSize *= 1.8;
    } else if (securityScore >= 80 && realToken.liquidityUsd > 10000) {
      positionSize *= 1.4;
    } else if (securityScore >= 75) {
      positionSize *= 1.1;
    }

    // Reduce size for risky conditions
    if (realToken.priceChange24h < -20) {
      positionSize *= 0.7; // Reduce for tokens down >20% in 24h
    }

    // Ensure we don't exceed available balance
    positionSize = Math.min(positionSize, this.portfolio.currentBalance);

    // Use real current price
    const entryPrice = realToken.priceUsd;

    const position: SimulatedPosition = {
      id: positionId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      entryTime: Date.now(),
      simulatedInvestment: positionSize,
      entryPrice: entryPrice,
      currentPrice: entryPrice,
      status: 'ACTIVE',
      roi: 0
    };

    const trade: SimulatedTrade = {
      id: tradeId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      type: 'BUY',
      timestamp: Date.now(),
      price: entryPrice,
      amount: positionSize,
      reason: `Security: ${securityScore}/100, Liquidity: $${realToken.liquidityUsd.toLocaleString()}`,
      simulation: true
    };

    // Update portfolio
    this.portfolio.currentBalance -= positionSize;
    this.portfolio.totalInvested += positionSize;

    // Store position and trade
    this.positions.set(positionId, position);
    this.trades.push(trade);

    const positionValueEur = this.priceConverter.solToEur(positionSize);
    const liquidityEur = this.priceConverter.usdToEur(realToken.liquidityUsd);
    
    console.log(`✅ Simulated BUY: ${position.symbol}`);
    console.log(`💰 Amount: ${positionSize.toFixed(4)} SOL (€${positionValueEur.toFixed(2)}) at $${entryPrice.toFixed(8)}`);
    console.log(`📊 Confidence: ${securityScore}/100`);
    console.log(`💧 Liquidity: $${realToken.liquidityUsd.toLocaleString()} (€${liquidityEur.toLocaleString()})`);
    console.log(`⏰ Token Age: ${this.formatTokenAge(realToken.pairCreatedAt)}`);

    logger.log('analysis', 'Simulated buy executed with real price', {
      positionId,
      symbol: position.symbol,
      entryPrice,
      investment: positionSize,
      securityScore,
      liquidity: realToken.liquidityUsd,
      volume24h: realToken.volume24h
    });

    this.emit('trade', trade);
    this.emit('positionOpened', position);

    // Start monitoring this position with real price updates
    this.monitorPositionWithRealData(positionId);
  }

  private monitorPositionWithRealData(positionId: string): void {
    // Set up exit condition checking
    const monitoringInterval = setInterval(() => {
      if (!this.positions.has(positionId)) {
        clearInterval(monitoringInterval);
        return;
      }

      this.checkExitConditions(positionId);
    }, 5000); // Check every 5 seconds

    // Auto-close position after max time (for demo purposes)
    setTimeout(() => {
      if (this.positions.has(positionId)) {
        this.simulateSell(positionId, 'Maximum hold time reached');
      }
      clearInterval(monitoringInterval);
    }, 300000); // Close after 5 minutes max
  }

  private checkExitConditions(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE' || position.roi === undefined) return;

    let shouldExit = false;
    let exitReason = '';

    // Stop loss at -20%
    if (position.roi <= -20) {
      shouldExit = true;
      exitReason = 'Stop loss triggered (-20%)';
    }
    // Take profit at different levels based on performance
    else if (position.roi >= 100) {
      shouldExit = true;
      exitReason = `Take profit triggered (+${position.roi.toFixed(1)}%)`;
    }
    // Partial profit taking at 50%
    else if (position.roi >= 50 && Math.random() < 0.3) { // 30% chance
      shouldExit = true;
      exitReason = `Partial profit taking (+${position.roi.toFixed(1)}%)`;
    }
    // Exit on extreme negative momentum
    else if (position.roi < -15 && this.hasNegativeMomentum(position.mint)) {
      shouldExit = true;
      exitReason = 'Negative momentum detected';
    }

    if (shouldExit) {
      this.simulateSell(positionId, exitReason);
    }
  }

  private hasNegativeMomentum(address: string): boolean {
    const history = this.priceHistory.get(address);
    if (!history || history.length < 3) return false;

    // Check if price has been declining for the last few updates
    const recent = history.slice(-3);
    return recent[2].price < recent[1].price && recent[1].price < recent[0].price;
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
    const profitLossEur = this.priceConverter.solToEur(profitLoss);
    const profitLossEurText = profitLossEur >= 0 ? `+€${profitLossEur.toFixed(2)}` : `€${profitLossEur.toFixed(2)}`;
    const exitValueEur = this.priceConverter.solToEur(exitValue);

    console.log(`🔄 Simulated SELL: ${position.symbol}`);
    console.log(`💰 Exit: ${exitValue.toFixed(4)} SOL (€${exitValueEur.toFixed(2)})`);
    console.log(`📈 P&L: ${profitLossText} SOL (${profitLossEurText}), ${roi.toFixed(1)}%`);
    console.log(`📝 Reason: ${reason}`);

    logger.log('analysis', 'Simulated sell executed with real price', {
      positionId,
      symbol: position.symbol,
      exitPrice: currentPrice,
      roi,
      profitLoss,
      reason
    });

    this.emit('trade', sellTrade);
    this.emit('positionClosed', position);

    // Stop tracking this token if no other positions
    const hasOtherPositions = Array.from(this.positions.values())
      .some(p => p.mint === position.mint && p.status === 'ACTIVE');
    
    if (!hasOtherPositions) {
      this.realTokenMonitor.stopTrackingToken(position.mint);
    }
  }

  private updatePortfolioMetrics(): void {
    // Calculate unrealized PnL from active positions
    let unrealizedPnL = 0;
    for (const position of this.positions.values()) {
      if (position.status === 'ACTIVE' && position.roi !== undefined) {
        const currentValue = position.simulatedInvestment * (1 + position.roi / 100);
        unrealizedPnL += (currentValue - position.simulatedInvestment);
      }
    }

    this.portfolio.unrealizedPnL = unrealizedPnL;
  }

  // Same interface methods as the original dry-run engine
  getPortfolioStats() {
    const activePositions = Array.from(this.positions.values()).filter(p => p.status === 'ACTIVE').length;
    const closedPositions = Array.from(this.positions.values()).filter(p => p.status === 'CLOSED');
    
    const totalPortfolioValue = this.portfolio.currentBalance + this.portfolio.totalInvested + this.portfolio.unrealizedPnL;
    const totalROI = ((totalPortfolioValue - this.portfolio.startingBalance) / this.portfolio.startingBalance) * 100;

    const winningTrades = closedPositions.filter(p => (p.roi || 0) > 0).length;
    const winRate = closedPositions.length > 0 ? (winningTrades / closedPositions.length) * 100 : 0;

    // Add EUR conversions
    const currentBalanceEur = this.priceConverter.solToEur(this.portfolio.currentBalance);
    const totalInvestedEur = this.priceConverter.solToEur(this.portfolio.totalInvested);
    const unrealizedPnLEur = this.priceConverter.solToEur(this.portfolio.unrealizedPnL);
    const totalRealizedEur = this.priceConverter.solToEur(this.portfolio.totalRealized);
    const totalPortfolioValueEur = this.priceConverter.solToEur(totalPortfolioValue);
    const startingBalanceEur = this.priceConverter.solToEur(this.portfolio.startingBalance);

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
      startingBalance: this.portfolio.startingBalance,
      // EUR values
      currentBalanceEur,
      totalInvestedEur,
      unrealizedPnLEur,
      totalRealizedEur,
      totalPortfolioValueEur,
      startingBalanceEur,
      solToEurRate: this.priceConverter.getSolRate()
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

  private startPeriodicSummary(): void {
    // Display active positions summary every 30 seconds
    setInterval(() => {
      this.displayActivePositionsSummary();
    }, 30000);
  }

  private displayActivePositionsSummary(): void {
    const activePositions = this.getActivePositions();
    
    if (activePositions.length === 0) {
      return; // Don't display if no active positions
    }

    console.log(`\n💼 ACTIVE POSITIONS (${activePositions.length}):`);
    activePositions.forEach(position => {
      const currentValue = position.simulatedInvestment * (1 + (position.roi || 0) / 100);
      const profitLoss = currentValue - position.simulatedInvestment;
      const profitLossEur = this.priceConverter.solToEur(profitLoss);
      const profitLossText = profitLoss >= 0 ? `+${profitLoss.toFixed(4)}` : profitLoss.toFixed(4);
      const profitLossEurText = profitLossEur >= 0 ? `+€${profitLossEur.toFixed(2)}` : `€${profitLossEur.toFixed(2)}`;
      const roiColor = (position.roi || 0) >= 0 ? '🟢' : '🔴';
      
      console.log(`  ${roiColor} ${position.symbol}: $${(position.currentPrice || 0).toFixed(8)} | ROI: ${(position.roi || 0).toFixed(1)}% | P&L: ${profitLossText} SOL (${profitLossEurText})`);
    });
    
    const stats = this.getPortfolioStats();
    const totalUnrealizedEur = this.priceConverter.solToEur(stats.unrealizedPnL);
    const totalUnrealizedText = stats.unrealizedPnL >= 0 ? `+${stats.unrealizedPnL.toFixed(4)}` : stats.unrealizedPnL.toFixed(4);
    const totalUnrealizedEurText = totalUnrealizedEur >= 0 ? `+€${totalUnrealizedEur.toFixed(2)}` : `€${totalUnrealizedEur.toFixed(2)}`;
    
    console.log(`💰 Total Unrealized P&L: ${totalUnrealizedText} SOL (${totalUnrealizedEurText})`);
  }

  private displayLivePositionUpdate(position: SimulatedPosition, previousPrice?: number, previousRoi?: number): void {
    const currentValue = position.simulatedInvestment * (1 + (position.roi || 0) / 100);
    const profitLoss = currentValue - position.simulatedInvestment;
    const profitLossEur = this.priceConverter.solToEur(profitLoss);
    
    // Only display if there's a meaningful change
    if (previousPrice && Math.abs((position.currentPrice || 0) - previousPrice) > previousPrice * 0.01) {
      const priceDirection = (position.currentPrice || 0) > previousPrice ? '📈' : '📉';
      const roiDirection = (position.roi || 0) > (previousRoi || 0) ? '🟢' : '🔴';
      const profitLossText = profitLoss >= 0 ? `+${profitLoss.toFixed(4)}` : profitLoss.toFixed(4);
      const profitLossEurText = profitLossEur >= 0 ? `+€${profitLossEur.toFixed(2)}` : `€${profitLossEur.toFixed(2)}`;
      
      console.log(`${priceDirection} ${position.symbol}: $${(position.currentPrice || 0).toFixed(8)} | ${roiDirection} ROI: ${(position.roi || 0).toFixed(1)}% | P&L: ${profitLossText} SOL (${profitLossEurText})`);
    }
  }

  private formatTokenAge(pairCreatedAt?: number): string {
    if (!pairCreatedAt) {
      return 'Unknown';
    }

    const now = Date.now();
    const ageMs = now - pairCreatedAt;
    
    // Convert to different time units
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private async processDemoToken(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void> {
    console.log(`🎮 Demo token processing: ${tokenInfo.symbol}`);
    console.log(`📊 Security Score: ${securityAnalysis.score}`);
    console.log(`💰 Demo Liquidity: $${tokenInfo.liquidity?.usd || 0}`);
    console.log(`💵 Demo Price: $${tokenInfo.metadata?.priceUsd || 'N/A'}`);
    
    // Check if we should buy this demo token
    if (!this.shouldBuyDemoToken(tokenInfo, securityAnalysis)) {
      const reason = this.getSkipReasonDemo(tokenInfo, securityAnalysis);
      console.log(`⏭️ Skipping demo token: ${reason}`);
      this.emit('tokenSkipped', { 
        mint: tokenInfo.mint, 
        symbol: tokenInfo.symbol, 
        reason 
      });
      return;
    }

    // Simulate buy for demo token
    await this.simulateDemoBuy(tokenInfo, securityAnalysis.score);
  }

  private shouldBuyDemoToken(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): boolean {
    // Very permissive for demo tokens
    if (securityAnalysis.score < 5) return false;
    if (this.positions.size >= this.config.maxSimulatedPositions) return false;
    if (this.portfolio.currentBalance < 0.001) return false;
    return true;
  }

  private getSkipReasonDemo(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): string {
    if (securityAnalysis.score < 5) {
      return `Demo token security too low (${securityAnalysis.score} < 5)`;
    }
    if (this.positions.size >= this.config.maxSimulatedPositions) {
      return `Max positions reached (${this.positions.size}/${this.config.maxSimulatedPositions})`;
    }
    if (this.portfolio.currentBalance < 0.001) {
      return `Insufficient balance (${this.portfolio.currentBalance.toFixed(3)} SOL)`;
    }
    return 'Unknown reason';
  }

  private async simulateDemoBuy(tokenInfo: TokenInfo, securityScore: number): Promise<void> {
    const positionId = `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Use a small position size for demo
    const positionSize = Math.min(0.01, this.portfolio.currentBalance);
    
    // Use the demo price or generate one
    const entryPrice = tokenInfo.metadata?.priceUsd || (Math.random() * 0.00001 + 0.000001);
    
    const position: SimulatedPosition = {
      id: positionId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'DEMO',
      entryTime: Date.now(),
      entryPrice,
      simulatedInvestment: positionSize,
      currentPrice: entryPrice,
      status: 'ACTIVE',
      hasLivePrice: true,
      reason: `Demo token - Score: ${securityScore}`
    };

    this.positions.set(position.id, position);
    this.portfolio.currentBalance -= positionSize;

    const buyTrade: SimulatedTrade = {
      id: tradeId,
      type: 'BUY',
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'DEMO',
      amount: positionSize,
      price: entryPrice,
      timestamp: Date.now(),
      reason: `Demo token buy - Score: ${securityScore}`,
      simulation: true
    };

    this.trades.push(buyTrade);
    
    console.log(`💰 DEMO BUY: ${tokenInfo.symbol} - ${positionSize.toFixed(4)} SOL @ $${entryPrice.toFixed(8)}`);
    console.log(`📊 Balance: ${this.portfolio.currentBalance.toFixed(4)} SOL`);
    
    this.emit('trade', buyTrade);
    this.emit('positionOpened', position);
    
    // Update portfolio metrics
    this.updatePortfolioMetrics();
  }
}