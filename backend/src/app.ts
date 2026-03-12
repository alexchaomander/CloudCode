import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import path from 'node:path';
import { loadEnv } from './env.js';
import { openDb } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { seedProfiles } from './db/seed.js';
import { randomToken, hashToken } from './utils/auth.js';
import { validateWorkdir } from './utils/paths.js';
import { TmuxError, TmuxService, type TmuxClient } from './tmux/tmux.js';

const idParamSchema = z.object({ id: z.string().min(1) });
const bootstrapSchema = z.object({ username: z.string().min(2), password: z.string().min(8) });
const loginSchema = bootstrapSchema;
const repoSchema = z.object({ label: z.string().min(1), absolute_path: z.string().min(1) });
const profileCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  command: z.string().min(1),
  args_json: z.array(z.string()).default([]),
  env_json: z.record(z.string()).default({}),
  default_workdir: z.string().optional(),
  startup_template: z.string().optional()
});
const profileUpdateSchema = profileCreateSchema.partial();
const sessionCreateSchema = z.object({
  title: z.string().min(1),
  agent_profile_id: z.number().int().positive(),
  repo_root_id: z.number().int().positive(),
  workdir: z.string().min(1),
  startup_prompt: z.string().optional()
});
const snapshotCreateSchema = z.object({ content_text: z.string().min(1).max(5000) });

