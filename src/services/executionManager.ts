import { type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import type { AgentConfig, ExecutionResult, FleetSettings, TaskConfig } from "../types";
import type { FleetRepository } from "../fleetRepository";
import { getAdapter } from "../adapters";
import { resolveModel, shouldPassModelFlag } from "../utils/modelResolution";
import { spawnCli, splitLines } from "../utils/platform";
import type { McpAuthManager } from "./mcpAuth";
import { buildAgentPromptSections } from "./promptAssembly";
import {
  installMcpProjection,
  resolveProjectedServers,
  uninstallMcpProjection,
} from "./mcpProjection";

// Re-exported for existing consumers/tests — the implementations moved to the
// Claude Code adapter when execution became adapter-dispatched.
export { extractConcreteModel, extractFinalResult } from "../adapters/claudeCodeAdapter";

// Output caps — a runaway CLI (e.g. a tool looping on huge output) would
// otherwise grow these buffers unbounded until the renderer OOMs. Exceeding
// either cap kills the process and fails the run, mirroring the timeout path.
const MAX_STDOUT_LENGTH = 10 * 1024 * 1024;
const MAX_STDERR_LENGTH = 1024 * 1024;

export function extractRememberEntries(output: string): string[] {
  const matches = output.matchAll(/\[REMEMBER\]([\s\S]*?)\[\/REMEMBER\]/g);
  return Array.from(matches)
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

export class ExecutionManager {
  private runningProcesses = new Map<string, ChildProcess>();

  /** Kill the running process for an agent. Returns true if killed. */
  abortAgent(agentName: string): boolean {
    const proc = this.runningProcesses.get(agentName);
    if (proc) {
      proc.kill();
      this.runningProcesses.delete(agentName);
      return true;
    }
    return false;
  }

  constructor(
    private readonly settings: FleetSettings,
    private readonly repository: FleetRepository,
    private readonly mcpAuth?: McpAuthManager,
  ) {}

  async buildPrompt(
    agent: AgentConfig,
    task: TaskConfig,
    promptOverride?: string,
    memoryActive = agent.memory,
  ): Promise<string> {
    // Common sections (body/skills/context/memory/wiki) come from the shared
    // assembly so the run and chat paths cannot drift; only the `## Task`
    // framing is run-specific.
    const sections = await buildAgentPromptSections(this.repository, agent, { memoryActive });
    sections.push(`## Task\n${(promptOverride ?? task.body).trim()}`);
    return sections.filter(Boolean).join("\n\n");
  }

  async execute(
    agent: AgentConfig,
    task: TaskConfig,
    promptOverride?: string,
    onOutput?: (chunk: string) => void,
    options?: { suppressMemoryCapture?: boolean },
  ): Promise<ExecutionResult & { prompt: string; runId: string }> {
    // Reflection runs (which consolidate memory) must NOT themselves capture:
    // no `remember` tool, no capture instruction. Their working memory is
    // already supplied via the reflection prompt.
    const memoryActive = agent.memory && !options?.suppressMemoryCapture;
    const prompt = await this.buildPrompt(agent, task, promptOverride, memoryActive);
    const runId = randomUUID();
    const resolved = resolveModel(task, agent, this.settings);
    const useStreaming = onOutput != null;
    const adapter = getAdapter(agent.adapter);

    const invocation = await adapter.buildExec({
      prompt,
      model: shouldPassModelFlag(resolved.value) ? resolved.value : "",
      modelSource: resolved.source,
      effort: task.effort || agent.effort || "",
      agent,
      settings: this.settings,
      streaming: useStreaming,
    });

    // Empty-string cwd must fall back to the vault base (?? alone keeps "",
    // which breaks the projection / settings file path resolution).
    const cwd = agent.cwd?.trim() ? agent.cwd : (this.repository.getVaultBasePath() ?? ".");

    // Resolve the effective MCP servers for this run (enabled fleet registry
    // servers ∩ agent grants, plus the per-run `remember` capture tool for
    // memory-enabled agents) and PROJECT them into the chosen adapter. The
    // projection is adapter-agnostic: Claude gets a merged --mcp-config JSON,
    // Codex gets -c mcp_servers.* overrides. Fail-soft — a null projection just
    // means the run proceeds without fleet MCP (text-tag capture + reflection
    // remain the memory fallback).
    const pendingDir = memoryActive ? this.repository.getPendingDirAbsolutePath(agent.name) : null;
    const projectedServers = resolveProjectedServers({
      registry: this.repository.getMcpServers(),
      agentGrants: agent.mcpServers ?? [],
      getBearerToken: (name) => this.mcpAuth?.getToken(name),
      remember: pendingDir ? { pendingDir, source: "mcp" } : null,
    });
    const projection = installMcpProjection(cwd, agent.adapter, projectedServers);
    if (projection) {
      invocation.args.push(...projection.args);
    }

    // Install adapter-specific permission config (Claude: a temporary
    // .claude/settings.local.json at cwd, incl. mcp__<server> allow entries for
    // every projected server; Codex: a per-agent CODEX_HOME overlay carrying
    // execpolicy rules, returned as env). Always restored in the finally block.
    const permissionState = await adapter.setupPermissions(cwd, agent, this.settings, {
      mcpAllowServers: projectedServers.map((s) => s.def.name),
    });

    const startTime = Date.now();

    try {
      return await new Promise((resolve, reject) => {
        // Spawn through a login shell on macOS/Linux so ~/.zshenv is sourced.
        // On Windows, spawn directly (env vars are inherited from the system).
        const proc = spawnCli(invocation.cliPath, invocation.args, {
          cwd,
          env: {
            ...process.env,
            AWS_REGION: this.settings.awsRegion,
            ...(projection?.env ?? {}),
            ...(permissionState?.env ?? {}),
          },
        });

        if (invocation.stdinPayload !== undefined) {
          try {
            proc.stdin?.write(invocation.stdinPayload);
            proc.stdin?.end();
          } catch (err) {
            proc.kill();
            reject(err instanceof Error ? err : new Error(String(err)));
            return;
          }
        }

        this.runningProcesses.set(agent.name, proc);

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let outputLimitError: string | null = null;

        const timer = window.setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, agent.timeout * 1000);

        proc.stdout!.on("data", (chunk: Buffer | string) => {
          if (outputLimitError) return; // already killed — drop buffered chunks
          const text = chunk.toString();
          stdout += text;
          if (stdout.length > MAX_STDOUT_LENGTH) {
            outputLimitError = `Run output exceeded the ${MAX_STDOUT_LENGTH / (1024 * 1024)}MB stdout limit — process killed.`;
            proc.kill();
            return;
          }
          if (useStreaming && onOutput) {
            // Parse stream lines for displayable content
            for (const line of splitLines(text)) {
              const content = adapter.extractStreamChunk(line);
              if (content) onOutput(content);
            }
          }
        });

        proc.stderr!.on("data", (chunk: Buffer | string) => {
          if (outputLimitError) return;
          stderr += chunk.toString();
          if (stderr.length > MAX_STDERR_LENGTH) {
            outputLimitError = `Run stderr exceeded the ${MAX_STDERR_LENGTH / (1024 * 1024)}MB limit — process killed.`;
            proc.kill();
          }
        });

        proc.on("error", (error) => {
          window.clearTimeout(timer);
          reject(error);
        });

        proc.on("close", (exitCode) => {
          window.clearTimeout(timer);
          this.runningProcesses.delete(agent.name);

          if (outputLimitError) {
            reject(new Error(outputLimitError));
            return;
          }

          const parsed = adapter.parseExecOutput(stdout, stderr, useStreaming);

          resolve({
            runId,
            prompt,
            exitCode,
            durationSeconds: Math.max(1, Math.round((Date.now() - startTime) / 1000)),
            stdout,
            stderr,
            outputText: parsed.outputText,
            rawJson: parsed.rawJson,
            tokensUsed: parsed.tokensUsed,
            costUsd: parsed.costUsd,
            toolsUsed: parsed.toolsUsed,
            timedOut,
            resolvedModel: resolved.value,
            modelSource: resolved.source,
            concreteModel: parsed.concreteModel,
            finalResult: parsed.finalResult,
          });
        });
      });
    } finally {
      permissionState?.restore();
      uninstallMcpProjection(projection);
    }
  }
}
