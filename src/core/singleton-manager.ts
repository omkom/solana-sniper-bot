import { EventEmitter } from 'events';
import { Config } from './config';
import { ConnectionManager } from './connection';
import { ApiGateway } from './api-gateway';
import { logger } from '../monitoring/logger';

/**
 * Singleton Manager - Ensures only one instance of each service
 * Prevents duplicate initializations and resource waste
 */
export class SingletonManager extends EventEmitter {
  private static instance: SingletonManager;
  private services: Map<string, any> = new Map();
  private initializationPromises: Map<string, Promise<any>> = new Map();
  private initialized = false;

  private constructor() {
    super();
    this.setMaxListeners(50); // Prevent memory leak warnings
  }

  static getInstance(): SingletonManager {
    if (!SingletonManager.instance) {
      SingletonManager.instance = new SingletonManager();
    }
    return SingletonManager.instance;
  }

  /**
   * Initialize all core services in the correct order
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('🚀 Initializing singleton services...');

    try {
      // Initialize in dependency order
      await this.getConfig();
      await this.getConnectionManager();
      await this.getApiGateway();
      
      this.initialized = true;
      logger.info('✅ Singleton services initialized successfully');
      
      this.emit('initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize singleton services:', error);
      throw error;
    }
  }

  /**
   * Get or create Config instance
   */
  async getConfig(): Promise<Config> {
    const key = 'config';
    
    if (this.services.has(key)) {
      return this.services.get(key);
    }

    if (this.initializationPromises.has(key)) {
      return this.initializationPromises.get(key);
    }

    const initPromise = this.initializeConfig();
    this.initializationPromises.set(key, initPromise);
    
    const config = await initPromise;
    this.services.set(key, config);
    this.initializationPromises.delete(key);
    
    return config;
  }

  /**
   * Get or create ConnectionManager instance
   */
  async getConnectionManager(): Promise<ConnectionManager> {
    const key = 'connectionManager';
    
    if (this.services.has(key)) {
      return this.services.get(key);
    }

    if (this.initializationPromises.has(key)) {
      return this.initializationPromises.get(key);
    }

    const initPromise = this.initializeConnectionManager();
    this.initializationPromises.set(key, initPromise);
    
    const connectionManager = await initPromise;
    this.services.set(key, connectionManager);
    this.initializationPromises.delete(key);
    
    return connectionManager;
  }

  /**
   * Get or create ApiGateway instance
   */
  async getApiGateway(): Promise<ApiGateway> {
    const key = 'apiGateway';
    
    if (this.services.has(key)) {
      return this.services.get(key);
    }

    if (this.initializationPromises.has(key)) {
      return this.initializationPromises.get(key);
    }

    const initPromise = this.initializeApiGateway();
    this.initializationPromises.set(key, initPromise);
    
    const apiGateway = await initPromise;
    this.services.set(key, apiGateway);
    this.initializationPromises.delete(key);
    
    return apiGateway;
  }

  /**
   * Initialize Config service
   */
  private async initializeConfig(): Promise<Config> {
    logger.info('🔧 Initializing Config service...');
    const config = Config.getInstance();
    logger.info('✅ Config service initialized');
    return config;
  }

  /**
   * Initialize ConnectionManager service
   */
  private async initializeConnectionManager(): Promise<ConnectionManager> {
    logger.info('🔗 Initializing ConnectionManager service...');
    const config = await this.getConfig();
    const connectionManager = new ConnectionManager();
    await connectionManager.initialize(config);
    logger.info('✅ ConnectionManager service initialized');
    return connectionManager;
  }

  /**
   * Initialize ApiGateway service
   */
  private async initializeApiGateway(): Promise<ApiGateway> {
    logger.info('🌐 Initializing ApiGateway service...');
    const apiGateway = new ApiGateway();
    logger.info('✅ ApiGateway service initialized');
    return apiGateway;
  }

  /**
   * Check if services are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get service status
   */
  getStatus(): any {
    return {
      initialized: this.initialized,
      services: Array.from(this.services.keys()),
      pendingInitializations: Array.from(this.initializationPromises.keys())
    };
  }

  /**
   * Cleanup all services
   */
  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up singleton services...');
    
    // Cleanup ConnectionManager
    const connectionManager = this.services.get('connectionManager');
    if (connectionManager && connectionManager.cleanup) {
      await connectionManager.cleanup();
    }

    // Cleanup ApiGateway
    const apiGateway = this.services.get('apiGateway');
    if (apiGateway && apiGateway.shutdown) {
      await apiGateway.shutdown();
    }

    // Clear all services
    this.services.clear();
    this.initializationPromises.clear();
    this.initialized = false;

    logger.info('✅ Singleton services cleaned up');
  }
}

// Global singleton instance
export const singletonManager = SingletonManager.getInstance();

// Convenience functions for easy access
export async function getConfig(): Promise<Config> {
  return singletonManager.getConfig();
}

export async function getConnectionManager(): Promise<ConnectionManager> {
  return singletonManager.getConnectionManager();
}

export async function getApiGateway(): Promise<ApiGateway> {
  return singletonManager.getApiGateway();
}

export async function initializeSingletons(): Promise<void> {
  return singletonManager.initialize();
}