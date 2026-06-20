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
  InboundImage,
  InboundMessage,
  StatusHandler,
} from "./adapter";

/**
 * Discord adapter using the Gateway (WebSocket) for inbound events and the REST
 * API for everything outbound. Hand-rolled over `ws` — no discord.js — to stay
 * consistent with the Slack/Telegram adapters and avoid a heavy dependency.
 *
 * Transport: outbound WebSocket + outbound HTTPS, so no NAT/firewall concerns.
 *
 * Security invariant: the allowlist check uses `author.id` from the
 * Gateway-delivered MESSAGE_CREATE payload. The Gateway connection is
 * authenticated by the bot token during IDENTIFY, so `author.id` is trustworthy.
 * Never accept a sender id from anywhere else (e.g. message content).
 *
 * Note: the Message Content intent is privileged and must be enabled in the
 * Discord Developer Portal, or message `content` arrives empty. A disallowed
 * intent closes the Gateway with code 4014 — we surface that as `needs-auth`
 * with a clear console hint.
 */

interface DiscordCredential {
  type: "discord";
  botToken: string;
}

const DISCORD_API = "https://discord.com/api/v10";
const DEFAULT_GATEWAY = "wss://gateway.discord.gg";
const GATEWAY_QUERY = "?v=10&encoding=json";

// Discord's REST API REQUIRES a User-Agent in the form `DiscordBot ($url, $version)`.
// Without it, requests get Cloudflare-blocked with HTTP 403 `internal network error`
// (code 40333) — every REST call fails while the Gateway (no Cloudflare WAF) still
// connects. See https://docs.discord.food/topics/errors.
const DISCORD_USER_AGENT = "DiscordBot (https://github.com/denberek/obsidian-agent-fleet, 0.13.6)";

// Gateway intents: GUILD_MESSAGES (1<<9) | DIRECT_MESSAGES (1<<12) | MESSAGE_CONTENT (1<<15)
const INTENTS = (1 << 9) | (1 << 12) | (1 << 15); // 37376

// Gateway opcodes
const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_RESUME = 6;
const OP_RECONNECT = 7;
const OP_INVALID_SESSION = 9;
const OP_HELLO = 10;
const OP_HEARTBEAT_ACK = 11;

// Interaction types
const INTERACTION_APPLICATION_COMMAND = 2;
const INTERACTION_MESSAGE_COMPONENT = 3;

// Interaction callback types
const CALLBACK_CHANNEL_MESSAGE = 4;
const CALLBACK_UPDATE_MESSAGE = 7;

// Message flags
const FLAG_EPHEMERAL = 1 << 6; // 64

export class DiscordAdapter implements ChannelAdapter {
  readonly type: ChannelType = "discord";
  public config: ChannelConfig;

  private readonly credential: DiscordCredential;
  private ws: WebSocket | null = null;
  private status: ChannelStatus = "stopped";
  private stopping = false;
  private backoffMs = 1000;
  private reconnectTimer: number | null = null;

  // Gateway session state (for RESUME).
  private sessionId: string | null = null;
  private resumeGatewayUrl: string | null = null;
  private seq: number | null = null;
  private canResume = false;

  // Heartbeat state.
  private heartbeatTimer: number | null = null;
  private heartbeatInitialTimer: number | null = null;
  private heartbeatAcked = true;

  // Identity learned from the READY dispatch.
  private selfUserId: string | null = null;
  private applicationId: string | null = null;
  private commandRegistered = false;
  private warnedEmptyContent = false;

  private typingIntervals = new Map<string, number>();
  /** Per-channel outbound queue so a chunked reply doesn't burst Discord's rate limit. */
  private readonly sendQueues = new Map<string, Promise<void>>();

  private readonly inboundHandlers = new Set<InboundHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly agentSwitchHandlers = new Set<(conversationId: string, agentName: string, userId: string) => void>();
  /** Resolver for the validated (existing + enabled) agent list, set by the
   *  ChannelManager. Falls back to raw allowed_agents when unset. */
  private allowedAgentsResolver?: () => string[];

  constructor(config: ChannelConfig, credential: ChannelCredentialEntry) {
    if (credential.type !== "discord") {
      throw new Error(`DiscordAdapter requires a discord credential, got ${credential.type}`);
    }
    this.config = config;
    this.credential = credential;
  }

  // ═══════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════

