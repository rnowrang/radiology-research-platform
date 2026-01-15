import { query } from '../connection.js';
import { Notification } from '../../types/index.js';

export interface CreateNotificationData {
  user_id: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const notificationQueries = {
  findByUserId: async (
    userId: string,
    pagination: PaginationParams = {}
  ): Promise<PaginatedResult<Notification>> => {
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1`,
      [userId]
    );
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get paginated results
    const result = await query<Notification>(
      `SELECT id, user_id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  create: async (data: CreateNotificationData): Promise<Notification> => {
    const result = await query<Notification>(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.user_id, data.type, data.title, data.message || null, data.link || null]
    );
    return result.rows[0];
  },

  createMany: async (notifications: CreateNotificationData[]): Promise<Notification[]> => {
    if (notifications.length === 0) return [];

    const values: unknown[] = [];
    const placeholders: string[] = [];

    notifications.forEach((n, index) => {
      const offset = index * 5;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
      values.push(n.user_id, n.type, n.title, n.message || null, n.link || null);
    });

    const result = await query<Notification>(
      `INSERT INTO notifications (user_id, type, title, message, link)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values
    );

    return result.rows;
  },

  markAsRead: async (id: number, userId: string): Promise<Notification | null> => {
    const result = await query<Notification>(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );
    return result.rows[0] || null;
  },

  markAllAsRead: async (userId: string): Promise<number> => {
    const result = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return result.rowCount ?? 0;
  },

  delete: async (id: number, userId: string): Promise<boolean> => {
    const result = await query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  countUnread: async (userId: string): Promise<number> => {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM notifications
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    return parseInt(result.rows[0]?.count || '0', 10);
  },

  findById: async (id: number): Promise<Notification | null> => {
    const result = await query<Notification>(
      `SELECT * FROM notifications WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },
};

export default notificationQueries;
