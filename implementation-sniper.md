# Guide d'Implémentation - Sniper Bot

## Phase 1 : Setup Initial (Jour 1-2)

### 1.1 Structure du projet
```bash
mkdir solana-sniper-bot && cd solana-sniper-bot
npm init -y
```

### 1.2 Dependencies essentielles
```json
{
  "dependencies": {
    "@solana/web3.js": "^1.91.0",
    "@solana/spl-token": "^0.4.0",
    "@project-serum/anchor": "^0.30.0",
    "@raydium-io/raydium-sdk": "^1.3.1",
    "ws": "^8.16.0",
    "dotenv": "^16.4.0",
    "winston": "^3.11.0",
    "redis": "^4.6.0",
    "express": "^4.18.0",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/ws": "^8.5.10",
    "typescript": "^5.3.0",
    "ts-node": "^10.9.0",
    "nodemon": "^3.0.0",
    "jest": "^29.7.0"
  }
}
```

### 1.3 Configuration TypeScript
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  }
}
```

### 1.4 Variables d'environnement
```env
# .env.example
# RPC
RPC_PRIMARY=https://your-helius-endpoint
RPC_FALLBACK=https://your-quicknode-endpoint

# Wallet
PRIVATE_KEY=your-base58-private-key

# Trading
MODE=DRY_RUN
DEFAULT_INVESTMENT=0.03
MAX_POSITIONS=25
STOP_LOSS_PERCENT=-20

# Monitoring
LOG_LEVEL=verbose
DASHBOARD_PORT=3000

# Redis
REDIS_URL=redis://localhost:6379

# Jito (optional)
JITO_BLOCK_ENGINE_URL=
JITO_AUTH_KEYPAIR=
```

## Phase 2 : Core Components (Jour 3-5)

### 2.1 Connection Manager
```typescript
// src/core/connection.ts
import { Connection, Commitment } from '@solana/web3.js';

export class ConnectionManager {
  private connections: Map<string, Connection> = new Map();
  private currentIndex: number = 0;
  
  constructor(private endpoints: string[]) {
    this.initializeConnections();
  }
  
  private initializeConnections(): void {
    for (const endpoint of this.endpoints) {
      const connection = new Connection(endpoint, {
        commitment: 'processed' as Commitment,
        wsEndpoint: endpoint.replace('https', 'wss'),
        confirmTransactionInitialTimeout: 30000
      });
      
      this.connections.set(endpoint, connection);
    }
  }
  
  // Round-robin connection selection
  getConnection(): Connection {
    const endpoints = Array.from(this.connections.keys());
    const endpoint = endpoints[this.currentIndex % endpoints.length];
    this.currentIndex++;
    
    return this.connections.get(endpoint)!;
  }
  
  async getHealthiestConnection(): Promise<Connection> {
    // Implement health check logic
    const healthChecks = await Promise.all(
      Array.from(this.connections.entries()).map(async ([endpoint, conn]) => {
        try {
          const start = Date.now();
          await conn.getSlot();
          const latency = Date.now() - start;
          return { endpoint, conn, latency, healthy: true };
        } catch {
          return { endpoint, conn, latency: Infinity, healthy: false };
        }
      })
    );
    
    const healthiest = healthChecks
      .filter(c => c.healthy)
      .sort((a, b) => a.latency - b.latency)[0];
      
    return healthiest.conn;
  }
}
```

### 2.2 Wallet Manager
```typescript
// src/wallet/manager.ts
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

export class WalletManager {
  private mainWallet: Keypair;
  private tradingWallets: Keypair[] = [];
  private walletIndex: number = 0;
  
  constructor(privateKey: string, numTradingWallets: number = 5) {
    this.mainWallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    this.initializeTradingWallets(numTradingWallets);
  }
  
  private initializeTradingWallets(count: number): void {
    // Generate deterministic wallets from main wallet
    for (let i = 0; i < count; i++) {
      // Implementation for deterministic wallet generation
      const wallet = Keypair.generate(); // Simplified - use proper derivation
      this.tradingWallets.push(wallet);
    }
  }
  
  getTradingWallet(): Keypair {
    const wallet = this.tradingWallets[this.walletIndex % this.tradingWallets.length];
    this.walletIndex++;
    return wallet;
  }
  
