# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with this hyper-efficient token sniping tool.

## Important Security Notice

This codebase is a **high-performance educational Solana token sniping tool** with creator intelligence and rugpull detection. Claude Code will:
- Analyze existing code for educational purposes with 70% educational / 30% technical focus
- Explain high-performance token detection and creator intelligence systems
- Help with security analysis, rugpull detection, and vulnerability identification
- Assist with performance optimization targeting >60% win rate and >25% ROI
- Enhance creator wallet tracking and historical database features
- **NOT modify the TRIPLE-LOCKED DRY_RUN mode** - all trading remains simulated
- **NOT create real trading functionality** - educational simulation only
- **NOT bypass safety constraints** - simulation boundaries must remain intact
- **NOT enable real targeting** - creator intelligence for educational analysis only

## Core Objective

Build a hyper-efficient educational token sniping tool that:
- Detects tokens within <5 seconds of launch (target), <10s fallback
- Shows ALL tokens with risk information (no filtering by security score)
- Performs instant analysis with creator wallet intelligence
- Executes profitable simulated trades with multi-strategy exit options
- Tracks creator wallets and rugpull patterns for educational purposes
- Maintains >60% win rate and >25% ROI educational benchmarks
- Uses REAL market data while remaining 100% educational simulation

## Technical Stack & Standards

### Language & Typing
- **Strict TypeScript**: No `any` types. Use `unknown` with type guards when necessary
- **Interfaces**: All data structures defined in `src/types/unified.ts`
- **Type Guards**: Implement runtime validation for external data

### Code Structure
```
src/
├── core/
│   ├── config.ts          # Centralized configuration
│   ├── orchestrator.ts    # Main coordination engine
│   └── connection-pool.ts # Multi-RPC failover
├── detection/
│   ├── blockchain-analyzer.ts  # Direct chain monitoring
│   ├── mempool-scanner.ts     # Pre-launch detection
│   └── multi-source-aggregator.ts
├── analysis/
│   ├── security-scanner.ts    # Info-only, no filtering
│   └── metrics-calculator.ts
├── trading/
│   ├── simulation-engine.ts   # <10min token simulator
│   ├── execution-engine.ts    # Live trading logic
│   └── exit-strategy.ts       # ROI maximization
├── monitoring/
│   ├── real-time-dashboard.ts
│   └── websocket-server.ts
└── utils/
    ├── rate-limiter.ts
    └── performance-profiler.ts
```

## Key Implementation Requirements

### 1. Ultra-Fast Priority-Based Token Detection
```typescript
interface DetectionConfig {
  sources: {
    // Priority 1: Primary memecoin source
    pumpfun: { enabled: true; priority: 1; multiplier: 2.0 };
    // Priority 2: High volume source  
    raydium: { enabled: true; priority: 2; multiplier: 1.8 };
    // Priority 3: Stable liquidity
    orca: { enabled: true; priority: 3; multiplier: 1.5 };
    // Priority 4+: Supplementary
    jupiter: { enabled: true; priority: 4; multiplier: 1.2 };
    meteora: { enabled: true; priority: 5; multiplier: 1.0 };
    serum: { enabled: true; priority: 6; multiplier: 1.0 };
    
    dexScreener: { 
      enabled: true; 
      primary: true;
      rateLimit: 100; // requests per minute
      updateFreq: 30000; // 30s discovery, 15s prices
    };
    blockchain: {
      rpcEndpoints: string[];      // Multiple for failover
      healthChecks: true;          // Automatic failover
      creatorTracking: true;       // Track wallet creators
    };
  };
  maxLatency: 5000;                // <5s target, <10s fallback
  showAllTokens: true;             // Display ALL tokens with risk info
  parallelProcessing: true;
  creatorIntelligence: true;       // Enable creator database
}
```

### 2. Blockchain Analysis Integration
```typescript
// Already coded but needs integration:
class BlockchainAnalyzer {
  async analyzeTransaction(txId: string): Promise<TokenLaunchData> {
    // Direct RPC calls to analyze:
    // - Token mint creation
    // - Liquidity pool initialization
    // - Initial holder distribution
    // - Smart contract verification
  }
  
  async monitorMempool(): AsyncGenerator<PendingTokenLaunch> {
    // WebSocket subscription to pending transactions
    // Filter for token creation patterns
    // Yield potential launches before confirmation
  }
}
```

