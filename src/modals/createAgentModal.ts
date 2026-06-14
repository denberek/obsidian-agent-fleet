import { App, Modal, Notice, Setting, TextAreaComponent, TextComponent, ToggleComponent, setIcon } from "obsidian";
import type { FleetSnapshot, SkillConfig } from "../types";
import { slugify } from "../utils/markdown";
import type { FleetRepository } from "../fleetRepository";

const TEMPLATE_PRESETS: Record<string, { label: string; prompt: string }> = {
  none: { label: "None", prompt: "" },
  coding: {
    label: "Coding Agent",
    prompt:
      "You are a coding agent. Review code, write tests, fix bugs, and implement features.\nFollow existing code conventions. Write clean, well-tested code.\nIf something is unclear, ask for clarification instead of guessing.",
  },
  monitor: {
    label: "Monitor",
    prompt:
      "You are a monitoring agent. Check system status, alert on failures, and report on health metrics.\nBe concise and factual. Highlight anomalies clearly.\nInclude timestamps and relevant context in all reports.",
  },
  briefing: {
    label: "Briefing",
    prompt:
      "You are a briefing agent. Summarize activity, generate reports, and surface key changes.\nPrioritize recent and important changes. Keep summaries concise.\nEnd with explicit next actions if they exist.",
  },
  reviewer: {
    label: "Code Reviewer",
    prompt:
      "You are a code review agent. Analyze pull requests, suggest improvements, and flag potential issues.\nFocus on correctness, security, and maintainability.\nBe specific — reference file names and line numbers.",
  },
};

const ADAPTER_OPTIONS = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

const PERMISSION_OPTIONS = [
  { value: "bypassPermissions", label: "Bypass Permissions" },
  { value: "default", label: "Default" },
];

interface CreateAgentModalOptions {
  repository: FleetRepository;
  snapshot: FleetSnapshot;
  onCreated: (agentName: string) => Promise<void>;
}

export class CreateAgentModal extends Modal {
  // Identity
  private agentName = "";
  private description = "";
  private avatar = "";
  private tags = "";

  // System prompt
  private systemPrompt = "";
  private selectedTemplate = "none";

  // Runtime config
  private model = "default";
  private adapter = "claude-code";
  private cwd = "";
  private timeout = 300;
  private permissionMode = "bypassPermissions";

  // Skills
  private selectedSharedSkills = new Set<string>();
  private agentSkillsBody = "";

  // Context
  private contextBody = "";

  // Permissions
  private approvalRequired = "";
  private memoryEnabled = true;

  private promptTextArea?: TextAreaComponent;

  constructor(app: App, private readonly options: CreateAgentModalOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("af-create-agent-modal");

    // Header
    const header = contentEl.createDiv({ cls: "af-create-header" });
    const headerIcon = header.createSpan({ cls: "af-create-header-icon" });
    setIcon(headerIcon, "bot");
    header.createEl("h3", { text: "Create New Agent" });

    const scrollContainer = contentEl.createDiv({ cls: "af-create-scroll" });

    this.renderIdentitySection(scrollContainer);
    this.renderSystemPromptSection(scrollContainer);
    this.renderRuntimeConfigSection(scrollContainer);
    this.renderSkillsSection(scrollContainer);
    this.renderContextSection(scrollContainer);
    this.renderPermissionsSection(scrollContainer);

    // Footer actions
    const footer = contentEl.createDiv({ cls: "af-create-footer" });
    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    const createBtn = footer.createEl("button", {
      cls: "af-create-submit-btn",
      text: "Create Agent",
    });
    const createIcon = createBtn.createSpan({ cls: "af-create-btn-icon" });
    setIcon(createIcon, "plus");
    createBtn.onclick = () => void this.handleCreate();
  }

