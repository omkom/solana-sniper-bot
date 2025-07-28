#!/usr/bin/env node

/**
 * Comprehensive GitHub Codespaces Diagnostic Script
 * Tests all possible issues related to port forwarding and startup
 */

const debug = require('debug');
const chalk = require('chalk');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

// Create debug instances
const debugMain = debug('codespaces:diagnostic');
const debugNetwork = debug('codespaces:network');
const debugEnv = debug('codespaces:environment');
const debugPorts = debug('codespaces:ports');

class CodespacesDiagnostic {
  constructor() {
    this.results = {
      environment: {},
      network: {},
      ports: {},
      files: {},
      processes: {},
      recommendations: []
    };
    
    console.log(chalk.cyan('🔍 GitHub Codespaces Diagnostic Tool'));
    console.log(chalk.gray('Analyzing all possible port forwarding and startup issues...'));
    console.log('');
  }

  // Environment Detection
  detectEnvironment() {
    console.log(chalk.yellow('📋 Environment Detection'));
    
    const env = {
      isCodespaces: !!process.env.CODESPACES,
      codespaceName: process.env.CODESPACE_NAME || 'N/A',
      githubUser: process.env.GITHUB_USER || 'N/A',
      nodejsVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      workingDirectory: process.cwd(),
      homeDirectory: process.env.HOME || 'N/A',
      shellType: process.env.SHELL || 'N/A'
    };

    this.results.environment = env;
    
    console.log(`  ${env.isCodespaces ? '✅' : '❌'} Running in GitHub Codespaces: ${env.isCodespaces}`);
    console.log(`  📝 Codespace Name: ${env.codespaceName}`);
    console.log(`  👤 GitHub User: ${env.githubUser}`);
    console.log(`  🟢 Node.js Version: ${env.nodejsVersion}`);
    console.log(`  💻 Platform: ${env.platform} (${env.architecture})`);
    console.log('');

    debugEnv('Environment details: %O', env);
    
    if (!env.isCodespaces) {
      this.results.recommendations.push({
        type: 'CRITICAL',
        message: 'Not running in GitHub Codespaces environment',
        solution: 'This diagnostic should be run inside a GitHub Codespace'
      });
    }
  }

  // Port Testing
  async testPorts() {
    console.log(chalk.yellow('🔌 Port Availability Testing'));
    
    const portsToTest = [3000, 3001, 3002, 8000, 8080, 8888];
    const portResults = {};
    
    for (const port of portsToTest) {
      try {
        const isAvailable = await this.isPortAvailable(port);
        portResults[port] = {
          available: isAvailable,
          status: isAvailable ? 'Available' : 'In Use'
        };
        
        console.log(`  ${isAvailable ? '✅' : '⚠️'} Port ${port}: ${portResults[port].status}`);
        debugPorts(`Port ${port}: ${portResults[port].status}`);
        
      } catch (error) {
        portResults[port] = {
          available: false,
          status: 'Error',
          error: error.message
        };
        console.log(`  ❌ Port ${port}: Error - ${error.message}`);
      }
    }
    
    this.results.ports = portResults;
    console.log('');
  }

