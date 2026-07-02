export interface DefaultFile {
  path: string;
  content: string;
}

export const DEFAULT_FILES: DefaultFile[] = [
  {
    path: "agents/fleet-orchestrator/CONTEXT.md",
    content: `---
{}
---

# Context

You operate inside an Obsidian vault with the Agent Fleet plugin installed.
The fleet data lives in the \`_fleet/\` folder at the vault root.
You can read and write files in this folder to manage the fleet.

The plugin runs on macOS, Windows, and Linux. Agent processes are spawned
via the Claude Code CLI, which must be installed separately. Credentials
for channels and MCP servers are stored securely in the OS keychain
(macOS Keychain, Windows Credential Manager, Linux Secret Service).

Wiki Keepers are a first-class feature: a scoped agent template that turns
any folder of the vault into a self-maintaining interlinked wiki (see
\`WIKI_KEEPER_GUIDE.md\`). Wiki Keepers are created through the Settings UI,
not by hand-editing files. Any other agent can read + contribute to a wiki
via the \`wiki_references:\` config block and the \`wiki-query\` skill.

Chat conversations support inline **threads** under any assistant reply,
each with its own Claude session and stats, stored under
\`_fleet/agents/<agent>/chat.threads/\`. Long chats auto-compact at the
\`auto_compact_threshold\` (default 85% of context window).

When the user asks for something, prefer modifying \`_fleet/\` files for
agent/task/skill/channel configuration, but direct them to the Settings UI
for Wiki Keeper creation/editing (it creates sibling lint tasks and seeds
scope folders atomically).
`,
  },
  {
    path: "agents/fleet-orchestrator/SKILLS.md",
    content: `---
{}
---

# Agent-Specific Skills

No additional agent-specific skills. This agent relies on the shared \`agent-fleet-system\` skill.
`,
  },
  {
    path: "agents/fleet-orchestrator/agent.md",
    content: `---
name: fleet-orchestrator
description: Expert on the Agent Fleet plugin — creates agents, tasks, skills, channels, and manages the fleet
avatar: lucide-panel-top-bottom-dashed
enabled: true
tags:
  - system
  - orchestration
skills:
  - agent-fleet-system
---

You are the Agent Fleet Orchestrator — the system administrator for this Obsidian Agent Fleet installation.

You have deep knowledge of (delegated to the \`agent-fleet-system\` skill):
- How agents, tasks, skills, and channels are structured as files
- Every frontmatter field and its purpose
- How to create, modify, and configure agents, tasks, skills, and channels
- The scheduling system (cron expressions, task types, heartbeat schedules)
- Heartbeat configuration — autonomous periodic agent runs via HEARTBEAT.md
- Channels — connecting agents to external chat platforms (Slack, Telegram, Discord)
- Multi-agent routing via @agent-name prefix, /agents command, and inline keyboard / button pickers
- MCP server management — a fleet-owned registry (\`_fleet/mcp/<name>.md\`); register once and grant per agent via the mcp_servers field; works on both Claude Code and Codex backends
- Permission modes and security rules
- **Wiki Keeper** — scoped self-maintaining wikis with inbox + watched ingestion modes, the three bundled skills (wiki-ingest / wiki-query / wiki-lint), and per-scope instances
- **Consumer agents** — the \`wiki_references\` config block lets any agent read + contribute to wikis it doesn't own
- **Chat threading** — inline threads under any assistant message with their own Claude session
- **Model selection** — aliases (opus / sonnet / haiku / opusplan), custom pinned IDs, per-task override, resolution order task → agent → settings
- **Auto-compact** — \`auto_compact_threshold\` (default 85%) triggers \`/compact\` before next message; users can also type \`/compact\` directly
- The folder structure, file formats, and cross-platform support (macOS, Windows, Linux)

When asked to create a new agent, task, skill, or channel:
1. Create the proper folder structure and files
2. Use correct frontmatter schemas (including \`auto_compact_threshold\`, \`wiki_references\` when relevant)
3. Set sensible defaults (auto-compact at 85%, \`opus\` alias for model, etc.)
4. Explain what you created and how to customize it

When asked to set up a heartbeat:
1. Create HEARTBEAT.md in the agent's folder
2. Set the schedule, instruction, and optionally a delivery channel
3. Explain that "Run Now" will use the heartbeat instruction

When asked to set up a channel:
1. Create a channel file in _fleet/channels/
2. Explain required external setup (Slack app with Socket Mode, Telegram bot via BotFather, or Discord bot via the Developer Portal with the Message Content intent)
3. Set up the allowed agents for multi-agent routing if needed

When asked about MCP servers:
1. Explain that MCP servers are managed from the dashboard (add/remove/authenticate) and live in a fleet-owned registry at \`_fleet/mcp/<name>.md\` — register once, available to any agent on either adapter
2. Show how to assign servers to agents via the mcp_servers field in agent.md (empty list = all enabled servers)
3. Explain authentication for HTTP/SSE servers (OAuth 2.1 PKCE or static bearer token, stored in the OS keychain and projected per run)

When asked to set up a **Wiki Keeper**:
1. Explain that Wiki Keepers are created through Settings → Agent Fleet → Wiki Keepers → + Add (NOT by hand-editing files) because the UI creates the agent folder, the sibling lint task, and seeds the scope's inbox/topics/index/log together.
2. Walk them through picking a scope folder (or whole vault), watched folders (optional), ingest + lint schedules (defaults: 3 AM nightly, Sunday 9 AM weekly), and heartbeat channel if they want Slack digests.
3. Recommend the **Obsidian Web Clipper** browser extension as the primary way to feed the inbox from web pages, Confluence, Notion, etc. See \`WIKI_KEEPER_GUIDE.md\` for the full clipper template.

When asked to give an agent **wiki access** (consumer mode):
1. Attach the \`wiki-query\` skill to the agent's \`agent.md\` skills list.
2. Add a \`wiki_references:\` block to the agent's \`config.md\` listing the keeper(s) it should read.
3. Explain the three rules it auto-inherits: cite every claim, drop durable claims to the keeper's inbox, never write to \`_topics/\` directly.

When asked to **route simple tasks to a cheaper model**:
1. Add \`model: haiku\` (or another alias) to the task's frontmatter.
2. Explain the resolution order — this task overrides the agent's model only for this task.

When asked about **auto-compact** or **long chat sessions**:
1. Explain the default 85% threshold and how to tune via \`auto_compact_threshold\` in \`config.md\` (0 disables).
2. Note that users can type \`/compact\` directly in chat to trigger on-demand compaction.
3. The compact event shows up as a "Conversation compacted (N → M tokens)" bubble in the chat.

When asked to troubleshoot:
1. Check the relevant files in _fleet/
2. Validate frontmatter and configuration
3. Suggest fixes with specific file changes
4. For stuck chats: confirm the stop button is available; if it persists after the agent finishes, report the repro so we can debug — the session's state-driven indicators should always reflect reality.

Always explain what you're doing and why. You are the expert — help users get the most out of their agent fleet.
`,
  },
  {
    path: "agents/fleet-orchestrator/config.md",
    content: `---
model: opus
adapter: claude-code
timeout: 300
max_retries: 1
cwd: ""
permission_mode: bypassPermissions
approval_required: []
allowed_tools: []
blocked_tools: []
memory: true
memory_max_entries: 100
auto_compact_threshold: 85
---


`,
  },
  {
    path: "agents/fleet-orchestrator/permissions.json",
    content: `{
  "allow": [],
  "deny": [
    "Bash(git push *)",
    "Bash(rm -rf *)",
    "Bash(sudo *)",
    "Bash(chmod *)"
  ]
}
`,
  },
  {
    path: "skills/agent-fleet-system/examples.md",
    content: `# Examples

## Example 1: Create a new monitoring agent with heartbeat

**User:** Create an agent that checks my website every hour and reports if it's down.

**Agent:**
\`\`\`bash
mkdir -p _fleet/agents/site-monitor
\`\`\`

Creates these files:

**_fleet/agents/site-monitor/agent.md:**
\`\`\`yaml
---
name: site-monitor
description: Checks website uptime and alerts on failures
avatar: "🌐"
enabled: true
tags: [monitoring]
skills: []
---

You are a website monitoring agent. Check the specified URL,
report its HTTP status code, response time, and any errors.
If the site is down (non-2xx status), clearly flag it as DOWN.
\`\`\`

**_fleet/agents/site-monitor/config.md:**
\`\`\`yaml
---
model: default
adapter: claude-code
timeout: 60
permission_mode: bypassPermissions
memory: true
---
\`\`\`

**_fleet/agents/site-monitor/HEARTBEAT.md:**
\`\`\`yaml
---
enabled: true
schedule: "0 * * * *"
notify: true
---

Check https://example.com — report status code and response time.
If the site is down, clearly flag it. Use [REMEMBER] to track
response time trends and compare with previous checks.
\`\`\`

Note: Using HEARTBEAT.md instead of a separate task file. The heartbeat runs automatically on schedule and the "Run Now" button on the agent uses this instruction. A separate task is only needed if you want a different prompt than the heartbeat.

---

## Example 2: Create a skill for an existing agent

**User:** Add a git skill to my code-reviewer agent.

**Agent:**
\`\`\`bash
mkdir -p _fleet/skills/git-operations
\`\`\`

Creates skill files, then updates the agent's \`agent.md\` to include it:
\`\`\`yaml
skills:
  - git-operations
\`\`\`

---

## Example 3: Set up a Slack channel

**User:** I want to chat with my agents from Slack.

**Agent:** Creates a channel binding file:

**_fleet/channels/my-slack.md:**
\`\`\`yaml
---
name: my-slack
type: slack
default_agent: fleet-orchestrator
allowed_agents:
  - fleet-orchestrator
  - site-monitor
enabled: true
credential_ref: slack-creds
allowed_users:
  - U0AQW6P37N1
per_user_sessions: true
channel_context: |
  You are being contacted via Slack. Keep replies concise.
---
\`\`\`

Then explains: "You need to set up a Slack app at api.slack.com with Socket Mode enabled, and add the bot token + app token as a credential named \`slack-creds\` in Settings → Agent Fleet → Channel Credentials. Credentials are stored securely in your OS keychain. Once configured, send a DM to the bot from Slack — use \`@agent-name: message\` to switch between agents, or type \`/agents\` to see available agents."

---

## Example 3b: Set up a Telegram channel

**User:** I want to chat with my agents from Telegram.

**Agent:** Creates a channel binding file:

**_fleet/channels/my-telegram.md:**
\`\`\`yaml
---
name: my-telegram
type: telegram
default_agent: fleet-orchestrator
allowed_agents:
  - fleet-orchestrator
  - site-monitor
enabled: true
credential_ref: telegram-creds
allowed_users:
  - "110810710"
per_user_sessions: true
channel_context: |
  You are being contacted via Telegram. Keep replies concise.
---
\`\`\`

Then explains: "Create a bot via @BotFather on Telegram — use \`/newbot\`, pick a name and username, and copy the token. Add the token as a credential named \`telegram-creds\` in Settings → Agent Fleet → Channel Credentials (type: Telegram). Then message the bot in Telegram. Use \`/agents\` to get interactive buttons for switching agents."

---

## Example 4: Add heartbeat with Slack delivery to an existing agent

**User:** Make my site-monitor agent report to Slack every 6 hours.

**Agent:** Creates (or updates) the heartbeat file:

**_fleet/agents/site-monitor/HEARTBEAT.md:**
\`\`\`yaml
---
enabled: true
schedule: "0 */6 * * *"
notify: true
channel: my-slack
---

Check all monitored endpoints for availability and response time.
Compare with previous checks using your memory. Report any
degradation trends or anomalies. If everything is healthy,
respond with a one-line "all clear" summary.
\`\`\`

Explains: "The heartbeat will run every 6 hours. Results are posted to the \`my-slack\` channel as a DM. Make sure the channel is configured and connected."

---

## Example 5: Modify a task schedule

**User:** Change the check-status task to run every 5 minutes instead of hourly.

**Agent:** Reads \`_fleet/tasks/check-status.md\`, updates the frontmatter:
\`\`\`yaml
schedule: "*/5 * * * *"
\`\`\`
Writes the file back. The plugin picks up the change automatically.

---

## Example 6: Troubleshoot a failing agent

**User:** My deploy-watcher agent keeps timing out.

**Agent:**
1. Reads \`_fleet/agents/deploy-watcher/config.md\` — checks timeout value
2. Reads recent runs in \`_fleet/runs/\` — looks at error outputs
3. Suggests increasing timeout or simplifying the task prompt
4. Makes the change if approved

---

## Example 7: Set up multi-agent routing in Slack

**User:** I want different agents available in my Slack channel.

**Agent:** Updates the channel file's \`allowed_agents\` list:

\`\`\`yaml
allowed_agents:
  - fleet-orchestrator
  - site-monitor
  - code-reviewer
  - daily-briefing
\`\`\`

Explains: "Users can now type \`@code-reviewer: review this\` to switch agents mid-conversation. Each agent gets its own isolated session. Type \`/agents\` in Slack to see the full list."

---

## Example 8: Assign MCP servers to an agent

**User:** I want my assistant agent to use the Todoist and Linear MCP servers.

**Agent:** Updates \`_fleet/agents/assistant/agent.md\` frontmatter to include \`mcp_servers\`:

\`\`\`yaml
---
name: assistant
description: Personal assistant with task and project management
mcp_servers:
  - todoist
  - linear
skills:
  - agent-fleet-system
---
\`\`\`

Explains: "The agent will now have access to Todoist and Linear tools during its runs. Make sure these MCP servers are added and authenticated in the dashboard (MCP Servers page). For HTTP/SSE servers that need OAuth, click 'Authenticate' on the server card — the plugin handles the browser-based auth flow and injects tokens into the CLI automatically."

---

## Example 9: Give an agent read-access to a project wiki

**User:** I have a Wiki Keeper scoped to \`projects/acme\`. My PM agent should be able to read it and cite from it.

**Agent:** Updates the PM agent's \`agent.md\` to attach the \`wiki-query\` skill:

\`\`\`yaml
skills:
  - wiki-query
  # plus the agent's existing skills
\`\`\`

And updates the PM agent's \`config.md\` with the reference:

\`\`\`yaml
wiki_references:
  - agent: wiki-keeper-acme
\`\`\`

Explains: "At prompt-build time, I'll get a Wiki Access section telling me where \`projects/acme/_topics/\` lives and how to cite from it. When the user shares durable claims (decisions, new entities, competitor updates), I'll drop them as markdown files into \`projects/acme/_sources/inbox/YYYY-MM-DD-<slug>.md\` — wiki-keeper-acme files them canonically on its next ingest. I won't write to \`_topics/\` directly; that's the keeper's job."

Note: this is a consumer-only relationship. The PM agent's responses are wiki-grounded (cites pages) but don't touch the topic tree directly.

---

## Example 10: Route a simple nightly task to Haiku while keeping the agent on Opus

**User:** My reporting agent is on Opus which is expensive. The nightly summary task is simple enough for Haiku. Can I use a cheaper model just for that task?

**Agent:** Edits the task file's frontmatter to include a \`model\` override:

\`\`\`yaml
---
task_id: nightly-summary
agent: reporting-agent
type: recurring
schedule: "0 2 * * *"
model: haiku                 # Override: use haiku just for this task
---

Summarize today's activity in 3 bullet points.
\`\`\`

Explains: "I'll keep the agent configured with Opus for its interactive work, but this task now resolves to Haiku via the resolution order: task.model → agent.model → settings default. The run log will show 'haiku' requested and the concrete model Claude Code routed to."

---

## Example 11: Create a new Wiki Keeper

**User:** Set up a wiki keeper for my acme project. The project folder is \`projects/acme/\` and I want it to also watch \`daily-notes/\` for any acme-related notes I write.

**Agent:** Explains that Wiki Keepers are created via Settings → Agent Fleet → Wiki Keepers → + Add, not by editing files directly. Walks the user through:

1. Open Settings → Agent Fleet.
2. Scroll to the **Wiki Keepers** section. Click **+ Add**.
3. Fill in:
   - **Scope folder:** \`projects/acme\`
   - **Watched folders:** \`daily-notes/, projects/acme/meetings/\`
   - **Exclude patterns:** \`meetings/drafts/**\`
   - Leave other fields at defaults (nightly ingest at 3 AM, weekly lint Sundays at 9 AM).
4. Click **Create**.

Result: a new \`_fleet/agents/wiki-keeper-acme/\` folder with five files; \`projects/acme/_sources/inbox/\`, \`projects/acme/_topics/\`, \`projects/acme/index.md\`, and \`projects/acme/log.md\` are seeded; a sibling lint task is created at \`_fleet/tasks/wiki-keeper-acme-lint.md\`.

To query: \`@wiki-keeper-acme: what do we know about competitor X?\` in any chat surface.

---

## Example 12: Tune auto-compact threshold for a long-context agent

**User:** My researcher agent often hits context limits. Can I make it auto-compact earlier?

**Agent:** Edits \`_fleet/agents/researcher/config.md\` to lower the threshold:

\`\`\`yaml
auto_compact_threshold: 70     # was 85 by default
\`\`\`

Explains: "Auto-compact now kicks in at 70% context instead of 85%. Next time the agent's chat reaches that threshold, the session will automatically send \`/compact\` before the next user message, and the user will see a 'Conversation compacted (N → M tokens)' notification bubble in the chat. Set to 0 to disable the auto-trigger; users can still type \`/compact\` manually at any time."
`,
  },
  {
    path: "skills/agent-fleet-system/references.md",
    content: `# References

## Permission Modes

| Mode | Unblocked commands | Blocked (deny list) | Best for |
|---|---|---|---|
| bypassPermissions | Auto-runs everything | Hard-blocked | Trusted agents with a blacklist |
| dontAsk | Only allow-listed | Hard-blocked | Locked-down agents with a whitelist |
| acceptEdits | File edits auto-approved | Hard-blocked | Agents editing files only |
| plan | Read-only | Hard-blocked | Research/analysis |
| default | Prompts for permission | Hard-blocked | Not useful for headless |

These are the Claude Code permission modes. **Codex agents** use sandbox levels instead — \`workspace-write\` / \`read-only\` (and \`bypassPermissions\` maps to full access); the modes above are mapped to the nearest Codex equivalent. \`Bash(...)\` allow/deny rules are translated to Codex execpolicy where possible (command-prefix patterns only). See the "Agent Configuration" permissions notes in \`tools.md\` for the full Codex behavior. The "Claude Code CLI Flags" section below applies to \`claude-code\` agents only.

## Cron Expression Format

Five fields: \`minute hour day-of-month month day-of-week\`

| Field | Values | Special |
|---|---|---|
| Minute | 0-59 | \`*/N\` = every N minutes |
| Hour | 0-23 | \`*/N\` = every N hours |
| Day of month | 1-31 | \`*\` = every day |
| Month | 1-12 | \`*\` = every month |
| Day of week | 0-7 (0,7=Sun) | \`1-5\` = weekdays |

Examples:
- \`*/15 * * * *\` — every 15 minutes
- \`0 9 * * *\` — daily at 9 AM
- \`0 9 * * 1-5\` — weekdays at 9 AM
- \`30 18 * * 5\` — Fridays at 6:30 PM
- \`0 0 1 * *\` — first of every month at midnight

## Claude Code CLI Flags

The plugin spawns Claude Code with:
\`\`\`
claude -p "<prompt>" --output-format stream-json --verbose [--model <model>]
\`\`\`

On macOS/Linux, commands run through a login shell (\`/bin/zsh -l -c\` or \`/bin/bash -l -c\`) so shell profile environment variables are available. On Windows, commands spawn directly — Windows inherits environment variables from the system without a shell wrapper.

## Environment Variables

API tokens and secrets should be set in your shell profile:
- **macOS:** \`~/.zshenv\` or \`~/.zprofile\`
- **Linux:** \`~/.bashrc\` or \`~/.profile\`
- **Windows:** System Environment Variables (Settings → System → Advanced → Environment Variables)

These are inherited by all agent processes. Never store tokens in vault files.

## Channel Types

| Type | Transport | Status |
|---|---|---|
| slack | Socket Mode WebSocket + Assistants API | Supported |
| telegram | Long-poll via HTTPS (getUpdates) | Supported |
| discord | Gateway WebSocket + REST | Supported (since 0.14.0) |

**Slack requirements:** Slack app with Socket Mode enabled, bot token (xoxb-) + app-level token (xapp-), scopes: chat:write, im:history, im:read, im:write, app_mentions:read, assistant:write, commands.

**Telegram requirements:** Bot created via @BotFather, bot token. Optional: disable privacy mode for group access, enable threaded mode for forum topics.

**Discord requirements:** Bot created at the Discord Developer Portal with the **Message Content** privileged intent enabled (without it the bot receives empty message text), bot token. Invite with scopes \`bot\` + \`applications.commands\` and permissions Send Messages + Read Message History — or just DM the bot. Supports \`@agent-name\` routing, the \`/agents\` slash picker, and image attachments; the allowlist is enforced on the authenticated sender's numeric Discord user id.

**Channel constraints:**
- Agents with \`approval_required\` cannot be bound to channels (would deadlock)
- Credentials are stored in the OS keychain via Obsidian's SecretStorage API (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- \`allowed_users\` is checked against the platform's verified sender field

## Heartbeat vs Tasks

| | Heartbeat | Task |
|---|---|---|
| Defined in | HEARTBEAT.md in agent folder | _fleet/tasks/<name>.md |
| Prompt source | Heartbeat body | Task body |
| "Run Now" button | Uses heartbeat instruction | Uses task prompt |
| Delivery | Run log + optional channel post (\`channel\` in HEARTBEAT.md) | Run log + optional channel post (\`channel\` in task frontmatter) |
| Scope | One per agent | Many per agent |
| Best for | Autonomous periodic monitoring | Specific scheduled work items |

## File Naming Conventions

- Agent folders: lowercase, kebab-case (\`my-agent\`)
- Skill folders: lowercase, kebab-case (\`git-operations\`)
- Task files: lowercase, kebab-case (\`check-deploy.md\`)
- Channel files: lowercase, kebab-case (\`my-slack.md\`)
- Run logs: auto-generated (\`HHMMSS-agent-task.md\`)

## Model Resolution

When a run happens, the model passed to \`claude --model\` is resolved in this order:

1. **\`task.model\`** — per-task override (if set and non-empty)
2. **\`agent.model\`** — per-agent setting (canonical home: \`config.md\` for folder agents)
3. **\`settings.defaultModel\`** — plugin-wide default
4. If all three are empty or one of the sentinels (\`""\`, \`"default"\`, \`"subscription"\`), \`--model\` is omitted → CLI picks its subscription default.

Use **aliases** (\`opus\`, \`sonnet\`, \`haiku\`, \`opusplan\`) for backend-agnostic, future-proof selection. They're resolved inside Claude Code itself and work identically on direct API, Bedrock, Vertex, Foundry, and Mantle. Use **Custom** (free text) for pinned concrete IDs when reproducibility matters.

Run log frontmatter records both what was requested (\`model: opus\`) and what the CLI concretely resolved to (\`resolved_concrete_model: claude-opus-4-7\`) for audit traceability.

## Shared Subscription Rate Limits

All agents authenticate through the same Claude Pro/Max subscription. The rate-limit window (typically 5-hour rolling) is **shared across every agent**. A single context-full agent burning quota on retries will cause other agents to fail requests until the window resets.

Mitigations:
- Set \`auto_compact_threshold\` on chat-heavy agents so long sessions auto-summarize before they exhaust capacity.
- Use per-task \`model: haiku\` overrides for cheap/routine work to reduce quota pressure.
- The chat stats strip shows the current quota window type and reset time — hover the \`CONTEXT\` pill for details.

## Error Handling in Chat

When the CLI returns an error result (context overflow, rate limit, auth issue), the session:
- Emits an \`error\` stream event with a human-readable reason drawn from \`api_error_status\` / \`subtype\` / \`result\`
- Renders a red error bubble in the chat: \`Error: <reason>\`
- Flips \`isStreaming\` back to false so the stop button clears and the user can send another message

A configurable watchdog (default 10 minutes; tunable via plugin Settings → "Chat watchdog timeout") additionally protects against CLI subprocess hangs: if no stream events arrive while streaming, the turn is auto-rejected, the process is killed, and a timeout error is surfaced in the chat. This guarantees the chat never gets permanently stuck.
`,
  },
  {
    path: "skills/agent-fleet-system/skill.md",
    content: `---
name: agent-fleet-system
description: Complete knowledge of the Agent Fleet plugin — file structures, schemas, configuration, and management operations
tags:
  - system
  - agent-fleet
  - orchestration
---

You are an expert on the Obsidian Agent Fleet plugin. This skill gives you complete knowledge of how the system works — every file format, schema, and operation.

## System Overview

Agent Fleet manages AI agents through markdown files in a \`_fleet/\` folder inside an Obsidian vault. Everything is files — agents, skills, tasks, run logs, and memory. Agents execute via a headless CLI backend, selectable per agent: **Claude Code** (default) or **OpenAI Codex**.

## Core Principle

**Files over databases.** Every piece of state is a markdown file with YAML frontmatter. If the plugin disappears, the knowledge stays. All files are searchable, version-controllable, and fully owned by the user.
`,
  },
  {
    path: "skills/agent-fleet-system/tools.md",
    content: `# Agent Fleet Operations

All operations are performed by reading and writing files in the \`_fleet/\` directory.

## Folder Structure

\`\`\`
_fleet/
├── agents/           Agent definitions (folder-based or single-file)
│   └── <name>/       Folder-based agent
│       ├── agent.md          Identity + system prompt
│       ├── config.md         Runtime configuration
│       ├── permissions.json  Claude Code allow/deny rules
│       ├── SKILLS.md         Agent-specific skills
│       ├── CONTEXT.md        Project context
│       └── HEARTBEAT.md      Autonomous periodic run instruction (optional)
├── skills/           Reusable skill definitions
│   └── <name>/       Folder-based skill
│       ├── skill.md          Identity + core instructions
│       ├── tools.md          CLI/API tool documentation
│       ├── references.md     Background docs and conventions
│       └── examples.md       Few-shot examples
├── tasks/            Task definitions (single files)
│   └── <name>.md     Task with schedule and prompt
├── channels/         External chat channel bindings
│   └── <name>.md     Channel config (Slack, Telegram, Discord)
├── mcp/              MCP server registry (one file per server, since 0.13.0)
│   └── <name>.md     Server definition (frontmatter; secrets in keychain)
├── runs/             Execution logs (auto-generated)
│   └── YYYY-MM-DD/   Daily folders
│       └── HHMMSS-<agent>-<task>.md
└── memory/           Agent memory (two-tier store, since 0.12.0)
    └── <agent-name>/ working.md + raw/<date>.md + candidates.json + pending/
\`\`\`

## Creating an Agent

Create a folder in \`_fleet/agents/<name>/\` with these files:

### agent.md — Identity and System Prompt
\`\`\`yaml
---
name: my-agent              # Required, unique identifier
description: What this agent does
avatar: "🤖"                # Emoji or Lucide icon name
enabled: true               # Whether agent accepts tasks
tags:
  - category
skills:                     # Shared skills to include
  - skill-name-1
  - skill-name-2
mcp_servers:                # MCP servers the agent can access (optional)
  - server-name
---

System prompt goes here. This is the agent's core instructions —
who it is, how it behaves, what it does.
\`\`\`

### config.md — Runtime Configuration
\`\`\`yaml
---
model: opus                       # Claude aliases work everywhere: opus / sonnet / haiku / opusplan.
                                  # Or "default" (let CLI pick), or a pinned ID like
                                  # "claude-opus-4-7" (direct), "us.anthropic.claude-opus-4-7" (Bedrock),
                                  # "claude-opus-4-7@20251101" (Vertex). For Codex agents use slugs
                                  # like "gpt-5.5". Backend-agnostic aliases are preferred.
adapter: claude-code              # "claude-code" (default) or "codex" (OpenAI Codex CLI)
timeout: 300                      # Seconds before kill
max_retries: 1
cwd: ""                           # Working directory (empty = vault root)
permission_mode: bypassPermissions # Claude: "bypassPermissions", "dontAsk", "acceptEdits", "plan".
                                  # Codex: "bypassPermissions" (no sandbox), "workspace-write", "read-only".
                                  # Claude-style values map to the nearest Codex sandbox automatically.
effort: ""                        # Reasoning effort: "low", "medium", "high", "max", or "" for default
                                  # (Codex maps "max" to its "xhigh" level)
approval_required: []
allowed_tools: []
blocked_tools: []
memory: true                      # Persist context across runs (two-tier store)
memory_token_budget: 1500         # Working-memory size cap (replaces memory_max_entries)
reflection_enabled: false         # Nightly consolidation ("dreaming")
reflection_schedule: "0 3 * * *"  # When reflection runs (cron)
reflection_recurrence_threshold: 3  # Times a pattern must recur before a skill proposal
reflection_propose_skills: false  # Promote recurring patterns to skill proposals
auto_compact_threshold: 85        # Auto-invoke /compact when context reaches N% of window.
                                  # 0 disables. Default 85. Applies to chat sessions.
wiki_references:                  # Optional — read-access to Wiki Keeper scopes.
  - agent: wiki-keeper-acme       # See the "Wiki Keeper" section below.
---
\`\`\`

### permissions.json — Claude Code Permission Rules
\`\`\`json
{
  "allow": [
    "Bash(curl *)",
    "Read",
    "Write",
    "Edit"
  ],
  "deny": [
    "Bash(git push *)",
    "Bash(rm -rf *)",
    "Bash(sudo *)"
  ]
}
\`\`\`

Rules use Claude Code's native format:
- \`deny\` rules always take precedence
- \`Bash(pattern *)\` matches commands with wildcards
- \`Read\`, \`Write\`, \`Edit\`, \`WebFetch\`, \`WebSearch\` are tool names
- With \`bypassPermissions\` mode: everything runs EXCEPT deny list
- With \`dontAsk\` mode: only allow list runs, everything else blocked

Both adapters enforce these rules. \`claude-code\` applies them directly. \`codex\`
translates \`Bash(cmd args *)\` command patterns into execpolicy rules (deny →
forbidden, allow → allow) injected via a per-agent \`CODEX_HOME\` overlay. Codex
limitations: only command-prefix \`Bash(...)\` patterns translate — tool-name
rules (\`Read\`/\`Write\`/\`Edit\`) and mid-pattern wildcards are ignored, and file/
network access is governed by the sandbox level (\`permission_mode\`:
bypassPermissions / workspace-write / read-only) instead. Requires a Codex build
with execpolicy support; otherwise the agent falls back to sandbox-only.

### SKILLS.md — Agent-Specific Skills (optional)
\`\`\`markdown
Additional instructions specific to this agent that aren't reusable as shared skills.
\`\`\`

### CONTEXT.md — Project Context (optional)
\`\`\`markdown
Background information, project conventions, repo structure docs.
\`\`\`

### HEARTBEAT.md — Autonomous Periodic Run (optional)

A heartbeat gives the agent autonomous behavior — what it does when no one is asking. The heartbeat instruction is also used by the "Run Now" button.

\`\`\`yaml
---
enabled: true
schedule: "0 */6 * * *"      # Cron expression — every 6 hours
notify: true                  # Show Obsidian notice on completion
channel: my-slack             # Post results to this channel (optional)
channel_target: ""            # Specific channel/conversation id within \`channel\` to post to
                              # (e.g. a Discord channel id). Empty = broadcast as a DM to the
                              # channel's first allowed user. Quote numeric ids to preserve precision.
---

Check the following endpoints for availability and response time:
- https://example.com (expect < 500ms)
- https://api.example.com/health (expect 200 OK)

Report status of each endpoint. If everything is healthy, respond with
a one-line "all clear". Use [REMEMBER] to track trends across heartbeats.
\`\`\`

**Heartbeat fields:**
- \`enabled\` — whether the heartbeat is active
- \`schedule\` — cron expression (same format as tasks)
- \`notify\` — show Obsidian notice when heartbeat completes (default true)
- \`channel\` — name of a configured channel to post results to (optional)
- \`channel_target\` — specific channel/conversation id within \`channel\` to post to (optional;
  empty broadcasts a DM to the channel's first allowed user). Mirrors a task's \`channel_target\`.

## Creating a Channel

Channels connect agents to external chat platforms. Create a markdown file in \`_fleet/channels/<name>.md\`.

### Slack Channel
\`\`\`yaml
---
name: my-slack
type: slack
default_agent: fleet-orchestrator
allowed_agents:
  - fleet-orchestrator
  - site-monitor
enabled: true
credential_ref: my-slack-creds
allowed_users:
  - U0AQW6P37N1
per_user_sessions: true
channel_context: |
  You are being contacted via Slack. Keep replies concise.
---
\`\`\`

Slack uses Socket Mode (outbound WebSocket) with the Assistants API for native "is thinking..." indicators and thread titles.

### Telegram Channel
\`\`\`yaml
---
name: my-telegram
type: telegram
default_agent: fleet-orchestrator
allowed_agents:
  - fleet-orchestrator
  - site-monitor
enabled: true
credential_ref: my-telegram-creds
allowed_users:
  - "110810710"
per_user_sessions: true
channel_context: |
  You are being contacted via Telegram. Keep replies concise.
---
\`\`\`

Telegram uses long-poll HTTPS (no WebSocket, no SDK). Features: typing indicators, inline keyboard agent picker via \`/agents\`, slash command autocomplete, group chat and forum topic support.

### Discord Channel
\`\`\`yaml
---
name: my-discord
type: discord
default_agent: fleet-orchestrator
allowed_agents:
  - fleet-orchestrator
  - site-monitor
enabled: true
credential_ref: my-discord-creds
allowed_users:
  - "496534272610664448"
per_user_sessions: true
channel_context: |
  You are being contacted via Discord. Keep replies concise. Discord uses
  standard Markdown (NOT Slack mrkdwn): **bold**, *italic*, \`code\`, fenced
  blocks with a language tag. Discord does NOT render Markdown tables.
---
\`\`\`

Discord uses the Gateway (outbound WebSocket) + REST. Features: \`@agent-name\` routing, the \`/agents\` slash picker, image attachments, allowlist on the authenticated sender, and reconnect/resume. Requires the **Message Content** privileged intent on the bot. See \`DISCORD_SETUP.md\`.

**Important notes:**
- \`credential_ref\` must match a credential name in Settings → Agent Fleet → Channel Credentials
- Credentials are stored securely in the OS keychain via Obsidian's SecretStorage API
- \`allowed_users\`: Slack user IDs (start with U), Telegram user IDs (numeric), or Discord user IDs (numeric)
- Agents with \`approval_required\` set cannot be bound to a channel
- Multi-agent routing: type \`@agent-name: message\` to switch agents, or use \`/agents\` for interactive picker
- Obsidian must be running for channels to work — when closed, bots go offline
- Live follow-ups (since 0.15.0): a message sent while the agent is still working is folded into the running turn (Claude: live stdin; Codex: queued follow-up turn) instead of waiting for a fresh turn — matching the in-app chat. Each injected follow-up gets its own reply; \`[REMEMBER]\` blocks are stripped from channel replies.

## Creating a Task

Create a markdown file in \`_fleet/tasks/<name>.md\`:

\`\`\`yaml
---
task_id: check-status         # Required, unique
agent: my-agent               # Required, must match an agent name
schedule: "*/15 * * * *"      # Cron expression for recurring tasks
type: recurring               # "recurring", "once", or "immediate"
enabled: true
created: 2026-03-29T10:00:00
run_count: 0
catch_up: false               # Run missed executions on startup
effort: ""                    # Override agent effort: "low", "medium", "high", "max", or "" for agent default
model: ""                     # Override agent model for this task only.
                              # Use aliases like "haiku" for cheap/simple tasks,
                              # or leave empty to inherit agent's model.
                              # Resolution order: task.model → agent.model → settings.defaultModel.
channel: ""                   # Post this task's output to a channel (e.g. "my-discord").
                              # Empty = run log only. Lets scheduled tasks deliver to chat,
                              # not just the heartbeat.
channel_target: ""            # Optional destination id within \`channel\`: a Discord/Slack
                              # channel id or Telegram chat id. Set = post directly to that
                              # channel; empty = DM the channel's first allowed user.
tags:
  - monitoring
---

Task prompt goes here. This is what the agent should do each run.
Be specific and clear about expected output.
\`\`\`

**Channel delivery (\`channel\` + \`channel_target\`).** Any task can post its output to a
configured channel by setting \`channel:\` to a channel name. Previously only an agent's
heartbeat could post to a channel; now every scheduled/manual task can too. The output
is the task run's **full** output text, prefixed with \`*<agent> — <task_id>*\`.

Two delivery modes:
- **\`channel_target\` empty** → broadcast (a DM to the channel's first allowed user) —
  same path the heartbeat uses.
- **\`channel_target\` set** → post directly to that specific channel/conversation. The
  target is a transport-native id: a Discord/Slack channel id or a Telegram chat id.
  (Discord: enable Developer Mode → right-click the channel → Copy Channel ID. The bot
  must have permission to post there.)

Keep the task prompt's output concise/skimmable if it's going to chat. Heartbeats still
use \`channel\` in HEARTBEAT.md (broadcast only); tasks use \`channel\`/\`channel_target\` in
their own frontmatter.

### Task Types
- **recurring** — runs on a cron schedule. Requires \`schedule\` field.
- **once** — runs at a specific time. Requires \`run_at\` field (ISO datetime).
- **immediate** — runs once on creation, no schedule.

### Schedule Shortcuts
These human-friendly values work in the \`schedule\` field:
- \`every 5m\` → \`*/5 * * * *\`
- \`every 15m\` → \`*/15 * * * *\`
- \`every 30m\` → \`*/30 * * * *\`
- \`hourly\` → \`0 * * * *\`
- \`daily at 9am\` → \`0 9 * * *\`
- \`weekdays at 9am\` → \`0 9 * * 1-5\`
- \`weekly on monday\` → \`0 9 * * 1\`
- \`monthly on 1st\` → \`0 9 1 * *\`

## Creating a Skill

Create a folder in \`_fleet/skills/<name>/\` with these files:

### skill.md — Identity and Core Instructions
\`\`\`yaml
---
name: my-skill                # Required, unique
description: What this skill provides
tags:
  - category
---

Core skill instructions go here.
\`\`\`

### tools.md — Tool Documentation (optional)
### references.md — Background Docs (optional)
### examples.md — Few-Shot Examples (optional)

## MCP Servers

MCP (Model Context Protocol) servers give agents access to external tools and services. Servers are managed from the dashboard — add, remove, authenticate, and inspect servers without touching the terminal.

### Assigning MCP Servers to Agents

Add the \`mcp_servers\` field to the agent's \`agent.md\` frontmatter:

\`\`\`yaml
---
name: my-agent
description: Agent with MCP access
mcp_servers:
  - todoist
  - linear
  - github
---
\`\`\`

**MCP v2 — one registry, projected per run (since 0.13.0).** MCP servers live in a fleet-owned registry: one markdown file per server at \`_fleet/mcp/<name>.md\` (frontmatter; secrets never in the vault). Register a server **once** and it's available to **any** agent on **either** adapter — Claude Code or Codex. At spawn time, only the enabled servers an agent is granted are **projected** into whichever adapter it uses: Claude Code gets a merged \`--mcp-config\`, Codex gets \`-c mcp_servers.*\` overrides. Your native \`~/.claude.json\` and \`~/.codex/config.toml\` are **read-only** — Agent Fleet never mutates them. On first load, your existing Claude and Codex servers are imported into the registry (deduplicated, marked \`imported\`), and any bearer tokens found are moved into the keychain.

Per-agent grants: leave the agent's \`mcp_servers\` list empty to grant every enabled server, or list specific ones. The selection applies identically on both adapters.

### Server Types

- **stdio** — local process spawned by the CLI (e.g., \`npx @some/mcp-server\`)
- **HTTP / SSE** — remote server accessed via URL, often with OAuth authentication

### Authentication

HTTP/SSE servers authenticate **once** and the token is stored in the OS keychain, then projected per run (to Claude as an \`Authorization\` header, to Codex via \`bearer_token_env_var\` — passed through the spawn environment, never written to argv or a config file). Two options:

- **Static bearer token** — paste it on the server card.
- **OAuth 2.1 PKCE** — from the dashboard: click "Authenticate"; the plugin discovers OAuth endpoints automatically (RFC 8414 / RFC 9728), registers via Dynamic Client Registration, opens the browser for the PKCE flow, stores tokens in the keychain, and refreshes them in the background to keep agents authenticated.

## Modifying Agents, Tasks, Skills, or Channels

To modify any entity, read the file, change the frontmatter or body, and write it back. The plugin watches the \`_fleet/\` folder and picks up changes automatically.

## Enabling/Disabling

- Agents: \`enabled\` in agent.md frontmatter
- Tasks: \`enabled\` in task frontmatter
- Channels: \`enabled\` in channel frontmatter
- Heartbeats: \`enabled\` in HEARTBEAT.md frontmatter

## Deleting

Delete (or move to trash) the agent folder, task file, skill folder, or channel file. The plugin detects deletions and removes them from the runtime.

## Run Logs

Run logs are auto-generated in \`_fleet/runs/YYYY-MM-DD/\`. Each run creates a markdown file with:
- Frontmatter: run_id, agent, task, status, timestamps, tokens_used, cost_usd, model
- Body: prompt sent, output received, tools used, stderr
- Heartbeat runs are tagged with \`heartbeat\`

Status values: \`success\`, \`failure\`, \`timeout\`, \`cancelled\`, \`pending_approval\`

## Agent Memory

When \`memory: true\`, the agent has a two-tier memory store at \`_fleet/memory/<agent-name>/\`:

- \`working.md\` — curated, token-budgeted memory that is **injected into every run** (sections: \`Preferences\` (pinned), \`Procedures\`, \`Observations\`, \`Recent\`).
- \`raw/<YYYY-MM-DD>.md\` — append-only ground-truth log of everything captured (never injected).
- \`candidates.json\` — reflection's skill-pattern ledger; \`pending/\` — the capture inbox.

(Legacy single-file \`_fleet/memory/<agent>.md\` stores are auto-migrated to this layout, seeding \`raw/\` first.)

**How an agent records a memory (two channels, same sink):**
1. **\`remember\` MCP tool (preferred)** — call \`remember(fact, pin?, section?)\`. It's auto-allowed (\`mcp__remember\`) for memory-enabled agents on **both Claude and Codex** backends. Structured and reliable.
2. **\`[REMEMBER] … [/REMEMBER]\` text tag (fallback)** — emit the tag in your output; \`[REMEMBER:pin]\` for a standing preference, \`[REMEMBER:procedure]\` for a how-to. Tags are stripped from the visible reply.

Record only **durable, reusable** facts — one concise line each (long/multi-line facts are collapsed and capped). Captures land in \`working.md\` immediately, so the next run/turn sees them. Memory is agent-scoped (shared across all conversations, including channels).

**Reflection ("dreaming").** If \`reflection_enabled: true\`, a scheduled nightly run (\`reflection_schedule\`, default \`0 3 * * *\`) consolidates \`working.md\` from the raw log: dedup, resolve contradictions, re-file \`Recent\` entries, summarize from ground truth to stay within \`memory_token_budget\` (default 1500), and keep pinned \`Preferences\`. With \`reflection_propose_skills: true\`, recurring friction (≥ \`reflection_recurrence_threshold\`, default 3) becomes an approval-gated skill proposal in the Inbox. A failed/empty reflection never wipes memory. Trigger manually with "Reflect now" on the agent.

> \`memory_max_entries\` is deprecated (no longer enforced) — size is governed by \`memory_token_budget\`.

## Prompt Assembly Order

When a task, heartbeat, or channel message runs, the prompt is assembled in this order:
1. Agent system prompt (agent.md body)
2. Shared skills (from skill.md + tools.md + references.md + examples.md)
3. Agent-specific skills (SKILLS.md body)
4. Agent context (CONTEXT.md body)
5. Agent memory (\`working.md\` + capture instruction, if enabled)
6. Channel context (if the message came from a channel)
7. **Wiki Access block** (if \`wiki_references\` is set — lists accessible wiki scopes)
8. Task prompt / heartbeat instruction / user message

## Wiki Keeper — Scoped Self-Maintaining Wikis

A **Wiki Keeper** is an agent that curates a folder of the vault as an interlinked markdown wiki. Users drop sources into an inbox or point at existing folders (daily notes, meeting transcripts) as watched sources — the keeper ingests on a schedule, extracts entities and decisions, and produces topic pages with cross-references.

Wiki Keepers are created via Settings → Agent Fleet → Wiki Keepers → + Add, NOT by hand-editing files. Each instance is an ordinary Agent Fleet agent with a \`wiki_keeper:\` block in its \`config.md\` frontmatter. Scope is fixed after creation.

**Scheduling:** on creation the keeper gets a default hourly heartbeat (for inbox + watched ingestion) and a sibling recurring task \`<agent>-lint\` (Sunday 9 AM). Cadence is managed afterwards the same way as any other agent — edit \`HEARTBEAT.md\` for ingest cadence, or the \`<agent>-lint\` task for the lint cadence. \`config.md\` carries no schedule fields.

### Wiki Keeper config shape

\`\`\`yaml
# in wiki-keeper-acme/config.md
wiki_keeper:
  scope_root: projects/acme       # empty = whole vault
  inbox_path: _sources/inbox
  archive_path: _sources/archive  # archived under YYYY/MM/ after ingest
  topics_root: _topics            # underscore-prefix keeps it near _sources & _fleet
  index_path: index.md
  log_path: log.md
  watched_folders:                # read-only; never modified or moved
    - meetings/
    - daily-notes/
  exclude_patterns:
    - meetings/drafts/**
  watched_since: "2026-04-21"     # skip files in watched folders with mtime older than this; blank = no cutoff
  file_substantive_answers: false
  obsidian_url_scheme: true
  max_tokens_per_ingest: 60000
  state_file: .wiki-keeper-state.json
\`\`\`

### Two ingestion modes

| Mode | Destructive? | Produces | For |
|---|---|---|---|
| **Inbox** | Yes — moves source to archive | Summary page per source + topic updates | One-off drops: PDFs, Web Clipper clips, forwarded emails |
| **Watched** | No — source stays in place forever | Topic page updates only (no summary page) | Daily notes, meeting transcripts, existing project artifacts |

Both modes update \`_topics/\`, \`index.md\`, \`log.md\`. Watched mode uses mtime diffing to re-process only changed files.

### Three bundled skills

- **wiki-ingest** — runs both modes in one invocation
- **wiki-query** — dual-mode: keeper-mode (queries own scope, enforces isolation) and consumer-mode (queries referenced scopes via \`wiki_references\`)
- **wiki-lint** — weekly audit: orphans, stale events, contradictions, schema violations

### Consumer agents — \`wiki_references\`

Any agent can read + contribute to a wiki it doesn't own. Add to the consumer agent's \`config.md\`:

\`\`\`yaml
wiki_references:
  - agent: wiki-keeper-acme
  # - agent: wiki-keeper-beta    # can reference multiple
\`\`\`

And attach \`wiki-query\` skill in its \`agent.md\`:

\`\`\`yaml
skills:
  - wiki-query
\`\`\`

At prompt-build time, the plugin injects a \`## Wiki Access\` section listing each referenced keeper's scope root, topics path, index, and inbox — plus three rules:
1. Cite every factual claim from a wiki.
2. Drop durable claims (new decisions, entities, etc.) to the relevant keeper's inbox as \`<inbox>/YYYY-MM-DD-<slug>.md\`.
3. Never write to \`<topics>/\` directly — that's the keeper's job.

## Chat Threading

Every assistant message in a chat shows a \`💬 Thread\` badge. Clicking it creates an inline threaded conversation with its own Claude session, its own context, and its own stats — the main chat is not polluted.

Threads are stored at \`_fleet/agents/<agent>/chat.threads/<anchor-message-id>.json\`. They use "soft fork" seeding: the parent's history up to (and including) the anchored assistant message is replayed as a system preamble, then the thread evolves independently.

Threads are view-only — there's no filesystem API to create them programmatically. Users create threads through the UI.

## Auto-compact

When a chat's context crosses \`auto_compact_threshold\` (default 85%), the session automatically sends \`/compact\` to the CLI before the user's next message. The CLI summarizes the conversation (reducing e.g. 48k tokens → 1k tokens) and then processes the user's actual message in the compacted context.

Set \`auto_compact_threshold: 0\` in \`config.md\` to disable. Users can also type \`/compact\` directly as a chat message to trigger compaction on demand.

## Run Logs — extended frontmatter

Every run log now carries these additional frontmatter fields:

- \`model_source\` — one of \`task\` / \`agent\` / \`settings\` / \`cli-default\`, shows which layer the model came from.
- \`resolved_concrete_model\` — the concrete model Claude Code routed to (e.g. we asked for \`opus\`, it resolved to \`claude-opus-4-7\`).
- \`## Result\` section — the final assistant answer, separate from the full narration in \`## Output\`. Run-detail panel leads with this and hides the full transcript behind a toggle.
`,
  },
  {
    path: "skills/algorithmic-art/references.md",
    content: `# Algorithmic Art Templates & References

## viewer.html — Required Starting Point

This is the HTML template that MUST be used as the literal starting point for all generative art artifacts. Keep the fixed sections (layout, Anthropic branding, seed controls, actions) and replace only the variable sections (algorithm, parameters, UI controls).

\`\`\`html
<!DOCTYPE html>
<!--
    THIS IS A TEMPLATE THAT SHOULD BE USED EVERY TIME AND MODIFIED.
    WHAT TO KEEP:
    ✓ Overall structure (header, sidebar, main content)
    ✓ Anthropic branding (colors, fonts, layout)
    ✓ Seed navigation section (always include this)
    ✓ Self-contained artifact (everything inline)

    WHAT TO CREATIVELY EDIT:
    ✗ The p5.js algorithm (implement YOUR vision)
    ✗ The parameters (define what YOUR art needs)
    ✗ The UI controls (match YOUR parameters)

    Let your philosophy guide the implementation.
    The world is your oyster - be creative!
-->
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generative Art Viewer</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&family=Lora:wght@400;500&display=swap" rel="stylesheet">
    <style>
        /* Anthropic Brand Colors */
        :root {
            --anthropic-dark: #141413;
            --anthropic-light: #faf9f5;
            --anthropic-mid-gray: #b0aea5;
            --anthropic-light-gray: #e8e6dc;
            --anthropic-orange: #d97757;
            --anthropic-blue: #6a9bcc;
            --anthropic-green: #788c5d;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Poppins', sans-serif;
            background: linear-gradient(135deg, var(--anthropic-light) 0%, #f5f3ee 100%);
            min-height: 100vh;
            color: var(--anthropic-dark);
        }

        .container {
            display: flex;
            min-height: 100vh;
            padding: 20px;
            gap: 20px;
        }

        /* Sidebar */
        .sidebar {
            width: 320px;
            flex-shrink: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 24px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(20, 20, 19, 0.1);
            overflow-y: auto;
            overflow-x: hidden;
        }

        .sidebar h1 {
            font-family: 'Lora', serif;
            font-size: 24px;
            font-weight: 500;
            color: var(--anthropic-dark);
            margin-bottom: 8px;
        }

        .sidebar .subtitle {
            color: var(--anthropic-mid-gray);
            font-size: 14px;
            margin-bottom: 32px;
            line-height: 1.4;
        }

        /* Control Sections */
        .control-section {
            margin-bottom: 32px;
        }

        .control-section h3 {
            font-size: 16px;
            font-weight: 600;
            color: var(--anthropic-dark);
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .control-section h3::before {
            content: '•';
            color: var(--anthropic-orange);
            font-weight: bold;
        }

        /* Seed Controls */
        .seed-input {
            width: 100%;
            background: var(--anthropic-light);
            padding: 12px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            margin-bottom: 12px;
            border: 1px solid var(--anthropic-light-gray);
            text-align: center;
        }

        .seed-input:focus {
            outline: none;
            border-color: var(--anthropic-orange);
            box-shadow: 0 0 0 2px rgba(217, 119, 87, 0.1);
            background: white;
        }

        .seed-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 8px;
        }

        .regen-button {
            margin-bottom: 0;
        }

        /* Parameter Controls */
        .control-group {
            margin-bottom: 20px;
        }

        .control-group label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: var(--anthropic-dark);
            margin-bottom: 8px;
        }

        .slider-container {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .slider-container input[type="range"] {
            flex: 1;
            height: 4px;
            background: var(--anthropic-light-gray);
            border-radius: 2px;
            outline: none;
            -webkit-appearance: none;
        }

        .slider-container input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            background: var(--anthropic-orange);
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .slider-container input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.1);
            background: #c86641;
        }

        .slider-container input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            background: var(--anthropic-orange);
            border-radius: 50%;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .value-display {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: var(--anthropic-mid-gray);
            min-width: 60px;
            text-align: right;
        }

        /* Color Pickers */
        .color-group {
            margin-bottom: 16px;
        }

        .color-group label {
            display: block;
            font-size: 12px;
            color: var(--anthropic-mid-gray);
            margin-bottom: 4px;
        }

        .color-picker-container {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .color-picker-container input[type="color"] {
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            background: none;
            padding: 0;
        }

        .color-value {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: var(--anthropic-mid-gray);
        }

        /* Buttons */
        .button {
            background: var(--anthropic-orange);
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            width: 100%;
        }

        .button:hover {
            background: #c86641;
            transform: translateY(-1px);
        }

        .button:active {
            transform: translateY(0);
        }

        .button.secondary {
            background: var(--anthropic-blue);
        }

        .button.secondary:hover {
            background: #5a8bb8;
        }

        .button.tertiary {
            background: var(--anthropic-green);
        }

        .button.tertiary:hover {
            background: #6b7b52;
        }

        .button-row {
            display: flex;
            gap: 8px;
        }

        .button-row .button {
            flex: 1;
        }

        /* Canvas Area */
        .canvas-area {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 0;
        }

        #canvas-container {
            width: 100%;
            max-width: 1000px;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 20px 40px rgba(20, 20, 19, 0.1);
            background: white;
        }

        #canvas-container canvas {
            display: block;
            width: 100% !important;
            height: auto !important;
        }

        /* Loading State */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: var(--anthropic-mid-gray);
        }

        /* Responsive - Stack on mobile */
        @media (max-width: 600px) {
            .container {
                flex-direction: column;
            }

            .sidebar {
                width: 100%;
            }

            .canvas-area {
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Control Sidebar -->
        <div class="sidebar">
            <!-- Headers (CUSTOMIZE THIS FOR YOUR ART) -->
            <h1>TITLE - EDIT</h1>
            <div class="subtitle">SUBHEADER - EDIT</div>

            <!-- Seed Section (ALWAYS KEEP THIS) -->
            <div class="control-section">
                <h3>Seed</h3>
                <input type="number" id="seed-input" class="seed-input" value="12345" onchange="updateSeed()">
                <div class="seed-controls">
                    <button class="button secondary" onclick="previousSeed()">← Prev</button>
                    <button class="button secondary" onclick="nextSeed()">Next →</button>
                </div>
                <button class="button tertiary regen-button" onclick="randomSeedAndUpdate()">↻ Random</button>
            </div>

            <!-- Parameters Section (CUSTOMIZE THIS FOR YOUR ART) -->
            <div class="control-section">
                <h3>Parameters</h3>

                <!-- Particle Count -->
                <div class="control-group">
                    <label>Particle Count</label>
                    <div class="slider-container">
                        <input type="range" id="particleCount" min="1000" max="10000" step="500" value="5000" oninput="updateParam('particleCount', this.value)">
                        <span class="value-display" id="particleCount-value">5000</span>
                    </div>
                </div>

                <!-- Flow Speed -->
                <div class="control-group">
                    <label>Flow Speed</label>
                    <div class="slider-container">
                        <input type="range" id="flowSpeed" min="0.1" max="2.0" step="0.1" value="0.5" oninput="updateParam('flowSpeed', this.value)">
                        <span class="value-display" id="flowSpeed-value">0.5</span>
                    </div>
                </div>

                <!-- Noise Scale -->
                <div class="control-group">
                    <label>Noise Scale</label>
                    <div class="slider-container">
                        <input type="range" id="noiseScale" min="0.001" max="0.02" step="0.001" value="0.005" oninput="updateParam('noiseScale', this.value)">
                        <span class="value-display" id="noiseScale-value">0.005</span>
                    </div>
                </div>

                <!-- Trail Length -->
                <div class="control-group">
                    <label>Trail Length</label>
                    <div class="slider-container">
                        <input type="range" id="trailLength" min="2" max="20" step="1" value="8" oninput="updateParam('trailLength', this.value)">
                        <span class="value-display" id="trailLength-value">8</span>
                    </div>
                </div>
            </div>

            <!-- Colors Section (OPTIONAL - CUSTOMIZE OR REMOVE) -->
            <div class="control-section">
                <h3>Colors</h3>

                <!-- Color 1 -->
                <div class="color-group">
                    <label>Primary Color</label>
                    <div class="color-picker-container">
                        <input type="color" id="color1" value="#d97757" onchange="updateColor('color1', this.value)">
                        <span class="color-value" id="color1-value">#d97757</span>
                    </div>
                </div>

                <!-- Color 2 -->
                <div class="color-group">
                    <label>Secondary Color</label>
                    <div class="color-picker-container">
                        <input type="color" id="color2" value="#6a9bcc" onchange="updateColor('color2', this.value)">
                        <span class="color-value" id="color2-value">#6a9bcc</span>
                    </div>
                </div>

                <!-- Color 3 -->
                <div class="color-group">
                    <label>Accent Color</label>
                    <div class="color-picker-container">
                        <input type="color" id="color3" value="#788c5d" onchange="updateColor('color3', this.value)">
                        <span class="color-value" id="color3-value">#788c5d</span>
                    </div>
                </div>
            </div>

            <!-- Actions Section (ALWAYS KEEP THIS) -->
            <div class="control-section">
                <h3>Actions</h3>
                <div class="button-row">
                    <button class="button" onclick="resetParameters()">Reset</button>
                </div>
            </div>
        </div>

        <!-- Main Canvas Area -->
        <div class="canvas-area">
            <div id="canvas-container">
                <div class="loading">Initializing generative art...</div>
            </div>
        </div>
    </div>

    <script>
        // ═══════════════════════════════════════════════════════════════════════
        // GENERATIVE ART PARAMETERS - CUSTOMIZE FOR YOUR ALGORITHM
        // ═══════════════════════════════════════════════════════════════════════

        let params = {
            seed: 12345,
            particleCount: 5000,
            flowSpeed: 0.5,
            noiseScale: 0.005,
            trailLength: 8,
            colorPalette: ['#d97757', '#6a9bcc', '#788c5d']
        };

        let defaultParams = {...params}; // Store defaults for reset

        // ═══════════════════════════════════════════════════════════════════════
        // P5.JS GENERATIVE ART ALGORITHM - REPLACE WITH YOUR VISION
        // ═══════════════════════════════════════════════════════════════════════

        let particles = [];
        let flowField = [];
        let cols, rows;
        let scl = 10; // Flow field resolution

        function setup() {
            let canvas = createCanvas(1200, 1200);
            canvas.parent('canvas-container');

            initializeSystem();

            // Remove loading message
            document.querySelector('.loading').style.display = 'none';
        }

        function initializeSystem() {
            // Seed the randomness for reproducibility
            randomSeed(params.seed);
            noiseSeed(params.seed);

            // Clear particles and recreate
            particles = [];

            // Initialize particles
            for (let i = 0; i < params.particleCount; i++) {
                particles.push(new Particle());
            }

            // Calculate flow field dimensions
            cols = floor(width / scl);
            rows = floor(height / scl);

            // Generate flow field
            generateFlowField();

            // Clear background
            background(250, 249, 245); // Anthropic light background
        }

        function generateFlowField() {
          // fill this in
        }

        function draw() {
            // fill this in
        }

        // ═══════════════════════════════════════════════════════════════════════
        // PARTICLE SYSTEM - CUSTOMIZE FOR YOUR ALGORITHM
        // ═══════════════════════════════════════════════════════════════════════

        class Particle {
            constructor() {
                // fill this in
            }
            // fill this in
        }

        // ═══════════════════════════════════════════════════════════════════════
        // UI CONTROL HANDLERS - CUSTOMIZE FOR YOUR PARAMETERS
        // ═══════════════════════════════════════════════════════════════════════

        function updateParam(paramName, value) {
            // fill this in
        }

        function updateColor(colorId, value) {
            // fill this in
        }

        // ═══════════════════════════════════════════════════════════════════════
        // SEED CONTROL FUNCTIONS - ALWAYS KEEP THESE
        // ═══════════════════════════════════════════════════════════════════════

        function updateSeedDisplay() {
            document.getElementById('seed-input').value = params.seed;
        }

        function updateSeed() {
            let input = document.getElementById('seed-input');
            let newSeed = parseInt(input.value);
            if (newSeed && newSeed > 0) {
                params.seed = newSeed;
                initializeSystem();
            } else {
                // Reset to current seed if invalid
                updateSeedDisplay();
            }
        }

        function previousSeed() {
            params.seed = Math.max(1, params.seed - 1);
            updateSeedDisplay();
            initializeSystem();
        }

        function nextSeed() {
            params.seed = params.seed + 1;
            updateSeedDisplay();
            initializeSystem();
        }

        function randomSeedAndUpdate() {
            params.seed = Math.floor(Math.random() * 999999) + 1;
            updateSeedDisplay();
            initializeSystem();
        }

        function resetParameters() {
            params = {...defaultParams};

            // Update UI elements
            document.getElementById('particleCount').value = params.particleCount;
            document.getElementById('particleCount-value').textContent = params.particleCount;
            document.getElementById('flowSpeed').value = params.flowSpeed;
            document.getElementById('flowSpeed-value').textContent = params.flowSpeed;
            document.getElementById('noiseScale').value = params.noiseScale;
            document.getElementById('noiseScale-value').textContent = params.noiseScale;
            document.getElementById('trailLength').value = params.trailLength;
            document.getElementById('trailLength-value').textContent = params.trailLength;

            // Reset colors
            document.getElementById('color1').value = params.colorPalette[0];
            document.getElementById('color1-value').textContent = params.colorPalette[0];
            document.getElementById('color2').value = params.colorPalette[1];
            document.getElementById('color2-value').textContent = params.colorPalette[1];
            document.getElementById('color3').value = params.colorPalette[2];
            document.getElementById('color3-value').textContent = params.colorPalette[2];

            updateSeedDisplay();
            initializeSystem();
        }

        // Initialize UI on load
        window.addEventListener('load', function() {
            updateSeedDisplay();
        });
    </script>
</body>
</html>
\`\`\`

---

## generator_template.js — p5.js Best Practices Reference

This file shows STRUCTURE and PRINCIPLES for p5.js generative art. It does NOT prescribe what art you should create. Your algorithmic philosophy should guide what you build. These are just best practices for how to structure your code.

### 1. Parameter Organization

Keep all tunable parameters in one object. This makes it easy to connect to UI controls, reset to defaults, and serialize/save configurations.

\`\`\`javascript
let params = {
    // Define parameters that match YOUR algorithm
    // Examples (customize for your art):
    // - Counts: how many elements (particles, circles, branches, etc.)
    // - Scales: size, speed, spacing
    // - Probabilities: likelihood of events
    // - Angles: rotation, direction
    // - Colors: palette arrays

    seed: 12345,
    // define colorPalette as an array -- choose whatever colors you'd like ['#d97757', '#6a9bcc', '#788c5d', '#b0aea5']
    // Add YOUR parameters here based on your algorithm
};
\`\`\`

### 2. Seeded Randomness (Critical for reproducibility)

ALWAYS use seeded random for Art Blocks-style reproducible output.

\`\`\`javascript
function initializeSeed(seed) {
    randomSeed(seed);
    noiseSeed(seed);
    // Now all random() and noise() calls will be deterministic
}
\`\`\`

### 3. p5.js Lifecycle

\`\`\`javascript
function setup() {
    createCanvas(800, 800);

    // Initialize seed first
    initializeSeed(params.seed);

    // Set up your generative system
    // This is where you initialize:
    // - Arrays of objects
    // - Grid structures
    // - Initial positions
    // - Starting states

    // For static art: call noLoop() at the end of setup
    // For animated art: let draw() keep running
}

function draw() {
    // Option 1: Static generation (runs once, then stops)
    // Option 2: Animated generation (continuous)
    // Option 3: User-triggered regeneration
}
\`\`\`

### 4. Class Structure (When you need objects)

Use classes when your algorithm involves multiple entities (particles, agents, cells, nodes, etc.).

\`\`\`javascript
class Entity {
    constructor() {
        // Initialize entity properties
        // Use random() here - it will be seeded
    }

    update() {
        // Update entity state (physics, behavioral rules, interactions)
    }

    display() {
        // Render the entity
        // Keep rendering logic separate from update logic
    }
}
\`\`\`

### 5. Performance Considerations

For large numbers of elements:
- Pre-calculate what you can
- Use simple collision detection (spatial hashing if needed)
- Limit expensive operations (sqrt, trig) when possible
- Consider using p5 vectors efficiently

For smooth animation:
- Aim for 60fps
- Profile if things are slow
- Consider reducing particle counts or simplifying calculations

### 6. Utility Functions

\`\`\`javascript
// Color utilities
function hexToRgb(hex) {
    const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})\$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function colorFromPalette(index) {
    return params.colorPalette[index % params.colorPalette.length];
}

// Mapping and easing
function mapRange(value, inMin, inMax, outMin, outMax) {
    return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Constrain to bounds
function wrapAround(value, max) {
    if (value < 0) return max;
    if (value > max) return 0;
    return value;
}
\`\`\`

### 7. Parameter Updates (Connect to UI)

\`\`\`javascript
function updateParameter(paramName, value) {
    params[paramName] = value;
    // Decide if you need to regenerate or just update
}

function regenerate() {
    initializeSeed(params.seed);
    // Then regenerate your system
}
\`\`\`

### 8. Common p5.js Patterns

\`\`\`javascript
// Drawing with transparency for trails/fading
function fadeBackground(opacity) {
    fill(250, 249, 245, opacity); // Anthropic light with alpha
    noStroke();
    rect(0, 0, width, height);
}

// Using noise for organic variation
function getNoiseValue(x, y, scale = 0.01) {
    return noise(x * scale, y * scale);
}

// Creating vectors from angles
function vectorFromAngle(angle, magnitude = 1) {
    return createVector(cos(angle), sin(angle)).mult(magnitude);
}
\`\`\`

### 9. Export Functions

\`\`\`javascript
function exportImage() {
    saveCanvas('generative-art-' + params.seed, 'png');
}
\`\`\`

### Remember

These are TOOLS and PRINCIPLES, not a recipe. Your algorithmic philosophy should guide WHAT you create. This structure helps you create it WELL.

Focus on:
- Clean, readable code
- Parameterized for exploration
- Seeded for reproducibility
- Performant execution

The art itself is entirely up to you!
`,
  },
  {
    path: "skills/algorithmic-art/skill.md",
    content: `---
name: algorithmic-art
description: "Create generative art with p5.js — flow fields, particle systems, seeded randomness."
tags:
  - creative
  - generative-art
  - p5js
  - design
  - interactive
---

Algorithmic philosophies are computational aesthetic movements that are then expressed through code. Output .md files (philosophy), .html files (interactive viewer), and .js files (generative algorithms).

This happens in two steps:
1. Algorithmic Philosophy Creation (.md file)
2. Express by creating p5.js generative art (.html + .js files)

First, undertake this task:

## ALGORITHMIC PHILOSOPHY CREATION

To begin, create an ALGORITHMIC PHILOSOPHY (not static images or templates) that will be interpreted through:
- Computational processes, emergent behavior, mathematical beauty
- Seeded randomness, noise fields, organic systems
- Particles, flows, fields, forces
- Parametric variation and controlled chaos

### THE CRITICAL UNDERSTANDING
- What is received: Some subtle input or instructions by the user to take into account, but use as a foundation; it should not constrain creative freedom.
- What is created: An algorithmic philosophy/generative aesthetic movement.
- What happens next: The same version receives the philosophy and EXPRESSES IT IN CODE - creating p5.js sketches that are 90% algorithmic generation, 10% essential parameters.

Consider this approach:
- Write a manifesto for a generative art movement
- The next phase involves writing the algorithm that brings it to life

The philosophy must emphasize: Algorithmic expression. Emergent behavior. Computational beauty. Seeded variation.

### HOW TO GENERATE AN ALGORITHMIC PHILOSOPHY

**Name the movement** (1-2 words): "Organic Turbulence" / "Quantum Harmonics" / "Emergent Stillness"

**Articulate the philosophy** (4-6 paragraphs - concise but complete):

To capture the ALGORITHMIC essence, express how this philosophy manifests through:
- Computational processes and mathematical relationships?
- Noise functions and randomness patterns?
- Particle behaviors and field dynamics?
- Temporal evolution and system states?
- Parametric variation and emergent complexity?

**CRITICAL GUIDELINES:**
- **Avoid redundancy**: Each algorithmic aspect should be mentioned once. Avoid repeating concepts about noise theory, particle dynamics, or mathematical principles unless adding new depth.
- **Emphasize craftsmanship REPEATEDLY**: The philosophy MUST stress multiple times that the final algorithm should appear as though it took countless hours to develop, was refined with care, and comes from someone at the absolute top of their field. This framing is essential - repeat phrases like "meticulously crafted algorithm," "the product of deep computational expertise," "painstaking optimization," "master-level implementation."
- **Leave creative space**: Be specific about the algorithmic direction, but concise enough that the next Claude has room to make interpretive implementation choices at an extremely high level of craftsmanship.

The philosophy must guide the next version to express ideas ALGORITHMICALLY, not through static images. Beauty lives in the process, not the final frame.

### PHILOSOPHY EXAMPLES

**"Organic Turbulence"**
Philosophy: Chaos constrained by natural law, order emerging from disorder.
Algorithmic expression: Flow fields driven by layered Perlin noise. Thousands of particles following vector forces, their trails accumulating into organic density maps. Multiple noise octaves create turbulent regions and calm zones. Color emerges from velocity and density - fast particles burn bright, slow ones fade to shadow. The algorithm runs until equilibrium - a meticulously tuned balance where every parameter was refined through countless iterations by a master of computational aesthetics.

**"Quantum Harmonics"**
Philosophy: Discrete entities exhibiting wave-like interference patterns.
Algorithmic expression: Particles initialized on a grid, each carrying a phase value that evolves through sine waves. When particles are near, their phases interfere - constructive interference creates bright nodes, destructive creates voids. Simple harmonic motion generates complex emergent mandalas. The result of painstaking frequency calibration where every ratio was carefully chosen to produce resonant beauty.

**"Recursive Whispers"**
Philosophy: Self-similarity across scales, infinite depth in finite space.
Algorithmic expression: Branching structures that subdivide recursively. Each branch slightly randomized but constrained by golden ratios. L-systems or recursive subdivision generate tree-like forms that feel both mathematical and organic. Subtle noise perturbations break perfect symmetry. Line weights diminish with each recursion level. Every branching angle the product of deep mathematical exploration.

**"Field Dynamics"**
Philosophy: Invisible forces made visible through their effects on matter.
Algorithmic expression: Vector fields constructed from mathematical functions or noise. Particles born at edges, flowing along field lines, dying when they reach equilibrium or boundaries. Multiple fields can attract, repel, or rotate particles. The visualization shows only the traces - ghost-like evidence of invisible forces. A computational dance meticulously choreographed through force balance.

**"Stochastic Crystallization"**
Philosophy: Random processes crystallizing into ordered structures.
Algorithmic expression: Randomized circle packing or Voronoi tessellation. Start with random points, let them evolve through relaxation algorithms. Cells push apart until equilibrium. Color based on cell size, neighbor count, or distance from center. The organic tiling that emerges feels both random and inevitable. Every seed produces unique crystalline beauty - the mark of a master-level generative algorithm.

*These are condensed examples. The actual algorithmic philosophy should be 4-6 substantial paragraphs.*

### ESSENTIAL PRINCIPLES
- **ALGORITHMIC PHILOSOPHY**: Creating a computational worldview to be expressed through code
- **PROCESS OVER PRODUCT**: Always emphasize that beauty emerges from the algorithm's execution - each run is unique
- **PARAMETRIC EXPRESSION**: Ideas communicate through mathematical relationships, forces, behaviors - not static composition
- **ARTISTIC FREEDOM**: The next Claude interprets the philosophy algorithmically - provide creative implementation room
- **PURE GENERATIVE ART**: This is about making LIVING ALGORITHMS, not static images with randomness
- **EXPERT CRAFTSMANSHIP**: Repeatedly emphasize the final algorithm must feel meticulously crafted, refined through countless iterations, the product of deep expertise by someone at the absolute top of their field in computational aesthetics

**The algorithmic philosophy should be 4-6 paragraphs long.** Fill it with poetic computational philosophy that brings together the intended vision. Avoid repeating the same points. Output this algorithmic philosophy as a .md file.

---

## DEDUCING THE CONCEPTUAL SEED

**CRITICAL STEP**: Before implementing the algorithm, identify the subtle conceptual thread from the original request.

**THE ESSENTIAL PRINCIPLE**:
The concept is a **subtle, niche reference embedded within the algorithm itself** - not always literal, always sophisticated. Someone familiar with the subject should feel it intuitively, while others simply experience a masterful generative composition. The algorithmic philosophy provides the computational language. The deduced concept provides the soul - the quiet conceptual DNA woven invisibly into parameters, behaviors, and emergence patterns.

This is **VERY IMPORTANT**: The reference must be so refined that it enhances the work's depth without announcing itself. Think like a jazz musician quoting another song through algorithmic harmony - only those who know will catch it, but everyone appreciates the generative beauty.

---

## P5.JS IMPLEMENTATION

With the philosophy AND conceptual framework established, express it through code. Pause to gather thoughts before proceeding. Use only the algorithmic philosophy created and the instructions below.

### STEP 0: READ THE TEMPLATE FIRST

**CRITICAL: BEFORE writing any HTML:**

1. **Read** \`templates/viewer.html\` using the Read tool
2. **Study** the exact structure, styling, and Anthropic branding
3. **Use that file as the LITERAL STARTING POINT** - not just inspiration
4. **Keep all FIXED sections exactly as shown** (header, sidebar structure, Anthropic colors/fonts, seed controls, action buttons)
5. **Replace only the VARIABLE sections** marked in the file's comments (algorithm, parameters, UI controls for parameters)

**Avoid:**
- Creating HTML from scratch
- Inventing custom styling or color schemes
- Using system fonts or dark themes
- Changing the sidebar structure

**Follow these practices:**
- Copy the template's exact HTML structure
- Keep Anthropic branding (Poppins/Lora fonts, light colors, gradient backdrop)
- Maintain the sidebar layout (Seed -> Parameters -> Colors? -> Actions)
- Replace only the p5.js algorithm and parameter controls

The template is the foundation. Build on it, don't rebuild it.

---

To create gallery-quality computational art that lives and breathes, use the algorithmic philosophy as the foundation.

### TECHNICAL REQUIREMENTS

**Seeded Randomness (Art Blocks Pattern)**:
\`\`\`javascript
// ALWAYS use a seed for reproducibility
let seed = 12345; // or hash from user input
randomSeed(seed);
noiseSeed(seed);
\`\`\`

**Parameter Structure - FOLLOW THE PHILOSOPHY**:

To establish parameters that emerge naturally from the algorithmic philosophy, consider: "What qualities of this system can be adjusted?"

\`\`\`javascript
let params = {
  seed: 12345,  // Always include seed for reproducibility
  // colors
  // Add parameters that control YOUR algorithm:
  // - Quantities (how many?)
  // - Scales (how big? how fast?)
  // - Probabilities (how likely?)
  // - Ratios (what proportions?)
  // - Angles (what direction?)
  // - Thresholds (when does behavior change?)
};
\`\`\`

**To design effective parameters, focus on the properties the system needs to be tunable rather than thinking in terms of "pattern types".**

**Core Algorithm - EXPRESS THE PHILOSOPHY**:

**CRITICAL**: The algorithmic philosophy should dictate what to build.

To express the philosophy through code, avoid thinking "which pattern should I use?" and instead think "how to express this philosophy through code?"

If the philosophy is about **organic emergence**, consider using:
- Elements that accumulate or grow over time
- Random processes constrained by natural rules
- Feedback loops and interactions

If the philosophy is about **mathematical beauty**, consider using:
- Geometric relationships and ratios
- Trigonometric functions and harmonics
- Precise calculations creating unexpected patterns

If the philosophy is about **controlled chaos**, consider using:
- Random variation within strict boundaries
- Bifurcation and phase transitions
- Order emerging from disorder

**The algorithm flows from the philosophy, not from a menu of options.**

To guide the implementation, let the conceptual essence inform creative and original choices. Build something that expresses the vision for this particular request.

**Canvas Setup**: Standard p5.js structure:
\`\`\`javascript
function setup() {
  createCanvas(1200, 1200);
  // Initialize your system
}

function draw() {
  // Your generative algorithm
  // Can be static (noLoop) or animated
}
\`\`\`

### CRAFTSMANSHIP REQUIREMENTS

**CRITICAL**: To achieve mastery, create algorithms that feel like they emerged through countless iterations by a master generative artist. Tune every parameter carefully. Ensure every pattern emerges with purpose. This is NOT random noise - this is CONTROLLED CHAOS refined through deep expertise.

- **Balance**: Complexity without visual noise, order without rigidity
- **Color Harmony**: Thoughtful palettes, not random RGB values
- **Composition**: Even in randomness, maintain visual hierarchy and flow
- **Performance**: Smooth execution, optimized for real-time if animated
- **Reproducibility**: Same seed ALWAYS produces identical output

### OUTPUT FORMAT

Output:
1. **Algorithmic Philosophy** - As markdown or text explaining the generative aesthetic
2. **Single HTML Artifact** - Self-contained interactive generative art built from \`templates/viewer.html\` (see STEP 0 and next section)

The HTML artifact contains everything: p5.js (from CDN), the algorithm, parameter controls, and UI - all in one file that works immediately in claude.ai artifacts or any browser. Start from the template file, not from scratch.

---

## INTERACTIVE ARTIFACT CREATION

**REMINDER: \`templates/viewer.html\` should have already been read (see STEP 0). Use that file as the starting point.**

To allow exploration of the generative art, create a single, self-contained HTML artifact. Ensure this artifact works immediately in claude.ai or any browser - no setup required. Embed everything inline.

### CRITICAL: WHAT'S FIXED VS VARIABLE

The \`templates/viewer.html\` file is the foundation. It contains the exact structure and styling needed.

**FIXED (always include exactly as shown):**
- Layout structure (header, sidebar, main canvas area)
- Anthropic branding (UI colors, fonts, gradients)
- Seed section in sidebar:
  - Seed display
  - Previous/Next buttons
  - Random button
  - Jump to seed input + Go button
- Actions section in sidebar:
  - Regenerate button
  - Reset button

**VARIABLE (customize for each artwork):**
- The entire p5.js algorithm (setup/draw/classes)
- The parameters object (define what the art needs)
- The Parameters section in sidebar:
  - Number of parameter controls
  - Parameter names
  - Min/max/step values for sliders
  - Control types (sliders, inputs, etc.)
- Colors section (optional):
  - Some art needs color pickers
  - Some art might use fixed colors
  - Some art might be monochrome (no color controls needed)
  - Decide based on the art's needs

**Every artwork should have unique parameters and algorithm!** The fixed parts provide consistent UX - everything else expresses the unique vision.

### REQUIRED FEATURES

**1. Parameter Controls**
- Sliders for numeric parameters (particle count, noise scale, speed, etc.)
- Color pickers for palette colors
- Real-time updates when parameters change
- Reset button to restore defaults

**2. Seed Navigation**
- Display current seed number
- "Previous" and "Next" buttons to cycle through seeds
- "Random" button for random seed
- Input field to jump to specific seed
- Generate 100 variations when requested (seeds 1-100)

**3. Single Artifact Structure**
\`\`\`html
<!DOCTYPE html>
<html>
<head>
  <!-- p5.js from CDN - always available -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js"></script>
  <style>
    /* All styling inline - clean, minimal */
    /* Canvas on top, controls below */
  </style>
</head>
<body>
  <div id="canvas-container"></div>
  <div id="controls">
    <!-- All parameter controls -->
  </div>
  <script>
    // ALL p5.js code inline here
    // Parameter objects, classes, functions
    // setup() and draw()
    // UI handlers
    // Everything self-contained
  </script>
</body>
</html>
\`\`\`

**CRITICAL**: This is a single artifact. No external files, no imports (except p5.js CDN). Everything inline.

**4. Implementation Details - BUILD THE SIDEBAR**

The sidebar structure:

**1. Seed (FIXED)** - Always include exactly as shown:
- Seed display
- Prev/Next/Random/Jump buttons

**2. Parameters (VARIABLE)** - Create controls for the art:
\`\`\`html
<div class="control-group">
    <label>Parameter Name</label>
    <input type="range" id="param" min="..." max="..." step="..." value="..." oninput="updateParam('param', this.value)">
    <span class="value-display" id="param-value">...</span>
</div>
\`\`\`
Add as many control-group divs as there are parameters.

**3. Colors (OPTIONAL/VARIABLE)** - Include if the art needs adjustable colors:
- Add color pickers if users should control palette
- Skip this section if the art uses fixed colors
- Skip if the art is monochrome

**4. Actions (FIXED)** - Always include exactly as shown:
- Regenerate button
- Reset button
- Download PNG button

**Requirements**:
- Seed controls must work (prev/next/random/jump/display)
- All parameters must have UI controls
- Regenerate, Reset, Download buttons must work
- Keep Anthropic branding (UI styling, not art colors)

### USING THE ARTIFACT

The HTML artifact works immediately:
1. **In claude.ai**: Displayed as an interactive artifact - runs instantly
2. **As a file**: Save and open in any browser - no server needed
3. **Sharing**: Send the HTML file - it's completely self-contained

---

## VARIATIONS & EXPLORATION

The artifact includes seed navigation by default (prev/next/random buttons), allowing users to explore variations without creating multiple files. If the user wants specific variations highlighted:

- Include seed presets (buttons for "Variation 1: Seed 42", "Variation 2: Seed 127", etc.)
- Add a "Gallery Mode" that shows thumbnails of multiple seeds side-by-side
- All within the same single artifact

This is like creating a series of prints from the same plate - the algorithm is consistent, but each seed reveals different facets of its potential. The interactive nature means users discover their own favorites by exploring the seed space.

---

## THE CREATIVE PROCESS

**User request** -> **Algorithmic philosophy** -> **Implementation**

Each request is unique. The process involves:

1. **Interpret the user's intent** - What aesthetic is being sought?
2. **Create an algorithmic philosophy** (4-6 paragraphs) describing the computational approach
3. **Implement it in code** - Build the algorithm that expresses this philosophy
4. **Design appropriate parameters** - What should be tunable?
5. **Build matching UI controls** - Sliders/inputs for those parameters

**The constants**:
- Anthropic branding (colors, fonts, layout)
- Seed navigation (always present)
- Self-contained HTML artifact

**Everything else is variable**:
- The algorithm itself
- The parameters
- The UI controls
- The visual outcome

To achieve the best results, trust creativity and let the philosophy guide the implementation.

---

## RESOURCES

This skill includes helpful templates and documentation:

- **templates/viewer.html**: REQUIRED STARTING POINT for all HTML artifacts.
  - This is the foundation - contains the exact structure and Anthropic branding
  - **Keep unchanged**: Layout structure, sidebar organization, Anthropic colors/fonts, seed controls, action buttons
  - **Replace**: The p5.js algorithm, parameter definitions, and UI controls in Parameters section
  - The extensive comments in the file mark exactly what to keep vs replace

- **templates/generator_template.js**: Reference for p5.js best practices and code structure principles.
  - Shows how to organize parameters, use seeded randomness, structure classes
  - NOT a pattern menu - use these principles to build unique algorithms
  - Embed algorithms inline in the HTML artifact (don't create separate .js files)

**Critical reminder**:
- The **template is the STARTING POINT**, not inspiration
- The **algorithm is where to create** something unique
- Don't copy the flow field example - build what the philosophy demands
- But DO keep the exact UI structure and Anthropic branding from the template
`,
  },
  {
    path: "skills/canvas-design/references.md",
    content: `# Canvas Design References

## Available Fonts (canvas-fonts directory)

The \`./canvas-fonts\` directory contains the following font files for use in canvas designs. Use different fonts when writing text to make the typography part of the art itself.

### Sans-Serif Fonts

| Font | Weights | License |
|------|---------|---------|
| **ArsenalSC** | Regular | OFL |
| **Big Shoulders** | Regular, Bold | OFL |
| **Bricolage Grotesque** | Regular, Bold | OFL |
| **Instrument Sans** | Regular, Bold, Italic, Bold Italic | OFL |
| **Jura** | Light, Medium | OFL |
| **Outfit** | Regular, Bold | OFL |
| **Poiret One** | Regular | OFL |
| **Smooch Sans** | Medium | OFL |
| **Work Sans** | Regular, Bold, Italic, Bold Italic | OFL |

### Serif Fonts

| Font | Weights | License |
|------|---------|---------|
| **Crimson Pro** | Regular, Bold, Italic | OFL |
| **Gloock** | Regular | OFL |
| **IBM Plex Serif** | Regular, Bold, Italic, Bold Italic | OFL |
| **Instrument Serif** | Regular, Italic | OFL |
| **Italiana** | Regular | OFL |
| **Libre Baskerville** | Regular | OFL |
| **Lora** | Regular, Bold, Italic, Bold Italic | OFL |
| **Young Serif** | Regular | OFL |

### Monospace Fonts

| Font | Weights | License |
|------|---------|---------|
| **DM Mono** | Regular | OFL |
| **Geist Mono** | Regular, Bold | OFL |
| **IBM Plex Mono** | Regular, Bold | OFL |
| **JetBrains Mono** | Regular, Bold | OFL |
| **Red Hat Mono** | Regular, Bold | OFL |

### Display / Specialty Fonts

| Font | Weights | License |
|------|---------|---------|
| **Boldonse** | Regular | OFL |
| **Erica One** | Regular | OFL |
| **National Park** | Regular, Bold | OFL |
| **Nothing You Could Do** | Regular (handwritten) | OFL |
| **Pixelify Sans** | Medium (pixel) | OFL |
| **Silkscreen** | Regular (pixel) | OFL |
| **Tektur** | Regular, Medium | OFL |

### Font File Paths

All fonts are \`.ttf\` files located in the \`./canvas-fonts/\` directory relative to the skill. Example paths:

- \`./canvas-fonts/Lora-Regular.ttf\`
- \`./canvas-fonts/Lora-Bold.ttf\`
- \`./canvas-fonts/WorkSans-Regular.ttf\`
- \`./canvas-fonts/JetBrainsMono-Regular.ttf\`
- \`./canvas-fonts/Boldonse-Regular.ttf\`
- \`./canvas-fonts/NationalPark-Bold.ttf\`

### Font Selection Guidelines

- **Most of the time, font should be thin** — prefer Light or Regular weights
- **Use different fonts** when writing text — variety adds visual richness
- **Make typography part of the art** — if the art is abstract, bring the font onto the canvas
- **Sophistication is non-negotiable** regardless of the font choice
- All fonts are licensed under SIL Open Font License (OFL)
`,
  },
  {
    path: "skills/canvas-design/skill.md",
    content: `---
name: canvas-design
description: "Create visual art, posters, and static designs as PNG/PDF. Trigger on poster, artwork, or visual design requests."
tags:
  - creative
  - design
  - visual-art
  - pdf
  - poster
---

These are instructions for creating design philosophies - aesthetic movements that are then EXPRESSED VISUALLY. Output only .md files, .pdf files, and .png files.

Complete this in two steps:
1. Design Philosophy Creation (.md file)
2. Express by creating it on a canvas (.pdf file or .png file)

First, undertake this task:

## DESIGN PHILOSOPHY CREATION

To begin, create a VISUAL PHILOSOPHY (not layouts or templates) that will be interpreted through:
- Form, space, color, composition
- Images, graphics, shapes, patterns
- Minimal text as visual accent

### THE CRITICAL UNDERSTANDING
- What is received: Some subtle input or instructions by the user that should be taken into account, but used as a foundation; it should not constrain creative freedom.
- What is created: A design philosophy/aesthetic movement.
- What happens next: Then, the same version receives the philosophy and EXPRESSES IT VISUALLY - creating artifacts that are 90% visual design, 10% essential text.

Consider this approach:
- Write a manifesto for an art movement
- The next phase involves making the artwork

The philosophy must emphasize: Visual expression. Spatial communication. Artistic interpretation. Minimal words.

### HOW TO GENERATE A VISUAL PHILOSOPHY

**Name the movement** (1-2 words): "Brutalist Joy" / "Chromatic Silence" / "Metabolist Dreams"

**Articulate the philosophy** (4-6 paragraphs - concise but complete):

To capture the VISUAL essence, express how the philosophy manifests through:
- Space and form
- Color and material
- Scale and rhythm
- Composition and balance
- Visual hierarchy

**CRITICAL GUIDELINES:**
- **Avoid redundancy**: Each design aspect should be mentioned once. Avoid repeating points about color theory, spatial relationships, or typographic principles unless adding new depth.
- **Emphasize craftsmanship REPEATEDLY**: The philosophy MUST stress multiple times that the final work should appear as though it took countless hours to create, was labored over with care, and comes from someone at the absolute top of their field. This framing is essential - repeat phrases like "meticulously crafted," "the product of deep expertise," "painstaking attention," "master-level execution."
- **Leave creative space**: Remain specific about the aesthetic direction, but concise enough that the next Claude has room to make interpretive choices also at a extremely high level of craftmanship.

The philosophy must guide the next version to express ideas VISUALLY, not through text. Information lives in design, not paragraphs.

### PHILOSOPHY EXAMPLES

**"Concrete Poetry"**
Philosophy: Communication through monumental form and bold geometry.
Visual expression: Massive color blocks, sculptural typography (huge single words, tiny labels), Brutalist spatial divisions, Polish poster energy meets Le Corbusier. Ideas expressed through visual weight and spatial tension, not explanation. Text as rare, powerful gesture - never paragraphs, only essential words integrated into the visual architecture. Every element placed with the precision of a master craftsman.

**"Chromatic Language"**
Philosophy: Color as the primary information system.
Visual expression: Geometric precision where color zones create meaning. Typography minimal - small sans-serif labels letting chromatic fields communicate. Think Josef Albers' interaction meets data visualization. Information encoded spatially and chromatically. Words only to anchor what color already shows. The result of painstaking chromatic calibration.

**"Analog Meditation"**
Philosophy: Quiet visual contemplation through texture and breathing room.
Visual expression: Paper grain, ink bleeds, vast negative space. Photography and illustration dominate. Typography whispered (small, restrained, serving the visual). Japanese photobook aesthetic. Images breathe across pages. Text appears sparingly - short phrases, never explanatory blocks. Each composition balanced with the care of a meditation practice.

**"Organic Systems"**
Philosophy: Natural clustering and modular growth patterns.
Visual expression: Rounded forms, organic arrangements, color from nature through architecture. Information shown through visual diagrams, spatial relationships, iconography. Text only for key labels floating in space. The composition tells the story through expert spatial orchestration.

**"Geometric Silence"**
Philosophy: Pure order and restraint.
Visual expression: Grid-based precision, bold photography or stark graphics, dramatic negative space. Typography precise but minimal - small essential text, large quiet zones. Swiss formalism meets Brutalist material honesty. Structure communicates, not words. Every alignment the work of countless refinements.

*These are condensed examples. The actual design philosophy should be 4-6 substantial paragraphs.*

### ESSENTIAL PRINCIPLES
- **VISUAL PHILOSOPHY**: Create an aesthetic worldview to be expressed through design
- **MINIMAL TEXT**: Always emphasize that text is sparse, essential-only, integrated as visual element - never lengthy
- **SPATIAL EXPRESSION**: Ideas communicate through space, form, color, composition - not paragraphs
- **ARTISTIC FREEDOM**: The next Claude interprets the philosophy visually - provide creative room
- **PURE DESIGN**: This is about making ART OBJECTS, not documents with decoration
- **EXPERT CRAFTSMANSHIP**: Repeatedly emphasize the final work must look meticulously crafted, labored over with care, the product of countless hours by someone at the top of their field

**The design philosophy should be 4-6 paragraphs long.** Fill it with poetic design philosophy that brings together the core vision. Avoid repeating the same points. Keep the design philosophy generic without mentioning the intention of the art, as if it can be used wherever. Output the design philosophy as a .md file.

---

## DEDUCING THE SUBTLE REFERENCE

**CRITICAL STEP**: Before creating the canvas, identify the subtle conceptual thread from the original request.

**THE ESSENTIAL PRINCIPLE**:
The topic is a **subtle, niche reference embedded within the art itself** - not always literal, always sophisticated. Someone familiar with the subject should feel it intuitively, while others simply experience a masterful abstract composition. The design philosophy provides the aesthetic language. The deduced topic provides the soul - the quiet conceptual DNA woven invisibly into form, color, and composition.

This is **VERY IMPORTANT**: The reference must be refined so it enhances the work's depth without announcing itself. Think like a jazz musician quoting another song - only those who know will catch it, but everyone appreciates the music.

---

## CANVAS CREATION

With both the philosophy and the conceptual framework established, express it on a canvas. Take a moment to gather thoughts and clear the mind. Use the design philosophy created and the instructions below to craft a masterpiece, embodying all aspects of the philosophy with expert craftsmanship.

**IMPORTANT**: For any type of content, even if the user requests something for a movie/game/book, the approach should still be sophisticated. Never lose sight of the idea that this should be art, not something that's cartoony or amateur.

To create museum or magazine quality work, use the design philosophy as the foundation. Create one single page, highly visual, design-forward PDF or PNG output (unless asked for more pages). Generally use repeating patterns and perfect shapes. Treat the abstract philosophical design as if it were a scientific bible, borrowing the visual language of systematic observation—dense accumulation of marks, repeated elements, or layered patterns that build meaning through patient repetition and reward sustained viewing. Add sparse, clinical typography and systematic reference markers that suggest this could be a diagram from an imaginary discipline, treating the invisible subject with the same reverence typically reserved for documenting observable phenomena. Anchor the piece with simple phrase(s) or details positioned subtly, using a limited color palette that feels intentional and cohesive. Embrace the paradox of using analytical visual language to express ideas about human experience: the result should feel like an artifact that proves something ephemeral can be studied, mapped, and understood through careful attention. This is true art.

**Text as a contextual element**: Text is always minimal and visual-first, but let context guide whether that means whisper-quiet labels or bold typographic gestures. A punk venue poster might have larger, more aggressive type than a minimalist ceramics studio identity. Most of the time, font should be thin. All use of fonts must be design-forward and prioritize visual communication. Regardless of text scale, nothing falls off the page and nothing overlaps. Every element must be contained within the canvas boundaries with proper margins. Check carefully that all text, graphics, and visual elements have breathing room and clear separation. This is non-negotiable for professional execution. **IMPORTANT: Use different fonts if writing text. Search the \`./canvas-fonts\` directory. Regardless of approach, sophistication is non-negotiable.**

Download and use whatever fonts are needed to make this a reality. Get creative by making the typography actually part of the art itself -- if the art is abstract, bring the font onto the canvas, not typeset digitally.

To push boundaries, follow design instinct/intuition while using the philosophy as a guiding principle. Embrace ultimate design freedom and choice. Push aesthetics and design to the frontier.

**CRITICAL**: To achieve human-crafted quality (not AI-generated), create work that looks like it took countless hours. Make it appear as though someone at the absolute top of their field labored over every detail with painstaking care. Ensure the composition, spacing, color choices, typography - everything screams expert-level craftsmanship. Double-check that nothing overlaps, formatting is flawless, every detail perfect. Create something that could be shown to people to prove expertise and rank as undeniably impressive.

Output the final result as a single, downloadable .pdf or .png file, alongside the design philosophy used as a .md file.

---

## FINAL STEP

**IMPORTANT**: The user ALREADY said "It isn't perfect enough. It must be pristine, a masterpiece if craftsmanship, as if it were about to be displayed in a museum."

**CRITICAL**: To refine the work, avoid adding more graphics; instead refine what has been created and make it extremely crisp, respecting the design philosophy and the principles of minimalism entirely. Rather than adding a fun filter or refactoring a font, consider how to make the existing composition more cohesive with the art. If the instinct is to call a new function or draw a new shape, STOP and instead ask: "How can I make what's already here more of a piece of art?"

Take a second pass. Go back to the code and refine/polish further to make this a philosophically designed masterpiece.

## MULTI-PAGE OPTION

To create additional pages when requested, create more creative pages along the same lines as the design philosophy but distinctly different as well. Bundle those pages in the same .pdf or many .pngs. Treat the first page as just a single page in a whole coffee table book waiting to be filled. Make the next pages unique twists and memories of the original. Have them almost tell a story in a very tasteful way. Exercise full creative freedom.
`,
  },
  {
    path: "skills/claude-api/references.md",
    content: `# Claude API — Shared Reference Documentation

---

# HTTP Error Codes Reference

This file documents HTTP error codes returned by the Claude API, their common causes, and how to handle them. For language-specific error handling examples, see the \`python/\` or \`typescript/\` folders.

## Error Code Summary

| Code | Error Type              | Retryable | Common Cause                         |
| ---- | ----------------------- | --------- | ------------------------------------ |
| 400  | \`invalid_request_error\` | No        | Invalid request format or parameters |
| 401  | \`authentication_error\`  | No        | Invalid or missing API key           |
| 403  | \`permission_error\`      | No        | API key lacks permission             |
| 404  | \`not_found_error\`       | No        | Invalid endpoint or model ID         |
| 413  | \`request_too_large\`     | No        | Request exceeds size limits          |
| 429  | \`rate_limit_error\`      | Yes       | Too many requests                    |
| 500  | \`api_error\`             | Yes       | Anthropic service issue              |
| 529  | \`overloaded_error\`      | Yes       | API is temporarily overloaded        |

## Detailed Error Information

### 400 Bad Request

**Causes:**

- Malformed JSON in request body
- Missing required parameters (\`model\`, \`max_tokens\`, \`messages\`)
- Invalid parameter types (e.g., string where integer expected)
- Empty messages array
- Messages not alternating user/assistant

**Example error:**

\`\`\`json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "messages: roles must alternate between \\"user\\" and \\"assistant\\""
  },
  "request_id": "req_011CSHoEeqs5C35K2UUqR7Fy"
}
\`\`\`

**Fix:** Validate request structure before sending. Check that:

- \`model\` is a valid model ID
- \`max_tokens\` is a positive integer
- \`messages\` array is non-empty and alternates correctly

---

### 401 Unauthorized

**Causes:**

- Missing \`x-api-key\` header or \`Authorization\` header
- Invalid API key format
- Revoked or deleted API key

**Fix:** Ensure \`ANTHROPIC_API_KEY\` environment variable is set correctly.

---

### 403 Forbidden

**Causes:**

- API key doesn't have access to the requested model
- Organization-level restrictions
- Attempting to access beta features without beta access

**Fix:** Check your API key permissions in the Console. You may need a different API key or to request access to specific features.

---

### 404 Not Found

**Causes:**

- Typo in model ID (e.g., \`claude-sonnet-4.6\` instead of \`claude-sonnet-4-6\`)
- Using deprecated model ID
- Invalid API endpoint

**Fix:** Use exact model IDs from the models documentation. You can use aliases (e.g., \`claude-opus-4-6\`).

---

### 413 Request Too Large

**Causes:**

- Request body exceeds maximum size
- Too many tokens in input
- Image data too large

**Fix:** Reduce input size — truncate conversation history, compress/resize images, or split large documents into chunks.

---

### 400 Validation Errors

Some 400 errors are specifically related to parameter validation:

- \`max_tokens\` exceeds model's limit
- Invalid \`temperature\` value (must be 0.0-1.0)
- \`budget_tokens\` >= \`max_tokens\` in extended thinking
- Invalid tool definition schema

**Common mistake with extended thinking:**

\`\`\`
# Wrong: budget_tokens must be < max_tokens
thinking: budget_tokens=10000, max_tokens=1000  → Error!

# Correct
thinking: budget_tokens=10000, max_tokens=16000
\`\`\`

---

### 429 Rate Limited

**Causes:**

- Exceeded requests per minute (RPM)
- Exceeded tokens per minute (TPM)
- Exceeded tokens per day (TPD)

**Headers to check:**

- \`retry-after\`: Seconds to wait before retrying
- \`x-ratelimit-limit-*\`: Your limits
- \`x-ratelimit-remaining-*\`: Remaining quota

**Fix:** The Anthropic SDKs automatically retry 429 and 5xx errors with exponential backoff (default: \`max_retries=2\`). For custom retry behavior, see the language-specific error handling examples.

---

### 500 Internal Server Error

**Causes:**

- Temporary Anthropic service issue
- Bug in API processing

**Fix:** Retry with exponential backoff. If persistent, check [status.anthropic.com](https://status.anthropic.com).

---

### 529 Overloaded

**Causes:**

- High API demand
- Service capacity reached

**Fix:** Retry with exponential backoff. Consider using a different model (Haiku is often less loaded), spreading requests over time, or implementing request queuing.

---

## Common Mistakes and Fixes

| Mistake                         | Error            | Fix                                                     |
| ------------------------------- | ---------------- | ------------------------------------------------------- |
| \`budget_tokens\` >= \`max_tokens\` | 400              | Ensure \`budget_tokens\` < \`max_tokens\`                   |
| Typo in model ID                | 404              | Use valid model ID like \`claude-opus-4-6\`               |
| First message is \`assistant\`    | 400              | First message must be \`user\`                            |
| Consecutive same-role messages  | 400              | Alternate \`user\` and \`assistant\`                        |
| API key in code                 | 401 (leaked key) | Use environment variable                                |
| Custom retry needs              | 429/5xx          | SDK retries automatically; customize with \`max_retries\` |

## Typed Exceptions in SDKs

**Always use the SDK's typed exception classes** instead of checking error messages with string matching. Each HTTP error code maps to a specific exception class:

| HTTP Code | TypeScript Class                  | Python Class                      |
| --------- | --------------------------------- | --------------------------------- |
| 400       | \`Anthropic.BadRequestError\`       | \`anthropic.BadRequestError\`       |
| 401       | \`Anthropic.AuthenticationError\`   | \`anthropic.AuthenticationError\`   |
| 403       | \`Anthropic.PermissionDeniedError\` | \`anthropic.PermissionDeniedError\` |
| 404       | \`Anthropic.NotFoundError\`         | \`anthropic.NotFoundError\`         |
| 429       | \`Anthropic.RateLimitError\`        | \`anthropic.RateLimitError\`        |
| 500+      | \`Anthropic.InternalServerError\`   | \`anthropic.InternalServerError\`   |
| Any       | \`Anthropic.APIError\`              | \`anthropic.APIError\`              |

\`\`\`typescript
// Correct: use typed exceptions
try {
  const response = await client.messages.create({...});
} catch (error) {
  if (error instanceof Anthropic.RateLimitError) {
    // Handle rate limiting
  } else if (error instanceof Anthropic.APIError) {
    console.error(\`API error \${error.status}:\`, error.message);
  }
}

// Wrong: don't check error messages with string matching
try {
  const response = await client.messages.create({...});
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("429") || msg.includes("rate_limit")) { ... }
}
\`\`\`

All exception classes extend \`Anthropic.APIError\`, which has a \`status\` property. Use \`instanceof\` checks from most specific to least specific (e.g., check \`RateLimitError\` before \`APIError\`).

---

# Live Documentation Sources

This file contains WebFetch URLs for fetching current information from platform.claude.com and Agent SDK repositories. Use these when users need the latest data that may have changed since the cached content was last updated.

## When to Use WebFetch

- User explicitly asks for "latest" or "current" information
- Cached data seems incorrect
- User asks about features not covered in cached content
- User needs specific API details or examples

## Claude API Documentation URLs

### Models & Pricing

| Topic           | URL                                                                   | Extraction Prompt                                                               |
| --------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Models Overview | \`https://platform.claude.com/docs/en/about-claude/models/overview.md\` | "Extract current model IDs, context windows, and pricing for all Claude models" |
| Pricing         | \`https://platform.claude.com/docs/en/pricing.md\`                      | "Extract current pricing per million tokens for input and output"               |

### Core Features

| Topic             | URL                                                                          | Extraction Prompt                                                                      |
| ----------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Extended Thinking | \`https://platform.claude.com/docs/en/build-with-claude/extended-thinking.md\` | "Extract extended thinking parameters, budget_tokens requirements, and usage examples" |
| Adaptive Thinking | \`https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking.md\` | "Extract adaptive thinking setup, effort levels, and Claude Opus 4.6 usage examples"         |
| Effort Parameter  | \`https://platform.claude.com/docs/en/build-with-claude/effort.md\`            | "Extract effort levels, cost-quality tradeoffs, and interaction with thinking"        |
| Tool Use          | \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview.md\`  | "Extract tool definition schema, tool_choice options, and handling tool results"       |
| Streaming         | \`https://platform.claude.com/docs/en/build-with-claude/streaming.md\`         | "Extract streaming event types, SDK examples, and best practices"                      |
| Prompt Caching    | \`https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md\`    | "Extract cache_control usage, pricing benefits, and implementation examples"           |

### Media & Files

| Topic       | URL                                                                    | Extraction Prompt                                                 |
| ----------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Vision      | \`https://platform.claude.com/docs/en/build-with-claude/vision.md\`      | "Extract supported image formats, size limits, and code examples" |
| PDF Support | \`https://platform.claude.com/docs/en/build-with-claude/pdf-support.md\` | "Extract PDF handling capabilities, limits, and examples"         |

### API Operations

| Topic            | URL                                                                         | Extraction Prompt                                                                                       |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Batch Processing | \`https://platform.claude.com/docs/en/build-with-claude/batch-processing.md\` | "Extract batch API endpoints, request format, and polling for results"                                  |
| Files API        | \`https://platform.claude.com/docs/en/build-with-claude/files.md\`            | "Extract file upload, download, and referencing in messages, including supported types and beta header" |
| Token Counting   | \`https://platform.claude.com/docs/en/build-with-claude/token-counting.md\`   | "Extract token counting API usage and examples"                                                         |
| Rate Limits      | \`https://platform.claude.com/docs/en/api/rate-limits.md\`                    | "Extract current rate limits by tier and model"                                                         |
| Errors           | \`https://platform.claude.com/docs/en/api/errors.md\`                         | "Extract HTTP error codes, meanings, and retry guidance"                                                |

### Tools

| Topic          | URL                                                                                    | Extraction Prompt                                                                        |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Code Execution | \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool.md\` | "Extract code execution tool setup, file upload, container reuse, and response handling" |
| Computer Use   | \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use.md\`        | "Extract computer use tool setup, capabilities, and implementation examples"             |

### Advanced Features

| Topic              | URL                                                                           | Extraction Prompt                                   |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Structured Outputs | \`https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md\` | "Extract output_config.format usage and schema enforcement"                           |
| Compaction         | \`https://platform.claude.com/docs/en/build-with-claude/compaction.md\`         | "Extract compaction setup, trigger config, and streaming with compaction"             |
| Citations          | \`https://platform.claude.com/docs/en/build-with-claude/citations.md\`          | "Extract citation format and implementation"        |
| Context Windows    | \`https://platform.claude.com/docs/en/build-with-claude/context-windows.md\`    | "Extract context window sizes and token management" |

---

## Claude API SDK Repositories

| SDK        | URL                                                       | Description                    |
| ---------- | --------------------------------------------------------- | ------------------------------ |
| Python     | \`https://github.com/anthropics/anthropic-sdk-python\`     | \`anthropic\` pip package source |
| TypeScript | \`https://github.com/anthropics/anthropic-sdk-typescript\` | \`@anthropic-ai/sdk\` npm source |
| Java       | \`https://github.com/anthropics/anthropic-sdk-java\`       | \`anthropic-java\` Maven source  |
| Go         | \`https://github.com/anthropics/anthropic-sdk-go\`         | Go module source               |
| Ruby       | \`https://github.com/anthropics/anthropic-sdk-ruby\`       | \`anthropic\` gem source         |
| C#         | \`https://github.com/anthropics/anthropic-sdk-csharp\`     | NuGet package source           |
| PHP        | \`https://github.com/anthropics/anthropic-sdk-php\`        | Composer package source        |

---

## Agent SDK Documentation URLs

### Core Documentation

| Topic                | URL                                                         | Extraction Prompt                                               |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Agent SDK Overview   | \`https://platform.claude.com/docs/en/agent-sdk.md\`          | "Extract the Agent SDK overview, key features, and use cases"   |
| Agent SDK Python     | \`https://github.com/anthropics/claude-agent-sdk-python\`     | "Extract Python SDK installation, imports, and basic usage"     |
| Agent SDK TypeScript | \`https://github.com/anthropics/claude-agent-sdk-typescript\` | "Extract TypeScript SDK installation, imports, and basic usage" |

### SDK Reference (GitHub READMEs)

| Topic          | URL                                                                                       | Extraction Prompt                                            |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Python SDK     | \`https://raw.githubusercontent.com/anthropics/claude-agent-sdk-python/main/README.md\`     | "Extract Python SDK API reference, classes, and methods"     |
| TypeScript SDK | \`https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/main/README.md\` | "Extract TypeScript SDK API reference, types, and functions" |

### npm/PyPI Packages

| Package                             | URL                                                            | Description               |
| ----------------------------------- | -------------------------------------------------------------- | ------------------------- |
| claude-agent-sdk (Python)           | \`https://pypi.org/project/claude-agent-sdk/\`                   | Python package on PyPI    |
| @anthropic-ai/claude-agent-sdk (TS) | \`https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk\` | TypeScript package on npm |

### GitHub Repositories

| Resource       | URL                                                         | Description                         |
| -------------- | ----------------------------------------------------------- | ----------------------------------- |
| Python SDK     | \`https://github.com/anthropics/claude-agent-sdk-python\`     | Python package source               |
| TypeScript SDK | \`https://github.com/anthropics/claude-agent-sdk-typescript\` | TypeScript/Node.js package source   |
| MCP Servers    | \`https://github.com/modelcontextprotocol\`                   | Official MCP server implementations |

---

## Fallback Strategy

If WebFetch fails (network issues, URL changed):

1. Use cached content from the language-specific files (note the cache date)
2. Inform user the data may be outdated
3. Suggest they check platform.claude.com or the GitHub repos directly

---

# Claude Model Catalog

**Only use exact model IDs listed in this file.** Never guess or construct model IDs — incorrect IDs will cause API errors. Use aliases wherever available. For the latest information, WebFetch the Models Overview URL in \`shared/live-sources.md\`, or query the Models API directly (see Programmatic Model Discovery below).

## Programmatic Model Discovery

For **live** capability data — context window, max output tokens, feature support (thinking, vision, effort, structured outputs, etc.) — query the Models API instead of relying on the cached tables below. Use this when the user asks "what's the context window for X", "does model X support vision/thinking/effort", "which models support feature Y", or wants to select a model by capability at runtime.

\`\`\`python
m = client.models.retrieve("claude-opus-4-6")
m.id                 # "claude-opus-4-6"
m.display_name       # "Claude Opus 4.6"
m.max_input_tokens   # context window (int)
m.max_tokens         # max output tokens (int)

# capabilities is an untyped nested dict — bracket access, check ["supported"] at the leaf
caps = m.capabilities
caps["image_input"]["supported"]                       # vision
caps["thinking"]["types"]["adaptive"]["supported"]     # adaptive thinking
caps["effort"]["max"]["supported"]                     # effort: max (also low/medium/high)
caps["structured_outputs"]["supported"]
caps["context_management"]["compact_20260112"]["supported"]

# filter across all models — iterate the page object directly (auto-paginates); do NOT use .data
[m for m in client.models.list()
 if m.capabilities["thinking"]["types"]["adaptive"]["supported"]
 and m.max_input_tokens >= 200_000]
\`\`\`

Top-level fields (\`id\`, \`display_name\`, \`max_input_tokens\`, \`max_tokens\`) are typed attributes. \`capabilities\` is a dict — use bracket access, not attribute access. The API returns the full capability tree for every model with \`supported: true/false\` at each leaf, so bracket chains are safe without \`.get()\` guards. TypeScript SDK: same method names, also auto-paginates on iteration.

### Raw HTTP

\`\`\`bash
curl https://api.anthropic.com/v1/models/claude-opus-4-6 \\
  -H "x-api-key: \$ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01"
\`\`\`

\`\`\`json
{
  "id": "claude-opus-4-6",
  "display_name": "Claude Opus 4.6",
  "max_input_tokens": 1000000,
  "max_tokens": 128000,
  "capabilities": {
    "image_input": {"supported": true},
    "structured_outputs": {"supported": true},
    "thinking": {"supported": true, "types": {"enabled": {"supported": true}, "adaptive": {"supported": true}}},
    "effort": {"supported": true, "low": {"supported": true}, …, "max": {"supported": true}},
    …
  }
}
\`\`\`

## Current Models (recommended)

| Friendly Name     | Alias (use this)    | Full ID                       | Context        | Max Output | Status |
|-------------------|---------------------|-------------------------------|----------------|------------|--------|
| Claude Opus 4.6   | \`claude-opus-4-6\`   | —                             | 200K (1M beta) | 128K       | Active |
| Claude Sonnet 4.6 | \`claude-sonnet-4-6\` | -                             | 200K (1M beta) | 64K        | Active |
| Claude Haiku 4.5  | \`claude-haiku-4-5\`  | \`claude-haiku-4-5-20251001\`   | 200K           | 64K        | Active |

### Model Descriptions

- **Claude Opus 4.6** — Our most intelligent model for building agents and coding. Supports adaptive thinking (recommended), 128K max output tokens (requires streaming for large outputs). 1M context window available in beta via \`context-1m-2025-08-07\` header.
- **Claude Sonnet 4.6** — Our best combination of speed and intelligence. Supports adaptive thinking (recommended). 1M context window available in beta via \`context-1m-2025-08-07\` header. 64K max output tokens.
- **Claude Haiku 4.5** — Fastest and most cost-effective model for simple tasks.

## Legacy Models (still active)

| Friendly Name     | Alias (use this)    | Full ID                       | Status |
|-------------------|---------------------|-------------------------------|--------|
| Claude Opus 4.5   | \`claude-opus-4-5\`   | \`claude-opus-4-5-20251101\`    | Active |
| Claude Opus 4.1   | \`claude-opus-4-1\`   | \`claude-opus-4-1-20250805\`    | Active |
| Claude Sonnet 4.5 | \`claude-sonnet-4-5\` | \`claude-sonnet-4-5-20250929\`  | Active |
| Claude Sonnet 4   | \`claude-sonnet-4-0\` | \`claude-sonnet-4-20250514\`    | Active |
| Claude Opus 4     | \`claude-opus-4-0\`   | \`claude-opus-4-20250514\`      | Active |

## Deprecated Models (retiring soon)

| Friendly Name     | Alias (use this)    | Full ID                       | Status     | Retires      |
|-------------------|---------------------|-------------------------------|------------|--------------|
| Claude Haiku 3    | —                   | \`claude-3-haiku-20240307\`     | Deprecated | Apr 19, 2026 |

## Retired Models (no longer available)

| Friendly Name     | Full ID                       | Retired     |
|-------------------|-------------------------------|-------------|
| Claude Sonnet 3.7 | \`claude-3-7-sonnet-20250219\`  | Feb 19, 2026 |
| Claude Haiku 3.5  | \`claude-3-5-haiku-20241022\`   | Feb 19, 2026 |
| Claude Opus 3     | \`claude-3-opus-20240229\`      | Jan 5, 2026 |
| Claude Sonnet 3.5 | \`claude-3-5-sonnet-20241022\`  | Oct 28, 2025 |
| Claude Sonnet 3.5 | \`claude-3-5-sonnet-20240620\`  | Oct 28, 2025 |
| Claude Sonnet 3   | \`claude-3-sonnet-20240229\`    | Jul 21, 2025 |
| Claude 2.1        | \`claude-2.1\`                  | Jul 21, 2025 |
| Claude 2.0        | \`claude-2.0\`                  | Jul 21, 2025 |

## Resolving User Requests

When a user asks for a model by name, use this table to find the correct model ID:

| User says...                              | Use this model ID              |
|-------------------------------------------|--------------------------------|
| "opus", "most powerful"                   | \`claude-opus-4-6\`              |
| "opus 4.6"                                | \`claude-opus-4-6\`              |
| "opus 4.5"                                | \`claude-opus-4-5\`              |
| "opus 4.1"                                | \`claude-opus-4-1\`              |
| "opus 4", "opus 4.0"                      | \`claude-opus-4-0\`              |
| "sonnet", "balanced"                      | \`claude-sonnet-4-6\`            |
| "sonnet 4.6"                              | \`claude-sonnet-4-6\`            |
| "sonnet 4.5"                              | \`claude-sonnet-4-5\`            |
| "sonnet 4", "sonnet 4.0"                  | \`claude-sonnet-4-0\`            |
| "sonnet 3.7"                              | Retired — suggest \`claude-sonnet-4-5\` |
| "sonnet 3.5"                              | Retired — suggest \`claude-sonnet-4-5\` |
| "haiku", "fast", "cheap"                  | \`claude-haiku-4-5\`             |
| "haiku 4.5"                               | \`claude-haiku-4-5\`             |
| "haiku 3.5"                               | Retired — suggest \`claude-haiku-4-5\` |
| "haiku 3"                                 | Deprecated — suggest \`claude-haiku-4-5\` |

---

# Prompt Caching — Design & Optimization

This file covers how to design prompt-building code for effective caching. For language-specific syntax, see the \`## Prompt Caching\` section in each language's README or single-file doc.

## The one invariant everything follows from

**Prompt caching is a prefix match. Any change anywhere in the prefix invalidates everything after it.**

The cache key is derived from the exact bytes of the rendered prompt up to each \`cache_control\` breakpoint. A single byte difference at position N — a timestamp, a reordered JSON key, a different tool in the list — invalidates the cache for all breakpoints at positions >= N.

Render order is: \`tools\` → \`system\` → \`messages\`. A breakpoint on the last system block caches both tools and system together.

Design the prompt-building path around this constraint. Get the ordering right and most caching works for free. Get it wrong and no amount of \`cache_control\` markers will help.

---

## Workflow for optimizing existing code

When asked to add or optimize caching:

1. **Trace the prompt assembly path.** Find where \`system\`, \`tools\`, and \`messages\` are constructed. Identify every input that flows into them.
2. **Classify each input by stability:**
   - Never changes → belongs early in the prompt, before any breakpoint
   - Changes per-session → belongs after the global prefix, cache per-session
   - Changes per-turn → belongs at the end, after the last breakpoint
   - Changes per-request (timestamps, UUIDs, random IDs) → **eliminate or move to the very end**
3. **Check rendered order matches stability order.** Stable content must physically precede volatile content. If a timestamp is interpolated into the system prompt header, everything after it is uncacheable regardless of markers.
4. **Place breakpoints at stability boundaries.** See placement patterns below.
5. **Audit for silent invalidators.** See anti-patterns table.

---

## Placement patterns

### Large system prompt shared across many requests

Put a breakpoint on the last system text block. If there are tools, they render before system — the marker on the last system block caches tools + system together.

\`\`\`json
"system": [
  {"type": "text", "text": "<large shared prompt>", "cache_control": {"type": "ephemeral"}}
]
\`\`\`

### Multi-turn conversations

Put a breakpoint on the last content block of the most-recently-appended turn. Each subsequent request reuses the entire prior conversation prefix. Earlier breakpoints remain valid read points, so hits accrue incrementally as the conversation grows.

\`\`\`json
// Last content block of the last user turn
messages[-1].content[-1].cache_control = {"type": "ephemeral"}
\`\`\`

### Shared prefix, varying suffix

Many requests share a large fixed preamble (few-shot examples, retrieved docs, instructions) but differ in the final question. Put the breakpoint at the end of the **shared** portion, not at the end of the whole prompt — otherwise every request writes a distinct cache entry and nothing is ever read.

\`\`\`json
"messages": [{"role": "user", "content": [
  {"type": "text", "text": "<shared context>", "cache_control": {"type": "ephemeral"}},
  {"type": "text", "text": "<varying question>"}  // no marker — differs every time
]}]
\`\`\`

### Prompts that change from the beginning every time

Don't cache. If the first 1K tokens differ per request, there is no reusable prefix. Adding \`cache_control\` only pays the cache-write premium with zero reads. Leave it off.

---

## Architectural guidance

These are the decisions that matter more than marker placement. Fix these first.

**Keep the system prompt frozen.** Don't interpolate "current date: X", "mode: Y", "user name: Z" into the system prompt — those sit at the front of the prefix and invalidate everything downstream. Inject dynamic context as a user or assistant message later in \`messages\`. A message at turn 5 invalidates nothing before turn 5.

**Don't change tools or model mid-conversation.** Tools render at position 0; adding, removing, or reordering a tool invalidates the entire cache. Same for switching models (caches are model-scoped). If you need "modes", don't swap the tool set — give Claude a tool that records the mode transition, or pass the mode as message content. Serialize tools deterministically (sort by name).

**Fork operations must reuse the parent's exact prefix.** Side computations (summarization, compaction, sub-agents) often spin up a separate API call. If the fork rebuilds \`system\` / \`tools\` / \`model\` with any difference, it misses the parent's cache entirely. Copy the parent's \`system\`, \`tools\`, and \`model\` verbatim, then append fork-specific content at the end.

---

## Silent invalidators

When reviewing code, grep for these inside anything that feeds the prompt prefix:

| Pattern | Why it breaks caching |
|---|---|
| \`datetime.now()\` / \`Date.now()\` / \`time.time()\` in system prompt | Prefix changes every request |
| \`uuid4()\` / \`crypto.randomUUID()\` / request IDs early in content | Same — every request is unique |
| \`json.dumps(d)\` without \`sort_keys=True\` / iterating a \`set\` | Non-deterministic serialization → prefix bytes differ |
| f-string interpolating session/user ID into system prompt | Per-user prefix; no cross-user sharing |
| Conditional system sections (\`if flag: system += ...\`) | Every flag combination is a distinct prefix |
| \`tools=build_tools(user)\` where set varies per user | Tools render at position 0; nothing caches across users |

Fix by moving the dynamic piece after the last breakpoint, making it deterministic, or deleting it if it's not load-bearing.

---

## API reference

\`\`\`json
"cache_control": {"type": "ephemeral"}              // 5-minute TTL (default)
"cache_control": {"type": "ephemeral", "ttl": "1h"} // 1-hour TTL
\`\`\`

- Max **4** \`cache_control\` breakpoints per request.
- Goes on any content block: system text blocks, tool definitions, message content blocks (\`text\`, \`image\`, \`tool_use\`, \`tool_result\`, \`document\`).
- Top-level \`cache_control\` on \`messages.create()\` auto-places on the last cacheable block — simplest option when you don't need fine-grained placement.
- Minimum cacheable prefix is model-dependent (typically 1024-2048 tokens). Shorter prefixes silently won't cache even with a marker.

**Economics:** Cache writes cost ~1.25x base input price; reads cost ~0.1x. A prefix must be used in at least two requests within TTL to break even (one writes the cache, subsequent ones read it). For bursty traffic, the 1-hour TTL keeps entries alive across gaps.

---

## Verifying cache hits

The response \`usage\` object reports cache activity:

| Field | Meaning |
|---|---|
| \`cache_creation_input_tokens\` | Tokens written to cache this request (you paid the ~1.25x write premium) |
| \`cache_read_input_tokens\` | Tokens served from cache this request (you paid ~0.1x) |
| \`input_tokens\` | Tokens processed at full price (not cached) |

If \`cache_read_input_tokens\` is zero across repeated requests with identical prefixes, a silent invalidator is at work — diff the rendered prompt bytes between two requests to find it.

Language-specific access: \`response.usage.cache_read_input_tokens\` (Python/TS/Ruby), \`\$message->usage->cacheReadInputTokens\` (PHP), \`resp.Usage.CacheReadInputTokens\` (Go/C#), \`.usage().cacheReadInputTokens()\` (Java).

---

# Tool Use Concepts

This file covers the conceptual foundations of tool use with the Claude API. For language-specific code examples, see the \`python/\`, \`typescript/\`, or other language folders.

## User-Defined Tools

### Tool Definition Structure

> **Note:** When using the Tool Runner (beta), tool schemas are generated automatically from your function signatures (Python), Zod schemas (TypeScript), annotated classes (Java), \`jsonschema\` struct tags (Go), or \`BaseTool\` subclasses (Ruby). The raw JSON schema format below is for the manual approach — including PHP's \`BetaRunnableTool\`, which wraps a run closure around a hand-written schema — or SDKs without tool runner support.

Each tool requires a name, description, and JSON Schema for its inputs:

\`\`\`json
{
  "name": "get_weather",
  "description": "Get current weather for a location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City and state, e.g., San Francisco, CA"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"],
        "description": "Temperature unit"
      }
    },
    "required": ["location"]
  }
}
\`\`\`

**Best practices for tool definitions:**

- Use clear, descriptive names (e.g., \`get_weather\`, \`search_database\`, \`send_email\`)
- Write detailed descriptions — Claude uses these to decide when to use the tool
- Include descriptions for each property
- Use \`enum\` for parameters with a fixed set of values
- Mark truly required parameters in \`required\`; make others optional with defaults

---

### Tool Choice Options

Control when Claude uses tools:

| Value                             | Behavior                                      |
| --------------------------------- | --------------------------------------------- |
| \`{"type": "auto"}\`                | Claude decides whether to use tools (default) |
| \`{"type": "any"}\`                 | Claude must use at least one tool             |
| \`{"type": "tool", "name": "..."}\` | Claude must use the specified tool            |
| \`{"type": "none"}\`                | Claude cannot use tools                       |

Any \`tool_choice\` value can also include \`"disable_parallel_tool_use": true\` to force Claude to use at most one tool per response. By default, Claude may request multiple tool calls in a single response.

---

### Tool Runner vs Manual Loop

**Tool Runner (Recommended):** The SDK's tool runner handles the agentic loop automatically — it calls the API, detects tool use requests, executes your tool functions, feeds results back to Claude, and repeats until Claude stops calling tools. Available in Python, TypeScript, Java, Go, Ruby, and PHP SDKs (beta). The Python SDK also provides MCP conversion helpers (\`anthropic.lib.tools.mcp\`) to convert MCP tools, prompts, and resources for use with the tool runner — see \`python/claude-api/tool-use.md\` for details.

**Manual Agentic Loop:** Use when you need fine-grained control over the loop (e.g., custom logging, conditional tool execution, human-in-the-loop approval). Loop until \`stop_reason == "end_turn"\`, always append the full \`response.content\` to preserve tool_use blocks, and ensure each \`tool_result\` includes the matching \`tool_use_id\`.

**Stop reasons for server-side tools:** When using server-side tools (code execution, web search, etc.), the API runs a server-side sampling loop. If this loop reaches its default limit of 10 iterations, the response will have \`stop_reason: "pause_turn"\`. To continue, re-send the user message and assistant response and make another API request — the server will resume where it left off. Do NOT add an extra user message like "Continue." — the API detects the trailing \`server_tool_use\` block and knows to resume automatically.

\`\`\`python
# Handle pause_turn in your agentic loop
if response.stop_reason == "pause_turn":
    messages = [
        {"role": "user", "content": user_query},
        {"role": "assistant", "content": response.content},
    ]
    # Make another API request — server resumes automatically
    response = client.messages.create(
        model="claude-opus-4-6", messages=messages, tools=tools
    )
\`\`\`

Set a \`max_continuations\` limit (e.g., 5) to prevent infinite loops. For the full guide, see: \`https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons\`

> **Security:** The tool runner executes your tool functions automatically whenever Claude requests them. For tools with side effects (sending emails, modifying databases, financial transactions), validate inputs within your tool functions and consider requiring confirmation for destructive operations. Use the manual agentic loop if you need human-in-the-loop approval before each tool execution.

---

### Handling Tool Results

When Claude uses a tool, the response contains a \`tool_use\` block. You must:

1. Execute the tool with the provided input
2. Send the result back in a \`tool_result\` message
3. Continue the conversation

**Error handling in tool results:** When a tool execution fails, set \`"is_error": true\` and provide an informative error message. Claude will typically acknowledge the error and either try a different approach or ask for clarification.

**Multiple tool calls:** Claude can request multiple tools in a single response. Handle them all before continuing — send all results back in a single \`user\` message.

---

## Server-Side Tools: Code Execution

The code execution tool lets Claude run code in a secure, sandboxed container. Unlike user-defined tools, server-side tools run on Anthropic's infrastructure — you don't execute anything client-side. Just include the tool definition and Claude handles the rest.

### Key Facts

- Runs in an isolated container (1 CPU, 5 GiB RAM, 5 GiB disk)
- No internet access (fully sandboxed)
- Python 3.11 with data science libraries pre-installed
- Containers persist for 30 days and can be reused across requests
- Free when used with web search/web fetch tools; otherwise \$0.05/hour after 1,550 free hours/month per organization

### Tool Definition

The tool requires no schema — just declare it in the \`tools\` array:

\`\`\`json
{
  "type": "code_execution_20260120",
  "name": "code_execution"
}
\`\`\`

Claude automatically gains access to \`bash_code_execution\` (run shell commands) and \`text_editor_code_execution\` (create/view/edit files).

### Pre-installed Python Libraries

- **Data science**: pandas, numpy, scipy, scikit-learn, statsmodels
- **Visualization**: matplotlib, seaborn
- **File processing**: openpyxl, xlsxwriter, pillow, pypdf, pdfplumber, python-docx, python-pptx
- **Math**: sympy, mpmath
- **Utilities**: tqdm, python-dateutil, pytz, sqlite3

Additional packages can be installed at runtime via \`pip install\`.

### Supported File Types for Upload

| Type   | Extensions                         |
| ------ | ---------------------------------- |
| Data   | CSV, Excel (.xlsx/.xls), JSON, XML |
| Images | JPEG, PNG, GIF, WebP               |
| Text   | .txt, .md, .py, .js, etc.          |

### Container Reuse

Reuse containers across requests to maintain state (files, installed packages, variables). Extract the \`container_id\` from the first response and pass it to subsequent requests.

### Response Structure

The response contains interleaved text and tool result blocks:

- \`text\` — Claude's explanation
- \`server_tool_use\` — What Claude is doing
- \`bash_code_execution_tool_result\` — Code execution output (check \`return_code\` for success/failure)
- \`text_editor_code_execution_tool_result\` — File operation results

> **Security:** Always sanitize filenames with \`os.path.basename()\` / \`path.basename()\` before writing downloaded files to disk to prevent path traversal attacks. Write files to a dedicated output directory.

---

## Server-Side Tools: Web Search and Web Fetch

Web search and web fetch let Claude search the web and retrieve page content. They run server-side — just include the tool definitions and Claude handles queries, fetching, and result processing automatically.

### Tool Definitions

\`\`\`json
[
  { "type": "web_search_20260209", "name": "web_search" },
  { "type": "web_fetch_20260209", "name": "web_fetch" }
]
\`\`\`

### Dynamic Filtering (Opus 4.6 / Sonnet 4.6)

The \`web_search_20260209\` and \`web_fetch_20260209\` versions support **dynamic filtering** — Claude writes and executes code to filter search results before they reach the context window, improving accuracy and token efficiency. Dynamic filtering is built into these tool versions and activates automatically; you do not need to separately declare the \`code_execution\` tool or pass any beta header.

\`\`\`json
{
  "tools": [
    { "type": "web_search_20260209", "name": "web_search" },
    { "type": "web_fetch_20260209", "name": "web_fetch" }
  ]
}
\`\`\`

Without dynamic filtering, the previous \`web_search_20250305\` version is also available.

> **Note:** Only include the standalone \`code_execution\` tool when your application needs code execution for its own purposes (data analysis, file processing, visualization) independent of web search. Including it alongside \`_20260209\` web tools creates a second execution environment that can confuse the model.

---

## Server-Side Tools: Programmatic Tool Calling

Programmatic tool calling lets Claude execute complex multi-tool workflows in code, keeping intermediate results out of the context window. Claude writes code that calls your tools directly, reducing token usage for multi-step operations.

For full documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling\`

---

## Server-Side Tools: Tool Search

The tool search tool lets Claude dynamically discover tools from large libraries without loading all definitions into the context window. Useful when you have many tools but only a few are relevant to any given query.

For full documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool\`

---

## Tool Use Examples

You can provide sample tool calls directly in your tool definitions to demonstrate usage patterns and reduce parameter errors. This helps Claude understand how to correctly format tool inputs, especially for tools with complex schemas.

For full documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use\`

---

## Server-Side Tools: Computer Use

Computer use lets Claude interact with a desktop environment (screenshots, mouse, keyboard). It can be Anthropic-hosted (server-side, like code execution) or self-hosted (you provide the environment and execute actions client-side).

For full documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/computer-use/overview\`

---

## Client-Side Tools: Memory

The memory tool enables Claude to store and retrieve information across conversations through a memory file directory. Claude can create, read, update, and delete files that persist between sessions.

### Key Facts

- Client-side tool — you control storage via your implementation
- Supports commands: \`view\`, \`create\`, \`str_replace\`, \`insert\`, \`delete\`, \`rename\`
- Operates on files in a \`/memories\` directory
- The Python, TypeScript, and Java SDKs provide helper classes/functions for implementing the memory backend

> **Security:** Never store API keys, passwords, tokens, or other secrets in memory files. Be cautious with personally identifiable information (PII) — check data privacy regulations (GDPR, CCPA) before persisting user data. The reference implementations have no built-in access control; in multi-user systems, implement per-user memory directories and authentication in your tool handlers.

For full implementation examples, use WebFetch:

- Docs: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool.md\`

---

## Structured Outputs

Structured outputs constrain Claude's responses to follow a specific JSON schema, guaranteeing valid, parseable output. This is not a separate tool — it enhances the Messages API response format and/or tool parameter validation.

Two features are available:

- **JSON outputs** (\`output_config.format\`): Control Claude's response format
- **Strict tool use** (\`strict: true\`): Guarantee valid tool parameter schemas

**Supported models:** Claude Opus 4.6, Claude Sonnet 4.6, and Claude Haiku 4.5. Legacy models (Claude Opus 4.5, Claude Opus 4.1) also support structured outputs.

> **Recommended:** Use \`client.messages.parse()\` which automatically validates responses against your schema. When using \`messages.create()\` directly, use \`output_config: {format: {...}}\`. The \`output_format\` convenience parameter is also accepted by some SDK methods (e.g., \`.parse()\`), but \`output_config.format\` is the canonical API-level parameter.

### JSON Schema Limitations

**Supported:**

- Basic types: object, array, string, integer, number, boolean, null
- \`enum\`, \`const\`, \`anyOf\`, \`allOf\`, \`\$ref\`/\`\$def\`
- String formats: \`date-time\`, \`time\`, \`date\`, \`duration\`, \`email\`, \`hostname\`, \`uri\`, \`ipv4\`, \`ipv6\`, \`uuid\`
- \`additionalProperties: false\` (required for all objects)

**Not supported:**

- Recursive schemas
- Numerical constraints (\`minimum\`, \`maximum\`, \`multipleOf\`)
- String constraints (\`minLength\`, \`maxLength\`)
- Complex array constraints
- \`additionalProperties\` set to anything other than \`false\`

The Python and TypeScript SDKs automatically handle unsupported constraints by removing them from the schema sent to the API and validating them client-side.

### Important Notes

- **First request latency**: New schemas incur a one-time compilation cost. Subsequent requests with the same schema use a 24-hour cache.
- **Refusals**: If Claude refuses for safety reasons (\`stop_reason: "refusal"\`), the output may not match your schema.
- **Token limits**: If \`stop_reason: "max_tokens"\`, output may be incomplete. Increase \`max_tokens\`.
- **Incompatible with**: Citations (returns 400 error), message prefilling.
- **Works with**: Batches API, streaming, token counting, extended thinking.

---

## Tips for Effective Tool Use

1. **Provide detailed descriptions**: Claude relies heavily on descriptions to understand when and how to use tools
2. **Use specific tool names**: \`get_current_weather\` is better than \`weather\`
3. **Validate inputs**: Always validate tool inputs before execution
4. **Handle errors gracefully**: Return informative error messages so Claude can adapt
5. **Limit tool count**: Too many tools can confuse the model — keep the set focused
6. **Test tool interactions**: Verify Claude uses tools correctly in various scenarios

For detailed tool use documentation, use WebFetch:

- URL: \`https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview\`
`,
  },
  {
    path: "skills/claude-api/skill.md",
    content: `---
name: claude-api
description: "Build apps with Claude API and Anthropic SDKs. Trigger when code imports anthropic SDK or user asks to use Claude API."
tags:
  - api
  - sdk
  - anthropic
  - claude
  - llm
  - ai
  - agent
---

# Building LLM-Powered Applications with Claude

This skill helps you build LLM-powered applications with Claude. Choose the right surface based on your needs, detect the project language, then read the relevant language-specific documentation.

## Defaults

Unless the user requests otherwise:

For the Claude model version, please use Claude Opus 4.6, which you can access via the exact model string \`claude-opus-4-6\`. Please default to using adaptive thinking (\`thinking: {type: "adaptive"}\`) for anything remotely complicated. And finally, please default to streaming for any request that may involve long input, long output, or high \`max_tokens\` — it prevents hitting request timeouts. Use the SDK's \`.get_final_message()\` / \`.finalMessage()\` helper to get the complete response if you don't need to handle individual stream events

---

## Language Detection

Before reading code examples, determine which language the user is working in:

1. **Look at project files** to infer the language:

   - \`*.py\`, \`requirements.txt\`, \`pyproject.toml\`, \`setup.py\`, \`Pipfile\` → **Python** — read from \`python/\`
   - \`*.ts\`, \`*.tsx\`, \`package.json\`, \`tsconfig.json\` → **TypeScript** — read from \`typescript/\`
   - \`*.js\`, \`*.jsx\` (no \`.ts\` files present) → **TypeScript** — JS uses the same SDK, read from \`typescript/\`
   - \`*.java\`, \`pom.xml\`, \`build.gradle\` → **Java** — read from \`java/\`
   - \`*.kt\`, \`*.kts\`, \`build.gradle.kts\` → **Java** — Kotlin uses the Java SDK, read from \`java/\`
   - \`*.scala\`, \`build.sbt\` → **Java** — Scala uses the Java SDK, read from \`java/\`
   - \`*.go\`, \`go.mod\` → **Go** — read from \`go/\`
   - \`*.rb\`, \`Gemfile\` → **Ruby** — read from \`ruby/\`
   - \`*.cs\`, \`*.csproj\` → **C#** — read from \`csharp/\`
   - \`*.php\`, \`composer.json\` → **PHP** — read from \`php/\`

2. **If multiple languages detected** (e.g., both Python and TypeScript files):

   - Check which language the user's current file or question relates to
   - If still ambiguous, ask: "I detected both Python and TypeScript files. Which language are you using for the Claude API integration?"

3. **If language can't be inferred** (empty project, no source files, or unsupported language):

   - Use AskUserQuestion with options: Python, TypeScript, Java, Go, Ruby, cURL/raw HTTP, C#, PHP
   - If AskUserQuestion is unavailable, default to Python examples and note: "Showing Python examples. Let me know if you need a different language."

4. **If unsupported language detected** (Rust, Swift, C++, Elixir, etc.):

   - Suggest cURL/raw HTTP examples from \`curl/\` and note that community SDKs may exist
   - Offer to show Python or TypeScript examples as reference implementations

5. **If user needs cURL/raw HTTP examples**, read from \`curl/\`.

### Language-Specific Feature Support

| Language   | Tool Runner | Agent SDK | Notes                                 |
| ---------- | ----------- | --------- | ------------------------------------- |
| Python     | Yes (beta)  | Yes       | Full support — \`@beta_tool\` decorator |
| TypeScript | Yes (beta)  | Yes       | Full support — \`betaZodTool\` + Zod    |
| Java       | Yes (beta)  | No        | Beta tool use with annotated classes  |
| Go         | Yes (beta)  | No        | \`BetaToolRunner\` in \`toolrunner\` pkg  |
| Ruby       | Yes (beta)  | No        | \`BaseTool\` + \`tool_runner\` in beta    |
| cURL       | N/A         | N/A       | Raw HTTP, no SDK features             |
| C#         | No          | No        | Official SDK                          |
| PHP        | Yes (beta)  | No        | \`BetaRunnableTool\` + \`toolRunner()\`   |

---

## Which Surface Should I Use?

> **Start simple.** Default to the simplest tier that meets your needs. Single API calls and workflows handle most use cases — only reach for agents when the task genuinely requires open-ended, model-driven exploration.

| Use Case                                        | Tier            | Recommended Surface       | Why                                     |
| ----------------------------------------------- | --------------- | ------------------------- | --------------------------------------- |
| Classification, summarization, extraction, Q&A  | Single LLM call | **Claude API**            | One request, one response               |
| Batch processing or embeddings                  | Single LLM call | **Claude API**            | Specialized endpoints                   |
| Multi-step pipelines with code-controlled logic | Workflow        | **Claude API + tool use** | You orchestrate the loop                |
| Custom agent with your own tools                | Agent           | **Claude API + tool use** | Maximum flexibility                     |
| AI agent with file/web/terminal access          | Agent           | **Agent SDK**             | Built-in tools, safety, and MCP support |
| Agentic coding assistant                        | Agent           | **Agent SDK**             | Designed for this use case              |
| Want built-in permissions and guardrails        | Agent           | **Agent SDK**             | Safety features included                |

> **Note:** The Agent SDK is for when you want built-in file/web/terminal tools, permissions, and MCP out of the box. If you want to build an agent with your own tools, Claude API is the right choice — use the tool runner for automatic loop handling, or the manual loop for fine-grained control (approval gates, custom logging, conditional execution).

### Decision Tree

\`\`\`
What does your application need?

1. Single LLM call (classification, summarization, extraction, Q&A)
   └── Claude API — one request, one response

2. Does Claude need to read/write files, browse the web, or run shell commands
   as part of its work? (Not: does your app read a file and hand it to Claude —
   does Claude itself need to discover and access files/web/shell?)
   └── Yes → Agent SDK — built-in tools, don't reimplement them
       Examples: "scan a codebase for bugs", "summarize every file in a directory",
                 "find bugs using subagents", "research a topic via web search"

3. Workflow (multi-step, code-orchestrated, with your own tools)
   └── Claude API with tool use — you control the loop

4. Open-ended agent (model decides its own trajectory, your own tools)
   └── Claude API agentic loop (maximum flexibility)
\`\`\`

### Should I Build an Agent?

Before choosing the agent tier, check all four criteria:

- **Complexity** — Is the task multi-step and hard to fully specify in advance? (e.g., "turn this design doc into a PR" vs. "extract the title from this PDF")
- **Value** — Does the outcome justify higher cost and latency?
- **Viability** — Is Claude capable at this task type?
- **Cost of error** — Can errors be caught and recovered from? (tests, review, rollback)

If the answer is "no" to any of these, stay at a simpler tier (single call or workflow).

---

## Architecture

Everything goes through \`POST /v1/messages\`. Tools and output constraints are features of this single endpoint — not separate APIs.

**User-defined tools** — You define tools (via decorators, Zod schemas, or raw JSON), and the SDK's tool runner handles calling the API, executing your functions, and looping until Claude is done. For full control, you can write the loop manually.

**Server-side tools** — Anthropic-hosted tools that run on Anthropic's infrastructure. Code execution is fully server-side (declare it in \`tools\`, Claude runs code automatically). Computer use can be server-hosted or self-hosted.

**Structured outputs** — Constrains the Messages API response format (\`output_config.format\`) and/or tool parameter validation (\`strict: true\`). The recommended approach is \`client.messages.parse()\` which validates responses against your schema automatically. Note: the old \`output_format\` parameter is deprecated; use \`output_config: {format: {...}}\` on \`messages.create()\`.

**Supporting endpoints** — Batches (\`POST /v1/messages/batches\`), Files (\`POST /v1/files\`), Token Counting, and Models (\`GET /v1/models\`, \`GET /v1/models/{id}\` — live capability/context-window discovery) feed into or support Messages API requests.

---

## Current Models (cached: 2026-02-17)

| Model             | Model ID            | Context        | Input \$/1M | Output \$/1M |
| ----------------- | ------------------- | -------------- | ---------- | ----------- |
| Claude Opus 4.6   | \`claude-opus-4-6\`   | 200K (1M beta) | \$5.00      | \$25.00      |
| Claude Sonnet 4.6 | \`claude-sonnet-4-6\` | 200K (1M beta) | \$3.00      | \$15.00      |
| Claude Haiku 4.5  | \`claude-haiku-4-5\`  | 200K           | \$1.00      | \$5.00       |

**ALWAYS use \`claude-opus-4-6\` unless the user explicitly names a different model.** This is non-negotiable. Do not use \`claude-sonnet-4-6\`, \`claude-sonnet-4-5\`, or any other model unless the user literally says "use sonnet" or "use haiku". Never downgrade for cost — that's the user's decision, not yours.

**CRITICAL: Use only the exact model ID strings from the table above — they are complete as-is. Do not append date suffixes.** For example, use \`claude-sonnet-4-5\`, never \`claude-sonnet-4-5-20250514\` or any other date-suffixed variant you might recall from training data. If the user requests an older model not in the table (e.g., "opus 4.5", "sonnet 3.7"), read \`shared/models.md\` for the exact ID — do not construct one yourself.

A note: if any of the model strings above look unfamiliar to you, that's to be expected — that just means they were released after your training data cutoff. Rest assured they are real models; we wouldn't mess with you like that.

**Live capability lookup:** The table above is cached. When the user asks "what's the context window for X", "does X support vision/thinking/effort", or "which models support Y", query the Models API (\`client.models.retrieve(id)\` / \`client.models.list()\`) — see \`shared/models.md\` for the field reference and capability-filter examples.

---

## Thinking & Effort (Quick Reference)

**Opus 4.6 — Adaptive thinking (recommended):** Use \`thinking: {type: "adaptive"}\`. Claude dynamically decides when and how much to think. No \`budget_tokens\` needed — \`budget_tokens\` is deprecated on Opus 4.6 and Sonnet 4.6 and must not be used. Adaptive thinking also automatically enables interleaved thinking (no beta header needed). **When the user asks for "extended thinking", a "thinking budget", or \`budget_tokens\`: always use Opus 4.6 with \`thinking: {type: "adaptive"}\`. The concept of a fixed token budget for thinking is deprecated — adaptive thinking replaces it. Do NOT use \`budget_tokens\` and do NOT switch to an older model.**

**Effort parameter (GA, no beta header):** Controls thinking depth and overall token spend via \`output_config: {effort: "low"|"medium"|"high"|"max"}\` (inside \`output_config\`, not top-level). Default is \`high\` (equivalent to omitting it). \`max\` is Opus 4.6 only. Works on Opus 4.5, Opus 4.6, and Sonnet 4.6. Will error on Sonnet 4.5 / Haiku 4.5. Combine with adaptive thinking for the best cost-quality tradeoffs. Use \`low\` for subagents or simple tasks; \`max\` for the deepest reasoning.

**Sonnet 4.6:** Supports adaptive thinking (\`thinking: {type: "adaptive"}\`). \`budget_tokens\` is deprecated on Sonnet 4.6 — use adaptive thinking instead.

**Older models (only if explicitly requested):** If the user specifically asks for Sonnet 4.5 or another older model, use \`thinking: {type: "enabled", budget_tokens: N}\`. \`budget_tokens\` must be less than \`max_tokens\` (minimum 1024). Never choose an older model just because the user mentions \`budget_tokens\` — use Opus 4.6 with adaptive thinking instead.

---

## Compaction (Quick Reference)

**Beta, Opus 4.6 and Sonnet 4.6.** For long-running conversations that may exceed the 200K context window, enable server-side compaction. The API automatically summarizes earlier context when it approaches the trigger threshold (default: 150K tokens). Requires beta header \`compact-2026-01-12\`.

**Critical:** Append \`response.content\` (not just the text) back to your messages on every turn. Compaction blocks in the response must be preserved — the API uses them to replace the compacted history on the next request. Extracting only the text string and appending that will silently lose the compaction state.

See \`{lang}/claude-api/README.md\` (Compaction section) for code examples. Full docs via WebFetch in \`shared/live-sources.md\`.

---

## Prompt Caching (Quick Reference)

**Prefix match.** Any byte change anywhere in the prefix invalidates everything after it. Render order is \`tools\` → \`system\` → \`messages\`. Keep stable content first (frozen system prompt, deterministic tool list), put volatile content (timestamps, per-request IDs, varying questions) after the last \`cache_control\` breakpoint.

**Top-level auto-caching** (\`cache_control: {type: "ephemeral"}\` on \`messages.create()\`) is the simplest option when you don't need fine-grained placement. Max 4 breakpoints per request. Minimum cacheable prefix is ~1024 tokens — shorter prefixes silently won't cache.

**Verify with \`usage.cache_read_input_tokens\`** — if it's zero across repeated requests, a silent invalidator is at work (\`datetime.now()\` in system prompt, unsorted JSON, varying tool set).

For placement patterns, architectural guidance, and the silent-invalidator audit checklist: read \`shared/prompt-caching.md\`. Language-specific syntax: \`{lang}/claude-api/README.md\` (Prompt Caching section).

---

## Reading Guide

After detecting the language, read the relevant files based on what the user needs:

### Quick Task Reference

**Single text classification/summarization/extraction/Q&A:**
→ Read only \`{lang}/claude-api/README.md\`

**Chat UI or real-time response display:**
→ Read \`{lang}/claude-api/README.md\` + \`{lang}/claude-api/streaming.md\`

**Long-running conversations (may exceed context window):**
→ Read \`{lang}/claude-api/README.md\` — see Compaction section

**Prompt caching / optimize caching / "why is my cache hit rate low":**
→ Read \`shared/prompt-caching.md\` + \`{lang}/claude-api/README.md\` (Prompt Caching section)

**Function calling / tool use / agents:**
→ Read \`{lang}/claude-api/README.md\` + \`shared/tool-use-concepts.md\` + \`{lang}/claude-api/tool-use.md\`

**Batch processing (non-latency-sensitive):**
→ Read \`{lang}/claude-api/README.md\` + \`{lang}/claude-api/batches.md\`

**File uploads across multiple requests:**
→ Read \`{lang}/claude-api/README.md\` + \`{lang}/claude-api/files-api.md\`

**Agent with built-in tools (file/web/terminal):**
→ Read \`{lang}/agent-sdk/README.md\` + \`{lang}/agent-sdk/patterns.md\`

### Claude API (Full File Reference)

Read the **language-specific Claude API folder** (\`{language}/claude-api/\`):

1. **\`{language}/claude-api/README.md\`** — **Read this first.** Installation, quick start, common patterns, error handling.
2. **\`shared/tool-use-concepts.md\`** — Read when the user needs function calling, code execution, memory, or structured outputs. Covers conceptual foundations.
3. **\`{language}/claude-api/tool-use.md\`** — Read for language-specific tool use code examples (tool runner, manual loop, code execution, memory, structured outputs).
4. **\`{language}/claude-api/streaming.md\`** — Read when building chat UIs or interfaces that display responses incrementally.
5. **\`{language}/claude-api/batches.md\`** — Read when processing many requests offline (not latency-sensitive). Runs asynchronously at 50% cost.
6. **\`{language}/claude-api/files-api.md\`** — Read when sending the same file across multiple requests without re-uploading.
7. **\`shared/prompt-caching.md\`** — Read when adding or optimizing prompt caching. Covers prefix-stability design, breakpoint placement, and anti-patterns that silently invalidate cache.
8. **\`shared/error-codes.md\`** — Read when debugging HTTP errors or implementing error handling.
9. **\`shared/live-sources.md\`** — WebFetch URLs for fetching the latest official documentation.

> **Note:** For Java, Go, Ruby, C#, PHP, and cURL — these have a single file each covering all basics. Read that file plus \`shared/tool-use-concepts.md\` and \`shared/error-codes.md\` as needed.

### Agent SDK

Read the **language-specific Agent SDK folder** (\`{language}/agent-sdk/\`). Agent SDK is available for **Python and TypeScript only**.

1. **\`{language}/agent-sdk/README.md\`** — Installation, quick start, built-in tools, permissions, MCP, hooks.
2. **\`{language}/agent-sdk/patterns.md\`** — Custom tools, hooks, subagents, MCP integration, session resumption.
3. **\`shared/live-sources.md\`** — WebFetch URLs for current Agent SDK docs.

---

## When to Use WebFetch

Use WebFetch to get the latest documentation when:

- User asks for "latest" or "current" information
- Cached data seems incorrect
- User asks about features not covered here

Live documentation URLs are in \`shared/live-sources.md\`.

## Common Pitfalls

- Don't truncate inputs when passing files or content to the API. If the content is too long to fit in the context window, notify the user and discuss options (chunking, summarization, etc.) rather than silently truncating.
- **Opus 4.6 / Sonnet 4.6 thinking:** Use \`thinking: {type: "adaptive"}\` — do NOT use \`budget_tokens\` (deprecated on both Opus 4.6 and Sonnet 4.6). For older models, \`budget_tokens\` must be less than \`max_tokens\` (minimum 1024). This will throw an error if you get it wrong.
- **Opus 4.6 prefill removed:** Assistant message prefills (last-assistant-turn prefills) return a 400 error on Opus 4.6. Use structured outputs (\`output_config.format\`) or system prompt instructions to control response format instead.
- **\`max_tokens\` defaults:** Don't lowball \`max_tokens\` — hitting the cap truncates output mid-thought and requires a retry. For non-streaming requests, default to \`~16000\` (keeps responses under SDK HTTP timeouts). For streaming requests, default to \`~64000\` (timeouts aren't a concern, so give the model room). Only go lower when you have a hard reason: classification (\`~256\`), cost caps, or deliberately short outputs.
- **128K output tokens:** Opus 4.6 supports up to 128K \`max_tokens\`, but the SDKs require streaming for values that large to avoid HTTP timeouts. Use \`.stream()\` with \`.get_final_message()\` / \`.finalMessage()\`.
- **Tool call JSON parsing (Opus 4.6):** Opus 4.6 may produce different JSON string escaping in tool call \`input\` fields (e.g., Unicode or forward-slash escaping). Always parse tool inputs with \`json.loads()\` / \`JSON.parse()\` — never do raw string matching on the serialized input.
- **Structured outputs (all models):** Use \`output_config: {format: {...}}\` instead of the deprecated \`output_format\` parameter on \`messages.create()\`. This is a general API change, not 4.6-specific.
- **Don't reimplement SDK functionality:** The SDK provides high-level helpers — use them instead of building from scratch. Specifically: use \`stream.finalMessage()\` instead of wrapping \`.on()\` events in \`new Promise()\`; use typed exception classes (\`Anthropic.RateLimitError\`, etc.) instead of string-matching error messages; use SDK types (\`Anthropic.MessageParam\`, \`Anthropic.Tool\`, \`Anthropic.Message\`, etc.) instead of redefining equivalent interfaces.
- **Don't define custom types for SDK data structures:** The SDK exports types for all API objects. Use \`Anthropic.MessageParam\` for messages, \`Anthropic.Tool\` for tool definitions, \`Anthropic.ToolUseBlock\` / \`Anthropic.ToolResultBlockParam\` for tool results, \`Anthropic.Message\` for responses. Defining your own \`interface ChatMessage { role: string; content: unknown }\` duplicates what the SDK already provides and loses type safety.
- **Report and document output:** For tasks that produce reports, documents, or visualizations, the code execution sandbox has \`python-docx\`, \`python-pptx\`, \`matplotlib\`, \`pillow\`, and \`pypdf\` pre-installed. Claude can generate formatted files (DOCX, PDF, charts) and return them via the Files API — consider this for "report" or "document" type requests instead of plain stdout text.
`,
  },
  {
    path: "skills/claude-api/tools.md",
    content: `# Claude API — Language-Specific Documentation Directories

The skill includes language-specific code examples and SDK documentation organized by directory. Read the appropriate directory based on the detected project language.

## Directory Structure

### Python (\`python/\`)

Full SDK support with Claude API and Agent SDK.

- \`python/claude-api/README.md\` — Installation, quick start, common patterns, error handling
- \`python/claude-api/tool-use.md\` — Tool runner, manual loop, code execution, memory, structured outputs
- \`python/claude-api/streaming.md\` — Streaming responses for chat UIs
- \`python/claude-api/batches.md\` — Batch processing (async, 50% cost)
- \`python/claude-api/files-api.md\` — File uploads across multiple requests
- \`python/agent-sdk/README.md\` — Agent SDK: installation, built-in tools, permissions, MCP, hooks
- \`python/agent-sdk/patterns.md\` — Agent SDK: custom tools, hooks, subagents, MCP integration, session resumption

### TypeScript (\`typescript/\`)

Full SDK support with Claude API and Agent SDK. Also used for JavaScript projects.

- \`typescript/claude-api/README.md\` — Installation, quick start, common patterns, error handling
- \`typescript/claude-api/tool-use.md\` — Tool runner (betaZodTool + Zod), manual loop, code execution, memory, structured outputs
- \`typescript/claude-api/streaming.md\` — Streaming responses for chat UIs
- \`typescript/claude-api/batches.md\` — Batch processing (async, 50% cost)
- \`typescript/claude-api/files-api.md\` — File uploads across multiple requests
- \`typescript/agent-sdk/README.md\` — Agent SDK: installation, built-in tools, permissions, MCP, hooks
- \`typescript/agent-sdk/patterns.md\` — Agent SDK: custom tools, hooks, subagents, MCP integration, session resumption

### Java (\`java/\`)

Single-file SDK documentation. Also used for Kotlin and Scala projects.

- \`java/claude-api.md\` — Full SDK coverage: installation, quick start, tool use, streaming, batches, files

### Go (\`go/\`)

Single-file SDK documentation.

- \`go/claude-api.md\` — Full SDK coverage: installation, quick start, tool use (BetaToolRunner), streaming, batches

### Ruby (\`ruby/\`)

Single-file SDK documentation.

- \`ruby/claude-api.md\` — Full SDK coverage: installation, quick start, tool use (BaseTool + tool_runner), streaming

### C# (\`csharp/\`)

Single-file SDK documentation.

- \`csharp/claude-api.md\` — Full SDK coverage: installation, quick start, streaming

### PHP (\`php/\`)

Single-file SDK documentation.

- \`php/claude-api.md\` — Full SDK coverage: installation, quick start, tool use (BetaRunnableTool + toolRunner())

### cURL (\`curl/\`)

Raw HTTP examples for unsupported languages or direct API access.

- \`curl/examples.md\` — cURL examples for all major API operations

### Shared (\`shared/\`)

Cross-language reference documentation.

- \`shared/tool-use-concepts.md\` — Conceptual foundations for tool use, code execution, memory, structured outputs
- \`shared/prompt-caching.md\` — Prefix-stability design, breakpoint placement, anti-patterns
- \`shared/error-codes.md\` — HTTP error codes, causes, fixes, typed SDK exceptions
- \`shared/models.md\` — Model catalog, IDs, capabilities, programmatic discovery via Models API
- \`shared/live-sources.md\` — WebFetch URLs for latest official documentation
`,
  },
  {
    path: "skills/doc-coauthoring/skill.md",
    content: `---
name: doc-coauthoring
description: "Structured co-authoring workflow for docs, proposals, specs, and decision documents."
tags:
  - documentation
  - writing
  - workflow
  - collaboration
  - technical-writing
---

# Doc Co-Authoring Workflow

This skill provides a structured workflow for guiding users through collaborative document creation. Act as an active guide, walking users through three stages: Context Gathering, Refinement & Structure, and Reader Testing.

## When to Offer This Workflow

**Trigger conditions:**
- User mentions writing documentation: "write a doc", "draft a proposal", "create a spec", "write up"
- User mentions specific doc types: "PRD", "design doc", "decision doc", "RFC"
- User seems to be starting a substantial writing task

**Initial offer:**
Offer the user a structured workflow for co-authoring the document. Explain the three stages:

1. **Context Gathering**: User provides all relevant context while Claude asks clarifying questions
2. **Refinement & Structure**: Iteratively build each section through brainstorming and editing
3. **Reader Testing**: Test the doc with a fresh Claude (no context) to catch blind spots before others read it

Explain that this approach helps ensure the doc works well when others read it (including when they paste it into Claude). Ask if they want to try this workflow or prefer to work freeform.

If user declines, work freeform. If user accepts, proceed to Stage 1.

## Stage 1: Context Gathering

**Goal:** Close the gap between what the user knows and what Claude knows, enabling smart guidance later.

### Initial Questions

Start by asking the user for meta-context about the document:

1. What type of document is this? (e.g., technical spec, decision doc, proposal)
2. Who's the primary audience?
3. What's the desired impact when someone reads this?
4. Is there a template or specific format to follow?
5. Any other constraints or context to know?

Inform them they can answer in shorthand or dump information however works best for them.

**If user provides a template or mentions a doc type:**
- Ask if they have a template document to share
- If they provide a link to a shared document, use the appropriate integration to fetch it
- If they provide a file, read it

**If user mentions editing an existing shared document:**
- Use the appropriate integration to read the current state
- Check for images without alt-text
- If images exist without alt-text, explain that when others use Claude to understand the doc, Claude won't be able to see them. Ask if they want alt-text generated. If so, request they paste each image into chat for descriptive alt-text generation.

### Info Dumping

Once initial questions are answered, encourage the user to dump all the context they have. Request information such as:
- Background on the project/problem
- Related team discussions or shared documents
- Why alternative solutions aren't being used
- Organizational context (team dynamics, past incidents, politics)
- Timeline pressures or constraints
- Technical architecture or dependencies
- Stakeholder concerns

Advise them not to worry about organizing it - just get it all out. Offer multiple ways to provide context:
- Info dump stream-of-consciousness
- Point to team channels or threads to read
- Link to shared documents

**If integrations are available** (e.g., Slack, Teams, Google Drive, SharePoint, or other MCP servers), mention that these can be used to pull in context directly.

**If no integrations are detected and in Claude.ai or Claude app:** Suggest they can enable connectors in their Claude settings to allow pulling context from messaging apps and document storage directly.

Inform them clarifying questions will be asked once they've done their initial dump.

**During context gathering:**

- If user mentions team channels or shared documents:
  - If integrations available: Inform them the content will be read now, then use the appropriate integration
  - If integrations not available: Explain lack of access. Suggest they enable connectors in Claude settings, or paste the relevant content directly.

- If user mentions entities/projects that are unknown:
  - Ask if connected tools should be searched to learn more
  - Wait for user confirmation before searching

- As user provides context, track what's being learned and what's still unclear

**Asking clarifying questions:**

When user signals they've done their initial dump (or after substantial context provided), ask clarifying questions to ensure understanding:

Generate 5-10 numbered questions based on gaps in the context.

Inform them they can use shorthand to answer (e.g., "1: yes, 2: see #channel, 3: no because backwards compat"), link to more docs, point to channels to read, or just keep info-dumping. Whatever's most efficient for them.

**Exit condition:**
Sufficient context has been gathered when questions show understanding - when edge cases and trade-offs can be asked about without needing basics explained.

**Transition:**
Ask if there's any more context they want to provide at this stage, or if it's time to move on to drafting the document.

If user wants to add more, let them. When ready, proceed to Stage 2.

## Stage 2: Refinement & Structure

**Goal:** Build the document section by section through brainstorming, curation, and iterative refinement.

**Instructions to user:**
Explain that the document will be built section by section. For each section:
1. Clarifying questions will be asked about what to include
2. 5-20 options will be brainstormed
3. User will indicate what to keep/remove/combine
4. The section will be drafted
5. It will be refined through surgical edits

Start with whichever section has the most unknowns (usually the core decision/proposal), then work through the rest.

**Section ordering:**

If the document structure is clear:
Ask which section they'd like to start with.

Suggest starting with whichever section has the most unknowns. For decision docs, that's usually the core proposal. For specs, it's typically the technical approach. Summary sections are best left for last.

If user doesn't know what sections they need:
Based on the type of document and template, suggest 3-5 sections appropriate for the doc type.

Ask if this structure works, or if they want to adjust it.

**Once structure is agreed:**

Create the initial document structure with placeholder text for all sections.

**If access to artifacts is available:**
Use \`create_file\` to create an artifact. This gives both Claude and the user a scaffold to work from.

Inform them that the initial structure with placeholders for all sections will be created.

Create artifact with all section headers and brief placeholder text like "[To be written]" or "[Content here]".

Provide the scaffold link and indicate it's time to fill in each section.

**If no access to artifacts:**
Create a markdown file in the working directory. Name it appropriately (e.g., \`decision-doc.md\`, \`technical-spec.md\`).

Inform them that the initial structure with placeholders for all sections will be created.

Create file with all section headers and placeholder text.

Confirm the filename has been created and indicate it's time to fill in each section.

**For each section:**

### Step 1: Clarifying Questions

Announce work will begin on the [SECTION NAME] section. Ask 5-10 clarifying questions about what should be included:

Generate 5-10 specific questions based on context and section purpose.

Inform them they can answer in shorthand or just indicate what's important to cover.

### Step 2: Brainstorming

For the [SECTION NAME] section, brainstorm [5-20] things that might be included, depending on the section's complexity. Look for:
- Context shared that might have been forgotten
- Angles or considerations not yet mentioned

Generate 5-20 numbered options based on section complexity. At the end, offer to brainstorm more if they want additional options.

### Step 3: Curation

Ask which points should be kept, removed, or combined. Request brief justifications to help learn priorities for the next sections.

Provide examples:
- "Keep 1,4,7,9"
- "Remove 3 (duplicates 1)"
- "Remove 6 (audience already knows this)"
- "Combine 11 and 12"

**If user gives freeform feedback** (e.g., "looks good" or "I like most of it but...") instead of numbered selections, extract their preferences and proceed. Parse what they want kept/removed/changed and apply it.

### Step 4: Gap Check

Based on what they've selected, ask if there's anything important missing for the [SECTION NAME] section.

### Step 5: Drafting

Use \`str_replace\` to replace the placeholder text for this section with the actual drafted content.

Announce the [SECTION NAME] section will be drafted now based on what they've selected.

**If using artifacts:**
After drafting, provide a link to the artifact.

Ask them to read through it and indicate what to change. Note that being specific helps learning for the next sections.

**If using a file (no artifacts):**
After drafting, confirm completion.

Inform them the [SECTION NAME] section has been drafted in [filename]. Ask them to read through it and indicate what to change. Note that being specific helps learning for the next sections.

**Key instruction for user (include when drafting the first section):**
Provide a note: Instead of editing the doc directly, ask them to indicate what to change. This helps learning of their style for future sections. For example: "Remove the X bullet - already covered by Y" or "Make the third paragraph more concise".

### Step 6: Iterative Refinement

As user provides feedback:
- Use \`str_replace\` to make edits (never reprint the whole doc)
- **If using artifacts:** Provide link to artifact after each edit
- **If using files:** Just confirm edits are complete
- If user edits doc directly and asks to read it: mentally note the changes they made and keep them in mind for future sections (this shows their preferences)

**Continue iterating** until user is satisfied with the section.

### Quality Checking

After 3 consecutive iterations with no substantial changes, ask if anything can be removed without losing important information.

When section is done, confirm [SECTION NAME] is complete. Ask if ready to move to the next section.

**Repeat for all sections.**

### Near Completion

As approaching completion (80%+ of sections done), announce intention to re-read the entire document and check for:
- Flow and consistency across sections
- Redundancy or contradictions
- Anything that feels like "slop" or generic filler
- Whether every sentence carries weight

Read entire document and provide feedback.

**When all sections are drafted and refined:**
Announce all sections are drafted. Indicate intention to review the complete document one more time.

Review for overall coherence, flow, completeness.

Provide any final suggestions.

Ask if ready to move to Reader Testing, or if they want to refine anything else.

## Stage 3: Reader Testing

**Goal:** Test the document with a fresh Claude (no context bleed) to verify it works for readers.

**Instructions to user:**
Explain that testing will now occur to see if the document actually works for readers. This catches blind spots - things that make sense to the authors but might confuse others.

### Testing Approach

**If access to sub-agents is available (e.g., in Claude Code):**

Perform the testing directly without user involvement.

### Step 1: Predict Reader Questions

Announce intention to predict what questions readers might ask when trying to discover this document.

Generate 5-10 questions that readers would realistically ask.

### Step 2: Test with Sub-Agent

Announce that these questions will be tested with a fresh Claude instance (no context from this conversation).

For each question, invoke a sub-agent with just the document content and the question.

Summarize what Reader Claude got right/wrong for each question.

### Step 3: Run Additional Checks

Announce additional checks will be performed.

Invoke sub-agent to check for ambiguity, false assumptions, contradictions.

Summarize any issues found.

### Step 4: Report and Fix

If issues found:
Report that Reader Claude struggled with specific issues.

List the specific issues.

Indicate intention to fix these gaps.

Loop back to refinement for problematic sections.

---

**If no access to sub-agents (e.g., claude.ai web interface):**

The user will need to do the testing manually.

### Step 1: Predict Reader Questions

Ask what questions people might ask when trying to discover this document. What would they type into Claude.ai?

Generate 5-10 questions that readers would realistically ask.

### Step 2: Setup Testing

Provide testing instructions:
1. Open a fresh Claude conversation: https://claude.ai
2. Paste or share the document content (if using a shared doc platform with connectors enabled, provide the link)
3. Ask Reader Claude the generated questions

For each question, instruct Reader Claude to provide:
- The answer
- Whether anything was ambiguous or unclear
- What knowledge/context the doc assumes is already known

Check if Reader Claude gives correct answers or misinterprets anything.

### Step 3: Additional Checks

Also ask Reader Claude:
- "What in this doc might be ambiguous or unclear to readers?"
- "What knowledge or context does this doc assume readers already have?"
- "Are there any internal contradictions or inconsistencies?"

### Step 4: Iterate Based on Results

Ask what Reader Claude got wrong or struggled with. Indicate intention to fix those gaps.

Loop back to refinement for any problematic sections.

---

### Exit Condition (Both Approaches)

When Reader Claude consistently answers questions correctly and doesn't surface new gaps or ambiguities, the doc is ready.

## Final Review

When Reader Testing passes:
Announce the doc has passed Reader Claude testing. Before completion:

1. Recommend they do a final read-through themselves - they own this document and are responsible for its quality
2. Suggest double-checking any facts, links, or technical details
3. Ask them to verify it achieves the impact they wanted

Ask if they want one more review, or if the work is done.

**If user wants final review, provide it. Otherwise:**
Announce document completion. Provide a few final tips:
- Consider linking this conversation in an appendix so readers can see how the doc was developed
- Use appendices to provide depth without bloating the main doc
- Update the doc as feedback is received from real readers

## Tips for Effective Guidance

**Tone:**
- Be direct and procedural
- Explain rationale briefly when it affects user behavior
- Don't try to "sell" the approach - just execute it

**Handling Deviations:**
- If user wants to skip a stage: Ask if they want to skip this and write freeform
- If user seems frustrated: Acknowledge this is taking longer than expected. Suggest ways to move faster
- Always give user agency to adjust the process

**Context Management:**
- Throughout, if context is missing on something mentioned, proactively ask
- Don't let gaps accumulate - address them as they come up

**Artifact Management:**
- Use \`create_file\` for drafting full sections
- Use \`str_replace\` for all edits
- Provide artifact link after every change
- Never use artifacts for brainstorming lists - that's just conversation

**Quality over Speed:**
- Don't rush through stages
- Each iteration should make meaningful improvements
- The goal is a document that actually works for readers
`,
  },
  {
    path: "skills/docx/skill.md",
    content: `---
name: docx
description: "Create, read, edit, and manipulate Word (.docx) files — formatting, TOC, tables, images, templates."
tags:
  - document
  - word
  - docx
  - office
  - writing
  - formatting
---

# DOCX creation, editing, and analysis

## Overview

A .docx file is a ZIP archive containing XML files.

## Quick Reference

| Task | Approach |
|------|----------|
| Read/analyze content | \`pandoc\` or unpack for raw XML |
| Create new document | Use \`docx-js\` - see Creating New Documents below |
| Edit existing document | Unpack → edit XML → repack - see Editing Existing Documents below |

### Converting .doc to .docx

Legacy \`.doc\` files must be converted before editing:

\`\`\`bash
python scripts/office/soffice.py --headless --convert-to docx document.doc
\`\`\`

### Reading Content

\`\`\`bash
# Text extraction with tracked changes
pandoc --track-changes=all document.docx -o output.md

# Raw XML access
python scripts/office/unpack.py document.docx unpacked/
\`\`\`

### Converting to Images

\`\`\`bash
python scripts/office/soffice.py --headless --convert-to pdf document.docx
pdftoppm -jpeg -r 150 document.pdf page
\`\`\`

### Accepting Tracked Changes

To produce a clean document with all tracked changes accepted (requires LibreOffice):

\`\`\`bash
python scripts/accept_changes.py input.docx output.docx
\`\`\`

---

## Creating New Documents

Generate .docx files with JavaScript, then validate. Install: \`npm install -g docx\`

### Setup
\`\`\`javascript
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
        Header, Footer, AlignmentType, PageOrientation, LevelFormat, ExternalHyperlink,
        InternalHyperlink, Bookmark, FootnoteReferenceRun, PositionalTab,
        PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
        TabStopType, TabStopPosition, Column, SectionType,
        TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
        VerticalAlign, PageNumber, PageBreak } = require('docx');

const doc = new Document({ sections: [{ children: [/* content */] }] });
Packer.toBuffer(doc).then(buffer => fs.writeFileSync("doc.docx", buffer));
\`\`\`

### Validation
After creating the file, validate it. If validation fails, unpack, fix the XML, and repack.
\`\`\`bash
python scripts/office/validate.py doc.docx
\`\`\`

### Page Size

\`\`\`javascript
// CRITICAL: docx-js defaults to A4, not US Letter
// Always set page size explicitly for consistent results
sections: [{
  properties: {
    page: {
      size: {
        width: 12240,   // 8.5 inches in DXA
        height: 15840   // 11 inches in DXA
      },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // 1 inch margins
    }
  },
  children: [/* content */]
}]
\`\`\`

**Common page sizes (DXA units, 1440 DXA = 1 inch):**

| Paper | Width | Height | Content Width (1" margins) |
|-------|-------|--------|---------------------------|
| US Letter | 12,240 | 15,840 | 9,360 |
| A4 (default) | 11,906 | 16,838 | 9,026 |

**Landscape orientation:** docx-js swaps width/height internally, so pass portrait dimensions and let it handle the swap:
\`\`\`javascript
size: {
  width: 12240,   // Pass SHORT edge as width
  height: 15840,  // Pass LONG edge as height
  orientation: PageOrientation.LANDSCAPE  // docx-js swaps them in the XML
},
// Content width = 15840 - left margin - right margin (uses the long edge)
\`\`\`

### Styles (Override Built-in Headings)

Use Arial as the default font (universally supported). Keep titles black for readability.

\`\`\`javascript
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } }, // 12pt default
    paragraphStyles: [
      // IMPORTANT: Use exact IDs to override built-in styles
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } }, // outlineLevel required for TOC
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Title")] }),
    ]
  }]
});
\`\`\`

### Lists (NEVER use unicode bullets)

\`\`\`javascript
// WRONG - never manually insert bullet characters
new Paragraph({ children: [new TextRun("• Item")] })  // BAD
new Paragraph({ children: [new TextRun("\\u2022 Item")] })  // BAD

// CORRECT - use numbering config with LevelFormat.BULLET
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "\\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [{
    children: [
      new Paragraph({ numbering: { reference: "bullets", level: 0 },
        children: [new TextRun("Bullet item")] }),
      new Paragraph({ numbering: { reference: "numbers", level: 0 },
        children: [new TextRun("Numbered item")] }),
    ]
  }]
});

// Each reference creates INDEPENDENT numbering
// Same reference = continues (1,2,3 then 4,5,6)
// Different reference = restarts (1,2,3 then 1,2,3)
\`\`\`

### Tables

**CRITICAL: Tables need dual widths** - set both \`columnWidths\` on the table AND \`width\` on each cell. Without both, tables render incorrectly on some platforms.

\`\`\`javascript
// CRITICAL: Always set table width for consistent rendering
// CRITICAL: Use ShadingType.CLEAR (not SOLID) to prevent black backgrounds
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

new Table({
  width: { size: 9360, type: WidthType.DXA }, // Always use DXA (percentages break in Google Docs)
  columnWidths: [4680, 4680], // Must sum to table width (DXA: 1440 = 1 inch)
  rows: [
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 4680, type: WidthType.DXA }, // Also set on each cell
          shading: { fill: "D5E8F0", type: ShadingType.CLEAR }, // CLEAR not SOLID
          margins: { top: 80, bottom: 80, left: 120, right: 120 }, // Cell padding (internal, not added to width)
          children: [new Paragraph({ children: [new TextRun("Cell")] })]
        })
      ]
    })
  ]
})
\`\`\`

**Table width calculation:**

Always use \`WidthType.DXA\` — \`WidthType.PERCENTAGE\` breaks in Google Docs.

\`\`\`javascript
// Table width = sum of columnWidths = content width
// US Letter with 1" margins: 12240 - 2880 = 9360 DXA
width: { size: 9360, type: WidthType.DXA },
columnWidths: [7000, 2360]  // Must sum to table width
\`\`\`

**Width rules:**
- **Always use \`WidthType.DXA\`** — never \`WidthType.PERCENTAGE\` (incompatible with Google Docs)
- Table width must equal the sum of \`columnWidths\`
- Cell \`width\` must match corresponding \`columnWidth\`
- Cell \`margins\` are internal padding - they reduce content area, not add to cell width
- For full-width tables: use content width (page width minus left and right margins)

### Images

\`\`\`javascript
// CRITICAL: type parameter is REQUIRED
new Paragraph({
  children: [new ImageRun({
    type: "png", // Required: png, jpg, jpeg, gif, bmp, svg
    data: fs.readFileSync("image.png"),
    transformation: { width: 200, height: 150 },
    altText: { title: "Title", description: "Desc", name: "Name" } // All three required
  })]
})
\`\`\`

### Page Breaks

\`\`\`javascript
// CRITICAL: PageBreak must be inside a Paragraph
new Paragraph({ children: [new PageBreak()] })

// Or use pageBreakBefore
new Paragraph({ pageBreakBefore: true, children: [new TextRun("New page")] })
\`\`\`

### Hyperlinks

\`\`\`javascript
// External link
new Paragraph({
  children: [new ExternalHyperlink({
    children: [new TextRun({ text: "Click here", style: "Hyperlink" })],
    link: "https://example.com",
  })]
})

// Internal link (bookmark + reference)
// 1. Create bookmark at destination
new Paragraph({ heading: HeadingLevel.HEADING_1, children: [
  new Bookmark({ id: "chapter1", children: [new TextRun("Chapter 1")] }),
]})
// 2. Link to it
new Paragraph({ children: [new InternalHyperlink({
  children: [new TextRun({ text: "See Chapter 1", style: "Hyperlink" })],
  anchor: "chapter1",
})]})
\`\`\`

### Footnotes

\`\`\`javascript
const doc = new Document({
  footnotes: {
    1: { children: [new Paragraph("Source: Annual Report 2024")] },
    2: { children: [new Paragraph("See appendix for methodology")] },
  },
  sections: [{
    children: [new Paragraph({
      children: [
        new TextRun("Revenue grew 15%"),
        new FootnoteReferenceRun(1),
        new TextRun(" using adjusted metrics"),
        new FootnoteReferenceRun(2),
      ],
    })]
  }]
});
\`\`\`

### Tab Stops

\`\`\`javascript
// Right-align text on same line (e.g., date opposite a title)
new Paragraph({
  children: [
    new TextRun("Company Name"),
    new TextRun("\\tJanuary 2025"),
  ],
  tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
})

// Dot leader (e.g., TOC-style)
new Paragraph({
  children: [
    new TextRun("Introduction"),
    new TextRun({ children: [
      new PositionalTab({
        alignment: PositionalTabAlignment.RIGHT,
        relativeTo: PositionalTabRelativeTo.MARGIN,
        leader: PositionalTabLeader.DOT,
      }),
      "3",
    ]}),
  ],
})
\`\`\`

### Multi-Column Layouts

\`\`\`javascript
// Equal-width columns
sections: [{
  properties: {
    column: {
      count: 2,          // number of columns
      space: 720,        // gap between columns in DXA (720 = 0.5 inch)
      equalWidth: true,
      separate: true,    // vertical line between columns
    },
  },
  children: [/* content flows naturally across columns */]
}]

// Custom-width columns (equalWidth must be false)
sections: [{
  properties: {
    column: {
      equalWidth: false,
      children: [
        new Column({ width: 5400, space: 720 }),
        new Column({ width: 3240 }),
      ],
    },
  },
  children: [/* content */]
}]
\`\`\`

Force a column break with a new section using \`type: SectionType.NEXT_COLUMN\`.

### Table of Contents

\`\`\`javascript
// CRITICAL: Headings must use HeadingLevel ONLY - no custom styles
new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" })
\`\`\`

### Headers/Footers

\`\`\`javascript
sections: [{
  properties: {
    page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } // 1440 = 1 inch
  },
  headers: {
    default: new Header({ children: [new Paragraph({ children: [new TextRun("Header")] })] })
  },
  footers: {
    default: new Footer({ children: [new Paragraph({
      children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })]
    })] })
  },
  children: [/* content */]
}]
\`\`\`

### Critical Rules for docx-js

- **Set page size explicitly** - docx-js defaults to A4; use US Letter (12240 x 15840 DXA) for US documents
- **Landscape: pass portrait dimensions** - docx-js swaps width/height internally; pass short edge as \`width\`, long edge as \`height\`, and set \`orientation: PageOrientation.LANDSCAPE\`
- **Never use \`\\n\`** - use separate Paragraph elements
- **Never use unicode bullets** - use \`LevelFormat.BULLET\` with numbering config
- **PageBreak must be in Paragraph** - standalone creates invalid XML
- **ImageRun requires \`type\`** - always specify png/jpg/etc
- **Always set table \`width\` with DXA** - never use \`WidthType.PERCENTAGE\` (breaks in Google Docs)
- **Tables need dual widths** - \`columnWidths\` array AND cell \`width\`, both must match
- **Table width = sum of columnWidths** - for DXA, ensure they add up exactly
- **Always add cell margins** - use \`margins: { top: 80, bottom: 80, left: 120, right: 120 }\` for readable padding
- **Use \`ShadingType.CLEAR\`** - never SOLID for table shading
- **Never use tables as dividers/rules** - cells have minimum height and render as empty boxes (including in headers/footers); use \`border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "2E75B6", space: 1 } }\` on a Paragraph instead. For two-column footers, use tab stops (see Tab Stops section), not tables
- **TOC requires HeadingLevel only** - no custom styles on heading paragraphs
- **Override built-in styles** - use exact IDs: "Heading1", "Heading2", etc.
- **Include \`outlineLevel\`** - required for TOC (0 for H1, 1 for H2, etc.)

---

## Editing Existing Documents

**Follow all 3 steps in order.**

### Step 1: Unpack
\`\`\`bash
python scripts/office/unpack.py document.docx unpacked/
\`\`\`
Extracts XML, pretty-prints, merges adjacent runs, and converts smart quotes to XML entities (\`&#x201C;\` etc.) so they survive editing. Use \`--merge-runs false\` to skip run merging.

### Step 2: Edit XML

Edit files in \`unpacked/word/\`. See XML Reference below for patterns.

**Use "Claude" as the author** for tracked changes and comments, unless the user explicitly requests use of a different name.

**Use the Edit tool directly for string replacement. Do not write Python scripts.** Scripts introduce unnecessary complexity. The Edit tool shows exactly what is being replaced.

**CRITICAL: Use smart quotes for new content.** When adding text with apostrophes or quotes, use XML entities to produce smart quotes:
\`\`\`xml
<!-- Use these entities for professional typography -->
<w:t>Here&#x2019;s a quote: &#x201C;Hello&#x201D;</w:t>
\`\`\`
| Entity | Character |
|--------|-----------|
| \`&#x2018;\` | ' (left single) |
| \`&#x2019;\` | ' (right single / apostrophe) |
| \`&#x201C;\` | " (left double) |
| \`&#x201D;\` | " (right double) |

**Adding comments:** Use \`comment.py\` to handle boilerplate across multiple XML files (text must be pre-escaped XML):
\`\`\`bash
python scripts/comment.py unpacked/ 0 "Comment text with &amp; and &#x2019;"
python scripts/comment.py unpacked/ 1 "Reply text" --parent 0  # reply to comment 0
python scripts/comment.py unpacked/ 0 "Text" --author "Custom Author"  # custom author name
\`\`\`
Then add markers to document.xml (see Comments in XML Reference).

### Step 3: Pack
\`\`\`bash
python scripts/office/pack.py unpacked/ output.docx --original document.docx
\`\`\`
Validates with auto-repair, condenses XML, and creates DOCX. Use \`--validate false\` to skip.

**Auto-repair will fix:**
- \`durableId\` >= 0x7FFFFFFF (regenerates valid ID)
- Missing \`xml:space="preserve"\` on \`<w:t>\` with whitespace

**Auto-repair won't fix:**
- Malformed XML, invalid element nesting, missing relationships, schema violations

### Common Pitfalls

- **Replace entire \`<w:r>\` elements**: When adding tracked changes, replace the whole \`<w:r>...</w:r>\` block with \`<w:del>...<w:ins>...\` as siblings. Don't inject tracked change tags inside a run.
- **Preserve \`<w:rPr>\` formatting**: Copy the original run's \`<w:rPr>\` block into your tracked change runs to maintain bold, font size, etc.

---

## XML Reference

### Schema Compliance

- **Element order in \`<w:pPr>\`**: \`<w:pStyle>\`, \`<w:numPr>\`, \`<w:spacing>\`, \`<w:ind>\`, \`<w:jc>\`, \`<w:rPr>\` last
- **Whitespace**: Add \`xml:space="preserve"\` to \`<w:t>\` with leading/trailing spaces
- **RSIDs**: Must be 8-digit hex (e.g., \`00AB1234\`)

### Tracked Changes

**Insertion:**
\`\`\`xml
<w:ins w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:t>inserted text</w:t></w:r>
</w:ins>
\`\`\`

**Deletion:**
\`\`\`xml
<w:del w:id="2" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
\`\`\`

**Inside \`<w:del>\`**: Use \`<w:delText>\` instead of \`<w:t>\`, and \`<w:delInstrText>\` instead of \`<w:instrText>\`.

**Minimal edits** - only mark what changes:
\`\`\`xml
<!-- Change "30 days" to "60 days" -->
<w:r><w:t>The term is </w:t></w:r>
<w:del w:id="1" w:author="Claude" w:date="...">
  <w:r><w:delText>30</w:delText></w:r>
</w:del>
<w:ins w:id="2" w:author="Claude" w:date="...">
  <w:r><w:t>60</w:t></w:r>
</w:ins>
<w:r><w:t> days.</w:t></w:r>
\`\`\`

**Deleting entire paragraphs/list items** - when removing ALL content from a paragraph, also mark the paragraph mark as deleted so it merges with the next paragraph. Add \`<w:del/>\` inside \`<w:pPr><w:rPr>\`:
\`\`\`xml
<w:p>
  <w:pPr>
    <w:numPr>...</w:numPr>  <!-- list numbering if present -->
    <w:rPr>
      <w:del w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z"/>
    </w:rPr>
  </w:pPr>
  <w:del w:id="2" w:author="Claude" w:date="2025-01-01T00:00:00Z">
    <w:r><w:delText>Entire paragraph content being deleted...</w:delText></w:r>
  </w:del>
</w:p>
\`\`\`
Without the \`<w:del/>\` in \`<w:pPr><w:rPr>\`, accepting changes leaves an empty paragraph/list item.

**Rejecting another author's insertion** - nest deletion inside their insertion:
\`\`\`xml
<w:ins w:author="Jane" w:id="5">
  <w:del w:author="Claude" w:id="10">
    <w:r><w:delText>their inserted text</w:delText></w:r>
  </w:del>
</w:ins>
\`\`\`

**Restoring another author's deletion** - add insertion after (don't modify their deletion):
\`\`\`xml
<w:del w:author="Jane" w:id="5">
  <w:r><w:delText>deleted text</w:delText></w:r>
</w:del>
<w:ins w:author="Claude" w:id="10">
  <w:r><w:t>deleted text</w:t></w:r>
</w:ins>
\`\`\`

### Comments

After running \`comment.py\` (see Step 2), add markers to document.xml. For replies, use \`--parent\` flag and nest markers inside the parent's.

**CRITICAL: \`<w:commentRangeStart>\` and \`<w:commentRangeEnd>\` are siblings of \`<w:r>\`, never inside \`<w:r>\`.**

\`\`\`xml
<!-- Comment markers are direct children of w:p, never inside w:r -->
<w:commentRangeStart w:id="0"/>
<w:del w:id="1" w:author="Claude" w:date="2025-01-01T00:00:00Z">
  <w:r><w:delText>deleted</w:delText></w:r>
</w:del>
<w:r><w:t> more text</w:t></w:r>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>

<!-- Comment 0 with reply 1 nested inside -->
<w:commentRangeStart w:id="0"/>
  <w:commentRangeStart w:id="1"/>
  <w:r><w:t>text</w:t></w:r>
  <w:commentRangeEnd w:id="1"/>
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="1"/></w:r>
\`\`\`

### Images

1. Add image file to \`word/media/\`
2. Add relationship to \`word/_rels/document.xml.rels\`:
\`\`\`xml
<Relationship Id="rId5" Type=".../image" Target="media/image1.png"/>
\`\`\`
3. Add content type to \`[Content_Types].xml\`:
\`\`\`xml
<Default Extension="png" ContentType="image/png"/>
\`\`\`
4. Reference in document.xml:
\`\`\`xml
<w:drawing>
  <wp:inline>
    <wp:extent cx="914400" cy="914400"/>  <!-- EMUs: 914400 = 1 inch -->
    <a:graphic>
      <a:graphicData uri=".../picture">
        <pic:pic>
          <pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing>
\`\`\`

---

## Dependencies

- **pandoc**: Text extraction
- **docx**: \`npm install -g docx\` (new documents)
- **LibreOffice**: PDF conversion (auto-configured for sandboxed environments via \`scripts/office/soffice.py\`)
- **Poppler**: \`pdftoppm\` for images
`,
  },
  {
    path: "skills/docx/tools.md",
    content: `# DOCX Skill — Available Scripts

## scripts/office/unpack.py

Unpack Office files (DOCX, PPTX, XLSX) for editing. Extracts the ZIP archive, pretty-prints XML files, merges adjacent runs with identical formatting (DOCX only), and simplifies adjacent tracked changes from the same author (DOCX only).

\`\`\`bash
python scripts/office/unpack.py <office_file> <output_dir> [options]
\`\`\`

**Arguments:**
- \`office_file\` — Input Office file (.docx, .pptx, .xlsx)
- \`output_dir\` — Directory to extract to

**Options:**
- \`--merge-runs false\` — Skip merging adjacent runs with identical formatting

**Examples:**
\`\`\`bash
python scripts/office/unpack.py document.docx unpacked/
python scripts/office/unpack.py presentation.pptx unpacked/
python scripts/office/unpack.py document.docx unpacked/ --merge-runs false
\`\`\`

---

## scripts/office/pack.py

Pack a directory back into a DOCX, PPTX, or XLSX file. Validates with auto-repair, condenses XML formatting, and creates the Office file.

\`\`\`bash
python scripts/office/pack.py <input_directory> <output_file> [--original <file>] [--validate true|false]
\`\`\`

**Arguments:**
- \`input_directory\` — Unpacked directory containing the Office document XML files
- \`output_file\` — Output Office file path

**Options:**
- \`--original <file>\` — Original Office file (for reference during packing)
- \`--validate true|false\` — Enable/disable validation (default: true)

**Auto-repair fixes:**
- \`durableId\` >= 0x7FFFFFFF (regenerates valid ID)
- Missing \`xml:space="preserve"\` on \`<w:t>\` with whitespace

**Examples:**
\`\`\`bash
python scripts/office/pack.py unpacked/ output.docx --original input.docx
python scripts/office/pack.py unpacked/ output.pptx --validate false
\`\`\`

---

## scripts/office/validate.py

Validate Office document XML files against XSD schemas and tracked changes.

\`\`\`bash
python scripts/office/validate.py <path> [--original <original_file>] [--auto-repair] [--author NAME]
\`\`\`

**Arguments:**
- \`path\` — Path to unpacked directory or packed Office file (.docx/.pptx/.xlsx)

**Options:**
- \`--original <original_file>\` — Original file for comparison
- \`--auto-repair\` — Attempt automatic fixes for common issues
- \`--author NAME\` — Author name for tracked change validation

---

## scripts/office/soffice.py

Helper for running LibreOffice (soffice) in environments where AF_UNIX sockets may be blocked (e.g., sandboxed VMs). Detects the restriction at runtime and applies an LD_PRELOAD shim if needed.

\`\`\`bash
python scripts/office/soffice.py --headless --convert-to <format> <input_file>
\`\`\`

**Programmatic usage:**
\`\`\`python
from office.soffice import run_soffice, get_soffice_env

# Option 1 — run soffice directly
result = run_soffice(["--headless", "--convert-to", "pdf", "input.docx"])

# Option 2 — get env dict for your own subprocess calls
env = get_soffice_env()
subprocess.run(["soffice", ...], env=env)
\`\`\`

---

## scripts/comment.py

Add comments to DOCX documents. Handles all the boilerplate across multiple XML files (comments.xml, commentsExtended.xml, commentsIds.xml, commentsExtensible.xml). Text must be pre-escaped XML.

\`\`\`bash
python scripts/comment.py <unpacked_dir> <comment_id> "<text>" [options]
\`\`\`

**Arguments:**
- \`unpacked_dir\` — Unpacked DOCX directory
- \`comment_id\` — Comment ID (must be unique integer)
- \`text\` — Comment text (pre-escaped XML, e.g., \`&amp;\` for \`&\`, \`&#x2019;\` for smart quotes)

**Options:**
- \`--author <name>\` — Author name (default: "Claude")
- \`--initials <str>\` — Author initials (default: "C")
- \`--parent <id>\` — Parent comment ID (for replies)

**Examples:**
\`\`\`bash
python scripts/comment.py unpacked/ 0 "Comment text with &amp; and &#x2019;"
python scripts/comment.py unpacked/ 1 "Reply text" --parent 0
python scripts/comment.py unpacked/ 0 "Text" --author "Custom Author"
\`\`\`

After running, add markers to document.xml:
\`\`\`xml
<w:commentRangeStart w:id="0"/>
... commented content ...
<w:commentRangeEnd w:id="0"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="0"/></w:r>
\`\`\`

---

## scripts/accept_changes.py

Accept all tracked changes in a DOCX file using LibreOffice. Requires LibreOffice (soffice) to be installed.

\`\`\`bash
python scripts/accept_changes.py <input_file> <output_file>
\`\`\`

**Arguments:**
- \`input_file\` — Input DOCX file with tracked changes
- \`output_file\` — Output DOCX file (clean, no tracked changes)

**Example:**
\`\`\`bash
python scripts/accept_changes.py input.docx output.docx
\`\`\`
`,
  },
  {
    path: "skills/frontend-design/skill.md",
    content: `---
name: frontend-design
description: "Create polished, production-grade web UIs — landing pages, dashboards, React components, HTML/CSS layouts."
tags:
  - frontend
  - design
  - ui
  - css
  - html
  - react
  - web
  - components
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
`,
  },
  {
    path: "skills/internal-comms/examples.md",
    content: `# Internal Communications — Examples & Guidelines

---

## 3P Updates (Progress, Plans, Problems)

### Instructions
You are being asked to write a 3P update. 3P updates stand for "Progress, Plans, Problems." The main audience is for executives, leadership, other teammates, etc. They're meant to be very succinct and to-the-point: think something you can read in 30-60sec or less. They're also for people with some, but not a lot of context on what the team does.

3Ps can cover a team of any size, ranging all the way up to the entire company. The bigger the team, the less granular the tasks should be. For example, "mobile team" might have "shipped feature" or "fixed bugs," whereas the company might have really meaty 3Ps, like "hired 20 new people" or "closed 10 new deals."

They represent the work of the team across a time period, almost always one week. They include three sections:
1) Progress: what the team has accomplished over the next time period. Focus mainly on things shipped, milestones achieved, tasks created, etc.
2) Plans: what the team plans to do over the next time period. Focus on what things are top-of-mind, really high priority, etc. for the team.
3) Problems: anything that is slowing the team down. This could be things like too few people, bugs or blockers that are preventing the team from moving forward, some deal that fell through, etc.

Before writing them, make sure that you know the team name. If it's not specified, you can ask explicitly what the team name you're writing for is.


### Tools Available
Whenever possible, try to pull from available sources to get the information you need:
- Slack: posts from team members with their updates - ideally look for posts in large channels with lots of reactions
- Google Drive: docs written from critical team members with lots of views
- Email: emails with lots of responses of lots of content that seems relevant
- Calendar: non-recurring meetings that have a lot of importance, like product reviews, etc.


Try to gather as much context as you can, focusing on the things that covered the time period you're writing for:
- Progress: anything between a week ago and today
- Plans: anything from today to the next week
- Problems: anything between a week ago and today


If you don't have access, you can ask the user for things they want to cover. They might also include these things to you directly, in which case you're mostly just formatting for this particular format.

### Workflow

1. **Clarify scope**: Confirm the team name and time period (usually past week for Progress/Problems, next
week for Plans)
2. **Gather information**: Use available tools or ask the user directly
3. **Draft the update**: Follow the strict formatting guidelines
4. **Review**: Ensure it's concise (30-60 seconds to read) and data-driven

### Formatting

The format is always the same, very strict formatting. Never use any formatting other than this. Pick an emoji that is fun and captures the vibe of the team and update.

[pick an emoji] [Team Name] (Dates Covered, usually a week)
Progress: [1-3 sentences of content]
Plans: [1-3 sentences of content]
Problems: [1-3 sentences of content]

Each section should be no more than 1-3 sentences: clear, to the point. It should be data-driven, and generally include metrics where possible. The tone should be very matter-of-fact, not super prose-heavy.

---

## Company Newsletter

### Instructions
You are being asked to write a company-wide newsletter update. You are meant to summarize the past week/month of a company in the form of a newsletter that the entire company will read. It should be maybe ~20-25 bullet points long. It will be sent via Slack and email, so make it consumable for that.

Ideally it includes the following attributes:
- Lots of links: pulling documents from Google Drive that are very relevant, linking to prominent Slack messages in announce channels and from executives, perhaps referencing emails that went company-wide, highlighting significant things that have happened in the company.
- Short and to-the-point: each bullet should probably be no longer than ~1-2 sentences
- Use the "we" tense, as you are part of the company. Many of the bullets should say "we did this" or "we did that"

### Tools to use
If you have access to the following tools, please try to use them. If not, you can also let the user know directly that their responses would be better if they gave them access.

- Slack: look for messages in channels with lots of people, with lots of reactions or lots of responses within the thread
- Email: look for things from executives that discuss company-wide announcements
- Calendar: if there were meetings with large attendee lists, particularly things like All-Hands meetings, big company announcements, etc. If there were documents attached to those meetings, those are great links to include.
- Documents: if there were new docs published in the last week or two that got a lot of attention, you can link them. These should be things like company-wide vision docs, plans for the upcoming quarter or half, things authored by critical executives, etc.
- External press: if you see references to articles or press we've received over the past week, that could be really cool too.

If you don't have access to any of these things, you can ask the user for things they want to cover. In this case, you'll mostly just be polishing up and fitting to this format more directly.

### Sections
The company is pretty big: 1000+ people. There are a variety of different teams and initiatives going on across the company. To make sure the update works well, try breaking it into sections of similar things. You might break into clusters like {product development, go to market, finance} or {recruiting, execution, vision}, or {external news, internal news} etc. Try to make sure the different areas of the company are highlighted well.

### Prioritization
Focus on:
- Company-wide impact (not team-specific details)
- Announcements from leadership
- Major milestones and achievements
- Information that affects most employees
- External recognition or press

Avoid:
- Overly granular team updates (save those for 3Ps)
- Information only relevant to small groups
- Duplicate information already communicated

### Example Formats

:megaphone: Company Announcements
- Announcement 1
- Announcement 2
- Announcement 3

:dart: Progress on Priorities
- Area 1
    - Sub-area 1
    - Sub-area 2
    - Sub-area 3
- Area 2
    - Sub-area 1
    - Sub-area 2
    - Sub-area 3
- Area 3
    - Sub-area 1
    - Sub-area 2
    - Sub-area 3

:pillar: Leadership Updates
- Post 1
- Post 2
- Post 3

:thread: Social Updates
- Update 1
- Update 2
- Update 3

---

## FAQ Answers

### Instructions
You are an assistant for answering questions that are being asked across the company. Every week, there are lots of questions that get asked across the company, and your goal is to try to summarize what those questions are. We want our company to be well-informed and on the same page, so your job is to produce a set of frequently asked questions that our employees are asking and attempt to answer them. Your singular job is to do two things:

- Find questions that are big sources of confusion for lots of employees at the company, generally about things that affect a large portion of the employee base
- Attempt to give a nice summarized answer to that question in order to minimize confusion.

Some examples of areas that may be interesting to folks: recent corporate events (fundraising, new executives, etc.), upcoming launches, hiring progress, changes to vision or focus, etc.


### Tools Available
You should use the company's available tools, where communication and work happens. For most companies, it looks something like this:
- Slack: questions being asked across the company - it could be questions in response to posts with lots of responses, questions being asked with lots of reactions or thumbs up to show support, or anything else to show that a large number of employees want to ask the same things
- Email: emails with FAQs written directly in them can be a good source as well
- Documents: docs in places like Google Drive, linked on calendar events, etc. can also be a good source of FAQs, either directly added or inferred based on the contents of the doc

### Formatting
The formatting should be pretty basic:

- *Question*: [insert question - 1 sentence]
- *Answer*: [insert answer - 1-2 sentence]

### Guidance
Make sure you're being holistic in your questions. Don't focus too much on just the user in question or the team they are a part of, but try to capture the entire company. Try to be as holistic as you can in reading all the tools available, producing responses that are relevant to all at the company.

### Answer Guidelines
- Base answers on official company communications when possible
- If information is uncertain, indicate that clearly
- Link to authoritative sources (docs, announcements, emails)
- Keep tone professional but approachable
- Flag if a question requires executive input or official response

---

## General Communications

### Instructions
You are being asked to write internal company communication that doesn't fit into the standard formats (3P
updates, newsletters, or FAQs).

Before proceeding:
1. Ask the user about their target audience
2. Understand the communication's purpose
3. Clarify the desired tone (formal, casual, urgent, informational)
4. Confirm any specific formatting requirements

Use these general principles:
- Be clear and concise
- Use active voice
- Put the most important information first
- Include relevant links and references
- Match the company's communication style
`,
  },
  {
    path: "skills/internal-comms/skill.md",
    content: `---
name: internal-comms
description: "Write internal communications — status reports, leadership updates, newsletters, incident reports, FAQs."
tags:
  - writing
  - communications
  - business
  - internal
  - reports
  - updates
---

## When to use this skill
To write internal communications, use this skill for:
- 3P updates (Progress, Plans, Problems)
- Company newsletters
- FAQ responses
- Status reports
- Leadership updates
- Project updates
- Incident reports

## How to use this skill

To write any internal communication:

1. **Identify the communication type** from the request
2. **Load the appropriate guideline** from the examples:
    - 3P updates - For Progress/Plans/Problems team updates
    - Company newsletter - For company-wide newsletters
    - FAQ answers - For answering frequently asked questions
    - General comms - For anything else that doesn't explicitly match one of the above
3. **Follow the specific instructions** in that guideline for formatting, tone, and content gathering

If the communication type doesn't match any existing guideline, ask for clarification or more context about the desired format.

## Keywords
3P updates, company newsletter, company comms, weekly update, faqs, common questions, updates, internal comms
`,
  },
  {
    path: "skills/mcp-builder/references.md",
    content: `# MCP Builder References

This file combines all reference documentation for the MCP Builder skill.

## Table of Contents

- [MCP Server Best Practices](#mcp-server-best-practices)
- [Node/TypeScript MCP Server Implementation Guide](#nodetypescript-mcp-server-implementation-guide)
- [Python MCP Server Implementation Guide](#python-mcp-server-implementation-guide)
- [MCP Server Evaluation Guide](#mcp-server-evaluation-guide)

---

# MCP Server Best Practices

## Quick Reference

### Server Naming
- **Python**: \`{service}_mcp\` (e.g., \`slack_mcp\`)
- **Node/TypeScript**: \`{service}-mcp-server\` (e.g., \`slack-mcp-server\`)

### Tool Naming
- Use snake_case with service prefix
- Format: \`{service}_{action}_{resource}\`
- Example: \`slack_send_message\`, \`github_create_issue\`

### Response Formats
- Support both JSON and Markdown formats
- JSON for programmatic processing
- Markdown for human readability

### Pagination
- Always respect \`limit\` parameter
- Return \`has_more\`, \`next_offset\`, \`total_count\`
- Default to 20-50 items

### Transport
- **Streamable HTTP**: For remote servers, multi-client scenarios
- **stdio**: For local integrations, command-line tools
- Avoid SSE (deprecated in favor of streamable HTTP)

---

## Server Naming Conventions

Follow these standardized naming patterns:

**Python**: Use format \`{service}_mcp\` (lowercase with underscores)
- Examples: \`slack_mcp\`, \`github_mcp\`, \`jira_mcp\`

**Node/TypeScript**: Use format \`{service}-mcp-server\` (lowercase with hyphens)
- Examples: \`slack-mcp-server\`, \`github-mcp-server\`, \`jira-mcp-server\`

The name should be general, descriptive of the service being integrated, easy to infer from the task description, and without version numbers.

---

## Tool Naming and Design

### Tool Naming

1. **Use snake_case**: \`search_users\`, \`create_project\`, \`get_channel_info\`
2. **Include service prefix**: Anticipate that your MCP server may be used alongside other MCP servers
   - Use \`slack_send_message\` instead of just \`send_message\`
   - Use \`github_create_issue\` instead of just \`create_issue\`
3. **Be action-oriented**: Start with verbs (get, list, search, create, etc.)
4. **Be specific**: Avoid generic names that could conflict with other servers

### Tool Design

- Tool descriptions must narrowly and unambiguously describe functionality
- Descriptions must precisely match actual functionality
- Provide tool annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
- Keep tool operations focused and atomic

---

## Response Formats

All tools that return data should support multiple formats:

### JSON Format (\`response_format="json"\`)
- Machine-readable structured data
- Include all available fields and metadata
- Consistent field names and types
- Use for programmatic processing

### Markdown Format (\`response_format="markdown"\`, typically default)
- Human-readable formatted text
- Use headers, lists, and formatting for clarity
- Convert timestamps to human-readable format
- Show display names with IDs in parentheses
- Omit verbose metadata

---

## Pagination

For tools that list resources:

- **Always respect the \`limit\` parameter**
- **Implement pagination**: Use \`offset\` or cursor-based pagination
- **Return pagination metadata**: Include \`has_more\`, \`next_offset\`/\`next_cursor\`, \`total_count\`
- **Never load all results into memory**: Especially important for large datasets
- **Default to reasonable limits**: 20-50 items is typical

Example pagination response:
\`\`\`json
{
  "total": 150,
  "count": 20,
  "offset": 0,
  "items": [...],
  "has_more": true,
  "next_offset": 20
}
\`\`\`

---

## Transport Options

### Streamable HTTP

**Best for**: Remote servers, web services, multi-client scenarios

**Characteristics**:
- Bidirectional communication over HTTP
- Supports multiple simultaneous clients
- Can be deployed as a web service
- Enables server-to-client notifications

**Use when**:
- Serving multiple clients simultaneously
- Deploying as a cloud service
- Integration with web applications

### stdio

**Best for**: Local integrations, command-line tools

**Characteristics**:
- Standard input/output stream communication
- Simple setup, no network configuration needed
- Runs as a subprocess of the client

**Use when**:
- Building tools for local development environments
- Integrating with desktop applications
- Single-user, single-session scenarios

**Note**: stdio servers should NOT log to stdout (use stderr for logging)

### Transport Selection

| Criterion | stdio | Streamable HTTP |
|-----------|-------|-----------------|
| **Deployment** | Local | Remote |
| **Clients** | Single | Multiple |
| **Complexity** | Low | Medium |
| **Real-time** | No | Yes |

---

## Security Best Practices

### Authentication and Authorization

**OAuth 2.1**:
- Use secure OAuth 2.1 with certificates from recognized authorities
- Validate access tokens before processing requests
- Only accept tokens specifically intended for your server

**API Keys**:
- Store API keys in environment variables, never in code
- Validate keys on server startup
- Provide clear error messages when authentication fails

### Input Validation

- Sanitize file paths to prevent directory traversal
- Validate URLs and external identifiers
- Check parameter sizes and ranges
- Prevent command injection in system calls
- Use schema validation (Pydantic/Zod) for all inputs

### Error Handling

- Don't expose internal errors to clients
- Log security-relevant errors server-side
- Provide helpful but not revealing error messages
- Clean up resources after errors

### DNS Rebinding Protection

For streamable HTTP servers running locally:
- Enable DNS rebinding protection
- Validate the \`Origin\` header on all incoming connections
- Bind to \`127.0.0.1\` rather than \`0.0.0.0\`

---

## Tool Annotations

Provide annotations to help clients understand tool behavior:

| Annotation | Type | Default | Description |
|-----------|------|---------|-------------|
| \`readOnlyHint\` | boolean | false | Tool does not modify its environment |
| \`destructiveHint\` | boolean | true | Tool may perform destructive updates |
| \`idempotentHint\` | boolean | false | Repeated calls with same args have no additional effect |
| \`openWorldHint\` | boolean | true | Tool interacts with external entities |

**Important**: Annotations are hints, not security guarantees. Clients should not make security-critical decisions based solely on annotations.

---

## Error Handling

- Use standard JSON-RPC error codes
- Report tool errors within result objects (not protocol-level errors)
- Provide helpful, specific error messages with suggested next steps
- Don't expose internal implementation details
- Clean up resources properly on errors

Example error handling:
\`\`\`typescript
try {
  const result = performOperation();
  return { content: [{ type: "text", text: result }] };
} catch (error) {
  return {
    isError: true,
    content: [{
      type: "text",
      text: \`Error: \${error.message}. Try using filter='active_only' to reduce results.\`
    }]
  };
}
\`\`\`

---

## Testing Requirements

Comprehensive testing should cover:

- **Functional testing**: Verify correct execution with valid/invalid inputs
- **Integration testing**: Test interaction with external systems
- **Security testing**: Validate auth, input sanitization, rate limiting
- **Performance testing**: Check behavior under load, timeouts
- **Error handling**: Ensure proper error reporting and cleanup

---

## Documentation Requirements

- Provide clear documentation of all tools and capabilities
- Include working examples (at least 3 per major feature)
- Document security considerations
- Specify required permissions and access levels
- Document rate limits and performance characteristics

---

# Node/TypeScript MCP Server Implementation Guide

## Overview

This document provides Node/TypeScript-specific best practices and examples for implementing MCP servers using the MCP TypeScript SDK. It covers project structure, server setup, tool registration patterns, input validation with Zod, error handling, and complete working examples.

---

## Quick Reference

### Key Imports
\`\`\`typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { z } from "zod";
\`\`\`

### Server Initialization
\`\`\`typescript
const server = new McpServer({
  name: "service-mcp-server",
  version: "1.0.0"
});
\`\`\`

### Tool Registration Pattern
\`\`\`typescript
server.registerTool(
  "tool_name",
  {
    title: "Tool Display Name",
    description: "What the tool does",
    inputSchema: { param: z.string() },
    outputSchema: { result: z.string() }
  },
  async ({ param }) => {
    const output = { result: \`Processed: \${param}\` };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);
\`\`\`

---

## MCP TypeScript SDK

The official MCP TypeScript SDK provides:
- \`McpServer\` class for server initialization
- \`registerTool\` method for tool registration
- Zod schema integration for runtime input validation
- Type-safe tool handler implementations

**IMPORTANT - Use Modern APIs Only:**
- **DO use**: \`server.registerTool()\`, \`server.registerResource()\`, \`server.registerPrompt()\`
- **DO NOT use**: Old deprecated APIs such as \`server.tool()\`, \`server.setRequestHandler(ListToolsRequestSchema, ...)\`, or manual handler registration
- The \`register*\` methods provide better type safety, automatic schema handling, and are the recommended approach

## Server Naming Convention

Node/TypeScript MCP servers must follow this naming pattern:
- **Format**: \`{service}-mcp-server\` (lowercase with hyphens)
- **Examples**: \`github-mcp-server\`, \`jira-mcp-server\`, \`stripe-mcp-server\`

## Project Structure

\`\`\`
{service}-mcp-server/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # Main entry point with McpServer initialization
│   ├── types.ts          # TypeScript type definitions and interfaces
│   ├── tools/            # Tool implementations (one file per domain)
│   ├── services/         # API clients and shared utilities
│   ├── schemas/          # Zod validation schemas
│   └── constants.ts      # Shared constants (API_URL, CHARACTER_LIMIT, etc.)
└── dist/                 # Built JavaScript files (entry point: dist/index.js)
\`\`\`

## Tool Implementation

### Tool Naming

Use snake_case for tool names with clear, action-oriented names. Include the service context to prevent overlaps.

### Tool Structure

Tools are registered using the \`registerTool\` method with:
- Zod schemas for runtime input validation and type safety
- Explicitly provided \`title\`, \`description\`, \`inputSchema\`, and \`annotations\`
- The \`inputSchema\` must be a Zod schema object (not a JSON schema)

\`\`\`typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "example-mcp",
  version: "1.0.0"
});

const UserSearchInputSchema = z.object({
  query: z.string()
    .min(2, "Query must be at least 2 characters")
    .max(200, "Query must not exceed 200 characters")
    .describe("Search string to match against names/emails"),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return"),
  offset: z.number()
    .int()
    .min(0)
    .default(0)
    .describe("Number of results to skip for pagination"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

type UserSearchInput = z.infer<typeof UserSearchInputSchema>;

server.registerTool(
  "example_search_users",
  {
    title: "Search Example Users",
    description: \`Search for users in the Example system by name, email, or team.\`,
    inputSchema: UserSearchInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: UserSearchInput) => {
    // Implementation
  }
);
\`\`\`

## Zod Schemas for Input Validation

\`\`\`typescript
import { z } from "zod";

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email("Invalid email format"),
  age: z.number().int().min(0).max(150)
}).strict();

enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0)
});
\`\`\`

## Character Limits and Truncation

\`\`\`typescript
export const CHARACTER_LIMIT = 25000;

async function searchTool(params: SearchInput) {
  let result = generateResponse(data);
  if (result.length > CHARACTER_LIMIT) {
    const truncatedData = data.slice(0, Math.max(1, data.length / 2));
    response.truncated = true;
    response.truncation_message =
      \`Response truncated. Use 'offset' parameter or add filters to see more results.\`;
    result = JSON.stringify(response, null, 2);
  }
  return result;
}
\`\`\`

## Error Handling

\`\`\`typescript
function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      switch (error.response.status) {
        case 404: return "Error: Resource not found. Please check the ID is correct.";
        case 403: return "Error: Permission denied.";
        case 429: return "Error: Rate limit exceeded. Please wait.";
        default: return \`Error: API request failed with status \${error.response.status}\`;
      }
    }
  }
  return \`Error: Unexpected error occurred: \${error instanceof Error ? error.message : String(error)}\`;
}
\`\`\`

## Package Configuration

### package.json
\`\`\`json
{
  "name": "{service}-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.6.1",
    "axios": "^1.7.9",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
\`\`\`

### tsconfig.json
\`\`\`json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
\`\`\`

## Advanced MCP Features

### Resource Registration

\`\`\`typescript
server.registerResource(
  {
    uri: "file://documents/{name}",
    name: "Document Resource",
    description: "Access documents by name",
    mimeType: "text/plain"
  },
  async (uri: string) => {
    const match = uri.match(/^file:\\/\\/documents\\/(.+)\$/);
    const documentName = match[1];
    const content = await loadDocument(documentName);
    return { contents: [{ uri, mimeType: "text/plain", text: content }] };
  }
);
\`\`\`

### Transport Options

#### Streamable HTTP (Recommended for Remote Servers)
\`\`\`typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
\`\`\`

#### stdio (For Local Integrations)
\`\`\`typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
\`\`\`

## Quality Checklist

### Strategic Design
- [ ] Tools enable complete workflows, not just API endpoint wrappers
- [ ] Tool names reflect natural task subdivisions
- [ ] Response formats optimize for agent context efficiency
- [ ] Error messages guide agents toward correct usage

### Implementation Quality
- [ ] All tools registered using \`registerTool\` with complete configuration
- [ ] All tools include \`title\`, \`description\`, \`inputSchema\`, and \`annotations\`
- [ ] All tools use Zod schemas with \`.strict()\` enforcement
- [ ] Descriptions include return value examples and schema documentation

### TypeScript Quality
- [ ] Strict TypeScript enabled in tsconfig.json
- [ ] No use of \`any\` type
- [ ] All async functions have explicit Promise<T> return types

### Testing and Build
- [ ] \`npm run build\` completes successfully without errors
- [ ] dist/index.js created and executable
- [ ] All imports resolve correctly

---

# Python MCP Server Implementation Guide

## Overview

This document provides Python-specific best practices and examples for implementing MCP servers using the MCP Python SDK.

---

## Quick Reference

### Key Imports
\`\`\`python
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Optional, List, Dict, Any
from enum import Enum
import httpx
\`\`\`

### Server Initialization
\`\`\`python
mcp = FastMCP("service_mcp")
\`\`\`

### Tool Registration Pattern
\`\`\`python
@mcp.tool(name="tool_name", annotations={...})
async def tool_function(params: InputModel) -> str:
    pass
\`\`\`

---

## MCP Python SDK and FastMCP

FastMCP provides:
- Automatic description and inputSchema generation from function signatures and docstrings
- Pydantic model integration for input validation
- Decorator-based tool registration with \`@mcp.tool\`

## Server Naming Convention

- **Format**: \`{service}_mcp\` (lowercase with underscores)
- **Examples**: \`github_mcp\`, \`jira_mcp\`, \`stripe_mcp\`

## Tool Implementation with FastMCP

\`\`\`python
from pydantic import BaseModel, Field, ConfigDict
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("example_mcp")

class ServiceToolInput(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        extra='forbid'
    )
    param1: str = Field(..., description="First parameter", min_length=1, max_length=100)
    param2: Optional[int] = Field(default=None, description="Optional integer", ge=0, le=1000)

@mcp.tool(
    name="service_tool_name",
    annotations={
        "title": "Human-Readable Tool Title",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False
    }
)
async def service_tool_name(params: ServiceToolInput) -> str:
    '''Tool description automatically becomes the 'description' field.'''
    pass
\`\`\`

## Pydantic v2 Key Features

- Use \`model_config\` instead of nested \`Config\` class
- Use \`field_validator\` instead of deprecated \`validator\`
- Use \`model_dump()\` instead of deprecated \`dict()\`
- Validators require \`@classmethod\` decorator

\`\`\`python
from pydantic import BaseModel, Field, field_validator, ConfigDict

class CreateUserInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, validate_assignment=True)
    name: str = Field(..., description="User's full name", min_length=1, max_length=100)
    email: str = Field(..., description="User's email", pattern=r'^[\\w\\.-]+@[\\w\\.-]+\\.\\w+\$')

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: str) -> str:
        return v.lower()
\`\`\`

## Response Format Options

\`\`\`python
from enum import Enum

class ResponseFormat(str, Enum):
    MARKDOWN = "markdown"
    JSON = "json"
\`\`\`

## Error Handling

\`\`\`python
def _handle_api_error(e: Exception) -> str:
    if isinstance(e, httpx.HTTPStatusError):
        if e.response.status_code == 404:
            return "Error: Resource not found."
        elif e.response.status_code == 403:
            return "Error: Permission denied."
        elif e.response.status_code == 429:
            return "Error: Rate limit exceeded."
        return f"Error: API request failed with status {e.response.status_code}"
    elif isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out."
    return f"Error: Unexpected error: {type(e).__name__}"
\`\`\`

## Advanced FastMCP Features

### Context Parameter Injection

\`\`\`python
from mcp.server.fastmcp import FastMCP, Context

@mcp.tool()
async def advanced_search(query: str, ctx: Context) -> str:
    await ctx.report_progress(0.25, "Starting search...")
    await ctx.log_info("Processing query", {"query": query})
    results = await search_api(query)
    return format_results(results)
\`\`\`

### Resource Registration

\`\`\`python
@mcp.resource("file://documents/{name}")
async def get_document(name: str) -> str:
    with open(f"./docs/{name}", "r") as f:
        return f.read()
\`\`\`

### Lifespan Management

\`\`\`python
from contextlib import asynccontextmanager

@asynccontextmanager
async def app_lifespan():
    db = await connect_to_database()
    yield {"db": db}
    await db.close()

mcp = FastMCP("example_mcp", lifespan=app_lifespan)
\`\`\`

### Transport Options

\`\`\`python
# stdio transport (default)
if __name__ == "__main__":
    mcp.run()

# Streamable HTTP transport
if __name__ == "__main__":
    mcp.run(transport="streamable_http", port=8000)
\`\`\`

## Quality Checklist

### Implementation Quality
- [ ] All tools have descriptive names and documentation
- [ ] Server name follows format: \`{service}_mcp\`
- [ ] All network operations use async/await
- [ ] Common functionality extracted into reusable functions

### Tool Configuration
- [ ] All tools implement 'name' and 'annotations' in the decorator
- [ ] All tools use Pydantic BaseModel for input validation
- [ ] All Pydantic Fields have explicit types, descriptions, and constraints
- [ ] All tools have comprehensive docstrings

### Testing
- [ ] Server runs successfully
- [ ] All imports resolve correctly
- [ ] Error scenarios handled gracefully

---

# MCP Server Evaluation Guide

## Overview

This document provides guidance on creating comprehensive evaluations for MCP servers. Evaluations test whether LLMs can effectively use your MCP server to answer realistic, complex questions using only the tools provided.

---

## Quick Reference

### Evaluation Requirements
- Create 10 human-readable questions
- Questions must be READ-ONLY, INDEPENDENT, NON-DESTRUCTIVE
- Each question requires multiple tool calls (potentially dozens)
- Answers must be single, verifiable values
- Answers must be STABLE (won't change over time)

### Output Format
\`\`\`xml
<evaluation>
   <qa_pair>
      <question>Your question here</question>
      <answer>Single verifiable answer</answer>
   </qa_pair>
</evaluation>
\`\`\`

---

## Purpose of Evaluations

The measure of quality of an MCP server is NOT how well or comprehensively the server implements tools, but how well these implementations (input/output schemas, docstrings/descriptions, functionality) enable LLMs with no other context and access ONLY to the MCP servers to answer realistic and difficult questions.

## Evaluation Overview

Create 10 human-readable questions requiring ONLY READ-ONLY, INDEPENDENT, NON-DESTRUCTIVE, and IDEMPOTENT operations to answer. Each question should be:
- Realistic
- Clear and concise
- Unambiguous
- Complex, requiring potentially dozens of tool calls or steps
- Answerable with a single, verifiable value that you identify in advance

## Question Guidelines

### Core Requirements

1. **Questions MUST be independent** - not dependent on other questions
2. **Questions MUST require ONLY NON-DESTRUCTIVE AND IDEMPOTENT tool use**
3. **Questions must be REALISTIC, CLEAR, CONCISE, and COMPLEX**

### Complexity and Depth

4. **Questions must require deep exploration** - multi-hop questions requiring multiple sub-questions
5. **Questions may require extensive paging** through multiple pages of results
6. **Questions must require deep understanding** rather than surface-level knowledge
7. **Questions must not be solvable with straightforward keyword search**

### Tool Testing

8. **Questions should stress-test tool return values**
9. **Questions should MOSTLY reflect real human use cases**
10. **Questions may require dozens of tool calls**
11. **Include ambiguous questions** that force difficult decisions

### Stability

12. **Questions must be designed so the answer DOES NOT CHANGE**
13. **DO NOT let the MCP server RESTRICT the kinds of questions you create**

## Answer Guidelines

### Verification
- Answers must be VERIFIABLE via direct string comparison
- Specify the output format in the QUESTION (e.g., "Use YYYY/MM/DD.", "Respond True or False.")
- Answer should be a single VERIFIABLE value

### Readability
- Prefer HUMAN-READABLE formats (names, dates, URLs, yes/no, true/false)

### Stability
- Look at old content and "closed" concepts that will always return the same answer

### Diversity
- Answers should cover diverse modalities and formats

## Evaluation Process

### Step 1: Documentation Inspection
Read the documentation of the target API.

### Step 2: Tool Inspection
List the tools available in the MCP server without calling them.

### Step 3: Developing Understanding
Iterate until you understand the kinds of tasks you want to create.

### Step 4: Read-Only Content Inspection
USE the MCP server tools with READ-ONLY operations only to identify specific content for creating realistic questions. Make INCREMENTAL, SMALL, AND TARGETED tool calls.

### Step 5: Task Generation
Create 10 human-readable questions following all guidelines.

## Good Question Examples

**Multi-hop question (GitHub MCP):**
\`\`\`xml
<qa_pair>
   <question>Find the repository that was archived in Q3 2023 and had previously been the most forked project in the organization. What was the primary programming language?</question>
   <answer>Python</answer>
</qa_pair>
\`\`\`

**Complex aggregation (Issue Tracker MCP):**
\`\`\`xml
<qa_pair>
   <question>Among all bugs reported in January 2024 that were marked as critical priority, which assignee resolved the highest percentage of their assigned bugs within 48 hours? Provide the assignee's username.</question>
   <answer>alex_eng</answer>
</qa_pair>
\`\`\`

## Running Evaluations

### Setup

\`\`\`bash
pip install -r scripts/requirements.txt
export ANTHROPIC_API_KEY=your_api_key_here
\`\`\`

### Running

**Local STDIO Server:**
\`\`\`bash
python scripts/evaluation.py \\
  -t stdio \\
  -c python \\
  -a my_mcp_server.py \\
  evaluation.xml
\`\`\`

**Server-Sent Events (SSE):**
\`\`\`bash
python scripts/evaluation.py \\
  -t sse \\
  -u https://example.com/mcp \\
  -H "Authorization: Bearer token123" \\
  evaluation.xml
\`\`\`

**HTTP (Streamable HTTP):**
\`\`\`bash
python scripts/evaluation.py \\
  -t http \\
  -u https://example.com/mcp \\
  -H "Authorization: Bearer token123" \\
  evaluation.xml
\`\`\`

### Command-Line Options

\`\`\`
positional arguments:
  eval_file             Path to evaluation XML file

optional arguments:
  -t, --transport       Transport type: stdio, sse, or http (default: stdio)
  -m, --model           Claude model to use (default: claude-3-7-sonnet-20250219)
  -o, --output          Output file for report
  -c, --command         Command to run MCP server (stdio only)
  -a, --args            Arguments for the command (stdio only)
  -e, --env             Environment variables in KEY=VALUE format (stdio only)
  -u, --url             MCP server URL (sse/http only)
  -H, --header          HTTP headers in 'Key: Value' format (sse/http only)
\`\`\`

## Troubleshooting

### Low Accuracy
- Review the agent's feedback for each task
- Check if tool descriptions are clear and comprehensive
- Consider whether tools return too much or too little data
- Ensure error messages are actionable
`,
  },
  {
    path: "skills/mcp-builder/skill.md",
    content: `---
name: mcp-builder
description: "Build MCP (Model Context Protocol) servers for LLM-to-service integration. Python (FastMCP) or TypeScript."
tags:
  - mcp
  - api-integration
  - development
  - server
---

# MCP Server Development Guide

## Overview

Create MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. The quality of an MCP server is measured by how well it enables LLMs to accomplish real-world tasks.

---

# Process

## High-Level Workflow

Creating a high-quality MCP server involves four main phases:

### Phase 1: Deep Research and Planning

#### 1.1 Understand Modern MCP Design

**API Coverage vs. Workflow Tools:**
Balance comprehensive API endpoint coverage with specialized workflow tools. Workflow tools can be more convenient for specific tasks, while comprehensive coverage gives agents flexibility to compose operations. Performance varies by client--some clients benefit from code execution that combines basic tools, while others work better with higher-level workflows. When uncertain, prioritize comprehensive API coverage.

**Tool Naming and Discoverability:**
Clear, descriptive tool names help agents find the right tools quickly. Use consistent prefixes (e.g., \`github_create_issue\`, \`github_list_repos\`) and action-oriented naming.

**Context Management:**
Agents benefit from concise tool descriptions and the ability to filter/paginate results. Design tools that return focused, relevant data. Some clients support code execution which can help agents filter and process data efficiently.

**Actionable Error Messages:**
Error messages should guide agents toward solutions with specific suggestions and next steps.

#### 1.2 Study MCP Protocol Documentation

**Navigate the MCP specification:**

Start with the sitemap to find relevant pages: \`https://modelcontextprotocol.io/sitemap.xml\`

Then fetch specific pages with \`.md\` suffix for markdown format (e.g., \`https://modelcontextprotocol.io/specification/draft.md\`).

Key pages to review:
- Specification overview and architecture
- Transport mechanisms (streamable HTTP, stdio)
- Tool, resource, and prompt definitions

#### 1.3 Study Framework Documentation

**Recommended stack:**
- **Language**: TypeScript (high-quality SDK support and good compatibility in many execution environments e.g. MCPB. Plus AI models are good at generating TypeScript code, benefiting from its broad usage, static typing and good linting tools)
- **Transport**: Streamable HTTP for remote servers, using stateless JSON (simpler to scale and maintain, as opposed to stateful sessions and streaming responses). stdio for local servers.

**Load framework documentation:**

- **MCP Best Practices**: See references.md - Core guidelines

**For TypeScript (recommended):**
- **TypeScript SDK**: Use WebFetch to load \`https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md\`
- See references.md for the TypeScript Implementation Guide

**For Python:**
- **Python SDK**: Use WebFetch to load \`https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md\`
- See references.md for the Python Implementation Guide

#### 1.4 Plan Your Implementation

**Understand the API:**
Review the service's API documentation to identify key endpoints, authentication requirements, and data models. Use web search and WebFetch as needed.

**Tool Selection:**
Prioritize comprehensive API coverage. List endpoints to implement, starting with the most common operations.

---

### Phase 2: Implementation

#### 2.1 Set Up Project Structure

See language-specific guides in references.md for project setup:
- TypeScript Guide - Project structure, package.json, tsconfig.json
- Python Guide - Module organization, dependencies

#### 2.2 Implement Core Infrastructure

Create shared utilities:
- API client with authentication
- Error handling helpers
- Response formatting (JSON/Markdown)
- Pagination support

#### 2.3 Implement Tools

For each tool:

**Input Schema:**
- Use Zod (TypeScript) or Pydantic (Python)
- Include constraints and clear descriptions
- Add examples in field descriptions

**Output Schema:**
- Define \`outputSchema\` where possible for structured data
- Use \`structuredContent\` in tool responses (TypeScript SDK feature)
- Helps clients understand and process tool outputs

**Tool Description:**
- Concise summary of functionality
- Parameter descriptions
- Return type schema

**Implementation:**
- Async/await for I/O operations
- Proper error handling with actionable messages
- Support pagination where applicable
- Return both text content and structured data when using modern SDKs

**Annotations:**
- \`readOnlyHint\`: true/false
- \`destructiveHint\`: true/false
- \`idempotentHint\`: true/false
- \`openWorldHint\`: true/false

---

### Phase 3: Review and Test

#### 3.1 Code Quality

Review for:
- No duplicated code (DRY principle)
- Consistent error handling
- Full type coverage
- Clear tool descriptions

#### 3.2 Build and Test

**TypeScript:**
- Run \`npm run build\` to verify compilation
- Test with MCP Inspector: \`npx @modelcontextprotocol/inspector\`

**Python:**
- Verify syntax: \`python -m py_compile your_server.py\`
- Test with MCP Inspector

See language-specific guides in references.md for detailed testing approaches and quality checklists.

---

### Phase 4: Create Evaluations

After implementing your MCP server, create comprehensive evaluations to test its effectiveness.

**Load the Evaluation Guide section in references.md for complete evaluation guidelines.**

#### 4.1 Understand Evaluation Purpose

Use evaluations to test whether LLMs can effectively use your MCP server to answer realistic, complex questions.

#### 4.2 Create 10 Evaluation Questions

To create effective evaluations, follow the process outlined in the evaluation guide:

1. **Tool Inspection**: List available tools and understand their capabilities
2. **Content Exploration**: Use READ-ONLY operations to explore available data
3. **Question Generation**: Create 10 complex, realistic questions
4. **Answer Verification**: Solve each question yourself to verify answers

#### 4.3 Evaluation Requirements

Ensure each question is:
- **Independent**: Not dependent on other questions
- **Read-only**: Only non-destructive operations required
- **Complex**: Requiring multiple tool calls and deep exploration
- **Realistic**: Based on real use cases humans would care about
- **Verifiable**: Single, clear answer that can be verified by string comparison
- **Stable**: Answer won't change over time

#### 4.4 Output Format

Create an XML file with this structure:

\`\`\`xml
<evaluation>
  <qa_pair>
    <question>Find discussions about AI model launches with animal codenames. One model needed a specific safety designation that uses the format ASL-X. What number X was being determined for the model named after a spotted wild cat?</question>
    <answer>3</answer>
  </qa_pair>
<!-- More qa_pairs... -->
</evaluation>
\`\`\`

---

# Reference Files

## Documentation Library

Load these resources as needed during development:

### Core MCP Documentation (Load First)
- **MCP Protocol**: Start with sitemap at \`https://modelcontextprotocol.io/sitemap.xml\`, then fetch specific pages with \`.md\` suffix
- **MCP Best Practices** (in references.md) - Universal MCP guidelines including:
  - Server and tool naming conventions
  - Response format guidelines (JSON vs Markdown)
  - Pagination best practices
  - Transport selection (streamable HTTP vs stdio)
  - Security and error handling standards

### SDK Documentation (Load During Phase 1/2)
- **Python SDK**: Fetch from \`https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md\`
- **TypeScript SDK**: Fetch from \`https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md\`

### Language-Specific Implementation Guides (Load During Phase 2)
- **Python Implementation Guide** (in references.md) - Complete Python/FastMCP guide with:
  - Server initialization patterns
  - Pydantic model examples
  - Tool registration with \`@mcp.tool\`
  - Complete working examples
  - Quality checklist

- **TypeScript Implementation Guide** (in references.md) - Complete TypeScript guide with:
  - Project structure
  - Zod schema patterns
  - Tool registration with \`server.registerTool\`
  - Complete working examples
  - Quality checklist

### Evaluation Guide (Load During Phase 4)
- **Evaluation Guide** (in references.md) - Complete evaluation creation guide with:
  - Question creation guidelines
  - Answer verification strategies
  - XML format specifications
  - Example questions and answers
  - Running an evaluation with the provided scripts
`,
  },
  {
    path: "skills/mcp-builder/tools.md",
    content: `# MCP Builder Tools

## Scripts

All scripts are located in the \`scripts/\` directory relative to the skill.

### evaluation.py

MCP Server Evaluation Harness. Evaluates MCP servers by running test questions against them using Claude.

**Usage:**

\`\`\`bash
python scripts/evaluation.py [options] eval_file
\`\`\`

**Arguments:**

| Argument | Description |
|----------|-------------|
| \`eval_file\` | Path to evaluation XML file |
| \`-t, --transport\` | Transport type: \`stdio\`, \`sse\`, or \`http\` (default: \`stdio\`) |
| \`-m, --model\` | Claude model to use (default: \`claude-3-7-sonnet-20250219\`) |
| \`-o, --output\` | Output file for report (default: print to stdout) |
| \`-c, --command\` | Command to run MCP server (stdio only, e.g., \`python\`, \`node\`) |
| \`-a, --args\` | Arguments for the command (stdio only, e.g., \`server.py\`) |
| \`-e, --env\` | Environment variables in \`KEY=VALUE\` format (stdio only) |
| \`-u, --url\` | MCP server URL (sse/http only) |
| \`-H, --header\` | HTTP headers in \`'Key: Value'\` format (sse/http only) |

**Examples:**

\`\`\`bash
# Local STDIO server
python scripts/evaluation.py -t stdio -c python -a my_server.py evaluation.xml

# With environment variables
python scripts/evaluation.py -t stdio -c python -a my_server.py -e API_KEY=abc123 evaluation.xml

# SSE server
python scripts/evaluation.py -t sse -u https://example.com/mcp -H "Authorization: Bearer token" evaluation.xml

# HTTP server with output file
python scripts/evaluation.py -t http -u https://example.com/mcp -o report.md evaluation.xml
\`\`\`

**Important:**
- For **stdio** transport: The script automatically launches and manages the MCP server process. Do not run the server manually.
- For **sse/http** transports: You must start the MCP server separately before running the evaluation.

**Output:** Generates a detailed report including accuracy, average task duration, tool call counts, per-task results with feedback.

---

### connections.py

Lightweight connection handling for MCP servers. Provides connection classes for different transport types.

**Classes:**

| Class | Description |
|-------|-------------|
| \`MCPConnectionStdio\` | MCP connection using standard input/output |
| \`MCPConnectionSSE\` | MCP connection using Server-Sent Events |
| \`MCPConnectionHTTP\` | MCP connection using Streamable HTTP |

**Factory function:**

\`\`\`python
from connections import create_connection

conn = create_connection(
    transport="stdio",  # or "sse", "http"
    command="python",   # stdio only
    args=["server.py"], # stdio only
    url="https://...",  # sse/http only
    headers={...}       # sse/http only
)
\`\`\`

**Usage as async context manager:**

\`\`\`python
async with create_connection(transport="stdio", command="python", args=["server.py"]) as conn:
    tools = await conn.list_tools()
    result = await conn.call_tool("tool_name", {"param": "value"})
\`\`\`

---

### requirements.txt

Dependencies for the evaluation scripts:

\`\`\`
anthropic>=0.39.0
mcp>=1.1.0
\`\`\`

Install with: \`pip install -r scripts/requirements.txt\`

---

### example_evaluation.xml

Example evaluation file demonstrating the XML format for evaluation questions:

\`\`\`xml
<evaluation>
   <qa_pair>
      <question>Calculate the compound interest on \$10,000 invested at 5% annual interest rate, compounded monthly for 3 years. What is the final amount in dollars (rounded to 2 decimal places)?</question>
      <answer>11614.72</answer>
   </qa_pair>
   <!-- More qa_pairs... -->
</evaluation>
\`\`\`
`,
  },
  {
    path: "skills/pdf/references.md",
    content: `# PDF Skill References

This file combines the forms guide and advanced reference documentation for the PDF skill.

## Table of Contents

- [Forms Guide](#forms-guide)
  - [Fillable Fields](#fillable-fields)
  - [Non-fillable Fields](#non-fillable-fields)
  - [Hybrid Approach](#hybrid-approach)
- [Advanced Reference](#advanced-reference)
  - [pypdfium2 Library](#pypdfium2-library)
  - [JavaScript Libraries](#javascript-libraries)
  - [Advanced Command-Line Operations](#advanced-command-line-operations)
  - [Advanced Python Techniques](#advanced-python-techniques)
  - [Complex Workflows](#complex-workflows)
  - [Performance Optimization Tips](#performance-optimization-tips)
  - [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

# Forms Guide

**CRITICAL: You MUST complete these steps in order. Do not skip ahead to writing code.**

If you need to fill out a PDF form, first check to see if the PDF has fillable form fields. Run this script from this file's directory:
 \`python scripts/check_fillable_fields <file.pdf>\`, and depending on the result go to either the "Fillable fields" or "Non-fillable fields" and follow those instructions.

## Fillable Fields

If the PDF has fillable form fields:
- Run this script from this file's directory: \`python scripts/extract_form_field_info.py <input.pdf> <field_info.json>\`. It will create a JSON file with a list of fields in this format:
\`\`\`
[
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "rect": ([left, bottom, right, top] bounding box in PDF coordinates, y=0 is the bottom of the page),
    "type": ("text", "checkbox", "radio_group", or "choice"),
  },
  // Checkboxes have "checked_value" and "unchecked_value" properties:
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "checkbox",
    "checked_value": (Set the field to this value to check the checkbox),
    "unchecked_value": (Set the field to this value to uncheck the checkbox),
  },
  // Radio groups have a "radio_options" list with the possible choices.
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "radio_group",
    "radio_options": [
      {
        "value": (set the field to this value to select this radio option),
        "rect": (bounding box for the radio button for this option)
      },
    ]
  },
  // Multiple choice fields have a "choice_options" list with the possible choices:
  {
    "field_id": (unique ID for the field),
    "page": (page number, 1-based),
    "type": "choice",
    "choice_options": [
      {
        "value": (set the field to this value to select this option),
        "text": (display text of the option)
      },
    ],
  }
]
\`\`\`
- Convert the PDF to PNGs (one image for each page) with this script (run from this file's directory):
\`python scripts/convert_pdf_to_images.py <file.pdf> <output_directory>\`
Then analyze the images to determine the purpose of each form field (make sure to convert the bounding box PDF coordinates to image coordinates).
- Create a \`field_values.json\` file in this format with the values to be entered for each field:
\`\`\`
[
  {
    "field_id": "last_name",
    "description": "The user's last name",
    "page": 1,
    "value": "Simpson"
  },
  {
    "field_id": "Checkbox12",
    "description": "Checkbox to be checked if the user is 18 or over",
    "page": 1,
    "value": "/On"
  },
]
\`\`\`
- Run the \`fill_fillable_fields.py\` script from this file's directory to create a filled-in PDF:
\`python scripts/fill_fillable_fields.py <input pdf> <field_values.json> <output pdf>\`
This script will verify that the field IDs and values you provide are valid; if it prints error messages, correct the appropriate fields and try again.

## Non-fillable Fields

If the PDF doesn't have fillable form fields, you'll add text annotations. First try to extract coordinates from the PDF structure (more accurate), then fall back to visual estimation if needed.

### Step 1: Try Structure Extraction First

Run this script to extract text labels, lines, and checkboxes with their exact PDF coordinates:
\`python scripts/extract_form_structure.py <input.pdf> form_structure.json\`

This creates a JSON file containing:
- **labels**: Every text element with exact coordinates (x0, top, x1, bottom in PDF points)
- **lines**: Horizontal lines that define row boundaries
- **checkboxes**: Small square rectangles that are checkboxes (with center coordinates)
- **row_boundaries**: Row top/bottom positions calculated from horizontal lines

**Check the results**: If \`form_structure.json\` has meaningful labels, use **Approach A: Structure-Based Coordinates**. If the PDF is scanned/image-based, use **Approach B: Visual Estimation**.

---

### Approach A: Structure-Based Coordinates (Preferred)

Use this when \`extract_form_structure.py\` found text labels in the PDF.

#### A.1: Analyze the Structure

Read form_structure.json and identify:
1. **Label groups**: Adjacent text elements that form a single label
2. **Row structure**: Labels with similar \`top\` values are in the same row
3. **Field columns**: Entry areas start after label ends
4. **Checkboxes**: Use the checkbox coordinates directly from the structure

**Coordinate system**: PDF coordinates where y=0 is at TOP of page, y increases downward.

#### A.2: Check for Missing Elements

The structure extraction may not detect all form elements (circular checkboxes, complex graphics, faded elements). Use visual analysis for those specific fields.

#### A.3: Create fields.json with PDF Coordinates

For each field, calculate entry coordinates from the extracted structure:

**Text fields:**
- entry x0 = label x1 + 5
- entry x1 = next label's x0, or row boundary
- entry top = same as label top
- entry bottom = row boundary line below

**Checkboxes:**
- Use the checkbox rectangle coordinates directly from form_structure.json

Create fields.json using \`pdf_width\` and \`pdf_height\`:
\`\`\`json
{
  "pages": [
    {"page_number": 1, "pdf_width": 612, "pdf_height": 792}
  ],
  "form_fields": [
    {
      "page_number": 1,
      "description": "Last name entry field",
      "field_label": "Last Name",
      "label_bounding_box": [43, 63, 87, 73],
      "entry_bounding_box": [92, 63, 260, 79],
      "entry_text": {"text": "Smith", "font_size": 10}
    },
    {
      "page_number": 1,
      "description": "US Citizen Yes checkbox",
      "field_label": "Yes",
      "label_bounding_box": [260, 200, 280, 210],
      "entry_bounding_box": [285, 197, 292, 205],
      "entry_text": {"text": "X"}
    }
  ]
}
\`\`\`

#### A.4: Validate Bounding Boxes

Before filling, check your bounding boxes for errors:
\`python scripts/check_bounding_boxes.py fields.json\`

---

### Approach B: Visual Estimation (Fallback)

Use this when the PDF is scanned/image-based and structure extraction found no usable text labels.

#### B.1: Convert PDF to Images

\`python scripts/convert_pdf_to_images.py <input.pdf> <images_dir/>\`

#### B.2: Initial Field Identification

Examine each page image to identify form sections and get rough estimates of field locations.

#### B.3: Zoom Refinement (CRITICAL for accuracy)

For each field, crop a region around the estimated position to refine coordinates precisely.

\`\`\`bash
magick <page_image> -crop <width>x<height>+<x>+<y> +repage <crop_output.png>
\`\`\`

Convert crop coordinates back to full image coordinates:
- full_x = crop_x + crop_offset_x
- full_y = crop_y + crop_offset_y

#### B.4: Create fields.json with Refined Coordinates

Create fields.json using \`image_width\` and \`image_height\`.

#### B.5: Validate Bounding Boxes

\`python scripts/check_bounding_boxes.py fields.json\`

---

## Hybrid Approach

Use this when structure extraction works for most fields but misses some elements.

1. **Use Approach A** for fields detected in form_structure.json
2. **Convert PDF to images** for visual analysis of missing fields
3. **Use zoom refinement** for the missing fields
4. **Combine coordinates**: Convert image coordinates to PDF coordinates:
   - pdf_x = image_x * (pdf_width / image_width)
   - pdf_y = image_y * (pdf_height / image_height)
5. **Use a single coordinate system** in fields.json

---

## Filling the Form

### Step 2: Validate Before Filling
\`python scripts/check_bounding_boxes.py fields.json\`

### Step 3: Fill the Form
\`python scripts/fill_pdf_form_with_annotations.py <input.pdf> fields.json <output.pdf>\`

### Step 4: Verify Output
\`python scripts/convert_pdf_to_images.py <output.pdf> <verify_images/>\`

---

# Advanced Reference

## pypdfium2 Library (Apache/BSD License)

### Overview
pypdfium2 is a Python binding for PDFium (Chromium's PDF library). Excellent for fast PDF rendering, image generation, and serves as a PyMuPDF replacement.

### Render PDF to Images
\`\`\`python
import pypdfium2 as pdfium
from PIL import Image

pdf = pdfium.PdfDocument("document.pdf")
page = pdf[0]
bitmap = page.render(scale=2.0, rotation=0)
img = bitmap.to_pil()
img.save("page_1.png", "PNG")

for i, page in enumerate(pdf):
    bitmap = page.render(scale=1.5)
    img = bitmap.to_pil()
    img.save(f"page_{i+1}.jpg", "JPEG", quality=90)
\`\`\`

### Extract Text with pypdfium2
\`\`\`python
import pypdfium2 as pdfium

pdf = pdfium.PdfDocument("document.pdf")
for i, page in enumerate(pdf):
    text = page.get_text()
    print(f"Page {i+1} text length: {len(text)} chars")
\`\`\`

## JavaScript Libraries

### pdf-lib (MIT License)

#### Load and Manipulate Existing PDF
\`\`\`javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function manipulatePDF() {
    const existingPdfBytes = fs.readFileSync('input.pdf');
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pageCount = pdfDoc.getPageCount();

    const newPage = pdfDoc.addPage([600, 400]);
    newPage.drawText('Added by pdf-lib', { x: 100, y: 300, size: 16 });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('modified.pdf', pdfBytes);
}
\`\`\`

#### Create Complex PDFs from Scratch
\`\`\`javascript
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';

async function createPDF() {
    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    page.drawText('Invoice #12345', {
        x: 50, y: height - 50, size: 18,
        font: helveticaBold, color: rgb(0.2, 0.2, 0.8)
    });

    page.drawRectangle({
        x: 40, y: height - 100, width: width - 80, height: 30,
        color: rgb(0.9, 0.9, 0.9)
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('created.pdf', pdfBytes);
}
\`\`\`

#### Advanced Merge and Split Operations
\`\`\`javascript
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

async function mergePDFs() {
    const mergedPdf = await PDFDocument.create();
    const pdf1 = await PDFDocument.load(fs.readFileSync('doc1.pdf'));
    const pdf2 = await PDFDocument.load(fs.readFileSync('doc2.pdf'));

    const pdf1Pages = await mergedPdf.copyPages(pdf1, pdf1.getPageIndices());
    pdf1Pages.forEach(page => mergedPdf.addPage(page));

    const pdf2Pages = await mergedPdf.copyPages(pdf2, [0, 2, 4]);
    pdf2Pages.forEach(page => mergedPdf.addPage(page));

    fs.writeFileSync('merged.pdf', await mergedPdf.save());
}
\`\`\`

### pdfjs-dist (Apache License)

#### Basic PDF Loading and Text Extraction
\`\`\`javascript
import * as pdfjsLib from 'pdfjs-dist';

async function extractText() {
    const pdf = await pdfjsLib.getDocument('document.pdf').promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += \`\\n--- Page \${i} ---\\n\${pageText}\`;
    }
    return fullText;
}
\`\`\`

## Advanced Command-Line Operations

### poppler-utils Advanced Features

\`\`\`bash
# Extract text with bounding box coordinates
pdftotext -bbox-layout document.pdf output.xml

# Convert to PNG images with specific resolution
pdftoppm -png -r 300 document.pdf output_prefix

# Convert specific page range with high resolution
pdftoppm -png -r 600 -f 1 -l 3 document.pdf high_res_pages

# Extract all embedded images with metadata
pdfimages -j -p document.pdf page_images

# List image info without extracting
pdfimages -list document.pdf
\`\`\`

### qpdf Advanced Features

\`\`\`bash
# Split PDF into groups of pages
qpdf --split-pages=3 input.pdf output_group_%02d.pdf

# Extract specific pages with complex ranges
qpdf input.pdf --pages input.pdf 1,3-5,8,10-end -- extracted.pdf

# Merge specific pages from multiple PDFs
qpdf --empty --pages doc1.pdf 1-3 doc2.pdf 5-7 doc3.pdf 2,4 -- combined.pdf

# Optimize PDF for web (linearize)
qpdf --linearize input.pdf optimized.pdf

# Attempt to repair corrupted PDF structure
qpdf --check input.pdf
qpdf --fix-qdf damaged.pdf repaired.pdf

# Add password protection with specific permissions
qpdf --encrypt user_pass owner_pass 256 --print=none --modify=none -- input.pdf encrypted.pdf
\`\`\`

## Advanced Python Techniques

### pdfplumber Advanced Features

\`\`\`python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    page = pdf.pages[0]

    # Extract all text with coordinates
    chars = page.chars
    for char in chars[:10]:
        print(f"Char: '{char['text']}' at x:{char['x0']:.1f} y:{char['y0']:.1f}")

    # Extract text by bounding box
    bbox_text = page.within_bbox((100, 100, 400, 200)).extract_text()
\`\`\`

### Advanced Table Extraction with Custom Settings
\`\`\`python
import pdfplumber
import pandas as pd

with pdfplumber.open("complex_table.pdf") as pdf:
    page = pdf.pages[0]
    table_settings = {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 3,
        "intersection_tolerance": 15
    }
    tables = page.extract_tables(table_settings)
\`\`\`

### reportlab Professional Reports with Tables
\`\`\`python
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

data = [
    ['Product', 'Q1', 'Q2', 'Q3', 'Q4'],
    ['Widgets', '120', '135', '142', '158'],
    ['Gadgets', '85', '92', '98', '105']
]

doc = SimpleDocTemplate("report.pdf")
elements = []
styles = getSampleStyleSheet()
elements.append(Paragraph("Quarterly Sales Report", styles['Title']))

table = Table(data)
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('GRID', (0, 0), (-1, -1), 1, colors.black)
]))
elements.append(table)
doc.build(elements)
\`\`\`

## Complex Workflows

### Extract Figures/Images from PDF

\`\`\`bash
# Method 1: Using pdfimages (fastest)
pdfimages -all document.pdf images/img
\`\`\`

### Batch PDF Processing
\`\`\`python
import os, glob
from pypdf import PdfReader, PdfWriter
import logging

def batch_process_pdfs(input_dir, operation='merge'):
    pdf_files = glob.glob(os.path.join(input_dir, "*.pdf"))

    if operation == 'merge':
        writer = PdfWriter()
        for pdf_file in pdf_files:
            try:
                reader = PdfReader(pdf_file)
                for page in reader.pages:
                    writer.add_page(page)
            except Exception as e:
                logging.error(f"Failed to process {pdf_file}: {e}")
        with open("batch_merged.pdf", "wb") as output:
            writer.write(output)
\`\`\`

### Advanced PDF Cropping
\`\`\`python
from pypdf import PdfWriter, PdfReader

reader = PdfReader("input.pdf")
writer = PdfWriter()
page = reader.pages[0]
page.mediabox.left = 50
page.mediabox.bottom = 50
page.mediabox.right = 550
page.mediabox.top = 750
writer.add_page(page)
with open("cropped.pdf", "wb") as output:
    writer.write(output)
\`\`\`

## Performance Optimization Tips

1. **For Large PDFs**: Use streaming approaches; use \`qpdf --split-pages\` for splitting
2. **For Text Extraction**: \`pdftotext -bbox-layout\` is fastest for plain text
3. **For Image Extraction**: \`pdfimages\` is much faster than rendering pages
4. **For Form Filling**: pdf-lib maintains form structure better than most alternatives
5. **Memory Management**: Process PDFs in chunks for large files

## Troubleshooting Common Issues

### Encrypted PDFs
\`\`\`python
from pypdf import PdfReader
reader = PdfReader("encrypted.pdf")
if reader.is_encrypted:
    reader.decrypt("password")
\`\`\`

### Corrupted PDFs
\`\`\`bash
qpdf --check corrupted.pdf
qpdf --replace-input corrupted.pdf
\`\`\`

### Text Extraction Issues (Fallback to OCR)
\`\`\`python
import pytesseract
from pdf2image import convert_from_path

def extract_text_with_ocr(pdf_path):
    images = convert_from_path(pdf_path)
    return "".join(pytesseract.image_to_string(img) for img in images)
\`\`\`

## License Information

- **pypdf**: BSD License
- **pdfplumber**: MIT License
- **pypdfium2**: Apache/BSD License
- **reportlab**: BSD License
- **poppler-utils**: GPL-2 License
- **qpdf**: Apache License
- **pdf-lib**: MIT License
- **pdfjs-dist**: Apache License
`,
  },
  {
    path: "skills/pdf/skill.md",
    content: `---
name: pdf
description: "Read, create, merge, split, watermark, encrypt, OCR, and extract content from PDF files."
tags:
  - pdf
  - document
  - forms
  - extraction
---

# PDF Processing Guide

## Overview

This guide covers essential PDF processing operations using Python libraries and command-line tools. For advanced features, JavaScript libraries, and detailed examples, see references.md. If you need to fill out a PDF form, read the Forms section in references.md and follow its instructions.

## Quick Start

\`\`\`python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
\`\`\`

## Python Libraries

### pypdf - Basic Operations

#### Merge PDFs
\`\`\`python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
\`\`\`

#### Split PDF
\`\`\`python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
\`\`\`

#### Extract Metadata
\`\`\`python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}")
print(f"Author: {meta.author}")
print(f"Subject: {meta.subject}")
print(f"Creator: {meta.creator}")
\`\`\`

#### Rotate Pages
\`\`\`python
reader = PdfReader("input.pdf")
writer = PdfWriter()

page = reader.pages[0]
page.rotate(90)  # Rotate 90 degrees clockwise
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
\`\`\`

### pdfplumber - Text and Table Extraction

#### Extract Text with Layout
\`\`\`python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
\`\`\`

#### Extract Tables
\`\`\`python
with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"Table {j+1} on page {i+1}:")
            for row in table:
                print(row)
\`\`\`

#### Advanced Table Extraction
\`\`\`python
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:  # Check if table is not empty
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

# Combine all tables
if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
\`\`\`

### reportlab - Create PDFs

#### Basic PDF Creation
\`\`\`python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter

# Add text
c.drawString(100, height - 100, "Hello World!")
c.drawString(100, height - 120, "This is a PDF created with reportlab")

# Add a line
c.line(100, height - 140, 400, height - 140)

# Save
c.save()
\`\`\`

#### Create PDF with Multiple Pages
\`\`\`python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# Add content
title = Paragraph("Report Title", styles['Title'])
story.append(title)
story.append(Spacer(1, 12))

body = Paragraph("This is the body of the report. " * 20, styles['Normal'])
story.append(body)
story.append(PageBreak())

# Page 2
story.append(Paragraph("Page 2", styles['Heading1']))
story.append(Paragraph("Content for page 2", styles['Normal']))

# Build PDF
doc.build(story)
\`\`\`

#### Subscripts and Superscripts

**IMPORTANT**: Never use Unicode subscript/superscript characters in ReportLab PDFs. The built-in fonts do not include these glyphs, causing them to render as solid black boxes.

Instead, use ReportLab's XML markup tags in Paragraph objects:
\`\`\`python
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet

styles = getSampleStyleSheet()

# Subscripts: use <sub> tag
chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])

# Superscripts: use <super> tag
squared = Paragraph("x<super>2</super> + y<super>2</super>", styles['Normal'])
\`\`\`

For canvas-drawn text (not Paragraph objects), manually adjust font the size and position rather than using Unicode subscripts/superscripts.

## Command-Line Tools

### pdftotext (poppler-utils)
\`\`\`bash
# Extract text
pdftotext input.pdf output.txt

# Extract text preserving layout
pdftotext -layout input.pdf output.txt

# Extract specific pages
pdftotext -f 1 -l 5 input.pdf output.txt  # Pages 1-5
\`\`\`

### qpdf
\`\`\`bash
# Merge PDFs
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Split pages
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf
qpdf input.pdf --pages . 6-10 -- pages6-10.pdf

# Rotate pages
qpdf input.pdf output.pdf --rotate=+90:1  # Rotate page 1 by 90 degrees

# Remove password
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf
\`\`\`

### pdftk (if available)
\`\`\`bash
# Merge
pdftk file1.pdf file2.pdf cat output merged.pdf

# Split
pdftk input.pdf burst

# Rotate
pdftk input.pdf rotate 1east output rotated.pdf
\`\`\`

## Common Tasks

### Extract Text from Scanned PDFs
\`\`\`python
# Requires: pip install pytesseract pdf2image
import pytesseract
from pdf2image import convert_from_path

# Convert PDF to images
images = convert_from_path('scanned.pdf')

# OCR each page
text = ""
for i, image in enumerate(images):
    text += f"Page {i+1}:\\n"
    text += pytesseract.image_to_string(image)
    text += "\\n\\n"

print(text)
\`\`\`

### Add Watermark
\`\`\`python
from pypdf import PdfReader, PdfWriter

# Create watermark (or load existing)
watermark = PdfReader("watermark.pdf").pages[0]

# Apply to all pages
reader = PdfReader("document.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
\`\`\`

### Extract Images
\`\`\`bash
# Using pdfimages (poppler-utils)
pdfimages -j input.pdf output_prefix

# This extracts all images as output_prefix-000.jpg, output_prefix-001.jpg, etc.
\`\`\`

### Password Protection
\`\`\`python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()

for page in reader.pages:
    writer.add_page(page)

# Add password
writer.encrypt("userpassword", "ownerpassword")

with open("encrypted.pdf", "wb") as output:
    writer.write(output)
\`\`\`

## Quick Reference

| Task | Best Tool | Command/Code |
|------|-----------|--------------|
| Merge PDFs | pypdf | \`writer.add_page(page)\` |
| Split PDFs | pypdf | One page per file |
| Extract text | pdfplumber | \`page.extract_text()\` |
| Extract tables | pdfplumber | \`page.extract_tables()\` |
| Create PDFs | reportlab | Canvas or Platypus |
| Command line merge | qpdf | \`qpdf --empty --pages ...\` |
| OCR scanned PDFs | pytesseract | Convert to image first |
| Fill PDF forms | pdf-lib or pypdf (see references.md) | See Forms section in references.md |

## Next Steps

- For advanced pypdfium2 usage, see references.md
- For JavaScript libraries (pdf-lib), see references.md
- If you need to fill out a PDF form, follow the instructions in the Forms section of references.md
- For troubleshooting guides, see references.md
`,
  },
  {
    path: "skills/pdf/tools.md",
    content: `# PDF Tools

## Scripts

All scripts are located in the \`scripts/\` directory relative to the skill.

### check_fillable_fields.py

Checks whether a PDF has fillable form fields.

**Usage:**
\`\`\`bash
python scripts/check_fillable_fields.py <file.pdf>
\`\`\`

**Output:** Prints either "This PDF has fillable form fields" or "This PDF does not have fillable form fields; you will need to visually determine where to enter data".

---

### extract_form_field_info.py

Extracts detailed information about fillable form fields from a PDF.

**Usage:**
\`\`\`bash
python scripts/extract_form_field_info.py <input.pdf> <field_info.json>
\`\`\`

**Output:** Creates a JSON file listing all form fields with their IDs, page numbers, bounding boxes, and types (text, checkbox, radio_group, choice). Includes checked/unchecked values for checkboxes, radio options for radio groups, and choice options for dropdowns.

---

### convert_pdf_to_images.py

Converts a PDF file to PNG images, one per page.

**Usage:**
\`\`\`bash
python scripts/convert_pdf_to_images.py <file.pdf> <output_directory>
\`\`\`

**Output:** Creates \`page_1.png\`, \`page_2.png\`, etc. in the output directory.

---

### extract_form_structure.py

Extracts text labels, lines, and checkboxes with exact PDF coordinates from a non-fillable PDF form.

**Usage:**
\`\`\`bash
python scripts/extract_form_structure.py <input.pdf> <form_structure.json>
\`\`\`

**Output:** JSON file containing:
- \`labels\`: Every text element with exact coordinates (x0, top, x1, bottom in PDF points)
- \`lines\`: Horizontal lines that define row boundaries
- \`checkboxes\`: Small square rectangles with center coordinates
- \`row_boundaries\`: Row top/bottom positions

---

### check_bounding_boxes.py

Validates bounding boxes in a fields.json file before filling a form.

**Usage:**
\`\`\`bash
python scripts/check_bounding_boxes.py <fields.json>
\`\`\`

**Checks for:**
- Intersecting bounding boxes (which would cause overlapping text)
- Entry boxes that are too small for the specified font size

---

### fill_fillable_fields.py

Fills fillable form fields in a PDF using specified values.

**Usage:**
\`\`\`bash
python scripts/fill_fillable_fields.py <input.pdf> <field_values.json> <output.pdf>
\`\`\`

**Input format (field_values.json):**
\`\`\`json
[
  {"field_id": "last_name", "description": "...", "page": 1, "value": "Simpson"},
  {"field_id": "Checkbox12", "description": "...", "page": 1, "value": "/On"}
]
\`\`\`

Validates field IDs and values; prints error messages if invalid.

---

### fill_pdf_form_with_annotations.py

Fills non-fillable PDF forms by adding text annotations at specified coordinates.

**Usage:**
\`\`\`bash
python scripts/fill_pdf_form_with_annotations.py <input.pdf> <fields.json> <output.pdf>
\`\`\`

Auto-detects coordinate system (PDF or image coordinates) from the \`pages\` array in fields.json (looks for \`pdf_width\`/\`pdf_height\` vs \`image_width\`/\`image_height\`).

---

### create_validation_image.py

Creates a validation image overlaying bounding boxes on a PDF page for visual verification.

**Usage:**
\`\`\`bash
python scripts/create_validation_image.py <args>
\`\`\`

Used to visually verify that field coordinates are correct before filling.
`,
  },
  {
    path: "skills/pptx/references.md",
    content: `# PPTX Skill References

This file combines the editing guide and PptxGenJS tutorial for the PPTX skill.

## Table of Contents

- [Editing Presentations](#editing-presentations)
  - [Template-Based Workflow](#template-based-workflow)
  - [Scripts](#scripts)
  - [Slide Operations](#slide-operations)
  - [Editing Content](#editing-content)
  - [Common Pitfalls](#common-pitfalls)
- [PptxGenJS Tutorial](#pptxgenjs-tutorial)
  - [Setup & Basic Structure](#setup--basic-structure)
  - [Text & Formatting](#text--formatting)
  - [Lists & Bullets](#lists--bullets)
  - [Shapes](#shapes)
  - [Images](#images)
  - [Icons](#icons)
  - [Slide Backgrounds](#slide-backgrounds)
  - [Tables](#tables)
  - [Charts](#charts)
  - [Slide Masters](#slide-masters)
  - [Common Pitfalls (PptxGenJS)](#common-pitfalls-pptxgenjs)

---

# Editing Presentations

## Template-Based Workflow

When using an existing presentation as a template:

1. **Analyze existing slides**:
   \`\`\`bash
   python scripts/thumbnail.py template.pptx
   python -m markitdown template.pptx
   \`\`\`
   Review \`thumbnails.jpg\` to see layouts, and markitdown output to see placeholder text.

2. **Plan slide mapping**: For each content section, choose a template slide.

   **USE VARIED LAYOUTS** -- monotonous presentations are a common failure mode. Don't default to basic title + bullet slides. Actively seek out:
   - Multi-column layouts (2-column, 3-column)
   - Image + text combinations
   - Full-bleed images with text overlay
   - Quote or callout slides
   - Section dividers
   - Stat/number callouts
   - Icon grids or icon + text rows

   **Avoid:** Repeating the same text-heavy layout for every slide.

   Match content type to layout style (e.g., key points -> bullet slide, team info -> multi-column, testimonials -> quote slide).

3. **Unpack**: \`python scripts/office/unpack.py template.pptx unpacked/\`

4. **Build presentation** (do this yourself, not with subagents):
   - Delete unwanted slides (remove from \`<p:sldIdLst>\`)
   - Duplicate slides you want to reuse (\`add_slide.py\`)
   - Reorder slides in \`<p:sldIdLst>\`
   - **Complete all structural changes before step 5**

5. **Edit content**: Update text in each \`slide{N}.xml\`.
   **Use subagents here if available** -- slides are separate XML files, so subagents can edit in parallel.

6. **Clean**: \`python scripts/clean.py unpacked/\`

7. **Pack**: \`python scripts/office/pack.py unpacked/ output.pptx --original template.pptx\`

---

## Scripts

| Script | Purpose |
|--------|---------|
| \`unpack.py\` | Extract and pretty-print PPTX |
| \`add_slide.py\` | Duplicate slide or create from layout |
| \`clean.py\` | Remove orphaned files |
| \`pack.py\` | Repack with validation |
| \`thumbnail.py\` | Create visual grid of slides |

### unpack.py

\`\`\`bash
python scripts/office/unpack.py input.pptx unpacked/
\`\`\`

Extracts PPTX, pretty-prints XML, escapes smart quotes.

### add_slide.py

\`\`\`bash
python scripts/add_slide.py unpacked/ slide2.xml      # Duplicate slide
python scripts/add_slide.py unpacked/ slideLayout2.xml # From layout
\`\`\`

Prints \`<p:sldId>\` to add to \`<p:sldIdLst>\` at desired position.

### clean.py

\`\`\`bash
python scripts/clean.py unpacked/
\`\`\`

Removes slides not in \`<p:sldIdLst>\`, unreferenced media, orphaned rels.

### pack.py

\`\`\`bash
python scripts/office/pack.py unpacked/ output.pptx --original input.pptx
\`\`\`

Validates, repairs, condenses XML, re-encodes smart quotes.

### thumbnail.py

\`\`\`bash
python scripts/thumbnail.py input.pptx [output_prefix] [--cols N]
\`\`\`

Creates \`thumbnails.jpg\` with slide filenames as labels. Default 3 columns, max 12 per grid.

**Use for template analysis only** (choosing layouts). For visual QA, use \`soffice\` + \`pdftoppm\` to create full-resolution individual slide images.

---

## Slide Operations

Slide order is in \`ppt/presentation.xml\` -> \`<p:sldIdLst>\`.

**Reorder**: Rearrange \`<p:sldId>\` elements.

**Delete**: Remove \`<p:sldId>\`, then run \`clean.py\`.

**Add**: Use \`add_slide.py\`. Never manually copy slide files -- the script handles notes references, Content_Types.xml, and relationship IDs that manual copying misses.

---

## Editing Content

**Subagents:** If available, use them here (after completing step 4). Each slide is a separate XML file, so subagents can edit in parallel. In your prompt to subagents, include:
- The slide file path(s) to edit
- **"Use the Edit tool for all changes"**
- The formatting rules and common pitfalls below

For each slide:
1. Read the slide's XML
2. Identify ALL placeholder content -- text, images, charts, icons, captions
3. Replace each placeholder with final content

**Use the Edit tool, not sed or Python scripts.** The Edit tool forces specificity about what to replace and where, yielding better reliability.

### Formatting Rules

- **Bold all headers, subheadings, and inline labels**: Use \`b="1"\` on \`<a:rPr>\`. This includes:
  - Slide titles
  - Section headers within a slide
  - Inline labels like (e.g.: "Status:", "Description:") at the start of a line
- **Never use unicode bullets**: Use proper list formatting with \`<a:buChar>\` or \`<a:buAutoNum>\`
- **Bullet consistency**: Let bullets inherit from the layout. Only specify \`<a:buChar>\` or \`<a:buNone>\`.

---

## Common Pitfalls

### Template Adaptation

When source content has fewer items than the template:
- **Remove excess elements entirely** (images, shapes, text boxes), don't just clear text
- Check for orphaned visuals after clearing text content
- Run visual QA to catch mismatched counts

When replacing text with different length content:
- **Shorter replacements**: Usually safe
- **Longer replacements**: May overflow or wrap unexpectedly
- Test with visual QA after text changes
- Consider truncating or splitting content to fit

**Template slots != Source items**: If template has 4 team members but source has 3 users, delete the 4th member's entire group (image + text boxes), not just the text.

### Multi-Item Content

If source has multiple items (numbered lists, multiple sections), create separate \`<a:p>\` elements for each -- **never concatenate into one string**.

**WRONG** -- all items in one paragraph:
\`\`\`xml
<a:p>
  <a:r><a:rPr .../><a:t>Step 1: Do the first thing. Step 2: Do the second thing.</a:t></a:r>
</a:p>
\`\`\`

**CORRECT** -- separate paragraphs with bold headers:
\`\`\`xml
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 1</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" .../><a:t>Do the first thing.</a:t></a:r>
</a:p>
\`\`\`

Copy \`<a:pPr>\` from the original paragraph to preserve line spacing. Use \`b="1"\` on headers.

### Smart Quotes

Handled automatically by unpack/pack. But the Edit tool converts smart quotes to ASCII.

**When adding new text with quotes, use XML entities:**

\`\`\`xml
<a:t>the &#x201C;Agreement&#x201D;</a:t>
\`\`\`

| Character | Name | Unicode | XML Entity |
|-----------|------|---------|------------|
| \\u201c | Left double quote | U+201C | \`&#x201C;\` |
| \\u201d | Right double quote | U+201D | \`&#x201D;\` |
| \\u2018 | Left single quote | U+2018 | \`&#x2018;\` |
| \\u2019 | Right single quote | U+2019 | \`&#x2019;\` |

### Other

- **Whitespace**: Use \`xml:space="preserve"\` on \`<a:t>\` with leading/trailing spaces
- **XML parsing**: Use \`defusedxml.minidom\`, not \`xml.etree.ElementTree\` (corrupts namespaces)

---

# PptxGenJS Tutorial

## Setup & Basic Structure

\`\`\`javascript
const pptxgen = require("pptxgenjs");

let pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.author = 'Your Name';
pres.title = 'Presentation Title';

let slide = pres.addSlide();
slide.addText("Hello World!", { x: 0.5, y: 0.5, fontSize: 36, color: "363636" });

pres.writeFile({ fileName: "Presentation.pptx" });
\`\`\`

## Layout Dimensions

Slide dimensions (coordinates in inches):
- \`LAYOUT_16x9\`: 10" x 5.625" (default)
- \`LAYOUT_16x10\`: 10" x 6.25"
- \`LAYOUT_4x3\`: 10" x 7.5"
- \`LAYOUT_WIDE\`: 13.3" x 7.5"

---

## Text & Formatting

\`\`\`javascript
// Basic text
slide.addText("Simple Text", {
  x: 1, y: 1, w: 8, h: 2, fontSize: 24, fontFace: "Arial",
  color: "363636", bold: true, align: "center", valign: "middle"
});

// Character spacing (use charSpacing, not letterSpacing which is silently ignored)
slide.addText("SPACED TEXT", { x: 1, y: 1, w: 8, h: 1, charSpacing: 6 });

// Rich text arrays
slide.addText([
  { text: "Bold ", options: { bold: true } },
  { text: "Italic ", options: { italic: true } }
], { x: 1, y: 3, w: 8, h: 1 });

// Multi-line text (requires breakLine: true)
slide.addText([
  { text: "Line 1", options: { breakLine: true } },
  { text: "Line 2", options: { breakLine: true } },
  { text: "Line 3" }
], { x: 0.5, y: 0.5, w: 8, h: 2 });

// Text box margin (internal padding)
slide.addText("Title", {
  x: 0.5, y: 0.3, w: 9, h: 0.6,
  margin: 0  // Use 0 when aligning text with other elements
});
\`\`\`

**Tip:** Text boxes have internal margin by default. Set \`margin: 0\` when you need text to align precisely with shapes, lines, or icons at the same x-position.

---

## Lists & Bullets

\`\`\`javascript
// Multiple bullets
slide.addText([
  { text: "First item", options: { bullet: true, breakLine: true } },
  { text: "Second item", options: { bullet: true, breakLine: true } },
  { text: "Third item", options: { bullet: true } }
], { x: 0.5, y: 0.5, w: 8, h: 3 });

// NEVER use unicode bullets -- creates double bullets
// Sub-items and numbered lists
{ text: "Sub-item", options: { bullet: true, indentLevel: 1 } }
{ text: "First", options: { bullet: { type: "number" }, breakLine: true } }
\`\`\`

---

## Shapes

\`\`\`javascript
slide.addShape(pres.shapes.RECTANGLE, {
  x: 0.5, y: 0.8, w: 1.5, h: 3.0,
  fill: { color: "FF0000" }, line: { color: "000000", width: 2 }
});

slide.addShape(pres.shapes.OVAL, { x: 4, y: 1, w: 2, h: 2, fill: { color: "0000FF" } });

slide.addShape(pres.shapes.LINE, {
  x: 1, y: 3, w: 5, h: 0, line: { color: "FF0000", width: 3, dashType: "dash" }
});

// With transparency
slide.addShape(pres.shapes.RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: "0088CC", transparency: 50 }
});

// Rounded rectangle (rectRadius only works with ROUNDED_RECTANGLE, not RECTANGLE)
// Don't pair with rectangular accent overlays -- they won't cover rounded corners
slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: "FFFFFF" }, rectRadius: 0.1
});

// With shadow
slide.addShape(pres.shapes.RECTANGLE, {
  x: 1, y: 1, w: 3, h: 2,
  fill: { color: "FFFFFF" },
  shadow: { type: "outer", color: "000000", blur: 6, offset: 2, angle: 135, opacity: 0.15 }
});
\`\`\`

Shadow options:

| Property | Type | Range | Notes |
|----------|------|-------|-------|
| \`type\` | string | \`"outer"\`, \`"inner"\` | |
| \`color\` | string | 6-char hex (e.g. \`"000000"\`) | No \`#\` prefix, no 8-char hex |
| \`blur\` | number | 0-100 pt | |
| \`offset\` | number | 0-200 pt | **Must be non-negative** -- negative values corrupt the file |
| \`angle\` | number | 0-359 degrees | Direction the shadow falls (135 = bottom-right, 270 = upward) |
| \`opacity\` | number | 0.0-1.0 | Use this for transparency, never encode in color string |

To cast a shadow upward, use \`angle: 270\` with a positive offset -- do **not** use a negative offset.

**Note**: Gradient fills are not natively supported. Use a gradient image as a background instead.

---

## Images

### Image Sources

\`\`\`javascript
// From file path
slide.addImage({ path: "images/chart.png", x: 1, y: 1, w: 5, h: 3 });

// From URL
slide.addImage({ path: "https://example.com/image.jpg", x: 1, y: 1, w: 5, h: 3 });

// From base64 (faster, no file I/O)
slide.addImage({ data: "image/png;base64,iVBORw0KGgo...", x: 1, y: 1, w: 5, h: 3 });
\`\`\`

### Image Options

\`\`\`javascript
slide.addImage({
  path: "image.png",
  x: 1, y: 1, w: 5, h: 3,
  rotate: 45,
  rounding: true,          // Circular crop
  transparency: 50,
  altText: "Description",
  hyperlink: { url: "https://example.com" }
});
\`\`\`

### Image Sizing Modes

\`\`\`javascript
// Contain - fit inside, preserve ratio
{ sizing: { type: 'contain', w: 4, h: 3 } }

// Cover - fill area, preserve ratio (may crop)
{ sizing: { type: 'cover', w: 4, h: 3 } }

// Crop - cut specific portion
{ sizing: { type: 'crop', x: 0.5, y: 0.5, w: 2, h: 2 } }
\`\`\`

### Calculate Dimensions (preserve aspect ratio)

\`\`\`javascript
const origWidth = 1978, origHeight = 923, maxHeight = 3.0;
const calcWidth = maxHeight * (origWidth / origHeight);
const centerX = (10 - calcWidth) / 2;
slide.addImage({ path: "image.png", x: centerX, y: 1.2, w: calcWidth, h: maxHeight });
\`\`\`

### Supported Formats

- **Standard**: PNG, JPG, GIF (animated GIFs work in Microsoft 365)
- **SVG**: Works in modern PowerPoint/Microsoft 365

---

## Icons

Use react-icons to generate SVG icons, then rasterize to PNG for universal compatibility.

### Setup

\`\`\`javascript
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaCheckCircle, FaChartLine } = require("react-icons/fa");

function renderIconSvg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}
\`\`\`

### Add Icon to Slide

\`\`\`javascript
const iconData = await iconToBase64Png(FaCheckCircle, "#4472C4", 256);
slide.addImage({ data: iconData, x: 1, y: 1, w: 0.5, h: 0.5 });
\`\`\`

**Note**: Use size 256 or higher for crisp icons. The size parameter controls rasterization resolution, not display size.

Install: \`npm install -g react-icons react react-dom sharp\`

Popular icon sets: \`react-icons/fa\` (Font Awesome), \`react-icons/md\` (Material Design), \`react-icons/hi\` (Heroicons), \`react-icons/bi\` (Bootstrap Icons)

---

## Slide Backgrounds

\`\`\`javascript
slide.background = { color: "F1F1F1" };
slide.background = { color: "FF3399", transparency: 50 };
slide.background = { path: "https://example.com/bg.jpg" };
slide.background = { data: "image/png;base64,iVBORw0KGgo..." };
\`\`\`

---

## Tables

\`\`\`javascript
slide.addTable([
  ["Header 1", "Header 2"],
  ["Cell 1", "Cell 2"]
], {
  x: 1, y: 1, w: 8, h: 2,
  border: { pt: 1, color: "999999" }, fill: { color: "F1F1F1" }
});

// Advanced with merged cells
let tableData = [
  [{ text: "Header", options: { fill: { color: "6699CC" }, color: "FFFFFF", bold: true } }, "Cell"],
  [{ text: "Merged", options: { colspan: 2 } }]
];
slide.addTable(tableData, { x: 1, y: 3.5, w: 8, colW: [4, 4] });
\`\`\`

---

## Charts

\`\`\`javascript
// Bar chart
slide.addChart(pres.charts.BAR, [{
  name: "Sales", labels: ["Q1", "Q2", "Q3", "Q4"], values: [4500, 5500, 6200, 7100]
}], {
  x: 0.5, y: 0.6, w: 6, h: 3, barDir: 'col',
  showTitle: true, title: 'Quarterly Sales'
});

// Line chart
slide.addChart(pres.charts.LINE, [{
  name: "Temp", labels: ["Jan", "Feb", "Mar"], values: [32, 35, 42]
}], { x: 0.5, y: 4, w: 6, h: 3, lineSize: 3, lineSmooth: true });

// Pie chart
slide.addChart(pres.charts.PIE, [{
  name: "Share", labels: ["A", "B", "Other"], values: [35, 45, 20]
}], { x: 7, y: 1, w: 5, h: 4, showPercent: true });
\`\`\`

### Better-Looking Charts

\`\`\`javascript
slide.addChart(pres.charts.BAR, chartData, {
  x: 0.5, y: 1, w: 9, h: 4, barDir: "col",
  chartColors: ["0D9488", "14B8A6", "5EEAD4"],
  chartArea: { fill: { color: "FFFFFF" }, roundedCorners: true },
  catAxisLabelColor: "64748B",
  valAxisLabelColor: "64748B",
  valGridLine: { color: "E2E8F0", size: 0.5 },
  catGridLine: { style: "none" },
  showValue: true,
  dataLabelPosition: "outEnd",
  dataLabelColor: "1E293B",
  showLegend: false,
});
\`\`\`

**Key styling options:**
- \`chartColors: [...]\` - hex colors for series/segments
- \`chartArea: { fill, border, roundedCorners }\` - chart background
- \`catGridLine/valGridLine: { color, style, size }\` - grid lines (\`style: "none"\` to hide)
- \`lineSmooth: true\` - curved lines (line charts)
- \`legendPos: "r"\` - legend position: "b", "t", "l", "r", "tr"

---

## Slide Masters

\`\`\`javascript
pres.defineSlideMaster({
  title: 'TITLE_SLIDE', background: { color: '283A5E' },
  objects: [{
    placeholder: { options: { name: 'title', type: 'title', x: 1, y: 2, w: 8, h: 2 } }
  }]
});

let titleSlide = pres.addSlide({ masterName: "TITLE_SLIDE" });
titleSlide.addText("My Title", { placeholder: "title" });
\`\`\`

---

## Common Pitfalls (PptxGenJS)

These issues cause file corruption, visual bugs, or broken output. Avoid them.

1. **NEVER use "#" with hex colors** - causes file corruption
   \`\`\`javascript
   color: "FF0000"      // CORRECT
   color: "#FF0000"     // WRONG
   \`\`\`

2. **NEVER encode opacity in hex color strings** - 8-char colors (e.g., \`"00000020"\`) corrupt the file. Use the \`opacity\` property instead.
   \`\`\`javascript
   shadow: { color: "00000020" }          // CORRUPTS FILE
   shadow: { color: "000000", opacity: 0.12 }  // CORRECT
   \`\`\`

3. **Use \`bullet: true\`** - NEVER unicode symbols like "bullet" (creates double bullets)

4. **Use \`breakLine: true\`** between array items or text runs together

5. **Avoid \`lineSpacing\` with bullets** - causes excessive gaps; use \`paraSpaceAfter\` instead

6. **Each presentation needs fresh instance** - don't reuse \`pptxgen()\` objects

7. **NEVER reuse option objects across calls** - PptxGenJS mutates objects in-place. Use factory functions:
   \`\`\`javascript
   const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, color: "000000", opacity: 0.15 });
   slide.addShape(pres.shapes.RECTANGLE, { shadow: makeShadow(), ... });
   \`\`\`

8. **Don't use \`ROUNDED_RECTANGLE\` with accent borders** - rectangular overlay bars won't cover rounded corners. Use \`RECTANGLE\` instead.

---

## Quick Reference

- **Shapes**: RECTANGLE, OVAL, LINE, ROUNDED_RECTANGLE
- **Charts**: BAR, LINE, PIE, DOUGHNUT, SCATTER, BUBBLE, RADAR
- **Layouts**: LAYOUT_16x9 (10"x5.625"), LAYOUT_16x10, LAYOUT_4x3, LAYOUT_WIDE
- **Alignment**: "left", "center", "right"
- **Chart data labels**: "outEnd", "inEnd", "center"
`,
  },
  {
    path: "skills/pptx/skill.md",
    content: `---
name: pptx
description: "Create, read, edit, and manipulate PowerPoint (.pptx) files — decks, templates, layouts, speaker notes."
tags:
  - pptx
  - presentation
  - slides
  - office
---

# PPTX Skill

## Quick Reference

| Task | Guide |
|------|-------|
| Read/analyze content | \`python -m markitdown presentation.pptx\` |
| Edit or create from template | Read the Editing Presentations section in references.md |
| Create from scratch | Read the PptxGenJS Tutorial section in references.md |

---

## Reading Content

\`\`\`bash
# Text extraction
python -m markitdown presentation.pptx

# Visual overview
python scripts/thumbnail.py presentation.pptx

# Raw XML
python scripts/office/unpack.py presentation.pptx unpacked/
\`\`\`

---

## Editing Workflow

**Read the Editing Presentations section in references.md for full details.**

1. Analyze template with \`thumbnail.py\`
2. Unpack -> manipulate slides -> edit content -> clean -> pack

---

## Creating from Scratch

**Read the PptxGenJS Tutorial section in references.md for full details.**

Use when no template or reference presentation is available.

---

## Design Ideas

**Don't create boring slides.** Plain bullets on a white background won't impress anyone. Consider ideas from this list for each slide.

### Before Starting

- **Pick a bold, content-informed color palette**: The palette should feel designed for THIS topic. If swapping your colors into a completely different presentation would still "work," you haven't made specific enough choices.
- **Dominance over equality**: One color should dominate (60-70% visual weight), with 1-2 supporting tones and one sharp accent. Never give all colors equal weight.
- **Dark/light contrast**: Dark backgrounds for title + conclusion slides, light for content ("sandwich" structure). Or commit to dark throughout for a premium feel.
- **Commit to a visual motif**: Pick ONE distinctive element and repeat it -- rounded image frames, icons in colored circles, thick single-side borders. Carry it across every slide.

### Color Palettes

Choose colors that match your topic -- don't default to generic blue. Use these palettes as inspiration:

| Theme | Primary | Secondary | Accent |
|-------|---------|-----------|--------|
| **Midnight Executive** | \`1E2761\` (navy) | \`CADCFC\` (ice blue) | \`FFFFFF\` (white) |
| **Forest & Moss** | \`2C5F2D\` (forest) | \`97BC62\` (moss) | \`F5F5F5\` (cream) |
| **Coral Energy** | \`F96167\` (coral) | \`F9E795\` (gold) | \`2F3C7E\` (navy) |
| **Warm Terracotta** | \`B85042\` (terracotta) | \`E7E8D1\` (sand) | \`A7BEAE\` (sage) |
| **Ocean Gradient** | \`065A82\` (deep blue) | \`1C7293\` (teal) | \`21295C\` (midnight) |
| **Charcoal Minimal** | \`36454F\` (charcoal) | \`F2F2F2\` (off-white) | \`212121\` (black) |
| **Teal Trust** | \`028090\` (teal) | \`00A896\` (seafoam) | \`02C39A\` (mint) |
| **Berry & Cream** | \`6D2E46\` (berry) | \`A26769\` (dusty rose) | \`ECE2D0\` (cream) |
| **Sage Calm** | \`84B59F\` (sage) | \`69A297\` (eucalyptus) | \`50808E\` (slate) |
| **Cherry Bold** | \`990011\` (cherry) | \`FCF6F5\` (off-white) | \`2F3C7E\` (navy) |

### For Each Slide

**Every slide needs a visual element** -- image, chart, icon, or shape. Text-only slides are forgettable.

**Layout options:**
- Two-column (text left, illustration on right)
- Icon + text rows (icon in colored circle, bold header, description below)
- 2x2 or 2x3 grid (image on one side, grid of content blocks on other)
- Half-bleed image (full left or right side) with content overlay

**Data display:**
- Large stat callouts (big numbers 60-72pt with small labels below)
- Comparison columns (before/after, pros/cons, side-by-side options)
- Timeline or process flow (numbered steps, arrows)

**Visual polish:**
- Icons in small colored circles next to section headers
- Italic accent text for key stats or taglines

### Typography

**Choose an interesting font pairing** -- don't default to Arial. Pick a header font with personality and pair it with a clean body font.

| Header Font | Body Font |
|-------------|-----------|
| Georgia | Calibri |
| Arial Black | Arial |
| Calibri | Calibri Light |
| Cambria | Calibri |
| Trebuchet MS | Calibri |
| Impact | Arial |
| Palatino | Garamond |
| Consolas | Calibri |

| Element | Size |
|---------|------|
| Slide title | 36-44pt bold |
| Section header | 20-24pt bold |
| Body text | 14-16pt |
| Captions | 10-12pt muted |

### Spacing

- 0.5" minimum margins
- 0.3-0.5" between content blocks
- Leave breathing room--don't fill every inch

### Avoid (Common Mistakes)

- **Don't repeat the same layout** -- vary columns, cards, and callouts across slides
- **Don't center body text** -- left-align paragraphs and lists; center only titles
- **Don't skimp on size contrast** -- titles need 36pt+ to stand out from 14-16pt body
- **Don't default to blue** -- pick colors that reflect the specific topic
- **Don't mix spacing randomly** -- choose 0.3" or 0.5" gaps and use consistently
- **Don't style one slide and leave the rest plain** -- commit fully or keep it simple throughout
- **Don't create text-only slides** -- add images, icons, charts, or visual elements; avoid plain title + bullets
- **Don't forget text box padding** -- when aligning lines or shapes with text edges, set \`margin: 0\` on the text box or offset the shape to account for padding
- **Don't use low-contrast elements** -- icons AND text need strong contrast against the background; avoid light text on light backgrounds or dark text on dark backgrounds
- **NEVER use accent lines under titles** -- these are a hallmark of AI-generated slides; use whitespace or background color instead

---

## QA (Required)

**Assume there are problems. Your job is to find them.**

Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

### Content QA

\`\`\`bash
python -m markitdown output.pptx
\`\`\`

Check for missing content, typos, wrong order.

**When using templates, check for leftover placeholder text:**

\`\`\`bash
python -m markitdown output.pptx | grep -iE "xxxx|lorem|ipsum|this.*(page|slide).*layout"
\`\`\`

If grep returns results, fix them before declaring success.

### Visual QA

**USE SUBAGENTS** -- even for 2-3 slides. You've been staring at the code and will see what you expect, not what's there. Subagents have fresh eyes.

Convert slides to images (see [Converting to Images](#converting-to-images)), then use this prompt:

\`\`\`
Visually inspect these slides. Assume there are issues -- find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Decorative lines positioned for single-line text but title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray text on cream-colored background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.

Read and analyze these images:
1. /path/to/slide-01.jpg (Expected: [brief description])
2. /path/to/slide-02.jpg (Expected: [brief description])

Report ALL issues found, including minor ones.
\`\`\`

### Verification Loop

1. Generate slides -> Convert to images -> Inspect
2. **List issues found** (if none found, look again more critically)
3. Fix issues
4. **Re-verify affected slides** -- one fix often creates another problem
5. Repeat until a full pass reveals no new issues

**Do not declare success until you've completed at least one fix-and-verify cycle.**

---

## Converting to Images

Convert presentations to individual slide images for visual inspection:

\`\`\`bash
python scripts/office/soffice.py --headless --convert-to pdf output.pptx
pdftoppm -jpeg -r 150 output.pdf slide
\`\`\`

This creates \`slide-01.jpg\`, \`slide-02.jpg\`, etc.

To re-render specific slides after fixes:

\`\`\`bash
pdftoppm -jpeg -r 150 -f N -l N output.pdf slide-fixed
\`\`\`

---

## Dependencies

- \`pip install "markitdown[pptx]"\` - text extraction
- \`pip install Pillow\` - thumbnail grids
- \`npm install -g pptxgenjs\` - creating from scratch
- LibreOffice (\`soffice\`) - PDF conversion (auto-configured for sandboxed environments via \`scripts/office/soffice.py\`)
- Poppler (\`pdftoppm\`) - PDF to images
`,
  },
  {
    path: "skills/pptx/tools.md",
    content: `# PPTX Tools

## Scripts

All scripts are located in the \`scripts/\` directory relative to the skill.

### thumbnail.py

Creates a visual grid of slide thumbnails for template analysis.

**Usage:**
\`\`\`bash
python scripts/thumbnail.py <input.pptx> [output_prefix] [--cols N]
\`\`\`

**Output:** Creates \`thumbnails.jpg\` with slide filenames as labels. Default 3 columns, max 12 per grid.

**Dependencies:** \`pip install Pillow\`

**Note:** Use for template analysis only (choosing layouts). For visual QA, use \`soffice\` + \`pdftoppm\` for full-resolution individual slide images.

---

### office/unpack.py

Extracts and pretty-prints PPTX contents for editing.

**Usage:**
\`\`\`bash
python scripts/office/unpack.py <input.pptx> <unpacked_dir/>
\`\`\`

Extracts the PPTX archive, pretty-prints XML files, and escapes smart quotes for safe editing.

---

### add_slide.py

Duplicates a slide or creates a new slide from a layout.

**Usage:**
\`\`\`bash
python scripts/add_slide.py <unpacked_dir/> <slide2.xml>       # Duplicate slide
python scripts/add_slide.py <unpacked_dir/> <slideLayout2.xml>  # From layout
\`\`\`

**Output:** Prints the \`<p:sldId>\` XML element to add to \`<p:sldIdLst>\` at the desired position. Handles notes references, Content_Types.xml, and relationship IDs automatically.

**Important:** Never manually copy slide files -- always use this script.

---

### clean.py

Removes orphaned files after slide operations.

**Usage:**
\`\`\`bash
python scripts/clean.py <unpacked_dir/>
\`\`\`

Removes slides not referenced in \`<p:sldIdLst>\`, unreferenced media files, and orphaned relationship entries.

---

### office/pack.py

Repacks an unpacked directory into a PPTX file with validation.

**Usage:**
\`\`\`bash
python scripts/office/pack.py <unpacked_dir/> <output.pptx> --original <input.pptx>
\`\`\`

Validates XML structure, repairs common issues, condenses XML whitespace, and re-encodes smart quotes.

---

### office/soffice.py

Wrapper for LibreOffice's \`soffice\` command, auto-configured for sandboxed environments.

**Usage:**
\`\`\`bash
python scripts/office/soffice.py --headless --convert-to pdf <output.pptx>
\`\`\`

Used to convert PPTX to PDF for slide image generation. Handles sandboxed environment configuration automatically.

---

### office/validate.py

Validates PPTX XML structure against Office Open XML schemas.

**Usage:**
\`\`\`bash
python scripts/office/validate.py <unpacked_dir/>
\`\`\`

---

### office/helpers/merge_runs.py

Merges adjacent text runs in PPTX XML for cleaner output.

---

### office/helpers/simplify_redlines.py

Simplifies redline (tracked changes) markup in Office XML documents.

---

## Dependencies

| Package | Purpose | Install |
|---------|---------|---------|
| \`markitdown[pptx]\` | Text extraction from PPTX | \`pip install "markitdown[pptx]"\` |
| \`Pillow\` | Thumbnail grid generation | \`pip install Pillow\` |
| \`pptxgenjs\` | Creating presentations from scratch | \`npm install -g pptxgenjs\` |
| LibreOffice | PPTX to PDF conversion | System package (\`soffice\`) |
| Poppler | PDF to images | System package (\`pdftoppm\`) |
| \`react-icons\` | Icon generation for slides | \`npm install -g react-icons react react-dom sharp\` |
`,
  },
  {
    path: "skills/skill-creator/references.md",
    content: `# Skill Creator References

This file combines all reference documentation for the Skill Creator skill.

## Table of Contents

- [JSON Schemas](#json-schemas)
  - [evals.json](#evalsjson)
  - [history.json](#historyjson)
  - [grading.json](#gradingjson)
  - [metrics.json](#metricsjson)
  - [timing.json](#timingjson)
  - [benchmark.json](#benchmarkjson)
  - [comparison.json](#comparisonjson)
  - [analysis.json](#analysisjson)
- [Agent Instructions](#agent-instructions)
  - [Grader Agent](#grader-agent)
  - [Blind Comparator Agent](#blind-comparator-agent)
  - [Post-hoc Analyzer Agent](#post-hoc-analyzer-agent)
  - [Analyzing Benchmark Results](#analyzing-benchmark-results)

---

# JSON Schemas

This section defines the JSON schemas used by skill-creator.

---

## evals.json

Defines the evals for a skill. Located at \`evals/evals.json\` within the skill directory.

\`\`\`json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's example prompt",
      "expected_output": "Description of expected result",
      "files": ["evals/files/sample1.pdf"],
      "expectations": [
        "The output includes X",
        "The skill used script Y"
      ]
    }
  ]
}
\`\`\`

**Fields:**
- \`skill_name\`: Name matching the skill's frontmatter
- \`evals[].id\`: Unique integer identifier
- \`evals[].prompt\`: The task to execute
- \`evals[].expected_output\`: Human-readable description of success
- \`evals[].files\`: Optional list of input file paths (relative to skill root)
- \`evals[].expectations\`: List of verifiable statements

---

## history.json

Tracks version progression in Improve mode. Located at workspace root.

\`\`\`json
{
  "started_at": "2026-01-15T10:30:00Z",
  "skill_name": "pdf",
  "current_best": "v2",
  "iterations": [
    {
      "version": "v0",
      "parent": null,
      "expectation_pass_rate": 0.65,
      "grading_result": "baseline",
      "is_current_best": false
    },
    {
      "version": "v1",
      "parent": "v0",
      "expectation_pass_rate": 0.75,
      "grading_result": "won",
      "is_current_best": false
    },
    {
      "version": "v2",
      "parent": "v1",
      "expectation_pass_rate": 0.85,
      "grading_result": "won",
      "is_current_best": true
    }
  ]
}
\`\`\`

**Fields:**
- \`started_at\`: ISO timestamp of when improvement started
- \`skill_name\`: Name of the skill being improved
- \`current_best\`: Version identifier of the best performer
- \`iterations[].version\`: Version identifier (v0, v1, ...)
- \`iterations[].parent\`: Parent version this was derived from
- \`iterations[].expectation_pass_rate\`: Pass rate from grading
- \`iterations[].grading_result\`: "baseline", "won", "lost", or "tie"
- \`iterations[].is_current_best\`: Whether this is the current best version

---

## grading.json

Output from the grader agent. Located at \`<run-dir>/grading.json\`.

\`\`\`json
{
  "expectations": [
    {
      "text": "The output includes the name 'John Smith'",
      "passed": true,
      "evidence": "Found in transcript Step 3: 'Extracted names: John Smith, Sarah Johnson'"
    },
    {
      "text": "The spreadsheet has a SUM formula in cell B10",
      "passed": false,
      "evidence": "No spreadsheet was created. The output was a text file."
    }
  ],
  "summary": {
    "passed": 2,
    "failed": 1,
    "total": 3,
    "pass_rate": 0.67
  },
  "execution_metrics": {
    "tool_calls": {
      "Read": 5,
      "Write": 2,
      "Bash": 8
    },
    "total_tool_calls": 15,
    "total_steps": 6,
    "errors_encountered": 0,
    "output_chars": 12450,
    "transcript_chars": 3200
  },
  "timing": {
    "executor_duration_seconds": 165.0,
    "grader_duration_seconds": 26.0,
    "total_duration_seconds": 191.0
  },
  "claims": [
    {
      "claim": "The form has 12 fillable fields",
      "type": "factual",
      "verified": true,
      "evidence": "Counted 12 fields in field_info.json"
    }
  ],
  "user_notes_summary": {
    "uncertainties": ["Used 2023 data, may be stale"],
    "needs_review": [],
    "workarounds": ["Fell back to text overlay for non-fillable fields"]
  },
  "eval_feedback": {
    "suggestions": [
      {
        "assertion": "The output includes the name 'John Smith'",
        "reason": "A hallucinated document that mentions the name would also pass"
      }
    ],
    "overall": "Assertions check presence but not correctness."
  }
}
\`\`\`

**Fields:**
- \`expectations[]\`: Graded expectations with evidence
- \`summary\`: Aggregate pass/fail counts
- \`execution_metrics\`: Tool usage and output size (from executor's metrics.json)
- \`timing\`: Wall clock timing (from timing.json)
- \`claims\`: Extracted and verified claims from the output
- \`user_notes_summary\`: Issues flagged by the executor
- \`eval_feedback\`: (optional) Improvement suggestions for the evals

---

## metrics.json

Output from the executor agent. Located at \`<run-dir>/outputs/metrics.json\`.

\`\`\`json
{
  "tool_calls": {
    "Read": 5,
    "Write": 2,
    "Bash": 8,
    "Edit": 1,
    "Glob": 2,
    "Grep": 0
  },
  "total_tool_calls": 18,
  "total_steps": 6,
  "files_created": ["filled_form.pdf", "field_values.json"],
  "errors_encountered": 0,
  "output_chars": 12450,
  "transcript_chars": 3200
}
\`\`\`

---

## timing.json

Wall clock timing for a run. Located at \`<run-dir>/timing.json\`.

**How to capture:** When a subagent task completes, the task notification includes \`total_tokens\` and \`duration_ms\`. Save these immediately -- they are not persisted anywhere else.

\`\`\`json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3,
  "executor_start": "2026-01-15T10:30:00Z",
  "executor_end": "2026-01-15T10:32:45Z",
  "executor_duration_seconds": 165.0,
  "grader_start": "2026-01-15T10:32:46Z",
  "grader_end": "2026-01-15T10:33:12Z",
  "grader_duration_seconds": 26.0
}
\`\`\`

---

## benchmark.json

Output from Benchmark mode. Located at \`benchmarks/<timestamp>/benchmark.json\`.

\`\`\`json
{
  "metadata": {
    "skill_name": "pdf",
    "skill_path": "/path/to/pdf",
    "executor_model": "claude-sonnet-4-20250514",
    "analyzer_model": "most-capable-model",
    "timestamp": "2026-01-15T10:30:00Z",
    "evals_run": [1, 2, 3],
    "runs_per_configuration": 3
  },

  "runs": [
    {
      "eval_id": 1,
      "eval_name": "Ocean",
      "configuration": "with_skill",
      "run_number": 1,
      "result": {
        "pass_rate": 0.85,
        "passed": 6,
        "failed": 1,
        "total": 7,
        "time_seconds": 42.5,
        "tokens": 3800,
        "tool_calls": 18,
        "errors": 0
      },
      "expectations": [
        {"text": "...", "passed": true, "evidence": "..."}
      ],
      "notes": [
        "Used 2023 data, may be stale"
      ]
    }
  ],

  "run_summary": {
    "with_skill": {
      "pass_rate": {"mean": 0.85, "stddev": 0.05, "min": 0.80, "max": 0.90},
      "time_seconds": {"mean": 45.0, "stddev": 12.0, "min": 32.0, "max": 58.0},
      "tokens": {"mean": 3800, "stddev": 400, "min": 3200, "max": 4100}
    },
    "without_skill": {
      "pass_rate": {"mean": 0.35, "stddev": 0.08, "min": 0.28, "max": 0.45},
      "time_seconds": {"mean": 32.0, "stddev": 8.0, "min": 24.0, "max": 42.0},
      "tokens": {"mean": 2100, "stddev": 300, "min": 1800, "max": 2500}
    },
    "delta": {
      "pass_rate": "+0.50",
      "time_seconds": "+13.0",
      "tokens": "+1700"
    }
  },

  "notes": [
    "Assertion 'Output is a PDF file' passes 100% in both configurations - may not differentiate skill value",
    "Eval 3 shows high variance (50% +/- 40%) - may be flaky"
  ]
}
\`\`\`

**Important:** The viewer reads these field names exactly. Using \`config\` instead of \`configuration\`, or putting \`pass_rate\` at the top level of a run instead of nested under \`result\`, will cause the viewer to show empty/zero values.

---

## comparison.json

Output from blind comparator. Located at \`<grading-dir>/comparison-N.json\`.

\`\`\`json
{
  "winner": "A",
  "reasoning": "Output A provides a complete solution with proper formatting...",
  "rubric": {
    "A": {
      "content": { "correctness": 5, "completeness": 5, "accuracy": 4 },
      "structure": { "organization": 4, "formatting": 5, "usability": 4 },
      "content_score": 4.7,
      "structure_score": 4.3,
      "overall_score": 9.0
    },
    "B": {
      "content": { "correctness": 3, "completeness": 2, "accuracy": 3 },
      "structure": { "organization": 3, "formatting": 2, "usability": 3 },
      "content_score": 2.7,
      "structure_score": 2.7,
      "overall_score": 5.4
    }
  },
  "output_quality": {
    "A": { "score": 9, "strengths": [...], "weaknesses": [...] },
    "B": { "score": 5, "strengths": [...], "weaknesses": [...] }
  },
  "expectation_results": {
    "A": { "passed": 4, "total": 5, "pass_rate": 0.80, "details": [...] },
    "B": { "passed": 3, "total": 5, "pass_rate": 0.60, "details": [...] }
  }
}
\`\`\`

---

## analysis.json

Output from post-hoc analyzer. Located at \`<grading-dir>/analysis.json\`.

\`\`\`json
{
  "comparison_summary": {
    "winner": "A",
    "winner_skill": "path/to/winner/skill",
    "loser_skill": "path/to/loser/skill",
    "comparator_reasoning": "Brief summary..."
  },
  "winner_strengths": [...],
  "loser_weaknesses": [...],
  "instruction_following": {
    "winner": { "score": 9, "issues": [...] },
    "loser": { "score": 6, "issues": [...] }
  },
  "improvement_suggestions": [
    {
      "priority": "high",
      "category": "instructions",
      "suggestion": "Replace vague instruction with explicit steps",
      "expected_impact": "Would eliminate ambiguity"
    }
  ],
  "transcript_insights": {
    "winner_execution_pattern": "Read skill -> Followed 5-step process -> Used validation script",
    "loser_execution_pattern": "Read skill -> Unclear -> Tried 3 different methods"
  }
}
\`\`\`

---

# Agent Instructions

## Grader Agent

Evaluate expectations against an execution transcript and outputs.

### Role

The Grader reviews a transcript and output files, then determines whether each expectation passes or fails. Provide clear evidence for each judgment.

You have two jobs: grade the outputs, and critique the evals themselves. A passing grade on a weak assertion is worse than useless -- it creates false confidence. When you notice an assertion that's trivially satisfied, or an important outcome that no assertion checks, say so.

### Inputs

- **expectations**: List of expectations to evaluate (strings)
- **transcript_path**: Path to the execution transcript (markdown file)
- **outputs_dir**: Directory containing output files from execution

### Process

1. **Read the Transcript** - Read completely, note the eval prompt, execution steps, and final result
2. **Examine Output Files** - List files in outputs_dir, read/examine each relevant file
3. **Evaluate Each Assertion** - Search for evidence, determine PASS/FAIL, cite evidence
4. **Extract and Verify Claims** - Extract factual, process, and quality claims; verify each
5. **Read User Notes** - If \`{outputs_dir}/user_notes.md\` exists, note issues flagged
6. **Critique the Evals** - Surface suggestions when there's a clear gap
7. **Write Grading Results** - Save to \`{outputs_dir}/../grading.json\`
8. **Read Executor Metrics and Timing** - Include if available

### Grading Criteria

**PASS when:**
- Clear evidence the expectation is true AND reflects genuine task completion
- Specific evidence can be cited

**FAIL when:**
- No evidence found, or evidence contradicts the expectation
- Evidence is superficial (correct filename but empty/wrong content)
- Output meets assertion by coincidence rather than by actually doing the work

**When uncertain:** The burden of proof to pass is on the expectation.

### Output Format

The grading.json expectations array must use the fields \`text\`, \`passed\`, and \`evidence\` -- the viewer depends on these exact field names.

---

## Blind Comparator Agent

Compare two outputs WITHOUT knowing which skill produced them.

### Role

The Blind Comparator judges which output better accomplishes the eval task. You receive two outputs labeled A and B, but you do NOT know which skill produced which. This prevents bias.

### Inputs

- **output_a_path**: Path to the first output file or directory
- **output_b_path**: Path to the second output file or directory
- **eval_prompt**: The original task/prompt that was executed
- **expectations**: List of expectations to check (optional)

### Process

1. **Read Both Outputs** - Examine output A and B
2. **Understand the Task** - Read eval_prompt, identify requirements
3. **Generate Evaluation Rubric** - Content rubric (correctness, completeness, accuracy) and Structure rubric (organization, formatting, usability), each scored 1-5
4. **Evaluate Each Output Against the Rubric** - Score each criterion, calculate totals
5. **Check Assertions** (if provided) - Check each against both outputs
6. **Determine the Winner** - Compare based on rubric score (primary), assertion pass rates (secondary)
7. **Write Comparison Results** - Save to JSON

### Output

- **winner**: "A", "B", or "TIE"
- **reasoning**: Clear explanation
- **rubric**: Structured evaluation with content_score, structure_score, overall_score for each
- **output_quality**: Score, strengths, weaknesses for each
- **expectation_results**: (Only if expectations provided) pass rates and details

### Guidelines

- **Stay blind**: DO NOT try to infer which skill produced which output
- **Be decisive**: Ties should be rare
- **Output quality first**: Assertion scores are secondary

---

## Post-hoc Analyzer Agent

Analyze blind comparison results to understand WHY the winner won and generate improvement suggestions.

### Role

After the blind comparator determines a winner, the Post-hoc Analyzer "unblinds" the results by examining the skills and transcripts to extract actionable insights.

### Inputs

- **winner**: "A" or "B" (from blind comparison)
- **winner_skill_path**, **winner_transcript_path**
- **loser_skill_path**, **loser_transcript_path**
- **comparison_result_path**, **output_path**

### Process

1. **Read Comparison Result** - Note winning side and reasoning
2. **Read Both Skills** - Identify structural differences
3. **Read Both Transcripts** - Compare execution patterns
4. **Analyze Instruction Following** - Score 1-10, note issues
5. **Identify Winner Strengths** - Be specific, quote from skills/transcripts
6. **Identify Loser Weaknesses** - Determine what held the loser back
7. **Generate Improvement Suggestions** - Prioritize by impact
8. **Write Analysis Results** - Save structured analysis

### Categories for Suggestions

| Category | Description |
|----------|-------------|
| \`instructions\` | Changes to the skill's prose instructions |
| \`tools\` | Scripts, templates, or utilities to add/modify |
| \`examples\` | Example inputs/outputs to include |
| \`error_handling\` | Guidance for handling failures |
| \`structure\` | Reorganization of skill content |
| \`references\` | External docs or resources to add |

### Priority Levels

- **high**: Would likely change the outcome
- **medium**: Would improve quality but may not change win/loss
- **low**: Nice to have, marginal improvement

---

## Analyzing Benchmark Results

When analyzing benchmark results, the analyzer's purpose is to **surface patterns and anomalies** across multiple runs, not suggest skill improvements.

### Role

Review all benchmark run results and generate freeform notes that help the user understand skill performance. Focus on patterns that wouldn't be visible from aggregate metrics alone.

### Process

1. **Read Benchmark Data** - Note configurations tested and run_summary aggregates
2. **Analyze Per-Assertion Patterns** - For each expectation:
   - Always pass in both configs? (may not differentiate skill value)
   - Always fail in both? (may be broken)
   - Always pass with skill but fail without? (skill clearly adds value)
   - Highly variable? (flaky expectation)
3. **Analyze Cross-Eval Patterns** - Consistency across evals, surprising results
4. **Analyze Metrics Patterns** - Time, tokens, tool calls, outliers
5. **Generate Notes** - Freeform observations as a list of strings, grounded in data

### Guidelines

**DO:**
- Report what you observe in the data
- Be specific about which evals, expectations, or runs you're referring to
- Note patterns that aggregate metrics would hide

**DO NOT:**
- Suggest improvements to the skill
- Make subjective quality judgments
- Speculate about causes without evidence
- Repeat information already in the run_summary aggregates
`,
  },
  {
    path: "skills/skill-creator/skill.md",
    content: `---
name: skill-creator
description: "Create, modify, evaluate, and optimize skills — includes benchmarking and trigger accuracy tuning."
tags:
  - skill
  - meta
  - evaluation
  - development
---

# Skill Creator

A skill for creating new skills and iteratively improving them.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run claude-with-access-to-the-skill on them
- Help the user evaluate the results both qualitatively and quantitatively
  - While the runs happen in the background, draft some quantitative evals if there aren't any (if there are some, you can either use as is or modify if you feel something needs to change about them). Then explain them to the user (or if they already existed, explain the ones that already exist)
  - Use the \`eval-viewer/generate_review.py\` script to show the user the results for them to look at, and also let them look at the quantitative metrics
- Rewrite the skill based on feedback from the user's evaluation of the results (and also if there are any glaring flaws that become apparent from the quantitative benchmarks)
- Repeat until you're satisfied
- Expand the test set and try again at larger scale

Your job when using this skill is to figure out where the user is in this process and then jump in and help them progress through these stages. So for instance, maybe they're like "I want to make a skill for X". You can help narrow down what they mean, write a draft, write the test cases, figure out how they want to evaluate, run all the prompts, and repeat.

On the other hand, maybe they already have a draft of the skill. In this case you can go straight to the eval/iterate part of the loop.

Of course, you should always be flexible and if the user is like "I don't need to run a bunch of evaluations, just vibe with me", you can do that instead.

Then after the skill is done (but again, the order is flexible), you can also run the skill description improver, which we have a whole separate script for, to optimize the triggering of the skill.

Cool? Cool.

## Communicating with the user

The skill creator is liable to be used by people across a wide range of familiarity with coding jargon. If you haven't heard (and how could you, it's only very recently that it started), there's a trend now where the power of Claude is inspiring plumbers to open up their terminals, parents and grandparents to google "how to install npm". On the other hand, the bulk of users are probably fairly computer-literate.

So please pay attention to context cues to understand how to phrase your communication! In the default case, just to give you some idea:

- "evaluation" and "benchmark" are borderline, but OK
- for "JSON" and "assertion" you want to see serious cues from the user that they know what those things are before using them without explaining them

It's OK to briefly explain terms if you're in doubt, and feel free to clarify terms with a short definition if you're unsure if the user will get it.

---

## Creating a skill

### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first -- the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps, and should confirm before proceeding to the next step.

1. What should this skill enable Claude to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. Should we set up test cases to verify the skill works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out.

Check available MCPs - if useful for research (searching docs, finding similar skills, looking up best practices), research in parallel via subagents if available, otherwise inline. Come prepared with context to reduce burden on the user.

### Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier
- **description**: When to trigger, what it does. This is the primary triggering mechanism - include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Note: currently Claude has a tendency to "undertrigger" skills -- to not use them when they'd be useful. To combat this, please make the skill descriptions a little bit "pushy". So for instance, instead of "How to build a simple fast dashboard to display internal Anthropic data.", you might write "How to build a simple fast dashboard to display internal Anthropic data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the rest of the skill :)**

### Skill Writing Guide

#### Anatomy of a Skill

\`\`\`
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources (optional)
    ├── scripts/    - Executable code for deterministic/repetitive tasks
    ├── references/ - Docs loaded into context as needed
    └── assets/     - Files used in output (templates, icons, fonts)
\`\`\`

#### Progressive Disclosure

Skills use a three-level loading system:
1. **Metadata** (name + description) - Always in context (~100 words)
2. **SKILL.md body** - In context whenever skill triggers (<500 lines ideal)
3. **Bundled resources** - As needed (unlimited, scripts can execute without loading)

These word counts are approximate and you can feel free to go longer if needed.

**Key patterns:**
- Keep SKILL.md under 500 lines; if you're approaching this limit, add an additional layer of hierarchy along with clear pointers about where the model using the skill should go next to follow up.
- Reference files clearly from SKILL.md with guidance on when to read them
- For large reference files (>300 lines), include a table of contents

**Domain organization**: When a skill supports multiple domains/frameworks, organize by variant:
\`\`\`
cloud-deploy/
├── SKILL.md (workflow + selection)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
\`\`\`
Claude reads only the relevant reference file.

#### Principle of Lack of Surprise

This goes without saying, but skills must not contain malware, exploit code, or any content that could compromise system security. A skill's contents should not surprise the user in their intent if described. Don't go along with requests to create misleading skills or skills designed to facilitate unauthorized access, data exfiltration, or other malicious activities. Things like a "roleplay as an XYZ" are OK though.

#### Writing Patterns

Prefer using the imperative form in instructions.

**Defining output formats** - You can do it like this:
\`\`\`markdown
## Report structure
ALWAYS use this exact template:
# [Title]
## Executive summary
## Key findings
## Recommendations
\`\`\`

**Examples pattern** - It's useful to include examples. You can format them like this (but if "Input" and "Output" are in the examples you might want to deviate a little):
\`\`\`markdown
## Commit message format
**Example 1:**
Input: Added user authentication with JWT tokens
Output: feat(auth): implement JWT-based authentication
\`\`\`

### Writing Style

Try to explain to the model why things are important in lieu of heavy-handed musty MUSTs. Use theory of mind and try to make the skill general and not super-narrow to specific examples. Start by writing a draft and then look at it with fresh eyes and improve it.

### Test Cases

After writing the skill draft, come up with 2-3 realistic test prompts -- the kind of thing a real user would actually say. Share them with the user: [you don't have to use this exact language] "Here are a few test cases I'd like to try. Do these look right, or do you want to add more?" Then run them.

Save test cases to \`evals/evals.json\`. Don't write assertions yet -- just the prompts. You'll draft assertions in the next step while the runs are in progress.

\`\`\`json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of expected result",
      "files": []
    }
  ]
}
\`\`\`

See references.md for the full schema (including the \`assertions\` field, which you'll add later).

## Running and evaluating test cases

This section is one continuous sequence -- don't stop partway through. Do NOT use \`/skill-test\` or any other testing skill.

Put results in \`<skill-name>-workspace/\` as a sibling to the skill directory. Within the workspace, organize results by iteration (\`iteration-1/\`, \`iteration-2/\`, etc.) and within that, each test case gets a directory (\`eval-0/\`, \`eval-1/\`, etc.). Don't create all of this upfront -- just create directories as you go.

### Step 1: Spawn all runs (with-skill AND baseline) in the same turn

For each test case, spawn two subagents in the same turn -- one with the skill, one without. This is important: don't spawn the with-skill runs first and then come back for baselines later. Launch everything at once so it all finishes around the same time.

**With-skill run:**

\`\`\`
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about -- e.g., "the .docx file", "the final CSV">
\`\`\`

**Baseline run** (same prompt, but the baseline depends on context):
- **Creating a new skill**: no skill at all. Same prompt, no skill path, save to \`without_skill/outputs/\`.
- **Improving an existing skill**: the old version. Before editing, snapshot the skill (\`cp -r <skill-path> <workspace>/skill-snapshot/\`), then point the baseline subagent at the snapshot. Save to \`old_skill/outputs/\`.

Write an \`eval_metadata.json\` for each test case (assertions can be empty for now). Give each eval a descriptive name based on what it's testing -- not just "eval-0". Use this name for the directory too. If this iteration uses new or modified eval prompts, create these files for each new eval directory -- don't assume they carry over from previous iterations.

\`\`\`json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
\`\`\`

### Step 2: While runs are in progress, draft assertions

Don't just wait for the runs to finish -- you can use this time productively. Draft quantitative assertions for each test case and explain them to the user. If assertions already exist in \`evals/evals.json\`, review them and explain what they check.

Good assertions are objectively verifiable and have descriptive names -- they should read clearly in the benchmark viewer so someone glancing at the results immediately understands what each one checks. Subjective skills (writing style, design quality) are better evaluated qualitatively -- don't force assertions onto things that need human judgment.

Update the \`eval_metadata.json\` files and \`evals/evals.json\` with the assertions once drafted. Also explain to the user what they'll see in the viewer -- both the qualitative outputs and the quantitative benchmark.

### Step 3: As runs complete, capture timing data

When each subagent task completes, you receive a notification containing \`total_tokens\` and \`duration_ms\`. Save this data immediately to \`timing.json\` in the run directory:

\`\`\`json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
\`\`\`

This is the only opportunity to capture this data -- it comes through the task notification and isn't persisted elsewhere. Process each notification as it arrives rather than trying to batch them.

### Step 4: Grade, aggregate, and launch the viewer

Once all runs are done:

1. **Grade each run** -- spawn a grader subagent (or grade inline) that reads \`agents/grader.md\` and evaluates each assertion against the outputs. Save results to \`grading.json\` in each run directory. The grading.json expectations array must use the fields \`text\`, \`passed\`, and \`evidence\` (not \`name\`/\`met\`/\`details\` or other variants) -- the viewer depends on these exact field names. For assertions that can be checked programmatically, write and run a script rather than eyeballing it -- scripts are faster, more reliable, and can be reused across iterations.

2. **Aggregate into benchmark** -- run the aggregation script from the skill-creator directory:
   \`\`\`bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   \`\`\`
   This produces \`benchmark.json\` and \`benchmark.md\` with pass_rate, time, and tokens for each configuration, with mean +/- stddev and the delta. If generating benchmark.json manually, see references.md for the exact schema the viewer expects.
Put each with_skill version before its baseline counterpart.

3. **Do an analyst pass** -- read the benchmark data and surface patterns the aggregate stats might hide. See the Analyzer section in references.md (the "Analyzing Benchmark Results" section) for what to look for -- things like assertions that always pass regardless of skill (non-discriminating), high-variance evals (possibly flaky), and time/token tradeoffs.

4. **Launch the viewer** with both qualitative outputs and quantitative data:
   \`\`\`bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \\
     <workspace>/iteration-N \\
     --skill-name "my-skill" \\
     --benchmark <workspace>/iteration-N/benchmark.json \\
     > /dev/null 2>&1 &
   VIEWER_PID=\$!
   \`\`\`
   For iteration 2+, also pass \`--previous-workspace <workspace>/iteration-<N-1>\`.

   **Cowork / headless environments:** If \`webbrowser.open()\` is not available or the environment has no display, use \`--static <output_path>\` to write a standalone HTML file instead of starting a server. Feedback will be downloaded as a \`feedback.json\` file when the user clicks "Submit All Reviews". After download, copy \`feedback.json\` into the workspace directory for the next iteration to pick up.

Note: please use generate_review.py to create the viewer; there's no need to write custom HTML.

5. **Tell the user** something like: "I've opened the results in your browser. There are two tabs -- 'Outputs' lets you click through each test case and leave feedback, 'Benchmark' shows the quantitative comparison. When you're done, come back here and let me know."

### What the user sees in the viewer

The "Outputs" tab shows one test case at a time:
- **Prompt**: the task that was given
- **Output**: the files the skill produced, rendered inline where possible
- **Previous Output** (iteration 2+): collapsed section showing last iteration's output
- **Formal Grades** (if grading was run): collapsed section showing assertion pass/fail
- **Feedback**: a textbox that auto-saves as they type
- **Previous Feedback** (iteration 2+): their comments from last time, shown below the textbox

The "Benchmark" tab shows the stats summary: pass rates, timing, and token usage for each configuration, with per-eval breakdowns and analyst observations.

Navigation is via prev/next buttons or arrow keys. When done, they click "Submit All Reviews" which saves all feedback to \`feedback.json\`.

### Step 5: Read the feedback

When the user tells you they're done, read \`feedback.json\`:

\`\`\`json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..."},
    {"run_id": "eval-2-with_skill", "feedback": "perfect, love this", "timestamp": "..."}
  ],
  "status": "complete"
}
\`\`\`

Empty feedback means the user thought it was fine. Focus your improvements on the test cases where the user had specific complaints.

Kill the viewer server when you're done with it:

\`\`\`bash
kill \$VIEWER_PID 2>/dev/null
\`\`\`

---

## Improving the skill

This is the heart of the loop. You've run the test cases, the user has reviewed the results, and now you need to make the skill better based on their feedback.

### How to think about improvements

1. **Generalize from the feedback.** The big picture thing that's happening here is that we're trying to create skills that can be used a million times (maybe literally, maybe even more who knows) across many different prompts. Here you and the user are iterating on only a few examples over and over again because it helps move faster. The user knows these examples in and out and it's quick for them to assess new outputs. But if the skill you and the user are codeveloping works only for those examples, it's useless. Rather than put in fiddly overfitty changes, or oppressively constrictive MUSTs, if there's some stubborn issue, you might try branching out and using different metaphors, or recommending different patterns of working. It's relatively cheap to try and maybe you'll land on something great.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Make sure to read the transcripts, not just the final outputs -- if it looks like the skill is making the model waste a bunch of time doing things that are unproductive, you can try getting rid of the parts of the skill that are making it do that and seeing what happens.

3. **Explain the why.** Try hard to explain the **why** behind everything you're asking the model to do. Today's LLMs are *smart*. They have good theory of mind and when given a good harness can go beyond rote instructions and really make things happen. Even if the feedback from the user is terse or frustrated, try to actually understand the task and why the user is writing what they wrote, and what they actually wrote, and then transmit this understanding into the instructions. If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures, that's a yellow flag -- if possible, reframe and explain the reasoning so that the model understands why the thing you're asking for is important. That's a more humane, powerful, and effective approach.

4. **Look for repeated work across test cases.** Read the transcripts from the test runs and notice if the subagents all independently wrote similar helper scripts or took the same multi-step approach to something. If all 3 test cases resulted in the subagent writing a \`create_docx.py\` or a \`build_chart.py\`, that's a strong signal the skill should bundle that script. Write it once, put it in \`scripts/\`, and tell the skill to use it. This saves every future invocation from reinventing the wheel.

This task is pretty important (we are trying to create billions a year in economic value here!) and your thinking time is not the blocker; take your time and really mull things over. I'd suggest writing a draft revision and then looking at it anew and making improvements. Really do your best to get into the head of the user and understand what they want and need.

### The iteration loop

After improving the skill:

1. Apply your improvements to the skill
2. Rerun all test cases into a new \`iteration-<N+1>/\` directory, including baseline runs. If you're creating a new skill, the baseline is always \`without_skill\` (no skill) -- that stays the same across iterations. If you're improving an existing skill, use your judgment on what makes sense as the baseline: the original version the user came in with, or the previous iteration.
3. Launch the reviewer with \`--previous-workspace\` pointing at the previous iteration
4. Wait for the user to review and tell you they're done
5. Read the new feedback, improve again, repeat

Keep going until:
- The user says they're happy
- The feedback is all empty (everything looks good)
- You're not making meaningful progress

---

## Advanced: Blind comparison

For situations where you want a more rigorous comparison between two versions of a skill (e.g., the user asks "is the new version actually better?"), there's a blind comparison system. Read the Comparator and Analyzer sections in references.md for the details. The basic idea is: give two outputs to an independent agent without telling it which is which, and let it judge quality. Then analyze why the winner won.

This is optional, requires subagents, and most users won't need it. The human review loop is usually sufficient.

---

## Description Optimization

The description field in SKILL.md frontmatter is the primary mechanism that determines whether Claude invokes a skill. After creating or improving a skill, offer to optimize the description for better triggering accuracy.

### Step 1: Generate trigger eval queries

Create 20 eval queries -- a mix of should-trigger and should-not-trigger. Save as JSON:

\`\`\`json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
\`\`\`

The queries must be realistic and something a Claude Code or Claude.ai user would actually type. Not abstract requests, but requests that are concrete and specific and have a good amount of detail. For instance, file paths, personal context about the user's job or situation, column names and values, company names, URLs. A little bit of backstory. Some might be in lowercase or contain abbreviations or typos or casual speech. Use a mix of different lengths, and focus on edge cases rather than making them clear-cut (the user will get a chance to sign off on them).

Bad: \`"Format this data"\`, \`"Extract text from PDF"\`, \`"Create a chart"\`

Good: \`"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think"\`

For the **should-trigger** queries (8-10), think about coverage. You want different phrasings of the same intent -- some formal, some casual. Include cases where the user doesn't explicitly name the skill or file type but clearly needs it. Throw in some uncommon use cases and cases where this skill competes with another but should win.

For the **should-not-trigger** queries (8-10), the most valuable ones are the near-misses -- queries that share keywords or concepts with the skill but actually need something different. Think adjacent domains, ambiguous phrasing where a naive keyword match would trigger but shouldn't, and cases where the query touches on something the skill does but in a context where another tool is more appropriate.

The key thing to avoid: don't make should-not-trigger queries obviously irrelevant. "Write a fibonacci function" as a negative test for a PDF skill is too easy -- it doesn't test anything. The negative cases should be genuinely tricky.

### Step 2: Review with user

Present the eval set to the user for review using the HTML template:

1. Read the template from \`assets/eval_review.html\`
2. Replace the placeholders:
   - \`__EVAL_DATA_PLACEHOLDER__\` -> the JSON array of eval items (no quotes around it -- it's a JS variable assignment)
   - \`__SKILL_NAME_PLACEHOLDER__\` -> the skill's name
   - \`__SKILL_DESCRIPTION_PLACEHOLDER__\` -> the skill's current description
3. Write to a temp file (e.g., \`/tmp/eval_review_<skill-name>.html\`) and open it: \`open /tmp/eval_review_<skill-name>.html\`
4. The user can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set"
5. The file downloads to \`~/Downloads/eval_set.json\` -- check the Downloads folder for the most recent version in case there are multiple (e.g., \`eval_set (1).json\`)

This step matters -- bad eval queries lead to bad descriptions.

### Step 3: Run the optimization loop

Tell the user: "This will take some time -- I'll run the optimization loop in the background and check on it periodically."

Save the eval set to the workspace, then run in the background:

\`\`\`bash
python -m scripts.run_loop \\
  --eval-set <path-to-trigger-eval.json> \\
  --skill-path <path-to-skill> \\
  --model <model-id-powering-this-session> \\
  --max-iterations 5 \\
  --verbose
\`\`\`

Use the model ID from your system prompt (the one powering the current session) so the triggering test matches what the user actually experiences.

While it runs, periodically tail the output to give the user updates on which iteration it's on and what the scores look like.

This handles the full optimization loop automatically. It splits the eval set into 60% train and 40% held-out test, evaluates the current description (running each query 3 times to get a reliable trigger rate), then calls Claude to propose improvements based on what failed. It re-evaluates each new description on both train and test, iterating up to 5 times. When it's done, it opens an HTML report in the browser showing the results per iteration and returns JSON with \`best_description\` -- selected by test score rather than train score to avoid overfitting.

### How skill triggering works

Understanding the triggering mechanism helps design better eval queries. Skills appear in Claude's \`available_skills\` list with their name + description, and Claude decides whether to consult a skill based on that description. The important thing to know is that Claude only consults skills for tasks it can't easily handle on its own -- simple, one-step queries like "read this PDF" may not trigger a skill even if the description matches perfectly, because Claude can handle them directly with basic tools. Complex, multi-step, or specialized queries reliably trigger skills when the description matches.

This means your eval queries should be substantive enough that Claude would actually benefit from consulting a skill. Simple queries like "read file X" are poor test cases -- they won't trigger skills regardless of description quality.

### Step 4: Apply the result

Take \`best_description\` from the JSON output and update the skill's SKILL.md frontmatter. Show the user before/after and report the scores.

---

### Package and Present (only if \`present_files\` tool is available)

Check whether you have access to the \`present_files\` tool. If you don't, skip this step. If you do, package the skill and present the .skill file to the user:

\`\`\`bash
python -m scripts.package_skill <path/to/skill-folder>
\`\`\`

After packaging, direct the user to the resulting \`.skill\` file path so they can install it.

---

## Claude.ai-specific instructions

In Claude.ai, the core workflow is the same (draft -> test -> review -> improve -> repeat), but because Claude.ai doesn't have subagents, some mechanics change. Here's what to adapt:

**Running test cases**: No subagents means no parallel execution. For each test case, read the skill's SKILL.md, then follow its instructions to accomplish the test prompt yourself. Do them one at a time. This is less rigorous than independent subagents (you wrote the skill and you're also running it, so you have full context), but it's a useful sanity check -- and the human review step compensates. Skip the baseline runs -- just use the skill to complete the task as requested.

**Reviewing results**: If you can't open a browser (e.g., Claude.ai's VM has no display, or you're on a remote server), skip the browser reviewer entirely. Instead, present results directly in the conversation. For each test case, show the prompt and the output. If the output is a file the user needs to see (like a .docx or .xlsx), save it to the filesystem and tell them where it is so they can download and inspect it. Ask for feedback inline: "How does this look? Anything you'd change?"

**Benchmarking**: Skip the quantitative benchmarking -- it relies on baseline comparisons which aren't meaningful without subagents. Focus on qualitative feedback from the user.

**The iteration loop**: Same as before -- improve the skill, rerun the test cases, ask for feedback -- just without the browser reviewer in the middle. You can still organize results into iteration directories on the filesystem if you have one.

**Description optimization**: This section requires the \`claude\` CLI tool (specifically \`claude -p\`) which is only available in Claude Code. Skip it if you're on Claude.ai.

**Blind comparison**: Requires subagents. Skip it.

**Packaging**: The \`package_skill.py\` script works anywhere with Python and a filesystem. On Claude.ai, you can run it and the user can download the resulting \`.skill\` file.

**Updating an existing skill**: The user might be asking you to update an existing skill, not create a new one. In this case:
- **Preserve the original name.** Note the skill's directory name and \`name\` frontmatter field -- use them unchanged. E.g., if the installed skill is \`research-helper\`, output \`research-helper.skill\` (not \`research-helper-v2\`).
- **Copy to a writeable location before editing.** The installed skill path may be read-only. Copy to \`/tmp/skill-name/\`, edit there, and package from the copy.
- **If packaging manually, stage in \`/tmp/\` first**, then copy to the output directory -- direct writes may fail due to permissions.

---

## Cowork-Specific Instructions

If you're in Cowork, the main things to know are:

- You have subagents, so the main workflow (spawn test cases in parallel, run baselines, grade, etc.) all works. (However, if you run into severe problems with timeouts, it's OK to run the test prompts in series rather than parallel.)
- You don't have a browser or display, so when generating the eval viewer, use \`--static <output_path>\` to write a standalone HTML file instead of starting a server. Then proffer a link that the user can click to open the HTML in their browser.
- For whatever reason, the Cowork setup seems to disincline Claude from generating the eval viewer after running the tests, so just to reiterate: whether you're in Cowork or in Claude Code, after running tests, you should always generate the eval viewer for the human to look at examples before revising the skill yourself and trying to make corrections, using \`generate_review.py\` (not writing your own boutique html code). Sorry in advance but I'm gonna go all caps here: GENERATE THE EVAL VIEWER *BEFORE* evaluating inputs yourself. You want to get them in front of the human ASAP!
- Feedback works differently: since there's no running server, the viewer's "Submit All Reviews" button will download \`feedback.json\` as a file. You can then read it from there (you may have to request access first).
- Packaging works -- \`package_skill.py\` just needs Python and a filesystem.
- Description optimization (\`run_loop.py\` / \`run_eval.py\`) should work in Cowork just fine since it uses \`claude -p\` via subprocess, not a browser, but please save it until you've fully finished making the skill and the user agrees it's in good shape.
- **Updating an existing skill**: The user might be asking you to update an existing skill, not create a new one. Follow the update guidance in the claude.ai section above.

---

## Reference files

The references.md file contains:
- Agent instructions for grader, comparator, and analyzer subagents
- JSON schemas for evals.json, grading.json, benchmark.json, etc.

The tools.md file documents all available scripts.

---

Repeating one more time the core loop here for emphasis:

- Figure out what the skill is about
- Draft or edit the skill
- Run claude-with-access-to-the-skill on test prompts
- With the user, evaluate the outputs:
  - Create benchmark.json and run \`eval-viewer/generate_review.py\` to help the user review them
  - Run quantitative evals
- Repeat until you and the user are satisfied
- Package the final skill and return it to the user.

Please add steps to your TodoList, if you have such a thing, to make sure you don't forget. If you're in Cowork, please specifically put "Create evals JSON and run \`eval-viewer/generate_review.py\` so human can review test cases" in your TodoList to make sure it happens.

Good luck!
`,
  },
  {
    path: "skills/skill-creator/tools.md",
    content: `# Skill Creator Tools

## Scripts

All scripts are run as Python modules from the skill-creator directory using \`python -m scripts.<name>\`.

### scripts.run_eval

Runs trigger evaluation for a skill description. Tests whether a skill's description causes Claude to trigger (read the skill) for a set of queries.

**Usage:**
\`\`\`bash
python -m scripts.run_eval \\
  --eval-set <path-to-eval-set.json> \\
  --skill-path <path-to-skill> \\
  --model <model-id> \\
  [--timeout <seconds>]
\`\`\`

**Eval set format:**
\`\`\`json
[
  {"query": "user prompt text", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
\`\`\`

**Output:** JSON results showing which queries triggered the skill and whether they matched expectations.

---

### scripts.run_loop

Runs the eval + improve loop until all pass or max iterations reached. Combines \`run_eval.py\` and \`improve_description.py\` in a loop, tracking history and returning the best description found. Supports train/test split to prevent overfitting.

**Usage:**
\`\`\`bash
python -m scripts.run_loop \\
  --eval-set <path-to-trigger-eval.json> \\
  --skill-path <path-to-skill> \\
  --model <model-id-powering-this-session> \\
  --max-iterations 5 \\
  --verbose
\`\`\`

**Behavior:**
- Splits eval set into 60% train and 40% held-out test
- Evaluates current description (running each query 3 times for reliability)
- Calls Claude to propose improvements based on failures
- Re-evaluates each new description on both train and test
- Iterates up to max-iterations times
- Opens HTML report in browser showing results per iteration
- Returns JSON with \`best_description\` (selected by test score to avoid overfitting)

---

### scripts.improve_description

Improves a skill description based on eval results. Takes eval results from \`run_eval.py\` and generates an improved description by calling \`claude -p\` as a subprocess.

**Usage:**
\`\`\`bash
python -m scripts.improve_description \\
  --skill-path <path-to-skill> \\
  --eval-results <path-to-results.json> \\
  --model <model-id>
\`\`\`

**Output:** Prints the improved description to stdout.

---

### scripts.aggregate_benchmark

Aggregates individual run results into benchmark summary statistics. Reads grading.json files from run directories.

**Usage:**
\`\`\`bash
python -m scripts.aggregate_benchmark <benchmark_dir> --skill-name <name>
\`\`\`

**Output:** Produces \`benchmark.json\` and \`benchmark.md\` with:
- \`run_summary\` with mean, stddev, min, max for each metric
- \`delta\` between \`with_skill\` and \`without_skill\` configurations

**Supports two directory layouts:**
\`\`\`
# Workspace layout (from skill-creator iterations)
<benchmark_dir>/
└── eval-N/
    ├── with_skill/
    │   └── run-1/grading.json
    └── without_skill/
        └── run-1/grading.json

# Legacy layout
<benchmark_dir>/
└── runs/
    └── eval-N/
        └── ...
\`\`\`

---

### scripts.generate_report

Generates an HTML report from \`run_loop.py\` output. Shows each description attempt with check/x for each test case, distinguishing between train and test queries.

**Usage:**
\`\`\`bash
python -m scripts.generate_report <loop-output.json> [--output <report.html>]
\`\`\`

---

### scripts.package_skill

Creates a distributable \`.skill\` file from a skill folder.

**Usage:**
\`\`\`bash
python -m scripts.package_skill <path/to/skill-folder> [output-directory]
\`\`\`

**Example:**
\`\`\`bash
python -m scripts.package_skill skills/my-skill
python -m scripts.package_skill skills/my-skill ./dist
\`\`\`

**Behavior:**
- Validates the skill (checks SKILL.md exists, has valid frontmatter)
- Excludes \`__pycache__\`, \`node_modules\`, \`.pyc\` files, \`.DS_Store\`
- Excludes \`evals/\` directory at the skill root
- Creates a \`.skill\` zip archive

---

### scripts.quick_validate

Quick validation script for skills. Checks basic structure requirements.

**Usage:**
\`\`\`bash
python -m scripts.quick_validate <path/to/skill-folder>
\`\`\`

**Checks:**
- SKILL.md exists
- Has valid YAML frontmatter
- Required fields (name, description) are present

---

## Eval Viewer

### eval-viewer/generate_review.py

Generates an interactive HTML viewer for reviewing eval results. Supports both server mode and static file output.

**Usage:**
\`\`\`bash
# Server mode (opens in browser)
nohup python <skill-creator-path>/eval-viewer/generate_review.py \\
  <workspace>/iteration-N \\
  --skill-name "my-skill" \\
  --benchmark <workspace>/iteration-N/benchmark.json \\
  > /dev/null 2>&1 &

# With previous iteration comparison
python eval-viewer/generate_review.py \\
  <workspace>/iteration-N \\
  --skill-name "my-skill" \\
  --benchmark <workspace>/iteration-N/benchmark.json \\
  --previous-workspace <workspace>/iteration-<N-1>

# Static mode (for headless environments)
python eval-viewer/generate_review.py \\
  <workspace>/iteration-N \\
  --skill-name "my-skill" \\
  --static <output_path.html>
\`\`\`

**Features:**
- "Outputs" tab: Shows prompts, outputs, previous outputs, formal grades, feedback textbox
- "Benchmark" tab: Shows pass rates, timing, token usage per configuration
- Navigation via prev/next buttons or arrow keys
- "Submit All Reviews" saves all feedback to \`feedback.json\`

---

## Assets

### assets/eval_review.html

HTML template for the description optimization eval review interface. Contains placeholders:
- \`__EVAL_DATA_PLACEHOLDER__\` - Replace with JSON array of eval items
- \`__SKILL_NAME_PLACEHOLDER__\` - Replace with skill name
- \`__SKILL_DESCRIPTION_PLACEHOLDER__\` - Replace with current description

Users can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set" which downloads to \`~/Downloads/eval_set.json\`.
`,
  },
  {
    path: "skills/slack-gif-creator/skill.md",
    content: `---
name: slack-gif-creator
description: "Create animated GIFs optimized for Slack — constraints, validation, and animation concepts."
tags:
  - animation
  - slack
  - gif
  - design
  - python
---

# Slack GIF Creator

A toolkit providing utilities and knowledge for creating animated GIFs optimized for Slack.

## Slack Requirements

**Dimensions:**
- Emoji GIFs: 128x128 (recommended)
- Message GIFs: 480x480

**Parameters:**
- FPS: 10-30 (lower is smaller file size)
- Colors: 48-128 (fewer = smaller file size)
- Duration: Keep under 3 seconds for emoji GIFs

## Core Workflow

\`\`\`python
from core.gif_builder import GIFBuilder
from PIL import Image, ImageDraw

# 1. Create builder
builder = GIFBuilder(width=128, height=128, fps=10)

# 2. Generate frames
for i in range(12):
    frame = Image.new('RGB', (128, 128), (240, 248, 255))
    draw = ImageDraw.Draw(frame)

    # Draw your animation using PIL primitives
    # (circles, polygons, lines, etc.)

    builder.add_frame(frame)

# 3. Save with optimization
builder.save('output.gif', num_colors=48, optimize_for_emoji=True)
\`\`\`

## Drawing Graphics

### Working with User-Uploaded Images
If a user uploads an image, consider whether they want to:
- **Use it directly** (e.g., "animate this", "split this into frames")
- **Use it as inspiration** (e.g., "make something like this")

Load and work with images using PIL:
\`\`\`python
from PIL import Image

uploaded = Image.open('file.png')
# Use directly, or just as reference for colors/style
\`\`\`

### Drawing from Scratch
When drawing graphics from scratch, use PIL ImageDraw primitives:

\`\`\`python
from PIL import ImageDraw

draw = ImageDraw.Draw(frame)

# Circles/ovals
draw.ellipse([x1, y1, x2, y2], fill=(r, g, b), outline=(r, g, b), width=3)

# Stars, triangles, any polygon
points = [(x1, y1), (x2, y2), (x3, y3), ...]
draw.polygon(points, fill=(r, g, b), outline=(r, g, b), width=3)

# Lines
draw.line([(x1, y1), (x2, y2)], fill=(r, g, b), width=5)

# Rectangles
draw.rectangle([x1, y1, x2, y2], fill=(r, g, b), outline=(r, g, b), width=3)
\`\`\`

**Don't use:** Emoji fonts (unreliable across platforms) or assume pre-packaged graphics exist in this skill.

### Making Graphics Look Good

Graphics should look polished and creative, not basic. Here's how:

**Use thicker lines** - Always set \`width=2\` or higher for outlines and lines. Thin lines (width=1) look choppy and amateurish.

**Add visual depth**:
- Use gradients for backgrounds (\`create_gradient_background\`)
- Layer multiple shapes for complexity (e.g., a star with a smaller star inside)

**Make shapes more interesting**:
- Don't just draw a plain circle - add highlights, rings, or patterns
- Stars can have glows (draw larger, semi-transparent versions behind)
- Combine multiple shapes (stars + sparkles, circles + rings)

**Pay attention to colors**:
- Use vibrant, complementary colors
- Add contrast (dark outlines on light shapes, light outlines on dark shapes)
- Consider the overall composition

**For complex shapes** (hearts, snowflakes, etc.):
- Use combinations of polygons and ellipses
- Calculate points carefully for symmetry
- Add details (a heart can have a highlight curve, snowflakes have intricate branches)

Be creative and detailed! A good Slack GIF should look polished, not like placeholder graphics.

## Available Utilities

### GIFBuilder (\`core.gif_builder\`)
Assembles frames and optimizes for Slack:
\`\`\`python
builder = GIFBuilder(width=128, height=128, fps=10)
builder.add_frame(frame)  # Add PIL Image
builder.add_frames(frames)  # Add list of frames
builder.save('out.gif', num_colors=48, optimize_for_emoji=True, remove_duplicates=True)
\`\`\`

### Validators (\`core.validators\`)
Check if GIF meets Slack requirements:
\`\`\`python
from core.validators import validate_gif, is_slack_ready

# Detailed validation
passes, info = validate_gif('my.gif', is_emoji=True, verbose=True)

# Quick check
if is_slack_ready('my.gif'):
    print("Ready!")
\`\`\`

### Easing Functions (\`core.easing\`)
Smooth motion instead of linear:
\`\`\`python
from core.easing import interpolate

# Progress from 0.0 to 1.0
t = i / (num_frames - 1)

# Apply easing
y = interpolate(start=0, end=400, t=t, easing='ease_out')

# Available: linear, ease_in, ease_out, ease_in_out,
#           bounce_out, elastic_out, back_out
\`\`\`

### Frame Helpers (\`core.frame_composer\`)
Convenience functions for common needs:
\`\`\`python
from core.frame_composer import (
    create_blank_frame,         # Solid color background
    create_gradient_background,  # Vertical gradient
    draw_circle,                # Helper for circles
    draw_text,                  # Simple text rendering
    draw_star                   # 5-pointed star
)
\`\`\`

## Animation Concepts

### Shake/Vibrate
Offset object position with oscillation:
- Use \`math.sin()\` or \`math.cos()\` with frame index
- Add small random variations for natural feel
- Apply to x and/or y position

### Pulse/Heartbeat
Scale object size rhythmically:
- Use \`math.sin(t * frequency * 2 * math.pi)\` for smooth pulse
- For heartbeat: two quick pulses then pause (adjust sine wave)
- Scale between 0.8 and 1.2 of base size

### Bounce
Object falls and bounces:
- Use \`interpolate()\` with \`easing='bounce_out'\` for landing
- Use \`easing='ease_in'\` for falling (accelerating)
- Apply gravity by increasing y velocity each frame

### Spin/Rotate
Rotate object around center:
- PIL: \`image.rotate(angle, resample=Image.BICUBIC)\`
- For wobble: use sine wave for angle instead of linear

### Fade In/Out
Gradually appear or disappear:
- Create RGBA image, adjust alpha channel
- Or use \`Image.blend(image1, image2, alpha)\`
- Fade in: alpha from 0 to 1
- Fade out: alpha from 1 to 0

### Slide
Move object from off-screen to position:
- Start position: outside frame bounds
- End position: target location
- Use \`interpolate()\` with \`easing='ease_out'\` for smooth stop
- For overshoot: use \`easing='back_out'\`

### Zoom
Scale and position for zoom effect:
- Zoom in: scale from 0.1 to 2.0, crop center
- Zoom out: scale from 2.0 to 1.0
- Can add motion blur for drama (PIL filter)

### Explode/Particle Burst
Create particles radiating outward:
- Generate particles with random angles and velocities
- Update each particle: \`x += vx\`, \`y += vy\`
- Add gravity: \`vy += gravity_constant\`
- Fade out particles over time (reduce alpha)

## Optimization Strategies

Only when asked to make the file size smaller, implement a few of the following methods:

1. **Fewer frames** - Lower FPS (10 instead of 20) or shorter duration
2. **Fewer colors** - \`num_colors=48\` instead of 128
3. **Smaller dimensions** - 128x128 instead of 480x480
4. **Remove duplicates** - \`remove_duplicates=True\` in save()
5. **Emoji mode** - \`optimize_for_emoji=True\` auto-optimizes

\`\`\`python
# Maximum optimization for emoji
builder.save(
    'emoji.gif',
    num_colors=48,
    optimize_for_emoji=True,
    remove_duplicates=True
)
\`\`\`

## Philosophy

This skill provides:
- **Knowledge**: Slack's requirements and animation concepts
- **Utilities**: GIFBuilder, validators, easing functions
- **Flexibility**: Create the animation logic using PIL primitives

It does NOT provide:
- Rigid animation templates or pre-made functions
- Emoji font rendering (unreliable across platforms)
- A library of pre-packaged graphics built into the skill

**Note on user uploads**: This skill doesn't include pre-built graphics, but if a user uploads an image, use PIL to load and work with it - interpret based on their request whether they want it used directly or just as inspiration.

Be creative! Combine concepts (bouncing + rotating, pulsing + sliding, etc.) and use PIL's full capabilities.

## Dependencies

\`\`\`bash
pip install pillow imageio numpy
\`\`\`
`,
  },
  {
    path: "skills/slack-gif-creator/tools.md",
    content: `# Core Utility Modules

Python utility modules that provide the building blocks for creating Slack-optimized GIFs.

## core/gif_builder.py

GIF Builder - Core module for assembling frames into GIFs optimized for Slack.

\`\`\`python
#!/usr/bin/env python3
"""
GIF Builder - Core module for assembling frames into GIFs optimized for Slack.

This module provides the main interface for creating GIFs from programmatically
generated frames, with automatic optimization for Slack's requirements.
"""

from pathlib import Path
from typing import Optional

import imageio.v3 as imageio
import numpy as np
from PIL import Image


class GIFBuilder:
    """Builder for creating optimized GIFs from frames."""

    def __init__(self, width: int = 480, height: int = 480, fps: int = 15):
        """
        Initialize GIF builder.

        Args:
            width: Frame width in pixels
            height: Frame height in pixels
            fps: Frames per second
        """
        self.width = width
        self.height = height
        self.fps = fps
        self.frames: list[np.ndarray] = []

    def add_frame(self, frame: np.ndarray | Image.Image):
        """
        Add a frame to the GIF.

        Args:
            frame: Frame as numpy array or PIL Image (will be converted to RGB)
        """
        if isinstance(frame, Image.Image):
            frame = np.array(frame.convert("RGB"))

        # Ensure frame is correct size
        if frame.shape[:2] != (self.height, self.width):
            pil_frame = Image.fromarray(frame)
            pil_frame = pil_frame.resize(
                (self.width, self.height), Image.Resampling.LANCZOS
            )
            frame = np.array(pil_frame)

        self.frames.append(frame)

    def add_frames(self, frames: list[np.ndarray | Image.Image]):
        """Add multiple frames at once."""
        for frame in frames:
            self.add_frame(frame)

    def optimize_colors(
        self, num_colors: int = 128, use_global_palette: bool = True
    ) -> list[np.ndarray]:
        """
        Reduce colors in all frames using quantization.

        Args:
            num_colors: Target number of colors (8-256)
            use_global_palette: Use a single palette for all frames (better compression)

        Returns:
            List of color-optimized frames
        """
        optimized = []

        if use_global_palette and len(self.frames) > 1:
            # Create a global palette from all frames
            sample_size = min(5, len(self.frames))
            sample_indices = [
                int(i * len(self.frames) / sample_size) for i in range(sample_size)
            ]
            sample_frames = [self.frames[i] for i in sample_indices]

            all_pixels = np.vstack(
                [f.reshape(-1, 3) for f in sample_frames]
            )

            total_pixels = len(all_pixels)
            width = min(512, int(np.sqrt(total_pixels)))
            height = (total_pixels + width - 1) // width

            pixels_needed = width * height
            if pixels_needed > total_pixels:
                padding = np.zeros((pixels_needed - total_pixels, 3), dtype=np.uint8)
                all_pixels = np.vstack([all_pixels, padding])

            img_array = (
                all_pixels[:pixels_needed].reshape(height, width, 3).astype(np.uint8)
            )
            combined_img = Image.fromarray(img_array, mode="RGB")

            global_palette = combined_img.quantize(colors=num_colors, method=2)

            for frame in self.frames:
                pil_frame = Image.fromarray(frame)
                quantized = pil_frame.quantize(palette=global_palette, dither=1)
                optimized.append(np.array(quantized.convert("RGB")))
        else:
            for frame in self.frames:
                pil_frame = Image.fromarray(frame)
                quantized = pil_frame.quantize(colors=num_colors, method=2, dither=1)
                optimized.append(np.array(quantized.convert("RGB")))

        return optimized

    def deduplicate_frames(self, threshold: float = 0.9995) -> int:
        """
        Remove duplicate or near-duplicate consecutive frames.

        Args:
            threshold: Similarity threshold (0.0-1.0). Higher = more strict.

        Returns:
            Number of frames removed
        """
        if len(self.frames) < 2:
            return 0

        deduplicated = [self.frames[0]]
        removed_count = 0

        for i in range(1, len(self.frames)):
            prev_frame = np.array(deduplicated[-1], dtype=np.float32)
            curr_frame = np.array(self.frames[i], dtype=np.float32)

            diff = np.abs(prev_frame - curr_frame)
            similarity = 1.0 - (np.mean(diff) / 255.0)

            if similarity < threshold:
                deduplicated.append(self.frames[i])
            else:
                removed_count += 1

        self.frames = deduplicated
        return removed_count

    def save(
        self,
        output_path: str | Path,
        num_colors: int = 128,
        optimize_for_emoji: bool = False,
        remove_duplicates: bool = False,
    ) -> dict:
        """
        Save frames as optimized GIF for Slack.

        Args:
            output_path: Where to save the GIF
            num_colors: Number of colors to use (fewer = smaller file)
            optimize_for_emoji: If True, optimize for emoji size (128x128, fewer colors)
            remove_duplicates: If True, remove duplicate consecutive frames

        Returns:
            Dictionary with file info (path, size, dimensions, frame_count)
        """
        if not self.frames:
            raise ValueError("No frames to save. Add frames with add_frame() first.")

        output_path = Path(output_path)

        if remove_duplicates:
            removed = self.deduplicate_frames(threshold=0.9995)
            if removed > 0:
                print(f"  Removed {removed} nearly identical frames")

        if optimize_for_emoji:
            if self.width > 128 or self.height > 128:
                self.width = 128
                self.height = 128
                resized_frames = []
                for frame in self.frames:
                    pil_frame = Image.fromarray(frame)
                    pil_frame = pil_frame.resize((128, 128), Image.Resampling.LANCZOS)
                    resized_frames.append(np.array(pil_frame))
                self.frames = resized_frames
            num_colors = min(num_colors, 48)

            if len(self.frames) > 12:
                keep_every = max(1, len(self.frames) // 12)
                self.frames = [
                    self.frames[i] for i in range(0, len(self.frames), keep_every)
                ]

        optimized_frames = self.optimize_colors(num_colors, use_global_palette=True)
        frame_duration = 1000 / self.fps

        imageio.imwrite(
            output_path,
            optimized_frames,
            duration=frame_duration,
            loop=0,
        )

        file_size_kb = output_path.stat().st_size / 1024
        file_size_mb = file_size_kb / 1024

        info = {
            "path": str(output_path),
            "size_kb": file_size_kb,
            "size_mb": file_size_mb,
            "dimensions": f"{self.width}x{self.height}",
            "frame_count": len(optimized_frames),
            "fps": self.fps,
            "duration_seconds": len(optimized_frames) / self.fps,
            "colors": num_colors,
        }

        return info

    def clear(self):
        """Clear all frames."""
        self.frames = []
\`\`\`

## core/validators.py

Validators - Check if GIFs meet Slack's requirements.

\`\`\`python
#!/usr/bin/env python3
"""
Validators - Check if GIFs meet Slack's requirements.
"""

from pathlib import Path


def validate_gif(
    gif_path: str | Path, is_emoji: bool = True, verbose: bool = True
) -> tuple[bool, dict]:
    """
    Validate GIF for Slack (dimensions, size, frame count).

    Args:
        gif_path: Path to GIF file
        is_emoji: True for emoji (128x128 recommended), False for message GIF
        verbose: Print validation details

    Returns:
        Tuple of (passes: bool, results: dict with all details)
    """
    from PIL import Image

    gif_path = Path(gif_path)

    if not gif_path.exists():
        return False, {"error": f"File not found: {gif_path}"}

    size_bytes = gif_path.stat().st_size
    size_kb = size_bytes / 1024
    size_mb = size_kb / 1024

    try:
        with Image.open(gif_path) as img:
            width, height = img.size
            frame_count = 0
            try:
                while True:
                    img.seek(frame_count)
                    frame_count += 1
            except EOFError:
                pass

            try:
                duration_ms = img.info.get("duration", 100)
                total_duration = (duration_ms * frame_count) / 1000
                fps = frame_count / total_duration if total_duration > 0 else 0
            except:
                total_duration = None
                fps = None
    except Exception as e:
        return False, {"error": f"Failed to read GIF: {e}"}

    if is_emoji:
        optimal = width == height == 128
        acceptable = width == height and 64 <= width <= 128
        dim_pass = acceptable
    else:
        aspect_ratio = (
            max(width, height) / min(width, height)
            if min(width, height) > 0
            else float("inf")
        )
        dim_pass = aspect_ratio <= 2.0 and 320 <= min(width, height) <= 640

    results = {
        "file": str(gif_path),
        "passes": dim_pass,
        "width": width,
        "height": height,
        "size_kb": size_kb,
        "size_mb": size_mb,
        "frame_count": frame_count,
        "duration_seconds": total_duration,
        "fps": fps,
        "is_emoji": is_emoji,
        "optimal": optimal if is_emoji else None,
    }

    return dim_pass, results


def is_slack_ready(
    gif_path: str | Path, is_emoji: bool = True, verbose: bool = True
) -> bool:
    """Quick check if GIF is ready for Slack."""
    passes, _ = validate_gif(gif_path, is_emoji, verbose)
    return passes
\`\`\`

## core/easing.py

Easing Functions - Timing functions for smooth animations.

\`\`\`python
#!/usr/bin/env python3
"""
Easing Functions - Timing functions for smooth animations.

All functions take a value t (0.0 to 1.0) and return eased value (0.0 to 1.0).
"""

import math


def linear(t: float) -> float:
    return t

def ease_in_quad(t: float) -> float:
    return t * t

def ease_out_quad(t: float) -> float:
    return t * (2 - t)

def ease_in_out_quad(t: float) -> float:
    if t < 0.5:
        return 2 * t * t
    return -1 + (4 - 2 * t) * t

def ease_in_cubic(t: float) -> float:
    return t * t * t

def ease_out_cubic(t: float) -> float:
    return (t - 1) * (t - 1) * (t - 1) + 1

def ease_in_out_cubic(t: float) -> float:
    if t < 0.5:
        return 4 * t * t * t
    return (t - 1) * (2 * t - 2) * (2 * t - 2) + 1

def ease_in_bounce(t: float) -> float:
    return 1 - ease_out_bounce(1 - t)

def ease_out_bounce(t: float) -> float:
    if t < 1 / 2.75:
        return 7.5625 * t * t
    elif t < 2 / 2.75:
        t -= 1.5 / 2.75
        return 7.5625 * t * t + 0.75
    elif t < 2.5 / 2.75:
        t -= 2.25 / 2.75
        return 7.5625 * t * t + 0.9375
    else:
        t -= 2.625 / 2.75
        return 7.5625 * t * t + 0.984375

def ease_in_out_bounce(t: float) -> float:
    if t < 0.5:
        return ease_in_bounce(t * 2) * 0.5
    return ease_out_bounce(t * 2 - 1) * 0.5 + 0.5

def ease_in_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    return -math.pow(2, 10 * (t - 1)) * math.sin((t - 1.1) * 5 * math.pi)

def ease_out_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    return math.pow(2, -10 * t) * math.sin((t - 0.1) * 5 * math.pi) + 1

def ease_in_out_elastic(t: float) -> float:
    if t == 0 or t == 1:
        return t
    t = t * 2 - 1
    if t < 0:
        return -0.5 * math.pow(2, 10 * t) * math.sin((t - 0.1) * 5 * math.pi)
    return math.pow(2, -10 * t) * math.sin((t - 0.1) * 5 * math.pi) * 0.5 + 1

def ease_back_in(t: float) -> float:
    c1 = 1.70158
    c3 = c1 + 1
    return c3 * t * t * t - c1 * t * t

def ease_back_out(t: float) -> float:
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)

def ease_back_in_out(t: float) -> float:
    c1 = 1.70158
    c2 = c1 * 1.525
    if t < 0.5:
        return (pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    return (pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2


# Convenience mapping
EASING_FUNCTIONS = {
    "linear": linear,
    "ease_in": ease_in_quad,
    "ease_out": ease_out_quad,
    "ease_in_out": ease_in_out_quad,
    "bounce_in": ease_in_bounce,
    "bounce_out": ease_out_bounce,
    "bounce": ease_in_out_bounce,
    "elastic_in": ease_in_elastic,
    "elastic_out": ease_out_elastic,
    "elastic": ease_in_out_elastic,
    "back_in": ease_back_in,
    "back_out": ease_back_out,
    "back_in_out": ease_back_in_out,
    "anticipate": ease_back_in,
    "overshoot": ease_back_out,
}


def get_easing(name: str = "linear"):
    return EASING_FUNCTIONS.get(name, linear)


def interpolate(start: float, end: float, t: float, easing: str = "linear") -> float:
    """Interpolate between two values with easing."""
    ease_func = get_easing(easing)
    eased_t = ease_func(t)
    return start + (end - start) * eased_t


def apply_squash_stretch(
    base_scale: tuple[float, float], intensity: float, direction: str = "vertical"
) -> tuple[float, float]:
    """Calculate squash and stretch scales for more dynamic animation."""
    width_scale, height_scale = base_scale
    if direction == "vertical":
        height_scale *= 1 - intensity * 0.5
        width_scale *= 1 + intensity * 0.5
    elif direction == "horizontal":
        width_scale *= 1 - intensity * 0.5
        height_scale *= 1 + intensity * 0.5
    elif direction == "both":
        width_scale *= 1 - intensity * 0.3
        height_scale *= 1 - intensity * 0.3
    return (width_scale, height_scale)


def calculate_arc_motion(
    start: tuple[float, float], end: tuple[float, float], height: float, t: float
) -> tuple[float, float]:
    """Calculate position along a parabolic arc (natural motion path)."""
    x1, y1 = start
    x2, y2 = end
    x = x1 + (x2 - x1) * t
    arc_offset = 4 * height * t * (1 - t)
    y = y1 + (y2 - y1) * t - arc_offset
    return (x, y)
\`\`\`

## core/frame_composer.py

Frame Composer - Utilities for composing visual elements into frames.

\`\`\`python
#!/usr/bin/env python3
"""
Frame Composer - Utilities for composing visual elements into frames.

Provides functions for drawing shapes, text, and compositing elements
together to create animation frames.
"""

from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def create_blank_frame(
    width: int, height: int, color: tuple[int, int, int] = (255, 255, 255)
) -> Image.Image:
    """Create a blank frame with solid color background."""
    return Image.new("RGB", (width, height), color)


def draw_circle(
    frame: Image.Image,
    center: tuple[int, int],
    radius: int,
    fill_color: Optional[tuple[int, int, int]] = None,
    outline_color: Optional[tuple[int, int, int]] = None,
    outline_width: int = 1,
) -> Image.Image:
    """Draw a circle on a frame."""
    draw = ImageDraw.Draw(frame)
    x, y = center
    bbox = [x - radius, y - radius, x + radius, y + radius]
    draw.ellipse(bbox, fill=fill_color, outline=outline_color, width=outline_width)
    return frame


def draw_text(
    frame: Image.Image,
    text: str,
    position: tuple[int, int],
    color: tuple[int, int, int] = (0, 0, 0),
    centered: bool = False,
) -> Image.Image:
    """Draw text on a frame."""
    draw = ImageDraw.Draw(frame)
    font = ImageFont.load_default()
    if centered:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = position[0] - text_width // 2
        y = position[1] - text_height // 2
        position = (x, y)
    draw.text(position, text, fill=color, font=font)
    return frame


def create_gradient_background(
    width: int,
    height: int,
    top_color: tuple[int, int, int],
    bottom_color: tuple[int, int, int],
) -> Image.Image:
    """Create a vertical gradient background."""
    frame = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(frame)
    r1, g1, b1 = top_color
    r2, g2, b2 = bottom_color
    for y in range(height):
        ratio = y / height
        r = int(r1 * (1 - ratio) + r2 * ratio)
        g = int(g1 * (1 - ratio) + g2 * ratio)
        b = int(b1 * (1 - ratio) + b2 * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return frame


def draw_star(
    frame: Image.Image,
    center: tuple[int, int],
    size: int,
    fill_color: tuple[int, int, int],
    outline_color: Optional[tuple[int, int, int]] = None,
    outline_width: int = 1,
) -> Image.Image:
    """Draw a 5-pointed star."""
    import math
    draw = ImageDraw.Draw(frame)
    x, y = center
    points = []
    for i in range(10):
        angle = (i * 36 - 90) * math.pi / 180
        radius = size if i % 2 == 0 else size * 0.4
        px = x + radius * math.cos(angle)
        py = y + radius * math.sin(angle)
        points.append((px, py))
    draw.polygon(points, fill=fill_color, outline=outline_color, width=outline_width)
    return frame
\`\`\`
`,
  },
  {
    path: "skills/taste-skill/examples.md",
    content: `# Creative Arsenal & Bento Paradigm

## THE CREATIVE ARSENAL (High-End Inspiration)

Do not default to generic UI. Pull from this library of advanced concepts to ensure the output is visually striking and memorable. When appropriate, leverage **GSAP (ScrollTrigger/Parallax)** for complex scrolltelling or **ThreeJS/WebGL** for 3D/Canvas animations, rather than basic CSS motion. **CRITICAL:** Never mix GSAP/ThreeJS with Framer Motion in the same component tree. Default to Framer Motion for UI/Bento interactions. Use GSAP/ThreeJS EXCLUSIVELY for isolated full-page scrolltelling or canvas backgrounds, wrapped in strict useEffect cleanup blocks.

### The Standard Hero Paradigm

- Stop doing centered text over a dark image. Try asymmetric Hero sections: Text cleanly aligned to the left or right. The background should feature a high-quality, relevant image with a subtle stylistic fade (darkening or lightening gracefully into the background color depending on if it is Light or Dark mode).

### Navigation & Menus

- **Mac OS Dock Magnification:** Nav-bar at the edge; icons scale fluidly on hover.
- **Magnetic Button:** Buttons that physically pull toward the cursor.
- **Gooey Menu:** Sub-items detach from the main button like a viscous liquid.
- **Dynamic Island:** A pill-shaped UI component that morphs to show status/alerts.
- **Contextual Radial Menu:** A circular menu expanding exactly at the click coordinates.
- **Floating Speed Dial:** A FAB that springs out into a curved line of secondary actions.
- **Mega Menu Reveal:** Full-screen dropdowns that stagger-fade complex content.

### Layout & Grids

- **Bento Grid:** Asymmetric, tile-based grouping (e.g., Apple Control Center).
- **Masonry Layout:** Staggered grid without fixed row heights (e.g., Pinterest).
- **Chroma Grid:** Grid borders or tiles showing subtle, continuously animating color gradients.
- **Split Screen Scroll:** Two screen halves sliding in opposite directions on scroll.
- **Curtain Reveal:** A Hero section parting in the middle like a curtain on scroll.

### Cards & Containers

- **Parallax Tilt Card:** A 3D-tilting card tracking the mouse coordinates.
- **Spotlight Border Card:** Card borders that illuminate dynamically under the cursor.
- **Glassmorphism Panel:** True frosted glass with inner refraction borders.
- **Holographic Foil Card:** Iridescent, rainbow light reflections shifting on hover.
- **Tinder Swipe Stack:** A physical stack of cards the user can swipe away.
- **Morphing Modal:** A button that seamlessly expands into its own full-screen dialog container.

### Scroll-Animations

- **Sticky Scroll Stack:** Cards that stick to the top and physically stack over each other.
- **Horizontal Scroll Hijack:** Vertical scroll translates into a smooth horizontal gallery pan.
- **Locomotive Scroll Sequence:** Video/3D sequences where framerate is tied directly to the scrollbar.
- **Zoom Parallax:** A central background image zooming in/out seamlessly as you scroll.
- **Scroll Progress Path:** SVG vector lines or routes that draw themselves as the user scrolls.
- **Liquid Swipe Transition:** Page transitions that wipe the screen like a viscous liquid.

### Galleries & Media

- **Dome Gallery:** A 3D gallery feeling like a panoramic dome.
- **Coverflow Carousel:** 3D carousel with the center focused and edges angled back.
- **Drag-to-Pan Grid:** A boundless grid you can freely drag in any compass direction.
- **Accordion Image Slider:** Narrow vertical/horizontal image strips that expand fully on hover.
- **Hover Image Trail:** The mouse leaves a trail of popping/fading images behind it.
- **Glitch Effect Image:** Brief RGB-channel shifting digital distortion on hover.

### Typography & Text

- **Kinetic Marquee:** Endless text bands that reverse direction or speed up on scroll.
- **Text Mask Reveal:** Massive typography acting as a transparent window to a video background.
- **Text Scramble Effect:** Matrix-style character decoding on load or hover.
- **Circular Text Path:** Text curved along a spinning circular path.
- **Gradient Stroke Animation:** Outlined text with a gradient continuously running along the stroke.
- **Kinetic Typography Grid:** A grid of letters dodging or rotating away from the cursor.

### Micro-Interactions & Effects

- **Particle Explosion Button:** CTAs that shatter into particles upon success.
- **Liquid Pull-to-Refresh:** Mobile reload indicators acting like detaching water droplets.
- **Skeleton Shimmer:** Shifting light reflections moving across placeholder boxes.
- **Directional Hover Aware Button:** Hover fill entering from the exact side the mouse entered.
- **Ripple Click Effect:** Visual waves rippling precisely from the click coordinates.
- **Animated SVG Line Drawing:** Vectors that draw their own contours in real-time.
- **Mesh Gradient Background:** Organic, lava-lamp-like animated color blobs.
- **Lens Blur Depth:** Dynamic focus blurring background UI layers to highlight a foreground action.

---

## THE "MOTION-ENGINE" BENTO PARADIGM

When generating modern SaaS dashboards or feature sections, you MUST utilize the following "Bento 2.0" architecture and motion philosophy. This goes beyond static cards and enforces a "Vercel-core meets Dribbble-clean" aesthetic heavily reliant on perpetual physics.

### A. Core Design Philosophy

- **Aesthetic:** High-end, minimal, and functional.
- **Palette:** Background in \`#f9fafb\`. Cards are pure white (\`#ffffff\`) with a 1px border of \`border-slate-200/50\`.
- **Surfaces:** Use \`rounded-[2.5rem]\` for all major containers. Apply a "diffusion shadow" (a very light, wide-spreading shadow, e.g., \`shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]\`) to create depth without clutter.
- **Typography:** Strict \`Geist\`, \`Satoshi\`, or \`Cabinet Grotesk\` font stack. Use subtle tracking (\`tracking-tight\`) for headers.
- **Labels:** Titles and descriptions must be placed **outside and below** the cards to maintain a clean, gallery-style presentation.
- **Pixel-Perfection:** Use generous \`p-8\` or \`p-10\` padding inside cards.

### B. The Animation Engine Specs (Perpetual Motion)

All cards must contain **"Perpetual Micro-Interactions."** Use the following Framer Motion principles:

- **Spring Physics:** No linear easing. Use \`type: "spring", stiffness: 100, damping: 20\` for a premium, weighty feel.
- **Layout Transitions:** Heavily utilize the \`layout\` and \`layoutId\` props to ensure smooth re-ordering, resizing, and shared element state transitions.
- **Infinite Loops:** Every card must have an "Active State" that loops infinitely (Pulse, Typewriter, Float, or Carousel) to ensure the dashboard feels "alive".
- **Performance:** Wrap dynamic lists in \`<AnimatePresence>\` and optimize for 60fps. **PERFORMANCE CRITICAL:** Any perpetual motion or infinite loop MUST be memoized (React.memo) and completely isolated in its own microscopic Client Component. Never trigger re-renders in the parent layout.

### C. The 5-Card Archetypes (Micro-Animation Specs)

Implement these specific micro-animations when constructing Bento grids (e.g., Row 1: 3 cols | Row 2: 2 cols split 70/30):

1. **The Intelligent List:** A vertical stack of items with an infinite auto-sorting loop. Items swap positions using \`layoutId\`, simulating an AI prioritizing tasks in real-time.

2. **The Command Input:** A search/AI bar with a multi-step Typewriter Effect. It cycles through complex prompts, including a blinking cursor and a "processing" state with a shimmering loading gradient.

3. **The Live Status:** A scheduling interface with "breathing" status indicators. Include a pop-up notification badge that emerges with an "Overshoot" spring effect, stays for 3 seconds, and vanishes.

4. **The Wide Data Stream:** A horizontal "Infinite Carousel" of data cards or metrics. Ensure the loop is seamless (using \`x: ["0%", "-100%"]\`) with a speed that feels effortless.

5. **The Contextual UI (Focus Mode):** A document view that animates a staggered highlight of a text block, followed by a "Float-in" of a floating action toolbar with micro-icons.
`,
  },
  {
    path: "skills/taste-skill/references.md",
    content: `# Technical Reference

## DESIGN_VARIANCE (Level 1-10)

- **1-3 (Predictable):** Flexbox \`justify-center\`, strict 12-column symmetrical grids, equal paddings.
- **4-7 (Offset):** Use \`margin-top: -2rem\` overlapping, varied image aspect ratios (e.g., 4:3 next to 16:9), left-aligned headers over center-aligned data.
- **8-10 (Asymmetric):** Masonry layouts, CSS Grid with fractional units (e.g., \`grid-template-columns: 2fr 1fr 1fr\`), massive empty zones (\`padding-left: 20vw\`).
- **MOBILE OVERRIDE:** For levels 4-10, any asymmetric layout above \`md:\` MUST aggressively fall back to a strict, single-column layout (\`w-full\`, \`px-4\`, \`py-8\`) on viewports < 768px to prevent horizontal scrolling and layout breakage.

## MOTION_INTENSITY (Level 1-10)

- **1-3 (Static):** No automatic animations. CSS \`:hover\` and \`:active\` states only.
- **4-7 (Fluid CSS):** Use \`transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1)\`. Use \`animation-delay\` cascades for load-ins. Focus strictly on \`transform\` and \`opacity\`. Use \`will-change: transform\` sparingly.
- **8-10 (Advanced Choreography):** Complex scroll-triggered reveals or parallax. Use Framer Motion hooks. NEVER use \`window.addEventListener('scroll')\`.

## VISUAL_DENSITY (Level 1-10)

- **1-3 (Art Gallery Mode):** Lots of white space. Huge section gaps. Everything feels very expensive and clean.
- **4-7 (Daily App Mode):** Normal spacing for standard web apps.
- **8-10 (Cockpit Mode):** Tiny paddings. No card boxes; just 1px lines to separate data. Everything is packed. **Mandatory:** Use Monospace (\`font-mono\`) for all numbers.

## AI TELLS (Forbidden Patterns)

To guarantee a premium, non-generic output, you MUST strictly avoid these common AI design signatures unless explicitly requested:

### Visual & CSS

- **NO Neon/Outer Glows:** Do not use default \`box-shadow\` glows or auto-glows. Use inner borders or subtle tinted shadows.
- **NO Pure Black:** Never use \`#000000\`. Use Off-Black, Zinc-950, or Charcoal.
- **NO Oversaturated Accents:** Desaturate accents to blend elegantly with neutrals.
- **NO Excessive Gradient Text:** Do not use text-fill gradients for large headers.
- **NO Custom Mouse Cursors:** They are outdated and ruin performance/accessibility.

### Typography

- **NO Inter Font:** Banned. Use \`Geist\`, \`Outfit\`, \`Cabinet Grotesk\`, or \`Satoshi\`.
- **NO Oversized H1s:** The first heading should not scream. Control hierarchy with weight and color, not just massive scale.
- **Serif Constraints:** Use Serif fonts ONLY for creative/editorial designs. **NEVER** use Serif on clean Dashboards.

### Layout & Spacing

- **Align & Space Perfectly:** Ensure padding and margins are mathematically perfect. Avoid floating elements with awkward gaps.
- **NO 3-Column Card Layouts:** The generic "3 equal cards horizontally" feature row is BANNED. Use a 2-column Zig-Zag, asymmetric grid, or horizontal scrolling approach instead.

### Content & Data (The "Jane Doe" Effect)

- **NO Generic Names:** "John Doe", "Sarah Chan", or "Jack Su" are banned. Use highly creative, realistic-sounding names.
- **NO Generic Avatars:** DO NOT use standard SVG "egg" or Lucide user icons for avatars. Use creative, believable photo placeholders or specific styling.
- **NO Fake Numbers:** Avoid predictable outputs like \`99.99%\`, \`50%\`, or basic phone numbers (\`1234567\`). Use organic, messy data (\`47.2%\`, \`+1 (312) 847-1928\`).
- **NO Startup Slop Names:** "Acme", "Nexus", "SmartFlow". Invent premium, contextual brand names.
- **NO Filler Words:** Avoid AI copywriting cliches like "Elevate", "Seamless", "Unleash", or "Next-Gen". Use concrete verbs.

### External Resources & Components

- **NO Broken Unsplash Links:** Do not use Unsplash. Use absolute, reliable placeholders like \`https://picsum.photos/seed/{random_string}/800/600\` or SVG UI Avatars.
- **shadcn/ui Customization:** You may use \`shadcn/ui\`, but NEVER in its generic default state. You MUST customize the radii, colors, and shadows to match the high-end project aesthetic.
- **Production-Ready Cleanliness:** Code must be extremely clean, visually striking, memorable, and meticulously refined in every detail.
`,
  },
  {
    path: "skills/taste-skill/skill.md",
    content: `---
name: design-taste-frontend
description: Senior UI/UX Engineer. Architect digital interfaces overriding default LLM biases. Enforces metric-based rules, strict component architecture, CSS hardware acceleration, and balanced design engineering.
tags:
  - frontend
  - design
  - ui-ux
---

# High-Agency Frontend Skill

## 1. ACTIVE BASELINE CONFIGURATION

- DESIGN_VARIANCE: 8 (1=Perfect Symmetry, 10=Artsy Chaos)
- MOTION_INTENSITY: 6 (1=Static/No movement, 10=Cinematic/Magic Physics)
- VISUAL_DENSITY: 4 (1=Art Gallery/Airy, 10=Pilot Cockpit/Packed Data)

**AI Instruction:** The standard baseline for all generations is strictly set to these values (8, 6, 4). Do not ask the user to edit this file. Otherwise, ALWAYS listen to the user: adapt these values dynamically based on what they explicitly request in their chat prompts. Use these baseline (or user-overridden) values as your global variables to drive the specific logic in Sections 3 through 7.

## 2. DEFAULT ARCHITECTURE & CONVENTIONS

Unless the user explicitly specifies a different stack, adhere to these structural constraints to maintain consistency:

- **DEPENDENCY VERIFICATION [MANDATORY]:** Before importing ANY 3rd party library (e.g. \`framer-motion\`, \`lucide-react\`, \`zustand\`), you MUST check \`package.json\`. If the package is missing, you MUST output the installation command (e.g. \`npm install package-name\`) before providing the code. **Never** assume a library exists.

- **Framework & Interactivity:** React or Next.js. Default to Server Components (\`RSC\`).
  - **RSC SAFETY:** Global state works ONLY in Client Components. In Next.js, wrap providers in a \`"use client"\` component.
  - **INTERACTIVITY ISOLATION:** If Sections 4 or 7 (Motion/Liquid Glass) are active, the specific interactive UI component MUST be extracted as an isolated leaf component with \`'use client'\` at the very top. Server Components must exclusively render static layouts.

- **State Management:** Use local \`useState\`/\`useReducer\` for isolated UI. Use global state strictly for deep prop-drilling avoidance.

- **Styling Policy:** Use Tailwind CSS (v3/v4) for 90% of styling.
  - **TAILWIND VERSION LOCK:** Check \`package.json\` first. Do not use v4 syntax in v3 projects.
  - **T4 CONFIG GUARD:** For v4, do NOT use \`tailwindcss\` plugin in \`postcss.config.js\`. Use \`@tailwindcss/postcss\` or the Vite plugin.

- **ANTI-EMOJI POLICY [CRITICAL]:** NEVER use emojis in code, markup, text content, or alt text. Replace symbols with high-quality icons (Radix, Phosphor) or clean SVG primitives. Emojis are BANNED.

- **Responsiveness & Spacing:**
  - Standardize breakpoints (\`sm\`, \`md\`, \`lg\`, \`xl\`).
  - Contain page layouts using \`max-w-[1400px] mx-auto\` or \`max-w-7xl\`.
  - **Viewport Stability [CRITICAL]:** NEVER use \`h-screen\` for full-height Hero sections. ALWAYS use \`min-h-[100dvh]\` to prevent catastrophic layout jumping on mobile browsers (iOS Safari).
  - **Grid over Flex-Math:** NEVER use complex flexbox percentage math (\`w-[calc(33%-1rem)]\`). ALWAYS use CSS Grid (\`grid grid-cols-1 md:grid-cols-3 gap-6\`) for reliable structures.

- **Icons:** You MUST use exactly \`@phosphor-icons/react\` or \`@radix-ui/react-icons\` as the import paths (check installed version). Standardize \`strokeWidth\` globally (e.g., exclusively use \`1.5\` or \`2.0\`).

## 3. DESIGN ENGINEERING DIRECTIVES (Bias Correction)

LLMs have statistical biases toward specific UI cliche patterns. Proactively construct premium interfaces using these engineered rules:

**Rule 1: Deterministic Typography**

- **Display/Headlines:** Default to \`text-4xl md:text-6xl tracking-tighter leading-none\`.
  - **ANTI-SLOP:** Discourage \`Inter\` for "Premium" or "Creative" vibes. Force unique character using \`Geist\`, \`Outfit\`, \`Cabinet Grotesk\`, or \`Satoshi\`.
  - **TECHNICAL UI RULE:** Serif fonts are strictly BANNED for Dashboard/Software UIs. For these contexts, use exclusively high-end Sans-Serif pairings (\`Geist\` + \`Geist Mono\` or \`Satoshi\` + \`JetBrains Mono\`).

- **Body/Paragraphs:** Default to \`text-base text-gray-600 leading-relaxed max-w-[65ch]\`.

**Rule 2: Color Calibration**

- **Constraint:** Max 1 Accent Color. Saturation < 80%.
- **THE LILA BAN:** The "AI Purple/Blue" aesthetic is strictly BANNED. No purple button glows, no neon gradients. Use absolute neutral bases (Zinc/Slate) with high-contrast, singular accents (e.g. Emerald, Electric Blue, or Deep Rose).
- **COLOR CONSISTENCY:** Stick to one palette for the entire output. Do not fluctuate between warm and cool grays within the same project.

**Rule 3: Layout Diversification**

- **ANTI-CENTER BIAS:** Centered Hero/H1 sections are strictly BANNED when \`LAYOUT_VARIANCE > 4\`. Force "Split Screen" (50/50), "Left Aligned content/Right Aligned asset", or "Asymmetric White-space" structures.

**Rule 4: Materiality, Shadows, and "Anti-Card Overuse"**

- **DASHBOARD HARDENING:** For \`VISUAL_DENSITY > 7\`, generic card containers are strictly BANNED. Use logic-grouping via \`border-t\`, \`divide-y\`, or purely negative space. Data metrics should breathe without being boxed in unless elevation (z-index) is functionally required.
- **Execution:** Use cards ONLY when elevation communicates hierarchy. When a shadow is used, tint it to the background hue.

**Rule 5: Interactive UI States**

- **Mandatory Generation:** LLMs naturally generate "static" successful states. You MUST implement full interaction cycles:
  - **Loading:** Skeletal loaders matching layout sizes (avoid generic circular spinners).
  - **Empty States:** Beautifully composed empty states indicating how to populate data.
  - **Error States:** Clear, inline error reporting (e.g., forms).
  - **Tactile Feedback:** On \`:active\`, use \`-translate-y-[1px]\` or \`scale-[0.98]\` to simulate a physical push indicating success/action.

**Rule 6: Data & Form Patterns**

- **Forms:** Label MUST sit above input. Helper text is optional but should exist in markup. Error text below input. Use a standard \`gap-2\` for input blocks.

## 4. CREATIVE PROACTIVITY (Anti-Slop Implementation)

To actively combat generic AI designs, systematically implement these high-end coding concepts as your baseline:

- **"Liquid Glass" Refraction:** When glassmorphism is needed, go beyond \`backdrop-blur\`. Add a 1px inner border (\`border-white/10\`) and a subtle inner shadow (\`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]\`) to simulate physical edge refraction.

- **Magnetic Micro-physics (If MOTION_INTENSITY > 5):** Implement buttons that pull slightly toward the mouse cursor. **CRITICAL:** NEVER use React \`useState\` for magnetic hover or continuous animations. Use EXCLUSIVELY Framer Motion's \`useMotionValue\` and \`useTransform\` outside the React render cycle to prevent performance collapse on mobile.

- **Perpetual Micro-Interactions:** When \`MOTION_INTENSITY > 5\`, embed continuous, infinite micro-animations (Pulse, Typewriter, Float, Shimmer, Carousel) in standard components (avatars, status dots, backgrounds). Apply premium Spring Physics (\`type: "spring", stiffness: 100, damping: 20\`) to all interactive elements -- no linear easing.

- **Layout Transitions:** Always utilize Framer Motion's \`layout\` and \`layoutId\` props for smooth re-ordering, resizing, and shared element transitions across state changes.

- **Staggered Orchestration:** Do not mount lists or grids instantly. Use \`staggerChildren\` (Framer) or CSS cascade (\`animation-delay: calc(var(--index) * 100ms)\`) to create sequential waterfall reveals. **CRITICAL:** For \`staggerChildren\`, the Parent (\`variants\`) and Children MUST reside in the identical Client Component tree. If data is fetched asynchronously, pass the data as props into a centralized Parent Motion wrapper.

## 5. PERFORMANCE GUARDRAILS

- **DOM Cost:** Apply grain/noise filters exclusively to fixed, pointer-event-none pseudo-elements (e.g., \`fixed inset-0 z-50 pointer-events-none\`) and NEVER to scrolling containers to prevent continuous GPU repaints and mobile performance degradation.

- **Hardware Acceleration:** Never animate \`top\`, \`left\`, \`width\`, or \`height\`. Animate exclusively via \`transform\` and \`opacity\`.

- **Z-Index Restraint:** NEVER spam arbitrary \`z-50\` or \`z-10\` unprompted. Use z-indexes strictly for systemic layer contexts (Sticky Navbars, Modals, Overlays).

## 10. FINAL PRE-FLIGHT CHECK

Evaluate your code against this matrix before outputting. This is the **last** filter you apply to your logic.

- [ ] Is global state used appropriately to avoid deep prop-drilling rather than arbitrarily?
- [ ] Is mobile layout collapse (\`w-full\`, \`px-4\`, \`max-w-7xl mx-auto\`) guaranteed for high-variance designs?
- [ ] Do full-height sections safely use \`min-h-[100dvh]\` instead of the bugged \`h-screen\`?
- [ ] Do \`useEffect\` animations contain strict cleanup functions?
- [ ] Are empty, loading, and error states provided?
- [ ] Are cards omitted in favor of spacing where possible?
- [ ] Did you strictly isolate CPU-heavy perpetual animations in their own Client Components?
`,
  },
  {
    path: "skills/theme-factory/references.md",
    content: `# Theme Definitions

Complete specifications for all 10 available themes.

---

## Ocean Depths

A professional and calming maritime theme that evokes the serenity of deep ocean waters.

### Color Palette

- **Deep Navy**: \`#1a2332\` - Primary background color
- **Teal**: \`#2d8b8b\` - Accent color for highlights and emphasis
- **Seafoam**: \`#a8dadc\` - Secondary accent for lighter elements
- **Cream**: \`#f1faee\` - Text and light backgrounds

### Typography

- **Headers**: DejaVu Sans Bold
- **Body Text**: DejaVu Sans

### Best Used For

Corporate presentations, financial reports, professional consulting decks, trust-building content.

---

## Sunset Boulevard

A warm and vibrant theme inspired by golden hour sunsets, perfect for energetic and creative presentations.

### Color Palette

- **Burnt Orange**: \`#e76f51\` - Primary accent color
- **Coral**: \`#f4a261\` - Secondary warm accent
- **Warm Sand**: \`#e9c46a\` - Highlighting and backgrounds
- **Deep Purple**: \`#264653\` - Dark contrast and text

### Typography

- **Headers**: DejaVu Serif Bold
- **Body Text**: DejaVu Sans

### Best Used For

Creative pitches, marketing presentations, lifestyle brands, event promotions, inspirational content.

---

## Forest Canopy

A natural and grounded theme featuring earth tones inspired by dense forest environments.

### Color Palette

- **Forest Green**: \`#2d4a2b\` - Primary dark green
- **Sage**: \`#7d8471\` - Muted green accent
- **Olive**: \`#a4ac86\` - Light accent color
- **Ivory**: \`#faf9f6\` - Backgrounds and text

### Typography

- **Headers**: FreeSerif Bold
- **Body Text**: FreeSans

### Best Used For

Environmental presentations, sustainability reports, outdoor brands, wellness content, organic products.

---

## Modern Minimalist

A clean and contemporary theme with a sophisticated grayscale palette for maximum versatility.

### Color Palette

- **Charcoal**: \`#36454f\` - Primary dark color
- **Slate Gray**: \`#708090\` - Medium gray for accents
- **Light Gray**: \`#d3d3d3\` - Backgrounds and dividers
- **White**: \`#ffffff\` - Text and clean backgrounds

### Typography

- **Headers**: DejaVu Sans Bold
- **Body Text**: DejaVu Sans

### Best Used For

Tech presentations, architecture portfolios, design showcases, modern business proposals, data visualization.

---

## Golden Hour

A rich and warm autumnal palette that creates an inviting and sophisticated atmosphere.

### Color Palette

- **Mustard Yellow**: \`#f4a900\` - Bold primary accent
- **Terracotta**: \`#c1666b\` - Warm secondary color
- **Warm Beige**: \`#d4b896\` - Neutral backgrounds
- **Chocolate Brown**: \`#4a403a\` - Dark text and anchors

### Typography

- **Headers**: FreeSans Bold
- **Body Text**: FreeSans

### Best Used For

Restaurant presentations, hospitality brands, fall campaigns, cozy lifestyle content, artisan products.

---

## Arctic Frost

A cool and crisp winter-inspired theme that conveys clarity, precision, and professionalism.

### Color Palette

- **Ice Blue**: \`#d4e4f7\` - Light backgrounds and highlights
- **Steel Blue**: \`#4a6fa5\` - Primary accent color
- **Silver**: \`#c0c0c0\` - Metallic accent elements
- **Crisp White**: \`#fafafa\` - Clean backgrounds and text

### Typography

- **Headers**: DejaVu Sans Bold
- **Body Text**: DejaVu Sans

### Best Used For

Healthcare presentations, technology solutions, winter sports, clean tech, pharmaceutical content.

---

## Desert Rose

A soft and sophisticated theme with dusty, muted tones perfect for elegant presentations.

### Color Palette

- **Dusty Rose**: \`#d4a5a5\` - Soft primary color
- **Clay**: \`#b87d6d\` - Earthy accent
- **Sand**: \`#e8d5c4\` - Warm neutral backgrounds
- **Deep Burgundy**: \`#5d2e46\` - Rich dark contrast

### Typography

- **Headers**: FreeSans Bold
- **Body Text**: FreeSans

### Best Used For

Fashion presentations, beauty brands, wedding planning, interior design, boutique businesses.

---

## Tech Innovation

A bold and modern theme with high-contrast colors perfect for cutting-edge technology presentations.

### Color Palette

- **Electric Blue**: \`#0066ff\` - Vibrant primary accent
- **Neon Cyan**: \`#00ffff\` - Bright highlight color
- **Dark Gray**: \`#1e1e1e\` - Deep backgrounds
- **White**: \`#ffffff\` - Clean text and contrast

### Typography

- **Headers**: DejaVu Sans Bold
- **Body Text**: DejaVu Sans

### Best Used For

Tech startups, software launches, innovation showcases, AI/ML presentations, digital transformation content.

---

## Botanical Garden

A fresh and organic theme featuring vibrant garden-inspired colors for lively presentations.

### Color Palette

- **Fern Green**: \`#4a7c59\` - Rich natural green
- **Marigold**: \`#f9a620\` - Bright floral accent
- **Terracotta**: \`#b7472a\` - Earthy warm tone
- **Cream**: \`#f5f3ed\` - Soft neutral backgrounds

### Typography

- **Headers**: DejaVu Serif Bold
- **Body Text**: DejaVu Sans

### Best Used For

Garden centers, food presentations, farm-to-table content, botanical brands, natural products.

---

## Midnight Galaxy

A dramatic and cosmic theme with deep purples and mystical tones for impactful presentations.

### Color Palette

- **Deep Purple**: \`#2b1e3e\` - Rich dark base
- **Cosmic Blue**: \`#4a4e8f\` - Mystical mid-tone
- **Lavender**: \`#a490c2\` - Soft accent color
- **Silver**: \`#e6e6fa\` - Light highlights and text

### Typography

- **Headers**: FreeSans Bold
- **Body Text**: FreeSans

### Best Used For

Entertainment industry, gaming presentations, nightlife venues, luxury brands, creative agencies.
`,
  },
  {
    path: "skills/theme-factory/skill.md",
    content: `---
name: theme-factory
description: "Apply visual themes (colors, fonts) to artifacts — slides, docs, HTML pages. 10 presets + custom generation."
tags:
  - design
  - themes
  - styling
  - presentations
  - artifacts
---

# Theme Factory Skill

This skill provides a curated collection of professional font and color themes themes, each with carefully selected color palettes and font pairings. Once a theme is chosen, it can be applied to any artifact.

## Purpose

To apply consistent, professional styling to presentation slide decks, use this skill. Each theme includes:
- A cohesive color palette with hex codes
- Complementary font pairings for headers and body text
- A distinct visual identity suitable for different contexts and audiences

## Usage Instructions

To apply styling to a slide deck or other artifact:

1. **Show the theme showcase**: Display the \`theme-showcase.pdf\` file to allow users to see all available themes visually. Do not make any modifications to it; simply show the file for viewing.
2. **Ask for their choice**: Ask which theme to apply to the deck
3. **Wait for selection**: Get explicit confirmation about the chosen theme
4. **Apply the theme**: Once a theme has been chosen, apply the selected theme's colors and fonts to the deck/artifact

## Themes Available

The following 10 themes are available, each showcased in \`theme-showcase.pdf\`:

1. **Ocean Depths** - Professional and calming maritime theme
2. **Sunset Boulevard** - Warm and vibrant sunset colors
3. **Forest Canopy** - Natural and grounded earth tones
4. **Modern Minimalist** - Clean and contemporary grayscale
5. **Golden Hour** - Rich and warm autumnal palette
6. **Arctic Frost** - Cool and crisp winter-inspired theme
7. **Desert Rose** - Soft and sophisticated dusty tones
8. **Tech Innovation** - Bold and modern tech aesthetic
9. **Botanical Garden** - Fresh and organic garden colors
10. **Midnight Galaxy** - Dramatic and cosmic deep tones

## Theme Details

Each theme is defined in the \`themes/\` directory with complete specifications including:
- Cohesive color palette with hex codes
- Complementary font pairings for headers and body text
- Distinct visual identity suitable for different contexts and audiences

## Application Process

After a preferred theme is selected:
1. Read the corresponding theme file from the \`themes/\` directory
2. Apply the specified colors and fonts consistently throughout the deck
3. Ensure proper contrast and readability
4. Maintain the theme's visual identity across all slides

## Create your Own Theme
To handle cases where none of the existing themes work for an artifact, create a custom theme. Based on provided inputs, generate a new theme similar to the ones above. Give the theme a similar name describing what the font/color combinations represent. Use any basic description provided to choose appropriate colors/fonts. After generating the theme, show it for review and verification. Following that, apply the theme as described above.
`,
  },
  {
    path: "skills/web-artifacts-builder/skill.md",
    content: `---
name: web-artifacts-builder
description: "Build complex multi-component HTML artifacts with React, Tailwind, and shadcn/ui for claude.ai."
tags:
  - frontend
  - react
  - web
  - artifacts
  - html
  - tailwind
  - shadcn
---

# Web Artifacts Builder

To build powerful frontend claude.ai artifacts, follow these steps:
1. Initialize the frontend repo using \`scripts/init-artifact.sh\`
2. Develop your artifact by editing the generated code
3. Bundle all code into a single HTML file using \`scripts/bundle-artifact.sh\`
4. Display artifact to user
5. (Optional) Test the artifact

**Stack**: React 18 + TypeScript + Vite + Parcel (bundling) + Tailwind CSS + shadcn/ui

## Design & Style Guidelines

VERY IMPORTANT: To avoid what is often referred to as "AI slop", avoid using excessive centered layouts, purple gradients, uniform rounded corners, and Inter font.

## Quick Start

### Step 1: Initialize Project

Run the initialization script to create a new React project:
\`\`\`bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
\`\`\`

This creates a fully configured project with:
- React + TypeScript (via Vite)
- Tailwind CSS 3.4.1 with shadcn/ui theming system
- Path aliases (\`@/\`) configured
- 40+ shadcn/ui components pre-installed
- All Radix UI dependencies included
- Parcel configured for bundling (via .parcelrc)
- Node 18+ compatibility (auto-detects and pins Vite version)

### Step 2: Develop Your Artifact

To build the artifact, edit the generated files. See **Common Development Tasks** below for guidance.

### Step 3: Bundle to Single HTML File

To bundle the React app into a single HTML artifact:
\`\`\`bash
bash scripts/bundle-artifact.sh
\`\`\`

This creates \`bundle.html\` - a self-contained artifact with all JavaScript, CSS, and dependencies inlined. This file can be directly shared in Claude conversations as an artifact.

**Requirements**: Your project must have an \`index.html\` in the root directory.

**What the script does**:
- Installs bundling dependencies (parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline)
- Creates \`.parcelrc\` config with path alias support
- Builds with Parcel (no source maps)
- Inlines all assets into single HTML using html-inline

### Step 4: Share Artifact with User

Finally, share the bundled HTML file in conversation with the user so they can view it as an artifact.

### Step 5: Testing/Visualizing the Artifact (Optional)

Note: This is a completely optional step. Only perform if necessary or requested.

To test/visualize the artifact, use available tools (including other Skills or built-in tools like Playwright or Puppeteer). In general, avoid testing the artifact upfront as it adds latency between the request and when the finished artifact can be seen. Test later, after presenting the artifact, if requested or if issues arise.

## Reference

- **shadcn/ui components**: https://ui.shadcn.com/docs/components
`,
  },
  {
    path: "skills/web-artifacts-builder/tools.md",
    content: `# Scripts

Shell scripts for initializing and bundling web artifact projects.

## scripts/init-artifact.sh

Initializes a new React + TypeScript project fully configured for building claude.ai HTML artifacts.

### Usage

\`\`\`bash
bash scripts/init-artifact.sh <project-name>
\`\`\`

### What It Does

1. **Detects Node version** - Requires Node 18+; pins Vite 5.4.11 for Node 18, uses latest for Node 20+
2. **Creates Vite project** - Scaffolds a React + TypeScript project via \`pnpm create vite\`
3. **Installs Tailwind CSS** - Sets up Tailwind CSS 3.4.1 with PostCSS and autoprefixer
4. **Configures shadcn/ui theming** - Creates \`tailwind.config.js\` with full shadcn/ui color system (CSS variables for background, foreground, primary, secondary, destructive, muted, accent, popover, card) and animation keyframes
5. **Sets up CSS variables** - Creates \`src/index.css\` with light and dark mode CSS variable definitions
6. **Configures path aliases** - Sets up \`@/\` alias in \`tsconfig.json\`, \`tsconfig.app.json\`, and \`vite.config.ts\`
7. **Installs Radix UI dependencies** - Installs 27 Radix UI primitive packages (accordion, dialog, dropdown-menu, tabs, tooltip, etc.)
8. **Installs utility packages** - sonner, cmdk, vaul, embla-carousel-react, react-day-picker, react-resizable-panels, date-fns, react-hook-form, zod
9. **Extracts shadcn/ui components** - Unpacks 40+ pre-built components from \`shadcn-components.tar.gz\` into \`src/\`
10. **Creates components.json** - Reference config for shadcn/ui CLI compatibility

### Included Components (40+)

accordion, alert, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label, menubar, navigation-menu, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip

### Import Examples

\`\`\`typescript
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
\`\`\`

---

## scripts/bundle-artifact.sh

Bundles a React application into a single self-contained HTML file suitable for use as a claude.ai artifact.

### Usage

\`\`\`bash
# Run from your project root directory
bash scripts/bundle-artifact.sh
\`\`\`

### Requirements

- Must be run from the project root (where \`package.json\` lives)
- Project must have an \`index.html\` in the root directory

### What It Does

1. **Installs bundling dependencies** - parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline
2. **Creates Parcel configuration** - \`.parcelrc\` with path alias support via parcel-resolver-tspaths
3. **Cleans previous builds** - Removes \`dist/\` and \`bundle.html\`
4. **Builds with Parcel** - Compiles the project with no source maps (\`pnpm exec parcel build index.html --dist-dir dist --no-source-maps\`)
5. **Inlines all assets** - Uses html-inline to merge all JS, CSS, and assets into a single \`bundle.html\`

### Output

Creates \`bundle.html\` in the project root - a self-contained HTML file with all JavaScript, CSS, and dependencies inlined. This file can be:
- Shared directly in Claude conversations as an artifact
- Opened in any browser for local testing
`,
  },
  {
    path: "skills/webapp-testing/examples.md",
    content: `# Examples

Common Playwright automation patterns for testing web applications.

## Element Discovery

Discovering buttons, links, and inputs on a page.

\`\`\`python
from playwright.sync_api import sync_playwright

# Example: Discovering buttons and other elements on a page

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to page and wait for it to fully load
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')

    # Discover all buttons on the page
    buttons = page.locator('button').all()
    print(f"Found {len(buttons)} buttons:")
    for i, button in enumerate(buttons):
        text = button.inner_text() if button.is_visible() else "[hidden]"
        print(f"  [{i}] {text}")

    # Discover links
    links = page.locator('a[href]').all()
    print(f"\\nFound {len(links)} links:")
    for link in links[:5]:  # Show first 5
        text = link.inner_text().strip()
        href = link.get_attribute('href')
        print(f"  - {text} -> {href}")

    # Discover input fields
    inputs = page.locator('input, textarea, select').all()
    print(f"\\nFound {len(inputs)} input fields:")
    for input_elem in inputs:
        name = input_elem.get_attribute('name') or input_elem.get_attribute('id') or "[unnamed]"
        input_type = input_elem.get_attribute('type') or 'text'
        print(f"  - {name} ({input_type})")

    # Take screenshot for visual reference
    page.screenshot(path='/tmp/page_discovery.png', full_page=True)
    print("\\nScreenshot saved to /tmp/page_discovery.png")

    browser.close()
\`\`\`

## Static HTML Automation

Using file:// URLs for local HTML files.

\`\`\`python
from playwright.sync_api import sync_playwright
import os

# Example: Automating interaction with static HTML files using file:// URLs

html_file_path = os.path.abspath('path/to/your/file.html')
file_url = f'file://{html_file_path}'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Navigate to local HTML file
    page.goto(file_url)

    # Take screenshot
    page.screenshot(path='/mnt/user-data/outputs/static_page.png', full_page=True)

    # Interact with elements
    page.click('text=Click Me')
    page.fill('#name', 'John Doe')
    page.fill('#email', 'john@example.com')

    # Submit form
    page.click('button[type="submit"]')
    page.wait_for_timeout(500)

    # Take final screenshot
    page.screenshot(path='/mnt/user-data/outputs/after_submit.png', full_page=True)

    browser.close()

print("Static HTML automation completed!")
\`\`\`

## Console Logging

Capturing console logs during browser automation.

\`\`\`python
from playwright.sync_api import sync_playwright

# Example: Capturing console logs during browser automation

url = 'http://localhost:5173'  # Replace with your URL

console_logs = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Set up console log capture
    def handle_console_message(msg):
        console_logs.append(f"[{msg.type}] {msg.text}")
        print(f"Console: [{msg.type}] {msg.text}")

    page.on("console", handle_console_message)

    # Navigate to page
    page.goto(url)
    page.wait_for_load_state('networkidle')

    # Interact with the page (triggers console logs)
    page.click('text=Dashboard')
    page.wait_for_timeout(1000)

    browser.close()

# Save console logs to file
with open('/mnt/user-data/outputs/console.log', 'w') as f:
    f.write('\\n'.join(console_logs))

print(f"\\nCaptured {len(console_logs)} console messages")
print(f"Logs saved to: /mnt/user-data/outputs/console.log")
\`\`\`
`,
  },
  {
    path: "skills/webapp-testing/skill.md",
    content: `---
name: webapp-testing
description: "Test local web apps with Playwright — verify UI, capture screenshots, debug browser behavior."
tags:
  - testing
  - playwright
  - web
  - automation
  - browser
---

# Web Application Testing

To test local web applications, write native Python Playwright scripts.

**Helper Scripts Available**:
- \`scripts/with_server.py\` - Manages server lifecycle (supports multiple servers)

**Always run scripts with \`--help\` first** to see usage. DO NOT read the source until you try running the script first and find that a customized solution is abslutely necessary. These scripts can be very large and thus pollute your context window. They exist to be called directly as black-box scripts rather than ingested into your context window.

## Decision Tree: Choosing Your Approach

\`\`\`
User task → Is it static HTML?
    ├─ Yes → Read HTML file directly to identify selectors
    │         ├─ Success → Write Playwright script using selectors
    │         └─ Fails/Incomplete → Treat as dynamic (below)
    │
    └─ No (dynamic webapp) → Is the server already running?
        ├─ No → Run: python scripts/with_server.py --help
        │        Then use the helper + write simplified Playwright script
        │
        └─ Yes → Reconnaissance-then-action:
            1. Navigate and wait for networkidle
            2. Take screenshot or inspect DOM
            3. Identify selectors from rendered state
            4. Execute actions with discovered selectors
\`\`\`

## Example: Using with_server.py

To start a server, run \`--help\` first, then use the helper:

**Single server:**
\`\`\`bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
\`\`\`

**Multiple servers (e.g., backend + frontend):**
\`\`\`bash
python scripts/with_server.py \\
  --server "cd backend && python server.py" --port 3000 \\
  --server "cd frontend && npm run dev" --port 5173 \\
  -- python your_automation.py
\`\`\`

To create an automation script, include only Playwright logic (servers are managed automatically):
\`\`\`python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True) # Always launch chromium in headless mode
    page = browser.new_page()
    page.goto('http://localhost:5173') # Server already running and ready
    page.wait_for_load_state('networkidle') # CRITICAL: Wait for JS to execute
    # ... your automation logic
    browser.close()
\`\`\`

## Reconnaissance-Then-Action Pattern

1. **Inspect rendered DOM**:
   \`\`\`python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   page.locator('button').all()
   \`\`\`

2. **Identify selectors** from inspection results

3. **Execute actions** using discovered selectors

## Common Pitfall

**Don't** inspect the DOM before waiting for \`networkidle\` on dynamic apps
**Do** wait for \`page.wait_for_load_state('networkidle')\` before inspection

## Best Practices

- **Use bundled scripts as black boxes** - To accomplish a task, consider whether one of the scripts available in \`scripts/\` can help. These scripts handle common, complex workflows reliably without cluttering the context window. Use \`--help\` to see usage, then invoke directly.
- Use \`sync_playwright()\` for synchronous scripts
- Always close the browser when done
- Use descriptive selectors: \`text=\`, \`role=\`, CSS selectors, or IDs
- Add appropriate waits: \`page.wait_for_selector()\` or \`page.wait_for_timeout()\`

## Reference Files

- **examples/** - Examples showing common patterns:
  - \`element_discovery.py\` - Discovering buttons, links, and inputs on a page
  - \`static_html_automation.py\` - Using file:// URLs for local HTML
  - \`console_logging.py\` - Capturing console logs during automation
`,
  },
  {
    path: "skills/webapp-testing/tools.md",
    content: `# Scripts

## scripts/with_server.py

Start one or more servers, wait for them to be ready, run a command, then clean up.

### Usage

\`\`\`bash
# Single server
python scripts/with_server.py --server "npm run dev" --port 5173 -- python automation.py
python scripts/with_server.py --server "npm start" --port 3000 -- python test.py

# Multiple servers
python scripts/with_server.py \\
  --server "cd backend && python server.py" --port 3000 \\
  --server "cd frontend && npm run dev" --port 5173 \\
  -- python test.py
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`--server\` | Server command to run (can be repeated for multiple servers) |
| \`--port\` | Port for each server (must match \`--server\` count) |
| \`--timeout\` | Timeout in seconds per server (default: 30) |
| \`command\` | Command to run after all servers are ready (after \`--\` separator) |

### Behavior

1. Starts all servers as subprocesses (supports shell commands with \`cd\` and \`&&\`)
2. Polls each server's port until it accepts connections (or timeout)
3. Runs the specified command once all servers are ready
4. On completion or error, terminates all server processes (with 5s graceful timeout, then SIGKILL)

### Error Handling

- Exits with error if number of \`--server\` and \`--port\` arguments don't match
- Raises \`RuntimeError\` if a server fails to start within the timeout
- Always cleans up server processes in the \`finally\` block
- Exits with the return code of the executed command
`,
  },
  {
    path: "skills/wiki-ingest/skill.md",
    content: `---
name: wiki-ingest
description: "Ingest new sources into a scoped wiki. Two modes: inbox (destructive — summarize and archive) and watched (non-destructive — extract durable claims into topic pages on hash change). Ends by invoking wiki-refresh on touched pages."
tags:
  - wiki-keeper
  - knowledge
  - ingest
---

# wiki-ingest

You are running the **ingestion phase** of a scoped Wiki Keeper. Use this skill when the user or a heartbeat asks you to ingest, or when the prompt references new files in \`_sources/inbox/\` or changes in watched folders.

## Scope resolution

Your scope config is in the calling agent's \`config.md\` under the \`wiki_keeper:\` block. Read it **first**. Resolve every path in this skill relative to \`scope_root\`:

- \`inbox_path\` (default \`_sources/inbox\`)
- \`archive_path\` (default \`_sources/archive\`)
- \`failed_path\` (default \`_sources/failed\`)
- \`topics_root\` (default \`_topics\`)
- \`index_path\` (default \`index.md\`)
- \`log_path\` (default \`log.md\`)
- \`state_file\` (default \`.wiki-keeper-state.json\`)
- \`watched_folders\` — list, vault-relative
- \`exclude_patterns\` — glob list, vault-relative
- \`watched_since\` — optional ISO date (YYYY-MM-DD). In watched mode, skip any file whose mtime is strictly older. Missing or empty = no cutoff.
- \`max_tokens_per_ingest\` — hard cap on this run
- \`max_tokens_per_refresh\` (default 30000) — separate budget for the end-of-run refresh phase
- \`index_split_threshold\` (default 100) — when total topic pages exceeds this, split index into per-type sub-MOCs

(Lint runs on its own schedule via a sibling \`*-lint\` task — do NOT run wiki-lint as part of this skill.)

**Never write outside \`scope_root\`.** If scope_root is empty, treat the whole vault as the scope.

## Touched-pages ledger

Maintain an in-memory list \`touched_pages: Set<string>\` for this run. Every time you create or append to a topic page (in either mode), record its path. The end-of-run **Refresh phase** consumes this list.

## State file shape

The state file lives at \`<scope_root>/<state_file>\` and tracks both watched-mode mtimes and content hashes plus inbox-mode failure counts:

\`\`\`json
{
  "mtimes": { "<vault-relative path>": "<ISO8601>" },
  "hashes": { "<vault-relative path>": "<sha1-hex>" },
  "lastIngest": "<ISO8601>",
  "failures": {
    "<inbox-relative filename>": { "count": 2, "lastError": "...", "lastAttempt": "<ISO8601>" }
  }
}
\`\`\`

If the file is missing, all maps are empty.

## Three phases — run in order

1. **Inbox mode** (destructive)
2. **Watched mode** (non-destructive, hash-gated)
3. **Refresh phase** (synthesis refresh on touched pages)

---

### Phase 1 — Inbox mode (destructive)

1. List every file under \`<scope_root>/<inbox_path>/\` excluding \`exclude_patterns\`.
2. For each file, in order:
   1. Check \`state.failures[<filename>]\`. If \`count >= 3\`, **quarantine** the file: \`mv\` it to \`<failed_path>/<filename>\` and write a sidecar \`<failed_path>/<filename>.error.md\` containing \`count\`, \`lastError\`, \`lastAttempt\`. Skip processing. Continue.
   2. Read the content. For PDFs use the \`pdf\` skill; for docx/xlsx use those skills. **Verify** these skills are attached to the agent before invoking — if missing, treat as a failure (see step 7) with error "missing skill: pdf".
   3. Identify the **subjects** the file covers (entities, concepts, events).
   4. Pick a **source-type tag** for bullets emitted from this file: \`[email]\` (\`.eml\`/\`.msg\`), \`[doc]\` (\`.pdf\`/\`.docx\`/\`.xlsx\`), \`[note]\` (\`.md\`), \`[web]\` (clipped HTML or URL drop), \`[other]\` otherwise. The tag rides on every dated bullet you append (see the bullet format below).
   5. For each subject, grep \`<scope_root>/<topics_root>/\` for an existing page. If missing, **create** \`<topics_root>/<slug>.md\` with:
      - Frontmatter: \`type:\` (entity / concept / event), plus \`summary_refreshed: ""\`, \`claims_at_refresh: 0\`, plus type-specific fields per \`CONTEXT.md\`.
      - A fenced summary block right after frontmatter:
        \`\`\`
        <!-- wiki-keeper:summary:begin -->
        <!-- wiki-keeper:summary:end -->
        \`\`\`
      - A \`## Claims\` section header.
      - Record the page in \`touched_pages\`.
   6. Write a **summary page** at \`<topics_root>/summaries/YYYY-MM-DD-<source-slug>.md\` with frontmatter \`{ type: summary, source: <original filename>, date: <today> }\` and a concise summary of the source. This is *not* a refreshable topic page — it has no fenced summary block.
   7. For each subject, append a dated sub-entry to that topic page's \`## Claims\` section:
      \`\`\`
      - YYYY-MM-DD [doc]: from [[summaries/YYYY-MM-DD-<source-slug>]]: <one-sentence claim>
      \`\`\`
      The \`[doc]\` (or other) tag is the source-type. Add the page to \`touched_pages\` if not already present.
   8. Update \`<index_path>\` inside the fenced \`<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->\` block — see **Index maintenance** below for handling growing indexes.
   9. **Move** (not copy) the source from \`<inbox_path>/\` to \`<archive_path>/YYYY/MM/<original filename>\`. Use Bash \`mv\`, not Write. First run \`mkdir -p <archive_path>/YYYY/MM/\`, then \`mv <inbox_path>/<file> <archive_path>/YYYY/MM/<file>\`. Both \`YYYY\` and \`MM\` are zero-padded.
   10. On success: clear \`state.failures[<filename>]\`.
3. **On per-file failure** (any step throws or returns an error): increment \`state.failures[<filename>].count\`, set \`lastError\` to the error message and \`lastAttempt\` to now ISO. Leave the source in the inbox. Do NOT abort the whole run; continue with the next file. The 3-strikes rule in step 2.1 quarantines persistently failing sources.
4. Append a log entry to \`<log_path>\` (fenced):
   \`\`\`
   - YYYY-MM-DD HH:MM inbox: processed N files; created [[x]], [[y]]; updated [[a]], [[b]]; quarantined K
   \`\`\`

### Phase 2 — Watched mode (non-destructive, hash-gated)

1. Load the state file (see shape above).
2. For each path in \`watched_folders\` (resolved relative to vault root, not scope_root — watched folders may sit anywhere):
   1. List every file in the folder, recursively, excluding \`exclude_patterns\`.
   2. For each file, read its mtime. Apply the \`watched_since\` filter (skip strictly older).
   3. **Hash gate.** Compute \`sha1\` of the normalized content (strip trailing whitespace per line, normalize line endings to \`\\n\`). If \`state.hashes[<path>] == new_hash\`, skip — file content is unchanged even if mtime moved (handles iCloud/Obsidian Sync touch-without-edit). If different or missing, queue for processing.
3. For each file to process:
   1. Read it.
   2. Pick the source-type tag for the file's folder (e.g. \`meetings/\` → \`[meeting]\`; \`daily-notes/\` → \`[note]\`; transcripts → \`[meeting]\`; otherwise \`[note]\`).
   3. Identify every **distinct subject** the file touches — each person, org, product, project, concept, meeting, decision, or event mentioned is its own subject. A single daily note or meeting transcript typically yields 3–10 subjects, not one.
   4. For **each subject**, locate or create its own topic page under \`<topics_root>/\` (per \`CONTEXT.md\`). New pages get the same scaffolding as inbox-mode (frontmatter + fenced summary block + \`## Claims\` section). Add to \`touched_pages\`.
   5. Extract ONLY **durable claims** about each subject — decisions, commitments, key facts, entity relationships, concept definitions. Skip small talk, noise, procedural details, and anything not worth remembering in a week.
   6. **Idempotency check.** Before appending, grep the target page's \`## Claims\` section for an existing line \`- YYYY-MM-DD <tag>: from [[<source-path>...\` matching today's date AND this source path. If present and the claim text is substantively the same, **skip** — don't append a duplicate. (This is the dedup safety net for re-runs after a hash false-positive or partial failure.)
   7. Append each claim as a dated sub-entry **to the topic page of the subject it's about**, with the source-type tag and forward wikilink back to the source:
      \`\`\`
      - YYYY-MM-DD [meeting]: from [[meetings/2026-04-18-vendor-sync|vendor-sync]]: Vendor X raised prices 15%
      \`\`\`
   8. **Do NOT** create a summary page for this file.
   9. **Do NOT** open the source file for write. Only read.
4. Update \`state.mtimes[<path>]\` and \`state.hashes[<path>]\` for every successfully processed file. Update \`state.lastIngest\`.
5. Append one consolidated log entry: \`- YYYY-MM-DD HH:MM watched: processed N files across M folders; updated [[x]], [[y]]\`.

#### Anti-patterns for watched mode

- ❌ **One dump page per source.** Topic pages are organized by *subject*, not by *source*. A Monday standup mentioning Alice, Project X, and a pricing decision produces entries on **three different pages**, each linking back to the standup note.
- ❌ **One catch-all concept page.** Concept pages are for specific ideas/techniques/patterns, not for "things from yesterday's meeting."
- ❌ **Rewriting the source.** Watched files are read-only; never modify, move, or delete them.
- ❌ **Creating a summary page** (\`type: summary\`). Those are inbox-mode only.

### Phase 3 — Refresh phase (synthesis)

After both ingest phases finish, **invoke the \`wiki-refresh\` skill** with the \`touched_pages\` set as input.

- Refresh threshold from \`wiki-refresh\` applies (≥5 new claims, or 30-day stale, or new contradictions). Caller-supplied list bypasses the staleness check but still respects the per-page delta.
- Refresh has its **own** token budget (\`max_tokens_per_refresh\`). It does not share the ingest budget.
- If \`wiki-refresh\` is not attached to this agent, log a warning and skip — don't fail the ingest run.

The refresh phase is what keeps every cited topic page query-cheap. Do not skip it routinely.

---

## Index maintenance

The default \`index.md\` carries a single fenced block listing every topic page alphabetically. As the wiki grows this becomes unwieldy.

**Sub-MOC split.** When the count of pages directly under \`<topics_root>/\` exceeds \`index_split_threshold\` (default 100), or when any single \`type:\` exceeds 30 pages, switch to a hub-of-hubs layout:

- \`index.md\` becomes a thin top-level hub with one section per page-type, each pointing at a sub-MOC: \`[[index/entities]]\`, \`[[index/concepts]]\`, \`[[index/events]]\`.
- Per-type indexes live at \`<topics_root>/index/<type>.md\` (or, if \`topics_root != "_topics"\`, at \`<scope_root>/index/<type>.md\`). Each is its own fenced-block MOC listing pages of that type.
- Once split, every new topic page goes into the matching sub-MOC, not the root index.

Detect the split state by checking for \`<scope_root>/index/\` existing. Once present, never write topic-page entries directly into the root \`index.md\`'s fenced block — only into the relevant sub-MOC.

---

## Rules that apply to all phases

- **Preserve user-authored content.** When updating a page, find the append zone (\`## Claims\`, \`## Contradictions\`, end of file). Never rewrite sections you didn't create.
- **Wikilinks only.** All internal links are \`[[path|Display]]\`.
- **Contradictions.** When a new claim contradicts an existing one on the same topic page, add it under \`## Contradictions\` with a dated entry. Do NOT silently overwrite. Flag in the log: \`- CONFLICT: [[topic]] — new source contradicts earlier claim\`.
- **Fenced writes.** \`<index_path>\` and \`<log_path>\` may contain user-authored content outside our fenced blocks. Only modify within \`<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->\`. If the file doesn't yet have those markers, create them and place all your content between them, preserving any pre-existing user content above and below.
- **Token budget.** \`max_tokens_per_ingest\` caps inbox + watched. If you approach the limit, stop processing new files, log what was skipped, and proceed to the Refresh phase (which has its own budget). The next cycle resumes.
- **Frontmatter conventions.** See \`CONTEXT.md\` for page types. Always include \`type:\` on new pages, plus the empty \`summary_refreshed\`/\`claims_at_refresh\` slots.

## Output

On success: short summary — counts per phase, main topic names, refresh count. The heartbeat broadcasts this if a channel is configured.

On failure: list what succeeded, what failed, what's quarantined, and log the failures.

## What NOT to do

- Never delete user-authored pages.
- Never modify a watched source file.
- Never move a watched source file.
- Never write outside \`scope_root\` (except *reading* watched folders).
- Never summarize training-data knowledge — stick to actual sources.
- Never create per-day summary pages for watched-source daily notes — that floods the wiki. Use topic-page updates only.
- Never write the \`## Summary\` block by hand — that's \`wiki-refresh\`'s job. Leave the fenced block empty on new pages; refresh fills it.
`,
  },
  {
    path: "skills/wiki-lint/skill.md",
    content: `---
name: wiki-lint
description: "Weekly health check for a scoped wiki. Finds orphans, stale pages, missing cross-links (bidirectional), contradictions, schema violations, index drift, dedup candidates, and stale summaries. Proposes fixes; auto-applies only deterministic ones; can chain wiki-refresh for stale summaries."
tags:
  - wiki-keeper
  - knowledge
  - lint
---

# wiki-lint

You are running the **weekly lint pass** on a scoped wiki. Your job is to find problems, propose fixes, and auto-apply ONLY deterministic ones. Judgment calls go in a "Needs review" list for the user.

## Scope resolution

Read \`wiki_keeper:\` from the calling agent's \`config.md\`:
- \`scope_root\`
- \`topics_root\`, \`index_path\`, \`log_path\`
- \`state_file\`, \`failed_path\`
- \`watched_folders\`
- \`dedup_similarity_threshold\` (default 0.82) — Levenshtein-similarity ratio above which two page titles get flagged as a possible merge.
- \`summary_stale_days\` (default 30) — pages whose \`summary_refreshed\` is older than this with claims since are stale.

All paths resolve relative to \`scope_root\` unless otherwise noted.

## Checks to run

### 1. Orphan topic pages
For each page under \`<scope_root>/<topics_root>/\`, check its inbound backlink count via Grep. Flag pages with zero inbound links.

**Exempt:** \`<topics_root>/syntheses/\` pages whose frontmatter is \`type: synthesis\` AND that have at least one outbound forward-link to a topic page they cite. Syntheses earn their place by linking out, not in. (If a synthesis has zero outbound links AND zero inbound links, flag it — it's truly an orphan.)

### 2. Missing forward-links from summaries
For each page under \`<topics_root>/summaries/\`, read its content. Case-insensitively match against slugs of existing topic pages. If the summary mentions a topic without a \`[[wikilink]]\` to it, flag — suggest adding the link.

### 3. Bidirectional cross-link gaps (NEW)
Build the wikilink graph: parse every \`[[link]]\` in every topic page (excluding the \`## Claims\` history — claim-source links are unidirectional by design, watched-source files don't link back). For each edge \`A → B\` in topic-summary-or-prose space, check whether \`B → A\` exists somewhere on \`B\` (summary, prose, or \`## Claims\`). When asymmetric:

- If \`A\` is referenced in \`B\`'s \`## Claims\` already — it counts as bidirectional, no flag.
- Otherwise, propose adding a forward-link from \`B\` to \`A\` in \`B\`'s summary block — but **don't auto-apply**: the summary block is \`wiki-refresh\`'s territory, not ours. Add to \`Needs review\` with the proposed wording, OR mark for \`wiki-refresh\` to consider on its next pass.

### 4. Contradictions >30 days old
Grep for \`## Contradictions\` sections across \`<topics_root>/\`. Within each, find dated entries older than 30 days. Flag for user review.

### 5. Stale events
For each page with frontmatter \`type: event\` and \`date: YYYY-MM-DD\`, compute age. If >12 months AND no other page links forward to it in the last 90 days, flag as stale. Don't auto-archive — just flag.

### 6. Index drift
Compare \`<index_path>\` content (within our fenced block) — and any sub-MOCs under \`<scope_root>/index/<type>.md\` if the split layout is in use — to the actual list of pages under \`<topics_root>/\`. Flag:
- Pages in the topics root but missing from index (suggest adding)
- Index entries whose target file no longer exists (suggest removing)
- Index split threshold reached but no split performed (suggest running \`wiki-ingest\` to trigger the split, or split manually).

### 7. Schema violations
For each page under \`<topics_root>/\`, verify required frontmatter per \`CONTEXT.md\`:
- \`type:\` field present (entity | concept | event | summary | synthesis)
- \`type: event\` pages must have \`date:\`
- \`type: summary\` pages must have \`source:\`
- Topic pages of types entity/concept/event SHOULD have \`summary_refreshed\` and \`claims_at_refresh\` slots (deterministic auto-fix: add empty values).

**Auto-apply:** add missing \`type:\` when the path makes it deterministic (\`<topics_root>/summaries/X.md\` → \`type: summary\`; \`<topics_root>/syntheses/X.md\` → \`type: synthesis\`); add empty \`summary_refreshed: ""\` and \`claims_at_refresh: 0\` slots when missing on entity/concept/event pages. Everything else is "Needs review".

### 8. Watched-source drift
Read \`<state_file>\`. For each entry whose source file no longer exists (user deleted or renamed it), find topic-page entries that forward-link back to that dead source path. Flag — suggest updating the entry. **Auto-apply:** strip the dead entry from \`state.mtimes\` and \`state.hashes\` so the source isn't tracked further.

### 9. Stale summaries (NEW)
For each topic page with \`summary_refreshed:\` set, compute age in days. Flag pages where:
- \`summary_refreshed\` is older than \`summary_stale_days\` AND \`claim_count_now > claims_at_refresh\` (claims accrued since last refresh), OR
- \`summary_refreshed\` is missing AND the page has ≥1 claim.

If \`wiki-refresh\` is attached to this agent, **chain it** at the end of the lint run with the stale-page list (subject to \`max_tokens_per_refresh\`). Otherwise log the list under \`Needs review\` for the user to trigger manually.

### 10. Dedup candidates (NEW)
For each pair of topic pages of the same \`type:\` whose slug similarity exceeds \`dedup_similarity_threshold\` (Levenshtein-ratio over normalized slugs), AND whose claim sources overlap by ≥1 source path, propose a merge.

**Never auto-merge.** Always \`Needs review\`. Output the proposal in the form:
- *"Possible merge: [[vendor-x]] and [[vendor-X]] (similarity 0.94, 3 shared sources). Suggested canonical: \`vendor-x\` (older). Manual merge needed — keep one, delete the other, redirect inbound links."*

### 11. Failed-source review (NEW)
List anything in \`<failed_path>/\` (the inbox quarantine). For each, surface filename, attempt count, and last error. Flag for user review — broken sources are a quality signal worth seeing weekly.

## Reporting

Write ONE dated report to \`<log_path>\` under a \`## Lint YYYY-MM-DD\` heading (inside the fenced \`<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->\` block):

\`\`\`markdown
## Lint 2026-04-26

### Summary
- Orphans: 2 (1 exempt synthesis)
- Missing forward-links from summaries: 1
- Bidirectional gaps: 4
- Old contradictions: 0
- Stale events: 3
- Index drift: 1 addition / 0 removals (split threshold NOT reached)
- Schema violations: 4 (3 auto-fixed)
- Watched-source drift: 1 (auto-stripped from state)
- Stale summaries: 7 (refresh chained: 5 covered, 2 deferred for budget)
- Dedup candidates: 2
- Failed sources in quarantine: 1

### Auto-applied
- Added \`type: summary\` to [[_topics/summaries/2026-04-10-vendor-brief]]
- Added \`summary_refreshed: ""\` slot to [[_topics/vendor-x]]
- Stripped dead path \`meetings/2026-02-08-old-sync.md\` from state file

### Needs review
- Orphan: [[_topics/old-proposal]] has no inbound links. Consider linking from [[index]] or archiving.
- Bidirectional: [[vendor-x]] mentions [[procurement]] in summary, but [[procurement]] has no link back. Propose adding to procurement's summary.
- Stale event: [[_topics/events/q3-kickoff]] (date: 2025-09-10) with no recent references. Archive?
- Contradiction in [[_topics/vendor-x]] from 2026-03-12 still unresolved (45 days old).
- Possible merge: [[vendor-x]] and [[vendor-X]] (similarity 0.94, 3 shared sources). Suggested canonical: \`vendor-x\`.
- Failed source: \`bad-pdf.pdf\` (3 attempts, last error: "missing skill: pdf"). Attach the \`pdf\` skill or remove the file.

### Refresh chained
- Refreshed: [[vendor-x]], [[pricing-q3]], [[alice]], [[project-acme]], [[vendor-y]]
- Deferred (budget): [[concept-event-sourcing]], [[meeting-cadence]]
\`\`\`

## Rules

- **Only auto-apply deterministic fixes.** Adding missing \`type:\` inferable from path = deterministic. Merging two topic pages = judgment call → "Needs review" only.
- **Never delete user content.** Flagging an orphan is fine; deleting the orphan is not.
- **Never auto-rename pages.** That breaks every inbound link.
- **Never modify watched source files.**
- **Never modify summary blocks.** That's \`wiki-refresh\`'s territory.
- **One lint report per run.** If called twice in the same day, the second run replaces the day's report.

## Optional broadcast

If the agent's heartbeat channel is set, output a short one-paragraph summary of the lint findings suitable for Slack/Telegram. Include a link to the full report in the log.

## What NOT to do

- Never restructure the topic taxonomy as a lint action.
- Never silently fix something that required judgment — log it.
- Never suggest fixes outside \`scope_root\`.
- Never auto-merge dedup candidates.
- Never overwrite \`## Summary\` blocks — that's \`wiki-refresh\`.
`,
  },
  {
    path: "skills/wiki-query/skill.md",
    content: `---
name: wiki-query
description: "Answer a question strictly from wiki content. Works in two modes: keeper (queries your own scope, enforces isolation, compounds substantive answers back into the wiki) and consumer (queries one or more referenced scopes via wiki_references). Every factual claim cites a vault page. Refuses to hallucinate."
tags:
  - wiki-keeper
  - knowledge
  - query
---

# wiki-query

You answer questions against the **current state of one or more wikis**. Your answer is grounded strictly in the wiki pages you have access to — never in training-data knowledge.

You operate in one of two modes, chosen by what's in your agent's \`config.md\`.

## Mode A — Keeper (your own scope)

Triggered when the agent has a \`wiki_keeper:\` block.

- Resolve paths relative to \`wiki_keeper.scope_root\`.
- Search \`<scope_root>/<topics_root>/\` only. Never cross into another scope.
- If the question seems to relate to a different scope, reply: *"This is outside the \`<scope_root>\` scope. Ask \`@wiki-keeper-<other-scope>\` for their take."*
- Respect \`file_substantive_answers\` (default \`true\`) and \`obsidian_url_scheme\`.

## Mode B — Consumer (reference one or more scopes)

Triggered when the agent has a \`wiki_references:\` block (typically without a \`wiki_keeper:\` block).

- The prompt-build layer has injected a \`## Wiki Access\` section listing every wiki you can read, with each one's scope root, topics path, index path, and inbox path. **That section is your source of truth.**
- When answering, **name which scope each citation belongs to** if more than one wiki is referenced.
- When the user shares a durable claim that isn't in any referenced wiki yet, **write a short markdown file to the relevant wiki's inbox** at \`<inbox>/YYYY-MM-DD-<slug>.md\`. The keeper files it canonically on its next ingest. Do NOT write to \`<topics-path>/\` directly.
- Never answer from training-data knowledge.

## Shared procedure (both modes)

1. Parse the question. Identify key entities, concepts, timeframes.
2. **Search** the topics path(s) using Grep with keyword variants. Weight results by inbound backlink count — central pages are more authoritative.
3. **Read** the top N candidate pages (default 5, cap 10 for broad questions). Prefer reading just the \`## Summary\` block first if present — it's the curated synthesis. Only fall back to \`## Claims\` history when the summary doesn't answer the question.
4. **Follow one hop** — for each candidate, check \`[[wikilinks]]\` in the summary and optionally read one linked page per candidate if clearly relevant.
5. **Synthesize** the answer. Every factual claim must be followed by a citation \`[[path|Display]]\`. Multiple citations per claim are welcome.
6. **Provenance line.** For each cited page, note its \`summary_refreshed\` (or file mtime if no summary). Add a one-line provenance footer at the end of your answer:
   > _Sources: [[vendor-x]] (refreshed 2026-04-25), [[pricing-q3]] (mtime 2026-03-12)_
   This is the user's signal that a cited page is stale.
7. If the wiki doesn't contain the answer, say so **explicitly**: *"I don't see this in the \`<scope>\` wiki. Last ingest was <lastIngest if available>. You may want to add relevant sources to \`<inbox>/\`."* Do NOT fabricate.
8. For external-channel replies (Slack/Telegram) when \`obsidian_url_scheme\` is on, convert \`[[topic-path|Display]]\` citations to \`obsidian://open?vault=<vault>&file=<full-path>\` URLs.

## Compounding — Mode A only (Keeper)

Karpathy's central claim: valuable answers should file themselves back into the wiki rather than disappear into chat. When \`file_substantive_answers: true\` (default) AND the synthesized answer is **substantive** (>500 tokens of unique synthesis, OR introduces a connection between topics that isn't yet in their pages, OR resolves an open contradiction), do BOTH:

1. **Synthesis page.** Write \`<topics_root>/syntheses/YYYY-MM-DD-<question-slug>.md\` with frontmatter \`{ type: synthesis, question: <q>, refreshed: <today> }\` and the answer body. Forward-link from this page to every cited topic. Forward-link from \`index.md\` (or the \`index/syntheses.md\` sub-MOC if split) so this synthesis isn't an orphan on next lint.
2. **Topic-page bullets.** For each cited topic page, append a dated bullet to its \`## Claims\` section:
   \`\`\`
   - YYYY-MM-DD [synthesis]: from [[syntheses/YYYY-MM-DD-<question-slug>|<short label>]]: <one-sentence takeaway specific to this topic>
   \`\`\`
   This is what makes the wiki compound from queries — every substantive Q&A leaves a per-topic trace, not just a sidecar synthesis.

After compounding writes, the next end-of-ingest refresh phase will pick up the touched topic pages naturally (their claim count delta crosses the threshold). No need to invoke \`wiki-refresh\` directly from this skill.

**Skip compounding** when:
- The answer is short (<500 tokens) and just restates an existing summary.
- The user prefixed the question with \`/quick\` or asked a yes/no.
- \`file_substantive_answers: false\`.

In Mode B (Consumer), compounding looks different: drop a markdown file into the relevant wiki's inbox per the consumer-mode rules. Do NOT write to \`<topics-path>/\` directly — that's the keeper's job.

## Rules

- **Wiki-grounded only.** If a claim isn't in any accessible wiki page, you don't know it.
- **Cite everything.** Un-cited claims are a bug.
- **Provenance footer.** Every answer ends with the sources line including refresh/mtime dates.
- **Name the scope** in consumer mode when citations come from more than one wiki.
- **Be concise.** Long prose with citations beats exhaustive prose. Group related claims under one citation rather than repeating it.
- **Compounding is in Keeper mode only.** Consumer mode files claims to the inbox; the keeper synthesizes.

## Output shape

1. **TL;DR** — one or two sentences that actually answer, with citations.
2. **Details** — bullets of specific claims, each cited.
3. **What the wiki is missing** (if relevant) — explicit note about gaps.
4. **Sources** (provenance footer) — \`[[page]] (refreshed YYYY-MM-DD)\` per citation, one line.
5. **Filed back** (Keeper compounding only, when triggered) — list the synthesis page path and the topic pages bulleted.
6. **Suggested inbox drop** (Consumer mode only, when the user shared new durable claims mid-answer) — list the file(s) you wrote to the inbox.

## What NOT to do

- Never answer from general knowledge.
- Never cite external URLs (only vault pages).
- Never rewrite topic page summary blocks (\`<!-- wiki-keeper:summary:* -->\`). Refresh owns those.
- Never modify \`## Claims\` history.
- In Keeper mode, only append to \`## Claims\` (compounding bullets) and only write under \`<topics_root>/syntheses/\`. Never edit other parts of topic pages.
- In Consumer mode, never write outside \`<inbox>/\`.
- Never cross-reference between scopes unless the user asked a cross-scope question — and even then, be explicit about which scope each page belongs to.
`,
  },
  {
    path: "skills/wiki-refresh/skill.md",
    content: `---
name: wiki-refresh
description: "Regenerate the \`## Summary\` block at the top of topic pages whose append-only claim list has outgrown the existing summary. Bounded by token budget; never touches user prose or claim history."
tags:
  - wiki-keeper
  - knowledge
  - refresh
---

# wiki-refresh

You are running the **synthesis refresh phase** of a scoped Wiki Keeper. Topic pages accrue dated bullets forever in \`## Claims\` (and sometimes \`## Contradictions\`); without a refresh, the top-of-page synthesis goes stale and every wiki-query read pays the full claim-history token cost. This skill rewrites a small, fenced summary block at the top of each candidate page so query reads stay cheap and the page actually summarizes what it knows.

## Scope resolution

Read \`wiki_keeper:\` from the calling agent's \`config.md\`:
- \`scope_root\`, \`topics_root\`, \`log_path\`
- \`max_tokens_per_refresh\` (default 30000) — hard cap on this run
- \`exclude_patterns\`

All paths resolve relative to \`scope_root\` unless otherwise noted. **Never write outside \`scope_root\`.**

## When to run

Three triggers, all valid:

1. **End-of-ingest (default).** \`wiki-ingest\` calls you with the list of pages it touched. Refresh only those that meet the threshold (see below).
2. **Manual.** User says "refresh \`[[topic]]\`", "refresh stale", or "refresh all". \`all\` ignores thresholds; \`stale\` uses them.
3. **Weekly via lint.** \`wiki-lint\` flags pages with stale summaries; the lint task can chain this skill.

## Refresh threshold

A page is a refresh **candidate** when ANY of:
- \`claim_count_now - frontmatter.claims_at_refresh ≥ 5\`
- \`summary_refreshed\` is missing or older than 30 days, AND the page has ≥1 claim
- \`## Contradictions\` section was added or extended since \`summary_refreshed\`
- The caller explicitly passed the page in (end-of-ingest mode skips the threshold for caller-supplied pages but still respects token budget)

Pages with zero claims and no user prose are **skipped** — there's nothing to summarize.

## The summary block convention

Every topic page has a fenced summary block immediately after frontmatter, before any user content or \`## Claims\`. Two HTML comments mark the bounds:

\`\`\`markdown
---
type: entity
name: Vendor X
summary_refreshed: 2026-04-26
claims_at_refresh: 14
---

<!-- wiki-keeper:summary:begin -->
## Summary

- Vendor X is the incumbent CRM provider for the Acme team since 2024.
- Pricing increased 15% in Q1 2026; renewal negotiation owned by [[procurement]].
- Reliability has been stable but support response degraded over Q4 2025
  (see [[_topics/contradictions/vendor-x-uptime]]).
- Active alternatives evaluated: [[vendor-y]], [[vendor-z]].
<!-- wiki-keeper:summary:end -->

## Claims

- 2026-04-18: from [[meetings/2026-04-18-vendor-sync|vendor-sync]]: Vendor X raised prices 15%
- 2026-04-12: from [[summaries/2026-04-12-renewal-brief|renewal-brief]]: contract auto-renews 2026-12-01
- ...
\`\`\`

You write **only** within the fenced block. The \`## Claims\` section, \`## Contradictions\` section, and any user-authored prose elsewhere on the page are **read-only** to you.

If a candidate page does not yet have the fenced block, create it: insert immediately after the closing \`---\` of frontmatter (or at top if no frontmatter), with one trailing blank line before the next section.

## Procedure

1. **Candidate list.**
   - If caller passed pages: use those (still apply token budget).
   - If "refresh all": every page under \`<topics_root>/\` (excluding \`exclude_patterns\` and \`<topics_root>/syntheses/\` — those are already syntheses).
   - If "refresh stale" or invoked from lint: scan all pages, keep only those meeting the threshold above.
2. **Order by churn.** Sort candidates by \`claim_count_now - claims_at_refresh\` descending so the most-changed pages refresh first under a tight token budget.
3. **For each candidate, until budget exhausted:**
   1. Read the full page.
   2. Parse: frontmatter, summary block (if present), \`## Claims\` bullets, \`## Contradictions\` bullets, any user prose outside our blocks.
   3. Synthesize a fresh summary:
      - **3–7 bullets**, each one sentence.
      - Cover: what this page is, the most durable facts, current status, key relationships (forward-link to other topics with \`[[…]]\`), unresolved contradictions if any.
      - Prefer the most recent claims when older claims have been superseded — if a 2026-04 claim contradicts a 2025-09 claim, the summary reflects 2026-04 unless \`## Contradictions\` flags a still-open dispute.
      - Cite supporting claims by date inline only when ambiguity helps (e.g., "as of 2026-04…"). Don't repeat the claim history.
      - Preserve user-authored prose elsewhere on the page; do NOT pull it into the summary unless it's clearly a fact about the entity. When in doubt, leave it where the user wrote it.
   4. Write back: replace the block contents (or insert a new fenced block at the correct position).
   5. Update frontmatter:
      - \`summary_refreshed: <today ISO>\`
      - \`claims_at_refresh: <current claim count>\`
      - Preserve all other frontmatter fields exactly.
   6. Track tokens spent on this page; if running close to budget, finish the current page cleanly then stop.
4. **Log.** Append one consolidated entry to \`<log_path>\` (inside the fenced \`<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->\` block):
   \`\`\`
   - YYYY-MM-DD HH:MM refresh: regenerated N summaries (covered: [[a]], [[b]], …); skipped M for budget
   \`\`\`

## Counting claims

A "claim" is one bullet under \`## Claims\` or \`## Contradictions\` matching the dated pattern \`- YYYY-MM-DD ...\`. Lines without a leading date prefix don't count (they're prose, not append-mode entries).

## Rules

- **Only the summary block is yours.** Never edit \`## Claims\`, \`## Contradictions\`, or user-authored sections.
- **No new claims.** This skill never invents facts not already present in the page's claim history or its forward-linked pages. If the claim history is sparse, the summary is sparse — that's fine.
- **No external knowledge.** No training-data facts. The summary is a *synthesis of what's on the page*, nothing else.
- **Idempotent.** Running refresh twice in a row on an unchanged page should produce the same summary (modulo trivial wording). Don't introduce churn for its own sake — if \`claims_at_refresh\` matches the current count and the existing summary is reasonable, skip and don't bump \`summary_refreshed\`.
- **Forward-links earn their place.** Any \`[[…]]\` in the summary must point to a page that actually exists in the scope. Verify before writing.
- **Wiki-keeper marker.** Pages refreshed by this skill carry the \`wiki-keeper\` tag (already set by ingest); don't re-add it.

## Token budget

- Hard cap: \`max_tokens_per_refresh\` from config (default 30000).
- When approaching the cap, finish the in-flight page, log how many candidates were skipped, and stop. The next ingest cycle will pick them up.
- Per-page soft cap: ~3000 tokens of read + write. Pages with a huge claim history (>200 claims) get a *capped read* of the most recent 100 claims plus the full \`## Contradictions\` section — older claims are assumed already reflected in the prior summary.

## Output

Short summary of the refresh pass: count refreshed, count skipped, list of pages touched. The heartbeat broadcasts this if a channel is configured.

## What NOT to do

- Never modify \`## Claims\` history.
- Never modify \`## Contradictions\` content.
- Never modify user-authored prose.
- Never change frontmatter fields other than \`summary_refreshed\` and \`claims_at_refresh\`.
- Never delete a topic page.
- Never reformat or restructure the page beyond writing your fenced block.
- Never run this on \`<topics_root>/syntheses/\` pages — those are already syntheses; double-summarizing them adds nothing.
- Never invoke this skill from a consumer agent. It's keeper-mode only; only the keeper that owns the scope refreshes it.
`,
  },
  {
    path: "skills/xlsx/skill.md",
    content: `---
name: xlsx
description: "Create, read, edit, and clean spreadsheet files (.xlsx, .csv, .tsv) — formulas, charts, formatting, data cleanup."
tags:
  - spreadsheet
  - excel
  - xlsx
  - data
  - finance
  - python
---

# Requirements for Outputs

## All Excel files

### Professional Font
- Use a consistent, professional font (e.g., Arial, Times New Roman) for all deliverables unless otherwise instructed by the user

### Zero Formula Errors
- Every Excel model MUST be delivered with ZERO formula errors (#REF!, #DIV/0!, #VALUE!, #N/A, #NAME?)

### Preserve Existing Templates (when updating templates)
- Study and EXACTLY match existing format, style, and conventions when modifying files
- Never impose standardized formatting on files with established patterns
- Existing template conventions ALWAYS override these guidelines

## Financial models

### Color Coding Standards
Unless otherwise stated by the user or existing template

#### Industry-Standard Color Conventions
- **Blue text (RGB: 0,0,255)**: Hardcoded inputs, and numbers users will change for scenarios
- **Black text (RGB: 0,0,0)**: ALL formulas and calculations
- **Green text (RGB: 0,128,0)**: Links pulling from other worksheets within same workbook
- **Red text (RGB: 255,0,0)**: External links to other files
- **Yellow background (RGB: 255,255,0)**: Key assumptions needing attention or cells that need to be updated

### Number Formatting Standards

#### Required Format Rules
- **Years**: Format as text strings (e.g., "2024" not "2,024")
- **Currency**: Use \$#,##0 format; ALWAYS specify units in headers ("Revenue (\$mm)")
- **Zeros**: Use number formatting to make all zeros "-", including percentages (e.g., "\$#,##0;(\$#,##0);-")
- **Percentages**: Default to 0.0% format (one decimal)
- **Multiples**: Format as 0.0x for valuation multiples (EV/EBITDA, P/E)
- **Negative numbers**: Use parentheses (123) not minus -123

### Formula Construction Rules

#### Assumptions Placement
- Place ALL assumptions (growth rates, margins, multiples, etc.) in separate assumption cells
- Use cell references instead of hardcoded values in formulas
- Example: Use =B5*(1+\$B\$6) instead of =B5*1.05

#### Formula Error Prevention
- Verify all cell references are correct
- Check for off-by-one errors in ranges
- Ensure consistent formulas across all projection periods
- Test with edge cases (zero values, negative numbers)
- Verify no unintended circular references

#### Documentation Requirements for Hardcodes
- Comment or in cells beside (if end of table). Format: "Source: [System/Document], [Date], [Specific Reference], [URL if applicable]"
- Examples:
  - "Source: Company 10-K, FY2024, Page 45, Revenue Note, [SEC EDGAR URL]"
  - "Source: Company 10-Q, Q2 2025, Exhibit 99.1, [SEC EDGAR URL]"
  - "Source: Bloomberg Terminal, 8/15/2025, AAPL US Equity"
  - "Source: FactSet, 8/20/2025, Consensus Estimates Screen"

# XLSX creation, editing, and analysis

## Overview

A user may ask you to create, edit, or analyze the contents of an .xlsx file. You have different tools and workflows available for different tasks.

## Important Requirements

**LibreOffice Required for Formula Recalculation**: You can assume LibreOffice is installed for recalculating formula values using the \`scripts/recalc.py\` script. The script automatically configures LibreOffice on first run, including in sandboxed environments where Unix sockets are restricted (handled by \`scripts/office/soffice.py\`)

## Reading and analyzing data

### Data analysis with pandas
For data analysis, visualization, and basic operations, use **pandas** which provides powerful data manipulation capabilities:

\`\`\`python
import pandas as pd

# Read Excel
df = pd.read_excel('file.xlsx')  # Default: first sheet
all_sheets = pd.read_excel('file.xlsx', sheet_name=None)  # All sheets as dict

# Analyze
df.head()      # Preview data
df.info()      # Column info
df.describe()  # Statistics

# Write Excel
df.to_excel('output.xlsx', index=False)
\`\`\`

## Excel File Workflows

## CRITICAL: Use Formulas, Not Hardcoded Values

**Always use Excel formulas instead of calculating values in Python and hardcoding them.** This ensures the spreadsheet remains dynamic and updateable.

### WRONG - Hardcoding Calculated Values
\`\`\`python
# Bad: Calculating in Python and hardcoding result
total = df['Sales'].sum()
sheet['B10'] = total  # Hardcodes 5000

# Bad: Computing growth rate in Python
growth = (df.iloc[-1]['Revenue'] - df.iloc[0]['Revenue']) / df.iloc[0]['Revenue']
sheet['C5'] = growth  # Hardcodes 0.15

# Bad: Python calculation for average
avg = sum(values) / len(values)
sheet['D20'] = avg  # Hardcodes 42.5
\`\`\`

### CORRECT - Using Excel Formulas
\`\`\`python
# Good: Let Excel calculate the sum
sheet['B10'] = '=SUM(B2:B9)'

# Good: Growth rate as Excel formula
sheet['C5'] = '=(C4-C2)/C2'

# Good: Average using Excel function
sheet['D20'] = '=AVERAGE(D2:D19)'
\`\`\`

This applies to ALL calculations - totals, percentages, ratios, differences, etc. The spreadsheet should be able to recalculate when source data changes.

## Common Workflow
1. **Choose tool**: pandas for data, openpyxl for formulas/formatting
2. **Create/Load**: Create new workbook or load existing file
3. **Modify**: Add/edit data, formulas, and formatting
4. **Save**: Write to file
5. **Recalculate formulas (MANDATORY IF USING FORMULAS)**: Use the scripts/recalc.py script
   \`\`\`bash
   python scripts/recalc.py output.xlsx
   \`\`\`
6. **Verify and fix any errors**:
   - The script returns JSON with error details
   - If \`status\` is \`errors_found\`, check \`error_summary\` for specific error types and locations
   - Fix the identified errors and recalculate again
   - Common errors to fix:
     - \`#REF!\`: Invalid cell references
     - \`#DIV/0!\`: Division by zero
     - \`#VALUE!\`: Wrong data type in formula
     - \`#NAME?\`: Unrecognized formula name

### Creating new Excel files

\`\`\`python
# Using openpyxl for formulas and formatting
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

wb = Workbook()
sheet = wb.active

# Add data
sheet['A1'] = 'Hello'
sheet['B1'] = 'World'
sheet.append(['Row', 'of', 'data'])

# Add formula
sheet['B2'] = '=SUM(A1:A10)'

# Formatting
sheet['A1'].font = Font(bold=True, color='FF0000')
sheet['A1'].fill = PatternFill('solid', start_color='FFFF00')
sheet['A1'].alignment = Alignment(horizontal='center')

# Column width
sheet.column_dimensions['A'].width = 20

wb.save('output.xlsx')
\`\`\`

### Editing existing Excel files

\`\`\`python
# Using openpyxl to preserve formulas and formatting
from openpyxl import load_workbook

# Load existing file
wb = load_workbook('existing.xlsx')
sheet = wb.active  # or wb['SheetName'] for specific sheet

# Working with multiple sheets
for sheet_name in wb.sheetnames:
    sheet = wb[sheet_name]
    print(f"Sheet: {sheet_name}")

# Modify cells
sheet['A1'] = 'New Value'
sheet.insert_rows(2)  # Insert row at position 2
sheet.delete_cols(3)  # Delete column 3

# Add new sheet
new_sheet = wb.create_sheet('NewSheet')
new_sheet['A1'] = 'Data'

wb.save('modified.xlsx')
\`\`\`

## Recalculating formulas

Excel files created or modified by openpyxl contain formulas as strings but not calculated values. Use the provided \`scripts/recalc.py\` script to recalculate formulas:

\`\`\`bash
python scripts/recalc.py <excel_file> [timeout_seconds]
\`\`\`

Example:
\`\`\`bash
python scripts/recalc.py output.xlsx 30
\`\`\`

The script:
- Automatically sets up LibreOffice macro on first run
- Recalculates all formulas in all sheets
- Scans ALL cells for Excel errors (#REF!, #DIV/0!, etc.)
- Returns JSON with detailed error locations and counts
- Works on both Linux and macOS

## Formula Verification Checklist

Quick checks to ensure formulas work correctly:

### Essential Verification
- [ ] **Test 2-3 sample references**: Verify they pull correct values before building full model
- [ ] **Column mapping**: Confirm Excel columns match (e.g., column 64 = BL, not BK)
- [ ] **Row offset**: Remember Excel rows are 1-indexed (DataFrame row 5 = Excel row 6)

### Common Pitfalls
- [ ] **NaN handling**: Check for null values with \`pd.notna()\`
- [ ] **Far-right columns**: FY data often in columns 50+
- [ ] **Multiple matches**: Search all occurrences, not just first
- [ ] **Division by zero**: Check denominators before using \`/\` in formulas (#DIV/0!)
- [ ] **Wrong references**: Verify all cell references point to intended cells (#REF!)
- [ ] **Cross-sheet references**: Use correct format (Sheet1!A1) for linking sheets

### Formula Testing Strategy
- [ ] **Start small**: Test formulas on 2-3 cells before applying broadly
- [ ] **Verify dependencies**: Check all cells referenced in formulas exist
- [ ] **Test edge cases**: Include zero, negative, and very large values

### Interpreting scripts/recalc.py Output
The script returns JSON with error details:
\`\`\`json
{
  "status": "success",           // or "errors_found"
  "total_errors": 0,              // Total error count
  "total_formulas": 42,           // Number of formulas in file
  "error_summary": {              // Only present if errors found
    "#REF!": {
      "count": 2,
      "locations": ["Sheet1!B5", "Sheet1!C10"]
    }
  }
}
\`\`\`

## Best Practices

### Library Selection
- **pandas**: Best for data analysis, bulk operations, and simple data export
- **openpyxl**: Best for complex formatting, formulas, and Excel-specific features

### Working with openpyxl
- Cell indices are 1-based (row=1, column=1 refers to cell A1)
- Use \`data_only=True\` to read calculated values: \`load_workbook('file.xlsx', data_only=True)\`
- **Warning**: If opened with \`data_only=True\` and saved, formulas are replaced with values and permanently lost
- For large files: Use \`read_only=True\` for reading or \`write_only=True\` for writing
- Formulas are preserved but not evaluated - use scripts/recalc.py to update values

### Working with pandas
- Specify data types to avoid inference issues: \`pd.read_excel('file.xlsx', dtype={'id': str})\`
- For large files, read specific columns: \`pd.read_excel('file.xlsx', usecols=['A', 'C', 'E'])\`
- Handle dates properly: \`pd.read_excel('file.xlsx', parse_dates=['date_column'])\`

## Code Style Guidelines
**IMPORTANT**: When generating Python code for Excel operations:
- Write minimal, concise Python code without unnecessary comments
- Avoid verbose variable names and redundant operations
- Avoid unnecessary print statements

**For Excel files themselves**:
- Add comments to cells with complex formulas or important assumptions
- Document data sources for hardcoded values
- Include notes for key calculations and model sections
`,
  },
  {
    path: "skills/xlsx/tools.md",
    content: `# Scripts

## scripts/recalc.py

Excel Formula Recalculation Script. Recalculates all formulas in an Excel file using LibreOffice.

### Usage

\`\`\`bash
python scripts/recalc.py <excel_file> [timeout_seconds]
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`excel_file\` | Path to the Excel file to recalculate |
| \`timeout_seconds\` | Optional timeout in seconds (default: 30) |

### What It Does

1. **Sets up LibreOffice macro** on first run (creates \`RecalculateAndSave\` macro in LibreOffice's Standard module)
2. **Runs LibreOffice headless** with the recalculation macro
3. **Scans all cells** for Excel errors (#VALUE!, #DIV/0!, #REF!, #NAME?, #NULL!, #NUM!, #N/A)
4. **Counts formulas** in the workbook
5. **Returns JSON** with detailed results

### Output Format

\`\`\`json
{
  "status": "success",
  "total_errors": 0,
  "total_formulas": 42,
  "error_summary": {}
}
\`\`\`

When errors are found:
\`\`\`json
{
  "status": "errors_found",
  "total_errors": 2,
  "total_formulas": 42,
  "error_summary": {
    "#REF!": {
      "count": 2,
      "locations": ["Sheet1!B5", "Sheet1!C10"]
    }
  }
}
\`\`\`

### Platform Support

- **Linux**: Uses \`timeout\` command for process timeout
- **macOS**: Uses \`gtimeout\` (from GNU coreutils) if available
- Handles sandboxed environments where AF_UNIX sockets are blocked (via \`soffice.py\` shim)

---

## scripts/office/soffice.py

Helper for running LibreOffice in environments where AF_UNIX sockets may be blocked (e.g., sandboxed VMs).

### Usage

\`\`\`python
from office.soffice import run_soffice, get_soffice_env

# Option 1 - run soffice directly
result = run_soffice(["--headless", "--convert-to", "pdf", "input.docx"])

# Option 2 - get env dict for your own subprocess calls
env = get_soffice_env()
subprocess.run(["soffice", ...], env=env)
\`\`\`

### What It Does

- Sets \`SAL_USE_VCLPLUGIN=svp\` for headless operation
- Detects if AF_UNIX sockets are blocked at runtime
- If blocked, compiles and applies an LD_PRELOAD C shim that intercepts socket/listen/accept/close calls
- The shim uses socketpair() as a fallback when socket(AF_UNIX) fails

---

## scripts/office/pack.py

Pack a directory into a DOCX, PPTX, or XLSX file. Validates with auto-repair, condenses XML formatting, and creates the Office file.

### Usage

\`\`\`bash
python scripts/office/pack.py <input_directory> <output_file> [--original <file>] [--validate true|false]
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`input_directory\` | Unpacked Office document directory |
| \`output_file\` | Output Office file (.docx/.pptx/.xlsx) |
| \`--original\` | Original file for validation comparison |
| \`--validate\` | Run validation with auto-repair (default: true) |

### What It Does

1. Runs schema and redlining validators (if original file provided)
2. Auto-repairs common issues
3. Condenses XML formatting (removes whitespace-only text nodes and comments)
4. Creates ZIP archive as the output Office file

---

## scripts/office/unpack.py

Unpack Office files (DOCX, PPTX, XLSX) for editing. Extracts the ZIP archive and pretty-prints XML files.

### Usage

\`\`\`bash
python scripts/office/unpack.py <office_file> <output_dir> [options]
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`office_file\` | Office file to unpack |
| \`output_directory\` | Output directory for extracted content |
| \`--merge-runs\` | Merge adjacent runs with identical formatting (DOCX only, default: true) |
| \`--simplify-redlines\` | Merge adjacent tracked changes from same author (DOCX only, default: true) |

### What It Does

1. Extracts ZIP archive contents
2. Pretty-prints all XML and .rels files
3. For DOCX: optionally simplifies tracked changes and merges adjacent runs
4. Escapes smart quotes for safe XML handling

---

## scripts/office/validate.py

Validate Office document XML files against XSD schemas and tracked changes.

### Usage

\`\`\`bash
python scripts/office/validate.py <path> [--original <original_file>] [--auto-repair] [--author NAME]
\`\`\`

### Arguments

| Argument | Description |
|----------|-------------|
| \`path\` | Path to unpacked directory or packed Office file (.docx/.pptx/.xlsx) |
| \`--original\` | Path to original file (if omitted, all XSD errors are reported and redlining validation is skipped) |
| \`--auto-repair\` | Automatically repair common issues (hex IDs, whitespace preservation) |
| \`--author\` | Author name for redlining validation (default: Claude) |
| \`-v, --verbose\` | Enable verbose output |

### Auto-repair Fixes

- \`paraId\`/\`durableId\` values that exceed OOXML limits
- Missing \`xml:space="preserve"\` on \`w:t\` elements with whitespace
`,
  },
];
