/**
 * Unified type definitions consolidating all interfaces
 * Replaces types/index.ts, types/dexscreener.ts, and types/simulation-engine.ts
 */

import { EventEmitter } from 'events';

// ==============================================
// CORE TOKEN INTERFACES
// ==============================================

/**
 * Base token interface with common properties
 */
export interface BaseToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  chainId?: string;
  imageUrl?: string;
  detected: boolean;
  detectedAt: number;
}

/**
 * Unified token interface combining TokenInfo and RealTokenInfo
 * Uses optional fields to handle both simulation and real token data
 */
export interface UnifiedTokenInfo extends BaseToken {
  // Legacy compatibility (for simulation engine)
  mint?: string; // Alias for address
  supply?: string;
  signature?: string;
  timestamp?: number;
  source?: string;
  createdAt?: number;
  
  // Real token data (from DexScreener)
  priceUsd?: number;
  priceNative?: string;
  volume24h?: number;
  volume1h?: number;
  volume5m?: number;
  priceChange24h?: number;
  priceChange1h?: number;
  priceChange5m?: number;
  liquidityUsd?: number;
  marketCap?: number;
  fdv?: number;
  txns24h?: number;
  txns1h?: number;
  txns5m?: number;
  
  // Pair information
  pairAddress?: string;
  pairCreatedAt?: number;
  dexId?: string;
  
  // Liquidity information (flexible format)
  liquidity?: {
    sol?: number;
    usd?: number;
    poolAddress?: string;
  };
  
  // Metadata (flexible format)
  metadata?: {
    [key: string]: any;
    detectionSource?: string;
    detectedAt?: number;
    pumpDetected?: boolean;
    pumpScore?: number;
  };
  
  // Additional properties for unified engine
  trendingScore?: number;
  confidence?: number;
  securityScore?: number;
  rugRisk?: number;
}

// Legacy type aliases for backward compatibility
export type TokenInfo = UnifiedTokenInfo;

// ==============================================
// DEXSCREENER INTERFACES
// ==============================================

export interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  txns: {
    m5: { buys: number; sells: number; };
    h1: { buys: number; sells: number; };
    h6: { buys: number; sells: number; };
    h24: { buys: number; sells: number; };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  pairCreatedAt?: number;
  marketCap?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{
      url: string;
    }>;
    socials?: Array<{
      type: string;
      url: string;
    }>;
  };
}

export interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[];
}

export interface DexScreenerTokenData {
  address: string;
  name: string;
  symbol: string;
  priceUsd: number;
  volume24h: number;
  liquidityUsd: number;
  priceChange24h: number;
  pairs: DexScreenerPair[];
}

// ==============================================
// SIMULATION ENGINE INTERFACES
// ==============================================

export interface SimulatedPosition {
  id: string;
  mint: string;
  symbol: string;
  entryPrice: number;
  currentPrice?: number;
  simulatedInvestment: number;
  tokenAmount?: number;
  entryTime: number;
  exitTime?: number;
  roi?: number;
  status: 'ACTIVE' | 'CLOSED';
  strategy: string;
  urgency?: string;
  confidence?: number;
  riskLevel?: string;
  expectedHoldTime?: number;
  securityScore?: number;
  exitConditions?: any;
}

export interface SimulatedTrade {
  id: string;
  mint: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  amount: number;
  price: number;
  timestamp: number;
  reason: string;
  strategy: string;
  urgency?: string;
  confidence?: number;
  roi?: number;
}

export interface TradeDecision {
  action: 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'SKIP' | 'PRIORITY_BUY';
  reason: string;
  confidence: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA_HIGH';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  positionSize: number;
  expectedHoldTime: number;
  strategy: {
    source: string;
    priority: string;
    exitConditions: any;
  };
}

export interface EventEmittingSimulationEngine extends EventEmitter {
  processTokenDetection(tokenInfo: UnifiedTokenInfo, securityAnalysis: SecurityAnalysis): Promise<void>;
  getPortfolioStats(): any;
  getActivePositions(): SimulatedPosition[];
  getRecentTrades(limit?: number): SimulatedTrade[];
  getPositions?(): SimulatedPosition[];
  getStats(): any;
}

