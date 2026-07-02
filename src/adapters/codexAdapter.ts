import type { AgentConfig, ExecutionToolUse, FleetSettings } from "../types";
import { splitLines } from "../utils/platform";
import { setupCodexPermissions } from "./codexPermissions";
import { tryParseJson, warnJsonParseFailure } from "./parseHelpers";
import type {
  CliAdapter,
  ExecBuildOptions,
  ExecInvocation,
  ExecParseResult,
  PermissionSetupOptions,
  PermissionSetupState,
} from "./types";

/**
 * Codex CLI adapter.
 *
 * One-shot runs and chat turns both go through `codex exec --json`, which
 * emits one JSONL event per line:
 *
 *   {"type":"thread.started","thread_id":"<uuid>"}
 *   {"type":"turn.started"}
 *   {"type":"item.started"|"item.updated"|"item.completed","item":{...}}
 *   {"type":"turn.completed","usage":{input_tokens,cached_input_tokens,output_tokens,reasoning_output_tokens}}
 *   {"type":"turn.failed","error":{"message":"..."}}
 *   {"type":"error","message":"..."}
 *
 * Item types: agent_message {text}, reasoning {text}, command_execution
 * {command, aggregated_output, exit_code, status}, file_change {changes:[{path,kind}]},
 * mcp_tool_call {server, tool, status}, web_search {query}, todo_list, error {message}.
 *
 * Unlike Claude Code there is NO long-lived stdin/stdout chat process —
 * conversation continuity comes from `codex exec resume <thread_id>`, which
 * replays the session rollout stored under ~/.codex/sessions. ChatSession
 * spawns one process per turn and stores the thread id in the same slot it
 * uses for Claude session ids.
 *
 * Codex reports token usage but no dollar cost (there is no total_cost_usd
 * equivalent), so costUsd is always undefined for Codex runs.
 */

/** True for model strings that clearly belong to the Claude family. Used to
 *  stop a plugin-wide Claude default from leaking into a Codex invocation. */
export function isClaudeShapedModel(value: string): boolean {
  const v = value.trim();
  return /^(opus|sonnet|haiku|opusplan)$/i.test(v) || /claude|anthropic/i.test(v);
}

/** Map the plugin's Claude-scale effort values onto Codex's
 *  model_reasoning_effort vocabulary (low|medium|high|xhigh). */
export function mapCodexEffort(effort: string): string {
  const e = effort.trim().toLowerCase();
  if (!e) return "";
  if (e === "max") return "xhigh";
  if (["low", "medium", "high", "xhigh"].includes(e)) return e;
  return "";
}

/**
 * Map the agent's permissionMode onto Codex sandbox flags. `codex exec`
 * hardcodes approval policy to "never" (headless runs can't prompt), so the
 * sandbox is the only enforcement axis:
 *
 *   - Claude's bypassPermissions/dontAsk → --dangerously-bypass-approvals-and-sandbox
 *   - acceptEdits / default → --sandbox workspace-write ("default" can't ask
 *     headlessly; workspace-write is the closest safe behavior)
 *   - plan → --sandbox read-only
 *
 * Codex-native values (read-only / workspace-write / danger-full-access) are
 * accepted as-is so agents created with the Codex form round-trip cleanly.
 */
export function codexSandboxArgs(permissionMode: string | undefined): string[] {
  const mode = (permissionMode ?? "").trim();
  switch (mode) {
    case "plan":
    case "read-only":
      return ["--sandbox", "read-only"];
    case "acceptEdits":
    case "default":
    case "workspace-write":
      return ["--sandbox", "workspace-write"];
    case "danger-full-access":
      return ["--sandbox", "danger-full-access"];
    default:
      // bypassPermissions, dontAsk, "" and anything unknown — match the
      // Claude adapter's "bypass when unset" default.
      return ["--dangerously-bypass-approvals-and-sandbox"];
  }
}

