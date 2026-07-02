// The `remember` MCP tool — primary capture channel (MEMORY_EVOLUTION_DESIGN.md §7.5).
//
// This module exports the SOURCE of a tiny hand-rolled stdio MCP server as a
// string. At spawn time the plugin writes it to a per-run temp file and points
// the Claude CLI at it via `--mcp-config`. The server runs as a child of the CLI
// process; on a `remember` tool call it writes ONE JSON file per capture into
// the agent's `pending/` directory. The plugin later drains that directory into
// working memory under the MemoryWriter lock (reading + deleting whole files),
// keeping working.md single-writer while the external process only ever creates
// new files — no shared file to truncate, so no read-then-clear data loss.
//
// Protocol verified against Claude CLI 2.1.177: newline-delimited JSON-RPC 2.0,
// echo the client protocolVersion on initialize, never reply to notifications.

export const REMEMBER_TOOL_NAME = "remember";

/** MCP server name as it appears in the tool id `mcp__remember__remember`. */
export const REMEMBER_SERVER_NAME = "remember";

/** Allow-list entry that grants the whole server's tools. */
export const REMEMBER_ALLOW_ENTRY = `mcp__${REMEMBER_SERVER_NAME}`;

/** Source of the stdio MCP server. Parameterized via env:
 *  - AF_PENDING_DIR: absolute path to the agent's pending/ inbox dir (required)
 *  - AF_SOURCE: provenance label written into each record (default "mcp") */
export const REMEMBER_MCP_SERVER_SOURCE = String.raw`
const fs = require("fs");
const path = require("path");
const PENDING_DIR = process.env.AF_PENDING_DIR;
const SOURCE = process.env.AF_SOURCE || "mcp";
let seq = 0;

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function ok(id, text) { send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } }); }
function toolError(id, text) { send({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text }] } }); }

let buf = "";
process.stdin.on("data", (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try { req = JSON.parse(line); } catch { continue; }
    handle(req);
  }
});

function handle(req) {
  const id = req.id;
  const method = req.method;
  const params = req.params || {};
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      protocolVersion: params.protocolVersion || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "af-remember", version: "1.0.0" },
    }});
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: [{
      name: "remember",
      description: "Persist a durable fact about the user or how to do your work better to long-term memory. Use for standing preferences (set pin=true) and reusable procedures — not transient task details.",
      inputSchema: {
        type: "object",
        properties: {
          fact: { type: "string", description: "One concise, durable fact to remember." },
          pin: { type: "boolean", description: "Mark as a standing preference, never summarized away." },
          section: { type: "string", enum: ["Preferences", "Procedures", "Observations"], description: "Optional category." },
        },
        required: ["fact"],
      },
    }]}});
    return;
  }
  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments || {};
    if (name !== "remember") {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: "unknown tool: " + name } });
      return;
    }
    // Tool-level failures are returned as isError results (not protocol errors)
    // so the model can read the reason and retry, rather than the CLI treating
    // it as a hard tool fault.
    if (!args.fact || typeof args.fact !== "string") { toolError(id, "Missing required 'fact'."); return; }
    if (!PENDING_DIR) { toolError(id, "Memory is unavailable for this run."); return; }
    try {
      fs.mkdirSync(PENDING_DIR, { recursive: true });
      const rec = {
        text: String(args.fact),
        pinned: !!args.pin,
        section: typeof args.section === "string" ? args.section : undefined,
        source: SOURCE,
        ts: new Date().toISOString(),
      };
      const fname = Date.now() + "-" + process.pid + "-" + (seq++) + ".json";
      // Write to a temp name then rename so a concurrent drain never reads a
      // half-written file (rename is atomic on the same filesystem).
      const finalPath = path.join(PENDING_DIR, fname);
      const tmpPath = finalPath + ".tmp";
      fs.writeFileSync(tmpPath, JSON.stringify(rec) + "\n");
      fs.renameSync(tmpPath, finalPath);
      ok(id, "Remembered.");
    } catch (e) {
      toolError(id, "Failed to remember: " + String(e));
    }
    return;
  }
  if (typeof id !== "undefined") {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found: " + method } });
  }
}
`;

import { randomUUID } from "crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { normalizeAdapter } from "../adapters";

/** Paths of the per-run temp files written to expose the remember tool. */
export interface RememberToolInstall {
  /** Claude `--mcp-config` JSON file path. */
  mcpConfigPath: string;
  /** The stdio server script path (Codex registers it via `-c` overrides). */
  scriptPath: string;
  /** Absolute pending-inbox dir passed to the server as AF_PENDING_DIR. */
  pendingDir: string;
  /** Provenance label written into each captured record. */
  source: string;
  tempFiles: string[];
}

