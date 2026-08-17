import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vault } from "obsidian";
import {
  InAppConversationManager,
  conversationKey,
  type InAppConversationManagerDeps,
  type ManagedConversationEvent,
  type ManagedSessionFactoryArgs,
  type ManagedTurnResult,
} from "./inAppConversationManager";
import type {
  ChatSession,
  ChatSessionDependencies,
  ChatTurnOptions,
  StreamEvent,
  ToolCall,
} from "./chatSession";
import type { AgentConfig, FleetSettings, UsageRecord } from "../types";
import type { FleetRepository } from "../fleetRepository";

// The manager is exercised entirely through an injected session factory, so no
// CLI is spawned and every turn boundary is driven explicitly by the test. That
// is the point of the factory: FIFO/injection policy is the thing under test,
// not provider behavior.

// ═══════════════════════════════════════════════════════
//  Fakes
// ═══════════════════════════════════════════════════════

interface PendingSend {
  displayText: string;
  fullText?: string;
  attachments?: string[];
  options?: ChatTurnOptions;
  onEvent: (event: StreamEvent) => void;
  resolve: (result: { text: string; toolCalls: ToolCall[] }) => void;
  reject: (error: Error) => void;
}

interface RecordedInject {
  text: string;
  fullText?: string;
  attachments?: string[];
  options?: ChatTurnOptions;
}

/**
 * Stand-in for `ChatSession`. Mirrors the contract the manager depends on:
 * `sendMessage()` stays pending until the test settles it, `abort()` rejects
 * the in-flight turn with "Aborted" (exactly as the real session does), and
 * `dispose()` tears threads down before aborting.
 */
class FakeSession {
  loadCount = 0;
  readonly sends: PendingSend[] = [];
  readonly injects: RecordedInject[] = [];
  aborts = 0;
  disposes = 0;
  hibernates = 0;
  threadsTornDown = 0;
  readonly refreshes: ChatSessionDependencies[] = [];
  persistenceError: Error | null = null;
  persistenceGate: Promise<void> | null = null;
  persistenceFlushes = 0;
  usageRecorder: ((record: UsageRecord) => void) | null = null;
  /** Index of the first send that has not been settled yet. */
  private cursor = 0;

  constructor(readonly args: ManagedSessionFactoryArgs) {}

  async loadPersistedState(): Promise<boolean> {
    this.loadCount++;
    // Yield once so concurrent acquires genuinely interleave.
    await Promise.resolve();
    return true;
  }

  sendMessage(
    displayText: string,
    onEvent: (event: StreamEvent) => void,
    fullText?: string,
    attachments?: string[],
    options?: ChatTurnOptions,
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    return new Promise((resolve, reject) => {
      this.sends.push({ displayText, fullText, attachments, options, onEvent, resolve, reject });
    });
  }

  injectMessage(
    text: string,
    fullText?: string,
    attachments?: string[],
    options?: ChatTurnOptions,
  ): void {
    this.injects.push({ text, fullText, attachments, options });
  }

  abort(): void {
    this.aborts++;
    const active = this.sends[this.cursor];
    if (active) {
      this.cursor++;
      active.reject(new Error("Aborted"));
    }
  }

  dispose(): void {
    this.disposes++;
    this.threadsTornDown++;
    this.abort();
  }

  async disposeAndFlushPersistence(): Promise<void> {
    this.dispose();
    await this.flushPersistence();
  }

  hibernate(): void {
    this.hibernates++;
  }

  refreshDependencies(deps: ChatSessionDependencies): void {
    this.refreshes.push(deps);
  }

  async flushPersistence(): Promise<void> {
    this.persistenceFlushes++;
    if (this.persistenceGate) await this.persistenceGate;
    if (this.persistenceError) throw this.persistenceError;
  }

  setUsageRecorder(fn: (record: UsageRecord) => void): void {
    this.usageRecorder = fn;
  }

  // ── test driving helpers ──

  /** The send currently owning the session's single turn slot. */
  private active(): PendingSend {
    const send = this.sends[this.cursor];
    if (!send) throw new Error("FakeSession: no in-flight sendMessage");
    return send;
  }

  get activeDisplayText(): string {
    return this.active().displayText;
  }

  emit(event: StreamEvent): void {
    this.active().onEvent(event);
  }

