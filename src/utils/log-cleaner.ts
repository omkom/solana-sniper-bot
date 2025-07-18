import { existsSync, readdir, stat, unlink } from 'fs';
import { promisify } from 'util';
import path from 'path';

const readdirAsync = promisify(readdir);
const statAsync = promisify(stat);
const unlinkAsync = promisify(unlink);

export class LogCleaner {
  private logsDirectory = 'logs';
  private maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private maxSize = 10 * 1024 * 1024; // 10MB in bytes
  private startupMaxAge = 60 * 1000; // 60 secondes for startup cleanup

  async cleanLogs(isStartup: boolean = false): Promise<void> {
    const cleanupType = isStartup ? 'startup' : 'regular';
    console.log(`🧹 Starting ${cleanupType} log cleanup...`);

    if (!existsSync(this.logsDirectory)) {
      console.log('📁 Logs directory does not exist, skipping cleanup');
      return;
    }

    try {
      const files = await readdirAsync(this.logsDirectory);
      const logFiles = files.filter(file => file.endsWith('.log'));

      if (logFiles.length === 0) {
        console.log('📄 No log files found');
        return;
      }

      let totalSize = 0;
      let deletedFiles = 0;
      let totalFiles = logFiles.length;
      
      // Use more aggressive cleanup on startup
      const maxAge = isStartup ? this.startupMaxAge : this.maxAge;

      // Calculate total size and clean old files
      for (const file of logFiles) {
        const filePath = path.join(this.logsDirectory, file);
        
        try {
          const stats = await statAsync(filePath);
          const fileAge = Date.now() - stats.mtime.getTime();
          
          totalSize += stats.size;

          // Delete files older than maxAge
          if (fileAge > maxAge) {
            await unlinkAsync(filePath);
            deletedFiles++;
            totalSize -= stats.size;
            console.log(`🗑️  Deleted old log file: ${file} (${Math.round(fileAge / (24 * 60 * 60 * 1000))} days old)`);
          }
        } catch (error) {
          console.warn(`⚠️  Could not process log file ${file}:`, error);
        }
      }

      // If total size is still too large, delete oldest files
      if (totalSize > this.maxSize) {
        console.log(`📊 Total log size (${this.formatBytes(totalSize)}) exceeds limit (${this.formatBytes(this.maxSize)})`);
        await this.cleanBySize();
      }

      const remainingFiles = totalFiles - deletedFiles;
      const finalSize = await this.calculateTotalSize();

      console.log(`✅ ${cleanupType} log cleanup completed:`);
      console.log(`   📄 Files processed: ${totalFiles}`);
      console.log(`   🗑️  Files deleted: ${deletedFiles}`);
      console.log(`   📁 Files remaining: ${remainingFiles}`);
      console.log(`   💾 Total size: ${this.formatBytes(finalSize)}`);

    } catch (error) {
      console.error('❌ Error during log cleanup:', error);
    }
  }

  private async cleanBySize(): Promise<void> {
    const files = await readdirAsync(this.logsDirectory);
    const logFiles = files.filter(file => file.endsWith('.log'));

    // Get file stats and sort by modification time (oldest first)
    const fileStats = await Promise.all(
      logFiles.map(async (file) => {
        const filePath = path.join(this.logsDirectory, file);
        const stats = await statAsync(filePath);
        return { file, filePath, stats };
      })
    );

    fileStats.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());

    let currentSize = await this.calculateTotalSize();
    let deletedCount = 0;

    // Delete oldest files until we're under the size limit
    for (const { file, filePath, stats } of fileStats) {
      if (currentSize <= this.maxSize) break;

      try {
        await unlinkAsync(filePath);
        currentSize -= stats.size;
        deletedCount++;
        console.log(`🗑️  Deleted for size limit: ${file} (${this.formatBytes(stats.size)})`);
      } catch (error) {
        console.warn(`⚠️  Could not delete ${file}:`, error);
      }
    }

    if (deletedCount > 0) {
      console.log(`📉 Deleted ${deletedCount} files to meet size limit`);
    }
  }

  private async calculateTotalSize(): Promise<number> {
    try {
      const files = await readdirAsync(this.logsDirectory);
      const logFiles = files.filter(file => file.endsWith('.log'));

      let totalSize = 0;
      for (const file of logFiles) {
        const filePath = path.join(this.logsDirectory, file);
        const stats = await statAsync(filePath);
        totalSize += stats.size;
      }

      return totalSize;
    } catch {
      return 0;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Clean specific log types
  async cleanErrorLogs(): Promise<void> {
    const errorLogPath = path.join(this.logsDirectory, 'errors.log');
    if (existsSync(errorLogPath)) {
      try {
        await unlinkAsync(errorLogPath);
        console.log('🗑️  Cleaned error log file');
      } catch (error) {
        console.warn('⚠️  Could not clean error log:', error);
      }
    }
  }

  // Clean all logs (for fresh start)
  async cleanAllLogs(): Promise<void> {
    console.log('🧹 Performing complete log cleanup...');

    if (!existsSync(this.logsDirectory)) {
      console.log('📁 Logs directory does not exist');
      return;
    }

    try {
      const files = await readdirAsync(this.logsDirectory);
      const logFiles = files.filter(file => file.endsWith('.log'));

      for (const file of logFiles) {
        const filePath = path.join(this.logsDirectory, file);
        try {
          await unlinkAsync(filePath);
          console.log(`🗑️  Deleted: ${file}`);
        } catch (error) {
          console.warn(`⚠️  Could not delete ${file}:`, error);
        }
      }

      console.log(`✅ Complete cleanup finished: ${logFiles.length} files processed`);
    } catch (error) {
      console.error('❌ Error during complete cleanup:', error);
    }
  }

  // Get log statistics
  async getLogStats(): Promise<any> {
    if (!existsSync(this.logsDirectory)) {
      return { exists: false };
    }

    try {
      const files = await readdirAsync(this.logsDirectory);
      const logFiles = files.filter(file => file.endsWith('.log'));

      let totalSize = 0;
      let oldestFile = null;
      let newestFile = null;
      let oldestTime = Date.now();
      let newestTime = 0;

      for (const file of logFiles) {
        const filePath = path.join(this.logsDirectory, file);
        const stats = await statAsync(filePath);
        
        totalSize += stats.size;

        if (stats.mtime.getTime() < oldestTime) {
          oldestTime = stats.mtime.getTime();
          oldestFile = file;
        }

        if (stats.mtime.getTime() > newestTime) {
          newestTime = stats.mtime.getTime();
          newestFile = file;
        }
      }

      return {
        exists: true,
        totalFiles: logFiles.length,
        totalSize: totalSize,
        totalSizeFormatted: this.formatBytes(totalSize),
        oldestFile,
        newestFile,
        oldestAge: oldestFile ? Math.round((Date.now() - oldestTime) / (24 * 60 * 60 * 1000)) : 0,
        newestAge: newestFile ? Math.round((Date.now() - newestTime) / (24 * 60 * 60 * 1000)) : 0
      };
    } catch (error) {
      return { exists: true, error: error instanceof Error ? error.message : String(error) };
    }
  }
}