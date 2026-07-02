import { TFile, normalizePath } from "obsidian";
import type { Vault } from "obsidian";
import {
  DEFAULT_MEMORY_TOKEN_BUDGET,
  DEFAULT_REFLECTION_SCHEDULE,
  DEFAULT_RECURRENCE_THRESHOLD,
} from "../constants";
import { parseMarkdownWithFrontmatter } from "../utils/markdown";
import { asBoolean, asNumber, asString, asStringArray, isRecord } from "./shared";
import type {
  AgentConfig,
  ChannelConfig,
  FleetSettings,
  ReflectionConfig,
  SkillConfig,
  TaskConfig,
} from "../types";

export type ParsedEntity = AgentConfig | SkillConfig | TaskConfig;

/**
 * Everything the entity parsers need from their host. Extracted verbatim from
 * the FleetRepository facade — the parsers used to be private methods closing
 * over `this`; the context object is the same surface, made explicit:
 *
 * - `reportIssue` lands parse failures in the load-time validation-issue map
 *   (NOT the reference-issue map — see EntityStore for the two-tier split).
 * - `clearIssue` drops a stale load-time issue keyed on a member file (e.g.
 *   permissions.json) before that file is re-evaluated on a folder reload.
 * - The `warned*` sets are owned by the store so one-time console warnings
 *   stay one-time across reloads.
 */
export interface ParserContext {
  vault: Vault;
  settings: FleetSettings;
  reportIssue(path: string, message: string): void;
  clearIssue(path: string): void;
  warnedLegacyPerms: Set<string>;
  warnedFolderAgentModelConflict: Set<string>;
}

let warnedLegacyBudget = false;

/**
 * Resolve an agent's working-memory token budget. Prefers the new
 * `memory_token_budget`; if absent but the deprecated `memory_max_entries` is
 * present, fall back to the default budget and emit a one-time console notice
 * (design §13.4 — the old entry-count knob no longer maps cleanly to a budget).
 */
function resolveMemoryTokenBudget(
  fm: Record<string, unknown>,
  fallback: Record<string, unknown> = {},
): number {
  const explicit = fm.memory_token_budget ?? fallback.memory_token_budget;
  if (explicit !== undefined) return asNumber(explicit, DEFAULT_MEMORY_TOKEN_BUDGET);
  const legacy = fm.memory_max_entries ?? fallback.memory_max_entries;
  if (legacy !== undefined && !warnedLegacyBudget) {
    warnedLegacyBudget = true;
    console.info(
      "Agent Fleet: `memory_max_entries` is deprecated and no longer enforced; " +
        "memory is now bounded by `memory_token_budget` (default " +
        `${DEFAULT_MEMORY_TOKEN_BUDGET}). Set that field to tune memory size.`,
    );
  }
  return DEFAULT_MEMORY_TOKEN_BUDGET;
}

/** Build a {@link ReflectionConfig} from frontmatter, with an optional fallback
 *  frontmatter (folder agents split fields across config.md and agent.md). */
function parseReflectionConfig(
  fm: Record<string, unknown>,
  fallback: Record<string, unknown> = {},
): ReflectionConfig {
  const pick = (key: string): unknown => fm[key] ?? fallback[key];
  return {
    enabled: asBoolean(pick("reflection_enabled"), false),
    schedule: asString(pick("reflection_schedule")) ?? DEFAULT_REFLECTION_SCHEDULE,
    recurrenceThreshold: asNumber(pick("reflection_recurrence_threshold"), DEFAULT_RECURRENCE_THRESHOLD),
    proposeSkills: asBoolean(pick("reflection_propose_skills"), false),
    model: asString(pick("reflection_model")),
  };
}

/** For a flat agent at `<dir>/<name>.md`, the permissions sidecar lives at
 *  `<dir>/<name>.permissions.json`. Folder agents use `<folder>/permissions.json`
 *  (handled in loadFolderAgent). */
