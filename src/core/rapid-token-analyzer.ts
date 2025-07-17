import { EventEmitter } from 'events';
import { TokenInfo, SecurityAnalysis } from '../types';
import { MultiDexMonitor } from '../detection/multi-dex-monitor';
import { PumpDetector } from '../detection/pump-detector';
import { RealTokenMonitor } from '../detection/real-token-monitor';
import { SecurityAnalyzer } from '../analysis/security-analyzer';
import { getDexScreenerTokenService } from './dexscreener-token-service';
import { EventEmittingSimulationEngine } from '../types/simulation-engine';

export class RapidTokenAnalyzer extends EventEmitter {
  private multiDexMonitor: MultiDexMonitor;
  private pumpDetector: PumpDetector;
  private realTokenMonitor: RealTokenMonitor;
  private securityAnalyzer: SecurityAnalyzer;
  private simulationEngine: EventEmittingSimulationEngine;
  
  private isRunning = false;
  private processedTokens: Set<string> = new Set();
  private tokenQueue: TokenInfo[] = [];
  private processingStats = {
    totalDetected: 0,
    totalProcessed: 0,
    totalViable: 0,
    totalPositions: 0,
    errors: 0,
    startTime: Date.now()
  };

  constructor(simulationEngine: EventEmittingSimulationEngine) {
    super();
    this.simulationEngine = simulationEngine;
    
    // Initialize detection systems
    this.multiDexMonitor = new MultiDexMonitor();
    this.pumpDetector = new PumpDetector();
    this.realTokenMonitor = new RealTokenMonitor();
    this.securityAnalyzer = new SecurityAnalyzer();
    
    this.setupEventHandlers();
    console.log('⚡ Rapid Token Analyzer initialized');
  }

  private setupEventHandlers(): void {
    // Multi-DEX Monitor events
    this.multiDexMonitor.on('tokenDetected', (tokenInfo: TokenInfo) => {
      this.handleTokenDetected(tokenInfo, 'MULTI_DEX');
    });

    this.multiDexMonitor.on('error', (error: any) => {
      this.processingStats.errors++;
      console.error('❌ Multi-DEX Monitor error:', error);
    });

    // Pump Detector events
    this.pumpDetector.on('pumpDetected', (pumpInfo: any) => {
      this.handlePumpDetected(pumpInfo);
    });

    this.pumpDetector.on('error', (error: any) => {
      this.processingStats.errors++;
      console.error('❌ Pump Detector error:', error);
    });

    // Real Token Monitor events
    this.realTokenMonitor.on('tokenFound', (tokenInfo: TokenInfo) => {
      this.handleTokenDetected(tokenInfo, 'REAL_MONITOR');
    });

    this.realTokenMonitor.on('error', (error: any) => {
      this.processingStats.errors++;
      console.error('❌ Real Token Monitor error:', error);
    });

    // DexScreener service events
    const dexScreenerService = getDexScreenerTokenService();
    dexScreenerService.on('newTokens', (tokens: any[]) => {
      tokens.forEach(token => {
        const tokenInfo = dexScreenerService.convertToTokenInfo(token);
        this.handleTokenDetected(tokenInfo, 'DEXSCREENER');
      });
    });
  }

  async startAnalyzing(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Rapid Token Analyzer already running');
      return;
    }

