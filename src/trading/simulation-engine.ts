/**
 * Enhanced Simulation Engine with Real Trading Simulation
 * Uses DryRunEngine for educational token sniping simulation
 */

import { EventEmitter } from 'events';
import { UnifiedTokenInfo, Position, SimulationEngine as SimulationEngineInterface } from '../types/unified';
import { logger } from '../monitoring/logger';
import { DryRunEngine } from '../simulation/dry-run-engine';
import { WebSocketServer } from '../monitoring/websocket-server';

export class SimulationEngine extends EventEmitter implements SimulationEngineInterface {
  private dryRunEngine: DryRunEngine;
  private isRunning = false;

  constructor(webSocketServer?: WebSocketServer) {
    super();
    this.dryRunEngine = new DryRunEngine(webSocketServer);
    
    // Forward events from DryRunEngine
    this.dryRunEngine.on('positionUpdate', (data) => this.emit('positionUpdate', data));
    this.dryRunEngine.on('portfolioUpdate', (data) => this.emit('portfolioUpdate', data));
    this.dryRunEngine.on('tradeCompleted', (data) => this.emit('tradeCompleted', data));
    
    logger.info('🎮 Enhanced Simulation Engine initialized with DryRunEngine');
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    await this.dryRunEngine.start();
    this.emit('started');
    
    logger.info('🚀 Enhanced Simulation Engine started - Real market simulation active');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    await this.dryRunEngine.stop();
    this.emit('stopped');
    
    logger.info('🛑 Enhanced Simulation Engine stopped');
  }

  async processToken(token: UnifiedTokenInfo): Promise<void> {
    if (!this.isRunning) {
      logger.debug(`Simulation engine not running, skipping ${token.symbol}`);
      return;
    }

    try {
      // Process token through enhanced dry-run engine
      await this.dryRunEngine.processToken(token);
      
      // Emit processing confirmation
      this.emit('tokenProcessed', { 
        token, 
        timestamp: Date.now(),
        processed: true 
      });
      
      logger.debug(`✅ Token processed for simulation: ${token.symbol}`);
      
    } catch (error) {
      logger.error(`Error processing token ${token.symbol} in simulation:`, error);
      this.emit('tokenProcessed', { 
        token, 
        timestamp: Date.now(),
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async handleExitSignal(signal: any): Promise<void> {
    try {
      await this.dryRunEngine.handleExitSignal(signal);
      logger.debug(`🚪 Exit signal handled for ${signal.tokenAddress || 'unknown'}`);
    } catch (error) {
      logger.error('Error handling exit signal:', error);
    }
  }

  async emergencyExit(tokenAddress: string): Promise<void> {
    try {
      await this.dryRunEngine.emergencyExit(tokenAddress);
      logger.warn(`🚨 Emergency exit executed for ${tokenAddress}`);
    } catch (error) {
      logger.error(`Error in emergency exit for ${tokenAddress}:`, error);
    }
  }

  getStatus(): any {
    const dryRunStatus = this.dryRunEngine.getStatus();
    
    return {
      isRunning: this.isRunning,
      mode: 'ENHANCED_SIMULATION',
      dryRunEngine: dryRunStatus,
      activePositions: dryRunStatus.positions,
      virtualBalance: dryRunStatus.virtualBalance,
      stats: dryRunStatus.stats,
      type: 'enhanced_implementation'
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.isRunning && await this.dryRunEngine.healthCheck();
  }

  // Additional methods for enhanced functionality
  getActivePositions(): any[] {
    return this.dryRunEngine.getActivePositions();
  }

  getPortfolioStats(): any {
    return this.dryRunEngine.getPortfolioStats();
  }
}