  finish(text = "done", toolCalls: ToolCall[] = []): void {
    const send = this.active();
    this.cursor++;
    send.resolve({ text, toolCalls });
  }

  fail(message: string): void {
    const send = this.active();
    this.cursor++;
    send.reject(new Error(message));
  }

  asSession(): ChatSession {
    return this as unknown as ChatSession;
  }
}

function makeAgent(name = "test-agent"): AgentConfig {
  return {
    filePath: `_fleet/agents/${name}.md`,
    name,
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
    reflection: {
      enabled: false,
      schedule: "0 3 * * *",
      recurrenceThreshold: 3,
      proposeSkills: false,
    },
    tags: [],
    avatar: "",
    body: "You are a helpful test agent.",
    contextBody: "",
    skillsBody: "",
    env: {},
    permissionRules: { allow: [], deny: [] },
  } as unknown as AgentConfig;
}

function makeSettings(): FleetSettings {
  return { fleetFolder: "_fleet" } as unknown as FleetSettings;
}

function makeRepository(agents: AgentConfig[]): FleetRepository {
  return {
    getAgentByName: (name: string) => agents.find((a) => a.name === name),
  } as unknown as FleetRepository;
}

interface Harness {
  manager: InAppConversationManager;
  created: FakeSession[];
  /** The single session the tests almost always care about. */
  session(): FakeSession;
  setRepository(next: FleetRepository): void;
  setSettings(next: FleetSettings): void;
  usage: UsageRecord[];
}

const AGENT = "test-agent";
const CONVO = "conv-1";
const TARGET = { agentName: AGENT, conversationId: CONVO };

function makeHarness(
  overrides: Partial<InAppConversationManagerDeps> = {},
  /** Runs on each freshly-built fake, before the manager sees it. */
  onCreate?: (session: FakeSession) => void,
): Harness {
  const created: FakeSession[] = [];
  const usage: UsageRecord[] = [];
  let repository = makeRepository([makeAgent(AGENT), makeAgent("other-agent")]);
  let settings = makeSettings();

  const manager = new InAppConversationManager({
    getRepository: () => repository,
    getSettings: () => settings,
    vault: {} as unknown as Vault,
    recordUsage: (record) => usage.push(record),
    createSession: (args) => {
      const fake = new FakeSession(args);
      created.push(fake);
      onCreate?.(fake);
      return fake.asSession();
    },
    idleHibernateMs: 1_000,
    ...overrides,
  });

  return {
    manager,
    created,
    session: () => {
      const first = created[0];
      if (!first) throw new Error("no session was created");
      return first;
    },
    setRepository: (next) => {
      repository = next;
    },
    setSettings: (next) => {
      settings = next;
    },
    usage,
  };
}

/** Subscribe and record every event for `TARGET`. */
function recordEvents(h: Harness, target = TARGET): ManagedConversationEvent[] {
  const events: ManagedConversationEvent[] = [];
  h.manager.subscribe(target, (event) => events.push(event));
  return events;
}

/** Let queued microtasks (promise settlement, pump continuation) drain. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** Track a promise's settled state without leaving an unhandled rejection. */
function track<T>(promise: Promise<T>): {
  settled: () => "pending" | "resolved" | "rejected";
  value: () => T | undefined;
  error: () => Error | undefined;
  promise: Promise<T>;
} {
  let state: "pending" | "resolved" | "rejected" = "pending";
  let value: T | undefined;
  let error: Error | undefined;
  const wrapped = promise.then(
    (v) => {
      state = "resolved";
      value = v;
      return v;
    },
    (e: unknown) => {
      state = "rejected";
      error = e instanceof Error ? e : new Error(String(e));
      throw error;
    },
  );
  // Keep an always-handled branch so a rejection never escapes to the runner.
  void wrapped.catch(() => undefined);
  return { settled: () => state, value: () => value, error: () => error, promise: wrapped };
}

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════
//  Acquisition and identity
// ═══════════════════════════════════════════════════════

