# 🎯 Trading Strategies Documentation

Comprehensive guide to the multi-strategy educational trading system with creator intelligence and advanced profit maximization techniques.

## 📊 Strategy Overview

The Educational Solana Token Analyzer uses a sophisticated multi-strategy approach for maximum profit extraction while maintaining strict educational boundaries.

## 1. 🎨 Entry Strategy Framework

### 1.1 Enhanced Token Selection Criteria
```typescript
interface EnhancedEntryStrategy {
  // Priority-based detection (Ultra-fast <5s target)
  detectionCriteria: {
    maxAge: 600000;           // 10 minutes optimal window
    fallbackAge: 3600000;     // 1 hour analysis window (improved from 3h)
    sources: {
      pumpfun: { priority: 1; multiplier: 2.0; weight: 40 };
      raydium: { priority: 2; multiplier: 1.8; weight: 30 };
      orca: { priority: 3; multiplier: 1.5; weight: 20 };
      jupiter: { priority: 4; multiplier: 1.2; weight: 10 };
    };
  };
  
  // Enhanced security scoring (Show ALL tokens)
  securityCriteria: {
    minScore: 1;              // Show all tokens with warnings
    displayAll: true;         // Never filter tokens
    colorCoding: {
      green: 'score >= 70';    // 🟢 Proceed with confidence
      orange: 'score >= 40';   // 🟠 Proceed with caution
      red: 'score < 40';       // 🔴 High risk warning
    };
    radarChart: true;         // Detailed breakdown
    tokenIcons: true;         // Visual identification
  };
  
  // Creator intelligence integration
  creatorFactors: {
    trackAllCreators: true;
    riskMultipliers: {
      verified: 1.3;          // 30% position boost
      unknown: 1.0;           // Neutral
      flagged: 0.7;           // 30% position reduction
    };
    rugpullEarlyWarning: true;
    socialMediaVerification: true;
  };
  
  // Market conditions
  marketFactors: {
    minLiquidity: 500;        // $500 USD minimum (very permissive)
    volumeAnalysis: true;
    priceStability: true;
    holderDistribution: true;
  };
}
```

### 1.2 Dynamic Confidence Scoring Algorithm
```typescript
function calculateEnhancedEntryScore(token: EnhancedTokenInfo): EntryScore {
  let score = 0;
  const weights = {
    security: 0.35,           // 35% weight - security analysis
    timing: 0.25,             // 25% weight - age and detection speed
    liquidity: 0.20,          // 20% weight - market liquidity
    creator: 0.15,            // 15% weight - creator intelligence
    social: 0.05              // 5% weight - social verification
  };
  
  // Security analysis (Priority-based scoring)
  const securityScore = (
    token.security.honeypotRisk * 0.4 +           // Highest priority
    token.security.liquidityLocked * 0.2 +       // High priority
    token.security.ownershipRenounced * 0.2 +    // High priority
    token.security.contractVerified * 0.1 +      // Medium priority
    token.security.holderDistribution * 0.1      // Medium priority
  );
  score += securityScore * weights.security;
  
  // Timing analysis (Age-based with exponential decay)
  const ageMinutes = (Date.now() - token.createdAt) / 60000;
  const timingScore = Math.max(0, 100 - Math.pow(ageMinutes / 10, 1.5) * 20);
  score += timingScore * weights.timing;
  
  // Liquidity analysis
  const liquidityScore = Math.min(100, Math.log10(token.liquidityUSD / 1000) * 30);
  score += liquidityScore * weights.liquidity;
  
  // Creator intelligence scoring
  const creatorProfile = getCreatorProfile(token.creatorWallet);
  const creatorScore = calculateCreatorScore(creatorProfile);
  score += creatorScore * weights.creator;
  
  // Social media verification
  const socialScore = (
    (token.social.twitterVerified ? 50 : 0) +
    (token.social.telegramActive ? 30 : 0) +
    (token.social.websiteValid ? 20 : 0)
  );
  score += socialScore * weights.social;
  
  return {
    total: Math.min(100, Math.max(0, score)),
    breakdown: {
      security: securityScore,
      timing: timingScore,
      liquidity: liquidityScore,
      creator: creatorScore,
      social: socialScore
    },
    recommendation: score >= 70 ? 'STRONG_BUY' : score >= 50 ? 'BUY' : score >= 30 ? 'CAUTION' : 'AVOID',
    confidence: Math.min(1, score / 100)
  };
}
```

