/**
 * Revision mode controller (REVISION_MODE_DESIGN.md §§6, 7.1, 10.4, 25).
 *
 * `RevisionModeController` owns the document-attached chrome for exactly one
 * `MarkdownView`: the notes rail (which owns every control since §6.2's
 * rail-owned decision), the narrow-pane dock, the live region, the note
 * composer, the anchor bookkeeping for that pane's editor, and the debounced
 * sidecar save. It never writes to the reviewed markdown — annotations exist
 * only in the sidecar.
 *
 * `RevisionModeHost` owns the per-view controllers and is the integration
 * surface: the integrator registers ONE editor extension, ONE `editor-menu`
 * handler and the markdown header actions, and delegates to the host. Nothing
 * here imports the plugin singleton, a repository, or `ChatSession` — every
 * dependency arrives through `RevisionModeDeps`.
 */
import { MarkdownView, Notice, setIcon } from "obsidian";
import type { Extension } from "@codemirror/state";
import type { App, Editor, MarkdownFileInfo } from "obsidian";
import { ConfirmModal } from "../modals/confirmModal";
import type {
  AgentConfig,
  ConversationMeta,
  RevisionDestination,
  RevisionDraft,
  RevisionNote,
} from "../types";
import {
  REVISION_LIMITS,
  createAnchor,
  mapDraftAnchors,
  resolveDraftAnchors,
  type AnchorPositionMapper,
} from "../utils/revisionAnchors";
import {
  RevisionEditorBridge,
  applyRevisionEditorState,
  compactQuote,
  rangeRect,
  revealRevisionRange,
  type RevisionEditorClient,
  type RevisionEditorSelection,
} from "./revisionEditorExtension";
import { RevisionNotePopover } from "./revisionNotePopover";
import {
  RevisionDock,
  RevisionLiveRegion,
  RevisionPanel,
  type RevisionActionView,
  type RevisionChromeHandlers,
  type RevisionConversationOption,
  type RevisionConversationsState,
  type RevisionDestinationView,
  type RevisionDockState,
  type RevisionNoteCardView,
  type RevisionOverflowView,
  type RevisionPanelState,
  type RevisionStatusView,
} from "./revisionPanel";

/** Store-level change the UI reacts to. Emitted by whatever owns the sidecars
 *  (RevisionStore via RevisionManager); the UI never polls. */
export type RevisionUiEvent =
  | { type: "draft-updated"; draft: RevisionDraft }
  | { type: "draft-deleted"; draftId: string; sourcePath: string };

/**
 * Everything Revision mode's UI needs from the rest of the plugin. The
 * integrator supplies concrete implementations backed by `RevisionStore`,
 * `RevisionManager`, `FleetRepository`, and `InAppConversationManager`.
 */
export interface RevisionModeDeps {
  /** Used only for modals and notices. */
  app: App;
  getDraftForPath(path: string): RevisionDraft | null;
  createDraft(path: string): Promise<RevisionDraft>;
  saveDraft(draft: RevisionDraft): Promise<void>;
  discardDraft(id: string): Promise<void>;
  listAgents(): AgentConfig[];
  listConversations(agentName: string): Promise<ConversationMeta[]>;
  createConversation(agentName: string, suggestedName: string): Promise<ConversationMeta>;
  submitDraft(id: string): Promise<void>;
  subscribe(listener: (event: RevisionUiEvent) => void): () => void;
  /** Reveal the exact destination conversation (`openChatView`). Optional so
   *  the UI stays usable before chat navigation is wired. */
  openConversation?(destination: RevisionDestination): void | Promise<void>;
  /**
   * Optional preselection when Revision mode starts and the draft has no saved
   * destination — §6.3 allows using the one visible Agent Chat conversation.
   * Return null to leave the pickers empty; the UI never guesses on its own,
   * and a suggestion is only persisted once the first note is added.
   */
  suggestDestination?(sourcePath: string): RevisionDestination | null;
  /** Test seams. Default to `crypto.randomUUID()` / `new Date()`. */
  uuid?(): string;
  now?(): string;
}

/** Below this `contentEl` width the fixed rail column would crush the editor
 *  (§25.1), so the rail becomes a collapsible overlay. */
const NARROW_BREAKPOINT_PX = 720;

/** Sidecar writes are debounced while the user types (§9.2). */
const SAVE_DEBOUNCE_MS = 350;

const QUOTE_PREVIEW_CHARS = 240;

function nowIso(deps: RevisionModeDeps): string {
  return deps.now ? deps.now() : new Date().toISOString();
}

function newId(deps: RevisionModeDeps): string {
  if (deps.uuid) return deps.uuid();
  return crypto.randomUUID();
}

/**
 * Permission modes that are *known* to prevent file writes (§6.3). Anything
 * else — allow lists, sandboxes, cwd — is left to the actual turn to enforce,
 * and a failure there retains the notes.
 */
export function isKnownReadOnlyAgent(agent: AgentConfig): boolean {
  const mode = agent.permissionMode?.trim().toLowerCase() ?? "";
  const adapter = agent.adapter?.trim().toLowerCase() ?? "claude-code";
  const isPi = adapter === "pi" || adapter === "pi-coding-agent";
  const isCodex = adapter === "codex" || adapter === "openai-codex";
  const isClaude = !isPi && !isCodex;
  if (mode === "plan") return isClaude || isPi;
  if (mode === "read-only" || mode === "readonly") return isCodex || isPi;
  return false;
}

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

function conversationLabel(meta: ConversationMeta): string {
  const parts = [meta.name];
  const when = relativeTime(meta.lastActive);
  if (when) parts.push(when);
  parts.push(meta.messageCount === 1 ? "1 message" : `${meta.messageCount} messages`);
  return parts.join("  ·  ");
}

function basename(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.md$/i, "");
}

/** Notes in document order, with 1-based display numbers. */
function orderedNotes(draft: RevisionDraft | null): RevisionNote[] {
  if (!draft) return [];
  return [...draft.notes].sort((a, b) => a.anchor.from - b.anchor.from || a.anchor.to - b.anchor.to);
}

