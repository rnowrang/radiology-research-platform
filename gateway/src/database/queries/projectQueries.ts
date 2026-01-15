import { query } from '../connection.js';
import { Project } from '../../types/index.js';

interface ProjectWithOwner extends Project {
  principal_investigator_name?: string;
  principal_investigator_email?: string;
}

export const projectQueries = {
  findById: async (id: string): Promise<ProjectWithOwner | null> => {
    const result = await query<ProjectWithOwner>(
      `SELECT p.*, u.full_name as principal_investigator_name, u.email as principal_investigator_email
       FROM projects p
       LEFT JOIN users u ON p.principal_investigator_id = u.id
       WHERE p.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  findAll: async (
    page: number = 1,
    limit: number = 20,
    filters: {
      status?: string;
      department?: string;
      piId?: string;
      search?: string;
    } = {}
  ): Promise<{ projects: ProjectWithOwner[]; total: number }> => {
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`p.status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.department) {
      conditions.push(`p.department = $${paramIndex}`);
      params.push(filters.department);
      paramIndex++;
    }

    if (filters.piId) {
      conditions.push(`p.principal_investigator_id = $${paramIndex}`);
      params.push(filters.piId);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(`(p.title ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [projectsResult, countResult] = await Promise.all([
      query<ProjectWithOwner>(
        `SELECT p.*, u.full_name as principal_investigator_name, u.email as principal_investigator_email
         FROM projects p
         LEFT JOIN users u ON p.principal_investigator_id = u.id
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM projects p ${whereClause}`,
        params
      ),
    ]);

    return {
      projects: projectsResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
    };
  },

  findByUserId: async (userId: string, page: number = 1, limit: number = 20): Promise<{ projects: ProjectWithOwner[]; total: number }> => {
    const offset = (page - 1) * limit;

    const [projectsResult, countResult] = await Promise.all([
      query<ProjectWithOwner>(
        `SELECT DISTINCT p.*, u.full_name as principal_investigator_name, u.email as principal_investigator_email
         FROM projects p
         LEFT JOIN users u ON p.principal_investigator_id = u.id
         LEFT JOIN project_collaborators pc ON p.id = pc.project_id
         WHERE p.principal_investigator_id = $1 OR pc.user_id = $1
         ORDER BY p.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(DISTINCT p.id) as count
         FROM projects p
         LEFT JOIN project_collaborators pc ON p.id = pc.project_id
         WHERE p.principal_investigator_id = $1 OR pc.user_id = $1`,
        [userId]
      ),
    ]);

    return {
      projects: projectsResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
    };
  },

  create: async (
    title: string,
    principalInvestigatorId: string,
    data: Partial<Project> = {}
  ): Promise<Project> => {
    const result = await query<Project>(
      `INSERT INTO projects (title, principal_investigator_id, description, project_type, department, start_date, end_date, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        title,
        principalInvestigatorId,
        data.description || null,
        data.project_type || null,
        data.department || null,
        data.start_date || null,
        data.end_date || null,
        data.is_public ?? false,
      ]
    );
    return result.rows[0];
  },

  update: async (id: string, updates: Partial<Project>): Promise<Project | null> => {
    const allowedFields = ['title', 'description', 'project_type', 'department', 'status', 'start_date', 'end_date', 'is_public'];
    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return projectQueries.findById(id);
    }

    values.push(id);

    const result = await query<Project>(
      `UPDATE projects SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  },

  delete: async (id: string): Promise<boolean> => {
    const result = await query(
      `DELETE FROM projects WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  addCollaborator: async (projectId: string, userId: string, role: string): Promise<boolean> => {
    try {
      await query(
        `INSERT INTO project_collaborators (project_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3`,
        [projectId, userId, role]
      );
      return true;
    } catch {
      return false;
    }
  },

  removeCollaborator: async (projectId: string, userId: string): Promise<boolean> => {
    const result = await query(
      `DELETE FROM project_collaborators WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  getCollaborators: async (projectId: string): Promise<Array<{ user_id: string; full_name: string; email: string; role: string }>> => {
    const result = await query<{ user_id: string; full_name: string; email: string; role: string }>(
      `SELECT pc.user_id, u.full_name, u.email, pc.role
       FROM project_collaborators pc
       JOIN users u ON pc.user_id = u.id
       WHERE pc.project_id = $1`,
      [projectId]
    );
    return result.rows;
  },
};

export default projectQueries;
