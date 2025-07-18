import { EventEmitter } from 'events';
import { TokenInfo, SecurityAnalysis } from './index';

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

export interface EventEmittingSimulationEngine extends EventEmitter {
  processTokenDetection(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void>;
  getPortfolioStats(): any;
  getActivePositions(): SimulatedPosition[];
  getRecentTrades(limit?: number): SimulatedTrade[];
  getPositions?(): SimulatedPosition[];
  getStats(): any;
}