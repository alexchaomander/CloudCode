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
**Command:** `gh copilot`
**Session type:** Per-invocation (not a persistent REPL)

GitHub Copilot CLI is invoked per request, unlike the other three agents. CloudCode handles this by launching a **login shell** (`bash -l`) as the session process, then automatically running `gh copilot suggest` as the first command via the profile's startup template. After the suggestion flow completes, the shell remains open — you can run additional `gh copilot suggest` or `gh copilot explain` commands directly.

### Install

GitHub Copilot CLI is a `gh` extension. First install the GitHub CLI:

**Linux:**

```bash
# Debian/Ubuntu
sudo apt install gh

# Fedora/RHEL
sudo dnf install gh

# Or via official script:
curl -sS https://webi.sh/gh | sh
```

**macOS:**

```bash
brew install gh
```

Then install the Copilot extension:

```bash
gh extension install github/gh-copilot
```

Verify:

```bash
gh copilot --version
```

### Authenticate

```bash
gh auth login
# Follow the prompts to authenticate with your GitHub account.
# Choose GitHub.com > HTTPS > browser login.
```

Verify authentication:

```bash
gh auth status
```

### Key commands

| Command | What it does |
|---------|-------------|
| `gh copilot suggest` | Interactively suggests a shell command for a task you describe |
| `gh copilot suggest "list files by size"` | Non-interactively suggests a command |
| `gh copilot explain "tar -xzf file.tgz"` | Explains what a command does |
| `gh copilot explain` | Interactively prompts for a command to explain |

### How it works in CloudCode

When you create a GitHub Copilot CLI session, CloudCode launches `bash -l` and immediately sends `gh copilot suggest` via the startup template. You'll see the "What would you like me to help with?" prompt right away. After each suggestion you can run it, revise it, or run another `gh copilot suggest`.

---

## Comparing the Four

| | Claude Code | Gemini CLI | OpenAI Codex | GitHub Copilot CLI |
|-|-------------|------------|--------------|-------------------|
| **Session type** | Persistent REPL | Persistent REPL | Persistent REPL | Per-invocation (bash shell) |
| **Auth** | Anthropic account / API key | Google account / API key | OpenAI API key | GitHub account (`gh auth`) |
| **Install** | `npm i -g @anthropic-ai/claude-code` | `npm i -g @google/gemini-cli` | `npm i -g @openai/codex` | `gh extension install github/gh-copilot` |
| **Best for** | Long coding tasks, multi-file edits | Chat + code generation | Autonomous coding tasks | Quick shell command suggestions |
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
sudo -u your-user which gh
```

If installed via `npm install -g`, ensure npm's global bin directory is in PATH. Add to `~/.bashrc` or `~/.profile`:

```bash
export PATH="$PATH:$(npm bin -g)"
```

For GitHub Copilot, CloudCode launches `bash -l` (login shell) which sources `~/.profile` and `~/.bash_profile`, so the PATH should be picked up automatically.

### Authentication expires

- **Claude Code:** Re-run `claude` to refresh OAuth, or rotate the `ANTHROPIC_API_KEY`.
- **Gemini CLI:** Re-run `gemini` to refresh Google OAuth.
- **OpenAI Codex:** Rotate `OPENAI_API_KEY` in your environment.
- **GitHub Copilot CLI:** Run `gh auth login` again if `gh auth status` reports expired credentials.

### Session starts but agent exits immediately

Check if the API key or credentials are missing. Run the agent CLI manually in the working directory to see the error:

```bash
cd /path/to/your/repo
claude   # or gemini, codex, gh copilot suggest
```