  async start(): Promise<void> {
    this.stopping = false;
    this.backoffMs = 1000;
    this.canResume = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearHeartbeat();
    for (const [, interval] of this.typingIntervals) {
      window.clearInterval(interval);
    }
    this.typingIntervals.clear();
    try {
      this.ws?.close();
    } catch {
      // best-effort
    }
    this.ws = null;
    this.setStatus("stopped");
  }

  getStatus(): ChannelStatus {
    return this.status;
  }

  // ═══════════════════════════════════════════════════════
  //  Outbound
  // ═══════════════════════════════════════════════════════

  async send(conversationId: string, text: string): Promise<void> {
    const channelId = channelIdFromConversationId(conversationId);
    if (!channelId) return;
    await this.sendToTarget(channelId, text);
  }

  /** Post directly to a Discord channel id (server channel, thread, or DM channel). */
  async sendToTarget(channelId: string, text: string): Promise<void> {
    if (!channelId) return;
    // Discord's message content cap is 2000 chars.
    const chunks = splitText(text, 2000);
    await this.enqueueSend(channelId, async () => {
      for (const chunk of chunks) {
        await this.discordApi("POST", `/channels/${channelId}/messages`, { content: chunk });
      }
    });
  }

  async setTyping(conversationId: string, on: boolean): Promise<void> {
    const channelId = channelIdFromConversationId(conversationId);
    if (!channelId) return;

    if (on) {
      // Clear any existing interval first to prevent a double-create leak.
      const existing = this.typingIntervals.get(conversationId);
      if (existing) window.clearInterval(existing);
      // Discord typing lasts ~10s; send immediately and refresh every 8s.
      try {
        await this.discordApi("POST", `/channels/${channelId}/typing`);
      } catch (err) {
        console.warn("Agent Fleet: Discord typing trigger failed", err);
      }
      const interval = window.setInterval(() => {
        void this.discordApi("POST", `/channels/${channelId}/typing`).catch(() => { /* best-effort */ });
      }, 8000);
      this.typingIntervals.set(conversationId, interval);
    } else {
      const interval = this.typingIntervals.get(conversationId);
      if (interval) {
        window.clearInterval(interval);
        this.typingIntervals.delete(conversationId);
      }
    }
  }

