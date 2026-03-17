# CloudCode ☁️💻

A self-hosted web interface for managing and monitoring local CLI-based AI coding agents — remotely, from any device.

![CloudCode screenshot](docs/images/screenshot.png)

Start an agent on your laptop, walk away, and check in from your phone or tablet. CloudCode keeps the session alive, renders the output cleanly, and lets you stay in the loop wherever you are.

---

## Why CloudCode?

- **Agent agnostic:** Works with Claude Code, Gemini CLI, OpenAI Codex, or any CLI tool.
- **Readable logs:** Intercepts raw terminal output and renders it as formatted Markdown — easier to read on mobile.
- **QR code pairing:** Scan a QR code from your terminal to authenticate your phone. No passwords or SSH keys.
- **Persistent sessions:** Sessions run inside `tmux`. Your agent keeps working if your laptop sleeps or your connection drops. Reconnect and pick up where you left off.
- **Flexible networking:** Works on local Wi-Fi, over Tailscale (private network), or via Cloudflare Tunnels (no port-forwarding needed).
- **Git worktree isolation:** Run agents in isolated `git worktrees` to keep your working directory clean.

---

## Prerequisites

- **Node.js (v22+)**: [Download Node.js](https://nodejs.org/)
- **Go (v1.22+)**: [Download Go](https://go.dev/doc/install) or `brew install go` (macOS)
- **tmux**:
  - macOS: `brew install tmux`
  - Ubuntu/Debian: `sudo apt install tmux`
- **git**: [Download Git](https://git-scm.com/downloads)

### Optional (for remote access outside your local network)

- **Tailscale** — private, secure remote access: [Install Tailscale](https://tailscale.com/download)
- **cloudflared** — public tunnel without a VPN: [Install Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-cloudflare-tunnel/)

---

## Networking Options

### Same Wi-Fi network (simplest)
Your phone and laptop are on the same network. No extra setup needed.
```bash
cloudcode run gemini-cli --rc
```

### Remote, without a VPN (`--tunnel`)
Cloudflare creates a temporary public URL. Your session is still protected by the pairing token.
```bash
cloudcode run gemini-cli --rc --tunnel
```

### Remote, via Tailscale (most secure)
Both devices run Tailscale. CloudCode auto-detects it and uses your private `*.ts.net` address.
```bash
cloudcode run gemini-cli --rc
```

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode

# 2. Build and install the CLI
npm install
npm run install:cli

# 3. Verify the install
cloudcode --version
```

---

## Usage

### Launch an agent with remote control
```bash
cloudcode run claude-code --rc
```
Starts the agent in a `tmux` session, attaches your terminal, and prints a QR code to pair your phone.

### Start a persistent server dashboard
```bash
cloudcode start --rc
```
Runs CloudCode as a background server so you can launch agents later from your phone.

### Share an existing session
```bash
cloudcode share
```
Grabs the current `tmux` session and generates a pairing QR code.

### Use a Cloudflare tunnel
```bash
cloudcode run claude-code --rc --tunnel
```

### Run a custom CLI tool
```bash
cloudcode run custom --command "npx some-ai-tool" --rc
```

---

## Architecture

- **Backend:** Node.js + Fastify + SQLite (via Better-SQLite3)
- **Frontend:** React + Tailwind CSS + xterm.js + react-markdown
- **PTY engine:** Go-based sidecar that bridges Node.js to UNIX pseudo-terminals
- **Session multiplexer:** `tmux`

---

## License

MIT — see [LICENSE](LICENSE).