### 3. Enhanced Security Analysis with Creator Intelligence (Information Only)
```typescript
interface SecurityInfo {
  score: number;              // 0-100 (show ALL tokens >= 1)
  visualDisplay: {
    badge: '🔴' | '🟠' | '🟢';   // <3, 3-6, >6
    radarChart: boolean;       // Detailed breakdown
    tokenIcon: string;         // Display token image
  };
  priorityMetrics: {
    honeypotRisk: number;      // CRITICAL - highest priority
    liquidityLocked: boolean;  // High priority
    ownershipRenounced: boolean; // High priority
    topHolderConcentration: number; // Medium priority
    contractVerified: boolean; // Medium priority
  };
  creatorIntelligence: {
    walletAddress: string;     // Creator wallet tracking
    historicalTokens: number;  // Tokens created by this wallet
    rugpullHistory: {
      count: number;
      priceAtDump: number[];   // Historical dump prices
    };
    marketMakerActivity: {
      buyCount: number;
      sellCount: number;
      avgHoldTime: number;
    };
    successRate: number;       // % of successful tokens
    riskMultiplier: number;    // 1.3x verified, 1x unknown, 0.7x flagged
  };
  socialMedia: {
    twitterVerified: boolean;
    telegramActive: boolean;
    websiteValid: boolean;
    socialScore: number;
  };
  // NO FILTERING - show ALL tokens with color-coded warnings
  recommendation: 'PROCEED' | 'CAUTION' | 'HIGH_RISK';
  displayAllTokens: true;      // Never filter, always show with warnings
}
```

### 4. Multi-Strategy Intelligent Simulation with Creator Intelligence
```typescript
interface TradingStrategy {
  simulation: {
    enabledFor: 'TOKENS_UNDER_10_MINUTES'; // Optimal entry window
    baseAmount: 0.003;       // SOL (UI configurable 0.001-0.01)
    uiConfigurable: true;    // Allow user adjustment
    maxPositions: 500;       // Auto-scaling based on memory
    autoScaling: true;       // Dynamic based on system resources
  };
  
  analysis: {
    buyWindow: 600000;       // 10 minutes (optimal)
    analysisWindow: 3600000; // 1 hour (improved from 3h)
    metricsTracked: [
      'volume', 'holders', 'priceAction', 
      'socialSignals', 'creatorActivity', 'rugpullRisk'
    ];
    creatorIntelligence: true;
  };
  
  multiStrategy: {
    conservative: { holdPercent: 5, stopLoss: -15 };    // Lower risk
    balanced: { holdPercent: 10, stopLoss: -20 };       // Default
    aggressive: { holdPercent: 15, stopLoss: -20 };     // Higher risk
    ultraAggressive: { holdPercent: 1, stopLoss: -20 }; // Moon-or-bust
    
    dynamicHoldTimes: {
      highQuality: 21600000;  // 6 hours (score >8)
      standard: 7200000;      // 2 hours 
      risky: 1800000;        // 30 minutes (score <5)
    };
  };
  
  execution: {
    mode: 'CREATOR_AWARE';   // Adjust based on creator history
    creatorMultipliers: {
      verified: 1.3;         // Boost verified creators
      unknown: 1.0;          // Neutral
      flagged: 0.7;          // Reduce flagged creators
    };
    improvedStopLoss: -20;   // Enhanced from -30%
    granularProfitLevels: [25, 50, 100, 200, 300, 500, 1000];
  };
  
  performanceBenchmarks: {
    targetWinRate: 60;       // >60% target
    targetAvgROI: 25;        // >25% per trade
    maxDetectionLatency: 5000; // <5s target
    memoryTarget: 1572864;   // <1.5GB
  };
}
```

