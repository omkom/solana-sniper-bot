/**
 * Token Action Logger
 * Comprehensive logging system for all token-related actions with dashboard synchronization
 */

import { EventEmitter } from 'events';
import { logger } from './logger';
import { WebSocketServer } from './websocket-server';

export interface TokenAction {
  id: string;
  timestamp: number;
  type: 'DETECTED' | 'ANALYZED' | 'BUY' | 'SELL' | 'TRACK_START' | 'TRACK_END' | 'PRICE_UPDATE' | 'ALERT' | 'ERROR';
  tokenAddress: string;
  tokenSymbol: string;
  tokenName?: string;
  data: {
    price?: number;
    priceChange?: number;
    volume?: number;
    liquidity?: number;
    securityScore?: number;
    source?: string;
    dex?: string;
    reason?: string;
    amount?: number;
    roi?: number;
    error?: string;
    metadata?: any;
  };
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: 'DISCOVERY' | 'ANALYSIS' | 'TRADING' | 'MONITORING' | 'ALERT' | 'SYSTEM';
}

export interface ActionLogStats {
  totalActions: number;
  actionsByType: Record<string, number>;
  actionsByCategory: Record<string, number>;
  recentActivityRate: number;
  topActiveTokens: Array<{ symbol: string; actionCount: number }>;
  lastActionTime: number;
}

export class TokenActionLogger extends EventEmitter {
  private actions: TokenAction[] = [];
  private maxActions = 1000; // Keep last 1000 actions in memory
  private webSocketServer?: WebSocketServer;
  private isStarted = false;
  
  // Performance tracking
  private actionCounts = {
    total: 0,
    byType: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
    byToken: {} as Record<string, number>
  };

  constructor(webSocketServer?: WebSocketServer) {
    super();
    this.webSocketServer = webSocketServer;
    this.setupEventHandlers();
    logger.info('🔍 TokenActionLogger initialized');
  }

  start(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    logger.info('✅ TokenActionLogger started');
  }

  stop(): void {
    if (!this.isStarted) return;
    this.isStarted = false;
    logger.info('🛑 TokenActionLogger stopped');
  }

  private setupEventHandlers(): void {
    // Clean up old actions periodically
    setInterval(() => {
      this.cleanupOldActions();
    }, 60000); // Every minute
  }

  /**
   * Log a token action with automatic dashboard sync
   */
  logAction(action: Omit<TokenAction, 'id' | 'timestamp'>): void {
    if (!this.isStarted) return;

    const fullAction: TokenAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...action
    };

    // Add to actions array
    this.actions.unshift(fullAction);
    this.maintainActionLimit();

    // Update counts
    this.updateCounts(fullAction);

    // Log to console based on severity
    this.logToConsole(fullAction);

    // Emit event for other systems
    this.emit('actionLogged', fullAction);

