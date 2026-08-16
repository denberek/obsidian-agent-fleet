import { describe, expect, it } from "vitest";
import { homedir } from "os";
import { join } from "path";
import {
  captureCli,
  resolveClaudeCliCandidates,
  resolveCodexCliCandidates,
  resolvePiCliCandidates,
} from "./platform";

// These run on the developer/CI host, which is Unix — the win32 branches are
// covered by the shared helper being identical modulo the extra dirs.
describe("CLI candidate resolution", () => {
  it("puts the configured path first and bare PATH resolution last", () => {
    for (const [resolve, bin] of [
      [resolveClaudeCliCandidates, "claude"],
      [resolveCodexCliCandidates, "codex"],
      [resolvePiCliCandidates, "pi"],
    ] as const) {
      const candidates = resolve(`/custom/${bin}`);
      expect(candidates[0]).toBe(`/custom/${bin}`);
      expect(candidates[candidates.length - 1]).toBe(bin);
      expect(candidates).toContain(`/usr/local/bin/${bin}`);
      expect(candidates).toContain(`/usr/bin/${bin}`);
      expect(candidates).toContain(join(homedir(), ".local", "bin", bin));
    }
  });

  it("keeps each CLI's installer-specific dirs", () => {
    expect(resolvePiCliCandidates("")).toContain(join(homedir(), ".pi", "bin", "pi"));
    if (process.platform === "darwin") {
      expect(resolvePiCliCandidates("")).toContain("/opt/homebrew/bin/pi");
      expect(resolveCodexCliCandidates("")).toContain("/opt/homebrew/bin/codex");
    }
  });

  it("drops empty and shell-metacharacter configured paths", () => {
    expect(resolvePiCliCandidates("")[0]).not.toBe("");
    expect(resolvePiCliCandidates("/evil;rm -rf /")).not.toContain("/evil;rm -rf /");
  });
});

describe("captureCli", () => {
  it("collects stdout with a zero exit", async () => {
    const result = await captureCli("node", ["-e", "console.log('probe-ok')"], { timeoutMs: 15_000 });
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("probe-ok");
  });

  it("reports a non-zero exit with ok=true so callers choose how much it matters", async () => {
    const result = await captureCli("node", ["-e", "console.log('partial'); process.exit(3)"], {
      timeoutMs: 15_000,
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe(3);
    expect(result.stdout).toContain("partial");
  });

  it("times out hung probes with ok=false", async () => {
    const result = await captureCli("node", ["-e", "setTimeout(() => {}, 30000)"], { timeoutMs: 500 });
    expect(result.ok).toBe(false);
    expect(result.code).toBeNull();
  });
});
