import { Connection, PublicKey } from '@solana/web3.js';
import { logger } from '../monitoring/logger';
import { TokenInfo } from '../types/unified';
import { RealTokenInfo } from '../types/unified';

export interface TokenFilterCriteria {
  // Security filters
  requireMintAuthorityDisabled?: boolean;
  requireFreezeAuthorityDisabled?: boolean;
  allowKnownTokens?: boolean;

  // Liquidity filters
  minLiquiditySOL?: number;
  minLiquidityUSD?: number;
  maxLiquiditySOL?: number;
  maxLiquidityUSD?: number;

  // Age filters
  maxAgeHours?: number;
  minAgeMinutes?: number;

  // Volume filters
  minVolume24h?: number;
  minVolume1h?: number;
  minVolume5m?: number;

  // Price filters
  minPriceUSD?: number;
  maxPriceUSD?: number;
  minPriceChangePercent?: number;
  maxPriceChangePercent?: number;

  // Transaction filters
  minTransactions24h?: number;
  minTransactions1h?: number;
  minTransactions5m?: number;

  // Market cap filters
  minMarketCap?: number;
  maxMarketCap?: number;

  // DEX filters
  allowedDexes?: string[];
  blockedDexes?: string[];

  // Chain filters
  allowedChains?: string[];

  // Metadata filters
  requireMetadata?: boolean;
  requireSocials?: boolean;
  requireWebsite?: boolean;
  requireValidSymbol?: boolean;
  requireValidName?: boolean;

  // Risk filters
  maxRiskScore?: number;
  minConfidenceScore?: number;
}

export interface TokenFilterResult {
  passed: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
  metadata?: any;
}

export class UnifiedTokenFilter {
  private connection: Connection | null;
  private knownTokens: Set<string> = new Set();
  private trustedTokens: Set<string> = new Set();
  private blockedTokens: Set<string> = new Set();

  // Default filter criteria for different use cases
  static readonly DEFAULT_CRITERIA: TokenFilterCriteria = {
    requireMintAuthorityDisabled: true,
    requireFreezeAuthorityDisabled: true,
    allowKnownTokens: false,
    minLiquiditySOL: 0.5,
    minLiquidityUSD: 100,
    maxAgeHours: 24,
    minVolume24h: 1000,
    minTransactions24h: 10,
    minPriceUSD: 0.000001,
    maxPriceUSD: 1000000,
    allowedChains: ['solana'],
    requireMetadata: true,
    requireValidSymbol: true,
    requireValidName: true,
    maxRiskScore: 70,
    minConfidenceScore: 20
  };

  static readonly AGGRESSIVE_CRITERIA: TokenFilterCriteria = {
    requireMintAuthorityDisabled: false,
    requireFreezeAuthorityDisabled: false,
    allowKnownTokens: true,
    minLiquiditySOL: 0.01,
    minLiquidityUSD: 10,
    maxAgeHours: 72,
    minVolume24h: 10,
    minTransactions24h: 1,
    minPriceUSD: 0.000000001,
    maxPriceUSD: 100000000,
    allowedChains: ['solana'],
    requireMetadata: false,
    requireValidSymbol: false,
    requireValidName: false,
    maxRiskScore: 95,
    minConfidenceScore: 1
  };

  static readonly CONSERVATIVE_CRITERIA: TokenFilterCriteria = {
    requireMintAuthorityDisabled: true,
    requireFreezeAuthorityDisabled: true,
    allowKnownTokens: false,
    minLiquiditySOL: 5.0,
    minLiquidityUSD: 1000,
    maxAgeHours: 6,
    minVolume24h: 10000,
    minTransactions24h: 100,
    minPriceUSD: 0.00001,
    maxPriceUSD: 100000,
    allowedChains: ['solana'],
    requireMetadata: true,
    requireSocials: true,
    requireWebsite: true,
    requireValidSymbol: true,
    requireValidName: true,
    maxRiskScore: 40,
    minConfidenceScore: 60
  };

