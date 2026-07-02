import { beforeEach, describe, expect, it } from "vitest";
import type { App } from "obsidian";
import type { ValidationIssue } from "../types";
import { McpRegistry } from "./mcpRegistry";
import { FakeVault, makeApp } from "./testSupport";

describe("McpRegistry", () => {
  let vault: FakeVault;
  let issues: ValidationIssue[];
  let registry: McpRegistry;

  beforeEach(() => {
    vault = new FakeVault();
    issues = [];
    registry = new McpRegistry(makeApp(vault) as App, {
      getMcpDir: () => "_fleet/mcp",
      getServerByName: () => undefined,
      reportIssue: (path, message) => issues.push({ path, message }),
    });
  });

  describe("parseMcpServerFile", () => {
    it("parses a valid stdio server with defaults", () => {
      const server = registry.parseMcpServerFile(
        "_fleet/mcp/files.md",
        "---\nname: files\ntransport: stdio\ncommand: npx\n---\n\nLocal file server\n",
      );
      expect(server).not.toBeNull();
      expect(server?.type).toBe("stdio");
      expect(server?.enabled).toBe(true); // default
      expect(server?.source).toBe("manual"); // default
      expect(server?.description).toBe("Local file server"); // body fallback
      expect(issues).toHaveLength(0);
    });

    it("accepts `type` as a transport alias", () => {
      const server = registry.parseMcpServerFile(
        "_fleet/mcp/api.md",
        "---\nname: api\ntype: http\nurl: https://example.com/mcp\n---\n",
      );
      expect(server?.type).toBe("http");
      expect(issues).toHaveLength(0);
    });

    it("rejects a missing/invalid transport and records an issue", () => {
      const server = registry.parseMcpServerFile(
        "_fleet/mcp/bad.md",
        "---\nname: bad\ntransport: carrier-pigeon\n---\n",
      );
      expect(server).toBeNull();
      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toBe("_fleet/mcp/bad.md");
    });

    it("rejects stdio without command and http without url", () => {
      expect(
        registry.parseMcpServerFile("_fleet/mcp/a.md", "---\nname: a\ntransport: stdio\n---\n"),
      ).toBeNull();
      expect(
        registry.parseMcpServerFile("_fleet/mcp/b.md", "---\nname: b\ntransport: http\n---\n"),
      ).toBeNull();
      expect(issues).toHaveLength(2);
    });
  });

  describe("saveMcpServer", () => {
    it("creates a new registry file with a de-duplicated slug path", async () => {
      vault.addFile("_fleet/mcp/files.md", "---\nname: files\ntransport: stdio\ncommand: old\n---\n");
      const path = await registry.saveMcpServer({
        name: "files",
        type: "stdio",
        enabled: true,
        source: "manual",
        command: "npx",
        args: [],
        status: "disconnected",
        scope: "user",
        tools: [],
        toolDetails: [],
      });
      expect(path).toBe("_fleet/mcp/files-2.md"); // existing file → suffixed
      expect(vault.contents.get(path)).toContain("command: npx");
    });

    it("rewrites in place when filePath is set", async () => {
      vault.addFile("_fleet/mcp/files.md", "---\nname: files\ntransport: stdio\ncommand: old\n---\n");
      const path = await registry.saveMcpServer({
        name: "files",
        filePath: "_fleet/mcp/files.md",
        type: "stdio",
        enabled: false,
        source: "manual",
        command: "npx",
        args: [],
        status: "disconnected",
        scope: "user",
        tools: [],
        toolDetails: [],
      });
      expect(path).toBe("_fleet/mcp/files.md");
      expect(vault.contents.get(path)).toContain("enabled: false");
    });
  });
});
