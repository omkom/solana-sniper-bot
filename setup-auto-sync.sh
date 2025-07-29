#!/bin/bash

# One-time setup script for auto-sync system
# Run this once to set up everything

set -e

echo "🔄 Setting up Auto-Sync System..."
echo "=================================="

REPO_DIR="/Users/erlealberton/BOT/solana-sniper-bot"
cd "$REPO_DIR"

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Make scripts executable
echo "🔧 Making scripts executable..."
chmod +x scripts/*.sh
chmod +x setup-auto-sync.sh

# Check git configuration
echo "📦 Checking git configuration..."
if ! git remote get-url origin >/dev/null 2>&1; then
    echo "❌ Error: No git remote 'origin' found"
    echo "Please set up your git remote first:"
    echo "git remote add origin <your-repository-url>"
    exit 1
fi

echo "✅ Git remote configured: $(git remote get-url origin)"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock-check" ]; then
    echo "📦 Installing dependencies..."
    npm install
    touch node_modules/.package-lock-check
else
    echo "✅ Dependencies already installed"
fi

# Build the project
echo "🔨 Building project..."
if npm run build; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "🎉 Auto-Sync System Setup Complete!"
echo "===================================="
echo ""
echo "🚀 Quick Start Commands:"
echo "  Start:  npm run auto-sync"
echo "  Status: npm run sync-status"  
echo "  Stop:   npm run stop-sync"
echo ""
echo "📊 Dashboard will be available at: http://localhost:3000"
echo "📝 Logs will be saved to: $REPO_DIR/logs/"
echo ""
echo "Ready to start auto-sync? Run:"
echo "  npm run auto-sync"
echo ""