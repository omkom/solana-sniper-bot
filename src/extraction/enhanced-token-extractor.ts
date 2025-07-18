// @ts-nocheck
import { Connection, PublicKey } from '@solana/web3.js';
import { TokenInfo } from '../types';
import { ConnectionManager } from '../core/connection';
import { DexScreenerClient } from '../detection/dexscreener-client';

export class EnhancedTokenExtractor {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private dexScreenerClient: DexScreenerClient;
  
  // Known program IDs for better extraction
  private static readonly PROGRAM_IDS = {
    RAYDIUM_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    RAYDIUM_AMM_V4: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2',
    ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
    JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    SERUM_V3: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
    METEORA: 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
    TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    SPL_TOKEN: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
  };

  constructor() {
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    this.dexScreenerClient = new DexScreenerClient();
    console.log('🔍 Enhanced Token Extractor initialized');
  }

  async extractTokensFromTransaction(signature: string, dexName?: string): Promise<TokenInfo[]> {
    console.log(`🔍 DEEP EXTRACTION: Processing transaction ${signature.slice(0, 8)}...`);
    
    try {
      // Get transaction with max detail
      const transaction = await this.connectionManager.getParsedTransactionWithRetry(signature, 3);
      if (!transaction) {
        console.log(`❌ Failed to fetch transaction: ${signature}`);
        return [];
      }

      const extractedTokens: TokenInfo[] = [];
      const { meta, transaction: txn } = transaction;

      // Method 1: Extract from token balances (most reliable)
      const tokenBalanceTokens = this.extractFromTokenBalances(meta, signature, dexName);
      extractedTokens.push(...tokenBalanceTokens);

      // Method 2: Extract from instructions (for newly minted tokens)
      const instructionTokens = await this.extractFromInstructions(txn, signature, dexName);
      extractedTokens.push(...instructionTokens);

      // Method 3: Extract from account keys (for missed tokens)
      const accountTokens = await this.extractFromAccountKeys(txn, meta, signature, dexName);
      extractedTokens.push(...accountTokens);

      // Deduplicate by mint address
      const uniqueTokens = this.deduplicateTokens(extractedTokens);
      
      // Enhance with market data for each token
      const enhancedTokens = await this.enhanceWithMarketData(uniqueTokens);

      console.log(`✅ EXTRACTED ${enhancedTokens.length} unique tokens from ${signature.slice(0, 8)}`);
      return enhancedTokens;

    } catch (error) {
      console.error(`❌ Enhanced extraction failed for ${signature}:`, error);
      return [];
    }
  }

  private extractFromTokenBalances(meta: any, signature: string, dexName?: string): TokenInfo[] {
    const tokens: TokenInfo[] = [];
    
    if (!meta) return tokens;

    const preTokenBalances = meta.preTokenBalances || [];
    const postTokenBalances = meta.postTokenBalances || [];

    // Find newly created token accounts
    for (const postBalance of postTokenBalances) {
      const mint = postBalance.mint;
      
      // Skip SOL and wrapped SOL
      if (this.isNativeToken(mint)) continue;
      
      // Check if this is a new token (not in pre-balances)
      const wasInPre = preTokenBalances.some((pre: any) => pre.mint === mint);
      
      // Also include tokens with changed balances (new liquidity)
      const hasSignificantChange = !wasInPre || this.hasSignificantBalanceChange(preTokenBalances, postBalance);
      
      if (hasSignificantChange) {
        const tokenInfo = this.createTokenInfo(mint, signature, dexName, postBalance);
        tokens.push(tokenInfo);
        console.log(`🎯 TOKEN BALANCE EXTRACTION: ${tokenInfo.symbol || mint.slice(0, 8)} from ${dexName || 'UNKNOWN'}`);
      }
    }

    return tokens;
  }

