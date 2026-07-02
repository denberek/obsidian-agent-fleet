import { ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_DASHBOARD } from "../constants";
import type AgentFleetPlugin from "../main";
import type { AgentConfig, AgentHealth, McpTool, RunLogData, TaskConfig, UsageRecord } from "../types";
import { estimateCostFromBreakdown, estimateCostFromTotal } from "../utils/pricing";
import { truncate, parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter } from "../utils/markdown";
import { splitLines } from "../utils/platform";
import { createIcon } from "../utils/icons";
import { renderBarChart, renderDonutChart } from "../components/chartRenderer";
import type { BarChartDay } from "../components/chartRenderer";
import { makeDraggable, makeDropTarget } from "../components/dragDrop";
import { renderChannelForm } from "./forms/channelForm";
import type { ChannelFormDeps } from "./forms/channelForm";
import { renderCreateAgentForm, renderEditAgentForm } from "./forms/agentForm";
import type { AgentFormDeps } from "./forms/agentForm";
import { renderCreateTaskForm, renderEditTaskForm } from "./forms/taskForm";
import type { TaskFormDeps } from "./forms/taskForm";
import { renderSkillForm } from "./forms/skillForm";
import type { SkillFormDeps } from "./forms/skillForm";
import { renderAddMcpServerForm } from "./forms/mcpForm";
import type { McpFormDeps } from "./forms/mcpForm";
import type { DashboardFormDeps } from "./forms/shared";
import { renderAgentsPage } from "./pages/agentsPage";
import type { AgentsPageDeps } from "./pages/agentsPage";
import { renderAgentDetailPage } from "./pages/agentDetailPage";
import type { AgentDetailPageDeps } from "./pages/agentDetailPage";
import { renderRunsPage } from "./pages/runsPage";
import type { RunsPageDeps } from "./pages/runsPage";
import { renderSkillsPage } from "./pages/skillsPage";
import type { SkillsPageDeps } from "./pages/skillsPage";
import { renderApprovalsPage } from "./pages/approvalsPage";
import type { ApprovalsPageDeps } from "./pages/approvalsPage";
import { renderChannelsPage } from "./pages/channelsPage";
import type { ChannelsPageDeps } from "./pages/channelsPage";
import { renderWikiKeepersPage } from "./pages/wikiKeepersPage";
import { renderTaskDetailPage } from "./pages/taskDetailPage";
import type { TaskDetailPageDeps } from "./pages/taskDetailPage";
import { renderMcpPage } from "./pages/mcpPage";
import type { McpPageDeps } from "./pages/mcpPage";
import type { DashboardPageDeps } from "./pages/shared";
import { DEFAULT_FILES } from "../defaults";



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

/** localStorage key (vault-scoped via App.saveLocalStorage) for the one-time
 *  first-run welcome card dismissal. */
const WELCOME_DISMISS_KEY = "agent-fleet-welcome-dismissed";

/** Names of the agents bundled as defaults (seeded by ensureSamples). Derived
 *  from DEFAULT_FILES paths so the "pristine fleet" check tracks the catalog. */
const DEFAULT_AGENT_NAMES: ReadonlySet<string> = new Set(
  DEFAULT_FILES
    .map((f) => /^agents\/([^/]+?)(?:\.md)?(?:\/|$)/.exec(f.path)?.[1])
    .filter((n): n is string => !!n),
);

