# CloudCode

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org)

**A self-hosted, mobile-first web interface for managing local CLI-based coding agents.**

Run Claude Code, Gemini CLI, Codex, and other coding agents on your workstation — then control them from your phone over a private Tailscale network. Sessions are tmux-backed and survive browser disconnects and phone sleep.

---

## Features

- **Live terminal** — interact with agent processes from any browser, including mobile
- **Durable sessions** — tmux-backed sessions persist independently of your browser connection
- **Multiple agents** — manage many concurrent agent sessions from a single dashboard
- **Mobile-first UI** — designed for phone portrait mode with thumb-friendly controls
- **Secure by default** — Tailscale network layer + app password authentication
- **Agent profiles** — pre-configured profiles for popular coding CLIs, fully editable
- **Audit trail** — all sensitive actions logged with actor, target, and timestamp

---

## How It Works

```
┌─────────────────────────────────────────────┐
│                  Your Phone                  │
│            (Tailscale connected)             │
└──────────────────┬──────────────────────────┘
                   │ HTTPS / WebSocket
┌──────────────────▼──────────────────────────┐
│              CloudCode Server                │
│   React Frontend  +  Fastify Backend         │
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

CloudCode is **orchestration**, not a remote desktop. tmux is the durability layer — sessions live on your machine, CloudCode just provides the interface.

---

## Quick Start

**Prerequisites:** Node.js 22+, tmux, at least one coding agent CLI in PATH.

```bash
# 1. Clone
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode

# 2. Install dependencies
npm install

# 3. Configure
cp .env.example .env
# Edit .env — set SESSION_SECRET to a long random string:
#   openssl rand -hex 64

# 4. Migrate database + seed agent profiles
npm run migrate

# 5. Build frontend
npm run build

# 6. Start
npm start
```

Open `http://localhost:3000/bootstrap` to create your admin account, then log in at `/login`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 22 · TypeScript · Fastify · better-sqlite3 |
| Auth | argon2 · session cookies |
| Terminal | WebSocket · tmux pane capture |
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS |
| Terminal UI | xterm.js |
| Runtime | tmux · systemd |

---

## Pre-Seeded Agent Profiles

| Agent | Command |
|-------|---------|
| Claude Code | `claude` |
| Gemini CLI | `gemini` |
| GitHub Copilot CLI | `gh copilot` |
| Codex | `codex` |

Profiles are fully editable through the UI. You can add any CLI tool.

---

## Security Model

CloudCode executes local commands, so it has multiple security layers:

1. **Network** — only listens on Tailscale IP or localhost; never publicly exposed
2. **Tailscale Identity** — optionally validates `X-Tailscale-User` header to restrict access to approved tailnet identities
3. **Application auth** — username + password (argon2id hashed); 30-day session cookies
4. **Controlled execution** — sessions launched only from pre-approved agent profiles
5. **Path validation** — working directories restricted to registered repo roots; symlink escapes rejected
6. **Audit logs** — every sensitive action recorded with actor, target, and metadata

See [docs/tailscale.md](docs/tailscale.md) for the recommended network setup.

---

## Documentation

- [Installation Guide](docs/install.md) — full setup, systemd service, troubleshooting
- [Tailscale Setup](docs/tailscale.md) — secure remote access from your phone

---

## Supported Platforms

| Platform | Status |
|----------|--------|
| Linux | Primary |
| macOS | Supported |
| Windows | Not supported (tmux dependency) |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[MIT](LICENSE) — © 2025 CloudCode Contributors
