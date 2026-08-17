/**
 * Revision submission orchestration (REVISION_MODE_DESIGN.md §§6.7–6.9, 13).
 *
 * The manager owns exactly one thing: turning a collected draft into one
 * exclusive conversation turn and deciding, from observable facts, whether that
 * turn succeeded. It holds no editor DOM, imports no chat view, and reaches for
 * no plugin singleton — everything it touches arrives through `RevisionManagerDeps`,
 * so the whole state machine is exercisable with fakes.
 *
 * The rules that shape the code below, in order of importance:
 *
 *  1. **No failure path deletes notes.** Comments are user-authored content. The
 *     sidecar is trashed on exactly one path: a turn with no errors that changed
 *     the file. Everything else lands in `attention` with every note intact.
 *  2. **A resolved promise is not success.** `ChatSession` can report a stream
 *     `error` event and still settle normally, so errors are tracked separately
 *     and any one of them fails the attempt (§13.2).
 *  3. **A clean turn that changed nothing is not success.** Verification is a
 *     SHA-256 comparison of the file before and after, read with `vault.read()`
 *     semantics — mtime lies, sync rewrites identical bytes (§13.3).
 *  4. **Success cannot be announced before the sidecar is gone.** The completion
 *     event is emitted after `delete()` resolves, never before, so a UI can
 *     never show "done" next to a live draft.
 */
import type {
  AgentConfig,
  RevisionDestination,
  RevisionDraft,
  RevisionSubmissionPhase,
} from "../types";
import type {
  ConversationTarget,
  ManagedConversationEvent,
  ManagedTurnRequest,
  ManagedTurnResult,
} from "./inAppConversationManager";
import type { AdapterId } from "../adapters";
import { normalizeAdapter } from "../adapters";
import { hashAnchorText, resolveDraftAnchors } from "../utils/revisionAnchors";
import { buildRevisionDisplayMessage, buildRevisionFullPrompt } from "../utils/revisionPrompt";
import { REVISION_INTERRUPTED_MESSAGE } from "../repository/revisionStore";

// ═══════════════════════════════════════════════════════
//  Injected collaborators
// ═══════════════════════════════════════════════════════

/** The slice of `RevisionStore` the manager uses. Declared here rather than
 *  imported as a class so orchestration tests need no vault. */
export interface RevisionDraftStore {
  getById(id: string): RevisionDraft | null;
  getBySourcePath(sourcePath: string): RevisionDraft | null;
  save(draft: RevisionDraft): Promise<void>;
  delete(id: string): Promise<void>;
  renameSource(oldPath: string, newPath: string): Promise<void>;
}

/** Vault lookup/read for the reviewed document. `read()` must use
 *  `vault.read()`, NOT `cachedRead()` — the cache can hand back the bytes the
 *  agent just replaced, which would make every revision look like a no-op
 *  (§13.3). */
export interface RevisionSourceAccess {
  /** True when a readable file exists at this vault-relative path. */
  exists(sourcePath: string): boolean;
  /** Fresh read. Rejects when the file is missing or unreadable. */
  read(sourcePath: string): Promise<string>;
}

/** Destination validation inputs. Agents come from the repository; the
 *  conversation check is async because conversation listing hits disk. */
export interface RevisionDirectory {
  getAgent(agentName: string): AgentConfig | null;
  hasConversation(agentName: string, conversationId: string): Promise<boolean>;
}

/** The part of `InAppConversationManager` a revision needs.
 *  `InAppConversationManager` satisfies this structurally. */
export interface RevisionConversationQueue {
  send(target: ConversationTarget, request: ManagedTurnRequest): Promise<ManagedTurnResult>;
  subscribe(
    target: ConversationTarget,
    listener: (event: ManagedConversationEvent) => void,
  ): () => void;
}

// ═══════════════════════════════════════════════════════
//  Events and outcomes
// ═══════════════════════════════════════════════════════

/**
 * `state`      — a persisted draft change (queued/running/verifying/attention).
 *                Drives the toolbar's Ready/Waiting/Revising/Needs attention text.
 * `blocked`    — pre-flight validation refused to submit. Nothing was sent and
 *                nothing but anchor health was persisted.
 * `completed`  — success, emitted only after the sidecar is gone.
 * `attention`  — terminal failure with the notes retained.
 */
