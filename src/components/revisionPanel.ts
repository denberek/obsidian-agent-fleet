/**
 * Document-attached Revision mode chrome (REVISION_MODE_DESIGN.md §6.2, §25.1).
 *
 * Since the rail-owned controls decision (§6.2) there is no toolbar row. Three
 * dumb view classes mount as direct children of `MarkdownView.contentEl`:
 *
 * - `RevisionPanel` — the Revision Notes rail, and the **only** control panel
 *   at normal width: compact header, destination section, scrollable note
 *   cards, sticky action footer (one primary action + one overflow menu).
 * - `RevisionDock` — a single-row bottom dock that exists only in narrow panes,
 *   where the rail becomes a collapsible overlay and would otherwise take the
 *   controls away with it.
 * - `RevisionLiveRegion` — the visually hidden `role="status"` announcement
 *   that keeps §17 satisfied now that the visible status sentence is gone.
 *
 * None of them know about drafts, stores, or CodeMirror. The controller hands
 * them a view model and receives callbacks; that keeps every persistence and
 * anchor decision in one place.
 *
 * Component language: these views reuse Agent Fleet's existing primitives —
 * `af-btn-sm` (+ `primary`), `af-btn-icon`, `af-form-select`, `af-form-label`
 * and Obsidian's `clickable-icon` / `Menu`. `af-revision-*` classes only carry
 * layout and state deltas, never a second appearance for the same primitive.
 */
import { Menu, setIcon } from "obsidian";

export type RevisionStatusKind = "ready" | "incomplete" | "waiting" | "running" | "attention";

export interface RevisionStatusView {
  kind: RevisionStatusKind;
  /**
   * Complete sentence for the visually hidden live region. Nothing renders it
   * visibly — blocked reasons are anchored to the control that is wrong, and
   * progress morphs the primary action instead (§6.2).
   */
  announcement: string;
}

/** The single contextual primary action. Rendered by the rail footer and, in
 *  narrow panes, by the dock — both from this one view model. */
export interface RevisionActionView {
  label: string;
  icon: string;
  disabled: boolean;
  /** Queued/running/verifying: the label reports progress, not a verb. */
  busy: boolean;
}

/** Secondary actions, offered only through the overflow `Menu`. */
export interface RevisionOverflowView {
  canDiscard: boolean;
  canOpenConversation: boolean;
}

export interface RevisionAgentOption {
  name: string;
  /** Known read-only permission mode: `plan` on Claude/Pi, `read-only` on
   *  Codex/Pi. Selectable, but submission is blocked with a warning (§6.3). */
  readOnly: boolean;
  /** Agent is disabled in its config. */
  disabled: boolean;
}

export interface RevisionConversationOption {
  id: string;
  label: string;
}

export type RevisionConversationsState = "idle" | "loading" | "ready" | "empty" | "error";

/** Destination section of the rail header. Never rendered by the dock — the
 *  dock's notes chip opens the rail when the user needs these (§25.1). */
export interface RevisionDestinationView {
  agents: RevisionAgentOption[];
  selectedAgent: string;
  conversations: RevisionConversationOption[];
  conversationsState: RevisionConversationsState;
  conversationsError?: string;
  selectedConversation: string;
  /** Set when the saved destination no longer resolves (§6.3). */
  warning?: string;
}

/** Every callback the revision chrome can raise. One object is shared by the
 *  rail and the dock so both surfaces drive identical controller paths. */
export interface RevisionChromeHandlers {
  onAgentChange(agentName: string): void;
  onConversationChange(conversationId: string): void;
  onCreateConversation(): void;
  onRetryConversations(): void;
  onSubmit(): void;
  onDiscard(): void;
  onOpenConversation(): void;
  onExit(): void;
  onToggleRail(): void;
  onCloseRail(): void;
  onCardHover(noteId: string | null): void;
  onCardActivate(noteId: string): void;
  onEdit(noteId: string): void;
  onDelete(noteId: string): void;
  onReattach(noteId: string): void;
  onCancelReattach(): void;
}

/** Sentinel option value for "create a conversation for this revision". */
export const CREATE_CONVERSATION_VALUE = "__af_create_conversation__";

