import { ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";

// WorkspaceLeaf.updateHeader() exists at runtime but isn't in Obsidian's
// published type definitions. Augment the module to suppress TS errors.
declare module "obsidian" {
  interface WorkspaceLeaf {
    updateHeader(): void;
  }
}

import { VIEW_TYPE_CHAT } from "../constants";
import type AgentFleetPlugin from "../main";
import type { AgentConfig, ConversationMeta } from "../types";
import { createIcon } from "../utils/icons";
import { stripRememberTags } from "../utils/memoryFormat";
import { ChatSession, type ChatSessionStats, type ToolCall } from "../services/chatSession";

interface ManagedSession {
  session: ChatSession;
}

/** Compose the sessions-map key. Two parallel chats with the same agent share
 *  a key only when their conversationId matches, so they can both run side
 *  by side without colliding on the chat.json singleton. */
function sessionKey(agentName: string, conversationId: string): string {
  return `${agentName}::${conversationId}`;
}

function newConversationId(): string {
  // 8 hex chars is plenty for picker uniqueness and keeps filenames short.
  // Collisions across a single agent's conversation folder are vanishingly
  // unlikely at this scale.
  return Math.random().toString(16).slice(2, 10);
}

/** Default name applied to auto-created conversations (both first-time
 *  open and "+ New chat"). Users can rename via double-click; keeping a
 *  consistent placeholder shape ("New chat <when>") makes them easy to
 *  distinguish in the picker before they get manually renamed. */
function defaultConversationName(): string {
  return `New chat ${new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Compact relative-time formatter for the conversation rail meta line.
 *  "just now", "5m", "2h", "yesterday", "3d", "Apr 5". Mirrors the kind of
 *  short tokens chat-app sidebars use so each row stays single-line. */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Below this body width (px), the rail auto-collapses to give the chat
 *  pane breathing room. The user's explicit collapse choice wins regardless
 *  of width. */
const CONVO_PANEL_AUTOCOLLAPSE_WIDTH = 480;

/** Obsidian's native sidebar-toggle icon, copied VERBATIM from Obsidian's
 *  source (outer panel rect 22×20 rx=4 + inner `sidebar-toggle-icon-inner`
 *  bar). Inlined because the icon isn't an addressable Lucide glyph, and its
 *  width animation is scoped to Obsidian's own `.sidebar-toggle-button.mod-left`
 *  + global `.is-left-sidedock-open` state — unusable for an in-view panel. So
 *  we drive the bar width ourselves with Obsidian's exact values (8.33% ↔ 24%)
 *  via the `.is-collapsed` class. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** Build the conversations-toggle icon — a 1:1 reproduction of Obsidian's
 *  sidebar-toggle icon (rounded panel + inner bar that animates between the
 *  collapsed/open states via the `.is-collapsed` class). Constructed with the
 *  DOM API (createElementNS) rather than an HTML string, per Obsidian's plugin
 *  guidelines. */
function buildConvoToggleIcon(parent: HTMLElement): void {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "svg-icon af-convo-toggle-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const panel = document.createElementNS(SVG_NS, "rect");
  for (const [k, v] of Object.entries({ x: "1", y: "2", width: "22", height: "20", rx: "4" })) {
    panel.setAttribute(k, v);
  }

  const bar = document.createElementNS(SVG_NS, "rect");
  bar.setAttribute("class", "af-convo-toggle-bar");
  for (const [k, v] of Object.entries({ x: "4", y: "5", width: "2", height: "14", rx: "2", fill: "currentColor" })) {
    bar.setAttribute(k, v);
  }

  svg.appendChild(panel);
  svg.appendChild(bar);
  parent.appendChild(svg);
}

export class AgentChatView extends ItemView {
  selectedAgentName: string | null = null;
  /** In-app conversation id for the current tab. Empty until an agent is
   *  selected (switchToAgent resolves it to an existing or freshly-created
   *  conversation). Persisted via getState. */
  selectedConversationId: string = "";
  private sessions = new Map<string, ManagedSession>();
  /** Conversation list cache, used by the side rail. Refreshed on agent
   *  switch and after any conversation create/rename/delete. */
  private conversationsCache: ConversationMeta[] = [];
  /** Side rail container. Re-populated by renderConvoPanel() — the panel's
   *  outer element persists so a CSS `.collapsed` toggle works without
   *  rebuilding children every time the user collapses/expands. */
  private convoPanelEl: HTMLElement | null = null;
  private collapseBtn: HTMLButtonElement | null = null;
  /** UI-only collapse state. Persisted via view state so it survives reload. */
  private convoPanelCollapsed = false;
  /** Track whether the user explicitly toggled collapse. If they did, that
   *  choice wins over the responsive auto-collapse. Reset only on agent
   *  switch (since "I want it collapsed for this conversation" doesn't make
   *  sense as a permanent preference yet — could be lifted to settings later). */
  private userToggledCollapse = false;
  private resizeObserver: ResizeObserver | null = null;

  // DOM refs
  private headerEl!: HTMLElement;
  private agentSelect!: HTMLSelectElement;
  private messagesEl!: HTMLElement;
  private messagesInner!: HTMLElement;
  private textarea!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private attachStopBtn!: HTMLButtonElement;
  private isInStopMode = false;

  // Attachments
  private attachedFiles: TFile[] = [];
  private attachedImages: Array<{ name: string; path: string }> = [];
  private pillsRow!: HTMLElement;

  // Streaming state (DOM handles — written only by renderIndicators())
  private activityEl: HTMLElement | null = null;
  private streamingDot: HTMLElement | null = null;
  /** Unsubscribe from the currently-viewed session's activity emitter. Runs
   *  on agent switch + view close so a background session (Agent A) never
   *  writes into the DOM while the user is looking at Agent B. */
  private activityUnsub: (() => void) | null = null;

  // Stats strip
  private statsEl!: HTMLElement;
  private statsUnsub: (() => void) | null = null;
  /** The session whose stats the strip currently shows. Swapped when the
   *  user focuses a thread composer. */
  private statsSourceSession: ChatSession | null = null;

  /** Per-anchor open/closed state, UI-only, reset on reload by design. */
  private threadExpanded = new Map<string, boolean>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: AgentFleetPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText(): string {
    if (!this.selectedAgentName) return "Agent Chat";
    const convName = this.getCurrentConversationName();
    // Drop the suffix when there's only a single conversation — the
    // qualifier would be tautological. Multi-conversation users get the
    // full "agent · conversation" title so they can tell tabs apart.
    if (!convName || this.conversationsCache.length <= 1) {
      return `Chat: ${this.selectedAgentName}`;
    }
    return `Chat: ${this.selectedAgentName} · ${convName}`;
  }

  getIcon(): string {
    return "message-circle";
  }

  getState(): Record<string, unknown> {
    return {
      agentName: this.selectedAgentName ?? null,
      conversationId: this.selectedConversationId,
      convoPanelCollapsed: this.convoPanelCollapsed,
    };
  }

  async setState(state: Record<string, unknown>, result: unknown): Promise<void> {
    await super.setState(state, result as { history: boolean });
    // conversationId may be absent (older tab state from before this feature)
    // or be a now-orphaned legacy sentinel like "default". switchToAgent
    // resolves either case to a real conversation — pick the most recent,
    // or auto-create one if the agent has none.
    const incomingConvId =
      typeof state?.conversationId === "string" && state.conversationId
        ? state.conversationId
        : undefined;
    if (typeof state?.convoPanelCollapsed === "boolean") {
      this.convoPanelCollapsed = state.convoPanelCollapsed;
      this.userToggledCollapse = true;
      this.applyCollapsedClass();
    }
    if (state?.agentName && typeof state.agentName === "string") {
      this.selectAgent(state.agentName, incomingConvId);
    }
  }

  private getCurrentConversationName(): string {
    const found = this.conversationsCache.find((c) => c.id === this.selectedConversationId);
    return found?.name ?? "";
  }

  async onOpen(): Promise<void> {
    this.plugin.subscribeView(this);
    this.buildShell();
    await this.render();
    this.observeContainerWidth();
  }

  async onClose(): Promise<void> {
    // Abort any active sessions
    for (const { session } of this.sessions.values()) {
      session.abort();
    }
    this.sessions.clear();
    this.statsUnsub?.();
    this.statsUnsub = null;
    this.activityUnsub?.();
    this.activityUnsub = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.plugin.unsubscribeView(this);
  }

  /** Watch the chat view's container width. If we cross below the
   *  auto-collapse threshold and the user hasn't explicitly set a state
   *  yet, fold the rail; if we cross above and they hadn't manually
   *  collapsed, unfold it. User-explicit toggles disable auto behavior. */
  private observeContainerWidth(): void {
    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.userToggledCollapse) return;
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const shouldCollapse = w < CONVO_PANEL_AUTOCOLLAPSE_WIDTH;
        if (shouldCollapse !== this.convoPanelCollapsed) {
          this.convoPanelCollapsed = shouldCollapse;
          this.applyCollapsedClass();
        }
      }
    });
    this.resizeObserver.observe(this.contentEl);
  }

  /** Called externally to switch to a specific agent and (optionally) a
   *  specific conversation. If another chat tab is already displaying the
   *  same (agent, conversation) pair, that tab is revealed instead — two
   *  tabs on the same pair would race the conversation file and the Claude
   *  session id. Multiple tabs on the SAME agent but DIFFERENT conversations
   *  are explicitly allowed (that's the whole point of this view).
   *
   *  When `conversationId` is omitted or unknown, switchToAgent resolves it
   *  to the most-recent existing conversation, or auto-creates one if the
   *  agent has none. */
  selectAgent(agentName: string, conversationId?: string): void {
    if (conversationId) {
      const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
      for (const leaf of leaves) {
        if (
          leaf.view !== this &&
          leaf.view instanceof AgentChatView &&
          (leaf.view as AgentChatView).selectedAgentName === agentName &&
          (leaf.view as AgentChatView).selectedConversationId === conversationId
        ) {
          this.plugin.app.workspace.revealLeaf(leaf);
          return;
        }
      }
    }
    this.selectedAgentName = agentName;
    if (conversationId) this.selectedConversationId = conversationId;
    if (this.agentSelect) {
      this.agentSelect.value = agentName;
    }
    this.leaf.updateHeader();
    void this.switchToAgent(agentName, conversationId);
  }

  /** Build the static shell (header, messages area, input). Only runs once. */
  private buildShell(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("af-root");

    const container = root.createDiv({ cls: "af-chat-view-container" });

    // ── Header ──
    this.headerEl = container.createDiv({ cls: "af-chat-view-header" });

    // Collapse toggle — Obsidian's native `clickable-icon` button (no resting
    // background, native hover) carrying a 1:1 reproduction of Obsidian's
    // sidebar-toggle icon. The inner bar animates between Obsidian's two states
    // (thin when collapsed, wide pill when open) via the `.is-collapsed` class.
    this.collapseBtn = this.headerEl.createEl("button", {
      cls: "clickable-icon af-chat-convo-collapse-btn",
      attr: { title: "Toggle conversations panel", "aria-label": "Toggle conversations panel" },
    });
    buildConvoToggleIcon(this.collapseBtn);
    this.collapseBtn.toggleClass("is-collapsed", this.convoPanelCollapsed);
    this.collapseBtn.onclick = () => this.toggleConvoPanel();

    this.agentSelect = this.headerEl.createEl("select", {
      cls: "af-chat-view-agent-select",
    }) as HTMLSelectElement;

    const newChatBtn = this.headerEl.createEl("button", { cls: "af-btn-sm af-chat-view-new-btn" });
    createIcon(newChatBtn, "plus", "af-btn-icon");
    newChatBtn.appendText(" New Chat");
    newChatBtn.onclick = () => void this.handleNewChat();

    // ── Body: conversation panel + main column ──
    // Body is a horizontal flex container so the left rail (conversations)
    // and the right column (messages + input) share the vertical space
    // below the header. Each section sets its own overflow so internal
    // scrolling is isolated.
    const body = container.createDiv({ cls: "af-chat-view-body" });

    // Left rail — see renderConvoPanel() for content. Built once here and
    // re-populated on agent switch + conversation list changes.
    this.convoPanelEl = body.createDiv({ cls: "af-chat-convo-panel" });
    if (this.convoPanelCollapsed) {
      this.convoPanelEl.addClass("collapsed");
    }

    // Right side — wraps messages + input so they live below the same
    // header but next to (not below) the rail.
    const main = body.createDiv({ cls: "af-chat-main" });

    this.agentSelect.onchange = () => {
      const val = this.agentSelect.value;
      if (!val) return;
      // Switching agents drops the current conversation id \u2014 switchToAgent
      // will resolve to either the agent's most-recent existing conversation
      // or auto-create one. Dedup against other tabs happens after the id is
      // resolved (in switchToAgent), so we don't pre-check here.
      this.selectedConversationId = "";
      this.textarea.disabled = false;
      this.textarea.placeholder = "Message the agent\u2026 (Ctrl+Enter to send)";
      void this.switchToAgent(val);
    };

    // ── Messages ──
    this.messagesEl = main.createDiv({ cls: "af-chat-messages" });
    this.messagesInner = this.messagesEl.createDiv({ cls: "af-chat-messages-inner" });

    // ── Input area ──
    const inputArea = main.createDiv({ cls: "af-chat-input-area" });

    // Attachment pills (hidden when empty)
    this.pillsRow = inputArea.createDiv({ cls: "af-chat-pills-row" });
    this.pillsRow.style.display = "none";

    const inputRow = inputArea.createDiv({ cls: "af-chat-input-row" });

    // Attach / Stop button (swaps between + and ■)
    this.attachStopBtn = inputRow.createEl("button", { cls: "af-chat-attach-btn" });
    createIcon(this.attachStopBtn, "plus", "af-btn-icon");
    this.attachStopBtn.title = "Attach active document";
    this.attachStopBtn.onclick = () => {
      if (this.isInStopMode) {
        this.handleStop();
      } else {
        this.attachActiveDocument();
      }
    };

    this.textarea = inputRow.createEl("textarea", {
      cls: "af-chat-input",
      attr: { placeholder: "Message the agent\u2026 (Ctrl+Enter to send)", rows: "1" },
    }) as HTMLTextAreaElement;
    this.sendBtn = inputRow.createEl("button", { cls: "af-chat-send-btn" }) as HTMLButtonElement;
    createIcon(this.sendBtn, "arrow-up", "af-btn-icon");

    // Auto-grow textarea
    this.sendBtn.style.display = "none";
    const autoResize = () => {
      this.textarea.style.height = "auto";
      const height = Math.min(this.textarea.scrollHeight, 160);
      this.textarea.style.height = `${height}px`;
      this.textarea.style.overflowY = this.textarea.scrollHeight > 160 ? "auto" : "hidden";
      this.sendBtn.style.display = this.textarea.value.trim() ? "flex" : "none";
    };
    this.textarea.addEventListener("input", autoResize);
    this.textarea.addEventListener("focus", () => {
      const managed = this.getCurrentSession();
      if (managed) this.setStatsSource(managed.session);
    });

    this.sendBtn.onclick = () => void this.handleSend();
    this.textarea.onkeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.handleSend();
      }
    };

    // Image paste support
    this.textarea.addEventListener("paste", (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) void this.attachImageBlob(file);
          return;
        }
      }
    });

    // Image drag & drop support
    inputArea.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      inputArea.addClass("af-chat-input-dragover");
    });
    inputArea.addEventListener("dragleave", () => {
      inputArea.removeClass("af-chat-input-dragover");
    });
    inputArea.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      inputArea.removeClass("af-chat-input-dragover");
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        if (file.type.startsWith("image/")) {
          void this.attachImageBlob(file);
        }
      }
    });

    // Stats strip lives beneath the input row. Populated on session attach.
    this.statsEl = inputArea.createDiv({ cls: "af-chat-stats" });
    this.renderStats(null);
  }

  /** Re-render is called by the plugin subscription when agents change */
  async render(): Promise<void> {
    this.populateAgentDropdown();
  }

  /** Point the stats strip at a session. Previous subscription is cleaned up. */
  private setStatsSource(session: ChatSession): void {
    if (this.statsSourceSession === session) return;
    this.statsUnsub?.();
    this.statsSourceSession = session;
    this.statsUnsub = session.onStatsChange((s) => this.renderStats(s));
  }

  private renderStats(stats: ChatSessionStats | null): void {
    this.statsEl.empty();
    if (!stats || !stats.concreteModel) {
      // Pre-first-turn placeholder. Keeps the strip height stable so the
      // composer doesn't shift when the first result event arrives.
      this.statsEl.createSpan({ cls: "af-chat-stats-muted", text: "\u00A0" });
      return;
    }

    // Terminal-style line: model name on the left, progress bar + percent
    // on the right. No "MODEL" or "CONTEXT" labels — the model string is
    // self-identifying and a bar reads faster than a percent with a label.
    const line = this.statsEl.createSpan({ cls: "af-chat-stats-line" });
    line.createSpan({ cls: "af-chat-stats-model", text: stats.concreteModel });

    if (stats.contextWindow && stats.contextTokensUsed) {
      const pct = Math.min(100, Math.round((stats.contextTokensUsed / stats.contextWindow) * 100));
      const segments = 10;
      const filled = Math.min(segments, Math.max(0, Math.round((pct / 100) * segments)));
      // Dark-shade block for filled, light-shade block for empty — gives a
      // subtle terminal-ish texture that works in both dark and light themes.
      const bar = "\u2593".repeat(filled) + "\u2591".repeat(segments - filled);

      const ctx = line.createSpan({
        cls: `af-chat-stats-ctx${pct >= 80 ? " warn" : ""}`,
      });
      ctx.createSpan({ cls: "af-chat-stats-bar", text: bar });
      ctx.createSpan({ cls: "af-chat-stats-pct", text: `${pct}%` });

      ctx.title =
        `Context: ${formatTokens(stats.contextTokensUsed)} / ${formatTokens(stats.contextWindow)} tokens (${pct}%)\n\n` +
        "Includes the agent's system prompt, attached skills, tool schemas, memory, and prior turns. " +
        "A fresh chat starts non-zero because all of that is loaded on turn 1.\n\n" +
        "To get 1M context on Opus, set the agent's model to claude-opus-4-7[1m] (or us.anthropic.claude-opus-4-7[1m] on Bedrock).";
    }

    // Transient "just compacted" notice — session sets `stats.lastCompact`
    // when /compact finishes and clears it on the next user turn, so this
    // self-hides once the user resumes the conversation.
    if (stats.lastCompact) {
      const { preTokens, postTokens } = stats.lastCompact;
      const notice = line.createSpan({ cls: "af-chat-stats-compact" });
      notice.setText(`compacted ${formatTokens(preTokens)} \u2192 ${formatTokens(postTokens)}`);
      notice.title = `Conversation was summarized to free up context. ${formatTokens(preTokens)} tokens reduced to ${formatTokens(postTokens)}.`;
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Agent dropdown
  // ═══════════════════════════════════════════════════════

  private populateAgentDropdown(): void {
    const agents = this.plugin.runtime.getSnapshot().agents;
    const previousValue = this.agentSelect.value;

    this.agentSelect.empty();

    if (agents.length === 0) {
      const opt = this.agentSelect.createEl("option", {
        text: "No agents available",
        attr: { value: "", disabled: "true" },
      });
      opt.selected = true;
      this.textarea.disabled = true;
      this.showEmptyState();
      return;
    }

    // Placeholder option — shown when no agent is selected yet
    if (!this.selectedAgentName) {
      const placeholder = this.agentSelect.createEl("option", {
        text: "Select agent…",
        attr: { value: "", disabled: "true" },
      });
      placeholder.selected = true;
    }

    for (const agent of agents) {
      const avatar = agent.avatar?.trim();
      const prefix = avatar && !/^[a-z][a-z0-9-]*$/.test(avatar) ? `${avatar} ` : "";
      this.agentSelect.createEl("option", {
        text: `${prefix}${agent.name}`,
        attr: { value: agent.name },
      });
    }

    // Restore selection only if an agent was explicitly chosen
    if (this.selectedAgentName && agents.some((a) => a.name === this.selectedAgentName)) {
      this.agentSelect.value = this.selectedAgentName;
      this.textarea.disabled = false;
    } else if (previousValue && agents.some((a) => a.name === previousValue)) {
      this.agentSelect.value = previousValue;
      this.selectedAgentName = previousValue;
      this.textarea.disabled = false;
    } else {
      // No agent selected — disable input, show empty state
      this.selectedAgentName = null;
      this.leaf.updateHeader();
      this.textarea.disabled = true;
      this.textarea.placeholder = "Select an agent to start chatting…";
      this.showEmptyState();
      return;
    }

    this.leaf.updateHeader();
    this.textarea.placeholder = "Message the agent\u2026 (Ctrl+Enter to send)";

    // Load the session if not already displayed. Check for actual chat bubbles
    // (not just the empty state divs) to decide whether switchToAgent is needed.
    // Pass the currently-selected conversation id so the safety net doesn't
    // resolve to "most recent" and clobber a freshly-created conversation
    // that happens to be empty.
    const hasMessages = this.messagesInner.querySelector(".af-chat-bubble") !== null;
    if (this.selectedAgentName && !hasMessages) {
      void this.switchToAgent(this.selectedAgentName, this.selectedConversationId || undefined);
    }
  }

  private showEmptyState(): void {
    this.messagesInner.empty();
    const empty = this.messagesInner.createDiv({ cls: "af-chat-view-empty" });
    const iconEl = empty.createDiv({ cls: "af-chat-view-empty-icon" });
    const agents = this.plugin.runtime.getSnapshot().agents;
    if (agents.length === 0) {
      setIcon(iconEl, "bot");
      empty.createDiv({ cls: "af-chat-view-empty-text", text: "No agents available" });
      empty.createDiv({ cls: "af-chat-view-empty-hint", text: "Create an agent to start chatting" });
    } else {
      setIcon(iconEl, "message-circle");
      empty.createDiv({ cls: "af-chat-view-empty-text", text: "Select an agent to start" });
      empty.createDiv({ cls: "af-chat-view-empty-hint", text: "Choose an agent from the dropdown above" });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Session management
  // ═══════════════════════════════════════════════════════

  private async switchToAgent(
    agentName: string,
    conversationId?: string,
  ): Promise<void> {
    const agents = this.plugin.runtime.getSnapshot().agents;
    const agent = agents.find((a) => a.name === agentName);
    if (!agent) return;

    // Resolve the conversation id before we set any view state. Three cases:
    //   1. Caller passed a real id we know about → use it.
    //   2. Caller passed nothing or an id we don't know (e.g. an orphaned
    //      "default" sentinel from a pre-feature tab state) → use the
    //      most-recent existing conversation.
    //   3. Nothing exists yet for this agent → auto-create one. Picker row
    //      shows from the very first frame with a real file on disk.
    await this.loadConversations(agent);
    let resolvedId: string;
    if (conversationId && this.conversationsCache.some((c) => c.id === conversationId)) {
      resolvedId = conversationId;
    } else if (this.conversationsCache.length > 0) {
      resolvedId = this.conversationsCache[0]!.id;
    } else {
      resolvedId = newConversationId();
      try {
        await this.plugin.repository.createConversation(agent, resolvedId, defaultConversationName());
      } catch (err) {
        new Notice(`Couldn't create conversation: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      await this.loadConversations(agent);
    }

    // Re-check the reveal-dedup with the resolved id now that we know it.
    // (selectAgent does this for explicitly-provided ids, but for resolved
    // ones we have to do it here.)
    if (!conversationId || conversationId !== resolvedId) {
      const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
      for (const leaf of leaves) {
        if (
          leaf.view !== this &&
          leaf.view instanceof AgentChatView &&
          (leaf.view as AgentChatView).selectedAgentName === agentName &&
          (leaf.view as AgentChatView).selectedConversationId === resolvedId
        ) {
          this.plugin.app.workspace.revealLeaf(leaf);
          return;
        }
      }
    }

    this.selectedAgentName = agentName;
    this.selectedConversationId = resolvedId;
    this.leaf.updateHeader();

    // Clear UI completely
    this.activityEl = null;
    this.streamingDot = null;
    this.messagesInner.empty();
    // Per-agent UI state — all threads collapse on switch.
    this.threadExpanded.clear();

    this.renderConvoPanel();

    // Get or create session, keyed by (agent, conversation) so parallel
    // chats with the same agent each get their own ChatSession instance.
    const key = sessionKey(agentName, resolvedId);
    let managed = this.sessions.get(key);
    if (!managed) {
      const session = new ChatSession(
        agent,
        this.plugin.settings,
        this.plugin.repository,
        this.app.vault,
        { inAppConversationId: resolvedId, mcpAuth: this.plugin.mcpAuth },
      );
      managed = { session };
      this.sessions.set(key, managed);
      await session.loadPersistedState();
    }

    // Swap the stats subscription to the newly-selected session.
    this.setStatsSource(managed.session);

    // Render history FIRST so the indicators (which append to messagesInner)
    // land visually at the bottom of the chat, where the in-progress reply
    // would be. Previously we subscribed first — the immediate-fire listener
    // placed indicators into an empty container, which then got buried
    // under the bubbles as the history loaded below them.
    for (const msg of managed.session.messages) {
      if (msg.role === "user") {
        this.addBubble("user", msg.content, msg.attachments);
      } else {
        const bubble = this.addBubble("assistant");
        this.renderMarkdownBubble(bubble, msg.content);
        (bubble as HTMLElement & { _setRawText?: (t: string) => void })._setRawText?.(msg.content);
        // Attach thread affordance first so the affordances row exists;
        // tool summary (if any) joins it on the same row.
        this.attachThreadAffordance(bubble, msg.id, managed.session);
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const row = this.getOrCreateAffordancesRow(bubble);
          this.buildToolSummary(msg.toolCalls, row);
        }
      }
    }

    // NOW subscribe to the activity emitter. The immediate-fire render will
    // append any indicators after the history we just laid out.
    this.activityUnsub?.();
    const current = managed.session;
    this.activityUnsub = current.onActivityChange(() => {
      // Defensive: only render if the subscribed session is still the one
      // being viewed. Handles the edge case where an activity event fires
      // during a rapid agent switch.
      if (this.getCurrentSession()?.session === current) {
        this.renderIndicators(current);
      }
    });

    this.textarea.disabled = false;
    this.textarea.focus();
  }

  private getCurrentSession(): ManagedSession | undefined {
    if (!this.selectedAgentName) return undefined;
    return this.sessions.get(sessionKey(this.selectedAgentName, this.selectedConversationId));
  }

  // ═══════════════════════════════════════════════════════
  //  Conversation picker
  // ═══════════════════════════════════════════════════════

  /** Re-read the agent's conversation list from disk and re-render the
   *  picker dropdown. Called on agent switch, after create/rename/delete,
   *  and after the first user turn in a brand-new conversation (so a
   *  freshly-created "New chat …" gets bumped to the top once active). */
  /** Refresh the in-memory cache without touching the DOM. Used by
   *  switchToAgent which renders the panel itself after resolving an id. */
  private async loadConversations(agent: AgentConfig): Promise<void> {
    this.conversationsCache = await this.plugin.repository.listConversations(agent);
  }

  /** Load the conversation list AND re-render the rail. Used after any
   *  picker mutation (create, rename, delete) when the resolved id is
   *  already known. */
  private async refreshConversationsList(agent: AgentConfig): Promise<void> {
    await this.loadConversations(agent);
    this.renderConvoPanel();
    this.leaf.updateHeader();
  }

  /** Render the conversations rail. Cheap to call — rebuilds DOM each time,
   *  but the panel typically holds a handful of rows. Called after every
   *  list mutation (switch, create, rename, delete) so the row count, badges
   *  and active row stay accurate. */
  private renderConvoPanel(): void {
    if (!this.convoPanelEl) return;
    this.convoPanelEl.empty();
    if (!this.selectedAgentName) {
      // Without an agent there's nothing to list. The rail still occupies
      // its column so the layout doesn't shift when an agent is picked.
      return;
    }

    // Section header — title-case, sized to match the rest of the panel type.
    this.convoPanelEl.createDiv({
      cls: "af-chat-convo-header",
      text: "Conversations",
    });

    // "+ New chat" row — styled like an `.af-sidebar-action-item` so it
    // belongs with the section, not floating outside the list.
    const newRow = this.convoPanelEl.createDiv({ cls: "af-chat-convo-new" });
    const newIcon = newRow.createSpan({ cls: "af-chat-convo-new-icon" });
    setIcon(newIcon, "plus");
    newRow.createSpan({ cls: "af-chat-convo-new-label", text: "New chat" });
    newRow.onclick = () => void this.handleNewChat();

    const list = this.convoPanelEl.createDiv({ cls: "af-chat-convo-list" });
    for (const c of this.conversationsCache) {
      this.renderConvoRow(list, c);
    }
  }

  private renderConvoRow(list: HTMLElement, meta: ConversationMeta): void {
    const isActive = meta.id === this.selectedConversationId;
    const row = list.createDiv({
      cls: `af-chat-convo-item${isActive ? " active" : ""}`,
    });

    const nameEl = row.createDiv({ cls: "af-chat-convo-name", text: meta.name });
    // Tooltip surfaces full name when truncated — same affordance Obsidian
    // uses on its sidebar items.
    nameEl.title = meta.name;
    nameEl.ondblclick = (e) => {
      e.stopPropagation();
      this.beginInlineRename(nameEl, meta);
    };

    const meta_line = row.createDiv({ cls: "af-chat-convo-meta" });
    const msgPart = meta.messageCount === 1 ? "1 msg" : `${meta.messageCount} msgs`;
    meta_line.appendText(`${msgPart} · ${formatRelativeTime(meta.lastActive)}`);

    // Trash button — hidden by default, fades in on row hover via CSS.
    // If the user deletes their last conversation, switchToAgent's
    // resolve-or-create logic auto-creates a fresh one so the panel never
    // lands in an empty state.
    const trashBtn = row.createEl("button", {
      cls: "af-chat-convo-trash",
      attr: { title: "Delete conversation", "aria-label": "Delete conversation" },
    });
    setIcon(trashBtn, "trash-2");
    trashBtn.onclick = (e) => {
      e.stopPropagation();
      void this.handleDeleteConversation(meta);
    };

    row.onclick = () => {
      if (meta.id === this.selectedConversationId) return;
      void this.handleConvoSelected(meta.id);
    };
  }

  /** Swap the name span for an `<input>` pre-filled and selected. Enter or
   *  blur saves; Esc reverts. Mirrors the inline-rename pattern users know
   *  from Finder/VS Code/Obsidian's own file explorer. */
  private beginInlineRename(nameEl: HTMLElement, meta: ConversationMeta): void {
    const originalName = meta.name;
    const input = document.createElement("input");
    input.type = "text";
    input.value = originalName;
    input.className = "af-chat-convo-name-input";
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const cleanup = (newName: string | null): HTMLElement => {
      // Replace the input with a fresh name span — using `replaceWith` here
      // would lose our reference; create + swap.
      const fresh = document.createElement("div");
      fresh.className = "af-chat-convo-name";
      fresh.textContent = newName ?? originalName;
      fresh.title = newName ?? originalName;
      // Re-bind dblclick on the new span (it'll be replaced again on the
      // next renderConvoPanel anyway, but keeps things consistent until then).
      fresh.ondblclick = (e) => {
        e.stopPropagation();
        // Look up the meta freshly in case the cache changed during rename.
        const latest = this.conversationsCache.find((c) => c.id === meta.id) ?? meta;
        this.beginInlineRename(fresh, latest);
      };
      input.replaceWith(fresh);
      return fresh;
    };

    const commit = async (): Promise<void> => {
      if (committed) return;
      committed = true;
      const next = input.value.trim();
      if (!next || next === originalName) {
        cleanup(null);
        return;
      }
      try {
        await this.saveConversationName(meta.id, next);
      } catch (err) {
        new Notice(`Couldn't rename: ${err instanceof Error ? err.message : String(err)}`);
        cleanup(null);
        return;
      }
      // Re-rendering the whole panel is cleaner than patching this row in
      // place — the meta line ("12 msgs · 2h ago") might also need to move
      // since lastActive can update concurrently.
      this.renderConvoPanel();
      this.leaf.updateHeader();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        committed = true; // suppress the blur-fired commit that would follow
        cleanup(null);
      }
    });
    input.addEventListener("blur", () => {
      void commit();
    });
  }

  /** Write the new name to disk and to the live session (if loaded). The
   *  live-session call ensures the file exists even for a brand-new "Main
   *  chat" that hasn't been persisted yet — ChatSession.persist() creates
   *  the file when missing, which the repository helper can't do. */
  private async saveConversationName(conversationId: string, name: string): Promise<void> {
    if (!this.selectedAgentName) return;
    const agents = this.plugin.runtime.getSnapshot().agents;
    const agent = agents.find((a) => a.name === this.selectedAgentName);
    if (!agent) return;
    try {
      await this.plugin.repository.renameConversation(agent, conversationId, name);
    } catch {
      // If the file doesn't exist on disk yet (fresh conversation, no
      // messages persisted), the repository helper silently no-ops. We
      // fall through to the ChatSession path below which can create the
      // file via persist().
    }
    // Push into the live session if this row is the one currently loaded,
    // so the next persist() doesn't write the stale in-memory name back.
    const key = sessionKey(this.selectedAgentName, conversationId);
    const managed = this.sessions.get(key);
    if (managed) {
      await managed.session.setConversationName(name);
    }
    // Reflect in the cache immediately for any further panel renders that
    // happen before the next disk re-scan.
    const idx = this.conversationsCache.findIndex((c) => c.id === conversationId);
    if (idx >= 0) this.conversationsCache[idx] = { ...this.conversationsCache[idx]!, name };
  }

  private async handleConvoSelected(id: string): Promise<void> {
    if (!this.selectedAgentName) return;

    // Reveal-instead-of-duplicate: another open tab might already be on this
    // exact (agent, conversation). Two tabs racing the same chat.json/
    // sessionId is exactly the collision we're trying to avoid.
    const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
    for (const leaf of leaves) {
      if (
        leaf.view !== this &&
        leaf.view instanceof AgentChatView &&
        (leaf.view as AgentChatView).selectedAgentName === this.selectedAgentName &&
        (leaf.view as AgentChatView).selectedConversationId === id
      ) {
        this.plugin.app.workspace.revealLeaf(leaf);
        return;
      }
    }
    await this.switchToAgent(this.selectedAgentName, id);
  }

  /** Delete handler — invoked from the per-row trash button. Confirms via
   *  the native `window.confirm` (which works in Electron, unlike prompt).
   *  If the deleted conversation was the active one and was also the only
   *  one, switchToAgent's resolve-or-create logic spins up a fresh one. */
  private async handleDeleteConversation(meta: ConversationMeta): Promise<void> {
    if (!this.selectedAgentName) return;
    const agents = this.plugin.runtime.getSnapshot().agents;
    const agent = agents.find((a) => a.name === this.selectedAgentName);
    if (!agent) return;
    const ok = window.confirm(
      `Delete conversation "${meta.name}"?\n\nThis removes its message history. The agent and its other conversations are untouched.`,
    );
    if (!ok) return;

    const key = sessionKey(this.selectedAgentName, meta.id);
    // dispose() (not abort()) so any open thread sub-sessions also get
    // their subprocesses killed. abort() would only stop the parent —
    // see ChatSession.dispose for the distinction.
    this.sessions.get(key)?.session.dispose();
    this.sessions.delete(key);
    try {
      await this.plugin.repository.deleteConversation(agent, meta.id);
    } catch (err) {
      new Notice(`Couldn't delete: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await this.refreshConversationsList(agent);
    // If we just deleted the active conversation, drop into the most-
    // recent remaining one — or let switchToAgent auto-create a fresh
    // conversation if the list is now empty (passing undefined triggers
    // the resolve-or-create path).
    if (meta.id === this.selectedConversationId) {
      const fallback = this.conversationsCache[0]?.id;
      await this.switchToAgent(this.selectedAgentName, fallback);
    }
  }

  /** Toggle the collapsed state of the rail. Stamps `userToggledCollapse`
   *  so the responsive auto-collapse doesn't immediately undo the choice. */
  private toggleConvoPanel(): void {
    this.convoPanelCollapsed = !this.convoPanelCollapsed;
    this.userToggledCollapse = true;
    this.applyCollapsedClass();
    this.leaf.updateHeader();
  }

  private applyCollapsedClass(): void {
    if (this.convoPanelEl) {
      if (this.convoPanelCollapsed) this.convoPanelEl.addClass("collapsed");
      else this.convoPanelEl.removeClass("collapsed");
    }
    if (this.collapseBtn) {
      // Toggle the class only — the inner bar's width transition animates the
      // open↔collapsed change, matching Obsidian's native toggle.
      this.collapseBtn.toggleClass("is-collapsed", this.convoPanelCollapsed);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Chat helpers (extracted from dashboardView)
  // ═══════════════════════════════════════════════════════

  private renderMarkdownBubble(el: HTMLElement, text: string): void {
    const copyBtn = el.querySelector(".af-chat-copy-btn");
    const detachedBtn = copyBtn?.parentNode?.removeChild(copyBtn) ?? null;
    el.empty();
    el.addClass("af-compact-md");
    void MarkdownRenderer.render(this.app, text, el, "", this.plugin).then(() => {
      if (detachedBtn) el.appendChild(detachedBtn);

      // Wire clicks on wikilinks + external links. MarkdownRenderer produces
      // the DOM structure (`.internal-link` with `data-href`, plain `<a>` for
      // external URLs) but in custom views clicks aren't delegated, so the
      // anchors are visually rendered but dead. Attach a single delegated
      // handler here so any link the agent emits in chat actually works.
      this.wireBubbleLinks(el);

      // Replace Obsidian's native code copy buttons with our own
      el.querySelectorAll("pre").forEach((pre) => {
        // Remove Obsidian's native button
        pre.querySelector(".copy-code-button")?.remove();

        // Add our own
        const code = pre.querySelector("code");
        if (!code) return;
        const btn = document.createElement("button");
        btn.className = "af-code-copy-btn";
        btn.setAttribute("aria-label", "Copy code");
        setIcon(btn, "copy");
        btn.onclick = (e) => {
          e.stopPropagation();
          void navigator.clipboard.writeText(code.textContent ?? "").then(() => {
            btn.addClass("copied");
            setIcon(btn, "check");
            setTimeout(() => {
              btn.removeClass("copied");
              setIcon(btn, "copy");
            }, 1500);
          });
        };
        pre.style.position = "relative";
        pre.appendChild(btn);
      });
    });
  }

  /**
   * Delegate click handling for any <a> in a rendered chat bubble:
   *   - Internal links (`[[note]]`) → open in a new tab in the main window.
   *   - External links (http/https) → open in the system browser.
   *   - `obsidian://` URIs → routed through the native workspace handler.
   *
   * MarkdownRenderer produces the visual DOM for us, but when rendering into
   * a custom view Obsidian's workspace delegation doesn't fire on anchor
   * clicks — so without this wiring, links look clickable but do nothing.
   * The handler is attached once per bubble; modifier keys (Cmd/Ctrl/middle
   * click) keep their conventional meaning.
   */
  private wireBubbleLinks(el: HTMLElement): void {
    el.addEventListener("click", (ev: MouseEvent) => {
      const anchor = (ev.target as HTMLElement).closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      // Obsidian internal link
      if (anchor.classList.contains("internal-link")) {
        ev.preventDefault();
        ev.stopPropagation();
        const linktext =
          anchor.getAttribute("data-href") ||
          anchor.getAttribute("href") ||
          anchor.textContent ||
          "";
        if (!linktext) return;
        // Ctrl/Cmd/middle click retains its usual semantics (new tab anyway
        // in our default). Shift-click → split pane as Obsidian users expect.
        const paneType: "tab" | "split" = ev.shiftKey ? "split" : "tab";
        void this.app.workspace.openLinkText(linktext, "", paneType);
        return;
      }

      // obsidian:// deeplink — route via the Obsidian handler
      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("obsidian://")) {
        ev.preventDefault();
        ev.stopPropagation();
        // Obsidian listens for its own scheme; setting window.location is
        // the standard way to hand off.
        window.location.href = href;
        return;
      }

      // External link — hand off to the system browser so Obsidian doesn't
      // try to navigate within its own window.
      if (anchor.classList.contains("external-link") || /^https?:\/\//.test(href)) {
        ev.preventDefault();
        ev.stopPropagation();
        window.open(href, "_blank");
        return;
      }
    });
  }

  private addCopyBtn(bubble: HTMLElement, getText: () => string): void {
    const btn = bubble.createEl("button", { cls: "af-chat-copy-btn", attr: { "aria-label": "Copy message" } });
    setIcon(btn, "copy");
    btn.onclick = (e) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(getText()).then(() => {
        btn.addClass("copied");
        setIcon(btn, "check");
        setTimeout(() => {
          btn.removeClass("copied");
          setIcon(btn, "copy");
        }, 1500);
      });
    };
  }

  private addBubble(role: "user" | "assistant" | "error", text?: string, attachments?: string[]): HTMLElement {
    // If user bubble has attachments, render pills above the text
    if (role === "user" && attachments && attachments.length > 0) {
      const attachRow = this.messagesInner.createDiv({ cls: "af-chat-bubble-attachments" });
      for (const name of attachments) {
        const pill = attachRow.createSpan({ cls: "af-chat-pill af-chat-pill-inline" });
        const iconEl = pill.createSpan({ cls: "af-chat-pill-icon" });
        const isImage = /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
        setIcon(iconEl, isImage ? "image" : "file-text");
        pill.createSpan({ cls: "af-chat-pill-name", text: name });
      }
    }

    const bubble = this.messagesInner.createDiv({ cls: `af-chat-bubble af-chat-bubble-${role}` });
    if (text) {
      if (role === "assistant") {
        this.renderMarkdownBubble(bubble, text);
      } else {
        bubble.setText(text);
      }
    }
    if (role === "assistant") {
      let rawText = text ?? "";
      this.addCopyBtn(bubble, () => rawText);
      (bubble as unknown as { _setRawText: (t: string) => void })._setRawText = (t: string) => { rawText = t; };
    }
    // Auto-scroll to bottom
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return bubble;
  }

  // ─── Threading UI ────────────────────────────────────────

  /** Ensure an affordances row exists for the given assistant bubble, and
   *  return it. The row is a horizontal flex sibling of the bubble that
   *  holds the thread badge and (optionally) the tool-calls button
   *  side-by-side. Called by both the thread-affordance attach and the
   *  tool-summary builder so they share one container. */
  private getOrCreateAffordancesRow(bubble: HTMLElement): HTMLElement {
    const parent = bubble.parentElement;
    if (!parent) throw new Error("bubble has no parent");
    const next = bubble.nextElementSibling;
    if (next && next.classList.contains("af-chat-affordances")) {
      return next as HTMLElement;
    }
    const row = document.createElement("div");
    row.className = "af-chat-affordances";
    parent.insertBefore(row, bubble.nextSibling);
    return row;
  }

  /** Attach the thread badge + hidden thread container to the affordances
   *  row next to an assistant bubble. Badge is a `<div role="button">`
   *  rather than a `<button>` so Obsidian's global button styles
   *  (`--interactive-normal` bg, etc.) don't bleed through and make it look
   *  different from the tool-calls summary. */
  private attachThreadAffordance(
    bubble: HTMLElement,
    anchorId: string,
    parentSession: ChatSession,
  ): void {
    const parent = bubble.parentElement;
    if (!parent) return;
    const row = this.getOrCreateAffordancesRow(bubble);
    // Avoid double-attaching.
    if (row.querySelector(".af-thread-badge")) return;

    const badge = document.createElement("div");
    badge.className = "af-thread-badge";
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    row.appendChild(badge);
    setIcon(badge, "message-circle");
    const label = badge.createSpan({ cls: "af-thread-badge-label" });

    // Thread UI container goes AFTER the affordances row so it opens below
    // both the thread badge and the tool-calls button.
    const container = document.createElement("div");
    container.className = "af-thread-container";
    container.style.display = "none";
    parent.insertBefore(container, row.nextSibling);

    const updateBadgeLabel = () => {
      const idx = parentSession.getThreadIndex();
      const entry = idx[anchorId];
      // Show raw message count — matches Slack idiom ("N replies" = N total
      // messages in the thread, counting both sides).
      const count = entry?.messageCount ?? 0;
      if (count <= 0) label.setText("Thread");
      else label.setText(`${count} ${count === 1 ? "reply" : "replies"}`);
      if (count > 0) badge.addClass("has-replies");
    };
    updateBadgeLabel();

    let rendered = false;
    const toggle = async () => {
      const expanded = this.threadExpanded.get(anchorId) === true;
      if (expanded) {
        // Collapse
        container.style.display = "none";
        this.threadExpanded.set(anchorId, false);
        badge.removeClass("expanded");
        // Return stats to parent when collapsing.
        this.setStatsSource(parentSession);
        return;
      }
      // Expand — open thread, render on first expand
      this.threadExpanded.set(anchorId, true);
      container.style.display = "";
      badge.addClass("expanded");
      if (!rendered) {
        try {
          const thread = await parentSession.openOrCreateThread(anchorId);
          this.renderThreadContainer(container, thread, parentSession, updateBadgeLabel);
          rendered = true;
        } catch (err) {
          container.setText(`Failed to open thread: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    badge.onclick = () => void toggle();
    badge.onkeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void toggle();
      }
    };
  }

  private renderThreadContainer(
    container: HTMLElement,
    thread: ChatSession,
    parentSession: ChatSession,
    onThreadChange: () => void,
  ): void {
    container.empty();
    const wrap = container.createDiv({ cls: "af-thread-wrap" });

    const messages = wrap.createDiv({ cls: "af-thread-messages" });
    // Thread-scoped activity (tool-use) + streaming-dot indicators — mirror
    // the main chat's live-feedback UX so threaded conversations feel
    // identical, not second-class.
    let activityEl: HTMLElement | null = null;
    let streamingDot: HTMLElement | null = null;
    const setThreadActivity = (toolName?: string) => {
      if (toolName) {
        if (!activityEl) activityEl = messages.createDiv({ cls: "af-chat-activity" });
        activityEl.setText(`Working\u2026 (${toolName})`);
      } else if (activityEl) {
        activityEl.remove();
        activityEl = null;
      }
    };
    const setThreadStreaming = (active: boolean) => {
      if (active && !streamingDot) {
        streamingDot = messages.createDiv({ cls: "af-chat-streaming-dot" });
        for (let i = 0; i < 3; i++) streamingDot.createSpan();
      } else if (!active && streamingDot) {
        streamingDot.remove();
        streamingDot = null;
      }
    };

    const appendBubble = (
      role: "user" | "assistant",
      text: string,
      attachments?: string[],
    ): HTMLElement => {
      if (role === "user" && attachments && attachments.length > 0) {
        const attachRow = messages.createDiv({ cls: "af-chat-bubble-attachments" });
        for (const name of attachments) {
          const pill = attachRow.createSpan({ cls: "af-chat-pill af-chat-pill-inline" });
          const iconEl = pill.createSpan({ cls: "af-chat-pill-icon" });
          setIcon(iconEl, name.match(/\.(png|jpe?g|gif|webp|svg)$/i) ? "image" : "file-text");
          pill.createSpan({ cls: "af-chat-pill-name", text: name });
        }
      }
      const bubble = messages.createDiv({ cls: `af-thread-bubble af-thread-bubble-${role}` });
      if (role === "assistant") this.renderMarkdownBubble(bubble, text);
      else bubble.setText(text);
      return bubble;
    };

    // Initial render from history.
    for (const msg of thread.messages) appendBubble(msg.role, msg.content, msg.attachments);

    // ── Attachments: per-thread local state so multiple open threads don't
    // clobber each other. Mirrors main chat's files + images + pills layout.
    const threadFiles: TFile[] = [];
    const threadImages: Array<{ name: string; path: string }> = [];
    const composerWrap = wrap.createDiv({ cls: "af-thread-composer-wrap" });
    const pillsRow = composerWrap.createDiv({ cls: "af-chat-pills-row af-thread-pills-row" });
    pillsRow.style.display = "none";

    const renderThreadPills = () => {
      pillsRow.empty();
      if (threadFiles.length === 0 && threadImages.length === 0) {
        pillsRow.style.display = "none";
        return;
      }
      pillsRow.style.display = "flex";
      for (const file of threadFiles) {
        const pill = pillsRow.createDiv({ cls: "af-chat-pill" });
        const iconEl = pill.createSpan({ cls: "af-chat-pill-icon" });
        setIcon(iconEl, "file-text");
        pill.createSpan({ cls: "af-chat-pill-name", text: file.name });
        const removeBtn = pill.createSpan({ cls: "af-chat-pill-remove" });
        setIcon(removeBtn, "x");
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          const idx = threadFiles.findIndex((f) => f.path === file.path);
          if (idx >= 0) threadFiles.splice(idx, 1);
          renderThreadPills();
        };
      }
      for (const img of threadImages) {
        const pill = pillsRow.createDiv({ cls: "af-chat-pill" });
        const iconEl = pill.createSpan({ cls: "af-chat-pill-icon" });
        setIcon(iconEl, "image");
        pill.createSpan({ cls: "af-chat-pill-name", text: img.name });
        const removeBtn = pill.createSpan({ cls: "af-chat-pill-remove" });
        setIcon(removeBtn, "x");
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          const idx = threadImages.findIndex((i) => i.path === img.path);
          if (idx >= 0) threadImages.splice(idx, 1);
          renderThreadPills();
        };
      }
    };

    const attachActiveToThread = () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new Notice("No active document to attach");
        return;
      }
      if (threadFiles.some((f) => f.path === activeFile.path)) {
        new Notice(`"${activeFile.name}" is already attached`);
        return;
      }
      const textExts = new Set(["md", "txt", "json", "yaml", "yml", "toml", "csv", "xml", "html", "css", "js", "ts", "py", "sh", "sql", "env", "cfg", "ini", "log"]);
      if (!textExts.has(activeFile.extension.toLowerCase())) {
        new Notice(`Can't attach "${activeFile.name}" — only text files are supported`);
        return;
      }
      threadFiles.push(activeFile);
      renderThreadPills();
    };

    const attachImageToThread = async (file: File) => {
      const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const candidateName = file.name && file.name !== "image" ? file.name : `pasted-${Date.now()}.${ext}`;
      if (threadImages.some((img) => img.name === candidateName)) {
        new Notice(`"${candidateName}" is already attached`);
        return;
      }
      const saved = await this.saveImageBlobToVault(file);
      if (!saved) return;
      threadImages.push(saved);
      renderThreadPills();
    };

    // ── Composer. Mirrors main chat: plus-button, textarea, send-button.
    const composer = composerWrap.createDiv({ cls: "af-chat-input-row af-thread-composer" });

    const attachBtn = composer.createEl("button", { cls: "af-chat-attach-btn" });
    createIcon(attachBtn, "plus", "af-btn-icon");
    attachBtn.title = "Attach active document";
    attachBtn.onclick = (e) => {
      e.preventDefault();
      attachActiveToThread();
    };

    const input = composer.createEl("textarea", {
      cls: "af-chat-input af-thread-input",
      attr: { placeholder: "Message in thread\u2026 (Ctrl+Enter to send)", rows: "1" },
    }) as HTMLTextAreaElement;

    // Paste image support
    input.addEventListener("paste", (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) void attachImageToThread(file);
          return;
        }
      }
    });

    // Drag & drop image support on the whole composer wrap
    composerWrap.addEventListener("dragover", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      composerWrap.addClass("af-chat-input-dragover");
    });
    composerWrap.addEventListener("dragleave", () => {
      composerWrap.removeClass("af-chat-input-dragover");
    });
    composerWrap.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      composerWrap.removeClass("af-chat-input-dragover");
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        if (file.type.startsWith("image/")) {
          void attachImageToThread(file);
        }
      }
    });

    const sendBtn = composer.createEl("button", { cls: "af-chat-send-btn" }) as HTMLButtonElement;
    createIcon(sendBtn, "arrow-up", "af-btn-icon");
    sendBtn.style.display = "none";

    const autoResize = () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
      sendBtn.style.display = input.value.trim() ? "flex" : "none";
    };
    input.addEventListener("input", autoResize);
    input.addEventListener("focus", () => this.setStatsSource(thread));

    const submit = async () => {
      const text = input.value.trim();
      if (!text || thread.isStreaming) return;

      // Build attachment context + names BEFORE clearing state
      const attachmentContext = await this.buildAttachmentContextFor(threadFiles, threadImages);
      const attachedNames = [
        ...threadFiles.map((f) => f.name),
        ...threadImages.map((img) => img.name),
      ];
      const fullText = attachmentContext ? `${attachmentContext}${text}` : undefined;

      input.value = "";
      autoResize();
      threadFiles.length = 0;
      threadImages.length = 0;
      renderThreadPills();

      // Optimistic user bubble — shows instantly, no wait for streaming.
      appendBubble("user", text, attachedNames.length > 0 ? attachedNames : undefined);
      setThreadStreaming(true);

      let assistantBubble: HTMLElement | null = null;
      let accumulated = "";
      try {
        await thread.sendMessage(text, (event) => {
          if (event.type === "text") {
            if (!assistantBubble) {
              // First text chunk — swap dots for an in-progress bubble.
              setThreadStreaming(false);
              setThreadActivity();
              assistantBubble = appendBubble("assistant", "");
              assistantBubble.empty();
            }
            accumulated += event.content;
            let streamText = assistantBubble!.querySelector(".af-chat-stream-text");
            if (!streamText) {
              streamText = assistantBubble!.createDiv({ cls: "af-chat-stream-text" });
            }
            streamText.setText(accumulated);
          } else if (event.type === "tool_use") {
            setThreadActivity(event.toolName);
          } else if (event.type === "result") {
            setThreadActivity();
            setThreadStreaming(false);
            if (assistantBubble) this.renderMarkdownBubble(assistantBubble, stripRememberTags(accumulated));
          }
        }, fullText, attachedNames.length > 0 ? attachedNames : undefined);
        // Turn done — refresh badge counter on the parent. We don't
        // re-render the whole thread; optimistic + streamed DOM already
        // matches what's in thread.messages.
        onThreadChange();
      } catch (err) {
        setThreadStreaming(false);
        setThreadActivity();
        const msg = err instanceof Error ? err.message : String(err);
        messages.createDiv({ cls: "af-thread-error", text: `Error: ${msg}` });
      }
    };

    sendBtn.onclick = () => void submit();
    input.onkeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void submit();
      }
    };

    void parentSession; // retained for future use (delete-thread, etc.)
  }

  private buildToolSummary(tools: ToolCall[], parent?: HTMLElement): HTMLElement {
    const host = parent ?? this.messagesInner;
    const wrapper = host.createDiv({ cls: "af-chat-tool-summary" });
    const details = wrapper.createEl("details");
    const summary = details.createEl("summary");

    const grouped = new Map<string, string[]>();
    for (const t of tools) {
      const existing = grouped.get(t.name) ?? [];
      if (t.command) existing.push(t.command);
      grouped.set(t.name, existing);
    }

    const toolIcon = summary.createSpan({ cls: "af-chat-tool-icon" });
    setIcon(toolIcon, "wrench");
    summary.appendText(` ${tools.length} tool call${tools.length !== 1 ? "s" : ""}`);

    const list = details.createDiv({ cls: "af-chat-tool-list" });
    for (const [name, commands] of grouped) {
      const count = commands.length || (grouped.get(name)?.length ?? 1);
      const line = list.createDiv({ cls: "af-chat-tool-item" });
      const label = count > 1 ? `${name} (\u00d7${count})` : name;
      line.createSpan({ cls: "af-chat-tool-name", text: label });
      if (commands.length === 1 && commands[0]) {
        line.createSpan({ cls: "af-chat-tool-cmd", text: commands[0] });
      }
    }
    return wrapper;
  }

  /**
   * Sync indicator DOM to the given session's current state. Idempotent —
   * safe to call repeatedly; skips writes when the DOM already matches.
   * This is the ONLY function that mutates `activityEl` / `streamingDot` /
   * the attach-stop button mode, so everywhere else we just flip state on
   * the session and let the subscription call this.
   */
  private renderIndicators(session: ChatSession): void {
    const streaming = session.isStreaming;
    const tool = session.currentToolName;
    const hasText = session.hasCurrentTurnText;
    // When the user switched INTO an agent mid-text-reply, the in-progress
    // assistant bubble doesn't exist in this view (handleSend's callback for
    // this session wrote into the previous tab's DOM and is now guarded
    // off). So we need a textual fallback to signal "agent is replying".
    // Detect the live-bubble case by looking for the streaming text
    // container handleSend creates on each chunk.
    const hasLiveBubble = !!this.messagesInner.querySelector(".af-chat-stream-text");

    let activityLabel: string | null = null;
    if (streaming && tool) {
      activityLabel = `Working\u2026 (${tool})`;
    } else if (streaming && hasText && !hasLiveBubble) {
      activityLabel = "Replying\u2026";
    }

    if (activityLabel) {
      if (!this.activityEl) {
        this.activityEl = this.messagesInner.createDiv({ cls: "af-chat-activity" });
      } else if (this.activityEl.parentElement !== this.messagesInner ||
                 this.activityEl.nextElementSibling !== null) {
        // Keep the pill anchored at the bottom of the chat — if something
        // was appended after it (shouldn't happen, but defensive), move it.
        this.messagesInner.appendChild(this.activityEl);
      }
      if (this.activityEl.textContent !== activityLabel) this.activityEl.setText(activityLabel);
    } else if (this.activityEl) {
      this.activityEl.remove();
      this.activityEl = null;
    }

    // Streaming dot — "thinking" indicator shown only when the agent is
    // streaming, has no current tool, AND hasn't produced text yet. Once
    // the bubble starts filling (or the Replying… pill takes over), no dot.
    const showDot = streaming && !tool && !hasText;
    if (showDot) {
      if (!this.streamingDot) {
        this.streamingDot = this.messagesInner.createDiv({ cls: "af-chat-streaming-dot" });
        for (let i = 0; i < 3; i++) this.streamingDot.createSpan();
      } else if (this.streamingDot.parentElement !== this.messagesInner ||
                 this.streamingDot.nextElementSibling !== null) {
        this.messagesInner.appendChild(this.streamingDot);
      }
    } else if (this.streamingDot) {
      this.streamingDot.remove();
      this.streamingDot = null;
    }

    // Stop-mode button mirrors streaming state — if the viewed session is
    // working, the button is always "stop"; otherwise "attach".
    this.setAttachStopMode(streaming);
  }

  private setAttachStopMode(stopMode: boolean): void {
    if (stopMode === this.isInStopMode) return;
    this.isInStopMode = stopMode;
    this.attachStopBtn.empty();
    if (stopMode) {
      createIcon(this.attachStopBtn, "square", "af-btn-icon");
      this.attachStopBtn.title = "Stop generation";
      this.attachStopBtn.addClass("af-chat-stop-mode");
    } else {
      createIcon(this.attachStopBtn, "plus", "af-btn-icon");
      this.attachStopBtn.title = "Attach active document";
      this.attachStopBtn.removeClass("af-chat-stop-mode");
    }
  }

  private handleStop(): void {
    const managed = this.getCurrentSession();
    if (!managed) return;
    // session.abort() flips isStreaming → the subscription re-renders
    // indicators, so we don't clear them manually.
    managed.session.abort();
    this.addBubble("error", "Generation stopped");
  }

  // ═══════════════════════════════════════════════════════
  //  Send / New Chat / Intro
  // ═══════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════
  //  Document Attachments
  // ═══════════════════════════════════════════════════════

  private attachActiveDocument(): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active document to attach");
      return;
    }

    // Check for duplicates
    if (this.attachedFiles.some((f) => f.path === activeFile.path)) {
      new Notice(`"${activeFile.name}" is already attached`);
      return;
    }

    // Only text-based files
    const ext = activeFile.extension.toLowerCase();
    const textExts = new Set(["md", "txt", "json", "yaml", "yml", "toml", "csv", "xml", "html", "css", "js", "ts", "py", "sh", "sql", "env", "cfg", "ini", "log"]);
    if (!textExts.has(ext)) {
      new Notice(`Can't attach "${activeFile.name}" — only text files are supported`);
      return;
    }

    this.attachedFiles.push(activeFile);
    this.renderPills();
  }

  /** Save a pasted/dropped image blob into the vault and return its name
   *  + absolute-path pair. Shared by the main chat and thread composers so
   *  both feed the Claude CLI the same way. Returns null on failure (the
   *  caller shows the toast — it's plumbed where to anchor the error). */
  private async saveImageBlobToVault(
    file: File,
  ): Promise<{ name: string; path: string } | null> {
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const timestamp = Date.now();
    const name = file.name && file.name !== "image" ? file.name : `pasted-${timestamp}.${ext}`;

    const dir = `${this.plugin.settings.fleetFolder}/chat-images`;
    const vaultPath = `${dir}/${timestamp}-${name}`;

    try {
      if (!this.app.vault.getAbstractFileByPath(dir)) {
        await this.app.vault.createFolder(dir);
      }
      const buffer = await file.arrayBuffer();
      await this.app.vault.createBinary(vaultPath, buffer);
      const adapter = this.app.vault.adapter as { getBasePath?: () => string };
      const basePath = adapter.getBasePath?.() ?? "";
      return { name, path: `${basePath}/${vaultPath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to save image: ${msg}`);
      return null;
    }
  }

  /** Build the `## Attached Files` context section for an explicit set of
   *  files + images. Shared helper; main chat and thread composer both call
   *  it with their own state. */
  private async buildAttachmentContextFor(
    files: TFile[],
    images: Array<{ name: string; path: string }>,
  ): Promise<string> {
    if (files.length === 0 && images.length === 0) return "";
    const sections: string[] = [];
    for (const file of files) {
      try {
        const content = await this.app.vault.cachedRead(file);
        sections.push(`### ${file.name}\n\`\`\`\n${content}\n\`\`\``);
      } catch {
        sections.push(`### ${file.name}\n(Could not read file)`);
      }
    }
    for (const img of images) {
      sections.push(`### Image: ${img.name}\nThe image file is located at: ${img.path}\nPlease read and analyze this image.`);
    }
    return `## Attached Files\n\n${sections.join("\n\n")}\n\n---\n\n`;
  }

  private async attachImageBlob(file: File): Promise<void> {
    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const candidateName = file.name && file.name !== "image" ? file.name : `pasted-${Date.now()}.${ext}`;
    if (this.attachedImages.some((img) => img.name === candidateName)) {
      new Notice(`"${candidateName}" is already attached`);
      return;
    }
    const saved = await this.saveImageBlobToVault(file);
    if (!saved) return;
    this.attachedImages.push(saved);
    this.renderPills();
  }

  private removeAttachment(filePath: string): void {
    this.attachedFiles = this.attachedFiles.filter((f) => f.path !== filePath);
    this.attachedImages = this.attachedImages.filter((img) => img.path !== filePath);
    this.renderPills();
  }

  private renderPills(): void {
    this.pillsRow.empty();

    const totalCount = this.attachedFiles.length + this.attachedImages.length;
    if (totalCount === 0) {
      this.pillsRow.style.display = "none";
      return;
    }

    this.pillsRow.style.display = "flex";

    for (const file of this.attachedFiles) {
      const pill = this.pillsRow.createDiv({ cls: "af-chat-pill" });
      const iconEl = pill.createSpan({ cls: "af-chat-pill-icon" });
      setIcon(iconEl, "file-text");
      pill.createSpan({ cls: "af-chat-pill-name", text: file.name });
      const removeBtn = pill.createSpan({ cls: "af-chat-pill-remove" });
      setIcon(removeBtn, "x");
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.removeAttachment(file.path);
      };
    }

    for (const img of this.attachedImages) {
      const pill = this.pillsRow.createDiv({ cls: "af-chat-pill" });
      const iconEl = pill.createSpan({ cls: "af-chat-pill-icon" });
      setIcon(iconEl, "image");
      pill.createSpan({ cls: "af-chat-pill-name", text: img.name });
      const removeBtn = pill.createSpan({ cls: "af-chat-pill-remove" });
      setIcon(removeBtn, "x");
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this.removeAttachment(img.path);
      };
    }
  }

  private buildAttachmentContext(): Promise<string> {
    return this.buildAttachmentContextFor(this.attachedFiles, this.attachedImages);
  }

  // ═══════════════════════════════════════════════════════
  //  Send
  // ═══════════════════════════════════════════════════════

  private async handleSend(): Promise<void> {
    const managed = this.getCurrentSession();
    if (!managed) return;

    const userText = this.textarea.value.trim();
    if (!userText) return;

    // Build attachment context before clearing
    const attachmentContext = await this.buildAttachmentContext();
    const attachedNames = [
      ...this.attachedFiles.map((f) => f.name),
      ...this.attachedImages.map((img) => img.name),
    ];

    // Clear input and attachments, reset textarea height
    this.textarea.value = "";
    this.textarea.style.height = "auto";
    this.sendBtn.style.display = "none";
    this.attachedFiles = [];
    this.attachedImages = [];
    this.renderPills();

    const fullText = attachmentContext ? `${attachmentContext}${userText}` : undefined;

    // Show user bubble with attachment indicators
    this.addBubble("user", userText, attachedNames.length > 0 ? attachedNames : undefined);

    // If agent is currently streaming, inject into the existing process
    if (managed.session.isStreaming) {
      managed.session.injectMessage(userText, fullText, attachedNames.length > 0 ? attachedNames : undefined);
      return;
    }

    // Indicator DOM is now driven by the subscription in switchToAgent() that
    // re-renders from `session.isStreaming` + `session.currentToolName`.
    // We no longer flip them manually here — just handle bubble rendering.
    let assistantBubble: HTMLElement | null = null;
    let accumulated = "";
    let hasText = false;
    // Snapshot the session at send-time so the callbacks can check "am I still
    // writing into the DOM of the tab that submitted this?" — without this
    // guard, events from Agent A kept firing into Agent B's DOM after the
    // user switched tabs mid-stream. Final messages still land in
    // `managed.session.messages` via the session layer, so switching back to
    // Agent A picks them up via switchToAgent's history render.
    const sendingSession = managed.session;
    const isViewed = () => this.getCurrentSession()?.session === sendingSession;

    try {
      await managed.session.sendMessage(userText, (event) => {
        if (!isViewed()) {
          // User is looking at a different tab. Do NOT touch the DOM —
          // that's what caused answers from Agent A to appear in Agent B.
          // Drop the event; history will re-render correctly on switch-back.
          // Also clear stale references that belong to the now-wiped DOM.
          assistantBubble = null;
          hasText = false;
          accumulated = "";
          return;
        }
        if (event.type === "text") {
          // The bubble we created earlier may have been wiped by a switch.
          // `isConnected` is false for detached nodes, so recreate.
          if (!hasText || !assistantBubble || !assistantBubble.isConnected) {
            assistantBubble = this.addBubble("assistant");
            hasText = true;
          }
          accumulated += event.content;
          // Use a streaming text container instead of setText which destroys
          // sibling elements (including the copy button)
          let streamText = assistantBubble!.querySelector(".af-chat-stream-text");
          if (!streamText) {
            streamText = assistantBubble!.createDiv({ cls: "af-chat-stream-text" });
          }
          streamText.setText(accumulated);
        } else if (event.type === "error") {
          // CLI reported an error (API error, context overflow, watchdog
          // timeout, etc). Render a red error bubble so the user knows
          // exactly what happened; state clean-up is handled by the session.
          const msg = event.errorMessage?.trim() || "The agent's run ended with an error.";
          this.addBubble("error", `Error: ${msg}`);
        } else if (event.type === "compacted") {
          // /compact completed — not a bubble anymore. The session writes
          // `stats.lastCompact` and re-emits stats, so the inline notice
          // appears in the stats strip under the composer and self-clears
          // on the next user turn.
        } else if (event.type === "result") {
          // Turn ended — finalize current assistant bubble
          if (hasText && assistantBubble && assistantBubble.isConnected) {
            const cleaned = stripRememberTags(accumulated);
            this.renderMarkdownBubble(assistantBubble, cleaned);
            (assistantBubble as HTMLElement & { _setRawText?: (t: string) => void })._setRawText?.(cleaned);
            // Attach thread affordance first so the affordances row exists;
            // the tool-calls summary (if any) joins it on the same row.
            const lastMsg = managed.session.messages[managed.session.messages.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
              this.attachThreadAffordance(assistantBubble, lastMsg.id, managed.session);
              if (event.toolCalls && event.toolCalls.length > 0) {
                const row = this.getOrCreateAffordancesRow(assistantBubble);
                this.buildToolSummary(event.toolCalls, row);
              }
            }
          } else if (event.toolCalls && event.toolCalls.length > 0) {
            // Tool-only turn with no text — drop the summary inline (no
            // affordances row possible because there's no anchor bubble).
            this.buildToolSummary(event.toolCalls);
          }
          // Reset for next turn (if an injected message is queued)
          accumulated = "";
          hasText = false;
          assistantBubble = null;
        }
      }, fullText, attachedNames.length > 0 ? attachedNames : undefined);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "Aborted") {
        this.addBubble("error", `Error: ${msg}`);
      }
    }
  }

  /** "+ New chat" creates a brand-new conversation alongside any existing
   *  ones, leaving every other chat's history intact. */
  private async handleNewChat(): Promise<void> {
    if (!this.selectedAgentName) return;
    const agents = this.plugin.runtime.getSnapshot().agents;
    const agent = agents.find((a) => a.name === this.selectedAgentName);
    if (!agent) return;

    const newId = newConversationId();
    try {
      await this.plugin.repository.createConversation(agent, newId, defaultConversationName());
    } catch (err) {
      new Notice(`Couldn't create conversation: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    await this.switchToAgent(this.selectedAgentName, newId);
  }

  private startFreshIntro(session: ChatSession): void {
    // Indicator DOM is driven by the activity subscription — no manual flips.
    let introAccumulated = "";
    let introBubble: HTMLElement | null = null;
    let introHasText = false;

    void session.sendMessage(
      "Please introduce yourself and briefly describe your capabilities and what you can help with.",
      (event) => {
        if (event.type === "text") {
          if (!introHasText) {
            introBubble = this.addBubble("assistant");
            introHasText = true;
          }
          introAccumulated += event.content;
          introBubble!.setText(introAccumulated);
        }
        // Ignore "result" here — the .then() handler finalizes
      },
    ).then((result) => {
      if (introHasText && introBubble) {
        this.renderMarkdownBubble(introBubble, introAccumulated);
        (introBubble as HTMLElement & { _setRawText?: (t: string) => void })._setRawText?.(introAccumulated);
      } else if (result.text.trim()) {
        introBubble = this.addBubble("assistant");
        this.renderMarkdownBubble(introBubble, result.text);
        (introBubble as HTMLElement & { _setRawText?: (t: string) => void })._setRawText?.(result.text);
      }

      if (result.toolCalls.length > 0) {
        this.buildToolSummary(result.toolCalls);
      }
      this.textarea.focus();
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg !== "Aborted") {
        this.addBubble("error", `Error: ${msg}`);
      }
    });
  }
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `${n}`;
}
