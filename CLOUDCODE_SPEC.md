# CloudCode — Full Implementation Spec

## 1. Product Overview

CloudCode is a **self-hosted, mobile-first web application** that provides a secure remote interface for managing **local CLI-based coding agents** running on a developer workstation.

The application is primarily accessed **from a phone over a private Tailscale network** and allows the user to:

- view and manage multiple long-running coding-agent sessions
- create new sessions tied to repositories and working directories
- send input to agent processes as though using a local terminal
- view live terminal output and historical logs
- organize sessions similarly to a tmux-based workflow
- securely access the app through a password-protected web interface
- restrict access to approved Tailscale identities

CloudCode is **not** a remote desktop.  
It is a **tmux-backed orchestration layer for coding agents**.

## 2. Core Goals

### Primary Goals

- Mobile-first control interface for CLI coding agents
- Secure access through Tailscale
- Durable tmux-backed sessions
- Live browser terminal interaction
- Multiple concurrent agent sessions
- Resilient reconnect behavior after phone sleep

### Secondary Goals

- Simple self-hosted install
- Audit trail for sensitive actions
- Agent abstraction layer
- Clean UI for quick monitoring

### Non-Goals (v1)

- Desktop streaming
- Public SaaS deployment
- Multi-user collaboration
- Full unrestricted shell interface
- Complex RBAC

## 3. Target User

Single owner/operator running the app on their personal workstation.

## 4. High-Level Architecture

CloudCode consists of:

### Frontend Web App

Responsibilities:

- mobile-first UI
- session dashboard
- terminal interface
- authentication
- agent profile management

Technologies:

- React
- TypeScript
- Tailwind
- xterm.js

### Backend API Server

Responsibilities:

- REST API
- WebSocket terminal transport
- authentication
- session orchestration
- tmux integration
- audit logging

Technologies:

- Node.js
- TypeScript
- Fastify
- WebSocket
- SQLite

### Runtime Layer

- tmux manages durable sessions
- coding agent CLIs run locally
- repo directories stored locally

### Persistence

- SQLite database
- filesystem logs
- session snapshots

### Network Layer

- Tailscale VPN
- optional `tailscale serve`

## 5. Recommended Tech Stack

### Backend

- Node.js 22+
- TypeScript
- Fastify
- WebSockets
- better-sqlite3
- zod
- argon2
- pino logging

### Frontend

- React
- TypeScript
- Vite or Next.js
- Tailwind CSS
- xterm.js

### Runtime

- systemd service
- tmux

## 6. Supported Platforms

### Primary

Linux workstation

### Secondary

macOS

### Not supported

Windows host

## 7. Security Model

CloudCode executes local commands and therefore requires strong protections.

### Layer 1 — Network

Only accessible via:

- Tailscale
- localhost

Never exposed publicly.

### Layer 2 — Tailscale Identity

Backend validates trusted Tailscale identity headers.

Requests must originate from an **approved tailnet identity**.

### Layer 3 — Application Authentication

User must log in with an app password.

### Layer 4 — Controlled Execution

Sessions must be launched from **approved agent profiles**.

### Layer 5 — Audit Logs

All sensitive actions recorded.

## 8. Product Principles

1. tmux is the durability layer.
2. CloudCode is orchestration.
3. Sessions survive browser disconnects.
4. Mobile-first UX.
5. All actions must be explicit.

## 9. User Experience Requirements

### Mobile-first

- designed for phone portrait mode
- thumb-friendly controls
- session overview without opening terminal

## 10. Primary Screens

1. Login
2. Dashboard
3. Session Terminal
4. New Session
5. Agent Profiles
6. Settings
7. Audit Log

## 11. Data Model

Database: SQLite

### users

id username password_hash is_admin totp_enabled created_at updated_at last_login_at

### auth_sessions

id user_id session_token_hash created_at expires_at ip_address user_agent tailscale_identity

### agent_profiles

id name slug command args_json env_json default_workdir startup_template stop_method supports_interactive_input created_at updated_at

### repo_roots

id label absolute_path created_at updated_at

### sessions

id public_id title agent_profile_id repo_root_id workdir tmux_session_name status created_at updated_at started_at stopped_at last_output_at pinned archived

### session_snapshots

id session_id snapshot_type content_text created_at

### audit_logs

id actor_user_id event_type target_type target_id metadata_json created_at

## 12. Agent Profiles

Profiles abstract coding tools.

Example profiles:

### Claude Code

command: claude args: []

### Gemini CLI

command: gemini args: []

### GitHub Copilot CLI

command: github-copilot

### Codex

command: codex

Profiles are editable.

## 13. Session Model

A session represents:

