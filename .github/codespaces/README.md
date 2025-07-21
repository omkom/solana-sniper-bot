# GitHub Codespaces Configuration

This directory contains the configuration for running the Solana Educational Token Analyzer in GitHub Codespaces with automatic port forwarding.

## Port Forwarding Setup

The configuration automatically forwards port 3000 (dashboard) when you run any of the `npm run ...` commands:

- **Port 3000**: Educational Dashboard (automatically forwarded)
  - Label: "Educational Dashboard"  
  - Visibility: Public (accessible via generated URL)
  - Auto-notification when forwarded

## Usage

1. **Start the application** with any npm command:
   ```bash
   npm run dev          # Standard educational mode
   npm run dev:rapid    # High-frequency detection mode  
   npm run dev:real     # Live market data mode
   npm run dev:unified  # Unified processing mode
   ```

2. **Access the dashboard**: The port will be automatically forwarded and you'll receive a notification with the public URL.

3. **View forwarded ports**: Use the "Ports" tab in VS Code or run:
   ```bash
   gh codespace ports
   ```

## Configuration Files

- `devcontainer.json`: Main devcontainer configuration with port forwarding
- `settings.json`: Codespaces-specific settings and extensions
- Environment automatically installs dependencies with `npm install`

## Features

- ✅ Automatic port 3000 forwarding
- ✅ Public dashboard access via generated URL  
- ✅ Notification when ports are forwarded
- ✅ TypeScript development environment
- ✅ Educational safety boundaries enforced
- ✅ All npm scripts include explicit port configuration

The educational dashboard will be accessible immediately when you run any development command!