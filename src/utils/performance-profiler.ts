/**
 * Performance Profiler
 * Monitors system performance and provides timing metrics
 * Essential for maintaining sub-50ms detection latency
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  category: string;
  metadata?: any;
}

interface PerformanceAlert {
  metric: string;
  threshold: number;
  actual: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  timestamp: number;
}

interface PerformanceThresholds {
  detection: number;
  analysis: number;
  execution: number;
  networking: number;
  database: number;
}

export class PerformanceProfiler extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private activeTimers = new Map<string, number>();
  private isStarted = false;
  private maxMetrics = 10000; // Keep last 10k metrics
  
  private thresholds: PerformanceThresholds = {
    detection: 50,      // 50ms for detection
    analysis: 100,      // 100ms for analysis
    execution: 200,     // 200ms for execution
    networking: 500,    // 500ms for network calls
    database: 1000      // 1000ms for database operations
  };
  
  private alertCooldowns = new Map<string, number>();
  private readonly ALERT_COOLDOWN = 60000; // 1 minute between same alerts

  constructor(customThresholds: Partial<PerformanceThresholds> = {}) {
    super();
    
    this.thresholds = {
      ...this.thresholds,
      ...customThresholds
    };
    
    logger.info('📊 Performance Profiler initialized', {
      thresholds: this.thresholds,
      maxMetrics: this.maxMetrics
    });
  }

  start(): void {
    if (this.isStarted) {
      logger.warn('Performance profiler already started');
      return;
    }

    this.isStarted = true;
    this.startCleanupTask();
    
    logger.info('📈 Performance profiler started');
  }

  stop(): void {
    if (!this.isStarted) return;

    this.isStarted = false;
    this.metrics = [];
    this.activeTimers.clear();
    this.alertCooldowns.clear();
    
    logger.info('📉 Performance profiler stopped');
  }

  /**
   * Start timing an operation
   * Returns a function that when called, records the elapsed time
   */
  startTimer(name?: string, category: string = 'general', metadata?: any): () => number {
    const timerId = name || `timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    
    this.activeTimers.set(timerId, startTime);
    
    return (): number => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      this.activeTimers.delete(timerId);
      
      if (this.isStarted) {
        this.recordMetric({
          name: timerId,
          duration,
          timestamp: Date.now(),
          category,
          metadata
        });
      }
      
      return duration;
    };
  }

  /**
   * Record a performance metric directly
   */
  recordMetric(metric: PerformanceMetric): void {
    if (!this.isStarted) return;

    this.metrics.push(metric);
    
    // Check for performance alerts
    this.checkPerformanceAlert(metric);
    
    // Emit metric event for real-time monitoring
    this.emit('metric', metric);
    
    // Debug log for slow operations
    if (metric.duration > 1000) {
      logger.debug(`⚠️ Slow operation detected: ${metric.name} took ${metric.duration.toFixed(2)}ms`);
    }
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(
    fn: () => Promise<T> | T,
    name: string,
    category: string = 'function',
    metadata?: any
  ): Promise<{ result: T; duration: number }> {
    const timer = this.startTimer(name, category, metadata);
    
    try {
      const result = await fn();
      const duration = timer();
      
      return { result, duration };
    } catch (error) {
      const duration = timer();
      
      // Record failed operation
      this.recordMetric({
        name: `${name}_error`,
        duration,
        timestamp: Date.now(),
        category,
        metadata: { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' }
      });
      
      throw error;
    }
  }

  /**
   * Time a synchronous function execution
   */
  timeFunctionSync<T>(
    fn: () => T,
    name: string,
    category: string = 'function',
    metadata?: any
  ): { result: T; duration: number } {
    const timer = this.startTimer(name, category, metadata);
    
    try {
      const result = fn();
      const duration = timer();
      
      return { result, duration };
    } catch (error) {
      const duration = timer();
      
      // Record failed operation
      this.recordMetric({
        name: `${name}_error`,
        duration,
        timestamp: Date.now(),
        category,
        metadata: { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' }
      });
      
      throw error;
    }
  }

  private checkPerformanceAlert(metric: PerformanceMetric): void {
    const threshold = this.getThresholdForCategory(metric.category);
    
    if (metric.duration > threshold) {
      const alertKey = `${metric.category}_${threshold}`;
      const now = Date.now();
      
      // Check cooldown
      const lastAlert = this.alertCooldowns.get(alertKey);
      if (lastAlert && (now - lastAlert) < this.ALERT_COOLDOWN) {
        return;
      }
      
      this.alertCooldowns.set(alertKey, now);
      
      const severity = this.calculateSeverity(metric.duration, threshold);
      
      const alert: PerformanceAlert = {
        metric: metric.name,
        threshold,
        actual: metric.duration,
        severity,
        timestamp: now
      };
      
      logger.warn(`⚡ Performance alert: ${metric.name}`, {
        duration: `${metric.duration.toFixed(2)}ms`,
        threshold: `${threshold}ms`,
        severity,
        category: metric.category
      });
      
      this.emit('performanceAlert', alert);
    }
  }

  private getThresholdForCategory(category: string): number {
    switch (category.toLowerCase()) {
      case 'detection':
        return this.thresholds.detection;
      case 'analysis':
        return this.thresholds.analysis;
      case 'execution':
        return this.thresholds.execution;
      case 'networking':
      case 'network':
        return this.thresholds.networking;
      case 'database':
      case 'db':
        return this.thresholds.database;
      default:
        return 1000; // Default 1 second threshold
    }
  }

  private calculateSeverity(actual: number, threshold: number): PerformanceAlert['severity'] {
    const ratio = actual / threshold;
    
    if (ratio >= 5) return 'CRITICAL';
    if (ratio >= 3) return 'HIGH';
    if (ratio >= 2) return 'MEDIUM';
    return 'LOW';
  }

  private startCleanupTask(): void {
    setInterval(() => {
      if (this.metrics.length > this.maxMetrics) {
        const excess = this.metrics.length - this.maxMetrics;
        this.metrics.splice(0, excess);
        
        logger.debug(`🧹 Cleaned up ${excess} old performance metrics`);
      }
      
      // Clean up old alert cooldowns
      const now = Date.now();
      for (const [key, timestamp] of this.alertCooldowns) {
        if (now - timestamp > this.ALERT_COOLDOWN * 2) {
          this.alertCooldowns.delete(key);
        }
      }
    }, 60000); // Run cleanup every minute
  }

  // Analytics and reporting methods
  getMetrics(category?: string, limit?: number): PerformanceMetric[] {
    let filtered = category ? 
      this.metrics.filter(m => m.category === category) : 
      this.metrics;
    
    if (limit) {
      filtered = filtered.slice(-limit);
    }
    
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  getAveragePerformance(category?: string, timeWindow?: number): {
    average: number;
    median: number;
    p95: number;
    p99: number;
    count: number;
  } {
    const now = Date.now();
    const windowStart = timeWindow ? now - timeWindow : 0;
    
    let metrics = this.metrics.filter(m => m.timestamp >= windowStart);
    
    if (category) {
      metrics = metrics.filter(m => m.category === category);
    }
    
    if (metrics.length === 0) {
      return { average: 0, median: 0, p95: 0, p99: 0, count: 0 };
    }
    
    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    const count = durations.length;
    
    const average = durations.reduce((sum, d) => sum + d, 0) / count;
    const median = durations[Math.floor(count / 2)];
    const p95 = durations[Math.floor(count * 0.95)];
    const p99 = durations[Math.floor(count * 0.99)];
    
    return { average, median, p95, p99, count };
  }

  getSlowestOperations(limit: number = 10, category?: string): PerformanceMetric[] {
    let filtered = category ? 
      this.metrics.filter(m => m.category === category) : 
      this.metrics;
    
    return filtered
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  getCategoryStats(): Record<string, {
    count: number;
    totalTime: number;
    averageTime: number;
    maxTime: number;
  }> {
    const stats: Record<string, any> = {};
    
    for (const metric of this.metrics) {
      if (!stats[metric.category]) {
        stats[metric.category] = {
          count: 0,
          totalTime: 0,
          averageTime: 0,
          maxTime: 0
        };
      }
      
      const categoryStats = stats[metric.category];
      categoryStats.count++;
      categoryStats.totalTime += metric.duration;
      categoryStats.maxTime = Math.max(categoryStats.maxTime, metric.duration);
    }
    
    // Calculate averages
    Object.keys(stats).forEach(category => {
      stats[category].averageTime = stats[category].totalTime / stats[category].count;
    });
    
    return stats;
  }

  getPerformanceTrend(category: string, timeWindow: number = 3600000): {
    timestamps: number[];
    averages: number[];
    trend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
  } {
    const now = Date.now();
    const windowStart = now - timeWindow;
    
    const metrics = this.metrics
      .filter(m => m.category === category && m.timestamp >= windowStart)
      .sort((a, b) => a.timestamp - b.timestamp);
    
    if (metrics.length < 10) {
      return { timestamps: [], averages: [], trend: 'STABLE' };
    }
    
    // Group metrics into time buckets
    const bucketSize = timeWindow / 20; // 20 buckets
    const buckets: { timestamp: number; durations: number[] }[] = [];
    
    for (let i = 0; i < 20; i++) {
      const bucketStart = windowStart + (i * bucketSize);
      const bucketEnd = bucketStart + bucketSize;
      
      const bucketMetrics = metrics.filter(m => 
        m.timestamp >= bucketStart && m.timestamp < bucketEnd
      );
      
      if (bucketMetrics.length > 0) {
        buckets.push({
          timestamp: bucketStart + (bucketSize / 2),
          durations: bucketMetrics.map(m => m.duration)
        });
      }
    }
    
    const timestamps = buckets.map(b => b.timestamp);
    const averages = buckets.map(b => 
      b.durations.reduce((sum, d) => sum + d, 0) / b.durations.length
    );
    
    // Calculate trend
    let trend: 'IMPROVING' | 'STABLE' | 'DEGRADING' = 'STABLE';
    
    if (averages.length >= 3) {
      const firstThird = averages.slice(0, Math.floor(averages.length / 3));
      const lastThird = averages.slice(-Math.floor(averages.length / 3));
      
      const firstAvg = firstThird.reduce((sum, avg) => sum + avg, 0) / firstThird.length;
      const lastAvg = lastThird.reduce((sum, avg) => sum + avg, 0) / lastThird.length;
      
      const change = (lastAvg - firstAvg) / firstAvg;
      
      if (change < -0.1) trend = 'IMPROVING';
      else if (change > 0.1) trend = 'DEGRADING';
    }
    
    return { timestamps, averages, trend };
  }

  // System health methods
  getSystemHealth(): {
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    details: {
      avgLatency: number;
      p95Latency: number;
      alertCount: number;
      slowOperations: number;
    };
  } {
    const recentWindow = 300000; // 5 minutes
    const recentMetrics = this.getMetrics(undefined, undefined).filter(
      m => Date.now() - m.timestamp < recentWindow
    );
    
    if (recentMetrics.length === 0) {
      return {
        status: 'HEALTHY',
        details: { avgLatency: 0, p95Latency: 0, alertCount: 0, slowOperations: 0 }
      };
    }
    
    const avgLatency = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    const sortedDurations = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
    const p95Latency = sortedDurations[Math.floor(sortedDurations.length * 0.95)];
    const slowOperations = recentMetrics.filter(m => m.duration > 1000).length;
    
    let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    
    if (p95Latency > 5000 || avgLatency > 2000 || slowOperations > recentMetrics.length * 0.1) {
      status = 'CRITICAL';
    } else if (p95Latency > 1000 || avgLatency > 500 || slowOperations > 0) {
      status = 'DEGRADED';
    } else {
      status = 'HEALTHY';
    }
    
    return {
      status,
      details: {
        avgLatency,
        p95Latency,
        alertCount: this.alertCooldowns.size,
        slowOperations
      }
    };
  }

  getStats(): any {
    const health = this.getSystemHealth();
    const categoryStats = this.getCategoryStats();
    
    return {
      isStarted: this.isStarted,
      totalMetrics: this.metrics.length,
      activeTimers: this.activeTimers.size,
      thresholds: this.thresholds,
      health,
      categoryStats,
      recentAlerts: this.alertCooldowns.size
    };
  }

  // Convenience methods for common operations
  timeDetection<T>(fn: () => Promise<T> | T, metadata?: any): Promise<{ result: T; duration: number }> | { result: T; duration: number } {
    if (fn.constructor.name === 'AsyncFunction' || typeof (fn as any).then === 'function') {
      return this.timeFunction(fn as () => Promise<T>, 'detection', 'detection', metadata);
    } else {
      return this.timeFunctionSync(fn as () => T, 'detection', 'detection', metadata);
    }
  }

  timeAnalysis<T>(fn: () => Promise<T> | T, metadata?: any): Promise<{ result: T; duration: number }> | { result: T; duration: number } {
    if (fn.constructor.name === 'AsyncFunction' || typeof (fn as any).then === 'function') {
      return this.timeFunction(fn as () => Promise<T>, 'analysis', 'analysis', metadata);
    } else {
      return this.timeFunctionSync(fn as () => T, 'analysis', 'analysis', metadata);
    }
  }

  timeExecution<T>(fn: () => Promise<T> | T, metadata?: any): Promise<{ result: T; duration: number }> | { result: T; duration: number } {
    if (fn.constructor.name === 'AsyncFunction' || typeof (fn as any).then === 'function') {
      return this.timeFunction(fn as () => Promise<T>, 'execution', 'execution', metadata);
    } else {
      return this.timeFunctionSync(fn as () => T, 'execution', 'execution', metadata);
    }
  }

  timeNetworking<T>(fn: () => Promise<T> | T, metadata?: any): Promise<{ result: T; duration: number }> | { result: T; duration: number } {
    if (fn.constructor.name === 'AsyncFunction' || typeof (fn as any).then === 'function') {
      return this.timeFunction(fn as () => Promise<T>, 'networking', 'networking', metadata);
    } else {
      return this.timeFunctionSync(fn as () => T, 'networking', 'networking', metadata);
    }
  }
}