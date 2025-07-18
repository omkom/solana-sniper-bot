import { EventEmitter } from 'events';
import { TokenInfo, SecurityAnalysis, SimulatedPosition, SimulatedTrade, AnalysisConfig } from '../types';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';
import { RealTokenInfo } from '../types/dexscreener';
import { RealTokenMonitor } from '../detection/real-token-monitor';
import { DexScreenerClient } from '../detection/dexscreener-client';
import { Config } from '../core/config';
import { logger } from '../monitoring/logger';
import { PriceConverter } from '../utils/price-converter';

export class UltraSniperEngine extends EventEmitter implements EventEmittingSimulationEngine {
  private config: AnalysisConfig;
  private realTokenMonitor: RealTokenMonitor;
  private dexScreenerClient: DexScreenerClient;
  private positions: Map<string, SimulatedPosition> = new Map();
  private trades: SimulatedTrade[] = [];
  private priceHistory: Map<string, Array<{price: number, timestamp: number}>> = new Map();
  private priceConverter: PriceConverter;
  
  private portfolio = {
    startingBalance: 10, // 10 SOL for aggressive sniping
    currentBalance: 10,
    totalInvested: 0,
    totalRealized: 0,
    unrealizedPnL: 0
  };

  // Ultra-aggressive settings
  private baseSnipeSize = 0.005; // Base 0.005 SOL per snipe
  private maxSnipePositions = 2000; // Allow 2000 positions
  private maxTokenAge = 6 * 60 * 60 * 1000; // 6 hours (extended for more opportunities)
  
  constructor(realTokenMonitor: RealTokenMonitor) {
    super();
    this.config = Config.getInstance().getConfig();
    this.realTokenMonitor = realTokenMonitor;
    this.dexScreenerClient = new DexScreenerClient();
    this.priceConverter = new PriceConverter();
    this.startPriceMonitoring();
    this.startSellingLoop();
    
    const portfolioValue = this.priceConverter.formatPortfolioValue(10);
    console.log('🎯 ULTRA SNIPER ENGINE ACTIVATED');
    console.log(`💰 Starting with sniper balance: ${portfolioValue.combined}`);
    console.log(`🚀 AGGRESSIVE MODE: Will snipe ALL tokens < 3 hours old`);
    console.log(`⚡ NO SECURITY CHECKS - PURE SPEED SNIPING`);
  }