export class RevisionModeController implements RevisionEditorClient {
  private panel: RevisionPanel | null = null;
  private dock: RevisionDock | null = null;
  private live: RevisionLiveRegion | null = null;
  private popover: RevisionNotePopover | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribe: (() => void) | null = null;

  private draft: RevisionDraft | null = null;
  /** Bumped on every local draft mutation so the editor only receives a new
   *  snapshot (and rebuilds decorations) when something actually changed. */
  private draftRevision = 0;
  private syncedRevision = -1;
  private editorSyncScheduled = false;
  private composerOpen = false;
  private activeNoteId: string | null = null;
  private reattachNoteId: string | null = null;
  private selection: RevisionEditorSelection | null = null;

  /**
   * Agent chosen in the toolbar. Held here rather than on the draft because a
   * persisted `destination` requires BOTH an agent and a conversation id — the
   * store rejects a half-filled one — and picking an agent alone must not
   * create a sidecar.
   */
  private selectedAgent = "";
  /** Conversation chosen (or suggested) but not yet written to a draft. */
  private pendingConversationId = "";
  private conversations: ConversationMeta[] = [];
  private conversationsState: RevisionConversationsState = "idle";
  private conversationsError = "";
  private conversationRequest = 0;

  private saveTimer: number | null = null;
  private savePromise: Promise<void> = Promise.resolve();
  /** Includes queued saves whose store event can arrive before the promise
   *  settles. While nonzero, older snapshots must not replace local state. */
  private savesInFlight = 0;
  private draftPromise: Promise<RevisionDraft> | null = null;
  private dirty = false;
  private submitPending = false;
  private discarding = false;

  private narrow = false;
  private railOpen = true;
  private active = false;
  private destroyed = false;

  constructor(
    readonly view: MarkdownView,
    private readonly deps: RevisionModeDeps,
    private readonly bridge: RevisionEditorBridge,
    private readonly onStateChanged: () => void,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  get sourcePath(): string {
    return this.view.file?.path ?? "";
  }

  get pendingNoteCount(): number {
    return this.draft?.notes.length ?? 0;
  }

  /** True while a submission is queued/running: the document and every
   *  revision control except **Open conversation** are inert (§6.7). */
  get isLocked(): boolean {
    return this.submitPending || this.draft?.status === "submitting";
  }

  // ─── Lifecycle ───

  async activate(): Promise<void> {
    if (this.active || this.destroyed) return;
    if (!this.view.file) {
      new Notice("Revision mode needs a saved markdown document.");
      return;
    }
    this.active = true;

    const contentEl = this.view.contentEl;
    contentEl.addClass("af-revision-active");
    // One handler object drives both surfaces, so the dock can never diverge
    // from the rail footer it mirrors.
    const handlers: RevisionChromeHandlers = {
      onAgentChange: (name) => void this.selectAgent(name),
      onConversationChange: (id) => void this.selectConversation(id),
      onCreateConversation: () => void this.createConversation(),
      onRetryConversations: () => void this.loadConversations(this.selectedAgentName(), true),
      onSubmit: () => void this.submit(),
      onDiscard: () => this.confirmDiscard(),
      onOpenConversation: () => void this.openConversation(),
      onExit: () => this.deactivate(),
      onToggleRail: () => this.toggleRail(),
      onCloseRail: () => this.setRailOpen(false),
      onCardHover: (id) => this.setActiveNote(id),
      onCardActivate: (id) => this.revealNote(id),
      onEdit: (id) => this.editNote(id),
      onDelete: (id) => void this.deleteNote(id),
      onReattach: (id) => this.beginReattach(id),
      onCancelReattach: () => this.cancelReattach(),
    };
    this.dock = new RevisionDock(contentEl, handlers);
    this.panel = new RevisionPanel(contentEl, handlers);
    this.live = new RevisionLiveRegion(contentEl);

    this.bridge.attach(this.view, this);
    this.observeWidth(contentEl);
    this.unsubscribe = this.deps.subscribe((event) => this.onDepsEvent(event));

    // `submitPending` is an in-memory click guard, not durable submission
    // state. A successful revision deletes its draft and deactivates this
    // controller; without resetting the guard, the next pass would reopen as
    // "Waiting for conversation" even though no turn exists. A genuinely
    // in-flight pass remains locked through the persisted draft status.
    this.submitPending = false;
    // An exit can race its background flush. Wait for it before deciding
    // whether disk or an unsaved in-memory draft is authoritative on re-entry.
    try {
      await this.savePromise;
    } catch {
      // flushSave already reported the failure and restored `dirty`.
    }
    if (!this.active || this.destroyed) return;
    if (!this.dirty || !this.draft) {
      this.adoptDraft(this.deps.getDraftForPath(this.sourcePath));
    } else {
      // Preserve user-authored notes after a write failure and retry soon.
      this.scheduleSave();
    }
    this.reResolveAgainstDocument();
    if (!this.draft?.destination) {
      const suggestion = this.deps.suggestDestination?.(this.sourcePath);
      if (suggestion?.agentName) {
        this.selectedAgent = suggestion.agentName;
        this.pendingConversationId = suggestion.conversationId;
      }
    }
    if (this.selectedAgent) void this.loadConversations(this.selectedAgent);
    this.render();
    this.onStateChanged();
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    void this.flushSave();

    this.closePopover();
    this.reattachNoteId = null;
    this.activeNoteId = null;
    this.composerOpen = false;
    this.syncedRevision = -1;

    const editorView = this.bridge.editorViewFor(this.view);
    if (editorView) {
      applyRevisionEditorState(editorView, {
        active: false,
        draft: null,
        activeNoteId: null,
        composerOpen: false,
        reattachNoteId: null,
        locked: false,
      });
    }
    this.bridge.detach(this.view);

    this.unsubscribe?.();
    this.unsubscribe = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.panel?.destroy();
    this.panel = null;
    this.dock?.destroy();
    this.dock = null;
    this.live?.destroy();
    this.live = null;

    const contentEl = this.view.contentEl;
    contentEl.removeClass("af-revision-active");
    contentEl.removeClass("af-revision-narrow");
    // Width state is view-chrome state, not draft state. Reset it with the DOM
    // classes so re-entering at the same narrow width re-applies the overlay
    // class instead of short-circuiting as "unchanged".
    this.narrow = false;
    this.railOpen = true;
    this.onStateChanged();
  }

  /**
   * Re-push state into this pane's editor. Needed after Obsidian rebuilds the
   * `EditorView` — switching Reading → source creates a fresh editor whose
   * state field starts inactive.
   */
  syncEditor(): void {
    this.syncedRevision = -1; // force the draft snapshot back into the editor
    this.scheduleEditorSync();
  }

  /** Full teardown. After this the controller is inert and must be discarded. */
  destroy(): void {
    this.deactivate();
    this.destroyed = true;
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private observeWidth(contentEl: HTMLElement): void {
    // Narrow panes get a collapsible overlay rail instead of a second column
    // that would leave the editor unusably thin (§25.1).
    this.applyWidth(contentEl.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      this.applyWidth(entry.contentRect.width);
    });
    this.resizeObserver.observe(contentEl);
  }

  private applyWidth(width: number): void {
    if (width <= 0) return;
    const narrow = width < NARROW_BREAKPOINT_PX;
    if (narrow === this.narrow) return;
    this.narrow = narrow;
    this.railOpen = !narrow;
    this.view.contentEl.toggleClass("af-revision-narrow", narrow);
    this.popover?.reposition();
    this.render();
  }

  private toggleRail(): void {
    this.setRailOpen(!this.railOpen);
  }

  private setRailOpen(open: boolean): void {
    // At normal width the rail is a permanent column, so closing is a no-op.
    this.railOpen = this.narrow ? open : true;
    this.render();
  }

  // ─── Draft state ───

  private adoptDraft(draft: RevisionDraft | null): void {
    this.draft = draft ? cloneDraft(draft) : null;
    this.draftRevision += 1;
    const agentName = this.draft?.destination?.agentName;
    if (agentName) this.selectedAgent = agentName;
  }

  private async ensureDraft(): Promise<RevisionDraft> {
    if (this.draft) return this.draft;
    if (!this.draftPromise) {
      this.draftPromise = this.deps.createDraft(this.sourcePath);
    }
    const pending = this.draftPromise;
    let created: RevisionDraft;
    try {
      created = await pending;
    } finally {
      // A failed create must be retryable; retaining the rejected promise would
      // permanently wedge note creation for this view.
      if (this.draftPromise === pending) this.draftPromise = null;
    }
    if (!this.draft) this.adoptDraft(created);
    const draft = this.draft ?? cloneDraft(created);
    // A destination picked (or suggested) before the draft existed becomes
    // durable as soon as there is something to save it on.
    if (!draft.destination && this.selectedAgent && this.pendingConversationId) {
      draft.destination = {
        agentName: this.selectedAgent,
        conversationId: this.pendingConversationId,
      };
    }
    return draft;
  }

  private touch(): void {
    this.draftRevision += 1;
    if (!this.draft) return;
    this.draft.updatedAt = nowIso(this.deps);
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Persist any pending edits now. Background saves report and retain dirty
   *  state; submission asks errors to propagate so it can fail closed. */
  async flushSave(throwOnError = false): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty || !this.draft) {
      try {
        await this.savePromise;
      } catch (error) {
        if (throwOnError) throw error;
      }
      return;
    }
    const draft = cloneDraft(this.draft);
    const capturedRevision = this.draftRevision;
    this.dirty = false;
    this.savesInFlight++;
    const operation = this.savePromise.catch(() => undefined).then(() => this.deps.saveDraft(draft));
    this.savePromise = operation;
    try {
      await operation;
      // Mutations that happened after this snapshot still need their own save.
      if (this.draftRevision !== capturedRevision) this.dirty = true;
    } catch (error) {
      // Keep the in-memory note authoritative and retryable. In particular,
      // never let submit continue from a sidecar older than the visible UI.
      this.dirty = true;
      console.error("Agent Fleet: failed to save revision draft", error);
      if (throwOnError) throw error;
      new Notice("Agent Fleet could not save the revision draft. See the console for details.");
    } finally {
      this.savesInFlight--;
    }
  }

