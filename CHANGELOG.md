# Changelog

All notable changes to CloudCode will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added

- Mobile task dispatcher on the dashboard for fast task submission to local coding agents
- Visible agent selection in the quick dispatch card so tasks can be routed to different agents intentionally
- Full transcript reader with paginated history, scrollback loading, and timestamped session output
- Session loading panel that appears immediately after launch so users see progress before terminal output arrives

### Changed

- Dashboard layout now prioritizes live sessions and reduces top-level copy for a cleaner mobile control surface
- Quick dispatch now opens the live terminal first, while logs remain a secondary transcript view
- Session details are tucked behind a `Details` action instead of competing with the primary live views
- Mirror/live session UX now reflects CloudCode-managed sessions and uses `Live Sessions` terminology

### Fixed

- Transcript capture now starts at session creation time and avoids duplicate writes from websocket fallback paths
- Repeated terminal redraw noise is deduplicated before it reaches the transcript reader
- Logs now start from the beginning of a session by default instead of only showing the current terminal screen
- Background transcript append failures are logged with session context instead of being swallowed silently

## [0.1.6] — 2026-03-18

### Fixed

- macOS Gatekeeper now allows the PTY sidecar to run — Go binaries are ad-hoc signed via `codesign --force --sign -` in `postinstall.mjs` and in the local build scripts

### Improved

- **Pinch-to-zoom**: two-finger pinch scales terminal font size (9–24px); A+ / A- keybar buttons for tap-based adjustment
- **Soft keyboard layout**: `interactive-widget=resizes-content` viewport meta + `visualViewport` resize listener keeps the terminal correctly sized when the iOS/Android keyboard opens and closes
- **Landscape mode**: ghost input and keybar collapse into a single 44px row on phones in landscape, giving ~80px more terminal height
- **Scroll-to-bottom indicator**: floating button appears when scrolled up; pulses with "New output" label when the agent produces output while you are reading earlier history
- **Ghost input**: `autoCorrect`, `autoCapitalize`, `spellCheck` suppressed so iOS does not mangle terminal commands; `enterKeyHint="send"` on the keyboard
- **Pinch/scroll conflict**: second touch cancels the active scroll gesture so pinch-to-zoom always registers cleanly
- **Scroll focus guard**: tapping to open the keyboard no longer fires after a scroll gesture ends
- **Keybar discoverability**: right-edge fade gradient hints that more buttons exist off-screen
- **Scroll position indicator**: only shown when scrolled up, not redundantly at the bottom
- **Safe area insets**: keybar clears the iPhone home-bar gesture zone via `env(safe-area-inset-bottom)`
- **xterm viewport**: `touch-action: none` prevents browser native scroll from conflicting with the pointer-event scroll handler
- Terminal header hidden on mobile to maximise screen real estate

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
