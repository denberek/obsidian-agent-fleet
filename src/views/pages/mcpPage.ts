import { Notice, setIcon } from "obsidian";
import type { McpServer, McpTool } from "../../types";
import { truncate } from "../../utils/markdown";
import { splitLines } from "../../utils/platform";
import { createIcon } from "../../utils/icons";
import type { DashboardPageDeps } from "./shared";

/** View helpers the MCP servers page borrows from the dashboard so the
 *  extracted markup stays byte-identical to what the view used to render
 *  inline. The probe cache and in-flight auth set are view state — the page
 *  receives the live references so results survive re-renders. */
export interface McpPageDeps extends DashboardPageDeps {
  /** Navigate the dashboard to another page. */
  navigate: (page: "add-mcp-server") => void;
  /** Label + monospace value row used by the detail slideover (owned by the view). */
  renderDetailRow: (container: HTMLElement, label: string, value: string) => void;
  /** Re-render the whole dashboard view. */
  rerender: () => Promise<void>;
  /** View content element the detail slideover overlay attaches to. */
  contentEl: HTMLElement;
  /** Transient per-server tool probe results (name → tools), owned by the view. */
  mcpProbeCache: Map<string, McpTool[]>;
  /** Names of servers with an OAuth flow in flight, owned by the view. */
  authenticatingServers: Set<string>;
}

export function renderMcpPage(container: HTMLElement, deps: McpPageDeps): void {
  const page = container.createDiv({ cls: "af-agents-page" });

  const toolbar = page.createDiv({ cls: "af-agents-toolbar" });
  toolbar.createDiv({ cls: "af-page-title", text: "MCP Servers" });
  toolbar.createDiv({ cls: "af-toolbar-spacer" });

  const addBtn = toolbar.createEl("button", { cls: "af-btn-sm primary" });
  createIcon(addBtn, "plus", "af-btn-icon");
  addBtn.appendText(" Add Server");
  addBtn.onclick = () => deps.navigate("add-mcp-server");

  const servers = deps.plugin.repository.getMcpServers();

  if (servers.length === 0) {
    deps.renderEmptyState(page, "plug", "No MCP servers registered", "Click 'Add Server' above to register one.");
    return;
  }

  const grid = page.createDiv({ cls: "af-agents-grid" });
  for (const server of servers) {
    renderMcpCard(grid, deps, server);
  }
}

/** Whether the server has a stored auth token (OAuth/static bearer). */
function mcpHasToken(deps: McpPageDeps, server: McpServer): boolean {
  return deps.plugin.mcpAuth.hasToken(server.name);
}

/** Whether an http/sse server still needs the user to authenticate (auth is
 *  oauth/bearer but no token is stored yet). */
function mcpNeedsAuth(deps: McpPageDeps, server: McpServer): boolean {
  return (
    server.type !== "stdio" &&
    (server.auth === "oauth" || server.auth === "bearer") &&
    !mcpHasToken(deps, server)
  );
}

