import { Config } from './core/config';
import { TokenMonitor } from './detection/token-monitor';
import { SecurityAnalyzer } from './analysis/security-analyzer';
import { DryRunEngine } from './simulation/dry-run-engine';
import { EducationalDashboard } from './monitoring/dashboard';
import { logger } from './monitoring/logger';
import { LogCleaner } from './utils/log-cleaner';
import { TokenInfo } from './types';

class EducationalTokenAnalyzer {
  private config: Config;
  private tokenMonitor: TokenMonitor;
  private securityAnalyzer: SecurityAnalyzer;
  private dryRunEngine: DryRunEngine;
  private dashboard: EducationalDashboard;
  private logCleaner: LogCleaner;
  private isRunning: boolean = false;

  constructor() {
    console.log('🎓 Initializing Educational Token Analyzer');
    
    this.config = Config.getInstance();
    this.logCleaner = new LogCleaner();
    this.tokenMonitor = new TokenMonitor();
    this.securityAnalyzer = new SecurityAnalyzer();
    this.dryRunEngine = new DryRunEngine();
    this.dashboard = new EducationalDashboard(this.dryRunEngine);

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Handle token detection
    this.tokenMonitor.on('tokenDetected', async (tokenInfo: TokenInfo) => {
      try {
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
    console.log(`\n🔍 Analyzing token: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`📡 Source: ${tokenInfo.source}`);
    console.log(`⏰ Age: ${Math.round((Date.now() - tokenInfo.createdAt) / 1000)}s`);

    try {
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

      // Step 3: Process with dry run engine
      await this.dryRunEngine.processTokenDetection(tokenInfo, securityAnalysis);

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

  private startDemoMode(): void {
    // Generate demo token detections for educational purposes
    console.log('🎮 Starting demo mode - generating simulated token detections');
    
    let demoCounter = 1;
    const demoInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(demoInterval);
        return;
      }

      // Create demo token
      const demoToken: TokenInfo = {
        mint: `DEMO_${Date.now()}_${demoCounter}`,
        symbol: `DEMO${demoCounter}`,
        name: `Demo Token ${demoCounter}`,
        decimals: 9,
        supply: '1000000000',
        signature: `demo_sig_${demoCounter}`,
        timestamp: Date.now(),
        source: 'demo',
        createdAt: Date.now(),
        metadata: {
          demo: true,
          educational: true
        },
        liquidity: {
          sol: Math.random() * 10 + 0.5, // 0.5-10.5 SOL
          usd: Math.random() * 1000 + 50  // $50-1050
        }
      };

      console.log(`🎯 Demo token detected: ${demoToken.symbol}`);
      this.tokenMonitor.emit('tokenDetected', demoToken);
      
      demoCounter++;
    }, 15000); // New demo token every 15 seconds
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    try {
      console.log('🛑 Stopping token monitor...');
      await this.tokenMonitor.stop();
      
      console.log('🛑 Stopping dashboard...');
      await this.dashboard.stop();
      
      logger.info('Educational Token Analyzer stopped');
      console.log('✅ Educational Token Analyzer stopped successfully');
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      portfolio: this.dryRunEngine.getPortfolioStats(),
      activePositions: this.dryRunEngine.getActivePositions().length,
      totalTrades: this.dryRunEngine.getRecentTrades(1000).length
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