  async ensureBalance(
    connection: Connection,
    wallet: Keypair,
    minBalance: number = 0.1
  ): Promise<void> {
    const balance = await connection.getBalance(wallet.publicKey);
    const minLamports = minBalance * LAMPORTS_PER_SOL;
    
    if (balance < minLamports) {
      const needed = minLamports - balance;
      await this.transferFromMain(connection, wallet.publicKey, needed);
    }
  }
}
```

## Phase 3 : Detection Engine (Jour 6-8)

### 3.1 WebSocket Listener Base
```typescript
// src/detection/base-listener.ts
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export abstract class BaseListener extends EventEmitter {
  protected ws: WebSocket | null = null;
  protected reconnectTimeout: NodeJS.Timeout | null = null;
  
  constructor(
    protected wsUrl: string,
    protected reconnectDelay: number = 1000
  ) {
    super();
  }
  
  connect(): void {
    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.on('open', () => {
        console.log(`Connected to ${this.constructor.name}`);
        this.onConnect();
      });
      
      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });
      
      this.ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
      });
      
      this.ws.on('close', () => {
        this.scheduleReconnect();
      });
      
    } catch (error) {
      console.error(`Failed to connect: ${error}`);
      this.scheduleReconnect();
    }
  }
  
  protected abstract onConnect(): void;
  protected abstract handleMessage(data: WebSocket.Data): void;
  
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, this.reconnectDelay);
  }
}
```

### 3.2 PumpFun Listener
```typescript
// src/detection/pumpfun-listener.ts
import { PublicKey } from '@solana/web3.js';
import { BaseListener } from './base-listener';

const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

export class PumpFunListener extends BaseListener {
  constructor(rpcWsUrl: string) {
    super(rpcWsUrl);
  }
  
  protected onConnect(): void {
    // Subscribe to pump.fun program logs
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: [PUMP_FUN_PROGRAM.toString()]
        },
        {
          commitment: 'processed'
        }
      ]
    };
    
    this.ws?.send(JSON.stringify(subscribeMessage));
  }
  
  protected handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.method === 'logsNotification') {
        const logs = message.params.result.value.logs;
        const signature = message.params.result.value.signature;
        
        // Parse for new token creation
        if (this.isNewTokenCreation(logs)) {
          const tokenInfo = this.parseTokenCreation(logs, signature);
          if (tokenInfo) {
            this.emit('newToken', tokenInfo);
          }
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }
  
  private isNewTokenCreation(logs: string[]): boolean {
    // Check for specific pump.fun creation patterns
    return logs.some(log => 
      log.includes('Program log: Instruction: Create') ||
      log.includes('InitializeMint')
    );
  }
  
  private parseTokenCreation(logs: string[], signature: string): TokenInfo | null {
    // Extract token mint address and metadata
    // This is simplified - implement proper parsing
    try {
      const mintAddress = this.extractMintAddress(logs);
      const timestamp = Date.now();
      
      return {
        mint: mintAddress,
        signature,
        timestamp,
        source: 'pump.fun',
        metadata: {
          // Parse additional metadata
        }
      };
    } catch {
      return null;
    }
  }
}

interface TokenInfo {
  mint: string;
  signature: string;
  timestamp: number;
  source: string;
  metadata: any;
}
```

## Phase 4 : Filtering System (Jour 9-11)

### 4.1 Security Filter
```typescript
// src/filters/security-filter.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

export class SecurityFilter {
  constructor(private connection: Connection) {}
  
  async checkToken(mintAddress: PublicKey): Promise<SecurityCheckResult> {
    const checks = await Promise.all([
      this.checkMintAuthority(mintAddress),
      this.checkFreezeAuthority(mintAddress),
      this.checkSupply(mintAddress),
      this.checkMetadata(mintAddress)
    ]);
    
    const failed = checks.filter(c => !c.passed);
    const score = ((checks.length - failed.length) / checks.length) * 100;
    
    return {
      passed: failed.length === 0,
      score,
      details: checks
    };
  }
  
  private async checkMintAuthority(mint: PublicKey): Promise<Check> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      const passed = mintInfo.mintAuthority === null;
      
      return {
        name: 'Mint Authority',
        passed,
        message: passed ? 'Mint authority disabled' : 'Mint authority still active'
      };
    } catch (error) {
      return {
        name: 'Mint Authority',
        passed: false,
        message: `Error checking mint: ${error}`
      };
    }
  }
  
  private async checkFreezeAuthority(mint: PublicKey): Promise<Check> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      const passed = mintInfo.freezeAuthority === null;
      
      return {
        name: 'Freeze Authority',
        passed,
        message: passed ? 'Freeze authority disabled' : 'Freeze authority still active'
      };
    } catch {
      return {
        name: 'Freeze Authority', 
        passed: false,
        message: 'Error checking freeze authority'
      };
    }
  }
  
  // Additional security checks...
}

interface SecurityCheckResult {
  passed: boolean;
  score: number;
  details: Check[];
}

interface Check {
  name: string;
  passed: boolean;
  message: string;
}
```

## Phase 5 : Trading Engine (Jour 12-14)

### 5.1 Trade Executor
```typescript
// src/trading/executor.ts
import { 
  Connection, 
  Transaction, 
  TransactionInstruction,
  PublicKey,
  Keypair,
  ComputeBudgetProgram,
  VersionedTransaction,
  TransactionMessage
} from '@solana/web3.js';

