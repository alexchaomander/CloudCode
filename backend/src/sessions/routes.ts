import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth/middleware.js';
import { db } from '../db/index.js';
import * as tmux from '../tmux/adapter.js';
import {
  createSession,
  stopSession,
  killSession,
  archiveSession,
  getSession,
  getSessionByPublicId,
  listSessions,
} from './service.js';
import type { SessionSnapshot } from '../db/schema.js';

const sessionCreateSchema = z.object({
  title: z.string().min(1).max(256),
  agent_profile_id: z.string().min(1),
  repo_root_id: z.string().nullable().optional(),
  workdir: z.string().nullable().optional(),
  startup_prompt: z.string().nullable().optional(),
});

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/sessions
  fastify.get('/api/v1/sessions', { preHandler: requireAuth }, async (request, reply) => {
    const querySchema = z.object({
      archived: z.enum(['true', 'false']).optional(),
      status: z.string().optional(),
      agent_profile_id: z.string().optional(),
    });

    const parseResult = querySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid query parameters',
      });
    }

    const query = parseResult.data;
    const sessions = listSessions({
      archived: query.archived !== undefined ? query.archived === 'true' : undefined,
      status: query.status,
      agentProfileId: query.agent_profile_id,
    });

    return reply.send({ sessions });
  });

  // POST /api/v1/sessions
  fastify.post('/api/v1/sessions', { preHandler: requireAuth }, async (request, reply) => {
    const parseResult = sessionCreateSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        issues: parseResult.error.errors,
      });
    }

    const data = parseResult.data;

    try {
      const session = await createSession({
        title: data.title,
        agentProfileId: data.agent_profile_id,
        repoRootId: data.repo_root_id ?? null,
        workdir: data.workdir ?? null,
        startupPrompt: data.startup_prompt ?? null,
        userId: request.userId!,
      });

      return reply.status(201).send({ session });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      return reply.status(500).send({ error: 'Internal Server Error', message });
    }
  });

  // GET /api/v1/sessions/:id
  fastify.get('/api/v1/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id) ?? getSessionByPublicId(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    return reply.send({ session });
  });

  // POST /api/v1/sessions/:id/stop
  fastify.post('/api/v1/sessions/:id/stop', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id) ?? getSessionByPublicId(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    try {
      await stopSession(session.id, request.userId!);
      return reply.send({ message: 'Session stopped', session: getSession(session.id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop session';
      return reply.status(400).send({ error: 'Bad Request', message });
    }
  });

  // POST /api/v1/sessions/:id/kill
  fastify.post('/api/v1/sessions/:id/kill', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id) ?? getSessionByPublicId(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    try {
      await killSession(session.id, request.userId!);
      return reply.send({ message: 'Session killed', session: getSession(session.id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to kill session';
      return reply.status(400).send({ error: 'Bad Request', message });
    }
  });

  // POST /api/v1/sessions/:id/archive
  fastify.post('/api/v1/sessions/:id/archive', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id) ?? getSessionByPublicId(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    try {
      archiveSession(session.id, request.userId!);
      return reply.send({ message: 'Session archived', session: getSession(session.id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive session';
      return reply.status(400).send({ error: 'Bad Request', message });
    }
  });

  // GET /api/v1/sessions/:id/snapshots
  fastify.get('/api/v1/sessions/:id/snapshots', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id) ?? getSessionByPublicId(id);
    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }
    const snapshots = db.prepare(
      'SELECT * FROM session_snapshots WHERE session_id = ? ORDER BY created_at DESC'
    ).all(session.id) as SessionSnapshot[];
    return reply.send({ snapshots });
  });

  // POST /api/v1/sessions/:id/snapshots - capture current pane content
  fastify.post('/api/v1/sessions/:id/snapshots', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id) ?? getSessionByPublicId(id);
    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    let content = '';
    try {
      content = await tmux.capturePane(session.tmux_session_name);
    } catch {
      // Session may be stopped; snapshot whatever we have
    }

    const snapshotId = nanoid();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO session_snapshots (id, session_id, snapshot_type, content_text, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(snapshotId, session.id, 'manual', content, now);

    const snapshot = db.prepare('SELECT * FROM session_snapshots WHERE id = ?').get(snapshotId) as SessionSnapshot;
    return reply.status(201).send({ snapshot });
  });
};

export default sessionRoutes;
