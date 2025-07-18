# 🎓 Educational Solana Token Analyzer

A comprehensive educational trading simulation system for understanding Solana token analysis, price tracking, and profit-maximizing strategies. This system operates **exclusively in DRY RUN mode** for learning purposes.

## ⚠️ Important Notice

**This is an educational tool only. No real trading occurs.**
- All trades are simulated with virtual SOL
- No real money is used or risked
- Designed for learning blockchain analysis and trading concepts
- Does not execute actual transactions on the blockchain
- All profits/losses are educational simulations

## 🚀 Enhanced Features

### 🔍 Advanced Token Detection & Monitoring
- **Multi-Source Detection**: Monitors pump.fun, Raydium, Orca, Meteora, Jupiter, and Serum
- **Real-time WebSocket Connections**: Instant token detection with sub-second latency
- **Age Filtering**: Focuses on tokens less than 1 hour old for maximum profit potential
- **Volume Analysis**: Tracks trading volume and liquidity patterns
- **Rapid Detection Engine**: Processes 500+ tokens per minute with parallel analysis

### 🛡️ Comprehensive Security Analysis
- **Security Scoring**: 100-point scoring system with color-coded indicators
- **Mint/Freeze Authority Verification**: Checks for disabled authorities
- **Liquidity Pattern Analysis**: Evaluates DEX liquidity distribution
- **Honeypot Detection**: Advanced pattern recognition for suspicious contracts
- **Metadata Verification**: Validates token information and social links
- **Risk Assessment**: Multi-factor risk scoring for educational purposes

### 💰 Advanced Trading Simulation
- **Smart Position Sizing**: Dynamic allocation based on security score, age, liquidity, and source
- **Maximum Profit Exit Strategy**: Sophisticated exit rules for different profit levels
- **Partial Selling**: Sells portions while letting profits run on pumping tokens
- **Pump Detection**: AI-powered detection of price momentum and trend analysis
- **Multi-Tier Profit Taking**: 
  - 500%+ gains: Sell 80%, let 20% ride
  - 200%+ gains: Sell 60%, let 40% ride  
  - 100%+ gains: Partial exits based on pump momentum
- **Extended Hold Times**: Up to 2 hours for maximum profit extraction

### 📊 Enhanced Dashboard & Monitoring
- **3-Column Responsive Layout**: Optimized for different screen sizes
- **Live KPI Tracking**: Real-time charts with Chart.js integration
- **Token Price Tracking**: Monitors all viable tokens with 30-second updates
- **Migration Monitoring**: Tracks token movement between DEXes
- **Detailed Token Tables**: Enhanced information including volume, liquidity, and DEX
- **Real-time Trade Feed**: Live updates of all simulated trades
- **Portfolio Analytics**: Advanced ROI tracking and performance metrics

## 🎯 Current System Capabilities

### Token Processing
- **Aggressive Detection**: Processes almost all tokens with minimal constraints
- **High Throughput**: Handles 500+ concurrent positions
- **Low Latency**: 5-second price updates and exit condition checks
- **Multi-DEX Support**: Monitors 6+ major Solana DEXes simultaneously

### Position Management
- **Smart Sizing**: Position sizes from 0.001 to 0.1 SOL based on multiple factors
- **Dynamic Exits**: Profit-maximizing exits based on momentum and time
- **Risk Management**: Stop-loss at -30% with time-based safety exits
- **Portfolio Limits**: Configurable maximum positions (currently 500)

### Performance Metrics
- **Win Rate Tracking**: Monitors successful vs failed trades
- **ROI Calculation**: Real-time portfolio return calculations
- **Liquidity Monitoring**: Tracks available liquidity across positions
- **Success Analytics**: Detailed performance breakdowns by token source

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- 8GB+ RAM (for handling high-volume token detection)

### Installation

```bash
# Clone or extract the project
cd solana-sniper-bot

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Build the project
npm run build

# Start the educational analyzer
npm run dev
```

### Available Commands

```bash
# Standard simulation mode
npm run dev

# Rapid detection mode (recommended)
npm run dev:rapid

# Real-time monitoring mode
npm run dev:real

# Production build
npm start

# Run tests
npm test

# Build TypeScript
npm run build
```

## 📊 Dashboard Features

