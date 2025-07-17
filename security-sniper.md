# Sécurité - Sniper Bot

## 1. Sécurité des Tokens

### 1.1 Vérifications obligatoires
```typescript
interface SecurityChecks {
  // Autorités
  mintAuthorityDisabled: boolean;      // CRITIQUE
  freezeAuthorityDisabled: boolean;    // CRITIQUE
  
  // Supply
  maxSupplyReached: boolean;           // Important
  noInflation: boolean;                // Important
  
  // Metadata
  metadataVerified: boolean;           // Moyen
  metadataImmutable: boolean;          // Moyen
  
  // Contract
  noMaliciousCode: boolean;            // CRITIQUE
  standardImplementation: boolean;     // Important
}
```

### 1.2 Détection de Honeypots
```typescript
class HoneypotDetector {
  async checkToken(mint: PublicKey): Promise<HoneypotResult> {
    const checks = {
      canBuy: false,
      canSell: false,
      hasHiddenFees: false,
      hasTransferRestrictions: false,
      hasSuspiciousCode: false
    };
    
    try {
      // Simulation d'achat
      const buySimulation = await this.simulateBuy(mint, 0.001);
      checks.canBuy = buySimulation.success;
      
      if (checks.canBuy) {
        // Simulation de vente immédiate
        const sellSimulation = await this.simulateSell(
          mint, 
          buySimulation.tokensReceived
        );
        checks.canSell = sellSimulation.success;
        
        // Vérifier les frais cachés
        const expectedReturn = buySimulation.solSpent * 0.98; // 2% slippage max
        const actualReturn = sellSimulation.solReceived;
        
        if (actualReturn < expectedReturn * 0.9) {
          checks.hasHiddenFees = true;
        }
      }
      
      // Analyse du code
      const codeAnalysis = await this.analyzeTokenCode(mint);
      checks.hasSuspiciousCode = codeAnalysis.suspicious;
      checks.hasTransferRestrictions = codeAnalysis.hasRestrictions;
      
    } catch (error) {
      console.error('Honeypot check failed:', error);
    }
    
    const isHoneypot = !checks.canSell || 
                      checks.hasHiddenFees || 
                      checks.hasTransferRestrictions ||
                      checks.hasSuspiciousCode;
    
    return {
      isHoneypot,
      checks,
      confidence: this.calculateConfidence(checks)
    };
  }
  
  private async analyzeTokenCode(mint: PublicKey): Promise<CodeAnalysis> {
    // Patterns suspects à détecter
    const suspiciousPatterns = [
      /onlyOwner.*transfer/i,           // Restrictions de transfer
      /blacklist/i,                     // Blacklist
      /pause/i,                         // Fonction pause
      /fee.*[3-9][0-9]|100/,           // Frais > 30%
      /maxTx/i,                         // Limites de transaction
      /cooldown/i,                      // Cooldown entre trades
      /bot.*protection/i                // Anti-bot agressif
    ];
    
    // Récupérer et analyser le code
    // ... implementation
    
    return {
      suspicious: false,
      hasRestrictions: false,
      warnings: []
    };
  }
}
```

### 1.3 Analyse de liquidité
```typescript
class LiquidityAnalyzer {
  async analyzeLiquidity(poolAddress: PublicKey): Promise<LiquidityAnalysis> {
    const poolInfo = await this.getPoolInfo(poolAddress);
    
    // Calculs de base
    const totalLiquidityUSD = poolInfo.baseReserve * poolInfo.basePrice + 
                             poolInfo.quoteReserve;
    
    const impactAnalysis = {
      buy1Sol: this.calculatePriceImpact(1, 'buy', poolInfo),
      sell1Sol: this.calculatePriceImpact(1, 'sell', poolInfo),
      buy5Sol: this.calculatePriceImpact(5, 'buy', poolInfo),
      sell5Sol: this.calculatePriceImpact(5, 'sell', poolInfo)
    };
    
    // Détection de manipulation
    const manipulation = {
      isArtificial: totalLiquidityUSD < 100,  // Trop peu de liquidité
      hasImbalance: Math.abs(poolInfo.baseReserve * poolInfo.basePrice - 
                            poolInfo.quoteReserve) / totalLiquidityUSD > 0.2,
      highSlippage: impactAnalysis.buy1Sol > 5 || impactAnalysis.sell1Sol > 5
    };
    
    return {
      totalLiquidityUSD,
      baseReserve: poolInfo.baseReserve,
      quoteReserve: poolInfo.quoteReserve,
      priceImpact: impactAnalysis,
      warnings: this.generateWarnings(manipulation),
      score: this.calculateLiquidityScore(totalLiquidityUSD, impactAnalysis)
    };
  }
  
  private calculatePriceImpact(
    amountSol: number,
    side: 'buy' | 'sell',
    poolInfo: PoolInfo
  ): number {
    // Formule AMM x * y = k
    const k = poolInfo.baseReserve * poolInfo.quoteReserve;
    
    if (side === 'buy') {
      const newQuoteReserve = poolInfo.quoteReserve + amountSol;
      const newBaseReserve = k / newQuoteReserve;
      const tokensOut = poolInfo.baseReserve - newBaseReserve;
      
      const oldPrice = poolInfo.quoteReserve / poolInfo.baseReserve;
      const newPrice = newQuoteReserve / newBaseReserve;
      
      return ((newPrice - oldPrice) / oldPrice) * 100;
    } else {
      // Calcul pour vente
      // ... similaire mais inversé
    }
  }
}
```

