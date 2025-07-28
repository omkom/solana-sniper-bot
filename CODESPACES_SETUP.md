# 🚀 GitHub Codespaces Setup Guide

## Quick Start

1. **Launch your Codespace** (this file should open automatically)
2. **Run the application**:
   ```bash
   npm run dev
   ```
3. **Access your dashboard**:
   - GitHub will automatically forward port 3000
   - Click the "Open in Browser" notification
   - Or check the **PORTS** tab at the bottom of VS Code

## 🔧 What Was Fixed

### Issue: Port Forwarding Not Automatic
**Solution**: Added complete devcontainer configuration

### Components Added:

#### 1. **DevContainer Configuration** (`.devcontainer/devcontainer.json`)
```json
{
  "forwardPorts": [3000, 3001, 8000, 8080],
  "portsAttributes": {
    "3000": {
      "label": "Dashboard",
      "onAutoForward": "openPreview",
      "visibility": "public"
    }
  }
}
```

#### 2. **Enhanced Startup Launcher** (`startup-launcher.js`)
- Environment validation
- Dependency checks  
- Port availability testing
- Automatic browser opening
- Comprehensive startup logging

#### 3. **Diagnostic Tool** (`codespaces-diagnostic.js`)
- Complete system analysis
- Network connectivity testing
- Port availability checking
- File system validation
- Process monitoring

#### 4. **Enhanced Application Integration**
- Codespaces URL generation
- Automatic browser launching
- Startup success notifications
- Debug logging integration

## 📋 Available Commands

```bash
# Main development command (with enhanced launcher)
npm run dev

# Diagnostic tool
npm run diagnose

# Different modes
npm run dev:rapid    # High-frequency detection
npm run dev:real     # Live market data
npm run dev:analysis # Deep analysis mode

# Setup and testing
npm run codespaces:setup  # Initial setup
npm run codespaces:test   # Diagnose + launch
```

## 🔍 Troubleshooting

### Port Forwarding Issues
1. **Check PORTS tab** in VS Code bottom panel
2. **Manual forwarding**: Click "Forward a Port" and enter `3000`
3. **Run diagnostic**: `npm run diagnose`

### Application Not Starting
1. **Check dependencies**: `npm install`
2. **Run diagnostic**: `npm run diagnose`
3. **View startup logs**: Look for colored startup messages

### Dashboard Not Loading
1. **Verify port forwarding** in PORTS tab
2. **Check URL format**: `https://CODESPACE_NAME-3000.app.github.dev`
3. **Wait for startup**: Application takes 10-15 seconds to fully initialize

## 🌐 Understanding Codespaces URLs

Your dashboard will be available at:
```
https://<CODESPACE_NAME>-3000.app.github.dev
```

Where `<CODESPACE_NAME>` is your unique Codespace identifier.

## 🎯 Features Enabled

### Automatic Features:
- ✅ Port forwarding (3000, 3001, 8000, 8080)
- ✅ Browser auto-opening
- ✅ Environment detection
- ✅ Startup validation
- ✅ Comprehensive logging

### Manual Features:
- 🔍 Diagnostic tool (`npm run diagnose`)
- 📊 Multiple application modes
- 🔧 Setup verification
- 📝 Startup logging

## 🚨 Educational Safety

This system maintains **triple-locked educational safety**:
- **DRY_RUN Mode**: Cannot be disabled
- **Simulated Trading**: No real funds at risk
- **Educational Focus**: 70% educational / 30% technical demonstration

## 📞 Support

If you encounter issues:

1. **Run diagnostic first**: `npm run diagnose`
2. **Check the diagnostic report**: `codespaces-diagnostic-report.json`
3. **Verify devcontainer**: Ensure `.devcontainer/devcontainer.json` exists
4. **Manual port forwarding**: Use VS Code PORTS tab if automatic fails

---

## 🎉 Success Indicators

When everything works correctly, you should see:

```
🎓 ===== EDUCATIONAL SOLANA TOKEN ANALYZER =====
📚 This system is for educational purposes only
🔒 All trading is simulated - no real funds at risk
🎯 Mode: UNIFIED
💰 Starting Balance: 10 SOL
📊 Dashboard: http://localhost:3000
🌐 Codespaces URL: https://CODESPACE_NAME-3000.app.github.dev
🚀 Port forwarding will be automatic in GitHub Codespaces

🛡️ CODESPACES READY!
📱 Your dashboard is now available at:
   https://CODESPACE_NAME-3000.app.github.dev
🔗 GitHub will automatically forward this port
🌐 Click the "Open in Browser" notification or check the PORTS tab
```

**Happy coding! 🚀**