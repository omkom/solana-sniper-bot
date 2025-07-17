import { Connection, Commitment } from '@solana/web3.js';
import { Config } from './config';

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private currentIndex: number = 0;
  private config: Config;

  constructor() {
    this.config = Config.getInstance();
    this.initializeConnections();
  }

  private initializeConnections(): void {
    const endpoints = [
      this.config.getRPCEndpoint(),
      this.config.getFallbackRPC()
    ];

    for (const endpoint of endpoints) {
      const connection = new Connection(endpoint, {
        commitment: 'confirmed' as Commitment,
        confirmTransactionInitialTimeout: 30000
      });
      
      this.connections.set(endpoint, connection);
      console.log(`📡 Connected to RPC: ${endpoint}`);
    }
  }

  getConnection(): Connection {
    const endpoints = Array.from(this.connections.keys());
    const endpoint = endpoints[this.currentIndex % endpoints.length];
    this.currentIndex++;
    
    return this.connections.get(endpoint)!;
  }

  async getHealthiestConnection(): Promise<Connection> {
    const healthChecks = await Promise.all(
      Array.from(this.connections.entries()).map(async ([endpoint, conn]) => {
        try {
          const start = Date.now();
          await conn.getSlot();
          const latency = Date.now() - start;
          return { endpoint, conn, latency, healthy: true };
        } catch (error) {
          console.warn(`⚠️ RPC health check failed for ${endpoint}:`, error);
          return { endpoint, conn, latency: Infinity, healthy: false };
        }
      })
    );

    const healthiest = healthChecks
      .filter(c => c.healthy)
      .sort((a, b) => a.latency - b.latency)[0];

    if (!healthiest) {
      throw new Error('No healthy RPC connections available');
    }

    return healthiest.conn;
  }

  async checkLatency(connection: Connection): Promise<number> {
    const start = Date.now();
    try {
      await connection.getSlot();
      return Date.now() - start;
    } catch {
      return Infinity;
    }
  }
}