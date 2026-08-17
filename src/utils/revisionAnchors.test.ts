import { describe, expect, it } from "vitest";
import type { RevisionAnchor, RevisionDraft, RevisionNote } from "../types";
import {
  REVISION_LIMITS,
  anchorLocation,
  createAnchor,
  hashAnchorText,
  mapAnchor,
  mapDraftAnchors,
  refreshAnchor,
  resolveAnchor,
  resolveDraftAnchors,
} from "./revisionAnchors";

/** Offset mapper equivalent to inserting `length` characters at `at`. */
function insertAt(at: number, length: number): { mapPos(pos: number, assoc: -1 | 1): number } {
  return {
    mapPos(pos: number, assoc: -1 | 1): number {
      if (pos < at) return pos;
      if (pos === at && assoc === -1) return pos;
      return pos + length;
    },
  };
}

/** Offset mapper equivalent to deleting `[from, to)`. */
function deleteRange(from: number, to: number): { mapPos(pos: number, assoc: -1 | 1): number } {
  const removed = to - from;
  return {
    mapPos(pos: number): number {
      if (pos <= from) return pos;
      if (pos >= to) return pos - removed;
      return from;
    },
  };
}

function note(id: string, anchor: RevisionAnchor, overrides: Partial<RevisionNote> = {}): RevisionNote {
  return {
    id,
    anchor,
    comment: `comment ${id}`,
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    ...overrides,
  };
}

function draftWith(notes: RevisionNote[]): RevisionDraft {
  return {
    schemaVersion: 1,
    id: "draft-1",
    sourcePath: "notes/doc.md",
    status: "collecting",
    notes,
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
  };
}

describe("createAnchor", () => {
  const source = "# Title\n\nThe first paragraph is here.\n\nThe second paragraph is here.\n";

  it("captures exact text, bounded context, and a sha-256 of the selection", () => {
    const from = source.indexOf("The first");
    const anchor = createAnchor(source, from, from + "The first paragraph is here.".length);

    expect(anchor.exact).toBe("The first paragraph is here.");
    expect(anchor.prefix).toBe("# Title\n\n");
    expect(anchor.suffix).toBe("\n\nThe second paragraph is here.\n");
    expect(anchor.exactHash).toBe(hashAnchorText("The first paragraph is here."));
  });

  it("caps stored context at 128 characters per side", () => {
    const long = `${"a".repeat(500)}TARGET${"b".repeat(500)}`;
    const anchor = createAnchor(long, 500, 506);

    expect(anchor.prefix).toHaveLength(REVISION_LIMITS.anchorContextChars);
    expect(anchor.suffix).toHaveLength(REVISION_LIMITS.anchorContextChars);
  });

  it("normalizes reversed and out-of-range offsets", () => {
    const anchor = createAnchor(source, source.length + 50, 2);
    expect(anchor.from).toBe(2);
    expect(anchor.to).toBe(source.length);
  });

  it("rejects empty and whitespace-only selections", () => {
    expect(() => createAnchor(source, 7, 7)).toThrow(/Select some text/);
    expect(() => createAnchor(source, 7, 9)).toThrow(/Select some text/);
  });

  it("rejects selections over the size cap", () => {
    const huge = "x".repeat(REVISION_LIMITS.selectionChars + 10);
    expect(() => createAnchor(huge, 0, huge.length)).toThrow(/too large/);
    expect(() => createAnchor(huge, 0, REVISION_LIMITS.selectionChars)).not.toThrow();
  });

  it("handles ranges at the very start and end of the file", () => {
    const first = createAnchor(source, 0, 7);
    expect(first.prefix).toBe("");
    expect(first.exact).toBe("# Title");

    const trimmed = source.trimEnd();
    const last = createAnchor(trimmed, trimmed.length - 5, trimmed.length);
    expect(last.exact).toBe("here.");
    expect(last.suffix).toBe("");
  });
});

describe("refreshAnchor", () => {
  it("re-reads context without moving the offsets", () => {
    const before = "alpha TARGET omega";
    const anchor = createAnchor(before, 6, 12);
    const after = "alpha TARGET tail!";

    const refreshed = refreshAnchor(anchor, after);
    expect(refreshed.from).toBe(6);
    expect(refreshed.to).toBe(12);
    expect(refreshed.suffix).toBe(" tail!");
  });
});

