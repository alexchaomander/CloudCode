# Install Guide

## Requirements

- Node.js 22+
- tmux
- one or more CLI coding agents installed on host

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure backend environment variables.
3. Run tests and build:
   ```bash
   npm test
   npm run build
   ```
4. Start the backend and frontend:
   ```bash
   npm run start -w backend
   npm run preview -w frontend
   ```

## Production notes

- Keep CloudCode private (tailnet/local network only).
- Set strong `SESSION_SECRET`.
- Configure `TAILSCALE_ALLOWED_IDENTITIES`.
- Run as non-root service account.
- Use HTTPS termination via Tailscale Serve or a reverse proxy.

## Database migrations

CloudCode applies SQL migrations from `/migrations` automatically at backend startup and records applied versions in `schema_migrations`.