/**
 * Build the `codex exec` argv. Pure. The prompt travels via stdin (positional
 * `-`) to dodge argv length limits on big agent prompts.
 *
 * MCP servers are NOT handled here — they're projected uniformly across both
 * adapters by `services/mcpProjection.ts` (which appends `-c mcp_servers.*`
 * overrides to this argv at run time). This keeps a single source of truth for
 * what servers a run sees, instead of a separate `codex mcp list` enumeration.
 */
export function buildCodexExecArgs(opts: ExecBuildOptions): { args: string[]; stdinPayload: string } {
  const args = ["exec", "--json", "--skip-git-repo-check"];

  const skipModel = opts.modelSource === "settings" && isClaudeShapedModel(opts.model);
  if (opts.model && !skipModel) {
    args.push("-m", opts.model);
  }

  const effort = mapCodexEffort(opts.effort);
  if (effort) {
    args.push("-c", `model_reasoning_effort="${effort}"`);
  }

  args.push(...codexSandboxArgs(opts.agent.permissionMode));

  // `resume` is a subcommand of exec; parent-level options must precede it.
  if (opts.resumeSessionId) {
    args.push("resume", opts.resumeSessionId);
  }

  args.push("-"); // read the prompt from stdin
  return { args, stdinPayload: opts.prompt };
}

// ═══════════════════════════════════════════════════════
//  JSONL event helpers (shared by exec parsing and chat)
// ═══════════════════════════════════════════════════════

type JsonRecord = Record<string, unknown>;

/** Parse one JSONL line into an object event, or null. Non-JSON lines are
 *  expected noise (CLI banners, progress text) and are skipped silently —
 *  parseExecOutput warns separately when NO line parsed at all. */
function parseJsonLine(line: string): JsonRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parsed = tryParseJson(trimmed);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as JsonRecord)
    : null;
}

function itemOf(event: JsonRecord): JsonRecord | null {
  const item = event.item;
  return item && typeof item === "object" ? (item as JsonRecord) : null;
}

/** Describe a tool-ish thread item for display / run-log purposes.
 *  Returns null for non-tool items (agent_message, reasoning, todo_list). */
export function describeCodexToolItem(item: JsonRecord): ExecutionToolUse | null {
  const type = typeof item.type === "string" ? item.type : "";
  if (type === "command_execution") {
    return {
      tool: "shell",
      command: typeof item.command === "string" ? item.command : undefined,
    };
  }
  if (type === "mcp_tool_call") {
    const server = typeof item.server === "string" ? item.server : "mcp";
    const tool = typeof item.tool === "string" ? item.tool : "tool";
    return { tool: `mcp__${server}__${tool}` };
  }
  if (type === "web_search") {
    return {
      tool: "web_search",
      command: typeof item.query === "string" ? item.query : undefined,
    };
  }
  if (type === "file_change") {
    const changes = Array.isArray(item.changes) ? (item.changes as JsonRecord[]) : [];
    const summary = changes
      .map((c) => `${typeof c.kind === "string" ? c.kind : "update"} ${typeof c.path === "string" ? c.path : ""}`.trim())
      .filter(Boolean)
      .join(", ");
    return { tool: "file_change", command: summary || undefined };
  }
  return null;
}

/** Token total from a turn.completed event: input + output. Cached input is
 *  a subset of input_tokens and reasoning a subset of output_tokens in the
 *  Codex usage shape, so summing all four would double-count. */
function tokensFromTurnCompleted(event: JsonRecord): number {
  const usage = event.usage as JsonRecord | undefined;
  if (!usage || typeof usage !== "object") return 0;
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  return input + output;
}

/** Context-usage proxy from a turn.completed event — the latest turn's input
 *  tokens approximate "how full is the thread right now". */
export function contextTokensFromTurnCompleted(event: JsonRecord): number {
  const usage = event.usage as JsonRecord | undefined;
  if (!usage || typeof usage !== "object") return 0;
  return typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
}

