Core Architecture Files

  1. Consolidated Token Detector

  Objectives : Multi-source token detection aggregator combining blockchain,
  DexScreener, and WebSocket monitoring. A unified token detection system that:
  - Aggregates tokens from multiple sources (DexScreener WebSocket, blockchain
  scanning, API polling)
  - Implements rate limiting and caching to prevent API overload
  - Filters tokens by age (<10 minutes), liquidity (>1000 SOL), confidence score (>5)
  - Emits 'tokensDetected' and 'detectionResult' events
  - Supports configurable sources, scan intervals, batch processing
  - Includes health checks and status reporting
  - Integrates with ConsolidatedApiService for data fetching
  - Uses EventEmitter pattern for real-time token detection
  - Implements exponential backoff for failed requests

  2. Enhanced Token Detection

  Objectives : Advanced detection algorithms with honeypot/rug detection and momentum
  analysis. Advanced token detection engine that:
  - Implements AI-powered momentum detection algorithms
  - Performs honeypot and rug pull risk analysis
  - Calculates token confidence scores using multiple metrics
  - Analyzes holder distribution and liquidity patterns
  - Detects suspicious trading patterns and bot activity
  - Provides detailed token risk assessments
  - Supports batch processing of token candidates
  - Integrates security scoring with trading decisions
  - Uses machine learning for pattern recognition
  - Exports EnhancedTokenDetection class with analyze() method

  3. Request Manager

  Objectives : Centralized API request coordination with rate limiting and failover.
  A centralized API request manager that:
  - Implements intelligent rate limiting across all APIs
  - Provides request queuing with priority levels
  - Handles failover between multiple RPC endpoints
  - Manages API key rotation and usage tracking
  - Implements exponential backoff for failed requests
  - Provides caching layer to reduce API calls
  - Monitors API health and response times
  - Supports request batching for efficiency
  - Exports RequestManager singleton with queue(), get(), post() methods
  - Integrates with all API services for unified request handling

  4. API Gateway

  Objectives : Unified gateway for all external API communications with load balancing.
  A Unified API gateway that:
  - Routes requests to appropriate API services (DexScreener, Solscan, Jupiter)
  - Implements load balancing across multiple endpoints
  - Provides unified response formatting and error handling
  - Manages authentication and API key distribution
  - Implements circuit breaker pattern for failing APIs
  - Provides request/response logging and monitoring
  - Supports API versioning and endpoint discovery
  - Caches frequently accessed data
  - Exports ApiGateway class with route(), health(), metrics() methods
  - Integrates with RequestManager for coordinated API access

  Detection & Monitoring Systems

  5. Multi-DEX Monitor
  Objectives : Real-time monitoring of Raydium, Orca, Meteora, Pump.fun, Jupiter, and Serum.
  A Multi-DEX monitoring system that:
  - Monitors token launches on Raydium, Orca, Meteora, Pump.fun, Jupiter, Serum
  - Uses WebSocket connections for real-time pool creation events
  - Implements DEX-specific parsing for different pool formats
  - Detects liquidity additions and first trades
  - Calculates cross-DEX arbitrage opportunities
  - Tracks token migrations between DEXes
  - Provides unified token event formatting
  - Supports selective DEX enabling/disabling
  - Exports MultiDexMonitor class with start(), stop(), subscribe() methods
  - Emits 'newPool', 'liquidityAdded', 'tokenMigration' events

  6. Pump Detector 

  Objectives : Advanced momentum and pump detection using volume/price analysis.
  A Pump and momentum detection system that:
  - Analyzes price momentum using multiple timeframes (1m, 5m, 15m)
  - Detects volume spikes and unusual trading patterns
  - Calculates pump probability scores using statistical analysis
  - Identifies coordinated buying/selling activity
  - Tracks social media sentiment correlation
  - Implements machine learning for pump pattern recognition
  - Provides early warning signals for potential pumps
  - Supports configurable sensitivity levels
  - Exports PumpDetector class with analyze(), getPumpScore() methods
  - Emits 'pumpDetected', 'momentumShift', 'volumeSpike' events

  7. Real Token Monitor

  Objectives : Live blockchain scanning for new token mints and pool creations.
  A Real-time blockchain token monitor that:
  - Scans Solana blockchain for new token mint transactions
  - Monitors program instructions for pool creation events
  - Parses transaction logs to extract token metadata
  - Detects token launches within seconds of creation
  - Filters out test tokens and known scams
  - Provides holder distribution analysis from launch
  - Tracks initial liquidity and trading activity
  - Supports multiple RPC endpoints for reliability
  - Exports RealTokenMonitor class with start(), scan(), parse() methods
  - Emits 'newTokenMint', 'poolCreated', 'firstTrade' events

  8. Raydium Monitor

  Objectives : (Specialized Raydium pool monitoring with advanced pool analysis.)
