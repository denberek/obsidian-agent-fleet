// The single choke point for all memory mutation. Owns a per-agent FIFO lock
// so concurrent captures (chat turns, overlapping runs) and — later —
// reflection never interleave on the agent-global memory file.
// See MEMORY_EVOLUTION_DESIGN.md §7.3–7.5.
import type { AgentConfig, MemoryEntry, MemorySection, WorkingMemory } from "../types";
import {
  appendEntries,
  CAPTURE_SECTION,
  carryForwardPinnedPreferences,
  type CaptureEntry,
  emptyWorkingMemory,
  enforceHardCap,
  sanitizeFactText,
} from "../utils/memoryFormat";
import { parsePendingLines } from "./rememberMcpServer";

export type { CaptureEntry };

/** Minimal store surface MemoryWriter needs. `FleetRepository` satisfies it
 *  structurally; tests can supply a fake. */
export interface MemoryStore {
  readWorkingMemory(agentName: string): Promise<WorkingMemory | null>;
  writeWorkingMemory(agentName: string, wm: WorkingMemory): Promise<void>;
  appendRawMemory(agentName: string, lines: string[], dateIso: string): Promise<void>;
  getWorkingMemoryPath(agentName: string): string;
  readAndClearPending(agentName: string): Promise<string[]>;
  /** One-time legacy→v2 migration (seeds the raw archive). Optional so test
   *  fakes can omit it; the repository implements it. */
  migrateLegacyMemory?(agentName: string): Promise<void>;
}

/** Hard cap multiplier over the steady-state budget (§7.4). */
const HARD_CAP_MULTIPLIER = 1.5;

export class MemoryWriter {
  /**
   * Per-agent FIFO locks, keyed by agent name. STATIC so that every
   * MemoryWriter instance (the one in FleetRuntime AND the one each ChatSession
   * creates) shares a single serialization domain per agent — the design's
   * "single choke point" (§7.3) only holds if all writers contend on the same
   * lock. All instances wrap the same FleetRepository, so this is safe.
   */
  private static readonly locks = new Map<string, Promise<unknown>>();

  /** Test hook — clears the shared lock map between tests. */
  static __resetLocksForTest(): void {
    MemoryWriter.locks.clear();
  }

  constructor(private readonly store: MemoryStore) {}

  /**
   * Capture durable facts for an agent: append ground-truth lines to the raw
   * archive AND the entries straight into working memory's capture section, so
   * the next run/turn sees them (§7.2). Serialized per agent via the lock.
   * No-op when the agent has memory disabled or there is nothing to record.
   */
  async capture(
    agent: AgentConfig,
    entries: CaptureEntry[],
    source: string,
    nowIso: string,
  ): Promise<void> {
    if (!agent.memory || entries.length === 0) return;
    await this.withLock(agent.name, () => this.applyCaptures(agent, entries, source, nowIso));
  }

  /**
   * Drain the MCP tool's `pending.jsonl` inbox into working memory under the
   * lock (§7.5). The external `remember` server only appends to that file;
   * this is the single in-process writer that folds it into working.md + raw.
   */
  async drainPending(agent: AgentConfig, nowIso: string): Promise<void> {
    if (!agent.memory) return;
    await this.withLock(agent.name, async () => {
      const lines = await this.store.readAndClearPending(agent.name);
      const parsed = parsePendingLines(lines);
      if (parsed.length === 0) return;
      // Preserve order while grouping by provenance.
      const groups: Array<{ source: string; entries: CaptureEntry[] }> = [];
      for (const p of parsed) {
        const last = groups[groups.length - 1];
        const entry: CaptureEntry = { text: p.text, pinned: p.pinned, section: p.section };
        if (last && last.source === p.source) last.entries.push(entry);
        else groups.push({ source: p.source, entries: [entry] });
      }
      for (const g of groups) {
        await this.applyCaptures(agent, g.entries, g.source, nowIso);
      }
    });
  }

  /**
   * Apply a reflection's consolidated sections as the new working memory
   * (§8.3). Atomic + lock-guarded. If `sections` is null (the run produced no
   * parseable memory block) this is a no-op, leaving the previous working
   * memory intact — a failed dream never corrupts memory.
   */
  async reflect(
    agent: AgentConfig,
    sections: MemorySection[] | null,
    nowIso: string,
  ): Promise<boolean> {
    if (!agent.memory || sections === null) return false;
    // An empty consolidation (a memory block with no parseable entries) is
    // treated exactly like a failed dream: leave the previous working memory
    // intact rather than wiping it (§8.4). Without this, a present-but-empty
    // ```memory block would clobber working.md, pinned Preferences included.
    if (!sections.some((s) => s.entries.length > 0)) return false;
    await this.withLock(agent.name, async () => {
      const path = this.store.getWorkingMemoryPath(agent.name);
      const prev = await this.store.readWorkingMemory(agent.name);
      // Defense in depth: never let a dream drop pinned Preferences (§8.3).
      const mergedSections = carryForwardPinnedPreferences(prev, sections);
      const next: WorkingMemory = {
        filePath: prev?.filePath ?? path,
        agent: agent.name,
        schema: prev?.schema ?? 2,
        lastUpdated: nowIso,
        lastReflection: nowIso,
        tokenEstimate: 0, // recomputed on serialize
        sections: mergedSections,
      };
      await this.store.writeWorkingMemory(agent.name, next);
    });
    return true;
  }

