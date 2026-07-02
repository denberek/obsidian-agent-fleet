import { setIcon } from "obsidian";
import type { RunLogData } from "../../types";
import { createIcon } from "../../utils/icons";
import type { DashboardPageDeps } from "./shared";

/** View helpers the task detail page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. */
export interface TaskDetailPageDeps extends DashboardPageDeps {
  /** Navigate the dashboard to another page. */
  navigate: (page: "edit-task", context?: string) => void;
  /** Label + monospace value config row (owned by the view). */
  renderConfigRow: (container: HTMLElement, label: string, value: string) => void;
  /** Run timeline entry shared with the overview page (owned by the view). */
  renderTimelineItem: (container: HTMLElement, run: RunLogData) => void;
  humanizeCron: (cron: string) => string;
  formatStarted: (iso: string) => string;
}

export function renderTaskDetailPage(container: HTMLElement, deps: TaskDetailPageDeps, taskId: string | undefined): void {
  const page = container.createDiv({ cls: "af-task-detail-page" });
  if (!taskId) {
    deps.renderEmptyState(page, "circle-dot", "No task selected", "");
    return;
  }

  const task = deps.plugin.runtime.getSnapshot().tasks.find((t) => t.taskId === taskId);
  if (!task) {
    deps.renderEmptyState(page, "circle-dot", "Task not found", `Task "${taskId}" was not found`);
    return;
  }

  const snapshot = deps.plugin.runtime.getSnapshot();
  const runs = deps.plugin.runtime.getRecentRuns().filter((r) => r.task === taskId);
  const agent = snapshot.agents.find((a) => a.name === task.agent);

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  const taskIcon = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
  setIcon(taskIcon, "circle-dot");
  const headerInfo = headerLeft.createDiv();
  headerInfo.createDiv({ cls: "af-detail-header-name", text: task.taskId });
  headerInfo.createDiv({
    cls: "af-detail-header-desc",
    text: `Agent: ${task.agent}`,
  });

  const headerActions = header.createDiv({ cls: "af-detail-header-actions" });

  const editBtn = headerActions.createEl("button", { cls: "af-btn-sm" });
  createIcon(editBtn, "edit", "af-btn-icon");
  editBtn.appendText(" Edit");
  editBtn.onclick = () => deps.navigate("edit-task", task.taskId);

  const runBtn = headerActions.createEl("button", { cls: "af-btn-sm primary" });
  createIcon(runBtn, "play", "af-btn-icon");
  runBtn.appendText(" Run Now");
  runBtn.onclick = () => void deps.plugin.runtime.runTaskNow(task);

  // Details section
  const details = page.createDiv({ cls: "af-section-card" });
  const detailsHeader = details.createDiv({ cls: "af-section-header" });
  const detailsTitle = detailsHeader.createDiv({ cls: "af-section-title" });
  createIcon(detailsTitle, "file-text");
  detailsTitle.appendText(" Details");

  const detailsBody = details.createDiv({ cls: "af-config-form" });
  deps.renderConfigRow(detailsBody, "Agent", task.agent);
  deps.renderConfigRow(detailsBody, "Priority", task.priority.charAt(0).toUpperCase() + task.priority.slice(1));
  deps.renderConfigRow(detailsBody, "Status", task.enabled ? "Enabled" : "Disabled");

  // Schedule — human-readable, no raw cron
  const scheduleText = task.schedule
    ? deps.humanizeCron(task.schedule)
    : task.runAt ?? "Manual (run on demand)";
  deps.renderConfigRow(detailsBody, "Schedule", scheduleText);
  if (task.schedule) {
    deps.renderConfigRow(detailsBody, "Catch up if missed", task.catchUp ? "Yes" : "No");
  }

  deps.renderConfigRow(detailsBody, "Created", task.created);
  deps.renderConfigRow(detailsBody, "Runs", String(task.runCount));
  if (task.lastRun) {
    deps.renderConfigRow(detailsBody, "Last Run", deps.formatStarted(task.lastRun));
  }

  // Instructions section
  const promptSection = page.createDiv({ cls: "af-section-card" });
  const promptHeader = promptSection.createDiv({ cls: "af-section-header" });
  const promptTitle = promptHeader.createDiv({ cls: "af-section-title" });
  createIcon(promptTitle, "message-square");
  promptTitle.appendText(" Instructions");
  promptSection.createDiv({ cls: "af-output-block", text: task.body || "(empty)" });

  // Recent runs
  const runsSection = page.createDiv({ cls: "af-section-card" });
  const runsHeader = runsSection.createDiv({ cls: "af-section-header" });
  const runsTitle = runsHeader.createDiv({ cls: "af-section-title" });
  createIcon(runsTitle, "scroll-text");
  runsTitle.appendText(" Recent Runs");

  const runsBody = runsSection.createDiv({ cls: "af-timeline" });
  if (runs.length === 0) {
    deps.renderEmptyState(runsBody, "scroll-text", "No runs yet", "");
  } else {
    for (const run of runs.slice(0, 10)) {
      deps.renderTimelineItem(runsBody, run);
    }
  }
}
