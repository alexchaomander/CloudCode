import { nanoid } from 'nanoid';
import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { db } from '../db/index.js';
import { logAudit } from '../audit/service.js';
import * as tmux from '../tmux/adapter.js';
import { sidecarManager, type SidecarStreamHandle } from '../terminal/sidecar-manager.js';
import { appendTranscript, deleteTranscript, initTranscript } from '../terminal/transcript-store.js';
import { validateWorkdir } from '../utils/paths.js';
import type { AgentProfile, Session } from '../db/schema.js';
import { hasPromptMarker } from './startup-ready.js';

const INITIAL_STARTUP_INPUT_DELAY_MS = parseInt(process.env.INITIAL_STARTUP_INPUT_DELAY_MS ?? '1600', 10);
const STARTUP_READY_TIMEOUT_MS = parseInt(process.env.STARTUP_READY_TIMEOUT_MS ?? '12000', 10);
const STARTUP_READY_POLL_MS = parseInt(process.env.STARTUP_READY_POLL_MS ?? '250', 10);

function expandPath(path: string): string {
  if (path && path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTmuxSessionExit(sessionName: string, timeoutMs = 1500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const exists = await tmux.hasSession(sessionName);
    if (!exists) {
      return true;
    }
    await sleep(100);
  }

  return !(await tmux.hasSession(sessionName));
}

async function sendStartupLine(sessionName: string, text: string): Promise<void> {
  if (!text) return;
  await tmux.sendLiteralText(sessionName, text);
  await tmux.sendEnter(sessionName);
}

const transcriptRecorders = new Map<string, SidecarStreamHandle>();

export function hasTranscriptRecorder(sessionId: string): boolean {
  return transcriptRecorders.has(sessionId);
}

async function startTranscriptRecorder(sessionId: string, sessionName: string): Promise<void> {
  if (transcriptRecorders.has(sessionId)) return;

  const recorder = await sidecarManager.openStream(sessionName, 160, 48, {
    onOutput: ({ text }) => {
      void appendTranscript(sessionId, text).catch(() => {});
    },
    onExit: () => {
      transcriptRecorders.delete(sessionId);
    },
    onError: () => {
      transcriptRecorders.delete(sessionId);
    },
  });

  transcriptRecorders.set(sessionId, recorder);
}

async function stopTranscriptRecorder(sessionId: string): Promise<void> {
  const recorder = transcriptRecorders.get(sessionId);
  if (!recorder) return;
  transcriptRecorders.delete(sessionId);
  await recorder.close().catch(() => {});
}

async function backfillTranscriptSnapshot(sessionId: string, sessionName: string): Promise<void> {
  if (typeof tmux.capturePaneHistory !== 'function' || typeof tmux.capturePane !== 'function') {
    return;
  }

  const [historyOutput, currentOutput] = await Promise.all([
    tmux.capturePaneHistory(sessionName),
    tmux.capturePane(sessionName),
  ]);

  const snapshot = [historyOutput, currentOutput].filter(Boolean).join('\n').trim();
  if (!snapshot) return;

  await appendTranscript(sessionId, snapshot);
}

async function waitForStartupReady(sessionName: string, _profile: AgentProfile): Promise<void> {
  const deadline = Date.now() + STARTUP_READY_TIMEOUT_MS;
  let sawOutput = false;

  while (Date.now() < deadline) {
    const content = await tmux.capturePane(sessionName);
    if (content.trim()) {
      sawOutput = true;
      if (hasPromptMarker(content)) {
        return;
      }
    }

    await sleep(STARTUP_READY_POLL_MS);
  }

  if (!sawOutput) {
    await sleep(INITIAL_STARTUP_INPUT_DELAY_MS);
  }
}

export interface CreateSessionParams {
  title: string;
  agentProfileId: string;
  repoRootId?: string | null;
  workdir?: string | null;
  startupPrompt?: string | null;
  userId: string;
  isWorktree?: boolean;
}

export interface SessionWithProfile {
  id: string;
  publicId: string;
  title: string;
  agentProfileId: string;
  repoRootId: string | null;
  workdir: string | null;
  tmuxSessionName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  stoppedAt: string | null;
  lastOutputAt: string | null;
  pinned: boolean;
  archived: boolean;
  worktreePath: string | null;
  gitInfo?: {
    branch: string;
    isDirty: boolean;
  };
  agentProfile?: {
    id: string;
    name: string;
    slug: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    defaultWorkdir: string | null;
    startupTemplate: string | null;
    stopMethod: string;
    supportsInteractiveInput: boolean;
  };
}

function getGitInfo(path: string | null): SessionWithProfile['gitInfo'] | undefined {
  if (!path) return undefined;
  try {
    const expanded = expandPath(path);
    if (!existsSync(expanded) || !existsSync(join(expanded, '.git'))) return undefined;

    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: expanded,
      encoding: 'utf8',
      timeout: 500,
    }).trim();

    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: expanded,
      encoding: 'utf8',
      timeout: 500,
    }).trim();

    return {
      branch,
      isDirty: status.length > 0,
    };
  } catch (err) {
    // console.error('[git] Failed to get info:', err);
    return undefined;
  }
}