  async broadcast(text: string): Promise<void> {
    // Post to the first allowed user via a DM channel.
    const userId = this.config.allowedUsers[0];
    if (!userId) return;
    try {
      const dm = await this.discordApi<{ id?: string }>("POST", "/users/@me/channels", {
        recipient_id: userId,
      });
      const channelId = dm?.id;
      if (!channelId) return;
      const chunks = splitText(text, 2000);
      for (const chunk of chunks) {
        await this.discordApi("POST", `/channels/${channelId}/messages`, { content: chunk });
      }
    } catch (err) {
      console.error(`Agent Fleet: Discord broadcast failed on ${this.config.name}`, err);
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

  onAgentSwitch(handler: (conversationId: string, agentName: string, userId: string) => void): () => void {
    this.agentSwitchHandlers.add(handler);
    return () => this.agentSwitchHandlers.delete(handler);
  }

  setAllowedAgentsResolver(resolve: () => string[]): void {
    this.allowedAgentsResolver = resolve;
  }

  /** The agents the picker should offer: validated list if available, else the
   *  raw configured allow-list. */
  private pickerAgents(): string[] {
    if (this.allowedAgentsResolver) return this.allowedAgentsResolver();
    return this.config.allowedAgents;
  }

  // ═══════════════════════════════════════════════════════
  //  Gateway connection
  // ═══════════════════════════════════════════════════════

  private async connect(): Promise<void> {
    if (this.stopping) return;
    this.setStatus(this.ws ? "reconnecting" : "connecting");

    const base = this.canResume && this.resumeGatewayUrl ? this.resumeGatewayUrl : DEFAULT_GATEWAY;
    const url = `${base}${GATEWAY_QUERY}`;

    try {
      const ws = new WebSocket(url);

      // Attach handlers BEFORE assigning to this.ws to avoid a race where events
      // fire between construction and handler attachment.
      ws.on("message", (data: WebSocket.RawData) => {
        this.handleFrame(data);
      });

      ws.on("error", (err: Error) => {
        console.warn(`Agent Fleet: Discord WebSocket error on ${this.config.name}`, err);
      });

      ws.on("close", (code: number) => {
        this.ws = null;
        this.clearHeartbeat();
        this.handleClose(code);
      });

      this.ws = ws;

      // Connection timeout — if we don't get HELLO within 30s, tear down and retry.
      const connectTimeout = window.setTimeout(() => {
        if (this.status === "connecting" || this.status === "reconnecting") {
          console.warn(`Agent Fleet: Discord WebSocket connect timeout on ${this.config.name}`);
          try { ws.close(); } catch { /* best-effort */ }
        }
      }, 30_000);
      ws.on("close", () => window.clearTimeout(connectTimeout));
      const statusUnsub = this.onStatusChange((status) => {
        if (status === "connected") {
          window.clearTimeout(connectTimeout);
          statusUnsub();
        }
      });
    } catch (err) {
      console.error("Agent Fleet: Discord WebSocket open failed", err);
      this.setStatus("error");
      this.scheduleReconnect();
    }
  }

  private handleClose(code: number): void {
    // Fatal codes won't recover by retrying — they need the user to fix the app
    // config (bad token / disallowed intents). Auto-reconnecting every ≤30s with a
    // known-bad IDENTIFY just wastes cycles and risks Discord rate-limiting the IP,
    // so we surface needs-auth and STOP. Recovery happens when the channel restarts
    // (Obsidian reload, or a connection-relevant config edit re-creates the adapter).
    //   4004 authentication failed · 4013 invalid intents · 4014 disallowed intents
    let fatal = false;
    if (code === 4014) {
      console.error(
        `Agent Fleet: Discord channel ${this.config.name} — disallowed intents (4014). ` +
        "Enable the Message Content intent in the Developer Portal → your app → Bot → Privileged Gateway Intents, then reload.",
      );
      this.canResume = false;
      this.setStatus("needs-auth");
      fatal = true;
    } else if (code === 4004 || code === 4013) {
      console.error(
        `Agent Fleet: Discord channel ${this.config.name} — gateway auth/intents error (${code}). ` +
        "Check the bot token credential, then reload.",
      );
      this.canResume = false;
      this.setStatus("needs-auth");
      fatal = true;
    } else if (code === 4007 || code === 4009) {
      // Invalid seq / session timed out — reconnect fresh (no resume).
      this.canResume = false;
    }
    if (!this.stopping && !fatal) {
      this.scheduleReconnect();
    }
  }

  private handleFrame(data: WebSocket.RawData): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(data.toString()) as GatewayFrame;
    } catch {
      return;
    }

    if (typeof frame.s === "number") this.seq = frame.s;

    switch (frame.op) {
      case OP_HELLO: {
        const interval = (frame.d as { heartbeat_interval?: number } | undefined)?.heartbeat_interval;
        this.startHeartbeat(interval ?? 41_250);
        if (this.canResume && this.sessionId && this.seq !== null) {
          this.sendGateway(OP_RESUME, {
            token: this.credential.botToken,
            session_id: this.sessionId,
            seq: this.seq,
          });
        } else {
          this.identify();
        }
        return;
      }
      case OP_HEARTBEAT: {
        // Server requested an immediate heartbeat.
        this.sendGateway(OP_HEARTBEAT, this.seq);
        return;
      }
      case OP_HEARTBEAT_ACK: {
        this.heartbeatAcked = true;
        return;
      }
      case OP_RECONNECT: {
        // Server asked us to reconnect — keep the session so we can RESUME.
        try { this.ws?.close(); } catch { /* best-effort */ }
        return;
      }
      case OP_INVALID_SESSION: {
        // d is a boolean: whether the session is resumable.
        const resumable = frame.d === true;
        if (!resumable) {
          this.canResume = false;
          this.sessionId = null;
        }
        // Discord asks for a short random delay (1–5s) before re-identifying.
        window.setTimeout(() => {
          try { this.ws?.close(); } catch { /* best-effort */ }
        }, 1000 + Math.floor(Math.random() * 4000));
        return;
      }
      case OP_DISPATCH: {
        this.handleDispatch(frame.t ?? "", frame.d);
        return;
      }
      default:
        return;
    }
  }

