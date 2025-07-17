#!/usr/bin/env ts-node

/**
 * Comprehensive Token Detection Testing Script
 * This script tests all detection methods to evaluate token freshness and optimize performance
 */

import { DetectionTester } from './detection-tester';
import { EnhancedDetector } from '../detection/enhanced-detector';
import { RaydiumMonitor } from '../detection/raydium-monitor';
import { ConnectionManager } from '../core/connection';
import * as fs from 'fs';
import * as path from 'path';

interface TestResults {
  timestamp: number;
  testDuration: number;
  overallScore: number;
  recommendations: string[];
  detailedResults: any;
  optimalConfiguration: any;
}

class DetectionTestRunner {
  private tester: DetectionTester;
  private enhancedDetector: EnhancedDetector;
  private raydiumMonitor: RaydiumMonitor;
  private connectionManager: ConnectionManager;

  constructor() {
    this.tester = new DetectionTester();
    this.enhancedDetector = new EnhancedDetector();
    this.raydiumMonitor = new RaydiumMonitor();
    this.connectionManager = new ConnectionManager();
  }

  async runFullTestSuite(): Promise<TestResults> {
    const startTime = Date.now();
    console.log('🧪 Starting comprehensive detection test suite...\n');

    try {
      // Phase 1: Basic connectivity and API tests
      console.log('📡 Phase 1: Testing basic connectivity and API endpoints...');
      const basicTests = await this.tester.runComprehensiveTest();
      
      // Phase 2: Enhanced detector performance test
      console.log('\n🚀 Phase 2: Testing enhanced detection system...');
      const enhancedTests = await this.testEnhancedDetector();
      
      // Phase 3: Real-time WebSocket monitoring test
      console.log('\n📺 Phase 3: Testing real-time WebSocket performance...');
      const realtimeTests = await this.testRealtimeDetection();
      
      // Phase 4: Token freshness validation
      console.log('\n🆕 Phase 4: Validating token freshness across sources...');
      const freshnessTests = await this.testTokenFreshness();
      
      // Phase 5: Performance benchmarking
      console.log('\n⚡ Phase 5: Performance benchmarking...');
      const performanceTests = await this.benchmarkPerformance();

      const testDuration = Date.now() - startTime;
      
      // Compile results and generate recommendations
      const results = this.compileResults({
        basicTests,
        enhancedTests,
        realtimeTests,
        freshnessTests,
        performanceTests,
        testDuration
      });

      // Save results to file
      await this.saveResults(results);
      
      // Display summary
      this.displaySummary(results);
      
      return results;

    } catch (error) {
      console.error('❌ Error running test suite:', error);
      throw error;
    }
  }

  private async testEnhancedDetector(): Promise<any> {
    const results: any = {
      programCoverage: null,
      detectionLatency: null,
      websocketHealth: null,
      apiPollingEfficiency: null
    };

    try {
      // Test program coverage
      console.log('  📊 Testing DEX program coverage...');
      const programs = Object.keys((this.enhancedDetector as any).constructor.ENHANCED_PROGRAMS);
      results.programCoverage = {
        totalPrograms: programs.length,
        programs: programs,
        coverage: programs.length >= 10 ? 'excellent' : programs.length >= 5 ? 'good' : 'limited'
      };

      // Test detection latency by starting enhanced detector briefly
      console.log('  ⚡ Testing detection latency...');
      const latencyStart = Date.now();
      
      // Start enhanced detector for 30 seconds to measure activity
      await this.enhancedDetector.startEnhancedMonitoring();
      
      let detectedTokens = 0;
      const tokenHandler = () => { detectedTokens++; };
      this.enhancedDetector.on('tokenDetected', tokenHandler);
      
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds
      
      await this.enhancedDetector.stopEnhancedMonitoring();
      this.enhancedDetector.removeListener('tokenDetected', tokenHandler);
      
      const detectionLatency = Date.now() - latencyStart;
      
      results.detectionLatency = {
        testDuration: 30000,
        tokensDetected: detectedTokens,
        tokensPerSecond: detectedTokens / 30,
        averageLatency: detectionLatency / Math.max(detectedTokens, 1)
      };

      // Test enhanced stats
      const enhancedStats = this.enhancedDetector.getEnhancedStats();
      results.enhancedStats = enhancedStats;

    } catch (error) {
      console.error('  ❌ Error testing enhanced detector:', error);
      results.error = error instanceof Error ? error.message : String(error);
    }

    return results;
  }

