import { describe, expect, it } from "vitest";
import type { AgentConfig, FleetSettings } from "../types";
import type { ExecBuildOptions } from "./types";
import {
  buildCodexExecArgs,
  codexAdapter,
  codexSandboxArgs,
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

  it("maps acceptEdits/default/workspace-write to workspace-write sandbox", () => {
    expect(codexSandboxArgs("acceptEdits")).toEqual(["--sandbox", "workspace-write"]);
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
    expect(mapCodexEffort("max")).toBe("xhigh");
    expect(mapCodexEffort("xhigh")).toBe("xhigh");
    expect(mapCodexEffort("bogus")).toBe("");
  });
});

describe("isClaudeShapedModel", () => {
  it("recognizes aliases and claude/anthropic ids", () => {
    expect(isClaudeShapedModel("opus")).toBe(true);
    expect(isClaudeShapedModel("sonnet")).toBe(true);
    expect(isClaudeShapedModel("claude-opus-4-7")).toBe(true);
    expect(isClaudeShapedModel("us.anthropic.claude-opus-4-7")).toBe(true);
    expect(isClaudeShapedModel("gpt-5.5")).toBe(false);
    expect(isClaudeShapedModel("")).toBe(false);
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

  it("falls back to stderr when nothing parseable arrived", () => {
    const parsed = codexAdapter.parseExecOutput("", "codex: command failed", true);
    expect(parsed.outputText).toBe("codex: command failed");
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
