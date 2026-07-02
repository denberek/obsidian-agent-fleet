import type AgentFleetPlugin from "../../main";

/**
 * View helpers every extracted form page borrows from the dashboard so the
 * extracted markup stays byte-identical to what the view used to render
 * inline. Each form module extends this with its own (narrowly typed)
 * `navigate` delegate and any page-specific extras.
 */
export interface DashboardFormDeps {
  plugin: AgentFleetPlugin;
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

/** Decompose a cron expression into the schedule-picker widget's components. */
export function parseCronComponents(cron: string): {
  freq: string;
  hour: number;
  minute: number;
  days: number[];
  dayOfMonth: number;
} {
  const defaults = { freq: "daily", hour: 9, minute: 0, days: [1], dayOfMonth: 1 };
  if (!cron?.trim()) return defaults;

  const shortcutMap: Record<string, string> = {
    "*/5 * * * *": "every_5m",
    "*/15 * * * *": "every_15m",
    "*/30 * * * *": "every_30m",
    "0 * * * *": "every_hour",
    "0 */2 * * *": "every_2h",
  };
  if (shortcutMap[cron]) return { ...defaults, freq: shortcutMap[cron] };

  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return defaults;
  const [min, hr, dom, , dow] = parts;
  const h = parseInt(hr ?? "9", 10);
  const m = parseInt(min ?? "0", 10);

  if (dom === "*" && dow === "*") return { ...defaults, freq: "daily", hour: h, minute: m };
  if (dom === "*" && dow === "1-5") return { ...defaults, freq: "weekdays", hour: h, minute: m };
  if (dom === "*" && dow !== "*") {
    const days = (dow ?? "1").split(",").map((d) => parseInt(d, 10));
    return { ...defaults, freq: "weekly", hour: h, minute: m, days };
  }
  if (dow === "*" && dom !== "*") {
    return { ...defaults, freq: "monthly", hour: h, minute: m, dayOfMonth: parseInt(dom ?? "1", 10) };
  }

  return { ...defaults, hour: h, minute: m };
}
