import type { AgentConfig, ExecutionToolUse, FleetSettings, JsonValue } from "../types";
import { splitLines } from "../utils/platform";
import { formatStructuredOutput, isJsonValue } from "../utils/structuredOutput";
import { claudeSupports } from "../utils/cliVersion";
import { restoreClaudeSettingsFile, writeClaudeSettingsFile } from "../utils/claudeSettings";
import { parseJsonLoud, tryParseJson, warnJsonParseFailure } from "./parseHelpers";
import type { RunLimitKind } from "../types";
import type {
  CliAdapter,
  ExecBuildOptions,
  ExecInvocation,
  ExecParseResult,
  McpServerError,
  PermissionSetupOptions,
  PermissionSetupState,
} from "./types";

const MAX_FORWARDED_TRANSCRIPT_CHARS = 1024 * 1024;
const MAX_SUBAGENT_DEPTH = 3;

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = (value as unknown[])
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  }
  if (value && typeof value === "object") {
    for (const key of ["output", "result", "text", "message"]) {
      if (key in value) {
        return extractText((value as Record<string, unknown>)[key]);
      }
    }
  }
  return undefined;
}

function collectToolUses(value: unknown, acc: ExecutionToolUse[] = []): ExecutionToolUse[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectToolUses(item, acc);
    }
    return acc;
  }
  if (!value || typeof value !== "object") {
    return acc;
  }

  const record = value as Record<string, unknown>;
  const candidateTool =
    (typeof record.tool_name === "string" && record.tool_name) ||
    (typeof record.tool === "string" && record.tool) ||
    (typeof record.name === "string" && record.name);
  const candidateCommand = typeof record.command === "string"
    ? record.command
    : typeof record.input === "string"
      ? record.input
      : typeof record.cmd === "string"
        ? record.cmd
        : undefined;
  const candidateReason = typeof record.reason === "string" ? record.reason : undefined;

  if (candidateTool && ["tool_use", "tool", "name", "tool_name"].some((key) => key in record)) {
    acc.push({
      tool: candidateTool,
      command: candidateCommand,
      reason: candidateReason,
    });
  }

  for (const child of Object.values(record)) {
    collectToolUses(child, acc);
  }

  return acc;
}

/**
 * Extract total token count from Claude CLI output. The CLI returns two
 * token structures in the result event:
 *
 *   usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }
 *   modelUsage: { "<model-id>": { inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens } }
 *
 * We prefer `usage` (aggregate across models), falling back to `modelUsage`.
 * Total = input + output + cache_creation + cache_read (all token types that
 * count toward billing). Falls back to legacy field names for older CLI versions.
 */
function extractTokens(value: unknown): number | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const root = value as Record<string, unknown>;

  // Try the aggregate `usage` object (snake_case, present on result events)
  const usage = root.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
    const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
    const cacheCreate = typeof usage.cache_creation_input_tokens === "number" ? usage.cache_creation_input_tokens : 0;
    const cacheRead = typeof usage.cache_read_input_tokens === "number" ? usage.cache_read_input_tokens : 0;
    const total = input + output + cacheCreate + cacheRead;
    if (total > 0) return total;
  }

  // Try per-model `modelUsage` (camelCase, keyed by model id)
  const modelUsage = root.modelUsage as Record<string, unknown> | undefined;
  if (modelUsage && typeof modelUsage === "object") {
    let total = 0;
    for (const model of Object.values(modelUsage)) {
      if (!model || typeof model !== "object") continue;
      const m = model as Record<string, unknown>;
      total += typeof m.inputTokens === "number" ? m.inputTokens : 0;
      total += typeof m.outputTokens === "number" ? m.outputTokens : 0;
      total += typeof m.cacheReadInputTokens === "number" ? m.cacheReadInputTokens : 0;
      total += typeof m.cacheCreationInputTokens === "number" ? m.cacheCreationInputTokens : 0;
    }
    if (total > 0) return total;
  }

  // Legacy field names (older CLI versions)
  for (const key of ["tokens_used", "total_tokens", "totalTokens"]) {
    if (typeof root[key] === "number") {
      return root[key];
    }
  }

  // Recurse into child objects (e.g. stream-json where result is nested)
  for (const child of Object.values(root)) {
    const nested = extractTokens(child);
    if (typeof nested === "number") {
      return nested;
    }
  }

  return undefined;
}

