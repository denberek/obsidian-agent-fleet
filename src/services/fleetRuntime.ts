import { randomUUID } from "crypto";
import { Cron } from "croner";
import { Notice, TFile } from "obsidian";
import { FleetRepository } from "../fleetRepository";
import { splitLines } from "../utils/platform";
import { ExecutionManager } from "./executionManager";
import { extractCaptures, renderSections } from "../utils/memoryFormat";
import { buildReflectionPrompt, mergeCandidates, parseReflectionOutput } from "../utils/reflection";
import { MemoryWriter } from "./memoryWriter";
import { resolveModel } from "../utils/modelResolution";
import { McpManager } from "./mcpManager";
import type { McpAuthManager } from "./mcpAuth";
import { TaskScheduler } from "./taskScheduler";
import type {
  AgentConfig,
  AgentRuntimeState,
  ApprovalRecord,
  FleetSettings,
  FleetSnapshot,
  FleetStatus,
  PendingRun,
  RunLogData,
  RunStatus,
  SkillCandidate,
  SkillProposal,
  TaskConfig,
} from "../types";

export class FleetRuntime {
  readonly scheduler: TaskScheduler;
  readonly executor: ExecutionManager;
  readonly mcpManager: McpManager;

  private snapshot: FleetSnapshot = {
    agents: [],
    skills: [],
    tasks: [],
    channels: [],
    mcpServers: [],
    validationIssues: [],
  };
  private runtimeState = new Map<string, AgentRuntimeState>();
  private recentRuns: RunLogData[] = [];
  /** Runs from the chart window (last CHART_WINDOW_DAYS days). Kept separate
   *  from `recentRuns` because a busy fleet can push older days out of the
   *  count-capped recent list, leaving the dashboard chart with empty bars
   *  for days that actually had activity. */
  private chartRuns: RunLogData[] = [];
  private static readonly CHART_WINDOW_DAYS = 14;
  private statusChangeListeners = new Set<() => void>();
  private runOutputListeners = new Map<string, Set<(chunk: string) => void>>();
  private runOutputBuffers = new Map<string, string>();
  /** Heartbeat cron jobs, keyed by agent name. Separate from task scheduler jobs. */
  private heartbeatJobs = new Map<string, Cron>();
  /** Nightly reflection cron jobs, keyed by agent name (§8). */
  private reflectionJobs = new Map<string, Cron>();
  /** Agents with a reflection currently in-flight. */
  private reflectionsInFlight = new Set<string>();
  /** Concurrency gate for reflection CLI spawns (sized to maxConcurrentRuns) so
   *  the shared nightly cron doesn't fan out N processes at once. */
  private reflectionRunning = 0;
  private reflectionWaiters: Array<() => void> = [];
  /** Timestamp of last heartbeat registration — used to suppress immediate-fire on re-register. */
  private heartbeatRegisteredAt = 0;
  /** Tracks agents with a heartbeat currently in-flight (prevents duplicate runs). */
  private heartbeatsInFlight = new Set<string>();
  /** Callback for heartbeat result delivery (e.g. Slack posting). Set by main.ts. */
  private heartbeatResultHandler?: (agentName: string, channel: string, output: string) => void;
  /** Single choke point for memory writes (per-agent locked). */
  private readonly memoryWriter: MemoryWriter;

  constructor(
    private readonly repository: FleetRepository,
    private readonly settings: FleetSettings,
    mcpAuth?: McpAuthManager,
  ) {
    this.executor = new ExecutionManager(settings, repository, mcpAuth);
    this.mcpManager = new McpManager(settings);
    // Wire the keychain-backed auth manager so MCP probing and token
    // projection share one token store. Done here (not just at plugin load) so
    // a runtime rebuilt by saveSettings keeps its auth manager.
    if (mcpAuth) this.mcpManager.setAuthManager(mcpAuth);
    this.memoryWriter = new MemoryWriter(repository);
    this.scheduler = new TaskScheduler(settings.maxConcurrentRuns, {
      onTaskTriggered: (pendingRun) => this.runPendingTask(pendingRun),
      onTaskScheduled: (task, nextRun) => this.repository.updateTaskRunMetadata(task, { nextRun }),
    });
  }

