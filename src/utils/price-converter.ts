import axios from 'axios';
import { logger } from '../monitoring/logger';

export class PriceConverter {
  private solToEurRate: number = 147.79; // Fallback rate
  private lastUpdateTime: number = 0;
  private updateInterval: number = 300000; // 5 minutes
  private cache = new Map<string, { rate: number; timestamp: number }>();

  constructor() {
    console.log('💱 Price Converter initialized with fallback SOL rate: €147.79');
    this.updateSolPrice(); // Initial update
  }

  async updateSolPrice(): Promise<void> {
    const now = Date.now();
    
    // Check if we need to update (every 5 minutes)
    if (now - this.lastUpdateTime < this.updateInterval) {
      return;
    }

    try {
      // Try multiple APIs for SOL price in EUR
      const price = await this.fetchSolPriceEUR();
      
      if (price && price > 0) {
        this.solToEurRate = price;
        this.lastUpdateTime = now;
        
        console.log(`💱 Updated SOL price: €${price.toFixed(2)} EUR`);
        logger.info('SOL price updated', { 
          priceEUR: price,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.warn('Failed to update SOL price, using fallback', {
        fallbackRate: this.solToEurRate,
        error: error instanceof Error ? error.message : String(error)
      });
      console.log(`⚠️ Using fallback SOL rate: €${this.solToEurRate} EUR`);
    }
  }

  private async fetchSolPriceEUR(): Promise<number | null> {
    // Try CoinGecko first
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=eur',
        { timeout: 5000 }
      );
      
      if (response.data?.solana?.eur) {
        return response.data.solana.eur;
      }
    } catch (error) {
      console.log('📡 CoinGecko API unavailable, trying backup...');
    }

    // Try CryptoCompare as backup
    try {
      const response = await axios.get(
        'https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=EUR',
        { timeout: 5000 }
      );
      
      if (response.data?.EUR) {
        return response.data.EUR;
      }
    } catch (error) {
      console.log('📡 CryptoCompare API unavailable');
    }

    // If both fail, keep current rate
    return null;
  }

  // Convert SOL to EUR
  solToEur(solAmount: number): number {
    return solAmount * this.solToEurRate;
  }

  // Convert EUR to SOL
  eurToSol(eurAmount: number): number {
    return eurAmount / this.solToEurRate;
  }

  // Convert USD to EUR (approximate)
  usdToEur(usdAmount: number, usdToEurRate: number = 0.92): number {
    return usdAmount * usdToEurRate;
  }

  // Get current SOL rate
  getSolRate(): number {
    return this.solToEurRate;
  }

  // Format SOL amount with EUR equivalent
  formatSolWithEur(solAmount: number): string {
    const eurAmount = this.solToEur(solAmount);
    return `${solAmount.toFixed(4)} SOL (€${eurAmount.toFixed(2)})`;
  }

  // Format EUR amount with SOL equivalent
  formatEurWithSol(eurAmount: number): string {
    const solAmount = this.eurToSol(eurAmount);
    return `€${eurAmount.toFixed(2)} (${solAmount.toFixed(4)} SOL)`;
  }

  // Format portfolio value in both currencies
  formatPortfolioValue(solAmount: number): {
    sol: string;
    eur: string;
    combined: string;
  } {
    const eurAmount = this.solToEur(solAmount);
    
    return {
      sol: `${solAmount.toFixed(4)} SOL`,
      eur: `€${eurAmount.toFixed(2)} EUR`,
      combined: `${solAmount.toFixed(4)} SOL (€${eurAmount.toFixed(2)})`
    };
  }

  // Get price info for display
  getPriceInfo(): {
    solToEur: number;
    lastUpdate: string;
    updateAge: string;
  } {
    const ageMinutes = Math.round((Date.now() - this.lastUpdateTime) / 60000);
    
    return {
      solToEur: this.solToEurRate,
      lastUpdate: new Date(this.lastUpdateTime).toLocaleString(),
      updateAge: ageMinutes < 1 ? 'Just now' : `${ageMinutes} minutes ago`
    };
  }

  // Auto-update price periodically
  startAutoUpdate(): void {
    setInterval(async () => {
      await this.updateSolPrice();
    }, this.updateInterval);
    
    console.log('💱 Auto price update started (every 5 minutes)');
  }

  // Force price update
  async forceUpdate(): Promise<boolean> {
    this.lastUpdateTime = 0; // Reset to force update
    await this.updateSolPrice();
    return this.lastUpdateTime > 0;
  }

  // Calculate ROI in both currencies
  calculateROI(initialSol: number, currentSol: number): {
    roiPercent: number;
    profitLossSol: number;
    profitLossEur: number;
    formatStr: string;
  } {
    const roiPercent = ((currentSol - initialSol) / initialSol) * 100;
    const profitLossSol = currentSol - initialSol;
    const profitLossEur = this.solToEur(profitLossSol);
    
    const sign = profitLossSol >= 0 ? '+' : '';
    const formatStr = `${roiPercent.toFixed(2)}% (${sign}${profitLossSol.toFixed(4)} SOL / ${sign}€${profitLossEur.toFixed(2)})`;
    
    return {
      roiPercent,
      profitLossSol,
      profitLossEur,
      formatStr
    };
  }

  // Convert token prices to EUR
  tokenPriceInEur(tokenPriceUsd: number, usdToEurRate: number = 0.92): {
    priceEur: number;
    priceSol: number;
    formatStr: string;
  } {
    const priceEur = tokenPriceUsd * usdToEurRate;
    const priceSol = tokenPriceUsd / (this.solToEurRate / usdToEurRate);
    
    return {
      priceEur,
      priceSol,
      formatStr: `$${tokenPriceUsd.toFixed(6)} (€${priceEur.toFixed(6)} / ${priceSol.toFixed(8)} SOL)`
    };
  }

  // Get market cap in EUR
  marketCapInEur(marketCapUsd: number, usdToEurRate: number = 0.92): string {
    const marketCapEur = marketCapUsd * usdToEurRate;
    
    if (marketCapEur >= 1000000) {
      return `€${(marketCapEur / 1000000).toFixed(2)}M`;
    } else if (marketCapEur >= 1000) {
      return `€${(marketCapEur / 1000).toFixed(1)}K`;
    } else {
      return `€${marketCapEur.toFixed(0)}`;
    }
  }

  // Get volume in EUR
  volumeInEur(volumeUsd: number, usdToEurRate: number = 0.92): string {
    const volumeEur = volumeUsd * usdToEurRate;
    
    if (volumeEur >= 1000000) {
      return `€${(volumeEur / 1000000).toFixed(2)}M`;
    } else if (volumeEur >= 1000) {
      return `€${(volumeEur / 1000).toFixed(1)}K`;
    } else {
      return `€${volumeEur.toFixed(0)}`;
    }
  }
}