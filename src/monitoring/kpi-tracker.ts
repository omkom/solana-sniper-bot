import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';

export interface KPIDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

export interface KPIMetrics {
  tokensDetected: KPIDataPoint[];
  tokensAnalyzed: KPIDataPoint[];
  tokensTracked: KPIDataPoint[];
  successfulTrades: KPIDataPoint[];
  totalROI: KPIDataPoint[];
  portfolioValue: KPIDataPoint[];
  activePositions: KPIDataPoint[];
  winRate: KPIDataPoint[];
  avgPriceChange: KPIDataPoint[];
  liquidityTrend: KPIDataPoint[];
}

export class KPITracker extends EventEmitter {
  private metrics: KPIMetrics;
  private readonly MAX_DATA_POINTS = 100;
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.metrics = {
      tokensDetected: [],
      tokensAnalyzed: [],
      tokensTracked: [],
      successfulTrades: [],
      totalROI: [],
      portfolioValue: [],
      activePositions: [],
      winRate: [],
      avgPriceChange: [],
      liquidityTrend: []
    };

    this.startCleanup();
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldData();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanupOldData(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    Object.keys(this.metrics).forEach(key => {
      const metric = this.metrics[key as keyof KPIMetrics];
      const filtered = metric.filter(point => point.timestamp > cutoff);
      
      // Keep only recent data and limit to MAX_DATA_POINTS
      this.metrics[key as keyof KPIMetrics] = filtered.slice(-this.MAX_DATA_POINTS);
    });
  }

  addDataPoint(metricName: keyof KPIMetrics, value: number, label?: string): void {
    const dataPoint: KPIDataPoint = {
      timestamp: Date.now(),
      value,
      label
    };

    this.metrics[metricName].push(dataPoint);
    
    // Keep only the latest data points
    if (this.metrics[metricName].length > this.MAX_DATA_POINTS) {
      this.metrics[metricName] = this.metrics[metricName].slice(-this.MAX_DATA_POINTS);
    }

    // Emit update event
    this.emit('kpiUpdate', {
      metric: metricName,
      value,
      timestamp: dataPoint.timestamp
    });
  }

  // Convenience methods for common KPIs
  recordTokenDetected(): void {
    const current = this.getCurrentCount('tokensDetected');
    this.addDataPoint('tokensDetected', current + 1);
  }

  recordTokenAnalyzed(): void {
    const current = this.getCurrentCount('tokensAnalyzed');
    this.addDataPoint('tokensAnalyzed', current + 1);
  }

  recordTokenTracked(): void {
    const current = this.getCurrentCount('tokensTracked');
    this.addDataPoint('tokensTracked', current + 1);
  }

  updatePortfolioValue(value: number): void {
    this.addDataPoint('portfolioValue', value);
  }

  updateTotalROI(roi: number): void {
    this.addDataPoint('totalROI', roi);
  }

  updateActivePositions(count: number): void {
    this.addDataPoint('activePositions', count);
  }

  updateWinRate(rate: number): void {
    this.addDataPoint('winRate', rate);
  }

  updateAvgPriceChange(change: number): void {
    this.addDataPoint('avgPriceChange', change);
  }

  updateLiquidityTrend(liquidity: number): void {
    this.addDataPoint('liquidityTrend', liquidity);
  }

  recordSuccessfulTrade(): void {
    const current = this.getCurrentCount('successfulTrades');
    this.addDataPoint('successfulTrades', current + 1);
  }

  private getCurrentCount(metricName: keyof KPIMetrics): number {
    const data = this.metrics[metricName];
    return data.length > 0 ? data[data.length - 1].value : 0;
  }

  getMetrics(): KPIMetrics {
    return { ...this.metrics };
  }

  getMetric(metricName: keyof KPIMetrics): KPIDataPoint[] {
    return [...this.metrics[metricName]];
  }

  getLatestValue(metricName: keyof KPIMetrics): number {
    const data = this.metrics[metricName];
    return data.length > 0 ? data[data.length - 1].value : 0;
  }

  getTimeRange(metricName: keyof KPIMetrics, minutes: number): KPIDataPoint[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.metrics[metricName].filter(point => point.timestamp > cutoff);
  }

  getGrowthRate(metricName: keyof KPIMetrics, minutes: number = 60): number {
    const data = this.getTimeRange(metricName, minutes);
    
    if (data.length < 2) return 0;
    
    const oldest = data[0].value;
    const newest = data[data.length - 1].value;
    
    if (oldest === 0) return 0;
    
    return ((newest - oldest) / oldest) * 100;
  }

  getAverage(metricName: keyof KPIMetrics, minutes: number = 60): number {
    const data = this.getTimeRange(metricName, minutes);
    
    if (data.length === 0) return 0;
    
    const sum = data.reduce((acc, point) => acc + point.value, 0);
    return sum / data.length;
  }

  getSummaryStats(): {
    tokensDetectedTotal: number;
    tokensAnalyzedTotal: number;
    tokensTrackedTotal: number;
    successfulTradesTotal: number;
    currentROI: number;
    currentPortfolioValue: number;
    currentActivePositions: number;
    currentWinRate: number;
    detectionRate: number; // tokens per hour
    analysisRate: number; // tokens per hour
  } {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const recentDetections = this.metrics.tokensDetected.filter(p => p.timestamp > oneHourAgo);
    const recentAnalyses = this.metrics.tokensAnalyzed.filter(p => p.timestamp > oneHourAgo);
    
    return {
      tokensDetectedTotal: this.getLatestValue('tokensDetected'),
      tokensAnalyzedTotal: this.getLatestValue('tokensAnalyzed'),
      tokensTrackedTotal: this.getLatestValue('tokensTracked'),
      successfulTradesTotal: this.getLatestValue('successfulTrades'),
      currentROI: this.getLatestValue('totalROI'),
      currentPortfolioValue: this.getLatestValue('portfolioValue'),
      currentActivePositions: this.getLatestValue('activePositions'),
      currentWinRate: this.getLatestValue('winRate'),
      detectionRate: recentDetections.length,
      analysisRate: recentAnalyses.length
    };
  }

  reset(): void {
    this.metrics = {
      tokensDetected: [],
      tokensAnalyzed: [],
      tokensTracked: [],
      successfulTrades: [],
      totalROI: [],
      portfolioValue: [],
      activePositions: [],
      winRate: [],
      avgPriceChange: [],
      liquidityTrend: []
    };
    
    this.emit('reset');
    logger.info('KPI tracker reset');
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    logger.info('KPI tracker stopped');
  }
}