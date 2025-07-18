import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { EventEmitter } from 'events';
import { Config } from '../core/config';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';
import { getIframeRPCService } from '../core/iframe-rpc-service';
import { getDexScreenerTokenService } from '../core/dexscreener-token-service';
import { TokenPriceTracker } from './token-price-tracker';
import { MigrationMonitor } from './migration-monitor';
import { KPITracker } from './kpi-tracker';

export class EducationalDashboard extends EventEmitter {
  private app: express.Application;
  private server: any;
  private io: Server;
  private config: Config;
  private analyzer: any; // RealDataTokenAnalyzer instance
  private lastRPCData: any = null;
  private dexScreenerTokens: any[] = [];

  constructor(
    private simulationEngine: EventEmittingSimulationEngine, 
    private priceTracker?: TokenPriceTracker,
    private migrationMonitor?: MigrationMonitor,
    private kpiTracker?: KPITracker,
    analyzer?: any
  ) {
    super();
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
      try {
        res.json(this.simulationEngine.getPortfolioStats?.() || {
          currentBalance: 10,
          totalInvested: 0,
          totalRealized: 0,
          unrealizedPnL: 0,
          totalPortfolioValue: 10,
          startingBalance: 10,
          totalROI: 0
        });
      } catch (error) {
        console.warn('Error getting portfolio stats:', error);
        res.json({
          currentBalance: 10,
          totalInvested: 0,
          totalRealized: 0,
          unrealizedPnL: 0,
          totalPortfolioValue: 10,
          startingBalance: 10,
          totalROI: 0
        });
      }
    });

    // Active positions
    this.app.get('/api/positions', (req, res) => {
      res.json(this.simulationEngine.getActivePositions?.() || []);
    });

    // All positions
    this.app.get('/api/positions/all', (req, res) => {
      res.json(this.simulationEngine.getPositions?.() || []);
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
        // console.log('📡 Received RPC data from iframe:', rpcData);
        
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
        // console.log(`🔍 Received ${tokens.length} tokens from DexScreener iframe`);
        
        // Process and store the tokens
        this.processDexScreenerTokens(tokens, timestamp);
        
        res.json({ success: true, processed: tokens.length });
      } catch (error) {
        console.error('❌ Error processing DexScreener tokens:', error);
        res.status(500).json({ error: 'Failed to process DexScreener tokens' });
      }
    });

    // Tracked tokens API endpoints
    this.app.get('/api/tracked-tokens', (req, res) => {
      if (this.priceTracker) {
        res.json(this.priceTracker.getTrackedTokens());
      } else {
        res.json([]);
      }
    });

    this.app.get('/api/tracked-tokens/stats', (req, res) => {
      if (this.priceTracker) {
        res.json(this.priceTracker.getStats());
      } else {
        res.json({ totalTracked: 0, maxTracked: 0, isUpdateLoopRunning: false, updateInterval: 0, lastUpdate: 0 });
      }
    });

    this.app.get('/api/tracked-tokens/:address/history', (req, res) => {
      const { address } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      if (this.priceTracker) {
        res.json(this.priceTracker.getTokenHistory(address, limit));
      } else {
        res.json([]);
      }
    });

    // Migration monitoring API endpoints
    this.app.get('/api/migrations', (req, res) => {
      if (this.migrationMonitor) {
        res.json(this.migrationMonitor.getMigrations());
      } else {
        res.json([]);
      }
    });

    this.app.get('/api/migrations/stats', (req, res) => {
      if (this.migrationMonitor) {
        res.json(this.migrationMonitor.getMigrations());
      } else {
        res.json({ total: 0, last24h: 0, popularDexes: {}, avgPriceImpact: 0 });
      }
    });

    // KPI tracking API endpoints
    this.app.get('/api/kpi/metrics', (req, res) => {
      if (this.kpiTracker) {
        res.json(this.kpiTracker.getMetrics('tokensDetected'));
      } else {
        res.json({});
      }
    });

    this.app.get('/api/kpi/summary', (req, res) => {
      if (this.kpiTracker) {
        res.json(this.kpiTracker.getSummary());
      } else {
        res.json({
          tokensDetectedTotal: 0,
          tokensAnalyzedTotal: 0,
          tokensTrackedTotal: 0,
          successfulTradesTotal: 0,
          currentROI: 0,
          currentPortfolioValue: 0,
          currentActivePositions: 0,
          currentWinRate: 0,
          detectionRate: 0,
          analysisRate: 0
        });
      }
    });

    this.app.get('/api/kpi/:metric', (req, res) => {
      const { metric } = req.params;
      const { minutes } = req.query;
      
      if (this.kpiTracker) {
        if (minutes) {
          res.json(this.kpiTracker.getMetrics(metric as any));
        } else {
          res.json(this.kpiTracker.getMetrics(metric as any));
        }
      } else {
        res.json([]);
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

      // Send initial data with error handling
      try {
        socket.emit('portfolio', this.simulationEngine.getPortfolioStats?.() || {
          currentBalance: 10,
          totalInvested: 0,
          totalRealized: 0,
          unrealizedPnL: 0,
          totalPortfolioValue: 10,
          startingBalance: 10,
          totalROI: 0
        });
        socket.emit('positions', this.simulationEngine.getActivePositions?.() || []);
        socket.emit('recentTrades', this.simulationEngine.getRecentTrades?.(10) || []);
      } catch (error) {
        console.warn('Error emitting initial data:', error);
      }
      
      // Send initial token data if analyzer is available
      if (this.analyzer) {
        try {
          if (this.analyzer.getFoundTokens) {
            socket.emit('foundTokens', this.analyzer.getFoundTokens());
          }
          if (this.analyzer.getAnalyzedTokens) {
            socket.emit('analyzedTokens', this.analyzer.getAnalyzedTokens());
          }
        } catch (error) {
          console.warn('Could not send initial token data:', error);
        }
      }
      
      // Send tracked tokens if available
      if (this.priceTracker) {
        socket.emit('trackedTokens', this.priceTracker.getTrackedTokens());
      }

      socket.on('disconnect', () => {
        console.log('📊 Dashboard client disconnected');
      });

      // Handle client requests
      socket.on('requestPortfolio', () => {
        try {
          socket.emit('portfolio', this.simulationEngine.getPortfolioStats?.() || {
            currentBalance: 10,
            totalInvested: 0,
            totalRealized: 0,
            unrealizedPnL: 0,
            totalPortfolioValue: 10,
            startingBalance: 10,
            totalROI: 0
          });
        } catch (error) {
          console.warn('Error emitting portfolio stats:', error);
        }
      });
      
      // Emit live price updates for tokens
      const emitLiveTokenData = () => {
        try {
          if (this.analyzer && this.analyzer.getFoundTokens) {
            const foundTokens = this.analyzer.getFoundTokens();
            if (foundTokens.length > 0) {
              socket.emit('foundTokens', foundTokens);
            }
          }
          
          if (this.analyzer && this.analyzer.getAnalyzedTokens) {
            const analyzedTokens = this.analyzer.getAnalyzedTokens();
            if (analyzedTokens.length > 0) {
              socket.emit('analyzedTokens', analyzedTokens);
            }
          }
        } catch (error) {
          console.warn('Could not emit live token data:', error);
        }
      };
      
      // Emit live data every 5 seconds
      const liveDataInterval = setInterval(emitLiveTokenData, 5000);
      
      // Also emit portfolio updates periodically
      const portfolioInterval = setInterval(() => {
        try {
          socket.emit('portfolio', this.simulationEngine.getPortfolioStats?.() || {
            currentBalance: 10,
            totalInvested: 0,
            totalRealized: 0,
            unrealizedPnL: 0,
            totalPortfolioValue: 10,
            startingBalance: 10,
            totalROI: 0
          });
          socket.emit('positions', this.simulationEngine.getActivePositions?.() || []);
          socket.emit('recentTrades', this.simulationEngine.getRecentTrades?.(10) || []);
        } catch (error) {
          console.warn('Error emitting periodic portfolio updates:', error);
        }
      }, 3000); // Every 3 seconds
      
      socket.on('disconnect', () => {
        clearInterval(liveDataInterval);
        clearInterval(portfolioInterval);
      });

      socket.on('requestPositions', () => {
        socket.emit('positions', this.simulationEngine.getActivePositions?.() || []);
      });
      
      socket.on('requestTokenData', () => {
        if (this.analyzer) {
          try {
            if (this.analyzer.getFoundTokens) {
              socket.emit('foundTokens', this.analyzer.getFoundTokens());
            }
            if (this.analyzer.getAnalyzedTokens) {
              socket.emit('analyzedTokens', this.analyzer.getAnalyzedTokens());
            }
          } catch (error) {
            console.warn('Could not send token data:', error);
          }
        }
        
        if (this.priceTracker) {
          socket.emit('trackedTokens', this.priceTracker.getTrackedTokens());
        }
      });
    });
  }

  private setupEventListeners(): void {
    // Listen to simulation engine events
    this.simulationEngine.on('trade', (trade) => {
      this.io.emit('newTrade', trade);
      // Emit updated positions after trade
      this.io.emit('positions', this.simulationEngine.getActivePositions?.() || []);
    });

    this.simulationEngine.on('positionOpened', (position) => {
      this.io.emit('positionOpened', position);
      this.io.emit('positions', this.simulationEngine.getActivePositions?.() || []);
    });

    this.simulationEngine.on('positionClosed', (position) => {
      this.io.emit('positionClosed', position);
      this.io.emit('positions', this.simulationEngine.getActivePositions?.() || []);
    });

    this.simulationEngine.on('portfolioUpdate', (stats) => {
      this.io.emit('portfolio', stats);
    });
    
    // Listen for token analysis events
    this.simulationEngine.on('tokenSkipped', (skipInfo) => {
      // Emit token analysis update
      this.io.emit('tokenAnalyzed', {
        mint: skipInfo.mint,
        symbol: skipInfo.symbol,
        action: 'SKIP',
        reason: skipInfo.reason
      });
    });

    // Listen for detector events forwarded from main app
    this.on('newTokensDetected', (tokens: any[]) => {
      console.log(`📡 Dashboard received ${tokens.length} new tokens from detector`);
      this.io.emit('newTokensDetected', tokens);
      
      // Convert to foundTokens format for dashboard
      const foundTokens = tokens.map((token: any) => ({
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        price: token.metadata?.priceUsd || 0,
        liquidity: token.liquidity?.usd || 0,
        source: token.source,
        detectedAt: Date.now()
      }));
      
      this.io.emit('foundTokens', foundTokens);
    });

    this.on('detectionResult', (result) => {
      // Calculate token count from available data
      const tokenCount = result.tokens?.length || 
                        result.filteredCount || 
                        (result.token ? 1 : 0) || 
                        0;
      
      // Only log if there's meaningful data and avoid spam
      if (tokenCount > 0 || (result.processingTime && result.processingTime > 0)) {
        console.log(`📊 Detection result: ${tokenCount} tokens detected from ${result.source} (${result.processingTime || 0}ms)`);
      }
      
      // Enhanced result with computed values
      const enhancedResult = {
        ...result,
        detectedCount: tokenCount,
        hasTokens: tokenCount > 0,
        timestamp: result.timestamp || Date.now()
      };
      
      this.io.emit('detectionResult', enhancedResult);
    });

    // Listen to price tracker events
    if (this.priceTracker) {
      this.priceTracker.on('tokenAdded', (token) => {
        this.io.emit('tokenAdded', token);
        this.io.emit('trackedTokens', this.priceTracker!.getTrackedTokens());
      });

      this.priceTracker.on('tokenRemoved', (token) => {
        this.io.emit('tokenRemoved', token);
        this.io.emit('trackedTokens', this.priceTracker!.getTrackedTokens());
      });

      this.priceTracker.on('priceUpdate', (data) => {
        this.io.emit('priceUpdate', data);
        // Also emit updated tracked tokens list
        this.io.emit('trackedTokens', this.priceTracker!.getTrackedTokens());
      });

      this.priceTracker.on('significantPriceChange', (data) => {
        this.io.emit('significantPriceChange', data);
      });

      this.priceTracker.on('tokenLost', (token) => {
        this.io.emit('tokenLost', token);
        // Emit updated tracked tokens list
        this.io.emit('trackedTokens', this.priceTracker!.getTrackedTokens());
      });
    }

    // Listen to migration monitor events
    if (this.migrationMonitor) {
      this.migrationMonitor.on('migration', (migrationEvent) => {
        this.io.emit('migration', migrationEvent);
      });

      this.migrationMonitor.on('liquidityShift', (data) => {
        this.io.emit('liquidityShift', data);
      });

      this.migrationMonitor.on('tokenLost', (data) => {
        this.io.emit('tokenLost', data);
      });
    }

    // Listen to KPI tracker events
    if (this.kpiTracker) {
      this.kpiTracker.on('kpiUpdate', (data) => {
        this.io.emit('kpiUpdate', data);
      });

      this.kpiTracker.on('reset', () => {
        this.io.emit('kpiReset');
      });
    }
  }

  private processRPCData(rpcData: any): void {
    const iframeRPCService = getIframeRPCService();
    
    // Process different types of RPC responses
    if (rpcData && rpcData.result) {
      // Handle getLatestBlockhash response
      if (rpcData.result.value && rpcData.result.value.blockhash) {
        // console.log('📦 Latest blockhash:', rpcData.result.value.blockhash.slice(0, 8) + '...');
        
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
        // console.log('📋 Account info received');
        
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
        // console.log('📚 Program accounts received:', rpcData.result.length);
        
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

    // console.log(`📊 Processed ${tokens.length} tokens from DexScreener:`);
    // tokens.forEach((token, index) => {
    //   if (index < 5) { // Log first 5 tokens
    //     console.log(`  ${token.symbol}: ${token.address.slice(0, 8)}... (${token.age}s old, $${token.liquidity} liq)`);
    //   }
    // });

    // Store in DexScreener service
    dexScreenerService.storeTokens(tokens);

    // Emit to connected dashboards with price data
    this.io.emit('dexscreenerTokens', {
      tokens: this.dexScreenerTokens,
      count: tokens.length,
      timestamp: timestamp
    });

    // Convert to TokenInfo format FIRST to ensure proper price data
    const convertedTokens = tokens.map(token => this.convertDexScreenerToken(token));
    
    // Emit found tokens with price data for dashboard
    this.io.emit('newTokensFound', convertedTokens);
    
    // Emit analyzed tokens data for dashboard (with prices)
    const analyzedTokensData = convertedTokens.map(token => ({
      id: token.mint,
      symbol: token.symbol,
      name: token.name,
      price: token.metadata.priceUsd || 0,
      securityScore: Math.floor(Math.random() * 40) + 60,
      action: 'DETECTED',
      reason: 'Live price available from DexScreener',
      analyzedAt: Date.now(),
      createdAt: token.createdAt,
      liquidity: token.liquidity.usd || 0,
      dexId: token.metadata.dexId || token.source,
      isPump: false,
      source: token.source
    }));
    
    this.io.emit('analyzedTokens', analyzedTokensData);
    
    // If analyzer exists, process tokens through it
    if (this.analyzer && this.analyzer.processExternalTokens) {
      try {
        this.analyzer.processExternalTokens(tokens);
      } catch (error) {
        console.error('❌ Error processing tokens through analyzer:', error);
      }
    }
    
    // Process viable tokens through simulation engine IMMEDIATELY
    this.processViableTokens(convertedTokens);
  }

  private convertDexScreenerToken(dexToken: any): any {
    // Ensure we have valid price data from DexScreener
    const priceUsd = dexToken.priceUsd || dexToken.price || 0;
    const liquidityUsd = dexToken.liquidityUsd || dexToken.liquidity || 0;
    const volume24h = dexToken.volume24h || 0;
    
    console.log(`💰 Converting DexScreener token: ${dexToken.symbol} - Price: $${priceUsd} - Liquidity: $${liquidityUsd}`);
    
    return {
      mint: dexToken.address,
      symbol: dexToken.symbol,
      name: dexToken.name,
      decimals: 9, // Default for most SPL tokens
      supply: '1000000000000000000', // Default 1B tokens
      signature: `DEXSCREENER_${Date.now()}`,
      timestamp: Date.now(),
      createdAt: dexToken.pairCreatedAt || (Date.now() - (dexToken.age * 1000)),
      liquidity: {
        sol: liquidityUsd / 150, // Rough SOL conversion at $150/SOL
        usd: liquidityUsd
      },
      source: `DEXSCREENER_${dexToken.dexId || dexToken.source}`,
      metadata: {
        pairAge: dexToken.age,
        scrapedAt: Date.now(),
        price: priceUsd,
        priceUsd: priceUsd, // Ensure price is available
        volume24h: volume24h,
        liquidityUsd: liquidityUsd,
        dexId: dexToken.dexId,
        pairAddress: dexToken.pairAddress,
        priceChange24h: dexToken.priceChange24h || 0,
        trendingScore: dexToken.trendingScore || 0
      }
    };
  }

  private async processViableTokens(tokens: any[]): Promise<void> {
    // Filter tokens that meet basic criteria - VERY PERMISSIVE for maximum trading in hybrid mode
    const viableTokens = tokens.filter(token => {
      const hasPrice = token.metadata?.priceUsd && token.metadata.priceUsd > 0;
      const hasLiquidity = token.liquidity && token.liquidity.usd >= 10;
      const isYoung = !token.metadata.pairAge || token.metadata.pairAge <= 7200; // 2 hours
      
      console.log(`🔍 Filtering token ${token.symbol}: Price=$${token.metadata?.priceUsd || 0}, Liquidity=$${token.liquidity?.usd || 0}, Age=${token.metadata?.pairAge || 0}s`);
      
      return hasPrice && hasLiquidity && isYoung;
    });

    console.log(`🎯 Found ${viableTokens.length} viable tokens for IMMEDIATE TRADING (hybrid mode)`);

    // Process each viable token through the simulation engine IMMEDIATELY
    for (const token of viableTokens) {
      try {
        console.log(`⚡ IMMEDIATE PROCESSING: ${token.symbol} with price $${token.metadata.priceUsd}`);
        
        // Create enhanced security analysis for iframe-sourced tokens
        // Higher scores to encourage more trading in hybrid mode
        const mockSecurityAnalysis = {
          overall: true,
          score: Math.floor(Math.random() * 40) + 60, // 60-100 score for maximum trades
          checks: [
            { name: 'DexScreener Liquidity', passed: true, score: 30, message: `$${token.liquidity.usd.toLocaleString()} liquidity` },
            { name: 'Live Price Available', passed: true, score: 30, message: `$${token.metadata.priceUsd} current price` },
            { name: 'Recent Token', passed: true, score: 20, message: 'Fresh opportunity' },
            { name: 'Hybrid Mode Boost', passed: true, score: 20, message: 'Ultra-aggressive trading mode' }
          ],
          warnings: []
        };

        // Emit status update for dashboard
        this.io.emit('tokenAnalyzed', {
          mint: token.mint,
          symbol: token.symbol,
          action: 'PROCESSING',
          reason: 'Live price available - immediate analysis'
        });

        // Process through simulation engine immediately for maximum trading activity
        await this.simulationEngine.processTokenDetection(token, mockSecurityAnalysis);
        
        console.log(`✅ PROCESSED: ${token.symbol} - ready for trading decision`);
        
      } catch (error) {
        console.error(`❌ Error processing token ${token.symbol}:`, error);
        
        // Emit error status
        this.io.emit('tokenAnalyzed', {
          mint: token.mint,
          symbol: token.symbol,
          action: 'ERROR',
          reason: 'Processing failed'
        });
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

// Export alias for backward compatibility
export { EducationalDashboard as Dashboard };