### 5. Advanced Multi-Strategy Exit System with Rugpull Protection
```typescript
interface ExitStrategy {
  multiStrategyOptions: {
    ultraAggressive: {
      holdPattern: {
        1000: { sell: 100, hold: 0 };   // Sell all at 1000%
        500: { sell: 90, hold: 10 };
        300: { sell: 85, hold: 15 };
        200: { sell: 80, hold: 20 };
        100: { sell: 70, hold: 30 };
        50: { sell: 50, hold: 50 };
      };
      stopLoss: -20;           // Improved from -30%
    };
    
    balanced: {               // Default strategy
      holdPattern: {
        500: { sell: 90, hold: 10, exitCondition: 'UNTIL_RUGPULL' };
        200: { sell: 75, hold: 25 };
        100: { sell: 0, hold: 100, condition: 'MOMENTUM_BASED' };
        50: { sell: 0, hold: 100, condition: 'IF_PUMPING' };
      };
      stopLoss: -20;
    };
    
    conservative: {
      holdPattern: {
        300: { sell: 95, hold: 5 };
        100: { sell: 85, hold: 15 };
        50: { sell: 70, hold: 30 };
      };
      stopLoss: -15;           // Earlier stop-loss
    };
  };
  
  creatorAwareExits: {
    verifiedCreators: 'EXTENDED_HOLD';   // Longer hold times
    unknownCreators: 'STANDARD_HOLD';    
    flaggedCreators: 'QUICK_EXIT';       // Faster exits
    
    rugpullEarlyWarning: {
      creatorSellPressure: 'MONITOR';     // Track creator sales
      liquidityRemoval: 'ALERT';          // Pool liquidity monitoring
      largeHolderDumps: 'IMMEDIATE_EXIT'; // Top holder activity
      socialSentimentCrash: 'WARNING';    // Social media monitoring
    };
  };
  
  dynamicHoldTimes: {
    highQuality: 21600000;    // 6 hours for score >8
    standard: 7200000;        // 2 hours default
    risky: 1800000;          // 30 minutes for score <5
    emergencyExit: 120000;   // 2 minutes for rugpull alerts
  };
  
  rugPullProtection: {
    realTimeMonitoring: [
      'CREATOR_WALLET_ACTIVITY',
      'LIQUIDITY_REMOVAL_DETECTION',
      'LARGE_HOLDER_DUMPS',
      'SOCIAL_SENTIMENT_CRASH',
      'VOLUME_ANOMALIES'
    ];
    maxExitTime: 100;        // 100ms emergency exit
    creatorDatabaseIntegration: true;
  };
}
```

### 6. Enhanced Frontend-Backend Integration with Creator Intelligence
```typescript
// Enhanced WebSocket Events (10-second UI refresh)
interface RealtimeEvents {
  // Token Intelligence
  'token:detected': UnifiedTokenInfo & { 
    detectionLatency: number; 
    creatorWallet: string;
    securityBadge: '🔴' | '🟠' | '🟢';
    tokenIcon: string;
  };
  'token:analyzed': TokenAnalysis & { 
    securityInfo: SecurityInfo;
    creatorHistory: CreatorIntelligence;
    socialMediaVerified: boolean;
  };
  
  // Trading Events  
  'trade:simulated': SimulationResult & {
    strategy: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE' | 'ULTRA';
    creatorMultiplier: number;
    expectedHoldTime: number;
  };
  'position:update': PositionUpdate & { 
    roi: number; 
    exitRecommendation: string;
    timeRemaining: number;
    rugpullRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  
  // Creator Intelligence Events
  'creator:activity': {
    walletAddress: string;
    activity: 'BUY' | 'SELL' | 'LARGE_TRANSACTION';
    tokenAddress: string;
    amount: number;
    rugpullRisk: number;
  };
  'creator:rugpull': {
    creatorWallet: string;
    tokenAddress: string;
    priceAtDump: number;
    action: 'DATABASE_UPDATE';
  };
  
  // System Performance
  'performance:benchmark': {
    winRate: number;          // Target >60%
    avgROI: number;          // Target >25%
    detectionLatency: number; // Target <5s
    memoryUsage: number;     // Target <1.5GB
    tokensPerMinute: number; // Target 1000+
  };
  
  // Alerts and Warnings
  'alert:rugpull': { 
    tokenAddress: string; 
    creatorWallet: string;
    action: 'EMERGENCY_EXIT';
    priceAtAlert: number;
  };
  'alert:creator': {
    walletAddress: string;
    riskLevel: 'FLAGGED' | 'SUSPICIOUS';
    reason: string;
  };
}

// Enhanced REST API Endpoints
interface APIEndpoints {
  // Core Trading Simulation
  'GET /api/portfolio': PortfolioStats & { benchmark: PerformanceBenchmark };
  'GET /api/positions': Position[] & { creatorInfo: CreatorIntelligence[] };
  'GET /api/trades': TradeHistory[] & { strategyBreakdown: StrategyStats };
  'GET /api/system': SystemHealth & { performanceBenchmarks: Benchmarks };
  
  // Token Intelligence
  'GET /api/tracked-tokens': TokenInfo[] & { 
    showAllTokens: true;
    securityBadges: SecurityBadge[];
    creatorWallets: string[];
  };
  'GET /api/tracked-tokens/stats': TokenStats & { 
    creatorBreakdown: CreatorStats[];
    rugpullHistory: RugpullEvent[];
  };
  
  // Creator Intelligence System
  'GET /api/creator-wallets': CreatorDatabase[];
  'GET /api/creator-wallets/:address': CreatorProfile & {
    tokensCreated: TokenInfo[];
    rugpullHistory: RugpullEvent[];
    successRate: number;
    riskScore: number;
  };
  'GET /api/rugpull-history': RugpullEvent[] & { priceAtDump: number };
  'POST /api/creator-wallets/flag': { wallet: string; reason: string };
  
  // Performance & Strategy
  'GET /api/kpi/benchmarks': {
    winRate: { current: number; target: 60 };
    avgROI: { current: number; target: 25 };
    detectionLatency: { current: number; target: 5000 };
    memoryUsage: { current: number; target: 1572864 };
  };
  'POST /api/strategy/configure': {
    strategy: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE' | 'ULTRA';
    customHoldPercent?: number;
    customStopLoss?: number;
  };
  
  // Security Analysis
  'GET /api/security-scores': SecurityAnalysis[] & { 
    showAll: true;
    colorCoded: boolean;
    radarCharts: boolean;
  };
  'GET /api/security-alerts': SecurityAlert[] & {
    rugpullWarnings: RugpullAlert[];
    creatorAlerts: CreatorAlert[];
  };
}
```

