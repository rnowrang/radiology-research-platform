import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { searchService } from '../services/searchService.js';
import { SearchResultType } from '../database/queries/searchQueries.js';
import { ValidationError } from '../utils/errors.js';

export const searchController = {
  /**
   * GET /api/search
   * Full search with pagination and type filtering
   *
   * Query params:
   * - q: search query (required)
   * - type: 'all' | 'projects' | 'forms' | 'users' | 'files' (default: 'all')
   * - page: page number (default: 1)
   * - limit: results per page (default: 20, max: 100)
   */
  search: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const searchQuery = req.query.q as string;
      const typeParam = (req.query.type as string) || 'all';
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!searchQuery || searchQuery.trim().length === 0) {
        throw new ValidationError('Search query is required');
      }

      // Map plural type names to singular for the query
      const typeMap: Record<string, SearchResultType | 'all'> = {
        all: 'all',
        projects: 'project',
        project: 'project',
        forms: 'form',
        form: 'form',
        users: 'user',
        user: 'user',
        files: 'file',
        file: 'file',
      };

      const type = typeMap[typeParam.toLowerCase()] || 'all';

      const results = await searchService.performSearch(
        {
          query: searchQuery,
          type,
          page,
          limit,
        },
        req.user!.id
      );

      res.json({
        success: true,
        data: results.results,
        pagination: {
          page: results.page,
          limit: results.limit,
          total: results.total,
          totalPages: results.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/search/quick
   * Quick search for autocomplete functionality
   *
   * Query params:
   * - q: search query (required, min 2 characters)
   */
  quickSearch: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const searchQuery = req.query.q as string;

      if (!searchQuery || searchQuery.trim().length < 2) {
        // Return empty results for short queries instead of error
        res.json({
          success: true,
          data: {
            projects: [],
            forms: [],
            users: [],
            files: [],
          },
        });
        return;
      }

      const results = await searchService.quickSearch(searchQuery, req.user!.id);

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default searchController;
