/**
 * CLI version detection.
 *
 * Both backends ship several releases a week and Agent Fleet tracks their
 * current behavior rather than pinning. That's fine right up until a user sits
 * on a build with a bug we can't work around from our side — the reason these
 * minimums exist rather than being a general "stay current" nag:
 *
 *   - Claude Code < 2.1.216 truncates `stream-json` output when the reader is
 *     slow, which is exactly how ExecutionManager and ChatSession consume it.
 *   - Claude Code < 2.1.219 drops the answer from `claude -p` when a turn dies
 *     on a mid-stream API error.
 *   - Codex 0.146.0 is the release baseline this version is validated against;
 *     older JSONL/resume behavior is not part of the supported contract.
 *
 * Detection is best-effort: an unparseable version is treated as "unknown" and
 * never blocks anything. We warn, we don't gate.
 */

/** Minimum Claude Code CLI we recommend. See the header for why. */
export const MIN_CLAUDE_CLI_VERSION = "2.1.219";

/** Minimum Codex CLI we recommend. */
export const MIN_CODEX_CLI_VERSION = "0.146.0";

/**
 * Pull a semver triple out of `--version` output.
 *
 * Both CLIs wrap the number in prose that has changed shape before
 * ("2.1.220 (Claude Code)", "codex-cli 0.146.0"), so match the first triple
 * anywhere in the string rather than parsing a specific format. Returns null
 * when nothing version-shaped is present.
 */
export function parseCliVersion(output: string): string | null {
  const match = /\b(\d+)\.(\d+)\.(\d+)\b/.exec(output);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

/**
 * Compare two semver triples. Returns <0 if `a` is older than `b`, 0 if equal,
 * >0 if newer. Non-numeric or missing segments are treated as 0, so a partial
 * version sorts as low as it reasonably can.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const na = Number.isFinite(pa[i]) ? (pa[i] as number) : 0;
    const nb = Number.isFinite(pb[i]) ? (pb[i] as number) : 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/** True when `version` is older than `minimum`. Unknown versions are not below. */
export function isBelowMinimum(version: string | null, minimum: string): boolean {
  if (!version) return false;
  return compareVersions(version, minimum) < 0;
}

/**
 * Warning text for an out-of-date CLI, or null when it's current (or unknown).
 * Says what actually breaks rather than just naming a number — a version nag
 * with no consequence attached is noise people learn to dismiss.
 */
export function cliVersionWarning(
  label: "Claude" | "Codex",
  version: string | null,
  minimum: string,
): string | null {
  if (!isBelowMinimum(version, minimum)) return null;
  const detail =
    label === "Claude"
      ? "Older builds truncate streamed output when the reader is slow, which is how Agent Fleet reads run output."
      : "This release is validated against 0.146.0; older JSONL and resume behavior may differ.";
  return (
    `${label} CLI ${version} is older than the recommended ${minimum}. ${detail} ` +
    `Update with: npm install -g ${label === "Claude" ? "@anthropic-ai/claude-code" : "@openai/codex"}`
  );
}

/** Feature gates keyed to the CLI version that introduced them. */
export const CLAUDE_FEATURE_MIN_VERSION = {
  /** `--max-budget-usd` (2.1.217). */
  maxBudgetUsd: "2.1.217",
  /** `--forward-subagent-text` (2.1.211). */
  forwardSubagentText: "2.1.211",
  /** `mcp_server_errors` on the headless init event (2.1.219). */
  mcpServerErrors: "2.1.219",
  /** `--json-schema` erroring on an invalid schema rather than silently
   *  producing unstructured output (2.1.205). */
  jsonSchema: "2.1.205",
} as const;

/**
 * Whether a detected Claude CLI supports a feature. An unknown version returns
 * true: we'd rather pass a flag an old CLI rejects loudly than silently drop a
 * limit the user configured and let a run bill without its cap.
 */
export function claudeSupports(
  version: string | null,
  feature: keyof typeof CLAUDE_FEATURE_MIN_VERSION,
): boolean {
  if (!version) return true;
  return compareVersions(version, CLAUDE_FEATURE_MIN_VERSION[feature]) >= 0;
}
