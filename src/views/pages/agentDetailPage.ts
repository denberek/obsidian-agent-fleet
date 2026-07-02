import { Notice, setIcon } from "obsidian";
import type { AgentConfig, AgentHealth, RunLogData, UsageRecord } from "../../types";
import { truncate } from "../../utils/markdown";
import { createIcon } from "../../utils/icons";
import { renderSections } from "../../utils/memoryFormat";
import type { DashboardPageDeps } from "./shared";

/** View helpers the agent detail page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. The active tab is view state — the page reads and writes it
 *  through the get/set delegates so it survives re-renders. */
export interface AgentDetailPageDeps extends DashboardPageDeps {
  /** Navigate the dashboard to another page. */
  navigate: (page: "edit-agent", context?: string) => void;
  healthToClass: (status: AgentHealth) => string;
  /** Lucide icon / emoji / initials avatar renderer (owned by the view). */
  renderAgentAvatar: (el: HTMLElement, agent: AgentConfig) => void;
  /** Dashboard stat card (owned by the view, shared with the overview page). */
  renderStatCard: (
    container: HTMLElement,
    label: string,
    value: string,
    valueSuffix: string,
    iconName: string,
    sub: string,
  ) => void;
  /** Comprehensive token + cost totals across run logs and usage records. */
  combinedTotals: (runs: RunLogData[], usage: UsageRecord[]) => { tokens: number; cost: number };
  /** Run timeline entry shared with the overview page (owned by the view). */
  renderTimelineItem: (container: HTMLElement, run: RunLogData) => void;
  /** Label + monospace value config row (owned by the view). */
  renderConfigRow: (container: HTMLElement, label: string, value: string) => void;
  statusToTimelineClass: (status: string) => string;
  statusToIconName: (status: string) => string;
  statusToBadgeClass: (status: string) => string;
  statusToBadgeText: (status: string) => string;
  formatStarted: (iso: string) => string;
  formatDuration: (seconds: number) => string;
  formatTokenCount: (tokens: number) => string;
  cronToHuman: (cron: string) => string;
  timeUntil: (date: Date) => string;
  /** Open the run-details slideover (owned by the view). */
  openSlideover: (run: RunLogData) => void;
  /** Open the chat panel for this agent (owned by the view). */
  openChatSlideover: (agent: AgentConfig) => void;
  /** Active detail tab — view state so it survives re-renders. */
  getDetailTab: () => string;
  setDetailTab: (tab: string) => void;
  /** Re-render the whole dashboard view (tab switches). */
  rerender: () => Promise<void>;
}

export function renderAgentDetailPage(container: HTMLElement, deps: AgentDetailPageDeps, agentName: string | undefined): void {
  const page = container.createDiv({ cls: "af-agent-detail-page" });
  if (!agentName) {
    deps.renderEmptyState(page, "bot", "No agent selected", "Select an agent from the list");
    return;
  }

  const agent = deps.plugin.runtime.getSnapshot().agents.find((a) => a.name === agentName);
  if (!agent) {
    deps.renderEmptyState(page, "bot", "Agent not found", `Agent "${agentName}" was not found`);
    return;
  }

  const state = deps.plugin.runtime.getAgentState(agent.name);
  const agentRuns = deps.plugin.runtime.getRecentRuns().filter((r) => r.agent === agent.name);

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  const avatar = headerLeft.createDiv({
    cls: `af-agent-card-avatar ${deps.healthToClass(state.status)}`,
  });
  deps.renderAgentAvatar(avatar, agent);
  const headerInfo = headerLeft.createDiv();
  headerInfo.createDiv({ cls: "af-detail-header-name", text: agent.name });
  headerInfo.createDiv({ cls: "af-detail-header-desc", text: agent.description ?? "No description" });

  const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

  // Chat — primary action
  const chatBtn = headerActions.createEl("button", { cls: "af-btn-sm primary" });
  createIcon(chatBtn, "message-circle", "af-btn-icon");
  chatBtn.appendText(" Chat");
  chatBtn.onclick = () => deps.openChatSlideover(agent);

  // Run Now / Enable — secondary
  if (agent.enabled) {
    const runBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
    createIcon(runBtn, "play", "af-btn-icon");
    runBtn.appendText(" Run Now");
    runBtn.onclick = () => void deps.plugin.runAgentPrompt(agent.name);

    const pauseBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
    createIcon(pauseBtn, "pause", "af-btn-icon");
    pauseBtn.appendText(" Disable");
    pauseBtn.onclick = () => void deps.plugin.toggleAgent(agent.name, false);
  } else {
    const enableBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
    createIcon(enableBtn, "play", "af-btn-icon");
    enableBtn.appendText(" Enable");
    enableBtn.onclick = () => void deps.plugin.toggleAgent(agent.name, true);
  }

  const detailEditBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
  createIcon(detailEditBtn, "edit", "af-btn-icon");
  detailEditBtn.appendText(" Edit");
  detailEditBtn.onclick = () => deps.navigate("edit-agent", agent.name);

  const deleteBtn = headerActions.createEl("button", { cls: "af-btn-sm danger" });
  createIcon(deleteBtn, "trash-2", "af-btn-icon");
  deleteBtn.appendText(" Delete");
  deleteBtn.onclick = () => void deps.plugin.deleteAgent(agent.name);

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
      cls: `af-detail-tab${deps.getDetailTab() === t.id ? " active" : ""}`,
    });
    createIcon(tabBtn, t.icon, "af-tab-icon");
    tabBtn.appendText(` ${t.label}`);
    tabBtn.onclick = () => {
      deps.setDetailTab(t.id);
      void deps.rerender();
    };
  }

  const tabContent = page.createDiv({ cls: "af-detail-tab-content" });
  switch (deps.getDetailTab()) {
    case "overview":
      renderAgentOverviewTab(tabContent, deps, agent, agentRuns);
      break;
    case "config":
      renderAgentConfigTab(tabContent, deps, agent);
      break;
    case "runs":
      renderAgentRunsTab(tabContent, deps, agentRuns);
      break;
    case "memory":
      void renderAgentMemoryTab(tabContent, deps, agent);
      break;
  }
}

