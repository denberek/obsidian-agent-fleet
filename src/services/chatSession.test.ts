import { describe, expect, it, vi } from "vitest";
import { ChatSession } from "./chatSession";
import { resetPiAdapterWarnings } from "../adapters/piAdapter";
import { ExecutionManager } from "./executionManager";
import type { AgentConfig, FleetSettings, SkillConfig, TaskConfig, WorkingMemory } from "../types";
import type { FleetRepository } from "../fleetRepository";
import { MEMORY_CAPTURE_INSTRUCTION } from "../utils/memoryFormat";

// ChatSession imports Vault from "obsidian" (type-only, erased at runtime) and
// uses TFile/normalizePath which the test stub provides. We don't drive any
// network/process code here — only exercise getChatFilePath and buildBasePrompt
// via bracket access since both are private.

// Fake ChildProcess factory for the spawnCli mock below (Pi RPC lifecycle
// tests). Hoisted because vi.mock factories run before module init.
const fakeSpawn = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;
  interface FakeProc {
    listeners: Record<string, Listener>;
    written: string[];
    killed: boolean;
    stdout: { on(ev: string, fn: Listener): void; removeListener(ev: string, fn: Listener): void };
    stderr: { on(ev: string, fn: Listener): void; removeListener(ev: string, fn: Listener): void };
    stdin: { write(s: string): boolean };
    on(ev: string, fn: Listener): void;
    removeListener(ev: string, fn: Listener): void;
    kill(): boolean;
  }
  const procs: FakeProc[] = [];
  function make(): FakeProc {
    const proc: FakeProc = {
      listeners: {},
      written: [],
      killed: false,
      stdout: { on: () => undefined, removeListener: () => undefined },
      stderr: { on: () => undefined, removeListener: () => undefined },
      stdin: { write: (s: string) => (proc.written.push(s), true) },
      on: (ev, fn) => {
        proc.listeners[ev] = fn;
      },
      removeListener: () => undefined,
      kill: () => ((proc.killed = true), true),
    };
    procs.push(proc);
    return proc;
  }
  return { procs, make };
});

vi.mock("../utils/platform", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../utils/platform")>();
  const spawnCli = (() => fakeSpawn.make()) as unknown as typeof mod.spawnCli;
  return { ...mod, spawnCli };
});

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    filePath: "_fleet/agents/test-agent.md",
    name: "test-agent",
    description: "An agent for testing",
    model: "default",
    adapter: "claude-code",
    permissionMode: "bypassPermissions",
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
    body: "You are a helpful test agent.",
    contextBody: "",
    skillsBody: "",
    env: {},
    permissionRules: { allow: [], deny: [] },
    isFolder: false,
    heartbeatEnabled: false,
    heartbeatSchedule: "",
    heartbeatBody: "",
    heartbeatNotify: true,
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

function makeRepositoryStub(latestAgent?: AgentConfig | null): FleetRepository {
  return {
    getMemoryPath: (agentName: string) => `_fleet/memory/${agentName}.md`,
    getSkillByName: () => undefined,
    getMemory: async () => null,
    getAgentByName: (_name: string) => latestAgent ?? undefined,
  } as unknown as FleetRepository;
}

const vaultStub = {} as never;

describe("ChatSession.getChatFilePath", () => {
  it("throws when no channel or in-app conversation options are provided", () => {
    // The legacy chat.json singleton path was removed — every chat session
    // must declare which conversation it belongs to. Callers that forget
    // this used to silently write to the legacy path; now we surface the
    // bug instead.
    const agent = makeAgent({ isFolder: false });
    const session = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub);
    expect(() =>
      (session as unknown as { getChatFilePath(): string }).getChatFilePath(),
    ).toThrow(/inAppConversationId/);
  });

  it("returns the nested channel session path when channelName+conversationId are set", () => {
    const agent = makeAgent();
    const session = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      channelName: "my-slack",
      conversationId: "slack:T1:C1:U1",
    });
    const path = (session as unknown as { getChatFilePath(): string }).getChatFilePath();
    // slugify drops colons -> "slack-t1-c1-u1"
    expect(path).toBe("_fleet/channels/my-slack/sessions/slack-t1-c1-u1.json");
  });

  it("in-app conversation lands under a per-agent conversations folder (flat agent)", () => {
    const agent = makeAgent({ isFolder: false, name: "pm-agent" });
    const session = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      inAppConversationId: "q4-planning",
    });
    const path = (session as unknown as { getChatFilePath(): string }).getChatFilePath();
    expect(path).toBe("_fleet/memory/pm-agent-conversations/q4-planning.json");
  });

  it("in-app conversation nests under the folder agent's directory", () => {
    const agent = makeAgent({
      isFolder: true,
      filePath: "_fleet/agents/site-monitor/agent.md",
      name: "site-monitor",
    });
    const session = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      inAppConversationId: "incident-2026-04-12",
    });
    const path = (session as unknown as { getChatFilePath(): string }).getChatFilePath();
    expect(path).toBe("_fleet/agents/site-monitor/conversations/incident-2026-04-12.json");
  });

  it("slugifies an in-app conversation id with unsafe characters", () => {
    const agent = makeAgent({ isFolder: false, name: "pm-agent" });
    const session = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      inAppConversationId: "Q4 planning / OKRs!",
    });
    const path = (session as unknown as { getChatFilePath(): string }).getChatFilePath();
    expect(path).toBe("_fleet/memory/pm-agent-conversations/q4-planning-okrs.json");
  });
});

