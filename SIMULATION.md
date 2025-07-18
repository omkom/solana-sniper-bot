# 🎮 Trading Simulation Documentation

This document explains the advanced trading simulation engine that powers the Educational Solana Token Analyzer.

## 🎯 Simulation Overview

The simulation engine is designed to provide realistic trading scenarios while maintaining educational boundaries. All trading activities are simulated with virtual assets to demonstrate advanced trading strategies and risk management techniques.

## 🏗️ Core Simulation Architecture

### Virtual Portfolio System
- **Starting Balance**: 10 SOL (virtual)
- **Portfolio Tracking**: Real-time balance, ROI, and performance metrics
- **Position Limits**: Maximum 500 concurrent positions
- **Risk Management**: Automatic position sizing and stop-loss protection
- **Performance Analytics**: Win rate, total trades, and success metrics

### Trading Engine Components
```typescript
interface VirtualPortfolio {
  startingBalance: 10 SOL;
  currentBalance: number;
  totalInvested: number;
  totalRealized: number;
  unrealizedPnL: number;
  totalROI: number;
  activePositions: number;
  winRate: number;
}
```

## 💰 Advanced Position Sizing

### Smart Allocation Algorithm
The system uses a sophisticated multi-factor approach to determine position sizes:

```typescript
function calculatePositionSize(token: TokenInfo, security: number, urgency: string): number {
  const baseSize = 0.003; // 0.003 SOL base investment
  
  // Age-based multiplier (newer = larger)
  const ageMultiplier = getAgeMultiplier(token.age);
  
  // Security score multiplier
  const securityMultiplier = getSecurityMultiplier(security);
  
  // Liquidity multiplier
  const liquidityMultiplier = getLiquidityMultiplier(token.liquidity);
  
  // Source multiplier (pump.fun gets priority)
  const sourceMultiplier = getSourceMultiplier(token.source);
  
  // Urgency multiplier
  const urgencyMultiplier = getUrgencyMultiplier(urgency);
  
  // Pump detection multiplier
  const pumpMultiplier = getPumpMultiplier(token.isPumping);
  
  return baseSize * ageMultiplier * securityMultiplier * 
         liquidityMultiplier * sourceMultiplier * 
         urgencyMultiplier * pumpMultiplier;
}
```

### Position Size Factors

#### Age Factor (Fresher = Larger)
- **< 5 minutes**: 3.0x multiplier
- **< 15 minutes**: 2.0x multiplier
- **< 30 minutes**: 1.5x multiplier
- **> 30 minutes**: 1.0x multiplier

#### Security Score Factor
- **95+ score**: 2.5x multiplier (excellent security)
- **90+ score**: 2.0x multiplier (very good security)
- **80+ score**: 1.5x multiplier (good security)
- **70+ score**: 1.2x multiplier (adequate security)
- **< 70 score**: 1.0x multiplier (minimal security)

#### Liquidity Factor
- **$100K+ liquidity**: 2.5x multiplier
- **$50K+ liquidity**: 2.0x multiplier
- **$25K+ liquidity**: 1.5x multiplier
- **$10K+ liquidity**: 1.2x multiplier
- **< $10K liquidity**: 1.0x multiplier

#### Source Factor
- **Pump.fun**: 1.8x multiplier (preferred source)
- **Raydium**: 1.5x multiplier (established DEX)
- **Other DEXes**: 1.0x multiplier (standard)

## 🚀 Maximum Profit Exit Strategies

### Multi-Tier Profit Taking
The system implements sophisticated exit strategies to maximize profits:

```typescript
function determineExitStrategy(position: Position): ExitDecision {
  const roi = position.roi;
  const holdTime = Date.now() - position.entryTime;
  const isPumping = detectPumpMomentum(position);
  
  if (roi >= 500%) {
    return {
      action: 'PARTIAL_SELL',
      percentage: 80,
      reason: 'Maximum profit strategy - 500%+ gains',
      keepPosition: true
    };
  }
  
  if (roi >= 200%) {
    return {
      action: 'PARTIAL_SELL',
      percentage: 60,
      reason: 'High profit strategy - 200%+ gains',
      keepPosition: true
    };
  }
  
  if (roi >= 100%) {
    if (isPumping) {
      return {
        action: 'PARTIAL_SELL',
        percentage: 40,
        reason: 'Partial profit taking - still pumping',
        keepPosition: true
      };
    } else {
      return {
        action: 'FULL_SELL',
        percentage: 100,
        reason: '100%+ gains but pump slowing',
        keepPosition: false
      };
    }
  }
  
  // Additional logic for smaller gains and losses...
}
```

### Exit Strategy Tiers