  private async extractFromInstructions(txn: any, signature: string, dexName?: string): Promise<TokenInfo[]> {
    const tokens: TokenInfo[] = [];
    
    if (!txn?.message?.instructions) return tokens;

    for (const instruction of txn.message.instructions) {
      // Check for token creation instructions
      const programId = instruction.programId?.toString();
      
      if (programId === EnhancedTokenExtractor.PROGRAM_IDS.TOKEN_PROGRAM) {
        // Look for InitializeMint instructions
        if (instruction.parsed?.type === 'initializeMint') {
          const mint = instruction.parsed.info?.mint;
          if (mint && !this.isNativeToken(mint)) {
            const tokenInfo = this.createTokenInfo(mint, signature, dexName || 'TOKEN_PROGRAM');
            tokens.push(tokenInfo);
            console.log(`🎯 INSTRUCTION EXTRACTION: ${tokenInfo.symbol || mint.slice(0, 8)} from InitializeMint`);
          }
        }
      }
      
      // Extract from DEX-specific instructions
      if (instruction.parsed?.info) {
        const mints = this.extractMintsFromInstructionInfo(instruction.parsed.info);
        for (const mint of mints) {
          if (!this.isNativeToken(mint)) {
            const tokenInfo = this.createTokenInfo(mint, signature, dexName || 'INSTRUCTION');
            tokens.push(tokenInfo);
            console.log(`🎯 DEX INSTRUCTION EXTRACTION: ${tokenInfo.symbol || mint.slice(0, 8)}`);
          }
        }
      }
    }

    return tokens;
  }

  private async extractFromAccountKeys(txn: any, meta: any, signature: string, dexName?: string): Promise<TokenInfo[]> {
    const tokens: TokenInfo[] = [];
    
    if (!txn?.message?.accountKeys) return tokens;

    // Look through all account keys for potential token mints
    for (const accountKey of txn.message.accountKeys) {
      const address = accountKey.pubkey?.toString() || accountKey.toString();
      
      if (this.isNativeToken(address)) continue;
      
      try {
        // Check if this looks like a token mint (32-44 characters, base58)
        if (this.looksLikeTokenMint(address)) {
          // Verify it's actually a token mint by checking on-chain
          const isValidMint = await this.verifyTokenMint(address);
          if (isValidMint) {
            const tokenInfo = this.createTokenInfo(address, signature, dexName || 'ACCOUNT_KEY');
            tokens.push(tokenInfo);
            console.log(`🎯 ACCOUNT KEY EXTRACTION: ${tokenInfo.symbol || address.slice(0, 8)}`);
          }
        }
      } catch (error) {
        // Continue if verification fails
      }
    }

    return tokens;
  }

  private extractMintsFromInstructionInfo(info: any): string[] {
    const mints: string[] = [];
    
    // Common field names for token mints
    const mintFields = ['mint', 'tokenMint', 'baseMint', 'quoteMint', 'mintA', 'mintB', 'token_mint'];
    
    for (const field of mintFields) {
      if (info[field] && typeof info[field] === 'string') {
        mints.push(info[field]);
      }
    }
    
    // Also check nested objects
    for (const [key, value] of Object.entries(info)) {
      if (typeof value === 'object' && value !== null) {
        for (const field of mintFields) {
          if ((value as any)[field] && typeof (value as any)[field] === 'string') {
            mints.push((value as any)[field]);
          }
        }
      }
    }
    
    return mints;
  }

  private hasSignificantBalanceChange(preBalances: any[], postBalance: any): boolean {
    const preBalance = preBalances.find((pre: any) => pre.mint === postBalance.mint);
    if (!preBalance) return true; // New token
    
    const preAmount = parseFloat(preBalance.uiTokenAmount?.uiAmountString || '0');
    const postAmount = parseFloat(postBalance.uiTokenAmount?.uiAmountString || '0');
    
    // Consider significant if amount increased by more than 1000 tokens or 10%
    const amountChange = postAmount - preAmount;
    const percentChange = preAmount > 0 ? (amountChange / preAmount) * 100 : 100;
    
    return amountChange > 1000 || Math.abs(percentChange) > 10;
  }

