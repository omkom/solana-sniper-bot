import { Connection, PublicKey } from '@solana/web3.js';
import { TokenInfo } from '../types';

export interface TransferLog {
  signature: string;
  address: string;
  data: string;
  topics: string[];
  fromToken?: string;
  toToken?: string;
  amount?: string;
  decimals?: number;
}

export interface ParsedTokenInfo {
  mint: string;
  symbol?: string;
  name?: string;
  decimals: number;
  supply?: string;
  metadata?: any;
  transfers: TransferLog[];
  liquidity?: {
    sol: number;
    usd: number;
    poolAddress?: string;
  };
}

export class TransactionParser {
  private connection: Connection;
  
  // Known Solana token program IDs
  private static readonly TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  private static readonly TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEuBvf9Ss623VQ5DA';
  private static readonly ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
  
  // Raydium specific program IDs
  private static readonly RAYDIUM_AMM_V4 = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
  private static readonly RAYDIUM_PROGRAMS = [
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // AMM V4
    '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5', // Fee collector
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', // Pool authority
  ];

  // Known SOL addresses to exclude
  private static readonly SOL_ADDRESSES = [
    '11111111111111111111111111111112', // Native SOL
    'So11111111111111111111111111111111111111112', // Wrapped SOL
  ];

  constructor(connection: Connection) {
    this.connection = connection;
    console.log('🔍 [PARSER] Enhanced Raydium-focused parser initialized');
  }

  /**
   * Main extraction method - simplified and focused on Raydium
   */
  async extractTokenInfoFromTransaction(transaction: any, signature: string): Promise<ParsedTokenInfo | null> {
    console.log(`🔍 [PARSER] Starting extraction for: ${signature.slice(0, 8)}...`);
    
    try {
      // Skip Solscan API entirely and focus on direct parsing
      return await this.extractTokenInfoDirect(transaction, signature);
    } catch (error) {
      console.error(`❌ [PARSER] Extraction failed for ${signature.slice(0, 8)}:`, error);
      return null;
    }
  }

  /**
   * Direct extraction method optimized for Raydium transactions
   */
  private async extractTokenInfoDirect(transaction: any, signature: string): Promise<ParsedTokenInfo | null> {
    const { meta, transaction: txn } = transaction;
    
    if (!meta || !txn) {
      console.log(`⚠️ [PARSER] Missing transaction data for ${signature.slice(0, 8)}`);
      return null;
    }

    console.log(`📊 [PARSER] Transaction has ${meta.postTokenBalances?.length || 0} post token balances`);

    // Step 1: Find new tokens using multiple strategies
    const tokenCandidate = this.findNewTokenMultiStrategy(meta, signature);
    
    if (!tokenCandidate) {
      console.log(`❌ [PARSER] No token candidates found in ${signature.slice(0, 8)}`);
      return null;
    }

    console.log(`🎯 [PARSER] Found token candidate: ${tokenCandidate.mint.slice(0, 8)}...`);

    // Step 2: Extract basic transfer information
    const transfers = this.extractBasicTransfers(meta, tokenCandidate.mint, signature);

    // Step 3: Extract metadata from instructions
    const metadata = this.extractSimpleMetadata(txn.message?.instructions || [], tokenCandidate.mint);

    // Step 4: Calculate liquidity from balance changes
    const liquidity = this.calculateSimpleLiquidity(meta);

    // Step 5: Create the result
    const result: ParsedTokenInfo = {
      mint: tokenCandidate.mint,
      symbol: metadata.symbol || this.generateSymbol(tokenCandidate.mint),
      name: metadata.name || `Raydium Token ${tokenCandidate.mint.slice(0, 8)}`,
      decimals: tokenCandidate.decimals,
      supply: tokenCandidate.supply,
      metadata: {
        source: 'DIRECT_RAYDIUM_PARSER',
        isRaydium: true,
        programsInvolved: this.extractProgramIds(txn.message?.instructions || []),
        instructionCount: txn.message?.instructions?.length || 0,
        hasValidBalances: true,
        ...metadata
      },
      transfers,
      liquidity: {
        sol: liquidity.sol,
        usd: liquidity.usd,
        poolAddress: metadata.poolAddress
      }
    };

    console.log(`✅ [PARSER] Successfully parsed: ${result.symbol} (${result.mint.slice(0, 8)}...)`);
    console.log(`💰 [PARSER] Estimated liquidity: ${liquidity.usd.toFixed(2)} USD`);
    
    return result;
  }

