// One-time migration for the usage ledger (`_fleet/usage/YYYY-MM-DD.jsonl`).
//
// Before this fix, each chat/channel turn recorded Claude's CUMULATIVE
// `total_cost_usd` (which grows across every turn of a CLI process) into the
// `costUsd` field, as if it were the turn's own cost. The dashboard then SUMMED
// those running totals, inflating per-agent cost super-linearly (a long session
// could show 7×+ its real cost). The forward fix records a per-turn delta; this
// migration repairs the rows already on disk by reconstructing the same deltas.
//
// Reconstruction: per agent, in timestamp order, the per-turn cost is
// `cost[i] - cost[i-1]` while the cumulative is rising; a DROP marks a new
// process (a `--resume`/new conversation restarts the counter at 0), so that row
// is taken as its own per-turn cost. This telescopes back to the true totals.
//
// Limitation: the ledger doesn't record a conversation id, so two sessions of
// the SAME agent running concurrently would interleave their cumulative values
// and be reconstructed imperfectly. Sequential sessions (the normal case) are
// exact. Rows without a `costUsd` (e.g. Codex turns, costed by estimate at read
// time) are left untouched and don't affect the baseline.

import type { UsageRecord } from "../types";

/**
 * Rewrite `costUsd` on the given records IN PLACE, converting the historical
 * cumulative-per-process values into per-turn costs. Returns the number of rows
 * whose value changed. Pure aside from mutating the passed objects.
 */
export function deltaizeCumulativeCosts(records: UsageRecord[]): number {
  const byAgent = new Map<string, UsageRecord[]>();
  for (const r of records) {
    if (typeof r.costUsd !== "number") continue; // estimated at read time — nothing to convert
    const list = byAgent.get(r.agent);
    if (list) list.push(r);
    else byAgent.set(r.agent, [r]);
  }

  let changed = 0;
  for (const recs of byAgent.values()) {
    recs.sort((a, b) => a.ts.localeCompare(b.ts));
    let last = 0;
    for (const r of recs) {
      const cumulative = r.costUsd as number;
      // Rising → this turn's cost is the increment; a drop → new process, take
      // the value as-is. (First row: last=0 → delta=cumulative, i.e. unchanged.)
      const delta = cumulative >= last ? cumulative - last : cumulative;
      last = cumulative;
      if (delta !== cumulative) changed++;
      r.costUsd = delta;
    }
  }
  return changed;
}