### 7. High-Performance Optimizations with Benchmarking
```typescript
const optimizations = {
  performanceBenchmarks: {
    targetWinRate: 60,        // >60% successful trades
    targetAvgROI: 25,         // >25% per trade
    maxDetectionLatency: 5000, // <5s detection
    maxMemoryUsage: 1572864,  // <1.5GB memory
    minTokensPerMinute: 1000, // Target throughput
    maxSystemUptime: 99,      // >99% availability
  },
  
  caching: {
    tokenMetadata: 1800000,   // 30 minutes (optimized)
    securityScores: 300000,   // 5 minutes  
    priceData: 15000,         // 15 seconds (improved)
    creatorIntelligence: 3600000, // 1 hour creator data
    rugpullDatabase: 86400000, // 24 hours rugpull history
  },
  
  concurrency: {
    maxParallelDetections: 100, // Increased for higher throughput
    maxSimultaneousPositions: 500, // Auto-scaling based on memory
    connectionPoolSize: 20,    
    creatorTrackingThreads: 5, // Dedicated creator monitoring
  },
  
  dataStructures: {
    creatorDatabase: 'MEMORY_OPTIMIZED', // Fast creator lookups
    rugpullHistory: 'INDEXED',  // Quick historical searches
    compressionEnabled: true,   // Network overhead reduction
    garbageCollection: 'AGGRESSIVE', // Memory management
  },
  
  apiOptimizations: {
    dexScreenerConfig: {
      baseUrl: 'https://api.dexscreener.com',
      searchTokensRateLimit: 300,    // Search/Tokens/Pairs endpoints
      profilesRateLimit: 60,         // Profiles/Boosts endpoints  
      batchSize: 30,                 // Max tokens per request
      timeout: 10000,                // 10 second timeout
      endpoints: {
        search: '/latest/dex/search',
        tokens: '/tokens/v1/solana',
        pairs: '/token-pairs/v1/solana',
        profiles: '/token-profiles/latest/v1',
        boosts: '/token-boosts/latest/v1'
      }
    },
    jupiterRateLimit: 50,
    solanaRPCRateLimit: 1000,
    batchProcessing: 30,              // Optimized for DexScreener batch size
    intelligentRetry: 'EXPONENTIAL_BACKOFF',
  }
};
```