  // Network Connectivity
  async testNetworkConnectivity() {
    console.log(chalk.yellow('🌐 Network Connectivity Testing'));
    
    const endpoints = [
      'https://api.github.com',
      'https://api.dexscreener.com',
      'https://api.mainnet-beta.solana.com',
      'https://registry.npmjs.org'
    ];
    
    const networkResults = {};
    
    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await this.testHttpEndpoint(endpoint);
        const latency = Date.now() - startTime;
        
        networkResults[endpoint] = {
          accessible: response.ok,
          status: response.status,
          latency: latency,
          headers: Object.fromEntries(response.headers.entries())
        };
        
        console.log(`  ${response.ok ? '✅' : '❌'} ${endpoint}: ${response.status} (${latency}ms)`);
        debugNetwork(`${endpoint}: ${response.status} - ${latency}ms`);
        
      } catch (error) {
        networkResults[endpoint] = {
          accessible: false,
          error: error.message
        };
        console.log(`  ❌ ${endpoint}: ${error.message}`);
      }
    }
    
    this.results.network = networkResults;
    console.log('');
  }

  // File System Analysis
  analyzeFileSystem() {
    console.log(chalk.yellow('📁 File System Analysis'));
    
    const filesToCheck = [
      '.devcontainer/devcontainer.json',
      '.devcontainer.json',
      'devcontainer.json',
      '.vscode/launch.json',
      '.vscode/settings.json',
      'package.json',
      'src/consolidated-main.ts',
      'src/monitoring/consolidated-dashboard.ts',
      'public/dashboard.html'
    ];
    
    const fileResults = {};
    
    filesToCheck.forEach(file => {
      const fullPath = path.join(process.cwd(), file);
      try {
        const stats = fs.statSync(fullPath);
        fileResults[file] = {
          exists: true,
          size: stats.size,
          modified: stats.mtime,
          isDirectory: stats.isDirectory()
        };
        console.log(`  ✅ ${file}: ${stats.size} bytes`);
      } catch (error) {
        fileResults[file] = {
          exists: false,
          error: error.message
        };
        console.log(`  ❌ ${file}: Missing`);
        
        if (file.includes('devcontainer')) {
          this.results.recommendations.push({
            type: 'HIGH',
            message: `Missing ${file} for automatic port forwarding`,
            solution: 'Create devcontainer configuration to enable automatic port forwarding'
          });
        }
      }
    });
    
    this.results.files = fileResults;
    console.log('');
  }

  // Process Analysis
  analyzeRunningProcesses() {
    console.log(chalk.yellow('⚙️ Process Analysis'));
    
    return new Promise((resolve) => {
      const ps = spawn('ps', ['aux']);
      let output = '';
      
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('close', (code) => {
        const processes = output.split('\n')
          .filter(line => line.includes('node') || line.includes('npm') || line.includes('ts-node'))
          .map(line => {
            const parts = line.trim().split(/\s+/);
            return {
              user: parts[0],
              pid: parts[1],
              cpu: parts[2],
              memory: parts[3],
              command: parts.slice(10).join(' ')
            };
          });
        
        this.results.processes = { nodeProcesses: processes, totalProcesses: output.split('\n').length };
        
        console.log(`  📊 Total processes: ${this.results.processes.totalProcesses}`);
        console.log(`  🟢 Node.js processes: ${processes.length}`);
        
        processes.forEach(proc => {
          console.log(`    • PID ${proc.pid}: ${proc.command.substring(0, 60)}${proc.command.length > 60 ? '...' : ''}`);
        });
        
        console.log('');
        resolve();
      });
    });
  }

  // Codespaces-specific checks
  checkCodespacesFeatures() {
    console.log(chalk.yellow('🚀 Codespaces-specific Features'));
    
    const codespacesEnv = {
      codespacesVsCode: !!process.env.VSCODE_INJECTION,
      forwardedPorts: process.env.CODESPACE_FORWARDED_PORTS || 'None',
      workspaceFolder: process.env.GITHUB_WORKSPACE || process.cwd(),
      repositoryName: process.env.GITHUB_REPOSITORY || 'N/A',
      gitpodMode: !!process.env.GITPOD_WORKSPACE_ID,
      dockerMode: fs.existsSync('/.dockerenv')
    };
    
    console.log(`  ${codespacesEnv.codespacesVsCode ? '✅' : '❌'} VS Code integration: ${codespacesEnv.codespacesVsCode}`);
    console.log(`  📤 Forwarded ports: ${codespacesEnv.forwardedPorts}`);
    console.log(`  📁 Workspace folder: ${codespacesEnv.workspaceFolder}`);
    console.log(`  📦 Repository: ${codespacesEnv.repositoryName}`);
    console.log(`  🐳 Docker mode: ${codespacesEnv.dockerMode}`);
    console.log('');
    
    this.results.environment.codespaces = codespacesEnv;
  }

  // Test application startup
  async testApplicationStartup() {
    console.log(chalk.yellow('🔄 Application Startup Test'));
    
    return new Promise((resolve) => {
      console.log('  🚀 Testing npm run dev startup...');
      
      const npmProcess = spawn('npm', ['run', 'dev'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, DEBUG: 'codespaces:*' }
      });
      
      let output = '';
      let errorOutput = '';
      let startupComplete = false;
      
      const timeout = setTimeout(() => {
        if (!startupComplete) {
          npmProcess.kill('SIGTERM');
          console.log('  ⏱️ Startup test timed out after 30 seconds');
          this.results.processes.startupTest = {
            success: false,
            reason: 'Timeout',
            output: output,
            errors: errorOutput
          };
          resolve();
        }
      }, 30000);
      
      npmProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        if (chunk.includes('Dashboard started on port') || chunk.includes('started on port')) {
          startupComplete = true;
          clearTimeout(timeout);
          
          // Extract port number
          const portMatch = chunk.match(/port (\d+)/);
          const port = portMatch ? parseInt(portMatch[1]) : 3000;
          
          console.log(`  ✅ Application started successfully on port ${port}`);
          
          // Test if port is actually accessible
          setTimeout(async () => {
            try {
              const response = await fetch(`http://localhost:${port}/health`);
              console.log(`  ✅ Health check successful: ${response.status}`);
              this.results.processes.startupTest = {
                success: true,
                port: port,
                healthCheck: response.status,
                output: output
              };
            } catch (error) {
              console.log(`  ⚠️ Health check failed: ${error.message}`);
              this.results.processes.startupTest = {
                success: true,
                port: port,
                healthCheck: 'Failed',
                healthError: error.message,
                output: output
              };
            }
            
            npmProcess.kill('SIGTERM');
            resolve();
          }, 2000);
        }
      });
      
      npmProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      npmProcess.on('close', (code) => {
        if (!startupComplete) {
          console.log(`  ❌ Application startup failed with code ${code}`);
          this.results.processes.startupTest = {
            success: false,
            exitCode: code,
            output: output,
            errors: errorOutput
          };
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }

  // Generate Recommendations
  generateRecommendations() {
    console.log(chalk.yellow('💡 Recommendations'));
    
    // Check if devcontainer exists
    if (!this.results.files['.devcontainer/devcontainer.json']?.exists) {
      this.results.recommendations.push({
        type: 'HIGH',
        message: 'Missing .devcontainer/devcontainer.json for automatic port forwarding',
        solution: 'Create devcontainer configuration with port forwarding setup'
      });
    }
    
    // Check port availability
    if (!this.results.ports[3000]?.available) {
      this.results.recommendations.push({
        type: 'MEDIUM',
        message: 'Port 3000 is not available',
        solution: 'Use dynamic port assignment or check for conflicting processes'
      });
    }
    
    // Check if running in Codespaces
    if (!this.results.environment.isCodespaces) {
      this.results.recommendations.push({
        type: 'INFO',
        message: 'Not running in GitHub Codespaces',
        solution: 'Some features may not work outside of Codespaces environment'
      });
    }
    
    // Network connectivity issues
    const failedEndpoints = Object.entries(this.results.network)
      .filter(([_, result]) => !result.accessible);
    
    if (failedEndpoints.length > 0) {
      this.results.recommendations.push({
        type: 'MEDIUM',
        message: `Network connectivity issues with ${failedEndpoints.length} endpoints`,
        solution: 'Check network configuration and firewall settings'
      });
    }
    
    this.results.recommendations.forEach(rec => {
      const icon = rec.type === 'CRITICAL' ? '🚨' : rec.type === 'HIGH' ? '⚠️' : rec.type === 'MEDIUM' ? '💡' : 'ℹ️';
      console.log(`  ${icon} ${chalk.bold(rec.type)}: ${rec.message}`);
      console.log(`    ${chalk.gray(rec.solution)}`);
    });
    
    console.log('');
  }

  // Save diagnostic report
  saveDiagnosticReport() {
    const reportPath = path.join(process.cwd(), 'codespaces-diagnostic-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      environment: this.results.environment,
      network: this.results.network,
      ports: this.results.ports,
      files: this.results.files,
      processes: this.results.processes,
      recommendations: this.results.recommendations
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.green(`📋 Diagnostic report saved to: ${reportPath}`));
  }

  // Helper methods
  isPortAvailable(port) {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });
      
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          reject(err);
        }
      });
    });
  }

  async testHttpEndpoint(url) {
    const response = await fetch(url, {
      method: 'HEAD',
      timeout: 5000
    });
    return response;
  }

  // Main diagnostic runner
  async run() {
    console.log(chalk.blue('Starting comprehensive diagnostic...'));
    console.log('');
    
    try {
      this.detectEnvironment();
      await this.testPorts();
      await this.testNetworkConnectivity();
      this.analyzeFileSystem();
      await this.analyzeRunningProcesses();
      this.checkCodespacesFeatures();
      await this.testApplicationStartup();
      this.generateRecommendations();
      this.saveDiagnosticReport();
      
      console.log(chalk.green('✅ Diagnostic complete!'));
      console.log('');
      console.log(chalk.cyan('Next steps:'));
      console.log('1. Review the recommendations above');
      console.log('2. Check the diagnostic report: codespaces-diagnostic-report.json');
      console.log('3. Create devcontainer configuration if missing');
      console.log('4. Test port forwarding setup');
      
    } catch (error) {
      console.error(chalk.red('❌ Diagnostic failed:'), error);
      process.exit(1);
    }
  }
}

// Enable debug output
if (process.env.DEBUG) {
  debug.enabled = () => true;
} else {
  process.env.DEBUG = 'codespaces:*';
  debug.enabled = () => true;
}

// Run diagnostic
const diagnostic = new CodespacesDiagnostic();
diagnostic.run();