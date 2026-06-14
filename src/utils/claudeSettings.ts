import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { AgentConfig } from "../types";

/** Snapshot of a `.claude/settings.local.json` we wrote on behalf of an agent.
 *  Pass to `restoreClaudeSettingsFile` after the spawned Claude process
 *  finishes (or errors) to put any pre-existing user-authored file back. */
export interface ClaudeSettingsState {
  path: string;
  backupContent: string | null;
}

/**
 * Write a temporary `.claude/settings.local.json` at the agent's `cwd` that
 * carries the agent's `permissionMode`, `permissionRules.allow/deny`, and any
 * MCP-server allow patterns. This is the canonical mechanism for getting our
 * permission configuration into the spawned Claude CLI — the CLI reads
 * settings.local.json at startup.
 *
 * Returns null when the agent has nothing to install (no rules, no mode, no
 * MCP servers); callers should treat that as "no cleanup needed."
 *
 * Both ExecutionManager (per-task spawn) and ChatSession (long-lived chat
 * process) use this helper so permission configuration is identical across
 * task and chat invocations.
 */
export interface WriteSettingsOptions {
  /** Names of the MCP servers projected into this run. Each becomes an
   *  `mcp__<name>` allow entry so its tools are usable without an approval
   *  prompt. This is the resolved effective set (enabled fleet servers ∩ agent
   *  grants + the synthetic `remember` tool), NOT just `agent.mcpServers` — a
   *  memory agent with no explicit grants still needs `mcp__remember` allowed. */
  mcpAllowServers?: string[];
}

/** Normalize a server name into its `mcp__<name>` allow-list entry. Whitespace
 *  and dots become underscores (matches the Claude CLI's server-id rule). */
function mcpAllowEntry(serverName: string): string {
  return `mcp__${serverName.replace(/[\s.]+/g, "_")}`;
}

export function writeClaudeSettingsFile(
  cwd: string,
  agent: AgentConfig,
  opts: WriteSettingsOptions = {},
): ClaudeSettingsState | null {
  const hasPermRules =
    agent.permissionRules.allow.length > 0 || agent.permissionRules.deny.length > 0;
  const permMode = agent.permissionMode?.trim();
  const hasPermMode = !!permMode && permMode !== "default";
  const mcpAllow = opts.mcpAllowServers ?? [];
  const hasMcpServers = mcpAllow.length > 0;
  const needsSettingsFile = hasPermRules || hasPermMode || hasMcpServers;
  if (!needsSettingsFile) return null;

  const claudeDir = join(cwd, ".claude");
  const path = join(claudeDir, "settings.local.json");

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  let backupContent: string | null = null;
  if (existsSync(path)) {
    try {
      backupContent = readFileSync(path, "utf-8");
    } catch {
      backupContent = null;
    }
  }

  const settingsObj: Record<string, unknown> = {};
  if (hasPermMode) {
    settingsObj.defaultMode = permMode;
  }
  if (hasPermRules || hasMcpServers) {
    const allowList = [...agent.permissionRules.allow];
    for (const serverName of mcpAllow) {
      allowList.push(mcpAllowEntry(serverName));
    }
    settingsObj.permissions = {
      allow: allowList,
      deny: agent.permissionRules.deny,
    };
  }

  writeFileSync(path, JSON.stringify(settingsObj, null, 2) + "\n", "utf-8");
  return { path, backupContent };
}

/** Best-effort cleanup. Restores the user's pre-existing settings.local.json
 *  if one was backed up, otherwise removes the file we wrote. Errors swallow. */
export function restoreClaudeSettingsFile(state: ClaudeSettingsState | null): void {
  if (!state) return;
  try {
    if (state.backupContent !== null) {
      writeFileSync(state.path, state.backupContent, "utf-8");
    } else if (existsSync(state.path)) {
      unlinkSync(state.path);
    }
  } catch {
    // Best-effort cleanup — don't crash a spawn handler over this.
  }
}
