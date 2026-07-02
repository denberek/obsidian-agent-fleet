import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig, MemorySection, WorkingMemory } from "../types";
import { appendEntries, emptyWorkingMemory } from "../utils/memoryFormat";
import { MemoryWriter, type MemoryStore } from "./memoryWriter";

// In-memory fake store. Async methods yield a microtask so concurrent capture
// calls genuinely race without the per-agent lock.
class FakeStore implements MemoryStore {
  working = new Map<string, WorkingMemory>();
  raw = new Map<string, string[]>();

  getWorkingMemoryPath(agentName: string): string {
    return `mem/${agentName}/working.md`;
  }
  async readWorkingMemory(agentName: string): Promise<WorkingMemory | null> {
    await Promise.resolve();
    return this.working.get(agentName) ?? null;
  }
  async writeWorkingMemory(agentName: string, wm: WorkingMemory): Promise<void> {
    await Promise.resolve();
    this.working.set(agentName, wm);
  }
  async appendRawMemory(agentName: string, lines: string[], dateIso: string): Promise<void> {
    await Promise.resolve();
    const key = `${agentName}:${dateIso.slice(0, 10)}`;
    this.raw.set(key, [...(this.raw.get(key) ?? []), ...lines]);
  }
  pending = new Map<string, string[]>();
  async readAndClearPending(agentName: string): Promise<string[]> {
    await Promise.resolve();
    const lines = this.pending.get(agentName) ?? [];
    this.pending.set(agentName, []);
    return lines;
  }
  migrated: string[] = [];
  async migrateLegacyMemory(agentName: string): Promise<void> {
    await Promise.resolve();
    this.migrated.push(agentName);
  }
  allRaw(agentName: string): string[] {
    return [...this.raw.entries()]
      .filter(([k]) => k.startsWith(`${agentName}:`))
      .flatMap(([, v]) => v);
  }
  entryTexts(agentName: string): string[] {
    return (this.working.get(agentName)?.sections ?? []).flatMap((s) => s.entries.map((e) => e.text));
  }
}

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return { name: "Agent A", memory: true, memoryTokenBudget: 1500, ...overrides } as unknown as AgentConfig;
}

