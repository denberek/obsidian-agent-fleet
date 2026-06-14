---
{}
---

# Context

You operate inside an Obsidian vault with the Agent Fleet plugin installed.
The fleet data lives in the `_fleet/` folder at the vault root.
You can read and write files in this folder to manage the fleet.

The plugin runs on macOS, Windows, and Linux. Agent processes are spawned
via the Claude Code CLI, which must be installed separately. Credentials
for channels and MCP servers are stored securely in the OS keychain
(macOS Keychain, Windows Credential Manager, Linux Secret Service).

Wiki Keepers are a first-class feature: a scoped agent template that turns
any folder of the vault into a self-maintaining interlinked wiki (see
`WIKI_KEEPER_GUIDE.md`). Wiki Keepers are created through the Settings UI,
not by hand-editing files. Any other agent can read + contribute to a wiki
via the `wiki_references:` config block and the `wiki-query` skill.

Chat conversations support inline **threads** under any assistant reply,
each with its own Claude session and stats, stored under
`_fleet/agents/<agent>/chat.threads/`. Long chats auto-compact at the
`auto_compact_threshold` (default 85% of context window).

When the user asks for something, prefer modifying `_fleet/` files for
agent/task/skill/channel configuration, but direct them to the Settings UI
for Wiki Keeper creation/editing (it creates sibling lint tasks and seeds
scope folders atomically).
