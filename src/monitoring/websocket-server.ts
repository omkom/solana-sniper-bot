/**
 * WebSocket Server for Real-time Dashboard Updates
 * Provides real-time streaming of trading data, positions, and system metrics
 */

import { EventEmitter } from 'events';
import { WebSocketServer as WebSocketServerInterface } from '../types/unified';
import { logger } from '../monitoring/logger';

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
  id?: string;
}

export interface ClientConnection {
  id: string;
  subscriptions: Set<string>;
  lastPing: number;
  isAlive: boolean;
}

export class WebSocketServer extends EventEmitter implements WebSocketServerInterface {
  private clients = new Map<string, ClientConnection>();
  private isRunning = false;
  private port: number;
  private broadcastInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  // Simulated data streams
  private tokenUpdates: any[] = [];
  private positionUpdates: any[] = [];
  private portfolioUpdates: any[] = [];
  private systemMetrics: any[] = [];
  private alerts: any[] = [];

  constructor(port: number = 3001) {
    super();
    this.port = port;
    logger.info(`🌐 WebSocket Server initialized on port ${port}`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('WebSocket Server already running');
      return;
    }

    try {
      // Start data broadcasting simulation
      this.startDataBroadcasting();
      
      // Start metrics collection
      this.startMetricsCollection();

      this.isRunning = true;
      logger.info(`✅ WebSocket Server started on port ${this.port}`);
      this.emit('started');

    } catch (error) {
      logger.error('❌ Failed to start WebSocket Server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('🛑 Stopping WebSocket Server...');

    // Clear intervals
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = undefined;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
    }

    // Close all client connections
    this.clients.clear();

    this.isRunning = false;
    logger.info('✅ WebSocket Server stopped');
    this.emit('stopped');
  }

  private startDataBroadcasting(): void {
    this.broadcastInterval = setInterval(() => {
      this.simulateDataUpdates();
      this.broadcastToClients();
    }, 2000); // Every 2 seconds
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000); // Every 5 seconds
  }

  private simulateDataUpdates(): void {
    // Simulate token updates
    if (Math.random() > 0.7) {
      const tokenUpdate = {
        address: this.generateTokenAddress(),
        symbol: this.generateTokenSymbol(),
        price: Math.random() * 10,
        change24h: (Math.random() - 0.5) * 100,
        volume: Math.random() * 1000000,
        detected: true,
        timestamp: Date.now()
      };
      this.tokenUpdates.push(tokenUpdate);
    }

    // Simulate position updates
    if (Math.random() > 0.8) {
      const positionUpdate = {
        id: `pos_${Date.now()}`,
        symbol: this.generateTokenSymbol(),
        size: Math.random() * 0.01,
        pnl: (Math.random() - 0.5) * 0.001,
        timestamp: Date.now()
      };
      this.positionUpdates.push(positionUpdate);
    }

    // Simulate portfolio updates
    const portfolioUpdate = {
      balance: 10 + (Math.random() - 0.5) * 2,
      totalValue: 10 + (Math.random() - 0.5) * 2,
      pnl: (Math.random() - 0.5) * 1,
      positions: this.positionUpdates.length,
      timestamp: Date.now()
    };
    this.portfolioUpdates.push(portfolioUpdate);

    // Simulate alerts
    if (Math.random() > 0.95) {
      const alert = {
        type: Math.random() > 0.5 ? 'profit_target' : 'stop_loss',
        message: `${this.generateTokenSymbol()} triggered ${Math.random() > 0.5 ? 'profit target' : 'stop loss'}`,
        level: Math.random() > 0.5 ? 'info' : 'warning',
        timestamp: Date.now()
      };
      this.alerts.push(alert);
    }

    // Keep arrays manageable
    if (this.tokenUpdates.length > 100) this.tokenUpdates.splice(0, 50);
    if (this.positionUpdates.length > 50) this.positionUpdates.splice(0, 25);
    if (this.portfolioUpdates.length > 50) this.portfolioUpdates.splice(0, 25);
    if (this.alerts.length > 20) this.alerts.splice(0, 10);
  }

  private collectSystemMetrics(): void {
    const metrics = {
      timestamp: Date.now(),
      connectedClients: this.clients.size,
      systemUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      detectedTokens: this.tokenUpdates.length,
      activePositions: this.positionUpdates.length,
      totalAlerts: this.alerts.length
    };

    this.systemMetrics.push(metrics);
    
    // Keep metrics history manageable
    if (this.systemMetrics.length > 100) {
      this.systemMetrics.splice(0, 50);
    }
  }

  private broadcastToClients(): void {
    const clientCount = this.clients.size;
    
    // For simulation, we'll just log the broadcast
    if (clientCount > 0) {
      logger.debug(`📡 Broadcasting updates to ${clientCount} clients`);
    }

    // Simulate broadcasting different types of data
    if (this.tokenUpdates.length > 0) {
      const latestToken = this.tokenUpdates[this.tokenUpdates.length - 1];
      this.broadcastTokenUpdate(latestToken);
    }

    if (this.positionUpdates.length > 0) {
      const latestPosition = this.positionUpdates[this.positionUpdates.length - 1];
      this.broadcastPositionUpdate(latestPosition);
    }

    if (this.portfolioUpdates.length > 0) {
      const latestPortfolio = this.portfolioUpdates[this.portfolioUpdates.length - 1];
      this.broadcastPortfolioUpdate(latestPortfolio);
    }

    if (this.alerts.length > 0) {
      const latestAlert = this.alerts[this.alerts.length - 1];
      this.broadcastAlert(latestAlert);
    }
  }

