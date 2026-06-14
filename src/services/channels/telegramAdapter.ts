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
 * Telegram Bot API adapter using long-polling (getUpdates).
 *
 * Zero dependencies beyond Obsidian's requestUrl. No WebSocket, no SDK.
 * Works behind NAT — all requests are outbound HTTPS.
 *
 * Security: Telegram's getUpdates endpoint is authenticated by the bot token
 * in the URL. The `from.id` field in messages is verified by Telegram's servers.
 */

interface TelegramCredential {
  type: "telegram";
  botToken: string;
}

const TG_API = "https://api.telegram.org";

export class TelegramAdapter implements ChannelAdapter {
  readonly type: ChannelType = "telegram";
  public config: ChannelConfig;

  private readonly credential: TelegramCredential;
  private status: ChannelStatus = "stopped";
  private stopping = false;
  private pollOffset = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = 1000;
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  /** AbortController for the current long-poll request — lets stop() cancel a 30s wait. */
  private pollAbort: AbortController | null = null;

  private readonly inboundHandlers = new Set<InboundHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private readonly agentSwitchHandlers = new Set<(conversationId: string, agentName: string, userId: string) => void>();
  /** Resolver for the validated (existing + enabled) agent list, set by the
   *  ChannelManager. Falls back to raw allowed_agents when unset. */
  private allowedAgentsResolver?: () => string[];

  constructor(config: ChannelConfig, credential: ChannelCredentialEntry) {
    if (credential.type !== "telegram") {
      throw new Error(`TelegramAdapter requires a telegram credential, got ${credential.type}`);
    }
    this.config = config;
    this.credential = credential;
  }

  // ═══════════════════════════════════════════════════════
  //  Lifecycle
  // ═══════════════════════════════════════════════════════

  async start(): Promise<void> {
    this.stopping = false;
    // Skip old messages by getting updates with a large offset first
    try {
      const resp = await this.tgApi<{ result: Array<{ update_id: number }> }>("getUpdates", {
        offset: -1,
        limit: 1,
      });
      const last = resp.result?.[0];
      if (last) {
        this.pollOffset = last.update_id + 1;
      }
    } catch {
      // If this fails, we'll just process from wherever we are
    }

    // Register slash commands for autocomplete
    try {
      await this.tgApi("setMyCommands", {
        commands: [
          { command: "agents", description: "List available agents" },
        ],
      });
    } catch {
      // best-effort — bot may not have permission in some contexts
    }

    this.setStatus("connected");
    this.poll();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    // Abort any in-flight long-poll request so stop() doesn't wait 30s.
    this.pollAbort?.abort();
    this.pollAbort = null;
    for (const [, interval] of this.typingIntervals) {
      clearInterval(interval);
    }
    this.typingIntervals.clear();
    this.setStatus("stopped");
  }

  getStatus(): ChannelStatus {
    return this.status;
  }

  // ═══════════════════════════════════════════════════════
  //  Outbound
  // ═══════════════════════════════════════════════════════