### 1.3 Creator-Aware Position Sizing
```typescript
function calculateEnhancedPositionSize(
  token: EnhancedTokenInfo,
  score: EntryScore,
  portfolio: Portfolio
): PositionSize {
  // Base position size (UI configurable)
  const baseSize = portfolio.settings.basePositionSize; // 0.003 SOL default, 0.001-0.01 range
  
  // Multi-factor multipliers
  const multipliers = {
    // Source priority multipliers
    source: getSourceMultiplier(token.source),        // 2.0x (Pump), 1.8x (Raydium), etc.
    
    // Age-based multipliers (fresher = larger)
    age: getAgeMultiplier(token.age),                 // 3x (<5min), 2x (<15min), etc.
    
    // Security score multipliers
    security: getSecurityMultiplier(score.total),      // 2.5x (95+), 2x (90+), etc.
    
    // Liquidity multipliers
    liquidity: getLiquidityMultiplier(token.liquidityUSD), // 2.5x ($100K+), 2x ($50K+), etc.
    
    // Creator intelligence multipliers
    creator: getCreatorMultiplier(token.creatorWallet),    // 1.3x (verified), 0.7x (flagged)
    
    // Volatility adjustment
    volatility: getVolatilityMultiplier(token.volatility), // 1.5x (stable), 0.8x (extreme)
  };
  
  // Calculate final position size
  const finalMultiplier = Object.values(multipliers).reduce((a, b) => a * b, 1);
  let positionSize = baseSize * finalMultiplier;
  
  // Apply portfolio constraints
  const maxPositionSize = portfolio.balance * 0.02; // 2% max per position
  const availableBalance = portfolio.balance - portfolio.totalInvested;
  const maxAffordable = availableBalance / Math.max(1, portfolio.maxPositions - portfolio.activePositions);
  
  positionSize = Math.min(positionSize, maxPositionSize, maxAffordable);
  
  return {
    solAmount: Math.max(0.001, positionSize), // Minimum 0.001 SOL
    multipliers,
    finalMultiplier,
    confidence: score.confidence,
    reasoning: generatePositionSizeReasoning(multipliers, score)
  };
}
```

## 2. 🚀 Multi-Strategy Exit System

### 2.1 Four-Strategy Approach
```typescript
const ENHANCED_EXIT_STRATEGIES = {
  // Ultra-Aggressive: Moon or bust approach
  ULTRA_AGGRESSIVE: {
    name: 'Ultra-Aggressive (1% Hold)',
    description: 'Maximum profit extraction with minimal safety holds',
    holdPercentages: {
      1000: 0,    // Sell 100% at 1000% - secure massive gains
      500: 10,    // Hold 10% at 500%
      300: 15,    // Hold 15% at 300%
      200: 20,    // Hold 20% at 200%
      100: 30,    // Hold 30% at 100%
      50: 50      // Hold 50% at 50%
    },
    stopLoss: -20,            // Improved from -30%
    trailingStop: {
      activation: 300,        // Activate at 300%
      distance: 20           // 20% trailing distance
    },
    timeouts: {
      emergency: 7200000,    // 2 hours emergency exit
      stagnant: 3600000      // 1 hour for stagnant positions
    }
  },
  
  // Balanced: Optimal risk-reward (Default)
  BALANCED: {
    name: 'Balanced (10% Hold)',
    description: 'Optimal balance of profit-taking and upside capture',
    holdPercentages: {
      500: 10,    // Hold 10% until rugpull detection
      200: 25,    // Hold 25% at 200%
      100: 0,     // Momentum-based decision at 100%
      50: 0       // Hold if pumping momentum detected
    },
    conditions: {
      momentum: true,         // Consider pump momentum
      rugpullAware: true,    // Exit on rugpull signals
      creatorAware: true     // Adjust based on creator history
    },
    stopLoss: -20,
    dynamicHoldTimes: {
      highQuality: 21600000, // 6 hours for score >8
      standard: 7200000,     // 2 hours standard
      risky: 1800000        // 30 minutes for score <5
    }
  },
  
  // Conservative: Lower risk, steady gains
  CONSERVATIVE: {
    name: 'Conservative (5% Hold)',
    description: 'Lower risk approach with early profit-taking',
    holdPercentages: {
      300: 5,     // Hold 5% at 300%
      100: 15,    // Hold 15% at 100%
      50: 30      // Hold 30% at 50%
    },
    stopLoss: -15,          // Earlier stop-loss
    quickExit: true,
    timeouts: {
      emergency: 3600000,   // 1 hour emergency exit
      stagnant: 1800000     // 30 minutes for stagnant
    }
  },
  
  // Aggressive: High risk, high reward
  AGGRESSIVE: {
    name: 'Aggressive (15% Hold)',
    description: 'Higher risk approach for maximum upside',
    holdPercentages: {
      1000: 5,    // Hold 5% at 1000%
      500: 15,    // Hold 15% at 500%
      200: 30,    // Hold 30% at 200%
      100: 50,    // Hold 50% at 100%
      50: 70      // Hold 70% at 50%
    },
    stopLoss: -20,
    extendedHolds: true,
    pumpAware: true
  }
};
```

