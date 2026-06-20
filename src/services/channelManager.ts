import { normalizePath, TFile, type Vault } from "obsidian";
import type {
  ChannelConfig,
  ChannelCredentialEntry,
  ChannelStatus,
  FleetSettings,
  FleetSnapshot,
  UsageRecord,
} from "../types";
import type { FleetRepository } from "../fleetRepository";
import type { McpAuthManager } from "./mcpAuth";
import { ChatSession } from "./chatSession";
import type { ChannelAdapter, InboundImage, InboundMessage } from "./channels/adapter";
import { SlidingWindowRateLimiter } from "./channels/rateLimiter";
import { markdownToMrkdwn, splitForTransport } from "./channels/formatter";

/**
 * Factory that builds a concrete `ChannelAdapter` for a given channel config.
 * Injectable so tests can supply a fake adapter instead of spinning up real
 * Slack Socket Mode sockets. The real factory (for production) is registered
 * from `main.ts` when the SlackAdapter is wired in.
 */
export type ChannelAdapterFactory = (
  config: ChannelConfig,
  credential: ChannelCredentialEntry,
) => ChannelAdapter;

export interface ChannelManagerDeps {
  /**
   * Live getter for the repository. Must return the CURRENT repository instance —
   * the plugin rebuilds its repository inside `saveSettings()`, so capturing a
   * direct reference here would leave the channel manager talking to a stale
   * object graph.
   */
  getRepository: () => FleetRepository;
  vault: Vault;
  /** Returns the current settings snapshot — called at spawn time so edits are live. */
  getSettings: () => FleetSettings;
  /** Returns the live credential record from the ChannelCredentialStore.
   *  Falls back to settings.channelCredentials for backwards compatibility. */
  getChannelCredentials?: () => Record<string, ChannelCredentialEntry>;
  /** Keychain-backed MCP token store, threaded into channel ChatSessions so
   *  HTTP MCP bearer/OAuth tokens project into channel-driven runs. */
  getMcpAuth?: () => McpAuthManager;
  /** Factory that produces the transport-specific adapter. */
  adapterFactory: ChannelAdapterFactory;
  /** Sink for per-turn token/cost usage from channel sessions (the usage ledger).
   *  Late-bound to the current runtime so it survives runtime rebuilds. */
  recordUsage?: (record: UsageRecord) => void;
  /** Injectable clock, primarily for tests. */
  now?: () => number;
}

export interface ChannelMetrics {
  messagesReceived: number;
  messagesSent: number;
  lastMessageAt: number | null;
}

interface SessionEntry {
  session: ChatSession;
  channelName: string;
  conversationId: string;
  sessionKey: string;
}

/**
 * Transport-agnostic manager for external chat channels. Owns:
 *  - Active adapters keyed by channel name
 *  - ChatSession instances keyed by `${channelName}:${conversationId}`
 *  - Per-conversation FIFO promise-chain locks (serialize concurrent inbound)
 *  - Per-conversation sliding-window rate limiter (DoS protection)
 *  - Hard cap + idle hibernation (subprocess resource control)
 *  - Field-level reconcile diffing (no unnecessary socket restarts)
 *
 * INVARIANT: every inbound message for a given conversation is processed
 * sequentially. ChatSession.sendMessage has a single turnResolve slot — concurrent
 * calls to the same session would deadlock. The conversation lock enforces this.
 */
/**
 * Parse the first token of a message as an agent name. Supports:
 *   @site-monitor: check this    → { agent: "site-monitor", rest: "check this" }
 *   @site-monitor check this     → { agent: "site-monitor", rest: "check this" }
 *   site-monitor: check this     → { agent: "site-monitor", rest: "check this" }
 *   use site-monitor: check this → { agent: "site-monitor", rest: "check this" }
 *   use site-monitor check this  → { agent: "site-monitor", rest: "check this" }
 *   @site-monitor                → { agent: "site-monitor", rest: "" }
 *
 * Returns null if no known agent name is found. No regex — simple string matching
 * against the set of known names, so there's zero risk of false positives on
 * message content that happens to contain @-mentions or colons.
 */
