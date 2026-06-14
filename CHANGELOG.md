# Changelog

## 0.13.4 — 2026-06-14

Further community-review cleanup (all non-blocking warnings). No user-facing behavior changes.

- **Deletions respect your trash preference** — file/folder removals now go through `FileManager.trashFile` instead of `Vault.delete`/`Vault.trash`, so they honor your "move to system trash vs. permanently delete" setting.
- Replaced the `builtin-modules` build dependency with Node's built-in `module.builtinModules`.
- Removed a few unused local variables.

## 0.13.3 — 2026-06-14

Clears the blocking errors from the Obsidian Community Plugins automated review. No user-facing behavior changes.

- **No inline styles** — every `el.style.x = …` assignment is now `el.setCssStyles({ … })` (Obsidian guideline).
- **`minAppVersion` → 1.11.4** — the plugin uses the SecretStorage API and the current `revealLeaf` signature; the declared minimum now matches.
- **No plugin-as-component** — `MarkdownRenderer.render` now receives the view (a short-lived component) instead of the plugin instance, avoiding a lifecycle leak.
- **Popout-window compatibility** — timers use `window.setTimeout`/`clearTimeout`/`setInterval`/`clearInterval` and DOM access uses `activeDocument`.
- Minor: described eslint-disable directive, dropped unused imports, settings warning now uses `vault.configDir` instead of a hardcoded `.obsidian`.

## 0.13.2 — 2026-06-14

Community-directory submission fixes (from the automated review).

- Manifest description no longer contains the word "Obsidian" (redundant in the directory context).
- The public repository now ships the full TypeScript source — the community directory requires source-available plugins.

## 0.13.1 — 2026-06-14

Compliance polish ahead of submitting to the Obsidian Community Plugins directory. No functional changes.

- Conversations-panel toggle icon is now built with the DOM API instead of an HTML string (Obsidian guidelines discourage `innerHTML`). The icon is unchanged.
- `onunload` no longer detaches the plugin's leaves — Obsidian restores plugin views to their original positions on update, and detaching interfered with that.
- Command names are now sentence case and no longer repeat the plugin name (e.g. "Open Dashboard" → "Open dashboard"); command IDs are unchanged, so existing hotkeys keep working.
- Settings-tab section headings use `setHeading()`; dropped the redundant "Agent Fleet Settings" title.
- Removed stray `console.log` output so the developer console shows only errors by default.

## 0.13.0 — 2026-06-14

MCP v2 — register an MCP server **once** in Agent Fleet and it's available to **any** agent on **either** adapter (Claude Code or Codex). Previously each server had to be configured twice, in two formats, with two separate auth flows; the dashboard only managed Claude's registry, and the two configs drifted.

### One registry, projected per run
- MCP servers now live in a fleet-owned registry — one markdown file per server under `_fleet/mcp/<name>.md` (frontmatter; secrets never in the vault). Like everything else in the fleet, it survives uninstall and is diffable.
- At spawn time the enabled servers an agent is granted are **projected** into whichever adapter it uses: Claude Code gets a merged `--mcp-config`, Codex gets `-c mcp_servers.*` overrides. Your native `~/.claude.json` and `~/.codex/config.toml` are **read-only** — Agent Fleet never mutates them.
- Per-agent grants are unchanged: leave the agent's MCP list empty to grant every enabled server, or check specific ones. The selection now applies identically on both adapters.

### Cross-adapter auth
- HTTP/SSE servers authenticate once (OAuth 2.1 PKCE, or a static bearer token) and the token is stored in the OS keychain. It's projected to Claude as an `Authorization` header and to Codex via `bearer_token_env_var` (the token is passed through the spawn environment, never written to argv or to any config file).

### One-time import
- On first load, your existing Claude and Codex MCP servers are imported into the registry (deduplicated — a server configured in both becomes one entry, marked `imported`), and any bearer tokens found are moved into the keychain. Idempotent; your native configs are left untouched.

### Robustness
- Removed the brittle `claude mcp list` / `codex mcp list --json` text-parsing from the run path — the registry is the source of truth. A bad server definition is dropped (logged) without breaking the run, and a failed projection degrades gracefully instead of aborting the agent.

