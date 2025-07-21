/**
 * Singleton manager tests
 */

import { SingletonManager } from '../../core/singleton-manager';

describe('SingletonManager', () => {
  let singletonManager: SingletonManager;

  beforeEach(() => {
    singletonManager = SingletonManager.getInstance();
  });

  describe('singleton behavior', () => {
    it('should return the same instance', () => {
      const manager1 = SingletonManager.getInstance();
      const manager2 = SingletonManager.getInstance();
      expect(manager1).toBe(manager2);
    });

    it('should have proper initial state', () => {
      const status = singletonManager.getStatus();
      expect(status).toBeDefined();
      expect(status.services).toBeDefined();
      expect(status.pendingInitializations).toBeDefined();
    });
  });

  describe('service management', () => {
    it('should initialize services properly', async () => {
      await singletonManager.initialize();
      expect(singletonManager.isInitialized()).toBe(true);
    });

    it('should provide config service', async () => {
      const config = await singletonManager.getConfig();
      expect(config).toBeDefined();
      expect(typeof config.getRPCEndpoint).toBe('function');
    });

    it('should provide connection manager', async () => {
      const connectionManager = await singletonManager.getConnectionManager();
      expect(connectionManager).toBeDefined();
      expect(typeof connectionManager.getConnection).toBe('function');
    });

    it('should provide API gateway', async () => {
      const apiGateway = await singletonManager.getApiGateway();
      expect(apiGateway).toBeDefined();
      expect(typeof apiGateway.request).toBe('function');
    });
  });

  describe('lifecycle management', () => {
    it('should support cleanup', async () => {
      await singletonManager.initialize();
      await singletonManager.cleanup();
      expect(singletonManager.isInitialized()).toBe(false);
    });

    it('should prevent double initialization', async () => {
      await singletonManager.initialize();
      const firstInit = singletonManager.isInitialized();
      await singletonManager.initialize();
      const secondInit = singletonManager.isInitialized();
      expect(firstInit).toBe(true);
      expect(secondInit).toBe(true);
    });
  });
});