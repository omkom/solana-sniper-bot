import { EventEmitter } from 'events';
import { DexScreenerClient } from './dexscreener-client';
import { RealTokenInfo } from '../types/dexscreener';
import { TokenInfo } from '../types';
import { logger } from '../monitoring/logger';

export interface PumpSignal {
  token: RealTokenInfo;
  pumpStrength: number;
  signals: string[];
  timestamp: number;
}

export interface PumpDetectionConfig {
  minVolumeIncrease: number;        // Minimum volume increase % in 5m
  minPriceIncrease: number;         // Minimum price increase % in 5m
  minTransactionSpike: number;      // Minimum transaction count increase
  maxTokenAge: number;              // Maximum token age in hours
  minLiquidity: number;             // Minimum liquidity in USD
  scanInterval: number;             // Scan interval in milliseconds
}

export class PumpDetector extends EventEmitter {
  private dexClient: DexScreenerClient;
  private isRunning: boolean = false;
  private scanInterval: NodeJS.Timeout | null = null;
  private previousSnapshots: Map<string, RealTokenInfo> = new Map();
  private config: PumpDetectionConfig;
  private lastScanTime: number = 0;

  constructor() {
    super();
    this.dexClient = new DexScreenerClient();
    this.config = {
      minVolumeIncrease: 200,      // 200% volume increase in 5m (more realistic)
      minPriceIncrease: 30,        // 30% price increase in 5m (more realistic)
      minTransactionSpike: 5,      // 5x transaction increase (more realistic)
      maxTokenAge: 0.5,            // Max 30 minutes old (0.5 hours)
      minLiquidity: 2000,          // Min $2000 liquidity for real tokens
      scanInterval: 10000          // Scan every 10 seconds (less aggressive)
    };
    
    console.log('🔍 Pump Detector initialized');
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Pump detector already running');
      return;
    }

    console.log('🚀 Starting pump detection system...');
    this.isRunning = true;
    this.lastScanTime = Date.now();

    // Start continuous scanning
    this.scanInterval = setInterval(() => {
      this.scanForPumps().catch(error => {
        logger.error('Error in pump scanning', { error });
      });
    }, this.config.scanInterval);

    // Initial scan
    await this.scanForPumps();
    