function renderAgentOverviewTab(container: HTMLElement, deps: AgentDetailPageDeps, agent: AgentConfig, runs: RunLogData[]): void {
  // Stats row
  const statsRow = container.createDiv({ cls: "af-dash-grid" });
  const totalRuns = runs.length;
  const successRuns = runs.filter((r) => r.status === "success").length;
  const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;
  const avgTime = totalRuns > 0 ? Math.round(runs.reduce((s, r) => s + r.durationSeconds, 0) / totalRuns) : 0;
  // Comprehensive: this agent's run logs + its chat/channel usage over the window.
  const agentUsage = deps.plugin.runtime.getUsageRecords().filter((u) => u.agent === agent.name);
  const { tokens: totalTokens, cost: totalCostAgent } = deps.combinedTotals(runs, agentUsage);
  const costSuffixAgent = totalCostAgent > 0 ? ` \u00B7 $${totalCostAgent.toFixed(2)}` : "";

  deps.renderStatCard(statsRow, "Total Runs", String(totalRuns), "", "activity", "all time");
  deps.renderStatCard(statsRow, "Success Rate", `${successRate}%`, "", "check-circle-2", `${successRuns}/${totalRuns}`);
  deps.renderStatCard(statsRow, "Avg Time", `${avgTime}s`, "", "clock", "per run");
  deps.renderStatCard(statsRow, "Total Tokens", deps.formatTokenCount(totalTokens), "", "zap", `all time${costSuffixAgent}`);

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
      await deps.plugin.repository.updateHeartbeat(agent.name, { enabled: !isOn });
      await deps.plugin.refreshFromVault();
      new Notice(`Heartbeat ${!isOn ? "enabled" : "paused"} for ${agent.name}`);
    };

    const hbBody = hbSection.createDiv({ cls: "af-config-form" });
    deps.renderConfigRow(hbBody, "Schedule", deps.cronToHuman(agent.heartbeatSchedule));
    const nextRun = deps.plugin.runtime.getNextHeartbeat(agent.name);
    if (nextRun && agent.heartbeatEnabled) {
      deps.renderConfigRow(hbBody, "Next run", deps.timeUntil(nextRun));
    }
    if (agent.heartbeatChannel) {
      deps.renderConfigRow(hbBody, "Channel", agent.heartbeatChannel);
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

    const cachedServers = deps.plugin.repository.getMcpServers();
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
    deps.renderConfigRow(permBody, "Mode", agent.permissionMode || "default");
    if (agent.permissionRules.allow.length > 0) {
      deps.renderConfigRow(permBody, "Allowed", agent.permissionRules.allow.join(", "));
    }
    if (agent.permissionRules.deny.length > 0) {
      deps.renderConfigRow(permBody, "Denied", agent.permissionRules.deny.join(", "));
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
    deps.renderEmptyState(runsBody, "scroll-text", "No runs yet", "");
  } else {
    for (const run of runs.slice(0, 5)) {
      deps.renderTimelineItem(runsBody, run);
    }
  }
}

