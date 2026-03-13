# Agent CLI Setup & Extensibility Guide

CloudCode is an orchestration layer for CLI-based coding agents. This guide explains how to set up the pre-configured agents and, more importantly, **how to add your own custom agents**.

---

## 1. Pre-configured Agents

CloudCode ships with profiles for the "Big 4" agents. You just need to install the binaries and authenticate them once on your host machine.

| Agent | Install Command | Auth Command |
| :--- | :--- | :--- |
| **Claude Code** | `npm i -g @anthropic-ai/claude-code` | `claude` (OAuth) |
| **Gemini CLI** | `npm i -g @google/gemini-cli` | `gemini` (OAuth) |
| **GitHub Copilot** | `npm i -g @github/copilot` | `copilot /login` |
| **OpenAI Codex** | *Follow vendor instructions* | Set `OPENAI_API_KEY` |

---

## 2. Adding Your Own Custom Agent

The true power of CloudCode is its extensibility. You can add **any** CLI-based tool—from a simple bash shell to a custom internal coding agent—through the **Agent Profiles** page in the UI.

### Step-by-Step: Adding a Custom Python Agent
Imagine you have a custom agent script at `~/scripts/my-agent.py`.

1.  **Navigate** to the **Profiles** page in CloudCode.
2.  **Click "Create"** and fill in the following:
    *   **Name**: `My Python Agent`
    *   **Command**: `python3`
    *   **Arguments**: `["/home/user/scripts/my-agent.py", "--interactive"]` (Must be a JSON array)
    *   **Environment**: `{"AGENT_MODE": "advanced"}` (Must be a JSON object)
3.  **Enable "Interactive Mode"** if your script expects user input.
4.  **Save Profile**.

Now, this agent will appear as an option whenever you create a new session.

---

## 3. Advanced Profile Features

### Startup Commands (Templates)
Some CLIs require a "warm-up" command or a specific entry command after they launch. 
*   **Example**: If your tool starts a sub-shell, you might set the Startup Command to `cd src && ls\n`. 
*   **Note**: Always include the `\n` (newline) at the end of the string if you want it to "press enter" for you.

### Environment Variables
CloudCode merges three layers of environment variables before launching an agent:
1.  **System Environment**: The environment of the user running the CloudCode process.
2.  **.env File**: Any variables defined in your `.env` file (e.g., `ANTHROPIC_API_KEY`).
3.  **Profile Environment**: Variables defined specifically for that agent profile in the UI.

---

## 4. Contributing Back

If you've created a profile for a popular coding agent that isn't included by default, we'd love to have it!

1.  **Locate** the `backend/src/db/migrations.ts` file.
2.  **Add** your profile to the `defaultProfiles` array.
3.  **Submit a Pull Request**.

By contributing, you help make CloudCode the universal interface for all coding agents.
