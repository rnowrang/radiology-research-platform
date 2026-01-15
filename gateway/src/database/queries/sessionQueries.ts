import { query } from '../connection.js';
import { Session } from '../../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export const sessionQueries = {
  create: async (
    userId: string,
    expiresAt: Date,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Session> => {
    const id = uuidv4();
    const sessionToken = uuidv4();
    const refreshToken = uuidv4();

    const result = await query<Session>(
      `INSERT INTO sessions (id, user_id, session_token, refresh_token, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, userId, sessionToken, refreshToken, ipAddress || null, userAgent || null, expiresAt]
    );

    return result.rows[0];
  },

  findById: async (id: string): Promise<Session | null> => {
    const result = await query<Session>(
      `SELECT * FROM sessions WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  findByRefreshToken: async (refreshToken: string): Promise<Session | null> => {
    const result = await query<Session>(
      `SELECT * FROM sessions
       WHERE refresh_token = $1 AND is_revoked = false AND expires_at > NOW()`,
      [refreshToken]
    );
    return result.rows[0] || null;
  },

  findActiveByUserId: async (userId: string): Promise<Session[]> => {
    const result = await query<Session>(
      `SELECT * FROM sessions
       WHERE user_id = $1 AND is_revoked = false AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  revoke: async (id: string): Promise<boolean> => {
    const result = await query(
      `UPDATE sessions SET is_revoked = true WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  revokeAllForUser: async (userId: string): Promise<number> => {
    const result = await query(
      `UPDATE sessions SET is_revoked = true WHERE user_id = $1 AND is_revoked = false`,
      [userId]
    );
    return result.rowCount ?? 0;
  },

  updateLastActivity: async (id: string): Promise<boolean> => {
    const result = await query(
      `UPDATE sessions SET last_activity_at = NOW() WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  extend: async (id: string, newExpiresAt: Date): Promise<Session | null> => {
    const result = await query<Session>(
      `UPDATE sessions
       SET expires_at = $1, last_activity_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newExpiresAt, id]
    );
    return result.rows[0] || null;
  },

  cleanupExpired: async (): Promise<number> => {
    const result = await query(
      `DELETE FROM sessions WHERE expires_at < NOW() OR is_revoked = true`,
      []
    );
    return result.rowCount ?? 0;
  },
};

export default sessionQueries;