function renderAgentConfigTab(container: HTMLElement, deps: AgentDetailPageDeps, agent: AgentConfig): void {
  const form = container.createDiv({ cls: "af-config-form" });

  deps.renderConfigRow(form, "Name", agent.name);
  deps.renderConfigRow(form, "Description", agent.description ?? "");
  deps.renderConfigRow(form, "Model", agent.model);
  deps.renderConfigRow(form, "Timeout", `${agent.timeout}s`);
  deps.renderConfigRow(form, "Working Directory", agent.cwd ?? "(vault root)");
  deps.renderConfigRow(form, "Permission Mode", agent.permissionMode || "default");
  deps.renderConfigRow(form, "Approval Required", agent.approvalRequired.join(", ") || "none");
  if (agent.permissionRules.allow.length > 0) {
    deps.renderConfigRow(form, "Allowed Commands", agent.permissionRules.allow.join(", "));
  }
  if (agent.permissionRules.deny.length > 0) {
    deps.renderConfigRow(form, "Blocked Commands", agent.permissionRules.deny.join(", "));
  }
  deps.renderConfigRow(form, "Memory", agent.memory ? "Enabled" : "Disabled");
  deps.renderConfigRow(
    form,
    "Auto-compact",
    agent.autoCompactThreshold && agent.autoCompactThreshold > 0
      ? `at ${agent.autoCompactThreshold}% context`
      : "disabled",
  );
  if (agent.wikiReferences && agent.wikiReferences.length > 0) {
    deps.renderConfigRow(
      form,
      "Wiki access",
      agent.wikiReferences.map((r) => r.agent).join(", "),
    );
  }
  deps.renderConfigRow(form, "Tags", agent.tags.join(", ") || "none");

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
  editBtn.onclick = () => deps.navigate("edit-agent", agent.name);
}

function renderAgentRunsTab(container: HTMLElement, deps: AgentDetailPageDeps, runs: RunLogData[]): void {
  if (runs.length === 0) {
    deps.renderEmptyState(container, "scroll-text", "No runs yet", "Run this agent to see history");
    return;
  }

  for (const run of runs) {
    const item = container.createDiv({ cls: "af-run-list-item" });

    const statusIcon = item.createDiv({ cls: `af-tl-icon ${deps.statusToTimelineClass(run.status)}` });
    setIcon(statusIcon, deps.statusToIconName(run.status));

    const body = item.createDiv({ cls: "af-tl-body" });
    const titleRow = body.createDiv({ cls: "af-tl-title" });
    titleRow.createSpan({ text: run.task });
    titleRow.createSpan({ cls: `af-status-badge ${deps.statusToBadgeClass(run.status)}`, text: deps.statusToBadgeText(run.status) });

    const meta = body.createDiv({ cls: "af-tl-meta" });
    meta.createSpan({ text: `${deps.formatStarted(run.started)} \u00B7 ${deps.formatDuration(run.durationSeconds)}` });
    if (run.tokensUsed) {
      meta.createSpan({ text: `${run.tokensUsed.toLocaleString()} tokens` });
    }

    body.createDiv({ cls: "af-tl-desc", text: truncate(run.output, 120) });

    item.onclick = () => deps.openSlideover(run);
  }
}

async function renderAgentMemoryTab(container: HTMLElement, deps: AgentDetailPageDeps, agent: AgentConfig): Promise<void> {
  if (!agent.memory) {
    deps.renderEmptyState(container, "file-text", "Memory disabled", "Enable memory in agent config");
    return;
  }

  const wm = await deps.plugin.repository.readWorkingMemory(agent.name);

  // Header: token usage vs budget + reflection status.
  const meta = container.createDiv({ cls: "af-form-help" });
  const used = wm?.tokenEstimate ?? 0;
  const reflectBits = agent.reflection.enabled
    ? `reflection on (${agent.reflection.schedule})`
    : "reflection off";
  meta.setText(`~${used} / ${agent.memoryTokenBudget} tokens · ${reflectBits}`);

  if (!wm || wm.sections.length === 0) {
    deps.renderEmptyState(container, "file-text", "No memories yet", "Agent will learn from runs");
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
    const res = await deps.plugin.runtime.runReflectionNow(agent.name);
    new Notice(`Agent Fleet: ${res.message}`);
    await renderAgentMemoryTab((container.empty(), container), deps, agent);
  };

  const editBtn = actions.createEl("button", { cls: "af-btn-sm" });
  createIcon(editBtn, "external-link", "af-btn-icon");
  editBtn.appendText(" Open in Editor");
  editBtn.onclick = () =>
    void deps.plugin.openPath(deps.plugin.repository.getWorkingMemoryPath(agent.name));
}