    try {
      console.log('🚀 Starting rapid token analysis...');
      
      // Start all detection systems
      await this.multiDexMonitor.startMonitoring();
      await this.pumpDetector.start();
      await this.realTokenMonitor.start();
      
      // Start token processing loop
      this.startTokenProcessing();
      
      this.isRunning = true;
      this.processingStats.startTime = Date.now();
      
      console.log('✅ Rapid token analysis started');
      this.emit('analysisStarted');
      
    } catch (error) {
      console.error('❌ Error starting rapid token analysis:', error);
      this.emit('error', error);
    }
  }

  private handleTokenDetected(tokenInfo: TokenInfo, source: string): void {
    // Deduplication
    if (this.processedTokens.has(tokenInfo.mint)) {
      return;
    }

    this.processedTokens.add(tokenInfo.mint);
    this.processingStats.totalDetected++;
    
    // Add source information
    tokenInfo.metadata = {
      ...tokenInfo.metadata,
      detectionSource: source,
      detectedAt: Date.now()
    };

    // Add to processing queue
    this.tokenQueue.push(tokenInfo);
    
    console.log(`🔍 Token queued for analysis: ${tokenInfo.symbol} from ${source}`);
    
    // Emit detection event
    this.emit('tokenDetected', tokenInfo);
  }

  private handlePumpDetected(pumpInfo: any): void {
    try {
      // Convert pump info to TokenInfo format
      const tokenInfo: TokenInfo = {
        mint: pumpInfo.address || pumpInfo.mint,
        symbol: pumpInfo.symbol,
        name: pumpInfo.name || pumpInfo.symbol,
        decimals: 9,
        supply: '1000000000000000000',
        signature: `PUMP_${Date.now()}`,
        timestamp: Date.now(),
        createdAt: Date.now(),
        source: 'PUMP_DETECTOR',
        liquidity: {
          sol: pumpInfo.liquidityUsd / 150 || 0,
          usd: pumpInfo.liquidityUsd || 0
        },
        metadata: {
          pumpScore: pumpInfo.strength,
          pumpSignals: pumpInfo.signals,
          detectionSource: 'PUMP_DETECTOR',
          detectedAt: Date.now()
        }
      };

      this.handleTokenDetected(tokenInfo, 'PUMP_DETECTOR');
      
    } catch (error) {
      console.error('❌ Error processing pump detection:', error);
      this.processingStats.errors++;
    }
  }

  private startTokenProcessing(): void {
    // Process tokens from queue every 500ms for rapid analysis
    setInterval(() => {
      this.processTokenQueue();
    }, 500);
  }

  private async processTokenQueue(): Promise<void> {
    if (this.tokenQueue.length === 0) {
      return;
    }

    // Process up to 5 tokens at once for performance
    const tokensToProcess = this.tokenQueue.splice(0, 5);
    
    // Process tokens in parallel
    const promises = tokensToProcess.map(tokenInfo => this.processToken(tokenInfo));
    
    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('❌ Error processing token queue:', error);
    }
  }

  private async processToken(tokenInfo: TokenInfo): Promise<void> {
    try {
      this.processingStats.totalProcessed++;
      
      console.log(`🔬 Analyzing token: ${tokenInfo.symbol} (${tokenInfo.mint.slice(0, 8)}...)`);
      
      // Perform security analysis
      const securityAnalysis = await this.securityAnalyzer.analyzeToken(tokenInfo);
      
      // Check for honeypot
      const isHoneypot = await this.securityAnalyzer.checkForHoneypot(tokenInfo);
      
      if (isHoneypot) {
        console.log(`🍯 Token flagged as honeypot: ${tokenInfo.symbol}`);
        this.emit('honeypotDetected', tokenInfo);
        return;
      }

      // Apply rapid filtering criteria
      if (this.isTokenViable(tokenInfo, securityAnalysis)) {
        this.processingStats.totalViable++;
        
        console.log(`✅ Viable token found: ${tokenInfo.symbol} (Score: ${securityAnalysis.score})`);
        
        // Process through simulation engine
        await this.simulationEngine.processTokenDetection(tokenInfo, securityAnalysis);
        
        this.processingStats.totalPositions++;
        this.emit('viableTokenFound', { tokenInfo, securityAnalysis });
      } else {
        console.log(`❌ Token filtered out: ${tokenInfo.symbol} (Score: ${securityAnalysis.score})`);
        this.emit('tokenFiltered', { tokenInfo, securityAnalysis });
      }
      
    } catch (error) {
      console.error(`❌ Error processing token ${tokenInfo.symbol}:`, error);
      this.processingStats.errors++;
      this.emit('processingError', { tokenInfo, error });
    }
  }

  private isTokenViable(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): boolean {
    // MODIFIED: Very permissive criteria - buy almost every token
    
    // Only skip if security score is extremely low (below 10)
    if (securityAnalysis.score < 10) {
      return false;
    }
    
    // Very low liquidity threshold (only $1 USD)
    if (!tokenInfo.liquidity || tokenInfo.liquidity.usd < 1) {
      return false;
    }
    
    // Very generous age threshold (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    if (Date.now() - tokenInfo.createdAt > maxAge) {
      return false;
    }
    
    // Accept all sources - no source filtering
    return true;
  }

  async stopAnalyzing(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('⏹️ Stopping rapid token analysis...');
      
      // Stop all detection systems
      await this.multiDexMonitor.stopMonitoring();
      await this.pumpDetector.stop();
      await this.realTokenMonitor.stop();
      
      this.isRunning = false;
      
      console.log('⏹️ Rapid token analysis stopped');
      this.emit('analysisStopped');
      
    } catch (error) {
      console.error('❌ Error stopping rapid token analysis:', error);
      this.emit('error', error);
    }
  }

  getStats(): any {
    const runtime = Date.now() - this.processingStats.startTime;
    const runtimeMinutes = runtime / (1000 * 60);
    
    return {
      ...this.processingStats,
      runtime: runtime,
      runtimeMinutes: runtimeMinutes,
      tokensPerMinute: this.processingStats.totalDetected / runtimeMinutes,
      successRate: this.processingStats.totalProcessed > 0 ? 
        (this.processingStats.totalViable / this.processingStats.totalProcessed) * 100 : 0,
      queueSize: this.tokenQueue.length,
      isRunning: this.isRunning,
      multiDexStatus: this.multiDexMonitor.getStatus(),
      processedTokensCount: this.processedTokens.size
    };
  }

  // Get recent detections
  getRecentDetections(limit: number = 10): TokenInfo[] {
    return this.multiDexMonitor.getRecentTokens(limit);
  }

  // Clear processed tokens cache
  clearCache(): void {
    this.processedTokens.clear();
    this.tokenQueue.length = 0;
    this.multiDexMonitor.clearTokenCache();
    
    console.log('🧹 Rapid analyzer cache cleared');
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const multiDexHealth = await this.multiDexMonitor.healthCheck();
      return this.isRunning && multiDexHealth;
    } catch (error) {
      console.error('❌ Health check failed:', error);
      return false;
    }
  }

  // Force process pending tokens
  async flushQueue(): Promise<void> {
    console.log(`🔄 Flushing ${this.tokenQueue.length} pending tokens`);
    await this.processTokenQueue();
  }
}