a Specialized Raydium monitoring system that:
  - Connects directly to Raydium's WebSocket feeds
  - Monitors new pool creation events in real-time
  - Analyzes pool parameters (fees, liquidity, ratios)
  - Tracks LP token distribution and lock periods
  - Detects rug pull indicators (LP removals, owner actions)
  - Calculates optimal entry/exit points
  - Provides pool health scoring
  - Monitors volume and trader count changes
  - Exports RaydiumMonitor class with connect(), analyzePools() methods
  - Emits 'newRaydiumPool', 'liquidityChange', 'suspiciousActivity' events

  Trading & Simulation Systems

  9. Unified Engine

  Objectives: Main simulation engine orchestrating all trading logic with advanced
  position management.

  A Unified engine that:
  - Orchestrates all trading operations in DRY_RUN mode only
  - Manages portfolio with intelligent position sizing
  - Implements advanced exit strategies (trailing stops, profit targets)
  - Handles multiple concurrent positions up to configured limits
  - Provides real-time P&L calculation and tracking
  - Implements risk management (stop losses, position limits)
  - Supports different trading strategies (momentum, mean reversion)
  - Generates detailed trading performance metrics
  - Exports UnifiedEngine class with trade(), manage(), analyze() methods
  - Integrates with all detection and monitoring systems
  - Simulates all trading operations without real transactions
  - Maintains virtual portfolio with realistic pricing
  - Implements slippage calculation and gas fee simulation
  - Tracks virtual balance and position values
  - Provides comprehensive trade logging and analysis
  - Supports backtesting with historical data
  - Generates performance reports and statistics
  - Enforces safety boundaries (DRY_RUN mode only)
  - Exports DryRunEngine class with simulate(), backtest(), report() methods
  - Ensures no real funds can ever be accessed or traded

  11. Enhanced Transaction Workflows

  Objectives : (Advanced transaction logic with MEV protection and optimal routing.)
an advanced transaction workflows that:
  - Implements complex multi-step trading workflows (buy -> hold -> sell)
  - Provides MEV protection and sandwich attack prevention
  - Optimizes transaction routing across multiple DEXes
  - Handles transaction failures with intelligent retry logic
  - Implements priority fee optimization for faster execution
  - Supports partial fills and order splitting
  - Provides transaction status tracking and confirmation
  - Manages slippage protection and price impact calculation
  - Exports TransactionWorkflow class with execute(), optimize(), track() methods
  - All transactions remain in simulation mode for safety

  Data & Analysis Systems

  12. DexScreener Types

  Objectives : (TypeScript interfaces for DexScreener API responses and WebSocket data.)
a complete TypeScript definitions that:
  - Defines interfaces for all DexScreener API responses
  - Includes WebSocket event types and data structures
  - Provides token pair information and metadata types
  - Defines price, volume, and liquidity data interfaces
  - Includes pool information and DEX-specific data types
  - Supports both REST API and WebSocket response formats
  - Provides type guards for runtime validation
  - Includes error response and status code types
  - Exports comprehensive DexScreenerTypes namespace
  - Ensures type safety for all DexScreener integrations

  13. Simulation Engine Types

  Objectives : (Type definitions for all simulation and trading engine components.)
a simulation engine type definitions that:
  - Defines all trading position and portfolio interfaces
  - Includes order types (market, limit, stop-loss, take-profit)
  - Provides trade execution result and status types
  - Defines risk management and position sizing interfaces
  - Includes performance metrics and analytics types
  - Supports strategy configuration and parameter types
  - Provides simulation state and engine status interfaces
  - Defines event types for real-time updates
  - Exports SimulationTypes namespace with all trading types
  - Ensures type safety across all simulation components