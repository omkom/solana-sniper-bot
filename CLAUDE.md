# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with this enhanced educational token analyzer.

## Important Security Notice

This codebase is an **educational Solana token analysis and trading simulation system**. Claude Code will:
- Analyze existing code for educational purposes
- Explain how the simulation system works
- Help with security analysis and vulnerability detection
- Assist with performance optimization and feature enhancements
- **NOT modify the DRY_RUN mode** - all trading remains simulated
- **NOT create real trading functionality** - educational simulation only
- **NOT bypass safety constraints** - simulation boundaries must remain intact

## Current System State

The system has been enhanced with advanced trading simulation capabilities including:
- **Aggressive token detection** with minimal constraints (5+ security score)
- **Smart position sizing** based on multiple factors (age, liquidity, source, security)
- **Maximum profit exit strategies** with partial selling and momentum detection
- **Extended monitoring** up to 2 hours per position
- **High-throughput processing** supporting 500+ concurrent positions

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Standard simulation mode
npm run dev

# Rapid detection mode (RECOMMENDED for high-volume testing)
npm run dev:rapid

# Real-time monitoring mode
npm run dev:real

# Production build
npm start

# Production with rapid detection
npm start:rapid

# Run tests
npm test

# Lint the codebase
npm run lint
```

## Enhanced Architecture Overview

The system implements a sophisticated educational token analysis platform with:

### Core Systems
- **Enhanced Dry-Run Engine** (`src/simulation/dry-run-engine.ts`): 
  - Advanced profit-maximizing exit strategies
  - Smart position sizing algorithm
  - Multi-tier partial selling (500%+: 80% exit, 200%+: 60% exit, 100%+: 40% exit)
  - AI-powered pump detection and momentum analysis
  - Extended hold times (up to 2 hours) for maximum profit extraction

- **Token Price Tracker** (`src/monitoring/token-price-tracker.ts`):
  - Real-time price monitoring every 30 seconds
  - Maintains price history for trend analysis
  - Supports up to 100 tracked tokens with automatic cleanup
  - Detects significant price changes and emits alerts

- **Migration Monitor** (`src/monitoring/migration-monitor.ts`):
  - Tracks token movement between DEXes
  - Monitors liquidity shifts and price impacts
  - Maintains migration history for analysis
  - Provides migration statistics and trends

- **KPI Tracker** (`src/monitoring/kpi-tracker.ts`):
  - Real-time performance metrics collection
  - Tracks tokens detected, analyzed, and successful trades
  - Provides growth rates and summary statistics
  - Automatic data cleanup and optimization

- **Enhanced Dashboard** (`src/monitoring/dashboard.ts`):
  - 3-column responsive layout
  - Live KPI charts with Chart.js integration
  - Real-time WebSocket updates for all metrics
  - Comprehensive API endpoints for data access

### Enhanced Detection Systems
- **Multi-DEX Monitor** (`src/detection/multi-dex-monitor.ts`): Monitors Raydium, Orca, Meteora, Pump.fun, Jupiter, and Serum
- **Rapid Token Analyzer** (`src/core/rapid-token-analyzer.ts`): High-performance token processing with 500ms queue processing
- **Pump Detection** (`src/detection/pump-detector.ts`): AI-powered momentum detection algorithms
- **Security Analysis** (`src/analysis/security-analyzer.ts`): Comprehensive token safety evaluation

### Data Flow
1. **Multi-source detection**: Real-time monitoring of 6+ major DEXes
2. **Rapid processing**: 500+ tokens per minute with parallel analysis
3. **Enhanced security analysis**: 100-point scoring system with multiple checks
4. **Smart filtering**: Age-based filtering (tokens < 1 hour old)
5. **Intelligent position sizing**: Multi-factor allocation algorithm
6. **Advanced exit strategies**: Profit-maximizing partial exits
7. **Real-time tracking**: Live price updates and migration monitoring
8. **Performance analytics**: Comprehensive KPI tracking and reporting

## Enhanced Configuration

### Environment Variables (`.env`)
```env
# Core Settings - DO NOT MODIFY
MODE=DRY_RUN                          # Hardcoded for safety