  private renderIdentitySection(container: HTMLElement): void {
    const section = container.createDiv({ cls: "af-create-section" });
    const sectionHeader = section.createDiv({ cls: "af-create-section-header" });
    const sectionIcon = sectionHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(sectionIcon, "user");
    sectionHeader.createSpan({ text: "Identity" });

    new Setting(section)
      .setName("Name")
      .setDesc("Unique identifier for this agent (will be slugified)")
      .addText((text: TextComponent) => {
        text.setPlaceholder("deploy-watcher");
        text.onChange((value) => {
          this.agentName = value;
        });
      });

    new Setting(section)
      .setName("Description")
      .addText((text: TextComponent) => {
        text.setPlaceholder("Monitors deployments and reports status");
        text.onChange((value) => {
          this.description = value;
        });
      });

    new Setting(section)
      .setName("Avatar")
      .setDesc("Emoji for this agent")
      .addText((text: TextComponent) => {
        text.setPlaceholder("\ud83d\udee1\ufe0f");
        text.inputEl.setCssStyles({ width: "60px" });
        text.onChange((value) => {
          this.avatar = value;
        });
      });

    new Setting(section)
      .setName("Tags")
      .setDesc("Comma-separated tags")
      .addText((text: TextComponent) => {
        text.setPlaceholder("devops, monitoring");
        text.onChange((value) => {
          this.tags = value;
        });
      });
  }