  private currentSource(): string {
    const editorView = this.bridge.editorViewFor(this.view);
    if (editorView) return editorView.state.doc.toString();
    return this.view.getViewData();
  }

  /** Re-resolve every anchor against the document as it is right now (§9.3).
   *  Used on entry and after external changes. */
  private reResolveAgainstDocument(): void {
    if (!this.draft || this.draft.notes.length === 0) return;
    const result = resolveDraftAnchors(this.draft, this.currentSource());
    if (!result.changed) return;
    this.draft = result.draft;
    this.touch();
    this.scheduleSave();
  }

  private onDepsEvent(event: RevisionUiEvent): void {
    if (!this.active) return;
    if (event.type === "draft-deleted") {
      if (event.draftId !== this.draft?.id) return;
      this.draft = null;
      this.dirty = false;
      this.submitPending = false;
      if (this.discarding) {
        this.discarding = false;
        this.render();
        this.onStateChanged();
        return;
      }
      // A draft we did not discard disappeared: the revision succeeded, so the
      // document returns to ordinary Live Preview (§6.8).
      this.deactivate();
      return;
    }

    const draft = event.draft;
    if (draft.sourcePath !== this.sourcePath) return;
    if (this.draft && draft.id !== this.draft.id) return;

    if ((this.dirty || this.savesInFlight > 0) && this.draft) {
      // Local or queued anchor edits are not known durable yet — keep them and adopt only
      // the fields the submission machinery owns.
      this.draft = {
        ...this.draft,
        status: draft.status,
        submission: draft.submission,
        attentionMessage: draft.attentionMessage,
      };
    } else {
      this.adoptDraft(draft);
      this.reResolveAgainstDocument();
    }
    // A collecting event can be the flush immediately preceding submit; it
    // must not reopen the editor during that handoff. Terminal attention owns
    // the event-driven unlock. Blocked/interrupted submissions unlock in the
    // submit() catch path, and success deletes the draft.
    if (this.draft?.status === "attention") this.submitPending = false;
    this.render();
    this.onStateChanged();
  }

