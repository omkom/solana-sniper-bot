import { Connection, PublicKey, VersionedTransactionResponse } from '@solana/web3.js';
import { ConnectionManager } from '../core/connection';
import { DexScreenerClient } from '../detection/dexscreener-client';
import axios from 'axios';

export class DetectionTester {
  private connection: Connection;
  private connectionManager: ConnectionManager;
  private dexScreenerClient: DexScreenerClient;
  private testResults: Map<string, any> = new Map();
  
  // Known recent token addresses for validation testing
  private static readonly TEST_TOKENS = [
    // Add known recent tokens here for comparison
  ];

  // Different API endpoints to test
  private static readonly API_ENDPOINTS = {
    DEXSCREENER_LATEST: 'https://api.dexscreener.com/latest/dex/tokens/solana',
    DEXSCREENER_PAIRS: 'https://api.dexscreener.com/latest/dex/pairs/solana',
    DEXSCREENER_SEARCH: 'https://api.dexscreener.com/latest/dex/search',
    BIRDEYE_NEW: 'https://public-api.birdeye.so/defi/tokenlist',
    JUPITER_TOKENS: 'https://token.jup.ag/strict',
    SOLSCAN_TOKENS: 'https://api.solscan.io/token/list',
  };

  constructor() {
    this.connectionManager = new ConnectionManager();
    this.connection = this.connectionManager.getConnection();
    this.dexScreenerClient = new DexScreenerClient();
    console.log('🧪 Detection Tester initialized');
  }

  async runComprehensiveTest(): Promise<any> {
    console.log('🚀 Starting comprehensive detection test...');
    
    const results = {
      timestamp: Date.now(),
      tests: {
        rpcMethods: await this.testRPCMethods(),
        apiEndpoints: await this.testAPIEndpoints(),
        webSocketSubscriptions: await this.testWebSocketSubscriptions(),
        commitmentLevels: await this.testCommitmentLevels(),
        tokenFreshness: await this.testTokenFreshness(),
        detectionSpeed: await this.testDetectionSpeed()
      },
      recommendations: [],
      summary: {}
    };

    // Analyze results and generate recommendations
    (results as any).recommendations = this.generateRecommendations(results.tests);
    results.summary = this.generateSummary(results.tests);

    console.log('✅ Comprehensive detection test completed');
    return results;
  }

  private async testRPCMethods(): Promise<any> {
    console.log('🔍 Testing RPC methods...');
    
    const tests: any = {
      getRecentBlockhash: null,
      getLatestBlockhash: null,
      getSignaturesForAddress: null,
      getProgramAccounts: null,
      getTokenAccountsByOwner: null,
      getRecentTransactions: null
    };

    try {
      // Test getLatestBlockhash
      const start1 = Date.now();
      const blockhash = await this.connection.getLatestBlockhash('processed');
      tests.getLatestBlockhash = {
        success: true,
        latency: Date.now() - start1,
        data: blockhash
      };
    } catch (error) {
      tests.getLatestBlockhash = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    try {
      // Test getSignaturesForAddress for Raydium program
      const start2 = Date.now();
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
        { limit: 10 }
      );
      tests.getSignaturesForAddress = {
        success: true,
        latency: Date.now() - start2,
        count: signatures.length,
        latestSignature: signatures[0]?.signature
      };
    } catch (error) {
      tests.getSignaturesForAddress = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    try {
      // Test getProgramAccounts for SPL Token program
      const start3 = Date.now();
      const accounts = await this.connection.getProgramAccounts(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        {
          commitment: 'processed',
          filters: [
            { dataSize: 165 }, // Token account size
          ],
          encoding: 'base64'
        }
      );
      tests.getProgramAccounts = {
        success: true,
        latency: Date.now() - start3,
        count: accounts.length
      };
    } catch (error) {
      tests.getProgramAccounts = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    return tests;
  }

  private async testAPIEndpoints(): Promise<any> {
    console.log('🌐 Testing API endpoints...');
    
    const tests: any = {};

    for (const [name, url] of Object.entries(DetectionTester.API_ENDPOINTS)) {
      try {
        const start = Date.now();
        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Educational-Token-Analyzer/1.0'
          }
        });
        
        tests[name] = {
          success: true,
          latency: Date.now() - start,
          status: response.status,
          dataSize: JSON.stringify(response.data).length,
          hasTokens: this.analyzeTokenData(response.data),
          sampleData: this.extractSampleTokens(response.data)
        };
      } catch (error: any) {
        tests[name] = {
          success: false,
          error: error.message,
          status: error.response?.status
        };
      }
    }

