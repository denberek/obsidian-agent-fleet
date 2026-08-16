import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import type { AgentConfig, FleetSettings } from "../types";
import type { ExecBuildOptions } from "./types";
import { getAdapter, normalizeAdapter } from "./index";
import {
  buildPiExecArgs,
  describePiToolCall,
  mapPiThinking,
  piAdapter,
  piToolsArgs,
  resetPiAdapterWarnings,
} from "./piAdapter";
import {
  renderPiGateExtension,
  translatePiGateRules,
  writePiExtensions,
} from "./piExtensions";

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    filePath: "_fleet/agents/test.md",
    name: "test",
    model: "",
    adapter: "pi",
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

/** One assistant message_end event in Pi's `--mode json` shape. */
function assistantEnd(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-opus-5",
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
      },
      stopReason: "stop",
      timestamp: 1,
      ...overrides,
    },
  });
}

afterEach(() => {
  resetPiAdapterWarnings();
  vi.restoreAllMocks();
});

describe("adapter registration", () => {
  it("normalizes pi spellings and keeps the claude-code fallback", () => {
    expect(normalizeAdapter("pi")).toBe("pi");
    expect(normalizeAdapter("Pi")).toBe("pi");
    expect(normalizeAdapter("pi-coding-agent")).toBe("pi");
    expect(normalizeAdapter("codex")).toBe("codex");
    expect(normalizeAdapter("something-else")).toBe("claude-code");
  });

  it("resolves the pi adapter", () => {
    expect(getAdapter("pi")).toBe(piAdapter);
    expect(getAdapter("pi").label).toBe("Pi");
  });
});

describe("mapPiThinking", () => {
  it("passes the shared scale through and maps ultracode to max", () => {
    expect(mapPiThinking("low")).toBe("low");
    expect(mapPiThinking("xhigh")).toBe("xhigh");
    expect(mapPiThinking("max")).toBe("max");
    expect(mapPiThinking("minimal")).toBe("minimal");
    expect(mapPiThinking("ultracode")).toBe("max");
    expect(mapPiThinking("")).toBe("");
    expect(mapPiThinking("bogus")).toBe("");
  });
});

describe("piToolsArgs", () => {
  it("restricts plan/read-only to the read-only tool set", () => {
    expect(piToolsArgs("plan")).toEqual(["--tools", "read,grep,find,ls"]);
    expect(piToolsArgs("read-only")).toEqual(["--tools", "read,grep,find,ls"]);
  });

  it("leaves every other mode on the full default tool set", () => {
    expect(piToolsArgs("bypassPermissions")).toEqual([]);
    expect(piToolsArgs("acceptEdits")).toEqual([]);
    expect(piToolsArgs("workspace-write")).toEqual([]);
    expect(piToolsArgs("")).toEqual([]);
    expect(piToolsArgs(undefined)).toEqual([]);
  });
});

describe("buildPiExecArgs", () => {
  it("builds a headless JSON invocation with the prompt on stdin", () => {
    const { args, stdinPayload } = buildPiExecArgs(makeBuildOptions());
    expect(args).toEqual(["-p", "--mode", "json", "--no-approve"]);
    expect(stdinPayload).toBe("do the thing");
  });

  it("passes BOTH Claude-shaped and GPT-shaped models through, even from settings", () => {
    // Pi is multi-provider: the cross-vendor guard the other adapters apply to
    // a plugin-wide default deliberately does not exist here.
    const claude = buildPiExecArgs(makeBuildOptions({ model: "opus", modelSource: "settings" }));
    expect(claude.args).toContain("opus");
    const gpt = buildPiExecArgs(makeBuildOptions({ model: "gpt-5.6-terra", modelSource: "settings" }));
    expect(gpt.args).toContain("gpt-5.6-terra");
    const qualified = buildPiExecArgs(makeBuildOptions({ model: "anthropic/claude-opus-5" }));
    expect(qualified.args).toContain("anthropic/claude-opus-5");
  });

  it("maps effort onto --thinking", () => {
    const { args } = buildPiExecArgs(makeBuildOptions({ effort: "xhigh" }));
    const i = args.indexOf("--thinking");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("xhigh");
  });

  it("degrades ultracode to max thinking", () => {
    const { args } = buildPiExecArgs(makeBuildOptions({ effort: "ultracode" }));
    const i = args.indexOf("--thinking");
    expect(args[i + 1]).toBe("max");
  });

  it("restricts tools for plan mode", () => {
    const { args } = buildPiExecArgs(
      makeBuildOptions({ agent: makeAgent({ permissionMode: "plan" }) }),
    );
    const i = args.indexOf("--tools");
    expect(args[i + 1]).toBe("read,grep,find,ls");
  });

  it("resumes with --session-id", () => {
    const { args } = buildPiExecArgs(makeBuildOptions({ resumeSessionId: "abc-123" }));
    const i = args.indexOf("--session-id");
    expect(args[i + 1]).toBe("abc-123");
  });
});

