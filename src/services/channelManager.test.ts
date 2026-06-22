import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelManager, type ChannelAdapterFactory } from "./channelManager";
import type {
  AgentConfig,
  ChannelConfig,
  ChannelCredentialEntry,
  ChannelStatus,
  FleetSettings,
  FleetSnapshot,
} from "../types";
import type { FleetRepository } from "../fleetRepository";
import type { ChannelAdapter, InboundHandler, InboundMessage, StatusHandler } from "./channels/adapter";

// ═══════════════════════════════════════════════════════
//  Test fixtures
// ═══════════════════════════════════════════════════════

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    filePath: "_fleet/agents/test-agent.md",
    name: "test-agent",
    description: "",
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
    body: "You are a test agent.",
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

function makeChannel(overrides: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    filePath: "_fleet/channels/test-slack.md",
    name: "test-slack",
    type: "slack",
    defaultAgent: "test-agent",
    allowedAgents: [],
    enabled: true,
    credentialRef: "test-creds",
    allowedUsers: [],
    perUserSessions: true,
    channelContext: "",
    transport: {},
    tags: [],
    body: "",
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
    channelCredentials: {
      "test-creds": { type: "slack", botToken: "xoxb-fake", appToken: "xapp-fake" },
    },
    maxConcurrentChannelSessions: 5,
    channelIdleTimeoutMinutes: 15,
    channelRateLimitPerConversation: 20,
    channelRateLimitWindowMinutes: 5,
    chatWatchdogMinutes: 10,
    defaultFileHashes: {},
    ...overrides,
  };
}

function makeSnapshot(agents: AgentConfig[], channels: ChannelConfig[]): FleetSnapshot {
  return {
    agents,
    skills: [],
    tasks: [],
    channels,
    mcpServers: [],
    validationIssues: [],
  };
}

// A fake repository that satisfies the small slice ChannelManager actually uses.
function makeRepositoryStub(agents: AgentConfig[]): FleetRepository {
  return {
    getAgentByName: (name: string) => agents.find((a) => a.name === name),
    getSnapshot: () => ({
      agents,
      skills: [],
      tasks: [],
      channels: [],
      mcpServers: [],
      validationIssues: [],
    }),
  } as unknown as FleetRepository;
}

const vaultStub = {
  getAbstractFileByPath: () => null,
  cachedRead: async () => "{}",
  createFolder: async () => { /* no-op */ },
  create: async () => { /* no-op */ },
  modify: async () => { /* no-op */ },
} as never;

// ═══════════════════════════════════════════════════════
//  Fake adapter — captures inbound handlers, records send/stop calls, and lets
//  tests drive the "receive a message" path synchronously.
// ═══════════════════════════════════════════════════════

class FakeAdapter implements ChannelAdapter {
  readonly type = "slack" as const;
  public config: ChannelConfig;
  public status: ChannelStatus = "connecting";
  public startCalls = 0;
  public stopCalls = 0;
  public sendCalls: Array<{ conversationId: string; text: string }> = [];
  public typingCalls: Array<{ conversationId: string; on: boolean }> = [];
  /** Delay (ms) to wait inside `send` — lets tests assert concurrent inbounds are serialized. */
  public sendDelay = 0;

  private inboundHandlers = new Set<InboundHandler>();
  private statusHandlers = new Set<StatusHandler>();

  constructor(config: ChannelConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.startCalls += 1;
    this.status = "connected";
    for (const h of this.statusHandlers) h(this.status);
  }

  async stop(): Promise<void> {
    this.stopCalls += 1;
    this.status = "stopped";
  }

  getStatus(): ChannelStatus {
    return this.status;
  }

  async send(conversationId: string, text: string): Promise<void> {
    this.sendCalls.push({ conversationId, text });
    if (this.sendDelay > 0) await new Promise((r) => setTimeout(r, this.sendDelay));
  }

  async setTyping(conversationId: string, on: boolean): Promise<void> {
    this.typingCalls.push({ conversationId, on });
  }

