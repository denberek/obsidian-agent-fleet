import { captureCli } from "./platform";

/**
 * Headless Pi provider-auth status, via `pi auth check --provider <p> --json`.
 *
 * Output is a single JSON object like:
 *   {"status":"ready","provider":"anthropic"}
 *   {"status":"not_ready","provider":"anthropic","reason":"credentials_not_configured"}
 *
 * We only ever read STATUS — never credentials (`--credentials` is never
 * passed, and auth.json is never opened; see the §6.4 rule in
 * PI_HARNESS_FEASIBILITY.md). Fail-soft: any spawn/parse problem reports
 * "unknown" rather than blocking UI.
 */

export interface PiAuthStatus {
  provider: string;
  /** "ready" | "not_ready" | "unknown" (spawn/parse failure). */
  status: string;
  /** Machine reason from the CLI when not ready (e.g. "credentials_not_configured"). */
  reason?: string;
}

/** The two providers the dual-vendor contract cares about. */
export const PI_AUTH_PROVIDERS = ["anthropic", "openai-codex"] as const;

export async function checkPiAuth(cliPath: string, provider: string): Promise<PiAuthStatus> {
  const unknown: PiAuthStatus = { provider, status: "unknown" };
  const result = await captureCli(cliPath, ["auth", "check", "--provider", provider, "--json"], {
    timeoutMs: 10_000,
  });
  if (!result.ok) return unknown;
  // The exit code is deliberately ignored: `pi auth check` prints its JSON
  // status object even when it exits non-zero for a not-ready provider.
  try {
    const parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    return {
      provider: typeof parsed.provider === "string" ? parsed.provider : provider,
      status: typeof parsed.status === "string" ? parsed.status : "unknown",
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return unknown;
  }
}

/** Human-readable one-liner for a provider's auth status. */
export function describePiAuthStatus(s: PiAuthStatus): string {
  const name = s.provider === "openai-codex" ? "ChatGPT (OpenAI)" : "Claude (Anthropic)";
  if (s.status === "ready") return `${name}: connected`;
  if (s.status === "not_ready") {
    return `${name}: not connected${s.reason ? ` (${s.reason.replace(/_/g, " ")})` : ""} — run \`pi\` in a terminal and use /login`;
  }
  return `${name}: status unknown (is the Pi CLI installed?)`;
}