/** Panes are per-view, so element ids must be too — two panes on one document
 *  would otherwise share a `for=` target. */
let fieldIdSeq = 0;

function nextFieldId(name: string): string {
  fieldIdSeq += 1;
  return `af-revision-${name}-${fieldIdSeq}`;
}

/** Icon-only control. Obsidian's own `clickable-icon` supplies the size, hover
 *  and focus treatment; `af-revision-*` only adds placement/disabled deltas. */
function iconButton(
  parent: HTMLElement,
  icon: string,
  label: string,
  cls: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  const button = parent.createEl("button", { cls: `clickable-icon ${cls}` });
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  setIcon(button, icon);
  button.addEventListener("click", (event) => onClick(event));
  return button;
}

/** Repaint an icon holder only when the icon actually changed. */
function renderIcon(el: HTMLElement, icon: string): void {
  if (el.dataset.icon === icon) return;
  el.dataset.icon = icon;
  el.empty();
  setIcon(el, icon);
}

interface ActionButton {
  el: HTMLButtonElement;
  icon: HTMLElement;
  label: HTMLElement;
}

/** The contextual primary action, built from the standard `af-btn-sm primary`
 *  pattern used by the dashboard and the forms. */
function createActionButton(
  parent: HTMLElement,
  cls: string,
  onClick: () => void,
): ActionButton {
  const el = parent.createEl("button", { cls: `af-btn-sm primary ${cls}` });
  el.type = "button";
  const icon = el.createSpan({ cls: "af-btn-icon" });
  const label = el.createSpan();
  el.addEventListener("click", () => onClick());
  return { el, icon, label };
}

function renderActionButton(button: ActionButton, action: RevisionActionView): void {
  renderIcon(button.icon, action.icon);
  button.label.setText(action.label);
  button.el.disabled = action.disabled;
  button.el.toggleClass("af-revision-action-busy", action.busy);
  button.el.setAttribute("aria-label", action.label);
  button.el.setAttribute("title", action.label);
}

/**
 * Overflow menu (§6.2). Obsidian's `Menu` — never a hand-rolled popover — and
 * only genuinely secondary actions: nothing here has a persistent button.
 */
function showOverflowMenu(
  event: MouseEvent,
  overflow: RevisionOverflowView,
  handlers: RevisionChromeHandlers,
): void {
  const menu = new Menu();
  if (overflow.canOpenConversation) {
    menu.addItem((item) =>
      item
        .setTitle("Open conversation")
        .setIcon("message-square")
        .onClick(() => handlers.onOpenConversation()),
    );
  }
  menu.addItem((item) =>
    item
      .setTitle("Discard draft")
      .setIcon("trash-2")
      .setWarning(true)
      .setDisabled(!overflow.canDiscard)
      // `setDisabled` is presentational in some Obsidian builds, so the guard
      // is repeated here — discarding is destructive.
      .onClick(() => {
        if (overflow.canDiscard) handlers.onDiscard();
      }),
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Exit revision mode")
      .setIcon("x")
      .onClick(() => handlers.onExit()),
  );
  menu.showAtMouseEvent(event);
}

function noteCountLabel(count: number): string {
  return count === 1 ? "1 note" : `${count.toLocaleString()} notes`;
}

/**
 * Visually hidden status announcement. Uses clipping rather than
 * `display: none`, which assistive technology does not announce (§17).
 */
export class RevisionLiveRegion {
  readonly el: HTMLElement;

  constructor(host: HTMLElement) {
    this.el = createDiv({ cls: "af-revision-live" });
    this.el.setAttribute("role", "status");
    this.el.setAttribute("aria-live", "polite");
    host.append(this.el);
  }

  announce(text: string): void {
    if (this.el.textContent === text) return;
    this.el.setText(text);
  }

  destroy(): void {
    this.el.remove();
  }
}

export interface RevisionNoteCardView {
  id: string;
  /** 1-based position in document order. */
  index: number;
  quote: string;
  comment: string;
  orphaned: boolean;
}

