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

### 3. Secure Remote Access
CloudCode is designed to be used over [Tailscale](https://tailscale.com).
*   **Private Networking**: Your workstation gets a private IP that is only accessible to your devices.
*   **Identity Validation**: When integrated with Tailscale, CloudCode can verify exactly *who* is accessing the server before they even see a login page.
*   **Zero-Trust**: No ports need to be opened to the public internet.

### 4. Safety & Auditing
Because agents are powerful, CloudCode prioritizes transparency:
*   **Path Sandboxing**: Agents are restricted to specific "Repository Roots" to prevent accidental directory traversal.
*   **Live Audit Logs**: Every session creation, stop command, and profile change is logged with a timestamp and user ID.
*   **Snapshots**: You can capture the current state of a terminal pane at any time for later review or debugging.

---

### Summary Flow
1.  **Workstation**: Runs the CloudCode backend, SQLite DB, and tmux.
2.  **Tailscale**: Securely tunnels your phone to your workstation.
3.  **Phone**: Accesses the CloudCode PWA to launch, monitor, and interact with agents via a high-performance terminal.
