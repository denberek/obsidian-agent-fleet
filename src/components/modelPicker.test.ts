import { describe, expect, it } from "vitest";
import { CODEX_MODEL_ALIASES, MODEL_ALIASES, retiredModelNotice } from "./modelPicker";

describe("MODEL_ALIASES", () => {
  it("mirrors the Claude Code CLI alias set", () => {
    expect(MODEL_ALIASES.map((a) => a.value)).toEqual(["opus", "sonnet", "haiku", "fable"]);
  });

  it("no longer offers opusplan (dropped from the CLI alias set)", () => {
    expect(MODEL_ALIASES.some((a) => a.value === "opusplan")).toBe(false);
  });
});

describe("CODEX_MODEL_ALIASES", () => {
  it("offers the gpt-5.6 tiers", () => {
    const values = CODEX_MODEL_ALIASES.map((a) => a.value);
    expect(values).toContain("gpt-5.6-sol");
    expect(values).toContain("gpt-5.6-terra");
    expect(values).toContain("gpt-5.6-luna");
  });

  it("drops slugs that are retired or deprecated in Codex", () => {
    const values = CODEX_MODEL_ALIASES.map((a) => a.value);
    expect(values).not.toContain("gpt-5.4");
    expect(values).not.toContain("gpt-5.4-mini");
    expect(values).not.toContain("gpt-5.3-codex");
  });
});

describe("retiredModelNotice", () => {
  it("flags slugs retiring on 2026-08-31", () => {
    expect(retiredModelNotice("gpt-5.4")).toMatch(/2026-08-31/);
    expect(retiredModelNotice("gpt-5.4-mini")).toMatch(/2026-08-31/);
  });

  it("flags already-deprecated slugs", () => {
    expect(retiredModelNotice("gpt-5.3-codex")).toMatch(/deprecated/);
    expect(retiredModelNotice("gpt-5.2")).toMatch(/deprecated/);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(retiredModelNotice("  GPT-5.4  ")).toMatch(/2026-08-31/);
  });

  it("returns null for current and unknown values", () => {
    expect(retiredModelNotice("gpt-5.6-terra")).toBeNull();
    expect(retiredModelNotice("gpt-5.5")).toBeNull();
    expect(retiredModelNotice("opus")).toBeNull();
    expect(retiredModelNotice("claude-opus-5")).toBeNull();
    expect(retiredModelNotice("")).toBeNull();
  });

  it("leaves pinned vendor ids alone rather than guessing", () => {
    // Only bare slugs are matched — a Bedrock/Vertex-shaped id that merely
    // contains a retired version is not something we can classify safely.
    expect(retiredModelNotice("some-vendor/gpt-5.4-custom")).toBeNull();
  });
});

