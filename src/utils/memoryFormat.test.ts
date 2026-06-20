import { describe, expect, it } from "vitest";
import type { MemoryEntry } from "../types";
import {
  appendEntries,
  buildMemorySection,
  CAPTURE_SECTION,
  carryForwardPinnedPreferences,
  emptyWorkingMemory,
  enforceHardCap,
  estimateTokens,
  extractCaptures,
  migrateLegacyBody,
  parseSectionsFromBody,
  parseWorkingMemory,
  MAX_CAPTURE_CHARS,
  redactRememberForDisplay,
  renderSections,
  sanitizeFactText,
  serializeEntryLine,
  serializeWorkingMemory,
  stripRememberTags,
} from "./memoryFormat";
import type { AgentConfig } from "../types";

describe("memoryFormat", () => {
  it("round-trips an entry line with pin + source + date", () => {
    const entry: MemoryEntry = {
      text: "Concept pages live under topic sub-folders.",
      source: "chat:conv-abc",
      date: "2026-06-10",
      pinned: true,
    };
    const line = serializeEntryLine(entry);
    expect(line).toBe(
      "- [pin] Concept pages live under topic sub-folders. <!-- src:chat:conv-abc 2026-06-10 -->",
    );
    const parsed = parseSectionsFromBody(`## Preferences\n${line}`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBe("Preferences");
    expect(parsed[0]?.entries[0]).toEqual(entry);
  });

  it("serializes a bare entry without comment or pin", () => {
    const line = serializeEntryLine({ text: "plain fact", pinned: false });
    expect(line).toBe("- plain fact");
    const parsed = parseSectionsFromBody(`## Observations\n${line}`);
    expect(parsed[0]?.entries[0]).toEqual({
      text: "plain fact",
      source: undefined,
      date: undefined,
      pinned: false,
    });
  });

  it("folds legacy '## Learned Context' bullets into Observations", () => {
    const legacy = "## Learned Context\n\n- learned one\n- learned two";
    const wm = migrateLegacyBody(legacy, "_fleet/memory/a/working.md", "Agent A");
    expect(wm.sections).toHaveLength(1);
    expect(wm.sections[0]?.name).toBe("Observations");
    expect(wm.sections[0]?.entries.map((e) => e.text)).toEqual(["learned one", "learned two"]);
  });

  it("folds bullets with no heading into Observations", () => {
    const parsed = parseSectionsFromBody("- orphan a\n- orphan b");
    expect(parsed[0]?.name).toBe("Observations");
    expect(parsed[0]?.entries).toHaveLength(2);
  });

  it("appendEntries is pure and lands in the capture section", () => {
    const wm = emptyWorkingMemory("p", "A");
    const next = appendEntries(
      wm,
      [{ text: "fresh fact", source: "chat", date: "2026-06-13", pinned: false }],
      CAPTURE_SECTION,
      "2026-06-13T14:00:00Z",
    );
    expect(wm.sections).toHaveLength(0); // original untouched
    expect(next.sections[0]?.name).toBe("Recent");
    expect(next.lastUpdated).toBe("2026-06-13T14:00:00Z");
    expect(next.tokenEstimate).toBeGreaterThan(0);
  });

  it("renders sections in canonical order, skipping empties", () => {
    let wm = emptyWorkingMemory("p", "A");
    wm = appendEntries(wm, [{ text: "obs", pinned: false }], "Observations");
    wm = appendEntries(wm, [{ text: "pref", pinned: true }], "Preferences");
    const rendered = renderSections(wm.sections);
    expect(rendered.indexOf("## Preferences")).toBeLessThan(rendered.indexOf("## Observations"));
    expect(rendered).not.toContain("Procedures");
  });

  it("serialize → parse round-trips a full working memory", () => {
    let wm = emptyWorkingMemory("_fleet/memory/a/working.md", "Agent A");
    wm = appendEntries(wm, [{ text: "pinned pref", source: "chat", date: "2026-06-10", pinned: true }], "Preferences");
    wm = appendEntries(wm, [{ text: "a procedure", pinned: false }], "Procedures");
    wm.lastUpdated = "2026-06-13T03:00:00Z";
    wm.lastReflection = "2026-06-13T03:00:00Z";

    const text = serializeWorkingMemory(wm);
    expect(text).toContain("schema: 2");
    expect(text).toContain("token_estimate:");
    expect(text).toContain("last_reflection:");

    const back = parseWorkingMemory(text, "_fleet/memory/a/working.md", "Agent A");
    expect(back.agent).toBe("Agent A");
    expect(back.lastReflection).toBe("2026-06-13T03:00:00Z");
    expect(back.sections.map((s) => s.name)).toEqual(["Preferences", "Procedures"]);
    expect(back.sections[0]?.entries[0]?.pinned).toBe(true);
    expect(back.sections[0]?.entries[0]?.source).toBe("chat");
  });

  it("enforceHardCap drops oldest non-pinned entries but keeps pinned", () => {
    let wm = emptyWorkingMemory("p", "A");
    wm = appendEntries(wm, [{ text: "PINNED durable preference fact", pinned: true }], "Preferences");
    for (let i = 0; i < 20; i++) {
      wm = appendEntries(wm, [{ text: `recent observation entry ${i}`, pinned: false }], "Recent");
    }
    const hardCap = 30; // tokens
    const { wm: capped, spilled } = enforceHardCap(wm, hardCap);
    expect(capped.tokenEstimate).toBeLessThanOrEqual(hardCap);
    expect(spilled.length).toBeGreaterThan(0);
    // Pinned preference survives.
    const prefs = capped.sections.find((s) => s.name === "Preferences");
    expect(prefs?.entries.some((e) => e.text.includes("PINNED"))).toBe(true);
    // Spilled entries are the oldest Recent ones.
    expect(spilled[0]?.text).toContain("entry 0");
  });

  it("enforceHardCap is a no-op when under budget", () => {
    let wm = emptyWorkingMemory("p", "A");
    wm = appendEntries(wm, [{ text: "small", pinned: false }], "Recent");
    const { wm: capped, spilled } = enforceHardCap(wm, 1000);
    expect(spilled).toHaveLength(0);
    expect(capped).toBe(wm);
  });

  it("extractCaptures parses plain and typed REMEMBER blocks", () => {
    const out = `Sure, done.
[REMEMBER] user likes ISO dates [/REMEMBER]
[REMEMBER:pin] always post to #wiki [/REMEMBER]
[REMEMBER:procedure] rebuild index before lint [/REMEMBER]`;
    const caps = extractCaptures(out);
    expect(caps).toEqual([
      { text: "user likes ISO dates", pinned: false, section: undefined },
      { text: "always post to #wiki", pinned: true, section: "Preferences" },
      { text: "rebuild index before lint", pinned: false, section: "Procedures" },
    ]);
  });

  it("stripRememberTags removes blocks and collapses whitespace", () => {
    const out = "Here you go.\n\n[REMEMBER] secret fact [/REMEMBER]\n\nAll set.";
    expect(stripRememberTags(out)).toBe("Here you go.\n\nAll set.");
    expect(stripRememberTags("no tags here")).toBe("no tags here");
  });

  it("buildMemorySection injects instruction + content, '' when disabled", () => {
    const on = { memory: true } as AgentConfig;
    const off = { memory: false } as AgentConfig;
    let wm = emptyWorkingMemory("p", "A");
    wm = appendEntries(wm, [{ text: "known fact", pinned: false }], "Observations");
    const section = buildMemorySection(on, wm);
    expect(section).toContain("## Memory");
    expect(section).toContain("[REMEMBER]");
    expect(section).toContain("known fact");
    expect(buildMemorySection(on, null)).toContain("Nothing yet");
    expect(buildMemorySection(off, wm)).toBe("");
  });

  it("sanitizeFactText collapses newlines/whitespace and caps length", () => {
    // Multi-line narration → single line (can't break the bullet/raw format).
    expect(sanitizeFactText("line one\nline two\t  line three")).toBe("line one line two line three");
    expect(sanitizeFactText("  padded  ")).toBe("padded");
    expect(sanitizeFactText("\n\n  ")).toBe("");
    // Over-long input is capped with an ellipsis.
    const long = "x".repeat(MAX_CAPTURE_CHARS + 50);
    const capped = sanitizeFactText(long);
    expect(capped.length).toBe(MAX_CAPTURE_CHARS);
    expect(capped.endsWith("…")).toBe(true);
  });

  it("estimateTokens approximates 4 chars/token", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("carryForwardPinnedPreferences re-adds pins a reflection dropped", () => {
    let prev = emptyWorkingMemory("p", "A");
    prev = appendEntries(prev, [{ text: "always post to #wiki", pinned: true }], "Preferences");
    // New consolidated sections forgot the pin.
    const consolidated = parseSectionsFromBody("## Observations\n- backlog stable");
    const merged = carryForwardPinnedPreferences(prev, consolidated);
    const prefs = merged.find((s) => s.name === "Preferences");
    expect(prefs?.entries.some((e) => e.text === "always post to #wiki" && e.pinned)).toBe(true);
  });

  it("carryForwardPinnedPreferences rescues a pin from a non-Preferences section", () => {
    let prev = emptyWorkingMemory("p", "A");
    prev = appendEntries(prev, [{ text: "pinned obs fact", pinned: true }], "Observations");
    const consolidated = parseSectionsFromBody("## Observations\n- something else");
    const merged = carryForwardPinnedPreferences(prev, consolidated);
    const prefs = merged.find((s) => s.name === "Preferences");
    expect(prefs?.entries.some((e) => e.text === "pinned obs fact" && e.pinned)).toBe(true);
  });

  it("carryForwardPinnedPreferences does not duplicate a pin the model kept", () => {
    let prev = emptyWorkingMemory("p", "A");
    prev = appendEntries(prev, [{ text: "Always post to #wiki", pinned: true }], "Preferences");
    const consolidated = parseSectionsFromBody("## Preferences\n- [pin] always post to #wiki");
    const merged = carryForwardPinnedPreferences(prev, consolidated);
    const prefs = merged.find((s) => s.name === "Preferences");
    expect(prefs?.entries.filter((e) => /post to #wiki/i.test(e.text))).toHaveLength(1);
  });

  it("carryForwardPinnedPreferences trusts the model and does not re-add a reworded pin", () => {
    // The model UPDATED a pin (14 → 24) and emitted pins, so we trust its
    // consolidation rather than re-adding the byte-different stale version.
    let prev = emptyWorkingMemory("p", "A");
    prev = appendEntries(prev, [{ text: "warm-path priority: 14 shortlists", pinned: true }], "Preferences");
    const consolidated = parseSectionsFromBody("## Preferences\n- [pin] warm-path priority: 24 shortlists");
    const merged = carryForwardPinnedPreferences(prev, consolidated);
    const prefs = merged.find((s) => s.name === "Preferences");
    expect(prefs?.entries).toHaveLength(1);
    expect(prefs?.entries[0]?.text).toContain("24 shortlists");
  });

  it("redactRememberForDisplay strips complete blocks and holds partial/unclosed tags", () => {
    // Complete block removed.
    expect(redactRememberForDisplay("a [REMEMBER] x [/REMEMBER] b")).toBe("a  b");
    // Unclosed open tag → hold everything from the open.
    expect(redactRememberForDisplay("hello [REMEMBER] still typing")).toBe("hello ");
    // Trailing partial of the opener → held.
    expect(redactRememberForDisplay("hello [REMEM")).toBe("hello ");
    expect(redactRememberForDisplay("hello [")).toBe("hello ");
    // No tags → unchanged (and a normal markdown link is not mistaken for a tag).
    expect(redactRememberForDisplay("see [docs](/x) here")).toBe("see [docs](/x) here");
  });

  it("redactRememberForDisplay output grows monotonically as a block completes", () => {
    const full = "Saved it. [REMEMBER:pin] use ISO dates [/REMEMBER] Done.";
    let prevLen = 0;
    for (let i = 1; i <= full.length; i++) {
      const safe = redactRememberForDisplay(full.slice(0, i));
      expect(safe.length).toBeGreaterThanOrEqual(prevLen); // never retracts
      prevLen = safe.length;
      expect(safe).not.toContain("[REMEMBER"); // tag never flashes
    }
    expect(redactRememberForDisplay(full)).toBe("Saved it.  Done.");
  });
});
