import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { existsSync, statSync } from 'fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { db } from '../db/index.js';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { logAudit } from '../audit/service.js';
import type { RepoRoot } from '../db/schema.js';
import { discoverProjects } from './service.js';

function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return join(homedir(), p.slice(1));
  }
  return p;
}

function parseRepo(row: RepoRoot) {
  return {
    id: row.id,
    label: row.label,
    absolutePath: row.absolute_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const repoCreateSchema = z.object({
  label: z.string().min(1).max(256),
  absolutePath: z.string().min(1),
});

const repoUpdateSchema = repoCreateSchema.partial();

const repoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/repos
  fastify.get('/api/v1/repos', { preHandler: requireAuth }, async (request, reply) => {
    const rows = db.prepare('SELECT * FROM repo_roots ORDER BY label ASC').all() as unknown as RepoRoot[];
    return reply.send({ repos: rows.map(parseRepo) });
  });

  // GET /api/v1/repos/discover
  fastify.get('/api/v1/repos/discover', { preHandler: requireAuth }, async (request, reply) => {
    const projects = discoverProjects();
    return reply.send({ projects });
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

    const { label, absolutePath } = parseResult.data;
    const expandedPath = expandPath(absolutePath);

    // Validate the path exists on the filesystem
    if (!existsSync(expandedPath)) {
      return reply.status(400).send({
        error: 'Invalid Path',
        message: `Path does not exist on the filesystem: ${expandedPath}`,
      });
    }

    const stat = statSync(expandedPath);
    if (!stat.isDirectory()) {
      return reply.status(400).send({
        error: 'Invalid Path',
        message: `Path is not a directory: ${expandedPath}`,
      });
    }

    // Check path uniqueness
    const existingPath = db.prepare('SELECT id FROM repo_roots WHERE absolute_path = ?').get(absolutePath);
    if (existingPath) {
      return reply.status(409).send({
        error: 'Conflict',
        message: `A repo root with path "${absolutePath}" already exists`,
      });
    }

    const id = nanoid();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO repo_roots (id, label, absolute_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, label, absolutePath, now, now);

    const row = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as unknown as RepoRoot;

    logAudit({
      actorUserId: request.userId!,
      eventType: 'repo.created',
      targetType: 'repo_root',
      targetId: id,
      metadata: { label, absolutePath },
    });

    return reply.status(201).send({ repo: parseRepo(row) });
  });

  // GET /api/v1/repos/:id
  fastify.get('/api/v1/repos/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as unknown as RepoRoot | undefined;

    if (!row) {
      return reply.status(404).send({ error: 'Not Found', message: 'Repo not found' });
    }

    return reply.send({ repo: parseRepo(row) });
  });

  // PUT /api/v1/repos/:id
  fastify.put('/api/v1/repos/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as unknown as RepoRoot | undefined;

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
    const newPath = data.absolutePath ?? existing.absolute_path;
    const expandedNewPath = expandPath(newPath);

    // Validate new path if provided
    if (data.absolutePath) {
      if (!existsSync(expandedNewPath)) {
        return reply.status(400).send({
          error: 'Invalid Path',
          message: `Path does not exist on the filesystem: ${expandedNewPath}`,
        });
      }

      const stat = statSync(expandedNewPath);
      if (!stat.isDirectory()) {
        return reply.status(400).send({
          error: 'Invalid Path',
          message: `Path is not a directory: ${expandedNewPath}`,
        });
      }

      // Check uniqueness excluding self
      const pathConflict = db.prepare('SELECT id FROM repo_roots WHERE absolute_path = ? AND id != ?').get(data.absolutePath, id);
      if (pathConflict) {
        return reply.status(409).send({
          error: 'Conflict',
          message: `A repo root with path "${data.absolutePath}" already exists`,
        });
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE repo_roots SET label = ?, absolute_path = ?, updated_at = ?
      WHERE id = ?
    `).run(data.label ?? existing.label, newPath, now, id);

    const updated = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as unknown as RepoRoot;

    logAudit({
      actorUserId: request.userId!,
      eventType: 'repo.updated',
      targetType: 'repo_root',
      targetId: id,
      metadata: { changes: data },
    });

    return reply.send({ repo: parseRepo(updated) });
  });

  // DELETE /api/v1/repos/:id
  fastify.delete('/api/v1/repos/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(id) as unknown as RepoRoot | undefined;

    if (!existing) {
      return reply.status(404).send({ error: 'Not Found', message: 'Repo not found' });
    }

    // Check if any active sessions use this profile
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