export class FleetDashboardView extends ItemView {
  private currentPage: DashboardPage = "dashboard";
  private detailContext?: string;
  private agentDetailTab = "overview";
  private streamingUnsubscribes: (() => void)[] = [];
  /** Per-render tick callbacks for running kanban cards, driven by one shared
   *  interval instead of one interval per card. Cleared in cleanupStreaming. */
  private runningCardTickers: Array<() => void> = [];
  private runningCardInterval?: number;
  private channelStatusUnsubscribe?: () => void;
  private authenticatingServers = new Set<string>();
  /** Transient per-server tool probe results (name → tools), populated by the
   *  on-demand "Probe tools" action. Not persisted. */
  private mcpProbeCache = new Map<string, McpTool[]>();

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
        renderAgentsPage(pageContainer, this.agentsPageDeps());
        break;
      case "kanban":
        this.renderKanbanPage(pageContainer);
        break;
      case "runs":
        renderRunsPage(pageContainer, this.runsPageDeps());
        break;
      case "skills":
        renderSkillsPage(pageContainer, this.skillsPageDeps());
        break;
      case "approvals":
        renderApprovalsPage(pageContainer, this.approvalsPageDeps());
        break;
      case "mcp":
        renderMcpPage(pageContainer, this.mcpPageDeps());
        break;
      case "channels":
        renderChannelsPage(pageContainer, this.channelsPageDeps());
        break;
      case "wiki-keepers":
        void renderWikiKeepersPage(pageContainer, this.basePageDeps());
        break;
      case "agent-detail":
        renderAgentDetailPage(pageContainer, this.agentDetailPageDeps(), this.detailContext);
        break;
      case "task-detail":
        renderTaskDetailPage(pageContainer, this.taskDetailPageDeps(), this.detailContext);
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
    this.runningCardTickers = [];
    if (this.runningCardInterval !== undefined) {
      window.clearInterval(this.runningCardInterval);
      this.runningCardInterval = undefined;
    }
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
    let searchDebounce: number | undefined;
    searchInput.addEventListener("input", () => {
      window.clearTimeout(searchDebounce);
      searchDebounce = window.setTimeout(() => {
        this.handleSearch(searchInput.value, searchWrap);
      }, 200);
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

    // First-run welcome card (pristine fleet only, dismissible)
    this.maybeRenderWelcomeCard(page, snapshot.agents, runs);

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

    // Comprehensive: run logs (tasks/heartbeats/reflections) + chat/channel usage.
    const todayUsage = this.plugin.runtime.getUsageRecords().filter((u) => this.runToLocalDate(u.ts) === todayStr);
    const { tokens: totalTokens, cost: totalCost } = this.combinedTotals(todayRuns, todayUsage);
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

  /**
   * First-run welcome card: shown while the fleet is pristine — every agent is
   * one of the bundled defaults (seeded by ensureSamples) and nothing has run
   * yet — and the user hasn't dismissed it. Dismissal persists via Obsidian's
   * vault-scoped localStorage (App.saveLocalStorage), not plugin settings.
   */
  private maybeRenderWelcomeCard(container: HTMLElement, agents: AgentConfig[], runs: RunLogData[]): void {
    if (this.plugin.app.loadLocalStorage(WELCOME_DISMISS_KEY)) return;
    const pristine =
      agents.length > 0 &&
      agents.every((a) => DEFAULT_AGENT_NAMES.has(a.name)) &&
      runs.length === 0;
    if (!pristine) return;

    const card = container.createDiv({ cls: "af-welcome-card" });

    const header = card.createDiv({ cls: "af-welcome-header" });
    const titleEl = header.createDiv({ cls: "af-section-title" });
    createIcon(titleEl, "sparkles");
    titleEl.appendText(" Welcome to Agent Fleet");
    const dismissBtn = header.createEl("button", {
      cls: "clickable-icon af-welcome-dismiss",
      attr: { "aria-label": "Dismiss" },
    });
    setIcon(dismissBtn, "x");
    dismissBtn.onclick = () => {
      this.plugin.app.saveLocalStorage(WELCOME_DISMISS_KEY, "1");
      card.remove();
    };

    card.createDiv({
      cls: "af-welcome-sub",
      text: "Three quick steps to get your fleet going:",
    });

    const steps = card.createDiv({ cls: "af-welcome-steps" });
    const addStep = (num: number, icon: string, title: string, desc: string, onClick: () => void) => {
      const step = steps.createDiv({ cls: "af-welcome-step" });
      step.createDiv({ cls: "af-welcome-step-num", text: String(num) });
      const body = step.createDiv({ cls: "af-welcome-step-body" });
      const titleRow = body.createDiv({ cls: "af-welcome-step-title" });
      createIcon(titleRow, icon, "af-meta-icon");
      titleRow.appendText(` ${title}`);
      body.createDiv({ cls: "af-welcome-step-desc", text: desc });
      step.onclick = onClick;
    };

    const orchestrator = agents.find((a) => a.name === "fleet-orchestrator") ?? agents[0];
    addStep(
      1,
      "message-circle",
      "Try the Fleet Orchestrator in Chat",
      "It knows this plugin inside out — ask it to build agents, tasks, and skills for you.",
      () => void this.plugin.openChatView(orchestrator?.name),
    );
    addStep(
      2,
      "bot",
      "Create your own agent",
      "Give it a system prompt, a model, and permissions.",
      () => this.navigate("create-agent"),
    );
    addStep(
      3,
      "radio",
      "Connect a channel (optional)",
      "Talk to your agents from Slack, Telegram, or Discord.",
      () => this.navigate("channels"),
    );
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

  /** Cost of a run log: the CLI-reported dollars, or an estimate from total
   *  tokens when the CLI reported none (e.g. Codex). */
  private runCost(r: RunLogData): number {
    return r.costUsd ?? estimateCostFromTotal(r.model, r.tokensUsed ?? 0);
  }

  /** Cost of a chat/channel usage record: CLI-reported, or estimated from the
   *  per-type token breakdown when absent. */
  private usageCost(u: UsageRecord): number {
    return u.costUsd ?? estimateCostFromBreakdown(u.model, {
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      cacheCreateTokens: u.cacheCreateTokens,
    });
  }

  /** Comprehensive token + cost totals across run logs AND chat/channel usage
   *  records, with the pricing fallback applied per source. */
  private combinedTotals(runs: RunLogData[], usage: UsageRecord[]): { tokens: number; cost: number } {
    const tokens =
      runs.reduce((s, r) => s + (r.tokensUsed ?? 0), 0) +
      usage.reduce((s, u) => s + u.totalTokens, 0);
    const cost =
      runs.reduce((s, r) => s + this.runCost(r), 0) +
      usage.reduce((s, u) => s + this.usageCost(u), 0);
    return { tokens, cost };
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
      : state.currentTaskId?.startsWith("reflection-")
        ? " → Reflection"
        : state.currentTaskId?.startsWith("heartbeat-")
          ? " → Heartbeat"
          : state.status === "running" ? " → Heartbeat" : "";

    const header = card.createDiv({ cls: "af-streaming-card-header" });
    header.createSpan({ cls: "af-dot pulse", attr: { style: "background: var(--af-yellow)" } });
    header.createSpan({ cls: "af-streaming-card-agent", text: ` ${agentName}` });
    if (taskLabel) {
      header.createSpan({ cls: "af-streaming-card-task", text: taskLabel });
    }

    const output = card.createDiv({ cls: "af-streaming-output" });
    // Reflection reads a lot of context before emitting its memory block, so the
    // buffer is empty for most of the run — show a placeholder instead of a blank
    // card so it doesn't look stalled.
    const placeholder = state.currentTaskId?.startsWith("reflection-")
      ? "Consolidating memory…"
      : "Working…";
    const renderBuffer = (buf: string) => {
      const lines = splitLines(buf).filter((l) => l.trim().length > 0).slice(-4);
      output.setText(lines.length > 0 ? lines.join("\n") : placeholder);
    };
    renderBuffer(this.plugin.runtime.getRunOutputBuffer(agentName));

    const unsub = this.plugin.runtime.onRunOutput(agentName, () => {
      renderBuffer(this.plugin.runtime.getRunOutputBuffer(agentName));
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
      this.renderEmptyState(list, "bot", "No agents yet", "Create your first agent to get started", {
        label: "New Agent",
        onClick: () => void this.plugin.createAgentTemplate(),
      });
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

  private renderAgentStat(container: HTMLElement, value: string, label: string): void {
    const stat = container.createDiv({ cls: "af-agent-stat" });
    stat.createSpan({ cls: "af-agent-stat-value", text: value });
    stat.createSpan({ cls: "af-agent-stat-label", text: label });
  }

  private renderConfigRow(container: HTMLElement, label: string, value: string): void {
    const row = container.createDiv({ cls: "af-detail-row" });
    row.createSpan({ cls: "af-detail-label", text: label });
    row.createSpan({ cls: "af-detail-value af-mono", text: value });
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
    const elapsedText = scheduleEl.createSpan({ text: ` ${elapsedSec}s / ${timeout}s` });

    // Stop button
    const stopBtn = footer.createEl("button", { cls: "af-kanban-stop-btn" });
    setIcon(stopBtn, "square");
    stopBtn.title = "Stop task";
    stopBtn.onclick = (e) => {
      e.stopPropagation();
      this.plugin.runtime.abortAgentRun(task.agent);
      new Notice(`Stopped task "${task.taskId}"`);
    };

    // Live update every second via the shared running-card interval: only the
    // stored text node and bar width are touched — no child rebuilds per tick.
    this.runningCardTickers.push(() => {
      const now = (Date.now() - startTime) / 1000;
      const newPct = Math.min(95, (now / timeout) * 100);
      bar.setCssStyles({ width: `${newPct}%` });
      elapsedText.setText(` ${Math.round(now)}s / ${timeout}s`);
    });
    if (this.runningCardInterval === undefined) {
      this.runningCardInterval = window.setInterval(() => {
        for (const tick of this.runningCardTickers) tick();
      }, 1000);
    }
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
  //  Create Channel Page
  // ═══════════════════════════════════════════════════════

  private renderCreateChannelPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    renderChannelForm(page, this.channelFormDeps());
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

    renderChannelForm(page, this.channelFormDeps(), channel);
  }

  /** View helpers handed to the shared channel form (src/views/forms/channelForm.ts). */
  private channelFormDeps(): ChannelFormDeps {
    return {
      plugin: this.plugin,
      navigate: (page, context) => this.navigate(page, context),
      addTooltip: (labelEl, text) => this.addTooltip(labelEl, text),
      createFormField: (container, label, placeholder, desc, onChange, initialValue) =>
        this.createFormField(container, label, placeholder, desc, onChange, initialValue),
      markSubmitBusy: (btn, busyLabel, iconName, label) =>
        this.markSubmitBusy(btn, busyLabel, iconName, label),
    };
  }

  /** Shared subset of view helpers handed to every extracted form module
   *  (src/views/forms/). Page-specific deps spread this and add their own
   *  narrowly-typed navigate delegate. */
  private baseFormDeps(): DashboardFormDeps {
    return {
      plugin: this.plugin,
      addTooltip: (labelEl, text) => this.addTooltip(labelEl, text),
      createFormField: (container, label, placeholder, desc, onChange, initialValue) =>
        this.createFormField(container, label, placeholder, desc, onChange, initialValue),
      markSubmitBusy: (btn, busyLabel, iconName, label) =>
        this.markSubmitBusy(btn, busyLabel, iconName, label),
    };
  }

  /** View helpers handed to the shared agent forms (src/views/forms/agentForm.ts). */
  private agentFormDeps(): AgentFormDeps {
    return {
      ...this.baseFormDeps(),
      navigate: (page, context) => this.navigate(page, context),
      renderAgentAvatar: (el, agent) => this.renderAgentAvatar(el, agent),
    };
  }

  /** View helpers handed to the shared task forms (src/views/forms/taskForm.ts). */
  private taskFormDeps(): TaskFormDeps {
    return {
      ...this.baseFormDeps(),
      navigate: (page, context) => this.navigate(page, context),
    };
  }

  /** View helpers handed to the shared skill form (src/views/forms/skillForm.ts). */
  private skillFormDeps(): SkillFormDeps {
    return {
      ...this.baseFormDeps(),
      navigate: (page) => this.navigate(page),
    };
  }

  /** View helpers handed to the MCP server form (src/views/forms/mcpForm.ts). */
  private mcpFormDeps(): McpFormDeps {
    return {
      ...this.baseFormDeps(),
      navigate: (page) => this.navigate(page),
    };
  }

  /** Shared subset of view helpers handed to every extracted page module
   *  (src/views/pages/). Page-specific deps spread this and add their own
   *  narrowly-typed delegates. */
  private basePageDeps(): DashboardPageDeps {
    return {
      plugin: this.plugin,
      renderEmptyState: (container, iconName, label, sublabel, action) =>
        this.renderEmptyState(container, iconName, label, sublabel, action),
    };
  }

  /** View helpers handed to the agents page (src/views/pages/agentsPage.ts). */
  private agentsPageDeps(): AgentsPageDeps {
    return {
      ...this.basePageDeps(),
      navigate: (page, context) => this.navigate(page, context),
      healthToClass: (status) => this.healthToClass(status),
      renderAgentAvatar: (el, agent) => this.renderAgentAvatar(el, agent),
      renderAgentStat: (container, value, label) => this.renderAgentStat(container, value, label),
      formatTokenCount: (tokens) => formatTokenCount(tokens),
      cronToHuman: (cron) => cronToHuman(cron),
      timeUntil: (date) => this.timeUntil(date),
    };
  }

  /** View helpers handed to the run-history page (src/views/pages/runsPage.ts). */
  private runsPageDeps(): RunsPageDeps {
    return {
      ...this.basePageDeps(),
      navigate: (page, context) => this.navigate(page, context),
      openSlideover: (run) => this.openSlideover(run),
      formatStarted: (iso) => this.formatStarted(iso),
      formatDuration: (seconds) => this.formatDuration(seconds),
      statusToBadgeClass: (status) => this.statusToBadgeClass(status),
      statusToIconName: (status) => this.statusToIconName(status),
      statusToBadgeText: (status) => this.statusToBadgeText(status),
    };
  }

  /** View helpers handed to the skills-library page (src/views/pages/skillsPage.ts). */
  private skillsPageDeps(): SkillsPageDeps {
    return {
      ...this.basePageDeps(),
      navigate: (page, context) => this.navigate(page, context),
    };
  }

  /** View helpers handed to the approvals page (src/views/pages/approvalsPage.ts). */
  private approvalsPageDeps(): ApprovalsPageDeps {
    return {
      ...this.basePageDeps(),
      formatStarted: (iso) => this.formatStarted(iso),
      rerender: () => this.render(),
    };
  }

  /** View helpers handed to the channels page (src/views/pages/channelsPage.ts). */
  private channelsPageDeps(): ChannelsPageDeps {
    return {
      ...this.basePageDeps(),
      navigate: (page, context) => this.navigate(page, context),
      renderAgentStat: (container, value, label) => this.renderAgentStat(container, value, label),
    };
  }

  /** View helpers handed to the MCP servers page (src/views/pages/mcpPage.ts). */
  private mcpPageDeps(): McpPageDeps {
    return {
      ...this.basePageDeps(),
      navigate: (page) => this.navigate(page),
      renderDetailRow: (container, label, value) => this.renderDetailRow(container, label, value),
      rerender: () => this.render(),
      contentEl: this.contentEl,
      mcpProbeCache: this.mcpProbeCache,
      authenticatingServers: this.authenticatingServers,
    };
  }

  /** View helpers handed to the agent detail page (src/views/pages/agentDetailPage.ts). */
  private agentDetailPageDeps(): AgentDetailPageDeps {
    return {
      ...this.basePageDeps(),
      navigate: (page, context) => this.navigate(page, context),
      healthToClass: (status) => this.healthToClass(status),
      renderAgentAvatar: (el, agent) => this.renderAgentAvatar(el, agent),
      renderStatCard: (container, label, value, valueSuffix, iconName, sub) =>
        this.renderStatCard(container, label, value, valueSuffix, iconName, sub),
      combinedTotals: (runs, usage) => this.combinedTotals(runs, usage),
      renderTimelineItem: (container, run) => this.renderTimelineItem(container, run),
      renderConfigRow: (container, label, value) => this.renderConfigRow(container, label, value),
      statusToTimelineClass: (status) => this.statusToTimelineClass(status),
      statusToIconName: (status) => this.statusToIconName(status),
      statusToBadgeClass: (status) => this.statusToBadgeClass(status),
      statusToBadgeText: (status) => this.statusToBadgeText(status),
      formatStarted: (iso) => this.formatStarted(iso),
      formatDuration: (seconds) => this.formatDuration(seconds),
      formatTokenCount: (tokens) => formatTokenCount(tokens),
      cronToHuman: (cron) => cronToHuman(cron),
      timeUntil: (date) => this.timeUntil(date),
      openSlideover: (run) => this.openSlideover(run),
      openChatSlideover: (agent) => this.openChatSlideover(agent),
      getDetailTab: () => this.agentDetailTab,
      setDetailTab: (tab) => {
        this.agentDetailTab = tab;
      },
      rerender: () => this.render(),
    };
  }

  /** View helpers handed to the task detail page (src/views/pages/taskDetailPage.ts). */
  private taskDetailPageDeps(): TaskDetailPageDeps {
    return {
      ...this.basePageDeps(),
      navigate: (page, context) => this.navigate(page, context),
      renderConfigRow: (container, label, value) => this.renderConfigRow(container, label, value),
      renderTimelineItem: (container, run) => this.renderTimelineItem(container, run),
      humanizeCron: (cron) => this.humanizeCron(cron),
      formatStarted: (iso) => this.formatStarted(iso),
    };
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

    const dropdown = searchWrap.createDiv({ cls: "af-search-results" });

    if (results.length === 0) {
      dropdown.createDiv({
        cls: "af-search-result-empty",
        text: `No results for "${query}"`,
      });
      return;
    }

    for (const result of results.slice(0, 10)) {
      const item = dropdown.createDiv({ cls: "af-search-result-item" });
      createIcon(item, result.icon, "af-search-result-icon");
      item.createSpan({ text: result.label });
      item.onclick = () => {
        dropdown.remove();
        result.action();
      };
    }

    if (results.length > 10) {
      dropdown.createDiv({
        cls: "af-search-result-footer",
        text: `Showing 10 of ${results.length} results`,
      });
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

  private renderEmptyState(
    container: HTMLElement,
    iconName: string,
    label: string,
    sublabel: string,
    action?: { label: string; onClick: () => void },
  ): void {
    const empty = container.createDiv({ cls: "af-empty-state" });
    const iconEl = empty.createDiv({ cls: "af-empty-icon" });
    setIcon(iconEl, iconName);
    empty.createDiv({ cls: "af-empty-label", text: label });
    if (sublabel) {
      empty.createDiv({ cls: "af-empty-sublabel", text: sublabel });
    }
    if (action) {
      const actionBtn = empty.createEl("button", { cls: "af-btn-sm primary af-empty-action" });
      createIcon(actionBtn, "plus", "af-btn-icon");
      actionBtn.appendText(` ${action.label}`);
      actionBtn.onclick = () => action.onClick();
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════════════════

  /** Disable a form submit button and show a progress label while an async
   *  save is in flight (prevents double-submits). Returns a function that
   *  restores the original icon + label — call it on failure paths (success
   *  navigates away, which rebuilds the view). */
  private markSubmitBusy(
    btn: HTMLButtonElement,
    busyLabel: string,
    iconName: string,
    label: string,
  ): () => void {
    btn.disabled = true;
    btn.setText(busyLabel);
    return () => {
      btn.disabled = false;
      btn.setText("");
      createIcon(btn, iconName, "af-btn-icon");
      btn.appendText(` ${label}`);
    };
  }

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
    renderCreateAgentForm(page, this.agentFormDeps());
  }

  // ═══════════════════════════════════════════════════════
  //  Create Skill Page
  // ═══════════════════════════════════════════════════════

  private renderCreateSkillPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    renderSkillForm(page, this.skillFormDeps());
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

    renderEditAgentForm(page, this.agentFormDeps(), agent);
  }

  // ═══════════════════════════════════════════════════════
  //  Create Task Page
  // ═══════════════════════════════════════════════════════

  private renderCreateTaskPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    renderCreateTaskForm(page, this.taskFormDeps());
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

    renderEditTaskForm(page, this.taskFormDeps(), task);
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

    renderSkillForm(page, this.skillFormDeps(), skill);
  }

  // ═══════════════════════════════════════════════════════
  //  Add MCP Server Page
  // ═══════════════════════════════════════════════════════

  private renderAddMcpServerPage(container: HTMLElement): void {
    const page = container.createDiv({ cls: "af-create-agent-page" });
    renderAddMcpServerForm(page, this.mcpFormDeps());
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