  /**
   * Multi-strategy token detection - much more aggressive
   */
  private findNewTokenMultiStrategy(meta: any, signature: string): {
    mint: string;
    decimals: number;
    supply: string;
  } | null {
    
    const preTokenBalances = meta.preTokenBalances || [];
    const postTokenBalances = meta.postTokenBalances || [];
    
    console.log(`🔍 [PARSER] Analyzing balances - Pre: ${preTokenBalances.length}, Post: ${postTokenBalances.length}`);

    // Strategy 1: Brand new tokens (in post, not in pre)
    const brandNewTokens = postTokenBalances.filter((post: any) => {
      if (!this.isValidTokenMint(post.mint)) return false;
      
      const existedBefore = preTokenBalances.some((pre: any) => pre.mint === post.mint);
      const hasAmount = post.uiTokenAmount?.amount && post.uiTokenAmount.amount !== '0';
      
      return !existedBefore && hasAmount;
    });

    if (brandNewTokens.length > 0) {
      console.log(`✅ [PARSER] Strategy 1 success: Found ${brandNewTokens.length} brand new tokens`);
      return this.selectBestToken(brandNewTokens);
    }

    // Strategy 2: Tokens with significant balance changes
    const changedTokens = postTokenBalances.filter((post: any) => {
      if (!this.isValidTokenMint(post.mint)) return false;
      
      const preBalance = preTokenBalances.find((pre: any) => pre.mint === post.mint);
      if (!preBalance) return false; // Already covered in strategy 1
      
      const preAmount = parseFloat(preBalance.uiTokenAmount?.amount || '0');
      const postAmount = parseFloat(post.uiTokenAmount?.amount || '0');
      
      // Look for significant changes (new balance or 10x+ change)
      const hasSignificantChange = (
        postAmount > 0 && preAmount === 0
      ) || (
        postAmount > preAmount * 10
      ) || (
        Math.abs(postAmount - preAmount) > 1000 // Large absolute change
      );
      
      return hasSignificantChange;
    });

    if (changedTokens.length > 0) {
      console.log(`✅ [PARSER] Strategy 2 success: Found ${changedTokens.length} tokens with significant changes`);
      return this.selectBestToken(changedTokens);
    }

    // Strategy 3: Any non-SOL token with a balance (very permissive)
    const anyTokens = postTokenBalances.filter((post: any) => {
      if (!this.isValidTokenMint(post.mint)) return false;
      
      const hasAnyAmount = post.uiTokenAmount?.amount && post.uiTokenAmount.amount !== '0';
      return hasAnyAmount;
    });

    if (anyTokens.length > 0) {
      console.log(`✅ [PARSER] Strategy 3 success: Found ${anyTokens.length} tokens with any balance`);
      return this.selectBestToken(anyTokens);
    }

    // Strategy 4: Absolute fallback - any valid token mint
    const fallbackTokens = postTokenBalances.filter((post: any) => 
      this.isValidTokenMint(post.mint)
    );

    if (fallbackTokens.length > 0) {
      console.log(`⚠️ [PARSER] Strategy 4 fallback: Found ${fallbackTokens.length} valid token mints`);
      return this.selectBestToken(fallbackTokens);
    }

    console.log(`❌ [PARSER] All strategies failed for ${signature.slice(0, 8)}`);
    return null;
  }

