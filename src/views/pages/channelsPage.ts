import { setIcon } from "obsidian";
import type { ChannelConfig } from "../../types";
import { createIcon } from "../../utils/icons";
import { channelStatusToAvatarClass } from "../forms/channelForm";
import type { DashboardPageDeps } from "./shared";

/** View helpers the channels page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. */
export interface ChannelsPageDeps extends DashboardPageDeps {
  /** Navigate the dashboard to another page. */
  navigate: (page: "create-channel" | "edit-channel", context?: string) => void;
  /** Value + label stat cell shared with the agent cards (owned by the view). */
  renderAgentStat: (container: HTMLElement, value: string, label: string) => void;
}

export function renderChannelsPage(container: HTMLElement, deps: ChannelsPageDeps): void {
  const page = container.createDiv({ cls: "af-agents-page" });
  const snapshot = deps.plugin.runtime.getSnapshot();

  const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
  toolbar.createDiv({ cls: "af-page-title", text: "Channels" });
  toolbar.createDiv({ cls: "af-toolbar-spacer" });

  const newBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
  createIcon(newBtn, "plus", "af-btn-icon");
  newBtn.appendText(" New Channel");
  newBtn.onclick = () => deps.navigate("create-channel");

  const grid = page.createDiv({ cls: "af-agents-grid" });

  if (snapshot.channels.length === 0) {
    deps.renderEmptyState(
      grid,
      "radio",
      "No channels configured",
      "Connect an agent to Slack or another chat platform",
      { label: "New Channel", onClick: () => deps.navigate("create-channel") },
    );
    return;
  }

  for (const channel of snapshot.channels) {
    renderChannelCard(grid, deps, channel, snapshot.validationIssues);
  }
}

function renderChannelCard(
  container: HTMLElement,
  deps: ChannelsPageDeps,
  channel: ChannelConfig,
  validationIssues: Array<{ path: string; message: string }>,
): void {
  const status = deps.plugin.channelManager?.getChannelStatus(channel.name) ?? "disabled";
  const avatarCls = channelStatusToAvatarClass(status);
  const cardCls = channel.enabled && status !== "disabled" ? "af-agent-card" : "af-agent-card disabled";

  const card = container.createDiv({ cls: cardCls });
  card.setCssStyles({ cursor: "default" }); // No card-level click — channels have no detail page

  // Header — avatar (icon + status color) + name/agent + type pill
  const header = card.createDiv({ cls: "af-agent-card-header" });
  const avatar = header.createDiv({ cls: `af-agent-card-avatar ${avatarCls}` });
  setIcon(avatar, "radio");

  const titleBlock = header.createDiv({ cls: "af-agent-card-titleblock" });
  titleBlock.createDiv({ cls: "af-agent-card-name", text: channel.name });
  titleBlock.createDiv({
    cls: "af-agent-card-desc",
    text: `Default: ${channel.defaultAgent}`,
  });

  const statusPill = header.createSpan({ cls: `af-pill ${channelStatusPillColor(status)}` });
  statusPill.createSpan({ cls: "af-dot" });
  statusPill.appendText(` ${status}`);

  // Agents — show all allowed agents as tags (same style as skill tags on agent cards)
  if (channel.allowedAgents.length > 0) {
    const agentsRow = card.createDiv({ cls: "af-agent-card-skills" });
    for (const name of channel.allowedAgents) {
      const tag = agentsRow.createSpan({ cls: "af-skill-tag", text: name });
      if (name === channel.defaultAgent) {
        tag.setCssStyles({ fontWeight: "700" });
      }
    }
  }

  // Stats — sessions, messages in/out, allowlist
  const stats = card.createDiv({ cls: "af-agent-card-stats" });
  const sessionCount = deps.plugin.channelManager?.getSessionCount(channel.name) ?? 0;
  const metrics = deps.plugin.channelManager?.getMetrics(channel.name);
  const agentCount = channel.allowedAgents.length > 0
    ? String(channel.allowedAgents.length)
    : "all";

  deps.renderAgentStat(stats, agentCount, "Agents");
  deps.renderAgentStat(stats, String(sessionCount), "Sessions");
  deps.renderAgentStat(stats, String(metrics?.messagesReceived ?? 0), "In");
  deps.renderAgentStat(stats, String(metrics?.messagesSent ?? 0), "Out");

  // Footer — meta text + edit action
  const footer = card.createDiv({ cls: "af-agent-card-footer" });
  const metaParts: string[] = [channel.type];
  if (!channel.enabled) metaParts.push("disabled");
  if (channel.allowedUsers.length > 0) metaParts.push(`${channel.allowedUsers.length} user(s)`);
  else metaParts.push("allowlist empty");
  footer.createSpan({ cls: "af-agent-card-meta", text: metaParts.join(" \u00B7 ") });

  const actions = footer.createDiv({ cls: "af-agent-card-actions" });
  const editBtn = actions.createEl("button", { cls: "af-btn-sm" });
  createIcon(editBtn, "edit", "af-btn-icon");
  editBtn.appendText(" Edit");
  editBtn.onclick = (e) => {
    e.stopPropagation();
    deps.navigate("edit-channel", channel.name);
  };

  // Validation issues — red-tinted block below the footer
  const issues = validationIssues.filter((i) => i.path === channel.filePath);
  if (issues.length > 0) {
    const issuesBox = card.createDiv({ cls: "af-channel-issues" });
    for (const issue of issues) {
      issuesBox.createDiv({ cls: "af-channel-issue-row", text: issue.message });
    }
  }

  // No card-level click — channels have no detail page. Editing is via the edit button.
}

/** Map a channel status to an `af-pill` color variant for the header badge. */
function channelStatusPillColor(status: string): string {
  switch (status) {
    case "connected":
      return "green";
    case "connecting":
    case "reconnecting":
      return "blue";
    case "needs-auth":
    case "error":
      return "red";
    case "stopped":
    case "disabled":
    default:
      return "";
  }
}
