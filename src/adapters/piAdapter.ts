import type { AgentConfig, ExecutionToolUse, FleetSettings, JsonValue } from "../types";
import { splitLines } from "../utils/platform";
import { isJsonValue } from "../utils/structuredOutput";
import { tryParseJson, warnJsonParseFailure } from "./parseHelpers";
import { PI_STRUCTURED_OUTPUT_TOOL, writePiExtensions } from "./piExtensions";
import type {
  CliAdapter,
  ExecBuildOptions,
  ExecInvocation,
  ExecParseResult,
  PermissionSetupOptions,
  PermissionSetupState,
} from "./types";

/**
 * Pi coding-agent adapter (https://github.com/earendil-works/pi).
 *
 * One-shot runs go through `pi -p --mode json`, which emits one JSONL event
 * per line:
 *
 *   {"type":"session","id":"<uuid>","version":3,...}
 *   {"type":"agent_start"} / {"type":"turn_start"}
 *   {"type":"message_start","message":{...}}
 *   {"type":"message_update","usage":{...},"assistantMessageEvent":{"type":"text_delta","delta":"..."}}
 *   {"type":"tool_execution_start","toolCallId":"...","toolName":"bash","args":{...}}
 *   {"type":"message_end","message":{role,content,model,provider,usage,stopReason,errorMessage?}}
 *   {"type":"turn_end",...} / {"type":"agent_end","messages":[...]} / {"type":"agent_settled"}
 *
 * Assistant messages carry `model` (the concrete resolved id), `usage`
 * ({input,output,cacheRead,cacheWrite,totalTokens,cost:{...,total}} — cost is
 * computed from Pi's model catalog pricing, so it's an estimate rather than a
 * provider-billed figure) and `stopReason`/`errorMessage` on failures.
 *
 * Pi is multi-provider by design, so unlike the Claude/Codex adapters there is
 * NO cross-vendor model guard here: both Claude-shaped and GPT-shaped values
 * are valid and pass through, including a plugin-wide default. Pi accepts
 * bare ids, fuzzy patterns, and "provider/id" forms.
 *
 * Pi has no spend or turn ceiling (`budgetUsd`/`maxTurns` are recorded on the
 * run log but unenforced — the Codex precedent) and no permission system.
 * Deny rules are enforced through a generated gate extension and structured
 * output through a generated terminating-tool extension — see piExtensions.ts.
 */

/** Thinking levels Pi accepts verbatim (`--thinking`). `minimal` has no UI
 *  entry but is honored when written straight into frontmatter. */
const PI_THINKING_PASSTHROUGH = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
let warnedUltracodeFallback = false;

/**
 * Map the plugin's Claude-scale effort values onto Pi's thinking levels.
 * Near 1:1 — only `ultracode` (Claude-only agentic opt-in) steps down to
 * `max`, keeping the reasoning depth and dropping the opt-in.
 */
export function mapPiThinking(effort: string): string {
  const e = effort.trim().toLowerCase();
  if (!e) return "";
  if (PI_THINKING_PASSTHROUGH.has(e)) return e;
  if (e === "ultracode") return "max";
  return "";
}

/**
 * Map the agent's permissionMode onto Pi's `--tools` restriction. Pi has no
 * sandbox; the tool set is the enforcement axis:
 *
 *   - plan / read-only → the built-in read-only set (read,grep,find,ls)
 *   - everything else → full default tools (read,bash,edit,write)
 *
 * Claude-native and Codex-native values are both accepted so agents round-trip
 * across adapters, matching the other two adapters' cross-family mapping.
 */
export function piToolsArgs(permissionMode: string | undefined): string[] {
  const mode = (permissionMode ?? "").trim();
  switch (mode) {
    case "plan":
    case "read-only":
      return ["--tools", "read,grep,find,ls"];
    default:
      return [];
  }
}

type JsonRecord = Record<string, unknown>;

function parseJsonLine(line: string): JsonRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parsed = tryParseJson(trimmed);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as JsonRecord)
    : null;
}

function messageOf(event: JsonRecord): JsonRecord | null {
  const message = event.message;
  return message && typeof message === "object" && !Array.isArray(message)
    ? (message as JsonRecord)
    : null;
}

function contentBlocksOf(message: JsonRecord): JsonRecord[] {
  return Array.isArray(message.content)
    ? (message.content as unknown[]).filter(
        (b): b is JsonRecord => !!b && typeof b === "object" && !Array.isArray(b),
      )
    : [];
}

/** Describe one toolCall content block for run-log display. */
export function describePiToolCall(block: JsonRecord): ExecutionToolUse | null {
  if (block.type !== "toolCall" || typeof block.name !== "string") return null;
  const args =
    block.arguments && typeof block.arguments === "object" && !Array.isArray(block.arguments)
      ? (block.arguments as JsonRecord)
      : {};
  const command =
    (typeof args.command === "string" && args.command) ||
    (typeof args.path === "string" && args.path) ||
    (typeof args.pattern === "string" && args.pattern) ||
    undefined;
  return { tool: block.name, command };
}