  /**
   * Select the best token from candidates
   */
  private selectBestToken(tokens: any[]): {
    mint: string;
    decimals: number;
    supply: string;
  } {
    if (tokens.length === 1) {
      const token = tokens[0];
      return {
        mint: token.mint,
        decimals: token.uiTokenAmount?.decimals || 9,
        supply: token.uiTokenAmount?.amount || '0'
      };
    }

    // Score tokens based on various factors
    const scoredTokens = tokens.map((token: any) => {
      let score = 0;
      
      // Prefer tokens with standard decimals
      if (token.uiTokenAmount?.decimals === 9) score += 10;
      else if (token.uiTokenAmount?.decimals === 6) score += 8;
      
      // Prefer tokens with non-zero amounts
      const amount = parseFloat(token.uiTokenAmount?.amount || '0');
      if (amount > 0) score += 15;
      if (amount > 1000) score += 5;
      if (amount > 1000000) score += 10;
      
      // Prefer tokens with reasonable decimal counts
      if (token.uiTokenAmount?.decimals >= 6 && token.uiTokenAmount?.decimals <= 18) {
        score += 5;
      }
      
      return { token, score };
    });

    // Sort by score and return the best one
    scoredTokens.sort((a, b) => b.score - a.score);
    const best = scoredTokens[0].token;
    
    console.log(`🏆 [PARSER] Selected best token: ${best.mint.slice(0, 8)}... (score: ${scoredTokens[0].score})`);
    
    return {
      mint: best.mint,
      decimals: best.uiTokenAmount?.decimals || 9,
      supply: best.uiTokenAmount?.amount || '0'
    };
  }

  /**
   * Simplified but more reliable token mint validation
   */
  private isValidTokenMint(mint: string): boolean {
    if (!mint || typeof mint !== 'string') return false;
    if (mint.length < 32 || mint.length > 44) return false; // Valid Solana address range
    
    // Exclude known SOL addresses
    if (TransactionParser.SOL_ADDRESSES.includes(mint)) return false;
    
    // Basic base58 validation (simplified)
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    if (!base58Regex.test(mint)) return false;
    
    return true;
  }

  /**
   * Extract basic transfer information without complex log parsing
   */
  private extractBasicTransfers(meta: any, mint: string, signature: string): TransferLog[] {
    const transfers: TransferLog[] = [];
    
    try {
      // Create a simple transfer log for the detected token
      transfers.push({
        signature,
        address: mint,
        data: `Token detected in Raydium transaction`,
        topics: ['RAYDIUM_TOKEN_CREATION'],
        toToken: mint,
        amount: meta.postTokenBalances?.find((b: any) => b.mint === mint)?.uiTokenAmount?.amount,
        decimals: meta.postTokenBalances?.find((b: any) => b.mint === mint)?.uiTokenAmount?.decimals
      });

      // Add SOL movement information
      if (meta.preBalances && meta.postBalances) {
        const solMovement = meta.postBalances.reduce((sum: number, balance: number, index: number) => {
          const pre = meta.preBalances[index] || 0;
          return sum + Math.abs(balance - pre);
        }, 0);

        if (solMovement > 0) {
          transfers.push({
            signature,
            address: 'SOL',
            data: `SOL movement: ${solMovement / 1e9} SOL`,
            topics: ['SOL_MOVEMENT'],
            amount: (solMovement / 1e9).toString(),
            decimals: 9
          });
        }
      }
    } catch (error) {
      console.error('❌ Error extracting basic transfers:', error);
    }
    
    return transfers;
  }

