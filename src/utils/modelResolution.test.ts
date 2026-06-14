import { describe, expect, it } from "vitest";
import { CLI_DEFAULT_SENTINELS, resolveModel, shouldPassModelFlag } from "./modelResolution";

function agent(model: string) {
  return { model };
}
function settings(defaultModel: string) {
  return { defaultModel };
}

describe("resolveModel", () => {
  it("prefers task over agent over settings", () => {
    const r = resolveModel({ model: "haiku" }, agent("opus"), settings("sonnet"));
    expect(r).toEqual({ value: "haiku", source: "task" });
  });

  it("falls through to agent when task model is absent", () => {
    const r = resolveModel(null, agent("opus"), settings("sonnet"));
    expect(r).toEqual({ value: "opus", source: "agent" });
  });

  it("falls through to settings when agent model is empty", () => {
    const r = resolveModel(null, agent(""), settings("sonnet"));
    expect(r).toEqual({ value: "sonnet", source: "settings" });
  });

  it("returns cli-default when nothing is set", () => {
    const r = resolveModel(null, agent(""), settings(""));
    expect(r).toEqual({ value: "", source: "cli-default" });
  });

  it("treats 'default' sentinel at any level as empty but preserves source attribution", () => {
    const r = resolveModel(null, agent("default"), settings("opus"));
    expect(r).toEqual({ value: "", source: "agent" });
  });

  it("treats 'subscription' sentinel as empty", () => {
    const r = resolveModel({ model: "subscription" }, agent("opus"), settings(""));
    expect(r).toEqual({ value: "", source: "task" });
  });

  it("ignores whitespace-only task model", () => {
    const r = resolveModel({ model: "   " }, agent("opus"), settings(""));
    expect(r).toEqual({ value: "opus", source: "agent" });
  });

  it("passes Bedrock-style IDs through unchanged", () => {
    const r = resolveModel(
      null,
      agent("us.anthropic.claude-opus-4-7"),
      settings(""),
    );
    expect(r).toEqual({ value: "us.anthropic.claude-opus-4-7", source: "agent" });
  });

  it("passes Vertex-style IDs through unchanged", () => {
    const r = resolveModel(null, agent("claude-opus-4-7@20251101"), settings(""));
    expect(r).toEqual({ value: "claude-opus-4-7@20251101", source: "agent" });
  });

  it("trims surrounding whitespace on resolved value", () => {
    const r = resolveModel({ model: "  haiku  " }, agent("opus"), settings(""));
    expect(r).toEqual({ value: "haiku", source: "task" });
  });
});

describe("shouldPassModelFlag", () => {
  it("returns false for sentinels", () => {
    for (const s of CLI_DEFAULT_SENTINELS) {
      expect(shouldPassModelFlag(s)).toBe(false);
    }
  });

  it("returns true for real model strings", () => {
    expect(shouldPassModelFlag("opus")).toBe(true);
    expect(shouldPassModelFlag("claude-opus-4-7")).toBe(true);
    expect(shouldPassModelFlag("us.anthropic.claude-opus-4-7")).toBe(true);
  });

  it("returns false for whitespace-only", () => {
    expect(shouldPassModelFlag("   ")).toBe(false);
  });
});
