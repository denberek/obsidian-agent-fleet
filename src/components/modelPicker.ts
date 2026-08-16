import type { PiModelCatalog } from "../utils/piModels";

export interface ModelPickerProps {
  /** Current value; empty string = Default/Inherit (no --model passed). */
  value: string;
  /** Called with the new string whenever the user changes the selection. */
  onChange: (value: string) => void | Promise<void>;
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
   * Which backend the agent runs on ("claude-code" | "codex" | "pi").
   * Controls the alias list and labels. Defaults to claude-code.
   */
  adapter?: string;
  /**
   * Pi only: async source for the dual-vendor model catalog (backed by
   * `pi --list-models`, credential-gated). The picker renders immediately and
   * fills the Anthropic/OpenAI groups when the catalog arrives; without this
   * prop (or on an unavailable catalog) it degrades to free text.
   */
  loadPiModels?: () => Promise<PiModelCatalog>;
}

/** Aliases supported by Claude Code across all backends (direct/Bedrock/Vertex/Foundry).
 *  Mirrors the CLI's own `--model` alias set. `opusplan` was dropped from that
 *  set upstream; agents that still carry it keep working via Custom… (classify
 *  falls through to "custom" and the value round-trips untouched). */
export const MODEL_ALIASES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "opus", label: "opus — latest Opus" },
  { value: "sonnet", label: "sonnet — latest Sonnet" },
  { value: "haiku", label: "haiku — latest Haiku" },
  { value: "fable", label: "fable — latest Fable" },
];

/** Common Codex model slugs. Codex ships new models often — this list is a
 *  convenience, not a constraint; Custom… accepts any slug. */
export const CODEX_MODEL_ALIASES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "gpt-5.6-terra", label: "gpt-5.6-terra — balanced" },
  { value: "gpt-5.6-sol", label: "gpt-5.6-sol — flagship" },
  { value: "gpt-5.6-luna", label: "gpt-5.6-luna — fast" },
  { value: "gpt-5.5", label: "gpt-5.5 — previous frontier" },
];

/**
 * Model slugs the vendor has retired or deprecated, mapped to the notice we
 * show when an agent or task still points at one. We deliberately do NOT
 * rewrite the user's frontmatter — a silent model swap changes what their
 * agent does. The picker surfaces the warning; the choice stays theirs.
 */
export const RETIRED_MODEL_NOTICES: ReadonlyArray<{ pattern: RegExp; notice: string }> = [
  {
    pattern: /^gpt-5\.4(-mini)?$/i,
    notice: "retires from Codex on 2026-08-31 — switch to a gpt-5.6 tier before then",
  },
  {
    pattern: /^gpt-5\.3-codex$/i,
    notice: "deprecated in Codex for ChatGPT sign-in — switch to a gpt-5.6 tier",
  },
  {
    pattern: /^gpt-5\.2(-codex)?$/i,
    notice: "deprecated in Codex for ChatGPT sign-in — switch to a gpt-5.6 tier",
  },
];

/** Warning text for a retired/deprecated model slug, or null if it looks current.
 *  Matches on the bare slug only — pinned vendor IDs and Bedrock/Vertex forms
 *  are left alone rather than guessed at. */
export function retiredModelNotice(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const { pattern, notice } of RETIRED_MODEL_NOTICES) {
    if (pattern.test(trimmed)) return `${trimmed} ${notice}.`;
  }
  return null;
}

const CUSTOM_SENTINEL = "__custom__";

type Mode = "inherit" | "alias" | "custom";

function isCodexAdapter(adapter: string | undefined): boolean {
  const v = (adapter ?? "").trim().toLowerCase();
  return v === "codex" || v === "openai-codex";
}

function isPiAdapter(adapter: string | undefined): boolean {
  const v = (adapter ?? "").trim().toLowerCase();
  return v === "pi" || v === "pi-coding-agent";
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

/** Wire the select ↔ custom-input pair shared by both pickers: Custom… reveals
 *  the input and emits its (possibly prefilled) value; any other option hides
 *  it and emits the option value. `sync` refreshes the notice/hint strip. */
function wireCustomModelInput(
  select: HTMLSelectElement,
  customInput: HTMLInputElement,
  sync: (value: string) => void,
  onChange: ModelPickerProps["onChange"],
): void {
  select.addEventListener("change", () => {
    if (select.value === CUSTOM_SENTINEL) {
      customInput.setCssStyles({ display: "" });
      customInput.focus();
      sync(customInput.value);
      void onChange(customInput.value.trim());
    } else {
      customInput.setCssStyles({ display: "none" });
      sync(select.value);
      void onChange(select.value);
    }
  });
  customInput.addEventListener("input", () => {
    if (select.value === CUSTOM_SENTINEL) {
      sync(customInput.value);
      void onChange(customInput.value.trim());
    }
  });
}

/**
 * Render a compact model picker: a single select, plus an inline text input
 * that only appears when the user picks "Custom…". Callers render their own
 * label and tooltip (via the existing `addTooltip` pattern) — this component
 * only owns the control widgets.
 *
 * For `adapter: "pi"` the alias groups are DYNAMIC: the union of Anthropic and
 * OpenAI models Pi's credential-gated catalog exposes on this machine
 * (§10.3 of PI_HARNESS_FEASIBILITY.md), loaded async via `loadPiModels`.
 */
export function renderModelPicker(container: HTMLElement, props: ModelPickerProps): void {
  container.empty();
  container.addClass("af-model-picker");

  if (isPiAdapter(props.adapter)) {
    renderPiModelPicker(container, props);
    return;
  }

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
        ? "e.g. gpt-5.6-terra  ·  gpt-5.6-luna"
        : "e.g. claude-opus-5  ·  claude-sonnet-5  ·  us.anthropic.claude-opus-5",
      spellcheck: "false",
    },
  });

  // Retired/deprecated slug warning. Lives below the control so it shows for
  // both the alias list and free text, and updates as the user types.
  const notice = container.createDiv({ cls: "af-mp-retired-notice" });
  const syncNotice = (value: string): void => {
    const text = retiredModelNotice(value);
    notice.setText(text ?? "");
    notice.setCssStyles({ display: text ? "" : "none" });
  };

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
  syncNotice(props.value);

  wireCustomModelInput(select, customInput, syncNotice, props.onChange);
}

