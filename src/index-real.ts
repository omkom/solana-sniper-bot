import { Config } from './core/config';
import { RealTokenMonitor } from './detection/real-token-monitor';
import { SecurityAnalyzer } from './analysis/security-analyzer';
import { RealPriceSimulationEngine } from './simulation/real-price-engine';
import { EducationalDashboard } from './monitoring/dashboard';
import { PumpDetector, PumpSignal } from './detection/pump-detector';
import { logger } from './monitoring/logger';
import { TokenInfo } from './types';
import { LogCleaner } from './utils/log-cleaner';
import { PriceConverter } from './utils/price-converter';

class RealDataTokenAnalyzer {
  private config: Config;
  private realTokenMonitor: RealTokenMonitor;
  private securityAnalyzer: SecurityAnalyzer;
  private simulationEngine: RealPriceSimulationEngine;
  private dashboard: EducationalDashboard;
  private pumpDetector: PumpDetector;
  private logCleaner: LogCleaner;
  private priceConverter: PriceConverter;
  private isRunning: boolean = false;
  
  // Token tracking for dashboard
  private foundTokens: Map<string, any> = new Map();
  private analyzedTokens: Map<string, any> = new Map();

  constructor() {
    console.log('🎓 Initializing Real Data Educational Token Analyzer');
    
    this.config = Config.getInstance();
    this.logCleaner = new LogCleaner();
    this.priceConverter = new PriceConverter();
    this.realTokenMonitor = new RealTokenMonitor();
    this.securityAnalyzer = new SecurityAnalyzer();
    this.simulationEngine = new RealPriceSimulationEngine(this.realTokenMonitor);
    this.dashboard = new EducationalDashboard(this.simulationEngine, this);
    this.pumpDetector = new PumpDetector();

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Handle token detection from real market data
    this.realTokenMonitor.on('tokenDetected', async (tokenInfo: TokenInfo) => {
      try {
        logger.log('analysis', 'Real token detected for analysis', {
          mint: tokenInfo.mint,
          symbol: tokenInfo.symbol,
          source: tokenInfo.source,
          timestamp: tokenInfo.timestamp,
          liquidity: tokenInfo.liquidity
        });

        // Track found token
        this.trackFoundToken(tokenInfo);
        
        await this.analyzeRealToken(tokenInfo);
      } catch (error) {
        logger.error('Error analyzing real token', { error, tokenInfo });
      }
    });

    // Handle pump detection - HIGH PRIORITY
    this.pumpDetector.on('pumpDetected', async (tokenInfo: TokenInfo, pumpSignal: PumpSignal) => {
      try {
        console.log(`\n🚨 PUMP ALERT: Processing high-priority pump signal for ${tokenInfo.symbol}`);
        
        logger.log('analysis', 'Pump detected - high priority analysis', {
          mint: tokenInfo.mint,
          symbol: tokenInfo.symbol,
          pumpStrength: pumpSignal.pumpStrength,
          signals: pumpSignal.signals,
          source: 'pump_detector'
        });

        // Track found pump token
        this.trackFoundToken(tokenInfo, true);
        
        // Process pump with highest priority
        await this.analyzePumpToken(tokenInfo, pumpSignal);
      } catch (error) {
        logger.error('Error analyzing pump token', { error, tokenInfo, pumpSignal });
      }
    });

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down Real Data Token Analyzer...');
      this.stop().then(() => {
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Shutting down Real Data Token Analyzer...');
      this.stop().then(() => {
        process.exit(0);
      });
    });
  }

  private trackFoundToken(tokenInfo: TokenInfo, isPump: boolean = false): void {
    const realToken = this.realTokenMonitor.getTokenInfo(tokenInfo.mint);
    const ageInMinutes = tokenInfo.metadata?.ageMinutes || 0;
    
    const tokenData = {
      id: tokenInfo.mint,
      name: tokenInfo.name || tokenInfo.symbol || 'Unknown',
      symbol: tokenInfo.symbol || 'UNK',
      price: realToken?.priceUsd || 0,
      age: ageInMinutes,
      liquidity: realToken?.liquidityUsd || 0,
      volume24h: realToken?.volume24h || 0,
      priceChange5m: realToken?.priceChange5m || 0,
      trendingScore: realToken?.trendingScore || 0,
      dexId: realToken?.dexId || tokenInfo.source,
      foundAt: Date.now(),
      isPump: isPump,
      source: tokenInfo.source,
      pairAddress: realToken?.pairAddress
    };
    
    this.foundTokens.set(tokenInfo.mint, tokenData);
    
    // Keep only last 100 found tokens
    if (this.foundTokens.size > 100) {
      const firstKey = this.foundTokens.keys().next().value;
      if (firstKey) {
        this.foundTokens.delete(firstKey);
      }
    }
  }