describe("ChatSession.buildBasePrompt", () => {
  it("appends channel context at the end when provided", async () => {
    const agent = makeAgent({ body: "You are a helpful test agent." });
    const session = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      channelName: "my-slack",
      conversationId: "slack:T1:C1:U1",
      channelContext: "You are being contacted via Slack. Keep replies concise.",
    });
    const prompt = await (session as unknown as {
      buildBasePrompt(): Promise<string>;
    }).buildBasePrompt();

    // Channel context must be appended, not prepended, so the final section of
    // the prompt is the channel instructions.
    expect(prompt).toMatch(/You are a helpful test agent\./);
    expect(prompt.trim().endsWith(
      "## Channel Context\nYou are being contacted via Slack. Keep replies concise.",
    )).toBe(true);
    // Agent identity must come first.
    const identityIdx = prompt.indexOf("You are a helpful test agent.");
    const channelIdx = prompt.indexOf("## Channel Context");
    expect(identityIdx).toBeGreaterThanOrEqual(0);
    expect(channelIdx).toBeGreaterThan(identityIdx);
  });

  it("omits channel context when not provided (existing chat-panel behavior)", async () => {
    const agent = makeAgent();
    const session = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub);
    const prompt = await (session as unknown as {
      buildBasePrompt(): Promise<string>;
    }).buildBasePrompt();
    expect(prompt).not.toContain("## Channel Context");
  });
});

// ─── Characterization fixtures for the prompt-parity tests below.
//     Mirrors the fixtures in executionManager.test.ts (kept separate so the
//     two test files don't import each other's registered tests). ───

function makeTask(overrides: Partial<TaskConfig> = {}): TaskConfig {
  return {
    filePath: "_fleet/tasks/summarize.md",
    taskId: "summarize",
    agent: "test-agent",
    type: "recurring",
    priority: "medium",
    enabled: true,
    created: "2026-01-01",
    runCount: 0,
    catchUp: false,
    tags: [],
    body: "Summarize the news.",
    ...overrides,
  };
}

function makeSkill(): SkillConfig {
  return {
    filePath: "_fleet/skills/research.md",
    name: "research",
    tags: [],
    body: "Research things thoroughly.",
    toolsBody: "Use WebSearch.",
    referencesBody: "See RESEARCH.md.",
    examplesBody: "Example: find competitors.",
    isFolder: false,
  };
}

function makeWorkingMemory(): WorkingMemory {
  return {
    filePath: "_fleet/memory/test-agent.md",
    agent: "test-agent",
    schema: 2,
    tokenEstimate: 0,
    sections: [
      { name: "Preferences", entries: [{ text: "Prefers concise answers", pinned: true }] },
      {
        name: "Recent",
        entries: [{ text: "Deploy uses GitHub Actions", pinned: false, source: "run", date: "2026-06-30" }],
      },
    ],
  };
}

function makeKeeperAgent(): AgentConfig {
  return makeAgent({
    name: "wiki-keeper-acme",
    filePath: "_fleet/agents/wiki-keeper-acme.md",
    wikiKeeper: {
      scopeRoot: "Acme",
      inboxPath: "wiki/inbox",
      archivePath: "wiki/archive",
      failedPath: "wiki/failed",
      topicsRoot: "wiki/topics",
      indexPath: "wiki/index.md",
      logPath: "wiki/log.md",
      watchedFolders: [],
      excludePatterns: [],
      watchedSince: "",
      fileSubstantiveAnswers: false,
      obsidianUrlScheme: false,
      maxTokensPerIngest: 4000,
      maxTokensPerRefresh: 4000,
      dedupSimilarityThreshold: 0.8,
      summaryStaleDays: 30,
      indexSplitThreshold: 50,
      stateFile: ".wiki-state.json",
    },
  });
}

/** The fully-loaded agent used by the byte-exact characterization tests. */
function makeFullAgent(): AgentConfig {
  return makeAgent({
    skills: ["research"],
    skillsBody: "Custom agent skill notes.",
    contextBody: "Working on Project Apollo.",
    memory: true,
    wikiReferences: [{ agent: "wiki-keeper-acme" }],
  });
}

function makeFullRepoStub(): FleetRepository {
  const skills = [makeSkill()];
  const agents = [makeKeeperAgent()];
  const wm = makeWorkingMemory();
  return {
    getSkillByName: (name: string) => skills.find((s) => s.name === name),
    readWorkingMemory: async () => wm,
    getAgentByName: (name: string) => agents.find((a) => a.name === name),
  } as unknown as FleetRepository;
}

async function callBuildBasePrompt(session: ChatSession): Promise<string> {
  return (session as unknown as { buildBasePrompt(): Promise<string> }).buildBasePrompt();
}