/** Extract total cost in USD from Claude CLI output (`total_cost_usd` field). */
function extractCostUsd(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  if (typeof root.total_cost_usd === "number") return root.total_cost_usd;
  for (const child of Object.values(root)) {
    const nested = extractCostUsd(child);
    if (typeof nested === "number") return nested;
  }
  return undefined;
}

/**
 * Extract the final result string from a parsed `type: "result"` event.
 * That event carries `result: "<final text>"` — the last assistant message
 * content after any tool-use narration. Returns undefined for other event
 * shapes so callers can safely compose this against every stream line.
 */
export function extractFinalResult(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  if (root.type === "result" && typeof root.result === "string" && root.result.trim()) {
    return root.result;
  }
  return undefined;
}

/** Validated JSON emitted by Claude Code for `--json-schema` runs. */
export function extractStructuredOutput(value: unknown): JsonValue | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  if (root.type !== "result" || !Object.prototype.hasOwnProperty.call(root, "structured_output")) {
    return undefined;
  }
  return isJsonValue(root.structured_output) ? root.structured_output : undefined;
}

function prefixNestedText(text: string, depth: number, kind: "text" | "thinking"): string {
  if (depth <= 0) return text;
  const indent = "  ".repeat(Math.min(depth - 1, MAX_SUBAGENT_DEPTH - 1));
  const marker = kind === "thinking" ? "↳ Subagent thinking: " : "↳ Subagent: ";
  return text
    .split("\n")
    .map((line, index) => `${indent}${index === 0 ? marker : "  "}${line}`)
    .join("\n");
}

/**
 * Reconstruct a readable transcript from Claude stream-json events.
 * `parent_tool_use_id` points at the tool block that spawned a subagent; tool
 * ids are mapped to their emitting depth so nested work remains ordered and
 * visually distinct rather than being interleaved as anonymous prose.
 */
export function extractClaudeTranscript(stdout: string): string {
  const toolDepth = new Map<string, number>();
  const parts: string[] = [];
  let length = 0;
  let truncated = false;

  const append = (text: string) => {
    if (!text.trim() || truncated) return;
    const separator = parts.length > 0 ? "\n\n" : "";
    const remaining = MAX_FORWARDED_TRANSCRIPT_CHARS - length - separator.length;
    if (remaining <= 0) {
      truncated = true;
      return;
    }
    const next = text.length > remaining ? text.slice(0, remaining) : text;
    parts.push(`${separator}${next}`);
    length += separator.length + next.length;
    if (next.length < text.length) truncated = true;
  };

  for (const line of splitLines(stdout)) {
    const parsed = tryParseJson(line.trim());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const event = parsed as Record<string, unknown>;
    const type = typeof event.type === "string" ? event.type : "";
    if (type !== "assistant" && type !== "user") continue;

    const parentId = typeof event.parent_tool_use_id === "string" ? event.parent_tool_use_id : "";
    const depth = parentId
      ? Math.min((toolDepth.get(parentId) ?? 0) + 1, MAX_SUBAGENT_DEPTH)
      : 0;
    const message = event.message as Record<string, unknown> | undefined;
    const content = Array.isArray(message?.content)
      ? (message.content as Array<Record<string, unknown>>)
      : [];

    for (const block of content) {
      if (block.type === "tool_use" && typeof block.id === "string") {
        toolDepth.set(block.id, depth);
      }
      if (block.type === "text" && typeof block.text === "string") {
        append(prefixNestedText(block.text, depth, "text"));
      } else if (depth > 0 && block.type === "thinking" && typeof block.thinking === "string") {
        append(prefixNestedText(block.thinking, depth, "thinking"));
      }
    }
  }

  if (truncated) {
    parts.push("\n\n[Forwarded subagent transcript truncated at 1 MB]");
  }
  return parts.join("").trim();
}

/**
 * Pull the concrete model ID Claude Code resolved (e.g. when we asked for
 * "opus" the CLI expanded it to "claude-opus-5"). Direct event fields are
 * authoritative. A terminal result can contain multiple `modelUsage` entries
 * (for example a small internal Haiku classifier plus the requested Opus
 * model), so that fallback selects the highest-cost/usage entry instead of
 * blindly taking insertion order.
 * Returns undefined if no event carried it.
 */
