import { Notice, setIcon } from "obsidian";
import { ConfirmModal } from "../../modals/confirmModal";
import type { ChannelConfig, TaskConfig } from "../../types";
import { slugify, stringifyMarkdownWithFrontmatter } from "../../utils/markdown";
import { createIcon } from "../../utils/icons";
import { renderModelPicker } from "../../components/modelPicker";
import type { DashboardFormDeps } from "./shared";
import { parseCronComponents } from "./shared";

/** View helpers the task forms borrow from the dashboard. */
export interface TaskFormDeps extends DashboardFormDeps {
  /** Navigate the dashboard to another page (post-save / cancel / delete). */
  navigate: (page: "kanban" | "task-detail", context?: string) => void;
}

/** Inline cron schedule picker shared by the create and edit task forms.
 *  Writes the built cron expression into `state.schedule`. */
function renderInlineSchedule(
  container: HTMLElement,
  state: { schedule: string; type: string },
): void {
  // Parse current cron into components
  const parsed = parseCronComponents(state.schedule);

  // Frequency dropdown
  const freqRow = container.createDiv({ cls: "af-form-row" });
  freqRow.createDiv({ cls: "af-form-label", text: "Frequency" });
  const freqSelect = freqRow.createEl("select", { cls: "af-form-select" });
  const freqOptions: Array<[string, string]> = [
    ["every_5m", "Every 5 minutes"],
    ["every_15m", "Every 15 minutes"],
    ["every_30m", "Every 30 minutes"],
    ["every_hour", "Every hour"],
    ["every_2h", "Every 2 hours"],
    ["daily", "Daily"],
    ["weekdays", "Weekdays"],
    ["weekly", "Weekly"],
    ["monthly", "Monthly"],
  ];
  for (const [val, lbl] of freqOptions) {
    const opt = freqSelect.createEl("option", { text: lbl, attr: { value: val } });
    if (val === parsed.freq) opt.selected = true;
  }

  // Time row (shown for daily/weekdays/weekly/monthly)
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

  // Day row (shown for weekly)
  const dayRow = container.createDiv({ cls: "af-form-row af-schedule-day-row" });
  dayRow.createDiv({ cls: "af-form-label", text: "Day" });
  const dayWrap = dayRow.createDiv({ cls: "af-schedule-day-buttons" });
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const selectedDays = new Set(parsed.days);

  for (let d = 0; d < 7; d++) {
    const btn = dayWrap.createEl("button", {
      cls: `af-schedule-day-btn${selectedDays.has(d) ? " active" : ""}`,
      text: dayNames[d]!,
    });
    btn.onclick = () => {
      if (selectedDays.has(d)) selectedDays.delete(d);
      else selectedDays.add(d);
      btn.toggleClass("active", selectedDays.has(d));
      buildCron();
    };
  }

  // Day-of-month row (shown for monthly)
  const domRow = container.createDiv({ cls: "af-form-row af-schedule-dom-row" });
  domRow.createDiv({ cls: "af-form-label", text: "Day of month" });
  const domSelect = domRow.createEl("select", { cls: "af-form-select af-form-select-sm" });
  for (let d = 1; d <= 28; d++) {
    const opt = domSelect.createEl("option", { text: String(d), attr: { value: String(d) } });
    if (d === parsed.dayOfMonth) opt.selected = true;
  }

  // Visibility logic
  const showHideFields = () => {
    const freq = freqSelect.value;
    const needsTime = ["daily", "weekdays", "weekly", "monthly"].includes(freq);
    const needsDay = freq === "weekly";
    const needsDom = freq === "monthly";
    timeRow.setCssStyles({ display: needsTime ? "" : "none" });
    dayRow.setCssStyles({ display: needsDay ? "" : "none" });
    domRow.setCssStyles({ display: needsDom ? "" : "none" });
  };

  // Build cron from selections
  const buildCron = () => {
    const freq = freqSelect.value;
    const h = hourSelect.value;
    const m = minSelect.value;
    let cron = "";
    switch (freq) {
      case "every_5m": cron = "*/5 * * * *"; break;
      case "every_15m": cron = "*/15 * * * *"; break;
      case "every_30m": cron = "*/30 * * * *"; break;
      case "every_hour": cron = "0 * * * *"; break;
      case "every_2h": cron = "0 */2 * * *"; break;
      case "daily": cron = `${m} ${h} * * *`; break;
      case "weekdays": cron = `${m} ${h} * * 1-5`; break;
      case "weekly": {
        const days = Array.from(selectedDays).sort().join(",") || "1";
        cron = `${m} ${h} * * ${days}`;
        break;
      }
      case "monthly": cron = `${m} ${h} ${domSelect.value} * *`; break;
    }
    state.schedule = cron;
    state.type = "recurring";
  };

  freqSelect.addEventListener("change", () => { showHideFields(); buildCron(); });
  hourSelect.addEventListener("change", buildCron);
  minSelect.addEventListener("change", buildCron);
  domSelect.addEventListener("change", buildCron);

  showHideFields();
}