  onInbound(handler: InboundHandler): () => void {
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** Test helper — simulate an inbound message arriving from the transport. */
  simulateInbound(msg: InboundMessage): void {
    for (const h of this.inboundHandlers) h(msg);
  }
}

// ═══════════════════════════════════════════════════════
//  ChatSession stub — we mock the module so `new ChatSession(...)` returns
//  a controllable fake that records `sendMessage` calls, honors a test-provided
//  response, and exposes `lastActiveAt` / `hibernate` / `isStreaming` for the
//  cap + hibernation tests.
//
//  IMPORTANT: vi.mock is hoisted to the top of the file, so anything it
//  references must be defined inside a vi.hoisted() block. We keep the session
//  class + the instance list there and re-expose them for test bodies below.
// ═══════════════════════════════════════════════════════

interface FakeStreamEvent {
  type: "text" | "tool_use" | "result" | "error";
  content: string;
  toolName?: string;
  toolCalls?: Array<{ name: string }>;
  errorMessage?: string;
}

interface FakeChatSessionShape {
  messages: unknown[];
  isStreaming: boolean;
  isProcessAlive: boolean;
  lastActiveAt: number;
  hibernateCalls: number;
  abortCalls: number;
  sendMessageCalls: string[];
  injectCalls: string[];
  loadPersistedStateCalls: number;
  nextResponse: { text: string; toolCalls: Array<{ name: string }> };
  sendMessageFn?: (text: string) => Promise<{ text: string; toolCalls: Array<{ name: string }> }>;
  options?: { channelName?: string; conversationId?: string; channelContext?: string };
  loadPersistedState(): Promise<boolean>;
  sendMessage(
    text: string,
    onEvent?: (event: FakeStreamEvent) => void,
  ): Promise<{ text: string; toolCalls: Array<{ name: string }> }>;
  injectMessage(text: string): void;
  hibernate(): void;
  abort(): void;
}

const mocks = vi.hoisted(() => {
  const sessionInstances: FakeChatSessionShape[] = [];

  class FakeChatSession implements FakeChatSessionShape {
    public messages: unknown[] = [];
    public isStreaming = false;
    public isProcessAlive = true;
    public lastActiveAt = Date.now();
    public hibernateCalls = 0;
    public abortCalls = 0;
    public sendMessageCalls: string[] = [];
    public injectCalls: string[] = [];
    public loadPersistedStateCalls = 0;
    public nextResponse: { text: string; toolCalls: Array<{ name: string }> } = {
      text: "OK from agent",
      toolCalls: [],
    };
    public sendMessageFn?: (
      text: string,
    ) => Promise<{ text: string; toolCalls: Array<{ name: string }> }>;
    public options?: { channelName?: string; conversationId?: string; channelContext?: string };

    public agent: unknown;

    // Models the real session's multi-turn lifecycle: a turn queue drained
    // sequentially, staying `isStreaming` across the whole sequence so that
    // injectMessage can fold a follow-up turn into a still-running send.
    private activeOnEvent?: (event: FakeStreamEvent) => void;
    private turnQueue: string[] = [];

    constructor(
      agent: unknown,
      _settings: unknown,
      _repository: unknown,
      _vault: unknown,
      options?: { channelName?: string; conversationId?: string; channelContext?: string },
    ) {
      this.agent = agent;
      this.options = options;
      sessionInstances.push(this);
    }

    async loadPersistedState(): Promise<boolean> {
      this.loadPersistedStateCalls += 1;
      return false;
    }

    /** Drive the stream callback for one turn the way the real session does:
     *  text delta(s), a tool_use event per tool call, then a result event. */
    private async runTurn(
      text: string,
    ): Promise<{ text: string; toolCalls: Array<{ name: string }> }> {
      const response = this.sendMessageFn ? await this.sendMessageFn(text) : this.nextResponse;
      const emit = this.activeOnEvent;
      if (emit) {
        if (response.text) emit({ type: "text", content: response.text });
        for (const tc of response.toolCalls ?? []) {
          emit({ type: "tool_use", content: "", toolName: tc.name });
        }
        emit({ type: "result", content: "", toolCalls: response.toolCalls ?? [] });
      }
      return response;
    }

    async sendMessage(
      text: string,
      onEvent?: (event: FakeStreamEvent) => void,
    ): Promise<{ text: string; toolCalls: Array<{ name: string }> }> {
      this.sendMessageCalls.push(text);
      this.activeOnEvent = onEvent;
      this.isStreaming = true;
      this.lastActiveAt = Date.now();
      this.turnQueue = [text];
      let last = this.nextResponse;
      try {
        // Drain the queue — injectMessage may push follow-up turns while a
        // turn is in flight (e.g. blocked on sendMessageFn).
        while (this.turnQueue.length > 0) {
          last = await this.runTurn(this.turnQueue.shift()!);
        }
        return last;
      } finally {
        this.isStreaming = false;
        this.activeOnEvent = undefined;
        this.lastActiveAt = Date.now();
      }
    }

    injectMessage(text: string): void {
      // Mirror the real guard: a follow-up only folds in while a turn is live.
      if (!this.isStreaming) return;
      this.injectCalls.push(text);
      this.turnQueue.push(text);
    }

    hibernate(): void {
      if (this.isStreaming) return;
      this.hibernateCalls += 1;
      this.isProcessAlive = false;
    }

    abort(): void {
      this.abortCalls += 1;
      this.isProcessAlive = false;
      this.isStreaming = false;
    }
  }

  return { FakeChatSession, sessionInstances };
});

vi.mock("./chatSession", () => ({
  ChatSession: mocks.FakeChatSession,
}));

const sessionInstances = mocks.sessionInstances;

// ═══════════════════════════════════════════════════════
//  Helpers to construct a manager with a fake adapter factory
// ═══════════════════════════════════════════════════════

interface Harness {
  manager: ChannelManager;
  adapters: Map<string, FakeAdapter>;
  settings: FleetSettings;
  snapshot: FleetSnapshot;
  now: { value: number };
}

function buildHarness(options: {
  channels?: ChannelConfig[];
  agents?: AgentConfig[];
  settings?: Partial<FleetSettings>;
} = {}): Harness {
  const agents = options.agents ?? [makeAgent()];
  const channels = options.channels ?? [makeChannel()];
  const settings = makeSettings(options.settings);
  const snapshot = makeSnapshot(agents, channels);
  const adapters = new Map<string, FakeAdapter>();
  const now = { value: 1_000_000 };

  const factory: ChannelAdapterFactory = (config: ChannelConfig, _cred: ChannelCredentialEntry) => {
    const adapter = new FakeAdapter(config);
    adapters.set(config.name, adapter);
    return adapter;
  };

  const repository = makeRepositoryStub(agents);
  const manager = new ChannelManager({
    getRepository: () => repository,
    vault: vaultStub,
    getSettings: () => settings,
    adapterFactory: factory,
    now: () => now.value,
  });

  return { manager, adapters, settings, snapshot, now };
}

beforeEach(() => {
  sessionInstances.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════

describe("ChannelManager.start / stop", () => {
  it("starts an adapter for every enabled valid channel in the snapshot", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    expect(adapters.size).toBe(1);
    const adapter = adapters.get("test-slack")!;
    expect(adapter.startCalls).toBe(1);
    expect(adapter.getStatus()).toBe("connected");
    await manager.stop();
    expect(adapter.stopCalls).toBe(1);
  });

  it("skips disabled channels at start time", async () => {
    const { manager, adapters, snapshot } = buildHarness({
      channels: [makeChannel({ enabled: false })],
    });
    await manager.start(snapshot);
    expect(adapters.size).toBe(0);
  });

  it("skips channels whose bound agent has approval_required set", async () => {
    const { manager, adapters, snapshot } = buildHarness({
      agents: [makeAgent({ approvalRequired: ["Bash"] })],
    });
    await manager.start(snapshot);
    expect(adapters.size).toBe(0);
  });
});

describe("ChannelManager.reconcile", () => {
  it("does NOT restart the adapter when only allowed_users changes", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;
    const startsBefore = adapter.startCalls;
    const stopsBefore = adapter.stopCalls;

    const nextSnapshot = makeSnapshot(snapshot.agents, [
      makeChannel({ allowedUsers: ["U999"] }),
    ]);
    await manager.reconcile(nextSnapshot);

    expect(adapter.startCalls).toBe(startsBefore);
    expect(adapter.stopCalls).toBe(stopsBefore);
    expect(adapter.config.allowedUsers).toEqual(["U999"]);
    await manager.stop();
  });

  it("restarts the adapter when credential_ref changes", async () => {
    const { manager, adapters, snapshot, settings } = buildHarness();
    settings.channelCredentials = {
      "test-creds": { type: "slack", botToken: "xoxb-a", appToken: "xapp-a" },
      "other-creds": { type: "slack", botToken: "xoxb-b", appToken: "xapp-b" },
    };

    await manager.start(snapshot);
    const firstAdapter = adapters.get("test-slack")!;
    expect(firstAdapter.startCalls).toBe(1);

    const nextSnapshot = makeSnapshot(snapshot.agents, [
      makeChannel({ credentialRef: "other-creds" }),
    ]);
    await manager.reconcile(nextSnapshot);

    // tearDownChannel calls stop on the old adapter, then bringUpChannel builds a new one.
    expect(firstAdapter.stopCalls).toBe(1);
    const latest = adapters.get("test-slack")!;
    expect(latest).not.toBe(firstAdapter);
    expect(latest.startCalls).toBe(1);
    await manager.stop();
  });

  it("tears down adapters for channels that become disabled", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;
    const nextSnapshot = makeSnapshot(snapshot.agents, [makeChannel({ enabled: false })]);
    await manager.reconcile(nextSnapshot);
    expect(adapter.stopCalls).toBe(1);
    expect(manager.getChannelStatus("test-slack")).toBe("disabled");
    await manager.stop();
  });
});

