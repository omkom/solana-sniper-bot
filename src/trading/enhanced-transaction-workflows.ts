import { EventEmitter } from 'events';
import { TokenInfo, SecurityAnalysis, SimulatedPosition, SimulatedTrade } from '../types';

export interface TradeStrategy {
  source: string;
  priority: 'ULTRA_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
  basePositionSize: number;
  maxHoldTime: number; // milliseconds
  entryConditions: {
    minSecurityScore: number;
    maxTokenAge: number; // milliseconds
    minLiquidity: number; // USD
    requiredChecks?: string[];
  };
  exitConditions: {
    takeProfitLevels: Array<{ roi: number; sellPercentage: number; reason: string }>;
    stopLoss: { roi: number; reason: string };
    timeBasedExit?: { maxHoldTime: number; reason: string };
  };
  positionSizing: {
    ageMultiplier: Array<{ maxAge: number; multiplier: number }>;
    securityMultiplier: Array<{ minScore: number; multiplier: number }>;
    liquidityMultiplier: Array<{ minLiquidity: number; multiplier: number }>;
    sourceMultiplier: number;
    urgencyMultiplier: Array<{ urgency: string; multiplier: number }>;
  };
}

export interface TradeDecision {
  action: 'BUY' | 'SKIP' | 'WATCH' | 'PRIORITY_BUY';
  strategy: TradeStrategy;
  reason: string;
  urgency: 'ULTRA_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
  positionSize: number;
  confidence: number; // 0-100
  expectedHoldTime: number;
  riskLevel: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
}

export class EnhancedTransactionWorkflows extends EventEmitter {
  private strategies: Map<string, TradeStrategy> = new Map();
  private watchList: Map<string, { token: TokenInfo; strategy: TradeStrategy; watchedSince: number }> = new Map();
  private activePositions: Map<string, SimulatedPosition> = new Map();
  
  constructor() {
    super();
    this.initializeTradeStrategies();
    console.log('🎯 Enhanced Transaction Workflows initialized');
  }

