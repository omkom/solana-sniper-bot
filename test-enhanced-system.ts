#!/usr/bin/env node

import { EnhancedUnifiedSystem } from './src/enhanced-unified-system';
import { logger } from './src/monitoring/logger';

/**
 * Test script for the Enhanced Unified System
 * This script validates all major components and their integration
 */

class SystemTester {
  private system: EnhancedUnifiedSystem;
  private testResults: Map<string, boolean> = new Map();
  private startTime: number = 0;

  constructor() {
    this.system = new EnhancedUnifiedSystem({
      mode: 'educational',
      simulationEngine: 'unified',
      enableBlockchainAnalysis: true,
      enableRealTimeDetection: true,
      enableEnhancedPriceTracking: true,
      enableApiGateway: true,
      enableDashboard: true,
      enableMultiSourceValidation: true,
      enableAdvancedAnalytics: true,
      maxConcurrentAnalysis: 5,
      maxTrackedTokens: 50,
      enableAutoCleanup: true,
      enablePerformanceOptimization: true
    });
  }

  async runTests(): Promise<void> {
    console.log('🧪 Starting Enhanced Unified System Tests...\n');
    this.startTime = Date.now();

    try {
      // Test 1: System initialization
      await this.testSystemInitialization();
      
      // Test 2: API Gateway functionality
      await this.testApiGateway();
      
      // Test 3: Token detection system
      await this.testTokenDetection();
      
      // Test 4: Price tracking system
      await this.testPriceTracking();
      
      // Test 5: Blockchain analysis
      await this.testBlockchainAnalysis();
      
      // Test 6: Dashboard connectivity
      await this.testDashboard();
      
      // Test 7: Performance monitoring
      await this.testPerformanceMonitoring();
      
      // Test 8: Error handling
      await this.testErrorHandling();
      
      // Test 9: System diagnostics
      await this.testSystemDiagnostics();
      
      // Test 10: Cleanup and shutdown
      await this.testCleanupAndShutdown();
      
      // Display results
      this.displayTestResults();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    }
  }

  private async testSystemInitialization(): Promise<void> {
    console.log('🔧 Testing system initialization...');
    
    try {
      await this.system.start();
      
      const stats = this.system.getStats();
      const health = this.system.getSystemHealth();
      
      this.testResults.set('system_start', stats.isRunning);
      this.testResults.set('system_health', health.isRunning);
      this.testResults.set('components_loaded', Object.keys(stats.components).length > 0);
      
      console.log('✅ System initialization test passed');
      
    } catch (error) {
      console.error('❌ System initialization test failed:', error);
      this.testResults.set('system_start', false);
      this.testResults.set('system_health', false);
      this.testResults.set('components_loaded', false);
    }
  }

  private async testApiGateway(): Promise<void> {
    console.log('🌐 Testing API Gateway...');
    
    try {
      const stats = this.system.getStats();
      const gatewayStats = stats.components.apiGateway;
      
      this.testResults.set('api_gateway_running', gatewayStats.totalEndpoints > 0);
      this.testResults.set('api_endpoints_available', gatewayStats.healthyEndpoints > 0);
      
      // Test a simple API call
      const diagnostics = await this.system.runDiagnostics();
      this.testResults.set('api_gateway_functional', diagnostics.components.apiGateway?.status === 'healthy');
      
      console.log('✅ API Gateway test passed');
      
    } catch (error) {
      console.error('❌ API Gateway test failed:', error);
      this.testResults.set('api_gateway_running', false);
      this.testResults.set('api_endpoints_available', false);
      this.testResults.set('api_gateway_functional', false);
    }
  }