describe("MemoryWriter", () => {
  beforeEach(() => MemoryWriter.__resetLocksForTest());

  it("captures to raw archive and working memory (Recent section)", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    await w.capture(agent(), [{ text: "user likes ISO dates" }], "chat:c1", "2026-06-13T14:00:00Z");

    expect(store.allRaw("Agent A")).toEqual(["- 2026-06-13T14:00:00Z [chat:c1] user likes ISO dates"]);
    const wm = store.working.get("Agent A");
    expect(wm?.sections[0]?.name).toBe("Recent");
    expect(wm?.sections[0]?.entries[0]).toMatchObject({
      text: "user likes ISO dates",
      source: "chat:c1",
      date: "2026-06-13",
      pinned: false,
    });
  });

  it("routes pinned entries with a [pin] marker into the raw line", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    await w.capture(
      agent(),
      [{ text: "always use Slack", pinned: true, section: "Preferences" }],
      "task:t1",
      "2026-06-13T09:00:00Z",
    );
    expect(store.allRaw("Agent A")[0]).toContain("[pin]");
    expect(store.working.get("Agent A")?.sections[0]?.name).toBe("Preferences");
  });

  it("routes a pinned capture with no explicit section into Preferences", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    await w.capture(agent(), [{ text: "always use ISO dates", pinned: true }], "mcp:chat", "2026-06-13T10:00:00Z");
    expect(store.working.get("Agent A")?.sections[0]?.name).toBe("Preferences");
    expect(store.entryTexts("Agent A")).toEqual(["always use ISO dates"]);
  });

  it("is a no-op when the agent has memory disabled", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    await w.capture(agent({ memory: false }), [{ text: "x" }], "chat", "2026-06-13T00:00:00Z");
    expect(store.working.size).toBe(0);
    expect(store.raw.size).toBe(0);
  });

  it("serializes concurrent captures via the per-agent lock (no lost update)", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    // Fire two without awaiting — without the lock both read null and one write is lost.
    await Promise.all([
      w.capture(agent(), [{ text: "fact one" }], "chat", "2026-06-13T10:00:00Z"),
      w.capture(agent(), [{ text: "fact two" }], "chat", "2026-06-13T10:00:01Z"),
    ]);
    expect(store.entryTexts("Agent A").sort()).toEqual(["fact one", "fact two"]);
    expect(store.allRaw("Agent A")).toHaveLength(2);
  });

  it("drainPending folds MCP-tool captures into working memory + raw", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    store.pending.set("Agent A", [
      JSON.stringify({ text: "tool fact one", pinned: false, source: "mcp", ts: "t" }),
      JSON.stringify({ text: "tool pref", pinned: true, section: "Preferences", source: "mcp", ts: "t" }),
      "  ", // blank line tolerated
      "{malformed", // malformed tolerated
    ]);
    await w.drainPending(agent(), "2026-06-13T18:00:00Z");
    expect(store.entryTexts("Agent A").sort()).toEqual(["tool fact one", "tool pref"]);
    expect(store.allRaw("Agent A")).toHaveLength(2);
    // Pending was cleared.
    expect(await store.readAndClearPending("Agent A")).toHaveLength(0);
  });

  it("serializes across SEPARATE MemoryWriter instances (shared static lock)", async () => {
    // This is the real-world bug: FleetRuntime and each ChatSession build their
    // own MemoryWriter. With an instance-local lock the two would race and lose
    // an update; the static lock makes them share one serialization domain.
    const store = new FakeStore();
    const fromRuntime = new MemoryWriter(store);
    const fromChat = new MemoryWriter(store);
    await Promise.all([
      fromRuntime.capture(agent(), [{ text: "task fact" }], "task", "2026-06-13T10:00:00Z"),
      fromChat.capture(agent(), [{ text: "chat fact" }], "chat:c1", "2026-06-13T10:00:01Z"),
    ]);
    expect(store.entryTexts("Agent A").sort()).toEqual(["chat fact", "task fact"]);
    expect(store.allRaw("Agent A")).toHaveLength(2);
  });

  it("does not duplicate a fact captured via both the tag and the MCP tool", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    await w.capture(agent(), [{ text: "use ISO dates" }], "chat", "2026-06-13T10:00:00Z");
    await w.capture(agent(), [{ text: "use ISO dates" }], "mcp:chat", "2026-06-13T10:00:05Z");
    expect(store.entryTexts("Agent A")).toEqual(["use ISO dates"]); // working deduped
    expect(store.allRaw("Agent A")).toHaveLength(2); // raw keeps every mention
  });

  it("reflect() with an empty memory block leaves working memory intact", async () => {
    const store = new FakeStore();
    let wm = emptyWorkingMemory("mem/Agent A/working.md", "Agent A");
    wm = appendEntries(wm, [{ text: "keep me", pinned: true }], "Preferences");
    store.working.set("Agent A", wm);
    const w = new MemoryWriter(store);
    const applied = await w.reflect(agent(), [{ name: "Observations", entries: [] }], "2026-06-14T03:00:00Z");
    expect(applied).toBe(false); // empty consolidation is a no-op
    expect(store.entryTexts("Agent A")).toEqual(["keep me"]); // untouched, pin preserved
  });

  it("reflect() carries forward a pinned preference the model dropped", async () => {
    const store = new FakeStore();
    let wm = emptyWorkingMemory("mem/Agent A/working.md", "Agent A");
    wm = appendEntries(wm, [{ text: "always Slack", pinned: true }], "Preferences");
    store.working.set("Agent A", wm);
    const w = new MemoryWriter(store);
    const sections: MemorySection[] = [
      { name: "Observations", entries: [{ text: "new obs", pinned: false }] },
    ];
    const applied = await w.reflect(agent(), sections, "2026-06-14T03:00:00Z");
    expect(applied).toBe(true);
    expect(store.entryTexts("Agent A")).toContain("always Slack"); // pin survived
    expect(store.entryTexts("Agent A")).toContain("new obs");
  });

  it("sanitizes a multi-line / over-long fact into one capped line", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    await w.capture(
      agent(),
      [{ text: "first line\n## a header\nthird line" }],
      "chat",
      "2026-06-13T10:00:00Z",
    );
    expect(store.entryTexts("Agent A")).toEqual(["first line ## a header third line"]);
    // The raw line is also single-line (no embedded newline corrupting the log).
    expect(store.allRaw("Agent A")[0]?.includes("\n")).toBe(false);
  });

  it("triggers legacy migration on first capture (no reload required)", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    await w.capture(agent(), [{ text: "a fact" }], "chat", "2026-06-13T10:00:00Z");
    expect(store.migrated).toEqual(["Agent A"]);
  });

  it("a hung store write does not wedge subsequent captures (lock slot times out)", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const store = new FakeStore();
      // First write hangs forever; later writes behave normally.
      let hangNext = true;
      const realWrite = store.writeWorkingMemory.bind(store);
      store.writeWorkingMemory = (name, wm) => {
        if (hangNext) {
          hangNext = false;
          return new Promise<void>(() => {}); // never settles
        }
        return realWrite(name, wm);
      };
      const w = new MemoryWriter(store);

      // Fire-and-forget, mirroring how ChatSession invokes capture. This one
      // wedges inside writeWorkingMemory and never settles.
      void w.capture(agent(), [{ text: "stuck fact" }], "chat", "2026-06-13T10:00:00Z");
      // Let the first task reach the hung write before queuing the second.
      await vi.advanceTimersByTimeAsync(0);

      const second = w.capture(agent(), [{ text: "later fact" }], "chat", "2026-06-13T10:00:01Z");
      // Nothing moves until the stuck task's lock slot times out.
      await vi.advanceTimersByTimeAsync(9_999);
      expect(store.entryTexts("Agent A")).toEqual([]);

      await vi.advanceTimersByTimeAsync(10_000);
      await second;
      expect(store.entryTexts("Agent A")).toContain("later fact");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("releasing its lock slot"));
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("enforces the hard cap, spilling oldest entries to raw-only", async () => {
    const store = new FakeStore();
    const w = new MemoryWriter(store);
    // Tiny budget → hard cap ~30 tokens (~120 chars). Capture many entries.
    const a = agent({ memoryTokenBudget: 20 });
    for (let i = 0; i < 30; i++) {
      await w.capture(a, [{ text: `observation number ${i} with some length` }], "task", "2026-06-13T12:00:00Z");
    }
    const wm = store.working.get("Agent A");
    expect(wm).toBeTruthy();
    // Working memory stayed bounded ...
    expect(wm!.tokenEstimate).toBeLessThanOrEqual(Math.ceil(20 * 1.5));
    // ... but the raw archive retains every captured fact.
    expect(store.allRaw("Agent A")).toHaveLength(30);
  });
});