export function parseAgentPrefix(
  text: string,
  agentNames: string[],
): { agent: string; rest: string } | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  for (const name of agentNames) {
    const nameLower = name.toLowerCase();
    // Match all prefix forms. Order matters: try longer prefixes first.
    const prefixes = [
      `use ${nameLower}:`,
      `use ${nameLower}`,
      `@${nameLower}:`,
      `@${nameLower}`,
      `${nameLower}:`,
    ];
    for (const prefix of prefixes) {
      if (lower.startsWith(prefix)) {
        const after = trimmed.slice(prefix.length).trim();
        return { agent: name, rest: after };
      }
    }
  }
  return null;
}

export class ChannelManager {
  private readonly adapters = new Map<string, ChannelAdapter>();
  /** Config snapshot used to build each adapter — used by reconcile to detect field changes. */
  private readonly adapterConfigs = new Map<string, ChannelConfig>();
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly conversationLocks = new Map<string, Promise<void>>();
  private readonly rateLimiter: SlidingWindowRateLimiter;
  private readonly metrics = new Map<string, ChannelMetrics>();
  private readonly statusListeners = new Set<() => void>();
  private readonly adapterUnsubscribes = new Map<string, Array<() => void>>();
  private readonly now: () => number;

  /**
   * Per-thread agent binding: maps `${channelName}:${conversationId}` → agent name.
   * When a user sends `@code-reviewer: review this`, the binding updates and
   * persists so the thread "remembers" which agent it's talking to across plugin
   * restarts.
   */
  private readonly threadBindings = new Map<string, string>();

  private hibernationInterval: number | null = null;
  private started = false;

  constructor(private readonly deps: ChannelManagerDeps) {
    this.now = deps.now ?? (() => Date.now());
    const settings = deps.getSettings();
    this.rateLimiter = new SlidingWindowRateLimiter({
      maxPerWindow: Math.max(1, settings.channelRateLimitPerConversation),
      windowMs: Math.max(1000, settings.channelRateLimitWindowMinutes * 60_000),
      now: this.now,
    });
  }

  // ═══════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════

  async start(snapshot: FleetSnapshot): Promise<void> {
    if (this.started) return;
    this.started = true;

    for (const channel of snapshot.channels) {
      await this.bringUpChannel(channel, snapshot);
    }

    // Idle hibernation tick — once per minute is plenty.
    this.hibernationInterval = window.setInterval(() => {
      void this.runHibernationSweep();
    }, 60_000);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    if (this.hibernationInterval) {
      window.clearInterval(this.hibernationInterval);
      this.hibernationInterval = null;
    }

    const adapters = Array.from(this.adapters.values());
    await Promise.all(
      adapters.map(async (adapter) => {
        try {
          await adapter.stop();
        } catch (err) {
          console.warn(`Agent Fleet: channel adapter ${adapter.config.name} stop() failed`, err);
        }
      }),
    );
    this.adapters.clear();
    this.adapterConfigs.clear();
    for (const unsubs of this.adapterUnsubscribes.values()) {
      for (const u of unsubs) u();
    }
    this.adapterUnsubscribes.clear();

    // Drain in-flight conversation locks so handleInbound callbacks finish
    // before we tear down sessions. Adapters are already stopped, so no new
    // inbound messages will arrive.
    if (this.conversationLocks.size > 0) {
      await Promise.allSettled(Array.from(this.conversationLocks.values()));
    }

    // Hibernate all sessions (no pending turns — if there are, swallow the rejection).
    for (const entry of this.sessions.values()) {
      try {
        if (entry.session.isStreaming) {
          entry.session.abort();
        } else {
          entry.session.hibernate();
        }
      } catch {
        // best-effort
      }
    }
    this.sessions.clear();
    this.conversationLocks.clear();
    this.conversationLockGen.clear();
    this.rateLimiter.resetAll();
  }

