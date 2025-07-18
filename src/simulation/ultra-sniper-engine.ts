// @ts-nocheck
import { EventEmitter } from 'events';
import { Config } from '../core/config';
import { TokenInfo, SecurityAnalysis, SimulatedPosition, SimulatedTrade, TradeDecision } from '../types';
import { EnhancedTransactionWorkflows } from '../trading/enhanced-transaction-workflows';
import { RealTokenMonitor } from '../detection/real-token-monitor';

export class UltraSniperEngine extends EventEmitter {
  private config: any;
  private positions: Map<string, SimulatedPosition> = new Map();
  private trades: SimulatedTrade[] = [];
  private enhancedWorkflows: EnhancedTransactionWorkflows;
  private realTokenMonitor: RealTokenMonitor | null = null;
  
  private portfolio = {
    startingBalance: 10, // 10 SOL starting balance for simulation
    currentBalance: 10,
    totalInvested: 0,
    totalRealized: 0,
    unrealizedPnL: 0
  };

  constructor(realTokenMonitor?: RealTokenMonitor) {
    super();
    this.config = Config.getInstance().getConfig();
    this.enhancedWorkflows = new EnhancedTransactionWorkflows();
    
    // Initialize real token monitor with proper null checks
    if (realTokenMonitor) {
      this.realTokenMonitor = realTokenMonitor;
      console.log('🎯 ULTRA SNIPER ENGINE initialized with Real Token Monitor');
    } else {
      console.log('🎯 ULTRA SNIPER ENGINE initialized without Real Token Monitor (fallback mode)');
    }
    
    console.log('💰 Starting with simulated balance: 10 SOL');
    console.log('⚡ ULTRA SNIPER MODE: INSTANT BUY DECISIONS');
    this.setupPriceUpdateListener();
  }

  private setupPriceUpdateListener(): void {
    if (!this.realTokenMonitor) {
      console.log('⚠️ No Real Token Monitor - ultra sniper will use fallback methods');
      return;
    }

    this.realTokenMonitor.on('priceUpdate', (priceData: any) => {
      const position = this.positions.get(priceData.mint);
      if (position) {
        position.currentPrice = priceData.priceUsd;
        position.roi = ((priceData.priceUsd - position.entryPrice) / position.entryPrice) * 100;
        
        // Ultra aggressive exit conditions
        const shouldExit = this.shouldExitPositionUltra(position);
        if (shouldExit.shouldExit) {
          console.log(`🚨 ULTRA SNIPER EXIT: ${position.symbol} - ${shouldExit.reason}`);
          this.simulateUltraSell(position, shouldExit.reason);
        }
      }
    });
  }