describe("ChannelManager.handleInbound — allowlist", () => {
  it("silently drops messages from users not on the allowlist", async () => {
    const { manager, adapters, snapshot } = buildHarness({
      channels: [makeChannel({ allowedUsers: ["U_GOOD"] })],
    });
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "slack:T1:C1:U_BAD",
      externalUserId: "U_BAD",
      text: "hello",
      timestamp: new Date().toISOString(),
    });

    // Give the async handler a tick.
    await new Promise((r) => setTimeout(r, 0));

    expect(adapter.sendCalls).toHaveLength(0);
    expect(sessionInstances).toHaveLength(0);
    await manager.stop();
  });

  it("rejects messages with empty externalUserId even if allowlist is non-empty", async () => {
    const { manager, adapters, snapshot } = buildHarness({
      channels: [makeChannel({ allowedUsers: ["U_GOOD"] })],
    });
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "slack:T1:C1",
      externalUserId: "",
      text: "hello",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(adapter.sendCalls).toHaveLength(0);
    expect(sessionInstances).toHaveLength(0);
    await manager.stop();
  });

  it("routes messages from allowlisted users to a ChatSession and delivers the reply", async () => {
    const { manager, adapters, snapshot } = buildHarness({
      channels: [makeChannel({ allowedUsers: ["U_GOOD"] })],
    });
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "slack:T1:C1:U_GOOD",
      externalUserId: "U_GOOD",
      text: "hello agent",
      timestamp: new Date().toISOString(),
    });

    // Let the async inbound handler run to completion.
    await new Promise((r) => setTimeout(r, 10));

    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.sendMessageCalls).toEqual(["hello agent"]);
    expect(adapter.sendCalls).toHaveLength(1);
    expect(adapter.sendCalls[0]!.text).toBe("OK from agent");
    // Typing indicator fired on and off
    expect(adapter.typingCalls.filter((t) => t.on)).toHaveLength(1);
    expect(adapter.typingCalls.filter((t) => !t.on)).toHaveLength(1);
    await manager.stop();
  });
});

