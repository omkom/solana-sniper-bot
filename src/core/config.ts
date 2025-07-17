import dotenv from 'dotenv';
import { AnalysisConfig } from '../types';

dotenv.config();

export class Config {
  private static instance: Config;
  private config: AnalysisConfig;

  private constructor() {
    // Enforce DRY_RUN mode for educational purposes
    if (process.env.MODE !== 'DRY_RUN') {
      throw new Error('This educational system only supports DRY_RUN mode');
    }

    this.config = {
      mode: 'DRY_RUN',
      minLiquiditySol: parseFloat(process.env.MIN_LIQUIDITY_SOL || '1'),
      minConfidenceScore: parseInt(process.env.MIN_CONFIDENCE_SCORE || '70'),
      maxAnalysisAge: parseInt(process.env.MAX_ANALYSIS_AGE_MS || '30000'),
      simulatedInvestment: parseFloat(process.env.SIMULATED_INVESTMENT || '0.03'),
      maxSimulatedPositions: parseInt(process.env.MAX_SIMULATED_POSITIONS || '25')
    };

    console.log('🎓 Educational Token Analyzer initialized in DRY_RUN mode');
    console.log('📚 This system is for learning and analysis purposes only');
  }

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  getConfig(): AnalysisConfig {
    return { ...this.config };
  }

  getRPCEndpoint(): string {
    return process.env.RPC_PRIMARY || 'https://api.mainnet-beta.solana.com';
  }

  getFallbackRPC(): string {
    return process.env.RPC_FALLBACK || 'https://api.mainnet-beta.solana.com';
  }

  getDashboardPort(): number {
    return parseInt(process.env.DASHBOARD_PORT || '3000');
  }

  getLogLevel(): string {
    return process.env.LOG_LEVEL || 'info';
  }
}