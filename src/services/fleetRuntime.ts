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
  UsageRecord,
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
  /** Chat/channel usage records over the chart window. Feeds the comprehensive
   *  token/cost totals (runs are counted from run logs). */
  private recentUsage: UsageRecord[] = [];
  private statusChangeListeners = new Set<() => void>();
  private runOutputListeners = new Map<string, Set<(chunk: string) => void>>();
  private runOutputBuffers = new Map<string, string>();
  /** Chunks accumulated since the last listener flush, per agent. Live output
   *  is fanned out to listeners at most every OUTPUT_FLUSH_INTERVAL_MS (plus a
   *  final flush at run end) so large/chatty CLI output doesn't cause a render
   *  per stdout chunk. `runOutputBuffers` is still appended eagerly, so
   *  getRunOutputBuffer() is always current. */
  private runOutputPending = new Map<string, string>();
  private runOutputFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly OUTPUT_FLUSH_INTERVAL_MS = 100;
  /** Cached expensive parts of getFleetStatus() — it's called on every render.
   *  Keyed on the `recentRuns` array identity (refreshRunCaches() replaces the
   *  array wholesale and nothing mutates it in place, so a changed reference
   *  means runs/approvals changed) plus the local date, so `completedToday`
   *  rolls over at midnight. `running` is recomputed each call (it depends on
   *  runtimeState and is O(#agents)). */
  private fleetStatusCache: { runs: RunLogData[]; today: string; completedToday: number; pending: number } | null = null;
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
  /** Callback for run-result channel delivery (e.g. Slack/Discord posting). Set by
   *  main.ts. `source` is "heartbeat" for heartbeat runs or the task id otherwise,
   *  so the handler can label the post. `target` is an optional transport-native
   *  destination id (post to a specific channel) — empty means broadcast/DM. */
  private channelResultHandler?: (agentName: string, channel: string, output: string, source: string, target: string) => void;
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
   * Register a callback that receives run results for delivery to external
   * channels (e.g. Slack, Discord). Fires for heartbeat runs (using the agent's
   * heartbeatChannel) and for any scheduled/manual task that sets a `channel`
   * field. Called from main.ts after the ChannelManager is ready.
   */
  onChannelResult(handler: (agentName: string, channel: string, output: string, source: string, target: string) => void): void {
    this.channelResultHandler = handler;
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
    this.recentUsage = await this.repository.readUsageSince(since);
  }

  /** Chat/channel usage records over the chart window (for token/cost totals). */
  getUsageRecords(): UsageRecord[] {
    return this.recentUsage;
  }

  /** Append a chat/channel turn's usage to the ledger and reflect it live in the
   *  cached totals. Fire-and-forget from ChatSession via the plugin. */
  recordUsage(record: UsageRecord): void {
    this.recentUsage.push(record);
    void this.repository.appendUsage(record).catch((err) => {
      console.warn("Agent Fleet: failed to append usage record", err);
    });
    this.emitStatusChange();
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
    let cache = this.fleetStatusCache;
    if (!cache || cache.runs !== this.recentRuns || cache.today !== today) {
      const completedToday = this.recentRuns.filter((run) => {
        const d = new Date(run.started);
        const runDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        return runDate === today;
      }).length;
      const pending = this.recentRuns.flatMap((run) => run.approvals ?? []).filter((item) => item.status === "pending").length;
      cache = { runs: this.recentRuns, today, completedToday, pending };
      this.fleetStatusCache = cache;
    }
    const running = Array.from(this.runtimeState.values()).filter((state) => state.status === "running").length;
    return {
      running,
      pending: cache.pending,
      completedToday: cache.completedToday,
    };
  }

  subscribe(listener: () => void): () => void {
    this.statusChangeListeners.add(listener);
    return () => this.statusChangeListeners.delete(listener);
  }

  onRunOutput(agentName: string, callback: (chunk: string) => void): () => void {
    // Flush any batched chunks to the *existing* listeners first: the snapshot
    // handed to the new listener below already contains them (the buffer is
    // appended eagerly), so leaving them pending would deliver them twice.
    this.flushRunOutput(agentName);
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

  /** Record a live output chunk: append to the (always-current) buffer, and
   *  batch listener notification so a chatty CLI doesn't trigger a dashboard
   *  render per stdout chunk. Listeners receive the concatenated pending
   *  chunks at most every OUTPUT_FLUSH_INTERVAL_MS. */
  private emitRunOutput(agentName: string, chunk: string): void {
    this.runOutputBuffers.set(agentName, (this.runOutputBuffers.get(agentName) ?? "") + chunk);
    this.runOutputPending.set(agentName, (this.runOutputPending.get(agentName) ?? "") + chunk);
    if (!this.runOutputFlushTimers.has(agentName)) {
      this.runOutputFlushTimers.set(
        agentName,
        setTimeout(() => this.flushRunOutput(agentName), FleetRuntime.OUTPUT_FLUSH_INTERVAL_MS),
      );
    }
  }

  /** Deliver batched chunks (concatenated, in order) to listeners now. */
  private flushRunOutput(agentName: string): void {
    const timer = this.runOutputFlushTimers.get(agentName);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.runOutputFlushTimers.delete(agentName);
    }
    const pending = this.runOutputPending.get(agentName);
    if (!pending) return;
    this.runOutputPending.delete(agentName);
    const listeners = this.runOutputListeners.get(agentName);
    if (listeners) {
      for (const listener of listeners) listener(pending);
    }
  }

  /** Reset live-output state at run start (clears any stale batch/timer). */
  private resetRunOutput(agentName: string): void {
    const timer = this.runOutputFlushTimers.get(agentName);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.runOutputFlushTimers.delete(agentName);
    }
    this.runOutputPending.delete(agentName);
    this.runOutputBuffers.set(agentName, "");
  }

  /** Final flush + teardown of live-output state at run end, so listeners see
   *  the tail of the output before the buffer is dropped. */
  private clearRunOutput(agentName: string): void {
    this.flushRunOutput(agentName);
    this.runOutputBuffers.delete(agentName);
    this.runOutputListeners.delete(agentName);
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
    for (const [, timer] of this.runOutputFlushTimers) {
      clearTimeout(timer);
    }
    this.runOutputFlushTimers.clear();
    this.runOutputPending.clear();
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

    // Prevent duplicate runs if the previous heartbeat is still in-flight.
    // The check-and-add is synchronous (no await in between), so concurrent
    // ticks can't both pass the guard.
    if (this.heartbeatsInFlight.has(agentName)) return;
    this.heartbeatsInFlight.add(agentName);

    // The guard must outlive enqueue(): the scheduler resolves it when the run
    // is queued/started, not when it completes. runPendingTask clears the flag
    // once the heartbeat run actually finishes; clear here only when no run was
    // enqueued (agent gone/disabled, or enqueue threw).
    let enqueued = false;
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
      enqueued = true;
    } finally {
      if (!enqueued) this.heartbeatsInFlight.delete(agentName);
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
    const started = new Date().toISOString();
    const nowIso = started;
    const reflectionTaskId = `reflection-${Date.now()}`;
    // Surface the reflection as a running agent (overview "Active Agents" card +
    // sidebar status) with live output, exactly like a task/heartbeat run.
    this.runtimeState.set(agentName, {
      status: "running",
      currentTaskId: reflectionTaskId,
      runStarted: started,
    });
    this.resetRunOutput(agentName);
    this.emitStatusChange();
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
        taskId: reflectionTaskId,
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
      // not emit new captures or carry the capture instruction). Stream output so
      // the overview shows live progress.
      const result = await this.withReflectionSlot(() =>
        this.executor.execute(agent, task, prompt, (chunk) => this.emitRunOutput(agentName, chunk), {
          suppressMemoryCapture: true,
        }),
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

      const message = applied
        ? "Reflection complete — working memory consolidated."
        : "Reflection produced no memory block; working memory left unchanged.";

      // Record the reflection as a run so it shows in Recent Activity / run
      // history with its full output — the user can confirm it ran and see what
      // it consolidated. A clean CLI exit is "success" even if nothing changed;
      // `finalResult` carries the consolidation outcome.
      const runStatus: RunStatus =
        result.exitCode === 0 || result.exitCode === null ? "success" : "failure";
      const run: RunLogData = {
        runId: result.runId,
        agent: agent.name,
        task: reflectionTaskId,
        status: runStatus,
        started,
        completed: new Date().toISOString(),
        durationSeconds: result.durationSeconds,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        model: result.resolvedModel || agent.reflection.model || agent.model,
        modelSource: result.modelSource,
        concreteModel: result.concreteModel,
        exitCode: result.exitCode,
        tags: Array.from(new Set([...agent.tags, "reflection"])),
        prompt: result.prompt,
        output: result.outputText,
        toolsUsed: result.toolsUsed.map((tool) => `${tool.tool}${tool.command ? `: ${tool.command}` : ""}`),
        finalResult: message,
        stderr: result.stderr,
      };
      const runPath = await this.repository.writeRunLog(run);
      await this.refreshRunCaches();
      this.runtimeState.set(agentName, {
        status: runStatus === "success" ? "idle" : "error",
        currentRunId: result.runId,
        lastRun: { ...run, filePath: runPath },
      });
      // Reflection runs bypass runPendingTask, so surface failures here —
      // otherwise a broken nightly reflection is invisible outside run logs.
      if (runStatus === "failure") this.notify(run);
      return { ok: applied, message };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`Agent Fleet: reflection failed for "${agentName}":`, error);
      // Record the failure as a run too, so it's visible in activity.
      const run: RunLogData = {
        runId: randomUUID(),
        agent: agentName,
        task: reflectionTaskId,
        status: "failure",
        started,
        completed: new Date().toISOString(),
        durationSeconds: Math.round((Date.now() - new Date(started).getTime()) / 1000),
        model: agent.reflection.model || agent.model,
        exitCode: 1,
        tags: Array.from(new Set([...agent.tags, "reflection"])),
        prompt: "",
        output: `Reflection failed: ${msg}`,
        toolsUsed: [],
      };
      let lastRun: RunLogData = run;
      try {
        const runPath = await this.repository.writeRunLog(run);
        await this.refreshRunCaches();
        lastRun = { ...run, filePath: runPath };
      } catch (writeErr) {
        console.warn(`Agent Fleet: failed to write reflection run log for "${agentName}"`, writeErr);
      }
      this.runtimeState.set(agentName, { status: "error", lastRun });
      this.notify(run);
      return { ok: false, message: `Reflection failed: ${msg}` };
    } finally {
      this.reflectionsInFlight.delete(agentName);
      this.clearRunOutput(agentName);
      this.emitStatusChange();
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
    // Release the cron dedup guard once the heartbeat run is truly done — see
    // runHeartbeat. Manual heartbeat-tagged runs delete a flag that isn't set,
    // which is harmless.
    const clearHeartbeatGuard = () => {
      if (task.tags.includes("heartbeat")) this.heartbeatsInFlight.delete(task.agent);
    };
    const agent = this.repository.getAgentByName(task.agent);
    if (!agent || !agent.enabled) {
      clearHeartbeatGuard();
      return;
    }

    const started = new Date().toISOString();
    this.runtimeState.set(agent.name, { status: "running", currentTaskId: task.taskId, runStarted: started });
    this.resetRunOutput(agent.name);
    this.emitStatusChange();

    try {
      const result = await this.executor.execute(agent, task, promptOverride, (chunk) =>
        this.emitRunOutput(agent.name, chunk),
      );
      const wasAborted = this.consumeAborted(agent.name);
      const approvals = wasAborted ? [] : this.buildApprovals(agent, result.toolsUsed);
      const runStatus = wasAborted ? "cancelled" : this.resolveRunStatus(result, approvals);
      const run: RunLogData = {
        runId: result.runId,
        agent: agent.name,
        task: task.taskId,
        status: runStatus,
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

      let capturedCount = 0;
      if (agent.memory) {
        const isHeartbeat = task.tags.includes("heartbeat");
        const source = isHeartbeat ? "heartbeat" : `task:${task.taskId}`;
        const entries = extractCaptures(result.outputText);
        try {
          await this.memoryWriter.capture(agent, entries, source, new Date().toISOString());
          capturedCount = entries.length;
        } catch (err) {
          console.warn(`Agent Fleet: failed to append memory for "${agent.name}"`, err);
        }
      }

      // Post run results to a channel if configured. Heartbeat runs use the
      // agent's heartbeatChannel; regular scheduled/manual tasks use their own
      // `channel` field. This lets any task — not just the heartbeat — deliver
      // its output to Slack/Discord/Telegram.
      const isHeartbeatRun = task.tags.includes("heartbeat");
      const deliveryChannel = isHeartbeatRun ? agent.heartbeatChannel : (task.channel ?? "");
      // Both heartbeats and tasks may post to a specific channel id via their
      // target field (HEARTBEAT.md `channel_target` / task `channel_target`);
      // an empty target falls back to broadcast (DM to the first allowed user).
      const deliveryTarget = isHeartbeatRun
        ? (agent.heartbeatChannelTarget ?? "")
        : (task.channelTarget ?? "");
      if (deliveryChannel && !wasAborted && run.output.trim()) {
        try {
          this.channelResultHandler?.(
            agent.name,
            deliveryChannel,
            run.output,
            isHeartbeatRun ? "heartbeat" : task.taskId,
            deliveryTarget,
          );
        } catch (err) {
          console.warn(`Agent Fleet: channel delivery failed for ${agent.name}`, err);
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

      if (!wasAborted) this.notify(run, capturedCount);
    } catch (error) {
      const wasAborted = this.consumeAborted(agent.name);
      const runStatus = wasAborted ? "cancelled" : "failure";
      const resolved = resolveModel(task, agent, this.settings);
      const run: RunLogData = {
        runId: randomUUID(),
        agent: agent.name,
        task: task.taskId,
        status: runStatus,
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
      clearHeartbeatGuard();
      // Fold any `remember` MCP-tool captures from this run into memory (§7.5).
      if (agent.memory) {
        try {
          await this.memoryWriter.drainPending(agent, new Date().toISOString());
        } catch (err) {
          console.warn(`Agent Fleet: failed to drain pending memory for "${agent.name}"`, err);
        }
      }
      this.clearRunOutput(agent.name);
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

  private notify(run: RunLogData, capturedCount = 0): void {
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

    // Surface memory captures on successful runs so they aren't drained silently.
    const captureSuffix =
      capturedCount > 0 ? ` · captured ${capturedCount} memory fact${capturedCount === 1 ? "" : "s"}` : "";
    const message =
      run.status === "success"
        ? `✅ ${run.agent}: ${preview}${captureSuffix}`
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