export class TradeExecutor {
  constructor(
    private connection: Connection,
    private jitoEnabled: boolean = false
  ) {}
  
  async executeSwap(params: SwapParams): Promise<string> {
    const { wallet, inputMint, outputMint, amount, slippage } = params;
    
    // Build swap transaction
    const swapIx = await this.buildSwapInstruction(params);
    
    // Add priority fee
    const priorityFee = await this.calculatePriorityFee();
    const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: priorityFee
    });
    
    // Build transaction
    const blockhash = await this.connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash.blockhash,
      instructions: [priorityIx, swapIx]
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet]);
    
    // Simulate first
    const simulation = await this.connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
    }
    
    // Send with retry
    return await this.sendWithRetry(transaction);
  }
  
  private async sendWithRetry(
    tx: VersionedTransaction, 
    maxRetries: number = 3
  ): Promise<string> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const signature = await this.connection.sendTransaction(tx, {
          maxRetries: 0,
          preflightCommitment: 'processed'
        });
        
        // Confirm transaction
        const confirmation = await this.connection.confirmTransaction(
          signature,
          'processed'
        );
        
        if (!confirmation.value.err) {
          return signature;
        }
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }
    
    throw lastError || new Error('Transaction failed after retries');
  }
  
  private async calculatePriorityFee(): Promise<number> {
    // Get recent priority fees
    const recentFees = await this.connection.getRecentPrioritizationFees();
    
    if (recentFees.length === 0) {
      return 1000; // Default 1000 microlamports
    }
    
    // Use 90th percentile
    const fees = recentFees.map(f => f.prioritizationFee).sort((a, b) => a - b);
    const index = Math.floor(fees.length * 0.9);
    
    return fees[index];
  }
}

interface SwapParams {
  wallet: Keypair;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number;
  slippage: number;
}
```

## Phase 6 : Monitoring & Dashboard (Jour 15-16)

### 6.1 Metrics Collector
```typescript
// src/monitoring/metrics.ts
export class MetricsCollector {
  private trades: Trade[] = [];
  private positions: Map<string, Position> = new Map();
  
  recordTrade(trade: Trade): void {
    this.trades.push(trade);
    this.updatePosition(trade);
  }
  
  private updatePosition(trade: Trade): void {
    const existing = this.positions.get(trade.mint);
    
    if (!existing) {
      this.positions.set(trade.mint, {
        mint: trade.mint,
        entryPrice: trade.price,
        amount: trade.amount,
        investedSol: trade.solAmount,
        timestamp: trade.timestamp,
        status: 'ACTIVE'
      });
    } else if (trade.type === 'SELL') {
      // Update position with exit info
      existing.exitPrice = trade.price;
      existing.roi = this.calculateROI(existing);
      existing.status = 'CLOSED';
    }
  }
  
  getStats(): Stats {
    const closedPositions = Array.from(this.positions.values())
      .filter(p => p.status === 'CLOSED');
    
    const totalInvested = closedPositions.reduce((sum, p) => sum + p.investedSol, 0);
    const totalReturns = closedPositions.reduce((sum, p) => 
      sum + (p.investedSol * (1 + (p.roi || 0) / 100)), 0
    );
    
    return {
      totalTrades: this.trades.length,
      activePositions: Array.from(this.positions.values())
        .filter(p => p.status === 'ACTIVE').length,
      closedPositions: closedPositions.length,
      winRate: this.calculateWinRate(),
      totalROI: ((totalReturns - totalInvested) / totalInvested) * 100,
      bestTrade: this.getBestTrade(),
      worstTrade: this.getWorstTrade()
    };
  }
}
```

## Testing Strategy

### Unit Tests
```typescript
// tests/filters/security.test.ts
describe('SecurityFilter', () => {
  it('should detect active mint authority', async () => {
    const result = await securityFilter.checkToken(testMint);
    expect(result.passed).toBe(false);
    expect(result.details).toContainEqual(
      expect.objectContaining({
        name: 'Mint Authority',
        passed: false
      })
    );
  });
});
```

### Integration Tests
```typescript
// tests/integration/trading.test.ts
describe('Trading Flow', () => {
  it('should execute full trade cycle in dry run', async () => {
    const bot = new SniperBot({ mode: 'DRY_RUN' });
    
    // Simulate token detection
    bot.handleNewToken(mockTokenInfo);
    
    // Wait for processing
    await sleep(1000);
    
    // Check if trade was simulated
    const stats = bot.getStats();
    expect(stats.totalTrades).toBeGreaterThan(0);
  });
});
```

## Deployment Checklist

- [ ] Environnement configuré
- [ ] RPC endpoints testés
- [ ] Wallet financé
- [ ] Mode DRY_RUN validé
- [ ] Logs configurés
- [ ] Dashboard accessible
- [ ] Tests passés
- [ ] Monitoring actif
- [ ] Backups configurés
- [ ] Documentation à jour