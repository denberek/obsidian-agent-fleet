import type { AgentConfig, ExecutionToolUse, FleetSettings, ModelSource } from "../types";

/** Canonical adapter ids. Anything unknown in agent frontmatter normalizes
 *  to "claude-code" (see `normalizeAdapter`). */
export type AdapterId = "claude-code" | "codex";

export interface ExecBuildOptions {
  prompt: string;
  /** Resolved model value ("" = omit the model flag entirely). */
  model: string;
  /** Which layer the model came from. Adapters use this to ignore
   *  cross-vendor fallbacks (a plugin-wide Claude default must not be
   *  passed to Codex, and vice versa). */
  modelSource: ModelSource;
  /** Reasoning effort ("" = omit). Stored values follow the Claude scale
   *  (low/medium/high/max); adapters map to their own vocabulary. */
  effort: string;
  agent: AgentConfig;
  settings: FleetSettings;
  /** True when stream events are consumed live while the process runs. */
  streaming: boolean;
  /** Chat-mode only: provider session/thread id to resume. One-shot task
   *  execution leaves this undefined. */
  resumeSessionId?: string | null;
}

export interface ExecInvocation {
  cliPath: string;
  args: string[];
  /** Written to stdin right after spawn, then stdin is closed. Both adapters
   *  use this to dodge OS argv length limits (Windows: 32 767 chars). */
  stdinPayload?: string;
}

export interface ExecParseResult {
  outputText: string;
  finalResult?: string;
  tokensUsed?: number;
  costUsd?: number;
  toolsUsed: ExecutionToolUse[];
  concreteModel?: string;
  rawJson?: unknown;
  /** Provider session/thread id parsed from the output, when the adapter
   *  emits one (Codex: thread.started). Unused by one-shot task runs. */
  sessionId?: string;
}

/** Opaque cleanup handle returned by `setupPermissions`. */
export interface PermissionSetupState {
  restore(): void;
  /** Extra environment variables to inject into the spawned process.
   *  Codex uses this to point the run at a per-agent `CODEX_HOME` overlay
   *  carrying its execpolicy rules; Claude leaves it undefined. */
  env?: Record<string, string>;
}

/**
 * One CLI backend (Claude Code, Codex). Owns everything that differs between
 * vendors for one-shot execution: argument construction, output parsing, and
 * on-disk permission configuration. Chat-mode protocol differences are too
 * structural for this interface — ChatSession branches on `normalizeAdapter`
 * and uses the codex helpers exported from codexAdapter directly.
 */
export interface CliAdapter {
  readonly id: AdapterId;
  /** Display name for notices and log lines ("Claude Code", "Codex"). */
  readonly label: string;
  cliPath(settings: FleetSettings): string;
  /** Build the one-shot (or per-turn) invocation. Async because Codex may
   *  need to enumerate configured MCP servers first. */
  buildExec(opts: ExecBuildOptions): Promise<ExecInvocation>;
  /** Parse the full stdout after the process closes. */
  parseExecOutput(stdout: string, stderr: string, streaming: boolean): ExecParseResult;
  /** Displayable text chunk from one stdout line during live streaming, or null. */
  extractStreamChunk(line: string): string | null;
  /** Install permission config before spawn (Claude: a temporary
   *  `.claude/settings.local.json` at cwd; Codex: a per-agent `CODEX_HOME`
   *  overlay carrying execpolicy rules). Returns a restore handle plus any
   *  env to inject into the spawn, or null when nothing is installed. Async
   *  because Codex feature-detects and validates rules via a subprocess. */
  setupPermissions(
    cwd: string,
    agent: AgentConfig,
    settings: FleetSettings,
    opts?: PermissionSetupOptions,
  ): Promise<PermissionSetupState | null>;
}

/** Extra knobs for `setupPermissions`. */
export interface PermissionSetupOptions {
  /** Names of the MCP servers projected into this run (Claude only). Each
   *  becomes an `mcp__<name>` allow entry so the server's tools are usable
   *  without an approval prompt. Includes the synthetic `remember` tool. */
  mcpAllowServers?: string[];
}
