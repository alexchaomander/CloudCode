import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { logAudit } from '../audit/service.js';
import * as tmux from '../tmux/adapter.js';
import type { AgentProfile, Session } from '../db/schema.js';

export interface CreateSessionParams {
  title: string;
  agentProfileId: string;
  repoRootId?: string | null;
  workdir?: string | null;
  userId: string;
}

export interface SessionWithProfile {
  id: string;
  public_id: string;
  title: string;
  agent_profile_id: string;
  repo_root_id: string | null;
  workdir: string | null;
  tmux_session_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  stopped_at: string | null;
  last_output_at: string | null;
  pinned: boolean;
  archived: boolean;
  agent_profile?: {
    id: string;
    name: string;
    slug: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    default_workdir: string | null;
    stop_method: string;
    supports_interactive_input: boolean;
  };
}

function parseSessionRow(
  row: Session & { profile_name?: string; profile_slug?: string; profile_command?: string; profile_args_json?: string; profile_env_json?: string; profile_default_workdir?: string | null; profile_stop_method?: string; profile_supports_interactive?: number }
): SessionWithProfile {
  const result: SessionWithProfile = {
    id: row.id,
    public_id: row.public_id,
    title: row.title,
    agent_profile_id: row.agent_profile_id,
    repo_root_id: row.repo_root_id,
    workdir: row.workdir,
    tmux_session_name: row.tmux_session_name,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    stopped_at: row.stopped_at,
    last_output_at: row.last_output_at,
    pinned: row.pinned === 1,
    archived: row.archived === 1,
  };

  if (row.profile_name) {
    result.agent_profile = {
      id: row.agent_profile_id,
      name: row.profile_name,
      slug: row.profile_slug ?? '',
      command: row.profile_command ?? '',
      args: row.profile_args_json ? JSON.parse(row.profile_args_json) : [],
      env: row.profile_env_json ? JSON.parse(row.profile_env_json) : {},
      default_workdir: row.profile_default_workdir ?? null,
      stop_method: row.profile_stop_method ?? 'ctrl_c',
      supports_interactive_input: (row.profile_supports_interactive ?? 1) === 1,
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
    p.stop_method as profile_stop_method,
    p.supports_interactive_input as profile_supports_interactive
  FROM sessions s
  LEFT JOIN agent_profiles p ON p.id = s.agent_profile_id
`;

export async function createSession(params: CreateSessionParams): Promise<SessionWithProfile> {
  const { title, agentProfileId, repoRootId, workdir, userId } = params;

  // Validate agent profile exists
  const profile = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(agentProfileId) as AgentProfile | undefined;
  if (!profile) {
    throw new Error(`Agent profile not found: ${agentProfileId}`);
  }

  // Determine working directory
  let effectiveWorkdir = workdir ?? profile.default_workdir ?? process.cwd();

  // If repo_root_id provided, use its path
  if (repoRootId) {
    const repo = db.prepare('SELECT * FROM repo_roots WHERE id = ?').get(repoRootId) as { absolute_path: string } | undefined;
    if (repo && !workdir) {
      effectiveWorkdir = repo.absolute_path;
    }
  }

  const id = nanoid();
  const publicId = nanoid(10);
  const tmuxSessionName = `cc-${publicId}`;
  const now = new Date().toISOString();

  // Insert DB record first
  db.prepare(`
    INSERT INTO sessions (id, public_id, title, agent_profile_id, repo_root_id, workdir, tmux_session_name, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id,
    publicId,
    title,
    agentProfileId,
    repoRootId ?? null,
    effectiveWorkdir,
    tmuxSessionName,
    now,
    now
  );

  try {
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

    // If the profile has a startup_template, send it as the first input after
    // a short delay to allow the process to initialise. This is used for CLIs
    // that are not persistent REPLs (e.g. GitHub Copilot CLI running inside a
    // login shell) so the first prompt appears automatically on session create.
    if (profile.startup_template) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await tmux.sendKeys(tmuxSessionName, profile.startup_template + '\n');
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
    // Mark session as error
    db.prepare(`UPDATE sessions SET status = 'error', updated_at = ? WHERE id = ?`).run(now, id);
    throw err;
  }

  const row = db.prepare(`${SESSION_QUERY} WHERE s.id = ?`).get(id);
  return parseSessionRow(row as Session);
}

export async function stopSession(id: string, userId: string): Promise<void> {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
  if (!session) throw new Error(`Session not found: ${id}`);

  if (session.status !== 'running') {
    throw new Error(`Session is not running (status: ${session.status})`);
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

  await tmux.killSession(session.tmux_session_name);

  const now = new Date().toISOString();
  db.prepare(`UPDATE sessions SET status = 'stopped', stopped_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);

  logAudit({
    actorUserId: userId,
    eventType: 'session.killed',
    targetType: 'session',
    targetId: id,
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
  return parseSessionRow(row as Session);
}

export function getSessionByPublicId(publicId: string): SessionWithProfile | undefined {
  const row = db.prepare(`${SESSION_QUERY} WHERE s.public_id = ?`).get(publicId);
  if (!row) return undefined;
  return parseSessionRow(row as Session);
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

  const rows = db.prepare(query).all(...bindings);
  return rows.map((row) => parseSessionRow(row as Session));
}

export async function syncSessionStatus(): Promise<void> {
  // Get all sessions that should be running
  const runningSessions = db.prepare(
    "SELECT * FROM sessions WHERE status IN ('running', 'pending')"
  ).all() as Session[];

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
