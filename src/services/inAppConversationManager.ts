import type { Vault } from "obsidian";
import type {
  AgentConfig,
  ChatMessageMetadata,
  FleetSettings,
  UsageRecord,
} from "../types";
import type { FleetRepository } from "../fleetRepository";
import type { McpAuthManager } from "./mcpAuth";
import { ChatSession, type StreamEvent, type ToolCall } from "./chatSession";

/**
 * Shared ownership of in-app (Obsidian chat panel) conversation sessions.
 *
 * WHY THIS EXISTS: `AgentChatView` used to own a private
 * `Map<string, ChatSession>`. Any second consumer — Revision mode sends to a
 * conversation with no chat panel open — would construct a competing
 * `ChatSession` for the same conversation and race the provider session id,
 * the conversation JSON, the single `turnResolve`/`turnReject` slots, message
 * ordering, and usage accounting. This manager is the single owner of one
 * `ChatSession` per exact `agentName::conversationId` pair, plus the FIFO turn
 * queue that keeps two callers from overlapping turns on one session.
 *
 * SCOPE: in-app top-level conversations only. Channel sessions stay owned by
 * `ChannelManager` — they have their own transport routing, rate limiting and
 * eviction policy, and moving them here would conflate two lifecycles.
 *
 * Threads remain owned by their parent `ChatSession`
 * (`openOrCreateThread`) — this manager never creates or serializes them.
 */

/** Exact in-app conversation address. Conversation ids are opaque: they are
 *  used verbatim as map keys and handed to `ChatSession`, which owns the
 *  on-disk slugification. */
export interface ConversationTarget {
  agentName: string;
  conversationId: string;
}

/** Who asked for a turn. Recorded on events and on the stored user message so
 *  the chat view can render a revision request differently from typed chat. */
export type ManagedTurnOrigin = "chat" | "revision";

/**
 * `interactive` — ordinary chat. Folds into a running interactive turn via
 * `ChatSession.injectMessage()` exactly as the chat view did before.
 * `exclusive` — owns a complete `sendMessage()` from start to terminal result.
 * Never injected into somebody else's turn, and never interrupted by one.
 */
export type ManagedTurnPolicy = "interactive" | "exclusive";

export interface ManagedConversationEvent {
  type: "turn-start" | "stream" | "turn-end" | "queued" | "messages-changed";
  /** The conversation this event belongs to. */
  target: ConversationTarget;
  origin: ManagedTurnOrigin;
  /** Echo of `ManagedTurnRequest.requestId`, when the caller supplied one. Lets
   *  a subscriber that is also the sender avoid double-rendering its own turn. */
  requestId?: string;
  /** Present on `stream`. */
  streamEvent?: StreamEvent;
  /** User-visible text for `turn-start`, `queued`, and injected
   *  `messages-changed` events, so a view can render a turn it did not send. */
  displayText?: string;
  attachments?: string[];
  messageMeta?: ChatMessageMetadata;
  /** Set on `turn-end` when the turn rejected (CLI failure, watchdog, abort). */
  error?: string;
  /** Set on `messages-changed` when the message was folded into a live turn. */
  injected?: boolean;
}

export interface ManagedTurnRequest {
  /** Stored in history and rendered in the chat bubble. */
  displayText: string;
  /** Sent to the CLI instead of `displayText` when set (attachments, the
   *  CLI-only revision instructions, …). Never stored in history. */
  fullText?: string;
  attachments?: string[];
  origin: ManagedTurnOrigin;
  policy: ManagedTurnPolicy;
  /** Optional metadata persisted on the stored user `ChatMessage`. */
  messageMeta?: ChatMessageMetadata;
  /** Per-request stream listener. Receives exactly the events the shared
   *  subscribers receive, for the lifetime of this request's turn. */
  onEvent?: (event: StreamEvent) => void;
  /** Caller-minted correlation id, echoed on every event for this request. */
  requestId?: string;
}

export interface ManagedTurnResult {
  text: string;
  toolCalls: ToolCall[];
  /** True when the request was folded into an already-running interactive turn
   *  rather than owning its own `sendMessage()`. */
  injected: boolean;
  /** Every `StreamEvent` of type `error` seen during the turn. A turn can
   *  resolve normally and still have reported errors — callers that must
   *  fail closed (Revision mode) check this. */
  streamErrors: string[];
}

/** Arguments handed to the injected session factory. Tests supply a fake
 *  session; production builds a real `ChatSession`. */
