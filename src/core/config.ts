import * as dotenv from 'dotenv';
import { AnalysisConfig, DetectionConfig, TradingStrategy, ExitStrategyConfig } from '../types/unified';

dotenv.config();

export class Config {
  private static instance: Config;
  private config: AnalysisConfig;

  // Triple-locked safety enforcement
  private static readonly HARDCODED_MODE = 'DRY_RUN';
  private static readonly EDUCATIONAL_FOCUS = 70;

  private constructor() {
    // Triple validation for DRY_RUN mode
    this.validateTripleLockSafety();
    
    // Enforce DRY_RUN mode for educational purposes
    if (process.env.MODE !== 'DRY_RUN') {
      throw new Error('SECURITY VIOLATION: This educational system only supports DRY_RUN mode');
    }

    this.config = {
      mode: 'DRY_RUN',
      minLiquiditySol: parseFloat(process.env.MIN_LIQUIDITY_SOL || '0.01'),
      minConfidenceScore: parseInt(process.env.MIN_CONFIDENCE_SCORE || '1'), // Show ALL tokens with warnings
      maxAnalysisAge: parseInt(process.env.MAX_ANALYSIS_AGE_MS || '3600000'), // 1 hour optimal
      simulatedInvestment: parseFloat(process.env.SIMULATED_INVESTMENT || '0.003'),
      maxSimulatedPositions: parseInt(process.env.MAX_SIMULATED_POSITIONS || '500'), // 500 concurrent optimal
      rpc: {
        primary: process.env.RPC_PRIMARY || 'https://api.mainnet-beta.solana.com',
        secondary: process.env.RPC_SECONDARY || 'https://solana-api.projectserum.com',
        fallback: [
          'https://rpc.ankr.com/solana',
          'https://solana.public-rpc.com'
        ],
        timeout: parseInt(process.env.RPC_TIMEOUT || '10000'),
        retries: parseInt(process.env.RPC_RETRIES || '3')
      }
    };

    console.log('🎓 Enhanced Educational Token Analyzer initialized in DRY_RUN mode');
    console.log('📚 This system demonstrates advanced token sniping techniques for learning purposes only');
    console.log('🔒 Triple-locked safety: Creator intelligence for educational analysis only');
  }

  // Triple-locked safety validation
  private validateTripleLockSafety(): void {
    // Level 1: Hardcoded validation
    if (Config.HARDCODED_MODE !== 'DRY_RUN') {
      throw new Error('SECURITY VIOLATION: Hardcoded DRY_RUN mode compromised');
    }
    
    // Level 2: Environment validation
    const envMode = process.env.MODE;
    if (envMode && envMode !== 'DRY_RUN') {
      throw new Error('SECURITY VIOLATION: Environment DRY_RUN mode compromised');
    }
    
    // Level 3: Educational boundary validation
    if (Config.EDUCATIONAL_FOCUS < 70) {
      throw new Error('SECURITY VIOLATION: Educational focus below 70%');
    }
  }

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  getConfig(): AnalysisConfig {
    return { ...this.config };
  }

