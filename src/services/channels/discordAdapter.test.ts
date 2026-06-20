import { describe, expect, it, vi } from "vitest";

// The adapter's only runtime obsidian dependency is requestUrl — mock it so we can
// assert the outbound REST request shape (headers/url) without a network call.
const { requestUrlMock } = vi.hoisted(() => ({ requestUrlMock: vi.fn() }));
vi.mock("obsidian", () => ({ requestUrl: requestUrlMock }));

import {
  DiscordAdapter,
  buildConversationId,
  channelIdFromConversationId,
  describeDiscordError,
  stripLeadingMention,
} from "./discordAdapter";
import type { ChannelConfig, ChannelCredentialEntry } from "../../types";
import type { InboundMessage } from "./adapter";

function makeChannel(overrides: Partial<ChannelConfig> = {}): ChannelConfig {
  return {
    filePath: "_fleet/channels/test-discord.md",
    name: "test-discord",
    type: "discord",
    defaultAgent: "test-agent",
    allowedAgents: [],
    enabled: true,
    credentialRef: "discord-creds",
    allowedUsers: [],
    perUserSessions: true,
    channelContext: "",
    transport: {},
    tags: [],
    body: "",
    ...overrides,
  };
}

const credential: ChannelCredentialEntry = { type: "discord", botToken: "test-token" };

/** Typed view into the adapter's internals for testing the inbound mapping. */
interface AdapterInternals {
  selfUserId: string | null;
  routeMessage(message: unknown): void;
}

function internals(adapter: DiscordAdapter): AdapterInternals {
  return adapter as unknown as AdapterInternals;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("conversationId helpers", () => {
  it("builds and parses guild conversation ids", () => {
    const id = buildConversationId("guild1", "chan1");
    expect(id).toBe("discord:guild1:chan1");
    expect(channelIdFromConversationId(id)).toBe("chan1");
  });

  it("builds and parses DM conversation ids", () => {
    const id = buildConversationId(undefined, "dmchan");
    expect(id).toBe("discord:dm:dmchan");
    expect(channelIdFromConversationId(id)).toBe("dmchan");
  });

  it("treats a thread as just another channel id", () => {
    // A thread message arrives with channel_id = the thread's id.
    const id = buildConversationId("guild1", "thread99");
    expect(channelIdFromConversationId(id)).toBe("thread99");
  });

  it("returns null for non-discord conversation ids", () => {
    expect(channelIdFromConversationId("tg:123")).toBeNull();
    expect(channelIdFromConversationId("slack:t:c:thread:1")).toBeNull();
  });
});

describe("stripLeadingMention", () => {
  it("strips a leading <@id> mention", () => {
    expect(stripLeadingMention("<@123> hello there", "123")).toBe("hello there");
  });

  it("strips a leading <@!id> nickname mention", () => {
    expect(stripLeadingMention("<@!123>   hi", "123")).toBe("hi");
  });

  it("ignores mentions of other users", () => {
    expect(stripLeadingMention("<@999> hi", "123")).toBe("<@999> hi");
  });

  it("trims surrounding whitespace and handles no mention", () => {
    expect(stripLeadingMention("  plain text  ", "123")).toBe("plain text");
    expect(stripLeadingMention("plain", null)).toBe("plain");
  });
});

describe("MESSAGE_CREATE → InboundMessage mapping", () => {
  it("emits an InboundMessage for a normal guild message", async () => {
    const adapter = new DiscordAdapter(makeChannel(), credential);
    internals(adapter).selfUserId = "bot-self";
    const received: InboundMessage[] = [];
    adapter.onInbound((m) => received.push(m));

    internals(adapter).routeMessage({
      id: "msg1",
      channel_id: "chan1",
      guild_id: "guild1",
      author: { id: "user1", bot: false },
      content: "<@bot-self> do the thing",
      timestamp: "2026-06-19T00:00:00.000Z",
    });
    await flush();

    expect(received).toHaveLength(1);
    const msg = received[0]!;
    expect(msg.conversationId).toBe("discord:guild1:chan1");
    expect(msg.externalUserId).toBe("user1");
    expect(msg.text).toBe("do the thing");
    expect(msg.meta).toMatchObject({
      discord_channel_id: "chan1",
      discord_guild_id: "guild1",
      is_dm: false,
    });
  });

  it("marks DMs with is_dm and a discord:dm: conversation id", async () => {
    const adapter = new DiscordAdapter(makeChannel(), credential);
    internals(adapter).selfUserId = "bot-self";
    const received: InboundMessage[] = [];
    adapter.onInbound((m) => received.push(m));

    internals(adapter).routeMessage({
      id: "msg2",
      channel_id: "dmchan",
      author: { id: "user2", bot: false },
      content: "hi",
      timestamp: "2026-06-19T00:00:00.000Z",
    });
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0]!.conversationId).toBe("discord:dm:dmchan");
    expect(received[0]!.meta).toMatchObject({ is_dm: true });
  });

  it("ignores bot-authored and self-authored messages", async () => {
    const adapter = new DiscordAdapter(makeChannel(), credential);
    internals(adapter).selfUserId = "bot-self";
    const received: InboundMessage[] = [];
    adapter.onInbound((m) => received.push(m));

    internals(adapter).routeMessage({
      id: "m3", channel_id: "c", guild_id: "g",
      author: { id: "other-bot", bot: true }, content: "beep",
    });
    internals(adapter).routeMessage({
      id: "m4", channel_id: "c", guild_id: "g",
      author: { id: "bot-self", bot: false }, content: "echo",
    });
    await flush();

    expect(received).toHaveLength(0);
  });

  it("ignores empty-content messages with no attachments", async () => {
    const adapter = new DiscordAdapter(makeChannel(), credential);
    internals(adapter).selfUserId = "bot-self";
    const received: InboundMessage[] = [];
    adapter.onInbound((m) => received.push(m));

    internals(adapter).routeMessage({
      id: "m5", channel_id: "c", guild_id: "g",
      author: { id: "user1", bot: false }, content: "",
    });
    await flush();

    expect(received).toHaveLength(0);
  });

  it("rejects a non-discord credential", () => {
    expect(
      () => new DiscordAdapter(makeChannel(), { type: "telegram", botToken: "x" }),
    ).toThrow(/discord credential/);
  });
});