describe("piAdapter.buildExec", () => {
  it("loads generated extensions for deny rules and schemas, and cleans up", async () => {
    const invocation = await piAdapter.buildExec(
      makeBuildOptions({
        agent: makeAgent({ permissionRules: { allow: [], deny: ["Bash(git push *)"] } }),
        outputSchema: '{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}',
      }),
    );
    const extFlags = invocation.args.filter((a) => a === "--extension");
    expect(extFlags).toHaveLength(2);
    const paths = invocation.args.filter((a) => a.endsWith(".ts"));
    expect(paths).toHaveLength(2);
    for (const p of paths) expect(existsSync(p)).toBe(true);
    const gate = paths.find((p) => p.includes("af-gate"))!;
    expect(readFileSync(gate, "utf-8")).toContain('[["git","push"]]');
    const schema = paths.find((p) => p.includes("af-structured-output"))!;
    expect(readFileSync(schema, "utf-8")).toContain('"required":["ok"]');

    // Dedicated-root + pid-marker convention (shared with the MCP overlays)
    // so the stale-dir sweep's liveness guard protects a live session's dirs.
    const extDir = dirname(gate);
    expect(extDir).toContain(join(tmpdir(), "agent-fleet-pi", "ext-"));
    expect(readFileSync(join(extDir, ".af-pid"), "utf-8")).toBe(String(process.pid));

    invocation.cleanup?.();
    for (const p of paths) expect(existsSync(p)).toBe(false);
    expect(existsSync(extDir)).toBe(false);
  });

  it("needs no extensions for a plain run", async () => {
    const invocation = await piAdapter.buildExec(makeBuildOptions());
    expect(invocation.args).not.toContain("--extension");
    expect(invocation.cleanup).toBeUndefined();
    expect(invocation.cliPath).toBe("pi");
  });
});

describe("piAdapter.parseExecOutput", () => {
  it("parses session id, text, usage, cost, and the concrete model", () => {
    const stdout = [
      '{"type":"session","version":3,"id":"sess-1","timestamp":"t","cwd":"/x"}',
      '{"type":"agent_start"}',
      assistantEnd(),
      assistantEnd({ content: [{ type: "text", text: "world" }] }),
      '{"type":"agent_settled"}',
    ].join("\n");

    const parsed = piAdapter.parseExecOutput(stdout, "", true);
    expect(parsed.sessionId).toBe("sess-1");
    expect(parsed.outputText).toBe("hello\n\nworld");
    expect(parsed.finalResult).toBe("world");
    expect(parsed.tokensUsed).toBe(30);
    expect(parsed.costUsd).toBeCloseTo(0.006);
    expect(parsed.concreteModel).toBe("claude-opus-5");
  });

  it("collects tool calls and extracts structured output from the terminating tool", () => {
    const stdout = [
      assistantEnd({
        content: [
          { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls -la" } },
        ],
      }),
      assistantEnd({
        content: [
          { type: "toolCall", id: "t2", name: "structured_output", arguments: { ok: true } },
        ],
      }),
    ].join("\n");

    const parsed = piAdapter.parseExecOutput(stdout, "", true);
    expect(parsed.toolsUsed).toEqual([
      { tool: "bash", command: "ls -la" },
      { tool: "structured_output", command: undefined },
    ]);
    expect(parsed.structuredOutput).toEqual({ ok: true });
  });

  it("surfaces provider errors from stopReason and flags the run as failed", () => {
    const stdout = assistantEnd({
      content: [],
      stopReason: "error",
      errorMessage: "UnrecognizedClientException: bad token",
    });
    const parsed = piAdapter.parseExecOutput(stdout, "", true);
    expect(parsed.outputText).toContain("UnrecognizedClientException");
    expect(parsed.errors).toEqual(["UnrecognizedClientException: bad token"]);
  });

  it("flags a text-then-error run as failed even though text streamed (exit code 0 shape)", () => {
    const stdout = [
      assistantEnd(),
      assistantEnd({ content: [], stopReason: "error", errorMessage: "rate limit exceeded" }),
    ].join("\n");
    const parsed = piAdapter.parseExecOutput(stdout, "", true);
    // The partial text is kept, but the failure is visible in the transcript
    // and the errors field fails the run despite the clean exit.
    expect(parsed.outputText).toContain("hello");
    expect(parsed.outputText).toContain("[provider error] rate limit exceeded");
    expect(parsed.errors).toEqual(["rate limit exceeded"]);
  });

  it("does not fail a run that recovered — a later message succeeds after an earlier error", () => {
    const stdout = [
      assistantEnd({ content: [], stopReason: "error", errorMessage: "overloaded, retrying" }),
      assistantEnd({ content: [{ type: "text", text: "recovered fine" }] }),
    ].join("\n");
    const parsed = piAdapter.parseExecOutput(stdout, "", true);
    expect(parsed.errors).toBeUndefined();
    expect(parsed.outputText).not.toContain("[provider error]");
    expect(parsed.finalResult).toBe("recovered fine");
  });

  it("warns when non-empty output contains no JSONL event at all", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const parsed = piAdapter.parseExecOutput("plain text, not JSON", "", true);
    expect(parsed.outputText).toBe("(no output)");
    expect(warn).toHaveBeenCalled();
  });
});

