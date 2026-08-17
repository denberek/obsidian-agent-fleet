import { beforeEach, describe, expect, it } from "vitest";
import {
  RevisionManager,
  readOnlyBlockReason,
  type RevisionConversationQueue,
  type RevisionDirectory,
  type RevisionDraftStore,
  type RevisionEvent,
  type RevisionManagerDeps,
  type RevisionSourceAccess,
} from "./revisionManager";
import type {
  ConversationTarget,
  ManagedConversationEvent,
  ManagedTurnRequest,
  ManagedTurnResult,
} from "./inAppConversationManager";
import { createAnchor, hashAnchorText } from "../utils/revisionAnchors";
import type { AgentConfig, RevisionDraft, RevisionNote } from "../types";

// The manager is driven entirely through injected fakes: no vault, no editor,
// no CLI. Every turn boundary (start, stream error, terminal result) is settled
// explicitly by the test, so ordering assertions never depend on timers — a
// sleep here would be the difference between a flaky suite and a real one.

// ═══════════════════════════════════════════════════════
//  Fakes
// ═══════════════════════════════════════════════════════

const DOC_PATH = "notes/launch-brief.md";
const DOC = "# Launch brief\n\nAlpha paragraph text.\n\nBeta paragraph text.\n";
const REVISED_DOC = "# Launch brief\n\nAlpha paragraph, now concrete.\n\nBeta paragraph text.\n";
const AGENT_NAME = "research-writer";
const CONVERSATION_ID = "conv-7d18aa32";

/** Shared, ordered trace of the side effects the outcome matrix depends on. */
type Trace = string[];

class FakeStore implements RevisionDraftStore {
  readonly drafts = new Map<string, RevisionDraft>();
  /** Snapshot of every draft handed to `save()`, in order. */
  readonly saves: RevisionDraft[] = [];
  readonly deletes: string[] = [];
  readonly renames: Array<{ from: string; to: string }> = [];
  deleteError: Error | null = null;

  constructor(private readonly trace: Trace) {}

  seed(draft: RevisionDraft): void {
    this.drafts.set(draft.id, clone(draft));
  }

  getById(id: string): RevisionDraft | null {
    const draft = this.drafts.get(id);
    return draft ? clone(draft) : null;
  }

  getBySourcePath(sourcePath: string): RevisionDraft | null {
    for (const draft of this.drafts.values()) {
      if (draft.sourcePath === sourcePath) return clone(draft);
    }
    return null;
  }

  async save(draft: RevisionDraft): Promise<void> {
    this.trace.push(`save:${draft.status}${draft.submission ? `/${draft.submission.phase}` : ""}`);
    this.saves.push(clone(draft));
    this.drafts.set(draft.id, clone(draft));
  }

  async delete(id: string): Promise<void> {
    this.trace.push("delete");
    if (this.deleteError) throw this.deleteError;
    this.deletes.push(id);
    this.drafts.delete(id);
  }

  async renameSource(from: string, to: string): Promise<void> {
    this.renames.push({ from, to });
    for (const draft of [...this.drafts.values()]) {
      if (draft.sourcePath === from) this.drafts.set(draft.id, { ...draft, sourcePath: to });
    }
  }
}

class FakeSource implements RevisionSourceAccess {
  readonly files = new Map<string, string>([[DOC_PATH, DOC]]);
  readonly reads: string[] = [];
  /** Consumed one per `read()` call; a non-null entry throws instead. */
  readonly readErrors: Array<Error | null> = [];

  constructor(private readonly trace: Trace) {}

  exists(sourcePath: string): boolean {
    return this.files.has(sourcePath);
  }

  async read(sourcePath: string): Promise<string> {
    this.trace.push("read");
    this.reads.push(sourcePath);
    const failure = this.readErrors.shift();
    if (failure) throw failure;
    const content = this.files.get(sourcePath);
    if (content === undefined) throw new Error(`File not found: ${sourcePath}`);
    return content;
  }
}

interface PendingTurn {
  target: ConversationTarget;
  request: ManagedTurnRequest;
  resolve: (result: ManagedTurnResult) => void;
  reject: (error: Error) => void;
  settled: boolean;
}

