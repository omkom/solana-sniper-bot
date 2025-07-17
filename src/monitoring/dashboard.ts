import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { Config } from '../core/config';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';

export class EducationalDashboard {
  private app: express.Application;
  private server: any;
  private io: Server;
  private config: Config;
  private analyzer: any; // RealDataTokenAnalyzer instance

  constructor(private simulationEngine: EventEmittingSimulationEngine, analyzer?: any) {
    this.config = Config.getInstance();
    this.analyzer = analyzer;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: { origin: '*' }
    });

    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventListeners();
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
        timestamp: new Date().toISOString()
      });
    });

    // Portfolio stats
    this.app.get('/api/portfolio', (req, res) => {
      res.json(this.simulationEngine.getPortfolioStats());
    });

    // Active positions
    this.app.get('/api/positions', (req, res) => {
      res.json(this.simulationEngine.getActivePositions());
    });

    // All positions
    this.app.get('/api/positions/all', (req, res) => {
      res.json(this.simulationEngine.getPositions());
    });

    // Recent trades
    this.app.get('/api/trades', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(this.simulationEngine.getRecentTrades(limit));
    });

    // System info
    this.app.get('/api/system', (req, res) => {
      res.json({
        mode: 'DRY_RUN',
        educational: true,
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        config: {
          maxPositions: this.config.getConfig().maxSimulatedPositions,
          simulatedInvestment: this.config.getConfig().simulatedInvestment,
          minConfidenceScore: this.config.getConfig().minConfidenceScore
        }
      });
    });

    // Found tokens endpoint
    this.app.get('/api/tokens/found', (req, res) => {
      if (this.analyzer && this.analyzer.getFoundTokens) {
        res.json(this.analyzer.getFoundTokens());
      } else {
        res.json([]);
      }
    });

    // Analyzed tokens endpoint
    this.app.get('/api/tokens/analyzed', (req, res) => {
      if (this.analyzer && this.analyzer.getAnalyzedTokens) {
        res.json(this.analyzer.getAnalyzedTokens());
      } else {
        res.json([]);
      }
    });

    // Token statistics endpoint
    this.app.get('/api/tokens/stats', (req, res) => {
      if (this.analyzer && this.analyzer.getStats) {
        const stats = this.analyzer.getStats();
        res.json({
          found: stats.tokens?.found || 0,
          analyzed: stats.tokens?.analyzed || 0,
          pumpDetection: stats.pumpDetection || {},
          monitoring: stats.monitoring || {}
        });
      } else {
        res.json({
          found: 0,
          analyzed: 0,
          pumpDetection: {},
          monitoring: {}
        });
      }
    });

    // Default route serves dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log('📊 Dashboard client connected');

      // Send initial data
      socket.emit('portfolio', this.simulationEngine.getPortfolioStats());
      socket.emit('positions', this.simulationEngine.getActivePositions());
      socket.emit('recentTrades', this.simulationEngine.getRecentTrades(10));

      socket.on('disconnect', () => {
        console.log('📊 Dashboard client disconnected');
      });

      // Handle client requests
      socket.on('requestPortfolio', () => {
        socket.emit('portfolio', this.simulationEngine.getPortfolioStats());
      });

      socket.on('requestPositions', () => {
        socket.emit('positions', this.simulationEngine.getActivePositions());
      });
    });
  }

  private setupEventListeners(): void {
    // Listen to simulation engine events
    this.simulationEngine.on('trade', (trade) => {
      this.io.emit('newTrade', trade);
    });

    this.simulationEngine.on('positionOpened', (position) => {
      this.io.emit('positionOpened', position);
      this.io.emit('positions', this.simulationEngine.getActivePositions());
    });

    this.simulationEngine.on('positionClosed', (position) => {
      this.io.emit('positionClosed', position);
      this.io.emit('positions', this.simulationEngine.getActivePositions());
    });

    this.simulationEngine.on('portfolioUpdate', (stats) => {
      this.io.emit('portfolio', stats);
    });
  }

  start(): Promise<void> {
    const port = this.config.getDashboardPort();
    
    return new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`🎓 Educational Dashboard running on http://localhost:${port}`);
        console.log('📚 This is a learning tool - no real trading occurs');
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('🛑 Dashboard stopped');
        resolve();
      });
    });
  }
}