export function extractConcreteModel(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;

  // assistant event: { message: { model: "claude-opus-5" } }
  const msg = root.message as Record<string, unknown> | undefined;
  if (msg && typeof msg.model === "string" && msg.model) return msg.model;

  // system init event: { model: "claude-opus-5" }
  if (typeof root.model === "string" && root.model) return root.model;

  // result event: { modelUsage: { "claude-opus-5": {...} } }
  if (root.modelUsage && typeof root.modelUsage === "object") {
    let bestKey: string | undefined;
    let bestCost = Number.NEGATIVE_INFINITY;
    let bestTokens = Number.NEGATIVE_INFINITY;
    for (const [key, rawUsage] of Object.entries(root.modelUsage)) {
      const usage = rawUsage && typeof rawUsage === "object"
        ? rawUsage as Record<string, unknown>
        : {};
      const cost = typeof usage.costUSD === "number" ? usage.costUSD : Number.NEGATIVE_INFINITY;
      const tokens = ["inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens"]
        .reduce((sum, field) => sum + (typeof usage[field] === "number" ? usage[field] : 0), 0);
      if (bestKey === undefined || cost > bestCost || (cost === bestCost && tokens > bestTokens)) {
        bestKey = key;
        bestCost = cost;
        bestTokens = tokens;
      }
    }
    if (bestKey) return bestKey;
  }

  for (const child of Object.values(root)) {
    const nested = extractConcreteModel(child);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * True for model strings that clearly belong to the OpenAI/Codex family.
 * Used to stop a plugin-wide Codex default from leaking into a Claude
 * invocation when an agent inherits `settings.defaultModel`.
 */
export function isCodexShapedModel(value: string): boolean {
  return /^gpt-|codex/i.test(value.trim());
}

/**
 * Which configured limit ended the run, read from the terminal `type: "result"`
 * event's `subtype`. Claude Code reports limit stops as `error_max_*`
 * subtypes (e.g. `error_max_turns`). We match on the limit name rather than
 * an exact string so a renamed or reworded budget subtype still lands here —
 * the cost of a miss is reporting a deliberate stop as a failure, which is
 * exactly the confusion this exists to prevent.
 *
 * Returns undefined for a normal `success` result or any other event shape.
 */
export function extractLimitHit(value: unknown): RunLimitKind | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  if (root.type !== "result") return undefined;
  const subtype = typeof root.subtype === "string" ? root.subtype : "";
  if (!subtype || !/^error_/i.test(subtype)) return undefined;
  if (/budget|spend|cost/i.test(subtype)) return "budget";
  if (/turns?/i.test(subtype)) return "turns";
  return undefined;
}

/**
 * MCP servers the CLI refused to load, from the headless init event's
 * `mcp_server_errors` field (Claude Code 2.1.219+). Shape-tolerant: the field
 * is young and we'd rather degrade to "nothing reported" than throw inside a
 * parse path. An empty array therefore means "the CLI told us nothing", not
 * "every server is healthy" — older CLIs don't emit the field at all.
 */
export function extractMcpServerErrors(value: unknown): McpServerError[] {
  if (!value || typeof value !== "object") return [];
  const raw = (value as Record<string, unknown>).mcp_server_errors;
  if (!Array.isArray(raw)) return [];

  const out: McpServerError[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      out.push({ name: entry, message: "" });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name =
      (typeof e.name === "string" && e.name) || (typeof e.server === "string" && e.server) || "";
    const message =
      (typeof e.error === "string" && e.error) || (typeof e.message === "string" && e.message) || "";
    if (name || message) out.push({ name: name || "(unnamed)", message });
  }
  return out;
}

export const claudeCodeAdapter: CliAdapter = {
  id: "claude-code",
  label: "Claude Code",

  cliPath(settings: FleetSettings): string {
    return settings.claudeCliPath;
  },

  buildExec(opts: ExecBuildOptions): Promise<ExecInvocation> {
    const detectedVersion = opts.settings.claudeCliVersion ?? null;
    if (opts.budgetUsd !== undefined && !claudeSupports(detectedVersion, "maxBudgetUsd")) {
      throw new Error(
        `Claude CLI ${detectedVersion} does not support configured spend limits; update Claude Code before running this task.`,
      );
    }
    if (opts.forwardSubagentText && !claudeSupports(detectedVersion, "forwardSubagentText")) {
      throw new Error(
        `Claude CLI ${detectedVersion} does not support forwarded subagent output; update Claude Code or disable it for this agent.`,
      );
    }
    if (opts.outputSchema && !claudeSupports(detectedVersion, "jsonSchema")) {
      throw new Error(
        `Claude CLI ${detectedVersion} does not support validated JSON schemas; update Claude Code before running this task.`,
      );
    }
    const args = [
      "-p",
      "--output-format",
      opts.streaming ? "stream-json" : "json",
    ];
    if (opts.streaming) {
      args.push("--verbose");
    }
    // Skip a plugin-wide default that's shaped like a Codex model — the
    // Claude CLI would reject it. Explicit per-agent/per-task values pass
    // through untouched (the user asked for them).
    const skipModel = opts.modelSource === "settings" && isCodexShapedModel(opts.model);
    if (opts.model && !skipModel) {
      args.push("--model", opts.model);
    }
    if (opts.effort) {
      args.push("--effort", opts.effort);
    }

    // Run stop limits. Scheduled runs are unattended, so these are the only
    // thing standing between a looping task and an unbounded bill. Both are
    // Claude-only — Codex has no equivalent and ignores them.
    if (opts.budgetUsd !== undefined) {
      args.push("--max-budget-usd", String(opts.budgetUsd));
    }
    if (opts.maxTurns !== undefined) {
      args.push("--max-turns", String(opts.maxTurns));
    }

    // Subagent transcripts require -p + stream-json + --verbose together. We
    // pass all three only on the streaming path, so gate the flag on it rather
    // than handing the CLI a combination it rejects.
    if (opts.forwardSubagentText && opts.streaming) {
      args.push("--forward-subagent-text");
    }

    // Structured output. Print-mode only, which is always true here (-p).
    if (opts.outputSchema) {
      args.push("--json-schema", opts.outputSchema);
    }

    // Pass --permission-mode explicitly. Claude Code v2.1.x requires this
    // CLI flag to opt-out of the spawned-subprocess sandbox; relying on
    // `defaultMode` in settings.local.json alone leaves Bash sandboxed,
    // which breaks Wiki Keeper's `mv inbox/file archive/...` (model falls
    // back to Write, copying without deleting source).
    const permMode = opts.agent.permissionMode?.trim();
    if (permMode && permMode !== "default") {
      args.push("--permission-mode", permMode);
    } else {
      args.push("--permission-mode", "bypassPermissions");
    }

    return Promise.resolve({ cliPath: opts.settings.claudeCliPath, args, stdinPayload: opts.prompt });
  },

  parseExecOutput(stdout: string, stderr: string, streaming: boolean): ExecParseResult {
    const trimmed = stdout.trim();
    let rawJson: unknown;

    if (streaming) {
      // stream-json: find the last parseable event (normally the "result"
      // line). Individual non-JSON lines are expected (banners, verbose
      // noise) — but a stream with NO parseable event at all is a real
      // failure worth surfacing.
      const lines = splitLines(trimmed);
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]?.trim();
        if (!line) continue;
        const parsed = tryParseJson(line);
        if (parsed && typeof parsed === "object") {
          rawJson = parsed;
          break;
        }
      }
      if (rawJson === undefined && trimmed) {
        warnJsonParseFailure("Claude Code stream-json output contained no parseable JSON event", trimmed);
      }
    } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      rawJson = parseJsonLoud("Claude Code JSON output failed to parse", trimmed);
    }

    let outputText = streaming ? extractClaudeTranscript(trimmed) : (extractText(rawJson) ?? "");

    // Scan every stream-json line so we catch the concrete model even
    // when rawJson is only the final result line. System init and the
    // first assistant event both carry it.
    // Streaming output is scanned chronologically below so the authoritative
    // init/assistant model wins over a terminal result's helper-model usage.
    let concreteModel: string | undefined = streaming ? undefined : extractConcreteModel(rawJson);
    let finalResult: string | undefined = extractFinalResult(rawJson);
    let structuredOutput: JsonValue | undefined = extractStructuredOutput(rawJson);
    // `mcp_server_errors` rides the init event, which is the FIRST line — the
    // opposite end of the stream from rawJson — so it can only come from a scan.
    let mcpServerErrors: McpServerError[] = extractMcpServerErrors(rawJson);
    let seenInit = false;
    const toolsUsed: ExecutionToolUse[] = [];

    if (streaming) {
      for (const line of splitLines(trimmed)) {
        const l = line.trim();
        if (!l) continue;
        const ev = tryParseJson(l); // non-JSON noise is expected, skip silently
        if (ev === undefined) continue;
        if (!concreteModel) {
          const m = extractConcreteModel(ev);
          if (m) concreteModel = m;
        }
        if (!finalResult) {
          const r = extractFinalResult(ev);
          if (r) finalResult = r;
        }
        if (structuredOutput === undefined) {
          structuredOutput = extractStructuredOutput(ev);
        }
        collectToolUses(ev, toolsUsed);
        if (!seenInit && (ev as { type?: unknown }).type === "system") {
          seenInit = true;
          const errors = extractMcpServerErrors(ev);
          if (errors.length > 0) mcpServerErrors = errors;
        }
      }
    } else {
      collectToolUses(rawJson, toolsUsed);
    }

    if (!finalResult && structuredOutput !== undefined) {
      finalResult = formatStructuredOutput(structuredOutput);
    }
    if (!outputText) outputText = finalResult ?? (stderr.trim() || "(no output)");

    return {
      outputText,
      finalResult,
      structuredOutput,
      tokensUsed: extractTokens(rawJson),
      costUsd: extractCostUsd(rawJson),
      toolsUsed,
      concreteModel,
      rawJson,
      // The terminal result event is the last parseable line, i.e. rawJson.
      limitHit: extractLimitHit(rawJson),
      mcpServerErrors: mcpServerErrors.length > 0 ? mcpServerErrors : undefined,
    };
  },

  extractStreamChunk(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    // Live per-line parsing — non-JSON lines are expected noise, skip silently.
    const parsed = tryParseJson(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const event = parsed as Record<string, unknown>;
    const type = event.type as string | undefined;

    // Assistant message: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
    if (type === "assistant") {
      const msg = event.message as Record<string, unknown> | undefined;
      if (msg?.content && Array.isArray(msg.content)) {
        const parts: string[] = [];
        const isSubagent = typeof event.parent_tool_use_id === "string" && event.parent_tool_use_id.length > 0;
        for (const block of msg.content as Array<Record<string, unknown>>) {
          if (block.type === "text" && typeof block.text === "string") {
            parts.push(isSubagent ? prefixNestedText(block.text, 1, "text") : block.text);
          } else if (isSubagent && block.type === "thinking" && typeof block.thinking === "string") {
            parts.push(prefixNestedText(block.thinking, 1, "thinking"));
          } else if (block.type === "tool_use") {
            const name = String(block.name ?? "tool");
            const input = block.input as Record<string, unknown> | undefined;
            const cmd = input?.command ?? input?.content ?? "";
            parts.push(`\n▸ ${name}${cmd ? `: ${String(cmd).slice(0, 200)}` : ""}\n`);
          }
        }
        if (parts.length > 0) return parts.join("");
      }
    }

    // Result: {"type":"result","result":"..."}
    if (type === "result") {
      const result = typeof event.result === "string" ? event.result : null;
      if (result) return `\n${result}`;
    }

    return null;
  },

  setupPermissions(
    cwd: string,
    agent: AgentConfig,
    settings: FleetSettings,
    opts?: PermissionSetupOptions,
  ): Promise<PermissionSetupState | null> {
    const state = writeClaudeSettingsFile(cwd, agent, {
      mcpAllowServers: opts?.mcpAllowServers,
      sandboxNetworkStrictAllowlist: settings.claudeSandboxNetworkStrictAllowlist,
      sandboxFilesystemDisabled: settings.claudeSandboxFilesystemDisabled,
    });
    if (!state) return Promise.resolve(null);
    return Promise.resolve({ restore: () => restoreClaudeSettingsFile(state) });
  },
};
