import { describe, expect, it } from "vitest";
import { parseLatestLintReport } from "./wikiLintReport";

const SAMPLE = `# Log

<!-- wiki-keeper:begin -->
## Lint 2026-04-19

### Summary
- Orphans: 1

### Auto-applied
- Added \`type: summary\` to [[old-page]]

### Needs review
- Old contradiction in [[vendor-x]] from 2026-03-12

## Lint 2026-04-26

### Summary
- Orphans: 2 (1 exempt synthesis)
- Stale summaries: 7 (refresh chained: 5 covered, 2 deferred for budget)

### Auto-applied
- Added \`summary_refreshed: ""\` slot to [[vendor-x]]

### Needs review
- Orphan: [[old-proposal]] has no inbound links. Consider linking from [[index]] or archiving.
- Bidirectional: [[vendor-x]] mentions [[procurement]] in summary, but [[procurement]] has no link back.
- Possible merge: [[vendor-x]] and [[vendor-X]] (similarity 0.94, 3 shared sources).

### Refresh chained
- Refreshed: [[vendor-x]], [[pricing-q3]]
- Deferred (budget): [[concept-event-sourcing]]

<!-- wiki-keeper:end -->
`;

describe("parseLatestLintReport", () => {
  it("returns null when no lint report is present", () => {
    expect(parseLatestLintReport("# Log\n\nnothing here")).toBeNull();
  });

  it("picks the most recent dated report", () => {
    const report = parseLatestLintReport(SAMPLE);
    expect(report).not.toBeNull();
    expect(report!.date).toBe("2026-04-26");
  });

  it("extracts summary, auto-applied, needs-review, refresh-chained sections", () => {
    const report = parseLatestLintReport(SAMPLE)!;
    expect(report.summary).toEqual([
      "Orphans: 2 (1 exempt synthesis)",
      "Stale summaries: 7 (refresh chained: 5 covered, 2 deferred for budget)",
    ]);
    expect(report.autoApplied).toHaveLength(1);
    expect(report.needsReview).toHaveLength(3);
    expect(report.needsReview[0]).toContain("[[old-proposal]]");
    expect(report.refreshChained).toHaveLength(2);
  });

  it("handles missing optional sections", () => {
    const minimal = `## Lint 2026-04-26\n\n### Needs review\n- Item one\n- Item two\n`;
    const report = parseLatestLintReport(minimal)!;
    expect(report.date).toBe("2026-04-26");
    expect(report.summary).toEqual([]);
    expect(report.autoApplied).toEqual([]);
    expect(report.refreshChained).toEqual([]);
    expect(report.needsReview).toEqual(["Item one", "Item two"]);
  });
});
