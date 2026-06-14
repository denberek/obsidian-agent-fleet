import { TFile } from "obsidian";
import type { Vault } from "obsidian";
import { describe, expect, it } from "vitest";
import { ensureWikiKeeperPermissions } from "./wikiKeeperTemplate";

/** Minimal in-memory vault. Backs the file ops the helper actually uses. */
function makeVault(initial: Record<string, string> = {}): {
  vault: Vault;
  files: Map<string, string>;
} {
  const files = new Map<string, string>(Object.entries(initial));
  const vault = {
    getAbstractFileByPath(path: string) {
      if (!files.has(path)) return null;
      const f = new TFile();
      f.path = path;
      return f;
    },
    cachedRead(file: TFile) {
      return Promise.resolve(files.get(file.path) ?? "");
    },
    create(path: string, content: string) {
      files.set(path, content);
      const f = new TFile();
      f.path = path;
      return Promise.resolve(f);
    },
    modify(file: TFile, content: string) {
      files.set(file.path, content);
      return Promise.resolve();
    },
  } as unknown as Vault;
  return { vault, files };
}

describe("ensureWikiKeeperPermissions", () => {
  const folder = "_fleet/agents/wiki-keeper-acme";
  const permPath = `${folder}/permissions.json`;

  it("creates permissions.json with the canonical lists when none exists", async () => {
    const { vault, files } = makeVault();
    const result = await ensureWikiKeeperPermissions(vault, folder);

    expect(files.has(permPath)).toBe(true);
    expect(result.allow).toContain("Bash(mv *)");
    expect(result.allow).toContain("Bash(mkdir *)");
    expect(result.deny).toContain("Bash(rm -rf *)");
    expect(result.deny).toContain("Bash(rm -rf /*)"); // defense-in-depth
    expect(result.deny).toContain("Bash(mv * /*)");
    expect(result.deny).toContain("Bash(cp -r * /*)");

    // File on disk is valid JSON and matches result
    const written = JSON.parse(files.get(permPath)!);
    expect(written.allow).toEqual(result.allow);
    expect(written.deny).toEqual(result.deny);
  });

  it("adds missing canonical entries to a stale file without dropping user additions", async () => {
    // Simulate an older keeper: missing Bash(mv *) and the new defense-in-depth
    // deny patterns, plus a user-added custom allow entry that must survive.
    const initial = JSON.stringify(
      {
        allow: ["Read", "Write", "Edit", "Glob", "Grep", "Bash(custom-tool *)"],
        deny: ["Bash(rm -rf *)", "Bash(git push *)"],
      },
      null,
      2,
    );
    const { vault, files } = makeVault({ [permPath]: initial });

    const result = await ensureWikiKeeperPermissions(vault, folder);

    // Canonical additions present
    expect(result.allow).toContain("Bash(mv *)");
    expect(result.allow).toContain("Bash(mkdir *)");
    expect(result.deny).toContain("Bash(rm -rf /*)");
    expect(result.deny).toContain("Bash(mv * /*)");
    expect(result.deny).toContain("Bash(cp -r * /*)");

    // User-added entry preserved
    expect(result.allow).toContain("Bash(custom-tool *)");
    // No duplication of the user's existing canonical entries
    expect(result.allow.filter((v) => v === "Read")).toHaveLength(1);
    expect(result.deny.filter((v) => v === "Bash(rm -rf *)")).toHaveLength(1);
  });

  it("is idempotent — running twice yields the same content", async () => {
    const { vault, files } = makeVault();
    await ensureWikiKeeperPermissions(vault, folder);
    const first = files.get(permPath)!;
    await ensureWikiKeeperPermissions(vault, folder);
    const second = files.get(permPath)!;
    expect(second).toBe(first);
  });

  it("recovers from an invalid permissions.json by overwriting with canonical lists", async () => {
    const { vault, files } = makeVault({ [permPath]: "not-json{" });
    const result = await ensureWikiKeeperPermissions(vault, folder);
    expect(result.allow).toContain("Bash(mv *)");
    const written = JSON.parse(files.get(permPath)!);
    expect(written.allow).toEqual(result.allow);
  });
});
