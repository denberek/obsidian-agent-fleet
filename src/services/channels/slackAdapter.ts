import WebSocket from "ws";
import { requestUrl } from "obsidian";
import type {
  ChannelConfig,
  ChannelCredentialEntry,
  ChannelStatus,
  ChannelType,
} from "../../types";
import type {
  ChannelAdapter,
  InboundHandler,
  InboundMessage,
  StatusHandler,
} from "./adapter";
import { markdownToMrkdwn } from "./formatter";

/**
 * Slack Socket Mode adapter.
 *
 * Transport: outbound WebSocket + outbound HTTPS, so no NAT/firewall concerns.
 * No SDK — we hit four REST endpoints directly via `fetch`:
 *   - POST apps.connections.open   (app token → wss URL)
 *   - POST chat.postMessage        (bot token → reply)
 *   - POST reactions.add / remove  (bot token → typing indicator)
 *
 * Security invariant: the allowlist check must use `event.user` from the Socket
 * Mode payload, NOT a user-controlled field in the message body. Socket Mode
 * envelopes are authenticated to Slack via the app token during the WSS handshake,
 * so `event.user` is trustworthy. Never accept a sender id from anywhere else.
 */

interface SlackCredential {
  type: "slack";
  botToken: string;
  appToken: string;
}

interface OpenConnectionResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

interface SocketModeEnvelope {
  envelope_id?: string;
  type: string;
  payload?: Record<string, unknown>;
  accepts_response_payload?: boolean;
  reason?: string;
}

interface SlackMessageEvent {
  type: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  team?: string;
}

const SLACK_API = "https://slack.com/api";

/**
 * In Assistant mode (Agents & AI Apps enabled on the Slack app), every user
 * message arrives as part of a thread. The first user message in a new thread
 * has `thread_ts === undefined` in the raw event, but we can derive the thread
 * id from its `ts` (which becomes the thread's root ts going forward).
 *
 * Conversation id shape is uniform: `slack:<team>:<channel>:thread:<thread_ts>`.
 * This is what `threadTsFromConversationId` / `channelIdFromConversationId`
 * already parse, so outbound replies keep working.
 */
function buildConversationId(event: SlackMessageEvent): string {
  const team = event.team ?? "unknown";
  const channel = event.channel ?? "unknown";
  const threadTs = event.thread_ts ?? event.ts ?? "unknown";
  return `slack:${team}:${channel}:thread:${threadTs}`;
}

/** Parse a conversationId back into its Slack channel id (for reply delivery). */
function channelIdFromConversationId(conversationId: string): string | null {
  const parts = conversationId.split(":");
  // slack:<team>:<channel>:... — channel is always the third segment
  if (parts.length >= 3 && parts[0] === "slack") {
    return parts[2] ?? null;
  }
  return null;
}

/** Parse the originating thread_ts from a conversationId, if any. */
function threadTsFromConversationId(conversationId: string): string | undefined {
  const parts = conversationId.split(":");
  if (parts[3] === "thread" && parts[4]) {
    return parts[4];
  }
  return undefined;
}

export class SlackAdapter implements ChannelAdapter {
  readonly type: ChannelType = "slack";
  public config: ChannelConfig;

  private readonly credential: SlackCredential;
  private ws: WebSocket | null = null;
  private status: ChannelStatus = "stopped";
  private stopping = false;
  private backoffMs = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly inboundHandlers = new Set<InboundHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly agentSwitchHandlers = new Set<(conversationId: string, agentName: string, userId: string) => void>();
  /** Resolver for the validated (existing + enabled) agent list, set by the
   *  ChannelManager. Falls back to raw allowed_agents when unset. */
  private allowedAgentsResolver?: () => string[];

  /**
   * Per-channel outbound queue to honor Slack's ~1 msg/sec/channel rate limit on
   * chat.postMessage. Keyed by Slack channel id, not conversation id.
   */
  private readonly sendQueues = new Map<string, Promise<void>>();