export interface RevisionPanelState {
  destination: RevisionDestinationView;
  notes: RevisionNoteCardView[];
  noteCount: number;
  status: RevisionStatusView;
  action: RevisionActionView;
  overflow: RevisionOverflowView;
  activeNoteId: string | null;
  /** Note waiting for a replacement passage (§9.4). */
  reattachNoteId: string | null;
  /** Queued/running — every control except the overflow menu is inert. */
  locked: boolean;
  narrow: boolean;
  /** Overlay visibility while narrow. Always true at normal width. */
  open: boolean;
  /** Failure banner content (§6.9). The message appears here and nowhere else;
   *  Retry is the footer action and Open conversation is in the overflow. */
  attention?: { message: string };
}

/**
 * The Revision Notes rail — the sole control panel at normal width.
 *
 * Layout: fixed header (identity + destination), scrolling note list, fixed
 * footer (primary action + overflow). The footer is pinned by flex rather than
 * `position: sticky` so it can never be scrolled past.
 */
export class RevisionPanel {
  readonly el: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly agentSelect: HTMLSelectElement;
  private readonly conversationSelect: HTMLSelectElement;
  private readonly destinationNote: HTMLElement;
  private readonly destinationRetry: HTMLButtonElement;
  private readonly attentionEl: HTMLElement;
  private readonly reattachEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly action: ActionButton;
  private readonly overflowButton: HTMLButtonElement;
  private overflow: RevisionOverflowView = { canDiscard: false, canOpenConversation: false };
  private renderedKey = "";

  constructor(
    host: HTMLElement,
    private readonly handlers: RevisionChromeHandlers,
  ) {
    this.el = createDiv({ cls: "af-revision-rail" });
    this.el.setAttribute("role", "complementary");
    this.el.setAttribute("aria-label", "Revision notes");

    const header = this.el.createDiv({ cls: "af-revision-rail-header" });
    const headingRow = header.createDiv({ cls: "af-revision-rail-heading" });
    const icon = headingRow.createSpan({ cls: "af-revision-rail-icon" });
    setIcon(icon, "message-square-text");
    headingRow.createSpan({ cls: "af-revision-rail-title", text: "Revision notes" });
    this.countEl = headingRow.createSpan({ cls: "af-revision-rail-count" });
    // Only meaningful while the rail is an overlay; the markdown header's
    // Revision action remains the primary way out of the mode (§6.1).
    this.closeButton = iconButton(headingRow, "x", "Close revision notes", "af-revision-rail-close", () =>
      this.handlers.onCloseRail(),
    );

    const destination = header.createDiv({ cls: "af-revision-destination" });

    const agentField = destination.createDiv({ cls: "af-revision-field" });
    const agentLabel = agentField.createEl("label", {
      cls: "af-form-label af-revision-field-label",
      text: "Agent",
    });
    this.agentSelect = agentField.createEl("select", {
      cls: "af-form-select af-revision-select",
    });
    this.agentSelect.id = nextFieldId("agent");
    agentLabel.setAttribute("for", this.agentSelect.id);
    this.agentSelect.addEventListener("change", () =>
      this.handlers.onAgentChange(this.agentSelect.value),
    );

    const conversationField = destination.createDiv({ cls: "af-revision-field" });
    const conversationLabel = conversationField.createEl("label", {
      cls: "af-form-label af-revision-field-label",
      text: "Conversation",
    });
    this.conversationSelect = conversationField.createEl("select", {
      cls: "af-form-select af-revision-select",
    });
    this.conversationSelect.id = nextFieldId("conversation");
    conversationLabel.setAttribute("for", this.conversationSelect.id);
    this.conversationSelect.addEventListener("change", () => {
      const value = this.conversationSelect.value;
      if (value === CREATE_CONVERSATION_VALUE) this.handlers.onCreateConversation();
      else this.handlers.onConversationChange(value);
    });

    const foot = destination.createDiv({ cls: "af-revision-field-foot" });
    this.destinationNote = foot.createSpan({ cls: "af-revision-field-note" });
    this.destinationRetry = foot.createEl("button", { cls: "af-btn-sm af-revision-retry" });
    this.destinationRetry.type = "button";
    const retryIcon = this.destinationRetry.createSpan({ cls: "af-btn-icon" });
    setIcon(retryIcon, "refresh-cw");
    this.destinationRetry.createSpan({ text: "Retry" });
    this.destinationRetry.addEventListener("click", () => this.handlers.onRetryConversations());

    this.attentionEl = this.el.createDiv({ cls: "af-revision-attention" });
    this.reattachEl = this.el.createDiv({ cls: "af-revision-reattach-banner" });
    this.listEl = this.el.createDiv({ cls: "af-revision-notes" });

    const footer = this.el.createDiv({ cls: "af-revision-rail-footer" });
    this.action = createActionButton(footer, "af-revision-action-button", () =>
      this.handlers.onSubmit(),
    );
    this.overflowButton = iconButton(
      footer,
      "more-horizontal",
      "More revision actions",
      "af-revision-overflow",
      (event) => showOverflowMenu(event, this.overflow, this.handlers),
    );

    host.append(this.el);
  }

