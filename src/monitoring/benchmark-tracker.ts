/**
 * Performance Benchmarking System
 * Tracks system performance against specified targets
 * >60% win rate, >25% ROI, <5s detection latency, <1.5GB memory, 1000+ tokens/min
 */

import { EventEmitter } from 'events';
import { logger } from './logger';
import * as os from 'os';

export interface BenchmarkTargets {
  winRate: number;           // >60%
  avgROI: number;           // >25% per trade
  detectionLatency: number; // <5000ms
  memoryUsageMB: number;    // <1536MB (1.5GB)
  tokensPerMinute: number;  // >1000 tokens/min
  systemUptime: number;     // >99%
}

export interface BenchmarkMetrics {
  winRate: {
    current: number;
    target: number;
    status: 'ABOVE' | 'AT' | 'BELOW';
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  };
  avgROI: {
    current: number;
    target: number;
    status: 'ABOVE' | 'AT' | 'BELOW';
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  };
  detectionLatency: {
    current: number;
    target: number;
    status: 'ABOVE' | 'AT' | 'BELOW'; // BELOW target is good for latency
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  };
  memoryUsage: {
    current: number;
    target: number;
    status: 'ABOVE' | 'AT' | 'BELOW'; // BELOW target is good for memory
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
    percentage: number; // Of system RAM
  };
  tokensPerMinute: {
    current: number;
    target: number;
    status: 'ABOVE' | 'AT' | 'BELOW';
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  };
  systemUptime: {
    current: number;
    target: number;
    status: 'ABOVE' | 'AT' | 'BELOW';
    upSince: number;
  };
}

export interface BenchmarkAlert {
  id: string;
  metric: keyof BenchmarkTargets;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  currentValue: number;
  targetValue: number;
  timestamp: number;
  acknowledged: boolean;
  actionRequired: string;
}

export interface PerformanceSnapshot {
  timestamp: number;
  metrics: BenchmarkMetrics;
  alerts: BenchmarkAlert[];
  systemInfo: {
    totalMemoryMB: number;
    freeMemoryMB: number;
    cpuUsage: number;
    nodeUptime: number;
    processUptime: number;
  };
}

export class BenchmarkTracker extends EventEmitter {
  private targets: BenchmarkTargets;
  private metrics!: BenchmarkMetrics;
  private alerts: Map<string, BenchmarkAlert> = new Map();
  private isRunning = false;
  private startTime = Date.now();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  // Performance tracking
  private tradeHistory: Array<{ success: boolean; roi: number; timestamp: number }> = [];
  private detectionTimes: Array<{ latency: number; timestamp: number }> = [];
  private tokenCounts: Array<{ count: number; timestamp: number }> = [];
  private memorySnapshots: Array<{ usage: number; timestamp: number }> = [];