// DexScreener interfaces moved to main section above to avoid duplication

// RealTokenInfo is now an alias for UnifiedTokenInfo to avoid duplication
export type RealTokenInfo = UnifiedTokenInfo & {
  // Additional fields specific to real token data that may not be in unified interface
  price?: number; // Legacy field for compatibility
  age?: number;
  pair?: DexScreenerPair;
  buys?: number;
  sells?: number;
  holders?: number;
  website?: string;
  websites?: string[];
  socials?: any[];
  twitter?: string;
  telegram?: string;
  description?: string;
  coingeckoId?: string;
  coinmarketcapId?: string;
  riskScore?: number;
};

// ==============================================
// LEGACY COMPATIBILITY (from index.ts)
// ==============================================

export interface LegacyTokenInfo {
  mint: string;
  symbol?: string;
  name?: string;
  decimals: number;
  supply: string;
  signature: string;
  timestamp: number;
  source: string;
  createdAt: number;
  metadata?: {
    [key: string]: any;
  };
  liquidity?: {
    sol: number;
    usd: number;
    poolAddress?: string;
  };
}

// TokenInfo alias already defined above - removing duplicate

// ==============================================
// SECURITY ANALYSIS INTERFACES
// ==============================================

export interface SecurityCheckBase {
  name: string;
  passed: boolean;
  score: number;
  message: string;
  details?: any;
}

export interface SecurityAnalysis {
  overall: boolean;
  score: number;
  checks: SecurityCheckBase[];
  warnings: string[];
}

// ==============================================
// FILTER INTERFACES
// ==============================================

export interface TokenFilterCriteria {
  minLiquidity?: number;
  maxLiquidity?: number;
  minAge?: number;
  maxAge?: number;
  minAgeMinutes?: number;
  maxAgeHours?: number;
  minSecurityScore?: number;
  maxSecurityScore?: number;
  requiredSources?: string[];
  excludedSources?: string[];
  minVolume?: number;
  maxVolume?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
}

export interface TokenFilterResult {
  passed: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
}

// ==============================================
// ADDITIONAL UNIFIED INTERFACES
// ==============================================

export interface DetectionResult {
  token: UnifiedTokenInfo;
  tokens?: UnifiedTokenInfo[];
  confidence: number;
  source: string;
  timestamp: number;
  analysis?: SecurityAnalysis;
  processingTime?: number;
  metadata?: {
    filtersPassed: string[];
    detectionMethod: string;
    [key: string]: any;
  };
}

export interface DetectionConfig {
  enableRaydium: boolean;
  enablePumpFun: boolean;
  enableDexScreener: boolean;
  enableMultiDex: boolean;
  enableRealTime: boolean;
  minLiquidity: number;
  maxAge: number;
  minConfidence: number;
  filterHoneypots: boolean;
  filterRugs: boolean;
  enabledSources?: string[];
  scanInterval?: number;
  processingTime?: number;
  maxTokens?: number;
  batchSize?: number;
  retryAttempts?: number;
  timeout?: number;
  maxConcurrentRequests?: number;
  rateLimitDelay?: number;
  cacheTimeout?: number;
}

export interface Position {
  id: string;
  tokenInfo: UnifiedTokenInfo;
  amount: number;
  entryPrice: number;
  currentPrice?: number;
  entryTime: number;
  exitTime?: number;
  roi?: number;
  status: 'active' | 'closed' | 'failed';
  strategy?: string;
  exitReason?: string;
  token?: UnifiedTokenInfo;
  pnl?: number;
  pnlPercent?: number;
  value?: number;
  holdTime?: number;
  timestamp?: number;
}

export interface Trade {
  id: string;
  tokenInfo: UnifiedTokenInfo;
  type: 'buy' | 'sell';
  amount: number;
  price: number;
  timestamp: number;
  signature?: string;
  position?: Position;
  profit?: number;
  roi?: number;
  success?: boolean;
}

