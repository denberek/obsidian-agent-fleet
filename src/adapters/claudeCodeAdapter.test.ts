import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig, FleetSettings } from "../types";
import type { ExecBuildOptions } from "./types";
import {
  claudeCodeAdapter,
  extractClaudeTranscript,
  extractLimitHit,
  extractMcpServerErrors,
  extractStructuredOutput,
  isCodexShapedModel,
} from "./claudeCodeAdapter";

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
    piCliPath: "pi",
    defaultModel: "default",
    awsRegion: "us-east-1",
    maxConcurrentRuns: 2,
    maxRunBudgetUsd: 0,
    maxRunTurns: 0,
    claudeSandboxNetworkStrictAllowlist: false,
    claudeSandboxFilesystemDisabled: false,
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

describe("claudeCodeAdapter.buildExec — run limits and new flags", () => {
  it("omits every optional flag when nothing is configured", async () => {
    const inv = await claudeCodeAdapter.buildExec(makeBuildOptions());
    expect(inv.args).not.toContain("--max-budget-usd");
    expect(inv.args).not.toContain("--max-turns");
    expect(inv.args).not.toContain("--forward-subagent-text");
    expect(inv.args).not.toContain("--json-schema");
  });

  it("passes the spend and turn caps", async () => {
    const inv = await claudeCodeAdapter.buildExec(
      makeBuildOptions({ budgetUsd: 2.5, maxTurns: 30 }),
    );
    expect(inv.args[inv.args.indexOf("--max-budget-usd") + 1]).toBe("2.5");
    expect(inv.args[inv.args.indexOf("--max-turns") + 1]).toBe("30");
  });

  it("forwards subagent text only on the streaming path", async () => {
    // The CLI requires -p + stream-json + --verbose together, and we only pass
    // --verbose when streaming — so the flag must not leak into a plain -p run.
    const streamed = await claudeCodeAdapter.buildExec(
      makeBuildOptions({ forwardSubagentText: true, streaming: true }),
    );
    expect(streamed.args).toContain("--forward-subagent-text");

    const plain = await claudeCodeAdapter.buildExec(
      makeBuildOptions({ forwardSubagentText: true, streaming: false }),
    );
    expect(plain.args).not.toContain("--forward-subagent-text");
  });

  it("passes an output schema inline", async () => {
    const schema = '{"type":"object"}';
    const inv = await claudeCodeAdapter.buildExec(makeBuildOptions({ outputSchema: schema }));
    expect(inv.args[inv.args.indexOf("--json-schema") + 1]).toBe(schema);
  });
});

describe("extractLimitHit", () => {
  it("classifies budget and turn stops from the result subtype", () => {
    expect(extractLimitHit({ type: "result", subtype: "error_max_budget_usd" })).toBe("budget");
    expect(extractLimitHit({ type: "result", subtype: "error_max_turns" })).toBe("turns");
  });

  it("returns undefined for a normal result", () => {
    expect(extractLimitHit({ type: "result", subtype: "success" })).toBeUndefined();
    expect(extractLimitHit({ type: "result" })).toBeUndefined();
  });

  it("ignores non-result events and junk", () => {
    expect(extractLimitHit({ type: "assistant", subtype: "error_max_turns" })).toBeUndefined();
    expect(extractLimitHit(null)).toBeUndefined();
    expect(extractLimitHit("error_max_turns")).toBeUndefined();
  });

  it("only treats error_* subtypes as limit stops", () => {
    // Guards against a future informational subtype that merely mentions turns.
    expect(extractLimitHit({ type: "result", subtype: "turns_summary" })).toBeUndefined();
  });
});

describe("extractMcpServerErrors", () => {
  it("reads the init event's mcp_server_errors list", () => {
    expect(
      extractMcpServerErrors({
        type: "system",
        mcp_server_errors: [{ name: "github", error: "spawn ENOENT" }],
      }),
    ).toEqual([{ name: "github", message: "spawn ENOENT" }]);
  });

  it("tolerates shape drift rather than throwing inside the parse path", () => {
    expect(extractMcpServerErrors({ mcp_server_errors: ["linear"] })).toEqual([
      { name: "linear", message: "" },
    ]);
    expect(
      extractMcpServerErrors({ mcp_server_errors: [{ server: "notion", message: "401" }] }),
    ).toEqual([{ name: "notion", message: "401" }]);
    expect(extractMcpServerErrors({ mcp_server_errors: [null, 42, {}] })).toEqual([]);
  });

  it("returns empty when the field is absent (older CLIs)", () => {
    expect(extractMcpServerErrors({ type: "system" })).toEqual([]);
    expect(extractMcpServerErrors(null)).toEqual([]);
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
        modelUsage: {
          "claude-haiku-4-5": { inputTokens: 20, outputTokens: 2, costUSD: 0.0001 },
          "claude-opus-4-7": { inputTokens: 100, outputTokens: 20, contextWindow: 200000, costUSD: 0.12 },
        },
      }),
    ].join("\n");

    const parsed = claudeCodeAdapter.parseExecOutput(stdout, "", true);
    expect(parsed.outputText).toBe("Working on it.");
    expect(parsed.finalResult).toBe("Done.");
    expect(parsed.tokensUsed).toBe(130);
    expect(parsed.costUsd).toBe(0.12);
    expect(parsed.concreteModel).toBe("claude-opus-4-7");
  });

  it("falls back to stderr when stdout is empty", () => {
    const parsed = claudeCodeAdapter.parseExecOutput("", "spawn failed", true);
    expect(parsed.outputText).toBe("spawn failed");
  });

  it("extracts provider-validated structured output from the result event", () => {
    const value = { summary: "done", count: 3 };
    const stdout = JSON.stringify({
      type: "result",
      structured_output: value,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const parsed = claudeCodeAdapter.parseExecOutput(stdout, "", false);
    expect(parsed.structuredOutput).toEqual(value);
    expect(parsed.finalResult).toBe(JSON.stringify(value, null, 2));
    expect(extractStructuredOutput({ type: "result", structured_output: null })).toBeNull();
  });

  it("reconstructs nested subagent output with bounded depth prefixes", () => {
    const stdout = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Top level" }, { type: "tool_use", id: "task-1", name: "Task" }] },
      }),
      JSON.stringify({
        type: "assistant",
        parent_tool_use_id: "task-1",
        message: { content: [{ type: "text", text: "Child work" }, { type: "tool_use", id: "task-2", name: "Task" }] },
      }),
      JSON.stringify({
        type: "assistant",
        parent_tool_use_id: "task-2",
        message: { content: [{ type: "thinking", thinking: "Nested thought" }, { type: "text", text: "Nested answer" }] },
      }),
    ].join("\n");

    const transcript = extractClaudeTranscript(stdout);
    expect(transcript).toContain("Top level");
    expect(transcript).toContain("↳ Subagent: Child work");
    expect(transcript).toContain("  ↳ Subagent thinking: Nested thought");
    expect(transcript).toContain("  ↳ Subagent: Nested answer");
  });

  it("rejects gated flags on a detected old Claude CLI", () => {
    expect(() => claudeCodeAdapter.buildExec(makeBuildOptions({
      budgetUsd: 1,
      settings: makeSettings({ claudeCliVersion: "2.1.216" }),
    }))).toThrow("does not support configured spend limits");
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