## 0.12.1 — 2026-06-13

Bug-fix release for the v0.12.0 memory subsystem — chiefly channel agents going silent.

### Channel agents stopped replying
Two regressions could leave a memory-enabled agent silent on Slack/Telegram (and in chat):

- **Empty `cwd`.** Agent cwd is resolved as `agent.cwd ?? vaultBase`, but `??` doesn't fall back on an empty string — the default `cwd: ""` stayed `""`. v0.12.0's `remember` tool then built its temp `.claude` paths from that, so the spawn failed. Now an empty/whitespace cwd correctly falls back to the vault base, and `installRememberTool` is fail-soft (a write error degrades to "no tool" instead of breaking the reply).
- **Expired/missing Claude session.** Channel agents persist a Claude session id and reconnect via `claude --resume <id>`. When that session was gone (pruned/expired), Claude returned nothing and — unlike the Codex path — the dead id was never dropped, so the agent re-resumed a dead session forever and replied with silence. Now a resumed turn that errors or comes back empty clears the session id and the next turn starts fresh.

### `/agents` picker showed phantom agents
The Slack/Telegram `/agents` picker (and `@`-prefix routing) listed `allowed_agents` verbatim, so a stale, renamed, or disabled entry appeared as selectable and failed on use. The list is now intersected with the agents that actually exist and are enabled.