/**
 * Stand-in for `InAppConversationManager`. Turns stay pending until the test
 * settles them, and `turn-start` is emitted on demand so the queued → running
 * transition can be observed without racing anything.
 */
class FakeQueue implements RevisionConversationQueue {
  readonly turns: PendingTurn[] = [];
  private readonly listeners = new Set<(event: ManagedConversationEvent) => void>();
  /** Subscriptions that have been torn down, for leak assertions. */
  unsubscribes = 0;

  constructor(private readonly trace: Trace) {}

  send(target: ConversationTarget, request: ManagedTurnRequest): Promise<ManagedTurnResult> {
    this.trace.push(`send:${request.policy}:${request.origin}`);
    return new Promise<ManagedTurnResult>((resolve, reject) => {
      this.turns.push({ target, request, resolve, reject, settled: false });
    });
  }

  subscribe(
    _target: ConversationTarget,
    listener: (event: ManagedConversationEvent) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.unsubscribes += 1;
      this.listeners.delete(listener);
    };
  }

  /** The most recent turn that has not been settled yet. */
  get pending(): PendingTurn {
    for (let i = this.turns.length - 1; i >= 0; i -= 1) {
      const turn = this.turns[i];
      if (turn && !turn.settled) return turn;
    }
    throw new Error("No turn is awaiting a result.");
  }

  get hasPending(): boolean {
    return this.turns.some((turn) => !turn.settled);
  }

  /** The managed conversation reports the exclusive turn actually started. */
  startTurn(): void {
    this.emitTurnStart(this.pending.request.requestId);
  }

  /** `turn-start` for an arbitrary request — e.g. an unrelated interactive chat
   *  turn on the same conversation. */
  emitTurnStart(requestId?: string): void {
    this.emit({
      type: "turn-start",
      target: this.pending.target,
      origin: "revision",
      ...(requestId ? { requestId } : {}),
    });
  }

  /** A stream error that does NOT reject the turn (§13.2). */
  streamError(message: string): void {
    this.pending.request.onEvent?.({ type: "error", content: "", errorMessage: message });
  }

  finish(overrides: Partial<ManagedTurnResult> = {}): void {
    const turn = this.pending;
    turn.settled = true;
    turn.resolve({
      text: "Done.",
      toolCalls: [],
      injected: false,
      streamErrors: [],
      ...overrides,
    });
  }

  fail(message: string): void {
    const turn = this.pending;
    turn.settled = true;
    turn.reject(new Error(message));
  }

  private emit(event: ManagedConversationEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

class FakeDirectory implements RevisionDirectory {
  readonly agents = new Map<string, AgentConfig>();
  readonly conversations = new Set<string>();

  getAgent(agentName: string): AgentConfig | null {
    return this.agents.get(agentName) ?? null;
  }

  async hasConversation(agentName: string, conversationId: string): Promise<boolean> {
    return this.conversations.has(`${agentName}::${conversationId}`);
  }
}

// ═══════════════════════════════════════════════════════
//  Builders
// ═══════════════════════════════════════════════════════

function clone(draft: RevisionDraft): RevisionDraft {
  return JSON.parse(JSON.stringify(draft)) as RevisionDraft;
}

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    filePath: `_fleet/agents/${AGENT_NAME}.md`,
    name: AGENT_NAME,
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
    tags: [],
    avatar: "",
    body: "",
    permissionRules: { allow: [], deny: [] },
    isFolder: false,
    ...overrides,
  } as unknown as AgentConfig;
}

function makeNote(
  id: string,
  source: string,
  passage: string,
  comment: string,
  overrides: Partial<RevisionNote> = {},
): RevisionNote {
  const from = source.indexOf(passage);
  if (from < 0) throw new Error(`Test passage not present in source: ${passage}`);
  return {
    id,
    anchor: createAnchor(source, from, from + passage.length),
    comment,
    createdAt: "2026-08-16T10:20:00.000Z",
    updatedAt: "2026-08-16T10:20:00.000Z",
    ...overrides,
  };
}

