import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { Config } from '../core/config';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';
import { getIframeRPCService } from '../core/iframe-rpc-service';
import { getDexScreenerTokenService } from '../core/dexscreener-token-service';

export class EducationalDashboard {
  private app: express.Application;
  private server: any;
  private io: Server;
  private config: Config;
  private analyzer: any; // RealDataTokenAnalyzer instance
  private lastRPCData: any = null;
  private dexScreenerTokens: any[] = [];

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

    // RPC data endpoint for iframe communication
    this.app.post('/api/rpc-data', (req, res) => {
      try {
        const rpcData = req.body;
        console.log('📡 Received RPC data from iframe:', rpcData);
        
        // Store or process the RPC data
        this.processRPCData(rpcData);
        
        res.json({ success: true });
      } catch (error) {
        console.error('❌ Error processing RPC data:', error);
        res.status(500).json({ error: 'Failed to process RPC data' });
      }
    });

    // DexScreener tokens endpoint for iframe communication
    this.app.post('/api/dexscreener-tokens', (req, res) => {
      try {
        const { tokens, timestamp } = req.body;
        console.log(`🔍 Received ${tokens.length} tokens from DexScreener iframe`);
        
        // Process and store the tokens
        this.processDexScreenerTokens(tokens, timestamp);
        
        res.json({ success: true, processed: tokens.length });
      } catch (error) {
        console.error('❌ Error processing DexScreener tokens:', error);
        res.status(500).json({ error: 'Failed to process DexScreener tokens' });
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

  private processRPCData(rpcData: any): void {
    const iframeRPCService = getIframeRPCService();
    
    // Process different types of RPC responses
    if (rpcData && rpcData.result) {
      // Handle getLatestBlockhash response
      if (rpcData.result.value && rpcData.result.value.blockhash) {
        console.log('📦 Latest blockhash:', rpcData.result.value.blockhash.slice(0, 8) + '...');
        
        // Store in iframe RPC service
        iframeRPCService.storeIframeData('blockhash', rpcData.result.value);
        
        // Emit to connected dashboards
        this.io.emit('rpcData', {
          type: 'blockhash',
          data: rpcData.result.value,
          timestamp: Date.now()
        });
      }
      
      // Handle account info response
      if (rpcData.result.value && rpcData.result.value.data) {
        console.log('📋 Account info received');
        
        // Store in iframe RPC service with account-specific key
        const accountKey = `accountInfo_${rpcData.id || 'unknown'}`;
        iframeRPCService.storeIframeData(accountKey, rpcData.result.value);
        
        this.io.emit('rpcData', {
          type: 'accountInfo',
          data: rpcData.result.value,
          timestamp: Date.now()
        });
      }
      
      // Handle program accounts response
      if (Array.isArray(rpcData.result)) {
        console.log('📚 Program accounts received:', rpcData.result.length);
        
        // Store in iframe RPC service with program-specific key
        const programKey = `programAccounts_${rpcData.id || 'unknown'}`;
        iframeRPCService.storeIframeData(programKey, rpcData.result);
        
        this.io.emit('rpcData', {
          type: 'programAccounts',
          data: rpcData.result,
          timestamp: Date.now()
        });
      }
    }
    
    // Store latest RPC data for health monitoring
    this.lastRPCData = {
      data: rpcData,
      timestamp: Date.now()
    };
  }

  private processDexScreenerTokens(tokens: any[], timestamp: number): void {
    const dexScreenerService = getDexScreenerTokenService();
    
    // Store the tokens
    this.dexScreenerTokens = tokens.map(token => ({
      ...token,
      receivedAt: timestamp,
      processed: true
    }));

    console.log(`📊 Processed ${tokens.length} tokens from DexScreener:`);
    tokens.forEach((token, index) => {
      if (index < 5) { // Log first 5 tokens
        console.log(`  ${token.symbol}: ${token.address.slice(0, 8)}... (${token.age}s old, $${token.liquidity} liq)`);
      }
    });

    // Store in DexScreener service
    dexScreenerService.storeTokens(tokens);

    // Emit to connected dashboards
    this.io.emit('dexscreenerTokens', {
      tokens: this.dexScreenerTokens,
      count: tokens.length,
      timestamp: timestamp
    });

    // If analyzer exists, process tokens through it
    if (this.analyzer && this.analyzer.processExternalTokens) {
      try {
        this.analyzer.processExternalTokens(tokens);
      } catch (error) {
        console.error('❌ Error processing tokens through analyzer:', error);
      }
    }

    // Convert to TokenInfo format and emit for processing
    const convertedTokens = tokens.map(token => this.convertDexScreenerToken(token));
    this.io.emit('newTokensFound', convertedTokens);
    
    // Process viable tokens through simulation engine
    this.processViableTokens(convertedTokens);
  }

  private convertDexScreenerToken(dexToken: any): any {
    return {
      mint: dexToken.address,
      symbol: dexToken.symbol,
      name: dexToken.name,
      decimals: 9, // Default for most SPL tokens
      supply: '1000000000000000000', // Default 1B tokens
      signature: `DEXSCREENER_${Date.now()}`,
      timestamp: Date.now(),
      createdAt: Date.now() - (dexToken.age * 1000),
      liquidity: {
        sol: dexToken.liquidity / 150, // Rough SOL conversion
        usd: dexToken.liquidity
      },
      source: `DEXSCREENER_${dexToken.source}`,
      metadata: {
        pairAge: dexToken.age,
        scrapedAt: Date.now(),
        price: dexToken.price || 0,
        volume24h: dexToken.volume24h || 0
      }
    };
  }

  private async processViableTokens(tokens: any[]): Promise<void> {
    // Filter tokens that meet basic criteria
    const viableTokens = tokens.filter(token => {
      return token.liquidity && 
             token.liquidity.usd >= 30 && 
             token.metadata.pairAge <= 3600; // 1 hour max age
    });

    console.log(`🎯 Found ${viableTokens.length} viable tokens for analysis`);

    // Process each viable token through the simulation engine
    for (const token of viableTokens) {
      try {
        // Create mock security analysis for iframe-sourced tokens
        const mockSecurityAnalysis = {
          overall: true,
          score: Math.floor(Math.random() * 40) + 40, // 40-80 score
          checks: [
            { name: 'DexScreener Liquidity', passed: true, score: 25, message: 'Sufficient liquidity' },
            { name: 'Token Age', passed: true, score: 20, message: 'Recently created' },
            { name: 'Volume Check', passed: (token.metadata.volume24h || 0) > 0, score: 15, message: 'Has trading volume' }
          ],
          warnings: []
        };

        // Process through simulation engine
        await this.simulationEngine.processTokenDetection(token, mockSecurityAnalysis);
      } catch (error) {
        console.error(`❌ Error processing token ${token.symbol}:`, error);
      }
    }
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