// ═══════════════════════════════════════════════════════
//  Chat-mode event translation
// ═══════════════════════════════════════════════════════

/** Per-turn parser state. agent_message items can arrive incrementally via
 *  item.updated — we track how much text per item id has already been
 *  emitted and only forward the unseen suffix. */
export interface CodexTurnParseState {
  emittedTextLengths: Map<string, number>;
}

export function newCodexTurnParseState(): CodexTurnParseState {
  return { emittedTextLengths: new Map() };
}

export type CodexChatSignal =
  | { kind: "session"; sessionId: string }
  | { kind: "text"; text: string }
  | { kind: "tool"; toolName: string; command?: string }
  | { kind: "usage"; contextTokens: number; totalTokens: number }
  | { kind: "turn-failed"; message: string }
  | { kind: "error"; message: string };

/**
 * Translate one Codex JSONL event into zero or more chat signals.
 * Stateless except for agent_message delta tracking via `state`.
 */
export function parseCodexChatEvent(event: JsonRecord, state: CodexTurnParseState): CodexChatSignal[] {
  const type = typeof event.type === "string" ? event.type : "";
  const signals: CodexChatSignal[] = [];

  if (type === "thread.started" && typeof event.thread_id === "string" && event.thread_id) {
    signals.push({ kind: "session", sessionId: event.thread_id });
    return signals;
  }

  if (type === "turn.completed") {
    signals.push({
      kind: "usage",
      contextTokens: contextTokensFromTurnCompleted(event),
      totalTokens: tokensFromTurnCompleted(event),
    });
    return signals;
  }

  if (type === "turn.failed") {
    const err = event.error as JsonRecord | undefined;
    const message = err && typeof err.message === "string" ? err.message : "turn failed";
    signals.push({ kind: "turn-failed", message });
    return signals;
  }

  if (type === "error") {
    const message = typeof event.message === "string" ? event.message : "stream error";
    signals.push({ kind: "error", message });
    return signals;
  }

  if (type === "item.started" || type === "item.updated" || type === "item.completed") {
    const item = itemOf(event);
    if (!item) return signals;
    const itemType = typeof item.type === "string" ? item.type : "";

    if (itemType === "agent_message") {
      const text = typeof item.text === "string" ? item.text : "";
      const id = typeof item.id === "string" ? item.id : "__single__";
      const already = state.emittedTextLengths.get(id) ?? 0;
      if (text.length > already) {
        signals.push({ kind: "text", text: text.slice(already) });
        state.emittedTextLengths.set(id, text.length);
      }
      return signals;
    }

    if (itemType === "error") {
      const message = typeof item.message === "string" ? item.message : "item error";
      signals.push({ kind: "error", message });
      return signals;
    }

    // Tool-ish items: surface once, when they start.
    if (type === "item.started") {
      const tool = describeCodexToolItem(item);
      if (tool) {
        signals.push({ kind: "tool", toolName: tool.tool, command: tool.command });
      }
    }
    return signals;
  }

  return signals;
}

// ═══════════════════════════════════════════════════════
//  Adapter implementation (one-shot exec)
// ═══════════════════════════════════════════════════════

