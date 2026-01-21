import { query } from '../connection.js';

export interface TaskStatusHistoryRecord {
  id: number;
  task_id: number;
  status: string;
  performed_by_id: string | null;
  performed_by_name: string | null;
  comments: string | null;
  created_at: Date;
}

export const taskQueries = {
  /**
   * Get status history for a specific task
   */
  getTaskStatusHistory: async (taskId: number): Promise<TaskStatusHistoryRecord[]> => {
    const result = await query<TaskStatusHistoryRecord>(
      `SELECT tsh.id, tsh.task_id, tsh.status, tsh.performed_by_id,
              u.full_name as performed_by_name, tsh.comments, tsh.created_at
       FROM task_status_history tsh
       LEFT JOIN users u ON tsh.performed_by_id = u.id
       WHERE tsh.task_id = $1
       ORDER BY tsh.created_at ASC`,
      [taskId]
    );
    return result.rows;
  },

  /**
   * Get status history for multiple tasks at once (batch query)
   */
  getTasksStatusHistory: async (taskIds: number[]): Promise<Map<number, TaskStatusHistoryRecord[]>> => {
    if (taskIds.length === 0) {
      return new Map();
    }

    const result = await query<TaskStatusHistoryRecord>(
      `SELECT tsh.id, tsh.task_id, tsh.status, tsh.performed_by_id,
              u.full_name as performed_by_name, tsh.comments, tsh.created_at
       FROM task_status_history tsh
       LEFT JOIN users u ON tsh.performed_by_id = u.id
       WHERE tsh.task_id = ANY($1)
       ORDER BY tsh.task_id, tsh.created_at ASC`,
      [taskIds]
    );

    const historyMap = new Map<number, TaskStatusHistoryRecord[]>();
    for (const record of result.rows) {
      const existing = historyMap.get(record.task_id) || [];
      existing.push(record);
      historyMap.set(record.task_id, existing);
    }

    return historyMap;
  },

  /**
   * Add a status change record for a task
   */
  addTaskStatusHistory: async (
    taskId: number,
    status: string,
    performedById?: string,
    comments?: string
  ): Promise<TaskStatusHistoryRecord> => {
    const result = await query<TaskStatusHistoryRecord>(
      `INSERT INTO task_status_history (task_id, status, performed_by_id, comments)
       VALUES ($1, $2, $3, $4)
       RETURNING id, task_id, status, performed_by_id, comments, created_at`,
      [taskId, status, performedById || null, comments || null]
    );
    return result.rows[0];
  },
};

export default taskQueries;