// Characterization tests — they capture the CURRENT byte-exact prompt output of
// the chat path (and its parity with the one-shot run path) so the shared
// prompt-assembly extraction is provably behavior-preserving.
describe("ChatSession.buildBasePrompt — characterization / run-path parity", () => {
  it("base prompt + '## Task' framing is byte-identical to ExecutionManager.buildPrompt for the same agent", async () => {
    const repo = makeFullRepoStub();
    const agent = makeFullAgent();

    const session = new ChatSession(agent, makeSettings(), repo, vaultStub);
    const basePrompt = await callBuildBasePrompt(session);
    // sendMessage frames the first turn as `${basePrompt}\n\n## Task\n${messageText}`
    const chatFirstTurn = `${basePrompt}\n\n## Task\nSummarize the news.`;

    const manager = new ExecutionManager(makeSettings(), repo);
    const runPrompt = await manager.buildPrompt(agent, makeTask({ body: "Summarize the news." }));

    expect(chatFirstTurn).toBe(runPrompt);
  });

  it("fully-loaded agent with channel context: byte-exact section order (memory → channel → wiki)", async () => {
    const repo = makeFullRepoStub();
    const session = new ChatSession(makeFullAgent(), makeSettings(), repo, vaultStub, {
      channelName: "my-slack",
      conversationId: "slack:T1:C1:U1",
      channelContext: "You are being contacted via Slack.",
    });
    const prompt = await callBuildBasePrompt(session);

    // The channel-context section sits between memory and wiki access —
    // this exact ordering is load-bearing (captured pre-refactor).
    const memorySection =
      `## Memory\n${MEMORY_CAPTURE_INSTRUCTION}\n\n### What you've learned so far\n` +
      "## Preferences\n- [pin] Prefers concise answers\n\n" +
      "## Recent (uncurated)\n- Deploy uses GitHub Actions <!-- src:run 2026-06-30 -->";

    expect(prompt).toContain(
      `${memorySection}\n\n## Channel Context\nYou are being contacted via Slack.\n\n## Wiki Access\n`,
    );
    expect(prompt.startsWith("You are a helpful test agent.\n\n## Skill: research\n")).toBe(true);
  });

  it("thread mode section comes after wiki access (last section)", async () => {
    const repo = makeFullRepoStub();
    const agent = makeFullAgent();
    const parent = new ChatSession(agent, makeSettings(), repo, vaultStub);
    parent.messages = [
      { id: "m0", role: "user", content: "hi", timestamp: "t0" },
      { id: "m1", role: "assistant", content: "hello there", timestamp: "t1" },
    ];
    const thread = new ChatSession(agent, makeSettings(), repo, vaultStub, {
      threadAnchorId: "m1",
      parentSession: parent,
    });
    (thread as unknown as { threadAnchorIndex: number }).threadAnchorIndex = 1;

    const prompt = await callBuildBasePrompt(thread);

    const wikiIdx = prompt.indexOf("## Wiki Access");
    const threadIdx = prompt.indexOf("## Thread Mode");
    expect(wikiIdx).toBeGreaterThan(-1);
    expect(threadIdx).toBeGreaterThan(wikiIdx);
    // Replay content is exact: preamble, then a "## Conversation so far" replay.
    expect(prompt.endsWith(
      "## Thread Mode\n" +
        "You are continuing a side thread from this conversation. The user is " +
        "following up on one of your earlier replies and wants to explore " +
        "something specific without adding to the main thread. Your answers " +
        "here stay in this thread only and will NOT be added back to the " +
        "main conversation.\n\n" +
        "## Conversation so far\nUser: hi\nAssistant: hello there",
    )).toBe(true);
  });

  it("memory-enabled chat agent gets the memory section unconditionally (no chat-side suppression)", async () => {
    const repo = makeFullRepoStub();
    const session = new ChatSession(makeAgent({ memory: true }), makeSettings(), repo, vaultStub);
    const prompt = await callBuildBasePrompt(session);
    expect(prompt).toBe(
      "You are a helpful test agent.\n\n" +
        `## Memory\n${MEMORY_CAPTURE_INSTRUCTION}\n\n### What you've learned so far\n` +
        "## Preferences\n- [pin] Prefers concise answers\n\n" +
        "## Recent (uncurated)\n- Deploy uses GitHub Actions <!-- src:run 2026-06-30 -->",
    );
  });
});

describe("ChatSession.hibernate / clearSessionId", () => {
  it("hibernate refuses to run while a turn is streaming", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    session.isStreaming = true;
    // Should be a no-op — no throw, no state mutation.
    session.hibernate();
    expect(session.isStreaming).toBe(true);
  });

  it("clearSessionId wipes session id but keeps messages in memory", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    // Seed internal state via bracket access (private fields)
    (session as unknown as { claudeSessionId: string | null }).claudeSessionId = "sess-xyz";
    (session as unknown as { basePromptSent: boolean }).basePromptSent = true;
    session.messages = [
      { id: "m1", role: "user", content: "hi", timestamp: "2026-04-05T00:00:00Z" },
      { id: "m2", role: "assistant", content: "hello", timestamp: "2026-04-05T00:00:01Z" },
    ];

    session.clearSessionId();

    expect((session as unknown as { claudeSessionId: string | null }).claudeSessionId).toBeNull();
    expect((session as unknown as { basePromptSent: boolean }).basePromptSent).toBe(false);
    expect(session.messages).toHaveLength(2);
  });
});

describe("ChatSession.dispose — full teardown for conversation delete", () => {
  it("aborts every live thread sub-session and clears the in-memory map", () => {
    const parent = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    // Seed two pretend thread sub-sessions. We track abort() via spies on
    // bare ChatSession instances so dispose's iteration is observable
    // without standing up the full thread-fork machinery.
    const threadA = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    const threadB = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    let aborts = 0;
    threadA.abort = () => { aborts++; };
    threadB.abort = () => { aborts++; };
    const threads = (parent as unknown as { threads: Map<string, ChatSession> }).threads;
    threads.set("anchor-1", threadA);
    threads.set("anchor-2", threadB);
    (parent as unknown as { threadIndex: Record<string, unknown> }).threadIndex = {
      "anchor-1": { path: "x", createdAt: "", messageCount: 0, lastActive: "" },
    };

    parent.dispose();

    expect(aborts).toBe(2);
    expect(threads.size).toBe(0);
    expect((parent as unknown as { threadIndex: Record<string, unknown> }).threadIndex)
      .toEqual({});
  });

  it("safely no-ops when no threads are open (just aborts self)", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    // Confirm dispose() doesn't throw on the empty-threads path. abort() is
    // already exercised heavily elsewhere — we just want the wrapper to be
    // safe when there's nothing to iterate.
    expect(() => session.dispose()).not.toThrow();
  });
});

