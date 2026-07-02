import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "../types";
import { ConversationStore } from "./conversationStore";
import { FakeVault, makeApp } from "./testSupport";

function agent(overrides: Partial<AgentConfig>): AgentConfig {
  return {
    filePath: "_fleet/agents/bot.md",
    name: "bot",
    model: "sonnet",
    adapter: "claude-code",
    permissionMode: "bypassPermissions",
    maxRetries: 1,
    skills: [],
    mcpServers: [],
    enabled: true,
    timeout: 300,
    approvalRequired: [],
    memory: false,
    memoryMaxEntries: 100,
    memoryTokenBudget: 2000,
    reflection: {
      enabled: false,
      schedule: "0 3 * * *",
      recurrenceThreshold: 3,
      proposeSkills: false,
      model: undefined,
    },
    autoCompactThreshold: 85,
    tags: [],
    avatar: "",
    body: "",
    contextBody: "",
    skillsBody: "",
    env: {},
    permissionRules: { allow: [], deny: [] },
    isFolder: false,
    heartbeatEnabled: false,
    heartbeatSchedule: "",
    heartbeatBody: "",
    heartbeatNotify: true,
    heartbeatChannel: "",
    heartbeatChannelTarget: "",
    ...overrides,
  } as AgentConfig;
}

describe("ConversationStore", () => {
  let vault: FakeVault;
  let store: ConversationStore;

  beforeEach(() => {
    vault = new FakeVault();
    store = new ConversationStore(
      makeApp(vault),
      (name) => `_fleet/memory/${name}.md`,
    );
  });

  it("flat agents park conversations beside the memory dir; folder agents nest in their folder", async () => {
    await store.createConversation(agent({}), "chat-1", "First");
    expect(vault.files.has("_fleet/memory/bot-conversations/chat-1.json")).toBe(true);

    const folderAgent = agent({ isFolder: true, filePath: "_fleet/agents/bot/agent.md" });
    await store.createConversation(folderAgent, "chat-1", "First");
    expect(vault.files.has("_fleet/agents/bot/conversations/chat-1.json")).toBe(true);
  });

  it("createConversation is idempotent — an existing file is left alone", async () => {
    const a = agent({});
    await store.createConversation(a, "chat-1", "Original");
    const before = vault.contents.get("_fleet/memory/bot-conversations/chat-1.json");
    await store.createConversation(a, "chat-1", "Renamed attempt");
    expect(vault.contents.get("_fleet/memory/bot-conversations/chat-1.json")).toBe(before);
  });

  it("lists conversations sorted by lastActive desc, skipping unreadable files", async () => {
    const a = agent({});
    const dir = "_fleet/memory/bot-conversations";
    vault.addFile(`${dir}/old.json`, JSON.stringify({ name: "Old", lastActive: "2026-01-01T00:00:00Z", messages: [1] }));
    vault.addFile(`${dir}/new.json`, JSON.stringify({ name: "New", lastActive: "2026-07-01T00:00:00Z", messages: [] }));
    vault.addFile(`${dir}/broken.json`, "{not json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const list = await store.listConversations(a);

    expect(list.map((c) => c.id)).toEqual(["new", "old"]);
    expect(list[0]?.messageCount).toBe(0);
    expect(list[1]?.messageCount).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("renameConversation rewrites the name field", async () => {
    const a = agent({});
    await store.createConversation(a, "chat-1", "Before");
    await store.renameConversation(a, "chat-1", "After");
    const state = JSON.parse(vault.contents.get("_fleet/memory/bot-conversations/chat-1.json") ?? "{}") as {
      name?: string;
    };
    expect(state.name).toBe("After");
  });

  it("deleteConversation trashes the file and the parent folder once empty", async () => {
    const a = agent({});
    await store.createConversation(a, "chat-1", "Only");
    await store.deleteConversation(a, "chat-1");
    expect(vault.files.has("_fleet/memory/bot-conversations/chat-1.json")).toBe(false);
    expect(vault.folders.has("_fleet/memory/bot-conversations")).toBe(false);
  });
});