  constructor() {
    super();
    
    this.targets = {
      winRate: parseFloat(process.env.TARGET_WIN_RATE || '60'),
      avgROI: parseFloat(process.env.TARGET_AVG_ROI || '25'),
      detectionLatency: parseInt(process.env.TARGET_DETECTION_LATENCY || '5000'),
      memoryUsageMB: parseInt(process.env.TARGET_MEMORY_USAGE_MB || '1536'),
      tokensPerMinute: parseInt(process.env.TARGET_TOKENS_PER_MINUTE || '1000'),
      systemUptime: parseFloat(process.env.SYSTEM_UPTIME_TARGET || '99')
    };

    this.initializeMetrics();
    
    logger.info('📊 Benchmark Tracker initialized', {
      targets: this.targets,
      monitoringEnabled: true
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startTime = Date.now();
    
    // Start monitoring intervals
    this.startMonitoring();
    this.startCleanup();
    
    this.emit('started');
    logger.info('✅ Benchmark monitoring started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.emit('stopped');
    logger.info('🛑 Benchmark monitoring stopped');
  }

  /**
   * Record a trade result for win rate and ROI tracking
   */
  recordTrade(success: boolean, roi: number): void {
    this.tradeHistory.push({
      success,
      roi,
      timestamp: Date.now()
    });

    // Keep only last 1000 trades for performance
    if (this.tradeHistory.length > 1000) {
      this.tradeHistory = this.tradeHistory.slice(-1000);
    }

    this.updateTradeMetrics();
    this.checkTradeAlerts();
  }

  /**
   * Record token detection time
   */
  recordDetection(latencyMs: number): void {
    this.detectionTimes.push({
      latency: latencyMs,
      timestamp: Date.now()
    });

    // Keep only last 1000 detections
    if (this.detectionTimes.length > 1000) {
      this.detectionTimes = this.detectionTimes.slice(-1000);
    }

    this.updateLatencyMetrics();
    this.checkLatencyAlerts(latencyMs);
  }

  /**
   * Record token processing count for throughput tracking
   */
  recordTokenCount(count: number): void {
    this.tokenCounts.push({
      count,
      timestamp: Date.now()
    });

    // Keep only last hour of data
    const oneHourAgo = Date.now() - 3600000;
    this.tokenCounts = this.tokenCounts.filter(entry => entry.timestamp > oneHourAgo);

    this.updateThroughputMetrics();
  }

  /**
   * Get current benchmark metrics
   */
  getMetrics(): BenchmarkMetrics {
    this.updateAllMetrics();
    return { ...this.metrics };
  }

  /**
   * Get performance snapshot
   */
  getSnapshot(): PerformanceSnapshot {
    const memInfo = process.memoryUsage();
    const totalMemoryMB = os.totalmem() / (1024 * 1024);
    const freeMemoryMB = os.freemem() / (1024 * 1024);
    
    return {
      timestamp: Date.now(),
      metrics: this.getMetrics(),
      alerts: Array.from(this.alerts.values()),
      systemInfo: {
        totalMemoryMB: Math.round(totalMemoryMB),
        freeMemoryMB: Math.round(freeMemoryMB),
        cpuUsage: this.getCPUUsage(),
        nodeUptime: Math.round(process.uptime() * 1000),
        processUptime: Math.round((Date.now() - this.startTime))
      }
    };
  }

  /**
   * Get all active alerts
   */
  getAlerts(): BenchmarkAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Get benchmark status summary
   */
  getBenchmarkStatus(): {
    overall: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    meetsTargets: boolean;
    criticalIssues: number;
    warnings: number;
  } {
    const alerts = this.getAlerts();
    const criticalIssues = alerts.filter(a => a.severity === 'CRITICAL').length;
    const warnings = alerts.filter(a => a.severity === 'WARNING').length;
    
    // Check if we meet primary targets
    const meetsWinRate = this.metrics.winRate.current >= this.targets.winRate;
    const meetsROI = this.metrics.avgROI.current >= this.targets.avgROI;
    const meetsLatency = this.metrics.detectionLatency.current <= this.targets.detectionLatency;
    const meetsMemory = this.metrics.memoryUsage.current <= this.targets.memoryUsageMB;
    const meetsThroughput = this.metrics.tokensPerMinute.current >= this.targets.tokensPerMinute;
    
    const meetsTargets = meetsWinRate && meetsROI && meetsLatency && meetsMemory && meetsThroughput;
    
    let overall: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    if (criticalIssues > 0) {
      overall = 'CRITICAL';
    } else if (warnings > 0 || !meetsTargets) {
      overall = 'WARNING';
    }

    return {
      overall,
      meetsTargets,
      criticalIssues,
      warnings
    };
  }

  // Private methods

  private initializeMetrics(): void {
    this.metrics = {
      winRate: {
        current: 0,
        target: this.targets.winRate,
        status: 'BELOW',
        trend: 'STABLE'
      },
      avgROI: {
        current: 0,
        target: this.targets.avgROI,
        status: 'BELOW',
        trend: 'STABLE'
      },
      detectionLatency: {
        current: 0,
        target: this.targets.detectionLatency,
        status: 'BELOW',
        trend: 'STABLE'
      },
      memoryUsage: {
        current: 0,
        target: this.targets.memoryUsageMB,
        status: 'BELOW',
        trend: 'STABLE',
        percentage: 0
      },
      tokensPerMinute: {
        current: 0,
        target: this.targets.tokensPerMinute,
        status: 'BELOW',
        trend: 'STABLE'
      },
      systemUptime: {
        current: 0,
        target: this.targets.systemUptime,
        status: 'BELOW',
        upSince: this.startTime
      }
    };
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateAllMetrics();
      this.checkAllAlerts();
      this.recordMemoryUsage();
    }, 60000); // Check every minute
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 300000); // Cleanup every 5 minutes
  }

  private updateAllMetrics(): void {
    this.updateTradeMetrics();
    this.updateLatencyMetrics();
    this.updateMemoryMetrics();
    this.updateThroughputMetrics();
    this.updateUptimeMetrics();
  }

  private updateTradeMetrics(): void {
    if (this.tradeHistory.length === 0) return;

    // Calculate win rate
    const recentTrades = this.tradeHistory.slice(-100); // Last 100 trades
    const wins = recentTrades.filter(t => t.success).length;
    const currentWinRate = (wins / recentTrades.length) * 100;

    // Calculate average ROI
    const avgROI = recentTrades.reduce((sum, t) => sum + t.roi, 0) / recentTrades.length;

    // Update metrics with trend analysis
    const prevWinRate = this.metrics.winRate.current;
    const prevROI = this.metrics.avgROI.current;

    this.metrics.winRate.current = Math.round(currentWinRate * 100) / 100;
    this.metrics.winRate.status = this.getStatus(currentWinRate, this.targets.winRate, 'higher');
    this.metrics.winRate.trend = this.getTrend(currentWinRate, prevWinRate);

    this.metrics.avgROI.current = Math.round(avgROI * 100) / 100;
    this.metrics.avgROI.status = this.getStatus(avgROI, this.targets.avgROI, 'higher');
    this.metrics.avgROI.trend = this.getTrend(avgROI, prevROI);
  }

