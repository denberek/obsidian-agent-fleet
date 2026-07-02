import { Notice, setIcon } from "obsidian";
import type { McpServer } from "../../types";
import { splitLines } from "../../utils/platform";
import { createIcon } from "../../utils/icons";
import type { DashboardFormDeps } from "./shared";

/** View helpers the MCP server form borrows from the dashboard. */
export interface McpFormDeps extends DashboardFormDeps {
  /** Navigate the dashboard to another page (post-save / cancel). */
  navigate: (page: "mcp") => void;
}

/**
 * The "Add MCP Server" registration form: stdio (local process) or http/sse
 * (remote) transports, with optional bearer-token/OAuth auth. Secrets go to
 * the OS keychain via `plugin.mcpAuth`, never into the vault file.
 */
export function renderAddMcpServerForm(page: HTMLElement, deps: McpFormDeps): void {
  const { plugin } = deps;

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
  setIcon(avatar, "plus");
  const headerInfo = headerLeft.createDiv();
  headerInfo.createDiv({ cls: "af-detail-header-name", text: "Add MCP Server" });
  headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Register a new MCP server for agents to use" });
  header.createDiv({ cls: "af-detail-header-actions" });

  // Form state
  const state: {
    name: string;
    transport: "stdio" | "http" | "sse";
    description: string;
    command: string;
    args: string;
    envVars: string;
    url: string;
    headers: string;
    auth: "none" | "bearer" | "oauth";
    bearerToken: string;
  } = {
    name: "",
    transport: "stdio",
    description: "",
    command: "",
    args: "",
    envVars: "",
    url: "",
    headers: "",
    auth: "none",
    bearerToken: "",
  };

  const form = page.createDiv({ cls: "af-create-form" });

  // ─── Server Details ───
  const detailsSection = form.createDiv({ cls: "af-create-section" });
  const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
  const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(detailsIcon, "plug");
  detailsHeader.createSpan({ text: "Server Details" });

  deps.createFormField(detailsSection, "Name", "my-server", "Unique name for this MCP server", (v) => { state.name = v; });

  // Transport dropdown
  const transportRow = detailsSection.createDiv({ cls: "af-form-row" });
  const transportLabel = transportRow.createDiv({ cls: "af-form-label" });
  transportLabel.setText("Transport");
  deps.addTooltip(transportLabel, "stdio: local process, http/sse: remote server");
  const transportSelect = transportRow.createEl("select", { cls: "af-form-select" });
  transportSelect.createEl("option", { text: "stdio", attr: { value: "stdio" } });
  transportSelect.createEl("option", { text: "http", attr: { value: "http" } });
  transportSelect.createEl("option", { text: "sse", attr: { value: "sse" } });

  deps.createFormField(detailsSection, "Description", "What this server does (optional)", "Shown on the server card", (v) => { state.description = v; });

  // ─── stdio fields ───
  const stdioSection = form.createDiv({ cls: "af-create-section" });
  const stdioHeader = stdioSection.createDiv({ cls: "af-create-section-header" });
  const stdioIcon = stdioHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(stdioIcon, "terminal");
  stdioHeader.createSpan({ text: "Process Configuration" });

  deps.createFormField(stdioSection, "Command", "npx @anthropic-ai/mcp-server-memory", "The command to run", (v) => { state.command = v; });
  deps.createFormField(stdioSection, "Arguments", "--port 3000", "Space-separated arguments (optional)", (v) => { state.args = v; });

  const envLabel = stdioSection.createDiv({ cls: "af-form-label" });
  envLabel.setText("Environment variables");
  deps.addTooltip(envLabel, "One KEY=VALUE per line");
  const envTextarea = stdioSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "API_KEY=sk-...\nDEBUG=true", rows: "3" },
  });
  envTextarea.addEventListener("input", () => { state.envVars = envTextarea.value; });

  // ─── http/sse fields ───
  const httpSection = form.createDiv({ cls: "af-create-section" });
  const httpHeader = httpSection.createDiv({ cls: "af-create-section-header" });
  const httpIcon = httpHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(httpIcon, "globe");
  httpHeader.createSpan({ text: "Remote Server Configuration" });

  deps.createFormField(httpSection, "URL", "https://mcp.example.com/sse", "Server endpoint URL", (v) => { state.url = v; });

  const headersLabel = httpSection.createDiv({ cls: "af-form-label" });
  headersLabel.setText("Custom headers");
  deps.addTooltip(headersLabel, "One Header: Value per line (optional, non-secret)");
  const headersTextarea = httpSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "X-Custom-Header: value", rows: "2" },
  });
  headersTextarea.addEventListener("input", () => { state.headers = headersTextarea.value; });

  // Auth dropdown
  const authRow = httpSection.createDiv({ cls: "af-form-row" });
  const authLabel = authRow.createDiv({ cls: "af-form-label" });
  authLabel.setText("Authentication");
  deps.addTooltip(authLabel, "none, a static bearer token, or OAuth (authenticate after saving)");
  const authSelect = authRow.createEl("select", { cls: "af-form-select" });
  authSelect.createEl("option", { text: "None", attr: { value: "none" } });
  authSelect.createEl("option", { text: "Bearer token", attr: { value: "bearer" } });
  authSelect.createEl("option", { text: "OAuth", attr: { value: "oauth" } });

  // Bearer token field (shown only for auth=bearer). Stored in the keychain,
  // never in the vault.
  const bearerRow = httpSection.createDiv({ cls: "af-form-row" });
  const bearerLabel = bearerRow.createDiv({ cls: "af-form-label" });
  bearerLabel.setText("Bearer token");
  deps.addTooltip(bearerLabel, "Stored securely in the OS keychain, never written to the vault");
  const bearerInput = bearerRow.createEl("input", { cls: "af-form-input", attr: { type: "password", placeholder: "sk-…" } });
  bearerInput.addEventListener("input", () => { state.bearerToken = bearerInput.value; });

  const updateAuthVisibility = () => {
    bearerRow.setCssStyles({ display: state.auth === "bearer" ? "" : "none" });
  };
  authSelect.addEventListener("change", () => {
    state.auth = authSelect.value as "none" | "bearer" | "oauth";
    updateAuthVisibility();
  });
  updateAuthVisibility();

  // Toggle section visibility based on transport
  const updateTransportVisibility = () => {
    stdioSection.setCssStyles({ display: state.transport === "stdio" ? "" : "none" });
    httpSection.setCssStyles({ display: state.transport !== "stdio" ? "" : "none" });
  };
  transportSelect.addEventListener("change", () => {
    state.transport = transportSelect.value as "stdio" | "http" | "sse";
    updateTransportVisibility();
  });
  updateTransportVisibility();

  // ─── Footer ───
  const footer = page.createDiv({ cls: "af-create-footer" });
  const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
  cancelBtn.onclick = () => deps.navigate("mcp");

  const submitBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
  createIcon(submitBtn, "plus", "af-btn-icon");
  submitBtn.appendText(" Add Server");
  submitBtn.onclick = async () => {
    const name = state.name.trim();
    if (!name) { new Notice("Server name is required."); return; }

    if (state.transport === "stdio") {
      if (!state.command.trim()) { new Notice("Command is required for stdio servers."); return; }
    } else {
      if (!state.url.trim()) { new Notice("URL is required for HTTP/SSE servers."); return; }
    }

    // Parse env vars
    const envVars: Record<string, string> = {};
    if (state.envVars.trim()) {
      for (const line of splitLines(state.envVars)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx <= 0) { new Notice(`Invalid env var: ${trimmed}`); return; }
        envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    }

    // Parse headers
    const headers: Record<string, string> = {};
    if (state.headers.trim()) {
      for (const line of splitLines(state.headers)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx <= 0) { new Notice(`Invalid header: ${trimmed}`); return; }
        headers[trimmed.slice(0, colonIdx).trim()] = trimmed.slice(colonIdx + 1).trim();
      }
    }

    // Parse args
    const args = state.args.trim() ? state.args.trim().split(/\s+/) : undefined;

    if (plugin.repository.getMcpServerByName(name)) {
      new Notice(`An MCP server named "${name}" already exists.`);
      return;
    }
    if (state.transport !== "stdio" && state.auth === "bearer" && !state.bearerToken.trim()) {
      new Notice("Enter a bearer token, or choose a different auth method.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.setText("Adding...");

    // Build the registry definition (non-secret fields only). The bearer
    // token, if any, goes to the keychain — never into the vault file.
    const server: McpServer = {
      name,
      type: state.transport,
      enabled: true,
      source: "manual",
      status: "disconnected",
      scope: "user",
      tools: [],
      toolDetails: [],
    };
    if (state.transport === "stdio") {
      server.command = state.command.trim();
      if (args) server.args = args;
      if (Object.keys(envVars).length > 0) server.env = envVars;
    } else {
      server.url = state.url.trim();
      if (Object.keys(headers).length > 0) server.headers = headers;
      server.auth = state.auth;
    }

    try {
      await plugin.repository.saveMcpServer(server, state.description.trim());
      if (state.transport !== "stdio" && state.auth === "bearer" && state.bearerToken.trim()) {
        plugin.mcpAuth.storeStaticToken(name, state.bearerToken.trim());
      }
      new Notice(`Server "${name}" added.`);
      await plugin.refreshFromVault();
      deps.navigate("mcp");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to add server: ${msg}`);
      submitBtn.disabled = false;
      submitBtn.setText("");
      createIcon(submitBtn, "plus", "af-btn-icon");
      submitBtn.appendText(" Add Server");
    }
  };
}
