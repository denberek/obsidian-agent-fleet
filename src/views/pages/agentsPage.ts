import { Notice, setIcon } from "obsidian";
import type { AgentConfig, AgentHealth, RunLogData, SkillConfig, TaskConfig } from "../../types";
import { createIcon } from "../../utils/icons";
import type { DashboardPageDeps } from "./shared";

/** View helpers the agents page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. */
export interface AgentsPageDeps extends DashboardPageDeps {
  /** Navigate the dashboard to another page. */
  navigate: (page: "agent-detail" | "edit-agent", context?: string) => void;
  healthToClass: (status: AgentHealth) => string;
  /** Lucide icon / emoji / initials avatar renderer (owned by the view). */
  renderAgentAvatar: (el: HTMLElement, agent: AgentConfig) => void;
  /** Value + label stat cell shared with the channel cards (owned by the view). */
  renderAgentStat: (container: HTMLElement, value: string, label: string) => void;
  formatTokenCount: (tokens: number) => string;
  cronToHuman: (cron: string) => string;
  timeUntil: (date: Date) => string;
}

export function renderAgentsPage(container: HTMLElement, deps: AgentsPageDeps): void {
  const page = container.createDiv({ cls: "af-agents-page" });
  const snapshot = deps.plugin.runtime.getSnapshot();

  const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
  toolbar.createDiv({ cls: "af-page-title", text: "Agents" });
  toolbar.createDiv({ cls: "af-toolbar-spacer" });

  const newBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
  createIcon(newBtn, "plus", "af-btn-icon");
  newBtn.appendText(" New Agent");
  newBtn.onclick = () => void deps.plugin.createAgentTemplate();

  const grid = page.createDiv({ cls: "af-agents-grid" });

  if (snapshot.agents.length === 0) {
    deps.renderEmptyState(grid, "bot", "No agents configured", "Create your first agent to get started", {
      label: "New Agent",
      onClick: () => void deps.plugin.createAgentTemplate(),
    });
    return;
  }

  // Fetch runs once and group by agent — avoids re-filtering the full run
  // list for every card (O(agents × runs)).
  const runsByAgent = new Map<string, RunLogData[]>();
  for (const run of deps.plugin.runtime.getRecentRuns()) {
    const list = runsByAgent.get(run.agent);
    if (list) {
      list.push(run);
    } else {
      runsByAgent.set(run.agent, [run]);
    }
  }

  for (const agent of snapshot.agents) {
    renderAgentCard(grid, deps, agent, snapshot, runsByAgent.get(agent.name) ?? []);
  }
}

function renderAgentCard(
  container: HTMLElement,
  deps: AgentsPageDeps,
  agent: AgentConfig,
  snapshot: { tasks: TaskConfig[]; skills: SkillConfig[] },
  agentRuns: RunLogData[],
): void {
  const state = deps.plugin.runtime.getAgentState(agent.name);

  const card = container.createDiv({ cls: `af-agent-card${agent.enabled ? "" : " disabled"}` });

  // Header
  const header = card.createDiv({ cls: "af-agent-card-header" });
  const avatarCls = agent.enabled ? deps.healthToClass(state.status) : "disabled";
  const avatar = header.createDiv({ cls: `af-agent-card-avatar ${avatarCls}` });
  deps.renderAgentAvatar(avatar, agent);

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
    void deps.plugin.toggleAgent(agent.name, !agent.enabled);
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

  deps.renderAgentStat(stats, String(totalRuns), "Runs");
  deps.renderAgentStat(stats, `${successRate}%`, "Success");
  deps.renderAgentStat(stats, `${avgTime}s`, "Avg Time");
  deps.renderAgentStat(stats, deps.formatTokenCount(totalTokens), "Tokens");

  // Skills
  if (agent.skills.length > 0) {
    const skillsRow = card.createDiv({ cls: "af-agent-card-skills" });
    for (const skill of agent.skills) {
      skillsRow.createSpan({ cls: "af-skill-tag", text: skill });
    }
  }

  // Heartbeat status — same gate + next-run source as the agent detail
  // Overview tab, with the same quick toggle (repository.updateHeartbeat).
  if (agent.isFolder && (agent.heartbeatBody.trim() || agent.heartbeatEnabled)) {
    const hbRow = card.createDiv({ cls: "af-agent-card-heartbeat" });
    const hbRowIcon = hbRow.createSpan({ cls: "af-agent-card-hb-icon" });
    setIcon(hbRowIcon, "heart-pulse");

    const parts: string[] = [deps.cronToHuman(agent.heartbeatSchedule)];
    if (agent.heartbeatEnabled) {
      const nextHb = deps.plugin.runtime.getNextHeartbeat(agent.name);
      if (nextHb) parts.push(`next ${deps.timeUntil(nextHb)}`);
    } else {
      parts.push("paused");
    }
    hbRow.createSpan({
      cls: "af-agent-card-hb-text",
      text: `Heartbeat · ${parts.join(" · ")}`,
    });

    const hbToggle = hbRow.createDiv({
      cls: `af-agent-card-toggle af-agent-card-toggle-sm${agent.heartbeatEnabled ? " on" : ""}`,
    });
    hbToggle.title = agent.heartbeatEnabled ? "Pause heartbeat" : "Enable heartbeat";
    hbToggle.onclick = (e) => {
      e.stopPropagation();
      void (async () => {
        await deps.plugin.repository.updateHeartbeat(agent.name, { enabled: !agent.heartbeatEnabled });
        await deps.plugin.refreshFromVault();
        new Notice(`Heartbeat ${!agent.heartbeatEnabled ? "enabled" : "paused"} for ${agent.name}`);
      })();
    };
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
      void deps.plugin.toggleAgent(agent.name, true);
    };
  }

  const editBtn = actions.createEl("button", { cls: "af-btn-sm" });
  createIcon(editBtn, "edit", "af-btn-icon");
  editBtn.appendText(" Edit");
  editBtn.onclick = (e) => {
    e.stopPropagation();
    deps.navigate("edit-agent", agent.name);
  };

  if (agent.enabled) {
    const runBtn = actions.createEl("button", { cls: "af-btn-sm primary" });
    createIcon(runBtn, "play", "af-btn-icon");
    runBtn.appendText(" Run");
    runBtn.onclick = (e) => {
      e.stopPropagation();
      void deps.plugin.runAgentPrompt(agent.name);
    };
  }

  card.onclick = () => deps.navigate("agent-detail", agent.name);
}