describe("ChatSession threading — path + preamble + fork", () => {
  it("thread file path sits in a threads/ sidecar next to parent chat.json", () => {
    const agent = makeAgent({
      isFolder: true,
      filePath: "_fleet/agents/orc/agent.md",
      name: "orc",
    });
    const parent = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      inAppConversationId: "main",
    });
    const path = parent.getThreadFilePath("anchor-123");
    expect(path).toBe("_fleet/agents/orc/conversations/main.threads/anchor-123.json");
  });

  it("thread file path for a flat agent uses conversations-folder sidecar", () => {
    const agent = makeAgent({ isFolder: false, name: "flat-agent" });
    const parent = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      inAppConversationId: "main",
    });
    const path = parent.getThreadFilePath("anchor-abc");
    expect(path).toBe("_fleet/memory/flat-agent-conversations/main.threads/anchor-abc.json");
  });

  it("buildBasePrompt on a thread appends Thread Mode + parent replay up to anchor", async () => {
    const agent = makeAgent({ body: "You are orc." });
    const parent = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub);
    parent.messages = [
      { id: "m0", role: "user", content: "hi", timestamp: "t0" },
      { id: "m1", role: "assistant", content: "hello there", timestamp: "t1" },
      { id: "m2", role: "user", content: "do X", timestamp: "t2" },
      { id: "m3", role: "assistant", content: "X done", timestamp: "t3" },
      { id: "m4", role: "user", content: "do Y later", timestamp: "t4" },
    ];
    const thread = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      threadAnchorId: "m3",
      parentSession: parent,
    });
    (thread as unknown as { threadAnchorIndex: number }).threadAnchorIndex = 3;

    const prompt = await (thread as unknown as {
      buildBasePrompt(): Promise<string>;
    }).buildBasePrompt();

    expect(prompt).toContain("## Thread Mode");
    expect(prompt).toContain("side thread");
    // Replay must include up to anchor m3 and NOT the later m4.
    expect(prompt).toContain("User: hi");
    expect(prompt).toContain("Assistant: hello there");
    expect(prompt).toContain("User: do X");
    expect(prompt).toContain("Assistant: X done");
    expect(prompt).not.toContain("do Y later");
  });

  it("openOrCreateThread rejects missing anchor ids", async () => {
    const agent = makeAgent();
    const parent = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub);
    parent.messages = [{ id: "m0", role: "user", content: "hi", timestamp: "t0" }];
    await expect(parent.openOrCreateThread("nonexistent")).rejects.toThrow(/not found in parent/);
  });

  it("openOrCreateThread rejects nested threading", async () => {
    const agent = makeAgent();
    const parent = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub);
    parent.messages = [{ id: "m0", role: "assistant", content: "hi", timestamp: "t0" }];
    const thread = new ChatSession(agent, makeSettings(), makeRepositoryStub(), vaultStub, {
      threadAnchorId: "m0",
      parentSession: parent,
    });
    await expect(thread.openOrCreateThread("m0")).rejects.toThrow(/Nested threads/);
  });

});

describe("ChatSession.updateStatsFromEvent", () => {
  function fire(session: ChatSession, event: Record<string, unknown>): void {
    (session as unknown as {
      updateStatsFromEvent(ev: Record<string, unknown>): void;
    }).updateStatsFromEvent(event);
  }

  it("captures concrete model from system init event", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    fire(session, {
      type: "system",
      subtype: "init",
      model: "claude-opus-4-7",
      session_id: "s1",
    });
    expect(session.getStats().concreteModel).toBe("claude-opus-4-7");
  });

  it("captures concrete model from assistant message.model", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    fire(session, {
      type: "assistant",
      message: { model: "claude-sonnet-4-6", content: [] },
    });
    expect(session.getStats().concreteModel).toBe("claude-sonnet-4-6");
  });

  it("sums context tokens from assistant usage (input + cache_read + cache_creation)", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    fire(session, {
      type: "assistant",
      message: {
        model: "claude-opus-4-7",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 1000,
          cache_creation_input_tokens: 200,
        },
      },
    });
    expect(session.getStats().contextTokensUsed).toBe(1300);
  });

  it("captures rate limit snapshot", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    fire(session, {
      type: "rate_limit_event",
      rate_limit_info: {
        status: "allowed",
        resetsAt: 1776661200,
        rateLimitType: "five_hour",
        isUsingOverage: false,
      },
    });
    const rl = session.getStats().rateLimit;
    expect(rl?.type).toBe("five_hour");
    expect(rl?.resetsAt).toBe(1776661200);
    expect(rl?.status).toBe("allowed");
    expect(rl?.isUsingOverage).toBe(false);
  });

  it("treats total_cost_usd as cumulative and accumulates per-turn deltas", () => {
    // Claude's `total_cost_usd` is the running session total, not the turn's
    // cost. costTotalUsd must track per-turn DELTAS, so two results reporting
    // cumulative 0.01 then 0.03 sum to 0.03 (the final cumulative), not 0.04.
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    fire(session, {
      type: "result",
      total_cost_usd: 0.01,
      modelUsage: { "claude-opus-4-7": { contextWindow: 200000, maxOutputTokens: 64000 } },
    });
    fire(session, { type: "result", total_cost_usd: 0.03 });
    const stats = session.getStats();
    expect(stats.costTotalUsd).toBeCloseTo(0.03, 8);
    expect(stats.contextWindow).toBe(200000);
    expect(stats.turnCount).toBe(2);
  });

  it("records per-turn cost deltas (not the cumulative total) to the usage ledger", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    const recorded: Array<{ costUsd?: number; totalTokens: number }> = [];
    session.setUsageRecorder((r) => recorded.push({ costUsd: r.costUsd, totalTokens: r.totalTokens }));

    fire(session, {
      type: "result",
      total_cost_usd: 0.01,
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 },
    });
    fire(session, {
      type: "result",
      total_cost_usd: 0.05, // cumulative → this turn cost 0.04
      usage: { input_tokens: 10, output_tokens: 200, cache_read_input_tokens: 1200, cache_creation_input_tokens: 0 },
    });

    expect(recorded).toHaveLength(2);
    expect(recorded[0]!.costUsd).toBeCloseTo(0.01, 8);
    expect(recorded[1]!.costUsd).toBeCloseTo(0.04, 8); // delta, not 0.05
    // Tokens stay per-turn (each turn's own usage), unaffected by the cost fix.
    expect(recorded[0]!.totalTokens).toBe(950);
    expect(recorded[1]!.totalTokens).toBe(1410);
  });

  it("notifies listeners on change", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    const seen: string[] = [];
    const unsub = session.onStatsChange((s) => {
      if (s.concreteModel) seen.push(s.concreteModel);
    });
    fire(session, { type: "assistant", message: { model: "claude-haiku-4-5", content: [] } });
    unsub();
    expect(seen).toContain("claude-haiku-4-5");
  });
});