# RPC Configuration
RPC_PRIMARY=https://api.mainnet-beta.solana.com
RPC_SECONDARY=https://api.mainnet-beta.solana.com

# Enhanced Detection Parameters
MIN_LIQUIDITY_SOL=0.5                 # Minimum liquidity threshold
MIN_CONFIDENCE_SCORE=5                # Very permissive security threshold
MAX_ANALYSIS_AGE_MS=3600000           # 1 hour age limit for tokens

# Advanced Simulation Parameters
SIMULATED_INVESTMENT=0.003            # Base investment per token
MAX_SIMULATED_POSITIONS=500           # Maximum concurrent positions
STARTING_BALANCE=10                   # Starting SOL balance

# Dashboard Configuration
DASHBOARD_PORT=3000                   # Web interface port
LOG_LEVEL=info                        # Logging verbosity

# Performance Tuning
BATCH_SIZE=50                         # Token processing batch size
QUEUE_PROCESSING_INTERVAL=500         # Queue processing interval (ms)
PRICE_UPDATE_INTERVAL=30000           # Price update interval (ms)
```

### TypeScript Configuration
- Target: ES2022
- Module: CommonJS
- Strict mode enabled
- Enhanced type checking
- Source maps for debugging
- Output directory: `dist/`

## Enhanced Simulation Engine

### Smart Position Sizing Algorithm
```typescript
// Base calculation factors:
baseSize = 0.003 SOL

// Age factor (newer = larger position)
ageFactor = {
  < 5min: 3.0x,
  < 15min: 2.0x,
  < 30min: 1.5x,
  default: 1.0x
}

// Security score factor
securityFactor = {
  95+: 2.5x,
  90+: 2.0x,
  80+: 1.5x,
  70+: 1.2x,
  default: 1.0x
}

// Liquidity factor
liquidityFactor = {
  $100K+: 2.5x,
  $50K+: 2.0x,
  $25K+: 1.5x,
  $10K+: 1.2x,
  default: 1.0x
}

// Source factor
sourceFactor = {
  pump.fun: 1.8x,
  raydium: 1.5x,
  default: 1.0x
}

// Final position size
finalSize = baseSize * ageFactor * securityFactor * liquidityFactor * sourceFactor * urgencyFactor * pumpFactor
```

### Advanced Exit Strategies
```typescript
// Profit maximization tiers
if (roi >= 500%) {
  sellPercentage = 80%;  // Let 20% ride
  reason = "Maximum profit strategy";
} else if (roi >= 200%) {
  sellPercentage = 60%;  // Let 40% ride
  reason = "High profit strategy";
} else if (roi >= 100%) {
  if (stillPumping) {
    sellPercentage = 40%;  // Let 60% ride
    reason = "Partial profit taking - still pumping";
  } else {
    sellPercentage = 100%;  // Full exit
    reason = "100%+ gains but pump slowing";
  }
} else if (roi >= 50%) {
  if (!stillPumping || holdTime > 30min) {
    sellPercentage = 100%;
    reason = "50%+ gains but pump stalling";
  }
}

