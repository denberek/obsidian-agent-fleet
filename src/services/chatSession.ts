import { type ChildProcess } from "child_process";
import { createHash, randomUUID } from "crypto";
import { normalizePath, TFile } from "obsidian";
import type { Vault } from "obsidian";
import type { AgentConfig, ChatMessage, FleetSettings } from "../types";
import type { FleetRepository } from "../fleetRepository";
import { slugify } from "../utils/markdown";
import { resolveModel, shouldPassModelFlag } from "./../utils/modelResolution";
import { spawnCli, splitLines } from "../utils/platform";
import { buildWikiReferencesContext } from "../utils/wikiReferences";
import { buildMemorySection, extractCaptures, redactRememberForDisplay, stripRememberTags } from "../utils/memoryFormat";
import { MemoryWriter } from "./memoryWriter";
import type { McpAuthManager } from "./mcpAuth";
import {
  installMcpProjection,
  resolveProjectedServers,
  uninstallMcpProjection,
  type McpProjection,
} from "./mcpProjection";
import {
  type ClaudeSettingsState,
  restoreClaudeSettingsFile,
  writeClaudeSettingsFile,
} from "../utils/claudeSettings";
import { normalizeAdapter } from "../adapters";
import type { PermissionSetupState } from "../adapters/types";
import {
  codexAdapter,
  newCodexTurnParseState,
  parseCodexChatEvent,
  type CodexTurnParseState,
} from "../adapters/codexAdapter";

/** Generate a fresh message id (uuid v4). */
function newMessageId(): string {
  return randomUUID();
}

/** Derive a stable id for a legacy message that predates the id field.
 * sha1(timestamp + first 80 chars of content). Deterministic across reloads. */