function makeDraft(overrides: Partial<RevisionDraft> = {}): RevisionDraft {
  return {
    schemaVersion: 1,
    id: "draft-1",
    sourcePath: DOC_PATH,
    status: "collecting",
    destination: { agentName: AGENT_NAME, conversationId: CONVERSATION_ID },
    notes: [makeNote("note-1", DOC, "Alpha paragraph text.", "Make this concrete.")],
    createdAt: "2026-08-16T10:18:00.000Z",
    updatedAt: "2026-08-16T10:20:00.000Z",
    ...overrides,
  };
}

interface Harness {
  manager: RevisionManager;
  store: FakeStore;
  source: FakeSource;
  queue: FakeQueue;
  directory: FakeDirectory;
  events: RevisionEvent[];
  trace: Trace;
  flushCalls: string[];
  /** Set to make the editor flush reject. */
  flushError: { value: Error | null };
}

function harness(options: { draft?: RevisionDraft; deps?: Partial<RevisionManagerDeps> } = {}): Harness {
  const trace: Trace = [];
  const store = new FakeStore(trace);
  const source = new FakeSource(trace);
  const queue = new FakeQueue(trace);
  const directory = new FakeDirectory();
  const events: RevisionEvent[] = [];
  const flushCalls: string[] = [];
  const flushError: { value: Error | null } = { value: null };

  directory.agents.set(AGENT_NAME, makeAgent());
  directory.conversations.add(`${AGENT_NAME}::${CONVERSATION_ID}`);
  store.seed(options.draft ?? makeDraft());

  const manager = new RevisionManager({
    store,
    source,
    conversations: queue,
    directory,
    getEditorFlush: (path) => async () => {
      trace.push("flush");
      flushCalls.push(path);
      if (flushError.value) throw flushError.value;
    },
    getVaultBasePath: () => "/Users/test/vault",
    onEvent: (event) => events.push(event),
    now: () => new Date("2026-08-16T11:00:00.000Z"),
    newAttemptId: () => "attempt-1",
    ...options.deps,
  });

  return { manager, store, source, queue, directory, events, trace, flushCalls, flushError };
}

/** Run a complete turn: start it, optionally mutate the file, then settle it.
 *  Every step is driven by microtask draining, never by a timer. */
async function runTurn(
  h: Harness,
  settle: (queue: FakeQueue) => void,
  options: { start?: boolean; changeFile?: boolean } = {},
): Promise<void> {
  await untilQueued(h);
  if (options.start !== false) h.queue.startTurn();
  await h.manager.flushPendingWrites();
  if (options.changeFile) h.source.files.set(DOC_PATH, REVISED_DOC);
  settle(h.queue);
}

/** Wait until the manager has an unsettled turn on the queue. */
async function untilQueued(h: Harness): Promise<void> {
  for (let i = 0; i < 50 && !h.queue.hasPending; i += 1) {
    await Promise.resolve();
  }
  if (!h.queue.hasPending) throw new Error("The revision was never queued.");
}

// ═══════════════════════════════════════════════════════
//  Validation (§6.7, §21.5)
// ═══════════════════════════════════════════════════════

