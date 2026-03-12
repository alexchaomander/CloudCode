import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import staticPlugin from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import authRoutes from './auth/routes.js';
import auditRoutes from './audit/routes.js';
import profileRoutes from './profiles/routes.js';
import repoRoutes from './repos/routes.js';
import sessionRoutes from './sessions/routes.js';
import terminalRoutes from './terminal/routes.js';
import settingsRoutes from './settings/routes.js';
import { syncSessionStatus } from './sessions/service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Environment variables
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'cloudcode-default-secret-change-in-production';
const TAILSCALE_ALLOWED_IDENTITIES = process.env.TAILSCALE_ALLOWED_IDENTITIES
  ? process.env.TAILSCALE_ALLOWED_IDENTITIES.split(',').map((s) => s.trim()).filter(Boolean)
  : null;

const fastify = Fastify({
  logger: {
    transport: process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

// Tailscale identity validation middleware
if (TAILSCALE_ALLOWED_IDENTITIES && TAILSCALE_ALLOWED_IDENTITIES.length > 0) {
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip static files and websocket upgrades
    if (request.url.startsWith('/assets/') || request.url.startsWith('/ws/')) {
      return;
    }

    // Skip non-API routes
    if (!request.url.startsWith('/api/')) {
      return;
    }

    const tailscaleUser = request.headers['x-tailscale-user'] as string | undefined;

    if (!tailscaleUser) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Tailscale identity required',
      });
    }

    if (!TAILSCALE_ALLOWED_IDENTITIES.includes(tailscaleUser)) {
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Tailscale identity "${tailscaleUser}" is not allowed`,
      });
    }
  });
}

async function start(): Promise<void> {
  // Register CORS
  await fastify.register(cors, {
    origin: process.env.APP_BASE_URL ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  // Register cookies
  await fastify.register(cookie, {
    secret: SESSION_SECRET,
    parseOptions: {},
  });

  // Register WebSocket support
  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // Register route plugins
  await fastify.register(authRoutes);
  await fastify.register(auditRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(repoRoutes);
  await fastify.register(sessionRoutes);
  await fastify.register(terminalRoutes);
  await fastify.register(settingsRoutes);

  // Serve frontend static files if the build exists
  const frontendDistPath = join(__dirname, '..', '..', 'frontend', 'dist');
  if (existsSync(frontendDistPath)) {
    await fastify.register(staticPlugin, {
      root: frontendDistPath,
      prefix: '/',
      decorateReply: false,
    });

    // Fallback to index.html for SPA routing (catch-all for non-API routes)
    fastify.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
        return reply.status(404).send({ error: 'Not Found', message: 'Route not found' });
      }
      return reply.sendFile('index.html', frontendDistPath);
    });
  } else {
    fastify.log.warn(`Frontend dist not found at ${frontendDistPath}. Serving API only.`);

    fastify.setNotFoundHandler(async (request, reply) => {
      return reply.status(404).send({ error: 'Not Found', message: 'Route not found' });
    });
  }

  // Health check endpoint
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Periodic session status sync (every 30 seconds)
  const syncInterval = setInterval(async () => {
    try {
      await syncSessionStatus();
    } catch (err) {
      fastify.log.error({ err }, 'Failed to sync session status');
    }
  }, 30_000);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info(`Received ${signal}, starting graceful shutdown...`);
    clearInterval(syncInterval);
    try {
      await fastify.close();
      fastify.log.info('Server closed successfully');
      process.exit(0);
    } catch (err) {
      fastify.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start listening
  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`CloudCode backend listening on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
