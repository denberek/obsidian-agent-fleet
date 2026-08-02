import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "fs";
import type { AgentConfig, FleetSettings } from "../types";
import type { ExecBuildOptions } from "./types";
import {
  buildCodexExecArgs,
  codexAdapter,
  codexSandboxArgs,
  codexSupportsMaxEffort,
  isClaudeShapedModel,
  mapCodexEffort,
  newCodexTurnParseState,
  parseCodexChatEvent,
} from "./codexAdapter";

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    filePath: "_fleet/agents/test.md",
    name: "test",
    model: "",
    adapter: "codex",
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

describe("codexSandboxArgs", () => {
  it("maps Claude bypass/dontAsk and empty to --dangerously-bypass-approvals-and-sandbox", () => {
    expect(codexSandboxArgs("bypassPermissions")).toEqual(["--dangerously-bypass-approvals-and-sandbox"]);
    expect(codexSandboxArgs("dontAsk")).toEqual(["--dangerously-bypass-approvals-and-sandbox"]);
    expect(codexSandboxArgs("")).toEqual(["--dangerously-bypass-approvals-and-sandbox"]);
    expect(codexSandboxArgs(undefined)).toEqual(["--dangerously-bypass-approvals-and-sandbox"]);
  });

  it("maps plan/read-only to read-only sandbox", () => {
    expect(codexSandboxArgs("plan")).toEqual(["--sandbox", "read-only"]);
    expect(codexSandboxArgs("read-only")).toEqual(["--sandbox", "read-only"]);
  });

  it("maps acceptEdits/auto/default/workspace-write to workspace-write sandbox", () => {
    expect(codexSandboxArgs("acceptEdits")).toEqual(["--sandbox", "workspace-write"]);
    // `auto` is Claude's classifier-driven mode. It can't ask headlessly, so
    // it lands on the same sandbox as acceptEdits rather than on bypass.
    expect(codexSandboxArgs("auto")).toEqual(["--sandbox", "workspace-write"]);
    expect(codexSandboxArgs("default")).toEqual(["--sandbox", "workspace-write"]);
    expect(codexSandboxArgs("workspace-write")).toEqual(["--sandbox", "workspace-write"]);
  });
});

describe("mapCodexEffort", () => {
  it("maps the Claude scale onto the Codex scale", () => {
    expect(mapCodexEffort("")).toBe("");
    expect(mapCodexEffort("low")).toBe("low");
    expect(mapCodexEffort("medium")).toBe("medium");
    expect(mapCodexEffort("high")).toBe("high");
    expect(mapCodexEffort("xhigh")).toBe("xhigh");
    expect(mapCodexEffort("bogus")).toBe("");
  });

  it("emits `max` only on GPT-5.6 tiers, stepping down otherwise", () => {
    expect(mapCodexEffort("max", "gpt-5.6-sol")).toBe("max");
    expect(mapCodexEffort("max", "gpt-5.6-terra")).toBe("max");
    expect(mapCodexEffort("max", "gpt-5.6-luna")).toBe("max");
    // Older slugs reject `max`.
    expect(mapCodexEffort("max", "gpt-5.5")).toBe("xhigh");
    // Unknown model (Codex uses its own configured default) — stay safe.
    expect(mapCodexEffort("max")).toBe("xhigh");
    // Don't let a prefix collision through.
    expect(mapCodexEffort("max", "gpt-5.65-experimental")).toBe("xhigh");
  });

  it("degrades ultracode to xhigh (Claude-only concept)", () => {
    expect(mapCodexEffort("ultracode")).toBe("xhigh");
    expect(mapCodexEffort("ultracode", "gpt-5.6-sol")).toBe("xhigh");
  });

  it("passes through Codex-only `minimal` written directly in frontmatter", () => {
    expect(mapCodexEffort("minimal")).toBe("minimal");
  });
});

describe("codexSupportsMaxEffort", () => {
  it("recognizes the 5.6 family only", () => {
    expect(codexSupportsMaxEffort("gpt-5.6-sol")).toBe(true);
    expect(codexSupportsMaxEffort("GPT-5.6-TERRA")).toBe(true);
    expect(codexSupportsMaxEffort("gpt-5.6")).toBe(true);
    expect(codexSupportsMaxEffort("gpt-5.5")).toBe(false);
    expect(codexSupportsMaxEffort("gpt-5.65")).toBe(false);
    expect(codexSupportsMaxEffort("")).toBe(false);
  });
});

describe("isClaudeShapedModel", () => {
  it("recognizes aliases and claude/anthropic ids", () => {
    expect(isClaudeShapedModel("opus")).toBe(true);
    expect(isClaudeShapedModel("sonnet")).toBe(true);
    expect(isClaudeShapedModel("haiku")).toBe(true);
    expect(isClaudeShapedModel("claude-opus-5")).toBe(true);
    expect(isClaudeShapedModel("us.anthropic.claude-opus-5")).toBe(true);
    expect(isClaudeShapedModel("gpt-5.5")).toBe(false);
    expect(isClaudeShapedModel("gpt-5.6-sol")).toBe(false);
    expect(isClaudeShapedModel("")).toBe(false);
  });

  it("recognizes the fable alias so it can't leak into a Codex run", () => {
    // Regression: `fable` was missing from the alias branch, so a plugin-wide
    // defaultModel of "fable" sailed past the guard and reached `codex -m`.
    expect(isClaudeShapedModel("fable")).toBe(true);
    expect(isClaudeShapedModel("FABLE")).toBe(true);
  });
});

