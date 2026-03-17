# Changelog

All notable changes to CloudCode will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2025-01-01

### Added

- Initial open source release
- Self-hosted web interface for managing CLI-based coding agent sessions
- tmux-backed session management — sessions persist through browser disconnects
- WebSocket terminal with xterm.js — live terminal interaction from browser
- Mobile-first UI designed for phone portrait mode with thumb-friendly controls
- Agent profiles — pre-configured for Claude Code, Gemini CLI, GitHub Copilot CLI, Codex
- Session dashboard with All / Running / Archived filter tabs and 10-second auto-refresh
- Secure authentication — argon2id password hashing, 30-day session cookies
- Tailscale identity header validation for network-layer access control
- Bootstrap flow for first-time admin account creation
- Repo roots — registered working directories with path validation and symlink protection
- Snapshot capture — point-in-time pane captures attached to sessions
- Audit log — all sensitive actions recorded with actor, timestamp, and metadata
- REST API under `/api/v1` for all resources
- SQLite database with WAL mode for reliability
- systemd service example for running as a persistent background service
- Installation guide and Tailscale setup documentation