function parseSessionRow(
  row: Session & { profile_name?: string; profile_slug?: string; profile_command?: string; profile_args_json?: string; profile_env_json?: string; profile_default_workdir?: string | null; profile_startup_template?: string | null; profile_stop_method?: string; profile_supports_interactive?: number; worktree_path?: string | null }
): SessionWithProfile {
  const result: SessionWithProfile = {
    id: row.id,
    publicId: row.public_id,
    title: row.title,
    agentProfileId: row.agent_profile_id,
    repoRootId: row.repo_root_id,
    workdir: row.workdir,
    tmuxSessionName: row.tmux_session_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    lastOutputAt: row.last_output_at,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
    worktreePath: row.worktree_path ?? null,
    gitInfo: getGitInfo(row.workdir),
  };

  if (row.profile_name) {
    result.agentProfile = {
      id: row.agent_profile_id,
      name: row.profile_name,
      slug: row.profile_slug ?? '',
      command: row.profile_command ?? '',
      args: row.profile_args_json ? JSON.parse(row.profile_args_json) : [],
      env: row.profile_env_json ? JSON.parse(row.profile_env_json) : {},
      defaultWorkdir: row.profile_default_workdir ?? null,
      startupTemplate: row.profile_startup_template ?? null,
      stopMethod: row.profile_stop_method ?? 'ctrl_c',
      supportsInteractiveInput: (row.profile_supports_interactive ?? 1) === 1,
    };
  }

  return result;
}

const SESSION_QUERY = `
  SELECT
    s.*,
    p.name as profile_name,
    p.slug as profile_slug,
    p.command as profile_command,
    p.args_json as profile_args_json,
    p.env_json as profile_env_json,
    p.default_workdir as profile_default_workdir,
    p.startup_template as profile_startup_template,
    p.stop_method as profile_stop_method,
    p.supports_interactive_input as profile_supports_interactive
  FROM sessions s
  LEFT JOIN agent_profiles p ON p.id = s.agent_profile_id
`;

