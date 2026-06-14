/**
 * Parser for the dated lint reports that `wiki-lint` writes into a scope's
 * `log.md`. The skill emits sections under `## Lint YYYY-MM-DD` headings
 * inside the fenced `<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->`
 * block. This parser extracts the most recent report so the dashboard can
 * surface "Needs review" items as actionable cards.
 */

export interface LintReport {
  /** ISO date from the `## Lint YYYY-MM-DD` heading. */
  date: string;
  /** Bullets under the `### Summary` subheading. */
  summary: string[];
  /** Bullets under `### Auto-applied`. */
  autoApplied: string[];
  /** Bullets under `### Needs review` — what the dashboard surfaces. */
  needsReview: string[];
  /** Bullets under `### Refresh chained`, if present. */
  refreshChained: string[];
}

/**
 * Find the most recent `## Lint YYYY-MM-DD` block in the file content and
 * parse it. Returns null if no lint report is present.
 *
 * Robust to:
 * - Reports outside the wiki-keeper fenced block (older versions wrote there).
 * - Missing subsections (Auto-applied / Refresh chained are optional).
 * - User edits within Needs review (we keep whatever is on the bullet line).
 */
export function parseLatestLintReport(content: string): LintReport | null {
  const headingRe = /^##\s+Lint\s+(\d{4}-\d{2}-\d{2})\s*$/gm;
  let match: RegExpExecArray | null;
  let lastStart = -1;
  let lastDate = "";
  while ((match = headingRe.exec(content)) !== null) {
    if (match.index > lastStart) {
      lastStart = match.index;
      lastDate = match[1] ?? "";
    }
  }
  if (lastStart < 0) return null;

  // Block runs from `## Lint <date>` to the next `## ` at the same level
  // (or end of file).
  const after = content.slice(lastStart);
  const nextH2 = after.search(/\n##\s+(?!\s*#)/);
  const block = nextH2 < 0 ? after : after.slice(0, nextH2);

  return {
    date: lastDate,
    summary: extractBullets(block, "Summary"),
    autoApplied: extractBullets(block, "Auto-applied"),
    needsReview: extractBullets(block, "Needs review"),
    refreshChained: extractBullets(block, "Refresh chained"),
  };
}

/**
 * Pull the list of `- ...` bullets directly under a `### <name>` subheading.
 * Stops at the next `### ` or end of block.
 */
function extractBullets(block: string, sectionName: string): string[] {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^###\\s+${escaped}\\s*$`, "m");
  const m = re.exec(block);
  if (!m) return [];
  const start = m.index + m[0].length;
  const rest = block.slice(start);
  const nextSection = rest.search(/\n###\s+/);
  const section = nextSection < 0 ? rest : rest.slice(0, nextSection);
  const lines = section.split(/\r?\n/).map((l) => l.trimEnd());
  const bullets: string[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/^\s+/, "");
    if (trimmed.startsWith("- ")) {
      bullets.push(trimmed.slice(2).trim());
    } else if (bullets.length > 0 && (line.startsWith("  ") || line.startsWith("\t"))) {
      // Continuation of the previous bullet — fold in.
      bullets[bullets.length - 1] += " " + trimmed;
    }
  }
  return bullets;
}