export type RevisionEvent =
  | { type: "state"; draftId: string; sourcePath: string; draft: RevisionDraft }
  | { type: "blocked"; draftId: string; sourcePath: string; message: string }
  | {
      type: "completed";
      draftId: string;
      sourcePath: string;
      destination: RevisionDestination;
      noteCount: number;
    }
  | {
      type: "attention";
      draftId: string;
      sourcePath: string;
      message: string;
      /** True when the file's content hash changed across the attempt — the
       *  user must inspect the document before retrying (§6.9). */
      sourceChanged: boolean;
      draft: RevisionDraft;
    };

export type RevisionOutcomeReason =
  /** Turn clean, file changed, sidecar deleted. */
  | "success"
  /** Pre-flight validation refused; nothing was sent. */
  | "blocked"
  /** Turn clean, file byte-identical. */
  | "no-change"
  /** Stream error, rejection, or abort; file unchanged. */
  | "turn-failed"
  /** Stream error, rejection, or abort; file changed anyway. */
  | "turn-failed-file-changed"
  /** Turn succeeded and the file changed, but the sidecar survived. */
  | "cleanup-failed"
  /** Plugin unload / manager shutdown mid-attempt. */
  | "interrupted";

export interface RevisionSubmissionOutcome {
  ok: boolean;
  reason: RevisionOutcomeReason;
  /** Actionable, user-facing. Also stored as `attentionMessage` on failure. */
  message: string;
  draftId: string;
  sourcePath: string;
  destination?: RevisionDestination;
  /** Whether the source hash changed between the before and after reads. */
  sourceChanged: boolean;
  /** Stream errors plus any rejection message. Empty on a clean turn. */
  errors: string[];
}

export interface RevisionManagerDeps {
  store: RevisionDraftStore;
  source: RevisionSourceAccess;
  conversations: RevisionConversationQueue;
  directory: RevisionDirectory;
  /**
   * Resolve a flush callback for an open editor on this document (§6.7 step 1)
   * — in production, `MarkdownView.save()` for the view showing the file.
   * Returning null means nothing has unsaved changes.
   */
  getEditorFlush?: (sourcePath: string) => (() => Promise<void>) | null | undefined;
  /** Absolute vault root, for the CLI-only prompt. Undefined on a non-filesystem
   *  adapter; the prompt then falls back to the vault path (§15: absolute paths
   *  are computed here and never persisted). */
  getVaultBasePath: () => string | undefined;
  /** Completion/attention/state sink. */
  onEvent?: (event: RevisionEvent) => void;
  /** Injectable clock. */
  now?: () => Date;
  /** Injectable attempt-id minter. */
  newAttemptId?: () => string;
}

// ═══════════════════════════════════════════════════════
//  Read-only detection (§6.3, §15)
// ═══════════════════════════════════════════════════════

/**
 * Only modes that are *known* to prevent writes are blocked. `dontAsk`, allow
 * lists, sandbox mappings, and `cwd` are deliberately NOT interpreted here: this
 * feature does not model the permission system, and guessing "writable" or
 * "not writable" from them would either block legitimate agents or promise a
 * capability we cannot verify. Everything else is left to the real turn, whose
 * failure retains the notes.
 */
const READ_ONLY_MODES: Record<AdapterId, ReadonlySet<string>> = {
  "claude-code": new Set(["plan"]),
  codex: new Set(["read-only"]),
  pi: new Set(["plan", "read-only"]),
};

/** The blocking read-only reason for an agent, or null when it may write. */
export function readOnlyBlockReason(agent: AgentConfig): string | null {
  const adapter = normalizeAdapter(agent.adapter);
  const mode = (agent.permissionMode ?? "").trim().toLowerCase();
  if (!READ_ONLY_MODES[adapter].has(mode)) return null;
  return (
    `Agent "${agent.name}" runs in "${mode}" mode, which cannot edit files. ` +
    "Choose another agent or change the agent's permission mode."
  );
}

// ═══════════════════════════════════════════════════════
//  Manager
// ═══════════════════════════════════════════════════════

interface ActiveAttempt {
  attemptId: string;
  phase: RevisionSubmissionPhase;
  target: ConversationTarget;
}

/** Join the vault root and a vault-relative path. Vault paths are always
 *  slash-separated, so this stays deterministic across platforms. */