  render(state: RevisionPanelState): void {
    this.overflow = state.overflow;
    this.el.toggleClass("af-revision-rail-open", state.open);
    this.el.toggleClass("af-revision-rail-overlay", state.narrow);
    this.el.toggleClass("af-revision-rail-locked", state.locked);
    if (state.narrow && !state.open) this.el.setAttribute("aria-hidden", "true");
    else this.el.removeAttribute("aria-hidden");

    this.countEl.setText(`${state.noteCount}`);
    this.countEl.toggleClass("af-revision-visible", state.noteCount > 0);
    this.closeButton.toggleClass("af-revision-visible", state.narrow);

    this.renderDestination(state);
    renderActionButton(this.action, state.action);
    this.renderAttention(state);
    this.renderReattach(state);
    this.renderNotes(state);
  }

  private renderDestination(state: RevisionPanelState): void {
    const destination = state.destination;
    this.renderAgents(destination, state.locked);
    this.renderConversations(destination, state.locked);

    const note =
      destination.conversationsState === "error"
        ? (destination.conversationsError ?? "Could not load conversations.")
        : destination.conversationsState === "empty"
          ? "No conversations yet — create one."
          : (destination.warning ?? "");
    this.destinationNote.setText(note);
    this.destinationNote.toggleClass("af-revision-visible", Boolean(note));
    this.destinationNote.toggleClass(
      "af-revision-error",
      destination.conversationsState === "error" || Boolean(destination.warning),
    );
    this.destinationRetry.toggleClass(
      "af-revision-visible",
      destination.conversationsState === "error",
    );
    this.destinationRetry.disabled = state.locked;
  }

  private renderAgents(destination: RevisionDestinationView, locked: boolean): void {
    const desired = destination.agents.map((agent) => agent.name).join(" ");
    if (this.agentSelect.dataset.options !== desired) {
      this.agentSelect.dataset.options = desired;
      this.agentSelect.empty();
      const placeholder = this.agentSelect.createEl("option", { text: "Select an agent…" });
      placeholder.value = "";
      for (const agent of destination.agents) {
        const suffix = agent.readOnly ? " (read-only)" : agent.disabled ? " (disabled)" : "";
        const option = this.agentSelect.createEl("option", { text: `${agent.name}${suffix}` });
        option.value = agent.name;
      }
    }
    this.agentSelect.value = destination.selectedAgent;
    this.agentSelect.disabled = locked || destination.agents.length === 0;
  }

  private renderConversations(destination: RevisionDestinationView, locked: boolean): void {
    const options: RevisionConversationOption[] = [...destination.conversations];
    const key = [
      destination.selectedAgent,
      destination.conversationsState,
      ...options.map((option) => `${option.id}${option.label}`),
    ].join(" ");
    if (this.conversationSelect.dataset.options !== key) {
      this.conversationSelect.dataset.options = key;
      this.conversationSelect.empty();
      const placeholder = this.conversationSelect.createEl("option", {
        text:
          destination.conversationsState === "loading"
            ? "Loading conversations…"
            : destination.selectedAgent
              ? "Select a conversation…"
              : "Select an agent first",
      });
      placeholder.value = "";
      for (const option of options) {
        const el = this.conversationSelect.createEl("option", { text: option.label });
        el.value = option.id;
      }
      if (destination.selectedAgent && destination.conversationsState !== "loading") {
        const create = this.conversationSelect.createEl("option", {
          text: "Create conversation…",
        });
        create.value = CREATE_CONVERSATION_VALUE;
      }
    }
    // Routing always uses the opaque id; the label is display data only (§6.3).
    this.conversationSelect.value = destination.selectedConversation;
    this.conversationSelect.disabled =
      locked || !destination.selectedAgent || destination.conversationsState === "loading";
  }