describe("REST request shape", () => {
  it("sends the required Discord User-Agent + bot auth on outbound calls", async () => {
    // Regression guard: a missing User-Agent gets Cloudflare-blocked (403 code 40333)
    // on every REST call while the Gateway still connects.
    requestUrlMock.mockReset();
    requestUrlMock.mockResolvedValue({ status: 200, json: {}, text: "" });

    const adapter = new DiscordAdapter(makeChannel(), credential);
    await adapter.send("discord:dm:chan1", "hello");

    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    const opts = requestUrlMock.mock.calls[0]![0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
    };
    expect(opts.url).toContain("/channels/chan1/messages");
    expect(opts.method).toBe("POST");
    expect(opts.headers["User-Agent"]).toMatch(/^DiscordBot \(/);
    expect(opts.headers.Authorization).toBe("Bot test-token");
    expect(opts.body).toContain("hello");
  });

  it("sendToTarget posts directly to the given channel id", async () => {
    requestUrlMock.mockReset();
    requestUrlMock.mockResolvedValue({ status: 200, json: {}, text: "" });

    const adapter = new DiscordAdapter(makeChannel(), credential);
    await adapter.sendToTarget("987654321", "task result");

    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    const opts = requestUrlMock.mock.calls[0]![0] as { url: string; body?: string };
    expect(opts.url).toContain("/channels/987654321/messages");
    expect(opts.body).toContain("task result");
  });
});

describe("describeDiscordError", () => {
  it("extracts Discord's message + code from a JSON error body", () => {
    expect(describeDiscordError('{"message":"internal network error","code":40333}'))
      .toBe("internal network error (code 40333)");
    expect(describeDiscordError('{"message":"Missing Access","code":50001}'))
      .toBe("Missing Access (code 50001)");
  });

  it("falls back to raw text for non-JSON bodies", () => {
    expect(describeDiscordError("Bad Gateway")).toBe("Bad Gateway");
    expect(describeDiscordError("")).toBe("no body");
    expect(describeDiscordError(undefined)).toBe("no body");
  });
});
