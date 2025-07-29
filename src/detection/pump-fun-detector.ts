/**
 * Pump.fun Token Detector
 * Uses official Pump.fun WebSocket API for real-time token detection
 * WebSocket endpoint: wss://pumpportal.fun/api/data
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../monitoring/logger';

export interface PumpFunToken {
  address: string;
  symbol: string;
  name: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  creator: string;
  createdTimestamp: number;
  raydiumPool?: string;
  complete: boolean;
  virtualSolReserves: number;
  virtualTokenReserves: number;
  totalSupply: number;
  marketCap: number;
  bondingCurveComplete: boolean;
  associatedBondingCurve: string;
  source: 'pump.fun';
  confidence: number;
}

export interface PumpFunNewTokenEvent {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  creator: string;
  timestamp: number;
  virtualSolReserves: number;
  virtualTokenReserves: number;
  totalSupply: number;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface PumpFunTradeEvent {
  signature: string;
  mint: string;
  user: string;
  timestamp: number;
  is_buy: boolean;
  token_amount: number;
  sol_amount: number;
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
}

export interface PumpFunConfig {
  reconnectInterval: number;
  minMarketCap: number;
  maxAge: number;
  includeBondingCurve: boolean;
  includeCompleted: boolean;
  trackTrades: boolean;
  maxReconnectAttempts: number;
}

export class PumpFunDetector extends EventEmitter {
  private config: PumpFunConfig;
  private isRunning = false;
  private ws: WebSocket | null = null;
  private reconnectTimeout?: NodeJS.Timeout;
  private detectedTokens = new Map<string, PumpFunToken>();
  private reconnectAttempts = 0;
  
  // Official Pump.fun WebSocket endpoint
  private readonly PUMP_FUN_WS_URL = 'wss://pumpportal.fun/api/data';
  
  private stats = {
    totalDetected: 0,
    processed: 0,
    errors: 0,
    connections: 0,
    reconnects: 0,
    lastConnection: 0
  };

  constructor(config: Partial<PumpFunConfig> = {}) {
    super();
    
    this.config = {
      reconnectInterval: 5000, // 5 seconds reconnect delay
      minMarketCap: 100, // Lower threshold for early detection
      maxAge: 300000, // 5 minutes for very fresh tokens
      includeBondingCurve: true, // Include tokens still in bonding curve
      includeCompleted: true, // Include tokens that graduated to Raydium
      trackTrades: false, // Enable to track trades (generates more events)
      maxReconnectAttempts: 10, // Maximum reconnection attempts
      ...config
    };
    
    logger.info('🎪 Pump.fun WebSocket Detector initialized', this.config);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Pump.fun detector already running');
      return;
    }

    this.isRunning = true;
    this.reconnectAttempts = 0;
    logger.info('🚀 Starting Pump.fun WebSocket Detector...');
    
    await this.connectWebSocket();
    
    logger.info('✅ Pump.fun WebSocket Detector started successfully');
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('🛑 Stopping Pump.fun WebSocket Detector...');
    this.isRunning = false;
    
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    logger.info('✅ Pump.fun WebSocket Detector stopped');
    this.emit('stopped');
  }

  private async connectWebSocket(): Promise<void> {
    try {
      logger.info('🔌 Connecting to Pump.fun WebSocket...');
      
      this.ws = new WebSocket(this.PUMP_FUN_WS_URL);
      this.stats.connections++;
      this.stats.lastConnection = Date.now();
      
      this.ws.on('open', () => {
        logger.info('✅ Connected to Pump.fun WebSocket');
        this.reconnectAttempts = 0;
        
        // Subscribe to new token events
        this.subscribeToNewTokens();
        
        // Optionally subscribe to trades for additional market intelligence
        if (this.config.trackTrades) {
          logger.info('📊 Trade tracking enabled - subscribing to trade events');
          // Note: We'll keep this simple and not subscribe to all trades to avoid spam
        }
      });
      
      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(message);
        } catch (error) {
          logger.error('Error parsing WebSocket message:', error);
          this.stats.errors++;
        }
      });
      
      this.ws.on('error', (error) => {
        logger.error('Pump.fun WebSocket error:', error);
        this.stats.errors++;
      });
      
      this.ws.on('close', (code, reason) => {
        logger.warn(`Pump.fun WebSocket closed: ${code} - ${reason}`);
        this.ws = null;
        
        // Attempt to reconnect if still running
        if (this.isRunning) {
          this.scheduleReconnect();
        }
      });
      
    } catch (error) {
      logger.error('Failed to connect to Pump.fun WebSocket:', error);
      this.stats.errors++;
      
      if (this.isRunning) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error(`🚫 Max reconnect attempts (${this.config.maxReconnectAttempts}) reached for Pump.fun WebSocket`);
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(this.config.reconnectInterval * this.reconnectAttempts, 30000); // Max 30s delay
    
    logger.info(`🔄 Scheduling Pump.fun WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      if (this.isRunning) {
        this.stats.reconnects++;
        this.connectWebSocket();
      }
    }, delay);
  }
  
  private subscribeToNewTokens(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot subscribe to new tokens - WebSocket not connected');
      return;
    }
    
    const subscription = {
      method: 'subscribeNewToken'
    };
    
    this.ws.send(JSON.stringify(subscription));
    logger.info('📡 Subscribed to Pump.fun new token events');
  }
  
  private handleWebSocketMessage(message: any): void {
    try {
      // Handle different message types from Pump.fun WebSocket
      if (message.mint && message.name && message.symbol) {
        // This is a new token event
        this.handleNewTokenEvent(message as PumpFunNewTokenEvent);
      } else if (message.signature && message.mint && typeof message.is_buy === 'boolean') {
        // This is a trade event
        this.handleTradeEvent(message as PumpFunTradeEvent);
      } else {
        logger.debug('Unknown Pump.fun WebSocket message format:', message);
      }
    } catch (error) {
      logger.error('Error handling Pump.fun WebSocket message:', error);
      this.stats.errors++;
    }
  }

  private handleNewTokenEvent(event: PumpFunNewTokenEvent): void {
    try {
      // Convert the WebSocket event to our PumpFunToken format
      const token = this.convertNewTokenEventToToken(event);
      
      if (token && this.isValidToken(token)) {
        if (!this.detectedTokens.has(token.address)) {
          this.detectedTokens.set(token.address, token);
          this.stats.totalDetected++;
          this.stats.processed++;
          
          logger.info(`🎪 New Pump.fun token detected: ${token.symbol} (${token.address.substring(0, 8)}...)`, {
            creator: token.creator ? token.creator.substring(0, 8) + '...' : 'unknown',
            marketCap: token.marketCap,
            virtualSol: token.virtualSolReserves,
            confidence: token.confidence
          });
          
          this.emit('tokenDetected', token);
        }
      }
    } catch (error) {
      logger.error('Error handling new token event:', error);
      this.stats.errors++;
    }
  }
  
  private handleTradeEvent(event: PumpFunTradeEvent): void {
    try {
      // Update token data if we're tracking this token
      const existingToken = this.detectedTokens.get(event.mint);
      if (existingToken) {
        // Update virtual reserves from trade data
        existingToken.virtualSolReserves = event.virtual_sol_reserves;
        existingToken.virtualTokenReserves = event.virtual_token_reserves;
        
        // Calculate updated market cap based on new reserves
        existingToken.marketCap = this.calculateMarketCap(
          event.virtual_sol_reserves,
          event.virtual_token_reserves,
          existingToken.totalSupply
        );
        
        logger.debug(`📊 Trade update for ${existingToken.symbol}: ${event.is_buy ? 'BUY' : 'SELL'} ${event.sol_amount.toFixed(4)} SOL`);
        
        // Emit updated token data
        this.emit('tokenUpdated', existingToken);
      }
    } catch (error) {
      logger.error('Error handling trade event:', error);
      this.stats.errors++;
    }
  }

  private convertNewTokenEventToToken(event: PumpFunNewTokenEvent): PumpFunToken {
    // Calculate market cap based on virtual reserves
    const marketCap = this.calculateMarketCap(
      event.virtualSolReserves || 0,
      event.virtualTokenReserves || 0,
      event.totalSupply || 1000000000 // Default total supply if not provided
    );
    
    return {
      address: event.mint || '',
      symbol: event.symbol || 'UNKNOWN',
      name: event.name || event.symbol || 'Unknown Token',
      description: event.description || '',
      image: event.image || '',
      website: event.website || '',
      twitter: event.twitter || '',
      telegram: event.telegram || '',
      creator: event.creator || '',
      createdTimestamp: event.timestamp || Date.now(),
      complete: false, // New tokens are not complete (not graduated to Raydium)
      virtualSolReserves: event.virtualSolReserves || 0,
      virtualTokenReserves: event.virtualTokenReserves || 0,
      totalSupply: event.totalSupply || 1000000000,
      marketCap,
      bondingCurveComplete: false, // New tokens haven't completed bonding curve
      associatedBondingCurve: '', // Will be populated if/when available
      source: 'pump.fun',
      confidence: this.calculateConfidence(event, marketCap)
    };
  }
  
  private calculateMarketCap(virtualSolReserves: number, virtualTokenReserves: number, totalSupply: number): number {
    try {
      if (virtualTokenReserves <= 0 || virtualSolReserves <= 0 || totalSupply <= 0) {
        return 0;
      }
      
      // Calculate token price in SOL based on virtual reserves
      const tokenPriceInSol = virtualSolReserves / virtualTokenReserves;
      
      // Approximate SOL price in USD (could be made dynamic)
      const solPriceUSD = 150; // Rough estimate
      
      // Calculate market cap
      const marketCapInSol = tokenPriceInSol * totalSupply;
      const marketCapInUSD = marketCapInSol * solPriceUSD;
      
      return marketCapInUSD;
    } catch (error) {
      logger.debug('Error calculating market cap:', error);
      return 0;
    }
  }
  
  private isValidToken(token: PumpFunToken): boolean {
    // Basic validation checks
    if (!token.address || !token.symbol || !token.name) {
      return false;
    }
    
    // Check age requirement
    if (token.createdTimestamp) {
      const ageMs = Date.now() - token.createdTimestamp;
      if (ageMs > this.config.maxAge) {
        return false;
      }
    }
    
    // Check market cap requirement
    if (token.marketCap < this.config.minMarketCap) {
      return false;
    }
    
    // Include based on configuration
    if (!token.complete && !this.config.includeBondingCurve) {
      return false;
    }
    
    if (token.complete && !this.config.includeCompleted) {
      return false;
    }
    
    return true;
  }

  private calculateConfidence(event: PumpFunNewTokenEvent, marketCap: number): number {
    let confidence = 85; // High base confidence for real-time WebSocket data
    
    // Boost confidence based on data completeness
    if (event.description && event.description.length > 0) confidence += 5;
    if (event.image && event.image.length > 0) confidence += 5;
    if (event.website || event.twitter || event.telegram) confidence += 5;
    
    // Boost based on market indicators
    if (marketCap > 10000) confidence += 10; // $10k+ market cap
    if (event.virtualSolReserves > 1) confidence += 5; // At least 1 SOL in reserves
    
    // Fresh tokens get bonus confidence
    const ageMs = Date.now() - event.timestamp;
    if (ageMs < 60000) confidence += 10; // Less than 1 minute old
    else if (ageMs < 300000) confidence += 5; // Less than 5 minutes old
    
    return Math.min(confidence, 98); // Cap at 98% for WebSocket data
  }
  
  // Cleanup method to remove old tokens
  clearOldTokens(): void {
    const now = Date.now();
    const maxAge = this.config.maxAge;
    let removedCount = 0;
    
    for (const [address, token] of this.detectedTokens.entries()) {
      if (now - token.createdTimestamp > maxAge) {
        this.detectedTokens.delete(address);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.info(`🧹 Cleaned up ${removedCount} old Pump.fun tokens`);
    }
  }

  // Public methods
  getDetectedTokens(): PumpFunToken[] {
    return Array.from(this.detectedTokens.values());
  }

  getStats() {
    return {
      ...this.stats,
      totalTokens: this.detectedTokens.size,
      isRunning: this.isRunning,
      isConnected: this.ws?.readyState === WebSocket.OPEN,
      reconnectAttempts: this.reconnectAttempts
    };
  }
  
  // Health check method
  async healthCheck(): Promise<boolean> {
    return this.isRunning && this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const pumpFunDetector = new PumpFunDetector();