  /**
   * Reconcile the live adapter set against the current snapshot + settings.
   * Performs a field-level diff so non-connection edits (allowlist, channel_context)
   * don't tear down existing sockets.
   */
  async reconcile(snapshot: FleetSnapshot): Promise<void> {
    if (!this.started) return;

    const nextByName = new Map<string, ChannelConfig>();
    for (const channel of snapshot.channels) {
      nextByName.set(channel.name, channel);
    }

    // Detect removed or disabled channels — stop + tear down.
    for (const [name, adapter] of this.adapters) {
      const next = nextByName.get(name);
      const nextValid = next && this.isChannelRuntimeValid(next, snapshot);
      if (!next || !next.enabled || !nextValid) {
        await this.tearDownChannel(name);
        continue;
      }

      const prev = this.adapterConfigs.get(name);
      if (prev && this.requiresRestart(prev, next)) {
        await this.tearDownChannel(name);
        await this.bringUpChannel(next, snapshot);
      } else {
        // In-place update: the adapter keeps its connection but its config view
        // now reflects the new allowlist / channel_context / etc. We mutate the
        // stored ChannelConfig in place so adapter.config reflects the change;
        // adapters are expected to read allowlist and context live on each inbound.
        this.adapterConfigs.set(name, next);
        (adapter as unknown as { config: ChannelConfig }).config = next;
      }
    }

    // Bring up any new enabled+valid channels that don't have an adapter yet.
    for (const [name, channel] of nextByName) {
      if (!this.adapters.has(name) && channel.enabled && this.isChannelRuntimeValid(channel, snapshot)) {
        await this.bringUpChannel(channel, snapshot);
      }
    }

    this.notifyStatusListeners();
  }

  // ═══════════════════════════════════════════════════════
  //  Channel lifecycle helpers
  // ═══════════════════════════════════════════════════════

  /** Resolve credentials from the live ChannelCredentialStore, falling back to settings. */
  private getCredentials(): Record<string, ChannelCredentialEntry> {
    return this.deps.getChannelCredentials?.() ?? this.deps.getSettings().channelCredentials ?? {};
  }

  private isChannelRuntimeValid(channel: ChannelConfig, snapshot: FleetSnapshot): boolean {
    // Re-enforce load-time rules at runtime too, in case a validation issue slipped through.
    const agent = snapshot.agents.find((a) => a.name === channel.defaultAgent);
    if (!agent) return false;
    if (agent.approvalRequired.length > 0) return false;
    const credential = this.getCredentials()[channel.credentialRef];
    if (!credential) return false;
    if (credential.type !== channel.type) return false;
    return true;
  }

  private async bringUpChannel(channel: ChannelConfig, snapshot: FleetSnapshot): Promise<void> {
    if (!channel.enabled) return;
    if (!this.isChannelRuntimeValid(channel, snapshot)) return;

    const credential = this.getCredentials()[channel.credentialRef];
    if (!credential) return; // guarded above, but keep the narrowing

    let adapter: ChannelAdapter;
    try {
      adapter = this.deps.adapterFactory(channel, credential);
    } catch (err) {
      console.error(`Agent Fleet: failed to build adapter for channel ${channel.name}`, err);
      return;
    }

    const unsubs: Array<() => void> = [];
    unsubs.push(
      adapter.onInbound((msg) => {
        void this.handleInbound(adapter, msg);
      }),
    );
    unsubs.push(adapter.onStatusChange(() => this.notifyStatusListeners()));

    // Subscribe to agent switch requests from interactive UI (e.g. /agents buttons)
    if (adapter.onAgentSwitch) {
      unsubs.push(
        adapter.onAgentSwitch((conversationId, agentName, _userId) => {
          const convKey = `${channel.name}:${conversationId}`;
          this.threadBindings.set(convKey, agentName);
          void this.persistBindings(channel.name);
        }),
      );
    }

    // Feed the adapter the validated agent list so its /agents picker only shows
    // agents that exist and are enabled (not stale/typo'd allowed_agents entries).
    adapter.setAllowedAgentsResolver?.(() => this.resolveAllowedAgents(channel));

    this.adapters.set(channel.name, adapter);
    this.adapterConfigs.set(channel.name, channel);
    this.adapterUnsubscribes.set(channel.name, unsubs);
    this.ensureMetrics(channel.name);

    // Load persisted thread→agent bindings from disk so existing threads
    // remember which agent they were bound to across plugin restarts.
    await this.loadBindings(channel.name);

    try {
      await adapter.start();
    } catch (err) {
      console.error(`Agent Fleet: channel adapter ${channel.name} start() failed`, err);
      // Keep the adapter registered so the UI can show its error status — caller
      // can click "Reconcile" after fixing credentials.
    }
    this.notifyStatusListeners();
  }

