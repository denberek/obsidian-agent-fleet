import { setIcon } from "obsidian";
import type { RunLogData } from "../../types";
import type { DashboardPageDeps } from "./shared";

/** View helpers the run-history page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. */
export interface RunsPageDeps extends DashboardPageDeps {
  /** Navigate the dashboard to another page. */
  navigate: (page: "agent-detail", context?: string) => void;
  /** Open the run-details slideover (owned by the view). */
  openSlideover: (run: RunLogData) => void;
  formatStarted: (iso: string) => string;
  formatDuration: (seconds: number) => string;
  statusToBadgeClass: (status: string) => string;
  statusToIconName: (status: string) => string;
  statusToBadgeText: (status: string) => string;
}

export function renderRunsPage(container: HTMLElement, deps: RunsPageDeps): void {
  const page = container.createDiv({ cls: "af-runs-page" });
  const runs = deps.plugin.runtime.getRecentRuns();

  const toolbar = page.createDiv({ cls: "af-runs-toolbar" });
  toolbar.createDiv({ cls: "af-page-title", text: "Run History" });
  toolbar.createDiv({ cls: "af-toolbar-spacer" });

  const tableWrap = page.createDiv({ cls: "af-runs-table" });

  if (runs.length === 0) {
    deps.renderEmptyState(tableWrap, "scroll-text", "No runs yet", "Run an agent to see history here");
    return;
  }

  const table = tableWrap.createEl("table");
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  for (const col of ["Status", "Agent", "Task", "Started", "Duration", "Tokens", "Model"]) {
    headerRow.createEl("th", { text: col });
  }

  const tbody = table.createEl("tbody");
  for (const run of runs.slice(0, 50)) {
    renderRunRow(tbody, deps, run);
  }
}

function renderRunRow(tbody: HTMLElement, deps: RunsPageDeps, run: RunLogData): void {
  const row = tbody.createEl("tr");

  const statusTd = row.createEl("td");
  const badge = statusTd.createSpan({
    cls: `af-status-badge ${deps.statusToBadgeClass(run.status)}`,
  });
  const badgeIcon = badge.createSpan();
  setIcon(badgeIcon, deps.statusToIconName(run.status));
  badge.appendText(` ${deps.statusToBadgeText(run.status)}`);

  const agentTd = row.createEl("td", { cls: "af-agent-link" });
  agentTd.setText(run.agent);
  agentTd.onclick = (e) => {
    e.stopPropagation();
    deps.navigate("agent-detail", run.agent);
  };

  row.createEl("td", { text: run.task });
  row.createEl("td", { cls: "af-mono", text: deps.formatStarted(run.started) });
  row.createEl("td", { cls: "af-mono", text: deps.formatDuration(run.durationSeconds) });
  row.createEl("td", {
    cls: "af-mono",
    text: run.tokensUsed ? run.tokensUsed.toLocaleString() : "\u2014",
  });
  row.createEl("td", { cls: "af-mono", text: run.model });

  row.setCssStyles({ cursor: "pointer" });
  row.onclick = () => deps.openSlideover(run);
}
