import type { FastifyPluginAsync } from 'fastify';
import { listSessions } from '../tmux/adapter.js';
import { requireAuth } from '../auth/middleware.js';

const mirrorRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/terminal/tmux-sessions - list all active tmux sessions for mirroring
  fastify.get('/api/v1/terminal/tmux-sessions', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const sessions = await listSessions();
      // Filter out CloudCode-managed sessions if we want a clean "Mirror" list, 
      // but showing all is more powerful for "Remote Control"
      return reply.send(sessions);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to list tmux sessions' });
    }
  });
};

export default mirrorRoutes;