  private updateLatencyMetrics(): void {
    if (this.detectionTimes.length === 0) return;

    // Calculate average detection latency (last 100 detections)
    const recentDetections = this.detectionTimes.slice(-100);
    const avgLatency = recentDetections.reduce((sum, d) => sum + d.latency, 0) / recentDetections.length;

    const prevLatency = this.metrics.detectionLatency.current;
    this.metrics.detectionLatency.current = Math.round(avgLatency);
    this.metrics.detectionLatency.status = this.getStatus(avgLatency, this.targets.detectionLatency, 'lower');
    this.metrics.detectionLatency.trend = this.getTrend(avgLatency, prevLatency, true); // Reverse for latency (lower is better)
  }

  private updateMemoryMetrics(): void {
    const memInfo = process.memoryUsage();
    const currentMemoryMB = memInfo.heapUsed / (1024 * 1024);
    const totalSystemMemoryMB = os.totalmem() / (1024 * 1024);
    const percentage = (currentMemoryMB / totalSystemMemoryMB) * 100;

    const prevMemory = this.metrics.memoryUsage.current;
    this.metrics.memoryUsage.current = Math.round(currentMemoryMB);
    this.metrics.memoryUsage.percentage = Math.round(percentage * 100) / 100;
    this.metrics.memoryUsage.status = this.getStatus(currentMemoryMB, this.targets.memoryUsageMB, 'lower');
    this.metrics.memoryUsage.trend = this.getTrend(currentMemoryMB, prevMemory, true); // Reverse for memory (lower is better)
  }

  private updateThroughputMetrics(): void {
    if (this.tokenCounts.length === 0) return;

    // Calculate tokens per minute from last hour
    const oneHourAgo = Date.now() - 3600000;
    const recentCounts = this.tokenCounts.filter(entry => entry.timestamp > oneHourAgo);
    
    if (recentCounts.length === 0) return;

    const totalTokens = recentCounts.reduce((sum, entry) => sum + entry.count, 0);
    const timeSpanMinutes = (Date.now() - recentCounts[0].timestamp) / 60000;
    const tokensPerMinute = timeSpanMinutes > 0 ? totalTokens / timeSpanMinutes : 0;

    const prevThroughput = this.metrics.tokensPerMinute.current;
    this.metrics.tokensPerMinute.current = Math.round(tokensPerMinute);
    this.metrics.tokensPerMinute.status = this.getStatus(tokensPerMinute, this.targets.tokensPerMinute, 'higher');
    this.metrics.tokensPerMinute.trend = this.getTrend(tokensPerMinute, prevThroughput);
  }

  private updateUptimeMetrics(): void {
    const uptimeMs = Date.now() - this.startTime;
    const uptimeHours = uptimeMs / (1000 * 60 * 60);
    const uptimePercent = Math.min(100, (uptimeHours / (24 * 365)) * 100); // Simplified calculation

    this.metrics.systemUptime.current = Math.round(uptimePercent * 100) / 100;
    this.metrics.systemUptime.status = this.getStatus(uptimePercent, this.targets.systemUptime, 'higher');
    this.metrics.systemUptime.upSince = this.startTime;
  }

  private recordMemoryUsage(): void {
    const memInfo = process.memoryUsage();
    const currentMemoryMB = memInfo.heapUsed / (1024 * 1024);
    
    this.memorySnapshots.push({
      usage: currentMemoryMB,
      timestamp: Date.now()
    });

    // Keep only last 24 hours of snapshots
    const oneDayAgo = Date.now() - 86400000;
    this.memorySnapshots = this.memorySnapshots.filter(snap => snap.timestamp > oneDayAgo);
  }

  private checkAllAlerts(): void {
    this.checkTradeAlerts();
    this.checkLatencyAlerts();
    this.checkMemoryAlerts();
    this.checkThroughputAlerts();
  }

