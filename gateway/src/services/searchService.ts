import { searchQueries, SearchResultType, SearchResult, PaginatedSearchResults } from '../database/queries/searchQueries.js';
import { logger } from '../utils/logger.js';

export interface SearchParams {
  query: string;
  type?: SearchResultType | 'all';
  page?: number;
  limit?: number;
}

export interface QuickSearchResult {
  projects?: SearchResult[];
  forms?: SearchResult[];
  users?: SearchResult[];
  files?: SearchResult[];
}

export const searchService = {
  /**
   * Perform a full search with pagination
   * Searches across projects, forms, users, and files
   */
  performSearch: async (
    params: SearchParams,
    userId: string
  ): Promise<PaginatedSearchResults> => {
    const { query: searchQuery, type = 'all', page = 1, limit = 20 } = params;

    if (!searchQuery || searchQuery.trim().length === 0) {
      return {
        results: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      };
    }

    // Validate limit
    const validatedLimit = Math.min(Math.max(1, limit), 100);
    const validatedPage = Math.max(1, page);

    try {
      logger.info(`Search request: query="${searchQuery}", type=${type}, page=${validatedPage}, limit=${validatedLimit}, userId=${userId}`);

      const results = await searchQueries.search(searchQuery, {
        type,
        userId,
        page: validatedPage,
        limit: validatedLimit,
      });

      logger.info(`Search returned ${results.total} total results`);

      return results;
    } catch (error) {
      logger.error('Search service error:', error);
      throw error;
    }
  },

  /**
   * Quick search for autocomplete functionality
   * Returns a limited number of results per type for faster response
   */
  quickSearch: async (
    query: string,
    userId: string,
    limitPerType: number = 5
  ): Promise<QuickSearchResult> => {
    if (!query || query.trim().length === 0) {
      return {};
    }

    // Minimum query length for quick search
    if (query.trim().length < 2) {
      return {};
    }

    try {
      logger.debug(`Quick search: query="${query}", userId=${userId}`);

      const results = await searchQueries.quickSearch(query, userId, limitPerType);

      // Transform the results to use plural keys for frontend convenience
      const transformed: QuickSearchResult = {};

      if (results.project) {
        transformed.projects = results.project;
      }
      if (results.form) {
        transformed.forms = results.form;
      }
      if (results.user) {
        transformed.users = results.user;
      }
      if (results.file) {
        transformed.files = results.file;
      }

      const totalCount = Object.values(transformed).reduce((sum, arr) => sum + (arr?.length || 0), 0);
      logger.debug(`Quick search returned ${totalCount} results`);

      return transformed;
    } catch (error) {
      logger.error('Quick search service error:', error);
      throw error;
    }
  },

  /**
   * Get search suggestions based on recent searches or popular terms
   * This can be expanded in the future to include personalized suggestions
   */
  getSuggestions: async (userId: string, limit: number = 5): Promise<string[]> => {
    // For now, return empty array
    // This could be enhanced to track and return recent searches per user
    return [];
  },
};

export default searchService;