describe("ChannelManager.handleInbound — rate limit", () => {
  it("rejects messages beyond the per-conversation rate limit", async () => {
    const { manager, adapters, snapshot } = buildHarness({
      settings: { channelRateLimitPerConversation: 2, channelRateLimitWindowMinutes: 5 },
    });
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    for (let i = 0; i < 3; i += 1) {
      adapter.simulateInbound({
        conversationId: "conv-1",
        externalUserId: "U1",
        text: `msg ${i}`,
        timestamp: new Date().toISOString(),
      });
    }
    await new Promise((r) => setTimeout(r, 20));

    // Two messages go through and produce agent replies; the third hits the rate
    // limiter and produces a rate-limit notice instead.
    expect(sessionInstances.length).toBeLessThanOrEqual(1); // singleton session per conv
    const agentReplies = adapter.sendCalls.filter((c) => c.text === "OK from agent");
    const rateNotices = adapter.sendCalls.filter((c) => c.text.includes("Rate limit exceeded"));
    expect(agentReplies.length).toBe(2);
    expect(rateNotices.length).toBe(1);
    await manager.stop();
  });
});

describe("ChannelManager.handleInbound — conversation lock", () => {
  it("serializes concurrent messages to the same conversation", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    // Create a slow session via the send-message pipeline. We need to intercept
    // the first call to sendMessage and make it slow so we can observe that the
    // second call waits for the first.
    const order: string[] = [];
    // Monkey-patch the fake session class used by this test by overriding
    // the first two sessions' sendMessageFn before they run. To do that, we
    // need the sessions to be created lazily — which they are (on first inbound).

    // Trick: fire the first inbound; it creates the session; then reach in and
    // override its sendMessageFn before its first call completes. But the call
    // has already started by the time we reach in. Instead, we set up a
    // micro-delay via `sendDelay` AFTER the session is created. Since both
    // inbounds are synchronous-fired and the manager awaits them on the lock,
    // the easiest path is to set a sentinel on a shared closure.

    const barrier: { resolve?: () => void } = {};
    const waitOnce = new Promise<void>((r) => {
      barrier.resolve = r;
    });

    // First inbound — we need the session to block until we release the barrier.
    adapter.simulateInbound({
      conversationId: "same-conv",
      externalUserId: "U1",
      text: "first",
      timestamp: new Date().toISOString(),
    });
    // Let the session be instantiated
    await new Promise((r) => setTimeout(r, 0));
    const sess = sessionInstances[0]!;
    sess.sendMessageFn = async (text: string) => {
      order.push(`start:${text}`);
      await waitOnce;
      order.push(`end:${text}`);
      return { text: `done:${text}`, toolCalls: [] };
    };

    // Because the first sendMessage was already invoked before we patched
    // sendMessageFn, we have to refire instead. Clear and simulate two inbounds
    // in sequence with the patched session already in place.
    sess.sendMessageCalls.length = 0;
    adapter.sendCalls.length = 0;

    adapter.simulateInbound({
      conversationId: "same-conv",
      externalUserId: "U1",
      text: "A",
      timestamp: new Date().toISOString(),
    });
    adapter.simulateInbound({
      conversationId: "same-conv",
      externalUserId: "U1",
      text: "B",
      timestamp: new Date().toISOString(),
    });

    // Let microtasks settle so A has started but is blocked on the barrier.
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["start:A"]);

    // Release the barrier — A finishes, then B should start and finish.
    barrier.resolve!();
    await new Promise((r) => setTimeout(r, 10));

    expect(order).toEqual(["start:A", "end:A", "start:B", "end:B"]);
    // B arrived while A's turn was streaming on the same agent, so it was folded
    // into the live turn via injectMessage rather than starting a second send.
    expect(sess.sendMessageCalls).toEqual(["A"]);
    expect(sess.injectCalls).toEqual(["B"]);
    await manager.stop();
  });

  it("cleans up conversationLocks entries when the chain becomes idle", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    // Fire a single inbound and wait for it to fully complete.
    adapter.simulateInbound({
      conversationId: "gc-test",
      externalUserId: "U1",
      text: "hello",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 20));

    // The lock map should have GC'd the entry for this conversation.
    const internals = manager as unknown as {
      conversationLocks: Map<string, unknown>;
      activeTurns: Map<string, unknown>;
      turnTails: Map<string, unknown>;
    };
    expect(internals.conversationLocks.has("test-slack:gc-test")).toBe(false);
    // The turn-tracking maps should be empty once the turn fully resolves.
    expect(internals.activeTurns.has("test-slack:gc-test")).toBe(false);
    expect(internals.turnTails.has("test-slack:gc-test")).toBe(false);
    await manager.stop();
  });
});

