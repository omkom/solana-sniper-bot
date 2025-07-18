import * as winston from 'winston';
import { Config } from '../core/config';

const config = Config.getInstance();

const logLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    analysis: 3,
    debug: 4,
    verbose: 5
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    analysis: 'blue',
    debug: 'white',
    verbose: 'gray'
  }
};

export const logger = winston.createLogger({
  levels: logLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const ts = new Date(timestamp as string).toLocaleTimeString();
          let metaStr = '';
          if (Object.keys(meta).length) {
            try {
              metaStr = ` ${JSON.stringify(meta, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                  if (value.constructor === Object || Array.isArray(value)) {
                    return value;
                  }
                  return '[Object]';
                }
                return value;
              })}`;
            } catch (error) {
              metaStr = ` ${Object.keys(meta).map(key => `${key}=[Object]`).join(', ')}`;
            }
          }
          return `[${ts}] ${level}: ${message}${metaStr}`;
        })
      ),
      level: config.getLogLevel()
    }),
    
    new winston.transports.File({
      filename: 'logs/analyzer.log',
      level: 'verbose',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    
    new winston.transports.File({
      filename: 'logs/analysis.log',
      level: 'analysis',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 3
    }),
    
    new winston.transports.File({
      filename: 'logs/errors.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 3
    })
  ]
});

winston.addColors(logLevels.colors);

// Create logs directory if it doesn't exist
import { existsSync, mkdirSync } from 'fs';
if (!existsSync('logs')) {
  mkdirSync('logs');
}