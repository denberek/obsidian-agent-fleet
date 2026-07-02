import { Notice, setIcon } from "obsidian";
import { ConfirmModal } from "../../modals/confirmModal";
import type AgentFleetPlugin from "../../main";
import type { ChannelConfig } from "../../types";
import { slugify, stringifyMarkdownWithFrontmatter } from "../../utils/markdown";
import { createIcon } from "../../utils/icons";

/**
 * Map a channel status to the existing `af-agent-card-avatar` color class so that
 * channel cards borrow the same visual language as agent cards (green=healthy,
 * blue=transitioning, red=broken, gray=off).
 */
export function channelStatusToAvatarClass(status: string): string {
  switch (status) {
    case "connected":
      return "idle"; // green
    case "connecting":
    case "reconnecting":
      return "pending"; // blue
    case "needs-auth":
    case "error":
      return "error"; // red
    case "stopped":
    case "disabled":
    default:
      return "disabled"; // gray
  }
}

/** View helpers the channel form borrows from the dashboard so the extracted
 *  markup stays byte-identical to what the view used to render inline. */
export interface ChannelFormDeps {
  plugin: AgentFleetPlugin;
  /** Navigate the dashboard to another page (post-save / cancel / delete). */
  navigate: (page: "channels" | "edit-channel", context?: string) => void;
  /** Append a small info icon with a hover tooltip to a label element. */
  addTooltip: (labelEl: HTMLElement, text: string) => void;
  /** Standard labelled text-input form row. */
  createFormField: (
    container: HTMLElement,
    label: string,
    placeholder: string,
    desc: string,
    onChange: (v: string) => void,
    initialValue?: string,
  ) => void;
  /** Disable a submit button while an async save is in flight; returns a restore fn. */
  markSubmitBusy: (
    btn: HTMLButtonElement,
    busyLabel: string,
    iconName: string,
    label: string,
  ) => () => void;
}

/**
 * Shared channel form used by both the Create Channel and Edit Channel pages.
 * Pass `channel` to render in edit mode (pre-filled fields, read-only name,
 * delete button, "Save Changes" submit); omit it for create mode.
 */
