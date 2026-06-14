// MCP projection — the single mechanism that makes a fleet-registered MCP
// server available to ANY adapter at run time (MCP v2).
//
// The fleet registry (`_fleet/mcp/*.md`) is the source of truth. At spawn time
// the caller resolves the effective set of servers (enabled ∩ agent grants,
// plus the synthetic `remember` tool) and their secrets (bearer/OAuth tokens,
// secret env values) from SecretStore, then asks this module to PROJECT them
// into the chosen adapter:
//
//   • Claude Code → one merged `--mcp-config <file>` JSON (additive — layers on
//     top of ~/.claude.json without mutating it). stdio entries are
//     {command,args,env}; http/sse entries are {type,url,headers} with the
//     bearer injected into the Authorization header.
//   • Codex → per-server `-c mcp_servers.<name>.* = <TOML>` overrides (merged on
//     top of ~/.codex/config.toml without mutating it). HTTP bearer tokens go
//     via `bearer_token_env_var` pointing at an env var we set on the spawn, so
//     the token never appears in argv or on disk.
//
// This module is PURE w.r.t. secrets and the vault: the caller does all secret
// resolution and passes plain strings in. It only touches the filesystem to
// write per-run temp files (the merged Claude config + any inline stdio server
// scripts), all cleaned up via {@link uninstallMcpProjection}. Fail-soft: any
// write failure returns null so the run proceeds with no fleet MCP rather than
// aborting, and one bad server is dropped (logged) without poisoning the rest.

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import type { McpServer, McpTransport } from "../types";
import { normalizeAdapter } from "../adapters";
import { REMEMBER_MCP_SERVER_SOURCE, REMEMBER_SERVER_NAME } from "./rememberMcpServer";

/** Secret material resolved by the caller (from McpAuthManager / SecretStore). */
export interface ResolvedMcpSecrets {
  /** Bearer token for an http/sse server (becomes `Authorization: Bearer …`). */
  bearerToken?: string;
  /** Secret env values for a stdio server, keyed by env var name. Merged on top
   *  of the server's non-secret `env`. */
  env?: Record<string, string>;
}

/** One server to project, with its resolved secrets. */
export interface ProjectedMcpServer {
  def: McpServer;
  secrets?: ResolvedMcpSecrets;
  /** When set, the source is written to a per-run temp `.cjs` and used as the
   *  single stdio argument (command must be "node"). Used by the `remember`
   *  tool, whose server lives as an embedded source string. */
  inlineScript?: string;
}

/** The injection for one run: extra CLI args, extra spawn env, and the temp
 *  files to remove afterwards. */
export interface McpProjection {
  args: string[];
  env: Record<string, string>;
  tempFiles: string[];
}

/** Monotonic suffix so concurrent installs in the same cwd never collide. */
let projectionSeq = 0;

/**
 * Descriptor for the per-run `remember` capture tool, fed through the same
 * projection pipe as any other stdio server. `AF_PENDING_DIR` / `AF_SOURCE` are
 * non-secret env; the server source is materialized to a temp file at install.
 */
export function syntheticRememberServer(pendingDirAbsPath: string, source: string): ProjectedMcpServer {
  return {
    def: {
      name: REMEMBER_SERVER_NAME,
      type: "stdio",
      enabled: true,
      command: "node",
      env: { AF_PENDING_DIR: pendingDirAbsPath, AF_SOURCE: source },
      status: "connected",
      scope: "user",
      tools: [],
      toolDetails: [],
    },
    inlineScript: REMEMBER_MCP_SERVER_SOURCE,
  };
}

/**
 * Resolve the effective set of servers for one run, with secrets attached:
 * enabled registry servers, filtered by the agent's grants, plus the synthetic
 * `remember` tool. Shared by ExecutionManager and ChatSession so both produce
 * an identical projection.
 *
 * `agentGrants` follows the existing `agent.mcpServers` semantics: empty = all
 * enabled fleet servers (no restriction, matching both adapters' prior
 * behavior); non-empty = only those names, case-insensitive.
 */
