/**
 * Completion notification for a finished revision (REVISION_MODE_DESIGN.md §6.8).
 *
 * A plain Obsidian `Notice` built from a `DocumentFragment` so it can carry an
 * **Open conversation** button. The button hands back the exact
 * `{ agentName, conversationId }` the user selected — routing is the caller's
 * job, which is why this module never imports `AgentChatView` or the plugin.
 * The chat history holds the complete request and response, so the deleted
 * sidecar loses nothing.
 */
import { Notice, setIcon } from "obsidian";
import type { ConversationTarget } from "../services/inAppConversationManager";

/** The bit of `Notice` this module uses. Keeps the callback injectable in a
 *  DOM-less test environment. */
export interface DismissableNotice {
  hide(): void;
}

export interface RevisionCompletionNoticeOptions {
  /** Vault-relative path of the revised document. */
  sourcePath: string;
  /** Exact destination the revision was sent to. */
  destination: ConversationTarget;
  /** Display name of the conversation, when known. Falls back to the agent name. */
  conversationName?: string;
  /** How many notes the successful revision covered. */
  noteCount: number;
  /** Supplied by the integrator; calls `openChatView(agentName, conversationId)`. */
  openConversation: (target: ConversationTarget) => void | Promise<void>;
  /** Notice lifetime. Longer than the default because it carries an action. */
  durationMs?: number;
  /** Injectable constructor, for tests. */
  createNotice?: (fragment: DocumentFragment, durationMs: number) => DismissableNotice;
}

const DEFAULT_DURATION_MS = 12_000;

/** Basename for display; the full path is kept in the tooltip. */
function documentLabel(sourcePath: string): string {
  const name = sourcePath.split("/").pop() ?? sourcePath;
  return name.replace(/\.md$/i, "");
}

/**
 * Show the completion notice. Returns the notice so a caller can dismiss it
 * early (e.g. on unload).
 */
export function showRevisionCompletionNotice(
  options: RevisionCompletionNoticeOptions,
): DismissableNotice {
  const fragment = document.createDocumentFragment();
  const wrapper = fragment.createDiv({ cls: "af-revision-notice" });

  const heading = wrapper.createDiv({ cls: "af-revision-notice-title" });
  setIcon(heading.createSpan({ cls: "af-revision-notice-icon" }), "check");
  heading.createSpan({
    text: `Revised ${documentLabel(options.sourcePath)}`,
    attr: { title: options.sourcePath },
  });

  const noteWord = options.noteCount === 1 ? "note" : "notes";
  wrapper.createDiv({
    cls: "af-revision-notice-detail",
    text: `${options.noteCount} ${noteWord} applied · ${options.conversationName || options.destination.agentName}`,
  });

  // Assigned immediately after construction below; the handler cannot run
  // before the user clicks, so the reference is always resolved by then.
  let notice: DismissableNotice | undefined;

  const button = wrapper.createEl("button", {
    cls: "af-btn-sm primary af-revision-notice-action",
    text: "Open conversation",
    attr: { type: "button", "aria-label": "Open the conversation that revised this document" },
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    // Hide first: routing may await a workspace leaf, and a notice that lingers
    // behind the opened chat reads as a failed click.
    notice?.hide();
    void Promise.resolve(options.openConversation(options.destination)).catch((err: unknown) => {
      console.error("Agent Fleet: opening the revision conversation failed", err);
    });
  });

  const duration = options.durationMs ?? DEFAULT_DURATION_MS;
  notice = options.createNotice
    ? options.createNotice(fragment, duration)
    : new Notice(fragment, duration);
  return notice;
}
