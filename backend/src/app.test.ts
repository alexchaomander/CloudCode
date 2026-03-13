import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Set test DB path before any imports that might use it
const dbPath = path.join(os.tmpdir(), `cloudcode-test-${Date.now()}.db`);
process.env.DATABASE_PATH = dbPath;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';

// Mock tmux adapter with async functions
vi.mock('./tmux/adapter.js', () => ({
  createSession: vi.fn().mockResolvedValue(undefined),
  killSession: vi.fn().mockResolvedValue(undefined),
  sendCtrlC: vi.fn().mockResolvedValue(undefined),
  sendKeys: vi.fn().mockResolvedValue(undefined),
  hasSession: vi.fn().mockResolvedValue(true),
  listSessions: vi.fn().mockResolvedValue([]),
  capturePane: vi.fn().mockResolvedValue('test output'),
  resizeWindow: vi.fn().mockResolvedValue(undefined),
}));

describe('API Integration', () => {
  let app: any;
  let tmux: any;

  beforeAll(async () => {
    // Dynamically import to ensure process.env.DATABASE_PATH is set first
    const { runMigrations } = await import('./db/migrations.js');
    const { buildApp } = await import('./index.js');
    tmux = await import('./tmux/adapter.js');

    runMigrations();
    app = await buildApp();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
    if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
  });

  async function bootstrapAndLogin() {
    // Bootstrap
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/bootstrap',
      payload: { username: 'admin', password: 'password123' }
    });

    // Login
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'admin', password: 'password123' }
    });
    
    const cookie = res.cookies.find((c: any) => c.name === 'session');
    return `session=${cookie.value}`;
  }

  it('completes full bootstrap, session, and audit lifecycle', async () => {
    // 1. Check bootstrap status
    let res = await app.inject({ method: 'GET', url: '/api/v1/auth/bootstrap-status' });
    expect(res.json().needsBootstrap).toBe(true);

    // 2. Login
    const cookieHeader = await bootstrapAndLogin();

    // 3. Create a repo root
    res = await app.inject({
      method: 'POST',
      url: '/api/v1/repos',
      headers: { cookie: cookieHeader },
      payload: { label: 'Test Repo', absolute_path: os.tmpdir() }
    });
    expect(res.statusCode).toBe(201);
    const repoId = res.json().repo.id;

    // 4. Get profiles
    res = await app.inject({ method: 'GET', url: '/api/v1/profiles', headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
    const profileId = res.json().profiles[0].id;

    // 5. Create a session
    res = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { cookie: cookieHeader },
      payload: {
        title: 'Integration Test Session',
        agent_profile_id: profileId,
        repo_root_id: repoId,
        workdir: '.'
      }
    });
    expect(res.statusCode).toBe(201);
    const sessionId = res.json().session.id;
    const publicId = res.json().session.public_id;
    expect(tmux.createSession).toHaveBeenCalled();

    // 6. Create a snapshot
    res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${publicId}/snapshots`,
      headers: { cookie: cookieHeader },
      payload: { content_text: 'Test snapshot content' }
    });
    expect(res.statusCode).toBe(201);

    // 7. Stop session
    res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${publicId}/stop`,
      headers: { cookie: cookieHeader }
    });
    expect(res.statusCode).toBe(200);
    expect(tmux.sendCtrlC).toHaveBeenCalled();

    // 8. Archive session
    res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${publicId}/archive`,
      headers: { cookie: cookieHeader }
    });
    expect(res.statusCode).toBe(200);

    // 9. Check audit logs
    res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit',
      headers: { cookie: cookieHeader }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().entries.length).toBeGreaterThan(0);
  });

  it('enforces authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/sessions' });
    expect(res.statusCode).toBe(401);
  });
});
