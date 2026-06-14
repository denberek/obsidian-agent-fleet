import { describe, expect, it } from "vitest";
import { markdownToMrkdwn, splitForTransport } from "./formatter";

describe("markdownToMrkdwn", () => {
  it("converts double-star bold to single-star bold", () => {
    expect(markdownToMrkdwn("This is **bold** text.")).toBe("This is *bold* text.");
  });

  it("converts markdown links to mrkdwn <url|label> form", () => {
    expect(markdownToMrkdwn("See [our docs](https://example.com/docs).")).toBe(
      "See <https://example.com/docs|our docs>.",
    );
  });

  it("escapes raw angle brackets in prose but not inside inline code", () => {
    expect(markdownToMrkdwn("Use the `<div>` tag, or raw <div> works.")).toBe(
      "Use the `<div>` tag, or raw &lt;div&gt; works.",
    );
  });

  it("converts leading headers to bold", () => {
    expect(markdownToMrkdwn("# Heading\n\nbody text")).toBe("*Heading*\n\nbody text");
    expect(markdownToMrkdwn("### Subheading")).toBe("*Subheading*");
  });

  it("preserves fenced code blocks verbatim (minus the language tag)", () => {
    const input = "```ts\nconst x = 1;\n```";
    expect(markdownToMrkdwn(input)).toBe("```\nconst x = 1;\n```");
  });

  it("does not mangle content inside fenced code blocks", () => {
    const input = "prose **bold**\n\n```\nif (a < b && c > d) { **not-bold** }\n```\n\nafter **bold**";
    const out = markdownToMrkdwn(input);
    // Prose is transformed
    expect(out).toContain("prose *bold*");
    expect(out).toContain("after *bold*");
    // Code block content is untouched — angle brackets and double-stars still present
    expect(out).toContain("if (a < b && c > d) { **not-bold** }");
  });

  it("leaves underscore italics alone", () => {
    expect(markdownToMrkdwn("this is _italic_ text")).toBe("this is _italic_ text");
  });
});

describe("splitForTransport", () => {
  it("returns a single chunk when text fits under the limit", () => {
    expect(splitForTransport("hello world", 100)).toEqual(["hello world"]);
  });

  it("splits at paragraph boundaries when possible", () => {
    const text = "A".repeat(40) + "\n\n" + "B".repeat(40) + "\n\n" + "C".repeat(40);
    const chunks = splitForTransport(text, 85);
    // Should not leave a chunk that exceeds the limit
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(85);
    // Should have multiple chunks
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk should end cleanly at a paragraph
    expect(chunks[0]).toContain("A".repeat(40));
  });

  it("never breaks inside a fenced code block — closes and reopens the fence", () => {
    // Large code block that would exceed the limit. The splitter should close the
    // fence at the cut and reopen it on the next chunk so neither half is malformed.
    const code = "x".repeat(200);
    const text = "prose\n\n```\n" + code + "\n```\n\nmore prose";
    const chunks = splitForTransport(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Every chunk should have an even number of fences (balanced).
      const fenceCount = (chunk.match(/```/g) ?? []).length;
      expect(fenceCount % 2).toBe(0);
    }
  });

  it("keeps chunks roughly at or below the limit", () => {
    const text = "word ".repeat(500);
    const chunks = splitForTransport(text, 200);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(210); // small buffer for punctuation
  });
});
