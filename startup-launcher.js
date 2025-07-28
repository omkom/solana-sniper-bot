#!/usr/bin/env node

/**
 * Enhanced Startup Launcher for GitHub Codespaces
 * Provides comprehensive startup logging and automatic browser opening
 */

const { spawn } = require('child_process');
const debug = require('debug');
const chalk = require('chalk');

// Create debug instance
const debugLauncher = debug('codespaces:launcher');

class StartupLauncher {
  constructor() {
    this.isCodespaces = !!process.env.CODESPACES;
    this.codespaceName = process.env.CODESPACE_NAME;
    this.startTime = Date.now();
    
    console.log(chalk.cyan('🚀 Enhanced Startup Launcher'));
    console.log(chalk.gray(`Environment: ${this.isCodespaces ? 'GitHub Codespaces' : 'Local'}`));
    
    if (this.isCodespaces) {
      console.log(chalk.gray(`Codespace: ${this.codespaceName}`));
    }
    
    console.log('');
  }

  async launch() {
    try {
      // Step 1: Environment Check
      await this.checkEnvironment();
      
      // Step 2: Dependency Check
      await this.checkDependencies();
      
      // Step 3: Port Check
      await this.checkPorts();
      
      // Step 4: Launch Application
      await this.launchApplication();
      
    } catch (error) {
      console.error(chalk.red('❌ Startup failed:'), error.message);
      process.exit(1);
    }
  }

  async checkEnvironment() {
    console.log(chalk.yellow('🔍 Environment Check'));
    
    // Check Node.js version
    const nodeVersion = process.version;
    console.log(`  ✅ Node.js: ${nodeVersion}`);
    
    // Check if we're in the right directory
    const fs = require('fs');
    const packageJsonExists = fs.existsSync('./package.json');
    console.log(`  ${packageJsonExists ? '✅' : '❌'} Package.json: ${packageJsonExists ? 'Found' : 'Missing'}`);
    
    if (!packageJsonExists) {
      throw new Error('package.json not found. Please run from the project root directory.');
    }
    
    // Check main source file
    const mainFileExists = fs.existsSync('./src/consolidated-main.ts');
    console.log(`  ${mainFileExists ? '✅' : '❌'} Main file: ${mainFileExists ? 'Found' : 'Missing'}`);
    
    if (!mainFileExists) {
      throw new Error('Main application file not found at src/consolidated-main.ts');
    }
    
    console.log('');
  }

  async checkDependencies() {
    console.log(chalk.yellow('📦 Dependencies Check'));
    
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
          resolve();
        } else {
          console.log('  ⚠️ Dependencies: Some issues detected');
          console.log('  📦 Running npm install...');
          
          // Auto-install dependencies
          const npmInstall = spawn('npm', ['install'], { 
            stdio: ['ignore', 'inherit', 'inherit'] 
          });
          
          npmInstall.on('close', (installCode) => {
            if (installCode === 0) {
              console.log('  ✅ Dependencies: Installed successfully');
              resolve();
            } else {
              reject(new Error('Failed to install dependencies'));
            }
          });
        }
      });
    });
  }

  async checkPorts() {
    console.log(chalk.yellow('🔌 Port Availability'));
    
    const http = require('http');
    const ports = [3000, 3001, 3002];
    
    for (const port of ports) {
      const isAvailable = await this.isPortAvailable(port);
      console.log(`  ${isAvailable ? '✅' : '⚠️'} Port ${port}: ${isAvailable ? 'Available' : 'In use'}`);
      
      if (port === 3000 && isAvailable) {
        break; // Primary port is available
      }
    }
    
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
    
    const appProcess = spawn('npx', ['ts-node', 'src/consolidated-main.ts', `--mode=${mode}`, `--port=${port}`], {
      stdio: 'inherit',
      env: env
    });
    
    // Handle process events
    appProcess.on('spawn', () => {
      const startupTime = Date.now() - this.startTime;
      console.log(chalk.green(`✅ Application launched successfully (${startupTime}ms)`));
      
      if (this.isCodespaces) {
        console.log('');
        console.log(chalk.cyan('🌐 Codespaces Integration Active'));
        console.log(chalk.gray('  • Port forwarding will be automatic'));
        console.log(chalk.gray('  • Browser will open automatically'));
        console.log(chalk.gray('  • Check the PORTS tab for the dashboard link'));
        console.log('');
      }
    });
    
    appProcess.on('error', (error) => {
      console.error(chalk.red('❌ Application launch failed:'), error.message);
      process.exit(1);
    });
    
    appProcess.on('close', (code, signal) => {
      if (signal) {
        console.log(chalk.yellow(`⚠️ Application terminated by signal: ${signal}`));
      } else {
        console.log(chalk.gray(`Application exited with code: ${code}`));
      }
      process.exit(code || 0);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Graceful shutdown initiated...'));
      appProcess.kill('SIGINT');
    });
    
    process.on('SIGTERM', () => {
      console.log(chalk.yellow('\n🛑 Termination requested...'));
      appProcess.kill('SIGTERM');
    });
  }
}

// Enable debug output
if (!process.env.DEBUG) {
  process.env.DEBUG = 'codespaces:*';
}

// Launch the application
const launcher = new StartupLauncher();
launcher.launch();