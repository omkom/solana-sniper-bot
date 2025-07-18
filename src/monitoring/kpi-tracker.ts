import { EventEmitter } from 'events';

export interface KPIMetric {
  name: string;
  value: number;
  timestamp: number;
  metadata?: any;
}

export interface KPISummary {
  tokensDetected: number;
  tokensAnalyzed: number;
  positionsOpened: number;
  successfulTrades: number;
  totalROI: number;
  avgHoldTime: number;
  detectionRate: number;
  successRate: number;
  growthRate: number;
}

export class KPITracker extends EventEmitter {
  private metrics: Map<string, KPIMetric[]> = new Map();
  private maxMetricHistory = 1000;
  private startTime = Date.now();

  constructor() {
    super();
    this.initializeMetrics();
    console.log('📊 KPI Tracker initialized');
  }

  private initializeMetrics(): void {
    const metricNames = [
      'tokensDetected',
      'tokensAnalyzed', 
      'positionsOpened',
      'successfulTrades',
      'totalROI',
      'avgHoldTime'
    ];

    metricNames.forEach(name => {
      this.metrics.set(name, []);
    });
  }

  /**
   * Record a KPI metric
   */
  recordMetric(name: string, value: number, metadata?: any): void {
    const metric: KPIMetric = {
      name,
      value,
      timestamp: Date.now(),
      metadata
    };

    let metricHistory = this.metrics.get(name);
    if (!metricHistory) {
      metricHistory = [];
      this.metrics.set(name, metricHistory);
    }

    metricHistory.push(metric);

    // Limit history size
    if (metricHistory.length > this.maxMetricHistory) {
      metricHistory.splice(0, metricHistory.length - this.maxMetricHistory);
    }

    console.log(`📊 KPI recorded: ${name} = ${value}`);
    this.emit('kpiUpdate', { name, value, timestamp: metric.timestamp });
  }

  /**
   * Get metrics for a specific KPI
   */
  getMetrics(name: string): KPIMetric[] {
    return this.metrics.get(name) || [];
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Map<string, KPIMetric[]> {
    return this.metrics;
  }

  /**
   * Get KPI summary
   */
  getSummary(): KPISummary {
    const tokensDetected = this.getLatestValue('tokensDetected');
    const tokensAnalyzed = this.getLatestValue('tokensAnalyzed');
    const positionsOpened = this.getLatestValue('positionsOpened');
    const successfulTrades = this.getLatestValue('successfulTrades');
    const totalROI = this.getLatestValue('totalROI');
    const avgHoldTime = this.getLatestValue('avgHoldTime');

    const detectionRate = tokensDetected > 0 ? (tokensAnalyzed / tokensDetected) * 100 : 0;
    const successRate = positionsOpened > 0 ? (successfulTrades / positionsOpened) * 100 : 0;
    const growthRate = this.calculateGrowthRate('totalROI');

    return {
      tokensDetected,
      tokensAnalyzed,
      positionsOpened,
      successfulTrades,
      totalROI,
      avgHoldTime,
      detectionRate,
      successRate,
      growthRate
    };
  }

  /**
   * Get the latest value for a metric
   */
  private getLatestValue(name: string): number {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) {
      return 0;
    }
    return metrics[metrics.length - 1].value;
  }

  /**
   * Calculate growth rate for a metric
   */
  private calculateGrowthRate(name: string): number {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length < 2) {
      return 0;
    }

    const recent = metrics.slice(-10); // Last 10 data points
    if (recent.length < 2) {
      return 0;
    }

    const oldest = recent[0].value;
    const newest = recent[recent.length - 1].value;
    
    if (oldest === 0) {
      return 0;
    }

    return ((newest - oldest) / oldest) * 100;
  }

  /**
   * Record token detection
   */
  recordTokenDetected(source: string): void {
    this.recordMetric('tokensDetected', this.getLatestValue('tokensDetected') + 1, { source });
  }

  /**
   * Record token analysis
   */
  recordTokenAnalyzed(mint: string, score: number): void {
    this.recordMetric('tokensAnalyzed', this.getLatestValue('tokensAnalyzed') + 1, { mint, score });
  }

  /**
   * Record position opened
   */
  recordPositionOpened(mint: string, amount: number): void {
    this.recordMetric('positionsOpened', this.getLatestValue('positionsOpened') + 1, { mint, amount });
  }

  /**
   * Record successful trade
   */
  recordSuccessfulTrade(mint: string, roi: number, holdTime: number): void {
    this.recordMetric('successfulTrades', this.getLatestValue('successfulTrades') + 1, { mint, roi, holdTime });
    
    // Update total ROI
    const currentROI = this.getLatestValue('totalROI');
    this.recordMetric('totalROI', currentROI + roi, { mint, roi });
    
    // Update average hold time
    const currentAvgHoldTime = this.getLatestValue('avgHoldTime');
    const successfulTrades = this.getLatestValue('successfulTrades');
    const newAvgHoldTime = ((currentAvgHoldTime * (successfulTrades - 1)) + holdTime) / successfulTrades;
    this.recordMetric('avgHoldTime', newAvgHoldTime, { mint, holdTime });
  }

  /**
   * Get metrics in a specific time range
   */
  getMetricsInRange(name: string, startTime: number, endTime: number): KPIMetric[] {
    const metrics = this.metrics.get(name) || [];
    return metrics.filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.initializeMetrics();
    console.log('🗑️ KPI metrics cleared');
  }
}