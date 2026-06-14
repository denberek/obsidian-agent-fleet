import { ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { IconPickerModal } from "../modals/iconPickerModal";
import { VIEW_TYPE_DASHBOARD } from "../constants";
import type AgentFleetPlugin from "../main";
import type { AgentConfig, AgentHealth, ChannelConfig, McpServer, McpTool, RunLogData, SkillConfig, TaskConfig } from "../types";
import { truncate, slugify, parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter } from "../utils/markdown";
import { splitLines } from "../utils/platform";
import { createIcon } from "../utils/icons";
import { renderBarChart, renderDonutChart } from "../components/chartRenderer";
import type { BarChartDay } from "../components/chartRenderer";
import { makeDraggable, makeDropTarget } from "../components/dragDrop";
import { CODEX_MODEL_ALIASES, MODEL_ALIASES, renderModelPicker } from "../components/modelPicker";
import { renderSections } from "../utils/memoryFormat";
import { parseLatestLintReport } from "../utils/wikiLintReport";



type DashboardPage =
  | "dashboard"
  | "agents"
  | "kanban"
  | "runs"
  | "skills"
  | "approvals"
  | "mcp"
  | "channels"
  | "wiki-keepers"
  | "agent-detail"
  | "task-detail"
  | "create-agent"
  | "create-task"
  | "create-skill"
  | "edit-agent"
  | "edit-task"
  | "edit-skill"
  | "create-channel"
  | "edit-channel"
  | "add-mcp-server";

const PAGE_LABELS: Record<DashboardPage, string> = {
  dashboard: "Dashboard",
  agents: "Agents",
  kanban: "Tasks Board",
  runs: "Run History",
  skills: "Skills Library",
  approvals: "Approvals",
  mcp: "MCP Servers",
  channels: "Channels",
  "wiki-keepers": "Wiki Keepers",
  "agent-detail": "Agent Details",
  "task-detail": "Task Details",
  "create-agent": "Create Agent",
  "create-task": "Create Task",
  "create-skill": "Create Skill",
  "edit-agent": "Edit Agent",
  "edit-task": "Edit Task",
  "edit-skill": "Edit Skill",
  "create-channel": "Create Channel",
  "edit-channel": "Edit Channel",
  "add-mcp-server": "Add MCP Server",
};

const PAGE_ICON_NAMES: Record<DashboardPage, string> = {
  dashboard: "layout-dashboard",
  agents: "bot",
  kanban: "columns-3",
  runs: "scroll-text",
  skills: "puzzle",
  approvals: "shield-check",
  mcp: "plug",
  channels: "radio",
  "wiki-keepers": "library",
  "agent-detail": "bot",
  "task-detail": "circle-dot",
  "create-agent": "plus",
  "create-task": "plus",
  "create-skill": "plus",
  "edit-agent": "edit",
  "edit-task": "edit",
  "edit-skill": "edit",
  "create-channel": "plus",
  "edit-channel": "edit",
  "add-mcp-server": "plus",
};

const MAIN_PAGES: DashboardPage[] = ["dashboard", "agents", "kanban", "runs", "approvals", "skills", "wiki-keepers", "mcp", "channels"];

/* Note: The per-adapter model dropdown was replaced by the ModelPicker
 * component (src/components/modelPicker.ts). Aliases and custom IDs are
 * preferred over hardcoded lists because they work across all backends
 * (Anthropic direct, Bedrock, Vertex, Foundry, Mantle) without updates. */

// Adapter choices in the agent forms. "process"/"http" stay greyed out until
// those backends exist.
const ADAPTER_FORM_OPTIONS: Array<[string, string, boolean]> = [
  ["claude-code", "Claude Code", false],
  ["codex", "Codex", false],
  ["process", "Process (coming soon)", true],
  ["http", "HTTP (coming soon)", true],
];

// Permission modes per adapter: [value, label, description].
// Claude Code uses its native --permission-mode vocabulary; Codex maps onto
// sandbox levels (`codex exec` never prompts, so the sandbox is the only
// enforcement axis).
const CLAUDE_PERM_MODE_OPTIONS: Array<[string, string, string]> = [
  ["bypassPermissions", "Bypass Permissions", "Auto-approve everything except deny list"],
  ["dontAsk", "Don’t Ask", "Auto-approve all tool calls"],
  ["acceptEdits", "Accept Edits", "Auto-approve file edits, block bash unless allowed"],
  ["plan", "Plan", "Read-only mode, no writes or commands"],
  ["default", "Default", "Ask for each tool call"],
];
const CODEX_PERM_MODE_OPTIONS: Array<[string, string, string]> = [
  ["bypassPermissions", "Bypass (no sandbox)", "No sandbox, auto-approve everything"],
  ["workspace-write", "Workspace Write", "Sandboxed: writes only inside the working dir"],
  ["read-only", "Read Only", "Sandboxed: no writes or side-effect commands"],
];

function isCodexAdapterValue(adapter: string): boolean {
  const v = adapter.trim().toLowerCase();
  return v === "codex" || v === "openai-codex";
}

function permModeOptionsFor(adapter: string): Array<[string, string, string]> {
  return isCodexAdapterValue(adapter) ? CODEX_PERM_MODE_OPTIONS : CLAUDE_PERM_MODE_OPTIONS;
}

/** Translate a permission-mode value to the nearest equivalent when the user
 *  switches the form's adapter, so the dropdown always shows a valid choice. */
function permModeForAdapter(value: string, adapter: string): string {
  if (isCodexAdapterValue(adapter)) {
    switch (value) {
      case "acceptEdits":
      case "default":
        return "workspace-write";
      case "plan":
        return "read-only";
      case "dontAsk":
        return "bypassPermissions";
      default:
        return CODEX_PERM_MODE_OPTIONS.some(([v]) => v === value) ? value : "bypassPermissions";
    }
  }
  switch (value) {
    case "workspace-write":
      return "acceptEdits";
    case "read-only":
      return "plan";
    case "danger-full-access":
      return "bypassPermissions";
    default:
      return CLAUDE_PERM_MODE_OPTIONS.some(([v]) => v === value) ? value : "bypassPermissions";
  }
}

export class FleetDashboardView extends ItemView {
  private currentPage: DashboardPage = "dashboard";
  private detailContext?: string;
  private agentDetailTab = "overview";
  private streamingUnsubscribes: (() => void)[] = [];
  private channelStatusUnsubscribe?: () => void;
  private authenticatingServers = new Set<string>();

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: AgentFleetPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_DASHBOARD;
  }

  getDisplayText(): string {
    return "Agent Fleet";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    this.plugin.subscribeView(this);
    // Live-refresh status dots on the channels page when adapters connect/disconnect.
    this.channelStatusUnsubscribe = this.plugin.channelManager?.onStatusChange(() => {
      if (this.currentPage === "channels") {
        void this.render();
      }
    });
    await this.render();
  }

  async onClose(): Promise<void> {
    this.cleanupStreaming();
    this.channelStatusUnsubscribe?.();
    this.channelStatusUnsubscribe = undefined;
    this.plugin.unsubscribeView(this);
  }

  navigateTo(page: DashboardPage, context?: string): void {
    this.currentPage = page;
    this.detailContext = context;
    if (page !== "agent-detail") this.agentDetailTab = "overview";
    void this.render();
  }

  async render(): Promise<void> {
    this.cleanupStreaming();

    const root = this.contentEl;

    root.empty();
    root.addClass("af-root");

    const app = root.createDiv({ cls: "af-app" });
    const main = app.createDiv({ cls: "af-main-content" });

    this.renderTopBar(main);
    this.renderTabBar(main);

    const pageContainer = main.createDiv({ cls: "af-page" });
    switch (this.currentPage) {
      case "dashboard":
        this.renderDashboardPage(pageContainer);
        break;
      case "agents":
        this.renderAgentsPage(pageContainer);
        break;
      case "kanban":
        this.renderKanbanPage(pageContainer);
        break;
      case "runs":
        this.renderRunsPage(pageContainer);
        break;
      case "skills":
        this.renderSkillsPage(pageContainer);
        break;
      case "approvals":
        this.renderApprovalsPage(pageContainer);
        break;
      case "mcp":
        this.renderMcpPage(pageContainer);
        break;
      case "channels":
        this.renderChannelsPage(pageContainer);
        break;
      case "wiki-keepers":
        void this.renderWikiKeepersPage(pageContainer);
        break;
      case "agent-detail":
        this.renderAgentDetailPage(pageContainer);
        break;
      case "task-detail":
        this.renderTaskDetailPage(pageContainer);
        break;
      case "create-agent":
        this.renderCreateAgentPage(pageContainer);
        break;
      case "create-task":
        this.renderCreateTaskPage(pageContainer);
        break;
      case "create-skill":
        this.renderCreateSkillPage(pageContainer);
        break;
      case "edit-agent":
        this.renderEditAgentPage(pageContainer);
        break;
      case "edit-task":
        this.renderEditTaskPage(pageContainer);
        break;
      case "edit-skill":
        this.renderEditSkillPage(pageContainer);
        break;
      case "create-channel":
        this.renderCreateChannelPage(pageContainer);
        break;
      case "edit-channel":
        this.renderEditChannelPage(pageContainer);
        break;
      case "add-mcp-server":
        this.renderAddMcpServerPage(pageContainer);
        break;
    }

  }

  private navigate(page: DashboardPage, context?: string): void {
    this.navigateTo(page, context);
  }

  private cleanupStreaming(): void {
    for (const unsub of this.streamingUnsubscribes) {
      unsub();
    }
    this.streamingUnsubscribes = [];
  }

  // ═══════════════════════════════════════════════════════
  //  Top Bar
  // ═══════════════════════════════════════════════════════

  private renderTopBar(container: HTMLElement): void {
    const bar = container.createDiv({ cls: "af-top-bar" });

    const title = bar.createDiv({ cls: "af-top-bar-title" });
    createIcon(title, "bot", "af-top-bar-icon");
    title.createSpan({ text: "Agent Fleet" });

    const breadcrumb = bar.createDiv({ cls: "af-breadcrumb" });
    const chevron1 = breadcrumb.createSpan({ cls: "af-breadcrumb-sep" });
    setIcon(chevron1, "chevron-right");

    // Multi-level breadcrumbs for detail/edit pages
    const addCrumb = (label: string, page?: DashboardPage, ctx?: string) => {
      const el = breadcrumb.createSpan({ cls: page ? "af-breadcrumb-link" : "", text: label });
      if (page) el.onclick = () => this.navigate(page, ctx);
    };
    const addSep = () => {
      const s = breadcrumb.createSpan({ cls: "af-breadcrumb-sep" });
      setIcon(s, "chevron-right");
    };

    switch (this.currentPage) {
      case "agent-detail":
        addCrumb("Agents", "agents");
        addSep();
        addCrumb(this.detailContext ?? "Agent");
        break;
      case "task-detail":
        addCrumb("Tasks Board", "kanban");
        addSep();
        addCrumb(this.detailContext ?? "Task");
        break;
      case "edit-agent":
        addCrumb("Agents", "agents");
        addSep();
        addCrumb(this.detailContext ?? "Agent", "agent-detail", this.detailContext);
        addSep();
        addCrumb("Edit");
        break;
      case "edit-task":
        addCrumb("Tasks Board", "kanban");
        addSep();
        addCrumb(this.detailContext ?? "Task", "task-detail", this.detailContext);
        addSep();
        addCrumb("Edit");
        break;
      case "create-agent":
        addCrumb("Agents", "agents");
        addSep();
        addCrumb("New Agent");
        break;
      case "create-task":
        addCrumb("Tasks Board", "kanban");
        addSep();
        addCrumb("New Task");
        break;
      case "create-skill":
        addCrumb("Skills Library", "skills");
        addSep();
        addCrumb("New Skill");
        break;
      case "edit-skill":
        addCrumb("Skills Library", "skills");
        addSep();
        addCrumb(this.detailContext ?? "Skill");
        addSep();
        addCrumb("Edit");
        break;
      case "create-channel":
        addCrumb("Channels", "channels");
        addSep();
        addCrumb("New Channel");
        break;
      case "edit-channel":
        addCrumb("Channels", "channels");
        addSep();
        addCrumb(this.detailContext ?? "Channel");
        addSep();
        addCrumb("Edit");
        break;
      case "add-mcp-server":
        addCrumb("MCP Servers", "mcp");
        addSep();
        addCrumb("Add Server");
        break;
      default:
        addCrumb(PAGE_LABELS[this.currentPage]);
    }

    bar.createDiv({ cls: "af-top-bar-spacer" });

    // Search
    const searchWrap = bar.createDiv({ cls: "af-search-wrap" });
    createIcon(searchWrap, "search", "af-search-icon");
    const searchInput = searchWrap.createEl("input", {
      cls: "af-search-input",
      attr: { type: "text", placeholder: "Search agents, tasks, runs..." },
    });
    searchInput.addEventListener("input", () => {
      this.handleSearch(searchInput.value, searchWrap);
    });
    searchInput.addEventListener("blur", () => {
      window.setTimeout(() => searchWrap.querySelector(".af-search-results")?.remove(), 200);
    });

    // Status pills
    const status = this.plugin.runtime.getFleetStatus();
    const pills = bar.createDiv({ cls: "af-status-pills" });

    if (status.running > 0) {
      const pill = pills.createSpan({ cls: "af-pill yellow" });
      pill.createSpan({ cls: "af-dot pulse" });
      pill.appendText(` ${status.running} Running`);
    }
    if (status.pending > 0) {
      const pill = pills.createSpan({ cls: "af-pill blue" });
      pill.createSpan({ cls: "af-dot" });
      pill.appendText(` ${status.pending} Pending`);
    }
    const todayPill = pills.createSpan({ cls: "af-pill green" });
    todayPill.createSpan({ cls: "af-dot" });
    todayPill.appendText(` ${status.completedToday} Today`);
  }

  // ═══════════════════════════════════════════════════════
  //  Tab Bar
  // ═══════════════════════════════════════════════════════

  private renderTabBar(container: HTMLElement): void {
    const bar = container.createDiv({ cls: "af-tab-bar" });
    const snapshot = this.plugin.runtime.getSnapshot();
    const status = this.plugin.runtime.getFleetStatus();

    for (const page of MAIN_PAGES) {
      const isActive = this.currentPage === page ||
        (page === "agents" && (this.currentPage === "agent-detail" || this.currentPage === "edit-agent" || this.currentPage === "create-agent")) ||
        (page === "kanban" && (this.currentPage === "task-detail" || this.currentPage === "edit-task")) ||
        (page === "skills" && (this.currentPage === "edit-skill" || this.currentPage === "create-skill")) ||
        (page === "mcp" && this.currentPage === "add-mcp-server");

      const tab = bar.createEl("button", {
        cls: `af-tab-item${isActive ? " active" : ""}`,
      });

      const tabIcon = tab.createSpan({ cls: "af-tab-icon" });
      setIcon(tabIcon, PAGE_ICON_NAMES[page]);
      tab.appendText(page === "dashboard" ? "Overview" : PAGE_LABELS[page]);

      if (page === "agents") {
        tab.createSpan({ cls: "af-badge", text: String(snapshot.agents.length) });
      } else if (page === "skills") {
        tab.createSpan({ cls: "af-badge", text: String(snapshot.skills.length) });
      } else if (page === "mcp") {
        const mcpCount = this.plugin.repository.getMcpServers().length;
        tab.createSpan({ cls: "af-badge", text: String(mcpCount) });
      } else if (page === "approvals" && status.pending > 0) {
        tab.createSpan({ cls: "af-badge af-badge-warn", text: String(status.pending) });
      }

      tab.onclick = () => this.navigate(page);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Dashboard (Overview) Page
  // ═══════════════════════════════════════════════════════

  private renderDashboardPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-dashboard" });
    const snapshot = this.plugin.runtime.getSnapshot();
    const runs = this.plugin.runtime.getRecentRuns();
    const status = this.plugin.runtime.getFleetStatus();

    // Approval banners
    const pendingApprovals = runs.filter((run) =>
      (run.approvals ?? []).some((a) => a.status === "pending"),
    );
    for (const run of pendingApprovals) {
      for (const approval of run.approvals ?? []) {
        if (approval.status !== "pending") continue;
        this.renderApprovalBanner(page, run, approval.tool);
      }
    }

    // Stat cards
    const grid = page.createDiv({ cls: "af-dash-grid" });
    const activeAgents = snapshot.agents.filter((a) => a.enabled).length;
    const totalAgents = snapshot.agents.length;

    this.renderStatCard(grid, "Active Agents", `${activeAgents}`, `/ ${totalAgents}`, "bot",
      `${activeAgents} of ${totalAgents} enabled`);

    const todayStr = this.toLocalDateStr(new Date());
    const todayRuns = runs.filter((r) => this.runToLocalDate(r.started) === todayStr);
    const passed = todayRuns.filter((r) => r.status === "success").length;
    const failed = todayRuns.filter((r) => r.status === "failure" || r.status === "timeout").length;
    this.renderStatCard(grid, "Runs Today", String(todayRuns.length), "", "activity",
      `${passed} passed \u00B7 ${failed} failed \u00B7 ${status.running} running`);

    const totalTokens = todayRuns.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0);
    const totalCost = todayRuns.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
    const costSuffix = totalCost > 0 ? ` \u00B7 $${totalCost.toFixed(2)}` : "";
    this.renderStatCard(grid, "Tokens Used", formatTokenCount(totalTokens), "", "zap", `today${costSuffix}`);

    const scheduledTasks = snapshot.tasks.filter((t) => t.enabled && t.schedule);
    this.renderStatCard(grid, "Scheduled Tasks", String(scheduledTasks.length), "", "clock",
      scheduledTasks.length > 0 ? `Next: ${this.getNextTaskLabel(scheduledTasks)}` : "No scheduled tasks");

    // Charts row — bar chart is fed by the date-bounded chartRuns list so
    // a busy fleet can't push older days out of the 14-day window. Donut
    // (success rate) keeps using the recent-50 list, which is the headline
    // "how am I doing lately" number.
    this.renderChartsRow(page, runs, this.plugin.runtime.getChartRuns());

    // Streaming output cards
    this.renderStreamingCards(page);

    // Split: Timeline + Fleet status
    const split = page.createDiv({ cls: "af-dash-split" });
    this.renderActivityTimeline(split, runs);
    this.renderFleetStatusPanel(split, snapshot);
  }

  private renderChartsRow(container: HTMLElement, runs: RunLogData[], chartRuns: RunLogData[]): void {
    const row = container.createDiv({ cls: "af-charts-row" });

    // Bar chart: 14-day run activity
    const barSection = row.createDiv({ cls: "af-section-card af-chart-section" });
    const barHeader = barSection.createDiv({ cls: "af-section-header" });
    const barTitle = barHeader.createDiv({ cls: "af-section-title" });
    createIcon(barTitle, "activity");
    barTitle.appendText(" Run Activity (14d)");
    const barBody = barSection.createDiv({ cls: "af-chart-body" });

    const chartData = this.buildChartData(chartRuns, 14);
    if (chartData.some((d) => d.success + d.failure + d.cancelled > 0)) {
      renderBarChart(barBody, chartData);
    } else {
      this.renderEmptyState(barBody, "activity", "No run data", "Run agents to see activity");
    }

    // Donut chart: success rate
    const donutSection = row.createDiv({ cls: "af-section-card af-chart-section" });
    const donutHeader = donutSection.createDiv({ cls: "af-section-header" });
    const donutTitle = donutHeader.createDiv({ cls: "af-section-title" });
    createIcon(donutTitle, "target");
    donutTitle.appendText(" Success Rate");
    const donutBody = donutSection.createDiv({ cls: "af-chart-body af-chart-body-center" });

    const totalRuns = runs.length;
    const successRuns = runs.filter((r) => r.status === "success").length;
    if (totalRuns > 0) {
      renderDonutChart(donutBody, successRuns, totalRuns);
    } else {
      this.renderEmptyState(donutBody, "target", "No data", "");
    }
  }

  private toLocalDateStr(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private runToLocalDate(started: string): string {
    return this.toLocalDateStr(new Date(started));
  }

  private buildChartData(runs: RunLogData[], days: number): BarChartDay[] {
    const result: BarChartDay[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = this.toLocalDateStr(d);
      const dayRuns = runs.filter((r) => this.runToLocalDate(r.started) === dateStr);
      result.push({
        date: dateStr,
        success: dayRuns.filter((r) => r.status === "success").length,
        failure: dayRuns.filter((r) => r.status === "failure" || r.status === "timeout").length,
        cancelled: dayRuns.filter((r) => r.status === "cancelled").length,
      });
    }
    return result;
  }

  private renderStreamingCards(container: HTMLElement): void {
    const snapshot = this.plugin.runtime.getSnapshot();
    const runningAgents = snapshot.agents.filter((a) => {
      const state = this.plugin.runtime.getAgentState(a.name);
      return state.status === "running";
    });

    if (runningAgents.length === 0) return;

    const section = container.createDiv({ cls: "af-streaming-section" });
    const header = section.createDiv({ cls: "af-section-header" });
    const titleEl = header.createDiv({ cls: "af-section-title" });
    createIcon(titleEl, "terminal");
    titleEl.appendText(" Active Agents");

    for (const agent of runningAgents) {
      this.renderStreamingCard(section, agent.name);
    }
  }

  private renderStreamingCard(container: HTMLElement, agentName: string): void {
    const card = container.createDiv({ cls: "af-streaming-card" });

    // Find what this agent is currently running
    const state = this.plugin.runtime.getAgentState(agentName);
    const snapshot = this.plugin.runtime.getSnapshot();
    const runningTask = state.currentTaskId
      ? snapshot.tasks.find((t) => t.taskId === state.currentTaskId)
      : undefined;
    const taskLabel = runningTask
      ? ` → ${runningTask.taskId}`
      : state.status === "running" ? " → Heartbeat" : "";

    const header = card.createDiv({ cls: "af-streaming-card-header" });
    header.createSpan({ cls: "af-dot pulse", attr: { style: "background: var(--af-yellow)" } });
    header.createSpan({ cls: "af-streaming-card-agent", text: ` ${agentName}` });
    if (taskLabel) {
      header.createSpan({ cls: "af-streaming-card-task", text: taskLabel });
    }

    const output = card.createDiv({ cls: "af-streaming-output" });
    const buffer = this.plugin.runtime.getRunOutputBuffer(agentName);
    const lines = splitLines(buffer).slice(-4);
    output.setText(lines.join("\n"));

    const unsub = this.plugin.runtime.onRunOutput(agentName, () => {
      const updated = this.plugin.runtime.getRunOutputBuffer(agentName);
      const updatedLines = splitLines(updated).slice(-4);
      output.setText(updatedLines.join("\n"));
      output.scrollTop = output.scrollHeight;
    });
    this.streamingUnsubscribes.push(unsub);
  }

  private renderApprovalBanner(container: HTMLElement, run: RunLogData, tool: string): void {
    const banner = container.createDiv({ cls: "af-approval-banner" });
    const iconEl = banner.createDiv({ cls: "af-approval-icon" });
    setIcon(iconEl, "shield-check");

    const text = banner.createDiv({ cls: "af-approval-text" });
    text.createDiv({ cls: "af-approval-title", text: `${run.agent} wants to run: ${tool}` });
    text.createDiv({ cls: "af-approval-desc", text: `Approval required for tool: ${tool}` });

    const actions = banner.createDiv({ cls: "af-approval-actions" });
    const approveBtn = actions.createEl("button", { cls: "af-btn-approve", text: "Approve" });
    approveBtn.onclick = () =>
      void this.plugin.runtime.resolveApproval(run, tool, "approved").then(() => this.render());

    const rejectBtn = actions.createEl("button", { cls: "af-btn-reject", text: "Reject" });
    rejectBtn.onclick = () =>
      void this.plugin.runtime.resolveApproval(run, tool, "rejected").then(() => this.render());
  }

  private renderStatCard(
    container: HTMLElement,
    label: string,
    value: string,
    valueSuffix: string,
    iconName: string,
    sub: string,
  ): void {
    const card = container.createDiv({ cls: "af-stat-card" });
    const labelEl = card.createDiv({ cls: "af-stat-label" });
    createIcon(labelEl, iconName, "af-stat-icon");
    labelEl.appendText(` ${label}`);

    const valueEl = card.createDiv({ cls: "af-stat-value" });
    valueEl.appendText(value);
    if (valueSuffix) {
      valueEl.createSpan({ cls: "af-stat-value-suffix", text: valueSuffix });
    }

    card.createDiv({ cls: "af-stat-sub", text: sub });
  }

  private renderActivityTimeline(container: HTMLElement, runs: RunLogData[]): void {
    const section = container.createDiv({ cls: "af-section-card" });
    const header = section.createDiv({ cls: "af-section-header" });
    const titleEl = header.createDiv({ cls: "af-section-title" });
    createIcon(titleEl, "inbox");
    titleEl.appendText(" Recent Activity");

    const timeline = section.createDiv({ cls: "af-timeline" });
    const displayRuns = runs.slice(0, 8);

    if (displayRuns.length === 0) {
      this.renderEmptyState(timeline, "inbox", "No runs yet", "Run an agent to see activity here");
      return;
    }

    for (const run of displayRuns) {
      this.renderTimelineItem(timeline, run);
    }
  }

  private renderTimelineItem(container: HTMLElement, run: RunLogData): void {
    const item = container.createDiv({ cls: "af-timeline-item" });

    const iconCls = this.statusToTimelineClass(run.status);
    const iconEl = item.createDiv({ cls: `af-tl-icon ${iconCls}` });
    setIcon(iconEl, this.statusToIconName(run.status));

    const body = item.createDiv({ cls: "af-tl-body" });
    const titleEl = body.createDiv({ cls: "af-tl-title" });
    titleEl.createSpan({ cls: "af-agent-tag", text: run.agent });
    titleEl.appendText(` ${run.task}`);

    body.createDiv({ cls: "af-tl-desc", text: truncate(run.output, 100) });

    const meta = body.createDiv({ cls: "af-tl-meta" });
    const metaTime = meta.createSpan();
    createIcon(metaTime, "clock", "af-meta-icon");
    metaTime.appendText(` ${this.formatStarted(run.started)} \u00B7 ${this.formatDuration(run.durationSeconds)}`);
    if (run.tokensUsed) {
      const metaTokens = meta.createSpan();
      createIcon(metaTokens, "zap", "af-meta-icon");
      metaTokens.appendText(` ${run.tokensUsed.toLocaleString()} tokens`);
    }

    item.onclick = () => this.openSlideover(run);
  }

  private renderFleetStatusPanel(
    container: HTMLElement,
    snapshot: { agents: AgentConfig[]; tasks: TaskConfig[] },
  ): void {
    const section = container.createDiv({ cls: "af-section-card" });
    const header = section.createDiv({ cls: "af-section-header" });
    const titleEl = header.createDiv({ cls: "af-section-title" });
    createIcon(titleEl, "bot");
    titleEl.appendText(" Fleet Status");

    const headerActions = header.createDiv({ cls: "af-section-actions" });
    const newAgentBtn = headerActions.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(newAgentBtn, "plus", "af-btn-icon");
    newAgentBtn.appendText(" New Agent");
    newAgentBtn.onclick = () => void this.plugin.createAgentTemplate();

    const list = section.createDiv({ cls: "af-agent-mini-list" });

    if (snapshot.agents.length === 0) {
      this.renderEmptyState(list, "bot", "No agents yet", "Create your first agent to get started");
      return;
    }

    for (const agent of snapshot.agents) {
      this.renderAgentMini(list, agent, snapshot.tasks);
    }

    // Quick run section
    const enabledAgents = snapshot.agents.filter((a) => a.enabled);
    if (enabledAgents.length > 0) {
      const quickRun = section.createDiv({ cls: "af-quick-run" });
      const quickLabel = quickRun.createDiv({ cls: "af-quick-run-label" });
      createIcon(quickLabel, "zap", "af-meta-icon");
      quickLabel.appendText(" Quick Run");
      const row = quickRun.createDiv({ cls: "af-quick-run-row" });

      const select = row.createEl("select", { cls: "af-select" });
      for (const agent of enabledAgents) {
        select.createEl("option", { text: agent.name, attr: { value: agent.name } });
      }

      const runBtn = row.createEl("button", { cls: "af-btn-sm primary" });
      createIcon(runBtn, "play", "af-btn-icon");
      runBtn.appendText(" Run");
      runBtn.onclick = () => void this.plugin.runAgentPrompt(select.value);
    }
  }

  private renderAgentMini(
    container: HTMLElement,
    agent: AgentConfig,
    tasks: TaskConfig[],
  ): void {
    const state = this.plugin.runtime.getAgentState(agent.name);
    const agentTasks = tasks.filter((t) => t.agent === agent.name);
    const statusClass = this.healthToClass(state.status);

    const item = container.createDiv({ cls: "af-agent-mini" });

    const avatar = item.createDiv({ cls: `af-agent-avatar ${statusClass}` });
    if (agent.avatar?.trim()) {
      this.renderAgentAvatar(avatar, agent);
    } else {
      avatar.setText(this.getInitials(agent.name));
    }

    const info = item.createDiv({ cls: "af-agent-info" });
    info.createDiv({ cls: "af-agent-name", text: agent.name });

    let desc = "";
    if (state.status === "running") {
      desc = `Running now \u00B7 ${agentTasks.length} task${agentTasks.length !== 1 ? "s" : ""}`;
    } else if (!agent.enabled) {
      desc = `Disabled \u00B7 ${agentTasks.length} task${agentTasks.length !== 1 ? "s" : ""} paused`;
    } else {
      const nextRun = agentTasks.map((t) => t.nextRun).filter(Boolean).sort()[0];
      desc = nextRun
        ? `Next: ${this.formatNextRun(nextRun)} \u00B7 ${agentTasks.length} task${agentTasks.length !== 1 ? "s" : ""}`
        : `${agentTasks.length} task${agentTasks.length !== 1 ? "s" : ""}`;
    }
    info.createDiv({ cls: "af-agent-desc", text: desc });

    item.createDiv({ cls: `af-agent-status-dot ${statusClass}` });

    item.onclick = () => this.navigate("agent-detail", agent.name);
  }

  // ═══════════════════════════════════════════════════════
  //  Agents Page
  // ═══════════════════════════════════════════════════════

  private renderAgentsPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-agents-page" });
    const snapshot = this.plugin.runtime.getSnapshot();

    const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
    toolbar.createDiv({ cls: "af-page-title", text: "Agents" });
    toolbar.createDiv({ cls: "af-toolbar-spacer" });

    const newBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(newBtn, "plus", "af-btn-icon");
    newBtn.appendText(" New Agent");
    newBtn.onclick = () => void this.plugin.createAgentTemplate();

    const grid = page.createDiv({ cls: "af-agents-grid" });

    if (snapshot.agents.length === 0) {
      this.renderEmptyState(grid, "bot", "No agents configured", "Create your first agent to get started");
      return;
    }

    for (const agent of snapshot.agents) {
      this.renderAgentCard(grid, agent, snapshot);
    }
  }

  private renderAgentCard(
    container: HTMLElement,
    agent: AgentConfig,
    snapshot: { tasks: TaskConfig[]; skills: SkillConfig[] },
  ): void {
    const state = this.plugin.runtime.getAgentState(agent.name);
    const agentRuns = this.plugin.runtime.getRecentRuns().filter((r) => r.agent === agent.name);

    const card = container.createDiv({ cls: `af-agent-card${agent.enabled ? "" : " disabled"}` });

    // Header
    const header = card.createDiv({ cls: "af-agent-card-header" });
    const avatarCls = agent.enabled ? this.healthToClass(state.status) : "disabled";
    const avatar = header.createDiv({ cls: `af-agent-card-avatar ${avatarCls}` });
    this.renderAgentAvatar(avatar, agent);

    const titleBlock = header.createDiv({ cls: "af-agent-card-titleblock" });
    const nameRow = titleBlock.createDiv({ cls: "af-agent-card-name" });
    nameRow.appendText(agent.name);
    if (agent.heartbeatEnabled && agent.heartbeatSchedule) {
      const hbIcon = nameRow.createSpan({ cls: "af-heartbeat-indicator" });
      setIcon(hbIcon, "heart-pulse");
      hbIcon.title = `Heartbeat: ${agent.heartbeatSchedule}`;
    }
    titleBlock.createDiv({ cls: "af-agent-card-desc", text: agent.description ?? "No description" });

    const toggle = header.createDiv({ cls: `af-agent-card-toggle${agent.enabled ? " on" : ""}` });
    toggle.onclick = (e) => {
      e.stopPropagation();
      void this.plugin.toggleAgent(agent.name, !agent.enabled);
    };

    // Stats
    const stats = card.createDiv({ cls: "af-agent-card-stats" });
    const totalRuns = agentRuns.length;
    const successRuns = agentRuns.filter((r) => r.status === "success").length;
    const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;
    const avgTime =
      totalRuns > 0
        ? Math.round(agentRuns.reduce((s, r) => s + r.durationSeconds, 0) / totalRuns)
        : 0;
    const totalTokens = agentRuns.reduce((s, r) => s + (r.tokensUsed ?? 0), 0);

    this.renderAgentStat(stats, String(totalRuns), "Runs");
    this.renderAgentStat(stats, `${successRate}%`, "Success");
    this.renderAgentStat(stats, `${avgTime}s`, "Avg Time");
    this.renderAgentStat(stats, formatTokenCount(totalTokens), "Tokens");

    // Skills
    if (agent.skills.length > 0) {
      const skillsRow = card.createDiv({ cls: "af-agent-card-skills" });
      for (const skill of agent.skills) {
        skillsRow.createSpan({ cls: "af-skill-tag", text: skill });
      }
    }

    // Footer
    const footer = card.createDiv({ cls: "af-agent-card-footer" });
    const metaParts: string[] = [`Model: ${agent.model}`];
    if (agent.approvalRequired.length > 0) {
      metaParts.push(`Approval: ${agent.approvalRequired.join(", ")}`);
    }
    if (agent.memory) metaParts.push("Memory: on");
    if (!agent.enabled) metaParts.unshift("Disabled");
    footer.createSpan({ cls: "af-agent-card-meta", text: metaParts.join(" \u00B7 ") });

    const actions = footer.createDiv({ cls: "af-agent-card-actions" });

    if (!agent.enabled) {
      const enableBtn = actions.createEl("button", { cls: "af-btn-sm", text: "Enable" });
      enableBtn.onclick = (e) => {
        e.stopPropagation();
        void this.plugin.toggleAgent(agent.name, true);
      };
    }

    const editBtn = actions.createEl("button", { cls: "af-btn-sm" });
    createIcon(editBtn, "edit", "af-btn-icon");
    editBtn.appendText(" Edit");
    editBtn.onclick = (e) => {
      e.stopPropagation();
      this.navigate("edit-agent", agent.name);
    };

    if (agent.enabled) {
      const runBtn = actions.createEl("button", { cls: "af-btn-sm primary" });
      createIcon(runBtn, "play", "af-btn-icon");
      runBtn.appendText(" Run");
      runBtn.onclick = (e) => {
        e.stopPropagation();
        void this.plugin.runAgentPrompt(agent.name);
      };
    }

    card.onclick = () => this.navigate("agent-detail", agent.name);
  }

  private renderAgentStat(container: HTMLElement, value: string, label: string): void {
    const stat = container.createDiv({ cls: "af-agent-stat" });
    stat.createSpan({ cls: "af-agent-stat-value", text: value });
    stat.createSpan({ cls: "af-agent-stat-label", text: label });
  }

  // ═══════════════════════════════════════════════════════
  //  Agent Detail Page
  // ═══════════════════════════════════════════════════════

  private renderAgentDetailPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-agent-detail-page" });
    const agentName = this.detailContext;
    if (!agentName) {
      this.renderEmptyState(page, "bot", "No agent selected", "Select an agent from the list");
      return;
    }

    const agent = this.plugin.runtime.getSnapshot().agents.find((a) => a.name === agentName);
    if (!agent) {
      this.renderEmptyState(page, "bot", "Agent not found", `Agent "${agentName}" was not found`);
      return;
    }

    const state = this.plugin.runtime.getAgentState(agent.name);
    const agentRuns = this.plugin.runtime.getRecentRuns().filter((r) => r.agent === agent.name);

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatar = headerLeft.createDiv({
      cls: `af-agent-card-avatar ${this.healthToClass(state.status)}`,
    });
    this.renderAgentAvatar(avatar, agent);
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: agent.name });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: agent.description ?? "No description" });

    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

    // Chat — primary action
    const chatBtn = headerActions.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(chatBtn, "message-circle", "af-btn-icon");
    chatBtn.appendText(" Chat");
    chatBtn.onclick = () => this.openChatSlideover(agent);

    // Run Now / Enable — secondary
    if (agent.enabled) {
      const runBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
      createIcon(runBtn, "play", "af-btn-icon");
      runBtn.appendText(" Run Now");
      runBtn.onclick = () => void this.plugin.runAgentPrompt(agent.name);

      const pauseBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
      createIcon(pauseBtn, "pause", "af-btn-icon");
      pauseBtn.appendText(" Disable");
      pauseBtn.onclick = () => void this.plugin.toggleAgent(agent.name, false);
    } else {
      const enableBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
      createIcon(enableBtn, "play", "af-btn-icon");
      enableBtn.appendText(" Enable");
      enableBtn.onclick = () => void this.plugin.toggleAgent(agent.name, true);
    }

    const detailEditBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
    createIcon(detailEditBtn, "edit", "af-btn-icon");
    detailEditBtn.appendText(" Edit");
    detailEditBtn.onclick = () => this.navigate("edit-agent", agent.name);

    const deleteBtn = headerActions.createEl("button", { cls: "af-btn-sm danger" });
    createIcon(deleteBtn, "trash-2", "af-btn-icon");
    deleteBtn.appendText(" Delete");
    deleteBtn.onclick = () => void this.plugin.deleteAgent(agent.name);

    // Tabs
    const tabs = page.createDiv({ cls: "af-detail-tabs" });
    const tabDefs = [
      { id: "overview", label: "Overview", icon: "layout-dashboard" },
      { id: "config", label: "Config", icon: "settings" },
      { id: "runs", label: "Runs", icon: "scroll-text" },
      { id: "memory", label: "Memory", icon: "file-text" },
    ];
    for (const t of tabDefs) {
      const tabBtn = tabs.createEl("button", {
        cls: `af-detail-tab${this.agentDetailTab === t.id ? " active" : ""}`,
      });
      createIcon(tabBtn, t.icon, "af-tab-icon");
      tabBtn.appendText(` ${t.label}`);
      tabBtn.onclick = () => {
        this.agentDetailTab = t.id;
        void this.render();
      };
    }

    const tabContent = page.createDiv({ cls: "af-detail-tab-content" });
    switch (this.agentDetailTab) {
      case "overview":
        this.renderAgentOverviewTab(tabContent, agent, agentRuns);
        break;
      case "config":
        this.renderAgentConfigTab(tabContent, agent);
        break;
      case "runs":
        this.renderAgentRunsTab(tabContent, agentRuns);
        break;
      case "memory":
        void this.renderAgentMemoryTab(tabContent, agent);
        break;
    }
  }

  private renderAgentOverviewTab(container: HTMLElement, agent: AgentConfig, runs: RunLogData[]): void {
    // Stats row
    const statsRow = container.createDiv({ cls: "af-dash-grid" });
    const totalRuns = runs.length;
    const successRuns = runs.filter((r) => r.status === "success").length;
    const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;
    const avgTime = totalRuns > 0 ? Math.round(runs.reduce((s, r) => s + r.durationSeconds, 0) / totalRuns) : 0;
    const totalTokens = runs.reduce((s, r) => s + (r.tokensUsed ?? 0), 0);
    const totalCostAgent = runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const costSuffixAgent = totalCostAgent > 0 ? ` \u00B7 $${totalCostAgent.toFixed(2)}` : "";

    this.renderStatCard(statsRow, "Total Runs", String(totalRuns), "", "activity", "all time");
    this.renderStatCard(statsRow, "Success Rate", `${successRate}%`, "", "check-circle-2", `${successRuns}/${totalRuns}`);
    this.renderStatCard(statsRow, "Avg Time", `${avgTime}s`, "", "clock", "per run");
    this.renderStatCard(statsRow, "Total Tokens", formatTokenCount(totalTokens), "", "zap", `all time${costSuffixAgent}`);

    // Heartbeat — compact status only (instruction shown in Config tab)
    if (agent.isFolder && (agent.heartbeatBody.trim() || agent.heartbeatEnabled)) {
      const hbSection = container.createDiv({ cls: "af-section-card" });
      const hbHeader = hbSection.createDiv({ cls: "af-section-header" });
      const hbTitle = hbHeader.createDiv({ cls: "af-section-title" });
      createIcon(hbTitle, "heart-pulse");
      hbTitle.appendText(" Heartbeat");

      const hbActions = hbHeader.createDiv({ cls: "af-detail-header-actions" });
      const hbToggle = hbActions.createDiv({ cls: `af-agent-card-toggle${agent.heartbeatEnabled ? " on" : ""}` });
      hbToggle.onclick = async () => {
        const isOn = hbToggle.hasClass("on");
        await this.plugin.repository.updateHeartbeat(agent.name, { enabled: !isOn });
        await this.plugin.refreshFromVault();
        new Notice(`Heartbeat ${!isOn ? "enabled" : "paused"} for ${agent.name}`);
      };

      const hbBody = hbSection.createDiv({ cls: "af-config-form" });
      this.renderConfigRow(hbBody, "Schedule", cronToHuman(agent.heartbeatSchedule));
      const nextRun = this.plugin.runtime.getNextHeartbeat(agent.name);
      if (nextRun && agent.heartbeatEnabled) {
        this.renderConfigRow(hbBody, "Next run", this.timeUntil(nextRun));
      }
      if (agent.heartbeatChannel) {
        this.renderConfigRow(hbBody, "Channel", agent.heartbeatChannel);
      }
    }

    // Skills
    if (agent.skills.length > 0) {
      const skillsSection = container.createDiv({ cls: "af-section-card" });
      const skillsHeader = skillsSection.createDiv({ cls: "af-section-header" });
      const skillsTitle = skillsHeader.createDiv({ cls: "af-section-title" });
      createIcon(skillsTitle, "puzzle");
      skillsTitle.appendText(" Skills");
      const skillsBody = skillsSection.createDiv({ cls: "af-detail-skills-list" });
      for (const skill of agent.skills) {
        skillsBody.createSpan({ cls: "af-skill-tag", text: skill });
      }
    }

    // MCP Servers
    const agentMcpServers = agent.mcpServers ?? [];
    if (agentMcpServers.length > 0) {
      const mcpSection = container.createDiv({ cls: "af-section-card" });
      const mcpHeader = mcpSection.createDiv({ cls: "af-section-header" });
      const mcpTitle = mcpHeader.createDiv({ cls: "af-section-title" });
      createIcon(mcpTitle, "plug");
      mcpTitle.appendText(" MCP Servers");
      const mcpBody = mcpSection.createDiv({ cls: "af-mcp-overview-list" });

      const cachedServers = this.plugin.repository.getMcpServers();
      for (const serverName of agentMcpServers) {
        const serverInfo = cachedServers.find((s) => s.name === serverName);
        const row = mcpBody.createDiv({ cls: "af-mcp-overview-row" });
        const dot = row.createSpan({
          cls: `af-mcp-status-dot ${serverInfo ? (serverInfo.enabled ? serverInfo.status : "disabled") : "disconnected"}`,
        });
        dot.title = serverInfo ? (serverInfo.enabled ? serverInfo.status : "disabled") : "unknown";
        row.createSpan({ cls: "af-mcp-overview-name", text: serverName });
        const toolCount = serverInfo?.toolDetails.length ?? serverInfo?.tools.length ?? 0;
        if (toolCount > 0) {
          row.createSpan({ cls: "af-mcp-overview-tools", text: `${toolCount} tools` });
        } else if (serverInfo && !serverInfo.enabled) {
          row.createSpan({ cls: "af-mcp-overview-tools af-muted", text: "disabled" });
        } else if (serverInfo?.status === "needs-auth") {
          row.createSpan({ cls: "af-mcp-overview-tools af-muted", text: "needs auth" });
        }
      }
    }

    // Permissions
    const hasPermRules = agent.permissionRules.allow.length > 0 || agent.permissionRules.deny.length > 0;
    if (hasPermRules || (agent.permissionMode && agent.permissionMode !== "default")) {
      const permSection = container.createDiv({ cls: "af-section-card" });
      const permHeader = permSection.createDiv({ cls: "af-section-header" });
      const permTitle = permHeader.createDiv({ cls: "af-section-title" });
      createIcon(permTitle, "shield-check");
      permTitle.appendText(" Permissions");
      const permBody = permSection.createDiv({ cls: "af-config-form" });
      this.renderConfigRow(permBody, "Mode", agent.permissionMode || "default");
      if (agent.permissionRules.allow.length > 0) {
        this.renderConfigRow(permBody, "Allowed", agent.permissionRules.allow.join(", "));
      }
      if (agent.permissionRules.deny.length > 0) {
        this.renderConfigRow(permBody, "Denied", agent.permissionRules.deny.join(", "));
      }
    }

    // Recent runs
    const runsSection = container.createDiv({ cls: "af-section-card" });
    const runsHeader = runsSection.createDiv({ cls: "af-section-header" });
    const runsTitle = runsHeader.createDiv({ cls: "af-section-title" });
    createIcon(runsTitle, "scroll-text");
    runsTitle.appendText(" Recent Runs");
    const runsBody = runsSection.createDiv({ cls: "af-timeline" });

    if (runs.length === 0) {
      this.renderEmptyState(runsBody, "scroll-text", "No runs yet", "");
    } else {
      for (const run of runs.slice(0, 5)) {
        this.renderTimelineItem(runsBody, run);
      }
    }
  }

  private renderAgentConfigTab(container: HTMLElement, agent: AgentConfig): void {
    const form = container.createDiv({ cls: "af-config-form" });

    this.renderConfigRow(form, "Name", agent.name);
    this.renderConfigRow(form, "Description", agent.description ?? "");
    this.renderConfigRow(form, "Model", agent.model);
    this.renderConfigRow(form, "Timeout", `${agent.timeout}s`);
    this.renderConfigRow(form, "Working Directory", agent.cwd ?? "(vault root)");
    this.renderConfigRow(form, "Permission Mode", agent.permissionMode || "default");
    this.renderConfigRow(form, "Approval Required", agent.approvalRequired.join(", ") || "none");
    if (agent.permissionRules.allow.length > 0) {
      this.renderConfigRow(form, "Allowed Commands", agent.permissionRules.allow.join(", "));
    }
    if (agent.permissionRules.deny.length > 0) {
      this.renderConfigRow(form, "Blocked Commands", agent.permissionRules.deny.join(", "));
    }
    this.renderConfigRow(form, "Memory", agent.memory ? "Enabled" : "Disabled");
    this.renderConfigRow(
      form,
      "Auto-compact",
      agent.autoCompactThreshold && agent.autoCompactThreshold > 0
        ? `at ${agent.autoCompactThreshold}% context`
        : "disabled",
    );
    if (agent.wikiReferences && agent.wikiReferences.length > 0) {
      this.renderConfigRow(
        form,
        "Wiki access",
        agent.wikiReferences.map((r) => r.agent).join(", "),
      );
    }
    this.renderConfigRow(form, "Tags", agent.tags.join(", ") || "none");

    const promptSection = form.createDiv({ cls: "af-config-prompt-section" });
    promptSection.createDiv({ cls: "af-slideover-section-title", text: "SYSTEM PROMPT" });
    promptSection.createDiv({ cls: "af-output-block", text: agent.body || "(empty)" });

    if (agent.heartbeatBody.trim()) {
      const hbPromptSection = form.createDiv({ cls: "af-config-prompt-section" });
      hbPromptSection.createDiv({ cls: "af-slideover-section-title", text: "HEARTBEAT INSTRUCTION" });
      hbPromptSection.createDiv({ cls: "af-output-block", text: agent.heartbeatBody });
    }

    const actions = form.createDiv({ cls: "af-slideover-actions" });
    const editBtn = actions.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(editBtn, "edit", "af-btn-icon");
    editBtn.appendText(" Edit Agent");
    editBtn.onclick = () => this.navigate("edit-agent", agent.name);
  }

  private renderConfigRow(container: HTMLElement, label: string, value: string): void {
    const row = container.createDiv({ cls: "af-detail-row" });
    row.createSpan({ cls: "af-detail-label", text: label });
    row.createSpan({ cls: "af-detail-value af-mono", text: value });
  }

  private renderAgentRunsTab(container: HTMLElement, runs: RunLogData[]): void {
    if (runs.length === 0) {
      this.renderEmptyState(container, "scroll-text", "No runs yet", "Run this agent to see history");
      return;
    }

    for (const run of runs) {
      const item = container.createDiv({ cls: "af-run-list-item" });

      const statusIcon = item.createDiv({ cls: `af-tl-icon ${this.statusToTimelineClass(run.status)}` });
      setIcon(statusIcon, this.statusToIconName(run.status));

      const body = item.createDiv({ cls: "af-tl-body" });
      const titleRow = body.createDiv({ cls: "af-tl-title" });
      titleRow.createSpan({ text: run.task });
      titleRow.createSpan({ cls: `af-status-badge ${this.statusToBadgeClass(run.status)}`, text: this.statusToBadgeText(run.status) });

      const meta = body.createDiv({ cls: "af-tl-meta" });
      meta.createSpan({ text: `${this.formatStarted(run.started)} \u00B7 ${this.formatDuration(run.durationSeconds)}` });
      if (run.tokensUsed) {
        meta.createSpan({ text: `${run.tokensUsed.toLocaleString()} tokens` });
      }

      body.createDiv({ cls: "af-tl-desc", text: truncate(run.output, 120) });

      item.onclick = () => this.openSlideover(run);
    }
  }

  private async renderAgentMemoryTab(container: HTMLElement, agent: AgentConfig): Promise<void> {
    if (!agent.memory) {
      this.renderEmptyState(container, "file-text", "Memory disabled", "Enable memory in agent config");
      return;
    }

    const wm = await this.plugin.repository.readWorkingMemory(agent.name);

    // Header: token usage vs budget + reflection status.
    const meta = container.createDiv({ cls: "af-form-help" });
    const used = wm?.tokenEstimate ?? 0;
    const reflectBits = agent.reflection.enabled
      ? `reflection on (${agent.reflection.schedule})`
      : "reflection off";
    meta.setText(`~${used} / ${agent.memoryTokenBudget} tokens · ${reflectBits}`);

    if (!wm || wm.sections.length === 0) {
      this.renderEmptyState(container, "file-text", "No memories yet", "Agent will learn from runs");
    } else {
      const block = container.createDiv({ cls: "af-output-block" });
      block.setText(renderSections(wm.sections));
    }

    const actions = container.createDiv({ cls: "af-slideover-actions" });

    const reflectBtn = actions.createEl("button", { cls: "af-btn-sm" });
    createIcon(reflectBtn, "moon", "af-btn-icon");
    reflectBtn.appendText(" Reflect now");
    reflectBtn.onclick = async () => {
      reflectBtn.disabled = true;
      reflectBtn.setText(" Reflecting…");
      const res = await this.plugin.runtime.runReflectionNow(agent.name);
      new Notice(`Agent Fleet: ${res.message}`);
      await this.renderAgentMemoryTab((container.empty(), container), agent);
    };

    const editBtn = actions.createEl("button", { cls: "af-btn-sm" });
    createIcon(editBtn, "external-link", "af-btn-icon");
    editBtn.appendText(" Open in Editor");
    editBtn.onclick = () =>
      void this.plugin.openPath(this.plugin.repository.getWorkingMemoryPath(agent.name));
  }

  private timeAgo(date: Date): string {
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  private timeUntil(date: Date): string {
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    if (seconds < 60) return "< 1m";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.round(hours / 24);
    return `in ${days}d`;
  }

  // ═══════════════════════════════════════════════════════
  //  Kanban Page
  // ═══════════════════════════════════════════════════════

  private renderKanbanPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-kanban-page" });
    const snapshot = this.plugin.runtime.getSnapshot();
    const runs = this.plugin.runtime.getRecentRuns();

    const toolbar = page.createDiv({ cls: "af-kanban-toolbar" });
    toolbar.createDiv({ cls: "af-page-title", text: "Tasks Board" });
    toolbar.createDiv({ cls: "af-toolbar-spacer" });

    const newTaskBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(newTaskBtn, "plus", "af-btn-icon");
    newTaskBtn.appendText(" New Task");
    newTaskBtn.onclick = () => this.navigate("create-task");

    const board = page.createDiv({ cls: "af-kanban-board" });

    // Categorize
    const backlog: TaskConfig[] = [];
    const scheduled: TaskConfig[] = [];
    const runningTasks: TaskConfig[] = [];
    const completed: RunLogData[] = [];
    const failed: RunLogData[] = [];

    // Build set of task IDs currently running (not just agent names)
    const runningTaskIds = new Set<string>();
    for (const agent of snapshot.agents) {
      const state = this.plugin.runtime.getAgentState(agent.name);
      if (state.status === "running" && state.currentTaskId) {
        runningTaskIds.add(state.currentTaskId);
      }
    }

    const today = this.toLocalDateStr(new Date());

    // Collect today's runs first (needed to filter tasks)
    for (const run of runs) {
      if (run.status === "success" && this.runToLocalDate(run.started) === today) {
        completed.push(run);
      } else if (
        (run.status === "failure" || run.status === "timeout" || run.status === "cancelled") &&
        this.runToLocalDate(run.started) === today
      ) {
        failed.push(run);
      }
    }

    // Tasks that completed or failed today (by task ID)
    const completedTaskIds = new Set(completed.map((r) => r.task));
    const failedTaskIds = new Set(failed.map((r) => r.task));

    for (const task of snapshot.tasks) {
      const ranToday = completedTaskIds.has(task.taskId) || failedTaskIds.has(task.taskId)
        || (task.lastRun && this.runToLocalDate(task.lastRun) === today);

      if (runningTaskIds.has(task.taskId)) {
        runningTasks.push(task);
      } else if (ranToday && !task.schedule) {
        // One-shot task ran today — skip from backlog, shown via run cards in Done/Failed
        continue;
      } else if (task.schedule && task.enabled) {
        scheduled.push(task);
      } else {
        backlog.push(task);
      }
    }

    // Columns with drag-and-drop
    this.renderKanbanColumn(board, "Backlog", "inbox", backlog.length, (body) => {
      for (const task of backlog) {
        this.renderKanbanTaskCard(body, task, snapshot, true);
      }
    }, "backlog");

    this.renderKanbanColumn(board, "Scheduled", "clock", scheduled.length, (body) => {
      for (const task of scheduled) {
        this.renderKanbanTaskCard(body, task, snapshot, true);
      }
    }, "scheduled");

    this.renderKanbanColumn(board, "Running", "loader-2", runningTasks.length, (body) => {
      for (const task of runningTasks) {
        this.renderKanbanRunningCard(body, task);
      }
    }, "running", false, "running");

    this.renderKanbanColumn(board, "Done", "check-circle-2", completed.length, (body) => {
      for (const run of completed.slice(0, 10)) {
        this.renderKanbanCompletedCard(body, run);
      }
    }, "completed");

    this.renderKanbanColumn(board, "Failed", "x-circle", failed.length, (body) => {
      for (const run of failed) {
        this.renderKanbanFailedCard(body, run);
      }
    }, "failed", false, "failed");
  }

  private renderKanbanColumn(
    container: HTMLElement,
    title: string,
    iconName: string,
    count: number,
    renderBody: (body: HTMLElement) => void,
    columnId: string,
    showAddBtn = false,
    variant?: string,
  ): void {
    const col = container.createDiv({
      cls: `af-kanban-column${variant ? ` af-kanban-${variant}` : ""}`,
    });

    // Set up drop target for backlog and scheduled columns
    if (columnId === "backlog" || columnId === "scheduled") {
      makeDropTarget(col, (taskId) => this.handleTaskDrop(taskId, columnId));
    }

    const header = col.createDiv({ cls: "af-kanban-col-header" });
    const titleEl = header.createDiv({ cls: "af-kanban-col-title" });
    createIcon(titleEl, iconName);
    titleEl.appendText(` ${title} `);
    titleEl.createSpan({ cls: "af-kanban-col-count", text: String(count) });

    const body = col.createDiv({ cls: "af-kanban-col-body" });
    renderBody(body);

    if (count === 0) {
      body.createDiv({ cls: "af-kanban-empty", text: "No items" });
    }

    if (showAddBtn) {
      const addSection = col.createDiv({ cls: "af-kanban-col-add" });
      const addBtn = addSection.createEl("button");
      createIcon(addBtn, "plus", "af-btn-icon");
      addBtn.appendText(" Add task");
      addBtn.onclick = () => { this.navigate("create-task"); };
    }
  }

  private handleTaskDrop(taskId: string, columnId: string): void {
    const task = this.plugin.runtime.getSnapshot().tasks.find((t) => t.taskId === taskId);
    if (!task) return;

    if (columnId === "backlog") {
      void this.setTaskEnabled(task, false).then(() => {
        new Notice(`Task "${taskId}" moved to backlog (disabled)`);
      });
    } else if (columnId === "scheduled") {
      if (!task.schedule && !task.runAt) {
        new Notice(`Task "${taskId}" needs a schedule. Open task details to set one.`);
        this.navigate("task-detail", taskId);
        return;
      }
      void this.setTaskEnabled(task, true).then(() => {
        new Notice(`Task "${taskId}" moved to scheduled (enabled)`);
      });
    }
  }

  private async setTaskEnabled(task: TaskConfig, enabled: boolean): Promise<void> {
    const file = this.plugin.app.vault.getAbstractFileByPath(task.filePath);
    if (!file || !(file instanceof TFile)) return;

    const content = await this.plugin.app.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    frontmatter.enabled = enabled;
    await this.plugin.app.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, body));
    await this.plugin.refreshFromVault();
  }

  private renderKanbanTaskCard(
    container: HTMLElement,
    task: TaskConfig,
    snapshot: { agents: AgentConfig[] },
    draggable: boolean,
  ): void {
    const card = container.createDiv({ cls: `af-kanban-card af-priority-${task.priority}` });

    if (draggable) {
      makeDraggable(card, task.taskId);
      const gripEl = card.createDiv({ cls: "af-kanban-card-grip" });
      setIcon(gripEl, "grip-vertical");
    }

    // Title row with task name + active indicator
    const titleRow = card.createDiv({ cls: "af-kanban-card-header" });
    titleRow.createDiv({ cls: "af-kanban-card-title", text: task.taskId });
    const agent = snapshot.agents.find((a) => a.name === task.agent);
    const isActive = (agent?.enabled ?? false) && task.enabled;
    const statusDot = titleRow.createSpan({
      cls: `af-kanban-card-status ${isActive ? "active" : "inactive"}`,
    });
    statusDot.title = isActive ? "Active" : "Inactive";

    // Agent row with icon + name
    const agentRow = card.createDiv({ cls: "af-kanban-card-agent" });
    const agentIconEl = agentRow.createSpan({ cls: "af-kanban-card-agent-icon" });
    setIcon(agentIconEl, "bot");
    agentRow.createSpan({ cls: "af-kanban-card-agent-name", text: task.agent });

    // Footer with schedule info
    const footer = card.createDiv({ cls: "af-kanban-card-footer" });
    const scheduleEl = footer.createSpan({ cls: "af-kanban-card-schedule" });
    if (!isActive) {
      createIcon(scheduleEl, "pause", "af-meta-icon");
      scheduleEl.appendText(" Paused");
    } else if (task.schedule) {
      createIcon(scheduleEl, "refresh-cw", "af-meta-icon");
      scheduleEl.appendText(` ${this.humanizeCron(task.schedule)}`);
    } else {
      scheduleEl.appendText(task.runAt ?? "Manual");
    }

    card.onclick = () => this.navigate("task-detail", task.taskId);
  }

  private renderKanbanRunningCard(container: HTMLElement, task: TaskConfig): void {
    const card = container.createDiv({ cls: "af-kanban-card af-kanban-card-running" });
    card.createDiv({ cls: "af-kanban-card-title", text: task.taskId });

    const agentRow = card.createDiv({ cls: "af-kanban-card-agent" });
    const agentIconEl = agentRow.createSpan({ cls: "af-kanban-card-agent-icon" });
    setIcon(agentIconEl, "bot");
    agentRow.createSpan({ cls: "af-kanban-card-agent-name", text: task.agent });

    // Progress bar tied to agent timeout
    const agent = this.plugin.runtime.getSnapshot().agents.find((a) => a.name === task.agent);
    const timeout = agent?.timeout ?? 300;
    const state = this.plugin.runtime.getAgentState(task.agent);
    const startTime = state.runStarted ? new Date(state.runStarted).getTime() : Date.now();

    const progress = card.createDiv({ cls: "af-kanban-progress" });
    const track = progress.createDiv({ cls: "af-kanban-progress-track" });
    const bar = track.createDiv({ cls: "af-kanban-progress-bar af-kanban-progress-bar-real" });

    const elapsed = (Date.now() - startTime) / 1000;
    const pct = Math.min(95, (elapsed / timeout) * 100); // Cap at 95% until actually done
    bar.setCssStyles({ width: `${pct}%` });

    const footer = card.createDiv({ cls: "af-kanban-card-footer" });
    const scheduleEl = footer.createSpan({ cls: "af-kanban-card-schedule" });
    createIcon(scheduleEl, "loader-2", "af-meta-icon");
    const elapsedSec = Math.round(elapsed);
    scheduleEl.appendText(` ${elapsedSec}s / ${timeout}s`);

    // Stop button
    const stopBtn = footer.createEl("button", { cls: "af-kanban-stop-btn" });
    setIcon(stopBtn, "square");
    stopBtn.title = "Stop task";
    stopBtn.onclick = (e) => {
      e.stopPropagation();
      this.plugin.runtime.abortAgentRun(task.agent);
      new Notice(`Stopped task "${task.taskId}"`);
    };

    // Live update every second
    const interval = window.setInterval(() => {
      const now = (Date.now() - startTime) / 1000;
      const newPct = Math.min(95, (now / timeout) * 100);
      bar.setCssStyles({ width: `${newPct}%` });
      const nowSec = Math.round(now);
      scheduleEl.textContent = "";
      setIcon(scheduleEl, "loader-2");
      scheduleEl.appendText(` ${nowSec}s / ${timeout}s`);
    }, 1000);
    this.streamingUnsubscribes.push(() => window.clearInterval(interval));
  }

  private renderKanbanCompletedCard(container: HTMLElement, run: RunLogData): void {
    const card = container.createDiv({ cls: "af-kanban-card" });
    card.createDiv({ cls: "af-kanban-card-title", text: run.task });

    const agentRow = card.createDiv({ cls: "af-kanban-card-agent" });
    const agentIconEl = agentRow.createSpan({ cls: "af-kanban-card-agent-icon" });
    setIcon(agentIconEl, "bot");
    agentRow.createSpan({ cls: "af-kanban-card-agent-name", text: run.agent });

    const footer = card.createDiv({ cls: "af-kanban-card-footer" });
    const scheduleEl = footer.createSpan({ cls: "af-kanban-card-schedule" });
    createIcon(scheduleEl, "check-circle-2", "af-meta-icon");
    scheduleEl.appendText(
      ` ${this.formatStarted(run.started)} \u00B7 ${this.formatDuration(run.durationSeconds)}`,
    );

    card.onclick = () => this.openSlideover(run);
  }

  private renderKanbanFailedCard(container: HTMLElement, run: RunLogData): void {
    const isCancelled = run.status === "cancelled";
    const card = container.createDiv({ cls: `af-kanban-card ${isCancelled ? "af-kanban-card-cancelled" : "af-kanban-card-failed"}` });
    card.createDiv({ cls: "af-kanban-card-title", text: run.task });

    const agentRow = card.createDiv({ cls: "af-kanban-card-agent" });
    const agentIconEl = agentRow.createSpan({ cls: "af-kanban-card-agent-icon" });
    setIcon(agentIconEl, "bot");
    agentRow.createSpan({ cls: "af-kanban-card-agent-name", text: run.agent });

    const errorText = isCancelled
      ? `Stopped after ${run.durationSeconds}s`
      : run.status === "timeout"
        ? `Timeout after ${run.durationSeconds}s`
        : truncate(run.output, 60);
    const errorDiv = card.createDiv({ cls: "af-kanban-card-error" });
    createIcon(errorDiv, isCancelled ? "square" : "alert-triangle", "af-meta-icon");
    errorDiv.appendText(` ${errorText}`);

    const footer = card.createDiv({ cls: "af-kanban-card-footer" });
    const scheduleEl = footer.createSpan({ cls: "af-kanban-card-schedule" });
    createIcon(scheduleEl, isCancelled ? "square" : "x-circle", "af-meta-icon");
    scheduleEl.appendText(` ${this.formatStarted(run.started)}`);

    if (!isCancelled) {
      const retryBtn = footer.createEl("button", { cls: "af-btn-sm" });
      createIcon(retryBtn, "refresh-cw", "af-btn-icon");
      retryBtn.appendText(" Retry");
      retryBtn.onclick = (e) => {
        e.stopPropagation();
        void this.plugin.runAgentPrompt(run.agent);
      };
    }

    card.onclick = () => this.openSlideover(run);
  }

  // ═══════════════════════════════════════════════════════
  //  Runs Page
  // ═══════════════════════════════════════════════════════

  private renderRunsPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-runs-page" });
    const runs = this.plugin.runtime.getRecentRuns();

    const toolbar = page.createDiv({ cls: "af-runs-toolbar" });
    toolbar.createDiv({ cls: "af-page-title", text: "Run History" });
    toolbar.createDiv({ cls: "af-toolbar-spacer" });

    const tableWrap = page.createDiv({ cls: "af-runs-table" });

    if (runs.length === 0) {
      this.renderEmptyState(tableWrap, "scroll-text", "No runs yet", "Run an agent to see history here");
      return;
    }

    const table = tableWrap.createEl("table");
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    for (const col of ["Status", "Agent", "Task", "Started", "Duration", "Tokens", "Model"]) {
      headerRow.createEl("th", { text: col });
    }

    const tbody = table.createEl("tbody");
    for (const run of runs.slice(0, 50)) {
      this.renderRunRow(tbody, run);
    }
  }

  private renderRunRow(tbody: HTMLElement, run: RunLogData): void {
    const row = tbody.createEl("tr");

    const statusTd = row.createEl("td");
    const badge = statusTd.createSpan({
      cls: `af-status-badge ${this.statusToBadgeClass(run.status)}`,
    });
    const badgeIcon = badge.createSpan();
    setIcon(badgeIcon, this.statusToIconName(run.status));
    badge.appendText(` ${this.statusToBadgeText(run.status)}`);

    const agentTd = row.createEl("td", { cls: "af-agent-link" });
    agentTd.setText(run.agent);
    agentTd.onclick = (e) => {
      e.stopPropagation();
      this.navigate("agent-detail", run.agent);
    };

    row.createEl("td", { text: run.task });
    row.createEl("td", { cls: "af-mono", text: this.formatStarted(run.started) });
    row.createEl("td", { cls: "af-mono", text: this.formatDuration(run.durationSeconds) });
    row.createEl("td", {
      cls: "af-mono",
      text: run.tokensUsed ? run.tokensUsed.toLocaleString() : "\u2014",
    });
    row.createEl("td", { cls: "af-mono", text: run.model });

    row.setCssStyles({ cursor: "pointer" });
    row.onclick = () => this.openSlideover(run);
  }

  // ═══════════════════════════════════════════════════════
  //  Skills Page
  // ═══════════════════════════════════════════════════════

  private renderSkillsPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-skills-page" });
    const snapshot = this.plugin.runtime.getSnapshot();

    const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
    toolbar.createDiv({ cls: "af-page-title", text: "Skills Library" });
    toolbar.createDiv({ cls: "af-toolbar-spacer" });

    const newBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(newBtn, "plus", "af-btn-icon");
    newBtn.appendText(" New Skill");
    newBtn.onclick = () => void this.plugin.createSkillTemplate();

    const grid = page.createDiv({ cls: "af-skills-grid" });

    if (snapshot.skills.length === 0) {
      this.renderEmptyState(grid, "puzzle", "No skills yet", "Create skills to give agents specialized abilities");
      return;
    }

    for (const skill of snapshot.skills) {
      this.renderSkillCard(grid, skill, snapshot.agents);
    }
  }

  private renderSkillCard(container: HTMLElement, skill: SkillConfig, agents: AgentConfig[]): void {
    const card = container.createDiv({ cls: "af-skill-card" });

    const cardHeader = card.createDiv({ cls: "af-skill-card-header" });
    const iconEl = cardHeader.createDiv({ cls: "af-skill-card-icon" });
    setIcon(iconEl, this.getSkillIcon(skill.name));

    const skillEditBtn = cardHeader.createEl("button", { cls: "af-btn-sm af-btn-xs" });
    createIcon(skillEditBtn, "edit", "af-btn-icon");
    skillEditBtn.onclick = (e) => {
      e.stopPropagation();
      this.navigate("edit-skill", skill.name);
    };

    card.createDiv({ cls: "af-skill-card-name", text: skill.name });
    card.createDiv({ cls: "af-skill-card-desc", text: skill.description ?? "No description" });

    const usedBy = agents.filter((a) => a.skills.includes(skill.name));
    if (usedBy.length > 0) {
      const agentsRow = card.createDiv({ cls: "af-skill-card-agents" });
      for (const agent of usedBy) {
        agentsRow.createSpan({ cls: "af-skill-card-agent-tag", text: agent.name });
      }
    }

    // No card-level click — skills have no detail page. Editing is via the edit button.
  }

  // ═══════════════════════════════════════════════════════
  //  Channels Page
  // ═══════════════════════════════════════════════════════

  private renderChannelsPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-agents-page" });
    const snapshot = this.plugin.runtime.getSnapshot();

    const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
    toolbar.createDiv({ cls: "af-page-title", text: "Channels" });
    toolbar.createDiv({ cls: "af-toolbar-spacer" });

    const newBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(newBtn, "plus", "af-btn-icon");
    newBtn.appendText(" New Channel");
    newBtn.onclick = () => this.navigate("create-channel");

    const grid = page.createDiv({ cls: "af-agents-grid" });

    if (snapshot.channels.length === 0) {
      this.renderEmptyState(
        grid,
        "radio",
        "No channels configured",
        "Connect an agent to Slack or another chat platform",
      );
      return;
    }

    for (const channel of snapshot.channels) {
      this.renderChannelCard(grid, channel, snapshot.validationIssues);
    }
  }

  /**
   * Wiki Keepers page: lists every Wiki Keeper instance with the latest
   * lint report parsed from its scope's `log.md`. "Needs review" items
   * render as cards with a Dismiss button (in-memory only — re-parse on
   * navigation gives the user a fresh view of the most recent lint pass).
   */
  private async renderWikiKeepersPage(container: HTMLElement): Promise<void> {
    const page = container.createDiv({ cls: "af-agents-page" });
    const snapshot = this.plugin.runtime.getSnapshot();

    const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
    toolbar.createDiv({ cls: "af-page-title", text: "Wiki Keepers" });
    toolbar.createDiv({ cls: "af-toolbar-spacer" });

    const keepers = snapshot.agents.filter(
      (a): a is AgentConfig & { wikiKeeper: NonNullable<AgentConfig["wikiKeeper"]> } =>
        a.wikiKeeper !== undefined,
    );

    if (keepers.length === 0) {
      this.renderEmptyState(
        page,
        "library",
        "No Wiki Keepers yet",
        "Open Settings → Agent Fleet → Wiki Keepers → + Add to create one.",
      );
      return;
    }

    const list = page.createDiv({ cls: "af-wk-list" });
    list.setCssStyles({ display: "flex" });
    list.setCssStyles({ flexDirection: "column" });
    list.setCssStyles({ gap: "16px" });

    for (const keeper of keepers) {
      await this.renderWikiKeeperCard(list, keeper);
    }
  }

  private async renderWikiKeeperCard(
    container: HTMLElement,
    agent: AgentConfig & { wikiKeeper: NonNullable<AgentConfig["wikiKeeper"]> },
  ): Promise<void> {
    const wk = agent.wikiKeeper;
    const card = container.createDiv({ cls: "af-card" });
    card.setCssStyles({ padding: "16px" });
    card.setCssStyles({ border: "1px solid var(--background-modifier-border)" });
    card.setCssStyles({ borderRadius: "8px" });

    const header = card.createDiv();
    header.setCssStyles({ display: "flex" });
    header.setCssStyles({ alignItems: "center" });
    header.setCssStyles({ gap: "12px" });
    header.setCssStyles({ marginBottom: "12px" });
    const titleWrap = header.createDiv();
    titleWrap.setCssStyles({ flex: "1" });
    titleWrap.createEl("strong", { text: agent.name });
    const scopeLabel = wk.scopeRoot || "(whole vault)";
    titleWrap.createEl("div", {
      text: `Scope: ${scopeLabel} · topics: ${wk.topicsRoot}/ · log: ${wk.logPath}`,
      cls: "af-form-hint",
    });

    const openBtn = header.createEl("button", { cls: "af-btn-sm" });
    openBtn.appendText("Open log");
    openBtn.onclick = () => {
      const logFullPath = wk.scopeRoot ? `${wk.scopeRoot}/${wk.logPath}` : wk.logPath;
      const file = this.plugin.app.vault.getAbstractFileByPath(logFullPath);
      if (file instanceof TFile) {
        void this.plugin.app.workspace.getLeaf().openFile(file);
      } else {
        new Notice(`Log file not found: ${logFullPath}`);
      }
    };

    // Read and parse log.md
    const logFullPath = wk.scopeRoot ? `${wk.scopeRoot}/${wk.logPath}` : wk.logPath;
    const logFile = this.plugin.app.vault.getAbstractFileByPath(logFullPath);
    let report: ReturnType<typeof parseLatestLintReport> = null;
    if (logFile instanceof TFile) {
      try {
        const content = await this.plugin.app.vault.cachedRead(logFile);
        report = parseLatestLintReport(content);
      } catch {
        report = null;
      }
    }

    if (!report) {
      const empty = card.createDiv({ cls: "af-form-hint" });
      empty.setText(
        "No lint report yet. Run wiki-lint manually or wait for the weekly task to fire.",
      );
      return;
    }

    // Latest lint header
    const reportHeader = card.createDiv();
    reportHeader.setCssStyles({ display: "flex" });
    reportHeader.setCssStyles({ alignItems: "baseline" });
    reportHeader.setCssStyles({ gap: "12px" });
    reportHeader.setCssStyles({ marginBottom: "8px" });
    reportHeader.createEl("strong", { text: `Lint ${report.date}` });
    reportHeader.createSpan({
      cls: "af-form-hint",
      text: `${report.summary.length} summary lines · ${report.autoApplied.length} auto-applied · ${report.needsReview.length} needs review`,
    });

    // Summary bullets (read-only)
    if (report.summary.length > 0) {
      const sumDetails = card.createEl("details");
      sumDetails.createEl("summary", { text: "Summary" });
      const sumList = sumDetails.createEl("ul");
      sumList.setCssStyles({ marginTop: "4px" });
      for (const item of report.summary) {
        sumList.createEl("li", { text: item });
      }
    }

    if (report.autoApplied.length > 0) {
      const autoDetails = card.createEl("details");
      autoDetails.createEl("summary", { text: `Auto-applied (${report.autoApplied.length})` });
      const autoList = autoDetails.createEl("ul");
      autoList.setCssStyles({ marginTop: "4px" });
      for (const item of report.autoApplied) {
        autoList.createEl("li", { text: item });
      }
    }

    if (report.refreshChained.length > 0) {
      const refDetails = card.createEl("details");
      refDetails.createEl("summary", {
        text: `Refresh chained (${report.refreshChained.length})`,
      });
      const refList = refDetails.createEl("ul");
      refList.setCssStyles({ marginTop: "4px" });
      for (const item of report.refreshChained) {
        refList.createEl("li", { text: item });
      }
    }

    // Needs review queue — the actionable bit
    const reviewWrap = card.createDiv();
    reviewWrap.setCssStyles({ marginTop: "12px" });
    reviewWrap.createEl("strong", { text: `Needs review (${report.needsReview.length})` });

    if (report.needsReview.length === 0) {
      reviewWrap.createDiv({
        cls: "af-form-hint",
        text: "All clear. Nothing requires manual review from this lint pass.",
      });
      return;
    }

    const reviewList = reviewWrap.createDiv();
    reviewList.setCssStyles({ display: "flex" });
    reviewList.setCssStyles({ flexDirection: "column" });
    reviewList.setCssStyles({ gap: "6px" });
    reviewList.setCssStyles({ marginTop: "8px" });

    for (const item of report.needsReview) {
      const row = reviewList.createDiv();
      row.setCssStyles({ display: "flex" });
      row.setCssStyles({ alignItems: "flex-start" });
      row.setCssStyles({ gap: "8px" });
      row.setCssStyles({ padding: "8px 10px" });
      row.setCssStyles({ background: "var(--background-secondary)" });
      row.setCssStyles({ borderRadius: "4px" });
      row.setCssStyles({ fontSize: "13px" });

      const text = row.createDiv();
      text.setCssStyles({ flex: "1" });
      text.setText(item);

      const dismissBtn = row.createEl("button", { cls: "af-btn-sm", text: "Dismiss" });
      dismissBtn.title =
        "Hide this item from the dashboard until the next lint pass (does not modify log.md).";
      dismissBtn.onclick = () => {
        row.remove();
      };
    }
  }

  private renderChannelCard(
    container: HTMLElement,
    channel: ChannelConfig,
    validationIssues: Array<{ path: string; message: string }>,
  ): void {
    const status = this.plugin.channelManager?.getChannelStatus(channel.name) ?? "disabled";
    const avatarCls = channelStatusToAvatarClass(status);
    const cardCls = channel.enabled && status !== "disabled" ? "af-agent-card" : "af-agent-card disabled";

    const card = container.createDiv({ cls: cardCls });
    card.setCssStyles({ cursor: "default" }); // No card-level click — channels have no detail page

    // Header — avatar (icon + status color) + name/agent + type pill
    const header = card.createDiv({ cls: "af-agent-card-header" });
    const avatar = header.createDiv({ cls: `af-agent-card-avatar ${avatarCls}` });
    setIcon(avatar, "radio");

    const titleBlock = header.createDiv({ cls: "af-agent-card-titleblock" });
    titleBlock.createDiv({ cls: "af-agent-card-name", text: channel.name });
    titleBlock.createDiv({
      cls: "af-agent-card-desc",
      text: `Default: ${channel.defaultAgent}`,
    });

    const statusPill = header.createSpan({ cls: `af-pill ${channelStatusPillColor(status)}` });
    statusPill.createSpan({ cls: "af-dot" });
    statusPill.appendText(` ${status}`);

    // Agents — show all allowed agents as tags (same style as skill tags on agent cards)
    if (channel.allowedAgents.length > 0) {
      const agentsRow = card.createDiv({ cls: "af-agent-card-skills" });
      for (const name of channel.allowedAgents) {
        const tag = agentsRow.createSpan({ cls: "af-skill-tag", text: name });
        if (name === channel.defaultAgent) {
          tag.setCssStyles({ fontWeight: "700" });
        }
      }
    }

    // Stats — sessions, messages in/out, allowlist
    const stats = card.createDiv({ cls: "af-agent-card-stats" });
    const sessionCount = this.plugin.channelManager?.getSessionCount(channel.name) ?? 0;
    const metrics = this.plugin.channelManager?.getMetrics(channel.name);
    const agentCount = channel.allowedAgents.length > 0
      ? String(channel.allowedAgents.length)
      : "all";

    this.renderAgentStat(stats, agentCount, "Agents");
    this.renderAgentStat(stats, String(sessionCount), "Sessions");
    this.renderAgentStat(stats, String(metrics?.messagesReceived ?? 0), "In");
    this.renderAgentStat(stats, String(metrics?.messagesSent ?? 0), "Out");

    // Footer — meta text + edit action
    const footer = card.createDiv({ cls: "af-agent-card-footer" });
    const metaParts: string[] = [channel.type];
    if (!channel.enabled) metaParts.push("disabled");
    if (channel.allowedUsers.length > 0) metaParts.push(`${channel.allowedUsers.length} user(s)`);
    else metaParts.push("allowlist empty");
    footer.createSpan({ cls: "af-agent-card-meta", text: metaParts.join(" \u00B7 ") });

    const actions = footer.createDiv({ cls: "af-agent-card-actions" });
    const editBtn = actions.createEl("button", { cls: "af-btn-sm" });
    createIcon(editBtn, "edit", "af-btn-icon");
    editBtn.appendText(" Edit");
    editBtn.onclick = (e) => {
      e.stopPropagation();
      this.navigate("edit-channel", channel.name);
    };

    // Validation issues — red-tinted block below the footer
    const issues = validationIssues.filter((i) => i.path === channel.filePath);
    if (issues.length > 0) {
      const issuesBox = card.createDiv({ cls: "af-channel-issues" });
      for (const issue of issues) {
        issuesBox.createDiv({ cls: "af-channel-issue-row", text: issue.message });
      }
    }

    // No card-level click — channels have no detail page. Editing is via the edit button.
  }

  // ═══════════════════════════════════════════════════════
  //  Create Channel Page
  // ═══════════════════════════════════════════════════════

  private renderCreateChannelPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    const snapshot = this.plugin.runtime.getSnapshot();
    const credentials = this.plugin.channelCredentials.list();

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(avatar, "plus");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: "Create New Channel" });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Connect an external chat transport to an agent" });
    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

    // Form state
    const state = {
      name: "",
      type: "slack",
      defaultAgent: snapshot.agents[0]?.name ?? "",
      allowedAgents: [] as string[],
      credentialRef: credentials[0]?.ref ?? "",
      allowedUsers: "",
      perUserSessions: true,
      channelContext: "",
      enabled: true,
      tags: "",
      body: "",
      transportJson: "",
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Channel Details ───
    const detailsSection = form.createDiv({ cls: "af-create-section" });
    const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
    const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(detailsIcon, "radio");
    detailsHeader.createSpan({ text: "Channel Details" });

    this.createFormField(detailsSection, "Name", "my-slack", "Unique identifier for this channel", (v) => { state.name = v; });

    // Type dropdown — only Slack is supported in v1; others shown as disabled
    const typeRow = detailsSection.createDiv({ cls: "af-form-row" });
    typeRow.createDiv({ cls: "af-form-label", text: "Type" });
    const typeSelect = typeRow.createEl("select", { cls: "af-form-select" });
    typeSelect.createEl("option", { text: "slack", attr: { value: "slack" } });
    typeSelect.createEl("option", { text: "telegram", attr: { value: "telegram" } });
    typeSelect.addEventListener("change", () => { state.type = typeSelect.value; });

    // Credential dropdown
    const credRow = detailsSection.createDiv({ cls: "af-form-row" });
    const credLabel = credRow.createDiv({ cls: "af-form-label" });
    credLabel.setText("Credential");
    this.addTooltip(credLabel, "Configured in Settings → Agent Fleet → Channel Credentials");
    const credSelect = credRow.createEl("select", { cls: "af-form-select" });
    if (credentials.length === 0) {
      credSelect.createEl("option", { text: "(no credentials configured)", attr: { value: "" } });
    }
    for (const c of credentials) {
      credSelect.createEl("option", { text: `${c.ref} (${c.entry.type})`, attr: { value: c.ref } });
    }
    credSelect.addEventListener("change", () => { state.credentialRef = credSelect.value; });

    // Enabled toggle
    const enabledRow = detailsSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
    const enabledToggle = enabledRow.createDiv({ cls: "af-agent-card-toggle on" });
    enabledToggle.onclick = () => {
      const isOn = enabledToggle.hasClass("on");
      enabledToggle.toggleClass("on", !isOn);
      state.enabled = !isOn;
    };

    // ─── Agent Routing ───
    const agentSection = form.createDiv({ cls: "af-create-section" });
    const agentHeader = agentSection.createDiv({ cls: "af-create-section-header" });
    const agentIcon = agentHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(agentIcon, "bot");
    agentHeader.createSpan({ text: "Agent Routing" });

    // Default agent dropdown
    const defaultRow = agentSection.createDiv({ cls: "af-form-row" });
    const defaultLabel = defaultRow.createDiv({ cls: "af-form-label" });
    defaultLabel.setText("Default agent");
    this.addTooltip(defaultLabel, "Used when no @agent-name prefix is given in a message");
    const defaultSelect = defaultRow.createEl("select", { cls: "af-form-select" });
    for (const a of snapshot.agents) {
      defaultSelect.createEl("option", { text: a.name, attr: { value: a.name } });
    }
    defaultSelect.addEventListener("change", () => { state.defaultAgent = defaultSelect.value; });

    // Allowed agents checkboxes
    const allowedRow = agentSection.createDiv({ cls: "af-form-row" });
    const allowedLabel = allowedRow.createDiv({ cls: "af-form-label" });
    allowedLabel.setText("Allowed agents");
    this.addTooltip(allowedLabel, "Agents reachable via @prefix. Leave unchecked to allow all agents.");
    const checkboxContainer = allowedRow.createDiv({ cls: "af-form-checkboxes" });
    for (const a of snapshot.agents) {
      const label = checkboxContainer.createEl("label", { cls: "af-form-checkbox-label" });
      const cb = label.createEl("input", { attr: { type: "checkbox", value: a.name } });
      label.appendText(` ${a.name}`);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          if (!state.allowedAgents.includes(a.name)) state.allowedAgents.push(a.name);
        } else {
          state.allowedAgents = state.allowedAgents.filter((n) => n !== a.name);
        }
      });
    }

    // Per-user sessions toggle
    const perUserRow = agentSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    const perUserLabel = perUserRow.createDiv({ cls: "af-form-label" });
    perUserLabel.setText("Per-user sessions");
    this.addTooltip(perUserLabel, "Each external user gets their own isolated Claude session");
    const perUserToggle = perUserRow.createDiv({ cls: "af-agent-card-toggle on" });
    perUserToggle.onclick = () => {
      const isOn = perUserToggle.hasClass("on");
      perUserToggle.toggleClass("on", !isOn);
      state.perUserSessions = !isOn;
    };

    // ─── Access Control ───
    const accessSection = form.createDiv({ cls: "af-create-section" });
    const accessHeader = accessSection.createDiv({ cls: "af-create-section-header" });
    const accessIcon = accessHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(accessIcon, "shield-check");
    accessHeader.createSpan({ text: "Access Control" });

    const usersLabel = accessSection.createDiv({ cls: "af-form-label" });
    usersLabel.setText("Allowed users");
    this.addTooltip(usersLabel, "Slack user IDs (U...), one per line. Only listed users can reach the bot.");
    const usersTextarea = accessSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "U0AQW6P37N1\nU0BXYZ12345", rows: "4" },
    });
    usersTextarea.addEventListener("input", () => { state.allowedUsers = usersTextarea.value; });

    // ─── Channel Context ───
    const contextSection = form.createDiv({ cls: "af-create-section" });
    const contextHeader = contextSection.createDiv({ cls: "af-create-section-header" });
    const contextIcon = contextHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(contextIcon, "message-square");
    const contextHeaderLabel = contextHeader.createSpan({ text: "Channel Context" });
    this.addTooltip(contextHeaderLabel, "Extra instructions appended to the agent's system prompt when reached through this channel");
    const contextTextarea = contextSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "You are being contacted via Slack. Keep replies concise...", rows: "6" },
    });
    contextTextarea.addEventListener("input", () => { state.channelContext = contextTextarea.value; });

    this.createFormField(detailsSection, "Tags", "ops, internal", "Comma-separated metadata", (v) => { state.tags = v; });

    // ─── Advanced ───
    const advSection = form.createDiv({ cls: "af-create-section" });
    const advHeader = advSection.createDiv({ cls: "af-create-section-header" });
    const advIcon = advHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(advIcon, "settings");
    const advHeaderLabel = advHeader.createSpan({ text: "Advanced" });
    this.addTooltip(advHeaderLabel, "Markdown body (shown in the channel detail page) and transport-specific overrides");

    const bodyLabel = advSection.createDiv({ cls: "af-form-label" });
    bodyLabel.setText("Body (markdown)");
    this.addTooltip(bodyLabel, "Free-form notes for this channel. Shown in the channel detail page; not sent to the agent.");
    const bodyTextarea = advSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "Notes, runbook snippets, escalation contacts…", rows: "4" },
    });
    bodyTextarea.addEventListener("input", () => { state.body = bodyTextarea.value; });

    const transportLabel = advSection.createDiv({ cls: "af-form-label" });
    transportLabel.setText("Transport config (JSON)");
    this.addTooltip(transportLabel, "Optional JSON object for transport-specific overrides (e.g. Slack socket_mode, telegram webhook settings). Leave blank for defaults.");
    const transportTextarea = advSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: '{\n  "socket_mode": true\n}', rows: "4" },
    });
    transportTextarea.addEventListener("input", () => { state.transportJson = transportTextarea.value; });

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });
    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("channels");

    const createBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(createBtn, "plus", "af-btn-icon");
    createBtn.appendText(" Create Channel");
    createBtn.onclick = async () => {
      const name = state.name.trim();
      if (!name) { new Notice("Channel name is required."); return; }
      if (!state.credentialRef) { new Notice("Select a credential."); return; }

      let transport: Record<string, unknown> | undefined;
      if (state.transportJson.trim()) {
        try {
          const parsed: unknown = JSON.parse(state.transportJson);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            transport = parsed as Record<string, unknown>;
          } else {
            new Notice("Transport config must be a JSON object.");
            return;
          }
        } catch (err) {
          new Notice(`Transport JSON is invalid: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      }

      const parseUsers = (s: string) => s.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      const frontmatter: Record<string, unknown> = {
        name: slugify(name),
        type: state.type,
        default_agent: state.defaultAgent,
        allowed_agents: state.allowedAgents.length > 0 ? state.allowedAgents : undefined,
        enabled: state.enabled,
        credential_ref: state.credentialRef,
        allowed_users: parseUsers(state.allowedUsers),
        per_user_sessions: state.perUserSessions,
        channel_context: state.channelContext.trim() || undefined,
        tags: parseTags(state.tags).length > 0 ? parseTags(state.tags) : undefined,
        transport,
      };

      try {
        const channelSlug = slugify(name);
        const path = await this.plugin.repository.getAvailablePath(
          this.plugin.repository.getSubfolder("channels"),
          channelSlug,
        );
        await this.plugin.app.vault.create(
          path,
          stringifyMarkdownWithFrontmatter(frontmatter, state.body.trim()),
        );
        new Notice(`Channel "${channelSlug}" created.`);
        await this.plugin.refreshFromVault();
        this.navigate("edit-channel", channelSlug);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to create channel: ${msg}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Edit Channel Page
  // ═══════════════════════════════════════════════════════

  private renderEditChannelPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    const channelName = this.detailContext;
    if (!channelName) {
      this.renderEmptyState(page, "radio", "No channel selected", "");
      return;
    }

    const channel = this.plugin.runtime.getSnapshot().channels.find((c) => c.name === channelName);
    if (!channel) {
      this.renderEmptyState(page, "radio", "Channel not found", `Channel "${channelName}" was not found`);
      return;
    }

    const snapshot = this.plugin.runtime.getSnapshot();
    const credentials = this.plugin.channelCredentials.list();
    const status = this.plugin.channelManager?.getChannelStatus(channel.name) ?? "disabled";

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatarEl = headerLeft.createDiv({ cls: `af-agent-card-avatar ${channelStatusToAvatarClass(status)}` });
    setIcon(avatarEl, "radio");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: `Edit Channel: ${channel.name}` });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: `Status: ${status}` });
    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

    // Form state pre-filled
    const state = {
      type: channel.type,
      defaultAgent: channel.defaultAgent,
      allowedAgents: [...channel.allowedAgents],
      credentialRef: channel.credentialRef,
      allowedUsers: channel.allowedUsers.join("\n"),
      perUserSessions: channel.perUserSessions,
      channelContext: channel.channelContext,
      enabled: channel.enabled,
      tags: channel.tags.join(", "),
      body: channel.body,
      transportJson: Object.keys(channel.transport).length > 0
        ? JSON.stringify(channel.transport, null, 2)
        : "",
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Channel Details ───
    const detailsSection = form.createDiv({ cls: "af-create-section" });
    const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
    const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(detailsIcon, "radio");
    detailsHeader.createSpan({ text: "Channel Details" });

    // Name (read-only)
    const nameRow = detailsSection.createDiv({ cls: "af-form-row" });
    nameRow.createDiv({ cls: "af-form-label", text: "Name" });
    const nameInput = nameRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", value: channel.name, disabled: "true" },
    });
    nameInput.setCssStyles({ opacity: "0.6" });

    // Type dropdown — only Slack is supported in v1; others shown as disabled
    const typeRow = detailsSection.createDiv({ cls: "af-form-row" });
    typeRow.createDiv({ cls: "af-form-label", text: "Type" });
    const typeSelect = typeRow.createEl("select", { cls: "af-form-select" });
    for (const t of ["slack", "telegram"] as const) {
      const opt = typeSelect.createEl("option", { text: t, attr: { value: t } });
      if (t === channel.type) opt.selected = true;
    }
    typeSelect.addEventListener("change", () => { state.type = typeSelect.value as ChannelConfig["type"]; });

    // Credential dropdown
    const credRow = detailsSection.createDiv({ cls: "af-form-row" });
    const credLabel = credRow.createDiv({ cls: "af-form-label" });
    credLabel.setText("Credential");
    this.addTooltip(credLabel, "Configured in Settings → Agent Fleet → Channel Credentials");
    const credSelect = credRow.createEl("select", { cls: "af-form-select" });
    if (credentials.length === 0) {
      credSelect.createEl("option", { text: "(no credentials configured)", attr: { value: "" } });
    }
    for (const c of credentials) {
      const opt = credSelect.createEl("option", { text: `${c.ref} (${c.entry.type})`, attr: { value: c.ref } });
      if (c.ref === channel.credentialRef) opt.selected = true;
    }
    credSelect.addEventListener("change", () => { state.credentialRef = credSelect.value; });

    // Enabled toggle
    const enabledRow = detailsSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
    const enabledToggle = enabledRow.createDiv({ cls: `af-agent-card-toggle${channel.enabled ? " on" : ""}` });
    enabledToggle.onclick = () => {
      const isOn = enabledToggle.hasClass("on");
      enabledToggle.toggleClass("on", !isOn);
      state.enabled = !isOn;
    };

    // ─── Agent Routing ───
    const agentSection = form.createDiv({ cls: "af-create-section" });
    const agentHeader = agentSection.createDiv({ cls: "af-create-section-header" });
    const agentIcon = agentHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(agentIcon, "bot");
    agentHeader.createSpan({ text: "Agent Routing" });

    // Default agent dropdown
    const defaultRow = agentSection.createDiv({ cls: "af-form-row" });
    const defaultLabel = defaultRow.createDiv({ cls: "af-form-label" });
    defaultLabel.setText("Default agent");
    this.addTooltip(defaultLabel, "Used when no @agent-name prefix is given in a message");
    const defaultSelect = defaultRow.createEl("select", { cls: "af-form-select" });
    for (const a of snapshot.agents) {
      const opt = defaultSelect.createEl("option", { text: a.name, attr: { value: a.name } });
      if (a.name === channel.defaultAgent) opt.selected = true;
    }
    defaultSelect.addEventListener("change", () => { state.defaultAgent = defaultSelect.value; });

    // Allowed agents checkboxes
    const allowedRow = agentSection.createDiv({ cls: "af-form-row" });
    const allowedLabelEl = allowedRow.createDiv({ cls: "af-form-label" });
    allowedLabelEl.setText("Allowed agents");
    this.addTooltip(allowedLabelEl, "Agents reachable via @prefix. Leave unchecked to allow all agents.");
    const checkboxContainer = allowedRow.createDiv({ cls: "af-form-checkboxes" });
    for (const a of snapshot.agents) {
      const label = checkboxContainer.createEl("label", { cls: "af-form-checkbox-label" });
      const cb = label.createEl("input", { attr: { type: "checkbox", value: a.name } });
      if (channel.allowedAgents.includes(a.name)) cb.checked = true;
      label.appendText(` ${a.name}`);
      cb.addEventListener("change", () => {
        if (cb.checked) {
          if (!state.allowedAgents.includes(a.name)) state.allowedAgents.push(a.name);
        } else {
          state.allowedAgents = state.allowedAgents.filter((n) => n !== a.name);
        }
      });
    }

    // Per-user sessions toggle
    const perUserRow = agentSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    const perUserLabel = perUserRow.createDiv({ cls: "af-form-label" });
    perUserLabel.setText("Per-user sessions");
    this.addTooltip(perUserLabel, "Each external user gets their own isolated Claude session");
    const perUserToggle = perUserRow.createDiv({ cls: `af-agent-card-toggle${channel.perUserSessions ? " on" : ""}` });
    perUserToggle.onclick = () => {
      const isOn = perUserToggle.hasClass("on");
      perUserToggle.toggleClass("on", !isOn);
      state.perUserSessions = !isOn;
    };

    // ─── Access Control ───
    const accessSection = form.createDiv({ cls: "af-create-section" });
    const accessHeader = accessSection.createDiv({ cls: "af-create-section-header" });
    const accessIconEl = accessHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(accessIconEl, "shield-check");
    accessHeader.createSpan({ text: "Access Control" });

    const usersLabelEl = accessSection.createDiv({ cls: "af-form-label" });
    usersLabelEl.setText("Allowed users");
    this.addTooltip(usersLabelEl, "Slack user IDs (U...), one per line. Only listed users can reach the bot.");
    const usersTextarea = accessSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "U0AQW6P37N1\nU0BXYZ12345", rows: "4" },
    });
    usersTextarea.value = channel.allowedUsers.join("\n");
    usersTextarea.addEventListener("input", () => { state.allowedUsers = usersTextarea.value; });

    // ─── Channel Context ───
    const contextSection = form.createDiv({ cls: "af-create-section" });
    const contextHeader = contextSection.createDiv({ cls: "af-create-section-header" });
    const contextIconEl = contextHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(contextIconEl, "message-square");
    const contextHeaderLabel = contextHeader.createSpan({ text: "Channel Context" });
    this.addTooltip(contextHeaderLabel, "Extra instructions appended to the agent's system prompt when reached through this channel");
    const contextTextarea = contextSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "You are being contacted via Slack. Keep replies concise...", rows: "6" },
    });
    contextTextarea.value = channel.channelContext;
    contextTextarea.addEventListener("input", () => { state.channelContext = contextTextarea.value; });

    this.createFormField(detailsSection, "Tags", "ops, internal", "Comma-separated metadata", (v) => { state.tags = v; }, channel.tags.join(", "));

    // ─── Advanced ───
    const editAdvSection = form.createDiv({ cls: "af-create-section" });
    const editAdvHeader = editAdvSection.createDiv({ cls: "af-create-section-header" });
    const editAdvIcon = editAdvHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(editAdvIcon, "settings");
    const editAdvHeaderLabel = editAdvHeader.createSpan({ text: "Advanced" });
    this.addTooltip(editAdvHeaderLabel, "Markdown body (shown in the channel detail page) and transport-specific overrides");

    const editBodyLabel = editAdvSection.createDiv({ cls: "af-form-label" });
    editBodyLabel.setText("Body (markdown)");
    const editBodyTextarea = editAdvSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "Notes, runbook snippets, escalation contacts…", rows: "4" },
    });
    editBodyTextarea.value = channel.body;
    editBodyTextarea.addEventListener("input", () => { state.body = editBodyTextarea.value; });

    const editTransportLabel = editAdvSection.createDiv({ cls: "af-form-label" });
    editTransportLabel.setText("Transport config (JSON)");
    this.addTooltip(editTransportLabel, "Optional JSON object for transport-specific overrides (e.g. Slack socket_mode). Leave blank for defaults.");
    const editTransportTextarea = editAdvSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: '{\n  "socket_mode": true\n}', rows: "4" },
    });
    editTransportTextarea.value = state.transportJson;
    editTransportTextarea.addEventListener("input", () => { state.transportJson = editTransportTextarea.value; });

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });

    const deleteBtn = footer.createEl("button", { cls: "af-btn-sm danger" });
    createIcon(deleteBtn, "trash-2", "af-btn-icon");
    deleteBtn.appendText(" Delete");
    deleteBtn.onclick = async () => {
      await this.plugin.repository.deleteChannel(channel.name);
      new Notice(`Channel "${channel.name}" deleted.`);
      await new Promise((r) => window.setTimeout(r, 200));
      await this.plugin.refreshFromVault();
      this.navigate("channels");
    };

    footer.createDiv({ cls: "af-toolbar-spacer" });

    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("channels");

    const saveBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(saveBtn, "check", "af-btn-icon");
    saveBtn.appendText(" Save Changes");
    saveBtn.onclick = async () => {
      const parseUsers = (s: string) => s.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      let transport: Record<string, unknown> | undefined;
      if (state.transportJson.trim()) {
        try {
          const parsed: unknown = JSON.parse(state.transportJson);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            transport = parsed as Record<string, unknown>;
          } else {
            new Notice("Transport config must be a JSON object.");
            return;
          }
        } catch (err) {
          new Notice(`Transport JSON is invalid: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      } else {
        transport = {};
      }
      try {
        await this.plugin.repository.updateChannel(channel.name, {
          type: state.type,
          default_agent: state.defaultAgent,
          allowed_agents: state.allowedAgents.length > 0 ? state.allowedAgents : [],
          enabled: state.enabled,
          credential_ref: state.credentialRef,
          allowed_users: parseUsers(state.allowedUsers),
          per_user_sessions: state.perUserSessions,
          channel_context: state.channelContext.trim(),
          tags: parseTags(state.tags),
          body: state.body.trim(),
          transport,
        });
        new Notice(`Channel "${channel.name}" updated.`);
        await this.plugin.refreshFromVault();
        this.navigate("channels");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to update channel: ${msg}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Approvals Page
  // ═══════════════════════════════════════════════════════

  private renderApprovalsPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-approvals-page" });
    const runs = this.plugin.runtime.getRecentRuns();

    const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
    toolbar.createDiv({ cls: "af-page-title", text: "Approvals" });
    toolbar.createDiv({ cls: "af-toolbar-spacer" });

    // Pending approvals
    const pendingRuns = runs.filter((r) =>
      (r.approvals ?? []).some((a) => a.status === "pending"),
    );

    if (pendingRuns.length > 0) {
      const pendingSection = page.createDiv({ cls: "af-section-card" });
      const pendingHeader = pendingSection.createDiv({ cls: "af-section-header" });
      const pendingTitle = pendingHeader.createDiv({ cls: "af-section-title" });
      createIcon(pendingTitle, "alert-triangle");
      pendingTitle.appendText(` Pending (${pendingRuns.length})`);

      const pendingBody = pendingSection.createDiv({ cls: "af-approvals-list" });
      for (const run of pendingRuns) {
        this.renderApprovalItem(pendingBody, run, true);
      }
    } else {
      const emptySection = page.createDiv({ cls: "af-section-card" });
      this.renderEmptyState(emptySection, "shield-check", "No pending approvals", "All clear!");
    }

    // Resolved approvals history
    const resolvedRuns = runs.filter((r) =>
      (r.approvals ?? []).some((a) => a.status !== "pending"),
    );

    if (resolvedRuns.length > 0) {
      const resolvedSection = page.createDiv({ cls: "af-section-card" });
      const resolvedHeader = resolvedSection.createDiv({ cls: "af-section-header" });
      const resolvedTitle = resolvedHeader.createDiv({ cls: "af-section-title" });
      createIcon(resolvedTitle, "check-circle-2");
      resolvedTitle.appendText(" History");

      const resolvedBody = resolvedSection.createDiv({ cls: "af-approvals-list" });
      for (const run of resolvedRuns.slice(0, 20)) {
        this.renderApprovalItem(resolvedBody, run, false);
      }
    }
  }

  private renderApprovalItem(container: HTMLElement, run: RunLogData, showActions: boolean): void {
    for (const approval of run.approvals ?? []) {
      if (showActions && approval.status !== "pending") continue;
      if (!showActions && approval.status === "pending") continue;

      const item = container.createDiv({ cls: "af-approval-item" });

      const iconEl = item.createDiv({ cls: "af-approval-item-icon" });
      if (approval.status === "pending") {
        setIcon(iconEl, "shield-check");
        iconEl.addClass("pending");
      } else if (approval.status === "approved") {
        setIcon(iconEl, "check-circle-2");
        iconEl.addClass("approved");
      } else {
        setIcon(iconEl, "x-circle");
        iconEl.addClass("rejected");
      }

      const body = item.createDiv({ cls: "af-approval-item-body" });
      body.createDiv({
        cls: "af-approval-item-title",
        text: `${run.agent} \u2192 ${approval.tool}`,
      });
      body.createDiv({
        cls: "af-approval-item-meta",
        text: `Task: ${run.task} \u00B7 ${approval.command ?? "no command"} \u00B7 ${this.formatStarted(run.started)}`,
      });
      if (approval.reason) {
        body.createDiv({ cls: "af-approval-item-reason", text: `Reason: ${approval.reason}` });
      }

      if (showActions && approval.status === "pending") {
        const actions = item.createDiv({ cls: "af-approval-item-actions" });
        const approveBtn = actions.createEl("button", { cls: "af-btn-approve" });
        createIcon(approveBtn, "check-circle-2", "af-btn-icon");
        approveBtn.appendText(" Approve");
        approveBtn.onclick = () =>
          void this.plugin.runtime
            .resolveApproval(run, approval.tool, "approved")
            .then(() => this.render());

        const rejectBtn = actions.createEl("button", { cls: "af-btn-reject" });
        createIcon(rejectBtn, "x-circle", "af-btn-icon");
        rejectBtn.appendText(" Reject");
        rejectBtn.onclick = () =>
          void this.plugin.runtime
            .resolveApproval(run, approval.tool, "rejected")
            .then(() => this.render());
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Task Detail Page
  // ═══════════════════════════════════════════════════════

  private renderTaskDetailPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-task-detail-page" });
    const taskId = this.detailContext;
    if (!taskId) {
      this.renderEmptyState(page, "circle-dot", "No task selected", "");
      return;
    }

    const task = this.plugin.runtime.getSnapshot().tasks.find((t) => t.taskId === taskId);
    if (!task) {
      this.renderEmptyState(page, "circle-dot", "Task not found", `Task "${taskId}" was not found`);
      return;
    }

    const snapshot = this.plugin.runtime.getSnapshot();
    const runs = this.plugin.runtime.getRecentRuns().filter((r) => r.task === taskId);
    const agent = snapshot.agents.find((a) => a.name === task.agent);

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const taskIcon = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(taskIcon, "circle-dot");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: task.taskId });
    headerInfo.createDiv({
      cls: "af-detail-header-desc",
      text: `Agent: ${task.agent}`,
    });

    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

    const editBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
    createIcon(editBtn, "edit", "af-btn-icon");
    editBtn.appendText(" Edit");
    editBtn.onclick = () => this.navigate("edit-task", task.taskId);

    const runBtn = headerActions.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(runBtn, "play", "af-btn-icon");
    runBtn.appendText(" Run Now");
    runBtn.onclick = () => void this.plugin.runtime.runTaskNow(task);

    // Details section
    const details = page.createDiv({ cls: "af-section-card" });
    const detailsHeader = details.createDiv({ cls: "af-section-header" });
    const detailsTitle = detailsHeader.createDiv({ cls: "af-section-title" });
    createIcon(detailsTitle, "file-text");
    detailsTitle.appendText(" Details");

    const detailsBody = details.createDiv({ cls: "af-config-form" });
    this.renderConfigRow(detailsBody, "Agent", task.agent);
    this.renderConfigRow(detailsBody, "Priority", task.priority.charAt(0).toUpperCase() + task.priority.slice(1));
    this.renderConfigRow(detailsBody, "Status", task.enabled ? "Enabled" : "Disabled");

    // Schedule — human-readable, no raw cron
    const scheduleText = task.schedule
      ? this.humanizeCron(task.schedule)
      : task.runAt ?? "Manual (run on demand)";
    this.renderConfigRow(detailsBody, "Schedule", scheduleText);
    if (task.schedule) {
      this.renderConfigRow(detailsBody, "Catch up if missed", task.catchUp ? "Yes" : "No");
    }

    this.renderConfigRow(detailsBody, "Created", task.created);
    this.renderConfigRow(detailsBody, "Runs", String(task.runCount));
    if (task.lastRun) {
      this.renderConfigRow(detailsBody, "Last Run", this.formatStarted(task.lastRun));
    }

    // Instructions section
    const promptSection = page.createDiv({ cls: "af-section-card" });
    const promptHeader = promptSection.createDiv({ cls: "af-section-header" });
    const promptTitle = promptHeader.createDiv({ cls: "af-section-title" });
    createIcon(promptTitle, "message-square");
    promptTitle.appendText(" Instructions");
    promptSection.createDiv({ cls: "af-output-block", text: task.body || "(empty)" });

    // Recent runs
    const runsSection = page.createDiv({ cls: "af-section-card" });
    const runsHeader = runsSection.createDiv({ cls: "af-section-header" });
    const runsTitle = runsHeader.createDiv({ cls: "af-section-title" });
    createIcon(runsTitle, "scroll-text");
    runsTitle.appendText(" Recent Runs");

    const runsBody = runsSection.createDiv({ cls: "af-timeline" });
    if (runs.length === 0) {
      this.renderEmptyState(runsBody, "scroll-text", "No runs yet", "");
    } else {
      for (const run of runs.slice(0, 10)) {
        this.renderTimelineItem(runsBody, run);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Search
  // ═══════════════════════════════════════════════════════

  private handleSearch(query: string, searchWrap: HTMLElement): void {
    searchWrap.querySelector(".af-search-results")?.remove();

    if (query.length < 2) return;

    const q = query.toLowerCase();
    const snapshot = this.plugin.runtime.getSnapshot();
    const runs = this.plugin.runtime.getRecentRuns();
    const results: Array<{ label: string; icon: string; action: () => void }> = [];

    for (const agent of snapshot.agents) {
      if (
        agent.name.toLowerCase().includes(q) ||
        (agent.description?.toLowerCase().includes(q) ?? false)
      ) {
        results.push({
          label: `Agent: ${agent.name}`,
          icon: "bot",
          action: () => this.navigate("agent-detail", agent.name),
        });
      }
    }

    for (const task of snapshot.tasks) {
      if (task.taskId.toLowerCase().includes(q) || task.body.toLowerCase().includes(q)) {
        results.push({
          label: `Task: ${task.taskId}`,
          icon: "circle-dot",
          action: () => this.navigate("task-detail", task.taskId),
        });
      }
    }

    for (const skill of snapshot.skills) {
      if (skill.name.toLowerCase().includes(q)) {
        results.push({
          label: `Skill: ${skill.name}`,
          icon: "puzzle",
          action: () => this.navigate("edit-skill", skill.name),
        });
      }
    }

    for (const run of runs.slice(0, 20)) {
      if (run.output.toLowerCase().includes(q)) {
        results.push({
          label: `Run: ${run.agent} / ${run.task}`,
          icon: "scroll-text",
          action: () => this.openSlideover(run),
        });
      }
    }

    if (results.length === 0) return;

    const dropdown = searchWrap.createDiv({ cls: "af-search-results" });
    for (const result of results.slice(0, 10)) {
      const item = dropdown.createDiv({ cls: "af-search-result-item" });
      createIcon(item, result.icon, "af-search-result-icon");
      item.createSpan({ text: result.label });
      item.onclick = () => {
        dropdown.remove();
        result.action();
      };
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Slideover (Run Details)
  // ═══════════════════════════════════════════════════════
  //  Chat Slideover
  // ═══════════════════════════════════════════════════════

  public openChatSlideover(agent: AgentConfig): void {
    void this.plugin.openChatView(agent.name);
  }

  // ═══════════════════════════════════════════════════════

  private openSlideover(run: RunLogData): void {
    this.contentEl.querySelector(".af-slideover-overlay")?.remove();

    const overlay = this.contentEl.createDiv({ cls: "af-slideover-overlay" });
    const panel = overlay.createDiv({ cls: "af-slideover" });

    // Header
    const header = panel.createDiv({ cls: "af-slideover-header" });
    header.createDiv({ cls: "af-slideover-title", text: "Run Details" });
    const closeBtn = header.createEl("button", { cls: "clickable-icon" });
    setIcon(closeBtn, "cross");
    closeBtn.onclick = () => overlay.remove();

    // Body
    const body = panel.createDiv({ cls: "af-slideover-body" });

    // Metadata
    const metaSection = body.createDiv({ cls: "af-slideover-section" });
    metaSection.createDiv({ cls: "af-slideover-section-title", text: "METADATA" });

    this.renderDetailRow(metaSection, "Run ID", run.runId.slice(0, 8));
    this.renderDetailRow(metaSection, "Agent", run.agent);
    this.renderDetailRow(metaSection, "Task", run.task);

    const statusRow = metaSection.createDiv({ cls: "af-detail-row" });
    statusRow.createSpan({ cls: "af-detail-label", text: "Status" });
    const statusValue = statusRow.createSpan({ cls: "af-detail-value" });
    const statusBadge = statusValue.createSpan({
      cls: `af-status-badge ${this.statusToBadgeClass(run.status)}`,
    });
    const badgeIcon = statusBadge.createSpan();
    setIcon(badgeIcon, this.statusToIconName(run.status));
    statusBadge.appendText(` ${this.statusToBadgeText(run.status)}`);

    this.renderDetailRow(metaSection, "Started", run.started);
    this.renderDetailRow(metaSection, "Duration", this.formatDuration(run.durationSeconds));
    this.renderDetailRow(metaSection, "Tokens", run.tokensUsed ? run.tokensUsed.toLocaleString() : "\u2014");
    {
      const sourceLabel: Record<string, string> = {
        task: "from task override",
        agent: "from agent",
        settings: "from settings default",
        "cli-default": "CLI default",
      };
      const suffix = run.modelSource ? ` (${sourceLabel[run.modelSource] ?? run.modelSource})` : "";
      // Show the concrete model the CLI resolved to when it differs from the
      // requested string — lets users trace "opus" → "claude-opus-4-7".
      const concrete =
        run.concreteModel && run.concreteModel !== run.model ? ` → ${run.concreteModel}` : "";
      this.renderDetailRow(metaSection, "Model", `${run.model}${concrete}${suffix}`);
    }

    // Output — focused on the final result. If the CLI's result event was
    // captured (new runs), that short, narration-free answer is what the
    // user sees here. The full assistant transcript collapses behind a
    // `Show full transcript` disclosure so reasoning is still accessible
    // but not the primary surface.
    const MAX_RENDER_CHARS = 50000;
    const cap = (s: string) =>
      s.length > MAX_RENDER_CHARS
        ? s.slice(0, MAX_RENDER_CHARS) +
          `\n\n---\n*Truncated (${(s.length / 1024).toFixed(0)} KB total). Open the run note for full content.*`
        : s;

    const hasFinalResult = !!(run.finalResult && run.finalResult.trim());
    const outputForTranscript = run.output?.trim() ?? "";
    const transcriptDiffersFromResult =
      hasFinalResult &&
      outputForTranscript.length > 0 &&
      outputForTranscript !== run.finalResult!.trim();

    if (hasFinalResult) {
      const outputSection = body.createDiv({ cls: "af-slideover-section" });
      outputSection.createDiv({ cls: "af-slideover-section-title", text: "OUTPUT" });
      const resultBlock = outputSection.createDiv({ cls: "af-output-block af-compact-md" });
      void MarkdownRenderer.render(this.app, cap(run.finalResult!), resultBlock, "", this);

      if (transcriptDiffersFromResult) {
        const details = outputSection.createEl("details", { cls: "af-run-transcript" });
        const summary = details.createEl("summary");
        setIcon(summary.createSpan({ cls: "af-run-transcript-icon" }), "file-text");
        summary.createSpan({ text: "Show full transcript" });
        const meta = summary.createSpan({ cls: "af-run-transcript-meta" });
        meta.setText(`${(outputForTranscript.length / 1024).toFixed(1)} KB`);
        const transcriptBlock = details.createDiv({ cls: "af-output-block af-compact-md af-run-transcript-body" });
        void MarkdownRenderer.render(this.app, cap(outputForTranscript), transcriptBlock, "", this);
      }
    } else if (outputForTranscript) {
      // Legacy runs without a captured finalResult: fall back to rendering
      // the full output as today — no toggle to reveal something that
      // doesn't exist.
      const outputSection = body.createDiv({ cls: "af-slideover-section" });
      outputSection.createDiv({ cls: "af-slideover-section-title", text: "OUTPUT" });
      const outputBlock = outputSection.createDiv({ cls: "af-output-block af-compact-md" });
      void MarkdownRenderer.render(this.app, cap(outputForTranscript), outputBlock, "", this);
    }

    // Tools used
    if (run.toolsUsed.length > 0) {
      const toolsSection = body.createDiv({ cls: "af-slideover-section" });
      toolsSection.createDiv({ cls: "af-slideover-section-title", text: "TOOLS USED" });
      toolsSection.createDiv({ cls: "af-output-block", text: run.toolsUsed.join("\n") });
    }

    // Actions
    const actionsRow = body.createDiv({ cls: "af-slideover-actions" });
    if (run.filePath) {
      const openBtn = actionsRow.createEl("button", { cls: "af-btn-sm" });
      createIcon(openBtn, "external-link", "af-btn-icon");
      openBtn.appendText(" Open Run Note");
      openBtn.onclick = () => void this.plugin.openPath(run.filePath!);
    }

    const rerunBtn = actionsRow.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(rerunBtn, "refresh-cw", "af-btn-icon");
    rerunBtn.appendText(" Re-run Task");
    rerunBtn.onclick = () => void this.plugin.runAgentPrompt(run.agent);

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };


  }

  private renderDetailRow(container: HTMLElement, label: string, value: string): void {
    const row = container.createDiv({ cls: "af-detail-row" });
    row.createSpan({ cls: "af-detail-label", text: label });
    row.createSpan({ cls: "af-detail-value af-mono", text: value });
  }

  // ═══════════════════════════════════════════════════════
  //  Empty State
  // ═══════════════════════════════════════════════════════

  private renderEmptyState(container: HTMLElement, iconName: string, label: string, sublabel: string): void {
    const empty = container.createDiv({ cls: "af-empty-state" });
    const iconEl = empty.createDiv({ cls: "af-empty-icon" });
    setIcon(iconEl, iconName);
    empty.createDiv({ cls: "af-empty-label", text: label });
    if (sublabel) {
      empty.createDiv({ cls: "af-empty-sublabel", text: sublabel });
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════════════════

  private healthToClass(status: AgentHealth): string {
    switch (status) {
      case "running":
        return "running";
      case "error":
        return "error";
      case "pending":
        return "pending";
      case "disabled":
        return "disabled";
      default:
        return "idle";
    }
  }

  private statusToTimelineClass(status: string): string {
    switch (status) {
      case "success":
        return "success";
      case "failure":
      case "timeout":
        return "error";
      case "cancelled":
        return "warning";
      case "pending_approval":
        return "pending";
      default:
        return "running";
    }
  }

  private statusToIconName(status: string): string {
    switch (status) {
      case "success":
        return "check-circle-2";
      case "failure":
        return "x-circle";
      case "timeout":
        return "clock";
      case "pending_approval":
        return "shield-check";
      case "cancelled":
        return "square";
      default:
        return "loader-2";
    }
  }

  private statusToBadgeClass(status: string): string {
    switch (status) {
      case "success":
        return "success";
      case "failure":
        return "failure";
      case "timeout":
        return "timeout";
      case "pending_approval":
        return "pending";
      case "cancelled":
        return "cancelled";
      default:
        return "running";
    }
  }

  private statusToBadgeText(status: string): string {
    switch (status) {
      case "success":
        return "Success";
      case "failure":
        return "Failed";
      case "timeout":
        return "Timeout";
      case "pending_approval":
        return "Pending";
      case "cancelled":
        return "Cancelled";
      case "interrupted":
        return "Interrupted";
      default:
        return status;
    }
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  private formatStarted(iso: string): string {
    try {
      const d = new Date(iso);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        return `Yesterday ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
      return (
        d.toLocaleDateString([], { month: "short", day: "numeric" }) +
        ` ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      );
    } catch {
      return iso;
    }
  }

  private formatNextRun(iso: string): string {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = d.getTime() - now.getTime();
      if (diffMs < 0) return "overdue";
      const diffMin = Math.round(diffMs / 60000);
      if (diffMin < 60) return `${diffMin}m`;
      const diffH = Math.round(diffMin / 60);
      if (diffH < 24) return `${diffH}h`;
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  }

  private getNextTaskLabel(tasks: TaskConfig[]): string {
    const nextRuns = tasks.map((t) => t.nextRun).filter(Boolean).sort();
    const next = nextRuns[0];
    if (!next) return "none";
    const task = tasks.find((t) => t.nextRun === next);
    return `${task?.agent ?? "unknown"} in ${this.formatNextRun(next)}`;
  }

  private getInitials(name: string): string {
    return name
      .split("-")
      .map((w) => w[0]?.toUpperCase() ?? "")
      .slice(0, 2)
      .join("");
  }

  private renderAgentAvatar(el: HTMLElement, agent: AgentConfig): void {
    const avatar = agent.avatar?.trim();
    if (!avatar) {
      setIcon(el, "bot");
      return;
    }
    // Lucide icon names are lowercase alphanumeric + hyphens
    if (/^[a-z][a-z0-9-]*$/.test(avatar)) {
      setIcon(el, avatar);
    } else {
      el.setText(avatar);
    }
  }

  private getSkillIcon(name: string): string {
    if (name.includes("git")) return "settings";
    if (name.includes("summarize") || name.includes("log")) return "activity";
    if (name.includes("review") || name.includes("check")) return "check-circle-2";
    if (name.includes("vault") || name.includes("note")) return "file-text";
    return "puzzle";
  }

  private renderInlineSchedule(
    container: HTMLElement,
    state: { schedule: string; type: string },
  ): void {
    // Parse current cron into components
    const parsed = this.parseCronComponents(state.schedule);

    // Frequency dropdown
    const freqRow = container.createDiv({ cls: "af-form-row" });
    freqRow.createDiv({ cls: "af-form-label", text: "Frequency" });
    const freqSelect = freqRow.createEl("select", { cls: "af-form-select" });
    const freqOptions: Array<[string, string]> = [
      ["every_5m", "Every 5 minutes"],
      ["every_15m", "Every 15 minutes"],
      ["every_30m", "Every 30 minutes"],
      ["every_hour", "Every hour"],
      ["every_2h", "Every 2 hours"],
      ["daily", "Daily"],
      ["weekdays", "Weekdays"],
      ["weekly", "Weekly"],
      ["monthly", "Monthly"],
    ];
    for (const [val, lbl] of freqOptions) {
      const opt = freqSelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === parsed.freq) opt.selected = true;
    }

    // Time row (shown for daily/weekdays/weekly/monthly)
    const timeRow = container.createDiv({ cls: "af-form-row af-schedule-time-row" });
    timeRow.createDiv({ cls: "af-form-label", text: "Time" });
    const timeWrap = timeRow.createDiv({ cls: "af-schedule-time-selects" });

    const hourSelect = timeWrap.createEl("select", { cls: "af-form-select af-form-select-sm" });
    for (let h = 0; h < 24; h++) {
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const opt = hourSelect.createEl("option", { text: `${h12} ${ampm}`, attr: { value: String(h) } });
      if (h === parsed.hour) opt.selected = true;
    }

    timeWrap.createSpan({ cls: "af-schedule-colon", text: ":" });

    const minSelect = timeWrap.createEl("select", { cls: "af-form-select af-form-select-sm" });
    for (let m = 0; m < 60; m += 5) {
      const opt = minSelect.createEl("option", {
        text: String(m).padStart(2, "0"),
        attr: { value: String(m) },
      });
      if (m === parsed.minute) opt.selected = true;
    }

    // Day row (shown for weekly)
    const dayRow = container.createDiv({ cls: "af-form-row af-schedule-day-row" });
    dayRow.createDiv({ cls: "af-form-label", text: "Day" });
    const dayWrap = dayRow.createDiv({ cls: "af-schedule-day-buttons" });
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const selectedDays = new Set(parsed.days);

    for (let d = 0; d < 7; d++) {
      const btn = dayWrap.createEl("button", {
        cls: `af-schedule-day-btn${selectedDays.has(d) ? " active" : ""}`,
        text: dayNames[d]!,
      });
      btn.onclick = () => {
        if (selectedDays.has(d)) selectedDays.delete(d);
        else selectedDays.add(d);
        btn.toggleClass("active", selectedDays.has(d));
        buildCron();
      };
    }

    // Day-of-month row (shown for monthly)
    const domRow = container.createDiv({ cls: "af-form-row af-schedule-dom-row" });
    domRow.createDiv({ cls: "af-form-label", text: "Day of month" });
    const domSelect = domRow.createEl("select", { cls: "af-form-select af-form-select-sm" });
    for (let d = 1; d <= 28; d++) {
      const opt = domSelect.createEl("option", { text: String(d), attr: { value: String(d) } });
      if (d === parsed.dayOfMonth) opt.selected = true;
    }

    // Visibility logic
    const showHideFields = () => {
      const freq = freqSelect.value;
      const needsTime = ["daily", "weekdays", "weekly", "monthly"].includes(freq);
      const needsDay = freq === "weekly";
      const needsDom = freq === "monthly";
      timeRow.setCssStyles({ display: needsTime ? "" : "none" });
      dayRow.setCssStyles({ display: needsDay ? "" : "none" });
      domRow.setCssStyles({ display: needsDom ? "" : "none" });
    };

    // Build cron from selections
    const buildCron = () => {
      const freq = freqSelect.value;
      const h = hourSelect.value;
      const m = minSelect.value;
      let cron = "";
      switch (freq) {
        case "every_5m": cron = "*/5 * * * *"; break;
        case "every_15m": cron = "*/15 * * * *"; break;
        case "every_30m": cron = "*/30 * * * *"; break;
        case "every_hour": cron = "0 * * * *"; break;
        case "every_2h": cron = "0 */2 * * *"; break;
        case "daily": cron = `${m} ${h} * * *`; break;
        case "weekdays": cron = `${m} ${h} * * 1-5`; break;
        case "weekly": {
          const days = Array.from(selectedDays).sort().join(",") || "1";
          cron = `${m} ${h} * * ${days}`;
          break;
        }
        case "monthly": cron = `${m} ${h} ${domSelect.value} * *`; break;
      }
      state.schedule = cron;
      state.type = "recurring";
    };

    freqSelect.addEventListener("change", () => { showHideFields(); buildCron(); });
    hourSelect.addEventListener("change", buildCron);
    minSelect.addEventListener("change", buildCron);
    domSelect.addEventListener("change", buildCron);

    showHideFields();
  }

  /**
   * Simplified schedule picker for heartbeat — frequency intervals + time-of-day,
   * no weekly/monthly/day-of-week selection. Outputs a cron expression into
   * `state.heartbeatSchedule`.
   */
  private renderHeartbeatSchedule(
    container: HTMLElement,
    state: { heartbeatSchedule: string },
  ): void {
    const parsed = this.parseCronComponents(state.heartbeatSchedule);

    // Frequency dropdown — intervals only, no weekly/monthly
    const freqRow = container.createDiv({ cls: "af-form-row" });
    freqRow.createDiv({ cls: "af-form-label", text: "Frequency" });
    const freqSelect = freqRow.createEl("select", { cls: "af-form-select" });
    const freqOptions: Array<[string, string]> = [
      ["every_5m", "Every 5 minutes"],
      ["every_15m", "Every 15 minutes"],
      ["every_30m", "Every 30 minutes"],
      ["every_hour", "Every hour"],
      ["every_2h", "Every 2 hours"],
      ["every_4h", "Every 4 hours"],
      ["every_6h", "Every 6 hours"],
      ["every_12h", "Every 12 hours"],
      ["daily", "Once a day"],
    ];
    // Map the current schedule to a freq key
    let currentFreq = "every_hour";
    const cronToFreq: Record<string, string> = {
      "*/5 * * * *": "every_5m",
      "*/15 * * * *": "every_15m",
      "*/30 * * * *": "every_30m",
      "0 * * * *": "every_hour",
      "0 */2 * * *": "every_2h",
      "0 */4 * * *": "every_4h",
      "0 */6 * * *": "every_6h",
      "0 */12 * * *": "every_12h",
    };
    if (cronToFreq[state.heartbeatSchedule]) {
      currentFreq = cronToFreq[state.heartbeatSchedule]!;
    } else if (parsed.freq === "daily" || parsed.freq === "weekdays") {
      currentFreq = "daily";
    }

    for (const [val, lbl] of freqOptions) {
      const opt = freqSelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === currentFreq) opt.selected = true;
    }

    // Time row — only shown for "once a day"
    const timeRow = container.createDiv({ cls: "af-form-row af-schedule-time-row" });
    timeRow.createDiv({ cls: "af-form-label", text: "Time" });
    const timeWrap = timeRow.createDiv({ cls: "af-schedule-time-selects" });

    const hourSelect = timeWrap.createEl("select", { cls: "af-form-select af-form-select-sm" });
    for (let h = 0; h < 24; h++) {
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const opt = hourSelect.createEl("option", { text: `${h12} ${ampm}`, attr: { value: String(h) } });
      if (h === parsed.hour) opt.selected = true;
    }

    timeWrap.createSpan({ cls: "af-schedule-colon", text: ":" });

    const minSelect = timeWrap.createEl("select", { cls: "af-form-select af-form-select-sm" });
    for (let m = 0; m < 60; m += 5) {
      const opt = minSelect.createEl("option", {
        text: String(m).padStart(2, "0"),
        attr: { value: String(m) },
      });
      if (m === parsed.minute) opt.selected = true;
    }

    const showHide = () => {
      timeRow.setCssStyles({ display: freqSelect.value === "daily" ? "" : "none" });
    };

    const buildCron = () => {
      const freq = freqSelect.value;
      const h = hourSelect.value;
      const m = minSelect.value;
      switch (freq) {
        case "every_5m": state.heartbeatSchedule = "*/5 * * * *"; break;
        case "every_15m": state.heartbeatSchedule = "*/15 * * * *"; break;
        case "every_30m": state.heartbeatSchedule = "*/30 * * * *"; break;
        case "every_hour": state.heartbeatSchedule = "0 * * * *"; break;
        case "every_2h": state.heartbeatSchedule = "0 */2 * * *"; break;
        case "every_4h": state.heartbeatSchedule = "0 */4 * * *"; break;
        case "every_6h": state.heartbeatSchedule = "0 */6 * * *"; break;
        case "every_12h": state.heartbeatSchedule = "0 */12 * * *"; break;
        case "daily": state.heartbeatSchedule = `${m} ${h} * * *`; break;
      }
    };

    freqSelect.addEventListener("change", () => { showHide(); buildCron(); });
    hourSelect.addEventListener("change", buildCron);
    minSelect.addEventListener("change", buildCron);

    showHide();
  }

  private parseCronComponents(cron: string): {
    freq: string;
    hour: number;
    minute: number;
    days: number[];
    dayOfMonth: number;
  } {
    const defaults = { freq: "daily", hour: 9, minute: 0, days: [1], dayOfMonth: 1 };
    if (!cron?.trim()) return defaults;

    const shortcutMap: Record<string, string> = {
      "*/5 * * * *": "every_5m",
      "*/15 * * * *": "every_15m",
      "*/30 * * * *": "every_30m",
      "0 * * * *": "every_hour",
      "0 */2 * * *": "every_2h",
    };
    if (shortcutMap[cron]) return { ...defaults, freq: shortcutMap[cron] };

    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return defaults;
    const [min, hr, dom, , dow] = parts;
    const h = parseInt(hr ?? "9", 10);
    const m = parseInt(min ?? "0", 10);

    if (dom === "*" && dow === "*") return { ...defaults, freq: "daily", hour: h, minute: m };
    if (dom === "*" && dow === "1-5") return { ...defaults, freq: "weekdays", hour: h, minute: m };
    if (dom === "*" && dow !== "*") {
      const days = (dow ?? "1").split(",").map((d) => parseInt(d, 10));
      return { ...defaults, freq: "weekly", hour: h, minute: m, days };
    }
    if (dow === "*" && dom !== "*") {
      return { ...defaults, freq: "monthly", hour: h, minute: m, dayOfMonth: parseInt(dom ?? "1", 10) };
    }

    return { ...defaults, hour: h, minute: m };
  }

  private humanizeCron(cron: string): string {
    // Check shorthand aliases first
    const shortcuts: Record<string, string> = {
      "*/5 * * * *": "Every 5 minutes",
      "*/10 * * * *": "Every 10 minutes",
      "*/15 * * * *": "Every 15 minutes",
      "*/30 * * * *": "Every 30 minutes",
      "0 * * * *": "Every hour",
      "0 */2 * * *": "Every 2 hours",
    };
    if (shortcuts[cron]) return shortcuts[cron];

    // Also match shorthand input directly
    const lower = cron.toLowerCase().trim();
    if (lower.startsWith("every ")) return cron;
    if (lower.startsWith("daily ") || lower === "daily") return cron;
    if (lower.startsWith("hourly")) return "Every hour";
    if (lower.startsWith("weekdays")) return cron;
    if (lower.startsWith("weekly")) return cron;
    if (lower.startsWith("monthly")) return cron;

    // Parse standard 5-field cron
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return cron;
    const [min, hr, dom, , dow] = parts;

    const fmtTime = (h: string, m: string) => {
      const hh = parseInt(h ?? "0", 10);
      const mm = parseInt(m ?? "0", 10);
      const ampm = hh >= 12 ? "PM" : "AM";
      const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
      return mm === 0 ? `${h12} ${ampm}` : `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
    };

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const fmtDow = (d: string) => {
      if (d === "1-5") return "weekdays";
      if (d === "0,6") return "weekends";
      const nums = d.split(",").map((n) => parseInt(n, 10));
      return nums.map((n) => dayNames[n] ?? n).join(", ");
    };

    if (hr === "*" && dom === "*" && dow === "*") {
      if (min === "*") return "Every minute";
      return `Every hour at :${String(min).padStart(2, "0")}`;
    }
    if (dom === "*" && dow === "*" && hr !== "*") {
      return `Daily at ${fmtTime(hr ?? "0", min ?? "0")}`;
    }
    if (dom === "*" && dow === "1-5" && hr !== "*") {
      return `Weekdays at ${fmtTime(hr ?? "0", min ?? "0")}`;
    }
    if (dom === "*" && dow !== "*" && hr !== "*") {
      return `${fmtDow(dow ?? "1")} at ${fmtTime(hr ?? "0", min ?? "0")}`;
    }
    if (dow === "*" && dom !== "*" && hr !== "*") {
      return `Monthly on the ${dom} at ${fmtTime(hr ?? "0", min ?? "0")}`;
    }
    return cron;
  }

  private getTagClass(tag: string): string {
    if (tag === "monitoring") return "monitoring";
    if (tag === "devops") return "devops";
    if (tag === "sample") return "sample";
    return "default";
  }

  // ═══════════════════════════════════════════════════════
  //  Create Agent Page
  // ═══════════════════════════════════════════════════════

  private renderCreateAgentPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(avatar, "plus");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: "Create New Agent" });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Configure a new agent for your fleet" });

    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });
    // Form state
    const state = {
      name: "",
      description: "",
      avatar: "",
      tags: "",
      systemPrompt: "",
      model: "default",
      adapter: "claude-code",
      cwd: "",
      timeout: 300,
      permissionMode: "bypassPermissions",
      effort: "",
      selectedSkills: new Set<string>(),
      selectedMcpServers: new Set<string>(),
      skillsBody: "",
      contextBody: "",
      approvalRequired: "",
      memory: true,
      enabled: true,
      allowedCommands: "",
      blockedCommands: "",
      heartbeatEnabled: false,
      heartbeatSchedule: "0 */6 * * *",
      heartbeatBody: "",
      heartbeatNotify: true,
      heartbeatChannel: "",
      autoCompactThreshold: 85,
      wikiReferences: [] as string[],
    };

    const TEMPLATES: Record<string, { label: string; prompt: string }> = {
      none: { label: "None", prompt: "" },
      coding: { label: "Coding Agent", prompt: "You are a coding agent. Review code, write tests, fix bugs, and implement features.\nFollow existing code conventions. Write clean, well-tested code.\nIf something is unclear, ask for clarification instead of guessing." },
      monitor: { label: "Monitor", prompt: "You are a monitoring agent. Check system status, alert on failures, and report on health metrics.\nBe concise and factual. Highlight anomalies clearly.\nInclude timestamps and relevant context in all reports." },
      briefing: { label: "Briefing", prompt: "You are a briefing agent. Summarize activity, generate reports, and surface key changes.\nPrioritize recent and important changes. Keep summaries concise.\nEnd with explicit next actions if they exist." },
      reviewer: { label: "Code Reviewer", prompt: "You are a code review agent. Analyze pull requests, suggest improvements, and flag potential issues.\nFocus on correctness, security, and maintainability.\nBe specific — reference file names and line numbers." },
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Identity Section ───
    const identitySection = form.createDiv({ cls: "af-create-section" });
    const identityHeader = identitySection.createDiv({ cls: "af-create-section-header" });
    const identityIcon = identityHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(identityIcon, "user");
    identityHeader.createSpan({ text: "Identity" });

    this.createFormField(identitySection, "Name", "deploy-watcher", "Unique identifier (will be slugified)", (v) => { state.name = v; });
    this.createFormField(identitySection, "Description", "Monitors deployments and reports status", "", (v) => { state.description = v; });

    const avatarRow = identitySection.createDiv({ cls: "af-form-row" });
    avatarRow.createDiv({ cls: "af-form-label", text: "Avatar" });
    const avatarInput = avatarRow.createEl("input", {
      cls: "af-form-input af-form-input-sm",
      attr: { type: "text", placeholder: "🛡️" },
    });
    avatarInput.addEventListener("input", () => { state.avatar = avatarInput.value; });

    this.createFormField(identitySection, "Tags", "devops, monitoring", "Comma-separated", (v) => { state.tags = v; });

    // Enabled toggle
    const enabledRow = identitySection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
    const enabledToggle = enabledRow.createDiv({ cls: "af-agent-card-toggle on" });
    enabledToggle.onclick = () => {
      const isOn = enabledToggle.hasClass("on");
      enabledToggle.toggleClass("on", !isOn);
      state.enabled = !isOn;
    };

    // ─── System Prompt Section ───
    const promptSection = form.createDiv({ cls: "af-create-section" });
    const promptHeader = promptSection.createDiv({ cls: "af-create-section-header" });
    const promptIcon = promptHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(promptIcon, "message-square");
    promptHeader.createSpan({ text: "System Prompt" });

    const templateRow = promptSection.createDiv({ cls: "af-form-row" });
    templateRow.createDiv({ cls: "af-form-label", text: "Template" });
    const templateSelect = templateRow.createEl("select", { cls: "af-form-select" });
    for (const [key, { label }] of Object.entries(TEMPLATES)) {
      templateSelect.createEl("option", { text: label, attr: { value: key } });
    }

    const promptTextarea = promptSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "You are a deployment monitoring agent...", rows: "10" },
    });
    promptTextarea.addEventListener("input", () => { state.systemPrompt = promptTextarea.value; });

    templateSelect.addEventListener("change", () => {
      const preset = TEMPLATES[templateSelect.value];
      if (preset && templateSelect.value !== "none") {
        state.systemPrompt = preset.prompt;
        promptTextarea.value = preset.prompt;
      }
    });

    // ─── Runtime Config Section ───
    const configSection = form.createDiv({ cls: "af-create-section" });
    const configHeader = configSection.createDiv({ cls: "af-create-section-header" });
    const configIcon = configHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(configIcon, "settings");
    configHeader.createSpan({ text: "Runtime Config" });

    const configGrid = configSection.createDiv({ cls: "af-create-config-grid" });

    // Adapter (before model, so model dropdown updates when adapter changes)
    const adapterRow = configGrid.createDiv({ cls: "af-form-row" });
    adapterRow.createDiv({ cls: "af-form-label", text: "Adapter" });
    const adapterSelect = adapterRow.createEl("select", { cls: "af-form-select" });
    for (const [val, lbl, disabled] of ADAPTER_FORM_OPTIONS) {
      const opt = adapterSelect.createEl("option", { text: lbl, attr: { value: val, ...(disabled ? { disabled: "true" } : {}) } });
      if (val === "claude-code") opt.selected = true;
    }

    // Model (dynamic based on adapter)
    const modelRow = configGrid.createDiv({ cls: "af-form-row" });
    const modelLabel = modelRow.createDiv({ cls: "af-form-label", text: "Model" });
    this.addTooltip(
      modelLabel,
      `Aliases (opus/sonnet/haiku/opusplan) work on any backend. Choose Custom\u2026 for a pinned ID or Bedrock/Vertex/Foundry. Blank = use Settings default (${this.plugin.settings.defaultModel || "CLI default"}).`,
    );
    const modelFieldWrap = modelRow.createDiv({ cls: "af-form-field-wrap" });
    const renderModelField = () => {
      renderModelPicker(modelFieldWrap, {
        value: state.model,
        adapter: state.adapter,
        onChange: (value) => { state.model = value; },
      });
    };
    renderModelField();

    // The permission dropdown is built further down; it registers its
    // repopulate hook here so adapter switches refresh it too.
    let repopulatePermModeSelect: () => void = () => { /* assigned below */ };

    adapterSelect.addEventListener("change", () => {
      state.adapter = adapterSelect.value;
      // A model alias from the other vendor would be passed verbatim and
      // rejected by the CLI \u2014 reset to "use default" on family switch.
      const otherAliases = isCodexAdapterValue(state.adapter) ? MODEL_ALIASES : CODEX_MODEL_ALIASES;
      if (otherAliases.some((a) => a.value === state.model.trim())) {
        state.model = "";
      }
      renderModelField();
      state.permissionMode = permModeForAdapter(state.permissionMode, state.adapter);
      repopulatePermModeSelect();
    });

    // Working Dir
    const cwdRow = configGrid.createDiv({ cls: "af-form-row" });
    cwdRow.createDiv({ cls: "af-form-label", text: "Working Dir" });
    const cwdInput = cwdRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", placeholder: "Leave empty for vault root" },
    });
    cwdInput.addEventListener("input", () => { state.cwd = cwdInput.value; });

    // Timeout
    const timeoutRow = configGrid.createDiv({ cls: "af-form-row" });
    timeoutRow.createDiv({ cls: "af-form-label", text: "Timeout (sec)" });
    const timeoutInput = timeoutRow.createEl("input", {
      cls: "af-form-input af-form-input-sm",
      attr: { type: "number", value: "300" },
    });
    timeoutInput.addEventListener("input", () => {
      const n = parseInt(timeoutInput.value, 10);
      if (!isNaN(n) && n > 0) state.timeout = n;
    });

    // Permission Mode (options depend on the selected adapter)
    const permRow = configGrid.createDiv({ cls: "af-form-row" });
    permRow.createDiv({ cls: "af-form-label", text: "Permission Mode" });
    const permSelect = permRow.createEl("select", { cls: "af-form-select" });
    const permDescEl = configGrid.createDiv({ cls: "af-form-hint", text: "" });
    repopulatePermModeSelect = () => {
      // Snap any value left over from the other adapter family to its
      // nearest equivalent so the dropdown always reflects what gets saved.
      state.permissionMode = permModeForAdapter(state.permissionMode, state.adapter);
      const options = permModeOptionsFor(state.adapter);
      permSelect.empty();
      for (const [val, lbl] of options) {
        const opt = permSelect.createEl("option", { text: lbl, attr: { value: val } });
        if (val === state.permissionMode) opt.selected = true;
      }
      permDescEl.textContent = options.find(([v]) => v === permSelect.value)?.[2] ?? "";
    };
    repopulatePermModeSelect();
    permSelect.addEventListener("change", () => {
      state.permissionMode = permSelect.value;
      permDescEl.textContent = permModeOptionsFor(state.adapter).find(([v]) => v === permSelect.value)?.[2] ?? "";
    });

    // Effort Level
    const effortRow = configGrid.createDiv({ cls: "af-form-row" });
    effortRow.createDiv({ cls: "af-form-label", text: "Effort Level" });
    const effortSelect = effortRow.createEl("select", { cls: "af-form-select" });
    for (const [val, lbl] of [["", "Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["max", "Max"]] as const) {
      effortSelect.createEl("option", { text: lbl, attr: { value: val } });
    }
    effortSelect.addEventListener("change", () => { state.effort = effortSelect.value; });
    configGrid.createDiv({ cls: "af-form-hint", text: "Controls reasoning depth — low is fast, max is most thorough" });

    // Auto-compact threshold
    const compactRow = configGrid.createDiv({ cls: "af-form-row" });
    const compactLabel = compactRow.createDiv({ cls: "af-form-label", text: "Auto-compact at" });
    this.addTooltip(
      compactLabel,
      "Percent of context window at which the chat auto-invokes /compact before the next message. 85% is a good default. Set 0 to disable.",
    );
    const compactInput = compactRow.createEl("input", {
      cls: "af-form-input af-form-input-sm",
      attr: { type: "number", min: "0", max: "100", value: String(state.autoCompactThreshold) },
    });
    compactInput.addEventListener("input", () => {
      const n = parseInt(compactInput.value, 10);
      if (!isNaN(n) && n >= 0 && n <= 100) state.autoCompactThreshold = n;
    });
    configGrid.createDiv({ cls: "af-form-hint", text: "0 disables auto-compact" });

    // Wiki references (consumer-mode read access to other keepers' scopes)
    {
      const wikiKeepers = this.plugin.runtime.getSnapshot().agents.filter((a) => a.wikiKeeper !== undefined);
      if (wikiKeepers.length > 0) {
        const wrRow = configGrid.createDiv({ cls: "af-form-row af-form-row-toggle" });
        const wrLabel = wrRow.createDiv({ cls: "af-form-label", text: "Wiki access" });
        this.addTooltip(
          wrLabel,
          "Lets this agent read + cite from the selected Wiki Keeper scopes (requires the wiki-query skill).",
        );
        const wrWrap = wrRow.createDiv({ cls: "af-form-field-wrap" });
        for (const wk of wikiKeepers) {
          const label = wrWrap.createEl("label", { cls: "af-form-checkbox-row" });
          const cb = label.createEl("input", { attr: { type: "checkbox" } });
          label.createSpan({ text: ` ${wk.name}`, cls: "af-form-checkbox-label" });
          cb.addEventListener("change", () => {
            if (cb.checked) {
              if (!state.wikiReferences.includes(wk.name)) state.wikiReferences.push(wk.name);
            } else {
              state.wikiReferences = state.wikiReferences.filter((n) => n !== wk.name);
            }
          });
        }
      }
    }

    // ─── Heartbeat Section ───
    {
      const heartbeatSection = form.createDiv({ cls: "af-create-section" });
      const heartbeatHeader = heartbeatSection.createDiv({ cls: "af-create-section-header" });
      const heartbeatIcon = heartbeatHeader.createSpan({ cls: "af-create-section-icon" });
      setIcon(heartbeatIcon, "heart-pulse");
      const heartbeatHeaderLabel = heartbeatHeader.createSpan({ text: "Heartbeat" });
      this.addTooltip(heartbeatHeaderLabel, "Autonomous periodic run — what the agent does when no one is asking");

      const hbEnabledRow = heartbeatSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
      hbEnabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
      const hbEnabledToggle = hbEnabledRow.createDiv({ cls: "af-agent-card-toggle" });
      const hbBody = heartbeatSection.createDiv();
      hbBody.setCssStyles({ display: "none" });
      hbEnabledToggle.onclick = () => {
        const isOn = hbEnabledToggle.hasClass("on");
        hbEnabledToggle.toggleClass("on", !isOn);
        state.heartbeatEnabled = !isOn;
        hbBody.setCssStyles({ display: !isOn ? "" : "none" });
      };

      this.renderHeartbeatSchedule(hbBody, state);

      const hbNotifyRow = hbBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
      const hbNotifyLabel = hbNotifyRow.createDiv({ cls: "af-form-label" });
      hbNotifyLabel.setText("Notify");
      this.addTooltip(hbNotifyLabel, "Show an Obsidian notice when the heartbeat completes");
      const hbNotifyToggle = hbNotifyRow.createDiv({ cls: "af-agent-card-toggle on" });
      hbNotifyToggle.onclick = () => {
        const isOn = hbNotifyToggle.hasClass("on");
        hbNotifyToggle.toggleClass("on", !isOn);
        state.heartbeatNotify = !isOn;
      };

      const createSnapshot = this.plugin.runtime.getSnapshot();
      const hbChannelRow = hbBody.createDiv({ cls: "af-form-row" });
      const hbChannelLabel = hbChannelRow.createDiv({ cls: "af-form-label" });
      hbChannelLabel.setText("Post to channel");
      this.addTooltip(hbChannelLabel, "Heartbeat results are posted to this Slack channel when the run completes");
      const hbChannelSelect = hbChannelRow.createEl("select", { cls: "af-form-select" });
      hbChannelSelect.createEl("option", { text: "(none)", attr: { value: "" } });
      for (const ch of createSnapshot.channels) {
        hbChannelSelect.createEl("option", { text: ch.name, attr: { value: ch.name } });
      }
      hbChannelSelect.addEventListener("change", () => { state.heartbeatChannel = hbChannelSelect.value; });

      const hbInstructionLabel = hbBody.createDiv({ cls: "af-form-label" });
      hbInstructionLabel.setCssStyles({ width: "auto" });
      hbInstructionLabel.setCssStyles({ marginTop: "12px" });
      hbInstructionLabel.setText("Instruction");
      this.addTooltip(hbInstructionLabel, "What the agent does on each heartbeat. Also used by the \"Run Now\" button.");
      const hbTextarea = hbBody.createEl("textarea", {
        cls: "af-create-prompt-textarea",
        attr: { placeholder: "Check status, scan for issues, report findings...", rows: "8" },
      });
      hbTextarea.addEventListener("input", () => { state.heartbeatBody = hbTextarea.value; });
    }

    // ─── Skills Section ───
    const skillsSection = form.createDiv({ cls: "af-create-section" });
    const skillsHeader = skillsSection.createDiv({ cls: "af-create-section-header" });
    const skillsIcon = skillsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(skillsIcon, "puzzle");
    skillsHeader.createSpan({ text: "Skills" });

    const snapshot = this.plugin.runtime.getSnapshot();
    if (snapshot.skills.length > 0) {
      skillsSection.createDiv({ cls: "af-form-sublabel", text: "Shared Skills" });
      const skillsGrid = skillsSection.createDiv({ cls: "af-create-skills-grid" });
      for (const skill of snapshot.skills) {
        const item = skillsGrid.createDiv({ cls: "af-create-skill-item" });
        const cb = item.createEl("input", { cls: "af-form-toggle", attr: { type: "checkbox" } });
        cb.addEventListener("change", () => {
          if (cb.checked) state.selectedSkills.add(skill.name);
          else state.selectedSkills.delete(skill.name);
        });
        const lbl = item.createDiv({ cls: "af-create-skill-label" });
        lbl.createSpan({ cls: "af-create-skill-name", text: skill.name });
        if (skill.description) {
          lbl.createSpan({ cls: "af-create-skill-desc", text: ` — ${skill.description}` });
        }
      }
    }

    const agentSkillsLabel = skillsSection.createDiv({ cls: "af-form-sublabel" });
    agentSkillsLabel.setText("Agent-specific skills");
    this.addTooltip(agentSkillsLabel, "Custom skills/instructions only for this agent, not shared with others");
    const skillsTextarea = skillsSection.createEl("textarea", {
      cls: "af-create-textarea",
      attr: { placeholder: "Custom skills/instructions for this agent...", rows: "4" },
    });
    skillsTextarea.addEventListener("input", () => { state.skillsBody = skillsTextarea.value; });

    // ─── MCP Servers Section ───
    {
      const mcpSection = form.createDiv({ cls: "af-create-section" });
      const mcpHeader = mcpSection.createDiv({ cls: "af-create-section-header" });
      const mcpIcon = mcpHeader.createSpan({ cls: "af-create-section-icon" });
      setIcon(mcpIcon, "plug");
      const mcpHeaderLabel = mcpHeader.createSpan({ text: "MCP Servers" });
      this.addTooltip(mcpHeaderLabel, "Grant agent access to MCP servers");
      this.renderAgentMcpPicker(mcpSection, state.selectedMcpServers);
    }

    // ─── Context Section ───
    const contextSection = form.createDiv({ cls: "af-create-section" });
    const contextHeader = contextSection.createDiv({ cls: "af-create-section-header" });
    const contextIcon = contextHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(contextIcon, "file-text");
    const contextHeaderLabel = contextHeader.createSpan({ text: "Context" });
    this.addTooltip(contextHeaderLabel, "Project-specific context included in every run");
    const contextTextarea = contextSection.createEl("textarea", {
      cls: "af-create-textarea",
      attr: { placeholder: "Background info, repo structure, conventions...", rows: "4" },
    });
    contextTextarea.addEventListener("input", () => { state.contextBody = contextTextarea.value; });

    // ─── Permissions Section ───
    const permsSection = form.createDiv({ cls: "af-create-section" });
    const permsHeader = permsSection.createDiv({ cls: "af-create-section-header" });
    const permsIcon = permsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(permsIcon, "shield-check");
    permsHeader.createSpan({ text: "Permissions" });

    this.createFormField(permsSection, "Approval required", "git_push, file_delete", "Comma-separated tool names", (v) => { state.approvalRequired = v; });

    const allowRow = permsSection.createDiv({ cls: "af-form-row" });
    allowRow.createDiv({ cls: "af-form-label", text: "Allowed Commands" });
    const allowTextarea = allowRow.createEl("textarea", {
      cls: "af-create-textarea",
      attr: { placeholder: "Bash(curl *)\nBash(python3 *)\nRead\nEdit\nWrite", rows: "4" },
    });
    allowTextarea.addEventListener("input", () => { state.allowedCommands = allowTextarea.value; });

    const denyRow = permsSection.createDiv({ cls: "af-form-row" });
    denyRow.createDiv({ cls: "af-form-label", text: "Blocked Commands" });
    const denyTextarea = denyRow.createEl("textarea", {
      cls: "af-create-textarea",
      attr: { placeholder: "Bash(git push *)\nBash(rm -rf *)\nBash(sudo *)", rows: "4" },
    });
    denyTextarea.addEventListener("input", () => { state.blockedCommands = denyTextarea.value; });

    permsSection.createDiv({
      cls: "af-form-hint",
      text:
        "On Codex agents these become execpolicy command rules — only Bash(cmd args *) " +
        "prefixes are enforced; tool-name rules (Read/Write) and mid-pattern wildcards are " +
        "ignored, and file/network access is governed by Permission Mode (the sandbox).",
    });

    const memoryRow = permsSection.createDiv({ cls: "af-form-row" });
    memoryRow.createDiv({ cls: "af-form-label", text: "Memory enabled" });
    const memoryToggle = memoryRow.createDiv({ cls: "af-agent-card-toggle on" });
    memoryToggle.onclick = () => {
      const isOn = memoryToggle.hasClass("on");
      memoryToggle.toggleClass("on", !isOn);
      state.memory = !isOn;
    };

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });
    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("agents");

    const createBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(createBtn, "plus", "af-btn-icon");
    createBtn.appendText(" Create Agent");
    createBtn.onclick = async () => {
      const name = state.name.trim();
      if (!name) {
        new Notice("Agent name is required.");
        return;
      }
      const slug = slugify(name);
      if (this.plugin.repository.getAgentByName(slug)) {
        new Notice(`Agent "${slug}" already exists.`);
        return;
      }
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      try {
        const parseLines = (s: string) => splitLines(s).map((l) => l.trim()).filter(Boolean);
        await this.plugin.repository.createAgentFolder({
          name: slug,
          description: state.description.trim(),
          avatar: state.avatar.trim(),
          tags: parseTags(state.tags),
          systemPrompt: state.systemPrompt.trim(),
          model: state.model.trim() || "default",
          adapter: state.adapter,
          cwd: state.cwd.trim(),
          timeout: state.timeout,
          permissionMode: state.permissionMode,
          effort: state.effort || undefined,
          approvalRequired: parseTags(state.approvalRequired),
          memory: state.memory,
          memoryMaxEntries: 100,
          skills: Array.from(state.selectedSkills),
          mcpServers: Array.from(state.selectedMcpServers),
          skillsBody: state.skillsBody.trim(),
          contextBody: state.contextBody.trim(),
          enabled: state.enabled,
          permissionRules: {
            allow: parseLines(state.allowedCommands),
            deny: parseLines(state.blockedCommands),
          },
          autoCompactThreshold: state.autoCompactThreshold,
          wikiReferences: state.wikiReferences,
        });

        // Save heartbeat if configured
        if (state.heartbeatEnabled && state.heartbeatBody.trim()) {
          await this.plugin.repository.updateHeartbeat(slug, {
            enabled: state.heartbeatEnabled,
            schedule: state.heartbeatSchedule.trim(),
            notify: state.heartbeatNotify,
            channel: state.heartbeatChannel,
            body: state.heartbeatBody.trim(),
          });
        }

        new Notice(`Agent "${slug}" created.`);
        await this.plugin.refreshFromVault();
        this.navigate("agent-detail", slug);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to create agent: ${msg}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Create Skill Page
  // ═══════════════════════════════════════════════════════

  private renderCreateSkillPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(avatar, "plus");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: "Create New Skill" });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Define a reusable skill for your agents" });

    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });
    // Form state
    const state = {
      name: "",
      description: "",
      tags: "",
      body: "",
      toolsBody: "",
      referencesBody: "",
      examplesBody: "",
    };

    const SKILL_TEMPLATES: Record<string, { label: string; prompt: string }> = {
      none: { label: "None", prompt: "" },
      cli: { label: "CLI Tool Wrapper", prompt: "You are using the {{tool}} CLI. All operations go through the wrapper script.\n\nRequirements:\n- Ensure required environment variables are set\n- Parse JSON responses for human-readable output\n- Confirm destructive operations before executing\n\nKey behaviors:\n- List existing items before making changes\n- Use --dry-run flags when available\n- Report errors clearly with suggested fixes" },
      api: { label: "API Integration", prompt: "You are integrating with the {{service}} API.\n\nBase URL: https://api.example.com/v1\nAuth: Bearer token via environment variable\n\nKey behaviors:\n- Always check rate limits before bulk operations\n- Handle pagination for list endpoints\n- Validate inputs before making requests\n- Parse and format JSON responses for readability" },
      review: { label: "Code Review", prompt: "You are a code review skill. Analyze code changes and provide structured feedback.\n\nReview checklist:\n- Correctness: Does the code do what it claims?\n- Security: Any injection, auth, or data exposure risks?\n- Performance: Unnecessary allocations, N+1 queries, missing indexes?\n- Maintainability: Clear naming, reasonable complexity, adequate tests?\n\nOutput format:\n- Start with a 1-line summary\n- Group findings by severity (critical, warning, suggestion)\n- Reference specific file paths and line numbers" },
      data: { label: "Data Analysis", prompt: "You are a data analysis skill. Query, transform, and report on data.\n\nKey behaviors:\n- Summarize datasets before diving into details\n- Use tables and charts where appropriate\n- Always state the time range and filters applied\n- Flag anomalies and outliers explicitly\n- End with actionable insights, not just observations" },
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Identity Section ───
    const identitySection = form.createDiv({ cls: "af-create-section" });
    const identityHeader = identitySection.createDiv({ cls: "af-create-section-header" });
    const identityIcon = identityHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(identityIcon, "puzzle");
    identityHeader.createSpan({ text: "Identity" });

    this.createFormField(identitySection, "Name", "todoist", "Unique identifier (will be slugified)", (v) => { state.name = v; });
    this.createFormField(identitySection, "Description", "Manage tasks and projects via CLI", "", (v) => { state.description = v; });
    this.createFormField(identitySection, "Tags", "productivity, tasks", "Comma-separated", (v) => { state.tags = v; });

    // ─── Core Instructions Section ───
    const instructionsSection = form.createDiv({ cls: "af-create-section" });
    const instructionsHeader = instructionsSection.createDiv({ cls: "af-create-section-header" });
    const instructionsIcon = instructionsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(instructionsIcon, "file-text");
    instructionsHeader.createSpan({ text: "Core Instructions" });

    const templateRow = instructionsSection.createDiv({ cls: "af-form-row" });
    templateRow.createDiv({ cls: "af-form-label", text: "Template" });
    const templateSelect = templateRow.createEl("select", { cls: "af-form-select" });
    for (const [key, { label }] of Object.entries(SKILL_TEMPLATES)) {
      templateSelect.createEl("option", { text: label, attr: { value: key } });
    }

    const bodyTextarea = instructionsSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "Skill instructions — what does this skill do and how should agents use it?", rows: "10" },
    });
    bodyTextarea.addEventListener("input", () => { state.body = bodyTextarea.value; });

    templateSelect.addEventListener("change", () => {
      const preset = SKILL_TEMPLATES[templateSelect.value];
      if (preset && templateSelect.value !== "none") {
        state.body = preset.prompt;
        bodyTextarea.value = preset.prompt;
      }
    });

    // ─── Tools Section ───
    const toolsSection = form.createDiv({ cls: "af-create-section" });
    const toolsHeader = toolsSection.createDiv({ cls: "af-create-section-header" });
    const toolsIcon = toolsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(toolsIcon, "wrench");
    const toolsHeaderLabel = toolsHeader.createSpan({ text: "Tools" });
    this.addTooltip(toolsHeaderLabel, "CLI commands, API endpoints, and tool definitions available to agents using this skill");
    const toolsTextarea = toolsSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "## Commands\n\n### list\nUsage: tool list [--filter <query>]\n...", rows: "8" },
    });
    toolsTextarea.addEventListener("input", () => { state.toolsBody = toolsTextarea.value; });

    // ─── References Section ───
    const refsSection = form.createDiv({ cls: "af-create-section" });
    const refsHeader = refsSection.createDiv({ cls: "af-create-section-header" });
    const refsIcon = refsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(refsIcon, "book-open");
    const refsHeaderLabel = refsHeader.createSpan({ text: "References" });
    this.addTooltip(refsHeaderLabel, "Background docs, conventions, cheat sheets");
    const refsTextarea = refsSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "API docs, filter syntax, conventions...", rows: "6" },
    });
    refsTextarea.addEventListener("input", () => { state.referencesBody = refsTextarea.value; });

    // ─── Examples Section ───
    const examplesSection = form.createDiv({ cls: "af-create-section" });
    const examplesHeader = examplesSection.createDiv({ cls: "af-create-section-header" });
    const examplesIcon = examplesHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(examplesIcon, "message-circle");
    const examplesHeaderLabel = examplesHeader.createSpan({ text: "Examples" });
    this.addTooltip(examplesHeaderLabel, "Example prompts and ideal outputs showing how to use this skill");
    const examplesTextarea = examplesSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "## Example: List all tasks\n\nUser: Show me my tasks for today\n\nAgent: ...", rows: "6" },
    });
    examplesTextarea.addEventListener("input", () => { state.examplesBody = examplesTextarea.value; });

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });
    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("skills");

    const createBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(createBtn, "plus", "af-btn-icon");
    createBtn.appendText(" Create Skill");
    createBtn.onclick = async () => {
      const name = state.name.trim();
      if (!name) {
        new Notice("Skill name is required.");
        return;
      }
      const slug = slugify(name);
      if (this.plugin.repository.getSkillByName(slug)) {
        new Notice(`Skill "${slug}" already exists.`);
        return;
      }
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      try {
        await this.plugin.repository.createSkillFolder({
          name: slug,
          description: state.description.trim(),
          tags: parseTags(state.tags),
          body: state.body.trim(),
          toolsBody: state.toolsBody.trim(),
          referencesBody: state.referencesBody.trim(),
          examplesBody: state.examplesBody.trim(),
        });
        new Notice(`Skill "${slug}" created.`);
        await this.plugin.refreshFromVault();
        this.navigate("skills");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to create skill: ${msg}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Edit Agent Page
  // ═══════════════════════════════════════════════════════

  private renderEditAgentPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    const agentName = this.detailContext;
    if (!agentName) {
      this.renderEmptyState(page, "bot", "No agent selected", "");
      return;
    }

    const agent = this.plugin.runtime.getSnapshot().agents.find((a) => a.name === agentName);
    if (!agent) {
      this.renderEmptyState(page, "bot", "Agent not found", `Agent "${agentName}" was not found`);
      return;
    }

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatarEl = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(avatarEl, "edit");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: `Edit Agent: ${agent.name}` });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Modify agent configuration" });

    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });
    // Form state pre-filled
    const state = {
      name: agent.name,
      description: agent.description ?? "",
      avatar: agent.avatar,
      tags: agent.tags.join(", "),
      systemPrompt: agent.body,
      model: agent.model,
      adapter: agent.adapter,
      cwd: agent.cwd ?? "",
      timeout: agent.timeout,
      permissionMode: agent.permissionMode,
      effort: agent.effort ?? "",
      selectedSkills: new Set<string>(agent.skills),
      selectedMcpServers: new Set<string>(agent.mcpServers ?? []),
      skillsBody: agent.skillsBody,
      contextBody: agent.contextBody,
      approvalRequired: agent.approvalRequired.join(", "),
      memory: agent.memory,
      memoryTokenBudget: agent.memoryTokenBudget,
      reflectionEnabled: agent.reflection.enabled,
      reflectionProposeSkills: agent.reflection.proposeSkills,
      enabled: agent.enabled,
      allowedCommands: agent.permissionRules.allow.join("\n"),
      blockedCommands: agent.permissionRules.deny.join("\n"),
      heartbeatEnabled: agent.heartbeatEnabled,
      heartbeatSchedule: agent.heartbeatSchedule,
      heartbeatBody: agent.heartbeatBody,
      heartbeatNotify: agent.heartbeatNotify,
      heartbeatChannel: agent.heartbeatChannel,
      autoCompactThreshold: agent.autoCompactThreshold ?? 85,
      wikiReferences: (agent.wikiReferences ?? []).map((r) => r.agent),
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Identity Section ───
    const identitySection = form.createDiv({ cls: "af-create-section" });
    const identityHeader = identitySection.createDiv({ cls: "af-create-section-header" });
    const identityIcon = identityHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(identityIcon, "user");
    identityHeader.createSpan({ text: "Identity" });

    // Name (read-only for edit)
    const nameRow = identitySection.createDiv({ cls: "af-form-row" });
    nameRow.createDiv({ cls: "af-form-label", text: "Name" });
    const nameInput = nameRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", value: agent.name, disabled: "true" },
    });
    nameInput.setCssStyles({ opacity: "0.6" });

    this.createFormField(identitySection, "Description", "Monitors deployments and reports status", "", (v) => { state.description = v; }, agent.description ?? "");

    const avatarRow = identitySection.createDiv({ cls: "af-form-row" });
    avatarRow.createDiv({ cls: "af-form-label", text: "Avatar" });
    const avatarPickerBtn = avatarRow.createEl("button", { cls: "af-avatar-picker-btn" });
    const avatarPreview = avatarPickerBtn.createDiv({ cls: "af-avatar-picker-preview" });
    this.renderAgentAvatar(avatarPreview, { ...agent, avatar: state.avatar ?? agent.avatar });
    avatarPickerBtn.createSpan({ cls: "af-avatar-picker-label", text: state.avatar || agent.avatar || "Pick icon…" });
    avatarPickerBtn.addEventListener("click", () => {
      new IconPickerModal(this.app, state.avatar ?? agent.avatar, (iconName) => {
        state.avatar = iconName;
        avatarPreview.empty();
        setIcon(avatarPreview, iconName);
        avatarPickerBtn.querySelector(".af-avatar-picker-label")?.setText(iconName);
      }).open();
    });

    this.createFormField(identitySection, "Tags", "devops, monitoring", "Comma-separated", (v) => { state.tags = v; }, agent.tags.join(", "));

    // ─── Enabled Toggle ───
    const enabledRow = identitySection.createDiv({ cls: "af-form-row" });
    enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
    const enabledToggle = enabledRow.createDiv({ cls: `af-agent-card-toggle${agent.enabled ? " on" : ""}` });
    enabledToggle.onclick = () => {
      const isOn = enabledToggle.hasClass("on");
      enabledToggle.toggleClass("on", !isOn);
      state.enabled = !isOn;
    };

    // ─── System Prompt Section ───
    const promptSection = form.createDiv({ cls: "af-create-section" });
    const promptHeader = promptSection.createDiv({ cls: "af-create-section-header" });
    const promptIcon = promptHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(promptIcon, "message-square");
    promptHeader.createSpan({ text: "System Prompt" });

    const promptTextarea = promptSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "System prompt...", rows: "10" },
    });
    promptTextarea.value = agent.body;
    promptTextarea.addEventListener("input", () => { state.systemPrompt = promptTextarea.value; });

    // ─── Runtime Config Section ───
    const configSection = form.createDiv({ cls: "af-create-section" });
    const configHeader = configSection.createDiv({ cls: "af-create-section-header" });
    const configIcon = configHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(configIcon, "settings");
    configHeader.createSpan({ text: "Runtime Config" });

    const configGrid = configSection.createDiv({ cls: "af-create-config-grid" });

    // Adapter (before model)
    const adapterRow = configGrid.createDiv({ cls: "af-form-row" });
    adapterRow.createDiv({ cls: "af-form-label", text: "Adapter" });
    const adapterSelect = adapterRow.createEl("select", { cls: "af-form-select" });
    for (const [val, lbl, disabled] of ADAPTER_FORM_OPTIONS) {
      const opt = adapterSelect.createEl("option", { text: lbl, attr: { value: val, ...(disabled ? { disabled: "true" } : {}) } });
      if (val === agent.adapter || (isCodexAdapterValue(agent.adapter) && val === "codex")) opt.selected = true;
    }

    // Model
    const modelRow = configGrid.createDiv({ cls: "af-form-row" });
    const modelLabel = modelRow.createDiv({ cls: "af-form-label", text: "Model" });
    this.addTooltip(
      modelLabel,
      `Aliases (opus/sonnet/haiku/opusplan) work on any backend. Choose Custom\u2026 for a pinned ID or Bedrock/Vertex/Foundry. Blank = use Settings default (${this.plugin.settings.defaultModel || "CLI default"}).`,
    );
    const modelFieldWrap = modelRow.createDiv({ cls: "af-form-field-wrap" });
    const renderEditModelField = () => {
      renderModelPicker(modelFieldWrap, {
        value: state.model,
        adapter: state.adapter,
        onChange: (value) => { state.model = value; },
      });
    };
    renderEditModelField();

    let repopulateEditPermModeSelect: () => void = () => { /* assigned below */ };

    adapterSelect.addEventListener("change", () => {
      state.adapter = adapterSelect.value;
      const otherAliases = isCodexAdapterValue(state.adapter) ? MODEL_ALIASES : CODEX_MODEL_ALIASES;
      if (otherAliases.some((a) => a.value === state.model.trim())) {
        state.model = "";
      }
      renderEditModelField();
      state.permissionMode = permModeForAdapter(state.permissionMode, state.adapter);
      repopulateEditPermModeSelect();
    });

    // Working Dir
    const cwdRow = configGrid.createDiv({ cls: "af-form-row" });
    cwdRow.createDiv({ cls: "af-form-label", text: "Working Dir" });
    const cwdInput = cwdRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", placeholder: "Leave empty for vault root", value: agent.cwd ?? "" },
    });
    cwdInput.addEventListener("input", () => { state.cwd = cwdInput.value; });

    // Timeout
    const timeoutRow = configGrid.createDiv({ cls: "af-form-row" });
    timeoutRow.createDiv({ cls: "af-form-label", text: "Timeout (sec)" });
    const timeoutInput = timeoutRow.createEl("input", {
      cls: "af-form-input af-form-input-sm",
      attr: { type: "number", value: String(agent.timeout) },
    });
    timeoutInput.addEventListener("input", () => {
      const n = parseInt(timeoutInput.value, 10);
      if (!isNaN(n) && n > 0) state.timeout = n;
    });

    // Permission Mode (options depend on the selected adapter)
    const permRow = configGrid.createDiv({ cls: "af-form-row" });
    permRow.createDiv({ cls: "af-form-label", text: "Permission Mode" });
    const permSelect = permRow.createEl("select", { cls: "af-form-select" });
    const editPermDescEl = configGrid.createDiv({ cls: "af-form-hint", text: "" });
    repopulateEditPermModeSelect = () => {
      // Snap any value left over from the other adapter family to its
      // nearest equivalent so the dropdown always reflects what gets saved.
      state.permissionMode = permModeForAdapter(state.permissionMode, state.adapter);
      const options = permModeOptionsFor(state.adapter);
      permSelect.empty();
      for (const [val, lbl] of options) {
        const opt = permSelect.createEl("option", { text: lbl, attr: { value: val } });
        if (val === state.permissionMode) opt.selected = true;
      }
      editPermDescEl.textContent = options.find(([v]) => v === permSelect.value)?.[2] ?? "";
    };
    repopulateEditPermModeSelect();
    permSelect.addEventListener("change", () => {
      state.permissionMode = permSelect.value;
      editPermDescEl.textContent = permModeOptionsFor(state.adapter).find(([v]) => v === permSelect.value)?.[2] ?? "";
    });

    // Effort Level
    const editEffortRow = configGrid.createDiv({ cls: "af-form-row" });
    editEffortRow.createDiv({ cls: "af-form-label", text: "Effort Level" });
    const editEffortSelect = editEffortRow.createEl("select", { cls: "af-form-select" });
    for (const [val, lbl] of [["", "Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["max", "Max"]] as const) {
      const opt = editEffortSelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === (agent.effort ?? "")) opt.selected = true;
    }
    editEffortSelect.addEventListener("change", () => { state.effort = editEffortSelect.value; });
    configGrid.createDiv({ cls: "af-form-hint", text: "Controls reasoning depth — low is fast, max is most thorough" });

    // Auto-compact threshold
    const editCompactRow = configGrid.createDiv({ cls: "af-form-row" });
    const editCompactLabel = editCompactRow.createDiv({ cls: "af-form-label", text: "Auto-compact at" });
    this.addTooltip(
      editCompactLabel,
      "Percent of context window at which the chat auto-invokes /compact before the next message. 85% is a good default. Set 0 to disable.",
    );
    const editCompactInput = editCompactRow.createEl("input", {
      cls: "af-form-input af-form-input-sm",
      attr: { type: "number", min: "0", max: "100", value: String(state.autoCompactThreshold) },
    });
    editCompactInput.addEventListener("input", () => {
      const n = parseInt(editCompactInput.value, 10);
      if (!isNaN(n) && n >= 0 && n <= 100) state.autoCompactThreshold = n;
    });
    configGrid.createDiv({ cls: "af-form-hint", text: "0 disables auto-compact" });

    // Wiki references
    {
      const wikiKeepers = this.plugin.runtime.getSnapshot().agents.filter((a) => a.wikiKeeper !== undefined);
      if (wikiKeepers.length > 0) {
        const wrRow = configGrid.createDiv({ cls: "af-form-row af-form-row-toggle" });
        const wrLabel = wrRow.createDiv({ cls: "af-form-label", text: "Wiki access" });
        this.addTooltip(
          wrLabel,
          "Lets this agent read + cite from the selected Wiki Keeper scopes (requires the wiki-query skill).",
        );
        const wrWrap = wrRow.createDiv({ cls: "af-form-field-wrap" });
        for (const wk of wikiKeepers) {
          const label = wrWrap.createEl("label", { cls: "af-form-checkbox-row" });
          const cb = label.createEl("input", { attr: { type: "checkbox" } });
          if (state.wikiReferences.includes(wk.name)) cb.checked = true;
          label.createSpan({ text: ` ${wk.name}`, cls: "af-form-checkbox-label" });
          cb.addEventListener("change", () => {
            if (cb.checked) {
              if (!state.wikiReferences.includes(wk.name)) state.wikiReferences.push(wk.name);
            } else {
              state.wikiReferences = state.wikiReferences.filter((n) => n !== wk.name);
            }
          });
        }
      }
    }

    // ─── Heartbeat Section ───
    if (agent.isFolder) {
      const heartbeatSection = form.createDiv({ cls: "af-create-section" });
      const heartbeatHeader = heartbeatSection.createDiv({ cls: "af-create-section-header" });
      const heartbeatIcon = heartbeatHeader.createSpan({ cls: "af-create-section-icon" });
      setIcon(heartbeatIcon, "heart-pulse");
      const heartbeatHeaderLabel = heartbeatHeader.createSpan({ text: "Heartbeat" });
      this.addTooltip(heartbeatHeaderLabel, "Autonomous periodic run — what the agent does when no one is asking");

      const hbEnabledRow = heartbeatSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
      hbEnabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
      const hbEnabledToggle = hbEnabledRow.createDiv({ cls: `af-agent-card-toggle${state.heartbeatEnabled ? " on" : ""}` });
      const hbBody = heartbeatSection.createDiv();
      hbBody.setCssStyles({ display: state.heartbeatEnabled ? "" : "none" });
      hbEnabledToggle.onclick = () => {
        const isOn = hbEnabledToggle.hasClass("on");
        hbEnabledToggle.toggleClass("on", !isOn);
        state.heartbeatEnabled = !isOn;
        hbBody.setCssStyles({ display: !isOn ? "" : "none" });
      };

      this.renderHeartbeatSchedule(hbBody, state);

      const hbNotifyRow = hbBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
      const hbNotifyLabel = hbNotifyRow.createDiv({ cls: "af-form-label" });
      hbNotifyLabel.setText("Notify");
      this.addTooltip(hbNotifyLabel, "Show an Obsidian notice when the heartbeat completes");
      const hbNotifyToggle = hbNotifyRow.createDiv({ cls: `af-agent-card-toggle${state.heartbeatNotify ? " on" : ""}` });
      hbNotifyToggle.onclick = () => {
        const isOn = hbNotifyToggle.hasClass("on");
        hbNotifyToggle.toggleClass("on", !isOn);
        state.heartbeatNotify = !isOn;
      };

      const editSnapshot = this.plugin.runtime.getSnapshot();
      const hbChannelRow = hbBody.createDiv({ cls: "af-form-row" });
      const hbChannelLabel = hbChannelRow.createDiv({ cls: "af-form-label" });
      hbChannelLabel.setText("Post to channel");
      this.addTooltip(hbChannelLabel, "Heartbeat results are posted to this Slack channel when the run completes");
      const hbChannelSelect = hbChannelRow.createEl("select", { cls: "af-form-select" });
      hbChannelSelect.createEl("option", { text: "(none)", attr: { value: "" } });
      for (const ch of editSnapshot.channels) {
        const opt = hbChannelSelect.createEl("option", { text: ch.name, attr: { value: ch.name } });
        if (ch.name === state.heartbeatChannel) opt.selected = true;
      }
      hbChannelSelect.addEventListener("change", () => { state.heartbeatChannel = hbChannelSelect.value; });

      const hbInstructionLabel = hbBody.createDiv({ cls: "af-form-label" });
      hbInstructionLabel.setCssStyles({ width: "auto" });
      hbInstructionLabel.setCssStyles({ marginTop: "12px" });
      hbInstructionLabel.setText("Instruction");
      this.addTooltip(hbInstructionLabel, "What the agent does on each heartbeat. Also used by the \"Run Now\" button.");
      const hbTextarea = hbBody.createEl("textarea", {
        cls: "af-create-prompt-textarea",
        attr: { placeholder: "Check status, scan for issues, report findings...", rows: "8" },
      });
      hbTextarea.value = state.heartbeatBody;
      hbTextarea.addEventListener("input", () => { state.heartbeatBody = hbTextarea.value; });
    }

    // ─── Skills Section ───
    const skillsSection = form.createDiv({ cls: "af-create-section" });
    const skillsHeader = skillsSection.createDiv({ cls: "af-create-section-header" });
    const skillsIcon = skillsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(skillsIcon, "puzzle");
    skillsHeader.createSpan({ text: "Skills" });

    const snapshot = this.plugin.runtime.getSnapshot();
    if (snapshot.skills.length > 0) {
      skillsSection.createDiv({ cls: "af-form-sublabel", text: "Shared Skills" });
      const skillsGrid = skillsSection.createDiv({ cls: "af-create-skills-grid" });
      for (const skill of snapshot.skills) {
        const item = skillsGrid.createDiv({ cls: "af-create-skill-item" });
        const cb = item.createEl("input", { cls: "af-form-toggle", attr: { type: "checkbox" } });
        cb.checked = state.selectedSkills.has(skill.name);
        cb.addEventListener("change", () => {
          if (cb.checked) state.selectedSkills.add(skill.name);
          else state.selectedSkills.delete(skill.name);
        });
        const lbl = item.createDiv({ cls: "af-create-skill-label" });
        lbl.createSpan({ cls: "af-create-skill-name", text: skill.name });
        if (skill.description) {
          lbl.createSpan({ cls: "af-create-skill-desc", text: ` — ${skill.description}` });
        }
      }
    }

    const agentSkillsLabel = skillsSection.createDiv({ cls: "af-form-sublabel" });
    agentSkillsLabel.setText("Agent-specific skills");
    this.addTooltip(agentSkillsLabel, "Custom skills/instructions only for this agent, not shared with others");
    const skillsTextarea = skillsSection.createEl("textarea", {
      cls: "af-create-textarea",
      attr: { placeholder: "Custom skills/instructions for this agent...", rows: "4" },
    });
    skillsTextarea.value = agent.skillsBody;
    skillsTextarea.addEventListener("input", () => { state.skillsBody = skillsTextarea.value; });

    // ─── MCP Servers Section ───
    const mcpSection = form.createDiv({ cls: "af-create-section" });
    const mcpHeader = mcpSection.createDiv({ cls: "af-create-section-header" });
    const mcpIcon = mcpHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(mcpIcon, "plug");
    const editMcpHeaderLabel = mcpHeader.createSpan({ text: "MCP Servers" });
    this.addTooltip(editMcpHeaderLabel, "Grant agent access to MCP servers");
    this.renderAgentMcpPicker(mcpSection, state.selectedMcpServers);

    // ─── Context Section ───
    const contextSection = form.createDiv({ cls: "af-create-section" });
    const contextHeader = contextSection.createDiv({ cls: "af-create-section-header" });
    const contextIcon = contextHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(contextIcon, "file-text");
    const contextHeaderLabel = contextHeader.createSpan({ text: "Context" });
    this.addTooltip(contextHeaderLabel, "Project-specific context included in every run");
    const contextTextarea = contextSection.createEl("textarea", {
      cls: "af-create-textarea",
      attr: { placeholder: "Background info, repo structure, conventions...", rows: "4" },
    });
    contextTextarea.value = agent.contextBody;
    contextTextarea.addEventListener("input", () => { state.contextBody = contextTextarea.value; });

    // ─── Permissions Section ───
    const permsSection = form.createDiv({ cls: "af-create-section" });
    const permsHeader = permsSection.createDiv({ cls: "af-create-section-header" });
    const permsIcon = permsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(permsIcon, "shield-check");
    permsHeader.createSpan({ text: "Permissions" });

    this.createFormField(permsSection, "Approval required", "git_push, file_delete", "Comma-separated tool names", (v) => { state.approvalRequired = v; }, agent.approvalRequired.join(", "));

    const editAllowRow = permsSection.createDiv({ cls: "af-form-row" });
    editAllowRow.createDiv({ cls: "af-form-label", text: "Allowed Commands" });
    const editAllowTextarea = editAllowRow.createEl("textarea", {
      cls: "af-create-textarea",
      attr: { placeholder: "Bash(curl *)\nBash(python3 *)\nRead\nEdit\nWrite", rows: "4" },
    });
    editAllowTextarea.value = agent.permissionRules.allow.join("\n");
    editAllowTextarea.addEventListener("input", () => { state.allowedCommands = editAllowTextarea.value; });

    const editDenyRow = permsSection.createDiv({ cls: "af-form-row" });
    editDenyRow.createDiv({ cls: "af-form-label", text: "Blocked Commands" });
    const editDenyTextarea = editDenyRow.createEl("textarea", {
      cls: "af-create-textarea",
      attr: { placeholder: "Bash(git push *)\nBash(rm -rf *)\nBash(sudo *)", rows: "4" },
    });
    editDenyTextarea.value = agent.permissionRules.deny.join("\n");
    editDenyTextarea.addEventListener("input", () => { state.blockedCommands = editDenyTextarea.value; });

    permsSection.createDiv({
      cls: "af-form-hint",
      text:
        "On Codex agents these become execpolicy command rules — only Bash(cmd args *) " +
        "prefixes are enforced; tool-name rules (Read/Write) and mid-pattern wildcards are " +
        "ignored, and file/network access is governed by Permission Mode (the sandbox).",
    });

    const memoryRow = permsSection.createDiv({ cls: "af-form-row" });
    memoryRow.createDiv({ cls: "af-form-label", text: "Memory enabled" });
    const memoryToggle = memoryRow.createDiv({ cls: `af-agent-card-toggle${agent.memory ? " on" : ""}` });
    memoryToggle.onclick = () => {
      const isOn = memoryToggle.hasClass("on");
      memoryToggle.toggleClass("on", !isOn);
      state.memory = !isOn;
    };

    const budgetRow = permsSection.createDiv({ cls: "af-form-row" });
    budgetRow.createDiv({ cls: "af-form-label", text: "Memory token budget" });
    const budgetInput = budgetRow.createEl("input", {
      cls: "af-create-input",
      attr: { type: "number", min: "200", step: "100" },
    });
    budgetInput.value = String(state.memoryTokenBudget);
    budgetInput.addEventListener("input", () => {
      const v = parseInt(budgetInput.value, 10);
      if (Number.isFinite(v)) state.memoryTokenBudget = v;
    });

    const reflectRow = permsSection.createDiv({ cls: "af-form-row" });
    reflectRow.createDiv({ cls: "af-form-label", text: "Nightly reflection" });
    const reflectToggle = reflectRow.createDiv({
      cls: `af-agent-card-toggle${agent.reflection.enabled ? " on" : ""}`,
    });
    reflectToggle.onclick = () => {
      const isOn = reflectToggle.hasClass("on");
      reflectToggle.toggleClass("on", !isOn);
      state.reflectionEnabled = !isOn;
    };

    const proposeRow = permsSection.createDiv({ cls: "af-form-row" });
    proposeRow.createDiv({ cls: "af-form-label", text: "Propose skills from memory" });
    const proposeToggle = proposeRow.createDiv({
      cls: `af-agent-card-toggle${agent.reflection.proposeSkills ? " on" : ""}`,
    });
    proposeToggle.onclick = () => {
      const isOn = proposeToggle.hasClass("on");
      proposeToggle.toggleClass("on", !isOn);
      state.reflectionProposeSkills = !isOn;
    };

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });

    const deleteBtn = footer.createEl("button", { cls: "af-btn-sm danger" });
    createIcon(deleteBtn, "trash-2", "af-btn-icon");
    deleteBtn.appendText(" Delete");
    deleteBtn.onclick = () => void this.plugin.deleteAgent(agent.name);

    footer.createDiv({ cls: "af-toolbar-spacer" });

    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("agent-detail", agent.name);

    const saveBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(saveBtn, "check", "af-btn-icon");
    saveBtn.appendText(" Save Changes");
    saveBtn.onclick = async () => {
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      try {
        const parseLines = (s: string) => splitLines(s).map((l) => l.trim()).filter(Boolean);
        await this.plugin.repository.updateAgent(agent.name, {
          description: state.description.trim(),
          avatar: state.avatar.trim(),
          tags: parseTags(state.tags),
          systemPrompt: state.systemPrompt.trim(),
          model: state.model.trim() || "default",
          adapter: state.adapter,
          cwd: state.cwd.trim(),
          timeout: state.timeout,
          permissionMode: state.permissionMode,
          effort: state.effort || undefined,
          approvalRequired: parseTags(state.approvalRequired),
          memory: state.memory,
          memoryTokenBudget: state.memoryTokenBudget,
          reflectionEnabled: state.reflectionEnabled,
          reflectionProposeSkills: state.reflectionProposeSkills,
          skills: Array.from(state.selectedSkills),
          mcpServers: Array.from(state.selectedMcpServers),
          skillsBody: state.skillsBody.trim(),
          contextBody: state.contextBody.trim(),
          enabled: state.enabled,
          permissionRules: {
            allow: parseLines(state.allowedCommands),
            deny: parseLines(state.blockedCommands),
          },
          autoCompactThreshold: state.autoCompactThreshold,
          wikiReferences: state.wikiReferences,
        });
        // Persist heartbeat separately (lives in HEARTBEAT.md, not agent.md/config.md)
        if (agent.isFolder) {
          await this.plugin.repository.updateHeartbeat(agent.name, {
            enabled: state.heartbeatEnabled,
            schedule: state.heartbeatSchedule.trim(),
            notify: state.heartbeatNotify,
            channel: state.heartbeatChannel,
            body: state.heartbeatBody.trim(),
          });
        }

        new Notice(`Agent "${agent.name}" updated.`);
        await this.plugin.refreshFromVault();
        this.navigate("agent-detail", agent.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to update agent: ${msg}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Create Task Page
  // ═══════════════════════════════════════════════════════

  private renderCreateTaskPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    const snapshot = this.plugin.runtime.getSnapshot();

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(avatar, "plus");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: "Create New Task" });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Configure a new task for your fleet" });

    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

    // Form state
    const state = {
      title: "",
      agent: snapshot.agents[0]?.name ?? "",
      priority: "medium",
      tags: "",
      body: "",
      scheduleEnabled: false,
      /** "recurring" (cron) or "once" (run_at). Only consulted when
       *  scheduleEnabled is true; otherwise the task is "immediate". */
      scheduleMode: "recurring" as "recurring" | "once",
      schedule: "0 9 * * *",
      runAt: "",
      type: "immediate" as string,
      enabled: true,
      catchUp: true,
      effort: "",
      model: "",
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Task Details Section ───
    const detailsSection = form.createDiv({ cls: "af-create-section" });
    const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
    const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(detailsIcon, "file-text");
    detailsHeader.createSpan({ text: "Task Details" });

    this.createFormField(detailsSection, "Title", "Daily status report", "Used as the task identifier", (v) => { state.title = v; });

    // Agent dropdown
    const agentRow = detailsSection.createDiv({ cls: "af-form-row" });
    agentRow.createDiv({ cls: "af-form-label", text: "Agent" });
    const agentSelect = agentRow.createEl("select", { cls: "af-form-select" });
    for (const a of snapshot.agents) {
      agentSelect.createEl("option", { text: a.name, attr: { value: a.name } });
    }
    agentSelect.addEventListener("change", () => { state.agent = agentSelect.value; });

    // Priority dropdown
    const priorityRow = detailsSection.createDiv({ cls: "af-form-row" });
    priorityRow.createDiv({ cls: "af-form-label", text: "Priority" });
    const prioritySelect = priorityRow.createEl("select", { cls: "af-form-select" });
    const priorityOptions: Array<[string, string]> = [
      ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"],
    ];
    for (const [val, lbl] of priorityOptions) {
      const opt = prioritySelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === "medium") opt.selected = true;
    }
    prioritySelect.addEventListener("change", () => { state.priority = prioritySelect.value; });

    // Tags
    this.createFormField(detailsSection, "Tags", "monitoring, devops", "Comma-separated", (v) => { state.tags = v; });

    // ─── Instructions Section ───
    const instructionsSection = form.createDiv({ cls: "af-create-section" });
    const instructionsHeader = instructionsSection.createDiv({ cls: "af-create-section-header" });
    const instructionsIcon = instructionsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(instructionsIcon, "message-square");
    instructionsHeader.createSpan({ text: "Instructions" });

    const instructionsTextarea = instructionsSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "Describe what the agent should do...", rows: "10" },
    });
    instructionsTextarea.addEventListener("input", () => { state.body = instructionsTextarea.value; });

    // ─── Schedule Section ───
    const scheduleSection = form.createDiv({ cls: "af-create-section" });
    const scheduleHeader = scheduleSection.createDiv({ cls: "af-create-section-header" });
    const scheduleIcon = scheduleHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(scheduleIcon, "clock");
    scheduleHeader.createSpan({ text: "Schedule" });

    // Enable schedule toggle
    const scheduleToggleRow = scheduleSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    scheduleToggleRow.createDiv({ cls: "af-form-label", text: "Enable schedule" });
    const scheduleToggle = scheduleToggleRow.createDiv({ cls: "af-agent-card-toggle" });
    const scheduleBody = scheduleSection.createDiv({ cls: "af-schedule-body" });
    scheduleBody.setCssStyles({ display: "none" });

    scheduleToggle.onclick = () => {
      const isOn = scheduleToggle.hasClass("on");
      scheduleToggle.toggleClass("on", !isOn);
      state.scheduleEnabled = !isOn;
      scheduleBody.setCssStyles({ display: !isOn ? "" : "none" });
      if (!isOn) {
        state.type = state.scheduleMode === "once" ? "once" : "recurring";
      } else {
        state.type = "immediate";
      }
    };

    // Schedule mode selector (recurring vs one-time)
    const modeRow = scheduleBody.createDiv({ cls: "af-form-row" });
    modeRow.createDiv({ cls: "af-form-label", text: "Mode" });
    const modeSelect = modeRow.createEl("select", { cls: "af-form-select" });
    for (const [val, lbl] of [["recurring", "Recurring"], ["once", "One-time"]] as const) {
      modeSelect.createEl("option", { text: lbl, attr: { value: val } });
    }
    const cronHost = scheduleBody.createDiv();
    const onceHost = scheduleBody.createDiv();
    onceHost.setCssStyles({ display: "none" });
    this.renderInlineSchedule(cronHost, state);

    const onceRow = onceHost.createDiv({ cls: "af-form-row" });
    onceRow.createDiv({ cls: "af-form-label", text: "Run at" });
    const onceInput = onceRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "datetime-local", value: this.toDatetimeLocal(new Date(Date.now() + 3600_000)) },
    });
    // Seed the initial value — the task won't persist blank runAt
    state.runAt = new Date(onceInput.value).toISOString();
    onceInput.addEventListener("input", () => {
      state.runAt = onceInput.value ? new Date(onceInput.value).toISOString() : "";
    });

    modeSelect.addEventListener("change", () => {
      state.scheduleMode = modeSelect.value as "recurring" | "once";
      cronHost.setCssStyles({ display: state.scheduleMode === "recurring" ? "" : "none" });
      onceHost.setCssStyles({ display: state.scheduleMode === "once" ? "" : "none" });
      if (state.scheduleEnabled) state.type = state.scheduleMode === "once" ? "once" : "recurring";
    });

    // Enabled toggle (only when schedule is on)
    const enabledRow = scheduleBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
    enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
    const enabledToggle = enabledRow.createDiv({ cls: "af-agent-card-toggle on" });
    enabledToggle.onclick = () => {
      const isOn = enabledToggle.hasClass("on");
      enabledToggle.toggleClass("on", !isOn);
      state.enabled = !isOn;
    };

    // Catch up missed runs toggle
    const catchUpRow = scheduleBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
    const catchUpLabel = catchUpRow.createDiv({ cls: "af-form-label" });
    catchUpLabel.setText("Catch up if missed");
    
    const catchUpToggle = catchUpRow.createDiv({ cls: `af-agent-card-toggle${state.catchUp ? " on" : ""}` });
    catchUpToggle.onclick = () => {
      const isOn = catchUpToggle.hasClass("on");
      catchUpToggle.toggleClass("on", !isOn);
      state.catchUp = !isOn;
    };

    // ─── Execution Section ───
    // Model & effort are per-run controls, not scheduling knobs — they apply
    // whether or not the task has a schedule, so they live in their own section.
    const execSection = form.createDiv({ cls: "af-create-section" });
    const execHeader = execSection.createDiv({ cls: "af-create-section-header" });
    const execIcon = execHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(execIcon, "gauge");
    execHeader.createSpan({ text: "Execution" });

    // Model override (per-task)
    const taskModelRow = execSection.createDiv({ cls: "af-form-row" });
    const taskModelLabel = taskModelRow.createDiv({ cls: "af-form-label", text: "Model" });
    const taskModelFieldWrap = taskModelRow.createDiv({ cls: "af-form-field-wrap" });
    const renderCreateTaskModelPicker = (agentName: string) => {
      taskModelFieldWrap.empty();
      const selAgent = snapshot.agents.find((a) => a.name === agentName);
      renderModelPicker(taskModelFieldWrap, {
        value: state.model,
        adapter: selAgent?.adapter,
        onChange: (value) => { state.model = value; },
        allowInherit: true,
        inheritPlaceholder: selAgent
          ? `Inherit from ${selAgent.name}${selAgent.model ? ` (${selAgent.model})` : ""}`
          : "Inherit from agent",
      });
    };
    renderCreateTaskModelPicker(state.agent);
    agentSelect.addEventListener("change", () => renderCreateTaskModelPicker(agentSelect.value));
    this.addTooltip(
      taskModelLabel,
      "Override the agent\u2019s model for this task only. Useful for routing simple runs to haiku while the agent stays on opus for heavier work.",
    );

    // Effort level
    const taskEffortRow = execSection.createDiv({ cls: "af-form-row" });
    const taskEffortLabel = taskEffortRow.createDiv({ cls: "af-form-label", text: "Effort" });
    const taskEffortSelect = taskEffortRow.createEl("select", { cls: "af-form-select" });
    for (const [val, lbl] of [["", "Agent Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["max", "Max"]] as const) {
      const opt = taskEffortSelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === state.effort) opt.selected = true;
    }
    taskEffortSelect.addEventListener("change", () => { state.effort = taskEffortSelect.value; });
    this.addTooltip(
      taskEffortLabel,
      "Overrides the agent\u2019s effort level for this task. Higher effort = more thinking tokens spent.",
    );

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });
    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("kanban");

    const createBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(createBtn, "plus", "af-btn-icon");
    createBtn.appendText(" Create Task");
    createBtn.onclick = async () => {
      const title = state.title.trim();
      if (!title) {
        new Notice("Task title is required.");
        return;
      }
      const taskId = slugify(title);
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

      const effectiveType = state.scheduleEnabled
        ? state.scheduleMode === "once"
          ? "once"
          : "recurring"
        : "immediate";

      const frontmatter: Record<string, unknown> = {
        task_id: taskId,
        agent: state.agent,
        type: effectiveType,
        priority: state.priority,
        enabled: state.enabled,
        created: this.toLocalISO(new Date()),
        run_count: 0,
        catch_up: state.catchUp,
        effort: state.effort || undefined,
        model: state.model || undefined,
        tags: parseTags(state.tags),
      };

      if (effectiveType === "recurring") {
        frontmatter.schedule = state.schedule.trim() || "0 9 * * *";
      } else if (effectiveType === "once") {
        if (!state.runAt) {
          new Notice("Pick a date/time for the one-time run.");
          return;
        }
        frontmatter.run_at = state.runAt;
      }

      try {
        const path = await this.plugin.repository.getAvailablePath(
          this.plugin.repository.getSubfolder("tasks"),
          taskId,
        );
        await this.plugin.app.vault.create(
          path,
          stringifyMarkdownWithFrontmatter(frontmatter, state.body.trim() || "Describe the task here."),
        );
        new Notice(`Task "${taskId}" created.`);
        await this.plugin.refreshFromVault();
        this.navigate("task-detail", taskId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to create task: ${msg}`);
      }
    };
  }

  private toLocalISO(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  /** Format a Date as the value string accepted by `<input type="datetime-local">`:
   *  `YYYY-MM-DDTHH:mm`, local timezone, no seconds. */
  private toDatetimeLocal(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ═══════════════════════════════════════════════════════
  //  Edit Task Page
  // ═══════════════════════════════════════════════════════

  private renderEditTaskPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    const taskId = this.detailContext;
    if (!taskId) {
      this.renderEmptyState(page, "circle-dot", "No task selected", "");
      return;
    }

    const task = this.plugin.runtime.getSnapshot().tasks.find((t) => t.taskId === taskId);
    if (!task) {
      this.renderEmptyState(page, "circle-dot", "Task not found", `Task "${taskId}" was not found`);
      return;
    }

    const snapshot = this.plugin.runtime.getSnapshot();

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const taskIcon = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(taskIcon, "edit");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: `Edit Task: ${task.taskId}` });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Modify task configuration" });

    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

    const hasSchedule = !!(task.schedule || task.runAt);

    // Form state pre-filled
    const state = {
      agent: task.agent,
      type: task.type as string,
      priority: task.priority,
      schedule: task.schedule ?? "0 9 * * *",
      runAt: task.runAt ?? "",
      scheduleEnabled: hasSchedule,
      scheduleMode: (task.type === "once" ? "once" : "recurring"),
      enabled: task.enabled,
      catchUp: task.catchUp,
      effort: task.effort ?? "",
      model: task.model ?? "",
      tags: task.tags.join(", "),
      body: task.body,
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Task Details Section ───
    const detailsSection = form.createDiv({ cls: "af-create-section" });
    const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
    const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(detailsIcon, "file-text");
    detailsHeader.createSpan({ text: "Task Details" });

    // Title (read-only)
    const nameRow = detailsSection.createDiv({ cls: "af-form-row" });
    nameRow.createDiv({ cls: "af-form-label", text: "Title" });
    const nameInput = nameRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", value: task.taskId, disabled: "true" },
    });
    nameInput.setCssStyles({ opacity: "0.6" });

    // Agent dropdown
    const agentRow = detailsSection.createDiv({ cls: "af-form-row" });
    agentRow.createDiv({ cls: "af-form-label", text: "Agent" });
    const agentSelect = agentRow.createEl("select", { cls: "af-form-select" });
    for (const a of snapshot.agents) {
      const opt = agentSelect.createEl("option", { text: a.name, attr: { value: a.name } });
      if (a.name === task.agent) opt.selected = true;
    }
    agentSelect.addEventListener("change", () => { state.agent = agentSelect.value; });

    // Priority dropdown
    const priorityRow = detailsSection.createDiv({ cls: "af-form-row" });
    priorityRow.createDiv({ cls: "af-form-label", text: "Priority" });
    const prioritySelect = priorityRow.createEl("select", { cls: "af-form-select" });
    const priorityOptions: Array<[string, string]> = [
      ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"],
    ];
    for (const [val, lbl] of priorityOptions) {
      const opt = prioritySelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === task.priority) opt.selected = true;
    }
    prioritySelect.addEventListener("change", () => { state.priority = prioritySelect.value as typeof state.priority; });

    // Tags
    this.createFormField(detailsSection, "Tags", "monitoring, critical", "Comma-separated", (v) => { state.tags = v; }, task.tags.join(", "));

    // ─── Instructions Section ───
    const instructionsSection = form.createDiv({ cls: "af-create-section" });
    const instructionsHeader = instructionsSection.createDiv({ cls: "af-create-section-header" });
    const instructionsIcon = instructionsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(instructionsIcon, "message-square");
    instructionsHeader.createSpan({ text: "Instructions" });

    const instructionsTextarea = instructionsSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "Describe what the agent should do...", rows: "10" },
    });
    instructionsTextarea.value = task.body;
    instructionsTextarea.addEventListener("input", () => { state.body = instructionsTextarea.value; });

    // ─── Schedule Section ───
    const scheduleSection = form.createDiv({ cls: "af-create-section" });
    const scheduleHeader = scheduleSection.createDiv({ cls: "af-create-section-header" });
    const scheduleIcon = scheduleHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(scheduleIcon, "clock");
    scheduleHeader.createSpan({ text: "Schedule" });

    // Enable schedule toggle
    const scheduleToggleRow = scheduleSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    scheduleToggleRow.createDiv({ cls: "af-form-label", text: "Enable schedule" });
    const scheduleToggle = scheduleToggleRow.createDiv({ cls: `af-agent-card-toggle${hasSchedule ? " on" : ""}` });
    const scheduleBody = scheduleSection.createDiv({ cls: "af-schedule-body" });
    scheduleBody.setCssStyles({ display: hasSchedule ? "" : "none" });

    scheduleToggle.onclick = () => {
      const isOn = scheduleToggle.hasClass("on");
      scheduleToggle.toggleClass("on", !isOn);
      state.scheduleEnabled = !isOn;
      scheduleBody.setCssStyles({ display: !isOn ? "" : "none" });
      if (!isOn) {
        state.type = state.scheduleMode === "once" ? "once" : "recurring";
      } else {
        state.type = "immediate";
      }
    };

    // Schedule mode selector
    const editModeRow = scheduleBody.createDiv({ cls: "af-form-row" });
    editModeRow.createDiv({ cls: "af-form-label", text: "Mode" });
    const editModeSelect = editModeRow.createEl("select", { cls: "af-form-select" });
    for (const [val, lbl] of [["recurring", "Recurring"], ["once", "One-time"]] as const) {
      const opt = editModeSelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === state.scheduleMode) opt.selected = true;
    }
    const editCronHost = scheduleBody.createDiv();
    const editOnceHost = scheduleBody.createDiv();
    editCronHost.setCssStyles({ display: state.scheduleMode === "recurring" ? "" : "none" });
    editOnceHost.setCssStyles({ display: state.scheduleMode === "once" ? "" : "none" });
    this.renderInlineSchedule(editCronHost, state);

    const editOnceRow = editOnceHost.createDiv({ cls: "af-form-row" });
    editOnceRow.createDiv({ cls: "af-form-label", text: "Run at" });
    const prefillOnce = state.runAt
      ? this.toDatetimeLocal(new Date(state.runAt))
      : this.toDatetimeLocal(new Date(Date.now() + 3600_000));
    const editOnceInput = editOnceRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "datetime-local", value: prefillOnce },
    });
    if (!state.runAt) state.runAt = new Date(editOnceInput.value).toISOString();
    editOnceInput.addEventListener("input", () => {
      state.runAt = editOnceInput.value ? new Date(editOnceInput.value).toISOString() : "";
    });

    editModeSelect.addEventListener("change", () => {
      state.scheduleMode = editModeSelect.value;
      editCronHost.setCssStyles({ display: state.scheduleMode === "recurring" ? "" : "none" });
      editOnceHost.setCssStyles({ display: state.scheduleMode === "once" ? "" : "none" });
      if (state.scheduleEnabled) state.type = state.scheduleMode === "once" ? "once" : "recurring";
    });

    // Enabled toggle (whether the schedule is active)
    const enabledRow = scheduleBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
    enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
    const enabledToggle = enabledRow.createDiv({ cls: `af-agent-card-toggle${task.enabled ? " on" : ""}` });
    enabledToggle.onclick = () => {
      const isOn = enabledToggle.hasClass("on");
      enabledToggle.toggleClass("on", !isOn);
      state.enabled = !isOn;
    };

    // Catch up missed runs toggle
    const catchUpRow = scheduleBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
    const catchUpLabel = catchUpRow.createDiv({ cls: "af-form-label" });
    catchUpLabel.setText("Catch up if missed");
    
    const catchUpToggle = catchUpRow.createDiv({ cls: `af-agent-card-toggle${state.catchUp ? " on" : ""}` });
    catchUpToggle.onclick = () => {
      const isOn = catchUpToggle.hasClass("on");
      catchUpToggle.toggleClass("on", !isOn);
      state.catchUp = !isOn;
    };

    // ─── Execution Section ───
    const execSection = form.createDiv({ cls: "af-create-section" });
    const execHeader = execSection.createDiv({ cls: "af-create-section-header" });
    const execIcon = execHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(execIcon, "gauge");
    execHeader.createSpan({ text: "Execution" });

    // Effort level
    const effortRow = execSection.createDiv({ cls: "af-form-row" });
    const effortLabel = effortRow.createDiv({ cls: "af-form-label", text: "Effort" });
    const effortSelect = effortRow.createEl("select", { cls: "af-form-select" });
    const effortOptions: Array<[string, string]> = [
      ["", "Agent Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["max", "Max"],
    ];
    for (const [val, lbl] of effortOptions) {
      const opt = effortSelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === state.effort) opt.selected = true;
    }
    effortSelect.addEventListener("change", () => { state.effort = effortSelect.value; });
    this.addTooltip(
      effortLabel,
      "Overrides the agent\u2019s effort level for this task. Higher effort = more thinking tokens spent.",
    );

    // Model override
    const modelRowEdit = execSection.createDiv({ cls: "af-form-row" });
    const modelLabelEdit = modelRowEdit.createDiv({ cls: "af-form-label", text: "Model" });
    const modelFieldWrapEdit = modelRowEdit.createDiv({ cls: "af-form-field-wrap" });
    const renderTaskModelPicker = (agentName: string) => {
      modelFieldWrapEdit.empty();
      const selAgent = snapshot.agents.find((a) => a.name === agentName);
      renderModelPicker(modelFieldWrapEdit, {
        value: state.model,
        adapter: selAgent?.adapter,
        onChange: (value) => { state.model = value; },
        allowInherit: true,
        inheritPlaceholder: selAgent
          ? `Inherit from ${selAgent.name}${selAgent.model ? ` (${selAgent.model})` : ""}`
          : "Inherit from agent",
      });
    };
    renderTaskModelPicker(state.agent);
    agentSelect.addEventListener("change", () => renderTaskModelPicker(agentSelect.value));
    this.addTooltip(
      modelLabelEdit,
      "Override the agent\u2019s model for this task only. Useful for routing simple runs to haiku while the agent stays on opus for heavier work.",
    );

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });

    const deleteBtn = footer.createEl("button", { cls: "af-btn-sm danger" });
    createIcon(deleteBtn, "trash-2", "af-btn-icon");
    deleteBtn.appendText(" Delete");
    deleteBtn.onclick = async () => {
      await this.plugin.repository.deleteTask(task.taskId);
      new Notice(`Task "${task.taskId}" deleted.`);
      await new Promise((r) => window.setTimeout(r, 200));
      await this.plugin.refreshFromVault();
      this.navigate("kanban");
    };

    footer.createDiv({ cls: "af-toolbar-spacer" });

    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("task-detail", task.taskId);

    const saveBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(saveBtn, "check", "af-btn-icon");
    saveBtn.appendText(" Save Changes");
    saveBtn.onclick = async () => {
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      const effectiveType = state.scheduleEnabled
        ? state.scheduleMode === "once"
          ? "once"
          : "recurring"
        : "immediate";
      if (effectiveType === "once" && !state.runAt) {
        new Notice("Pick a date/time for the one-time run.");
        return;
      }
      try {
        await this.plugin.repository.updateTask(task.taskId, {
          agent: state.agent,
          type: effectiveType,
          priority: state.priority,
          schedule: effectiveType === "recurring" ? state.schedule.trim() : "",
          runAt: effectiveType === "once" ? state.runAt : "",
          enabled: state.enabled,
          catch_up: state.catchUp,
          effort: state.effort || undefined,
          model: state.model || "",
          tags: parseTags(state.tags),
          body: state.body.trim(),
        });
        new Notice(`Task "${task.taskId}" updated.`);
        await this.plugin.refreshFromVault();
        this.navigate("task-detail", task.taskId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to update task: ${msg}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Edit Skill Page
  // ═══════════════════════════════════════════════════════

  private renderEditSkillPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    const skillName = this.detailContext;
    if (!skillName) {
      this.renderEmptyState(page, "puzzle", "No skill selected", "");
      return;
    }

    const skill = this.plugin.runtime.getSnapshot().skills.find((s) => s.name === skillName);
    if (!skill) {
      this.renderEmptyState(page, "puzzle", "Skill not found", `Skill "${skillName}" was not found`);
      return;
    }

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatarEl = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(avatarEl, "edit");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: `Edit Skill: ${skill.name}` });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Modify skill definition" });

    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });
    // Form state pre-filled
    const state = {
      description: skill.description ?? "",
      tags: skill.tags.join(", "),
      body: skill.body,
      toolsBody: skill.toolsBody,
      referencesBody: skill.referencesBody,
      examplesBody: skill.examplesBody,
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Identity Section ───
    const identitySection = form.createDiv({ cls: "af-create-section" });
    const identityHeader = identitySection.createDiv({ cls: "af-create-section-header" });
    const identityIcon = identityHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(identityIcon, "puzzle");
    identityHeader.createSpan({ text: "Identity" });

    // Name (read-only)
    const nameRow = identitySection.createDiv({ cls: "af-form-row" });
    nameRow.createDiv({ cls: "af-form-label", text: "Name" });
    const nameInput = nameRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", value: skill.name, disabled: "true" },
    });
    nameInput.setCssStyles({ opacity: "0.6" });

    this.createFormField(identitySection, "Description", "Manage tasks and projects via CLI", "", (v) => { state.description = v; }, skill.description ?? "");
    this.createFormField(identitySection, "Tags", "productivity, tasks", "Comma-separated", (v) => { state.tags = v; }, skill.tags.join(", "));

    // ─── Core Instructions Section ───
    const instructionsSection = form.createDiv({ cls: "af-create-section" });
    const instructionsHeader = instructionsSection.createDiv({ cls: "af-create-section-header" });
    const instructionsIcon = instructionsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(instructionsIcon, "file-text");
    instructionsHeader.createSpan({ text: "Core Instructions" });

    const bodyTextarea = instructionsSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "Skill instructions...", rows: "10" },
    });
    bodyTextarea.value = skill.body;
    bodyTextarea.addEventListener("input", () => { state.body = bodyTextarea.value; });

    // ─── Tools Section ───
    const toolsSection = form.createDiv({ cls: "af-create-section" });
    const toolsHeader = toolsSection.createDiv({ cls: "af-create-section-header" });
    const toolsIcon = toolsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(toolsIcon, "wrench");
    const editToolsHeaderLabel = toolsHeader.createSpan({ text: "Tools" });
    this.addTooltip(editToolsHeaderLabel, "CLI commands, API endpoints, and tool definitions available to agents using this skill");
    const toolsTextarea = toolsSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "## Commands\n\n### list\n...", rows: "8" },
    });
    toolsTextarea.value = skill.toolsBody;
    toolsTextarea.addEventListener("input", () => { state.toolsBody = toolsTextarea.value; });

    // ─── References Section ───
    const refsSection = form.createDiv({ cls: "af-create-section" });
    const refsHeader = refsSection.createDiv({ cls: "af-create-section-header" });
    const refsIcon = refsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(refsIcon, "book-open");
    const refsHeaderLabel = refsHeader.createSpan({ text: "References" });
    this.addTooltip(refsHeaderLabel, "Background docs, conventions, cheat sheets");
    const refsTextarea = refsSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "API docs, filter syntax, conventions...", rows: "6" },
    });
    refsTextarea.value = skill.referencesBody;
    refsTextarea.addEventListener("input", () => { state.referencesBody = refsTextarea.value; });

    // ─── Examples Section ───
    const examplesSection = form.createDiv({ cls: "af-create-section" });
    const examplesHeader = examplesSection.createDiv({ cls: "af-create-section-header" });
    const examplesIcon = examplesHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(examplesIcon, "message-circle");
    const editExamplesHeaderLabel = examplesHeader.createSpan({ text: "Examples" });
    this.addTooltip(editExamplesHeaderLabel, "Example prompts and ideal outputs showing how to use this skill");
    const examplesTextarea = examplesSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "## Example: List all tasks\n...", rows: "6" },
    });
    examplesTextarea.value = skill.examplesBody;
    examplesTextarea.addEventListener("input", () => { state.examplesBody = examplesTextarea.value; });

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });

    const deleteBtn = footer.createEl("button", { cls: "af-btn-sm danger" });
    createIcon(deleteBtn, "trash-2", "af-btn-icon");
    deleteBtn.appendText(" Delete");
    deleteBtn.onclick = async () => {
      await this.plugin.repository.deleteSkill(skill.name);
      new Notice(`Skill "${skill.name}" deleted.`);
      // Small delay for Obsidian vault cache to process the trash
      await new Promise((r) => window.setTimeout(r, 200));
      await this.plugin.refreshFromVault();
      this.navigate("skills");
    };

    footer.createDiv({ cls: "af-toolbar-spacer" });

    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("skills");

    const saveBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(saveBtn, "check", "af-btn-icon");
    saveBtn.appendText(" Save Changes");
    saveBtn.onclick = async () => {
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      try {
        await this.plugin.repository.updateSkill(skill.name, {
          description: state.description.trim(),
          tags: parseTags(state.tags),
          body: state.body.trim(),
          toolsBody: state.toolsBody.trim(),
          referencesBody: state.referencesBody.trim(),
          examplesBody: state.examplesBody.trim(),
        });
        new Notice(`Skill "${skill.name}" updated.`);
        await this.plugin.refreshFromVault();
        this.navigate("skills");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to update skill: ${msg}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  MCP Servers Page
  // ═══════════════════════════════════════════════════════

  /** Render the per-agent MCP grant picker from the fleet registry. Shared by
   *  the create- and edit-agent forms. `selected` is the agent's
   *  `mcpServers` set, mutated in place as checkboxes toggle. */
  private renderAgentMcpPicker(section: HTMLElement, selected: Set<string>): void {
    section.createDiv({
      cls: "af-form-hint",
      text:
        "Servers from the MCP Servers tab. Checked servers are available to this " +
        "agent on any adapter (Claude or Codex). Leave all unchecked to grant every enabled server.",
    });
    const servers = this.plugin.repository.getMcpServers();
    if (servers.length === 0) {
      const hint = section.createDiv({ cls: "af-form-hint" });
      hint.appendText("No MCP servers registered yet. ");
      const link = hint.createEl("a", { cls: "af-link", text: "Add one in the MCP Servers tab." });
      link.onclick = (e) => { e.preventDefault(); this.navigate("mcp"); };
      return;
    }
    const grid = section.createDiv({ cls: "af-create-skills-grid" });
    for (const server of servers) {
      const item = grid.createDiv({ cls: "af-mcp-agent-item" });
      const cb = item.createEl("input", { cls: "af-form-toggle", attr: { type: "checkbox" } });
      cb.checked = selected.has(server.name);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(server.name);
        else selected.delete(server.name);
      });
      const lbl = item.createDiv({ cls: "af-mcp-agent-label" });
      const nameRow = lbl.createDiv({ cls: "af-mcp-agent-name-row" });
      const dot = nameRow.createSpan({ cls: `af-mcp-status-dot ${server.enabled ? "idle" : "disabled"}` });
      dot.title = server.enabled ? "enabled" : "disabled";
      nameRow.createSpan({ cls: "af-create-skill-name", text: server.name });
      nameRow.createSpan({ cls: "af-mcp-agent-tool-count", text: server.type });
      if (!server.enabled) {
        nameRow.createSpan({ cls: "af-mcp-agent-tool-count af-muted", text: "disabled" });
      }
    }
  }

  private renderMcpPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-agents-page" });

    const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
    toolbar.createDiv({ cls: "af-page-title", text: "MCP Servers" });
    toolbar.createDiv({ cls: "af-toolbar-spacer" });

    const addBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(addBtn, "plus", "af-btn-icon");
    addBtn.appendText(" Add Server");
    addBtn.onclick = () => this.navigate("add-mcp-server");

    const servers = this.plugin.repository.getMcpServers();

    if (servers.length === 0) {
      this.renderEmptyState(page, "plug", "No MCP servers registered", "Click 'Add Server' above to register one.");
      return;
    }

    const grid = page.createDiv({ cls: "af-agents-grid" });
    for (const server of servers) {
      this.renderMcpCard(grid, server);
    }
  }

  /** Transient per-server tool probe results (name → tools), populated by the
   *  on-demand "Probe tools" action. Not persisted. */
  private mcpProbeCache = new Map<string, McpTool[]>();

  /** Whether the server has a stored auth token (OAuth/static bearer). */
  private mcpHasToken(server: McpServer): boolean {
    return this.plugin.mcpAuth.hasToken(server.name);
  }

  /** Whether an http/sse server still needs the user to authenticate (auth is
   *  oauth/bearer but no token is stored yet). */
  private mcpNeedsAuth(server: McpServer): boolean {
    return (
      server.type !== "stdio" &&
      (server.auth === "oauth" || server.auth === "bearer") &&
      !this.mcpHasToken(server)
    );
  }

  private renderMcpCard(container: HTMLElement, server: McpServer): void {
    const card = container.createDiv({ cls: `af-mcp-card${server.enabled ? "" : " af-mcp-card-disabled"}` });
    const needsAuth = this.mcpNeedsAuth(server);

    const header = card.createDiv({ cls: "af-agent-card-header" });
    const statusClass = !server.enabled ? "disabled" : needsAuth ? "pending" : "idle";
    const avatarEl = header.createDiv({ cls: `af-agent-card-avatar ${statusClass}` });
    setIcon(avatarEl, "plug");

    const titleBlock = header.createDiv({ cls: "af-agent-card-titleblock" });
    titleBlock.createDiv({ cls: "af-agent-card-name", text: server.name });

    const metaRow = titleBlock.createDiv({ cls: "af-agent-card-desc af-mcp-meta" });
    metaRow.createSpan({ cls: "af-mcp-type-badge", text: server.type });
    if (server.source === "imported") {
      metaRow.createSpan({ cls: "af-badge", text: "imported" });
    }

    // Enable/disable toggle — writes the registry file frontmatter.
    const toggle = header.createDiv({ cls: `af-agent-card-toggle${server.enabled ? " on" : ""}` });
    toggle.onclick = (e) => {
      e.stopPropagation();
      void this.plugin.repository.setMcpServerEnabled(server.name, !server.enabled).then(async () => {
        await this.plugin.refreshFromVault();
        void this.render();
      });
    };

    // Status badge
    const statusBadge = card.createDiv({ cls: `af-mcp-status-badge ${!server.enabled ? "disabled" : needsAuth ? "needs-auth" : "connected"}` });
    const statusIcon = statusBadge.createSpan();
    if (!server.enabled) {
      setIcon(statusIcon, "pause");
      statusBadge.createSpan({ text: " Disabled" });
    } else if (needsAuth) {
      setIcon(statusIcon, "alert-circle");
      statusBadge.createSpan({ text: " Needs auth" });
    } else {
      setIcon(statusIcon, "check-circle");
      statusBadge.createSpan({ text: server.type === "stdio" ? " Enabled" : " Authenticated" });
    }

    if (server.description) {
      const desc = this.truncateDescription(server.description, 120);
      card.createDiv({ cls: "af-mcp-description", text: desc });
    }

    const urlOrCmd = server.url ?? server.command ?? "";
    if (urlOrCmd) {
      card.createDiv({ cls: "af-mcp-command", text: truncate(urlOrCmd, 60) });
    }

    // Tool count from the on-demand probe cache (if probed this session).
    const probed = this.mcpProbeCache.get(server.name);
    if (probed && probed.length > 0) {
      const toolFooter = card.createDiv({ cls: "af-mcp-tool-footer" });
      const toolCount = toolFooter.createDiv({ cls: "af-mcp-tool-count" });
      const toolIcon = toolCount.createSpan();
      setIcon(toolIcon, "wrench");
      toolCount.createSpan({ text: ` ${probed.length} tools` });
      const chips = toolFooter.createDiv({ cls: "af-mcp-tool-chips" });
      for (const t of probed.slice(0, 4)) {
        chips.createSpan({ cls: "af-mcp-tool-chip", text: t.name });
      }
      if (probed.length > 4) {
        chips.createSpan({ cls: "af-mcp-tool-chip af-mcp-tool-chip-more", text: `+${probed.length - 4}` });
      }
    }

    // Auth / authenticating indicator for http/sse servers.
    if (this.authenticatingServers.has(server.name)) {
      const authRow = card.createDiv({ cls: "af-mcp-auth-row" });
      const authBtn = authRow.createEl("button", { cls: "af-btn-sm primary", attr: { disabled: "true" } });
      const spinIcon = authBtn.createSpan({ cls: "af-spin" });
      setIcon(spinIcon, "loader-2");
      authBtn.appendText(" Authenticating…");
    } else if (server.enabled && needsAuth && server.auth === "oauth") {
      const authRow = card.createDiv({ cls: "af-mcp-auth-row" });
      const authBtn = authRow.createEl("button", { cls: "af-btn-sm primary" });
      const authIcon = authBtn.createSpan();
      setIcon(authIcon, "key");
      authBtn.appendText(" Authenticate");
      authBtn.onclick = (e) => {
        e.stopPropagation();
        void this.authenticateMcpServer(server);
      };
    }

    card.onclick = () => this.openMcpDetailSlideover(server);
  }

  private async authenticateMcpServer(server: McpServer): Promise<void> {
    if (!server.url) {
      new Notice("No URL found for this server — can't authenticate.");
      return;
    }

    this.authenticatingServers.add(server.name);
    void this.render();

    new Notice(`Authenticating ${server.name}… Complete authorization in your browser.`, 10000);

    try {
      const transport = server.type === "sse" ? "sse" : "http";
      await this.plugin.mcpManager.authenticateServer(server.name, server.url, transport);
      new Notice(`${server.name} authenticated successfully!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Authentication failed: ${msg}`, 8000);
    } finally {
      this.authenticatingServers.delete(server.name);
      void this.render();
    }
  }

  /** On-demand tool probe for the MCP detail view. Stores results in the
   *  transient cache and re-renders. */
  private async probeMcpServer(server: McpServer): Promise<void> {
    try {
      const tools = await this.plugin.mcpManager.probeServer(server);
      this.mcpProbeCache.set(server.name, tools);
      if (tools.length === 0) new Notice(`No tools discovered for ${server.name}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Probe failed: ${msg}`);
    }
  }

  private truncateDescription(text: string, maxLen: number): string {
    // Take first sentence or first line, whichever is shorter
    const firstLine = splitLines(text)[0] ?? text;
    const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
    const candidate = firstSentence.length < firstLine.length ? firstSentence : firstLine;
    if (candidate.length <= maxLen) return candidate;
    return candidate.slice(0, maxLen - 1) + "…";
  }

  private openMcpDetailSlideover(server: McpServer): void {
    this.contentEl.querySelector(".af-slideover-overlay")?.remove();

    const overlay = this.contentEl.createDiv({ cls: "af-slideover-overlay" });
    const panel = overlay.createDiv({ cls: "af-slideover" });

    const header = panel.createDiv({ cls: "af-slideover-header" });
    header.createDiv({ cls: "af-slideover-title", text: server.name });
    const closeBtn = header.createEl("button", { cls: "clickable-icon" });
    setIcon(closeBtn, "cross");
    closeBtn.onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const body = panel.createDiv({ cls: "af-slideover-body" });

    // Description
    if (server.description) {
      const descSection = body.createDiv({ cls: "af-slideover-section" });
      descSection.createDiv({ cls: "af-slideover-section-title", text: "DESCRIPTION" });
      descSection.createDiv({ cls: "af-mcp-detail-description", text: server.description });
    }

    // Server info
    const infoSection = body.createDiv({ cls: "af-slideover-section" });
    infoSection.createDiv({ cls: "af-slideover-section-title", text: "SERVER INFO" });
    this.renderDetailRow(infoSection, "Name", server.name);
    this.renderDetailRow(infoSection, "Transport", server.type);
    this.renderDetailRow(infoSection, "Enabled", server.enabled ? "yes" : "no");
    if (server.type !== "stdio") {
      this.renderDetailRow(infoSection, "Auth", server.auth ?? "none");
      this.renderDetailRow(infoSection, "Authenticated", this.mcpHasToken(server) ? "yes" : "no");
    }
    if (server.source) this.renderDetailRow(infoSection, "Source", server.source);
    if (server.url) this.renderDetailRow(infoSection, "URL", server.url);
    if (server.command) this.renderDetailRow(infoSection, "Command", server.command);
    if (server.args && server.args.length > 0) this.renderDetailRow(infoSection, "Args", server.args.join(" "));

    // Tools — populated by the on-demand probe (registry definitions carry no
    // probed tools until the user clicks "Probe tools").
    const probedTools = this.mcpProbeCache.get(server.name) ?? [];
    const toolsSection = body.createDiv({ cls: "af-slideover-section" });
    const toolsTitleRow = toolsSection.createDiv({ cls: "af-slideover-section-title" });
    toolsTitleRow.setText(`TOOLS (${probedTools.length})`);
    const probeBtn = toolsSection.createEl("button", { cls: "af-btn-sm" });
    const probeIcon = probeBtn.createSpan();
    setIcon(probeIcon, "wrench");
    probeBtn.appendText(" Probe tools");
    probeBtn.onclick = async () => {
      probeBtn.disabled = true;
      probeBtn.setText(" Probing…");
      await this.probeMcpServer(server);
      overlay.remove();
      this.openMcpDetailSlideover(server);
    };

    if (probedTools.length > 0) {
      for (const tool of probedTools) {
        const toolItem = toolsSection.createDiv({ cls: "af-mcp-tool-detail" });
        const toolHeader = toolItem.createDiv({ cls: "af-mcp-tool-detail-header" });
        const toolNameEl = toolHeader.createSpan({ cls: "af-mcp-tool-detail-name" });
        const toolNameIcon = toolNameEl.createSpan();
        setIcon(toolNameIcon, "wrench");
        toolNameEl.createSpan({ text: ` ${tool.name}` });

        if (tool.inputSchema) {
          const params = (tool.inputSchema as { required?: string[] }).required ?? [];
          if (params.length > 0) {
            toolHeader.createSpan({
              cls: "af-mcp-tool-param-count",
              text: `${params.length} param${params.length !== 1 ? "s" : ""}`,
            });
          }
        }

        if (tool.description) {
          // Show first 2 lines of description, rest in collapsible
          const descLines = splitLines(tool.description).filter((l) => l.trim());
          const shortDesc = descLines.slice(0, 2).join(" ").trim();
          const hasMore = descLines.length > 2;

          if (hasMore) {
            const details = toolItem.createEl("details", { cls: "af-mcp-tool-detail-desc" });
            details.createEl("summary", { text: this.truncateDescription(shortDesc, 200) });
            details.createDiv({ cls: "af-mcp-tool-detail-full", text: tool.description });
          } else {
            toolItem.createDiv({ cls: "af-mcp-tool-detail-desc", text: shortDesc });
          }
        }

        // Input schema params
        if (tool.inputSchema) {
          const props = (tool.inputSchema as { properties?: Record<string, { type?: string; description?: string }> }).properties;
          const required = new Set((tool.inputSchema as { required?: string[] }).required ?? []);
          if (props && Object.keys(props).length > 0) {
            const paramsEl = toolItem.createDiv({ cls: "af-mcp-tool-params" });
            for (const [paramName, paramDef] of Object.entries(props)) {
              const paramEl = paramsEl.createDiv({ cls: "af-mcp-tool-param" });
              paramEl.createSpan({ cls: "af-mcp-tool-param-name", text: paramName });
              if (paramDef.type) {
                paramEl.createSpan({ cls: "af-mcp-tool-param-type", text: paramDef.type });
              }
              if (required.has(paramName)) {
                paramEl.createSpan({ cls: "af-mcp-tool-param-required", text: "required" });
              }
              if (paramDef.description) {
                paramEl.createSpan({
                  cls: "af-mcp-tool-param-desc",
                  text: truncate(paramDef.description, 80),
                });
              }
            }
          }
        }
      }
    } else {
      toolsSection.createDiv({
        cls: "af-form-hint",
        text: "Click \"Probe tools\" to discover the tools this server exposes.",
      });
    }

    // Actions section
    const actionsSection = body.createDiv({ cls: "af-slideover-section" });
    actionsSection.createDiv({ cls: "af-slideover-section-title", text: "ACTIONS" });

    if (server.enabled && server.url && server.auth === "oauth" && !this.mcpHasToken(server)) {
      const authBtn = actionsSection.createEl("button", { cls: "af-btn-sm primary" });
      const authIcon = authBtn.createSpan();
      setIcon(authIcon, "key");
      authBtn.appendText(" Authenticate");
      authBtn.onclick = () => {
        overlay.remove();
        void this.authenticateMcpServer(server);
      };
    }

    const removeBtn = actionsSection.createEl("button", { cls: "af-btn-sm danger" });
    const removeIcon = removeBtn.createSpan();
    setIcon(removeIcon, "trash-2");
    removeBtn.appendText(" Remove Server");
    removeBtn.onclick = async () => {
      try {
        await this.plugin.repository.deleteMcpServer(server.name);
        this.plugin.mcpAuth.removeToken(server.name);
        this.mcpProbeCache.delete(server.name);
        new Notice(`Server "${server.name}" removed.`);
        overlay.remove();
        await this.plugin.refreshFromVault();
        void this.render();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to remove server: ${msg}`);
      }
    };
  }

  // ═══════════════════════════════════════════════════════
  //  Add MCP Server Page
  // ═══════════════════════════════════════════════════════

  private renderAddMcpServerPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });

    // Header
    const header = page.createDiv({ cls: "af-detail-header" });
    const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
    const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(avatar, "plus");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: "Add MCP Server" });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Register a new MCP server for agents to use" });
    const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

    // Form state
    const state: {
      name: string;
      transport: "stdio" | "http" | "sse";
      description: string;
      command: string;
      args: string;
      envVars: string;
      url: string;
      headers: string;
      auth: "none" | "bearer" | "oauth";
      bearerToken: string;
    } = {
      name: "",
      transport: "stdio",
      description: "",
      command: "",
      args: "",
      envVars: "",
      url: "",
      headers: "",
      auth: "none",
      bearerToken: "",
    };

    const form = page.createDiv({ cls: "af-create-form" });

    // ─── Server Details ───
    const detailsSection = form.createDiv({ cls: "af-create-section" });
    const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
    const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(detailsIcon, "plug");
    detailsHeader.createSpan({ text: "Server Details" });

    this.createFormField(detailsSection, "Name", "my-server", "Unique name for this MCP server", (v) => { state.name = v; });

    // Transport dropdown
    const transportRow = detailsSection.createDiv({ cls: "af-form-row" });
    const transportLabel = transportRow.createDiv({ cls: "af-form-label" });
    transportLabel.setText("Transport");
    this.addTooltip(transportLabel, "stdio: local process, http/sse: remote server");
    const transportSelect = transportRow.createEl("select", { cls: "af-form-select" });
    transportSelect.createEl("option", { text: "stdio", attr: { value: "stdio" } });
    transportSelect.createEl("option", { text: "http", attr: { value: "http" } });
    transportSelect.createEl("option", { text: "sse", attr: { value: "sse" } });

    this.createFormField(detailsSection, "Description", "What this server does (optional)", "Shown on the server card", (v) => { state.description = v; });

    // ─── stdio fields ───
    const stdioSection = form.createDiv({ cls: "af-create-section" });
    const stdioHeader = stdioSection.createDiv({ cls: "af-create-section-header" });
    const stdioIcon = stdioHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(stdioIcon, "terminal");
    stdioHeader.createSpan({ text: "Process Configuration" });

    this.createFormField(stdioSection, "Command", "npx @anthropic-ai/mcp-server-memory", "The command to run", (v) => { state.command = v; });
    this.createFormField(stdioSection, "Arguments", "--port 3000", "Space-separated arguments (optional)", (v) => { state.args = v; });

    const envLabel = stdioSection.createDiv({ cls: "af-form-label" });
    envLabel.setText("Environment variables");
    this.addTooltip(envLabel, "One KEY=VALUE per line");
    const envTextarea = stdioSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "API_KEY=sk-...\nDEBUG=true", rows: "3" },
    });
    envTextarea.addEventListener("input", () => { state.envVars = envTextarea.value; });

    // ─── http/sse fields ───
    const httpSection = form.createDiv({ cls: "af-create-section" });
    const httpHeader = httpSection.createDiv({ cls: "af-create-section-header" });
    const httpIcon = httpHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(httpIcon, "globe");
    httpHeader.createSpan({ text: "Remote Server Configuration" });

    this.createFormField(httpSection, "URL", "https://mcp.example.com/sse", "Server endpoint URL", (v) => { state.url = v; });

    const headersLabel = httpSection.createDiv({ cls: "af-form-label" });
    headersLabel.setText("Custom headers");
    this.addTooltip(headersLabel, "One Header: Value per line (optional, non-secret)");
    const headersTextarea = httpSection.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "X-Custom-Header: value", rows: "2" },
    });
    headersTextarea.addEventListener("input", () => { state.headers = headersTextarea.value; });

    // Auth dropdown
    const authRow = httpSection.createDiv({ cls: "af-form-row" });
    const authLabel = authRow.createDiv({ cls: "af-form-label" });
    authLabel.setText("Authentication");
    this.addTooltip(authLabel, "none, a static bearer token, or OAuth (authenticate after saving)");
    const authSelect = authRow.createEl("select", { cls: "af-form-select" });
    authSelect.createEl("option", { text: "None", attr: { value: "none" } });
    authSelect.createEl("option", { text: "Bearer token", attr: { value: "bearer" } });
    authSelect.createEl("option", { text: "OAuth", attr: { value: "oauth" } });

    // Bearer token field (shown only for auth=bearer). Stored in the keychain,
    // never in the vault.
    const bearerRow = httpSection.createDiv({ cls: "af-form-row" });
    const bearerLabel = bearerRow.createDiv({ cls: "af-form-label" });
    bearerLabel.setText("Bearer token");
    this.addTooltip(bearerLabel, "Stored securely in the OS keychain, never written to the vault");
    const bearerInput = bearerRow.createEl("input", { cls: "af-form-input", attr: { type: "password", placeholder: "sk-…" } });
    bearerInput.addEventListener("input", () => { state.bearerToken = bearerInput.value; });

    const updateAuthVisibility = () => {
      bearerRow.setCssStyles({ display: state.auth === "bearer" ? "" : "none" });
    };
    authSelect.addEventListener("change", () => {
      state.auth = authSelect.value as "none" | "bearer" | "oauth";
      updateAuthVisibility();
    });
    updateAuthVisibility();

    // Toggle section visibility based on transport
    const updateTransportVisibility = () => {
      stdioSection.setCssStyles({ display: state.transport === "stdio" ? "" : "none" });
      httpSection.setCssStyles({ display: state.transport !== "stdio" ? "" : "none" });
    };
    transportSelect.addEventListener("change", () => {
      state.transport = transportSelect.value as "stdio" | "http" | "sse";
      updateTransportVisibility();
    });
    updateTransportVisibility();

    // ─── Footer ───
    const footer = page.createDiv({ cls: "af-create-footer" });
    const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
    cancelBtn.onclick = () => this.navigate("mcp");

    const submitBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
    createIcon(submitBtn, "plus", "af-btn-icon");
    submitBtn.appendText(" Add Server");
    submitBtn.onclick = async () => {
      const name = state.name.trim();
      if (!name) { new Notice("Server name is required."); return; }

      if (state.transport === "stdio") {
        if (!state.command.trim()) { new Notice("Command is required for stdio servers."); return; }
      } else {
        if (!state.url.trim()) { new Notice("URL is required for HTTP/SSE servers."); return; }
      }

      // Parse env vars
      const envVars: Record<string, string> = {};
      if (state.envVars.trim()) {
        for (const line of splitLines(state.envVars)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx <= 0) { new Notice(`Invalid env var: ${trimmed}`); return; }
          envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
        }
      }

      // Parse headers
      const headers: Record<string, string> = {};
      if (state.headers.trim()) {
        for (const line of splitLines(state.headers)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const colonIdx = trimmed.indexOf(":");
          if (colonIdx <= 0) { new Notice(`Invalid header: ${trimmed}`); return; }
          headers[trimmed.slice(0, colonIdx).trim()] = trimmed.slice(colonIdx + 1).trim();
        }
      }

      // Parse args
      const args = state.args.trim() ? state.args.trim().split(/\s+/) : undefined;

      if (this.plugin.repository.getMcpServerByName(name)) {
        new Notice(`An MCP server named "${name}" already exists.`);
        return;
      }
      if (state.transport !== "stdio" && state.auth === "bearer" && !state.bearerToken.trim()) {
        new Notice("Enter a bearer token, or choose a different auth method.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.setText("Adding...");

      // Build the registry definition (non-secret fields only). The bearer
      // token, if any, goes to the keychain — never into the vault file.
      const server: McpServer = {
        name,
        type: state.transport,
        enabled: true,
        source: "manual",
        status: "disconnected",
        scope: "user",
        tools: [],
        toolDetails: [],
      };
      if (state.transport === "stdio") {
        server.command = state.command.trim();
        if (args) server.args = args;
        if (Object.keys(envVars).length > 0) server.env = envVars;
      } else {
        server.url = state.url.trim();
        if (Object.keys(headers).length > 0) server.headers = headers;
        server.auth = state.auth;
      }

      try {
        await this.plugin.repository.saveMcpServer(server, state.description.trim());
        if (state.transport !== "stdio" && state.auth === "bearer" && state.bearerToken.trim()) {
          this.plugin.mcpAuth.storeStaticToken(name, state.bearerToken.trim());
        }
        new Notice(`Server "${name}" added.`);
        await this.plugin.refreshFromVault();
        this.navigate("mcp");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to add server: ${msg}`);
        submitBtn.disabled = false;
        submitBtn.setText("");
        createIcon(submitBtn, "plus", "af-btn-icon");
        submitBtn.appendText(" Add Server");
      }
    };
  }

  private createFormField(container: HTMLElement, label: string, placeholder: string, desc: string, onChange: (v: string) => void, initialValue?: string): void {
    const row = container.createDiv({ cls: "af-form-row" });
    const labelEl = row.createDiv({ cls: "af-form-label" });
    labelEl.setText(label);
    if (desc) this.addTooltip(labelEl, desc);
    const input = row.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", placeholder },
    });
    if (initialValue !== undefined) {
      input.value = initialValue;
    }
    input.addEventListener("input", () => onChange(input.value));
  }

  /** Append a small info icon with a hover tooltip to a label element. */
  private addTooltip(labelEl: HTMLElement, text: string): void {
    const tip = labelEl.createSpan({ cls: "af-form-tooltip" });
    setIcon(tip, "info");
    tip.createSpan({ cls: "af-tooltip-text", text });
  }
}