  private async runPrestartApiTest(): Promise<void> {
    console.log('🧪 Testing DexScreener API calls with detailed logging...');
    
    try {
      // Test 1: Raw HTTP call to search endpoint
      console.log('\n📡 TEST 1: Direct API call to search endpoint');
      const axios = require('axios');
      const url = 'https://api.dexscreener.com/latest/dex/search';
      
      console.log(`🔗 URL: ${url}`);
      console.log('📤 Making HTTP GET request...');
      
      const startTime = Date.now();
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Educational-Token-Analyzer/1.0',
          'Accept': 'application/json'
        }
      });
      const responseTime = Date.now() - startTime;
      
      console.log(`✅ Response received in ${responseTime}ms`);
      console.log(`📊 Status: ${response.status} ${response.statusText}`);
      console.log('📋 Response Headers:', JSON.stringify(response.headers, null, 2));
      console.log(`📦 Response Size: ${JSON.stringify(response.data).length} characters`);
      
      if (response.data) {
        console.log('📄 Response Structure:');
        console.log(`  - Type: ${typeof response.data}`);
        console.log(`  - Is Array: ${Array.isArray(response.data)}`);
        console.log(`  - Keys: ${Object.keys(response.data)}`);
        
        // Check for pairs in response
        let pairs = [];
        if (response.data.pairs) {
          pairs = response.data.pairs;
          console.log(`  - Pairs Count: ${pairs.length}`);
        } else {
          console.log(`  - No pairs property found`);
        }
        
        if (pairs.length > 0) {
          const firstPair = pairs[0];
          console.log('🔍 First Pair Sample:');
          console.log(`    - Full Object Keys: ${Object.keys(firstPair)}`);
          console.log(`    - Chain ID: ${firstPair.chainId}`);
          console.log(`    - DEX ID: ${firstPair.dexId}`);
          console.log(`    - Symbol: ${firstPair.baseToken?.symbol}`);
          console.log(`    - Price USD: ${firstPair.priceUsd}`);
          console.log(`    - Liquidity USD: ${firstPair.liquidity?.usd}`);
          console.log(`    - Volume 24h: ${firstPair.volume?.h24}`);
          console.log(`    - Created At: ${firstPair.pairCreatedAt ? new Date(firstPair.pairCreatedAt) : 'N/A'}`);
          console.log(`    - Full Pair Object:`, JSON.stringify(firstPair, null, 2));
          
          // Filter for Solana
          const solanaPairs = pairs.filter((pair: any) => pair.chainId === 'solana');
          console.log(`🔗 Solana Pairs: ${solanaPairs.length}`);
          
          if (solanaPairs.length > 0) {
            const firstSolanaPair = solanaPairs[0];
            console.log('\n🔍 First Solana Pair Sample:');
            console.log(`    - Full Object:`, JSON.stringify(firstSolanaPair, null, 2));
          }
          
          if (solanaPairs.length > 0) {
            // Apply age filter (relaxed for testing)
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            const recentPairs = solanaPairs.filter((pair: any) => {
              if (!pair.pairCreatedAt) return false;
              const age = now - pair.pairCreatedAt;
              return age <= maxAge;
            });
            console.log(`⏰ Recent Pairs (≤24h): ${recentPairs.length}`);
            
            // Apply liquidity filter (relaxed)
            const liquidPairs = recentPairs.filter((pair: any) => 
              pair.liquidity?.usd && pair.liquidity.usd >= 100
            );
            console.log(`💧 Liquid Pairs (≥$100): ${liquidPairs.length}`);
            
            // Apply volume filter (relaxed)
            const activePairs = liquidPairs.filter((pair: any) => 
              pair.volume?.h24 && pair.volume.h24 >= 100
            );
            console.log(`📊 Active Pairs (≥$100 vol): ${activePairs.length}`);
            
            if (activePairs.length > 0) {
              console.log('\n🎯 FILTERED TOKENS FOUND:');
              activePairs.slice(0, 3).forEach((pair: any, index: number) => {
                const ageMinutes = pair.pairCreatedAt ? Math.floor((now - pair.pairCreatedAt) / 60000) : 'N/A';
                console.log(`  ${index + 1}. ${pair.baseToken?.symbol} (${pair.dexId})`);
                console.log(`     - Age: ${ageMinutes} minutes`);
                console.log(`     - Price: $${pair.priceUsd}`);
                console.log(`     - Liquidity: $${pair.liquidity?.usd?.toLocaleString()}`);
                console.log(`     - Volume 24h: $${pair.volume?.h24?.toLocaleString()}`);
              });
            }
          }
        }
      }
      
      // Test 2: Use our DexScreenerClient
      console.log('\n📡 TEST 2: Using DexScreenerClient.getTrendingTokens()');
      const client = this.realTokenMonitor.getDexScreenerClient();
      const tokens = await client.getTrendingTokens();
      console.log(`🔍 Client returned: ${tokens.length} tokens`);
      
      if (tokens.length > 0) {
        console.log('🎯 CLIENT TOKENS:');
        tokens.slice(0, 3).forEach((token, index) => {
          console.log(`  ${index + 1}. ${token.symbol} (${token.dexId})`);
          console.log(`     - Address: ${token.address}`);
          console.log(`     - Price: $${token.priceUsd}`);
          console.log(`     - Liquidity: $${token.liquidityUsd?.toLocaleString()}`);
          console.log(`     - Volume 24h: $${token.volume24h?.toLocaleString()}`);
          console.log(`     - Trending Score: ${token.trendingScore}`);
        });
      }
      
      // Test 3: Alternative endpoints
      console.log('\n📡 TEST 3: Testing alternative endpoints');
      
      try {
        const boostResponse = await axios.get('https://api.dexscreener.com/token-boosts/latest/v1', {
          timeout: 10000,
          headers: { 'User-Agent': 'Educational-Token-Analyzer/1.0' }
        });
        console.log(`🚀 Boost endpoint: ${boostResponse.data?.pairs?.length || 0} pairs`);
      } catch (boostError) {
        console.log(`❌ Boost endpoint failed: ${boostError}`);
      }
      
    } catch (error: any) {
      console.error('❌ API Test Failed:', error);
      if (error?.response) {
        console.log(`📊 Error Status: ${error.response.status}`);
        console.log(`📋 Error Headers:`, error.response.headers);
        console.log(`📦 Error Data:`, error.response.data);
      }
    }
  }

  private trackAnalyzedToken(tokenInfo: TokenInfo, securityScore: number, action: string): void {
    const realToken = this.realTokenMonitor.getTokenInfo(tokenInfo.mint);
    const ageInMinutes = tokenInfo.metadata?.ageMinutes || 0;
    
    const analyzedData = {
      id: tokenInfo.mint,
      name: tokenInfo.name || tokenInfo.symbol || 'Unknown',
      symbol: tokenInfo.symbol || 'UNK',
      price: realToken?.priceUsd || 0,
      age: ageInMinutes,
      securityScore: securityScore,
      liquidity: realToken?.liquidityUsd || 0,
      volume24h: realToken?.volume24h || 0,
      priceChange5m: realToken?.priceChange5m || 0,
      trendingScore: realToken?.trendingScore || 0,
      dexId: realToken?.dexId || tokenInfo.source,
      analyzedAt: Date.now(),
      action: action, // 'BUY', 'SKIP', 'PUMP'
      isPump: tokenInfo.source === 'pump_detector',
      source: tokenInfo.source
    };
    
    this.analyzedTokens.set(tokenInfo.mint, analyzedData);
    
    // Keep only last 100 analyzed tokens
    if (this.analyzedTokens.size > 100) {
      const firstKey = this.analyzedTokens.keys().next().value;
      if (firstKey) {
        this.analyzedTokens.delete(firstKey);
      }
    }
  }

  private async analyzePumpToken(tokenInfo: TokenInfo, pumpSignal: PumpSignal): Promise<void> {
    const realToken = this.realTokenMonitor.getTokenInfo(tokenInfo.mint);
    
    console.log(`\n🚨 ANALYZING PUMP TOKEN: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`🔥 Pump Strength: ${pumpSignal.pumpStrength.toFixed(1)}/100`);
    console.log(`📡 Source: ${tokenInfo.source}`);
    console.log(`⚡ Pump Signals: ${pumpSignal.signals.join(', ')}`);
    
    if (realToken) {
      console.log(`💵 Current Price: $${realToken.priceUsd.toFixed(8)}`);
      console.log(`📈 5m Change: ${realToken.priceChange5m.toFixed(2)}%`);
      console.log(`📊 Volume 5m: $${realToken.volume5m.toLocaleString()}`);
      console.log(`💧 Liquidity: $${realToken.liquidityUsd.toLocaleString()}`);
      console.log(`🔥 Trending Score: ${realToken.trendingScore}/100`);
    }

    try {
      // Step 1: Fast-track security analysis for pumps
      const securityAnalysis = await this.securityAnalyzer.analyzeToken(tokenInfo);
      
      // Give pump tokens a slight security boost due to activity
      if (pumpSignal.pumpStrength > 30) {
        securityAnalysis.score += 5; // Small boost for high-activity pumps
      }
      
      logger.log('analysis', 'Security analysis completed for pump token', {
        mint: tokenInfo.mint,
        score: securityAnalysis.score,
        passed: securityAnalysis.overall,
        warnings: securityAnalysis.warnings.length,
        pumpStrength: pumpSignal.pumpStrength,
        priceUsd: realToken?.priceUsd,
        liquidity: realToken?.liquidityUsd
      });

      // Step 2: Skip honeypot check for pumps to act faster
      console.log('⚡ Skipping honeypot check for pump token (speed optimization)');

      // Track analyzed pump token
      this.trackAnalyzedToken(tokenInfo, securityAnalysis.score, 'PUMP');

      // Step 3: Process with real price simulation engine - HIGH PRIORITY
      await this.simulationEngine.processTokenDetection(tokenInfo, securityAnalysis);

    } catch (error) {
      console.error('❌ Error during pump token analysis:', error);
      logger.error('Pump token analysis failed', {
        mint: tokenInfo.mint,
        pumpStrength: pumpSignal.pumpStrength,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async analyzeRealToken(tokenInfo: TokenInfo): Promise<void> {
    const realToken = this.realTokenMonitor.getTokenInfo(tokenInfo.mint);
    
    console.log(`\n🔍 Analyzing real token: ${tokenInfo.symbol || tokenInfo.mint.slice(0, 8)}`);
    console.log(`📡 Source: ${tokenInfo.source}`);
    
    if (realToken) {
      console.log(`💵 Current Price: $${realToken.priceUsd.toFixed(8)}`);
      console.log(`📈 24h Change: ${realToken.priceChange24h.toFixed(2)}%`);
      console.log(`💧 Liquidity: $${realToken.liquidityUsd.toLocaleString()}`);
      console.log(`📊 Volume 24h: $${realToken.volume24h.toLocaleString()}`);
      console.log(`🔥 Trending Score: ${realToken.trendingScore}/100`);
    }

    try {
      // Step 1: Security Analysis
      const securityAnalysis = await this.securityAnalyzer.analyzeToken(tokenInfo);
      
      logger.log('analysis', 'Security analysis completed for real token', {
        mint: tokenInfo.mint,
        score: securityAnalysis.score,
        passed: securityAnalysis.overall,
        warnings: securityAnalysis.warnings.length,
        priceUsd: realToken?.priceUsd,
        liquidity: realToken?.liquidityUsd
      });

      // Step 2: Honeypot Check (simplified for real tokens)
      const isHoneypot = await this.securityAnalyzer.checkForHoneypot(tokenInfo);
      
      if (isHoneypot) {
        console.log('🍯 Honeypot detected - skipping token');
        logger.log('analysis', 'Real token identified as potential honeypot', {
          mint: tokenInfo.mint,
          symbol: tokenInfo.symbol
        });
        
        // Track as skipped due to honeypot
        this.trackAnalyzedToken(tokenInfo, securityAnalysis.score, 'SKIP_HONEYPOT');
        return;
      }

      // Track analyzed token before processing
      this.trackAnalyzedToken(tokenInfo, securityAnalysis.score, 'ANALYZED');

      // Step 3: Process with real price simulation engine
      await this.simulationEngine.processTokenDetection(tokenInfo, securityAnalysis);

    } catch (error) {
      console.error('❌ Error during real token analysis:', error);
      logger.error('Real token analysis failed', {
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
      console.log('🚀 Starting Real Data Educational Token Analyzer...');
      
      // Clean logs on startup - comprehensive cleanup
      console.log('🧹 Performing startup log cleanup...');
      await this.logCleaner.cleanLogs(true);
      
      // Show log stats after cleanup
      const logStats = await this.logCleaner.getLogStats();
      if (logStats.exists && logStats.totalFiles > 0) {
        console.log(`📊 Log cleanup complete: ${logStats.totalFiles} files, ${logStats.totalSizeFormatted} total`);
      } else {
        console.log('📁 No log files to clean');
      }
      
      // Update SOL price
      await this.priceConverter.updateSolPrice();
      this.priceConverter.startAutoUpdate();
      
      console.log('📊 Connecting to DexScreener API for live market data...');
      
      // PRESTART API TEST - Debug why 0 tokens found
      console.log('\n🔬 PRESTART API DEBUG TEST');
      console.log('='.repeat(50));
      await this.runPrestartApiTest();
      console.log('='.repeat(50));
      
      // Start dashboard first
      await this.dashboard.start();
      
      // Start pump detection system
      await this.pumpDetector.start();
      
      // Start real token monitoring
      await this.realTokenMonitor.start();
      
      this.isRunning = true;
      
      logger.info('Real Data Educational Token Analyzer started successfully', {
        mode: 'DRY_RUN',
        dataSource: 'dexscreener_api',
        educational: true
      });
      
      console.log('✅ Real Data Educational Token Analyzer is running');
      console.log('📊 Dashboard: http://localhost:3000');
      console.log('🎓 Using REAL market data for educational simulation');
      console.log('💡 No real trading occurs - this is for learning only');
      console.log('🔍 Monitoring Solana tokens from pump.fun, Raydium, etc.');
      console.log('🚨 Advanced pump detection system ACTIVE');
      
      // Display current SOL price
      const priceInfo = this.priceConverter.getPriceInfo();
      console.log(`💱 SOL Price: €${priceInfo.solToEur.toFixed(2)} EUR (${priceInfo.updateAge})`);
      
    } catch (error) {
      console.error('❌ Failed to start analyzer:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    try {
      console.log('🛑 Stopping real token monitor...');
      await this.realTokenMonitor.stop();
      
      console.log('🛑 Stopping pump detector...');
      await this.pumpDetector.stop();
      
      console.log('🛑 Stopping dashboard...');
      await this.dashboard.stop();
      
      logger.info('Real Data Educational Token Analyzer stopped');
      console.log('✅ Real Data Educational Token Analyzer stopped successfully');
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  getStats() {
    const monitoringStats = this.realTokenMonitor.getMonitoringStats();
    const portfolioStats = this.simulationEngine.getPortfolioStats();
    const pumpStats = this.pumpDetector.getStats();
    
    return {
      isRunning: this.isRunning,
      monitoring: monitoringStats,
      portfolio: portfolioStats,
      pumpDetection: pumpStats,
      activePositions: this.simulationEngine.getActivePositions().length,
      totalTrades: this.simulationEngine.getRecentTrades(1000).length,
      tokens: {
        found: this.foundTokens.size,
        analyzed: this.analyzedTokens.size
      }
    };
  }

  // Get found tokens for dashboard
  getFoundTokens() {
    return Array.from(this.foundTokens.values())
      .sort((a, b) => b.foundAt - a.foundAt)
      .slice(0, 50); // Return last 50 found tokens
  }

  // Get analyzed tokens for dashboard
  getAnalyzedTokens() {
    return Array.from(this.analyzedTokens.values())
      .sort((a, b) => b.analyzedAt - a.analyzedAt)
      .slice(0, 50); // Return last 50 analyzed tokens
  }
}

// Main execution
async function main() {
  try {
    const analyzer = new RealDataTokenAnalyzer();
    await analyzer.start();
    
    // Display startup info
    console.log('\n📈 REAL MARKET DATA FEATURES:');
    console.log('• Live prices from DexScreener API');
    console.log('• Real liquidity and volume data');
    console.log('• Actual price movements for simulation');
    console.log('• Trending tokens from pump.fun & Raydium');
    console.log('• Real-time price tracking');
    console.log('• Market momentum analysis');
    console.log('• EUR price conversion for SOL');
    console.log('• 🚨 ADVANCED PUMP DETECTION SYSTEM');
    console.log('• Multi-signal pump analysis');
    console.log('• Immediate response to price pumps');
    
    console.log('\n🛡️ EDUCATIONAL SAFETY:');
    console.log('• NO real trades executed');
    console.log('• Simulation with virtual SOL only');
    console.log('• Learning tool for blockchain analysis');
    console.log('• Safe for educational exploration');
    console.log('• Auto log cleanup on startup');
    
    // Keep the process running
    process.on('SIGINT', () => {
      analyzer.stop().then(() => process.exit(0));
    });
    
  } catch (error) {
    console.error('❌ Failed to start Real Data Educational Token Analyzer:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}

export { RealDataTokenAnalyzer };