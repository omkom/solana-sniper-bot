export interface TokenInfo {
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

export interface SimulatedPosition {
  id: string;
  mint: string;
  symbol: string;
  entryTime: number;
  simulatedInvestment: number;
  entryPrice: number;
  currentPrice?: number;
  status: 'ACTIVE' | 'CLOSED';
  reason?: string;
  roi?: number;
}

export interface SimulatedTrade {
  id: string;
  mint: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  timestamp: number;
  price: number;
  amount: number;
  reason: string;
  simulation: true; // Always true for this educational system
}

export interface AnalysisConfig {
  mode: 'DRY_RUN';
  minLiquiditySol: number;
  minConfidenceScore: number;
  maxAnalysisAge: number;
  simulatedInvestment: number;
  maxSimulatedPositions: number;
}