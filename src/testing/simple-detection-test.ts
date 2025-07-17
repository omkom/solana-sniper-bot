#!/usr/bin/env ts-node

/**
 * Simple Token Detection Test Script
 * This script tests our current detection methods and evaluates token freshness
 */

import { ConnectionManager } from '../core/connection';
import { DexScreenerClient } from '../detection/dexscreener-client';
import axios from 'axios';
import * as fs from 'fs';

interface TestResult {
  name: string;
  success: boolean;
  tokenCount: number;
  avgAgeMinutes: number;
  newestAgeMinutes: number;
  latency: number;
  error?: string;
}

class SimpleDetectionTest {
  private connectionManager: ConnectionManager;
  private dexScreenerClient: DexScreenerClient;

  constructor() {
    this.connectionManager = new ConnectionManager();
    this.dexScreenerClient = new DexScreenerClient();
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Simple Detection Tests...\n');

    const results: TestResult[] = [];

    // Test 1: DexScreener Latest Pairs
    console.log('🔍 Testing DexScreener Latest Pairs...');
    results.push(await this.testDexScreenerLatest());

    // Test 2: DexScreener Trending
    console.log('🔍 Testing DexScreener Trending...');
    results.push(await this.testDexScreenerTrending());

    // Test 3: RPC Connection Speed
    console.log('🔍 Testing RPC Connection Speed...');
    results.push(await this.testRPCSpeed());

    // Test 4: Our Current DexScreener Client
    console.log('🔍 Testing Our DexScreener Client...');
    results.push(await this.testOurClient());

    // Display results
    this.displayResults(results);

    // Save results
    this.saveResults(results);
  }

  private async testDexScreenerLatest(): Promise<TestResult> {
    const start = Date.now();
    
    try {
      const response = await axios.get('https://api.dexscreener.com/latest/dex/pairs/solana', {
        params: { sort: 'pairCreatedAt', order: 'desc', limit: 20 },
        timeout: 10000
      });

      const pairs = response.data.pairs || [];
      const { avgAge, newestAge } = this.calculateTokenAges(pairs);

      return {
        name: 'DexScreener Latest',
        success: true,
        tokenCount: pairs.length,
        avgAgeMinutes: avgAge,
        newestAgeMinutes: newestAge,
        latency: Date.now() - start
      };
    } catch (error: any) {
      return {
        name: 'DexScreener Latest',
        success: false,
        tokenCount: 0,
        avgAgeMinutes: 0,
        newestAgeMinutes: 0,
        latency: Date.now() - start,
        error: error.message
      };
    }
  }

  private async testDexScreenerTrending(): Promise<TestResult> {
    const start = Date.now();
    
    try {
      const response = await axios.get('https://api.dexscreener.com/latest/dex/pairs/solana', {
        params: { sort: 'volume24h', order: 'desc', limit: 20 },
        timeout: 10000
      });

      const pairs = response.data.pairs || [];
      const { avgAge, newestAge } = this.calculateTokenAges(pairs);

      return {
        name: 'DexScreener Trending',
        success: true,
        tokenCount: pairs.length,
        avgAgeMinutes: avgAge,
        newestAgeMinutes: newestAge,
        latency: Date.now() - start
      };
    } catch (error: any) {
      return {
        name: 'DexScreener Trending',
        success: false,
        tokenCount: 0,
        avgAgeMinutes: 0,
        newestAgeMinutes: 0,
        latency: Date.now() - start,
        error: error.message
      };
    }
  }

  private async testRPCSpeed(): Promise<TestResult> {
    const start = Date.now();
    
    try {
      const connection = this.connectionManager.getConnection();
      const blockhash = await connection.getLatestBlockhash();
      
      return {
        name: 'RPC Connection',
        success: true,
        tokenCount: 1, // Just testing connection
        avgAgeMinutes: 0,
        newestAgeMinutes: 0,
        latency: Date.now() - start
      };
    } catch (error: any) {
      return {
        name: 'RPC Connection',
        success: false,
        tokenCount: 0,
        avgAgeMinutes: 0,
        newestAgeMinutes: 0,
        latency: Date.now() - start,
        error: error.message
      };
    }
  }

  private async testOurClient(): Promise<TestResult> {
    const start = Date.now();
    
    try {
      const tokens = await this.dexScreenerClient.getTrendingTokens();
      const tokenData = tokens.map(token => ({
        pairCreatedAt: token.pairCreatedAt || Date.now()
      }));
      
      const { avgAge, newestAge } = this.calculateTokenAges(tokenData);

      return {
        name: 'Our DexScreener Client',
        success: true,
        tokenCount: tokens.length,
        avgAgeMinutes: avgAge,
        newestAgeMinutes: newestAge,
        latency: Date.now() - start
      };
    } catch (error: any) {
      return {
        name: 'Our DexScreener Client',
        success: false,
        tokenCount: 0,
        avgAgeMinutes: 0,
        newestAgeMinutes: 0,
        latency: Date.now() - start,
        error: error.message
      };
    }
  }

  private calculateTokenAges(pairs: any[]): { avgAge: number; newestAge: number } {
    if (!pairs || pairs.length === 0) {
      return { avgAge: 0, newestAge: 0 };
    }

    const now = Date.now();
    const ages = pairs
      .filter(pair => pair.pairCreatedAt)
      .map(pair => {
        const created = new Date(pair.pairCreatedAt).getTime();
        return now - created;
      });

    if (ages.length === 0) {
      return { avgAge: 0, newestAge: 0 };
    }

    const avgAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
    const newestAge = Math.min(...ages);

    return {
      avgAge: avgAge / (1000 * 60), // Convert to minutes
      newestAge: newestAge / (1000 * 60) // Convert to minutes
    };
  }

