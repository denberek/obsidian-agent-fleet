import { parseYaml, stringifyYaml } from "obsidian";

export interface ParsedMarkdownDocument<TFrontmatter extends Record<string, unknown>> {
  frontmatter: TFrontmatter;
  body: string;
}

export function parseMarkdownWithFrontmatter<TFrontmatter extends Record<string, unknown>>(
  content: string,
): ParsedMarkdownDocument<TFrontmatter> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: {} as TFrontmatter,
      body: content.trim(),
    };
  }

  const rawFrontmatter = match[1] ?? "";
  const rawBody = match[2] ?? "";
  let parsed: TFrontmatter;
  try {
    parsed = (parseYaml(rawFrontmatter) ?? {}) as TFrontmatter;
  } catch (err) {
    console.warn("Agent Fleet: malformed YAML frontmatter, treating as empty", err);
    parsed = {} as TFrontmatter;
  }
  return {
    frontmatter: parsed,
    body: rawBody.trim(),
  };
}

export function stringifyMarkdownWithFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yaml = stringifyYaml(frontmatter).trim();
  const normalizedBody = body.trim();
  return `---\n${yaml}\n---\n\n${normalizedBody}\n`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}
