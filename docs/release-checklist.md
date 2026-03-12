# CloudCode Release Checklist (v1)

## Current launch stage

**Release Candidate (RC)** — complete this checklist before public launch.

## Security
- [ ] `SESSION_SECRET` set to strong random value in production
- [ ] `TAILSCALE_ALLOWED_IDENTITIES` configured
- [ ] app served only on localhost/tailnet
- [ ] HTTPS terminated by Tailscale Serve/reverse proxy
- [ ] smoke test login rate limiting in production-like setup

## Runtime
- [ ] `tmux` available at `TMUX_BINARY_PATH`
- [ ] repo roots configured in Settings
- [ ] required coding CLIs installed on host
- [ ] systemd service starts reliably on reboot

## Quality gates
- [ ] `npm ci`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] CI passing on default branch

## Manual checks
- [ ] Bootstrap first admin works
- [ ] Login/logout works
- [ ] Create/stop/kill/archive session works
- [ ] Terminal reconnect works after page reload
- [ ] Profile CRUD works end-to-end
- [ ] Audit filter and snapshots are recorded
