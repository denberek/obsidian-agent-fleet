import { setIcon } from "obsidian";
import type { AgentConfig, SkillConfig } from "../../types";
import { createIcon } from "../../utils/icons";
import type { DashboardPageDeps } from "./shared";

/** View helpers the skills-library page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. */
export interface SkillsPageDeps extends DashboardPageDeps {
  /** Navigate the dashboard to another page. */
  navigate: (page: "edit-skill", context?: string) => void;
}

export function renderSkillsPage(container: HTMLElement, deps: SkillsPageDeps): void {
  const page = container.createDiv({ cls: "af-skills-page" });
  const snapshot = deps.plugin.runtime.getSnapshot();

  const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
  toolbar.createDiv({ cls: "af-page-title", text: "Skills Library" });
  toolbar.createDiv({ cls: "af-toolbar-spacer" });

  const newBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
  createIcon(newBtn, "plus", "af-btn-icon");
  newBtn.appendText(" New Skill");
  newBtn.onclick = () => void deps.plugin.createSkillTemplate();

  const grid = page.createDiv({ cls: "af-skills-grid" });

  if (snapshot.skills.length === 0) {
    deps.renderEmptyState(grid, "puzzle", "No skills yet", "Create skills to give agents specialized abilities", {
      label: "New Skill",
      onClick: () => void deps.plugin.createSkillTemplate(),
    });
    return;
  }

  for (const skill of snapshot.skills) {
    renderSkillCard(grid, deps, skill, snapshot.agents);
  }
}

function renderSkillCard(container: HTMLElement, deps: SkillsPageDeps, skill: SkillConfig, agents: AgentConfig[]): void {
  const card = container.createDiv({ cls: "af-skill-card" });

  const cardHeader = card.createDiv({ cls: "af-skill-card-header" });
  const iconEl = cardHeader.createDiv({ cls: "af-skill-card-icon" });
  setIcon(iconEl, getSkillIcon(skill.name));

  const skillEditBtn = cardHeader.createEl("button", { cls: "af-btn-sm af-btn-xs" });
  createIcon(skillEditBtn, "edit", "af-btn-icon");
  skillEditBtn.onclick = (e) => {
    e.stopPropagation();
    deps.navigate("edit-skill", skill.name);
  };

  card.createDiv({ cls: "af-skill-card-name", text: skill.name });
  card.createDiv({ cls: "af-skill-card-desc", text: skill.description ?? "No description" });

  const usedBy = agents.filter((a) => a.skills.includes(skill.name));
  if (usedBy.length > 0) {
    const agentsRow = card.createDiv({ cls: "af-skill-card-agents" });
    for (const agent of usedBy) {
      agentsRow.createSpan({ cls: "af-skill-card-agent-tag", text: agent.name });
    }
  }

  // No card-level click — skills have no detail page. Editing is via the edit button.
}

function getSkillIcon(name: string): string {
  if (name.includes("git")) return "settings";
  if (name.includes("summarize") || name.includes("log")) return "activity";
  if (name.includes("review") || name.includes("check")) return "check-circle-2";
  if (name.includes("vault") || name.includes("note")) return "file-text";
  return "puzzle";
}