describe("ChannelManager.handleInbound — follow-up injection", () => {
  // Fire one inbound, then while its turn is blocked mid-stream, fire a second
  // inbound. Returns the (single) session plus the captured order of events.
  async function runFollowUp(opts: {
    firstText: string;
    secondText: string;
    agents?: AgentConfig[];
    channels?: ChannelConfig[];
  }) {
    const harness = buildHarness({ agents: opts.agents, channels: opts.channels });
    const { manager, adapters, snapshot } = harness;
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    const barrier: { resolve?: () => void } = {};
    const waitOnce = new Promise<void>((r) => {
      barrier.resolve = r;
    });

    // First inbound creates the session; patch its first turn to block so the
    // follow-up arrives while it's still streaming.
    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: opts.firstText,
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 0));
    const firstSession = sessionInstances[0]!;
    firstSession.sendMessageFn = async (text: string) => {
      if (text === opts.firstText) await waitOnce;
      return { text: `reply:${text}`, toolCalls: [] };
    };
    // The unpatched first turn already ran with nextResponse; reset counters so
    // assertions only see the patched run.
    firstSession.sendMessageCalls.length = 0;
    firstSession.injectCalls.length = 0;
    adapter.sendCalls.length = 0;

    // Re-fire the first message (now patched to block), then the follow-up.
    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: opts.firstText,
      timestamp: new Date().toISOString(),
    });
    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: opts.secondText,
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 5));

    return { harness, adapter, barrier, firstSession };
  }

  it("folds a same-agent follow-up into the live turn via injectMessage", async () => {
    const { harness, adapter, barrier, firstSession } = await runFollowUp({
      firstText: "first",
      secondText: "follow-up",
    });

    // While the first turn is blocked, the follow-up must have been injected —
    // not started as a second send, and not created a second session.
    expect(sessionInstances).toHaveLength(1);
    expect(firstSession.sendMessageCalls).toEqual(["first"]);
    expect(firstSession.injectCalls).toEqual(["follow-up"]);

    // Release the turn — both the original and the injected follow-up reply.
    barrier.resolve!();
    await new Promise((r) => setTimeout(r, 10));

    const replies = adapter.sendCalls.map((c) => c.text);
    expect(replies).toEqual(["reply:first", "reply:follow-up"]);
    await harness.manager.stop();
  });

  it("serializes a different-agent follow-up as its own turn (no injection)", async () => {
    const other = makeAgent({ name: "other-agent", description: "Another agent" });
    const { harness, adapter, barrier, firstSession } = await runFollowUp({
      firstText: "first",
      secondText: "@other-agent: handle this",
      agents: [makeAgent(), other],
    });

    // A different agent can't share the in-flight session — nothing injected yet,
    // and the second turn is still queued behind the first.
    expect(firstSession.injectCalls).toEqual([]);
    expect(firstSession.sendMessageCalls).toEqual(["first"]);

    // Release the first turn; the second agent's turn then runs.
    barrier.resolve!();
    await new Promise((r) => setTimeout(r, 10));

    expect(sessionInstances).toHaveLength(2);
    const secondSession = sessionInstances[1]!;
    expect((secondSession as unknown as { agent: { name: string } }).agent.name).toBe("other-agent");
    expect(secondSession.sendMessageCalls).toEqual(["handle this"]);
    // Replies are ordered: first agent's reply, then the second agent's. With
    // two agents available, each reply carries its `*[agent]*` attribution.
    const replies = adapter.sendCalls.map((c) => c.text);
    expect(replies).toHaveLength(2);
    expect(replies[0]).toContain("reply:first");
    expect(replies[0]).toContain("*[test-agent]*");
    expect(replies[1]).toContain("*[other-agent]*");
    await harness.manager.stop();
  });

  it("starts a fresh turn when a message arrives after the previous turn finished", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: "one",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));
    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: "two",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));

    // Same session reused, but each message ran as its own send — no injection.
    expect(sessionInstances).toHaveLength(1);
    expect(sessionInstances[0]!.sendMessageCalls).toEqual(["one", "two"]);
    expect(sessionInstances[0]!.injectCalls).toEqual([]);
    await manager.stop();
  });
});

