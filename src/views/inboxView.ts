import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE_INBOX } from "../constants";
import type AgentFleetPlugin from "../main";
import type { RunLogData } from "../types";
import { truncate } from "../utils/markdown";

export class InboxView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: AgentFleetPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_INBOX;
  }

  getDisplayText(): string {
    return "Agent Fleet Inbox";
  }

  getIcon(): string {
    return "inbox";
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
    header.createEl("h3", { text: "Inbox" });
    header.createEl("button", { text: "Refresh" }).onclick = () => void this.plugin.refreshFromVault();

    // Skill proposals from reflection (memory → skills, §9).
    const proposals = await this.plugin.runtime.listPendingProposals();
    if (proposals.length > 0) {
      const box = root.createDiv({ cls: "agent-fleet-section" });
      box.createEl("h4", { text: `Skill Proposals (${proposals.length})` });
      for (const p of proposals) {
        const card = box.createDiv({ cls: "agent-fleet-card" });
        card.createDiv({
          text: `💡 ${p.targetSkill ?? "new skill"} · from ${p.agent}`,
          cls: "agent-fleet-card-title",
        });
        card.createDiv({ text: p.rationale, cls: "agent-fleet-card-subtitle" });
        if (p.evidence.length > 0) {
          card.createDiv({ text: `${p.evidence.length} evidence ref(s)`, cls: "agent-fleet-meta" });
        }
        const actions = card.createDiv({ cls: "agent-fleet-actions" });
        actions.createEl("button", { text: "Accept" }).onclick = async () => {
          const res = await this.plugin.runtime.acceptProposal(p.id);
          new Notice(`Agent Fleet: ${res.message}`);
          await this.render();
        };
        actions.createEl("button", { text: "Reject" }).onclick = async () => {
          await this.plugin.runtime.rejectProposal(p.id);
          await this.render();
        };
        actions.createEl("button", { text: "View" }).onclick = () =>
          void this.plugin.openPath(`${this.plugin.repository.getProposalsDir()}/${p.id}.md`);
      }
    }

    const runs = this.plugin.runtime.getRecentRuns();
    const approvals = runs.filter((run) => (run.approvals ?? []).some((approval) => approval.status === "pending"));

    if (approvals.length > 0) {
      const box = root.createDiv({ cls: "agent-fleet-section" });
      box.createEl("h4", { text: `Needs Attention (${approvals.length})` });
      for (const run of approvals) {
        this.renderRun(box, run, true);
      }
    }

    const timeline = root.createDiv({ cls: "agent-fleet-section" });
    timeline.createEl("h4", { text: "Recent Runs" });
    for (const run of runs.slice(0, 30)) {
      this.renderRun(timeline, run, false);
    }
  }

  private renderRun(container: HTMLElement, run: RunLogData, includeActions: boolean): void {
    const card = container.createDiv({ cls: "agent-fleet-card" });
    card.createDiv({ text: `${this.iconForStatus(run.status)} ${run.agent} · ${run.task}`, cls: "agent-fleet-card-title" });
    card.createDiv({ text: `${run.started} · ${run.durationSeconds}s`, cls: "agent-fleet-meta" });
    card.createDiv({ text: truncate(run.output, 160), cls: "agent-fleet-card-subtitle" });
    card.onclick = () => {
      if (run.filePath) {
        void this.plugin.openPath(run.filePath);
      }
    };

    if (includeActions) {
      const actions = card.createDiv({ cls: "agent-fleet-actions" });
      for (const approval of run.approvals ?? []) {
        if (approval.status !== "pending") {
          continue;
        }
        actions.createEl("button", { text: `Approve ${approval.tool}` }).onclick = () =>
          void this.plugin.runtime.resolveApproval(run, approval.tool, "approved");
        actions.createEl("button", { text: `Reject ${approval.tool}` }).onclick = () =>
          void this.plugin.runtime.resolveApproval(run, approval.tool, "rejected");
      }
    }
  }

  private iconForStatus(status: string): string {
    switch (status) {
      case "success":
        return "✅";
      case "pending_approval":
        return "🔵";
      case "timeout":
        return "⏱";
      default:
        return "❌";
    }
  }
}