export function sidecarPermissionsPath(agentMdPath: string): string {
  return normalizePath(agentMdPath.replace(/\.md$/, ".permissions.json"));
}

/** Coerce a frontmatter `env:` block into a string→string map (numbers and
 *  booleans stringified, other value shapes dropped). */
function parseEnvMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") {
      result[k] = v;
    } else if (typeof v === "number" || typeof v === "boolean") {
      result[k] = String(v);
    }
  }
  return result;
}

/** Parse a `wiki_references:` frontmatter list into an array of references.
 *  Accepts either `[{ agent: "name" }, ...]` or shorthand `["name", ...]`.
 *  Returns undefined when the field is absent. */
function parseWikiReferences(raw: unknown): AgentConfig["wikiReferences"] {
  if (!Array.isArray(raw)) return undefined;
  const refs: Array<{ agent: string }> = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      refs.push({ agent: item.trim() });
    } else if (item && typeof item === "object") {
      const agent = (item as Record<string, unknown>).agent;
      if (typeof agent === "string" && agent.trim()) {
        refs.push({ agent: agent.trim() });
      }
    }
  }
  return refs.length > 0 ? refs : undefined;
}

/** Parse a `wiki_keeper:` frontmatter block into a WikiKeeperConfig.
 *  Returns undefined when no block is present — agents without this
 *  are regular agents, unaffected. */
function parseWikiKeeperConfig(raw: unknown): AgentConfig["wikiKeeper"] {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  return {
    scopeRoot: asString(r.scope_root) ?? "",
    inboxPath: asString(r.inbox_path) ?? "_sources/inbox",
    archivePath: asString(r.archive_path) ?? "_sources/archive",
    failedPath: asString(r.failed_path) ?? "_sources/failed",
    topicsRoot: asString(r.topics_root) ?? "_topics",
    indexPath: asString(r.index_path) ?? "index.md",
    logPath: asString(r.log_path) ?? "log.md",
    watchedFolders: asStringArray(r.watched_folders),
    excludePatterns: asStringArray(r.exclude_patterns),
    watchedSince: asString(r.watched_since) ?? "",
    // Default flipped to TRUE in v1.3 — Karpathy compounding requires
    // substantive answers to file themselves back into the wiki.
    fileSubstantiveAnswers: asBoolean(r.file_substantive_answers, true),
    obsidianUrlScheme: asBoolean(r.obsidian_url_scheme, true),
    maxTokensPerIngest: asNumber(r.max_tokens_per_ingest, 60000),
    maxTokensPerRefresh: asNumber(r.max_tokens_per_refresh, 30000),
    indexSplitThreshold: asNumber(r.index_split_threshold, 100),
    dedupSimilarityThreshold: asNumber(r.dedup_similarity_threshold, 0.82),
    summaryStaleDays: asNumber(r.summary_stale_days, 30),
    stateFile: asString(r.state_file) ?? ".wiki-keeper-state.json",
  };
}

// ═══════════════════════════════════════════════════════
//  Flat entity parsers (single .md files)
// ═══════════════════════════════════════════════════════

