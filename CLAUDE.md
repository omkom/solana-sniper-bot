# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with this hyper-efficient token sniping tool.

## Important Security Notice

This codebase is an **educational Solana token analysis and trading simulation system**. Claude Code will:
- Analyze existing code for educational purposes
- Explain how the simulation system works
- Help with security analysis and vulnerability detection
- Assist with performance optimization and feature enhancements
- **NOT modify the DRY_RUN mode** - all trading remains simulated
- **NOT create real trading functionality** - educational simulation only
- **NOT bypass safety constraints** - simulation boundaries must remain intact

## Core Objective

Build a hyper-efficient token sniping tool that detects tokens within seconds of launch, performs instant analysis, and executes profitable trades with intelligent exit strategies.

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

### 1. Ultra-Fast Token Detection
```typescript
interface DetectionConfig {
  sources: {
    blockchain: {
      rpcEndpoints: string[];      // Multiple for failover
      blockAnalysisDepth: 3;       // Analyze last 3 blocks
      mempoolScanning: true;       // Pre-launch detection
    };
    dexScreener: { enabled: true; websocket: true };
    jupiter: { enabled: true; polling: false };
    raydium: { directPoolMonitoring: true };
  };
  maxLatency: 50;                  // 50ms max detection time
  parallelProcessing: true;
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

### 3. Security Analysis (Information Only)
```typescript
interface SecurityInfo {
  score: number;              // 0-100
  flags: string[];           // Issues found
  details: {
    contractVerified: boolean;
    liquidityLocked: boolean;
    ownershipRenounced: boolean;
    honeypotRisk: number;
    rugPullIndicators: string[];
  };
  // NO FILTERING - pass all tokens with security info attached
  recommendation: 'PROCEED' | 'CAUTION' | 'HIGH_RISK';
}
```

### 4. Intelligent Simulation & Execution
```typescript
interface TradingStrategy {
  simulation: {
    enabledFor: 'TOKENS_UNDER_10_MINUTES';
    amount: 0.003;           // SOL
    parallelSimulations: 5;  // Test multiple scenarios
  };
  
  analysis: {
    timeWindow: 10800000;    // 3 hours in ms
    metricsTracked: ['volume', 'holders', 'priceAction', 'socialSignals'];
  };
  
  execution: {
    mode: 'AGGRESSIVE';      // Fast entry on positive signals
    slippage: 30;           // Accept high slippage for speed
    gasMultiplier: 1.5;     // Ensure transaction priority
  };
}
```

### 5. Advanced Exit Strategy
```typescript
interface ExitStrategy {
  targetROI: {
    primary: 100;            // 100% profit target
    trailing: true;          // Continue if momentum positive
  };
  
  bagManagement: {
    initialSell: 90;         // Sell 90% at target
    holdPercentage: 10;      // Keep 10% for moon potential
    microSells: true;        // Gradual exits on way up
  };
  
  rugPullProtection: {
    liquidityMonitoring: 'REAL_TIME';
    ownerActivityTracking: true;
    exitTriggers: [
      'LIQUIDITY_REMOVAL_DETECTED',
      'LARGE_HOLDER_DUMP',
      'SOCIAL_SENTIMENT_CRASH'
    ];
    maxExitTime: 100;        // 100ms emergency exit
  };
}
```

### 6. Frontend-Backend Integration
```typescript
// WebSocket Events
interface RealtimeEvents {
  'token:detected': UnifiedTokenInfo & { detectionLatency: number };
  'token:analyzed': TokenAnalysis & { securityInfo: SecurityInfo };
  'trade:simulated': SimulationResult;
  'trade:executed': ExecutionResult;
  'position:update': PositionUpdate & { roi: number; exitRecommendation: string };
  'alert:rugpull': { tokenAddress: string; action: 'EMERGENCY_EXIT' };
}

// REST API Endpoints
interface APIEndpoints {
  'GET /metrics/performance': { detection: number; execution: number; profit: number };
  'POST /simulation/run': { token: string; amount: number };
  'GET /positions/active': Position[];
  'POST /trade/execute': TradeRequest;
  'GET /analysis/historical': TokenAnalysis[];
}
```

### 7. Performance Optimizations
```typescript
const optimizations = {
  caching: {
    tokenMetadata: 3600000,   // 1 hour
    securityScores: 300000,   // 5 minutes
    priceData: 1000,          // 1 second
  },
  
  concurrency: {
    maxParallelDetections: 50,
    maxSimultaneousSimulations: 10,
    connectionPoolSize: 20,
  },
  
  dataStructures: {
    useIndexedDB: true,       // Client-side caching
    useRedis: true,           // Server-side caching
    compressionEnabled: true,  // Reduce network overhead
  }
};
```

### 8. Risk Management
```typescript
interface RiskManagement {
  maxPositions: 10;
  maxPositionSize: 0.01;      // 1% of portfolio
  dailyLossLimit: 0.1;        // 10% daily loss limit
  
