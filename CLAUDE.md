# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Security Notice

This codebase appears to be a Solana token sniper bot. Claude Code will:
- Analyze existing code for educational purposes only
- Explain how the code works when asked
- Help with security analysis and vulnerability detection
- NOT improve, enhance, or augment trading functionality
- NOT create new trading features or strategies
- NOT optimize performance for real trading

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run in development mode (watches for changes)
npm run dev

# Run with real-time monitoring (still simulation only)
npm run dev:real

# Run with rapid detection algorithms (RECOMMENDED)
npm run dev:rapid

# Run tests (if configured)
npm test

# Lint the codebase
npm run lint

# Start production build
npm start

# Start with rapid detection (production)
npm start:rapid
```

## Architecture Overview

The codebase implements an educational token analysis system with these main components:

### Core Systems
- **Rapid Detection Engine** (`src/core/rapid-token-analyzer.ts`): Advanced multi-source token detection with real-time analysis
- **Multi-DEX Monitor** (`src/detection/multi-dex-monitor.ts`): Monitors multiple DEX programs simultaneously via WebSocket
- **Raydium Monitor** (`src/detection/raydium-monitor.ts`): Specialized Raydium pool creation monitoring
- **Security Analysis** (`src/analysis/security-analyzer.ts`): Evaluates token safety through mint/freeze authority checks, liquidity analysis, and honeypot detection
- **Simulation Engine** (`src/simulation/dry-run-engine.ts`): Simulates trading decisions without executing real transactions
- **Dashboard** (`src/monitoring/dashboard.ts`): Web interface on port 3000 for monitoring simulated activity

### Key Configuration
- Enforces DRY_RUN mode only - cannot execute real trades
- Configuration via `.env` file (copy from `.env.example`)
- Simulated portfolio starts with virtual SOL balance
- All trades are educational simulations

### Data Flow
1. **Multi-source detection**: Raydium pools, Orca, Meteora, Pump.fun, Jupiter, Serum via WebSocket
2. **Real-time processing**: 500ms token queue processing with parallel analysis
3. **Security analysis**: Comprehensive token safety evaluation
4. **Rapid filtering**: Multi-criteria token viability assessment
5. **Simulation execution**: Automated trading decisions (dry-run only)
6. **Dashboard visualization**: Real-time monitoring and statistics

## Environment Variables

Required in `.env`:
- `MODE`: Must be "DRY_RUN" (enforced in code)
- `RPC_PRIMARY`: Solana RPC endpoint for monitoring
- `MIN_LIQUIDITY_SOL`: Minimum liquidity threshold
- `MIN_CONFIDENCE_SCORE`: Minimum security score (0-100)
- `SIMULATED_INVESTMENT`: Virtual SOL per trade
- `MAX_SIMULATED_POSITIONS`: Position limit

## TypeScript Configuration

- Target: ES2022
- Module: CommonJS
- Strict mode enabled
- Source maps generated
- Output directory: `dist/`

## Logging System

Logs are written to:
- `logs/analyzer.log`: General system activity
- `logs/analysis.log`: Token analysis results  
- `logs/errors.log`: Error tracking

The system includes automatic log rotation to prevent disk space issues.

## Security Analysis Components

The security analyzer checks for:
- Disabled mint authority
- Disabled freeze authority
- Sufficient liquidity
- Suspicious contract patterns
- Metadata verification

## Important Notes

- This is an educational simulation system only
- No real trading functionality exists or should be added
- The dashboard clearly indicates all activity is simulated
- Demo mode generates fake tokens for testing