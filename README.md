# Agent Fleet for Obsidian

**AI agents, task scheduling, and interactive chat — all inside Obsidian.**

## Install via npm (recommended)

```bash
npm install -g agent-fleet
```

The installer automatically finds your Obsidian vault and installs the plugin.

### Update

```bash
npm update -g agent-fleet
```

## Install via BRAT

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. Open BRAT settings → **Add Beta Plugin**
3. Paste: `denberek/agent-fleet`
4. Enable **Agent Fleet** in Settings → Community Plugins

## Requirements

- **Obsidian** 1.6.0 or later (desktop only)
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** installed and authenticated
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude  # authenticate on first run
  ```
- **Claude Max subscription** or Anthropic API key

## Features

- **Agent System** — create AI agents as markdown files with system prompts, skills, and memory
- **Interactive Chat** — dock anywhere in Obsidian, switch agents, attach documents and images
- **Task Board** — kanban view with scheduling, priority, progress tracking, and abort
- **MCP Integration** — discover and authenticate MCP servers with OAuth 2.1
- **18 Built-in Skills** — PDF, DOCX, PPTX, Claude API, MCP Builder, Frontend Design, and more
- **Bidirectional Streaming** — steer agents while they work, send follow-up messages mid-task

## Documentation

See [Releases](https://github.com/denberek/agent-fleet/releases) for changelog.
