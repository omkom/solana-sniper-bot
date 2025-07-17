# Educational Token Analyzer

A comprehensive educational tool for understanding Solana token analysis and trading simulation. This system operates **exclusively in DRY RUN mode** for learning purposes.

## ⚠️ Important Notice

**This is an educational tool only. No real trading occurs.**
- All trades are simulated
- No real money is used
- Designed for learning blockchain analysis concepts
- Does not execute actual transactions

## 🎓 Features

### Token Detection & Monitoring
- Real-time monitoring of Solana token creation
- WebSocket connections to track new tokens
- Multiple data source integration (pump.fun, etc.)

### Security Analysis
- Comprehensive security checks for tokens
- Mint/freeze authority verification
- Liquidity pattern analysis
- Honeypot detection simulation

### Educational Simulation
- Simulated trading decisions based on analysis
- Portfolio tracking with virtual SOL
- Risk management demonstration
- Performance metrics calculation

### Interactive Dashboard
- Real-time web dashboard at `http://localhost:3000`
- Portfolio overview and statistics
- Active position monitoring
- Trade history visualization

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

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

### Usage

1. **Start the system**:
   ```bash
   npm run dev
   ```

2. **Open dashboard**: Navigate to `http://localhost:3000`

3. **Monitor activity**: Watch as the system detects and analyzes tokens

4. **Review results**: Observe simulated trading decisions and portfolio changes

## 📊 Dashboard Features

- **Portfolio Overview**: Simulated balance and ROI tracking
- **Active Positions**: Monitor open simulated positions
- **Trade History**: Review simulated buy/sell decisions
- **Security Analysis**: View token safety assessments
- **System Status**: Monitor analyzer health and activity

## 🔧 Configuration

Edit `.env` file to customize:

```env
# Analysis parameters
MIN_LIQUIDITY_SOL=1              # Minimum liquidity threshold
MIN_CONFIDENCE_SCORE=70          # Minimum security score
MAX_ANALYSIS_AGE_MS=30000        # Token age limit (30 seconds)

# Simulation parameters  
SIMULATED_INVESTMENT=0.03        # Simulated investment per token
MAX_SIMULATED_POSITIONS=25       # Maximum concurrent positions

# Dashboard
DASHBOARD_PORT=3000              # Web interface port
LOG_LEVEL=info                   # Logging verbosity
```

## 📁 Project Structure

```
src/
├── core/               # Core configuration and connections
├── detection/          # Token monitoring and detection
├── analysis/           # Security analysis and filtering
├── simulation/         # Dry-run trading simulation
├── monitoring/         # Dashboard and logging
└── types/             # TypeScript type definitions

public/                # Dashboard web interface
logs/                  # Application logs
```

## 🎯 Learning Objectives

This tool demonstrates:

1. **Blockchain Monitoring**: How to track on-chain activity
2. **Security Analysis**: Token safety evaluation techniques  
3. **Risk Management**: Position sizing and stop-loss concepts
4. **Performance Tracking**: Portfolio metrics and analysis
5. **System Architecture**: Event-driven trading system design

## 📚 Educational Use Cases

- **Cryptocurrency Education**: Understanding token analysis
- **Trading Strategy Learning**: Risk management concepts
- **Blockchain Development**: Solana ecosystem exploration
- **Portfolio Management**: Tracking and metrics
- **System Design**: Event-driven architecture patterns

## 🛡️ Safety Features

- **Hardcoded DRY_RUN Mode**: Cannot execute real trades
- **Simulation Only**: All activities are educational simulations
- **No Private Keys**: No wallet connections required
- **No Real Funds**: Uses virtual SOL for demonstrations
- **Educational Warnings**: Clear indicators throughout interface

## 🔍 Security Analysis Components

The system analyzes tokens for:

- **Mint Authority**: Whether minting is disabled
- **Freeze Authority**: Whether freezing is disabled  
- **Supply Analysis**: Token supply characteristics
- **Liquidity Patterns**: DEX liquidity evaluation
- **Honeypot Detection**: Suspicious contract patterns
- **Metadata Verification**: Token information validation

## 📈 Simulation Engine

The dry-run engine simulates:

- **Entry Decisions**: Based on security analysis scores
- **Position Sizing**: Dynamic investment amounts
- **Exit Strategies**: Stop-loss and take-profit rules
- **Portfolio Tracking**: Balance and P&L calculation
- **Risk Management**: Position limits and diversification

## 🎮 Demo Mode

The system includes a demo mode that:

- Generates simulated token detections
- Creates realistic analysis scenarios
- Demonstrates decision-making process
- Shows portfolio evolution over time

## 📝 Logs and Monitoring

The system generates detailed logs:

- `logs/analyzer.log`: General system activity
- `logs/analysis.log`: Token analysis results
- `logs/errors.log`: Error tracking

## 🤝 Contributing

This is an educational tool. Contributions should focus on:

- Improved educational content
- Better visualization features
- Enhanced analysis techniques
- Additional safety measures

## ⚖️ Legal Notice

This software is provided for educational purposes only. Users are responsible for compliance with applicable laws and regulations. The authors assume no responsibility for any use of this software.

## 📞 Support

For educational inquiries or technical issues, please refer to the documentation or create an issue in the project repository.

---

**Remember: This is a learning tool only. No real trading occurs!**