export function renderChannelForm(
  page: HTMLElement,
  deps: ChannelFormDeps,
  channel?: ChannelConfig,
): void {
  const { plugin } = deps;
  const snapshot = plugin.runtime.getSnapshot();
  const credentials = plugin.channelCredentials.list();

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  if (channel) {
    const status = plugin.channelManager?.getChannelStatus(channel.name) ?? "disabled";
    const avatarEl = headerLeft.createDiv({ cls: `af-agent-card-avatar ${channelStatusToAvatarClass(status)}` });
    setIcon(avatarEl, "radio");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: `Edit Channel: ${channel.name}` });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: `Status: ${status}` });
  } else {
    const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
    setIcon(avatar, "plus");
    const headerInfo = headerLeft.createDiv();
    headerInfo.createDiv({ cls: "af-detail-header-name", text: "Create New Channel" });
    headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Connect an external chat transport to an agent" });
  }
  header.createDiv({ cls: "af-detail-header-actions" });

  // Form state (pre-filled in edit mode)
  const state = {
    name: "",
    type: (channel ? channel.type : "slack") as ChannelConfig["type"],
    defaultAgent: channel ? channel.defaultAgent : (snapshot.agents[0]?.name ?? ""),
    allowedAgents: channel ? [...channel.allowedAgents] : ([] as string[]),
    credentialRef: channel ? channel.credentialRef : (credentials[0]?.ref ?? ""),
    allowedUsers: channel ? channel.allowedUsers.join("\n") : "",
    perUserSessions: channel ? channel.perUserSessions : true,
    channelContext: channel ? channel.channelContext : "",
    enabled: channel ? channel.enabled : true,
    tags: channel ? channel.tags.join(", ") : "",
    body: channel ? channel.body : "",
    transportJson: channel && Object.keys(channel.transport).length > 0
      ? JSON.stringify(channel.transport, null, 2)
      : "",
  };

  const form = page.createDiv({ cls: "af-create-form" });

  // ─── Channel Details ───
  const detailsSection = form.createDiv({ cls: "af-create-section" });
  const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
  const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(detailsIcon, "radio");
  detailsHeader.createSpan({ text: "Channel Details" });

  if (channel) {
    // Name (read-only)
    const nameRow = detailsSection.createDiv({ cls: "af-form-row" });
    nameRow.createDiv({ cls: "af-form-label", text: "Name" });
    const nameInput = nameRow.createEl("input", {
      cls: "af-form-input",
      attr: { type: "text", value: channel.name, disabled: "true" },
    });
    nameInput.setCssStyles({ opacity: "0.6" });
  } else {
    deps.createFormField(detailsSection, "Name", "my-slack", "Unique identifier for this channel", (v) => { state.name = v; });
  }

  // Type dropdown — only Slack is supported in v1; others shown as disabled
  const typeRow = detailsSection.createDiv({ cls: "af-form-row" });
  typeRow.createDiv({ cls: "af-form-label", text: "Type" });
  const typeSelect = typeRow.createEl("select", { cls: "af-form-select" });
  for (const t of ["slack", "telegram", "discord"] as const) {
    const opt = typeSelect.createEl("option", { text: t, attr: { value: t } });
    if (channel && t === channel.type) opt.selected = true;
  }
  typeSelect.addEventListener("change", () => { state.type = typeSelect.value as ChannelConfig["type"]; });

  // Credential dropdown
  const credRow = detailsSection.createDiv({ cls: "af-form-row" });
  const credLabel = credRow.createDiv({ cls: "af-form-label" });
  credLabel.setText("Credential");
  deps.addTooltip(credLabel, "Configured in Settings → Agent Fleet → Channel Credentials");
  const credSelect = credRow.createEl("select", { cls: "af-form-select" });
  if (credentials.length === 0) {
    credSelect.createEl("option", { text: "(no credentials configured)", attr: { value: "" } });
  }
  for (const c of credentials) {
    const opt = credSelect.createEl("option", { text: `${c.ref} (${c.entry.type})`, attr: { value: c.ref } });
    if (channel && c.ref === channel.credentialRef) opt.selected = true;
  }
  credSelect.addEventListener("change", () => { state.credentialRef = credSelect.value; });

  // Enabled toggle
  const enabledRow = detailsSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
  enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
  const enabledToggle = enabledRow.createDiv({ cls: `af-agent-card-toggle${state.enabled ? " on" : ""}` });
  enabledToggle.onclick = () => {
    const isOn = enabledToggle.hasClass("on");
    enabledToggle.toggleClass("on", !isOn);
    state.enabled = !isOn;
  };

  // ─── Agent Routing ───
  const agentSection = form.createDiv({ cls: "af-create-section" });
  const agentHeader = agentSection.createDiv({ cls: "af-create-section-header" });
  const agentIcon = agentHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(agentIcon, "bot");
  agentHeader.createSpan({ text: "Agent Routing" });

  // Default agent dropdown
  const defaultRow = agentSection.createDiv({ cls: "af-form-row" });
  const defaultLabel = defaultRow.createDiv({ cls: "af-form-label" });
  defaultLabel.setText("Default agent");
  deps.addTooltip(defaultLabel, "Used when no @agent-name prefix is given in a message");
  const defaultSelect = defaultRow.createEl("select", { cls: "af-form-select" });
  for (const a of snapshot.agents) {
    const opt = defaultSelect.createEl("option", { text: a.name, attr: { value: a.name } });
    if (channel && a.name === channel.defaultAgent) opt.selected = true;
  }
  defaultSelect.addEventListener("change", () => { state.defaultAgent = defaultSelect.value; });

  // Allowed agents checkboxes
  const allowedRow = agentSection.createDiv({ cls: "af-form-row" });
  const allowedLabel = allowedRow.createDiv({ cls: "af-form-label" });
  allowedLabel.setText("Allowed agents");
  deps.addTooltip(allowedLabel, "Agents reachable via @prefix. Leave unchecked to allow all agents.");
  const checkboxContainer = allowedRow.createDiv({ cls: "af-form-checkboxes" });
  for (const a of snapshot.agents) {
    const label = checkboxContainer.createEl("label", { cls: "af-form-checkbox-label" });
    const cb = label.createEl("input", { attr: { type: "checkbox", value: a.name } });
    if (channel && channel.allowedAgents.includes(a.name)) cb.checked = true;
    label.appendText(` ${a.name}`);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!state.allowedAgents.includes(a.name)) state.allowedAgents.push(a.name);
      } else {
        state.allowedAgents = state.allowedAgents.filter((n) => n !== a.name);
      }
    });
  }

  // Per-user sessions toggle
  const perUserRow = agentSection.createDiv({ cls: "af-form-row af-form-row-toggle" });
  const perUserLabel = perUserRow.createDiv({ cls: "af-form-label" });
  perUserLabel.setText("Per-user sessions");
  deps.addTooltip(perUserLabel, "Each external user gets their own isolated Claude session");
  const perUserToggle = perUserRow.createDiv({ cls: `af-agent-card-toggle${state.perUserSessions ? " on" : ""}` });
  perUserToggle.onclick = () => {
    const isOn = perUserToggle.hasClass("on");
    perUserToggle.toggleClass("on", !isOn);
    state.perUserSessions = !isOn;
  };

  // ─── Access Control ───
  const accessSection = form.createDiv({ cls: "af-create-section" });
  const accessHeader = accessSection.createDiv({ cls: "af-create-section-header" });
  const accessIcon = accessHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(accessIcon, "shield-check");
  accessHeader.createSpan({ text: "Access Control" });

  const usersLabel = accessSection.createDiv({ cls: "af-form-label" });
  usersLabel.setText("Allowed users");
  deps.addTooltip(
    usersLabel,
    channel
      ? "Slack user IDs (U...), one per line. Only listed users can reach the bot."
      : "User IDs, one per line — Slack (U...), Telegram (numeric), or Discord (numeric snowflakes). Only listed users can reach the bot.",
  );
  const usersTextarea = accessSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "U0AQW6P37N1\nU0BXYZ12345", rows: "4" },
  });
  if (channel) usersTextarea.value = channel.allowedUsers.join("\n");
  usersTextarea.addEventListener("input", () => { state.allowedUsers = usersTextarea.value; });

  // ─── Channel Context ───
  const contextSection = form.createDiv({ cls: "af-create-section" });
  const contextHeader = contextSection.createDiv({ cls: "af-create-section-header" });
  const contextIcon = contextHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(contextIcon, "message-square");
  const contextHeaderLabel = contextHeader.createSpan({ text: "Channel Context" });
  deps.addTooltip(contextHeaderLabel, "Extra instructions appended to the agent's system prompt when reached through this channel");
  const contextTextarea = contextSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "You are being contacted via Slack. Keep replies concise...", rows: "6" },
  });
  if (channel) contextTextarea.value = channel.channelContext;
  contextTextarea.addEventListener("input", () => { state.channelContext = contextTextarea.value; });

  deps.createFormField(
    detailsSection, "Tags", "ops, internal", "Comma-separated metadata",
    (v) => { state.tags = v; },
    channel ? channel.tags.join(", ") : undefined,
  );

  // ─── Advanced ───
  const advSection = form.createDiv({ cls: "af-create-section" });
  const advHeader = advSection.createDiv({ cls: "af-create-section-header" });
  const advIcon = advHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(advIcon, "settings");
  const advHeaderLabel = advHeader.createSpan({ text: "Advanced" });
  deps.addTooltip(advHeaderLabel, "Markdown body (shown in the channel detail page) and transport-specific overrides");

  const bodyLabel = advSection.createDiv({ cls: "af-form-label" });
  bodyLabel.setText("Body (markdown)");
  if (!channel) {
    deps.addTooltip(bodyLabel, "Free-form notes for this channel. Shown in the channel detail page; not sent to the agent.");
  }
  const bodyTextarea = advSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "Notes, runbook snippets, escalation contacts…", rows: "4" },
  });
  if (channel) bodyTextarea.value = channel.body;
  bodyTextarea.addEventListener("input", () => { state.body = bodyTextarea.value; });

  const transportLabel = advSection.createDiv({ cls: "af-form-label" });
  transportLabel.setText("Transport config (JSON)");
  deps.addTooltip(
    transportLabel,
    channel
      ? "Optional JSON object for transport-specific overrides (e.g. Slack socket_mode). Leave blank for defaults."
      : "Optional JSON object for transport-specific overrides (e.g. Slack socket_mode, telegram webhook settings). Leave blank for defaults.",
  );
  const transportTextarea = advSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: '{\n  "socket_mode": true\n}', rows: "4" },
  });
  if (channel) transportTextarea.value = state.transportJson;
  transportTextarea.addEventListener("input", () => { state.transportJson = transportTextarea.value; });

  // ─── Footer ───
  const footer = page.createDiv({ cls: "af-create-footer" });

  if (channel) {
    const deleteBtn = footer.createEl("button", { cls: "af-btn-sm danger" });
    createIcon(deleteBtn, "trash-2", "af-btn-icon");
    deleteBtn.appendText(" Delete");
    deleteBtn.onclick = () => {
      new ConfirmModal(plugin.app, {
        title: `Delete channel "${channel.name}"?`,
        body: "The channel file will be moved to your system trash and can be recovered.",
        confirmText: "Delete",
        danger: true,
        onConfirm: async () => {
          await plugin.repository.deleteChannel(channel.name);
          new Notice(`Channel "${channel.name}" deleted.`);
          await new Promise((r) => window.setTimeout(r, 200));
          await plugin.refreshFromVault();
          deps.navigate("channels");
        },
      }).open();
    };

    footer.createDiv({ cls: "af-toolbar-spacer" });
  }

  const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
  cancelBtn.onclick = () => deps.navigate("channels");

  const submitBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
  createIcon(submitBtn, channel ? "check" : "plus", "af-btn-icon");
  submitBtn.appendText(channel ? " Save Changes" : " Create Channel");

  const parseUsers = (s: string) => s.split(/[\n,]+/).map((t) => t.trim()).filter(Boolean);
  const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

  /** Parse the transport JSON textarea; returns `null` (after a Notice) when invalid. */
  const parseTransport = (): Record<string, unknown> | undefined | null => {
    if (!state.transportJson.trim()) return undefined;
    try {
      const parsed: unknown = JSON.parse(state.transportJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      new Notice("Transport config must be a JSON object.");
      return null;
    } catch (err) {
      new Notice(`Transport JSON is invalid: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  };

  if (channel) {
    // Edit mode: update the existing channel file in place.
    submitBtn.onclick = async () => {
      let transport = parseTransport();
      if (transport === null) return;
      if (transport === undefined) transport = {};

      const restoreSubmit = deps.markSubmitBusy(submitBtn, "Saving...", "check", "Save Changes");
      try {
        await plugin.repository.updateChannel(channel.name, {
          type: state.type,
          default_agent: state.defaultAgent,
          allowed_agents: state.allowedAgents.length > 0 ? state.allowedAgents : [],
          enabled: state.enabled,
          credential_ref: state.credentialRef,
          allowed_users: parseUsers(state.allowedUsers),
          per_user_sessions: state.perUserSessions,
          channel_context: state.channelContext.trim(),
          tags: parseTags(state.tags),
          body: state.body.trim(),
          transport,
        });
        new Notice(`Channel "${channel.name}" updated.`);
        await plugin.refreshFromVault();
        deps.navigate("channels");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to update channel: ${msg}`);
        restoreSubmit();
      }
    };
  } else {
    // Create mode: write a new channel file.
    submitBtn.onclick = async () => {
      const name = state.name.trim();
      if (!name) { new Notice("Channel name is required."); return; }
      if (!state.credentialRef) { new Notice("Select a credential."); return; }

      const transport = parseTransport();
      if (transport === null) return;

      const frontmatter: Record<string, unknown> = {
        name: slugify(name),
        type: state.type,
        default_agent: state.defaultAgent,
        allowed_agents: state.allowedAgents.length > 0 ? state.allowedAgents : undefined,
        enabled: state.enabled,
        credential_ref: state.credentialRef,
        allowed_users: parseUsers(state.allowedUsers),
        per_user_sessions: state.perUserSessions,
        channel_context: state.channelContext.trim() || undefined,
        tags: parseTags(state.tags).length > 0 ? parseTags(state.tags) : undefined,
        transport,
      };

      const restoreSubmit = deps.markSubmitBusy(submitBtn, "Creating...", "plus", "Create Channel");
      try {
        const channelSlug = slugify(name);
        const path = await plugin.repository.getAvailablePath(
          plugin.repository.getSubfolder("channels"),
          channelSlug,
        );
        await plugin.app.vault.create(
          path,
          stringifyMarkdownWithFrontmatter(frontmatter, state.body.trim()),
        );
        new Notice(`Channel "${channelSlug}" created.`);
        await plugin.refreshFromVault();
        deps.navigate("edit-channel", channelSlug);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to create channel: ${msg}`);
        restoreSubmit();
      }
    };
  }
}
