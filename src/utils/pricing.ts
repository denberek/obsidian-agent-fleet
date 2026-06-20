// Token → USD cost estimation, used as a fallback when the CLI doesn't report a
// dollar cost (Codex agents, or any turn missing `total_cost_usd`). Claude runs
// carry an exact CLI cost; this table only fills the gaps. Rates are USD per
// MILLION tokens and will drift as vendors change pricing — update as needed.

interface ModelRates {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/** Per-family rates (USD / 1M tokens). Matched by substring against the model id. */
const RATE_TABLE: Array<{ match: RegExp; rates: ModelRates }> = [
  { match: /opus/i, rates: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  { match: /sonnet/i, rates: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: /haiku/i, rates: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
  // OpenAI Codex / GPT slugs — approximate; no cache-tier distinction.
  { match: /gpt-5|codex|o[0-9]/i, rates: { input: 1.25, output: 10, cacheWrite: 1.25, cacheRead: 0.125 } },
];

/** Fallback when the model id matches nothing (use mid-tier Sonnet-ish rates). */
const DEFAULT_RATES: ModelRates = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

function ratesFor(model: string): ModelRates {
  for (const { match, rates } of RATE_TABLE) {
    if (match.test(model)) return rates;
  }
  return DEFAULT_RATES;
}

export interface TokenBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
}

/** Estimate USD cost from a full per-type token breakdown (most accurate). */
export function estimateCostFromBreakdown(model: string, b: TokenBreakdown): number {
  const r = ratesFor(model);
  return (
    (b.inputTokens * r.input +
      b.outputTokens * r.output +
      b.cacheCreateTokens * r.cacheWrite +
      b.cacheReadTokens * r.cacheRead) /
    1_000_000
  );
}

/** Estimate USD cost when only a single total-token count is known (e.g. a run
 *  log, which doesn't store the input/output split). Assumes a ~70/30 input/output
 *  blend — a rough best-effort, used only when the CLI reported no cost. */
export function estimateCostFromTotal(model: string, totalTokens: number): number {
  const r = ratesFor(model);
  const blended = 0.7 * r.input + 0.3 * r.output;
  return (totalTokens * blended) / 1_000_000;
}