function renderMcpCard(container: HTMLElement, deps: McpPageDeps, server: McpServer): void {
  const card = container.createDiv({ cls: `af-mcp-card${server.enabled ? "" : " af-mcp-card-disabled"}` });
  const needsAuth = mcpNeedsAuth(deps, server);

  const header = card.createDiv({ cls: "af-agent-card-header" });
  const statusClass = !server.enabled ? "disabled" : needsAuth ? "pending" : "idle";
  const avatarEl = header.createDiv({ cls: `af-agent-card-avatar ${statusClass}` });
  setIcon(avatarEl, "plug");

  const titleBlock = header.createDiv({ cls: "af-agent-card-titleblock" });
  titleBlock.createDiv({ cls: "af-agent-card-name", text: server.name });

  const metaRow = titleBlock.createDiv({ cls: "af-agent-card-desc af-mcp-meta" });
  metaRow.createSpan({ cls: "af-mcp-type-badge", text: server.type });
  if (server.source === "imported") {
    metaRow.createSpan({ cls: "af-badge", text: "imported" });
  }

  // Enable/disable toggle — writes the registry file frontmatter.
  const toggle = header.createDiv({ cls: `af-agent-card-toggle${server.enabled ? " on" : ""}` });
  toggle.onclick = (e) => {
    e.stopPropagation();
    void deps.plugin.repository.setMcpServerEnabled(server.name, !server.enabled).then(async () => {
      await deps.plugin.refreshFromVault();
      void deps.rerender();
    });
  };

  // Status badge
  const statusBadge = card.createDiv({ cls: `af-mcp-status-badge ${!server.enabled ? "disabled" : needsAuth ? "needs-auth" : "connected"}` });
  const statusIcon = statusBadge.createSpan();
  if (!server.enabled) {
    setIcon(statusIcon, "pause");
    statusBadge.createSpan({ text: " Disabled" });
  } else if (needsAuth) {
    setIcon(statusIcon, "alert-circle");
    statusBadge.createSpan({ text: " Needs auth" });
  } else {
    setIcon(statusIcon, "check-circle");
    statusBadge.createSpan({ text: server.type === "stdio" ? " Enabled" : " Authenticated" });
  }

  if (server.description) {
    const desc = truncateDescription(server.description, 120);
    card.createDiv({ cls: "af-mcp-description", text: desc });
  }

  const urlOrCmd = server.url ?? server.command ?? "";
  if (urlOrCmd) {
    card.createDiv({ cls: "af-mcp-command", text: truncate(urlOrCmd, 60) });
  }

  // Tool count from the on-demand probe cache (if probed this session).
  const probed = deps.mcpProbeCache.get(server.name);
  if (probed && probed.length > 0) {
    const toolFooter = card.createDiv({ cls: "af-mcp-tool-footer" });
    const toolCount = toolFooter.createDiv({ cls: "af-mcp-tool-count" });
    const toolIcon = toolCount.createSpan();
    setIcon(toolIcon, "wrench");
    toolCount.createSpan({ text: ` ${probed.length} tools` });
    const chips = toolFooter.createDiv({ cls: "af-mcp-tool-chips" });
    for (const t of probed.slice(0, 4)) {
      chips.createSpan({ cls: "af-mcp-tool-chip", text: t.name });
    }
    if (probed.length > 4) {
      chips.createSpan({ cls: "af-mcp-tool-chip af-mcp-tool-chip-more", text: `+${probed.length - 4}` });
    }
  }

  // Auth / authenticating indicator for http/sse servers.
  if (deps.authenticatingServers.has(server.name)) {
    const authRow = card.createDiv({ cls: "af-mcp-auth-row" });
    const authBtn = authRow.createEl("button", { cls: "af-btn-sm primary", attr: { disabled: "true" } });
    const spinIcon = authBtn.createSpan({ cls: "af-spin" });
    setIcon(spinIcon, "loader-2");
    authBtn.appendText(" Authenticating…");
  } else if (server.enabled && needsAuth && server.auth === "oauth") {
    const authRow = card.createDiv({ cls: "af-mcp-auth-row" });
    const authBtn = authRow.createEl("button", { cls: "af-btn-sm primary" });
    const authIcon = authBtn.createSpan();
    setIcon(authIcon, "key");
    authBtn.appendText(" Authenticate");
    authBtn.onclick = (e) => {
      e.stopPropagation();
      void authenticateMcpServer(deps, server);
    };
  }

  card.onclick = () => openMcpDetailSlideover(deps, server);
}

