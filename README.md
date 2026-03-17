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

## 📋 Prerequisites

Before installing CloudCode, ensure you have the following core dependencies installed:

- **Node.js (v22+)**: Powers the backend and CLI. [Download Node.js](https://nodejs.org/).
- **Go (v1.22+)**: Required to compile the high-performance PTY sidecar. [Download Go](https://go.dev/doc/install) or run `brew install go` (macOS).
- **tmux**: The terminal multiplexer that keeps your sessions alive. 
  - *macOS:* `brew install tmux`
  - *Ubuntu/Debian:* `sudo apt install tmux`
- **git**: Required for the `--worktree` isolation feature. [Download Git](https://git-scm.com/downloads).

### Optional (For Remote Connectivity)
To control your agents from your phone outside your local network, you need one of the following:

- **Tailscale**: For highly secure, private remote access. [Install Tailscale](https://tailscale.com/download).
- **cloudflared**: For zero-config public remote access without a VPN. [Install Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-cloudflare-tunnel/).

## 🌐 How to Connect (Networking Explained Simply)

Depending on where you are and how much setup you want to do, CloudCode has three ways to let your phone talk to your computer. You don't need to be a networking expert to use them:

### 1. The "Home Wi-Fi" Method (Easiest)
If you just want to control your laptop from the couch, you don't need any extra software.
- **How it works:** CloudCode finds your computer's local IP address (like `192.168.1.x`) and puts it in the QR code.
- **Requirements:** Your phone and laptop **must be on the exact same Wi-Fi network**.
- **Command:** `cloudcode run gemini-cli --rc`

### 2. The "Coffee Shop" Method (Connect from anywhere, no VPN)
If you want to leave your laptop at home and connect to it from a coffee shop, but you don't want to deal with complex VPN setups.
- **How it works:** CloudCode spins up a secure, temporary Cloudflare tunnel. Your QR code will point to a public web address (like `https://random-words.trycloudflare.com`), but it remains secure because your phone needs the secret token inside the QR code to log in.
- **Requirements:** You must install the `cloudflared` tool on your laptop.
- **Command:** `cloudcode run gemini-cli --rc --tunnel`

### 3. The "Private Network" Method (Most Secure)
If you want enterprise-grade security and the ability to connect from anywhere, without exposing any public web links.
- **How it works:** Tailscale creates a private, invisible mesh network between your devices. CloudCode automatically detects it and uses your secure `*.ts.net` address.
- **Requirements:** Both your laptop and your phone must have the [Tailscale](https://tailscale.com) app installed and turned on.
- **Command:** `cloudcode run gemini-cli --rc` (it automatically detects Tailscale!)

---

## 📦 Quick Start & Installation

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
