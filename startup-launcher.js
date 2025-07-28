#!/usr/bin/env node

/**
 * Enhanced Startup Launcher for GitHub Codespaces
 * Provides comprehensive startup logging and automatic browser opening
 */

const { spawn } = require('child_process');
const debug = require('debug');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Handle chalk import for v5 (ESM) compatibility
let chalk;
(async () => {
  try {
    chalk = (await import('chalk')).default;
  } catch (error) {
    // Fallback for older versions or missing chalk
    chalk = {
      cyan: (text) => `\x1b[36m${text}\x1b[0m`,
      gray: (text) => `\x1b[90m${text}\x1b[0m`,
      yellow: (text) => `\x1b[33m${text}\x1b[0m`,
      green: (text) => `\x1b[32m${text}\x1b[0m`,
      red: (text) => `\x1b[31m${text}\x1b[0m`,
    };
  }
})();

// Create debug instance
const debugLauncher = debug('codespaces:launcher');

// Simple launcher logging function
function logLaunchEvent(message, data = null) {
  const timestamp = new Date().toISOString();
  const logDir = path.join(process.cwd(), 'logs', 'launches');
  
  try {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Get or create today's launcher log file
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `launcher-${today}.log`);
    
    // Format log entry
    let logEntry = `[${timestamp}] [LAUNCHER] ${message}`;
    if (data) {
      logEntry += `\n  Data: ${JSON.stringify(data, null, 2)}`;
    }
    logEntry += '\n';
    
    // Append to log file
    fs.appendFileSync(logFile, logEntry);
    
    // Also output to console
    console.log(`🚀 LAUNCHER: ${message}`);
    if (data) {
      console.log(`   Details:`, data);
    }
  } catch (error) {
    console.error('Failed to write launcher log:', error.message);
  }
}

class StartupLauncher {
  constructor() {
    this.isCodespaces = !!process.env.CODESPACES;
    this.codespaceName = process.env.CODESPACE_NAME;
    this.startTime = Date.now();
    
    // Log launcher initialization
    logLaunchEvent('Startup launcher initialized', {
      isCodespaces: this.isCodespaces,
      codespaceName: this.codespaceName,
      pid: process.pid,
      nodeVersion: process.version
    });
  }

  async initialize() {
    logLaunchEvent('Initializing startup launcher');
    
    // Wait for chalk to be available
    while (!chalk) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    logLaunchEvent('Chalk loaded, displaying banner');
    
    console.log(chalk.cyan('🚀 Enhanced Startup Launcher'));
    console.log(chalk.gray(`Environment: ${this.isCodespaces ? 'GitHub Codespaces' : 'Local'}`));
    
    if (this.isCodespaces) {
      console.log(chalk.gray(`Codespace: ${this.codespaceName}`));
    }
    
    console.log('');
    logLaunchEvent('Initialization banner displayed');
  }

  async launch() {
    try {
      logLaunchEvent('Starting launch sequence');
      
      // Step 0: Initialize (wait for chalk)
      logLaunchEvent('Step 0: Initialize');
      await this.initialize();
      
      // Step 1: Environment Check
      logLaunchEvent('Step 1: Environment Check');
      await this.checkEnvironment();
      
      // Step 2: Dependency Check
      logLaunchEvent('Step 2: Dependency Check');
      await this.checkDependencies();
      
      // Step 3: Port Check
      logLaunchEvent('Step 3: Port Check');
      await this.checkPorts();
      
      // Step 4: Launch Application
      logLaunchEvent('Step 4: Launch Application');
      await this.launchApplication();
      
      logLaunchEvent('Launch sequence completed successfully');
      
    } catch (error) {
      logLaunchEvent('Launch sequence failed', { 
        error: error.message,
        stack: error.stack 
      });
      console.error(chalk.red('❌ Startup failed:'), error.message);
      process.exit(1);
    }
  }

  async checkEnvironment() {
    console.log(chalk.yellow('🔍 Environment Check'));
    logLaunchEvent('Starting environment checks');
    
    // Check Node.js version
    const nodeVersion = process.version;
    console.log(`  ✅ Node.js: ${nodeVersion}`);
    logLaunchEvent('Node.js version checked', { nodeVersion });
    
    // Check if we're in the right directory
    const fs = require('fs');
    const packageJsonExists = fs.existsSync('./package.json');
    console.log(`  ${packageJsonExists ? '✅' : '❌'} Package.json: ${packageJsonExists ? 'Found' : 'Missing'}`);
    logLaunchEvent('Package.json check', { exists: packageJsonExists });
    
    if (!packageJsonExists) {
      const error = new Error('package.json not found. Please run from the project root directory.');
      logLaunchEvent('Environment check failed - missing package.json', { error: error.message });
      throw error;
    }
    
    // Check main source file
    const mainFileExists = fs.existsSync('./src/consolidated-main.ts');
    console.log(`  ${mainFileExists ? '✅' : '❌'} Main file: ${mainFileExists ? 'Found' : 'Missing'}`);
    logLaunchEvent('Main file check', { exists: mainFileExists });
    
    if (!mainFileExists) {
      const error = new Error('Main application file not found at src/consolidated-main.ts');
      logLaunchEvent('Environment check failed - missing main file', { error: error.message });
      throw error;
    }
    
    console.log('');
    logLaunchEvent('Environment checks completed successfully');
  }