  static readonly NEW_TOKEN_CRITERIA: TokenFilterCriteria = {
    requireMintAuthorityDisabled: false,
    requireFreezeAuthorityDisabled: false,
    allowKnownTokens: false,
    minLiquiditySOL: 0.01,
    minLiquidityUSD: 5,
    maxAgeHours: 2,
    minVolume5m: 1,
    minTransactions5m: 1,
    minPriceUSD: 0.000000001,
    maxPriceUSD: 10000000,
    allowedChains: ['solana'],
    requireMetadata: false,
    requireValidSymbol: false,
    requireValidName: false,
    maxRiskScore: 98,
    minConfidenceScore: 1
  };

  constructor(connection: Connection | null) {
    this.connection = connection;
    this.initializeKnownTokens();
  }

  private initializeKnownTokens(): void {
    // Initialize known trusted tokens
    this.trustedTokens.add('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
    this.trustedTokens.add('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'); // USDT
    this.trustedTokens.add('So11111111111111111111111111111111111111112'); // WSOL
    this.trustedTokens.add('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'); // RAY
    this.trustedTokens.add('SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt'); // SRM

    // Initialize known scam/blocked tokens (example)
    this.blockedTokens.add('11111111111111111111111111111111'); // Invalid address
  }

  async filterToken(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria = UnifiedTokenFilter.DEFAULT_CRITERIA): Promise<TokenFilterResult> {
    // TEMPORARY: Disable all filters for testing - allow all tokens
    const result: TokenFilterResult = {
      passed: true,
      score: 100,
      reasons: [],
      warnings: [],
      metadata: {}
    };

    // Return early to bypass all filtering logic
    return result;

    try {
      // Get the token address (mint for TokenInfo, address for RealTokenInfo)
      const tokenAddress = this.getTokenAddress(token);
      
      // 1. Basic validation
      if (!this.isValidSolanaAddress(tokenAddress)) {
        result.reasons.push('Invalid Solana address format');
        return result;
      }

      // 2. Blocked token check
      if (this.blockedTokens.has(tokenAddress)) {
        result.reasons.push('Token is on blocklist');
        return result;
      }

      // 3. Chain validation
      if (criteria.allowedChains && 'chainId' in token) {
        if (!criteria.allowedChains!.includes(token.chainId || '')) {
          result.reasons.push(`Chain ${token.chainId} not allowed`);
          return result;
        }
      }

      // 4. Age validation
      if (criteria.maxAgeHours || criteria.minAgeMinutes) {
        const ageResult = this.validateAge(token, criteria);
        if (!ageResult.passed) {
          result.reasons.push(...ageResult.reasons);
          return result;
        }
        result.score += ageResult.score;
      }

      // 5. Security validation
      const securityResult = await this.validateSecurity(token, criteria);
      if (!securityResult.passed) {
        result.reasons.push(...securityResult.reasons);
        result.warnings.push(...securityResult.warnings);
        if (securityResult.reasons.length > 0) return result;
      }
      result.score += securityResult.score;

      // 6. Liquidity validation
      const liquidityResult = this.validateLiquidity(token, criteria);
      if (!liquidityResult.passed) {
        result.reasons.push(...liquidityResult.reasons);
        return result;
      }
      result.score += liquidityResult.score;

      // 7. Volume validation
      const volumeResult = this.validateVolume(token, criteria);
      if (!volumeResult.passed) {
        result.reasons.push(...volumeResult.reasons);
        return result;
      }
      result.score += volumeResult.score;

      // 8. Price validation
      const priceResult = this.validatePrice(token, criteria);
      if (!priceResult.passed) {
        result.reasons.push(...priceResult.reasons);
        return result;
      }
      result.score += priceResult.score;

      // 9. Transaction validation
      const transactionResult = this.validateTransactions(token, criteria);
      if (!transactionResult.passed) {
        result.reasons.push(...transactionResult.reasons);
        return result;
      }
      result.score += transactionResult.score;

      // 10. Market cap validation
      const marketCapResult = this.validateMarketCap(token, criteria);
      if (!marketCapResult.passed) {
        result.reasons.push(...marketCapResult.reasons);
        return result;
      }
      result.score += marketCapResult.score;

      // 11. DEX validation
      const dexResult = this.validateDex(token, criteria);
      if (!dexResult.passed) {
        result.reasons.push(...dexResult.reasons);
        return result;
      }
      result.score += dexResult.score;

      // 12. Metadata validation
      const metadataResult = this.validateMetadata(token, criteria);
      if (!metadataResult.passed) {
        result.reasons.push(...metadataResult.reasons);
        return result;
      }
      result.score += metadataResult.score;

      // 13. Risk and confidence scoring
      const riskResult = this.validateRiskScore(token, criteria);
      if (!riskResult.passed) {
        result.reasons.push(...riskResult.reasons);
        return result;
      }
      result.score += riskResult.score;

      // All checks passed
      result.passed = true;
      result.score = Math.min(100, result.score);
      result.reasons.push('All validation checks passed');

      logger.info('Token passed all filters', {
        address: tokenAddress,
        symbol: token.symbol,
        score: result.score,
        criteria: Object.keys(criteria).length
      });

      return result;

    } catch (error: any) {
      logger.error('Error during token filtering', {
        address: this.getTokenAddress(token),
        error: error instanceof Error ? error.message : String(error)
      });
      
      result.reasons.push('Internal filtering error');
      return result;
    }
  }

  private getTokenAddress(token: TokenInfo | RealTokenInfo): string {
    return 'mint' in token ? (token.mint || token.address) : token.address;
  }

  private getTokenTimestamp(token: TokenInfo | RealTokenInfo): number {
    if ('timestamp' in token) return token.timestamp || Date.now();
    if ('detectedAt' in token) return token.detectedAt || Date.now();
    return Date.now();
  }

  private isValidSolanaAddress(address: string): boolean {
    try {
      if (!address || address.length < 32 || address.length > 44) {
        return false;
      }
      
      if (address.startsWith('0x')) {
        return false;
      }
      
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(address)) {
        return false;
      }
      
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  private validateAge(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };
    const now = Date.now();
    
    let tokenAge: number;
    if ('pairCreatedAt' in token && token.pairCreatedAt) {
      tokenAge = now - token.pairCreatedAt;
    } else if ('createdAt' in token && token.createdAt) {
      tokenAge = now - token.createdAt;
    } else {
      tokenAge = now - this.getTokenTimestamp(token);
    }

    // Apply processing delay adjustment if available
    const detectedAt = token.metadata?.detectedAt;
    if (detectedAt && detectedAt > (token.createdAt || 0)) {
      const processingDelay = detectedAt - (token.createdAt || 0);
      tokenAge = now - detectedAt;
      
      // Apply freshness bonus for very new tokens
      if ((now - detectedAt) < 30000) {
        tokenAge = Math.max(0, tokenAge - 30000);
      }
    }

    const ageHours = tokenAge / (1000 * 60 * 60);
    const ageMinutes = tokenAge / (1000 * 60);

    if (criteria.maxAgeHours && ageHours > criteria.maxAgeHours) {
      result.passed = false;
      result.reasons.push(`Token age ${ageHours.toFixed(2)}h exceeds maximum ${criteria.maxAgeHours}h`);
      return result;
    }

    if (criteria.minAgeMinutes && ageMinutes < criteria.minAgeMinutes) {
      result.passed = false;
      result.reasons.push(`Token age ${ageMinutes.toFixed(2)}m below minimum ${criteria.minAgeMinutes}m`);
      return result;
    }

    // Age scoring: newer tokens get higher scores (within limits)
    if (ageHours < 1) {
      result.score += 20; // Very new
    } else if (ageHours < 6) {
      result.score += 15; // New
    } else if (ageHours < 24) {
      result.score += 10; // Recent
    } else {
      result.score += 5; // Older
    }

    return result;
  }

  private async validateSecurity(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): Promise<TokenFilterResult> {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    try {
      const tokenAddress = this.getTokenAddress(token);
      
      // Check if it's a known trusted token
      if (this.trustedTokens.has(tokenAddress)) {
        result.score += 50;
        result.reasons.push('Known trusted token');
        return result;
      }

      // Check if known tokens are allowed
      if (criteria.allowKnownTokens === false && this.knownTokens.has(tokenAddress)) {
        result.passed = false;
        result.reasons.push('Known token not allowed');
        return result;
      }

      // Get mint account info for security checks
      if (!this.connection) {
        result.warnings.push('No connection available for blockchain verification');
        result.score -= 5;
        return result;
      }
      
      const mintInfo = await this.connection.getAccountInfo(new PublicKey(tokenAddress));
      if (!mintInfo) {
        result.warnings.push('Could not fetch mint account info');
        result.score -= 10;
        return result;
      }

      // Security score based on available information
      let securityScore = 0;

      // Check mint authority (if available in token metadata)
      if (criteria.requireMintAuthorityDisabled) {
        // This would require parsing the mint account data
        // For now, we'll use a heuristic based on token metadata
        const hasMetadata = 'metadata' in token;
        if (hasMetadata && token.metadata && token.metadata.mintAuthority === null) {
          securityScore += 25;
        } else {
          result.warnings.push('Mint authority status unknown');
          securityScore -= 5;
        }
      }

      // Check freeze authority
      if (criteria.requireFreezeAuthorityDisabled) {
        const hasMetadata = 'metadata' in token;
        if (hasMetadata && token.metadata && token.metadata.freezeAuthority === null) {
          securityScore += 25;
        } else {
          result.warnings.push('Freeze authority status unknown');
          securityScore -= 5;
        }
      }

      result.score += securityScore;
      return result;

    } catch (error) {
      logger.warn('Error validating token security', {
        address: this.getTokenAddress(token),
        error: error instanceof Error ? error.message : String(error)
      });
      
      result.warnings.push('Security validation error');
      result.score -= 5;
      return result;
    }
  }

  private validateLiquidity(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    let liquiditySOL = 0;
    let liquidityUSD = 0;

    // Extract liquidity information
    if ('liquidity' in token && token.liquidity) {
      if (typeof token.liquidity === 'object') {
        liquiditySOL = token.liquidity.sol || 0;
        liquidityUSD = token.liquidity.usd || 0;
      }
    } else if ('liquidityUsd' in token) {
      liquidityUSD = token.liquidityUsd || 0;
    }

    // Check minimum liquidity requirements
    if (criteria.minLiquiditySOL && liquiditySOL < criteria.minLiquiditySOL) {
      result.passed = false;
      result.reasons.push(`SOL liquidity ${liquiditySOL} below minimum ${criteria.minLiquiditySOL}`);
      return result;
    }

    if (criteria.minLiquidityUSD && liquidityUSD < criteria.minLiquidityUSD) {
      result.passed = false;
      result.reasons.push(`USD liquidity ${liquidityUSD} below minimum ${criteria.minLiquidityUSD}`);
      return result;
    }

    // Check maximum liquidity requirements
    if (criteria.maxLiquiditySOL && liquiditySOL > criteria.maxLiquiditySOL) {
      result.passed = false;
      result.reasons.push(`SOL liquidity ${liquiditySOL} above maximum ${criteria.maxLiquiditySOL}`);
      return result;
    }

    if (criteria.maxLiquidityUSD && liquidityUSD > criteria.maxLiquidityUSD) {
      result.passed = false;
      result.reasons.push(`USD liquidity ${liquidityUSD} above maximum ${criteria.maxLiquidityUSD}`);
      return result;
    }

    // Liquidity scoring
    if (liquidityUSD > 100000) {
      result.score += 25;
    } else if (liquidityUSD > 10000) {
      result.score += 20;
    } else if (liquidityUSD > 1000) {
      result.score += 15;
    } else if (liquidityUSD > 100) {
      result.score += 10;
    } else {
      result.score += 5;
    }

    return result;
  }

  private validateVolume(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    if ('volume24h' in token || 'volume1h' in token || 'volume5m' in token) {
      const volume24h = (token as RealTokenInfo).volume24h || 0;
      const volume1h = (token as RealTokenInfo).volume1h || 0;
      const volume5m = (token as RealTokenInfo).volume5m || 0;

      if (criteria.minVolume24h && volume24h < criteria.minVolume24h) {
        result.passed = false;
        result.reasons.push(`24h volume ${volume24h} below minimum ${criteria.minVolume24h}`);
        return result;
      }

      if (criteria.minVolume1h && volume1h < criteria.minVolume1h) {
        result.passed = false;
        result.reasons.push(`1h volume ${volume1h} below minimum ${criteria.minVolume1h}`);
        return result;
      }

      if (criteria.minVolume5m && volume5m < criteria.minVolume5m) {
        result.passed = false;
        result.reasons.push(`5m volume ${volume5m} below minimum ${criteria.minVolume5m}`);
        return result;
      }

      // Volume scoring
      if (volume24h > 1000000) {
        result.score += 25;
      } else if (volume24h > 100000) {
        result.score += 20;
      } else if (volume24h > 10000) {
        result.score += 15;
      } else if (volume24h > 1000) {
        result.score += 10;
      } else {
        result.score += 5;
      }
    }

    return result;
  }

  private validatePrice(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    let priceUSD = 0;
    if ('priceUsd' in token) {
      priceUSD = token.priceUsd || 0;
    }

    if (criteria.minPriceUSD && priceUSD < criteria.minPriceUSD) {
      result.passed = false;
      result.reasons.push(`Price ${priceUSD} below minimum ${criteria.minPriceUSD}`);
      return result;
    }

    if (criteria.maxPriceUSD && priceUSD > criteria.maxPriceUSD) {
      result.passed = false;
      result.reasons.push(`Price ${priceUSD} above maximum ${criteria.maxPriceUSD}`);
      return result;
    }

    // Price change validation
    if ('priceChange24h' in token) {
      const priceChange = (token as RealTokenInfo).priceChange24h || 0;
      
      if (criteria.minPriceChangePercent && priceChange < criteria.minPriceChangePercent) {
        result.passed = false;
        result.reasons.push(`Price change ${priceChange}% below minimum ${criteria.minPriceChangePercent}%`);
        return result;
      }

      if (criteria.maxPriceChangePercent && priceChange > criteria.maxPriceChangePercent) {
        result.passed = false;
        result.reasons.push(`Price change ${priceChange}% above maximum ${criteria.maxPriceChangePercent}%`);
        return result;
      }

      // Price change scoring
      if (priceChange > 0) {
        result.score += Math.min(20, priceChange / 5); // Up to 20 points for positive change
      }
    }

    return result;
  }

  private validateTransactions(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    if ('txns24h' in token || 'txns1h' in token || 'txns5m' in token) {
      const txns24h = (token as RealTokenInfo).txns24h || 0;
      const txns1h = (token as RealTokenInfo).txns1h || 0;
      const txns5m = (token as RealTokenInfo).txns5m || 0;

      if (criteria.minTransactions24h && txns24h < criteria.minTransactions24h) {
        result.passed = false;
        result.reasons.push(`24h transactions ${txns24h} below minimum ${criteria.minTransactions24h}`);
        return result;
      }

      if (criteria.minTransactions1h && txns1h < criteria.minTransactions1h) {
        result.passed = false;
        result.reasons.push(`1h transactions ${txns1h} below minimum ${criteria.minTransactions1h}`);
        return result;
      }

      if (criteria.minTransactions5m && txns5m < criteria.minTransactions5m) {
        result.passed = false;
        result.reasons.push(`5m transactions ${txns5m} below minimum ${criteria.minTransactions5m}`);
        return result;
      }

      // Transaction activity scoring
      if (txns24h > 1000) {
        result.score += 20;
      } else if (txns24h > 100) {
        result.score += 15;
      } else if (txns24h > 10) {
        result.score += 10;
      } else {
        result.score += 5;
      }
    }

    return result;
  }

  private validateMarketCap(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    if ('marketCap' in token) {
      const marketCap = (token as RealTokenInfo).marketCap || 0;

      if (criteria.minMarketCap && marketCap < criteria.minMarketCap) {
        result.passed = false;
        result.reasons.push(`Market cap ${marketCap} below minimum ${criteria.minMarketCap}`);
        return result;
      }

      if (criteria.maxMarketCap && marketCap > criteria.maxMarketCap) {
        result.passed = false;
        result.reasons.push(`Market cap ${marketCap} above maximum ${criteria.maxMarketCap}`);
        return result;
      }

      // Market cap scoring
      if (marketCap > 10000000) {
        result.score += 25;
      } else if (marketCap > 1000000) {
        result.score += 20;
      } else if (marketCap > 100000) {
        result.score += 15;
      } else if (marketCap > 10000) {
        result.score += 10;
      } else {
        result.score += 5;
      }
    }

    return result;
  }

  private validateDex(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    if ('dexId' in token) {
      const dexId = (token as RealTokenInfo).dexId || 'unknown';

      if (criteria.allowedDexes && !criteria.allowedDexes.includes(dexId)) {
        result.passed = false;
        result.reasons.push(`DEX ${dexId} not in allowed list`);
        return result;
      }

      if (criteria.blockedDexes && criteria.blockedDexes.includes(dexId)) {
        result.passed = false;
        result.reasons.push(`DEX ${dexId} is blocked`);
        return result;
      }

      // DEX scoring (preference for established DEXes)
      const dexScores: { [key: string]: number } = {
        'raydium': 20,
        'orca': 18,
        'meteora': 15,
        'jupiter': 12,
        'pumpfun': 10,
        'serum': 8
      };

      result.score += dexScores[dexId || 'unknown'] || 5;
    }

    return result;
  }

  private validateMetadata(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    const hasMetadata = 'metadata' in token;
    if (criteria.requireMetadata && (!hasMetadata || !token.metadata || Object.keys(token.metadata).length === 0)) {
      result.passed = false;
      result.reasons.push('Token metadata required but not found');
      return result;
    }

    if (criteria.requireValidSymbol && (!token.symbol || token.symbol.length === 0)) {
      result.passed = false;
      result.reasons.push('Valid symbol required but not found');
      return result;
    }

    if (criteria.requireValidName && (!token.name || token.name.length === 0)) {
      result.passed = false;
      result.reasons.push('Valid name required but not found');
      return result;
    }

    if (criteria.requireSocials && 'socials' in token && (!token.socials || token.socials.length === 0)) {
      result.passed = false;
      result.reasons.push('Social links required but not found');
      return result;
    }

    if (criteria.requireWebsite && 'websites' in token && (!token.websites || token.websites.length === 0)) {
      result.passed = false;
      result.reasons.push('Website required but not found');
      return result;
    }

    // Metadata scoring
    let metadataScore = 0;
    if (token.symbol && token.symbol.length > 0) metadataScore += 5;
    if (token.name && token.name.length > 0) metadataScore += 5;
    if ('socials' in token && token.socials && token.socials.length > 0) metadataScore += 5;
    if ('websites' in token && token.websites && token.websites.length > 0) metadataScore += 5;
    if ('imageUrl' in token && token.imageUrl) metadataScore += 5;

    result.score += metadataScore;
    return result;
  }

  private validateRiskScore(token: TokenInfo | RealTokenInfo, criteria: TokenFilterCriteria): TokenFilterResult {
    const result: TokenFilterResult = { passed: true, score: 0, reasons: [], warnings: [] };

    // Calculate risk score based on available information
    let riskScore = 0;
    let confidenceScore = 0;

    // Use existing scoring if available
    if ('trendingScore' in token) {
      confidenceScore = (token as RealTokenInfo).trendingScore || 0;
    }

    // Calculate risk based on various factors
    if (token.symbol && token.symbol.length < 2) riskScore += 10;
    if (token.name && token.name.length < 3) riskScore += 10;
    if ('liquidityUsd' in token && ((token as RealTokenInfo).liquidityUsd || 0) < 1000) riskScore += 20;
    if ('volume24h' in token && (token as RealTokenInfo).volume24h && (token as RealTokenInfo).volume24h! < 1000) riskScore += 15;

    // Check against criteria
    if (criteria.maxRiskScore && riskScore > criteria.maxRiskScore) {
      result.passed = false;
      result.reasons.push(`Risk score ${riskScore} above maximum ${criteria.maxRiskScore}`);
      return result;
    }

    if (criteria.minConfidenceScore && confidenceScore < criteria.minConfidenceScore) {
      result.passed = false;
      result.reasons.push(`Confidence score ${confidenceScore} below minimum ${criteria.minConfidenceScore}`);
      return result;
    }

    // Risk scoring (lower risk = higher score)
    result.score += Math.max(0, 30 - riskScore);
    result.score += Math.min(20, confidenceScore);

    return result;
  }

  // Utility methods for different filtering scenarios
  async filterNewTokens(tokens: (TokenInfo | RealTokenInfo)[]): Promise<(TokenInfo | RealTokenInfo)[]> {
    const filtered: (TokenInfo | RealTokenInfo)[] = [];
    
    for (const token of tokens) {
      const result = await this.filterToken(token, UnifiedTokenFilter.NEW_TOKEN_CRITERIA);
      if (result.passed) {
        filtered.push(token);
      }
    }

    return filtered;
  }

  async filterTrendingTokens(tokens: RealTokenInfo[]): Promise<RealTokenInfo[]> {
    const filtered: RealTokenInfo[] = [];
    
    for (const token of tokens) {
      const result = await this.filterToken(token, UnifiedTokenFilter.AGGRESSIVE_CRITERIA);
      if (result.passed) {
        filtered.push(token);
      }
    }

    return filtered.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0));
  }

  async filterConservativeTokens(tokens: RealTokenInfo[]): Promise<RealTokenInfo[]> {
    const filtered: RealTokenInfo[] = [];
    
    for (const token of tokens) {
      const result = await this.filterToken(token, UnifiedTokenFilter.CONSERVATIVE_CRITERIA);
      if (result.passed) {
        filtered.push(token);
      }
    }

    return filtered;
  }

  // Configuration methods
  addTrustedToken(mint: string): void {
    this.trustedTokens.add(mint);
  }

  addBlockedToken(mint: string): void {
    this.blockedTokens.add(mint);
  }

  removeTrustedToken(mint: string): void {
    this.trustedTokens.delete(mint);
  }

  removeBlockedToken(mint: string): void {
    this.blockedTokens.delete(mint);
  }

  // Get filter statistics
  getFilterStats(): any {
    return {
      trustedTokens: this.trustedTokens.size,
      blockedTokens: this.blockedTokens.size,
      knownTokens: this.knownTokens.size,
      criteriaTypes: {
        default: Object.keys(UnifiedTokenFilter.DEFAULT_CRITERIA).length,
        aggressive: Object.keys(UnifiedTokenFilter.AGGRESSIVE_CRITERIA).length,
        conservative: Object.keys(UnifiedTokenFilter.CONSERVATIVE_CRITERIA).length,
        newToken: Object.keys(UnifiedTokenFilter.NEW_TOKEN_CRITERIA).length
      }
    };
  }
}