  async send(conversationId: string, text: string): Promise<void> {
    const chatId = chatIdFromConversationId(conversationId);
    if (!chatId) return;
    const threadId = threadIdFromConversationId(conversationId);
    // Split long messages (Telegram limit: 4096 chars)
    const chunks = splitText(text, 4096);
    for (const chunk of chunks) {
      await this.tgApi("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
        ...(threadId ? { message_thread_id: Number(threadId) } : {}),
      });
    }
  }

  async setTyping(conversationId: string, on: boolean): Promise<void> {
    const chatId = chatIdFromConversationId(conversationId);
    if (!chatId) return;
    const threadId = threadIdFromConversationId(conversationId);
    const params: Record<string, unknown> = { chat_id: chatId, action: "typing" };
    if (threadId) params.message_thread_id = Number(threadId);

    if (on) {
      // Clear any existing interval first to prevent double-create leak
      const existing = this.typingIntervals.get(conversationId);
      if (existing) clearInterval(existing);
      // Send immediately (awaited) and refresh every 4.5s (Telegram typing expires after 5s)
      try {
        await this.tgApi("sendChatAction", params);
      } catch (err) {
        console.warn("Agent Fleet: Telegram sendChatAction failed", err);
      }
      const interval = setInterval(() => {
        void this.tgApi("sendChatAction", params).catch(() => { /* best-effort */ });
      }, 4500);
      this.typingIntervals.set(conversationId, interval);
    } else {
      const interval = this.typingIntervals.get(conversationId);
      if (interval) {
        clearInterval(interval);
        this.typingIntervals.delete(conversationId);
      }
    }
  }

  async setThreadTitle(_conversationId: string, _title: string): Promise<void> {
    // Telegram doesn't have thread titles — no-op
  }

  async broadcast(text: string): Promise<void> {
    // Post to the first allowed user
    const userId = this.config.allowedUsers[0];
    if (!userId) return;
    try {
      const chunks = splitText(text, 4096);
      for (const chunk of chunks) {
        await this.tgApi("sendMessage", {
          chat_id: userId,
          text: chunk,
          parse_mode: "Markdown",
        });
      }
    } catch (err) {
      console.error(`Agent Fleet: Telegram broadcast failed on ${this.config.name}`, err);
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

  /** The agents the picker should offer: validated list if available, else the
   *  raw configured allow-list. */
  private pickerAgents(): string[] {
    if (this.allowedAgentsResolver) return this.allowedAgentsResolver();
    return this.config.allowedAgents;
  }

  onAgentSwitch(handler: (conversationId: string, agentName: string, userId: string) => void): () => void {
    this.agentSwitchHandlers.add(handler);
    return () => this.agentSwitchHandlers.delete(handler);
  }

  // ═══════════════════════════════════════════════════════
  //  Long-polling loop
  // ═══════════════════════════════════════════════════════

  private poll(): void {
    if (this.stopping) return;

    void (async () => {
      try {
        this.pollAbort = new AbortController();
        const resp = await this.tgApi<{
          ok: boolean;
          result: Array<{
            update_id: number;
            message?: TelegramMessage;
            callback_query?: TelegramCallbackQuery;
          }>;
        }>("getUpdates", {
          offset: this.pollOffset,
          timeout: 30, // Long-poll: Telegram holds the connection for 30s
          allowed_updates: ["message", "callback_query"],
        }, this.pollAbort.signal);

        if (resp.ok && resp.result) {
          for (const update of resp.result) {
            this.pollOffset = update.update_id + 1;

            if (update.callback_query) {
              void this.handleCallbackQuery(update.callback_query);
              continue;
            }

            if (update.message) {
              this.routeMessage(update.message);
            }
          }
        }

        this.backoffMs = 1000; // Reset on success
        if (this.status !== "connected") this.setStatus("connected");
      } catch (err) {
        // Abort errors from stop() are expected — don't log or backoff
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.warn(`Agent Fleet: Telegram poll failed on ${this.config.name}`, err);
        if (this.status !== "error" && this.status !== "needs-auth") {
          const msg = err instanceof Error ? err.message : String(err);
          this.setStatus(msg.includes("401") || msg.includes("Unauthorized") ? "needs-auth" : "error");
        }
        // Backoff
        await new Promise((r) => setTimeout(r, this.backoffMs));
        this.backoffMs = Math.min(30_000, this.backoffMs * 2);
      }

      // Schedule next poll
      if (!this.stopping) {
        this.pollTimer = setTimeout(() => this.poll(), 100);
      }
    })();
  }

  private routeMessage(message: TelegramMessage): void {
    const hasPhoto = message.photo && message.photo.length > 0;
    const hasDocument = message.document && this.isImageMime(message.document.mime_type);
    const hasText = !!message.text;

    // Must have text, photo, or image document — and a sender
    if (!message.from || (!hasText && !hasPhoto && !hasDocument)) return;

    // Text-only message body (photo messages use caption instead of text)
    const textBody = message.text ?? message.caption ?? "";

    // Handle /agents command
    if (textBody === "/agents" || textBody.startsWith("/agents@")) {
      void this.handleAgentsCommand(message);
      return;
    }

    // Skip other bot commands
    if (textBody.startsWith("/")) return;

    const userId = String(message.from.id);
    const chatId = String(message.chat.id);
    const threadId = message.message_thread_id ? String(message.message_thread_id) : undefined;
    // Include topic thread ID in the conversation key so each forum topic
    // gets its own isolated session — different topics can use different agents.
    const conversationId = threadId ? `tg:${chatId}:topic:${threadId}` : `tg:${chatId}`;

    // Download images asynchronously, then emit
    void this.buildAndEmitMessage(message, textBody, conversationId, userId, chatId, threadId);
  }

  private async buildAndEmitMessage(
    message: TelegramMessage,
    textBody: string,
    conversationId: string,
    userId: string,
    chatId: string,
    threadId: string | undefined,
  ): Promise<void> {
    const images: InboundImage[] = [];

    try {
      if (message.photo && message.photo.length > 0) {
        // Telegram sends multiple sizes — pick the largest (last in array)
        const largest = message.photo[message.photo.length - 1]!;
        const downloaded = await this.downloadFile(largest.file_id, `photo_${message.message_id}.jpg`, "image/jpeg");
        if (downloaded) images.push(downloaded);
      }

      if (message.document && this.isImageMime(message.document.mime_type)) {
        const filename = message.document.file_name ?? `doc_${message.message_id}`;
        const mime = message.document.mime_type ?? "image/jpeg";
        const downloaded = await this.downloadFile(message.document.file_id, filename, mime);
        if (downloaded) images.push(downloaded);
      }
    } catch (err) {
      console.warn("Agent Fleet: Telegram image download failed", err);
    }

    const msg: InboundMessage = {
      conversationId,
      externalUserId: userId,
      text: textBody,
      timestamp: new Date(message.date * 1000).toISOString(),
      meta: {
        telegram_chat_id: chatId,
        telegram_message_id: message.message_id,
        telegram_thread_id: threadId,
        chat_type: message.chat.type,
      },
      ...(images.length > 0 ? { images } : {}),
    };

    for (const handler of this.inboundHandlers) {
      try {
        handler(msg);
      } catch (err) {
        console.error("Agent Fleet: Telegram inbound handler threw", err);
      }
    }
  }

  private async downloadFile(fileId: string, filename: string, mimeType: string): Promise<InboundImage | null> {
    // Step 1: Get file path from Telegram
    const fileInfo = await this.tgApi<{ ok: boolean; result: { file_path?: string } }>("getFile", { file_id: fileId });
    const filePath = fileInfo.result?.file_path;
    if (!filePath) return null;

    // Step 2: Download the file bytes
    const url = `${TG_API}/file/bot${this.credential.botToken}/${filePath}`;
    const resp = await requestUrl({ url, method: "GET" });
    return { data: resp.arrayBuffer, filename, mimeType };
  }

  private isImageMime(mime: string | undefined): boolean {
    if (!mime) return false;
    return mime === "image/jpeg" || mime === "image/png" || mime === "image/gif"
      || mime === "image/webp" || mime === "image/bmp" || mime === "image/tiff";
  }

  // ═══════════════════════════════════════════════════════
  //  /agents command — inline keyboard buttons
  // ═══════════════════════════════════════════════════════

  private async handleAgentsCommand(message: TelegramMessage): Promise<void> {
    const chatId = String(message.chat.id);
    const threadId = message.message_thread_id;
    const agents = this.pickerAgents();

    if (agents.length === 0) {
      await this.tgApi("sendMessage", {
        chat_id: chatId,
        text: "No agents available. Add existing, enabled agents to `allowed_agents` in the channel file.",
        ...(threadId ? { message_thread_id: threadId } : {}),
      });
      return;
    }

    // Build inline keyboard — one button per row for readability
    const keyboard = agents.map((name) => ([{
      text: name === this.config.defaultAgent ? `${name} ✓` : name,
      callback_data: `switch:${name}`,
    }]));

    await this.tgApi("sendMessage", {
      chat_id: chatId,
      text: "*Select an agent to chat with:*",
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
      ...(threadId ? { message_thread_id: threadId } : {}),
    });
  }

  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const data = query.data;
    if (!data?.startsWith("switch:")) {
      // Acknowledge unknown callbacks
      await this.tgApi("answerCallbackQuery", { callback_query_id: query.id });
      return;
    }

    const agentName = data.slice("switch:".length);
    const userId = String(query.from.id);
    const chatId = String(query.message?.chat?.id ?? query.from.id);
    const threadId = query.message?.message_thread_id ? String(query.message.message_thread_id) : undefined;
    const conversationId = threadId ? `tg:${chatId}:topic:${threadId}` : `tg:${chatId}`;

    // Notify ChannelManager of the binding change
    for (const handler of this.agentSwitchHandlers) {
      try {
        handler(conversationId, agentName, userId);
      } catch (err) {
        console.error("Agent Fleet: Telegram agent switch handler threw", err);
      }
    }

    // Answer the callback (removes the "loading" spinner on the button)
    await this.tgApi("answerCallbackQuery", {
      callback_query_id: query.id,
      text: `Switched to ${agentName}`,
    });

    // Update the original message to show the selection
    if (query.message) {
      const agents = this.pickerAgents();
      const keyboard = agents.map((name) => ([{
        text: name === agentName ? `${name} ✓` : name,
        callback_data: `switch:${name}`,
      }]));

      try {
        await this.tgApi("editMessageText", {
          chat_id: chatId,
          message_id: query.message.message_id,
          text: `*Active agent: ${agentName}*`,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: keyboard },
        });
      } catch {
        // Message might be too old to edit — that's fine
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Telegram Bot API
  // ═══════════════════════════════════════════════════════

  private async tgApi<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    // Check for abort before making the request
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const url = `${TG_API}/bot${this.credential.botToken}/${method}`;
    const requestPromise = requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(params),
      throw: false,
    });

    // If an abort signal is provided, race the request against the abort.
    // requestUrl doesn't natively support AbortSignal, so we reject on abort.
    let res: Awaited<typeof requestPromise>;
    if (signal) {
      res = await Promise.race([
        requestPromise,
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        }),
      ]);
    } else {
      res = await requestPromise;
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Telegram ${method} ${res.status} Unauthorized`);
    }

    if (res.status === 429) {
      const retryAfter = (res.json as Record<string, unknown>)?.parameters as
        { retry_after?: number } | undefined;
      const wait = retryAfter?.retry_after ?? 1;
      await new Promise((r) => setTimeout(r, wait * 1000));
      return this.tgApi<T>(method, params);
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`Telegram ${method} HTTP ${res.status}: ${res.text}`);
    }

    return res.json as T;
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
//  Telegram types (minimal subset)
// ═══════════════════════════════════════════════════════

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
  chat: { id: number; type: string; is_forum?: boolean };
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  is_topic_message?: boolean;
}

interface TelegramCallbackQuery {
  id: string;
  from: { id: number };
  message?: TelegramMessage;
  data?: string;
}

// ═══════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════

function chatIdFromConversationId(conversationId: string): string | null {
  // tg:<chat_id> or tg:<chat_id>:topic:<thread_id>
  if (!conversationId.startsWith("tg:")) return null;
  const parts = conversationId.split(":");
  return parts[1] ?? null;
}

function threadIdFromConversationId(conversationId: string): string | undefined {
  // tg:<chat_id>:topic:<thread_id>
  const parts = conversationId.split(":");
  if (parts[2] === "topic" && parts[3]) return parts[3];
  return undefined;
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
