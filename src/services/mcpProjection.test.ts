import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { McpServer } from "../types";
import {
  installMcpProjection,
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