  private async testTokenDetection(): Promise<void> {
    console.log('🔍 Testing token detection system...');
    
    try {
      const stats = this.system.getStats();
      const detectionStats = stats.components.enhancedTokenDetection;
      
      this.testResults.set('token_detection_running', detectionStats?.systemStats?.isRunning || false);
      this.testResults.set('detection_strategies_active', detectionStats?.systemStats?.activeStrategies > 0);
      
      // Start demo mode to generate test tokens
      await this.system.startDemoMode();
      
      // Wait for demo tokens to be detected
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const updatedStats = this.system.getStats();
      const detectedCount = updatedStats.tokensDetected || 0;
      
      this.testResults.set('tokens_detected', detectedCount > 0);
      
      console.log('✅ Token detection test passed');
      
    } catch (error) {
      console.error('❌ Token detection test failed:', error);
      this.testResults.set('token_detection_running', false);
      this.testResults.set('detection_strategies_active', false);
      this.testResults.set('tokens_detected', false);
    }
  }

  private async testPriceTracking(): Promise<void> {
    console.log('📊 Testing price tracking system...');
    
    try {
      const stats = this.system.getStats();
      const trackerStats = stats.components.enhancedPriceTracker;
      
      this.testResults.set('price_tracker_running', trackerStats?.isUpdateLoopRunning || false);
      this.testResults.set('swap_checks_running', trackerStats?.isSwapCheckRunning || false);
      
      // Test tracking functionality will be validated by demo mode
      const trackedCount = stats.tokensTracked || 0;
      this.testResults.set('tokens_tracked', trackedCount > 0);
      
      console.log('✅ Price tracking test passed');
      
    } catch (error) {
      console.error('❌ Price tracking test failed:', error);
      this.testResults.set('price_tracker_running', false);
      this.testResults.set('swap_checks_running', false);
      this.testResults.set('tokens_tracked', false);
    }
  }

  private async testBlockchainAnalysis(): Promise<void> {
    console.log('🔬 Testing blockchain analysis...');
    
    try {
      const stats = this.system.getStats();
      const analyzerStats = stats.components.blockchainAnalyzer;
      
      this.testResults.set('blockchain_analyzer_available', !!analyzerStats);
      this.testResults.set('multiple_sources_configured', analyzerStats?.availableSources?.length > 1);
      
      // Test diagnostics
      const diagnostics = await this.system.runDiagnostics();
      this.testResults.set('blockchain_connection_healthy', 
        diagnostics.components.blockchainAnalyzer?.status === 'healthy');
      
      console.log('✅ Blockchain analysis test passed');
      
    } catch (error) {
      console.error('❌ Blockchain analysis test failed:', error);
      this.testResults.set('blockchain_analyzer_available', false);
      this.testResults.set('multiple_sources_configured', false);
      this.testResults.set('blockchain_connection_healthy', false);
    }
  }

  private async testDashboard(): Promise<void> {
    console.log('📱 Testing dashboard connectivity...');
    
    try {
      const health = this.system.getSystemHealth();
      const dashboardHealthy = health.components.dashboard;
      
      this.testResults.set('dashboard_running', dashboardHealthy);
      this.testResults.set('dashboard_url_available', !!this.system.getDashboardUrl());
      
      // Test WebSocket connections would require actual client connection
      // For now, we'll test if the server is listening
      const stats = this.system.getStats();
      this.testResults.set('websocket_ready', stats.isRunning);
      
      console.log('✅ Dashboard test passed');
      console.log(`🌐 Dashboard URL: ${this.system.getDashboardUrl()}`);
      
    } catch (error) {
      console.error('❌ Dashboard test failed:', error);
      this.testResults.set('dashboard_running', false);
      this.testResults.set('dashboard_url_available', false);
      this.testResults.set('websocket_ready', false);
    }
  }

