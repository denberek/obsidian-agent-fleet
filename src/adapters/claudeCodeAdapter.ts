import type { AgentConfig, ExecutionToolUse, FleetSettings } from "../types";
import { splitLines } from "../utils/platform";
import { restoreClaudeSettingsFile, writeClaudeSettingsFile } from "../utils/claudeSettings";
import type {
  CliAdapter,
  ExecBuildOptions,
  ExecInvocation,
  ExecParseResult,
  PermissionSetupOptions,
  PermissionSetupState,
} from "./types";

/** Minimal shape of a Claude Code `stream-json` event we read fields off. */
interface ClaudeStreamEvent {
  type?: string;
  result?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
}

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

/**
 * Pull the concrete model ID Claude Code resolved (e.g. when we asked for
 * "opus" the CLI expanded it to "claude-opus-4-7"). Checks, in order:
 *   - modelUsage keys on result event
 *   - message.model on assistant event
 *   - top-level `model` on system/init event
 * Returns undefined if no event carried it.
 */
export function extractConcreteModel(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;

  // result event: { modelUsage: { "claude-opus-4-7": {...} } }
  if (root.modelUsage && typeof root.modelUsage === "object") {
    const keys = Object.keys(root.modelUsage);
    if (keys.length > 0 && keys[0]) return keys[0];
  }

  // assistant event: { message: { model: "claude-opus-4-7" } }
  const msg = root.message as Record<string, unknown> | undefined;
  if (msg && typeof msg.model === "string" && msg.model) return msg.model;

  // system init event: { model: "claude-opus-4-7" }
  if (typeof root.model === "string" && root.model) return root.model;

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

export const claudeCodeAdapter: CliAdapter = {
  id: "claude-code",
  label: "Claude Code",

  cliPath(settings: FleetSettings): string {
    return settings.claudeCliPath;
  },

  buildExec(opts: ExecBuildOptions): Promise<ExecInvocation> {
    const args = [
      "-p",
      opts.prompt,
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

    return Promise.resolve({ cliPath: opts.settings.claudeCliPath, args });
  },

  parseExecOutput(stdout: string, stderr: string, streaming: boolean): ExecParseResult {
    const trimmed = stdout.trim();
    let rawJson: unknown;

    if (streaming) {
      // stream-json: find the last parseable event (normally the "result" line)
      const lines = splitLines(trimmed);
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]?.trim();
        if (!line) continue;
        try {
          const parsed: unknown = JSON.parse(line);
          if (parsed && typeof parsed === "object") {
            rawJson = parsed;
            break;
          }
        } catch { /* skip non-json lines */ }
      }
    } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        rawJson = JSON.parse(trimmed);
      } catch {
        rawJson = undefined;
      }
    }

    let outputText = extractText(rawJson) ?? "";
    // If no clean text extracted, try to get text from stream events (skip system/json lines)
    if (!outputText && streaming) {
      const textParts: string[] = [];
      for (const line of splitLines(trimmed)) {
        const l = line.trim();
        if (!l) continue;
        try {
          const ev = JSON.parse(l) as ClaudeStreamEvent;
          // Only extract assistant text content, skip system/result/user events
          if (ev.type === "assistant" && ev.message?.content) {
            for (const block of ev.message.content) {
              if (block.type === "text" && block.text) textParts.push(block.text);
            }
          } else if (ev.type === "result" && typeof ev.result === "string") {
            textParts.push(ev.result);
          }
        } catch { /* not JSON, skip */ }
      }
      outputText = textParts.join("\n").trim();
    }
    if (!outputText) outputText = stderr.trim() || "(no output)";

    // Scan every stream-json line so we catch the concrete model even
    // when rawJson is only the final result line. System init and the
    // first assistant event both carry it.
    let concreteModel: string | undefined = extractConcreteModel(rawJson);
    let finalResult: string | undefined = extractFinalResult(rawJson);
    if ((!concreteModel || !finalResult) && streaming) {
      for (const line of splitLines(trimmed)) {
        const l = line.trim();
        if (!l) continue;
        try {
          const ev: unknown = JSON.parse(l);
          if (!concreteModel) {
            const m = extractConcreteModel(ev);
            if (m) concreteModel = m;
          }
          if (!finalResult) {
            const r = extractFinalResult(ev);
            if (r) finalResult = r;
          }
          if (concreteModel && finalResult) break;
        } catch { /* not JSON, skip */ }
      }
    }

    return {
      outputText,
      finalResult,
      tokensUsed: extractTokens(rawJson),
      costUsd: extractCostUsd(rawJson),
      toolsUsed: collectToolUses(rawJson),
      concreteModel,
      rawJson,
    };
  },

  extractStreamChunk(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
    const type = event.type as string | undefined;

    // Assistant message: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
    if (type === "assistant") {
      const msg = event.message as Record<string, unknown> | undefined;
      if (msg?.content && Array.isArray(msg.content)) {
        const parts: string[] = [];
        for (const block of msg.content as Array<Record<string, unknown>>) {
          if (block.type === "text" && typeof block.text === "string") {
            parts.push(block.text);
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
    _settings: FleetSettings,
    opts?: PermissionSetupOptions,
  ): Promise<PermissionSetupState | null> {
    const state = writeClaudeSettingsFile(cwd, agent, { mcpAllowServers: opts?.mcpAllowServers });
    if (!state) return Promise.resolve(null);
    return Promise.resolve({ restore: () => restoreClaudeSettingsFile(state) });
  },
};