/**
 * Map a channel status to the existing `af-agent-card-avatar` color class so that
 * channel cards borrow the same visual language as agent cards (green=healthy,
 * blue=transitioning, red=broken, gray=off).
 */
function channelStatusToAvatarClass(status: string): string {
  switch (status) {
    case "connected":
      return "idle"; // green
    case "connecting":
    case "reconnecting":
      return "pending"; // blue
    case "needs-auth":
    case "error":
      return "error"; // red
    case "stopped":
    case "disabled":
    default:
      return "disabled"; // gray
  }
}

/**
 * Format a token count for compact display:
 *   0       → "0"
 *   999     → "999"
 *   1,500   → "1.5K"
 *   45,000  → "45K"
 *   1,200,000 → "1.2M"
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 10_000) return `${Math.round(tokens / 1000)}K`;
  if (tokens >= 1_000) return `${(tokens / 1000).toFixed(1)}K`;
  return String(tokens);
}

/** Convert a cron expression to a human-readable schedule description. */
function cronToHuman(cron: string): string {
  if (!cron?.trim()) return "not set";
  const cronMap: Record<string, string> = {
    "*/5 * * * *": "Every 5 minutes",
    "*/10 * * * *": "Every 10 minutes",
    "*/15 * * * *": "Every 15 minutes",
    "*/30 * * * *": "Every 30 minutes",
    "0 * * * *": "Every hour",
    "0 */2 * * *": "Every 2 hours",
    "0 */4 * * *": "Every 4 hours",
    "0 */6 * * *": "Every 6 hours",
    "0 */12 * * *": "Every 12 hours",
  };
  if (cronMap[cron]) return cronMap[cron];
  // Parse daily/weekly patterns: "M H * * *" or "M H * * 1-5"
  const parts = cron.trim().split(/\s+/);
  if (parts.length === 5) {
    const [m, h, dom, , dow] = parts;
    if (dom === "*" && h && m) {
      const hour = Number(h);
      const minute = Number(m);
      if (!isNaN(hour) && !isNaN(minute)) {
        const ampm = hour >= 12 ? "PM" : "AM";
        const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        const timeStr = `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
        if (dow === "*") return `Daily at ${timeStr}`;
        if (dow === "1-5") return `Weekdays at ${timeStr}`;
        return `${timeStr} on days ${dow}`;
      }
    }
  }
  return cron; // fallback to raw cron if no match
}

/** Map a channel status to an `af-pill` color variant for the header badge. */
function channelStatusPillColor(status: string): string {
  switch (status) {
    case "connected":
      return "green";
    case "connecting":
    case "reconnecting":
      return "blue";
    case "needs-auth":
    case "error":
      return "red";
    case "stopped":
    case "disabled":
    default:
      return "";
  }
}
