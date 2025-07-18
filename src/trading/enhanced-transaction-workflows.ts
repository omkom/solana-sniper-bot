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
  private sourceMapping: Map<string, string> = new Map();
  
  constructor() {
    super();
    this.initializeSourceMapping();
    this.initializeTradeStrategies();
    console.log('🎯 Enhanced Transaction Workflows initialized');
  }

  private initializeSourceMapping(): void {
    // Demo and Educational Sources
    this.sourceMapping.set('demo', 'DEMO');
    this.sourceMapping.set('educational', 'DEMO');
    this.sourceMapping.set('test', 'DEMO');
    this.sourceMapping.set('simulation', 'DEMO');
    
    // Pump.fun Sources
    this.sourceMapping.set('pump.fun', 'PUMP_FUN');
    this.sourceMapping.set('pumpfun', 'PUMP_FUN');
    this.sourceMapping.set('pump', 'PUMP_FUN');
    this.sourceMapping.set('pump_detector', 'PUMP_FUN');
    this.sourceMapping.set('pump_fun', 'PUMP_FUN');
    this.sourceMapping.set('pump-fun', 'PUMP_FUN');
    
    // Raydium Sources
    this.sourceMapping.set('raydium', 'RAYDIUM');
    this.sourceMapping.set('raydium_monitor', 'RAYDIUM');
    this.sourceMapping.set('raydium-monitor', 'RAYDIUM');
    this.sourceMapping.set('raydium_amm', 'RAYDIUM');
    this.sourceMapping.set('raydium_v4', 'RAYDIUM');
    this.sourceMapping.set('websocket-raydium', 'RAYDIUM');
    this.sourceMapping.set('websocket_raydium', 'RAYDIUM');
    this.sourceMapping.set('ray', 'RAYDIUM');
    this.sourceMapping.set('raydium_clmm', 'RAYDIUM');
    
    // Multi-DEX and Scanner Sources
    this.sourceMapping.set('multi_dex', 'RAYDIUM'); // Default to Raydium for multi-dex
    this.sourceMapping.set('multi-dex', 'RAYDIUM');
    this.sourceMapping.set('multidex', 'RAYDIUM');
    this.sourceMapping.set('scanner', 'RAYDIUM');
    this.sourceMapping.set('multi_dex_monitor', 'RAYDIUM');
    this.sourceMapping.set('unified_detector', 'RAYDIUM');
    this.sourceMapping.set('unified-detector', 'RAYDIUM');
    
    // Real-time Monitor Sources
    this.sourceMapping.set('real_monitor', 'RAYDIUM');
    this.sourceMapping.set('real-monitor', 'RAYDIUM');
    this.sourceMapping.set('real_token_monitor', 'RAYDIUM');
    this.sourceMapping.set('real-token-monitor', 'RAYDIUM');
    this.sourceMapping.set('realtime_monitor', 'RAYDIUM');
    this.sourceMapping.set('realtime-monitor', 'RAYDIUM');
    
    // Orca Sources
    this.sourceMapping.set('orca', 'ORCA');
    this.sourceMapping.set('orca_whirlpool', 'ORCA');
    this.sourceMapping.set('orca-whirlpool', 'ORCA');
    this.sourceMapping.set('whirlpool', 'ORCA');
    this.sourceMapping.set('orca_v2', 'ORCA');
    this.sourceMapping.set('orca_clmm', 'ORCA');
    
    // DexScreener Sources
    this.sourceMapping.set('dexscreener', 'DEXSCREENER');
    this.sourceMapping.set('dex_screener', 'DEXSCREENER');
    this.sourceMapping.set('dex-screener', 'DEXSCREENER');
    this.sourceMapping.set('dexscreen', 'DEXSCREENER');
    this.sourceMapping.set('screener', 'DEXSCREENER');
    this.sourceMapping.set('dexscreener_client', 'DEXSCREENER');
    this.sourceMapping.set('dexscreener-client', 'DEXSCREENER');
    
    // Jupiter Sources
    this.sourceMapping.set('jupiter', 'JUPITER');
    this.sourceMapping.set('jup', 'JUPITER');
    this.sourceMapping.set('jupiter_v6', 'JUPITER');
    this.sourceMapping.set('jupiter_aggregator', 'JUPITER');
    this.sourceMapping.set('jupiter-aggregator', 'JUPITER');
    
    // Meteora Sources  
    this.sourceMapping.set('meteora', 'METEORA');
    this.sourceMapping.set('meteora_pools', 'METEORA');
    this.sourceMapping.set('meteora-pools', 'METEORA');
    this.sourceMapping.set('meteora_dlmm', 'METEORA');
    this.sourceMapping.set('meteora_v2', 'METEORA');
    
    // Serum Sources
    this.sourceMapping.set('serum', 'SERUM');
    this.sourceMapping.set('serum_v3', 'SERUM');
    this.sourceMapping.set('serum_dex', 'SERUM');
    this.sourceMapping.set('serum-dex', 'SERUM');
    this.sourceMapping.set('openbook', 'SERUM');
    this.sourceMapping.set('openbook_v2', 'SERUM');
    
    // WebSocket Sources
    this.sourceMapping.set('websocket', 'RAYDIUM'); // Default WebSocket to Raydium
    this.sourceMapping.set('websocket_monitor', 'RAYDIUM');
    this.sourceMapping.set('websocket-monitor', 'RAYDIUM');
    this.sourceMapping.set('ws', 'RAYDIUM');
    this.sourceMapping.set('ws_monitor', 'RAYDIUM');
    
    // Generic Sources
    this.sourceMapping.set('api', 'DEXSCREENER');
    this.sourceMapping.set('client', 'DEXSCREENER');
    this.sourceMapping.set('monitor', 'RAYDIUM');
    this.sourceMapping.set('detector', 'RAYDIUM');
    this.sourceMapping.set('tracker', 'RAYDIUM');
    this.sourceMapping.set('watcher', 'RAYDIUM');
    
    // Rapid Analyzer Sources
    this.sourceMapping.set('rapid_analyzer', 'RAYDIUM');
    this.sourceMapping.set('rapid-analyzer', 'RAYDIUM');
    this.sourceMapping.set('rapid_token_analyzer', 'RAYDIUM');
    this.sourceMapping.set('rapid-token-analyzer', 'RAYDIUM');
    
    console.log(`🗺️ Initialized source mapping with ${this.sourceMapping.size} source variations`);
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
        maxTokenAge: 10 * 60 * 1000, // 10 minutes max age (increased for processing delays)
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
        maxTokenAge: 30 * 60 * 1000, // 30 minutes max age (increased for processing delays) (increased for processing delays) (increased for processing delays)
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
        maxTokenAge: 30 * 60 * 1000, // 30 minutes max age (increased for processing delays) (increased for processing delays)
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
        maxTokenAge: 35 * 60 * 1000, // 35 minutes max age (increased for processing delays)
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

    // Jupiter Strategy - Medium Priority
    this.strategies.set('JUPITER', {
      source: 'jupiter',
      priority: 'MEDIUM',
      basePositionSize: 0.005,
      maxHoldTime: 90 * 60 * 1000, // 1.5 hours max
      entryConditions: {
        minSecurityScore: 30,
        maxTokenAge: 30 * 60 * 1000, // 30 minutes max age (increased for processing delays)
        minLiquidity: 5000, // $5000 minimum
        requiredChecks: ['mintAuthority', 'liquidityDistribution']
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 500, sellPercentage: 75, reason: '500%+ gains - Jupiter success' },
          { roi: 250, sellPercentage: 60, reason: '250%+ gains - Jupiter exit' },
          { roi: 100, sellPercentage: 40, reason: '100%+ gains - Jupiter profit' },
          { roi: 50, sellPercentage: 25, reason: '50%+ gains - Jupiter early profit' }
        ],
        stopLoss: { roi: -18, reason: 'Jupiter stop loss' },
        timeBasedExit: { maxHoldTime: 90 * 60 * 1000, reason: 'Jupiter max hold time' }
      },
      positionSizing: {
        ageMultiplier: [
          { maxAge: 5 * 60 * 1000, multiplier: 2.0 },
          { maxAge: 15 * 60 * 1000, multiplier: 1.7 },
          { maxAge: 25 * 60 * 1000, multiplier: 1.4 }
        ],
        securityMultiplier: [
          { minScore: 75, multiplier: 1.8 },
          { minScore: 60, multiplier: 1.5 },
          { minScore: 45, multiplier: 1.3 },
          { minScore: 30, multiplier: 1.1 }
        ],
        liquidityMultiplier: [
          { minLiquidity: 50000, multiplier: 1.8 },
          { minLiquidity: 25000, multiplier: 1.5 },
          { minLiquidity: 10000, multiplier: 1.3 }
        ],
        sourceMultiplier: 1.6,
        urgencyMultiplier: [
          { urgency: 'ULTRA_HIGH', multiplier: 1.8 },
          { urgency: 'HIGH', multiplier: 1.5 },
          { urgency: 'MEDIUM', multiplier: 1.3 },
          { urgency: 'LOW', multiplier: 1.0 }
        ]
      }
    });

    // Meteora Strategy - Medium Priority
    this.strategies.set('METEORA', {
      source: 'meteora',
      priority: 'MEDIUM',
      basePositionSize: 0.005,
      maxHoldTime: 90 * 60 * 1000, // 1.5 hours max
      entryConditions: {
        minSecurityScore: 35,
        maxTokenAge: 30 * 60 * 1000, // 30 minutes max age (increased for processing delays) (increased for processing delays)
        minLiquidity: 6000, // $6000 minimum
        requiredChecks: ['mintAuthority', 'liquidityDistribution']
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 400, sellPercentage: 70, reason: '400%+ gains - Meteora success' },
          { roi: 200, sellPercentage: 55, reason: '200%+ gains - Meteora exit' },
          { roi: 100, sellPercentage: 35, reason: '100%+ gains - Meteora profit' },
          { roi: 50, sellPercentage: 20, reason: '50%+ gains - Meteora early profit' }
        ],
        stopLoss: { roi: -16, reason: 'Meteora stop loss' },
        timeBasedExit: { maxHoldTime: 90 * 60 * 1000, reason: 'Meteora max hold time' }
      },
      positionSizing: {
        ageMultiplier: [
          { maxAge: 4 * 60 * 1000, multiplier: 2.0 },
          { maxAge: 12 * 60 * 1000, multiplier: 1.6 },
          { maxAge: 20 * 60 * 1000, multiplier: 1.3 }
        ],
        securityMultiplier: [
          { minScore: 80, multiplier: 1.8 },
          { minScore: 65, multiplier: 1.5 },
          { minScore: 50, multiplier: 1.3 },
          { minScore: 35, multiplier: 1.1 }
        ],
        liquidityMultiplier: [
          { minLiquidity: 50000, multiplier: 1.8 },
          { minLiquidity: 25000, multiplier: 1.5 },
          { minLiquidity: 12000, multiplier: 1.3 }
        ],
        sourceMultiplier: 1.5,
        urgencyMultiplier: [
          { urgency: 'ULTRA_HIGH', multiplier: 1.8 },
          { urgency: 'HIGH', multiplier: 1.5 },
          { urgency: 'MEDIUM', multiplier: 1.3 },
          { urgency: 'LOW', multiplier: 1.0 }
        ]
      }
    });

    // Serum Strategy - Low Priority
    this.strategies.set('SERUM', {
      source: 'serum',
      priority: 'LOW',
      basePositionSize: 0.004,
      maxHoldTime: 120 * 60 * 1000, // 2 hours max
      entryConditions: {
        minSecurityScore: 50,
        maxTokenAge: 50 * 60 * 1000, // 50 minutes max age (increased for processing delays)
        minLiquidity: 10000, // $10000 minimum
        requiredChecks: ['mintAuthority', 'liquidityDistribution', 'volumePattern']
      },
      exitConditions: {
        takeProfitLevels: [
          { roi: 300, sellPercentage: 65, reason: '300%+ gains - Serum success' },
          { roi: 150, sellPercentage: 50, reason: '150%+ gains - Serum exit' },
          { roi: 75, sellPercentage: 30, reason: '75%+ gains - Serum profit' },
          { roi: 40, sellPercentage: 15, reason: '40%+ gains - Serum early profit' }
        ],
        stopLoss: { roi: -12, reason: 'Serum stop loss' },
        timeBasedExit: { maxHoldTime: 120 * 60 * 1000, reason: 'Serum max hold time' }
      },
      positionSizing: {
        ageMultiplier: [
          { maxAge: 10 * 60 * 1000, multiplier: 1.8 },
          { maxAge: 25 * 60 * 1000, multiplier: 1.5 },
          { maxAge: 45 * 60 * 1000, multiplier: 1.2 }
        ],
        securityMultiplier: [
          { minScore: 85, multiplier: 1.7 },
          { minScore: 70, multiplier: 1.4 },
          { minScore: 55, multiplier: 1.2 },
          { minScore: 50, multiplier: 1.1 }
        ],
        liquidityMultiplier: [
          { minLiquidity: 75000, multiplier: 1.7 },
          { minLiquidity: 40000, multiplier: 1.4 },
          { minLiquidity: 20000, multiplier: 1.2 }
        ],
        sourceMultiplier: 1.3,
        urgencyMultiplier: [
          { urgency: 'ULTRA_HIGH', multiplier: 1.6 },
          { urgency: 'HIGH', multiplier: 1.3 },
          { urgency: 'MEDIUM', multiplier: 1.1 },
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
    
    console.log(`🎯 [ENHANCED] Evaluating ${tokenInfo.symbol || (tokenInfo.mint || tokenInfo.address).slice(0, 8)} from ${source}`);
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
    const source = tokenInfo.source?.toLowerCase().trim() || 'unknown';
    
    console.log(`🔍 [SOURCE MAPPING] Input source: "${source}" (original: "${tokenInfo.source}")`);
    
    // First try exact match from source mapping
    if (this.sourceMapping.has(source)) {
      const mappedSource = this.sourceMapping.get(source)!;
      console.log(`✅ [SOURCE MAPPING] Exact match: "${source}" -> "${mappedSource}"`);
      return mappedSource;
    }
    
    // Try partial matching with contains logic for complex source names
    for (const [key, value] of this.sourceMapping.entries()) {
      if (source.includes(key) || key.includes(source)) {
        console.log(`✅ [SOURCE MAPPING] Partial match: "${source}" contains "${key}" -> "${value}"`);
        return value;
      }
    }
    
    // Special case handling for metadata-based detection
    if (tokenInfo.metadata) {
      // Check for demo tokens in metadata
      if (tokenInfo.metadata.demo || tokenInfo.metadata.educational || tokenInfo.metadata.test) {
        console.log(`✅ [SOURCE MAPPING] Demo token detected via metadata -> "DEMO"`);
        return 'DEMO';
      }
      
      // Check for pump detection indicators
      if (tokenInfo.metadata.pumpDetected || tokenInfo.metadata.pumpScore) {
        console.log(`✅ [SOURCE MAPPING] Pump detected via metadata -> "PUMP_FUN"`);
        return 'PUMP_FUN';
      }
      
      // Check for specific DEX indicators in metadata
      if (tokenInfo.metadata.raydiumPool || tokenInfo.metadata.ammId) {
        console.log(`✅ [SOURCE MAPPING] Raydium pool detected via metadata -> "RAYDIUM"`);
        return 'RAYDIUM';
      }
      
      if (tokenInfo.metadata.orcaPool || tokenInfo.metadata.whirlpool) {
        console.log(`✅ [SOURCE MAPPING] Orca pool detected via metadata -> "ORCA"`);
        return 'ORCA';
      }
      
      if (tokenInfo.metadata.dexScreener || tokenInfo.metadata.pairAddress) {
        console.log(`✅ [SOURCE MAPPING] DexScreener detected via metadata -> "DEXSCREENER"`);
        return 'DEXSCREENER';
      }
    }
    
    // Fallback: check for common patterns in source string
    const fallbackPatterns = [
      { pattern: ['pump', 'fun'], strategy: 'PUMP_FUN' },
      { pattern: ['ray', 'raydium'], strategy: 'RAYDIUM' },
      { pattern: ['orca', 'whirl'], strategy: 'ORCA' },
      { pattern: ['dex', 'screener', 'screen'], strategy: 'DEXSCREENER' },
      { pattern: ['jupiter', 'jup'], strategy: 'JUPITER' },
      { pattern: ['meteora', 'dlmm'], strategy: 'METEORA' },
      { pattern: ['serum', 'openbook'], strategy: 'SERUM' },
      { pattern: ['multi', 'scanner', 'unified'], strategy: 'RAYDIUM' },
      { pattern: ['websocket', 'ws', 'real', 'monitor'], strategy: 'RAYDIUM' },
      { pattern: ['demo', 'test', 'educational'], strategy: 'DEMO' }
    ];
    
    for (const { pattern, strategy } of fallbackPatterns) {
      if (pattern.some(p => source.includes(p))) {
        console.log(`✅ [SOURCE MAPPING] Fallback match: "${source}" contains pattern ${pattern} -> "${strategy}"`);
        return strategy;
      }
    }
    
    // Final fallback: use unknown strategy
    console.log(`⚠️ [SOURCE MAPPING] No match found for "${source}" -> "UNKNOWN"`);
    return 'UNKNOWN';
  }

  private getStrategyForSource(source: string): TradeStrategy {
    // Source is already mapped by identifyTokenSource(), so we can use it directly
    const strategy = this.strategies.get(source);
    
    if (strategy) {
      console.log(`✅ [STRATEGY] Found strategy for source "${source}": ${strategy.priority} priority, ${strategy.basePositionSize} SOL base`);
      return strategy;
    }
    
    // If no strategy found, log warning and use default
    console.log(`⚠️ [STRATEGY] No strategy found for source "${source}", using default strategy`);
    return this.getDefaultStrategy();
  }

  private getDefaultStrategy(): TradeStrategy {
    return {
      source: 'unknown',
      priority: 'LOW', // Conservative for unknown sources
      basePositionSize: 0.003, // Smaller position for unknown sources
      maxHoldTime: 60 * 60 * 1000, // 1 hour max
      entryConditions: {
        minSecurityScore: 70, // Higher security requirement
        maxTokenAge: 30 * 60 * 1000, // 30 minutes max age (increased for processing delays) (increased for processing delays) (increased for processing delays)
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

    // Token age check with processing delay adjustment
    const ageMs = this.calculateAdjustedTokenAge(tokenInfo);
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

    // Age multiplier using adjusted age
    const ageMs = this.calculateAdjustedTokenAge(tokenInfo);
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

  private calculateAdjustedTokenAge(tokenInfo: TokenInfo): number {
    const now = Date.now();
    let baseAge = now - (tokenInfo.createdAt || now);
    
    // Check if we have detection timestamp to calculate processing delay
    const detectedAt = tokenInfo.metadata?.detectedAt;
    if (detectedAt && detectedAt > (tokenInfo.createdAt || detectedAt)) {
      // Calculate processing delay
      const processingDelay = detectedAt - (tokenInfo.createdAt || detectedAt);
      
      // Subtract processing delay from current age calculation
      // This accounts for the time between token creation and our detection
      baseAge = now - detectedAt;
      
      console.log(`🕐 Age adjustment: Token created ${Math.round((now - (tokenInfo.createdAt || now))/60000)}m ago, detected ${Math.round(processingDelay/60000)}m later, effective age: ${Math.round(baseAge/60000)}m`);
    }
    
    // Apply freshness bonus for very new tokens (detected within last 30 seconds)
    if (detectedAt && (now - detectedAt) < 30000) {
      // Give extra 30 seconds of "freshness" for very new tokens
      baseAge = Math.max(0, baseAge - 30000);
      console.log(`🚀 Freshness bonus applied: Reducing effective age by 30s`);
    }
    
    return baseAge;
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

    // Age impact (newer = more urgent) - using adjusted age
    const ageMs = this.calculateAdjustedTokenAge(tokenInfo);
    if (ageMs < 30 * 1000) urgencyScore += 4; // < 30 sec (ultra fresh)
    else if (ageMs < 60 * 1000) urgencyScore += 3; // < 1 min
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
    const ageMs = Date.now() - (tokenInfo.createdAt || Date.now());
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
    const ageMs = Date.now() - (tokenInfo.createdAt || Date.now());
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

  getSourceMappingStats(): any {
    const mappingsByStrategy: { [key: string]: string[] } = {};
    
    // Group all source variations by their target strategy
    this.sourceMapping.forEach((strategy, source) => {
      if (!mappingsByStrategy[strategy]) {
        mappingsByStrategy[strategy] = [];
      }
      mappingsByStrategy[strategy].push(source);
    });

    return {
      totalMappings: this.sourceMapping.size,
      mappingsByStrategy,
      strategiesWithMappings: Object.keys(mappingsByStrategy).length,
      availableStrategies: Array.from(this.strategies.keys())
    };
  }

  testSourceMapping(testSources: string[]): any {
    const results: any[] = [];
    
    for (const testSource of testSources) {
      const mockTokenInfo = {
        address: 'test',
        mint: 'test',
        symbol: 'TEST',
        name: 'Test Token',
        decimals: 9,
        supply: '1000000',
        signature: 'test',
        timestamp: Date.now(),
        createdAt: Date.now(),
        source: testSource,
        detected: true,
        detectedAt: Date.now(),
        liquidity: { sol: 1, usd: 100 },
        metadata: {}
      };
      
      const identifiedSource = this.identifyTokenSource(mockTokenInfo);
      const strategy = this.getStrategyForSource(identifiedSource);
      
      results.push({
        inputSource: testSource,
        identifiedSource,
        strategy: strategy.source,
        priority: strategy.priority,
        basePositionSize: strategy.basePositionSize
      });
    }
    
    return {
      testResults: results,
      summary: {
        totalTested: testSources.length,
        strategiesUsed: [...new Set(results.map(r => r.identifiedSource))],
        unknownSources: results.filter(r => r.identifiedSource === 'UNKNOWN').length
      }
    };
  }
}