### 8. Enhanced Risk Management with Creator Intelligence
```typescript
interface RiskManagement {
  positionManagement: {
    maxConcurrentPositions: 500;  // Auto-scaling based on memory
    basePositionSize: 0.003;      // SOL (UI configurable 0.001-0.01)
    uiConfigurable: true;         // User can adjust via dashboard
    maxPositionPercent: 0.2;      // 20% max of virtual portfolio
    creatorMultipliers: {
      verified: 1.3;              // Boost for verified creators
      unknown: 1.0;               // Neutral for unknown
      flagged: 0.7;               // Reduce for flagged creators
    };
  };
  
  tokenCriteria: {
    showAllTokens: true;          // Display ALL tokens (no filtering)
    minSecurityScore: 1;          // Show everything with warnings
    ageFilters: {
      buyWindow: 600000;          // 10 minutes optimal
      analysisWindow: 3600000;    // 1 hour (improved from 3h)
      dynamicAdjustment: true;    // Based on volatility
    };
    priorityOrder: [
      'PUMP_FUN',                 // Priority 1
      'RAYDIUM',                  // Priority 2  
      'ORCA',                     // Priority 3
      'JUPITER'                   // Priority 4
    ];
  };
  
  creatorRiskManagement: {
    rugpullEarlyWarning: {
      creatorSellPressure: 'MONITOR';
      liquidityRemoval: 'ALERT';
      largeHolderDumps: 'EMERGENCY_EXIT';
      socialSentimentCrash: 'WARNING';
    };
    
    creatorDatabase: {
      trackAllCreators: true;
      flagSuspiciousActivity: true;
      historicalSuccessRate: true;
      priceAtDumpTracking: true;
    };
  };
  
  autoStopConditions: [
    'MEMORY_USAGE_EXCEEDED_1_5GB',
    'DETECTION_LATENCY_OVER_10S',
    'WIN_RATE_BELOW_40_PERCENT',
    'RUGPULL_DETECTED',
    'CREATOR_FLAGGED_ACTIVITY'
  ];
  
  emergencyProcedures: {
    rugpullDetected: 'IMMEDIATE_EXIT_100MS';
    memoryOverflow: 'GRACEFUL_POSITION_REDUCTION';
    apiFailure: 'FAILOVER_TO_SECONDARY';
    creatorAlert: 'POSITION_SIZE_REDUCTION';
  };
}
```

## Enhanced Implementation Guidelines

### High-Performance Architecture
- **Multi-RPC Management**: Round-robin rotation with health checks and failover
- **Priority-Based Processing**: Pump.fun > Raydium > Orca > Others
- **Event Streaming**: EventEmitter with backpressure and 10s UI updates  
- **Creator Intelligence**: Real-time wallet tracking with database updates
- **Error Recovery**: Exponential backoff with graceful degradation
- **Performance Monitoring**: Continuous benchmarking against targets

### Creator Intelligence Implementation
- **Database Schema**: Creator wallets, token history, rugpull events
- **Real-Time Tracking**: Monitor all creator wallet activity
- **Pattern Recognition**: Identify rugpull signatures and success patterns
- **Social Integration**: Twitter/Telegram verification and monitoring
- **Risk Scoring**: Dynamic creator risk assessment

### Testing & Quality Assurance
- **Unit Testing**: 100% coverage for trading and creator intelligence logic
- **Integration Testing**: Multi-DEX connection and failover testing
- **Performance Testing**: Benchmarking against >60% win rate, >25% ROI
- **Creator Database Testing**: Accuracy validation for wallet tracking
- **Load Testing**: 1000+ tokens/min throughput validation

## Enhanced Code Quality Standards

### Code Quality & Safety
- **TypeScript Strict Mode**: Comprehensive type safety with v5.3.0
- **ESLint Configuration**: Zero warnings with creator intelligence linting
- **Prettier Formatting**: Consistent code style on pre-commit
- **Educational Safety**: 70% educational focus / 30% technical
- **DRY_RUN Enforcement**: Triple-locked safety that cannot be bypassed

### Testing Standards
- **Jest Testing**: >90% coverage including creator intelligence
- **Integration Tests**: Multi-strategy exit testing
- **Performance Tests**: Benchmark validation (>60% win, >25% ROI)
- **Creator Database Tests**: Wallet tracking accuracy validation
- **API Tests**: Rate limiting and failover testing

### Documentation Standards
- **TypeDoc Comments**: All public APIs with creator intelligence examples
- **Performance Benchmarks**: Critical path optimization documentation
- **Creator Intelligence**: Rugpull detection algorithm documentation
- **Safety Documentation**: Educational boundaries and simulation limits
- **Multi-Strategy Documentation**: Exit strategy comparisons and examples

## Enhanced Development Commands

### Quick Start (3 Deployment Modes)
```bash
# Install dependencies
npm install

# 🎯 Rapid Mode (RECOMMENDED - Instant Demo)
npm run dev:rapid        # High-frequency detection with creator intelligence

# 🌐 Real Data Mode (Live Market Integration)
npm run dev:real         # Live DexScreener API with REAL market data

# 📊 Standard Mode (Balanced Performance)
npm run dev              # Default educational mode with all features
```

