import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { Config } from '../core/config';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';
import { EnhancedPriceTracker } from './enhanced-price-tracker';
import { MigrationMonitor } from './migration-monitor';
import { KPITracker } from './kpi-tracker';
import { EnhancedTokenDetection } from '../detection/enhanced-token-detection';
import { BlockchainTransactionAnalyzer } from '../core/blockchain-transaction-analyzer';
import { getApiGateway } from '../core/api-gateway';
import { logger } from './logger';

export class EnhancedDashboard {
  private app: express.Application;
  private server: any;
  private io: Server;
  private config: Config;
  private isRunning = false;
  
  // Enhanced components
  private enhancedPriceTracker?: EnhancedPriceTracker;
  private enhancedTokenDetection?: EnhancedTokenDetection;
  private blockchainAnalyzer?: BlockchainTransactionAnalyzer;
  private migrationMonitor?: MigrationMonitor;
  private kpiTracker?: KPITracker;
  private analyzer?: any;
  
  // Real-time data
  private connectedClients = new Set<string>();
  private lastSystemUpdate = Date.now();
  private metricsBuffer = new Map<string, any[]>();
  
  // Dashboard state
  private dashboardState = {
    tokens: {
      detected: [],
      tracking: [],
      alerts: []
    },
    portfolio: {
      balance: 10,
      positions: [],
      trades: [],
      performance: {}
    },
    system: {
      status: 'healthy',
      uptime: 0,
      connections: 0,
      performance: {}
    },
    analytics: {
      detection: {},
      trading: {},
      risk: {}
    }
  };

  constructor(
    private simulationEngine: EventEmittingSimulationEngine,
    enhancedPriceTracker?: EnhancedPriceTracker,
    migrationMonitor?: MigrationMonitor,
    kpiTracker?: KPITracker,
    enhancedTokenDetection?: EnhancedTokenDetection,
    blockchainAnalyzer?: BlockchainTransactionAnalyzer,
    analyzer?: any
  ) {
    this.config = Config.getInstance();
    this.enhancedPriceTracker = enhancedPriceTracker;
    this.migrationMonitor = migrationMonitor;
    this.kpiTracker = kpiTracker;
    this.enhancedTokenDetection = enhancedTokenDetection;
    this.blockchainAnalyzer = blockchainAnalyzer;
    this.analyzer = analyzer;
    
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: { origin: '*' },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventListeners();
    this.startMetricsCollection();
    
    logger.info('📊 Enhanced Dashboard initialized');
  }

