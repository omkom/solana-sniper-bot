import { Config } from './core/config';
import { DryRunEngine } from './simulation/dry-run-engine';
import { RapidTokenAnalyzer } from './core/rapid-token-analyzer';
import { EducationalDashboard } from './monitoring/dashboard';

async function main() {
  try {
    const config = Config.getInstance();
    
    console.log('🎓 Starting Educational Token Analyzer with Rapid Detection');
    console.log('📚 This system is for learning purposes only - no real trading occurs');
    console.log('⚡ Enhanced with multi-DEX monitoring and rapid detection algorithms');
    
    // Initialize simulation engine
    const simulationEngine = new DryRunEngine();
    
    // Initialize rapid token analyzer
    const rapidAnalyzer = new RapidTokenAnalyzer(simulationEngine);
    
    // Initialize dashboard
    const dashboard = new EducationalDashboard(simulationEngine, undefined, undefined, undefined, rapidAnalyzer);
    
    // Set up event handlers
    setupEventHandlers(rapidAnalyzer, simulationEngine);
    
    // Start systems
    await rapidAnalyzer.startAnalyzing();
    await dashboard.start();
    
    console.log('🚀 Educational Token Analyzer with Rapid Detection is running!');
    console.log('📊 Dashboard available at: http://localhost:3000');
    console.log('⚡ Multi-DEX monitoring active');
    console.log('🔍 Real-time token detection enabled');
    
    // Log stats every 30 seconds
    setInterval(() => {
      logStats(rapidAnalyzer);
    }, 30000);
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down...');
      await rapidAnalyzer.stopAnalyzing();
      await dashboard.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down...');
      await rapidAnalyzer.stopAnalyzing();
      await dashboard.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Educational Token Analyzer:', error);
    process.exit(1);
  }
}

function setupEventHandlers(rapidAnalyzer: RapidTokenAnalyzer, simulationEngine: DryRunEngine) {
  // Rapid analyzer events
  rapidAnalyzer.on('tokenDetected', (tokenInfo) => {
    console.log(`🔍 Token detected: ${tokenInfo.symbol} from ${tokenInfo.metadata?.detectionSource}`);
  });
  
  rapidAnalyzer.on('viableTokenFound', ({ tokenInfo, securityAnalysis }) => {
    console.log(`✅ Viable token: ${tokenInfo.symbol} (Score: ${securityAnalysis.score})`);
  });
  
  rapidAnalyzer.on('honeypotDetected', (tokenInfo) => {
    console.log(`🍯 Honeypot detected: ${tokenInfo.symbol}`);
  });
  
  rapidAnalyzer.on('processingError', ({ tokenInfo, error }) => {
    console.error(`❌ Processing error for ${tokenInfo.symbol}:`, error.message);
  });
  
  rapidAnalyzer.on('analysisStarted', () => {
    console.log('🚀 Rapid analysis started');
  });
  
  rapidAnalyzer.on('analysisStopped', () => {
    console.log('⏹️ Rapid analysis stopped');
  });
  
  // Simulation engine events
  simulationEngine.on('trade', (trade) => {
    const emoji = trade.type === 'BUY' ? '💰' : '🔄';
    console.log(`${emoji} ${trade.type}: ${trade.symbol} - ${trade.amount.toFixed(4)} SOL`);
  });
  
  simulationEngine.on('positionOpened', (position) => {
    console.log(`📈 Position opened: ${position.symbol} - ${position.simulatedInvestment.toFixed(4)} SOL`);
  });
  
  simulationEngine.on('positionClosed', (position) => {
    const profitEmoji = (position.roi || 0) > 0 ? '💚' : '💔';
    console.log(`📊 Position closed: ${position.symbol} - ROI: ${(position.roi || 0).toFixed(2)}% ${profitEmoji}`);
  });
  
  simulationEngine.on('portfolioUpdate', (stats) => {
    if (stats.totalTrades > 0 && stats.totalTrades % 5 === 0) {
      console.log(`📊 Portfolio: ${stats.totalPortfolioValue.toFixed(4)} SOL | ROI: ${stats.totalROI.toFixed(2)}% | Trades: ${stats.totalTrades}`);
    }
  });
}

function logStats(rapidAnalyzer: RapidTokenAnalyzer) {
  const stats = rapidAnalyzer.getStats();
  
  console.log('\n📊 === RAPID DETECTION STATS ===');
  console.log(`🔍 Tokens detected: ${stats.totalDetected}`);
  console.log(`🔬 Tokens processed: ${stats.totalProcessed}`);
  console.log(`✅ Viable tokens: ${stats.totalViable}`);
  console.log(`💰 Positions taken: ${stats.totalPositions}`);
  console.log(`📈 Success rate: ${stats.successRate.toFixed(2)}%`);
  console.log(`⚡ Detection rate: ${stats.tokensPerMinute.toFixed(2)} tokens/min`);
  console.log(`⚠️ Errors: ${stats.errors}`);
  console.log(`📋 Queue size: ${stats.queueSize}`);
  console.log(`⏱️ Runtime: ${stats.runtimeMinutes.toFixed(2)} minutes`);
  console.log('=====================================\n');
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});