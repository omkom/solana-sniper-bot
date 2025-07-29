/**
 * Action Logs API
 * REST API endpoints for accessing token action logs
 */

import { Request, Response } from 'express';
import { TokenActionLogger } from '../monitoring/token-action-logger';
import { logger } from '../monitoring/logger';

export class ActionLogsAPI {
  constructor(private actionLogger: TokenActionLogger) {}

  /**
   * Get recent action logs
   * GET /api/action-logs?limit=50&type=DETECTED&category=DISCOVERY
   */
  getActionLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const type = req.query.type as string;
      const category = req.query.category as string;

      const actions = this.actionLogger.getRecentActions(limit, type, category);

      res.json({
        success: true,
        data: actions,
        meta: {
          count: actions.length,
          limit,
          filters: { type, category }
        }
      });

    } catch (error) {
      logger.error('Error fetching action logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch action logs',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get action log statistics
   * GET /api/action-logs/stats
   */
  getActionStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = this.actionLogger.getStats();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error fetching action stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch action stats',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get actions for specific token
   * GET /api/action-logs/token/:address?limit=20
   */
  getTokenActions = async (req: Request, res: Response): Promise<void> => {
    try {
      const tokenAddress = req.params.address;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!tokenAddress) {
        res.status(400).json({
          success: false,
          error: 'Token address is required'
        });
        return;
      }

      const actions = this.actionLogger.getTokenActions(tokenAddress, limit);

      res.json({
        success: true,
        data: actions,
        meta: {
          tokenAddress,
          count: actions.length,
          limit
        }
      });

    } catch (error) {
      logger.error('Error fetching token actions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch token actions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Clear action logs (for testing)
   * POST /api/action-logs/clear
   */
  clearActionLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      this.actionLogger.clearActions();

      res.json({
        success: true,
        message: 'Action logs cleared successfully'
      });

    } catch (error) {
      logger.error('Error clearing action logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to clear action logs',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * Get action logger status
   * GET /api/action-logs/status
   */
  getLoggerStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = this.actionLogger.getStatus();

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Error fetching logger status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch logger status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}