export async function createSession(params: CreateSessionParams): Promise<SessionWithProfile> {
  const { title, agentProfileId, repoRootId, workdir, startupPrompt, userId, isWorktree } = params;

  // Validate agent profile exists
  const profile = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(agentProfileId) as AgentProfile | undefined;
  if (!profile) {
    throw new Error(`Agent profile not found: ${agentProfileId}`);
  }

  // Determine working directory
  let effectiveWorkdir = workdir ?? profile.default_workdir ?? process.cwd();
  let resolvedRepoRootId = repoRootId;

  // 1. If repoRootId provided, validate strictly
  if (repoRootId) {
    const repo = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(repoRootId) as { absolute_path: string } | undefined;
    if (repo) {
      try {
        effectiveWorkdir = validateWorkdir(repo.absolute_path, workdir ?? '.');
      } catch (err: any) {
        throw new Error(`Invalid working directory: ${err.message}`);
      }
    } else {
      throw new Error(`Repository root not found: ${repoRootId}`);
    }
  } 
  // 2. If no repoRootId but workdir is provided, try to find a matching root for security
  else if (workdir) {
    const roots = db.prepare('SELECT * FROM repo_roots').all() as unknown as { id: string, absolute_path: string }[];
    let foundRoot = false;
    
    for (const root of roots) {
      try {
        const validated = validateWorkdir(root.absolute_path, workdir);
        effectiveWorkdir = validated;
        resolvedRepoRootId = root.id;
        foundRoot = true;
        break;
      } catch {
        continue;
      }
    }

    if (!foundRoot) {
      throw new Error('Working directory must be within a configured Repository Root for security.');
    }
  }

  const id = nanoid();
  const publicId = nanoid(10);
  const tmuxSessionName = `cc-${publicId}`;
  const now = new Date().toISOString();

  let worktreePath: string | null = null;
  if (isWorktree) {
    const parentDir = join(effectiveWorkdir, '..', '.cloudcode-worktrees');
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
    worktreePath = join(parentDir, publicId);
    try {
      execFileSync('git', ['worktree', 'add', worktreePath, 'HEAD'], {
        cwd: effectiveWorkdir,
        encoding: 'utf8',
      });
      effectiveWorkdir = worktreePath;
    } catch (err: any) {
      throw new Error(`Failed to create git worktree: ${err.message}`);
    }
  }

  // Insert DB record first
  db.prepare(`
    INSERT INTO sessions (id, public_id, title, agent_profile_id, repo_root_id, workdir, tmux_session_name, status, created_at, updated_at, worktree_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    id,
    publicId,
    title,
    agentProfileId,
    resolvedRepoRootId ?? null,
    effectiveWorkdir,
    tmuxSessionName,
    now,
    now,
    worktreePath
  );

  try {
    await initTranscript(id);

    // Start tmux session
    const args = JSON.parse(profile.args_json) as string[];
    const env = JSON.parse(profile.env_json) as Record<string, string>;

    await tmux.createSession(
      tmuxSessionName,
      profile.command,
      args,
      effectiveWorkdir,
      Object.keys(env).length > 0 ? env : undefined
    );

    if (typeof tmux.setHistoryLimit === 'function') {
      await tmux.setHistoryLimit(tmuxSessionName, 100000).catch(() => {});
    }

    await backfillTranscriptSnapshot(id, tmuxSessionName);
    await startTranscriptRecorder(id, tmuxSessionName).catch((err) => {
      // Transcript recording is best-effort; session creation should still succeed.
      console.warn('Failed to start transcript recorder', err);
    });

    if (profile.startup_template) {
      await waitForStartupReady(tmuxSessionName, profile);
      await sendStartupLine(tmuxSessionName, profile.startup_template);
    }

    if (startupPrompt) {
      await waitForStartupReady(tmuxSessionName, profile);
      await sendStartupLine(tmuxSessionName, startupPrompt);
    }

    // Update status to running
    db.prepare(`
      UPDATE sessions SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);

    logAudit({
      actorUserId: userId,
      eventType: 'session.created',
      targetType: 'session',
      targetId: id,
      metadata: { title, agentProfileId, tmuxSessionName },
    });
  } catch (err) {
    db.prepare(`UPDATE sessions SET status = 'error', updated_at = ? WHERE id = ?`).run(now, id);
    throw err;
  }

  const row = db.prepare(`${SESSION_QUERY} WHERE s.id = ?`).get(id);
  return parseSessionRow(row as any);
}

export async function stopSession(id: string, userId: string): Promise<void> {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  if (!session) throw new Error(`Session not found: ${id}`);

  if (session.status !== 'running' && session.status !== 'pending') {
    throw new Error(`Session is not active (status: ${session.status})`);
  }

  await tmux.sendCtrlC(session.tmux_session_name);

  const now = new Date().toISOString();
  db.prepare(`UPDATE sessions SET status = 'stopped', stopped_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);

  logAudit({
    actorUserId: userId,
    eventType: 'session.stopped',
    targetType: 'session',
    targetId: id,
  });
}

export async function killSession(id: string, userId: string): Promise<void> {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  if (!session) throw new Error(`Session not found: ${id}`);

  const existsBeforeKill = await tmux.hasSession(session.tmux_session_name);
  if (!existsBeforeKill) {
    throw new Error(`tmux session not found: ${session.tmux_session_name}`);
  }

  await tmux.killSession(session.tmux_session_name);
  const exited = await waitForTmuxSessionExit(session.tmux_session_name);
  if (!exited) {
    throw new Error(`Failed to terminate tmux session: ${session.tmux_session_name}`);
  }
  await stopTranscriptRecorder(session.id);

  const now = new Date().toISOString();
  db.prepare(`UPDATE sessions SET status = 'stopped', stopped_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);

  logAudit({
    actorUserId: userId,
    eventType: 'session.killed',
    targetType: 'session',
    targetId: id,
  });
}

export async function deleteSession(id: string, userId: string): Promise<void> {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as (Session & { worktree_path: string | null }) | undefined;
  if (!session) throw new Error(`Session not found: ${id}`);

  await stopTranscriptRecorder(session.id);

  const exists = await tmux.hasSession(session.tmux_session_name);
  if (exists) {
    await tmux.killSession(session.tmux_session_name);
  }

  // Cleanup worktree
  if (session.worktree_path) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', session.worktree_path], {
        cwd: dirname(session.worktree_path),
        encoding: 'utf8',
      });
    } catch (err) {
      // console.error('[git] Failed to remove worktree:', err);
    }
  }

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM session_snapshots WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  await deleteTranscript(id);

  logAudit({
    actorUserId: userId,
    eventType: 'session.deleted',
    targetType: 'session',
    targetId: id,
    metadata: {
      publicId: session.public_id,
      tmuxSessionName: session.tmux_session_name,
      title: session.title,
    },
  });
}