function deriveLegacyMessageId(msg: ChatMessage): string {
  const basis = `${msg.timestamp}|${msg.content.slice(0, 80)}`;
  return createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

export interface ChatSessionOptions {
  /** Name of the channel this session belongs to (e.g. "my-slack"). */
  channelName?: string;
  /** Transport-opaque conversation id (e.g. "slack:T1:C1:U1"). */
  conversationId?: string;
  /** Extra system context appended to the base prompt after agent body/skills/memory. */
  channelContext?: string;
  /** In-app multi-conversation: when set, this session represents one of N
   *  parallel chats with the same agent inside the Obsidian chat panel.
   *  Distinct from channel-mode `conversationId` because routing and
   *  persistence paths differ. The sentinel "default" maps to the legacy
   *  per-agent chat.json so existing data keeps working. */
  inAppConversationId?: string;
  /** When set, this session is a THREAD anchored to the given message id of
   *  `parentSession`. Its base prompt embeds the parent's history up to and
   *  including the anchor; its persistence and session id are isolated. */
  threadAnchorId?: string;
  parentSession?: ChatSession;
  /** Keychain-backed MCP token store, used to project bearer/OAuth tokens for
   *  HTTP MCP servers into this session's runs. */
  mcpAuth?: McpAuthManager;
}

export interface ToolCall {
  name: string;
  command?: string;
}

export interface StreamEvent {
  type: "text" | "tool_use" | "tool_result" | "result" | "error" | "compacted";
  content: string;
  toolName?: string;
  toolCalls?: ToolCall[];
  /** Human-readable error message for `type: "error"` events. */
  errorMessage?: string;
  /** Token stats for `type: "compacted"` events. */
  compact?: { preTokens: number; postTokens: number };
}

export interface ChatRateLimit {
  /** e.g. "five_hour", "daily". Unknown values are passed through. */
  type: string;
  /** Epoch seconds. */
  resetsAt?: number;
  /** "allowed" | "throttled" etc. */
  status?: string;
  isUsingOverage?: boolean;
}

export interface ChatSessionStats {
  /** Concrete model the CLI routed to, once known. */
  concreteModel?: string;
  /** Context window capacity (tokens). Known after first result event. */
  contextWindow?: number;
  /** Tokens consumed by the latest turn's prompt (input + cache). Closest
   * proxy for "context used right now" because Claude Code re-sends history
   * with each turn. */
  contextTokensUsed?: number;
  /** Sum of total_cost_usd across all turns in this session. */
  costTotalUsd: number;
  /** Latest rate-limit snapshot from the CLI. */
  rateLimit?: ChatRateLimit;
  /** Count of completed turns. */
  turnCount: number;
  /** Transient — set when a /compact just finished, cleared when the next
   *  user turn starts. Drives an inline notice in the chat stats strip so
   *  compact is no longer rendered as an error-like bubble in the chat. */
  lastCompact?: { preTokens: number; postTokens: number };
}

export interface ThreadIndexEntry {
  /** Vault path of the thread's own state file, relative to vault root. */
  path: string;
  createdAt: string;
  /** User+assistant turns combined. Mirrored from the thread file for O(1)
   *  badge rendering; written whenever the thread persists. */
  messageCount: number;
  lastActive: string;
}

interface ChatState {
  sessionId: string | null;
  messages: ChatMessage[];
  lastActive: string;
  /** Human-readable conversation name (in-app multi-conversation only).
   *  Absent on legacy single-conversation files. */
  name?: string;
  /** Creation timestamp — used by the picker for sort fallback when
   *  lastActive equals across conversations. */
  createdAt?: string;
  /** Parent-side index of threads. Absent on old chat.json files. */
  threads?: Record<string, ThreadIndexEntry>;
}

/** Persisted shape of a thread's own state file. */
interface ThreadState {
  anchorMessageId: string;
  anchorIndex: number;
  sessionId: string | null;
  messages: ChatMessage[];
  createdAt: string;
  lastActive: string;
}

export class ChatSession {
  messages: ChatMessage[] = [];
  isStreaming = false;
  isProcessAlive = false;
  /** Tracks the .claude/settings.local.json we wrote for the live process so
   *  we can restore the user's pre-existing file when the process closes. */
  private settingsState: ClaudeSettingsState | null = null;
  /** Per-process MCP projection (merged --mcp-config / -c overrides + temp
   *  files); cleaned up with the settings file when the process closes. */
  private mcpProjection: McpProjection | null = null;

  /** Number of turns still awaiting a result event from the CLI. */
  get pendingTurnCount(): number {
    return this.pendingTurns;
  }

  /** Wall-clock of the most recent user message (or session construction). Used by
   * the ChannelManager for idle hibernation and hard-cap LRU eviction. */
  public lastActiveAt: number = Date.now();

  private process: ChildProcess | null = null;
  private claudeSessionId: string | null = null;
  /** True when the current Claude spawn used `--resume`. Lets us recover when a
   *  resumed session is expired/missing (claude errors or returns nothing) by
   *  dropping the dead id so the next turn starts fresh instead of staying
   *  silent forever. Mirrors `codexResumeAttempted`. */
  private claudeResumeAttempted = false;
  private vault: Vault;
  private stdoutBuffer = "";
  /** Bound event handlers for the current process — kept so we can removeListener on kill. */
  private processListeners: {
    onStdout: (chunk: Buffer | string) => void;
    onStderr: (chunk: Buffer | string) => void;
    onError: (err: Error) => void;
    onClose: (code: number | null) => void;
  } | null = null;
  private basePromptSent = false;

  // Codex mode — agents with `adapter: codex` have no long-lived process.
  // Each turn spawns `codex exec --json [resume <thread_id>]`, the thread id
  // lands in `claudeSessionId` (same persisted slot), and the process exit
  // is the turn boundary. Mid-turn stdin injection isn't possible, so
  // injected messages queue and run as follow-up turns.
  private codexTurnState: CodexTurnParseState | null = null;
  private codexQueue: string[] = [];
  private codexResumeAttempted = false;
  private codexTurnErrors: string[] = [];
  private codexStderr = "";
  /** Permission state (CODEX_HOME overlay) for the in-flight codex turn. */
  private codexPermState: PermissionSetupState | null = null;

  /** True when this session's agent runs on the Codex CLI adapter. */
  private get isCodex(): boolean {
    return normalizeAdapter(this.agent.adapter) === "codex";
  }

  // Channel-mode fields (undefined for in-Obsidian chat panel sessions)
  private readonly channelName?: string;
  private readonly conversationId?: string;
  private readonly channelContext?: string;

  // In-app multi-conversation — when set, this session is one of N parallel
  // chats with the same agent inside the chat panel. Routes to a separate
  // per-conversation JSON instead of the per-agent singleton.
  public readonly inAppConversationId?: string;
  /** Human-readable name; persisted alongside messages. Mutable via setName. */
  private conversationName: string = "";

  // Threading — set on thread instances; parent instance uses the map below.
  readonly threadAnchorId?: string;
  readonly parentSession?: ChatSession;
  /** Anchor index at thread-creation time. Used to slice parent history. */
  private threadAnchorIndex?: number;
  /** Threads owned by this (parent) session. Keyed by anchor message id. */
  private threads = new Map<string, ChatSession>();
  /** Cached thread-index entries read from chat.json on load. Used until the
   *  thread is actually opened (then the in-memory ChatSession takes over). */
  private threadIndex: Record<string, ThreadIndexEntry> = {};

  // Turn tracking
  private activeOnEvent: ((event: StreamEvent) => void) | null = null;
  private turnResponseText = "";
  /** Chars of the redacted (tag-stripped) display already forwarded this turn. */
  private displayedLen = 0;
  private turnToolCalls: ToolCall[] = [];
  private pendingTurns = 0;
  private turnResolve: ((result: { text: string; toolCalls: ToolCall[] }) => void) | null = null;
  private turnReject: ((error: Error) => void) | null = null;

  // Auto-compact — if the agent configures a threshold, we send a `/compact`
  // user message automatically once context usage crosses it. The CLI handles
  // the rest and emits a `compact_boundary` event so the view can notify.
  // We only trigger before a user-initiated turn, never mid-stream.
  private needsCompactBeforeNextTurn = false;
  private lastCompactTriggerAt = 0;

  // Watchdog — guards against a CLI subprocess that goes silent mid-turn
  // (e.g. network hang, context-overflow retries). If no stream events
  // arrive for the configured window, the turn is rejected and the process
  // killed so isStreaming never gets permanently stuck at true. Configured
  // via FleetSettings.chatWatchdogMinutes (default 10).
  private static readonly WATCHDOG_FALLBACK_MINUTES = 10;
  private watchdogTimer: number | null = null;
  private getWatchdogMs(): number {
    const minutes = this.settings.chatWatchdogMinutes;
    const safe = typeof minutes === "number" && minutes > 0 ? minutes : ChatSession.WATCHDOG_FALLBACK_MINUTES;
    return safe * 60 * 1000;
  }
  private armWatchdog(): void {
    this.clearWatchdog();
    const watchdogMs = this.getWatchdogMs();
    this.watchdogTimer = window.setTimeout(() => {
      this.watchdogTimer = null;
      if (!this.isStreaming) return;
      // Surface a timeout error and force-clean state.
      this.activeOnEvent?.({
        type: "error",
        content: "",
        errorMessage: `no response from the CLI for ${Math.round(watchdogMs / 60000)} minutes — giving up`,
      });
      const err = new Error("Watchdog timeout");
      this.handleProcessError(err);
      try { this.process?.kill(); } catch { /* ignore */ }
    }, watchdogMs);
  }
  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      window.clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  // Activity state — single source of truth the view renders from.
  // `isStreaming` already flips via sendMessage/injectMessage; `currentToolName`
  // is set by the stream parser on tool_use events and cleared on result/text.
  // Listeners are re-notified on any change so any view that displays this
  // session can stay in sync without the sender callback writing into the DOM
  // directly (which caused cross-agent bleed when the user switched tabs
  // mid-stream).
  currentToolName?: string;
  private activityListeners = new Set<() => void>();

  /** Subscribe to activity changes (isStreaming, currentToolName). Fires once
   *  immediately so callers pick up the current state. Returns unsubscribe. */
  onActivityChange(listener: () => void): () => void {
    this.activityListeners.add(listener);
    listener();
    return () => {
      this.activityListeners.delete(listener);
    };
  }

  private emitActivity(): void {
    for (const l of this.activityListeners) l();
  }

  /** Internal setter — flips isStreaming and notifies listeners. */
  private setStreaming(active: boolean): void {
    if (this.isStreaming === active) return;
    this.isStreaming = active;
    if (!active) this.currentToolName = undefined;
    this.emitActivity();
  }

  /** Internal setter — updates currentToolName and notifies listeners. */
  private setCurrentTool(name: string | undefined): void {
    if (this.currentToolName === name) return;
    this.currentToolName = name;
    this.emitActivity();
  }

  // Stats (derived from stream-json events)
  private stats: ChatSessionStats = { costTotalUsd: 0, turnCount: 0 };
  private statsListeners = new Set<(s: ChatSessionStats) => void>();

  /** Subscribe to stats changes. Fires once immediately with current state. */
  onStatsChange(listener: (s: ChatSessionStats) => void): () => void {
    this.statsListeners.add(listener);
    listener({ ...this.stats });
    return () => {
      this.statsListeners.delete(listener);
    };
  }

  getStats(): ChatSessionStats {
    return { ...this.stats };
  }

  private emitStats(): void {
    const snapshot = { ...this.stats };
    for (const l of this.statsListeners) l(snapshot);
  }

  constructor(
    /** Construction-time agent snapshot. Mutable — `refreshAgent()` swaps
     *  in the latest repository state before each Claude spawn so permission
     *  edits made in the UI take effect on the next message in this session
     *  (no need to recreate the chat tab). */
    public agent: AgentConfig,
    private readonly settings: FleetSettings,
    private readonly repository: FleetRepository,
    vault: Vault,
    options?: ChatSessionOptions,
  ) {
    this.vault = vault;
    this.channelName = options?.channelName;
    this.conversationId = options?.conversationId;
    this.channelContext = options?.channelContext;
    this.inAppConversationId = options?.inAppConversationId;
    this.threadAnchorId = options?.threadAnchorId;
    this.parentSession = options?.parentSession;
    this.mcpAuth = options?.mcpAuth;
    this.memoryWriter = new MemoryWriter(repository);
  }

  /** Keychain-backed MCP token store for projecting HTTP bearer/OAuth tokens. */
  private readonly mcpAuth?: McpAuthManager;

  /**
   * Resolve the effective MCP servers for this session (enabled fleet registry
   * servers ∩ agent grants + the `remember` capture tool) and project them into
   * the agent's adapter. Stores the projection on the instance for cleanup and
   * returns the args/env to inject plus the allow-list of server names. Shared
   * by the Claude (long-lived) and Codex (per-turn) spawn paths so both see an
   * identical projection.
   */
  private buildMcpProjection(cwd: string): {
    args: string[];
    env: Record<string, string>;
    allowServers: string[];
  } {
    const pendingDir = this.agent.memory
      ? this.repository.getPendingDirAbsolutePath(this.agent.name)
      : null;
    const servers = resolveProjectedServers({
      registry: this.repository.getMcpServers(),
      agentGrants: this.agent.mcpServers ?? [],
      getBearerToken: (name) => this.mcpAuth?.getToken(name),
      remember: pendingDir ? { pendingDir, source: `mcp:${this.captureSource()}` } : null,
    });
    this.mcpProjection = installMcpProjection(cwd, this.agent.adapter, servers);
    return {
      args: this.mcpProjection?.args ?? [],
      env: this.mcpProjection?.env ?? {},
      allowServers: servers.map((s) => s.def.name),
    };
  }

  /** Single locked choke point for this session's memory captures. */
  private readonly memoryWriter: MemoryWriter;

  /** Provenance label for facts learned in this conversation. */
  private captureSource(): string {
    const id = this.inAppConversationId || this.conversationId || "default";
    return `chat:${id}`;
  }

  /** Returns the human-readable name of this conversation, or "" if unnamed.
   *  Populated either by setName() or by loadPersistedState(). */
  getConversationName(): string {
    return this.conversationName;
  }

  /** Update the persisted human-readable name. Triggers a save so the next
   *  picker render reflects the change without waiting for a chat turn. */
  async setConversationName(name: string): Promise<void> {
    this.conversationName = name;
    await this.persist();
  }

  /** Resolve the latest AgentConfig from the repository. Falls back to the
   *  construction-time copy if the agent has been deleted (so an in-flight
   *  reply to a now-deleted agent still completes coherently). */
  private refreshAgent(): void {
    const fresh = this.repository.getAgentByName(this.agent.name);
    if (fresh) {
      this.agent = fresh;
    }
  }

  /** True if this session is a thread (not the parent). */
  get isThread(): boolean {
    return !!this.threadAnchorId;
  }

  /** Load persisted chat state from the agent's chat.json (or this thread's
   *  state file if this is a thread session). */
  async loadPersistedState(): Promise<boolean> {
    const path = this.getChatFilePath();
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;

    try {
      const content = await this.vault.cachedRead(file);
      if (this.isThread) {
        const state = JSON.parse(content) as ThreadState;
        if (state.messages?.length > 0 || state.sessionId) {
          this.messages = (state.messages ?? []).map((m) =>
            m.id ? m : { ...m, id: deriveLegacyMessageId(m) },
          );
          this.claudeSessionId = state.sessionId ?? null;
          this.threadAnchorIndex = state.anchorIndex;
          if (this.claudeSessionId) this.basePromptSent = true;
          return true;
        }
        return false;
      }
      const state = JSON.parse(content) as ChatState;
      // Pick up the conversation name regardless of message count — the
      // file may be a freshly-created empty conversation that has only a
      // name and no messages yet.
      if (state.name) this.conversationName = state.name;
      if (state.messages?.length > 0) {
        // Backfill missing message ids for legacy chats. Stable across
        // reloads because the derivation is deterministic. Ids are
        // persisted on the next save, but we don't force a write here.
        this.messages = state.messages.map((m) =>
          m.id ? m : { ...m, id: deriveLegacyMessageId(m) },
        );
        this.claudeSessionId = state.sessionId ?? null;
        this.threadIndex = state.threads ?? {};
        if (this.claudeSessionId) {
          this.basePromptSent = true;
        }
        return true;
      }
    } catch {
      // Corrupted file — start fresh
    }
    return false;
  }

  /** Read-only view of the parent's thread index. Used by the UI to render
   *  the thread-badge count on each assistant message. Returns the live
   *  in-memory map including any threads opened this session. */
  getThreadIndex(): Readonly<Record<string, ThreadIndexEntry>> {
    return { ...this.threadIndex };
  }

  /** Persist current chat state. For thread sessions, writes a ThreadState
   *  shape to the thread file AND updates the parent's index in chat.json. */
  async persist(): Promise<void> {
    const now = new Date().toISOString();
    const path = this.getChatFilePath();

    let content: string;
    if (this.isThread) {
      const state: ThreadState = {
        anchorMessageId: this.threadAnchorId!,
        anchorIndex: this.threadAnchorIndex ?? 0,
        sessionId: this.claudeSessionId,
        messages: this.messages,
        createdAt:
          // Preserve createdAt if the thread was loaded from disk; otherwise
          // stamp now on first save.
          this.parentSession?.threadIndex[this.threadAnchorId!]?.createdAt ?? now,
        lastActive: now,
      };
      content = JSON.stringify(state, null, 2);
    } else {
      const state: ChatState = {
        sessionId: this.claudeSessionId,
        messages: this.messages,
        lastActive: now,
        name: this.conversationName || undefined,
        threads: Object.keys(this.threadIndex).length > 0 ? this.threadIndex : undefined,
      };
      content = JSON.stringify(state, null, 2);
    }

    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.vault.modify(file, content);
    } else {
      await this.ensureParentFolders(path);
      await this.vault.create(path, content);
    }

    // Thread writes also bump the parent's index so badges stay accurate.
    if (this.isThread && this.parentSession && this.threadAnchorId) {
      await this.parentSession.upsertThreadIndex(this.threadAnchorId, {
        path,
        createdAt:
          this.parentSession.threadIndex[this.threadAnchorId]?.createdAt ?? now,
        messageCount: this.messages.length,
        lastActive: now,
      });
    }
  }

  /** Update one thread's index entry on the parent and re-persist chat.json.
   *  Called from thread sessions after every write. */
  async upsertThreadIndex(anchorId: string, entry: ThreadIndexEntry): Promise<void> {
    this.threadIndex[anchorId] = entry;
    await this.persist();
  }

  /** Walk from root and create any missing folder segments of the given file path. */
  private async ensureParentFolders(filePath: string): Promise<void> {
    const lastSlash = filePath.lastIndexOf("/");
    if (lastSlash <= 0) return;
    const parent = filePath.slice(0, lastSlash);
    const segments = parent.split("/");
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (this.vault.getAbstractFileByPath(current)) continue;
      try {
        await this.vault.createFolder(current);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("already exists")) {
          throw err;
        }
      }
    }
  }

  /** Clear persisted state — for "New Chat" */
  async clearPersistedState(): Promise<void> {
    const path = this.getChatFilePath();
    // Route through the repository so deletion respects the user's trash
    // preference (FileManager.trashFile).
    await this.repository.trashFile(path);
    this.messages = [];
    this.claudeSessionId = null;
    this.basePromptSent = false;
  }

  private getChatFilePath(): string {
    // Thread mode: route to the thread-specific file path under the parent's
    // threads/ sidecar directory. Parent retains its own conversation file.
    if (this.threadAnchorId && this.parentSession) {
      return this.parentSession.getThreadFilePath(this.threadAnchorId);
    }
    // Channel mode: per-conversation session files live under the channel folder.
    // This keeps many concurrent external conversations isolated on disk and lets
    // the next spawn of the same conversation transparently `--resume` via the
    // stored sessionId.
    if (this.channelName && this.conversationId) {
      const fleetRoot = this.settings.fleetFolder;
      const safeConvId = slugify(this.conversationId) || "conversation";
      return normalizePath(
        `${fleetRoot}/channels/${this.channelName}/sessions/${safeConvId}.json`,
      );
    }
    // In-app multi-conversation: each conversation has its own JSON next to
    // the agent's other state. Required for chat-panel sessions — the legacy
    // singleton chat.json path is no longer reachable from the engine; if a
    // caller forgets to pass an inAppConversationId, that's a bug.
    if (!this.inAppConversationId) {
      throw new Error("ChatSession requires inAppConversationId (or channel options) to resolve a file path");
    }
    const safeConvId = slugify(this.inAppConversationId) || "conversation";
    if (this.agent.isFolder) {
      const folderPath = this.agent.filePath.replace(/\/agent\.md$/, "");
      return normalizePath(`${folderPath}/conversations/${safeConvId}.json`);
    }
    const memoryDir = this.repository.getMemoryPath(this.agent.name).replace(/\/[^/]+$/, "");
    return normalizePath(`${memoryDir}/${this.agent.name}-conversations/${safeConvId}.json`);
  }

  /** Vault path of a thread's state file. Threads live in a `threads/`
   *  directory next to the parent's chat.json. Public so thread sessions
   *  can call through to their parent. */
  getThreadFilePath(anchorId: string): string {
    // Compute the parent's chat.json path first so threads live alongside it.
    const parentPath = this.getParentChatFilePath();
    const parentDir = parentPath.replace(/\/[^/]+$/, "");
    const parentBase = parentPath.slice(parentDir.length + 1).replace(/\.json$/, "");
    return normalizePath(`${parentDir}/${parentBase}.threads/${anchorId}.json`);
  }

  /** Like getChatFilePath but always returns the NON-thread (parent) path.
   *  Used only when we need to resolve a thread sidecar location. */
  private getParentChatFilePath(): string {
    if (this.channelName && this.conversationId) {
      const fleetRoot = this.settings.fleetFolder;
      const safeConvId = slugify(this.conversationId) || "conversation";
      return normalizePath(
        `${fleetRoot}/channels/${this.channelName}/sessions/${safeConvId}.json`,
      );
    }
    if (this.inAppConversationId) {
      const safeConvId = slugify(this.inAppConversationId) || "conversation";
      if (this.agent.isFolder) {
        const folderPath = this.agent.filePath.replace(/\/agent\.md$/, "");
        return normalizePath(`${folderPath}/conversations/${safeConvId}.json`);
      }
      const memoryDir = this.repository.getMemoryPath(this.agent.name).replace(/\/[^/]+$/, "");
      return normalizePath(`${memoryDir}/${this.agent.name}-conversations/${safeConvId}.json`);
    }
    throw new Error("ChatSession requires inAppConversationId (or channel options) to resolve a parent file path");
  }

  // ═══════════════════════════════════════════════════════
  //  Process lifecycle
  // ═══════════════════════════════════════════════════════

  /** Spawn the Claude process if not already alive */
  private async ensureProcess(): Promise<void> {
    if (this.process && this.isProcessAlive) return;

    // Pull the latest agent state from the repository before spawning Claude.
    // Any UI permission/model/effort edits made since this session was
    // constructed take effect on this spawn. ExecutionManager already gets
    // a fresh agent per task; long-lived chat sessions need this explicit
    // refresh because they capture the agent at construction.
    this.refreshAgent();

    const args = [
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
    ];

    if (this.claudeSessionId) {
      args.push("--resume", this.claudeSessionId);
      this.basePromptSent = true;
      this.claudeResumeAttempted = true;
    } else {
      this.claudeResumeAttempted = false;
    }

    const resolved = resolveModel(null, this.agent, this.settings);
    if (shouldPassModelFlag(resolved.value)) {
      args.push("--model", resolved.value);
    }

    const permMode = this.agent.permissionMode?.trim();
    if (permMode && permMode !== "default") {
      args.push("--permission-mode", permMode);
    } else {
      args.push("--permission-mode", "bypassPermissions");
    }

    if (this.agent.effort) {
      args.push("--effort", this.agent.effort);
    }

    const cwd = this.agent.cwd?.trim() ? this.agent.cwd : (this.repository.getVaultBasePath() ?? ".");

    // Project the fleet MCP registry (+ the `remember` capture tool) into this
    // chat process for its lifetime. Adapter-agnostic — Claude gets a merged
    // --mcp-config JSON. Captures drain into working memory after each turn
    // (handleTurnEnd).
    const mcp = this.buildMcpProjection(cwd);
    args.push(...mcp.args);

    // Install .claude/settings.local.json for the lifetime of this process so
    // permissionRules.allow/deny actually apply during the chat. Without this,
    // chat sessions previously honored only --permission-mode and silently
    // dropped allow/deny rules — a Wiki Keeper chatting interactively could
    // not run its allow-listed Bash(mv *) without per-call approval. The
    // projected MCP servers are allow-listed here too so their tools don't
    // require per-call approval.
    this.settingsState = writeClaudeSettingsFile(cwd, this.agent, {
      mcpAllowServers: mcp.allowServers,
    });

    const proc = spawnCli(this.settings.claudeCliPath, args, {
      cwd,
      env: {
        ...process.env,
        AWS_REGION: this.settings.awsRegion,
        ...mcp.env,
      },
    });

    this.process = proc;
    this.isProcessAlive = true;
    this.stdoutBuffer = "";

    // Create bound handlers so we can remove them later (avoids listener leaks
    // when the process is killed and a new one is spawned).
    this.processListeners = {
      onStdout: (chunk: Buffer | string) => this.handleStdout(chunk),
      onStderr: () => { /* ignore stderr */ },
      onError: (err: Error) => this.handleProcessError(err),
      onClose: () => this.handleProcessClose(),
    };
    proc.stdout!.on("data", this.processListeners.onStdout);
    proc.stderr!.on("data", this.processListeners.onStderr);
    proc.on("error", this.processListeners.onError);
    proc.on("close", this.processListeners.onClose);
  }

  /** Detach event listeners from the current process to prevent leaks. */
  private detachProcessListeners(): void {
    if (this.process && this.processListeners) {
      this.process.stdout?.removeListener("data", this.processListeners.onStdout);
      this.process.stderr?.removeListener("data", this.processListeners.onStderr);
      this.process.removeListener("error", this.processListeners.onError);
      this.process.removeListener("close", this.processListeners.onClose);
    }
    this.processListeners = null;
  }

  // ═══════════════════════════════════════════════════════
  //  Stdout parsing
  // ═══════════════════════════════════════════════════════

  private handleStdout(chunk: Buffer | string): void {
    // Any stdout chunk is a heartbeat — reset the watchdog so we only time
    // out on true silence.
    if (this.isStreaming) this.armWatchdog();
    this.stdoutBuffer += chunk.toString();
    const lines = splitLines(this.stdoutBuffer);
    this.stdoutBuffer = lines.pop() ?? ""; // keep incomplete trailing line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        this.handleEvent(event);
      } catch {
        // Not JSON — skip
      }
    }
  }

  private handleEvent(event: Record<string, unknown>): void {
    if (this.isCodex) {
      this.handleCodexEvent(event);
      return;
    }

    // Capture session_id from any event that carries one
    if (typeof event.session_id === "string") {
      this.claudeSessionId = event.session_id;
    }

    // Capture stats — runs on every event, cheap.
    this.updateStatsFromEvent(event);

    // Detect compact boundary — CLI emits this after a `/compact` finishes.
    // Surface as a dedicated stream event so the view can show a notification.
    if (event.type === "system" && event.subtype === "compact_boundary") {
      const meta = event.compact_metadata as Record<string, unknown> | undefined;
      const pre = meta && typeof meta.pre_tokens === "number" ? meta.pre_tokens : 0;
      const post = meta && typeof meta.post_tokens === "number" ? meta.post_tokens : 0;
      // The assistant event(s) emitted during compaction report the huge
      // pre-compact context in their `usage` field, which will have bumped
      // `contextTokensUsed` to a stale-high value. Snap it back to the actual
      // post-compact size the CLI hands us so the next result event's
      // auto-compact check (and the UI) reflect reality immediately.
      if (post > 0) {
        this.stats.contextTokensUsed = post;
      }
      // Surface the compact as a transient stats-strip notice instead of a
      // chat bubble. Cleared on the next sendMessage so it disappears once
      // the user resumes the conversation.
      this.stats.lastCompact = { preTokens: pre, postTokens: post };
      this.emitStats();
      // Also clear any compact flag that a prior evaluateAutoCompact may have
      // re-latched while reading the stale pre-compact usage — otherwise the
      // next user turn would trigger a second compact on a freshly-compacted
      // context.
      this.needsCompactBeforeNextTurn = false;
      this.activeOnEvent?.({
        type: "compacted",
        content: "",
        compact: { preTokens: pre, postTokens: post },
      });
      return;
    }

    // Detect turn end
    if (event.type === "result") {
      // A result can be success OR error. If CLI indicates failure, surface
      // an error event to the view BEFORE handleTurnEnd so the chat shows
      // what went wrong; handleTurnEnd still runs to clean isStreaming.
      const isApiError = typeof event.api_error_status === "string" && !!event.api_error_status;
      if (event.is_error === true || isApiError) {
        const reason = this.describeResultError(event);
        this.activeOnEvent?.({
          type: "error",
          content: "",
          errorMessage: reason,
        });
        // A non-API (execution) error on a `--resume` turn almost always means
        // the session id is stale/expired/missing — drop it so the NEXT turn
        // spawns fresh rather than re-resuming a dead session and silently
        // returning nothing every time. (API errors like rate/overload are
        // transient and must NOT discard the session.)
        if (this.claudeResumeAttempted && event.is_error === true && !isApiError) {
          this.clearSessionId();
        }
      }
      this.handleTurnEnd();
      return;
    }

    // Parse and forward stream event
    const parsed = this.parseStreamEvent(event);
    if (parsed) {
      this.dispatchStreamEvent(parsed);
    }
  }

  /** Accumulate per-turn text/tool state from a parsed stream event and
   *  forward it to the active view callback. Shared by the Claude stream
   *  parser and the Codex event translator. */
  private dispatchStreamEvent(parsed: StreamEvent): void {
    let forwarded = parsed;
    if (parsed.type === "text") {
      const wasEmpty = this.turnResponseText.length === 0;
      if (wasEmpty) this.displayedLen = 0; // new turn's text begins
      this.turnResponseText += parsed.content;
      // Text starts arriving → agent is composing the reply, not tool-working.
      this.setCurrentTool(undefined);
      // First chunk of text in this turn — emit activity so the view can
      // hide the "thinking" dot (the filling bubble is now the indicator).
      if (wasEmpty && this.turnResponseText.length > 0) this.emitActivity();
      // Strip [REMEMBER] tags from the LIVE display so they never flash on
      // screen (capture still reads the raw turnResponseText). Forward only the
      // newly-revealed, redacted delta. §7.1.
      if (this.agent.memory) {
        const safe = redactRememberForDisplay(this.turnResponseText);
        const delta = safe.length > this.displayedLen ? safe.slice(this.displayedLen) : "";
        this.displayedLen = safe.length;
        forwarded = { ...parsed, content: delta };
      }
    } else if (parsed.type === "tool_use" && parsed.toolName) {
      this.turnToolCalls.push({ name: parsed.toolName, command: parsed.content || undefined });
      // Surface which tool is running so the view can say "Working… (Grep)".
      this.setCurrentTool(parsed.toolName);
    }
    this.activeOnEvent?.(forwarded);
  }

  /** Translate Codex JSONL events into the session's stream/stats flow.
   *  The turn boundary is the process exit (handleCodexProcessClose), not
   *  any particular event — `codex exec` exits after the turn completes. */
  private handleCodexEvent(event: Record<string, unknown>): void {
    if (!this.codexTurnState) this.codexTurnState = newCodexTurnParseState();
    const signals = parseCodexChatEvent(event, this.codexTurnState);
    for (const signal of signals) {
      switch (signal.kind) {
        case "session":
          this.claudeSessionId = signal.sessionId;
          break;
        case "text":
          this.dispatchStreamEvent({ type: "text", content: signal.text });
          break;
        case "tool":
          this.dispatchStreamEvent({
            type: "tool_use",
            content: signal.command ? signal.command.slice(0, 150) : "",
            toolName: signal.toolName,
          });
          break;
        case "usage": {
          if (signal.contextTokens > 0 && signal.contextTokens !== this.stats.contextTokensUsed) {
            this.stats.contextTokensUsed = signal.contextTokens;
          }
          this.stats.turnCount += 1;
          this.emitStats();
          break;
        }
        case "turn-failed":
        case "error":
          this.codexTurnErrors.push(signal.message);
          this.activeOnEvent?.({ type: "error", content: "", errorMessage: signal.message });
          break;
      }
    }
  }

  /** True when the current turn has produced at least one text chunk. Used by
   *  the view to suppress the "thinking" dots once the assistant bubble is
   *  actively filling — the bubble itself becomes the typing indicator. */
  get hasCurrentTurnText(): boolean {
    return this.turnResponseText.length > 0;
  }

  /** Compose a user-facing error string from a failed `type: "result"` event.
   *  The CLI sometimes uses `api_error_status` for rate/auth issues,
   *  `subtype` for categorical codes (e.g. `error_during_execution`,
   *  `error_max_turns`), and `result` to carry the literal message. */
  private describeResultError(event: Record<string, unknown>): string {
    const pieces: string[] = [];
    const apiStatus = typeof event.api_error_status === "string" ? event.api_error_status : "";
    const subtype = typeof event.subtype === "string" ? event.subtype : "";
    const resultText = typeof event.result === "string" ? event.result : "";
    if (apiStatus) pieces.push(`API ${apiStatus}`);
    else if (subtype) pieces.push(subtype.replace(/_/g, " "));
    else pieces.push("unknown error");
    if (resultText) pieces.push(`— ${resultText}`);
    return pieces.join(" ");
  }

  /** Extract model/context/cost/rate-limit info from any stream-json event
   * shape. Mutates `this.stats` and emits to listeners if anything changed. */
  private updateStatsFromEvent(event: Record<string, unknown>): void {
    let dirty = false;

    // Concrete model — from system init (top-level .model) or assistant
    // events (message.model). Never downgrades a known model to empty.
    const evModel = typeof event.model === "string" ? event.model : undefined;
    const msg = event.message as Record<string, unknown> | undefined;
    const msgModel = msg && typeof msg.model === "string" ? msg.model : undefined;
    const nextModel = evModel || msgModel;
    if (nextModel && nextModel !== this.stats.concreteModel) {
      this.stats.concreteModel = nextModel;
      dirty = true;
    }

    // Rate limit snapshot — comes in its own event.
    if (event.type === "rate_limit_event") {
      const rl = event.rate_limit_info as Record<string, unknown> | undefined;
      if (rl) {
        this.stats.rateLimit = {
          type: typeof rl.rateLimitType === "string" ? rl.rateLimitType : "unknown",
          resetsAt: typeof rl.resetsAt === "number" ? rl.resetsAt : undefined,
          status: typeof rl.status === "string" ? rl.status : undefined,
          isUsingOverage: typeof rl.isUsingOverage === "boolean" ? rl.isUsingOverage : undefined,
        };
        dirty = true;
      }
    }

    // Per-turn prompt tokens — from assistant.message.usage. This is the
    // closest live proxy for "how full is my context" because Claude Code
    // re-sends the full history each turn, so the latest input_tokens +
    // cache reads ≈ current context footprint.
    if (event.type === "assistant" && msg) {
      const usage = msg.usage as Record<string, unknown> | undefined;
      if (usage) {
        const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
        const cacheRead = typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;
        const cacheCreate = typeof usage.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : 0;
        const total = input + cacheRead + cacheCreate;
        if (total > 0 && total !== this.stats.contextTokensUsed) {
          this.stats.contextTokensUsed = total;
          dirty = true;
        }
      }
    }

    // Result event — pulls contextWindow, maxOutputTokens, and cumulative
    // cost. Fires once per turn.
    if (event.type === "result") {
      const costDelta = typeof event.total_cost_usd === "number" ? event.total_cost_usd : 0;
      if (costDelta > 0) {
        this.stats.costTotalUsd += costDelta;
        dirty = true;
      }
      const modelUsage = event.modelUsage as Record<string, unknown> | undefined;
      if (modelUsage) {
        for (const v of Object.values(modelUsage)) {
          const entry = v as Record<string, unknown>;
          if (typeof entry.contextWindow === "number" && entry.contextWindow !== this.stats.contextWindow) {
            this.stats.contextWindow = entry.contextWindow;
            dirty = true;
          }
        }
      }
      this.stats.turnCount += 1;
      dirty = true;
    }

    // After digesting a result event, evaluate the auto-compact threshold.
    // Flag a compact-on-next-turn if context usage crossed the agent's
    // configured threshold. The `/compact` will be injected before the
    // user's next message so we don't interrupt the current response.
    if (event.type === "result") {
      this.evaluateAutoCompact();
    }

    if (dirty) this.emitStats();
  }

  /** If the agent has autoCompactThreshold set and the latest turn's
   *  context fraction is above it, queue a /compact for the next user turn.
   *  Rate-limited to once per 30s to avoid loops if the CLI reports odd usage. */
  private evaluateAutoCompact(): void {
    // Codex manages its own context window internally and exposes no
    // /compact command over `exec` — never queue one for codex agents.
    if (this.isCodex) return;
    const threshold = this.agent.autoCompactThreshold ?? 0;
    if (threshold <= 0 || threshold >= 100) return;
    const window = this.stats.contextWindow;
    const used = this.stats.contextTokensUsed;
    if (!window || !used) return;
    const pct = (used / window) * 100;
    if (pct < threshold) return;
    if (Date.now() - this.lastCompactTriggerAt < 30_000) return;
    this.needsCompactBeforeNextTurn = true;
  }

  private handleTurnEnd(): void {
    this.lastActiveAt = Date.now();

    // Inline memory capture: scrape [REMEMBER] blocks, then strip them so they
    // never reach the stored/displayed message. Fire-and-forget into the locked
    // MemoryWriter (lands straight in working memory for the next turn). §7.2.
    const rawTurn = this.turnResponseText;
    let storedContent = rawTurn;
    if (this.agent.memory) {
      const captures = extractCaptures(rawTurn);
      storedContent = stripRememberTags(rawTurn);
      if (captures.length > 0) {
        void this.memoryWriter
          .capture(this.agent, captures, this.captureSource(), new Date().toISOString())
          .catch((err) => console.warn(`Agent Fleet: chat memory capture failed for "${this.agent.name}"`, err));
      }
      // Fold any `remember` MCP-tool captures from this turn into memory (§7.5).
      void this.memoryWriter
        .drainPending(this.agent, new Date().toISOString())
        .catch((err) => console.warn(`Agent Fleet: chat pending drain failed for "${this.agent.name}"`, err));
    }

    // Save assistant message to history
    if (storedContent.trim()) {
      this.messages.push({
        id: newMessageId(),
        role: "assistant",
        content: storedContent,
        timestamp: new Date().toISOString(),
        toolCalls: this.turnToolCalls.length > 0 ? [...this.turnToolCalls] : undefined,
      });
    }

    const turnResult = { text: this.turnResponseText, toolCalls: [...this.turnToolCalls] };

    // Notify the view so it can finalize the current assistant bubble
    this.activeOnEvent?.({ type: "result", content: "", toolCalls: [...this.turnToolCalls] });

    // Reset per-turn state for the next turn
    this.turnResponseText = "";
    this.turnToolCalls = [];

    this.pendingTurns--;

    // Codex: queued (injected) messages run as follow-up turns — one process
    // per turn. Drain the queue before resolving; if bookkeeping and queue
    // ever disagree, the queue wins (a codex turn maps 1:1 to a process).
    if (this.isCodex) {
      const next = this.codexQueue.shift();
      if (next !== undefined) {
        this.armWatchdog();
        void this.startCodexTurn(next).catch((err: unknown) => {
          this.handleProcessError(err instanceof Error ? err : new Error(String(err)));
        });
        return;
      }
      this.pendingTurns = 0;
    }

    if (this.pendingTurns <= 0) {
      this.pendingTurns = 0;
      this.clearWatchdog();
      this.setStreaming(false);
      void this.persist();
      const resolve = this.turnResolve;
      this.turnResolve = null;
      this.turnReject = null;
      resolve?.(turnResult);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Process error / close handlers
  // ═══════════════════════════════════════════════════════

  private handleProcessError(error: Error): void {
    this.isProcessAlive = false;
    this.process = null;
    this.pendingTurns = 0;
    this.turnResponseText = "";
    this.turnToolCalls = [];
    this.codexQueue = [];
    this.clearWatchdog();
    this.setStreaming(false);
    restoreClaudeSettingsFile(this.settingsState);
    this.settingsState = null;
    this.codexPermState?.restore();
    this.codexPermState = null;
    uninstallMcpProjection(this.mcpProjection);
    this.mcpProjection = null;

    const reject = this.turnReject;
    this.turnResolve = null;
    this.turnReject = null;
    reject?.(error);
  }

  private handleProcessClose(): void {
    this.isProcessAlive = false;
    this.process = null;
    restoreClaudeSettingsFile(this.settingsState);
    this.settingsState = null;
    uninstallMcpProjection(this.mcpProjection);
    this.mcpProjection = null;

    // If a turn was pending, resolve with whatever we accumulated
    if (this.turnResolve) {
      // Resumed turn that produced nothing → the session is almost certainly
      // expired/missing. Drop the id so the next turn starts fresh instead of
      // re-resuming a dead session and staying silent.
      if (this.claudeResumeAttempted && !this.turnResponseText.trim()) {
        this.clearSessionId();
      }
      const result = { text: this.turnResponseText, toolCalls: [...this.turnToolCalls] };

      if (this.turnResponseText.trim()) {
        this.messages.push({
          id: newMessageId(),
          role: "assistant",
          content: this.turnResponseText,
          timestamp: new Date().toISOString(),
          toolCalls: this.turnToolCalls.length > 0 ? [...this.turnToolCalls] : undefined,
        });
      }

      this.pendingTurns = 0;
      this.turnResponseText = "";
      this.turnToolCalls = [];
      this.clearWatchdog();
      this.setStreaming(false);

      void this.persist();

      const resolve = this.turnResolve;
      this.turnResolve = null;
      this.turnReject = null;
      resolve?.(result);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════

  /**
   * Send a message. `displayText` is stored in history (what user typed).
   * `fullText` (optional) is what actually gets sent to Claude (may include attachment content).
   * Returns a promise that resolves when all pending turns (including injected messages) complete.
   */
  async sendMessage(
    displayText: string,
    onEvent: (event: StreamEvent) => void,
    fullText?: string,
    attachments?: string[],
  ): Promise<{ text: string; toolCalls: ToolCall[] }> {
    this.lastActiveAt = Date.now();

    // Store user message in history
    this.messages.push({
      id: newMessageId(),
      role: "user",
      content: displayText,
      timestamp: new Date().toISOString(),
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    });

    // Build message content
    let messageText = fullText ?? displayText;

    // Prepend base prompt on the first message of a new session
    if (!this.basePromptSent) {
      const basePrompt = await this.buildBasePrompt();
      messageText = `${basePrompt}\n\n## Task\n${messageText}`;
      this.basePromptSent = true;
    }

    // Codex: one process per turn, thread continuity via `exec resume`.
    // No compact handling — codex manages its own context.
    if (this.isCodex) {
      if (this.stats.lastCompact) {
        this.stats.lastCompact = undefined;
        this.emitStats();
      }
      this.activeOnEvent = onEvent;
      this.turnResponseText = "";
      this.turnToolCalls = [];
      this.pendingTurns = 1;
      this.setStreaming(true);
      this.armWatchdog();
      try {
        await this.startCodexTurn(messageText);
      } catch (err) {
        this.pendingTurns = 0;
        this.clearWatchdog();
        this.setStreaming(false);
        throw new Error(`Failed to start Codex process: ${err instanceof Error ? err.message : String(err)}`);
      }
      return new Promise((resolve, reject) => {
        this.turnResolve = resolve;
        this.turnReject = reject;
      });
    }

    // Spawn process if needed (auto-resumes if sessionId exists)
    await this.ensureProcess();

    // Auto-compact check — if context crossed the agent's configured
    // threshold, prepend a /compact command to this turn. The CLI runs
    // compaction before processing the user's message; its result event
    // bumps pendingTurns → 0 → setStreaming(false), then the user's
    // message is sent as an injected follow-up so it's part of the
    // post-compaction context.
    const runningCompact = this.needsCompactBeforeNextTurn;
    if (runningCompact) {
      this.needsCompactBeforeNextTurn = false;
      this.lastCompactTriggerAt = Date.now();
    }

    // Drop any stale "just compacted" notice from the stats strip — the user
    // is actively conversing again, no need to keep the transient banner.
    if (this.stats.lastCompact) {
      this.stats.lastCompact = undefined;
      this.emitStats();
    }

    // Set up turn tracking
    this.activeOnEvent = onEvent;
    this.turnResponseText = "";
    this.turnToolCalls = [];
    this.pendingTurns = runningCompact ? 2 : 1;
    this.setStreaming(true);
    this.armWatchdog();

    const writeStdin = (content: string) => {
      const stdinMsg = JSON.stringify({
        type: "user",
        message: { role: "user", content },
      });
      this.process!.stdin!.write(stdinMsg + "\n");
    };

    try {
      if (runningCompact) {
        // Fire compaction first — the CLI handles it and emits a result.
        writeStdin("/compact");
      }
      writeStdin(messageText);
    } catch (err) {
      this.pendingTurns = 0;
      this.setStreaming(false);
      throw new Error(`Failed to write to Claude process stdin: ${err instanceof Error ? err.message : String(err)}`);
    }

    return new Promise((resolve, reject) => {
      this.turnResolve = resolve;
      this.turnReject = reject;
    });
  }

  /** Public: manually trigger a /compact on the next send. Flags the session
   *  so the next sendMessage prepends a compact command; call this from the
   *  UI's "Compact now" affordance. No-op for Codex agents (no /compact). */
  scheduleCompact(): void {
    if (this.isCodex) return;
    this.needsCompactBeforeNextTurn = true;
  }

  // ═══════════════════════════════════════════════════════
  //  Codex turn lifecycle (process per turn)
  // ═══════════════════════════════════════════════════════

  /** Spawn one `codex exec --json` process for a single turn. The prompt is
   *  written to stdin (positional `-` arg); the thread id from the stream's
   *  thread.started event is stored for `exec resume` on the next turn. */
  private async startCodexTurn(messageText: string): Promise<void> {
    // Pick up any UI permission/model/effort edits made since the last turn.
    this.refreshAgent();

    const resolved = resolveModel(null, this.agent, this.settings);
    const invocation = await codexAdapter.buildExec({
      prompt: messageText,
      model: shouldPassModelFlag(resolved.value) ? resolved.value : "",
      modelSource: resolved.source,
      effort: this.agent.effort ?? "",
      agent: this.agent,
      settings: this.settings,
      streaming: true,
      resumeSessionId: this.claudeSessionId,
    });

    // Codex events carry no model id — surface the resolved one so the
    // stats strip isn't blank for codex chats.
    if (resolved.value && this.stats.concreteModel !== resolved.value) {
      this.stats.concreteModel = resolved.value;
      this.emitStats();
    }

    this.codexTurnState = newCodexTurnParseState();
    this.codexResumeAttempted = !!this.claudeSessionId;
    this.codexTurnErrors = [];
    this.codexStderr = "";

    const cwd = this.agent.cwd?.trim() ? this.agent.cwd : (this.repository.getVaultBasePath() ?? ".");

    // Project the fleet MCP registry (+ the `remember` capture tool) into this
    // turn. Codex spawns per turn, so the projection (inline `-c
    // mcp_servers.*` overrides + bearer-token env) is built fresh each turn and
    // torn down on process close. Captures drain into working memory in
    // handleTurnEnd.
    const mcp = this.buildMcpProjection(cwd);
    invocation.args.push(...mcp.args);

    // Install execpolicy rules for this agent via a per-agent CODEX_HOME
    // overlay (returned as env). Fail-soft: sandbox-only enforcement if
    // execpolicy is unavailable. Restored on process close/error/abort.
    this.codexPermState = await codexAdapter.setupPermissions(cwd, this.agent, this.settings);

    const proc = spawnCli(invocation.cliPath, invocation.args, {
      cwd,
      env: {
        ...process.env,
        AWS_REGION: this.settings.awsRegion,
        ...mcp.env,
        ...(this.codexPermState?.env ?? {}),
      },
    });

    this.process = proc;
    this.isProcessAlive = true;
    this.stdoutBuffer = "";

    this.processListeners = {
      onStdout: (chunk: Buffer | string) => this.handleStdout(chunk),
      onStderr: (chunk: Buffer | string) => {
        this.codexStderr += chunk.toString();
      },
      onError: (err: Error) => this.handleProcessError(err),
      onClose: (code: number | null) => this.handleCodexProcessClose(code),
    };
    proc.stdout!.on("data", this.processListeners.onStdout);
    proc.stderr!.on("data", this.processListeners.onStderr);
    proc.on("error", this.processListeners.onError);
    proc.on("close", this.processListeners.onClose);

    try {
      proc.stdin!.write(invocation.stdinPayload ?? messageText);
      proc.stdin!.end();
    } catch (err) {
      try { proc.kill(); } catch { /* ignore */ }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /** Codex turn boundary — the per-turn process exited. */
  private handleCodexProcessClose(code: number | null): void {
    this.detachProcessListeners();
    this.isProcessAlive = false;
    this.process = null;
    this.stdoutBuffer = "";
    this.codexPermState?.restore();
    this.codexPermState = null;
    uninstallMcpProjection(this.mcpProjection);
    this.mcpProjection = null;

    const failed = code !== 0 && !this.turnResponseText.trim();
    if (failed) {
      const detail =
        this.codexTurnErrors.join("; ") ||
        this.codexStderr.trim().slice(-500) ||
        `Codex CLI exited with code ${code ?? "unknown"}`;
      // A failed resume usually means the thread rollout under
      // ~/.codex/sessions is gone (pruned, machine change). Drop the id so
      // the next message starts a fresh thread; the UI history is preserved
      // and the base prompt is re-sent.
      if (this.codexResumeAttempted) {
        this.clearSessionId();
      }
      this.codexQueue = [];
      // Surface the error to the view, then close the turn the same way a
      // Claude error-result does: streaming off, promise resolved with
      // whatever (nothing) accumulated.
      this.activeOnEvent?.({ type: "error", content: "", errorMessage: detail });
    }
    this.handleTurnEnd();
  }

  /**
   * Inject a follow-up message into the running process (while agent is still working).
   * Does NOT spawn a new process — writes to existing stdin.
   */
  injectMessage(text: string, fullText?: string, attachments?: string[]): void {
    // Codex can't take mid-turn stdin — queue the message; it runs as its
    // own follow-up turn when the current process exits (handleTurnEnd).
    if (this.isCodex) {
      if (!this.isStreaming && this.pendingTurns === 0) return;
      this.messages.push({
        id: newMessageId(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
      });
      this.codexQueue.push(fullText ?? text);
      this.pendingTurns++;
      return;
    }

    if (!this.process || !this.isProcessAlive) return;

    // Store user message in history
    this.messages.push({
      id: newMessageId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
    });

    const messageText = fullText ?? text;
    const stdinMsg = JSON.stringify({
      type: "user",
      message: { role: "user", content: messageText },
    });
    try {
      this.process.stdin!.write(stdinMsg + "\n");
    } catch (err) {
      console.warn("Agent Fleet: injectMessage stdin write failed", err);
      return;
    }

    this.pendingTurns++;
  }

  abort(): void {
    this.detachProcessListeners();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isProcessAlive = false;
    this.stdoutBuffer = "";
    this.turnResponseText = "";
    this.turnToolCalls = [];
    this.pendingTurns = 0;
    this.codexQueue = [];
    this.clearWatchdog();
    this.setStreaming(false);
    restoreClaudeSettingsFile(this.settingsState);
    this.settingsState = null;
    this.codexPermState?.restore();
    this.codexPermState = null;
    uninstallMcpProjection(this.mcpProjection);
    this.mcpProjection = null;

    const reject = this.turnReject;
    this.turnResolve = null;
    this.turnReject = null;
    reject?.(new Error("Aborted"));
  }

  /** Permanent teardown for when the conversation is being deleted (not
   *  just paused or stopped). Aborts every live thread sub-session and
   *  clears the in-memory thread map, then aborts self.
   *
   *  Distinct from `abort()` because abort means "stop this turn" and is
   *  also called from the user-facing stop button — interrupting a single
   *  message must not nuke side threads the user has opened. */
  dispose(): void {
    for (const thread of this.threads.values()) {
      thread.abort();
    }
    this.threads.clear();
    this.threadIndex = {};
    this.abort();
  }

  /**
   * Kill the subprocess but preserve session continuity — claudeSessionId, message
   * history, and basePromptSent are all retained so the next `sendMessage` transparently
   * resumes via `--resume <sessionId>`. Caller must ensure no turn is in flight.
   *
   * Used by ChannelManager for idle eviction (free up subprocess slots while keeping
   * the conversation resumable) and hard-cap LRU eviction.
   */
  hibernate(): void {
    if (this.isStreaming || this.pendingTurns > 0) {
      // Refuse to hibernate mid-turn — would corrupt turn accounting. Caller
      // should wait for the turn to settle or explicitly `abort()` instead.
      return;
    }
    this.detachProcessListeners();
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isProcessAlive = false;
    this.stdoutBuffer = "";
    restoreClaudeSettingsFile(this.settingsState);
    this.settingsState = null;
    uninstallMcpProjection(this.mcpProjection);
    this.mcpProjection = null;
    // DO NOT reset claudeSessionId, messages, basePromptSent — these are the
    // state that lets the next spawn pick up where we left off.
  }

  /**
   * Drop the current Claude session id while keeping the in-memory message history.
   * Used when `claude --resume <id>` fails (server-side session expired) — the next
   * spawn will start fresh and the user will still see their prior messages in the UI.
   */
  clearSessionId(): void {
    this.claudeSessionId = null;
    this.basePromptSent = false;
    this.claudeResumeAttempted = false;
  }

  // ═══════════════════════════════════════════════════════
  //  Prompt building
  // ═══════════════════════════════════════════════════════

  /**
   * NOTE ON MEMORY SCOPE: `_fleet/memory/<agent>.md` is intentionally **agent-scoped**,
   * not conversation-scoped. When the same agent is reached by multiple external users
   * through a channel, every conversation reads and writes the same memory file.
   * Facts learned from one user can surface in replies to another. This is a conscious
   * product decision — if you need per-user isolation, use different agents or skip
   * memory entirely for channel-bound agents.
   */
  private async buildBasePrompt(): Promise<string> {
    const sections: string[] = [this.agent.body.trim()];

    for (const skillName of this.agent.skills) {
      const skill = this.repository.getSkillByName(skillName);
      if (skill) {
        const parts = [skill.body.trim()];
        if (skill.toolsBody.trim()) parts.push(`### Tools\n${skill.toolsBody.trim()}`);
        if (skill.referencesBody.trim()) parts.push(`### References\n${skill.referencesBody.trim()}`);
        if (skill.examplesBody.trim()) parts.push(`### Examples\n${skill.examplesBody.trim()}`);
        sections.push(`## Skill: ${skill.name}\n${parts.join("\n\n")}`);
      }
    }

    if (this.agent.skillsBody.trim()) {
      sections.push(`## Agent Skills\n${this.agent.skillsBody.trim()}`);
    }

    if (this.agent.contextBody.trim()) {
      sections.push(`## Agent Context\n${this.agent.contextBody.trim()}`);
    }

    if (this.agent.memory) {
      const wm = await this.repository.readWorkingMemory(this.agent.name);
      const memorySection = buildMemorySection(this.agent, wm);
      if (memorySection) sections.push(memorySection);
    }

    // Channel context appended LAST so it takes priority over earlier sections
    // without shadowing the agent's identity.
    if (this.channelContext && this.channelContext.trim()) {
      sections.push(`## Channel Context\n${this.channelContext.trim()}`);
    }

    // Wiki references — consumer-mode access to one or more Wiki Keeper scopes.
    const wikiContext = buildWikiReferencesContext(this.agent, this.repository);
    if (wikiContext) sections.push(wikiContext);

    // Thread mode: append soft-fork preamble + replay parent history up to
    // and including the anchor message. See CHAT_THREADING_DESIGN.md §4.2.
    if (this.isThread && this.parentSession && this.threadAnchorIndex !== undefined) {
      const preamble =
        "You are continuing a side thread from this conversation. The user is " +
        "following up on one of your earlier replies and wants to explore " +
        "something specific without adding to the main thread. Your answers " +
        "here stay in this thread only and will NOT be added back to the " +
        "main conversation.";
      const parentMessages = this.parentSession.messages.slice(0, this.threadAnchorIndex + 1);
      const replayLines: string[] = ["## Conversation so far"];
      for (const m of parentMessages) {
        const role = m.role === "user" ? "User" : "Assistant";
        replayLines.push(`${role}: ${m.content.trim()}`);
      }
      sections.push(`## Thread Mode\n${preamble}\n\n${replayLines.join("\n")}`);
    }

    return sections.filter(Boolean).join("\n\n");
  }

  // ═══════════════════════════════════════════════════════
  //  Thread management
  // ═══════════════════════════════════════════════════════

  /**
   * Return the thread anchored at `anchorMessageId`, creating it if absent.
   * Re-entrant: concurrent calls return the same instance. Only callable on
   * a parent (non-thread) session.
   */
  async openOrCreateThread(anchorMessageId: string): Promise<ChatSession> {
    if (this.isThread) {
      throw new Error("Nested threads are not supported.");
    }
    const cached = this.threads.get(anchorMessageId);
    if (cached) return cached;

    const anchorIndex = this.messages.findIndex((m) => m.id === anchorMessageId);
    if (anchorIndex < 0) {
      throw new Error(`Thread anchor message "${anchorMessageId}" not found in parent.`);
    }

    const thread = new ChatSession(
      this.agent,
      this.settings,
      this.repository,
      this.vault,
      { threadAnchorId: anchorMessageId, parentSession: this, mcpAuth: this.mcpAuth },
    );
    // `threadAnchorIndex` is set either from disk (loadPersistedState) or
    // here at creation time.
    (thread as unknown as { threadAnchorIndex: number }).threadAnchorIndex = anchorIndex;

    // Try to rehydrate from disk first. If the file doesn't exist, it's a
    // fresh thread and will be created on first persist().
    const loaded = await thread.loadPersistedState();
    if (!loaded) {
      // Fresh thread — set threadAnchorIndex from parent so preamble builds.
      (thread as unknown as { threadAnchorIndex: number }).threadAnchorIndex = anchorIndex;
    }

    this.threads.set(anchorMessageId, thread);
    return thread;
  }

  /** Drop a thread from the in-memory map. Does NOT delete its file. */
  closeThread(anchorMessageId: string): void {
    const t = this.threads.get(anchorMessageId);
    if (!t) return;
    t.abort();
    this.threads.delete(anchorMessageId);
  }

  /** Hibernate all owned thread subprocesses. Called by idle sweeps. */
  hibernateIdleThreads(idleMs: number): void {
    const now = Date.now();
    for (const thread of this.threads.values()) {
      if (thread.isProcessAlive && now - thread.lastActiveAt > idleMs) {
        thread.hibernate();
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Stream event parsing
  // ═══════════════════════════════════════════════════════

  private parseStreamEvent(event: Record<string, unknown>): StreamEvent | null {
    const type = event.type as string | undefined;

    if (type === "assistant") {
      const msg = event.message as Record<string, unknown> | undefined;
      if (msg?.content && Array.isArray(msg.content)) {
        for (const block of msg.content as Array<Record<string, unknown>>) {
          if (block.type === "text" && typeof block.text === "string") {
            return { type: "text", content: block.text };
          }
          if (block.type === "tool_use") {
            const name = String(block.name ?? "tool");
            const input = block.input as Record<string, unknown> | undefined;
            const cmd = input?.command ?? input?.content ?? input?.file_path ?? input?.path ?? "";
            return {
              type: "tool_use",
              content: cmd ? String(cmd).slice(0, 150) : "",
              toolName: name,
            };
          }
        }
      }
    }

    // content_block_delta — granular text streaming
    if (type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        return { type: "text", content: delta.text };
      }
    }

    return null;
  }
}