  async initialize(): Promise<void> {
    this.snapshot = await this.repository.loadAll();
    // One-time legacy→v2 memory migration (seeds the raw archive) BEFORE any
    // reflection cron is registered, so a first dream can't lose pre-v2 memory.
    await this.repository.migrateAllLegacyMemory();
    await this.refreshRunCaches();
    const activeTasks = this.snapshot.tasks.filter((task) => {
      const agent = this.repository.getAgentByName(task.agent);
      return agent?.enabled !== false;
    });
    await this.scheduler.loadTasks(activeTasks);
    await this.scheduler.handleStartupCatchUp(activeTasks);
    this.registerHeartbeats();
    this.registerReflections();
    this.emitStatusChange();
  }

  /**
   * Register a callback that receives heartbeat results for delivery to external
   * channels (e.g. Slack). Called from main.ts after the ChannelManager is ready.
   */
  onHeartbeatResult(handler: (agentName: string, channel: string, output: string) => void): void {
    this.heartbeatResultHandler = handler;
  }

  async refreshFromVault(): Promise<void> {
    this.snapshot = await this.repository.loadAll();
    await this.rebuildSchedules();
    await this.refreshRunCaches();
    this.emitStatusChange();
  }

  getSnapshot(): FleetSnapshot {
    return this.snapshot;
  }

  getRecentRuns(): RunLogData[] {
    return this.recentRuns;
  }

  /** Runs from the last CHART_WINDOW_DAYS days. Fed by date-folder scan,
   *  not the count-capped recent list, so the dashboard's 14-day bar chart
   *  reflects every day in the window. */
  getChartRuns(): RunLogData[] {
    return this.chartRuns;
  }

  private async refreshRunCaches(): Promise<void> {
    this.recentRuns = await this.repository.listRecentRuns();
    const since = new Date();
    since.setDate(since.getDate() - (FleetRuntime.CHART_WINDOW_DAYS - 1));
    this.chartRuns = await this.repository.listRunsSince(since);
  }

  getAgentState(agentName: string): AgentRuntimeState {
    const agent = this.runtimeState.get(agentName);
    const config = this.snapshot.agents.find((item) => item.name === agentName);
    if (config && !config.enabled) {
      return {
        status: "disabled",
        lastRun: agent?.lastRun,
        currentRunId: agent?.currentRunId,
      };
    }
    return agent ?? { status: "idle" };
  }

  getFleetStatus(): FleetStatus {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const completedToday = this.recentRuns.filter((run) => {
      const d = new Date(run.started);
      const runDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      return runDate === today;
    }).length;
    const running = Array.from(this.runtimeState.values()).filter((state) => state.status === "running").length;
    const pending = this.recentRuns.flatMap((run) => run.approvals ?? []).filter((item) => item.status === "pending").length;
    return {
      running,
      pending,
      completedToday,
    };
  }

  subscribe(listener: () => void): () => void {
    this.statusChangeListeners.add(listener);
    return () => this.statusChangeListeners.delete(listener);
  }

  onRunOutput(agentName: string, callback: (chunk: string) => void): () => void {
    let listeners = this.runOutputListeners.get(agentName);
    if (!listeners) {
      listeners = new Set();
      this.runOutputListeners.set(agentName, listeners);
    }
    listeners.add(callback);
    const buffer = this.runOutputBuffers.get(agentName);
    if (buffer) callback(buffer);
    return () => {
      this.runOutputListeners.get(agentName)?.delete(callback);
    };
  }

  getRunOutputBuffer(agentName: string): string {
    return this.runOutputBuffers.get(agentName) ?? "";
  }

  async handleVaultChange(file: TFile): Promise<void> {
    await this.repository.loadFile(file);
    this.snapshot = this.repository.getSnapshot();
    await this.rebuildSchedules();
    await this.refreshRunCaches();
    this.emitStatusChange();
  }

  async handleVaultDelete(path: string): Promise<void> {
    this.repository.removeFile(path);
    this.snapshot = this.repository.getSnapshot();
    await this.rebuildSchedules();
    await this.refreshRunCaches();
    this.emitStatusChange();
  }

  private abortedAgents = new Set<string>();

  abortAgentRun(agentName: string): boolean {
    const killed = this.executor.abortAgent(agentName);
    if (killed) {
      this.abortedAgents.add(agentName);
      this.runtimeState.set(agentName, { status: "idle" });
      this.emitStatusChange();
    }
    return killed;
  }

