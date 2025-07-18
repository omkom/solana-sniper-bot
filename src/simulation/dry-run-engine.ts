import { EventEmitter } from 'events';
import { TokenInfo, SecurityAnalysis, SimulatedPosition, SimulatedTrade, AnalysisConfig } from '../types';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';
import { Config } from '../core/config';
import { EnhancedTransactionWorkflows, TradeDecision } from '../trading/enhanced-transaction-workflows';
import { DexScreenerClient } from '../detection/dexscreener-client';

export class DryRunEngine extends EventEmitter implements EventEmittingSimulationEngine {
  private config: AnalysisConfig;
  private positions: Map<string, SimulatedPosition> = new Map();
  private trades: SimulatedTrade[] = [];
  private enhancedWorkflows: EnhancedTransactionWorkflows;
  private dexScreenerClient: DexScreenerClient;
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
    this.enhancedWorkflows = new EnhancedTransactionWorkflows();
    this.dexScreenerClient = new DexScreenerClient();
    console.log('🎮 Dry Run Engine initialized with Enhanced Transaction Workflows');
    console.log('💰 Starting with simulated balance: 10 SOL');
  }

  async processTokenDetection(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void> {
    let priceUsd = tokenInfo.metadata?.priceUsd || tokenInfo.metadata?.price || 0;
    let hasLivePrice = priceUsd > 0;
    
    // Try to fetch real price if not available
    if (!hasLivePrice && tokenInfo.mint) {
      console.log(`🔍 Fetching real-time price for ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}...`);
      try {
        const tokenData = await this.dexScreenerClient.getTokenByAddress(tokenInfo.mint);
        if (tokenData) {
          priceUsd = tokenData.priceUsd;
          hasLivePrice = true;
          console.log(`✅ Fetched price: $${priceUsd.toFixed(8)}`);
          
          // Update tokenInfo with fetched data
          tokenInfo.metadata = tokenInfo.metadata || {};
          tokenInfo.metadata.priceUsd = priceUsd;
          tokenInfo.metadata.price = priceUsd;
          tokenInfo.metadata.volume24h = tokenData.volume24h;
          tokenInfo.metadata.liquidityUsd = tokenData.liquidityUsd;
          tokenInfo.metadata.priceChange24h = tokenData.priceChange24h;
        }
      } catch (error) {
        console.log(`⚠️ Could not fetch real-time price: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log(`\n💰 ENHANCED WORKFLOW PROCESSING: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`🔒 Security score: ${securityAnalysis.score}/100`);
    console.log(`💵 Live price: ${hasLivePrice ? '$' + priceUsd.toFixed(8) : 'NOT AVAILABLE'}`);
    console.log(`💰 Current balance: ${this.portfolio.currentBalance.toFixed(4)} SOL`);
    console.log(`📈 Active positions: ${this.positions.size}/1000`);

    // Use enhanced workflows to evaluate trade opportunity
    const tradeDecision = this.enhancedWorkflows.evaluateTradeOpportunity(tokenInfo, securityAnalysis);
    
    console.log(`🎯 ENHANCED DECISION: ${tradeDecision.action}`);
    console.log(`📋 Strategy: ${tradeDecision.strategy.source} (${tradeDecision.strategy.priority} priority)`);
    console.log(`💭 Reason: ${tradeDecision.reason}`);
    console.log(`⚡ Urgency: ${tradeDecision.urgency}`);
    console.log(`💪 Confidence: ${tradeDecision.confidence}%`);
    console.log(`⚠️ Risk Level: ${tradeDecision.riskLevel}`);
    console.log(`💰 Position Size: ${tradeDecision.positionSize.toFixed(6)} SOL`);
    console.log(`⏰ Expected Hold: ${Math.round(tradeDecision.expectedHoldTime / 60000)}m`);
    
    if (tradeDecision.action === 'BUY' || tradeDecision.action === 'PRIORITY_BUY') {
      console.log(`✅ ${tradeDecision.action} DECISION APPROVED - Executing enhanced trade...`);
      
      if (tradeDecision.action === 'PRIORITY_BUY') {
        console.log(`🚨 PRIORITY EXECUTION: Ultra-high priority trade!`);
      }
      
      if (hasLivePrice) {
        console.log(`⚡ IMMEDIATE EXECUTION: Live price available - taking position NOW!`);
        await this.simulateEnhancedBuy(tokenInfo, securityAnalysis, tradeDecision);
      } else {
        console.log(`⏳ EXECUTING WITHOUT LIVE PRICE: Using simulated price`);
        await this.simulateEnhancedBuy(tokenInfo, securityAnalysis, tradeDecision);
      }
    } else if (tradeDecision.action === 'WATCH') {
      console.log(`👀 WATCHING: Adding to watch list for potential future entry`);
      // Could implement watch list logic here
      this.emit('tokenWatched', {
        mint: tokenInfo.mint,
        symbol: tokenInfo.symbol,
        reason: tradeDecision.reason,
        confidence: tradeDecision.confidence
      });
    } else {
      console.log(`❌ SKIPPING: ${tradeDecision.reason}`);
      
      // Emit skip event for tracking
      this.emit('tokenSkipped', {
        mint: tokenInfo.mint,
        symbol: tokenInfo.symbol,
        reason: tradeDecision.reason,
        confidence: tradeDecision.confidence,
        riskLevel: tradeDecision.riskLevel
      });
    }

    this.updatePortfolioMetrics();
    this.emit('portfolioUpdate', this.getPortfolioStats());
  }

  private evaluateTokenDecision(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): {
    action: 'BUY' | 'SKIP';
    reason: string;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  } {
    // ULTRA AGGRESSIVE: Buy almost everything for maximum trading activity in hybrid mode
    
    console.log(`🔍 EVALUATION: Security=${securityAnalysis.score}, Balance=${this.portfolio.currentBalance.toFixed(4)}, Positions=${this.positions.size}`);
    
    // Accept even very low security scores for maximum trading
    if (securityAnalysis.score < 0) {
      return {
        action: 'SKIP',
        reason: `Invalid security score (${securityAnalysis.score})`,
        urgency: 'LOW'
      };
    }

    // Increase max positions to 1000 for ultra aggressive trading
    if (this.positions.size >= 1000) {
      return {
        action: 'SKIP',
        reason: `Max positions reached (${this.positions.size}/1000)`,
        urgency: 'LOW'
      };
    }

    // Use smaller investment amount (0.002 SOL for even more positions)
    const investmentAmount = 0.002;
    if (this.portfolio.currentBalance < investmentAmount) {
      return {
        action: 'SKIP',
        reason: `Insufficient balance (${this.portfolio.currentBalance.toFixed(3)} SOL)`,
        urgency: 'LOW'
      };
    }

    // Extended age filter (2 hours max for more opportunities)
    const ageMs = Date.now() - tokenInfo.createdAt;
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours
    if (ageMs > maxAge) {
      return {
        action: 'SKIP',
        reason: `Token too old (${Math.round(ageMs / 1000 / 60)}m > ${maxAge / 1000 / 60}m)`,
        urgency: 'LOW'
      };
    }

    // Determine buy urgency based on factors
    let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    let buyReasons: string[] = [];

    // High urgency factors
    if (securityAnalysis.score >= 80) {
      urgency = 'HIGH';
      buyReasons.push('excellent security score');
    }
    
    if (tokenInfo.source === 'pump_detector' || tokenInfo.metadata?.pumpDetected) {
      urgency = 'HIGH';
      buyReasons.push('pump detected');
    }
    
    if (tokenInfo.liquidity?.usd && tokenInfo.liquidity.usd >= 25000) {
      urgency = 'HIGH';
      buyReasons.push('high liquidity');
    }

    // Medium urgency factors
    if (securityAnalysis.score >= 60) {
      buyReasons.push('good security score');
    }
    
    if (ageMs < 600000) { // Less than 10 minutes old
      urgency = urgency === 'HIGH' ? 'HIGH' : 'MEDIUM';
      buyReasons.push('fresh token');
    }

    if (tokenInfo.liquidity?.usd && tokenInfo.liquidity.usd >= 5000) {
      buyReasons.push('adequate liquidity');
    }
    
    // Hybrid mode bonus reasons
    if (tokenInfo.source && tokenInfo.source.includes('DEXSCREENER')) {
      buyReasons.push('DexScreener source');
    }

    // Build reason string
    const reasonText = buyReasons.length > 0 
      ? `HYBRID MODE: ${buyReasons.join(', ')}`
      : 'HYBRID MODE: Token meets minimum requirements';

    return {
      action: 'BUY',
      reason: reasonText,
      urgency
    };
  }

  private shouldSimulateBuy(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): boolean {
    const decision = this.evaluateTokenDecision(tokenInfo, securityAnalysis);
    return decision.action === 'BUY';
  }

  private calculateSmartPositionSize(tokenInfo: TokenInfo, securityScore: number, urgency: 'HIGH' | 'MEDIUM' | 'LOW'): number {
    // Base position size (reduced for more positions)
    let baseSize = 0.003; // 0.003 SOL base
    
    // Token age factor - newer tokens get larger positions
    const ageMs = Date.now() - tokenInfo.createdAt;
    const ageMinutes = ageMs / (1000 * 60);
    
    let ageFactor = 1.0;
    if (ageMinutes < 5) {
      ageFactor = 3.0; // 3x for very fresh tokens
    } else if (ageMinutes < 15) {
      ageFactor = 2.0; // 2x for fresh tokens
    } else if (ageMinutes < 30) {
      ageFactor = 1.5; // 1.5x for young tokens
    }
    
    // Liquidity factor - higher liquidity = larger position
    let liquidityFactor = 1.0;
    if (tokenInfo.liquidity?.usd) {
      if (tokenInfo.liquidity.usd >= 100000) {
        liquidityFactor = 2.5; // High liquidity
      } else if (tokenInfo.liquidity.usd >= 50000) {
        liquidityFactor = 2.0;
      } else if (tokenInfo.liquidity.usd >= 25000) {
        liquidityFactor = 1.5;
      } else if (tokenInfo.liquidity.usd >= 10000) {
        liquidityFactor = 1.2;
      }
    }
    
    // Security score factor
    let securityFactor = 1.0;
    if (securityScore >= 95) {
      securityFactor = 2.5; // Excellent security
    } else if (securityScore >= 90) {
      securityFactor = 2.0;
    } else if (securityScore >= 80) {
      securityFactor = 1.5;
    } else if (securityScore >= 70) {
      securityFactor = 1.2;
    }
    
    // Urgency factor
    let urgencyFactor = 1.0;
    if (urgency === 'HIGH') {
      urgencyFactor = 2.0; // Double for high urgency
    } else if (urgency === 'MEDIUM') {
      urgencyFactor = 1.5;
    }
    
    // Source factor - pump.fun tokens get higher allocation
    let sourceFactor = 1.0;
    if (tokenInfo.source === 'pump.fun' || tokenInfo.source === 'pump_detector') {
      sourceFactor = 1.8;
    } else if (tokenInfo.source === 'raydium') {
      sourceFactor = 1.5;
    }
    
    // Pump detection factor
    let pumpFactor = 1.0;
    if (tokenInfo.metadata?.pumpDetected) {
      pumpFactor = 2.0;
    }
    
    // Calculate final position size
    let finalSize = baseSize * ageFactor * liquidityFactor * securityFactor * urgencyFactor * sourceFactor * pumpFactor;
    
    // Portfolio balance factor - use smaller positions if balance is low
    const portfolioFactor = Math.min(1.0, this.portfolio.currentBalance / 5.0); // Scale down if less than 5 SOL
    finalSize *= portfolioFactor;
    
    // Cap maximum position size at 5% of portfolio
    const maxPositionSize = Math.min(this.portfolio.currentBalance * 0.05, 0.1); // Max 0.1 SOL
    finalSize = Math.min(finalSize, maxPositionSize);
    
    // Ensure minimum position size
    finalSize = Math.max(finalSize, 0.001);
    
    return finalSize;
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

  private async simulateBuy(tokenInfo: TokenInfo, securityScore: number, urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'): Promise<void> {
    const positionId = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Smart position sizing based on multiple factors
    let positionSize = this.calculateSmartPositionSize(tokenInfo, securityScore, urgency);
    
    // Ensure we don't exceed available balance
    positionSize = Math.min(positionSize, this.portfolio.currentBalance);

    // Use live price if available, otherwise simulate
    const livePrice = tokenInfo.metadata?.priceUsd || tokenInfo.metadata?.price;
    let entryPrice: number;
    
    if (livePrice && livePrice > 0) {
      entryPrice = livePrice;
      console.log(`💰 USING LIVE PRICE: $${entryPrice.toFixed(8)} for ${tokenInfo.symbol}`);
    } else {
      entryPrice = Math.random() * 0.001 + 0.0001; // Fallback random price
      console.log(`🎲 USING SIMULATED PRICE: $${entryPrice.toFixed(8)} for ${tokenInfo.symbol} (no live price available)`);
    }

    const position: SimulatedPosition = {
      id: positionId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      entryTime: Date.now(),
      simulatedInvestment: positionSize,
      entryPrice: entryPrice,
      status: 'ACTIVE',
      hasLivePrice: !!livePrice // Track if using live price
    };

    const trade: SimulatedTrade = {
      id: tradeId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      type: 'BUY',
      timestamp: Date.now(),
      price: entryPrice,
      amount: positionSize,
      reason: `${urgency} urgency, Security: ${securityScore}, Live Price: ${livePrice ? 'YES' : 'NO'}, Source: ${tokenInfo.source}`,
      simulation: true
    };

    // Update portfolio
    this.portfolio.currentBalance -= positionSize;
    this.portfolio.totalInvested += positionSize;

    // Store position and trade
    this.positions.set(positionId, position);
    this.trades.push(trade);

    console.log(`\n✅ TRADE EXECUTED SUCCESSFULLY: ${position.symbol}`);
    console.log(`💰 Amount: ${positionSize.toFixed(4)} SOL at $${entryPrice.toFixed(8)}`);
    console.log(`📊 Confidence: ${securityScore}/100, Live Price: ${livePrice ? 'YES' : 'NO'}`);
    console.log(`📈 New portfolio balance: ${this.portfolio.currentBalance.toFixed(4)} SOL`);
    console.log(`📈 Total positions now: ${this.positions.size}`);

    this.emit('trade', trade);
    this.emit('positionOpened', position);

    // Start monitoring this position for exit conditions
    this.monitorPosition(positionId);
  }

  private async simulateEnhancedBuy(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, tradeDecision: TradeDecision): Promise<void> {
    const positionId = `enh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tradeId = `etrade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Use position size from enhanced decision
    let positionSize = tradeDecision.positionSize;
    
    // Ensure we don't exceed available balance
    positionSize = Math.min(positionSize, this.portfolio.currentBalance);

    // Use live price if available, otherwise simulate
    const livePrice = tokenInfo.metadata?.priceUsd || tokenInfo.metadata?.price;
    let entryPrice: number;
    
    if (livePrice && livePrice > 0) {
      entryPrice = livePrice;
      console.log(`💰 ENHANCED: USING LIVE PRICE: $${entryPrice.toFixed(8)} for ${tokenInfo.symbol}`);
    } else {
      // More sophisticated price simulation based on source
      if (tradeDecision.strategy.source === 'PUMP_FUN') {
        entryPrice = Math.random() * 0.0001 + 0.00001; // Lower entry for pump.fun
      } else if (tradeDecision.strategy.source === 'RAYDIUM') {
        entryPrice = Math.random() * 0.001 + 0.0005; // Medium entry for Raydium
      } else {
        entryPrice = Math.random() * 0.01 + 0.001; // Higher entry for others
      }
      console.log(`🎲 ENHANCED: USING SIMULATED PRICE: $${entryPrice.toFixed(8)} for ${tokenInfo.symbol} (${tradeDecision.strategy.source})`);
    }

    const position: SimulatedPosition = {
      id: positionId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      entryTime: Date.now(),
      simulatedInvestment: positionSize,
      entryPrice: entryPrice,
      status: 'ACTIVE',
      hasLivePrice: !!livePrice,
      priceHistory: [{
        price: entryPrice,
        timestamp: Date.now()
      }]
    };

    // Add enhanced metadata to position
    (position as any).enhancedMetadata = {
      strategy: tradeDecision.strategy.source,
      priority: tradeDecision.strategy.priority,
      urgency: tradeDecision.urgency,
      confidence: tradeDecision.confidence,
      riskLevel: tradeDecision.riskLevel,
      expectedHoldTime: tradeDecision.expectedHoldTime,
      exitConditions: tradeDecision.strategy.exitConditions,
      entryReason: tradeDecision.reason,
      securityScore: securityAnalysis.score
    };

    this.positions.set(positionId, position);
    this.portfolio.currentBalance -= positionSize;
    this.portfolio.totalInvested += positionSize;

    const trade: SimulatedTrade = {
      id: tradeId,
      mint: tokenInfo.mint,
      symbol: tokenInfo.symbol || 'UNK',
      type: 'BUY',
      timestamp: Date.now(),
      price: entryPrice,
      amount: positionSize,
      reason: `Enhanced ${tradeDecision.action}: ${tradeDecision.reason}`,
      simulation: true
    };

    this.trades.push(trade);

    console.log(`\n✅ ENHANCED TRADE EXECUTED: ${position.symbol}`);
    console.log(`💰 Amount: ${positionSize.toFixed(6)} SOL at $${entryPrice.toFixed(8)}`);
    console.log(`🎯 Strategy: ${tradeDecision.strategy.source} (${tradeDecision.strategy.priority})`);
    console.log(`⚡ Urgency: ${tradeDecision.urgency}, Confidence: ${tradeDecision.confidence}%`);
    console.log(`⚠️ Risk: ${tradeDecision.riskLevel}, Expected Hold: ${Math.round(tradeDecision.expectedHoldTime / 60000)}m`);
    console.log(`📊 Security: ${securityAnalysis.score}/100, Live Price: ${livePrice ? 'YES' : 'NO'}`);
    console.log(`📈 New portfolio balance: ${this.portfolio.currentBalance.toFixed(4)} SOL`);
    console.log(`📈 Total positions now: ${this.positions.size}`);

    this.emit('trade', trade);
    this.emit('positionOpened', position);

    // Start enhanced monitoring for this position
    this.monitorEnhancedPosition(positionId);
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

    // Auto-close position after max time (longer for more realistic simulation)
    setTimeout(() => {
      if (this.positions.has(positionId)) {
        this.simulateSell(positionId, 'Maximum hold time reached');
      }
      clearInterval(monitoringInterval);
    }, 7200000); // Close after 2 hours max
  }

  private monitorEnhancedPosition(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position) return;

    const metadata = (position as any).enhancedMetadata;
    if (!metadata) {
      // Fallback to regular monitoring if no enhanced metadata
      this.monitorPosition(positionId);
      return;
    }

    console.log(`🔄 Starting enhanced monitoring for ${position.symbol} (${metadata.strategy})`);

    // Enhanced monitoring with strategy-specific intervals
    let monitoringInterval = 5000; // Default 5 seconds
    if (metadata.priority === 'ULTRA_HIGH') monitoringInterval = 3000; // 3 seconds for ultra high
    else if (metadata.priority === 'HIGH') monitoringInterval = 4000; // 4 seconds for high

    const monitor = setInterval(() => {
      if (!this.positions.has(positionId)) {
        clearInterval(monitor);
        return;
      }

      this.updateEnhancedPositionPrice(positionId);
      this.checkEnhancedExitConditions(positionId);
    }, monitoringInterval);

    // Strategy-specific max hold time
    const maxHoldTime = metadata.expectedHoldTime || metadata.strategy.maxHoldTime || 7200000;
    setTimeout(() => {
      if (this.positions.has(positionId)) {
        this.simulateSell(positionId, `Maximum hold time reached for ${metadata.strategy} strategy`);
      }
      clearInterval(monitor);
    }, maxHoldTime);
  }

  private updatePositionPrice(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE') return;

    // Store previous price for trend analysis
    const previousPrice = position.currentPrice || position.entryPrice;
    
    // Initialize price history if not exists
    if (!position.priceHistory) {
      position.priceHistory = [{ price: position.entryPrice, timestamp: position.entryTime }];
    }

    // Simulate more realistic price movement with pump/dump cycles
    const holdTimeMs = Date.now() - position.entryTime;
    const holdTimeMinutes = holdTimeMs / (1000 * 60);
    
    let volatility = 0.08; // 8% base volatility
    let bias = 0.003; // Initial upward bias
    
    // Simulate pump cycles - higher volatility and bias early on
    if (holdTimeMinutes < 5) {
      volatility = 0.15; // High volatility during pump
      bias = 0.008; // Strong upward bias
    } else if (holdTimeMinutes < 15) {
      volatility = 0.12;
      bias = 0.005;
    } else if (holdTimeMinutes < 30) {
      volatility = 0.10;
      bias = 0.002;
    } else {
      volatility = 0.06;
      bias = -0.001; // Slight downward bias after 30 minutes
    }
    
    // Add some randomness to simulate real market conditions
    const randomFactor = Math.random();
    if (randomFactor < 0.1) {
      // 10% chance of big pump
      bias += 0.05;
      volatility *= 1.5;
    } else if (randomFactor > 0.9) {
      // 10% chance of dump
      bias -= 0.03;
      volatility *= 1.3;
    }
    
    const change = (Math.random() - 0.5) * volatility + bias;
    const currentPrice = previousPrice * (1 + change);
    position.currentPrice = Math.max(0.0001, currentPrice);

    // Add to price history
    position.priceHistory.push({
      price: position.currentPrice,
      timestamp: Date.now()
    });

    // Keep only last 20 price points for trend analysis
    if (position.priceHistory.length > 20) {
      position.priceHistory = position.priceHistory.slice(-20);
    }

    // Calculate ROI
    position.roi = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;

    this.positions.set(positionId, position);
  }

  private updateEnhancedPositionPrice(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE') return;

    const metadata = (position as any).enhancedMetadata;
    if (!metadata) return;

    // Store previous price for trend analysis
    const previousPrice = position.currentPrice || position.entryPrice;
    
    // Initialize price history if not exists
    if (!position.priceHistory) {
      position.priceHistory = [{ price: position.entryPrice, timestamp: position.entryTime }];
    }

    // Strategy-specific price simulation
    const holdTimeMs = Date.now() - position.entryTime;
    const holdTimeMinutes = holdTimeMs / (1000 * 60);
    
    let volatility = 0.08; // Base volatility
    let bias = 0.003; // Initial upward bias

    // Strategy-specific characteristics
    if (metadata.strategy === 'PUMP_FUN') {
      // Pump.fun tokens: High volatility, strong early pump, then decline
      if (holdTimeMinutes < 2) {
        volatility = 0.25;
        bias = 0.015; // Very strong upward bias
      } else if (holdTimeMinutes < 5) {
        volatility = 0.20;
        bias = 0.008;
      } else if (holdTimeMinutes < 15) {
        volatility = 0.15;
        bias = -0.002; // Start declining
      } else {
        volatility = 0.12;
        bias = -0.005; // More decline
      }
    } else if (metadata.strategy === 'RAYDIUM') {
      // Raydium tokens: Medium volatility, steady growth then stabilization
      if (holdTimeMinutes < 5) {
        volatility = 0.12;
        bias = 0.008;
      } else if (holdTimeMinutes < 20) {
        volatility = 0.10;
        bias = 0.004;
      } else if (holdTimeMinutes < 45) {
        volatility = 0.08;
        bias = 0.001;
      } else {
        volatility = 0.06;
        bias = -0.001;
      }
    } else if (metadata.strategy === 'ORCA') {
      // Orca tokens: Lower volatility, gradual growth
      if (holdTimeMinutes < 10) {
        volatility = 0.10;
        bias = 0.005;
      } else if (holdTimeMinutes < 30) {
        volatility = 0.08;
        bias = 0.003;
      } else {
        volatility = 0.06;
        bias = 0.001;
      }
    } else {
      // Default/DexScreener: Moderate characteristics
      if (holdTimeMinutes < 15) {
        volatility = 0.10;
        bias = 0.004;
      } else {
        volatility = 0.08;
        bias = 0.001;
      }
    }

    // Risk level affects volatility
    if (metadata.riskLevel === 'VERY_HIGH') volatility *= 1.5;
    else if (metadata.riskLevel === 'HIGH') volatility *= 1.3;
    else if (metadata.riskLevel === 'LOW') volatility *= 0.8;
    else if (metadata.riskLevel === 'VERY_LOW') volatility *= 0.6;

    // Confidence affects bias (higher confidence = better performance tendency)
    const confidenceMultiplier = metadata.confidence / 100;
    bias *= (0.5 + confidenceMultiplier);

    // Add some randomness with occasional big moves
    const randomFactor = Math.random();
    if (randomFactor < 0.05) {
      // 5% chance of big pump
      bias += 0.08;
      volatility *= 2.0;
    } else if (randomFactor > 0.95) {
      // 5% chance of big dump
      bias -= 0.05;
      volatility *= 1.8;
    }
    
    const change = (Math.random() - 0.5) * volatility + bias;
    const currentPrice = previousPrice * (1 + change);
    position.currentPrice = Math.max(0.0001, currentPrice);

    // Add to price history
    position.priceHistory.push({
      price: position.currentPrice,
      timestamp: Date.now()
    });

    // Keep only last 20 price points for trend analysis
    if (position.priceHistory.length > 20) {
      position.priceHistory = position.priceHistory.slice(-20);
    }

    // Calculate ROI
    position.roi = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;

    this.positions.set(positionId, position);
  }

  private isPumping(position: SimulatedPosition): boolean {
    if (!position.priceHistory || position.priceHistory.length < 5) {
      return true; // Assume pumping if not enough data
    }

    // Check if price has been generally increasing over last 5 data points
    const recentPrices = position.priceHistory.slice(-5);
    let increasingCount = 0;
    
    for (let i = 1; i < recentPrices.length; i++) {
      if (recentPrices[i].price > recentPrices[i-1].price) {
        increasingCount++;
      }
    }
    
    // Consider it pumping if at least 60% of recent moves were up
    return increasingCount >= 3;
  }

  private simulatePartialSell(positionId: string, exitPercentage: number, reason: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE') return;

    const currentPrice = position.currentPrice || position.entryPrice;
    const roi = position.roi || 0;
    const partialInvestment = position.simulatedInvestment * exitPercentage;
    const exitValue = partialInvestment * (1 + roi / 100);

    // Create sell trade for partial exit
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sellTrade: SimulatedTrade = {
      id: tradeId,
      mint: position.mint,
      symbol: position.symbol,
      type: 'PARTIAL_SELL',
      timestamp: Date.now(),
      price: currentPrice,
      amount: exitValue,
      reason: reason,
      simulation: true
    };

    // Update position - reduce investment amount but keep position open
    position.simulatedInvestment = position.simulatedInvestment * (1 - exitPercentage);
    
    // Update portfolio
    this.portfolio.currentBalance += exitValue;
    this.portfolio.totalRealized += (exitValue - partialInvestment);
    this.portfolio.totalInvested -= partialInvestment;

    this.trades.push(sellTrade);
    this.positions.set(positionId, position);

    const profitLoss = exitValue - partialInvestment;
    const profitLossText = profitLoss >= 0 ? `+${profitLoss.toFixed(4)}` : profitLoss.toFixed(4);

    console.log(`📊 Partial SELL (${(exitPercentage * 100).toFixed(0)}%): ${position.symbol}`);
    // console.log(`💰 Exit: ${exitValue.toFixed(4)} SOL (${profitLossText} SOL, ${roi.toFixed(1)}%)`);
    // console.log(`📝 Reason: ${reason}`);
    // console.log(`🔄 Remaining position: ${position.simulatedInvestment.toFixed(4)} SOL`);

    this.emit('trade', sellTrade);
  }

  private checkExitConditions(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE' || !position.roi) return;

    let shouldExit = false;
    let exitReason = '';
    let partialExit = false;
    let exitPercentage = 1.0; // Default to full exit

    const holdTimeMs = Date.now() - position.entryTime;
    const holdTimeMinutes = holdTimeMs / (1000 * 60);

    // Maximum profit exit strategy
    if (position.roi >= 500) {
      // Massive gains - sell 80% and let 20% ride
      shouldExit = true;
      partialExit = true;
      exitPercentage = 0.8;
      exitReason = `Maximum profit strategy - 500%+ gains (${position.roi.toFixed(1)}%)`;
    }
    else if (position.roi >= 200) {
      // Great gains - sell 60% and let 40% ride
      shouldExit = true;
      partialExit = true;
      exitPercentage = 0.6;
      exitReason = `High profit strategy - 200%+ gains (${position.roi.toFixed(1)}%)`;
    }
    else if (position.roi >= 100) {
      // Good gains - sell 40% and let 60% ride if still pumping
      const isStillPumping = this.isPumping(position);
      if (!isStillPumping) {
        shouldExit = true;
        exitReason = `100%+ gains but pump slowing (${position.roi.toFixed(1)}%)`;
      } else {
        // Partial exit to secure some profits
        shouldExit = true;
        partialExit = true;
        exitPercentage = 0.4;
        exitReason = `Partial profit taking - still pumping (${position.roi.toFixed(1)}%)`;
      }
    }
    else if (position.roi >= 50) {
      // Moderate gains - hold if pumping, exit if stalling
      const isStillPumping = this.isPumping(position);
      if (!isStillPumping || holdTimeMinutes > 30) {
        shouldExit = true;
        exitReason = `50%+ gains but ${!isStillPumping ? 'pump stalling' : 'holding too long'} (${position.roi.toFixed(1)}%)`;
      }
    }
    else if (position.roi >= 25) {
      // Small gains - hold if young token and pumping
      const isStillPumping = this.isPumping(position);
      if (!isStillPumping && holdTimeMinutes > 15) {
        shouldExit = true;
        exitReason = `25%+ gains but pump fading (${position.roi.toFixed(1)}%)`;
      }
    }
    // Stop loss conditions
    else if (position.roi <= -30) {
      shouldExit = true;
      exitReason = 'Stop loss triggered (-30%)';
    }
    // Time-based exit for stagnant positions
    else if (holdTimeMinutes > 60 && position.roi < 10) {
      shouldExit = true;
      exitReason = `Time exit - 1 hour with minimal gains (${position.roi.toFixed(1)}%)`;
    }
    // Emergency exit for very old positions
    else if (holdTimeMinutes > 120) {
      shouldExit = true;
      exitReason = `Emergency time exit - 2 hours (${position.roi.toFixed(1)}%)`;
    }

    if (shouldExit) {
      if (partialExit) {
        this.simulatePartialSell(positionId, exitPercentage, exitReason);
      } else {
        this.simulateSell(positionId, exitReason);
      }
    }
  }

  private checkEnhancedExitConditions(positionId: string): void {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'ACTIVE' || !position.roi) return;

    const metadata = (position as any).enhancedMetadata;
    if (!metadata) {
      // Fallback to regular exit conditions
      this.checkExitConditions(positionId);
      return;
    }

    const holdTimeMs = Date.now() - position.entryTime;
    const holdTimeMinutes = holdTimeMs / (1000 * 60);
    
    let shouldExit = false;
    let exitReason = '';
    let partialExit = false;
    let exitPercentage = 1.0;

    // Use strategy-specific exit conditions
    const exitConditions = metadata.exitConditions;
    
    // Check take profit levels in order (highest first)
    for (const level of exitConditions.takeProfitLevels.sort((a: any, b: any) => b.roi - a.roi)) {
      if (position.roi >= level.roi) {
        shouldExit = true;
        if (level.sellPercentage < 100) {
          partialExit = true;
          exitPercentage = level.sellPercentage / 100;
        }
        exitReason = `Enhanced: ${level.reason} (${position.roi.toFixed(1)}% ROI)`;
        break;
      }
    }

    // Check stop loss
    if (!shouldExit && position.roi <= exitConditions.stopLoss.roi) {
      shouldExit = true;
      exitReason = `Enhanced: ${exitConditions.stopLoss.reason} (${position.roi.toFixed(1)}% ROI)`;
    }

    // Check time-based exit if specified
    if (!shouldExit && exitConditions.timeBasedExit) {
      if (holdTimeMs >= exitConditions.timeBasedExit.maxHoldTime) {
        shouldExit = true;
        exitReason = `Enhanced: ${exitConditions.timeBasedExit.reason} (${Math.round(holdTimeMinutes)}m hold)`;
      }
    }

    // Strategy-specific additional conditions
    if (!shouldExit) {
      if (metadata.strategy === 'PUMP_FUN') {
        // Pump.fun specific: Exit quickly if momentum stalls
        if (position.roi >= 30 && !this.isPumping(position)) {
          shouldExit = true;
          exitReason = `Enhanced: Pump.fun momentum stall (${position.roi.toFixed(1)}% ROI)`;
        } else if (holdTimeMinutes > 10 && position.roi < 0) {
          shouldExit = true;
          exitReason = `Enhanced: Pump.fun time exit - no gains after 10m (${position.roi.toFixed(1)}% ROI)`;
        }
      } else if (metadata.strategy === 'RAYDIUM') {
        // Raydium specific: More patient approach
        if (position.roi >= 20 && holdTimeMinutes > 45 && !this.isPumping(position)) {
          shouldExit = true;
          exitReason = `Enhanced: Raydium extended hold exit (${position.roi.toFixed(1)}% ROI)`;
        }
      } else if (metadata.strategy === 'ORCA') {
        // Orca specific: Conservative approach
        if (position.roi >= 15 && holdTimeMinutes > 60) {
          shouldExit = true;
          exitReason = `Enhanced: Orca conservative exit (${position.roi.toFixed(1)}% ROI)`;
        }
      }
    }

    // Risk level adjustments
    if (!shouldExit && metadata.riskLevel === 'VERY_HIGH') {
      // More aggressive exit for very high risk positions
      if (position.roi >= 30 || (position.roi <= -15 && holdTimeMinutes > 5)) {
        shouldExit = true;
        exitReason = `Enhanced: Very high risk exit (${position.roi.toFixed(1)}% ROI)`;
      }
    } else if (!shouldExit && metadata.riskLevel === 'VERY_LOW') {
      // More patient with very low risk positions
      if (position.roi >= 200 || (position.roi <= -25 && holdTimeMinutes > 30)) {
        shouldExit = true;
        exitReason = `Enhanced: Very low risk exit (${position.roi.toFixed(1)}% ROI)`;
      }
    }

    // Confidence-based adjustments
    if (!shouldExit && metadata.confidence < 30) {
      // Less patient with low confidence positions
      if (position.roi >= 25 || (position.roi <= -10 && holdTimeMinutes > 10)) {
        shouldExit = true;
        exitReason = `Enhanced: Low confidence exit (${position.roi.toFixed(1)}% ROI)`;
      }
    }

    if (shouldExit) {
      console.log(`🎯 ENHANCED EXIT: ${position.symbol} - ${exitReason}`);
      console.log(`📊 Strategy: ${metadata.strategy}, Confidence: ${metadata.confidence}%, Risk: ${metadata.riskLevel}`);
      
      if (partialExit) {
        console.log(`📈 Partial exit: ${(exitPercentage * 100).toFixed(0)}% of position`);
        this.simulatePartialSell(positionId, exitPercentage, exitReason);
      } else {
        console.log(`📈 Full exit of position`);
        this.simulateSell(positionId, exitReason);
      }
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
    // console.log(`💰 Exit: ${exitValue.toFixed(4)} SOL (${profitLossText} SOL, ${roi.toFixed(1)}%)`);
    // console.log(`📝 Reason: ${reason}`);

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
    const activePositions = Array.from(this.positions.values()).filter(p => p.status === 'ACTIVE');
    const closedPositions = Array.from(this.positions.values()).filter(p => p.status === 'CLOSED');
    const enhancedPositions = activePositions.filter(p => (p as any).enhancedMetadata);
    
    const totalPortfolioValue = this.portfolio.currentBalance + this.portfolio.totalInvested + this.portfolio.unrealizedPnL;
    const totalROI = ((totalPortfolioValue - this.portfolio.startingBalance) / this.portfolio.startingBalance) * 100;

    const winningTrades = closedPositions.filter(p => (p.roi || 0) > 0).length;
    const winRate = closedPositions.length > 0 ? (winningTrades / closedPositions.length) * 100 : 0;

    // Enhanced workflow statistics
    const enhancedStats = this.enhancedWorkflows.getStrategyStats();
    
    // Strategy breakdown
    const strategyBreakdown: any = {};
    enhancedPositions.forEach(p => {
      const strategy = (p as any).enhancedMetadata?.strategy || 'unknown';
      if (!strategyBreakdown[strategy]) {
        strategyBreakdown[strategy] = { count: 0, totalInvested: 0, avgROI: 0 };
      }
      strategyBreakdown[strategy].count++;
      strategyBreakdown[strategy].totalInvested += p.simulatedInvestment;
      strategyBreakdown[strategy].avgROI = (strategyBreakdown[strategy].avgROI + (p.roi || 0)) / strategyBreakdown[strategy].count;
    });

    return {
      currentBalance: this.portfolio.currentBalance,
      totalInvested: this.portfolio.totalInvested,
      unrealizedPnL: this.portfolio.unrealizedPnL,
      totalRealized: this.portfolio.totalRealized,
      totalPortfolioValue,
      totalROI,
      activePositions: activePositions.length,
      enhancedPositions: enhancedPositions.length,
      closedPositions: closedPositions.length,
      totalTrades: this.trades.length,
      winRate,
      startingBalance: this.portfolio.startingBalance,
      enhancedWorkflowStats: enhancedStats,
      strategyBreakdown
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