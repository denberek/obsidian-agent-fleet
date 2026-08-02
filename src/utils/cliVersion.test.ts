import { describe, expect, it } from "vitest";
import {
  claudeSupports,
  cliVersionWarning,
  compareVersions,
  isBelowMinimum,
  MIN_CLAUDE_CLI_VERSION,
  MIN_CODEX_CLI_VERSION,
  parseCliVersion,
} from "./cliVersion";

describe("parseCliVersion", () => {
  it("reads the version out of each CLI's --version prose", () => {
    expect(parseCliVersion("2.1.220 (Claude Code)")).toBe("2.1.220");
    expect(parseCliVersion("codex-cli 0.146.0")).toBe("0.146.0");
    expect(parseCliVersion("0.146.0\n")).toBe("0.146.0");
  });

  it("returns null when there's nothing version-shaped", () => {
    expect(parseCliVersion("command not found")).toBeNull();
    expect(parseCliVersion("")).toBeNull();
    // A two-part version isn't a semver triple — don't guess at the third part.
    expect(parseCliVersion("v2.1")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders by numeric segment, not lexically", () => {
    // The case that a string compare gets wrong.
    expect(compareVersions("2.1.220", "2.1.99")).toBeGreaterThan(0);
    expect(compareVersions("2.1.198", "2.1.220")).toBeLessThan(0);
    expect(compareVersions("2.1.220", "2.1.220")).toBe(0);
    expect(compareVersions("3.0.0", "2.9.9")).toBeGreaterThan(0);
  });

  it("treats missing or junk segments as zero", () => {
    expect(compareVersions("2.1", "2.1.0")).toBe(0);
    expect(compareVersions("2", "2.0.1")).toBeLessThan(0);
  });
});

describe("isBelowMinimum", () => {
  it("flags older versions only", () => {
    expect(isBelowMinimum("2.1.198", MIN_CLAUDE_CLI_VERSION)).toBe(true);
    expect(isBelowMinimum("2.1.219", MIN_CLAUDE_CLI_VERSION)).toBe(false);
    expect(isBelowMinimum("2.1.220", MIN_CLAUDE_CLI_VERSION)).toBe(false);
    expect(isBelowMinimum("0.142.5", MIN_CODEX_CLI_VERSION)).toBe(true);
    expect(isBelowMinimum("0.146.0", MIN_CODEX_CLI_VERSION)).toBe(false);
  });

  it("never flags an unknown version", () => {
    expect(isBelowMinimum(null, MIN_CLAUDE_CLI_VERSION)).toBe(false);
  });
});

describe("cliVersionWarning", () => {
  it("explains the consequence, not just the number", () => {
    const warning = cliVersionWarning("Claude", "2.1.198", MIN_CLAUDE_CLI_VERSION);
    expect(warning).toContain("2.1.198");
    expect(warning).toContain("2.1.219");
    expect(warning).toContain("truncate");
    expect(warning).toContain("@anthropic-ai/claude-code");
  });

  it("points Codex users at the right package", () => {
    expect(cliVersionWarning("Codex", "0.142.5", MIN_CODEX_CLI_VERSION)).toContain("@openai/codex");
  });

  it("stays quiet for current and unknown versions", () => {
    expect(cliVersionWarning("Claude", "2.1.220", MIN_CLAUDE_CLI_VERSION)).toBeNull();
    expect(cliVersionWarning("Claude", null, MIN_CLAUDE_CLI_VERSION)).toBeNull();
  });
});

describe("claudeSupports", () => {
  it("gates features on the version that introduced them", () => {
    expect(claudeSupports("2.1.220", "maxBudgetUsd")).toBe(true);
    expect(claudeSupports("2.1.216", "maxBudgetUsd")).toBe(false);
    expect(claudeSupports("2.1.217", "maxBudgetUsd")).toBe(true);
    expect(claudeSupports("2.1.211", "forwardSubagentText")).toBe(true);
    expect(claudeSupports("2.1.210", "forwardSubagentText")).toBe(false);
  });

  it("assumes support when the version is unknown", () => {
    // Better a loud CLI rejection than silently dropping a cap the user set.
    expect(claudeSupports(null, "maxBudgetUsd")).toBe(true);
  });
});
