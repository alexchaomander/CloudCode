# CloudCode

A self-hosted, mobile-first web application for managing local CLI-based coding agents (Claude Code, Gemini CLI, Codex, etc.) running on your workstation — accessible securely from your phone over Tailscale.

## What It Does

- **Session dashboard** — view and manage multiple long-running coding agent sessions
- **Live terminal** — interact with agent processes directly from your phone browser
- **tmux-backed** — sessions persist through browser disconnects and phone sleep
- **Secure access** — Tailscale network + app password authentication
- **Agent profiles** — pre-configured launch profiles for popular coding CLIs
- **Audit trail** — logs all sensitive actions

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set SESSION_SECRET at minimum

# Run database migrations + seed profiles
npm run migrate

# Build frontend
cd frontend && npm run build && cd ..

# Start server
npm start
```

Then open `http://localhost:3000/bootstrap` to create your admin account.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  Your Phone                  │
│            (Tailscale connected)             │
└──────────────────┬──────────────────────────┘
                   │ HTTPS / WebSocket
┌──────────────────▼──────────────────────────┐
│              CloudCode Server                │
│   React Frontend + Fastify Backend           │
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │   REST API  │  │  WebSocket Terminal  │  │
│  └──────┬──────┘  └──────────┬───────────┘  │
│         │                    │              │
│  ┌──────▼────────────────────▼───────────┐  │
│  │          Session Manager              │  │
│  └──────────────────┬────────────────────┘  │
│                     │                        │
│  ┌──────────────────▼────────────────────┐  │
│  │         tmux Sessions                 │  │
│  │  ┌──────────┐ ┌──────────┐            │  │
│  │  │  claude  │ │  gemini  │  ...       │  │
│  │  └──────────┘ └──────────┘            │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Stack

**Backend:** Node.js 22 · TypeScript · Fastify · SQLite (better-sqlite3) · argon2 · WebSockets

**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · xterm.js

**Runtime:** tmux · systemd

## Documentation

- [Installation Guide](docs/install.md)
- [Tailscale Setup](docs/tailscale.md)

## Supported Agent Profiles (pre-seeded)

| Agent | Command |
|-------|---------|
| Claude Code | `claude` |
| Gemini CLI | `gemini` |
| GitHub Copilot CLI | `gh copilot` |
| Codex | `codex` |

Profiles are fully editable through the UI.

## Security Model

1. **Network** — only accessible via Tailscale / localhost
2. **Tailscale Identity** — validates `X-Tailscale-User` header against allowed list
3. **App Auth** — username + password (argon2 hashed)
4. **Controlled Execution** — sessions launched only from approved agent profiles
5. **Audit Logs** — all sensitive actions recorded

## License

MIT