describe("buildCodexExecArgs", () => {
  it("builds the base invocation with the prompt on stdin", () => {
    const { args, stdinPayload } = buildCodexExecArgs(makeBuildOptions());
    expect(args[0]).toBe("exec");
    expect(args).toContain("--json");
    expect(args).toContain("--skip-git-repo-check");
    expect(args[args.length - 1]).toBe("-");
    expect(stdinPayload).toBe("do the thing");
  });

  it("passes an explicit model and mapped effort", () => {
    const { args } = buildCodexExecArgs(
      makeBuildOptions({ model: "gpt-5.5", modelSource: "agent", effort: "max" }),
    );
    expect(args).toContain("-m");
    expect(args[args.indexOf("-m") + 1]).toBe("gpt-5.5");
    expect(args).toContain('model_reasoning_effort="xhigh"');
  });

  it("drops a Claude-shaped model inherited from plugin settings", () => {
    const { args } = buildCodexExecArgs(
      makeBuildOptions({ model: "opus", modelSource: "settings" }),
    );
    expect(args).not.toContain("-m");
  });

  it("keeps a Claude-shaped model the user set explicitly on the agent", () => {
    const { args } = buildCodexExecArgs(
      makeBuildOptions({ model: "opus", modelSource: "agent" }),
    );
    expect(args[args.indexOf("-m") + 1]).toBe("opus");
  });

  it("inserts the resume subcommand before the prompt positional", () => {
    const { args } = buildCodexExecArgs(
      makeBuildOptions({ resumeSessionId: "thread-123" }),
    );
    const resumeIdx = args.indexOf("resume");
    expect(resumeIdx).toBeGreaterThan(0);
    expect(args[resumeIdx + 1]).toBe("thread-123");
    expect(args[resumeIdx + 2]).toBe("-");
    expect(args[args.length - 1]).toBe("-");
  });

  it("adds no MCP overrides itself — server projection is appended at run time", () => {
    const { args } = buildCodexExecArgs(makeBuildOptions({ agent: makeAgent({ mcpServers: ["notion"] }) }));
    expect(args.join(" ")).not.toContain("mcp_servers");
  });
});

describe("codexAdapter.buildExec — structured output", () => {
  it("writes the schema to a temporary file and cleans it up", async () => {
    const invocation = await codexAdapter.buildExec(
      makeBuildOptions({ outputSchema: '{"type":"object"}' }),
    );
    const schemaIndex = invocation.args.indexOf("--output-schema");
    expect(schemaIndex).toBeGreaterThan(0);
    const schemaPath = invocation.args[schemaIndex + 1];
    expect(schemaPath && existsSync(schemaPath)).toBe(true);
    invocation.cleanup?.();
    expect(schemaPath && existsSync(schemaPath)).toBe(false);
  });
});

