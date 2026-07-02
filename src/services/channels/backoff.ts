/**
 * Tiny exponential backoff shared by the channel adapters' reconnect/poll loops.
 * Delay sequence: base, base*2, base*4, … capped at `cap`; `reset()` returns to
 * base (adapters call it on a successful connection / poll).
 */
export class ExponentialBackoff {
  private readonly base: number;
  private readonly cap: number;
  private delayMs: number;

  constructor(base = 1000, cap = 30_000) {
    this.base = base;
    this.cap = cap;
    this.delayMs = base;
  }

  /** Return the current delay and advance to the next (doubled, capped) one. */
  nextDelay(): number {
    const delay = this.delayMs;
    this.delayMs = Math.min(this.cap, this.delayMs * 2);
    return delay;
  }

  reset(): void {
    this.delayMs = this.base;
  }
}
