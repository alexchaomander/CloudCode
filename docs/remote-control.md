# Remote Control in CloudCode

The **Remote Control** feature in CloudCode provides a seamless way to access your local developer environment from any device. It achieves 100% functional parity with Claude Code's remote control but expands it to support any AI agent CLI.

## Usage Modes

### 1. Interactive Launch (`cloudcode run <agent> --rc`)
This is the equivalent of `claude --rc`. It starts the specified agent in a local `tmux` session, attaches your terminal to it, and simultaneously generates a remote access link.
- **Best for:** Starting a task locally and being able to walk away with your phone while the agent works.

### 2. Server Mode (`cloudcode start --rc`)
This is the equivalent of `claude remote-control`. It starts the CloudCode background server and displays a pairing QR code. It doesn't start a specific agent locally but makes your entire environment available for remote management.
- **Best for:** Leaving your laptop at home/office and accessing it throughout the day.
- **Bonus - Task Sending:** When CloudCode is running in Server Mode, you can use the mobile dashboard's **Send** action to launch a task instantly on your machine. This is the fast path: it uses recent defaults, starts a new background session, and takes you straight into the live terminal first. The **Logs** tab gives you the full transcript later if you want to review the session from the top.

#### Send vs Create
- **Send:** Best when speed matters and the recent agent/workspace defaults are good enough.
- **Create:** Best when you want to choose the agent, workspace, title, or worktree before launch.
- **Rule of thumb:** Send for “do this now,” create for “set this up carefully.”

### 3. Mid-Session Handoff (`cloudcode share`)
This is the equivalent of the `/rc` command. Run this command inside any existing `tmux` session on your machine. It will communicate with the CloudCode backend and generate a pairing QR code for that specific session.
- **Best for:** When you're in the middle of a terminal session and realize you need to switch to mobile.

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

## Magic Pairing

CloudCode uses a "Zero-Password" pairing system:
1. When you run a command with `--rc`, it generates a short-lived (5 min) cryptographic token.
2. It embeds this token into a QR code.
3. When you scan the QR code, the remote device is instantly authenticated and granted a 30-day session cookie.
4. No need to type passwords or manage SSH keys on your mobile device.

## Connection Resilience on Mobile

Pairing gets you connected — but mobile networks are inherently unstable. CloudCode is designed to stay live through the disruptions that are normal on a phone:

| Scenario | What happens |
|---|---|
| Phone screen locks / sleeps | Server detects the silent socket within 15 s via heartbeat; client detects it within 35 s via ping watchdog. Both sides clean up and the next wake triggers an instant reconnect. |
| Wi-Fi → cellular (or back) | Browser fires the `online` event the moment a new interface is ready. CloudCode immediately opens a fresh WebSocket — no waiting for the backoff queue. |
| Brief signal loss | Existing exponential backoff (up to 10 retries, capped at 30 s) handles transient drops. |
| Page becomes visible after background | Visibility handler checks for closed *and* stuck-CONNECTING sockets, terminates them, and reconnects before you can tap anything. |

The agent itself is never affected by any of these events — it continues running in its `tmux` session regardless. The resilience work is entirely about getting your phone's view back to the live session as fast as possible.