  tokenFilters: {
    minLiquidity: 5000;       // $5000 USD
    maxSlippage: 50;          // 50% max acceptable
    minHolders: 10;           // Initial holder count
  };
  
  autoStopConditions: [
    'DAILY_LOSS_EXCEEDED',
    'UNUSUAL_NETWORK_ACTIVITY',
    'RPC_DEGRADATION'
  ];
}
```

## Implementation Guidelines

- **Connection Management**: Implement round-robin RPC rotation with health checks
- **Event Streaming**: Use EventEmitter with backpressure handling
- **Error Recovery**: Automatic retry with exponential backoff
- **Monitoring**: Prometheus metrics for all critical operations
- **Testing**: 100% coverage for trading logic, integration tests for detection

## Code Quality Standards

- ESLint strict mode with no warnings
- Prettier formatting on pre-commit
- Jest tests with >90% coverage
- TypeDoc comments for all public APIs
- Performance benchmarks for critical paths

## Development Commands

```bash
# Install dependencies
npm install

# Start in simulation mode
npm run dev:simulation

# Rapid detection mode (RECOMMENDED)
npm run dev:rapid

# Real-time monitoring mode
npm run dev:real

# Run performance tests
npm run test:performance

# Build TypeScript to JavaScript
npm run build

# Production build
npm start

# Production with rapid detection
npm start:rapid

# Run tests
npm test

# Lint the codebase
npm run lint

# Deploy with monitoring
npm run deploy:production
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

## Enhanced Configuration

### Environment Variables (`.env`)
```env
# Core Settings - DO NOT MODIFY
MODE=DRY_RUN                          # Hardcoded for safety

# RPC Configuration
RPC_PRIMARY=https://api.mainnet-beta.solana.com
RPC_SECONDARY=https://api.mainnet-beta.solana.com

# Detection Parameters
MIN_LIQUIDITY_SOL=0.5                 # Minimum liquidity threshold
MIN_CONFIDENCE_SCORE=5                # Security threshold
MAX_ANALYSIS_AGE_MS=600000            # 10 minutes age limit for tokens

# Simulation Parameters
SIMULATED_INVESTMENT=0.003            # Base investment per token
MAX_SIMULATED_POSITIONS=10            # Maximum concurrent positions
STARTING_BALANCE=10                   # Starting SOL balance

# Dashboard Configuration
DASHBOARD_PORT=3000                   # Web interface port
LOG_LEVEL=info                        # Logging verbosity

# Performance Tuning
BATCH_SIZE=50                         # Token processing batch size
QUEUE_PROCESSING_INTERVAL=500         # Queue processing interval (ms)
PRICE_UPDATE_INTERVAL=30000           # Price update interval (ms)
```

## API Endpoints

```typescript
// Core simulation data
GET /api/portfolio          # Portfolio statistics
GET /api/positions          # Active positions
GET /api/trades            # Trade history
GET /api/system            # System information

// Enhanced tracking endpoints
GET /api/tracked-tokens     # All tracked tokens
GET /api/tracked-tokens/stats  # Tracking statistics
GET /api/tracked-tokens/:address/history  # Price history

// Migration monitoring
GET /api/migrations         # Migration history
GET /api/migrations/stats   # Migration statistics

// KPI tracking
GET /api/kpi/metrics        # All KPI metrics
GET /api/kpi/summary        # KPI summary
GET /api/kpi/:metric        # Specific metric data
```

## WebSocket Events

```typescript
// Real-time updates
'portfolio' -> Portfolio statistics
'positions' -> Active positions
'newTrade' -> New trade executed
'tokenAdded' -> Token added to tracking
'priceUpdate' -> Price update for tracked token
'kpiUpdate' -> KPI metric update
'migration' -> Token migration detected
```

## Educational Boundaries

### Safety Constraints
- **DRY_RUN Mode**: Cannot be disabled - hardcoded for safety
- **Virtual Assets**: No real funds ever at risk
- **Simulation Only**: All trades are educational demonstrations
- **Safety Warnings**: Clear indicators throughout all interfaces
- **Audit Trail**: Complete logging of all activities

### Technical Limits
- **Position Limits**: Maximum 10 concurrent positions (aggressive mode)
- **Age Filtering**: Only tokens < 10 minutes old processed
- **Security Threshold**: Minimum 5-point security score
- **Memory Management**: Automatic cleanup prevents resource exhaustion

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

**Remember**: This system is designed for educational purposes only. All trading is simulated and no real funds are ever at risk. The system maintains strict safety boundaries to ensure it remains a learning tool while demonstrating advanced token sniping techniques.