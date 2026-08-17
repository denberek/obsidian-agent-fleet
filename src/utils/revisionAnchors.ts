/**
 * Pure anchor utilities for Revision mode (REVISION_MODE_DESIGN.md §9).
 *
 * Everything here is deterministic and free of Obsidian, CodeMirror, and UI
 * dependencies: anchors are plain offsets plus quoted context, and resolution
 * takes the raw source string. CodeMirror-specific adaptation lives in the
 * editor extension — it only has to hand us something with `mapPos()`.
 *
 * The guiding rule from the spec: never silently attach a note to a
 * low-confidence candidate. When the passage cannot be located with confidence
 * the note is orphaned and the UI asks the user to reattach or delete it.
 */
import { createHash } from "crypto";
import type { RevisionAnchor, RevisionDraft, RevisionNote } from "../types";

/**
 * Safety limits for the whole revision domain, in one place so the store,
 * the prompt builder, and the UI cannot drift apart. These are guardrails,
 * not normal UX targets (§6.4).
 */
export const REVISION_LIMITS = {
  /** Characters of raw markdown a single selection may cover. */
  selectionChars: 250_000,
  /** Characters a single note comment may contain. */
  commentChars: 10_000,
  /** Notes allowed in one draft. */
  notesPerDraft: 100,
  /** Characters of context stored on each side of a range. */
  anchorContextChars: 128,
  /** Quote excerpt cap in the CLI-only full prompt (§9.5). */
  promptQuoteChars: 2_000,
  /** Quote preview cap in the user-visible chat message (§12.2). */
  displayQuoteChars: 240,
} as const;

/**
 * Minimum extra context characters the best duplicate-match candidate must
 * beat the runner-up by before it counts as a "clear winner" (§9.3 step 3).
 * Below this margin the note is orphaned rather than guessed at.
 */
const CONTEXT_WIN_MARGIN = 8;

/**
 * Minimum stored prefix/suffix length required for boundary recovery
 * (§9.3 step 4). Short context is far too easy to match by accident.
 */
const MIN_BOUNDARY_CONTEXT = 24;

/** How an anchor was located against the current source. */
export type AnchorResolutionMethod =
  | "offset"
  | "exact"
  | "context"
  | "boundary"
  | "orphan";

export interface AnchorResolution {
  /** Refreshed anchor, or the untouched input anchor when orphaned. */
  anchor: RevisionAnchor;
  method: AnchorResolutionMethod;
  orphaned: boolean;
}

/** Anything that can map a document position across a change set. CodeMirror's
 *  `ChangeDesc` satisfies this structurally, so the editor extension can pass
 *  one straight in without this module importing CodeMirror. */
export interface AnchorPositionMapper {
  mapPos(pos: number, assoc: -1 | 1): number;
}

export interface AnchorMapResult {
  anchor: RevisionAnchor;
  /** True when the mapped range collapsed because its content was deleted. */
  orphaned: boolean;
}

export interface RevisionDraftResolution {
  /** A new draft object; the input is never mutated. */
  draft: RevisionDraft;
  /** True when any note's anchor or orphan flag changed. */
  changed: boolean;
  orphanedNoteIds: string[];
}

/** Location metadata derived at submission time (§9.5). Lines are 1-based and
 *  inclusive; `heading` is the nearest preceding ATX heading, if any. */
export interface AnchorLocation {
  startLine: number;
  endLine: number;
  heading?: string;
}

/** SHA-256 of the exact selected text, hex encoded. */
export function hashAnchorText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function clampOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.trunc(value);
  if (rounded < 0) return 0;
  return rounded > length ? length : rounded;
}

/** Build the prefix/suffix/hash fields for a `[from, to)` range in `source`. */
function contextFor(source: string, from: number, to: number): Omit<RevisionAnchor, "from" | "to"> {
  const exact = source.slice(from, to);
  return {
    exact,
    prefix: source.slice(Math.max(0, from - REVISION_LIMITS.anchorContextChars), from),
    suffix: source.slice(to, to + REVISION_LIMITS.anchorContextChars),
    exactHash: hashAnchorText(exact),
  };
}

/**
 * Create an anchor from a live selection. Rejects the ranges §6.4 forbids —
 * empty/whitespace-only selections and selections over the size cap — with
 * actionable messages the UI can surface verbatim.
 */
export function createAnchor(source: string, from: number, to: number): RevisionAnchor {
  const start = clampOffset(Math.min(from, to), source.length);
  const end = clampOffset(Math.max(from, to), source.length);
  const exact = source.slice(start, end);
  if (!exact.trim()) {
    throw new Error("Select some text before adding a revision note.");
  }
  if (exact.length > REVISION_LIMITS.selectionChars) {
    throw new Error(
      `Selection is too large (${exact.length.toLocaleString()} characters). ` +
        `Select at most ${REVISION_LIMITS.selectionChars.toLocaleString()} characters.`,
    );
  }
  return { from: start, to: end, ...contextFor(source, start, end) };
}

