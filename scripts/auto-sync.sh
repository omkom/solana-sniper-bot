#!/bin/bash

# Auto-sync script for keeping local repository up to date
# This script continuously monitors for remote changes and rebuilds/restarts the app

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_DIR="/Users/erlealberton/BOT/solana-sniper-bot"
LOG_FILE="$REPO_DIR/logs/auto-sync.log"
PID_FILE="$REPO_DIR/logs/app.pid"
CHECK_INTERVAL=30  # Check every 30 seconds
PORT=3000

# Ensure logs directory exists
mkdir -p "$REPO_DIR/logs"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Print colored output
print_status() {
    echo -e "${BLUE}[AUTO-SYNC]${NC} $1"
    log "$1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
    log "SUCCESS: $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    log "WARNING: $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    log "ERROR: $1"
}

# Kill existing app processes
kill_app() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping existing app (PID: $pid)..."
            kill -TERM "$pid" 2>/dev/null || true
            sleep 3
            kill -KILL "$pid" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
    
    # Kill any processes on port 3000
    lsof -ti:$PORT | xargs kill -9 2>/dev/null || true
    
    # Kill any remaining Node.js processes related to our app
    pkill -f "node dist/consolidated-main.js" 2>/dev/null || true
    pkill -f "npm start" 2>/dev/null || true
}

# Build and start the app
build_and_start() {
    print_status "Building application..."
    
    cd "$REPO_DIR"
    
    # Install dependencies if package.json changed
    if [ package.json -nt node_modules/.package-lock-check 2>/dev/null ] || [ ! -d node_modules ]; then
        print_status "Installing/updating dependencies..."
        npm install
        touch node_modules/.package-lock-check
    fi
    
    # Build TypeScript
    print_status "Compiling TypeScript..."
    if npm run build; then
        print_success "Build completed successfully"
    else
        print_error "Build failed!"
        return 1
    fi
    
    # Start the application
    print_status "Starting application on port $PORT..."
    nohup npm start > "$REPO_DIR/logs/app.log" 2>&1 &
    local app_pid=$!
    echo "$app_pid" > "$PID_FILE"
    
    # Wait a moment and check if it started successfully
    sleep 5
    if kill -0 "$app_pid" 2>/dev/null; then
        print_success "Application started successfully (PID: $app_pid)"
        print_success "Dashboard available at: http://localhost:$PORT"
        return 0
    else
        print_error "Application failed to start"
        return 1
    fi
}

# Check for remote updates
check_updates() {
    cd "$REPO_DIR"
    
    # Fetch latest changes
    git fetch origin main >/dev/null 2>&1
    
    # Check if we're behind
    local local_commit=$(git rev-parse HEAD)
    local remote_commit=$(git rev-parse origin/main)
    
    if [ "$local_commit" != "$remote_commit" ]; then
        print_status "New changes detected in remote repository"
        print_status "Local:  $local_commit"
        print_status "Remote: $remote_commit"
        
        # Pull changes
        print_status "Pulling latest changes..."
        if git pull origin main; then
            print_success "Successfully pulled latest changes"
            return 0  # Changes were pulled
        else
            print_error "Failed to pull changes"
            return 2  # Pull failed
        fi
    fi
    
    return 1  # No changes
}

# Health check for the running app
health_check() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            # Check if port 3000 is responding
            if curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT | grep -q "200"; then
                return 0  # App is healthy
            fi
        fi
    fi
    return 1  # App is not healthy
}

# Main sync loop
main_loop() {
    print_status "Starting auto-sync monitor..."
    print_status "Repository: $REPO_DIR"
    print_status "Check interval: ${CHECK_INTERVAL}s"
    print_status "Dashboard port: $PORT"
    
    # Initial build and start
    kill_app
    if build_and_start; then
        print_success "Initial startup completed"
    else
        print_error "Initial startup failed"
        exit 1
    fi
    
    # Main monitoring loop
    while true; do
        sleep $CHECK_INTERVAL
        
        # Check for updates
        case $(check_updates) in
            0)  # Changes were pulled
                print_status "Restarting application with new changes..."
                kill_app
                if build_and_start; then
                    print_success "Application restarted with latest changes"
                else
                    print_error "Failed to restart application"
                fi
                ;;
            1)  # No changes
                # Just do a health check
                if ! health_check; then
                    print_warning "Application appears to be down, restarting..."
                    kill_app
                    if build_and_start; then
                        print_success "Application restarted"
                    else
                        print_error "Failed to restart application"
                    fi
                fi
                ;;
            2)  # Pull failed
                print_error "Git pull failed, will retry next cycle"
                ;;
        esac
    done
}

# Signal handlers for graceful shutdown
cleanup() {
    print_status "Shutting down auto-sync monitor..."
    kill_app
    print_status "Auto-sync monitor stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if script is already running
if [ -f "$REPO_DIR/logs/auto-sync.pid" ]; then
    local existing_pid=$(cat "$REPO_DIR/logs/auto-sync.pid")
    if kill -0 "$existing_pid" 2>/dev/null; then
        print_error "Auto-sync is already running (PID: $existing_pid)"
        print_status "To stop it, run: kill $existing_pid"
        exit 1
    fi
fi

# Save our PID
echo $$ > "$REPO_DIR/logs/auto-sync.pid"

# Start the main loop
main_loop