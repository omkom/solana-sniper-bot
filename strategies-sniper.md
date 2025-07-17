# Stratégies de Trading - Sniper Bot

## Vue d'ensemble des stratégies

Le bot utilise une approche multi-stratégies pour maximiser le ROI tout en minimisant les risques.

## 1. Stratégie d'Entrée

### 1.1 Critères de sélection
```typescript
interface EntryStrategy {
  // Timing
  maxDetectionAge: 30_000;      // 30 secondes max
  
  // Score minimum
  minConfidenceScore: 70;        // Sur 100
  
  // Liquidité
  minLiquiditySol: 1;           // Minimum 1 SOL
  minLiquidityUSD: 100;         // Minimum 100 USD
  
  // Volume
  minTradingVolume: 0;          // Pas de minimum initial
  
  // Social signals (optionnel)
  socialBoost: {
    twitter: 10,                // +10 points si compte Twitter
    telegram: 10,               // +10 points si Telegram
    website: 5                  // +5 points si website
  };
}
```

### 1.2 Calcul du score
```typescript
function calculateEntryScore(token: TokenInfo): number {
  let score = 0;
  
  // Base score (sécurité)
  if (token.mintAuthorityDisabled) score += 30;
  if (token.freezeAuthorityDisabled) score += 20;
  if (token.metadataLocked) score += 10;
  
  // Liquidité
  const liqRatio = Math.min(token.liquiditySol / 10, 1);
  score += liqRatio * 20;
  
  // Timing (décroissance linéaire)
  const ageSeconds = (Date.now() - token.createdAt) / 1000;
  const timingScore = Math.max(0, 20 - (ageSeconds / 30) * 20);
  score += timingScore;
  
  // Social boost
  if (token.hasTwitter) score += 10;
  if (token.hasTelegram) score += 10;
  if (token.hasWebsite) score += 5;
  
  return Math.min(100, score);
}
```

### 1.3 Position sizing dynamique
```typescript
function calculatePositionSize(
  score: number,
  currentPositions: number,
  totalCapital: number
): number {
  const baseSize = 0.03; // 0.03 SOL de base
  
  // Ajustement selon le score
  let multiplier = 1;
  if (score >= 90) multiplier = 2;
  else if (score >= 80) multiplier = 1.5;
  else if (score >= 70) multiplier = 1;
  
  // Réduction si trop de positions
  if (currentPositions > 15) {
    multiplier *= 0.7;
  } else if (currentPositions > 20) {
    multiplier *= 0.5;
  }
  
  // Ne jamais dépasser 2% du capital total
  const maxSize = totalCapital * 0.02;
  
  return Math.min(baseSize * multiplier, maxSize);
}
```

## 2. Stratégie de Sortie

### 2.1 Vente par paliers
```typescript
const EXIT_STRATEGY = {
  tiers: [
    { roi: 50, percent: 25 },    // Vendre 25% à +50%
    { roi: 100, percent: 25 },   // Vendre 25% à +100%
    { roi: 200, percent: 25 },   // Vendre 25% à +200%
    // Garder 25% comme "moon bag"
  ],
  
  // Trailing stop pour le moon bag
  trailingStop: {
    activation: 300,             // S'active à +300%
    distance: 20                 // 20% en dessous du plus haut
  },
  
  // Sortie d'urgence
  panicSell: {
    roi: 1000,                   // Si +1000% ROI
    percent: 90                  // Vendre 90% immédiatement
  }
};
```

