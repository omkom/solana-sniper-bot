# Monitoring & Logs - Sniper Bot

## 1. Architecture de Monitoring

### 1.1 Vue d'ensemble
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Bot Core      │────▶│   Metrics       │────▶│   Dashboard     │
│                 │     │   Collector     │     │   (Express)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Logger        │     │   Time Series   │     │   Alerts        │
│   (Winston)     │     │   (Redis)       │     │   Manager       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 1.2 Configuration Winston
```typescript
// src/monitoring/logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    trade: 3,
    debug: 4,
    verbose: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    trade: 'blue',
    debug: 'white',
    verbose: 'gray'
  }
};

export const logger = winston.createLogger({
  levels: logLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    // Console avec couleurs
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      level: process.env.LOG_LEVEL || 'info'
    }),
    
    // Fichier rotatif pour tous les logs
    new DailyRotateFile({
      filename: 'logs/bot-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '100m',
      maxFiles: '30d',
      level: 'verbose'
    }),
    
    // Fichier séparé pour les trades
    new DailyRotateFile({
      filename: 'logs/trades-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '90d',
      level: 'trade',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),
    
    // Fichier pour les erreurs
    new winston.transports.File({
      filename: 'logs/errors.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

winston.addColors(logLevels.colors);
```

## 2. Métriques et KPIs

### 2.1 Collecteur de métriques
```typescript
// src/monitoring/metrics-collector.ts
export class MetricsCollector {
  private metrics: Map<string, Metric> = new Map();
  private redis: RedisClient;
  
  constructor() {
    this.redis = new RedisClient({
      url: process.env.REDIS_URL
    });
    
    this.initializeMetrics();
  }
  
  private initializeMetrics(): void {
    // Trading metrics
    this.registerMetric('trades.total', 'counter');
    this.registerMetric('trades.successful', 'counter');
    this.registerMetric('trades.failed', 'counter');
    this.registerMetric('trades.volume.sol', 'gauge');
    
    // Performance metrics
    this.registerMetric('roi.total', 'gauge');
    this.registerMetric('roi.daily', 'gauge');
    this.registerMetric('roi.weekly', 'gauge');
    this.registerMetric('positions.active', 'gauge');
    this.registerMetric('positions.profitable', 'gauge');
    
    // System metrics
    this.registerMetric('detection.latency', 'histogram');
    this.registerMetric('transaction.latency', 'histogram');
    this.registerMetric('rpc.latency', 'histogram');
    this.registerMetric('websocket.reconnects', 'counter');
    
    // Risk metrics
    this.registerMetric('risk.exposure', 'gauge');
    this.registerMetric('risk.maxdrawdown', 'gauge');
    this.registerMetric('risk.sharpe', 'gauge');
  }
  
  increment(metricName: string, value: number = 1): void {
    const metric = this.metrics.get(metricName);
    if (metric?.type === 'counter') {
      metric.value += value;
      this.publishMetric(metricName, metric.value);
    }
  }
  
  gauge(metricName: string, value: number): void {
    const metric = this.metrics.get(metricName);
    if (metric?.type === 'gauge') {
      metric.value = value;
      this.publishMetric(metricName, value);
    }
  }
  
  histogram(metricName: string, value: number): void {
    const metric = this.metrics.get(metricName);
    if (metric?.type === 'histogram') {
      metric.values.push(value);
      this.publishHistogram(metricName, metric.values);
    }
  }
  
  private async publishMetric(name: string, value: number): Promise<void> {
    const timestamp = Date.now();
    const key = `metrics:${name}:${Math.floor(timestamp / 60000)}`; // Par minute
    
    await this.redis.zadd(key, timestamp, JSON.stringify({ value, timestamp }));
    await this.redis.expire(key, 86400); // 24h TTL
  }
}
```

