/**
 * Creator Intelligence System
 * Tracks creator wallets, rugpull patterns, and social verification
 * Educational analysis only - no real targeting
 */

import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { 
  CreatorIntelligence, 
  CreatorProfile, 
  RugpullEvent, 
  CreatorFlag, 
  CreatorDatabase, 
  CreatorAlert,
  UnifiedTokenInfo 
} from '../types/unified';

interface CreatorIntelligenceConfig {
  trackingEnabled: boolean;
  databaseRetention: number; // days
  rugpullDetectionEnabled: boolean;
  socialMediaVerification: boolean;
  maxCreatorsTracked: number;
  alertingEnabled: boolean;
}

export class CreatorIntelligenceSystem extends EventEmitter {
  private config: CreatorIntelligenceConfig;
  private database: CreatorDatabase;
  private isRunning = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CreatorIntelligenceConfig> = {}) {
    super();
    
    this.config = {
      trackingEnabled: true,
      databaseRetention: 30, // 30 days
      rugpullDetectionEnabled: true,
      socialMediaVerification: true,
      maxCreatorsTracked: 10000,
      alertingEnabled: true,
      ...config
    };

    this.database = {
      creators: new Map(),
      rugpullEvents: new Map(),
      verifiedCreators: new Set(),
      flaggedCreators: new Set(),
      stats: {
        totalCreators: 0,
        verifiedCount: 0,
        flaggedCount: 0,
        rugpullCount: 0
      }
    };

    logger.info('🧠 Creator Intelligence System initialized', {
      trackingEnabled: this.config.trackingEnabled,
      educationalMode: true
    });
  }

  async start(): Promise<void> {
    if (this.isRunning || !this.config.trackingEnabled) {
      return;
    }

    this.isRunning = true;
    
    // Start cleanup task for data retention
    this.startCleanupTask();
    
    // Initialize with some educational demo data
    await this.initializeDemoData();
    
    this.emit('started');
    logger.info('✅ Creator Intelligence System started (Educational Mode)');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.emit('stopped');
    logger.info('🛑 Creator Intelligence System stopped');
  }

  /**
   * Track a token creator's wallet (Educational analysis only)
   */
  async trackCreatorWallet(tokenInfo: UnifiedTokenInfo, creatorWallet: string): Promise<CreatorIntelligence> {
    if (!this.config.trackingEnabled) {
      throw new Error('Creator tracking is disabled');
    }

    logger.debug(`🔍 Tracking creator wallet: ${creatorWallet.slice(0, 8)}...`);

    let creator = this.database.creators.get(creatorWallet);
    
    if (!creator) {
      creator = await this.createCreatorProfile(creatorWallet);
      this.database.creators.set(creatorWallet, creator);
      this.database.stats.totalCreators++;
    }

    // Update creator activity
    creator.historicalTokens++;
    creator.lastActivity = Date.now();

    // Analyze creator risk
    await this.analyzeCreatorRisk(creator, tokenInfo);

    // Educational logging
    logger.info(`📚 EDUCATIONAL: Creator profile updated`, {
      wallet: creatorWallet.slice(0, 8) + '...',
      totalTokens: creator.historicalTokens,
      riskMultiplier: creator.riskMultiplier,
      educational: true
    });

    this.emit('creatorTracked', { creator, token: tokenInfo });
    return creator;
  }

  /**
   * Get creator profile by wallet address
   */
  getCreatorProfile(walletAddress: string): CreatorProfile | null {
    const creator = this.database.creators.get(walletAddress);
    if (!creator) return null;

    return {
      ...creator,
      tokensCreated: [], // Would be populated from token database
      rugpullEvents: this.getCreatorRugpullEvents(walletAddress),
      performanceMetrics: this.calculatePerformanceMetrics(creator)
    };
  }

  /**
   * Detect potential rugpull event (Educational analysis)
   */
  async detectRugpullEvent(tokenInfo: UnifiedTokenInfo, creatorWallet: string, currentPrice: number): Promise<RugpullEvent | null> {
    if (!this.config.rugpullDetectionEnabled) return null;

    // Simulate rugpull detection logic for educational purposes
    const isRugpull = this.simulateRugpullDetection(tokenInfo, currentPrice);
    
    if (isRugpull) {
      const rugpullEvent: RugpullEvent = {
        id: `rugpull_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tokenAddress: tokenInfo.address,
        creatorWallet,
        rugpullType: this.determineRugpullType(tokenInfo),
        priceAtDump: currentPrice,
        maxPriceReached: (tokenInfo.metadata as any)?.maxPrice || currentPrice * 2,
        lossPercent: Math.random() * 90 + 10, // 10-100% loss simulation
        timestamp: Date.now(),
        evidence: this.generateRugpullEvidence(tokenInfo),
        affectedTraders: Math.floor(Math.random() * 1000) + 50
      };

      // Update creator with rugpull history
      const creator = this.database.creators.get(creatorWallet);
      if (creator) {
        creator.rugpullHistory.count++;
        creator.rugpullHistory.priceAtDump.push(currentPrice);
        creator.rugpullHistory.totalLost += rugpullEvent.lossPercent;
        creator.riskMultiplier = 0.7; // Flag as high risk
        
        // Add rugpull flag
        this.addCreatorFlag(creatorWallet, {
          type: 'RUGPULL_HISTORY',
          severity: 'CRITICAL',
          reason: 'Token rugpull detected',
          evidence: rugpullEvent.evidence,
          source: 'AUTOMATED'
        });
      }

      this.database.rugpullEvents.set(rugpullEvent.id, rugpullEvent);
      this.database.stats.rugpullCount++;

      // Educational logging - no real targeting
      logger.warn(`🚨 EDUCATIONAL: Rugpull pattern detected`, {
        token: tokenInfo.symbol,
        creator: creatorWallet.slice(0, 8) + '...',
        priceAtDump: currentPrice,
        educational: true,
        noRealTargeting: true
      });

      this.emit('rugpullDetected', rugpullEvent);
      return rugpullEvent;
    }

    return null;
  }

  /**
   * Flag creator for suspicious activity
   */
  async flagCreator(walletAddress: string, flag: Omit<CreatorFlag, 'flaggedAt'>): Promise<void> {
    const creator = this.database.creators.get(walletAddress);
    if (!creator) {
      throw new Error('Creator not found');
    }

    const fullFlag: CreatorFlag = {
      ...flag,
      flaggedAt: Date.now()
    };

    creator.flags.push(fullFlag);
    this.database.flaggedCreators.add(walletAddress);
    this.database.stats.flaggedCount++;

    // Adjust risk multiplier based on flag severity
    if (flag.severity === 'CRITICAL') {
      creator.riskMultiplier = 0.7;
    } else if (flag.severity === 'HIGH') {
      creator.riskMultiplier = 0.8;
    }

    logger.warn(`🚩 Creator flagged: ${walletAddress.slice(0, 8)}...`, {
      flagType: flag.type,
      severity: flag.severity,
      educational: true
    });

    this.emit('creatorFlagged', { walletAddress, flag: fullFlag });
  }

  /**
   * Verify creator social media (Educational simulation)
   */
  async verifySocialMedia(walletAddress: string): Promise<boolean> {
    if (!this.config.socialMediaVerification) return false;

    const creator = this.database.creators.get(walletAddress);
    if (!creator) return false;

    // Simulate social media verification for educational purposes
    const verificationResult = Math.random() > 0.6; // 40% verification rate

    if (verificationResult) {
      creator.socialMediaVerification.twitterVerified = Math.random() > 0.5;
      creator.socialMediaVerification.telegramActive = Math.random() > 0.4;
      creator.socialMediaVerification.websiteValid = Math.random() > 0.3;
      creator.socialMediaVerification.socialScore = Math.floor(Math.random() * 50) + 50; // 50-100

      if (creator.socialMediaVerification.twitterVerified && 
          creator.socialMediaVerification.socialScore > 80) {
        creator.riskMultiplier = 1.3; // Boost verified creators
        this.database.verifiedCreators.add(walletAddress);
        this.database.stats.verifiedCount++;

        this.addCreatorFlag(walletAddress, {
          type: 'VERIFIED',
          severity: 'LOW',
          reason: 'Social media verified',
          evidence: ['Twitter verified', 'High social score'],
          source: 'AUTOMATED'
        });
      }

      logger.info(`✅ Social media verification complete: ${walletAddress.slice(0, 8)}...`, {
        verified: verificationResult,
        socialScore: creator.socialMediaVerification.socialScore,
        educational: true
      });
    }

    return verificationResult;
  }

  /**
   * Get database statistics
   */
  getStats() {
    return {
      ...this.database.stats,
      topCreators: Array.from(this.database.creators.values())
        .sort((a, b) => b.historicalTokens - a.historicalTokens)
        .slice(0, 10)
        .map(c => ({
          wallet: c.walletAddress.slice(0, 8) + '...',
          tokens: c.historicalTokens,
          successRate: c.successRate,
          riskMultiplier: c.riskMultiplier
        })),
      recentRugpulls: Array.from(this.database.rugpullEvents.values())
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 5),
      config: this.config
    };
  }

  // Private methods

  private async createCreatorProfile(walletAddress: string): Promise<CreatorIntelligence> {
    return {
      walletAddress,
      historicalTokens: 0,
      rugpullHistory: {
        count: 0,
        priceAtDump: [],
        totalLost: 0
      },
      marketMakerActivity: {
        buyCount: 0,
        sellCount: 0,
        avgHoldTime: 0,
        totalVolume: 0
      },
      successRate: Math.random() * 100, // Initial random success rate for demo
      riskMultiplier: 1.0, // Neutral initially
      socialMediaVerification: {
        twitterVerified: false,
        telegramActive: false,
        websiteValid: false,
        socialScore: 0
      },
      flags: [],
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
  }

  private async analyzeCreatorRisk(creator: CreatorIntelligence, tokenInfo: UnifiedTokenInfo): Promise<void> {
    // Educational risk analysis simulation
    
    // Check for suspicious patterns
    if (creator.rugpullHistory.count > 2) {
      creator.riskMultiplier = 0.7; // High risk
      this.addCreatorFlag(creator.walletAddress, {
        type: 'RUGPULL_HISTORY',
        severity: 'HIGH',
        reason: 'Multiple rugpull events detected',
        evidence: [`${creator.rugpullHistory.count} rugpull events`],
        source: 'AUTOMATED'
      });
    }

    // Check token creation frequency (educational simulation)
    const recentTokens = creator.historicalTokens;
    if (recentTokens > 10) {
      this.addCreatorFlag(creator.walletAddress, {
        type: 'SUSPICIOUS_ACTIVITY',
        severity: 'MEDIUM',
        reason: 'High token creation frequency',
        evidence: [`Created ${recentTokens} tokens recently`],
        source: 'AUTOMATED'
      });
    }
  }

  private addCreatorFlag(walletAddress: string, flag: Omit<CreatorFlag, 'flaggedAt'>): void {
    const creator = this.database.creators.get(walletAddress);
    if (!creator) return;

    const fullFlag: CreatorFlag = {
      ...flag,
      flaggedAt: Date.now()
    };

    creator.flags.push(fullFlag);
  }

  private simulateRugpullDetection(tokenInfo: UnifiedTokenInfo, currentPrice: number): boolean {
    // Educational simulation - random rugpull detection
    const rugpullProbability = 0.05; // 5% chance for educational purposes
    return Math.random() < rugpullProbability;
  }

  private determineRugpullType(tokenInfo: UnifiedTokenInfo): RugpullEvent['rugpullType'] {
    const types: RugpullEvent['rugpullType'][] = [
      'LIQUIDITY_DRAIN', 
      'HONEYPOT', 
      'MINT_ATTACK', 
      'SOCIAL_EXIT'
    ];
    return types[Math.floor(Math.random() * types.length)];
  }

  private generateRugpullEvidence(tokenInfo: UnifiedTokenInfo): string[] {
    return [
      'Liquidity removed suddenly',
      'Large holder dump detected',
      'Social media accounts deleted',
      'Contract ownership not renounced'
    ];
  }

  private getCreatorRugpullEvents(walletAddress: string): RugpullEvent[] {
    return Array.from(this.database.rugpullEvents.values())
      .filter(event => event.creatorWallet === walletAddress);
  }

  private calculatePerformanceMetrics(creator: CreatorIntelligence) {
    return {
      avgTokenLifespan: Math.floor(Math.random() * 30 + 1), // 1-30 days
      avgMaxGain: Math.floor(Math.random() * 500 + 50),     // 50-550%
      rugpullFrequency: creator.rugpullHistory.count / Math.max(creator.historicalTokens, 1)
    };
  }

  private async initializeDemoData(): Promise<void> {
    // Create some educational demo creators
    const demoCreators = [
      { wallet: 'DEMO_VERIFIED_CREATOR_123', type: 'verified' },
      { wallet: 'DEMO_FLAGGED_CREATOR_456', type: 'flagged' },
      { wallet: 'DEMO_UNKNOWN_CREATOR_789', type: 'unknown' }
    ];

    for (const demo of demoCreators) {
      const creator = await this.createCreatorProfile(demo.wallet);
      
      if (demo.type === 'verified') {
        creator.riskMultiplier = 1.3;
        creator.socialMediaVerification.twitterVerified = true;
        creator.socialMediaVerification.socialScore = 90;
        this.database.verifiedCreators.add(demo.wallet);
      } else if (demo.type === 'flagged') {
        creator.riskMultiplier = 0.7;
        creator.rugpullHistory.count = 3;
        this.database.flaggedCreators.add(demo.wallet);
      }

      creator.historicalTokens = Math.floor(Math.random() * 10) + 1;
      this.database.creators.set(demo.wallet, creator);
    }

    this.database.stats.totalCreators = demoCreators.length;
    this.database.stats.verifiedCount = 1;
    this.database.stats.flaggedCount = 1;

    logger.info('📚 Educational demo creator data initialized');
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 3600000); // Clean every hour
  }

  private cleanupOldData(): void {
    const maxAge = this.config.databaseRetention * 24 * 60 * 60 * 1000; // Convert days to ms
    const cutoff = Date.now() - maxAge;
    
    let cleaned = 0;

    // Clean old creators
    for (const [wallet, creator] of this.database.creators) {
      if (creator.lastActivity < cutoff) {
        this.database.creators.delete(wallet);
        this.database.verifiedCreators.delete(wallet);
        this.database.flaggedCreators.delete(wallet);
        cleaned++;
      }
    }

    // Clean old rugpull events
    for (const [id, event] of this.database.rugpullEvents) {
      if (event.timestamp < cutoff) {
        this.database.rugpullEvents.delete(id);
      }
    }

    if (cleaned > 0) {
      logger.debug(`🧹 Cleaned up ${cleaned} old creator records`);
      this.updateStats();
    }
  }

  private updateStats(): void {
    this.database.stats = {
      totalCreators: this.database.creators.size,
      verifiedCount: this.database.verifiedCreators.size,
      flaggedCount: this.database.flaggedCreators.size,
      rugpullCount: this.database.rugpullEvents.size
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.isRunning && this.config.trackingEnabled;
  }
}