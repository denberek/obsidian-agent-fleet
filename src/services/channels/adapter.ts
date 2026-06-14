import type { ChannelConfig, ChannelStatus, ChannelType } from "../../types";

/** An image attachment downloaded from the transport, ready to be saved to the vault. */
export interface InboundImage {
  /** Raw image bytes. */
  data: ArrayBuffer;
  /** Suggested filename (e.g. "photo_123456.jpg"). */
  filename: string;
  /** MIME type (e.g. "image/jpeg"). */
  mimeType: string;
}

/**
 * An inbound chat message flowing from an external transport (Slack, Telegram, etc.)
 * into the ChannelManager. The `conversationId` is transport-opaque — only the
 * originating adapter knows how to parse it back into transport-specific ids for
 * reply delivery.
 *
 * `externalUserId` MUST come from a transport-verified field (e.g. `event.user`
 * on a signed Slack Socket Mode envelope). Adapters must never copy it from a
 * user-controlled body field — the allowlist check depends on this invariant.
 */
export interface InboundMessage {
  conversationId: string;
  externalUserId: string;
  /** Plain-text message body, with any transport-specific markup already stripped. */
  text: string;
  /** ISO-8601 timestamp of when the message was received. */
  timestamp: string;
  /** Arbitrary transport-specific metadata (e.g. Slack thread_ts, Telegram chat type). */
  meta?: Record<string, unknown>;
  /** Image attachments downloaded from the transport (e.g. Telegram photos). */
  images?: InboundImage[];
}

export type InboundHandler = (msg: InboundMessage) => void;
export type StatusHandler = (status: ChannelStatus) => void;

/**
 * Transport-agnostic adapter interface. All transport-specific logic lives behind
 * this surface; ChannelManager has no knowledge of Slack/Telegram/Discord internals.
 *
 * Lifecycle:
 *   1. ChannelManager instantiates an adapter with a `ChannelConfig` + credentials
 *   2. Calls `start()` — adapter connects to the transport (WebSocket, long-poll, etc.)
 *   3. Adapter emits `onInbound` events for every verified, non-self message
 *   4. ChannelManager routes inbound messages through per-conversation locks + ChatSessions
 *   5. ChannelManager calls `send()` to post replies back through the adapter
 *   6. On reconcile or plugin unload, ChannelManager calls `stop()`
 */
export interface ChannelAdapter {
  readonly config: ChannelConfig;
  readonly type: ChannelType;

  start(): Promise<void>;
  stop(): Promise<void>;

  /** Sync getter so views can render current state without waiting for an event. */
  getStatus(): ChannelStatus;

  /**
   * Deliver a reply to the given conversation. The conversationId is the same
   * opaque string the adapter emitted in `InboundMessage.conversationId`.
   * Adapters should serialize sends per conversation (rate limits).
   */
  send(conversationId: string, text: string): Promise<void>;

  /**
   * Set a "thinking" indicator for the given conversation (e.g. Slack hourglass
   * reaction on the user's last message, Telegram sendChatAction). Called by
   * ChannelManager at turn start and turn end.
   */
  setTyping(conversationId: string, on: boolean): Promise<void>;

  /**
   * Set the thread title in the transport UI (e.g. Slack's
   * `assistant.threads.setTitle`). Used to show which agent is active in each
   * thread. Optional — transports that don't support it can omit or no-op.
   */
  setThreadTitle?(conversationId: string, title: string): Promise<void>;

  /**
   * Post a message to the channel's default destination without an existing
   * conversation context. Used for heartbeat result delivery. For Slack, this
   * opens a DM with the first allowed user and posts there.
   * Optional — transports that don't support broadcast can omit.
   */
  broadcast?(text: string): Promise<void>;

  onInbound(handler: InboundHandler): () => void;
  onStatusChange(handler: StatusHandler): () => void;

  /**
   * Callback for agent-switch requests initiated from the transport UI
   * (e.g. Slack Block Kit button click from /agents). The manager handles
   * the binding update + confirmation delivery. Optional.
   */
  onAgentSwitch?(handler: (conversationId: string, agentName: string, userId: string) => void): () => void;

  /**
   * Supply a resolver for the agents this channel may switch to, already
   * filtered to agents that actually exist and are enabled. Adapters use it to
   * build the `/agents` picker so stale/typo'd/disabled names in `allowed_agents`
   * don't appear. Optional; if unset, adapters fall back to raw `allowed_agents`.
   */
  setAllowedAgentsResolver?(resolve: () => string[]): void;
}
