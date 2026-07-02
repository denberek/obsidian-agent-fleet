import { setIcon } from "obsidian";
import type { RunLogData } from "../../types";
import { createIcon } from "../../utils/icons";
import type { DashboardPageDeps } from "./shared";

/** View helpers the approvals page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. */
export interface ApprovalsPageDeps extends DashboardPageDeps {
  formatStarted: (iso: string) => string;
  /** Re-render the whole dashboard view (after an approval is resolved). */
  rerender: () => Promise<void>;
}

export function renderApprovalsPage(container: HTMLElement, deps: ApprovalsPageDeps): void {
  const page = container.createDiv({ cls: "af-approvals-page" });
  const runs = deps.plugin.runtime.getRecentRuns();

  const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
  toolbar.createDiv({ cls: "af-page-title", text: "Approvals" });
  toolbar.createDiv({ cls: "af-toolbar-spacer" });

  // Pending approvals
  const pendingRuns = runs.filter((r) =>
    (r.approvals ?? []).some((a) => a.status === "pending"),
  );

  if (pendingRuns.length > 0) {
    const pendingSection = page.createDiv({ cls: "af-section-card" });
    const pendingHeader = pendingSection.createDiv({ cls: "af-section-header" });
    const pendingTitle = pendingHeader.createDiv({ cls: "af-section-title" });
    createIcon(pendingTitle, "alert-triangle");
    pendingTitle.appendText(` Pending (${pendingRuns.length})`);

    const pendingBody = pendingSection.createDiv({ cls: "af-approvals-list" });
    for (const run of pendingRuns) {
      renderApprovalItem(pendingBody, deps, run, true);
    }
  } else {
    const emptySection = page.createDiv({ cls: "af-section-card" });
    deps.renderEmptyState(emptySection, "shield-check", "No pending approvals", "All clear!");
  }

  // Resolved approvals history
  const resolvedRuns = runs.filter((r) =>
    (r.approvals ?? []).some((a) => a.status !== "pending"),
  );

  if (resolvedRuns.length > 0) {
    const resolvedSection = page.createDiv({ cls: "af-section-card" });
    const resolvedHeader = resolvedSection.createDiv({ cls: "af-section-header" });
    const resolvedTitle = resolvedHeader.createDiv({ cls: "af-section-title" });
    createIcon(resolvedTitle, "check-circle-2");
    resolvedTitle.appendText(" History");

    const resolvedBody = resolvedSection.createDiv({ cls: "af-approvals-list" });
    for (const run of resolvedRuns.slice(0, 20)) {
      renderApprovalItem(resolvedBody, deps, run, false);
    }
  }
}

function renderApprovalItem(container: HTMLElement, deps: ApprovalsPageDeps, run: RunLogData, showActions: boolean): void {
  for (const approval of run.approvals ?? []) {
    if (showActions && approval.status !== "pending") continue;
    if (!showActions && approval.status === "pending") continue;

    const item = container.createDiv({ cls: "af-approval-item" });

    const iconEl = item.createDiv({ cls: "af-approval-item-icon" });
    if (approval.status === "pending") {
      setIcon(iconEl, "shield-check");
      iconEl.addClass("pending");
    } else if (approval.status === "approved") {
      setIcon(iconEl, "check-circle-2");
      iconEl.addClass("approved");
    } else {
      setIcon(iconEl, "x-circle");
      iconEl.addClass("rejected");
    }

    const body = item.createDiv({ cls: "af-approval-item-body" });
    body.createDiv({
      cls: "af-approval-item-title",
      text: `${run.agent} \u2192 ${approval.tool}`,
    });
    body.createDiv({
      cls: "af-approval-item-meta",
      text: `Task: ${run.task} \u00B7 ${approval.command ?? "no command"} \u00B7 ${deps.formatStarted(run.started)}`,
    });
    if (approval.reason) {
      body.createDiv({ cls: "af-approval-item-reason", text: `Reason: ${approval.reason}` });
    }

    if (showActions && approval.status === "pending") {
      const actions = item.createDiv({ cls: "af-approval-item-actions" });
      const approveBtn = actions.createEl("button", { cls: "af-btn-approve" });
      createIcon(approveBtn, "check-circle-2", "af-btn-icon");
      approveBtn.appendText(" Approve");
      approveBtn.onclick = () =>
        void deps.plugin.runtime
          .resolveApproval(run, approval.tool, "approved")
          .then(() => deps.rerender());

      const rejectBtn = actions.createEl("button", { cls: "af-btn-reject" });
      createIcon(rejectBtn, "x-circle", "af-btn-icon");
      rejectBtn.appendText(" Reject");
      rejectBtn.onclick = () =>
        void deps.plugin.runtime
          .resolveApproval(run, approval.tool, "rejected")
          .then(() => deps.rerender());
    }
  }
}
