# CloudCode

CloudCode is a self-hosted, tmux-backed orchestration layer for CLI coding agents.

It is designed for a personal workflow: run agents natively on your own machine, then control and monitor sessions from your phone over your private network.

## Status

Release Candidate for a single-user, private-network v1 launch. Final public release depends on completing `docs/release-checklist.md`.

## License

CloudCode is released under the MIT License. See [`LICENSE`](./LICENSE).

## Features (current scaffold)

- Fastify + TypeScript backend with REST and authenticated WebSocket transport
- SQLite persistence with bootstrap schema creation
- tmux-backed durable sessions independent of browser connections
- mobile-first React frontend with dashboard, terminal, snapshots, and quick controls
- seeded agent profiles (Claude Code, Gemini CLI, GitHub Copilot CLI, Codex)
- bootstrap + login flow for first-time setup and private access

## Quick start

```bash
npm install
npm run dev
```

- Backend: `http://localhost:3001`
- Frontend: `http://localhost:5173`

## Testing and build

```bash
npm test
npm run build
```

## Environment variables

Backend environment variables:

- `PORT`
- `HOST`
- `DATABASE_PATH`
- `SESSION_SECRET`
- `APP_BASE_URL`
- `TMUX_BINARY_PATH`
- `TAILSCALE_ALLOWED_IDENTITIES` (comma-separated)
- `TERMINAL_POLL_INTERVAL_MS`

## Documentation

- Full product spec: [`CLOUDCODE_SPEC.md`](./CLOUDCODE_SPEC.md)
- Install guide: [`docs/install.md`](./docs/install.md)
- Release checklist: [`docs/release-checklist.md`](./docs/release-checklist.md)
- Tailscale example: [`docs/tailscale.md`](./docs/tailscale.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Security policy: [`SECURITY.md`](./SECURITY.md)
- Code of conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)