describe("mapAnchor", () => {
  const source = "alpha bravo charlie";

  it("shifts offsets for an edit before the range", () => {
    const anchor = createAnchor(source, 6, 11); // "bravo"
    const next = `PRE ${source}`;

    const result = mapAnchor(anchor, insertAt(0, 4), next);
    expect(result.orphaned).toBe(false);
    expect(result.anchor.from).toBe(10);
    expect(result.anchor.to).toBe(15);
    expect(result.anchor.exact).toBe("bravo");
  });

  it("refreshes exact text for an edit inside the range", () => {
    const anchor = createAnchor(source, 6, 13); // "bravo c"
    const next = "alpha braXXXvo charlie";

    const result = mapAnchor(anchor, insertAt(9, 3), next);
    expect(result.orphaned).toBe(false);
    expect(result.anchor.exact).toBe("braXXXvo c");
    expect(result.anchor.exactHash).toBe(hashAnchorText("braXXXvo c"));
  });

  it("orphans a range whose content was deleted", () => {
    const anchor = createAnchor(source, 6, 11);
    const next = "alpha  charlie";

    const result = mapAnchor(anchor, deleteRange(6, 11), next);
    expect(result.orphaned).toBe(true);
    expect(result.anchor).toEqual(anchor);
  });

  it("maps every note in a draft without mutating the input", () => {
    const one = createAnchor(source, 6, 11); // "bravo"
    const two = createAnchor(source, 12, 19); // "charlie"
    const draft = draftWith([note("a", one), note("b", two)]);
    const next = `PRE ${source}`;

    const result = mapDraftAnchors(draft, insertAt(0, 4), next);

    expect(result.changed).toBe(true);
    expect(result.orphanedNoteIds).toEqual([]);
    expect(result.draft.notes.map((n) => n.anchor.from)).toEqual([10, 16]);
    expect(result.draft.notes.map((n) => n.anchor.exact)).toEqual(["bravo", "charlie"]);
    expect(draft.notes[0]?.anchor.from).toBe(6);
    expect(draft.notes[1]?.anchor.from).toBe(12);
  });
});

