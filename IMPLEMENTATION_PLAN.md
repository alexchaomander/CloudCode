# Implementation Plan: CloudCode Remote Control

This plan details the technical steps to build the Remote Control experience into CloudCode.

## 1. Create the `cloudcode` CLI Utility

### Goal
Replace `npm start` with a versatile `cloudcode` CLI.

### Steps
1. Add `commander` to `backend/package.json`.
2. Create `backend/src/cli.ts` to handle subcommands:
   - `start`: Runs the Fastify backend and Vite (in dev) or static files (in prod).
   - `remote-control` (or `cloudcode --rc`): Starts the server, detects Tailscale, and prints the pairing QR code.
3. Update `package.json` to include a `bin` entry: `"cloudcode": "dist/cli.js"`.

## 2. Implement the Pairing Logic

### Data Schema Update
Add a `pairing_tokens` table in `backend/src/db/migrations.ts`:
```sql
CREATE TABLE pairing_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### Backend API
Add `POST /api/v1/auth/pair` to `backend/src/auth/routes.ts`:
- Validates the token and `expires_at`.
- Creates a new `AuthSession` for the user.
- Sets the `session` cookie.

### CLI Logic
- When `--rc` is active, the CLI creates a random 32-character token.
- It inserts it into the database for the *first* admin user (or prompts to create one).
- It generates a QR code using the `qrcode-terminal` package.

## 3. Tailscale Automation

### CLI Detection
When `--rc` is called:
1. Run `tailscale status --json` to get the machine's Tailscale URL.
2. If `tailscale serve` is not active, prompt the user to run:
   `tailscale serve --bg http://localhost:3000`
3. Construct the pairing URL: `https://<machine-name>.<tailnet>.ts.net/pair?token=<token>`.

## 4. Session Worktrees (Advanced Feature)

### Backend Logic
Add `POST /api/v1/sessions/new-worktree` in `backend/src/sessions/routes.ts`:
1. Generate a temporary worktree path: `../cloudcode-worktrees/<session-id>`.
2. Run `git worktree add <path> <branch>`.
3. Create the `tmux` session in that new path.
4. Add a `worktree_path` field to the `sessions` table to track for cleanup.

## 5. UI Updates

### Frontend Changes
1. Add a `/pair` route in `App.tsx`.
2. Create a `Pairing.tsx` page to handle the token validation and redirect to the dashboard.
3. Add a "Mirror Local Session" button to the dashboard that allows the user to see what is happening in their local terminal's current `tmux` session.

## 6. Claude Code Parity: Direct Launch & Handoff

### Direct Launch (`cloudcode run <agent> --rc`)
1. Create a `run` subcommand in `cli.ts`.
2. It must:
   - Start the CloudCode backend in the background (if not already running).
   - Create a new `tmux` session for the specified agent.
   - Print the pairing QR code specifically for *that* session.
   - Attach the local terminal to the `tmux` session immediately.

### Mid-Session Handoff (`cloudcode share`)
1. Create a `share` subcommand.
2. It must:
   - Detect if the user is currently inside a `tmux` session via `process.env.TMUX`.
   - If yes, communicate with the running CloudCode backend (or start a temporary one).
   - Generate a pairing token and QR code for the *current* session name.
   - Display it in the terminal, allowing the user to "hand off" to mobile.

## 7. Automated Testing Strategy
1. **CLI Tests:** Mock `execSync` and `Fastify` to test command parsing and QR generation.
2. **Auth Tests:** Verify pairing token lifecycle (creation, expiration, consumption).
3. **Mirror Tests:** Ensure `listSessions` correctly identifies active `tmux` instances.

