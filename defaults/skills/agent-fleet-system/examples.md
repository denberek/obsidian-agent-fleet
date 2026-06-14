# Examples

## Example 1: Create a new monitoring agent with heartbeat

**User:** Create an agent that checks my website every hour and reports if it's down.

**Agent:**
```bash
mkdir -p _fleet/agents/site-monitor
```

Creates these files:

**_fleet/agents/site-monitor/agent.md:**
```yaml
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
```

**_fleet/agents/site-monitor/config.md:**
```yaml
---
model: default
adapter: claude-code
timeout: 60
permission_mode: bypassPermissions
memory: true
---
```

**_fleet/agents/site-monitor/HEARTBEAT.md:**
```yaml
---
enabled: true
schedule: "0 * * * *"
notify: true
---

Check https://example.com — report status code and response time.
If the site is down, clearly flag it. Use [REMEMBER] to track
response time trends and compare with previous checks.
```

Note: Using HEARTBEAT.md instead of a separate task file. The heartbeat runs automatically on schedule and the "Run Now" button on the agent uses this instruction. A separate task is only needed if you want a different prompt than the heartbeat.

---

## Example 2: Create a skill for an existing agent

**User:** Add a git skill to my code-reviewer agent.

**Agent:**
```bash
mkdir -p _fleet/skills/git-operations
```

Creates skill files, then updates the agent's `agent.md` to include it:
```yaml
skills:
  - git-operations
```

---

## Example 3: Set up a Slack channel

**User:** I want to chat with my agents from Slack.

**Agent:** Creates a channel binding file:

**_fleet/channels/my-slack.md:**
```yaml
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
```

Then explains: "You need to set up a Slack app at api.slack.com with Socket Mode enabled, and add the bot token + app token as a credential named `slack-creds` in Settings → Agent Fleet → Channel Credentials. Credentials are stored securely in your OS keychain. Once configured, send a DM to the bot from Slack — use `@agent-name: message` to switch between agents, or type `/agents` to see available agents."

---

## Example 3b: Set up a Telegram channel

**User:** I want to chat with my agents from Telegram.

**Agent:** Creates a channel binding file:

**_fleet/channels/my-telegram.md:**
```yaml
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
```

Then explains: "Create a bot via @BotFather on Telegram — use `/newbot`, pick a name and username, and copy the token. Add the token as a credential named `telegram-creds` in Settings → Agent Fleet → Channel Credentials (type: Telegram). Then message the bot in Telegram. Use `/agents` to get interactive buttons for switching agents."

---

## Example 4: Add heartbeat with Slack delivery to an existing agent

**User:** Make my site-monitor agent report to Slack every 6 hours.

**Agent:** Creates (or updates) the heartbeat file:

**_fleet/agents/site-monitor/HEARTBEAT.md:**
```yaml
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
```

Explains: "The heartbeat will run every 6 hours. Results are posted to the `my-slack` channel as a DM. Make sure the channel is configured and connected."

---

## Example 5: Modify a task schedule

**User:** Change the check-status task to run every 5 minutes instead of hourly.

**Agent:** Reads `_fleet/tasks/check-status.md`, updates the frontmatter:
```yaml
schedule: "*/5 * * * *"
```
Writes the file back. The plugin picks up the change automatically.

---

## Example 6: Troubleshoot a failing agent

**User:** My deploy-watcher agent keeps timing out.

**Agent:**
1. Reads `_fleet/agents/deploy-watcher/config.md` — checks timeout value
2. Reads recent runs in `_fleet/runs/` — looks at error outputs
3. Suggests increasing timeout or simplifying the task prompt
4. Makes the change if approved

---

## Example 7: Set up multi-agent routing in Slack

**User:** I want different agents available in my Slack channel.

**Agent:** Updates the channel file's `allowed_agents` list:

```yaml
allowed_agents:
  - fleet-orchestrator
  - site-monitor
  - code-reviewer
  - daily-briefing
```

Explains: "Users can now type `@code-reviewer: review this` to switch agents mid-conversation. Each agent gets its own isolated session. Type `/agents` in Slack to see the full list."

---

## Example 8: Assign MCP servers to an agent

**User:** I want my assistant agent to use the Todoist and Linear MCP servers.

