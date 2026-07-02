import { normalizePath } from "obsidian";
import type { App, Vault } from "obsidian";
import { deltaizeCumulativeCosts } from "../utils/usageMigration";
import type { UsageRecord } from "../types";
import { ensureFolder } from "./shared";

/**
 * Usage ledger: append-only chat/channel token+cost records in
 * `_fleet/usage/YYYY-MM-DD.jsonl`, plus the one-time cumulative-cost repair
 * migration. Extracted verbatim from FleetRepository.
 */
export class UsageLedger {
  private readonly vault: Vault;

  constructor(
    app: App,
    private readonly getUsageDir: () => string,
  ) {
    this.vault = app.vault;
  }

  private usageLedgerPath(ts: string): string {
    return normalizePath(`${this.getUsageDir()}/${ts.slice(0, 10)}.jsonl`);
  }

  /** Append one usage record to the day's JSONL ledger (one line per turn).
   *  Uses the raw adapter so it doesn't go through the markdown pipeline. */
  async appendUsage(record: UsageRecord): Promise<void> {
    await ensureFolder(this.vault, this.getUsageDir());
    const path = this.usageLedgerPath(record.ts);
    const line = `${JSON.stringify(record)}\n`;
    const adapter = this.vault.adapter;
    if (await adapter.exists(path)) {
      await adapter.append(path, line);
    } else {
      await adapter.write(path, line);
    }
  }

  /** Read all usage records on or after `sinceDate` (by ledger file date). */
  async readUsageSince(sinceDate: Date): Promise<UsageRecord[]> {
    const dir = this.getUsageDir();
    const adapter = this.vault.adapter;
    if (!(await adapter.exists(dir))) return [];
    const sinceStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, "0")}-${String(sinceDate.getDate()).padStart(2, "0")}`;
    const out: UsageRecord[] = [];
    const listing = await adapter.list(dir);
    for (const filePath of listing.files) {
      if (!filePath.endsWith(".jsonl")) continue;
      const base = (filePath.split("/").pop() ?? "").replace(/\.jsonl$/, "");
      // Files are named YYYY-MM-DD; lexicographic >= matches calendar >=.
      if (base < sinceStr) continue;
      let content: string;
      try {
        content = await adapter.read(filePath);
      } catch {
        continue;
      }
      for (const raw of content.split("\n")) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        try {
          out.push(JSON.parse(trimmed) as UsageRecord);
        } catch (err) {
          // skip a corrupt line rather than failing the whole read
          console.warn(`Agent Fleet: skipping corrupt usage record in ${filePath}`, err);
        }
      }
    }
    return out;
  }

  /**
   * One-time repair of historical usage rows that stored Claude's CUMULATIVE
   * `total_cost_usd` as a per-turn cost (see `deltaizeCumulativeCosts`). Reads
   * every `*.jsonl` ledger file, reconstructs per-turn costs per agent across
   * the whole ledger (a process can't be assumed to stay within one day), and
   * rewrites each file in place. Guarded by a marker file so it runs at most
   * once; idempotent and fail-soft (any error leaves the ledger untouched).
   */
  async migrateUsageLedgerCosts(): Promise<{ files: number; rows: number; changed: number } | null> {
    const dir = this.getUsageDir();
    const adapter = this.vault.adapter;
    if (!(await adapter.exists(dir))) return null;
    const marker = normalizePath(`${dir}/.cost-delta-v1`);
    if (await adapter.exists(marker)) return null;

    try {
      const listing = await adapter.list(dir);
      const files: Array<{ path: string; records: UsageRecord[] }> = [];
      const all: UsageRecord[] = [];
      for (const filePath of listing.files) {
        if (!filePath.endsWith(".jsonl")) continue;
        let content: string;
        try {
          content = await adapter.read(filePath);
        } catch {
          continue;
        }
        const records: UsageRecord[] = [];
        for (const raw of content.split("\n")) {
          const trimmed = raw.trim();
          if (!trimmed) continue;
          try {
            records.push(JSON.parse(trimmed) as UsageRecord);
          } catch (err) {
            // skip a corrupt line rather than failing the whole migration
            console.warn(`Agent Fleet: skipping corrupt usage record in ${filePath} during cost migration`, err);
          }
        }
        files.push({ path: filePath, records });
        all.push(...records);
      }

      // Mutates `costUsd` on the same objects held in `files[].records`.
      const changed = deltaizeCumulativeCosts(all);

      if (changed > 0) {
        for (const { path, records } of files) {
          if (records.length === 0) continue;
          const body = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
          await adapter.write(path, body);
        }
      }
      await adapter.write(marker, `migrated ${all.length} rows; corrected ${changed}\n`);
      return { files: files.length, rows: all.length, changed };
    } catch (err) {
      console.error("Agent Fleet: usage-ledger cost migration failed (ledger left untouched)", err);
      return null;
    }
  }
}
