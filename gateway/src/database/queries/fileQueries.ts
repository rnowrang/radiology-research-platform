import { query } from '../connection.js';

export interface FileRecord {
  id: string;
  project_id?: string;
  form_instance_id?: number;
  task_id?: number;
  uploaded_by_id: string;
  file_name: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  category?: string;
  storage_path: string;
  checksum?: string;
  is_encrypted: boolean;
  is_deleted: boolean;
  created_at: Date;
}

export interface FileWithUploader extends FileRecord {
  uploaded_by_name?: string;
  uploaded_by_email?: string;
  task_status?: string;
  task_title?: string;
}

export interface CreateFileData {
  project_id?: string;
  form_instance_id?: number;
  task_id?: number;
  uploaded_by_id: string;
  file_name: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  category?: string;
  storage_path: string;
  checksum?: string;
  is_encrypted?: boolean;
}

export const fileQueries = {
  createFile: async (data: CreateFileData): Promise<FileRecord> => {
    const result = await query<FileRecord>(
      `INSERT INTO files (
        project_id, form_instance_id, task_id, uploaded_by_id, file_name, original_file_name,
        file_size, mime_type, category, storage_path, checksum, is_encrypted
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        data.project_id || null,
        data.form_instance_id || null,
        data.task_id || null,
        data.uploaded_by_id,
        data.file_name,
        data.original_file_name,
        data.file_size,
        data.mime_type,
        data.category || 'other',
        data.storage_path,
        data.checksum || null,
        data.is_encrypted ?? false,
      ]
    );
    return result.rows[0];
  },

  findFileById: async (id: string): Promise<FileWithUploader | null> => {
    const result = await query<FileWithUploader>(
      `SELECT f.*, u.full_name as uploaded_by_name, u.email as uploaded_by_email,
              t.status as task_status, t.title as task_title
       FROM files f
       LEFT JOIN users u ON f.uploaded_by_id = u.id
       LEFT JOIN tasks t ON f.task_id = t.id
       WHERE f.id = $1 AND f.is_deleted = false`,
      [id]
    );
    return result.rows[0] || null;
  },

  findFilesByProjectId: async (
    projectId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ files: FileWithUploader[]; total: number }> => {
    const offset = (page - 1) * limit;

    const [filesResult, countResult] = await Promise.all([
      query<FileWithUploader>(
        `SELECT f.id, f.project_id, f.form_instance_id, f.task_id,
                f.uploaded_by_id, f.file_name, f.original_file_name,
                f.file_size, f.mime_type, f.category, f.storage_path,
                f.checksum, f.is_encrypted, f.is_deleted, f.created_at,
                u.full_name as uploaded_by_name, u.email as uploaded_by_email,
                t.status as task_status, t.title as task_title
         FROM files f
         LEFT JOIN users u ON f.uploaded_by_id = u.id
         LEFT JOIN tasks t ON f.task_id = t.id
         WHERE f.project_id = $1 AND f.is_deleted = false
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [projectId, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM files WHERE project_id = $1 AND is_deleted = false`,
        [projectId]
      ),
    ]);

    return {
      files: filesResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
    };
  },

  findFilesByFormId: async (
    formId: number,
    page: number = 1,
    limit: number = 50
  ): Promise<{ files: FileWithUploader[]; total: number }> => {
    const offset = (page - 1) * limit;

    const [filesResult, countResult] = await Promise.all([
      query<FileWithUploader>(
        `SELECT f.*, u.full_name as uploaded_by_name, u.email as uploaded_by_email
         FROM files f
         LEFT JOIN users u ON f.uploaded_by_id = u.id
         WHERE f.form_instance_id = $1 AND f.is_deleted = false
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [formId, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM files WHERE form_instance_id = $1 AND is_deleted = false`,
        [formId]
      ),
    ]);

    return {
      files: filesResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
    };
  },

  getFilesByTaskId: async (taskId: number): Promise<FileWithUploader[]> => {
    const result = await query<FileWithUploader>(
      `SELECT f.*, u.full_name as uploaded_by_name, u.email as uploaded_by_email
       FROM files f
       LEFT JOIN users u ON f.uploaded_by_id = u.id
       WHERE f.task_id = $1 AND f.is_deleted = false
       ORDER BY f.created_at DESC`,
      [taskId]
    );
    return result.rows;
  },

  softDeleteFile: async (id: string): Promise<boolean> => {
    const result = await query(
      `UPDATE files SET is_deleted = true WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  updateFile: async (id: string, updates: Partial<FileRecord>): Promise<FileRecord | null> => {
    const allowedFields = ['category', 'is_encrypted'];
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
      return fileQueries.findFileById(id);
    }

    values.push(id);

    const result = await query<FileRecord>(
      `UPDATE files SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex} AND is_deleted = false
       RETURNING *`,
      values
    );

    return result.rows[0] || null;
  },

  checkFileAccess: async (
    fileId: string,
    userId: string
  ): Promise<{ hasAccess: boolean; isOwner: boolean }> => {
    // Check if user uploaded the file
    const ownerResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM files WHERE id = $1 AND uploaded_by_id = $2 AND is_deleted = false`,
      [fileId, userId]
    );

    if (parseInt(ownerResult.rows[0]?.count || '0', 10) > 0) {
      return { hasAccess: true, isOwner: true };
    }

    // Check if user has access through project
    const projectAccessResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM files f
       LEFT JOIN projects p ON f.project_id = p.id
       LEFT JOIN project_collaborators pc ON p.id = pc.project_id
       WHERE f.id = $1
         AND f.is_deleted = false
         AND (p.principal_investigator_id = $2 OR pc.user_id = $2)`,
      [fileId, userId]
    );

    if (parseInt(projectAccessResult.rows[0]?.count || '0', 10) > 0) {
      return { hasAccess: true, isOwner: false };
    }

    return { hasAccess: false, isOwner: false };
  },
};

export default fileQueries;
