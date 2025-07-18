import { EventEmitter } from 'events';

export interface MigrationEvent {
  mint: string;
  symbol: string;
  fromDex: string;
  toDex: string;
  priceImpact: number;
  liquidityChange: number;
  timestamp: number;
  volume: number;
}

export interface MigrationStats {
  totalMigrations: number;
  successfulMigrations: number;
  avgPriceImpact: number;
  avgLiquidityChange: number;
  topMigrationPairs: { from: string; to: string; count: number }[];
}

export class MigrationMonitor extends EventEmitter {
  private migrationHistory: MigrationEvent[] = [];
  private maxHistorySize = 1000;

  constructor() {
    super();
    console.log('🔄 Migration Monitor initialized');
  }

  /**
   * Record a migration event
   */
  recordMigration(event: MigrationEvent): void {
    this.migrationHistory.push(event);
    
    // Limit history size
    if (this.migrationHistory.length > this.maxHistorySize) {
      this.migrationHistory = this.migrationHistory.slice(-this.maxHistorySize);
    }

    console.log(`🔄 Migration recorded: ${event.symbol} ${event.fromDex} → ${event.toDex} (${event.priceImpact.toFixed(2)}% impact)`);
    
    this.emit('migration', event);
  }

  /**
   * Get migration history
   */
  getMigrations(limit: number = 100): MigrationEvent[] {
    return this.migrationHistory.slice(-limit).reverse();
  }

  /**
   * Get migration statistics
   */
  getStats(): MigrationStats {
    const total = this.migrationHistory.length;
    
    if (total === 0) {
      return {
        totalMigrations: 0,
        successfulMigrations: 0,
        avgPriceImpact: 0,
        avgLiquidityChange: 0,
        topMigrationPairs: []
      };
    }

    const successful = this.migrationHistory.filter(m => m.priceImpact < 5).length;
    const avgPriceImpact = this.migrationHistory.reduce((sum, m) => sum + m.priceImpact, 0) / total;
    const avgLiquidityChange = this.migrationHistory.reduce((sum, m) => sum + m.liquidityChange, 0) / total;

    // Calculate top migration pairs
    const pairCounts = new Map<string, number>();
    this.migrationHistory.forEach(m => {
      const pair = `${m.fromDex}-${m.toDex}`;
      pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
    });

    const topPairs = Array.from(pairCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pair, count]) => {
        const [from, to] = pair.split('-');
        return { from, to, count };
      });

    return {
      totalMigrations: total,
      successfulMigrations: successful,
      avgPriceImpact,
      avgLiquidityChange,
      topMigrationPairs: topPairs
    };
  }
}