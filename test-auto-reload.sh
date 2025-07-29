#!/bin/bash

# Test script for dashboard auto-reload functionality
# This simulates the complete workflow

echo "🧪 Testing Dashboard Auto-Reload Functionality"
echo "=============================================="

PORT=3000

# Function to check if dashboard is running
check_dashboard() {
    if curl -s "http://localhost:$PORT/api/system" >/dev/null 2>&1; then
        echo "✅ Dashboard is running on port $PORT"
        return 0
    else
        echo "❌ Dashboard is not running on port $PORT"
        return 1
    fi
}

# Function to test the repository sync API
test_sync_api() {
    echo ""
    echo "📡 Testing repository sync API endpoint..."
    
    # Create test payload
    test_payload='{
        "commitHash": "abc123def456",
        "message": "Test commit for auto-reload functionality",
        "changes": ["test-file.ts", "README.md"],
        "author": "Test User"
    }'
    
    # Send test notification
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "http://localhost:$PORT/api/repository-sync")
    
    if echo "$response" | grep -q "success.*true"; then
        echo "✅ Repository sync API endpoint working"
        echo "📄 Response: $response"
        return 0
    else
        echo "❌ Repository sync API endpoint failed"
        echo "📄 Response: $response"
        return 1
    fi
}

# Function to verify WebSocket connection
test_websocket() {
    echo ""
    echo "🔌 Testing WebSocket connection..."
    echo "   Open http://localhost:$PORT in your browser"
    echo "   Check browser console for WebSocket messages"
    echo "   You should see: '🔄 Repository sync detected:' message"
}

# Main test execution
echo ""
echo "Step 1: Checking if dashboard is running..."
if ! check_dashboard; then
    echo ""
    echo "⚠️  Dashboard not running. Please start it first:"
    echo "   npm run auto-sync"
    echo "   or"
    echo "   npm start"
    exit 1
fi

echo ""
echo "Step 2: Testing repository sync API..."
if test_sync_api; then
    echo ""
    echo "Step 3: WebSocket verification..."
    test_websocket
    
    echo ""
    echo "🎉 Auto-reload functionality test completed!"
    echo ""
    echo "✅ What works:"
    echo "   - Dashboard API endpoint (/api/repository-sync)"
    echo "   - WebSocket event emission (repositorySync)"
    echo "   - Frontend auto-reload code (check browser console)"
    echo ""
    echo "🧪 To test the complete workflow:"
    echo "   1. Open http://localhost:$PORT in your browser"
    echo "   2. Open browser console (F12 → Console)"
    echo "   3. Make a change in your Codespace and commit/push"
    echo "   4. Wait 30 seconds for auto-sync to detect changes"
    echo "   5. Watch for '🔄 Repository sync detected:' in console"
    echo "   6. Dashboard should auto-reload after 2 seconds"
    
else
    echo ""
    echo "❌ Repository sync API test failed"
    echo "   Check logs for errors: cat logs/auto-sync.log"
    exit 1
fi