/**
 * Render the optional "post results to a channel" controls shared by the
 * create and edit task forms: a channel picker plus a transport-native target
 * id (Discord/Slack channel id, Telegram chat id). Empty target = broadcast/DM.
 */
function renderTaskChannelDelivery(
  section: HTMLElement,
  deps: TaskFormDeps,
  channels: ChannelConfig[],
  state: { channel: string; channelTarget: string },
): void {
  const channelRow = section.createDiv({ cls: "af-form-row" });
  const channelLabel = channelRow.createDiv({ cls: "af-form-label", text: "Channel" });
  const channelSelect = channelRow.createEl("select", { cls: "af-form-select" });
  channelSelect.createEl("option", { text: "— none (run log only) —", attr: { value: "" } });
  for (const ch of channels) {
    const opt = channelSelect.createEl("option", { text: ch.name, attr: { value: ch.name } });
    if (ch.name === state.channel) opt.selected = true;
  }
  deps.addTooltip(
    channelLabel,
    "Post this task’s full output to a channel when it finishes. Leave as none to only write the run log (the default batched behavior).",
  );

  const targetRow = section.createDiv({ cls: "af-form-row" });
  const targetLabel = targetRow.createDiv({ cls: "af-form-label", text: "Target ID" });
  const targetInput = targetRow.createEl("input", {
    cls: "af-form-input",
    attr: { type: "text", placeholder: "Discord/Slack channel ID or Telegram chat ID — empty = DM you" },
  });
  targetInput.value = state.channelTarget;
  targetInput.addEventListener("input", () => { state.channelTarget = targetInput.value.trim(); });
  deps.addTooltip(
    targetLabel,
    "Where in the channel to post. For Discord, enable Developer Mode and right-click the channel → Copy Channel ID. Leave empty to DM the first allowed user instead.",
  );

  const syncVisibility = () => { targetRow.setCssStyles({ display: state.channel ? "" : "none" }); };
  syncVisibility();
  channelSelect.addEventListener("change", () => {
    state.channel = channelSelect.value;
    syncVisibility();
  });
}

function toLocalISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Format a Date as the value string accepted by `<input type="datetime-local">`:
 *  `YYYY-MM-DDTHH:mm`, local timezone, no seconds. */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type ScheduleChoice = "immediate" | "recurring" | "once";

/**
 * Segmented [ Immediate | Recurring | One-time ] control that drives the
 * schedule sections. Maps 1:1 onto the previous enable-toggle + mode-dropdown
 * state (scheduleEnabled + scheduleMode), so the saved frontmatter is
 * unchanged — only the input UI differs.
 */
function renderScheduleTypeSegments(
  container: HTMLElement,
  initial: ScheduleChoice,
  onSelect: (choice: ScheduleChoice) => void,
): void {
  const row = container.createDiv({ cls: "af-form-row" });
  row.createDiv({ cls: "af-form-label", text: "Run" });
  const seg = row.createDiv({ cls: "af-segmented" });
  const options: Array<[ScheduleChoice, string]> = [
    ["immediate", "Immediate"],
    ["recurring", "Recurring"],
    ["once", "One-time"],
  ];
  const buttons: Array<[ScheduleChoice, HTMLButtonElement]> = [];
  for (const [val, lbl] of options) {
    const btn = seg.createEl("button", {
      cls: `af-segmented-btn${val === initial ? " active" : ""}`,
      text: lbl,
    });
    buttons.push([val, btn]);
    btn.onclick = () => {
      for (const [v, b] of buttons) b.toggleClass("active", v === val);
      onSelect(val);
    };
  }
}