### Production & Testing
```bash
# Production deployment
npm start                # Standard production mode
npm start:rapid          # High-performance production

# Development builds
npm run build            # TypeScript compilation
npm run dev:analysis     # Deep analysis mode

# Quality assurance
npm test                 # Jest test suite with creator intelligence tests
npm run test:performance # Performance benchmark validation
npm run lint             # ESLint with TypeScript strict mode
npm run typecheck        # TypeScript validation

# Creator intelligence testing
npm run test:creators    # Creator database accuracy tests
npm run test:rugpull     # Rugpull detection algorithm tests
```

### Performance Monitoring
```bash
# Benchmark testing
npm run benchmark:winrate    # >60% win rate validation
npm run benchmark:roi        # >25% ROI validation  
npm run benchmark:latency    # <5s detection testing
npm run benchmark:memory     # <1.5GB usage validation
npm run benchmark:throughput # 1000+ tokens/min testing
```

## Current System Components

### Core Systems
- **Enhanced Dry-Run Engine** (`src/simulation/dry-run-engine.ts`): Advanced profit-maximizing exit strategies
- **Token Price Tracker** (`src/monitoring/token-price-tracker.ts`): Real-time price monitoring
- **Migration Monitor** (`src/monitoring/migration-monitor.ts`): DEX migration tracking
- **KPI Tracker** (`src/monitoring/kpi-tracker.ts`): Performance metrics collection
- **Enhanced Dashboard** (`src/monitoring/dashboard.ts`): Real-time web interface

### Detection Systems
- **Multi-DEX Monitor** (`src/detection/multi-dex-monitor.ts`): Monitors Raydium, Orca, Meteora, Pump.fun, Jupiter, and Serum
- **Rapid Token Analyzer** (`src/core/rapid-token-analyzer.ts`): High-performance token processing
- **Pump Detection** (`src/detection/pump-detector.ts`): Momentum detection algorithms
- **Security Analysis** (`src/analysis/security-analyzer.ts`): Comprehensive token safety evaluation

## Enhanced Configuration with Creator Intelligence

### Core Environment Variables (`.env`)
```env
# TRIPLE-LOCKED SAFETY - CANNOT BE MODIFIED
MODE=DRY_RUN                          # Hardcoded educational safety
EDUCATIONAL_FOCUS=70                  # 70% educational / 30% technical
REAL_TRADING_DISABLED=TRUE            # Cannot be bypassed

# Multi-RPC Configuration with Failover
RPC_PRIMARY=https://api.mainnet-beta.solana.com
RPC_SECONDARY=https://api.mainnet-beta.solana.com
RPC_HEALTH_CHECK_INTERVAL=30000       # 30s health checks
RPC_FAILOVER_ENABLED=TRUE             # Automatic failover

# Priority-Based Detection Parameters  
MIN_LIQUIDITY_SOL=0.01                # Very permissive (show ALL tokens)
MIN_CONFIDENCE_SCORE=1                # Show all with warnings
MAX_ANALYSIS_AGE_MS=3600000           # 1 hour optimal (improved from 10min)
PRIORITY_SOURCES=PUMP_FUN,RAYDIUM,ORCA,JUPITER # Priority order

# Enhanced Simulation Parameters
SIMULATED_INVESTMENT=0.003            # Base (UI configurable 0.001-0.01)
MAX_SIMULATED_POSITIONS=500           # Auto-scaling based on memory
STARTING_BALANCE=10                   # Virtual SOL balance
UI_CONFIGURABLE_POSITIONS=TRUE        # Allow user adjustment

# Creator Intelligence Configuration
CREATOR_TRACKING_ENABLED=TRUE         # Enable wallet tracking
CREATOR_DATABASE_RETENTION=30         # 30 days detailed data
RUGPULL_DETECTION_ENABLED=TRUE        # Enable rugpull monitoring
SOCIAL_MEDIA_VERIFICATION=TRUE        # Twitter/Telegram checks

# Performance Benchmarks
TARGET_WIN_RATE=60                    # >60% target
TARGET_AVG_ROI=25                     # >25% per trade
TARGET_DETECTION_LATENCY=5000         # <5s target
TARGET_MEMORY_USAGE_MB=1536           # <1.5GB target
TARGET_TOKENS_PER_MINUTE=1000         # Target throughput

# Enhanced Dashboard Configuration
DASHBOARD_PORT=3000                   # Web interface port
UI_REFRESH_INTERVAL=10000             # 10s dashboard refresh
PRICE_UPDATE_INTERVAL=15000           # 15s price updates (improved)
CREATOR_PANEL_ENABLED=TRUE            # Show creator intelligence panel

# DexScreener API Configuration (Optimized)
DEXSCREENER_BASE_URL=https://api.dexscreener.com
DEXSCREENER_SEARCH_RATE_LIMIT=300     # Search/Tokens/Pairs: 300 req/min
DEXSCREENER_PROFILES_RATE_LIMIT=60    # Profiles/Boosts: 60 req/min
DEXSCREENER_BATCH_SIZE=30             # Max tokens per batch request
DEXSCREENER_TIMEOUT=10000             # 10 second timeout

# Other API Rate Limiting
JUPITER_RATE_LIMIT=50                 # 50 req/min
SOLANA_RPC_RATE_LIMIT=1000            # 1000 req/min

# High-Performance Tuning (DexScreener Optimized)
BATCH_SIZE=30                         # DexScreener optimized batch size
CONCURRENT_THREADS=8                  # Multi-core optimization
GARBAGE_COLLECTION=AGGRESSIVE         # Memory management
LOG_LEVEL=info                        # Logging verbosity
LOG_RETENTION_DAYS=30                 # 30-day log retention
```

