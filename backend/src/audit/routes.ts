import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import type { AuditLog } from '../db/schema.js';

const auditRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/audit - returns audit log entries with pagination
  fastify.get('/api/v1/audit', { preHandler: requireAdmin }, async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      event_type: z.string().optional(),
      actor_user_id: z.string().optional(),
      target_type: z.string().optional(),
    });

    const parseResult = querySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid query parameters',
      });
    }

    const { page, limit, event_type, actor_user_id, target_type } = parseResult.data;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (event_type) {
      conditions.push('a.event_type = ?');
      bindings.push(event_type);
    }
    if (actor_user_id) {
      conditions.push('a.actor_user_id = ?');
      bindings.push(actor_user_id);
    }
    if (target_type) {
      conditions.push('a.target_type = ?');
      bindings.push(target_type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM audit_logs a ${whereClause}
    `).get(...bindings) as { total: number };

    const rows = db.prepare(`
      SELECT
        a.id,
        a.actor_user_id,
        u.username as actor_username,
        a.event_type,
        a.target_type,
        a.target_id,
        a.metadata_json,
        a.created_at
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...bindings, limit, offset) as Array<AuditLog & { actor_username: string | null }>;

    const entries = rows.map((row) => ({
      id: row.id,
      actor_user_id: row.actor_user_id,
      actor_username: row.actor_username,
      event_type: row.event_type,
      target_type: row.target_type,
      target_id: row.target_id,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      created_at: row.created_at,
    }));

    return reply.send({
      entries,
      pagination: {
        page,
        limit,
        total: countResult.total,
        pages: Math.ceil(countResult.total / limit),
      },
    });
  });
};

export default auditRoutes;