export interface ManagedSessionFactoryArgs {
  agent: AgentConfig;
  settings: FleetSettings;
  repository: FleetRepository;
  vault: Vault;
  /** Opaque in-app conversation id, passed through verbatim. */
  conversationId: string;
  mcpAuth?: McpAuthManager;
}

export interface InAppConversationManagerDeps {
  /** Live getter — the plugin rebuilds its repository in `saveSettings()`, so a
   *  captured reference would go stale. */
  getRepository: () => FleetRepository;
  /** Live getter for the same reason. */
  getSettings: () => FleetSettings;
  vault: Vault;
  getMcpAuth?: () => McpAuthManager | undefined;
  /** Usage-ledger sink, late-bound to the current runtime. */
  recordUsage?: (record: UsageRecord) => void;
  /** Injected session factory. Omit in production. */
  createSession?: (args: ManagedSessionFactoryArgs) => ChatSession;
  /** How long an entry with no consumers and no work waits before its
   *  subprocess is hibernated. The `ChatSession` object and provider session
   *  id are retained, so the next turn resumes transparently. */
  idleHibernateMs?: number;
}

interface QueuedTurn {
  request: ManagedTurnRequest;
  resolve: (result: ManagedTurnResult) => void;
  reject: (error: Error) => void;
}

interface ActiveTurn {
  origin: ManagedTurnOrigin;
  policy: ManagedTurnPolicy;
  requestId?: string;
  /** Caller callbacks: the request that owns the turn, plus any interactive
   *  follow-ups injected into it. */
  listeners: Array<(event: StreamEvent) => void>;
  /** Injected follow-ups waiting on this turn's terminal result. */
  injected: QueuedTurn[];
  streamErrors: string[];
}

interface ConversationEntry {
  key: string;
  target: ConversationTarget;
  session: ChatSession;
  /** Resolved once, shared by every concurrent `acquire()`/`send()`. */
  loadPromise: Promise<void>;
  consumers: Set<string>;
  activeTurn: ActiveTurn | null;
  queue: QueuedTurn[];
  pumping: boolean;
  idleTimer: number | null;
  hibernated: boolean;
  disposed: boolean;
}

/** Live handle on a managed conversation. Holds the entry, so `session` always
 *  reflects the current instance rather than a snapshot taken at acquire time. */
export class ManagedConversation {
  constructor(private readonly entry: ConversationEntry) {}

  get target(): ConversationTarget {
    return this.entry.target;
  }

  /** The shared engine. Read state from it and open threads on it; do NOT call
   *  `sendMessage()`/`injectMessage()` directly — route turns through
   *  `InAppConversationManager.send()` so the queue stays authoritative. */
  get session(): ChatSession {
    return this.entry.session;
  }

  get hasActiveTurn(): boolean {
    return this.entry.activeTurn !== null;
  }

  get activeOrigin(): ManagedTurnOrigin | null {
    return this.entry.activeTurn?.origin ?? null;
  }

  get queuedCount(): number {
    return this.entry.queue.length;
  }

  get isDisposed(): boolean {
    return this.entry.disposed;
  }
}

/** Exact key for one in-app conversation. Ids are opaque — never slugified. */
export function conversationKey(agentName: string, conversationId: string): string {
  return `${agentName}::${conversationId}`;
}

const DEFAULT_IDLE_HIBERNATE_MS = 5 * 60_000;

export class InAppConversationManager {
  private readonly entries = new Map<string, ConversationEntry>();
  /** Subscribers live outside the entry so a subscription survives a session
   *  being disposed and re-created (and unsubscribing never resurrects one). */
  private readonly subscribers = new Map<string, Set<(event: ManagedConversationEvent) => void>>();
  private readonly idleHibernateMs: number;
  private isShutdown = false;

  constructor(private readonly deps: InAppConversationManagerDeps) {
    this.idleHibernateMs = deps.idleHibernateMs ?? DEFAULT_IDLE_HIBERNATE_MS;
  }

  // ═══════════════════════════════════════════════════════
  //  Acquisition
  // ═══════════════════════════════════════════════════════

  /**
   * Get (creating and loading on first use) the shared conversation and
   * register a consumer. Concurrent calls for the same pair return the same
   * session and load persisted state exactly once.
   */
  async acquire(target: ConversationTarget, consumerId: string): Promise<ManagedConversation> {
    const entry = await this.ensureEntry(target);
    entry.consumers.add(consumerId);
    this.cancelIdleTimer(entry);
    return new ManagedConversation(entry);
  }