    // Test DexScreener with different parameters
    await this.testDexScreenerVariations(tests);

    return tests;
  }

  private async testDexScreenerVariations(tests: any): Promise<void> {
    const variations = [
      {
        name: 'DEXSCREENER_NEWEST',
        url: 'https://api.dexscreener.com/latest/dex/pairs/solana',
        params: { sort: 'pairCreatedAt', order: 'desc' }
      },
      {
        name: 'DEXSCREENER_VOLUME',
        url: 'https://api.dexscreener.com/latest/dex/pairs/solana',
        params: { sort: 'volume24h', order: 'desc' }
      },
      {
        name: 'DEXSCREENER_AGE_FILTER',
        url: 'https://api.dexscreener.com/latest/dex/search',
        params: { q: 'solana', rankBy: 'pairAge', order: 'asc' }
      }
    ];

    for (const variation of variations) {
      try {
        const start = Date.now();
        const response = await axios.get(variation.url, {
          params: variation.params,
          timeout: 10000
        });
        
        tests[variation.name] = {
          success: true,
          latency: Date.now() - start,
          tokenCount: response.data.pairs?.length || 0,
          newestToken: this.findNewestToken(response.data.pairs),
          avgAge: this.calculateAvgTokenAge(response.data.pairs)
        };
      } catch (error) {
        tests[variation.name] = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }

  private async testWebSocketSubscriptions(): Promise<any> {
    console.log('📡 Testing WebSocket subscriptions...');
    
    const tests: any = {
      programLogs: null,
      accountChanges: null,
      slotUpdates: null,
      allTransactions: null
    };

    // Test program logs subscription
    try {
      const start = Date.now();
      let receivedLogs = 0;
      
      const subscription = this.connection.onLogs(
        new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'), // Raydium
        (logs) => {
          receivedLogs++;
        },
        'processed'
      );

      // Wait 10 seconds to see how many logs we receive
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      await this.connection.removeOnLogsListener(subscription);
      
      tests.programLogs = {
        success: true,
        latency: Date.now() - start,
        logsReceived: receivedLogs,
        rate: receivedLogs / 10 // logs per second
      };
    } catch (error) {
      tests.programLogs = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    return tests;
  }

  private async testCommitmentLevels(): Promise<any> {
    console.log('⚡ Testing commitment levels...');
    
    const commitments = ['processed', 'confirmed', 'finalized'];
    const tests: any = {};

    for (const commitment of commitments) {
      try {
        const start = Date.now();
        const blockhash = await this.connection.getLatestBlockhash(commitment as any);
        
        tests[commitment] = {
          success: true,
          latency: Date.now() - start,
          slot: blockhash.lastValidBlockHeight
        };
      } catch (error) {
        tests[commitment] = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return tests;
  }

  private async testTokenFreshness(): Promise<any> {
    console.log('🆕 Testing token freshness...');
    
    const sources = [
      { name: 'DexScreener Latest', method: () => this.getDexScreenerLatest() },
      { name: 'Raydium New Pools', method: () => this.getRaydiumNewPools() },
      { name: 'Program Account Changes', method: () => this.getProgramAccountTokens() }
    ];

    const results: any = {};

    for (const source of sources) {
      try {
        const start = Date.now();
        const tokens = await source.method();
        
        results[source.name] = {
          success: true,
          latency: Date.now() - start,
          tokenCount: tokens.length,
          newestAge: tokens.length > 0 ? this.calculateTokenAge(tokens[0]) : null,
          avgAge: this.calculateAvgAge(tokens),
          sampleTokens: tokens.slice(0, 3)
        };
      } catch (error) {
        results[source.name] = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return results;
  }

  private async testDetectionSpeed(): Promise<any> {
    console.log('⚡ Testing detection speed...');
    
    const tests: any = {
      singleTokenLookup: null,
      batchTokenProcessing: null,
      realTimeDetection: null
    };

    // Test single token lookup speed
    try {
      const start = Date.now();
      await this.dexScreenerClient.getTokenDetails('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
      tests.singleTokenLookup = {
        success: true,
        latency: Date.now() - start
      };
    } catch (error) {
      tests.singleTokenLookup = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    // Test batch processing
    try {
      const start = Date.now();
      const tokens = await this.dexScreenerClient.getTrendingTokens();
      tests.batchTokenProcessing = {
        success: true,
        latency: Date.now() - start,
        tokenCount: tokens.length
      };
    } catch (error) {
      tests.batchTokenProcessing = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    return tests;
  }

  // Helper methods for data analysis
  private analyzeTokenData(data: any): boolean {
    if (!data) return false;
    
    // Check various possible token data structures
    return !!(
      data.tokens || 
      data.pairs || 
      data.data?.tokens || 
      data.data?.pairs ||
      Array.isArray(data)
    );
  }

  private extractSampleTokens(data: any): any[] {
    const tokens = data.tokens || data.pairs || data.data?.tokens || data.data?.pairs || data;
    
    if (!Array.isArray(tokens)) return [];
    
    return tokens.slice(0, 3).map(token => ({
      address: token.address || token.baseToken?.address || token.mint,
      symbol: token.symbol || token.baseToken?.symbol,
      age: token.pairCreatedAt ? Date.now() - new Date(token.pairCreatedAt).getTime() : null
    }));
  }

  private findNewestToken(pairs: any[]): any {
    if (!Array.isArray(pairs) || pairs.length === 0) return null;
    
    return pairs.reduce((newest, current) => {
      const currentTime = new Date(current.pairCreatedAt || 0).getTime();
      const newestTime = new Date(newest.pairCreatedAt || 0).getTime();
      return currentTime > newestTime ? current : newest;
    });
  }

  private calculateAvgTokenAge(pairs: any[]): number {
    if (!Array.isArray(pairs) || pairs.length === 0) return 0;
    
    const now = Date.now();
    const ages = pairs
      .filter(pair => pair.pairCreatedAt)
      .map(pair => now - new Date(pair.pairCreatedAt).getTime());
    
    return ages.length > 0 ? ages.reduce((sum, age) => sum + age, 0) / ages.length : 0;
  }

  private calculateTokenAge(token: any): number {
    if (!token.pairCreatedAt && !token.createdAt && !token.timestamp) return 0;
    
    const created = token.pairCreatedAt || token.createdAt || token.timestamp;
    return Date.now() - new Date(created).getTime();
  }

  private calculateAvgAge(tokens: any[]): number {
    if (!Array.isArray(tokens) || tokens.length === 0) return 0;
    
    const ages = tokens.map(token => this.calculateTokenAge(token));
    return ages.reduce((sum, age) => sum + age, 0) / ages.length;
  }

  // Data fetching methods for testing
  private async getDexScreenerLatest(): Promise<any[]> {
    const response = await axios.get('https://api.dexscreener.com/latest/dex/pairs/solana', {
      params: { sort: 'pairCreatedAt', order: 'desc', limit: 20 }
    });
    
    return response.data.pairs || [];
  }

  private async getRaydiumNewPools(): Promise<any[]> {
    // Get recent signatures from Raydium program
    const signatures = await this.connection.getSignaturesForAddress(
      new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
      { limit: 20 }
    );

    const tokens = [];
    
    for (const sig of signatures.slice(0, 5)) { // Limit to avoid rate limits
      try {
        const tx = await this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });
        
        if (tx?.meta?.postTokenBalances) {
          tokens.push({
            signature: sig.signature,
            timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
            tokens: tx.meta.postTokenBalances.map(balance => balance.mint)
          });
        }
      } catch (error) {
        // Skip failed transactions
      }
    }
    
    return tokens;
  }

  private async getProgramAccountTokens(): Promise<any[]> {
    // This is a simplified version - in practice you'd want more sophisticated filtering
    const accounts = await this.connection.getProgramAccounts(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      {
        commitment: 'processed',
        filters: [{ dataSize: 165 }],
        encoding: 'base64'
      }
    );

    return accounts.slice(0, 10).map(account => ({
      address: account.pubkey.toString(),
      timestamp: Date.now() // This would need to be derived from actual creation time
    }));
  }

  private generateRecommendations(tests: any): string[] {
    const recommendations: string[] = [];

    // Analyze RPC performance
    if (tests.commitmentLevels?.processed?.latency < tests.commitmentLevels?.confirmed?.latency) {
      recommendations.push('Use "processed" commitment for faster responses');
    }

    // Analyze API endpoints
    const apiTests = tests.apiEndpoints;
    const fastestAPI = Object.entries(apiTests)
      .filter(([_, test]: [string, any]) => test.success)
      .sort(([_, a]: [string, any], [__, b]: [string, any]) => a.latency - b.latency)[0];
    
    if (fastestAPI) {
      recommendations.push(`Fastest API: ${fastestAPI[0]} (${(fastestAPI[1] as any).latency}ms)`);
    }

    // Analyze token freshness
    const freshnessTests = tests.tokenFreshness;
    const freshestSource = Object.entries(freshnessTests)
      .filter(([_, test]: [string, any]) => test.success && test.newestAge !== null)
      .sort(([_, a]: [string, any], [__, b]: [string, any]) => a.newestAge - b.newestAge)[0];
    
    if (freshestSource) {
      recommendations.push(`Freshest tokens from: ${freshestSource[0]}`);
    }

    // WebSocket recommendations
    if (tests.webSocketSubscriptions?.programLogs?.rate > 0) {
      recommendations.push(`WebSocket receiving ${tests.webSocketSubscriptions.programLogs.rate} logs/sec`);
    }

    return recommendations;
  }

  private generateSummary(tests: any): any {
    return {
      rpcHealth: Object.values(tests.rpcMethods || {}).filter((test: any) => test?.success).length,
      apiHealth: Object.values(tests.apiEndpoints || {}).filter((test: any) => test?.success).length,
      webSocketHealth: Object.values(tests.webSocketSubscriptions || {}).filter((test: any) => test?.success).length,
      optimalCommitment: this.findOptimalCommitment(tests.commitmentLevels),
      fastestDetectionMethod: this.findFastestDetection(tests)
    };
  }

  private findOptimalCommitment(commitmentTests: any): string {
    if (!commitmentTests) return 'processed';
    
    const successful = Object.entries(commitmentTests)
      .filter(([_, test]: [string, any]) => test?.success)
      .sort(([_, a]: [string, any], [__, b]: [string, any]) => a.latency - b.latency);
    
    return successful[0]?.[0] || 'processed';
  }

  private findFastestDetection(tests: any): string {
    // Logic to determine fastest detection method based on all test results
    const methods = [];
    
    if (tests.webSocketSubscriptions?.programLogs?.success) {
      methods.push({ name: 'WebSocket Program Logs', speed: tests.webSocketSubscriptions.programLogs.rate });
    }
    
    if (tests.detectionSpeed?.singleTokenLookup?.success) {
      methods.push({ name: 'Direct API Lookup', speed: 1000 / tests.detectionSpeed.singleTokenLookup.latency });
    }
    
    const fastest = methods.sort((a, b) => b.speed - a.speed)[0];
    return fastest?.name || 'Unknown';
  }
}