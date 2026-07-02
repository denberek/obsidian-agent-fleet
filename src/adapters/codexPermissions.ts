import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { homedir, tmpdir } from "os";
import { join } from "path";
import type { AgentConfig, FleetSettings } from "../types";
import { spawnCli } from "../utils/platform";
import type { PermissionSetupState } from "./types";

/**
 * Codex permission enforcement — the analog of Claude Code's
 * `.claude/settings.local.json` injection, built on Codex's execpolicy
 * `.rules` mechanism.
 *
 * Codex `exec` has NO per-invocation rules-file flag (verified against the
 * codex-rs source): execpolicy rules load only from fixed locations —
 * `$CODEX_HOME/rules/*.rules`, trust-gated `<repo>/.codex/rules/`, and
 * `/etc/codex/rules/`. Since the plugin runs agents concurrently and Codex
 * unions every `*.rules` in a directory, a shared `~/.codex/rules/` would
 * leak one agent's rules onto another.
 *
 * The isolation mechanism is therefore a PER-AGENT `CODEX_HOME`: we build a
 * directory that symlinks every real `~/.codex` entry (auth.json, config.toml,
 * sessions/, …) EXCEPT `rules/`, which we own. The spawned process gets
 * `CODEX_HOME=<overlay>` in its env. Auth, config, and session history stay
 * shared through the symlinks (so `exec resume` keeps working); only the
 * rules differ per agent. Concurrency-safe because each agent has its own
 * overlay and same-agent runs share identical rules.
 *
 * Hard limits of the mechanism (callers surface these as warnings):
 *  - Rules match argv PREFIXES only. `Bash(git push *)` translates cleanly;
 *    mid-pattern / embedded wildcards (`Bash(* --force)`, `Bash(./deploy*)`)
 *    cannot be expressed and are dropped.
 *  - Tool-name rules (`Read`, `Write`, `Edit`, …) have no execpolicy analog —
 *    file access is governed by the sandbox (permission mode), not rules.
 *  - `codex exec` forces `approval_policy = never`, under which a `prompt`
 *    decision becomes a hard DENY. We therefore emit only `allow`/`forbidden`.
 *  - There is no clean closed allowlist: `allow` rules are additive and can't
 *    express "deny everything else". Deny-list parity is faithful; Claude's
 *    "only the allow-list runs" semantics are not reproducible.
 */

export interface DroppedRule {
  rule: string;
  reason: string;
}

export interface TranslatedRules {
  /** Starlark `.rules` text, or null when nothing translatable was produced. */
  rulesText: string | null;
  /** Entries that couldn't be expressed in execpolicy, with the reason. */
  dropped: DroppedRule[];
  /** Number of `prefix_rule` lines emitted. */
  emitted: number;
}

const TOOL_NAME_RE = /^[A-Z][A-Za-z]*$/;

/** Parse the inside of a `Bash(...)` pattern into argv prefix tokens, or
 *  return why it can't be expressed as an execpolicy prefix rule. */
export function parseBashPattern(inner: string): { tokens: string[] } | { error: string } {
  const trimmed = inner.trim();
  if (!trimmed) {
    return { error: "empty Bash() matches every command — use the read-only sandbox instead" };
  }
  const rawTokens = trimmed.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    const tok = rawTokens[i]!;
    const isLast = i === rawTokens.length - 1;
    if (tok === "*") {
      if (isLast) continue; // trailing wildcard == prefix match; just stop here
      return { error: "a wildcard in the middle of a command can't be expressed as a prefix rule" };
    }
    if (tok.includes("*")) {
      return { error: "embedded wildcards aren't supported (execpolicy matches argv prefixes only)" };
    }
    tokens.push(tok);
  }
  if (tokens.length === 0) {
    return { error: "a bare wildcard matches every command — use the read-only sandbox instead" };
  }
  return { tokens };
}

function toPrefixRule(tokens: string[], decision: "allow" | "forbidden"): string {
  // JSON.stringify yields a valid Starlark double-quoted string literal for
  // each token (same escape rules for quotes/backslashes).
  const pattern = tokens.map((t) => JSON.stringify(t)).join(", ");
  return `prefix_rule(pattern=[${pattern}], decision="${decision}", justification="agent-fleet")`;
}