  private async testRealtimeDetection(): Promise<any> {
    const results: any = {
      websocketConnections: null,
      logStreamRate: null,
      commitmentComparison: null
    };

    try {
      // Test WebSocket connections
      console.log('  📡 Testing WebSocket connection health...');
      const connection = this.connectionManager.getConnection();
      
      const commitmentLevels = ['processed', 'confirmed', 'finalized'];
      const commitmentResults: any = {};
      
      for (const commitment of commitmentLevels) {
        const start = Date.now();
        try {
          const slot = await connection.getSlot(commitment as any);
          commitmentResults[commitment] = {
            success: true,
            latency: Date.now() - start,
            slot: slot
          };
        } catch (error) {
          commitmentResults[commitment] = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            latency: Date.now() - start
          };
        }
      }
      
      results.commitmentComparison = commitmentResults;

      // Test log stream rate using Raydium monitor
      console.log('  📈 Testing log stream rate...');
      await this.raydiumMonitor.startMonitoring();
      
      let logCount = 0;
      const logHandler = () => { logCount++; };
      this.raydiumMonitor.on('tokenDetected', logHandler);
      
      await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds
      
      await this.raydiumMonitor.stopMonitoring();
      this.raydiumMonitor.removeListener('tokenDetected', logHandler);
      
      results.logStreamRate = {
        testDuration: 15000,
        logsReceived: logCount,
        logsPerSecond: logCount / 15,
        efficiency: logCount > 0 ? 'active' : 'low'
      };

    } catch (error) {
      console.error('  ❌ Error testing realtime detection:', error);
      results.error = error instanceof Error ? error.message : String(error);
    }

