#!/usr/bin/env node

/**
 * Simple Dashboard Starter
 * Starts just the dashboard without intensive token detection
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Simple API endpoints
app.get('/api/system', (req, res) => {
  res.json({
    status: 'running',
    mode: 'simple-dashboard',
    uptime: process.uptime(),
    timestamp: Date.now(),
    port: PORT
  });
});

app.get('/api/portfolio', (req, res) => {
  res.json({
    balance: 10.0,
    totalValue: 10.0,
    netPnL: 0.0,
    positions: [],
    trades: []
  });
});

app.get('/api/positions', (req, res) => {
  res.json([]);
});

app.get('/api/trades', (req, res) => {
  res.json([]);
});

app.get('/api/tracked-tokens', (req, res) => {
  res.json([
    {
      address: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      name: "Solana",
      price: 185.0,
      source: "demo"
    }
  ]);
});

// Repository sync API for auto-reload
app.post('/api/repository-sync', (req, res) => {
  try {
    const { commitHash, message, changes, author } = req.body;
    
    const syncData = {
      commitHash: commitHash || 'unknown',
      message: message || 'Repository updated',
      timestamp: Date.now(),
      changes: changes || [],
      author: author || 'Auto-sync'
    };

    console.log('📡 Repository sync notification:', {
      commitHash: syncData.commitHash.substring(0, 8),
      message: syncData.message,
      changesCount: syncData.changes.length
    });

    // Notify all connected dashboard clients
    io.emit('repositorySync', {
      commitHash: syncData.commitHash,
      message: syncData.message,
      timestamp: syncData.timestamp,
      changes: syncData.changes,
      author: syncData.author,
      reloadDelay: 2000
    });

    res.json({
      success: true,
      message: 'Repository sync notification sent',
      data: syncData,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Failed to process repository sync notification:', error);
    res.status(500).json({ error: 'Failed to process repository sync notification' });
  }
});

// Dashboard route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// WebSocket connections
io.on('connection', (socket) => {
  console.log('👋 Client connected to dashboard');
  
  socket.on('disconnect', () => {
    console.log('👋 Client disconnected from dashboard');
  });
});

// Start server
server.listen(PORT, () => {
  console.log('🎓 ===== SIMPLE DASHBOARD STARTED =====');
  console.log('📚 Educational Solana Token Sniping Dashboard');
  console.log('🔒 All trading is simulated - no real funds at risk');
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log('🔄 Auto-reload enabled for repository sync');
  console.log('=====================================');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down dashboard...');
  server.close(() => {
    console.log('✅ Dashboard stopped');
    process.exit(0);
  });
});