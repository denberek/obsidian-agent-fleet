import { describe, expect, it } from "vitest";
import { EFFORT_LEVELS, EFFORT_VALUES, effortOptions } from "./effort";

describe("EFFORT_LEVELS", () => {
  it("covers the full Claude Code scale", () => {
    expect(EFFORT_LEVELS.map((l) => l.value)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultracode",
    ]);
  });

  it("exposes the inherit sentinel in EFFORT_VALUES", () => {
    expect(EFFORT_VALUES[0]).toBe("");
    expect(EFFORT_VALUES).toHaveLength(EFFORT_LEVELS.length + 1);
  });
});

describe("effortOptions", () => {
  it("puts the caller's inherit label on the empty option", () => {
    expect(effortOptions("Agent Default")[0]).toEqual(["", "Agent Default"]);
    expect(effortOptions("Default")[0]).toEqual(["", "Default"]);
  });

  it("returns one entry per level plus the sentinel", () => {
    expect(effortOptions("Default")).toHaveLength(EFFORT_LEVELS.length + 1);
  });
});
