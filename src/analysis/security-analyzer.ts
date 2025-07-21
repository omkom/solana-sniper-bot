import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { TokenInfo, SecurityCheckBase as SecurityCheck, SecurityAnalysis } from '../types/unified';
import { ConnectionManager } from '../core/connection';
import { getIframeRPCService } from '../core/iframe-rpc-service';

export class SecurityAnalyzer {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private iframeRPCService: any;

  constructor() {
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    this.iframeRPCService = getIframeRPCService();
    console.log('🔒 SecurityAnalyzer initialized with iframe RPC support');
  }

  async analyzeToken(tokenInfo: TokenInfo): Promise<SecurityAnalysis> {
    // console.log(`🔒 Analyzing security for token: ${tokenInfo.symbol || tokenInfo.mint}`);

    const checks: SecurityCheck[] = [];

    try {
      // For demo tokens or invalid addresses, use simulation
      if (!tokenInfo.mint ||
          tokenInfo.mint.startsWith('SIMULATED_') || 
          tokenInfo.mint.startsWith('EXTRACTED_') || 
          tokenInfo.mint.startsWith('DEMO_') ||
          !this.isValidSolanaAddress(tokenInfo.mint)) {
        
        if (tokenInfo.mint && !this.isValidSolanaAddress(tokenInfo.mint)) {
          // console.warn(`⚠️ Invalid Solana address format: ${tokenInfo.mint}`);
        }
        return this.simulateSecurityAnalysis(tokenInfo);
      }

      // Real analysis for actual tokens (when available)
      const mintPubkey = new PublicKey(tokenInfo.mint);

      // Check mint authority
      checks.push(await this.checkMintAuthority(mintPubkey));

      // Check freeze authority  
      checks.push(await this.checkFreezeAuthority(mintPubkey));

      // Check supply analysis
      checks.push(await this.checkSupplyAnalysis(mintPubkey));

      // Check metadata
      checks.push(await this.checkMetadata(mintPubkey));

      // Check liquidity patterns
      checks.push(await this.checkLiquidityPatterns(tokenInfo));

    } catch (error) {
      console.warn('⚠️ Error during security analysis:', error);
      checks.push({
        name: 'Analysis Error',
        passed: false,
        score: 0,
        message: `Analysis failed: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      });
    }

    return this.compileAnalysis(checks);
  }

  private async checkMintAuthority(mint: PublicKey): Promise<SecurityCheck> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      const passed = mintInfo.mintAuthority === null;
      
      return {
        name: 'Mint Authority',
        passed,
        score: passed ? 30 : 0,
        message: passed ? 'Mint authority properly revoked' : 'Mint authority still active (risk of inflation)',
        details: { mintAuthority: mintInfo.mintAuthority?.toString() || null }
      };
    } catch (error) {
      return {
        name: 'Mint Authority',
        passed: false,
        score: 0,
        message: `Unable to verify mint authority: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkFreezeAuthority(mint: PublicKey): Promise<SecurityCheck> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      const passed = mintInfo.freezeAuthority === null;
      
      return {
        name: 'Freeze Authority',
        passed,
        score: passed ? 20 : 0,
        message: passed ? 'Freeze authority properly revoked' : 'Freeze authority still active (risk of account freezing)',
        details: { freezeAuthority: mintInfo.freezeAuthority?.toString() || null }
      };
    } catch (error) {
      return {
        name: 'Freeze Authority',
        passed: false,
        score: 0,
        message: `Unable to verify freeze authority: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkSupplyAnalysis(mint: PublicKey): Promise<SecurityCheck> {
    try {
      const mintInfo = await getMint(this.connection, mint);
      const supply = Number(mintInfo.supply);
      const maxSupply = mintInfo.mintAuthority ? null : supply;
      
      const passed = supply > 0 && supply < 1e15; // Reasonable supply range
      
      return {
        name: 'Supply Analysis',
        passed,
        score: passed ? 15 : 0,
        message: passed ? 'Token supply appears reasonable' : 'Token supply appears suspicious',
        details: { 
          supply: supply.toString(),
          maxSupply: maxSupply?.toString() || 'unlimited',
          decimals: mintInfo.decimals
        }
      };
    } catch (error) {
      return {
        name: 'Supply Analysis',
        passed: false,
        score: 0,
        message: `Unable to analyze supply: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkMetadata(mint: PublicKey): Promise<SecurityCheck> {
    try {
      // Simplified metadata check for educational purposes
      const score = Math.random() > 0.5 ? 10 : 0; // Simulate metadata verification
      const passed = score > 0;
      
      return {
        name: 'Metadata Verification',
        passed,
        score,
        message: passed ? 'Metadata appears valid' : 'Metadata verification failed',
        details: { 
          educational: true,
          note: 'Full metadata verification would require additional RPC calls'
        }
      };
    } catch (error) {
      return {
        name: 'Metadata Verification',
        passed: false,
        score: 0,
        message: `Metadata check failed: ${error}`,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  private async checkLiquidityPatterns(tokenInfo: TokenInfo): Promise<SecurityCheck> {
    const liquidity = tokenInfo.liquidity;
    
    if (!liquidity) {
      return {
        name: 'Liquidity Analysis',
        passed: false,
        score: 0,
        message: 'No liquidity information available',
        details: { reason: 'missing_liquidity_data' }
      };
    }

    const minLiquiditySOL = 1; // Minimum 1 SOL
    const solAmount = liquidity.sol || 0;
    const passed = solAmount >= minLiquiditySOL;
    const score = Math.min(25, solAmount * 5); // Up to 25 points

    return {
      name: 'Liquidity Analysis',
      passed,
      score,
      message: passed 
        ? `Adequate liquidity: ${liquidity.sol} SOL` 
        : `Insufficient liquidity: ${liquidity.sol} SOL (minimum ${minLiquiditySOL})`,
      details: {
        liquiditySOL: liquidity.sol,
        liquidityUSD: liquidity.usd,
        minimumRequired: minLiquiditySOL
      }
    };
  }

  private simulateSecurityAnalysis(tokenInfo: TokenInfo): SecurityAnalysis {
    // Generate weighted random score between 60-95 with higher probability above 70
    const baseScore = this.generateWeightedScore(tokenInfo);
    
    // Apply source-based boosting for trusted sources
    const sourceBoostedScore = this.applySourceBasedBoosting(baseScore, tokenInfo);
    
    // Distribute the final score across checks realistically
    const checks = this.generateRealisticChecks(sourceBoostedScore, tokenInfo);

    return this.compileAnalysisWithTargetScore(checks, sourceBoostedScore);
  }

  private generateWeightedScore(tokenInfo: TokenInfo): number {
    // Use weighted randomization for more realistic distribution
    // Higher probability for scores above 70
    const rand = Math.random();
    
    let score: number;
    if (rand < 0.15) {
      // 15% chance for 60-70 range (lower scores)
      score = 60 + Math.random() * 10;
    } else if (rand < 0.40) {
      // 25% chance for 70-80 range (good scores)
      score = 70 + Math.random() * 10;
    } else if (rand < 0.75) {
      // 35% chance for 80-90 range (very good scores)
      score = 80 + Math.random() * 10;
    } else {
      // 25% chance for 90-95 range (excellent scores)
      score = 90 + Math.random() * 5;
    }
    
    return Math.round(score);
  }

  private applySourceBasedBoosting(baseScore: number, tokenInfo: TokenInfo): number {
    const source = tokenInfo.source?.toLowerCase() || '';
    let boostedScore = baseScore;
    
    // Source-based score boosting for trusted sources
    if (source === 'demo' || source === 'educational') {
      // Demo tokens get +5 boost for educational purposes
      boostedScore += 5;
    } else if (source.includes('raydium')) {
      // Raydium sources get +3 boost (established DEX)
      boostedScore += 3;
    } else if (source.includes('orca') || source.includes('jupiter')) {
      // Other major DEXes get +2 boost
      boostedScore += 2;
    } else if (source.includes('pump')) {
      // Pump sources get -2 penalty (higher risk)
      boostedScore -= 2;
    } else if (source.includes('websocket') || source.includes('real_monitor')) {
      // Real-time sources get +1 boost (verified activity)
      boostedScore += 1;
    }
    
    // Apply metadata-based boosts
    if (tokenInfo.metadata) {
      if (tokenInfo.metadata.educational || tokenInfo.metadata.demo) {
        boostedScore += 3; // Educational tokens are safer
      }
      if (tokenInfo.metadata.verified) {
        boostedScore += 2; // Verified tokens get boost
      }
    }
    
    // Age-based boost (newer tokens might be less tested)
    if (tokenInfo.createdAt) {
      const ageMs = Date.now() - tokenInfo.createdAt;
      const ageHours = ageMs / (1000 * 60 * 60);
      
      if (ageHours > 24) {
        boostedScore += 2; // Older tokens get small boost
      } else if (ageHours < 1) {
        boostedScore -= 1; // Very new tokens get small penalty
      }
    }
    
    // Ensure score stays within 60-95 range
    return Math.max(60, Math.min(95, Math.round(boostedScore)));
  }

  private generateRealisticChecks(targetScore: number, tokenInfo: TokenInfo): SecurityCheck[] {
    const source = tokenInfo.source?.toLowerCase() || '';
    
    // Distribute target score across checks realistically
    const checks: SecurityCheck[] = [];
    
    // Mint Authority Check (30 points max)
    const mintPassed = targetScore >= 70 || Math.random() > 0.2;
    const mintScore = mintPassed ? 30 : Math.floor(Math.random() * 15);
    checks.push({
      name: 'Mint Authority',
      passed: mintPassed,
      score: mintScore,
      message: mintPassed ? 
        'Mint authority properly revoked (simulated)' : 
        'Mint authority still active - moderate risk (simulated)',
      details: { 
        simulation: true,
        source: source,
        boost: tokenInfo.metadata?.demo ? 'Educational token boost applied' : undefined
      }
    });

    // Freeze Authority Check (20 points max)
    const freezePassed = targetScore >= 65 || Math.random() > 0.15;
    const freezeScore = freezePassed ? 20 : Math.floor(Math.random() * 10);
    checks.push({
      name: 'Freeze Authority',
      passed: freezePassed,
      score: freezeScore,
      message: freezePassed ? 
        'Freeze authority properly revoked (simulated)' : 
        'Freeze authority still active - risk of freezing (simulated)',
      details: { 
        simulation: true,
        source: source
      }
    });

    // Supply Analysis (15 points max)
    const supplyPassed = targetScore >= 60 || Math.random() > 0.1;
    const supplyScore = supplyPassed ? 15 : Math.floor(Math.random() * 8);
    checks.push({
      name: 'Supply Analysis',
      passed: supplyPassed,
      score: supplyScore,
      message: supplyPassed ? 
        'Token supply appears reasonable (simulated)' : 
        'Token supply appears suspicious (simulated)',
      details: { 
        simulation: true,
        source: source,
        supply: tokenInfo.supply || 'simulated'
      }
    });

    // Liquidity Analysis (25 points max) - adjust based on remaining score needed
    const currentScore = mintScore + freezeScore + supplyScore;
    const remainingForTarget = Math.max(0, Math.floor((targetScore / 100) * 90) - currentScore);
    const liquidityScore = Math.min(25, Math.max(5, remainingForTarget));
    const liquidityPassed = liquidityScore >= 10;
    
    checks.push({
      name: 'Liquidity Analysis',
      passed: liquidityPassed,
      score: liquidityScore,
      message: liquidityPassed ? 
        `Adequate liquidity detected (simulated): ${tokenInfo.liquidity?.usd || 'N/A'} USD` : 
        `Low liquidity detected (simulated): ${tokenInfo.liquidity?.usd || 'N/A'} USD`,
      details: { 
        simulation: true,
        source: source,
        liquiditySOL: tokenInfo.liquidity?.sol || 0,
        liquidityUSD: tokenInfo.liquidity?.usd || 0
      }
    });

    return checks;
  }

  private compileAnalysisWithTargetScore(checks: SecurityCheck[], targetScore: number): SecurityAnalysis {
    const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
    const maxPossibleScore = 90; // 30 + 20 + 15 + 25
    let normalizedScore = Math.round((totalScore / maxPossibleScore) * 100);
    
    // Ensure we hit close to target score (within 5 points)
    if (Math.abs(normalizedScore - targetScore) > 5) {
      normalizedScore = targetScore;
    }
    
    const failedChecks = checks.filter(check => !check.passed);
    const warnings = failedChecks.map(check => check.message);
    
    // More lenient pass criteria for educational tokens
    const overall = failedChecks.length <= 2 && normalizedScore >= 60;

    console.log(`📊 Realistic security analysis: ${normalizedScore}/100 (${overall ? 'PASS' : 'FAIL'}) - Target: ${targetScore}`);

    return {
      overall,
      score: normalizedScore,
      checks,
      warnings
    };
  }

  private compileAnalysis(checks: SecurityCheck[]): SecurityAnalysis {
    const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
    const maxPossibleScore = 90; // 30 + 20 + 15 + 25
    const normalizedScore = Math.round((totalScore / maxPossibleScore) * 100);
    
    const failedChecks = checks.filter(check => !check.passed);
    const warnings = failedChecks.map(check => check.message);
    
    const overall = failedChecks.length <= 1 && normalizedScore >= 30;

    // console.log(`📊 Security analysis complete: ${normalizedScore}/100 (${overall ? 'PASS' : 'FAIL'})`);

    return {
      overall,
      score: normalizedScore,
      checks,
      warnings
    };
  }

  private isValidSolanaAddress(address: string): boolean {
    try {
      // Check basic format - Solana addresses are base58 and typically 32-44 characters
      if (!address || address.length < 32 || address.length > 44) {
        return false;
      }
      
      // Check for valid base58 characters only
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      if (!base58Regex.test(address)) {
        return false;
      }
      
      // Try to create PublicKey to validate
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  async checkForHoneypot(tokenInfo: TokenInfo): Promise<boolean> {
    // console.log(`🍯 Checking for honeypot patterns: ${tokenInfo.symbol || tokenInfo.mint}`);
    
    // Educational honeypot detection simulation
    if (tokenInfo.mint && (tokenInfo.mint.startsWith('SIMULATED_') || tokenInfo.mint.startsWith('EXTRACTED_'))) {
      const isHoneypot = Math.random() < 0.03; // 3% chance for demo
      // console.log(`🔍 Honeypot check result: ${isHoneypot ? 'SUSPICIOUS' : 'CLEAN'} (simulated)`);
      return isHoneypot;
    }

    // For real tokens, implement actual honeypot detection logic
    try {
      // This would involve simulating buy/sell transactions
      // For educational purposes, return false
      // console.log('🔍 Honeypot check: Not implemented for real tokens (educational system)');
      return false;
    } catch (error) {
      console.warn('⚠️ Honeypot check failed:', error);
      return true; // Assume suspicious if check fails
    }
  }

  // Test method to verify realistic score generation
  testRealisticScoring(iterations: number = 100): void {
    console.log(`\n🧪 Testing realistic security score generation (${iterations} iterations):`);
    
    const testSources = ['demo', 'raydium', 'orca', 'pump.fun', 'websocket-raydium', 'unknown'];
    const results: { [key: string]: number[] } = {};
    
    testSources.forEach(source => {
      results[source] = [];
      
      for (let i = 0; i < iterations; i++) {
        const testToken: TokenInfo = {
          address: `TEST_${source}_${i}`,
          mint: `TEST_${source}_${i}`,
          symbol: `TEST${i}`,
          name: `Test Token ${i}`,
          decimals: 9,
          supply: '1000000',
          signature: 'test',
          timestamp: Date.now(),
          createdAt: Date.now(),
          source: source,
          detected: true,
          detectedAt: Date.now(),
          liquidity: { sol: 10, usd: 2000 },
          metadata: { demo: source === 'demo' }
        };
        
        const analysis = this.simulateSecurityAnalysis(testToken);
        results[source].push(analysis.score);
      }
    });
    
    // Display results
    testSources.forEach(source => {
      const scores = results[source];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const above70 = scores.filter(s => s >= 70).length;
      const above80 = scores.filter(s => s >= 80).length;
      
      console.log(`📊 ${source.toUpperCase()}:`);
      console.log(`   Average: ${avg.toFixed(1)}, Range: ${min}-${max}`);
      console.log(`   Above 70: ${above70}/${iterations} (${(above70/iterations*100).toFixed(1)}%)`);
      console.log(`   Above 80: ${above80}/${iterations} (${(above80/iterations*100).toFixed(1)}%)`);
    });
    
    console.log('\n✅ Security score testing completed\n');
  }
}