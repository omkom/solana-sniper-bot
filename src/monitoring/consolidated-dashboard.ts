/**
 * Consolidated Dashboard System
 * Merges functionality from dashboard.ts, enhanced-dashboard.ts, and embedded dashboards
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { EventEmitter } from 'events';
import path from 'path';
import { logger } from './logger';
import { ConsolidatedSimulationEngine, SimulationPosition, SimulationTrade, Portfolio } from '../simulation/consolidated-simulation-engine';
import { UnifiedTokenInfo } from '../types/unified';

export interface DashboardConfig {
  port: number;
  enableRealTimeUpdates: boolean;
  enableMetrics: boolean;
  enableAnalytics: boolean;
  updateInterval: number;
  maxHistorySize: number;
  features: {
    portfolio: boolean;
    detection: boolean;
    trading: boolean;
    analytics: boolean;
    migration: boolean;
    kpi: boolean;
  };
}

export interface DashboardMetrics {
  totalDetected: number;
  totalTrades: number;
  activePositions: number;
  portfolioValue: number;
  totalReturn: number;
  winRate: number;
  detectionRate: number;
  apiCalls: number;
  uptime: number;
  errors: number;
}

export interface KPIMetrics {
  tokensDetected: number;
  tokensAnalyzed: number;
  successfulTrades: number;
  portfolioGrowth: number;
  detectionAccuracy: number;
  systemHealth: number;
}

export interface TrackedToken {
  address: string;
  symbol: string;
  name: string;
  price: number;
  priceHistory: Array<{ price: number; timestamp: number }>;
  volume24h: number;
  liquidity: number;
  isActive: boolean;
  trackedSince: number;
  alerts: Array<{ type: string; message: string; timestamp: number }>;
}

export interface Migration {
  id: string;
  token: UnifiedTokenInfo;
  fromDex: string;
  toDex: string;
  timestamp: number;
  liquidityChange: number;
  priceImpact: number;
  reason: string;
}

export class ConsolidatedDashboard extends EventEmitter {
  private app!: express.Application;
  private server: any;
  private io!: SocketIOServer;
  private config: DashboardConfig;
  private dashboardRunning = false;
  private startTime = Date.now();
  
  // Data stores
  private metrics: DashboardMetrics;
  private kpiMetrics: KPIMetrics;
  private trackedTokens: Map<string, TrackedToken> = new Map();
  private migrations: Migration[] = [];
  private recentTrades: SimulationTrade[] = [];
  private detectionHistory: Array<{ source: string; count: number; timestamp: number }> = [];
  
  // Update intervals
  private metricsUpdateInterval: NodeJS.Timeout | null = null;
  private kpiUpdateInterval: NodeJS.Timeout | null = null;
  
  constructor(config: Partial<DashboardConfig> = {}) {
    super();
    
    this.config = {
      port: 3000,
      enableRealTimeUpdates: true,
      enableMetrics: true,
      enableAnalytics: true,
      updateInterval: 30000, // 30 seconds
      maxHistorySize: 1000,
      features: {
        portfolio: true,
        detection: true,
        trading: true,
        analytics: true,
        migration: true,
        kpi: true
      },
      ...config
    };
    
    this.metrics = {
      totalDetected: 0,
      totalTrades: 0,
      activePositions: 0,
      portfolioValue: 0,
      totalReturn: 0,
      winRate: 0,
      detectionRate: 0,
      apiCalls: 0,
      uptime: 0,
      errors: 0
    };
    
    this.kpiMetrics = {
      tokensDetected: 0,
      tokensAnalyzed: 0,
      successfulTrades: 0,
      portfolioGrowth: 0,
      detectionAccuracy: 0,
      systemHealth: 100
    };
    
    this.initializeExpress();
    this.setupSocketIO();
    this.setupRoutes();
    this.setupEventHandlers();
    
    logger.info('📊 Consolidated Dashboard initialized', {
      port: this.config.port,
      features: this.config.features
    });
  }

  private initializeExpress(): void {
    this.app = express();
    this.server = createServer(this.app);
    
    // Middleware
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../public')));
    
    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Error handling
    this.app.use((err: any, req: any, res: any, next: any) => {
      logger.error('Dashboard error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private setupSocketIO(): void {
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    this.io.on('connection', (socket) => {
      logger.info('👋 Client connected to dashboard');
      
      // Send initial data
      this.sendInitialData(socket);
      
      socket.on('disconnect', () => {
        logger.info('👋 Client disconnected from dashboard');
      });
      
      socket.on('subscribe', (channels: string[]) => {
        channels.forEach(channel => {
          socket.join(channel);
        });
      });
      
      socket.on('unsubscribe', (channels: string[]) => {
        channels.forEach(channel => {
          socket.leave(channel);
        });
      });
    });
  }

  private setupRoutes(): void {
    // Main dashboard route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
    });
    
    // API routes
    this.app.get('/api/portfolio', (req, res) => {
      res.json(this.getPortfolioData());
    });
    
    this.app.get('/api/positions', (req, res) => {
      res.json(this.getPositionsData());
    });
    
    this.app.get('/api/trades', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(this.getTradesData(limit));
    });
    
    this.app.get('/api/metrics', (req, res) => {
      res.json(this.metrics);
    });
    
    this.app.get('/api/kpi', (req, res) => {
      res.json(this.kpiMetrics);
    });
    
    this.app.get('/api/tracked-tokens', (req, res) => {
      res.json(Array.from(this.trackedTokens.values()));
    });
    
    this.app.get('/api/tracked-tokens/:address', (req, res) => {
      const token = this.trackedTokens.get(req.params.address);
      if (token) {
        res.json(token);
      } else {
        res.status(404).json({ error: 'Token not found' });
      }
    });
    
    this.app.get('/api/tracked-tokens/:address/history', (req, res) => {
      const token = this.trackedTokens.get(req.params.address);
      if (token) {
        res.json(token.priceHistory);
      } else {
        res.status(404).json({ error: 'Token not found' });
      }
    });
    
    this.app.get('/api/migrations', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(this.migrations.slice(-limit));
    });
    
    this.app.get('/api/migrations/stats', (req, res) => {
      res.json(this.getMigrationStats());
    });
    
    this.app.get('/api/detection/history', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100;
      res.json(this.detectionHistory.slice(-limit));
    });
    
    this.app.get('/api/system', (req, res) => {
      res.json({
        uptime: Date.now() - this.startTime,
        isRunning: this.isRunning,
        config: this.config,
        metrics: this.metrics,
        kpi: this.kpiMetrics
      });
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: Date.now() - this.startTime,
        timestamp: Date.now()
      });
    });
  }

  private setupEventHandlers(): void {
    // Detection events
    this.on('tokenDetected', (tokens: UnifiedTokenInfo[]) => {
      this.handleTokenDetection(tokens);
    });
    
    this.on('detectionResult', (result: any) => {
      this.handleDetectionResult(result);
    });
    
    // Trading events
    this.on('positionOpened', (position: SimulationPosition) => {
      this.handlePositionOpened(position);
    });
    
    this.on('positionClosed', (data: { position: SimulationPosition; realizedPnL: number; reason: string }) => {
      this.handlePositionClosed(data);
    });
    
    this.on('portfolioUpdated', (portfolio: Portfolio) => {
      this.handlePortfolioUpdate(portfolio);
    });
    
    // Price tracking events
    this.on('priceUpdate', (data: { token: UnifiedTokenInfo; price: number }) => {
      this.handlePriceUpdate(data);
    });
    
    // Migration events
    this.on('tokenMigration', (migration: Migration) => {
      this.handleTokenMigration(migration);
    });
    
    // KPI events
    this.on('kpiUpdate', (metrics: Partial<KPIMetrics>) => {
      this.handleKPIUpdate(metrics);
    });
  }

  private sendInitialData(socket: any): void {
    socket.emit('portfolio', this.getPortfolioData());
    socket.emit('positions', this.getPositionsData());
    socket.emit('trades', this.getTradesData(20));
    socket.emit('metrics', this.metrics);
    socket.emit('kpi', this.kpiMetrics);
    socket.emit('trackedTokens', Array.from(this.trackedTokens.values()));
    socket.emit('migrations', this.migrations.slice(-20));
  }

  private handleTokenDetection(tokens: UnifiedTokenInfo[]): void {
    this.metrics.totalDetected += tokens.length;
    this.kpiMetrics.tokensDetected += tokens.length;
    
    // Add to detection history
    this.detectionHistory.push({
      source: tokens[0]?.source || 'unknown',
      count: tokens.length,
      timestamp: Date.now()
    });
    
    // Limit history size
    if (this.detectionHistory.length > this.config.maxHistorySize) {
      this.detectionHistory.shift();
    }
    
    // Add to tracked tokens
    tokens.forEach(token => {
      this.addTrackedToken(token);
    });
    
    // Emit to clients
    this.io.emit('tokensDetected', tokens);
    this.io.emit('metrics', this.metrics);
  }

  private handleDetectionResult(result: any): void {
    const tokenCount = result.detectedCount || 0;
    const source = result.source || 'unknown';
    
    // Only emit meaningful results
    if (tokenCount > 0 || result.processingTime > 0) {
      this.io.emit('detectionResult', result);
    }
  }

  private handlePositionOpened(position: SimulationPosition): void {
    this.metrics.activePositions++;
    this.io.emit('positionOpened', position);
    this.io.emit('metrics', this.metrics);
  }

  private handlePositionClosed(data: { position: SimulationPosition; realizedPnL: number; reason: string }): void {
    this.metrics.activePositions--;
    this.metrics.totalTrades++;
    
    if (data.realizedPnL > 0) {
      this.kpiMetrics.successfulTrades++;
    }
    
    // Add to recent trades
    const trade: SimulationTrade = {
      id: data.position.id,
      token: data.position.token,
      action: 'SELL',
      entryPrice: data.position.entryPrice,
      exitPrice: data.position.currentPrice,
      entryTime: data.position.entryTime,
      exitTime: Date.now(),
      amount: data.position.amount,
      solAmount: data.position.solAmount,
      realizedPnL: data.realizedPnL,
      percentageChange: data.position.percentageChange,
      reason: data.reason,
      strategy: data.position.strategy,
      confidence: data.position.confidence
    };
    
    this.recentTrades.push(trade);
    if (this.recentTrades.length > this.config.maxHistorySize) {
      this.recentTrades.shift();
    }
    
    this.io.emit('positionClosed', data);
    this.io.emit('trade', trade);
    this.io.emit('metrics', this.metrics);
  }

  private handlePortfolioUpdate(portfolio: Portfolio): void {
    this.metrics.portfolioValue = portfolio.totalValue;
    this.metrics.totalReturn = portfolio.netPnL;
    this.kpiMetrics.portfolioGrowth = ((portfolio.totalValue - 10) / 10) * 100; // Assuming 10 SOL starting balance
    
    this.io.emit('portfolio', portfolio);
    this.io.emit('metrics', this.metrics);
  }

  private handlePriceUpdate(data: { token: UnifiedTokenInfo; price: number }): void {
    const trackedToken = this.trackedTokens.get(data.token.address);
    if (trackedToken) {
      trackedToken.price = data.price;
      trackedToken.priceHistory.push({
        price: data.price,
        timestamp: Date.now()
      });
      
      // Limit price history
      if (trackedToken.priceHistory.length > 100) {
        trackedToken.priceHistory.shift();
      }
      
      this.io.emit('priceUpdate', {
        address: data.token.address,
        price: data.price,
        token: trackedToken
      });
    }
  }

  private handleTokenMigration(migration: Migration): void {
    this.migrations.push(migration);
    if (this.migrations.length > this.config.maxHistorySize) {
      this.migrations.shift();
    }
    
    this.io.emit('tokenMigration', migration);
  }

  private handleKPIUpdate(metrics: Partial<KPIMetrics>): void {
    this.kpiMetrics = { ...this.kpiMetrics, ...metrics };
    this.io.emit('kpiUpdate', this.kpiMetrics);
  }

  private addTrackedToken(token: UnifiedTokenInfo): void {
    if (!this.trackedTokens.has(token.address)) {
      const trackedToken: TrackedToken = {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        price: token.metadata?.priceUsd || 0,
        priceHistory: [],
        volume24h: token.metadata?.volume24h || 0,
        liquidity: token.liquidity?.usd || 0,
        isActive: true,
        trackedSince: Date.now(),
        alerts: []
      };
      
      this.trackedTokens.set(token.address, trackedToken);
      this.io.emit('tokenAdded', trackedToken);
    }
  }

  private getPortfolioData(): any {
    return {
      balance: this.metrics.portfolioValue,
      totalInvested: 0, // Will be updated by simulation engine
      totalRealized: 0, // Will be updated by simulation engine
      unrealizedPnL: 0, // Will be updated by simulation engine
      netPnL: this.metrics.totalReturn,
      totalValue: this.metrics.portfolioValue
    };
  }

  private getPositionsData(): any {
    return {
      active: this.metrics.activePositions,
      positions: [] // Will be updated by simulation engine
    };
  }

  private getTradesData(limit: number): any {
    return {
      total: this.metrics.totalTrades,
      recent: this.recentTrades.slice(-limit)
    };
  }

  private getMigrationStats(): any {
    const recentMigrations = this.migrations.slice(-100);
    const totalMigrations = recentMigrations.length;
    const uniqueTokens = new Set(recentMigrations.map(m => m.token.address)).size;
    
    return {
      totalMigrations,
      uniqueTokens,
      averageLiquidityChange: totalMigrations > 0 ? 
        recentMigrations.reduce((sum, m) => sum + m.liquidityChange, 0) / totalMigrations : 0,
      averagePriceImpact: totalMigrations > 0 ? 
        recentMigrations.reduce((sum, m) => sum + m.priceImpact, 0) / totalMigrations : 0
    };
  }

  private startMetricsUpdates(): void {
    if (!this.config.enableMetrics) return;
    
    this.metricsUpdateInterval = setInterval(() => {
      this.updateMetrics();
    }, this.config.updateInterval);
  }

  private startKPIUpdates(): void {
    if (!this.config.enableAnalytics) return;
    
    this.kpiUpdateInterval = setInterval(() => {
      this.updateKPIMetrics();
    }, this.config.updateInterval);
  }

  private updateMetrics(): void {
    this.metrics.uptime = Date.now() - this.startTime;
    
    // Calculate detection rate (tokens per minute)
    const recentDetections = this.detectionHistory.filter(
      d => Date.now() - d.timestamp < 60000 // Last minute
    );
    this.metrics.detectionRate = recentDetections.reduce((sum, d) => sum + d.count, 0);
    
    // Calculate win rate
    const recentTrades = this.recentTrades.slice(-100);
    const winningTrades = recentTrades.filter(t => t.realizedPnL > 0).length;
    this.metrics.winRate = recentTrades.length > 0 ? (winningTrades / recentTrades.length) * 100 : 0;
    
    this.io.emit('metrics', this.metrics);
  }

  private updateKPIMetrics(): void {
    // Calculate detection accuracy
    const totalAnalyzed = this.kpiMetrics.tokensAnalyzed;
    const successful = this.kpiMetrics.successfulTrades;
    this.kpiMetrics.detectionAccuracy = totalAnalyzed > 0 ? (successful / totalAnalyzed) * 100 : 0;
    
    // Calculate system health
    const errorRate = this.metrics.errors / Math.max(this.metrics.totalTrades, 1);
    this.kpiMetrics.systemHealth = Math.max(0, 100 - (errorRate * 100));
    
    this.io.emit('kpiUpdate', this.kpiMetrics);
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    const net = require('net');
    
    const isPortAvailable = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
          server.close(() => resolve(true));
        });
        server.on('error', () => resolve(false));
      });
    };

    for (let port = startPort; port < startPort + 100; port++) {
      if (await isPortAvailable(port)) {
        if (port !== startPort) {
          logger.warn(`Port ${startPort} unavailable, using port ${port} instead`);
        }
        return port;
      }
    }
    
    throw new Error(`No available ports found starting from ${startPort}`);
  }

  async start(): Promise<void> {
    if (this.dashboardRunning) {
      logger.warn('Dashboard already running');
      return;
    }
    
    // Find available port
    const availablePort = await this.findAvailablePort(this.config.port);
    this.config.port = availablePort;
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, () => {
        this.dashboardRunning = true;
        
        if (this.config.enableMetrics) {
          this.startMetricsUpdates();
        }
        
        if (this.config.enableAnalytics) {
          this.startKPIUpdates();
        }
        
        this.emit('started');
        logger.info(`📊 Dashboard started on port ${this.config.port}`);
        logger.info(`🌐 Dashboard URL: http://localhost:${this.config.port}`);
        resolve();
      });
      
      this.server.on('error', (error: any) => {
        logger.error('Dashboard server error:', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.dashboardRunning) {
      return;
    }
    
    return new Promise((resolve) => {
      if (this.metricsUpdateInterval) {
        clearInterval(this.metricsUpdateInterval);
        this.metricsUpdateInterval = null;
      }
      
      if (this.kpiUpdateInterval) {
        clearInterval(this.kpiUpdateInterval);
        this.kpiUpdateInterval = null;
      }
      
      this.server.close(() => {
        this.dashboardRunning = false;
        this.emit('stopped');
        logger.info('📊 Dashboard stopped');
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.dashboardRunning;
  }

  getConfig(): DashboardConfig {
    return { ...this.config };
  }

  getMetrics(): DashboardMetrics {
    return { ...this.metrics };
  }

  getKPIMetrics(): KPIMetrics {
    return { ...this.kpiMetrics };
  }

  // API for external systems to update metrics
  updateMetric(key: keyof DashboardMetrics, value: number): void {
    this.metrics[key] = value;
    this.io.emit('metricUpdate', { key, value });
  }

  incrementMetric(key: keyof DashboardMetrics, amount: number = 1): void {
    this.metrics[key] = (this.metrics[key] as number) + amount;
    this.io.emit('metricUpdate', { key, value: this.metrics[key] });
  }

  addError(error: string): void {
    this.metrics.errors++;
    this.io.emit('error', { message: error, timestamp: Date.now() });
  }
}