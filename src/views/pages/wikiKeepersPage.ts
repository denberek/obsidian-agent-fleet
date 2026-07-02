import { Notice, TFile } from "obsidian";
import type { AgentConfig } from "../../types";
import { parseLatestLintReport } from "../../utils/wikiLintReport";
import type { DashboardPageDeps } from "./shared";

/** View helpers the Wiki Keepers page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. */
export type WikiKeepersPageDeps = DashboardPageDeps;

/**
 * Wiki Keepers page: lists every Wiki Keeper instance with the latest
 * lint report parsed from its scope's `log.md`. "Needs review" items
 * render as cards with a Dismiss button (in-memory only — re-parse on
 * navigation gives the user a fresh view of the most recent lint pass).
 */
export async function renderWikiKeepersPage(container: HTMLElement, deps: WikiKeepersPageDeps): Promise<void> {
  const page = container.createDiv({ cls: "af-agents-page" });
  const snapshot = deps.plugin.runtime.getSnapshot();

  const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
  toolbar.createDiv({ cls: "af-page-title", text: "Wiki Keepers" });
  toolbar.createDiv({ cls: "af-toolbar-spacer" });

  const keepers = snapshot.agents.filter(
    (a): a is AgentConfig & { wikiKeeper: NonNullable<AgentConfig["wikiKeeper"]> } =>
      a.wikiKeeper !== undefined,
  );

  if (keepers.length === 0) {
    deps.renderEmptyState(
      page,
      "library",
      "No Wiki Keepers yet",
      "Open Settings → Agent Fleet → Wiki Keepers → + Add to create one.",
    );
    return;
  }

  const list = page.createDiv({ cls: "af-wk-list" });
  list.setCssStyles({ display: "flex" });
  list.setCssStyles({ flexDirection: "column" });
  list.setCssStyles({ gap: "16px" });

  for (const keeper of keepers) {
    await renderWikiKeeperCard(list, deps, keeper);
  }
}

