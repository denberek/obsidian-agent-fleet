// Pure (Obsidian-free except the markdown frontmatter helper) parsing and
// serialization for the structured v2 working-memory file. See
// MEMORY_EVOLUTION_DESIGN.md §6.2. Kept side-effect-free so it is trivially
// unit-testable.
import type { AgentConfig, MemoryEntry, MemorySection, MemorySectionName, WorkingMemory } from "../types";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter } from "./markdown";

export const MEMORY_SCHEMA_VERSION = 2;

/** Canonical section order, most-protected → least-protected (§6.2). */
export const MEMORY_SECTION_ORDER: MemorySectionName[] = [
  "Preferences",
  "Procedures",
  "Observations",
  "Recent",
];

/** The section inline captures land in until reflection re-files them. */
export const CAPTURE_SECTION: MemorySectionName = "Recent";

/** A single thing to remember, post-extraction (shared by MemoryWriter and the
 *  tag/tool extractors). */
export interface CaptureEntry {
  text: string;
  pinned?: boolean;
  /** Override target section; defaults to the uncurated capture section. */
  section?: MemorySectionName;
}

const REMEMBER_BLOCK_RE = /\[REMEMBER(?::([a-zA-Z]+))?\]([\s\S]*?)\[\/REMEMBER\]/g;

/** Map an optional `[REMEMBER:<type>]` qualifier to routing. */
function captureTypeToRouting(type: string | undefined): { pinned: boolean; section?: MemorySectionName } {
  switch ((type ?? "").toLowerCase()) {
    case "pin":
    case "preference":
    case "preferences":
      return { pinned: true, section: "Preferences" };
    case "procedure":
    case "procedures":
      return { pinned: false, section: "Procedures" };
    case "observation":
    case "observations":
      return { pinned: false, section: "Observations" };
    default:
      return { pinned: false };
  }
}

/** Extract `[REMEMBER]` / `[REMEMBER:type]` blocks into capture entries. */
export function extractCaptures(output: string): CaptureEntry[] {
  const out: CaptureEntry[] = [];
  for (const m of output.matchAll(REMEMBER_BLOCK_RE)) {
    const text = (m[2] ?? "").trim();
    if (!text) continue;
    const routing = captureTypeToRouting(m[1]);
    out.push({ text, pinned: routing.pinned, section: routing.section });
  }
  return out;
}

/** Remove `[REMEMBER...]...[/REMEMBER]` blocks from agent output for display
 *  and persistence. Collapses the whitespace the removal leaves behind. */