#### Tier 1: Massive Gains (500%+)
- **Action**: Sell 80% of position
- **Rationale**: Secure substantial profits while letting 20% ride
- **Risk**: Minimal (most profits already realized)
- **Potential**: 20% remains for additional upside

#### Tier 2: Large Gains (200-499%)
- **Action**: Sell 60% of position
- **Rationale**: Balance profit taking with upside potential
- **Risk**: Low (majority of profits secured)
- **Potential**: 40% remains for further gains

#### Tier 3: Good Gains (100-199%)
- **Action**: Sell 40% if pumping, 100% if slowing
- **Rationale**: Momentum-based decision making
- **Risk**: Moderate (depends on pump continuation)
- **Potential**: High if pump continues

#### Tier 4: Moderate Gains (50-99%)
- **Action**: Hold if pumping and <30min, exit otherwise
- **Rationale**: Time and momentum consideration
- **Risk**: Moderate to high
- **Potential**: Good if conditions are favorable

#### Tier 5: Small Gains (25-49%)
- **Action**: Hold if pumping and <15min, exit otherwise
- **Rationale**: Conservative approach with tight time limits
- **Risk**: High (small margins)
- **Potential**: Limited but possible

## 🔍 Pump Detection Algorithm

### Momentum Analysis
The system uses advanced algorithms to detect whether a token is still "pumping":

```typescript
function detectPumpMomentum(position: Position): boolean {
  const priceHistory = position.priceHistory;
  
  if (priceHistory.length < 5) return true; // Assume pumping if insufficient data
  
  // Analyze recent price movements
  const recentPrices = priceHistory.slice(-5);
  let increasingMoves = 0;
  
  for (let i = 1; i < recentPrices.length; i++) {
    if (recentPrices[i].price > recentPrices[i-1].price) {
      increasingMoves++;
    }
  }
  
  // Consider it pumping if 60%+ of recent moves were upward
  return increasingMoves >= 3;
}
```

### Pump Indicators
- **Price Momentum**: 60%+ of recent moves are upward
- **Volume Increase**: Trading volume is expanding
- **Liquidity Growth**: DEX liquidity is increasing
- **Time Factor**: Momentum is sustained over time
- **Pattern Recognition**: Matches historical pump signatures

## ⏱️ Time-Based Management

### Hold Time Strategies
The system implements sophisticated time-based position management:

#### Short-Term Holds (< 5 minutes)
- **Bias**: Aggressive holding for momentum
- **Exit Triggers**: Only major losses or extreme gains
- **Risk**: High volatility period
- **Reward**: Highest potential returns

#### Medium-Term Holds (5-30 minutes)
- **Bias**: Balanced approach
- **Exit Triggers**: Moderate gains or pump stalling
- **Risk**: Moderate volatility
- **Reward**: Good risk-adjusted returns

#### Long-Term Holds (30+ minutes)
- **Bias**: Conservative approach
- **Exit Triggers**: Small gains or time limits
- **Risk**: Lower volatility
- **Reward**: Steady, predictable returns

### Emergency Exits
- **60 minutes + ROI < 10%**: Time-based exit for stagnant positions
- **120 minutes**: Emergency exit regardless of performance
- **Stop-loss**: -30% maximum loss threshold
- **System limits**: Portfolio balance protection

## 📊 Performance Simulation

### Price Movement Modeling
The system simulates realistic price movements:

```typescript
function simulatePriceMovement(position: Position): number {
  const holdTime = Date.now() - position.entryTime;
  const holdTimeMinutes = holdTime / (60 * 1000);
  
  // Dynamic volatility based on hold time
  let volatility = 0.08; // 8% base volatility
  let bias = 0.003; // Initial upward bias
  
  // Adjust based on holding period
  if (holdTimeMinutes < 5) {
    volatility = 0.15; // High volatility during initial pump
    bias = 0.008; // Strong upward bias
  } else if (holdTimeMinutes < 15) {
    volatility = 0.12;
    bias = 0.005;
  } else if (holdTimeMinutes < 30) {
    volatility = 0.10;
    bias = 0.002;
  } else {
    volatility = 0.06;
    bias = -0.001; // Slight downward bias after 30 minutes
  }
  
  // Random events (10% chance each)
  const randomFactor = Math.random();
  if (randomFactor < 0.1) {
    // Big pump event
    bias += 0.05;
    volatility *= 1.5;
  } else if (randomFactor > 0.9) {
    // Dump event
    bias -= 0.03;
    volatility *= 1.3;
  }
  
  // Calculate price change
  const change = (Math.random() - 0.5) * volatility + bias;
  return Math.max(0.0001, position.currentPrice * (1 + change));
}
```