  /** Apply capture entries to raw + working memory. NOT locked — callers hold
   *  the per-agent lock. */
  private async applyCaptures(
    agent: AgentConfig,
    entries: CaptureEntry[],
    source: string,
    nowIso: string,
  ): Promise<void> {
    // Sanitize model-supplied text at the single capture chokepoint: collapse
    // newlines/whitespace (keeps the one-entry-per-line format intact) and cap
    // length (a fact can't blow the token budget). Covers every channel.
    const clean = entries.map((e) => ({ ...e, text: sanitizeFactText(e.text) })).filter((e) => e.text);
    if (clean.length === 0) return;

    // Lazily complete any legacy→v2 migration before the first write, so it
    // doesn't depend on a plugin reload having run the load-time pass. Idempotent.
    await this.store.migrateLegacyMemory?.(agent.name);

    const path = this.store.getWorkingMemoryPath(agent.name);
    const wm = (await this.store.readWorkingMemory(agent.name)) ?? emptyWorkingMemory(path, agent.name);
    const date = nowIso.slice(0, 10);

    // 1. Ground truth — append-only raw archive.
    const rawLines = clean.map((e) => `- ${nowIso} [${source}]${e.pinned ? " [pin]" : ""} ${e.text}`);
    await this.store.appendRawMemory(agent.name, rawLines, nowIso);

    // 2. Working memory — straight into the capture section (or typed section).
    //    Dedup against what's already in working memory (and within this batch)
    //    so a fact emitted via BOTH the [REMEMBER] text tag and the `remember`
    //    MCP tool isn't recorded twice. The raw archive above still keeps every
    //    mention (ground truth); only the curated view is deduped.
    const present = new Set(
      wm.sections.flatMap((s) => s.entries).map((en) => en.text.trim().toLowerCase()),
    );
    let next = wm;
    for (const e of clean) {
      const key = e.text.trim().toLowerCase();
      if (present.has(key)) continue;
      present.add(key);
      const memEntry: MemoryEntry = { text: e.text, source, date, pinned: e.pinned ?? false };
      // A pinned capture with no explicit section lands in Preferences (matching
      // the [REMEMBER:pin] text tag) so it's protected from the budget squeeze
      // and carried across reflections — not buried in Recent.
      const section = e.section ?? (e.pinned ? "Preferences" : CAPTURE_SECTION);
      next = appendEntries(next, [memEntry], section, nowIso);
    }

    // 3. Mid-day safety valve — bound growth between reflections.
    const hardCap = Math.ceil((agent.memoryTokenBudget || 0) * HARD_CAP_MULTIPLIER);
    if (hardCap > 0) {
      const { wm: capped, spilled } = enforceHardCap(next, hardCap);
      if (spilled.length > 0) {
        console.info(
          `Agent Fleet: working memory for "${agent.name}" exceeded hard cap; ` +
            `spilled ${spilled.length} entr${spilled.length === 1 ? "y" : "ies"} ` +
            `to raw-only (still in the archive). A reflection pass will consolidate.`,
        );
      }
      next = capped;
    }

    await this.store.writeWorkingMemory(agent.name, next);
  }

  /** Per-task timeout for the lock chain — one hung vault write must not
   *  wedge every later capture for the agent forever. */
  private static readonly LOCK_TIMEOUT_MS = 10_000;

  /** Run `fn` after any in-flight memory op for `key` completes. FIFO. */
  private withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = MemoryWriter.locks.get(key) ?? Promise.resolve();
    // The chain link resolves when fn settles OR its timeout fires, so the
    // chain survives both rejections (without swallowing the caller's error)
    // and hangs. A timed-out task keeps running detached — it can't be
    // cancelled — but its lock slot is released so later captures proceed.
    let release!: () => void;
    const link = new Promise<void>((resolve) => { release = resolve; });
    const run = (): Promise<T> => {
      const timer = setTimeout(() => {
        console.warn(
          `Agent Fleet: memory write for "${key}" still pending after ` +
            `${MemoryWriter.LOCK_TIMEOUT_MS}ms — releasing its lock slot`,
        );
        release();
      }, MemoryWriter.LOCK_TIMEOUT_MS);
      const result = fn();
      result.then(
        () => { clearTimeout(timer); release(); },
        () => { clearTimeout(timer); release(); },
      );
      return result;
    };
    const next = prev.then(run, run);
    MemoryWriter.locks.set(key, link);
    return next;
  }
}