export function parseAgent(ctx: ParserContext, path: string, content: string): AgentConfig | null {
  const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
  if (!isRecord(frontmatter)) {
    ctx.reportIssue(path, "Invalid frontmatter.");
    return null;
  }

  const name = asString(frontmatter.name);
  const model = asString(frontmatter.model) ?? ctx.settings.defaultModel;
  if (!name || !model) {
    ctx.reportIssue(path, "Agent requires string field `name` and a valid model or default model setting.");
    return null;
  }

  // Legacy migration for flat agents: pull rules from frontmatter
  // allowed_tools/blocked_tools when present. The sidecar
  // <name>.permissions.json (read in loadFile) will override these if it
  // exists and parses cleanly. Saving the agent rewrites rules to the
  // sidecar and stops emitting the legacy frontmatter fields.
  const legacyAllow = asStringArray(frontmatter.allowed_tools);
  const legacyDeny = asStringArray(frontmatter.blocked_tools);
  if ((legacyAllow.length > 0 || legacyDeny.length > 0) && !ctx.warnedLegacyPerms.has(name)) {
    ctx.warnedLegacyPerms.add(name);
    console.warn(
      `Agent Fleet: "${name}" still uses legacy allowed_tools/blocked_tools in its frontmatter. ` +
        `Permission rules now live in <name>.permissions.json beside the .md. Open Edit and Save to migrate.`,
    );
  }

  return {
    filePath: path,
    name,
    description: asString(frontmatter.description),
    model,
    adapter: asString(frontmatter.adapter) ?? "claude-code",
    permissionMode: asString(frontmatter.permission_mode) ?? "bypassPermissions",
    effort: asString(frontmatter.effort),
    maxRetries: asNumber(frontmatter.max_retries, 1),
    skills: asStringArray(frontmatter.skills),
    mcpServers: asStringArray(frontmatter.mcp_servers),
    cwd: asString(frontmatter.cwd),
    enabled: asBoolean(frontmatter.enabled, true),
    timeout: asNumber(frontmatter.timeout, 300),
    approvalRequired: asStringArray(frontmatter.approval_required),
    memory: asBoolean(frontmatter.memory, false),
    memoryMaxEntries: asNumber(frontmatter.memory_max_entries, 100),
    memoryTokenBudget: resolveMemoryTokenBudget(frontmatter),
    reflection: parseReflectionConfig(frontmatter),
    autoCompactThreshold: asNumber(frontmatter.auto_compact_threshold, 85),
    tags: asStringArray(frontmatter.tags),
    avatar: asString(frontmatter.avatar) ?? "",
    body,
    contextBody: "",
    skillsBody: "",
    env: parseEnvMap(frontmatter.env),
    permissionRules: { allow: legacyAllow, deny: legacyDeny },
    isFolder: false,
    heartbeatEnabled: false,
    heartbeatSchedule: "",
    heartbeatBody: "",
    heartbeatNotify: true,
    heartbeatChannel: "",
    heartbeatChannelTarget: "",
  };
}

export function parseSkill(ctx: ParserContext, path: string, content: string): SkillConfig | null {
  const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
  const name = asString(frontmatter.name);
  if (!name) {
    ctx.reportIssue(path, "Skill requires string field `name`.");
    return null;
  }

  return {
    filePath: path,
    name,
    description: asString(frontmatter.description),
    tags: asStringArray(frontmatter.tags),
    body,
    toolsBody: "",
    referencesBody: "",
    examplesBody: "",
    isFolder: false,
  };
}

export function parseTask(ctx: ParserContext, path: string, content: string): TaskConfig | null {
  const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
  const taskId = asString(frontmatter.task_id);
  const agent = asString(frontmatter.agent);
  const type = asString(frontmatter.type) as TaskConfig["type"] | undefined;
  if (!taskId || !agent || !type) {
    ctx.reportIssue(path, "Task requires `task_id`, `agent`, and `type`.");
    return null;
  }
  if (type === "recurring" && !asString(frontmatter.schedule)) {
    ctx.reportIssue(path, "Recurring task requires `schedule`.");
    return null;
  }
  if (type === "once" && !asString(frontmatter.run_at)) {
    ctx.reportIssue(path, "One-time task requires `run_at`.");
    return null;
  }

  const rawPriority = asString(frontmatter.priority);
  const validPriorities = ["low", "medium", "high", "critical"];
  const priority = (rawPriority && validPriorities.includes(rawPriority) ? rawPriority : "medium") as TaskConfig["priority"];

  return {
    filePath: path,
    taskId,
    agent,
    schedule: asString(frontmatter.schedule),
    runAt: asString(frontmatter.run_at),
    type,
    priority,
    enabled: asBoolean(frontmatter.enabled, true),
    created: asString(frontmatter.created) ?? new Date().toISOString(),
    lastRun: asString(frontmatter.last_run),
    nextRun: asString(frontmatter.next_run),
    runCount: asNumber(frontmatter.run_count, 0),
    catchUp: asBoolean(frontmatter.catch_up, ctx.settings.catchUpMissedTasks),
    effort: asString(frontmatter.effort),
    model: asString(frontmatter.model),
    channel: asString(frontmatter.channel),
    channelTarget: asString(frontmatter.channel_target),
    tags: asStringArray(frontmatter.tags),
    body,
  };
}