export function resolveProjectedServers(opts: {
  registry: McpServer[];
  agentGrants: string[];
  /** Resolve a bearer token for an http/sse server (from McpAuthManager). */
  getBearerToken: (name: string) => string | undefined;
  /** When set, the `remember` capture tool is appended. */
  remember?: { pendingDir: string; source: string } | null;
}): ProjectedMcpServer[] {
  const grants = opts.agentGrants.map((n) => n.trim().toLowerCase()).filter(Boolean);
  const grantSet = grants.length > 0 ? new Set(grants) : null;

  const out: ProjectedMcpServer[] = [];
  for (const def of opts.registry) {
    if (!def.enabled) continue;
    if (grantSet && !grantSet.has(def.name.trim().toLowerCase())) continue;
    if (def.type === "unknown") continue;

    const secrets: ResolvedMcpSecrets = {};
    if (def.type === "stdio") {
      // Secret env values come from the inherited login-shell environment
      // (the spawn already sources ~/.zshenv). Inject explicitly when present
      // so the value reaches the child regardless of CLI env-passing behavior.
      if (def.envSecretKeys && def.envSecretKeys.length > 0) {
        const env: Record<string, string> = {};
        for (const key of def.envSecretKeys) {
          const val = process.env[key];
          if (val) env[key] = val;
        }
        if (Object.keys(env).length > 0) secrets.env = env;
      }
    } else if (def.auth !== "none") {
      const token = opts.getBearerToken(def.name);
      if (token) secrets.bearerToken = token;
    }
    out.push({ def, secrets });
  }

  if (opts.remember) {
    out.push(syntheticRememberServer(opts.remember.pendingDir, opts.remember.source));
  }
  return out;
}

/** Normalized, secret-merged view of a server ready to emit for either adapter. */
interface Prepared {
  name: string;
  type: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  bearerToken?: string;
  oauthResource?: string;
  oauthClientId?: string;
}

/** Uppercase env-var-safe slug for a server's projected bearer token. */
function tokenEnvVar(name: string): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `AF_MCP_${slug || "SERVER"}_TOKEN`;
}

/** Quote a server name for a TOML dotted path if it needs it (matches the
 *  codex adapter's helper). */
