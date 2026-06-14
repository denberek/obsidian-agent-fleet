import type { AgentConfig, FleetSettings, ResolvedModel, TaskConfig } from "../types";

/**
 * Values that mean "don't pass --model to the CLI; let Claude Code pick."
 * Kept as an exported constant so callers can check consistently.
 */
export const CLI_DEFAULT_SENTINELS = new Set(["", "default", "subscription"]);

/**
 * Resolve the effective model for a run by walking task → agent → settings.
 *
 * The returned `value` is the raw string to pass as --model, or empty if the
 * flag should be omitted (per CLI_DEFAULT_SENTINELS). The returned `source`
 * records which layer the value came from, for audit logging and UI display.
 */
export function resolveModel(
  task: Pick<TaskConfig, "model"> | null | undefined,
  agent: Pick<AgentConfig, "model">,
  settings: Pick<FleetSettings, "defaultModel">,
): ResolvedModel {
  const taskValue = normalize(task?.model);
  if (taskValue) return { value: toCliValue(taskValue), source: "task" };

  const agentValue = normalize(agent.model);
  if (agentValue) return { value: toCliValue(agentValue), source: "agent" };

  const settingsValue = normalize(settings.defaultModel);
  if (settingsValue) return { value: toCliValue(settingsValue), source: "settings" };

  return { value: "", source: "cli-default" };
}

/** Should we pass --model at all for this resolved value? */
export function shouldPassModelFlag(value: string): boolean {
  return !CLI_DEFAULT_SENTINELS.has(value.trim());
}

function normalize(input: string | undefined | null): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed;
}

/**
 * Collapse sentinel values ("default", "subscription") to empty string so the
 * downstream `shouldPassModelFlag` check is uniform. We keep the layer
 * attribution separate so audit can still say "came from agent" even when the
 * effective value is empty.
 */
function toCliValue(value: string): string {
  if (CLI_DEFAULT_SENTINELS.has(value)) return "";
  return value;
}