describe("ChatSession.detachProcessListeners", () => {
  it("clears processListeners reference on abort", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    type SessionInternals = { processListeners: unknown | null };
    // Simulate having listeners attached (without actually spawning a process)
    (session as unknown as SessionInternals).processListeners = {
      onStdout: () => {},
      onStderr: () => {},
      onError: () => {},
      onClose: () => {},
    };
    session.abort();
    expect((session as unknown as SessionInternals).processListeners).toBeNull();
  });

  it("clears processListeners reference on hibernate", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    type SessionInternals = { processListeners: unknown | null };
    (session as unknown as SessionInternals).processListeners = {
      onStdout: () => {},
      onStderr: () => {},
      onError: () => {},
      onClose: () => {},
    };
    session.hibernate();
    expect((session as unknown as SessionInternals).processListeners).toBeNull();
  });
});

describe("ChatSession.handleStdout — partial-line buffer cap", () => {
  type StdoutInternals = { stdoutBuffer: string; handleStdout(chunk: string): void };

  it("keeps a small incomplete trailing line buffered", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    const s = session as unknown as StdoutInternals;
    s.handleStdout('{"type":"sys');
    expect(s.stdoutBuffer).toBe('{"type":"sys');
  });

  it("drops a pathological oversized partial line instead of buffering unboundedly", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    const s = session as unknown as StdoutInternals;
    // One giant chunk with no newline — must not be retained.
    s.handleStdout("x".repeat(10 * 1024 * 1024 + 1));
    expect(s.stdoutBuffer).toBe("");
    // Subsequent well-formed lines still parse (session id is captured).
    s.handleStdout('{"type":"system","session_id":"s-after-drop"}\n');
    expect(
      (session as unknown as { claudeSessionId: string | null }).claudeSessionId,
    ).toBe("s-after-drop");
  });
});

describe("ChatSession.handleProcessClose — streaming reset between turns", () => {
  it("resets streaming state even when no turn resolve is pending", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    type Internals = {
      pendingTurns: number;
      setStreaming(active: boolean): void;
      handleProcessClose(): void;
      turnResolve: unknown;
    };
    const s = session as unknown as Internals;
    // Simulate a wedged state: spinner on, no resolver to end the turn.
    s.setStreaming(true);
    s.pendingTurns = 1;
    expect(s.turnResolve).toBeNull();

    s.handleProcessClose();

    expect(session.isStreaming).toBe(false);
    expect(session.pendingTurnCount).toBe(0);
    expect(session.isProcessAlive).toBe(false);
  });
});

describe("ChatSession codex queue — failed follow-up start is reported, not silent", () => {
  it("emits an error event naming the dropped queued messages when startCodexTurn rejects", async () => {
    const session = new ChatSession(
      makeAgent({ adapter: "codex" }),
      makeSettings(),
      makeRepositoryStub(),
      vaultStub,
    );
    type Internals = {
      codexQueue: string[];
      pendingTurns: number;
      activeOnEvent: ((ev: { type: string; errorMessage?: string }) => void) | null;
      startCodexTurn(text: string): Promise<void>;
      handleTurnEnd(): void;
      turnReject: ((e: Error) => void) | null;
    };
    const s = session as unknown as Internals;
    const events: Array<{ type: string; errorMessage?: string }> = [];
    const rejections: Error[] = [];
    s.activeOnEvent = (ev) => events.push(ev);
    s.turnReject = (e) => rejections.push(e);
    s.codexQueue = ["queued follow-up", "second follow-up"];
    s.pendingTurns = 3;
    s.startCodexTurn = () => Promise.reject(new Error("spawn ENOENT"));

    s.handleTurnEnd();
    // Let the startCodexTurn rejection propagate through the catch handler.
    await new Promise((r) => setTimeout(r, 0));

    const errEvent = events.find((e) => e.type === "error");
    // Both the shifted message and the one still queued are reported.
    expect(errEvent?.errorMessage).toMatch(/dropping 2 queued messages/);
    expect(errEvent?.errorMessage).toContain("spawn ENOENT");
    // The turn promise still rejects (handleProcessError ran) and the queue
    // is cleared — no stale entries linger for the next turn.
    expect(rejections.map((e) => e.message)).toEqual(["spawn ENOENT"]);
    expect(s.codexQueue).toEqual([]);
    expect(session.isStreaming).toBe(false);
  });
});

describe("ChatSession.refreshAgent — picks up post-construction permission edits", () => {
  it("swaps in the latest AgentConfig from the repository when invoked", () => {
    const constructionTime = makeAgent({
      name: "wiki-keeper-acme",
      permissionMode: "default",
      permissionRules: { allow: [], deny: [] },
    });
    // Simulate the user editing the keeper after construction:
    // permission_mode flips to acceptEdits, allow list gains Bash(mv *).
    const afterEdit = makeAgent({
      name: "wiki-keeper-acme",
      permissionMode: "acceptEdits",
      permissionRules: { allow: ["Read", "Bash(mv *)"], deny: ["Bash(rm -rf *)"] },
    });
    const session = new ChatSession(
      constructionTime,
      makeSettings(),
      makeRepositoryStub(afterEdit),
      vaultStub,
    );
    expect(session.agent.permissionMode).toBe("default");
    (session as unknown as { refreshAgent(): void }).refreshAgent();
    expect(session.agent.permissionMode).toBe("acceptEdits");
    expect(session.agent.permissionRules.allow).toContain("Bash(mv *)");
    expect(session.agent.permissionRules.deny).toContain("Bash(rm -rf *)");
  });

  it("falls back to the construction-time agent when the agent has been deleted", () => {
    const original = makeAgent({ name: "deleted-agent", permissionMode: "acceptEdits" });
    // repository returns undefined → agent has been deleted from disk
    const session = new ChatSession(
      original,
      makeSettings(),
      makeRepositoryStub(null),
      vaultStub,
    );
    (session as unknown as { refreshAgent(): void }).refreshAgent();
    // Still the original — refresh is best-effort, not destructive
    expect(session.agent.permissionMode).toBe("acceptEdits");
    expect(session.agent.name).toBe("deleted-agent");
  });
});

