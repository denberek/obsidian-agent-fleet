import { describe, it, expect } from "vitest";
import { deltaizeCumulativeCosts } from "./usageMigration";
import type { UsageRecord } from "../types";

function rec(agent: string, ts: string, costUsd: number | undefined, totalTokens = 1000): UsageRecord {
  return {
    ts,
    agent,
    source: "channel",
    model: "claude-sonnet-4-6",
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    totalTokens,
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

describe("deltaizeCumulativeCosts", () => {
  it("converts a monotonic cumulative session into per-turn deltas", () => {
    const recs = [
      rec("a", "2026-06-21T01:00:00Z", 0.5),
      rec("a", "2026-06-21T01:05:00Z", 2.0),
      rec("a", "2026-06-21T01:10:00Z", 2.3),
    ];
    const changed = deltaizeCumulativeCosts(recs);
    expect(changed).toBe(2); // first row unchanged, next two corrected
    expect(recs[0]!.costUsd).toBeCloseTo(0.5, 8); // first turn = its cumulative
    expect(recs[1]!.costUsd).toBeCloseTo(1.5, 8);
    expect(recs[2]!.costUsd).toBeCloseTo(0.3, 8);
    // Sum of per-turn deltas telescopes back to the final cumulative.
    const sum = recs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    expect(sum).toBeCloseTo(2.3, 8);
  });

  it("treats a drop as a new process (resume) and takes the value as-is", () => {
    const recs = [
      rec("a", "2026-06-21T01:00:00Z", 1.0),
      rec("a", "2026-06-21T01:05:00Z", 3.0), // delta 2.0
      rec("a", "2026-06-21T02:00:00Z", 0.4), // dropped → new session, take 0.4
      rec("a", "2026-06-21T02:05:00Z", 0.9), // delta 0.5
    ];
    deltaizeCumulativeCosts(recs);
    expect(recs.map((r) => Number(r.costUsd?.toFixed(4)))).toEqual([1.0, 2.0, 0.4, 0.5]);
  });

  it("processes agents independently and by timestamp order", () => {
    // Intentionally out of order; the transform sorts per agent by ts.
    const recs = [
      rec("a", "2026-06-21T01:10:00Z", 2.0),
      rec("b", "2026-06-21T01:00:00Z", 5.0),
      rec("a", "2026-06-21T01:00:00Z", 0.5),
      rec("b", "2026-06-21T01:10:00Z", 9.0),
    ];
    deltaizeCumulativeCosts(recs);
    const byKey = Object.fromEntries(recs.map((r) => [`${r.agent}@${r.ts}`, r.costUsd]));
    expect(byKey["a@2026-06-21T01:00:00Z"]).toBeCloseTo(0.5, 8);
    expect(byKey["a@2026-06-21T01:10:00Z"]).toBeCloseTo(1.5, 8);
    expect(byKey["b@2026-06-21T01:00:00Z"]).toBeCloseTo(5.0, 8);
    expect(byKey["b@2026-06-21T01:10:00Z"]).toBeCloseTo(4.0, 8);
  });

  it("leaves rows without a costUsd untouched and ignores them as baselines", () => {
    const recs = [
      rec("a", "2026-06-21T01:00:00Z", 1.0),
      rec("a", "2026-06-21T01:05:00Z", undefined), // estimated at read time
      rec("a", "2026-06-21T01:10:00Z", 1.6),
    ];
    deltaizeCumulativeCosts(recs);
    expect(recs[0]!.costUsd).toBeCloseTo(1.0, 8);
    expect(recs[1]!.costUsd).toBeUndefined();
    expect(recs[2]!.costUsd).toBeCloseTo(0.6, 8); // delta against 1.0, not the skipped row
  });
});