  /**
   * Map from conversationId → Slack thread context. Used by `setTyping` to route
   * `assistant.threads.setStatus` calls to the right (channel_id, thread_ts).
   * Populated on every inbound message.
   */
  private readonly threadContext = new Map<string, { channelId: string; threadTs: string }>();

  constructor(config: ChannelConfig, credential: ChannelCredentialEntry) {
    if (credential.type !== "slack") {
      throw new Error(
        `SlackAdapter requires a slack credential, got ${credential.type}`,
      );
    }
    this.config = config;
    this.credential = credential;
  }

  // ═══════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════

  async start(): Promise<void> {
    this.stopping = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // best-effort
      }
      this.ws = null;
    }
    this.threadContext.clear();
    this.sendQueues.clear();
    this.setStatus("stopped");
  }

  getStatus(): ChannelStatus {
    return this.status;
  }

  // ═══════════════════════════════════════════════════════
  //  Outbound
  // ═══════════════════════════════════════════════════════

  async send(conversationId: string, text: string): Promise<void> {
    const channel = channelIdFromConversationId(conversationId);
    if (!channel) {
      console.warn(`Agent Fleet: could not extract channel id from ${conversationId}`);
      return;
    }
    const threadTs = threadTsFromConversationId(conversationId);
    const mrkdwn = markdownToMrkdwn(text);
    await this.enqueueSend(channel, async () => {
      await this.slackApi("chat.postMessage", {
        channel,
        text: mrkdwn,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      });
    });
  }

  async broadcast(text: string): Promise<void> {
    // Post to the first allowed user's DM. Open the DM channel first via
    // conversations.open, then post with chat.postMessage.
    const userId = this.config.allowedUsers[0];
    if (!userId) {
      console.warn(`Agent Fleet: broadcast on ${this.config.name} skipped — no allowed users configured`);
      return;
    }
    try {
      const openRes = await this.slackApi<{ ok: boolean; channel?: { id?: string } }>(
        "conversations.open",
        { users: userId },
      );
      const dmChannelId = openRes.channel?.id;
      if (!dmChannelId) {
        console.warn(`Agent Fleet: broadcast — conversations.open returned no channel for user ${userId}`);
        return;
      }
      const mrkdwn = markdownToMrkdwn(text);
      await this.slackApi("chat.postMessage", {
        channel: dmChannelId,
        text: mrkdwn,
      });
    } catch (err) {
      console.error(`Agent Fleet: broadcast failed on ${this.config.name}`, err);
    }
  }

  async setThreadTitle(conversationId: string, title: string): Promise<void> {
    const context = this.threadContext.get(conversationId);
    if (!context) return;
    try {
      await this.slackApi("assistant.threads.setTitle", {
        channel_id: context.channelId,
        thread_ts: context.threadTs,
        title,
      });
    } catch (err) {
      console.warn(`Agent Fleet: assistant.threads.setTitle failed on ${this.config.name}`, err);
    }
  }

  async setTyping(conversationId: string, on: boolean): Promise<void> {
    // Slack Assistants API: assistant.threads.setStatus shows a native
    // "Agent Fleet is thinking..." indicator below the message composer. The
    // status is per-thread — we need both channel_id and thread_ts. Empty
    // string clears the indicator.
    const context = this.threadContext.get(conversationId);
    if (!context) return;
    try {
      await this.slackApi("assistant.threads.setStatus", {
        channel_id: context.channelId,
        thread_ts: context.threadTs,
        status: on ? "is thinking..." : "",
      });
    } catch (err) {
      // Most likely causes: missing `assistant:write` scope (user forgot to
      // reinstall after enabling Agents & AI Apps), or the thread expired.
      // Log and continue — a missing status indicator shouldn't break the turn.
      console.warn(
        `Agent Fleet: assistant.threads.setStatus (${on ? "on" : "off"}) failed on ${this.config.name}`,
        err,
      );
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Event subscription
  // ═══════════════════════════════════════════════════════

  onInbound(handler: InboundHandler): () => void {
    this.inboundHandlers.add(handler);
    return () => this.inboundHandlers.delete(handler);
  }

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  setAllowedAgentsResolver(resolve: () => string[]): void {
    this.allowedAgentsResolver = resolve;
  }

  onAgentSwitch(handler: (conversationId: string, agentName: string, userId: string) => void): () => void {
    this.agentSwitchHandlers.add(handler);
    return () => this.agentSwitchHandlers.delete(handler);
  }

  // ═══════════════════════════════════════════════════════
  //  Socket Mode handshake + event loop
  // ═══════════════════════════════════════════════════════

  private async connect(): Promise<void> {
    if (this.stopping) return;
    this.setStatus(this.ws ? "reconnecting" : "connecting");

    let wssUrl: string;
    try {
      const resp = await this.slackApi<OpenConnectionResponse>(
        "apps.connections.open",
        {},
        { useAppToken: true },
      );
      if (!resp.ok || !resp.url) {
        throw new Error(resp.error ?? "apps.connections.open returned no URL");
      }
      wssUrl = resp.url;
    } catch (err) {
      console.error(
        `Agent Fleet: Slack apps.connections.open failed for channel ${this.config.name}`,
        err,
      );
      this.setStatus("needs-auth");
      this.scheduleReconnect();
      return;
    }

    try {
      const ws = new WebSocket(wssUrl);

      // Attach handlers BEFORE assigning to this.ws to prevent the race
      // where events fire between construction and handler attachment.
      ws.on("open", () => {
        // `hello` event follows — we mark status connected when we see it.
      });

      ws.on("message", (data: WebSocket.RawData) => {
        this.handleSocketData(data);
      });

      ws.on("error", (err: Error) => {
        console.warn(`Agent Fleet: Slack WebSocket error on ${this.config.name}`, err);
        this.setStatus("error");
      });

      ws.on("close", () => {
        this.ws = null;
        if (!this.stopping) {
          this.scheduleReconnect();
        }
      });

      this.ws = ws;

      // Connection timeout — if we don't get a `hello` within 30s, tear down
      // and retry. Prevents hanging indefinitely on DNS/network issues.
      const connectTimeout = setTimeout(() => {
        if (this.status === "connecting" || this.status === "reconnecting") {
          console.warn(`Agent Fleet: Slack WebSocket connect timeout on ${this.config.name}`);
          try { ws.close(); } catch { /* best-effort */ }
        }
      }, 30_000);

      // Clear the timeout once we're connected (hello sets status to "connected")
      ws.on("close", () => clearTimeout(connectTimeout)); // also clear on close to avoid leak
      const statusUnsub = this.onStatusChange((status) => {
        if (status === "connected") {
          clearTimeout(connectTimeout);
          statusUnsub();
        }
      });
    } catch (err) {
      console.error(`Agent Fleet: Slack WebSocket open failed`, err);
      this.setStatus("error");
      this.scheduleReconnect();
      return;
    }
  }

  private handleSocketData(data: WebSocket.RawData): void {
    let envelope: SocketModeEnvelope;
    try {
      envelope = JSON.parse(data.toString()) as SocketModeEnvelope;
    } catch {
      return;
    }

    // `hello` — initial handshake completed; we're ready to receive events.
    if (envelope.type === "hello") {
      this.backoffMs = 1000; // reset backoff on a successful connection
      this.setStatus("connected");
      return;
    }

    // `disconnect` — Slack asks us to reconnect to a new URL. Graceful: ACK nothing,
    // close the socket, the `close` handler will schedule a reconnect.
    if (envelope.type === "disconnect") {
      try {
        this.ws?.close();
      } catch {
        // best-effort
      }
      return;
    }

    // `events_api` — the wrapper around actual Slack events. Must be ACKed promptly.
    if (envelope.type === "events_api" && envelope.envelope_id) {
      this.ackEnvelope(envelope.envelope_id);
      this.routeEventPayload(envelope.payload);
      return;
    }

    // Slash commands — ACK immediately (required within 3s), then respond via
    // chat.postEphemeral through the proven slackApi/requestUrl path.
    if (envelope.type === "slash_commands" && envelope.envelope_id) {
      this.ackEnvelope(envelope.envelope_id);
      void this.handleSlashCommand(envelope.payload as Record<string, unknown> | undefined);
      return;
    }

    // Interactive payloads — Block Kit button clicks from /agents
    if (envelope.type === "interactive" && envelope.envelope_id) {
      this.ackEnvelope(envelope.envelope_id);
      void this.handleInteraction(envelope.payload as Record<string, unknown> | undefined);
      return;
    }

    // Other types — ACK empty.
    if (envelope.envelope_id) {
      this.ackEnvelope(envelope.envelope_id);
    }
  }

  private async handleSlashCommand(payload: Record<string, unknown> | undefined): Promise<void> {
    if (!payload) return;
    const command = payload.command as string | undefined;
    const channelId = payload.channel_id as string | undefined;
    const userId = payload.user_id as string | undefined;
    if (!command || !channelId || !userId) return;

    if (command === "/agents") {
      // Validated (existing + enabled) list when the manager provided it, so
      // stale/typo'd/disabled allowed_agents entries don't show as selectable.
      const agents = this.allowedAgentsResolver ? this.allowedAgentsResolver() : this.config.allowedAgents;

      if (agents.length === 0) {
        await this.slackApi("chat.postEphemeral", {
          channel: channelId,
          user: userId,
          text: "No agents available. Add existing, enabled agents to `allowed_agents` in the channel file.",
        });
        return;
      }

      // Build Block Kit buttons — one per agent
      const buttons = agents.map((name) => ({
        type: "button",
        text: {
          type: "plain_text",
          text: name === this.config.defaultAgent ? `${name} ✓` : name,
          emoji: true,
        },
        action_id: `switch_agent_${name}`,
        value: name,
      }));

      // Slack allows max 5 elements per actions block, so chunk them
      const blocks: unknown[] = [
        {
          type: "section",
          text: { type: "mrkdwn", text: "*Select an agent to chat with:*" },
        },
      ];
      for (let i = 0; i < buttons.length; i += 5) {
        blocks.push({
          type: "actions",
          elements: buttons.slice(i, i + 5),
        });
      }

      try {
        await this.slackApi("chat.postEphemeral", {
          channel: channelId,
          user: userId,
          text: "Select an agent",
          blocks,
        });
      } catch (err) {
        console.error(`Agent Fleet: /agents response failed`, err);
      }
      return;
    }

    try {
      await this.slackApi("chat.postEphemeral", {
        channel: channelId,
        user: userId,
        text: `Unknown command: ${command}`,
      });
    } catch (err) {
      console.error(`Agent Fleet: slash command response failed for ${command}`, err);
    }
  }

  private async handleInteraction(payload: Record<string, unknown> | undefined): Promise<void> {
    if (!payload) return;
    const type = payload.type as string | undefined;
    if (type !== "block_actions") return;

    const actions = payload.actions as Array<Record<string, unknown>> | undefined;
    const user = payload.user as Record<string, unknown> | undefined;
    const channel = payload.channel as Record<string, unknown> | undefined;
    const message = payload.message as Record<string, unknown> | undefined;
    if (!actions?.length || !user || !channel) return;

    const action = actions[0];
    if (!action) return;
    const actionId = action.action_id as string | undefined;
    const agentName = action.value as string | undefined;
    if (!actionId?.startsWith("switch_agent_") || !agentName) return;

    const userId = user.id as string | undefined;
    const channelId = channel.id as string | undefined;
    if (!userId || !channelId) return;

    const teamId = (payload.team as Record<string, unknown> | undefined)?.id as string | undefined ?? "unknown";

    // Register the binding under a channel+user key so it applies to ALL
    // future messages from this user in this channel — regardless of thread.
    // In assistant threads (DMs), the thread-specific binding from @prefix
    // takes precedence. This channel-level binding is the fallback for
    // channel contexts where each @mention creates a new thread_ts.
    const channelUserKey = `slack:${teamId}:${channelId}:user:${userId}`;
    for (const handler of this.agentSwitchHandlers) {
      try {
        handler(channelUserKey, agentName, userId);
      } catch (err) {
        console.error("Agent Fleet: agent switch handler threw", err);
      }
    }

    // Post ephemeral confirmation
    try {
      await this.slackApi("chat.postEphemeral", {
        channel: channelId,
        user: userId,
        text: `Switched to *${agentName}*. Send your next message to start.`,
      });
    } catch (err) {
      console.warn("Agent Fleet: agent switch confirmation failed", err);
    }

    // Update thread title if we have thread context
    try {
      await this.setThreadTitle(channelUserKey, agentName);
    } catch {
      // best-effort — thread title won't work without thread context
    }
  }

  private ackEnvelope(envelopeId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ envelope_id: envelopeId }));
    } catch (err) {
      console.warn(`Agent Fleet: Slack envelope ACK failed`, err);
    }
  }

  private routeEventPayload(payload: Record<string, unknown> | undefined): void {
    if (!payload) return;
    const event = payload.event as Record<string, unknown> | undefined;
    if (!event) return;
    const eventType = event.type as string | undefined;

    // assistant_thread_started fires when the user opens a brand-new assistant
    // thread (before any message is sent). We don't use this to pre-create a
    // ChatSession — sessions are built lazily on the first real inbound — but
    // we could in future call `assistant.threads.setSuggestedPrompts` here to
    // offer quick-reply prompts. For v1 we just log and move on.
    if (eventType === "assistant_thread_started") {
      const thread = event.assistant_thread as
        | { user_id?: string; channel_id?: string; thread_ts?: string }
        | undefined;
      if (thread?.channel_id && thread.thread_ts) {
        console.debug(
          `Agent Fleet: assistant thread started on ${this.config.name} (channel=${thread.channel_id}, thread_ts=${thread.thread_ts}, user=${thread.user_id})`,
        );
      }
      return;
    }

    // assistant_thread_context_changed — user switched contexts on the assistant.
    // v1 ignores this; our agent doesn't use Slack context.
    if (eventType === "assistant_thread_context_changed") {
      return;
    }

    // Regular message and app_mention events. Ignore edits, deletes, bot echoes,
    // and anything without a sender.
    const messageEvent = event as unknown as SlackMessageEvent;
    const isMessage = eventType === "message" && messageEvent.subtype === undefined;
    const isAppMention = eventType === "app_mention";
    if (!isMessage && !isAppMention) return;

    if (messageEvent.bot_id) return;
    if (!messageEvent.user || !messageEvent.text) return;

    // For app_mention events, Slack wraps the bot mention in the text as
    // `<@BOT_USER_ID> actual message`. Strip it so the agent sees clean text
    // and the @prefix parser can work on the remaining content.
    if (isAppMention) {
      messageEvent.text = messageEvent.text.replace(/^<@[A-Z0-9]+>\s*/, "").trim();
      if (!messageEvent.text) return; // Empty mention (just "@AgentFleet" with no text)
    }

    // Conversation id + allowlist dependency on the VERIFIED event.user field.
    // Socket Mode envelopes are authenticated by Slack via the WSS app-token
    // handshake, so event.user is trustworthy. Do NOT substitute from the body.
    const conversationId = buildConversationId(messageEvent);

    // Store the thread context so setTyping can call assistant.threads.setStatus.
    // In Assistant mode, every message belongs to a thread — the first message
    // in a new thread has no thread_ts set yet, so we fall back to its own ts
    // (which becomes the thread's root ts going forward).
    const threadTs = messageEvent.thread_ts ?? messageEvent.ts;
    if (messageEvent.channel && threadTs) {
      this.threadContext.set(conversationId, {
        channelId: messageEvent.channel,
        threadTs,
      });
      // Evict oldest entries to bound memory (Map preserves insertion order)
      if (this.threadContext.size > 500) {
        const iter = this.threadContext.keys();
        const oldest = iter.next();
        if (!oldest.done) this.threadContext.delete(oldest.value);
      }
    }

    const msg: InboundMessage = {
      conversationId,
      externalUserId: messageEvent.user,
      text: messageEvent.text,
      timestamp: new Date().toISOString(),
      meta: {
        slack_channel: messageEvent.channel,
        slack_ts: messageEvent.ts,
        thread_ts: messageEvent.thread_ts,
      },
    };

    for (const handler of this.inboundHandlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error(`Agent Fleet: Slack inbound handler threw`, err);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(30_000, this.backoffMs * 2);
    console.warn(
      `Agent Fleet: Slack channel ${this.config.name} scheduling reconnect in ${delay}ms`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopping) return;
      void this.connect();
    }, delay);
  }

  private setStatus(next: ChannelStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const h of this.statusHandlers) {
      try {
        h(next);
      } catch {
        // best-effort
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Slack REST API + per-channel send queue
  // ═══════════════════════════════════════════════════════

  private async slackApi<T = Record<string, unknown>>(
    method: string,
    body: Record<string, unknown>,
    options: { useAppToken?: boolean } = {},
  ): Promise<T> {
    const token = options.useAppToken ? this.credential.appToken : this.credential.botToken;
    const url = `${SLACK_API}/${method}`;
    // IMPORTANT: use Obsidian's requestUrl (routed through Electron's Node net
    // module) instead of browser fetch. Browser fetch in the plugin context
    // triggers a CORS preflight that Slack's API doesn't satisfy for the
    // Authorization header — every request fails with "Failed to fetch". The
    // requestUrl helper is server-side from the browser's perspective, so
    // preflight doesn't apply. This is the canonical Obsidian plugin workaround.
    const res = await requestUrl({
      url,
      method: "POST",
      contentType: "application/json; charset=utf-8",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      // Handle statuses ourselves so we can honor Retry-After on 429 rather than
      // letting requestUrl throw a generic error on non-2xx.
      throw: false,
    });

    if (res.status === 429) {
      // Honor Retry-After, then retry once. requestUrl normalizes header names
      // to lowercase keys in res.headers.
      const retryAfter = Number(res.headers["retry-after"] ?? "1");
      await new Promise((r) => setTimeout(r, Math.max(1000, retryAfter * 1000)));
      return this.slackApi<T>(method, body, options);
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Slack ${method} HTTP ${res.status}`);
    }

    const data = res.json as T & { ok?: boolean; error?: string };
    if (data.ok === false) {
      throw new Error(`Slack ${method} error: ${data.error ?? "unknown"}`);
    }
    return data;
  }

  /**
   * Serialize sends per Slack channel id. Slack's chat.postMessage is capped at
   * roughly 1 msg/sec/channel; queueing per channel avoids bursting the limit
   * when a reply is split into multiple chunks.
   */
  private async enqueueSend(channel: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.sendQueues.get(channel) ?? Promise.resolve();
    const next = prev.then(async () => {
      try {
        await fn();
      } finally {
        // Small inter-message gap to stay under the per-channel cap.
        await new Promise((r) => setTimeout(r, 1000));
      }
    });
    // Swallow errors in the chain so a single failure doesn't poison the queue.
    const wrapped = next.catch((err) => {
      console.warn(`Agent Fleet: Slack send queue error for ${channel}`, err);
    });
    this.sendQueues.set(channel, wrapped);
    await next;
    // GC: if no subsequent send chained onto this channel, the queue is idle
    if (this.sendQueues.get(channel) === wrapped) {
      this.sendQueues.delete(channel);
    }
  }
}
