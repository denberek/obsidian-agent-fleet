import { claudeCodeAdapter } from "./claudeCodeAdapter";
import { codexAdapter } from "./codexAdapter";
import { piAdapter } from "./piAdapter";
import type { AdapterId, CliAdapter } from "./types";

export type { AdapterId, CliAdapter, ExecBuildOptions, ExecInvocation, ExecParseResult, PermissionSetupState } from "./types";

/**
 * Normalize the raw `adapter` frontmatter value to a canonical id.
 * Accepts the historical "openai-codex" spelling; anything unknown falls
 * back to claude-code so old/foreign agent files keep working.
 */
export function normalizeAdapter(value: string | undefined): AdapterId {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "codex" || v === "openai-codex") return "codex";
  if (v === "pi" || v === "pi-coding-agent") return "pi";
  return "claude-code";
}

/** Resolve the CLI adapter for an agent's `adapter` frontmatter value. */
export function getAdapter(value: string | undefined): CliAdapter {
  switch (normalizeAdapter(value)) {
    case "codex":
      return codexAdapter;
    case "pi":
      return piAdapter;
    default:
      return claudeCodeAdapter;
  }
}