### 2.2 Logique de vente adaptative
```typescript
class AdaptiveExitStrategy {
  private highestRoi: Map<string, number> = new Map();
  
  shouldSell(position: Position): SellDecision {
    const currentRoi = this.calculateROI(position);
    const highest = this.highestRoi.get(position.mint) || currentRoi;
    
    // Update highest ROI
    if (currentRoi > highest) {
      this.highestRoi.set(position.mint, currentRoi);
    }
    
    // Check stop loss
    if (currentRoi <= -20) {
      return {
        action: 'SELL_ALL',
        reason: 'Stop loss triggered',
        urgency: 'HIGH'
      };
    }
    
    // Check panic sell
    if (currentRoi >= 1000) {
      return {
        action: 'SELL_PARTIAL',
        percent: 90,
        reason: 'Massive gain protection',
        urgency: 'MEDIUM'
      };
    }
    
    // Check trailing stop
    if (highest >= 300 && currentRoi < highest * 0.8) {
      return {
        action: 'SELL_ALL',
        reason: 'Trailing stop triggered',
        urgency: 'MEDIUM'
      };
    }
    
    // Check tier sells
    const unsolPercentage = this.getUnsoldPercentage(position);
    for (const tier of EXIT_STRATEGY.tiers) {
      if (currentRoi >= tier.roi && unsolPercentage > (100 - tier.percent)) {
        return {
          action: 'SELL_PARTIAL',
          percent: tier.percent,
          reason: `Tier ${tier.roi}% reached`,
          urgency: 'LOW'
        };
      }
    }
    
    return { action: 'HOLD' };
  }
}
```

### 2.3 Gestion du slippage
```typescript
function calculateSlippage(
  liquidity: number,
  sellAmount: number,
  urgency: 'LOW' | 'MEDIUM' | 'HIGH'
): number {
  // Base slippage selon la liquidité
  const impactRatio = sellAmount / liquidity;
  let baseSlippage = impactRatio * 100;
  
  // Ajustement selon l'urgence
  const urgencyMultiplier = {
    LOW: 1,
    MEDIUM: 1.5,
    HIGH: 2
  };
  
  baseSlippage *= urgencyMultiplier[urgency];
  
  // Limites
  const maxSlippage = {
    LOW: 5,
    MEDIUM: 10,
    HIGH: 20
  };
  
  return Math.min(baseSlippage, maxSlippage[urgency]);
}
```

## 3. Gestion du Risque

### 3.1 Limites globales
```typescript
const RISK_LIMITS = {
  // Position limits
  maxPositions: 25,
  maxPositionSize: 0.1,              // 0.1 SOL max par position
  maxPortfolioExposure: 0.5,         // 50% max du capital
  
  // Loss limits
  dailyLossLimit: -0.1,              // -10% par jour max
  weeklyLossLimit: -0.2,             // -20% par semaine max
  
  // Concentration limits
  maxTokenConcentration: 0.1,        // 10% max dans un token
  maxSectorConcentration: 0.3        // 30% max dans un secteur
};
```

### 3.2 Circuit breakers
```typescript
class RiskManager {
  private dailyPnL: number = 0;
  private weeklyPnL: number = 0;
  private tradingEnabled: boolean = true;
  
  checkTradingAllowed(): boolean {
    // Daily loss limit
    if (this.dailyPnL / this.startingCapital < RISK_LIMITS.dailyLossLimit) {
      console.error('Daily loss limit reached');
      this.tradingEnabled = false;
      return false;
    }
    
    // Weekly loss limit
    if (this.weeklyPnL / this.startingCapital < RISK_LIMITS.weeklyLossLimit) {
      console.error('Weekly loss limit reached');
      this.tradingEnabled = false;
      return false;
    }
    
    // Check system health
    if (!this.checkSystemHealth()) {
      this.tradingEnabled = false;
      return false;
    }
    
    return this.tradingEnabled;
  }
  
  private checkSystemHealth(): boolean {
    // RPC health
    if (this.rpcLatency > 1000) return false;
    
    // Memory usage
    const memUsage = process.memoryUsage();
    if (memUsage.heapUsed / memUsage.heapTotal > 0.9) return false;
    
    // Transaction success rate
    if (this.recentTxSuccessRate < 0.5) return false;
    
    return true;
  }
}
```

## 4. Optimisations Avancées