describe("ChannelManager — idle hibernation & hard cap", () => {
  it("hibernates idle sessions past the configured timeout", async () => {
    const { manager, adapters, snapshot, now } = buildHarness({
      settings: { channelIdleTimeoutMinutes: 15 },
    });
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "conv-A",
      externalUserId: "U1",
      text: "hi",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));
    const session = sessionInstances[0]!;
    expect(session.isProcessAlive).toBe(true);

    // Fast-forward 20 minutes and manually invoke the hibernation sweep via
    // reaching into the private method through bracket access.
    now.value += 20 * 60 * 1000;
    session.lastActiveAt = now.value - 20 * 60 * 1000; // set to 20 min ago
    await (manager as unknown as { runHibernationSweep(): Promise<void> }).runHibernationSweep();
    expect(session.hibernateCalls).toBe(1);
    expect(session.isProcessAlive).toBe(false);
    await manager.stop();
  });

  it("evicts the oldest live session when the hard cap is exceeded", async () => {
    const { manager, adapters, snapshot } = buildHarness({
      settings: { maxConcurrentChannelSessions: 2 },
    });
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    // Create three sessions (conv-1, conv-2, conv-3) by firing three inbounds.
    // They each resolve quickly; the hard cap kicks in after the 3rd completes.
    for (const convId of ["conv-1", "conv-2", "conv-3"]) {
      adapter.simulateInbound({
        conversationId: convId,
        externalUserId: "U1",
        text: `msg-${convId}`,
        timestamp: new Date().toISOString(),
      });
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(sessionInstances.length).toBe(3);
    // conv-1 is the oldest, so after conv-3 completes the cap enforcement
    // should have hibernated it. The session's conversationId now includes the
    // agent name suffix since session keys are per-agent.
    const convs = sessionInstances.map((s) => s.options?.conversationId);
    expect(convs).toEqual(["conv-1:test-agent", "conv-2:test-agent", "conv-3:test-agent"]);
    expect(sessionInstances[0]!.hibernateCalls).toBe(1);
    expect(sessionInstances[1]!.hibernateCalls).toBe(0);
    expect(sessionInstances[2]!.hibernateCalls).toBe(0);
    await manager.stop();
  });
});