/** Cumulative usage from one assistant message: `{totalTokens, cost.total}`. */
function usageOf(message: JsonRecord): { tokens: number; cost: number } {
  const usage = message.usage;
  if (!usage || typeof usage !== "object") return { tokens: 0, cost: 0 };
  const u = usage as JsonRecord;
  const tokens = typeof u.totalTokens === "number" ? u.totalTokens : 0;
  const cost =
    u.cost && typeof u.cost === "object" && typeof (u.cost as JsonRecord).total === "number"
      ? ((u.cost as JsonRecord).total as number)
      : 0;
  return { tokens, cost };
}

/**
 * Argv policy shared by the one-shot (`-p --mode json`) and chat
 * (`--mode rpc`) spawns: model passthrough, effort→thinking mapping (with the
 * one-time ultracode notice), and the permission-mode tool restriction.
 * `model` is the RESOLVED value ("" = omit the flag).
 */
export function buildPiCommonArgs(
  model: string,
  effort: string,
  permissionMode: string | undefined,
): string[] {
  const args: string[] = [];

  // No cross-vendor guard: Pi is multi-provider, every stored shape is valid.
  if (model) {
    args.push("--model", model);
  }

  const thinking = mapPiThinking(effort);
  if (thinking) {
    args.push("--thinking", thinking);
  }
  if (effort.trim().toLowerCase() === "ultracode" && !warnedUltracodeFallback) {
    warnedUltracodeFallback = true;
    console.info("Agent Fleet: Pi has no ultracode equivalent; using max thinking for this run.");
  }

  args.push(...piToolsArgs(permissionMode));
  return args;
}

/**
 * Build the `pi` argv for a one-shot run. Pure. The prompt travels via stdin
 * (print mode auto-reads it), dodging argv length limits like both other
 * adapters.
 *
 * `--no-approve` keeps headless runs deterministic: Pi's project-trust model
 * would otherwise decide whether cwd-local extensions/config load, and an
 * unattended run must not depend on per-directory trust state.
 */
export function buildPiExecArgs(opts: ExecBuildOptions): { args: string[]; stdinPayload: string } {
  const args = ["-p", "--mode", "json", "--no-approve"];

  args.push(...buildPiCommonArgs(opts.model, opts.effort, opts.agent.permissionMode));

  if (opts.resumeSessionId) {
    args.push("--session-id", opts.resumeSessionId);
  }

  return { args, stdinPayload: opts.prompt };
}

