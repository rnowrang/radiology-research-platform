import { query, transaction } from '../connection.js';
import { User } from '../../types/index.js';

interface UserRow extends User {
  password_hash: string;
  locked_until: Date | null;
  failed_login_attempts: number;
}

export const userQueries = {
  findByEmail: async (email: string): Promise<UserRow | null> => {
    const result = await query<UserRow>(
      `SELECT id, email, password_hash, full_name, role, is_active,
              email_verified, locked_until, failed_login_attempts,
              created_at, updated_at
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    return result.rows[0] || null;
  },

  findById: async (id: string): Promise<User | null> => {
    const result = await query<User>(
      `SELECT id, email, full_name, role, is_active, email_verified,
              created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  findAll: async (page: number = 1, limit: number = 20): Promise<{ users: User[]; total: number }> => {
    const offset = (page - 1) * limit;

    const [usersResult, countResult] = await Promise.all([
      query<User>(
        `SELECT id, email, full_name, role, is_active, email_verified,
                created_at, updated_at
         FROM users
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query<{ count: string }>('SELECT COUNT(*) as count FROM users', []),
    ]);

    return {
      users: usersResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0', 10),
    };
  },

  create: async (
    email: string,
    passwordHash: string,
    fullName: string,
    role: string = 'researcher'
  ): Promise<User> => {
    const result = await query<User>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, role, is_active, email_verified, created_at, updated_at`,
      [email.toLowerCase(), passwordHash, fullName, role]
    );
    return result.rows[0];
  },

  update: async (id: string, updates: Partial<User>): Promise<User | null> => {
    const allowedFields = ['full_name', 'role', 'is_active', 'email_verified'];
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
      return userQueries.findById(id);
    }

    values.push(id);

    const result = await query<User>(
      `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING id, email, full_name, role, is_active, email_verified, created_at, updated_at`,
      values
    );

    return result.rows[0] || null;
  },

  updatePassword: async (id: string, passwordHash: string): Promise<boolean> => {
    const result = await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  incrementFailedLoginAttempts: async (id: string): Promise<number> => {
    const result = await query<{ failed_login_attempts: number }>(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING failed_login_attempts`,
      [id]
    );
    return result.rows[0]?.failed_login_attempts || 0;
  },

  lockAccount: async (id: string, lockedUntil: Date): Promise<boolean> => {
    const result = await query(
      `UPDATE users SET locked_until = $1, updated_at = NOW() WHERE id = $2`,
      [lockedUntil, id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  resetLoginAttempts: async (id: string): Promise<boolean> => {
    const result = await query(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  updateLastLogin: async (id: string): Promise<boolean> => {
    const result = await query(
      `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  setPasswordResetToken: async (id: string, token: string, expires: Date): Promise<boolean> => {
    const result = await query(
      `UPDATE users
       SET password_reset_token = $1, password_reset_expires = $2, updated_at = NOW()
       WHERE id = $3`,
      [token, expires, id]
    );
    return (result.rowCount ?? 0) > 0;
  },

  findByPasswordResetToken: async (token: string): Promise<User | null> => {
    const result = await query<User & { password_reset_expires: Date }>(
      `SELECT id, email, full_name, role, is_active, email_verified,
              created_at, updated_at, password_reset_expires
       FROM users
       WHERE password_reset_token = $1 AND password_reset_expires > NOW()`,
      [token]
    );
    return result.rows[0] || null;
  },

  clearPasswordResetToken: async (id: string): Promise<boolean> => {
    const result = await query(
      `UPDATE users
       SET password_reset_token = NULL, password_reset_expires = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  },
};

export default userQueries;