export async function buildApp(overrides?: { dbPath?: string; tmux?: TmuxClient }) {
  const env = loadEnv();
  const app = Fastify({ logger: true });
  const db = openDb(overrides?.dbPath || env.DATABASE_PATH);
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  const fallbackMigrationsDir = path.resolve(process.cwd(), '..', 'migrations');
  runMigrations(db, migrationsDir);
  runMigrations(db, fallbackMigrationsDir);
  seedProfiles(db);
  const tmux = overrides?.tmux ?? new TmuxService(env.TMUX_BINARY_PATH);

  await app.register(cors, { origin: env.APP_BASE_URL, credentials: true });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(websocket);

  app.decorateRequest('user', null);
  const loginAttempts = new Map<string, { count: number; last: number }>();

  function key(ip: string, username: string) {
    return `${ip}:${username}`;
  }

  function tooManyAttempts(ip: string, username: string) {
    const k = key(ip, username);
    const record = loginAttempts.get(k);
    if (!record) return false;
    if (Date.now() - record.last > 15 * 60 * 1000) {
      loginAttempts.delete(k);
      return false;
    }
    return record.count >= 6;
  }

  function markFailure(ip: string, username: string) {
    const k = key(ip, username);
    const prev = loginAttempts.get(k);
    loginAttempts.set(k, { count: (prev?.count ?? 0) + 1, last: Date.now() });
  }

  function clearFailures(ip: string, username: string) {
    loginAttempts.delete(key(ip, username));
  }

  app.addHook('preHandler', async (req) => {
    const token = req.cookies.cloudcode_session;
    req.user = null;
    if (!token) return;
    const session = db
      .prepare(
        `SELECT u.id, u.username
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.session_token_hash = ? AND s.expires_at > datetime('now')`
      )
      .get(hashToken(token)) as { id: number; username: string } | undefined;
    if (session) req.user = session;
  });

  function tailscaleIdentity(req: any) {
    return req.headers['tailscale-user-login'] || req.headers['x-tailscale-user'];
  }

  function requireAuth(req: any, reply: any) {
    if (!req.user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  app.get('/api/v1/health', () => ({ ok: true }));
  app.get('/api/v1/auth/bootstrap/status', () => {
    const hasUsers = !!db.prepare('SELECT id FROM users LIMIT 1').get();
    return { needsBootstrap: !hasUsers };
  });

  app.post('/api/v1/auth/bootstrap', async (req, reply) => {
    const parsed = bootstrapSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message });

    const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (existing) return reply.code(409).send({ error: 'Already bootstrapped' });

    const hash = await argon2.hash(parsed.data.password);
    db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run(parsed.data.username, hash);
    db.prepare('INSERT INTO audit_logs (event_type, target_type, metadata_json) VALUES (?, ?, ?)').run(
      'auth.bootstrap',
      'user',
      JSON.stringify({ username: parsed.data.username })
    );
    return { ok: true };
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message });
    const { username, password } = parsed.data;

    if (tooManyAttempts(req.ip, username)) return reply.code(429).send({ error: 'Too many login attempts. Try again later.' });

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !(await argon2.verify(user.password_hash, password))) {
      markFailure(req.ip, username);
      db.prepare('INSERT INTO audit_logs (event_type, metadata_json) VALUES (?, ?)').run('auth.login_failure', JSON.stringify({ username }));
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const identity = tailscaleIdentity(req) as string | undefined;
    if (env.TAILSCALE_ALLOWED_IDENTITIES.length > 0 && (!identity || !env.TAILSCALE_ALLOWED_IDENTITIES.includes(identity))) {
      return reply.code(403).send({ error: 'Unapproved Tailscale identity' });
    }

    clearFailures(req.ip, username);

    const token = randomToken();
    const tokenHash = hashToken(token);
    db.prepare(
      `INSERT INTO auth_sessions (user_id, session_token_hash, expires_at, ip_address, user_agent, tailscale_identity)
       VALUES (?, ?, datetime('now', '+7 days'), ?, ?, ?)`
    ).run(user.id, tokenHash, req.ip, req.headers['user-agent'] || null, identity || null);
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    db.prepare('INSERT INTO audit_logs (actor_user_id, event_type, target_type, target_id) VALUES (?, ?, ?, ?)').run(
      user.id,
      'auth.login_success',
      'user',
      String(user.id)
    );
    reply.setCookie('cloudcode_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      signed: false
    });
    return { ok: true };
  });

  app.post('/api/v1/auth/logout', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const token = req.cookies.cloudcode_session;
    if (token) db.prepare('DELETE FROM auth_sessions WHERE session_token_hash = ?').run(hashToken(token));
    reply.clearCookie('cloudcode_session', { path: '/' });
    return { ok: true };
  });

  app.get('/api/v1/auth/me', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return { user: req.user };
  });

  app.get('/api/v1/profiles', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return db.prepare('SELECT * FROM agent_profiles ORDER BY id').all();
  });

  app.post('/api/v1/profiles', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = profileCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message });
    const p = parsed.data;
    const res = db.prepare(`INSERT INTO agent_profiles (name, slug, command, args_json, env_json, default_workdir, startup_template)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(p.name, p.slug, p.command, JSON.stringify(p.args_json), JSON.stringify(p.env_json), p.default_workdir || null, p.startup_template || null);
    return { id: res.lastInsertRowid };
  });

  app.patch('/api/v1/profiles/:id', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    const body = profileUpdateSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });

    const existing = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(params.data.id) as any;
    if (!existing) return reply.code(404).send({ error: 'Profile not found' });

    const merged = {
      ...existing,
      ...body.data,
      args_json: body.data.args_json ? JSON.stringify(body.data.args_json) : existing.args_json,
      env_json: body.data.env_json ? JSON.stringify(body.data.env_json) : existing.env_json
    };

    db.prepare(`UPDATE agent_profiles SET name=?, slug=?, command=?, args_json=?, env_json=?, default_workdir=?, startup_template=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(merged.name, merged.slug, merged.command, merged.args_json, merged.env_json, merged.default_workdir || null, merged.startup_template || null, params.data.id);
    return { ok: true };
  });

  app.delete('/api/v1/profiles/:id', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    db.prepare('DELETE FROM agent_profiles WHERE id = ?').run(params.data.id);
    return { ok: true };
  });

  app.get('/api/v1/repos', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return db.prepare('SELECT * FROM repo_roots ORDER BY id').all();
  });

  app.post('/api/v1/repos', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = repoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message });
    const result = db.prepare('INSERT INTO repo_roots (label, absolute_path) VALUES (?, ?)').run(parsed.data.label, parsed.data.absolute_path);
    return { id: result.lastInsertRowid };
  });

  app.get('/api/v1/sessions', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return db.prepare(`SELECT s.*, p.name as profile_name, r.label as repo_label FROM sessions s JOIN agent_profiles p ON p.id=s.agent_profile_id JOIN repo_roots r ON r.id=s.repo_root_id WHERE s.archived=0 ORDER BY s.updated_at DESC`).all();
  });

  app.post('/api/v1/sessions', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = sessionCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message });
    const body = parsed.data;

    const profile = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(body.agent_profile_id) as any;
    const repo = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(body.repo_root_id) as any;
    if (!profile || !repo) return reply.code(400).send({ error: 'Invalid profile or repo root' });

    let resolvedWorkdir = '';
    try {
      resolvedWorkdir = validateWorkdir(repo.absolute_path, body.workdir || '.');
    } catch {
      return reply.code(400).send({ error: 'Invalid workdir path' });
    }

    const publicId = nanoid(10);
    const tmuxSessionName = `cloudcode-${publicId}`;

    try {
      await tmux.createSession(tmuxSessionName, resolvedWorkdir, profile.command, JSON.parse(profile.args_json));
      if (body.startup_prompt) {
        await tmux.sendKeys(tmuxSessionName, body.startup_prompt);
        await tmux.sendEnter(tmuxSessionName);
      }
    } catch (error) {
      if (error instanceof TmuxError) return reply.code(502).send({ error: error.message });
      return reply.code(500).send({ error: 'Failed to start session' });
    }

    const result = db.prepare(`INSERT INTO sessions (public_id,title,agent_profile_id,repo_root_id,workdir,tmux_session_name,status,started_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, 'running', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(publicId, body.title, body.agent_profile_id, body.repo_root_id, resolvedWorkdir, tmuxSessionName);

    db.prepare('INSERT INTO session_snapshots (session_id, snapshot_type, content_text) VALUES (?, ?, ?)').run(result.lastInsertRowid, 'system_event', `Session created with profile ${profile.name}`);
    db.prepare('INSERT INTO audit_logs (actor_user_id,event_type,target_type,target_id,metadata_json) VALUES (?, ?, ?, ?, ?)').run(req.user!.id, 'session.created', 'session', String(result.lastInsertRowid), JSON.stringify({ publicId, workdir: resolvedWorkdir }));

    return { public_id: publicId };
  });

  app.get('/api/v1/sessions/:id', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    const session = db.prepare('SELECT * FROM sessions WHERE public_id = ?').get(params.data.id);
    if (!session) return reply.code(404).send({ error: 'Not found' });
    return session;
  });

  app.get('/api/v1/sessions/:id/snapshots', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    const session = db.prepare('SELECT id FROM sessions WHERE public_id = ?').get(params.data.id) as { id: number } | undefined;
    if (!session) return reply.code(404).send({ error: 'Not found' });
    return db.prepare('SELECT * FROM session_snapshots WHERE session_id = ? ORDER BY id DESC LIMIT 100').all(session.id);
  });

  app.post('/api/v1/sessions/:id/snapshots', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    const body = snapshotCreateSchema.safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    const session = db.prepare('SELECT id FROM sessions WHERE public_id = ?').get(params.data.id) as { id: number } | undefined;
    if (!session) return reply.code(404).send({ error: 'Not found' });
    db.prepare('INSERT INTO session_snapshots (session_id, snapshot_type, content_text) VALUES (?, ?, ?)').run(session.id, 'manual_note', body.data.content_text);
    return { ok: true };
  });

  async function markSessionStopped(publicId: string, hardKill: boolean) {
    const session = db.prepare('SELECT * FROM sessions WHERE public_id = ?').get(publicId) as any;
    if (!session) return null;
    if (hardKill) await tmux.killSession(session.tmux_session_name);
    else await tmux.sendCtrlC(session.tmux_session_name);
    db.prepare("UPDATE sessions SET status='stopped', stopped_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(session.id);
    db.prepare('INSERT INTO session_snapshots (session_id, snapshot_type, content_text) VALUES (?, ?, ?)').run(session.id, 'system_event', hardKill ? 'Session force-killed' : 'Session interrupted (Ctrl+C)');
    return session;
  }

  app.post('/api/v1/sessions/:id/stop', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    try {
      const session = await markSessionStopped(params.data.id, false);
      if (!session) return reply.code(404).send({ error: 'Not found' });
      return { ok: true };
    } catch (error) {
      if (error instanceof TmuxError) return reply.code(502).send({ error: error.message });
      return reply.code(500).send({ error: 'Failed to stop session' });
    }
  });

  app.post('/api/v1/sessions/:id/kill', async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    try {
      const session = await markSessionStopped(params.data.id, true);
      if (!session) return reply.code(404).send({ error: 'Not found' });
      return { ok: true };
    } catch (error) {
      if (error instanceof TmuxError) return reply.code(502).send({ error: error.message });
      return reply.code(500).send({ error: 'Failed to kill session' });
    }
  });

  app.post('/api/v1/sessions/:id/archive', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    db.prepare('UPDATE sessions SET archived=1, updated_at=CURRENT_TIMESTAMP WHERE public_id=?').run(params.data.id);
    return { ok: true };
  });

  app.get('/api/v1/sessions/:id/terminal/bootstrap', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = idParamSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    const session = db.prepare('SELECT public_id,title,status,workdir FROM sessions WHERE public_id = ?').get(params.data.id);
    if (!session) return reply.code(404).send({ error: 'Not found' });
    return { ...session, ws_url: '/ws/terminal', poll_interval_ms: env.TERMINAL_POLL_INTERVAL_MS };
  });

  app.get('/api/v1/audit', (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const level = (req.query as any)?.event_type as string | undefined;
    if (level) {
      return db.prepare('SELECT * FROM audit_logs WHERE event_type = ? ORDER BY id DESC LIMIT 200').all(level);
    }
    return db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all();
  });

  app.get('/ws/terminal', { websocket: true }, (socket, req) => {
    if (!req.user) {
      socket.close();
      return;
    }

    let interval: NodeJS.Timeout | undefined;
    let sessionName = '';
    let sessionPublicId = '';
    let lastOutput = '';

    socket.on('message', async (raw: Buffer) => {
      let message: any;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'session.error', payload: 'Invalid JSON payload' }));
        return;
      }

      if (message.type === 'subscribe') {
        const row = db.prepare('SELECT public_id, tmux_session_name FROM sessions WHERE public_id = ?').get(message.sessionId) as any;
        if (!row) return;
        sessionName = row.tmux_session_name;
        sessionPublicId = row.public_id;
        if (interval) clearInterval(interval);
        interval = setInterval(async () => {
          try {
            const output = await tmux.capturePane(sessionName);
            if (output !== lastOutput) {
              const delta = output.startsWith(lastOutput) ? output.slice(lastOutput.length) : output;
              lastOutput = output;
              db.prepare("UPDATE sessions SET last_output_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE public_id=?").run(sessionPublicId);
              socket.send(JSON.stringify({ type: 'terminal.output', payload: delta }));
            }
          } catch (error) {
            const message = error instanceof TmuxError ? error.message : 'Unable to capture tmux pane';
            socket.send(JSON.stringify({ type: 'session.error', payload: message }));
          }
        }, env.TERMINAL_POLL_INTERVAL_MS);
        socket.send(JSON.stringify({ type: 'session.status', payload: { connected: true } }));
        return;
      }

      try {
        if (message.type === 'terminal.input' && sessionName) {
          await tmux.sendKeys(sessionName, message.payload);
          return;
        }

        if (message.type === 'terminal.special' && sessionName) {
          if (message.key === 'Enter') await tmux.sendEnter(sessionName);
          if (message.key === 'C-c') await tmux.sendCtrlC(sessionName);
          return;
        }

        if (message.type === 'terminal.resize' && sessionName) {
          await tmux.resize(sessionName, message.cols, message.rows);
          return;
        }

        if (message.type === 'request_refresh' && sessionName) {
          const output = await tmux.capturePane(sessionName);
          socket.send(JSON.stringify({ type: 'terminal.output', payload: output }));
          lastOutput = output;
        }
      } catch (error) {
        const message = error instanceof TmuxError ? error.message : 'Terminal operation failed';
        socket.send(JSON.stringify({ type: 'session.error', payload: message }));
      }
    });

    socket.on('close', () => {
      if (interval) clearInterval(interval);
    });
  });

  return app;
}

export type AppInstance = FastifyInstance;