function absolutePathFor(basePath: string | undefined, sourcePath: string): string {
  const root = (basePath ?? "").replace(/[/\\]+$/, "");
  return root ? `${root}/${sourcePath}` : sourcePath;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class RevisionManager {
  /** draftId → in-flight attempt. Doubles as the per-draft submission lock. */
  private readonly inFlight = new Map<string, Promise<RevisionSubmissionOutcome>>();
  private readonly attempts = new Map<string, ActiveAttempt>();
  /** Serializes every sidecar write so phase order on disk matches phase order
   *  in the state machine, including writes started from a stream listener. */
  private writeChain: Promise<void> = Promise.resolve();
  private shuttingDown = false;

  constructor(private readonly deps: RevisionManagerDeps) {}

  // ─── observability for the UI ───

  /** Persisted submission phase for a draft, or null when it is not in flight.
   *  Lets the toolbar render Waiting/Revising without polling the store. */
  getPhase(draftId: string): RevisionSubmissionPhase | null {
    return this.attempts.get(draftId)?.phase ?? null;
  }

  isSubmitting(draftId: string): boolean {
    return this.inFlight.has(draftId);
  }

  /** Await every queued sidecar write. Used by unload and by tests that need a
   *  deterministic point after an event-driven phase change. */
  async flushPendingWrites(): Promise<void> {
    await this.writeChain;
  }

  // ─── vault routing (§8.6, §14.4) ───

  /** Follow a source document rename so the draft keeps pointing at it. */
  async onSourceRenamed(oldPath: string, newPath: string): Promise<void> {
    await this.deps.store.renameSource(oldPath, newPath);
  }

  /** A deleted source keeps its draft: accidental deletion followed by a restore
   *  must not destroy the comments (§14.4). */
  async onSourceDeleted(sourcePath: string): Promise<void> {
    const draft = this.deps.store.getBySourcePath(sourcePath);
    if (!draft || draft.status === "attention") return;
    await this.enterAttention(
      draft,
      `The document ${sourcePath} was deleted. Its revision notes were kept — restore the file to continue.`,
      false,
    );
  }

  /**
   * Plugin unload. Every in-flight attempt is reported as interrupted and NO
   * sidecar is written or deleted from here: the queued/running state already on
   * disk is what `RevisionStore.loadAll()` recovers into attention on next load
   * (§8.5). Auto-retrying or auto-deleting would be wrong — the conversation may
   * already hold a completed or partial turn.
   */
  shutdown(): void {
    this.shuttingDown = true;
    for (const draftId of this.attempts.keys()) {
      const draft = this.deps.store.getById(draftId);
      if (!draft) continue;
      this.emit({
        type: "attention",
        draftId,
        sourcePath: draft.sourcePath,
        message: REVISION_INTERRUPTED_MESSAGE,
        sourceChanged: false,
        draft,
      });
    }
  }

  // ─── validation (§6.7) ───

  /**
   * Everything checkable before any state changes: notes exist, the destination
   * resolves, and the agent is not known-read-only. Anchor health is checked
   * later, against freshly-read source, because a stale in-memory draft can
   * disagree with the file.
   */
  async validateDestination(draft: RevisionDraft): Promise<string | null> {
    if (draft.notes.length === 0) {
      return "Add at least one revision note before revising the document.";
    }
    if (!this.deps.source.exists(draft.sourcePath)) {
      return `The document ${draft.sourcePath} is no longer in the vault. Its notes were kept.`;
    }
    const destination = draft.destination;
    if (!destination) {
      return "Choose an agent and a conversation before revising the document.";
    }
    const agent = this.deps.directory.getAgent(destination.agentName);
    if (!agent) {
      return `Agent "${destination.agentName}" no longer exists. Choose another destination.`;
    }
    if (!agent.enabled) {
      return `Agent "${destination.agentName}" is disabled. Enable it or choose another destination.`;
    }
    const readOnly = readOnlyBlockReason(agent);
    if (readOnly) return readOnly;

    const hasConversation = await this.deps.directory.hasConversation(
      destination.agentName,
      destination.conversationId,
    );
    if (!hasConversation) {
      return `The selected conversation for "${destination.agentName}" no longer exists. Choose another destination.`;
    }
    return null;
  }

  // ─── submission ───

  /**
   * Submit a draft. Concurrent calls for the same draft share one attempt — two
   * panes on the same document must never produce two turns (§14.1). Different
   * drafts are independent.
   */
  submit(draftId: string): Promise<RevisionSubmissionOutcome> {
    const existing = this.inFlight.get(draftId);
    if (existing) return existing;
    const attempt = this.runSubmission(draftId).finally(() => {
      this.inFlight.delete(draftId);
      this.attempts.delete(draftId);
    });
    this.inFlight.set(draftId, attempt);
    return attempt;
  }

  private async runSubmission(draftId: string): Promise<RevisionSubmissionOutcome> {
    const initial = this.deps.store.getById(draftId);
    if (!initial) {
      return this.blocked(draftId, "", "This revision draft no longer exists.");
    }
    if (this.shuttingDown) {
      return this.blocked(draftId, initial.sourcePath, REVISION_INTERRUPTED_MESSAGE);
    }

    const destinationProblem = await this.validateDestination(initial);
    if (destinationProblem) {
      return this.blocked(draftId, initial.sourcePath, destinationProblem);
    }
    // Narrowed by validateDestination, re-read for the type system.
    const destination = initial.destination;
    if (!destination) {
      return this.blocked(draftId, initial.sourcePath, "Choose an agent and a conversation first.");
    }

    // 1. Flush the open editor so the bytes we hash are the bytes the user sees.
    //    A failed flush is fatal: revising a stale file would silently discard
    //    the user's newest edits.
    const flush = this.deps.getEditorFlush?.(initial.sourcePath);
    if (flush) {
      try {
        await flush();
      } catch (err) {
        return this.blocked(
          draftId,
          initial.sourcePath,
          `Could not save ${initial.sourcePath} before revising: ${errorMessage(err)}`,
        );
      }
    }

    // 2. Fresh read, then re-resolve every anchor against it. Offsets from the
    //    editor session can be stale after an external write.
    let source: string;
    try {
      source = await this.deps.source.read(initial.sourcePath);
    } catch (err) {
      return this.blocked(
        draftId,
        initial.sourcePath,
        `Could not read ${initial.sourcePath}: ${errorMessage(err)}`,
      );
    }

    const resolution = resolveDraftAnchors(initial, source);
    let draft = resolution.draft;
    if (resolution.changed) {
      // Persisted before the orphan check so the panel can show which notes
      // broke, even though this submission is about to be refused.
      draft = await this.persist(draft);
    }
    if (resolution.orphanedNoteIds.length > 0) {
      const count = resolution.orphanedNoteIds.length;
      return this.blocked(
        draftId,
        draft.sourcePath,
        count === 1
          ? "One note no longer matches the document. Reattach or delete it before revising."
          : `${count} notes no longer match the document. Reattach or delete them before revising.`,
      );
    }

    // 3. Hash immediately before sending — this is the completion check's baseline.
    const hashBefore = hashAnchorText(source);
    const attemptId = this.deps.newAttemptId?.() ?? cryptoRandomId();
    const requestedAt = this.timestamp();
    const target: ConversationTarget = {
      agentName: destination.agentName,
      conversationId: destination.conversationId,
    };
    this.attempts.set(draftId, { attemptId, phase: "queued", target });

    // 4. Persist queued BEFORE queueing. If Obsidian dies between this write and
    //    the turn starting, the sidecar already says a submission was in flight
    //    and startup recovery flags it for attention rather than losing it.
    draft = await this.persist({
      ...draft,
      status: "submitting",
      attentionMessage: undefined,
      submission: {
        attemptId,
        phase: "queued",
        requestedAt,
        sourceHashBefore: hashBefore,
      },
    });

    const displayText = buildRevisionDisplayMessage({
      sourcePath: draft.sourcePath,
      source,
      notes: draft.notes,
    });
    const fullText = buildRevisionFullPrompt({
      sourcePath: draft.sourcePath,
      source,
      notes: draft.notes,
      absolutePath: absolutePathFor(this.deps.getVaultBasePath(), draft.sourcePath),
    });

    // 5. One exclusive turn. `displayText` is what the conversation keeps after
    //    the sidecar is gone; `fullText` (absolute path + execution rules) is
    //    CLI-only and never stored.
    const streamErrors: string[] = [];
    const unsubscribe = this.deps.conversations.subscribe(target, (event) => {
      if (event.requestId !== attemptId) return;
      if (event.type === "turn-start") this.markRunning(draftId, attemptId);
    });

    let turnError: string | null = null;
    try {
      const result = await this.deps.conversations.send(target, {
        displayText,
        fullText,
        origin: "revision",
        policy: "exclusive",
        requestId: attemptId,
        messageMeta: {
          origin: "revision",
          revision: {
            draftId: draft.id,
            documentPath: draft.sourcePath,
            noteCount: draft.notes.length,
          },
        },
        onEvent: (event) => {
          if (event.type === "error") {
            streamErrors.push(event.errorMessage?.trim() || "stream error");
          }
        },
      });
      // A resolved promise is not success: the turn can report errors and still
      // settle normally (§13.2).
      for (const error of result.streamErrors) {
        if (!streamErrors.includes(error)) streamErrors.push(error);
      }
    } catch (err) {
      turnError = errorMessage(err);
    } finally {
      unsubscribe();
    }

    // Writes started from the stream listener must land before the next phase.
    await this.flushPendingWrites();
    return this.verify(draftId, { attemptId, destination, hashBefore, streamErrors, turnError });
  }

  // ─── verification and outcomes (§13.2) ───

  private async verify(
    draftId: string,
    ctx: {
      attemptId: string;
      destination: RevisionDestination;
      hashBefore: string;
      streamErrors: string[];
      turnError: string | null;
    },
  ): Promise<RevisionSubmissionOutcome> {
    const current = this.deps.store.getById(draftId);
    const errors = [...ctx.streamErrors];
    if (ctx.turnError) errors.push(ctx.turnError);

    if (!current) {
      // The user discarded the draft mid-turn. There is nothing to retain and
      // nothing to verify against, so this is reported as interrupted rather
      // than as a success we never confirmed.
      return {
        ok: false,
        reason: "interrupted",
        message: "The revision draft was discarded while the turn was running.",
        draftId,
        sourcePath: "",
        destination: ctx.destination,
        sourceChanged: false,
        errors,
      };
    }

    if (this.shuttingDown) {
      // Unload: leave the persisted submitting state alone so the store's
      // startup recovery owns it (§8.5). Never delete on this path.
      return {
        ok: false,
        reason: "interrupted",
        message: REVISION_INTERRUPTED_MESSAGE,
        draftId,
        sourcePath: current.sourcePath,
        destination: ctx.destination,
        sourceChanged: false,
        errors,
      };
    }

    const verifying = await this.persist({
      ...current,
      status: "submitting",
      submission: {
        ...(current.submission ?? {
          attemptId: ctx.attemptId,
          requestedAt: this.timestamp(),
          sourceHashBefore: ctx.hashBefore,
        }),
        attemptId: ctx.attemptId,
        phase: "verifying",
        sourceHashBefore: ctx.hashBefore,
      },
    });
    this.setPhase(draftId, "verifying");

    let hashAfter: string | null = null;
    let readError: string | null = null;
    try {
      hashAfter = hashAnchorText(await this.deps.source.read(verifying.sourcePath));
    } catch (err) {
      readError = errorMessage(err);
    }
    const sourceChanged = hashAfter !== null && hashAfter !== ctx.hashBefore;

    if (errors.length > 0) {
      const detail = errors.join("; ");
      const message = sourceChanged
        ? `The document changed, but the revision turn did not complete. Review the file before retrying. (${detail})`
        : `The revision turn did not complete: ${detail}. Your notes were kept.`;
      await this.enterAttention(verifying, message, sourceChanged);
      return {
        ok: false,
        reason: sourceChanged ? "turn-failed-file-changed" : "turn-failed",
        message,
        draftId,
        sourcePath: verifying.sourcePath,
        destination: ctx.destination,
        sourceChanged,
        errors,
      };
    }

    if (readError !== null) {
      const message = `The turn finished, but ${verifying.sourcePath} could not be re-read to verify the revision: ${readError}. Your notes were kept.`;
      await this.enterAttention(verifying, message, false);
      return {
        ok: false,
        reason: "turn-failed",
        message,
        draftId,
        sourcePath: verifying.sourcePath,
        destination: ctx.destination,
        sourceChanged: false,
        errors: [readError],
      };
    }

    if (!sourceChanged) {
      const message = `The agent replied but did not change ${verifying.sourcePath}. Your notes were kept — read the reply, then retry or adjust them.`;
      await this.enterAttention(verifying, message, false);
      return {
        ok: false,
        reason: "no-change",
        message,
        draftId,
        sourcePath: verifying.sourcePath,
        destination: ctx.destination,
        sourceChanged: false,
        errors: [],
      };
    }

    // Clean turn + changed file. Delete the sidecar FIRST; success is only
    // announced once the notes are actually gone.
    const noteCount = verifying.notes.length;
    try {
      await this.deps.store.delete(verifying.id);
    } catch (err) {
      const message = `The revision was applied to ${verifying.sourcePath}, but its notes could not be cleared: ${errorMessage(err)}. Delete the draft manually.`;
      await this.enterAttention(verifying, message, true);
      return {
        ok: false,
        reason: "cleanup-failed",
        message,
        draftId,
        sourcePath: verifying.sourcePath,
        destination: ctx.destination,
        sourceChanged: true,
        errors: [errorMessage(err)],
      };
    }

    this.emit({
      type: "completed",
      draftId,
      sourcePath: verifying.sourcePath,
      destination: ctx.destination,
      noteCount,
    });
    return {
      ok: true,
      reason: "success",
      message: `Revised ${verifying.sourcePath}.`,
      draftId,
      sourcePath: verifying.sourcePath,
      destination: ctx.destination,
      sourceChanged: true,
      errors: [],
    };
  }

  // ─── state helpers ───

  /** queued → running, driven by the managed conversation's `turn-start`. The
   *  write is queued rather than awaited because it runs inside an event
   *  listener; `flushPendingWrites()` is the ordering barrier. */
  private markRunning(draftId: string, attemptId: string): void {
    const attempt = this.attempts.get(draftId);
    if (!attempt || attempt.attemptId !== attemptId || attempt.phase !== "queued") return;
    attempt.phase = "running";
    const startedAt = this.timestamp();
    void this.enqueue(async () => {
      const current = this.deps.store.getById(draftId);
      if (!current || this.shuttingDown) return;
      if (current.submission?.attemptId !== attemptId) return;
      await this.write({
        ...current,
        status: "submitting",
        submission: { ...current.submission, phase: "running", startedAt },
      });
    });
  }

  private setPhase(draftId: string, phase: RevisionSubmissionPhase): void {
    const attempt = this.attempts.get(draftId);
    if (attempt) attempt.phase = phase;
  }

  /** Terminal failure: keep every note, record why, and surface it. */
  private async enterAttention(
    draft: RevisionDraft,
    message: string,
    sourceChanged: boolean,
  ): Promise<void> {
    if (this.shuttingDown) return;
    const next: RevisionDraft = {
      ...draft,
      status: "attention",
      attentionMessage: message,
    };
    if (draft.submission) next.submission = { ...draft.submission, error: message };
    const stored = await this.persist(next);
    this.emit({
      type: "attention",
      draftId: stored.id,
      sourcePath: stored.sourcePath,
      message,
      sourceChanged,
      draft: stored,
    });
  }

  private blocked(
    draftId: string,
    sourcePath: string,
    message: string,
  ): RevisionSubmissionOutcome {
    this.emit({ type: "blocked", draftId, sourcePath, message });
    return {
      ok: false,
      reason: "blocked",
      message,
      draftId,
      sourcePath,
      sourceChanged: false,
      errors: [],
    };
  }

  // ─── persistence plumbing ───

  private persist(draft: RevisionDraft): Promise<RevisionDraft> {
    return this.enqueue(() => this.write(draft));
  }

  private async write(draft: RevisionDraft): Promise<RevisionDraft> {
    const next = { ...draft };
    // `undefined` is not a valid `attentionMessage`; drop the key entirely so the
    // sidecar never carries a dangling field.
    if (next.attentionMessage === undefined) delete next.attentionMessage;
    await this.deps.store.save(next);
    const stored = this.deps.store.getById(next.id) ?? next;
    this.emit({ type: "state", draftId: stored.id, sourcePath: stored.sourcePath, draft: stored });
    return stored;
  }

  /** FIFO write queue. Every sidecar write — main-flow or listener-driven —
   *  goes through here, so on-disk phase order always matches state order. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writeChain.then(task, task);
    this.writeChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private timestamp(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private emit(event: RevisionEvent): void {
    try {
      this.deps.onEvent?.(event);
    } catch (err) {
      console.warn("Agent Fleet: revision event listener threw", err);
    }
  }
}

/** Attempt ids only need to be unique within a session; `crypto.randomUUID` is
 *  available in Obsidian's Electron renderer and in Node. */
function cryptoRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