describe("RevisionManager validation", () => {
  it("blocks a draft with no destination and sends nothing", async () => {
    const draft = makeDraft();
    delete draft.destination;
    const h = harness({ draft });

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("Choose an agent and a conversation");
    expect(h.queue.turns).toHaveLength(0);
    expect(h.store.saves).toHaveLength(0);
    expect(h.events).toEqual([
      { type: "blocked", draftId: "draft-1", sourcePath: DOC_PATH, message: outcome.message },
    ]);
  });

  it("blocks a destination whose agent was deleted", async () => {
    const h = harness();
    h.directory.agents.delete(AGENT_NAME);

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("no longer exists");
    expect(h.queue.turns).toHaveLength(0);
  });

  it("blocks a disabled agent", async () => {
    const h = harness();
    h.directory.agents.set(AGENT_NAME, makeAgent({ enabled: false }));

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("disabled");
  });

  it("blocks a destination whose conversation was deleted", async () => {
    const h = harness();
    h.directory.conversations.clear();

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("conversation");
    expect(h.queue.turns).toHaveLength(0);
    // Notes are untouched by a blocked submission.
    expect(h.store.getById("draft-1")?.notes).toHaveLength(1);
  });

  it("blocks an empty draft", async () => {
    const h = harness({ draft: makeDraft({ notes: [] }) });

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("at least one revision note");
  });

  it("blocks a missing source document", async () => {
    const h = harness();
    h.source.files.delete(DOC_PATH);

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("no longer in the vault");
    expect(h.store.getById("draft-1")?.notes).toHaveLength(1);
  });

  it("blocks an unknown draft id", async () => {
    const h = harness();

    const outcome = await h.manager.submit("does-not-exist");

    expect(outcome.reason).toBe("blocked");
    expect(h.queue.turns).toHaveLength(0);
  });

  it("blocks when the editor flush fails, before anything is read or sent", async () => {
    const h = harness();
    h.flushError.value = new Error("disk full");

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("disk full");
    expect(h.trace).toEqual(["flush"]);
  });

  it("blocks when the fresh read fails", async () => {
    const h = harness();
    h.source.readErrors.push(new Error("EIO"));

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("EIO");
    expect(h.queue.turns).toHaveLength(0);
  });

  it("blocks an orphaned note and persists the orphan flag for the panel", async () => {
    const h = harness();
    // The annotated passage no longer exists anywhere in the document.
    h.source.files.set(DOC_PATH, "# Launch brief\n\nCompletely different prose.\n");

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("Reattach or delete");
    expect(h.queue.turns).toHaveLength(0);
    const stored = h.store.getById("draft-1");
    expect(stored?.notes[0]?.orphaned).toBe(true);
    expect(stored?.notes).toHaveLength(1);
  });

  it("pluralizes the orphan message for several broken notes", async () => {
    const draft = makeDraft({
      notes: [
        makeNote("note-1", DOC, "Alpha paragraph text.", "Make this concrete."),
        makeNote("note-2", DOC, "Beta paragraph text.", "Shorten this."),
      ],
    });
    const h = harness({ draft });
    h.source.files.set(DOC_PATH, "# Launch brief\n\nCompletely different prose.\n");

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.message).toContain("2 notes no longer match");
  });
});

// ═══════════════════════════════════════════════════════
//  Read-only detection (§6.3)
// ═══════════════════════════════════════════════════════