export const piAdapter: CliAdapter = {
  id: "pi",
  label: "Pi",

  cliPath(settings: FleetSettings): string {
    return settings.piCliPath;
  },

  buildExec(opts: ExecBuildOptions): Promise<ExecInvocation> {
    const { args, stdinPayload } = buildPiExecArgs(opts);

    // Generated extensions: the bash deny gate and/or the structured-output
    // terminating tool. Explicit `-e` paths load regardless of discovery
    // settings. The cleanup handle removes the temp dir; ExecutionManager
    // always calls it in its finally block.
    const generated = writePiExtensions({ agent: opts.agent, outputSchema: opts.outputSchema });
    if (generated && generated.droppedRules.length > 0) {
      warnDroppedRulesOnce(opts.agent.name, generated.droppedRules);
    }
    for (const path of generated?.paths ?? []) {
      args.push("--extension", path);
    }

    return Promise.resolve({
      cliPath: opts.settings.piCliPath,
      args,
      stdinPayload,
      cleanup: generated?.cleanup,
    });
  },

  parseExecOutput(stdout: string, stderr: string, _streaming: boolean): ExecParseResult {
    const assistantTexts: string[] = [];
    const toolsUsed: ExecutionToolUse[] = [];
    const errors: string[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let sessionId: string | undefined;
    let concreteModel: string | undefined;
    let structuredOutput: JsonValue | undefined;
    let lastAssistantEnd: JsonRecord | undefined;
    let parsedAnyEvent = false;

    for (const line of splitLines(stdout)) {
      const event = parseJsonLine(line);
      if (!event) continue;
      parsedAnyEvent = true;
      const type = typeof event.type === "string" ? event.type : "";

      if (type === "session" && typeof event.id === "string" && event.id) {
        sessionId = event.id;
        continue;
      }
      if (type !== "message_end") continue;

      const message = messageOf(event);
      if (!message || message.role !== "assistant") continue;
      lastAssistantEnd = event;

      if (typeof message.model === "string" && message.model) {
        concreteModel = message.model;
      }
      const usage = usageOf(message);
      totalTokens += usage.tokens;
      totalCost += usage.cost;

      if (message.stopReason === "error") {
        errors.push(
          typeof message.errorMessage === "string" && message.errorMessage
            ? message.errorMessage
            : "provider error",
        );
      }

      const texts: string[] = [];
      for (const block of contentBlocksOf(message)) {
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
          texts.push(block.text);
          continue;
        }
        const tool = describePiToolCall(block);
        if (tool) {
          toolsUsed.push(tool);
          if (tool.tool === PI_STRUCTURED_OUTPUT_TOOL) {
            const args = (block as { arguments?: unknown }).arguments;
            if (isJsonValue(args)) structuredOutput = args;
          }
        }
      }
      if (texts.length > 0) assistantTexts.push(texts.join("\n"));
    }

    if (!parsedAnyEvent && stdout.trim()) {
      warnJsonParseFailure("Pi JSON output contained no parseable JSONL event", stdout.trim());
    }

    // The run failed when its LAST assistant message ended in error — earlier
    // errors that a later message recovered from don't fail the run. Without
    // this signal, a text-then-error run with exit code 0 (Pi's common
    // partial-failure shape) would be logged as a clean success.
    const lastMessage = lastAssistantEnd ? messageOf(lastAssistantEnd) : null;
    const endedInError = lastMessage?.stopReason === "error";

    let outputText = assistantTexts.join("\n\n").trim();
    if (!outputText) outputText = errors.join("\n").trim();
    else if (endedInError) outputText += `\n\n[provider error] ${errors.join("\n")}`;
    if (!outputText) outputText = stderr.trim() || "(no output)";

    const lastText = assistantTexts[assistantTexts.length - 1];
    return {
      outputText,
      finalResult: lastText?.trim() ? lastText : undefined,
      structuredOutput,
      tokensUsed: totalTokens > 0 ? totalTokens : undefined,
      // Catalog-priced estimate computed by Pi, not a provider-billed figure.
      costUsd: totalCost > 0 ? totalCost : undefined,
      toolsUsed,
      concreteModel,
      rawJson: lastAssistantEnd,
      sessionId,
      errors: endedInError && errors.length > 0 ? errors : undefined,
    };
  },

  extractStreamChunk(line: string): string | null {
    const event = parseJsonLine(line);
    if (!event) return null;
    const type = typeof event.type === "string" ? event.type : "";

    if (type === "message_update") {
      const inner = event.assistantMessageEvent;
      if (inner && typeof inner === "object") {
        const ev = inner as JsonRecord;
        if (ev.type === "text_delta" && typeof ev.delta === "string") {
          return ev.delta;
        }
      }
      return null;
    }
    if (type === "tool_execution_start") {
      const name = typeof event.toolName === "string" ? event.toolName : "tool";
      const args =
        event.args && typeof event.args === "object" && !Array.isArray(event.args)
          ? (event.args as JsonRecord)
          : {};
      const cmd =
        (typeof args.command === "string" && args.command) ||
        (typeof args.path === "string" && args.path) ||
        "";
      return `\n▸ ${name}${cmd ? `: ${cmd.slice(0, 200)}` : ""}\n`;
    }
    if (type === "message_end") {
      const message = messageOf(event);
      if (message?.role === "assistant" && message.stopReason === "error") {
        const msg =
          typeof message.errorMessage === "string" && message.errorMessage
            ? message.errorMessage
            : "provider error";
        return `\n✖ ${msg}\n`;
      }
      return null;
    }
    return null;
  },

  setupPermissions(
    _cwd: string,
    _agent: AgentConfig,
    _settings: FleetSettings,
    _opts?: PermissionSetupOptions,
  ): Promise<PermissionSetupState | null> {
    // Pi needs no on-disk permission config: the tool-set restriction and the
    // generated deny-gate extension both travel as CLI flags via buildExec.
    // MCP scoping is the projection's job (a PI_CODING_AGENT_DIR overlay).
    return Promise.resolve(null);
  },
};

const warnedDroppedRules = new Set<string>();

/** Test hook — clears the one-time dropped-rule warning dedup set. */
export function resetPiAdapterWarnings(): void {
  warnedDroppedRules.clear();
  warnedUltracodeFallback = false;
}

/** One-time (per agent+rules) console warning that deny rules the Pi gate
 *  can't express were dropped. Shared by the one-shot path (buildExec) and
 *  the chat path (ChatSession.ensurePiProcess) so neither is silent. */
export function warnDroppedRulesOnce(
  agentName: string,
  dropped: Array<{ rule: string; reason: string }>,
): void {
  const key = `${agentName}:${dropped.map((d) => d.rule).join("|")}`;
  if (warnedDroppedRules.has(key)) return;
  warnedDroppedRules.add(key);
  console.warn(
    `Agent Fleet: agent "${agentName}": ${dropped.length} permission rule(s) can't be enforced ` +
      `by the Pi gate and were ignored — ` +
      dropped.map((d) => `"${d.rule}" (${d.reason})`).join("; ") +
      ". File access is governed by the Permission Mode tool set.",
  );
}
