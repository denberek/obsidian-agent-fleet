# Agent Fleet Operations

All operations are performed by reading and writing files in the `_fleet/` directory.

## Folder Structure

```
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
```

## Creating an Agent

Create a folder in `_fleet/agents/<name>/` with these files:

### agent.md — Identity and System Prompt
```yaml
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
```

### config.md — Runtime Configuration
```yaml
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
```

### permissions.json — Claude Code Permission Rules
```json
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
```

Rules use Claude Code's native format:
- `deny` rules always take precedence
- `Bash(pattern *)` matches commands with wildcards
- `Read`, `Write`, `Edit`, `WebFetch`, `WebSearch` are tool names
- With `bypassPermissions` mode: everything runs EXCEPT deny list
- With `dontAsk` mode: only allow list runs, everything else blocked

Both adapters enforce these rules. `claude-code` applies them directly. `codex`
translates `Bash(cmd args *)` command patterns into execpolicy rules (deny →
forbidden, allow → allow) injected via a per-agent `CODEX_HOME` overlay. Codex
limitations: only command-prefix `Bash(...)` patterns translate — tool-name
rules (`Read`/`Write`/`Edit`) and mid-pattern wildcards are ignored, and file/
network access is governed by the sandbox level (`permission_mode`:
bypassPermissions / workspace-write / read-only) instead. Requires a Codex build
with execpolicy support; otherwise the agent falls back to sandbox-only.

### SKILLS.md — Agent-Specific Skills (optional)
```markdown
Additional instructions specific to this agent that aren't reusable as shared skills.
```

### CONTEXT.md — Project Context (optional)
```markdown
Background information, project conventions, repo structure docs.
```

### HEARTBEAT.md — Autonomous Periodic Run (optional)

A heartbeat gives the agent autonomous behavior — what it does when no one is asking. The heartbeat instruction is also used by the "Run Now" button.

```yaml
---
enabled: true
schedule: "0 */6 * * *"      # Cron expression — every 6 hours
notify: true                  # Show Obsidian notice on completion
channel: my-slack             # Post results to this channel (optional)
channel_target: ""            # Specific channel/conversation id within `channel` to post to
                              # (e.g. a Discord channel id). Empty = broadcast as a DM to the
                              # channel's first allowed user. Quote numeric ids to preserve precision.
---

Check the following endpoints for availability and response time:
- https://example.com (expect < 500ms)
- https://api.example.com/health (expect 200 OK)

Report status of each endpoint. If everything is healthy, respond with
a one-line "all clear". Use [REMEMBER] to track trends across heartbeats.
```