/**
 * Write the per-run temp MCP server script + config into `<cwd>/.claude` and
 * return the config path (for `--mcp-config`) plus the temp files to clean up.
 * Returns null when there is no absolute pending dir (e.g. mobile vault).
 *
 * Filenames are made UNIQUE per install (random UUID) so two agents or a
 * task+chat running in the same cwd (the default vault root) — even across
 * processes — can't clobber each other's config or have one run's cleanup
 * delete a peer's live files.
 */
export function installRememberTool(
  cwd: string,
  pendingDirAbsPath: string | null,
  source: string,
): RememberToolInstall | null {
  if (!pendingDirAbsPath) return null;
  // Fail-soft: capture is a convenience — if we can't write the temp files
  // (bad cwd, permissions, …) we return null so the run proceeds WITHOUT the
  // tool rather than aborting the agent's reply.
  try {
    const claudeDir = join(cwd, ".claude");
    if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
    const token = randomUUID();
    const scriptPath = join(claudeDir, `af-remember-mcp.${token}.cjs`);
    const configPath = join(claudeDir, `af-remember-mcp.${token}.json`);
    writeFileSync(scriptPath, REMEMBER_MCP_SERVER_SOURCE, "utf-8");
    writeFileSync(configPath, buildRememberMcpConfig(scriptPath, pendingDirAbsPath, source), "utf-8");
    return {
      mcpConfigPath: configPath,
      scriptPath,
      pendingDir: pendingDirAbsPath,
      source,
      tempFiles: [scriptPath, configPath],
    };
  } catch (err) {
    console.warn("Agent Fleet: couldn't install the remember tool; capture falls back to the text tag.", err);
    return null;
  }
}

/**
 * Backend-specific CLI args that register the remember stdio server for one
 * spawn. The server script is identical across backends; only the registration
 * mechanism differs — Claude reads a `--mcp-config` JSON file, Codex takes
 * inline `-c mcp_servers.*` TOML overrides (merged on top of ~/.codex/config.toml).
 */
export function rememberToolCliArgs(install: RememberToolInstall, adapter: string): string[] {
  // Normalize first: `adapter` is the raw frontmatter value, which may be the
  // accepted "openai-codex" spelling — without normalizing, a Codex agent would
  // wrongly get Claude's --mcp-config flag (and never register the tool).
  if (normalizeAdapter(adapter) === "codex") {
    const s = REMEMBER_SERVER_NAME;
    // `-c key=value`; value is parsed as TOML. JSON.stringify yields valid TOML
    // string/array literals for these simple values.
    return [
      "-c", `mcp_servers.${s}.command="node"`,
      "-c", `mcp_servers.${s}.args=${JSON.stringify([install.scriptPath])}`,
      "-c", `mcp_servers.${s}.env.AF_PENDING_DIR=${JSON.stringify(install.pendingDir)}`,
      "-c", `mcp_servers.${s}.env.AF_SOURCE=${JSON.stringify(install.source)}`,
    ];
  }
  return ["--mcp-config", install.mcpConfigPath];
}

/** Best-effort cleanup of the temp files written by {@link installRememberTool}. */
export function uninstallRememberTool(install: RememberToolInstall | null): void {
  if (!install) return;
  for (const f of install.tempFiles) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // best-effort
    }
  }
}

/** Build the `--mcp-config` JSON content registering the remember server. */
export function buildRememberMcpConfig(serverScriptPath: string, pendingDirAbsPath: string, source: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [REMEMBER_SERVER_NAME]: {
          command: "node",
          args: [serverScriptPath],
          env: { AF_PENDING_DIR: pendingDirAbsPath, AF_SOURCE: source },
        },
      },
    },
    null,
    2,
  );
}

/** Parse drained `pending.jsonl` lines into capture entries. Tolerant of blank
 *  / malformed lines. */
export function parsePendingLines(lines: string[]): Array<{
  text: string;
  pinned: boolean;
  section?: "Preferences" | "Procedures" | "Observations";
  source: string;
}> {
  const out: Array<{ text: string; pinned: boolean; section?: "Preferences" | "Procedures" | "Observations"; source: string }> = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as Record<string, unknown>;
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      if (!text) continue;
      const section =
        rec.section === "Preferences" || rec.section === "Procedures" || rec.section === "Observations"
          ? rec.section
          : undefined;
      out.push({
        text,
        pinned: rec.pinned === true,
        section,
        source: typeof rec.source === "string" ? rec.source : "mcp",
      });
    } catch {
      // skip malformed line
    }
  }
  return out;
}
