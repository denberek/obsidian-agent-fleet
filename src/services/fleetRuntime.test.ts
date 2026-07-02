import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetRepository } from "../fleetRepository";
import type { RunLogData } from "../types";
import { DEFAULT_SETTINGS } from "../constants";
import { FleetRuntime } from "./fleetRuntime";

// The obsidian test stub doesn't export Notice; provide one that records
// messages so notify() behavior can be asserted.
const notices = vi.hoisted(() => [] as Array<{ message: string; timeout?: number }>);
vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Notice: class {
      constructor(message: string, timeout?: number) {
        notices.push({ message, timeout });
      }
    },
  };
});

/** Private members exercised directly (they have no public trigger that
 *  doesn't spawn a CLI). */
interface RuntimeInternals {
  refreshRunCaches(): Promise<void>;
  emitRunOutput(agentName: string, chunk: string): void;
  resetRunOutput(agentName: string): void;
  clearRunOutput(agentName: string): void;
  notify(run: RunLogData, capturedCount?: number): void;
  recentRuns: RunLogData[];
}

function makeRun(overrides: Partial<RunLogData> = {}): RunLogData {
  return {
    runId: `run-${Math.random().toString(36).slice(2)}`,
    agent: "scout",
    task: "task-1",
    status: "success",
    started: new Date().toISOString(),
    completed: new Date().toISOString(),
    durationSeconds: 1,
    model: "default",
    exitCode: 0,
    tags: [],
    prompt: "do the thing",
    output: "All done.",
    toolsUsed: [],
    ...overrides,
  };
}

function makeRuntime(getRuns: () => RunLogData[] = () => []) {
  const repository = {
    listRecentRuns: vi.fn(async () => getRuns()),
    listRunsSince: vi.fn(async () => []),
    readUsageSince: vi.fn(async () => []),
  } as unknown as FleetRepository;
  const runtime = new FleetRuntime(repository, { ...DEFAULT_SETTINGS });
  const internals = runtime as unknown as RuntimeInternals;
  return { runtime, internals };
}

beforeEach(() => {
  notices.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-01T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getFleetStatus", () => {
  it("counts today's runs and pending approvals", async () => {
    const runs = [
      makeRun({ started: "2026-07-01T08:00:00" }),
      makeRun({ started: "2026-07-01T09:30:00" }),
      makeRun({ started: "2026-06-30T23:59:00" }), // yesterday — excluded
      makeRun({
        started: "2026-07-01T10:00:00",
        status: "pending_approval",
        approvals: [
          { tool: "Bash", status: "pending" },
          { tool: "Write", status: "approved" },
        ],
      }),
    ];
    const { internals, runtime } = makeRuntime(() => [...runs]);
    await internals.refreshRunCaches();

    expect(runtime.getFleetStatus()).toEqual({ running: 0, pending: 1, completedToday: 3 });
  });

  it("caches on run-list identity: in-place mutation is invisible, refresh is picked up", async () => {
    const data = [makeRun({ started: "2026-07-01T08:00:00" })];
    const { internals, runtime } = makeRuntime(() => [...data]);
    await internals.refreshRunCaches();
    expect(runtime.getFleetStatus().completedToday).toBe(1);

    // Mutating the cached array in place is NOT a supported mutation point
    // (recentRuns is only ever replaced wholesale by refreshRunCaches) — the
    // cache deliberately keys on array identity, so this stays at 1.
    internals.recentRuns.push(makeRun({ started: "2026-07-01T09:00:00" }));
    expect(runtime.getFleetStatus().completedToday).toBe(1);

    // Recording a run goes through refreshRunCaches → new array → recompute.
    data.push(makeRun({ started: "2026-07-01T09:00:00" }));
    await internals.refreshRunCaches();
    expect(runtime.getFleetStatus().completedToday).toBe(2);
  });

  it("invalidates the cache when the local day rolls over", async () => {
    const { internals, runtime } = makeRuntime(() => [makeRun({ started: "2026-07-01T23:00:00" })]);
    vi.setSystemTime(new Date("2026-07-01T23:30:00"));
    await internals.refreshRunCaches();
    expect(runtime.getFleetStatus().completedToday).toBe(1);

    vi.setSystemTime(new Date("2026-07-02T00:01:00"));
    expect(runtime.getFleetStatus().completedToday).toBe(0);
  });
});