/** Translate an agent's Claude-style `permissionRules.allow/deny` into Codex
 *  execpolicy Starlark. `mcp__*` entries are ignored here (handled by the
 *  adapter's `-c mcp_servers.<name>.enabled` scoping). */
export function translatePermissionRules(agent: AgentConfig): TranslatedRules {
  const lines: string[] = [];
  const dropped: DroppedRule[] = [];

  const handle = (raw: string, decision: "allow" | "forbidden") => {
    const entry = raw.trim();
    if (!entry) return;
    if (entry.startsWith("mcp__")) return; // scoped via config overrides, not rules
    const bash = entry.match(/^Bash\((.*)\)$/s);
    if (!bash) {
      dropped.push({
        rule: entry,
        reason: TOOL_NAME_RE.test(entry)
          ? "tool-name rules are governed by the sandbox, not execpolicy"
          : "not a Bash(...) command pattern",
      });
      return;
    }
    const parsed = parseBashPattern(bash[1]!);
    if ("error" in parsed) {
      dropped.push({ rule: entry, reason: parsed.error });
      return;
    }
    lines.push(toPrefixRule(parsed.tokens, decision));
  };

  // Deny first then allow — order is irrelevant to enforcement (Codex applies
  // strictest-wins: forbidden > prompt > allow), but it reads naturally.
  for (const d of agent.permissionRules.deny) handle(d, "forbidden");
  for (const a of agent.permissionRules.allow) handle(a, "allow");

  if (lines.length === 0) {
    return { rulesText: null, dropped, emitted: 0 };
  }
  const header =
    `# Generated by Agent Fleet for agent "${agent.name}". Do not edit — regenerated each run.\n` +
    `# Source: this agent's permissionRules (allow/deny), translated to Codex execpolicy.\n`;
  return { rulesText: `${header}${lines.join("\n")}\n`, dropped, emitted: lines.length };
}

// ═══════════════════════════════════════════════════════
//  CODEX_HOME overlay
// ═══════════════════════════════════════════════════════

export interface OverlayResult {
  /** Absolute path to use as the spawned process's CODEX_HOME. */
  codexHome: string;
  /** Absolute path of the rules file we wrote (for validation). */
  rulesPath: string;
}

/** The real Codex home this machine uses — honors an explicit parent-env
 *  CODEX_HOME, else `~/.codex`. We never mutate `process.env`. */
export function realCodexHome(): string {
  const fromEnv = process.env.CODEX_HOME?.trim();
  return fromEnv ? fromEnv : join(homedir(), ".codex");
}

const OVERLAY_ROOT = join(tmpdir(), "agent-fleet-codex");

function overlayDirFor(agent: AgentConfig): string {
  const slug = agent.name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
  // Disambiguate by the agent's unique filePath: two agents whose names slug
  // to the same value (e.g. "deploy bot" vs "deploy.bot") would otherwise
  // share one overlay and cross-contaminate each other's execpolicy rules.
  // The hash keeps the path stable per agent (filePath is stable) while the
  // human-readable slug stays for debuggability.
  const hash = createHash("sha1").update(agent.filePath).digest("hex").slice(0, 8);
  return join(OVERLAY_ROOT, `${slug}-${hash}`);
}

function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, path);
}

/** Create-or-refresh `<overlay>/<name>` as a symlink to `<real>/<name>`. */
function ensureSymlink(target: string, linkPath: string): void {
  try {
    const st = lstatSync(linkPath);
    if (st.isSymbolicLink()) {
      try {
        if (readlinkSync(linkPath) === target) return; // already correct
      } catch { /* fall through and recreate */ }
      unlinkSync(linkPath);
    } else if (st.isDirectory()) {
      rmSync(linkPath, { recursive: true, force: true });
    } else {
      unlinkSync(linkPath);
    }
  } catch {
    // Nothing there — fine.
  }
  symlinkSync(target, linkPath);
}

