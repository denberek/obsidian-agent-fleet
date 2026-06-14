/**
 * Per-key sliding-window rate limiter.
 *
 * Used by ChannelManager to cap how many inbound messages any single conversation
 * can consume within a rolling window. Implemented as a simple sliding-window
 * counter (not a true leaky bucket) — cheap, deterministic, and easy to test.
 *
 * This is NOT the transport's own rate limit (e.g. Slack's 1 msg/sec/channel);
 * transport-side rate limits live inside each adapter.
 */
export interface RateLimiterConfig {
  /** Maximum events allowed per `windowMs` per key. */
  maxPerWindow: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock, primarily for tests. Defaults to Date.now. */
  now?: () => number;
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(private readonly config: RateLimiterConfig) {
    this.now = config.now ?? Date.now;
  }

  /**
   * Attempt to consume a slot for `key`. Returns true if allowed (and records the
   * timestamp), false if the key has hit its cap for the current window.
   */
  tryConsume(key: string): boolean {
    const now = this.now();
    const cutoff = now - this.config.windowMs;
    const bucket = this.buckets.get(key) ?? [];
    // Drop expired timestamps.
    const live = bucket.filter((t) => t > cutoff);
    if (live.length >= this.config.maxPerWindow) {
      // Persist the pruned bucket so subsequent calls don't re-filter the same old entries.
      this.buckets.set(key, live);
      return false;
    }
    live.push(now);
    this.buckets.set(key, live);
    return true;
  }

  /** How many events are currently counted for `key` within the rolling window. */
  currentCount(key: string): number {
    const now = this.now();
    const cutoff = now - this.config.windowMs;
    const bucket = this.buckets.get(key) ?? [];
    return bucket.filter((t) => t > cutoff).length;
  }

  /** Drop all state for a given key (e.g. when a conversation is destroyed). */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Drop all state for all keys. */
  resetAll(): void {
    this.buckets.clear();
  }
}