### 2.2 Creator-Aware Exit Logic
```typescript
function determineCreatorAwareExit(
  position: Position,
  currentROI: number,
  strategy: ExitStrategy,
  creatorProfile: CreatorProfile
): ExitDecision {
  const baseDecision = strategy.determineExit(currentROI, position);
  
  // Creator-specific adjustments
  const creatorAdjustments = {
    // Verified creators: Extended holds
    verified: {
      holdMultiplier: 1.2,    // Hold 20% longer
      stopLossBuffer: 0.05,   // 5% more lenient stop-loss
      confidenceBoost: 0.1    // 10% confidence boost
    },
    
    // Unknown creators: Standard approach
    unknown: {
      holdMultiplier: 1.0,
      stopLossBuffer: 0.0,
      confidenceBoost: 0.0
    },
    
    // Flagged creators: Quick exits
    flagged: {
      holdMultiplier: 0.7,    // Hold 30% less time
      stopLossBuffer: -0.05,  // 5% tighter stop-loss
      confidenceBoost: -0.2   // 20% confidence reduction
    }
  };
  
  const creatorType = creatorProfile.verified ? 'verified' : 
                     creatorProfile.flagged ? 'flagged' : 'unknown';
  const adjustments = creatorAdjustments[creatorType];
  
  // Apply creator-based adjustments
  const adjustedDecision = {
    ...baseDecision,
    holdPercentage: Math.min(100, baseDecision.holdPercentage * adjustments.holdMultiplier),
    confidence: Math.max(0, Math.min(1, baseDecision.confidence + adjustments.confidenceBoost)),
    stopLoss: strategy.stopLoss + adjustments.stopLossBuffer * 100
  };
  
  // Rugpull early warning overrides
  const earlyWarnings = detectEarlyWarningSignals(creatorProfile.walletAddress, position.tokenMint);
  if (earlyWarnings.some(w => w.severity === 'CRITICAL')) {
    return {
      action: 'EMERGENCY_EXIT',
      percentage: 100,
      reason: 'Rugpull early warning - Creator flagged for immediate exit',
      urgency: 'CRITICAL',
      creatorRisk: true
    };
  }
  
  return adjustedDecision;
}
```

