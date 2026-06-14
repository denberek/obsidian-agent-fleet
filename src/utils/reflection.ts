// Pure parsing + merge logic for the nightly reflection ("dreaming") pass.
// See MEMORY_EVOLUTION_DESIGN.md §8–§9. Side-effect-free for easy testing.
import type { MemorySection, SkillCandidate } from "../types";
import { parseSectionsFromBody } from "./memoryFormat";
import { slugify } from "./markdown";

/** Stable key from arbitrary text; falls back to a generic key when empty. */
function slugifyKey(text: string): string {
  return slugify(text).slice(0, 60) || "candidate";
}

export interface ReflectionPromptInput {
  agentName: string;
  /** Rendered current working memory (section markdown), may be empty. */
  workingMemoryBody: string;
  /** Recent raw archive content (ground truth). */
  recentRaw: string;
  /** Optional summary of recent run/chat transcripts. */
  recentRunsSummary?: string;
  /** Steady-state token budget the consolidated memory should fit. */
  tokenBudget: number;
}

/** Build the nightly reflection ("dreaming") prompt (§8.3, §16). The agent must
 *  reply with exactly two fenced blocks: ```memory and ```candidates. */
export function buildReflectionPrompt(input: ReflectionPromptInput): string {
  const charBudget = Math.max(400, input.tokenBudget * 4);
  return [
    `You are running a nightly memory **reflection** for the agent "${input.agentName}".`,
    "Review the raw memory log and your current working memory below, then produce an",
    "updated, consolidated working memory.",
    "",
    "Rules:",
    "- Remove duplicates; resolve contradictions in favor of the NEWEST fact.",
    "- File each fact under exactly one of: Preferences, Procedures, Observations.",
    "- Keep durable user/process preferences, marking them `[pin]` — never drop or",
    "  summarize pinned Preferences.",
    "- Summarize the Observations section FROM THE RAW LOG (not from prior summaries)",
    `  if needed so the whole memory fits within roughly ${input.tokenBudget} tokens`,
    `  (~${charBudget} characters).`,
    "- Note any friction that recurred across multiple runs as a skill candidate.",
    "",
    "Reply with EXACTLY these two fenced blocks and nothing else:",
    "",
    "```memory",
    "## Preferences",
    "- [pin] <durable preference> <!-- src:reflection -->",
    "## Procedures",
    "- <how-to learning>",
    "## Observations",
    "- <current fact>",
    "```",
    "",
    "```candidates",
    '[{"key":"short-stable-key","pattern":"what recurred","evidence":["runs/..."],"suggestedSkill":"optional-name"}]',
    "```",
    "",
    "If there is nothing worth remembering, still emit a `memory` block preserving the",
    "existing pinned Preferences. Use an empty array `[]` for candidates when none.",
    "",
    "── CURRENT WORKING MEMORY ──",
    input.workingMemoryBody.trim() || "(empty)",
    "",
    "── RAW MEMORY LOG (ground truth) ──",
    input.recentRaw.trim() || "(empty)",
    input.recentRunsSummary ? `\n── RECENT ACTIVITY ──\n${input.recentRunsSummary.trim()}` : "",
  ].join("\n");
}

/** A candidate emitted by a single reflection run (pre-merge). */
export interface EmittedCandidate {
  key: string;
  pattern: string;
  evidence?: string[];
  suggestedSkill?: string;
}

export interface ReflectionOutput {
  /** Consolidated working-memory sections, or null when the run produced no
   *  parseable `memory` block (→ leave previous working memory intact). */
  sections: MemorySection[] | null;
  candidates: EmittedCandidate[];
}

function extractFencedBlock(output: string, lang: string): string | null {
  // Match ```lang ... ```. A negative lookahead `(?![A-Za-z0-9-])` forces the
  // language token to END right after `lang`, so ```memorydump / ```memory-notes
  // do NOT masquerade as the ```memory block. The rest of the info-string line
  // (e.g. ```memory foo) is still tolerated.
  const re = new RegExp("```" + lang + "(?![A-Za-z0-9-])[^\\n]*\\n([\\s\\S]*?)```", "i");
  const m = output.match(re);
  return m ? (m[1] ?? "") : null;
}

/** Parse a reflection run's output into consolidated sections + candidates. */
export function parseReflectionOutput(output: string): ReflectionOutput {
  const memoryBlock = extractFencedBlock(output, "memory");
  const sections = memoryBlock !== null ? parseSectionsFromBody(memoryBlock) : null;

  let candidates: EmittedCandidate[] = [];
  const candBlock = extractFencedBlock(output, "candidates");
  if (candBlock !== null && candBlock.trim()) {
    try {
      const parsed = JSON.parse(candBlock.trim()) as unknown;
      if (Array.isArray(parsed)) {
        candidates = parsed
          .map((c) => normalizeEmitted(c))
          .filter((c): c is EmittedCandidate => c !== null);
      }
    } catch {
      // ignore malformed candidates block
    }
  }
  return { sections, candidates };
}

function normalizeEmitted(value: unknown): EmittedCandidate | null {
  if (typeof value !== "object" || value === null) return null;
  const rec = value as Record<string, unknown>;
  const pattern = typeof rec.pattern === "string" ? rec.pattern.trim() : "";
  if (!pattern) return null;
  const key =
    typeof rec.key === "string" && rec.key.trim() ? slugifyKey(rec.key) : slugifyKey(pattern);
  return {
    key,
    pattern,
    evidence: Array.isArray(rec.evidence) ? rec.evidence.filter((e): e is string => typeof e === "string") : [],
    suggestedSkill: typeof rec.suggestedSkill === "string" ? rec.suggestedSkill : undefined,
  };
}

/**
 * Merge a reflection's emitted candidates into the persisted ledger. Each key
 * seen this run increments its occurrence count (capped at +1 per run),
 * refreshes lastSeen, and unions evidence. New keys start at 1. Pure.
 */
export function mergeCandidates(
  existing: SkillCandidate[],
  emitted: EmittedCandidate[],
  nowIso: string,
): SkillCandidate[] {
  const byKey = new Map<string, SkillCandidate>();
  for (const c of existing) byKey.set(c.key, { ...c, evidence: [...c.evidence] });

  // Collapse emitted candidates that share a key WITHIN this run so one dream
  // counts as a single occurrence per key (§8.3 "+1 per run"), unioning their
  // evidence — otherwise two near-duplicate patterns slugging to the same key
  // would double-increment and trip the proposal threshold early.
  const collapsed = new Map<string, EmittedCandidate>();
  for (const e of emitted) {
    const prev = collapsed.get(e.key);
    if (prev) {
      prev.evidence = Array.from(new Set([...(prev.evidence ?? []), ...(e.evidence ?? [])]));
      if (e.suggestedSkill) prev.suggestedSkill = e.suggestedSkill;
    } else {
      collapsed.set(e.key, { ...e, evidence: [...(e.evidence ?? [])] });
    }
  }

  for (const e of collapsed.values()) {
    const prev = byKey.get(e.key);
    if (prev) {
      prev.occurrences += 1;
      prev.lastSeen = nowIso;
      prev.evidence = Array.from(new Set([...prev.evidence, ...(e.evidence ?? [])]));
      if (e.suggestedSkill) prev.suggestedSkill = e.suggestedSkill;
    } else {
      byKey.set(e.key, {
        key: e.key,
        pattern: e.pattern,
        occurrences: 1,
        firstSeen: nowIso,
        lastSeen: nowIso,
        evidence: [...(e.evidence ?? [])],
        proposed: false,
        suggestedSkill: e.suggestedSkill,
      });
    }
  }
  return [...byKey.values()];
}