  async processTokenDetection(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void> {
    let priceUsd = tokenInfo.metadata?.priceUsd || tokenInfo.metadata?.price || 0;
    let hasLivePrice = false;

    // Try to get real price from RealTokenMonitor first
    if (this.realTokenMonitor) {
      const realToken = this.realTokenMonitor.getTokenInfo(tokenInfo.mint);
      if (realToken && realToken.priceUsd > 0) {
        priceUsd = realToken.priceUsd;
        hasLivePrice = true;
        console.log(`✅ Ultra sniper real price: $${priceUsd.toFixed(8)}`);
        
        // Update tokenInfo with real data
        tokenInfo.metadata = tokenInfo.metadata || {};
        tokenInfo.metadata.priceUsd = priceUsd;
        tokenInfo.metadata.price = priceUsd;
        tokenInfo.metadata.volume24h = realToken.volume24h;
        tokenInfo.metadata.liquidityUsd = realToken.liquidityUsd;
        tokenInfo.metadata.priceChange24h = realToken.priceChange24h;
      }
    }

    // Fallback: Generate realistic price if no real price available
    if (!hasLivePrice) {
      priceUsd = this.generateFallbackPrice(tokenInfo);
      console.log(`🎲 Ultra sniper fallback price: $${priceUsd.toFixed(8)}`);
      
      // Update tokenInfo with fallback data
      tokenInfo.metadata = tokenInfo.metadata || {};
      tokenInfo.metadata.priceUsd = priceUsd;
      tokenInfo.metadata.price = priceUsd;
    }

    console.log(`\n🎯 ULTRA SNIPER PROCESSING: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`🔒 Security score: ${securityAnalysis.score}/100`);
    console.log(`💵 Price: $${priceUsd.toFixed(8)} (${hasLivePrice ? 'REAL' : 'FALLBACK'})`);
    console.log(`💰 Current balance: ${this.portfolio.currentBalance.toFixed(4)} SOL`);
    console.log(`📈 Active positions: ${this.positions.size}/2000`);
    console.log(`⚡ Real Token Monitor: ${this.realTokenMonitor ? 'ACTIVE' : 'INACTIVE'}`);

    // Ultra aggressive evaluation - use enhanced workflows but with sniper modifications
    const tradeDecision = this.enhancedWorkflows.evaluateTradeOpportunity(tokenInfo, securityAnalysis);
    
    // Override decision for ultra aggressive mode
    const ultraDecision = this.makeUltraDecision(tokenInfo, securityAnalysis, tradeDecision);
    
    console.log(`🎯 ULTRA SNIPER DECISION: ${ultraDecision.action}`);
    console.log(`📋 Strategy: ${ultraDecision.strategy.source} (${ultraDecision.strategy.priority} priority)`);
    console.log(`💭 Reason: ${ultraDecision.reason}`);
    console.log(`⚡ Urgency: ${ultraDecision.urgency}`);
    console.log(`💪 Confidence: ${ultraDecision.confidence}%`);
    console.log(`⚠️ Risk Level: ${ultraDecision.riskLevel}`);
    console.log(`💰 Position Size: ${ultraDecision.positionSize.toFixed(6)} SOL`);
    console.log(`⏰ Expected Hold: ${Math.round(ultraDecision.expectedHoldTime / 60000)}m`);

    if (ultraDecision.action === 'BUY' || ultraDecision.action === 'PRIORITY_BUY') {
      console.log(`🚨 ULTRA SNIPER BUY SIGNAL - INSTANT EXECUTION!`);
      
      await this.simulateUltraBuy(tokenInfo, securityAnalysis, ultraDecision);
      
      // Start tracking with RealTokenMonitor if available
      if (this.realTokenMonitor && hasLivePrice) {
        this.realTokenMonitor.trackToken(tokenInfo.mint);
        console.log(`📊 Started ultra sniper tracking for ${tokenInfo.symbol}`);
      }
    } else if (ultraDecision.action === 'WATCH') {
      console.log(`👀 ULTRA SNIPER WATCHING: High potential target`);
      
      this.emit('tokenWatched', {
        mint: tokenInfo.mint,
        symbol: tokenInfo.symbol,
        reason: ultraDecision.reason,
        confidence: ultraDecision.confidence
      });
    } else {
      console.log(`❌ ULTRA SNIPER SKIP: ${ultraDecision.reason}`);
      
      this.emit('tokenSkipped', {
        mint: tokenInfo.mint,
        symbol: tokenInfo.symbol,
        reason: ultraDecision.reason,
        confidence: ultraDecision.confidence,
        riskLevel: ultraDecision.riskLevel
      });
    }

    this.updatePortfolioMetrics();
    this.emit('portfolioUpdate', this.getPortfolioStats());
  }

  private makeUltraDecision(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, baseDecision: TradeDecision): TradeDecision {
    // Ultra aggressive overrides
    const ultraDecision = { ...baseDecision };
    
    // Lower security requirements for ultra mode
    if (securityAnalysis.score >= 30) { // Much lower threshold
      ultraDecision.action = 'BUY';
      ultraDecision.urgency = 'ULTRA_HIGH';
      ultraDecision.reason = `ULTRA SNIPER: ${baseDecision.reason} (lowered security threshold)`;
    }
    
    // Increase position size for ultra mode
    ultraDecision.positionSize = Math.min(ultraDecision.positionSize * 1.5, 0.05); // Up to 0.05 SOL
    
    // Shorter hold times for ultra mode
    ultraDecision.expectedHoldTime = Math.min(ultraDecision.expectedHoldTime, 15 * 60 * 1000); // Max 15 minutes
    
    // Higher confidence for ultra mode
    ultraDecision.confidence = Math.min(ultraDecision.confidence + 20, 100);
    
    return ultraDecision;
  }

  private generateFallbackPrice(tokenInfo: TokenInfo): number {
    // Generate realistic fallback price based on token characteristics
    let basePrice = 0.000001; // Start with very small price
    
    // Adjust based on liquidity
    const liquidityUsd = tokenInfo.liquidity?.usd || 0;
    if (liquidityUsd > 100000) {
      basePrice *= 1000; // Higher liquidity = higher price
    } else if (liquidityUsd > 50000) {
      basePrice *= 500;
    } else if (liquidityUsd > 10000) {
      basePrice *= 100;
    } else if (liquidityUsd > 1000) {
      basePrice *= 10;
    }
    
    // Adjust based on source (trusted sources tend to have higher prices)
    const source = tokenInfo.source?.toLowerCase() || '';
    if (source.includes('raydium') || source.includes('orca')) {
      basePrice *= 5; // Established DEXes
    } else if (source.includes('pump')) {
      basePrice *= 2; // Pump tokens higher potential in ultra mode
    }
    
    // Add some randomness (±50%)
    const randomMultiplier = 0.5 + Math.random();
    basePrice *= randomMultiplier;
    
    // Ensure minimum viable price
    return Math.max(basePrice, 0.0000001);
  }

  private async simulateUltraBuy(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, tradeDecision: TradeDecision): Promise<void> {
    const investmentAmount = Math.min(tradeDecision.positionSize, this.portfolio.currentBalance);
    const priceUsd = tokenInfo.metadata?.priceUsd || tokenInfo.metadata?.price || this.generateFallbackPrice(tokenInfo);
    
    // Calculate position based on SOL price (estimated at $180)
    const solPriceUsd = 180;
    const investmentUsd = investmentAmount * solPriceUsd;
    const tokenAmount = investmentUsd / priceUsd;
    
    console.log(`🚨 EXECUTING ULTRA SNIPER BUY:`);
    console.log(`   Investment: ${investmentAmount.toFixed(6)} SOL ($${investmentUsd.toFixed(2)})`);
    console.log(`   Token Price: $${priceUsd.toFixed(8)}`);
    console.log(`   Token Amount: ${tokenAmount.toLocaleString()}`);
    console.log(`   Strategy: ${tradeDecision.strategy.source} (ULTRA SNIPER)`);
    console.log(`   Real Monitor: ${this.realTokenMonitor ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`   ⚡ INSTANT EXECUTION MODE`);
    
    // Create modified exit conditions for ultra mode
    const ultraExitConditions = {
      ...tradeDecision.strategy.exitConditions,
      takeProfitLevels: [
        { roi: 500, sellPercentage: 90, reason: 'ULTRA SNIPER: 500%+ mega exit' },
        { roi: 200, sellPercentage: 70, reason: 'ULTRA SNIPER: 200%+ major exit' },
        { roi: 100, sellPercentage: 50, reason: 'ULTRA SNIPER: 100%+ quick exit' },
        { roi: 50, sellPercentage: 30, reason: 'ULTRA SNIPER: 50%+ fast exit' },
        { roi: 25, sellPercentage: 20, reason: 'ULTRA SNIPER: 25%+ scalp exit' }
      ],
      stopLoss: { roi: -40, reason: 'ULTRA SNIPER: Stop loss' }, // Wider stop loss
      timeBasedExit: { maxHoldTime: 15 * 60 * 1000, reason: 'ULTRA SNIPER: Max 15min hold' }
    };
    
    const position: SimulatedPosition = {
      id: `ultra_pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'Unknown',
      entryPrice: priceUsd,
      currentPrice: priceUsd,
      simulatedInvestment: investmentAmount,
      tokenAmount: tokenAmount,
      entryTime: Date.now(),
      exitTime: null,
      roi: 0,
      status: 'ACTIVE',
      strategy: 'ULTRA_SNIPER',
      urgency: tradeDecision.urgency,
      confidence: tradeDecision.confidence,
      riskLevel: tradeDecision.riskLevel,
      expectedHoldTime: tradeDecision.expectedHoldTime,
      securityScore: securityAnalysis.score,
      exitConditions: ultraExitConditions
    };

    this.positions.set(tokenInfo.mint, position);
    this.portfolio.currentBalance -= investmentAmount;
    this.portfolio.totalInvested += investmentAmount;

    const trade: SimulatedTrade = {
      id: `ultra_trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'Unknown',
      type: 'BUY',
      amount: investmentAmount,
      price: priceUsd,
      timestamp: Date.now(),
      reason: tradeDecision.reason,
      strategy: 'ULTRA_SNIPER',
      urgency: tradeDecision.urgency,
      confidence: tradeDecision.confidence
    };

    this.trades.push(trade);
    this.emit('trade', trade);
    this.emit('positionOpened', position);
    
    console.log(`🚨 ULTRA SNIPER POSITION OPENED: ${position.symbol}`);
    console.log(`📊 Portfolio: ${this.portfolio.currentBalance.toFixed(4)} SOL remaining`);
    console.log(`📈 Active positions: ${this.positions.size}`);
    
    // Start monitoring position for exit conditions (fallback if no real monitor)
    if (!this.realTokenMonitor) {
      this.startPositionMonitoring(position);
    }
  }

  private startPositionMonitoring(position: SimulatedPosition): void {
    const monitoringInterval = setInterval(async () => {
      if (!this.positions.has(position.mint)) {
        clearInterval(monitoringInterval);
        return;
      }

      // Update position with ultra aggressive price movement
      position.currentPrice = this.simulateUltraPriceMovement(position);
      position.roi = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
      
      // Check exit conditions
      const shouldExit = this.shouldExitPositionUltra(position);
      if (shouldExit.shouldExit) {
        console.log(`🚨 ULTRA SNIPER EXIT: ${position.symbol} - ${shouldExit.reason}`);
        await this.simulateUltraSell(position, shouldExit.reason);
        clearInterval(monitoringInterval);
      }
    }, 2000); // Check every 2 seconds (more frequent)
  }

  private simulateUltraPriceMovement(position: SimulatedPosition): number {
    // Ultra aggressive price movement simulation
    const timeSinceEntry = Date.now() - position.entryTime;
    const minutesElapsed = timeSinceEntry / (1000 * 60);
    
    // Higher volatility for ultra mode
    let volatility = 0.05; // 5% base volatility
    if (minutesElapsed < 1) volatility *= 4; // 20% for first minute
    else if (minutesElapsed < 5) volatility *= 3; // 15% for first 5 minutes
    else if (minutesElapsed < 10) volatility *= 2; // 10% for first 10 minutes
    
    // Adjust volatility based on risk level (more extreme)
    switch (position.riskLevel) {
      case 'VERY_HIGH':
        volatility *= 3;
        break;
      case 'HIGH':
        volatility *= 2.5;
        break;
      case 'MEDIUM':
        volatility *= 2;
        break;
      case 'LOW':
        volatility *= 1.5;
        break;
    }
    
    // Generate price change with bias toward positive movement initially
    const timeBias = Math.max(0, 1 - minutesElapsed / 10); // Positive bias for first 10 minutes
    const randomChange = (Math.random() - 0.5 + timeBias * 0.3) * 2 * volatility;
    const newPrice = position.currentPrice * (1 + randomChange);
    
    return Math.max(newPrice, position.entryPrice * 0.05); // Minimum 5% of entry price
  }

  private shouldExitPositionUltra(position: SimulatedPosition): { shouldExit: boolean; reason: string } {
    const timeSinceEntry = Date.now() - position.entryTime;
    const roi = position.roi;
    
    // Check take profit levels (ultra aggressive)
    for (const level of position.exitConditions.takeProfitLevels) {
      if (roi >= level.roi) {
        return { shouldExit: true, reason: level.reason };
      }
    }
    
    // Check stop loss
    if (roi <= position.exitConditions.stopLoss.roi) {
      return { shouldExit: true, reason: position.exitConditions.stopLoss.reason };
    }
    
    // Check time-based exit (stricter)
    if (position.exitConditions.timeBasedExit && timeSinceEntry >= position.exitConditions.timeBasedExit.maxHoldTime) {
      return { shouldExit: true, reason: position.exitConditions.timeBasedExit.reason };
    }
    
    return { shouldExit: false, reason: '' };
  }

  private async simulateUltraSell(position: SimulatedPosition, reason: string): Promise<void> {
    const solPriceUsd = 180;
    const tokenValueUsd = position.tokenAmount * position.currentPrice;
    const solReceived = tokenValueUsd / solPriceUsd;
    const profit = solReceived - position.simulatedInvestment;
    
    console.log(`🚨 EXECUTING ULTRA SNIPER SELL:`);
    console.log(`   Position: ${position.symbol}`);
    console.log(`   Entry Price: $${position.entryPrice.toFixed(8)}`);
    console.log(`   Exit Price: $${position.currentPrice.toFixed(8)}`);
    console.log(`   Investment: ${position.simulatedInvestment.toFixed(6)} SOL`);
    console.log(`   Received: ${solReceived.toFixed(6)} SOL`);
    console.log(`   Profit/Loss: ${profit.toFixed(6)} SOL`);
    console.log(`   ROI: ${position.roi.toFixed(2)}%`);
    console.log(`   Reason: ${reason}`);
    console.log(`   Hold Time: ${Math.round((Date.now() - position.entryTime) / 1000)}s`);
    
    // Stop tracking with RealTokenMonitor if available
    if (this.realTokenMonitor) {
      this.realTokenMonitor.stopTrackingToken(position.mint);
      console.log(`📊 Stopped ultra sniper tracking for ${position.symbol}`);
    }
    
    // Update position
    position.exitTime = Date.now();
    position.status = 'CLOSED';
    
    // Update portfolio
    this.portfolio.currentBalance += solReceived;
    this.portfolio.totalRealized += profit;
    
    // Create sell trade
    const trade: SimulatedTrade = {
      id: `ultra_trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      mint: position.mint,
      symbol: position.symbol,
      type: 'SELL',
      amount: solReceived,
      price: position.currentPrice,
      timestamp: Date.now(),
      reason: reason,
      strategy: 'ULTRA_SNIPER',
      urgency: position.urgency,
      confidence: position.confidence,
      roi: position.roi
    };

    this.trades.push(trade);
    this.positions.delete(position.mint);
    
    this.emit('trade', trade);
    this.emit('positionClosed', position);
    
    console.log(`🚨 ULTRA SNIPER POSITION CLOSED: ${position.symbol}`);
    console.log(`📊 Portfolio: ${this.portfolio.currentBalance.toFixed(4)} SOL`);
    console.log(`📈 Active positions: ${this.positions.size}`);
  }

  private updatePortfolioMetrics(): void {
    let unrealizedPnL = 0;
    
    for (const position of this.positions.values()) {
      const solPriceUsd = 180;
      const currentValueUsd = position.tokenAmount * position.currentPrice;
      const currentValueSol = currentValueUsd / solPriceUsd;
      unrealizedPnL += currentValueSol - position.simulatedInvestment;
    }
    
    this.portfolio.unrealizedPnL = unrealizedPnL;
  }

  getPortfolioStats(): any {
    const totalValue = this.portfolio.currentBalance + this.portfolio.totalInvested + this.portfolio.unrealizedPnL;
    const totalROI = ((totalValue - this.portfolio.startingBalance) / this.portfolio.startingBalance) * 100;
    
    return {
      currentBalance: this.portfolio.currentBalance,
      totalInvested: this.portfolio.totalInvested,
      totalRealized: this.portfolio.totalRealized,
      unrealizedPnL: this.portfolio.unrealizedPnL,
      totalPortfolioValue: totalValue,
      totalROI: totalROI,
      activePositions: this.positions.size,
      totalTrades: this.trades.length,
      startingBalance: this.portfolio.startingBalance,
      realMonitorActive: !!this.realTokenMonitor,
      mode: 'ULTRA_SNIPER'
    };
  }

  getActivePositions(): SimulatedPosition[] {
    return Array.from(this.positions.values());
  }

  getRecentTrades(limit: number = 10): SimulatedTrade[] {
    return this.trades.slice(-limit).reverse();
  }

  getStats(): any {
    return {
      totalTrades: this.trades.length,
      activePositions: this.positions.size,
      portfolio: this.getPortfolioStats(),
      realMonitorActive: !!this.realTokenMonitor,
      mode: 'ULTRA_SNIPER'
    };
  }
}