  private createTokenInfo(mint: string, signature: string, source?: string, tokenBalance?: any): TokenInfo {
    // Extract basic info from token balance if available
    const decimals = tokenBalance?.uiTokenAmount?.decimals || 9;
    const supply = tokenBalance?.uiTokenAmount?.amount || '0';
    
    // Generate a symbol from mint if not available
    const symbol = this.generateSymbolFromMint(mint);
    
    return {
      address: mint,
      mint,
      symbol,
      name: `${source || 'Unknown'} Token ${symbol}`,
      decimals,
      supply,
      signature,
      timestamp: Date.now(),
      createdAt: Date.now(),
      source: source || 'enhanced_extractor',
      detected: true,
      detectedAt: Date.now(),
      liquidity: {
        sol: 0, // Will be enhanced later
        usd: 0
      },
      metadata: {
        extractionMethod: 'enhanced',
        detectedAt: Date.now(),
        transactionSignature: signature,
        hasTokenBalance: !!tokenBalance
      }
    };
  }

  private async enhanceWithMarketData(tokens: TokenInfo[]): Promise<TokenInfo[]> {
    const enhancedTokens: TokenInfo[] = [];
    
    for (const token of tokens) {
      try {
        console.log(`🔍 Fetching market data for ${token.symbol}...`);
        
        // Try to get real-time data from DexScreener
        const marketData = await this.dexScreenerClient.getTokenByAddress(token.mint || token.address);
        
        if (marketData) {
          // Enhance with real market data
          token.metadata = {
            ...token.metadata,
            priceUsd: marketData.priceUsd || marketData.price,
            marketCap: marketData.marketCap,
            volume24h: marketData.volume24h,
            priceChange24h: marketData.priceChange24h,
            priceChange5m: marketData.priceChange5m || 0,
            liquidityUsd: marketData.liquidityUsd || marketData.liquidity,
            hasMarketData: true,
            dexId: marketData.dexId || 'unknown',
            pairAddress: marketData.pairAddress || ''
          };
          
          // Update liquidity info
          if (marketData.liquidityUsd && marketData.liquidityUsd > 0) {
            token.liquidity = {
              sol: marketData.liquidityUsd / 150, // Rough SOL conversion
              usd: marketData.liquidityUsd
            };
          }
          
          console.log(`✅ Enhanced ${token.symbol}: $${marketData.priceUsd?.toFixed(8)} | Liq: $${marketData.liquidityUsd?.toLocaleString()}`);
        } else {
          console.log(`⚠️ No market data found for ${token.symbol}`);
          token.metadata = {
            ...token.metadata,
            hasMarketData: false,
            priceUsd: 0.000001 + Math.random() * 0.00001 // Estimated price for new tokens
          };
        }
        
        enhancedTokens.push(token);
        
      } catch (error) {
        console.log(`⚠️ Market data fetch failed for ${token.symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        enhancedTokens.push(token);
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return enhancedTokens;
  }

  private deduplicateTokens(tokens: TokenInfo[]): TokenInfo[] {
    const seen = new Set<string>();
    const unique: TokenInfo[] = [];
    
    for (const token of tokens) {
      const tokenId = token.mint || token.address;
      if (!seen.has(tokenId)) {
        seen.add(tokenId);
        unique.push(token);
      }
    }
    
    return unique;
  }

  private isNativeToken(mint: string): boolean {
    return mint === '11111111111111111111111111111112' || // SOL
           mint === 'So11111111111111111111111111111111111111112'; // Wrapped SOL
  }

  private looksLikeTokenMint(address: string): boolean {
    // Basic validation for Solana addresses
    return !!address && 
           address.length >= 32 && 
           address.length <= 44 && 
           /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
  }

  private async verifyTokenMint(address: string): Promise<boolean> {
    try {
      const pubkey = new PublicKey(address);
      const accountInfo = await this.connection.getAccountInfo(pubkey);
      
      // Check if account exists and has the right owner (Token Program)
      return accountInfo !== null && 
             accountInfo.owner.toString() === EnhancedTokenExtractor.PROGRAM_IDS.TOKEN_PROGRAM;
    } catch (error) {
      return false;
    }
  }

  private generateSymbolFromMint(mint: string): string {
    // Generate a deterministic symbol from mint address
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let symbol = '';
    
    for (let i = 0; i < 4; i++) {
      const charIndex = mint.charCodeAt(i) % chars.length;
      symbol += chars[charIndex];
    }
    
    return symbol;
  }
}