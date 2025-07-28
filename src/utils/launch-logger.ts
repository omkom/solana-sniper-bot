import * as fs from 'fs';
import * as path from 'path';

export class LaunchLogger {
  private logDir: string;
  private currentLogFile: string = '';
  private launchCounter: number = 0;
  
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs', 'launches');
    this.ensureLogDirectory();
    this.initializeLogFile();
  }

  private ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create launch log directory:', error);
    }
  }

  private initializeLogFile(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.launchCounter = this.getNextLaunchCounter();
    this.currentLogFile = path.join(
      this.logDir, 
      `launch-${this.launchCounter.toString().padStart(4, '0')}-${timestamp}.log`
    );
    
    // Create the log file with header
    this.writeToFile(`
================================================================================
🚀 SOLANA TOKEN ANALYZER - LAUNCH LOG #${this.launchCounter}
================================================================================
Launch Time: ${new Date().toISOString()}
Process ID: ${process.pid}
Node Version: ${process.version}
Platform: ${process.platform}
Environment: ${process.env.NODE_ENV || 'development'}
Codespaces: ${process.env.CODESPACES ? 'Yes' : 'No'}
Working Directory: ${process.cwd()}
================================================================================

`);
  }

  private getNextLaunchCounter(): number {
    try {
      const files = fs.readdirSync(this.logDir);
      const launchFiles = files.filter(file => file.startsWith('launch-') && file.endsWith('.log'));
      
      if (launchFiles.length === 0) {
        return 1;
      }
      
      // Extract counter from existing files
      const counters = launchFiles.map(file => {
        const match = file.match(/launch-(\d+)-/);
        return match ? parseInt(match[1], 10) : 0;
      });
      
      return Math.max(...counters) + 1;
    } catch (error) {
      console.error('Error determining launch counter:', error);
      return 1;
    }
  }

  private writeToFile(message: string): void {
    try {
      fs.appendFileSync(this.currentLogFile, message);
    } catch (error) {
      console.error('Failed to write to launch log:', error);
    }
  }

  log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', component: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] [${component}] ${message}`;
    
    let logEntry = formattedMessage;
    if (data) {
      logEntry += `\n  Data: ${JSON.stringify(data, null, 2)}`;
    }
    logEntry += '\n';
    
    this.writeToFile(logEntry);
    
    // Also log to console with color coding
    const consoleMessage = `🔍 LAUNCH: [${component}] ${message}`;
    switch (level) {
      case 'ERROR':
        console.error(`🔴 ${consoleMessage}`);
        break;
      case 'WARN':
        console.warn(`🟡 ${consoleMessage}`);
        break;
      case 'DEBUG':
        console.debug(`🔍 ${consoleMessage}`);
        break;
      default:
        console.log(`📝 ${consoleMessage}`);
    }
  }

  logStartupPhase(phase: string, details?: any): void {
    const separator = '─'.repeat(80);
    this.writeToFile(`\n${separator}\n🚀 STARTUP PHASE: ${phase}\n${separator}\n`);
    this.log('INFO', 'STARTUP', `Phase: ${phase}`, details);
  }

  logComponentInit(component: string, status: 'STARTING' | 'SUCCESS' | 'ERROR', details?: any, error?: Error): void {
    const emoji = status === 'SUCCESS' ? '✅' : status === 'ERROR' ? '❌' : '🔄';
    this.log(status === 'ERROR' ? 'ERROR' : 'INFO', 'COMPONENT', `${emoji} ${component} - ${status}`, details);
    
    if (error) {
      this.writeToFile(`  Error Details: ${error.message}\n  Stack: ${error.stack}\n`);
    }
  }

  logEnvironmentInfo(): void {
    const envInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: {
        total: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'not set',
        CODESPACES: process.env.CODESPACES || 'false',
        CODESPACE_NAME: process.env.CODESPACE_NAME || 'not set',
        PORT: process.env.PORT || 'not set'
      },
      arguments: process.argv.slice(2),
      workingDirectory: process.cwd()
    };

    this.logStartupPhase('ENVIRONMENT DETECTION', envInfo);
  }

  logConfigurationLoaded(config: any): void {
    // Sanitize sensitive data
    const sanitizedConfig = JSON.parse(JSON.stringify(config));
    if (sanitizedConfig.rpcEndpoints) {
      sanitizedConfig.rpcEndpoints = sanitizedConfig.rpcEndpoints.map(() => '[REDACTED]');
    }
    
    this.logStartupPhase('CONFIGURATION LOADED', sanitizedConfig);
  }

  logNetworkConnections(connections: any[]): void {
    this.logStartupPhase('NETWORK CONNECTIONS', {
      totalConnections: connections.length,
      connections: connections.map(conn => ({
        endpoint: conn.endpoint ? conn.endpoint.substring(0, 30) + '...' : 'unknown',
        status: conn.status || 'unknown'
      }))
    });
  }

  logApplicationReady(port: number, urls: string[]): void {
    this.writeToFile(`
================================================================================
🎉 APPLICATION READY - LAUNCH #${this.launchCounter} COMPLETED SUCCESSFULLY
================================================================================
Ready Time: ${new Date().toISOString()}
Port: ${port}
URLs: ${urls.join(', ')}
Launch Duration: ${this.getLaunchDuration()}
================================================================================

`);
    this.log('INFO', 'READY', `Application ready on port ${port}`, { urls });
  }

  logShutdown(reason: string): void {
    this.writeToFile(`
================================================================================
🛑 APPLICATION SHUTDOWN - LAUNCH #${this.launchCounter}
================================================================================
Shutdown Time: ${new Date().toISOString()}
Reason: ${reason}
Total Runtime: ${this.getLaunchDuration()}
================================================================================

`);
    this.log('INFO', 'SHUTDOWN', `Application shutdown: ${reason}`);
  }

  logError(component: string, error: Error, context?: any): void {
    this.log('ERROR', component, `Error occurred: ${error.message}`, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context
    });
  }

  private getLaunchDuration(): string {
    const uptime = process.uptime();
    const minutes = Math.floor(uptime / 60);
    const seconds = Math.floor(uptime % 60);
    return `${minutes}m ${seconds}s`;
  }

  getCurrentLogFile(): string {
    return this.currentLogFile;
  }

  getLaunchNumber(): number {
    return this.launchCounter;
  }
}

// Export singleton instance
export const launchLogger = new LaunchLogger();