/**
 * Pi variant: Default + two dynamic vendor groups + Custom. Renders
 * immediately with the saved value selectable, then fills the groups when the
 * catalog arrives. An unavailable catalog (Pi missing, no providers
 * authenticated) degrades to free text with a connect hint — the form never
 * blocks on discovery.
 */
function renderPiModelPicker(container: HTMLElement, props: ModelPickerProps): void {
  const saved = props.value.trim();
  const select = container.createEl("select", { cls: "af-form-select af-mp-select" });
  const inheritLabel = props.allowInherit
    ? (props.inheritPlaceholder ?? "Inherit from agent")
    : "Default (let Pi pick)";
  select.createEl("option", { text: inheritLabel, attr: { value: "" } });

  // The saved value stays selectable before (and independent of) discovery, so
  // opening the form never silently reclassifies an existing agent's model.
  let savedOption: HTMLOptionElement | null = null;
  if (saved && saved !== "default" && saved !== "subscription") {
    savedOption = select.createEl("option", { text: saved, attr: { value: saved } });
  }
  select.createEl("option", { text: "Custom…", attr: { value: CUSTOM_SENTINEL } });

  const customInput = container.createEl("input", {
    cls: "af-form-input af-mp-custom-input",
    attr: {
      type: "text",
      placeholder: "e.g. anthropic/claude-opus-5  ·  openai-codex/gpt-5.6-terra  ·  opus",
      spellcheck: "false",
    },
  });
  // Prefill with the saved value: picking Custom… means "tweak this", and the
  // sentinel's change event emits the input's content — an empty input would
  // silently wipe the saved model (warn-never-rewrite applies here too).
  if (saved && saved !== "default" && saved !== "subscription") {
    customInput.value = saved;
  }
  customInput.setCssStyles({ display: "none" });

  // Shared strip for the retired-model warning and the connect hint. Retired
  // slugs are just as reachable through Pi as through Codex, so the
  // warn-never-rewrite notice applies here too.
  const hint = container.createDiv({ cls: "af-mp-retired-notice" });
  let connectHint = "";
  const syncHint = (value: string): void => {
    const retired = retiredModelNotice(value);
    const text = [retired, connectHint].filter(Boolean).join(" ");
    hint.setText(text);
    hint.setCssStyles({ display: text ? "" : "none" });
  };

  if (saved && saved !== "default" && saved !== "subscription") {
    select.value = saved;
  } else {
    select.value = "";
  }
  syncHint(saved);

  wireCustomModelInput(select, customInput, syncHint, props.onChange);

  if (!props.loadPiModels) return;

  void props.loadPiModels().then((catalog) => {
    // The form may have re-rendered while discovery ran — never touch a
    // detached select.
    if (!select.isConnected) return;

    if (catalog.unavailable) {
      connectHint =
        "No models listed — connect a provider by running `pi` in a terminal and using /login " +
        "(Claude Pro/Max or ChatGPT), or type a model manually via Custom…";
      syncHint(select.value === CUSTOM_SENTINEL ? customInput.value : select.value);
      return;
    }

    const insertBefore = select.querySelector(`option[value="${CUSTOM_SENTINEL}"]`);
    const addGroup = (label: string, entries: PiModelCatalog["anthropic"]) => {
      if (entries.length === 0) return;
      const group = select.createEl("optgroup", { attr: { label } });
      for (const entry of entries) {
        group.createEl("option", {
          text: entry.context ? `${entry.id} — ${entry.context} context` : entry.id,
          attr: { value: entry.value },
        });
      }
      // createEl appends; reposition the group above the Custom… option.
      select.insertBefore(group, insertBefore);
    };
    addGroup("Anthropic", catalog.anthropic);
    addGroup("OpenAI", catalog.openai);

    // If the saved value IS a discovered entry (exact provider/id form), the
    // placeholder option is now a duplicate — drop it regardless of what's
    // currently selected, folding the selection onto the catalog entry when
    // the placeholder held it. A bare saved value ("opus") stays on its own
    // option untouched: warn-never-rewrite applies to model values.
    const all = [...catalog.anthropic, ...catalog.openai];
    const exact = all.find((e) => e.value === saved);
    if (exact && savedOption) {
      const wasSelected = select.value === saved;
      savedOption.remove();
      savedOption = null;
      if (wasSelected) select.value = exact.value;
    }
  });
}