async function authenticateMcpServer(deps: McpPageDeps, server: McpServer): Promise<void> {
  if (!server.url) {
    new Notice("No URL found for this server — can't authenticate.");
    return;
  }

  deps.authenticatingServers.add(server.name);
  void deps.rerender();

  new Notice(`Authenticating ${server.name}… Complete authorization in your browser.`, 10000);

  try {
    const transport = server.type === "sse" ? "sse" : "http";
    await deps.plugin.mcpManager.authenticateServer(server.name, server.url, transport);
    new Notice(`${server.name} authenticated successfully!`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    new Notice(`Authentication failed: ${msg}`, 8000);
  } finally {
    deps.authenticatingServers.delete(server.name);
    void deps.rerender();
  }
}

/** On-demand tool probe for the MCP detail view. Stores results in the
 *  transient cache and re-renders. */
async function probeMcpServer(deps: McpPageDeps, server: McpServer): Promise<void> {
  try {
    const tools = await deps.plugin.mcpManager.probeServer(server);
    deps.mcpProbeCache.set(server.name, tools);
    if (tools.length === 0) new Notice(`No tools discovered for ${server.name}.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    new Notice(`Probe failed: ${truncate(msg, 150)}`);
  }
}

function truncateDescription(text: string, maxLen: number): string {
  // Take first sentence or first line, whichever is shorter
  const firstLine = splitLines(text)[0] ?? text;
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  const candidate = firstSentence.length < firstLine.length ? firstSentence : firstLine;
  if (candidate.length <= maxLen) return candidate;
  return candidate.slice(0, maxLen - 1) + "…";
}

function openMcpDetailSlideover(deps: McpPageDeps, server: McpServer): void {
  deps.contentEl.querySelector(".af-slideover-overlay")?.remove();

  const overlay = deps.contentEl.createDiv({ cls: "af-slideover-overlay" });
  const panel = overlay.createDiv({ cls: "af-slideover" });

  const header = panel.createDiv({ cls: "af-slideover-header" });
  header.createDiv({ cls: "af-slideover-title", text: server.name });
  const closeBtn = header.createEl("button", { cls: "clickable-icon" });
  setIcon(closeBtn, "cross");
  closeBtn.onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const body = panel.createDiv({ cls: "af-slideover-body" });

  // Description
  if (server.description) {
    const descSection = body.createDiv({ cls: "af-slideover-section" });
    descSection.createDiv({ cls: "af-slideover-section-title", text: "DESCRIPTION" });
    descSection.createDiv({ cls: "af-mcp-detail-description", text: server.description });
  }

  // Server info
  const infoSection = body.createDiv({ cls: "af-slideover-section" });
  infoSection.createDiv({ cls: "af-slideover-section-title", text: "SERVER INFO" });
  deps.renderDetailRow(infoSection, "Name", server.name);
  deps.renderDetailRow(infoSection, "Transport", server.type);
  deps.renderDetailRow(infoSection, "Enabled", server.enabled ? "yes" : "no");
  if (server.type !== "stdio") {
    deps.renderDetailRow(infoSection, "Auth", server.auth ?? "none");
    deps.renderDetailRow(infoSection, "Authenticated", mcpHasToken(deps, server) ? "yes" : "no");
  }
  if (server.source) deps.renderDetailRow(infoSection, "Source", server.source);
  if (server.url) deps.renderDetailRow(infoSection, "URL", server.url);
  if (server.command) deps.renderDetailRow(infoSection, "Command", server.command);
  if (server.args && server.args.length > 0) deps.renderDetailRow(infoSection, "Args", server.args.join(" "));

  // Tools — populated by the on-demand probe (registry definitions carry no
  // probed tools until the user clicks "Probe tools").
  const probedTools = deps.mcpProbeCache.get(server.name) ?? [];
  const toolsSection = body.createDiv({ cls: "af-slideover-section" });
  const toolsTitleRow = toolsSection.createDiv({ cls: "af-slideover-section-title" });
  toolsTitleRow.setText(`TOOLS (${probedTools.length})`);
  const probeBtn = toolsSection.createEl("button", { cls: "af-btn-sm" });
  const probeIcon = probeBtn.createSpan();
  setIcon(probeIcon, "wrench");
  probeBtn.appendText(" Probe tools");
  probeBtn.onclick = async () => {
    probeBtn.disabled = true;
    probeBtn.setText(" Probing…");
    await probeMcpServer(deps, server);
    overlay.remove();
    openMcpDetailSlideover(deps, server);
  };

  if (probedTools.length > 0) {
    for (const tool of probedTools) {
      const toolItem = toolsSection.createDiv({ cls: "af-mcp-tool-detail" });
      const toolHeader = toolItem.createDiv({ cls: "af-mcp-tool-detail-header" });
      const toolNameEl = toolHeader.createSpan({ cls: "af-mcp-tool-detail-name" });
      const toolNameIcon = toolNameEl.createSpan();
      setIcon(toolNameIcon, "wrench");
      toolNameEl.createSpan({ text: ` ${tool.name}` });

      if (tool.inputSchema) {
        const params = (tool.inputSchema as { required?: string[] }).required ?? [];
        if (params.length > 0) {
          toolHeader.createSpan({
            cls: "af-mcp-tool-param-count",
            text: `${params.length} param${params.length !== 1 ? "s" : ""}`,
          });
        }
      }

      if (tool.description) {
        // Show first 2 lines of description, rest in collapsible
        const descLines = splitLines(tool.description).filter((l) => l.trim());
        const shortDesc = descLines.slice(0, 2).join(" ").trim();
        const hasMore = descLines.length > 2;

        if (hasMore) {
          const details = toolItem.createEl("details", { cls: "af-mcp-tool-detail-desc" });
          details.createEl("summary", { text: truncateDescription(shortDesc, 200) });
          details.createDiv({ cls: "af-mcp-tool-detail-full", text: tool.description });
        } else {
          toolItem.createDiv({ cls: "af-mcp-tool-detail-desc", text: shortDesc });
        }
      }

      // Input schema params
      if (tool.inputSchema) {
        const props = (tool.inputSchema as { properties?: Record<string, { type?: string; description?: string }> }).properties;
        const required = new Set((tool.inputSchema as { required?: string[] }).required ?? []);
        if (props && Object.keys(props).length > 0) {
          const paramsEl = toolItem.createDiv({ cls: "af-mcp-tool-params" });
          for (const [paramName, paramDef] of Object.entries(props)) {
            const paramEl = paramsEl.createDiv({ cls: "af-mcp-tool-param" });
            paramEl.createSpan({ cls: "af-mcp-tool-param-name", text: paramName });
            if (paramDef.type) {
              paramEl.createSpan({ cls: "af-mcp-tool-param-type", text: paramDef.type });
            }
            if (required.has(paramName)) {
              paramEl.createSpan({ cls: "af-mcp-tool-param-required", text: "required" });
            }
            if (paramDef.description) {
              paramEl.createSpan({
                cls: "af-mcp-tool-param-desc",
                text: truncate(paramDef.description, 80),
              });
            }
          }
        }
      }
    }
  } else {
    toolsSection.createDiv({
      cls: "af-form-hint",
      text: "Click \"Probe tools\" to discover the tools this server exposes.",
    });
  }

  // Actions section
  const actionsSection = body.createDiv({ cls: "af-slideover-section" });
  actionsSection.createDiv({ cls: "af-slideover-section-title", text: "ACTIONS" });

  if (server.enabled && server.url && server.auth === "oauth" && !mcpHasToken(deps, server)) {
    const authBtn = actionsSection.createEl("button", { cls: "af-btn-sm primary" });
    const authIcon = authBtn.createSpan();
    setIcon(authIcon, "key");
    authBtn.appendText(" Authenticate");
    authBtn.onclick = () => {
      overlay.remove();
      void authenticateMcpServer(deps, server);
    };
  }

  const removeBtn = actionsSection.createEl("button", { cls: "af-btn-sm danger" });
  const removeIcon = removeBtn.createSpan();
  setIcon(removeIcon, "trash-2");
  removeBtn.appendText(" Remove Server");
  removeBtn.onclick = async () => {
    try {
      await deps.plugin.repository.deleteMcpServer(server.name);
      deps.plugin.mcpAuth.removeToken(server.name);
      deps.mcpProbeCache.delete(server.name);
      new Notice(`Server "${server.name}" removed.`);
      overlay.remove();
      await deps.plugin.refreshFromVault();
      void deps.rerender();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to remove server: ${msg}`);
    }
  };
}
