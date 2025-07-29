#!/bin/bash

# Check status of auto-sync and application
# Usage: ./scripts/status.sh

REPO_DIR="/Users/erlealberton/BOT/solana-sniper-bot"
PID_FILE="$REPO_DIR/logs/auto-sync.pid"
APP_PID_FILE="$REPO_DIR/logs/app.pid"
LOG_FILE="$REPO_DIR/logs/auto-sync.log"
APP_LOG_FILE="$REPO_DIR/logs/app.log"
PORT=3000

echo "📊 Auto-Sync Status Report"
echo "=========================="

# Check auto-sync monitor
if [ -f "$PID_FILE" ]; then
    sync_pid=$(cat "$PID_FILE")
    if kill -0 "$sync_pid" 2>/dev/null; then
        echo "🟢 Auto-sync monitor: RUNNING (PID: $sync_pid)"
    else
        echo "🔴 Auto-sync monitor: NOT RUNNING (stale PID file)"
        rm -f "$PID_FILE"
    fi
else
    echo "🔴 Auto-sync monitor: NOT RUNNING"
fi

# Check application
if [ -f "$APP_PID_FILE" ]; then
    app_pid=$(cat "$APP_PID_FILE")
    if kill -0 "$app_pid" 2>/dev/null; then
        echo "🟢 Application: RUNNING (PID: $app_pid)"
    else
        echo "🔴 Application: NOT RUNNING (stale PID file)"
        rm -f "$APP_PID_FILE"
    fi
else
    echo "🔴 Application: NOT RUNNING"
fi

# Check port 3000
if lsof -i:$PORT >/dev/null 2>&1; then
    echo "🟢 Port $PORT: IN USE"
    port_process=$(lsof -i:$PORT | tail -n 1 | awk '{print $1 " (PID: " $2 ")"}')
    echo "   └─ Process: $port_process"
else
    echo "🔴 Port $PORT: FREE"
fi

# Check dashboard availability
if curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT 2>/dev/null | grep -q "200"; then
    echo "🟢 Dashboard: ACCESSIBLE at http://localhost:$PORT"
else
    echo "🔴 Dashboard: NOT ACCESSIBLE"
fi

# Git status
echo ""
echo "📦 Repository Status"
echo "==================="
cd "$REPO_DIR"
echo "🌟 Current branch: $(git branch --show-current)"
echo "📝 Last commit: $(git log -1 --pretty=format:'%h - %s (%cr)' 2>/dev/null || echo 'Unable to read git log')"

# Check if we're behind remote
git fetch origin main >/dev/null 2>&1
local_commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
remote_commit=$(git rev-parse origin/main 2>/dev/null || echo "unknown")

if [ "$local_commit" = "$remote_commit" ]; then
    echo "🟢 Repository: UP TO DATE"
else
    echo "🟡 Repository: BEHIND REMOTE"
    echo "   └─ Local:  $local_commit"
    echo "   └─ Remote: $remote_commit"
fi

# Recent log entries
echo ""
echo "📄 Recent Auto-Sync Activity"
echo "============================"
if [ -f "$LOG_FILE" ]; then
    echo "Last 5 entries from auto-sync.log:"
    tail -n 5 "$LOG_FILE" | sed 's/^/   /'
else
    echo "No log file found"
fi

echo ""
echo "🔧 Management Commands"
echo "====================="
echo "Start:  ./scripts/start-auto-sync.sh"
echo "Stop:   ./scripts/stop-auto-sync.sh"
echo "Status: ./scripts/status.sh"
echo "Logs:   tail -f $LOG_FILE"