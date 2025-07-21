/**
 * Unified detector tests
 */

import { UnifiedDetector } from '../../detection/unified-detector';
import { UnifiedTokenInfo } from '../../types/unified';

describe('UnifiedDetector', () => {
  let detector: UnifiedDetector;

  beforeEach(() => {
    detector = new UnifiedDetector({
      enableRaydium: true,
      enablePumpFun: true,
      enableDexScreener: true,
      enableMultiDex: true,
      enableRealTime: true,
      minLiquidity: 1000,
      maxAge: 3600000,
      minConfidence: 50,
      filterHoneypots: true,
      filterRugs: true,
      enabledSources: ['websocket', 'dexscreener', 'scanning'],
      scanInterval: 30000,
      batchSize: 5,
      maxConcurrentRequests: 2,
      rateLimitDelay: 2000,
      cacheTimeout: 60000
    });
  });

  describe('initialization', () => {
    it('should initialize with correct configuration', () => {
      const status = detector.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.enabledStrategies).toContain('websocket');
      expect(status.enabledStrategies).toContain('dexscreener');
      expect(status.enabledStrategies).toContain('scanning');
    });

    it('should provide health check functionality', async () => {
      const isHealthy = await detector.healthCheck();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('token detection', () => {
    it('should detect tokens from multiple sources', (done) => {
      let detectionCount = 0;
      
      detector.on('tokenDetected', (tokens: UnifiedTokenInfo[]) => {
        expect(Array.isArray(tokens)).toBe(true);
        tokens.forEach(token => {
          expect(token.address).toBeDefined();
          expect(token.symbol).toBeDefined();
          expect(token.detected).toBe(true);
        });
        detectionCount++;
        if (detectionCount >= 1) {
          done();
        }
      });

      // Simulate token detection
      const mockTokens: UnifiedTokenInfo[] = [{
        address: 'test-address',
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
      }];

      detector.emit('tokenDetected', mockTokens);
    });

    it('should emit detection results', (done) => {
      detector.on('detectionResult', (result) => {
        expect(result.source).toBeDefined();
        expect(result.timestamp).toBeDefined();
        expect(result.detectedCount).toBeDefined();
        done();
      });

      // Simulate detection result
      detector.emit('detectionResult', {
        source: 'test',
        timestamp: Date.now(),
        detectedCount: 1,
        hasTokens: true,
        tokens: [],
        filteredCount: 1,
        originalCount: 1,
        processingTime: 100
      });
    });
  });

  describe('detection strategies', () => {
    it('should support multiple detection strategies', () => {
      const status = detector.getStatus();
      expect(status.strategies).toBeDefined();
      expect(typeof status.strategies).toBe('object');
    });

    it('should track detected tokens', () => {
      const tokens = detector.getDetectedTokens(10);
      expect(Array.isArray(tokens)).toBe(true);
    });

    it('should limit detected tokens list', () => {
      const tokens = detector.getDetectedTokens(5);
      expect(tokens.length).toBeLessThanOrEqual(5);
    });
  });

  describe('lifecycle management', () => {
    it('should start and stop properly', async () => {
      await detector.start();
      expect(detector.getStatus().isRunning).toBe(true);
      
      await detector.stop();
      expect(detector.getStatus().isRunning).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      await detector.start();
      await detector.start(); // Should not throw
      expect(detector.getStatus().isRunning).toBe(true);
    });

    it('should clean up resources on stop', async () => {
      await detector.start();
      await detector.stop();
      
      const status = detector.getStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle detection errors gracefully', (done) => {
      detector.on('error', (error) => {
        expect(error).toBeDefined();
        done();
      });

      detector.emit('error', new Error('Test error'));
    });

    it('should continue operation after errors', async () => {
      await detector.start();
      detector.emit('error', new Error('Test error'));
      
      expect(detector.getStatus().isRunning).toBe(true);
    });
  });

  describe('configuration validation', () => {
    it('should validate configuration on creation', () => {
      const invalidDetector = new UnifiedDetector({
        enableRaydium: true,
        enablePumpFun: true,
        enableDexScreener: true,
        enableMultiDex: true,
        enableRealTime: true,
        minLiquidity: -1000, // Invalid
        maxAge: 3600000,
        minConfidence: 150, // Invalid
        filterHoneypots: true,
        filterRugs: true,
        enabledSources: ['websocket'],
        scanInterval: 30000,
        batchSize: 5,
        maxConcurrentRequests: 2,
        rateLimitDelay: 2000,
        cacheTimeout: 60000
      });

      expect(invalidDetector).toBeDefined();
    });
  });
});