    console.log('✅ Pump detection system started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping pump detection system...');
    this.isRunning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    console.log('✅ Pump detection system stopped');
  }

  private async scanForPumps(): Promise<void> {
    try {
      const now = Date.now();
      const scanTime = now - this.lastScanTime;
      
      logger.verbose('Scanning for token pumps', { 
        scanInterval: scanTime,
        previousSnapshots: this.previousSnapshots.size
      });

      // Get both trending tokens and boosted tokens for comprehensive pump detection
      const [trendingTokens, boostedTokens] = await Promise.all([
        this.dexClient.getTrendingTokens({
          minLiquidity: this.config.minLiquidity,
          maxAge: this.config.maxTokenAge,
          minVolume: 100,
          rankBy: 'trendingScoreM5',
          order: 'desc'
        }),
        this.dexClient.getBoostedTokens()
      ]);

      // Combine trending and boosted tokens
      const allTokens = [...trendingTokens, ...boostedTokens];
      const uniqueTokens = this.removeDuplicateTokens(allTokens);

      console.log(`🔍 Analyzing ${uniqueTokens.length} tokens (${trendingTokens.length} trending + ${boostedTokens.length} boosted) for pump signals...`);

      let detectedPumps = 0;
      
      for (const token of uniqueTokens) {
        const pumpSignal = this.analyzePumpSignals(token);
        
        if (pumpSignal) {
          detectedPumps++;
          await this.handlePumpDetection(pumpSignal);
        }

        // Store current snapshot for next comparison
        this.previousSnapshots.set(token.address, token);
      }

      // Clean old snapshots (older than 1 hour)
      const oneHourAgo = now - (60 * 60 * 1000);
      for (const [address, token] of this.previousSnapshots) {
        if (token.detectedAt && token.detectedAt < oneHourAgo) {
          this.previousSnapshots.delete(address);
        }
      }

      if (detectedPumps > 0) {
        console.log(`🚨 Detected ${detectedPumps} potential pumps`);
      }

      this.lastScanTime = now;

    } catch (error) {
      logger.error('Error scanning for pumps', { error });
    }
  }

  private analyzePumpSignals(token: RealTokenInfo): PumpSignal | null {
    const signals: string[] = [];
    let pumpStrength = 0;

    // Check if we have previous data for comparison
    const previousData = this.previousSnapshots.get(token.address);

    // Signal 1: High 5-minute price change
    if (token.priceChange5m > this.config.minPriceIncrease) {
      signals.push(`Price +${token.priceChange5m.toFixed(1)}% in 5m`);
      pumpStrength += Math.min(token.priceChange5m / 10, 10); // Max 10 points
    }

    // Signal 2: Volume spike
    if (token.volume5m > 0 && token.volume1h > 0) {
      const avgVolumePerMin = token.volume1h / 60;
      const volumeSpike = token.volume5m / (avgVolumePerMin * 5);
      
      if (volumeSpike > this.config.minVolumeIncrease / 100) {
        signals.push(`Volume spike ${volumeSpike.toFixed(1)}x in 5m`);
        pumpStrength += Math.min(volumeSpike * 2, 15); // Max 15 points
      }
    }

    // Signal 3: Transaction activity spike
    if (token.txns5m > 0 && token.txns1h > 0) {
      const avgTxnsPerMin = token.txns1h / 60;
      const txnSpike = token.txns5m / (avgTxnsPerMin * 5);
      
      if (txnSpike > this.config.minTransactionSpike) {
        signals.push(`Transaction spike ${txnSpike.toFixed(1)}x in 5m`);
        pumpStrength += Math.min(txnSpike, 10); // Max 10 points
      }
    }

    // Signal 4: Momentum acceleration (if we have previous data)
    if (previousData) {
      const priceAcceleration = token.priceChange5m - previousData.priceChange5m;
      if (priceAcceleration > 20) { // Price acceleration > 20%
        signals.push(`Price accelerating +${priceAcceleration.toFixed(1)}%`);
        pumpStrength += Math.min(priceAcceleration / 5, 8); // Max 8 points
      }
    }

    // Signal 5: Fresh token advantage
    if (token.pairCreatedAt) {
      const tokenAge = Date.now() - token.pairCreatedAt;
      const ageInHours = tokenAge / (60 * 60 * 1000);
      
      if (ageInHours < 1) { // Less than 1 hour old
        signals.push(`Fresh token (${Math.round(ageInHours * 60)}m old)`);
        pumpStrength += 5;
      } else if (ageInHours < 6) { // Less than 6 hours old
        signals.push(`Young token (${ageInHours.toFixed(1)}h old)`);
        pumpStrength += 2;
      }
    }

    // Signal 6: High trending score
    if (token.trendingScore && token.trendingScore > 80) {
      signals.push(`High trending score: ${token.trendingScore}`);
      pumpStrength += Math.min(token.trendingScore / 10, 10);
    }

    // Signal 7: Liquidity growth (if we have previous data)
    if (previousData && previousData.liquidityUsd > 0) {
      const liquidityGrowth = ((token.liquidityUsd - previousData.liquidityUsd) / previousData.liquidityUsd) * 100;
      if (liquidityGrowth > 50) { // 50% liquidity increase
        signals.push(`Liquidity growing +${liquidityGrowth.toFixed(1)}%`);
        pumpStrength += Math.min(liquidityGrowth / 10, 5);
      }
    }

    // Signal 8: Boosted token advantage
    // Note: In a real implementation, we would check if this token came from boosted endpoints
    // For now, we can assume tokens with very high volume relative to liquidity might be boosted
    if (token.volume24h > 0 && token.liquidityUsd > 0) {
      const volumeToLiquidityRatio = token.volume24h / token.liquidityUsd;
      if (volumeToLiquidityRatio > 10) { // High volume relative to liquidity
        signals.push(`High volume/liquidity ratio: ${volumeToLiquidityRatio.toFixed(1)}x`);
        pumpStrength += Math.min(volumeToLiquidityRatio / 2, 8); // Max 8 points
      }
    }

    // Only consider it a pump if we have multiple signals and sufficient strength
    if (signals.length >= 2 && pumpStrength >= 20) {
      return {
        token,
        pumpStrength,
        signals,
        timestamp: Date.now()
      };
    }

    return null;
  }

  private async handlePumpDetection(pumpSignal: PumpSignal): Promise<void> {
    const { token, pumpStrength, signals } = pumpSignal;
    
    console.log(`\n🚨 PUMP DETECTED: ${token.symbol || token.address.slice(0, 8)}`);
    console.log(`🔥 Pump Strength: ${pumpStrength.toFixed(1)}/100`);
    console.log(`💵 Current Price: $${token.priceUsd.toFixed(8)}`);
    console.log(`📈 5m Change: ${token.priceChange5m.toFixed(2)}%`);
    console.log(`💧 Liquidity: $${token.liquidityUsd.toLocaleString()}`);
    console.log(`🔍 Signals detected:`);
    
    signals.forEach((signal, index) => {
      console.log(`   ${index + 1}. ${signal}`);
    });

    // Convert to TokenInfo format for our existing system
    const tokenInfo: TokenInfo = {
      mint: token.address,
      symbol: token.symbol,
      name: token.name,
      decimals: 9, // Default for most Solana tokens
      supply: '1000000000', // Default supply
      signature: `pump_${Date.now()}`,
      timestamp: Date.now(),
      source: 'pump_detector',
      createdAt: token.pairCreatedAt || Date.now(),
      metadata: {
        pumpDetected: true,
        pumpStrength,
        signals,
        dexId: token.dexId
      },
      liquidity: {
        sol: token.liquidityUsd / 150, // Approximate SOL conversion
        usd: token.liquidityUsd
      }
    };

    // Log the pump detection
    logger.log('analysis', 'Pump detected', {
      mint: token.address,
      symbol: token.symbol,
      pumpStrength,
      signals: signals.length,
      priceChange5m: token.priceChange5m,
      volume5m: token.volume5m,
      liquidityUsd: token.liquidityUsd
    });

    // Emit the pump detection event
    this.emit('pumpDetected', tokenInfo, pumpSignal);
  }

  private removeDuplicateTokens(tokens: RealTokenInfo[]): RealTokenInfo[] {
    const uniqueTokens = new Map<string, RealTokenInfo>();
    
    for (const token of tokens) {
      const key = token.address;
      const existingToken = uniqueTokens.get(key);
      const currentScore = token.trendingScore || 0;
      const existingScore = existingToken?.trendingScore || 0;
      
      // Prefer tokens with higher trending scores, or newer detection times
      if (!existingToken || 
          currentScore > existingScore || 
          (currentScore === existingScore && (token.detectedAt || 0) > (existingToken.detectedAt || 0))) {
        uniqueTokens.set(key, token);
      }
    }
    
    return Array.from(uniqueTokens.values());
  }

  // Get current pump detection statistics
  getStats() {
    return {
      isRunning: this.isRunning,
      trackedTokens: this.previousSnapshots.size,
      config: this.config,
      lastScanTime: this.lastScanTime
    };
  }

  // Update pump detection configuration
  updateConfig(newConfig: Partial<PumpDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Pump detection config updated', newConfig);
  }
}