  /** Check if the last run for this agent was aborted (consumed on read). */
  wasAborted(agentName: string): boolean {
    return this.abortedAgents.has(agentName);
  }

  consumeAborted(agentName: string): boolean {
    const was = this.abortedAgents.has(agentName);
    this.abortedAgents.delete(agentName);
    return was;
  }

  async runTaskNow(task: TaskConfig, promptOverride?: string): Promise<void> {
    await this.scheduler.enqueue({
      task: {
        ...task,
        type: "immediate",
      },
      reason: "manual",
      promptOverride,
    });
  }

  async runAgentNow(agent: AgentConfig, prompt: string): Promise<void> {
    // If the agent has a heartbeat instruction and the caller used the generic
    // fallback prompt, use the heartbeat instruction instead. This makes "Run Now"
    // do what the agent would do autonomously on its schedule.
    const effectivePrompt =
      agent.heartbeatBody.trim() && prompt === "Run now and summarize the current state."
        ? agent.heartbeatBody.trim()
        : prompt;

    const isHeartbeat = effectivePrompt === agent.heartbeatBody.trim() && agent.heartbeatBody.trim().length > 0;
    const task: TaskConfig = {
      filePath: "",
      taskId: isHeartbeat ? `heartbeat-${Date.now()}` : `manual-${Date.now()}`,
      agent: agent.name,
      type: "immediate",
      priority: "medium",
      enabled: true,
      created: new Date().toISOString(),
      runCount: 0,
      catchUp: false,
      tags: isHeartbeat ? [...agent.tags, "heartbeat"] : agent.tags,
      body: effectivePrompt,
    };
    await this.scheduler.enqueue({
      task,
      reason: isHeartbeat ? "heartbeat" : "manual",
      promptOverride: effectivePrompt,
    });
  }

  async resolveApproval(run: RunLogData, tool: string, decision: "approved" | "rejected"): Promise<void> {
    if (!run.filePath) {
      return;
    }
    await this.repository.setApprovalDecision(run.filePath, tool, decision);
    await this.refreshRunCaches();
    this.emitStatusChange();
  }

  async pruneOldRuns(): Promise<void> {
    const cutoff = Date.now() - this.settings.runLogRetentionDays * 24 * 60 * 60 * 1000;
    const runs = await this.repository.listRecentRuns(500);
    for (const run of runs) {
      if (!run.filePath) {
        continue;
      }
      if (new Date(run.started).getTime() < cutoff) {
        await this.repository.trashFile(run.filePath);
      }
    }
  }

  private async rebuildSchedules(): Promise<void> {
    this.scheduler.pauseAll();
    for (const task of this.snapshot.tasks) {
      this.scheduler.unregisterTask(task.taskId);
    }
    this.scheduler.setMaxConcurrentRuns(this.settings.maxConcurrentRuns);
    await this.scheduler.loadTasks(this.snapshot.tasks.filter((task) => {
      const agent = this.repository.getAgentByName(task.agent);
      return agent?.enabled !== false;
    }));
    this.scheduler.resumeAll();
    this.registerHeartbeats();
    this.registerReflections();
  }

  /** Stop all heartbeat crons and the task scheduler. Idempotent. Must be
   *  called before dropping the runtime reference (saveSettings rebuild,
   *  plugin unload) — otherwise croner timers keep firing on the leaked
   *  instance, causing duplicate runs and stale schedules to live alongside
   *  the new runtime's correct ones. */
  shutdown(): void {
    for (const [, job] of this.heartbeatJobs) {
      job.stop();
    }
    this.heartbeatJobs.clear();
    this.heartbeatsInFlight.clear();
    for (const [, job] of this.reflectionJobs) {
      job.stop();
    }
    this.reflectionJobs.clear();
    this.reflectionsInFlight.clear();
    this.scheduler.shutdown();
  }

