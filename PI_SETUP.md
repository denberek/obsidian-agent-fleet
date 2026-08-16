# Pi Backend Setup

Agent Fleet can run agents on [Pi](https://github.com/earendil-works/pi) — an open-source, multi-provider coding-agent harness. One Pi agent can use **Anthropic and OpenAI models side by side** (and more providers via API keys), selected from a live model picker.

## 1. Install the Pi CLI

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi --version   # 0.84.2 or newer recommended
```

Agent Fleet auto-detects `pi` from the usual install locations (`~/.pi/bin`, `~/.local/bin`, Homebrew, PATH). If yours lives elsewhere, set **Pi CLI path** in the plugin settings.

## 2. Connect providers

Run `pi` in a terminal and use `/login`:

- **Claude Pro/Max** — subscription OAuth. ⚠️ **Read the billing note below first.**
- **ChatGPT Plus/Pro** — subscription OAuth, [officially endorsed by OpenAI](https://developers.openai.com/community/codex-for-oss).
- **API keys** — Anthropic, OpenAI, Gemini, Groq, xAI, and many more, via `/login` or environment variables.

Credentials are stored by Pi itself in `~/.pi/agent/auth.json` (mode 0600) and **never** copied into your vault or plugin settings. The plugin only ever asks Pi for a yes/no auth *status* (Settings → **Pi provider status**).

## 3. Create a Pi agent

In the agent editor, set **Adapter** to **Pi (multi-provider)**. The model picker becomes a dual-vendor list — every Anthropic and OpenAI model your connected providers expose, discovered live from `pi --list-models`. Free text still accepts anything Pi understands: bare ids (`opus`), fuzzy patterns, `provider/id` forms, and `:thinking` suffixes.

Everything else works exactly like Claude Code and Codex agents: scheduled tasks, chat, heartbeat, channels, memory, run logs, structured output, and permission rules.

## 4. Optional: MCP servers

Pi has no built-in MCP support. Install the community MCP client once:

```bash
pi install npm:pi-mcp-adapter
```

After that, servers registered in the fleet MCP panel are projected into Pi agents' runs automatically, exactly like the other backends.

## What's different on Pi

| Area | Behavior on Pi |
|---|---|
| Permission modes | **Read Only** → read-only tools (`read`/`grep`/`find`/`ls`); everything else → full tools |
| Deny rules | Enforced by a generated gate extension matching the command string (guardrail-strength — weaker than Codex execpolicy's real-argv matching) |
| Spend/turn limits | Recorded on run logs, **not enforced** (Pi has no budget flags) |
| Cost figures | Pi's catalog-priced estimates, not provider-billed amounts |
| Chat | One persistent RPC process per session; messages sent mid-turn **steer** the running turn |
| Compaction | Managed by Pi itself (no manual /compact button) |

## ⚠️ Anthropic billing

Third-party harnesses are billed differently by Anthropic than the first-party Claude Code CLI:

- **Claude Code adapter** (first-party): programmatic usage draws from your Pro/Max **plan limits**.
- **Pi adapter** (third-party): usage is billed **per token** from your [extra usage](https://claude.ai/settings/usage) balance — it does *not* draw from plan limits.

Because scheduled tasks and heartbeats run unattended, an Anthropic-model Pi agent on a cron schedule accrues per-token charges while you're away — and Pi has no enforced spend cap. Recommendations:

- Keep Anthropic-subscription agents on the **Claude Code** adapter.
- Use Pi for **OpenAI models** (endorsed subscription path), **API-key providers**, or when one agent roster needs both vendors.
- Verify the billing behavior on your own account with a single small run before scheduling anything.

OpenAI's ChatGPT-subscription usage through Pi is officially endorsed and draws from your ChatGPT plan.
