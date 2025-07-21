/**
 * Multi-Strategy Trading Engine
 * Implements Conservative, Balanced, Aggressive, and Ultra-Aggressive strategies
 * Educational simulation with creator intelligence integration
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { UnifiedTokenInfo, CreatorIntelligence, SecurityInfo } from '../types/unified';

export type TradingStrategy = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE' | 'ULTRA_AGGRESSIVE';

export interface StrategyConfig {
  name: TradingStrategy;
  holdPattern: {
    [profitPercent: number]: {
      sell: number;
      hold: number;
      condition?: string;
      exitCondition?: string;
    };
  };
  stopLoss: number;
  maxHoldTime: number;
  riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA_HIGH';
  creatorMultiplierSensitivity: number; // How much creator intelligence affects this strategy
}

export interface StrategyDecision {
  action: 'BUY' | 'SELL' | 'HOLD' | 'PARTIAL_SELL';
  strategy: TradingStrategy;
  percentage: number; // Percentage to sell/buy
  reason: string;
  confidence: number;
  holdTimeRemaining: number;
  exitTriggers: string[];
  creatorInfluence: number;
}

export interface PositionManagement {
  positionId: string;
  strategy: TradingStrategy;
  entryPrice: number;
  currentPrice: number;
  roi: number;
  holdTime: number;
  remainingTokens: number;
  totalSold: number;
  lastAction: string;
  nextCheckTime: number;
  creatorMultiplier: number;
}

export class MultiStrategyEngine extends EventEmitter {
  private strategies!: Map<TradingStrategy, StrategyConfig>;
  private activePositions: Map<string, PositionManagement> = new Map();
  private strategyStats: Map<TradingStrategy, {
    totalTrades: number;
    winRate: number;
    avgROI: number;
    avgHoldTime: number;
  }> = new Map();

  constructor() {
    super();
    this.initializeStrategies();
    this.initializeStats();
    
    logger.info('🎯 Multi-Strategy Trading Engine initialized', {
      strategiesCount: this.strategies.size,
      educationalMode: true
    });
  }

  /**
   * Analyze token and determine trading decision based on strategy
   */
  async analyzeToken(
    tokenInfo: UnifiedTokenInfo,
    securityInfo: SecurityInfo,
    creatorIntelligence?: CreatorIntelligence,
    selectedStrategy: TradingStrategy = 'BALANCED'
  ): Promise<StrategyDecision> {
    
    const strategy = this.strategies.get(selectedStrategy)!;
    const tokenAge = Date.now() - tokenInfo.detectedAt;
    const securityScore = securityInfo.score;
    
    // Determine hold time based on token quality and strategy
    const qualityBasedHoldTime = this.calculateDynamicHoldTime(securityScore, strategy);
    
    // Apply creator intelligence multiplier
    let creatorMultiplier = 1.0;
    let creatorInfluence = 0;
    
    if (creatorIntelligence) {
      creatorMultiplier = creatorIntelligence.riskMultiplier;
      creatorInfluence = Math.abs(1 - creatorMultiplier) * strategy.creatorMultiplierSensitivity;
    }

    // Determine action based on token age and strategy
    let action: StrategyDecision['action'] = 'HOLD';
    let percentage = 0;
    let reason = '';
    let confidence = 0;
    
    // Buy window analysis (10 minutes optimal)
    const buyWindow = 10 * 60 * 1000; // 10 minutes
    if (tokenAge < buyWindow) {
      action = 'BUY';
      percentage = this.calculatePositionSize(securityScore, creatorMultiplier, strategy);
      reason = `New token within buy window (${Math.round(tokenAge / 60000)}min old)`;
      confidence = this.calculateConfidence(securityScore, creatorMultiplier, strategy);
    }

    // Hold decision analysis
    else if (tokenAge < qualityBasedHoldTime) {
      action = 'HOLD';
      reason = `Within optimal hold time for ${selectedStrategy.toLowerCase()} strategy`;
      confidence = Math.max(60, securityScore);
    }

    // Exit window analysis
    else {
      action = 'SELL';
      percentage = 100;
      reason = `Exceeded hold time for ${selectedStrategy.toLowerCase()} strategy`;
      confidence = 70;
    }

    // Apply creator intelligence adjustments
    if (creatorIntelligence) {
      if (creatorIntelligence.riskMultiplier < 0.8 && action === 'BUY') {
        // Flagged creator - reduce position or skip
        if (selectedStrategy === 'CONSERVATIVE') {
          action = 'HOLD';
          reason += ' (Flagged creator - conservative skip)';
        } else {
          percentage *= 0.5; // Reduce position size
          reason += ' (Flagged creator - reduced position)';
        }
      }
      
      if (creatorIntelligence.riskMultiplier > 1.2 && action === 'HOLD') {
        // Verified creator - extend hold time
        const extendedHoldTime = qualityBasedHoldTime * 1.5;
        if (tokenAge < extendedHoldTime) {
          reason += ' (Verified creator - extended hold)';
        }
      }
    }

    const decision: StrategyDecision = {
      action,
      strategy: selectedStrategy,
      percentage,
      reason,
      confidence,
      holdTimeRemaining: Math.max(0, qualityBasedHoldTime - tokenAge),
      exitTriggers: this.generateExitTriggers(strategy, securityInfo, creatorIntelligence),
      creatorInfluence
    };

    // Log educational decision
    logger.info(`🎯 Strategy decision: ${selectedStrategy}`, {
      token: tokenInfo.symbol,
      action,
      percentage,
      reason,
      securityScore,
      creatorMultiplier,
      educational: true
    });

    this.emit('strategyDecision', { tokenInfo, decision, securityInfo, creatorIntelligence });
    return decision;
  }

  /**
   * Evaluate existing position for exit strategy
   */
  async evaluatePosition(
    positionId: string,
    currentPrice: number,
    tokenInfo: UnifiedTokenInfo,
    securityInfo: SecurityInfo,
    creatorIntelligence?: CreatorIntelligence
  ): Promise<StrategyDecision> {
    
    const position = this.activePositions.get(positionId);
    if (!position) {
      throw new Error('Position not found');
    }

    const strategy = this.strategies.get(position.strategy)!;
    const roi = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    
    // Update position
    position.currentPrice = currentPrice;
    position.roi = roi;
    position.holdTime = Date.now() - Date.now(); // Simplified for demo

    // Determine exit action based on ROI and strategy hold patterns
    let action: StrategyDecision['action'] = 'HOLD';
    let percentage = 0;
    let reason = '';

    // Check stop loss first
    if (roi <= strategy.stopLoss) {
      action = 'SELL';
      percentage = 100;
      reason = `Stop loss triggered at ${roi.toFixed(1)}%`;
    }
    
    // Check profit levels
    else {
      for (const [profitLevel, pattern] of Object.entries(strategy.holdPattern)) {
        const profit = parseFloat(profitLevel);
        
        if (roi >= profit) {
          if (pattern.sell > 0) {
            action = 'PARTIAL_SELL';
            percentage = pattern.sell;
            reason = `${profit}% profit target reached - selling ${pattern.sell}%, holding ${pattern.hold}%`;
            
            // Apply creator intelligence
            if (creatorIntelligence) {
              if (creatorIntelligence.riskMultiplier < 0.8) {
                // Flagged creator - sell more aggressively
                percentage = Math.min(100, percentage * 1.5);
                reason += ' (Flagged creator - increased sell)';
              } else if (creatorIntelligence.riskMultiplier > 1.2) {
                // Verified creator - hold more
                percentage = Math.max(0, percentage * 0.7);
                reason += ' (Verified creator - reduced sell)';
              }
            }
            
            break;
          }
        }
      }
    }

    // Check for rugpull emergency exit
    if (this.detectEmergencyExit(securityInfo, creatorIntelligence)) {
      action = 'SELL';
      percentage = 100;
      reason = 'EMERGENCY EXIT: Rugpull indicators detected';
    }

    const decision: StrategyDecision = {
      action,
      strategy: position.strategy,
      percentage,
      reason,
      confidence: this.calculateExitConfidence(roi, action, strategy),
      holdTimeRemaining: Math.max(0, strategy.maxHoldTime - position.holdTime),
      exitTriggers: this.generateExitTriggers(strategy, securityInfo, creatorIntelligence),
      creatorInfluence: creatorIntelligence?.riskMultiplier || 1.0
    };

    // Update position management
    if (action === 'PARTIAL_SELL' || action === 'SELL') {
      position.totalSold += (position.remainingTokens * percentage / 100);
      position.remainingTokens *= (1 - percentage / 100);
      position.lastAction = action;
      position.nextCheckTime = Date.now() + 30000; // Check again in 30s
    }

    logger.info(`💰 Position evaluation: ${position.strategy}`, {
      positionId: positionId.slice(0, 8),
      roi: roi.toFixed(2),
      action,
      percentage,
      reason,
      educational: true
    });

    this.emit('positionEvaluated', { position, decision, tokenInfo });
    return decision;
  }

  /**
   * Get strategy statistics
   */
  getStrategyStats(): Map<TradingStrategy, any> {
    return new Map(Array.from(this.strategyStats.entries()).map(([strategy, stats]) => [
      strategy,
      {
        ...stats,
        performance: this.calculateStrategyPerformance(strategy),
        config: this.strategies.get(strategy)
      }
    ]));
  }

  /**
   * Switch strategy for new positions
   */
  setDefaultStrategy(strategy: TradingStrategy): void {
    if (!this.strategies.has(strategy)) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }

    logger.info(`🔄 Default strategy changed to: ${strategy}`);
    this.emit('strategyChanged', strategy);
  }

  // Private methods

  private initializeStrategies(): void {
    this.strategies = new Map([
      ['CONSERVATIVE', {
        name: 'CONSERVATIVE',
        holdPattern: {
          1000: { sell: 100, hold: 0 },
          500: { sell: 98, hold: 2 },
          300: { sell: 95, hold: 5 },
          200: { sell: 90, hold: 10 },
          100: { sell: 85, hold: 15 },
          50: { sell: 70, hold: 30 }
        },
        stopLoss: -15,
        maxHoldTime: 6 * 60 * 60 * 1000, // 6 hours
        riskTolerance: 'LOW',
        creatorMultiplierSensitivity: 0.8 // High sensitivity to creator risk
      }],
      
      ['BALANCED', {
        name: 'BALANCED',
        holdPattern: {
          1000: { sell: 95, hold: 5 },
          500: { sell: 90, hold: 10, exitCondition: 'UNTIL_RUGPULL' },
          300: { sell: 80, hold: 20 },
          200: { sell: 75, hold: 25 },
          100: { sell: 0, hold: 100, condition: 'MOMENTUM_BASED' },
          50: { sell: 0, hold: 100, condition: 'IF_PUMPING' }
        },
        stopLoss: -20,
        maxHoldTime: 2 * 60 * 60 * 1000, // 2 hours  
        riskTolerance: 'MEDIUM',
        creatorMultiplierSensitivity: 0.6 // Moderate sensitivity
      }],
      
      ['AGGRESSIVE', {
        name: 'AGGRESSIVE',
        holdPattern: {
          1000: { sell: 95, hold: 5 },
          500: { sell: 85, hold: 15 },
          300: { sell: 75, hold: 25 },
          200: { sell: 70, hold: 30 },
          100: { sell: 50, hold: 50 },
          50: { sell: 30, hold: 70 }
        },
        stopLoss: -20,
        maxHoldTime: 2 * 60 * 60 * 1000, // 2 hours
        riskTolerance: 'HIGH',
        creatorMultiplierSensitivity: 0.4 // Lower sensitivity - more risk tolerance
      }],
      
      ['ULTRA_AGGRESSIVE', {
        name: 'ULTRA_AGGRESSIVE',
        holdPattern: {
          1000: { sell: 100, hold: 0 },   // Moon or bust - sell everything at 1000%
          500: { sell: 90, hold: 10 },
          300: { sell: 85, hold: 15 },
          200: { sell: 80, hold: 20 },
          100: { sell: 70, hold: 30 },
          50: { sell: 50, hold: 50 }
        },
        stopLoss: -20,
        maxHoldTime: 30 * 60 * 1000, // 30 minutes - quick exits
        riskTolerance: 'ULTRA_HIGH',
        creatorMultiplierSensitivity: 0.2 // Very low sensitivity - ignore most creator risk
      }]
    ]);
  }

  private initializeStats(): void {
    for (const strategy of this.strategies.keys()) {
      this.strategyStats.set(strategy, {
        totalTrades: 0,
        winRate: 0,
        avgROI: 0,
        avgHoldTime: 0
      });
    }
  }

  private calculateDynamicHoldTime(securityScore: number, strategy: StrategyConfig): number {
    let baseHoldTime = strategy.maxHoldTime;
    
    // Adjust based on token quality
    if (securityScore >= 8) {
      baseHoldTime = 6 * 60 * 60 * 1000; // 6 hours for high quality
    } else if (securityScore >= 5) {
      baseHoldTime = 2 * 60 * 60 * 1000; // 2 hours standard
    } else {
      baseHoldTime = 30 * 60 * 1000; // 30 minutes for risky tokens
    }

    return Math.min(baseHoldTime, strategy.maxHoldTime);
  }

  private calculatePositionSize(securityScore: number, creatorMultiplier: number, strategy: StrategyConfig): number {
    let baseSize = 100; // 100% of configured position size

    // Adjust for security score
    if (securityScore < 3) {
      baseSize *= 0.5; // Reduce size for risky tokens
    } else if (securityScore > 7) {
      baseSize *= 1.2; // Increase size for safe tokens
    }

    // Apply creator multiplier
    baseSize *= creatorMultiplier;

    // Strategy-based adjustments
    if (strategy.riskTolerance === 'LOW') {
      baseSize *= 0.8;
    } else if (strategy.riskTolerance === 'ULTRA_HIGH') {
      baseSize *= 1.5;
    }

    return Math.min(100, Math.max(10, baseSize)); // Clamp between 10-100%
  }

  private calculateConfidence(securityScore: number, creatorMultiplier: number, strategy: StrategyConfig): number {
    let confidence = securityScore; // Start with security score

    // Creator intelligence impact
    if (creatorMultiplier > 1.2) {
      confidence += 10; // Boost for verified creators
    } else if (creatorMultiplier < 0.8) {
      confidence -= 15; // Reduce for flagged creators
    }

    // Strategy confidence adjustments
    if (strategy.riskTolerance === 'LOW') {
      confidence += 5; // Conservative strategies are more confident in their decisions
    }

    return Math.min(100, Math.max(10, confidence));
  }

  private generateExitTriggers(
    strategy: StrategyConfig,
    securityInfo: SecurityInfo,
    creatorIntelligence?: CreatorIntelligence
  ): string[] {
    const triggers: string[] = [
      `Stop loss at ${strategy.stopLoss}%`,
      `Max hold time: ${strategy.maxHoldTime / (60 * 1000)} minutes`
    ];

    // Security-based triggers
    if (securityInfo.score < 5) {
      triggers.push('Low security score - early exit recommended');
    }

    // Creator-based triggers  
    if (creatorIntelligence) {
      if (creatorIntelligence.riskMultiplier < 0.8) {
        triggers.push('Flagged creator - monitor for rugpull signals');
      }
      if (creatorIntelligence.rugpullHistory.count > 0) {
        triggers.push('Creator has rugpull history - immediate exit on warning signs');
      }
    }

    return triggers;
  }

  private detectEmergencyExit(securityInfo: SecurityInfo, creatorIntelligence?: CreatorIntelligence): boolean {
    // Educational emergency exit detection
    
    // Critical security flags
    if (securityInfo.riskIndicators.some(r => 
      r.type === 'HONEYPOT' && r.severity === 'CRITICAL'
    )) {
      return true;
    }

    // Creator rugpull signals
    if (creatorIntelligence && creatorIntelligence.flags.some(f => 
      f.type === 'RUGPULL_HISTORY' && f.severity === 'CRITICAL'
    )) {
      return true;
    }

    return false;
  }

  private calculateExitConfidence(roi: number, action: string, strategy: StrategyConfig): number {
    let confidence = 50; // Base confidence

    if (action === 'SELL' && roi <= strategy.stopLoss) {
      confidence = 95; // Very confident in stop loss
    } else if (action === 'PARTIAL_SELL' && roi > 100) {
      confidence = 85; // Confident in profit taking
    } else if (action === 'HOLD' && roi > 0 && roi < 50) {
      confidence = 70; // Moderate confidence in holding
    }

    return confidence;
  }

  private calculateStrategyPerformance(strategy: TradingStrategy): any {
    const stats = this.strategyStats.get(strategy)!;
    
    return {
      totalTrades: stats.totalTrades,
      winRate: stats.winRate,
      avgROI: stats.avgROI,
      avgHoldTime: stats.avgHoldTime,
      riskAdjustedReturn: stats.avgROI * (stats.winRate / 100),
      sharpeRatio: this.calculateSharpeRatio(strategy), // Simplified educational calculation
      maxDrawdown: Math.random() * 20 + 5, // 5-25% educational simulation
      profitFactor: stats.winRate > 0 ? (stats.avgROI / Math.abs(this.strategies.get(strategy)!.stopLoss)) : 0
    };
  }

  private calculateSharpeRatio(strategy: TradingStrategy): number {
    // Simplified Sharpe ratio calculation for educational purposes
    const stats = this.strategyStats.get(strategy)!;
    const riskFreeRate = 2; // 2% risk-free rate assumption
    const volatility = 15 + (Math.random() * 10); // 15-25% volatility simulation
    
    return (stats.avgROI - riskFreeRate) / volatility;
  }
}