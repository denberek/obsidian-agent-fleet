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

import { randomUUID } from "crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { homedir, tmpdir } from "os";
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
  /** Extra teardown beyond file deletion (the Pi overlay removes a whole
   *  per-run directory of symlinks). Called by {@link uninstallMcpProjection}. */
  restore?: () => void;
}

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

/** Build the pi-mcp-adapter `mcp.json` entry for one prepared server. The
 *  adapter reads the standard `.mcp.json` shape; bearer tokens travel via
 *  `bearerTokenEnv` pointing at a spawn-env var, never written to disk. */
function piEntry(p: Prepared): { entry: Record<string, unknown>; env: Record<string, string> } {
  const env: Record<string, string> = {};
  if (p.type === "stdio") {
    const entry: Record<string, unknown> = { command: p.command, args: p.args ?? [] };
    if (p.env && Object.keys(p.env).length > 0) entry.env = p.env;
    return { entry, env };
  }
  const entry: Record<string, unknown> = { url: p.url };
  if (p.headers && Object.keys(p.headers).length > 0) entry.headers = p.headers;
  if (p.bearerToken) {
    const envVar = tokenEnvVar(p.name);
    env[envVar] = p.bearerToken;
    entry.bearerTokenEnv = envVar;
    // pi-mcp-adapter only attaches bearerTokenEnv when auth is explicitly
    // "bearer" (its auto-default covers codex-style bearer_token_env_var
    // imports, not the native shape) — without this the header is never sent
    // and the adapter falls back to interactive OAuth, which headless runs
    // can't complete.
    entry.auth = "bearer";
  }
  return { entry, env };
}

/** The real Pi agent config dir — honors an explicit parent-env
 *  PI_CODING_AGENT_DIR, else `~/.pi/agent`. Never mutates `process.env`. */
export function realPiAgentDir(): string {
  const fromEnv = process.env.PI_CODING_AGENT_DIR?.trim();
  return fromEnv ? fromEnv : join(homedir(), ".pi", "agent");
}

/** Dedicated root for per-run Pi overlays (mirrors the Codex OVERLAY_ROOT
 *  convention) so the stale-temp sweep never has to pattern-match the shared
 *  OS tmpdir. */
export function piOverlayRoot(): string {
  return join(tmpdir(), "agent-fleet-pi");
}

/** Liveness marker written into each overlay: the owning plugin process's pid.
 *  Overlays hold live symlinks for the whole life of a chat session and their
 *  mtime freezes at spawn, so the sweep checks this instead of trusting age. */
export const PI_OVERLAY_PID_FILE = ".af-pid";

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`Agent Fleet: ${message}`);
}

/** Test hook — clears the one-time warning dedup set. */
export function resetMcpProjectionWarnings(): void {
  warned.clear();
}

/**
 * Build a per-run PI_CODING_AGENT_DIR overlay carrying the projected servers
 * as `<agent dir>/mcp.json` (a config location the pi-mcp-adapter reads).
 *
 * Same mechanism as the Codex CODEX_HOME overlay: symlink every real
 * `~/.pi/agent` entry (auth.json, settings.json with its installed packages,
 * sessions/, extensions/, model caches) EXCEPT `mcp.json`, which we own for
 * this run. Auth and the installed pi-mcp-adapter stay shared through the
 * links; only the MCP server set differs per run. The overlay is a fresh
 * mkdtemp dir per spawn, so concurrent runs never collide.
 *
 * The servers are only reachable when the user has installed the community
 * `pi-mcp-adapter` package (`pi install npm:pi-mcp-adapter`) — without it the
 * written config is inert and the run proceeds tool-less on the MCP front.
 */