describe("InAppConversationManager acquisition", () => {
  it("builds the exact agentName::conversationId key", () => {
    expect(conversationKey("pm-agent", "Q4 planning / OKRs!")).toBe(
      "pm-agent::Q4 planning / OKRs!",
    );
  });

  it("concurrent acquire returns one session and loads persisted state once", async () => {
    const h = makeHarness();
    const [a, b] = await Promise.all([
      h.manager.acquire(TARGET, "consumer-a"),
      h.manager.acquire(TARGET, "consumer-b"),
    ]);
    expect(h.created).toHaveLength(1);
    expect(h.session().loadCount).toBe(1);
    expect(a.session).toBe(b.session);
    expect(h.manager.size).toBe(1);
  });

  it("a later acquire reuses the cached session without reloading", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "consumer-a");
    await h.manager.acquire(TARGET, "consumer-b");
    expect(h.created).toHaveLength(1);
    expect(h.session().loadCount).toBe(1);
  });

  it("different conversations for one agent get separate sessions", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "c1");
    await h.manager.acquire({ agentName: AGENT, conversationId: "conv-2" }, "c2");
    expect(h.created).toHaveLength(2);
    expect(h.manager.size).toBe(2);
  });

  it("passes the conversation id through verbatim — never slugified", async () => {
    const h = makeHarness();
    const opaque = "Q4 planning / OKRs! 2026";
    await h.manager.acquire({ agentName: AGENT, conversationId: opaque }, "c1");
    expect(h.session().args.conversationId).toBe(opaque);
    expect(h.manager.peek({ agentName: AGENT, conversationId: opaque })).toBeDefined();
  });

  it("installs the usage recorder on every created session", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "c1");
    expect(h.session().usageRecorder).toBeTypeOf("function");
  });

  it("rejects an unknown agent instead of creating an orphan session", async () => {
    const h = makeHarness();
    await expect(
      h.manager.acquire({ agentName: "ghost", conversationId: CONVO }, "c1"),
    ).rejects.toThrow(/Unknown agent "ghost"/);
    expect(h.created).toHaveLength(0);
  });

  it("peek never creates a session", () => {
    const h = makeHarness();
    expect(h.manager.peek(TARGET)).toBeUndefined();
    expect(h.created).toHaveLength(0);
  });

  it("a corrupt persisted conversation still yields a usable session", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = makeHarness({}, (fake) => {
      fake.loadPersistedState = () => Promise.reject(new Error("corrupt json"));
    });

    const managed = await h.manager.acquire(TARGET, "c1");
    expect(managed.isDisposed).toBe(false);

    // The session is live despite the failed load — it starts empty rather
    // than wedging every consumer of this conversation.
    const turn = track(
      h.manager.send(TARGET, { displayText: "hi", origin: "chat", policy: "interactive" }),
    );
    await flush();
    h.session().finish("ok");
    await flush();
    expect(turn.settled()).toBe("resolved");
    warn.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════
//  Turn policy — REVISION_MODE_DESIGN §11.4
// ═══════════════════════════════════════════════════════

describe("InAppConversationManager turn policy", () => {
  it("1. an interactive turn starts immediately when the conversation is idle", async () => {
    const h = makeHarness();
    const events = recordEvents(h);
    await h.manager.acquire(TARGET, "view");

    const turn = track(
      h.manager.send(TARGET, { displayText: "hello", origin: "chat", policy: "interactive" }),
    );
    await flush();

    expect(h.session().sends).toHaveLength(1);
    expect(h.session().activeDisplayText).toBe("hello");
    expect(events.map((e) => e.type)).toEqual(["turn-start"]);
    expect(events.some((e) => e.type === "queued")).toBe(false);

    h.session().finish("hi there");
    await flush();
    expect(turn.settled()).toBe("resolved");
    expect(turn.value()?.text).toBe("hi there");
    expect(turn.value()?.injected).toBe(false);
  });

  it("2. an interactive follow-up injects into a running interactive turn", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");

    const first = track(
      h.manager.send(TARGET, { displayText: "first", origin: "chat", policy: "interactive" }),
    );
    await flush();
    const followUp = track(
      h.manager.send(TARGET, {
        displayText: "also this",
        fullText: "also this (expanded)",
        attachments: ["notes.md"],
        origin: "chat",
        policy: "interactive",
      }),
    );
    await flush();

    // Folded into the live turn: no second sendMessage.
    expect(h.session().sends).toHaveLength(1);
    expect(h.session().injects).toHaveLength(1);
    expect(h.session().injects[0]).toMatchObject({
      text: "also this",
      fullText: "also this (expanded)",
      attachments: ["notes.md"],
    });
    expect(followUp.settled()).toBe("pending");

    h.session().finish("answered both");
    await flush();
    expect(first.value()?.injected).toBe(false);
    expect(followUp.value()?.injected).toBe(true);
    expect(followUp.value()?.text).toBe("answered both");
  });

  it("2b. an injected follow-up rejects with the turn it was folded into", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    const first = track(
      h.manager.send(TARGET, { displayText: "first", origin: "chat", policy: "interactive" }),
    );
    await flush();
    const followUp = track(
      h.manager.send(TARGET, { displayText: "second", origin: "chat", policy: "interactive" }),
    );
    await flush();

    h.session().fail("cli exited 1");
    await flush();
    expect(first.settled()).toBe("rejected");
    expect(followUp.settled()).toBe("rejected");
    expect(followUp.error()?.message).toBe("cli exited 1");
  });

  it("3. an exclusive revision waits for the active interactive turn", async () => {
    const h = makeHarness();
    const events = recordEvents(h);
    await h.manager.acquire(TARGET, "view");

    track(h.manager.send(TARGET, { displayText: "chatting", origin: "chat", policy: "interactive" }));
    await flush();

    const revision = track(
      h.manager.send(TARGET, {
        displayText: "Revision request",
        fullText: "Revision request (full)",
        origin: "revision",
        policy: "exclusive",
        messageMeta: {
          origin: "revision",
          revision: { draftId: "d1", documentPath: "notes/spec.md", noteCount: 3 },
        },
      }),
    );
    await flush();

    // Never injected, never started early.
    expect(h.session().injects).toHaveLength(0);
    expect(h.session().sends).toHaveLength(1);
    expect(revision.settled()).toBe("pending");
    expect(events.filter((e) => e.type === "queued")).toHaveLength(1);
    expect(events.find((e) => e.type === "queued")?.origin).toBe("revision");

    h.session().finish("chat answer");
    await flush();

    expect(h.session().sends).toHaveLength(2);
    expect(h.session().activeDisplayText).toBe("Revision request");
    expect(h.session().sends[1]?.fullText).toBe("Revision request (full)");
    expect(h.session().sends[1]?.options?.metadata?.revision?.draftId).toBe("d1");
  });

  it("4. an interactive message queues — never injects — during an exclusive revision", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");

    const revision = track(
      h.manager.send(TARGET, {
        displayText: "Revision request",
        origin: "revision",
        policy: "exclusive",
      }),
    );
    await flush();
    expect(h.session().activeDisplayText).toBe("Revision request");

    const chat = track(
      h.manager.send(TARGET, { displayText: "meanwhile", origin: "chat", policy: "interactive" }),
    );
    await flush();

    expect(h.session().injects).toHaveLength(0);
    expect(h.session().sends).toHaveLength(1);
    expect(chat.settled()).toBe("pending");

    h.session().finish("revised");
    await flush();
    expect(revision.settled()).toBe("resolved");
    expect(h.session().sends).toHaveLength(2);
    expect(h.session().activeDisplayText).toBe("meanwhile");
  });

  it("5. an interactive message behind a QUEUED exclusive keeps FIFO order", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");

    // Active interactive turn.
    track(h.manager.send(TARGET, { displayText: "turn-1", origin: "chat", policy: "interactive" }));
    await flush();
    // Exclusive revision queued behind it.
    track(
      h.manager.send(TARGET, { displayText: "revision", origin: "revision", policy: "exclusive" }),
    );
    await flush();
    // Interactive arriving after the revision must NOT jump into turn-1.
    track(h.manager.send(TARGET, { displayText: "turn-2", origin: "chat", policy: "interactive" }));
    await flush();

    expect(h.session().injects).toHaveLength(0);

    h.session().finish();
    await flush();
    expect(h.session().activeDisplayText).toBe("revision");

    h.session().finish();
    await flush();
    expect(h.session().activeDisplayText).toBe("turn-2");
  });

  it("6. multiple exclusive requests run in FIFO order", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");

    const order: string[] = [];
    for (const label of ["rev-a", "rev-b", "rev-c"]) {
      void h.manager
        .send(TARGET, { displayText: label, origin: "revision", policy: "exclusive" })
        .then(() => order.push(label))
        .catch(() => undefined);
    }
    await flush();

    expect(h.session().activeDisplayText).toBe("rev-a");
    h.session().finish();
    await flush();
    expect(h.session().activeDisplayText).toBe("rev-b");
    h.session().finish();
    await flush();
    expect(h.session().activeDisplayText).toBe("rev-c");
    h.session().finish();
    await flush();

    expect(order).toEqual(["rev-a", "rev-b", "rev-c"]);
    expect(h.session().injects).toHaveLength(0);
  });

  it("7. a failed turn settles only that request and the queue keeps draining", async () => {
    const h = makeHarness();
    const events = recordEvents(h);
    await h.manager.acquire(TARGET, "view");

    const failing = track(
      h.manager.send(TARGET, { displayText: "boom", origin: "revision", policy: "exclusive" }),
    );
    await flush();
    const next = track(
      h.manager.send(TARGET, { displayText: "after", origin: "chat", policy: "interactive" }),
    );
    await flush();

    h.session().fail("claude exited with code 1");
    await flush();

    expect(failing.settled()).toBe("rejected");
    expect(failing.error()?.message).toBe("claude exited with code 1");
    // The queue continued rather than stalling behind the failure.
    expect(h.session().activeDisplayText).toBe("after");
    expect(next.settled()).toBe("pending");

    const turnEnd = events.find((e) => e.type === "turn-end" && e.error);
    expect(turnEnd?.error).toBe("claude exited with code 1");
    expect(turnEnd?.origin).toBe("revision");

    h.session().finish("ok");
    await flush();
    expect(next.settled()).toBe("resolved");
  });

  it("rejects a completed turn when its conversation history is not durable", async () => {
    const h = makeHarness();
    const events = recordEvents(h);
    await h.manager.acquire(TARGET, "view");
    h.session().persistenceError = new Error("vault write failed");

    const turn = track(
      h.manager.send(TARGET, {
        displayText: "Revision request",
        origin: "revision",
        policy: "exclusive",
      }),
    );
    await flush();
    h.session().finish("document revised");
    await flush();

    expect(turn.settled()).toBe("rejected");
    expect(turn.error()?.message).toBe("vault write failed");
    expect(h.session().persistenceFlushes).toBe(1);
    expect(events.find((event) => event.type === "turn-end")?.error).toBe(
      "vault write failed",
    );
  });

  it("send() on a conversation nobody opened creates and loads it (headless revision)", async () => {
    const h = makeHarness();
    const turn = track(
      h.manager.send(TARGET, {
        displayText: "Revision request",
        origin: "revision",
        policy: "exclusive",
      }),
    );
    await flush();

    expect(h.created).toHaveLength(1);
    expect(h.session().loadCount).toBe(1);
    expect(h.session().activeDisplayText).toBe("Revision request");
    h.session().finish();
    await flush();
    expect(turn.settled()).toBe("resolved");
  });
});

