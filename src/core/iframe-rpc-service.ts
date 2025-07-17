import { EventEmitter } from 'events';
import { Connection, PublicKey, Commitment } from '@solana/web3.js';
import { ConnectionManager } from './connection';

export class IframeRPCService extends EventEmitter {
  private connectionManager: ConnectionManager;
  private iframeDataCache: Map<string, any> = new Map();
  private connection: Connection;

  constructor() {
    super();
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    console.log('🔗 IframeRPCService initialized');
  }

  // Store data received from iframe
  storeIframeData(type: string, data: any): void {
    this.iframeDataCache.set(type, {
      data,
      timestamp: Date.now()
    });
    
    console.log(`📥 Stored iframe RPC data: ${type}`);
    this.emit('iframeDataReceived', { type, data });
  }

  // Get cached iframe data
  getIframeData(type: string): any {
    const cached = this.iframeDataCache.get(type);
    if (cached && (Date.now() - cached.timestamp) < 60000) { // 1 minute cache
      return cached.data;
    }
    return null;
  }

  // Enhanced getLatestBlockhash using iframe data when available
  async getLatestBlockhash(commitment: Commitment = 'processed'): Promise<any> {
    // Try to get from iframe cache first
    const iframeData = this.getIframeData('blockhash');
    if (iframeData) {
      console.log('📦 Using cached iframe blockhash');
      return {
        blockhash: iframeData.blockhash,
        lastValidBlockHeight: iframeData.lastValidBlockHeight
      };
    }

    // Fallback to direct RPC call
    try {
      const result = await this.connection.getLatestBlockhash(commitment);
      console.log('📦 Used direct RPC for blockhash');
      return result;
    } catch (error) {
      console.error('❌ Failed to get blockhash:', error);
      throw error;
    }
  }

  // Enhanced getAccountInfo using iframe data when available
  async getAccountInfo(address: PublicKey, commitment: Commitment = 'processed'): Promise<any> {
    const addressStr = address.toString();
    
    // Try to get from iframe cache first
    const iframeData = this.getIframeData(`accountInfo_${addressStr}`);
    if (iframeData) {
      console.log('📋 Using cached iframe account info');
      return iframeData;
    }

    // Fallback to direct RPC call
    try {
      const result = await this.connection.getAccountInfo(address, commitment);
      console.log('📋 Used direct RPC for account info');
      return result;
    } catch (error) {
      console.error('❌ Failed to get account info:', error);
      throw error;
    }
  }

  // Enhanced getProgramAccounts using iframe data when available
  async getProgramAccounts(programId: PublicKey, config?: any): Promise<any> {
    const programIdStr = programId.toString();
    
    // Try to get from iframe cache first
    const iframeData = this.getIframeData(`programAccounts_${programIdStr}`);
    if (iframeData) {
      console.log('📚 Using cached iframe program accounts');
      return iframeData;
    }

    // Fallback to direct RPC call
    try {
      const result = await this.connection.getProgramAccounts(programId, config);
      console.log('📚 Used direct RPC for program accounts');
      return result;
    } catch (error) {
      console.error('❌ Failed to get program accounts:', error);
      throw error;
    }
  }

  // Get the underlying connection for other operations
  getConnection(): Connection {
    return this.connection;
  }

  // Get health status
  getHealthStatus(): any {
    const iframeDataAge = Array.from(this.iframeDataCache.values())
      .map(cached => Date.now() - cached.timestamp)
      .filter(age => age < 60000); // Only count data less than 1 minute old

    return {
      hasIframeData: iframeDataAge.length > 0,
      iframeDataSources: this.iframeDataCache.size,
      freshDataSources: iframeDataAge.length,
      connectionHealthy: this.connection ? true : false
    };
  }

  // Clear old cached data
  clearOldCache(maxAge: number = 300000): void { // 5 minutes default
    const now = Date.now();
    for (const [key, cached] of this.iframeDataCache) {
      if (now - cached.timestamp > maxAge) {
        this.iframeDataCache.delete(key);
      }
    }
  }

  // Start periodic cache cleanup
  startCacheCleanup(): void {
    setInterval(() => {
      this.clearOldCache();
    }, 60000); // Clean every minute
  }
}

// Singleton instance
let iframeRPCService: IframeRPCService | null = null;

export function getIframeRPCService(): IframeRPCService {
  if (!iframeRPCService) {
    iframeRPCService = new IframeRPCService();
    iframeRPCService.startCacheCleanup();
  }
  return iframeRPCService;
}