  private async tearDownChannel(name: string): Promise<void> {
    const adapter = this.adapters.get(name);
    if (!adapter) return;

    try {
      await adapter.stop();
    } catch (err) {
      console.warn(`Agent Fleet: channel adapter ${name} stop() failed`, err);
    }

    const unsubs = this.adapterUnsubscribes.get(name);
    if (unsubs) {
      for (const u of unsubs) u();
    }
    this.adapterUnsubscribes.delete(name);
    this.adapters.delete(name);
    this.adapterConfigs.delete(name);

    // Abort/hibernate any sessions belonging to this channel.
    const prefix = `${name}:`;
    for (const [key, entry] of this.sessions) {
      if (key.startsWith(prefix)) {
        try {
          if (entry.session.isStreaming) {
            entry.session.abort();
          } else {
            entry.session.hibernate();
          }
        } catch {
          // best-effort
        }
        this.sessions.delete(key);
      }
    }
  }

  /**
   * Determine whether two versions of a channel config require a full adapter
   * restart. Connection-relevant fields (type, credential_ref, transport) trigger
   * a restart; in-place editable fields (allowed_users, channel_context, tags,
   * body, per_user_sessions) do not.
   */
  private requiresRestart(prev: ChannelConfig, next: ChannelConfig): boolean {
    if (prev.type !== next.type) return true;
    if (prev.credentialRef !== next.credentialRef) return true;
    // defaultAgent changes don't need a socket restart — they only affect which
    // agent a NEW thread defaults to. Existing thread bindings stay intact.
    if (JSON.stringify(prev.transport) !== JSON.stringify(next.transport)) return true;
    return false;
  }

  // ═══════════════════════════════════════════════════════
  //  Inbound routing
  // ═══════════════════════════════════════════════════════

