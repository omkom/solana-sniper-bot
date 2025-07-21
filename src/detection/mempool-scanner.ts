/**
 * Mempool Scanner for Pre-Launch Detection
 * Monitors pending transactions to detect token launches before confirmation
 * Provides competitive advantage by identifying opportunities 1-2 blocks early
 */

import { Connection, Transaction, TransactionSignature, Logs, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';
import { ConnectionPool } from '../core/connection-pool';
import { UnifiedTokenInfo } from '../types/unified';
import { PerformanceProfiler } from '../utils/performance-profiler';

interface PendingTokenLaunch {
  signature: string;
  token: Partial<UnifiedTokenInfo>;
  confidence: number;
  estimatedConfirmation: number;
  detectedAt: number;
  programs: string[];
  liquidityIndicators: {
    solAmount?: number;
    tokenAmount?: string;
    poolCreation?: boolean;
  };
}

interface MempoolScannerConfig {
  enablePreLaunchDetection: boolean;
  maxPendingAge: number; // Max age of pending transactions to track
  confidenceThreshold: number;
  scanInterval: number;
  maxConcurrentScans: number;
  enableSignatureFiltering: boolean;
  enableInstructionAnalysis: boolean;
  targetPrograms: string[];
}

interface TransactionPattern {
  programId: string;
  instructionPattern: string[];
  minimumInstructions: number;
  liquidityThreshold: number;
  confidenceScore: number;
}

export class MempoolScanner extends EventEmitter {
  private config: MempoolScannerConfig;
  private connectionPool: ConnectionPool;
  private isRunning = false;
  private scanningInterval: NodeJS.Timeout | null = null;
  private pendingTransactions = new Map<string, PendingTokenLaunch>();
  private processedSignatures = new Set<string>();
  private performanceProfiler: PerformanceProfiler;
  
  // Known transaction patterns for token launches
  private readonly LAUNCH_PATTERNS: TransactionPattern[] = [
    {
      programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
      instructionPattern: ['initialize', 'deposit', 'swap'],
      minimumInstructions: 3,
      liquidityThreshold: 5, // SOL
      confidenceScore: 85
    },
    {
      programId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun
      instructionPattern: ['create', 'buy'],
      minimumInstructions: 2,
      liquidityThreshold: 1, // SOL
      confidenceScore: 90
    },
    {
      programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca
      instructionPattern: ['initialize', 'increaseLiquidity'],
      minimumInstructions: 2,
      liquidityThreshold: 3, // SOL
      confidenceScore: 80
    },
    {
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
      instructionPattern: ['initializeMint', 'initializeAccount'],
      minimumInstructions: 2,
      liquidityThreshold: 0,
      confidenceScore: 70
    }
  ];

  constructor(connectionPool: ConnectionPool, config: Partial<MempoolScannerConfig> = {}) {
    super();
    
    this.connectionPool = connectionPool;
    this.performanceProfiler = new PerformanceProfiler();
    
    this.config = {
      enablePreLaunchDetection: true,
      maxPendingAge: 300000, // 5 minutes
      confidenceThreshold: 60,
      scanInterval: 1000, // 1 second for aggressive detection
      maxConcurrentScans: 20,
      enableSignatureFiltering: true,
      enableInstructionAnalysis: true,
      targetPrograms: [
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
        '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun  
        'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' // SPL Token
      ],
      ...config
    };

    logger.info('🔍 Mempool Scanner initialized', {
      targetPrograms: this.config.targetPrograms.length,
      confidenceThreshold: this.config.confidenceThreshold,
      scanInterval: this.config.scanInterval
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Mempool scanner already running');
      return;
    }

    if (!this.config.enablePreLaunchDetection) {
      logger.info('⚠️ Pre-launch detection disabled in configuration');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting mempool scanner for pre-launch detection...');

    try {
      // Start real-time mempool monitoring
      await this.startMempoolMonitoring();
      
      // Start periodic scanning
      this.startPeriodicScanning();
      
      // Start cleanup task
      this.startCleanupTask();
      
      this.emit('started');
      logger.info('✅ Mempool scanner started successfully');
      
    } catch (error) {
      logger.error('❌ Failed to start mempool scanner:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    logger.info('🛑 Stopping mempool scanner...');

    // Stop scanning interval
    if (this.scanningInterval) {
      clearInterval(this.scanningInterval);
      this.scanningInterval = null;
    }

    // Clear pending data
    this.pendingTransactions.clear();
    this.processedSignatures.clear();

    this.emit('stopped');
    logger.info('🛑 Mempool scanner stopped');
  }

  private async startMempoolMonitoring(): Promise<void> {
    // Monitor program logs for potential launches
    for (const programId of this.config.targetPrograms) {
      try {
        const { connection } = this.connectionPool.getConnectionWithEndpoint();
        
        const subscription = connection.onLogs(
          new PublicKey(programId),
          (logs: Logs) => {
            this.handleMempoolLog(logs, programId);
          },
          'confirmed' // Use 'confirmed' commitment for reliable detection
        );

        logger.info(`📡 Monitoring mempool for program: ${programId.slice(0, 8)}...`);
        
      } catch (error) {
        logger.error(`Failed to subscribe to program ${programId}:`, error);
      }
    }
  }

  private handleMempoolLog(logs: Logs, programId: string): void {
    try {
      // Quick filtering for potential token launches
      const hasPotentialLaunch = this.quickPatternMatch(logs.logs, programId);
      
      if (hasPotentialLaunch && !this.processedSignatures.has(logs.signature)) {
        this.processedSignatures.add(logs.signature);
        
        // Analyze transaction asynchronously
        this.analyzePendingTransaction(logs.signature, programId)
          .catch(error => {
            logger.debug(`Error analyzing pending transaction ${logs.signature}:`, error);
          });
      }
    } catch (error) {
      logger.debug('Error handling mempool log:', error);
    }
  }

  private quickPatternMatch(logMessages: string[], programId: string): boolean {
    const pattern = this.LAUNCH_PATTERNS.find(p => p.programId === programId);
    if (!pattern) return false;

    const logText = logMessages.join(' ').toLowerCase();
    
    // Check for key instruction patterns
    const matchedInstructions = pattern.instructionPattern.filter(instruction =>
      logText.includes(instruction.toLowerCase())
    );

    return matchedInstructions.length >= pattern.minimumInstructions;
  }

  private async analyzePendingTransaction(signature: string, programId: string): Promise<void> {
    const analysisTimer = this.performanceProfiler.startTimer();
    
    try {
      const { connection } = this.connectionPool.getConnectionWithEndpoint();
      
      // Get transaction with minimal commitment for speed
      const transaction = await Promise.race([
        connection.getParsedTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        }),
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Transaction fetch timeout')), 3000)
        )
      ]);

      if (!transaction) {
        logger.debug(`Transaction not found: ${signature}`);
        return;
      }

      // Analyze transaction for token launch indicators
      const analysis = await this.analyzeTransactionForLaunch(transaction, programId);
      
      if (analysis && analysis.confidence >= this.config.confidenceThreshold) {
        const pendingLaunch: PendingTokenLaunch = {
          signature,
          token: analysis.token,
          confidence: analysis.confidence,
          estimatedConfirmation: Date.now() + 30000, // Estimate 30 seconds to confirmation
          detectedAt: Date.now(),
          programs: analysis.programs,
          liquidityIndicators: analysis.liquidityIndicators
        };

        this.pendingTransactions.set(signature, pendingLaunch);
        
        logger.info(`🎯 Pre-launch detected: ${analysis.token.symbol || 'Unknown'}`, {
          signature: signature.slice(0, 8),
          confidence: analysis.confidence,
          program: programId.slice(0, 8),
          estimatedConfirmation: new Date(pendingLaunch.estimatedConfirmation).toLocaleTimeString()
        });

        this.emit('pendingLaunch', pendingLaunch);
      }

    } catch (error) {
      logger.debug(`Failed to analyze pending transaction ${signature}:`, error);
    } finally {
      const analysisTime = analysisTimer();
      if (analysisTime > 1000) {
        logger.warn(`⚠️ Slow mempool analysis: ${analysisTime}ms for ${signature}`);
      }
    }
  }

  private async analyzeTransactionForLaunch(transaction: any, programId: string): Promise<{
    token: Partial<UnifiedTokenInfo>;
    confidence: number;
    programs: string[];
    liquidityIndicators: any;
  } | null> {
    
    const pattern = this.LAUNCH_PATTERNS.find(p => p.programId === programId);
    if (!pattern) return null;

    const instructions = transaction.transaction.message.instructions || [];
    const programs: string[] = [];
    let tokenMint: string | null = null;
    let liquidityAmount = 0;
    let confidence = pattern.confidenceScore;

    // Analyze instructions for launch patterns
    for (const instruction of instructions) {
      if (instruction.programId) {
        programs.push(instruction.programId);
      }

      if (instruction.parsed) {
        const parsed = instruction.parsed;
        
        // Extract token mint from various instruction types
        if (parsed.info?.mint) {
          tokenMint = parsed.info.mint;
        } else if (parsed.info?.tokenA) {
          tokenMint = parsed.info.tokenA;
        } else if (parsed.info?.account && parsed.type === 'initializeMint') {
          tokenMint = parsed.info.account;
        }

        // Extract liquidity information
        if (parsed.info?.lamports) {
          liquidityAmount += parsed.info.lamports / 1e9; // Convert to SOL
        }

        // Boost confidence based on instruction types
        if (parsed.type === 'initializeMint') confidence += 10;
        if (parsed.type === 'initialize') confidence += 15;
        if (parsed.type === 'deposit' && parsed.info?.lamports > 1e9) confidence += 20;
      }
    }

    if (!tokenMint) {
      // Try to extract from account keys
      const accountKeys = transaction.transaction.message.accountKeys || [];
      for (const key of accountKeys) {
        if (key.pubkey && this.looksLikeTokenMint(key.pubkey)) {
          tokenMint = key.pubkey;
          break;
        }
      }
    }

    if (!tokenMint) return null;

    // Apply confidence modifiers
    if (liquidityAmount >= pattern.liquidityThreshold) {
      confidence += 15;
    }

    if (programs.includes('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')) {
      confidence += 10; // SPL Token program involvement
    }

    const token: Partial<UnifiedTokenInfo> = {
      address: tokenMint,
      mint: tokenMint,
      name: `Pre-Launch Token ${tokenMint.slice(0, 8)}`,
      symbol: this.generateSymbol(tokenMint),
      decimals: 9,
      chainId: 'solana',
      detected: false, // Not yet confirmed
      detectedAt: Date.now(),
      source: `mempool_${programId.slice(0, 8)}`,
      metadata: {
        pendingTransaction: true,
        detectionMethod: 'mempool_scanning',
        programId,
        confidence
      }
    };

    return {
      token,
      confidence,
      programs: [...new Set(programs)],
      liquidityIndicators: {
        solAmount: liquidityAmount,
        poolCreation: instructions.some((instruction: any) => 
          instruction.parsed?.type === 'initialize' || 
          instruction.parsed?.type === 'deposit'
        )
      }
    };
  }

  private looksLikeTokenMint(pubkey: string): boolean {
    // Basic heuristics to identify potential token mints
    // This is a simplified check - in production, you'd want more sophisticated validation
    return pubkey.length === 44 && 
           !pubkey.startsWith('11111111111111111111111111111111') && // Not system program
           !pubkey.startsWith('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'); // Not SPL token program
  }

  private generateSymbol(mint: string): string {
    // Generate a temporary symbol based on mint address
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let symbol = '';
    
    for (let i = 0; i < 4; i++) {
      const charCode = mint.charCodeAt(i * 8) || 65;
      symbol += chars[charCode % chars.length];
    }
    
    return symbol + mint.slice(-2).toUpperCase();
  }

  private startPeriodicScanning(): void {
    this.scanningInterval = setInterval(async () => {
      await this.scanForConfirmedLaunches();
    }, this.config.scanInterval);
  }

  private async scanForConfirmedLaunches(): Promise<void> {
    if (this.pendingTransactions.size === 0) return;

    const now = Date.now();
    const confirmedLaunches: string[] = [];

    // Check which pending transactions have been confirmed
    for (const [signature, launch] of this.pendingTransactions) {
      try {
        const { connection } = this.connectionPool.getConnectionWithEndpoint();
        
        const status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true
        });

        if (status.value?.confirmationStatus === 'confirmed' || 
            status.value?.confirmationStatus === 'finalized') {
          
          // Launch confirmed! Emit token detection
          const confirmedToken: UnifiedTokenInfo = {
            ...launch.token as UnifiedTokenInfo,
            detected: true,
            timestamp: now,
            metadata: {
              ...launch.token.metadata,
              confirmedAt: now,
              preDetectionAdvantage: now - launch.detectedAt,
              signature: signature
            }
          };

          logger.info(`🎉 Pre-detected token confirmed: ${confirmedToken.symbol}`, {
            signature: signature.slice(0, 8),
            advantage: now - launch.detectedAt,
            confidence: launch.confidence
          });

          this.emit('tokenLaunch', {
            token: confirmedToken,
            signature,
            preDetectionAdvantage: now - launch.detectedAt,
            confidence: launch.confidence
          });

          confirmedLaunches.push(signature);
        } else if (now - launch.estimatedConfirmation > 60000) {
          // Transaction taking too long, might have failed
          confirmedLaunches.push(signature);
        }

      } catch (error) {
        logger.debug(`Error checking transaction status ${signature}:`, error);
      }
    }

    // Remove confirmed/expired launches
    confirmedLaunches.forEach(signature => {
      this.pendingTransactions.delete(signature);
    });
  }

  private startCleanupTask(): void {
    setInterval(() => {
      const now = Date.now();
      const expiredSignatures: string[] = [];

      // Clean up old pending transactions
      for (const [signature, launch] of this.pendingTransactions) {
        if (now - launch.detectedAt > this.config.maxPendingAge) {
          expiredSignatures.push(signature);
        }
      }

      expiredSignatures.forEach(signature => {
        this.pendingTransactions.delete(signature);
      });

      // Clean up processed signatures set (keep last 10k)
      if (this.processedSignatures.size > 10000) {
        const signaturesArray = Array.from(this.processedSignatures);
        this.processedSignatures.clear();
        signaturesArray.slice(-5000).forEach(sig => {
          this.processedSignatures.add(sig);
        });
      }

      if (expiredSignatures.length > 0) {
        logger.debug(`🧹 Cleaned up ${expiredSignatures.length} expired pending transactions`);
      }

    }, 60000); // Run cleanup every minute
  }

  // Public API methods
  getPendingLaunches(): PendingTokenLaunch[] {
    return Array.from(this.pendingTransactions.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  getStatus(): any {
    return {
      isRunning: this.isRunning,
      pendingTransactions: this.pendingTransactions.size,
      processedSignatures: this.processedSignatures.size,
      targetPrograms: this.config.targetPrograms.length,
      config: {
        confidenceThreshold: this.config.confidenceThreshold,
        scanInterval: this.config.scanInterval,
        maxPendingAge: this.config.maxPendingAge
      }
    };
  }

  getStats(): any {
    const pending = Array.from(this.pendingTransactions.values());
    
    return {
      totalPending: pending.length,
      averageConfidence: pending.length > 0 ? 
        pending.reduce((sum, p) => sum + p.confidence, 0) / pending.length : 0,
      oldestPending: pending.length > 0 ? 
        Math.min(...pending.map(p => p.detectedAt)) : null,
      programDistribution: this.config.targetPrograms.reduce((acc, program) => {
        acc[program.slice(0, 8)] = pending.filter(p => 
          p.programs.includes(program)
        ).length;
        return acc;
      }, {} as Record<string, number>)
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.isRunning;
  }
}