## 2. Sécurité du Bot

### 2.1 Gestion des clés privées
```typescript
class SecureKeyManager {
  private mainKey: Keypair;
  private tradingKeys: Map<string, Keypair> = new Map();
  
  constructor(encryptedKey: string) {
    // Ne jamais stocker en clair
    this.mainKey = this.decryptKey(encryptedKey);
    this.initializeTradingKeys();
  }
  
  private decryptKey(encrypted: string): Keypair {
    // Utiliser une clé de chiffrement environnement
    const decryptionKey = process.env.DECRYPTION_KEY;
    if (!decryptionKey) {
      throw new Error('DECRYPTION_KEY not set');
    }
    
    // Déchiffrement AES-256
    // ... implementation
    
    return Keypair.fromSecretKey(decryptedBytes);
  }
  
  // Rotation automatique des clés
  async rotateTradingKeys(): Promise<void> {
    const oldKeys = Array.from(this.tradingKeys.values());
    
    // Créer nouvelles clés
    this.initializeTradingKeys();
    
    // Transférer fonds des anciennes vers nouvelles
    for (const oldKey of oldKeys) {
      await this.drainWallet(oldKey);
    }
  }
  
  // Ne jamais exposer les clés
  getPublicKey(walletId: string): PublicKey {
    const wallet = this.tradingKeys.get(walletId);
    if (!wallet) throw new Error('Wallet not found');
    
    return wallet.publicKey;
  }
}
```

### 2.2 Protection contre le front-running
```typescript
class AntiMEV {
  // Utilisation de Jito pour bundles privés
  async sendProtectedTransaction(
    tx: Transaction,
    wallet: Keypair
  ): Promise<string> {
    if (this.jitoEnabled) {
      return await this.sendViaJito(tx, wallet);
    }
    
    // Fallback: obfuscation basique
    return await this.sendObfuscated(tx, wallet);
  }
  
  private async sendViaJito(
    tx: Transaction,
    wallet: Keypair
  ): Promise<string> {
    // Créer bundle Jito
    const bundle = new Bundle();
    
    // Ajouter transaction principale
    bundle.addTransaction(tx);
    
    // Ajouter tip pour le validateur
    const tipTx = this.createTipTransaction(wallet);
    bundle.addTransaction(tipTx);
    
    // Envoyer au block engine Jito
    const result = await this.jitoClient.sendBundle(bundle);
    
    return result.bundleId;
  }
  
  private async sendObfuscated(
    tx: Transaction,
    wallet: Keypair
  ): Promise<string> {
    // Techniques d'obfuscation
    
    // 1. Timing aléatoire (0-500ms)
    const delay = Math.random() * 500;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // 2. Transactions leurres
    if (Math.random() > 0.7) {
      await this.sendDecoyTransaction(wallet);
    }
    
    // 3. Envoi via multiple RPC
    const rpcs = this.getRPCEndpoints();
    const promises = rpcs.map(rpc => 
      this.sendToRPC(tx, rpc).catch(() => null)
    );
    
    const results = await Promise.race(promises);
    return results;
  }
}
```

### 2.3 Rate Limiting et DDoS Protection
```typescript
class RateLimiter {
  private limits = {
    rpcCalls: { max: 100, window: 60000 },      // 100/minute
    transactions: { max: 50, window: 60000 },    // 50/minute
    tokenChecks: { max: 200, window: 60000 }    // 200/minute
  };
  
  private counters = new Map<string, number[]>();
  
  async checkLimit(action: string): Promise<boolean> {
    const limit = this.limits[action];
    if (!limit) return true;
    
    const now = Date.now();
    const key = `${action}:${Math.floor(now / limit.window)}`;
    
    const count = (this.counters.get(key) || []).length;
    
    if (count >= limit.max) {
      throw new Error(`Rate limit exceeded for ${action}`);
    }
    
    // Ajouter timestamp
    const timestamps = this.counters.get(key) || [];
    timestamps.push(now);
    this.counters.set(key, timestamps);
    
    // Nettoyer anciennes entrées
    this.cleanup();
    
    return true;
  }
}
```

## 3. Monitoring de Sécurité