### 4.1 Détection de patterns
```typescript
class PatternDetector {
  // Détection de pump & dump
  detectPumpAndDump(priceHistory: PricePoint[]): boolean {
    if (priceHistory.length < 10) return false;
    
    const recentPrices = priceHistory.slice(-10);
    const priceChange = (recentPrices[9].price - recentPrices[0].price) / recentPrices[0].price;
    const volumeChange = (recentPrices[9].volume - recentPrices[0].volume) / recentPrices[0].volume;
    
    // Pump: prix +50% et volume +200% en 10 minutes
    if (priceChange > 0.5 && volumeChange > 2) {
      // Check for dump signals
      const lastThree = recentPrices.slice(-3);
      const recentTrend = (lastThree[2].price - lastThree[0].price) / lastThree[0].price;
      
      // Si baisse récente > 10%, probable dump
      return recentTrend < -0.1;
    }
    
    return false;
  }
  
  // Détection de manipulation
  detectManipulation(trades: Trade[]): ManipulationScore {
    const score = {
      washTrading: this.detectWashTrading(trades),
      spoofing: this.detectSpoofing(trades),
      layering: this.detectLayering(trades)
    };
    
    return score;
  }
}
```

### 4.2 Machine Learning (optionnel)
```typescript
class MLPredictor {
  // Features pour prédiction
  extractFeatures(token: TokenInfo): number[] {
    return [
      token.liquiditySol,
      token.holders,
      token.ageSeconds,
      token.volumeLast5Min,
      token.priceChangePercent,
      token.socialScore,
      // ... autres features
    ];
  }
  
  // Prédiction simple avec réseau de neurones
  async predictSuccess(token: TokenInfo): Promise<number> {
    const features = this.extractFeatures(token);
    
    // Normalisation
    const normalized = this.normalizeFeatures(features);
    
    // Prédiction (0-1)
    const prediction = await this.model.predict(normalized);
    
    return prediction;
  }
}
```

## 5. Stratégies Spéciales

### 5.1 Stratégie "First Mover"
Pour les tout premiers acheteurs (< 5 transactions) :
```typescript
const FIRST_MOVER_STRATEGY = {
  maxInvestment: 0.01,          // Investissement réduit
  quickExit: {
    roi: 30,                    // Sortie rapide à +30%
    percent: 50                 // Vendre 50%
  },
  timeout: 300_000              // 5 minutes max
};
```

### 5.2 Stratégie "Volume Surge"
Quand le volume explose soudainement :
```typescript
const VOLUME_SURGE_STRATEGY = {
  volumeMultiplier: 10,         // Volume x10 en 1 minute
  entryDelay: 5000,            // Attendre 5 secondes
  tightStop: -10,              // Stop loss serré à -10%
  quickProfit: 20              // Take profit rapide à +20%
};
```

### 5.3 Stratégie "Social Momentum"
Pour les tokens avec buzz social :
```typescript
const SOCIAL_MOMENTUM_STRATEGY = {
  minFollowers: 1000,
  minEngagement: 100,           // Likes, RT, etc.
  holdLonger: true,            // Garder plus longtemps
  moonBagSize: 40              // Garder 40% au lieu de 25%
};
```

## 6. Backtesting & Optimisation

### 6.1 Framework de backtesting
```typescript
class Backtester {
  async runBacktest(
    strategy: TradingStrategy,
    historicalData: HistoricalData,
    startDate: Date,
    endDate: Date
  ): Promise<BacktestResults> {
    const simulator = new TradingSimulator(strategy);
    
    // Replay historical events
    for (const event of historicalData.events) {
      if (event.timestamp >= startDate && event.timestamp <= endDate) {
        await simulator.processEvent(event);
      }
    }
    
    return simulator.getResults();
  }
}
```

### 6.2 Métriques de performance
```typescript
interface PerformanceMetrics {
  // Returns
  totalReturn: number;
  annualizedReturn: number;
  
  // Risk
  sharpeRatio: number;
  maxDrawdown: number;
  volatility: number;
  
  // Trading
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  
  // Execution
  avgSlippage: number;
  failedTrades: number;
}
```

## 7. Ajustements Market Conditions

### 7.1 Bull Market
```typescript
const BULL_MARKET_ADJUSTMENTS = {
  positionSize: 1.5,            // Augmenter taille des positions
  stopLoss: -25,               // Stop loss plus large
  moonBagSize: 35,             // Garder plus longtemps
  maxPositions: 30             // Plus de positions
};
```

### 7.2 Bear Market
```typescript
const BEAR_MARKET_ADJUSTMENTS = {
  positionSize: 0.5,            // Réduire taille
  stopLoss: -15,               // Stop loss serré
  quickProfit: true,           // Prendre profits rapidement
  maxPositions: 15             // Moins de positions
};
```