import { db } from './index.js';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';

export function runMigrations(): void {
  // console.log('Running database migrations...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_token_hash TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      tailscale_identity TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(session_token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

    CREATE TABLE IF NOT EXISTS agent_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      command TEXT NOT NULL,
      args_json TEXT NOT NULL DEFAULT '[]',
      env_json TEXT NOT NULL DEFAULT '{}',
      default_workdir TEXT,
      startup_template TEXT,
      stop_method TEXT NOT NULL DEFAULT 'ctrl_c',
      supports_interactive_input INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS repo_roots (
      id TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      absolute_path TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      public_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      agent_profile_id TEXT NOT NULL REFERENCES agent_profiles(id),
      repo_root_id TEXT REFERENCES repo_roots(id),
      workdir TEXT,
      tmux_session_name TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      stopped_at TEXT,
      last_output_at TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      worktree_path TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(agent_profile_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo_root_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived);

    CREATE TABLE IF NOT EXISTS session_snapshots (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      snapshot_type TEXT NOT NULL DEFAULT 'auto',
      content_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_session ON session_snapshots(session_id);

    CREATE TABLE IF NOT EXISTS pairing_tokens (
      token TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pairing_tokens_expires ON pairing_tokens(expires_at);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY NOT NULL,
      actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event_type);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: Add worktree_path to sessions if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(sessions)").all() as any[];
    const hasWorktreePath = tableInfo.some(col => col.name === 'worktree_path');
    if (!hasWorktreePath) {
      db.exec("ALTER TABLE sessions ADD COLUMN worktree_path TEXT");
    }
  } catch (err) {
    // Column might already exist or table doesn't exist yet
  }

  // console.log('Tables created successfully.');

  // Seed default agent profiles
  const existingProfiles = db.prepare('SELECT COUNT(*) as count FROM agent_profiles').get() as { count: number };

  if (existingProfiles.count === 0) {
    // console.log('Seeding default agent profiles...');

    const insertProfile = db.prepare(`
      INSERT OR IGNORE INTO agent_profiles (id, name, slug, command, args_json, env_json, startup_template, stop_method, supports_interactive_input)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // The "big 4" coding agent CLIs, pre-configured and ready to use.
    // All four are persistent interactive REPLs that start and stay open.
    const defaultProfiles = [
      {
        id: nanoid(),
        name: 'Claude Code',
        slug: 'claude-code',
        command: 'claude',
        args: [] as string[],
        startup_template: null as string | null,
        stop_method: 'ctrl_c',
        supports_interactive_input: 1,
      },
      {
        id: nanoid(),
        name: 'Gemini CLI',
        slug: 'gemini-cli',
        command: 'gemini',
        args: [] as string[],
        startup_template: null as string | null,
        stop_method: 'ctrl_c',
        supports_interactive_input: 1,
      },
      {
        id: nanoid(),
        name: 'OpenAI Codex',
        slug: 'openai-codex',
        command: 'codex',
        args: [] as string[],
        startup_template: null as string | null,
        stop_method: 'ctrl_c',
        supports_interactive_input: 1,
      },
      {
        id: nanoid(),
        name: 'GitHub Copilot CLI',
        slug: 'github-copilot-cli',
        command: 'copilot',
        args: [] as string[],
        startup_template: null as string | null,
        stop_method: 'ctrl_c',
        supports_interactive_input: 1,
      },
    ];

    const seedTx = db.transaction(() => {
      for (const profile of defaultProfiles) {
        insertProfile.run(
          profile.id,
          profile.name,
          profile.slug,
          profile.command,
          JSON.stringify(profile.args),
          '{}',
          profile.startup_template,
          profile.stop_method,
          profile.supports_interactive_input
        );
      }
    });

    seedTx();
    // console.log('Default agent profiles seeded.');
  }
}

if (import.meta.url === `file://${fileURLToPath(import.meta.url)}`) {
  runMigrations();
}