describe("ChatSession.parseStreamEvents — message lifecycle and snapshot reconciliation", () => {
  function parse(session: ChatSession, event: Record<string, unknown>) {
    return (session as unknown as {
      parseStreamEvents(ev: Record<string, unknown>): Array<{
        type: string;
        content: string;
        toolName?: string;
        replace?: boolean;
      }>;
    }).parseStreamEvents(event);
  }

  function newSession(): ChatSession {
    return new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
  }

  it("emits assistant text when no deltas streamed", () => {
    const session = newSession();
    const out = parse(session, {
      type: "assistant",
      message: { content: [{ type: "text", text: "hello" }] },
    });
    expect(out).toEqual([
      { type: "message_start", content: "" },
      { type: "text", content: "hello" },
      { type: "message_stop", content: "" },
    ]);
  });

  it("unwraps stream_event and emits the inner text delta", () => {
    const session = newSession();
    const out = parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "par" } },
    });
    expect(out).toEqual([
      { type: "message_start", content: "" },
      { type: "text", content: "par" },
    ]);
  });

  it("does not render the reply twice when deltas already streamed it", () => {
    const session = newSession();
    expect(parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "hel" } },
    })).toEqual([
      { type: "message_start", content: "" },
      { type: "text", content: "hel" },
    ]);
    expect(parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } },
    })).toEqual([{ type: "text", content: "lo" }]);

    // The terminal assistant event repeats the whole message — swallow it.
    expect(parse(session, {
      type: "assistant",
      message: { content: [{ type: "text", text: "hello" }] },
    })).toEqual([]);
  });

  it("uses provider lifecycle events to separate messages in the same turn", () => {
    const session = newSession();
    parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "one" } },
    });
    parse(session, { type: "assistant", message: { content: [{ type: "text", text: "one" }] } });
    parse(session, { type: "stream_event", event: { type: "message_stop" } });
    // Second snapshot-only message must have its own boundaries.
    expect(parse(session, {
      type: "assistant",
      message: { content: [{ type: "text", text: "two" }] },
    })).toEqual([
      { type: "message_start", content: "" },
      { type: "text", content: "two" },
      { type: "message_stop", content: "" },
    ]);
  });

  it("still reports a tool_use that shares a message with suppressed text", () => {
    const session = newSession();
    parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "running" } },
    });
    const out = parse(session, {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "running" },
          { type: "tool_use", name: "Bash", input: { command: "ls" } },
        ],
      },
    });
    expect(out).toEqual([{ type: "tool_use", content: "ls", toolName: "Bash" }]);
  });

  it("suppresses only streamed text blocks, not a later unstreamed block", () => {
    const session = newSession();
    parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "first" } },
    });
    expect(parse(session, {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
      },
    })).toEqual([{ type: "text", content: "second" }]);
  });

  it("does not duplicate text when a thinking block shifts text from index 1 to snapshot position 0", () => {
    const session = newSession();
    expect(parse(session, {
      type: "stream_event",
      event: { type: "message_start" },
    })).toEqual([{ type: "message_start", content: "" }]);
    expect(parse(session, {
      type: "stream_event",
      event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    })).toEqual([]);
    expect(parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "draft" } },
    })).toEqual([{ type: "thinking", content: "draft" }]);
    expect(parse(session, {
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "draft" }] },
    })).toEqual([]);
    parse(session, {
      type: "stream_event",
      event: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    });
    expect(parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "OK" } },
    })).toEqual([{ type: "text", content: "OK" }]);
    // Claude omits thinking in this snapshot, so the text is now array
    // position 0. It is still the already-streamed provider block at index 1.
    expect(parse(session, {
      type: "assistant",
      message: { content: [{ type: "text", text: "OK" }] },
    })).toEqual([]);
  });

  it("keeps thinking ephemeral and accumulates the live Claude trace exactly once", () => {
    const session = newSession();
    type Internals = {
      turnResponseText: string;
      turnAssistantMessages: string[];
      activeOnEvent: ((event: { type: string; content: string }) => void) | null;
      parseStreamEvents(event: Record<string, unknown>): Array<{ type: string; content: string }>;
      dispatchStreamEvent(event: { type: string; content: string }): void;
    };
    const s = session as unknown as Internals;
    const forwarded: Array<{ type: string; content: string }> = [];
    s.activeOnEvent = (event) => forwarded.push(event);
    const trace = [
      { type: "stream_event", event: { type: "message_start" } },
      {
        type: "stream_event",
        event: { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      },
      {
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "draft" } },
      },
      { type: "assistant", message: { content: [{ type: "thinking", thinking: "draft" }] } },
      {
        type: "stream_event",
        event: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      },
      {
        type: "stream_event",
        event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "OK" } },
      },
      { type: "assistant", message: { content: [{ type: "text", text: "OK" }] } },
      { type: "stream_event", event: { type: "message_stop" } },
    ];
    for (const event of trace) {
      for (const parsed of s.parseStreamEvents(event)) s.dispatchStreamEvent(parsed);
    }

    expect(s.turnResponseText).toBe("OK");
    expect(s.turnAssistantMessages).toEqual(["OK"]);
    expect(forwarded.filter((event) => event.type === "thinking").map((event) => event.content)).toEqual(["draft"]);
    expect(forwarded.filter((event) => event.type === "text").map((event) => event.content)).toEqual(["OK"]);
  });

  it("replaces partial text when the terminal snapshot corrects it", () => {
    const session = newSession();
    parse(session, {
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "helo" } },
    });
    expect(parse(session, {
      type: "assistant",
      message: { content: [{ type: "text", text: "hello" }] },
    })).toEqual([{ type: "text", content: "hello", replace: true }]);
  });

  it("ignores a stream_event with no inner event", () => {
    expect(parse(newSession(), { type: "stream_event" })).toEqual([]);
  });

  it("persists each provider message as a separate assistant history item", () => {
    const session = newSession();
    type Internals = {
      pendingTurns: number;
      activeOnEvent: ((event: { type: string; messageIds?: string[] }) => void) | null;
      dispatchStreamEvent(event: { type: string; content: string }): void;
      handleTurnEnd(): void;
    };
    const s = session as unknown as Internals;
    const events: Array<{ type: string; messageIds?: string[] }> = [];
    // Leave one pending turn so handleTurnEnd does not try to persist through
    // this intentionally pathless unit-test session.
    s.pendingTurns = 2;
    s.activeOnEvent = (event) => events.push(event);
    for (const content of ["first", "second"]) {
      s.dispatchStreamEvent({ type: "message_start", content: "" });
      s.dispatchStreamEvent({ type: "text", content });
      s.dispatchStreamEvent({ type: "message_stop", content: "" });
    }
    s.handleTurnEnd();

    expect(session.messages.filter((message) => message.role === "assistant").map((message) => message.content)).toEqual([
      "first",
      "second",
    ]);
    expect(events.at(-1)?.type).toBe("result");
    expect(events.at(-1)?.messageIds).toHaveLength(2);
  });
});