  private async handleInbound(adapter: ChannelAdapter, msg: InboundMessage): Promise<void> {
    const channel = adapter.config;
    const convKey = `${channel.name}:${msg.conversationId}`;

    // Allowlist check — must use the transport-verified `externalUserId`.
    if (channel.allowedUsers.length > 0) {
      if (!msg.externalUserId || !channel.allowedUsers.includes(msg.externalUserId)) {
        return;
      }
    }

    // Rate limit — message is not queued for later; user must resend.
    if (!this.rateLimiter.tryConsume(convKey)) {
      console.warn(`Agent Fleet: rate-limited message from ${msg.externalUserId} on ${channel.name} (conversation ${msg.conversationId})`);
      try {
        await adapter.send(
          msg.conversationId,
          "_Rate limit exceeded. Please slow down and try again in a few minutes._",
        );
      } catch (err) {
        console.warn(`Agent Fleet: rate-limit reply failed on ${channel.name}`, err);
      }
      return;
    }

    // Serialize per conversation — concurrent messages to the same conversation
    // would deadlock ChatSession's single turnResolve slot.
    await this.withConversationLock(convKey, async () => {
      const metrics = this.ensureMetrics(channel.name);
      metrics.messagesReceived += 1;
      metrics.lastMessageAt = this.now();

      // ── Agent prefix routing ──────────────────────────────
      // Parse the first token of the message as an agent name. If matched,
      // update the thread binding and strip the prefix from the text that
      // goes to the agent.
      const resolvedAgentNames = this.resolveAllowedAgents(channel);
      const prefix = parseAgentPrefix(msg.text, resolvedAgentNames);

      let agentName: string;
      let messageText: string;

      if (prefix) {
        agentName = prefix.agent;
        messageText = prefix.rest;
        // Update binding — persist so it survives restarts.
        const prevBinding = this.threadBindings.get(convKey);
        this.threadBindings.set(convKey, agentName);
        void this.persistBindings(channel.name);

        // Update thread title so the Slack thread list shows which agent is active.
        if (prevBinding !== agentName) {
          try {
            await adapter.setThreadTitle?.(msg.conversationId, agentName);
          } catch {
            // best-effort
          }
        }

        // If the user only typed the agent name (no actual message), confirm
        // the switch and return without starting a turn.
        if (!messageText) {
          try {
            await adapter.send(
              msg.conversationId,
              `_Now chatting with *${agentName}*. Send your next message to start._`,
            );
          } catch {
            // best-effort
          }
          return;
        }
      } else {
        // Check thread-specific binding first, then channel+user binding
        // (set by /agents button clicks), then fall back to channel default.
        const channelUserKey = `${channel.name}:${msg.conversationId.replace(/:thread:[^:]+$/, `:user:${msg.externalUserId}`)}`;
        agentName = this.threadBindings.get(convKey)
          ?? this.threadBindings.get(channelUserKey)
          ?? channel.defaultAgent;
        messageText = msg.text;
      }

      try {
        await adapter.setTyping(msg.conversationId, true);
      } catch {
        // typing indicator is best-effort
      }

      // Save inbound images to vault and prepend file-path context so the
      // agent can read them via its Read tool (same pattern as chat view).
      if (msg.images && msg.images.length > 0) {
        const imageContext = await this.saveInboundImages(msg.images);
        if (imageContext) {
          messageText = imageContext + (messageText ? messageText : "Please analyze this image.");
        }
      }

      let replyText = "";
      try {
        const session = await this.getOrCreateSession(channel, msg.conversationId, agentName);
        const result = await session.sendMessage(messageText, () => {
          /* stream events are ignored for channels — we only act on the final turn result */
        });
        replyText = result.text.trim();
        if (result.toolCalls.length > 0) {
          const toolSummary = summarizeToolCalls(result.toolCalls);
          if (toolSummary) replyText += `\n\n_${toolSummary}_`;
        }
      } catch (err) {
        console.error(`Agent Fleet: channel turn failed on ${channel.name}/${msg.conversationId}`, err);
        replyText = `_Sorry — the agent run failed. ${err instanceof Error ? err.message : String(err)}_`;
      }

      try {
        if (replyText) {
          // Prefix reply with agent name when multiple agents are available
          // so the user knows which agent responded (especially useful on
          // Telegram where the bot name can't change dynamically)
          const multiAgent = channel.allowedAgents.length > 1 ||
            (channel.allowedAgents.length === 0 && this.resolveAllowedAgents(channel).length > 1);
          if (multiAgent) {
            replyText = `*[${agentName}]*\n${replyText}`;
          }
          await this.deliverReply(adapter, msg.conversationId, replyText);
          metrics.messagesSent += 1;
        }
      } catch (err) {
        console.error(`Agent Fleet: reply delivery failed on ${channel.name}`, err);
      } finally {
        try {
          await adapter.setTyping(msg.conversationId, false);
        } catch {
          // best-effort
        }
      }

      this.enforceHardCap();
    });
  }