  private handleDispatch(type: string, d: unknown): void {
    if (type === "READY") {
      const ready = d as {
        session_id?: string;
        resume_gateway_url?: string;
        user?: { id?: string };
        application?: { id?: string };
      };
      this.sessionId = ready.session_id ?? null;
      this.resumeGatewayUrl = ready.resume_gateway_url ?? null;
      this.selfUserId = ready.user?.id ?? null;
      this.applicationId = ready.application?.id ?? null;
      this.canResume = true;
      this.backoffMs = 1000;
      this.setStatus("connected");
      void this.registerAgentsCommand();
      return;
    }

    if (type === "RESUMED") {
      this.backoffMs = 1000;
      this.setStatus("connected");
      return;
    }

    if (type === "MESSAGE_CREATE") {
      this.routeMessage(d as DiscordMessage);
      return;
    }

    if (type === "INTERACTION_CREATE") {
      void this.handleInteraction(d as DiscordInteraction);
      return;
    }
  }

  private identify(): void {
    this.sendGateway(OP_IDENTIFY, {
      token: this.credential.botToken,
      intents: INTENTS,
      properties: { os: "linux", browser: "agent-fleet", device: "agent-fleet" },
    });
  }

  private sendGateway(op: number, d: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ op, d }));
    } catch (err) {
      console.warn("Agent Fleet: Discord gateway send failed", err);
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.clearHeartbeat();
    this.heartbeatAcked = true;
    const beat = () => {
      if (!this.heartbeatAcked) {
        // Zombie connection — no ACK since the last beat. Reconnect (resume).
        console.warn(`Agent Fleet: Discord heartbeat not ACKed on ${this.config.name} — reconnecting`);
        try { this.ws?.close(); } catch { /* best-effort */ }
        return;
      }
      this.heartbeatAcked = false;
      this.sendGateway(OP_HEARTBEAT, this.seq);
    };
    // First beat after interval * jitter (per Discord docs), then every interval.
    this.heartbeatInitialTimer = window.setTimeout(() => {
      beat();
      this.heartbeatTimer = window.setInterval(beat, intervalMs);
    }, Math.floor(intervalMs * Math.random()));
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInitialTimer) {
      window.clearTimeout(this.heartbeatInitialTimer);
      this.heartbeatInitialTimer = null;
    }
    if (this.heartbeatTimer) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(30_000, this.backoffMs * 2);
    console.warn(`Agent Fleet: Discord channel ${this.config.name} scheduling reconnect in ${delay}ms`);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopping) return;
      void this.connect();
    }, delay);
  }

  // ═══════════════════════════════════════════════════════
  //  Inbound messages
  // ═══════════════════════════════════════════════════════

  private routeMessage(message: DiscordMessage): void {
    if (!message.author || message.author.bot) return;
    if (this.selfUserId && message.author.id === this.selfUserId) return;
    if (!message.channel_id) return;

    const imageAttachments = (message.attachments ?? []).filter(
      (a) => typeof a.content_type === "string" && a.content_type.startsWith("image/"),
    );

    let text = stripLeadingMention(message.content ?? "", this.selfUserId);

    // The agent prefix / routing happens in ChannelManager. Empty content with no
    // attachments usually means the privileged Message Content intent is off.
    if (!text && imageAttachments.length === 0) {
      if (!this.warnedEmptyContent) {
        this.warnedEmptyContent = true;
        console.warn(
          `Agent Fleet: Discord channel ${this.config.name} received a message with empty content. ` +
          "If this persists, enable the Message Content intent in the Developer Portal.",
        );
      }
      return;
    }

    const conversationId = buildConversationId(message.guild_id, message.channel_id);
    void this.buildAndEmitMessage(message, text, conversationId, imageAttachments);
  }

  private async buildAndEmitMessage(
    message: DiscordMessage,
    text: string,
    conversationId: string,
    imageAttachments: DiscordAttachment[],
  ): Promise<void> {
    const images: InboundImage[] = [];
    for (const attachment of imageAttachments) {
      try {
        const resp = await requestUrl({ url: attachment.url, method: "GET" });
        images.push({
          data: resp.arrayBuffer,
          filename: attachment.filename || `attachment_${message.id}`,
          mimeType: attachment.content_type ?? "image/jpeg",
        });
      } catch (err) {
        console.warn("Agent Fleet: Discord attachment download failed", err);
      }
    }

    const msg: InboundMessage = {
      conversationId,
      externalUserId: message.author!.id,
      text,
      timestamp: message.timestamp ?? new Date().toISOString(),
      meta: {
        discord_guild_id: message.guild_id,
        discord_channel_id: message.channel_id,
        discord_message_id: message.id,
        is_dm: !message.guild_id,
      },
      ...(images.length > 0 ? { images } : {}),
    };

    for (const handler of this.inboundHandlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error("Agent Fleet: Discord inbound handler threw", err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  /agents slash command + buttons
  // ═══════════════════════════════════════════════════════

  private async registerAgentsCommand(): Promise<void> {
    if (this.commandRegistered || !this.applicationId) return;
    try {
      await this.discordApi("PUT", `/applications/${this.applicationId}/commands`, [
        { name: "agents", description: "Switch the active agent", type: 1 },
      ]);
      this.commandRegistered = true;
    } catch (err) {
      // Best-effort — global command registration can take up to ~1h to propagate.
      console.warn(`Agent Fleet: Discord /agents command registration failed on ${this.config.name}`, err);
    }
  }

  private async handleInteraction(interaction: DiscordInteraction): Promise<void> {
    if (interaction.type === INTERACTION_APPLICATION_COMMAND) {
      if (interaction.data?.name === "agents") {
        await this.respondWithAgentPicker(interaction);
      }
      return;
    }

    if (interaction.type === INTERACTION_MESSAGE_COMPONENT) {
      const customId = interaction.data?.custom_id ?? "";
      if (!customId.startsWith("switch:")) return;
      const agentName = customId.slice("switch:".length);
      const userId = interaction.member?.user?.id ?? interaction.user?.id;
      const channelId = interaction.channel_id;
      if (!userId || !channelId) return;
      const conversationId = buildConversationId(interaction.guild_id, channelId);

      // Notify ChannelManager of the binding change.
      for (const handler of this.agentSwitchHandlers) {
        try {
          handler(conversationId, agentName, userId);
        } catch (err) {
          console.error("Agent Fleet: Discord agent switch handler threw", err);
        }
      }

      // Acknowledge by updating the original message to show the selection.
      await this.respondToInteraction(interaction, CALLBACK_UPDATE_MESSAGE, {
        content: `Active agent: **${agentName}**`,
        components: this.buildAgentButtons(agentName),
      });
      return;
    }
  }

  private async respondWithAgentPicker(interaction: DiscordInteraction): Promise<void> {
    const agents = this.pickerAgents();
    if (agents.length === 0) {
      await this.respondToInteraction(interaction, CALLBACK_CHANNEL_MESSAGE, {
        content: "No agents available. Add existing, enabled agents to `allowed_agents` in the channel file.",
        flags: FLAG_EPHEMERAL,
      });
      return;
    }
    await this.respondToInteraction(interaction, CALLBACK_CHANNEL_MESSAGE, {
      content: "Select an agent to chat with:",
      flags: FLAG_EPHEMERAL,
      components: this.buildAgentButtons(this.config.defaultAgent),
    });
  }

  /** Build action-row button components (≤5 buttons/row, ≤5 rows = 25 agents). */
  private buildAgentButtons(activeAgent: string): unknown[] {
    const agents = this.pickerAgents().slice(0, 25);
    const rows: unknown[] = [];
    for (let i = 0; i < agents.length; i += 5) {
      const slice = agents.slice(i, i + 5);
      rows.push({
        type: 1,
        components: slice.map((name) => ({
          type: 2,
          // style 1 = primary (active), 2 = secondary
          style: name === activeAgent ? 1 : 2,
          label: name === activeAgent ? `${name} ✓` : name,
          custom_id: `switch:${name}`,
        })),
      });
    }
    return rows;
  }

  private async respondToInteraction(
    interaction: DiscordInteraction,
    callbackType: number,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.discordApi(
        "POST",
        `/interactions/${interaction.id}/${interaction.token}/callback`,
        { type: callbackType, data },
      );
    } catch (err) {
      console.warn("Agent Fleet: Discord interaction response failed", err);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Discord REST API + per-channel send queue
  // ═══════════════════════════════════════════════════════

  private async discordApi<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await requestUrl({
      url: `${DISCORD_API}${path}`,
      method,
      contentType: "application/json",
      headers: {
        Authorization: `Bot ${this.credential.botToken}`,
        "User-Agent": DISCORD_USER_AGENT,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      // Handle statuses ourselves so we can honor retry_after on 429.
      throw: false,
    });

    if (res.status === 429) {
      const retryAfter = (res.json as { retry_after?: number } | undefined)?.retry_after
        ?? Number(res.headers["retry-after"] ?? "1");
      await new Promise((r) => window.setTimeout(r, Math.max(1000, retryAfter * 1000)));
      return this.discordApi<T>(method, path, body);
    }

    if (res.status === 401 || res.status === 403) {
      // Surface Discord's real reason (body carries `message` + numeric `code`,
      // e.g. 50001 Missing Access, 50007 Cannot send messages to this user,
      // 0 401:Unauthorized). Without it a 403 is unactionable.
      throw new Error(`Discord ${method} ${path} ${res.status}: ${describeDiscordError(res.text)}`);
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Discord ${method} ${path} HTTP ${res.status}: ${res.text}`);
    }

    // 204 No Content (e.g. typing, interaction callbacks) has no JSON body.
    if (res.status === 204) return undefined as T;
    return res.json as T;
  }

  /** Serialize sends per Discord channel id so a chunked reply stays under the
   *  per-channel rate limit. */
  private async enqueueSend(channel: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.sendQueues.get(channel) ?? Promise.resolve();
    const next = prev.then(fn);
    // `wrapped` keeps the per-channel chain alive (never rejects) so a failed send
    // doesn't poison the next one. But the CALLER must still see this send's failure
    // — otherwise delivery errors are invisible (the dashboard counts them as sent
    // and the channel status never reflects them). So await `next`, not `wrapped`.
    const wrapped = next.catch(() => { /* keep chain unrejected for the next send */ });
    this.sendQueues.set(channel, wrapped);
    try {
      await next;
    } finally {
      if (this.sendQueues.get(channel) === wrapped) {
        this.sendQueues.delete(channel);
      }
    }
  }

  private setStatus(next: ChannelStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const h of this.statusHandlers) {
      try { h(next); } catch { /* best-effort */ }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Discord types (minimal subset)
// ═══════════════════════════════════════════════════════

interface GatewayFrame {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
}

interface DiscordAttachment {
  id: string;
  filename: string;
  url: string;
  content_type?: string;
  size?: number;
}

interface DiscordMessage {
  id: string;
  channel_id?: string;
  guild_id?: string;
  author?: { id: string; bot?: boolean; username?: string };
  content?: string;
  timestamp?: string;
  attachments?: DiscordAttachment[];
}

interface DiscordInteraction {
  id: string;
  token: string;
  type: number;
  channel_id?: string;
  guild_id?: string;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: { name?: string; custom_id?: string; component_type?: number };
  message?: { id: string };
}

// ═══════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════

/**
 * Conversation id shape:
 *   guild message / thread: `discord:<guild_id>:<channel_id>`
 *   DM:                     `discord:dm:<channel_id>`
 * A thread is just another channel_id, so per-thread isolation is automatic.
 * The channel id is always the third segment in both forms.
 */
export function buildConversationId(guildId: string | undefined, channelId: string): string {
  return guildId ? `discord:${guildId}:${channelId}` : `discord:dm:${channelId}`;
}

export function channelIdFromConversationId(conversationId: string): string | null {
  const parts = conversationId.split(":");
  if (parts[0] !== "discord") return null;
  return parts[2] ?? null;
}

/** Strip a leading bot mention (`<@id>` or `<@!id>`) so the agent sees clean text. */
export function stripLeadingMention(content: string, selfUserId: string | null): string {
  let text = content.trimStart();
  if (selfUserId) {
    const mention = new RegExp(`^<@!?${selfUserId}>\\s*`);
    text = text.replace(mention, "");
  }
  return text.trim();
}

/** Extract Discord's human-readable error (`message` + `code`) from a response
 *  body, falling back to the raw text. Discord error bodies are JSON like
 *  `{"message":"Missing Access","code":50001}`. */
export function describeDiscordError(rawBody: string | undefined): string {
  const raw = rawBody ?? "";
  try {
    const j = JSON.parse(raw) as { message?: string; code?: number };
    if (j && (j.message !== undefined || j.code !== undefined)) {
      return `${j.message ?? "error"} (code ${j.code ?? "?"})`;
    }
  } catch {
    // not JSON — fall through to raw
  }
  return raw || "no body";
}

function splitText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cutAt = remaining.lastIndexOf("\n\n", limit);
    if (cutAt < limit / 2) cutAt = remaining.lastIndexOf("\n", limit);
    if (cutAt < limit / 2) cutAt = limit;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).replace(/^\n+/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