    return results;
  }

  private async testTokenFreshness(): Promise<any> {
    const results: any = {
      sourceFreshness: {},
      crossValidation: null,
      freshnessScore: 0
    };

    try {
      // Test multiple sources for token freshness
      const sources = [
        {
          name: 'DexScreener_Latest',
          fetcher: () => this.fetchDexScreenerLatest()
        },
        {
          name: 'DexScreener_Trending',
          fetcher: () => this.fetchDexScreenerTrending()
        },
        {
          name: 'Enhanced_Detection',
          fetcher: () => this.getEnhancedDetectorTokens()
        }
      ];

      for (const source of sources) {
        try {
          console.log(`  🔍 Testing ${source.name} freshness...`);
          const start = Date.now();
          const tokens = await source.fetcher();
          const latency = Date.now() - start;
          
          // Analyze token ages
          const tokenAges = tokens
            .filter(token => token.createdAt || token.pairCreatedAt)
            .map(token => {
              const created = token.createdAt || new Date(token.pairCreatedAt).getTime();
              return Date.now() - created;
            });
          
          const avgAge = tokenAges.length > 0 ? 
            tokenAges.reduce((sum, age) => sum + age, 0) / tokenAges.length : 0;
          
          const newestAge = tokenAges.length > 0 ? Math.min(...tokenAges) : 0;
          
          results.sourceFreshness[source.name] = {
            success: true,
            latency,
            tokenCount: tokens.length,
            avgAgeMinutes: avgAge / (1000 * 60),
            newestAgeMinutes: newestAge / (1000 * 60),
            freshnessScore: this.calculateFreshnessScore(avgAge, newestAge, tokens.length)
          };
          
        } catch (error) {
          results.sourceFreshness[source.name] = {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      // Calculate overall freshness score
      const successfulSources = Object.values(results.sourceFreshness)
        .filter((result: any) => result.success);
      
      if (successfulSources.length > 0) {
        results.freshnessScore = successfulSources
          .reduce((sum: number, result: any) => sum + result.freshnessScore, 0) / successfulSources.length;
      }

    } catch (error) {
      console.error('  ❌ Error testing token freshness:', error);
      results.error = error instanceof Error ? error.message : String(error);
    }

    return results;
  }

  private async benchmarkPerformance(): Promise<any> {
    const results: any = {
      rpcLatency: null,
      apiThroughput: null,
      memoryUsage: null,
      cpuEfficiency: null
    };

    try {
      // RPC latency test
      console.log('  ⚡ Benchmarking RPC latency...');
      const connection = this.connectionManager.getConnection();
      const rpcTests = [];
      
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await connection.getLatestBlockhash('processed');
        rpcTests.push(Date.now() - start);
      }
      
      results.rpcLatency = {
        tests: rpcTests.length,
        avgLatency: rpcTests.reduce((sum, lat) => sum + lat, 0) / rpcTests.length,
        minLatency: Math.min(...rpcTests),
        maxLatency: Math.max(...rpcTests)
      };

      // Memory usage
      const memUsage = process.memoryUsage();
      results.memoryUsage = {
        heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        external: (memUsage.external / 1024 / 1024).toFixed(2) + ' MB',
        rss: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB'
      };

    } catch (error) {
      console.error('  ❌ Error benchmarking performance:', error);
      results.error = error instanceof Error ? error.message : String(error);
    }

    return results;
  }

  private calculateFreshnessScore(avgAge: number, newestAge: number, tokenCount: number): number {
    // Scoring algorithm for token freshness (0-100)
    let score = 0;
    
    // Age component (50% of score)
    const avgAgeHours = avgAge / (1000 * 60 * 60);
    const newestAgeMinutes = newestAge / (1000 * 60);
    
    if (avgAgeHours <= 1) score += 25;
    else if (avgAgeHours <= 6) score += 20;
    else if (avgAgeHours <= 24) score += 15;
    else score += 5;
    
    if (newestAgeMinutes <= 5) score += 25;
    else if (newestAgeMinutes <= 30) score += 20;
    else if (newestAgeMinutes <= 120) score += 15;
    else score += 5;
    
    // Volume component (50% of score)
    if (tokenCount >= 20) score += 25;
    else if (tokenCount >= 10) score += 20;
    else if (tokenCount >= 5) score += 15;
    else if (tokenCount >= 1) score += 10;
    
    return Math.min(100, Math.max(0, score));
  }

  private async fetchDexScreenerLatest(): Promise<any[]> {
    const axios = require('axios');
    const response = await axios.get('https://api.dexscreener.com/latest/dex/pairs/solana', {
      params: { sort: 'pairCreatedAt', order: 'desc', limit: 20 },
      timeout: 10000
    });
    return response.data.pairs || [];
  }

  private async fetchDexScreenerTrending(): Promise<any[]> {
    const axios = require('axios');
    const response = await axios.get('https://api.dexscreener.com/latest/dex/pairs/solana', {
      params: { sort: 'volume24h', order: 'desc', limit: 20 },
      timeout: 10000
    });
    return response.data.pairs || [];
  }

  private async getEnhancedDetectorTokens(): Promise<any[]> {
    const recentTokens = this.enhancedDetector.getRecentTokens(5);
    return recentTokens || [];
  }

  private compileResults(testData: any): TestResults {
    const { basicTests, enhancedTests, realtimeTests, freshnessTests, performanceTests, testDuration } = testData;

    // Calculate overall score
    let totalScore = 0;
    let scoreComponents = 0;

    // Basic connectivity score (25% weight)
    if (basicTests.summary?.rpcHealth >= 2) {
      totalScore += 25;
    }
    scoreComponents++;

    // Enhanced detection score (25% weight)
    if (enhancedTests.programCoverage?.totalPrograms >= 10) {
      totalScore += 25;
    }
    scoreComponents++;

    // Realtime performance score (25% weight)
    if (realtimeTests.logStreamRate?.efficiency === 'active') {
      totalScore += 25;
    }
    scoreComponents++;

    // Freshness score (25% weight)
    totalScore += (freshnessTests.freshnessScore || 0) * 0.25;
    scoreComponents++;

    const overallScore = Math.min(100, totalScore);

    // Generate recommendations
    const recommendations = this.generateOptimizationRecommendations({
      basicTests,
      enhancedTests,
      realtimeTests,
      freshnessTests,
      performanceTests
    });

    return {
      timestamp: Date.now(),
      testDuration,
      overallScore,
      recommendations,
      detailedResults: {
        basicTests,
        enhancedTests,
        realtimeTests,
        freshnessTests,
        performanceTests
      },
      optimalConfiguration: this.generateOptimalConfiguration({
        basicTests,
        enhancedTests,
        realtimeTests,
        freshnessTests,
        performanceTests
      })
    };
  }

  private generateOptimizationRecommendations(testData: any): string[] {
    const recommendations: string[] = [];
    const { basicTests, enhancedTests, realtimeTests, freshnessTests, performanceTests } = testData;

    // RPC recommendations
    if (basicTests.tests?.commitmentLevels?.processed?.latency < 
        basicTests.tests?.commitmentLevels?.confirmed?.latency) {
      recommendations.push('✅ Use "processed" commitment for fastest token detection');
    }

    // Enhanced detection recommendations
    if (enhancedTests.programCoverage?.totalPrograms >= 10) {
      recommendations.push('✅ Enhanced detector has excellent DEX coverage');
    } else {
      recommendations.push('⚠️ Consider adding more DEX programs for better coverage');
    }

    // WebSocket recommendations
    if (realtimeTests.logStreamRate?.logsPerSecond > 0.1) {
      recommendations.push('✅ WebSocket monitoring is receiving active data');
    } else {
      recommendations.push('⚠️ WebSocket monitoring may need optimization for better data flow');
    }

    // Freshness recommendations
    const bestSource = Object.entries(freshnessTests.sourceFreshness || {})
      .filter(([_, data]: [string, any]) => data.success)
      .sort(([_, a]: [string, any], [__, b]: [string, any]) => (b as any).freshnessScore - (a as any).freshnessScore)[0];

    if (bestSource) {
      recommendations.push(`🎯 Best source for fresh tokens: ${bestSource[0]} (Score: ${(bestSource[1] as any).freshnessScore.toFixed(1)})`);
    }

    // Performance recommendations
    if (performanceTests.rpcLatency?.avgLatency > 1000) {
      recommendations.push('⚠️ Consider switching to a faster RPC provider for better latency');
    }

    // Memory recommendations
    const heapMB = parseFloat(performanceTests.memoryUsage?.heapUsed || '0');
    if (heapMB > 500) {
      recommendations.push('⚠️ High memory usage detected - consider implementing memory cleanup');
    }

    return recommendations;
  }

  private generateOptimalConfiguration(testData: any): any {
    const { basicTests, realtimeTests, freshnessTests } = testData;

    return {
      rpc: {
        optimalCommitment: basicTests.summary?.optimalCommitment || 'processed',
        recommendedProvider: 'Current RPC (consider upgrading if latency > 1000ms)'
      },
      detection: {
        preferredSources: Object.entries(freshnessTests.sourceFreshness || {})
          .filter(([_, data]: [string, any]) => data.success)
          .sort(([_, a]: [string, any], [__, b]: [string, any]) => (b as any).freshnessScore - (a as any).freshnessScore)
          .slice(0, 3)
          .map(([name, _]) => name),
        websocketMonitoring: realtimeTests.logStreamRate?.efficiency === 'active' ? 'enabled' : 'needs_optimization',
        pollingInterval: '2-3 seconds for APIs, real-time for WebSockets'
      },
      performance: {
        maxConcurrentTokens: 5,
        queueProcessingInterval: '500ms',
        memoryCleanupInterval: '1 hour'
      }
    };
  }

  private async saveResults(results: TestResults): Promise<void> {
    const resultsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `detection-test-results-${timestamp}.json`;
    const filepath = path.join(resultsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Test results saved to: ${filepath}`);
  }

  private displaySummary(results: TestResults): void {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 DETECTION TEST SUITE SUMMARY');
    console.log('='.repeat(60));
    console.log(`⏱️  Test Duration: ${(results.testDuration / 1000).toFixed(1)}s`);
    console.log(`📊 Overall Score: ${results.overallScore.toFixed(1)}/100`);
    console.log('\n🔧 TOP RECOMMENDATIONS:');
    results.recommendations.slice(0, 5).forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
    
    console.log('\n⚙️  OPTIMAL CONFIGURATION:');
    console.log(`- Commitment Level: ${results.optimalConfiguration.rpc.optimalCommitment}`);
    console.log(`- Best Sources: ${results.optimalConfiguration.detection.preferredSources.join(', ')}`);
    console.log(`- WebSocket Status: ${results.optimalConfiguration.detection.websocketMonitoring}`);
    
    console.log('\n' + '='.repeat(60));
  }
}

// Main execution
async function main() {
  const testRunner = new DetectionTestRunner();
  
  try {
    console.log('🚀 Starting Detection Optimization Tests...\n');
    const results = await testRunner.runFullTestSuite();
    
    console.log('\n✅ All tests completed successfully!');
    console.log(`📈 Overall Detection Score: ${results.overallScore.toFixed(1)}/100`);
    
    if (results.overallScore >= 80) {
      console.log('🎉 Excellent detection performance!');
    } else if (results.overallScore >= 60) {
      console.log('👍 Good detection performance with room for improvement');
    } else {
      console.log('⚠️  Detection system needs optimization');
    }
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { DetectionTestRunner };