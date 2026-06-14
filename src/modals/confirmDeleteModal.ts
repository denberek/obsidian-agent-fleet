import { App, Modal, Setting, setIcon } from "obsidian";

interface DeleteAgentInfo {
  agentName: string;
  taskCount: number;
  runCount: number;
  hasMemory: boolean;
}

export class ConfirmDeleteModal extends Modal {
  private deleteTasks = true;

  constructor(
    app: App,
    private readonly info: DeleteAgentInfo,
    private readonly onConfirm: (deleteTasks: boolean) => void | Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("af-confirm-delete-modal");

    // Header
    const header = contentEl.createDiv({ cls: "af-delete-header" });
    const iconEl = header.createSpan({ cls: "af-delete-header-icon" });
    setIcon(iconEl, "alert-triangle");
    header.createEl("h3", { text: `Delete agent "${this.info.agentName}"?` });

    // Impact summary
    const summary = contentEl.createDiv({ cls: "af-delete-summary" });
    summary.createDiv({ text: "This action will:" });

    const list = summary.createEl("ul", { cls: "af-delete-impact-list" });
    list.createEl("li", { text: "Move the agent definition to trash" });

    if (this.info.hasMemory) {
      list.createEl("li", { text: "Move the agent's memory file to trash" });
    }

    if (this.info.taskCount > 0) {
      const taskItem = list.createEl("li");
      taskItem.setText(
        `${this.info.taskCount} task${this.info.taskCount !== 1 ? "s" : ""} reference this agent`,
      );
    }

    if (this.info.runCount > 0) {
      const runItem = list.createEl("li", { cls: "af-delete-preserved" });
      runItem.setText(
        `${this.info.runCount} run log${this.info.runCount !== 1 ? "s" : ""} will be preserved`,
      );
    }

    contentEl.createDiv({
      cls: "af-delete-note",
      text: "Files are moved to your system trash and can be recovered.",
    });

    // Task deletion toggle
    if (this.info.taskCount > 0) {
      new Setting(contentEl)
        .setName("Also delete associated tasks")
        .setDesc(`Delete ${this.info.taskCount} task${this.info.taskCount !== 1 ? "s" : ""} that reference this agent`)
        .addToggle((toggle) => {
          toggle.setValue(this.deleteTasks);
          toggle.onChange((value) => {
            this.deleteTasks = value;
          });
        });
    }

    // Action buttons
    const actions = contentEl.createDiv({ cls: "af-delete-actions" });

    const cancelBtn = actions.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    const deleteBtn = actions.createEl("button", {
      cls: "af-delete-confirm-btn",
      text: "Delete Agent",
    });
    const deleteIcon = deleteBtn.createSpan({ cls: "af-delete-btn-icon" });
    setIcon(deleteIcon, "trash-2");
    deleteBtn.onclick = () => {
      void this.onConfirm(this.deleteTasks);
      this.close();
    };
  }
}
