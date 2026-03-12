import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { existsSync, statSync } from 'fs';
import { db } from '../db/index.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { logAudit } from '../audit/service.js';
import type { RepoRoot } from '../db/schema.js';

const repoCreateSchema = z.object({
  label: z.string().min(1).max(256),
  absolute_path: z.string().min(1).startsWith('/'),
});

const repoUpdateSchema = repoCreateSchema.partial();

const repoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/repos
  fastify.get('/api/v1/repos', { preHandler: requireAuth }, async (request, reply) => {
    const rows = db.prepare('SELECT * FROM repo_roots ORDER BY label ASC').all() as RepoRoot[];
    return reply.send({ repos: rows });
  });

  // POST /api/v1/repos
  fastify.post('/api/v1/repos', { preHandler: requireAdmin }, async (request, reply) => {
    const parseResult = repoCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        issues: parseResult.error.errors,
      });
    }

    const { label, absolute_path } = parseResult.data;

    // Validate the path exists on the filesystem
    if (!existsSync(absolute_path)) {
      return reply.status(400).send({
        error: 'Invalid Path',
        message: `Path does not exist on the filesystem: ${absolute_path}`,
      });
    }

    const stat = statSync(absolute_path);
    if (!stat.isDirectory()) {
      return reply.status(400).send({
        error: 'Invalid Path',
        message: `Path is not a directory: ${absolute_path}`,
      });
    }

    // Check path uniqueness
    const existingPath = db.prepare('SELECT id FROM repo_roots WHERE absolute_path = ?').get(absolute_path);
    if (existingPath) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `A repo root with path "${absolute_path}" already exists`,
      });
    }

    const id = nanoid();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO repo_roots (id, label, absolute_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, label, absolute_path, now, now);

    const row = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as RepoRoot;

    logAudit({
      actorUserId: request.userId!,
      eventType: 'repo.created',
      targetType: 'repo_root',
      targetId: id,
      metadata: { label, absolute_path },
    });

    return reply.status(201).send({ repo: row });
  });

  // GET /api/v1/repos/:id
  fastify.get('/api/v1/repos/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as RepoRoot | undefined;

    if (!row) {
      return reply.status(404).send({ error: 'Not Found', message: 'Repo not found' });
    }

    return reply.send({ repo: row });
  });

  // PUT /api/v1/repos/:id
  fastify.put('/api/v1/repos/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as RepoRoot | undefined;

    if (!existing) {
      return reply.status(404).send({ error: 'Not Found', message: 'Repo not found' });
    }

    const parseResult = repoUpdateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        issues: parseResult.error.errors,
      });
    }

    const data = parseResult.data;
    const newPath = data.absolute_path ?? existing.absolute_path;

    // Validate new path if provided
    if (data.absolute_path) {
      if (!existsSync(data.absolute_path)) {
        return reply.status(400).send({
          error: 'Invalid Path',
          message: `Path does not exist on the filesystem: ${data.absolute_path}`,
        });
      }

      const stat = statSync(data.absolute_path);
      if (!stat.isDirectory()) {
        return reply.status(400).send({
          error: 'Invalid Path',
          message: `Path is not a directory: ${data.absolute_path}`,
        });
      }

      // Check uniqueness excluding self
      const pathConflict = db.prepare('SELECT id FROM repo_roots WHERE absolute_path = ? AND id != ?').get(data.absolute_path, id);
      if (pathConflict) {
        return reply.status(409).send({
          error: 'Conflict',
          message: `A repo root with path "${data.absolute_path}" already exists`,
        });
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE repo_roots SET label = ?, absolute_path = ?, updated_at = ?
      WHERE id = ?
    `).run(data.label ?? existing.label, newPath, now, id);

    const updated = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as RepoRoot;

    logAudit({
      actorUserId: request.userId!,
      eventType: 'repo.updated',
      targetType: 'repo_root',
      targetId: id,
      metadata: { changes: data },
    });

    return reply.send({ repo: updated });
  });

  // DELETE /api/v1/repos/:id
  fastify.delete('/api/v1/repos/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as RepoRoot | undefined;

    if (!existing) {
      return reply.status(404).send({ error: 'Not Found', message: 'Repo not found' });
    }

    // Check if any active sessions use this repo
    const activeSessions = db.prepare(`
      SELECT COUNT(*) as count FROM sessions
      WHERE repo_root_id = ? AND status IN ('pending', 'running')
    `).get(id) as { count: number };

    if (activeSessions.count > 0) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Cannot delete repo root with active sessions',
      });
    }

    db.prepare('DELETE FROM repo_roots WHERE id = ?').run(id);

    logAudit({
      actorUserId: request.userId!,
      eventType: 'repo.deleted',
      targetType: 'repo_root',
      targetId: id,
      metadata: { label: existing.label, absolute_path: existing.absolute_path },
    });

    return reply.status(204).send();
  });
};

export default repoRoutes;
