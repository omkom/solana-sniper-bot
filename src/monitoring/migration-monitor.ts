import { EventEmitter } from 'events';
import { DexScreenerClient } from '../detection/dexscreener-client';
import { TrackedToken } from './token-price-tracker';
import { logger } from '../monitoring/logger';

export interface MigrationEvent {
  tokenAddress: string;
  symbol: string;
  fromDex: string;
  toDex: string;
  timestamp: number;
  liquidityBefore: number;
  liquidityAfter: number;
  priceImpact: number;
}

export class MigrationMonitor extends EventEmitter {
  private dexScreenerClient: DexScreenerClient;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_INTERVAL = 60000; // 1 minute
  private migrationHistory: MigrationEvent[] = [];
  private readonly MAX_HISTORY = 1000;

  constructor() {
    super();
    this.dexScreenerClient = new DexScreenerClient();
    this.startMonitoring();
  }

  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.checkForMigrations();
    }, this.MONITORING_INTERVAL);

    logger.info('Migration monitoring started', {
      interval: this.MONITORING_INTERVAL
    });
  }

  async checkTokenMigration(token: TrackedToken): Promise<void> {
    try {
      const currentInfo = await this.dexScreenerClient.getTokenDetails(token.address);
      
      if (!currentInfo) {
        // Token disappeared from DexScreener
        this.emit('tokenLost', {
          tokenAddress: token.address,
          symbol: token.symbol,
          timestamp: Date.now()
        });
        return;
      }

      // Check if token has migrated to a different DEX
      const currentDex = currentInfo.dexId;
      const lastKnownDex = token.priceHistory.length > 0 ? 
        this.getLastKnownDex(token.address) : currentDex;

      if (currentDex !== lastKnownDex) {
        const migrationEvent: MigrationEvent = {
          tokenAddress: token.address,
          symbol: token.symbol,
          fromDex: lastKnownDex || 'unknown',
          toDex: currentDex,
          timestamp: Date.now(),
          liquidityBefore: token.liquidityUsd,
          liquidityAfter: currentInfo.liquidityUsd || 0,
          priceImpact: this.calculatePriceImpact(token.currentPrice, currentInfo.priceUsd)
        };

        this.recordMigration(migrationEvent);
        this.emit('migration', migrationEvent);
      }

      // Check for liquidity changes that might indicate migration
      const liquidityChange = currentInfo.liquidityUsd ? 
        ((currentInfo.liquidityUsd - token.liquidityUsd) / token.liquidityUsd) * 100 : 0;

      if (Math.abs(liquidityChange) > 50) {
        this.emit('liquidityShift', {
          tokenAddress: token.address,
          symbol: token.symbol,
          liquidityChange,
          oldLiquidity: token.liquidityUsd,
          newLiquidity: currentInfo.liquidityUsd || 0,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      logger.warn('Failed to check token migration', {
        address: token.address,
        symbol: token.symbol,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async checkForMigrations(): Promise<void> {
    // This will be called from the main tracking system
    // for each tracked token
  }

  private getLastKnownDex(tokenAddress: string): string | null {
    // This would typically be stored in the token's history
    // For now, return null to indicate unknown
    return null;
  }

  private calculatePriceImpact(oldPrice: number, newPrice: number): number {
    if (oldPrice === 0) return 0;
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  private recordMigration(migration: MigrationEvent): void {
    this.migrationHistory.push(migration);
    
    // Keep history under limit
    if (this.migrationHistory.length > this.MAX_HISTORY) {
      this.migrationHistory = this.migrationHistory.slice(-this.MAX_HISTORY);
    }

    logger.info('Token migration detected', {
      symbol: migration.symbol,
      fromDex: migration.fromDex,
      toDex: migration.toDex,
      priceImpact: migration.priceImpact.toFixed(2) + '%'
    });
  }

  getMigrationHistory(): MigrationEvent[] {
    return this.migrationHistory.slice().reverse(); // Latest first
  }

  getRecentMigrations(hours: number = 24): MigrationEvent[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.migrationHistory.filter(m => m.timestamp > cutoff);
  }

  getMigrationStats(): {
    total: number;
    last24h: number;
    popularDexes: { [dex: string]: number };
    avgPriceImpact: number;
  } {
    const recent = this.getRecentMigrations(24);
    const popularDexes: { [dex: string]: number } = {};
    
    this.migrationHistory.forEach(m => {
      popularDexes[m.toDex] = (popularDexes[m.toDex] || 0) + 1;
    });

    const avgPriceImpact = this.migrationHistory.length > 0 
      ? this.migrationHistory.reduce((sum, m) => sum + Math.abs(m.priceImpact), 0) / this.migrationHistory.length
      : 0;

    return {
      total: this.migrationHistory.length,
      last24h: recent.length,
      popularDexes,
      avgPriceImpact
    };
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    logger.info('Migration monitoring stopped');
  }
}