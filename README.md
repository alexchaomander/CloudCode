# CloudCode

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org)
[![Tailscale](https://img.shields.io/badge/Network-Tailscale-blue)](https://tailscale.com)

**CloudCode** is a self-hosted, mobile-first web interface for managing local CLI-based coding agents (like Claude Code, Gemini CLI, and GitHub Copilot CLI). 

It allows you to orchestrate long-running agent tasks on your powerful workstation and monitor/interact with them from any device—especially your phone—via a secure, persistent terminal interface.

---

## 🚀 Key Features

*   **📱 Mobile-First Terminal**: A custom thumb-friendly terminal keybar with `Ctrl`, `Esc`, `Tab`, and arrow keys.
*   **🔄 Persistent Sessions**: All agents run inside `tmux` sessions. Disconnect and reconnect anytime without losing progress or output.
*   **🔒 Secure by Design**: Optimized for use over [Tailscale](https://tailscale.com). Optional identity validation ensures only you can access your workstation.
*   **🤖 Universal Orchestration**: Pre-configured for Claude Code, Gemini CLI, OpenAI Codex, and Copilot. Easily add any custom CLI tool as a profile.
*   **📊 Session Snapshots & Audit**: Log agent activity and capture pane state for later review.

---

## 🏗️ How It Works

CloudCode acts as a **private orchestration layer** on your workstation. When you start a session, CloudCode launches your agent inside a native **tmux** session. This ensures that the agent keeps running even if your phone loses connection or you close your browser.

Control everything via a secure, mobile-optimized terminal interface over **Tailscale**.

[**Read the detailed walkthrough →**](docs/how-it-works.md)

---

## 🛠️ Architecture

*   **Backend**: Fastify (Node.js) + TypeScript + SQLite
*   **Frontend**: React + Vite + Tailwind CSS
*   **Orchestration**: native `tmux` integration
*   **Networking**: Native IPv6/Tailscale support

---

## 📦 Getting Started

### 1. Installation

```bash
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode
npm install
```

### 2. Quick Start

```bash
# 1. Setup your environment
cp .env.example .env
# Edit .env to set your SESSION_SECRET

# 2. Run migrations
npm run migrate

# 3. Build and start
npm run build
npm start
```

For detailed setup, see the [Installation Guide](docs/install.md).

---

## 🧪 Testing

```bash
cd backend
npm test
```

---

## 📖 Documentation

*   [Installation Guide](docs/install.md)
*   [Agent Setup & Extensibility](docs/agents.md)
*   [Secure Remote Access (Tailscale)](docs/tailscale.md)

---

## 🛡️ Platform Support

| OS | Supported |
| :--- | :--- |
| Linux | ✅ (Native) |
| macOS | ✅ (Supported) |
| Windows | ❌ (Not supported; requires tmux) |

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📜 License

[MIT](LICENSE) — © 2026 CloudCode Contributors
