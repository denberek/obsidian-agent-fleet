/**
 * Shared interval-style schedule picker. Reuses the heartbeat-form pattern
 * from dashboardView: a Frequency dropdown (Every 5m / 15m / 30m / 1h / 2h /
 * 4h / 6h / 12h / Once a day) plus Hour+Minute selects that only appear when
 * the user picks "Once a day". Emits a cron expression via `onChange`.
 *
 * This is a thin helper used by both task heartbeats (future cleanup) and
 * the Wiki Keeper modals where users configure ingest cadence without
 * needing to know cron syntax.
 */
export interface SchedulePickerProps {
  /** Current cron expression (e.g. "0 3 * * *"). */
  value: string;
  onChange: (cron: string) => void;
}

interface CronComponents {
  freq: string;
  hour: number;
  minute: number;
  /** 0-6 (Sun=0). Only meaningful when freq === "weekly". */
  dayOfWeek: number;
}

const CRON_TO_FREQ: Record<string, string> = {
  "*/5 * * * *": "every_5m",
  "*/15 * * * *": "every_15m",
  "*/30 * * * *": "every_30m",
  "0 * * * *": "every_hour",
  "0 */2 * * *": "every_2h",
  "0 */4 * * *": "every_4h",
  "0 */6 * * *": "every_6h",
  "0 */12 * * *": "every_12h",
};

const FREQ_OPTIONS: ReadonlyArray<[string, string]> = [
  ["every_5m", "Every 5 minutes"],
  ["every_15m", "Every 15 minutes"],
  ["every_30m", "Every 30 minutes"],
  ["every_hour", "Every hour"],
  ["every_2h", "Every 2 hours"],
  ["every_4h", "Every 4 hours"],
  ["every_6h", "Every 6 hours"],
  ["every_12h", "Every 12 hours"],
  ["daily", "Once a day"],
  ["weekly", "Once a week"],
];

const DAY_OPTIONS: ReadonlyArray<[number, string]> = [
  [0, "Sunday"],
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
];

function parseCronComponents(cron: string): CronComponents {
  const defaults: CronComponents = { freq: "daily", hour: 3, minute: 0, dayOfWeek: 0 };
  const trimmed = cron?.trim();
  if (!trimmed) return defaults;

  const preset = CRON_TO_FREQ[trimmed];
  if (preset) return { ...defaults, freq: preset };

  // Five-field cron: `m h dom mon dow`.
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 5) {
    const minute = parseInt(parts[0]!, 10);
    const hour = parseInt(parts[1]!, 10);
    const dom = parts[2]!;
    const dow = parts[4]!;
    if (!isNaN(minute) && !isNaN(hour)) {
      // Weekly: dom is "*" and dow is a single digit 0-6.
      if (dom === "*" && /^[0-6]$/.test(dow)) {
        return { freq: "weekly", hour, minute, dayOfWeek: parseInt(dow, 10) };
      }
      return { ...defaults, freq: "daily", hour, minute };
    }
  }
  return defaults;
}

/**
 * Render a Frequency + (Hour + Minute when daily) picker into `container`.
 * Returns a disposer that removes event listeners — callers in modals don't
 * need it (modal teardown nukes the DOM). Included for completeness.
 */
export function renderSchedulePicker(
  container: HTMLElement,
  props: SchedulePickerProps,
): () => void {
  container.addClass("af-schedule-picker");
  const initial = parseCronComponents(props.value);

  // Frequency
  const freqRow = container.createDiv({ cls: "af-form-row" });
  freqRow.createDiv({ cls: "af-form-label", text: "Frequency" });
  const freqSelect = freqRow.createEl("select", { cls: "af-form-select" });
  for (const [val, lbl] of FREQ_OPTIONS) {
    const opt = freqSelect.createEl("option", { text: lbl, attr: { value: val } });
    if (val === initial.freq) opt.selected = true;
  }

  // Day of week — only shown when weekly.
  const dayRow = container.createDiv({ cls: "af-form-row af-schedule-day-row" });
  dayRow.createDiv({ cls: "af-form-label", text: "Day" });
  const daySelect = dayRow.createEl("select", { cls: "af-form-select" });
  for (const [val, lbl] of DAY_OPTIONS) {
    const opt = daySelect.createEl("option", { text: lbl, attr: { value: String(val) } });
    if (val === initial.dayOfWeek) opt.selected = true;
  }

  // Time (hour + minute) — shown when daily OR weekly.
  const timeRow = container.createDiv({ cls: "af-form-row af-schedule-time-row" });
  timeRow.createDiv({ cls: "af-form-label", text: "Time" });
  const timeWrap = timeRow.createDiv({ cls: "af-schedule-time-selects" });

  const hourSelect = timeWrap.createEl("select", { cls: "af-form-select af-form-select-sm" });
  for (let h = 0; h < 24; h++) {
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const opt = hourSelect.createEl("option", { text: `${h12} ${ampm}`, attr: { value: String(h) } });
    if (h === initial.hour) opt.selected = true;
  }

  timeWrap.createSpan({ cls: "af-schedule-colon", text: ":" });

  const minSelect = timeWrap.createEl("select", { cls: "af-form-select af-form-select-sm" });
  for (let m = 0; m < 60; m += 5) {
    const opt = minSelect.createEl("option", {
      text: String(m).padStart(2, "0"),
      attr: { value: String(m) },
    });
    if (m === initial.minute) opt.selected = true;
  }

  const showHide = () => {
    const freq = freqSelect.value;
    const needsTime = freq === "daily" || freq === "weekly";
    const needsDay = freq === "weekly";
    timeRow.setCssStyles({ display: needsTime ? "" : "none" });
    dayRow.setCssStyles({ display: needsDay ? "" : "none" });
  };

  const buildCron = () => {
    const freq = freqSelect.value;
    const h = hourSelect.value;
    const m = minSelect.value;
    const dow = daySelect.value;
    let cron = "";
    switch (freq) {
      case "every_5m": cron = "*/5 * * * *"; break;
      case "every_15m": cron = "*/15 * * * *"; break;
      case "every_30m": cron = "*/30 * * * *"; break;
      case "every_hour": cron = "0 * * * *"; break;
      case "every_2h": cron = "0 */2 * * *"; break;
      case "every_4h": cron = "0 */4 * * *"; break;
      case "every_6h": cron = "0 */6 * * *"; break;
      case "every_12h": cron = "0 */12 * * *"; break;
      case "daily": cron = `${m} ${h} * * *`; break;
      case "weekly": cron = `${m} ${h} * * ${dow}`; break;
    }
    props.onChange(cron);
  };

  const onFreq = () => { showHide(); buildCron(); };
  freqSelect.addEventListener("change", onFreq);
  hourSelect.addEventListener("change", buildCron);
  minSelect.addEventListener("change", buildCron);
  daySelect.addEventListener("change", buildCron);

  showHide();

  return () => {
    freqSelect.removeEventListener("change", onFreq);
    hourSelect.removeEventListener("change", buildCron);
    minSelect.removeEventListener("change", buildCron);
    daySelect.removeEventListener("change", buildCron);
  };
}
