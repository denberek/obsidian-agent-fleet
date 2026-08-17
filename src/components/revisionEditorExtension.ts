/**
 * Revision mode CodeMirror 6 extension (REVISION_MODE_DESIGN.md §§10.1–10.3, §25).
 *
 * This module is the only place Revision mode touches CodeMirror. It provides:
 *
 * - Six state effects (mode, draft snapshot, active note, composer, reattach,
 *   submission lock) and one state field that turns them into mark decorations.
 * - A `ViewPlugin` that keeps a `MarkdownFileInfo → EditorView` registry so
 *   plugin code can reach a specific pane's editor without the non-public
 *   `editor.cm` (§25.2), maps anchors through transactions, and owns the
 *   floating **Add revision** action.
 * - A change filter that blocks *user* edits while a submission is in flight
 *   but still lets Obsidian and the agent write to the document.
 *
 * Everything is inert while Revision mode is off: the field holds
 * `Decoration.none`, the view plugin does no document work, and no floating
 * DOM is created (§10.3, §16).
 *
 * Anchor mathematics lives in `src/utils/revisionAnchors.ts` — this file only
 * hands CodeMirror's `ChangeDesc` (structurally an `AnchorPositionMapper`) to
 * those pure helpers.
 */
import {
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  type Extension,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { MarkdownView, editorInfoField, editorLivePreviewField, setIcon } from "obsidian";
import type { MarkdownFileInfo } from "obsidian";
import type { RevisionDraft } from "../types";
import type { AnchorPositionMapper } from "../utils/revisionAnchors";

/** DOM attribute carrying the note id on every annotation decoration. */
export const REVISION_NOTE_ATTR = "data-af-revision-note";

/** A primary-selection range reported to the controller. Offsets are raw
 *  markdown character offsets, matching `RevisionAnchor`. */
export interface RevisionEditorSelection {
  from: number;
  to: number;
  text: string;
  /** True when the owning editor is in Live Preview rather than source mode. */
  livePreview: boolean;
}

/** Callbacks a `RevisionModeController` registers for one markdown view. The
 *  extension never imports the controller — this is the whole seam. */
export interface RevisionEditorClient {
  /** The document changed locally. `mapper` is the transaction's `ChangeDesc`. */
  onDocChanged(mapper: AnchorPositionMapper, nextSource: string): void;
  /** Primary selection changed (null when empty, whitespace-only, or gone). */
  onSelectionChanged(selection: RevisionEditorSelection | null): void;
  /** The floating action was activated for a fresh note. */
  onAddNoteRequested(selection: RevisionEditorSelection): void;
  /** The floating action was activated while a note was waiting to reattach. */
  onReattachRequested(selection: RevisionEditorSelection): void;
  /** An annotated passage was clicked in the document. */
  onAnnotationClicked(noteId: string): void;
  /** `Escape` inside the editor. Return true when the controller consumed it. */
  onEditorEscape(): boolean;
}

/** Mutable slice of Revision mode reflected into the editor. */
export interface RevisionEditorState {
  /** Revision mode is active for this view. Everything else is ignored when false. */
  active: boolean;
  /** Draft snapshot whose notes become decorations. */
  draft: RevisionDraft | null;
  /** Note highlighted because its card is hovered/focused. */
  activeNoteId: string | null;
  /** True while the note composer popover owns the interaction. */
  composerOpen: boolean;
  /** Note waiting for the user to pick a replacement passage (§9.4). */
  reattachNoteId: string | null;
  /** True while a submission is queued/running — blocks user edits (§6.7). */
  locked: boolean;
}

interface RevisionFieldValue extends RevisionEditorState {
  decorations: DecorationSet;
}

const INACTIVE_STATE: RevisionFieldValue = {
  active: false,
  draft: null,
  activeNoteId: null,
  composerOpen: false,
  reattachNoteId: null,
  locked: false,
  decorations: Decoration.none,
};

// ─── State effects (§10.3) ───

export const setRevisionActiveEffect = StateEffect.define<boolean>();
export const setRevisionDraftEffect = StateEffect.define<RevisionDraft | null>();
export const setRevisionActiveNoteEffect = StateEffect.define<string | null>();
export const setRevisionComposerEffect = StateEffect.define<boolean>();
export const setRevisionReattachEffect = StateEffect.define<string | null>();
export const setRevisionLockEffect = StateEffect.define<boolean>();

/** Annotation decoration. Orphans get their own class so the state is carried
 *  by shape (dashed underline) as well as color (§17). */
function markFor(noteId: string, orphaned: boolean, active: boolean): Decoration {
  let cls = "af-revision-mark";
  if (orphaned) cls += " af-revision-mark-orphan";
  if (active) cls += " af-revision-mark-active";
  return Decoration.mark({ class: cls, attributes: { [REVISION_NOTE_ATTR]: noteId } });
}

/**
 * Build the decoration set for a draft. Ranges are clamped to the document and
 * collapsed ranges are dropped — a collapsed range means the passage was
 * deleted, which the note card reports as orphaned instead (§9.2).
 */
function buildDecorations(value: RevisionEditorState, docLength: number): DecorationSet {
  if (!value.active || !value.draft || value.draft.notes.length === 0) return Decoration.none;
  const ranges = [];
  for (const note of value.draft.notes) {
    const from = Math.max(0, Math.min(note.anchor.from, docLength));
    const to = Math.max(from, Math.min(note.anchor.to, docLength));
    if (to <= from) continue;
    ranges.push(
      markFor(note.id, note.orphaned === true, note.id === value.activeNoteId).range(from, to),
    );
  }
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

/** The one state field. Holds Revision mode state plus its decorations so
 *  highlights map through edits in the same transaction as the text (§9.2). */
export const revisionStateField = StateField.define<RevisionFieldValue>({
  create: () => INACTIVE_STATE,
  update(value, tr) {
    let next: RevisionFieldValue = value;
    let rebuild = false;

    for (const effect of tr.effects) {
      if (effect.is(setRevisionActiveEffect)) {
        if (effect.value !== next.active) {
          // Leaving the mode resets everything, so a stale draft can never
          // linger in an inactive editor.
          next = effect.value ? { ...next, active: true } : INACTIVE_STATE;
          rebuild = true;
        }
      } else if (effect.is(setRevisionDraftEffect)) {
        next = { ...next, draft: effect.value };
        rebuild = true;
      } else if (effect.is(setRevisionActiveNoteEffect)) {
        if (effect.value !== next.activeNoteId) {
          next = { ...next, activeNoteId: effect.value };
          rebuild = true;
        }
      } else if (effect.is(setRevisionComposerEffect)) {
        next = { ...next, composerOpen: effect.value };
      } else if (effect.is(setRevisionReattachEffect)) {
        next = { ...next, reattachNoteId: effect.value };
      } else if (effect.is(setRevisionLockEffect)) {
        next = { ...next, locked: effect.value };
      }
    }

    if (rebuild) return { ...next, decorations: buildDecorations(next, tr.state.doc.length) };
    if (tr.docChanged && next.decorations !== Decoration.none) {
      return { ...next, decorations: next.decorations.map(tr.changes) };
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/** Read the Revision mode slice for an editor, if the extension is loaded. */
export function readRevisionEditorState(view: EditorView): RevisionEditorState | null {
  return view.state.field(revisionStateField, false) ?? null;
}

/** Dispatch only the effects a patch actually changes. Cheap enough to call on
 *  every render; a no-op patch dispatches nothing. */
export function applyRevisionEditorState(
  view: EditorView,
  patch: Partial<RevisionEditorState>,
): void {
  const current = view.state.field(revisionStateField, false);
  if (!current) return;
  const effects: Array<StateEffect<unknown>> = [];
  if (patch.active !== undefined && patch.active !== current.active) {
    effects.push(setRevisionActiveEffect.of(patch.active));
  }
  if (patch.draft !== undefined && patch.draft !== current.draft) {
    effects.push(setRevisionDraftEffect.of(patch.draft));
  }
  if (patch.activeNoteId !== undefined && patch.activeNoteId !== current.activeNoteId) {
    effects.push(setRevisionActiveNoteEffect.of(patch.activeNoteId));
  }
  if (patch.composerOpen !== undefined && patch.composerOpen !== current.composerOpen) {
    effects.push(setRevisionComposerEffect.of(patch.composerOpen));
  }
  if (patch.reattachNoteId !== undefined && patch.reattachNoteId !== current.reattachNoteId) {
    effects.push(setRevisionReattachEffect.of(patch.reattachNoteId));
  }
  if (patch.locked !== undefined && patch.locked !== current.locked) {
    effects.push(setRevisionLockEffect.of(patch.locked));
  }
  if (effects.length) view.dispatch({ effects });
}

/** Scroll an anchor range into view without changing the user's selection —
 *  clicking a note card navigates, it does not select (§6.5). */
export function revealRevisionRange(view: EditorView, from: number, to: number): void {
  const max = view.state.doc.length;
  const start = Math.max(0, Math.min(from, max));
  const end = Math.max(start, Math.min(to, max));
  view.dispatch({
    effects: EditorView.scrollIntoView(EditorSelection.range(start, end), { y: "center" }),
  });
}

/** Client rectangle of an anchor range in the given editor, for popover
 *  placement. Null when the range is outside the rendered viewport. */
export function rangeRect(view: EditorView, from: number, to: number): DOMRect | null {
  const max = view.state.doc.length;
  const start = Math.max(0, Math.min(from, max));
  const end = Math.max(start, Math.min(to, max));
  const startCoords = view.coordsAtPos(start, 1);
  const endCoords = view.coordsAtPos(end, -1) ?? startCoords;
  if (!startCoords || !endCoords) return null;
  const top = Math.min(startCoords.top, endCoords.top);
  const bottom = Math.max(startCoords.bottom, endCoords.bottom);
  const left = Math.min(startCoords.left, endCoords.left);
  const right = Math.max(startCoords.right, endCoords.right);
  return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
}

/** Change kinds that originate from the person at the keyboard. Anything else
 *  (Obsidian reloading the file after the agent edited it, sync, our own
 *  dispatches) must still apply while the draft is locked (§6.7 step 7). */
const USER_EDIT_EVENTS = ["input", "delete", "move", "undo", "redo"] as const;

function isUserEdit(tr: Transaction): boolean {
  return USER_EDIT_EVENTS.some((event) => tr.isUserEvent(event));
}

/**
 * Submission lock. A change filter is purely additive — it can only add a veto,
 * never override another extension's decision — which is why this is used in
 * place of the `readOnly`/`editable` facets, whose "first value wins" combine
 * could stomp an Obsidian-provided value.
 */
const submissionChangeLock = EditorState.changeFilter.of((tr) => {
  const state = tr.startState.field(revisionStateField, false);
  if (!state?.locked) return true;
  return !isUserEdit(tr);
});

/** Compact text for quotes and labels — collapses whitespace and caps length. */
export function compactQuote(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1))}…`;
}

function selectionFrom(view: EditorView): RevisionEditorSelection | null {
  // Primary selection only — v1 ignores secondary ranges (§6.4).
  const main = view.state.selection.main;
  if (main.empty) return null;
  const text = view.state.sliceDoc(main.from, main.to);
  if (!text.trim()) return null;
  return {
    from: main.from,
    to: main.to,
    text,
    livePreview: view.state.field(editorLivePreviewField, false) === true,
  };
}

/**
 * Floating **Add revision** action (§6.4). Rendered as a fixed-position element
 * on the editor's owner document so neither the editor's overflow nor Obsidian's
 * scroller can clip it, including in pop-out windows. `mousedown` is prevented
 * so activating it never collapses the
 * selection it acts on (§17).
 */
class RevisionSelectionAction {
  private el: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private iconEl: HTMLElement | null = null;
  private mode: "add" | "reattach" = "add";

  constructor(
    private readonly onActivate: () => void,
    private readonly ownerDocument: Document,
  ) {}

  private ensure(): HTMLElement {
    if (this.el) return this.el;
    const el = this.ownerDocument.body.createDiv({ cls: "af-revision-floating" });
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    this.iconEl = el.createSpan({ cls: "af-revision-floating-icon" });
    this.labelEl = el.createSpan({ cls: "af-revision-floating-label" });
    el.addEventListener("mousedown", (event) => event.preventDefault());
    el.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onActivate();
    });
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this.onActivate();
    });
    this.el = el;
    this.applyMode();
    return el;
  }

  setMode(mode: "add" | "reattach"): void {
    if (this.mode === mode) return;
    this.mode = mode;
    if (this.el) this.applyMode();
  }

  private applyMode(): void {
    const { el, labelEl, iconEl } = this;
    if (!el || !labelEl || !iconEl) return;
    const label = this.mode === "reattach" ? "Reattach note here" : "Add revision";
    labelEl.setText(label);
    el.setAttribute("aria-label", label);
    el.setAttribute("title", label);
    setIcon(iconEl, this.mode === "reattach" ? "link" : "message-square-plus");
    el.toggleClass("af-revision-floating-reattach", this.mode === "reattach");
  }

  show(view: EditorView, selection: RevisionEditorSelection): void {
    const el = this.ensure();
    const head = view.state.selection.main.head;
    const coords =
      view.coordsAtPos(head, head === selection.from ? 1 : -1) ??
      view.coordsAtPos(selection.to, -1) ??
      view.coordsAtPos(selection.from, 1);
    if (!coords) {
      this.hide();
      return;
    }
    el.style.visibility = "hidden";
    el.style.display = "";
    const width = el.offsetWidth || 132;
    const height = el.offsetHeight || 28;
    let left = coords.right + 8;
    let top = coords.top - height - 6;
    const viewport = this.ownerDocument.defaultView;
    const viewportWidth = viewport?.innerWidth ?? el.ownerDocument.documentElement.clientWidth;
    const viewportHeight = viewport?.innerHeight ?? el.ownerDocument.documentElement.clientHeight;
    if (left + width > viewportWidth - 12) left = coords.left - width - 8;
    if (top < 12) top = coords.bottom + 8;
    if (top + height > viewportHeight - 12) top = viewportHeight - height - 12;
    el.style.left = `${Math.max(12, left)}px`;
    el.style.top = `${Math.max(12, top)}px`;
    el.style.visibility = "";
  }

  hide(): void {
    if (this.el) this.el.style.display = "none";
  }

  ownsFocus(): boolean {
    return this.el?.contains(this.ownerDocument.activeElement) === true;
  }

  destroy(): void {
    this.el?.remove();
    this.el = null;
    this.labelEl = null;
    this.iconEl = null;
  }
}

/**
 * Bridge between plugin-side controllers and CodeMirror.
 *
 * One instance is created by the integrator, its `extension` is handed to
 * `Plugin.registerEditorExtension()` exactly once, and each
 * `RevisionModeController` attaches itself for its own `MarkdownFileInfo`.
 * The `MarkdownFileInfo → EditorView` map is maintained by the view plugin
 * (§25.2), so no private Obsidian API is needed to dispatch effects into a
 * specific pane.
 */
export class RevisionEditorBridge {
  private readonly editors = new Map<MarkdownFileInfo, EditorView>();
  private readonly clients = new Map<MarkdownFileInfo, RevisionEditorClient>();
  private readonly viewPlugins = new Set<RevisionViewPlugin>();
  private destroyed = false;

  /** Pass to `Plugin.registerEditorExtension()`. */
  readonly extension: Extension;

  constructor() {
    const bridge = this;

    const registry = ViewPlugin.define((view) => new RevisionViewPlugin(bridge, view));

    const clickHandler = EditorView.domEventHandlers({
      mousedown: (event, view) => {
        if (view.state.field(revisionStateField, false)?.active !== true) return false;
        const target = event.target as Element | null;
        // `instanceof HTMLElement` is false across Electron window realms.
        if (!target || typeof target.closest !== "function") return false;
        const noteId = target.closest(`[${REVISION_NOTE_ATTR}]`)?.getAttribute(REVISION_NOTE_ATTR);
        if (!noteId) return false;
        const info = markdownInfo(view);
        if (info) bridge.clientFor(info)?.onAnnotationClicked(noteId);
        return false; // never swallow the event — the caret must still move
      },
    });

    const escapeKey = Prec.high(
      keymap.of([
        {
          key: "Escape",
          run: (view) => {
            if (view.state.field(revisionStateField, false)?.active !== true) return false;
            const info = markdownInfo(view);
            if (!info) return false;
            return bridge.clientFor(info)?.onEditorEscape() === true;
          },
        },
      ]),
    );

    const lockedAttributes = EditorView.editorAttributes.from(
      revisionStateField,
      (value): Record<string, string> => (value.locked ? { class: "af-revision-locked" } : {}),
    );

    this.extension = [
      revisionStateField,
      registry,
      clickHandler,
      escapeKey,
      lockedAttributes,
      submissionChangeLock,
    ];
  }

  /** Bind a controller to the editor(s) showing `info`. */
  attach(info: MarkdownFileInfo, client: RevisionEditorClient): void {
    if (this.destroyed) return;
    this.clients.set(info, client);
  }

  detach(info: MarkdownFileInfo): void {
    this.clients.delete(info);
  }

  /** The live `EditorView` for a markdown view, or null when it has none
   *  (Reading view, or the pane was closed). */
  editorViewFor(info: MarkdownFileInfo): EditorView | null {
    return this.editors.get(info) ?? null;
  }

  clientFor(info: MarkdownFileInfo): RevisionEditorClient | null {
    return this.clients.get(info) ?? null;
  }

  /** @internal Called by the view plugin as editors are created/re-keyed. */
  registerEditor(info: MarkdownFileInfo, view: EditorView): void {
    if (this.destroyed) return;
    this.editors.set(info, view);
  }

  /** @internal Called by the view plugin on destroy or info change. */
  unregisterEditor(info: MarkdownFileInfo, view: EditorView): void {
    if (this.editors.get(info) === view) this.editors.delete(info);
  }

  /** @internal Track live extension instances so workspace tab changes can
   *  immediately hide body-mounted actions even when CodeMirror emits no
   *  geometry or focus update for the editor that just became hidden. */
  registerViewPlugin(plugin: RevisionViewPlugin): void {
    if (!this.destroyed) this.viewPlugins.add(plugin);
  }

  /** @internal */
  unregisterViewPlugin(plugin: RevisionViewPlugin): void {
    this.viewPlugins.delete(plugin);
  }

  /** Re-check body-mounted action visibility after a workspace layout event. */
  refreshFloatingActions(): void {
    for (const plugin of this.viewPlugins) plugin.refreshActionVisibility();
  }

  /** Drop every binding. Obsidian tears the extension itself down when the
   *  plugin unloads, which destroys the view plugins and their floating DOM. */
  destroy(): void {
    this.destroyed = true;
    for (const plugin of this.viewPlugins) plugin.hideAction();
    this.viewPlugins.clear();
    this.clients.clear();
    this.editors.clear();
  }
}

/** Owning markdown pane for an editor, or null for embeds, canvas cards and
 *  property editors — Revision mode only binds to real markdown panes (§25.2). */
function markdownInfo(view: EditorView): MarkdownFileInfo | null {
  const info = view.state.field(editorInfoField, false);
  return info instanceof MarkdownView ? info : null;
}

/** Per-editor half of the extension: registry upkeep, anchor mapping, and the
 *  floating action. Does nothing measurable while the mode is inactive. */
class RevisionViewPlugin {
  private info: MarkdownFileInfo | null;
  private readonly action: RevisionSelectionAction;
  private lastSelectionKey = "";
  private placementQueued = false;
  private destroyed = false;

  constructor(
    private readonly bridge: RevisionEditorBridge,
    private readonly view: EditorView,
  ) {
    this.action = new RevisionSelectionAction(
      () => this.activateAction(),
      view.dom.ownerDocument,
    );
    this.info = markdownInfo(view);
    this.bridge.registerViewPlugin(this);
    if (this.info) this.bridge.registerEditor(this.info, this.view);
  }

  private client(): RevisionEditorClient | null {
    return this.info ? this.bridge.clientFor(this.info) : null;
  }

  update(update: ViewUpdate): void {
    const nextInfo = markdownInfo(this.view);
    if (nextInfo !== this.info) {
      if (this.info) this.bridge.unregisterEditor(this.info, this.view);
      this.info = nextInfo;
      if (nextInfo) this.bridge.registerEditor(nextInfo, this.view);
    }

    const previousState = update.startState.field(revisionStateField, false);
    const state = update.state.field(revisionStateField, false);
    if (!state?.active) {
      if (this.lastSelectionKey) this.lastSelectionKey = "";
      this.action.hide();
      return;
    }

    const client = this.client();
    if (!client) {
      this.action.hide();
      return;
    }

    // Local transaction mapping (§9.2). Only pay for the document string when
    // there is actually something anchored to it.
    if (update.docChanged && state.draft && state.draft.notes.length > 0) {
      client.onDocChanged(update.changes, update.state.doc.toString());
    }

    const livePreviewChanged =
      update.startState.field(editorLivePreviewField, false) !==
      update.state.field(editorLivePreviewField, false);
    const revisionStateChanged = previousState !== state;

    if (
      revisionStateChanged ||
      update.selectionSet ||
      update.docChanged ||
      update.focusChanged ||
      livePreviewChanged
    ) {
      this.syncSelection(client);
    } else if (update.geometryChanged || update.viewportChanged) {
      this.scheduleActionPlacement();
    }
  }

  private syncSelection(client: RevisionEditorClient): void {
    const selection = selectionFrom(this.view);
    const key = selection ? `${selection.from}:${selection.to}` : "";
    if (key !== this.lastSelectionKey) {
      this.lastSelectionKey = key;
      client.onSelectionChanged(selection);
    }
    this.scheduleActionPlacement();
  }

  /**
   * `coordsAtPos()` reads editor layout and CodeMirror forbids that during a
   * ViewPlugin update. Defer the floating action until the transaction has
   * fully committed, coalescing bursts of selection/geometry updates.
   */
  private scheduleActionPlacement(): void {
    if (this.placementQueued || this.destroyed) return;
    this.placementQueued = true;
    queueMicrotask(() => {
      this.placementQueued = false;
      if (this.destroyed) return;
      const state = this.view.state.field(revisionStateField, false);
      if (!state?.active || !this.client()) {
        this.action.hide();
        return;
      }
      this.placeAction(state);
    });
  }

  /** Re-evaluate the global floating element after Obsidian changes tabs or
   *  panes. Hidden editors do not reliably produce a CodeMirror ViewUpdate. */
  refreshActionVisibility(): void {
    this.scheduleActionPlacement();
  }

  /** Immediate unload path used by the bridge before Obsidian removes CM6. */
  hideAction(): void {
    this.action.hide();
  }

  private placeAction(
    state: RevisionEditorState,
    selection: RevisionEditorSelection | null = selectionFrom(this.view),
  ): void {
    // The action lives on the editor document's body to avoid clipping. That
    // also means it must prove its owner is the focused, visible editor;
    // otherwise a selection in a background tab can appear over another file.
    const ownerVisible = this.view.dom.isConnected && this.view.dom.getClientRects().length > 0;
    const ownerFocused = this.view.hasFocus || this.action.ownsFocus();
    if (!ownerVisible || !ownerFocused || !selection || state.locked || state.composerOpen) {
      this.action.hide();
      return;
    }
    this.action.setMode(state.reattachNoteId ? "reattach" : "add");
    this.action.show(this.view, selection);
  }

  private activateAction(): void {
    const state = this.view.state.field(revisionStateField, false);
    const client = this.client();
    if (!state?.active || !client) return;
    const selection = selectionFrom(this.view);
    if (!selection) return;
    if (state.reattachNoteId) client.onReattachRequested(selection);
    else client.onAddNoteRequested(selection);
  }

  destroy(): void {
    this.destroyed = true;
    this.bridge.unregisterViewPlugin(this);
    if (this.info) this.bridge.unregisterEditor(this.info, this.view);
    this.action.destroy();
  }
}