  private renderSystemPromptSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: "af-create-section" });
    const sectionHeader = section.createDiv({ cls: "af-create-section-header" });
    const sectionIcon = sectionHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(sectionIcon, "message-square");
    sectionHeader.createSpan({ text: "System Prompt" });

    const promptArea = new TextAreaComponent(section);
    promptArea.setPlaceholder("You are a deployment monitoring agent...");
    promptArea.inputEl.rows = 8;
    promptArea.inputEl.addClass("af-create-textarea");
    promptArea.setValue(this.systemPrompt);
    promptArea.onChange((value) => {
      this.systemPrompt = value;
    });
    this.promptTextArea = promptArea;

    new Setting(section)
      .setName("Template")
      .setDesc("Pre-fill with a template prompt")
      .addDropdown((dropdown) => {
        for (const [key, { label }] of Object.entries(TEMPLATE_PRESETS)) {
          dropdown.addOption(key, label);
        }
        dropdown.setValue(this.selectedTemplate);
        dropdown.onChange((value) => {
          this.selectedTemplate = value;
          const preset = TEMPLATE_PRESETS[value];
          if (preset && value !== "none") {
            this.systemPrompt = preset.prompt;
            this.promptTextArea?.setValue(preset.prompt);
          }
        });
      });
  }

  private renderRuntimeConfigSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: "af-create-section" });
    const sectionHeader = section.createDiv({ cls: "af-create-section-header" });
    const sectionIcon = sectionHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(sectionIcon, "settings");
    sectionHeader.createSpan({ text: "Runtime Config" });

    new Setting(section)
      .setName("Model")
      .addText((text: TextComponent) => {
        text.setPlaceholder("default");
        text.setValue(this.model);
        text.onChange((value) => {
          this.model = value || "default";
        });
      });

    new Setting(section)
      .setName("Adapter")
      .addDropdown((dropdown) => {
        for (const opt of ADAPTER_OPTIONS) {
          dropdown.addOption(opt.value, opt.label);
        }
        dropdown.setValue(this.adapter);
        dropdown.onChange((value) => {
          this.adapter = value;
        });
      });

    new Setting(section)
      .setName("Working Directory")
      .setDesc("Leave empty for vault root")
      .addText((text: TextComponent) => {
        text.setPlaceholder("/path/to/project");
        text.onChange((value) => {
          this.cwd = value;
        });
      });

    new Setting(section)
      .setName("Timeout")
      .setDesc("Seconds before the agent is killed")
      .addText((text: TextComponent) => {
        text.setPlaceholder("300");
        text.setValue(String(this.timeout));
        text.inputEl.type = "number";
        text.inputEl.setCssStyles({ width: "80px" });
        text.onChange((value) => {
          const num = parseInt(value, 10);
          if (!isNaN(num) && num > 0) this.timeout = num;
        });
      });

    new Setting(section)
      .setName("Permission Mode")
      .addDropdown((dropdown) => {
        for (const opt of PERMISSION_OPTIONS) {
          dropdown.addOption(opt.value, opt.label);
        }
        dropdown.setValue(this.permissionMode);
        dropdown.onChange((value) => {
          this.permissionMode = value;
        });
      });
  }

  private renderSkillsSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: "af-create-section" });
    const sectionHeader = section.createDiv({ cls: "af-create-section-header" });
    const sectionIcon = sectionHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(sectionIcon, "puzzle");
    sectionHeader.createSpan({ text: "Skills" });

    const sharedSkills = this.options.snapshot.skills;
    if (sharedSkills.length > 0) {
      const skillsLabel = section.createDiv({ cls: "af-create-subsection-label" });
      skillsLabel.setText("Shared Skills");

      const skillsGrid = section.createDiv({ cls: "af-create-skills-grid" });
      for (const skill of sharedSkills) {
        this.renderSkillCheckbox(skillsGrid, skill);
      }
    }

    const agentSkillsLabel = section.createDiv({ cls: "af-create-subsection-label" });
    agentSkillsLabel.setText("Agent-specific skills (optional)");

    const skillsArea = new TextAreaComponent(section);
    skillsArea.setPlaceholder("Custom skills/instructions for this agent...");
    skillsArea.inputEl.rows = 4;
    skillsArea.inputEl.addClass("af-create-textarea");
    skillsArea.onChange((value) => {
      this.agentSkillsBody = value;
    });
  }

  private renderSkillCheckbox(container: HTMLElement, skill: SkillConfig): void {
    const item = container.createDiv({ cls: "af-create-skill-item" });
    const checkbox = item.createEl("input", { attr: { type: "checkbox" } });
    checkbox.checked = this.selectedSharedSkills.has(skill.name);
    checkbox.onchange = () => {
      if (checkbox.checked) {
        this.selectedSharedSkills.add(skill.name);
      } else {
        this.selectedSharedSkills.delete(skill.name);
      }
    };

    const label = item.createDiv({ cls: "af-create-skill-label" });
    label.createSpan({ cls: "af-create-skill-name", text: skill.name });
    if (skill.description) {
      label.createSpan({ cls: "af-create-skill-desc", text: skill.description });
    }
  }

  private renderContextSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: "af-create-section" });
    const sectionHeader = section.createDiv({ cls: "af-create-section-header" });
    const sectionIcon = sectionHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(sectionIcon, "file-text");
    sectionHeader.createSpan({ text: "Context" });

    const contextLabel = section.createDiv({ cls: "af-create-subsection-label" });
    contextLabel.setText("Project context (optional)");

    const contextArea = new TextAreaComponent(section);
    contextArea.setPlaceholder("Background info, project context...");
    contextArea.inputEl.rows = 4;
    contextArea.inputEl.addClass("af-create-textarea");
    contextArea.onChange((value) => {
      this.contextBody = value;
    });
  }

  private renderPermissionsSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: "af-create-section" });
    const sectionHeader = section.createDiv({ cls: "af-create-section-header" });
    const sectionIcon = sectionHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(sectionIcon, "shield");
    sectionHeader.createSpan({ text: "Permissions" });

    new Setting(section)
      .setName("Approval required")
      .setDesc("Comma-separated tool names that require manual approval")
      .addText((text: TextComponent) => {
        text.setPlaceholder("git_push, file_delete");
        text.onChange((value) => {
          this.approvalRequired = value;
        });
      });

    new Setting(section)
      .setName("Memory enabled")
      .addToggle((toggle: ToggleComponent) => {
        toggle.setValue(this.memoryEnabled);
        toggle.onChange((value) => {
          this.memoryEnabled = value;
        });
      });
  }

  private async handleCreate(): Promise<void> {
    const name = this.agentName.trim();
    if (!name) {
      new Notice("Agent name is required.");
      return;
    }

    const existing = this.options.repository.getAgentByName(slugify(name));
    if (existing) {
      new Notice(`Agent "${slugify(name)}" already exists.`);
      return;
    }

    const parseTags = (s: string) =>
      s.split(",").map((t) => t.trim()).filter(Boolean);

    try {
      await this.options.repository.createAgentFolder({
        name: slugify(name),
        description: this.description.trim(),
        avatar: this.avatar.trim(),
        tags: parseTags(this.tags),
        systemPrompt: this.systemPrompt.trim(),
        model: this.model.trim() || "default",
        adapter: this.adapter,
        cwd: this.cwd.trim(),
        timeout: this.timeout,
        permissionMode: this.permissionMode,
        approvalRequired: parseTags(this.approvalRequired),
        memory: this.memoryEnabled,
        memoryMaxEntries: 100,
        skills: Array.from(this.selectedSharedSkills),
        skillsBody: this.agentSkillsBody.trim(),
        contextBody: this.contextBody.trim(),
      });

      this.close();
      new Notice(`Agent "${slugify(name)}" created.`);
      await this.options.onCreated(slugify(name));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to create agent: ${msg}`);
    }
  }
}
