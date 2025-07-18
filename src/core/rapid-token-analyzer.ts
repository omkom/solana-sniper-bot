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
    // console.log('⚡ Rapid Token Analyzer initialized');
  }

  private setupEventHandlers(): void {
    // Multi-DEX Monitor events
    this.multiDexMonitor.on('tokenDetected', (tokenInfo: TokenInfo) => {
      this.handleTokenDetected(tokenInfo, 'MULTI_DEX');
    });

    this.multiDexMonitor.on('error', (error: any) => {
      this.processingStats.errors++;
      // console.error('❌ Multi-DEX Monitor error:', error);
    });

    // Pump Detector events
    this.pumpDetector.on('pumpDetected', (pumpInfo: any) => {
      this.handlePumpDetected(pumpInfo);
    });

    this.pumpDetector.on('error', (error: any) => {
      this.processingStats.errors++;
      // console.error('❌ Pump Detector error:', error);
    });

    // Real Token Monitor events
    this.realTokenMonitor.on('tokenFound', (tokenInfo: TokenInfo) => {
      this.handleTokenDetected(tokenInfo, 'REAL_MONITOR');
    });

    this.realTokenMonitor.on('error', (error: any) => {
      this.processingStats.errors++;
      // console.error('❌ Real Token Monitor error:', error);
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
      console.log('📊 DEBUGGING: Starting detection systems...');
      
      // Start all detection systems
      console.log('🔄 Starting MultiDexMonitor...');
      await this.multiDexMonitor.startMonitoring();
      console.log('✅ MultiDexMonitor started');
      
      console.log('🔄 Starting PumpDetector...');
      await this.pumpDetector.start();
      console.log('✅ PumpDetector started');
      
      console.log('🔄 Starting RealTokenMonitor...');
      await this.realTokenMonitor.start();
      console.log('✅ RealTokenMonitor started');
      
      // Start token processing loop
      console.log('🔄 Starting token processing queue...');
      this.startTokenProcessing();
      console.log('✅ Token processing queue started');
      
      // Log a heartbeat to confirm processing is active
      setInterval(() => {
        console.log(`💗 Rapid Analyzer Heartbeat: Queue=${this.tokenQueue.length}, Processed=${this.processingStats.totalProcessed}, Viable=${this.processingStats.totalViable}`);
      }, 30000); // Every 30 seconds
      
      this.isRunning = true;
      this.processingStats.startTime = Date.now();
      
      console.log('✅ Rapid token analysis started successfully');
      const status = this.multiDexMonitor.getStatus();
      console.log(`📊 MultiDex Status:`, status);
      this.emit('analysisStarted');
      
    } catch (error) {
      console.error('❌ Error starting rapid token analysis:', error);
      console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      this.emit('error', error);
    }
  }

  private handleTokenDetected(tokenInfo: TokenInfo, source: string): void {
    // Deduplication
    const tokenId = tokenInfo.mint || tokenInfo.address;
    if (this.processedTokens.has(tokenId)) {
      return;
    }

    this.processedTokens.add(tokenId);
    this.processingStats.totalDetected++;
    
    // Add source information
    tokenInfo.metadata = {
      ...tokenInfo.metadata,
      detectionSource: source,
      detectedAt: Date.now()
    };

    // Calculate token age for priority processing
    const tokenAge = Date.now() - (tokenInfo.createdAt || Date.now());
    const isFreshToken = tokenAge < 60000; // Less than 1 minute old
    const isUltraFreshToken = tokenAge < 30000; // Less than 30 seconds old

    // Priority processing for very fresh tokens
    if (isUltraFreshToken) {
      // Ultra fresh tokens get immediate priority - add to front of queue
      this.tokenQueue.unshift(tokenInfo);
      console.log(`🚀 ULTRA FRESH TOKEN - Priority processing: ${tokenInfo.symbol} from ${source} (age: ${Math.round(tokenAge/1000)}s)`);
    } else if (isFreshToken) {
      // Fresh tokens get high priority - add after ultra fresh but before normal
      const ultraFreshCount = this.tokenQueue.filter(t => {
        const age = Date.now() - (t.createdAt || Date.now());
        return age < 30000;
      }).length;
      this.tokenQueue.splice(ultraFreshCount, 0, tokenInfo);
      console.log(`⚡ FRESH TOKEN - High priority processing: ${tokenInfo.symbol} from ${source} (age: ${Math.round(tokenAge/1000)}s)`);
    } else {
      // Normal tokens go to end of queue
      this.tokenQueue.push(tokenInfo);
      console.log(`🔍 Token queued for analysis: ${tokenInfo.symbol} from ${source} (age: ${Math.round(tokenAge/60000)}m)`);
    }
    
    // Emit detection event
    this.emit('tokenDetected', tokenInfo);
  }

  private handlePumpDetected(pumpInfo: any): void {
    try {
      // Convert pump info to TokenInfo format
      const address = pumpInfo.address || pumpInfo.mint;
      const tokenInfo: TokenInfo = {
        address: address,
        mint: address,
        symbol: pumpInfo.symbol,
        name: pumpInfo.name || pumpInfo.symbol,
        decimals: 9,
        supply: '1000000000000000000',
        signature: `PUMP_${Date.now()}`,
        timestamp: Date.now(),
        createdAt: Date.now(),
        source: 'PUMP_DETECTOR',
        detected: true,
        detectedAt: Date.now(),
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

    // Prioritize ultra fresh tokens - process them first
    const now = Date.now();
    const ultraFreshTokens = this.tokenQueue.filter(t => (now - (t.createdAt || now)) < 30000);
    const freshTokens = this.tokenQueue.filter(t => (now - (t.createdAt || now)) < 60000 && (now - (t.createdAt || now)) >= 30000);
    const normalTokens = this.tokenQueue.filter(t => (now - (t.createdAt || now)) >= 60000);

    let tokensToProcess: TokenInfo[] = [];
    
    if (ultraFreshTokens.length > 0) {
      // Process up to 3 ultra fresh tokens immediately
      tokensToProcess = ultraFreshTokens.splice(0, 3);
      console.log(`🚀 Processing ${tokensToProcess.length} ultra fresh tokens with priority`);
    } else if (freshTokens.length > 0) {
      // Process up to 4 fresh tokens
      tokensToProcess = freshTokens.splice(0, 4);
      console.log(`⚡ Processing ${tokensToProcess.length} fresh tokens with high priority`);
    } else {
      // Process up to 5 normal tokens
      tokensToProcess = normalTokens.splice(0, 5);
    }

    // Remove processed tokens from main queue
    this.tokenQueue = this.tokenQueue.filter(t => !tokensToProcess.includes(t));
    
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
      
      console.log(`🔬 Analyzing token: ${tokenInfo.symbol} (${(tokenInfo.mint || '').slice(0, 8)}...)`);
      
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
      console.log(`🔍 Checking viability for ${tokenInfo.symbol}: Security=${securityAnalysis.score}, Liquidity=$${tokenInfo.liquidity?.usd || 0}`);
      
      if (this.isTokenViable(tokenInfo, securityAnalysis)) {
        this.processingStats.totalViable++;
        
        console.log(`✅ Viable token found: ${tokenInfo.symbol} (Score: ${securityAnalysis.score})`);
        console.log(`📊 Token details: Source=${tokenInfo.source}, Age=${Math.round((Date.now() - (tokenInfo.createdAt || Date.now())) / 60000)}m, Liquidity=$${tokenInfo.liquidity?.usd || 0}`);
        console.log(`🚀 PASSING TO SIMULATION ENGINE: ${this.simulationEngine.constructor.name}`);
        
        // Process through simulation engine
        await this.simulationEngine.processTokenDetection(tokenInfo, securityAnalysis);
        
        console.log(`✅ SIMULATION ENGINE PROCESSING COMPLETED`);
        this.processingStats.totalPositions++;
        this.emit('viableTokenFound', { tokenInfo, securityAnalysis });
      } else {
        console.log(`❌ Token filtered out: ${tokenInfo.symbol} (Score: ${securityAnalysis.score})`);
        console.log(`📊 Production filter: Security=${securityAnalysis.score}<60, Liquidity=$${tokenInfo.liquidity?.usd || 0}<5000, Age>${Math.round((Date.now() - (tokenInfo.createdAt || Date.now())) / 60000)}>${30}min`);
        this.emit('tokenFiltered', { tokenInfo, securityAnalysis });
      }
      
    } catch (error) {
      console.error(`❌ Error processing token ${tokenInfo.symbol}:`, error);
      this.processingStats.errors++;
      this.emit('processingError', { tokenInfo, error });
    }
  }

  private isTokenViable(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): boolean {
    // ULTRA-AGGRESSIVE INSTANT SNIPING: BUY ABSOLUTELY EVERYTHING - ZERO FILTERS!
    
    // Skip demo tokens only
    if (tokenInfo.source === 'demo' || tokenInfo.metadata?.demo) {
      return false;
    }
    
    const ageMinutes = Math.round((Date.now() - (tokenInfo.createdAt || Date.now())) / 60000);
    
    console.log(`⚡ INSTANT SNIPE TARGET: ${tokenInfo.symbol || (tokenInfo.mint || tokenInfo.address).slice(0, 8)}`);
    console.log(`   📊 Age: ${ageMinutes}min | Security: ${securityAnalysis.score} | Liquidity: $${tokenInfo.liquidity?.usd || 0}`);
    console.log(`   🎯 SNIPING REGARDLESS OF ALL METRICS - PURE SPEED MODE!`);
    
    return true; // SNIPE ABSOLUTELY EVERYTHING!
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
    return this.multiDexMonitor.getRecentTokens();
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