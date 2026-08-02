import { describe, expect, it } from "vitest";
import type { AgentConfig, FleetSettings, TaskConfig } from "../types";
import { describeLimitHit, resolveMaxBudgetUsd, resolveMaxTurns } from "./runLimits";

type BudgetTask = Pick<TaskConfig, "maxBudgetUsd">;
type BudgetAgent = Pick<AgentConfig, "maxBudgetUsd">;
type BudgetSettings = Pick<FleetSettings, "maxRunBudgetUsd">;

const task = (maxBudgetUsd?: number): BudgetTask => ({ maxBudgetUsd });
const agent = (maxBudgetUsd?: number): BudgetAgent => ({ maxBudgetUsd });
const settings = (maxRunBudgetUsd: number): BudgetSettings => ({ maxRunBudgetUsd });

describe("resolveMaxBudgetUsd", () => {
  it("walks task → agent → settings", () => {
    expect(resolveMaxBudgetUsd(task(1), agent(2), settings(3))).toEqual({
      value: 1,
      source: "task",
    });
    expect(resolveMaxBudgetUsd(task(), agent(2), settings(3))).toEqual({
      value: 2,
      source: "agent",
    });
    expect(resolveMaxBudgetUsd(task(), agent(), settings(3))).toEqual({
      value: 3,
      source: "settings",
    });
  });

  it("reports unset when no layer specifies one", () => {
    expect(resolveMaxBudgetUsd(task(), agent(), settings(0))).toEqual({
      value: undefined,
      source: "settings",
    });
    expect(resolveMaxBudgetUsd(null, agent(), settings(0))).toEqual({
      value: undefined,
      source: "settings",
    });
  });

  it("treats zero as an explicit opt-out that stops the walk", () => {
    // The point of this rule: one expensive task escapes a fleet-wide cap
    // without the user having to lift the cap for everything else.
    expect(resolveMaxBudgetUsd(task(0), agent(2), settings(3))).toEqual({
      value: undefined,
      source: "task",
    });
    expect(resolveMaxBudgetUsd(task(), agent(0), settings(3))).toEqual({
      value: undefined,
      source: "agent",
    });
  });

  it("treats negative and non-finite values as uncapped, never passing them on", () => {
    expect(resolveMaxBudgetUsd(task(-5), agent(2), settings(3)).value).toBeUndefined();
    expect(resolveMaxBudgetUsd(task(Number.NaN), agent(2), settings(3)).value).toBeUndefined();
    expect(resolveMaxBudgetUsd(task(Number.POSITIVE_INFINITY), agent(2), settings(3)).value).toBeUndefined();
  });

  it("handles an absent task (heartbeat / reflection runs)", () => {
    expect(resolveMaxBudgetUsd(undefined, agent(2), settings(3))).toEqual({
      value: 2,
      source: "agent",
    });
  });

  it("keeps fractional caps intact", () => {
    expect(resolveMaxBudgetUsd(task(0.25), agent(), settings(0)).value).toBe(0.25);
  });
});

describe("resolveMaxTurns", () => {
  it("walks the same layers independently of the budget", () => {
    expect(
      resolveMaxTurns({ maxTurns: 5 }, { maxTurns: 10 }, { maxRunTurns: 20 }),
    ).toEqual({ value: 5, source: "task" });
    expect(resolveMaxTurns({}, { maxTurns: 10 }, { maxRunTurns: 20 })).toEqual({
      value: 10,
      source: "agent",
    });
    expect(resolveMaxTurns({}, {}, { maxRunTurns: 20 })).toEqual({
      value: 20,
      source: "settings",
    });
    expect(resolveMaxTurns({}, {}, { maxRunTurns: 0 }).value).toBeUndefined();
  });
});

describe("describeLimitHit", () => {
  it("names the limit and its value", () => {
    expect(describeLimitHit("budget", 2.5)).toBe("Stopped: spend limit of $2.5 reached.");
    expect(describeLimitHit("turns", 30)).toBe("Stopped: turn limit of 30 reached.");
  });

  it("stays sensible when the value is unknown", () => {
    expect(describeLimitHit("budget", undefined)).toBe("Stopped: spend limit reached.");
    expect(describeLimitHit("turns", undefined)).toBe("Stopped: turn limit reached.");
  });
});