### 2.3 Advanced Pump Detection & Momentum Analysis
```typescript
class AdvancedPumpDetector {
  private priceHistory: Map<string, PricePoint[]> = new Map();
  private volumeHistory: Map<string, VolumePoint[]> = new Map();
  
  analyzePumpMomentum(tokenMint: string, currentPrice: number, volume: number): PumpAnalysis {
    const priceData = this.priceHistory.get(tokenMint) || [];
    const volumeData = this.volumeHistory.get(tokenMint) || [];
    
    // Add current data point
    priceData.push({ price: currentPrice, timestamp: Date.now() });
    volumeData.push({ volume, timestamp: Date.now() });
    
    // Keep only last 20 data points (10 minutes at 30s intervals)
    if (priceData.length > 20) priceData.shift();
    if (volumeData.length > 20) volumeData.shift();
    
    this.priceHistory.set(tokenMint, priceData);
    this.volumeHistory.set(tokenMint, volumeData);
    
    if (priceData.length < 5) {
      return { isPumping: true, confidence: 0.5, momentum: 'UNKNOWN' };
    }
    
    // Multi-timeframe analysis
    const analysis = {
      shortTerm: this.analyzeTimeframe(priceData.slice(-5), volumeData.slice(-5)),   // 2.5 minutes
      mediumTerm: this.analyzeTimeframe(priceData.slice(-10), volumeData.slice(-10)), // 5 minutes
      longTerm: this.analyzeTimeframe(priceData, volumeData)                         // 10 minutes
    };
    
    // Weighted momentum score
    const momentumScore = (
      analysis.shortTerm.momentum * 0.5 +
      analysis.mediumTerm.momentum * 0.3 +
      analysis.longTerm.momentum * 0.2
    );
    
    // Volume confirmation
    const volumeConfirmation = this.analyzeVolumePattern(volumeData);
    
    // Social sentiment integration (if available)
    const socialSentiment = this.getSocialSentiment(tokenMint);
    
    // Final pump determination
    const isPumping = momentumScore > 0.6 && volumeConfirmation.isIncreasing;
    const confidence = Math.min(1, (
      momentumScore * 0.6 +
      volumeConfirmation.confidence * 0.3 +
      socialSentiment.confidence * 0.1
    ));
    
    return {
      isPumping,
      confidence,
      momentum: this.categorizeMomentum(momentumScore),
      volumePattern: volumeConfirmation.pattern,
      socialSentiment: socialSentiment.sentiment,
      recommendation: this.generatePumpRecommendation(isPumping, confidence, momentumScore)
    };
  }
  
  private analyzeTimeframe(prices: PricePoint[], volumes: VolumePoint[]): TimeframeAnalysis {
    if (prices.length < 2) return { momentum: 0, trend: 'FLAT' };
    
    // Price momentum calculation
    const priceChanges = prices.slice(1).map((p, i) => 
      (p.price - prices[i].price) / prices[i].price
    );
    
    const avgPriceChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const positiveChanges = priceChanges.filter(c => c > 0).length;
    const momentumRatio = positiveChanges / priceChanges.length;
    
    // Volume trend
    const volumeChanges = volumes.slice(1).map((v, i) => 
      (v.volume - volumes[i].volume) / Math.max(volumes[i].volume, 1)
    );
    const avgVolumeChange = volumeChanges.reduce((a, b) => a + b, 0) / volumeChanges.length;
    
    const momentum = (
      avgPriceChange * 0.7 +          // Price change weight
      momentumRatio * 0.2 +           // Consistency weight
      avgVolumeChange * 0.1           // Volume confirmation weight
    );
    
    return {
      momentum: Math.max(-1, Math.min(1, momentum * 10)), // Scale to -1 to 1
      trend: momentum > 0.1 ? 'UP' : momentum < -0.1 ? 'DOWN' : 'FLAT',
      priceChange: avgPriceChange,
      volumeChange: avgVolumeChange,
      consistency: momentumRatio
    };
  }
}
```

## 3. 🛡️ Risk Management Framework

### 3.1 Multi-Layer Risk Controls
```typescript
interface RiskManagementFramework {
  // Position-level risk
  positionRisk: {
    maxPositionSize: 0.02;          // 2% of portfolio max
    maxPositionPercent: 5;          // 5% of available balance
    basePositionSize: 0.003;        // 0.003 SOL base (UI: 0.001-0.01)
    autoScaling: true;              // Scale based on available memory
  };
  
  // Portfolio-level risk
  portfolioRisk: {
    maxPositions: 500;              // Auto-scaling based on memory
    maxExposure: 50;               // 50% of portfolio max
    diversificationMin: 5;         // Minimum 5 different positions
    correlationLimit: 0.7;         // Max correlation between positions
  };
  
  // Creator intelligence risk
  creatorRisk: {
    maxExposurePerCreator: 10;     // 10% max per creator
    flaggedCreatorLimit: 5;        // 5% max for flagged creators
    verifiedCreatorBonus: 30;      // 30% bonus for verified
    rugpullHistoryPenalty: 50;     // 50% reduction for rugpull history
  };
  
  // Time-based risk
  temporalRisk: {
    maxHoldTime: 21600000;         // 6 hours maximum
    emergencyExitTime: 7200000;    // 2 hours emergency
    stagnantExitTime: 3600000;     // 1 hour stagnant
    ageBasedAdjustment: true;      // Adjust based on token age
  };
  
  // Market risk
  marketRisk: {
    volatilityLimit: 0.5;          // 50% max volatility
    liquidityMinimum: 500;         // $500 minimum liquidity
    slippageMaximum: 10;          // 10% max slippage
    volumeMinimum: 1000;          // $1000 min daily volume
  };
}
```