### Market Conditions
- **Bull Phase**: High upward bias, increased volatility
- **Bear Phase**: Downward bias, high volatility
- **Neutral Phase**: Minimal bias, standard volatility
- **Pump Events**: Extreme upward bias, very high volatility
- **Dump Events**: Extreme downward bias, very high volatility

## 🎯 Risk Management

### Position Limits
- **Maximum Positions**: 500 concurrent positions
- **Maximum Position Size**: 5% of portfolio or 0.1 SOL
- **Minimum Position Size**: 0.001 SOL
- **Portfolio Balance**: Always maintain minimum balance
- **Diversification**: Spread risk across multiple tokens

### Stop-Loss Protection
- **Hard Stop**: -30% maximum loss per position
- **Trailing Stop**: Dynamic adjustment based on performance
- **Time Stop**: Exit stagnant positions after 60 minutes
- **Emergency Stop**: Force exit after 120 minutes
- **Portfolio Stop**: Protect overall portfolio balance

### Risk Metrics
- **Value at Risk (VaR)**: Maximum potential loss
- **Sharpe Ratio**: Risk-adjusted return calculation
- **Maximum Drawdown**: Largest peak-to-trough loss
- **Win Rate**: Percentage of profitable trades
- **Average Hold Time**: Typical position duration

## 📈 Performance Analytics

### Key Performance Indicators (KPIs)
- **Total ROI**: Overall portfolio return
- **Win Rate**: Percentage of profitable trades
- **Average Trade ROI**: Mean return per trade
- **Profit Factor**: Ratio of gross profit to gross loss
- **Maximum Drawdown**: Largest portfolio decline

### Success Metrics
- **Tokens Detected**: Total tokens identified
- **Tokens Analyzed**: Tokens passing initial screening
- **Positions Opened**: Total simulated trades
- **Successful Trades**: Profitable position exits
- **Average Hold Time**: Mean position duration

## 🎮 Educational Scenarios

### Demo Mode Features
The system includes various educational scenarios:

#### Bull Market Scenario
- **Characteristics**: High success rate, large gains
- **Token Behavior**: Frequent pumps, sustained momentum
- **Exit Strategy**: Emphasis on profit maximization
- **Learning**: Optimal profit-taking strategies

#### Bear Market Scenario
- **Characteristics**: Lower success rate, quick exits
- **Token Behavior**: Brief pumps, quick reversals
- **Exit Strategy**: Conservative approach, fast exits
- **Learning**: Risk management importance

#### Volatile Market Scenario
- **Characteristics**: High volatility, mixed results
- **Token Behavior**: Extreme price swings
- **Exit Strategy**: Adaptive approach
- **Learning**: Flexibility in strategy execution

### Learning Objectives
- **Position Sizing**: Understanding risk-adjusted allocation
- **Exit Timing**: Optimal profit-taking strategies
- **Risk Management**: Loss limitation techniques
- **Market Adaptation**: Adjusting to different conditions
- **Performance Tracking**: Measuring success metrics

## 🔧 Configuration Options

### Simulation Parameters
```env
# Position Management
MAX_SIMULATED_POSITIONS=500
SIMULATED_INVESTMENT=0.003
STARTING_BALANCE=10

# Risk Management
STOP_LOSS_THRESHOLD=-30
MAX_HOLD_TIME=7200000  # 2 hours
EMERGENCY_EXIT_TIME=3600000  # 1 hour for stagnant positions

# Performance Tuning
PRICE_UPDATE_INTERVAL=5000  # 5 seconds
POSITION_MONITORING_INTERVAL=5000  # 5 seconds
```

### Advanced Settings
- **Volatility Factors**: Adjust price movement simulation
- **Bias Parameters**: Control upward/downward tendencies
- **Pump Detection**: Sensitivity for momentum detection
- **Time Decay**: How quickly momentum fades
- **Random Events**: Frequency of extreme price movements

## 🛡️ Safety & Boundaries

### Educational Constraints
- **No Real Trading**: All activities are simulated
- **Virtual Assets**: No real funds at risk
- **Hardcoded Limits**: Cannot be modified for real trading
- **Educational Warnings**: Clear simulation indicators
- **Audit Trail**: Complete logging for transparency

### Technical Safeguards
- **DRY_RUN Mode**: Cannot be disabled
- **Virtual Portfolio**: Simulated SOL only
- **Transaction Blocking**: No blockchain interactions
- **Rate Limiting**: Prevents excessive processing
- **Error Containment**: Fails safe in all scenarios

---

**🎓 Educational Purpose Only**: This simulation engine is designed to teach advanced trading concepts through realistic scenarios. All trading activities are educational demonstrations using virtual assets. No real funds are ever at risk.