describe("resolveAnchor", () => {
  it("keeps stored offsets when the passage is untouched", () => {
    const source = "one two three";
    const anchor = createAnchor(source, 4, 7);

    const result = resolveAnchor(anchor, source);
    expect(result.method).toBe("offset");
    expect(result.orphaned).toBe(false);
    expect(result.anchor.from).toBe(4);
  });

  it("relocates a unique exact match after an external edit", () => {
    const source = "intro\n\nThe unique passage lives here.\n";
    const anchor = createAnchor(source, source.indexOf("The unique"), source.indexOf("here.") + 5);
    const edited = `# Added heading\n\n${source}`;

    const result = resolveAnchor(anchor, edited);
    expect(result.method).toBe("exact");
    expect(result.orphaned).toBe(false);
    expect(edited.slice(result.anchor.from, result.anchor.to)).toBe(anchor.exact);
  });

  it("picks the duplicate whose preceding context still matches", () => {
    const target = "The result is unclear.";
    const source = ["## Alpha section", "", target, "", "## Beta section", "", target, ""].join("\n");
    const anchor = createAnchor(source, source.lastIndexOf(target), source.lastIndexOf(target) + target.length);
    const edited = `---\ntitle: doc\n---\n\n${source}`;

    const result = resolveAnchor(anchor, edited);
    expect(result.method).toBe("context");
    expect(result.anchor.from).toBe(edited.lastIndexOf(target));
  });

  it("picks the duplicate whose following context still matches", () => {
    // Identical preceding context longer than the stored prefix window forces
    // the decision onto the suffix alone.
    const preamble = `${"Shared preamble sentence repeated verbatim. ".repeat(5)}\n`;
    const target = "The result is unclear.";
    const source = `${preamble}${target}\nAlpha tail continues for a while.\n\n${preamble}${target}\nBeta tail continues for a while.\n`;
    const secondStart = source.lastIndexOf(target);
    const anchor = createAnchor(source, secondStart, secondStart + target.length);
    expect(anchor.prefix).toBe(source.slice(source.indexOf(target) - anchor.prefix.length, source.indexOf(target)));

    const edited = `Prepended line.\n\n${source}`;
    const result = resolveAnchor(anchor, edited);

    expect(result.method).toBe("context");
    expect(result.anchor.from).toBe(edited.lastIndexOf(target));
  });

  it("orphans genuinely ambiguous duplicates instead of guessing", () => {
    // Padding longer than the stored context window on both sides means the
    // two occurrences are indistinguishable from prefix/suffix alone.
    const pad = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. ".repeat(3);
    const target = "The result is unclear.";
    const source = `${pad}${target}${pad}${target}${pad}`;
    const anchor = createAnchor(source, source.lastIndexOf(target), source.lastIndexOf(target) + target.length);
    const edited = `Prepended.\n\n${source}`;

    const result = resolveAnchor(anchor, edited);
    expect(result.method).toBe("orphan");
    expect(result.orphaned).toBe(true);
    expect(result.anchor).toEqual(anchor);
  });

  it("orphans a passage that was deleted outright", () => {
    const source = "Alpha.\nTarget sentence.\nOmega.";
    const anchor = createAnchor(source, 7, 23);
    expect(anchor.exact).toBe("Target sentence.");

    const result = resolveAnchor(anchor, "Alpha.\nOmega.");
    expect(result.method).toBe("orphan");
    expect(result.orphaned).toBe(true);
  });

  it("recovers a broad multi-line selection from unique boundaries", () => {
    const prefix = "## Why this release matters — a long and unique heading line\n\n";
    const suffix = "\n\n## Who it is for — another long and unique heading line\n";
    const body = "First paragraph of the body.\n\nSecond paragraph of the body.\n\nThird paragraph.";
    const source = `${prefix}${body}${suffix}`;
    const anchor = createAnchor(source, prefix.length, prefix.length + body.length);

    const rewritten = "A completely rewritten body that shares nothing with the original text.";
    const edited = `${prefix}${rewritten}${suffix}`;

    const result = resolveAnchor(anchor, edited);
    expect(result.method).toBe("boundary");
    expect(result.orphaned).toBe(false);
    expect(result.anchor.exact).toBe(rewritten);
  });

  it("refuses boundary recovery when the boundaries are not unique", () => {
    const boundary = "Repeated boundary line that is long enough to qualify.\n";
    const source = `${boundary}BODY TEXT HERE\n${boundary}other\n${boundary}`;
    const anchor = createAnchor(source, boundary.length, boundary.length + "BODY TEXT HERE".length);

    const result = resolveAnchor(anchor, source.replace("BODY TEXT HERE", "SOMETHING ELSE"));
    expect(result.method).toBe("orphan");
  });

  it("handles unicode and surrogate pairs by code unit", () => {
    const source = "Intro 🙂🙂 middle — naïve café 🎯 tail";
    const target = "middle — naïve café";
    const from = source.indexOf(target);
    const anchor = createAnchor(source, from, from + target.length);
    expect(anchor.exact).toBe(target);

    const edited = `🚀 prepended\n${source}`;
    const result = resolveAnchor(anchor, edited);
    expect(result.method).toBe("exact");
    expect(edited.slice(result.anchor.from, result.anchor.to)).toBe(target);
  });

  it("treats CRLF documents as raw text, carriage returns included", () => {
    const crlf = "# Title\r\n\r\nFirst line.\r\nSecond line.\r\n";
    const from = crlf.indexOf("First line.\r\nSecond line.");
    const anchor = createAnchor(crlf, from, from + "First line.\r\nSecond line.".length);
    expect(anchor.exact).toContain("\r\n");

    const edited = `Prepended.\r\n\r\n${crlf}`;
    const result = resolveAnchor(anchor, edited);
    expect(result.method).toBe("exact");
    expect(edited.slice(result.anchor.from, result.anchor.to)).toBe(anchor.exact);
  });

  it("resolves ranges at the start and end of the file", () => {
    const source = "# Heading\n\nbody text\n\nfinal words";
    const head = createAnchor(source, 0, 9);
    const tail = createAnchor(source, source.length - 11, source.length);

    const edited = source.replace("body text", "body text expanded");
    expect(resolveAnchor(head, edited).method).toBe("offset");

    const tailResult = resolveAnchor(tail, edited);
    expect(tailResult.method).toBe("exact");
    expect(edited.slice(tailResult.anchor.from, tailResult.anchor.to)).toBe("final words");
  });
});

