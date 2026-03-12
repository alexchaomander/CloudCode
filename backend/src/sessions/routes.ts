import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import {
  createSession,
  stopSession,
  killSession,
  archiveSession,
  getSession,
  listSessions,
} from './service.js';

const sessionCreateSchema = z.object({
  title: z.string().min(1).max(256),
  agent_profile_id: z.string().min(1),
  repo_root_id: z.string().nullable().optional(),
  workdir: z.string().nullable().optional(),
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
    const session = getSession(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    return reply.send({ session });
  });

  // POST /api/v1/sessions/:id/stop
  fastify.post('/api/v1/sessions/:id/stop', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    try {
      await stopSession(id, request.userId!);
      return reply.send({ message: 'Session stopped', session: getSession(id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to stop session';
      return reply.status(400).send({ error: 'Bad Request', message });
    }
  });

  // POST /api/v1/sessions/:id/kill
  fastify.post('/api/v1/sessions/:id/kill', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    try {
      await killSession(id, request.userId!);
      return reply.send({ message: 'Session killed', session: getSession(id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to kill session';
      return reply.status(400).send({ error: 'Bad Request', message });
    }
  });

  // POST /api/v1/sessions/:id/archive
  fastify.post('/api/v1/sessions/:id/archive', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    try {
      archiveSession(id, request.userId!);
      return reply.send({ message: 'Session archived', session: getSession(id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to archive session';
      return reply.status(400).send({ error: 'Bad Request', message });
    }
  });
};

export default sessionRoutes;