export function parseChannelFile(ctx: ParserContext, path: string, content: string): ChannelConfig | null {
  const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);

  const name = asString(frontmatter.name);
  if (!name) {
    ctx.reportIssue(path, "Channel requires string field `name`.");
    return null;
  }

  const rawType = asString(frontmatter.type);
  const validTypes: readonly string[] = ["slack", "telegram", "discord"];
  if (!rawType || !validTypes.includes(rawType)) {
    ctx.reportIssue(
      path,
      `Channel \`${name}\` requires \`type\` to be one of: ${validTypes.join(", ")}.`,
    );
    return null;
  }
  const type = rawType as ChannelConfig["type"];

  // `default_agent` is the canonical field; `agent` is accepted as a backward-compat alias.
  const defaultAgent = asString(frontmatter.default_agent) ?? asString(frontmatter.agent);
  if (!defaultAgent) {
    ctx.reportIssue(path, `Channel \`${name}\` requires \`default_agent\` (or \`agent\`).`);
    return null;
  }

  const allowedAgents = asStringArray(frontmatter.allowed_agents);

  const credentialRef = asString(frontmatter.credential_ref);
  if (!credentialRef) {
    ctx.reportIssue(
      path,
      `Channel \`${name}\` requires \`credential_ref\` pointing at a configured credential.`,
    );
    return null;
  }

  const transport = isRecord(frontmatter.transport) ? frontmatter.transport : {};

  return {
    filePath: path,
    name,
    type,
    defaultAgent,
    allowedAgents,
    enabled: asBoolean(frontmatter.enabled, true),
    credentialRef,
    allowedUsers: asStringArray(frontmatter.allowed_users),
    perUserSessions: asBoolean(frontmatter.per_user_sessions, true),
    channelContext: asString(frontmatter.channel_context) ?? "",
    transport,
    tags: asStringArray(frontmatter.tags),
    body,
  };
}

// ═══════════════════════════════════════════════════════
//  Folder entity loaders (agents/<name>/agent.md + member files,
//  skills/<name>/skill.md + member files)
// ═══════════════════════════════════════════════════════

export async function loadFolderSkill(
  ctx: ParserContext,
  folderPath: string,
  skillMdFile: TFile,
): Promise<SkillConfig | null> {
  const skillContent = await ctx.vault.cachedRead(skillMdFile);
  const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(skillContent);

  const name = asString(frontmatter.name);
  if (!name) {
    ctx.reportIssue(skillMdFile.path, "Folder skill skill.md requires string field `name`.");
    return null;
  }

  const readBody = async (fileName: string): Promise<string> => {
    const path = normalizePath(`${folderPath}/${fileName}`);
    const file = ctx.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return "";
    const content = await ctx.vault.cachedRead(file);
    const parsed = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    return parsed.body;
  };

  return {
    filePath: skillMdFile.path,
    name,
    description: asString(frontmatter.description),
    tags: asStringArray(frontmatter.tags),
    body,
    toolsBody: await readBody("tools.md"),
    referencesBody: await readBody("references.md"),
    examplesBody: await readBody("examples.md"),
    isFolder: true,
  };
}