## Enhanced API Endpoints with Creator Intelligence

```typescript
// Core Trading Simulation
GET /api/portfolio              # Portfolio with benchmark comparison
GET /api/positions              # Active positions with creator info
GET /api/trades                # Complete trade history with strategies
GET /api/system                # System health with performance metrics

// Token Intelligence (Show ALL Tokens)
GET /api/tracked-tokens         # All tokens with security badges
GET /api/tracked-tokens/stats   # Statistics with creator breakdown
GET /api/tracked-tokens/:address/history  # Price history with creator events
GET /api/security-scores        # All security analysis (no filtering)

// Creator Intelligence System
GET /api/creator-wallets        # Complete creator database
GET /api/creator-wallets/:address  # Individual creator profile
GET /api/rugpull-history        # Historical rugpull events
GET /api/creator-alerts         # Creator risk alerts
POST /api/creator-wallets/flag  # Flag suspicious creator activity

// Performance Benchmarking
GET /api/kpi/benchmarks         # Performance vs targets (>60% win, >25% ROI)
GET /api/kpi/metrics           # Detailed KPI tracking
GET /api/kpi/creator-performance # Creator-specific performance metrics
GET /api/performance/latency    # Detection latency monitoring (<5s target)
GET /api/performance/memory     # Memory usage tracking (<1.5GB target)

// Strategy Configuration
POST /api/strategy/configure    # Set Conservative/Balanced/Aggressive/Ultra
GET /api/strategy/comparison    # Compare strategy performance
POST /api/position-size/config  # Configure UI position sizing (0.001-0.01)

// Social Media Integration
GET /api/social/verification    # Token social media verification status
GET /api/social/sentiment      # Social sentiment analysis
GET /api/social/alerts         # Social sentiment crash alerts
```

## Enhanced WebSocket Events (10-Second UI Refresh)

```typescript
// Core Trading Events
'portfolio' -> Portfolio statistics with benchmark comparison
'positions' -> Position updates with creator intelligence and ROI
'newTrade' -> Trade execution with strategy info and creator multipliers
'exitStrategy' -> Exit strategy triggers and multi-strategy comparison

// Token Intelligence (Show ALL Tokens)
'tokenAdded' -> New token detection with security badges and creator info
'priceUpdate' -> 15-second price updates with momentum indicators
'securityAnalysis' -> Complete security analysis (no filtering)
'tokenIcon' -> Token image display for enhanced visualization

// Creator Intelligence Events
'creatorActivity' -> Real-time creator wallet monitoring
'creatorProfile' -> Creator database updates and history
'rugpullDetected' -> Rugpull events with price at dump
'creatorAlert' -> Creator risk flags and suspicious activity
'socialVerification' -> Twitter/Telegram verification status

// Performance Monitoring
'performanceBenchmark' -> Real-time benchmark tracking
'systemHealth' -> Memory usage (<1.5GB), detection latency (<5s)
'winRateUpdate' -> Win rate tracking (target >60%)
'roiUpdate' -> ROI performance (target >25%)
'throughputMetrics' -> Tokens/minute processing (target 1000+)

// Strategy & Configuration
'strategyChange' -> Multi-strategy switching events
'positionSizeConfig' -> UI position size configuration updates
'holdTimeUpdate' -> Dynamic hold time adjustments (6h/2h/30min)

// Alerts & Warnings
'rugpullAlert' -> Emergency rugpull detection and exit triggers
'memoryWarning' -> Memory usage approaching limits
'latencyWarning' -> Detection latency exceeding targets
'creatorFlagged' -> Creator flagged for suspicious activity
```

