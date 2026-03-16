# Alternatives to tmux for Terminal Multiplexing

While `tmux` is the current engine behind CloudCode, there are several alternatives that each offer different trade-offs in terms of performance, ease of use, and feature set.

## 1. GNU Screen
The "original" terminal multiplexer.
- **Pros:** Ubiquitous (pre-installed on many systems), extremely stable.
- **Cons:** Less flexible than `tmux` (e.g., vertical splits are complex), configuration is more archaic, and it has fewer scriptable features for a backend.

## 2. Abduco & Dvtm
A "modular" alternative that separates session management from window management.
- **Pros:** Very lightweight. `abduco` only handles session persistence (detaching/attaching), while `dvtm` handles the tiling/UI.
- **Cons:** Requires installing two separate tools. Doesn't have as rich an ecosystem of plugins as `tmux`.

## 3. Persistent PTY via xterm.js (Headless)
Instead of a multiplexer, the backend can manage the PTY (Pseudo-Terminal) directly and use `xterm-headless` on the server to maintain a virtual screen buffer.
- **Pros:** No dependency on `tmux` or `screen`. Full control over the terminal state within Node.js.
- **Cons:** You lose the ability to "attach" to the same session from a physical terminal. If the Node.js process dies, the session state is lost unless you implement a complex persistence layer.

## 4. GoTTY or ttyd
Standalone Go/C binaries that share a terminal as a web service.
- **Pros:** Instant web terminal for any CLI command.
- **Cons:** Not designed as a library to be integrated into a larger management app like CloudCode. Harder to manage multiple concurrent sessions and auth.

## 5. Zellij
A modern, Rust-based multiplexer designed with a more user-friendly UI and "layout" system.
- **Pros:** Very fast, built-in "floating" panes, and a much more modern configuration system (KDL).
- **Cons:** Newer than `tmux`, so it might have fewer edge-case fixes. Not as easily scriptable via a CLI as `tmux`'s `send-keys` and `capture-pane` commands.

---

### Comparison Matrix

| Feature | tmux | Screen | Zellij | Raw PTY |
| :--- | :---: | :---: | :---: | :---: |
| **Session Persistence** | Yes | Yes | Yes | No (requires custom logic) |
| **Scriptability** | Excellent | Good | Good | Direct (via Node/Go) |
| **Host Attachment** | Yes | Yes | Yes | No |
| **Performance** | High | High | Very High | Direct |
| **Dependency** | tmux binary | screen binary | zellij binary | None |

### Recommendation for CloudCode
We stick with **tmux** because it allows for the "Mirror" mode where a user can attach to the same session from their local terminal and their phone simultaneously. This is a core part of the "Remote Control" vision.