### 3.2 Dynamic Risk Adjustment
```typescript
class DynamicRiskManager {
  adjustPositionRisk(
    baseRisk: RiskParameters,
    marketConditions: MarketConditions,
    portfolioState: PortfolioState,
    creatorProfile: CreatorProfile
  ): AdjustedRiskParameters {
    let adjustedRisk = { ...baseRisk };
    
    // Market condition adjustments
    if (marketConditions.volatility > 0.3) {
      adjustedRisk.maxPositionSize *= 0.8;    // Reduce by 20% in high volatility
      adjustedRisk.stopLoss *= 1.2;          // Tighter stop-loss
    }
    
    if (marketConditions.trend === 'BEAR') {
      adjustedRisk.maxPositions *= 0.7;       // Fewer positions in bear market
      adjustedRisk.holdTime *= 0.5;          // Shorter hold times
    }
    
    // Portfolio state adjustments
    const currentDrawdown = portfolioState.currentDrawdown;
    if (currentDrawdown > 0.1) {            // 10% drawdown
      adjustedRisk.maxPositionSize *= 0.6;   // Significantly reduce position size
      adjustedRisk.riskTolerance *= 0.5;     // Lower risk tolerance
    }
    
    // Creator-based adjustments
    if (creatorProfile.flagged) {
      adjustedRisk.maxPositionSize *= 0.5;   // 50% reduction for flagged creators
      adjustedRisk.maxHoldTime *= 0.3;      // Much shorter hold times
    } else if (creatorProfile.verified) {
      adjustedRisk.maxPositionSize *= 1.2;   // 20% increase for verified
      adjustedRisk.maxHoldTime *= 1.5;      // Longer hold times allowed
    }
    
    return adjustedRisk;
  }
  
  // Circuit breaker conditions
  checkCircuitBreakers(portfolioState: PortfolioState): CircuitBreakerStatus {
    const breakers = {
      dailyLossLimit: portfolioState.dailyPnL < -0.1,     // -10% daily limit
      weeklyLossLimit: portfolioState.weeklyPnL < -0.2,   // -20% weekly limit
      maxDrawdown: portfolioState.currentDrawdown > 0.15,  // 15% max drawdown
      memoryLimit: process.memoryUsage().heapUsed > 1.5e9, // 1.5GB limit
      positionLimit: portfolioState.activePositions > 500,  // 500 position limit
      rugpullFrequency: this.getRecentRugpullCount() > 5   // 5 rugpulls/day limit
    };
    
    const triggeredBreakers = Object.entries(breakers)
      .filter(([_, triggered]) => triggered)
      .map(([name]) => name);
    
    return {
      triggered: triggeredBreakers.length > 0,
      breakers: triggeredBreakers,
      severity: this.calculateBreakerSeverity(triggeredBreakers),
      action: this.determineBreakerAction(triggeredBreakers)
    };
  }
}
```

## 4. 📊 Performance Optimization

### 4.1 Strategy Performance Tracking
```typescript
class StrategyPerformanceTracker {
  private strategyMetrics: Map<string, StrategyMetrics> = new Map();
  
  recordStrategyPerformance(
    strategy: string,
    trade: CompletedTrade,
    marketConditions: MarketConditions
  ): void {
    const metrics = this.getOrCreateMetrics(strategy);
    
    // Update core metrics
    metrics.totalTrades++;
    if (trade.roi > 0) {
      metrics.successfulTrades++;
      metrics.totalProfit += trade.roi;
    } else {
      metrics.totalLoss += Math.abs(trade.roi);
    }
    
    metrics.totalHoldTime += trade.holdTime;
    metrics.avgROI = (metrics.totalProfit - metrics.totalLoss) / metrics.totalTrades;
    metrics.winRate = (metrics.successfulTrades / metrics.totalTrades) * 100;
    
    // Market condition performance
    this.updateMarketConditionMetrics(metrics, trade, marketConditions);
    
    // Creator performance tracking
    this.updateCreatorMetrics(metrics, trade);
    
    // Time-based performance
    this.updateTimeBasedMetrics(metrics, trade);
    
    this.strategyMetrics.set(strategy, metrics);
  }
  
  generateStrategyComparison(): StrategyComparison {
    const strategies = Array.from(this.strategyMetrics.entries());
    
    return {
      summary: {
        totalStrategies: strategies.length,
        bestPerformer: this.getBestPerformingStrategy(),
        worstPerformer: this.getWorstPerformingStrategy(),
        overallROI: this.calculateOverallROI()
      },
      detailed: strategies.map(([name, metrics]) => ({
        name,
        performance: {
          winRate: metrics.winRate,
          avgROI: metrics.avgROI,
          totalTrades: metrics.totalTrades,
          avgHoldTime: metrics.totalHoldTime / metrics.totalTrades,
          sharpeRatio: this.calculateSharpeRatio(metrics),
          maxDrawdown: metrics.maxDrawdown
        },
        marketConditions: {
          bullMarket: metrics.bullMarketPerformance,
          bearMarket: metrics.bearMarketPerformance,
          sideways: metrics.sidewaysPerformance
        },
        creatorTypes: {
          verified: metrics.verifiedCreatorPerformance,
          unknown: metrics.unknownCreatorPerformance,
          flagged: metrics.flaggedCreatorPerformance
        },
        recommendations: this.generateStrategyRecommendations(name, metrics)
      }))
    };
  }
}
```