export function stripRememberTags(output: string): string {
  return output
    .replace(REMEMBER_BLOCK_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Incremental-safe redaction for the LIVE streaming chat display: removes
 * complete `[REMEMBER]` blocks and HOLDS BACK any trailing partial/unclosed tag
 * so the raw tag never flashes on screen mid-stream. Unlike {@link stripRememberTags}
 * it does NOT trim or collapse whitespace, so as more text streams in the result
 * only ever grows — callers can safely emit the delta against what they showed
 * before. (The persisted message still uses stripRememberTags.)
 */
export function redactRememberForDisplay(raw: string): string {
  const s = raw.replace(REMEMBER_BLOCK_RE, "");
  // Hold everything from an unclosed open tag (`[REMEMBER]` / `[REMEMBER:pin]`
  // with no closing tag yet).
  const open = s.match(/\[REMEMBER(?::[a-zA-Z]+)?\][\s\S]*$/i);
  if (open && open.index !== undefined) return s.slice(0, open.index);
  // Else hold a trailing partial of the opener: `[`, `[R`, … `[REMEMBER`, and
  // the typed form mid-stream (`[REMEMBER:`, `[REMEMBER:pi`).
  const partial = s.match(/\[(?:R(?:E(?:M(?:E(?:M(?:B(?:E(?:R(?::[a-zA-Z]*)?)?)?)?)?)?)?)?)?$/i);
  if (partial && partial.index !== undefined) return s.slice(0, partial.index);
  return s;
}

/** Heading shown for the `Recent` section in the file (kept verbose on disk
 *  to signal it is uncurated; parsing normalizes either spelling back). */
const SECTION_HEADINGS: Record<MemorySectionName, string> = {
  Preferences: "Preferences",
  Procedures: "Procedures",
  Observations: "Observations",
  Recent: "Recent (uncurated)",
};

function normalizeSectionName(heading: string): MemorySectionName {
  const h = heading.trim().toLowerCase();
  if (h.startsWith("preference")) return "Preferences";
  if (h.startsWith("procedure")) return "Procedures";
  if (h.startsWith("observation")) return "Observations";
  if (h.startsWith("recent")) return "Recent";
  // Legacy "Learned Context" and anything unknown fold into Observations.
  return "Observations";
}

/** Rough token estimate — ~4 chars/token. Good enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Max characters for a single captured fact. Working-memory entries are meant
 *  to be one concise line; this stops a model from dumping prose/narration that
 *  would blow the token budget or break the single-line bullet format. */
export const MAX_CAPTURE_CHARS = 500;

/**
 * Sanitize a model-supplied fact before it enters memory. Collapses ALL
 * whitespace (incl. newlines) to single spaces — so it can't break the
 * one-entry-per-line bullet/raw format — and caps the length. The capture layer
 * trusts the model, so this is the single hygiene boundary for every channel
 * (text tag, MCP tool, drain). Returns "" for empty/whitespace input.
 */
export function sanitizeFactText(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_CAPTURE_CHARS) return oneLine;
  return `${oneLine.slice(0, MAX_CAPTURE_CHARS - 1).trimEnd()}…`;
}

function isMemorySectionName(value: unknown): value is MemorySectionName {
  return (
    value === "Preferences" ||
    value === "Procedures" ||
    value === "Observations" ||
    value === "Recent"
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Build a fresh, empty working-memory object. */
export function emptyWorkingMemory(filePath: string, agent: string): WorkingMemory {
  return {
    filePath,
    agent,
    schema: MEMORY_SCHEMA_VERSION,
    tokenEstimate: 0,
    sections: [],
  };
}

// ─── Entry line parsing/serialization ───
// Line shape: `- [pin] <text> <!-- src:<source> <date> -->`
//   - `[pin] ` prefix present only when pinned
//   - trailing comment present only when source and/or date is known

const ENTRY_COMMENT_RE = /\s*<!--\s*([\s\S]*?)\s*-->\s*$/;
const PIN_PREFIX_RE = /^\[pin\]\s+/i;

function parseEntryLine(raw: string): MemoryEntry | null {
  const m = raw.match(/^[-*]\s+(.*)$/);
  if (!m) return null;
  let rest = (m[1] ?? "").trim();
  if (!rest) return null;

  let source: string | undefined;
  let date: string | undefined;
  const comment = rest.match(ENTRY_COMMENT_RE);
  if (comment) {
    rest = rest.slice(0, comment.index).trim();
    const inner = (comment[1] ?? "").trim();
    const srcMatch = inner.match(/^src:(\S+)(?:\s+(.+))?$/);
    if (srcMatch) {
      source = srcMatch[1];
      date = srcMatch[2]?.trim() || undefined;
    } else if (inner) {
      date = inner;
    }
  }

  let pinned = false;
  if (PIN_PREFIX_RE.test(rest)) {
    pinned = true;
    rest = rest.replace(PIN_PREFIX_RE, "").trim();
  }
  if (!rest) return null;
  return { text: rest, source, date, pinned };
}

export function serializeEntryLine(entry: MemoryEntry): string {
  const prefix = entry.pinned ? "[pin] " : "";
  let comment = "";
  if (entry.source || entry.date) {
    const parts: string[] = [];
    if (entry.source) parts.push(`src:${entry.source}`);
    if (entry.date) parts.push(entry.date);
    comment = ` <!-- ${parts.join(" ")} -->`;
  }
  return `- ${prefix}${entry.text}${comment}`;
}

/** Render just the section bodies (no frontmatter) — used for prompt injection
 *  and token estimation. Empty sections are skipped. */
export function renderSections(sections: MemorySection[]): string {
  const ordered = orderedNonEmpty(sections);
  return ordered
    .map((s) => {
      const lines = s.entries.map(serializeEntryLine).join("\n");
      return `## ${SECTION_HEADINGS[s.name]}\n${lines}`;
    })
    .join("\n\n");
}

function orderedNonEmpty(sections: MemorySection[]): MemorySection[] {
  const out: MemorySection[] = [];
  for (const name of MEMORY_SECTION_ORDER) {
    const sec = sections.find((s) => s.name === name);
    if (sec && sec.entries.length > 0) out.push(sec);
  }
  return out;
}

export function parseWorkingMemory(
  content: string,
  filePath: string,
  agentFallback: string,
): WorkingMemory {
  const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
  const sections = parseSectionsFromBody(body);
  return {
    filePath,
    agent: asString(frontmatter.agent) ?? agentFallback,
    schema: asNumber(frontmatter.schema, MEMORY_SCHEMA_VERSION),
    lastUpdated: asString(frontmatter.last_updated),
    lastReflection: asString(frontmatter.last_reflection),
    tokenEstimate: estimateTokens(renderSections(sections)),
    sections,
  };
}

/** Parse section bodies. Lines outside any heading (or under a legacy heading)
 *  fold into Observations. */
export function parseSectionsFromBody(body: string): MemorySection[] {
  const byName = new Map<MemorySectionName, MemoryEntry[]>();
  const push = (name: MemorySectionName, entry: MemoryEntry): void => {
    const list = byName.get(name) ?? [];
    list.push(entry);
    byName.set(name, list);
  };

  let current: MemorySectionName = "Observations";
  for (const line of body.split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      current = normalizeSectionName(heading[1] ?? "");
      continue;
    }
    const entry = parseEntryLine(line);
    if (entry) push(current, entry);
  }

  const sections: MemorySection[] = [];
  for (const name of MEMORY_SECTION_ORDER) {
    const entries = byName.get(name);
    if (entries && entries.length) sections.push({ name, entries });
  }
  return sections;
}

export function serializeWorkingMemory(wm: WorkingMemory): string {
  const body = renderSections(wm.sections);
  const frontmatter: Record<string, unknown> = {
    agent: wm.agent,
    schema: wm.schema || MEMORY_SCHEMA_VERSION,
    last_updated: wm.lastUpdated ?? "",
    token_estimate: estimateTokens(body),
  };
  if (wm.lastReflection) frontmatter.last_reflection = wm.lastReflection;
  return stringifyMarkdownWithFrontmatter(frontmatter, body || "## Observations");
}

/** Return a NEW working-memory object with `entries` appended to `section`.
 *  Recomputes the token estimate. Pure — does not mutate the input. */
export function appendEntries(
  wm: WorkingMemory,
  entries: MemoryEntry[],
  section: MemorySectionName,
  nowIso?: string,
): WorkingMemory {
  if (entries.length === 0) return wm;
  const sections = wm.sections.map((s) => ({ name: s.name, entries: [...s.entries] }));
  let target = sections.find((s) => s.name === section);
  if (!target) {
    target = { name: section, entries: [] };
    sections.push(target);
  }
  target.entries.push(...entries);
  const next: WorkingMemory = {
    ...wm,
    sections,
    lastUpdated: nowIso ?? wm.lastUpdated,
    tokenEstimate: estimateTokens(renderSections(sections)),
  };
  return next;
}

/** Sections eligible for mid-day spill, least-protected first. `Preferences`
 *  is never spilled. (§7.4) */
const SPILL_ORDER: MemorySectionName[] = ["Recent", "Observations", "Procedures"];

/**
 * Mid-day safety valve (§7.4). Trim working memory back under `hardCapTokens` by
 * dropping the oldest NON-PINNED entries from the least-protected sections
 * first. The dropped entries are returned (they remain in the raw archive).
 * Pure — returns a new working-memory object.
 */
export function enforceHardCap(
  wm: WorkingMemory,
  hardCapTokens: number,
): { wm: WorkingMemory; spilled: MemoryEntry[] } {
  if (wm.tokenEstimate <= hardCapTokens) return { wm, spilled: [] };
  const sections = wm.sections.map((s) => ({ name: s.name, entries: [...s.entries] }));
  const spilled: MemoryEntry[] = [];

  // Track the rendered length with a running counter instead of re-rendering the
  // whole memory on every removal (was O(n²)). We subtract only each dropped
  // line's own length, so when a section empties and its heading/joins also
  // disappear the counter slightly OVER-estimates what remains — which is safe:
  // it can only make us spill a touch more, never stop early above the cap. The
  // exact estimate is recomputed once at the end.
  let chars = renderSections(sections).length;
  const overCap = (): boolean => Math.ceil(chars / 4) > hardCapTokens;

  for (const name of SPILL_ORDER) {
    if (!overCap()) break;
    const sec = sections.find((s) => s.name === name);
    if (!sec) continue;
    // Drop oldest (front) non-pinned entries first.
    while (sec.entries.length > 0 && overCap()) {
      const idx = sec.entries.findIndex((e) => !e.pinned);
      if (idx === -1) break;
      const removed = sec.entries.splice(idx, 1)[0];
      if (removed) {
        spilled.push(removed);
        chars -= serializeEntryLine(removed).length + 1; // line + its newline
      }
    }
  }

  const pruned = sections.filter((s) => s.entries.length > 0);
  return {
    wm: { ...wm, sections: pruned, tokenEstimate: estimateTokens(renderSections(pruned)) },
    spilled,
  };
}

/** Migrate a legacy flat `## Learned Context` body into a v2 working memory. */
export function migrateLegacyBody(
  legacyBody: string,
  filePath: string,
  agent: string,
  nowIso?: string,
): WorkingMemory {
  const sections = parseSectionsFromBody(legacyBody);
  return {
    filePath,
    agent,
    schema: MEMORY_SCHEMA_VERSION,
    lastUpdated: nowIso,
    tokenEstimate: estimateTokens(renderSections(sections)),
    sections,
  };
}

/**
 * Defense-in-depth for reflection (§8.3): ensure pinned `Preferences` from the
 * PREVIOUS working memory survive even if the model's consolidated output
 * forgot to re-emit them. Returns a new sections array with any missing pinned
 * preferences merged back into the Preferences section. Pure.
 */
export function carryForwardPinnedPreferences(
  prev: WorkingMemory | null,
  sections: MemorySection[],
): MemorySection[] {
  // Rescue pinned entries from ANY prior section (not just Preferences) — a pin
  // could have landed in Recent/Observations.
  const pins = (prev?.sections ?? [])
    .flatMap((s) => s.entries)
    .filter((e) => e.pinned);
  if (pins.length === 0) return sections;

  // The reflection model is explicitly instructed to preserve AND update pinned
  // facts, so a reworded/updated pin ("14 shortlists" → "24 shortlists") is the
  // model doing its job — not a drop. An earlier version re-added every prev pin
  // that wasn't byte-identical to the new output, which undid the model's
  // consolidation and piled up near-duplicate pins on every reflection. Instead,
  // trust the consolidated output whenever it contains ANY pinned entry, and only
  // rescue the previous pins when the reflection produced NONE at all — the real
  // signal that it dropped them rather than updating them.
  const newHasPins = sections.some((s) => s.entries.some((e) => e.pinned));
  if (newHasPins) return sections;

  const out = sections.map((s) => ({ name: s.name, entries: [...s.entries] }));
  let prefs = out.find((s) => s.name === "Preferences");
  if (!prefs) {
    prefs = { name: "Preferences", entries: [] };
    out.unshift(prefs);
  }
  prefs.entries.unshift(...pins);
  return out;
}

/** Runtime-owned capture instruction injected into every memory-enabled run
 *  (§7.0). Single source of truth — do not duplicate into agent files. Leads
 *  with the `remember` tool (the primary, reliable channel, §7.5) and keeps the
 *  [REMEMBER] text tag as an explicit fallback for when the tool isn't available
 *  (e.g. mobile, or a backend that didn't register it). */
export const MEMORY_CAPTURE_INSTRUCTION =
  "When you learn a durable fact about the user, their preferences, or how to do your " +
  "work better, save it to memory. Prefer the `remember` tool — call " +
  "remember(fact, pin?, section?); it is the reliable way to record a memory. If that tool " +
  "is not available, fall back to writing [REMEMBER] <one concise fact> [/REMEMBER] in your " +
  "reply (use [REMEMBER:pin] for standing preferences and hard constraints). Record only " +
  "durable, reusable facts — not transient task details. These notes persist into your future runs.";

/**
 * Build the `## Memory` prompt block: the capture instruction co-located with
 * the agent's current working memory (§7.0). Returns "" when memory is disabled.
 * Shared by both the task and chat prompt builders so the two cannot drift.
 */
export function buildMemorySection(agent: AgentConfig, wm: WorkingMemory | null): string {
  if (!agent.memory) return "";
  const learned = wm ? renderSections(wm.sections).trim() : "";
  const content = learned || "Nothing yet — this is a fresh agent.";
  return `## Memory\n${MEMORY_CAPTURE_INSTRUCTION}\n\n### What you've learned so far\n${content}`;
}

export { isMemorySectionName };