describe("read-only agent detection", () => {
  const blocked: Array<[string, string]> = [
    ["claude-code", "plan"],
    ["pi", "plan"],
    ["pi", "read-only"],
    ["codex", "read-only"],
    // Historical adapter spellings normalize to the same ids.
    ["pi-coding-agent", "plan"],
    ["openai-codex", "read-only"],
  ];
  for (const [adapter, permissionMode] of blocked) {
    it(`blocks ${adapter} in ${permissionMode} mode`, () => {
      const reason = readOnlyBlockReason(makeAgent({ adapter, permissionMode }));
      expect(reason).toContain("cannot edit files");
    });
  }

  const allowed: Array<[string, string]> = [
    ["claude-code", "bypassPermissions"],
    ["claude-code", "acceptEdits"],
    ["claude-code", "dontAsk"],
    ["claude-code", "default"],
    ["codex", "workspace-write"],
    ["codex", "danger-full-access"],
    ["pi", "acceptEdits"],
    // Unknown adapter values normalize to claude-code, where only `plan` blocks.
    ["something-new", "auto"],
  ];
  for (const [adapter, permissionMode] of allowed) {
    it(`allows ${adapter} in ${permissionMode} mode`, () => {
      expect(readOnlyBlockReason(makeAgent({ adapter, permissionMode }))).toBeNull();
    });
  }

  it("refuses to submit to a known read-only agent", async () => {
    const h = harness();
    h.directory.agents.set(AGENT_NAME, makeAgent({ adapter: "codex", permissionMode: "read-only" }));

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(outcome.message).toContain("cannot edit files");
    expect(h.queue.turns).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
//  Ordering and queue transitions (§6.7, §13.1)
// ═══════════════════════════════════════════════════════

describe("RevisionManager submission ordering", () => {
  it("flushes the editor, reads fresh source, persists queued, then queues the turn", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);

    expect(h.trace).toEqual(["flush", "read", "save:submitting/queued", "send:exclusive:revision"]);
    expect(h.flushCalls).toEqual([DOC_PATH]);

    h.queue.startTurn();
    h.source.files.set(DOC_PATH, REVISED_DOC);
    h.queue.finish();
    await submission;
  });

  it("sends one exclusive revision turn with revision message metadata", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    const { target, request } = h.queue.pending;

    expect(target).toEqual({ agentName: AGENT_NAME, conversationId: CONVERSATION_ID });
    expect(request.origin).toBe("revision");
    expect(request.policy).toBe("exclusive");
    expect(request.requestId).toBe("attempt-1");
    expect(request.messageMeta).toEqual({
      origin: "revision",
      revision: { draftId: "draft-1", documentPath: DOC_PATH, noteCount: 1 },
    });

    await runTurn(h, (q) => q.finish(), { changeFile: true });
    await submission;
  });

  it("keeps the absolute path out of the persisted chat text and in the CLI text", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    const { request } = h.queue.pending;

    expect(request.displayText).toContain(DOC_PATH);
    expect(request.displayText).toContain("Make this concrete.");
    expect(request.displayText).not.toContain("/Users/test/vault");
    expect(request.fullText).toContain("/Users/test/vault/notes/launch-brief.md");
    expect(request.fullText).toContain("Edit the existing file in place.");

    await runTurn(h, (q) => q.finish(), { changeFile: true });
    await submission;
  });

  it("re-resolves anchors against the fresh read before building the prompt", async () => {
    const h = harness();
    // The document gained a paragraph above the annotated passage since the
    // draft was written, so the stored offsets are stale.
    const shifted = `# Launch brief\n\nBrand new intro paragraph.\n\nAlpha paragraph text.\n\nBeta paragraph text.\n`;
    h.source.files.set(DOC_PATH, shifted);
    const staleFrom = h.store.getById("draft-1")?.notes[0]?.anchor.from ?? -1;

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);

    const persisted = h.store.getById("draft-1");
    expect(persisted?.notes[0]?.anchor.from).toBe(shifted.indexOf("Alpha paragraph text."));
    expect(persisted?.notes[0]?.anchor.from).not.toBe(staleFrom);
    expect(persisted?.notes[0]?.orphaned).toBeUndefined();
    // Line metadata follows the relocated anchor, not the stale offsets.
    expect(h.queue.pending.request.fullText).toContain("Location: line 5");

    h.source.files.set(DOC_PATH, `${shifted}\nrevised\n`);
    await runTurn(h, (q) => q.finish());
    await submission;
  });

  it("moves queued → running when the managed conversation starts the turn", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    expect(h.manager.getPhase("draft-1")).toBe("queued");
    expect(h.store.getById("draft-1")?.submission?.phase).toBe("queued");

    h.queue.startTurn();
    await h.manager.flushPendingWrites();

    expect(h.manager.getPhase("draft-1")).toBe("running");
    const running = h.store.getById("draft-1");
    expect(running?.status).toBe("submitting");
    expect(running?.submission?.phase).toBe("running");
    expect(running?.submission?.startedAt).toBe("2026-08-16T11:00:00.000Z");

    h.source.files.set(DOC_PATH, REVISED_DOC);
    h.queue.finish();
    await submission;
  });

  it("ignores turn-start events belonging to another request", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    // A `turn-start` for somebody else's request on the same conversation.
    h.queue.emitTurnStart("someone-else");
    await h.manager.flushPendingWrites();

    expect(h.manager.getPhase("draft-1")).toBe("queued");

    await runTurn(h, (q) => q.finish(), { changeFile: true });
    await submission;
  });

  it("persists queued → running → verifying in order and releases the subscription", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.finish(), { changeFile: true });
    await submission;

    expect(h.store.saves.map((draft) => draft.submission?.phase)).toEqual([
      "queued",
      "running",
      "verifying",
    ]);
    expect(h.queue.unsubscribes).toBe(1);
  });

  it("records the pre-send hash on the persisted submission", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);

    expect(h.store.getById("draft-1")?.submission?.sourceHashBefore).toBe(hashAnchorText(DOC));

    await runTurn(h, (q) => q.finish(), { changeFile: true });
    await submission;
  });
});

// ═══════════════════════════════════════════════════════
//  Outcome matrix (§13.2)
// ═══════════════════════════════════════════════════════

