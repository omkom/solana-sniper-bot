import { EventEmitter } from 'events';
import { logger } from '../monitoring/logger';

export interface PriceData {
  address: string;
  symbol: string;
  price: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  timestamp: number;
}

export interface PriceAlert {
  id: string;
  address: string;
  type: 'price_above' | 'price_below' | 'price_change';
  threshold: number;
  active: boolean;
  triggered: boolean;
  createdAt: number;
}

export class SimplePriceTracker extends EventEmitter {
  private priceData: Map<string, PriceData> = new Map();
  private alerts: Map<string, PriceAlert> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  private readonly UPDATE_INTERVAL = 30000; // 30 seconds
  private readonly MAX_TRACKED_TOKENS = 100;
  
  constructor() {
    super();
    logger.info('📊 Simple Price Tracker initialized');
  }

  start(): void {
    if (this.isRunning) {
      logger.warn('Price tracker already running');
      return;
    }

    this.isRunning = true;
    this.startPriceUpdates();
    logger.info('✅ Simple Price Tracker started');
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    logger.info('⏹️ Simple Price Tracker stopped');
  }

  addToken(address: string, symbol: string): void {
    if (this.priceData.has(address)) {
      logger.debug(`Token ${symbol} already tracked`);
      return;
    }

    // Check capacity
    if (this.priceData.size >= this.MAX_TRACKED_TOKENS) {
      this.removeOldestToken();
    }

    const priceData: PriceData = {
      address,
      symbol,
      price: 0,
      liquidity: 0,
      volume24h: 0,
      priceChange24h: 0,
      timestamp: Date.now()
    };

    this.priceData.set(address, priceData);
    logger.info(`📊 Added token to price tracking: ${symbol}`);
    this.emit('tokenAdded', priceData);

    // Immediately update price
    this.updateTokenPrice(address);
  }

  removeToken(address: string): void {
    const data = this.priceData.get(address);
    if (data) {
      this.priceData.delete(address);
      
      // Remove related alerts
      this.alerts.forEach((alert, alertId) => {
        if (alert.address === address) {
          this.alerts.delete(alertId);
        }
      });
      
      logger.info(`🗑️ Removed token from price tracking: ${data.symbol}`);
      this.emit('tokenRemoved', data);
    }
  }

  getPrice(address: string): PriceData | undefined {
    return this.priceData.get(address);
  }

  getAllPrices(): PriceData[] {
    return Array.from(this.priceData.values());
  }

  addAlert(address: string, type: 'price_above' | 'price_below' | 'price_change', threshold: number): string {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const alert: PriceAlert = {
      id: alertId,
      address,
      type,
      threshold,
      active: true,
      triggered: false,
      createdAt: Date.now()
    };

    this.alerts.set(alertId, alert);
    logger.info(`🚨 Added price alert: ${type} ${threshold} for ${address}`);
    
    return alertId;
  }

  removeAlert(alertId: string): void {
    if (this.alerts.delete(alertId)) {
      logger.info(`🗑️ Removed price alert: ${alertId}`);
    }
  }

  private startPriceUpdates(): void {
    this.updateInterval = setInterval(async () => {
      await this.updateAllPrices();
    }, this.UPDATE_INTERVAL);

    // Initial update
    this.updateAllPrices();
  }

  private async updateAllPrices(): Promise<void> {
    if (this.priceData.size === 0) {
      return;
    }

    const startTime = Date.now();
    const promises: Promise<void>[] = [];

    // Update all tokens in parallel
    this.priceData.forEach((data, address) => {
      promises.push(this.updateTokenPrice(address));
    });

    try {
      await Promise.allSettled(promises);
      
      const updateTime = Date.now() - startTime;
      logger.debug(`📊 Updated ${this.priceData.size} prices in ${updateTime}ms`);
      
      // Check alerts after price updates
      this.checkAlerts();

    } catch (error) {
      logger.error('Error updating prices:', error);
    }
  }

  private async updateTokenPrice(address: string): Promise<void> {
    const data = this.priceData.get(address);
    if (!data) {
      return;
    }

    try {
      // Mock price update - replace with actual API call
      const newPrice = await this.fetchPrice(address);
      
      if (newPrice) {
        const oldPrice = data.price;
        
        data.price = newPrice.price;
        data.liquidity = newPrice.liquidity;
        data.volume24h = newPrice.volume24h;
        data.priceChange24h = newPrice.priceChange24h;
        data.timestamp = Date.now();

        // Emit price update event
        this.emit('priceUpdate', {
          address,
          symbol: data.symbol,
          price: data.price,
          priceChange: data.price - oldPrice,
          liquidity: data.liquidity,
          volume24h: data.volume24h,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      logger.error(`Error updating price for ${data.symbol}:`, error);
    }
  }

  private async fetchPrice(address: string): Promise<any> {
    // Mock implementation - replace with actual API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          price: Math.random() * 0.001,
          liquidity: Math.random() * 50000 + 1000,
          volume24h: Math.random() * 10000,
          priceChange24h: (Math.random() - 0.5) * 50
        });
      }, 100);
    });
  }

  private checkAlerts(): void {
    this.alerts.forEach((alert, alertId) => {
      if (!alert.active || alert.triggered) {
        return;
      }

      const priceData = this.priceData.get(alert.address);
      if (!priceData) {
        return;
      }

      let shouldTrigger = false;
      let message = '';

      switch (alert.type) {
        case 'price_above':
          if (priceData.price >= alert.threshold) {
            shouldTrigger = true;
            message = `Price reached $${priceData.price.toFixed(8)} (above $${alert.threshold.toFixed(8)})`;
          }
          break;
          
        case 'price_below':
          if (priceData.price <= alert.threshold) {
            shouldTrigger = true;
            message = `Price dropped to $${priceData.price.toFixed(8)} (below $${alert.threshold.toFixed(8)})`;
          }
          break;
          
        case 'price_change':
          if (Math.abs(priceData.priceChange24h) >= alert.threshold) {
            shouldTrigger = true;
            message = `Price changed ${priceData.priceChange24h.toFixed(2)}% (threshold: ${alert.threshold}%)`;
          }
          break;
      }

      if (shouldTrigger) {
        alert.triggered = true;
        
        logger.warn(`🚨 Price alert triggered: ${message} for ${priceData.symbol}`);
        
        this.emit('alertTriggered', {
          alert,
          priceData,
          message,
          timestamp: Date.now()
        });
      }
    });
  }

  private removeOldestToken(): void {
    let oldestData: PriceData | null = null;
    let oldestAddress = '';

    for (const [address, data] of Array.from(this.priceData.entries())) {
      if (!oldestData || data.timestamp < oldestData.timestamp) {
        oldestData = data;
        oldestAddress = address;
      }
    }

    if (oldestData) {
      this.removeToken(oldestAddress);
    }
  }

  getStats(): any {
    return {
      isRunning: this.isRunning,
      trackedTokens: this.priceData.size,
      activeAlerts: Array.from(this.alerts.values()).filter(a => a.active && !a.triggered).length,
      triggeredAlerts: Array.from(this.alerts.values()).filter(a => a.triggered).length,
      totalAlerts: this.alerts.size,
      updateInterval: this.UPDATE_INTERVAL,
      maxTrackedTokens: this.MAX_TRACKED_TOKENS
    };
  }

  isHealthy(): boolean {
    return this.isRunning && this.priceData.size <= this.MAX_TRACKED_TOKENS;
  }
}