// ═══════════════════════════════════════════════════════
//  Create Task Page
// ═══════════════════════════════════════════════════════

export function renderCreateTaskForm(page: HTMLElement, deps: TaskFormDeps): void {
  const { plugin } = deps;
  const snapshot = plugin.runtime.getSnapshot();

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  const avatar = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
  setIcon(avatar, "plus");
  const headerInfo = headerLeft.createDiv();
  headerInfo.createDiv({ cls: "af-detail-header-name", text: "Create New Task" });
  headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Configure a new task for your fleet" });

  header.createDiv({ cls: "af-detail-header-actions" });

  // Form state
  const state = {
    title: "",
    agent: snapshot.agents[0]?.name ?? "",
    priority: "medium",
    tags: "",
    body: "",
    scheduleEnabled: false,
    /** "recurring" (cron) or "once" (run_at). Only consulted when
     *  scheduleEnabled is true; otherwise the task is "immediate". */
    scheduleMode: "recurring" as "recurring" | "once",
    schedule: "0 9 * * *",
    runAt: "",
    type: "immediate" as string,
    enabled: true,
    catchUp: true,
    effort: "",
    model: "",
    channel: "",
    channelTarget: "",
  };

  const form = page.createDiv({ cls: "af-create-form" });

  // ─── Task Details Section ───
  const detailsSection = form.createDiv({ cls: "af-create-section" });
  const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
  const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(detailsIcon, "file-text");
  detailsHeader.createSpan({ text: "Task Details" });

  deps.createFormField(detailsSection, "Title", "Daily status report", "Used as the task identifier", (v) => { state.title = v; });

  // Agent dropdown
  const agentRow = detailsSection.createDiv({ cls: "af-form-row" });
  agentRow.createDiv({ cls: "af-form-label", text: "Agent" });
  const agentSelect = agentRow.createEl("select", { cls: "af-form-select" });
  for (const a of snapshot.agents) {
    agentSelect.createEl("option", { text: a.name, attr: { value: a.name } });
  }
  agentSelect.addEventListener("change", () => { state.agent = agentSelect.value; });

  // Priority dropdown
  const priorityRow = detailsSection.createDiv({ cls: "af-form-row" });
  priorityRow.createDiv({ cls: "af-form-label", text: "Priority" });
  const prioritySelect = priorityRow.createEl("select", { cls: "af-form-select" });
  const priorityOptions: Array<[string, string]> = [
    ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"],
  ];
  for (const [val, lbl] of priorityOptions) {
    const opt = prioritySelect.createEl("option", { text: lbl, attr: { value: val } });
    if (val === "medium") opt.selected = true;
  }
  prioritySelect.addEventListener("change", () => { state.priority = prioritySelect.value; });

  // Tags
  deps.createFormField(detailsSection, "Tags", "monitoring, devops", "Comma-separated", (v) => { state.tags = v; });

  // ─── Instructions Section ───
  const instructionsSection = form.createDiv({ cls: "af-create-section" });
  const instructionsHeader = instructionsSection.createDiv({ cls: "af-create-section-header" });
  const instructionsIcon = instructionsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(instructionsIcon, "message-square");
  instructionsHeader.createSpan({ text: "Instructions" });

  const instructionsTextarea = instructionsSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "Describe what the agent should do...", rows: "10" },
  });
  instructionsTextarea.addEventListener("input", () => { state.body = instructionsTextarea.value; });

  // ─── Schedule Section ───
  const scheduleSection = form.createDiv({ cls: "af-create-section" });
  const scheduleHeader = scheduleSection.createDiv({ cls: "af-create-section-header" });
  const scheduleIcon = scheduleHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(scheduleIcon, "clock");
  scheduleHeader.createSpan({ text: "Schedule" });

  // Schedule type — one segmented control replaces the old enable-toggle +
  // mode dropdown. Drives the same state fields (scheduleEnabled/scheduleMode)
  // so the saved frontmatter is identical.
  renderScheduleTypeSegments(scheduleSection, "immediate", (choice) => {
    state.scheduleEnabled = choice !== "immediate";
    if (choice !== "immediate") state.scheduleMode = choice;
    state.type = choice;
    scheduleBody.setCssStyles({ display: choice === "immediate" ? "none" : "" });
    cronHost.setCssStyles({ display: choice === "recurring" ? "" : "none" });
    onceHost.setCssStyles({ display: choice === "once" ? "" : "none" });
  });

  const scheduleBody = scheduleSection.createDiv({ cls: "af-schedule-body" });
  scheduleBody.setCssStyles({ display: "none" });
  const cronHost = scheduleBody.createDiv();
  const onceHost = scheduleBody.createDiv();
  onceHost.setCssStyles({ display: "none" });
  renderInlineSchedule(cronHost, state);

  const onceRow = onceHost.createDiv({ cls: "af-form-row" });
  onceRow.createDiv({ cls: "af-form-label", text: "Run at" });
  const onceInput = onceRow.createEl("input", {
    cls: "af-form-input",
    attr: { type: "datetime-local", value: toDatetimeLocal(new Date(Date.now() + 3600_000)) },
  });
  // Seed the initial value — the task won't persist blank runAt
  state.runAt = new Date(onceInput.value).toISOString();
  onceInput.addEventListener("input", () => {
    state.runAt = onceInput.value ? new Date(onceInput.value).toISOString() : "";
  });

  // Enabled toggle (only when schedule is on)
  const enabledRow = scheduleBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
  enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
  const enabledToggle = enabledRow.createDiv({ cls: "af-agent-card-toggle on" });
  enabledToggle.onclick = () => {
    const isOn = enabledToggle.hasClass("on");
    enabledToggle.toggleClass("on", !isOn);
    state.enabled = !isOn;
  };

  // Catch up missed runs toggle
  const catchUpRow = scheduleBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
  const catchUpLabel = catchUpRow.createDiv({ cls: "af-form-label" });
  catchUpLabel.setText("Catch up if missed");

  const catchUpToggle = catchUpRow.createDiv({ cls: `af-agent-card-toggle${state.catchUp ? " on" : ""}` });
  catchUpToggle.onclick = () => {
    const isOn = catchUpToggle.hasClass("on");
    catchUpToggle.toggleClass("on", !isOn);
    state.catchUp = !isOn;
  };

  // ─── Execution Section ───
  // Model & effort are per-run controls, not scheduling knobs — they apply
  // whether or not the task has a schedule, so they live in their own section.
  const execSection = form.createDiv({ cls: "af-create-section" });
  const execHeader = execSection.createDiv({ cls: "af-create-section-header" });
  const execIcon = execHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(execIcon, "gauge");
  execHeader.createSpan({ text: "Execution" });

  // Model override (per-task)
  const taskModelRow = execSection.createDiv({ cls: "af-form-row" });
  const taskModelLabel = taskModelRow.createDiv({ cls: "af-form-label", text: "Model" });
  const taskModelFieldWrap = taskModelRow.createDiv({ cls: "af-form-field-wrap" });
  const renderCreateTaskModelPicker = (agentName: string) => {
    taskModelFieldWrap.empty();
    const selAgent = snapshot.agents.find((a) => a.name === agentName);
    renderModelPicker(taskModelFieldWrap, {
      value: state.model,
      adapter: selAgent?.adapter,
      onChange: (value) => { state.model = value; },
      allowInherit: true,
      inheritPlaceholder: selAgent
        ? `Inherit from ${selAgent.name}${selAgent.model ? ` (${selAgent.model})` : ""}`
        : "Inherit from agent",
    });
  };
  renderCreateTaskModelPicker(state.agent);
  agentSelect.addEventListener("change", () => renderCreateTaskModelPicker(agentSelect.value));
  deps.addTooltip(
    taskModelLabel,
    "Override the agent’s model for this task only. Useful for routing simple runs to haiku while the agent stays on opus for heavier work.",
  );

  // Effort level
  const taskEffortRow = execSection.createDiv({ cls: "af-form-row" });
  const taskEffortLabel = taskEffortRow.createDiv({ cls: "af-form-label", text: "Effort" });
  const taskEffortSelect = taskEffortRow.createEl("select", { cls: "af-form-select" });
  for (const [val, lbl] of [["", "Agent Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["max", "Max"]] as const) {
    const opt = taskEffortSelect.createEl("option", { text: lbl, attr: { value: val } });
    if (val === state.effort) opt.selected = true;
  }
  taskEffortSelect.addEventListener("change", () => { state.effort = taskEffortSelect.value; });
  // Channel delivery (optional) — post this task's output to a channel on completion.
  renderTaskChannelDelivery(execSection, deps, snapshot.channels, state);
  deps.addTooltip(
    taskEffortLabel,
    "Overrides the agent’s effort level for this task. Higher effort = more thinking tokens spent.",
  );

  // ─── Footer ───
  const footer = page.createDiv({ cls: "af-create-footer" });
  const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
  cancelBtn.onclick = () => deps.navigate("kanban");

  const createBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
  createIcon(createBtn, "plus", "af-btn-icon");
  createBtn.appendText(" Create Task");
  createBtn.onclick = async () => {
    const title = state.title.trim();
    if (!title) {
      new Notice("Task title is required.");
      return;
    }
    const taskId = slugify(title);
    const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);

    const effectiveType = state.scheduleEnabled
      ? state.scheduleMode === "once"
        ? "once"
        : "recurring"
      : "immediate";

    const frontmatter: Record<string, unknown> = {
      task_id: taskId,
      agent: state.agent,
      type: effectiveType,
      priority: state.priority,
      enabled: state.enabled,
      created: toLocalISO(new Date()),
      run_count: 0,
      catch_up: state.catchUp,
      effort: state.effort || undefined,
      model: state.model || undefined,
      channel: state.channel || undefined,
      channel_target: state.channel && state.channelTarget ? state.channelTarget : undefined,
      tags: parseTags(state.tags),
    };

    if (effectiveType === "recurring") {
      frontmatter.schedule = state.schedule.trim() || "0 9 * * *";
    } else if (effectiveType === "once") {
      if (!state.runAt) {
        new Notice("Pick a date/time for the one-time run.");
        return;
      }
      frontmatter.run_at = state.runAt;
    }

    const restoreSubmit = deps.markSubmitBusy(createBtn, "Creating...", "plus", "Create Task");
    try {
      const path = await plugin.repository.getAvailablePath(
        plugin.repository.getSubfolder("tasks"),
        taskId,
      );
      await plugin.app.vault.create(
        path,
        stringifyMarkdownWithFrontmatter(frontmatter, state.body.trim() || "Describe the task here."),
      );
      new Notice(`Task "${taskId}" created.`);
      await plugin.refreshFromVault();
      deps.navigate("task-detail", taskId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to create task: ${msg}`);
      restoreSubmit();
    }
  };
}

// ═══════════════════════════════════════════════════════
//  Edit Task Page
// ═══════════════════════════════════════════════════════

export function renderEditTaskForm(page: HTMLElement, deps: TaskFormDeps, task: TaskConfig): void {
  const { plugin } = deps;
  const snapshot = plugin.runtime.getSnapshot();

  // Header
  const header = page.createDiv({ cls: "af-detail-header" });
  const headerLeft = header.createDiv({ cls: "af-detail-header-left" });
  const taskIcon = headerLeft.createDiv({ cls: "af-agent-card-avatar idle" });
  setIcon(taskIcon, "edit");
  const headerInfo = headerLeft.createDiv();
  headerInfo.createDiv({ cls: "af-detail-header-name", text: `Edit Task: ${task.taskId}` });
  headerInfo.createDiv({ cls: "af-detail-header-desc", text: "Modify task configuration" });

  header.createDiv({ cls: "af-detail-header-actions" });

  const hasSchedule = !!(task.schedule || task.runAt);

  // Form state pre-filled
  const state = {
    agent: task.agent,
    type: task.type as string,
    priority: task.priority,
    schedule: task.schedule ?? "0 9 * * *",
    runAt: task.runAt ?? "",
    scheduleEnabled: hasSchedule,
    scheduleMode: (task.type === "once" ? "once" : "recurring"),
    enabled: task.enabled,
    catchUp: task.catchUp,
    effort: task.effort ?? "",
    model: task.model ?? "",
    channel: task.channel ?? "",
    channelTarget: task.channelTarget ?? "",
    tags: task.tags.join(", "),
    body: task.body,
  };

  const form = page.createDiv({ cls: "af-create-form" });

  // ─── Task Details Section ───
  const detailsSection = form.createDiv({ cls: "af-create-section" });
  const detailsHeader = detailsSection.createDiv({ cls: "af-create-section-header" });
  const detailsIcon = detailsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(detailsIcon, "file-text");
  detailsHeader.createSpan({ text: "Task Details" });

  // Title (read-only)
  const nameRow = detailsSection.createDiv({ cls: "af-form-row" });
  nameRow.createDiv({ cls: "af-form-label", text: "Title" });
  const nameInput = nameRow.createEl("input", {
    cls: "af-form-input",
    attr: { type: "text", value: task.taskId, disabled: "true" },
  });
  nameInput.setCssStyles({ opacity: "0.6" });

  // Agent dropdown
  const agentRow = detailsSection.createDiv({ cls: "af-form-row" });
  agentRow.createDiv({ cls: "af-form-label", text: "Agent" });
  const agentSelect = agentRow.createEl("select", { cls: "af-form-select" });
  for (const a of snapshot.agents) {
    const opt = agentSelect.createEl("option", { text: a.name, attr: { value: a.name } });
    if (a.name === task.agent) opt.selected = true;
  }
  agentSelect.addEventListener("change", () => { state.agent = agentSelect.value; });

  // Priority dropdown
  const priorityRow = detailsSection.createDiv({ cls: "af-form-row" });
  priorityRow.createDiv({ cls: "af-form-label", text: "Priority" });
  const prioritySelect = priorityRow.createEl("select", { cls: "af-form-select" });
  const priorityOptions: Array<[string, string]> = [
    ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"],
  ];
  for (const [val, lbl] of priorityOptions) {
    const opt = prioritySelect.createEl("option", { text: lbl, attr: { value: val } });
    if (val === task.priority) opt.selected = true;
  }
  prioritySelect.addEventListener("change", () => { state.priority = prioritySelect.value as typeof state.priority; });

  // Tags
  deps.createFormField(detailsSection, "Tags", "monitoring, critical", "Comma-separated", (v) => { state.tags = v; }, task.tags.join(", "));

  // ─── Instructions Section ───
  const instructionsSection = form.createDiv({ cls: "af-create-section" });
  const instructionsHeader = instructionsSection.createDiv({ cls: "af-create-section-header" });
  const instructionsIcon = instructionsHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(instructionsIcon, "message-square");
  instructionsHeader.createSpan({ text: "Instructions" });

  const instructionsTextarea = instructionsSection.createEl("textarea", {
    cls: "af-create-prompt-textarea",
    attr: { placeholder: "Describe what the agent should do...", rows: "10" },
  });
  instructionsTextarea.value = task.body;
  instructionsTextarea.addEventListener("input", () => { state.body = instructionsTextarea.value; });

  // ─── Schedule Section ───
  const scheduleSection = form.createDiv({ cls: "af-create-section" });
  const scheduleHeader = scheduleSection.createDiv({ cls: "af-create-section-header" });
  const scheduleIcon = scheduleHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(scheduleIcon, "clock");
  scheduleHeader.createSpan({ text: "Schedule" });

  // Schedule type — one segmented control replaces the old enable-toggle +
  // mode dropdown. Drives the same state fields (scheduleEnabled/scheduleMode)
  // so the saved frontmatter is identical.
  const initialChoice: ScheduleChoice = !hasSchedule
    ? "immediate"
    : state.scheduleMode === "once"
      ? "once"
      : "recurring";
  renderScheduleTypeSegments(scheduleSection, initialChoice, (choice) => {
    state.scheduleEnabled = choice !== "immediate";
    if (choice !== "immediate") state.scheduleMode = choice;
    state.type = choice;
    scheduleBody.setCssStyles({ display: choice === "immediate" ? "none" : "" });
    editCronHost.setCssStyles({ display: choice === "recurring" ? "" : "none" });
    editOnceHost.setCssStyles({ display: choice === "once" ? "" : "none" });
  });

  const scheduleBody = scheduleSection.createDiv({ cls: "af-schedule-body" });
  scheduleBody.setCssStyles({ display: hasSchedule ? "" : "none" });
  const editCronHost = scheduleBody.createDiv();
  const editOnceHost = scheduleBody.createDiv();
  editCronHost.setCssStyles({ display: initialChoice === "recurring" ? "" : "none" });
  editOnceHost.setCssStyles({ display: initialChoice === "once" ? "" : "none" });
  renderInlineSchedule(editCronHost, state);

  const editOnceRow = editOnceHost.createDiv({ cls: "af-form-row" });
  editOnceRow.createDiv({ cls: "af-form-label", text: "Run at" });
  const prefillOnce = state.runAt
    ? toDatetimeLocal(new Date(state.runAt))
    : toDatetimeLocal(new Date(Date.now() + 3600_000));
  const editOnceInput = editOnceRow.createEl("input", {
    cls: "af-form-input",
    attr: { type: "datetime-local", value: prefillOnce },
  });
  if (!state.runAt) state.runAt = new Date(editOnceInput.value).toISOString();
  editOnceInput.addEventListener("input", () => {
    state.runAt = editOnceInput.value ? new Date(editOnceInput.value).toISOString() : "";
  });

  // Enabled toggle (whether the schedule is active)
  const enabledRow = scheduleBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
  enabledRow.createDiv({ cls: "af-form-label", text: "Enabled" });
  const enabledToggle = enabledRow.createDiv({ cls: `af-agent-card-toggle${task.enabled ? " on" : ""}` });
  enabledToggle.onclick = () => {
    const isOn = enabledToggle.hasClass("on");
    enabledToggle.toggleClass("on", !isOn);
    state.enabled = !isOn;
  };

  // Catch up missed runs toggle
  const catchUpRow = scheduleBody.createDiv({ cls: "af-form-row af-form-row-toggle" });
  const catchUpLabel = catchUpRow.createDiv({ cls: "af-form-label" });
  catchUpLabel.setText("Catch up if missed");

  const catchUpToggle = catchUpRow.createDiv({ cls: `af-agent-card-toggle${state.catchUp ? " on" : ""}` });
  catchUpToggle.onclick = () => {
    const isOn = catchUpToggle.hasClass("on");
    catchUpToggle.toggleClass("on", !isOn);
    state.catchUp = !isOn;
  };

  // ─── Execution Section ───
  const execSection = form.createDiv({ cls: "af-create-section" });
  const execHeader = execSection.createDiv({ cls: "af-create-section-header" });
  const execIcon = execHeader.createSpan({ cls: "af-create-section-icon" });
  setIcon(execIcon, "gauge");
  execHeader.createSpan({ text: "Execution" });

  // Effort level
  const effortRow = execSection.createDiv({ cls: "af-form-row" });
  const effortLabel = effortRow.createDiv({ cls: "af-form-label", text: "Effort" });
  const effortSelect = effortRow.createEl("select", { cls: "af-form-select" });
  const effortOptions: Array<[string, string]> = [
    ["", "Agent Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["max", "Max"],
  ];
  for (const [val, lbl] of effortOptions) {
    const opt = effortSelect.createEl("option", { text: lbl, attr: { value: val } });
    if (val === state.effort) opt.selected = true;
  }
  effortSelect.addEventListener("change", () => { state.effort = effortSelect.value; });
  deps.addTooltip(
    effortLabel,
    "Overrides the agent’s effort level for this task. Higher effort = more thinking tokens spent.",
  );

  // Model override
  const modelRowEdit = execSection.createDiv({ cls: "af-form-row" });
  const modelLabelEdit = modelRowEdit.createDiv({ cls: "af-form-label", text: "Model" });
  const modelFieldWrapEdit = modelRowEdit.createDiv({ cls: "af-form-field-wrap" });
  const renderTaskModelPicker = (agentName: string) => {
    modelFieldWrapEdit.empty();
    const selAgent = snapshot.agents.find((a) => a.name === agentName);
    renderModelPicker(modelFieldWrapEdit, {
      value: state.model,
      adapter: selAgent?.adapter,
      onChange: (value) => { state.model = value; },
      allowInherit: true,
      inheritPlaceholder: selAgent
        ? `Inherit from ${selAgent.name}${selAgent.model ? ` (${selAgent.model})` : ""}`
        : "Inherit from agent",
    });
  };
  renderTaskModelPicker(state.agent);
  agentSelect.addEventListener("change", () => renderTaskModelPicker(agentSelect.value));
  // Channel delivery (optional) — post this task's output to a channel on completion.
  renderTaskChannelDelivery(execSection, deps, snapshot.channels, state);
  deps.addTooltip(
    modelLabelEdit,
    "Override the agent’s model for this task only. Useful for routing simple runs to haiku while the agent stays on opus for heavier work.",
  );

  // ─── Footer ───
  const footer = page.createDiv({ cls: "af-create-footer" });

  const deleteBtn = footer.createEl("button", { cls: "af-btn-sm danger" });
  createIcon(deleteBtn, "trash-2", "af-btn-icon");
  deleteBtn.appendText(" Delete");
  deleteBtn.onclick = () => {
    new ConfirmModal(plugin.app, {
      title: `Delete task "${task.taskId}"?`,
      body: "The task file will be moved to your system trash and can be recovered.",
      confirmText: "Delete",
      danger: true,
      onConfirm: async () => {
        await plugin.repository.deleteTask(task.taskId);
        new Notice(`Task "${task.taskId}" deleted.`);
        await new Promise((r) => window.setTimeout(r, 200));
        await plugin.refreshFromVault();
        deps.navigate("kanban");
      },
    }).open();
  };

  footer.createDiv({ cls: "af-toolbar-spacer" });

  const cancelBtn = footer.createEl("button", { cls: "af-btn-sm", text: "Cancel" });
  cancelBtn.onclick = () => deps.navigate("task-detail", task.taskId);

  const saveBtn = footer.createEl("button", { cls: "af-btn-sm primary af-create-submit" });
  createIcon(saveBtn, "check", "af-btn-icon");
  saveBtn.appendText(" Save Changes");
  saveBtn.onclick = async () => {
    const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
    const effectiveType = state.scheduleEnabled
      ? state.scheduleMode === "once"
        ? "once"
        : "recurring"
      : "immediate";
    if (effectiveType === "once" && !state.runAt) {
      new Notice("Pick a date/time for the one-time run.");
      return;
    }
    const restoreSubmit = deps.markSubmitBusy(saveBtn, "Saving...", "check", "Save Changes");
    try {
      await plugin.repository.updateTask(task.taskId, {
        agent: state.agent,
        type: effectiveType,
        priority: state.priority,
        schedule: effectiveType === "recurring" ? state.schedule.trim() : "",
        runAt: effectiveType === "once" ? state.runAt : "",
        enabled: state.enabled,
        catch_up: state.catchUp,
        effort: state.effort || undefined,
        model: state.model || "",
        channel: state.channel || "",
        channelTarget: state.channel && state.channelTarget ? state.channelTarget : "",
        tags: parseTags(state.tags),
        body: state.body.trim(),
      });
      new Notice(`Task "${task.taskId}" updated.`);
      await plugin.refreshFromVault();
      deps.navigate("task-detail", task.taskId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      new Notice(`Failed to update task: ${msg}`);
      restoreSubmit();
    }
  };
}
