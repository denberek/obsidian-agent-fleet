/**
 * Shared JSON-parsing helpers for the CLI adapters.
 *
 * Two distinct situations, two helpers:
 *
 *  - `tryParseJson` — per-line parsing of stream-json/JSONL output, where
 *    non-JSON lines are EXPECTED (CLI banners, verbose noise, progress text).
 *    Fails silently by design; warning per line would spam the console.
 *
 *  - `parseJsonLoud` / `warnJsonParseFailure` — for output that SHOULD be
 *    valid JSON (a whole-stdout result payload, or a stream that yielded no
 *    parseable event at all). Silence here hides real failures: the user sees
 *    "(no output)" with no clue that the CLI's output format drifted. These
 *    log a console.warn with the parse error and a preview of the offending
 *    text so version drift is debuggable.
 */

/** Parse a line that may or may not be JSON. Returns undefined on failure
 *  WITHOUT logging — non-JSON lines are expected between stream events. */
export function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const PREVIEW_LENGTH = 200;

/** Warn that output which should have contained JSON didn't parse, with a
 *  ~200-char preview of the offending text and the parse error (if any). */
export function warnJsonParseFailure(context: string, text: string, error?: unknown): void {
  const preview = text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
  const reason =
    error instanceof Error ? error.message : error !== undefined ? String(error) : "no parseable JSON found";
  console.warn(`Agent Fleet: ${context} — ${reason}. Output begins: ${preview}`);
}

/** Parse JSON that is expected to be valid (e.g. a whole-stdout result
 *  payload). Logs a console.warn via `warnJsonParseFailure` on failure and
 *  returns undefined so callers keep their existing fallback behavior. */
export function parseJsonLoud(context: string, text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    warnJsonParseFailure(context, text, err);
    return undefined;
  }
}
