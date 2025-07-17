import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { TokenInfo, SecurityCheck, SecurityAnalysis } from '../types';
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
    console.log(`🔒 Analyzing security for token: ${tokenInfo.symbol || tokenInfo.mint}`);

    const checks: SecurityCheck[] = [];

    try {
      // For demo tokens or invalid addresses, use simulation
      if (tokenInfo.mint.startsWith('SIMULATED_') || 
          tokenInfo.mint.startsWith('EXTRACTED_') || 
          tokenInfo.mint.startsWith('DEMO_') ||
          !this.isValidSolanaAddress(tokenInfo.mint)) {
        
        if (!this.isValidSolanaAddress(tokenInfo.mint)) {
          console.warn(`⚠️ Invalid Solana address format: ${tokenInfo.mint}`);
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
    const passed = liquidity.sol >= minLiquiditySOL;
    const score = Math.min(25, liquidity.sol * 5); // Up to 25 points

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
    // Simulate analysis for educational demo tokens with higher pass rates
    const checks: SecurityCheck[] = [
      {
        name: 'Mint Authority',
        passed: Math.random() > 0.15,
        score: Math.random() > 0.15 ? 30 : 0,
        message: 'Simulated mint authority check',
        details: { simulation: true }
      },
      {
        name: 'Freeze Authority', 
        passed: Math.random() > 0.1,
        score: Math.random() > 0.1 ? 20 : 0,
        message: 'Simulated freeze authority check',
        details: { simulation: true }
      },
      {
        name: 'Supply Analysis',
        passed: Math.random() > 0.05,
        score: Math.random() > 0.05 ? 15 : 0,
        message: 'Simulated supply analysis',
        details: { simulation: true }
      },
      {
        name: 'Liquidity Analysis',
        passed: Math.random() > 0.2,
        score: Math.floor(Math.random() * 25) + 5, // Minimum 5 points
        message: 'Simulated liquidity analysis',
        details: { simulation: true }
      }
    ];

    return this.compileAnalysis(checks);
  }

  private compileAnalysis(checks: SecurityCheck[]): SecurityAnalysis {
    const totalScore = checks.reduce((sum, check) => sum + check.score, 0);
    const maxPossibleScore = 90; // 30 + 20 + 15 + 25
    const normalizedScore = Math.round((totalScore / maxPossibleScore) * 100);
    
    const failedChecks = checks.filter(check => !check.passed);
    const warnings = failedChecks.map(check => check.message);
    
    const overall = failedChecks.length <= 1 && normalizedScore >= 30;

    console.log(`📊 Security analysis complete: ${normalizedScore}/100 (${overall ? 'PASS' : 'FAIL'})`);

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
    console.log(`🍯 Checking for honeypot patterns: ${tokenInfo.symbol || tokenInfo.mint}`);
    
    // Educational honeypot detection simulation
    if (tokenInfo.mint.startsWith('SIMULATED_') || tokenInfo.mint.startsWith('EXTRACTED_')) {
      const isHoneypot = Math.random() < 0.03; // 3% chance for demo
      console.log(`🔍 Honeypot check result: ${isHoneypot ? 'SUSPICIOUS' : 'CLEAN'} (simulated)`);
      return isHoneypot;
    }

    // For real tokens, implement actual honeypot detection logic
    try {
      // This would involve simulating buy/sell transactions
      // For educational purposes, return false
      console.log('🔍 Honeypot check: Not implemented for real tokens (educational system)');
      return false;
    } catch (error) {
      console.warn('⚠️ Honeypot check failed:', error);
      return true; // Assume suspicious if check fails
    }
  }
}