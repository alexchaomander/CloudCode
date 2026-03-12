export type SessionStatus = 'running' | 'stopped' | 'error';

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  HOST: string;
  DATABASE_PATH: string;
  SESSION_SECRET: string;
  APP_BASE_URL: string;
  TMUX_BINARY_PATH: string;
  TAILSCALE_ALLOWED_IDENTITIES: string[];
  TERMINAL_POLL_INTERVAL_MS: number;
}

export interface AuthUser {
  id: number;
  username: string;
  is_admin: number;
}