  getDetectionConfig(): DetectionConfig {
    return {
      sources: {
        blockchain: {
          rpcEndpoints: [
            this.config.rpc.primary,
            this.config.rpc.secondary,
            ...(this.config.rpc.fallback || [])
          ],
          blockAnalysisDepth: parseInt(process.env.BLOCK_ANALYSIS_DEPTH || '3'),
          mempoolScanning: process.env.ENABLE_MEMPOOL_SCANNING !== 'false'
        },
        dexScreener: {
          enabled: process.env.ENABLE_DEXSCREENER !== 'false',
          websocket: process.env.DEXSCREENER_WEBSOCKET !== 'false'
        },
        jupiter: {
          enabled: process.env.ENABLE_JUPITER !== 'false',
          polling: process.env.JUPITER_POLLING === 'true'
        },
        raydium: {
          directPoolMonitoring: process.env.RAYDIUM_DIRECT_MONITORING !== 'false'
        }
      },
      maxLatency: parseInt(process.env.MAX_DETECTION_LATENCY || '50'),
      parallelProcessing: process.env.PARALLEL_PROCESSING !== 'false',
      enableRaydium: true,
      enablePumpFun: true,
      enableDexScreener: true,
      enableMultiDex: true,
      enableRealTime: true,
      minLiquidity: this.config.minLiquiditySol * 1000, // Convert to USD
      maxAge: this.config.maxAnalysisAge,
      minConfidence: this.config.minConfidenceScore,
      filterHoneypots: false, // Info only mode - show ALL tokens
      filterRugs: false,      // Info only mode - show ALL tokens
      enabledSources: ['websocket', 'dexscreener', 'scanning', 'mempool'],
      scanInterval: parseInt(process.env.SCAN_INTERVAL || '30000'),
      batchSize: parseInt(process.env.BATCH_SIZE || '50'),
      maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '20'),
      rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || '1000'),
      cacheTimeout: parseInt(process.env.CACHE_TIMEOUT || '300000')
    };
  }

  getTradingStrategy(): TradingStrategy {
    return {
      simulation: {
        enabledFor: 'TOKENS_UNDER_10_MINUTES', // Optimal entry window
        amount: this.config.simulatedInvestment,
        parallelSimulations: parseInt(process.env.PARALLEL_SIMULATIONS || '5')
      },
      analysis: {
        timeWindow: parseInt(process.env.ANALYSIS_TIME_WINDOW || '3600000'), // 1 hour improved
        metricsTracked: ['volume', 'holders', 'priceAction', 'socialSignals', 'creatorActivity', 'rugpullRisk']
      },
      execution: {
        mode: (process.env.EXECUTION_MODE as any) || 'CREATOR_AWARE', // Adjust based on creator history
        slippage: parseInt(process.env.MAX_SLIPPAGE || '30'),
        gasMultiplier: parseFloat(process.env.GAS_MULTIPLIER || '1.5')
      }
    };
  }

  getExitStrategy(): ExitStrategyConfig {
    return {
      targetROI: {
        primary: parseInt(process.env.TARGET_ROI || '100'),
        trailing: process.env.TRAILING_STOP !== 'false'
      },
      bagManagement: {
        initialSell: parseInt(process.env.INITIAL_SELL_PERCENTAGE || '90'),
        holdPercentage: parseInt(process.env.HOLD_PERCENTAGE || '10'),
        microSells: process.env.MICRO_SELLS !== 'false'
      },
      rugPullProtection: {
        liquidityMonitoring: 'REAL_TIME',
        ownerActivityTracking: process.env.OWNER_ACTIVITY_TRACKING !== 'false',
        exitTriggers: [
          'LIQUIDITY_REMOVAL_DETECTED',
          'LARGE_HOLDER_DUMP',
          'SOCIAL_SENTIMENT_CRASH'
        ],
        maxExitTime: parseInt(process.env.MAX_EXIT_TIME || '100')
      }
    };
  }

  // Legacy compatibility methods
  getRPCEndpoint(): string {
    return this.config.rpc.primary;
  }

  getFallbackRPC(): string {
    return this.config.rpc.secondary;
  }

  getRPCEndpoints(): string[] {
    return [
      this.config.rpc.primary,
      this.config.rpc.secondary,
      ...(this.config.rpc.fallback || [])
    ];
  }

  getDashboardPort(): number {
    return parseInt(process.env.DASHBOARD_PORT || '3000');
  }

  getLogLevel(): string {
    return process.env.LOG_LEVEL || 'info';
  }

  // New configuration methods
  getPerformanceConfig(): {
    maxLatency: number;
    parallelProcessing: boolean;
    maxParallelDetections: number;
    maxSimultaneousSimulations: number;
    connectionPoolSize: number;
  } {
    return {
      maxLatency: parseInt(process.env.MAX_LATENCY || '50'),
      parallelProcessing: process.env.PARALLEL_PROCESSING !== 'false',
      maxParallelDetections: parseInt(process.env.MAX_PARALLEL_DETECTIONS || '50'),
      maxSimultaneousSimulations: parseInt(process.env.MAX_SIMULTANEOUS_SIMULATIONS || '10'),
      connectionPoolSize: parseInt(process.env.CONNECTION_POOL_SIZE || '20')
    };
  }

  getRiskManagementConfig(): {
    maxPositions: number;
    maxPositionSize: number;
    dailyLossLimit: number;
    autoStopConditions: string[];
  } {
    return {
      maxPositions: this.config.maxSimulatedPositions,
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.01'),
      dailyLossLimit: parseFloat(process.env.DAILY_LOSS_LIMIT || '0.1'),
      autoStopConditions: [
        'DAILY_LOSS_EXCEEDED',
        'UNUSUAL_NETWORK_ACTIVITY',
        'RPC_DEGRADATION'
      ]
    };
  }

  getEducationalConfig(): {
    dryRunMode: boolean;
    maxTestDuration: number;
    logAllDecisions: boolean;
    explainStrategies: boolean;
  } {
    return {
      dryRunMode: true, // Always true for educational purposes
      maxTestDuration: parseInt(process.env.MAX_TEST_DURATION || '86400000'), // 24 hours
      logAllDecisions: process.env.LOG_ALL_DECISIONS !== 'false',
      explainStrategies: process.env.EXPLAIN_STRATEGIES !== 'false'
    };
  }

  // Environment variable getters with defaults
  getStartingBalance(): number {
    return parseFloat(process.env.STARTING_BALANCE || '10');
  }

  getWebSocketPort(): number {
    return parseInt(process.env.WEBSOCKET_PORT || '3001');
  }

  getMaxHoldTime(): number {
    return parseInt(process.env.MAX_HOLD_TIME || '7200000'); // 2 hours
  }

  getStopLossPercent(): number {
    return parseFloat(process.env.STOP_LOSS_PERCENT || '-30');
  }

  getTakeProfitPercent(): number {
    return parseFloat(process.env.TAKE_PROFIT_PERCENT || '100');
  }

  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined;
  }

  // Enhanced configuration methods for new features
  getCreatorIntelligenceConfig() {
    return {
      trackingEnabled: process.env.CREATOR_TRACKING_ENABLED !== 'false',
      databaseRetention: parseInt(process.env.CREATOR_DATABASE_RETENTION || '30'), // 30 days
      rugpullDetectionEnabled: process.env.RUGPULL_DETECTION_ENABLED !== 'false',
      socialMediaVerification: process.env.SOCIAL_MEDIA_VERIFICATION !== 'false',
      multipliers: {
        verified: 1.3,
        unknown: 1.0,
        flagged: 0.7
      }
    };
  }

  getSecurityDisplayConfig() {
    return {
      showAllTokens: true, // Always show ALL tokens
      colorCodedBadges: true, // Enable color-coded security badges
      badges: {
        red: 'score < 3',      // 🔴 High risk
        orange: 'score >= 3 && score < 6', // 🟠 Caution
        green: 'score >= 6'    // 🟢 Proceed
      },
      tokenIcons: process.env.ENABLE_TOKEN_ICONS !== 'false',
      radarCharts: process.env.ENABLE_RADAR_CHARTS !== 'false',
      creatorWalletDisplay: process.env.SHOW_CREATOR_WALLETS !== 'false'
    };
  }

  getPerformanceBenchmarks() {
    return {
      targetWinRate: parseInt(process.env.TARGET_WIN_RATE || '60'), // >60%
      targetAvgROI: parseInt(process.env.TARGET_AVG_ROI || '25'),   // >25%
      maxDetectionLatency: parseInt(process.env.MAX_DETECTION_LATENCY || '5000'), // <5s
      maxMemoryUsageMB: parseInt(process.env.MAX_MEMORY_USAGE_MB || '1536'), // <1.5GB
      targetTokensPerMinute: parseInt(process.env.TARGET_TOKENS_PER_MINUTE || '1000'), // 1000+
      systemUptimeTarget: parseFloat(process.env.SYSTEM_UPTIME_TARGET || '99'), // >99%
      alertThresholds: {
        winRateBelow: 40,
        avgROIBelow: 10,
        latencyAbove: 10000,
        memoryAbove: 2048
      }
    };
  }

  getUIConfiguration() {
    return {
      positionSizing: {
        configurable: true,
        minAmount: parseFloat(process.env.MIN_POSITION_SIZE || '0.001'),
        maxAmount: parseFloat(process.env.MAX_POSITION_SIZE || '0.01'),
        defaultAmount: this.config.simulatedInvestment
      },
      updateIntervals: {
        priceUpdates: parseInt(process.env.PRICE_UPDATE_INTERVAL || '15000'), // 15s improved
        uiRefresh: parseInt(process.env.UI_REFRESH_INTERVAL || '10000'), // 10s optimal
        exitChecks: parseInt(process.env.EXIT_CHECK_INTERVAL || '5000') // 5s maintain
      },
      displayOptions: {
        colorCodedPrices: true,
        tokenIcons: true,
        securityBadges: true,
        creatorInfo: true,
        realTimeUpdates: true
      }
    };
  }

  // Validate configuration
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate RPC endpoints
    if (!this.config.rpc.primary || !this.config.rpc.primary.startsWith('http')) {
      errors.push('Invalid primary RPC endpoint');
    }

    if (!this.config.rpc.secondary || !this.config.rpc.secondary.startsWith('http')) {
      errors.push('Invalid secondary RPC endpoint');
    }

    // Validate numeric values
    if (this.config.minLiquiditySol < 0) {
      errors.push('Minimum liquidity must be positive');
    }

    if (this.config.minConfidenceScore < 0 || this.config.minConfidenceScore > 100) {
      errors.push('Confidence score must be between 0 and 100');
    }

    if (this.config.simulatedInvestment <= 0) {
      errors.push('Simulated investment must be positive');
    }

    if (this.config.maxSimulatedPositions <= 0) {
      errors.push('Max positions must be positive');
    }

    // Validate timeouts and intervals
    if (this.config.rpc.timeout <= 0) {
      errors.push('RPC timeout must be positive');
    }

    if (this.config.maxAnalysisAge <= 0) {
      errors.push('Max analysis age must be positive');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Configuration summary for logging
  getConfigSummary(): any {
    return {
      mode: this.config.mode,
      detection: {
        maxLatency: this.getDetectionConfig().maxLatency,
        sources: Object.keys(this.getDetectionConfig().sources)
      },
      trading: {
        mode: this.getTradingStrategy().execution.mode,
        slippage: this.getTradingStrategy().execution.slippage,
        maxPositions: this.config.maxSimulatedPositions
      },
      risk: {
        maxPositionSize: this.getRiskManagementConfig().maxPositionSize,
        dailyLossLimit: this.getRiskManagementConfig().dailyLossLimit
      },
      educational: {
        dryRunMode: true,
        explainStrategies: this.getEducationalConfig().explainStrategies
      }
    };
  }
}