  private setupRoutes(): void {
    // Serve static files
    this.app.use(express.static('public'));
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        mode: 'DRY_RUN',
        educational: true,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        components: {
          priceTracker: !!this.enhancedPriceTracker,
          tokenDetection: !!this.enhancedTokenDetection,
          blockchainAnalyzer: !!this.blockchainAnalyzer,
          migrationMonitor: !!this.migrationMonitor,
          kpiTracker: !!this.kpiTracker
        }
      });
    });

    // Enhanced Portfolio API
    this.app.get('/api/portfolio', (req, res) => {
      try {
        const portfolioStats = this.simulationEngine.getPortfolioStats?.() || this.getDefaultPortfolioStats();
        const enhancedStats = this.enhancePortfolioStats(portfolioStats);
        res.json(enhancedStats);
      } catch (error) {
        logger.error('Error getting portfolio stats:', error);
        res.json(this.getDefaultPortfolioStats());
      }
    });

    // Enhanced Positions API
    this.app.get('/api/positions', (req, res) => {
      const positions = this.simulationEngine.getActivePositions?.() || [];
      const enhancedPositions = positions.map(pos => this.enhancePositionData(pos));
      res.json(enhancedPositions);
    });

    // Enhanced Trades API
    this.app.get('/api/trades', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const trades = this.simulationEngine.getRecentTrades(limit);
      const enhancedTrades = trades.map(trade => this.enhanceTradeData(trade));
      res.json(enhancedTrades);
    });

    // Token Detection API
    this.app.get('/api/tokens/detected', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      const detectedTokens = this.enhancedTokenDetection?.getRecentTokens(limit) || [];
      res.json(detectedTokens);
    });

    // Price Tracking API
    this.app.get('/api/tokens/tracking', (req, res) => {
      const trackedTokens = this.enhancedPriceTracker?.getTrackedTokens() || [];
      res.json(trackedTokens);
    });

    // Token Details API
    this.app.get('/api/tokens/:mint', (req, res) => {
      const mint = req.params.mint;
      const token = this.enhancedPriceTracker?.getTrackedToken(mint);
      if (token) {
        res.json(token);
      } else {
        res.status(404).json({ error: 'Token not found' });
      }
    });

    // Token Price History API
    this.app.get('/api/tokens/:mint/history', (req, res) => {
      const mint = req.params.mint;
      const limit = parseInt(req.query.limit as string) || 100;
      const history = this.enhancedPriceTracker?.getTokenHistory(mint, limit) || [];
      res.json(history);
    });

    // Swap Availability API
    this.app.get('/api/tokens/:mint/swap', (req, res) => {
      const mint = req.params.mint;
      const token = this.enhancedPriceTracker?.getTrackedToken(mint);
      if (token) {
        res.json({
          mint,
          swapAvailability: token.swapAvailability,
          bestOption: this.enhancedPriceTracker?.getBestSwapOption(mint)
        });
      } else {
        res.status(404).json({ error: 'Token not found' });
      }
    });

    // Alerts API
    this.app.get('/api/alerts', (req, res) => {
      const alerts = this.getAllActiveAlerts();
      res.json(alerts);
    });

    this.app.post('/api/alerts', (req, res) => {
      const { mint, type, threshold } = req.body;
      if (!mint || !type || threshold === undefined) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }
      
      const alertId = this.enhancedPriceTracker?.addPriceAlert(mint, type, threshold);
      res.json({ alertId, message: 'Alert created successfully' });
    });

    this.app.delete('/api/alerts/:alertId', (req, res) => {
      const alertId = req.params.alertId;
      this.enhancedPriceTracker?.removePriceAlert(alertId);
      res.json({ message: 'Alert removed successfully' });
    });

    // System Statistics API
    this.app.get('/api/system/stats', (req, res) => {
      const stats = this.getSystemStats();
      res.json(stats);
    });

    // API Gateway Statistics
    this.app.get('/api/system/api-gateway', (req, res) => {
      const gatewayStats = getApiGateway().getStats();
      res.json(gatewayStats);
    });

    // Detection Statistics
    this.app.get('/api/system/detection', (req, res) => {
      const detectionStats = this.enhancedTokenDetection?.getStats() || {};
      res.json(detectionStats);
    });

    // Blockchain Analysis Statistics
    this.app.get('/api/system/blockchain', (req, res) => {
      const blockchainStats = this.blockchainAnalyzer?.getStats() || {};
      res.json(blockchainStats);
    });

    // Migration Monitor API
    this.app.get('/api/migrations', (req, res) => {
      const migrations = this.migrationMonitor?.getMigrations() || [];
      res.json(migrations);
    });

    this.app.get('/api/migrations/stats', (req, res) => {
      const stats = this.migrationMonitor?.getStats() || {};
      res.json(stats);
    });

    // KPI Tracking API
    this.app.get('/api/kpi/metrics', (req, res) => {
      const metrics = this.kpiTracker?.getAllMetrics() || {};
      res.json(metrics);
    });

    this.app.get('/api/kpi/summary', (req, res) => {
      const summary = this.kpiTracker?.getSummary() || {};
      res.json(summary);
    });

    // Real-time metrics API
    this.app.get('/api/metrics/:metric', (req, res) => {
      const metric = req.params.metric;
      const data = this.metricsBuffer.get(metric) || [];
      res.json(data);
    });

    // Search API
    this.app.get('/api/search', (req, res) => {
      const query = req.query.q as string;
      const results = this.searchTokens(query);
      res.json(results);
    });

    // Export API
    this.app.get('/api/export/:type', (req, res) => {
      const type = req.params.type;
      const data = this.exportData(type);
      res.json(data);
    });

    // Default route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket: Socket) => {
      const clientId = socket.id;
      this.connectedClients.add(clientId);
      
      logger.info(`📱 Client connected: ${clientId}`);
      
      // Send initial state
      socket.emit('initialState', this.dashboardState);
      
      // Handle client requests
      socket.on('requestData', (dataType: string) => {
        this.handleDataRequest(socket, dataType);
      });
      
      socket.on('subscribeToToken', (mint: string) => {
        socket.join(`token:${mint}`);
        logger.debug(`📡 Client subscribed to token: ${mint}`);
      });
      
      socket.on('unsubscribeFromToken', (mint: string) => {
        socket.leave(`token:${mint}`);
        logger.debug(`📡 Client unsubscribed from token: ${mint}`);
      });
      
      socket.on('disconnect', () => {
        this.connectedClients.delete(clientId);
        logger.info(`📱 Client disconnected: ${clientId}`);
      });
    });
  }

  private setupEventListeners(): void {
    // Enhanced Price Tracker Events
    if (this.enhancedPriceTracker) {
      this.enhancedPriceTracker.on('priceUpdate', (data) => {
        this.io.emit('priceUpdate', data);
        this.io.to(`token:${data.mint}`).emit('tokenPriceUpdate', data);
        this.updateMetricsBuffer('prices', data);
      });

      this.enhancedPriceTracker.on('alertTriggered', (data) => {
        this.io.emit('alertTriggered', data);
        this.io.to(`token:${data.mint}`).emit('tokenAlert', data);
        logger.info(`🚨 Alert triggered broadcast: ${data.symbol}`);
      });

      this.enhancedPriceTracker.on('swapAvailabilityUpdated', (data) => {
        this.io.to(`token:${data.mint}`).emit('swapAvailabilityUpdate', data);
      });
    }

    // Enhanced Token Detection Events
    if (this.enhancedTokenDetection) {
      this.enhancedTokenDetection.on('tokenDetected', (data) => {
        this.io.emit('tokenDetected', data);
        this.updateMetricsBuffer('detections', data);
        logger.info(`🔍 Token detection broadcast: ${data.token.symbol}`);
      });

      this.enhancedTokenDetection.on('started', () => {
        this.io.emit('detectionStarted');
      });

      this.enhancedTokenDetection.on('stopped', () => {
        this.io.emit('detectionStopped');
      });
    }

    // Blockchain Analyzer Events
    if (this.blockchainAnalyzer) {
      this.blockchainAnalyzer.on('analysisComplete', (data) => {
        this.io.emit('analysisComplete', data);
        this.updateMetricsBuffer('analysis', data);
      });

      this.blockchainAnalyzer.on('tokensDetected', (data) => {
        this.io.emit('blockchainTokensDetected', data);
      });
    }

    // Simulation Engine Events
    this.simulationEngine.on('trade', (trade) => {
      this.io.emit('newTrade', trade);
      this.updateMetricsBuffer('trades', trade);
    });

    this.simulationEngine.on('positionOpened', (position) => {
      this.io.emit('positionOpened', position);
      this.updateMetricsBuffer('positions', position);
    });

    this.simulationEngine.on('positionClosed', (position) => {
      this.io.emit('positionClosed', position);
      this.updateMetricsBuffer('positions', position);
    });

    this.simulationEngine.on('portfolioUpdate', (stats) => {
      this.io.emit('portfolioUpdate', stats);
      this.updateMetricsBuffer('portfolio', stats);
    });

    // Migration Monitor Events
    if (this.migrationMonitor) {
      this.migrationMonitor.on('migration', (migration) => {
        this.io.emit('migration', migration);
        this.updateMetricsBuffer('migrations', migration);
      });
    }

    // KPI Tracker Events
    if (this.kpiTracker) {
      this.kpiTracker.on('kpiUpdate', (data) => {
        this.io.emit('kpiUpdate', data);
        this.updateMetricsBuffer('kpis', data);
      });
    }
  }

  private handleDataRequest(socket: Socket, dataType: string): void {
    switch (dataType) {
      case 'portfolio':
        socket.emit('portfolioData', this.getPortfolioData());
        break;
      case 'positions':
        socket.emit('positionsData', this.getPositionsData());
        break;
      case 'trades':
        socket.emit('tradesData', this.getTradesData());
        break;
      case 'tokens':
        socket.emit('tokensData', this.getTokensData());
        break;
      case 'system':
        socket.emit('systemData', this.getSystemStats());
        break;
      case 'analytics':
        socket.emit('analyticsData', this.getAnalyticsData());
        break;
      default:
        socket.emit('error', { message: `Unknown data type: ${dataType}` });
    }
  }

  private startMetricsCollection(): void {
    // Collect system metrics every 5 seconds
    setInterval(() => {
      this.collectSystemMetrics();
      this.updateDashboardState();
      this.broadcastSystemUpdate();
    }, 5000);

    // Clean up old metrics every minute
    setInterval(() => {
      this.cleanupMetricsBuffer();
    }, 60000);
  }

  private collectSystemMetrics(): void {
    const metrics = {
      timestamp: Date.now(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      connections: this.connectedClients.size,
      trackedTokens: this.enhancedPriceTracker?.getTrackedTokens().length || 0,
      detectedTokens: this.enhancedTokenDetection?.getStats().totalDetected || 0,
      activePositions: this.simulationEngine.getActivePositions?.()?.length || 0,
      totalTrades: this.simulationEngine.getRecentTrades(1000).length || 0
    };

    this.updateMetricsBuffer('system', metrics);
  }

  private updateDashboardState(): void {
    this.dashboardState = {
      tokens: {
        detected: this.enhancedTokenDetection?.getRecentTokens(10) || [],
        tracking: this.enhancedPriceTracker?.getTrackedTokens().slice(0, 10) || [],
        alerts: this.getAllActiveAlerts().slice(0, 10)
      } as any,
      portfolio: this.getPortfolioData(),
      system: {
        status: 'healthy',
        uptime: process.uptime(),
        connections: this.connectedClients.size,
        performance: this.getPerformanceAnalytics()
      },
      analytics: this.getAnalyticsData()
    };
  }

  private broadcastSystemUpdate(): void {
    if (this.connectedClients.size > 0) {
      this.io.emit('systemUpdate', {
        timestamp: Date.now(),
        connections: this.connectedClients.size,
        system: this.dashboardState.system
      });
    }
  }

  private updateMetricsBuffer(type: string, data: any): void {
    if (!this.metricsBuffer.has(type)) {
      this.metricsBuffer.set(type, []);
    }

    const buffer = this.metricsBuffer.get(type)!;
    buffer.push({
      timestamp: Date.now(),
      data
    });

    // Keep only last 1000 entries
    if (buffer.length > 1000) {
      buffer.splice(0, buffer.length - 1000);
    }
  }

  private cleanupMetricsBuffer(): void {
    const cutoff = Date.now() - (60 * 60 * 1000); // 1 hour ago
    
    for (const [type, buffer] of this.metricsBuffer) {
      const filtered = buffer.filter(item => item.timestamp > cutoff);
      this.metricsBuffer.set(type, filtered);
    }
  }

  // Helper methods for data enhancement
  private enhancePortfolioStats(stats: any): any {
    return {
      ...stats,
      enhanced: true,
      riskMetrics: this.calculatePortfolioRisk(),
      diversification: this.calculateDiversification(),
      performance: this.calculatePerformanceMetrics(),
      timestamp: Date.now()
    };
  }

  private enhancePositionData(position: any): any {
    const trackedToken = this.enhancedPriceTracker?.getTrackedToken(position.mint);
    return {
      ...position,
      enhanced: true,
      currentPrice: trackedToken?.priceUsd || 0,
      technicalIndicators: trackedToken?.technicalIndicators,
      riskMetrics: trackedToken?.riskMetrics,
      swapAvailability: trackedToken?.swapAvailability || [],
      alerts: trackedToken?.alertsTriggered.slice(-5) || []
    };
  }

  private enhanceTradeData(trade: any): any {
    return {
      ...trade,
      enhanced: true,
      executedAt: trade.timestamp,
      priceAtExecution: trade.price || 0,
      marketConditions: this.getMarketConditionsAtTime(trade.timestamp)
    };
  }

  private getDefaultPortfolioStats(): any {
    return {
      currentBalance: 10,
      totalInvested: 0,
      totalRealized: 0,
      unrealizedPnL: 0,
      totalPortfolioValue: 10,
      startingBalance: 10,
      totalROI: 0,
      enhanced: false
    };
  }

  private getAllActiveAlerts(): any[] {
    const alerts: any[] = [];
    
    if (this.enhancedPriceTracker) {
      const trackedTokens = this.enhancedPriceTracker.getTrackedTokens();
      for (const token of trackedTokens) {
        alerts.push(...token.alertsTriggered.filter(alert => !alert.acknowledged));
      }
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  private getSystemStats(): any {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: this.connectedClients.size,
      components: {
        priceTracker: this.enhancedPriceTracker?.getStats(),
        tokenDetection: this.enhancedTokenDetection?.getStats(),
        blockchainAnalyzer: this.blockchainAnalyzer?.getStats(),
        migrationMonitor: this.migrationMonitor?.getStats(),
        kpiTracker: this.kpiTracker?.getAllMetrics(),
        apiGateway: getApiGateway().getStats()
      },
      performance: this.getPerformanceAnalytics()
    };
  }

  private getPortfolioData(): any {
    const stats = this.simulationEngine.getPortfolioStats?.() || this.getDefaultPortfolioStats();
    return this.enhancePortfolioStats(stats);
  }

  private getPositionsData(): any {
    const positions = this.simulationEngine.getActivePositions?.() || [];
    return positions.map(pos => this.enhancePositionData(pos));
  }

  private getTradesData(): any {
    const trades = this.simulationEngine.getRecentTrades(100);
    return trades.map(trade => this.enhanceTradeData(trade));
  }

  private getTokensData(): any {
    return {
      detected: this.enhancedTokenDetection?.getRecentTokens(50) || [],
      tracking: this.enhancedPriceTracker?.getTrackedTokens() || [],
      alerts: this.getAllActiveAlerts()
    };
  }

  private getAnalyticsData(): any {
    return {
      detection: this.enhancedTokenDetection?.getStats() || {},
      trading: this.getTradingAnalytics(),
      risk: this.getRiskAnalytics(),
      performance: this.getPerformanceAnalytics()
    };
  }

  private getTradingAnalytics(): any {
    const trades = this.simulationEngine.getRecentTrades(1000);
    const positions = this.simulationEngine.getActivePositions?.() || [];
    
    return {
      totalTrades: trades.length,
      successfulTrades: trades.filter(t => t.type === 'SELL' && (t.roi || 0) > 0).length,
      avgHoldTime: this.calculateAverageHoldTime(trades),
      avgROI: this.calculateAverageROI(trades),
      volumeByHour: this.calculateVolumeByHour(trades),
      activePositions: positions.length
    };
  }

  private getRiskAnalytics(): any {
    const tokens = this.enhancedPriceTracker?.getTrackedTokens() || [];
    const positions = this.simulationEngine.getActivePositions?.() || [];
    
    return {
      portfolioRisk: this.calculatePortfolioRisk(),
      diversification: this.calculateDiversification(),
      riskDistribution: this.calculateRiskDistribution(tokens),
      exposureByDex: this.calculateExposureByDex(positions),
      correlationMatrix: this.calculateCorrelationMatrix(tokens)
    };
  }

  private getPerformanceAnalytics(): any {
    const stats = this.simulationEngine.getPortfolioStats?.() || this.getDefaultPortfolioStats();
    
    return {
      totalROI: stats.totalROI,
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: this.calculateMaxDrawdown(),
      winRate: this.calculateWinRate(),
      profitFactor: this.calculateProfitFactor(),
      performanceByTimeframe: this.calculatePerformanceByTimeframe()
    };
  }

  private searchTokens(query: string): any[] {
    const results: any[] = [];
    
    if (this.enhancedPriceTracker) {
      const trackedTokens = this.enhancedPriceTracker.getTrackedTokens();
      results.push(...trackedTokens.filter(token => 
        token.symbol.toLowerCase().includes(query.toLowerCase()) ||
        token.name.toLowerCase().includes(query.toLowerCase()) ||
        token.mint.toLowerCase().includes(query.toLowerCase())
      ));
    }
    
    return results;
  }

  private exportData(type: string): any {
    switch (type) {
      case 'portfolio':
        return this.getPortfolioData();
      case 'trades':
        return this.getTradesData();
      case 'positions':
        return this.getPositionsData();
      case 'tokens':
        return this.getTokensData();
      case 'analytics':
        return this.getAnalyticsData();
      default:
        return { error: 'Unknown export type' };
    }
  }

  // Calculation helper methods
  private calculatePortfolioRisk(): number {
    const positions = this.simulationEngine.getActivePositions?.() || [];
    if (positions.length === 0) return 0;
    
    let totalRisk = 0;
    for (const position of positions) {
      const token = this.enhancedPriceTracker?.getTrackedToken(position.mint);
      if (token) {
        totalRisk += token.riskMetrics.overallRisk * position.simulatedInvestment;
      }
    }
    
    return totalRisk / positions.length;
  }

  private calculateDiversification(): any {
    const positions = this.simulationEngine.getActivePositions?.() || [];
    const dexDistribution = new Map<string, number>();
    
    for (const position of positions) {
      const token = this.enhancedPriceTracker?.getTrackedToken(position.mint);
      if (token && token.swapAvailability.length > 0) {
        const dex = token.swapAvailability[0].dexId;
        dexDistribution.set(dex, (dexDistribution.get(dex) || 0) + 1);
      }
    }
    
    return {
      positionCount: positions.length,
      dexDistribution: Object.fromEntries(dexDistribution),
      diversificationScore: this.calculateDiversificationScore(dexDistribution)
    };
  }

  private calculatePerformanceMetrics(): any {
    const stats = this.simulationEngine.getPortfolioStats?.() || this.getDefaultPortfolioStats();
    
    return {
      totalROI: stats.totalROI,
      dailyROI: this.calculateDailyROI(),
      volatility: this.calculateVolatility(),
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: this.calculateMaxDrawdown()
    };
  }

  private getMarketConditionsAtTime(timestamp: number): any {
    // Placeholder for market conditions
    return {
      marketSentiment: 'neutral',
      volatility: 'medium',
      liquidityConditions: 'good'
    };
  }

  private calculateAverageHoldTime(trades: any[]): number {
    const sellTrades = trades.filter(t => t.type === 'SELL');
    if (sellTrades.length === 0) return 0;
    
    const totalHoldTime = sellTrades.reduce((sum, trade) => sum + (trade.holdTime || 0), 0);
    return totalHoldTime / sellTrades.length;
  }

  private calculateAverageROI(trades: any[]): number {
    const sellTrades = trades.filter(t => t.type === 'SELL');
    if (sellTrades.length === 0) return 0;
    
    const totalROI = sellTrades.reduce((sum, trade) => sum + (trade.roi || 0), 0);
    return totalROI / sellTrades.length;
  }

  private calculateVolumeByHour(trades: any[]): any {
    const volumeByHour = new Map<number, number>();
    
    for (const trade of trades) {
      const hour = new Date(trade.timestamp).getHours();
      volumeByHour.set(hour, (volumeByHour.get(hour) || 0) + (trade.amount || 0));
    }
    
    return Object.fromEntries(volumeByHour);
  }

  private calculateRiskDistribution(tokens: any[]): any {
    const distribution = { very_low: 0, low: 0, medium: 0, high: 0, very_high: 0 };
    
    for (const token of tokens) {
      if (token.riskMetrics) {
        const level = token.riskMetrics.riskLevel as keyof typeof distribution;
        distribution[level]++;
      }
    }
    
    return distribution;
  }

  private calculateExposureByDex(positions: any[]): any {
    const exposure = new Map<string, number>();
    
    for (const position of positions) {
      const token = this.enhancedPriceTracker?.getTrackedToken(position.mint);
      if (token && token.swapAvailability.length > 0) {
        const dex = token.swapAvailability[0].dexId;
        exposure.set(dex, (exposure.get(dex) || 0) + position.amount);
      }
    }
    
    return Object.fromEntries(exposure);
  }

  private calculateCorrelationMatrix(tokens: any[]): any {
    // Simplified correlation calculation
    const correlations = new Map<string, Map<string, number>>();
    
    for (const token1 of tokens) {
      const token1Correlations = new Map<string, number>();
      for (const token2 of tokens) {
        if (token1.mint !== token2.mint) {
          const correlation = this.calculatePearsonCorrelation(
            token1.priceHistory.map((p: any) => p.price),
            token2.priceHistory.map((p: any) => p.price)
          );
          token1Correlations.set(token2.mint, correlation);
        }
      }
      correlations.set(token1.mint, token1Correlations);
    }
    
    return Object.fromEntries(
      Array.from(correlations.entries()).map(([mint, corrs]) => [
        mint,
        Object.fromEntries(corrs)
      ])
    );
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    
    const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
    const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
    const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateSharpeRatio(): number {
    // Placeholder calculation
    return 0;
  }

  private calculateMaxDrawdown(): number {
    // Placeholder calculation
    return 0;
  }

  private calculateWinRate(): number {
    const trades = this.simulationEngine.getRecentTrades(1000);
    const sellTrades = trades.filter(t => t.type === 'SELL');
    if (sellTrades.length === 0) return 0;
    
    const winners = sellTrades.filter(t => (t.roi || 0) > 0).length;
    return (winners / sellTrades.length) * 100;
  }

  private calculateProfitFactor(): number {
    const trades = this.simulationEngine.getRecentTrades(1000);
    const sellTrades = trades.filter(t => t.type === 'SELL');
    
    const grossProfit = sellTrades.filter(t => (t.roi || 0) > 0).reduce((sum, t) => sum + (t.roi || 0), 0);
    const grossLoss = Math.abs(sellTrades.filter(t => (t.roi || 0) < 0).reduce((sum, t) => sum + (t.roi || 0), 0));
    
    return grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
  }

  private calculatePerformanceByTimeframe(): any {
    // Placeholder for performance by timeframe
    return {
      '1h': 0,
      '24h': 0,
      '7d': 0,
      '30d': 0
    };
  }

  private calculateDailyROI(): number {
    // Placeholder calculation
    return 0;
  }

  private calculateVolatility(): number {
    // Placeholder calculation
    return 0;
  }

  private calculateDiversificationScore(dexDistribution: Map<string, number>): number {
    const totalPositions = Array.from(dexDistribution.values()).reduce((a, b) => a + b, 0);
    if (totalPositions === 0) return 0;
    
    let score = 0;
    for (const count of dexDistribution.values()) {
      const weight = count / totalPositions;
      score -= weight * Math.log(weight);
    }
    
    return score;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Enhanced dashboard already running');
      return;
    }

    const port = this.config.getDashboardPort() || 3000;
    
    return new Promise((resolve, reject) => {
      try {
        this.server.listen(port, () => {
          this.isRunning = true;
          logger.info(`📊 Enhanced Dashboard started on port ${port}`);
          logger.info(`🌐 Dashboard URL: http://localhost:${port}`);
          resolve();
        });
      } catch (error) {
        logger.error('Failed to start enhanced dashboard:', error);
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        logger.info('📊 Enhanced Dashboard stopped');
        resolve();
      });
    });
  }

  getConnectionCount(): number {
    return this.connectedClients.size;
  }

  isHealthy(): boolean {
    return this.isRunning && this.server.listening;
  }
}