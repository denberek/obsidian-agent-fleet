/**
 * Anchored note composer for Revision mode (REVISION_MODE_DESIGN.md §6.4, §17).
 *
 * One popover exists at a time per controller. It never touches the document —
 * it collects an instruction for a range the caller already resolved, and hands
 * the trimmed text back. Keyboard contract:
 *
 * - `Cmd/Ctrl + Enter` saves
 * - `Escape` closes without saving
 * - focus moves to the textarea on open and returns to the opener on close
 */
import { setIcon } from "obsidian";

export interface RevisionNotePopoverOptions {
  /** "add" for a new note, "edit" for an existing one. Only affects labels. */
  mode: "add" | "edit";
  /** Compact preview of the anchored passage. */
  quote: string;
  /** Existing comment when editing. */
  comment?: string;
  /** Hard cap from `REVISION_LIMITS.commentChars`. */
  maxChars: number;
  /**
   * Viewport rectangle of the anchored range, re-queried when the window
   * resizes or the editor scrolls. Returning null keeps the last position,
   * which is what happens when the range scrolls out of the rendered viewport.
   */
  getAnchorRect: () => DOMRect | null;
  /** Return false (or reject) to keep the composer open for a retry. */
  onSubmit: (comment: string) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
  /** Document that owns the markdown editor (important for pop-out windows). */
  ownerDocument?: Document;
  /** Element that receives focus when the popover closes. */
  returnFocusTo?: HTMLElement | null;
}

const POPOVER_WIDTH = 360;
const VIEWPORT_MARGIN = 12;

export class RevisionNotePopover {
  private readonly el: HTMLElement;
  private readonly textarea: HTMLTextAreaElement;
  private readonly counterEl: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly ownerDocument: Document;
  private readonly ownerWindow: Window;
  private readonly onPointerDown: (event: MouseEvent) => void;
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private readonly onReposition: () => void;
  private repositionFrame = 0;
  private closed = false;
  private submitting = false;

  constructor(private readonly options: RevisionNotePopoverOptions) {
    const editing = options.mode === "edit";
    this.ownerDocument = options.ownerDocument ?? document;
    this.ownerWindow = this.ownerDocument.defaultView ?? window;
    this.el = this.ownerDocument.body.createDiv({ cls: "af-revision-popover" });
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "false");
    this.el.setAttribute("aria-label", editing ? "Edit revision note" : "Add revision note");

    const header = this.el.createDiv({ cls: "af-revision-popover-header" });
    const icon = header.createSpan({ cls: "af-revision-popover-icon" });
    setIcon(icon, editing ? "pencil" : "message-square-plus");
    header.createSpan({
      cls: "af-revision-popover-title",
      text: editing ? "Edit revision note" : "Add revision note",
    });

    this.el.createDiv({ cls: "af-revision-popover-quote", text: `“${options.quote}”` });

    const fieldId = `af-revision-comment-${Math.random().toString(36).slice(2, 10)}`;
    const label = this.el.createEl("label", {
      cls: "af-revision-popover-label",
      text: "What should the agent change?",
    });
    label.setAttribute("for", fieldId);

    this.textarea = this.el.createEl("textarea", { cls: "af-revision-popover-input" });
    this.textarea.id = fieldId;
    this.textarea.rows = 4;
    this.textarea.placeholder = "Describe the change in your own words";
    this.textarea.value = options.comment ?? "";
    this.textarea.maxLength = options.maxChars;

    const footer = this.el.createDiv({ cls: "af-revision-popover-actions" });
    this.counterEl = footer.createSpan({ cls: "af-revision-popover-counter" });
    // Agent Fleet's shared button primitives — same pair the create/edit forms
    // use in their footers.
    const cancel = footer.createEl("button", {
      cls: "af-btn-sm",
      text: "Cancel",
    });
    cancel.type = "button";
    this.saveButton = footer.createEl("button", {
      cls: "af-btn-sm primary",
      text: editing ? "Save changes" : "Add note",
    });
    this.saveButton.type = "button";