function tomlKey(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`;
}

/** Merge a server def + its secrets (+ a materialized script path) into the
 *  normalized form. Throws if a required field is missing so the caller can
 *  drop just this server. */
function prepare(server: ProjectedMcpServer, scriptPath: string | null): Prepared {
  const { def, secrets } = server;
  if (def.type === "unknown") throw new Error(`server ${def.name} has unknown transport`);
  const type = def.type;

  if (type === "stdio") {
    const command = def.command ?? "node";
    const args = scriptPath ? [scriptPath] : def.args ?? [];
    const env = { ...(def.env ?? {}), ...(secrets?.env ?? {}) };
    return { name: def.name, type, command, args, env };
  }

  if (!def.url) throw new Error(`server ${def.name} (${type}) has no url`);
  return {
    name: def.name,
    type,
    url: def.url,
    headers: def.headers,
    bearerToken: secrets?.bearerToken,
    oauthResource: def.oauth?.resource,
    oauthClientId: def.oauth?.clientId,
  };
}

/** Build the Claude `--mcp-config` JSON entry for one prepared server. */
function claudeEntry(p: Prepared): Record<string, unknown> {
  if (p.type === "stdio") {
    const entry: Record<string, unknown> = { command: p.command, args: p.args ?? [] };
    if (p.env && Object.keys(p.env).length > 0) entry.env = p.env;
    return entry;
  }
  const headers: Record<string, string> = { ...(p.headers ?? {}) };
  if (p.bearerToken) headers.Authorization = `Bearer ${p.bearerToken}`;
  const entry: Record<string, unknown> = { type: p.type, url: p.url };
  if (Object.keys(headers).length > 0) entry.headers = headers;
  return entry;
}

/** Build the Codex `-c mcp_servers.<name>.*` overrides for one prepared server.
 *  Returns the args plus any spawn env (the bearer token, kept out of argv). */
function codexArgs(p: Prepared): { args: string[]; env: Record<string, string> } {
  const k = tomlKey(p.name);
  const args: string[] = [];
  const env: Record<string, string> = {};

  if (p.type === "stdio") {
    args.push("-c", `mcp_servers.${k}.command=${JSON.stringify(p.command ?? "node")}`);
    if (p.args && p.args.length > 0) {
      args.push("-c", `mcp_servers.${k}.args=${JSON.stringify(p.args)}`);
    }
    for (const [ek, ev] of Object.entries(p.env ?? {})) {
      args.push("-c", `mcp_servers.${k}.env.${tomlKey(ek)}=${JSON.stringify(ev)}`);
    }
  } else {
    args.push("-c", `mcp_servers.${k}.url=${JSON.stringify(p.url)}`);
    if (p.bearerToken) {
      const envVar = tokenEnvVar(p.name);
      env[envVar] = p.bearerToken;
      args.push("-c", `mcp_servers.${k}.bearer_token_env_var=${JSON.stringify(envVar)}`);
    }
    if (p.oauthResource) {
      args.push("-c", `mcp_servers.${k}.oauth_resource=${JSON.stringify(p.oauthResource)}`);
    }
    if (p.oauthClientId) {
      args.push("-c", `mcp_servers.${k}.oauth.client_id=${JSON.stringify(p.oauthClientId)}`);
    }
  }
  // Make sure the server is live for this invocation even if disabled globally
  // in the user's native config.
  args.push("-c", `mcp_servers.${k}.enabled=true`);
  return { args, env };
}

/**
 * Materialize the per-run projection for one spawn. Writes any inline stdio
 * scripts (+ the merged Claude config) into `<cwd>/.claude` and returns the
 * args/env to inject. Returns null when there's nothing to project or when the
 * filesystem write fails (fail-soft — the run proceeds without fleet MCP).
 */
export function installMcpProjection(
  cwd: string,
  adapter: string,
  servers: ProjectedMcpServer[],
): McpProjection | null {
  if (servers.length === 0) return null;
  const isCodex = normalizeAdapter(adapter) === "codex";

  const tempFiles: string[] = [];
  const claudeDir = join(cwd, ".claude");
  try {
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
    const token = `${process.pid}-${Date.now()}-${projectionSeq++}`;

    // Prepare each server (materialize inline scripts). Drop any that fail so a
    // single broken definition doesn't take down the whole run.
    const prepared: Prepared[] = [];
    let idx = 0;
    for (const server of servers) {
      try {
        let scriptPath: string | null = null;
        if (server.inlineScript) {
          scriptPath = join(claudeDir, `af-mcp-${slugForFile(server.def.name)}.${token}-${idx}.cjs`);
          writeFileSync(scriptPath, server.inlineScript, "utf-8");
          tempFiles.push(scriptPath);
        }
        prepared.push(prepare(server, scriptPath));
      } catch (err) {
        console.warn(`Agent Fleet: skipping MCP server "${server.def.name}" in projection:`, err);
      }
      idx++;
    }
    if (prepared.length === 0) {
      cleanup(tempFiles);
      return null;
    }

    if (isCodex) {
      const args: string[] = [];
      const env: Record<string, string> = {};
      for (const p of prepared) {
        const out = codexArgs(p);
        args.push(...out.args);
        Object.assign(env, out.env);
      }
      return { args, env, tempFiles };
    }

    // Claude: one merged config file.
    const mcpServers: Record<string, unknown> = {};
    for (const p of prepared) {
      mcpServers[p.name] = claudeEntry(p);
    }
    const configPath = join(claudeDir, `af-mcp.${token}.json`);
    writeFileSync(configPath, JSON.stringify({ mcpServers }, null, 2), "utf-8");
    tempFiles.push(configPath);
    return { args: ["--mcp-config", configPath], env: {}, tempFiles };
  } catch (err) {
    console.warn("Agent Fleet: couldn't install MCP projection; run proceeds without fleet MCP.", err);
    cleanup(tempFiles);
    return null;
  }
}

/** Best-effort cleanup of the per-run temp files. */
export function uninstallMcpProjection(projection: McpProjection | null): void {
  if (!projection) return;
  cleanup(projection.tempFiles);
}

function cleanup(files: string[]): void {
  for (const f of files) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // best-effort
    }
  }
}

/** Filesystem-safe fragment of a server name for temp filenames. */
function slugForFile(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "server";
}
