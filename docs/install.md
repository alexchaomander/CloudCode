# CloudCode Installation Guide

This guide will help you set up CloudCode on your workstation. CloudCode is designed to be self-hosted on a Linux or macOS machine and accessed securely, primarily over a [Tailscale](https://tailscale.com) network.

## Prerequisites

- **OS**: Linux (Ubuntu/Debian recommended) or macOS.
- **Node.js**: Version 22.0 or higher.
- **tmux**: Required for persistent session management.
- **Coding Agents**: At least one agent CLI (e.g., `claude`, `gemini`, `codex`, `copilot`) should be installed and in your system `PATH`.
- **Tailscale**: (Optional but strongly recommended) For secure remote access from your phone.

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit the `.env` file and set a secure `SESSION_SECRET`. You can generate one with:
```bash
openssl rand -hex 64
```

### 4. Initialize Database

Run the migrations to set up the SQLite database and seed the default agent profiles:
```bash
npm run migrate
```

### 5. Build the application

Build both the backend and the frontend:
```bash
npm run build
```

### 6. Start CloudCode

```bash
npm start
```

CloudCode will be listening on `http://0.0.0.0:3000` (or the port specified in your `.env`).

### 7. Bootstrap Admin Account

Open `http://localhost:3000/bootstrap` in your browser to create your initial admin account. After bootstrapping, you can log in at `http://localhost:3000/login`.

---

## Running as a systemd Service (Linux)

To keep CloudCode running in the background and start it automatically on boot, we recommend using `systemd`.

### 1. Configure the service file

The repository includes a `cloudcode.service` file. By default, it expects CloudCode to be located in `/opt/cloudcode`.

```bash
# Copy the project to /opt
sudo mkdir -p /opt/cloudcode
sudo cp -rv . /opt/cloudcode/
sudo chown -R $USER:$USER /opt/cloudcode

# Copy the service file
sudo cp cloudcode.service /etc/systemd/system/cloudcode@.service
```

### 2. Enable and start the service

Replace `$USER` with your actual Linux username:

```bash
sudo systemctl daemon-reload
sudo systemctl enable cloudcode@$USER
sudo systemctl start cloudcode@$USER
```

### 3. Monitor logs

```bash
journalctl -u cloudcode@$USER -f
```

---

## Verifying Dependencies

### tmux

CloudCode requires `tmux` 3.0 or later.
```bash
tmux -V
```

### Agent CLIs

Verify that CloudCode can find your agents:
```bash
which claude   # Claude Code
which gemini   # Gemini CLI
which copilot  # GitHub Copilot CLI
```

For detailed agent setup and authentication, see [docs/agents.md](agents.md).

---

## Troubleshooting

### Port Conflicts
If port 3000 is taken, update the `PORT` variable in your `.env` file.

### Permissions
If you get database errors, ensure the directory containing your `DATABASE_PATH` (default `./data/`) is writable by the user running the process.

### Environment in tmux
If your agent CLIs require specific environment variables (like `ANTHROPIC_API_KEY`), ensure they are exported in your shell before starting CloudCode, or add them to the `.env` file. CloudCode passes its environment to the tmux sessions it creates.
