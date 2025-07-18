import { EventEmitter } from 'events';
import { TokenInfo } from '../types';

export class DexScreenerTokenService extends EventEmitter {
  private tokens: Map<string, any> = new Map();
  private lastUpdateTime: number = 0;

  constructor() {
    super();
    console.log('🔍 DexScreenerTokenService initialized');
  }

  // Store tokens received from iframe
  storeTokens(tokens: any[]): void {
    console.log(`📊 Storing ${tokens.length} tokens from DexScreener`);
    
    const newTokens: any[] = [];
    
    tokens.forEach(token => {
      const existingToken = this.tokens.get(token.address);
      
      if (!existingToken) {
        // New token
        this.tokens.set(token.address, {
          ...token,
          firstSeen: Date.now(),
          lastUpdated: Date.now()
        });
        newTokens.push(token);
      } else {
        // Update existing token
        this.tokens.set(token.address, {
          ...existingToken,
          ...token,
          lastUpdated: Date.now()
        });
      }
    });

    this.lastUpdateTime = Date.now();
    
    // Emit new tokens for processing
    if (newTokens.length > 0) {
      console.log(`🆕 Found ${newTokens.length} new tokens`);
      this.emit('newTokens', newTokens);
    }
    
    // Emit all tokens update
    this.emit('tokensUpdated', Array.from(this.tokens.values()));
  }

  // Get all tokens
  getAllTokens(): any[] {
    return Array.from(this.tokens.values());
  }

  // Get recent tokens (last 24 hours)
  getRecentTokens(maxAge: number = 24 * 60 * 60 * 1000): any[] {
    const cutoff = Date.now() - maxAge;
    return Array.from(this.tokens.values()).filter(token => 
      token.firstSeen > cutoff
    );
  }

  // Get tokens by age
  getTokensByAge(maxAgeSeconds: number = 3600): any[] {
    return Array.from(this.tokens.values()).filter(token => 
      token.age <= maxAgeSeconds
    );
  }

  // Get tokens by liquidity
  getTokensByLiquidity(minLiquidity: number = 30): any[] {
    return Array.from(this.tokens.values()).filter(token => 
      token.liquidity >= minLiquidity
    );
  }

  // Convert DexScreener token to TokenInfo format
  convertToTokenInfo(dexToken: any): TokenInfo {
    const address = dexToken.address;
    return {
      address: address,
      mint: address,
      symbol: dexToken.symbol || 'UNKNOWN',
      name: dexToken.name || dexToken.symbol || 'Unknown Token',
      decimals: 9, // Default for most SPL tokens
      supply: '1000000000000000000', // Default 1B tokens
      signature: `DEXSCREENER_${Date.now()}`,
      timestamp: Date.now(),
      createdAt: Date.now() - (dexToken.age * 1000),
      detected: true,
      detectedAt: Date.now(),
      liquidity: {
        sol: dexToken.liquidity / 150, // Rough SOL conversion (assuming ~$150/SOL)
        usd: dexToken.liquidity
      },
      source: `DEXSCREENER_${dexToken.source || 'UNKNOWN'}`,
      metadata: {
        pairAge: dexToken.age,
        scrapedAt: Date.now(),
        price: dexToken.price || 0,
        volume24h: dexToken.volume24h || 0,
        originalData: dexToken
      }
    };
  }

  // Get tokens ready for analysis
  getTokensForAnalysis(): TokenInfo[] {
    const recentTokens = this.getTokensByAge(3600); // 1 hour max age
    const liquidTokens = recentTokens.filter(token => token.liquidity >= 30);
    
    return liquidTokens.map(token => this.convertToTokenInfo(token));
  }

  // Get statistics
  getStats(): any {
    const allTokens = Array.from(this.tokens.values());
    const recentTokens = this.getRecentTokens();
    
    return {
      totalTokens: allTokens.length,
      recentTokens: recentTokens.length,
      lastUpdateTime: this.lastUpdateTime,
      avgAge: allTokens.reduce((sum, token) => sum + token.age, 0) / allTokens.length || 0,
      avgLiquidity: allTokens.reduce((sum, token) => sum + token.liquidity, 0) / allTokens.length || 0,
      sources: this.getSourceStats()
    };
  }

  // Get source statistics
  private getSourceStats(): any {
    const sources: { [key: string]: number } = {};
    
    Array.from(this.tokens.values()).forEach(token => {
      const source = token.source || 'UNKNOWN';
      sources[source] = (sources[source] || 0) + 1;
    });
    
    return sources;
  }

  // Clean old tokens
  cleanOldTokens(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    let removedCount = 0;
    
    for (const [address, token] of this.tokens) {
      if (token.firstSeen < cutoff) {
        this.tokens.delete(address);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`🧹 Cleaned ${removedCount} old tokens`);
    }
  }

  // Start automatic cleanup
  startCleanup(): void {
    // Clean old tokens every hour
    setInterval(() => {
      this.cleanOldTokens();
    }, 60 * 60 * 1000);
  }

  // Get token by address
  getToken(address: string): any {
    return this.tokens.get(address);
  }

  // Check if token exists
  hasToken(address: string): boolean {
    return this.tokens.has(address);
  }

  // Get token count
  getTokenCount(): number {
    return this.tokens.size;
  }
}

// Singleton instance
let dexScreenerTokenService: DexScreenerTokenService | null = null;

export function getDexScreenerTokenService(): DexScreenerTokenService {
  if (!dexScreenerTokenService) {
    dexScreenerTokenService = new DexScreenerTokenService();
    dexScreenerTokenService.startCleanup();
  }
  return dexScreenerTokenService;
}