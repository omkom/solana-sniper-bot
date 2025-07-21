/**
 * Configuration system tests
 */

import { Config } from '../../core/config';

describe('Config', () => {
  let config: Config;

  beforeEach(() => {
    config = Config.getInstance();
  });

  describe('singleton behavior', () => {
    it('should return the same instance', () => {
      const config1 = Config.getInstance();
      const config2 = Config.getInstance();
      expect(config1).toBe(config2);
    });
  });

  describe('configuration values', () => {
    it('should provide default RPC endpoint', () => {
      const endpoint = config.getRPCEndpoint();
      expect(endpoint).toBeDefined();
      expect(typeof endpoint).toBe('string');
    });

    it('should provide fallback RPC endpoint', () => {
      const fallback = config.getFallbackRPC();
      expect(fallback).toBeDefined();
      expect(typeof fallback).toBe('string');
    });

    it('should provide detection configuration', () => {
      const detectionConfig = config.getDetectionConfig();
      expect(detectionConfig).toBeDefined();
      expect(detectionConfig.minLiquidity).toBeDefined();
      expect(detectionConfig.minConfidence).toBeDefined();
    });

    it('should provide simulation configuration', () => {
      const simulationConfig = config.getSimulationConfig();
      expect(simulationConfig).toBeDefined();
      expect(simulationConfig.startingBalance).toBeDefined();
      expect(simulationConfig.simulatedInvestment).toBeDefined();
    });

    it('should ensure dry run mode is enforced', () => {
      const detectionConfig = config.getDetectionConfig();
      expect(detectionConfig.mode).toBe('DRY_RUN');
    });
  });

  describe('configuration validation', () => {
    it('should validate minimum liquidity is positive', () => {
      const detectionConfig = config.getDetectionConfig();
      expect(detectionConfig.minLiquidity).toBeGreaterThan(0);
    });

    it('should validate confidence score is within range', () => {
      const detectionConfig = config.getDetectionConfig();
      expect(detectionConfig.minConfidence).toBeGreaterThanOrEqual(0);
      expect(detectionConfig.minConfidence).toBeLessThanOrEqual(100);
    });

    it('should validate starting balance is positive', () => {
      const simulationConfig = config.getSimulationConfig();
      expect(simulationConfig.startingBalance).toBeGreaterThan(0);
    });
  });
});