  private initializeTradeStrategies(): void {
    // Demo Strategy - For Testing
    this.strategies.set('DEMO', {
      source: 'demo',
      priority: 'ULTRA_HIGH',
      basePositionSize: 0.01,
      maxHoldTime: 30 * 60 * 1000,
      entryConditions: {
        minSecurityScore: 5, // Very low for demo
        maxTokenAge: 24 * 60 * 60 * 1000, // 24 hours
        minLiquidity: 100, // Very low for demo
        requiredChecks: []
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 1000, sellPercentage: 90, reason: 'Demo mega pump - 1000%+ gains' },
          { roi: 500, sellPercentage: 80, reason: 'Demo major pump - 500%+ gains' },
          { roi: 200, sellPercentage: 60, reason: 'Demo strong gains - 200%+' },
          { roi: 100, sellPercentage: 40, reason: 'Demo good gains - 100%+' },
          { roi: 50, sellPercentage: 20, reason: 'Demo early profit - 50%+' }
        ],
        stopLoss: { roi: -20, reason: 'Demo stop loss' }
      },
      positionSizing: {
        ageMultiplier: [
          { maxAge: 60 * 60 * 1000, multiplier: 2.0 }
        ],
        securityMultiplier: [
          { minScore: 10, multiplier: 1.5 }
        ],
        liquidityMultiplier: [
          { minLiquidity: 1000, multiplier: 1.5 }
        ],
        sourceMultiplier: 2.0, // Higher for demo
        urgencyMultiplier: [
          { urgency: 'ULTRA_HIGH', multiplier: 2.0 }
        ]
      }
    });
    
    // Pump.fun Strategy - Ultra High Priority
    this.strategies.set('PUMP_FUN', {
      source: 'pump.fun',
      priority: 'ULTRA_HIGH',
      basePositionSize: 0.01, // 0.01 SOL base
      maxHoldTime: 30 * 60 * 1000, // 30 minutes max
      entryConditions: {
        minSecurityScore: 10, // Very permissive for pump.fun
        maxTokenAge: 5 * 60 * 1000, // 5 minutes max age
        minLiquidity: 1000, // $1000 minimum
        requiredChecks: ['mintAuthority', 'freezeAuthority']
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 1000, sellPercentage: 90, reason: '1000%+ gains - mega pump exit' },
          { roi: 500, sellPercentage: 80, reason: '500%+ gains - major pump exit' },
          { roi: 200, sellPercentage: 60, reason: '200%+ gains - strong pump exit' },
          { roi: 100, sellPercentage: 40, reason: '100%+ gains - pump momentum exit' },
          { roi: 50, sellPercentage: 25, reason: '50%+ gains - early pump profit' }
        ],
        stopLoss: { roi: -25, reason: 'Pump.fun stop loss' },
        timeBasedExit: { maxHoldTime: 30 * 60 * 1000, reason: 'Pump.fun max hold time' }
      },
      positionSizing: {
        ageMultiplier: [
          { maxAge: 60 * 1000, multiplier: 4.0 }, // <1 min: 4x
          { maxAge: 3 * 60 * 1000, multiplier: 3.0 }, // <3 min: 3x
          { maxAge: 5 * 60 * 1000, multiplier: 2.0 }  // <5 min: 2x
        ],
        securityMultiplier: [
          { minScore: 80, multiplier: 3.0 },
          { minScore: 60, multiplier: 2.0 },
          { minScore: 40, multiplier: 1.5 },
          { minScore: 20, multiplier: 1.2 }
        ],
        liquidityMultiplier: [
          { minLiquidity: 100000, multiplier: 3.0 },
          { minLiquidity: 50000, multiplier: 2.5 },
          { minLiquidity: 25000, multiplier: 2.0 },
          { minLiquidity: 10000, multiplier: 1.5 },
          { minLiquidity: 5000, multiplier: 1.2 }
        ],
        sourceMultiplier: 2.5,
        urgencyMultiplier: [
          { urgency: 'ULTRA_HIGH', multiplier: 3.0 },
          { urgency: 'HIGH', multiplier: 2.0 },
          { urgency: 'MEDIUM', multiplier: 1.5 },
          { urgency: 'LOW', multiplier: 1.0 }
        ]
      }
    });

    // Raydium Strategy - High Priority
    this.strategies.set('RAYDIUM', {
      source: 'raydium',
      priority: 'HIGH',
      basePositionSize: 0.008, // 0.008 SOL base
      maxHoldTime: 60 * 60 * 1000, // 1 hour max
      entryConditions: {
        minSecurityScore: 25,
        maxTokenAge: 15 * 60 * 1000, // 15 minutes max age
        minLiquidity: 2500, // $2500 minimum
        requiredChecks: ['mintAuthority', 'liquidityDistribution']
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 800, sellPercentage: 85, reason: '800%+ gains - major Raydium success' },
          { roi: 400, sellPercentage: 70, reason: '400%+ gains - strong Raydium exit' },
          { roi: 150, sellPercentage: 50, reason: '150%+ gains - good Raydium profit' },
          { roi: 75, sellPercentage: 30, reason: '75%+ gains - early Raydium profit' }
        ],
        stopLoss: { roi: -20, reason: 'Raydium stop loss' },
        timeBasedExit: { maxHoldTime: 60 * 60 * 1000, reason: 'Raydium max hold time' }
      },
      positionSizing: {
        ageMultiplier: [
          { maxAge: 2 * 60 * 1000, multiplier: 3.0 }, // <2 min: 3x
          { maxAge: 5 * 60 * 1000, multiplier: 2.5 }, // <5 min: 2.5x
          { maxAge: 10 * 60 * 1000, multiplier: 2.0 }, // <10 min: 2x
          { maxAge: 15 * 60 * 1000, multiplier: 1.5 }  // <15 min: 1.5x
        ],
        securityMultiplier: [
          { minScore: 90, multiplier: 2.5 },
          { minScore: 75, multiplier: 2.0 },
          { minScore: 60, multiplier: 1.8 },
          { minScore: 45, multiplier: 1.5 },
          { minScore: 30, multiplier: 1.2 }
        ],
        liquidityMultiplier: [
          { minLiquidity: 100000, multiplier: 2.5 },
          { minLiquidity: 50000, multiplier: 2.0 },
          { minLiquidity: 25000, multiplier: 1.8 },
          { minLiquidity: 10000, multiplier: 1.5 },
          { minLiquidity: 5000, multiplier: 1.2 }
        ],
        sourceMultiplier: 2.0,
        urgencyMultiplier: [
          { urgency: 'ULTRA_HIGH', multiplier: 2.5 },
          { urgency: 'HIGH', multiplier: 2.0 },
          { urgency: 'MEDIUM', multiplier: 1.5 },
          { urgency: 'LOW', multiplier: 1.0 }
        ]
      }
    });

    // Orca Strategy - Medium Priority
    this.strategies.set('ORCA', {
      source: 'orca',
      priority: 'MEDIUM',
      basePositionSize: 0.006, // 0.006 SOL base
      maxHoldTime: 90 * 60 * 1000, // 1.5 hours max
      entryConditions: {
        minSecurityScore: 35,
        maxTokenAge: 20 * 60 * 1000, // 20 minutes max age
        minLiquidity: 5000, // $5000 minimum
        requiredChecks: ['mintAuthority', 'liquidityDistribution', 'volumePattern']
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 600, sellPercentage: 80, reason: '600%+ gains - excellent Orca exit' },
          { roi: 300, sellPercentage: 65, reason: '300%+ gains - strong Orca exit' },
          { roi: 120, sellPercentage: 45, reason: '120%+ gains - good Orca profit' },
          { roi: 60, sellPercentage: 25, reason: '60%+ gains - early Orca profit' }
        ],
        stopLoss: { roi: -15, reason: 'Orca stop loss' },
        timeBasedExit: { maxHoldTime: 90 * 60 * 1000, reason: 'Orca max hold time' }
      },
      positionSizing: {
        ageMultiplier: [
          { maxAge: 3 * 60 * 1000, multiplier: 2.5 }, // <3 min: 2.5x
          { maxAge: 8 * 60 * 1000, multiplier: 2.0 }, // <8 min: 2x
          { maxAge: 15 * 60 * 1000, multiplier: 1.8 }, // <15 min: 1.8x
          { maxAge: 20 * 60 * 1000, multiplier: 1.5 }  // <20 min: 1.5x
        ],
        securityMultiplier: [
          { minScore: 85, multiplier: 2.2 },
          { minScore: 70, multiplier: 1.8 },
          { minScore: 55, multiplier: 1.5 },
          { minScore: 40, multiplier: 1.3 }
        ],
        liquidityMultiplier: [
          { minLiquidity: 75000, multiplier: 2.2 },
          { minLiquidity: 40000, multiplier: 1.8 },
          { minLiquidity: 20000, multiplier: 1.5 },
          { minLiquidity: 10000, multiplier: 1.3 }
        ],
        sourceMultiplier: 1.8,
        urgencyMultiplier: [
          { urgency: 'ULTRA_HIGH', multiplier: 2.2 },
          { urgency: 'HIGH', multiplier: 1.8 },
          { urgency: 'MEDIUM', multiplier: 1.4 },
          { urgency: 'LOW', multiplier: 1.0 }
        ]
      }
    });

    // DexScreener Strategy - Medium Priority
    this.strategies.set('DEXSCREENER', {
      source: 'dexscreener',
      priority: 'MEDIUM',
      basePositionSize: 0.005, // 0.005 SOL base
      maxHoldTime: 120 * 60 * 1000, // 2 hours max
      entryConditions: {
        minSecurityScore: 40,
        maxTokenAge: 30 * 60 * 1000, // 30 minutes max age
        minLiquidity: 7500, // $7500 minimum
        requiredChecks: ['mintAuthority', 'volumePattern', 'priceStability']
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 400, sellPercentage: 75, reason: '400%+ gains - major DexScreener success' },
          { roi: 200, sellPercentage: 60, reason: '200%+ gains - strong DexScreener exit' },
          { roi: 100, sellPercentage: 40, reason: '100%+ gains - good DexScreener profit' },
          { roi: 50, sellPercentage: 20, reason: '50%+ gains - early DexScreener profit' }
        ],
        stopLoss: { roi: -12, reason: 'DexScreener stop loss' },
        timeBasedExit: { maxHoldTime: 120 * 60 * 1000, reason: 'DexScreener max hold time' }
      },
      positionSizing: {
        ageMultiplier: [
          { maxAge: 5 * 60 * 1000, multiplier: 2.2 }, // <5 min: 2.2x
          { maxAge: 15 * 60 * 1000, multiplier: 1.8 }, // <15 min: 1.8x
          { maxAge: 25 * 60 * 1000, multiplier: 1.5 }, // <25 min: 1.5x
          { maxAge: 30 * 60 * 1000, multiplier: 1.2 }  // <30 min: 1.2x
        ],
        securityMultiplier: [
          { minScore: 80, multiplier: 2.0 },
          { minScore: 65, multiplier: 1.7 },
          { minScore: 50, multiplier: 1.4 },
          { minScore: 40, multiplier: 1.2 }
        ],
        liquidityMultiplier: [
          { minLiquidity: 100000, multiplier: 2.0 },
          { minLiquidity: 50000, multiplier: 1.7 },
          { minLiquidity: 25000, multiplier: 1.4 },
          { minLiquidity: 10000, multiplier: 1.2 }
        ],
        sourceMultiplier: 1.5,
        urgencyMultiplier: [
          { urgency: 'ULTRA_HIGH', multiplier: 2.0 },
          { urgency: 'HIGH', multiplier: 1.6 },
          { urgency: 'MEDIUM', multiplier: 1.3 },
          { urgency: 'LOW', multiplier: 1.0 }
        ]
      }
    });

    console.log(`🎯 Initialized ${this.strategies.size} trading strategies`);
    this.strategies.forEach((strategy, source) => {
      console.log(`   - ${source}: ${strategy.priority} priority, ${strategy.basePositionSize} SOL base`);
    });
  }

  evaluateTradeOpportunity(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): TradeDecision {
    // Determine token source and get corresponding strategy
    const source = this.identifyTokenSource(tokenInfo);
    const strategy = this.getStrategyForSource(source);
    
    console.log(`🎯 [ENHANCED] Evaluating ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)} from ${source}`);
    console.log(`📋 Strategy: ${strategy.priority} priority, base size: ${strategy.basePositionSize} SOL`);

    // Check entry conditions
    const entryEvaluation = this.evaluateEntryConditions(tokenInfo, securityAnalysis, strategy);
    if (!entryEvaluation.canEnter) {
      return {
        action: 'SKIP',
        strategy,
        reason: entryEvaluation.reason,
        urgency: 'LOW',
        positionSize: 0,
        confidence: 0,
        expectedHoldTime: 0,
        riskLevel: 'VERY_HIGH'
      };
    }

    // Calculate position size
    const positionSize = this.calculateAdvancedPositionSize(tokenInfo, securityAnalysis, strategy);
    
    // Determine urgency and action
    const urgency = this.determineUrgency(tokenInfo, securityAnalysis, strategy);
    const action = this.determineTradeAction(tokenInfo, securityAnalysis, strategy, urgency);
    
    // Calculate confidence and risk
    const confidence = this.calculateConfidence(tokenInfo, securityAnalysis, strategy);
    const riskLevel = this.assessRiskLevel(tokenInfo, securityAnalysis, strategy);
    const expectedHoldTime = this.estimateHoldTime(tokenInfo, strategy);

    return {
      action,
      strategy,
      reason: `${source} strategy: ${entryEvaluation.reason}`,
      urgency,
      positionSize,
      confidence,
      expectedHoldTime,
      riskLevel
    };
  }

  private identifyTokenSource(tokenInfo: TokenInfo): string {
    const source = tokenInfo.source?.toLowerCase() || 'unknown';
    
    // Map source variations to standard names - more flexible matching
    if (source.includes('pump') || source === 'pump_detector') return 'PUMP_FUN';
    if (source.includes('raydium')) return 'RAYDIUM';
    if (source.includes('orca')) return 'ORCA';
    if (source.includes('dexscreener')) return 'DEXSCREENER';
    if (source.includes('jupiter')) return 'JUPITER';
    if (source.includes('meteora')) return 'METEORA';
    if (source.includes('serum')) return 'SERUM';
    
    // Multi-DEX monitor sources
    if (source === 'multi_dex' || source === 'scanner') return 'RAYDIUM'; // Default to Raydium for multi-dex
    
    // Use UNKNOWN strategy which has lower requirements
    return 'UNKNOWN';
  }

  private getStrategyForSource(source: string): TradeStrategy {
    // Handle demo source specifically
    if (source === 'demo') {
      return this.strategies.get('DEMO') || this.getDefaultStrategy();
    }
    
    // Map source variations to strategy keys
    const sourceMap: { [key: string]: string } = {
      'pump.fun': 'PUMP_FUN',
      'pump': 'PUMP_FUN',
      'raydium': 'RAYDIUM',
      'raydium_monitor': 'RAYDIUM',
      'orca': 'ORCA',
      'orca_whirlpool': 'ORCA',
      'dexscreener': 'DEXSCREENER',
      'demo': 'DEMO'
    };
    
    const strategyKey = sourceMap[source.toLowerCase()] || source.toUpperCase();
    return this.strategies.get(strategyKey) || this.getDefaultStrategy();
  }

  private getDefaultStrategy(): TradeStrategy {
    return {
      source: 'unknown',
      priority: 'LOW', // Conservative for unknown sources
      basePositionSize: 0.003, // Smaller position for unknown sources
      maxHoldTime: 60 * 60 * 1000, // 1 hour max
      entryConditions: {
        minSecurityScore: 70, // Higher security requirement
        maxTokenAge: 15 * 60 * 1000, // 15 minutes max age
        minLiquidity: 10000 // $10k minimum liquidity
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 100, sellPercentage: 80, reason: '100%+ gains - unknown source exit' },
          { roi: 50, sellPercentage: 50, reason: '50%+ gains - unknown source profit' },
          { roi: 25, sellPercentage: 30, reason: '25%+ gains - unknown source early exit' }
        ],
        stopLoss: { roi: -15, reason: 'Unknown source stop loss' }
      },
      positionSizing: {
        ageMultiplier: [{ maxAge: 5 * 60 * 1000, multiplier: 1.3 }],
        securityMultiplier: [{ minScore: 80, multiplier: 1.5 }],
        liquidityMultiplier: [{ minLiquidity: 25000, multiplier: 1.5 }],
        sourceMultiplier: 1.0,
        urgencyMultiplier: [{ urgency: 'HIGH', multiplier: 1.2 }]
      }
    };
  }

  private evaluateEntryConditions(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, strategy: TradeStrategy): { canEnter: boolean; reason: string } {
    const conditions = strategy.entryConditions;
    
    // Security score check
    if (securityAnalysis.score < conditions.minSecurityScore) {
      return {
        canEnter: false,
        reason: `Security score ${securityAnalysis.score} below minimum ${conditions.minSecurityScore}`
      };
    }

    // Token age check
    const ageMs = Date.now() - tokenInfo.createdAt;
    if (ageMs > conditions.maxTokenAge) {
      return {
        canEnter: false,
        reason: `Token age ${Math.round(ageMs/60000)}m exceeds max ${Math.round(conditions.maxTokenAge/60000)}m`
      };
    }

    // Liquidity check
    const liquidityUsd = tokenInfo.liquidity?.usd || 0;
    if (liquidityUsd < conditions.minLiquidity) {
      return {
        canEnter: false,
        reason: `Liquidity $${liquidityUsd.toFixed(0)} below minimum $${conditions.minLiquidity}`
      };
    }

    // Required checks validation
    if (conditions.requiredChecks) {
      const failedChecks = conditions.requiredChecks.filter(checkName => {
        return !securityAnalysis.checks.some(check => check.name.includes(checkName) && check.passed);
      });
      
      if (failedChecks.length > 0) {
        return {
          canEnter: false,
          reason: `Failed required checks: ${failedChecks.join(', ')}`
        };
      }
    }

    return {
      canEnter: true,
      reason: `All entry conditions met for ${strategy.source} strategy`
    };
  }

  private calculateAdvancedPositionSize(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, strategy: TradeStrategy): number {
    let size = strategy.basePositionSize;
    const sizing = strategy.positionSizing;

    // Age multiplier
    const ageMs = Date.now() - tokenInfo.createdAt;
    const ageMultiplier = sizing.ageMultiplier.find(m => ageMs <= m.maxAge)?.multiplier || 1.0;

    // Security multiplier
    const securityMultiplier = sizing.securityMultiplier
      .filter(m => securityAnalysis.score >= m.minScore)
      .reduce((max, m) => Math.max(max, m.multiplier), 1.0);

    // Liquidity multiplier
    const liquidityUsd = tokenInfo.liquidity?.usd || 0;
    const liquidityMultiplier = sizing.liquidityMultiplier
      .filter(m => liquidityUsd >= m.minLiquidity)
      .reduce((max, m) => Math.max(max, m.multiplier), 1.0);

    // Source multiplier
    const sourceMultiplier = sizing.sourceMultiplier;

    // Calculate final size
    size = size * ageMultiplier * securityMultiplier * liquidityMultiplier * sourceMultiplier;
    
    console.log(`📊 Position sizing: base=${strategy.basePositionSize} * age=${ageMultiplier} * security=${securityMultiplier} * liquidity=${liquidityMultiplier} * source=${sourceMultiplier} = ${size.toFixed(6)} SOL`);

    return Math.min(size, 0.1); // Cap at 0.1 SOL for safety
  }

  private determineUrgency(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, strategy: TradeStrategy): 'ULTRA_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' {
    let urgencyScore = 0;

    // Strategy priority impact
    if (strategy.priority === 'ULTRA_HIGH') urgencyScore += 4;
    else if (strategy.priority === 'HIGH') urgencyScore += 3;
    else if (strategy.priority === 'MEDIUM') urgencyScore += 2;
    else urgencyScore += 1;

    // Security score impact
    if (securityAnalysis.score >= 90) urgencyScore += 3;
    else if (securityAnalysis.score >= 75) urgencyScore += 2;
    else if (securityAnalysis.score >= 60) urgencyScore += 1;

    // Age impact (newer = more urgent)
    const ageMs = Date.now() - tokenInfo.createdAt;
    if (ageMs < 60 * 1000) urgencyScore += 3; // < 1 min
    else if (ageMs < 5 * 60 * 1000) urgencyScore += 2; // < 5 min
    else if (ageMs < 15 * 60 * 1000) urgencyScore += 1; // < 15 min

    // Liquidity impact
    const liquidityUsd = tokenInfo.liquidity?.usd || 0;
    if (liquidityUsd >= 100000) urgencyScore += 2;
    else if (liquidityUsd >= 50000) urgencyScore += 1;

    // Special conditions
    if (tokenInfo.metadata?.pumpDetected) urgencyScore += 2;
    if (tokenInfo.source === 'pump_detector') urgencyScore += 2;

    // Convert score to urgency level
    if (urgencyScore >= 10) return 'ULTRA_HIGH';
    if (urgencyScore >= 7) return 'HIGH';
    if (urgencyScore >= 4) return 'MEDIUM';
    return 'LOW';
  }

  private determineTradeAction(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, strategy: TradeStrategy, urgency: string): 'BUY' | 'PRIORITY_BUY' | 'WATCH' | 'SKIP' {
    if (urgency === 'ULTRA_HIGH') return 'PRIORITY_BUY';
    if (urgency === 'HIGH') return 'BUY';
    if (urgency === 'MEDIUM' && securityAnalysis.score >= 60) return 'BUY';
    if (urgency === 'MEDIUM') return 'WATCH';
    return 'SKIP';
  }

  private calculateConfidence(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, strategy: TradeStrategy): number {
    let confidence = 50; // Base confidence

    // Security score contribution (0-30 points)
    confidence += (securityAnalysis.score / 100) * 30;

    // Liquidity contribution (0-15 points)
    const liquidityUsd = tokenInfo.liquidity?.usd || 0;
    if (liquidityUsd >= 100000) confidence += 15;
    else if (liquidityUsd >= 50000) confidence += 10;
    else if (liquidityUsd >= 25000) confidence += 5;

    // Age contribution (0-10 points)
    const ageMs = Date.now() - tokenInfo.createdAt;
    if (ageMs < 2 * 60 * 1000) confidence += 10; // Very fresh
    else if (ageMs < 10 * 60 * 1000) confidence += 5; // Fresh

    // Strategy priority contribution (0-15 points)
    if (strategy.priority === 'ULTRA_HIGH') confidence += 15;
    else if (strategy.priority === 'HIGH') confidence += 10;
    else if (strategy.priority === 'MEDIUM') confidence += 5;

    return Math.min(Math.max(confidence, 0), 100);
  }

  private assessRiskLevel(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis, strategy: TradeStrategy): 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' {
    let riskScore = 0;

    // Security score impact (lower score = higher risk)
    if (securityAnalysis.score < 30) riskScore += 3;
    else if (securityAnalysis.score < 50) riskScore += 2;
    else if (securityAnalysis.score < 70) riskScore += 1;

    // Liquidity impact (lower liquidity = higher risk)
    const liquidityUsd = tokenInfo.liquidity?.usd || 0;
    if (liquidityUsd < 5000) riskScore += 3;
    else if (liquidityUsd < 15000) riskScore += 2;
    else if (liquidityUsd < 50000) riskScore += 1;

    // Age impact (newer = higher risk)
    const ageMs = Date.now() - tokenInfo.createdAt;
    if (ageMs < 2 * 60 * 1000) riskScore += 2;
    else if (ageMs < 10 * 60 * 1000) riskScore += 1;

    // Strategy risk impact
    if (strategy.source === 'PUMP_FUN') riskScore += 1; // Inherently riskier
    if (strategy.priority === 'ULTRA_HIGH') riskScore += 1; // High rewards = high risk

    // Convert score to risk level
    if (riskScore >= 6) return 'VERY_HIGH';
    if (riskScore >= 4) return 'HIGH';
    if (riskScore >= 2) return 'MEDIUM';
    if (riskScore >= 1) return 'LOW';
    return 'VERY_LOW';
  }

  private estimateHoldTime(tokenInfo: TokenInfo, strategy: TradeStrategy): number {
    let baseHoldTime = strategy.maxHoldTime * 0.3; // 30% of max as base

    // Adjust based on source
    if (strategy.source === 'PUMP_FUN') baseHoldTime *= 0.5; // Shorter holds
    else if (strategy.source === 'RAYDIUM') baseHoldTime *= 0.8; // Medium holds
    else if (strategy.source === 'DEXSCREENER') baseHoldTime *= 1.2; // Longer holds

    // Adjust based on liquidity
    const liquidityUsd = tokenInfo.liquidity?.usd || 0;
    if (liquidityUsd >= 100000) baseHoldTime *= 1.3; // Hold longer for high liquidity
    else if (liquidityUsd < 10000) baseHoldTime *= 0.7; // Exit faster for low liquidity

    return Math.max(5 * 60 * 1000, Math.min(baseHoldTime, strategy.maxHoldTime)); // Min 5 minutes
  }

  getStrategyStats(): any {
    const stats: any = {};
    
    this.strategies.forEach((strategy, source) => {
      stats[source] = {
        priority: strategy.priority,
        basePositionSize: strategy.basePositionSize,
        maxHoldTime: strategy.maxHoldTime,
        minSecurityScore: strategy.entryConditions.minSecurityScore,
        minLiquidity: strategy.entryConditions.minLiquidity,
        takeProfitLevels: strategy.exitConditions.takeProfitLevels.length,
        sourceMultiplier: strategy.positionSizing.sourceMultiplier
      };
    });

    return {
      totalStrategies: this.strategies.size,
      strategies: stats,
      watchListSize: this.watchList.size,
      activePositions: this.activePositions.size
    };
  }
}