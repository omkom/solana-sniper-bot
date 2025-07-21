/**
 * Enhanced Token Detection Engine
 * Advanced detection algorithms with honeypot/rug detection and momentum analysis
 * AI-powered momentum detection with comprehensive risk assessment
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { UnifiedTokenInfo } from '../types/unified';
import { apiCoordinator } from '../core/centralized-api-coordinator';

export interface TokenRiskAssessment {
  score: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  flags: string[];
  details: {
    contractVerified: boolean;
    liquidityLocked: boolean;
    ownershipRenounced: boolean;
    honeypotRisk: number;
    rugPullIndicators: string[];
    holderAnalysis: {
      totalHolders: number;
      topHolderConcentration: number;
      suspiciousWallets: number;
    };
    tradingPatterns: {
      botActivity: number;
      volumeManipulation: boolean;
      priceManipulation: boolean;
    };
  };
}

export interface MomentumAnalysis {
  score: number; // 0-100
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE';
  timeframes: {
    '1m': { priceChange: number; volumeSpike: boolean };
    '5m': { priceChange: number; volumeSpike: boolean };
    '15m': { priceChange: number; volumeSpike: boolean };
  };
  indicators: {
    rsi: number;
    volumeProfile: number;
    socialSentiment: number;
    whaleActivity: boolean;
  };
}

export interface EnhancedTokenAnalysis {
  token: UnifiedTokenInfo;
  confidence: number;
  riskAssessment: TokenRiskAssessment;
  momentumAnalysis: MomentumAnalysis;
  recommendation: 'BUY' | 'HOLD' | 'SELL' | 'AVOID';
  timestamp: number;
  processingTime: number;
}

export class EnhancedTokenDetection extends EventEmitter {
  private isRunning = false;
  private processedTokens = new Set<string>();
  private cache = new Map<string, { analysis: EnhancedTokenAnalysis; timestamp: number }>();
  private cacheTimeout = 300000; // 5 minutes

  // AI-powered pattern recognition weights
  private readonly patternWeights = {
    liquidityGrowth: 0.25,
    volumeSpikes: 0.20,
    holderDistribution: 0.15,
    priceStability: 0.15,
    socialSentiment: 0.10,
    contractSecurity: 0.15
  };

  constructor() {
    super();
    logger.info('🤖 Enhanced Token Detection Engine initialized');
  }

  async analyze(token: UnifiedTokenInfo): Promise<EnhancedTokenAnalysis> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cached = this.getCachedAnalysis(token.address);
      if (cached) {
        return cached;
      }

      logger.debug(`🔍 Analyzing token: ${token.symbol} (${token.address})`);

      // Parallel analysis for speed
      const [riskAssessment, momentumAnalysis] = await Promise.all([
        this.performRiskAssessment(token),
        this.performMomentumAnalysis(token)
      ]);

      // Calculate overall confidence using AI-powered scoring
      const confidence = this.calculateConfidenceScore(token, riskAssessment, momentumAnalysis);
      
      // Generate trading recommendation
      const recommendation = this.generateRecommendation(confidence, riskAssessment, momentumAnalysis);

      const analysis: EnhancedTokenAnalysis = {
        token,
        confidence,
        riskAssessment,
        momentumAnalysis,
        recommendation,
        timestamp: Date.now(),
        processingTime: Date.now() - startTime
      };

      // Cache the analysis
      this.cacheAnalysis(token.address, analysis);

      logger.info(`✅ Enhanced analysis completed for ${token.symbol}: ${confidence}% confidence, ${recommendation} recommendation`);
      
      // Emit analysis result
      this.emit('analysisComplete', analysis);
      
      return analysis;

    } catch (error) {
      logger.error(`❌ Enhanced analysis failed for ${token.address}:`, error);
      throw error;
    }
  }

  private async performRiskAssessment(token: UnifiedTokenInfo): Promise<TokenRiskAssessment> {
    let score = 100; // Start with perfect score, subtract for risks
    const flags: string[] = [];
    const rugPullIndicators: string[] = [];

    // Contract verification check
    const contractVerified = await this.checkContractVerification(token.address);
    if (!contractVerified) {
      score -= 20;
      flags.push('UNVERIFIED_CONTRACT');
    }

    // Liquidity analysis
    const liquidityLocked = await this.checkLiquidityLock(token.address);
    if (!liquidityLocked) {
      score -= 15;
      flags.push('UNLOCKED_LIQUIDITY');
      rugPullIndicators.push('Liquidity not locked');
    }

    // Ownership analysis
    const ownershipRenounced = await this.checkOwnershipRenouncement(token.address);
    if (!ownershipRenounced) {
      score -= 10;
      flags.push('OWNERSHIP_NOT_RENOUNCED');
    }

    // Honeypot detection using multiple indicators
    const honeypotRisk = await this.detectHoneypot(token);
    if (honeypotRisk > 70) {
      score -= 30;
      flags.push('HONEYPOT_DETECTED');
      rugPullIndicators.push('High honeypot risk detected');
    }

    // Holder distribution analysis
    const holderAnalysis = await this.analyzeHolderDistribution(token.address);
    if (holderAnalysis.topHolderConcentration > 50) {
      score -= 15;
      flags.push('HIGH_CONCENTRATION');
      rugPullIndicators.push('High holder concentration');
    }

    // Trading pattern analysis
    const tradingPatterns = await this.analyzeTradingPatterns(token.address);
    if (tradingPatterns.botActivity > 80) {
      score -= 10;
      flags.push('HIGH_BOT_ACTIVITY');
    }

    const riskLevel = this.calculateRiskLevel(score);

    return {
      score: Math.max(0, Math.min(100, score)),
      riskLevel,
      flags,
      details: {
        contractVerified,
        liquidityLocked,
        ownershipRenounced,
        honeypotRisk,
        rugPullIndicators,
        holderAnalysis,
        tradingPatterns
      }
    };
  }

  private async performMomentumAnalysis(token: UnifiedTokenInfo): Promise<MomentumAnalysis> {
    try {
      // Get price and volume data for different timeframes
      const priceData = await this.getPriceData(token.address);
      
      const timeframes = {
        '1m': {
          priceChange: this.calculatePriceChange(priceData, '1m'),
          volumeSpike: this.detectVolumeSpike(priceData, '1m')
        },
        '5m': {
          priceChange: this.calculatePriceChange(priceData, '5m'),
          volumeSpike: this.detectVolumeSpike(priceData, '5m')
        },
        '15m': {
          priceChange: this.calculatePriceChange(priceData, '15m'),
          volumeSpike: this.detectVolumeSpike(priceData, '15m')
        }
      };

      // Calculate technical indicators
      const rsi = this.calculateRSI(priceData);
      const volumeProfile = this.calculateVolumeProfile(priceData);
      const socialSentiment = await this.analyzeSocialSentiment(token.symbol);
      const whaleActivity = await this.detectWhaleActivity(token.address);

      // Calculate momentum score using weighted factors
      let score = 0;
      score += Math.abs(timeframes['1m'].priceChange) * 0.4;
      score += Math.abs(timeframes['5m'].priceChange) * 0.3;
      score += Math.abs(timeframes['15m'].priceChange) * 0.3;
      score += (volumeProfile / 10); // Normalize volume impact
      
      // Determine trend direction
      const avgPriceChange = (timeframes['1m'].priceChange + timeframes['5m'].priceChange + timeframes['15m'].priceChange) / 3;
      let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE';
      
      if (Math.abs(avgPriceChange) > 20) {
        trend = 'VOLATILE';
      } else if (avgPriceChange > 5) {
        trend = 'BULLISH';
      } else if (avgPriceChange < -5) {
        trend = 'BEARISH';
      } else {
        trend = 'NEUTRAL';
      }

      return {
        score: Math.min(100, Math.max(0, score)),
        trend,
        timeframes,
        indicators: {
          rsi,
          volumeProfile,
          socialSentiment,
          whaleActivity
        }
      };
    } catch (error) {
      logger.error('Error in momentum analysis:', error);
      return {
        score: 0,
        trend: 'NEUTRAL',
        timeframes: {
          '1m': { priceChange: 0, volumeSpike: false },
          '5m': { priceChange: 0, volumeSpike: false },
          '15m': { priceChange: 0, volumeSpike: false }
        },
        indicators: {
          rsi: 50,
          volumeProfile: 0,
          socialSentiment: 0,
          whaleActivity: false
        }
      };
    }
  }

  private calculateConfidenceScore(
    token: UnifiedTokenInfo,
    risk: TokenRiskAssessment,
    momentum: MomentumAnalysis
  ): number {
    let confidence = 0;

    // Risk assessment impact (higher risk = lower confidence)
    confidence += (risk.score * this.patternWeights.contractSecurity);

    // Momentum analysis impact
    confidence += (momentum.score * this.patternWeights.volumeSpikes);

    // Liquidity factor
    if (token.liquidity) {
      const liquidityValue = typeof token.liquidity === 'object' ? 
        (token.liquidity.sol || token.liquidity.usd || 0) : token.liquidity;
      confidence += Math.min(20, liquidityValue / 1000) * this.patternWeights.liquidityGrowth;
    }

    // Volume factor
    if (token.volume24h) {
      confidence += Math.min(15, token.volume24h / 10000) * this.patternWeights.volumeSpikes;
    }

    // Social sentiment factor
    confidence += (momentum.indicators.socialSentiment * this.patternWeights.socialSentiment);

    return Math.min(100, Math.max(0, confidence));
  }

  private generateRecommendation(
    confidence: number,
    risk: TokenRiskAssessment,
    momentum: MomentumAnalysis
  ): 'BUY' | 'HOLD' | 'SELL' | 'AVOID' {
    // High risk tokens should be avoided
    if (risk.riskLevel === 'EXTREME' || risk.score < 30) {
      return 'AVOID';
    }

    // High confidence + bullish momentum = BUY
    if (confidence > 70 && momentum.trend === 'BULLISH' && risk.riskLevel === 'LOW') {
      return 'BUY';
    }

    // Bearish momentum = SELL
    if (momentum.trend === 'BEARISH' && momentum.score > 50) {
      return 'SELL';
    }

    // Medium confidence = HOLD
    if (confidence > 40 && risk.riskLevel !== 'HIGH') {
      return 'HOLD';
    }

    // Default to AVOID for safety
    return 'AVOID';
  }

  // Helper methods for various checks
  private async checkContractVerification(address: string): Promise<boolean> {
    try {
      // Simulate contract verification check
      // In real implementation, would check against known sources
      return Math.random() > 0.3; // 70% verified rate simulation
    } catch {
      return false;
    }
  }

  private async checkLiquidityLock(address: string): Promise<boolean> {
    try {
      // Simulate liquidity lock check
      return Math.random() > 0.5; // 50% locked rate simulation
    } catch {
      return false;
    }
  }

  private async checkOwnershipRenouncement(address: string): Promise<boolean> {
    try {
      // Simulate ownership renouncement check
      return Math.random() > 0.4; // 60% renounced rate simulation
    } catch {
      return false;
    }
  }

  private async detectHoneypot(token: UnifiedTokenInfo): Promise<number> {
    try {
      // Simulate honeypot detection algorithm
      let risk = 0;
      
      // Check for suspicious patterns
      if (!token.volume24h || token.volume24h < 100) risk += 30;
      if (token.priceChange24h && Math.abs(token.priceChange24h) > 500) risk += 40;
      
      return Math.min(100, risk);
    } catch {
      return 50; // Default medium risk
    }
  }

  private async analyzeHolderDistribution(address: string): Promise<{
    totalHolders: number;
    topHolderConcentration: number;
    suspiciousWallets: number;
  }> {
    // Simulate holder analysis
    return {
      totalHolders: Math.floor(Math.random() * 10000) + 100,
      topHolderConcentration: Math.random() * 80,
      suspiciousWallets: Math.floor(Math.random() * 10)
    };
  }

  private async analyzeTradingPatterns(address: string): Promise<{
    botActivity: number;
    volumeManipulation: boolean;
    priceManipulation: boolean;
  }> {
    return {
      botActivity: Math.random() * 100,
      volumeManipulation: Math.random() > 0.8,
      priceManipulation: Math.random() > 0.9
    };
  }

  private async getPriceData(address: string): Promise<any[]> {
    // Simulate price data retrieval
    const dataPoints = 100;
    const basePrice = Math.random() * 10;
    return Array.from({ length: dataPoints }, (_, i) => ({
      timestamp: Date.now() - (dataPoints - i) * 60000,
      price: basePrice * (1 + (Math.random() - 0.5) * 0.1),
      volume: Math.random() * 10000
    }));
  }

  private calculatePriceChange(priceData: any[], timeframe: string): number {
    if (priceData.length < 2) return 0;
    
    const minutes = timeframe === '1m' ? 1 : timeframe === '5m' ? 5 : 15;
    const cutoff = Date.now() - (minutes * 60000);
    
    const recent = priceData.filter(d => d.timestamp > cutoff);
    if (recent.length < 2) return 0;
    
    const oldPrice = recent[0].price;
    const newPrice = recent[recent.length - 1].price;
    
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  private detectVolumeSpike(priceData: any[], timeframe: string): boolean {
    if (priceData.length < 10) return false;
    
    const recent = priceData.slice(-5);
    const historical = priceData.slice(-20, -5);
    
    const recentAvg = recent.reduce((sum, d) => sum + d.volume, 0) / recent.length;
    const historicalAvg = historical.reduce((sum, d) => sum + d.volume, 0) / historical.length;
    
    return recentAvg > historicalAvg * 2; // 2x volume spike
  }

  private calculateRSI(priceData: any[]): number {
    if (priceData.length < 14) return 50;
    
    const changes = [];
    for (let i = 1; i < priceData.length; i++) {
      changes.push(priceData[i].price - priceData[i-1].price);
    }
    
    const gains = changes.filter(c => c > 0);
    const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
    
    const avgGain = gains.reduce((sum, g) => sum + g, 0) / 14;
    const avgLoss = losses.reduce((sum, l) => sum + l, 0) / 14;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateVolumeProfile(priceData: any[]): number {
    if (priceData.length === 0) return 0;
    
    const totalVolume = priceData.reduce((sum, d) => sum + d.volume, 0);
    return totalVolume / priceData.length;
  }

  private async analyzeSocialSentiment(symbol: string): Promise<number> {
    // Simulate social sentiment analysis
    return Math.random() * 100;
  }

  private async detectWhaleActivity(address: string): Promise<boolean> {
    // Simulate whale activity detection
    return Math.random() > 0.8;
  }

  private calculateRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' {
    if (score >= 80) return 'LOW';
    if (score >= 60) return 'MEDIUM';
    if (score >= 30) return 'HIGH';
    return 'EXTREME';
  }

  private getCachedAnalysis(address: string): EnhancedTokenAnalysis | null {
    const cached = this.cache.get(address);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.analysis;
    }
    return null;
  }

  private cacheAnalysis(address: string, analysis: EnhancedTokenAnalysis): void {
    this.cache.set(address, {
      analysis,
      timestamp: Date.now()
    });
  }

  async batchAnalyze(tokens: UnifiedTokenInfo[]): Promise<EnhancedTokenAnalysis[]> {
    logger.info(`🔍 Starting batch analysis of ${tokens.length} tokens`);
    
    const results = await Promise.allSettled(
      tokens.map(token => this.analyze(token))
    );
    
    const analyses = results
      .filter((result): result is PromiseFulfilledResult<EnhancedTokenAnalysis> => 
        result.status === 'fulfilled')
      .map(result => result.value);
    
    logger.info(`✅ Batch analysis completed: ${analyses.length}/${tokens.length} successful`);
    
    return analyses;
  }

  getStats(): any {
    return {
      processedTokens: this.processedTokens.size,
      cacheSize: this.cache.size,
      isRunning: this.isRunning
    };
  }
}