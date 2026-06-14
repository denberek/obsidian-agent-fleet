import { App, Modal, Setting } from "obsidian";

interface ConfirmOptions {
  title: string;
  /** Body text. Newlines become separate paragraphs. */
  body: string;
  /** Label for the confirm button (default "Confirm"). */
  confirmText?: string;
  /** Style the confirm button as destructive (default false). */
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Small generic confirm dialog. Replaces the browser confirm dialog (disallowed by the
 * Obsidian plugin guidelines) with a native modal.
 */
export class ConfirmModal extends Modal {
  constructor(app: App, private readonly opts: ConfirmOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.opts.title });
    for (const para of this.opts.body.split("\n\n")) {
      if (para.trim()) contentEl.createEl("p", { text: para });
    }

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => {
        b.setButtonText(this.opts.confirmText ?? "Confirm").onClick(() => {
          this.close();
          void this.opts.onConfirm();
        });
        if (this.opts.danger) b.setWarning();
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