## Enhanced Educational Boundaries with Creator Intelligence

### Triple-Locked Safety Constraints
- **DRY_RUN Mode**: Cannot be disabled - hardcoded with triple validation
- **Educational Focus**: 70% educational content / 30% technical demonstration
- **Virtual Assets**: Simulated SOL balance with zero real fund risk
- **Creator Intelligence**: Educational wallet analysis only - no real targeting
- **Safety Warnings**: Prominent indicators throughout all interfaces
- **Complete Audit Trail**: All activities logged with 30-day retention

### Enhanced Technical Limits
- **Position Management**: 500+ concurrent positions with auto-scaling
- **Token Display**: Show ALL tokens (≥1 score) with risk warnings
- **Age Processing**: <10min optimal buy window, <1h analysis window
- **Creator Database**: Educational tracking only - no real-world application
- **Memory Management**: <1.5GB target with aggressive garbage collection
- **Performance Limits**: >60% win rate and >25% ROI educational targets

### Creator Intelligence Boundaries
- **Wallet Tracking**: Educational pattern analysis only
- **Rugpull Database**: Historical education - not predictive targeting
- **Social Integration**: Verification for educational completeness
- **Risk Scoring**: Creator multipliers for educational simulation only
- **Database Usage**: 30-day retention for learning purposes

### System Performance Boundaries
- **Detection Speed**: <5s target for educational responsiveness
- **Memory Usage**: <1.5GB to ensure accessibility on standard systems
- **API Usage**: Respectful rate limiting (100 req/min DexScreener)
- **Throughput**: Target 1000+ tokens/min for comprehensive education
- **Uptime**: >99% availability for consistent learning experience

## Troubleshooting

### Common Issues
- **High Memory Usage**: Check position limits and token cleanup
- **Slow Performance**: Verify RPC connection and batch sizes
- **Missing Data**: Check WebSocket connections and API endpoints
- **Dashboard Issues**: Verify port availability and build status

### Debug Information
- **Logs**: Check all log files for detailed information
- **Dashboard**: Monitor system status at http://localhost:3000
- **API**: Test endpoints directly for data verification
- **WebSocket**: Monitor real-time connections and events

---

## 🎯 Implementation Priorities

### Phase 1 (Immediate - Safety & Core Features)
- **Hardcode DRY_RUN Mode**: Triple-locked safety enforcement
- **Creator Intelligence Database**: Implement wallet tracking system
- **Security Badge Display**: Color-coded visualization (\ud83d\udd34\ud83d\udfe0\ud83d\udfe2) 
- **Show ALL Tokens**: Remove filtering, display with risk warnings
- **Performance Benchmarks**: Implement >60% win rate, >25% ROI tracking

### Phase 2 (Short-term - Enhanced Features)
- **Multi-Strategy Exits**: Conservative/Balanced/Aggressive/Ultra options
- **UI Position Configuration**: 0.001-0.01 SOL user adjustment
- **Real-Time Updates**: 15s prices, 10s UI refresh implementation
- **Creator Multipliers**: 1.3x verified, 1x unknown, 0.7x flagged
- **Rugpull Detection**: Early warning system with database integration

### Phase 3 (Medium-term - Advanced Intelligence)
- **Social Media Integration**: Twitter/Telegram verification
- **Advanced Creator Scoring**: Historical success rate analysis
- **Performance Optimization**: Target 1000+ tokens/min throughput
- **Memory Optimization**: <1.5GB usage with garbage collection
- **API Health Monitoring**: Failover and rate limiting optimization

## 🔒 Educational Safety Reminder

**This high-performance educational system demonstrates professional-grade token sniping with creator intelligence while maintaining absolute safety:**

- **TRIPLE-LOCKED DRY_RUN**: Cannot be disabled or bypassed
- **CREATOR INTELLIGENCE**: Educational pattern analysis only - no real targeting
- **VIRTUAL TRADING**: Simulated SOL balance with zero real fund risk  
- **70% EDUCATIONAL FOCUS**: Learning-first approach with technical demonstration
- **PERFORMANCE BENCHMARKS**: >60% win rate, >25% ROI for educational excellence
- **RESPECTFUL API USAGE**: Rate limiting and ethical data source usage

**Remember**: This system uses REAL market data and creator intelligence for maximum educational value while maintaining strict simulation boundaries. All activities are educational demonstrations designed to teach advanced blockchain analysis and trading concepts.