import { SimulatedPosition, SimulatedTrade, TokenInfo, SecurityAnalysis } from './index';

// Common interface for simulation engines
export interface SimulationEngine {
  processTokenDetection(tokenInfo: TokenInfo, securityAnalysis: SecurityAnalysis): Promise<void>;
  getPortfolioStats(): any;
  getActivePositions(): SimulatedPosition[];
  getRecentTrades(limit?: number): SimulatedTrade[];
  getPositions(): SimulatedPosition[];
}

// Extended interface for engines that emit events
export interface EventEmittingSimulationEngine extends SimulationEngine {
  on(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
}