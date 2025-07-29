# 🔄 Auto-Sync Setup Guide

This system keeps your local repository automatically synchronized with your remote Codespace changes and maintains a running dashboard on port 3000.

## 🚀 Quick Start

### Option 1: Using NPM Scripts (Recommended)
```bash
# Start auto-sync monitor
npm run auto-sync

# Check status
npm run sync-status

# Stop auto-sync
npm run stop-sync
```

### Option 2: Direct Script Execution
```bash
# Start auto-sync monitor
./scripts/start-auto-sync.sh

# Check status  
./scripts/status.sh

# Stop auto-sync
./scripts/stop-auto-sync.sh
```

## 🎯 What It Does

### **Continuous Monitoring**
- ✅ Checks for remote repository changes every 30 seconds
- ✅ Automatically pulls latest code from your Codespace
- ✅ Rebuilds TypeScript when changes are detected
- ✅ Restarts the application with new code
- ✅ Maintains dashboard availability on http://localhost:3000

### **Health Monitoring**
- ✅ Monitors application health
- ✅ Automatically restarts if the app crashes
- ✅ Ensures port 3000 is always available
- ✅ Logs all activities for debugging

### **Smart Updates**
- ✅ Only rebuilds when actual changes are detected
- ✅ Preserves running state when no changes exist
- ✅ Handles TypeScript compilation errors gracefully
- ✅ Manages dependencies automatically

## 📊 Dashboard Access

Once started, your dashboard will be continuously available at:
- **Local**: http://localhost:3000
- **Status**: Always reflects the latest code from your Codespace

## 📝 Logs and Monitoring

### Log Files
```bash
# Auto-sync activity log
tail -f logs/auto-sync.log

# Application output log
tail -f logs/app.log

# Check current status
npm run sync-status
```

### Status Information
The status command shows:
- 🟢/🔴 Auto-sync monitor status
- 🟢/🔴 Application status  
- 🟢/🔴 Port 3000 availability
- 🟢/🔴 Dashboard accessibility
- 📦 Repository sync status
- 📄 Recent activity logs

## 🔧 Configuration

### Customization Options
Edit `scripts/auto-sync.sh` to modify:
- `CHECK_INTERVAL=30` - How often to check for changes (seconds)
- `PORT=3000` - Dashboard port
- Repository monitoring settings

### Environment Requirements
- Git repository with remote origin
- Node.js and npm installed
- TypeScript compiler available
- Network access to remote repository

## 🛠️ Workflow Integration

### Development Workflow
1. **Work in Codespace**: Make changes in your web editor
2. **Commit & Push**: Git commit and push from Codespace
3. **Automatic Sync**: Local system detects changes automatically
4. **Auto Rebuild**: Application rebuilds with new code
5. **Auto Restart**: Dashboard updates with latest changes
6. **Always Available**: http://localhost:3000 stays accessible

### Typical Usage
```bash
# Start the auto-sync system
npm run auto-sync

# Work in your Codespace web editor
# Make changes, commit, and push

# Check status anytime
npm run sync-status

# View live logs
tail -f logs/auto-sync.log

# Stop when done
npm run stop-sync
```

## 🚨 Troubleshooting

### Common Issues

**Auto-sync not detecting changes:**
```bash
# Check git remote configuration
git remote -v

# Manually check for updates
git fetch origin main
git status
```

**Application won't start:**
```bash
# Check build errors
npm run build

# Check port availability
lsof -i :3000

# View application logs
tail -f logs/app.log
```

**Permission issues:**
```bash
# Make scripts executable
chmod +x scripts/*.sh
```

### Manual Recovery
```bash
# Stop everything
npm run stop-sync

# Clean restart
rm -f logs/*.pid
npm run auto-sync
```

## 🎛️ Advanced Features

### Multiple Monitoring
- Repository changes detection
- Application health checks
- Port availability monitoring
- Automatic dependency management
- Build failure recovery

### Intelligent Restarts
- Only restarts when code actually changes
- Preserves state during health checks
- Graceful shutdown handling
- PID-based process management

### Logging
- Timestamped activity logs
- Separate app and sync logs
- Color-coded status output
- Error tracking and reporting

---

## 🎯 Perfect for Remote Development

This system is ideal when:
- ✅ You're working remotely in GitHub Codespaces
- ✅ You want your local dashboard always updated
- ✅ You need automatic rebuilds on code changes
- ✅ You prefer local development with remote code editing
- ✅ You want zero-maintenance synchronization

**Start once, work seamlessly!** 🚀