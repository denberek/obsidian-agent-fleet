import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildRememberMcpConfig,
  installRememberTool,
  parsePendingLines,
  rememberToolCliArgs,
  uninstallRememberTool,
} from "./rememberMcpServer";

describe("parsePendingLines", () => {
  it("parses valid records and tolerates blank / malformed lines", () => {
    const out = parsePendingLines([
      JSON.stringify({ text: "fact one", pinned: false, source: "mcp" }),
      "   ",
      "{not json",
      JSON.stringify({ text: "pref", pinned: true, section: "Preferences", source: "mcp:chat" }),
      JSON.stringify({ text: "  ", source: "mcp" }), // empty text dropped
    ]);
    expect(out).toEqual([
      { text: "fact one", pinned: false, section: undefined, source: "mcp" },
      { text: "pref", pinned: true, section: "Preferences", source: "mcp:chat" },
    ]);
  });

  it("ignores an unknown section value", () => {
    const out = parsePendingLines([JSON.stringify({ text: "x", section: "Bogus" })]);
    expect(out[0]?.section).toBeUndefined();
  });
});

describe("buildRememberMcpConfig", () => {
  it("registers the server with AF_PENDING_DIR env", () => {
    const cfg = JSON.parse(buildRememberMcpConfig("/tmp/s.cjs", "/vault/_fleet/memory/a/pending", "mcp:chat:c1"));
    const server = cfg.mcpServers.remember;
    expect(server.command).toBe("node");
    expect(server.args).toEqual(["/tmp/s.cjs"]);
    expect(server.env.AF_PENDING_DIR).toBe("/vault/_fleet/memory/a/pending");
    expect(server.env.AF_SOURCE).toBe("mcp:chat:c1");
  });
});

describe("rememberToolCliArgs", () => {
  const install = {
    mcpConfigPath: "/cwd/.claude/af-remember-mcp.tok.json",
    scriptPath: "/cwd/.claude/af-remember-mcp.tok.cjs",
    pendingDir: "/vault/_fleet/memory/a/pending",
    source: "mcp:chat:c1",
    tempFiles: [],
  };

  it("uses --mcp-config for claude-code", () => {
    expect(rememberToolCliArgs(install, "claude-code")).toEqual([
      "--mcp-config",
      "/cwd/.claude/af-remember-mcp.tok.json",
    ]);
  });

  it("uses -c mcp_servers.* TOML overrides for codex", () => {
    const args = rememberToolCliArgs(install, "codex");
    expect(args).toEqual([
      "-c", 'mcp_servers.remember.command="node"',
      "-c", 'mcp_servers.remember.args=["/cwd/.claude/af-remember-mcp.tok.cjs"]',
      "-c", 'mcp_servers.remember.env.AF_PENDING_DIR="/vault/_fleet/memory/a/pending"',
      "-c", 'mcp_servers.remember.env.AF_SOURCE="mcp:chat:c1"',
    ]);
  });

  it("treats the 'openai-codex' spelling as codex (not Claude --mcp-config)", () => {
    const args = rememberToolCliArgs(install, "openai-codex");
    expect(args[0]).toBe("-c");
    expect(args).not.toContain("--mcp-config");
  });
});

describe("installRememberTool", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  it("returns null when there is no pending dir (e.g. mobile vault)", () => {
    const cwd = mkdtempSync(join(tmpdir(), "af-rmt-"));
    dirs.push(cwd);
    expect(installRememberTool(cwd, null, "mcp")).toBeNull();
  });

  it("writes unique per-install filenames so concurrent installs don't collide", () => {
    const cwd = mkdtempSync(join(tmpdir(), "af-rmt-"));
    dirs.push(cwd);
    const a = installRememberTool(cwd, "/vault/mem/a/pending", "mcp");
    const b = installRememberTool(cwd, "/vault/mem/b/pending", "mcp");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.mcpConfigPath).not.toBe(b!.mcpConfigPath);
    // Each config points at its own agent's pending dir (no cross-agent clobber).
    expect(readFileSync(a!.mcpConfigPath, "utf-8")).toContain("/vault/mem/a/pending");
    expect(readFileSync(b!.mcpConfigPath, "utf-8")).toContain("/vault/mem/b/pending");

    // Cleaning up A leaves B's files intact.
    uninstallRememberTool(a);
    for (const f of a!.tempFiles) expect(existsSync(f)).toBe(false);
    for (const f of b!.tempFiles) expect(existsSync(f)).toBe(true);
    uninstallRememberTool(b);
  });
});