/** Refresh an existing anchor's quoted context against `source` without moving
 *  its offsets. Used after a local edit inside the range. */
export function refreshAnchor(anchor: RevisionAnchor, source: string): RevisionAnchor {
  const from = clampOffset(anchor.from, source.length);
  const to = clampOffset(Math.max(anchor.from, anchor.to), source.length);
  return { from, to, ...contextFor(source, from, to) };
}

/**
 * Map one anchor through an editor change set and refresh its quoted context
 * from the resulting document (§9.2). A range whose content was entirely
 * deleted collapses and is reported orphaned.
 */
export function mapAnchor(
  anchor: RevisionAnchor,
  mapper: AnchorPositionMapper,
  nextSource: string,
): AnchorMapResult {
  const from = clampOffset(mapper.mapPos(anchor.from, -1), nextSource.length);
  const rawTo = clampOffset(mapper.mapPos(anchor.to, 1), nextSource.length);
  const to = Math.max(from, rawTo);
  if (to <= from) {
    return { anchor: { ...anchor }, orphaned: true };
  }
  return { anchor: { from, to, ...contextFor(nextSource, from, to) }, orphaned: false };
}

/** Map every note in a draft through one change set. Returns a new draft. */
export function mapDraftAnchors(
  draft: RevisionDraft,
  mapper: AnchorPositionMapper,
  nextSource: string,
): RevisionDraftResolution {
  return applyNoteResults(
    draft,
    draft.notes.map((note) => {
      const mapped = mapAnchor(note.anchor, mapper, nextSource);
      return { note, anchor: mapped.anchor, orphaned: mapped.orphaned };
    }),
  );
}

/** Every start index of `needle` in `haystack` (overlapping matches included). */
function allIndexesOf(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    out.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return out;
}

/** Length of the longest common suffix of `a` and `b`. */
function commonSuffixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let count = 0;
  while (count < max && a[a.length - 1 - count] === b[b.length - 1 - count]) count += 1;
  return count;
}

/** Length of the longest common prefix of `a` and `b`. */
function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let count = 0;
  while (count < max && a[count] === b[count]) count += 1;
  return count;
}

/** Context score for a candidate occurrence: how much of the stored prefix and
 *  suffix still surrounds it. */
function contextScore(anchor: RevisionAnchor, source: string, start: number, end: number): number {
  const before = source.slice(Math.max(0, start - anchor.prefix.length), start);
  const after = source.slice(end, end + anchor.suffix.length);
  return commonSuffixLength(anchor.prefix, before) + commonPrefixLength(anchor.suffix, after);
}

function orphan(anchor: RevisionAnchor): AnchorResolution {
  return { anchor: { ...anchor }, method: "orphan", orphaned: true };
}

function resolved(
  source: string,
  from: number,
  to: number,
  method: AnchorResolutionMethod,
): AnchorResolution {
  return { anchor: { from, to, ...contextFor(source, from, to) }, method, orphaned: false };
}

/**
 * Re-resolve one anchor against a fresh copy of the source (§9.3). Resolution
 * order is strict: stored offsets, unique exact match, prefix/suffix-scored
 * duplicate with a clear winner, boundary recovery for very broad selections,
 * then orphan.
 */
