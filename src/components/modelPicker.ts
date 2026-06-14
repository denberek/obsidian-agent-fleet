export interface ModelPickerProps {
  /** Current value; empty string = Default/Inherit (no --model passed). */
  value: string;
  /** Called with the new string whenever the user changes the selection. */
  onChange: (value: string) => void;
  /**
   * When true, the first option label is "Inherit from agent" (task form).
   * When false, it's "Default (let the CLI pick)" (settings / agent forms).
   */
  allowInherit?: boolean;
  /**
   * Text shown in the inherit option when `allowInherit` is true.
   * e.g. "Inherit from fleet-orchestrator (opus)".
   */
  inheritPlaceholder?: string;
  /**
   * Which backend the agent runs on ("claude-code" | "codex"). Controls the
   * alias list and labels. Defaults to claude-code.
   */
  adapter?: string;
}

/** Aliases supported by Claude Code across all backends (direct/Bedrock/Vertex/Foundry). */
export const MODEL_ALIASES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "opus", label: "opus — latest Opus" },
  { value: "sonnet", label: "sonnet — latest Sonnet" },
  { value: "haiku", label: "haiku — latest Haiku" },
  { value: "opusplan", label: "opusplan — plan-mode Opus" },
];

/** Common Codex model slugs. Codex ships new models often — this list is a
 *  convenience, not a constraint; Custom… accepts any slug. */
export const CODEX_MODEL_ALIASES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "gpt-5.5", label: "gpt-5.5 — frontier" },
  { value: "gpt-5.4", label: "gpt-5.4" },
  { value: "gpt-5.4-mini", label: "gpt-5.4-mini — fast" },
  { value: "gpt-5.3-codex", label: "gpt-5.3-codex" },
];

const CUSTOM_SENTINEL = "__custom__";

type Mode = "inherit" | "alias" | "custom";

function isCodexAdapter(adapter: string | undefined): boolean {
  const v = (adapter ?? "").trim().toLowerCase();
  return v === "codex" || v === "openai-codex";
}

function aliasesFor(adapter: string | undefined): ReadonlyArray<{ value: string; label: string }> {
  return isCodexAdapter(adapter) ? CODEX_MODEL_ALIASES : MODEL_ALIASES;
}

function classify(value: string, adapter: string | undefined): Mode {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "default" || trimmed === "subscription") return "inherit";
  if (aliasesFor(adapter).some((a) => a.value === trimmed)) return "alias";
  return "custom";
}

/**
 * Render a compact model picker: a single select, plus an inline text input
 * that only appears when the user picks "Custom…". Callers render their own
 * label and tooltip (via the existing `addTooltip` pattern) — this component
 * only owns the control widgets.
 */
export function renderModelPicker(container: HTMLElement, props: ModelPickerProps): void {
  container.empty();
  container.addClass("af-model-picker");

  const codex = isCodexAdapter(props.adapter);
  const aliases = aliasesFor(props.adapter);
  const mode = classify(props.value, props.adapter);

  const select = container.createEl("select", { cls: "af-form-select af-mp-select" });
  const inheritLabel = props.allowInherit
    ? (props.inheritPlaceholder ?? "Inherit from agent")
    : codex
      ? "Default (let Codex pick)"
      : "Default (let Claude Code pick)";
  select.createEl("option", { text: inheritLabel, attr: { value: "" } });

  const aliasGroup = select.createEl("optgroup", {
    attr: { label: codex ? "Codex models" : "Aliases (any backend)" },
  });
  for (const alias of aliases) {
    aliasGroup.createEl("option", { text: alias.label, attr: { value: alias.value } });
  }

  select.createEl("option", { text: "Custom…", attr: { value: CUSTOM_SENTINEL } });

  const customInput = container.createEl("input", {
    cls: "af-form-input af-mp-custom-input",
    attr: {
      type: "text",
      placeholder: codex
        ? "e.g. gpt-5.5  ·  gpt-5.4-mini"
        : "e.g. claude-opus-4-7  ·  us.anthropic.claude-opus-4-7  ·  claude-opus-4-7@20251101",
      spellcheck: "false",
    },
  });

  // Initial state
  if (mode === "inherit") {
    select.value = "";
    customInput.value = "";
    customInput.setCssStyles({ display: "none" });
  } else if (mode === "alias") {
    select.value = props.value.trim();
    customInput.value = "";
    customInput.setCssStyles({ display: "none" });
  } else {
    select.value = CUSTOM_SENTINEL;
    customInput.value = props.value.trim();
    customInput.setCssStyles({ display: "" });
  }

  select.addEventListener("change", () => {
    if (select.value === CUSTOM_SENTINEL) {
      customInput.setCssStyles({ display: "" });
      customInput.focus();
      props.onChange(customInput.value.trim());
    } else {
      customInput.setCssStyles({ display: "none" });
      props.onChange(select.value);
    }
  });

  customInput.addEventListener("input", () => {
    if (select.value === CUSTOM_SENTINEL) {
      props.onChange(customInput.value.trim());
    }
  });
}
