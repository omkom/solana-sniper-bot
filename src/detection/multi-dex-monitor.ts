/**
 * Multi-DEX Monitor
 * Real-time monitoring of Raydium, Orca, Meteora, Pump.fun, Jupiter, and Serum
 * Monitors token launches and calculates cross-DEX arbitrage opportunities
 */

import { EventEmitter } from 'events';
import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../monitoring/logger';
import { UnifiedTokenInfo } from '../types/unified';
import { ConnectionPool } from '../core/connection-pool';
import WebSocket from 'ws';

export interface DexConfig {
  name: string;
  enabled: boolean;
  programId: string;
  websocketUrl?: string;
  apiEndpoint?: string;
  poolCreationSignature: string;
}

export interface PoolInfo {
  dexName: string;
  poolAddress: string;
  baseToken: string;
  quoteToken: string;
  baseSymbol: string;
  quoteSymbol: string;
  liquidity: number;
  price: number;
  volume24h: number;
  createdAt: number;
  fees: number;
  lpTokenSupply: number;
}

export interface ArbitrageOpportunity {
  token: string;
  symbol: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  priceDifference: number;
  profitPotential: number;
  confidence: number;
  timestamp: number;
}

export interface TokenMigration {
  token: string;
  symbol: string;
  fromDex: string;
  toDex: string;
  liquidityMoved: number;
  timestamp: number;
  reason: string;
}

export class MultiDexMonitor extends EventEmitter {
  private connectionPool: ConnectionPool;
  private isRunning = false;
  private dexConfigs: Map<string, DexConfig> = new Map();
  private activePools: Map<string, PoolInfo> = new Map();
  private priceTracker: Map<string, Map<string, number>> = new Map(); // token -> dex -> price
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private wsConnections: Map<string, WebSocket> = new Map();

  // DEX Program IDs (Solana)
  private readonly DEX_PROGRAMS = {
    RAYDIUM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    ORCA: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
    METEORA: 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
    SERUM: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
    JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
  };

  constructor(connectionPool: ConnectionPool) {
    super();
    this.connectionPool = connectionPool;
    this.initializeDexConfigs();
    logger.info('🔄 Multi-DEX Monitor initialized');
  }