### 3.1 Détection d'anomalies
```typescript
class AnomalyDetector {
  private patterns = {
    normalTradingVolume: { min: 10, max: 100 },
    normalSuccessRate: { min: 0.7, max: 0.95 },
    normalLatency: { min: 50, max: 500 }
  };
  
  detectAnomalies(metrics: SystemMetrics): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    // Volume anormal
    if (metrics.tradingVolume < this.patterns.normalTradingVolume.min ||
        metrics.tradingVolume > this.patterns.normalTradingVolume.max) {
      anomalies.push({
        type: 'ABNORMAL_VOLUME',
        severity: 'MEDIUM',
        value: metrics.tradingVolume
      });
    }
    
    // Taux d'échec élevé
    if (metrics.successRate < this.patterns.normalSuccessRate.min) {
      anomalies.push({
        type: 'HIGH_FAILURE_RATE',
        severity: 'HIGH',
        value: metrics.successRate
      });
    }
    
    // Latence RPC élevée
    if (metrics.rpcLatency > this.patterns.normalLatency.max) {
      anomalies.push({
        type: 'HIGH_LATENCY',
        severity: 'MEDIUM',
        value: metrics.rpcLatency
      });
    }
    
    // Activité wallet suspecte
    if (this.detectSuspiciousWalletActivity(metrics.walletActivity)) {
      anomalies.push({
        type: 'SUSPICIOUS_WALLET_ACTIVITY',
        severity: 'CRITICAL',
        details: 'Potential compromise detected'
      });
    }
    
    return anomalies;
  }
}
```

### 3.2 Alertes de sécurité
```typescript
class SecurityAlerts {
  private channels = {
    email: process.env.ALERT_EMAIL,
    telegram: process.env.ALERT_TELEGRAM,
    webhook: process.env.ALERT_WEBHOOK
  };
  
  async sendAlert(alert: SecurityAlert): Promise<void> {
    const message = this.formatAlert(alert);
    
    // Priorité selon sévérité
    switch (alert.severity) {
      case 'CRITICAL':
        // Tous les canaux + arrêt du bot
        await Promise.all([
          this.sendEmail(message),
          this.sendTelegram(message),
          this.sendWebhook(message)
        ]);
        
        // Arrêt d'urgence
        if (alert.requiresShutdown) {
          await this.emergencyShutdown();
        }
        break;
        
      case 'HIGH':
        // Email + Telegram
        await Promise.all([
          this.sendEmail(message),
          this.sendTelegram(message)
        ]);
        break;
        
      case 'MEDIUM':
        // Telegram seulement
        await this.sendTelegram(message);
        break;
        
      case 'LOW':
        // Log seulement
        console.warn('Security alert:', message);
        break;
    }
  }
  
  private async emergencyShutdown(): Promise<void> {
    console.error('EMERGENCY SHUTDOWN INITIATED');
    
    // 1. Arrêter nouveaux trades
    global.TRADING_ENABLED = false;
    
    // 2. Fermer toutes positions
    await this.closeAllPositions();
    
    // 3. Transférer fonds vers cold wallet
    await this.drainToSafeWallet();
    
    // 4. Arrêt complet
    process.exit(1);
  }
}
```

## 4. Audit Trail

### 4.1 Logging sécurisé
```typescript
class SecureLogger {
  private encryptSensitive(data: any): any {
    const sensitiveFields = ['privateKey', 'secretKey', 'password', 'seed'];
    
    const cleaned = { ...data };
    
    for (const field of sensitiveFields) {
      if (cleaned[field]) {
        cleaned[field] = '[REDACTED]';
      }
    }
    
    // Hash des addresses wallet pour traçabilité
    if (cleaned.wallet) {
      cleaned.walletHash = this.hashWallet(cleaned.wallet);
      cleaned.wallet = cleaned.wallet.slice(0, 4) + '...' + cleaned.wallet.slice(-4);
    }
    
    return cleaned;
  }
  
  log(level: string, message: string, data?: any): void {
    const sanitized = data ? this.encryptSensitive(data) : undefined;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: sanitized,
      signature: this.signLogEntry({ level, message, data: sanitized })
    };
    
    // Écriture immutable
    this.writeToImmutableLog(logEntry);
  }
}
```

## 5. Best Practices

### 5.1 Checklist de sécurité quotidienne
- [ ] Vérifier les logs pour anomalies
- [ ] Contrôler les balances des wallets
- [ ] Valider les taux de succès des transactions
- [ ] Examiner les nouvelles positions
- [ ] Tester les systèmes d'alerte
- [ ] Mettre à jour les RPC endpoints si nécessaire
- [ ] Vérifier l'intégrité du code (hash)

### 5.2 Réponse aux incidents
1. **Détection** : Alertes automatiques
2. **Containment** : Arrêt des trades
3. **Investigation** : Analyse des logs
4. **Remediation** : Fix et patch
5. **Recovery** : Redémarrage sécurisé
6. **Lessons Learned** : Documentation

### 5.3 Hardening
```bash
# Permissions fichiers
chmod 600 .env
chmod 700 ./dist

# Firewall
ufw allow 22/tcp
ufw allow 3000/tcp  # Dashboard uniquement
ufw enable

# Fail2ban pour SSH
apt-get install fail2ban

# Monitoring système
apt-get install htop iotop nethogs
```