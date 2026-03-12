# Contributing to CloudCode

Thank you for your interest in contributing! This document covers how to get set up, how to submit changes, and our conventions.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Reporting Bugs](#reporting-bugs)
- [Security Issues](#security-issues)

---

## Development Setup

### Prerequisites

- Node.js 22+
- tmux
- Git

### Local development

```bash
# Clone the repo
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode

# Install all dependencies (root + workspaces)
npm install

# Set up environment
cp .env.example .env
# Edit .env — SESSION_SECRET is required

# Run migrations
npm run migrate

# Start both backend (port 3000) and frontend dev server (port 5173) in parallel
npm run dev
```

The frontend dev server proxies `/api` and `/ws` to the backend, so you only need to open `http://localhost:5173`.

### First-time setup

Visit `http://localhost:5173/bootstrap` to create your admin account.

---

## Project Structure

```
CloudCode/
├── backend/                # Fastify API server
│   └── src/
│       ├── auth/           # Login, session, middleware
│       ├── audit/          # Audit log service and routes
│       ├── db/             # SQLite schema, connection, migrations
│       ├── profiles/       # Agent profile CRUD
│       ├── repos/          # Repo root CRUD
│       ├── sessions/       # Session lifecycle service and routes
│       ├── settings/       # App settings
│       ├── terminal/       # WebSocket terminal + tmux polling
│       └── tmux/           # tmux subprocess adapter
├── frontend/               # React + Vite + Tailwind app
│   └── src/
│       ├── components/     # Shared UI components
│       ├── hooks/          # React hooks (auth, API, terminal)
│       ├── pages/          # Route-level page components
│       └── types/          # Shared TypeScript interfaces
├── docs/                   # User-facing documentation
├── .github/                # GitHub Actions workflows and templates
├── .env.example            # Environment variable reference
├── cloudcode.service       # systemd service example
└── package.json            # npm workspace root
```

---

## Making Changes

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** — keep commits focused and atomic.

3. **Test locally** — make sure `npm run build` succeeds and the app works end-to-end.

4. **Commit** with a clear message:
   ```
   feat: add snapshot export as markdown
   fix: reconnect terminal WebSocket after phone sleep
   docs: clarify Tailscale identity validation setup
   ```
   We loosely follow [Conventional Commits](https://www.conventionalcommits.org/).

5. **Push** your branch and open a pull request.

---

## Pull Request Process

- Fill out the PR template completely.
- Link any related issues.
- Keep PRs focused — one feature or fix per PR.
- PRs require at least one review before merge.
- CI must pass (TypeScript build, lint).

---

## Code Style

- **TypeScript strict mode** is enabled in both workspaces — no `any` unless truly necessary.
- **Backend:** Fastify plugins, zod validation for all inputs, pino for logging. No `console.log` in production paths.
- **Frontend:** Functional React components, hooks for shared logic, Tailwind for all styling (no custom CSS except `index.css` base styles).
- **Formatting:** We use the TypeScript compiler as the linting baseline. Keep code readable and unsurprising.
- **No dead code:** Remove unused imports, variables, and commented-out blocks before submitting.

---

## Reporting Bugs

Open a [GitHub Issue](https://github.com/alexchaomander/CloudCode/issues/new?template=bug_report.md) with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Environment (OS, Node.js version, tmux version, browser)

---

## Security Issues

**Do not open a public GitHub issue for security vulnerabilities.**

See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.
