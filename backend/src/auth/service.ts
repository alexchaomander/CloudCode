import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import type { AuthSession, User } from '../db/schema.js';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(
  userId: string,
  ip: string,
  userAgent: string,
  tailscaleIdentity: string | null
): string {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const id = nanoid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, session_token_hash, created_at, expires_at, ip_address, user_agent, tailscale_identity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    tokenHash,
    now.toISOString(),
    expiresAt.toISOString(),
    ip || null,
    userAgent || null,
    tailscaleIdentity
  );

  return token;
}

export function validateSession(token: string): { userId: string; isAdmin: boolean } | null {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date().toISOString();

  const session = db.prepare(`
    SELECT s.user_id, u.is_admin
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token_hash = ?
      AND s.expires_at > ?
  `).get(tokenHash, now) as { user_id: string; is_admin: number } | undefined;

  if (!session) return null;

  return {
    userId: session.user_id,
    isAdmin: session.is_admin === 1,
  };
}

export function invalidateSession(token: string): void {
  if (!token) return;
  const tokenHash = hashToken(token);
  db.prepare('DELETE FROM auth_sessions WHERE session_token_hash = ?').run(tokenHash);
}

export function getUserById(id: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByUsername(username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
}

export function updateLastLogin(userId: string): void {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
}

export function countUsers(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return result.count;
}

export function createUser(username: string, passwordHash: string, isAdmin: boolean): User {
  const id = nanoid();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, is_admin, totp_enabled)
    VALUES (?, ?, ?, ?, 0)
  `).run(id, username, passwordHash, isAdmin ? 1 : 0);

  return getUserById(id)!;
}

export function cleanExpiredSessions(): void {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now);
}
