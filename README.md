# CloudCode ☁️💻

**The ultimate Remote Control Hub for your AI coding agents.**

CloudCode is a secure, self-hosted web interface that lets you manage, monitor, and remote-control local CLI-based coding agents (like Claude Code, Gemini CLI, or GitHub Copilot CLI) from your phone, tablet, or another laptop. 

Think of it as a persistent, multiplayer terminal environment. You can start a massive refactor on your work laptop, walk away, and securely monitor or guide the agent from your phone on the couch—with beautifully rendered Markdown logs and zero shredded text.

---

## ✨ Why CloudCode?

- **Agent Agnostic:** Works flawlessly with Claude Code, Gemini CLI, OpenAI Codex, or *any* arbitrary CLI tool.
- **Perfect Markdown Logs:** CloudCode intercepts raw terminal bytes and uses an advanced Semantic Processor to output perfectly formatted, highly readable Markdown logs—no weird line breaks or terminal artifacts.
- **Magic Pairing:** Scan a QR code in your terminal to instantly authenticate your mobile device. No passwords or SSH keys required.
- **Persistent `tmux` Sessions:** Sessions live inside `tmux`. If your laptop goes to sleep or you lose Wi-Fi, your agent keeps working. When you reconnect, you're right back where you left off.
- **True Zero-Config Access:** Built-in support for **Tailscale** (for private networking) and **Cloudflare Tunnels** (for public relays). It works behind strict corporate firewalls with zero port-forwarding.
- **Git Worktree Isolation:** Run agents in isolated `git worktrees` so your current local branch and working directory stay perfectly clean.

---

## 📦 Quick Start & Installation

You'll need `node` (v22+) and `go` (v1.22+) installed on your machine. 

```bash
# 1. Clone the repository
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode

# 2. Build and install the global CLI
npm install
npm run install:cli

# 3. Verify it works!
cloudcode --version
```

---

## 🛠️ Usage Scenarios

CloudCode is designed to match and exceed the native remote-control experience of modern AI CLIs.

### 1. The "Interactive Launch" (Best for daily use)
Launch an agent locally in your terminal and immediately generate a secure mobile link.
```bash
cloudcode run gemini-cli --rc
```
*(This starts the agent in a local `tmux` session, attaches your terminal to it, and prints a QR code you can scan with your phone to take control).*

### 2. The "Server Mode" (Best for always-on remote access)
Expose your entire environment as a dashboard so you can dial in and launch agents later from your phone.
```bash
cloudcode start --rc
```

### 3. The "Mid-Session Handoff"
If you are already deep in a `tmux` session on your laptop and realize you need to step away, just run this inside your active terminal:
```bash
cloudcode share
```
*(CloudCode instantly grabs the current session and prints a Magic Pairing QR code).*

### 4. The "Zero-Config Public Relay"
Working at a coffee shop or behind a strict firewall without Tailscale? Use the `--tunnel` flag to spin up a temporary, secure Cloudflare URL (`*.trycloudflare.com`).
```bash
cloudcode run claude-code --rc --tunnel
```

### 5. Custom Agents
Want to run a brand new AI CLI that isn't pre-configured? Just use the `custom` profile!
```bash
cloudcode run custom --command "npx some-new-ai-tool" --rc
```

---

## 🏗 Architecture & Stack

CloudCode is built for absolute performance and security:
- **Backend:** Node.js powered by Fastify, using Better-SQLite3 for blazing-fast local data storage.
- **Frontend:** React + Tailwind CSS + xterm.js (for the interactive PTY mirror) and react-markdown (for the semantic readable logs).
- **PTY Engine:** A high-performance Go-based sidecar that safely bridges Node.js to UNIX pseudo-terminals.
- **Multiplexer:** `tmux` (The battle-tested industry standard for terminal session persistence).

---

## 📄 License
MIT License. Build, extend, and deploy it however you like!
