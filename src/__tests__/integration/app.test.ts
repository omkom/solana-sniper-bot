/**
 * Integration tests for the main application
 */

import { TokenAnalyzerApp } from '../../index';

describe('TokenAnalyzerApp Integration', () => {
  let app: TokenAnalyzerApp;

  beforeEach(() => {
    app = new TokenAnalyzerApp('unified');
  });

  afterEach(async () => {
    if (app) {
      await app.stop();
    }
  });

  describe('application lifecycle', () => {
    it('should initialize in different modes', async () => {
      const modes = ['rapid', 'real', 'unified', 'analysis'] as const;
      
      for (const mode of modes) {
        const testApp = new TokenAnalyzerApp(mode);
        await testApp.start();
        expect(testApp.isRunning()).toBe(true);
        await testApp.stop();
        expect(testApp.isRunning()).toBe(false);
      }
    });

    it('should start and stop gracefully', async () => {
      await app.start();
      expect(app.isRunning()).toBe(true);
      
      await app.stop();
      expect(app.isRunning()).toBe(false);
    });

    it('should handle multiple start calls', async () => {
      await app.start();
      await app.start(); // Should not throw
      expect(app.isRunning()).toBe(true);
    });

    it('should handle stop when not running', async () => {
      await app.stop(); // Should not throw
      expect(app.isRunning()).toBe(false);
    });
  });

  describe('component integration', () => {
    it('should integrate detector and simulation engine', async () => {
      await app.start();
      
      // Verify components are running
      expect(app.isRunning()).toBe(true);
      
      // Simulate token detection
      const mockToken = {
        address: 'test-token',
        name: 'Test Token',
        symbol: 'TEST',
        decimals: 9,
        chainId: 'solana' as const,
        detected: true,
        detectedAt: Date.now(),
        timestamp: Date.now(),
        source: 'test',
        liquidity: 1000,
        metadata: {}
      };

      // App should handle token detection without errors
      expect(() => {
        app.emit('tokenDetected', [mockToken]);
      }).not.toThrow();
    });

    it('should emit application events', (done) => {
      let eventCount = 0;
      
      app.on('started', () => {
        eventCount++;
        if (eventCount === 1) {
          app.stop();
        }
      });

      app.on('stopped', () => {
        eventCount++;
        if (eventCount === 2) {
          done();
        }
      });

      app.start();
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Mock a service that fails to initialize
      const originalStart = app.start;
      app.start = jest.fn().mockRejectedValue(new Error('Initialization failed'));

      await expect(app.start()).rejects.toThrow('Initialization failed');
      expect(app.isRunning()).toBe(false);
      
      // Restore original method
      app.start = originalStart;
    });

    it('should handle runtime errors gracefully', async () => {
      await app.start();
      
      // Simulate a runtime error
      app.emit('error', new Error('Runtime error'));
      
      // App should continue running
      expect(app.isRunning()).toBe(true);
    });
  });

  describe('configuration modes', () => {
    it('should configure components based on mode', async () => {
      const rapidApp = new TokenAnalyzerApp('rapid');
      await rapidApp.start();
      expect(rapidApp.isRunning()).toBe(true);
      await rapidApp.stop();

      const realApp = new TokenAnalyzerApp('real');
      await realApp.start();
      expect(realApp.isRunning()).toBe(true);
      await realApp.stop();

      const analysisApp = new TokenAnalyzerApp('analysis');
      await analysisApp.start();
      expect(analysisApp.isRunning()).toBe(true);
      await analysisApp.stop();
    });
  });

  describe('performance', () => {
    it('should start within reasonable time', async () => {
      const startTime = Date.now();
      await app.start();
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(5000); // Should start within 5 seconds
    });

    it('should stop within reasonable time', async () => {
      await app.start();
      
      const startTime = Date.now();
      await app.stop();
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(2000); // Should stop within 2 seconds
    });
  });
});