### Main Dashboard (http://localhost:3000)
- **Portfolio Overview**: Real-time balance, ROI, and performance metrics
- **Active Positions**: Monitor up to 500 concurrent simulated positions
- **Trade History**: Complete history of all simulated transactions
- **Token Discovery**: Live feed of newly detected tokens
- **KPI Charts**: Real-time graphs of detection rates, success rates, and profits

### Enhanced Token Tables
- **Tracked Tokens**: Detailed view of all monitored tokens with live price updates
- **Found Tokens**: Recently discovered tokens with security scores
- **Volume & Liquidity**: Formatted display of trading metrics
- **DEX Information**: Clear labeling of token sources
- **Status Indicators**: Color-coded status for easy identification

## 🔧 Configuration

Edit `.env` file to customize behavior:

```env
# Core Settings
MODE=DRY_RUN                          # Always enforced for safety
RPC_PRIMARY=https://api.mainnet-beta.solana.com

# Detection Parameters
MIN_LIQUIDITY_SOL=0.5                 # Minimum liquidity threshold
MIN_CONFIDENCE_SCORE=5                # Minimum security score (very permissive)
MAX_ANALYSIS_AGE_MS=3600000           # 1 hour age limit

# Simulation Parameters  
SIMULATED_INVESTMENT=0.003            # Base investment per token
MAX_SIMULATED_POSITIONS=500           # Maximum concurrent positions
STARTING_BALANCE=10                   # Starting SOL balance

# Dashboard
DASHBOARD_PORT=3000                   # Web interface port
LOG_LEVEL=info                        # Logging verbosity
```

## 📁 Enhanced Project Structure

```
src/
├── core/                   # Core configuration and connections
│   ├── config.ts          # Environment and settings management
│   ├── connection.ts      # Solana RPC connection management
│   └── rapid-token-analyzer.ts  # High-performance token analyzer
├── detection/             # Token monitoring and detection
│   ├── multi-dex-monitor.ts     # Multi-DEX WebSocket monitoring
│   ├── raydium-monitor.ts       # Raydium-specific monitoring
│   ├── pump-detector.ts         # Pump detection algorithms
│   └── dexscreener-client.ts    # DexScreener API integration
├── analysis/              # Security analysis and filtering
│   └── security-analyzer.ts     # Comprehensive security checks
├── simulation/            # Advanced trading simulation
│   └── dry-run-engine.ts        # Enhanced simulation with profit maximization
├── monitoring/            # Dashboard and tracking
│   ├── dashboard.ts             # Web dashboard server
│   ├── token-price-tracker.ts   # Real-time price tracking
│   ├── migration-monitor.ts     # DEX migration tracking
│   └── kpi-tracker.ts          # Performance metrics tracking
└── types/                # TypeScript definitions

public/                   # Enhanced dashboard interface
logs/                    # Application logs with rotation
```

## 🎯 Learning Objectives

This enhanced system demonstrates:

1. **Advanced Token Detection**: Multi-source monitoring and rapid processing
2. **Profit Maximization**: Sophisticated exit strategies and position management
3. **Risk Management**: Dynamic position sizing and stop-loss implementation
4. **Performance Analytics**: Real-time KPI tracking and portfolio analysis
5. **System Scalability**: High-throughput token processing architecture
6. **Market Dynamics**: Understanding of DEX liquidity and price movements

## 📚 Educational Applications

### Trading Strategy Education
- **Entry Strategies**: Security-based filtering and timing
- **Position Sizing**: Risk-adjusted allocation algorithms
- **Exit Optimization**: Profit-maximizing exit strategies
- **Portfolio Management**: Multi-position tracking and management

### Technical Analysis
- **Price Movement Simulation**: Realistic price action modeling
- **Trend Detection**: Pump identification and momentum analysis
- **Volume Analysis**: Liquidity pattern recognition
- **Risk Assessment**: Multi-factor security scoring

### System Architecture
- **Event-Driven Design**: Real-time data processing patterns
- **Microservices**: Modular component architecture
- **Performance Optimization**: High-throughput data handling
- **Monitoring & Observability**: Real-time system health tracking

## 🛡️ Advanced Safety Features

- **Hardcoded DRY_RUN Mode**: Cannot be disabled - all trading is simulated
- **Virtual Portfolio**: No real funds ever at risk
- **Educational Warnings**: Clear indicators throughout all interfaces
- **Simulation Boundaries**: Artificial constraints prevent real-world application
- **Log Transparency**: Complete audit trail of all simulated activities