  /** Drop a consumer reference. Never aborts a running turn — another consumer
   *  (a queued revision, say) may still own it. */
  release(target: ConversationTarget, consumerId: string): void {
    const entry = this.entries.get(conversationKey(target.agentName, target.conversationId));
    if (!entry) return;
    entry.consumers.delete(consumerId);
    this.maybeScheduleIdle(entry);
  }

  /** Non-creating lookup. Returns undefined when nothing is cached. */
  peek(target: ConversationTarget): ManagedConversation | undefined {
    const entry = this.entries.get(conversationKey(target.agentName, target.conversationId));
    return entry ? new ManagedConversation(entry) : undefined;
  }

  /** Subscribe to every event for one conversation. Fired for turns started by
   *  any consumer, so a visible chat view renders a revision turn live. */
  subscribe(
    target: ConversationTarget,
    listener: (event: ManagedConversationEvent) => void,
  ): () => void {
    const key = conversationKey(target.agentName, target.conversationId);
    let set = this.subscribers.get(key);
    if (!set) {
      set = new Set();
      this.subscribers.set(key, set);
    }
    set.add(listener);
    return () => {
      const current = this.subscribers.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.subscribers.delete(key);
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Turn scheduling
  // ═══════════════════════════════════════════════════════

  /**
   * Queue (or fold in) one turn. Resolution order — see REVISION_MODE_DESIGN
   * §11.4:
   *
   *  1. idle + interactive              → start now
   *  2. interactive during interactive  → `injectMessage()` (unchanged live
   *                                       follow-up behavior)
   *  3. exclusive during any turn       → enqueue
   *  4. interactive during exclusive    → enqueue, never inject
   *  5. interactive behind a QUEUED exclusive → enqueue (FIFO preserved)
   *  6. multiple exclusives             → FIFO
   */
  async send(target: ConversationTarget, request: ManagedTurnRequest): Promise<ManagedTurnResult> {
    if (this.isShutdown) {
      throw new Error("Agent Fleet is shutting down — the conversation turn was not sent.");
    }
    const entry = await this.ensureEntry(target);
    if (entry.disposed) {
      throw new Error(
        `Conversation "${target.conversationId}" for agent "${target.agentName}" is no longer available.`,
      );
    }

    const active = entry.activeTurn;
    const canInject =
      request.policy === "interactive" &&
      active !== null &&
      active.policy === "interactive" &&
      // Anything already queued (an exclusive revision, or interactive work
      // behind it) must run first — injecting would jump the queue and could
      // land inside a turn the user meant to follow.
      entry.queue.length === 0;

    if (canInject && active) {
      entry.session.injectMessage(request.displayText, request.fullText, request.attachments, {
        metadata: request.messageMeta,
      });
      if (request.onEvent) active.listeners.push(request.onEvent);
      this.emit(entry, {
        type: "messages-changed",
        target: entry.target,
        origin: request.origin,
        requestId: request.requestId,
        displayText: request.displayText,
        attachments: request.attachments,
        messageMeta: request.messageMeta,
        injected: true,
      });
      return new Promise<ManagedTurnResult>((resolve, reject) => {
        active.injected.push({ request, resolve, reject });
      });
    }

    return new Promise<ManagedTurnResult>((resolve, reject) => {
      entry.queue.push({ request, resolve, reject });
      if (entry.activeTurn || entry.queue.length > 1) {
        this.emit(entry, {
          type: "queued",
          target: entry.target,
          origin: request.origin,
          requestId: request.requestId,
          displayText: request.displayText,
          attachments: request.attachments,
          messageMeta: request.messageMeta,
        });
      }
      this.pump(entry);
    });
  }

  private pump(entry: ConversationEntry): void {
    if (entry.pumping) return;
    entry.pumping = true;
    void (async () => {
      try {
        while (!entry.disposed && !entry.activeTurn && entry.queue.length > 0) {
          const next = entry.queue.shift();
          if (!next) break;
          await this.runTurn(entry, next);
        }
      } finally {
        entry.pumping = false;
      }
    })();
  }

  private async runTurn(entry: ConversationEntry, queued: QueuedTurn): Promise<void> {
    const { request } = queued;
    const active: ActiveTurn = {
      origin: request.origin,
      policy: request.policy,
      requestId: request.requestId,
      listeners: request.onEvent ? [request.onEvent] : [],
      injected: [],
      streamErrors: [],
    };
    entry.activeTurn = active;
    entry.hibernated = false;
    this.cancelIdleTimer(entry);

    this.emit(entry, {
      type: "turn-start",
      target: entry.target,
      origin: request.origin,
      requestId: request.requestId,
      displayText: request.displayText,
      attachments: request.attachments,
      messageMeta: request.messageMeta,
    });

    const onEvent = (event: StreamEvent): void => {
      if (event.type === "error") {
        active.streamErrors.push(event.errorMessage?.trim() || "stream error");
      }
      this.emit(entry, {
        type: "stream",
        target: entry.target,
        origin: request.origin,
        requestId: request.requestId,
        streamEvent: event,
      });
      // Copy: a listener may be appended mid-turn by an injected follow-up.
      for (const listener of [...active.listeners]) {
        try {
          listener(event);
        } catch (err) {
          console.warn("Agent Fleet: conversation stream listener threw", err);
        }
      }
    };

    try {
      const result = await entry.session.sendMessage(
        request.displayText,
        onEvent,
        request.fullText,
        request.attachments,
        { metadata: request.messageMeta },
      );
      // ChatSession resolves the provider turn after enqueuing its conversation
      // write. Do not report managed completion (or let Revision delete its
      // notes) until that exact request/response is durable.
      await entry.session.flushPersistence();
      if (entry.disposed) {
        throw new Error(
          `Conversation "${entry.target.conversationId}" was deleted before the turn completed.`,
        );
      }
      const base: ManagedTurnResult = {
        text: result.text,
        toolCalls: result.toolCalls,
        injected: false,
        streamErrors: [...active.streamErrors],
      };
      entry.activeTurn = null;
      queued.resolve(base);
      for (const follow of active.injected) {
        follow.resolve({ ...base, injected: true, streamErrors: [...active.streamErrors] });
      }
      this.emit(entry, {
        type: "turn-end",
        target: entry.target,
        origin: request.origin,
        requestId: request.requestId,
      });
      this.emit(entry, {
        type: "messages-changed",
        target: entry.target,
        origin: request.origin,
        requestId: request.requestId,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      entry.activeTurn = null;
      queued.reject(error);
      for (const follow of active.injected) follow.reject(error);
      this.emit(entry, {
        type: "turn-end",
        target: entry.target,
        origin: request.origin,
        requestId: request.requestId,
        error: error.message,
      });
    } finally {
      entry.activeTurn = null;
      this.maybeScheduleIdle(entry);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════

  /**
   * Permanent teardown for one conversation — used when the user deletes it.
   * Queued work is rejected (it can never run), the session and every thread
   * sub-session are disposed, and the entry is dropped.
   */
  async disposeConversation(target: ConversationTarget): Promise<void> {
    const key = conversationKey(target.agentName, target.conversationId);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    entry.disposed = true;
    this.cancelIdleTimer(entry);
    this.rejectQueued(
      entry,
      `Conversation "${target.conversationId}" was deleted — its queued turn was not sent.`,
    );
    entry.consumers.clear();
    try {
      // Tear down every live turn/thread, then drain writes already queued by
      // their terminal events before the repository trashes the files.
      await entry.session.disposeAndFlushPersistence();
    } catch (err) {
      // Deletion should still proceed when the final save itself failed; the
      // barrier has nevertheless settled, so no late write remains queued.
      console.warn(`Agent Fleet: disposing conversation ${key} failed`, err);
    }
  }

  /** Point every cached session at the current repository/settings/MCP/usage
   *  sink. Call from `saveSettings()`, which rebuilds both the repository and
   *  the runtime under the manager. */
  refreshDependencies(): void {
    const repository = this.deps.getRepository();
    const settings = this.deps.getSettings();
    const mcpAuth = this.deps.getMcpAuth?.();
    for (const entry of this.entries.values()) {
      try {
        entry.session.refreshDependencies({
          repository,
          settings,
          mcpAuth,
          usageRecorder: this.deps.recordUsage,
        });
      } catch (err) {
        console.warn(`Agent Fleet: refreshing conversation ${entry.key} failed`, err);
      }
    }
  }

  /**
   * Plugin unload. Queued work is rejected with an actionable message (it was
   * never delivered to a CLI), active turns are aborted, idle sessions are
   * hibernated, and the cache is cleared. Deterministic: after this call no
   * entry, timer, or queued promise survives.
   */
  shutdown(): void {
    this.isShutdown = true;
    for (const entry of this.entries.values()) {
      entry.disposed = true;
      this.cancelIdleTimer(entry);
      this.rejectQueued(
        entry,
        `Agent Fleet is shutting down — the queued turn for "${entry.target.agentName}" was not sent to the agent. Retry after reload.`,
      );
      entry.consumers.clear();
      try {
        if (entry.activeTurn) entry.session.abort();
        else entry.session.hibernate();
      } catch (err) {
        console.warn(`Agent Fleet: shutting down conversation ${entry.key} failed`, err);
      }
    }
    this.entries.clear();
    this.subscribers.clear();
  }

  /** Number of live entries. Diagnostics/tests only. */
  get size(): number {
    return this.entries.size;
  }

  // ═══════════════════════════════════════════════════════
  //  Internals
  // ═══════════════════════════════════════════════════════

  private async ensureEntry(target: ConversationTarget): Promise<ConversationEntry> {
    const key = conversationKey(target.agentName, target.conversationId);
    const cached = this.entries.get(key);
    if (cached) {
      await cached.loadPromise;
      return cached;
    }

    const repository = this.deps.getRepository();
    const agent = repository.getAgentByName(target.agentName);
    if (!agent) {
      throw new Error(`Unknown agent "${target.agentName}" — cannot open its conversation.`);
    }

    const session = this.createSession(agent, target.conversationId, repository);
    const entry: ConversationEntry = {
      key,
      target: { agentName: target.agentName, conversationId: target.conversationId },
      session,
      // Started here, awaited by every caller: two concurrent acquires load once.
      loadPromise: (async () => {
        try {
          await session.loadPersistedState();
        } catch (err) {
          // Corrupted persistence — the session starts fresh rather than
          // wedging every consumer of this conversation.
          console.warn(`Agent Fleet: loading conversation ${key} failed`, err);
        }
      })(),
      consumers: new Set<string>(),
      activeTurn: null,
      queue: [],
      pumping: false,
      idleTimer: null,
      hibernated: false,
      disposed: false,
    };
    this.entries.set(key, entry);
    await entry.loadPromise;
    return entry;
  }

  private createSession(
    agent: AgentConfig,
    conversationId: string,
    repository: FleetRepository,
  ): ChatSession {
    const settings = this.deps.getSettings();
    const mcpAuth = this.deps.getMcpAuth?.();
    const session = this.deps.createSession
      ? this.deps.createSession({
          agent,
          settings,
          repository,
          vault: this.deps.vault,
          conversationId,
          mcpAuth,
        })
      : new ChatSession(agent, settings, repository, this.deps.vault, {
          inAppConversationId: conversationId,
          mcpAuth,
        });
    if (this.deps.recordUsage) {
      session.setUsageRecorder(this.deps.recordUsage);
    }
    return session;
  }

  /** Settle everything still waiting in the queue. Injected follow-ups are NOT
   *  touched here — they belong to the active turn and settle with it (abort
   *  rejects them, a normal terminal result resolves them). */
  private rejectQueued(entry: ConversationEntry, message: string): void {
    const queued = entry.queue.splice(0, entry.queue.length);
    for (const item of queued) {
      item.reject(new Error(message));
    }
  }

  private emit(entry: ConversationEntry, event: ManagedConversationEvent): void {
    const listeners = this.subscribers.get(entry.key);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (err) {
        console.warn(`Agent Fleet: conversation subscriber threw for ${entry.key}`, err);
      }
    }
  }

  private cancelIdleTimer(entry: ConversationEntry): void {
    if (entry.idleTimer !== null) {
      window.clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
  }

  /** Arm hibernation only when the entry is truly idle: no consumer, no active
   *  turn, nothing queued. Hibernation kills the subprocess but keeps the
   *  session object and provider session id, so the next turn resumes. */
  private maybeScheduleIdle(entry: ConversationEntry): void {
    if (entry.disposed || this.isShutdown) return;
    if (entry.consumers.size > 0 || entry.activeTurn || entry.queue.length > 0) return;
    if (entry.hibernated || entry.idleTimer !== null) return;
    entry.idleTimer = window.setTimeout(() => {
      entry.idleTimer = null;
      if (entry.disposed || this.isShutdown) return;
      if (entry.consumers.size > 0 || entry.activeTurn || entry.queue.length > 0) return;
      if (entry.hibernated) return;
      entry.hibernated = true;
      try {
        entry.session.hibernate();
      } catch (err) {
        console.warn(`Agent Fleet: hibernating conversation ${entry.key} failed`, err);
      }
    }, this.idleHibernateMs);
  }
}
