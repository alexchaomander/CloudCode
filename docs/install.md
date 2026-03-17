# Installation Guide

CloudCode can be installed as a global CLI on your system.

## Prerequisites

Before installing CloudCode, ensure you have the following core dependencies installed:

- **Node.js (v22+)**: Powers the backend and CLI. [Download Node.js](https://nodejs.org/) or use `nvm install 22`.
- **Go (v1.22+)**: Required to compile the high-performance PTY sidecar. [Download Go](https://go.dev/doc/install) or run `brew install go` (macOS).
- **tmux**: The terminal multiplexer that keeps your sessions alive. 
  - *macOS:* `brew install tmux`
  - *Ubuntu/Debian:* `sudo apt install tmux`
- **git**: Required for the `--worktree` isolation feature. [Download Git](https://git-scm.com/downloads).

### Optional (For Remote Connectivity)
CloudCode can be used entirely locally, but to control your agents from your phone, you need one of the following:

- **Tailscale**: For highly secure, private remote access. [Install Tailscale](https://tailscale.com/download). Once installed, run `tailscale up`.
- **cloudflared**: For zero-config public remote access without a VPN. [Install Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-cloudflare-tunnel/).
  - *macOS:* `brew install cloudflare/cloudflare/cloudflared`

## Step 1: Clone and Build

```bash
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode
npm install
```

## Step 2: Global Installation (The One-Command Way)

From the root directory, run:

```bash
npm run install:cli
```

This command will:
1.  Build the Backend (TypeScript)
2.  Build the PTY Sidecar (Go)
3.  Build the Frontend (React)
4.  Bundle everything together
5.  Install the `cloudcode` command globally on your machine

## Step 3: Verify Installation

Check if the command is available from **any** directory:

```bash
cloudcode --version
```

## Step 4: First-time Setup (Bootstrap)

Start the server locally to create your admin account:

```bash
cloudcode start
```

1. Open `http://localhost:3000` in your browser.
2. Follow the instructions to create your first admin user.
3. You are now ready to use all `cloudcode` commands!

---

## Updating CloudCode

To update to the latest version:

```bash
git pull
npm run install:cli
```