export const codexAdapter: CliAdapter = {
  id: "codex",
  label: "Codex",

  cliPath(settings: FleetSettings): string {
    return settings.codexCliPath;
  },

  buildExec(opts: ExecBuildOptions): Promise<ExecInvocation> {
    const { args, stdinPayload } = buildCodexExecArgs(opts);
    return Promise.resolve({ cliPath: opts.settings.codexCliPath, args, stdinPayload });
  },

  parseExecOutput(stdout: string, stderr: string, _streaming: boolean): ExecParseResult {
    const agentMessages: string[] = [];
    const toolsUsed: ExecutionToolUse[] = [];
    const errors: string[] = [];
    let totalTokens = 0;
    let sessionId: string | undefined;
    let lastTurnCompleted: JsonRecord | undefined;
    let parsedAnyEvent = false;

    for (const line of splitLines(stdout)) {
      const event = parseJsonLine(line);
      if (!event) continue;
      parsedAnyEvent = true;
      const type = typeof event.type === "string" ? event.type : "";

      if (type === "thread.started" && typeof event.thread_id === "string") {
        sessionId = event.thread_id;
      } else if (type === "turn.completed") {
        totalTokens += tokensFromTurnCompleted(event);
        lastTurnCompleted = event;
      } else if (type === "turn.failed") {
        const err = event.error as JsonRecord | undefined;
        errors.push(err && typeof err.message === "string" ? err.message : "turn failed");
      } else if (type === "error") {
        errors.push(typeof event.message === "string" ? event.message : "stream error");
      } else if (type === "item.completed") {
        const item = itemOf(event);
        if (!item) continue;
        const itemType = typeof item.type === "string" ? item.type : "";
        if (itemType === "agent_message" && typeof item.text === "string" && item.text.trim()) {
          agentMessages.push(item.text);
        } else if (itemType === "error" && typeof item.message === "string") {
          errors.push(item.message);
        } else {
          const tool = describeCodexToolItem(item);
          if (tool) toolsUsed.push(tool);
        }
      }
    }

    // Non-JSON lines between events are expected; a non-empty stdout with NO
    // parseable JSONL event at all means the CLI's output format drifted (or
    // --json was ignored) — surface that instead of a silent "(no output)".
    if (!parsedAnyEvent && stdout.trim()) {
      warnJsonParseFailure("Codex exec output contained no parseable JSONL event", stdout.trim());
    }

    let outputText = agentMessages.join("\n\n").trim();
    if (!outputText) outputText = errors.join("\n").trim();
    if (!outputText) outputText = stderr.trim() || "(no output)";

    const lastMessage = agentMessages[agentMessages.length - 1];
    return {
      outputText,
      finalResult: lastMessage?.trim() ? lastMessage : undefined,
      tokensUsed: totalTokens > 0 ? totalTokens : undefined,
      // Codex emits no dollar-cost field — leave costUsd unset.
      costUsd: undefined,
      toolsUsed,
      concreteModel: undefined,
      rawJson: lastTurnCompleted,
      sessionId,
    };
  },

  extractStreamChunk(line: string): string | null {
    const event = parseJsonLine(line);
    if (!event) return null;
    const type = typeof event.type === "string" ? event.type : "";

    if (type === "item.completed") {
      const item = itemOf(event);
      if (item && item.type === "agent_message" && typeof item.text === "string" && item.text.trim()) {
        return item.text;
      }
      return null;
    }
    if (type === "item.started") {
      const item = itemOf(event);
      if (!item) return null;
      const tool = describeCodexToolItem(item);
      if (tool) {
        const cmd = tool.command ? `: ${tool.command.slice(0, 200)}` : "";
        return `\n▸ ${tool.tool}${cmd}\n`;
      }
      return null;
    }
    if (type === "turn.failed") {
      const err = event.error as JsonRecord | undefined;
      const message = err && typeof err.message === "string" ? err.message : "turn failed";
      return `\n✖ ${message}\n`;
    }
    return null;
  },

  setupPermissions(
    _cwd: string,
    agent: AgentConfig,
    settings: FleetSettings,
    _opts?: PermissionSetupOptions,
  ): Promise<PermissionSetupState | null> {
    // Sandbox mode + MCP scoping travel via CLI flags (see buildExec). On top
    // of that, an agent's permissionRules.allow/deny are translated into
    // Codex execpolicy rules and injected via a per-agent CODEX_HOME overlay.
    // Every failure path is soft — the run falls back to sandbox-only. The
    // remember MCP tool (allowRememberTool) is Claude-only, so _opts is ignored.
    return setupCodexPermissions(agent, settings);
  },
};
