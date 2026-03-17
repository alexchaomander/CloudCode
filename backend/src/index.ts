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
import mirrorRoutes from './terminal/mirror-routes.js';
import settingsRoutes from './settings/routes.js';
import { syncSessionStatus } from './sessions/service.js';
import { sidecarManager } from './terminal/sidecar-manager.js';
import { runMigrations } from './db/migrations.js';
import { db } from './db/index.js';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function buildApp(opts: any = {}) {
  // Ensure database is up to date
  runMigrations();

  const { sidecarSocketPath, ...fastifyOpts } = opts;
  const fastify = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : {
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
    ...fastifyOpts,
  });

  // Debug: Log all incoming requests
  fastify.addHook('onRequest', async (request) => {
    fastify.log.info({ 
      method: request.method, 
      url: request.url, 
      ip: request.ip,
      headers: {
        host: request.headers.host,
        origin: request.headers.origin,
        'user-agent': request.headers['user-agent']
      }
    }, 'Incoming Request');
  });

  let SESSION_SECRET = process.env.SESSION_SECRET;
  if (!SESSION_SECRET) {
    const existingSecret = db.prepare('SELECT value FROM settings WHERE key = ?').get('session_secret') as { value: string } | undefined;
    if (existingSecret) {
      SESSION_SECRET = existingSecret.value;
    } else {
      SESSION_SECRET = randomBytes(64).toString('hex');
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('session_secret', SESSION_SECRET);
      fastify.log.info('Generated new persistent SESSION_SECRET and saved to database');
    }
  }

  const TAILSCALE_ALLOWED_IDENTITIES = process.env.TAILSCALE_ALLOWED_IDENTITIES
    ? process.env.TAILSCALE_ALLOWED_IDENTITIES.split(',').map((s) => s.trim()).filter(Boolean)
    : null;

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

  // Register CORS
  await fastify.register(cors, {
    origin: true, // Allow all origins in dev/local network mode
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
  await sidecarManager.start(sidecarSocketPath);
  await fastify.register(authRoutes);
  await fastify.register(auditRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(repoRoutes);
  await fastify.register(sessionRoutes);
  await fastify.register(terminalRoutes);
  await fastify.register(mirrorRoutes);
  await fastify.register(settingsRoutes);

  // Serve frontend static files
  const possibleFrontendPaths = [
    join(__dirname, '..', '..', 'frontend', 'dist'), // Dev path
    join(__dirname, '..', 'frontend-dist'),         // Shipped package path
  ];
  
  const frontendDistPath = possibleFrontendPaths.find(p => existsSync(p));

  if (frontendDistPath) {
    await fastify.register(staticPlugin, {
      root: frontendDistPath,
      prefix: '/',
    });

    // Fallback to index.html for SPA routing (catch-all for non-API routes)
    fastify.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
        return reply.status(404).send({ error: 'Not Found', message: 'Route not found' });
      }
      return reply.sendFile('index.html', frontendDistPath);
    });
  } else if (process.env.NODE_ENV !== 'test') {
    fastify.log.warn('Frontend dist not found. Serving API only.');
  }

  // Health check endpoint
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Global error handler for better debugging
  fastify.setErrorHandler((error: any, request, reply) => {
    fastify.log.error({ err: error }, 'GLOBAL ERROR');
    const statusCode = error.statusCode || 500;
    
    reply.status(statusCode).send({
      error: error.name || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
      stack: error.stack,
    });
  });

  return fastify;
}

// Start the server if this file is run directly (legacy support or when using tsx directly)
const isMain = process.argv[1] === fileURLToPath(import.meta.url) || 
               process.argv[1] === fileURLToPath(import.meta.url).replace(/\.ts$/, '.js');

if (isMain && process.env.NODE_ENV !== 'test' && !process.argv.includes('start')) {
  const PORT = parseInt(process.env.PORT ?? '3000', 10);
  const HOST = process.env.HOST ?? '0.0.0.0';

  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`CloudCode backend listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}
