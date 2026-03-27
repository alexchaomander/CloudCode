# How CloudCode Works

CloudCode acts as a **private bridge** between your powerful workstation and your mobile devices. It allows you to run resource-heavy coding agents locally while controlling them from anywhere.

---

### 1. Persistent Orchestration (The "Core")
Unlike a standard web terminal, CloudCode doesn't just run a process; it manages **native tmux sessions**.
*   **Durability**: When you start an agent (like `claude` or `copilot`), it runs in a standalone tmux session on your workstation.
*   **Persistence**: If your phone loses signal, your laptop lid closes, or you refresh your browser, the agent **never stops thinking**. It continues running in the background.
*   **Reattachment**: When you reconnect, CloudCode instantly "attaches" your view back to the live session.

### 2. Mobile-First Terminal UX
Standard mobile keyboards are missing critical developer keys (`Ctrl`, `Esc`, `Tab`). 
*   **Custom Keybar**: CloudCode provides a thumb-friendly bar for these modifiers.
*   **Control Mode**: Tapping `CTRL` opens a specialized overlay grid, making complex shortcuts like `Ctrl+C` or `Ctrl+Z` effortless on a touchscreen.
*   **Haptic Feedback**: Every keypress provides a subtle vibration, making the virtual terminal feel tactile and responsive.
*   **Bit-Perfect PTY Stream**: CloudCode uses a dedicated PTY sidecar to attach to tmux. The stream is decoupled: raw binary bytes are forwarded immediately to the browser for a bit-perfect live view, while a parallel processor handles UTF-8 decoding and semantic filtering for the transcript. This ensures no characters (like emojis or symbols) are dropped or corrupted.

### 3. Connection Resilience

tmux guarantees the *agent* survives any disruption — but the *connection* between your phone and the server is a separate problem. Standard WebSocket over TCP has the same fragility as SSH: a network change kills the socket silently, and neither side knows until TCP's own timeout fires (which can take minutes).

CloudCode uses a layered approach to detect and recover from these failures as fast as possible:

**Server-side heartbeat**
The server sends a `ping` message every 15 seconds. If a `pong` does not arrive before the next ping interval, the connection is declared dead and closed immediately. This bounds the detection window to under 20 seconds instead of waiting for TCP's multi-minute timeout.

**Client-side ping watchdog**
The client tracks the timestamp of the last server ping. If no ping has been received for 35 seconds — a signal that the TCP socket is silently dead — the client force-closes the socket and starts a fresh reconnect. This catches the mirror case where the server is alive but the client's side of the connection has gone stale (common after a phone wake from sleep with NAT table entries already expired).

**Network-aware reconnect**
The browser's `online` event fires when a network interface becomes available — including transitions between Wi-Fi and cellular. CloudCode listens for this event and immediately cancels any pending backoff retry and opens a new WebSocket. On a typical Wi-Fi↔cellular switch, the terminal is back live in under two seconds.

**Improved wake-from-sleep recovery**
When the browser tab becomes visible again, CloudCode checks not only for closed sockets but also for sockets stuck in the `CONNECTING` state — a common artifact of waking a phone that had an in-flight connection attempt. Stuck sockets are terminated and replaced immediately rather than waiting for the connection attempt to time out.

---

### 4. Secure Remote Access
CloudCode is designed to be used over [Tailscale](https://tailscale.com).
*   **Private Networking**: Your workstation gets a private IP that is only accessible to your devices.
*   **Identity Validation**: When integrated with Tailscale, CloudCode can verify exactly *who* is accessing the server before they even see a login page.
*   **Zero-Trust**: No ports need to be opened to the public internet.

### 5. Safety & Auditing
Because agents are powerful, CloudCode prioritizes transparency:
*   **Path Sandboxing**: Agents are restricted to specific "Repository Roots" to prevent accidental directory traversal.
*   **Live Audit Logs**: Every session creation, stop command, and profile change is logged with a timestamp and user ID.
*   **Readable Logs**: Session output is processed and rendered as formatted Markdown, giving you a clean, scrollable history of everything the agent did.

---

### Summary Flow
1.  **Workstation**: Runs the CloudCode backend, SQLite DB, and tmux.
2.  **Tailscale**: Securely tunnels your phone to your workstation.
3.  **Phone / Terminal**: Accesses the CloudCode PWA or uses the `cloudcode` CLI to launch, monitor, and interact with agents via a bit-perfect PTY stream backed by tmux sessions.
4.  **Resilience layer**: Server heartbeat + client watchdog + network-event listener ensure the WebSocket reconnects within seconds of any network disruption — phone sleep, Wi-Fi↔cellular switch, or brief signal loss.