describe("ChatSession Pi RPC — event translation and turn lifecycle", () => {
  type PiInternals = {
    handleStdout(chunk: string): void;
    activeOnEvent: ((ev: { type: string; content: string; toolName?: string; errorMessage?: string }) => void) | null;
    pendingTurns: number;
    setStreaming(active: boolean): void;
    turnResolve: ((r: { text: string; toolCalls: unknown[] }) => void) | null;
    process: { stdin: { write: (s: string) => boolean } } | null;
    isProcessAlive: boolean;
    stats: { costTotalUsd: number; turnCount: number; concreteModel?: string; contextTokensUsed?: number };
  };

  function makePiSession(): { session: ChatSession; s: PiInternals; events: Array<{ type: string; content: string; toolName?: string; errorMessage?: string }> } {
    // A minimally-persistable vault so the fire-and-forget persist() on turn
    // end doesn't produce unhandled rejections.
    const piVault = {
      getAbstractFileByPath: () => null,
      create: () => Promise.resolve(),
      modify: () => Promise.resolve(),
      createFolder: () => Promise.resolve(),
    } as never;
    const session = new ChatSession(
      makeAgent({ adapter: "pi" }),
      makeSettings(),
      makeRepositoryStub(),
      piVault,
      { inAppConversationId: "pi-test-conv" },
    );
    const s = session as unknown as PiInternals;
    const events: Array<{ type: string; content: string; toolName?: string; errorMessage?: string }> = [];
    s.activeOnEvent = (ev) => events.push(ev);
    return { session, s, events };
  }

  const assistantEndLine = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        model: "claude-opus-5",
        provider: "anthropic",
        usage: {
          input: 100,
          output: 20,
          cacheRead: 50,
          cacheWrite: 10,
          totalTokens: 180,
          cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 },
        },
        stopReason: "stop",
        ...over,
      },
    }) + "\n";

  it("streams deltas, tools, and message boundaries, and settles the turn on agent_end", async () => {
    const { session, s, events } = makePiSession();
    s.pendingTurns = 1;
    s.setStreaming(true);
    const settled: Array<{ text: string }> = [];
    s.turnResolve = (r) => settled.push(r as { text: string });

    s.handleStdout(
      JSON.stringify({ type: "message_start", message: { role: "assistant", content: [] } }) + "\n" +
      JSON.stringify({ type: "message_update", usage: {}, assistantMessageEvent: { type: "thinking_delta", delta: "hmm" } }) + "\n" +
      JSON.stringify({ type: "message_update", usage: {}, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hel" } }) + "\n" +
      JSON.stringify({ type: "message_update", usage: {}, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "lo" } }) + "\n" +
      JSON.stringify({ type: "tool_execution_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } }) + "\n" +
      assistantEndLine() +
      JSON.stringify({ type: "agent_end", messages: [] }) + "\n",
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(events.map((e) => e.type)).toContain("message_start");
    expect(events.filter((e) => e.type === "text").map((e) => e.content).join("")).toBe("hello");
    expect(events.find((e) => e.type === "thinking")?.content).toBe("hmm");
    expect(events.find((e) => e.type === "tool_use")?.toolName).toBe("bash");
    expect(events.map((e) => e.type)).toContain("message_stop");
    expect(settled).toHaveLength(1);
    expect(session.isStreaming).toBe(false);
    // Stats: model, context proxy, catalog cost, turn count.
    expect(s.stats.concreteModel).toBe("claude-opus-5");
    expect(s.stats.contextTokensUsed).toBe(160);
    expect(s.stats.costTotalUsd).toBeCloseTo(0.003);
    expect(s.stats.turnCount).toBe(1);
  });

  it("surfaces provider errors and a failed prompt command settles the turn", () => {
    const { s, events } = makePiSession();
    s.pendingTurns = 1;
    s.setStreaming(true);
    s.handleStdout(assistantEndLine({ content: [], stopReason: "error", errorMessage: "boom" }));
    expect(events.find((e) => e.type === "error")?.errorMessage).toBe("boom");

    // A rejected turn-opening prompt means no run ever starts — settle it.
    s.pendingTurns = 1;
    s.handleStdout(JSON.stringify({ id: "turn-1", type: "response", command: "prompt", success: false, error: "spawn refused" }) + "\n");
    expect(events.filter((e) => e.type === "error").map((e) => e.errorMessage)).toContain("spawn refused");
    expect(s.pendingTurns).toBe(0);

    // A rejected STEER must NOT settle the active turn — only its own message
    // is dropped; the running turn still ends with its own agent_end.
    s.pendingTurns = 1;
    s.setStreaming(true);
    s.handleStdout(JSON.stringify({ id: "steer-2", type: "response", command: "prompt", success: false, error: "already streaming" }) + "\n");
    expect(s.pendingTurns).toBe(1);

    // A rejected between-turn follow-up undoes its own pendingTurns increment.
    s.pendingTurns = 2;
    s.handleStdout(JSON.stringify({ id: "follow-3", type: "response", command: "prompt", success: false, error: "nope" }) + "\n");
    expect(s.pendingTurns).toBe(1);
  });

  it("answers extension dialog requests with cancelled to avoid hanging headless", () => {
    const { s } = makePiSession();
    const written: string[] = [];
    s.process = { stdin: { write: (line: string) => { written.push(line); return true; } } };
    s.isProcessAlive = true;
    s.handleStdout(JSON.stringify({ type: "extension_ui_request", id: "u1", method: "confirm", title: "Allow?" }) + "\n");
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0]!)).toEqual({ type: "extension_ui_response", id: "u1", cancelled: true });
    // Fire-and-forget methods get no response.
    s.handleStdout(JSON.stringify({ type: "extension_ui_request", id: "u2", method: "notify", message: "hi" }) + "\n");
    expect(written).toHaveLength(1);
  });

  it("steers mid-turn injects into the current run without bumping pendingTurns", () => {
    const { session, s } = makePiSession();
    const written: string[] = [];
    s.process = { stdin: { write: (line: string) => { written.push(line); return true; } } };
    s.isProcessAlive = true;
    s.pendingTurns = 1;
    s.setStreaming(true);

    session.injectMessage("change of plan");
    expect(s.pendingTurns).toBe(1);
    expect(JSON.parse(written[0]!)).toEqual({
      id: "steer-1",
      type: "prompt",
      message: "change of plan",
      streamingBehavior: "steer",
    });

    // Between turns: a plain prompt that counts as its own run.
    s.pendingTurns = 0;
    s.setStreaming(false);
    session.injectMessage("follow-up");
    expect(s.pendingTurns).toBe(1);
    expect(JSON.parse(written[1]!)).toEqual({ id: "follow-2", type: "prompt", message: "follow-up" });
  });
});

