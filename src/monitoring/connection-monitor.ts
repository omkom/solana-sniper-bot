import { ConnectionManager } from '../core/connection';
import { logger } from './logger';

export class ConnectionMonitor {
  private connectionManager: ConnectionManager;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
  }

  startMonitoring(intervalMs: number = 10000): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.logConnectionStatus();
    }, intervalMs);

    logger.info('Connection monitoring started', { intervalMs });
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Connection monitoring stopped');
  }

  private logConnectionStatus(): void {
    const queueStatus = this.connectionManager.getQueueStatus();
    
    if (queueStatus.queueLength > 0 || queueStatus.activeRequests > 0) {
      logger.info('Connection queue status', {
        queueLength: queueStatus.queueLength,
        activeRequests: queueStatus.activeRequests,
        maxConcurrent: queueStatus.maxConcurrent,
        utilizationPct: Math.round((queueStatus.activeRequests / queueStatus.maxConcurrent) * 100)
      });
    }

    // Alert if queue is getting too long
    if (queueStatus.queueLength > 50) {
      logger.warn('Connection queue is getting long', {
        queueLength: queueStatus.queueLength,
        recommendation: 'Consider increasing rate limits or reducing load'
      });
    }
  }

  getStatus(): any {
    return {
      isMonitoring: this.isMonitoring,
      queueStatus: this.connectionManager.getQueueStatus()
    };
  }
}