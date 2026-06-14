// One-time import of natively-configured MCP servers (MCP v2).
//
// On first load, Agent Fleet reads the user's existing Claude (~/.claude.json)
// and Codex (~/.codex/config.toml) MCP server definitions and folds them into
// the fleet registry (`_fleet/mcp/*.md`) so nothing is lost in the cutover to
// the projection model. After this, the registry is the single source of truth
// and the native configs are never read on the run path again.
//
// These parsers are PURE (text in, definitions out) so they're unit-testable
// without touching the filesystem. Bearer tokens found in Claude headers are
// returned separately so the caller can move them into the keychain (they must
// never be written to the vault).

import type { McpServer, McpTransport } from "../types";

export interface McpImportResult {
  servers: McpServer[];
  /** Bearer tokens discovered in native config, keyed by server name. The
   *  caller stores these in SecretStore — they are NOT in `servers`. */
  tokens: Record<string, string>;
}

/** Fill the runtime-only fields of an imported server with inert defaults. */
function runtimeDefaults(): Pick<McpServer, "status" | "scope" | "tools" | "toolDetails"> {
  return { status: "disconnected", scope: "user", tools: [], toolDetails: [] };
}

/** Resolve an MCP transport from a native `type` hint and/or url shape. */
function transportFrom(typeHint: string | undefined, url: string | undefined, hasCommand: boolean): McpTransport {
  if (hasCommand) return "stdio";
  const t = (typeHint ?? "").toLowerCase();
  if (t === "sse") return "sse";
  if (t === "http" || t === "streamable-http" || t === "streamable_http") return "http";
  if (url?.endsWith("/sse")) return "sse";
  return "http";
}

/**
 * Parse the top-level `mcpServers` map from a `~/.claude.json` document. Tokens
 * embedded in `headers.Authorization: Bearer …` are extracted out.
 */
export function parseClaudeMcpServers(jsonText: string): McpImportResult {
  const servers: McpServer[] = [];
  const tokens: Record<string, string> = {};
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return { servers, tokens };
  }
  const map = config.mcpServers;
  if (!map || typeof map !== "object") return { servers, tokens };

  for (const [name, raw] of Object.entries(map as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const command = typeof entry.command === "string" ? entry.command : undefined;
    const url = typeof entry.url === "string" ? entry.url : undefined;
    if (!command && !url) continue;
    const type = transportFrom(typeof entry.type === "string" ? entry.type : undefined, url, !!command);

    const server: McpServer = {
      name,
      type,
      enabled: true,
      source: "imported",
      ...runtimeDefaults(),
    };

    if (type === "stdio") {
      server.command = command;
      if (Array.isArray(entry.args)) server.args = entry.args.filter((a): a is string => typeof a === "string");
      if (entry.env && typeof entry.env === "object") {
        server.env = stringRecord(entry.env as Record<string, unknown>);
      }
    } else {
      server.url = url;
      const headers = entry.headers && typeof entry.headers === "object"
        ? stringRecord(entry.headers as Record<string, unknown>)
        : {};
      // Pull the bearer token out of the headers and into the token map.
      const authHeader = headers.Authorization ?? headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        tokens[name] = authHeader.slice(7);
        delete headers.Authorization;
        delete headers.authorization;
        server.auth = "oauth";
      } else {
        server.auth = "none";
      }
      if (Object.keys(headers).length > 0) server.headers = headers;
    }
    servers.push(server);
  }
  return { servers, tokens };
}

/**
 * Parse the `[mcp_servers.*]` sections of a `~/.codex/config.toml` document.
 * Handles a focused TOML subset: bare/quoted section names, string and
 * string-array values, and the `.env` / `.oauth` subtables.
 */
