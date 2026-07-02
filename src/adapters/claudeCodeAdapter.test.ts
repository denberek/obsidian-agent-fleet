import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig, FleetSettings } from "../types";
import type { ExecBuildOptions } from "./types";
import { claudeCodeAdapter, isCodexShapedModel } from "./claudeCodeAdapter";

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    filePath: "_fleet/agents/test.md",
    name: "test",
    model: "",
    adapter: "claude-code",
    permissionMode: "bypassPermissions",
    maxRetries: 0,
    skills: [],
    mcpServers: [],
    enabled: true,
    timeout: 300,
    approvalRequired: [],
    memory: false,
    memoryMaxEntries: 50,
    memoryTokenBudget: 1500,
    reflection: { enabled: false, schedule: "0 3 * * *", recurrenceThreshold: 3, proposeSkills: false },
    tags: [],
    avatar: "",
    body: "You are a test agent.",
    contextBody: "",
    skillsBody: "",
    env: {},
    permissionRules: { allow: [], deny: [] },
    isFolder: false,
    heartbeatEnabled: false,
    heartbeatSchedule: "",
    heartbeatBody: "",
    heartbeatNotify: false,
    heartbeatChannel: "",
    heartbeatChannelTarget: "",
    ...overrides,
  };
}

function makeSettings(overrides: Partial<FleetSettings> = {}): FleetSettings {
  return {
    fleetFolder: "_fleet",
    claudeCliPath: "claude",
    codexCliPath: "codex",
    defaultModel: "default",
    awsRegion: "us-east-1",
    maxConcurrentRuns: 2,
    runLogRetentionDays: 30,
    catchUpMissedTasks: true,
    notificationLevel: "all",
    showStatusBar: true,
    mcpApiKeys: {},
    mcpTokens: {},
    channelCredentials: {},
    maxConcurrentChannelSessions: 5,
    channelIdleTimeoutMinutes: 15,
    channelRateLimitPerConversation: 20,
    channelRateLimitWindowMinutes: 5,
    chatWatchdogMinutes: 10,
    defaultFileHashes: {},
    ...overrides,
  };
}

function makeBuildOptions(overrides: Partial<ExecBuildOptions> = {}): ExecBuildOptions {
  return {
    prompt: "do the thing",
    model: "",
    modelSource: "cli-default",
    effort: "",
    agent: makeAgent(),
    settings: makeSettings(),
    streaming: true,
    ...overrides,
  };
}

describe("claudeCodeAdapter.buildExec", () => {
  it("builds the streaming invocation with -p (prompt via stdin) and verbose stream-json", async () => {
    const inv = await claudeCodeAdapter.buildExec(makeBuildOptions());
    expect(inv.cliPath).toBe("claude");
    expect(inv.args[0]).toBe("-p");
    expect(inv.args).toContain("stream-json");
    expect(inv.args).toContain("--verbose");
    expect(inv.args).not.toContain("do the thing");
    expect(inv.stdinPayload).toBe("do the thing");
  });

  it("uses plain json without --verbose when not streaming", async () => {
    const inv = await claudeCodeAdapter.buildExec(makeBuildOptions({ streaming: false }));
    expect(inv.args).toContain("json");
    expect(inv.args).not.toContain("--verbose");
  });

  it("passes model and effort flags", async () => {
    const inv = await claudeCodeAdapter.buildExec(
      makeBuildOptions({ model: "opus", modelSource: "agent", effort: "high" }),
    );
    expect(inv.args[inv.args.indexOf("--model") + 1]).toBe("opus");
    expect(inv.args[inv.args.indexOf("--effort") + 1]).toBe("high");
  });

  it("drops a Codex-shaped model inherited from plugin settings", async () => {
    const inv = await claudeCodeAdapter.buildExec(
      makeBuildOptions({ model: "gpt-5.5", modelSource: "settings" }),
    );
    expect(inv.args).not.toContain("--model");
  });

  it("defaults permission mode to bypassPermissions when unset or default", async () => {
    for (const mode of ["", "default"]) {
      const inv = await claudeCodeAdapter.buildExec(
        makeBuildOptions({ agent: makeAgent({ permissionMode: mode }) }),
      );
      expect(inv.args[inv.args.indexOf("--permission-mode") + 1]).toBe("bypassPermissions");
    }
    const inv = await claudeCodeAdapter.buildExec(
      makeBuildOptions({ agent: makeAgent({ permissionMode: "plan" }) }),
    );
    expect(inv.args[inv.args.indexOf("--permission-mode") + 1]).toBe("plan");
  });
});

describe("claudeCodeAdapter.parseExecOutput", () => {
  it("parses a streaming run down to result fields", () => {
    const stdout = [
      JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-4-7", session_id: "s1" }),
      JSON.stringify({
        type: "assistant",
        message: { model: "claude-opus-4-7", content: [{ type: "text", text: "Working on it." }] },
      }),
      JSON.stringify({
        type: "result",
        result: "Done.",
        total_cost_usd: 0.12,
        usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 5 },
        modelUsage: { "claude-opus-4-7": { inputTokens: 100, outputTokens: 20, contextWindow: 200000 } },
      }),
    ].join("\n");

    const parsed = claudeCodeAdapter.parseExecOutput(stdout, "", true);
    expect(parsed.outputText).toBe("Done.");
    expect(parsed.finalResult).toBe("Done.");
    expect(parsed.tokensUsed).toBe(130);
    expect(parsed.costUsd).toBe(0.12);
    expect(parsed.concreteModel).toBe("claude-opus-4-7");
  });

  it("falls back to stderr when stdout is empty", () => {
    const parsed = claudeCodeAdapter.parseExecOutput("", "spawn failed", true);
    expect(parsed.outputText).toBe("spawn failed");
  });

  describe("parse-failure logging", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("does not warn about non-JSON noise between valid stream events", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const stdout = [
        "Some CLI banner line",
        JSON.stringify({ type: "result", result: "Done.", usage: { input_tokens: 1, output_tokens: 1 } }),
      ].join("\n");
      const parsed = claudeCodeAdapter.parseExecOutput(stdout, "", true);
      expect(parsed.outputText).toBe("Done.");
      expect(warn).not.toHaveBeenCalled();
    });

    it("warns when a streaming run produced no parseable JSON event at all", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const parsed = claudeCodeAdapter.parseExecOutput("total garbage\nno json here", "", true);
      expect(parsed.outputText).toBe("(no output)");
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain("no parseable JSON event");
      expect(message).toContain("total garbage");
    });

    it("warns when non-streaming whole-stdout JSON fails to parse", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const parsed = claudeCodeAdapter.parseExecOutput('{"result": "truncat', "", false);
      expect(parsed.outputText).toBe("(no output)");
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain("failed to parse");
      expect(message).toContain('{"result": "truncat');
    });

    it("does not warn on empty stdout", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      claudeCodeAdapter.parseExecOutput("", "spawn failed", true);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe("isCodexShapedModel", () => {
  it("recognizes gpt/codex ids and nothing else", () => {
    expect(isCodexShapedModel("gpt-5.5")).toBe(true);
    expect(isCodexShapedModel("gpt-5.3-codex")).toBe(true);
    expect(isCodexShapedModel("opus")).toBe(false);
    expect(isCodexShapedModel("claude-opus-4-7")).toBe(false);
  });
});
