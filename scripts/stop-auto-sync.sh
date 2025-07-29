#!/bin/bash

# Stop the auto-sync monitor
# Usage: ./scripts/stop-auto-sync.sh

REPO_DIR="/Users/erlealberton/BOT/solana-sniper-bot"
PID_FILE="$REPO_DIR/logs/auto-sync.pid"
APP_PID_FILE="$REPO_DIR/logs/app.pid"

echo "🛑 Stopping Auto-Sync Monitor..."

# Stop auto-sync monitor
if [ -f "$PID_FILE" ]; then
    sync_pid=$(cat "$PID_FILE")
    if kill -0 "$sync_pid" 2>/dev/null; then
        echo "Stopping auto-sync monitor (PID: $sync_pid)..."
        kill -TERM "$sync_pid" 2>/dev/null
        sleep 2
        kill -KILL "$sync_pid" 2>/dev/null || true
        echo "✅ Auto-sync monitor stopped"
    else
        echo "ℹ️  Auto-sync monitor was not running"
    fi
    rm -f "$PID_FILE"
else
    echo "ℹ️  No auto-sync PID file found"
fi

# Stop the application
if [ -f "$APP_PID_FILE" ]; then
    app_pid=$(cat "$APP_PID_FILE")
    if kill -0 "$app_pid" 2>/dev/null; then
        echo "Stopping application (PID: $app_pid)..."
        kill -TERM "$app_pid" 2>/dev/null
        sleep 3
        kill -KILL "$app_pid" 2>/dev/null || true
        echo "✅ Application stopped"
    fi
    rm -f "$APP_PID_FILE"
fi

# Kill any remaining processes
pkill -f "node dist/consolidated-main.js" 2>/dev/null || true
pkill -f "npm start" 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "✅ All processes stopped"
echo "📊 Dashboard is no longer available at http://localhost:3000"