  private async deliverReply(
    adapter: ChannelAdapter,
    conversationId: string,
    text: string,
  ): Promise<void> {
    // The adapter is responsible for the transport-specific formatting inside
    // its own send() (e.g. markdownToMrkdwn for Slack). But for Slack v1 we
    // know the outbound transport is mrkdwn, and the manager is where chunking
    // lives (shared across future transports). We chunk in generic markdown here
    // and let the adapter do the final mrkdwn conversion on each chunk.
    const chunks = splitForTransport(text);
    for (const chunk of chunks) {
      await adapter.send(conversationId, chunk);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Inbound image handling
  // ═══════════════════════════════════════════════════════

  /**
   * Save downloaded images to the vault and return a text block that tells the
   * agent where to find them. Mirrors the chat view's image attachment approach:
   * the agent reads the image from disk using its Read tool.
   */
  private async saveInboundImages(images: InboundImage[]): Promise<string> {
    const settings = this.deps.getSettings();
    const dir = `${settings.fleetFolder}/chat-images`;
    const sections: string[] = [];

    for (const img of images) {
      try {
        // Ensure directory exists
        if (!this.deps.vault.getAbstractFileByPath(normalizePath(dir))) {
          await this.deps.vault.createFolder(normalizePath(dir));
        }
        const filePath = normalizePath(`${dir}/${img.filename}`);
        // Avoid overwriting — append timestamp if needed
        let finalPath = filePath;
        if (this.deps.vault.getAbstractFileByPath(filePath)) {
          const dot = img.filename.lastIndexOf(".");
          const base = dot > 0 ? img.filename.slice(0, dot) : img.filename;
          const ext = dot > 0 ? img.filename.slice(dot) : "";
          finalPath = normalizePath(`${dir}/${base}_${Date.now()}${ext}`);
        }
        await this.deps.vault.createBinary(finalPath, img.data);

        // Build absolute path for the agent's Read tool
        const adapter = this.deps.vault.adapter;
        const basePath = (adapter as { basePath?: string }).basePath ?? "";
        const absPath = basePath ? `${basePath}/${finalPath}` : finalPath;

        sections.push(`### Image: ${img.filename}\nThe image file is located at: ${absPath}\nPlease read and analyze this image.`);
      } catch (err) {
        console.warn("Agent Fleet: failed to save inbound image", img.filename, err);
      }
    }

    if (sections.length === 0) return "";
    return `## Attached Images\n\n${sections.join("\n\n")}\n\n---\n\n`;
  }

  // ═══════════════════════════════════════════════════════
  //  Session management
  // ═══════════════════════════════════════════════════════

  private async getOrCreateSession(
    channel: ChannelConfig,
    conversationId: string,
    agentName: string,
  ): Promise<ChatSession> {
    // Session key includes the agent name so different agents in the same thread
    // get isolated sessions. Switching from site-monitor to code-reviewer creates
    // a fresh session; switching back later resumes the site-monitor session via
    // its persisted sessionId.
    const sessionKey = `${channel.name}:${conversationId}:${agentName}`;
    const existing = this.sessions.get(sessionKey);
    if (existing) return existing.session;

    const repository = this.deps.getRepository();
    const agent = repository.getAgentByName(agentName);
    if (!agent) {
      throw new Error(`Channel ${channel.name} bound to missing agent ${agentName}`);
    }

    const session = new ChatSession(
      agent,
      this.deps.getSettings(),
      repository,
      this.deps.vault,
      {
        channelName: channel.name,
        conversationId: `${conversationId}:${agentName}`,
        channelContext: channel.channelContext || undefined,
        mcpAuth: this.deps.getMcpAuth?.(),
      },
    );
    if (this.deps.recordUsage) {
      session.setUsageRecorder(this.deps.recordUsage);
    }

    try {
      await session.loadPersistedState();
    } catch {
      // corrupted persistence — start fresh
    }

    this.sessions.set(sessionKey, {
      session,
      channelName: channel.name,
      conversationId,
      sessionKey,
    });
    return session;
  }

  // ═══════════════════════════════════════════════════════
  //  Thread binding persistence + resolution
  // ═══════════════════════════════════════════════════════

  /**
   * Returns the list of agent names a user is allowed to switch to via @-prefix
   * on this channel. Empty `allowedAgents` = all agents in the fleet.
   */
  private resolveAllowedAgents(channel: ChannelConfig): string[] {
    const enabled = new Set(
      this.deps.getRepository().getSnapshot().agents.filter((a) => a.enabled).map((a) => a.name),
    );
    // Empty allowlist = all enabled agents; otherwise intersect the configured
    // names with what actually exists and is enabled, so a stale/typo'd/disabled
    // entry (e.g. a renamed or deleted agent) never shows up as selectable.
    const names = channel.allowedAgents.length > 0 ? channel.allowedAgents : [...enabled];
    return names.filter((n) => enabled.has(n));
  }

  /**
   * Persist the threadBindings map for a given channel to disk at
   * `_fleet/channels/<name>/bindings.json`. Fire-and-forget — called from
   * handleInbound under the conversation lock.
   */
  private async persistBindings(channelName: string): Promise<void> {
    const prefix = `${channelName}:`;
    const bindings: Record<string, string> = {};
    for (const [key, agent] of this.threadBindings) {
      if (key.startsWith(prefix)) {
        bindings[key.slice(prefix.length)] = agent;
      }
    }
    const settings = this.deps.getSettings();
    const path = normalizePath(`${settings.fleetFolder}/channels/${channelName}/bindings.json`);
    const content = JSON.stringify(bindings, null, 2);
    try {
      const file = this.deps.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        await this.deps.vault.modify(file, content);
      } else {
        // Ensure the parent folder exists.
        const parent = path.slice(0, path.lastIndexOf("/"));
        if (!this.deps.vault.getAbstractFileByPath(parent)) {
          try {
            await this.deps.vault.createFolder(parent);
          } catch {
            // may already exist
          }
        }
        await this.deps.vault.create(path, content);
      }
    } catch (err) {
      console.warn(`Agent Fleet: failed to persist thread bindings for ${channelName}`, err);
    }
  }

  /**
   * Load thread bindings from disk on startup. Called from `bringUpChannel`.
   */
  private async loadBindings(channelName: string): Promise<void> {
    const settings = this.deps.getSettings();
    const path = normalizePath(`${settings.fleetFolder}/channels/${channelName}/bindings.json`);
    try {
      const file = this.deps.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      const content = await this.deps.vault.cachedRead(file);
      const bindings = JSON.parse(content) as Record<string, string>;
      for (const [convId, agent] of Object.entries(bindings)) {
        if (typeof agent === "string") {
          this.threadBindings.set(`${channelName}:${convId}`, agent);
        }
      }
    } catch {
      // Missing or corrupt file — start with empty bindings.
    }
  }

  /** Get the agent bound to a specific thread, or the channel default. */
  getThreadAgent(channelName: string, conversationId: string): string | undefined {
    return this.threadBindings.get(`${channelName}:${conversationId}`);
  }

  /**
   * Enforce the global hard cap on live `claude` subprocesses. Counts only sessions
   * whose subprocess is currently alive. If over cap, hibernates the one with the
   * oldest `lastActiveAt` (skipping any that are mid-turn).
   */
  private enforceHardCap(): void {
    const cap = Math.max(1, this.deps.getSettings().maxConcurrentChannelSessions);
    const live = Array.from(this.sessions.values()).filter(
      (e) => e.session.isProcessAlive && !e.session.isStreaming,
    );
    if (live.length <= cap) return;

    live.sort((a, b) => a.session.lastActiveAt - b.session.lastActiveAt);
    const toEvict = live.length - cap;
    for (let i = 0; i < toEvict; i += 1) {
      const victim = live[i];
      if (!victim) break;
      try {
        victim.session.hibernate();
      } catch {
        // best-effort
      }
    }
  }

  private async runHibernationSweep(): Promise<void> {
    const idleMs = Math.max(60_000, this.deps.getSettings().channelIdleTimeoutMinutes * 60_000);
    const cutoff = this.now() - idleMs;
    for (const entry of this.sessions.values()) {
      if (!entry.session.isProcessAlive) continue;
      if (entry.session.isStreaming) continue;
      if (entry.session.lastActiveAt < cutoff) {
        try {
          entry.session.hibernate();
        } catch {
          // best-effort
        }
      }
    }
  }

  /**
   * Post a broadcast message to a channel (e.g. heartbeat results). Uses the
   * adapter's `broadcast()` method which sends without a pre-existing conversation
   * context — for Slack this opens a DM with the first allowed user and posts there.
   */
  async broadcastToChannel(channelName: string, text: string): Promise<void> {
    const adapter = this.adapters.get(channelName);
    if (!adapter) {
      console.warn(`Agent Fleet: broadcastToChannel — no adapter for channel ${channelName}`);
      return;
    }
    if (!adapter.broadcast) {
      console.warn(`Agent Fleet: broadcastToChannel — adapter ${channelName} does not support broadcast`);
      return;
    }
    await adapter.broadcast(text);
  }

  /**
   * Post a message to an explicit destination id within a channel (a Discord/Slack
   * channel id or Telegram chat id) — used for per-task delivery to a specific
   * channel rather than the broadcast DM.
   */
  async postToChannelTarget(channelName: string, target: string, text: string): Promise<void> {
    const adapter = this.adapters.get(channelName);
    if (!adapter) {
      console.warn(`Agent Fleet: postToChannelTarget — no adapter for channel ${channelName}`);
      return;
    }
    if (!adapter.sendToTarget) {
      console.warn(`Agent Fleet: postToChannelTarget — adapter ${channelName} does not support sendToTarget`);
      return;
    }
    await adapter.sendToTarget(target, text);
  }

  // ═══════════════════════════════════════════════════════
  //  Conversation lock — per-key FIFO promise chain
  // ═══════════════════════════════════════════════════════

  /**
   * Per-key FIFO promise chain. Each call chains onto the previous promise for
   * the same key, ensuring sequential execution per conversation. A generation
   * counter tracks the chain head so we can reliably GC entries when no more
   * work is queued (unlike promise identity comparison which never works).
   */
  private readonly conversationLockGen = new Map<string, number>();

  private async withConversationLock(key: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.conversationLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => {
      release = r;
    });
    const gen = (this.conversationLockGen.get(key) ?? 0) + 1;
    this.conversationLockGen.set(key, gen);
    this.conversationLocks.set(key, prev.then(() => next));
    try {
      await prev;
      await fn();
    } finally {
      release();
      // GC: if no one else chained after us, this key is idle — delete both entries.
      if (this.conversationLockGen.get(key) === gen) {
        this.conversationLocks.delete(key);
        this.conversationLockGen.delete(key);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Metrics & status
  // ═══════════════════════════════════════════════════════

  private ensureMetrics(channelName: string): ChannelMetrics {
    let m = this.metrics.get(channelName);
    if (!m) {
      m = { messagesReceived: 0, messagesSent: 0, lastMessageAt: null };
      this.metrics.set(channelName, m);
    }
    return m;
  }

  getMetrics(channelName: string): ChannelMetrics {
    return { ...this.ensureMetrics(channelName) };
  }

  getChannelStatus(name: string): ChannelStatus {
    const adapter = this.adapters.get(name);
    if (!adapter) return "disabled";
    return adapter.getStatus();
  }

  getConnectedCount(): number {
    let n = 0;
    for (const adapter of this.adapters.values()) {
      if (adapter.getStatus() === "connected") n += 1;
    }
    return n;
  }

  getSessionCount(channelName: string): number {
    let n = 0;
    const prefix = `${channelName}:`;
    for (const key of this.sessions.keys()) {
      if (key.startsWith(prefix)) n += 1;
    }
    return n;
  }

  onStatusChange(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatusListeners(): void {
    for (const listener of this.statusListeners) {
      try {
        listener();
      } catch {
        // isolate listener errors
      }
    }
  }
}

function summarizeToolCalls(toolCalls: Array<{ name: string }>): string {
  if (toolCalls.length === 0) return "";
  const counts = new Map<string, number>();
  for (const tc of toolCalls) {
    counts.set(tc.name, (counts.get(tc.name) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [name, count] of counts) {
    parts.push(count > 1 ? `${name}×${count}` : name);
  }
  return `Used ${toolCalls.length} tool${toolCalls.length === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

// Avoid unused import complaint in strict mode — markdownToMrkdwn is re-exported for
// adapters that want a shared converter without pulling from ./channels/formatter.
export { markdownToMrkdwn };
