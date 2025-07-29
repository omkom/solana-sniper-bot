/**
 * WebSocket Server for Real-time Dashboard Updates
 * Provides real-time streaming of trading data, positions, and system metrics
 */

import { EventEmitter } from 'events';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
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
  private server: any;
  private io: SocketIOServer | null = null;
  private broadcastInterval?: NodeJS.Timeout;
  private metricsInterval?: NodeJS.Timeout;

  // Real data streams (no longer simulated)
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
      // Create HTTP server and Socket.IO instance
      this.server = createServer();
      this.io = new SocketIOServer(this.server, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST']
        }
      });

      // Setup Socket.IO event handlers
      this.setupSocketHandlers();

      // Start server
      await new Promise<void>((resolve, reject) => {
        this.server.listen(this.port, () => {
          logger.info(`✅ Real WebSocket Server started on port ${this.port}`);
          resolve();
        });
        this.server.on('error', reject);
      });
      
      // Start metrics collection
      this.startMetricsCollection();

      this.isRunning = true;
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

    // Close Socket.IO server
    if (this.io) {
      this.io.close();
      this.io = null;
    }

    // Close HTTP server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }

    // Close all client connections
    this.clients.clear();

    this.isRunning = false;
    logger.info('✅ WebSocket Server stopped');
    this.emit('stopped');
  }

  private setupSocketHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const client: ClientConnection = {
        id: clientId,
        subscriptions: new Set(['tokenUpdates', 'positionUpdates', 'portfolioUpdates']),
        lastPing: Date.now(),
        isAlive: true
      };
      
      this.clients.set(clientId, client);
      logger.info(`🔌 Client connected: ${clientId} (Total: ${this.clients.size})`);

      // Handle client subscription requests
      socket.on('subscribe', (channels: string[]) => {
        channels.forEach(channel => {
          client.subscriptions.add(channel);
          socket.join(channel);
        });
        logger.debug(`📡 Client ${clientId} subscribed to: ${channels.join(', ')}`);
      });

      socket.on('unsubscribe', (channels: string[]) => {
        channels.forEach(channel => {
          client.subscriptions.delete(channel);
          socket.leave(channel);
        });
        logger.debug(`📡 Client ${clientId} unsubscribed from: ${channels.join(', ')}`);
      });

      // Handle client requests
      socket.on('requestPortfolio', () => {
        this.emit('portfolioRequested', { clientId, socket });
      });

      socket.on('requestPositions', () => {
        this.emit('positionsRequested', { clientId, socket });
      });

      socket.on('requestTokenData', () => {
        this.emit('tokenDataRequested', { clientId, socket });
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        client.lastPing = Date.now();
        socket.emit('pong');
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        this.clients.delete(clientId);
        logger.info(`🔌 Client disconnected: ${clientId} (Reason: ${reason}, Remaining: ${this.clients.size})`);
      });

      // Send initial connection confirmation
      socket.emit('connected', {
        clientId,
        serverTime: Date.now(),
        availableChannels: ['tokenUpdates', 'positionUpdates', 'portfolioUpdates', 'alerts', 'detectionResults']
      });
    });
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000); // Every 5 seconds
  }

  // Data arrays are now populated by real events from the orchestrator
  // Arrays are cleaned up automatically in the broadcast methods

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
    if (!this.io || this.clients.size === 0) {
      return;
    }

    const clientCount = this.clients.size;
    logger.debug(`📡 Broadcasting updates to ${clientCount} clients`);

    // Broadcast to all connected clients
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
    if (!this.io) return;

    const message: WebSocketMessage = {
      type: 'tokenUpdate',
      data: tokenData,
      timestamp: Date.now(),
      id: `token_${Date.now()}`
    };

    // Store real data
    this.tokenUpdates.push(tokenData);
    this.cleanupArrays();

    this.io.emit('tokenUpdate', message.data);
    logger.debug(`📊 Token update broadcasted: ${tokenData.symbol} - $${tokenData.price?.toFixed(6)}`);
    this.emit('tokenUpdate', message);
  }

  broadcastPositionUpdate(positionData: any): void {
    if (!this.io) return;

    const message: WebSocketMessage = {
      type: 'positionUpdate',
      data: positionData,
      timestamp: Date.now(),
      id: `position_${Date.now()}`
    };

    // Store real data
    this.positionUpdates.push(positionData);
    this.cleanupArrays();

    this.io.emit('positionUpdate', message.data);
    logger.debug(`💼 Position update broadcasted: ${positionData.symbol} - PnL: ${positionData.pnl?.toFixed(6)}`);
    this.emit('positionUpdate', message);
  }

  broadcastPortfolioUpdate(portfolioData: any): void {
    if (!this.io) return;

    const message: WebSocketMessage = {
      type: 'portfolioUpdate',
      data: portfolioData,
      timestamp: Date.now(),
      id: `portfolio_${Date.now()}`
    };

    // Store real data
    this.portfolioUpdates.push(portfolioData);
    this.cleanupArrays();

    this.io.emit('portfolio', message.data);
    logger.debug(`💰 Portfolio update broadcasted: ${portfolioData.balance?.toFixed(4)} SOL`);
    this.emit('portfolioUpdate', message);
  }

  broadcastAlert(alertData: any): void {
    if (!this.io) return;

    const message: WebSocketMessage = {
      type: 'alert',
      data: alertData,
      timestamp: Date.now(),
      id: `alert_${Date.now()}`
    };

    // Store real data
    this.alerts.push(alertData);
    this.cleanupArrays();

    this.io.emit('alert', message.data);
    logger.info(`🚨 Alert broadcasted: ${alertData.message}`);
    this.emit('alert', message);
  }

  broadcastDetectionResult(detectionData: any): void {
    if (!this.io) return;

    const message: WebSocketMessage = {
      type: 'detectionResult',
      data: detectionData,
      timestamp: Date.now(),
      id: `detection_${Date.now()}`
    };

    this.io.emit('detectionResult', message.data);
    logger.debug(`🎯 Detection result broadcasted: ${detectionData.token?.symbol || 'Unknown'}`);
    this.emit('detectionResult', message);
  }

  broadcastTradeSignal(signalData: any): void {
    if (!this.io) return;

    const message: WebSocketMessage = {
      type: 'tradeSignal',
      data: signalData,
      timestamp: Date.now(),
      id: `signal_${Date.now()}`
    };

    this.io.emit('newTrade', message.data);
    logger.debug(`📈 Trade signal broadcasted: ${signalData.action} ${signalData.token?.symbol}`);
    this.emit('tradeSignal', message);
  }

  // Utility methods for data management
  private cleanupArrays(): void {
    // Keep arrays manageable
    if (this.tokenUpdates.length > 100) this.tokenUpdates.splice(0, 50);
    if (this.positionUpdates.length > 50) this.positionUpdates.splice(0, 25);
    if (this.portfolioUpdates.length > 50) this.portfolioUpdates.splice(0, 25);
    if (this.alerts.length > 20) this.alerts.splice(0, 10);
  }

  // Add real broadcasting methods for specific events
  broadcastTokenDetected(tokenData: any): void {
    if (!this.io) return;
    this.io.emit('tokenDetected', tokenData);
    logger.debug(`🎯 Token detected broadcasted: ${tokenData.symbol}`);
  }

  broadcastNewTrade(tradeData: any): void {
    if (!this.io) return;
    this.io.emit('newTrade', tradeData);
    logger.debug(`💹 New trade broadcasted: ${tradeData.type} ${tradeData.symbol}`);
  }

  broadcastPriceUpdate(priceData: any): void {
    if (!this.io) return;
    this.io.emit('priceUpdate', priceData);
    logger.debug(`📈 Price update broadcasted: ${priceData.symbol}`);
  }

  // Get real client connections count
  getRealClientCount(): number {
    return this.clients.size;
  }

  // Broadcast to specific channel
  broadcastToChannel(channel: string, event: string, data: any): void {
    if (!this.io) return;
    this.io.to(channel).emit(event, data);
    logger.debug(`📡 Broadcasted to channel ${channel}: ${event}`);
  }

  // Legacy method for compatibility (now uses real connections)
  simulateClientConnection(): string {
    // This method is kept for compatibility but now returns real connection count
    return `real_connections_${this.clients.size}`;
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