export async function loadFolderAgent(
  ctx: ParserContext,
  folderPath: string,
  agentMdFile: TFile,
): Promise<AgentConfig | null> {
  const agentContent = await ctx.vault.cachedRead(agentMdFile);
  const { frontmatter: agentFm, body: agentBody } = parseMarkdownWithFrontmatter<Record<string, unknown>>(agentContent);

  const name = asString(agentFm.name);
  if (!name) {
    ctx.reportIssue(agentMdFile.path, "Folder agent agent.md requires string field `name`.");
    return null;
  }

  // Read config.md
  let configFm: Record<string, unknown> = {};
  const configPath = normalizePath(`${folderPath}/config.md`);
  const configFile = ctx.vault.getAbstractFileByPath(configPath);
  if (configFile instanceof TFile) {
    const configContent = await ctx.vault.cachedRead(configFile);
    const parsed = parseMarkdownWithFrontmatter<Record<string, unknown>>(configContent);
    configFm = parsed.frontmatter;
  }

  // Read permissions.json — canonical source of truth for allow/deny rules.
  // Legacy migration: if permissions.json is missing or empty BUT config.md
  // carries `allowed_tools`/`blocked_tools` (the dead surface from older
  // versions of this plugin), surface those values as permissionRules so
  // the agent keeps working. The next call to updateAgent / updateWiki-
  // KeeperAgent rewrites them into permissions.json proper.
  let permissionRules: { allow: string[]; deny: string[] } = { allow: [], deny: [] };
  const permissionsPath = normalizePath(`${folderPath}/permissions.json`);
  // Folder reloads bypass clearStoredFile, so drop any stale issue keyed on
  // the permissions file before re-evaluating it (avoids duplicates).
  ctx.clearIssue(permissionsPath);
  const permissionsFile = ctx.vault.getAbstractFileByPath(permissionsPath);
  if (permissionsFile instanceof TFile) {
    try {
      const permContent = await ctx.vault.cachedRead(permissionsFile);
      const parsed = JSON.parse(permContent) as Record<string, unknown>;
      permissionRules = {
        allow: asStringArray(parsed.allow),
        deny: asStringArray(parsed.deny),
      };
    } catch (err) {
      // Fail-soft (the agent still loads) but loud: with the file unreadable
      // the agent would otherwise silently run with EMPTY permission rules.
      console.error(
        `Agent Fleet: invalid JSON in ${permissionsPath} — agent "${name}" is running with EMPTY permission rules`,
        err,
      );
      ctx.reportIssue(
        permissionsPath,
        `Invalid JSON in permissions.json for agent \`${name}\` — permission rules are NOT applied. Fix or delete the file.`,
      );
    }
  }
  if (permissionRules.allow.length === 0 && permissionRules.deny.length === 0) {
    const legacyAllow = asStringArray(configFm.allowed_tools);
    const legacyDeny = asStringArray(configFm.blocked_tools);
    if (legacyAllow.length > 0 || legacyDeny.length > 0) {
      permissionRules = { allow: legacyAllow, deny: legacyDeny };
      if (!ctx.warnedLegacyPerms.has(name)) {
        ctx.warnedLegacyPerms.add(name);
        console.warn(
          `Agent Fleet: "${name}" still uses legacy allowed_tools/blocked_tools in config.md. ` +
            `Permission rules now live in permissions.json. Open this agent in Edit and Save to migrate.`,
        );
      }
    }
  }

  // Read SKILLS.md body
  let skillsBody = "";
  const skillsPath = normalizePath(`${folderPath}/SKILLS.md`);
  const skillsFile = ctx.vault.getAbstractFileByPath(skillsPath);
  if (skillsFile instanceof TFile) {
    const skillsContent = await ctx.vault.cachedRead(skillsFile);
    const parsed = parseMarkdownWithFrontmatter<Record<string, unknown>>(skillsContent);
    skillsBody = parsed.body;
  }

  // Read CONTEXT.md body
  let contextBody = "";
  const contextPath = normalizePath(`${folderPath}/CONTEXT.md`);
  const contextFile = ctx.vault.getAbstractFileByPath(contextPath);
  if (contextFile instanceof TFile) {
    const contextContent = await ctx.vault.cachedRead(contextFile);
    const parsed = parseMarkdownWithFrontmatter<Record<string, unknown>>(contextContent);
    contextBody = parsed.body;
  }

  // Read HEARTBEAT.md — autonomous periodic run instruction
  let heartbeatEnabled = false;
  let heartbeatSchedule = "";
  let heartbeatBody = "";
  let heartbeatNotify = true;
  let heartbeatChannel = "";
  let heartbeatChannelTarget = "";
  const heartbeatPath = normalizePath(`${folderPath}/HEARTBEAT.md`);
  const heartbeatFile = ctx.vault.getAbstractFileByPath(heartbeatPath);
  if (heartbeatFile instanceof TFile) {
    const heartbeatContent = await ctx.vault.cachedRead(heartbeatFile);
    const parsed = parseMarkdownWithFrontmatter<Record<string, unknown>>(heartbeatContent);
    heartbeatEnabled = asBoolean(parsed.frontmatter.enabled, false);
    heartbeatSchedule = asString(parsed.frontmatter.schedule) ?? "";
    heartbeatNotify = asBoolean(parsed.frontmatter.notify, true);
    heartbeatChannel = asString(parsed.frontmatter.channel) ?? "";
    heartbeatChannelTarget = asString(parsed.frontmatter.channel_target) ?? "";
    heartbeatBody = parsed.body;
  }

  // Model canonical home is config.md for folder agents. agent.md's `model:`
  // field is deprecated but still warned-about when it conflicts with
  // config.md so users can clean up their vaults.
  const agentMdModel = asString(agentFm.model);
  const configModel = asString(configFm.model);
  if (agentMdModel && configModel && agentMdModel !== configModel) {
    if (!ctx.warnedFolderAgentModelConflict.has(name)) {
      ctx.warnedFolderAgentModelConflict.add(name);
      console.warn(
        `Agent Fleet: "${name}" has conflicting model fields — agent.md says "${agentMdModel}", config.md says "${configModel}". config.md wins. Remove agent.md's model field or sync the values to silence this warning.`,
      );
    }
  }
  const model = configModel ?? agentMdModel ?? ctx.settings.defaultModel;

  return {
    filePath: agentMdFile.path,
    name,
    description: asString(agentFm.description),
    model,
    adapter: asString(configFm.adapter) ?? "claude-code",
    permissionMode: asString(configFm.permission_mode) ?? "bypassPermissions",
    effort: asString(configFm.effort),
    maxRetries: asNumber(configFm.max_retries, 1),
    skills: asStringArray(agentFm.skills),
    mcpServers: asStringArray(agentFm.mcp_servers),
    cwd: asString(configFm.cwd) || asString(agentFm.cwd),
    enabled: asBoolean(agentFm.enabled, true),
    timeout: asNumber(configFm.timeout, asNumber(agentFm.timeout, 300)),
    approvalRequired: asStringArray(configFm.approval_required),
    memory: asBoolean(configFm.memory, asBoolean(agentFm.memory, false)),
    memoryMaxEntries: asNumber(configFm.memory_max_entries, 100),
    memoryTokenBudget: resolveMemoryTokenBudget(configFm, agentFm),
    reflection: parseReflectionConfig(configFm, agentFm),
    autoCompactThreshold: asNumber(
      configFm.auto_compact_threshold ?? agentFm.auto_compact_threshold,
      85,
    ),
    tags: asStringArray(agentFm.tags),
    avatar: asString(agentFm.avatar) ?? "",
    body: agentBody,
    contextBody,
    skillsBody,
    env: parseEnvMap(configFm.env),
    permissionRules,
    isFolder: true,
    heartbeatEnabled,
    heartbeatSchedule,
    heartbeatBody,
    heartbeatNotify,
    heartbeatChannel,
    heartbeatChannelTarget,
    wikiKeeper: parseWikiKeeperConfig(configFm.wiki_keeper ?? agentFm.wiki_keeper),
    wikiReferences: parseWikiReferences(configFm.wiki_references ?? agentFm.wiki_references),
  };
}
