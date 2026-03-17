import type { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession } from './service.js';

// Augment FastifyRequest to include user info
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    isAdmin?: boolean;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies?.['session'];

  if (!token) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    return;
  }

  const session = validateSession(token);

  if (!session) {
    reply.clearCookie('session', { path: '/' });
    reply.status(401).send({ error: 'Unauthorized', message: 'Session expired or invalid' });
    return;
  }

  request.userId = session.userId;
  request.isAdmin = session.isAdmin;
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);

  if (reply.sent) return;

  if (!request.isAdmin) {
    reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
    return;
  }
}