// ═══════════════════════════════════════════════════════
//  Event fan-out
// ═══════════════════════════════════════════════════════

describe("InAppConversationManager event fan-out", () => {
  it("stream events reach every subscriber and the request caller", async () => {
    const h = makeHarness();
    const viewA = recordEvents(h);
    const viewB = recordEvents(h);
    const callerEvents: StreamEvent[] = [];
    await h.manager.acquire(TARGET, "view");

    const turn = track(
      h.manager.send(TARGET, {
        displayText: "hi",
        origin: "chat",
        policy: "interactive",
        requestId: "req-1",
        onEvent: (event) => callerEvents.push(event),
      }),
    );
    await flush();

    h.session().emit({ type: "text", content: "partial" });
    h.session().emit({ type: "message_stop", content: "partial" });
    h.session().finish("partial");
    await flush();

    expect(callerEvents.map((e) => e.type)).toEqual(["text", "message_stop"]);
    for (const events of [viewA, viewB]) {
      expect(events.filter((e) => e.type === "stream")).toHaveLength(2);
      expect(events.map((e) => e.type)).toEqual([
        "turn-start",
        "stream",
        "stream",
        "turn-end",
        "messages-changed",
      ]);
      expect(events.every((e) => e.requestId === "req-1")).toBe(true);
      expect(events[0]?.displayText).toBe("hi");
      expect(events[0]?.target).toEqual(TARGET);
    }
    expect(turn.settled()).toBe("resolved");
  });

  it("a revision turn is observable by an already-subscribed chat view", async () => {
    const h = makeHarness();
    const view = recordEvents(h);
    await h.manager.acquire(TARGET, "view");

    void h.manager
      .send(TARGET, {
        displayText: "Revision request · spec.md · 3 notes",
        origin: "revision",
        policy: "exclusive",
        messageMeta: { origin: "revision" },
      })
      .catch(() => undefined);
    await flush();

    const start = view.find((e) => e.type === "turn-start");
    expect(start?.origin).toBe("revision");
    expect(start?.displayText).toBe("Revision request · spec.md · 3 notes");
    expect(start?.messageMeta?.origin).toBe("revision");
  });

  it("an injected follow-up emits messages-changed with injected:true", async () => {
    const h = makeHarness();
    const view = recordEvents(h);
    await h.manager.acquire(TARGET, "view");

    void h.manager
      .send(TARGET, { displayText: "first", origin: "chat", policy: "interactive" })
      .catch(() => undefined);
    await flush();
    void h.manager
      .send(TARGET, { displayText: "second", origin: "chat", policy: "interactive" })
      .catch(() => undefined);
    await flush();

    const changed = view.find((e) => e.type === "messages-changed");
    expect(changed?.injected).toBe(true);
    expect(changed?.displayText).toBe("second");
  });

  it("collects stream errors on the result even when the turn resolves", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    const turn = track(
      h.manager.send(TARGET, { displayText: "go", origin: "revision", policy: "exclusive" }),
    );
    await flush();

    h.session().emit({ type: "error", content: "", errorMessage: "  rate limited  " });
    h.session().finish("finished anyway");
    await flush();

    const result: ManagedTurnResult | undefined = turn.value();
    expect(result?.text).toBe("finished anyway");
    expect(result?.streamErrors).toEqual(["rate limited"]);
  });

  it("unsubscribe stops delivery and a throwing subscriber does not break the turn", async () => {
    const h = makeHarness();
    const kept: ManagedConversationEvent[] = [];
    const dropped: ManagedConversationEvent[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    h.manager.subscribe(TARGET, () => {
      throw new Error("subscriber blew up");
    });
    h.manager.subscribe(TARGET, (e) => kept.push(e));
    const unsub = h.manager.subscribe(TARGET, (e) => dropped.push(e));
    unsub();

    const turn = track(
      h.manager.send(TARGET, { displayText: "hi", origin: "chat", policy: "interactive" }),
    );
    await flush();
    h.session().finish();
    await flush();

    expect(turn.settled()).toBe("resolved");
    expect(kept.length).toBeGreaterThan(0);
    expect(dropped).toHaveLength(0);
    warn.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════
//  Lifecycle
// ═══════════════════════════════════════════════════════

describe("InAppConversationManager lifecycle", () => {
  it("release during an active revision does not abort it", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "chat-view");

    const revision = track(
      h.manager.send(TARGET, {
        displayText: "Revision request",
        origin: "revision",
        policy: "exclusive",
      }),
    );
    await flush();

    // The chat tab closes while the revision is mid-flight.
    h.manager.release(TARGET, "chat-view");
    await flush();

    expect(h.session().aborts).toBe(0);
    expect(revision.settled()).toBe("pending");

    h.session().finish("revised");
    await flush();
    expect(revision.settled()).toBe("resolved");
  });

  it("releasing an unknown consumer or conversation is a no-op", () => {
    const h = makeHarness();
    expect(() => h.manager.release(TARGET, "nobody")).not.toThrow();
  });

  it("an idle entry hibernates exactly once", async () => {
    vi.useFakeTimers();
    const h = makeHarness({ idleHibernateMs: 500 });
    await h.manager.acquire(TARGET, "view");
    h.manager.release(TARGET, "view");

    vi.advanceTimersByTime(499);
    expect(h.session().hibernates).toBe(0);
    vi.advanceTimersByTime(2);
    expect(h.session().hibernates).toBe(1);

    // No re-arming, no repeat.
    vi.advanceTimersByTime(5_000);
    expect(h.session().hibernates).toBe(1);
    expect(h.manager.size).toBe(1);
  });

  it("does not hibernate while a consumer is still attached", async () => {
    vi.useFakeTimers();
    const h = makeHarness({ idleHibernateMs: 500 });
    await h.manager.acquire(TARGET, "view-a");
    await h.manager.acquire(TARGET, "view-b");
    h.manager.release(TARGET, "view-a");

    vi.advanceTimersByTime(5_000);
    expect(h.session().hibernates).toBe(0);
  });

  it("does not hibernate while work is still queued", async () => {
    vi.useFakeTimers();
    const h = makeHarness({ idleHibernateMs: 500 });
    await h.manager.acquire(TARGET, "view");
    track(h.manager.send(TARGET, { displayText: "one", origin: "chat", policy: "interactive" }));
    await flush();
    track(
      h.manager.send(TARGET, { displayText: "two", origin: "revision", policy: "exclusive" }),
    );
    await flush();
    h.manager.release(TARGET, "view");

    vi.advanceTimersByTime(5_000);
    expect(h.session().hibernates).toBe(0);
  });

  it("re-acquiring cancels a pending hibernation", async () => {
    vi.useFakeTimers();
    const h = makeHarness({ idleHibernateMs: 500 });
    await h.manager.acquire(TARGET, "view");
    h.manager.release(TARGET, "view");
    vi.advanceTimersByTime(200);

    const reacquire = h.manager.acquire(TARGET, "view-2");
    await vi.advanceTimersByTimeAsync(0);
    await reacquire;

    vi.advanceTimersByTime(5_000);
    expect(h.session().hibernates).toBe(0);
  });

  it("deleting a conversation disposes the session (and its threads) and drops the entry", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");

    await h.manager.disposeConversation(TARGET);

    // dispose(), not a bare abort() — the real ChatSession.dispose() is the
    // only path that tears down open thread sub-sessions.
    expect(h.session().disposes).toBe(1);
    expect(h.session().threadsTornDown).toBe(1);
    expect(h.manager.size).toBe(0);
    expect(h.manager.peek(TARGET)).toBeUndefined();
  });

  it("deleting a conversation rejects its queued work with an actionable error", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    const active = track(
      h.manager.send(TARGET, { displayText: "running", origin: "chat", policy: "interactive" }),
    );
    await flush();
    const queued = track(
      h.manager.send(TARGET, { displayText: "queued", origin: "revision", policy: "exclusive" }),
    );
    await flush();

    await h.manager.disposeConversation(TARGET);
    await flush();

    expect(queued.settled()).toBe("rejected");
    expect(queued.error()?.message).toMatch(/was deleted/);
    expect(queued.error()?.message).toContain(CONVO);
    // The active turn was aborted by dispose().
    expect(active.settled()).toBe("rejected");
    expect(active.error()?.message).toBe("Aborted");
  });

  it("acquiring after a delete builds a fresh session", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    await h.manager.disposeConversation(TARGET);
    await h.manager.acquire(TARGET, "view");

    expect(h.created).toHaveLength(2);
    expect(h.created[1]?.loadCount).toBe(1);
  });

  it("a turn settled at the provider cannot report success after deletion", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    let releasePersistence: (() => void) | null = null;
    h.session().persistenceGate = new Promise<void>((resolve) => {
      releasePersistence = resolve;
    });
    const turn = track(
      h.manager.send(TARGET, { displayText: "running", origin: "revision", policy: "exclusive" }),
    );
    await flush();
    h.session().finish("provider finished");
    await flush();
    expect(turn.settled()).toBe("pending");

    const disposal = h.manager.disposeConversation(TARGET);
    await flush();
    expect(h.manager.size).toBe(0);
    (releasePersistence as (() => void) | null)?.();
    await disposal;
    await flush();

    expect(turn.settled()).toBe("rejected");
    expect(turn.error()?.message).toMatch(/was deleted/);
  });

  it("disposing an unknown conversation is a no-op", async () => {
    const h = makeHarness();
    await expect(h.manager.disposeConversation(TARGET)).resolves.toBeUndefined();
  });

  it("dependency refresh reaches every cached session", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    await h.manager.acquire({ agentName: "other-agent", conversationId: "conv-x" }, "view");

    const nextRepo = makeRepository([makeAgent(AGENT), makeAgent("other-agent")]);
    const nextSettings = makeSettings();
    h.setRepository(nextRepo);
    h.setSettings(nextSettings);

    h.manager.refreshDependencies();

    for (const session of h.created) {
      expect(session.refreshes).toHaveLength(1);
      expect(session.refreshes[0]?.repository).toBe(nextRepo);
      expect(session.refreshes[0]?.settings).toBe(nextSettings);
      expect(session.refreshes[0]?.usageRecorder).toBeTypeOf("function");
    }
  });

  it("a session that throws during refresh does not block the others", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    await h.manager.acquire({ agentName: AGENT, conversationId: "conv-2" }, "view");
    const first = h.created[0];
    const second = h.created[1];
    if (!first || !second) throw new Error("expected two sessions");
    first.refreshDependencies = () => {
      throw new Error("nope");
    };

    h.manager.refreshDependencies();
    expect(second.refreshes).toHaveLength(1);
    warn.mockRestore();
  });

  it("shutdown rejects queued work with an actionable error and aborts the active turn", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    const active = track(
      h.manager.send(TARGET, { displayText: "running", origin: "chat", policy: "interactive" }),
    );
    await flush();
    const queuedA = track(
      h.manager.send(TARGET, { displayText: "rev-a", origin: "revision", policy: "exclusive" }),
    );
    const queuedB = track(
      h.manager.send(TARGET, { displayText: "rev-b", origin: "revision", policy: "exclusive" }),
    );
    await flush();

    h.manager.shutdown();
    await flush();

    for (const queued of [queuedA, queuedB]) {
      expect(queued.settled()).toBe("rejected");
      expect(queued.error()?.message).toMatch(/shutting down/);
      expect(queued.error()?.message).toMatch(/Retry after reload/);
    }
    expect(active.settled()).toBe("rejected");
    expect(active.error()?.message).toBe("Aborted");
    expect(h.session().aborts).toBe(1);
    expect(h.manager.size).toBe(0);
  });

  it("shutdown hibernates idle sessions instead of aborting them", async () => {
    const h = makeHarness();
    await h.manager.acquire(TARGET, "view");
    h.manager.shutdown();

    expect(h.session().hibernates).toBe(1);
    expect(h.session().aborts).toBe(0);
    expect(h.manager.size).toBe(0);
  });

  it("shutdown is idempotent and clears pending idle timers", async () => {
    vi.useFakeTimers();
    const h = makeHarness({ idleHibernateMs: 500 });
    await h.manager.acquire(TARGET, "view");
    h.manager.release(TARGET, "view");

    h.manager.shutdown();
    expect(h.session().hibernates).toBe(1);

    vi.advanceTimersByTime(5_000);
    expect(h.session().hibernates).toBe(1);
    expect(() => h.manager.shutdown()).not.toThrow();
  });

  it("send() after shutdown rejects without creating a session", async () => {
    const h = makeHarness();
    h.manager.shutdown();
    await expect(
      h.manager.send(TARGET, { displayText: "hi", origin: "chat", policy: "interactive" }),
    ).rejects.toThrow(/shutting down/);
    expect(h.created).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
//  ManagedConversation handle
// ═══════════════════════════════════════════════════════

describe("ManagedConversation handle", () => {
  it("reports live turn state rather than an acquire-time snapshot", async () => {
    const h = makeHarness();
    const managed = await h.manager.acquire(TARGET, "view");
    expect(managed.hasActiveTurn).toBe(false);
    expect(managed.activeOrigin).toBeNull();
    expect(managed.queuedCount).toBe(0);
    expect(managed.target).toEqual(TARGET);
    expect(managed.session).toBe(h.session().asSession());

    track(
      h.manager.send(TARGET, { displayText: "rev", origin: "revision", policy: "exclusive" }),
    );
    await flush();
    expect(managed.hasActiveTurn).toBe(true);
    expect(managed.activeOrigin).toBe("revision");

    track(h.manager.send(TARGET, { displayText: "chat", origin: "chat", policy: "interactive" }));
    await flush();
    expect(managed.queuedCount).toBe(1);

    h.session().finish();
    await flush();
    expect(managed.activeOrigin).toBe("chat");
  });

  it("reports disposal", async () => {
    const h = makeHarness();
    const managed = await h.manager.acquire(TARGET, "view");
    expect(managed.isDisposed).toBe(false);
    await h.manager.disposeConversation(TARGET);
    expect(managed.isDisposed).toBe(true);
  });
});