### 2.2 Tracking des trades
```typescript
// src/monitoring/trade-tracker.ts
export class TradeTracker {
  private logger: Logger;
  private metrics: MetricsCollector;
  
  async logTrade(trade: Trade): Promise<void> {
    // Log structuré
    this.logger.log('trade', 'Trade executed', {
      id: trade.id,
      type: trade.type,
      token: {
        mint: trade.mint,
        symbol: trade.symbol,
        name: trade.name
      },
      amounts: {
        sol: trade.solAmount,
        tokens: trade.tokenAmount,
        price: trade.price
      },
      timing: {
        detected: trade.detectedAt,
        executed: trade.executedAt,
        latency: trade.executedAt - trade.detectedAt
      },
      transaction: {
        signature: trade.signature,
        slot: trade.slot,
        fee: trade.fee
      },
      mode: trade.mode // DRY_RUN ou LIVE
    });
    
    // Métriques
    this.metrics.increment('trades.total');
    this.metrics.gauge('trades.volume.sol', trade.solAmount);
    this.metrics.histogram('detection.latency', trade.executedAt - trade.detectedAt);
    
    // Alerte si latence élevée
    if (trade.executedAt - trade.detectedAt > 10000) {
      this.logger.warn('High trade latency detected', {
        tradeId: trade.id,
        latency: trade.executedAt - trade.detectedAt
      });
    }
  }
  
  async logPosition(position: Position): Promise<void> {
    const roi = this.calculateROI(position);
    
    this.logger.log('info', 'Position update', {
      mint: position.mint,
      status: position.status,
      roi: roi,
      pnl: position.currentValue - position.investedAmount,
      duration: Date.now() - position.entryTime,
      strategy: position.strategy
    });
    
    // Mise à jour métriques
    if (position.status === 'CLOSED') {
      if (roi > 0) {
        this.metrics.increment('positions.profitable');
      }
      
      this.recordTradeResult({
        roi,
        duration: position.exitTime! - position.entryTime,
        strategy: position.strategy
      });
    }
  }
}
```

## 3. Dashboard en Temps Réel

