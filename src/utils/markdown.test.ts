import { describe, expect, it, vi } from "vitest";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter } from "./markdown";
import * as obsidian from "obsidian";

describe("markdown utilities", () => {
  it("parses frontmatter and body", () => {
    const parsed = parseMarkdownWithFrontmatter<{ name: string }>(`---
name: demo
---

Hello world`);

    expect(parsed.frontmatter.name).toBe("demo");
    expect(parsed.body).toBe("Hello world");
  });

  it("round-trips frontmatter and body", () => {
    const content = stringifyMarkdownWithFrontmatter({ task_id: "demo", enabled: true }, "Body text");
    expect(content).toContain("task_id: demo");
    expect(content).toContain("Body text");
  });

  it("returns empty frontmatter on malformed YAML instead of crashing", () => {
    // Simulate the real Obsidian parseYaml throwing on malformed input
    const spy = vi.spyOn(obsidian, "parseYaml").mockImplementationOnce(() => {
      throw new Error("YAMLException: bad indentation");
    });
    const content = `---
name: broken
---

Body here`;
    const parsed = parseMarkdownWithFrontmatter<{ name?: string }>(content);
    // Should not throw — returns empty frontmatter and preserves the body
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("Body here");
    spy.mockRestore();
  });

  it("returns empty frontmatter when no frontmatter block exists", () => {
    const parsed = parseMarkdownWithFrontmatter<{ name?: string }>("Just a plain file");
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("Just a plain file");
  });
});
