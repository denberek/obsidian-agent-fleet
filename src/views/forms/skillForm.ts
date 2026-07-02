import { Notice, setIcon } from "obsidian";
import { ConfirmModal } from "../../modals/confirmModal";
import type { SkillConfig } from "../../types";
import { slugify } from "../../utils/markdown";
import { createIcon } from "../../utils/icons";
import type { DashboardFormDeps } from "./shared";

/** View helpers the skill form borrows from the dashboard. */
export interface SkillFormDeps extends DashboardFormDeps {
  /** Navigate the dashboard to another page (post-save / cancel / delete). */
  navigate: (page: "skills") => void;
}

/**
 * Shared skill form used by both the Create Skill and Edit Skill pages.
 * Pass `skill` to render in edit mode (pre-filled fields, read-only name,
 * delete button, "Save Changes" submit); omit it for create mode (which
 * additionally offers a template picker).
 */
export function renderSkillForm(
  page: HTMLElement,
  deps: SkillFormDeps,
  skill?: SkillConfig,
): void {
  const { plugin } = deps;

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
  setIcon(avatar, skill ? "edit" : "plus");
  const headerInfo = headerLeft.createDiv();
  if (skill) {
    headerInfo.createDiv({ cls: "af-detail-header-name", text: `Edit Skill: ${skill.name}` });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Modify skill definition" });
  } else {
    headerInfo.createDiv({ cls: "af-detail-header-name", text: "Create New Skill" });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Define a reusable skill for your agents" });
  }

  header.createDiv({ cls: "af-detail-header-actions" });
  // Form state (pre-filled in edit mode)
  const state = {
    name: "",
    description: skill ? skill.description ?? "" : "",
    tags: skill ? skill.tags.join(", ") : "",
    body: skill ? skill.body : "",
    toolsBody: skill ? skill.toolsBody : "",
    referencesBody: skill ? skill.referencesBody : "",
    examplesBody: skill ? skill.examplesBody : "",
  };

  const SKILL_TEMPLATES: Record<string, { label: string; prompt: string }> = {
    none: { label: "None", prompt: "" },
    cli: { label: "CLI Tool Wrapper", prompt: "You are using the {{tool}} CLI. All operations go through the wrapper script.\n\nRequirements:\n- Ensure required environment variables are set\n- Parse JSON responses for human-readable output\n- Confirm destructive operations before executing\n\nKey behaviors:\n- List existing items before making changes\n- Use --dry-run flags when available\n- Report errors clearly with suggested fixes" },
    api: { label: "API Integration", prompt: "You are integrating with the {{service}} API.\n\nBase URL: https://api.example.com/v1\nAuth: Bearer token via environment variable\n\nKey behaviors:\n- Always check rate limits before bulk operations\n- Handle pagination for list endpoints\n- Validate inputs before making requests\n- Parse and format JSON responses for readability" },
    review: { label: "Code Review", prompt: "You are a code review skill. Analyze code changes and provide structured feedback.\n\nReview checklist:\n- Correctness: Does the code do what it claims?\n- Security: Any injection, auth, or data exposure risks?\n- Performance: Unnecessary allocations, N+1 queries, missing indexes?\n- Maintainability: Clear naming, reasonable complexity, adequate tests?\n\nOutput format:\n- Start with a 1-line summary\n- Group findings by severity (critical, warning, suggestion)\n- Reference specific file paths and line numbers" },
    data: { label: "Data Analysis", prompt: "You are a data analysis skill. Query, transform, and report on data.\n\nKey behaviors:\n- Summarize datasets before diving into details\n- Use tables and charts where appropriate\n- Always state the time range and filters applied\n- Flag anomalies and outliers explicitly\n- End with actionable insights, not just observations" },
  };

  const form = page.createDiv({ cls: "af-create-form" });

  // ─── Identity Section ───
  const identitySection = form.createDiv({ cls: "af-create-section" });
  const identityHeader = identitySection.createDiv({ cls: "af-create-section-header" });
  const identityIcon = identityHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(identityIcon, "puzzle");
  identityHeader.createSpan({ text: "Identity" });

  if (skill) {
    // Name (read-only)
    const nameRow = identitySection.createDiv({ cls: "af-form-row" });
    nameRow.createDiv({ cls: "af-form-label", text: "Name" });
    const nameInput = nameRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", value: skill.name, disabled: "true" },
    });
    nameInput.setCssStyles({ opacity: "0.6" });
  } else {
    deps.createFormField(identitySection, "Name", "todoist", "Unique identifier (will be slugified)", (v) => { state.name = v; });
  }

  deps.createFormField(identitySection, "Description", "Manage tasks and projects via CLI", "", (v) => { state.description = v; }, skill ? skill.description ?? "" : undefined);
  deps.createFormField(identitySection, "Tags", "productivity, tasks", "Comma-separated", (v) => { state.tags = v; }, skill ? skill.tags.join(", ") : undefined);

  // ─── Core Instructions Section ───
  const instructionsSection = form.createDiv({ cls: "af-create-section" });
  const instructionsHeader = instructionsSection.createDiv({ cls: "af-create-section-header" });
  const instructionsIcon = instructionsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(instructionsIcon, "file-text");
  instructionsHeader.createSpan({ text: "Core Instructions" });

  // Template picker (create mode only)
  let templateSelect: HTMLSelectElement | undefined;
  if (!skill) {
    const templateRow = instructionsSection.createDiv({ cls: "af-form-row" });
    templateRow.createDiv({ cls: "af-form-label", text: "Template" });
    templateSelect = templateRow.createEl("select", { cls: "af-form-select" });
    for (const [key, { label }] of Object.entries(SKILL_TEMPLATES)) {
      templateSelect.createEl("option", { text: label, attr: { value: key } });
    }
  }

  const bodyTextarea = instructionsSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: {
      placeholder: skill
        ? "Skill instructions..."
        : "Skill instructions — what does this skill do and how should agents use it?",
      rows: "10",
    },
  });
  if (skill) bodyTextarea.value = skill.body;
  bodyTextarea.addEventListener("input", () => { state.body = bodyTextarea.value; });

  if (templateSelect) {
    const select = templateSelect;
    select.addEventListener("change", () => {
      const preset = SKILL_TEMPLATES[select.value];
      if (preset && select.value !== "none") {
        state.body = preset.prompt;
        bodyTextarea.value = preset.prompt;
      }
    });
  }

  // ─── Tools Section ───
  const toolsSection = form.createDiv({ cls: "af-create-section" });
  const toolsHeader = toolsSection.createDiv({ cls: "af-create-section-header" });
  const toolsIcon = toolsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(toolsIcon, "wrench");
  const toolsHeaderLabel = toolsHeader.createSpan({ text: "Tools" });
  deps.addTooltip(toolsHeaderLabel, "CLI commands, API endpoints, and tool definitions available to agents using this skill");
  const toolsTextarea = toolsSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: {
      placeholder: skill
        ? "## Commands\n\n### list\n..."
        : "## Commands\n\n### list\nUsage: tool list [--filter <query>]\n...",
      rows: "8",
    },
  });
  if (skill) toolsTextarea.value = skill.toolsBody;
  toolsTextarea.addEventListener("input", () => { state.toolsBody = toolsTextarea.value; });

  // ─── References Section ───
  const refsSection = form.createDiv({ cls: "af-create-section" });
  const refsHeader = refsSection.createDiv({ cls: "af-create-section-header" });
  const refsIcon = refsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(refsIcon, "book-open");
  const refsHeaderLabel = refsHeader.createSpan({ text: "References" });
  deps.addTooltip(refsHeaderLabel, "Background docs, conventions, cheat sheets");
  const refsTextarea = refsSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "API docs, filter syntax, conventions...", rows: "6" },
  });
  if (skill) refsTextarea.value = skill.referencesBody;
  refsTextarea.addEventListener("input", () => { state.referencesBody = refsTextarea.value; });

  // ─── Examples Section ───
  const examplesSection = form.createDiv({ cls: "af-create-section" });
  const examplesHeader = examplesSection.createDiv({ cls: "af-create-section-header" });
  const examplesIcon = examplesHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(examplesIcon, "message-circle");
  const examplesHeaderLabel = examplesHeader.createSpan({ text: "Examples" });
  deps.addTooltip(examplesHeaderLabel, "Example prompts and ideal outputs showing how to use this skill");
  const examplesTextarea = examplesSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: {
      placeholder: skill
        ? "## Example: List all tasks\n..."
        : "## Example: List all tasks\n\nUser: Show me my tasks for today\n\nAgent: ...",
      rows: "6",
    },
  });
  if (skill) examplesTextarea.value = skill.examplesBody;
  examplesTextarea.addEventListener("input", () => { state.examplesBody = examplesTextarea.value; });

  // ─── Footer ───
  const footer = page.createDiv({ cls: "af-create-footer" });

  if (skill) {
    const deleteBtn = footer.createEl("button", { cls: "af-btn-sm danger" });
    createIcon(deleteBtn, "trash-2", "af-btn-icon");
    deleteBtn.appendText(" Delete");
    deleteBtn.onclick = () => {
      new ConfirmModal(plugin.app, {
        title: `Delete skill "${skill.name}"?`,
        body: "The skill file will be moved to your system trash and can be recovered.",
        confirmText: "Delete",
        danger: true,
        onConfirm: async () => {
          await plugin.repository.deleteSkill(skill.name);
          new Notice(`Skill "${skill.name}" deleted.`);
          // Small delay for Obsidian vault cache to process the trash
          await new Promise((r) => window.setTimeout(r, 200));
          await plugin.refreshFromVault();
          deps.navigate("skills");
        },
      }).open();
    };

    footer.createDiv({ cls: "af-toolbar-spacer" });
  }

  const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
  cancelBtn.onclick = () => deps.navigate("skills");

  const submitBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
  createIcon(submitBtn, skill ? "check" : "plus", "af-btn-icon");
  submitBtn.appendText(skill ? " Save Changes" : " Create Skill");

  if (skill) {
    // Edit mode: update the existing skill file(s) in place.
    submitBtn.onclick = async () => {
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      const restoreSubmit = deps.markSubmitBusy(submitBtn, "Saving...", "check", "Save Changes");
      try {
        await plugin.repository.updateSkill(skill.name, {
          description: state.description.trim(),
          tags: parseTags(state.tags),
          body: state.body.trim(),
          toolsBody: state.toolsBody.trim(),
          referencesBody: state.referencesBody.trim(),
          examplesBody: state.examplesBody.trim(),
        });
        new Notice(`Skill "${skill.name}" updated.`);
        await plugin.refreshFromVault();
        deps.navigate("skills");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to update skill: ${msg}`);
        restoreSubmit();
      }
    };
  } else {
    // Create mode: write a new skill folder.
    submitBtn.onclick = async () => {
      const name = state.name.trim();
      if (!name) {
        new Notice("Skill name is required.");
        return;
      }
      const slug = slugify(name);
      if (plugin.repository.getSkillByName(slug)) {
        new Notice(`Skill "${slug}" already exists.`);
        return;
      }
      const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
      const restoreSubmit = deps.markSubmitBusy(submitBtn, "Creating...", "plus", "Create Skill");
      try {
        await plugin.repository.createSkillFolder({
          name: slug,
          description: state.description.trim(),
          tags: parseTags(state.tags),
          body: state.body.trim(),
          toolsBody: state.toolsBody.trim(),
          referencesBody: state.referencesBody.trim(),
          examplesBody: state.examplesBody.trim(),
        });
        new Notice(`Skill "${slug}" created.`);
        await plugin.refreshFromVault();
        deps.navigate("skills");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to create skill: ${msg}`);
        restoreSubmit();
      }
    };
  }
}