describe("piAdapter.extractStreamChunk", () => {
  it("streams text deltas", () => {
    const line = JSON.stringify({
      type: "message_update",
      usage: {},
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hel" },
    });
    expect(piAdapter.extractStreamChunk(line)).toBe("Hel");
  });

  it("marks tool executions", () => {
    const line = JSON.stringify({
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "bash",
      args: { command: "git status" },
    });
    expect(piAdapter.extractStreamChunk(line)).toBe("\n▸ bash: git status\n");
  });

  it("surfaces per-message provider errors", () => {
    const line = assistantEnd({ content: [], stopReason: "error", errorMessage: "boom" });
    expect(piAdapter.extractStreamChunk(line)).toBe("\n✖ boom\n");
  });

  it("ignores thinking deltas and noise", () => {
    const thinking = JSON.stringify({
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "hmm" },
    });
    expect(piAdapter.extractStreamChunk(thinking)).toBeNull();
    expect(piAdapter.extractStreamChunk("not json")).toBeNull();
  });
});

describe("describePiToolCall", () => {
  it("pulls a displayable command from common argument names", () => {
    expect(
      describePiToolCall({ type: "toolCall", name: "bash", arguments: { command: "ls" } }),
    ).toEqual({ tool: "bash", command: "ls" });
    expect(
      describePiToolCall({ type: "toolCall", name: "read", arguments: { path: "a.md" } }),
    ).toEqual({ tool: "read", command: "a.md" });
    expect(describePiToolCall({ type: "text", text: "x" })).toBeNull();
  });
});

describe("translatePiGateRules", () => {
  it("translates deny Bash prefixes, drops what the gate can't express, ignores allow rules", () => {
    const agent = makeAgent({
      permissionRules: {
        // The gate is deny-only — allow rules are never translated or warned.
        allow: ["Bash(git status *)", "Read"],
        deny: ["Bash(rm -rf *)", "Bash(* --force)", "WebFetch", "mcp__github__push"],
      },
    });
    const { deny, dropped } = translatePiGateRules(agent);
    expect(deny).toEqual([["rm", "-rf"]]);
    // WebFetch (tool-name) and the mid-pattern wildcard drop with reasons;
    // the mcp__ entry is silently the projection's job.
    expect(dropped).toHaveLength(2);
    expect(dropped.map((d) => d.rule)).toEqual(["Bash(* --force)", "WebFetch"]);
  });
});

describe("renderPiGateExtension", () => {
  it("embeds deny prefixes and blocks on prefix match semantics", () => {
    const src = renderPiGateExtension([["rm", "-rf"]], "test");
    expect(src).toContain('[["rm","-rf"]]');
    expect(src).toContain("block: true");
    expect(src).toContain('event.toolName !== "bash"');
  });
});

describe("writePiExtensions", () => {
  it("returns null when nothing is needed", () => {
    expect(writePiExtensions({ agent: makeAgent() })).toBeNull();
  });

  it("reports dropped rules even when no gate is generated", () => {
    const result = writePiExtensions({
      agent: makeAgent({ permissionRules: { allow: [], deny: ["Read"] } }),
    });
    expect(result).not.toBeNull();
    expect(result!.paths).toEqual([]);
    expect(result!.droppedRules).toHaveLength(1);
  });
});
