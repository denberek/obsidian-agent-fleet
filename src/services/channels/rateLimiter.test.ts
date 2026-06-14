import { describe, expect, it } from "vitest";
import { SlidingWindowRateLimiter } from "./rateLimiter";

describe("SlidingWindowRateLimiter", () => {
  it("allows up to maxPerWindow calls then rejects further calls within the window", () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({
      maxPerWindow: 3,
      windowMs: 60_000,
      now: () => now,
    });

    expect(limiter.tryConsume("conv-A")).toBe(true);
    expect(limiter.tryConsume("conv-A")).toBe(true);
    expect(limiter.tryConsume("conv-A")).toBe(true);
    expect(limiter.tryConsume("conv-A")).toBe(false); // 4th call within window
    expect(limiter.currentCount("conv-A")).toBe(3);
  });

  it("tracks keys independently", () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({
      maxPerWindow: 2,
      windowMs: 60_000,
      now: () => now,
    });

    limiter.tryConsume("conv-A");
    limiter.tryConsume("conv-A");
    // conv-A is exhausted
    expect(limiter.tryConsume("conv-A")).toBe(false);
    // conv-B still has its own allowance
    expect(limiter.tryConsume("conv-B")).toBe(true);
    expect(limiter.tryConsume("conv-B")).toBe(true);
    expect(limiter.tryConsume("conv-B")).toBe(false);
  });

  it("expires old entries as time advances past the window", () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({
      maxPerWindow: 2,
      windowMs: 10_000,
      now: () => now,
    });

    limiter.tryConsume("conv");
    limiter.tryConsume("conv");
    expect(limiter.tryConsume("conv")).toBe(false);

    // Advance clock past the window
    now += 11_000;
    expect(limiter.tryConsume("conv")).toBe(true);
    expect(limiter.currentCount("conv")).toBe(1);
  });

  it("reset drops state for a single key", () => {
    let now = 1_000_000;
    const limiter = new SlidingWindowRateLimiter({
      maxPerWindow: 1,
      windowMs: 60_000,
      now: () => now,
    });

    limiter.tryConsume("conv");
    expect(limiter.tryConsume("conv")).toBe(false);
    limiter.reset("conv");
    expect(limiter.tryConsume("conv")).toBe(true);
  });
});