**Heartbeat fields:**
- `enabled` — whether the heartbeat is active
- `schedule` — cron expression (same format as tasks)
- `notify` — show Obsidian notice when heartbeat completes (default true)
- `channel` — name of a configured channel to post results to (optional)
- `channel_target` — specific channel/conversation id within `channel` to post to (optional;
  empty broadcasts a DM to the channel's first allowed user). Mirrors a task's `channel_target`.

## Creating a Channel

Channels connect agents to external chat platforms. Create a markdown file in `_fleet/channels/<name>.md`.

### Slack Channel
```yaml
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
```

Slack uses Socket Mode (outbound WebSocket) with the Assistants API for native "is thinking..." indicators and thread titles.

### Telegram Channel
```yaml
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
```

Telegram uses long-poll HTTPS (no WebSocket, no SDK). Features: typing indicators, inline keyboard agent picker via `/agents`, slash command autocomplete, group chat and forum topic support.

### Discord Channel
```yaml
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
  standard Markdown (NOT Slack mrkdwn): **bold**, *italic*, `code`, fenced
  blocks with a language tag. Discord does NOT render Markdown tables.
---
```

Discord uses the Gateway (outbound WebSocket) + REST. Features: `@agent-name` routing, the `/agents` slash picker, image attachments, allowlist on the authenticated sender, and reconnect/resume. Requires the **Message Content** privileged intent on the bot. See `DISCORD_SETUP.md`.

**Important notes:**
- `credential_ref` must match a credential name in Settings → Agent Fleet → Channel Credentials
- Credentials are stored securely in the OS keychain via Obsidian's SecretStorage API
- `allowed_users`: Slack user IDs (start with U), Telegram user IDs (numeric), or Discord user IDs (numeric)
- Agents with `approval_required` set cannot be bound to a channel
- Multi-agent routing: type `@agent-name: message` to switch agents, or use `/agents` for interactive picker
- Obsidian must be running for channels to work — when closed, bots go offline

## Creating a Task

Create a markdown file in `_fleet/tasks/<name>.md`:

```yaml
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
channel_target: ""            # Optional destination id within `channel`: a Discord/Slack
                              # channel id or Telegram chat id. Set = post directly to that
                              # channel; empty = DM the channel's first allowed user.
tags:
  - monitoring
---

Task prompt goes here. This is what the agent should do each run.
Be specific and clear about expected output.
```

**Channel delivery (`channel` + `channel_target`).** Any task can post its output to a
configured channel by setting `channel:` to a channel name. Previously only an agent's
heartbeat could post to a channel; now every scheduled/manual task can too. The output
is the task run's **full** output text, prefixed with `*<agent> — <task_id>*`.

Two delivery modes:
- **`channel_target` empty** → broadcast (a DM to the channel's first allowed user) —
  same path the heartbeat uses.
- **`channel_target` set** → post directly to that specific channel/conversation. The
  target is a transport-native id: a Discord/Slack channel id or a Telegram chat id.
  (Discord: enable Developer Mode → right-click the channel → Copy Channel ID. The bot
  must have permission to post there.)

Keep the task prompt's output concise/skimmable if it's going to chat. Heartbeats still
use `channel` in HEARTBEAT.md (broadcast only); tasks use `channel`/`channel_target` in
their own frontmatter.

### Task Types
- **recurring** — runs on a cron schedule. Requires `schedule` field.
- **once** — runs at a specific time. Requires `run_at` field (ISO datetime).
- **immediate** — runs once on creation, no schedule.

### Schedule Shortcuts
These human-friendly values work in the `schedule` field:
- `every 5m` → `*/5 * * * *`
- `every 15m` → `*/15 * * * *`
- `every 30m` → `*/30 * * * *`
- `hourly` → `0 * * * *`
- `daily at 9am` → `0 9 * * *`
- `weekdays at 9am` → `0 9 * * 1-5`
- `weekly on monday` → `0 9 * * 1`
- `monthly on 1st` → `0 9 1 * *`

## Creating a Skill

Create a folder in `_fleet/skills/<name>/` with these files:

### skill.md — Identity and Core Instructions
```yaml
---
name: my-skill                # Required, unique
description: What this skill provides
tags:
  - category
---

Core skill instructions go here.
```

### tools.md — Tool Documentation (optional)
### references.md — Background Docs (optional)
### examples.md — Few-Shot Examples (optional)

## MCP Servers

MCP (Model Context Protocol) servers give agents access to external tools and services. Servers are managed from the dashboard — add, remove, authenticate, and inspect servers without touching the terminal.

### Assigning MCP Servers to Agents

Add the `mcp_servers` field to the agent's `agent.md` frontmatter:

```yaml
---
name: my-agent
description: Agent with MCP access
mcp_servers:
  - todoist
  - linear
  - github
---
```

**MCP v2 — one registry, projected per run (since 0.13.0).** MCP servers live in a fleet-owned registry: one markdown file per server at `_fleet/mcp/<name>.md` (frontmatter; secrets never in the vault). Register a server **once** and it's available to **any** agent on **either** adapter — Claude Code or Codex. At spawn time, only the enabled servers an agent is granted are **projected** into whichever adapter it uses: Claude Code gets a merged `--mcp-config`, Codex gets `-c mcp_servers.*` overrides. Your native `~/.claude.json` and `~/.codex/config.toml` are **read-only** — Agent Fleet never mutates them. On first load, your existing Claude and Codex servers are imported into the registry (deduplicated, marked `imported`), and any bearer tokens found are moved into the keychain.

Per-agent grants: leave the agent's `mcp_servers` list empty to grant every enabled server, or list specific ones. The selection applies identically on both adapters.

### Server Types

- **stdio** — local process spawned by the CLI (e.g., `npx @some/mcp-server`)
- **HTTP / SSE** — remote server accessed via URL, often with OAuth authentication

### Authentication

HTTP/SSE servers authenticate **once** and the token is stored in the OS keychain, then projected per run (to Claude as an `Authorization` header, to Codex via `bearer_token_env_var` — passed through the spawn environment, never written to argv or a config file). Two options:

- **Static bearer token** — paste it on the server card.
- **OAuth 2.1 PKCE** — from the dashboard: click "Authenticate"; the plugin discovers OAuth endpoints automatically (RFC 8414 / RFC 9728), registers via Dynamic Client Registration, opens the browser for the PKCE flow, stores tokens in the keychain, and refreshes them in the background to keep agents authenticated.

## Modifying Agents, Tasks, Skills, or Channels

To modify any entity, read the file, change the frontmatter or body, and write it back. The plugin watches the `_fleet/` folder and picks up changes automatically.

## Enabling/Disabling

- Agents: `enabled` in agent.md frontmatter
- Tasks: `enabled` in task frontmatter
- Channels: `enabled` in channel frontmatter
- Heartbeats: `enabled` in HEARTBEAT.md frontmatter

## Deleting

Delete (or move to trash) the agent folder, task file, skill folder, or channel file. The plugin detects deletions and removes them from the runtime.

## Run Logs

Run logs are auto-generated in `_fleet/runs/YYYY-MM-DD/`. Each run creates a markdown file with:
- Frontmatter: run_id, agent, task, status, timestamps, tokens_used, cost_usd, model
- Body: prompt sent, output received, tools used, stderr
- Heartbeat runs are tagged with `heartbeat`

Status values: `success`, `failure`, `timeout`, `cancelled`, `pending_approval`

## Agent Memory

When `memory: true`, the agent has a two-tier memory store at `_fleet/memory/<agent-name>/`:

- `working.md` — curated, token-budgeted memory that is **injected into every run** (sections: `Preferences` (pinned), `Procedures`, `Observations`, `Recent`).
- `raw/<YYYY-MM-DD>.md` — append-only ground-truth log of everything captured (never injected).
- `candidates.json` — reflection's skill-pattern ledger; `pending/` — the capture inbox.

(Legacy single-file `_fleet/memory/<agent>.md` stores are auto-migrated to this layout, seeding `raw/` first.)

**How an agent records a memory (two channels, same sink):**
1. **`remember` MCP tool (preferred)** — call `remember(fact, pin?, section?)`. It's auto-allowed (`mcp__remember`) for memory-enabled agents on **both Claude and Codex** backends. Structured and reliable.
2. **`[REMEMBER] … [/REMEMBER]` text tag (fallback)** — emit the tag in your output; `[REMEMBER:pin]` for a standing preference, `[REMEMBER:procedure]` for a how-to. Tags are stripped from the visible reply.

Record only **durable, reusable** facts — one concise line each (long/multi-line facts are collapsed and capped). Captures land in `working.md` immediately, so the next run/turn sees them. Memory is agent-scoped (shared across all conversations, including channels).

**Reflection ("dreaming").** If `reflection_enabled: true`, a scheduled nightly run (`reflection_schedule`, default `0 3 * * *`) consolidates `working.md` from the raw log: dedup, resolve contradictions, re-file `Recent` entries, summarize from ground truth to stay within `memory_token_budget` (default 1500), and keep pinned `Preferences`. With `reflection_propose_skills: true`, recurring friction (≥ `reflection_recurrence_threshold`, default 3) becomes an approval-gated skill proposal in the Inbox. A failed/empty reflection never wipes memory. Trigger manually with "Reflect now" on the agent.

> `memory_max_entries` is deprecated (no longer enforced) — size is governed by `memory_token_budget`.

## Prompt Assembly Order

When a task, heartbeat, or channel message runs, the prompt is assembled in this order:
1. Agent system prompt (agent.md body)
2. Shared skills (from skill.md + tools.md + references.md + examples.md)
3. Agent-specific skills (SKILLS.md body)
4. Agent context (CONTEXT.md body)
5. Agent memory (`working.md` + capture instruction, if enabled)
6. Channel context (if the message came from a channel)
7. **Wiki Access block** (if `wiki_references` is set — lists accessible wiki scopes)
8. Task prompt / heartbeat instruction / user message

## Wiki Keeper — Scoped Self-Maintaining Wikis

A **Wiki Keeper** is an agent that curates a folder of the vault as an interlinked markdown wiki. Users drop sources into an inbox or point at existing folders (daily notes, meeting transcripts) as watched sources — the keeper ingests on a schedule, extracts entities and decisions, and produces topic pages with cross-references.

Wiki Keepers are created via Settings → Agent Fleet → Wiki Keepers → + Add, NOT by hand-editing files. Each instance is an ordinary Agent Fleet agent with a `wiki_keeper:` block in its `config.md` frontmatter. Scope is fixed after creation.

**Scheduling:** on creation the keeper gets a default hourly heartbeat (for inbox + watched ingestion) and a sibling recurring task `<agent>-lint` (Sunday 9 AM). Cadence is managed afterwards the same way as any other agent — edit `HEARTBEAT.md` for ingest cadence, or the `<agent>-lint` task for the lint cadence. `config.md` carries no schedule fields.

### Wiki Keeper config shape

```yaml
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
```

### Two ingestion modes

| Mode | Destructive? | Produces | For |
|---|---|---|---|
| **Inbox** | Yes — moves source to archive | Summary page per source + topic updates | One-off drops: PDFs, Web Clipper clips, forwarded emails |
| **Watched** | No — source stays in place forever | Topic page updates only (no summary page) | Daily notes, meeting transcripts, existing project artifacts |

Both modes update `_topics/`, `index.md`, `log.md`. Watched mode uses mtime diffing to re-process only changed files.

### Three bundled skills

- **wiki-ingest** — runs both modes in one invocation
- **wiki-query** — dual-mode: keeper-mode (queries own scope, enforces isolation) and consumer-mode (queries referenced scopes via `wiki_references`)
- **wiki-lint** — weekly audit: orphans, stale events, contradictions, schema violations

### Consumer agents — `wiki_references`

Any agent can read + contribute to a wiki it doesn't own. Add to the consumer agent's `config.md`:

```yaml
wiki_references:
  - agent: wiki-keeper-acme
  # - agent: wiki-keeper-beta    # can reference multiple
```

And attach `wiki-query` skill in its `agent.md`:

```yaml
skills:
  - wiki-query
```

At prompt-build time, the plugin injects a `## Wiki Access` section listing each referenced keeper's scope root, topics path, index, and inbox — plus three rules:
1. Cite every factual claim from a wiki.
2. Drop durable claims (new decisions, entities, etc.) to the relevant keeper's inbox as `<inbox>/YYYY-MM-DD-<slug>.md`.
3. Never write to `<topics>/` directly — that's the keeper's job.

## Chat Threading

Every assistant message in a chat shows a `💬 Thread` badge. Clicking it creates an inline threaded conversation with its own Claude session, its own context, and its own stats — the main chat is not polluted.

Threads are stored at `_fleet/agents/<agent>/chat.threads/<anchor-message-id>.json`. They use "soft fork" seeding: the parent's history up to (and including) the anchored assistant message is replayed as a system preamble, then the thread evolves independently.

Threads are view-only — there's no filesystem API to create them programmatically. Users create threads through the UI.

## Auto-compact

When a chat's context crosses `auto_compact_threshold` (default 85%), the session automatically sends `/compact` to the CLI before the user's next message. The CLI summarizes the conversation (reducing e.g. 48k tokens → 1k tokens) and then processes the user's actual message in the compacted context.

Set `auto_compact_threshold: 0` in `config.md` to disable. Users can also type `/compact` directly as a chat message to trigger compaction on demand.

## Run Logs — extended frontmatter

Every run log now carries these additional frontmatter fields:

- `model_source` — one of `task` / `agent` / `settings` / `cli-default`, shows which layer the model came from.
- `resolved_concrete_model` — the concrete model Claude Code routed to (e.g. we asked for `opus`, it resolved to `claude-opus-4-7`).
- `## Result` section — the final assistant answer, separate from the full narration in `## Output`. Run-detail panel leads with this and hides the full transcript behind a toggle.