### 4.2 Adaptive Strategy Selection
```typescript
class AdaptiveStrategySelector {
  selectOptimalStrategy(
    tokenInfo: EnhancedTokenInfo,
    marketConditions: MarketConditions,
    portfolioState: PortfolioState,
    performanceHistory: StrategyPerformance[]
  ): SelectedStrategy {
    const candidateStrategies = ['ULTRA_AGGRESSIVE', 'BALANCED', 'CONSERVATIVE', 'AGGRESSIVE'];
    const scores: StrategyScore[] = [];
    
    for (const strategy of candidateStrategies) {
      const score = this.scoreStrategy(
        strategy,
        tokenInfo,
        marketConditions,
        portfolioState,
        performanceHistory
      );
      scores.push({ strategy, score, reasoning: score.reasoning });
    }
    
    // Sort by score and select best
    scores.sort((a, b) => b.score.total - a.score.total);
    const selected = scores[0];
    
    return {
      strategy: selected.strategy,
      confidence: selected.score.confidence,
      reasoning: selected.reasoning,
      alternatives: scores.slice(1, 3), // Top 2 alternatives
      adaptations: this.getStrategyAdaptations(selected, tokenInfo, marketConditions)
    };
  }
  
  private scoreStrategy(
    strategyName: string,
    tokenInfo: EnhancedTokenInfo,
    marketConditions: MarketConditions,
    portfolioState: PortfolioState,
    performanceHistory: StrategyPerformance[]
  ): StrategyScoreDetailed {
    const strategy = ENHANCED_EXIT_STRATEGIES[strategyName];
    const historicalPerformance = performanceHistory.find(p => p.strategy === strategyName);
    
    let score = {
      historical: 0,
      marketFit: 0,
      tokenFit: 0,
      portfolioFit: 0,
      creatorFit: 0,
      total: 0,
      confidence: 0
    };
    
    // Historical performance (30% weight)
    if (historicalPerformance) {
      score.historical = Math.min(100, 
        historicalPerformance.winRate * 0.6 + 
        Math.max(0, historicalPerformance.avgROI) * 0.4
      );
    } else {
      score.historical = 50; // Neutral for new strategies
    }
    
    // Market conditions fit (25% weight)
    score.marketFit = this.assessMarketFit(strategy, marketConditions);
    
    // Token characteristics fit (20% weight)
    score.tokenFit = this.assessTokenFit(strategy, tokenInfo);
    
    // Portfolio state fit (15% weight)
    score.portfolioFit = this.assessPortfolioFit(strategy, portfolioState);
    
    // Creator intelligence fit (10% weight)
    score.creatorFit = this.assessCreatorFit(strategy, tokenInfo.creatorProfile);
    
    // Calculate weighted total
    score.total = (
      score.historical * 0.30 +
      score.marketFit * 0.25 +
      score.tokenFit * 0.20 +
      score.portfolioFit * 0.15 +
      score.creatorFit * 0.10
    );
    
    score.confidence = Math.min(1, score.total / 100);
    
    return {
      ...score,
      reasoning: this.generateScoreReasoning(score, strategyName, tokenInfo, marketConditions)
    };
  }
}
```

---

**🎯 Educational Strategy Excellence**: This comprehensive multi-strategy framework demonstrates professional-grade trading techniques while maintaining strict educational boundaries. All creator intelligence and advanced strategy features are designed for learning sophisticated blockchain analysis and profit optimization concepts.

**🔒 Educational Safety**: All strategies operate within educational simulation boundaries with creator-aware position sizing for learning only, virtual portfolio management with zero real fund risk, and comprehensive performance tracking for educational analysis purposes.