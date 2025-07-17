# Architecture Technique - Sniper Bot

## Vue d'ensemble de l'architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Detection     │────▶│   Filtering     │────▶│   Trading       │
│   Engine        │     │   Engine        │     │   Engine        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   WebSocket     │     │   Security      │     │   Wallet        │
│   Listeners     │     │   Checks        │     │   Manager       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │   Monitoring    │
                        │   & Logging     │
                        └─────────────────┘
```

## Composants principaux

### 1. Detection Engine
```typescript
interface DetectionEngine {
  // Connexions WebSocket multiples pour redondance
  connections: WebSocketConnection[];
  
  // Listeners pour différentes sources
  listeners: {
    pumpFun: PumpFunListener;
    raydium: RaydiumListener;
    onChain: OnChainListener;
  };
  
  // Queue de traitement
  processingQueue: TokenQueue;
}
```

**Responsabilités :**
- Monitoring temps réel des programmes (pump.fun, Raydium)
- Détection des nouvelles créations de tokens
- Parsing des métadonnées
- Envoi vers la queue de filtrage

### 2. Filtering Engine
```typescript
interface FilteringEngine {
  filters: {
    security: SecurityFilter;      // Honeypot, freeze, etc.
    liquidity: LiquidityFilter;    // Min liquidity
    metadata: MetadataFilter;      // Nom, symbole suspects
    contract: ContractFilter;      // Analyse du code
    social: SocialFilter;          // Signaux sociaux
  };
  
  scoreCalculator: ScoreCalculator;
}
```

**Critères de filtrage :**
- Autorités (mint/freeze) révoquées
- Liquidité minimale (> 1 SOL)
- Pas de fonctions suspectes
- Score de confiance > 70%

### 3. Trading Engine
```typescript
interface TradingEngine {
  mode: 'DRY_RUN' | 'LIVE';
  
  strategies: {
    entry: EntryStrategy;
    exit: ExitStrategy;
    risk: RiskManagement;
  };
  
  executor: TransactionExecutor;
  portfolio: PortfolioManager;
}
```

**Stratégies de trading :**
- Entry : Prix limite dynamique
- Exit : Paliers progressifs + trailing stop
- Risk : Position sizing, stop loss

### 4. Wallet Manager
```typescript
interface WalletManager {
  mainWallet: Keypair;
  tradingWallets: Keypair[];  // Multiple pour parallélisation
  
  balanceManager: BalanceManager;
  nonceManager: NonceAccountManager;
}
```

**Optimisations :**
- Wallets multiples pour éviter les congestions
- Nonce accounts pour transactions parallèles
- Gestion automatique des balances

### 5. Transaction Executor
```typescript
interface TransactionExecutor {
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';
  
  buildTransaction(params: TxParams): Transaction;
  sendWithRetry(tx: Transaction): Promise<string>;
  
  // Jito integration pour MEV protection
  jitoBundle?: JitoBundler;
}
```

**Features critiques :**
- Priority fees dynamiques
- Retry intelligent avec backoff
- Bundle Jito pour frontrun protection
- Simulation avant envoi

### 6. Monitoring System
```typescript
interface MonitoringSystem {
  logger: Logger;
  metrics: MetricsCollector;
  alerts: AlertManager;
  dashboard: DashboardServer;
}
```

**Métriques suivies :**
- Latence de détection
- Taux de succès des transactions
- ROI par trade et global
- Positions actives/P&L

## Stack technique

### Core
- **Node.js 18+** : Runtime
- **TypeScript** : Type safety
- **@solana/web3.js** : Interactions blockchain
- **@project-serum/anchor** : Smart contracts

### Performance
- **WebSocket** : Données temps réel
- **Redis** : Cache et queues
- **Worker Threads** : Processing parallèle

### Monitoring
- **Winston** : Logging structuré
- **Prometheus** : Métriques
- **Express** : API dashboard

### Sécurité
- **dotenv** : Variables d'environnement
- **@solana/spl-token** : Opérations SPL
- **bs58** : Encodage clés

## Configuration système

### RPC Endpoints
```typescript
const RPC_ENDPOINTS = {
  primary: process.env.RPC_PRIMARY,    // Helius/Triton
  fallback: process.env.RPC_FALLBACK,  // QuickNode
  public: 'https://api.mainnet-beta.solana.com'
};
```

### Paramètres critiques
```typescript
const CONFIG = {
  // Détection
  MAX_DETECTION_LAG_MS: 10000,
  WEBSOCKET_RECONNECT_DELAY: 1000,
  
  // Trading
  DEFAULT_INVESTMENT_SOL: 0.03,
  MAX_POSITIONS: 25,
  STOP_LOSS_PERCENT: -20,
  
  // Performance
  PRIORITY_FEE_PERCENTILE: 90,
  MAX_RETRY_ATTEMPTS: 3,
  
  // Sécurité
  MIN_LIQUIDITY_SOL: 1,
  MIN_CONFIDENCE_SCORE: 70
};
```

## Flux de données

1. **Détection** → Token détecté via WebSocket
2. **Queue** → Ajout à la processing queue
3. **Filtrage** → Validation multi-critères
4. **Scoring** → Calcul du score de confiance
5. **Décision** → Buy/Skip basé sur le score
6. **Exécution** → Transaction avec retry
7. **Monitoring** → Suivi de position
8. **Exit** → Vente selon stratégie

## Optimisations performances

### Latence minimale
- Connexions WebSocket persistantes
- RPC géographiquement proche
- Processing en mémoire

### Parallélisation
- Worker threads pour filtrage
- Transactions parallèles multi-wallet
- Batch processing des événements

### Caching
- Métadonnées tokens en Redis
- Prix récents en mémoire
- Nonce accounts pré-chargés