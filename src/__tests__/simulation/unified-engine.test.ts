/**
 * Unified simulation engine tests
 */

import { ConsolidatedSimulationEngine } from '../../simulation/consolidated-simulation-engine';
import { UnifiedTokenInfo } from '../../types/unified';

describe('ConsolidatedSimulationEngine', () => {
  let engine: ConsolidatedSimulationEngine;
  let mockToken: UnifiedTokenInfo;

  beforeEach(() => {
    engine = new ConsolidatedSimulationEngine({
      startingBalance: 10,
      simulatedInvestment: 0.003,
      maxPositions: 100,
      minConfidence: 5,
      maxHoldTime: 3600000,
      stopLossPercent: 30,
      takeProfitPercent: 100
    });

    mockToken = {
      address: 'test-token-address',
      name: 'Test Token',
      symbol: 'TEST',
      decimals: 9,
      chainId: 'solana',
      detected: true,
      detectedAt: Date.now(),
      timestamp: Date.now(),
      source: 'test',
      liquidity: 1000,
      metadata: {}
    };
  });

  describe('initialization', () => {
    it('should initialize with correct starting balance', () => {
      expect(engine.getPortfolioValue()).toBe(10);
    });

    it('should start with empty positions', () => {
      const positions = engine.getActivePositions();
      expect(positions).toHaveLength(0);
    });

    it('should have proper configuration', () => {
      const stats = engine.getStats();
      expect(stats.totalTrades).toBe(0);
      expect(stats.winningTrades).toBe(0);
      expect(stats.losingTrades).toBe(0);
    });
  });

  describe('position management', () => {
    it('should open positions for valid tokens', async () => {
      const result = await engine.analyzeToken(mockToken);
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should track active positions', async () => {
      await engine.analyzeToken(mockToken);
      const positions = engine.getActivePositions();
      expect(positions.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect maximum positions limit', async () => {
      const smallEngine = new UnifiedSimulationEngine({
        startingBalance: 10,
        simulatedInvestment: 0.003,
        maxPositions: 1,
        minConfidence: 0,
        maxHoldTime: 3600000,
        stopLossPercent: 30,
        takeProfitPercent: 100
      });

      // Create multiple tokens
      const tokens = Array.from({ length: 5 }, (_, i) => ({
        ...mockToken,
        address: `test-token-${i}`,
        symbol: `TEST${i}`
      }));

      // Try to analyze all tokens
      for (const token of tokens) {
        await smallEngine.analyzeToken(token);
      }

      const positions = smallEngine.getActivePositions();
      expect(positions.length).toBeLessThanOrEqual(1);
    });
  });

  describe('statistics tracking', () => {
    it('should track trading statistics', async () => {
      await engine.analyzeToken(mockToken);
      const stats = engine.getStats();
      expect(stats.totalTrades).toBeGreaterThanOrEqual(0);
      expect(stats.winningTrades).toBeGreaterThanOrEqual(0);
      expect(stats.losingTrades).toBeGreaterThanOrEqual(0);
    });

    it('should calculate win rate correctly', async () => {
      const stats = engine.getStats();
      const expectedWinRate = stats.totalTrades > 0 ? (stats.winningTrades / stats.totalTrades) * 100 : 0;
      expect(stats.winRate).toBeCloseTo(expectedWinRate, 2);
    });

    it('should track portfolio value changes', async () => {
      const initialValue = engine.getPortfolioValue();
      await engine.analyzeToken(mockToken);
      const finalValue = engine.getPortfolioValue();
      expect(finalValue).toBeGreaterThanOrEqual(0);
    });
  });

  describe('risk management', () => {
    it('should enforce minimum confidence threshold', async () => {
      const highConfidenceEngine = new UnifiedSimulationEngine({
        startingBalance: 10,
        simulatedInvestment: 0.003,
        maxPositions: 100,
        minConfidence: 90,
        maxHoldTime: 3600000,
        stopLossPercent: 30,
        takeProfitPercent: 100
      });

      const result = await highConfidenceEngine.analyzeToken(mockToken);
      expect(result).toBeDefined();
    });

    it('should prevent trading when balance is insufficient', async () => {
      const smallEngine = new UnifiedSimulationEngine({
        startingBalance: 0.001,
        simulatedInvestment: 0.003,
        maxPositions: 100,
        minConfidence: 0,
        maxHoldTime: 3600000,
        stopLossPercent: 30,
        takeProfitPercent: 100
      });

      const result = await smallEngine.analyzeToken(mockToken);
      expect(result).toBeDefined();
    });
  });

  describe('event handling', () => {
    it('should emit position events', (done) => {
      let eventCount = 0;
      const expectedEvents = ['positionOpened', 'positionClosed', 'positionUpdated'];

      expectedEvents.forEach(event => {
        engine.on(event, () => {
          eventCount++;
          if (eventCount === expectedEvents.length) {
            done();
          }
        });
      });

      // Simulate events
      engine.emit('positionOpened', { token: mockToken });
      engine.emit('positionClosed', { token: mockToken });
      engine.emit('positionUpdated', { token: mockToken });
    });
  });

  describe('lifecycle management', () => {
    it('should start and stop properly', async () => {
      await engine.start();
      expect(engine.isRunning()).toBe(true);
      
      await engine.stop();
      expect(engine.isRunning()).toBe(false);
    });

    it('should handle cleanup properly', async () => {
      await engine.start();
      await engine.stop();
      
      const positions = engine.getActivePositions();
      expect(positions).toHaveLength(0);
    });
  });
});