## 🔍 Enhanced Security Analysis

The system evaluates tokens across multiple dimensions:

### Technical Security
- **Mint Authority Status**: Permanently disabled verification
- **Freeze Authority Status**: Permanently disabled verification
- **Supply Mechanisms**: Fixed vs inflationary supply analysis
- **Contract Verification**: Bytecode analysis for standard patterns

### Market Security
- **Liquidity Distribution**: DEX liquidity spread analysis
- **Volume Patterns**: Organic vs artificial volume detection
- **Price Stability**: Volatility and manipulation indicators
- **Honeypot Detection**: Advanced pattern recognition

### Metadata Security
- **Token Information**: Name, symbol, and description validation
- **Social Links**: Website and social media verification
- **Image Assets**: Logo and branding authenticity checks

## 📈 Advanced Simulation Engine

### Entry Logic
- **Multi-Factor Scoring**: Security, age, liquidity, and source weighting
- **Dynamic Thresholds**: Adaptive entry criteria based on market conditions
- **Source Prioritization**: Higher allocation for pump.fun and high-quality sources
- **Urgency Classification**: HIGH/MEDIUM/LOW priority processing

### Position Management
- **Smart Sizing Algorithm**: 
  - Base size: 0.003 SOL
  - Age multiplier: 3x for <5min, 2x for <15min, 1.5x for <30min
  - Security multiplier: 2.5x for 95+, 2x for 90+, 1.5x for 80+
  - Liquidity multiplier: 2.5x for $100K+, 2x for $50K+, 1.5x for $25K+
  - Source multiplier: 1.8x for pump.fun, 1.5x for Raydium

### Exit Strategies
- **Profit Maximization**: Multi-tier partial exits based on performance
- **Momentum Detection**: AI-powered pump/dump identification
- **Time-based Management**: Progressive exit strategies over time
- **Stop-loss Protection**: -30% maximum loss threshold

## 🎮 Demo Mode Features

The system includes comprehensive demo functionality:

- **Realistic Token Generation**: Creates tokens with varying characteristics
- **Market Simulation**: Simulates realistic price movements and volumes
- **Success Scenarios**: Demonstrates profitable trading outcomes
- **Loss Scenarios**: Shows risk management in action
- **Educational Narratives**: Explains decision-making processes

## 📝 Comprehensive Logging

### Log Files
- `logs/analyzer.log`: General system activity and performance
- `logs/analysis.log`: Detailed token analysis results
- `logs/errors.log`: Error tracking and debugging information
- `logs/trades.log`: Complete trade history and outcomes

### Log Rotation
- Automatic cleanup of old logs
- Configurable retention periods
- Performance-optimized logging to prevent disk space issues

## 🚀 Performance Characteristics

### System Throughput
- **Token Processing**: 500+ tokens per minute
- **Position Monitoring**: 500 concurrent positions
- **Price Updates**: 30-second intervals for all tracked tokens
- **Exit Checking**: 5-second intervals for active positions

### Resource Usage
- **Memory**: ~2GB for full operation
- **CPU**: Optimized for multi-core processing
- **Network**: WebSocket connections to multiple DEXes
- **Storage**: Rotating logs with automatic cleanup

## 🤝 Contributing

This educational tool welcomes contributions in:

- **Enhanced Analysis Algorithms**: Better security detection methods
- **Improved Visualization**: Advanced dashboard features
- **Educational Content**: Better explanations and tutorials
- **Performance Optimization**: Faster processing and lower resource usage
- **Additional Safety Measures**: Enhanced simulation boundaries

## ⚖️ Legal Notice

This software is provided for educational purposes only. Users are responsible for compliance with applicable laws and regulations. The authors assume no responsibility for any use of this software. All trading simulations are educational and do not constitute financial advice.

## 📞 Support

For educational inquiries or technical issues:
- Review the comprehensive documentation
- Check the logs for detailed system information
- Examine the dashboard for real-time system status
- Create an issue in the project repository for technical support

---

**🎓 Educational Tool Only - No Real Trading Occurs!**

*This system is designed to teach blockchain analysis and trading concepts through realistic simulation. All activities are educational demonstrations using virtual assets.*