describe("ChannelManager.stop — cleanup", () => {
  it("stops all adapters and hibernates all sessions", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: "hi",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));

    await manager.stop();

    expect(adapter.stopCalls).toBe(1);
    expect(sessionInstances[0]!.hibernateCalls).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════
//  Agent prefix parsing
// ═══════════════════════════════════════════════════════

describe("parseAgentPrefix", () => {
  // Import the parser directly since it's exported
  let parseAgentPrefix: typeof import("./channelManager").parseAgentPrefix;
  beforeEach(async () => {
    parseAgentPrefix = (await import("./channelManager")).parseAgentPrefix;
  });

  const agents = ["site-monitor", "code-reviewer", "fleet-orchestrator"];

  it("matches @agent-name: prefix and strips it", () => {
    const result = parseAgentPrefix("@site-monitor: check example.com", agents);
    expect(result).toEqual({ agent: "site-monitor", rest: "check example.com" });
  });

  it("matches @agent-name without colon", () => {
    const result = parseAgentPrefix("@code-reviewer review this PR", agents);
    expect(result).toEqual({ agent: "code-reviewer", rest: "review this PR" });
  });

  it("matches bare agent-name: prefix", () => {
    const result = parseAgentPrefix("site-monitor: check status", agents);
    expect(result).toEqual({ agent: "site-monitor", rest: "check status" });
  });

  it("matches 'use agent-name' prefix", () => {
    const result = parseAgentPrefix("use fleet-orchestrator: create a new agent", agents);
    expect(result).toEqual({ agent: "fleet-orchestrator", rest: "create a new agent" });
  });

  it("matches @agent-name alone (empty rest)", () => {
    const result = parseAgentPrefix("@site-monitor", agents);
    expect(result).toEqual({ agent: "site-monitor", rest: "" });
  });

  it("is case-insensitive on the agent name", () => {
    const result = parseAgentPrefix("@Site-Monitor: check it", agents);
    expect(result).toEqual({ agent: "site-monitor", rest: "check it" });
  });

  it("returns null for messages that don't start with an agent name", () => {
    expect(parseAgentPrefix("hello world", agents)).toBeNull();
    expect(parseAgentPrefix("@unknown-agent: test", agents)).toBeNull();
  });

  it("does not match agent names that appear mid-message", () => {
    expect(parseAgentPrefix("please ask @site-monitor to check", agents)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
//  Multi-agent routing
// ═══════════════════════════════════════════════════════

describe("ChannelManager — multi-agent routing", () => {
  it("routes to the default agent when no prefix is given", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: "hello",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));

    // Session should be created with the default agent ("test-agent")
    expect(sessionInstances).toHaveLength(1);
    const sess = sessionInstances[0]!;
    expect((sess as unknown as { agent: { name: string } }).agent.name).toBe("test-agent");
    await manager.stop();
  });

  it("routes to a different agent when @prefix is used", async () => {
    const secondAgent = makeAgent({ name: "other-agent", description: "Another agent" });
    const { manager, adapters, snapshot } = buildHarness({
      agents: [makeAgent(), secondAgent],
    });
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: "@other-agent: do something",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(sessionInstances).toHaveLength(1);
    const sess = sessionInstances[0]!;
    expect((sess as unknown as { agent: { name: string } }).agent.name).toBe("other-agent");
    // The message sent to the agent should have the prefix stripped
    expect(sess.sendMessageCalls).toEqual(["do something"]);
    await manager.stop();
  });

  it("creates isolated sessions when switching agents mid-thread", async () => {
    const agentA = makeAgent({ name: "agent-a" });
    const agentB = makeAgent({ name: "agent-b" });
    const { manager, adapters, snapshot } = buildHarness({
      agents: [agentA, agentB],
      channels: [makeChannel({ defaultAgent: "agent-a" })],
    });
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    // First message → default agent (agent-a)
    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: "first message",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(sessionInstances).toHaveLength(1);

    // Switch to agent-b
    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: "@agent-b: second message",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));

    // TWO sessions should exist — one per agent, in the same thread
    expect(sessionInstances).toHaveLength(2);
    const sessA = sessionInstances[0]!;
    const sessB = sessionInstances[1]!;
    expect((sessA as unknown as { agent: { name: string } }).agent.name).toBe("agent-a");
    expect((sessB as unknown as { agent: { name: string } }).agent.name).toBe("agent-b");
    expect(sessA.sendMessageCalls).toEqual(["first message"]);
    expect(sessB.sendMessageCalls).toEqual(["second message"]);
    await manager.stop();
  });

  it("sends a confirmation without starting a turn when only @agent-name is given", async () => {
    const { manager, adapters, snapshot } = buildHarness();
    await manager.start(snapshot);
    const adapter = adapters.get("test-slack")!;

    adapter.simulateInbound({
      conversationId: "conv-1",
      externalUserId: "U1",
      text: "@test-agent",
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 10));

    // No session should be created — it's just a binding confirmation
    expect(sessionInstances).toHaveLength(0);
    // Adapter should send a confirmation message
    expect(adapter.sendCalls).toHaveLength(1);
    expect(adapter.sendCalls[0]!.text).toContain("Now chatting with");
    await manager.stop();
  });
});