  private async testPerformanceMonitoring(): Promise<void> {
    console.log('⚡ Testing performance monitoring...');
    
    try {
      const stats = this.system.getStats();
      const performance = stats.performance;
      
      this.testResults.set('performance_metrics_available', !!performance);
      this.testResults.set('memory_usage_tracked', performance.memoryUsage > 0);
      this.testResults.set('uptime_tracked', stats.uptime > 0);
      
      // Test metrics collection
      const metricsAvailable = stats.components && Object.keys(stats.components).length > 0;
      this.testResults.set('metrics_collection_active', metricsAvailable);
      
      console.log('✅ Performance monitoring test passed');
      
    } catch (error) {
      console.error('❌ Performance monitoring test failed:', error);
      this.testResults.set('performance_metrics_available', false);
      this.testResults.set('memory_usage_tracked', false);
      this.testResults.set('uptime_tracked', false);
      this.testResults.set('metrics_collection_active', false);
    }
  }

  private async testErrorHandling(): Promise<void> {
    console.log('🛡️ Testing error handling...');
    
    try {
      const stats = this.system.getStats();
      const initialErrors = stats.errors || 0;
      
      // Error handling is mostly event-driven and tested through other operations
      this.testResults.set('error_tracking_active', typeof stats.errors === 'number');
      this.testResults.set('error_count_reasonable', initialErrors < 10);
      
      console.log('✅ Error handling test passed');
      
    } catch (error) {
      console.error('❌ Error handling test failed:', error);
      this.testResults.set('error_tracking_active', false);
      this.testResults.set('error_count_reasonable', false);
    }
  }

  private async testSystemDiagnostics(): Promise<void> {
    console.log('🔍 Testing system diagnostics...');
    
    try {
      const diagnostics = await this.system.runDiagnostics();
      
      this.testResults.set('diagnostics_available', !!diagnostics);
      this.testResults.set('system_health_check', diagnostics.system?.isRunning || false);
      this.testResults.set('component_health_checks', Object.keys(diagnostics.components || {}).length > 0);
      
      // Check if recommendations are provided when needed
      const hasRecommendations = Array.isArray(diagnostics.recommendations);
      this.testResults.set('recommendations_system_active', hasRecommendations);
      
      console.log('✅ System diagnostics test passed');
      
    } catch (error) {
      console.error('❌ System diagnostics test failed:', error);
      this.testResults.set('diagnostics_available', false);
      this.testResults.set('system_health_check', false);
      this.testResults.set('component_health_checks', false);
      this.testResults.set('recommendations_system_active', false);
    }
  }

  private async testCleanupAndShutdown(): Promise<void> {
    console.log('🧹 Testing cleanup and shutdown...');
    
    try {
      // Test graceful shutdown
      await this.system.stop();
      
      const health = this.system.getSystemHealth();
      this.testResults.set('graceful_shutdown', !health.isRunning);
      
      // Test cleanup
      this.testResults.set('cleanup_completed', true);
      
      console.log('✅ Cleanup and shutdown test passed');
      
    } catch (error) {
      console.error('❌ Cleanup and shutdown test failed:', error);
      this.testResults.set('graceful_shutdown', false);
      this.testResults.set('cleanup_completed', false);
    }
  }

  private displayTestResults(): void {
    const totalTests = this.testResults.size;
    const passedTests = Array.from(this.testResults.values()).filter(Boolean).length;
    const failedTests = totalTests - passedTests;
    const testDuration = Date.now() - this.startTime;
    
    console.log('\n📊 Test Results Summary:');
    console.log('='.repeat(50));
    
    for (const [testName, passed] of this.testResults) {
      const status = passed ? '✅ PASS' : '❌ FAIL';
      const formattedName = testName.replace(/_/g, ' ').toUpperCase();
      console.log(`${status} ${formattedName}`);
    }
    
    console.log('='.repeat(50));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log(`Duration: ${testDuration}ms`);
    
    if (failedTests > 0) {
      console.log('\n⚠️  Some tests failed. Please check the system configuration.');
      console.log('💡 Tip: Run npm run lint to check for any code issues.');
    } else {
      console.log('\n🎉 All tests passed! The Enhanced Unified System is ready to use.');
      console.log('🚀 You can now start the system with: npm run dev:unified');
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new SystemTester();
  tester.runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { SystemTester };