export interface Portfolio {
  totalBalance: number;
  availableBalance: number;
  positions: Position[];
  trades: Trade[];
  totalProfit: number;
  totalROI: number;
  successRate: number;
  activePositions: number;
  totalValue?: number;
  balance?: number;
  totalPnL?: number;
  totalPnLPercent?: number;
  winRate?: number;
  avgHoldTime?: number;
  recentTrades?: Trade[];
}

export interface Strategy {
  name: string;
  description: string;
  entryConditions: any[];
  exitConditions: any[];
  riskLevel: 'low' | 'medium' | 'high';
  maxPositionSize: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface SimulationConfig {
  startingBalance: number;
  maxPositions: number;
  positionSize: number;
  enableStopLoss: boolean;
  stopLossPercentage: number;
  enableTakeProfit: boolean;
  takeProfitPercentage: number;
  strategy: Strategy;
  riskManagement: {
    maxLossPerPosition: number;
    maxDailyLoss: number;
    maxDrawdown: number;
  };
  maxHoldTime?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  mode?: string;
  baseInvestment?: number;
  maxAnalysisAge?: number;
  minConfidenceScore?: number;
}

// ==============================================
// NEW TYPE DEFINITIONS FOR ENHANCED FEATURES
// ==============================================

// Security Scanner Types
export interface SecurityInfo {
  score: number; // 0-100 (show ALL tokens >= 1)
  flags: string[];
  visualDisplay: {
    badge: '🔴' | '🟠' | '🟢';   // <3, 3-6, >6 color-coded display
    radarChart: boolean;         // Detailed breakdown visualization
    tokenIcon: string;           // Display token image
  };
  priorityMetrics: {
    honeypotRisk: number;        // CRITICAL - highest priority
    liquidityLocked: boolean;    // High priority
    ownershipRenounced: boolean; // High priority
    topHolderConcentration: number; // Medium priority
    contractVerified: boolean;   // Medium priority
  };
  creatorIntelligence?: {
    walletAddress: string;       // Creator wallet tracking
    historicalTokens: number;    // Tokens created by this wallet
    rugpullHistory: {
      count: number;
      priceAtDump: number[];     // Historical dump prices
    };
    marketMakerActivity: {
      buyCount: number;
      sellCount: number;
      avgHoldTime: number;
    };
    successRate: number;         // % of successful tokens
    riskMultiplier: number;      // 1.3x verified, 1x unknown, 0.7x flagged
  };
  socialMedia: {
    twitterVerified: boolean;
    telegramActive: boolean;
    websiteValid: boolean;
    socialScore: number;
  };
  details: {
    contractVerified: boolean;
    liquidityLocked: boolean;
    ownershipRenounced: boolean;
    honeypotRisk: number;
    rugPullIndicators: string[];
    [key: string]: any;
  };
  recommendation: 'PROCEED' | 'CAUTION' | 'HIGH_RISK';
  displayAllTokens: true;      // Never filter, always show with warnings
  analyzedAt: number;
  confidence: number;
  riskIndicators: RiskIndicator[];
  checks: SecurityCheckEnhanced[];
}

export interface RiskIndicator {
  type: 'HONEYPOT' | 'RUG_PULL' | 'LOW_LIQUIDITY' | 'HIGH_CONCENTRATION' | 'SUSPICIOUS_ACTIVITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  description: string;
  evidence: string[];
}

export interface SecurityCheckEnhanced {
  name: string;
  category: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  passed: boolean;
  score: number;
  confidence: number;
  message: string;
  details: any;
  recommendation?: string;
}

// Trading Strategy Types
export interface TradingStrategy {
  simulation: {
    enabledFor: string;
    amount: number;
    parallelSimulations: number;
  };
  analysis: {
    timeWindow: number;
    metricsTracked: string[];
  };
  execution: {
    mode: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
    slippage: number;
    gasMultiplier: number;
  };
}

// Exit Strategy Types
export interface ExitStrategyConfig {
  targetROI: {
    primary: number;
    trailing: boolean;
  };
  bagManagement: {
    initialSell: number;
    holdPercentage: number;
    microSells: boolean;
  };
  rugPullProtection: {
    liquidityMonitoring: string;
    ownerActivityTracking: boolean;
    exitTriggers: string[];
    maxExitTime: number;
  };
}

// Detection Configuration Types (consolidated with all options)
export interface DetectionConfig {
  sources: {
    blockchain: {
      rpcEndpoints: string[];
      blockAnalysisDepth: number;
      mempoolScanning: boolean;
    };
    dexScreener: { enabled: boolean; websocket: boolean };
    jupiter: { enabled: boolean; polling: boolean };
    raydium: { directPoolMonitoring: boolean };
  };
  maxLatency: number;
  parallelProcessing: boolean;
  enableRaydium: boolean;
  enablePumpFun: boolean;
  enableDexScreener: boolean;
  enableMultiDex: boolean;
  enableRealTime: boolean;
  minLiquidity: number;
  maxAge: number;
  minConfidence: number;
  filterHoneypots: boolean;
  filterRugs: boolean;
  enabledSources?: string[];
  scanInterval?: number;
  processingTime?: number;
  maxTokens?: number;
  batchSize?: number;
  retryAttempts?: number;
  timeout?: number;
  maxConcurrentRequests?: number;
  rateLimitDelay?: number;
  cacheTimeout?: number;
}

// Blockchain Analysis Types
export interface BlockchainAnalyzer {
  start(): Promise<void>;
  stop(): Promise<void>;
  analyzeTransaction(signature: string): Promise<any>;
}

export interface MempoolScanner {
  start(): Promise<void>;
  stop(): Promise<void>;
  getPendingLaunches(): any[];
  getStatus(): any;
  healthCheck(): Promise<boolean>;
}

export interface SecurityScanner {
  start(): Promise<void>;
  stop(): Promise<void>;
  analyzeToken(token: UnifiedTokenInfo): Promise<SecurityInfo>;
  getStats(): any;
  healthCheck(): Promise<boolean>;
}

export interface SimulationEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  processToken(token: UnifiedTokenInfo): Promise<void>;
  handleExitSignal(signal: any): Promise<void>;
  emergencyExit(tokenAddress: string): Promise<void>;
  getStatus(): any;
  healthCheck(): Promise<boolean>;
}