### Other
- Memory capture hygiene: `readAndClearPending` removes a pending file before folding its lines (no duplicate raw-archive entries on a transient failure); reflection persists the candidate ledger per proposal (a crash can't re-propose a whole run); removed dead `defaultReflectionConfig()`.

## 0.12.0 — 2026-06-13

A full rewrite of agent memory, plus capture parity for Codex and chat-UI polish.

### Memory subsystem v2 — two-tier store + reflection + skill growth

Memory moves from a single flat `_fleet/memory/<agent>.md` to a per-agent folder:

- **`working.md`** — curated, **token-budgeted** memory injected into every run (sections: `Preferences` (pinned), `Procedures`, `Observations`, `Recent`). Replaces the dead `memory_max_entries` cap with `memory_token_budget` (default 1500).
- **`raw/<date>.md`** — append-only ground-truth log of everything captured (never injected), so summaries can always be re-derived from source.
- **`candidates.json`** / **`pending/`** — reflection's skill-pattern ledger and the capture inbox.

Legacy flat files are migrated on load (and lazily on first capture), seeding the raw archive first so nothing is lost.

**Capture on every surface (task, heartbeat, chat), two channels feeding one sink:**
- A dedicated **`remember` MCP tool** (`remember(fact, pin?, section?)`), auto-allowed for memory-enabled agents on **both Claude Code and OpenAI Codex** backends (Claude via `--mcp-config`, Codex via inline `-c mcp_servers.*` overrides — same hand-rolled stdio server). The runtime-injected instruction now leads with the tool.
- The `[REMEMBER] … [/REMEMBER]` text tag as a permanent fallback (`[REMEMBER:pin]` / `[REMEMBER:procedure]`), stripped from the live chat display.

Captures are serialized through a single per-agent **`MemoryWriter`** lock, sanitized (newlines collapsed, length-capped), and deduped into working memory while the raw log keeps every mention.

**Reflection ("dreaming")** — an optional nightly per-agent run (`reflection_enabled`, `reflection_schedule`, default `0 3 * * *`) consolidates `working.md` from the raw log: dedup, resolve contradictions, re-file `Recent`, summarize from ground truth to fit the budget, and never drop pinned `Preferences`. A failed/empty reflection never wipes memory; reflections are concurrency-gated. With `reflection_propose_skills`, recurring friction (≥ `reflection_recurrence_threshold`, default 3) becomes an **approval-gated skill proposal** in the Inbox.

### Chat UI

- Conversations fold/unfold toggle now uses Obsidian's **native sidebar-toggle** look (backgroundless `clickable-icon`, animated inner bar, exact geometry/size).
- "Conversations" panel header de-shouted to match the panel typography.

### Notes

The `agent-fleet-system` skill docs were updated to describe the v2 memory system. Built on top of 0.11.0 (Codex backend); requires Obsidian 1.6.0+.

## 0.11.0 — 2026-06-13

A whole new agent backend: agents can now run on **OpenAI Codex** instead of Claude Code, chosen per agent. Plus permission-rule enforcement for Codex agents.

### OpenAI Codex CLI backend

`AgentConfig.adapter` selects the engine per agent — `claude-code` (default) or `codex`. The adapter layer (`src/adapters/`) abstracts both behind one `CliAdapter` interface, so chat, tasks, heartbeat, Slack/Telegram channels, memory, and the dashboard all work identically on either backend. Pick the engine in the agent editor's Adapter field; the model picker switches its alias list to match (Claude aliases vs Codex slugs), with free text as the escape hatch.

- **Codex agents** run `codex exec --json` with the prompt on stdin (positional `-`, dodges argv limits), parse the JSONL event stream (`thread.started` / `item.*` / `turn.completed`), and resume via `codex exec resume <thread_id>` (stored in the same `sessionId` slot Claude uses).
- **Permission modes** map across families — Claude-style (`bypassPermissions`/`dontAsk`/`acceptEdits`/`plan`) and Codex-style (`workspace-write`/`read-only`) each translate to the nearest equivalent. `codex exec` hardcodes approval policy `never`, so the sandbox is Codex's file/network enforcement axis.
- **Per-agent MCP scoping** via `-c mcp_servers.<name>.enabled` overrides against `codex mcp list --json` (cached 5 min, fail-soft). Codex agents consume servers from `~/.codex/config.toml`.
- **Effort** maps the Claude scale onto Codex: `max` → `xhigh` via `-c model_reasoning_effort`.
- Codex reports no `total_cost_usd`, so `cost_usd` stays blank on Codex runs; compact/auto-compact and rate-limit telemetry remain Claude-only and no-op for Codex.
- The codex CLI path is resolved (and re-resolved on settings save) only when at least one agent uses the codex adapter, so Claude-only users never pay the probe latency.

### Permission rules on Codex (execpolicy)

`permissionRules.allow/deny` are now enforced on **both** backends. Claude writes them to `.claude/settings.local.json`; Codex translates `Bash(cmd args *)` command-prefix patterns into execpolicy `.rules` (deny → `forbidden`, allow → `allow`) and injects them via a **per-agent `CODEX_HOME` overlay** — a directory that symlinks every real `~/.codex` entry (auth, config, sessions) *except* `rules/`, which the plugin owns. This keeps per-agent rules isolated under concurrency while auth/resume/MCP keep working. The overlay is keyed on a hash of the agent's file path, so two agents whose names slug identically (e.g. `deploy bot` vs `deploy.bot`) never share rules.

`setupPermissions` is now async — it feature-detects and validates rules via `codex execpolicy check` — and **every failure path is soft**: missing execpolicy support, no `~/.codex`, unavailable symlinks, or invalid rules all fall back to sandbox-only enforcement with a one-time console warning. The overlay unions the user's existing `~/.codex/rules/` so a global safety policy is never silently dropped, and overlays are removed on plugin unload.

Lossy by nature, surfaced in the UI and docs: only command-prefix `Bash(...)` patterns translate — tool-name rules (`Read`/`Write`/`Edit`) and mid-pattern wildcards are dropped (file access is the sandbox's job), `prompt` decisions become hard denies under `approval=never`, and there's no closed allow-list (Codex `allow` rules are additive, so Claude's "only the allow-list runs" semantics aren't reproducible).

### Tests

161/161 green (up from 144): new `claudeCodeAdapter`, `codexAdapter`, and `codexPermissions` suites covering the adapter split, pattern translation, the `CODEX_HOME` overlay (including the slug-collision isolation case), and safe cleanup.

## 0.10.3 — 2026-05-11

One feature, one fix. Both surfaced by real usage.

### Parallel in-app conversations per agent

You can now hold N independent chats with the same agent in the Obsidian chat panel — different tasks, different contexts, switchable from a dropdown. Reuses the conversation plumbing that already powers Slack multi-thread.

- Same-agent dedup is now `(agent, conversationId)` dedup. Two tabs on the same agent are fine; two tabs on the same `(agent, conversation)` reveals the existing tab.
- A conversation picker row appears below the agent dropdown whenever the agent has more than one conversation. Single-conversation users see no UI change.
- **+ New Chat** creates a new conversation alongside the current one (was: wipe-the-singleton). Rename / Delete buttons next to the picker; the legacy "Main chat" is delete-protected so pre-feature data can't be orphaned accidentally.
- Tab title becomes `Chat: <agent> · <conversation name>` once a second conversation exists.

**Data layout** mirrors Slack sessions:
- Folder agents: `<agent-folder>/conversations/<convId>.json`
- Flat agents: `_fleet/memory/<agent>-conversations/<convId>.json`
- Sentinel id `"default"` maps back to the legacy per-agent `chat.json` so existing data is untouched. The picker surfaces it as "Main chat".

**State persistence**: `AgentChatView.getState()` now returns `{agentName, conversationId}`. Reload restores the exact same tab → same conversation. Older state files without `conversationId` fall back to `"default"`.

**Engine unchanged**: `ChatSessionOptions.inAppConversationId` joins existing `channelName` / `conversationId` / `threadAnchorId` knobs; `getChatFilePath()` grows one parallel branch. The Claude `--resume` flow, sendMessage lock, watchdog, threading, and stats all carry through unchanged.

### Fix: stop old runtime's crons on saveSettings rebuild

`saveSettings()` was replacing `this.runtime` with a fresh `FleetRuntime` without stopping the outgoing runtime's heartbeat / task-scheduler crons. Croner timers own their own callbacks once started — dropping the reference doesn't stop them, so each leaked runtime kept firing the schedules it was registered with for the rest of the Obsidian session.

**Concrete symptom**: a user changes an agent's heartbeat from "every 2h" to "every 6h", and the 2h schedule keeps firing. Even though the agent-edit path correctly re-registered on the current runtime, any prior `saveSettings()` (toggling status bar, editing channel credentials, etc.) had leaked a previous runtime still holding a 2h cron. Multiple leaked runtimes accumulated across a session, causing duplicate runs and making schedule edits appear not to take effect until full reload.

- `TaskScheduler.shutdown()` — stop every job, clear the map, drop the pending queue.
- `FleetRuntime.shutdown()` — stop heartbeat crons + delegate to scheduler. Idempotent.
- `main.saveSettings()` calls `runtime.shutdown()` before reassigning.
- `main.onunload()` calls `runtime.shutdown()` so "Disable plugin" without a full reload also tears down cleanly.

Regression test added on `TaskScheduler` — verifies post-shutdown `resumeAll` doesn't flush queued runs and no cron remains to fire.

### Tests

108/108 green (up from 103): 4 new conversation-path tests on ChatSession + 1 scheduler-shutdown regression.

## 0.10.2 — 2026-05-08

Two limits hit by busy fleets are now configurable / accurate.

**Configurable chat watchdog timeout.** The chat-session watchdog (kills the Claude CLI subprocess if no stream events arrive mid-turn) was hardcoded to 5 minutes — too short for agents running long tools (large web fetches, builds, big greps), causing spurious "no response from the CLI" errors. Now configurable via `chatWatchdogMinutes` in plugin settings (default 10 min, range 1–60). `ChatSession` reads the value at every watchdog arm, so changes apply on the next turn without recreating sessions. `ExecutionManager` keeps using the per-agent `agent.timeout` for task/heartbeat hard-cap.

**Dashboard 14-day chart now reflects all 14 days on busy fleets.** The Run Activity bar chart was being fed by `runtime.getRecentRuns()` (capped at 50 runs). On a fleet with frequent heartbeats, those 50 runs only spanned a few days — older bars in the 14-day window appeared empty even when they had real activity.

Fix: new `FleetRepository.listRunsSince(date)` walks `_fleet/runs/YYYY-MM-DD/` folders lexicographically `>= sinceDate`. Cost is bounded by window size, not total historical runs. New parallel `chartRuns` cache populated alongside `recentRuns` via a new `refreshRunCaches()` helper used by all 7 refresh sites. Bar chart uses the new list; success-rate donut and activity timeline keep the recent-50 (those are "lately" indicators, not 14-day windows).

## 0.10.1 — 2026-04-26

Fix: Wiki Keeper heartbeat/task runs were hitting Claude Code v2.1.x's spawned-subprocess Bash sandbox, blocking `Bash(mv ...)` and causing the model to fall back to Write — which copies a file to archive but doesn't delete the source. Result: inbox files reprocessed every cycle.

`ExecutionManager` now passes `--permission-mode <mode>` to the spawned Claude CLI explicitly (matching `ChatSession`'s behavior, which is why interactive chat already worked). Without the explicit CLI flag, Claude Code's `defaultMode` in `settings.local.json` was insufficient to opt out of sandbox for non-interactive subprocesses.

No changes to skill prompts, defaults, or schemas.

## 0.10.0 — 2026-04-26

Wiki Keeper grows from a nightly batch ingester into a self-maintaining knowledge base in the Karpathy "LLM wiki" sense — and the underlying permission system is rebuilt so UI edits actually reach the spawned Claude process.

### Wiki Keeper — compounding loop

- **New skill: `wiki-refresh`.** Regenerates a stable, fenced `## Summary` block at the top of every topic page whose claim history has grown. Bounded by its own `max_tokens_per_refresh` budget. Idempotent.
- **End-of-ingest refresh phase.** `wiki-ingest` tracks every page it touched and chains `wiki-refresh` at the end of each run. Topic pages stop growing into 200-line changelogs without a synthesis on top.
- **Q&A compounding (Karpathy's central pattern).** `file_substantive_answers` now defaults to **on**. Substantive `wiki-query` answers file as both a synthesis page AND dated bullets on each cited topic page. Every meaningful question leaves a per-topic trace, not just a sidecar synthesis.
- **Provenance footer on every answer.** Citations carry the `summary_refreshed`/mtime of each cited page so readers see staleness.

### Wiki Keeper — integrity

- **Bidirectional cross-link check** in `wiki-lint`: flags edges where A→B exists in summary/prose but B has no mention of A.
- **Dedup proposals**: title-similarity (Levenshtein) + co-citation overlap; never auto-merges.
- **Stale-summary detection** in lint: pages whose `summary_refreshed` is missing or older than `summary_stale_days` get chained to `wiki-refresh` automatically.
- **Hash-based watched-mode idempotency**: SHA-1 of normalized content. Skips re-processing files whose mtime moved without content change (defends against iCloud / Obsidian Sync touch-without-edit).
- **Failed-source quarantine**: inbox files that fail ingest 3 times in a row move to `_sources/failed/` with a sidecar `.error.md` instead of being retried forever.
- **Source-type tags** on every dated bullet: `[doc]`, `[meeting]`, `[email]`, `[note]`, `[web]`, `[synthesis]`, `[other]`. Helps query weight evidence quality.
- **Index sub-MOC awareness**: when topics root exceeds `index_split_threshold` (default 100) or any single type exceeds 30 pages, ingest writes per-type sub-MOCs instead of one flat alphabetical list.
- **Syntheses exempt from orphan flagging** if they have outbound links to topic pages they cite.

### Wiki Keeper — dashboard

- **New "Wiki Keepers" main nav page**. Per-instance card showing scope, log shortcut, and the latest `## Lint YYYY-MM-DD` block parsed from `log.md`. Needs review items render as actionable cards with Dismiss.
- Settings → Wiki Keeper edit form now exposes `max_tokens_per_refresh`, `index_split_threshold`, `summary_stale_days`, and `dedup_similarity_threshold`.

### Wiki Keeper — schema additions

Topic-page frontmatter gains `summary_refreshed: <ISO>` and `claims_at_refresh: <int>`. The auto-managed summary block lives between `<!-- wiki-keeper:summary:begin -->` and `<!-- wiki-keeper:summary:end -->` markers — `wiki-refresh` is the only writer; `## Claims` history and user-authored prose elsewhere on the page are untouched.

### Permission management — full rebuild

The permission system had silent drift: UI edits wrote `allowed_tools`/`blocked_tools` to `config.md` frontmatter, but the runtime ignored those fields and read `permissions.json` exclusively. Wiki Keeper Edit → Save was effectively a no-op for permissions, and ChatSessions silently dropped allow/deny rules entirely.

- **Single source of truth.** `permissions.json` is the canonical surface for allow/deny on folder agents. Flat agents get a `<name>.permissions.json` sidecar — they previously had no allow/deny support at all.
- **Vestigial fields removed.** `agent.allowedTools` / `agent.blockedTools` deleted from the type. `config.md` no longer carries `allowed_tools` / `blocked_tools`. Migration on read picks up legacy values; saving once rewrites them to the canonical surface.
- **Wiki Keeper canonical permissions.** New `ensureWikiKeeperPermissions` helper merges the canonical allow (`Read, Write, Edit, Glob, Grep, Bash(mv *), Bash(mkdir *)`) and canonical deny (including defense-in-depth path-traversal patterns: `Bash(rm -rf /*)`, `Bash(mv * /*)`, `Bash(cp -r * /*)`) into `permissions.json`. Idempotent — preserves user-added entries. Both `createWikiKeeperAgent` and `updateWikiKeeperAgent` call it, so Edit → Save now actually upgrades older keepers.
- **Permissions apply in chat sessions.** Previously chat sessions only honored `--permission-mode` and dropped `permissionRules.allow/deny` — meaning a Wiki Keeper chatting interactively could not run its allow-listed `Bash(mv *)` without per-call approval. `ChatSession` now writes `.claude/settings.local.json` at process spawn (and restores at close / abort / hibernate / error), via a shared `claudeSettings` util reused by `ExecutionManager`.
- **Long-lived sessions resolve fresh.** `ChatSession.refreshAgent()` re-resolves `repository.getAgentByName(name)` at every process spawn. Permission/model/effort edits made in the UI take effect on the next message in the same chat tab — no need to recreate it. Falls back to construction-time agent if the agent has been deleted.
- **No race between Save and Run.** All Wiki Keeper modal handlers `await plugin.refreshFromVault()` before re-rendering. The 500ms vault-watcher debounce no longer matters.

### Federator (design only)

- New `WIKI_KEEPER_FEDERATOR_DESIGN.md` specifies a v2 cross-scope orchestrator: a single agent that fans out to multiple keepers, merges cited answers with explicit per-scope provenance, and routes inbox drops to the right keeper. No code in this release.

### Tests

- 12 new tests covering the permission lifecycle, lint report parsing, and `wiki-refresh` synthesis schema (103 / 103 green).
- `claudeSettings` util has dedicated coverage for the settings.local.json write/restore lifecycle.
- `ensureWikiKeeperPermissions` covered for fresh write, additive merge, idempotency, invalid-JSON recovery.
- `ChatSession.refreshAgent` covered for fresh-fetch and fallback-on-deletion.

### Files of note

- New: `defaults/skills/wiki-refresh/skill.md`, `src/utils/claudeSettings.ts`, `src/utils/wikiLintReport.ts`, `WIKI_KEEPER_FEDERATOR_DESIGN.md`
- Significantly rewritten: `defaults/skills/wiki-ingest/skill.md`, `defaults/skills/wiki-query/skill.md`, `defaults/skills/wiki-lint/skill.md`, `src/wikiKeeperTemplate.ts`
- Touched: `src/types.ts`, `src/fleetRepository.ts`, `src/services/chatSession.ts`, `src/services/executionManager.ts`, `src/settingsTab.ts`, `src/views/dashboardView.ts`

### Migration notes

- Existing Wiki Keepers: open Settings → Wiki Keepers → ⚙ Edit → Save once. Strips dead `allowed_tools` / `blocked_tools` from `config.md` and merges canonical allow/deny into `permissions.json` (preserving any custom entries).
- Existing topic pages: keep working as-is. The first `wiki-ingest` after upgrade adds the fenced summary block and frontmatter slots to pages it touches.
- Existing flat agents with `allowed_tools` / `blocked_tools` in frontmatter: unchanged behaviorally on read (legacy migration), but a Save through the UI will move the rules into a sidecar `<name>.permissions.json` and strip the frontmatter fields.