  async processTokenDetection(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void> {
    // ULTRA-AGGRESSIVE INSTANT SNIPE - NO FILTERS, NO QUESTIONS!
    console.log(`\n⚡ INSTANT SNIPE: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`📡 Source: ${tokenInfo.source}`);
    console.log(`🕐 Age: ${Math.round((Date.now() - tokenInfo.createdAt) / 60000)} minutes`);
    console.log(`🔒 Security: ${securityAnalysis.score} (IGNORED - SNIPING ANYWAY)`);
    
    // ABSOLUTE MINIMUM CHECKS ONLY
    
    // Skip demo tokens only
    if (tokenInfo.source === 'demo' || tokenInfo.metadata?.demo) {
      console.log(`⏭️ Skipping demo token`);
      return;
    }

    // Only check if we have balance (but use dynamic position sizing)
    if (this.portfolio.currentBalance < 0.001) {
      console.log(`⚠️ Out of balance: ${this.portfolio.currentBalance.toFixed(6)} SOL`);
      this.emit('tokenSkipped', { 
        mint: tokenInfo.mint, 
        symbol: tokenInfo.symbol, 
        reason: 'Out of SOL' 
      });
      return;
    }

    // EXECUTE INSTANT SNIPE - NO MORE CHECKS!
    await this.executeInstantSnipe(tokenInfo, securityAnalysis);
  }

  private async executeInstantSnipe(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void> {
    const positionId = `snipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // DYNAMIC POSITION SIZING - More aggressive for fresh tokens
    const ageMs = Date.now() - tokenInfo.createdAt;
    const ageMinutes = ageMs / 60000;
    
    let positionSize = this.baseSnipeSize;
    
    // Size based on freshness - ULTRA AGGRESSIVE for new tokens
    if (ageMinutes < 5) {
      positionSize = Math.min(0.05, this.portfolio.currentBalance * 0.1); // Up to 10% of balance for <5min tokens
    } else if (ageMinutes < 15) {
      positionSize = Math.min(0.03, this.portfolio.currentBalance * 0.05); // Up to 5% for <15min tokens
    } else if (ageMinutes < 60) {
      positionSize = Math.min(0.02, this.portfolio.currentBalance * 0.02); // Up to 2% for <1h tokens
    } else {
      positionSize = Math.min(0.01, this.portfolio.currentBalance * 0.01); // Up to 1% for older tokens
    }
    
    // Minimum position size
    positionSize = Math.max(positionSize, 0.002);
    
    // Don't exceed available balance
    positionSize = Math.min(positionSize, this.portfolio.currentBalance - 0.001);
    
    // Get market price immediately with MULTIPLE SOURCES
    let entryPrice = 0.000001; // Default fallback
    let hasRealPrice = false;
    let priceSource = 'FALLBACK';
    
    try {
      // Try DexScreener first
      console.log(`🔍 PRICE HUNT: ${tokenInfo.symbol}...`);
      const tokenData = await this.dexScreenerClient.getTokenByAddress(tokenInfo.mint);
      if (tokenData && tokenData.priceUsd > 0) {
        entryPrice = tokenData.priceUsd;
        hasRealPrice = true;
        priceSource = 'DEXSCREENER';
        console.log(`✅ DexScreener price: $${entryPrice.toFixed(8)}`);
      }
    } catch (error) {
      console.log(`⚠️ DexScreener failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    // Try metadata price if no real price
    if (!hasRealPrice && tokenInfo.metadata?.priceUsd) {
      entryPrice = tokenInfo.metadata.priceUsd;
      hasRealPrice = true;
      priceSource = 'METADATA';
      console.log(`📊 Using metadata price: $${entryPrice.toFixed(8)}`);
    }
    
    // Try liquidity-based estimation
    if (!hasRealPrice && tokenInfo.liquidity?.usd && tokenInfo.liquidity.usd > 0) {
      // Rough price estimation based on liquidity
      entryPrice = 0.000001 + (tokenInfo.liquidity.usd / 1000000) * 0.00001;
      priceSource = 'LIQUIDITY_ESTIMATE';
      console.log(`📈 Liquidity-based estimate: $${entryPrice.toFixed(8)}`);
    }

    const position: SimulatedPosition = {
      id: positionId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      entryTime: Date.now(),
      entryPrice,
      simulatedInvestment: positionSize,
      currentPrice: entryPrice,
      status: 'ACTIVE',
      hasLivePrice: hasRealPrice,
      reason: `SNIPED: ${ageMinutes.toFixed(1)}min old, ${priceSource} price`
    };

    this.positions.set(position.id, position);
    this.portfolio.currentBalance -= positionSize;
    this.portfolio.totalInvested += positionSize;

    const buyTrade: SimulatedTrade = {
      id: tradeId,
      type: 'BUY',
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      amount: positionSize,
      price: entryPrice,
      timestamp: Date.now(),
      reason: `⚡ INSTANT SNIPE - Age: ${ageMinutes.toFixed(1)}min, Security: ${securityAnalysis.score} (IGNORED)`,
      simulation: true
    };

    this.trades.push(buyTrade);
    
    console.log(`⚡ SNIPED: ${tokenInfo.symbol} - ${positionSize.toFixed(4)} SOL @ $${entryPrice.toFixed(8)} [${priceSource}]`);
    console.log(`📊 Balance: ${this.portfolio.currentBalance.toFixed(4)} SOL | Positions: ${this.positions.size} | Age: ${ageMinutes.toFixed(1)}min`);
    
    this.emit('trade', buyTrade);
    this.emit('positionOpened', position);
    
    // Update portfolio metrics
    this.updatePortfolioMetrics();
  }

  private startPriceMonitoring(): void {
    // Update prices every 10 seconds for all positions
    setInterval(async () => {
      if (this.positions.size === 0) return;
      
      console.log(`🔄 Updating prices for ${this.positions.size} sniped positions...`);
      
      for (const [positionId, position] of this.positions) {
        if (position.status !== 'ACTIVE') continue;
        
        try {
          const tokenData = await this.dexScreenerClient.getTokenByAddress(position.mint);
          if (tokenData && tokenData.priceUsd > 0) {
            const previousPrice = position.currentPrice;
            position.currentPrice = tokenData.priceUsd;
            
            // Calculate ROI
            position.roi = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
            
            // Store price history
            if (!this.priceHistory.has(position.mint)) {
              this.priceHistory.set(position.mint, []);
            }
            const history = this.priceHistory.get(position.mint)!;
            history.push({ price: position.currentPrice, timestamp: Date.now() });
            
            // Keep only last 100 price points
            if (history.length > 100) {
              history.splice(0, history.length - 100);
            }
            
            // Log significant price changes
            if (previousPrice && Math.abs((position.currentPrice - previousPrice) / previousPrice) > 0.05) {
              const change = ((position.currentPrice - previousPrice) / previousPrice) * 100;
              const emoji = change > 0 ? '📈' : '📉';
              console.log(`${emoji} ${position.symbol}: $${position.currentPrice.toFixed(8)} (${change > 0 ? '+' : ''}${change.toFixed(1)}%) ROI: ${(position.roi || 0).toFixed(1)}%`);
            }
          }
        } catch (error) {
          // Silently continue if price fetch fails
        }
      }
      
      this.updatePortfolioMetrics();
    }, 10000); // Every 10 seconds
  }

  private startSellingLoop(): void {
    // Check for selling opportunities every 5 seconds
    setInterval(() => {
      this.checkSellingOpportunities();
    }, 5000);
  }

  private checkSellingOpportunities(): void {
    for (const [positionId, position] of this.positions) {
      if (position.status !== 'ACTIVE') continue;
      
      const roi = position.roi || 0;
      const ageMs = Date.now() - position.entryTime;
      const ageMinutes = ageMs / 60000;
      
      let shouldSell = false;
      let sellReason = '';
      let sellPercentage = 100;
      
      // Ultra-aggressive profit taking
      if (roi >= 1000) {
        shouldSell = true;
        sellPercentage = 90;
        sellReason = `🚀 MEGA PUMP: ${roi.toFixed(1)}% - Taking 90% profit`;
      } else if (roi >= 500) {
        shouldSell = true;
        sellPercentage = 80;
        sellReason = `🔥 HUGE PUMP: ${roi.toFixed(1)}% - Taking 80% profit`;
      } else if (roi >= 200) {
        shouldSell = true;
        sellPercentage = 60;
        sellReason = `💰 BIG PUMP: ${roi.toFixed(1)}% - Taking 60% profit`;
      } else if (roi >= 100) {
        shouldSell = true;
        sellPercentage = 40;
        sellReason = `📈 GOOD PUMP: ${roi.toFixed(1)}% - Taking 40% profit`;
      } else if (roi >= 50) {
        shouldSell = true;
        sellPercentage = 25;
        sellReason = `✅ PROFIT: ${roi.toFixed(1)}% - Taking 25% profit`;
      }
      
      // Stop losses
      else if (roi <= -50) {
        shouldSell = true;
        sellReason = `💀 STOP LOSS: ${roi.toFixed(1)}% - Cutting losses`;
      }
      
      // Time-based exits (hold max 2 hours)
      else if (ageMinutes > 120) {
        shouldSell = true;
        sellReason = `⏰ TIME EXIT: ${ageMinutes.toFixed(0)}min - Max hold time reached`;
      }
      
      if (shouldSell) {
        this.executeSell(position, sellPercentage, sellReason);
      }
    }
  }

  private executeSell(position: SimulatedPosition, sellPercentage: number, reason: string): void {
    const tradeId = `sell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sellAmount = (position.simulatedInvestment * sellPercentage) / 100;
    const currentValue = sellAmount * (1 + (position.roi || 0) / 100);
    const profit = currentValue - sellAmount;
    
    // Update portfolio
    this.portfolio.currentBalance += currentValue;
    this.portfolio.totalRealized += profit;
    
    const sellTrade: SimulatedTrade = {
      id: tradeId,
      type: sellPercentage === 100 ? 'SELL' : 'PARTIAL_SELL',
      mint: position.mint,
      symbol: position.symbol,
      amount: sellAmount,
      price: position.currentPrice || position.entryPrice,
      timestamp: Date.now(),
      reason,
      simulation: true
    };

    this.trades.push(sellTrade);
    
    if (sellPercentage === 100) {
      position.status = 'CLOSED';
      position.reason = reason;
      console.log(`🔄 SOLD: ${position.symbol} - ROI: ${(position.roi || 0).toFixed(1)}% - ${reason}`);
      this.emit('positionClosed', position);
    } else {
      // Partial sell - reduce position size
      position.simulatedInvestment *= (100 - sellPercentage) / 100;
      console.log(`🔄 PARTIAL SELL: ${position.symbol} - ${sellPercentage}% - ROI: ${(position.roi || 0).toFixed(1)}% - ${reason}`);
    }
    
    this.emit('trade', sellTrade);
    this.updatePortfolioMetrics();
  }

  private updatePortfolioMetrics(): void {
    let unrealizedPnL = 0;
    
    for (const position of this.positions.values()) {
      if (position.status === 'ACTIVE') {
        const currentValue = position.simulatedInvestment * (1 + (position.roi || 0) / 100);
        unrealizedPnL += currentValue - position.simulatedInvestment;
      }
    }
    
    this.portfolio.unrealizedPnL = unrealizedPnL;
    
    // Emit portfolio update
    this.emit('portfolioUpdate', this.getPortfolioStats());
  }

  getPortfolioStats() {
    const activePositions = Array.from(this.positions.values()).filter(p => p.status === 'ACTIVE');
    const closedPositions = Array.from(this.positions.values()).filter(p => p.status === 'CLOSED');
    const totalPortfolioValue = this.portfolio.currentBalance + this.portfolio.unrealizedPnL;
    const totalROI = ((totalPortfolioValue - this.portfolio.startingBalance) / this.portfolio.startingBalance) * 100;
    
    const winningTrades = this.trades.filter(t => t.type !== 'BUY' && (t.reason?.includes('PUMP') || t.reason?.includes('PROFIT')));
    const winRate = this.trades.length > 0 ? (winningTrades.length / this.trades.filter(t => t.type !== 'BUY').length) * 100 : 0;
    
    return {
      currentBalance: this.portfolio.currentBalance,
      totalInvested: this.portfolio.totalInvested,
      unrealizedPnL: this.portfolio.unrealizedPnL,
      totalRealized: this.portfolio.totalRealized,
      totalPortfolioValue,
      totalROI,
      activePositions: activePositions.length,
      closedPositions: closedPositions.length,
      totalTrades: this.trades.length,
      winRate,
      startingBalance: this.portfolio.startingBalance,
      // EUR conversions
      currentBalanceEur: this.priceConverter.solToEur(this.portfolio.currentBalance),
      totalInvestedEur: this.priceConverter.solToEur(this.portfolio.totalInvested),
      unrealizedPnLEur: this.priceConverter.solToEur(this.portfolio.unrealizedPnL),
      totalRealizedEur: this.priceConverter.solToEur(this.portfolio.totalRealized),
      totalPortfolioValueEur: this.priceConverter.solToEur(totalPortfolioValue),
      startingBalanceEur: this.priceConverter.solToEur(this.portfolio.startingBalance),
      solToEurRate: this.priceConverter.getSolRate()
    };
  }

  getActivePositions(): SimulatedPosition[] {
    return Array.from(this.positions.values()).filter(p => p.status === 'ACTIVE');
  }

  getRecentTrades(limit: number = 50): SimulatedTrade[] {
    return this.trades
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getPositions(): SimulatedPosition[] {
    return Array.from(this.positions.values());
  }

  clearClosedPositions(): void {
    for (const [id, position] of this.positions) {
      if (position.status === 'CLOSED') {
        this.positions.delete(id);
      }
    }
  }
}