  private renderAttention(state: RevisionPanelState): void {
    const attention = state.attention;
    this.attentionEl.toggleClass("af-revision-visible", Boolean(attention));
    if (!attention) {
      this.attentionEl.empty();
      delete this.attentionEl.dataset.message;
      return;
    }
    if (this.attentionEl.dataset.message === attention.message) return;
    this.attentionEl.dataset.message = attention.message;
    this.attentionEl.empty();
    const icon = this.attentionEl.createSpan({ cls: "af-revision-attention-icon" });
    setIcon(icon, "alert-triangle");
    this.attentionEl.createSpan({ cls: "af-revision-attention-text", text: attention.message });
  }

  private renderReattach(state: RevisionPanelState): void {
    const reattaching = Boolean(state.reattachNoteId);
    this.reattachEl.toggleClass("af-revision-visible", reattaching);
    if (!reattaching) {
      this.reattachEl.empty();
      return;
    }
    if (this.reattachEl.childElementCount > 0) return;
    this.reattachEl.createSpan({
      cls: "af-revision-reattach-text",
      text: "Select the passage this note belongs to, then choose Reattach note here.",
    });
    const cancel = this.reattachEl.createEl("button", {
      cls: "af-btn-sm af-revision-reattach-cancel",
      text: "Cancel",
    });
    cancel.type = "button";
    cancel.addEventListener("click", () => this.handlers.onCancelReattach());
  }

