import { query } from '../connection.js';

export type SearchResultType = 'project' | 'form' | 'user' | 'file';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  description?: string;
  subtitle?: string;
  link: string;
  rank: number;
  created_at: Date;
}

export interface PaginatedSearchResults {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchFilters {
  type?: SearchResultType | 'all';
  userId: string;
  page?: number;
  limit?: number;
}

/**
 * Full-text search across multiple tables using PostgreSQL tsvector
 */
export const searchQueries = {
  /**
   * Perform a paginated full-text search across projects, forms, users, and files
   */
  search: async (
    searchQuery: string,
    filters: SearchFilters
  ): Promise<PaginatedSearchResults> => {
    const { type = 'all', userId, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Prepare the search query for PostgreSQL full-text search
    // Convert to tsquery format - handle special characters and spaces
    const sanitizedQuery = searchQuery
      .trim()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => `${word}:*`)
      .join(' & ');

    if (!sanitizedQuery) {
      return { results: [], total: 0, page, limit, totalPages: 0 };
    }

    const unions: string[] = [];
    const countUnions: string[] = [];
    let paramIndex = 1;
    const params: unknown[] = [];
    const countParams: unknown[] = [];

    // Projects search (user must be PI or collaborator)
    if (type === 'all' || type === 'project') {
      unions.push(`
        SELECT
          p.id::text as id,
          'project' as type,
          p.title as title,
          p.description as description,
          COALESCE(p.department, p.project_type) as subtitle,
          '/projects/' || p.id as link,
          ts_rank(
            to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')),
            to_tsquery('english', $${paramIndex})
          ) as rank,
          p.created_at
        FROM projects p
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''))
          @@ to_tsquery('english', $${paramIndex})
          OR p.title ILIKE $${paramIndex + 1}
          OR p.description ILIKE $${paramIndex + 1}
        )
        AND (p.principal_investigator_id = $${paramIndex + 2} OR pc.user_id = $${paramIndex + 2} OR p.is_public = true)
      `);
      countUnions.push(`
        SELECT DISTINCT p.id
        FROM projects p
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''))
          @@ to_tsquery('english', $${paramIndex})
          OR p.title ILIKE $${paramIndex + 1}
          OR p.description ILIKE $${paramIndex + 1}
        )
        AND (p.principal_investigator_id = $${paramIndex + 2} OR pc.user_id = $${paramIndex + 2} OR p.is_public = true)
      `);
      params.push(sanitizedQuery, `%${searchQuery}%`, userId);
      countParams.push(sanitizedQuery, `%${searchQuery}%`, userId);
      paramIndex += 3;
    }

    // Forms search (user must have access to the project or be the owner)
    if (type === 'all' || type === 'form') {
      unions.push(`
        SELECT
          fi.id::text as id,
          'form' as type,
          fi.title as title,
          t.name as description,
          fi.status as subtitle,
          '/forms/' || fi.id as link,
          ts_rank(
            to_tsvector('english', COALESCE(fi.title, '')),
            to_tsquery('english', $${paramIndex})
          ) as rank,
          fi.created_at
        FROM form_instances fi
        LEFT JOIN templates t ON fi.template_id = t.id
        LEFT JOIN projects p ON fi.project_id = p.id
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(fi.title, ''))
          @@ to_tsquery('english', $${paramIndex})
          OR fi.title ILIKE $${paramIndex + 1}
        )
        AND (
          fi.owner_id = $${paramIndex + 2}
          OR p.principal_investigator_id = $${paramIndex + 2}
          OR pc.user_id = $${paramIndex + 2}
        )
      `);
      countUnions.push(`
        SELECT DISTINCT fi.id
        FROM form_instances fi
        LEFT JOIN projects p ON fi.project_id = p.id
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(fi.title, ''))
          @@ to_tsquery('english', $${paramIndex})
          OR fi.title ILIKE $${paramIndex + 1}
        )
        AND (
          fi.owner_id = $${paramIndex + 2}
          OR p.principal_investigator_id = $${paramIndex + 2}
          OR pc.user_id = $${paramIndex + 2}
        )
      `);
      params.push(sanitizedQuery, `%${searchQuery}%`, userId);
      countParams.push(sanitizedQuery, `%${searchQuery}%`, userId);
      paramIndex += 3;
    }

    // Users search (only active users)
    if (type === 'all' || type === 'user') {
      unions.push(`
        SELECT
          u.id::text as id,
          'user' as type,
          u.full_name as title,
          u.email as description,
          u.role as subtitle,
          '/admin/users?id=' || u.id as link,
          ts_rank(
            to_tsvector('english', COALESCE(u.full_name, '') || ' ' || COALESCE(u.email, '')),
            to_tsquery('english', $${paramIndex})
          ) as rank,
          u.created_at
        FROM users u
        WHERE (
          to_tsvector('english', COALESCE(u.full_name, '') || ' ' || COALESCE(u.email, ''))
          @@ to_tsquery('english', $${paramIndex})
          OR u.full_name ILIKE $${paramIndex + 1}
          OR u.email ILIKE $${paramIndex + 1}
        )
        AND u.is_active = true
      `);
      countUnions.push(`
        SELECT u.id
        FROM users u
        WHERE (
          to_tsvector('english', COALESCE(u.full_name, '') || ' ' || COALESCE(u.email, ''))
          @@ to_tsquery('english', $${paramIndex})
          OR u.full_name ILIKE $${paramIndex + 1}
          OR u.email ILIKE $${paramIndex + 1}
        )
        AND u.is_active = true
      `);
      params.push(sanitizedQuery, `%${searchQuery}%`);
      countParams.push(sanitizedQuery, `%${searchQuery}%`);
      paramIndex += 2;
    }

    // Files search (user must have uploaded or have project access)
    if (type === 'all' || type === 'file') {
      unions.push(`
        SELECT
          f.id::text as id,
          'file' as type,
          f.original_file_name as title,
          f.category as description,
          pg_size_pretty(f.file_size) as subtitle,
          '/files/' || f.id as link,
          ts_rank(
            to_tsvector('english', COALESCE(f.file_name, '') || ' ' || COALESCE(f.original_file_name, '')),
            to_tsquery('english', $${paramIndex})
          ) as rank,
          f.created_at
        FROM files f
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(f.file_name, '') || ' ' || COALESCE(f.original_file_name, ''))
          @@ to_tsquery('english', $${paramIndex})
          OR f.file_name ILIKE $${paramIndex + 1}
          OR f.original_file_name ILIKE $${paramIndex + 1}
        )
        AND f.is_deleted = false
        AND (
          f.uploaded_by_id = $${paramIndex + 2}
          OR p.principal_investigator_id = $${paramIndex + 2}
          OR pc.user_id = $${paramIndex + 2}
        )
      `);
      countUnions.push(`
        SELECT DISTINCT f.id
        FROM files f
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(f.file_name, '') || ' ' || COALESCE(f.original_file_name, ''))
          @@ to_tsquery('english', $${paramIndex})
          OR f.file_name ILIKE $${paramIndex + 1}
          OR f.original_file_name ILIKE $${paramIndex + 1}
        )
        AND f.is_deleted = false
        AND (
          f.uploaded_by_id = $${paramIndex + 2}
          OR p.principal_investigator_id = $${paramIndex + 2}
          OR pc.user_id = $${paramIndex + 2}
        )
      `);
      params.push(sanitizedQuery, `%${searchQuery}%`, userId);
      countParams.push(sanitizedQuery, `%${searchQuery}%`, userId);
      paramIndex += 3;
    }

    if (unions.length === 0) {
      return { results: [], total: 0, page, limit, totalPages: 0 };
    }

    // Add pagination params
    const limitParamIndex = paramIndex;
    const offsetParamIndex = paramIndex + 1;
    params.push(limit, offset);

    const searchSql = `
      SELECT * FROM (
        SELECT DISTINCT ON (id, type) * FROM (
          ${unions.join(' UNION ALL ')}
        ) AS all_results
        ORDER BY id, type, rank DESC
      ) AS combined
      ORDER BY rank DESC, created_at DESC
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    `;

    const countSql = `
      SELECT COUNT(*) as count FROM (
        ${countUnions.join(' UNION ')}
      ) AS combined
    `;

    const [resultsResult, countResult] = await Promise.all([
      query<SearchResult>(searchSql, params),
      query<{ count: string }>(countSql, countParams),
    ]);

    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    return {
      results: resultsResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Quick search for autocomplete - returns limited results per type
   */
  quickSearch: async (
    searchQuery: string,
    userId: string,
    limitPerType: number = 5
  ): Promise<{ [key in SearchResultType]?: SearchResult[] }> => {
    const sanitizedQuery = searchQuery
      .trim()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => `${word}:*`)
      .join(' & ');

    if (!sanitizedQuery) {
      return {};
    }

    const likePattern = `%${searchQuery}%`;

    // Run all searches in parallel for speed
    const [projectsResult, formsResult, usersResult, filesResult] = await Promise.all([
      // Projects
      query<SearchResult>(
        `SELECT DISTINCT ON (p.id)
          p.id::text as id,
          'project' as type,
          p.title as title,
          p.description as description,
          COALESCE(p.department, p.project_type) as subtitle,
          '/projects/' || p.id as link,
          ts_rank(
            to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, '')),
            to_tsquery('english', $1)
          ) as rank,
          p.created_at
        FROM projects p
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(p.title, '') || ' ' || COALESCE(p.description, ''))
          @@ to_tsquery('english', $1)
          OR p.title ILIKE $2
          OR p.description ILIKE $2
        )
        AND (p.principal_investigator_id = $3 OR pc.user_id = $3 OR p.is_public = true)
        ORDER BY p.id, rank DESC
        LIMIT $4`,
        [sanitizedQuery, likePattern, userId, limitPerType]
      ),

      // Forms
      query<SearchResult>(
        `SELECT DISTINCT ON (fi.id)
          fi.id::text as id,
          'form' as type,
          fi.title as title,
          t.name as description,
          fi.status as subtitle,
          '/forms/' || fi.id as link,
          ts_rank(
            to_tsvector('english', COALESCE(fi.title, '')),
            to_tsquery('english', $1)
          ) as rank,
          fi.created_at
        FROM form_instances fi
        LEFT JOIN templates t ON fi.template_id = t.id
        LEFT JOIN projects p ON fi.project_id = p.id
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(fi.title, ''))
          @@ to_tsquery('english', $1)
          OR fi.title ILIKE $2
        )
        AND (
          fi.owner_id = $3
          OR p.principal_investigator_id = $3
          OR pc.user_id = $3
        )
        ORDER BY fi.id, rank DESC
        LIMIT $4`,
        [sanitizedQuery, likePattern, userId, limitPerType]
      ),

      // Users
      query<SearchResult>(
        `SELECT
          u.id::text as id,
          'user' as type,
          u.full_name as title,
          u.email as description,
          u.role as subtitle,
          '/admin/users?id=' || u.id as link,
          ts_rank(
            to_tsvector('english', COALESCE(u.full_name, '') || ' ' || COALESCE(u.email, '')),
            to_tsquery('english', $1)
          ) as rank,
          u.created_at
        FROM users u
        WHERE (
          to_tsvector('english', COALESCE(u.full_name, '') || ' ' || COALESCE(u.email, ''))
          @@ to_tsquery('english', $1)
          OR u.full_name ILIKE $2
          OR u.email ILIKE $2
        )
        AND u.is_active = true
        ORDER BY rank DESC
        LIMIT $3`,
        [sanitizedQuery, likePattern, limitPerType]
      ),

      // Files
      query<SearchResult>(
        `SELECT DISTINCT ON (f.id)
          f.id::text as id,
          'file' as type,
          f.original_file_name as title,
          f.category as description,
          pg_size_pretty(f.file_size) as subtitle,
          '/files/' || f.id as link,
          ts_rank(
            to_tsvector('english', COALESCE(f.file_name, '') || ' ' || COALESCE(f.original_file_name, '')),
            to_tsquery('english', $1)
          ) as rank,
          f.created_at
        FROM files f
        LEFT JOIN projects p ON f.project_id = p.id
        LEFT JOIN project_collaborators pc ON p.id = pc.project_id
        WHERE (
          to_tsvector('english', COALESCE(f.file_name, '') || ' ' || COALESCE(f.original_file_name, ''))
          @@ to_tsquery('english', $1)
          OR f.file_name ILIKE $2
          OR f.original_file_name ILIKE $2
        )
        AND f.is_deleted = false
        AND (
          f.uploaded_by_id = $3
          OR p.principal_investigator_id = $3
          OR pc.user_id = $3
        )
        ORDER BY f.id, rank DESC
        LIMIT $4`,
        [sanitizedQuery, likePattern, userId, limitPerType]
      ),
    ]);

    const result: { [key in SearchResultType]?: SearchResult[] } = {};

    if (projectsResult.rows.length > 0) {
      result.project = projectsResult.rows;
    }
    if (formsResult.rows.length > 0) {
      result.form = formsResult.rows;
    }
    if (usersResult.rows.length > 0) {
      result.user = usersResult.rows;
    }
    if (filesResult.rows.length > 0) {
      result.file = filesResult.rows;
    }

    return result;
  },
};

export default searchQueries;
