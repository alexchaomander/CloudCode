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
      eventType: z.string().optional(),
      actorUserId: z.string().optional(),
      targetType: z.string().optional(),
    });

    const parseResult = querySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid query parameters',
      });
    }

    const { page, limit, eventType, actorUserId, targetType } = parseResult.data;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (eventType) {
      conditions.push('a.event_type = ?');
      bindings.push(eventType);
    }
    if (actorUserId) {
      conditions.push('a.actor_user_id = ?');
      bindings.push(actorUserId);
    }
    if (targetType) {
      conditions.push('a.target_type = ?');
      bindings.push(targetType);
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
      actorUserId: row.actor_user_id,
      actorUsername: row.actor_username,
      eventType: row.event_type,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      createdAt: row.created_at,
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
