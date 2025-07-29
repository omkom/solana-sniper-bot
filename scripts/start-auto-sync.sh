#!/bin/bash

# Simplified start script for auto-sync
# Usage: ./scripts/start-auto-sync.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTO_SYNC_SCRIPT="$SCRIPT_DIR/auto-sync.sh"

# Make sure the auto-sync script is executable
chmod +x "$AUTO_SYNC_SCRIPT"

echo "🚀 Starting Auto-Sync Monitor..."
echo "📁 Repository will be kept in sync with remote"
echo "🔄 App will rebuild and restart automatically on changes"
echo "🌐 Dashboard will be available at http://localhost:3000"
echo ""
echo "To stop: Press Ctrl+C or kill the process"
echo "Logs: /Users/erlealberton/BOT/solana-sniper-bot/logs/auto-sync.log"
echo ""

# Start the auto-sync script
exec "$AUTO_SYNC_SCRIPT"