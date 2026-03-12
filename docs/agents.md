# Supported Agent CLIs

CloudCode ships with pre-configured profiles for the four major coding agent CLIs. This guide covers installation and authentication for each.

---

## Claude Code

**Vendor:** Anthropic
**Command:** `claude`
**Session type:** Persistent interactive REPL

### Install

```bash
npm install -g @anthropic-ai/claude-code
```

Verify:

```bash
claude --version
```

### Authenticate

**Option A — Browser OAuth (recommended):**

```bash
claude
# Follow the prompt to open the browser and log in with your Anthropic account.
# This stores credentials in ~/.claude/
```

**Option B — API key:**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# Add to ~/.bashrc or ~/.zshrc to persist.
```

### How it works in CloudCode

When you create a session with the Claude Code profile, CloudCode launches `claude` in the working directory inside a tmux session. The REPL starts immediately and stays open — send prompts through the terminal, review output, and the session persists even after you close your browser.

---

## Gemini CLI

**Vendor:** Google
**Command:** `gemini`
**Session type:** Persistent interactive REPL

### Install

```bash
npm install -g @google/gemini-cli
```

Verify:

```bash
gemini --version
```

### Authenticate

**Option A — Google OAuth (recommended):**

```bash
gemini
# Follow the prompt to open the browser and sign in with your Google account.
# Credentials are cached locally.
```

**Option B — API key:**

```bash
export GEMINI_API_KEY=AIza...
# Add to ~/.bashrc or ~/.zshrc to persist.
```

### How it works in CloudCode

CloudCode launches `gemini` in the session's working directory. The interactive chat session starts immediately and remains open for the duration of the tmux session.

---

## OpenAI Codex

**Vendor:** OpenAI
**Command:** `codex`
**Session type:** Persistent interactive REPL

### Install

```bash
npm install -g @openai/codex
```

Verify:

```bash
codex --version
```

### Authenticate

Codex requires an OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
# Add to ~/.bashrc or ~/.zshrc to persist.
```

You can also create a `~/.codex/config.json`:

```json
{
  "apiKey": "sk-..."
}
```

### How it works in CloudCode

CloudCode launches `codex` in the session's working directory. The interactive agent session starts immediately.

---

## GitHub Copilot CLI

**Vendor:** GitHub / Microsoft
**Command:** `copilot`
**Session type:** Persistent interactive REPL

> **Note:** The old `gh copilot` extension was deprecated in October 2025 and has been retired. The current GitHub Copilot CLI is a standalone tool installed separately.

GitHub Copilot CLI is a full agentic assistant that runs directly in your terminal. It supports multi-turn conversations, slash commands (`/plan`, `/model`, `/fleet`, `/diff`, `/resume`), autopilot mode, and session persistence. It is a persistent REPL just like Claude Code, Gemini CLI, and OpenAI Codex.

### Install

**Via npm (recommended — consistent with other CLIs in this list):**

```bash
npm install -g @github/copilot
```

**Via install script (macOS/Linux):**

```bash
curl -fsSL https://gh.io/copilot-install | bash
```

**Via Homebrew (macOS/Linux):**

```bash
brew install copilot-cli
```

Verify:

```bash
copilot --version
```

### Authenticate

**Option A — Interactive login (recommended):**

On first launch, run `copilot` and use the `/login` slash command:

```bash
copilot
# At the prompt, type:
/login
# Follow the browser flow to authenticate with your GitHub account.
```

**Option B — Personal access token:**

Create a fine-grained GitHub personal access token with **Copilot Requests** permission, then set it in your environment:

```bash
export COPILOT_GITHUB_TOKEN=github_pat_...
# Fallbacks: GH_TOKEN, GITHUB_TOKEN (checked in that order)
# Add to ~/.bashrc or ~/.zshrc to persist.
```

### Key slash commands

| Command | What it does |
|---------|-------------|
| `/plan` | Build a structured implementation plan before writing code |
| `/model` | Switch between available AI models |
| `/fleet` | Run the same task across parallel subagents |
| `/diff` | Review changes before applying them |
| `/resume` | Resume a previous session with saved context |
| `/mcp` | Connect GitHub-native MCP integrations |
| `/login` | Authenticate with your GitHub account |

Press **Shift+Tab** to cycle between default, plan, and autopilot modes.

### How it works in CloudCode

CloudCode launches `copilot` in the session's working directory. The interactive REPL starts immediately — send prompts, use slash commands, and the session persists in tmux through browser disconnects and phone sleep. Use `/resume` within a session to pick up a previous Copilot conversation.

---

## Comparing the Four

| | Claude Code | Gemini CLI | OpenAI Codex | GitHub Copilot CLI |
|-|-------------|------------|--------------|-------------------|
| **Session type** | Persistent REPL | Persistent REPL | Persistent REPL | Persistent REPL |
| **Command** | `claude` | `gemini` | `codex` | `copilot` |
| **Auth** | Anthropic account / API key | Google account / API key | `OPENAI_API_KEY` | GitHub account / `COPILOT_GITHUB_TOKEN` |
| **Install** | `npm i -g @anthropic-ai/claude-code` | `npm i -g @google/gemini-cli` | `npm i -g @openai/codex` | `npm i -g @github/copilot` |
| **Plan mode** | Yes | No | No | Yes (`/plan`, Shift+Tab) |
| **Works offline** | No | No | No | No (requires API/auth) |

---

## Troubleshooting

### Agent command not found

CloudCode runs agents as the same user as the server process. Ensure the CLI is in that user's PATH:

```bash
# Test as the CloudCode user
sudo -u your-user which claude
sudo -u your-user which gemini
sudo -u your-user which codex
sudo -u your-user which copilot
```

If installed via `npm install -g`, ensure npm's global bin directory is in PATH. Add to `~/.bashrc` or `~/.profile`:

```bash
export PATH="$PATH:$(npm bin -g)"
```

### Authentication expires

- **Claude Code:** Re-run `claude` to refresh OAuth, or rotate the `ANTHROPIC_API_KEY`.
- **Gemini CLI:** Re-run `gemini` to refresh Google OAuth.
- **OpenAI Codex:** Rotate `OPENAI_API_KEY` in your environment.
- **GitHub Copilot CLI:** Re-run `/login` inside `copilot`, or rotate `COPILOT_GITHUB_TOKEN`.

### Session starts but agent exits immediately

Check if the API key or credentials are missing. Run the agent CLI manually in the working directory to see the error:

```bash
cd /path/to/your/repo
claude   # or: gemini, codex, copilot
```
