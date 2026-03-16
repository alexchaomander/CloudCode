# Remote Control in CloudCode

The **Remote Control** feature in CloudCode provides a seamless way to access your local developer environment from any device. It achieves 100% functional parity with Claude Code's remote control but expands it to support any AI agent CLI.

## Usage Modes

### 1. Interactive Launch (`cloudcode run <agent> --rc`)
This is the equivalent of `claude --rc`. It starts the specified agent in a local `tmux` session, attaches your terminal to it, and simultaneously generates a remote access link.
- **Best for:** Starting a task locally and being able to walk away with your phone while the agent works.

### 2. Server Mode (`cloudcode start --rc`)
This is the equivalent of `claude remote-control`. It starts the CloudCode background server and displays a pairing QR code. It doesn't start a specific agent locally but makes your entire environment available for remote management.
- **Best for:** Leaving your laptop at home/office and accessing it throughout the day.

### 3. Mid-Session Handoff (`cloudcode share`)
This is the equivalent of the `/rc` command. Run this command inside any existing `tmux` session on your machine. It will communicate with the CloudCode backend and generate a pairing QR code for that specific session.
- **Best for:** When you're in the middle of a terminal session and realize you need to switch to mobile.

## Connectivity Options

CloudCode supports two primary ways to connect remotely without opening firewall ports:

| Method | Flag | Description |
| :--- | :--- | :--- |
| **Tailscale** | (Automatic) | If Tailscale is running, CloudCode uses your private Tailnet URL. Most secure and recommended. |
| **Cloudflare** | `--tunnel` | Uses `cloudflared` to create a public temporary relay. Works behind any firewall without a VPN. |

## Magic Pairing

CloudCode uses a "Zero-Password" pairing system:
1. When you run a command with `--rc`, it generates a short-lived (5 min) cryptographic token.
2. It embeds this token into a QR code.
3. When you scan the QR code, the remote device is instantly authenticated and granted a 30-day session cookie.
4. No need to type passwords or manage SSH keys on your mobile device.