async function renderWikiKeeperCard(
  container: HTMLElement,
  deps: WikiKeepersPageDeps,
  agent: AgentConfig & { wikiKeeper: NonNullable<AgentConfig["wikiKeeper"]> },
): Promise<void> {
  const wk = agent.wikiKeeper;
  const card = container.createDiv({ cls: "af-card" });
  card.setCssStyles({ padding: "16px" });
  card.setCssStyles({ border: "1px solid var(--background-modifier-border)" });
  card.setCssStyles({ borderRadius: "8px" });

  const header = card.createDiv();
  header.setCssStyles({ display: "flex" });
  header.setCssStyles({ alignItems: "center" });
  header.setCssStyles({ gap: "12px" });
  header.setCssStyles({ marginBottom: "12px" });
  const titleWrap = header.createDiv();
  titleWrap.setCssStyles({ flex: "1" });
  titleWrap.createEl("strong", { text: agent.name });
  const scopeLabel = wk.scopeRoot || "(whole vault)";
  titleWrap.createEl("div", {
    text: `Scope: ${scopeLabel} · topics: ${wk.topicsRoot}/ · log: ${wk.logPath}`,
    cls: "af-form-hint",
  });

  const openBtn = header.createEl("button", { cls: "af-btn-sm" });
  openBtn.appendText("Open log");
  openBtn.onclick = () => {
    const logFullPath = wk.scopeRoot ? `${wk.scopeRoot}/${wk.logPath}` : wk.logPath;
    const file = deps.plugin.app.vault.getAbstractFileByPath(logFullPath);
    if (file instanceof TFile) {
      void deps.plugin.app.workspace.getLeaf().openFile(file);
    } else {
      new Notice(`Log file not found: ${logFullPath}`);
    }
  };

  // Read and parse log.md
  const logFullPath = wk.scopeRoot ? `${wk.scopeRoot}/${wk.logPath}` : wk.logPath;
  const logFile = deps.plugin.app.vault.getAbstractFileByPath(logFullPath);
  let report: ReturnType<typeof parseLatestLintReport> = null;
  if (logFile instanceof TFile) {
    try {
      const content = await deps.plugin.app.vault.cachedRead(logFile);
      report = parseLatestLintReport(content);
    } catch {
      report = null;
    }
  }

  if (!report) {
    const empty = card.createDiv({ cls: "af-form-hint" });
    empty.setText(
      "No lint report yet. Run wiki-lint manually or wait for the weekly task to fire.",
    );
    return;
  }

  // Latest lint header
  const reportHeader = card.createDiv();
  reportHeader.setCssStyles({ display: "flex" });
  reportHeader.setCssStyles({ alignItems: "baseline" });
  reportHeader.setCssStyles({ gap: "12px" });
  reportHeader.setCssStyles({ marginBottom: "8px" });
  reportHeader.createEl("strong", { text: `Lint ${report.date}` });
  reportHeader.createSpan({
    cls: "af-form-hint",
    text: `${report.summary.length} summary lines · ${report.autoApplied.length} auto-applied · ${report.needsReview.length} needs review`,
  });

  // Summary bullets (read-only)
  if (report.summary.length > 0) {
    const sumDetails = card.createEl("details");
    sumDetails.createEl("summary", { text: "Summary" });
    const sumList = sumDetails.createEl("ul");
    sumList.setCssStyles({ marginTop: "4px" });
    for (const item of report.summary) {
      sumList.createEl("li", { text: item });
    }
  }

  if (report.autoApplied.length > 0) {
    const autoDetails = card.createEl("details");
    autoDetails.createEl("summary", { text: `Auto-applied (${report.autoApplied.length})` });
    const autoList = autoDetails.createEl("ul");
    autoList.setCssStyles({ marginTop: "4px" });
    for (const item of report.autoApplied) {
      autoList.createEl("li", { text: item });
    }
  }

  if (report.refreshChained.length > 0) {
    const refDetails = card.createEl("details");
    refDetails.createEl("summary", {
      text: `Refresh chained (${report.refreshChained.length})`,
    });
    const refList = refDetails.createEl("ul");
    refList.setCssStyles({ marginTop: "4px" });
    for (const item of report.refreshChained) {
      refList.createEl("li", { text: item });
    }
  }

  // Needs review queue — the actionable bit
  const reviewWrap = card.createDiv();
  reviewWrap.setCssStyles({ marginTop: "12px" });
  reviewWrap.createEl("strong", { text: `Needs review (${report.needsReview.length})` });

  if (report.needsReview.length === 0) {
    reviewWrap.createDiv({
      cls: "af-form-hint",
      text: "All clear. Nothing requires manual review from this lint pass.",
    });
    return;
  }

  const reviewList = reviewWrap.createDiv();
  reviewList.setCssStyles({ display: "flex" });
  reviewList.setCssStyles({ flexDirection: "column" });
  reviewList.setCssStyles({ gap: "6px" });
  reviewList.setCssStyles({ marginTop: "8px" });

  for (const item of report.needsReview) {
    const row = reviewList.createDiv();
    row.setCssStyles({ display: "flex" });
    row.setCssStyles({ alignItems: "flex-start" });
    row.setCssStyles({ gap: "8px" });
    row.setCssStyles({ padding: "8px 10px" });
    row.setCssStyles({ background: "var(--background-secondary)" });
    row.setCssStyles({ borderRadius: "4px" });
    row.setCssStyles({ fontSize: "13px" });

    const text = row.createDiv();
    text.setCssStyles({ flex: "1" });
    text.setText(item);

    const dismissBtn = row.createEl("button", { cls: "af-btn-sm", text: "Dismiss" });
    dismissBtn.title =
      "Hide this item from the dashboard until the next lint pass (does not modify log.md).";
    dismissBtn.onclick = () => {
      row.remove();
    };
  }
}
