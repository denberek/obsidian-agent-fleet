import { describe, expect, it } from "vitest";
import {
  isCodexAdapterValue,
  isPiAdapterValue,
  keptModeCaption,
  modelAfterAdapterSwitch,
} from "./shared";

describe("adapter value predicates", () => {
  it("accept canonical and alternate spellings", () => {
    expect(isCodexAdapterValue("codex")).toBe(true);
    expect(isCodexAdapterValue("openai-codex")).toBe(true);
    expect(isPiAdapterValue("pi")).toBe(true);
    expect(isPiAdapterValue("pi-coding-agent")).toBe(true);
  });

  it("reject the other families", () => {
    expect(isCodexAdapterValue("claude-code")).toBe(false);
    expect(isCodexAdapterValue("pi")).toBe(false);
    expect(isPiAdapterValue("codex")).toBe(false);
    expect(isPiAdapterValue("claude-code")).toBe(false);
  });
});

describe("modelAfterAdapterSwitch", () => {
  it("keeps every shape when switching to Pi (multi-provider)", () => {
    expect(modelAfterAdapterSwitch("opus", "pi")).toBe("opus");
    expect(modelAfterAdapterSwitch("gpt-5.6-terra", "pi")).toBe("gpt-5.6-terra");
    expect(modelAfterAdapterSwitch("anthropic/claude-opus-5", "pi-coding-agent")).toBe(
      "anthropic/claude-opus-5",
    );
  });

  it("clears the other vendor's alias on a claude ↔ codex switch", () => {
    expect(modelAfterAdapterSwitch("gpt-5.6-terra", "claude-code")).toBe("");
    expect(modelAfterAdapterSwitch("opus", "codex")).toBe("");
  });

  it("keeps the target family's own alias", () => {
    expect(modelAfterAdapterSwitch("opus", "claude-code")).toBe("opus");
    expect(modelAfterAdapterSwitch("gpt-5.6-terra", "codex")).toBe("gpt-5.6-terra");
  });

  it("clears Pi's provider-qualified catalog values when leaving Pi", () => {
    expect(modelAfterAdapterSwitch("anthropic/claude-opus-5", "claude-code")).toBe("");
    expect(modelAfterAdapterSwitch("openai-codex/gpt-5.6-terra", "codex")).toBe("");
  });

  it("keeps Bedrock ARNs — slashes there are not a Pi catalog shape", () => {
    const arn = "arn:aws:bedrock:us-west-2:123:inference-profile/us.anthropic.claude-opus-5";
    expect(modelAfterAdapterSwitch(arn, "claude-code")).toBe(arn);
  });

  it("keeps bare custom values and sentinels untouched", () => {
    expect(modelAfterAdapterSwitch("claude-opus-5", "claude-code")).toBe("claude-opus-5");
    expect(modelAfterAdapterSwitch("", "codex")).toBe("");
    expect(modelAfterAdapterSwitch("default", "claude-code")).toBe("default");
  });
});

describe("keptModeCaption", () => {
  it("mirrors piToolsArgs: plan/read-only are read-only tools, not Full Access", () => {
    expect(keptModeCaption("read-only", "pi")).toBe("runs with read-only tools on Pi");
    expect(keptModeCaption("plan", "pi")).toBe("runs with read-only tools on Pi");
  });

  it("labels genuinely unrestricted kept modes as Full Access", () => {
    expect(keptModeCaption("acceptEdits", "pi")).toBe("runs as Full Access on Pi");
    expect(keptModeCaption("workspace-write", "pi-coding-agent")).toBe("runs as Full Access on Pi");
  });

  it("never shows the Pi caption on a non-Pi form", () => {
    expect(keptModeCaption("someMode", "codex")).toBe("kept as saved");
    expect(keptModeCaption("someMode", "claude-code")).toBe("kept as saved");
  });
});