  /**
   * Simplified metadata extraction
   */
  private extractSimpleMetadata(instructions: any[], mint: string): any {
    const metadata: any = {
      symbol: null,
      name: null,
      poolAddress: null,
      programIds: [],
      isRaydiumTransaction: false
    };

    try {
      for (const instruction of instructions) {
        // Track program IDs
        if (instruction.programId) {
          metadata.programIds.push(instruction.programId);
          
          // Check if this is a Raydium program
          if (TransactionParser.RAYDIUM_PROGRAMS.includes(instruction.programId)) {
            metadata.isRaydiumTransaction = true;
          }
        }

        // Extract parsed instruction data
        if (instruction.parsed?.info) {
          const info = instruction.parsed.info;
          
          // Look for pool addresses
          if (info.pool || info.ammId || info.market) {
            metadata.poolAddress = info.pool || info.ammId || info.market;
          }
          
          // Look for token metadata
          if (info.symbol) metadata.symbol = info.symbol;
          if (info.name) metadata.name = info.name;
          if (info.mint === mint) {
            metadata.decimals = info.decimals;
            metadata.mintAuthority = info.mintAuthority;
          }
        }

        // Look at accounts for potential pool addresses
        if (instruction.accounts && instruction.accounts.length > 5) {
          // Raydium pools typically involve many accounts
          metadata.poolAddress = metadata.poolAddress || instruction.accounts[2]; // Common pool position
        }
      }
    } catch (error) {
      console.error('❌ Error extracting simple metadata:', error);
    }

    return metadata;
  }

  /**
   * Extract program IDs from instructions
   */
  private extractProgramIds(instructions: any[]): string[] {
    return instructions
      .map(instruction => instruction.programId)
      .filter((id, index, array) => id && array.indexOf(id) === index); // Unique IDs only
  }

  /**
   * Simplified liquidity calculation
   */
  private calculateSimpleLiquidity(meta: any): { sol: number; usd: number } {
    try {
      let totalSolMovement = 0;
      
      // Method 1: Calculate from balance changes
      if (meta.preBalances && meta.postBalances) {
        totalSolMovement = meta.postBalances.reduce((sum: number, balance: number, index: number) => {
          const pre = meta.preBalances[index] || 0;
          return sum + Math.abs(balance - pre);
        }, 0);
      }
      
      // Method 2: Use transaction fee as minimum estimate
      const feeInLamports = meta.fee || 5000;
      totalSolMovement = Math.max(totalSolMovement, feeInLamports * 100); // Assume fee is ~1% of movement
      
      const solLiquidity = totalSolMovement / 1e9; // Convert to SOL
      const usdLiquidity = solLiquidity * 200; // Conservative SOL price
      
      return {
        sol: Math.max(0, solLiquidity),
        usd: Math.max(0, usdLiquidity)
      };
    } catch (error) {
      console.error('❌ Error calculating simple liquidity:', error);
      return { sol: 0, usd: 0 };
    }
  }

  /**
   * Generate symbol from mint address
   */
  private generateSymbol(mint: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let symbol = '';
    
    // Use different positions in the mint for variety
    const positions = [1, 8, 16, 24, 32];
    
    for (let i = 0; i < 4; i++) {
      const pos = positions[i] || i;
      if (pos < mint.length) {
        const charCode = mint.charCodeAt(pos);
        symbol += chars[charCode % chars.length];
      }
    }
    
    return symbol || 'RAYG';
  }

  /**
   * Convert parsed token info to TokenInfo format
   */
  convertToTokenInfo(parsedInfo: ParsedTokenInfo, signature: string, source: string): TokenInfo {
    return {
      address: parsedInfo.mint,
      mint: parsedInfo.mint,
      symbol: parsedInfo.symbol || 'UNKNOWN',
      name: parsedInfo.name || 'Unknown Token',
      decimals: parsedInfo.decimals,
      supply: parsedInfo.supply || '0',
      signature,
      timestamp: Date.now(),
      createdAt: Date.now(),
      source,
      detected: true,
      detectedAt: Date.now(),
      liquidity: parsedInfo.liquidity || { sol: 0, usd: 0 },
      metadata: {
        ...parsedInfo.metadata,
        transferLogs: parsedInfo.transfers,
        enhanced: true,
        parsingMethod: 'DIRECT_RAYDIUM_FOCUSED',
        simplified: true
      }
    };
  }
}