describe("RevisionManager outcome matrix", () => {
  it("succeeds when a clean turn changed the file, deleting the sidecar before announcing", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.finish(), { changeFile: true });
    const outcome = await submission;

    expect(outcome).toMatchObject({
      ok: true,
      reason: "success",
      sourceChanged: true,
      destination: { agentName: AGENT_NAME, conversationId: CONVERSATION_ID },
      errors: [],
    });
    expect(h.store.deletes).toEqual(["draft-1"]);
    expect(h.store.getById("draft-1")).toBeNull();
    // Deletion is the last trace entry before completion is announced.
    expect(h.trace[h.trace.length - 1]).toBe("delete");
    const completedIndex = h.events.findIndex((event) => event.type === "completed");
    expect(completedIndex).toBeGreaterThanOrEqual(0);
    expect(h.events[completedIndex]).toEqual({
      type: "completed",
      draftId: "draft-1",
      sourcePath: DOC_PATH,
      destination: { agentName: AGENT_NAME, conversationId: CONVERSATION_ID },
      noteCount: 1,
    });
    // Nothing after the completion event: no stray attention state.
    expect(h.events.slice(completedIndex + 1)).toEqual([]);
  });

  it("carries the exact destination on the completion event even when the agent has two conversations", async () => {
    const other = "conv-other";
    const h = harness({
      draft: makeDraft({ destination: { agentName: AGENT_NAME, conversationId: other } }),
    });
    h.directory.conversations.add(`${AGENT_NAME}::${other}`);

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    const routedTo = h.queue.pending.target;
    await runTurn(h, (q) => q.finish(), { changeFile: true });
    const outcome = await submission;

    expect(routedTo).toEqual({ agentName: AGENT_NAME, conversationId: other });
    expect(outcome.destination).toEqual({ agentName: AGENT_NAME, conversationId: other });
    const completed = h.events.find((event) => event.type === "completed");
    expect(completed).toMatchObject({ destination: { agentName: AGENT_NAME, conversationId: other } });
  });

  it("retains notes when a clean turn did not change the file", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.finish());
    const outcome = await submission;

    expect(outcome).toMatchObject({ ok: false, reason: "no-change", sourceChanged: false });
    expect(outcome.message).toContain("did not change");
    expect(h.store.deletes).toEqual([]);
    const stored = h.store.getById("draft-1");
    expect(stored?.status).toBe("attention");
    expect(stored?.notes).toHaveLength(1);
    expect(stored?.attentionMessage).toBe(outcome.message);
    expect(h.events.some((event) => event.type === "attention")).toBe(true);
    expect(h.events.some((event) => event.type === "completed")).toBe(false);
  });

  it("treats a stream error as failure even when the turn resolves", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    h.queue.startTurn();
    await h.manager.flushPendingWrites();
    h.queue.streamError("Claude CLI exited with code 1");
    h.queue.finish();
    const outcome = await submission;

    expect(outcome).toMatchObject({ ok: false, reason: "turn-failed", sourceChanged: false });
    expect(outcome.errors).toEqual(["Claude CLI exited with code 1"]);
    expect(h.store.deletes).toEqual([]);
    expect(h.store.getById("draft-1")?.notes).toHaveLength(1);
  });

  it("fails on stream errors reported only through the turn result", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.finish({ streamErrors: ["watchdog timeout"] }), { changeFile: true });
    const outcome = await submission;

    expect(outcome.reason).toBe("turn-failed-file-changed");
    expect(outcome.errors).toEqual(["watchdog timeout"]);
    expect(h.store.deletes).toEqual([]);
  });

  it("warns distinctly when the turn failed but the document changed", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.fail("Aborted"), { changeFile: true });
    const outcome = await submission;

    expect(outcome).toMatchObject({
      ok: false,
      reason: "turn-failed-file-changed",
      sourceChanged: true,
    });
    expect(outcome.message).toContain(
      "The document changed, but the revision turn did not complete.",
    );
    expect(h.store.deletes).toEqual([]);
    const stored = h.store.getById("draft-1");
    expect(stored?.status).toBe("attention");
    expect(stored?.notes).toHaveLength(1);
    expect(stored?.submission?.error).toBe(outcome.message);
    const attention = h.events.find((event) => event.type === "attention");
    expect(attention).toMatchObject({ sourceChanged: true });
  });

  it("retains notes when the turn rejects and the file is untouched", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.fail("Conversation \"conv-7d18aa32\" was deleted"));
    const outcome = await submission;

    expect(outcome.reason).toBe("turn-failed");
    expect(outcome.message).toContain("was deleted");
    expect(h.store.getById("draft-1")?.notes).toHaveLength(1);
    expect(h.store.deletes).toEqual([]);
  });

  it("enters attention when the sidecar cannot be deleted after a successful edit", async () => {
    const h = harness();
    h.store.deleteError = new Error("file is locked");

    const submission = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.finish(), { changeFile: true });
    const outcome = await submission;

    expect(outcome).toMatchObject({ ok: false, reason: "cleanup-failed", sourceChanged: true });
    expect(outcome.message).toContain("could not be cleared");
    const stored = h.store.getById("draft-1");
    expect(stored?.status).toBe("attention");
    expect(stored?.notes).toHaveLength(1);
    expect(h.events.some((event) => event.type === "completed")).toBe(false);
  });

  it("enters attention when the file cannot be re-read for verification", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    h.queue.startTurn();
    await h.manager.flushPendingWrites();
    h.source.readErrors.push(new Error("ENOENT"));
    h.queue.finish();
    const outcome = await submission;

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("could not be re-read");
    expect(h.store.deletes).toEqual([]);
    expect(h.store.getById("draft-1")?.notes).toHaveLength(1);
  });

  it("never deletes notes on any failure path", async () => {
    const failures: Array<(q: FakeQueue) => void> = [
      (q) => q.fail("boom"),
      (q) => q.finish({ streamErrors: ["bad"] }),
      (q) => q.finish(),
    ];
    for (const settle of failures) {
      const h = harness();
      const submission = h.manager.submit("draft-1");
      await runTurn(h, settle);
      const outcome = await submission;
      expect(outcome.ok).toBe(false);
      expect(h.store.deletes).toEqual([]);
      expect(h.store.getById("draft-1")?.notes).toHaveLength(1);
    }
  });
});

