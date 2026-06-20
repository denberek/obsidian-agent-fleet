import { describe, expect, it } from "vitest";
import { estimateCostFromBreakdown, estimateCostFromTotal } from "./pricing";

describe("pricing", () => {
  it("prices a Claude breakdown using the model's per-type rates", () => {
    // opus: input $15, output $75, cacheRead $1.50 per 1M.
    const cost = estimateCostFromBreakdown("claude-opus-4-7", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheCreateTokens: 0,
    });
    expect(cost).toBeCloseTo(15 + 75 + 1.5, 5);
  });

  it("matches family by substring (sonnet/haiku)", () => {
    const sonnet = estimateCostFromBreakdown("sonnet", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0 });
    const haiku = estimateCostFromBreakdown("claude-haiku-4-5", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0 });
    expect(sonnet).toBeCloseTo(3, 5);
    expect(haiku).toBeCloseTo(1, 5);
  });

  it("falls back to a default rate for unknown models", () => {
    const cost = estimateCostFromBreakdown("some-unknown-model", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0 });
    expect(cost).toBeCloseTo(3, 5); // default = sonnet-ish input rate
  });

  it("estimates from a total-token count with a blended rate", () => {
    // haiku blended = 0.7*1 + 0.3*5 = 2.2 per 1M.
    expect(estimateCostFromTotal("haiku", 1_000_000)).toBeCloseTo(2.2, 5);
  });

  it("returns zero cost for zero tokens", () => {
    expect(estimateCostFromBreakdown("opus", { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0 })).toBe(0);
    expect(estimateCostFromTotal("opus", 0)).toBe(0);
  });
});