  private checkTradeAlerts(): void {
    // Win rate alert
    if (this.metrics.winRate.current < parseFloat(process.env.ALERT_WIN_RATE_BELOW || '40')) {
      this.createAlert('winRate', 'CRITICAL', 
        `Win rate below critical threshold: ${this.metrics.winRate.current}%`,
        this.metrics.winRate.current,
        this.targets.winRate,
        'Review trading strategies and risk management'
      );
    }

    // ROI alert
    if (this.metrics.avgROI.current < parseFloat(process.env.ALERT_AVG_ROI_BELOW || '10')) {
      this.createAlert('avgROI', 'WARNING',
        `Average ROI below warning threshold: ${this.metrics.avgROI.current}%`,
        this.metrics.avgROI.current,
        this.targets.avgROI,
        'Analyze profit-taking strategies and exit timing'
      );
    }
  }

  private checkLatencyAlerts(currentLatency?: number): void {
    const latency = currentLatency || this.metrics.detectionLatency.current;
    
    if (latency > parseInt(process.env.ALERT_LATENCY_ABOVE || '10000')) {
      this.createAlert('detectionLatency', 'CRITICAL',
        `Detection latency above critical threshold: ${latency}ms`,
        latency,
        this.targets.detectionLatency,
        'Check RPC connections and optimize detection algorithms'
      );
    }
  }

  private checkMemoryAlerts(): void {
    if (this.metrics.memoryUsage.current > parseInt(process.env.ALERT_MEMORY_ABOVE || '2048')) {
      this.createAlert('memoryUsageMB', 'CRITICAL',
        `Memory usage above critical threshold: ${this.metrics.memoryUsage.current}MB`,
        this.metrics.memoryUsage.current,
        this.targets.memoryUsageMB,
        'Reduce position count or restart system'
      );
    }
  }

  private checkThroughputAlerts(): void {
    if (this.metrics.tokensPerMinute.current < this.targets.tokensPerMinute * 0.5) {
      this.createAlert('tokensPerMinute', 'WARNING',
        `Token processing throughput below 50% of target: ${this.metrics.tokensPerMinute.current}/min`,
        this.metrics.tokensPerMinute.current,
        this.targets.tokensPerMinute,
        'Check API rate limits and processing bottlenecks'
      );
    }
  }

  private createAlert(
    metric: keyof BenchmarkTargets,
    severity: 'WARNING' | 'CRITICAL',
    message: string,
    currentValue: number,
    targetValue: number,
    actionRequired: string
  ): void {
    const alertId = `${metric}_${Date.now()}`;
    
    // Don't create duplicate alerts
    const existingAlert = Array.from(this.alerts.values()).find(
      a => a.metric === metric && a.severity === severity && !a.acknowledged
    );
    
    if (existingAlert) return;

    const alert: BenchmarkAlert = {
      id: alertId,
      metric,
      severity,
      message,
      currentValue,
      targetValue,
      timestamp: Date.now(),
      acknowledged: false,
      actionRequired
    };

    this.alerts.set(alertId, alert);
    
    logger.warn(`🚨 Benchmark Alert: ${severity}`, {
      metric,
      message,
      currentValue,
      targetValue,
      actionRequired
    });

    this.emit('benchmarkAlert', alert);
  }

  private getStatus(current: number, target: number, direction: 'higher' | 'lower'): 'ABOVE' | 'AT' | 'BELOW' {
    const tolerance = 0.05; // 5% tolerance
    const diff = Math.abs(current - target) / target;
    
    if (diff <= tolerance) return 'AT';
    
    if (direction === 'higher') {
      return current > target ? 'ABOVE' : 'BELOW';
    } else {
      return current < target ? 'ABOVE' : 'BELOW'; // Reversed for metrics where lower is better
    }
  }

  private getTrend(current: number, previous: number, reverse: boolean = false): 'IMPROVING' | 'STABLE' | 'DECLINING' {
    const tolerance = 0.02; // 2% tolerance
    const change = (current - previous) / Math.max(previous, 0.01);
    
    if (Math.abs(change) <= tolerance) return 'STABLE';
    
    const improving = reverse ? change < 0 : change > 0;
    return improving ? 'IMPROVING' : 'DECLINING';
  }

  private getCPUUsage(): number {
    // Simplified CPU usage calculation
    const cpus = os.cpus();
    return cpus.length * 10; // Placeholder - would need more complex calculation
  }

  private cleanupOldData(): void {
    const oneDayAgo = Date.now() - 86400000;
    
    // Cleanup old trade history
    this.tradeHistory = this.tradeHistory.filter(t => t.timestamp > oneDayAgo);
    
    // Cleanup old detection times
    this.detectionTimes = this.detectionTimes.filter(d => d.timestamp > oneDayAgo);
    
    // Cleanup old alerts (keep acknowledged ones for 24 hours)
    for (const [id, alert] of this.alerts) {
      if (alert.acknowledged && alert.timestamp < oneDayAgo) {
        this.alerts.delete(id);
      }
    }
    
    logger.debug('🧹 Cleaned up old benchmark data');
  }

  async healthCheck(): Promise<boolean> {
    return this.isRunning;
  }
}