- coding agent
- working directory
- tmux session
- terminal state

## 14. Session Lifecycle

1. User creates session
2. Backend validates request
3. tmux session created
4. agent command executed
5. terminal output streamed
6. session persists independently of browser
7. user reconnects anytime

## 15. tmux Integration

tmux provides:

- persistence
- detach / attach
- multiplexing
- pane capture
- long running sessions

### Naming

cloudcode-{public_id}

### Required tmux Operations

- create session
- list sessions
- capture pane
- send keys
- kill session
- resize pane

## 16. Terminal Transport

Use authenticated WebSockets.

Messages:

Client → Server

terminal.input terminal.resize subscribe request_refresh

Server → Client

terminal.output session.status session.error

## 17. Output Streaming Strategy

Initial approach:

- poll tmux pane
- capture output every ~500ms
- diff previous buffer
- send changes

Later improvement:

- tmux control mode streaming

## 18. API Specification

All routes prefixed with:

/api/v1

### Auth

#### POST /auth/bootstrap

Creates first admin.

#### POST /auth/login

username password

#### POST /auth/logout

#### GET /auth/me

Returns authenticated user.

## 19. Sessions API

### GET /sessions

List sessions.

### POST /sessions

Create session.

title agent_profile_id repo_root_id workdir startup_prompt

### GET /sessions/:id

Session details.

### POST /sessions/:id/stop

Graceful stop.

### POST /sessions/:id/kill

Force kill.

### POST /sessions/:id/archive

Archive session.

## 20. Terminal API

### GET /sessions/:id/terminal/bootstrap

Returns terminal metadata.

### WebSocket

/ws/terminal

## 21. Frontend UI Specification

### Login Screen

- username
- password
- login button

### Dashboard

Session cards show:

- title
- agent
- path
- status
- last output
- open / stop / kill actions

### New Session

Fields:

- title
- profile
- repo
- workdir
- startup prompt

### Session Detail

Tabs:

- terminal
- snapshots
- metadata

### Terminal View

Must include:

- xterm.js
- resize support
- copy/paste
- mobile keyboard helpers

Buttons:

Ctrl Esc Tab Arrows Enter Paste Interrupt

## 22. Authorization

Single role:

admin

Future roles possible.

## 23. Filesystem Safety

- normalize all paths
- restrict to approved repo roots
- reject symlink escapes

## 24. Logging

Structured logs:

timestamp level user_id session_id event

## 25. Installation

### Requirements

Node.js tmux coding agents

### Setup

npm install run migrations start server configure tailscale

## 26. Environment Variables

Required:

PORT HOST DATABASE_PATH SESSION_SECRET APP_BASE_URL TMUX_BINARY_PATH

Optional:

TAILSCALE_ALLOWED_IDENTITIES TERMINAL_POLL_INTERVAL_MS

## 27. Backend Modules

auth/ profiles/ repos/ sessions/ tmux/ terminal/ audit/ settings/ db/

## 28. Frontend Routes

/login /bootstrap / /sessions/new /sessions/:id /profiles /settings /audit

## 29. Audit Event Types

auth.login_success auth.login_failure session.created session.started session.stopped session.killed profile.updated settings.updated

## 30. Session Creation Algorithm

1. validate user
2. validate tailscale identity
3. load profile
4. validate workdir
5. create tmux session
6. execute agent command
7. store DB record
8. emit audit event

## 31. Stop vs Kill

Stop:

- send Ctrl+C

Kill:

- terminate tmux session

## 32. Mobile Terminal UX

Required controls:

Ctrl Esc Tab Arrows Paste Interrupt

Terminal must reconnect automatically.

## 33. Snapshots

Snapshot types:

- pane capture
- manual note
- system event

## 34. Testing

### Unit

- auth
- path validation
- profile validation

### Integration

- login
- session creation
- terminal attach

## 35. Implementation Phases

### Phase 1

Auth  
Profiles  
Repo roots

### Phase 2

tmux session management

### Phase 3

Terminal streaming

### Phase 4

Security hardening

### Phase 5

UI polish

## 36. Acceptance Criteria

CloudCode v1 complete when:

- user installs locally
- accessible over Tailscale
- login required
- sessions run through tmux
- terminal accessible in browser
- multiple sessions supported
- audit logs recorded

## 37. Deliverables

Coding agent must produce:

- backend server
- frontend web app
- database migrations
- seed profiles
- install docs
- systemd service example
- Tailscale configuration example

## 38. Design Philosophy

Prioritize:

- reliability
- security
- tmux session durability
- mobile usability

Avoid unnecessary complexity.

CloudCode v1 is a **secure tmux orchestration layer for coding agents**.