/**
 * Build (or refresh) the per-agent CODEX_HOME overlay and write the rules.
 * Returns null when Codex isn't configured (`~/.codex` missing). Throws if
 * the overlay can't be built (e.g. symlinks unavailable) — callers fail-soft.
 *
 * Union semantics: the user's existing `~/.codex/rules/*.rules` are copied in
 * alongside the agent's generated rules, so a global safety policy is never
 * silently dropped for a fleet agent (strictest-wins keeps any global deny).
 */
export function buildCodexHomeOverlay(
  agent: AgentConfig,
  rulesText: string,
  realHome: string = realCodexHome(),
): OverlayResult | null {
  if (!existsSync(realHome)) return null;

  const overlay = overlayDirFor(agent);
  mkdirSync(overlay, { recursive: true });

  // Symlink every real ~/.codex entry except rules/ (which we own). Auth,
  // config, and sessions stay shared so resume + MCP config keep working.
  for (const entry of readdirSync(realHome)) {
    if (entry === "rules") continue;
    ensureSymlink(join(realHome, entry), join(overlay, entry));
  }

  const rulesDir = join(overlay, "rules");
  mkdirSync(rulesDir, { recursive: true });

  // Union in the user's global rules (overwrite, non-destructive — we don't
  // wipe the dir, to stay concurrency-safe against a same-agent run).
  const userRulesDir = join(realHome, "rules");
  if (existsSync(userRulesDir)) {
    for (const f of readdirSync(userRulesDir)) {
      if (!f.endsWith(".rules")) continue;
      try {
        copyFileSync(join(userRulesDir, f), join(rulesDir, `user-${f}`));
      } catch (err) {
        // Skip an unreadable global rule rather than fail the run — but say
        // so: the user's safety rules are being dropped for this agent's run.
        console.warn(
          `Agent Fleet: couldn't copy the Codex rules file ${join(userRulesDir, f)} into agent ` +
            `"${agent.name}"'s permission overlay (${err instanceof Error ? err.message : String(err)}); ` +
            `its rules will NOT apply to this agent's runs.`,
        );
      }
    }
  }

  const rulesPath = join(rulesDir, "agent-fleet.rules");
  writeAtomic(rulesPath, rulesText);
  return { codexHome: overlay, rulesPath };
}

/** Best-effort removal of all overlays. Call on plugin unload. */
export function cleanupCodexOverlays(): void {
  try {
    rmSync(OVERLAY_ROOT, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

// ═══════════════════════════════════════════════════════
//  Feature detection + rule validation (codex execpolicy check)
// ═══════════════════════════════════════════════════════

const supportCache = new Map<string, Promise<boolean>>();
const validatedRules = new Map<string, boolean>();

/** Test hook — clears the execpolicy support + validation caches. */
export function resetCodexPermissionCaches(): void {
  supportCache.clear();
  validatedRules.clear();
}

function runExecpolicyCheck(cliPath: string, rulesPath: string, argv: string[]): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (code: number | null) => {
      if (!settled) {
        settled = true;
        resolve(code);
      }
    };
    try {
      const proc = spawnCli(cliPath, ["execpolicy", "check", "--rules", rulesPath, ...argv]);
      const timer = window.setTimeout(() => {
        try { proc.kill(); } catch { /* ignore */ }
        done(null);
      }, 8000);
      proc.on("error", () => { window.clearTimeout(timer); done(null); });
      proc.on("close", (code) => { window.clearTimeout(timer); done(code); });
    } catch {
      done(null);
    }
  });
}

/** Whether this Codex build supports the `execpolicy check` subcommand (and,
 *  by extension, execpolicy enforcement). Cached per CLI path. */
