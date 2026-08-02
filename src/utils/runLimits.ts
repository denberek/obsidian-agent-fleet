import type { AgentConfig, FleetSettings, RunLimitKind, TaskConfig } from "../types";

export type { RunLimitKind };

/**
 * Per-run stop limits (spend threshold, turn cap).
 *
 * These exist because the scheduler runs agents unattended: a cron task that
 * loops or picks an expensive model has nothing stopping it. Both limits
 * resolve task → agent → settings, mirroring `resolveModel` so there is one
 * mental model for every per-run knob.
 *
 * Claude Code enforces both (`--max-budget-usd`, `--max-turns`). Codex has no
 * equivalent for either, so limits are recorded on the run but not enforced
 * there — see `codexAdapter.buildExec`.
 */

/** Which layer a resolved limit came from. `unset` = no layer specified one. */
export type LimitSource = "task" | "agent" | "settings" | "unset";

export interface ResolvedLimit {
  /** The limit to enforce, or undefined to omit the flag entirely. */
  value: number | undefined;
  /** Which layer produced it — recorded on the run log for audit. */
  source: LimitSource;
}

interface LimitLayer {
  value: number | undefined;
  source: LimitSource;
}

/**
 * First layer that says anything wins.
 *
 * `undefined` means "this layer is silent, keep walking". Any number at or
 * below zero means "explicitly no limit here" and stops the walk — that's how
 * a single expensive task opts out of a fleet-wide cap without the user having
 * to remove the cap for everything else. Non-finite values are treated the
 * same way rather than being passed to the CLI.
 */
function pick(...layers: LimitLayer[]): ResolvedLimit {
  for (const layer of layers) {
    if (layer.value === undefined || layer.value === null) continue;
    if (!Number.isFinite(layer.value) || layer.value <= 0) {
      return { value: undefined, source: layer.source };
    }
    return { value: layer.value, source: layer.source };
  }
  return { value: undefined, source: "unset" };
}

/**
 * Dollar stop threshold for one run. Claude Code checks this between API
 * turns, so an in-flight response can take the final cost above the value.
 */
export function resolveMaxBudgetUsd(
  task: Pick<TaskConfig, "maxBudgetUsd"> | null | undefined,
  agent: Pick<AgentConfig, "maxBudgetUsd">,
  settings: Pick<FleetSettings, "maxRunBudgetUsd">,
): ResolvedLimit {
  return pick(
    { value: task?.maxBudgetUsd, source: "task" },
    { value: agent.maxBudgetUsd, source: "agent" },
    { value: settings.maxRunBudgetUsd, source: "settings" },
  );
}

/** Agentic-turn ceiling for one run. Guards against a task that never converges. */
export function resolveMaxTurns(
  task: Pick<TaskConfig, "maxTurns"> | null | undefined,
  agent: Pick<AgentConfig, "maxTurns">,
  settings: Pick<FleetSettings, "maxRunTurns">,
): ResolvedLimit {
  return pick(
    { value: task?.maxTurns, source: "task" },
    { value: agent.maxTurns, source: "agent" },
    { value: settings.maxRunTurns, source: "settings" },
  );
}

/** Human-readable reason for a run that a limit cut short. */
export function describeLimitHit(kind: RunLimitKind, limit: number | undefined): string {
  if (kind === "budget") {
    return limit === undefined
      ? "Stopped: spend limit reached."
      : `Stopped: spend limit of $${limit} reached.`;
  }
  return limit === undefined
    ? "Stopped: turn limit reached."
    : `Stopped: turn limit of ${limit} reached.`;
}
