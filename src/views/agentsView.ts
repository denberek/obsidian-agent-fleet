import { ItemView, Menu, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_AGENTS } from "../constants";
import type AgentFleetPlugin from "../main";
import { truncate } from "../utils/markdown";

export class AgentsView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: AgentFleetPlugin) {
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
    root.addClass("agent-fleet-view");

    const header = root.createDiv({ cls: "agent-fleet-header" });
    header.createEl("h3", { text: "Agent Fleet" });
    const actions = header.createDiv({ cls: "agent-fleet-actions" });
    actions.createEl("button", { text: "+" }).onclick = () => void this.plugin.createAgentTemplate();

    const snapshot = this.plugin.runtime.getSnapshot();
    if (snapshot.validationIssues.length > 0) {
      const issues = root.createDiv({ cls: "agent-fleet-issues" });
      issues.createEl("strong", { text: "Validation issues" });
      for (const issue of snapshot.validationIssues) {
        issues.createEl("div", { text: `${issue.path}: ${issue.message}` });
      }
    }

    for (const agent of snapshot.agents) {
      const state = this.plugin.runtime.getAgentState(agent.name);
      const section = root.createDiv({ cls: "agent-fleet-card" });
      const cardTitle = section.createDiv({ cls: "agent-fleet-card-title" });
      const avatarEl = cardTitle.createSpan({ cls: "agent-fleet-card-avatar" });
      this.renderAgentAvatar(avatarEl, agent.avatar);
      cardTitle.createSpan({ text: agent.name });
      section.createDiv({ text: truncate(agent.description ?? "No description", 100), cls: "agent-fleet-card-subtitle" });
      const tasks = snapshot.tasks.filter((task) => task.agent === agent.name);
      const nextRun = tasks.map((task) => task.nextRun).filter(Boolean).sort()[0];
      section.createDiv({
        text: state.status === "running" ? "Running now" : nextRun ? `Next run: ${nextRun}` : `Tasks: ${tasks.length}`,
        cls: "agent-fleet-meta",
      });

      section.onclick = () => void this.plugin.openPath(agent.filePath);
      section.oncontextmenu = (event) => {
        event.preventDefault();
        const menu = new Menu();
        menu.addItem((item) => item.setTitle("Run Now").onClick(() => void this.plugin.runAgentPrompt(agent.name)));
        menu.addItem((item) => item.setTitle("Chat").onClick(() => void this.plugin.chatWithAgent(agent.name)));
        menu.addItem((item) => item.setTitle("New Task").onClick(() => void this.plugin.openCreateTask()));
        menu.addItem((item) => item.setTitle("View Memory").onClick(() => void this.plugin.openPath(this.plugin.repository.getMemoryPath(agent.name))));
        menu.addItem((item) =>
          item.setTitle(agent.enabled ? "Disable" : "Enable").onClick(() => void this.plugin.toggleAgent(agent.name, !agent.enabled)),
        );
        menu.showAtMouseEvent(event);
      };

      const taskList = section.createEl("ul", { cls: "agent-fleet-task-list" });
      for (const task of tasks.slice(0, 3)) {
        const li = taskList.createEl("li");
        li.setText(`${task.taskId} · ${task.schedule ?? task.runAt ?? "manual"}`);
      }
    }
  }

  private renderAgentAvatar(el: HTMLElement, avatar: string | undefined): void {
    const trimmed = avatar?.trim();
    if (!trimmed) {
      setIcon(el, "bot");
      return;
    }
    if (/^[a-z][a-z0-9-]*$/.test(trimmed)) {
      setIcon(el, trimmed);
    } else {
      el.setText(trimmed);
    }
  }

  private iconForState(state: string): string {
    switch (state) {
      case "running":
        return "🟡";
      case "error":
        return "🔴";
      case "pending":
        return "🔵";
      case "disabled":
        return "⚫";
      default:
        return "🟢";
    }
  }
}