// Stop-loss protection
if (roi <= -30%) {
  sellPercentage = 100%;
  reason = "Stop loss triggered";
}
```

### Performance Characteristics
- **Token Processing**: 500+ tokens per minute
- **Position Monitoring**: 500 concurrent positions
- **Price Updates**: 30-second intervals
- **Exit Checking**: 5-second intervals
- **Memory Usage**: ~2GB for full operation
- **Maximum Hold Time**: 2 hours per position

## Enhanced Dashboard Features

### API Endpoints
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

### WebSocket Events
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

## Enhanced Logging System

### Log Files
- `logs/analyzer.log`: System activity and performance metrics
- `logs/analysis.log`: Token analysis results and decisions
- `logs/errors.log`: Error tracking and debugging information
- `logs/trades.log`: Complete trade history and outcomes

### Log Rotation
- Automatic cleanup of old logs
- Configurable retention periods
- Performance-optimized to prevent disk space issues
- Structured logging for easy analysis

## Security Analysis Components

### Enhanced Security Checks
The system performs comprehensive analysis including:
- **Technical Security**: Mint/freeze authority verification, supply analysis
- **Market Security**: Liquidity distribution, volume patterns, price stability
- **Metadata Security**: Token information validation, social link verification
- **Pattern Recognition**: Honeypot detection, manipulation indicators
- **Risk Scoring**: 100-point multi-factor scoring system

### Security Scoring Algorithm
```typescript
// Base score factors
mintAuthorityDisabled: 25 points
freezeAuthorityDisabled: 25 points
adequateLiquidity: 20 points
validMetadata: 15 points
organicVolume: 10 points
socialVerification: 5 points

// Penalty factors
suspiciousPatterns: -30 points
lowLiquidity: -20 points
recentCreation: -10 points
```

## Performance Optimization

### High-Throughput Processing
- **Batch Processing**: Handles multiple tokens simultaneously
- **Parallel Analysis**: Multi-threaded security analysis
- **Queue Management**: Priority-based token processing
- **Memory Optimization**: Automatic cleanup of old data
- **Connection Pooling**: Efficient RPC connection management

### Resource Management
- **Token Limits**: Maximum 500 concurrent positions
- **Price History**: Limited to 100 data points per token
- **Log Rotation**: Automatic cleanup prevents disk space issues
- **Memory Monitoring**: Garbage collection optimization

## Educational Features

### Demo Mode
- **Realistic Scenarios**: Generates tokens with varying characteristics
- **Market Simulation**: Simulates realistic price movements
- **Success/Failure Cases**: Shows both profitable and loss scenarios
- **Decision Explanations**: Detailed reasoning for all actions

### Learning Objectives
- **Advanced Trading Strategies**: Profit maximization techniques
- **Risk Management**: Dynamic position sizing and stop-loss
- **Market Analysis**: Multi-factor token evaluation
- **System Architecture**: High-performance trading system design
- **Performance Analytics**: KPI tracking and optimization

## Development Guidelines

### Code Structure
- **Modular Design**: Separate concerns for detection, analysis, simulation
- **Type Safety**: Comprehensive TypeScript typing
- **Event-Driven**: Reactive architecture with EventEmitter
- **Error Handling**: Comprehensive error handling and logging
- **Performance**: Optimized for high-throughput processing

### Testing Approach
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Load testing with high token volumes
- **Simulation Tests**: Verify trading logic accuracy

## Important Constraints

### Educational Boundaries
- **DRY_RUN Mode**: Cannot be disabled - hardcoded for safety
- **Virtual Assets**: No real funds ever at risk
- **Simulation Only**: All trades are educational demonstrations
- **Safety Warnings**: Clear indicators throughout all interfaces
- **Audit Trail**: Complete logging of all activities

### Technical Limits
- **Position Limits**: Maximum 500 concurrent positions
- **Age Filtering**: Only tokens < 1 hour old processed
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

## Future Enhancements

### Planned Features
- **Machine Learning**: Advanced pump detection algorithms
- **Social Analysis**: Twitter/Discord sentiment analysis
- **Advanced Analytics**: Predictive modeling for token success
- **Portfolio Optimization**: Dynamic allocation strategies
- **Enhanced UI**: More sophisticated dashboard features

### Performance Improvements
- **Caching**: Redis integration for faster data access
- **Clustering**: Multi-process architecture for higher throughput
- **Optimization**: Further algorithm improvements
- **Monitoring**: Enhanced system health monitoring

---

**Remember**: This system is designed for educational purposes only. All trading is simulated and no real funds are ever at risk. The system maintains strict safety boundaries to ensure it remains a learning tool.