  // Public methods for broadcasting different types of data
  broadcastTokenUpdate(tokenData: any): void {
    const message: WebSocketMessage = {
      type: 'tokenUpdate',
      data: tokenData,
      timestamp: Date.now(),
      id: `token_${Date.now()}`
    };

    logger.debug(`📊 Token update: ${tokenData.symbol} - $${tokenData.price?.toFixed(6)}`);
    this.emit('tokenUpdate', message);
  }

  broadcastPositionUpdate(positionData: any): void {
    const message: WebSocketMessage = {
      type: 'positionUpdate',
      data: positionData,
      timestamp: Date.now(),
      id: `position_${Date.now()}`
    };

    logger.debug(`💼 Position update: ${positionData.symbol} - PnL: ${positionData.pnl?.toFixed(6)}`);
    this.emit('positionUpdate', message);
  }

  broadcastPortfolioUpdate(portfolioData: any): void {
    const message: WebSocketMessage = {
      type: 'portfolioUpdate',
      data: portfolioData,
      timestamp: Date.now(),
      id: `portfolio_${Date.now()}`
    };

    logger.debug(`💰 Portfolio update: ${portfolioData.balance?.toFixed(4)} SOL`);
    this.emit('portfolioUpdate', message);
  }

  broadcastAlert(alertData: any): void {
    const message: WebSocketMessage = {
      type: 'alert',
      data: alertData,
      timestamp: Date.now(),
      id: `alert_${Date.now()}`
    };

    logger.info(`🚨 Alert: ${alertData.message}`);
    this.emit('alert', message);
  }

  broadcastDetectionResult(detectionData: any): void {
    const message: WebSocketMessage = {
      type: 'detectionResult',
      data: detectionData,
      timestamp: Date.now(),
      id: `detection_${Date.now()}`
    };

    logger.debug(`🎯 Detection result: ${detectionData.token?.symbol || 'Unknown'}`);
    this.emit('detectionResult', message);
  }

  broadcastTradeSignal(signalData: any): void {
    const message: WebSocketMessage = {
      type: 'tradeSignal',
      data: signalData,
      timestamp: Date.now(),
      id: `signal_${Date.now()}`
    };

    logger.debug(`📈 Trade signal: ${signalData.action} ${signalData.token?.symbol}`);
    this.emit('tradeSignal', message);
  }

  // Utility methods for simulation
  private generateTokenAddress(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 44; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateTokenSymbol(): string {
    const symbols = ['DOGE', 'PEPE', 'SHIB', 'FLOKI', 'BONK', 'WIF', 'MYRO', 'POPCAT', 'MEW', 'TRUMP'];
    return symbols[Math.floor(Math.random() * symbols.length)];
  }

  // Simulate client connections for testing
  simulateClientConnection(): string {
    const clientId = `sim_client_${Date.now()}`;
    const client: ClientConnection = {
      id: clientId,
      subscriptions: new Set(['tokenUpdates', 'positionUpdates', 'portfolioUpdates']),
      lastPing: Date.now(),
      isAlive: true
    };
    
    this.clients.set(clientId, client);
    logger.info(`🔌 Simulated client connected: ${clientId}`);
    
    return clientId;
  }

  disconnectClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId);
      logger.info(`🔌 Client disconnected: ${clientId}`);
    }
  }

  // Public getters
  getConnectedClients(): number {
    return this.clients.size;
  }

  isServerRunning(): boolean {
    return this.isRunning;
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      port: this.port,
      connectedClients: this.clients.size,
      dataStreams: {
        tokenUpdates: this.tokenUpdates.length,
        positionUpdates: this.positionUpdates.length,
        portfolioUpdates: this.portfolioUpdates.length,
        systemMetrics: this.systemMetrics.length,
        alerts: this.alerts.length
      },
      lastUpdate: this.tokenUpdates.length > 0 ? this.tokenUpdates[this.tokenUpdates.length - 1]?.timestamp : null
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.isRunning;
  }

  // Get recent data for dashboard initialization
  getRecentTokenUpdates(limit: number = 10): any[] {
    return this.tokenUpdates.slice(-limit);
  }

  getRecentPositionUpdates(limit: number = 10): any[] {
    return this.positionUpdates.slice(-limit);
  }

  getLatestPortfolio(): any {
    return this.portfolioUpdates.length > 0 ? this.portfolioUpdates[this.portfolioUpdates.length - 1] : null;
  }

  getRecentAlerts(limit: number = 5): any[] {
    return this.alerts.slice(-limit);
  }

  getSystemMetrics(): any {
    return this.systemMetrics.length > 0 ? this.systemMetrics[this.systemMetrics.length - 1] : null;
  }
}