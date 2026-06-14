import { App, Modal, Setting } from "obsidian";

const PRESETS: Record<string, string> = {
  "Every 5 minutes": "*/5 * * * *",
  "Every 15 minutes": "*/15 * * * *",
  "Every 30 minutes": "*/30 * * * *",
  "Every hour": "0 * * * *",
  "Every day at 9am": "0 9 * * *",
  "Weekdays at 9am": "0 9 * * 1-5",
  "Weekly on Monday": "0 9 * * 1",
  "Monthly on 1st": "0 9 1 * *",
  Custom: "",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export class ScheduleEditorModal extends Modal {
  private selectedPreset = "Every hour";
  private hour = 9;
  private minute = 0;
  private selectedDays = [true, true, true, true, true, false, false];
  private customCron = "";
  private result: string;

  constructor(
    app: App,
    private readonly initialValue: string,
    private readonly onSave: (cron: string) => void,
  ) {
    super(app);
    this.result = initialValue;
    for (const [name, cron] of Object.entries(PRESETS)) {
      if (cron === initialValue) {
        this.selectedPreset = name;
        break;
      }
    }
    if (!Object.values(PRESETS).includes(initialValue) && initialValue) {
      this.selectedPreset = "Custom";
      this.customCron = initialValue;
    }
  }

  onOpen(): void {
    this.renderEditor();
  }

  private renderEditor(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("af-schedule-editor");
    contentEl.createEl("h3", { text: "Schedule Editor" });

    new Setting(contentEl).setName("Preset").addDropdown((dropdown) => {
      for (const name of Object.keys(PRESETS)) {
        dropdown.addOption(name, name);
      }
      dropdown.setValue(this.selectedPreset);
      dropdown.onChange((value) => {
        this.selectedPreset = value;
        this.updateResult();
        this.renderEditor();
      });
    });

    if (this.selectedPreset === "Custom") {
      new Setting(contentEl)
        .setName("Cron expression")
        .setDesc("Standard 5-field cron: min hour dom month dow")
        .addText((text) => {
          text.setValue(this.customCron);
          text.setPlaceholder("*/30 * * * *");
          text.onChange((value) => {
            this.customCron = value;
            this.result = value;
          });
        });
    } else if (this.needsTimePicker()) {
      const timeRow = contentEl.createDiv({ cls: "af-schedule-time-row" });
      timeRow.createSpan({ text: "Time: " });

      const hourSelect = timeRow.createEl("select", { cls: "af-select af-schedule-select" });
      for (let h = 0; h < 24; h++) {
        const opt = hourSelect.createEl("option", {
          text: String(h).padStart(2, "0"),
          attr: { value: String(h) },
        });
        if (h === this.hour) opt.selected = true;
      }
      hourSelect.onchange = () => {
        this.hour = parseInt(hourSelect.value);
        this.updateResult();
      };

      timeRow.createSpan({ text: " : " });

      const minSelect = timeRow.createEl("select", { cls: "af-select af-schedule-select" });
      for (let m = 0; m < 60; m += 5) {
        const opt = minSelect.createEl("option", {
          text: String(m).padStart(2, "0"),
          attr: { value: String(m) },
        });
        if (m === this.minute) opt.selected = true;
      }
      minSelect.onchange = () => {
        this.minute = parseInt(minSelect.value);
        this.updateResult();
      };
    }

    if (this.selectedPreset === "Weekly on Monday") {
      const dayRow = contentEl.createDiv({ cls: "af-schedule-day-row" });
      DAYS.forEach((day, i) => {
        const btn = dayRow.createEl("button", {
          cls: `af-schedule-day-btn${this.selectedDays[i] ? " active" : ""}`,
          text: day,
        });
        btn.onclick = () => {
          this.selectedDays[i] = !this.selectedDays[i];
          this.updateResult();
          this.renderEditor();
        };
      });
    }

    const preview = contentEl.createDiv({ cls: "af-schedule-preview" });
    preview.createSpan({ text: "Cron: " });
    preview.createEl("code", { text: this.result || "(none)" });

    new Setting(contentEl)
      .addButton((btn) => {
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.onSave(this.result);
            this.close();
          });
      })
      .addButton((btn) => {
        btn.setButtonText("Cancel").onClick(() => this.close());
      });
  }

  private needsTimePicker(): boolean {
    return ["Every day at 9am", "Weekdays at 9am", "Weekly on Monday", "Monthly on 1st"].includes(
      this.selectedPreset,
    );
  }

  private updateResult(): void {
    if (this.selectedPreset === "Custom") {
      this.result = this.customCron;
      return;
    }

    if (this.needsTimePicker()) {
      if (this.selectedPreset === "Weekly on Monday") {
        const days = this.selectedDays
          .map((sel, i) => (sel ? i + 1 : -1))
          .filter((d) => d >= 0)
          .join(",");
        this.result = `${this.minute} ${this.hour} * * ${days || "1"}`;
      } else if (this.selectedPreset === "Monthly on 1st") {
        this.result = `${this.minute} ${this.hour} 1 * *`;
      } else if (this.selectedPreset === "Weekdays at 9am") {
        this.result = `${this.minute} ${this.hour} * * 1-5`;
      } else {
        this.result = `${this.minute} ${this.hour} * * *`;
      }
    } else {
      this.result = PRESETS[this.selectedPreset] ?? "";
    }
  }
}