  async checkDependencies() {
    console.log(chalk.yellow('📦 Dependencies Check'));
    logLaunchEvent('Starting dependency checks');
    
    return new Promise((resolve, reject) => {
      const npmCheck = spawn('npm', ['list', '--depth=0'], { 
        stdio: ['ignore', 'pipe', 'pipe'] 
      });
      
      let output = '';
      let errorOutput = '';
      
      npmCheck.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      npmCheck.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      npmCheck.on('close', (code) => {
        if (code === 0) {
          console.log('  ✅ Dependencies: All installed');
          logLaunchEvent('Dependencies check passed', { code });
          resolve();
        } else {
          console.log('  ⚠️ Dependencies: Some issues detected');
          console.log('  📦 Running npm install...');
          logLaunchEvent('Dependencies missing, starting npm install', { checkCode: code });
          
          // Auto-install dependencies
          const npmInstall = spawn('npm', ['install'], { 
            stdio: ['ignore', 'inherit', 'inherit'] 
          });
          
          npmInstall.on('close', (installCode) => {
            if (installCode === 0) {
              console.log('  ✅ Dependencies: Installed successfully');
              logLaunchEvent('Dependencies installed successfully', { installCode });
              resolve();
            } else {
              const error = new Error('Failed to install dependencies');
              logLaunchEvent('Dependencies installation failed', { 
                installCode,
                error: error.message 
              });
              reject(error);
            }
          });
        }
      });
    });
  }

  async checkPorts() {
    console.log(chalk.yellow('🔌 Port Availability'));
    logLaunchEvent('Starting port availability checks');
    
    const ports = [3000, 3001, 3002];
    const portStatus = {};
    
    for (const port of ports) {
      const isAvailable = await this.isPortAvailable(port);
      console.log(`  ${isAvailable ? '✅' : '⚠️'} Port ${port}: ${isAvailable ? 'Available' : 'In use'}`);
      portStatus[port] = isAvailable;
      
      if (port === 3000 && isAvailable) {
        break; // Primary port is available
      }
    }
    
    logLaunchEvent('Port availability checks completed', { portStatus });
    console.log('');
  }

  isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = http.createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', () => resolve(false));
    });
  }

  async launchApplication() {
    console.log(chalk.yellow('🚀 Launching Application'));
    logLaunchEvent('Starting application launch');
    
    // Set environment variables for enhanced startup
    const env = {
      ...process.env,
      DEBUG: 'app:*,codespaces:*',
      AUTO_OPEN_BROWSER: this.isCodespaces ? 'true' : 'false',
      EDUCATIONAL_MODE: 'true',
      DRY_RUN: 'true'
    };
    
    const args = process.argv.slice(2);
    const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'unified';
    const port = args.find(arg => arg.startsWith('--port='))?.split('=')[1] || '3000';
    
    console.log(`  🎯 Mode: ${mode.toUpperCase()}`);
    console.log(`  🔌 Port: ${port}`);
    console.log('');
    
    logLaunchEvent('Application configuration', {
      mode,
      port,
      environment: {
        isCodespaces: this.isCodespaces,
        autoOpenBrowser: env.AUTO_OPEN_BROWSER,
        educationalMode: env.EDUCATIONAL_MODE,
        dryRun: env.DRY_RUN
      }
    });
    
    const appProcess = spawn('npx', ['ts-node', 'src/consolidated-main.ts', `--mode=${mode}`, `--port=${port}`], {
      stdio: 'inherit',
      env: env
    });
    
    // Handle process events
    appProcess.on('spawn', () => {
      const startupTime = Date.now() - this.startTime;
      console.log(chalk.green(`✅ Application launched successfully (${startupTime}ms)`));
      
      logLaunchEvent('Application process spawned successfully', {
        startupTime,
        pid: appProcess.pid
      });
      
      if (this.isCodespaces) {
        console.log('');
        console.log(chalk.cyan('🌐 Codespaces Integration Active'));
        console.log(chalk.gray('  • Port forwarding will be automatic'));
        console.log(chalk.gray('  • Browser will open automatically'));
        console.log(chalk.gray('  • Check the PORTS tab for the dashboard link'));
        console.log('');
        
        logLaunchEvent('Codespaces integration activated');
      }
    });
    
    appProcess.on('error', (error) => {
      console.error(chalk.red('❌ Application launch failed:'), error.message);
      logLaunchEvent('Application launch error', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    });
    
    appProcess.on('close', (code, signal) => {
      if (signal) {
        console.log(chalk.yellow(`⚠️ Application terminated by signal: ${signal}`));
        logLaunchEvent('Application terminated by signal', { signal, code });
      } else {
        console.log(chalk.gray(`Application exited with code: ${code}`));
        logLaunchEvent('Application exited', { code });
      }
      process.exit(code || 0);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Graceful shutdown initiated...'));
      logLaunchEvent('Graceful shutdown initiated (SIGINT)');
      appProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      console.log(chalk.yellow('\n🛑 Termination requested...'));
      logLaunchEvent('Termination requested (SIGTERM)');
      appProcess.kill('SIGTERM');
    });
  }
}

// Enable debug output
if (!process.env.DEBUG) {
  process.env.DEBUG = 'codespaces:*';
}

// Launch the application
logLaunchEvent('Creating StartupLauncher instance');
const launcher = new StartupLauncher();
launcher.launch().catch((error) => {
  console.error('Startup failed:', error.message);
  logLaunchEvent('Startup failed at top level', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});