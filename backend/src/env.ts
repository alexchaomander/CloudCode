import { z } from 'zod';
import type { Env } from './types.js';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./cloudcode.db'),
  SESSION_SECRET: z.string().min(16).default('change-me-in-prod-1234'),
  APP_BASE_URL: z.string().default('http://localhost:5173'),
  TMUX_BINARY_PATH: z.string().default('tmux'),
  TAILSCALE_ALLOWED_IDENTITIES: z.string().default(''),
  TERMINAL_POLL_INTERVAL_MS: z.coerce.number().default(500)
});

export function loadEnv(): Env {
  const parsed = schema.parse(process.env);
  return {
    ...parsed,
    TAILSCALE_ALLOWED_IDENTITIES: parsed.TAILSCALE_ALLOWED_IDENTITIES
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  };
}