describe("ChatSession Pi RPC — process lifecycle (watchdog kill, stale close, dropped rules)", () => {
  type LifecycleInternals = {
    ensurePiProcess(): Promise<void>;
    armWatchdog(): void;
    process: unknown | null;
    processListeners: unknown | null;
    isProcessAlive: boolean;
    pendingTurns: number;
    setStreaming(active: boolean): void;
    activeOnEvent: ((ev: { type: string; errorMessage?: string }) => void) | null;
    turnReject: ((e: Error) => void) | null;
    piExtCleanup: (() => void) | null;
  };

  // ensurePiProcess touches the MCP registry and vault base path, which the
  // shared stub doesn't cover.
  function makePiRepoStub(): FleetRepository {
    return {
      getMemoryPath: (n: string) => `_fleet/memory/${n}.md`,
      getSkillByName: () => undefined,
      getMemory: async () => null,
      getAgentByName: () => undefined,
      getMcpServers: () => [],
      getVaultBasePath: () => ".",
    } as unknown as FleetRepository;
  }

  function makeLifecycleSession(agentOverrides: Partial<AgentConfig> = {}) {
    const session = new ChatSession(
      makeAgent({ adapter: "pi", ...agentOverrides }),
      makeSettings(),
      makePiRepoStub(),
      vaultStub,
      { inAppConversationId: "pi-lifecycle" },
    );
    const s = session as unknown as LifecycleInternals;
    const events: Array<{ type: string; errorMessage?: string }> = [];
    s.activeOnEvent = (ev) => events.push(ev);
    return { session, s, events };
  }

  it("watchdog detaches and kills the hung process before tearing down state", async () => {
    vi.useFakeTimers();
    try {
      const { s } = makeLifecycleSession();
      await s.ensurePiProcess();
      const proc = fakeSpawn.procs[fakeSpawn.procs.length - 1]!;
      s.pendingTurns = 1;
      s.setStreaming(true);
      const rejections: Error[] = [];
      s.turnReject = (e) => rejections.push(e);

      s.armWatchdog();
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);

      // The old ordering nulled this.process in handleProcessError first, so
      // kill() was a no-op and the hung process stayed alive with its close
      // handler attached.
      expect(proc.killed).toBe(true);
      expect(s.process).toBeNull();
      expect(s.processListeners).toBeNull();
      expect(rejections[0]?.message).toBe("Watchdog timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a stale process's close event does not tear down the replacement's state", async () => {
    const { session, s, events } = makeLifecycleSession();
    await s.ensurePiProcess();
    const orphan = fakeSpawn.procs[fakeSpawn.procs.length - 1]!;
    const orphanClose = orphan.listeners["close"]!;

    // Simulate the historical bug path: the process is abandoned (nulled)
    // without a detach, then a replacement spawns under the same session id.
    s.process = null;
    s.isProcessAlive = false;
    await s.ensurePiProcess();
    const replacement = fakeSpawn.procs[fakeSpawn.procs.length - 1]!;
    expect(replacement).not.toBe(orphan);

    s.pendingTurns = 1;
    s.setStreaming(true);
    const cleanup = vi.fn();
    s.piExtCleanup = cleanup;

    // The orphan finally exits — its close must be ignored, not settle the
    // replacement's in-flight turn or run its extension cleanup.
    orphanClose();
    expect(cleanup).not.toHaveBeenCalled();
    expect(s.pendingTurns).toBe(1);
    expect(session.isStreaming).toBe(true);
    expect(events.filter((e) => e.type === "error")).toHaveLength(0);

    // The replacement's own close still tears down normally.
    replacement.listeners["close"]!();
    expect(cleanup).toHaveBeenCalled();
    expect(s.pendingTurns).toBe(0);
    expect(session.isStreaming).toBe(false);
  });

  it("warns about deny rules the gate can't express on the chat path too", async () => {
    resetPiAdapterWarnings();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const { s } = makeLifecycleSession({
        permissionRules: { allow: [], deny: ["WebFetch"] },
      });
      await s.ensurePiProcess();
      expect(
        warn.mock.calls.some((c) => String(c[0]).includes("can't be enforced")),
      ).toBe(true);
    } finally {
      warn.mockRestore();
      resetPiAdapterWarnings();
    }
  });
});