export interface ExecutionEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  executeOrder(order: TradeOrder): Promise<ExecutionResult>;
  getStatus(): any;
  healthCheck(): Promise<boolean>;
}

export interface ExitStrategy {
  start(): Promise<void>;
  stop(): Promise<void>;
  evaluatePosition(position: Position): Promise<ExitDecision>;
  getStatus(): any;
}

export interface WebSocketServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  emit(event: string, data: any): void;
  getStatus(): any;
  healthCheck(): Promise<boolean>;
}

// Trading Types
export interface TradeOrder {
  id: string;
  tokenAddress: string;
  side: 'BUY' | 'SELL';
  amount: number;
  price?: number;
  slippage: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  timeInForce: 'IOC' | 'FOK' | 'GTC';
  metadata?: any;
}

export interface ExecutionResult {
  orderId: string;
  success: boolean;
  executedAmount: number;
  executedPrice: number;
  fees: number;
  slippage: number;
  timestamp: number;
  transactionId?: string;
  error?: string;
}

export interface ExitDecision {
  action: 'HOLD' | 'PARTIAL_SELL' | 'FULL_SELL' | 'EMERGENCY_EXIT';
  percentage: number;
  reason: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  expectedPrice?: number;
  stopLoss?: boolean;
  takeProfit?: boolean;
}

// System Health Types
export interface SystemHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  components: {
    [componentName: string]: {
      status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE';
      latency?: number;
      errorRate?: number;
      lastCheck: number;
    };
  };
  metrics: {
    totalLatency: number;
    successRate: number;
    throughput: number;
    errorCount: number;
  };
}

