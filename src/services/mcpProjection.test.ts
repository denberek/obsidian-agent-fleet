import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { McpServer } from "../types";
import {
  PI_OVERLAY_PID_FILE,
  installMcpProjection,
  piOverlayRoot,
  resolveProjectedServers,
  syntheticRememberServer,
  uninstallMcpProjection,
  type ProjectedMcpServer,
} from "./mcpProjection";

function makeServer(overrides: Partial<McpServer> = {}): McpServer {
  return {
    name: "srv",
    type: "stdio",
    enabled: true,
    status: "disconnected",
    scope: "user",
    tools: [],
    toolDetails: [],
    ...overrides,
  };
}

const tmpDirs: string[] = [];
function tmpCwd(): string {
  const d = mkdtempSync(join(tmpdir(), "mcp-projection-"));
  tmpDirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("resolveProjectedServers", () => {
  const stdio = makeServer({ name: "pencil", type: "stdio", command: "node", args: ["x.js"] });
  const httpOauth = makeServer({ name: "linear", type: "http", url: "https://mcp.linear.app/mcp", auth: "oauth" });
  const disabled = makeServer({ name: "off", type: "stdio", command: "node", enabled: false });

  it("includes all enabled servers when the agent has no grants", () => {
    const out = resolveProjectedServers({
      registry: [stdio, httpOauth, disabled],
      agentGrants: [],
      getBearerToken: () => undefined,
    });
    expect(out.map((s) => s.def.name).sort()).toEqual(["linear", "pencil"]);
  });

  it("filters to the agent's grants (case-insensitive) and drops disabled", () => {
    const out = resolveProjectedServers({
      registry: [stdio, httpOauth, disabled],
      agentGrants: ["PENCIL", "off"],
      getBearerToken: () => undefined,
    });
    expect(out.map((s) => s.def.name)).toEqual(["pencil"]);
  });

  it("attaches a bearer token to oauth http servers", () => {
    const out = resolveProjectedServers({
      registry: [httpOauth],
      agentGrants: [],
      getBearerToken: (name) => (name === "linear" ? "tok-123" : undefined),
    });
    expect(out[0]?.secrets?.bearerToken).toBe("tok-123");
  });

  it("appends the remember tool when requested", () => {
    const out = resolveProjectedServers({
      registry: [stdio],
      agentGrants: [],
      getBearerToken: () => undefined,
      remember: { pendingDir: "/vault/mem/a/pending", source: "mcp" },
    });
    expect(out.map((s) => s.def.name)).toEqual(["pencil", "remember"]);
    expect(out[1]?.inlineScript).toContain("AF_PENDING_DIR");
  });
});

describe("installMcpProjection — Claude", () => {
  it("writes one merged --mcp-config with stdio + http entries", () => {
    const cwd = tmpCwd();
    const servers: ProjectedMcpServer[] = [
      { def: makeServer({ name: "pencil", type: "stdio", command: "node", args: ["x.js"], env: { A: "1" } }) },
      {
        def: makeServer({ name: "linear", type: "http", url: "https://mcp.linear.app/mcp", auth: "oauth" }),
        secrets: { bearerToken: "tok-9" },
      },
      syntheticRememberServer("/vault/mem/a/pending", "mcp"),
    ];
    const proj = installMcpProjection(cwd, "claude-code", servers);
    expect(proj).not.toBeNull();
    expect(proj!.args[0]).toBe("--mcp-config");
    const cfg = JSON.parse(readFileSync(proj!.args[1]!, "utf-8")) as { mcpServers: Record<string, any> };

    // stdio omits `type`, carries args + env
    expect(cfg.mcpServers.pencil).toEqual({ command: "node", args: ["x.js"], env: { A: "1" } });
    // http carries type + url + bearer header
    expect(cfg.mcpServers.linear.type).toBe("http");
    expect(cfg.mcpServers.linear.url).toBe("https://mcp.linear.app/mcp");
    expect(cfg.mcpServers.linear.headers.Authorization).toBe("Bearer tok-9");
    // remember materialized as a node stdio server
    expect(cfg.mcpServers.remember.command).toBe("node");
    expect(cfg.mcpServers.remember.env.AF_PENDING_DIR).toBe("/vault/mem/a/pending");

    uninstallMcpProjection(proj);
    for (const f of proj!.tempFiles) expect(existsSync(f)).toBe(false);
  });
});

describe("installMcpProjection — Codex", () => {
  it("emits -c overrides for stdio (command/args/env) + enabled", () => {
    const cwd = tmpCwd();
    const proj = installMcpProjection(cwd, "codex", [
      { def: makeServer({ name: "pencil", type: "stdio", command: "node", args: ["x.js"], env: { A: "1" } }) },
    ]);
    const joined = proj!.args.join(" ");
    expect(joined).toContain('mcp_servers.pencil.command="node"');
    expect(joined).toContain('mcp_servers.pencil.args=["x.js"]');
    expect(joined).toContain('mcp_servers.pencil.env.A="1"');
    expect(joined).toContain("mcp_servers.pencil.enabled=true");
    expect(proj!.env).toEqual({});
  });

  it("projects an http bearer via env var, never in argv", () => {
    const cwd = tmpCwd();
    const proj = installMcpProjection(cwd, "codex", [
      {
        def: makeServer({ name: "linear", type: "http", url: "https://mcp.linear.app/mcp", auth: "oauth", oauth: { clientId: "cid", resource: "https://r" } }),
        secrets: { bearerToken: "tok-9" },
      },
    ]);
    const joined = proj!.args.join(" ");
    expect(joined).toContain('mcp_servers.linear.url="https://mcp.linear.app/mcp"');
    expect(joined).toContain("mcp_servers.linear.bearer_token_env_var=");
    expect(joined).toContain('mcp_servers.linear.oauth_resource="https://r"');
    expect(joined).toContain('mcp_servers.linear.oauth.client_id="cid"');
    // The token value is in env, not in the args.
    expect(joined).not.toContain("tok-9");
    expect(Object.values(proj!.env)).toContain("tok-9");
  });

  it("quotes server names that aren't bare TOML keys", () => {
    const cwd = tmpCwd();
    const proj = installMcpProjection(cwd, "codex", [
      { def: makeServer({ name: "my.server", type: "stdio", command: "node" }) },
    ]);
    expect(proj!.args.join(" ")).toContain('mcp_servers."my.server".enabled=true');
  });
});

describe("installMcpProjection — fail-soft", () => {
  it("returns null for an empty server list", () => {
    expect(installMcpProjection(tmpCwd(), "claude-code", [])).toBeNull();
  });

  it("drops a server with an unknown transport but keeps the rest", () => {
    const cwd = tmpCwd();
    const proj = installMcpProjection(cwd, "claude-code", [
      { def: makeServer({ name: "bad", type: "unknown" }) },
      { def: makeServer({ name: "good", type: "stdio", command: "node" }) },
    ]);
    const cfg = JSON.parse(readFileSync(proj!.args[1]!, "utf-8")) as { mcpServers: Record<string, unknown> };
    expect(Object.keys(cfg.mcpServers)).toEqual(["good"]);
    uninstallMcpProjection(proj);
  });
});

describe("installMcpProjection — Pi", () => {
  it("builds a PI_CODING_AGENT_DIR overlay carrying mcp.json, and restores it", () => {
    // Point the "real" pi agent dir at a temp fixture so the overlay symlinks
    // from a controlled location rather than the machine's ~/.pi/agent.
    const realDir = tmpCwd();
    const prevEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = realDir;
    try {
      const { writeFileSync } = require("fs") as typeof import("fs");
      writeFileSync(join(realDir, "auth.json"), "{}", "utf-8");
      writeFileSync(join(realDir, "settings.json"), "{}", "utf-8");

      const proj = installMcpProjection(tmpCwd(), "pi", [
        { def: makeServer({ name: "pencil", type: "stdio", command: "node", args: ["x.js"], env: { A: "1" } }) },
        {
          def: makeServer({ name: "linear", type: "http", url: "https://mcp.linear.app/mcp", auth: "oauth" }),
          secrets: { bearerToken: "tok-123" },
        },
      ]);
      expect(proj).not.toBeNull();
      expect(proj!.args).toEqual([]);

      const overlay = proj!.env.PI_CODING_AGENT_DIR;
      expect(overlay).toBeTruthy();
      expect(existsSync(join(overlay!, "auth.json"))).toBe(true); // symlinked through
      expect(existsSync(join(overlay!, "sessions"))).toBe(true); // created in real dir + linked

      const config = JSON.parse(readFileSync(join(overlay!, "mcp.json"), "utf-8")) as {
        mcpServers: Record<string, Record<string, unknown>>;
      };
      expect(config.mcpServers.pencil).toEqual({ command: "node", args: ["x.js"], env: { A: "1" } });
      expect(config.mcpServers.linear!.url).toBe("https://mcp.linear.app/mcp");
      // The token itself must be in spawn env, not on disk.
      const envVar = config.mcpServers.linear!.bearerTokenEnv as string;
      expect(envVar).toBe("AF_MCP_LINEAR_TOKEN");
      expect(proj!.env[envVar]).toBe("tok-123");
      // Without explicit auth:"bearer" pi-mcp-adapter never sends the token.
      expect(config.mcpServers.linear!.auth).toBe("bearer");
      expect(readFileSync(join(overlay!, "mcp.json"), "utf-8")).not.toContain("tok-123");

      uninstallMcpProjection(proj);
      expect(existsSync(overlay!)).toBe(false);
      // The real dir survives cleanup untouched.
      expect(existsSync(join(realDir, "auth.json"))).toBe(true);
    } finally {
      if (prevEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prevEnv;
    }
  });

  it("still writes mcp.json when pi has never been initialized", () => {
    const missing = join(tmpCwd(), "does-not-exist");
    const prevEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = missing;
    try {
      const proj = installMcpProjection(tmpCwd(), "pi", [
        { def: makeServer({ name: "pencil", type: "stdio", command: "node" }) },
      ]);
      expect(proj).not.toBeNull();
      const overlay = proj!.env.PI_CODING_AGENT_DIR!;
      expect(existsSync(join(overlay, "mcp.json"))).toBe(true);
      uninstallMcpProjection(proj);
      expect(existsSync(overlay)).toBe(false);
    } finally {
      if (prevEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prevEnv;
    }
  });

  it("namespaces overlays under the dedicated root with a live pid marker", () => {
    const realDir = tmpCwd();
    const prevEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = realDir;
    try {
      const proj = installMcpProjection(tmpCwd(), "pi", [
        { def: makeServer({ name: "pencil", type: "stdio", command: "node" }) },
      ]);
      const overlay = proj!.env.PI_CODING_AGENT_DIR!;
      expect(overlay.startsWith(piOverlayRoot())).toBe(true);
      expect(readFileSync(join(overlay, PI_OVERLAY_PID_FILE), "utf-8")).toBe(String(process.pid));
      uninstallMcpProjection(proj);
      // The plugin-owned marker must not be copied into the real dir.
      expect(existsSync(join(realDir, PI_OVERLAY_PID_FILE))).toBe(false);
      expect(existsSync(join(realDir, "mcp.json"))).toBe(false);
    } finally {
      if (prevEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prevEnv;
    }
  });

  it("restore copies state Pi created in the overlay back to an uninitialized real dir", () => {
    const missing = join(tmpCwd(), "never-initialized");
    const prevEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = missing;
    try {
      const proj = installMcpProjection(tmpCwd(), "pi", [
        { def: makeServer({ name: "pencil", type: "stdio", command: "node" }) },
      ]);
      const overlay = proj!.env.PI_CODING_AGENT_DIR!;
      // Simulate Pi running against the overlay: fresh credentials plus a
      // session history that only exists here.
      writeFileSync(join(overlay, "auth.json"), '{"fresh":true}', "utf-8");
      mkdirSync(join(overlay, "sessions"), { recursive: true });
      writeFileSync(join(overlay, "sessions", "s1.jsonl"), "{}", "utf-8");

      uninstallMcpProjection(proj);
      expect(existsSync(overlay)).toBe(false);
      expect(readFileSync(join(missing, "auth.json"), "utf-8")).toBe('{"fresh":true}');
      expect(readFileSync(join(missing, "sessions", "s1.jsonl"), "utf-8")).toBe("{}");
      expect(existsSync(join(missing, "mcp.json"))).toBe(false);
    } finally {
      if (prevEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prevEnv;
    }
  });

  it("restore heals a linked file Pi replaced via rename-over-symlink", () => {
    const realDir = tmpCwd();
    const prevEnv = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = realDir;
    try {
      writeFileSync(join(realDir, "auth.json"), '{"old":true}', "utf-8");
      // Backdate the real file so the mtime freshness guard can't tie with the
      // rotated overlay copy written milliseconds later.
      const past = (Date.now() - 60_000) / 1000;
      utimesSync(join(realDir, "auth.json"), past, past);
      const proj = installMcpProjection(tmpCwd(), "pi", [
        { def: makeServer({ name: "pencil", type: "stdio", command: "node" }) },
      ]);
      const overlay = proj!.env.PI_CODING_AGENT_DIR!;
      // Simulate an atomic token refresh: the symlink is replaced by a real
      // file holding the only copy of the rotated credentials.
      unlinkSync(join(overlay, "auth.json"));
      writeFileSync(join(overlay, "auth.json"), '{"rotated":true}', "utf-8");

      uninstallMcpProjection(proj);
      expect(readFileSync(join(realDir, "auth.json"), "utf-8")).toBe('{"rotated":true}');
    } finally {
      if (prevEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = prevEnv;
    }
  });
});