    // Broadcast to dashboard via WebSocket
    this.broadcastToDashboard(fullAction);
  }

  /**
   * Convenience methods for common actions
   */
  logTokenDetected(tokenAddress: string, tokenSymbol: string, data: any = {}): void {
    this.logAction({
      type: 'DETECTED',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        price: data.price,
        volume: data.volume,
        liquidity: data.liquidity,
        source: data.source,
        dex: data.dex,
        metadata: data
      },
      severity: 'MEDIUM',
      category: 'DISCOVERY'
    });
  }

  logTokenAnalyzed(tokenAddress: string, tokenSymbol: string, data: any = {}): void {
    this.logAction({
      type: 'ANALYZED',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        securityScore: data.securityScore,
        price: data.price,
        reason: data.reason || 'Security analysis completed',
        metadata: data
      },
      severity: data.securityScore < 30 ? 'HIGH' : data.securityScore < 60 ? 'MEDIUM' : 'LOW',
      category: 'ANALYSIS'
    });
  }

  logTradeBuy(tokenAddress: string, tokenSymbol: string, data: any = {}): void {
    this.logAction({
      type: 'BUY',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        amount: data.amount,
        price: data.price,
        reason: data.reason || 'Buy signal triggered',
        metadata: data
      },
      severity: 'HIGH',
      category: 'TRADING'
    });
  }

  logTradeSell(tokenAddress: string, tokenSymbol: string, data: any = {}): void {
    this.logAction({
      type: 'SELL',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        amount: data.amount,
        price: data.price,
        roi: data.roi,
        reason: data.reason || 'Sell signal triggered',
        metadata: data
      },
      severity: 'HIGH',
      category: 'TRADING'
    });
  }

  logTrackingStart(tokenAddress: string, tokenSymbol: string, data: any = {}): void {
    this.logAction({
      type: 'TRACK_START',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        price: data.price,
        reason: 'Added to tracking',
        metadata: data
      },
      severity: 'LOW',
      category: 'MONITORING'
    });
  }

  logTrackingEnd(tokenAddress: string, tokenSymbol: string, data: any = {}): void {
    this.logAction({
      type: 'TRACK_END',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        reason: data.reason || 'Removed from tracking',
        metadata: data
      },
      severity: 'LOW',
      category: 'MONITORING'
    });
  }

  logPriceUpdate(tokenAddress: string, tokenSymbol: string, data: any = {}): void {
    // Only log significant price changes to avoid spam
    if (Math.abs(data.priceChange || 0) < 5) return;

    this.logAction({
      type: 'PRICE_UPDATE',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        price: data.price,
        priceChange: data.priceChange,
        volume: data.volume,
        reason: `Price ${data.priceChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(data.priceChange).toFixed(2)}%`,
        metadata: data
      },
      severity: Math.abs(data.priceChange || 0) > 50 ? 'HIGH' : Math.abs(data.priceChange || 0) > 20 ? 'MEDIUM' : 'LOW',
      category: 'MONITORING'
    });
  }

  logAlert(tokenAddress: string, tokenSymbol: string, data: any = {}): void {
    this.logAction({
      type: 'ALERT',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        reason: data.reason || 'Alert triggered',
        price: data.price,
        roi: data.roi,
        metadata: data
      },
      severity: data.severity || 'MEDIUM',
      category: 'ALERT'
    });
  }

  logError(tokenAddress: string, tokenSymbol: string, error: string, data: any = {}): void {
    this.logAction({
      type: 'ERROR',
      tokenAddress,
      tokenSymbol,
      tokenName: data.name,
      data: {
        error,
        reason: `Error: ${error}`,
        metadata: data
      },
      severity: 'CRITICAL',
      category: 'SYSTEM'
    });
  }

  private updateCounts(action: TokenAction): void {
    this.actionCounts.total++;
    this.actionCounts.byType[action.type] = (this.actionCounts.byType[action.type] || 0) + 1;
    this.actionCounts.byCategory[action.category] = (this.actionCounts.byCategory[action.category] || 0) + 1;
    this.actionCounts.byToken[action.tokenSymbol] = (this.actionCounts.byToken[action.tokenSymbol] || 0) + 1;
  }

  private logToConsole(action: TokenAction): void {
    const emoji = this.getActionEmoji(action);
    const message = `${emoji} ${action.type}: ${action.tokenSymbol} - ${action.data.reason || 'Action logged'}`;
    
    switch (action.severity) {
      case 'CRITICAL':
        logger.error(message, { action: action.type, token: action.tokenSymbol, data: action.data });
        break;
      case 'HIGH':
        logger.warn(message, { action: action.type, token: action.tokenSymbol, data: action.data });
        break;
      case 'MEDIUM':
        logger.info(message, { action: action.type, token: action.tokenSymbol, data: action.data });
        break;
      case 'LOW':
        logger.debug(message, { action: action.type, token: action.tokenSymbol, data: action.data });
        break;
    }
  }

  private getActionEmoji(action: TokenAction): string {
    switch (action.type) {
      case 'DETECTED': return '🎯';
      case 'ANALYZED': return '🔍';
      case 'BUY': return '🟢';
      case 'SELL': return '🔴';
      case 'TRACK_START': return '📍';
      case 'TRACK_END': return '📍';
      case 'PRICE_UPDATE': return '📈';
      case 'ALERT': return '🚨';
      case 'ERROR': return '❌';
      default: return '📝';
    }
  }

  private broadcastToDashboard(action: TokenAction): void {
    if (!this.webSocketServer) return;

    // Broadcast specific action
    this.webSocketServer.emit('tokenAction', action);

    // Broadcast updated stats
    this.webSocketServer.emit('actionLogStats', this.getStats());

    // Also emit legacy events for compatibility
    switch (action.type) {
      case 'DETECTED':
        this.webSocketServer.emit('tokenDetected', {
          mint: action.tokenAddress,
          symbol: action.tokenSymbol,
          ...action.data
        });
        break;
      case 'ANALYZED':
        this.webSocketServer.emit('tokenAnalyzed', {
          mint: action.tokenAddress,
          symbol: action.tokenSymbol,
          ...action.data
        });
        break;
      case 'BUY':
      case 'SELL':
        this.webSocketServer.emit('newTrade', {
          type: action.type,
          mint: action.tokenAddress,
          symbol: action.tokenSymbol,
          timestamp: action.timestamp,
          ...action.data
        });
        break;
      case 'PRICE_UPDATE':
        this.webSocketServer.emit('priceUpdate', {
          token: {
            address: action.tokenAddress,
            symbol: action.tokenSymbol
          },
          newPrice: action.data.price,
          changePercent: action.data.priceChange
        });
        break;
    }
  }

  private maintainActionLimit(): void {
    if (this.actions.length > this.maxActions) {
      this.actions = this.actions.slice(0, this.maxActions);
    }
  }

  private cleanupOldActions(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    this.actions = this.actions.filter(action => action.timestamp > cutoffTime);
  }

  /**
   * Get action statistics
   */
  getStats(): ActionLogStats {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const recentActions = this.actions.filter(action => action.timestamp > oneHourAgo);
    
    // Calculate top active tokens
    const topActiveTokens = Object.entries(this.actionCounts.byToken)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([symbol, actionCount]) => ({ symbol, actionCount }));

    return {
      totalActions: this.actionCounts.total,
      actionsByType: { ...this.actionCounts.byType },
      actionsByCategory: { ...this.actionCounts.byCategory },
      recentActivityRate: recentActions.length / 60, // Actions per minute in last hour
      topActiveTokens,
      lastActionTime: this.actions.length > 0 ? this.actions[0].timestamp : 0
    };
  }

  /**
   * Get recent actions
   */
  getRecentActions(limit: number = 50, type?: string, category?: string): TokenAction[] {
    let filteredActions = this.actions;

    if (type) {
      filteredActions = filteredActions.filter(action => action.type === type);
    }

    if (category) {
      filteredActions = filteredActions.filter(action => action.category === category);
    }

    return filteredActions.slice(0, limit);
  }

  /**
   * Get actions for specific token
   */
  getTokenActions(tokenAddress: string, limit: number = 20): TokenAction[] {
    return this.actions
      .filter(action => action.tokenAddress === tokenAddress)
      .slice(0, limit);
  }

  /**
   * Clear all actions (for testing/debugging)
   */
  clearActions(): void {
    this.actions = [];
    this.actionCounts = {
      total: 0,
      byType: {},
      byCategory: {},
      byToken: {}
    };
    logger.info('🧹 Action log cleared');
  }

  /**
   * Get current status
   */
  getStatus(): any {
    return {
      isStarted: this.isStarted,
      actionCount: this.actions.length,
      stats: this.getStats(),
      memoryUsage: {
        actions: this.actions.length,
        maxActions: this.maxActions,
        utilizationPercent: (this.actions.length / this.maxActions) * 100
      }
    };
  }
}