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
  pairAddress?: string;
  dexId?: string;
  pairCreatedAt?: number;
  websites?: string[];
  socials?: Array<{
    type: string;
    url: string;
  }>;
  
  // Analysis fields
  trendingScore?: number;
  riskScore?: number;
  
  // Liquidity information (flexible format)
  liquidity?: {
    sol?: number;
    usd?: number;
    poolAddress?: string;
  };
  
  // Metadata (flexible format)
  metadata?: {
    [key: string]: any;
  };
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
    usd?: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{
      label: string;
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

// ==============================================
// SIMULATION INTERFACES
// ==============================================

export interface SimulationConfig {
  mode: 'DRY_RUN' | 'SIMULATION' | 'ANALYSIS';
  maxPositions: number;
  baseInvestment: number;
  startingBalance: number;
  maxAnalysisAge: number;
  minConfidenceScore: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxHoldTime: number;
}

export interface Position {
  id: string;
  token: UnifiedTokenInfo;
  entryPrice: number;
  amount: number;
  value: number;
  timestamp: number;
  source: string;
  strategy: string;
  status: 'ACTIVE' | 'CLOSED' | 'PENDING';
  exitPrice?: number;
  exitTimestamp?: number;
  exitReason?: string;
  pnl?: number;
  pnlPercent?: number;
  holdTime?: number;
  maxDrawdown?: number;
  maxProfit?: number;
}

export interface Trade {
  id: string;
  position: Position;
  type: 'BUY' | 'SELL';
  price: number;
  amount: number;
  value: number;
  timestamp: number;
  fees: number;
  slippage: number;
  gasUsed?: number;
  signature?: string;
  success: boolean;
  error?: string;
}

export interface Portfolio {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  activePositions: number;
  totalPositions: number;
  winRate: number;
  avgHoldTime: number;
  maxDrawdown: number;
  sharpeRatio: number;
  balance: {
    sol: number;
    usd: number;
  };
  positions: Position[];
  recentTrades: Trade[];
}

export interface Strategy {
  name: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA_HIGH';
  weight: number;
  baseAllocation: number;
  maxPositions: number;
  enabled: boolean;
  config: {
    minLiquidity?: number;
    maxAge?: number;
    minVolume?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    [key: string]: any;
  };
}

// ==============================================
// DETECTION INTERFACES
// ==============================================

export interface DetectionConfig {
  enabledSources: string[];
  scanInterval: number;
  batchSize: number;
  maxConcurrentRequests: number;
  rateLimitDelay: number;
  cacheTimeout: number;
}

export interface DetectionResult {
  tokens: UnifiedTokenInfo[];
  source: string;
  timestamp: number;
  processingTime: number;
  errors: string[];
  metadata: {
    [key: string]: any;
  };
}

// ==============================================
// MONITORING INTERFACES
// ==============================================

export interface KPIMetrics {
  tokensDetected: number;
  tokensAnalyzed: number;
  successfulTrades: number;
  totalVolume: number;
  avgProcessingTime: number;
  errorRate: number;
  uptime: number;
  lastUpdate: number;
}

export interface SystemHealth {
  rpcConnections: {
    primary: boolean;
    secondary: boolean;
    latency: number;
  };
  webSocketConnections: number;
  activeSubscriptions: number;
  queueSize: number;
  memoryUsage: number;
  cpuUsage: number;
  errorCount: number;
  lastHealthCheck: number;
}

// ==============================================
// API INTERFACES
// ==============================================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  processingTime?: number;
}

export interface PaginatedResponse<T = any> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// ==============================================
// WEBSOCKET INTERFACES
// ==============================================

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
  source?: string;
}

export interface WebSocketConfig {
  url: string;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  messageQueueSize: number;
}

// ==============================================
// UTILITY TYPES
// ==============================================

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

export type EventType = 
  | 'tokenDetected'
  | 'positionOpened'
  | 'positionClosed'
  | 'tradeExecuted'
  | 'priceUpdate'
  | 'error'
  | 'warning'
  | 'info';

export interface EventPayload {
  type: EventType;
  data: any;
  timestamp: number;
  source: string;
  metadata?: {
    [key: string]: any;
  };
}

// ==============================================
// CONFIGURATION INTERFACES
// ==============================================

export interface AppConfig {
  mode: 'DRY_RUN' | 'SIMULATION' | 'ANALYSIS';
  rpc: {
    primary: string;
    secondary: string;
    timeout: number;
    retries: number;
  };
  detection: DetectionConfig;
  simulation: SimulationConfig;
  monitoring: {
    enabled: boolean;
    port: number;
    logLevel: LogLevel;
    metricsInterval: number;
  };
  strategies: Strategy[];
}