  private renderNotes(state: RevisionPanelState): void {
    const key = JSON.stringify({
      notes: state.notes,
      active: state.activeNoteId,
      reattach: state.reattachNoteId,
      locked: state.locked,
    });
    if (key === this.renderedKey) return;
    this.renderedKey = key;

    const focusedId =
      document.activeElement instanceof HTMLElement
        ? (document.activeElement.closest(".af-revision-note-card") as HTMLElement | null)?.dataset
            .noteId
        : undefined;

    this.listEl.empty();

    if (state.notes.length === 0) {
      // The rail's own empty state is where selection is taught — there is no
      // instructional status sentence anywhere else (§6.2).
      const empty = this.listEl.createDiv({ cls: "af-empty-state af-revision-empty" });
      const icon = empty.createDiv({ cls: "af-empty-icon" });
      setIcon(icon, "message-square-plus");
      empty.createDiv({ cls: "af-empty-label", text: "No revision notes yet" });
      empty.createDiv({
        cls: "af-empty-sublabel",
        text: "Select a sentence or a whole section, then use the floating button or the right-click menu.",
      });
      return;
    }

    for (const note of state.notes) {
      const card = this.listEl.createDiv({ cls: "af-revision-note-card" });
      card.dataset.noteId = note.id;
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Revision note ${note.index}`);
      card.toggleClass("af-revision-note-active", note.id === state.activeNoteId);
      card.toggleClass("af-revision-note-orphan", note.orphaned);
      card.toggleClass("af-revision-note-reattaching", note.id === state.reattachNoteId);

      card.createSpan({ cls: "af-revision-note-number", text: String(note.index) });
      card.createDiv({ cls: "af-revision-note-quote", text: `“${note.quote}”` });
      card.createDiv({ cls: "af-revision-note-comment", text: note.comment });

      if (note.orphaned) {
        const warn = card.createDiv({ cls: "af-revision-note-warning" });
        const icon = warn.createSpan({ cls: "af-revision-note-warning-icon" });
        setIcon(icon, "unlink");
        warn.createSpan({ text: "Passage changed — reselect or delete this note" });
      }

      const actions = card.createDiv({ cls: "af-revision-note-actions" });
      if (note.orphaned) {
        const reattach = iconButton(
          actions,
          "link",
          "Reattach note",
          "af-revision-note-action",
          () => this.handlers.onReattach(note.id),
        );
        reattach.disabled = state.locked;
      }
      const edit = iconButton(actions, "pencil", "Edit note", "af-revision-note-action", () =>
        this.handlers.onEdit(note.id),
      );
      edit.disabled = state.locked;
      const remove = iconButton(actions, "trash-2", "Delete note", "af-revision-note-action", () =>
        this.handlers.onDelete(note.id),
      );
      remove.disabled = state.locked;

      card.addEventListener("mouseenter", () => this.handlers.onCardHover(note.id));
      card.addEventListener("mouseleave", () => this.handlers.onCardHover(null));
      card.addEventListener("focus", () => this.handlers.onCardHover(note.id));
      card.addEventListener("blur", () => this.handlers.onCardHover(null));
      card.addEventListener("click", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button")) return;
        this.handlers.onCardActivate(note.id);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target instanceof HTMLElement && event.target.closest("button")) return;
        event.preventDefault();
        this.handlers.onCardActivate(note.id);
      });

      if (focusedId === note.id) card.focus();
    }
  }

  /** Bring a note card into view and mark it as the panel's current card. */
  revealNote(noteId: string): void {
    const card = this.listEl.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(noteId)}"]`);
    card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  destroy(): void {
    this.el.remove();
  }
}

export interface RevisionDockState {
  noteCount: number;
  action: RevisionActionView;
  overflow: RevisionOverflowView;
  narrow: boolean;
  railOpen: boolean;
  /** Paints the notes chip as needing attention so a failure is visible even
   *  while the overlay rail (which owns the message) is closed. */
  attention: boolean;
}

/**
 * Narrow-pane bottom dock (§25.1). One row: notes chip → opens the rail,
 * the same contextual primary action as the rail footer, and the same overflow
 * menu. It carries no title, subtitle, or status sentence, and CSS keeps it out
 * of the DOM flow entirely at normal width.
 */
export class RevisionDock {
  readonly el: HTMLElement;
  private readonly notesButton: HTMLButtonElement;
  private readonly notesIcon: HTMLElement;
  private readonly notesLabel: HTMLElement;
  private readonly action: ActionButton;
  private readonly overflowButton: HTMLButtonElement;
  private overflow: RevisionOverflowView = { canDiscard: false, canOpenConversation: false };

  constructor(host: HTMLElement, handlers: RevisionChromeHandlers) {
    this.el = createDiv({ cls: "af-revision-dock" });
    this.el.setAttribute("role", "region");
    this.el.setAttribute("aria-label", "Revision mode");

    this.notesButton = this.el.createEl("button", { cls: "af-btn-sm af-revision-dock-notes" });
    this.notesButton.type = "button";
    this.notesIcon = this.notesButton.createSpan({ cls: "af-btn-icon" });
    setIcon(this.notesIcon, "message-square-text");
    this.notesLabel = this.notesButton.createSpan();
    this.notesButton.addEventListener("click", () => handlers.onToggleRail());

    this.action = createActionButton(this.el, "af-revision-action-button", () =>
      handlers.onSubmit(),
    );
    this.overflowButton = iconButton(
      this.el,
      "more-horizontal",
      "More revision actions",
      "af-revision-overflow",
      (event) => showOverflowMenu(event, this.overflow, handlers),
    );

    host.append(this.el);
  }

  render(state: RevisionDockState): void {
    this.overflow = state.overflow;
    this.el.toggleClass("af-revision-visible", state.narrow);
    this.notesLabel.setText(state.noteCount > 0 ? noteCountLabel(state.noteCount) : "Notes");
    this.notesButton.toggleClass("danger", state.attention);
    this.notesButton.setAttribute("aria-expanded", String(state.railOpen));
    const label = state.railOpen ? "Hide revision notes" : "Show revision notes";
    this.notesButton.setAttribute("aria-label", label);
    this.notesButton.setAttribute("title", label);
    renderActionButton(this.action, state.action);
    this.overflowButton.disabled = false;
  }

  destroy(): void {
    this.el.remove();
  }
}
