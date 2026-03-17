# Roadmap: CloudCode "Remote Control"

Our mission is to bring a first-class remote control experience to CloudCode that rivals `claude --rc` while leveraging the power of `tmux` and `Tailscale`.

## Phase 1: Foundation (The `cloudcode` CLI)
- [x] Implement a global CLI wrapper (`cloudcode`) using `commander`.
- [x] Support `--rc` (Remote Control) flag to start both backend and frontend.
- [x] CLI-driven Tailscale integration: detect if `tailscale` is running and use `tailscale serve`.

## Phase 2: Magic Pairing
- [x] **One-Time Token (OTT) Generation:** Generate short-lived pairing tokens in the CLI.
- [x] **Terminal QR Code:** Display a QR code in the terminal pointing to the pairing URL.
- [x] **Pairing Endpoint:** Add `/api/v1/auth/pair?token=...` to handle auto-authentication.
- [x] **Auth Sync:** Ensure the pairing flow respects `TAILSCALE_ALLOWED_IDENTITIES`.

## Phase 3: Perfect Terminal Sync
- [x] **Mirror Mode:** Automatically sync the web terminal to the active `tmux` session.
- [x] **Auto-Attachment:** If a session is started locally, show it prominently in the mobile dashboard.
- [x] **Notification Support:** Push notifications for agent completion or errors (Web Push API).

## Phase 4: Git Worktree Support
- [x] **Isolated Sessions:** Allow starting a session in a fresh `git worktree`.
- [x] **CLI flag:** Support `cloudcode run claude --worktree`.
- [x] **Cleanup:** Automatically prune worktrees when sessions are deleted.

## Phase 5: Managed Relay (True Zero-Config)
- [x] **Cloudflare Tunnel integration:** Support `--tunnel` flag to use `cloudflared`.
- [x] **Automatic URL generation:** Generate a public `.trycloudflare.com` URL if no Tailscale is found.
- [x] **Security:** Ensure tunnel access still requires CloudCode/Tailscale authentication.

