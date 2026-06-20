# References

## Permission Modes

| Mode | Unblocked commands | Blocked (deny list) | Best for |
|---|---|---|---|
| bypassPermissions | Auto-runs everything | Hard-blocked | Trusted agents with a blacklist |
| dontAsk | Only allow-listed | Hard-blocked | Locked-down agents with a whitelist |
| acceptEdits | File edits auto-approved | Hard-blocked | Agents editing files only |
| plan | Read-only | Hard-blocked | Research/analysis |
| default | Prompts for permission | Hard-blocked | Not useful for headless |

These are the Claude Code permission modes. **Codex agents** use sandbox levels instead — `workspace-write` / `read-only` (and `bypassPermissions` maps to full access); the modes above are mapped to the nearest Codex equivalent. `Bash(...)` allow/deny rules are translated to Codex execpolicy where possible (command-prefix patterns only). See the "Agent Configuration" permissions notes in `tools.md` for the full Codex behavior. The "Claude Code CLI Flags" section below applies to `claude-code` agents only.

## Cron Expression Format

Five fields: `minute hour day-of-month month day-of-week`

| Field | Values | Special |
|---|---|---|
| Minute | 0-59 | `*/N` = every N minutes |
| Hour | 0-23 | `*/N` = every N hours |
| Day of month | 1-31 | `*` = every day |
| Month | 1-12 | `*` = every month |
| Day of week | 0-7 (0,7=Sun) | `1-5` = weekdays |

Examples:
- `*/15 * * * *` — every 15 minutes
- `0 9 * * *` — daily at 9 AM
- `0 9 * * 1-5` — weekdays at 9 AM
- `30 18 * * 5` — Fridays at 6:30 PM
- `0 0 1 * *` — first of every month at midnight

## Claude Code CLI Flags

The plugin spawns Claude Code with:
```
claude -p "<prompt>" --output-format stream-json --verbose [--model <model>]
```

On macOS/Linux, commands run through a login shell (`/bin/zsh -l -c` or `/bin/bash -l -c`) so shell profile environment variables are available. On Windows, commands spawn directly — Windows inherits environment variables from the system without a shell wrapper.

## Environment Variables

API tokens and secrets should be set in your shell profile:
- **macOS:** `~/.zshenv` or `~/.zprofile`
- **Linux:** `~/.bashrc` or `~/.profile`
- **Windows:** System Environment Variables (Settings → System → Advanced → Environment Variables)

These are inherited by all agent processes. Never store tokens in vault files.

## Channel Types

| Type | Transport | Status |
|---|---|---|
| slack | Socket Mode WebSocket + Assistants API | Supported |
| telegram | Long-poll via HTTPS (getUpdates) | Supported |
| discord | Gateway WebSocket | Coming soon |

**Slack requirements:** Slack app with Socket Mode enabled, bot token (xoxb-) + app-level token (xapp-), scopes: chat:write, im:history, im:read, im:write, app_mentions:read, assistant:write, commands.

**Telegram requirements:** Bot created via @BotFather, bot token. Optional: disable privacy mode for group access, enable threaded mode for forum topics.

**Channel constraints:**
- Agents with `approval_required` cannot be bound to channels (would deadlock)
- Credentials are stored in the OS keychain via Obsidian's SecretStorage API (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- `allowed_users` is checked against the platform's verified sender field

## Heartbeat vs Tasks

| | Heartbeat | Task |
|---|---|---|
| Defined in | HEARTBEAT.md in agent folder | _fleet/tasks/<name>.md |
| Prompt source | Heartbeat body | Task body |
| "Run Now" button | Uses heartbeat instruction | Uses task prompt |
| Delivery | Run log + optional channel post (`channel` in HEARTBEAT.md) | Run log + optional channel post (`channel` in task frontmatter) |
| Scope | One per agent | Many per agent |
| Best for | Autonomous periodic monitoring | Specific scheduled work items |

## File Naming Conventions

- Agent folders: lowercase, kebab-case (`my-agent`)
- Skill folders: lowercase, kebab-case (`git-operations`)
- Task files: lowercase, kebab-case (`check-deploy.md`)
- Channel files: lowercase, kebab-case (`my-slack.md`)
- Run logs: auto-generated (`HHMMSS-agent-task.md`)

## Model Resolution

When a run happens, the model passed to `claude --model` is resolved in this order:

1. **`task.model`** — per-task override (if set and non-empty)
2. **`agent.model`** — per-agent setting (canonical home: `config.md` for folder agents)
3. **`settings.defaultModel`** — plugin-wide default
4. If all three are empty or one of the sentinels (`""`, `"default"`, `"subscription"`), `--model` is omitted → CLI picks its subscription default.

Use **aliases** (`opus`, `sonnet`, `haiku`, `opusplan`) for backend-agnostic, future-proof selection. They're resolved inside Claude Code itself and work identically on direct API, Bedrock, Vertex, Foundry, and Mantle. Use **Custom** (free text) for pinned concrete IDs when reproducibility matters.

Run log frontmatter records both what was requested (`model: opus`) and what the CLI concretely resolved to (`resolved_concrete_model: claude-opus-4-7`) for audit traceability.

## Shared Subscription Rate Limits

All agents authenticate through the same Claude Pro/Max subscription. The rate-limit window (typically 5-hour rolling) is **shared across every agent**. A single context-full agent burning quota on retries will cause other agents to fail requests until the window resets.

Mitigations:
- Set `auto_compact_threshold` on chat-heavy agents so long sessions auto-summarize before they exhaust capacity.
- Use per-task `model: haiku` overrides for cheap/routine work to reduce quota pressure.
- The chat stats strip shows the current quota window type and reset time — hover the `CONTEXT` pill for details.

## Error Handling in Chat

When the CLI returns an error result (context overflow, rate limit, auth issue), the session:
- Emits an `error` stream event with a human-readable reason drawn from `api_error_status` / `subtype` / `result`
- Renders a red error bubble in the chat: `Error: <reason>`
- Flips `isStreaming` back to false so the stop button clears and the user can send another message

A configurable watchdog (default 10 minutes; tunable via plugin Settings → "Chat watchdog timeout") additionally protects against CLI subprocess hangs: if no stream events arrive while streaming, the turn is auto-rejected, the process is killed, and a timeout error is surfaced in the chat. This guarantees the chat never gets permanently stuck.
