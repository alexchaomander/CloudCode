import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../auth/middleware.js';
import { listSessions } from '../sessions/service.js';

const mirrorRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/terminal/tmux-sessions - list CloudCode-managed live sessions for mirroring
  fastify.get('/api/v1/terminal/tmux-sessions', { preHandler: requireAuth }, async (request, reply) => {
    try {
      const sessions = listSessions();
      const filteredSessions = sessions.filter((session) => session.status === 'running' || session.status === 'starting');
      return reply.send(filteredSessions);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to list tmux sessions' });
    }
  });
};

export default mirrorRoutes;
