import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './app.js';
import type { TmuxClient } from './tmux/tmux.js';

class FakeTmux implements TmuxClient {
  output = 'hello';
  created: string[] = [];
  stopped: string[] = [];
  killed: string[] = [];
  resized: Array<{ cols: number; rows: number }> = [];

  async createSession(name: string) { this.created.push(name); }
  async sendKeys() {}
  async sendEnter() {}
  async sendCtrlC(name: string) { this.stopped.push(name); }
  async resize(_name: string, cols: number, rows: number) { this.resized.push({ cols, rows }); }
  async capturePane() { return this.output; }
  async killSession(name: string) { this.killed.push(name); }
}

const apps: Array<{ app: any; dbPath: string }> = [];

afterEach(async () => {
  while (apps.length) {
    const item = apps.pop()!;
    await item.app.close();
    if (fs.existsSync(item.dbPath)) fs.unlinkSync(item.dbPath);
  }
});

async function makeApp(tmux = new FakeTmux()) {
  const dbPath = path.join(os.tmpdir(), `cloudcode-test-${Date.now()}-${Math.random()}.db`);
  const app = await buildApp({ dbPath, tmux });
  apps.push({ app, dbPath });
  return { app, tmux };
}

async function bootstrapAndLogin(app: any) {
  let res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/bootstrap',
    payload: { username: 'admin', password: 'password123' }
  });
  expect(res.statusCode).toBe(200);

  res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'admin', password: 'password123' }
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c: any) => c.name === 'cloudcode_session');
  expect(cookie).toBeTruthy();
  return `${cookie!.name}=${cookie!.value}`;
}

describe('api integration', () => {
  it('bootstraps, logs in, creates repo/session and supports lifecycle/snapshots/audit', async () => {
    const { app, tmux } = await makeApp();

    let res = await app.inject({ method: 'GET', url: '/api/v1/auth/bootstrap/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().needsBootstrap).toBe(true);

    const cookieHeader = await bootstrapAndLogin(app);

    res = await app.inject({
      method: 'POST',
      url: '/api/v1/repos',
      headers: { cookie: cookieHeader },
      payload: { label: 'repo', absolute_path: process.cwd() }
    });
    expect(res.statusCode).toBe(200);
    const repoId = Number(res.json().id);

    res = await app.inject({ method: 'GET', url: '/api/v1/profiles', headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
    const profileId = res.json()[0].id;

    res = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions',
      headers: { cookie: cookieHeader },
      payload: {
        title: 'test',
        agent_profile_id: profileId,
        repo_root_id: repoId,
        workdir: '.',
        startup_prompt: 'hello'
      }
    });
    expect(res.statusCode).toBe(200);
    const publicId = res.json().public_id as string;
    expect(publicId).toBeTruthy();
    expect(tmux.created.length).toBe(1);

    res = await app.inject({ method: 'POST', url: `/api/v1/sessions/${publicId}/snapshots`, headers: { cookie: cookieHeader }, payload: { content_text: 'note' } });
    expect(res.statusCode).toBe(200);

    res = await app.inject({ method: 'GET', url: `/api/v1/sessions/${publicId}/snapshots`, headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);

    res = await app.inject({ method: 'POST', url: `/api/v1/sessions/${publicId}/stop`, headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
    expect(tmux.stopped.length).toBe(1);

    res = await app.inject({ method: 'POST', url: `/api/v1/sessions/${publicId}/kill`, headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
    expect(tmux.killed.length).toBe(1);

    res = await app.inject({ method: 'POST', url: `/api/v1/sessions/${publicId}/archive`, headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);

    res = await app.inject({ method: 'GET', url: '/api/v1/audit?event_type=session.created', headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('supports profile CRUD with auth', async () => {
    const { app } = await makeApp();
    const cookieHeader = await bootstrapAndLogin(app);

    let res = await app.inject({
      method: 'POST',
      url: '/api/v1/profiles',
      headers: { cookie: cookieHeader },
      payload: {
        name: 'My Agent',
        slug: 'my-agent',
        command: 'my-agent',
        args_json: [],
        env_json: {}
      }
    });
    expect(res.statusCode).toBe(200);
    const id = Number(res.json().id);

    res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/profiles/${id}`,
      headers: { cookie: cookieHeader },
      payload: { command: 'my-agent-v2' }
    });
    expect(res.statusCode).toBe(200);

    res = await app.inject({ method: 'DELETE', url: `/api/v1/profiles/${id}`, headers: { cookie: cookieHeader } });
    expect(res.statusCode).toBe(200);
  });

  it('rejects invalid payloads and unauthorized access', async () => {
    const { app } = await makeApp();

    let res = await app.inject({ method: 'POST', url: '/api/v1/auth/bootstrap', payload: { username: 'a', password: 'b' } });
    expect(res.statusCode).toBe(400);

    res = await app.inject({ method: 'GET', url: '/api/v1/sessions' });
    expect(res.statusCode).toBe(401);
  });
});