  // ─── Editor client (RevisionEditorClient) ───

  onDocChanged(mapper: AnchorPositionMapper, nextSource: string): void {
    if (!this.draft || this.draft.notes.length === 0) return;
    const result = mapDraftAnchors(this.draft, mapper, nextSource);
    if (!result.changed) return;
    this.draft = result.draft;
    this.touch();
    this.scheduleSave();
    this.render();
  }

  onSelectionChanged(selection: RevisionEditorSelection | null): void {
    this.selection = selection;
  }

  onAddNoteRequested(selection: RevisionEditorSelection): void {
    this.selection = selection;
    this.openComposer(selection, null);
  }

  onReattachRequested(selection: RevisionEditorSelection): void {
    this.selection = selection;
    void this.commitReattach(selection);
  }

  onAnnotationClicked(noteId: string): void {
    if (!this.draft?.notes.some((note) => note.id === noteId)) return;
    this.setActiveNote(noteId);
    if (this.narrow && !this.railOpen) this.setRailOpen(true);
    this.panel?.revealNote(noteId);
  }

  onEditorEscape(): boolean {
    if (this.popover?.isOpen) {
      this.closePopover();
      return true;
    }
    if (this.reattachNoteId) {
      this.cancelReattach();
      return true;
    }
    if (this.activeNoteId) {
      this.setActiveNote(null);
      return true;
    }
    return false;
  }

  // ─── Context-menu boundary (one global `editor-menu` handler lives in main) ───

  canAddNote(editor: Editor): boolean {
    if (!this.active || this.isLocked) return false;
    if (this.pendingNoteCount >= REVISION_LIMITS.notesPerDraft) return false;
    return editor.getSelection().trim().length > 0;
  }

  openNoteComposerFromEditor(editor: Editor): void {
    // The context menu can fire after the editor lost focus, so fall back to
    // the last selection the extension reported.
    const selection = this.selectionFromEditor(editor) ?? this.selection;
    if (!selection) {
      new Notice("Select some text before adding a revision note.");
      return;
    }
    if (this.reattachNoteId) {
      void this.commitReattach(selection);
      return;
    }
    this.openComposer(selection, null);
  }

  private selectionFromEditor(editor: Editor): RevisionEditorSelection | null {
    const editorView = this.bridge.editorViewFor(this.view);
    if (editorView) {
      const main = editorView.state.selection.main;
      if (main.empty) return null;
      const text = editorView.state.sliceDoc(main.from, main.to);
      if (!text.trim()) return null;
      return { from: main.from, to: main.to, text, livePreview: true };
    }
    // Fallback for panes whose EditorView has not registered yet: derive the
    // primary selection from the public Editor API (§6.4 — primary only).
    const ranges = editor.listSelections();
    const primary = ranges[0];
    if (!primary) return null;
    const a = editor.posToOffset(primary.anchor);
    const b = editor.posToOffset(primary.head);
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    if (to <= from) return null;
    const text = editor.getValue().slice(from, to);
    if (!text.trim()) return null;
    return { from, to, text, livePreview: false };
  }

  // ─── Composer ───

  private openComposer(selection: RevisionEditorSelection, note: RevisionNote | null): void {
    if (this.isLocked) {
      new Notice("This revision is already in progress.");
      return;
    }
    if (!note && this.pendingNoteCount >= REVISION_LIMITS.notesPerDraft) {
      new Notice(
        `A draft holds at most ${REVISION_LIMITS.notesPerDraft} notes. Send or delete some first.`,
      );
      return;
    }
    if (!note && selection.text.length > REVISION_LIMITS.selectionChars) {
      new Notice(
        `Selection is too large (${selection.text.length.toLocaleString()} characters). ` +
          `Select at most ${REVISION_LIMITS.selectionChars.toLocaleString()} characters.`,
      );
      return;
    }

    this.closePopover();
    this.setComposerOpen(true);

    const from = note ? note.anchor.from : selection.from;
    const to = note ? note.anchor.to : selection.to;
    const editorView = this.bridge.editorViewFor(this.view);

    let composer: RevisionNotePopover;
    const isCurrent = (): boolean => this.active && this.popover === composer;
    composer = new RevisionNotePopover({
      mode: note ? "edit" : "add",
      quote: compactQuote(note ? note.anchor.exact : selection.text, QUOTE_PREVIEW_CHARS),
      comment: note?.comment,
      maxChars: REVISION_LIMITS.commentChars,
      getAnchorRect: () => (editorView ? rangeRect(editorView, from, to) : null),
      onSubmit: async (comment) => {
        if (!isCurrent()) return false;
        const saved = note
          ? await this.updateNote(note.id, comment)
          : await this.addNote(selection, comment, isCurrent);
        if (!saved || !isCurrent()) return false;
        this.popover = null;
        this.setComposerOpen(false);
        return true;
      },
      onCancel: () => {
        if (this.popover !== composer) return;
        this.popover = null;
        this.setComposerOpen(false);
        editorView?.focus();
      },
      ownerDocument: editorView?.dom.ownerDocument ?? this.view.contentEl.ownerDocument,
      returnFocusTo: null,
    });
    this.popover = composer;
  }

  private closePopover(): void {
    if (!this.popover) return;
    this.popover.close();
    this.popover = null;
    this.setComposerOpen(false);
  }

  private setComposerOpen(open: boolean): void {
    if (this.composerOpen === open) return;
    this.composerOpen = open;
    this.scheduleEditorSync();
  }