export function probeExecpolicySupport(cliPath: string): Promise<boolean> {
  const cached = supportCache.get(cliPath);
  if (cached) return cached;
  const probe = (async () => {
    let probeDir: string | null = null;
    try {
      probeDir = mkdtempSync(join(tmpdir(), "af-codex-probe-"));
      const probeRules = join(probeDir, "probe.rules");
      writeFileSync(probeRules, 'prefix_rule(pattern=["ls"], decision="allow")\n', "utf-8");
      const code = await runExecpolicyCheck(cliPath, probeRules, ["ls"]);
      return code === 0;
    } catch {
      return false;
    } finally {
      if (probeDir) {
        try { rmSync(probeDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  })();
  supportCache.set(cliPath, probe);
  return probe;
}

/** Validate a generated rules file by loading it through `execpolicy check`.
 *  Cached by (cliPath + content hash) so steady-state runs pay no subprocess. */
export async function validateRulesFile(cliPath: string, rulesPath: string, rulesText: string): Promise<boolean> {
  const key = `${cliPath}:${createHash("sha1").update(rulesText).digest("hex")}`;
  const cached = validatedRules.get(key);
  if (cached !== undefined) return cached;
  // A dummy command is fine — a parse error fails regardless of the argv.
  const code = await runExecpolicyCheck(cliPath, rulesPath, ["true"]);
  const ok = code === 0;
  validatedRules.set(key, ok);
  return ok;
}

// ═══════════════════════════════════════════════════════
//  Orchestration
// ═══════════════════════════════════════════════════════

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`Agent Fleet: ${message}`);
}

/** Test hook — clears the one-time warning dedup set. */
export function resetCodexPermissionWarnings(): void {
  warned.clear();
}

/**
 * Set up Codex command-permission enforcement for an agent. Returns a
 * permission state carrying `CODEX_HOME` for the spawn, or null when there's
 * nothing to enforce / the mechanism is unavailable (every failure path is
 * soft — the run proceeds under sandbox-only enforcement).
 */
export async function setupCodexPermissions(
  agent: AgentConfig,
  settings: FleetSettings,
): Promise<PermissionSetupState | null> {
  const hasRules =
    agent.permissionRules.allow.length > 0 || agent.permissionRules.deny.length > 0;
  if (!hasRules) return null; // fast path: default CODEX_HOME, machine-default rules

  const { rulesText, dropped } = translatePermissionRules(agent);

  if (dropped.length > 0) {
    warnOnce(
      `dropped:${agent.name}:${dropped.map((d) => d.rule).join("|")}`,
      `agent "${agent.name}": ${dropped.length} permission rule(s) can't be enforced by Codex and were ignored — ` +
        `${dropped.map((d) => `"${d.rule}" (${d.reason})`).join("; ")}. ` +
        `File/network access is governed by the sandbox (Permission Mode).`,
    );
  }
  if (!rulesText) return null; // nothing translatable → sandbox-only

  const cliPath = settings.codexCliPath;
  const supported = await probeExecpolicySupport(cliPath);
  if (!supported) {
    warnOnce(
      `unsupported:${cliPath}`,
      `this Codex build doesn't support execpolicy rules; agent "${agent.name}" runs with sandbox-only ` +
        `enforcement. Update Codex to enforce command allow/deny rules.`,
    );
    return null;
  }

  let overlay: OverlayResult | null;
  try {
    overlay = buildCodexHomeOverlay(agent, rulesText);
  } catch (err) {
    warnOnce(
      `overlay-fail:${agent.name}`,
      `couldn't build the Codex permission overlay for agent "${agent.name}" ` +
        `(${err instanceof Error ? err.message : String(err)}); falling back to sandbox-only ` +
        `(symlinks may be unavailable on this platform).`,
    );
    return null;
  }
  if (!overlay) {
    warnOnce(
      "no-codex-home",
      `Codex home (~/.codex) not found; agent "${agent.name}" runs with sandbox-only enforcement. ` +
        `Run \`codex login\` first.`,
    );
    return null;
  }

  const valid = await validateRulesFile(cliPath, overlay.rulesPath, rulesText);
  if (!valid) {
    warnOnce(
      `invalid-rules:${agent.name}`,
      `generated Codex rules for agent "${agent.name}" failed validation; falling back to sandbox-only.`,
    );
    return null;
  }

  return {
    // The overlay is plugin-owned and reused across runs; nothing to restore.
    // Cleanup happens on plugin unload via cleanupCodexOverlays().
    restore: () => { /* no-op */ },
    env: { CODEX_HOME: overlay.codexHome },
  };
}