  /**
   * Register heartbeat cron jobs for all enabled agents that have a heartbeat
   * schedule. Each heartbeat synthesizes a PendingRun with the heartbeat body
   * as the prompt, tagged "heartbeat", and enqueues it through the normal
   * scheduler queue (respecting maxConcurrentRuns).
   */
  private registerHeartbeats(): void {
    // Stop existing heartbeat jobs
    for (const [, job] of this.heartbeatJobs) {
      job.stop();
    }
    this.heartbeatJobs.clear();
    this.heartbeatRegisteredAt = Date.now();

    for (const agent of this.snapshot.agents) {
      if (!agent.enabled || !agent.heartbeatEnabled || !agent.heartbeatSchedule.trim() || !agent.heartbeatBody.trim()) {
        continue;
      }
      try {
        const job = new Cron(
          agent.heartbeatSchedule,
          {
            name: `heartbeat:${agent.name}`,
            catch: true,
            protect: true,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          () => {
            void this.runHeartbeat(agent.name);
          },
        );
        this.heartbeatJobs.set(agent.name, job);
      } catch (error) {
        console.error(`Agent Fleet: failed to register heartbeat for "${agent.name}":`, error);
      }
    }
  }

  private async runHeartbeat(agentName: string): Promise<void> {
    // Suppress immediate-fire when the heartbeat was just registered (e.g. plugin
    // startup, vault refresh, or settings save). Croner can fire within the same
    // second for interval crons like */5 — this guard ensures the first real tick
    // is at least 10 seconds after registration.
    if (Date.now() - this.heartbeatRegisteredAt < 10_000) return;

    // Prevent duplicate runs if the previous heartbeat is still in-flight
    if (this.heartbeatsInFlight.has(agentName)) return;
    this.heartbeatsInFlight.add(agentName);

    try {
      const agent = this.repository.getAgentByName(agentName);
      if (!agent || !agent.enabled || !agent.heartbeatBody.trim()) return;

      const task: TaskConfig = {
        filePath: "",
        taskId: `heartbeat-${Date.now()}`,
        agent: agent.name,
        type: "immediate",
        priority: "medium",
        enabled: true,
        created: new Date().toISOString(),
        runCount: 0,
        catchUp: false,
        tags: [...agent.tags, "heartbeat"],
        body: agent.heartbeatBody.trim(),
      };
      await this.scheduler.enqueue({
        task,
        reason: "heartbeat",
        promptOverride: agent.heartbeatBody.trim(),
      });
    } finally {
      this.heartbeatsInFlight.delete(agentName);
    }
  }

  /** Get the next heartbeat run time for an agent (for dashboard display). */
  getNextHeartbeat(agentName: string): Date | null {
    const job = this.heartbeatJobs.get(agentName);
    if (!job) return null;
    return job.nextRun() ?? null;
  }

  /** Register nightly reflection crons for memory-enabled agents (§8). */
  private registerReflections(): void {
    for (const [, job] of this.reflectionJobs) job.stop();
    this.reflectionJobs.clear();

    for (const agent of this.snapshot.agents) {
      if (!agent.enabled || !agent.memory || !agent.reflection.enabled) continue;
      const schedule = agent.reflection.schedule.trim();
      if (!schedule) continue;
      try {
        const job = new Cron(
          schedule,
          {
            name: `reflection:${agent.name}`,
            catch: true,
            protect: true,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          () => {
            void this.runReflection(agent.name);
          },
        );
        this.reflectionJobs.set(agent.name, job);
      } catch (error) {
        console.error(`Agent Fleet: failed to register reflection for "${agent.name}":`, error);
      }
    }
  }

  /** Next scheduled reflection time for an agent (for dashboard display). */
  getNextReflection(agentName: string): Date | null {
    return this.reflectionJobs.get(agentName)?.nextRun() ?? null;
  }

  /** Manually trigger a reflection now (e.g. from the dashboard "Reflect now"
   *  button). Returns a human-readable result. */
  async runReflectionNow(agentName: string): Promise<{ ok: boolean; message: string }> {
    return this.runReflection(agentName);
  }

  /** Pending skill proposals across all agents (for the Inbox). */
  async listPendingProposals(): Promise<SkillProposal[]> {
    const all = await this.repository.listProposals();
    return all.filter((p) => p.status === "pending");
  }

  /** Accept a proposal: apply it (create/patch skill) and mark it accepted. */
  async acceptProposal(id: string): Promise<{ ok: boolean; message: string }> {
    const p = await this.repository.readProposal(id);
    if (!p) return { ok: false, message: "Proposal not found." };
    try {
      const path = await this.repository.applyProposal(p);
      if (!path) {
        // No-op apply (e.g. a skill_modify whose target skill was deleted or
        // renamed). Leave the proposal PENDING rather than marking it accepted
        // with a false "Applied" — otherwise the learned change vanishes silently.
        return { ok: false, message: "Couldn't apply — target skill not found; proposal left pending." };
      }
      await this.repository.setProposalStatus(id, "accepted");
      await this.refreshFromVault();
      return { ok: true, message: `Applied → ${path}` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `Failed to apply: ${msg}` };
    }
  }

  /** Reject a proposal: mark it rejected (the candidate stays suppressed). */
  async rejectProposal(id: string): Promise<void> {
    await this.repository.setProposalStatus(id, "rejected");
    this.emitStatusChange();
  }

  /**
   * Bound concurrent reflection CLI spawns. Without this the shared default
   * cron (`0 3 * * *`) would spawn one CLI per memory-enabled agent at the same
   * instant. A slot is either held by a runner or handed directly to the next
   * waiter, so the live count never exceeds the limit.
   */
  private async withReflectionSlot<T>(fn: () => Promise<T>): Promise<T> {
    const limit = Math.max(1, this.settings.maxConcurrentRuns);
    if (this.reflectionRunning >= limit) {
      await new Promise<void>((resolve) => this.reflectionWaiters.push(resolve));
    } else {
      this.reflectionRunning++;
    }
    try {
      return await fn();
    } finally {
      const next = this.reflectionWaiters.shift();
      if (next) next(); // hand our slot directly to the next waiter (keep count)
      else this.reflectionRunning--;
    }
  }

  /**
   * Run a reflection pass for an agent: assemble inputs, ask the model to
   * consolidate, then atomically apply the result and update the candidate
   * ledger (§8). Safe to call manually or from cron.
   */
  private async runReflection(agentName: string): Promise<{ ok: boolean; message: string }> {
    const agent = this.repository.getAgentByName(agentName);
    if (!agent || !agent.enabled || !agent.memory) {
      return { ok: false, message: "Agent not found, disabled, or memory off." };
    }
    if (this.reflectionsInFlight.has(agentName)) {
      return { ok: false, message: "A reflection is already in progress." };
    }
    this.reflectionsInFlight.add(agentName);
    const nowIso = new Date().toISOString();
    try {
      // Guarantee the legacy→v2 migration (and its raw-archive seeding) has run
      // before we read/consolidate, so a first reflection can't lose pre-v2
      // memory even if it fires before the load-time migration.
      await this.repository.migrateLegacyMemory(agentName);
      const wm = await this.repository.readWorkingMemory(agentName);
      const workingBody = wm ? renderSections(wm.sections) : "";
      const recentRaw = await this.repository.readRecentRaw(agentName, 2);
      const prompt = buildReflectionPrompt({
        agentName,
        workingMemoryBody: workingBody,
        recentRaw,
        tokenBudget: agent.memoryTokenBudget,
      });

      const task: TaskConfig = {
        filePath: "",
        taskId: `reflection-${Date.now()}`,
        agent: agent.name,
        type: "immediate",
        priority: "low",
        enabled: true,
        created: nowIso,
        runCount: 0,
        catchUp: false,
        tags: [...agent.tags, "reflection"],
        body: prompt,
        model: agent.reflection.model || undefined,
      };

      // Gate the spawn through the reflection semaphore, and suppress memory
      // capture for the reflection run itself (it consolidates memory; it must
      // not emit new captures or carry the capture instruction).
      const result = await this.withReflectionSlot(() =>
        this.executor.execute(agent, task, prompt, undefined, { suppressMemoryCapture: true }),
      );
      const parsed = parseReflectionOutput(result.outputText);

      const applied = await this.memoryWriter.reflect(agent, parsed.sections, nowIso);

      if (parsed.candidates.length > 0) {
        const existing = await this.repository.readCandidates(agentName);
        const merged = mergeCandidates(existing, parsed.candidates, nowIso);
        await this.repository.writeCandidates(agentName, merged);
        // Phase 5: turn matured candidates into skill proposals.
        await this.generateProposals(agent, merged, nowIso);
      }

      await this.refreshRunCaches();
      this.emitStatusChange();
      return applied
        ? { ok: true, message: "Reflection complete — working memory consolidated." }
        : {
            ok: false,
            message: "Reflection produced no memory block; working memory left unchanged.",
          };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Agent Fleet: reflection failed for "${agentName}":`, error);
      return { ok: false, message: `Reflection failed: ${msg}` };
    } finally {
      this.reflectionsInFlight.delete(agentName);
    }
  }

  /** Turn matured skill candidates (≥ threshold, not yet proposed) into pending
   *  skill proposals in the Inbox (§9). Gated on reflection.proposeSkills. */
  private async generateProposals(
    agent: AgentConfig,
    candidates: SkillCandidate[],
    nowIso: string,
  ): Promise<void> {
    if (!agent.reflection.proposeSkills) return;
    const threshold = agent.reflection.recurrenceThreshold || 3;
    for (const c of candidates) {
      if (c.proposed || c.occurrences < threshold) continue;
      const id = `prop-${nowIso.slice(0, 10)}-${c.key}`.slice(0, 80);
      const proposal: SkillProposal = {
        id,
        type: "skill_create",
        agent: agent.name,
        status: "pending",
        created: nowIso,
        targetSkill: c.suggestedSkill || c.key,
        candidate: c.key,
        evidence: c.evidence,
        rationale: c.pattern,
        body:
          `This skill was proposed by reflection because the following friction recurred ` +
          `${c.occurrences} times:\n\n> ${c.pattern}\n\n` +
          `Document the reliable steps to handle this so future runs don't rediscover them.`,
      };
      try {
        await this.repository.writeProposal(proposal);
        c.proposed = true;
        // Persist the `proposed` flag immediately (not batched at the end) so a
        // crash can't re-propose the whole run's candidates on the next reflection.
        await this.repository.writeCandidates(agent.name, candidates);
      } catch (err) {
        console.warn(`Agent Fleet: failed to write proposal for "${agent.name}"`, err);
      }
    }
  }

  private async runPendingTask({ task, promptOverride }: PendingRun): Promise<void> {
    const agent = this.repository.getAgentByName(task.agent);
    if (!agent || !agent.enabled) {
      return;
    }

    const started = new Date().toISOString();
    this.runtimeState.set(agent.name, { status: "running", currentTaskId: task.taskId, runStarted: started });
    this.runOutputBuffers.set(agent.name, "");
    this.emitStatusChange();

    try {
      const result = await this.executor.execute(agent, task, promptOverride, (chunk) => {
        const current = this.runOutputBuffers.get(agent.name) ?? "";
        this.runOutputBuffers.set(agent.name, current + chunk);
        const listeners = this.runOutputListeners.get(agent.name);
        if (listeners) {
          for (const listener of listeners) {
            listener(chunk);
          }
        }
      });
      const wasAborted = this.consumeAborted(agent.name);
      const approvals = wasAborted ? [] : this.buildApprovals(agent, result.toolsUsed);
      const runStatus = wasAborted ? "cancelled" : this.resolveRunStatus(result, approvals);
      const run: RunLogData = {
        runId: result.runId,
        agent: agent.name,
        task: task.taskId,
        status: runStatus as RunLogData["status"],
        started,
        completed: new Date().toISOString(),
        durationSeconds: result.durationSeconds,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        model: result.resolvedModel || agent.model,
        modelSource: result.modelSource,
        concreteModel: result.concreteModel,
        exitCode: result.exitCode,
        tags: Array.from(new Set([...agent.tags, ...task.tags])),
        prompt: result.prompt,
        output: result.outputText,
        toolsUsed: result.toolsUsed.map((tool) => `${tool.tool}${tool.command ? `: ${tool.command}` : ""}`),
        finalResult: result.finalResult,
        stderr: result.stderr,
        approvals,
      };

      const runPath = await this.repository.writeRunLog(run);
      await this.repository.updateTaskRunMetadata(task, {
        lastRun: started,
        runCount: task.runCount + 1,
      });

      if (agent.memory) {
        const isHeartbeat = task.tags.includes("heartbeat");
        const source = isHeartbeat ? "heartbeat" : `task:${task.taskId}`;
        const entries = extractCaptures(result.outputText);
        try {
          await this.memoryWriter.capture(agent, entries, source, new Date().toISOString());
        } catch (err) {
          console.warn(`Agent Fleet: failed to append memory for "${agent.name}"`, err);
        }
      }

      // Post heartbeat results to Slack channel if configured
      const isHeartbeatRun = task.tags.includes("heartbeat");
      if (isHeartbeatRun && !wasAborted && agent.heartbeatChannel && run.output.trim()) {
        try {
          this.heartbeatResultHandler?.(agent.name, agent.heartbeatChannel, run.output);
        } catch (err) {
          console.warn(`Agent Fleet: heartbeat channel delivery failed for ${agent.name}`, err);
        }
      }

      if (wasAborted) {
        run.output = "Task was manually stopped.";
      }

      await this.refreshRunCaches();
      this.runtimeState.set(agent.name, {
        status: wasAborted ? "idle" : runStatus === "success" ? "idle" : runStatus === "pending_approval" ? "pending" : "error",
        currentRunId: result.runId,
        lastRun: { ...run, filePath: runPath },
      });

      if (!wasAborted) this.notify(run);
    } catch (error) {
      const wasAborted = this.consumeAborted(agent.name);
      const runStatus = wasAborted ? "cancelled" : "failure";
      const resolved = resolveModel(task, agent, this.settings);
      const run: RunLogData = {
        runId: randomUUID(),
        agent: agent.name,
        task: task.taskId,
        status: runStatus as RunLogData["status"],
        started,
        completed: new Date().toISOString(),
        durationSeconds: Math.round((Date.now() - new Date(started).getTime()) / 1000),
        model: resolved.value || agent.model,
        modelSource: resolved.source,
        exitCode: wasAborted ? -1 : 1,
        tags: Array.from(new Set([...agent.tags, ...task.tags])),
        prompt: promptOverride ?? task.body,
        output: wasAborted ? "Task was manually stopped." : (error instanceof Error ? error.message : String(error)),
        toolsUsed: [],
      };
      const runPath = await this.repository.writeRunLog(run);
      await this.refreshRunCaches();
      this.runtimeState.set(agent.name, {
        status: wasAborted ? "idle" : "error",
        lastRun: { ...run, filePath: runPath },
      });
      if (!wasAborted) this.notify(run);
    } finally {
      // Fold any `remember` MCP-tool captures from this run into memory (§7.5).
      if (agent.memory) {
        try {
          await this.memoryWriter.drainPending(agent, new Date().toISOString());
        } catch (err) {
          console.warn(`Agent Fleet: failed to drain pending memory for "${agent.name}"`, err);
        }
      }
      this.runOutputBuffers.delete(agent.name);
      this.runOutputListeners.delete(agent.name);
      this.emitStatusChange();
    }
  }

  private buildApprovals(agent: AgentConfig, tools: Array<{ tool: string; command?: string; reason?: string }>): ApprovalRecord[] | undefined {
    const approvals = tools
      .filter((tool) => agent.approvalRequired.includes(tool.tool))
      .map((tool) => ({
        tool: tool.tool,
        command: tool.command,
        reason: tool.reason,
        status: "pending" as const,
      }));
    return approvals.length > 0 ? approvals : undefined;
  }

  private resolveRunStatus(
    result: { exitCode: number | null; timedOut: boolean },
    approvals?: ApprovalRecord[],
  ): RunStatus {
    if (approvals?.length) {
      return "pending_approval";
    }
    if (result.timedOut) {
      return "timeout";
    }
    return result.exitCode === 0 ? "success" : "failure";
  }

  private notify(run: RunLogData): void {
    if (this.settings.notificationLevel === "none") {
      return;
    }
    if (this.settings.notificationLevel === "failures-only" && run.status === "success") {
      return;
    }

    // Get first meaningful line of output (skip JSON and empty lines)
    const firstLine = splitLines(run.output)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("{") && !l.startsWith("[")) ?? "";
    const preview = firstLine.slice(0, 120) || run.status;

    const message =
      run.status === "success"
        ? `✅ ${run.agent}: ${preview}`
        : run.status === "pending_approval"
          ? `🔵 ${run.agent} needs approval: ${(run.approvals ?? [])[0]?.tool ?? "tool action"}`
          : `❌ ${run.agent}: ${preview}`;
    new Notice(message, run.status === "success" ? 5000 : 0);
  }

  private emitStatusChange(): void {
    for (const listener of this.statusChangeListeners) {
      listener();
    }
  }
}