  private async addNote(
    selection: RevisionEditorSelection,
    comment: string,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    if (!isCurrent()) return false;
    const source = this.currentSource();
    let anchor;
    try {
      anchor = createAnchor(source, selection.from, selection.to);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not anchor that selection.");
      return false;
    }
    let draft: RevisionDraft;
    try {
      draft = await this.ensureDraft();
    } catch (error) {
      console.error("Agent Fleet: failed to create revision draft", error);
      new Notice("Could not create the revision draft. Your comment is still open — try again.");
      return false;
    }
    if (!isCurrent()) return false;
    if (draft.notes.length >= REVISION_LIMITS.notesPerDraft) {
      new Notice(`A draft holds at most ${REVISION_LIMITS.notesPerDraft} notes.`);
      return false;
    }
    const timestamp = nowIso(this.deps);
    draft.notes.push({
      id: newId(this.deps),
      anchor,
      comment: comment.slice(0, REVISION_LIMITS.commentChars),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    this.touch();
    this.scheduleSave();
    this.render();
    this.onStateChanged();
    return true;
  }

  private async updateNote(noteId: string, comment: string): Promise<boolean> {
    const note = this.draft?.notes.find((item) => item.id === noteId);
    if (!note) return false;
    note.comment = comment.slice(0, REVISION_LIMITS.commentChars);
    note.updatedAt = nowIso(this.deps);
    this.touch();
    this.scheduleSave();
    this.render();
    return true;
  }

  private editNote(noteId: string): void {
    const note = this.draft?.notes.find((item) => item.id === noteId);
    if (!note) return;
    const editorView = this.bridge.editorViewFor(this.view);
    if (editorView) revealRevisionRange(editorView, note.anchor.from, note.anchor.to);
    this.openComposer(
      { from: note.anchor.from, to: note.anchor.to, text: note.anchor.exact, livePreview: true },
      note,
    );
  }

  private async deleteNote(noteId: string): Promise<void> {
    if (!this.draft || this.isLocked) return;
    const before = this.draft.notes.length;
    this.draft.notes = this.draft.notes.filter((note) => note.id !== noteId);
    if (this.draft.notes.length === before) return;
    if (this.activeNoteId === noteId) this.activeNoteId = null;
    if (this.reattachNoteId === noteId) this.reattachNoteId = null;
    this.touch();
    this.scheduleSave();
    this.render();
    this.onStateChanged();
  }

  // ─── Reattach (§9.4) ───

  private beginReattach(noteId: string): void {
    if (this.isLocked) return;
    this.reattachNoteId = noteId;
    this.render();
    new Notice("Select the passage this note belongs to, then choose Reattach note here.");
    this.bridge.editorViewFor(this.view)?.focus();
  }

  private cancelReattach(): void {
    if (!this.reattachNoteId) return;
    this.reattachNoteId = null;
    this.render();
  }

  private async commitReattach(selection: RevisionEditorSelection): Promise<void> {
    const noteId = this.reattachNoteId;
    if (!noteId) return;
    const note = this.draft?.notes.find((item) => item.id === noteId);
    if (!note) {
      this.reattachNoteId = null;
      this.render();
      return;
    }
    try {
      note.anchor = createAnchor(this.currentSource(), selection.from, selection.to);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not anchor that selection.");
      return;
    }
    delete note.orphaned;
    note.updatedAt = nowIso(this.deps);
    this.reattachNoteId = null;
    this.touch();
    this.scheduleSave();
    this.render();
    this.onStateChanged();
  }

  // ─── Destination ───

  private selectedAgentName(): string {
    return this.selectedAgent;
  }

  private selectedConversationId(): string {
    const destination = this.draft?.destination;
    if (destination && destination.agentName === this.selectedAgent) {
      return destination.conversationId;
    }
    return this.pendingConversationId;
  }

  private async selectAgent(agentName: string): Promise<void> {
    if (this.isLocked) return;
    if (agentName === this.selectedAgent) return;
    this.selectedAgent = agentName;
    this.pendingConversationId = "";
    this.conversations = [];
    // Invalidate a list request for the previous agent immediately. The forced
    // request below increments this again and becomes the only result allowed
    // to update the selector.
    this.conversationRequest += 1;
    this.conversationsState = agentName ? "loading" : "idle";
    // Changing the agent clears an incompatible conversation selection (§6.3).
    if (this.draft?.destination) {
      delete this.draft.destination;
      this.touch();
      this.scheduleSave();
    }
    this.render();
    // selectAgent already paints the loading state. Force the actual request;
    // otherwise loadConversations sees "loading" and treats it as a duplicate,
    // leaving the selector stuck forever after an agent switch.
    if (agentName) await this.loadConversations(agentName, true);
  }

  private async selectConversation(conversationId: string): Promise<void> {
    if (this.isLocked) return;
    const agentName = this.selectedAgent;
    if (!agentName || !conversationId) return;
    this.pendingConversationId = conversationId;
    this.render();
    const draft = await this.ensureDraft();
    if (
      !this.active ||
      this.selectedAgent !== agentName ||
      this.pendingConversationId !== conversationId
    ) {
      return;
    }
    draft.destination = { agentName, conversationId };
    this.touch();
    this.scheduleSave();
    this.render();
  }

  private async loadConversations(agentName: string, force = false): Promise<void> {
    if (!agentName) {
      this.conversations = [];
      this.conversationsState = "idle";
      this.render();
      return;
    }
    if (!force && this.conversationsState === "loading") return;
    const request = ++this.conversationRequest;
    this.conversationsState = "loading";
    this.conversationsError = "";
    this.render();
    try {
      const list = await this.deps.listConversations(agentName);
      if (request !== this.conversationRequest || !this.active) return;
      this.conversations = list;
      this.conversationsState = list.length ? "ready" : "empty";
    } catch (error) {
      if (request !== this.conversationRequest || !this.active) return;
      this.conversations = [];
      this.conversationsState = "error";
      this.conversationsError =
        error instanceof Error ? error.message : "Could not load conversations.";
    }
    this.render();
  }

  private async createConversation(): Promise<void> {
    const agentName = this.selectedAgentName();
    if (!agentName || this.isLocked) return;
    const request = ++this.conversationRequest;
    const suggested = `Revision: ${basename(this.sourcePath)}`;
    this.conversationsState = "loading";
    this.render();
    try {
      const created = await this.deps.createConversation(agentName, suggested);
      if (
        !this.active ||
        request !== this.conversationRequest ||
        this.selectedAgentName() !== agentName
      ) {
        return;
      }
      this.conversations = [created, ...this.conversations.filter((c) => c.id !== created.id)];
      this.conversationsState = "ready";
      await this.selectConversation(created.id);
    } catch (error) {
      if (
        !this.active ||
        request !== this.conversationRequest ||
        this.selectedAgentName() !== agentName
      ) {
        return;
      }
      this.conversationsState = "error";
      this.conversationsError =
        error instanceof Error ? error.message : "Could not create a conversation.";
      this.render();
    }
  }

  private async openConversation(): Promise<void> {
    const destination = this.draft?.destination;
    if (!destination?.agentName || !destination.conversationId) return;
    await this.deps.openConversation?.(destination);
  }

  // ─── Submission ───

  private async submit(): Promise<void> {
    const draft = this.draft;
    if (!draft || !this.canSubmit()) return;
    this.submitPending = true;
    this.render();
    try {
      await this.flushSave(true);
      await this.deps.submitDraft(draft.id);
    } catch (error) {
      this.submitPending = false;
      console.error("Agent Fleet: revision submission failed", error);
      new Notice(
        error instanceof Error ? error.message : "Could not start the revision. Nothing was sent.",
      );
      this.render();
    }
  }

  private confirmDiscard(): void {
    const draft = this.draft;
    if (!draft || this.isLocked) return;
    const count = draft.notes.length;
    new ConfirmModal(this.deps.app, {
      title: "Discard revision draft?",
      body:
        count === 1
          ? "This deletes 1 revision note. The document itself is not changed."
          : `This deletes ${count} revision notes. The document itself is not changed.`,
      confirmText: "Discard draft",
      danger: true,
      onConfirm: async () => {
        this.discarding = true;
        try {
          await this.deps.discardDraft(draft.id);
          this.draft = null;
          this.dirty = false;
          this.activeNoteId = null;
          this.reattachNoteId = null;
        } catch (error) {
          console.error("Agent Fleet: failed to discard revision draft", error);
          new Notice("Could not discard the revision draft.");
        } finally {
          this.discarding = false;
          this.render();
          this.onStateChanged();
        }
      },
    }).open();
  }

  // ─── Derived view state ───

  private agentFor(name: string): AgentConfig | undefined {
    return this.deps.listAgents().find((agent) => agent.name === name);
  }

  private destinationProblem(): string | undefined {
    const agentName = this.selectedAgent;
    if (!agentName) return undefined;
    const agent = this.agentFor(agentName);
    if (!agent) return `Agent “${agentName}” is no longer available.`;
    if (isKnownReadOnlyAgent(agent)) {
      return `${agent.name} runs in a read-only mode and cannot edit the document.`;
    }
    if (!agent.enabled) return `${agent.name} is disabled.`;
    const conversationId = this.selectedConversationId();
    if (!conversationId) return undefined;
    if (this.conversationsState === "ready" || this.conversationsState === "empty") {
      const known = this.conversations.some((c) => c.id === conversationId);
      if (!known) return "That conversation no longer exists. Choose another.";
    }
    return undefined;
  }

  private hasOrphans(): boolean {
    return this.draft?.notes.some((note) => note.orphaned === true) === true;
  }

  private canSubmit(): boolean {
    if (this.isLocked) return false;
    const draft = this.draft;
    if (!draft || draft.notes.length === 0) return false;
    if (this.hasOrphans()) return false;
    if (!this.selectedAgent || !this.selectedConversationId()) return false;
    return this.destinationProblem() === undefined;
  }

  /**
   * The whole status story, for the visually hidden live region only (§17).
   *
   * Nothing renders these sentences visibly: a blocked reason is anchored to
   * the control that is wrong (destination note, orphan card), progress morphs
   * the primary action, and a failure shows once in the rail banner (§6.2).
   */
  private statusView(): RevisionStatusView {
    const draft = this.draft;
    if (draft?.status === "attention") {
      return {
        kind: "attention",
        announcement:
          draft.attentionMessage ?? "The revision did not complete. Your notes were kept.",
      };
    }
    if (this.isLocked) {
      const phase = draft?.submission?.phase;
      if (phase === "running") {
        return { kind: "running", announcement: "Revising the document. The agent is editing." };
      }
      if (phase === "verifying") {
        return { kind: "running", announcement: "Checking the document. Verifying the result." };
      }
      return {
        kind: "waiting",
        announcement:
          "Waiting for the conversation. The revision starts when the conversation is idle.",
      };
    }
    const problem = this.destinationProblem();
    if (problem) return { kind: "incomplete", announcement: problem };
    if (this.hasOrphans()) {
      return {
        kind: "incomplete",
        announcement: "Not ready. Reattach or delete the note whose passage changed.",
      };
    }
    if (!this.selectedAgent || !this.selectedConversationId()) {
      return { kind: "incomplete", announcement: "Not ready. Choose an agent and a conversation." };
    }
    const count = draft?.notes.length ?? 0;
    if (count === 0) {
      return { kind: "ready", announcement: "Ready. Select a passage to add your first note." };
    }
    return {
      kind: "ready",
      announcement:
        count === 1
          ? "Ready. 1 note will be sent as one revision."
          : `Ready. ${count} notes will be sent as one revision.`,
    };
  }

  /** The one contextual primary action shared by the rail footer and the dock. */
  private actionView(status: RevisionStatusView): RevisionActionView {
    if (status.kind === "attention") {
      return { label: "Retry", icon: "refresh-cw", disabled: !this.canSubmit(), busy: false };
    }
    if (this.isLocked) {
      const phase = this.draft?.submission?.phase;
      if (phase === "running") {
        return { label: "Revising…", icon: "loader", disabled: true, busy: true };
      }
      if (phase === "verifying") {
        return { label: "Checking…", icon: "loader", disabled: true, busy: true };
      }
      return { label: "Waiting…", icon: "clock", disabled: true, busy: true };
    }
    return { label: "Revise", icon: "send", disabled: !this.canSubmit(), busy: false };
  }

  private overflowView(): RevisionOverflowView {
    const destination = this.draft?.destination;
    return {
      canDiscard: Boolean(this.draft) && !this.isLocked,
      canOpenConversation:
        Boolean(destination?.conversationId) && Boolean(this.deps.openConversation),
    };
  }

  private destinationView(): RevisionDestinationView {
    const warning = this.destinationProblem();
    return {
      agents: this.deps.listAgents().map((agent) => ({
        name: agent.name,
        readOnly: isKnownReadOnlyAgent(agent),
        disabled: !agent.enabled,
      })),
      selectedAgent: this.selectedAgent,
      conversations: this.conversationOptions(),
      conversationsState: this.conversationsState,
      ...(this.conversationsError ? { conversationsError: this.conversationsError } : {}),
      selectedConversation: this.selectedConversationId(),
      ...(warning ? { warning } : {}),
    };
  }

  private conversationOptions(): RevisionConversationOption[] {
    return this.conversations.map((meta) => ({ id: meta.id, label: conversationLabel(meta) }));
  }

  private noteCards(): RevisionNoteCardView[] {
    return orderedNotes(this.draft).map((note, index) => ({
      id: note.id,
      index: index + 1,
      quote: compactQuote(note.anchor.exact, QUOTE_PREVIEW_CHARS),
      comment: note.comment,
      orphaned: note.orphaned === true,
    }));
  }

  private setActiveNote(noteId: string | null): void {
    if (this.activeNoteId === noteId) return;
    this.activeNoteId = noteId;
    this.scheduleEditorSync();
    this.panel?.render(this.panelState());
  }

  private revealNote(noteId: string): void {
    const note = this.draft?.notes.find((item) => item.id === noteId);
    if (!note) return;
    const editorView = this.bridge.editorViewFor(this.view);
    if (editorView) revealRevisionRange(editorView, note.anchor.from, note.anchor.to);
    this.setActiveNote(noteId);
  }

  private panelState(): RevisionPanelState {
    const draft = this.draft;
    const status = this.statusView();
    // The failure message lives here and nowhere else: Retry is the footer
    // action and Open conversation is an overflow item (§6.2, §6.9).
    const attention =
      draft?.status === "attention"
        ? {
            message:
              draft.attentionMessage ?? "The revision did not complete. Your notes were kept.",
          }
        : undefined;
    return {
      destination: this.destinationView(),
      notes: this.noteCards(),
      noteCount: this.pendingNoteCount,
      status,
      action: this.actionView(status),
      overflow: this.overflowView(),
      activeNoteId: this.activeNoteId,
      reattachNoteId: this.reattachNoteId,
      locked: this.isLocked,
      narrow: this.narrow,
      open: this.railOpen,
      ...(attention ? { attention } : {}),
    };
  }

  private dockState(status: RevisionStatusView): RevisionDockState {
    return {
      noteCount: this.pendingNoteCount,
      action: this.actionView(status),
      overflow: this.overflowView(),
      narrow: this.narrow,
      railOpen: this.railOpen,
      attention: status.kind === "attention",
    };
  }

  /** Push the current state into the rail, the dock, the live region, and the
   *  editor. */
  private render(): void {
    if (!this.active) return;
    const state = this.panelState();
    this.panel?.render(state);
    this.dock?.render(this.dockState(state.status));
    this.live?.announce(state.status.announcement);
    this.scheduleEditorSync();
  }

  /**
   * Push controller state into CodeMirror on a microtask.
   *
   * Deferred deliberately: `onDocChanged` runs inside a `ViewPlugin.update()`,
   * and dispatching a transaction from inside an update is illegal in CM6.
   * Decorations map through the transaction on their own, so nothing visibly
   * lags by one microtask.
   */
  private scheduleEditorSync(): void {
    if (this.editorSyncScheduled || !this.active) return;
    this.editorSyncScheduled = true;
    queueMicrotask(() => {
      this.editorSyncScheduled = false;
      this.syncEditorState();
    });
  }

  private syncEditorState(): void {
    if (!this.active || this.destroyed) return;
    const editorView = this.bridge.editorViewFor(this.view);
    if (!editorView) return;
    const patch: Parameters<typeof applyRevisionEditorState>[1] = {
      active: true,
      activeNoteId: this.activeNoteId,
      composerOpen: this.composerOpen,
      reattachNoteId: this.reattachNoteId,
      locked: this.isLocked,
    };
    if (this.syncedRevision !== this.draftRevision) {
      this.syncedRevision = this.draftRevision;
      patch.draft = this.draft ? cloneDraft(this.draft) : null;
    }
    applyRevisionEditorState(editorView, patch);
  }
}

/** Deep-enough copy: notes and anchors are replaced, never mutated in place,
 *  so a snapshot handed to CodeMirror or the store cannot change underneath. */
function cloneDraft(draft: RevisionDraft): RevisionDraft {
  return {
    ...draft,
    notes: draft.notes.map((note) => ({ ...note, anchor: { ...note.anchor } })),
    ...(draft.destination ? { destination: { ...draft.destination } } : {}),
    ...(draft.submission ? { submission: { ...draft.submission } } : {}),
  };
}

/**
 * Owns one controller per markdown view and exposes the whole integration
 * surface the plugin needs. The integrator registers global events once and
 * forwards them here; this class never registers workspace events itself.
 */
export class RevisionModeHost {
  private readonly controllers = new Map<MarkdownView, RevisionModeController>();
  private readonly headerActions = new Map<MarkdownView, HTMLElement>();
  private readonly viewPaths = new Map<MarkdownView, string>();
  private readonly bridge = new RevisionEditorBridge();
  private readonly unsubscribe: () => void;
  private destroyed = false;

  constructor(private readonly deps: RevisionModeDeps) {
    this.unsubscribe = deps.subscribe(() => this.refreshHeaderActions());
  }

  /** Register with `Plugin.registerEditorExtension()` exactly once. */
  get editorExtension(): Extension {
    return this.bridge.extension;
  }

  isActive(view: MarkdownView): boolean {
    return this.controllers.get(view)?.isActive === true;
  }

  async toggle(view: MarkdownView): Promise<void> {
    if (this.isActive(view)) this.deactivate(view);
    else await this.activate(view);
  }

  /**
   * Enter Revision mode for a view. The caller is responsible for switching a
   * Reading-view leaf to `source` first (`WorkspaceLeaf.setViewState`) — this
   * class never touches the view mode (§6.1).
   */
  async activate(view: MarkdownView): Promise<void> {
    if (this.destroyed) return;
    // Revision chrome and selection actions belong to the one view currently
    // being reviewed. Starting in another tab exits the previous view without
    // deleting its sidecar draft.
    for (const [otherView, otherController] of this.controllers) {
      if (otherView !== view && otherController.isActive) otherController.deactivate();
    }
    let controller = this.controllers.get(view);
    const path = view.file?.path ?? "";
    if (controller && this.viewPaths.get(view) !== path) {
      controller.destroy();
      this.controllers.delete(view);
      this.viewPaths.delete(view);
      controller = undefined;
    }
    if (!controller) {
      controller = new RevisionModeController(view, this.deps, this.bridge, () =>
        this.refreshHeaderActions(),
      );
      this.controllers.set(view, controller);
    }
    this.viewPaths.set(view, path);
    await controller.activate();
    this.refreshHeaderActions();
  }

  deactivate(view: MarkdownView): void {
    this.controllers.get(view)?.deactivate();
    this.refreshHeaderActions();
  }

  /** Number of saved notes for a document, for the header-action badge (§6.1). */
  pendingNoteCount(path: string): number {
    if (!path) return 0;
    return this.deps.getDraftForPath(path)?.notes.length ?? 0;
  }

  /** Track the element returned by `MarkdownView.addAction()` so the host can
   *  paint its idle/pending/active states. */
  registerHeaderAction(view: MarkdownView, el: HTMLElement): void {
    el.addClass("af-revision-action");
    this.headerActions.set(view, el);
    this.updateHeaderAction(view, el);
  }

  unregisterHeaderAction(view: MarkdownView): void {
    this.headerActions.delete(view);
  }

  /** Repaint every tracked header action. Cheap; call from layout events. */
  refreshHeaderActions(): void {
    for (const [view, el] of this.headerActions) {
      if (!el.isConnected) {
        this.headerActions.delete(view);
        continue;
      }
      this.updateHeaderAction(view, el);
    }
  }

  private updateHeaderAction(view: MarkdownView, el: HTMLElement): void {
    const active = this.isActive(view);
    const count = this.pendingNoteCount(view.file?.path ?? "");
    el.toggleClass("af-revision-action-active", active);
    let badge = el.querySelector<HTMLElement>(".af-revision-action-badge");
    if (count > 0) {
      if (!badge) badge = el.createSpan({ cls: "af-revision-action-badge" });
      badge.setText(count > 99 ? "99+" : String(count));
    } else {
      badge?.remove();
    }
    const label = active
      ? "Exit revision mode"
      : count > 0
        ? `Revision mode (${count} pending ${count === 1 ? "note" : "notes"})`
        : "Revision mode";
    el.setAttribute("aria-label", label);
    el.setAttribute("aria-pressed", String(active));
    el.setAttribute("title", label);
  }

  /**
   * Prune controllers for closed panes and exit Revision mode in a leaf that
   * switched to another file (§10.5). Call from `layout-change`, `file-open`,
   * and `active-leaf-change`.
   */
  handleLayoutChange(): void {
    for (const [view, controller] of this.controllers) {
      if (!view.containerEl.isConnected) {
        controller.destroy();
        this.controllers.delete(view);
        this.headerActions.delete(view);
        this.viewPaths.delete(view);
        continue;
      }
      const path = view.file?.path ?? "";
      const trackedPath = this.viewPaths.get(view);
      if (trackedPath !== undefined && trackedPath !== path) {
        // A MarkdownView instance can be reused for another file. Its controller
        // carries document-scoped destination, request and draft state, so it
        // must not be reused across that boundary.
        controller.destroy();
        this.controllers.delete(view);
        this.viewPaths.delete(view);
        continue;
      }
      if (controller.isActive) {
        // Reading → source rebuilds the EditorView; re-push mode and decorations.
        controller.syncEditor();
      }
    }
    this.bridge.refreshFloatingActions();
    this.refreshHeaderActions();
  }

  /** True when the workspace `editor-menu` handler should offer **Add revision
   *  note** for this editor. */
  canAddNote(info: MarkdownFileInfo, editor: Editor): boolean {
    const controller = this.controllerFor(info);
    return controller?.canAddNote(editor) === true;
  }

  /** Open the note composer from the context menu. */
  openNoteComposer(info: MarkdownFileInfo, editor: Editor): void {
    this.controllerFor(info)?.openNoteComposerFromEditor(editor);
  }

  private controllerFor(info: MarkdownFileInfo): RevisionModeController | null {
    if (!(info instanceof MarkdownView)) return null;
    return this.controllers.get(info) ?? null;
  }

  /** Persist any debounced anchor updates. Await before reading the sidecar
   *  from disk (submission does this through its own flush too). */
  async flushPendingSaves(): Promise<void> {
    await Promise.all([...this.controllers.values()].map((c) => c.flushSave()));
  }

  /** Full teardown for `Plugin.onunload()`. Obsidian removes the editor
   *  extension itself; this removes every controller's DOM first. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    for (const controller of this.controllers.values()) controller.destroy();
    this.controllers.clear();
    for (const el of this.headerActions.values()) {
      el.removeClass("af-revision-action");
      el.removeClass("af-revision-action-active");
      el.querySelector(".af-revision-action-badge")?.remove();
    }
    this.headerActions.clear();
    this.viewPaths.clear();
    this.bridge.destroy();
  }
}

/** Re-exported so the integrator can build the header action icon without
 *  importing Lucide names from two places. */
export const REVISION_HEADER_ICON = "message-square-text";

/** Convenience for integrators that want the icon painted on an element they
 *  already created. */
export function paintRevisionActionIcon(el: HTMLElement): void {
  setIcon(el, REVISION_HEADER_ICON);
}
