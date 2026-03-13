import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import os from 'node:os';
import {
  hashPassword,
  verifyPassword,
  createSession,
  invalidateSession,
  getUserById,
  getUserByUsername,
  updateLastLogin,
  countUsers,
  createUser,
} from './service.js';
import { requireAuth } from './middleware.js';
import { logAudit } from '../audit/service.js';

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1),
});

const bootstrapSchema = z.object({
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8),
});

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/auth/bootstrap - create first admin user
  fastify.post('/api/v1/auth/bootstrap', async (request, reply) => {
    const userCount = countUsers();
    if (userCount > 0) {
      return reply.status(409).send({
        error: 'Conflict',
        message: 'Bootstrap already completed. Users already exist.',
      });
    }

    const parseResult = bootstrapSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        issues: parseResult.error.errors,
      });
    }

    const { username, password } = parseResult.data;
    const passwordHash = await hashPassword(password);
    const user = createUser(username, passwordHash, true);

    logAudit({
      actorUserId: user.id,
      eventType: 'user.bootstrap',
      targetType: 'user',
      targetId: user.id,
      metadata: { username },
    });

    const ip = request.ip ?? '';
    const userAgent = request.headers['user-agent'] ?? '';
    const tailscaleIdentity = (request.headers['x-tailscale-user'] as string) ?? null;
    const token = createSession(user.id, ip, userAgent, tailscaleIdentity);

    reply.setCookie('session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    });

    return reply.status(201).send({
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin === 1,
        totp_enabled: user.totp_enabled === 1,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login_at: user.last_login_at,
      },
    });
  });

  // POST /api/v1/auth/login
  fastify.post('/api/v1/auth/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: parseResult.error.errors[0]?.message ?? 'Invalid input',
        issues: parseResult.error.errors,
      });
    }

    const { username, password } = parseResult.data;
    const user = getUserByUsername(username);

    if (!user) {
      // Constant-time response to prevent username enumeration
      await hashPassword('dummy-password-to-prevent-timing-attack');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid username or password',
      });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      logAudit({
        actorUserId: null,
        eventType: 'auth.login_failed',
        targetType: 'user',
        targetId: user.id,
        metadata: { username, ip: request.ip },
      });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid username or password',
      });
    }

    updateLastLogin(user.id);

    const ip = request.ip ?? '';
    const userAgent = request.headers['user-agent'] ?? '';
    const tailscaleIdentity = (request.headers['x-tailscale-user'] as string) ?? null;
    const token = createSession(user.id, ip, userAgent, tailscaleIdentity);

    logAudit({
      actorUserId: user.id,
      eventType: 'auth.login',
      targetType: 'user',
      targetId: user.id,
      metadata: { ip: request.ip, userAgent },
    });

    reply.setCookie('session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin === 1,
        totp_enabled: user.totp_enabled === 1,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login_at: user.last_login_at,
      },
    });
  });

  // GET /api/v1/auth/bootstrap-status - login page uses this to redirect to /bootstrap
  fastify.get('/api/v1/auth/bootstrap-status', async (_request, reply) => {
    return reply.send({ 
      needsBootstrap: countUsers() === 0,
      suggestedUsername: os.userInfo().username
    });
  });

  // POST /api/v1/auth/logout
  fastify.post('/api/v1/auth/logout', async (request, reply) => {
    const token = request.cookies?.['session'];
    if (token) {
      invalidateSession(token);
      if (request.userId) {
        logAudit({
          actorUserId: request.userId,
          eventType: 'auth.logout',
          targetType: 'user',
          targetId: request.userId,
        });
      }
    }
    reply.clearCookie('session', { path: '/' });
    return reply.send({ message: 'Logged out successfully' });
  });

  // GET /api/v1/auth/me
  fastify.get('/api/v1/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = getUserById(request.userId!);
    if (!user) {
      reply.clearCookie('session', { path: '/' });
      return reply.status(401).send({ error: 'Unauthorized', message: 'User not found' });
    }

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin === 1,
        totp_enabled: user.totp_enabled === 1,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login_at: user.last_login_at,
      },
    });
  });
};

export default authRoutes;