  private initializeDexConfigs(): void {
    // Raydium configuration
    this.dexConfigs.set('raydium', {
      name: 'Raydium',
      enabled: true,
      programId: this.DEX_PROGRAMS.RAYDIUM,
      websocketUrl: 'wss://api.raydium.io/v2/ws',
      apiEndpoint: 'https://api.raydium.io/v2',
      poolCreationSignature: 'CreatePool'
    });

    // Orca configuration
    this.dexConfigs.set('orca', {
      name: 'Orca',
      enabled: true,
      programId: this.DEX_PROGRAMS.ORCA,
      apiEndpoint: 'https://api.orca.so',
      poolCreationSignature: 'InitializePool'
    });

    // Meteora configuration
    this.dexConfigs.set('meteora', {
      name: 'Meteora',
      enabled: true,
      programId: this.DEX_PROGRAMS.METEORA,
      apiEndpoint: 'https://app.meteora.ag/api',
      poolCreationSignature: 'Initialize'
    });

    // Jupiter configuration
    this.dexConfigs.set('jupiter', {
      name: 'Jupiter',
      enabled: true,
      programId: this.DEX_PROGRAMS.JUPITER,
      apiEndpoint: 'https://quote-api.jup.ag/v6',
      poolCreationSignature: 'CreateMarket'
    });

    // Serum configuration
    this.dexConfigs.set('serum', {
      name: 'Serum',
      enabled: true,
      programId: this.DEX_PROGRAMS.SERUM,
      apiEndpoint: 'https://api.projectserum.com',
      poolCreationSignature: 'InitializeMarket'
    });

    // Pump.fun configuration
    this.dexConfigs.set('pumpfun', {
      name: 'Pump.fun',
      enabled: true,
      programId: this.DEX_PROGRAMS.PUMP_FUN,
      apiEndpoint: 'https://frontend-api.pump.fun',
      poolCreationSignature: 'create'
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Multi-DEX Monitor already running');
      return;
    }

    logger.info('🚀 Starting Multi-DEX Monitor...');

    try {
      // Start monitoring each enabled DEX
      for (const [dexName, config] of this.dexConfigs.entries()) {
        if (config.enabled) {
          await this.startDexMonitoring(dexName, config);
        }
      }

      // Start arbitrage detection
      this.startArbitrageDetection();

      // Start migration detection
      this.startMigrationDetection();

      this.isRunning = true;
      logger.info('✅ Multi-DEX Monitor started successfully');
      this.emit('started');

    } catch (error) {
      logger.error('❌ Failed to start Multi-DEX Monitor:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('🛑 Stopping Multi-DEX Monitor...');

    // Close WebSocket connections
    for (const [dex, ws] of this.wsConnections.entries()) {
      ws.close();
      logger.debug(`Closed WebSocket connection for ${dex}`);
    }
    this.wsConnections.clear();

    // Clear monitoring intervals
    for (const [dex, interval] of this.monitoringIntervals.entries()) {
      clearInterval(interval);
      logger.debug(`Stopped monitoring interval for ${dex}`);
    }
    this.monitoringIntervals.clear();

    this.isRunning = false;
    logger.info('✅ Multi-DEX Monitor stopped');
    this.emit('stopped');
  }

  private async startDexMonitoring(dexName: string, config: DexConfig): Promise<void> {
    logger.info(`🔍 Starting monitoring for ${config.name}...`);

    try {
      // Start WebSocket monitoring if available
      if (config.websocketUrl) {
        await this.startWebSocketMonitoring(dexName, config);
      }

      // Start periodic API polling
      this.startPeriodicMonitoring(dexName, config);

      // Monitor blockchain events for this DEX
      this.startBlockchainMonitoring(dexName, config);

      logger.info(`✅ ${config.name} monitoring started`);

    } catch (error) {
      logger.error(`❌ Failed to start monitoring for ${config.name}:`, error);
    }
  }

  private async startWebSocketMonitoring(dexName: string, config: DexConfig): Promise<void> {
    if (!config.websocketUrl) return;

    try {
      const ws = new WebSocket(config.websocketUrl);
      
      ws.onopen = () => {
        logger.info(`🔌 WebSocket connected to ${config.name}`);
        
        // Subscribe to relevant events based on DEX
        if (dexName === 'raydium') {
          ws.send(JSON.stringify({
            method: 'subscribe',
            params: ['poolCreated', 'liquidityAdded']
          }));
        }
      };

      ws.onmessage = (event: any) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(dexName, data);
        } catch (error) {
          logger.error(`Error parsing WebSocket message from ${config.name}:`, error);
        }
      };

      ws.onerror = (error: any) => {
        logger.error(`WebSocket error for ${config.name}:`, error);
      };

      ws.onclose = () => {
        logger.warn(`WebSocket closed for ${config.name}, attempting reconnect...`);
        setTimeout(() => this.startWebSocketMonitoring(dexName, config), 5000);
      };

      this.wsConnections.set(dexName, ws);

    } catch (error) {
      logger.error(`Failed to connect WebSocket for ${config.name}:`, error);
    }
  }

  private startPeriodicMonitoring(dexName: string, config: DexConfig): void {
    const interval = setInterval(async () => {
      try {
        await this.fetchLatestPools(dexName, config);
      } catch (error) {
        logger.error(`Error in periodic monitoring for ${config.name}:`, error);
      }
    }, 30000); // Every 30 seconds

    this.monitoringIntervals.set(dexName, interval);
  }

  private startBlockchainMonitoring(dexName: string, config: DexConfig): void {
    // Monitor blockchain for program-specific events
    const connection = this.connectionPool.getConnection();
    
    // Subscribe to program account changes
    const programId = new PublicKey(config.programId);
    
    connection.onProgramAccountChange(
      programId,
      (accountInfo, context) => {
        this.handleProgramAccountChange(dexName, accountInfo, context);
      }
    );
  }

  private handleWebSocketMessage(dexName: string, data: any): void {
    try {
      if (data.method === 'poolCreated' || data.event === 'newPool') {
        const poolInfo = this.parsePoolInfo(dexName, data);
        if (poolInfo) {
          this.handleNewPool(poolInfo);
        }
      } else if (data.method === 'liquidityAdded' || data.event === 'liquidityChange') {
        this.handleLiquidityChange(dexName, data);
      }
    } catch (error) {
      logger.error(`Error handling WebSocket message from ${dexName}:`, error);
    }
  }

  private async fetchLatestPools(dexName: string, config: DexConfig): Promise<void> {
    try {
      let pools: any[] = [];

      switch (dexName) {
        case 'raydium':
          pools = await this.fetchRaydiumPools(config);
          break;
        case 'orca':
          pools = await this.fetchOrcaPools(config);
          break;
        case 'meteora':
          pools = await this.fetchMeteoraPools(config);
          break;
        case 'jupiter':
          pools = await this.fetchJupiterPools(config);
          break;
        case 'serum':
          pools = await this.fetchSerumPools(config);
          break;
        case 'pumpfun':
          pools = await this.fetchPumpFunPools(config);
          break;
      }

      // Process new pools
      for (const poolData of pools) {
        const poolInfo = this.parsePoolInfo(dexName, poolData);
        if (poolInfo && this.isNewPool(poolInfo)) {
          this.handleNewPool(poolInfo);
        }
      }

    } catch (error) {
      logger.error(`Error fetching pools from ${config.name}:`, error);
    }
  }

  private async fetchRaydiumPools(config: DexConfig): Promise<any[]> {
    // Simulate Raydium API call
    return [];
  }

  private async fetchOrcaPools(config: DexConfig): Promise<any[]> {
    // Simulate Orca API call
    return [];
  }

  private async fetchMeteoraPools(config: DexConfig): Promise<any[]> {
    // Simulate Meteora API call
    return [];
  }

  private async fetchJupiterPools(config: DexConfig): Promise<any[]> {
    // Simulate Jupiter API call
    return [];
  }

  private async fetchSerumPools(config: DexConfig): Promise<any[]> {
    // Simulate Serum API call
    return [];
  }

  private async fetchPumpFunPools(config: DexConfig): Promise<any[]> {
    // Simulate Pump.fun API call
    return [];
  }

  private parsePoolInfo(dexName: string, data: any): PoolInfo | null {
    try {
      // Parse pool information based on DEX format
      const poolInfo: PoolInfo = {
        dexName,
        poolAddress: data.poolAddress || data.pool_address || '',
        baseToken: data.baseToken || data.base_token || '',
        quoteToken: data.quoteToken || data.quote_token || '',
        baseSymbol: data.baseSymbol || data.base_symbol || 'UNKNOWN',
        quoteSymbol: data.quoteSymbol || data.quote_symbol || 'SOL',
        liquidity: data.liquidity || data.total_liquidity || 0,
        price: data.price || data.current_price || 0,
        volume24h: data.volume24h || data.volume_24h || 0,
        createdAt: data.createdAt || data.created_at || Date.now(),
        fees: data.fees || data.fee_rate || 0,
        lpTokenSupply: data.lpTokenSupply || data.lp_token_supply || 0
      };

      return poolInfo;
    } catch (error) {
      logger.error(`Error parsing pool info from ${dexName}:`, error);
      return null;
    }
  }

  private isNewPool(poolInfo: PoolInfo): boolean {
    const key = `${poolInfo.dexName}-${poolInfo.poolAddress}`;
    return !this.activePools.has(key);
  }

  private handleNewPool(poolInfo: PoolInfo): void {
    const key = `${poolInfo.dexName}-${poolInfo.poolAddress}`;
    this.activePools.set(key, poolInfo);

    logger.info(`🏊 New pool detected on ${poolInfo.dexName}: ${poolInfo.baseSymbol}/${poolInfo.quoteSymbol}`);

    // Update price tracker
    this.updatePriceTracker(poolInfo);

    // Emit events
    this.emit('newPool', poolInfo);
    
    // Create token info for unified system
    const tokenInfo: UnifiedTokenInfo = {
      address: poolInfo.baseToken,
      symbol: poolInfo.baseSymbol,
      name: poolInfo.baseSymbol,
      decimals: 9,
      detected: true,
      detectedAt: Date.now(),
      source: poolInfo.dexName,
      liquidity: { sol: poolInfo.liquidity, usd: poolInfo.liquidity * 100 }, // Rough conversion
      volume24h: poolInfo.volume24h,
      priceUsd: poolInfo.price,
      pairAddress: poolInfo.poolAddress,
      dexId: poolInfo.dexName
    };

    this.emit('tokenLaunched', tokenInfo);
  }

  private handleLiquidityChange(dexName: string, data: any): void {
    logger.debug(`💧 Liquidity change detected on ${dexName}`);
    this.emit('liquidityAdded', { dex: dexName, data });
  }

  private handleProgramAccountChange(dexName: string, accountInfo: any, context: any): void {
    logger.debug(`🔄 Program account change detected on ${dexName}`);
    // Process blockchain-level changes
  }

  private updatePriceTracker(poolInfo: PoolInfo): void {
    const token = poolInfo.baseToken;
    
    if (!this.priceTracker.has(token)) {
      this.priceTracker.set(token, new Map());
    }
    
    const tokenPrices = this.priceTracker.get(token)!;
    tokenPrices.set(poolInfo.dexName, poolInfo.price);
  }

  private startArbitrageDetection(): void {
    const interval = setInterval(() => {
      this.detectArbitrageOpportunities();
    }, 10000); // Every 10 seconds

    this.monitoringIntervals.set('arbitrage', interval);
  }

  private detectArbitrageOpportunities(): void {
    for (const [token, dexPrices] of this.priceTracker.entries()) {
      if (dexPrices.size < 2) continue; // Need at least 2 DEXes for arbitrage

      const prices = Array.from(dexPrices.entries());
      
      for (let i = 0; i < prices.length; i++) {
        for (let j = i + 1; j < prices.length; j++) {
          const [dex1, price1] = prices[i];
          const [dex2, price2] = prices[j];
          
          const priceDiff = Math.abs(price1 - price2);
          const avgPrice = (price1 + price2) / 2;
          const percentageDiff = (priceDiff / avgPrice) * 100;
          
          // Arbitrage opportunity if price difference > 3%
          if (percentageDiff > 3) {
            const opportunity: ArbitrageOpportunity = {
              token,
              symbol: 'UNKNOWN', // Would need to resolve from token address
              buyDex: price1 < price2 ? dex1 : dex2,
              sellDex: price1 < price2 ? dex2 : dex1,
              buyPrice: Math.min(price1, price2),
              sellPrice: Math.max(price1, price2),
              priceDifference: priceDiff,
              profitPotential: percentageDiff,
              confidence: Math.min(100, percentageDiff * 10),
              timestamp: Date.now()
            };

            logger.info(`⚡ Arbitrage opportunity: ${opportunity.profitPotential.toFixed(2)}% between ${opportunity.buyDex} and ${opportunity.sellDex}`);
            this.emit('arbitrageOpportunity', opportunity);
          }
        }
      }
    }
  }

  private startMigrationDetection(): void {
    const interval = setInterval(() => {
      this.detectTokenMigrations();
    }, 60000); // Every minute

    this.monitoringIntervals.set('migration', interval);
  }

  private detectTokenMigrations(): void {
    // Detect significant liquidity movements between DEXes
    // This would involve comparing historical liquidity data
    logger.debug('🔄 Checking for token migrations...');
  }

  subscribe(dexName: string): boolean {
    const config = this.dexConfigs.get(dexName);
    if (!config) {
      logger.error(`Unknown DEX: ${dexName}`);
      return false;
    }

    config.enabled = true;
    
    if (this.isRunning) {
      this.startDexMonitoring(dexName, config);
    }

    logger.info(`✅ Subscribed to ${config.name}`);
    return true;
  }

  unsubscribe(dexName: string): boolean {
    const config = this.dexConfigs.get(dexName);
    if (!config) {
      logger.error(`Unknown DEX: ${dexName}`);
      return false;
    }

    config.enabled = false;

    // Close WebSocket if exists
    const ws = this.wsConnections.get(dexName);
    if (ws) {
      ws.close();
      this.wsConnections.delete(dexName);
    }

    // Clear monitoring interval
    const interval = this.monitoringIntervals.get(dexName);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(dexName);
    }

    logger.info(`❌ Unsubscribed from ${config.name}`);
    return true;
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      enabledDexes: Array.from(this.dexConfigs.entries())
        .filter(([, config]) => config.enabled)
        .map(([name, config]) => config.name),
      activePools: this.activePools.size,
      trackedTokens: this.priceTracker.size,
      wsConnections: this.wsConnections.size
    };
  }

  getActivePools(): PoolInfo[] {
    return Array.from(this.activePools.values());
  }

  getTokenPrices(token: string): Map<string, number> | undefined {
    return this.priceTracker.get(token);
  }
}