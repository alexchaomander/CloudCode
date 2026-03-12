# CloudCode Installation Guide

## Prerequisites

- Linux workstation (macOS supported as secondary platform)
- Node.js 22+
- tmux
- At least one coding agent CLI installed (e.g. `claude`, `gemini`, `codex`)
- Tailscale (optional but strongly recommended)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-org/cloudcode.git /opt/cloudcode
cd /opt/cloudcode
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your settings
nano .env
```

At minimum, set:
- `SESSION_SECRET` — generate with `openssl rand -hex 64`
- `DATABASE_PATH` — path for the SQLite database file
- `APP_BASE_URL` — the URL you'll access CloudCode from

### 4. Run database migrations

```bash
npm run migrate
```

This creates the database and seeds default agent profiles.

### 5. Build the frontend

```bash
npm run build
```

### 6. Start CloudCode

```bash
npm start
```

### 7. Bootstrap admin account

Open `http://localhost:3000/bootstrap` in your browser and create the first admin account.

---

## Running as a systemd Service

### 1. Copy the service file

```bash
sudo cp cloudcode.service /etc/systemd/system/cloudcode@.service
```

### 2. Install CloudCode

```bash
sudo mkdir -p /opt/cloudcode
sudo cp -r . /opt/cloudcode/
sudo chown -R $USER:$USER /opt/cloudcode
```

### 3. Enable and start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudcode@$USER
sudo systemctl start cloudcode@$USER
```

### 4. Check status

```bash
sudo systemctl status cloudcode@$USER
journalctl -u cloudcode@$USER -f
```

---

## Updating CloudCode

```bash
cd /opt/cloudcode
git pull
npm install
npm run build
npm run migrate
sudo systemctl restart cloudcode@$USER
```

---

## Verifying tmux

CloudCode requires tmux to be installed and accessible:

```bash
which tmux
tmux -V  # Should show tmux 3.x or later
```

Install tmux if missing:
- Ubuntu/Debian: `sudo apt install tmux`
- macOS: `brew install tmux`

---

## Verifying Agent CLIs

Test that your agent CLIs are in PATH:

```bash
which claude   # Claude Code
which gemini   # Gemini CLI
which codex    # OpenAI Codex
which gh       # GitHub Copilot CLI (gh extension install github/gh-copilot)
```

CloudCode will launch these as subprocess commands within tmux sessions.

For full installation and authentication instructions for each agent, see **[docs/agents.md](agents.md)**.

---

## Data Storage

CloudCode stores data in:
- `DATABASE_PATH` — SQLite database (sessions, profiles, audit logs)
- Session output is captured live from tmux panes

---

## Troubleshooting

### Port already in use

Change `PORT` in `.env` to an available port.

### tmux sessions not found

Ensure tmux is running as the same user as CloudCode. Sessions are named `cloudcode-{publicId}`.

### Database errors

Ensure the directory for `DATABASE_PATH` exists and is writable:

```bash
mkdir -p $(dirname $DATABASE_PATH)
```

### Agent not launching

Verify the agent CLI is in PATH for the user running CloudCode:

```bash
sudo -u cloudcode-user which claude
```