  private displayResults(results: TestResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 DETECTION TEST RESULTS');
    console.log('='.repeat(80));

    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.name}`);
      console.log(`   Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
      
      if (result.success) {
        console.log(`   Tokens Found: ${result.tokenCount}`);
        console.log(`   Latency: ${result.latency}ms`);
        console.log(`   Avg Token Age: ${result.avgAgeMinutes.toFixed(1)} minutes`);
        console.log(`   Newest Token Age: ${result.newestAgeMinutes.toFixed(1)} minutes`);
        
        // Score the freshness
        const freshnessScore = this.calculateFreshnessScore(result);
        console.log(`   Freshness Score: ${freshnessScore}/100`);
      } else {
        console.log(`   Error: ${result.error}`);
      }
    });

    // Overall analysis
    const successfulTests = results.filter(r => r.success);
    if (successfulTests.length > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('📊 OVERALL ANALYSIS');
      console.log('-'.repeat(80));

      const bestLatency = successfulTests.reduce((best, current) => 
        current.latency < best.latency ? current : best
      );
      console.log(`🚀 Fastest Response: ${bestLatency.name} (${bestLatency.latency}ms)`);

      const bestFreshness = successfulTests.reduce((best, current) => 
        current.newestAgeMinutes < best.newestAgeMinutes ? current : best
      );
      console.log(`🆕 Freshest Tokens: ${bestFreshness.name} (${bestFreshness.newestAgeMinutes.toFixed(1)} min old)`);

      const mostTokens = successfulTests.reduce((best, current) => 
        current.tokenCount > best.tokenCount ? current : best
      );
      console.log(`📈 Most Tokens: ${mostTokens.name} (${mostTokens.tokenCount} tokens)`);

      // Recommendations
      console.log('\n🔧 RECOMMENDATIONS:');
      
      if (bestFreshness.newestAgeMinutes < 5) {
        console.log('✅ Token detection is getting very fresh tokens (< 5 minutes old)');
      } else if (bestFreshness.newestAgeMinutes < 30) {
        console.log('👍 Token detection is getting reasonably fresh tokens (< 30 minutes old)');
      } else {
        console.log('⚠️  Token detection needs improvement - tokens are too old');
      }

      if (bestLatency.latency < 1000) {
        console.log('✅ API response times are good (< 1 second)');
      } else {
        console.log('⚠️  Consider optimizing API calls or using faster endpoints');
      }

      // Specific recommendations
      if (bestFreshness.name === 'DexScreener Latest') {
        console.log('🎯 Focus on DexScreener Latest endpoint for freshest tokens');
      }
      
      if (bestLatency.name === 'Our DexScreener Client') {
        console.log('✅ Our current client implementation is performing well');
      } else {
        console.log('🔧 Consider optimizing our DexScreener client implementation');
      }
    }

    console.log('\n' + '='.repeat(80));
  }

  private calculateFreshnessScore(result: TestResult): number {
    if (!result.success) return 0;

    let score = 0;

    // Token count (25 points max)
    if (result.tokenCount >= 20) score += 25;
    else if (result.tokenCount >= 10) score += 20;
    else if (result.tokenCount >= 5) score += 15;
    else if (result.tokenCount >= 1) score += 10;

    // Average age (25 points max)
    if (result.avgAgeMinutes <= 30) score += 25;
    else if (result.avgAgeMinutes <= 60) score += 20;
    else if (result.avgAgeMinutes <= 120) score += 15;
    else if (result.avgAgeMinutes <= 300) score += 10;

    // Newest token age (25 points max)
    if (result.newestAgeMinutes <= 5) score += 25;
    else if (result.newestAgeMinutes <= 15) score += 20;
    else if (result.newestAgeMinutes <= 30) score += 15;
    else if (result.newestAgeMinutes <= 60) score += 10;

    // Latency (25 points max)
    if (result.latency <= 500) score += 25;
    else if (result.latency <= 1000) score += 20;
    else if (result.latency <= 2000) score += 15;
    else if (result.latency <= 5000) score += 10;

    return Math.min(100, score);
  }

  private saveResults(results: TestResult[]): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `detection-test-${timestamp}.json`;
      const filepath = `./logs/${filename}`;

      // Ensure logs directory exists
      if (!fs.existsSync('./logs')) {
        fs.mkdirSync('./logs', { recursive: true });
      }

      const data = {
        timestamp: new Date().toISOString(),
        results,
        summary: {
          successfulTests: results.filter(r => r.success).length,
          totalTests: results.length,
          averageLatency: results.filter(r => r.success).reduce((sum, r) => sum + r.latency, 0) / results.filter(r => r.success).length,
          bestFreshness: Math.min(...results.filter(r => r.success).map(r => r.newestAgeMinutes))
        }
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`💾 Results saved to: ${filepath}`);
    } catch (error: any) {
      console.error('❌ Error saving results:', error.message);
    }
  }
}

// Main execution
async function main() {
  const tester = new SimpleDetectionTest();
  
  try {
    await tester.runAllTests();
    console.log('\n✅ All tests completed!');
  } catch (error: any) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { SimpleDetectionTest };