import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { db } from '../db/index.js';
import * as tmux from '../tmux/adapter.js';
import {
  createSession,
  stopSession,
  killSession,
  deleteSession,
  archiveSession,
  getSession,
  getSessionByPublicId,
  listSessions,
  getRecentSessions,
  getRecentAgents,
  getRecentPaths,
} from './service.js';

const sessionCreateSchema = z.object({
  title: z.string().min(1).max(256),
  agentProfileId: z.string().min(1),
  repoRootId: z.string().nullable().optional(),
  workdir: z.string().nullable().optional(),
  startupPrompt: z.string().nullable().optional(),
});

const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/sessions
  fastify.get('/api/v1/sessions', { preHandler: requireAuth }, async (request, reply) => {
    const querySchema = z.object({
      archived: z.enum(['true', 'false']).optional(),
      status: z.string().optional(),
      agentProfileId: z.string().optional(),
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
      agentProfileId: query.agentProfileId,
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
        agentProfileId: data.agentProfileId,
        repoRootId: data.repoRootId ?? null,
        workdir: data.workdir ?? null,
        startupPrompt: data.startupPrompt ?? null,
        userId: request.userId!,
      });

      return reply.status(201).send({ session });
    } catch (err) {
      fastify.log.error({ err }, 'CREATE SESSION FAILED');
      const message = err instanceof Error ? err.message : 'Failed to create session';
      // Use 400 for validation errors, 500 for unexpected ones
      const statusCode = (err instanceof Error && (
        err.message.includes('not found') || 
        err.message.includes('security') || 
        err.message.includes('Invalid') ||
        err.message.includes('directory')
      )) ? 400 : 500;
      
      return reply.status(statusCode).send({ 
        error: statusCode === 400 ? 'Bad Request' : 'Internal Server Error', 
        message,
        stack: err instanceof Error ? err.stack : undefined
      });
    }
  });

  // GET /api/v1/sessions/recent
  fastify.get('/api/v1/sessions/recent', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const recent = getRecentSessions();
      const agents = getRecentAgents();
      const paths = getRecentPaths();
      return reply.send({ recent, agents, paths });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Internal Server Error', message: err instanceof Error ? err.message : String(err) });
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

  // DELETE /api/v1/sessions/:id
  fastify.delete('/api/v1/sessions/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id) ?? getSessionByPublicId(id);

    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    try {
      await deleteSession(session.id, request.userId!);
      return reply.send({ message: 'Session deleted' });
    } catch (err) {
      fastify.log.error({ err }, 'DELETE SESSION FAILED');
      const message = err instanceof Error ? err.message : 'Failed to delete session';
      return reply.status(500).send({ error: 'Internal Server Error', message });
    }
  });

};

export default sessionRoutes;