export function parseCodexMcpServers(tomlText: string): McpImportResult {
  interface Raw {
    name: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    bearerEnvVar?: string;
    oauthResource?: string;
    oauthClientId?: string;
    enabled: boolean;
  }
  const map = new Map<string, Raw>();
  let cur: { name: string; sub: "env" | "oauth" | null } | null = null;

  for (const rawLine of tomlText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      const inner = sectionMatch[1]!.trim();
      const m = inner.match(/^mcp_servers\.(.+)$/);
      if (!m) { cur = null; continue; }
      let rest = m[1]!;
      let sub: "env" | "oauth" | null = null;
      if (rest.endsWith(".env")) { sub = "env"; rest = rest.slice(0, -4); }
      else if (rest.endsWith(".oauth")) { sub = "oauth"; rest = rest.slice(0, -6); }
      const name = unquoteToml(rest);
      if (!name) { cur = null; continue; }
      if (!map.has(name)) map.set(name, { name, enabled: true });
      cur = { name, sub };
      continue;
    }

    if (!cur) continue;
    const kv = line.match(/^([^=]+?)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = unquoteToml(kv[1]!.trim());
    const valRaw = kv[2]!.trim();
    const srv = map.get(cur.name)!;

    if (cur.sub === "env") {
      srv.env ??= {};
      srv.env[key] = parseTomlString(valRaw);
    } else if (cur.sub === "oauth") {
      if (key === "client_id") srv.oauthClientId = parseTomlString(valRaw);
    } else {
      switch (key) {
        case "command": srv.command = parseTomlString(valRaw); break;
        case "args": srv.args = parseTomlStringArray(valRaw); break;
        case "url": srv.url = parseTomlString(valRaw); break;
        case "bearer_token_env_var": srv.bearerEnvVar = parseTomlString(valRaw); break;
        case "oauth_resource": srv.oauthResource = parseTomlString(valRaw); break;
        case "enabled": srv.enabled = valRaw === "true"; break;
        default: break;
      }
    }
  }

  const servers: McpServer[] = [];
  for (const raw of map.values()) {
    if (!raw.command && !raw.url) continue;
    const type: McpTransport = raw.command ? "stdio" : (raw.url?.endsWith("/sse") ? "sse" : "http");
    const server: McpServer = {
      name: raw.name,
      type,
      enabled: raw.enabled,
      source: "imported",
      ...runtimeDefaults(),
    };
    if (type === "stdio") {
      server.command = raw.command;
      if (raw.args && raw.args.length > 0) server.args = raw.args;
      if (raw.env && Object.keys(raw.env).length > 0) server.env = raw.env;
    } else {
      server.url = raw.url;
      if (raw.oauthClientId || raw.oauthResource) {
        server.auth = "oauth";
        server.oauth = { clientId: raw.oauthClientId, resource: raw.oauthResource };
      } else if (raw.bearerEnvVar) {
        // Token lives in a user env var; carry the key so the value can be
        // resolved from the environment at projection time.
        server.auth = "bearer";
        server.envSecretKeys = [raw.bearerEnvVar];
      } else {
        server.auth = "none";
      }
    }
    servers.push(server);
  }
  return { servers, tokens: {} };
}

/**
 * Merge Claude + Codex imports into a deduped registry set. On a name collision
 * (e.g. `pencil` configured in both) the first wins; ties keep the Claude
 * definition since it can carry an extracted token.
 */
export function mergeImports(...results: McpImportResult[]): McpImportResult {
  const byName = new Map<string, McpServer>();
  const tokens: Record<string, string> = {};
  for (const r of results) {
    for (const s of r.servers) {
      const key = s.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, s);
    }
    Object.assign(tokens, r.tokens);
  }
  return { servers: [...byName.values()], tokens };
}

// ─── TOML subset helpers ───

function unquoteToml(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseTomlString(v: string): string {
  // Drop an inline comment that follows a quoted value; keep '#' inside quotes.
  const t = v.trim();
  if (t.startsWith('"') || t.startsWith("'")) {
    const quote = t[0]!;
    const end = t.indexOf(quote, 1);
    if (end > 0) return t.slice(1, end);
  }
  return unquoteToml(t.replace(/\s+#.*$/, ""));
}

function parseTomlStringArray(v: string): string[] {
  const t = v.trim();
  try {
    const parsed = JSON.parse(t) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* fall through to manual parse */
  }
  const inner = t.replace(/^\[/, "").replace(/\]$/, "");
  return inner
    .split(",")
    .map((part) => unquoteToml(part.trim()))
    .filter(Boolean);
}

function stringRecord(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
