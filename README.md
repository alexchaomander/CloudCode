# CloudCode ☁️💻

A self-hosted web interface for managing and monitoring local CLI-based AI coding agents — remotely, from any device.

> **CloudCode is not a coding agent.** It is a remote control layer for agents you already have installed and authenticated on your machine. You bring the agent (Claude Code, Gemini CLI, etc.) — CloudCode lets you monitor and interact with it from anywhere.

Start an agent on your laptop, walk away, and check in from your phone or tablet. CloudCode keeps the session alive, renders the output cleanly, and lets you stay in the loop wherever you are.

<p align="center">
<img width="390" height="746" alt="image" src="https://github.com/user-attachments/assets/39a69c17-44c0-42de-9ad7-13bd551bff1d" />
</p>

---

## Why CloudCode?

- **Agent agnostic:** Works with Claude Code, Gemini CLI, OpenAI Codex, GitHub Copilot CLI, or any CLI tool.
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
- **cloudflared** — public tunnel without a VPN: [Install Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)

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
npm install -g @humans-of-ai/cloudcode
```

Verify the install:

```bash
cloudcode --version
```

### Build from source

```bash
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode
npm install
npm run install:cli
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

## FAQ

**Is CloudCode a coding agent?**
No. CloudCode does not write code, call AI APIs, or make decisions. It is a remote control interface — a layer that wraps and exposes CLI tools you already have running on your machine. The intelligence comes entirely from the agent you choose to run.

**Do I need an API key or AI subscription to use CloudCode?**
Not for CloudCode itself. However, the coding agents you run through it (Claude Code, Gemini CLI, etc.) require their own authentication, API keys, and subscriptions. Set those up first, verify they work in your terminal, then use CloudCode to manage them remotely.

**Which coding agents are supported?**
Any CLI tool. CloudCode has built-in profiles for Claude Code, Gemini CLI, and OpenAI Codex, but you can run any command-line program using the `custom` profile. If it runs in a terminal, CloudCode can manage it.

**Does my code or terminal output get sent to CloudCode servers?**
No. CloudCode is entirely self-hosted — it runs on your own machine and your data never leaves your network (unless you explicitly use a Cloudflare tunnel for remote access, in which case traffic passes through Cloudflare's infrastructure).

**Why does CloudCode require Go?**
CloudCode uses a small Go-based sidecar to interface with UNIX pseudo-terminals (PTYs). Node.js cannot do this reliably natively. The sidecar is compiled once during installation and runs transparently in the background.

**What happens if my laptop goes to sleep while an agent is running?**
The agent keeps running. Sessions are managed by `tmux`, which is independent of CloudCode's web server. Your agent's process continues as long as the machine is powered on. When you reconnect, CloudCode picks the session back up.

**Can I run multiple agents at the same time?**
Yes. Each session is an independent `tmux` window. You can run as many concurrent sessions as your machine can handle and manage them all from the dashboard.

---

## License

MIT — see [LICENSE](LICENSE).
