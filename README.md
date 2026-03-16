# CloudCode

CloudCode is a secure, self-hosted web interface for managing and remote-controlling your local coding agents (Claude Code, Gemini CLI, Copilot, etc.) from any device. 

Think of it as a private "Remote Control Hub" for your AI tools. It uses `tmux` to ensure your sessions are persistent and perfectly synced between your physical terminal and the web.

## 🚀 Features

- **Agent Agnostic:** Works with Claude Code, Gemini CLI, GitHub Copilot CLI, OpenAI Codex, or any arbitrary CLI tool.
- **Magic Pairing:** Scan a QR code in your terminal to instantly log in on your phone—no passwords or SSH keys required.
- **Perfect Sync:** Real-time mirroring between your local terminal and the mobile web interface.
- **Zero-Config Remote Access:** Built-in support for **Tailscale** (private network) and **Cloudflare Tunnels** (public relay) to work behind any firewall.
- **Git Worktree Isolation:** Launch agents in isolated worktrees so your local working directory stays clean.
- **Persistent Sessions:** Sessions live in `tmux`, so they survive network drops, device switches, and laptop sleep cycles.

## 📦 Installation

```bash
# 1. Clone the repo
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode

# 2. One-command build and install
npm install
npm run install:cli
```

## 🛠 Usage

### 1. The Interactive Launch (Like `claude --rc`)
Launch an agent locally and have it immediately ready for remote control:
```bash
cloudcode run claude-code --rc
```

### 2. The Server Mode (Like `claude remote-control`)
Expose your environment so you can dial-in from your phone later:
```bash
cloudcode start --rc
```

### 3. The Mid-Session Handoff (Like `/rc`)
Already in a tmux session? Share it to your phone instantly:
```bash
# Run this inside your tmux session
cloudcode share
```

### 4. Zero-Config Public Access
No Tailscale? No problem. Use a Cloudflare relay:
```bash
cloudcode start --rc --tunnel
```

## 🏗 Architecture

CloudCode is built with a focus on security and performance:
- **Backend:** Node.js (Fastify) + SQLite (Better-SQLite3)
- **Frontend:** React + Tailwind CSS + xterm.js
- **PTY Sidecar:** High-performance Go-based PTY manager
- **Multiplexer:** `tmux` (Industry standard for session persistence)

## 📄 License

MIT