**Agent:** Updates `_fleet/agents/assistant/agent.md` frontmatter to include `mcp_servers`:

```yaml
---
name: assistant
description: Personal assistant with task and project management
mcp_servers:
  - todoist
  - linear
skills:
  - agent-fleet-system
---
```

Explains: "The agent will now have access to Todoist and Linear tools during its runs. Make sure these MCP servers are added and authenticated in the dashboard (MCP Servers page). For HTTP/SSE servers that need OAuth, click 'Authenticate' on the server card — the plugin handles the browser-based auth flow and injects tokens into the CLI automatically."

---

## Example 9: Give an agent read-access to a project wiki

**User:** I have a Wiki Keeper scoped to `projects/acme`. My PM agent should be able to read it and cite from it.

**Agent:** Updates the PM agent's `agent.md` to attach the `wiki-query` skill:

```yaml
skills:
  - wiki-query
  # plus the agent's existing skills
```

And updates the PM agent's `config.md` with the reference:

```yaml
wiki_references:
  - agent: wiki-keeper-acme
```

Explains: "At prompt-build time, I'll get a Wiki Access section telling me where `projects/acme/_topics/` lives and how to cite from it. When the user shares durable claims (decisions, new entities, competitor updates), I'll drop them as markdown files into `projects/acme/_sources/inbox/YYYY-MM-DD-<slug>.md` — wiki-keeper-acme files them canonically on its next ingest. I won't write to `_topics/` directly; that's the keeper's job."

Note: this is a consumer-only relationship. The PM agent's responses are wiki-grounded (cites pages) but don't touch the topic tree directly.

---

## Example 10: Route a simple nightly task to Haiku while keeping the agent on Opus

**User:** My reporting agent is on Opus which is expensive. The nightly summary task is simple enough for Haiku. Can I use a cheaper model just for that task?

**Agent:** Edits the task file's frontmatter to include a `model` override:

```yaml
---
task_id: nightly-summary
agent: reporting-agent
type: recurring
schedule: "0 2 * * *"
model: haiku                 # Override: use haiku just for this task
---

Summarize today's activity in 3 bullet points.
```

Explains: "I'll keep the agent configured with Opus for its interactive work, but this task now resolves to Haiku via the resolution order: task.model → agent.model → settings default. The run log will show 'haiku' requested and the concrete model Claude Code routed to."

---

## Example 11: Create a new Wiki Keeper

**User:** Set up a wiki keeper for my acme project. The project folder is `projects/acme/` and I want it to also watch `daily-notes/` for any acme-related notes I write.

**Agent:** Explains that Wiki Keepers are created via Settings → Agent Fleet → Wiki Keepers → + Add, not by editing files directly. Walks the user through:

1. Open Settings → Agent Fleet.
2. Scroll to the **Wiki Keepers** section. Click **+ Add**.
3. Fill in:
   - **Scope folder:** `projects/acme`
   - **Watched folders:** `daily-notes/, projects/acme/meetings/`
   - **Exclude patterns:** `meetings/drafts/**`
   - Leave other fields at defaults (nightly ingest at 3 AM, weekly lint Sundays at 9 AM).
4. Click **Create**.

Result: a new `_fleet/agents/wiki-keeper-acme/` folder with five files; `projects/acme/_sources/inbox/`, `projects/acme/_topics/`, `projects/acme/index.md`, and `projects/acme/log.md` are seeded; a sibling lint task is created at `_fleet/tasks/wiki-keeper-acme-lint.md`.

To query: `@wiki-keeper-acme: what do we know about competitor X?` in any chat surface.

---

## Example 12: Tune auto-compact threshold for a long-context agent

**User:** My researcher agent often hits context limits. Can I make it auto-compact earlier?

**Agent:** Edits `_fleet/agents/researcher/config.md` to lower the threshold:

```yaml
auto_compact_threshold: 70     # was 85 by default
```

Explains: "Auto-compact now kicks in at 70% context instead of 85%. Next time the agent's chat reaches that threshold, the session will automatically send `/compact` before the next user message, and the user will see a 'Conversation compacted (N → M tokens)' notification bubble in the chat. Set to 0 to disable the auto-trigger; users can still type `/compact` manually at any time."