    cancel.addEventListener("click", () => this.cancel());
    this.saveButton.addEventListener("click", () => void this.submit());
    this.textarea.addEventListener("input", () => this.syncValidity());
    // Keep the editor selection intact while the user interacts with the popover.
    this.el.addEventListener("mousedown", (event) => event.stopPropagation());

    this.onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        void this.submit();
      }
    };
    this.el.addEventListener("keydown", this.onKeyDown);

    this.onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      // Avoid cross-realm instanceof checks: the event already comes from the
      // editor's owner window, so a nodeType is sufficient proof of a Node.
      if (target && typeof target.nodeType === "number" && this.el.contains(target)) return;
      this.cancel();
    };
    // Capture phase: Obsidian stops propagation on some surfaces.
    this.ownerWindow.addEventListener("mousedown", this.onPointerDown, true);

    this.onReposition = (): void => {
      if (this.repositionFrame) return;
      this.repositionFrame = this.ownerWindow.requestAnimationFrame(() => {
        this.repositionFrame = 0;
        this.position();
      });
    };
    this.ownerWindow.addEventListener("resize", this.onReposition);
    this.ownerWindow.addEventListener("scroll", this.onReposition, true);

    this.syncValidity();
    this.position();
    this.ownerWindow.setTimeout(() => {
      if (this.closed) return;
      this.textarea.focus();
      this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
    }, 0);
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  /** Re-run placement, e.g. after the rail collapses and the editor reflows. */
  reposition(): void {
    this.position();
  }

  private syncValidity(): void {
    const value = this.textarea.value.trim();
    const tooLong = this.textarea.value.length > this.options.maxChars;
    this.saveButton.disabled = this.submitting || value.length === 0 || tooLong;
    const remaining = this.options.maxChars - this.textarea.value.length;
    // Only nag near the cap; a counter on every note is noise.
    const showCounter = remaining <= 500;
    this.counterEl.toggleClass("af-revision-visible", showCounter);
    this.counterEl.setText(showCounter ? `${remaining.toLocaleString()} left` : "");
    this.counterEl.toggleClass("af-revision-over", remaining < 0);
  }

  private position(): void {
    const rect = this.options.getAnchorRect();
    if (!rect) return;
    const width = this.el.offsetWidth || POPOVER_WIDTH;
    const height = this.el.offsetHeight || 220;
    let left = rect.left;
    if (left + width > this.ownerWindow.innerWidth - VIEWPORT_MARGIN) {
      left = this.ownerWindow.innerWidth - width - VIEWPORT_MARGIN;
    }
    let top = rect.bottom + 10;
    if (top + height > this.ownerWindow.innerHeight - VIEWPORT_MARGIN) {
      top = rect.top - height - 10;
    }
    this.el.style.left = `${Math.max(VIEWPORT_MARGIN, left)}px`;
    this.el.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
  }

  private async submit(): Promise<void> {
    const comment = this.textarea.value.trim();
    if (this.submitting || !comment || comment.length > this.options.maxChars) return;
    this.submitting = true;
    this.syncValidity();
    try {
      const accepted = await this.options.onSubmit(comment);
      if (accepted === false) return;
      this.teardown();
    } catch (error) {
      console.error("Agent Fleet: failed to save revision note", error);
    } finally {
      if (!this.closed) {
        this.submitting = false;
        this.syncValidity();
        this.textarea.focus();
      }
    }
  }

  private cancel(): void {
    if (this.closed) return;
    const { onCancel } = this.options;
    this.teardown();
    onCancel();
  }

  /** Close without firing either callback (controller-driven close). */
  close(): void {
    this.teardown();
  }

  private teardown(): void {
    if (this.closed) return;
    this.closed = true;
    this.ownerWindow.removeEventListener("mousedown", this.onPointerDown, true);
    this.ownerWindow.removeEventListener("resize", this.onReposition);
    this.ownerWindow.removeEventListener("scroll", this.onReposition, true);
    if (this.repositionFrame) {
      this.ownerWindow.cancelAnimationFrame(this.repositionFrame);
      this.repositionFrame = 0;
    }
    this.el.remove();
    const returnTo = this.options.returnFocusTo;
    if (returnTo && returnTo.isConnected) returnTo.focus();
  }
}
