import { describe, expect, it } from "vitest";
import type { SkillCandidate } from "../types";
import { buildReflectionPrompt, mergeCandidates, parseReflectionOutput } from "./reflection";

describe("reflection", () => {
  it("parses the memory + candidates fenced blocks", () => {
    const output = `Here is the consolidated memory.

\`\`\`memory
## Preferences
- [pin] post to #wiki <!-- src:reflection -->
## Observations
- backlog stable
\`\`\`

\`\`\`candidates
[{"key":"rss-parse","pattern":"weekly digest re-parses RSS","evidence":["runs/a.md"]}]
\`\`\``;
    const parsed = parseReflectionOutput(output);
    expect(parsed.sections).not.toBeNull();
    expect(parsed.sections!.map((s) => s.name)).toEqual(["Preferences", "Observations"]);
    expect(parsed.sections![0]?.entries[0]?.pinned).toBe(true);
    expect(parsed.candidates).toEqual([
      { key: "rss-parse", pattern: "weekly digest re-parses RSS", evidence: ["runs/a.md"], suggestedSkill: undefined },
    ]);
  });

  it("returns null sections when no memory block (leaves memory intact)", () => {
    const parsed = parseReflectionOutput("I could not consolidate anything useful.");
    expect(parsed.sections).toBeNull();
    expect(parsed.candidates).toEqual([]);
  });

  it("tolerates a malformed candidates block", () => {
    const parsed = parseReflectionOutput("```memory\n## Observations\n- x\n```\n```candidates\n{not json\n```");
    expect(parsed.sections).not.toBeNull();
    expect(parsed.candidates).toEqual([]);
  });

  it("mergeCandidates increments occurrences and unions evidence", () => {
    const existing: SkillCandidate[] = [
      { key: "rss", pattern: "rss parse", occurrences: 1, firstSeen: "d1", lastSeen: "d1", evidence: ["a"], proposed: false },
    ];
    const merged = mergeCandidates(
      existing,
      [
        { key: "rss", pattern: "rss parse", evidence: ["b"] },
        { key: "new", pattern: "brand new", evidence: [] },
      ],
      "d2",
    );
    const rss = merged.find((c) => c.key === "rss");
    expect(rss?.occurrences).toBe(2);
    expect(rss?.lastSeen).toBe("d2");
    expect(rss?.evidence.sort()).toEqual(["a", "b"]);
    expect(merged.find((c) => c.key === "new")?.occurrences).toBe(1);
  });

  it("derives a candidate key from the pattern when missing", () => {
    const parsed = parseReflectionOutput('```memory\n## Observations\n- x\n```\n```candidates\n[{"pattern":"Some Recurring Thing"}]\n```');
    expect(parsed.candidates[0]?.key).toBe("some-recurring-thing");
  });

  it("mergeCandidates counts same-key duplicates within ONE run only once", () => {
    const merged = mergeCandidates(
      [],
      [
        { key: "rss", pattern: "re-parses RSS", evidence: ["x"] },
        { key: "rss", pattern: "re-parses rss!", evidence: ["y"] }, // dup key, same run
      ],
      "d1",
    );
    const rss = merged.find((c) => c.key === "rss");
    expect(rss?.occurrences).toBe(1); // not 2 — one run = +1
    expect(rss?.evidence.sort()).toEqual(["x", "y"]); // evidence still unioned
  });

  it("does not treat ```memorydump as the ```memory block", () => {
    const parsed = parseReflectionOutput("```memorydump\n## Observations\n- x\n```");
    expect(parsed.sections).toBeNull(); // no real memory block → leave memory intact
  });

  it("still parses ```memory when a similarly-named fence precedes it", () => {
    const out = "```memory-notes\njunk\n```\n```memory\n## Observations\n- real\n```";
    const parsed = parseReflectionOutput(out);
    expect(parsed.sections?.[0]?.entries[0]?.text).toBe("real");
  });

  it("buildReflectionPrompt embeds budget + both block templates", () => {
    const prompt = buildReflectionPrompt({
      agentName: "Wiki Keeper",
      workingMemoryBody: "## Preferences\n- [pin] x",
      recentRaw: "- 2026-06-13T00:00:00Z [task] did a thing",
      tokenBudget: 1500,
    });
    expect(prompt).toContain("```memory");
    expect(prompt).toContain("```candidates");
    expect(prompt).toContain("1500 tokens");
    expect(prompt).toContain("Wiki Keeper");
    expect(prompt).toContain("did a thing");
  });
});
