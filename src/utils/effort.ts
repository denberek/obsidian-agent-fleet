/**
 * Reasoning-effort levels.
 *
 * Values are stored on the **Claude Code scale** — `low | medium | high |
 * xhigh | max | ultracode` — and each adapter maps them onto its own
 * vocabulary. Claude Code accepts all six verbatim. Codex takes
 * `minimal | low | medium | high | xhigh | max`, where `max` exists only on
 * GPT-5.6 tiers and `ultracode` has no analog at all; `mapCodexEffort` in
 * `src/adapters/codexAdapter.ts` owns that translation.
 *
 * Keep this list as the single source of truth — the agent and task forms both
 * render from it, so adding a level here is enough to expose it everywhere.
 */
export const EFFORT_LEVELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
  { value: "max", label: "Max" },
  { value: "ultracode", label: "Ultracode" },
];

/** Every value the UI can produce, including the empty "inherit" sentinel. */
export const EFFORT_VALUES: ReadonlyArray<string> = ["", ...EFFORT_LEVELS.map((l) => l.value)];

/**
 * Build `[value, label]` pairs for a `<select>`, with `inheritLabel` on the
 * leading empty option ("Default" on the agent form, "Agent Default" on the
 * task form, where an empty value falls through to the agent).
 */
export function effortOptions(inheritLabel: string): Array<[string, string]> {
  return [
    ["", inheritLabel],
    ...EFFORT_LEVELS.map((l): [string, string] => [l.value, l.label]),
  ];
}

export const EFFORT_HINT =
  "Reasoning depth — low is fastest, max is most thorough. " +
  "Extra High is Claude Code’s own default for coding. Ultracode is Claude-only.";
