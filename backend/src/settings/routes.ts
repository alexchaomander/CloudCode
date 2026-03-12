import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { logAudit } from '../audit/service.js';

// In-memory settings with persistence via a simple key-value table
// We'll create a settings table if not present
function ensureSettingsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

ensureSettingsTable();

function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}

function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

// Sensitive keys that should never be returned in API responses
const SENSITIVE_KEYS = new Set(['session_secret', 'database_password']);

const settingsUpdateSchema = z.object({
  app_name: z.string().min(1).max(128).optional(),
  app_base_url: z.string().url().optional(),
  allow_registration: z.enum(['true', 'false']).optional(),
  session_timeout_days: z.coerce.number().int().min(1).max(365).optional(),
  tailscale_allowed_identities: z.string().optional(),
  max_sessions_per_user: z.coerce.number().int().min(1).max(100).optional(),
  terminal_poll_interval_ms: z.coerce.number().int().min(100).max(5000).optional(),
});

const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/settings
  fastify.get('/api/v1/settings', { preHandler: requireAuth }, async (request, reply) => {
    const all = getAllSettings();

    // Filter out sensitive keys
    const safe: Record<string, string> = {};
    for (const [key, value] of Object.entries(all)) {
      if (!SENSITIVE_KEYS.has(key)) {
        safe[key] = value;
      }
    }

    // Merge with env-based defaults
    const settings = {
      app_name: safe['app_name'] ?? 'CloudCode',
      app_base_url: safe['app_base_url'] ?? process.env.APP_BASE_URL ?? '',
      allow_registration: safe['allow_registration'] ?? 'false',
      session_timeout_days: safe['session_timeout_days'] ?? '30',
      tailscale_allowed_identities: safe['tailscale_allowed_identities'] ?? process.env.TAILSCALE_ALLOWED_IDENTITIES ?? '',
      max_sessions_per_user: safe['max_sessions_per_user'] ?? '10',
      terminal_poll_interval_ms: safe['terminal_poll_interval_ms'] ?? (process.env.TERMINAL_POLL_INTERVAL_MS ?? '500'),
      ...safe,
    };

    return reply.send({ settings });
  });

  // PUT /api/v1/settings
  fastify.put('/api/v1/settings', { preHandler: requireAdmin }, async (request, reply) => {
    const parseResult = settingsUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        issues: parseResult.error.errors,
      });
    }

    const data = parseResult.data;
    const changedKeys: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        setSetting(key, String(value));
        changedKeys.push(key);
      }
    }

    logAudit({
      actorUserId: request.userId!,
      eventType: 'settings.updated',
      metadata: { changed_keys: changedKeys },
    });

    // Return updated settings
    const all = getAllSettings();
    const safe: Record<string, string> = {};
    for (const [key, value] of Object.entries(all)) {
      if (!SENSITIVE_KEYS.has(key)) {
        safe[key] = value;
      }
    }

    return reply.send({
      message: 'Settings updated successfully',
      settings: safe,
    });
  });
};

export default settingsRoutes;