// ═══════════════════════════════════════════════════════
//  Concurrency and lifecycle (§14)
// ═══════════════════════════════════════════════════════

describe("RevisionManager concurrency and lifecycle", () => {
  it("dedups concurrent submissions of one draft into a single turn", async () => {
    const h = harness();

    const first = h.manager.submit("draft-1");
    const second = h.manager.submit("draft-1");
    expect(second).toBe(first);
    await untilQueued(h);
    // A third caller arriving after the turn was queued still shares it.
    const third = h.manager.submit("draft-1");
    expect(third).toBe(first);

    await runTurn(h, (q) => q.finish(), { changeFile: true });
    const [a, b, c] = await Promise.all([first, second, third]);

    expect(h.queue.turns).toHaveLength(1);
    expect(h.store.saves.filter((draft) => draft.submission?.phase === "queued")).toHaveLength(1);
    expect(a.ok && b.ok && c.ok).toBe(true);
  });

  it("releases the lock so a failed revision can be retried", async () => {
    const h = harness();

    const first = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.fail("boom"));
    await first;
    expect(h.manager.isSubmitting("draft-1")).toBe(false);
    expect(h.manager.getPhase("draft-1")).toBeNull();

    const retry = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.finish(), { changeFile: true });
    const outcome = await retry;

    expect(outcome.ok).toBe(true);
    expect(h.queue.turns).toHaveLength(2);
    expect(h.store.deletes).toEqual(["draft-1"]);
  });

  it("submits two different drafts independently", async () => {
    const h = harness();
    const secondPath = "notes/other.md";
    h.source.files.set(secondPath, DOC);
    h.store.seed(makeDraft({ id: "draft-2", sourcePath: secondPath }));

    const first = h.manager.submit("draft-1");
    const second = h.manager.submit("draft-2");
    await untilQueued(h);
    for (let i = 0; i < 20 && h.queue.turns.length < 2; i += 1) await Promise.resolve();

    expect(h.queue.turns).toHaveLength(2);
    expect(h.manager.isSubmitting("draft-1")).toBe(true);
    expect(h.manager.isSubmitting("draft-2")).toBe(true);

    h.source.files.set(DOC_PATH, REVISED_DOC);
    h.source.files.set(secondPath, REVISED_DOC);
    h.queue.turns[0]?.resolve({ text: "", toolCalls: [], injected: false, streamErrors: [] });
    h.queue.turns[1]?.resolve({ text: "", toolCalls: [], injected: false, streamErrors: [] });

    expect((await first).ok).toBe(true);
    expect((await second).ok).toBe(true);
  });

  it("leaves recoverable persisted state when the plugin shuts down mid-turn", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    h.queue.startTurn();
    await h.manager.flushPendingWrites();

    const savesBeforeShutdown = h.store.saves.length;
    h.manager.shutdown();
    // Shutdown aborts the managed turn, which rejects the queued send.
    h.queue.fail("Aborted");
    const outcome = await submission;

    expect(outcome.reason).toBe("interrupted");
    expect(h.store.saves).toHaveLength(savesBeforeShutdown);
    expect(h.store.deletes).toEqual([]);
    // Still `submitting` on disk — RevisionStore.loadAll() recovers it into
    // attention on next load (§8.5).
    const stored = h.store.getById("draft-1");
    expect(stored?.status).toBe("submitting");
    expect(stored?.submission?.phase).toBe("running");
    expect(stored?.notes).toHaveLength(1);
    const attention = h.events.filter((event) => event.type === "attention");
    expect(attention).toHaveLength(1);
    expect(attention[0]).toMatchObject({ draftId: "draft-1" });
  });

  it("refuses new submissions after shutdown", async () => {
    const h = harness();
    h.manager.shutdown();

    const outcome = await h.manager.submit("draft-1");

    expect(outcome.reason).toBe("blocked");
    expect(h.queue.turns).toHaveLength(0);
  });

  it("reports a draft discarded mid-turn as interrupted rather than success", async () => {
    const h = harness();

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);
    h.queue.startTurn();
    await h.manager.flushPendingWrites();
    // The user discarded the draft while the agent was working.
    h.store.drafts.delete("draft-1");
    h.source.files.set(DOC_PATH, REVISED_DOC);
    h.queue.finish();
    const outcome = await submission;

    expect(outcome).toMatchObject({ ok: false, reason: "interrupted" });
    expect(h.store.deletes).toEqual([]);
    expect(h.events.some((event) => event.type === "completed")).toBe(false);
  });

  it("keeps notes when the source document is deleted", async () => {
    const h = harness();

    await h.manager.onSourceDeleted(DOC_PATH);

    const stored = h.store.getById("draft-1");
    expect(stored?.status).toBe("attention");
    expect(stored?.notes).toHaveLength(1);
    expect(stored?.attentionMessage).toContain("was deleted");
  });

  it("follows a source rename", async () => {
    const h = harness();

    await h.manager.onSourceRenamed(DOC_PATH, "notes/renamed.md");

    expect(h.store.renames).toEqual([{ from: DOC_PATH, to: "notes/renamed.md" }]);
    expect(h.store.getById("draft-1")?.sourcePath).toBe("notes/renamed.md");
  });

  it("does not fail a submission when an event listener throws", async () => {
    const h = harness({
      deps: {
        onEvent: () => {
          throw new Error("subscriber exploded");
        },
      },
    });

    const submission = h.manager.submit("draft-1");
    await runTurn(h, (q) => q.finish(), { changeFile: true });

    expect((await submission).ok).toBe(true);
  });

  it("resolves the turn without a vault base path by falling back to the vault path", async () => {
    const h = harness({ deps: { getVaultBasePath: () => undefined } });

    const submission = h.manager.submit("draft-1");
    await untilQueued(h);

    expect(h.queue.pending.request.fullText).toContain(`Absolute path: \`${DOC_PATH}\``);

    await runTurn(h, (q) => q.finish(), { changeFile: true });
    await submission;
  });
});

describe("RevisionManager without an open editor", () => {
  let h: Harness;

  beforeEach(() => {
    h = harness({ deps: { getEditorFlush: () => null } });
  });

  it("reads the document directly when no view has it open", async () => {
    const submission = h.manager.submit("draft-1");
    await untilQueued(h);

    expect(h.trace).toEqual(["read", "save:submitting/queued", "send:exclusive:revision"]);

    await runTurn(h, (q) => q.finish(), { changeFile: true });
    expect((await submission).ok).toBe(true);
  });
});
