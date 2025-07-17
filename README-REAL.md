# Educational Token Analyzer with REAL Market Data

An advanced educational tool that uses **REAL market data** from DexScreener API to simulate token analysis and trading decisions. This system operates **exclusively in DRY RUN mode** for learning purposes while using actual price movements, liquidity data, and market trends.

## ⚠️ Important Notice

**This is an educational tool only. No real trading occurs.**
- All trades are simulated using REAL market data
- No real money is used or at risk
- Designed for learning blockchain analysis with actual market conditions
- Does not execute actual transactions

## 🎯 NEW: Real Market Data Features

### 📊 Live Market Integration
- **DexScreener API**: Real-time data from trending Solana tokens
- **Live Prices**: Actual token prices updated every 10 seconds
- **Real Liquidity**: Genuine liquidity pool data from DEXs
- **Market Trends**: Trending scores and volume analysis
- **Price Movements**: Real price history for accurate simulation

### 🔍 Enhanced Token Detection
- Monitors **pump.fun**, **Raydium**, and other Solana DEXs
- Filters by trending score (5-minute momentum)
- Real-time market data analysis
- Volume and liquidity-based filtering
- Market cap and transaction activity screening

### 💹 Realistic Simulation
- Entry decisions based on REAL market conditions
- Position sizing with actual liquidity constraints
- Exit strategies triggered by REAL price movements
- Portfolio tracking with live market data
- Risk management using actual volatility

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Internet connection (for DexScreener API)

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start with REAL market data
npm run dev:real
```

### Usage

1. **Start the real data system**:
   ```bash
   npm run dev:real
   ```

2. **Open dashboard**: Navigate to `http://localhost:3000`

3. **Watch live analysis**: Observe real token detection and analysis

4. **Monitor real trades**: See simulated decisions based on actual market data

## 📈 Real Data Sources

### DexScreener API Integration
- **Endpoint**: `https://api.dexscreener.com/latest/dex/pairs/solana`
- **Filters**: Trending tokens with minimum liquidity/volume
- **Update Frequency**: 30-second discovery, 10-second price updates
- **Data Quality**: Professional-grade market data

### Market Filters Applied
```typescript
{
  chainIds: ['solana'],
  dexIds: ['pumpfun', 'raydium'],
  minLiquidity: 5000,    // $5k minimum
  minVolume: 1000,       // $1k daily volume
  maxAge: 24,            // 24 hours max
  rankBy: 'trendingScoreM5'
}
```

## 🎓 Educational Enhancements

### Real Market Analysis
- **Security Scoring**: Enhanced with actual market data
- **Liquidity Analysis**: Real pool depths and trading volume
- **Price Momentum**: Actual 5m/1h/24h price changes
- **Market Cap Filtering**: Real market capitalization data
- **Transaction Activity**: Genuine buy/sell transaction counts

### Advanced Decision Making
```typescript
// Real market conditions considered:
- Liquidity > $5,000 USD
- Volume 24h > $1,000 USD  
- Price stability (< 50% change in 5m)
- Positive momentum (> -30% in 1h)
- Market cap > $10,000 USD
- Transaction activity (> 3 txns in 5m)
```

### Realistic Exit Strategies
- **Stop Loss**: -20% with real price tracking
- **Take Profit**: 50%+ with momentum analysis
- **Trailing Stops**: Based on actual price movements
- **Market Conditions**: Real volatility-based exits

## 📊 Dashboard Features (Enhanced)

- **Real Token Display**: Live prices and market data
- **Actual Price Charts**: Real-time price movement tracking
- **Market Information**: Liquidity, volume, market cap
- **Trading Activity**: Actual transaction counts
- **Trending Scores**: DexScreener momentum indicators
- **Portfolio Performance**: Simulated results with real data

## 🔧 Configuration

Enhanced `.env` settings:

```env
# Real Data Mode
MODE=DRY_RUN

# API Settings
DEXSCREENER_UPDATE_INTERVAL=30000    # 30 seconds
PRICE_UPDATE_INTERVAL=10000          # 10 seconds

# Market Filters
MIN_LIQUIDITY_USD=5000               # $5k minimum liquidity
MIN_VOLUME_24H=1000                  # $1k minimum daily volume
MAX_TOKEN_AGE_HOURS=24               # 24 hours maximum age
MIN_MARKET_CAP=10000                 # $10k minimum market cap

# Trading Simulation
SIMULATED_INVESTMENT=0.03            # 0.03 SOL per position
MAX_SIMULATED_POSITIONS=25           # Maximum concurrent positions
STOP_LOSS_PERCENT=-20                # -20% stop loss
TAKE_PROFIT_PERCENT=50               # 50% take profit
```

## 🏗️ Enhanced Architecture

```
src/
├── detection/
│   ├── dexscreener-client.ts      # DexScreener API integration
│   └── real-token-monitor.ts      # Live token monitoring
├── simulation/
│   └── real-price-engine.ts       # Real price simulation
├── types/
│   └── dexscreener.ts             # API response types
└── index-real.ts                   # Main application with real data
```

## 📚 Learning Objectives (Enhanced)

This tool now demonstrates:

1. **Real Market Integration**: How to connect to live market APIs
2. **Data Quality Management**: Filtering and validating market data
3. **Price Movement Analysis**: Understanding real market volatility  
4. **Liquidity Assessment**: Evaluating actual trading conditions
5. **Risk Management**: Managing positions with real market data
6. **Performance Tracking**: Measuring results against actual markets

## 🎯 Real vs Simulated Data

| Feature | Original Version | Enhanced Version |
|---------|------------------|------------------|
| Token Detection | Simulated events | Real DexScreener API |
| Prices | Random walk | Live market prices |
| Liquidity | Mock values | Actual pool data |
| Volume | Simulated | Real trading volume |
| Market Trends | Random | DexScreener trending |
| Price Updates | Time-based | Market-driven |

## 🛡️ Safety Features (Enhanced)

- **API Rate Limiting**: Respectful API usage with caching
- **Error Handling**: Graceful degradation on API failures
- **Data Validation**: Comprehensive market data verification
- **Simulation Boundaries**: Clear separation from real trading
- **Educational Warnings**: Enhanced safety indicators

## 📈 Market Data Examples

### Token Detection Log
```
🔍 New token detected: BONK ($0.00001234)
💰 Liquidity: $45,678
📈 24h Change: +156.7%
🔥 Trending Score: 89/100
📊 Volume 24h: $12,345
🎯 Source: dexscreener_pumpfun
```

### Real Price Updates
```
📊 Processing token with real data: PEPE
💵 Current Price: $0.00000892
📈 24h Change: +23.4%
💧 Liquidity: $67,890
🔒 Security Score: 78/100
✅ Simulated BUY: 0.0360 SOL at $0.00000892
```

## 🚀 Running Both Versions

```bash
# Original simulation (demo data)
npm run dev

# Enhanced with real market data  
npm run dev:real
```

## 📞 Support

This enhanced version provides a more realistic learning experience while maintaining complete safety through simulation-only operation. Perfect for understanding how real market analysis systems work!

---

**Remember: This uses REAL market data but NO real trading occurs!**