export function resolveAnchor(anchor: RevisionAnchor, source: string): AnchorResolution {
  if (!anchor.exact) return orphan(anchor);

  // 1. Stored offsets still hold the same text. Comparing the slice to `exact`
  //    is equivalent to the spec's hash check and short-circuits on the first
  //    differing character, so it is never slower.
  const from = anchor.from;
  const to = anchor.to;
  if (
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    from >= 0 &&
    to > from &&
    to <= source.length &&
    source.slice(from, to) === anchor.exact
  ) {
    return resolved(source, from, to, "offset");
  }

  const matches = allIndexesOf(source, anchor.exact);

  // 2. Unique exact match anywhere in the document.
  if (matches.length === 1) {
    const start = matches[0] ?? 0;
    return resolved(source, start, start + anchor.exact.length, "exact");
  }

  // 3. Duplicates — only a clear prefix/suffix winner is accepted.
  if (matches.length > 1) {
    let best = -1;
    let bestScore = -1;
    let runnerUpScore = -1;
    for (const start of matches) {
      const score = contextScore(anchor, source, start, start + anchor.exact.length);
      if (score > bestScore) {
        runnerUpScore = bestScore;
        bestScore = score;
        best = start;
      } else if (score > runnerUpScore) {
        runnerUpScore = score;
      }
    }
    if (best >= 0 && bestScore > 0 && bestScore - runnerUpScore >= CONTEXT_WIN_MARGIN) {
      return resolved(source, best, best + anchor.exact.length, "context");
    }
    return orphan(anchor);
  }

  // 4. Boundary recovery: the selection itself changed, but a long unique
  //    prefix and suffix still bracket it in the right order.
  if (
    anchor.prefix.length >= MIN_BOUNDARY_CONTEXT &&
    anchor.suffix.length >= MIN_BOUNDARY_CONTEXT
  ) {
    const prefixMatches = allIndexesOf(source, anchor.prefix);
    const suffixMatches = allIndexesOf(source, anchor.suffix);
    if (prefixMatches.length === 1 && suffixMatches.length === 1) {
      const start = (prefixMatches[0] ?? 0) + anchor.prefix.length;
      const end = suffixMatches[0] ?? 0;
      if (end > start) {
        return resolved(source, start, end, "boundary");
      }
    }
  }

  return orphan(anchor);
}

interface NoteResult {
  note: RevisionNote;
  anchor: RevisionAnchor;
  orphaned: boolean;
}

/** Rebuild a draft from per-note anchor results without mutating the input. */
function applyNoteResults(draft: RevisionDraft, results: NoteResult[]): RevisionDraftResolution {
  const orphanedNoteIds: string[] = [];
  let changed = false;
  const notes = results.map(({ note, anchor, orphaned }) => {
    if (orphaned) orphanedNoteIds.push(note.id);
    const wasOrphaned = note.orphaned === true;
    if (
      wasOrphaned !== orphaned ||
      note.anchor.from !== anchor.from ||
      note.anchor.to !== anchor.to ||
      note.anchor.exactHash !== anchor.exactHash ||
      note.anchor.prefix !== anchor.prefix ||
      note.anchor.suffix !== anchor.suffix
    ) {
      changed = true;
    }
    const next: RevisionNote = { ...note, anchor };
    if (orphaned) next.orphaned = true;
    else delete next.orphaned;
    return next;
  });
  return { draft: { ...draft, notes }, changed, orphanedNoteIds };
}

/**
 * Re-resolve every note in a draft against fresh source. Used after external
 * vault changes and on reload; the input draft is never mutated.
 */
export function resolveDraftAnchors(draft: RevisionDraft, source: string): RevisionDraftResolution {
  return applyNoteResults(
    draft,
    draft.notes.map((note) => {
      const resolution = resolveAnchor(note.anchor, source);
      return { note, anchor: resolution.anchor, orphaned: resolution.orphaned };
    }),
  );
}

/** True when a fence marker opens/closes a fenced code block. */
function isFenceLine(line: string): boolean {
  return /^\s{0,3}(```|~~~)/.test(line);
}

/**
 * Derive 1-based inclusive line numbers and the nearest preceding markdown
 * heading for a range. Headings inside fenced code blocks are ignored so a
 * `# comment` in a shell snippet cannot be reported as a section.
 *
 * Offsets are raw character offsets, so CRLF documents count the `\r` as part
 * of the preceding line — the line numbers stay correct either way.
 */
export function anchorLocation(anchor: RevisionAnchor, source: string): AnchorLocation {
  const start = clampOffset(anchor.from, source.length);
  const end = clampOffset(Math.max(anchor.from, anchor.to), source.length);

  let line = 1;
  let heading: string | undefined;
  let inFence = false;
  let lineStart = 0;
  let startLine = 1;
  let endLine = 1;
  let seenStart = false;

  const finishLine = (text: string): void => {
    if (isFenceLine(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = text.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (match && lineStart <= start) {
      heading = (match[2] ?? "").trim() || heading;
    }
  };

  for (let i = 0; i <= source.length; i += 1) {
    if (!seenStart && i === start) {
      startLine = line;
      seenStart = true;
    }
    if (i === end) {
      endLine = line;
    }
    if (i === source.length) break;
    if (source[i] === "\n") {
      finishLine(source.slice(lineStart, i).replace(/\r$/, ""));
      line += 1;
      lineStart = i + 1;
    }
  }
  finishLine(source.slice(lineStart).replace(/\r$/, ""));
  if (!seenStart) startLine = line;

  // A range ending exactly on a newline reads better as the previous line.
  if (endLine > startLine && end > start && source[end - 1] === "\n") {
    endLine -= 1;
  }
  return heading === undefined ? { startLine, endLine } : { startLine, endLine, heading };
}
