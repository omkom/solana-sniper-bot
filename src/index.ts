import { Config } from './core/config';
import { TokenMonitor } from './detection/token-monitor';
import { SecurityAnalyzer } from './analysis/security-analyzer';
import { DryRunEngine } from './simulation/dry-run-engine';
import { EducationalDashboard } from './monitoring/dashboard';
import { logger } from './monitoring/logger';
import { LogCleaner } from './utils/log-cleaner';
import { TokenInfo } from './types';
import { TokenPriceTracker } from './monitoring/token-price-tracker';
import { MigrationMonitor } from './monitoring/migration-monitor';
import { KPITracker } from './monitoring/kpi-tracker';

class EducationalTokenAnalyzer {
  private config: Config;
  private tokenMonitor: TokenMonitor;
  private securityAnalyzer: SecurityAnalyzer;
  private dryRunEngine: DryRunEngine;
  private dashboard: EducationalDashboard;
  private logCleaner: LogCleaner;
  private priceTracker: TokenPriceTracker;
  private migrationMonitor: MigrationMonitor;
  private kpiTracker: KPITracker;
  private isRunning: boolean = false;
  
  // Token tracking for dashboard display
  private foundTokens: Map<string, any> = new Map();
  private analyzedTokens: Map<string, any> = new Map();

  constructor() {
    console.log('🎓 Initializing Educational Token Analyzer');
    
    this.config = Config.getInstance();
    this.logCleaner = new LogCleaner();
    this.tokenMonitor = new TokenMonitor();
    this.securityAnalyzer = new SecurityAnalyzer();
    this.dryRunEngine = new DryRunEngine();
    this.priceTracker = new TokenPriceTracker();
    this.migrationMonitor = new MigrationMonitor();
    this.kpiTracker = new KPITracker();
    this.dashboard = new EducationalDashboard(this.dryRunEngine, this.priceTracker, this.migrationMonitor, this.kpiTracker, this);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Handle token detection
    this.tokenMonitor.on('tokenDetected', async (tokenInfo: TokenInfo) => {
      try {
        // Record token detection in KPI tracker
        this.kpiTracker.recordTokenDetected();
        
        logger.log('analysis', 'Token detected for analysis', {
          mint: tokenInfo.mint,
          symbol: tokenInfo.symbol,
          source: tokenInfo.source,
          timestamp: tokenInfo.timestamp
        });

        await this.analyzeToken(tokenInfo);
      } catch (error) {
        logger.error('Error analyzing detected token', { error, tokenInfo });
      }
    });

    // Handle price tracking events
    this.priceTracker.on('priceUpdate', (data) => {
      // Update KPI tracker with price change data
      this.kpiTracker.updateAvgPriceChange(data.priceChange);
    });

    this.priceTracker.on('tokenAdded', (token) => {
      // Record token being tracked
      this.kpiTracker.recordTokenTracked();
    });

    // Handle migration events
    this.migrationMonitor.on('migration', (migrationEvent) => {
      logger.info('Token migration detected', {
        symbol: migrationEvent.symbol,
        fromDex: migrationEvent.fromDex,
        toDex: migrationEvent.toDex
      });
    });

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down Educational Token Analyzer...');
      this.stop().then(() => {
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down Educational Token Analyzer...');
      this.stop().then(() => {
        process.exit(0);
      });
    });
  }

