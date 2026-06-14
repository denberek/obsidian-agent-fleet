import { describe, expect, it } from "vitest";
import { mergeImports, parseClaudeMcpServers, parseCodexMcpServers } from "./mcpImport";

describe("parseClaudeMcpServers", () => {
  it("parses stdio + http servers and extracts the bearer token", () => {
    const json = JSON.stringify({
      mcpServers: {
        pencil: { command: "node", args: ["server.js"], env: { FOO: "bar" } },
        linear: { type: "http", url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer tok-1", "X-Keep": "v" } },
      },
    });
    const { servers, tokens } = parseClaudeMcpServers(json);
    const pencil = servers.find((s) => s.name === "pencil")!;
    expect(pencil.type).toBe("stdio");
    expect(pencil.command).toBe("node");
    expect(pencil.args).toEqual(["server.js"]);
    expect(pencil.env).toEqual({ FOO: "bar" });
    expect(pencil.source).toBe("imported");

    const linear = servers.find((s) => s.name === "linear")!;
    expect(linear.type).toBe("http");
    expect(linear.auth).toBe("oauth");
    // The token is pulled out of headers and returned separately.
    expect(linear.headers).toEqual({ "X-Keep": "v" });
    expect(tokens.linear).toBe("tok-1");
  });

  it("detects sse from a /sse url suffix", () => {
    const { servers } = parseClaudeMcpServers(JSON.stringify({ mcpServers: { s: { url: "https://x/sse" } } }));
    expect(servers[0]?.type).toBe("sse");
  });

  it("returns empty on malformed JSON", () => {
    expect(parseClaudeMcpServers("not json").servers).toEqual([]);
  });
});

describe("parseCodexMcpServers", () => {
  it("parses stdio with an [.env] subtable and http with [.oauth]", () => {
    const toml = [
      "[mcp_servers.pencil]",
      'command = "node"',
      'args = ["server.js", "--flag"]',
      "",
      "[mcp_servers.pencil.env]",
      'FOO = "bar"',
      "",
      "[mcp_servers.linear]",
      'url = "https://mcp.linear.app/mcp"',
      'oauth_resource = "https://mcp.linear.app/mcp"',
      "",
      "[mcp_servers.linear.oauth]",
      'client_id = "cid-9"',
      "",
      "[plugins.figma]",
      "enabled = true",
    ].join("\n");
    const { servers } = parseCodexMcpServers(toml);

    const pencil = servers.find((s) => s.name === "pencil")!;
    expect(pencil.type).toBe("stdio");
    expect(pencil.command).toBe("node");
    expect(pencil.args).toEqual(["server.js", "--flag"]);
    expect(pencil.env).toEqual({ FOO: "bar" });

    const linear = servers.find((s) => s.name === "linear")!;
    expect(linear.type).toBe("http");
    expect(linear.auth).toBe("oauth");
    expect(linear.oauth).toEqual({ clientId: "cid-9", resource: "https://mcp.linear.app/mcp" });

    // The non-mcp [plugins.figma] section is ignored.
    expect(servers.some((s) => s.name === "figma")).toBe(false);
  });

  it("honors enabled=false and quoted section names", () => {
    const toml = [
      '[mcp_servers."my.server"]',
      'command = "node"',
      "enabled = false",
    ].join("\n");
    const { servers } = parseCodexMcpServers(toml);
    expect(servers[0]?.name).toBe("my.server");
    expect(servers[0]?.enabled).toBe(false);
  });
});

describe("mergeImports", () => {
  it("dedupes by name (first wins) and merges token maps", () => {
    const claude = parseClaudeMcpServers(JSON.stringify({
      mcpServers: { pencil: { command: "node" }, linear: { url: "https://x", headers: { Authorization: "Bearer t" } } },
    }));
    const codex = parseCodexMcpServers(['[mcp_servers.pencil]', 'command = "other"'].join("\n"));
    const merged = mergeImports(claude, codex);
    expect(merged.servers.filter((s) => s.name === "pencil")).toHaveLength(1);
    // Claude's pencil wins (first), so command stays "node".
    expect(merged.servers.find((s) => s.name === "pencil")?.command).toBe("node");
    expect(merged.tokens.linear).toBe("t");
  });
});