function buildPiOverlay(prepared: Prepared[]): {
  env: Record<string, string>;
  restore: () => void;
} {
  const realDir = realPiAgentDir();
  mkdirSync(piOverlayRoot(), { recursive: true });
  const overlay = mkdtempSync(join(piOverlayRoot(), "mcp-"));
  try {
    writeFileSync(join(overlay, PI_OVERLAY_PID_FILE), String(process.pid), "utf-8");
    if (existsSync(realDir)) {
      // Make sure the sessions dir exists in the REAL home before linking, so
      // session files written during the run land in the shared store rather
      // than dying with the overlay.
      const realSessions = join(realDir, "sessions");
      if (!existsSync(realSessions)) mkdirSync(realSessions, { recursive: true });
      for (const entry of readdirSync(realDir)) {
        if (entry === "mcp.json") continue;
        const target = join(realDir, entry);
        const dest = join(overlay, entry);
        try {
          symlinkSync(target, dest);
        } catch (linkErr) {
          // Symlinks can be unavailable (Windows without Developer Mode throws
          // EPERM). Degrade per entry instead of letting the whole projection
          // abort — an abort silently drops every fleet MCP server plus the
          // `remember` tool. Directories become junctions (no elevation
          // needed on Windows) or deep copies; files become copies. Copies
          // lose live sharing with ~/.pi/agent, but restore() copies changed
          // state back at cleanup.
          const st = statSync(target);
          if (st.isDirectory()) {
            try {
              if (process.platform !== "win32") throw linkErr;
              symlinkSync(target, dest, "junction");
            } catch {
              cpSync(target, dest, { recursive: true, force: true });
            }
          } else {
            copyFileSync(target, dest);
          }
          warnOnce(
            "pi-overlay-degraded",
            "couldn't symlink ~/.pi/agent entries into the per-run Pi overlay " +
              "(symlinks may be unavailable on this platform); falling back to copies. " +
              "State Pi writes during the run is copied back on cleanup.",
          );
        }
      }
    }

    const mcpServers: Record<string, unknown> = {};
    const env: Record<string, string> = {};
    for (const p of prepared) {
      const out = piEntry(p);
      mcpServers[p.name] = out.entry;
      Object.assign(env, out.env);
    }
    writeFileSync(join(overlay, "mcp.json"), JSON.stringify({ mcpServers }, null, 2), "utf-8");

    env.PI_CODING_AGENT_DIR = overlay;
    return {
      env,
      restore: () => {
        // Heal before removal: anything that is a REAL file or dir in the
        // overlay (not a still-valid symlink/junction) holds state only the
        // overlay has — either Pi rewrote a linked file atomically (write
        // temp + rename, the usual pattern for auth.json token refreshes,
        // which replaces our symlink with a real file), or Pi created it
        // fresh during the run (the whole sessions/ history when ~/.pi/agent
        // didn't exist at spawn, new caches, first-time credentials). Copy
        // all of it back so deleting the overlay can't destroy rotated
        // credentials or the session history a later resume depends on.
        // mcp.json and the pid marker are plugin-owned and never copied back.
        try {
          for (const entry of readdirSync(overlay)) {
            if (entry === "mcp.json" || entry === PI_OVERLAY_PID_FILE) continue;
            const overlayPath = join(overlay, entry);
            const realPath = join(realDir, entry);
            try {
              const st = lstatSync(overlayPath);
              if (st.isSymbolicLink()) continue; // still points into the real dir
              if (st.isFile()) {
                // Skip when the real copy is at least as new — in degraded
                // copy mode (no symlinks) this keeps an unchanged spawn-time
                // copy from clobbering a token another pi process rotated
                // mid-run.
                let realMtimeMs = -Infinity;
                try {
                  realMtimeMs = statSync(realPath).mtimeMs;
                } catch {
                  // no real counterpart — always copy back
                }
                if (realMtimeMs >= st.mtimeMs) continue;
                mkdirSync(realDir, { recursive: true });
                copyFileSync(overlayPath, realPath);
              } else if (st.isDirectory()) {
                mkdirSync(realDir, { recursive: true });
                cpSync(overlayPath, realPath, { recursive: true, force: true });
              }
            } catch {
              // entry gone or unreadable — nothing to heal
            }
          }
        } catch {
          // overlay already gone — nothing to heal
        }
        try {
          rmSync(overlay, { recursive: true, force: true });
        } catch {
          // best-effort — temp dir, the OS reclaims it
        }
      },
    };
  } catch (err) {
    try {
      rmSync(overlay, { recursive: true, force: true });
    } catch {
      // best-effort cleanup after a failed build
    }
    throw err;
  }
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
  const adapterId = normalizeAdapter(adapter);
  const isCodex = adapterId === "codex";

  const tempFiles: string[] = [];
  const claudeDir = join(cwd, ".claude");
  try {
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
    // Random token so concurrent installs — even across processes — never
    // collide. (pid+time+counter could repeat across two plugin processes.)
    const token = randomUUID();

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

    if (adapterId === "pi") {
      // Pi: a per-run PI_CODING_AGENT_DIR overlay whose mcp.json carries the
      // servers. No argv — everything travels via env.
      const overlay = buildPiOverlay(prepared);
      return { args: [], env: overlay.env, tempFiles, restore: overlay.restore };
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
  try {
    projection.restore?.();
  } catch {
    // best-effort
  }
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