// Real-time Event Types
export interface RealtimeEvents {
  'token:detected': UnifiedTokenInfo & { detectionLatency: number };
  'token:analyzed': TokenAnalysis & { securityInfo: SecurityInfo };
  'trade:simulated': SimulationResult;
  'trade:executed': ExecutionResult;
  'position:update': PositionUpdate & { roi: number; exitRecommendation: string };
  'alert:rugpull': { tokenAddress: string; action: 'EMERGENCY_EXIT' };
  'system:health': SystemHealth;
  'performance:alert': { component: string; metric: string; value: number; threshold: number };
}

// Additional utility types
export interface TokenAnalysis extends SecurityAnalysis {
  token: UnifiedTokenInfo;
  timestamp: number;
  analyzer: string;
}

export interface SimulationResult {
  id: string;
  token: UnifiedTokenInfo;
  outcome: 'PROFIT' | 'LOSS' | 'BREAK_EVEN';
  roi: number;
  duration: number;
  reason: string;
}

export interface PositionUpdate {
  positionId: string;
  token: UnifiedTokenInfo;
  currentPrice: number;
  unrealizedPnL: number;
  holdTime: number;
  lastUpdate: number;
}

// Configuration interfaces
export interface RpcConfig {
  primary: string;
  secondary: string;
  fallback?: string[];
  timeout: number;
  retries: number;
}

export interface AnalysisConfig {
  mode: 'DRY_RUN';
  minLiquiditySol: number;
  minConfidenceScore: number;
  maxAnalysisAge: number;
  simulatedInvestment: number;
  maxSimulatedPositions: number;
  rpc: RpcConfig;
}

// ==============================================
// CREATOR INTELLIGENCE SYSTEM TYPES
// ==============================================

export interface CreatorIntelligence {
  walletAddress: string;
  historicalTokens: number;
  rugpullHistory: {
    count: number;
    priceAtDump: number[];
    totalLost: number;
  };
  marketMakerActivity: {
    buyCount: number;
    sellCount: number;
    avgHoldTime: number;
    totalVolume: number;
  };
  successRate: number; // % of successful tokens
  riskMultiplier: number; // 1.3x verified, 1x unknown, 0.7x flagged
  socialMediaVerification: {
    twitterVerified: boolean;
    telegramActive: boolean;
    websiteValid: boolean;
    socialScore: number;
  };
  flags: CreatorFlag[];
  createdAt: number;
  lastActivity: number;
}

export interface CreatorProfile extends CreatorIntelligence {
  tokensCreated: UnifiedTokenInfo[];
  rugpullEvents: RugpullEvent[];
  performanceMetrics: {
    avgTokenLifespan: number;
    avgMaxGain: number;
    rugpullFrequency: number;
  };
}

export interface RugpullEvent {
  id: string;
  tokenAddress: string;
  creatorWallet: string;
  rugpullType: 'LIQUIDITY_DRAIN' | 'HONEYPOT' | 'MINT_ATTACK' | 'SOCIAL_EXIT';
  priceAtDump: number;
  maxPriceReached: number;
  lossPercent: number;
  timestamp: number;
  evidence: string[];
  affectedTraders: number;
}

export interface CreatorFlag {
  type: 'SUSPICIOUS_ACTIVITY' | 'RUGPULL_HISTORY' | 'HONEYPOT_CREATOR' | 'VERIFIED' | 'SOCIAL_SCAM';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  evidence: string[];
  flaggedAt: number;
  source: 'AUTOMATED' | 'COMMUNITY' | 'MANUAL';
}

export interface CreatorDatabase {
  creators: Map<string, CreatorIntelligence>;
  rugpullEvents: Map<string, RugpullEvent>;
  verifiedCreators: Set<string>;
  flaggedCreators: Set<string>;
  stats: {
    totalCreators: number;
    verifiedCount: number;
    flaggedCount: number;
    rugpullCount: number;
  };
}

export interface CreatorAlert {
  id: string;
  walletAddress: string;
  alertType: 'NEW_TOKEN' | 'SUSPICIOUS_ACTIVITY' | 'RUGPULL_WARNING' | 'LARGE_TRANSACTION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  data: any;
  timestamp: number;
  acknowledged: boolean;
}

// Duplicate DetectionConfig removed - using consolidated version above