describe("resolveDraftAnchors", () => {
  it("re-resolves every note and reports orphans without mutating the draft", () => {
    const source = "Alpha paragraph here.\n\nBravo paragraph here.\n\nCharlie paragraph here.";
    const healthy = createAnchor(source, source.indexOf("Charlie"), source.indexOf("Charlie") + 20);
    const doomed = createAnchor(source, 0, 21);
    const draft = draftWith([note("keep", healthy), note("lose", doomed)]);

    const edited = source.replace("Alpha paragraph here.", "");
    const result = resolveDraftAnchors(draft, edited);

    expect(result.changed).toBe(true);
    expect(result.orphanedNoteIds).toEqual(["lose"]);
    expect(result.draft.notes.find((n) => n.id === "keep")?.orphaned).toBeUndefined();
    expect(result.draft.notes.find((n) => n.id === "lose")?.orphaned).toBe(true);
    expect(draft.notes.every((n) => n.orphaned === undefined)).toBe(true);
  });

  it("clears a stale orphan flag when the passage comes back", () => {
    const source = "Alpha.\n\nRestored passage text.\n\nOmega.";
    const anchor = createAnchor(source, source.indexOf("Restored"), source.indexOf("Restored") + 22);
    const draft = draftWith([note("n1", anchor, { orphaned: true })]);

    const result = resolveDraftAnchors(draft, source);
    expect(result.changed).toBe(true);
    expect(result.orphanedNoteIds).toEqual([]);
    expect(result.draft.notes[0]?.orphaned).toBeUndefined();
  });

  it("reports no change when everything already resolves in place", () => {
    const source = "Alpha.\n\nStable passage text.\n\nOmega.";
    const anchor = createAnchor(source, source.indexOf("Stable"), source.indexOf("Stable") + 20);
    const draft = draftWith([note("n1", anchor)]);

    expect(resolveDraftAnchors(draft, source).changed).toBe(false);
  });
});

describe("anchorLocation", () => {
  const source = [
    "---",
    "title: Launch brief",
    "---",
    "",
    "# Launch brief",
    "",
    "Intro paragraph.",
    "",
    "## Why this release matters",
    "",
    "Most agent tools begin with a chat box.",
    "The handoff is where it breaks down.",
    "",
    "## Who it is for",
    "",
    "People already working in Obsidian.",
  ].join("\n");

  it("reports 1-based inclusive lines and the nearest preceding heading", () => {
    const from = source.indexOf("Most agent tools");
    const to = source.indexOf("breaks down.") + "breaks down.".length;
    const location = anchorLocation(createAnchor(source, from, to), source);

    expect(location.startLine).toBe(11);
    expect(location.endLine).toBe(12);
    expect(location.heading).toBe("Why this release matters");
  });

  it("uses the heading above the range, not a later one", () => {
    const from = source.indexOf("People already");
    const location = anchorLocation(createAnchor(source, from, from + 10), source);
    expect(location.heading).toBe("Who it is for");
  });

  it("reports no heading before the first heading", () => {
    const location = anchorLocation(createAnchor(source, 4, 23), source);
    expect(location.heading).toBeUndefined();
    expect(location.startLine).toBe(2);
  });

  it("ignores headings inside fenced code blocks", () => {
    const fenced = [
      "# Real heading",
      "",
      "```bash",
      "# not a heading",
      "```",
      "",
      "Target sentence here.",
    ].join("\n");
    const from = fenced.indexOf("Target");
    const location = anchorLocation(createAnchor(fenced, from, from + 21), fenced);

    expect(location.heading).toBe("Real heading");
    expect(location.startLine).toBe(7);
  });

  it("counts lines correctly in a CRLF document", () => {
    const crlf = "# Title\r\n\r\nFirst line.\r\nSecond line.\r\n";
    const from = crlf.indexOf("Second line.");
    const location = anchorLocation(createAnchor(crlf, from, from + "Second line.".length), crlf);

    expect(location.startLine).toBe(4);
    expect(location.endLine).toBe(4);
    expect(location.heading).toBe("Title");
  });

  it("does not count a trailing newline as an extra line", () => {
    const doc = "alpha\nbravo\ncharlie\n";
    const location = anchorLocation(createAnchor(doc, 0, 12), doc);
    expect(location.startLine).toBe(1);
    expect(location.endLine).toBe(2);
  });
});
