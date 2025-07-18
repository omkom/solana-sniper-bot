#!/usr/bin/env node

import { SimplifiedUnifiedSystem } from './src/simplified-unified-system';
import { logger } from './src/monitoring/logger';

class SimplifiedSystemTester {
  private system: SimplifiedUnifiedSystem;
  private testResults: Map<string, boolean> = new Map();

  constructor() {
    this.system = new SimplifiedUnifiedSystem({
      mode: 'educational',
      maxTokens: 10,
      updateInterval: 5000,
      enableRealTimeUpdates: true,
      enableDashboard: false
    });
  }

  async runTests(): Promise<void> {
    console.log('🧪 Starting Simplified System Tests...\n');
    
    try {
      // Test 1: System initialization
      await this.testInitialization();
      
      // Test 2: Service health checks
      await this.testServiceHealth();
      
      // Test 3: Demo mode
      await this.testDemoMode();
      
      // Test 4: Token management
      await this.testTokenManagement();
      
      // Test 5: Price tracking
      await this.testPriceTracking();
      
      // Test 6: API service
      await this.testApiService();
      
      // Test 7: Diagnostics
      await this.testDiagnostics();
      
      // Test 8: Shutdown
      await this.testShutdown();
      
      this.displayResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  private async testInitialization(): Promise<void> {
    console.log('🔧 Testing system initialization...');
    
    try {
      await this.system.start();
      
      const stats = this.system.getStats();
      this.testResults.set('system_start', stats.isRunning);
      this.testResults.set('components_initialized', 
        stats.components.tokenService && 
        stats.components.priceTracker && 
        stats.components.apiService
      );
      
      console.log('✅ System initialization test passed');
      
    } catch (error) {
      console.error('❌ System initialization test failed:', error);
      this.testResults.set('system_start', false);
      this.testResults.set('components_initialized', false);
    }
  }

  private async testServiceHealth(): Promise<void> {
    console.log('🏥 Testing service health checks...');
    
    try {
      const isHealthy = this.system.isHealthy();
      this.testResults.set('system_healthy', isHealthy);
      
      const stats = this.system.getStats();
      this.testResults.set('token_service_running', stats.components.tokenService.isRunning);
      this.testResults.set('price_tracker_running', stats.components.priceTracker.isRunning);
      this.testResults.set('api_service_running', stats.components.apiService.isHealthy);
      
      console.log('✅ Service health checks passed');
      
    } catch (error) {
      console.error('❌ Service health checks failed:', error);
      this.testResults.set('system_healthy', false);
      this.testResults.set('token_service_running', false);
      this.testResults.set('price_tracker_running', false);
      this.testResults.set('api_service_running', false);
    }
  }

  private async testDemoMode(): Promise<void> {
    console.log('🎮 Testing demo mode...');
    
    try {
      await this.system.startDemoMode();
      
      // Wait for demo tokens to be processed
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const stats = this.system.getStats();
      this.testResults.set('demo_tokens_created', stats.tokensDetected > 0);
      this.testResults.set('demo_tokens_tracked', stats.tokensTracked > 0);
      
      console.log('✅ Demo mode test passed');
      
    } catch (error) {
      console.error('❌ Demo mode test failed:', error);
      this.testResults.set('demo_tokens_created', false);
      this.testResults.set('demo_tokens_tracked', false);
    }
  }

  private async testTokenManagement(): Promise<void> {
    console.log('📊 Testing token management...');
    
    try {
      const allTokens = this.system.getAllTokens();
      const activeTokens = this.system.getActiveTokens();
      
      this.testResults.set('tokens_available', allTokens.length > 0);
      this.testResults.set('active_tokens_available', activeTokens.length > 0);
      
      // Test individual token retrieval
      if (allTokens.length > 0) {
        const firstToken = allTokens[0];
        const retrievedToken = this.system.getToken(firstToken.address);
        this.testResults.set('token_retrieval_works', !!retrievedToken);
      } else {
        this.testResults.set('token_retrieval_works', false);
      }
      
      console.log('✅ Token management test passed');
      
    } catch (error) {
      console.error('❌ Token management test failed:', error);
      this.testResults.set('tokens_available', false);
      this.testResults.set('active_tokens_available', false);
      this.testResults.set('token_retrieval_works', false);
    }
  }

  private async testPriceTracking(): Promise<void> {
    console.log('💰 Testing price tracking...');
    
    try {
      const allPrices = this.system.getAllPrices();
      this.testResults.set('price_data_available', allPrices.length > 0);
      
      // Test price alerts
      const tokens = this.system.getAllTokens();
      if (tokens.length > 0) {
        const alertId = this.system.addPriceAlert(tokens[0].address, 'price_above', 0.001);
        this.testResults.set('price_alert_creation', !!alertId);
        
        // Clean up alert
        this.system.removePriceAlert(alertId);
      } else {
        this.testResults.set('price_alert_creation', false);
      }
      
      console.log('✅ Price tracking test passed');
      
    } catch (error) {
      console.error('❌ Price tracking test failed:', error);
      this.testResults.set('price_data_available', false);
      this.testResults.set('price_alert_creation', false);
    }
  }

  private async testApiService(): Promise<void> {
    console.log('🌐 Testing API service...');
    
    try {
      // Test API stats
      const stats = this.system.getStats();
      this.testResults.set('api_service_stats_available', !!stats.components.apiService);
      
      // Test cache clear
      this.system.clearApiCache();
      this.testResults.set('api_cache_clear_works', true);
      
      console.log('✅ API service test passed');
      
    } catch (error) {
      console.error('❌ API service test failed:', error);
      this.testResults.set('api_service_stats_available', false);
      this.testResults.set('api_cache_clear_works', false);
    }
  }

  private async testDiagnostics(): Promise<void> {
    console.log('🔍 Testing diagnostics...');
    
    try {
      const diagnostics = await this.system.runDiagnostics();
      
      this.testResults.set('diagnostics_available', !!diagnostics);
      this.testResults.set('system_diagnostics_complete', !!diagnostics.system);
      this.testResults.set('component_diagnostics_complete', !!diagnostics.components);
      this.testResults.set('performance_metrics_available', !!diagnostics.performance);
      this.testResults.set('recommendations_generated', Array.isArray(diagnostics.recommendations));
      
      console.log('✅ Diagnostics test passed');
      
    } catch (error) {
      console.error('❌ Diagnostics test failed:', error);
      this.testResults.set('diagnostics_available', false);
      this.testResults.set('system_diagnostics_complete', false);
      this.testResults.set('component_diagnostics_complete', false);
      this.testResults.set('performance_metrics_available', false);
      this.testResults.set('recommendations_generated', false);
    }
  }

  private async testShutdown(): Promise<void> {
    console.log('🛑 Testing shutdown...');
    
    try {
      await this.system.stop();
      
      const stats = this.system.getStats();
      this.testResults.set('graceful_shutdown', !stats.isRunning);
      
      console.log('✅ Shutdown test passed');
      
    } catch (error) {
      console.error('❌ Shutdown test failed:', error);
      this.testResults.set('graceful_shutdown', false);
    }
  }

  private displayResults(): void {
    const totalTests = this.testResults.size;
    const passedTests = Array.from(this.testResults.values()).filter(Boolean).length;
    const failedTests = totalTests - passedTests;
    
    console.log('\n📊 Test Results:');
    console.log('='.repeat(50));
    
    for (const [testName, passed] of this.testResults) {
      const status = passed ? '✅' : '❌';
      console.log(`${status} ${testName.replace(/_/g, ' ').toUpperCase()}`);
    }
    
    console.log('='.repeat(50));
    console.log(`Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    if (failedTests === 0) {
      console.log('\n🎉 All tests passed! The simplified system is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please check the implementation.');
    }
  }
}

// Run tests
const tester = new SimplifiedSystemTester();
tester.runTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});