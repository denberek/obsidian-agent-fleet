import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_AGENTS } from "../constants";
import type AgentFleetPlugin from "../main";
import type { AgentHealth } from "../types";

interface NavItem {
  icon: string;
  label: string;
  page: string;
  badge?: () => number;
}

export class SidebarView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: AgentFleetPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_AGENTS;
  }

  getDisplayText(): string {
    return "Agent Fleet";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    this.plugin.subscribeView(this);
    await this.render();
  }

  async onClose(): Promise<void> {
    this.plugin.unsubscribeView(this);
  }

  async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("af-sidebar");

    const snapshot = this.plugin.runtime.getSnapshot();
    const status = this.plugin.runtime.getFleetStatus();

    // ─── Navigation ───
    const navSection = root.createDiv({ cls: "af-sidebar-section" });
    navSection.createDiv({ cls: "af-sidebar-section-header", text: "AGENT FLEET" });

    const navItems: NavItem[] = [
      { icon: "layout-dashboard", label: "Dashboard", page: "dashboard" },
      { icon: "bot", label: "Agents", page: "agents", badge: () => snapshot.agents.length },
      { icon: "columns-3", label: "Tasks Board", page: "kanban" },
      { icon: "scroll-text", label: "Run History", page: "runs" },
      { icon: "shield-check", label: "Approvals", page: "approvals", badge: () => status.pending },
      { icon: "puzzle", label: "Skills", page: "skills", badge: () => snapshot.skills.length },
      { icon: "plug", label: "MCP Servers", page: "mcp", badge: () => this.plugin.repository.getMcpServers().length },
      {
        icon: "radio",
        label: "Channels",
        page: "channels",
        badge: () => this.plugin.channelManager?.getConnectedCount() ?? snapshot.channels.length,
      },
    ];

    for (const item of navItems) {
      const navEl = navSection.createDiv({ cls: "af-sidebar-nav-item" });
      const iconEl = navEl.createSpan({ cls: "af-sidebar-nav-icon" });
      setIcon(iconEl, item.icon);
      navEl.createSpan({ cls: "af-sidebar-nav-label", text: item.label });

      const badgeValue = item.badge?.();
      if (badgeValue !== undefined && badgeValue > 0) {
        navEl.createSpan({ cls: "af-sidebar-badge", text: String(badgeValue) });
      }

      navEl.setAttribute("role", "button");
      navEl.setAttribute("tabindex", "0");
      navEl.onclick = () => void this.plugin.navigateDashboard(item.page);
      navEl.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void this.plugin.navigateDashboard(item.page); } };
    }

    // ─── Agents List ───
    const agentSection = root.createDiv({ cls: "af-sidebar-section" });
    agentSection.createDiv({ cls: "af-sidebar-section-header", text: "AGENTS" });

    if (snapshot.agents.length === 0) {
      agentSection.createDiv({ cls: "af-sidebar-empty", text: "No agents configured" });
    }

    for (const agent of snapshot.agents) {
      const state = this.plugin.runtime.getAgentState(agent.name);
      const agentEl = agentSection.createDiv({ cls: "af-sidebar-agent-item" });
      agentEl.createSpan({ cls: `af-sidebar-agent-dot ${this.healthToClass(state.status)}` });
      agentEl.createSpan({ cls: "af-sidebar-agent-name", text: agent.name });
      agentEl.setAttribute("role", "button");
      agentEl.setAttribute("tabindex", "0");
      agentEl.onclick = () => void this.plugin.navigateDashboard("agent-detail", agent.name);
      agentEl.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void this.plugin.navigateDashboard("agent-detail", agent.name); } };
    }

    // ─── Quick Actions ───
    const quickSection = root.createDiv({ cls: "af-sidebar-section" });
    quickSection.createDiv({ cls: "af-sidebar-section-header", text: "QUICK ACTIONS" });

    this.renderQuickAction(quickSection, "plus", "New Agent", () => void this.plugin.createAgentTemplate());
    this.renderQuickAction(quickSection, "plus", "New Task", () => void this.plugin.openCreateTask());
    this.renderQuickAction(quickSection, "plus", "New Skill", () => void this.plugin.createSkillTemplate());
  }

  private renderQuickAction(container: HTMLElement, icon: string, label: string, onClick: () => void): void {
    const item = container.createDiv({ cls: "af-sidebar-action-item" });
    const iconEl = item.createSpan({ cls: "af-sidebar-action-icon" });
    setIcon(iconEl, icon);
    item.createSpan({ text: label });
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.onclick = onClick;
    item.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } };
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
}
