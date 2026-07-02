import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type { UsageRecord } from "../types";
import { UsageLedger } from "./usageLedger";

/** Adapter-level fake — the ledger goes through vault.adapter, not TFiles. */
class FakeAdapterVault {
  data = new Map<string, string>();

  adapter = {
    exists: async (p: string): Promise<boolean> =>
      this.data.has(p) || [...this.data.keys()].some((k) => k.startsWith(`${p}/`)),
    list: async (p: string) => ({
      files: [...this.data.keys()].filter(
        (k) => k.startsWith(`${p}/`) && !k.slice(p.length + 1).includes("/"),
      ),
      folders: [] as string[],
    }),
    read: async (p: string): Promise<string> => {
      const c = this.data.get(p);
      if (c === undefined) throw new Error(`missing: ${p}`);
      return c;
    },
    write: async (p: string, c: string): Promise<void> => {
      this.data.set(p, c);
    },
    append: async (p: string, c: string): Promise<void> => {
      this.data.set(p, (this.data.get(p) ?? "") + c);
    },
  };

  getAbstractFileByPath(_path: string): null {
    return null;
  }

  async createFolder(_path: string): Promise<void> {
    /* folders are implicit in the adapter fake */
  }
}

function record(ts: string, agent = "bot"): UsageRecord {
  return { ts, agent, source: "chat", tokensUsed: 10 } as unknown as UsageRecord;
}

describe("UsageLedger", () => {
  let vault: FakeAdapterVault;
  let ledger: UsageLedger;

  beforeEach(() => {
    vault = new FakeAdapterVault();
    ledger = new UsageLedger({ vault } as unknown as App, () => "_fleet/usage");
  });

  it("appends one JSONL line per record into the day's file", async () => {
    await ledger.appendUsage(record("2026-07-01T10:00:00Z"));
    await ledger.appendUsage(record("2026-07-01T11:00:00Z"));
    await ledger.appendUsage(record("2026-07-02T09:00:00Z"));

    const day1 = vault.data.get("_fleet/usage/2026-07-01.jsonl") ?? "";
    expect(day1.trim().split("\n")).toHaveLength(2);
    expect(vault.data.has("_fleet/usage/2026-07-02.jsonl")).toBe(true);
  });

  it("readUsageSince filters by ledger file date and skips corrupt lines", async () => {
    vault.data.set("_fleet/usage/2026-06-01.jsonl", `${JSON.stringify(record("2026-06-01T00:00:00Z"))}\n`);
    vault.data.set(
      "_fleet/usage/2026-07-01.jsonl",
      `${JSON.stringify(record("2026-07-01T00:00:00Z"))}\n{corrupt\n${JSON.stringify(record("2026-07-01T01:00:00Z"))}\n`,
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const out = await ledger.readUsageSince(new Date("2026-06-15T00:00:00Z"));

    expect(out).toHaveLength(2); // June file excluded, corrupt line skipped
    expect(out.every((r) => r.ts.startsWith("2026-07-01"))).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("migrateUsageLedgerCosts runs once and is guarded by the marker file", async () => {
    vault.data.set("_fleet/usage/2026-07-01.jsonl", `${JSON.stringify(record("2026-07-01T00:00:00Z"))}\n`);

    const first = await ledger.migrateUsageLedgerCosts();
    expect(first).not.toBeNull();
    expect(first?.rows).toBe(1);
    expect(vault.data.has("_fleet/usage/.cost-delta-v1")).toBe(true);

    const second = await ledger.migrateUsageLedgerCosts();
    expect(second).toBeNull(); // marker guard
  });

  it("migrateUsageLedgerCosts is a no-op when the usage dir doesn't exist", async () => {
    expect(await ledger.migrateUsageLedgerCosts()).toBeNull();
    expect(vault.data.size).toBe(0);
  });
});