describe("codexAdapter.parseExecOutput", () => {
  const fixture = [
    JSON.stringify({ type: "thread.started", thread_id: "t-42" }),
    JSON.stringify({ type: "turn.started" }),
    JSON.stringify({
      type: "item.started",
      item: { id: "i1", type: "command_execution", command: "ls -la", status: "in_progress" },
    }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "i1", type: "command_execution", command: "ls -la", exit_code: 0, status: "completed" },
    }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "i2", type: "mcp_tool_call", server: "notion", tool: "search", status: "completed" },
    }),
    JSON.stringify({
      type: "item.completed",
      item: { id: "i3", type: "agent_message", text: "All done. Found 3 files." },
    }),
    JSON.stringify({
      type: "turn.completed",
      usage: { input_tokens: 1200, cached_input_tokens: 800, output_tokens: 50, reasoning_output_tokens: 10 },
    }),
  ].join("\n");

  it("extracts output, final result, tools, tokens, and the thread id", () => {
    const parsed = codexAdapter.parseExecOutput(fixture, "", true);
    expect(parsed.outputText).toBe("All done. Found 3 files.");
    expect(parsed.finalResult).toBe("All done. Found 3 files.");
    expect(parsed.tokensUsed).toBe(1250); // input + output (cached/reasoning are subsets)
    expect(parsed.costUsd).toBeUndefined(); // codex reports no dollar cost
    expect(parsed.sessionId).toBe("t-42");
    expect(parsed.toolsUsed).toEqual([
      { tool: "shell", command: "ls -la" },
      { tool: "mcp__notion__search" },
    ]);
  });

  it("surfaces turn.failed errors when no message was produced", () => {
    const failed = [
      JSON.stringify({ type: "thread.started", thread_id: "t-9" }),
      JSON.stringify({ type: "turn.failed", error: { message: "model overloaded" } }),
    ].join("\n");
    const parsed = codexAdapter.parseExecOutput(failed, "", true);
    expect(parsed.outputText).toBe("model overloaded");
    expect(parsed.finalResult).toBeUndefined();
  });

  it("parses a schema-bound final agent message as JSON data", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "t-json" }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "json", type: "agent_message", text: '{"ok":true,"items":[1,2]}' },
      }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }),
    ].join("\n");
    expect(codexAdapter.parseExecOutput(stdout, "", true).structuredOutput).toEqual({
      ok: true,
      items: [1, 2],
    });
  });

  it("falls back to stderr when nothing parseable arrived", () => {
    const parsed = codexAdapter.parseExecOutput("", "codex: command failed", true);
    expect(parsed.outputText).toBe("codex: command failed");
  });

  describe("parse-failure logging", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("does not warn about non-JSON noise mixed with valid JSONL events", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const stdout = [
        "codex banner text",
        JSON.stringify({ type: "item.completed", item: { id: "i1", type: "agent_message", text: "hi" } }),
      ].join("\n");
      const parsed = codexAdapter.parseExecOutput(stdout, "", true);
      expect(parsed.outputText).toBe("hi");
      expect(warn).not.toHaveBeenCalled();
    });

    it("warns when non-empty stdout contained no parseable JSONL event", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const parsed = codexAdapter.parseExecOutput("plain text output\nstill not json", "", true);
      expect(parsed.outputText).toBe("(no output)");
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0]?.[0]);
      expect(message).toContain("no parseable JSONL event");
      expect(message).toContain("plain text output");
    });

    it("does not warn on empty stdout", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      codexAdapter.parseExecOutput("", "codex: command failed", true);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe("codexAdapter.extractStreamChunk", () => {
  it("emits agent message text on item.completed", () => {
    const line = JSON.stringify({
      type: "item.completed",
      item: { id: "i1", type: "agent_message", text: "hello" },
    });
    expect(codexAdapter.extractStreamChunk(line)).toBe("hello");
  });

  it("emits a tool marker on item.started", () => {
    const line = JSON.stringify({
      type: "item.started",
      item: { id: "i1", type: "command_execution", command: "npm test" },
    });
    expect(codexAdapter.extractStreamChunk(line)).toContain("▸ shell: npm test");
  });

  it("ignores non-JSON and irrelevant events", () => {
    expect(codexAdapter.extractStreamChunk("not json")).toBeNull();
    expect(codexAdapter.extractStreamChunk(JSON.stringify({ type: "turn.started" }))).toBeNull();
  });
});

describe("parseCodexChatEvent", () => {
  it("captures the thread id as a session signal", () => {
    const state = newCodexTurnParseState();
    const signals = parseCodexChatEvent({ type: "thread.started", thread_id: "t-7" }, state);
    expect(signals).toEqual([{ kind: "session", sessionId: "t-7" }]);
  });

  it("emits only the unseen suffix when agent_message text grows across updates", () => {
    const state = newCodexTurnParseState();
    const first = parseCodexChatEvent(
      { type: "item.updated", item: { id: "m1", type: "agent_message", text: "Hello" } },
      state,
    );
    const second = parseCodexChatEvent(
      { type: "item.completed", item: { id: "m1", type: "agent_message", text: "Hello world" } },
      state,
    );
    expect(first).toEqual([{ kind: "text", text: "Hello" }]);
    expect(second).toEqual([{ kind: "text", text: " world" }]);
    // Re-delivery of the same final text emits nothing further.
    const third = parseCodexChatEvent(
      { type: "item.completed", item: { id: "m1", type: "agent_message", text: "Hello world" } },
      state,
    );
    expect(third).toEqual([]);
  });

  it("emits tool signals only on item.started", () => {
    const state = newCodexTurnParseState();
    const started = parseCodexChatEvent(
      { type: "item.started", item: { id: "c1", type: "command_execution", command: "git status" } },
      state,
    );
    const completed = parseCodexChatEvent(
      { type: "item.completed", item: { id: "c1", type: "command_execution", command: "git status" } },
      state,
    );
    expect(started).toEqual([{ kind: "tool", toolName: "shell", command: "git status" }]);
    expect(completed).toEqual([]);
  });

  it("emits usage from turn.completed", () => {
    const state = newCodexTurnParseState();
    const signals = parseCodexChatEvent(
      { type: "turn.completed", usage: { input_tokens: 900, cached_input_tokens: 100, output_tokens: 40 } },
      state,
    );
    expect(signals).toEqual([{ kind: "usage", contextTokens: 900, totalTokens: 940 }]);
  });

  it("emits turn-failed and stream errors", () => {
    const state = newCodexTurnParseState();
    expect(parseCodexChatEvent({ type: "turn.failed", error: { message: "boom" } }, state)).toEqual([
      { kind: "turn-failed", message: "boom" },
    ]);
    expect(parseCodexChatEvent({ type: "error", message: "broken pipe" }, state)).toEqual([
      { kind: "error", message: "broken pipe" },
    ]);
  });
});
