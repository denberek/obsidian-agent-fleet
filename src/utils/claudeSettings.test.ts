import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentConfig } from "../types";
import { restoreClaudeSettingsFile, writeClaudeSettingsFile } from "./claudeSettings";

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    filePath: "_fleet/agents/test/agent.md",
    name: "test",
    model: "opus",
    adapter: "claude-code",
    permissionMode: "acceptEdits",
    maxRetries: 1,
    skills: [],
    mcpServers: [],
    enabled: true,
    timeout: 300,
    approvalRequired: [],
    memory: false,
    memoryMaxEntries: 100,
    memoryTokenBudget: 1500,
    reflection: { enabled: false, schedule: "0 3 * * *", recurrenceThreshold: 3, proposeSkills: false },
    tags: [],
    avatar: "",
    body: "",
    contextBody: "",
    skillsBody: "",
    env: {},
    permissionRules: { allow: [], deny: [] },
    isFolder: true,
    heartbeatEnabled: false,
    heartbeatSchedule: "",
    heartbeatBody: "",
    heartbeatNotify: false,
    heartbeatChannel: "",
    heartbeatChannelTarget: "",
    ...overrides,
  };
}

describe("claudeSettings — settings.local.json lifecycle", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "claude-settings-test-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("returns null when the agent has nothing to install", () => {
    const agent = makeAgent({ permissionMode: "default" });
    const state = writeClaudeSettingsFile(cwd, agent);
    expect(state).toBeNull();
    expect(existsSync(join(cwd, ".claude", "settings.local.json"))).toBe(false);
  });

  it("writes defaultMode plus permissions allow/deny when set", () => {
    const agent = makeAgent({
      permissionMode: "acceptEdits",
      permissionRules: {
        allow: ["Read", "Bash(mv *)"],
        deny: ["Bash(rm -rf *)"],
      },
    });
    const state = writeClaudeSettingsFile(cwd, agent);
    expect(state).not.toBeNull();
    const written = JSON.parse(readFileSync(state!.path, "utf-8"));
    expect(written.defaultMode).toBe("acceptEdits");
    expect(written.permissions.allow).toEqual(["Read", "Bash(mv *)"]);
    expect(written.permissions.deny).toEqual(["Bash(rm -rf *)"]);
  });

  it("appends mcp__<server> entries to allow for the projected server list", () => {
    const agent = makeAgent({
      permissionRules: { allow: ["Read"], deny: [] },
    });
    const state = writeClaudeSettingsFile(cwd, agent, { mcpAllowServers: ["my server", "remember"] });
    const written = JSON.parse(readFileSync(state!.path, "utf-8"));
    expect(written.permissions.allow).toContain("mcp__my_server");
    expect(written.permissions.allow).toContain("mcp__remember");
  });

  it("writes a settings file with only the remember allow entry for a memory agent", () => {
    const agent = makeAgent({ permissionMode: "default", permissionRules: { allow: [], deny: [] } });
    const state = writeClaudeSettingsFile(cwd, agent, { mcpAllowServers: ["remember"] });
    expect(state).not.toBeNull();
    const written = JSON.parse(readFileSync(state!.path, "utf-8"));
    expect(written.permissions.allow).toEqual(["mcp__remember"]);
  });

  it("backs up an existing settings.local.json and restores it on cleanup", () => {
    const claudeDir = join(cwd, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    const path = join(claudeDir, "settings.local.json");
    writeFileSync(path, '{ "userOriginal": true }', "utf-8");

    const agent = makeAgent({
      permissionRules: { allow: ["Read"], deny: [] },
    });
    const state = writeClaudeSettingsFile(cwd, agent);
    expect(state!.backupContent).toBe('{ "userOriginal": true }');
    // Mid-spawn the file is ours
    expect(JSON.parse(readFileSync(path, "utf-8")).permissions).toBeDefined();

    restoreClaudeSettingsFile(state);
    // After cleanup the user's original is back, byte-for-byte
    expect(readFileSync(path, "utf-8")).toBe('{ "userOriginal": true }');
  });

  it("removes the file on cleanup when there was no backup", () => {
    const agent = makeAgent({
      permissionRules: { allow: ["Read"], deny: [] },
    });
    const state = writeClaudeSettingsFile(cwd, agent);
    expect(existsSync(state!.path)).toBe(true);
    restoreClaudeSettingsFile(state);
    expect(existsSync(state!.path)).toBe(false);
  });

  it("restoreClaudeSettingsFile is a no-op for null state", () => {
    expect(() => restoreClaudeSettingsFile(null)).not.toThrow();
  });
});