export function archiveSession(id: string, userId: string): void {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  if (!session) throw new Error(`Session not found: ${id}`);

  const now = new Date().toISOString();
  db.prepare(`UPDATE sessions SET archived = 1, updated_at = ? WHERE id = ?`).run(now, id);

  logAudit({
    actorUserId: userId,
    eventType: 'session.archived',
    targetType: 'session',
    targetId: id,
  });
}

export function getSession(id: string): SessionWithProfile | undefined {
  const row = db.prepare(`${SESSION_QUERY} WHERE s.id = ?`).get(id);
  if (!row) return undefined;
  return parseSessionRow(row as any);
}

export function getSessionByPublicId(publicId: string): SessionWithProfile | undefined {
  const row = db.prepare(`${SESSION_QUERY} WHERE s.public_id = ?`).get(publicId);
  if (!row) return undefined;
  return parseSessionRow(row as any);
}

export interface ListSessionsFilter {
  archived?: boolean;
  status?: string;
  agentProfileId?: string;
}

export function listSessions(filter?: ListSessionsFilter): SessionWithProfile[] {
  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (filter?.archived !== undefined) {
    conditions.push('s.archived = ?');
    bindings.push(filter.archived ? 1 : 0);
  }

  if (filter?.status) {
    conditions.push('s.status = ?');
    bindings.push(filter.status);
  }

  if (filter?.agentProfileId) {
    conditions.push('s.agent_profile_id = ?');
    bindings.push(filter.agentProfileId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const query = `${SESSION_QUERY} ${whereClause} ORDER BY s.pinned DESC, s.created_at DESC`;

  const rows = db.prepare(query).all(...(bindings as string[])) as unknown as Session[];
  return rows.map((row) => parseSessionRow(row as any));
}

/**
 * Returns the top 5 most recently used unique agent profiles.
 */
export function getRecentAgents(): Array<{ id: string; name: string }> {
  const rows = db.prepare(`
    SELECT 
      p.id, 
      p.name,
      MAX(s.created_at) as last_used
    FROM sessions s
    JOIN agent_profiles p ON p.id = s.agent_profile_id
    GROUP BY p.id, p.name
    ORDER BY last_used DESC
    LIMIT 5
  `).all() as unknown as any[];

  return rows.map(r => ({ id: r.id, name: r.name }));
}

/**
 * Returns the top 10 most recently used unique working directories.
 */
export function getRecentPaths(): string[] {
  const rows = db.prepare(`
    SELECT workdir, MAX(created_at) as last_used
    FROM sessions
    WHERE workdir IS NOT NULL
    GROUP BY workdir
    ORDER BY last_used DESC
    LIMIT 10
  `).all() as unknown as any[];

  return rows.map(r => r.workdir);
}

/**
 * Returns the top 3 most recently created unique Agent + Project combinations.
 */
export function getRecentSessions(): Array<{ agentProfileId: string; workdir: string; title: string; agentName: string }> {
  const rows = db.prepare(`
    SELECT 
      s.agent_profile_id, 
      s.workdir, 
      MAX(s.created_at) as last_used,
      s.title,
      p.name as agent_name
    FROM sessions s
    JOIN agent_profiles p ON p.id = s.agent_profile_id
    WHERE s.archived = 0 AND s.workdir IS NOT NULL
    GROUP BY s.agent_profile_id, s.workdir, s.title, p.name
    ORDER BY last_used DESC
    LIMIT 3
  `).all() as unknown as any[];

  return rows.map(r => ({
    agentProfileId: r.agent_profile_id,
    workdir: r.workdir,
    title: r.title,
    agentName: r.agent_name
  }));
}

export async function syncSessionStatus(): Promise<void> {
  const runningSessions = db.prepare(
    "SELECT * FROM sessions WHERE status IN ('running', 'pending')"
  ).all() as unknown as Session[];

  for (const session of runningSessions) {
    const alive = await tmux.hasSession(session.tmux_session_name);
    if (!alive) {
      const now = new Date().toISOString();
      db.prepare(
        "UPDATE sessions SET status = 'stopped', stopped_at = ?, updated_at = ? WHERE id = ?"
      ).run(now, now, session.id);
    }
  }
}
