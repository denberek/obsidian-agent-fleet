import { Notice, setIcon } from "obsidian";
import { IconPickerModal } from "../../modals/iconPickerModal";
import type AgentFleetPlugin from "../../main";
import type { AgentConfig } from "../../types";
import { slugify } from "../../utils/markdown";
import { splitLines } from "../../utils/platform";
import { createIcon } from "../../utils/icons";
import { CODEX_MODEL_ALIASES, MODEL_ALIASES, renderModelPicker } from "../../components/modelPicker";
import type { DashboardFormDeps } from "./shared";
import { parseCronComponents } from "./shared";

// Adapter choices in the agent forms. "process"/"http" stay greyed out until
// those backends exist.
const ADAPTER_FORM_OPTIONS: Array<[string, string, boolean]> = [
  ["claude-code", "Claude Code", false],
  ["codex", "Codex", false],
  ["process", "Process (coming soon)", true],
  ["http", "HTTP (coming soon)", true],
];

// Permission modes per adapter: [value, label, description].
// Claude Code uses its native --permission-mode vocabulary; Codex maps onto
// sandbox levels (`codex exec` never prompts, so the sandbox is the only
// enforcement axis).
const CLAUDE_PERM_MODE_OPTIONS: Array<[string, string, string]> = [
  ["bypassPermissions", "Bypass Permissions", "Auto-approve everything except deny list"],
  ["dontAsk", "Don’t Ask", "Auto-approve all tool calls"],
  ["acceptEdits", "Accept Edits", "Auto-approve file edits, block bash unless allowed"],
  ["plan", "Plan", "Read-only mode, no writes or commands"],
  ["default", "Default", "Ask for each tool call"],
];
const CODEX_PERM_MODE_OPTIONS: Array<[string, string, string]> = [
  ["bypassPermissions", "Bypass (no sandbox)", "No sandbox, auto-approve everything"],
  ["workspace-write", "Workspace Write", "Sandboxed: writes only inside the working dir"],
  ["read-only", "Read Only", "Sandboxed: no writes or side-effect commands"],
];

function isCodexAdapterValue(adapter: string): boolean {
  const v = adapter.trim().toLowerCase();
  return v === "codex" || v === "openai-codex";
}

function permModeOptionsFor(adapter: string): Array<[string, string, string]> {
  return isCodexAdapterValue(adapter) ? CODEX_PERM_MODE_OPTIONS : CLAUDE_PERM_MODE_OPTIONS;
}

/** Translate a permission-mode value to the nearest equivalent when the user
 *  switches the form's adapter, so the dropdown always shows a valid choice. */
function permModeForAdapter(value: string, adapter: string): string {
  if (isCodexAdapterValue(adapter)) {
    switch (value) {
      case "acceptEdits":
      case "default":
        return "workspace-write";
      case "plan":
        return "read-only";
      case "dontAsk":
        return "bypassPermissions";
      default:
        return CODEX_PERM_MODE_OPTIONS.some(([v]) => v === value) ? value : "bypassPermissions";
    }
  }
  switch (value) {
    case "workspace-write":
      return "acceptEdits";
    case "read-only":
      return "plan";
    case "danger-full-access":
      return "bypassPermissions";
    default:
      return CLAUDE_PERM_MODE_OPTIONS.some(([v]) => v === value) ? value : "bypassPermissions";
  }
}

/** One-line explanation of how permission modes map across adapter families.
 *  Shown under the permission-mode field after the user switches adapters, so
 *  the vocabulary swap (and the automatic remapping) isn't silent. */
function adapterMappingHintText(adapter: string): string {
  return isCodexAdapterValue(adapter)
    ? "Codex enforces permissions via sandbox modes — your Claude mode was mapped: Accept Edits/Default ≈ Workspace Write, Plan ≈ Read Only, Don’t Ask ≈ Bypass."
    : "Claude Code uses permission modes — your Codex sandbox was mapped: Workspace Write ≈ Accept Edits, Read Only ≈ Plan.";
}

/** View helpers the agent forms borrow from the dashboard. */
export interface AgentFormDeps extends DashboardFormDeps {
  /** Navigate the dashboard to another page (post-save / cancel / delete). */
  navigate: (page: "agents" | "agent-detail" | "mcp", context?: string) => void;
  /** Paint an agent avatar (emoji / lucide icon / initials) — shared with agent cards. */
  renderAgentAvatar: (el: HTMLElement, agent: AgentConfig) => void;
}

/**
 * Simplified schedule picker for heartbeat — frequency intervals + time-of-day,
 * no weekly/monthly/day-of-week selection. Outputs a cron expression into
 * `state.heartbeatSchedule`.
 */
function renderHeartbeatSchedule(
  container: HTMLElement,
  state: { heartbeatSchedule: string },
): void {
  const parsed = parseCronComponents(state.heartbeatSchedule);

  // Frequency dropdown — intervals only, no weekly/monthly
  const freqRow = container.createDiv({ cls: "af-form-row" });
  freqRow.createDiv({ cls: "af-form-label", text: "Frequency" });
  const freqSelect = freqRow.createEl("select", { cls: "af-form-select" });
  const freqOptions: Array<[string, string]> = [
    ["every_5m", "Every 5 minutes"],
    ["every_15m", "Every 15 minutes"],
    ["every_30m", "Every 30 minutes"],
    ["every_hour", "Every hour"],
    ["every_2h", "Every 2 hours"],
    ["every_4h", "Every 4 hours"],
    ["every_6h", "Every 6 hours"],
    ["every_12h", "Every 12 hours"],
    ["daily", "Once a day"],
  ];
  // Map the current schedule to a freq key
  let currentFreq = "every_hour";
  const cronToFreq: Record<string, string> = {
    "*/5 * * * *": "every_5m",
    "*/15 * * * *": "every_15m",
    "*/30 * * * *": "every_30m",
    "0 * * * *": "every_hour",
    "0 */2 * * *": "every_2h",
    "0 */4 * * *": "every_4h",
    "0 */6 * * *": "every_6h",
    "0 */12 * * *": "every_12h",
  };
  if (cronToFreq[state.heartbeatSchedule]) {
    currentFreq = cronToFreq[state.heartbeatSchedule]!;
  } else if (parsed.freq === "daily" || parsed.freq === "weekdays") {
    currentFreq = "daily";
  }

  for (const [val, lbl] of freqOptions) {
    const opt = freqSelect.createEl("option", { text: lbl, attr: { value: val } });
    if (val === currentFreq) opt.selected = true;
  }

  // Time row — only shown for "once a day"
  const timeRow = container.createDiv({ cls: "af-form-row af-schedule-time-row" });
  timeRow.createDiv({ cls: "af-form-label", text: "Time" });
  const timeWrap = timeRow.createDiv({ cls: "af-schedule-time-selects" });

  const hourSelect = timeWrap.createEl("select", { cls: "af-form-select af-form-select-sm" });
  for (let h = 0; h < 24; h++) {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const opt = hourSelect.createEl("option", { text: `${h12} ${ampm}`, attr: { value: String(h) } });
    if (h === parsed.hour) opt.selected = true;
  }

  timeWrap.createSpan({ cls: "af-schedule-colon", text: ":" });

  const minSelect = timeWrap.createEl("select", { cls: "af-form-select af-form-select-sm" });
  for (let m = 0; m < 60; m += 5) {
    const opt = minSelect.createEl("option", {
      text: String(m).padStart(2, "0"),
      attr: { value: String(m) },
    });
    if (m === parsed.minute) opt.selected = true;
  }

  const showHide = () => {
    timeRow.setCssStyles({ display: freqSelect.value === "daily" ? "" : "none" });
  };

  const buildCron = () => {
    const freq = freqSelect.value;
    const h = hourSelect.value;
    const m = minSelect.value;
    switch (freq) {
      case "every_5m": state.heartbeatSchedule = "*/5 * * * *"; break;
      case "every_15m": state.heartbeatSchedule = "*/15 * * * *"; break;
      case "every_30m": state.heartbeatSchedule = "*/30 * * * *"; break;
      case "every_hour": state.heartbeatSchedule = "0 * * * *"; break;
      case "every_2h": state.heartbeatSchedule = "0 */2 * * *"; break;
      case "every_4h": state.heartbeatSchedule = "0 */4 * * *"; break;
      case "every_6h": state.heartbeatSchedule = "0 */6 * * *"; break;
      case "every_12h": state.heartbeatSchedule = "0 */12 * * *"; break;
      case "daily": state.heartbeatSchedule = `${m} ${h} * * *`; break;
    }
  };

  freqSelect.addEventListener("change", () => { showHide(); buildCron(); });
  hourSelect.addEventListener("change", buildCron);
  minSelect.addEventListener("change", buildCron);

  showHide();
}