  private async analyzeToken(tokenInfo: TokenInfo): Promise<void> {
    // console.log(`\n🔍 Analyzing token: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    // console.log(`📡 Source: ${tokenInfo.source}`);
    // console.log(`⏰ Age: ${Math.round((Date.now() - tokenInfo.createdAt) / 1000)}s`);

    try {
      // Record token analysis in KPI tracker
      this.kpiTracker.recordTokenAnalyzed();
      
      // Track found token
      this.trackFoundToken(tokenInfo);
      
      // Step 1: Security Analysis
      const securityAnalysis = await this.securityAnalyzer.analyzeToken(tokenInfo);
      
      logger.log('analysis', 'Security analysis completed', {
        mint: tokenInfo.mint,
        score: securityAnalysis.score,
        passed: securityAnalysis.overall,
        warnings: securityAnalysis.warnings.length
      });

      // Step 2: Honeypot Check
      const isHoneypot = await this.securityAnalyzer.checkForHoneypot(tokenInfo);
      
      if (isHoneypot) {
        console.log('🍯 Honeypot detected - skipping token');
        logger.log('analysis', 'Token identified as potential honeypot', {
          mint: tokenInfo.mint,
          symbol: tokenInfo.symbol
        });
        return;
      }

      // Track analyzed token
      this.trackAnalyzedToken(tokenInfo, securityAnalysis);

      // Step 3: Process with dry run engine
      await this.dryRunEngine.processTokenDetection(tokenInfo, securityAnalysis);

      // Step 4: Add to price tracker if viable
      if (securityAnalysis.overall && securityAnalysis.score > 30) {
        // Convert TokenInfo to RealTokenInfo format for price tracking with realistic data
        const realTokenInfo = {
          chainId: 'solana',
          address: tokenInfo.mint,
          name: tokenInfo.name || 'Unknown Token',
          symbol: tokenInfo.symbol || 'UNKNOWN',
          priceUsd: tokenInfo.metadata?.price || Math.random() * 0.001 + 0.0001,
          priceNative: (tokenInfo.metadata?.price || 0.0001).toString(),
          volume24h: tokenInfo.metadata?.volume24h || tokenInfo.liquidity?.usd || 0,
          volume1h: (tokenInfo.metadata?.volume24h || 0) * 0.1, // Estimate 1h as 10% of 24h
          volume5m: (tokenInfo.metadata?.volume24h || 0) * 0.005, // Estimate 5m as 0.5% of 24h
          priceChange24h: tokenInfo.metadata?.priceChange24h || 0,
          priceChange1h: tokenInfo.metadata?.priceChange1h || 0,
          priceChange5m: tokenInfo.metadata?.priceChange5m || 0,
          liquidityUsd: tokenInfo.liquidity?.usd || 0,
          marketCap: tokenInfo.metadata?.marketCap || 0,
          fdv: tokenInfo.metadata?.marketCap || 0,
          txns24h: tokenInfo.metadata?.txns5m ? tokenInfo.metadata.txns5m * 288 : 0, // Estimate 24h
          txns1h: tokenInfo.metadata?.txns5m ? tokenInfo.metadata.txns5m * 12 : 0, // Estimate 1h
          txns5m: tokenInfo.metadata?.txns5m || 0,
          pairAddress: tokenInfo.mint,
          dexId: tokenInfo.metadata?.dexId || tokenInfo.source || 'unknown',
          pairCreatedAt: tokenInfo.createdAt,
          detected: true,
          detectedAt: Date.now(),
          trendingScore: tokenInfo.metadata?.trendingScore || 0
        };
        
        this.priceTracker.addToken(realTokenInfo);
      }

    } catch (error) {
      console.error('❌ Error during token analysis:', error);
      logger.error('Token analysis failed', {
        mint: tokenInfo.mint,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Analyzer is already running');
      return;
    }

    try {
      console.log('🚀 Starting Educational Token Analyzer...');
      
      // Clean logs on startup with more aggressive cleanup
      await this.logCleaner.cleanLogs(true);
      
      // Start dashboard first
      await this.dashboard.start();
      
      // Start token monitoring
      await this.tokenMonitor.start();
      
      // Start price update simulation
      this.startPriceUpdateSimulation();
      
      this.isRunning = true;
      
      logger.info('Educational Token Analyzer started successfully', {
        mode: 'DRY_RUN',
        educational: true
      });
      
      console.log('✅ Educational Token Analyzer is running');
      console.log('📊 Dashboard: http://localhost:3000');
      console.log('🎓 This is an educational simulation - no real trading occurs');
      
      // Generate some demo activity
      this.startDemoMode();
      
    } catch (error) {
      console.error('❌ Failed to start analyzer:', error);
      this.isRunning = false;
      throw error;
    }
  }

  private startPriceUpdateSimulation(): void {
    // Simulate realistic price updates for tracked tokens
    setInterval(() => {
      if (!this.isRunning) return;
      
      const trackedTokens = this.priceTracker.getTrackedTokens();
      trackedTokens.forEach(token => {
        // Simulate price change (±0.1% to ±5% per update)
        const changePercent = (Math.random() - 0.5) * 10; // -5% to +5%
        const newPrice = token.currentPrice * (1 + changePercent / 100);
        
        // Update price with realistic bounds
        const minPrice = token.initialPrice * 0.1; // Don't go below 10% of initial
        const maxPrice = token.initialPrice * 50; // Don't go above 5000% of initial
        const boundedPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
        
        // Emit price update event
        this.priceTracker.emit('priceUpdate', {
          address: token.address,
          symbol: token.symbol,
          oldPrice: token.currentPrice,
          newPrice: boundedPrice,
          change: changePercent,
          timestamp: Date.now()
        });
      });
    }, 5000); // Update every 5 seconds
  }

  private startDemoMode(): void {
    // Generate demo token detections for educational purposes with realistic price data
    console.log('🎮 Starting demo mode - generating simulated token detections with realistic prices');
    
    let demoCounter = 1;
    const demoInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(demoInterval);
        return;
      }

      // Create demo token with realistic pricing
      const basePrice = Math.random() * 0.001 + 0.0001; // $0.0001 to $0.0011
      const priceChange24h = (Math.random() - 0.5) * 200; // -100% to +100%
      const priceChange1h = (Math.random() - 0.5) * 50; // -25% to +25%
      const priceChange5m = (Math.random() - 0.5) * 20; // -10% to +10%
      
      const demoToken: TokenInfo = {
        mint: `DEMO_${Date.now()}_${demoCounter}`,
        symbol: `DEMO${demoCounter}`,
        name: `Demo Token ${demoCounter}`,
        decimals: 9,
        supply: '1000000000',
        signature: `demo_sig_${demoCounter}`,
        timestamp: Date.now(),
        source: 'demo',
        createdAt: Date.now() - Math.random() * 1800000, // 0-30 minutes ago
        metadata: {
          demo: true,
          educational: true,
          price: basePrice,
          priceChange24h: priceChange24h,
          priceChange1h: priceChange1h,
          priceChange5m: priceChange5m,
          volume24h: Math.random() * 50000 + 1000, // $1k-$51k
          marketCap: Math.random() * 1000000 + 10000, // $10k-$1M
          txns5m: Math.floor(Math.random() * 20) + 1, // 1-20 txns
          trendingScore: Math.floor(Math.random() * 100),
          dexId: ['raydium', 'orca', 'pumpfun', 'jupiter'][Math.floor(Math.random() * 4)]
        },
        liquidity: {
          sol: Math.random() * 20 + 5, // 5-25 SOL
          usd: Math.random() * 5000 + 1000  // $1k-$6k
        }
      };

      console.log(`🎯 Demo token detected: ${demoToken.symbol} ($${basePrice.toFixed(8)})`);
      this.tokenMonitor.emit('tokenDetected', demoToken);
      
      demoCounter++;
    }, 8000); // New demo token every 8 seconds for more activity
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    try {
      console.log('🛑 Stopping token monitor...');
      await this.tokenMonitor.stop();
      
      console.log('🛑 Stopping tracking services...');
      this.priceTracker.stop();
      this.migrationMonitor.stop();
      this.kpiTracker.stop();
      
      console.log('🛑 Stopping dashboard...');
      await this.dashboard.stop();
      
      logger.info('Educational Token Analyzer stopped');
      console.log('✅ Educational Token Analyzer stopped successfully');
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  private trackFoundToken(tokenInfo: TokenInfo): void {
    const foundToken = {
      id: tokenInfo.mint,
      name: tokenInfo.name || `Token ${tokenInfo.mint.slice(0, 8)}`,
      symbol: tokenInfo.symbol || 'UNK',
      price: tokenInfo.metadata?.price || 0,
      age: Math.floor((Date.now() - tokenInfo.createdAt) / 1000),
      liquidity: tokenInfo.liquidity?.usd || 0,
      volume24h: tokenInfo.metadata?.volume24h || 0,
      priceChange5m: tokenInfo.metadata?.priceChange5m || 0,
      trendingScore: tokenInfo.metadata?.trendingScore || 0,
      dexId: tokenInfo.metadata?.dexId || tokenInfo.source || 'unknown',
      foundAt: Date.now(),
      isPump: tokenInfo.source === 'pump_detector',
      source: tokenInfo.source
    };
    
    this.foundTokens.set(tokenInfo.mint, foundToken);
    
    // Keep only last 50 found tokens
    if (this.foundTokens.size > 50) {
      const oldestKey = Array.from(this.foundTokens.keys())[0];
      this.foundTokens.delete(oldestKey);
    }
  }

  private trackAnalyzedToken(tokenInfo: TokenInfo, securityAnalysis: any): void {
    const analyzedToken = {
      id: tokenInfo.mint,
      name: tokenInfo.name || `Token ${tokenInfo.mint.slice(0, 8)}`,
      symbol: tokenInfo.symbol || 'UNK',
      price: tokenInfo.metadata?.price || 0,
      age: Math.floor((Date.now() - tokenInfo.createdAt) / 1000),
      liquidity: tokenInfo.liquidity?.usd || 0,
      volume24h: tokenInfo.metadata?.volume24h || 0,
      priceChange5m: tokenInfo.metadata?.priceChange5m || 0,
      trendingScore: tokenInfo.metadata?.trendingScore || 0,
      dexId: tokenInfo.metadata?.dexId || tokenInfo.source || 'unknown',
      securityScore: securityAnalysis.score,
      action: securityAnalysis.overall ? 'BUY' : 'SKIP',
      analyzedAt: Date.now(),
      source: tokenInfo.source
    };
    
    this.analyzedTokens.set(tokenInfo.mint, analyzedToken);
    
    // Keep only last 50 analyzed tokens
    if (this.analyzedTokens.size > 50) {
      const oldestKey = Array.from(this.analyzedTokens.keys())[0];
      this.analyzedTokens.delete(oldestKey);
    }
  }

  getFoundTokens(): any[] {
    return Array.from(this.foundTokens.values()).sort((a, b) => b.foundAt - a.foundAt);
  }

  getAnalyzedTokens(): any[] {
    return Array.from(this.analyzedTokens.values()).sort((a, b) => b.analyzedAt - a.analyzedAt);
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      portfolio: this.dryRunEngine.getPortfolioStats(),
      activePositions: this.dryRunEngine.getActivePositions().length,
      totalTrades: this.dryRunEngine.getRecentTrades(1000).length,
      tokens: {
        found: this.foundTokens.size,
        analyzed: this.analyzedTokens.size
      }
    };
  }
}

// Main execution
async function main() {
  try {
    const analyzer = new EducationalTokenAnalyzer();
    await analyzer.start();
    
    // Keep the process running
    process.on('SIGINT', () => {
      analyzer.stop().then(() => process.exit(0));
    });
    
  } catch (error) {
    console.error('❌ Failed to start Educational Token Analyzer:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}

export { EducationalTokenAnalyzer };