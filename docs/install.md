# Installation Guide

## Prerequisites

- **Node.js (v22+)**: [Download Node.js](https://nodejs.org/) or use `nvm install 22`
- **tmux**:
  - macOS: `brew install tmux`
  - Ubuntu/Debian: `sudo apt install tmux`
- **git**: [Download Git](https://git-scm.com/downloads)

### Optional (for remote access outside your local network)

- **Tailscale** — private, secure remote access: [Install Tailscale](https://tailscale.com/download)
- **cloudflared** — public tunnel without a VPN: [Install Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
  - macOS: `brew install cloudflare/cloudflare/cloudflared`

---

## Install via npm (recommended)

```bash
npm install -g cloudcode
```

Verify the install:

```bash
cloudcode --version
```

Then run first-time setup:

```bash
cloudcode start
```

Open `http://localhost:3000` and follow the instructions to create your admin account.

---

## Build from source

Use this if you want to develop locally or run the latest unreleased code.

**Additional prerequisite:** Go 1.22+ — required to compile the PTY sidecar.
- [Download Go](https://go.dev/doc/install) or `brew install go` (macOS)

```bash
git clone https://github.com/alexchaomander/CloudCode.git
cd CloudCode
npm install
npm run install:cli
```

---

## Updating

### npm install
```bash
npm install -g cloudcode
```

### Built from source
```bash
git pull
npm install && npm run install:cli
```