### 3.1 API Express
```typescript
// src/monitoring/dashboard-api.ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

export class DashboardAPI {
  private app: express.Application;
  private server: any;
  private io: Server;
  
  constructor(private bot: SniperBot) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: { origin: '*' }
    });
    
    this.setupRoutes();
    this.setupWebSocket();
  }
  
  private setupRoutes(): void {
    // Servir le dashboard HTML
    this.app.use(express.static('public'));
    
    // API endpoints
    this.app.get('/api/stats', (req, res) => {
      res.json(this.bot.getStats());
    });
    
    this.app.get('/api/positions', (req, res) => {
      res.json(this.bot.getPositions());
    });
    
    this.app.get('/api/trades/:limit?', (req, res) => {
      const limit = parseInt(req.params.limit) || 100;
      res.json(this.bot.getRecentTrades(limit));
    });
    
    this.app.get('/api/metrics/:metric/:period', async (req, res) => {
      const { metric, period } = req.params;
      const data = await this.bot.getMetricHistory(metric, period);
      res.json(data);
    });
    
    this.app.get('/api/logs/:level?', (req, res) => {
      const level = req.params.level || 'info';
      res.json(this.bot.getRecentLogs(level, 100));
    });
  }
  
  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('Dashboard client connected');
      
      // Envoyer état initial
      socket.emit('stats', this.bot.getStats());
      socket.emit('positions', this.bot.getPositions());
      
      // S'abonner aux mises à jour
      this.bot.on('trade', (trade) => {
        socket.emit('trade', trade);
      });
      
      this.bot.on('statsUpdate', (stats) => {
        socket.emit('stats', stats);
      });
      
      this.bot.on('positionUpdate', (position) => {
        socket.emit('positionUpdate', position);
      });
    });
  }
  
  start(port: number = 3000): void {
    this.server.listen(port, () => {
      console.log(`Dashboard running on http://localhost:${port}`);
    });
  }
}
```

### 3.2 Interface Dashboard (HTML)
```html
<!-- public/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Solana Sniper Bot Dashboard</title>
  <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #1a1a1a;
      color: #fff;
      margin: 0;
      padding: 20px;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }
    
    .card {
      background: #2a2a2a;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    
    .metric {
      font-size: 24px;
      font-weight: bold;
      color: #4CAF50;
    }
    
    .positive { color: #4CAF50; }
    .negative { color: #f44336; }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #444;
    }
    
    .status-active { color: #2196F3; }
    .status-closed { color: #9E9E9E; }
    .status-profitable { color: #4CAF50; }
    .status-loss { color: #f44336; }
  </style>
</head>
<body>
  <h1>Solana Sniper Bot Dashboard</h1>
  
  <div class="grid">
    <!-- Stats Cards -->
    <div class="card">
      <h3>Total ROI</h3>
      <div class="metric" id="totalROI">0%</div>
    </div>
    
    <div class="card">
      <h3>Active Positions</h3>
      <div class="metric" id="activePositions">0</div>
    </div>
    
    <div class="card">
      <h3>Win Rate</h3>
      <div class="metric" id="winRate">0%</div>
    </div>
    
    <div class="card">
      <h3>24h Volume</h3>
      <div class="metric" id="volume24h">0 SOL</div>
    </div>
  </div>
  
  <!-- ROI Chart -->
  <div class="card" style="margin-top: 20px;">
    <h3>ROI History</h3>
    <canvas id="roiChart"></canvas>
  </div>
  
  <!-- Positions Table -->
  <div class="card" style="margin-top: 20px;">
    <h3>Active Positions</h3>
    <table id="positionsTable">
      <thead>
        <tr>
          <th>Token</th>
          <th>Investment</th>
          <th>Current Value</th>
          <th>ROI</th>
          <th>Age</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
  
  <!-- Recent Trades -->
  <div class="card" style="margin-top: 20px;">
    <h3>Recent Trades</h3>
    <div id="tradesFeed"></div>
  </div>
  
  <script>
    const socket = io();
    
    // Update stats
    socket.on('stats', (stats) => {
      document.getElementById('totalROI').textContent = stats.totalROI.toFixed(2) + '%';
      document.getElementById('activePositions').textContent = stats.activePositions;
      document.getElementById('winRate').textContent = stats.winRate.toFixed(1) + '%';
      document.getElementById('volume24h').textContent = stats.volume24h.toFixed(3) + ' SOL';
      
      // Color code ROI
      const roiElement = document.getElementById('totalROI');
      roiElement.className = stats.totalROI >= 0 ? 'metric positive' : 'metric negative';
    });
    
    // Update positions table
    socket.on('positions', (positions) => {
      const tbody = document.querySelector('#positionsTable tbody');
      tbody.innerHTML = '';
      
      positions.forEach(pos => {
        const row = tbody.insertRow();
        row.innerHTML = `
          <td>${pos.symbol}</td>
          <td>${pos.investedSol.toFixed(3)} SOL</td>
          <td>${pos.currentValueSol.toFixed(3)} SOL</td>
          <td class="${pos.roi >= 0 ? 'positive' : 'negative'}">${pos.roi.toFixed(1)}%</td>
          <td>${formatDuration(pos.age)}</td>
          <td class="status-${pos.status.toLowerCase()}">${pos.status}</td>
        `;
      });
    });
    
    // Trade feed
    socket.on('trade', (trade) => {
      const feed = document.getElementById('tradesFeed');
      const tradeElement = document.createElement('div');
      tradeElement.style.marginBottom = '10px';
      tradeElement.innerHTML = `
        <strong>${new Date(trade.timestamp).toLocaleTimeString()}</strong> - 
        ${trade.type} ${trade.symbol} - 
        ${trade.amount} SOL - 
        <span class="${trade.type === 'BUY' ? 'positive' : 'negative'}">
          ${trade.type === 'BUY' ? '↗' : '↘'}
        </span>
      `;
      
      feed.insertBefore(tradeElement, feed.firstChild);
      
      // Keep only last 20 trades
      while (feed.children.length > 20) {
        feed.removeChild(feed.lastChild);
      }
    });
    
    // ROI Chart
    const ctx = document.getElementById('roiChart').getContext('2d');
    const roiChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'ROI %',
          data: [],
          borderColor: '#4CAF50',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#fff' }
          },
          x: {
            ticks: { color: '#fff' }
          }
        }
      }
    });
    
    // Update chart periodically
    setInterval(async () => {
      const response = await fetch('/api/metrics/roi/1h');
      const data = await response.json();
      
      roiChart.data.labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
      roiChart.data.datasets[0].data = data.map(d => d.value);
      roiChart.update();
    }, 5000);
    
    function formatDuration(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    }
  </script>
</body>
</html>
```

## 4. Alertes et Notifications

### 4.1 Système d'alertes
```typescript
// src/monitoring/alerts.ts
export class AlertManager {
  private alertRules: AlertRule[] = [];
  private channels: AlertChannel[] = [];
  
  constructor() {
    this.setupDefaultRules();
    this.setupChannels();
  }
  
  private setupDefaultRules(): void {
    // ROI alerts
    this.addRule({
      name: 'High ROI Position',
      condition: (data) => data.position?.roi > 500,
      severity: 'INFO',
      message: (data) => `Position ${data.position.symbol} reached ${data.position.roi}% ROI!`
    });
    
    // Risk alerts
    this.addRule({
      name: 'Stop Loss Triggered',
      condition: (data) => data.trade?.type === 'SELL' && data.trade.reason === 'STOP_LOSS',
      severity: 'WARNING',
      message: (data) => `Stop loss triggered for ${data.trade.symbol}`
    });
    
    this.addRule({
      name: 'Daily Loss Limit',
      condition: (data) => data.stats?.dailyPnL < -0.1,
      severity: 'HIGH',
      message: () => 'Daily loss limit approaching (-10%)'
    });
    
    // System alerts
    this.addRule({
      name: 'High RPC Latency',
      condition: (data) => data.metrics?.rpcLatency > 1000,
      severity: 'WARNING',
      message: (data) => `RPC latency high: ${data.metrics.rpcLatency}ms`
    });
    
    this.addRule({
      name: 'WebSocket Disconnection',
      condition: (data) => data.event === 'websocket_disconnected',
      severity: 'HIGH',
      message: () => 'WebSocket connection lost'
    });
    
    // Security alerts
    this.addRule({
      name: 'Suspicious Activity',
      condition: (data) => data.security?.suspiciousActivity,
      severity: 'CRITICAL',
      message: (data) => `Security alert: ${data.security.description}`
    });
  }
  
  async checkRules(data: any): Promise<void> {
    for (const rule of this.alertRules) {
      if (rule.condition(data)) {
        await this.sendAlert({
          rule: rule.name,
          severity: rule.severity,
          message: rule.message(data),
          timestamp: new Date(),
          data
        });
      }
    }
  }
}

interface AlertRule {
  name: string;
  condition: (data: any) => boolean;
  severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  message: (data: any) => string;
}
```

## 5. Mode Verbose

### 5.1 Configuration logs détaillés
```typescript
// src/monitoring/verbose-logger.ts
export class VerboseLogger {
  private enabled: boolean;
  
  constructor() {
    this.enabled = process.env.LOG_LEVEL === 'verbose';
  }
  
  logTokenDetection(token: TokenInfo): void {
    if (!this.enabled) return;
    
    logger.verbose('🔍 NEW TOKEN DETECTED', {
      timestamp: new Date().toISOString(),
      detection: {
        source: token.source,
        latency: `${Date.now() - token.createdAt}ms`,
        signature: token.signature
      },
      token: {
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        supply: token.supply,
        decimals: token.decimals
      },
      liquidity: {
        sol: token.liquiditySol,
        usd: token.liquidityUSD,
        pool: token.poolAddress
      },
      metadata: token.metadata,
      raw: token.raw // Données brutes pour debug
    });
  }
  
  logFilteringProcess(token: string, filters: FilterResult[]): void {
    if (!this.enabled) return;
    
    logger.verbose('🔍 FILTERING PROCESS', {
      token,
      totalScore: filters.reduce((sum, f) => sum + f.score, 0),
      filters: filters.map(f => ({
        name: f.name,
        passed: f.passed,
        score: f.score,
        details: f.details,
        duration: f.duration
      })),
      decision: filters.every(f => f.passed) ? 'PASS' : 'REJECT'
    });
  }
  
  logTradeExecution(params: TradeParams, steps: TradeStep[]): void {
    if (!this.enabled) return;
    
    logger.verbose('💰 TRADE EXECUTION', {
      params: {
        token: params.token,
        type: params.type,
        amount: params.amount,
        slippage: params.slippage
      },
      steps: steps.map(step => ({
        name: step.name,
        status: step.status,
        duration: `${step.duration}ms`,
        details: step.details,
        error: step.error
      })),
      timeline: {
        start: steps[0]?.timestamp,
        end: steps[steps.length - 1]?.timestamp,
        total: `${steps.reduce((sum, s) => sum + s.duration, 0)}ms`
      }
    });
  }
}
```

## 6. Performance Monitoring

### 6.1 Profiling
```typescript
// src/monitoring/profiler.ts
export class PerformanceProfiler {
  private timers: Map<string, number> = new Map();
  private samples: Map<string, number[]> = new Map();
  
  startTimer(operation: string): void {
    this.timers.set(operation, performance.now());
  }
  
  endTimer(operation: string): number {
    const start = this.timers.get(operation);
    if (!start) return 0;
    
    const duration = performance.now() - start;
    this.timers.delete(operation);
    
    // Enregistrer échantillon
    const samples = this.samples.get(operation) || [];
    samples.push(duration);
    if (samples.length > 1000) samples.shift(); // Garder 1000 derniers
    this.samples.set(operation, samples);
    
    // Log si trop lent
    const threshold = this.getThreshold(operation);
    if (duration > threshold) {
      logger.warn(`Slow operation detected: ${operation} took ${duration.toFixed(2)}ms`);
    }
    
    return duration;
  }
  
  getStats(operation: string): OperationStats {
    const samples = this.samples.get(operation) || [];
    if (samples.length === 0) return null;
    
    const sorted = [...samples].sort((a, b) => a - b);
    
    return {
      count: samples.length,
      mean: samples.reduce((a, b) => a + b, 0) / samples.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: sorted[0],
      max: sorted[sorted.length - 1]
    };
  }
  
  private getThreshold(operation: string): number {
    const thresholds = {
      'token.detection': 100,
      'token.filtering': 500,
      'trade.execution': 2000,
      'rpc.call': 1000,
      'websocket.message': 50
    };
    
    return thresholds[operation] || 1000;
  }
}
```

## 7. Export et Analyse

### 7.1 Export des données
```typescript
// src/monitoring/data-export.ts
export class DataExporter {
  async exportTrades(startDate: Date, endDate: Date, format: 'csv' | 'json'): Promise<string> {
    const trades = await this.getTrades(startDate, endDate);
    
    if (format === 'csv') {
      return this.toCSV(trades);
    } else {
      return JSON.stringify(trades, null, 2);
    }
  }
  
  private toCSV(trades: Trade[]): string {
    const headers = [
      'timestamp',
      'type',
      'token_mint',
      'token_symbol',
      'sol_amount',
      'token_amount',
      'price',
      'roi',
      'signature',
      'mode'
    ];
    
    const rows = trades.map(t => [
      t.timestamp,
      t.type,
      t.mint,
      t.symbol,
      t.solAmount,
      t.tokenAmount,
      t.price,
      t.roi || 0,
      t.signature,
      t.mode
    ]);
    
    return [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');
  }
}
```