describe("run output batching", () => {
  it("appends the buffer eagerly but flushes listeners at most every 100ms", () => {
    const { internals, runtime } = makeRuntime();
    const received: string[] = [];
    runtime.onRunOutput("scout", (chunk) => received.push(chunk));

    internals.emitRunOutput("scout", "one ");
    internals.emitRunOutput("scout", "two");

    // Buffer is current immediately; listeners haven't been pinged yet.
    expect(runtime.getRunOutputBuffer("scout")).toBe("one two");
    expect(received).toEqual([]);

    vi.advanceTimersByTime(100);
    expect(received).toEqual(["one two"]);

    // A later chunk starts a fresh batch.
    internals.emitRunOutput("scout", " three");
    expect(received).toEqual(["one two"]);
    vi.advanceTimersByTime(100);
    expect(received).toEqual(["one two", " three"]);
  });

  it("flushes pending chunks on run end before tearing down", () => {
    const { internals, runtime } = makeRuntime();
    const received: string[] = [];
    runtime.onRunOutput("scout", (chunk) => received.push(chunk));

    internals.emitRunOutput("scout", "tail");
    internals.clearRunOutput("scout");

    expect(received).toEqual(["tail"]);
    expect(runtime.getRunOutputBuffer("scout")).toBe("");
    // No dangling timer fires after teardown.
    vi.advanceTimersByTime(200);
    expect(received).toEqual(["tail"]);
  });

  it("does not double-deliver pending chunks to a subscriber that got the buffer snapshot", () => {
    const { internals, runtime } = makeRuntime();
    const first: string[] = [];
    const second: string[] = [];
    runtime.onRunOutput("scout", (chunk) => first.push(chunk));

    internals.emitRunOutput("scout", "hello");
    // Subscribing flushes the batch to existing listeners, then hands the new
    // listener the full buffer — so nothing is delivered twice.
    runtime.onRunOutput("scout", (chunk) => second.push(chunk));

    expect(first).toEqual(["hello"]);
    expect(second).toEqual(["hello"]);

    vi.advanceTimersByTime(200);
    expect(first).toEqual(["hello"]);
    expect(second).toEqual(["hello"]);
  });

  it("resetRunOutput drops stale batches so the next run starts clean", () => {
    const { internals, runtime } = makeRuntime();
    const received: string[] = [];
    runtime.onRunOutput("scout", (chunk) => received.push(chunk));

    internals.emitRunOutput("scout", "stale");
    internals.resetRunOutput("scout");

    expect(runtime.getRunOutputBuffer("scout")).toBe("");
    vi.advanceTimersByTime(200);
    expect(received).toEqual([]);

    internals.emitRunOutput("scout", "fresh");
    vi.advanceTimersByTime(100);
    expect(received).toEqual(["fresh"]);
  });

  it("stops delivering after unsubscribe", () => {
    const { internals, runtime } = makeRuntime();
    const received: string[] = [];
    const unsub = runtime.onRunOutput("scout", (chunk) => received.push(chunk));

    internals.emitRunOutput("scout", "a");
    vi.advanceTimersByTime(100);
    unsub();
    internals.emitRunOutput("scout", "b");
    vi.advanceTimersByTime(100);

    expect(received).toEqual(["a"]);
  });
});

describe("notify memory-capture suffix", () => {
  it("appends the captured count to the success notice", () => {
    const { internals } = makeRuntime();
    internals.notify(makeRun({ output: "Report ready." }), 3);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.message).toBe("✅ scout: Report ready. · captured 3 memory facts");
  });

  it("uses singular wording for one capture", () => {
    const { internals } = makeRuntime();
    internals.notify(makeRun({ output: "Report ready." }), 1);
    expect(notices[0]?.message).toContain("· captured 1 memory fact");
    expect(notices[0]?.message).not.toContain("memory facts");
  });

  it("leaves the notice unchanged when nothing was captured", () => {
    const { internals } = makeRuntime();
    internals.notify(makeRun({ output: "Report ready." }));
    expect(notices[0]?.message).toBe("✅ scout: Report ready.");
  });

  it("does not append the suffix to failure notices", () => {
    const { internals } = makeRuntime();
    internals.notify(makeRun({ status: "failure", exitCode: 1, output: "boom" }), 2);
    expect(notices[0]?.message).toBe("❌ scout: boom");
  });
});