/** Render the per-agent MCP grant picker from the fleet registry. Shared by
 *  the create- and edit-agent forms. `selected` is the agent's
 *  `mcpServers` set, mutated in place as checkboxes toggle. */
function renderAgentMcpPicker(section: HTMLElement, deps: AgentFormDeps, selected: Set<string>): void {
  section.createDiv({
    cls: "af-form-hint",
    text:
      "Servers from the MCP Servers tab. Checked servers are available to this " +
      "agent on any adapter (Claude or Codex). Leave all unchecked to grant every enabled server.",
  });
  const servers = deps.plugin.repository.getMcpServers();
  if (servers.length === 0) {
    const hint = section.createDiv({ cls: "af-form-hint" });
    hint.appendText("No MCP servers registered yet. ");
    const link = hint.createEl("a", { cls: "af-link", text: "Add one in the MCP Servers tab." });
    link.onclick = (e) => { e.preventDefault(); deps.navigate("mcp"); };
    return;
  }
  const grid = section.createDiv({ cls: "af-create-skills-grid" });
  for (const server of servers) {
    const item = grid.createDiv({ cls: "af-mcp-agent-item" });
    const cb = item.createEl("input", { cls: "af-form-toggle", attr: { type: "checkbox" } });
    cb.checked = selected.has(server.name);
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(server.name);
      else selected.delete(server.name);
    });
    const lbl = item.createDiv({ cls: "af-mcp-agent-label" });
    const nameRow = lbl.createDiv({ cls: "af-mcp-agent-name-row" });
    const dot = nameRow.createSpan({ cls: `af-mcp-status-dot ${server.enabled ? "idle" : "disabled"}` });
    dot.title = server.enabled ? "enabled" : "disabled";
    nameRow.createSpan({ cls: "af-create-skill-name", text: server.name });
    nameRow.createSpan({ cls: "af-mcp-agent-tool-count", text: server.type });
    if (!server.enabled) {
      nameRow.createSpan({ cls: "af-mcp-agent-tool-count af-muted", text: "disabled" });
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Create Agent Page
// ═══════════════════════════════════════════════════════

export function renderCreateAgentForm(page: HTMLElement, deps: AgentFormDeps): void {
  const { plugin } = deps;

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
  setIcon(avatar, "plus");
  const headerInfo = headerLeft.createDiv();
  headerInfo.createDiv({ cls: "af-detail-header-name", text: "Create New Agent" });
  headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Configure a new agent for your fleet" });

  header.createDiv({ cls: "af-detail-header-actions" });
  // Form state
  const state = {
    name: "",
    description: "",
    avatar: "",
    tags: "",
    systemPrompt: "",
    model: "default",
    adapter: "claude-code",
    cwd: "",
    timeout: 300,
    permissionMode: "bypassPermissions",
    effort: "",
    selectedSkills: new Set<string>(),
    selectedMcpServers: new Set<string>(),
    skillsBody: "",
    contextBody: "",
    approvalRequired: "",
    memory: true,
    enabled: true,
    allowedCommands: "",
    blockedCommands: "",
    heartbeatEnabled: false,
    heartbeatSchedule: "0 */6 * * *",
    heartbeatBody: "",
    heartbeatNotify: true,
    heartbeatChannel: "",
    heartbeatChannelTarget: "",
    autoCompactThreshold: 85,
    wikiReferences: [] as string[],
  };

  const TEMPLATES: Record<string, { label: string; prompt: string }> = {
    none: { label: "None", prompt: "" },
    coding: { label: "Coding Agent", prompt: "You are a coding agent. Review code, write tests, fix bugs, and implement features.\nFollow existing code conventions. Write clean, well-tested code.\nIf something is unclear, ask for clarification instead of guessing." },
    monitor: { label: "Monitor", prompt: "You are a monitoring agent. Check system status, alert on failures, and report on health metrics.\nBe concise and factual. Highlight anomalies clearly.\nInclude timestamps and relevant context in all reports." },
    briefing: { label: "Briefing", prompt: "You are a briefing agent. Summarize activity, generate reports, and surface key changes.\nPrioritize recent and important changes. Keep summaries concise.\nEnd with explicit next actions if they exist." },
    reviewer: { label: "Code Reviewer", prompt: "You are a code review agent. Analyze pull requests, suggest improvements, and flag potential issues.\nFocus on correctness, security, and maintainability.\nBe specific — reference file names and line numbers." },
  };

  const form = page.createDiv({ cls: "af-create-form" });

  // ─── Identity Section ───
  const identitySection = form.createDiv({ cls: "af-create-section" });
  const identityHeader = identitySection.createDiv({ cls: "af-create-section-header" });
  const identityIcon = identityHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(identityIcon, "user");
  identityHeader.createSpan({ text: "Identity" });

  deps.createFormField(identitySection, "Name", "deploy-watcher", "Unique identifier (will be slugified)", (v) => { state.name = v; });
  deps.createFormField(identitySection, "Description", "Monitors deployments and reports status", "", (v) => { state.description = v; });

  const avatarRow = identitySection.createDiv({ cls: "af-form-row" });
  avatarRow.createDiv({ cls: "af-form-label", text: "Avatar" });
  const avatarInput = avatarRow.createEl("input", {
    cls: "af-form-input af-form-input-sm",
    attr: { type: "text", placeholder: "🛡️" },
  });
  avatarInput.addEventListener("input", () => { state.avatar = avatarInput.value; });

  deps.createFormField(identitySection, "Tags", "devops, monitoring", "Comma-separated", (v) => { state.tags = v; });

  // Enabled toggle
  const enabledRow = identitySection.createDiv({ cls: "af-form-row af-form-row-toggle" });
  enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
  const enabledToggle = enabledRow.createDiv({ cls: "af-agent-card-toggle on" });
  enabledToggle.onclick = () => {
    const isOn = enabledToggle.hasClass("on");
    enabledToggle.toggleClass("on", !isOn);
    state.enabled = !isOn;
  };

  // ─── System Prompt Section ───
  const promptSection = form.createDiv({ cls: "af-create-section" });
  const promptHeader = promptSection.createDiv({ cls: "af-create-section-header" });
  const promptIcon = promptHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(promptIcon, "message-square");
  promptHeader.createSpan({ text: "System Prompt" });

  const templateRow = promptSection.createDiv({ cls: "af-form-row" });
  templateRow.createDiv({ cls: "af-form-label", text: "Template" });
  const templateSelect = templateRow.createEl("select", { cls: "af-form-select" });
  for (const [key, { label }] of Object.entries(TEMPLATES)) {
    templateSelect.createEl("option", { text: label, attr: { value: key } });
  }

  const promptTextarea = promptSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "You are a deployment monitoring agent...", rows: "10" },
  });
  promptTextarea.addEventListener("input", () => { state.systemPrompt = promptTextarea.value; });

  templateSelect.addEventListener("change", () => {
    const preset = TEMPLATES[templateSelect.value];
    if (preset && templateSelect.value !== "none") {
      state.systemPrompt = preset.prompt;
      promptTextarea.value = preset.prompt;
    }
  });

  // ─── Runtime Config Section ───
  const configSection = form.createDiv({ cls: "af-create-section" });
  const configHeader = configSection.createDiv({ cls: "af-create-section-header" });
  const configIcon = configHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(configIcon, "settings");
  configHeader.createSpan({ text: "Runtime Config" });

  const configGrid = configSection.createDiv({ cls: "af-create-config-grid" });

  // Adapter (before model, so model dropdown updates when adapter changes)
  const adapterRow = configGrid.createDiv({ cls: "af-form-row" });
  adapterRow.createDiv({ cls: "af-form-label", text: "Adapter" });
  const adapterSelect = adapterRow.createEl("select", { cls: "af-form-select" });
  for (const [val, lbl, disabled] of ADAPTER_FORM_OPTIONS) {
    const opt = adapterSelect.createEl("option", { text: lbl, attr: { value: val, ...(disabled ? { disabled: "true" } : {}) } });
    if (val === "claude-code") opt.selected = true;
  }

  // Model (dynamic based on adapter)
  const modelRow = configGrid.createDiv({ cls: "af-form-row" });
  const modelLabel = modelRow.createDiv({ cls: "af-form-label", text: "Model" });
  deps.addTooltip(
    modelLabel,
    `Aliases (opus/sonnet/haiku/opusplan) work on any backend. Choose Custom… for a pinned ID or Bedrock/Vertex/Foundry. Blank = use Settings default (${plugin.settings.defaultModel || "CLI default"}).`,
  );
  const modelFieldWrap = modelRow.createDiv({ cls: "af-form-field-wrap" });
  const renderModelField = () => {
    renderModelPicker(modelFieldWrap, {
      value: state.model,
      adapter: state.adapter,
      onChange: (value) => { state.model = value; },
    });
  };
  renderModelField();

  // The permission dropdown is built further down; it registers its
  // repopulate hook here so adapter switches refresh it too.
  let repopulatePermModeSelect: () => void = () => { /* assigned below */ };
  let showAdapterMappingHint: () => void = () => { /* assigned below */ };

  adapterSelect.addEventListener("change", () => {
    state.adapter = adapterSelect.value;
    // A model alias from the other vendor would be passed verbatim and
    // rejected by the CLI — reset to "use default" on family switch.
    const otherAliases = isCodexAdapterValue(state.adapter) ? MODEL_ALIASES : CODEX_MODEL_ALIASES;
    if (otherAliases.some((a) => a.value === state.model.trim())) {
      state.model = "";
    }
    renderModelField();
    state.permissionMode = permModeForAdapter(state.permissionMode, state.adapter);
    repopulatePermModeSelect();
    showAdapterMappingHint();
  });

  // Working Dir
  const cwdRow = configGrid.createDiv({ cls: "af-form-row" });
  cwdRow.createDiv({ cls: "af-form-label", text: "Working Dir" });
  const cwdInput = cwdRow.createEl("input", {
    cls: "af-form-input",
    attr: { type: "text", placeholder: "Leave empty for vault root" },
  });
  cwdInput.addEventListener("input", () => { state.cwd = cwdInput.value; });

  // Timeout
  const timeoutRow = configGrid.createDiv({ cls: "af-form-row" });
  timeoutRow.createDiv({ cls: "af-form-label", text: "Timeout (sec)" });
  const timeoutInput = timeoutRow.createEl("input", {
    cls: "af-form-input af-form-input-sm",
    attr: { type: "number", value: "300" },
  });
  timeoutInput.addEventListener("input", () => {
    const n = parseInt(timeoutInput.value, 10);
    if (!isNaN(n) && n > 0) state.timeout = n;
  });

  // Permission Mode (options depend on the selected adapter)
  const permRow = configGrid.createDiv({ cls: "af-form-row" });
  permRow.createDiv({ cls: "af-form-label", text: "Permission Mode" });
  const permSelect = permRow.createEl("select", { cls: "af-form-select" });
  const permDescEl = configGrid.createDiv({ cls: "af-form-hint", text: "" });
  repopulatePermModeSelect = () => {
    // Snap any value left over from the other adapter family to its
    // nearest equivalent so the dropdown always reflects what gets saved.
    state.permissionMode = permModeForAdapter(state.permissionMode, state.adapter);
    const options = permModeOptionsFor(state.adapter);
    permSelect.empty();
    for (const [val, lbl] of options) {
      const opt = permSelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === state.permissionMode) opt.selected = true;
    }
    permDescEl.textContent = options.find(([v]) => v === permSelect.value)?.[2] ?? "";
  };
  repopulatePermModeSelect();
  // Adapter-switch mapping hint — hidden until the user actually changes the
  // adapter, then explains how the previous mode family was translated.
  const permMapHintEl = configGrid.createDiv({ cls: "af-form-hint af-adapter-map-hint" });
  permMapHintEl.setCssStyles({ display: "none" });
  showAdapterMappingHint = () => {
    permMapHintEl.setText(adapterMappingHintText(state.adapter));
    permMapHintEl.setCssStyles({ display: "" });
  };
  permSelect.addEventListener("change", () => {
    state.permissionMode = permSelect.value;
    permDescEl.textContent = permModeOptionsFor(state.adapter).find(([v]) => v === permSelect.value)?.[2] ?? "";
  });

  // Effort Level
  const effortRow = configGrid.createDiv({ cls: "af-form-row" });
  effortRow.createDiv({ cls: "af-form-label", text: "Effort Level" });
  const effortSelect = effortRow.createEl("select", { cls: "af-form-select" });
  for (const [val, lbl] of [["", "Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["max", "Max"]] as const) {
    effortSelect.createEl("option", { text: lbl, attr: { value: val } });
  }
  effortSelect.addEventListener("change", () => { state.effort = effortSelect.value; });
  configGrid.createDiv({ cls: "af-form-hint", text: "Controls reasoning depth — low is fast, max is most thorough" });

  // Auto-compact threshold
  const compactRow = configGrid.createDiv({ cls: "af-form-row" });
  const compactLabel = compactRow.createDiv({ cls: "af-form-label", text: "Auto-compact at" });
  deps.addTooltip(
    compactLabel,
    "Percent of context window at which the chat auto-invokes /compact before the next message. 85% is a good default. Set 0 to disable.",
  );
  const compactInput = compactRow.createEl("input", {
    cls: "af-form-input af-form-input-sm",
    attr: { type: "number", min: "0", max: "100", value: String(state.autoCompactThreshold) },
  });
  compactInput.addEventListener("input", () => {
    const n = parseInt(compactInput.value, 10);
    if (!isNaN(n) && n >= 0 && n <= 100) state.autoCompactThreshold = n;
  });
  configGrid.createDiv({ cls: "af-form-hint", text: "0 disables auto-compact" });

  // Wiki references (consumer-mode read access to other keepers' scopes)
  {
    const wikiKeepers = plugin.runtime.getSnapshot().agents.filter((a) => a.wikiKeeper !== undefined);
    if (wikiKeepers.length > 0) {
      const wrRow = configGrid.createDiv({ cls: "af-form-row af-form-row-toggle" });
      const wrLabel = wrRow.createDiv({ cls: "af-form-label", text: "Wiki access" });
      deps.addTooltip(
        wrLabel,
        "Lets this agent read + cite from the selected Wiki Keeper scopes (requires the wiki-query skill).",
      );
      const wrWrap = wrRow.createDiv({ cls: "af-form-field-wrap" });
      for (const wk of wikiKeepers) {
        const label = wrWrap.createEl("label", { cls: "af-form-checkbox-row" });
        const cb = label.createEl("input", { attr: { type: "checkbox" } });
        label.createSpan({ text: ` ${wk.name}`, cls: "af-form-checkbox-label" });
        cb.addEventListener("change", () => {
          if (cb.checked) {
            if (!state.wikiReferences.includes(wk.name)) state.wikiReferences.push(wk.name);
          } else {
            state.wikiReferences = state.wikiReferences.filter((n) => n !== wk.name);
          }
        });
      }
    }
  }

  // ─── Heartbeat Section ───
  {
    const heartbeatSection = form.createDiv({ cls: "af-create-section" });
    const heartbeatHeader = heartbeatSection.createDiv({ cls: "af-create-section-header" });
    const heartbeatIcon = heartbeatHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(heartbeatIcon, "heart-pulse");
    const heartbeatHeaderLabel = heartbeatHeader.createSpan({ text: "Heartbeat" });
    deps.addTooltip(heartbeatHeaderLabel, "Autonomous periodic run — what the agent does when no one is asking");

    const hbEnabledRow = heartbeatSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    hbEnabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
    const hbEnabledToggle = hbEnabledRow.createDiv({ cls: "af-agent-card-toggle" });
    const hbBody = heartbeatSection.createDiv();
    hbBody.setCssStyles({ display: "none" });
    hbEnabledToggle.onclick = () => {
      const isOn = hbEnabledToggle.hasClass("on");
      hbEnabledToggle.toggleClass("on", !isOn);
      state.heartbeatEnabled = !isOn;
      hbBody.setCssStyles({ display: !isOn ? "" : "none" });
    };

    renderHeartbeatSchedule(hbBody, state);

    const hbNotifyRow = hbBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
    const hbNotifyLabel = hbNotifyRow.createDiv({ cls: "af-form-label" });
    hbNotifyLabel.setText("Notify");
    deps.addTooltip(hbNotifyLabel, "Show an Obsidian notice when the heartbeat completes");
    const hbNotifyToggle = hbNotifyRow.createDiv({ cls: "af-agent-card-toggle on" });
    hbNotifyToggle.onclick = () => {
      const isOn = hbNotifyToggle.hasClass("on");
      hbNotifyToggle.toggleClass("on", !isOn);
      state.heartbeatNotify = !isOn;
    };

    const createSnapshot = plugin.runtime.getSnapshot();
    const hbChannelRow = hbBody.createDiv({ cls: "af-form-row" });
    const hbChannelLabel = hbChannelRow.createDiv({ cls: "af-form-label" });
    hbChannelLabel.setText("Post to channel");
    deps.addTooltip(hbChannelLabel, "Heartbeat results are posted to this Slack channel when the run completes");
    const hbChannelSelect = hbChannelRow.createEl("select", { cls: "af-form-select" });
    hbChannelSelect.createEl("option", { text: "(none)", attr: { value: "" } });
    for (const ch of createSnapshot.channels) {
      hbChannelSelect.createEl("option", { text: ch.name, attr: { value: ch.name } });
    }
    hbChannelSelect.addEventListener("change", () => { state.heartbeatChannel = hbChannelSelect.value; syncHbTarget(); });

    const hbTargetRow = hbBody.createDiv({ cls: "af-form-row" });
    const hbTargetLabel = hbTargetRow.createDiv({ cls: "af-form-label" });
    hbTargetLabel.setText("Target ID");
    deps.addTooltip(hbTargetLabel, "Specific channel id to post to (Discord/Slack channel id, Telegram chat id). Empty = DM the channel’s first allowed user.");
    const hbTargetInput = hbTargetRow.createEl("input", { cls: "af-form-input", attr: { type: "text", placeholder: "Channel/chat id — empty = DM" } });
    hbTargetInput.value = state.heartbeatChannelTarget;
    hbTargetInput.addEventListener("input", () => { state.heartbeatChannelTarget = hbTargetInput.value.trim(); });
    const syncHbTarget = () => { hbTargetRow.setCssStyles({ display: state.heartbeatChannel ? "" : "none" }); };
    syncHbTarget();

    const hbInstructionLabel = hbBody.createDiv({ cls: "af-form-label" });
    hbInstructionLabel.setCssStyles({ width: "auto" });
    hbInstructionLabel.setCssStyles({ marginTop: "12px" });
    hbInstructionLabel.setText("Instruction");
    deps.addTooltip(hbInstructionLabel, "What the agent does on each heartbeat. Also used by the \"Run Now\" button.");
    const hbTextarea = hbBody.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "Check status, scan for issues, report findings...", rows: "8" },
    });
    hbTextarea.addEventListener("input", () => { state.heartbeatBody = hbTextarea.value; });
  }

  // ─── Skills Section ───
  const skillsSection = form.createDiv({ cls: "af-create-section" });
  const skillsHeader = skillsSection.createDiv({ cls: "af-create-section-header" });
  const skillsIcon = skillsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(skillsIcon, "puzzle");
  skillsHeader.createSpan({ text: "Skills" });

  const snapshot = plugin.runtime.getSnapshot();
  if (snapshot.skills.length > 0) {
    skillsSection.createDiv({ cls: "af-form-sublabel", text: "Shared Skills" });
    const skillsGrid = skillsSection.createDiv({ cls: "af-create-skills-grid" });
    for (const skill of snapshot.skills) {
      const item = skillsGrid.createDiv({ cls: "af-create-skill-item" });
      const cb = item.createEl("input", { cls: "af-form-toggle", attr: { type: "checkbox" } });
      cb.addEventListener("change", () => {
        if (cb.checked) state.selectedSkills.add(skill.name);
        else state.selectedSkills.delete(skill.name);
      });
      const lbl = item.createDiv({ cls: "af-create-skill-label" });
      lbl.createSpan({ cls: "af-create-skill-name", text: skill.name });
      if (skill.description) {
        lbl.createSpan({ cls: "af-create-skill-desc", text: ` — ${skill.description}` });
      }
    }
  }

  const agentSkillsLabel = skillsSection.createDiv({ cls: "af-form-sublabel" });
  agentSkillsLabel.setText("Agent-specific skills");
  deps.addTooltip(agentSkillsLabel, "Custom skills/instructions only for this agent, not shared with others");
  const skillsTextarea = skillsSection.createEl("textarea", {
    cls: "af-create-textarea",
    attr: { placeholder: "Custom skills/instructions for this agent...", rows: "4" },
  });
  skillsTextarea.addEventListener("input", () => { state.skillsBody = skillsTextarea.value; });

  // ─── MCP Servers Section ───
  {
    const mcpSection = form.createDiv({ cls: "af-create-section" });
    const mcpHeader = mcpSection.createDiv({ cls: "af-create-section-header" });
    const mcpIcon = mcpHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(mcpIcon, "plug");
    const mcpHeaderLabel = mcpHeader.createSpan({ text: "MCP Servers" });
    deps.addTooltip(mcpHeaderLabel, "Grant agent access to MCP servers");
    renderAgentMcpPicker(mcpSection, deps, state.selectedMcpServers);
  }

  // ─── Context Section ───
  const contextSection = form.createDiv({ cls: "af-create-section" });
  const contextHeader = contextSection.createDiv({ cls: "af-create-section-header" });
  const contextIcon = contextHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(contextIcon, "file-text");
  const contextHeaderLabel = contextHeader.createSpan({ text: "Context" });
  deps.addTooltip(contextHeaderLabel, "Project-specific context included in every run");
  const contextTextarea = contextSection.createEl("textarea", {
    cls: "af-create-textarea",
    attr: { placeholder: "Background info, repo structure, conventions...", rows: "4" },
  });
  contextTextarea.addEventListener("input", () => { state.contextBody = contextTextarea.value; });

  // ─── Permissions Section ───
  const permsSection = form.createDiv({ cls: "af-create-section" });
  const permsHeader = permsSection.createDiv({ cls: "af-create-section-header" });
  const permsIcon = permsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(permsIcon, "shield-check");
  permsHeader.createSpan({ text: "Permissions" });

  deps.createFormField(permsSection, "Approval required", "git_push, file_delete", "Comma-separated tool names", (v) => { state.approvalRequired = v; });

  const allowRow = permsSection.createDiv({ cls: "af-form-row" });
  allowRow.createDiv({ cls: "af-form-label", text: "Allowed Commands" });
  const allowTextarea = allowRow.createEl("textarea", {
    cls: "af-create-textarea",
    attr: { placeholder: "Bash(curl *)\nBash(python3 *)\nRead\nEdit\nWrite", rows: "4" },
  });
  allowTextarea.addEventListener("input", () => { state.allowedCommands = allowTextarea.value; });

  const denyRow = permsSection.createDiv({ cls: "af-form-row" });
  denyRow.createDiv({ cls: "af-form-label", text: "Blocked Commands" });
  const denyTextarea = denyRow.createEl("textarea", {
    cls: "af-create-textarea",
    attr: { placeholder: "Bash(git push *)\nBash(rm -rf *)\nBash(sudo *)", rows: "4" },
  });
  denyTextarea.addEventListener("input", () => { state.blockedCommands = denyTextarea.value; });

  permsSection.createDiv({
    cls: "af-form-hint",
    text:
      "On Codex agents these become execpolicy command rules — only Bash(cmd args *) " +
      "prefixes are enforced; tool-name rules (Read/Write) and mid-pattern wildcards are " +
      "ignored, and file/network access is governed by Permission Mode (the sandbox).",
  });

  const memoryRow = permsSection.createDiv({ cls: "af-form-row" });
  memoryRow.createDiv({ cls: "af-form-label", text: "Memory enabled" });
  const memoryToggle = memoryRow.createDiv({ cls: "af-agent-card-toggle on" });
  memoryToggle.onclick = () => {
    const isOn = memoryToggle.hasClass("on");
    memoryToggle.toggleClass("on", !isOn);
    state.memory = !isOn;
  };

  // ─── Footer ───
  const footer = page.createDiv({ cls: "af-create-footer" });
  const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
  cancelBtn.onclick = () => deps.navigate("agents");

  const createBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
  createIcon(createBtn, "plus", "af-btn-icon");
  createBtn.appendText(" Create Agent");
  createBtn.onclick = async () => {
    const name = state.name.trim();
    if (!name) {
      new Notice("Agent name is required.");
      return;
    }
    const slug = slugify(name);
    if (plugin.repository.getAgentByName(slug)) {
      new Notice(`Agent "${slug}" already exists.`);
      return;
    }
    const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
    const restoreSubmit = deps.markSubmitBusy(createBtn, "Creating...", "plus", "Create Agent");
    try {
      const parseLines = (s: string) => splitLines(s).map((l) => l.trim()).filter(Boolean);
      await plugin.repository.createAgentFolder({
        name: slug,
        description: state.description.trim(),
        avatar: state.avatar.trim(),
        tags: parseTags(state.tags),
        systemPrompt: state.systemPrompt.trim(),
        model: state.model.trim() || "default",
        adapter: state.adapter,
        cwd: state.cwd.trim(),
        timeout: state.timeout,
        permissionMode: state.permissionMode,
        effort: state.effort || undefined,
        approvalRequired: parseTags(state.approvalRequired),
        memory: state.memory,
        memoryMaxEntries: 100,
        skills: Array.from(state.selectedSkills),
        mcpServers: Array.from(state.selectedMcpServers),
        skillsBody: state.skillsBody.trim(),
        contextBody: state.contextBody.trim(),
        enabled: state.enabled,
        permissionRules: {
          allow: parseLines(state.allowedCommands),
          deny: parseLines(state.blockedCommands),
        },
        autoCompactThreshold: state.autoCompactThreshold,
        wikiReferences: state.wikiReferences,
      });

      // Save heartbeat if configured
      if (state.heartbeatEnabled && state.heartbeatBody.trim()) {
        await plugin.repository.updateHeartbeat(slug, {
          enabled: state.heartbeatEnabled,
          schedule: state.heartbeatSchedule.trim(),
          notify: state.heartbeatNotify,
          channel: state.heartbeatChannel,
          channelTarget: state.heartbeatChannel ? state.heartbeatChannelTarget : "",
          body: state.heartbeatBody.trim(),
        });
      }

      new Notice(`Agent "${slug}" created.`);
      await plugin.refreshFromVault();
      deps.navigate("agent-detail", slug);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to create agent: ${msg}`);
      restoreSubmit();
    }
  };
}

// ═══════════════════════════════════════════════════════
//  Edit Agent Page
// ═══════════════════════════════════════════════════════

export function renderEditAgentForm(page: HTMLElement, deps: AgentFormDeps, agent: AgentConfig): void {
  const { plugin } = deps;

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  const avatarEl = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
  setIcon(avatarEl, "edit");
  const headerInfo = headerLeft.createDiv();
  headerInfo.createDiv({ cls: "af-detail-header-name", text: `Edit Agent: ${agent.name}` });
  headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Modify agent configuration" });

  header.createDiv({ cls: "af-detail-header-actions" });
  // Form state pre-filled
  const state = {
    name: agent.name,
    description: agent.description ?? "",
    avatar: agent.avatar,
    tags: agent.tags.join(", "),
    systemPrompt: agent.body,
    model: agent.model,
    adapter: agent.adapter,
    cwd: agent.cwd ?? "",
    timeout: agent.timeout,
    permissionMode: agent.permissionMode,
    effort: agent.effort ?? "",
    selectedSkills: new Set<string>(agent.skills),
    selectedMcpServers: new Set<string>(agent.mcpServers ?? []),
    skillsBody: agent.skillsBody,
    contextBody: agent.contextBody,
    approvalRequired: agent.approvalRequired.join(", "),
    memory: agent.memory,
    memoryTokenBudget: agent.memoryTokenBudget,
    reflectionEnabled: agent.reflection.enabled,
    reflectionProposeSkills: agent.reflection.proposeSkills,
    enabled: agent.enabled,
    allowedCommands: agent.permissionRules.allow.join("\n"),
    blockedCommands: agent.permissionRules.deny.join("\n"),
    heartbeatEnabled: agent.heartbeatEnabled,
    heartbeatSchedule: agent.heartbeatSchedule,
    heartbeatBody: agent.heartbeatBody,
    heartbeatNotify: agent.heartbeatNotify,
    heartbeatChannel: agent.heartbeatChannel,
    heartbeatChannelTarget: agent.heartbeatChannelTarget,
    autoCompactThreshold: agent.autoCompactThreshold ?? 85,
    wikiReferences: (agent.wikiReferences ?? []).map((r) => r.agent),
  };

  const form = page.createDiv({ cls: "af-create-form" });

  // ─── Identity Section ───
  const identitySection = form.createDiv({ cls: "af-create-section" });
  const identityHeader = identitySection.createDiv({ cls: "af-create-section-header" });
  const identityIcon = identityHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(identityIcon, "user");
  identityHeader.createSpan({ text: "Identity" });

  // Name (read-only for edit)
  const nameRow = identitySection.createDiv({ cls: "af-form-row" });
  nameRow.createDiv({ cls: "af-form-label", text: "Name" });
  const nameInput = nameRow.createEl("input", {
    cls: "af-form-input",
    attr: { type: "text", value: agent.name, disabled: "true" },
  });
  nameInput.setCssStyles({ opacity: "0.6" });

  deps.createFormField(identitySection, "Description", "Monitors deployments and reports status", "", (v) => { state.description = v; }, agent.description ?? "");

  const avatarRow = identitySection.createDiv({ cls: "af-form-row" });
  avatarRow.createDiv({ cls: "af-form-label", text: "Avatar" });
  const avatarPickerBtn = avatarRow.createEl("button", { cls: "af-avatar-picker-btn" });
  const avatarPreview = avatarPickerBtn.createDiv({ cls: "af-avatar-picker-preview" });
  deps.renderAgentAvatar(avatarPreview, { ...agent, avatar: state.avatar ?? agent.avatar });
  avatarPickerBtn.createSpan({ cls: "af-avatar-picker-label", text: state.avatar || agent.avatar || "Pick icon…" });
  avatarPickerBtn.addEventListener("click", () => {
    new IconPickerModal(plugin.app, state.avatar ?? agent.avatar, (iconName) => {
      state.avatar = iconName;
      avatarPreview.empty();
      setIcon(avatarPreview, iconName);
      avatarPickerBtn.querySelector(".af-avatar-picker-label")?.setText(iconName);
    }).open();
  });

  deps.createFormField(identitySection, "Tags", "devops, monitoring", "Comma-separated", (v) => { state.tags = v; }, agent.tags.join(", "));

  // ─── Enabled Toggle ───
  const enabledRow = identitySection.createDiv({ cls: "af-form-row" });
  enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
  const enabledToggle = enabledRow.createDiv({ cls: `af-agent-card-toggle${agent.enabled ? " on" : ""}` });
  enabledToggle.onclick = () => {
    const isOn = enabledToggle.hasClass("on");
    enabledToggle.toggleClass("on", !isOn);
    state.enabled = !isOn;
  };

  // ─── System Prompt Section ───
  const promptSection = form.createDiv({ cls: "af-create-section" });
  const promptHeader = promptSection.createDiv({ cls: "af-create-section-header" });
  const promptIcon = promptHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(promptIcon, "message-square");
  promptHeader.createSpan({ text: "System Prompt" });

  const promptTextarea = promptSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "System prompt...", rows: "10" },
  });
  promptTextarea.value = agent.body;
  promptTextarea.addEventListener("input", () => { state.systemPrompt = promptTextarea.value; });

  // ─── Runtime Config Section ───
  const configSection = form.createDiv({ cls: "af-create-section" });
  const configHeader = configSection.createDiv({ cls: "af-create-section-header" });
  const configIcon = configHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(configIcon, "settings");
  configHeader.createSpan({ text: "Runtime Config" });

  const configGrid = configSection.createDiv({ cls: "af-create-config-grid" });

  // Adapter (before model)
  const adapterRow = configGrid.createDiv({ cls: "af-form-row" });
  adapterRow.createDiv({ cls: "af-form-label", text: "Adapter" });
  const adapterSelect = adapterRow.createEl("select", { cls: "af-form-select" });
  for (const [val, lbl, disabled] of ADAPTER_FORM_OPTIONS) {
    const opt = adapterSelect.createEl("option", { text: lbl, attr: { value: val, ...(disabled ? { disabled: "true" } : {}) } });
    if (val === agent.adapter || (isCodexAdapterValue(agent.adapter) && val === "codex")) opt.selected = true;
  }

  // Model
  const modelRow = configGrid.createDiv({ cls: "af-form-row" });
  const modelLabel = modelRow.createDiv({ cls: "af-form-label", text: "Model" });
  deps.addTooltip(
    modelLabel,
    `Aliases (opus/sonnet/haiku/opusplan) work on any backend. Choose Custom… for a pinned ID or Bedrock/Vertex/Foundry. Blank = use Settings default (${plugin.settings.defaultModel || "CLI default"}).`,
  );
  const modelFieldWrap = modelRow.createDiv({ cls: "af-form-field-wrap" });
  const renderEditModelField = () => {
    renderModelPicker(modelFieldWrap, {
      value: state.model,
      adapter: state.adapter,
      onChange: (value) => { state.model = value; },
    });
  };
  renderEditModelField();

  let repopulateEditPermModeSelect: () => void = () => { /* assigned below */ };
  let showEditAdapterMappingHint: () => void = () => { /* assigned below */ };

  adapterSelect.addEventListener("change", () => {
    state.adapter = adapterSelect.value;
    const otherAliases = isCodexAdapterValue(state.adapter) ? MODEL_ALIASES : CODEX_MODEL_ALIASES;
    if (otherAliases.some((a) => a.value === state.model.trim())) {
      state.model = "";
    }
    renderEditModelField();
    state.permissionMode = permModeForAdapter(state.permissionMode, state.adapter);
    repopulateEditPermModeSelect();
    showEditAdapterMappingHint();
  });

  // Working Dir
  const cwdRow = configGrid.createDiv({ cls: "af-form-row" });
  cwdRow.createDiv({ cls: "af-form-label", text: "Working Dir" });
  const cwdInput = cwdRow.createEl("input", {
    cls: "af-form-input",
    attr: { type: "text", placeholder: "Leave empty for vault root", value: agent.cwd ?? "" },
  });
  cwdInput.addEventListener("input", () => { state.cwd = cwdInput.value; });

  // Timeout
  const timeoutRow = configGrid.createDiv({ cls: "af-form-row" });
  timeoutRow.createDiv({ cls: "af-form-label", text: "Timeout (sec)" });
  const timeoutInput = timeoutRow.createEl("input", {
    cls: "af-form-input af-form-input-sm",
    attr: { type: "number", value: String(agent.timeout) },
  });
  timeoutInput.addEventListener("input", () => {
    const n = parseInt(timeoutInput.value, 10);
    if (!isNaN(n) && n > 0) state.timeout = n;
  });

  // Permission Mode (options depend on the selected adapter)
  const permRow = configGrid.createDiv({ cls: "af-form-row" });
  permRow.createDiv({ cls: "af-form-label", text: "Permission Mode" });
  const permSelect = permRow.createEl("select", { cls: "af-form-select" });
  const editPermDescEl = configGrid.createDiv({ cls: "af-form-hint", text: "" });
  repopulateEditPermModeSelect = () => {
    // Snap any value left over from the other adapter family to its
    // nearest equivalent so the dropdown always reflects what gets saved.
    state.permissionMode = permModeForAdapter(state.permissionMode, state.adapter);
    const options = permModeOptionsFor(state.adapter);
    permSelect.empty();
    for (const [val, lbl] of options) {
      const opt = permSelect.createEl("option", { text: lbl, attr: { value: val } });
      if (val === state.permissionMode) opt.selected = true;
    }
    editPermDescEl.textContent = options.find(([v]) => v === permSelect.value)?.[2] ?? "";
  };
  repopulateEditPermModeSelect();
  // Adapter-switch mapping hint — hidden until the user actually changes the
  // adapter, then explains how the previous mode family was translated.
  const editPermMapHintEl = configGrid.createDiv({ cls: "af-form-hint af-adapter-map-hint" });
  editPermMapHintEl.setCssStyles({ display: "none" });
  showEditAdapterMappingHint = () => {
    editPermMapHintEl.setText(adapterMappingHintText(state.adapter));
    editPermMapHintEl.setCssStyles({ display: "" });
  };
  permSelect.addEventListener("change", () => {
    state.permissionMode = permSelect.value;
    editPermDescEl.textContent = permModeOptionsFor(state.adapter).find(([v]) => v === permSelect.value)?.[2] ?? "";
  });

  // Effort Level
  const editEffortRow = configGrid.createDiv({ cls: "af-form-row" });
  editEffortRow.createDiv({ cls: "af-form-label", text: "Effort Level" });
  const editEffortSelect = editEffortRow.createEl("select", { cls: "af-form-select" });
  for (const [val, lbl] of [["", "Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["max", "Max"]] as const) {
    const opt = editEffortSelect.createEl("option", { text: lbl, attr: { value: val } });
    if (val === (agent.effort ?? "")) opt.selected = true;
  }
  editEffortSelect.addEventListener("change", () => { state.effort = editEffortSelect.value; });
  configGrid.createDiv({ cls: "af-form-hint", text: "Controls reasoning depth — low is fast, max is most thorough" });

  // Auto-compact threshold
  const editCompactRow = configGrid.createDiv({ cls: "af-form-row" });
  const editCompactLabel = editCompactRow.createDiv({ cls: "af-form-label", text: "Auto-compact at" });
  deps.addTooltip(
    editCompactLabel,
    "Percent of context window at which the chat auto-invokes /compact before the next message. 85% is a good default. Set 0 to disable.",
  );
  const editCompactInput = editCompactRow.createEl("input", {
    cls: "af-form-input af-form-input-sm",
    attr: { type: "number", min: "0", max: "100", value: String(state.autoCompactThreshold) },
  });
  editCompactInput.addEventListener("input", () => {
    const n = parseInt(editCompactInput.value, 10);
    if (!isNaN(n) && n >= 0 && n <= 100) state.autoCompactThreshold = n;
  });
  configGrid.createDiv({ cls: "af-form-hint", text: "0 disables auto-compact" });

  // Wiki references
  {
    const wikiKeepers = plugin.runtime.getSnapshot().agents.filter((a) => a.wikiKeeper !== undefined);
    if (wikiKeepers.length > 0) {
      const wrRow = configGrid.createDiv({ cls: "af-form-row af-form-row-toggle" });
      const wrLabel = wrRow.createDiv({ cls: "af-form-label", text: "Wiki access" });
      deps.addTooltip(
        wrLabel,
        "Lets this agent read + cite from the selected Wiki Keeper scopes (requires the wiki-query skill).",
      );
      const wrWrap = wrRow.createDiv({ cls: "af-form-field-wrap" });
      for (const wk of wikiKeepers) {
        const label = wrWrap.createEl("label", { cls: "af-form-checkbox-row" });
        const cb = label.createEl("input", { attr: { type: "checkbox" } });
        if (state.wikiReferences.includes(wk.name)) cb.checked = true;
        label.createSpan({ text: ` ${wk.name}`, cls: "af-form-checkbox-label" });
        cb.addEventListener("change", () => {
          if (cb.checked) {
            if (!state.wikiReferences.includes(wk.name)) state.wikiReferences.push(wk.name);
          } else {
            state.wikiReferences = state.wikiReferences.filter((n) => n !== wk.name);
          }
        });
      }
    }
  }

  // ─── Heartbeat Section ───
  if (agent.isFolder) {
    const heartbeatSection = form.createDiv({ cls: "af-create-section" });
    const heartbeatHeader = heartbeatSection.createDiv({ cls: "af-create-section-header" });
    const heartbeatIcon = heartbeatHeader.createSpan({ cls: "af-create-section-icon" });
    setIcon(heartbeatIcon, "heart-pulse");
    const heartbeatHeaderLabel = heartbeatHeader.createSpan({ text: "Heartbeat" });
    deps.addTooltip(heartbeatHeaderLabel, "Autonomous periodic run — what the agent does when no one is asking");

    const hbEnabledRow = heartbeatSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
    hbEnabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
    const hbEnabledToggle = hbEnabledRow.createDiv({ cls: `af-agent-card-toggle${state.heartbeatEnabled ? " on" : ""}` });
    const hbBody = heartbeatSection.createDiv();
    hbBody.setCssStyles({ display: state.heartbeatEnabled ? "" : "none" });
    hbEnabledToggle.onclick = () => {
      const isOn = hbEnabledToggle.hasClass("on");
      hbEnabledToggle.toggleClass("on", !isOn);
      state.heartbeatEnabled = !isOn;
      hbBody.setCssStyles({ display: !isOn ? "" : "none" });
    };

    renderHeartbeatSchedule(hbBody, state);

    const hbNotifyRow = hbBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
    const hbNotifyLabel = hbNotifyRow.createDiv({ cls: "af-form-label" });
    hbNotifyLabel.setText("Notify");
    deps.addTooltip(hbNotifyLabel, "Show an Obsidian notice when the heartbeat completes");
    const hbNotifyToggle = hbNotifyRow.createDiv({ cls: `af-agent-card-toggle${state.heartbeatNotify ? " on" : ""}` });
    hbNotifyToggle.onclick = () => {
      const isOn = hbNotifyToggle.hasClass("on");
      hbNotifyToggle.toggleClass("on", !isOn);
      state.heartbeatNotify = !isOn;
    };

    const editSnapshot = plugin.runtime.getSnapshot();
    const hbChannelRow = hbBody.createDiv({ cls: "af-form-row" });
    const hbChannelLabel = hbChannelRow.createDiv({ cls: "af-form-label" });
    hbChannelLabel.setText("Post to channel");
    deps.addTooltip(hbChannelLabel, "Heartbeat results are posted to this Slack channel when the run completes");
    const hbChannelSelect = hbChannelRow.createEl("select", { cls: "af-form-select" });
    hbChannelSelect.createEl("option", { text: "(none)", attr: { value: "" } });
    for (const ch of editSnapshot.channels) {
      const opt = hbChannelSelect.createEl("option", { text: ch.name, attr: { value: ch.name } });
      if (ch.name === state.heartbeatChannel) opt.selected = true;
    }
    hbChannelSelect.addEventListener("change", () => { state.heartbeatChannel = hbChannelSelect.value; syncHbTarget(); });

    const hbTargetRow = hbBody.createDiv({ cls: "af-form-row" });
    const hbTargetLabel = hbTargetRow.createDiv({ cls: "af-form-label" });
    hbTargetLabel.setText("Target ID");
    deps.addTooltip(hbTargetLabel, "Specific channel id to post to (Discord/Slack channel id, Telegram chat id). Empty = DM the channel’s first allowed user.");
    const hbTargetInput = hbTargetRow.createEl("input", { cls: "af-form-input", attr: { type: "text", placeholder: "Channel/chat id — empty = DM" } });
    hbTargetInput.value = state.heartbeatChannelTarget;
    hbTargetInput.addEventListener("input", () => { state.heartbeatChannelTarget = hbTargetInput.value.trim(); });
    const syncHbTarget = () => { hbTargetRow.setCssStyles({ display: state.heartbeatChannel ? "" : "none" }); };
    syncHbTarget();

    const hbInstructionLabel = hbBody.createDiv({ cls: "af-form-label" });
    hbInstructionLabel.setCssStyles({ width: "auto" });
    hbInstructionLabel.setCssStyles({ marginTop: "12px" });
    hbInstructionLabel.setText("Instruction");
    deps.addTooltip(hbInstructionLabel, "What the agent does on each heartbeat. Also used by the \"Run Now\" button.");
    const hbTextarea = hbBody.createEl("textarea", {
      cls: "af-create-prompt-textarea",
      attr: { placeholder: "Check status, scan for issues, report findings...", rows: "8" },
    });
    hbTextarea.value = state.heartbeatBody;
    hbTextarea.addEventListener("input", () => { state.heartbeatBody = hbTextarea.value; });
  }

  // ─── Skills Section ───
  const skillsSection = form.createDiv({ cls: "af-create-section" });
  const skillsHeader = skillsSection.createDiv({ cls: "af-create-section-header" });
  const skillsIcon = skillsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(skillsIcon, "puzzle");
  skillsHeader.createSpan({ text: "Skills" });

  const snapshot = plugin.runtime.getSnapshot();
  if (snapshot.skills.length > 0) {
    skillsSection.createDiv({ cls: "af-form-sublabel", text: "Shared Skills" });
    const skillsGrid = skillsSection.createDiv({ cls: "af-create-skills-grid" });
    for (const skill of snapshot.skills) {
      const item = skillsGrid.createDiv({ cls: "af-create-skill-item" });
      const cb = item.createEl("input", { cls: "af-form-toggle", attr: { type: "checkbox" } });
      cb.checked = state.selectedSkills.has(skill.name);
      cb.addEventListener("change", () => {
        if (cb.checked) state.selectedSkills.add(skill.name);
        else state.selectedSkills.delete(skill.name);
      });
      const lbl = item.createDiv({ cls: "af-create-skill-label" });
      lbl.createSpan({ cls: "af-create-skill-name", text: skill.name });
      if (skill.description) {
        lbl.createSpan({ cls: "af-create-skill-desc", text: ` — ${skill.description}` });
      }
    }
  }

  const agentSkillsLabel = skillsSection.createDiv({ cls: "af-form-sublabel" });
  agentSkillsLabel.setText("Agent-specific skills");
  deps.addTooltip(agentSkillsLabel, "Custom skills/instructions only for this agent, not shared with others");
  const skillsTextarea = skillsSection.createEl("textarea", {
    cls: "af-create-textarea",
    attr: { placeholder: "Custom skills/instructions for this agent...", rows: "4" },
  });
  skillsTextarea.value = agent.skillsBody;
  skillsTextarea.addEventListener("input", () => { state.skillsBody = skillsTextarea.value; });

  // ─── MCP Servers Section ───
  const mcpSection = form.createDiv({ cls: "af-create-section" });
  const mcpHeader = mcpSection.createDiv({ cls: "af-create-section-header" });
  const mcpIcon = mcpHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(mcpIcon, "plug");
  const editMcpHeaderLabel = mcpHeader.createSpan({ text: "MCP Servers" });
  deps.addTooltip(editMcpHeaderLabel, "Grant agent access to MCP servers");
  renderAgentMcpPicker(mcpSection, deps, state.selectedMcpServers);

  // ─── Context Section ───
  const contextSection = form.createDiv({ cls: "af-create-section" });
  const contextHeader = contextSection.createDiv({ cls: "af-create-section-header" });
  const contextIcon = contextHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(contextIcon, "file-text");
  const contextHeaderLabel = contextHeader.createSpan({ text: "Context" });
  deps.addTooltip(contextHeaderLabel, "Project-specific context included in every run");
  const contextTextarea = contextSection.createEl("textarea", {
    cls: "af-create-textarea",
    attr: { placeholder: "Background info, repo structure, conventions...", rows: "4" },
  });
  contextTextarea.value = agent.contextBody;
  contextTextarea.addEventListener("input", () => { state.contextBody = contextTextarea.value; });

  // ─── Permissions Section ───
  const permsSection = form.createDiv({ cls: "af-create-section" });
  const permsHeader = permsSection.createDiv({ cls: "af-create-section-header" });
  const permsIcon = permsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(permsIcon, "shield-check");
  permsHeader.createSpan({ text: "Permissions" });

  deps.createFormField(permsSection, "Approval required", "git_push, file_delete", "Comma-separated tool names", (v) => { state.approvalRequired = v; }, agent.approvalRequired.join(", "));

  const editAllowRow = permsSection.createDiv({ cls: "af-form-row" });
  editAllowRow.createDiv({ cls: "af-form-label", text: "Allowed Commands" });
  const editAllowTextarea = editAllowRow.createEl("textarea", {
    cls: "af-create-textarea",
    attr: { placeholder: "Bash(curl *)\nBash(python3 *)\nRead\nEdit\nWrite", rows: "4" },
  });
  editAllowTextarea.value = agent.permissionRules.allow.join("\n");
  editAllowTextarea.addEventListener("input", () => { state.allowedCommands = editAllowTextarea.value; });

  const editDenyRow = permsSection.createDiv({ cls: "af-form-row" });
  editDenyRow.createDiv({ cls: "af-form-label", text: "Blocked Commands" });
  const editDenyTextarea = editDenyRow.createEl("textarea", {
    cls: "af-create-textarea",
    attr: { placeholder: "Bash(git push *)\nBash(rm -rf *)\nBash(sudo *)", rows: "4" },
  });
  editDenyTextarea.value = agent.permissionRules.deny.join("\n");
  editDenyTextarea.addEventListener("input", () => { state.blockedCommands = editDenyTextarea.value; });

  permsSection.createDiv({
    cls: "af-form-hint",
    text:
      "On Codex agents these become execpolicy command rules — only Bash(cmd args *) " +
      "prefixes are enforced; tool-name rules (Read/Write) and mid-pattern wildcards are " +
      "ignored, and file/network access is governed by Permission Mode (the sandbox).",
  });

  const memoryRow = permsSection.createDiv({ cls: "af-form-row" });
  memoryRow.createDiv({ cls: "af-form-label", text: "Memory enabled" });
  const memoryToggle = memoryRow.createDiv({ cls: `af-agent-card-toggle${agent.memory ? " on" : ""}` });
  memoryToggle.onclick = () => {
    const isOn = memoryToggle.hasClass("on");
    memoryToggle.toggleClass("on", !isOn);
    state.memory = !isOn;
  };

  const budgetRow = permsSection.createDiv({ cls: "af-form-row" });
  budgetRow.createDiv({ cls: "af-form-label", text: "Memory token budget" });
  const budgetInput = budgetRow.createEl("input", {
    cls: "af-create-input",
    attr: { type: "number", min: "200", step: "100" },
  });
  budgetInput.value = String(state.memoryTokenBudget);
  budgetInput.addEventListener("input", () => {
    const v = parseInt(budgetInput.value, 10);
    if (Number.isFinite(v)) state.memoryTokenBudget = v;
  });

  const reflectRow = permsSection.createDiv({ cls: "af-form-row" });
  reflectRow.createDiv({ cls: "af-form-label", text: "Nightly reflection" });
  const reflectToggle = reflectRow.createDiv({
    cls: `af-agent-card-toggle${agent.reflection.enabled ? " on" : ""}`,
  });
  reflectToggle.onclick = () => {
    const isOn = reflectToggle.hasClass("on");
    reflectToggle.toggleClass("on", !isOn);
    state.reflectionEnabled = !isOn;
  };

  const proposeRow = permsSection.createDiv({ cls: "af-form-row" });
  proposeRow.createDiv({ cls: "af-form-label", text: "Propose skills from memory" });
  const proposeToggle = proposeRow.createDiv({
    cls: `af-agent-card-toggle${agent.reflection.proposeSkills ? " on" : ""}`,
  });
  proposeToggle.onclick = () => {
    const isOn = proposeToggle.hasClass("on");
    proposeToggle.toggleClass("on", !isOn);
    state.reflectionProposeSkills = !isOn;
  };

  // ─── Footer ───
  const footer = page.createDiv({ cls: "af-create-footer" });

  const deleteBtn = footer.createEl("button", { cls: "af-btn-sm danger" });
  createIcon(deleteBtn, "trash-2", "af-btn-icon");
  deleteBtn.appendText(" Delete");
  deleteBtn.onclick = () => void plugin.deleteAgent(agent.name);

  footer.createDiv({ cls: "af-toolbar-spacer" });

  const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
  cancelBtn.onclick = () => deps.navigate("agent-detail", agent.name);

  const saveBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
  createIcon(saveBtn, "check", "af-btn-icon");
  saveBtn.appendText(" Save Changes");
  saveBtn.onclick = async () => {
    const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
    const restoreSubmit = deps.markSubmitBusy(saveBtn, "Saving...", "check", "Save Changes");
    try {
      const parseLines = (s: string) => splitLines(s).map((l) => l.trim()).filter(Boolean);
      await plugin.repository.updateAgent(agent.name, {
        description: state.description.trim(),
        avatar: state.avatar.trim(),
        tags: parseTags(state.tags),
        systemPrompt: state.systemPrompt.trim(),
        model: state.model.trim() || "default",
        adapter: state.adapter,
        cwd: state.cwd.trim(),
        timeout: state.timeout,
        permissionMode: state.permissionMode,
        effort: state.effort || undefined,
        approvalRequired: parseTags(state.approvalRequired),
        memory: state.memory,
        memoryTokenBudget: state.memoryTokenBudget,
        reflectionEnabled: state.reflectionEnabled,
        reflectionProposeSkills: state.reflectionProposeSkills,
        skills: Array.from(state.selectedSkills),
        mcpServers: Array.from(state.selectedMcpServers),
        skillsBody: state.skillsBody.trim(),
        contextBody: state.contextBody.trim(),
        enabled: state.enabled,
        permissionRules: {
          allow: parseLines(state.allowedCommands),
          deny: parseLines(state.blockedCommands),
        },
        autoCompactThreshold: state.autoCompactThreshold,
        wikiReferences: state.wikiReferences,
      });
      // Persist heartbeat separately (lives in HEARTBEAT.md, not agent.md/config.md)
      if (agent.isFolder) {
        await plugin.repository.updateHeartbeat(agent.name, {
          enabled: state.heartbeatEnabled,
          schedule: state.heartbeatSchedule.trim(),
          notify: state.heartbeatNotify,
          channel: state.heartbeatChannel,
          channelTarget: state.heartbeatChannel ? state.heartbeatChannelTarget : "",
          body: state.heartbeatBody.trim(),
        });
      }

      new Notice(`Agent "${agent.name}" updated.`);
      await plugin.refreshFromVault();
      deps.navigate("agent-detail", agent.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to update agent: ${msg}`);
      restoreSubmit();
    }
  };
}
