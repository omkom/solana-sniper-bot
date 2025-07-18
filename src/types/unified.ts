/**
 * Unified type definitions consolidating all interfaces
 * Replaces types/index.ts, types/dexscreener.ts, and types/simulation-engine.ts
 */

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
}

// Legacy type aliases for backward compatibility
export type TokenInfo = UnifiedTokenInfo;
export type RealTokenInfo = UnifiedTokenInfo;

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

export interface EventEmittingSimulationEngine {
  processTokenDetection(tokenInfo: UnifiedTokenInfo, securityAnalysis: SecurityAnalysis): Promise<void>;
  getPortfolioStats(): any;
  getActivePositions(): SimulatedPosition[];
  getRecentTrades(limit?: number): SimulatedTrade[];
  getPositions?(): SimulatedPosition[];
  getStats(): any;
  on(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): boolean;
}

// ==============================================
// SECURITY ANALYSIS INTERFACES
// ==============================================

export interface SecurityCheck {
  name: string;
  passed: boolean;
  score: number;
  message: string;
  details?: any;
}

export interface SecurityAnalysis {
  overall: boolean;
  score: number;
  checks: SecurityCheck[];
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