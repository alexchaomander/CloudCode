# Installation Guide

CloudCode can be installed as a global CLI on your system.

## Prerequisites

- **Node.js**: v22 or higher
- **Go**: v1.22 or higher (to build the PTY sidecar)
- **tmux**: Installed and in your PATH
- **git**: For worktree support
- **Tailscale** (Optional): For private remote access
- **cloudflared** (Optional): For public remote access without a VPN

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
