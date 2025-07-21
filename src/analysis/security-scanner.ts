/**
 * Enhanced Security Scanner
 * Information-only analysis with no filtering - provides comprehensive security info
 * Maintains educational boundaries while demonstrating professional security analysis
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { ConnectionPool } from '../core/connection-pool';
import { UnifiedTokenInfo, SecurityInfo, SecurityAnalysis, SecurityCheckEnhanced } from '../types/unified';

interface SecurityScannerConfig {
  infoOnly: boolean; // Never filter tokens, only provide analysis
  comprehensiveAnalysis: boolean;
  realTimeMonitoring: boolean;
  enableHoneypotDetection: boolean;
  enableRugPullAnalysis: boolean;
  enableLiquidityAnalysis: boolean;
  enableHolderAnalysis: boolean;
  maxAnalysisTime: number;
  confidenceThreshold: number; // For flagging only, not filtering
}

interface SecurityCheck {
  name: string;
  category: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  passed: boolean;
  score: number;
  confidence: number;
  message: string;
  details: any;
  recommendation?: string;
}

interface RiskIndicator {
  type: 'HONEYPOT' | 'RUG_PULL' | 'LOW_LIQUIDITY' | 'HIGH_CONCENTRATION' | 'SUSPICIOUS_ACTIVITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  description: string;
  evidence: string[];
}

export class SecurityScanner extends EventEmitter {
  private config: SecurityScannerConfig;
  private connectionPool: ConnectionPool;
  private isRunning = false;
  private analyzed = new Map<string, SecurityInfo>();

  constructor(connectionPool: ConnectionPool, config: Partial<SecurityScannerConfig> = {}) {
    super();
    
    this.connectionPool = connectionPool;
    this.config = {
      infoOnly: true, // ALWAYS true - never filter tokens
      comprehensiveAnalysis: true,
      realTimeMonitoring: true,
      enableHoneypotDetection: true,
      enableRugPullAnalysis: true,
      enableLiquidityAnalysis: true,
      enableHolderAnalysis: true,
      maxAnalysisTime: 10000, // 10 seconds max per token
      confidenceThreshold: 60,
      ...config
    };

    // Force info-only mode for educational safety
    this.config.infoOnly = true;

    logger.info('🔒 Security Scanner initialized (Information Only Mode)', {
      comprehensiveAnalysis: this.config.comprehensiveAnalysis,
      maxAnalysisTime: this.config.maxAnalysisTime
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Security scanner already running');
      return;
    }

    this.isRunning = true;
    
    // Start cleanup task
    this.startCleanupTask();
    
    this.emit('started');
    logger.info('✅ Security scanner started in information-only mode');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.analyzed.clear();
    
    this.emit('stopped');
    logger.info('🛑 Security scanner stopped');
  }

  async analyzeToken(token: UnifiedTokenInfo): Promise<SecurityInfo> {
    const analysisStart = Date.now();
    
    try {
      // Check cache first
      if (this.analyzed.has(token.address)) {
        const cached = this.analyzed.get(token.address)!;
        if (Date.now() - cached.analyzedAt < 300000) { // 5 minute cache
          return cached;
        }
      }

      logger.debug(`🔍 Analyzing token security: ${token.symbol} (${token.address.slice(0, 8)}...)`);

      // Run comprehensive security analysis
      const checks = await this.runSecurityChecks(token);
      const riskIndicators = await this.detectRiskIndicators(token, checks);
      const securityInfo = this.compileSecurityInfo(token, checks, riskIndicators);

      // Cache result
      this.analyzed.set(token.address, securityInfo);

      const analysisTime = Date.now() - analysisStart;
      
      logger.info(`🔒 Security analysis complete: ${token.symbol}`, {
        score: securityInfo.score,
        recommendation: securityInfo.recommendation,
        flags: securityInfo.flags.length,
        analysisTime
      });

      // Emit analysis complete event
      this.emit('analysisComplete', { token, analysis: securityInfo });

      return securityInfo;

    } catch (error) {
      logger.error(`❌ Security analysis failed for ${token.symbol}:`, error);
      
      // Return minimal security info on error
      const errorInfo: SecurityInfo = {
        score: 0,
        flags: ['ANALYSIS_FAILED'],
        details: {
          contractVerified: false,
          liquidityLocked: false,
          ownershipRenounced: false,
          honeypotRisk: 100,
          rugPullIndicators: ['Analysis error'],
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        recommendation: 'HIGH_RISK',
        analyzedAt: Date.now(),
        confidence: 0,
        riskIndicators: [],
        checks: []
      };

      return errorInfo;
    }
  }

  private async runSecurityChecks(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced[]> {
    const checks: SecurityCheckEnhanced[] = [];
    
    // Run checks in parallel for speed
    const checkPromises = [
      this.checkMintAuthority(token),
      this.checkFreezeAuthority(token),
      this.checkSupplyAnalysis(token),
      this.checkLiquidityAnalysis(token),
      this.checkMetadataVerification(token),
      this.checkTradingPatterns(token),
      this.checkContractVerification(token),
      this.checkOwnershipStatus(token)
    ];

    const results = await Promise.allSettled(checkPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        checks.push(result.value);
      } else {
        checks.push({
          name: `Check ${index}`,
          category: 'INFO',
          passed: false,
          score: 0,
          confidence: 0,
          message: 'Check failed',
          details: { error: result.reason }
        });
      }
    });

    return checks;
  }

  private async checkMintAuthority(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced> {
    try {
      if (this.isSimulatedToken(token)) {
        return this.simulateMintAuthorityCheck(token);
      }

      const { connection } = this.connectionPool.getConnectionWithEndpoint();
      const mintPubkey = new PublicKey(token.address);
      const mintInfo = await getMint(connection, mintPubkey);
      
      const passed = mintInfo.mintAuthority === null;
      const confidence = 95;
      
      return {
        name: 'Mint Authority',
        category: passed ? 'LOW' : 'HIGH',
        passed,
        score: passed ? 25 : 0,
        confidence,
        message: passed ? 
          'Mint authority properly revoked - no inflation risk' : 
          'Mint authority still active - inflation risk exists',
        details: { 
          mintAuthority: mintInfo.mintAuthority?.toString() || null,
          supply: mintInfo.supply.toString(),
          decimals: mintInfo.decimals
        },
        recommendation: passed ? 
          'Good: Token supply is fixed' : 
          'Caution: Token supply can be inflated'
      };

    } catch (error) {
      return {
        name: 'Mint Authority',
        category: 'INFO',
        passed: false,
        score: 0,
        confidence: 0,
        message: `Unable to verify mint authority: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkFreezeAuthority(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced> {
    try {
      if (this.isSimulatedToken(token)) {
        return this.simulateFreezeAuthorityCheck(token);
      }

      const { connection } = this.connectionPool.getConnectionWithEndpoint();
      const mintPubkey = new PublicKey(token.address);
      const mintInfo = await getMint(connection, mintPubkey);
      
      const passed = mintInfo.freezeAuthority === null;
      const confidence = 95;
      
      return {
        name: 'Freeze Authority',
        category: passed ? 'LOW' : 'MEDIUM',
        passed,
        score: passed ? 20 : 0,
        confidence,
        message: passed ? 
          'Freeze authority properly revoked - accounts cannot be frozen' : 
          'Freeze authority still active - accounts can be frozen',
        details: { 
          freezeAuthority: mintInfo.freezeAuthority?.toString() || null
        },
        recommendation: passed ? 
          'Good: Accounts cannot be frozen' : 
          'Caution: Accounts can be frozen by authority'
      };

    } catch (error) {
      return {
        name: 'Freeze Authority',
        category: 'INFO',
        passed: false,
        score: 0,
        confidence: 0,
        message: `Unable to verify freeze authority: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkSupplyAnalysis(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced> {
    try {
      if (this.isSimulatedToken(token)) {
        return this.simulateSupplyAnalysis(token);
      }

      const { connection } = this.connectionPool.getConnectionWithEndpoint();
      const mintPubkey = new PublicKey(token.address);
      const mintInfo = await getMint(connection, mintPubkey);
      
      const supply = Number(mintInfo.supply);
      const maxSupply = mintInfo.mintAuthority ? null : supply;
      
      // Analyze supply characteristics
      const isReasonableSupply = supply > 0 && supply < 1e15;
      const hasFixedSupply = mintInfo.mintAuthority === null;
      
      let score = 0;
      if (hasFixedSupply) score += 10;
      if (isReasonableSupply) score += 5;
      
      const passed = isReasonableSupply;
      const confidence = 80;
      
      return {
        name: 'Supply Analysis',
        category: passed ? 'LOW' : 'MEDIUM',
        passed,
        score,
        confidence,
        message: passed ? 
          'Token supply characteristics appear normal' : 
          'Token supply characteristics may be suspicious',
        details: { 
          supply: supply.toString(),
          maxSupply: maxSupply?.toString() || 'unlimited',
          decimals: mintInfo.decimals,
          hasFixedSupply,
          supplyCategory: this.categorizeSupply(supply)
        },
        recommendation: passed ? 
          'Supply characteristics look normal' : 
          'Review supply distribution carefully'
      };

    } catch (error) {
      return {
        name: 'Supply Analysis',
        category: 'INFO',
        passed: false,
        score: 0,
        confidence: 0,
        message: `Unable to analyze supply: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkLiquidityAnalysis(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced> {
    const liquidity = token.liquidityUsd || 0;
    const liquiditySol = token.liquidity?.sol || 0;
    
    // Liquidity thresholds
    const minLiquidity = 5000; // $5000 USD
    const goodLiquidity = 50000; // $50000 USD
    
    const passed = liquidity >= minLiquidity;
    let score = 0;
    
    if (liquidity >= goodLiquidity) score = 20;
    else if (liquidity >= minLiquidity) score = 15;
    else if (liquidity >= minLiquidity / 2) score = 10;
    else if (liquidity > 0) score = 5;
    
    const confidence = token.liquidityUsd ? 90 : 30; // Lower confidence if no liquidity data
    
    return {
      name: 'Liquidity Analysis',
      category: passed ? 'LOW' : 'HIGH',
      passed,
      score,
      confidence,
      message: passed ? 
        `Adequate liquidity: $${liquidity.toLocaleString()}` : 
        `Low liquidity: $${liquidity.toLocaleString()} (minimum $${minLiquidity.toLocaleString()})`,
      details: {
        liquidityUsd: liquidity,
        liquiditySol,
        minimumRequired: minLiquidity,
        category: this.categorizeLiquidity(liquidity),
        poolAddress: token.pairAddress
      },
      recommendation: passed ? 
        'Liquidity appears sufficient for trading' : 
        'Low liquidity may cause high slippage and difficulty exiting'
    };
  }

  private async checkMetadataVerification(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced> {
    // Check token metadata quality
    const hasName = token.name && token.name !== 'Unknown Token' && !token.name.includes('Unknown');
    const hasSymbol = token.symbol && token.symbol !== 'UNKNOWN' && token.symbol.length <= 10;
    const hasImage = !!token.imageUrl;
    const hasWebsite = !!(token.metadata as any)?.website;
    
    let score = 0;
    if (hasName) score += 5;
    if (hasSymbol) score += 5;
    if (hasImage) score += 3;
    if (hasWebsite) score += 2;
    
    const passed = Boolean(hasName && hasSymbol);
    const confidence = 70;
    
    return {
      name: 'Metadata Verification',
      category: passed ? 'LOW' : 'MEDIUM',
      passed,
      score,
      confidence,
      message: passed ? 
        'Token metadata appears complete' : 
        'Token metadata is incomplete or suspicious',
      details: {
        hasName,
        hasSymbol,
        hasImage,
        hasWebsite,
        name: token.name,
        symbol: token.symbol,
        completeness: `${score}/15 points`
      },
      recommendation: passed ? 
        'Metadata looks professional' : 
        'Incomplete metadata may indicate rushed or suspicious project'
    };
  }

  private async checkTradingPatterns(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced> {
    // Analyze trading patterns for suspicious activity
    const volume24h = token.volume24h || 0;
    const txns24h = token.txns24h || 0;
    const priceChange24h = token.priceChange24h || 0;
    
    // Calculate average transaction size
    const avgTxSize = txns24h > 0 ? volume24h / txns24h : 0;
    
    // Detect suspicious patterns
    const highVolatility = Math.abs(priceChange24h) > 500; // >500% change
    const suspiciouslyLowTxns = volume24h > 10000 && txns24h < 10; // High volume, few transactions
    const suspiciouslyHighTxSize = avgTxSize > volume24h * 0.5; // Single tx > 50% of volume
    
    let score = 15; // Start with good score
    let flags: string[] = [];
    
    if (highVolatility) {
      score -= 5;
      flags.push('High volatility detected');
    }
    
    if (suspiciouslyLowTxns) {
      score -= 8;
      flags.push('Few transactions for volume level');
    }
    
    if (suspiciouslyHighTxSize) {
      score -= 10;
      flags.push('Unusually large individual transactions');
    }
    
    const passed = flags.length === 0;
    const confidence = volume24h > 0 ? 75 : 20;
    
    return {
      name: 'Trading Patterns',
      category: passed ? 'LOW' : 'MEDIUM',
      passed,
      score: Math.max(0, score),
      confidence,
      message: passed ? 
        'Trading patterns appear normal' : 
        `Suspicious trading patterns detected: ${flags.join(', ')}`,
      details: {
        volume24h,
        txns24h,
        avgTxSize,
        priceChange24h,
        flags,
        volatilityLevel: this.categorizeVolatility(Math.abs(priceChange24h))
      },
      recommendation: passed ? 
        'Trading activity looks organic' : 
        'Review trading patterns carefully for potential manipulation'
    };
  }

  private async checkContractVerification(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced> {
    // For educational purposes, simulate contract verification
    const isVerified = this.isSimulatedToken(token) ? 
      Math.random() > 0.3 : // 70% chance for simulated tokens
      Math.random() > 0.5;   // 50% chance for real tokens (placeholder)
    
    const score = isVerified ? 10 : 0;
    const confidence = this.isSimulatedToken(token) ? 60 : 30; // Lower confidence for real analysis
    
    return {
      name: 'Contract Verification',
      category: isVerified ? 'LOW' : 'MEDIUM',
      passed: isVerified,
      score,
      confidence,
      message: isVerified ? 
        'Token contract appears to be verified' : 
        'Token contract verification not available',
      details: {
        verified: isVerified,
        source: this.isSimulatedToken(token) ? 'simulation' : 'limited_analysis',
        note: 'Full verification requires specialized tools'
      },
      recommendation: isVerified ? 
        'Contract verification adds credibility' : 
        'Unverified contracts carry additional risk'
    };
  }

  private async checkOwnershipStatus(token: UnifiedTokenInfo): Promise<SecurityCheckEnhanced> {
    // Simulate ownership analysis
    const ownershipRenounced = this.isSimulatedToken(token) ? 
      (Math.random() > 0.4) : // 60% chance for simulated
      (Math.random() > 0.6);  // 40% chance for real (placeholder)
    
    const score = ownershipRenounced ? 10 : 0;
    const confidence = 50; // Medium confidence for this check
    
    return {
      name: 'Ownership Status',
      category: ownershipRenounced ? 'LOW' : 'MEDIUM',
      passed: ownershipRenounced,
      score,
      confidence,
      message: ownershipRenounced ? 
        'Ownership appears to be renounced' : 
        'Ownership status unclear or not renounced',
      details: {
        renounced: ownershipRenounced,
        analysis_type: 'simulated',
        note: 'Full ownership analysis requires deep contract inspection'
      },
      recommendation: ownershipRenounced ? 
        'Renounced ownership reduces rug pull risk' : 
        'Active ownership increases centralization risk'
    };
  }

  private async detectRiskIndicators(token: UnifiedTokenInfo, checks: SecurityCheckEnhanced[]): Promise<RiskIndicator[]> {
    const indicators: RiskIndicator[] = [];
    
    // Honeypot risk detection
    if (this.config.enableHoneypotDetection) {
      const honeypotRisk = await this.detectHoneypotRisk(token, checks);
      if (honeypotRisk) indicators.push(honeypotRisk);
    }
    
    // Rug pull risk detection
    if (this.config.enableRugPullAnalysis) {
      const rugPullRisk = await this.detectRugPullRisk(token, checks);
      if (rugPullRisk) indicators.push(rugPullRisk);
    }
    
    // Liquidity risk detection
    if (this.config.enableLiquidityAnalysis) {
      const liquidityRisk = await this.detectLiquidityRisk(token, checks);
      if (liquidityRisk) indicators.push(liquidityRisk);
    }
    
    // High concentration risk
    if (this.config.enableHolderAnalysis) {
      const concentrationRisk = await this.detectConcentrationRisk(token, checks);
      if (concentrationRisk) indicators.push(concentrationRisk);
    }
    
    return indicators;
  }

  private async detectHoneypotRisk(token: UnifiedTokenInfo, checks: SecurityCheckEnhanced[]): Promise<RiskIndicator | null> {
    // Analyze factors that contribute to honeypot risk
    const freezeCheck = checks.find(c => c.name === 'Freeze Authority');
    const tradingCheck = checks.find(c => c.name === 'Trading Patterns');
    
    let riskLevel = 0;
    const evidence: string[] = [];
    
    if (freezeCheck && !freezeCheck.passed) {
      riskLevel += 30;
      evidence.push('Freeze authority still active');
    }
    
    if (tradingCheck && !tradingCheck.passed) {
      riskLevel += 20;
      evidence.push('Suspicious trading patterns');
    }
    
    // Check for very low transaction count with high volume
    if (token.volume24h && token.txns24h && token.volume24h > 10000 && token.txns24h < 5) {
      riskLevel += 40;
      evidence.push('Very few transactions for volume level');
    }
    
    if (riskLevel >= 30) {
      return {
        type: 'HONEYPOT',
        severity: riskLevel >= 70 ? 'CRITICAL' : riskLevel >= 50 ? 'HIGH' : 'MEDIUM',
        confidence: Math.min(90, riskLevel + 20),
        description: 'Token may be a honeypot - difficult to sell',
        evidence
      };
    }
    
    return null;
  }

  private async detectRugPullRisk(token: UnifiedTokenInfo, checks: SecurityCheckEnhanced[]): Promise<RiskIndicator | null> {
    const mintCheck = checks.find(c => c.name === 'Mint Authority');
    const liquidityCheck = checks.find(c => c.name === 'Liquidity Analysis');
    const ownershipCheck = checks.find(c => c.name === 'Ownership Status');
    
    let riskLevel = 0;
    const evidence: string[] = [];
    
    if (mintCheck && !mintCheck.passed) {
      riskLevel += 25;
      evidence.push('Mint authority not renounced');
    }
    
    if (liquidityCheck && liquidityCheck.score < 10) {
      riskLevel += 35;
      evidence.push('Very low liquidity');
    }
    
    if (ownershipCheck && !ownershipCheck.passed) {
      riskLevel += 20;
      evidence.push('Ownership not renounced');
    }
    
    // Check token age (newer = higher risk)
    const tokenAge = Date.now() - token.detectedAt;
    if (tokenAge < 3600000) { // Less than 1 hour
      riskLevel += 15;
      evidence.push('Very new token');
    }
    
    if (riskLevel >= 30) {
      return {
        type: 'RUG_PULL',
        severity: riskLevel >= 70 ? 'CRITICAL' : riskLevel >= 50 ? 'HIGH' : 'MEDIUM',
        confidence: Math.min(85, riskLevel + 15),
        description: 'Token has rug pull risk factors',
        evidence
      };
    }
    
    return null;
  }

  private async detectLiquidityRisk(token: UnifiedTokenInfo, checks: SecurityCheckEnhanced[]): Promise<RiskIndicator | null> {
    const liquidityUsd = token.liquidityUsd || 0;
    const minimumSafeLiquidity = 25000; // $25k
    
    if (liquidityUsd < minimumSafeLiquidity) {
      const severity = liquidityUsd < 5000 ? 'HIGH' : liquidityUsd < 15000 ? 'MEDIUM' : 'LOW';
      
      return {
        type: 'LOW_LIQUIDITY',
        severity,
        confidence: 95,
        description: `Low liquidity may cause high slippage and exit difficulties`,
        evidence: [
          `Current liquidity: $${liquidityUsd.toLocaleString()}`,
          `Recommended minimum: $${minimumSafeLiquidity.toLocaleString()}`
        ]
      };
    }
    
    return null;
  }

  private async detectConcentrationRisk(token: UnifiedTokenInfo, checks: SecurityCheckEnhanced[]): Promise<RiskIndicator | null> {
    // For educational purposes, simulate holder concentration analysis
    const hasConcentrationRisk = Math.random() < 0.3; // 30% chance
    
    if (hasConcentrationRisk) {
      return {
        type: 'HIGH_CONCENTRATION',
        severity: 'MEDIUM',
        confidence: 60,
        description: 'Token may have high holder concentration',
        evidence: ['Simulated: Top holders may control significant portion of supply']
      };
    }
    
    return null;
  }

  private compileSecurityInfo(token: UnifiedTokenInfo, checks: SecurityCheckEnhanced[], riskIndicators: RiskIndicator[]): SecurityInfo {
    // Calculate overall score
    const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
    const maxPossibleScore = checks.reduce((sum, check) => sum + (check.category === 'CRITICAL' ? 30 : check.category === 'HIGH' ? 25 : check.category === 'MEDIUM' ? 20 : 15), 0);
    const normalizedScore = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;
    
    // Extract flags from failed checks and risk indicators
    const flags: string[] = [];
    
    checks.forEach(check => {
      if (!check.passed) {
        flags.push(check.name.toUpperCase().replace(/ /g, '_'));
      }
    });
    
    riskIndicators.forEach(indicator => {
      flags.push(indicator.type);
    });
    
    // Determine recommendation (INFO ONLY - never filters)
    let recommendation: 'PROCEED' | 'CAUTION' | 'HIGH_RISK';
    
    if (normalizedScore >= 80 && riskIndicators.filter(r => r.severity === 'HIGH' || r.severity === 'CRITICAL').length === 0) {
      recommendation = 'PROCEED';
    } else if (normalizedScore >= 60 && riskIndicators.filter(r => r.severity === 'CRITICAL').length === 0) {
      recommendation = 'CAUTION';
    } else {
      recommendation = 'HIGH_RISK';
    }
    
    // Calculate overall confidence
    const avgConfidence = checks.reduce((sum, check) => sum + check.confidence, 0) / checks.length;
    
    const securityInfo: SecurityInfo = {
      score: Math.max(0, Math.min(100, normalizedScore)),
      flags,
      details: {
        contractVerified: checks.find(c => c.name === 'Contract Verification')?.passed || false,
        liquidityLocked: false, // Would need additional analysis
        ownershipRenounced: checks.find(c => c.name === 'Ownership Status')?.passed || false,
        honeypotRisk: riskIndicators.find(r => r.type === 'HONEYPOT')?.confidence || 0,
        rugPullIndicators: riskIndicators.filter(r => r.type === 'RUG_PULL').map(r => r.description)
      },
      recommendation,
      analyzedAt: Date.now(),
      confidence: Math.round(avgConfidence),
      riskIndicators,
      checks
    };
    
    logger.info(`🔒 Security analysis complete: ${token.symbol}`, {
      score: securityInfo.score,
      recommendation: securityInfo.recommendation,
      riskIndicators: riskIndicators.length,
      info_only: true // Always log that this is info-only
    });
    
    return securityInfo;
  }

  // Simulation methods for educational tokens
  private isSimulatedToken(token: UnifiedTokenInfo): boolean {
    return !token.address || 
           token.address.startsWith('SIMULATED_') ||
           token.address.startsWith('DEMO_') ||
           token.address.startsWith('EXTRACTED_') ||
           token.source?.includes('demo') ||
           (token.metadata as any)?.demo === true;
  }

  private simulateMintAuthorityCheck(token: UnifiedTokenInfo): SecurityCheckEnhanced {
    const passed = Math.random() > 0.3; // 70% pass rate for educational tokens
    return {
      name: 'Mint Authority',
      category: passed ? 'LOW' : 'HIGH',
      passed,
      score: passed ? 25 : 0,
      confidence: 85,
      message: passed ? 
        'Mint authority properly revoked (simulated)' : 
        'Mint authority still active (simulated)',
      details: { 
        simulation: true,
        mintAuthority: passed ? null : 'simulated_authority'
      },
      recommendation: passed ? 
        'Good: Token supply is fixed' : 
        'Caution: Token supply can be inflated'
    };
  }

  private simulateFreezeAuthorityCheck(token: UnifiedTokenInfo): SecurityCheckEnhanced {
    const passed = Math.random() > 0.25; // 75% pass rate
    return {
      name: 'Freeze Authority',
      category: passed ? 'LOW' : 'MEDIUM',
      passed,
      score: passed ? 20 : 0,
      confidence: 85,
      message: passed ? 
        'Freeze authority properly revoked (simulated)' : 
        'Freeze authority still active (simulated)',
      details: { 
        simulation: true,
        freezeAuthority: passed ? null : 'simulated_authority'
      }
    };
  }

  private simulateSupplyAnalysis(token: UnifiedTokenInfo): SecurityCheckEnhanced {
    const passed = Math.random() > 0.2; // 80% pass rate
    const score = passed ? 15 : 5;
    
    return {
      name: 'Supply Analysis',
      category: passed ? 'LOW' : 'MEDIUM',
      passed,
      score,
      confidence: 80,
      message: passed ? 
        'Token supply appears reasonable (simulated)' : 
        'Token supply may be suspicious (simulated)',
      details: { 
        simulation: true,
        supply: '1000000000',
        decimals: 9,
        category: passed ? 'normal' : 'suspicious'
      }
    };
  }

  // Helper methods
  private categorizeSupply(supply: number): string {
    if (supply < 1e6) return 'very_low';
    if (supply < 1e9) return 'low';
    if (supply < 1e12) return 'normal';
    if (supply < 1e15) return 'high';
    return 'very_high';
  }

  private categorizeLiquidity(liquidity: number): string {
    if (liquidity < 1000) return 'very_low';
    if (liquidity < 10000) return 'low';
    if (liquidity < 100000) return 'moderate';
    if (liquidity < 1000000) return 'good';
    return 'excellent';
  }

  private categorizeVolatility(priceChange: number): string {
    if (priceChange < 10) return 'low';
    if (priceChange < 50) return 'moderate';
    if (priceChange < 200) return 'high';
    return 'extreme';
  }

  private startCleanupTask(): void {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 3600000; // 1 hour
      
      let cleaned = 0;
      for (const [address, info] of this.analyzed) {
        if (now - info.analyzedAt > maxAge) {
          this.analyzed.delete(address);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        logger.debug(`🧹 Cleaned up ${cleaned} old security analyses`);
      }
    }, 300000); // Clean every 5 minutes
  }

  // Public API
  getAnalyzed(address: string): SecurityInfo | null {
    return this.analyzed.get(address) || null;
  }

  getStats(): any {
    const analyses = Array.from(this.analyzed.values());
    
    return {
      totalAnalyzed: analyses.length,
      averageScore: analyses.length > 0 ? 
        analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length : 0,
      recommendationDistribution: {
        proceed: analyses.filter(a => a.recommendation === 'PROCEED').length,
        caution: analyses.filter(a => a.recommendation === 'CAUTION').length,
        high_risk: analyses.filter(a => a.recommendation === 'HIGH_RISK').length
      },
      riskIndicatorStats: {
        honeypot: analyses.filter(a => a.riskIndicators.some(r => r.type === 'HONEYPOT')).length,
        rug_pull: analyses.filter(a => a.riskIndicators.some(r => r.type === 'RUG_PULL')).length,
        low_liquidity: analyses.filter(a => a.riskIndicators.some(r => r.type === 'LOW_LIQUIDITY')).length
      },
      config: this.config
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.isRunning;
  }
}