// Database schema TypeScript interfaces

export interface User {
  id: string;
  username: string;
  password_hash: string;
  is_admin: number; // SQLite boolean (0 or 1)
  totp_enabled: number; // SQLite boolean (0 or 1)
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  last_login_at: string | null; // ISO 8601 or null
}

export interface AuthSession {
  id: string;
  user_id: string;
  session_token_hash: string;
  created_at: string; // ISO 8601
  expires_at: string; // ISO 8601
  ip_address: string | null;
  user_agent: string | null;
  tailscale_identity: string | null;
}

export interface AgentProfile {
  id: string;
  name: string;
  slug: string;
  command: string;
  args_json: string; // JSON array
  env_json: string; // JSON object
  default_workdir: string | null;
  startup_template: string | null;
  stop_method: string; // 'ctrl_c' | 'kill'
  supports_interactive_input: number; // SQLite boolean
  created_at: string;
  updated_at: string;
}

export interface RepoRoot {
  id: string;
  label: string;
  absolute_path: string;
  created_at: string;
  updated_at: string;
}

export type SessionStatus = 'pending' | 'running' | 'stopped' | 'error' | 'archived';

export interface Session {
  id: string;
  public_id: string;
  title: string;
  agent_profile_id: string;
  repo_root_id: string | null;
  workdir: string | null;
  tmux_session_name: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  stopped_at: string | null;
  last_output_at: string | null;
  pinned: number; // SQLite boolean
  archived: number; // SQLite boolean
}

export interface SessionSnapshot {
  id: string;
  session_id: string;
  snapshot_type: string; // 'auto' | 'manual'
  content_text: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  event_type: string;
  target_type: string | null;
  target_id: string | null;
  metadata_json: string | null; // JSON object
  created_at: string;
}

// Parsed/enriched types used in API responses

export interface UserPublic {
  id: string;
  username: string;
  is_admin: boolean;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface AgentProfileParsed {
  id: string;
  name: string;
  slug: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  default_workdir: string | null;
  startup_template: string | null;
  stop_method: string;
  supports_interactive_input: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionWithProfile extends Session {
  agent_profile?: AgentProfileParsed;
}
