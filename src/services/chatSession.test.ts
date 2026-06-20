import { describe, expect, it } from "vitest";
import { ChatSession } from "./chatSession";
import type { AgentConfig, FleetSettings } from "../types";
import type { FleetRepository } from "../fleetRepository";

// ChatSession imports Vault from "obsidian" (type-only, erased at runtime) and
// uses TFile/normalizePath which the test stub provides. We don't drive any
// network/process code here — only exercise getChatFilePath and buildBasePrompt
// via bracket access since both are private.

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

  it("accumulates cost across result events and pulls contextWindow", () => {
    const session = new ChatSession(makeAgent(), makeSettings(), makeRepositoryStub(), vaultStub);
    fire(session, {
      type: "result",
      total_cost_usd: 0.01,
      modelUsage: { "claude-opus-4-7": { contextWindow: 200000, maxOutputTokens: 64000 } },
    });
    fire(session, { type: "result", total_cost_usd: 0.02 });
    const stats = session.getStats();
    expect(stats.costTotalUsd).toBeCloseTo(0.03, 8);
    expect(stats.contextWindow).toBe(200000);
    expect(stats.turnCount).toBe(2);
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
