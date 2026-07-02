/**
 * Slack mrkdwn conversion + fence-aware chunking.
 *
 * Slack's `chat.postMessage` `text` field uses "mrkdwn", which is NOT the same as
 * CommonMark. The differences we care about:
 *   - Bold is `*bold*`, not `**bold**`
 *   - Italic is `_italic_` (both CommonMark and mrkdwn agree)
 *   - Links are `<url|label>`, not `[label](url)`
 *   - Headers are not supported — render as bold on their own line
 *   - Triple-backtick code blocks work the same, BUT any language tag is ignored
 *   - `<`, `>`, `&` must be escaped outside of code blocks
 *
 * See: https://api.slack.com/reference/surfaces/formatting
 */

const SLACK_TEXT_LIMIT = 3000; // practical single-message cap for mrkdwn `text`

/** Convert a subset of CommonMark to Slack mrkdwn, leaving code blocks untouched. */
export function markdownToMrkdwn(input: string): string {
  // Walk the string segmenting on triple-backtick fences. Code blocks pass through
  // verbatim (with the language tag stripped); everything else gets transformed.
  const segments = splitOnFences(input);
  const out: string[] = [];
  for (const segment of segments) {
    if (segment.kind === "code") {
      // Strip the opening language tag if present (```ts → ```) — Slack shows it as text.
      const stripped = segment.text.replace(/^```[^\n]*\n/, "```\n");
      out.push(stripped);
    } else {
      out.push(transformProse(segment.text));
    }
  }
  return out.join("");
}

interface Segment {
  kind: "prose" | "code";
  text: string;
}

/** Split text on triple-backtick fences. Returns alternating prose/code segments. */
function splitOnFences(input: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  let inFence = false;
  let start = 0;
  while (i < input.length) {
    if (input.startsWith("```", i)) {
      if (!inFence) {
        // Flush prose up to here.
        if (i > start) {
          segments.push({ kind: "prose", text: input.slice(start, i) });
        }
        start = i;
        inFence = true;
        i += 3;
      } else {
        i += 3;
        // Include the closing fence + trailing newline if present.
        if (input[i] === "\n") i += 1;
        segments.push({ kind: "code", text: input.slice(start, i) });
        start = i;
        inFence = false;
      }
    } else {
      i += 1;
    }
  }
  if (start < input.length) {
    segments.push({
      kind: inFence ? "code" : "prose",
      text: input.slice(start),
    });
  }
  return segments;
}

function transformProse(text: string): string {
  // Escape mrkdwn's reserved HTML-ish characters OUTSIDE of inline code spans.
  // We walk the prose, preserving inline code verbatim and transforming the rest.
  const parts = splitOnInlineCode(text);
  const transformed = parts.map((part) => {
    if (part.isCode) return part.text;
    let t = part.text;
    t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Links: [label](url) → <url|label>. Keep it conservative — only match the
    // tight common form, not nested brackets.
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => `<${url}|${label}>`);
    // Bold: **text** → *text*.
    t = t.replace(/\*\*([^*]+)\*\*/g, "*$1*");
    // Italic: CommonMark supports both _text_ and *text* for italic; mrkdwn uses _text_
    // exclusively. Leave `_text_` alone. Don't touch `*text*` because we just used it for bold.
    // Headers: leading # / ## / ### on a line → bold the content.
    t = t.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
    return t;
  });
  return transformed.join("");
}

interface InlinePart {
  text: string;
  isCode: boolean;
}

/** Split on single-backtick inline code spans. */
function splitOnInlineCode(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const regex = /`([^`\n]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index), isCode: false });
    }
    parts.push({ text: match[0], isCode: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), isCode: false });
  }
  return parts;
}

/**
 * Split a long string into chunks that respect:
 *   - A per-chunk character limit (default 3000, matching Slack's single-block text limit)
 *   - Triple-backtick fence boundaries — never break inside an open fence
 *   - Paragraph breaks (`\n\n`) as the preferred split point
 *   - Line breaks (`\n`) as the secondary split point
 *   - Hard character split as the last-resort fallback
 *
 * If a single paragraph including code blocks exceeds the limit, we fall back to hard
 * character splits and close any open fence explicitly to avoid breaking mrkdwn rendering.
 */
export function splitForTransport(text: string, limit: number = SLACK_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    // Track fence state within the slice.
    const openFence = countFences(slice) % 2 === 1;

    let cutAt: number;
    if (openFence) {
      // We'd break inside a code block. Find the last closing fence BEFORE the limit.
      const lastClose = findLastClosedFencePosition(slice);
      if (lastClose > 0) {
        cutAt = lastClose;
      } else {
        // No complete fenced block fits — hard split at the limit and close the fence.
        chunks.push(slice + "\n```");
        remaining = "```\n" + remaining.slice(limit);
        continue;
      }
    } else {
      // Prefer paragraph break, then line break, then hard.
      cutAt = slice.lastIndexOf("\n\n");
      if (cutAt < limit / 2) {
        // Paragraph break too early — try line break.
        const nl = slice.lastIndexOf("\n");
        if (nl > limit / 2) cutAt = nl;
        else cutAt = limit;
      }
      if (cutAt <= 0) cutAt = limit;
    }

    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).replace(/^\n+/, "");
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Plain chunker for transports that render standard markdown (Discord, Telegram):
 * prefer a paragraph break (`\n\n`), then a line break (`\n`), then a hard split
 * at the limit. Unlike `splitForTransport` it is NOT fence-aware — deliberately,
 * since these transports tolerate a fence broken across messages and the callers
 * relied on this exact cut behavior before extraction.
 */
export function splitText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cutAt = remaining.lastIndexOf("\n\n", limit);
    if (cutAt < limit / 2) cutAt = remaining.lastIndexOf("\n", limit);
    if (cutAt < limit / 2) cutAt = limit;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).replace(/^\n+/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** Count the number of triple-backtick occurrences in a string. */
function countFences(s: string): number {
  let n = 0;
  let i = 0;
  while ((i = s.indexOf("```", i)) !== -1) {
    n += 1;
    i += 3;
  }
  return n;
}

/** Find the character position in `s` just after the last CLOSED fence (i.e.,
 * the position where the number of fences seen so far is even). Returns 0 if
 * there is no closed fence before the end. */
function findLastClosedFencePosition(s: string): number {
  let fences = 0;
  let lastClosedEnd = 0;
  let i = 0;
  while (i < s.length) {
    const next = s.indexOf("```", i);
    if (next === -1) break;
    fences += 1;
    i = next + 3;
    if (fences % 2 === 0) {
      lastClosedEnd = i;
    }
  }
  return lastClosedEnd;
}
