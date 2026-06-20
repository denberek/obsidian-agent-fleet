import { join } from "path";
import { App, FileSystemAdapter, TFile, TFolder, Vault, normalizePath } from "obsidian";
import {
  DEFAULT_SETTINGS,
  DEFAULT_MEMORY_TOKEN_BUDGET,
  DEFAULT_REFLECTION_SCHEDULE,
  DEFAULT_RECURRENCE_THRESHOLD,
  FLEET_SUBFOLDERS,
} from "./constants";
import { DEFAULT_FILES } from "./defaults";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter, slugify } from "./utils/markdown";
import {
  migrateLegacyBody,
  parseWorkingMemory,
  renderSections,
  serializeWorkingMemory,
} from "./utils/memoryFormat";
import { splitLines } from "./utils/platform";
import type {
  AgentConfig,
  ChannelConfig,
  ChannelCredentialEntry,
  ConversationMeta,
  FleetSettings,
  FleetSnapshot,
  MemoryFile,
  McpServer,
  ReflectionConfig,
  RunLogData,
  SkillCandidate,
  SkillProposal,
  WorkingMemory,
  SkillConfig,
  TaskConfig,
  UsageRecord,
  ValidationIssue,
} from "./types";

type ParsedEntity = AgentConfig | SkillConfig | TaskConfig;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Coerce a frontmatter value into a `Record<string,string>`, dropping any
 *  non-string values. Returns undefined when there's nothing usable so callers
 *  can omit the field entirely. */
function asStringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
function sidecarPermissionsPath(agentMdPath: string): string {
  return normalizePath(agentMdPath.replace(/\.md$/, ".permissions.json"));
}

/** Fast non-cryptographic hash for change detection on default files. */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash.toString(36);
}

export class FleetRepository {
  private agents = new Map<string, AgentConfig>();
  private skills = new Map<string, SkillConfig>();
  private tasks = new Map<string, TaskConfig>();
  private channels = new Map<string, ChannelConfig>();
  private mcpServers = new Map<string, McpServer>();
  private validationIssues = new Map<string, ValidationIssue[]>();

  private channelCredentialGetter?: () => Record<string, ChannelCredentialEntry>;

  /** Agents we've already logged a folder-model-conflict warning for. */
  private warnedFolderAgentModelConflict = new Set<string>();
  private warnedLegacyPerms = new Set<string>();
  /** Agents whose legacy→v2 memory migration is in flight, so the unlocked
   *  reflection path and the lock-held capture path can't double-seed raw. */
  private migratingMemory = new Set<string>();

  private readonly vault: Vault;
  constructor(private readonly app: App, private readonly settings: FleetSettings) {
    this.vault = app.vault;
  }

  /** Inject a live credential getter so validation reads from the credential store
   *  instead of the (possibly empty post-migration) settings.channelCredentials. */
  setChannelCredentialGetter(getter: () => Record<string, ChannelCredentialEntry>): void {
    this.channelCredentialGetter = getter;
  }

  getVaultBasePath(): string | undefined {
    const adapter = this.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : undefined;
  }

  getFleetRoot(): string {
    return normalizePath(this.settings.fleetFolder);
  }

  getSubfolder(name: (typeof FLEET_SUBFOLDERS)[number]): string {
    return normalizePath(`${this.getFleetRoot()}/${name}`);
  }

  async ensureFleetStructure(): Promise<boolean> {
    const root = this.getFleetRoot();
    const isFirstRun = !this.vault.getAbstractFileByPath(root);
    await this.ensureFolder(root);
    for (const subfolder of FLEET_SUBFOLDERS) {
      await this.ensureFolder(this.getSubfolder(subfolder));
    }
    return isFirstRun;
  }

  async ensureSamples(): Promise<void> {
    const root = this.getFleetRoot();
    for (const file of DEFAULT_FILES) {
      const fullPath = normalizePath(`${root}/${file.path}`);
      const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      await this.ensureFolder(parentDir);
      await this.createFileIfMissing(fullPath, file.content);
    }
  }

  /**
   * Update default files that the user hasn't customized. For each default file:
   * - If missing on disk → write it and store the hash
   * - If on disk and hash matches stored hash → user hasn't touched it → overwrite
   * - If on disk and hash differs → user customized it → leave it alone
   *
   * Returns the updated hashes map so the caller can persist it to settings.
   */
  async updateDefaults(storedHashes: Record<string, string>): Promise<Record<string, string>> {
    const root = this.getFleetRoot();
    const updatedHashes = { ...storedHashes };

    for (const file of DEFAULT_FILES) {
      const fullPath = normalizePath(`${root}/${file.path}`);
      const newHash = simpleHash(file.content);
      const storedHash = storedHashes[file.path];

      // If the stored hash already matches the new content, nothing to do
      if (storedHash === newHash) continue;

      const existing = this.vault.getAbstractFileByPath(fullPath);
      if (!(existing instanceof TFile)) {
        // File doesn't exist → write it
        const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        await this.ensureFolder(parentDir);
        await this.createFileIfMissing(fullPath, file.content);
        updatedHashes[file.path] = newHash;
        continue;
      }

      // File exists — check if user has customized it
      const currentContent = await this.vault.cachedRead(existing);
      const currentHash = simpleHash(currentContent);

      if (!storedHash || currentHash === storedHash) {
        // No stored hash (first update run) or user hasn't edited since last write → safe to overwrite
        await this.vault.modify(existing, file.content);
        updatedHashes[file.path] = newHash;
      }
      // else: user customized the file — leave it alone
    }

    return updatedHashes;
  }

  async loadAll(): Promise<FleetSnapshot> {
    this.agents.clear();
    this.skills.clear();
    this.tasks.clear();
    this.channels.clear();
    this.mcpServers.clear();
    this.validationIssues.clear();

    // Load folder-based agents and skills first
    await this.loadFolderAgents();
    await this.loadFolderSkills();

    const files = this.vault
      .getMarkdownFiles()
      .filter((file) => file.path.startsWith(`${this.getFleetRoot()}/`));

    for (const file of files) {
      await this.loadFile(file);
    }

    this.validateReferences();
    return this.getSnapshot();
  }

  async loadFile(fileOrPath: TFile | string): Promise<void> {
    const file = typeof fileOrPath === "string" ? this.vault.getAbstractFileByPath(fileOrPath) : fileOrPath;
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }

    // Files inside agent folders need to reload the whole folder agent
    if (this.isInsideAgentFolder(file.path)) {
      await this.reloadFolderAgentContaining(file.path);
      return;
    }

    // Files inside skill folders need to reload the whole folder skill
    if (this.isInsideSkillFolder(file.path)) {
      await this.reloadFolderSkillContaining(file.path);
      return;
    }

    this.clearStoredFile(file.path);

    // Channel files live under _fleet/channels/ and are parsed through a dedicated
    // path that does NOT flow through parseFile(). This keeps channels out of the
    // ParsedEntity union (AgentConfig | SkillConfig | TaskConfig) and lets their
    // validation (type discrimination, approval_required block) live beside the
    // parser.
    const channelsPrefix = `${this.getSubfolder("channels")}/`;
    if (file.path.startsWith(channelsPrefix)) {
      // Skip nested files (e.g. sessions/<id>.json). Only top-level *.md are channel configs.
      const rel = file.path.slice(channelsPrefix.length);
      if (!rel.includes("/")) {
        const content = await this.vault.cachedRead(file);
        const channel = this.parseChannelFile(file.path, content);
        if (channel) {
          this.channels.set(file.path, channel);
        }
      }
      return;
    }

    // MCP server registry files live under _fleet/mcp/ and, like channels, are
    // parsed through a dedicated path that does NOT flow through parseFile()
    // (they're not part of the ParsedEntity union).
    const mcpPrefix = `${this.getSubfolder("mcp")}/`;
    if (file.path.startsWith(mcpPrefix)) {
      const rel = file.path.slice(mcpPrefix.length);
      if (!rel.includes("/")) {
        const content = await this.vault.cachedRead(file);
        const server = this.parseMcpServerFile(file.path, content);
        if (server) {
          this.mcpServers.set(file.path, server);
        }
      }
      return;
    }

    const content = await this.vault.cachedRead(file);
    const parsed = this.parseFile(file.path, content);
    if (parsed) {
      if ("taskId" in parsed) {
        this.tasks.set(file.path, parsed);
      } else if ("model" in parsed) {
        // Flat agent: sidecar `<name>.permissions.json` wins over legacy
        // frontmatter allowed_tools/blocked_tools when both exist.
        if (!parsed.isFolder) {
          const sidecarPath = sidecarPermissionsPath(file.path);
          const sidecarFile = this.vault.getAbstractFileByPath(sidecarPath);
          if (sidecarFile instanceof TFile) {
            try {
              const sidecarContent = await this.vault.cachedRead(sidecarFile);
              const data = JSON.parse(sidecarContent) as Record<string, unknown>;
              parsed.permissionRules = {
                allow: asStringArray(data.allow),
                deny: asStringArray(data.deny),
              };
            } catch {
              // Invalid sidecar JSON — keep whatever permissionRules parseAgent assigned.
            }
          }
        }
        this.agents.set(file.path, parsed);
      } else {
        this.skills.set(file.path, parsed);
      }
    }
  }

  private async reloadFolderAgentContaining(filePath: string): Promise<void> {
    const agentsDir = `${this.getSubfolder("agents")}/`;
    const relative = filePath.slice(agentsDir.length);
    const folderName = relative.split("/")[0];
    if (!folderName) return;

    const folderPath = normalizePath(`${agentsDir}${folderName}`);
    const agentMdPath = normalizePath(`${folderPath}/agent.md`);

    // Clear any existing entry for this folder agent
    this.agents.delete(agentMdPath);

    const folder = this.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return;

    const agentMdFile = this.vault.getAbstractFileByPath(agentMdPath);
    if (!(agentMdFile instanceof TFile)) return;

    const agent = await this.loadFolderAgent(folderPath, agentMdFile);
    if (agent) {
      this.agents.set(agentMdPath, agent);
    }
  }

  private isInsideAgentFolder(path: string): boolean {
    const agentsDir = `${this.getSubfolder("agents")}/`;
    if (!path.startsWith(agentsDir)) return false;
    const relative = path.slice(agentsDir.length);
    return relative.includes("/");
  }

  private isInsideSkillFolder(path: string): boolean {
    const skillsDir = `${this.getSubfolder("skills")}/`;
    if (!path.startsWith(skillsDir)) return false;
    const relative = path.slice(skillsDir.length);
    return relative.includes("/");
  }

  private async reloadFolderSkillContaining(filePath: string): Promise<void> {
    const skillsDir = `${this.getSubfolder("skills")}/`;
    const relative = filePath.slice(skillsDir.length);
    const folderName = relative.split("/")[0];
    if (!folderName) return;

    const folderPath = normalizePath(`${skillsDir}${folderName}`);
    const skillMdPath = normalizePath(`${folderPath}/skill.md`);

    this.skills.delete(skillMdPath);

    const folder = this.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return;

    const skillMdFile = this.vault.getAbstractFileByPath(skillMdPath);
    if (!(skillMdFile instanceof TFile)) return;

    const skill = await this.loadFolderSkill(folderPath, skillMdFile);
    if (skill) {
      this.skills.set(skillMdPath, skill);
    }
  }

  private async loadFolderSkills(): Promise<void> {
    const skillsFolder = this.vault.getAbstractFileByPath(this.getSubfolder("skills"));
    if (!(skillsFolder instanceof TFolder)) return;

    for (const child of skillsFolder.children) {
      if (!(child instanceof TFolder)) continue;
      const skillMdPath = normalizePath(`${child.path}/skill.md`);
      const skillMdFile = this.vault.getAbstractFileByPath(skillMdPath);
      if (!(skillMdFile instanceof TFile)) continue;

      const skill = await this.loadFolderSkill(child.path, skillMdFile);
      if (skill) {
        this.skills.set(skillMdPath, skill);
      }
    }
  }

  private async loadFolderSkill(folderPath: string, skillMdFile: TFile): Promise<SkillConfig | null> {
    const skillContent = await this.vault.cachedRead(skillMdFile);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(skillContent);

    const name = asString(frontmatter.name);
    if (!name) {
      this.setIssue(skillMdFile.path, "Folder skill skill.md requires string field `name`.");
      return null;
    }

    const readBody = async (fileName: string): Promise<string> => {
      const path = normalizePath(`${folderPath}/${fileName}`);
      const file = this.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return "";
      const content = await this.vault.cachedRead(file);
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

  private async loadFolderAgents(): Promise<void> {
    const agentsFolder = this.vault.getAbstractFileByPath(this.getSubfolder("agents"));
    if (!(agentsFolder instanceof TFolder)) return;

    for (const child of agentsFolder.children) {
      if (!(child instanceof TFolder)) continue;
      const agentMdPath = normalizePath(`${child.path}/agent.md`);
      const agentMdFile = this.vault.getAbstractFileByPath(agentMdPath);
      if (!(agentMdFile instanceof TFile)) continue;

      const agent = await this.loadFolderAgent(child.path, agentMdFile);
      if (agent) {
        this.agents.set(agentMdPath, agent);
      }
    }
  }

  private async loadFolderAgent(folderPath: string, agentMdFile: TFile): Promise<AgentConfig | null> {
    const agentContent = await this.vault.cachedRead(agentMdFile);
    const { frontmatter: agentFm, body: agentBody } = parseMarkdownWithFrontmatter<Record<string, unknown>>(agentContent);

    const name = asString(agentFm.name);
    if (!name) {
      this.setIssue(agentMdFile.path, "Folder agent agent.md requires string field `name`.");
      return null;
    }

    // Read config.md
    let configFm: Record<string, unknown> = {};
    const configPath = normalizePath(`${folderPath}/config.md`);
    const configFile = this.vault.getAbstractFileByPath(configPath);
    if (configFile instanceof TFile) {
      const configContent = await this.vault.cachedRead(configFile);
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
    const permissionsFile = this.vault.getAbstractFileByPath(permissionsPath);
    if (permissionsFile instanceof TFile) {
      try {
        const permContent = await this.vault.cachedRead(permissionsFile);
        const parsed = JSON.parse(permContent) as Record<string, unknown>;
        permissionRules = {
          allow: asStringArray(parsed.allow),
          deny: asStringArray(parsed.deny),
        };
      } catch {
        // Invalid JSON — ignore
      }
    }
    if (permissionRules.allow.length === 0 && permissionRules.deny.length === 0) {
      const legacyAllow = asStringArray(configFm.allowed_tools);
      const legacyDeny = asStringArray(configFm.blocked_tools);
      if (legacyAllow.length > 0 || legacyDeny.length > 0) {
        permissionRules = { allow: legacyAllow, deny: legacyDeny };
        if (!this.warnedLegacyPerms.has(name)) {
          this.warnedLegacyPerms.add(name);
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
    const skillsFile = this.vault.getAbstractFileByPath(skillsPath);
    if (skillsFile instanceof TFile) {
      const skillsContent = await this.vault.cachedRead(skillsFile);
      const parsed = parseMarkdownWithFrontmatter<Record<string, unknown>>(skillsContent);
      skillsBody = parsed.body;
    }

    // Read CONTEXT.md body
    let contextBody = "";
    const contextPath = normalizePath(`${folderPath}/CONTEXT.md`);
    const contextFile = this.vault.getAbstractFileByPath(contextPath);
    if (contextFile instanceof TFile) {
      const contextContent = await this.vault.cachedRead(contextFile);
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
    const heartbeatFile = this.vault.getAbstractFileByPath(heartbeatPath);
    if (heartbeatFile instanceof TFile) {
      const heartbeatContent = await this.vault.cachedRead(heartbeatFile);
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
      if (!this.warnedFolderAgentModelConflict.has(name)) {
        this.warnedFolderAgentModelConflict.add(name);
        console.warn(
          `Agent Fleet: "${name}" has conflicting model fields — agent.md says "${agentMdModel}", config.md says "${configModel}". config.md wins. Remove agent.md's model field or sync the values to silence this warning.`,
        );
      }
    }
    const model = configModel ?? agentMdModel ?? this.settings.defaultModel;

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
      env: this.parseEnvMap(configFm.env),
      permissionRules,
      isFolder: true,
      heartbeatEnabled,
      heartbeatSchedule,
      heartbeatBody,
      heartbeatNotify,
      heartbeatChannel,
      heartbeatChannelTarget,
      wikiKeeper: this.parseWikiKeeperConfig(configFm.wiki_keeper ?? agentFm.wiki_keeper),
      wikiReferences: this.parseWikiReferences(configFm.wiki_references ?? agentFm.wiki_references),
    };
  }

  /** Parse a `wiki_references:` frontmatter list into an array of references.
   *  Accepts either `[{ agent: "name" }, ...]` or shorthand `["name", ...]`.
   *  Returns undefined when the field is absent. */
  private parseWikiReferences(raw: unknown): AgentConfig["wikiReferences"] {
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
  private parseWikiKeeperConfig(raw: unknown): AgentConfig["wikiKeeper"] {
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

  removeFile(path: string): void {
    this.clearStoredFile(path);
  }

  getSnapshot(): FleetSnapshot {
    return {
      agents: Array.from(this.agents.values()).sort((a, b) => a.name.localeCompare(b.name)),
      skills: Array.from(this.skills.values()).sort((a, b) => a.name.localeCompare(b.name)),
      tasks: Array.from(this.tasks.values()).sort((a, b) => a.taskId.localeCompare(b.taskId)),
      channels: Array.from(this.channels.values()).sort((a, b) => a.name.localeCompare(b.name)),
      mcpServers: Array.from(this.mcpServers.values()).sort((a, b) => a.name.localeCompare(b.name)),
      validationIssues: Array.from(this.validationIssues.values()).flat(),
    };
  }

  getAgentByName(name: string): AgentConfig | undefined {
    return Array.from(this.agents.values()).find((agent) => agent.name === name);
  }

  getSkillByName(name: string): SkillConfig | undefined {
    return Array.from(this.skills.values()).find((skill) => skill.name === name);
  }

  getTaskById(taskId: string): TaskConfig | undefined {
    return Array.from(this.tasks.values()).find((task) => task.taskId === taskId);
  }

  getTasksForAgent(agentName: string): TaskConfig[] {
    return Array.from(this.tasks.values()).filter((task) => task.agent === agentName);
  }

  getChannelByName(name: string): ChannelConfig | undefined {
    return Array.from(this.channels.values()).find((channel) => channel.name === name);
  }

  getChannelsForAgent(agentName: string): ChannelConfig[] {
    return Array.from(this.channels.values()).filter((channel) => channel.defaultAgent === agentName);
  }

  /** All registered MCP servers, sorted by name. */
  getMcpServers(): McpServer[] {
    return Array.from(this.mcpServers.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getMcpServerByName(name: string): McpServer | undefined {
    return Array.from(this.mcpServers.values()).find((s) => s.name === name);
  }

  getRunsRoot(): string {
    return this.getSubfolder("runs");
  }

  /** @deprecated Legacy flat memory file path. New layout uses
   *  {@link getWorkingMemoryPath}. Retained for migration + back-compat. */
  getMemoryPath(agentName: string): string {
    return normalizePath(`${this.getSubfolder("memory")}/${slugify(agentName)}.md`);
  }

  /** Folder holding an agent's v2 memory: working.md, candidates.md, raw/. */
  getMemoryDir(agentName: string): string {
    return normalizePath(`${this.getSubfolder("memory")}/${slugify(agentName)}`);
  }

  /** Path to the curated, injected working-memory file (§6.2). */
  getWorkingMemoryPath(agentName: string): string {
    return normalizePath(`${this.getMemoryDir(agentName)}/working.md`);
  }

  /** Path to a day's append-only raw archive (§6.3). */
  getRawMemoryPath(agentName: string, dateIso: string): string {
    const day = dateIso.slice(0, 10); // YYYY-MM-DD
    return normalizePath(`${this.getMemoryDir(agentName)}/raw/${day}.md`);
  }

  /**
   * Read an agent's working memory as the structured v2 object. Resolves either
   * layout: the v2 `working.md` if present, otherwise the legacy flat file
   * migrated in-memory (the first write persists the folder layout). Returns
   * null when the agent has no memory yet.
   */
  async readWorkingMemory(agentName: string): Promise<WorkingMemory | null> {
    const workingPath = this.getWorkingMemoryPath(agentName);
    const workingFile = this.vault.getAbstractFileByPath(workingPath);
    if (workingFile instanceof TFile) {
      const content = await this.vault.cachedRead(workingFile);
      return parseWorkingMemory(content, workingPath, agentName);
    }

    const legacyPath = this.getMemoryPath(agentName);
    const legacyFile = this.vault.getAbstractFileByPath(legacyPath);
    if (legacyFile instanceof TFile) {
      const content = await this.vault.cachedRead(legacyFile);
      const { body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
      return migrateLegacyBody(body, workingPath, agentName);
    }

    return null;
  }

  /**
   * Persist working memory to `working.md`, creating the folder layout and
   * trashing the legacy flat file if one still exists (completes migration).
   */
  async writeWorkingMemory(agentName: string, wm: WorkingMemory): Promise<void> {
    const workingPath = this.getWorkingMemoryPath(agentName);
    await this.ensureFolder(this.getMemoryDir(agentName));
    const content = serializeWorkingMemory(wm);
    const existing = this.vault.getAbstractFileByPath(workingPath);
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
    } else {
      await this.createFileIfMissing(workingPath, content);
    }

    // Complete migration: retire the legacy flat file once v2 exists.
    const legacyPath = this.getMemoryPath(agentName);
    if (legacyPath !== workingPath && this.vault.getAbstractFileByPath(legacyPath)) {
      await this.trashFile(legacyPath);
    }
  }

  /**
   * One-time migration of an agent's legacy flat memory file to the v2 folder
   * layout. Crucially, the legacy content is SEEDED INTO THE RAW ARCHIVE first,
   * so "ground truth is never destroyed" (§ design overview, §13.1) holds even
   * if the first reflection later summarizes the working copy. Without this, a
   * reflection running before any capture could permanently drop pre-v2 memory.
   * No-op when already migrated (working.md exists) or there is no legacy file.
   */
  async migrateLegacyMemory(agentName: string): Promise<void> {
    const workingPath = this.getWorkingMemoryPath(agentName);
    if (this.vault.getAbstractFileByPath(workingPath)) return; // already v2
    const legacyPath = this.getMemoryPath(agentName);
    const legacyFile = this.vault.getAbstractFileByPath(legacyPath);
    if (!(legacyFile instanceof TFile)) return;
    // Guard against a concurrent in-flight migration of the same agent (the
    // reflection path calls this unlocked while a capture may run it under the
    // MemoryWriter lock) — without it, both pass the existence check above and
    // each seed the raw archive, duplicating the migration block.
    if (this.migratingMemory.has(agentName)) return;
    this.migratingMemory.add(agentName);
    try {
      const content = await this.vault.cachedRead(legacyFile);
      const { body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
      const nowIso = new Date().toISOString();

      // 1. Seed the raw archive with the legacy content (permanent ground truth).
      const seedLines = body
        .split("\n")
        .map((l) => l.replace(/^\s*[-*]\s+/, "").trim())
        .filter((l) => l.length > 0 && !/^#{1,6}\s/.test(l));
      const rawLines = [
        `- ${nowIso} [migrated] Imported ${seedLines.length} legacy memory ` +
          `entr${seedLines.length === 1 ? "y" : "ies"} (pre-v2).`,
        ...seedLines.map((t) => `- ${nowIso} [migrated] ${t}`),
      ];
      await this.appendRawMemory(agentName, rawLines, nowIso);

      // 2. Write the v2 working memory; writeWorkingMemory trashes the legacy file.
      const wm = migrateLegacyBody(body, workingPath, agentName, nowIso);
      await this.writeWorkingMemory(agentName, wm);
    } finally {
      this.migratingMemory.delete(agentName);
    }
  }

  /** Migrate every memory-enabled agent's legacy file once (called on load,
   *  before reflection jobs are registered). */
  async migrateAllLegacyMemory(): Promise<void> {
    for (const agent of this.getSnapshot().agents) {
      if (!agent.memory) continue;
      try {
        await this.migrateLegacyMemory(agent.name);
      } catch (err) {
        console.warn(`Agent Fleet: legacy memory migration failed for "${agent.name}"`, err);
      }
    }
  }

  /** Vault-relative path to the agent's MCP-tool capture inbox directory (§7.5).
   *  Each capture is written as its own JSON file inside it. */
  getPendingDir(agentName: string): string {
    return normalizePath(`${this.getMemoryDir(agentName)}/pending`);
  }

  /** Absolute on-disk path to the pending inbox dir, for the MCP server's env.
   *  Null when the vault is not a local filesystem (e.g. mobile). */
  getPendingDirAbsolutePath(agentName: string): string | null {
    const adapter = this.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return null;
    return join(adapter.getBasePath(), this.getPendingDir(agentName));
  }

  /** Ensure the agent's memory folder exists. */
  async ensureMemoryDir(agentName: string): Promise<void> {
    await this.ensureFolder(this.getMemoryDir(agentName));
  }

  /**
   * Drain the MCP-tool capture inbox: read every JSON file the external server
   * wrote, delete each one, and return their lines. Goes through the raw vault
   * ADAPTER (not the TFile cache) because those files are created out-of-process
   * and may not be in Obsidian's metadata index yet. Reading + deleting whole
   * files means we never truncate a file mid-append, so a capture landing during
   * a drain is just picked up by the next drain — no read-then-clear loss.
   * Caller serializes via the MemoryWriter lock.
   */
  async readAndClearPending(agentName: string): Promise<string[]> {
    const adapter = this.vault.adapter;
    const dir = this.getPendingDir(agentName);
    let files: string[];
    try {
      if (!(await adapter.exists(dir))) return [];
      files = (await adapter.list(dir)).files;
    } catch {
      return [];
    }
    const lines: string[] = [];
    for (const filePath of files) {
      if (!filePath.endsWith(".json")) continue; // ignore .tmp partials
      try {
        const content = await adapter.read(filePath);
        // Remove BEFORE folding the lines in: if remove() fails we skip this
        // file (retried next drain) rather than folding it now and re-folding
        // the same capture next time — which would duplicate raw-archive lines.
        await adapter.remove(filePath);
        for (const l of content.split("\n")) if (l.trim().length > 0) lines.push(l);
      } catch {
        // skip an unreadable / not-yet-removable file (picked up next drain)
      }
    }
    return lines;
  }

  /** Read the recent raw archive (last `days` daily files) for reflection. */
  async readRecentRaw(agentName: string, days = 2): Promise<string> {
    const dir = normalizePath(`${this.getMemoryDir(agentName)}/raw`);
    const folder = this.vault.getAbstractFileByPath(dir);
    if (!(folder instanceof TFolder)) return "";
    const files = folder.children
      .filter((c): c is TFile => c instanceof TFile && c.extension === "md")
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, days);
    const parts: string[] = [];
    for (const f of files.reverse()) {
      parts.push(`### ${f.basename}\n${await this.vault.cachedRead(f)}`);
    }
    return parts.join("\n\n");
  }

  /** Path to the agent's skill-candidate ledger. */
  getCandidatesPath(agentName: string): string {
    return normalizePath(`${this.getMemoryDir(agentName)}/candidates.json`);
  }

  async readCandidates(agentName: string): Promise<SkillCandidate[]> {
    const path = this.getCandidatesPath(agentName);
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];
    try {
      const parsed = JSON.parse(await this.vault.cachedRead(file)) as unknown;
      return Array.isArray(parsed) ? (parsed as SkillCandidate[]) : [];
    } catch {
      return [];
    }
  }

  async writeCandidates(agentName: string, candidates: SkillCandidate[]): Promise<void> {
    const path = this.getCandidatesPath(agentName);
    await this.ensureFolder(this.getMemoryDir(agentName));
    const content = JSON.stringify(candidates, null, 2);
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.vault.modify(file, content);
    else await this.createFileIfMissing(path, content);
  }

  // ═══════════════════════════════════════════════════════
  //  Skill proposals (memory → skills, §9)
  // ═══════════════════════════════════════════════════════

  getProposalsDir(): string {
    return normalizePath(`${this.getFleetRoot()}/proposals`);
  }

  /** List all proposals, newest first. */
  async listProposals(): Promise<SkillProposal[]> {
    const folder = this.vault.getAbstractFileByPath(this.getProposalsDir());
    if (!(folder instanceof TFolder)) return [];
    const out: SkillProposal[] = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      const p = await this.readProposal(child.basename);
      if (p) out.push(p);
    }
    out.sort((a, b) => b.created.localeCompare(a.created));
    return out;
  }

  async readProposal(id: string): Promise<SkillProposal | null> {
    const path = normalizePath(`${this.getProposalsDir()}/${id}.md`);
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(
      await this.vault.cachedRead(file),
    );
    const type = frontmatter.type === "skill_modify" ? "skill_modify" : "skill_create";
    const status =
      frontmatter.status === "accepted" || frontmatter.status === "rejected"
        ? frontmatter.status
        : "pending";
    return {
      id,
      type,
      agent: asString(frontmatter.agent) ?? "",
      status,
      created: asString(frontmatter.created) ?? "",
      targetSkill: asString(frontmatter.target_skill),
      candidate: asString(frontmatter.candidate),
      evidence: asStringArray(frontmatter.evidence),
      rationale: asString(frontmatter.rationale) ?? "",
      body,
    };
  }

  async writeProposal(p: SkillProposal): Promise<void> {
    await this.ensureFolder(this.getProposalsDir());
    const path = normalizePath(`${this.getProposalsDir()}/${p.id}.md`);
    const fm: Record<string, unknown> = {
      id: p.id,
      type: p.type,
      agent: p.agent,
      status: p.status,
      created: p.created,
      target_skill: p.targetSkill || undefined,
      candidate: p.candidate || undefined,
      evidence: p.evidence.length ? p.evidence : undefined,
      rationale: p.rationale || undefined,
    };
    const content = stringifyMarkdownWithFrontmatter(fm, p.body || "");
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.vault.modify(file, content);
    else await this.createFileIfMissing(path, content);
  }

  async setProposalStatus(id: string, status: SkillProposal["status"]): Promise<void> {
    const p = await this.readProposal(id);
    if (!p) return;
    p.status = status;
    await this.writeProposal(p);
  }

  /** Apply an accepted proposal: create the new skill (skill_create) or append
   *  the proposed change to the target skill (skill_modify). Returns the path of
   *  the affected skill, or null on no-op. */
  async applyProposal(p: SkillProposal): Promise<string | null> {
    if (p.type === "skill_create") {
      const name = p.targetSkill || `learned-${slugify(p.rationale).slice(0, 24) || "skill"}`;
      const path = await this.getAvailablePath(this.getSubfolder("skills"), slugify(name));
      // Use the actual (de-duplicated) filename as the skill name so two
      // proposals for the same pattern can't mint colliding skill names —
      // getAvailablePath only de-dupes the file path, not the frontmatter name.
      const finalName = path.split("/").pop()?.replace(/\.md$/, "") || slugify(name);
      const fm = {
        name: finalName,
        description: p.rationale || `Auto-proposed from recurring pattern for ${p.agent}.`,
        tags: ["proposed"],
      };
      await this.vault.create(path, stringifyMarkdownWithFrontmatter(fm, p.body || "Skill instructions go here."));
      return path;
    }
    // skill_modify: append the proposed change to the target skill as an addendum.
    if (p.targetSkill) {
      const skill = this.getSkillByName(p.targetSkill);
      if (skill) {
        const file = this.vault.getAbstractFileByPath(skill.filePath);
        if (file instanceof TFile) {
          const existing = await this.vault.cachedRead(file);
          const addendum = `\n\n## Proposed update (${new Date().toISOString().slice(0, 10)})\n${p.body}`;
          await this.vault.modify(file, `${existing.trimEnd()}${addendum}\n`);
          return skill.filePath;
        }
      }
    }
    return null;
  }

  async deleteProposal(id: string): Promise<void> {
    await this.trashFile(normalizePath(`${this.getProposalsDir()}/${id}.md`));
  }

  /** Append timestamped lines to the day's raw archive (§6.3). Ground truth —
   *  append-only, never injected. Caller serializes via the MemoryWriter lock. */
  async appendRawMemory(agentName: string, lines: string[], dateIso: string): Promise<void> {
    if (lines.length === 0) return;
    const path = this.getRawMemoryPath(agentName, dateIso);
    await this.ensureFolder(path.replace(/\/[^/]+$/, ""));
    const block = lines.map((l) => l.trimEnd()).join("\n");
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const existing = await this.vault.cachedRead(file);
      await this.vault.modify(file, `${existing.trimEnd()}\n${block}\n`);
    } else {
      await this.createFileIfMissing(path, `${block}\n`);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Conversation registry (in-app multi-conversation)
  // ═══════════════════════════════════════════════════════

  /** Folder that holds per-conversation JSON files for an agent. Folder
   *  agents nest under their own folder; flat agents share the memory dir. */
  private getConversationsDir(agent: AgentConfig): string {
    if (agent.isFolder) {
      const folderPath = agent.filePath.replace(/\/agent\.md$/, "");
      return normalizePath(`${folderPath}/conversations`);
    }
    const memoryDir = this.getMemoryPath(agent.name).replace(/\/[^/]+$/, "");
    return normalizePath(`${memoryDir}/${agent.name}-conversations`);
  }

  /** Path to a conversation's state file. The id is slugified for safety
   *  on disk; callers should treat the original id as opaque. */
  private getConversationPath(agent: AgentConfig, conversationId: string): string {
    const dir = this.getConversationsDir(agent);
    const safeId = slugify(conversationId) || "conversation";
    return normalizePath(`${dir}/${safeId}.json`);
  }

  /** List all conversations for an agent, sorted by lastActive desc.
   *  Scans the conversations/ folder; pre-feature chat.json files (if any)
   *  are intentionally NOT surfaced here — see the "no migration" decision
   *  in the conversation-feature design notes. */
  async listConversations(agent: AgentConfig): Promise<ConversationMeta[]> {
    const out: ConversationMeta[] = [];
    const dir = this.getConversationsDir(agent);
    const folder = this.vault.getAbstractFileByPath(dir);
    if (folder instanceof TFolder) {
      for (const child of folder.children) {
        if (!(child instanceof TFile) || child.extension !== "json") continue;
        const id = child.basename;
        const meta = await this.readConversationMeta(child, id);
        if (meta) out.push(meta);
      }
    }
    out.sort((a, b) => b.lastActive.localeCompare(a.lastActive));
    return out;
  }

  private async readConversationMeta(
    file: TFile,
    id: string,
  ): Promise<ConversationMeta | null> {
    try {
      const content = await this.vault.cachedRead(file);
      const state = JSON.parse(content) as {
        name?: string;
        lastActive?: string;
        messages?: unknown[];
      };
      return {
        id,
        name: state.name?.trim() || "Untitled",
        lastActive: state.lastActive ?? new Date(file.stat.mtime).toISOString(),
        messageCount: Array.isArray(state.messages) ? state.messages.length : 0,
      };
    } catch {
      return null;
    }
  }

  /** Create an empty conversation file with a given id + name. Idempotent —
   *  if the file already exists, leaves it alone (callers can just switch
   *  into it). */
  async createConversation(agent: AgentConfig, id: string, name: string): Promise<void> {
    const path = this.getConversationPath(agent, id);
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return;
    const dir = path.replace(/\/[^/]+$/, "");
    await this.ensureFolder(dir);
    const now = new Date().toISOString();
    const state = {
      sessionId: null,
      messages: [],
      lastActive: now,
      createdAt: now,
      name: name.trim(),
    };
    await this.vault.create(path, JSON.stringify(state, null, 2));
  }

  /** Rename a conversation by writing a new `name` field into its state file. */
  async renameConversation(agent: AgentConfig, conversationId: string, name: string): Promise<void> {
    const path = this.getConversationPath(agent, conversationId);
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const content = await this.vault.cachedRead(file);
    let state: Record<string, unknown>;
    try {
      state = JSON.parse(content) as Record<string, unknown>;
    } catch {
      return;
    }
    state.name = name.trim();
    await this.vault.modify(file, JSON.stringify(state, null, 2));
  }

  /** Delete a conversation: the JSON file, its threads sidecar, and the
   *  parent `conversations/` folder if it just emptied out. The chat view
   *  auto-creates a fresh conversation if the user deletes their last one,
   *  so this never strands the panel in a no-conversations state. */
  async deleteConversation(agent: AgentConfig, conversationId: string): Promise<void> {
    const path = this.getConversationPath(agent, conversationId);
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.fileManager.trashFile(file);
    }

    const threadsDir = path.replace(/\.json$/, ".threads");
    const threadsFolder = this.vault.getAbstractFileByPath(threadsDir);
    if (threadsFolder instanceof TFolder) {
      await this.app.fileManager.trashFile(threadsFolder);
    }

    const dir = this.getConversationsDir(agent);
    const folder = this.vault.getAbstractFileByPath(dir);
    if (folder instanceof TFolder && folder.children.length === 0) {
      await this.app.fileManager.trashFile(folder);
    }
  }

  /**
   * @deprecated Back-compat shim. Returns a flat {@link MemoryFile} view,
   * preferring the v2 working memory (rendered body) and falling back to the
   * legacy flat file. New code should use {@link readWorkingMemory}.
   */
  async getMemory(agentName: string): Promise<MemoryFile | null> {
    const wm = await this.readWorkingMemory(agentName);
    if (wm) {
      return {
        filePath: wm.filePath,
        agent: wm.agent,
        lastUpdated: wm.lastUpdated,
        body: renderSections(wm.sections),
      };
    }
    return null;
  }

  async appendMemory(agentName: string, entries: string[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const path = this.getMemoryPath(agentName);
    const file = this.vault.getAbstractFileByPath(path);
    const timestamp = new Date().toISOString();
    const entryBlock = entries.map((entry) => `- ${entry.trim()}`).join("\n");

    if (file instanceof TFile) {
      const existing = await this.getMemory(agentName);
      const body = `${existing?.body.trim() || "## Learned Context"}\n\n${entryBlock}`.trim();
      await this.vault.modify(
        file,
        stringifyMarkdownWithFrontmatter(
          {
            agent: agentName,
            last_updated: timestamp,
          },
          body,
        ),
      );
      return;
    }

    await this.createFileIfMissing(
      path,
      stringifyMarkdownWithFrontmatter(
        {
          agent: agentName,
          last_updated: timestamp,
        },
        `## Learned Context\n\n${entryBlock}`,
      ),
    );
  }

  async listRecentRuns(limit = 50): Promise<RunLogData[]> {
    const runsFolder = this.vault.getAbstractFileByPath(this.getRunsRoot());
    if (!(runsFolder instanceof TFolder)) {
      return [];
    }

    const files: TFile[] = [];
    this.collectMarkdownChildren(runsFolder, files);

    files.sort((a, b) => b.path.localeCompare(a.path));
    const selected = files.slice(0, limit);
    const parsed: RunLogData[] = [];

    for (const file of selected) {
      const run = await this.readRunLog(file);
      if (run) {
        parsed.push(run);
      }
    }

    return parsed.sort((a, b) => b.started.localeCompare(a.started));
  }

  /** Return all runs whose date folder is on or after `sinceDate`. Used by
   *  the dashboard chart so a busy fleet can't push older days out of the
   *  visible window the way the count-capped `listRecentRuns` does.
   *  Walks only the relevant date subfolders, so cost is bounded by the
   *  window size, not the total number of historical runs. */
  async listRunsSince(sinceDate: Date): Promise<RunLogData[]> {
    const runsFolder = this.vault.getAbstractFileByPath(this.getRunsRoot());
    if (!(runsFolder instanceof TFolder)) {
      return [];
    }

    const sinceStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, "0")}-${String(sinceDate.getDate()).padStart(2, "0")}`;
    const files: TFile[] = [];
    for (const child of runsFolder.children) {
      if (!(child instanceof TFolder)) continue;
      // Date folders are named `YYYY-MM-DD`; lexicographic >= matches calendar >=.
      if (child.name < sinceStr) continue;
      this.collectMarkdownChildren(child, files);
    }

    const parsed: RunLogData[] = [];
    for (const file of files) {
      const run = await this.readRunLog(file);
      if (run) {
        parsed.push(run);
      }
    }

    return parsed.sort((a, b) => b.started.localeCompare(a.started));
  }

  // ═══════════════════════════════════════════════════════
  //  Usage ledger (chat/channel token+cost) — _fleet/usage/YYYY-MM-DD.jsonl
  // ═══════════════════════════════════════════════════════

  private usageLedgerPath(ts: string): string {
    return normalizePath(`${this.getSubfolder("usage")}/${ts.slice(0, 10)}.jsonl`);
  }

  /** Append one usage record to the day's JSONL ledger (one line per turn).
   *  Uses the raw adapter so it doesn't go through the markdown pipeline. */
  async appendUsage(record: UsageRecord): Promise<void> {
    await this.ensureFolder(this.getSubfolder("usage"));
    const path = this.usageLedgerPath(record.ts);
    const line = `${JSON.stringify(record)}\n`;
    const adapter = this.vault.adapter;
    if (await adapter.exists(path)) {
      await adapter.append(path, line);
    } else {
      await adapter.write(path, line);
    }
  }

  /** Read all usage records on or after `sinceDate` (by ledger file date). */
  async readUsageSince(sinceDate: Date): Promise<UsageRecord[]> {
    const dir = this.getSubfolder("usage");
    const adapter = this.vault.adapter;
    if (!(await adapter.exists(dir))) return [];
    const sinceStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, "0")}-${String(sinceDate.getDate()).padStart(2, "0")}`;
    const out: UsageRecord[] = [];
    const listing = await adapter.list(dir);
    for (const filePath of listing.files) {
      if (!filePath.endsWith(".jsonl")) continue;
      const base = (filePath.split("/").pop() ?? "").replace(/\.jsonl$/, "");
      // Files are named YYYY-MM-DD; lexicographic >= matches calendar >=.
      if (base < sinceStr) continue;
      let content: string;
      try {
        content = await adapter.read(filePath);
      } catch {
        continue;
      }
      for (const raw of content.split("\n")) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        try {
          out.push(JSON.parse(trimmed) as UsageRecord);
        } catch {
          // skip a corrupt line rather than failing the whole read
        }
      }
    }
    return out;
  }

  async readRunLog(file: TFile): Promise<RunLogData | null> {
    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    // `## Prompt` terminates at either `## Result` (new format) or
    // `## Output` (legacy format). `## Result` is optional and missing on
    // runs created before finalResult was extracted — those runs fall back
    // to rendering `output` in the panel.
    const promptMatch = body.match(/## Prompt\n([\s\S]*?)(?:\n## Result\n|\n## Output\n|$)/);
    const resultMatch = body.match(/## Result\n([\s\S]*?)(?:\n## Output\n|$)/);
    const outputMatch = body.match(/## Output\n([\s\S]*?)(?:\n## Tools Used\n|$)/);
    const toolsMatch = body.match(/## Tools Used\n([\s\S]*?)(?:\n## STDERR\n|$)/);
    return {
      filePath: file.path,
      runId: asString(frontmatter.run_id) ?? file.basename,
      agent: asString(frontmatter.agent) ?? "unknown",
      task: asString(frontmatter.task) ?? "unknown",
      status: (asString(frontmatter.status) as RunLogData["status"]) ?? "failure",
      started: asString(frontmatter.started) ?? new Date(file.stat.ctime).toISOString(),
      completed: asString(frontmatter.completed),
      durationSeconds: asNumber(frontmatter.duration_seconds, 0),
      tokensUsed: typeof frontmatter.tokens_used === "number" ? frontmatter.tokens_used : undefined,
      costUsd: typeof frontmatter.cost_usd === "number" ? frontmatter.cost_usd : undefined,
      model: asString(frontmatter.model) ?? DEFAULT_SETTINGS.defaultModel,
      modelSource: ((): RunLogData["modelSource"] => {
        const raw = asString(frontmatter.model_source);
        if (raw === "task" || raw === "agent" || raw === "settings" || raw === "cli-default") return raw;
        return undefined;
      })(),
      concreteModel: asString(frontmatter.resolved_concrete_model),
      exitCode: typeof frontmatter.exit_code === "number" ? frontmatter.exit_code : null,
      tags: asStringArray(frontmatter.tags),
      prompt: promptMatch?.[1]?.trim() ?? "",
      output: outputMatch?.[1]?.trim() ?? "",
      finalResult: resultMatch?.[1]?.trim() || undefined,
      toolsUsed: toolsMatch?.[1]
        ? splitLines(toolsMatch[1])
          .map((line) => line.replace(/^- /, "").trim())
          .filter(Boolean)
        : [],
      approvals: this.parseApprovals(frontmatter.approvals),
    };
  }

  async writeRunLog(run: RunLogData): Promise<string> {
    const started = new Date(run.started);
    const dateFolder = normalizePath(`${this.getRunsRoot()}/${started.toISOString().slice(0, 10)}`);
    await this.ensureFolder(dateFolder);
    const filename = `${started.toISOString().slice(11, 19).replace(/:/g, "")}-${slugify(run.agent)}-${slugify(run.task)}.md`;
    const path = normalizePath(`${dateFolder}/${filename}`);
    const content = stringifyMarkdownWithFrontmatter(
      {
        run_id: run.runId,
        agent: run.agent,
        task: run.task,
        status: run.status,
        started: run.started,
        completed: run.completed,
        duration_seconds: run.durationSeconds,
        tokens_used: run.tokensUsed,
        cost_usd: run.costUsd,
        model: run.model,
        model_source: run.modelSource,
        resolved_concrete_model: run.concreteModel,
        exit_code: run.exitCode,
        tags: run.tags,
        approvals: run.approvals,
      },
      [
        "## Prompt",
        "",
        run.prompt.trim(),
        "",
        // `## Result` carries the final answer without narration, from the
        // CLI's `type: "result"` event. Omitted when absent so legacy-format
        // run files stay identical.
        ...(run.finalResult && run.finalResult.trim()
          ? ["## Result", "", run.finalResult.trim(), ""]
          : []),
        "## Output",
        "",
        run.output.trim() || "(no output)",
        "",
        "## Tools Used",
        "",
        ...(run.toolsUsed.length > 0 ? run.toolsUsed.map((tool) => `- ${tool}`) : ["- none"]),
        ...(run.stderr ? ["", "## STDERR", "", run.stderr.trim()] : []),
      ].join("\n"),
    );

    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
    } else {
      await this.vault.create(path, content);
    }
    return path;
  }

  async updateTaskRunMetadata(task: TaskConfig, updates: Partial<Pick<TaskConfig, "lastRun" | "nextRun" | "runCount">>): Promise<void> {
    const file = this.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    const nextFrontmatter = {
      ...frontmatter,
      last_run: updates.lastRun ?? task.lastRun,
      next_run: updates.nextRun ?? task.nextRun,
      run_count: updates.runCount ?? task.runCount,
    };

    await this.vault.modify(file, stringifyMarkdownWithFrontmatter(nextFrontmatter, body));
    await this.loadFile(file);
  }

  async setApprovalDecision(runPath: string, tool: string, decision: "approved" | "rejected"): Promise<void> {
    const file = this.vault.getAbstractFileByPath(runPath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    const approvals = (this.parseApprovals(frontmatter.approvals) ?? []).map((approval) =>
      approval.tool === tool
        ? {
            ...approval,
            status: decision,
            resolvedAt: new Date().toISOString(),
          }
        : approval,
    );

    await this.vault.modify(
      file,
      stringifyMarkdownWithFrontmatter(
        {
          ...frontmatter,
          approvals,
        },
        body,
      ),
    );
  }

  async createAgentTemplate(name: string): Promise<TFile> {
    const path = await this.getAvailablePath(this.getSubfolder("agents"), slugify(name));
    const content = `---\nname: ${slugify(name)}\ndescription: \nenabled: true\nskills: []\ntags: []\n---\n\nAgent instructions go here.\n`;
    return await this.vault.create(path, content);
  }

  async createAgentFolder(opts: {
    name: string;
    description: string;
    avatar: string;
    tags: string[];
    systemPrompt: string;
    model: string;
    adapter: string;
    cwd: string;
    timeout: number;
    permissionMode: string;
    effort?: string;
    approvalRequired: string[];
    memory: boolean;
    memoryMaxEntries: number;
    skills: string[];
    mcpServers?: string[];
    skillsBody: string;
    contextBody: string;
    enabled?: boolean;
    permissionRules?: { allow: string[]; deny: string[] };
    autoCompactThreshold?: number;
    wikiReferences?: string[];
  }): Promise<string> {
    const slug = slugify(opts.name);
    const folderPath = normalizePath(`${this.getSubfolder("agents")}/${slug}`);
    await this.ensureFolder(folderPath);

    // agent.md
    const agentFm: Record<string, unknown> = {
      name: opts.name,
      description: opts.description || undefined,
      avatar: opts.avatar || undefined,
      enabled: opts.enabled ?? true,
      tags: opts.tags,
      skills: opts.skills,
      mcp_servers: opts.mcpServers?.length ? opts.mcpServers : undefined,
    };
    if (opts.model && opts.model !== "default") {
      agentFm.model = opts.model;
    }
    const agentPath = normalizePath(`${folderPath}/agent.md`);
    await this.vault.create(agentPath, stringifyMarkdownWithFrontmatter(agentFm, opts.systemPrompt || ""));

    // config.md
    const configFm: Record<string, unknown> = {
      model: opts.model || "default",
      adapter: opts.adapter || "claude-code",
      timeout: opts.timeout,
      max_retries: 1,
      cwd: opts.cwd || "",
      permission_mode: opts.permissionMode || "bypassPermissions",
      effort: opts.effort || undefined,
      approval_required: opts.approvalRequired,
      memory: opts.memory,
      memory_max_entries: opts.memoryMaxEntries,
    };
    if (typeof opts.autoCompactThreshold === "number") {
      configFm.auto_compact_threshold = opts.autoCompactThreshold;
    }
    if (opts.wikiReferences && opts.wikiReferences.length > 0) {
      configFm.wiki_references = opts.wikiReferences.map((agent) => ({ agent }));
    }
    const configPath = normalizePath(`${folderPath}/config.md`);
    await this.vault.create(configPath, stringifyMarkdownWithFrontmatter(configFm, ""));

    // SKILLS.md
    const skillsPath = normalizePath(`${folderPath}/SKILLS.md`);
    await this.vault.create(skillsPath, stringifyMarkdownWithFrontmatter({}, opts.skillsBody || ""));

    // CONTEXT.md
    const contextPath = normalizePath(`${folderPath}/CONTEXT.md`);
    await this.vault.create(contextPath, stringifyMarkdownWithFrontmatter({}, opts.contextBody || ""));

    // permissions.json (only if rules are non-empty)
    const rules = opts.permissionRules;
    if (rules && (rules.allow.length > 0 || rules.deny.length > 0)) {
      const permPath = normalizePath(`${folderPath}/permissions.json`);
      await this.vault.create(permPath, JSON.stringify(rules, null, 2) + "\n");
    }

    return agentPath;
  }

  async createSkillTemplate(name: string): Promise<TFile> {
    const path = await this.getAvailablePath(this.getSubfolder("skills"), slugify(name));
    const content = `---\nname: ${slugify(name)}\ndescription: \ntags: []\n---\n\nSkill instructions go here.\n`;
    return await this.vault.create(path, content);
  }

  async createSkillFolder(opts: {
    name: string;
    description: string;
    tags: string[];
    body: string;
    toolsBody: string;
    referencesBody: string;
    examplesBody: string;
  }): Promise<void> {
    const folderPath = normalizePath(`${this.getSubfolder("skills")}/${slugify(opts.name)}`);
    await this.ensureFolder(folderPath);

    const skillFm = {
      name: opts.name,
      description: opts.description || undefined,
      tags: opts.tags.length > 0 ? opts.tags : undefined,
    };
    const skillPath = normalizePath(`${folderPath}/skill.md`);
    await this.createFileIfMissing(skillPath, stringifyMarkdownWithFrontmatter(skillFm, opts.body || "Skill instructions go here."));

    if (opts.toolsBody) {
      const toolsPath = normalizePath(`${folderPath}/tools.md`);
      await this.createFileIfMissing(toolsPath, `# Tools\n\n${opts.toolsBody}`);
    }

    if (opts.referencesBody) {
      const refsPath = normalizePath(`${folderPath}/references.md`);
      await this.createFileIfMissing(refsPath, `# References\n\n${opts.referencesBody}`);
    }

    if (opts.examplesBody) {
      const examplesPath = normalizePath(`${folderPath}/examples.md`);
      await this.createFileIfMissing(examplesPath, `# Examples\n\n${opts.examplesBody}`);
    }
  }

  async updateAgent(agentName: string, updates: {
    description?: string;
    avatar?: string;
    tags?: string[];
    systemPrompt?: string;
    model?: string;
    adapter?: string;
    cwd?: string;
    timeout?: number;
    permissionMode?: string;
    effort?: string;
    permissionRules?: { allow: string[]; deny: string[] };
    approvalRequired?: string[];
    memory?: boolean;
    memoryTokenBudget?: number;
    reflectionEnabled?: boolean;
    reflectionSchedule?: string;
    reflectionProposeSkills?: boolean;
    skills?: string[];
    mcpServers?: string[];
    skillsBody?: string;
    contextBody?: string;
    enabled?: boolean;
    /** 0-100; percent of context window at which auto-compact fires. */
    autoCompactThreshold?: number;
    /** Names of Wiki Keeper agents this agent can read from. */
    wikiReferences?: string[];
  }): Promise<void> {
    const agent = this.getAgentByName(agentName);
    if (!agent) return;

    if (agent.isFolder) {
      const folderPath = normalizePath(agent.filePath.replace(/\/agent\.md$/, ""));

      // Update agent.md
      const agentFile = this.vault.getAbstractFileByPath(agent.filePath);
      if (agentFile instanceof TFile) {
        const content = await this.vault.cachedRead(agentFile);
        const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
        if (updates.description !== undefined) frontmatter.description = updates.description || undefined;
        if (updates.avatar !== undefined) frontmatter.avatar = updates.avatar || undefined;
        if (updates.tags !== undefined) frontmatter.tags = updates.tags;
        if (updates.skills !== undefined) frontmatter.skills = updates.skills;
        if (updates.mcpServers !== undefined) frontmatter.mcp_servers = updates.mcpServers.length > 0 ? updates.mcpServers : undefined;
        if (updates.enabled !== undefined) frontmatter.enabled = updates.enabled;
        if (updates.model !== undefined && updates.model !== "default") frontmatter.model = updates.model;
        const newBody = updates.systemPrompt !== undefined ? updates.systemPrompt : body;
        await this.vault.modify(agentFile, stringifyMarkdownWithFrontmatter(frontmatter, newBody));
      }

      // Update config.md
      const configPath = normalizePath(`${folderPath}/config.md`);
      const configFile = this.vault.getAbstractFileByPath(configPath);
      if (configFile instanceof TFile) {
        const content = await this.vault.cachedRead(configFile);
        const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
        if (updates.model !== undefined) frontmatter.model = updates.model;
        if (updates.adapter !== undefined) frontmatter.adapter = updates.adapter;
        if (updates.timeout !== undefined) frontmatter.timeout = updates.timeout;
        if (updates.cwd !== undefined) frontmatter.cwd = updates.cwd;
        if (updates.permissionMode !== undefined) frontmatter.permission_mode = updates.permissionMode;
        if (updates.effort !== undefined) frontmatter.effort = updates.effort || undefined;
        if (updates.approvalRequired !== undefined) frontmatter.approval_required = updates.approvalRequired;
        if (updates.memory !== undefined) frontmatter.memory = updates.memory;
        if (updates.memoryTokenBudget !== undefined) frontmatter.memory_token_budget = updates.memoryTokenBudget;
        if (updates.reflectionEnabled !== undefined) frontmatter.reflection_enabled = updates.reflectionEnabled;
        if (updates.reflectionSchedule !== undefined) frontmatter.reflection_schedule = updates.reflectionSchedule;
        if (updates.reflectionProposeSkills !== undefined) frontmatter.reflection_propose_skills = updates.reflectionProposeSkills;
        if (updates.autoCompactThreshold !== undefined) {
          frontmatter.auto_compact_threshold = updates.autoCompactThreshold;
        }
        if (updates.wikiReferences !== undefined) {
          frontmatter.wiki_references = updates.wikiReferences.length > 0
            ? updates.wikiReferences.map((agent) => ({ agent }))
            : undefined;
        }
        // Strip dead legacy permission fields whenever we touch config.md —
        // permissions.json is now the canonical surface for allow/deny.
        delete frontmatter.allowed_tools;
        delete frontmatter.blocked_tools;
        await this.vault.modify(configFile, stringifyMarkdownWithFrontmatter(frontmatter, body));
      }

      // Update SKILLS.md
      if (updates.skillsBody !== undefined) {
        const skillsPath = normalizePath(`${folderPath}/SKILLS.md`);
        const skillsFile = this.vault.getAbstractFileByPath(skillsPath);
        if (skillsFile instanceof TFile) {
          await this.vault.modify(skillsFile, stringifyMarkdownWithFrontmatter({}, updates.skillsBody));
        } else {
          await this.vault.create(skillsPath, stringifyMarkdownWithFrontmatter({}, updates.skillsBody));
        }
      }

      // Update CONTEXT.md
      if (updates.contextBody !== undefined) {
        const contextPath = normalizePath(`${folderPath}/CONTEXT.md`);
        const contextFile = this.vault.getAbstractFileByPath(contextPath);
        if (contextFile instanceof TFile) {
          await this.vault.modify(contextFile, stringifyMarkdownWithFrontmatter({}, updates.contextBody));
        } else {
          await this.vault.create(contextPath, stringifyMarkdownWithFrontmatter({}, updates.contextBody));
        }
      }

      // Update permissions.json
      if (updates.permissionRules !== undefined) {
        const permPath = normalizePath(`${folderPath}/permissions.json`);
        const permFile = this.vault.getAbstractFileByPath(permPath);
        const rules = updates.permissionRules;
        if (rules.allow.length > 0 || rules.deny.length > 0) {
          const content = JSON.stringify(rules, null, 2) + "\n";
          if (permFile instanceof TFile) {
            await this.vault.modify(permFile, content);
          } else {
            await this.vault.create(permPath, content);
          }
        } else if (permFile instanceof TFile) {
          // Remove permissions.json if both lists are empty
          await this.app.fileManager.trashFile(permFile);
        }
      }
    } else {
      // Legacy single-file agent
      const file = this.vault.getAbstractFileByPath(agent.filePath);
      if (!(file instanceof TFile)) return;
      const content = await this.vault.cachedRead(file);
      const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
      if (updates.description !== undefined) frontmatter.description = updates.description || undefined;
      if (updates.avatar !== undefined) frontmatter.avatar = updates.avatar || undefined;
      if (updates.tags !== undefined) frontmatter.tags = updates.tags;
      if (updates.skills !== undefined) frontmatter.skills = updates.skills;
      if (updates.mcpServers !== undefined) frontmatter.mcp_servers = updates.mcpServers.length > 0 ? updates.mcpServers : undefined;
      if (updates.enabled !== undefined) frontmatter.enabled = updates.enabled;
      if (updates.model !== undefined) frontmatter.model = updates.model;
      if (updates.adapter !== undefined) frontmatter.adapter = updates.adapter;
      if (updates.timeout !== undefined) frontmatter.timeout = updates.timeout;
      if (updates.cwd !== undefined) frontmatter.cwd = updates.cwd;
      if (updates.permissionMode !== undefined) frontmatter.permission_mode = updates.permissionMode;
      if (updates.effort !== undefined) frontmatter.effort = updates.effort || undefined;
      if (updates.approvalRequired !== undefined) frontmatter.approval_required = updates.approvalRequired;
      if (updates.memory !== undefined) frontmatter.memory = updates.memory;
      if (updates.autoCompactThreshold !== undefined) {
        frontmatter.auto_compact_threshold = updates.autoCompactThreshold;
      }
      if (updates.wikiReferences !== undefined) {
        frontmatter.wiki_references = updates.wikiReferences.length > 0
          ? updates.wikiReferences.map((agent) => ({ agent }))
          : undefined;
      }
      // Strip dead legacy permission fields whenever we touch the file —
      // permissions.json sidecar is now the canonical surface.
      delete frontmatter.allowed_tools;
      delete frontmatter.blocked_tools;
      const newBody = updates.systemPrompt !== undefined ? updates.systemPrompt : body;
      await this.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, newBody));

      // Sidecar permissions.json for flat agents — parity with folder agents.
      if (updates.permissionRules !== undefined) {
        const sidecarPath = sidecarPermissionsPath(agent.filePath);
        const sidecarFile = this.vault.getAbstractFileByPath(sidecarPath);
        const rules = updates.permissionRules;
        if (rules.allow.length > 0 || rules.deny.length > 0) {
          const content = JSON.stringify(rules, null, 2) + "\n";
          if (sidecarFile instanceof TFile) {
            await this.vault.modify(sidecarFile, content);
          } else {
            await this.vault.create(sidecarPath, content);
          }
        } else if (sidecarFile instanceof TFile) {
          await this.app.fileManager.trashFile(sidecarFile);
        }
      }
    }
  }

  async updateTask(taskId: string, updates: {
    agent?: string;
    type?: string;
    schedule?: string;
    runAt?: string;
    enabled?: boolean;
    priority?: string;
    catch_up?: boolean;
    effort?: string;
    model?: string;
    channel?: string;
    channelTarget?: string;
    tags?: string[];
    body?: string;
  }): Promise<void> {
    const task = this.getTaskById(taskId);
    if (!task) return;

    const file = this.vault.getAbstractFileByPath(task.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    if (updates.agent !== undefined) frontmatter.agent = updates.agent;
    if (updates.type !== undefined) frontmatter.type = updates.type;
    if (updates.schedule !== undefined) frontmatter.schedule = updates.schedule || undefined;
    if (updates.runAt !== undefined) frontmatter.run_at = updates.runAt || undefined;
    if (updates.enabled !== undefined) frontmatter.enabled = updates.enabled;
    if (updates.priority !== undefined) frontmatter.priority = updates.priority;
    if (updates.catch_up !== undefined) frontmatter.catch_up = updates.catch_up;
    if (updates.effort !== undefined) frontmatter.effort = updates.effort || undefined;
    if (updates.model !== undefined) frontmatter.model = updates.model || undefined;
    if (updates.channel !== undefined) frontmatter.channel = updates.channel || undefined;
    if (updates.channelTarget !== undefined) frontmatter.channel_target = updates.channelTarget || undefined;
    if (updates.tags !== undefined) frontmatter.tags = updates.tags;
    const newBody = updates.body !== undefined ? updates.body : body;
    await this.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, newBody));
  }

  async updateSkill(skillName: string, updates: {
    description?: string;
    tags?: string[];
    body?: string;
    toolsBody?: string;
    referencesBody?: string;
    examplesBody?: string;
  }): Promise<void> {
    const skill = this.getSkillByName(skillName);
    if (!skill) return;

    if (skill.isFolder) {
      const folderPath = normalizePath(skill.filePath.replace(/\/skill\.md$/, ""));

      // Update skill.md
      const skillFile = this.vault.getAbstractFileByPath(skill.filePath);
      if (skillFile instanceof TFile) {
        const content = await this.vault.cachedRead(skillFile);
        const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
        if (updates.description !== undefined) frontmatter.description = updates.description || undefined;
        if (updates.tags !== undefined) frontmatter.tags = updates.tags.length > 0 ? updates.tags : undefined;
        const newBody = updates.body !== undefined ? updates.body : body;
        await this.vault.modify(skillFile, stringifyMarkdownWithFrontmatter(frontmatter, newBody));
      }

      // Update tools.md
      if (updates.toolsBody !== undefined) {
        const toolsPath = normalizePath(`${folderPath}/tools.md`);
        const toolsFile = this.vault.getAbstractFileByPath(toolsPath);
        if (updates.toolsBody) {
          if (toolsFile instanceof TFile) {
            await this.vault.modify(toolsFile, `# Tools\n\n${updates.toolsBody}`);
          } else {
            await this.vault.create(toolsPath, `# Tools\n\n${updates.toolsBody}`);
          }
        }
      }

      // Update references.md
      if (updates.referencesBody !== undefined) {
        const refsPath = normalizePath(`${folderPath}/references.md`);
        const refsFile = this.vault.getAbstractFileByPath(refsPath);
        if (updates.referencesBody) {
          if (refsFile instanceof TFile) {
            await this.vault.modify(refsFile, `# References\n\n${updates.referencesBody}`);
          } else {
            await this.vault.create(refsPath, `# References\n\n${updates.referencesBody}`);
          }
        }
      }

      // Update examples.md
      if (updates.examplesBody !== undefined) {
        const examplesPath = normalizePath(`${folderPath}/examples.md`);
        const examplesFile = this.vault.getAbstractFileByPath(examplesPath);
        if (updates.examplesBody) {
          if (examplesFile instanceof TFile) {
            await this.vault.modify(examplesFile, `# Examples\n\n${updates.examplesBody}`);
          } else {
            await this.vault.create(examplesPath, `# Examples\n\n${updates.examplesBody}`);
          }
        }
      }
    } else {
      // Legacy single-file skill
      const file = this.vault.getAbstractFileByPath(skill.filePath);
      if (!(file instanceof TFile)) return;
      const content = await this.vault.cachedRead(file);
      const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
      if (updates.description !== undefined) frontmatter.description = updates.description || undefined;
      if (updates.tags !== undefined) frontmatter.tags = updates.tags.length > 0 ? updates.tags : undefined;
      const newBody = updates.body !== undefined ? updates.body : body;
      await this.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, newBody));
    }
  }

  async deleteSkill(skillName: string): Promise<void> {
    const skill = this.getSkillByName(skillName);
    if (!skill) return;

    if (skill.isFolder) {
      const folderPath = normalizePath(skill.filePath.replace(/\/skill\.md$/, ""));
      const folder = this.vault.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        await this.app.fileManager.trashFile(folder);
      }
    } else {
      await this.trashFile(skill.filePath);
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = this.getTaskById(taskId);
    if (!task) return;
    await this.trashFile(task.filePath);
  }

  async updateChannel(channelName: string, updates: {
    default_agent?: string;
    allowed_agents?: string[];
    enabled?: boolean;
    credential_ref?: string;
    allowed_users?: string[];
    per_user_sessions?: boolean;
    channel_context?: string;
    tags?: string[];
    body?: string;
    type?: string;
    transport?: Record<string, unknown>;
  }): Promise<void> {
    const channel = this.getChannelByName(channelName);
    if (!channel) return;

    const file = this.vault.getAbstractFileByPath(channel.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    if (updates.default_agent !== undefined) {
      frontmatter.default_agent = updates.default_agent;
      // Remove legacy `agent` field to avoid confusion
      delete frontmatter.agent;
    }
    if (updates.allowed_agents !== undefined) frontmatter.allowed_agents = updates.allowed_agents;
    if (updates.enabled !== undefined) frontmatter.enabled = updates.enabled;
    if (updates.credential_ref !== undefined) frontmatter.credential_ref = updates.credential_ref;
    if (updates.allowed_users !== undefined) frontmatter.allowed_users = updates.allowed_users;
    if (updates.per_user_sessions !== undefined) frontmatter.per_user_sessions = updates.per_user_sessions;
    if (updates.channel_context !== undefined) frontmatter.channel_context = updates.channel_context || undefined;
    if (updates.tags !== undefined) frontmatter.tags = updates.tags;
    if (updates.type !== undefined) frontmatter.type = updates.type;
    if (updates.transport !== undefined) frontmatter.transport = updates.transport;
    const newBody = updates.body !== undefined ? updates.body : body;
    await this.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, newBody));
  }

  async deleteChannel(channelName: string): Promise<void> {
    const channel = this.getChannelByName(channelName);
    if (!channel) return;
    await this.trashFile(channel.filePath);
    // Also trash the channel's sessions folder if it exists
    const sessionsFolder = normalizePath(
      `${this.getSubfolder("channels")}/${slugify(channelName)}/sessions`,
    );
    const folder = this.vault.getAbstractFileByPath(sessionsFolder);
    if (folder instanceof TFolder) {
      await this.app.fileManager.trashFile(folder);
    }
  }

  /** Build `_fleet/mcp/<name>.md` frontmatter from a server definition,
   *  omitting empty/runtime fields. Secrets are never written here. */
  private mcpServerFrontmatter(server: McpServer): Record<string, unknown> {
    const fm: Record<string, unknown> = {
      name: server.name,
      transport: server.type,
      enabled: server.enabled,
    };
    if (server.source) fm.source = server.source;
    if (server.type === "stdio") {
      if (server.command) fm.command = server.command;
      if (server.args && server.args.length > 0) fm.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) fm.env = server.env;
      if (server.envSecretKeys && server.envSecretKeys.length > 0) fm.env_secret_keys = server.envSecretKeys;
    } else {
      if (server.url) fm.url = server.url;
      if (server.headers && Object.keys(server.headers).length > 0) fm.headers = server.headers;
      if (server.auth) fm.auth = server.auth;
      if (server.oauth && (server.oauth.clientId || server.oauth.resource || (server.oauth.scopes?.length ?? 0) > 0)) {
        fm.oauth = {
          client_id: server.oauth.clientId || undefined,
          resource: server.oauth.resource || undefined,
          scopes: server.oauth.scopes && server.oauth.scopes.length > 0 ? server.oauth.scopes : undefined,
        };
      }
    }
    return fm;
  }

  /**
   * Create or update an MCP server registry file. When `server.filePath` is set
   * the existing file is rewritten in place; otherwise a new
   * `_fleet/mcp/<slug>.md` is created. Returns the file path. Secrets are NOT
   * handled here — callers store tokens/secret env values in SecretStore.
   */
  async saveMcpServer(server: McpServer, body = ""): Promise<string> {
    const fm = this.mcpServerFrontmatter(server);
    const content = stringifyMarkdownWithFrontmatter(fm, body.trim());
    const existing = server.filePath ? this.vault.getAbstractFileByPath(server.filePath) : null;
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
      return existing.path;
    }
    const path = await this.getAvailablePath(this.getSubfolder("mcp"), slugify(server.name));
    await this.ensureFolder(this.getSubfolder("mcp"));
    await this.vault.create(path, content);
    return path;
  }

  /** Flip an MCP server's `enabled` flag in its registry file. */
  async setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
    const server = this.getMcpServerByName(name);
    if (!server?.filePath) return;
    const file = this.vault.getAbstractFileByPath(server.filePath);
    if (!(file instanceof TFile)) return;
    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    frontmatter.enabled = enabled;
    await this.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, body));
  }

  /** Trash an MCP server's registry file. */
  async deleteMcpServer(name: string): Promise<void> {
    const server = this.getMcpServerByName(name);
    if (!server?.filePath) return;
    await this.trashFile(server.filePath);
  }

  async updateHeartbeat(agentName: string, updates: {
    enabled?: boolean;
    schedule?: string;
    notify?: boolean;
    channel?: string;
    channelTarget?: string;
    body?: string;
  }): Promise<void> {
    const agent = this.getAgentByName(agentName);
    if (!agent || !agent.isFolder) return;

    const folderPath = normalizePath(agent.filePath.replace(/\/agent\.md$/, ""));
    const heartbeatPath = normalizePath(`${folderPath}/HEARTBEAT.md`);
    const file = this.vault.getAbstractFileByPath(heartbeatPath);

    if (file instanceof TFile) {
      // Update existing file
      const content = await this.vault.cachedRead(file);
      const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
      if (updates.enabled !== undefined) frontmatter.enabled = updates.enabled;
      if (updates.schedule !== undefined) frontmatter.schedule = updates.schedule || undefined;
      if (updates.notify !== undefined) frontmatter.notify = updates.notify;
      if (updates.channel !== undefined) frontmatter.channel = updates.channel || undefined;
      if (updates.channelTarget !== undefined) frontmatter.channel_target = updates.channelTarget || undefined;
      const newBody = updates.body !== undefined ? updates.body : body;
      await this.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, newBody));
    } else {
      // Create new HEARTBEAT.md
      const frontmatter: Record<string, unknown> = {
        enabled: updates.enabled ?? false,
      };
      if (updates.schedule) frontmatter.schedule = updates.schedule;
      if (updates.notify !== undefined) frontmatter.notify = updates.notify;
      if (updates.channel) frontmatter.channel = updates.channel;
      if (updates.channelTarget) frontmatter.channel_target = updates.channelTarget;
      const body = updates.body ?? "";
      await this.vault.create(
        heartbeatPath,
        stringifyMarkdownWithFrontmatter(frontmatter, body),
      );
    }
  }

  async deleteAgent(agentName: string, deleteTasks: boolean): Promise<{ trashedFiles: string[] }> {
    const trashedFiles: string[] = [];
    const agent = this.getAgentByName(agentName);
    if (!agent) return { trashedFiles };

    if (agent.isFolder) {
      // Trash the entire agent folder
      const folderPath = normalizePath(agent.filePath.replace(/\/agent\.md$/, ""));
      const folder = this.vault.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        const files: TFile[] = [];
        this.collectMarkdownChildren(folder, files);
        // Trash all files inside the folder first, then the folder
        for (const f of files) {
          trashedFiles.push(f.path);
        }
        await this.app.fileManager.trashFile(folder);
      }
    } else {
      // Trash the single agent definition file
      await this.trashFile(agent.filePath);
      trashedFiles.push(agent.filePath);
    }

    // Trash the agent's memory: legacy flat file + v2 memory folder.
    const memoryPath = this.getMemoryPath(agentName);
    if (this.vault.getAbstractFileByPath(memoryPath)) {
      await this.trashFile(memoryPath);
      trashedFiles.push(memoryPath);
    }
    const memoryDir = this.getMemoryDir(agentName);
    const memoryFolder = this.vault.getAbstractFileByPath(memoryDir);
    if (memoryFolder instanceof TFolder) {
      await this.app.fileManager.trashFile(memoryFolder);
      trashedFiles.push(memoryDir);
    }

    // Optionally trash associated tasks
    if (deleteTasks) {
      const tasks = this.getTasksForAgent(agentName);
      for (const task of tasks) {
        await this.trashFile(task.filePath);
        trashedFiles.push(task.filePath);
      }
    }

    return { trashedFiles };
  }

  async trashFile(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file) {
      await this.app.fileManager.trashFile(file);
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    if (this.vault.getAbstractFileByPath(path)) {
      return;
    }
    try {
      await this.vault.createFolder(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Folder already exists")) {
        throw error;
      }
    }
  }

  async getAvailablePath(folder: string, baseName: string): Promise<string> {
    let attempt = 0;
    while (true) {
      const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
      const candidate = normalizePath(`${folder}/${baseName}${suffix}.md`);
      if (!this.vault.getAbstractFileByPath(candidate)) {
        return candidate;
      }
      attempt += 1;
    }
  }

  private async createFileIfMissing(path: string, content: string): Promise<void> {
    if (this.vault.getAbstractFileByPath(path)) {
      return;
    }

    try {
      await this.vault.create(path, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("File already exists")) {
        throw error;
      }
    }
  }

  private collectMarkdownChildren(folder: TFolder, acc: TFile[]): void {
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        acc.push(child);
      }
      if (child instanceof TFolder) {
        this.collectMarkdownChildren(child, acc);
      }
    }
  }

  private clearStoredFile(path: string): void {
    this.agents.delete(path);
    this.skills.delete(path);
    this.tasks.delete(path);
    this.channels.delete(path);
    this.mcpServers.delete(path);
    this.validationIssues.delete(path);
  }

  private setIssue(path: string, message: string): void {
    const issues = this.validationIssues.get(path) ?? [];
    issues.push({ path, message });
    this.validationIssues.set(path, issues);
  }

  private parseFile(path: string, content: string): ParsedEntity | null {
    if (path.startsWith(`${this.getSubfolder("agents")}/`)) {
      return this.parseAgent(path, content);
    }
    if (path.startsWith(`${this.getSubfolder("skills")}/`)) {
      return this.parseSkill(path, content);
    }
    if (path.startsWith(`${this.getSubfolder("tasks")}/`)) {
      return this.parseTask(path, content);
    }
    return null;
  }

  private parseAgent(path: string, content: string): AgentConfig | null {
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    if (!isRecord(frontmatter)) {
      this.setIssue(path, "Invalid frontmatter.");
      return null;
    }

    const name = asString(frontmatter.name);
    const model = asString(frontmatter.model) ?? this.settings.defaultModel;
    if (!name || !model) {
      this.setIssue(path, "Agent requires string field `name` and a valid model or default model setting.");
      return null;
    }

    // Legacy migration for flat agents: pull rules from frontmatter
    // allowed_tools/blocked_tools when present. The sidecar
    // <name>.permissions.json (read in loadFile) will override these if it
    // exists and parses cleanly. Saving the agent rewrites rules to the
    // sidecar and stops emitting the legacy frontmatter fields.
    const legacyAllow = asStringArray(frontmatter.allowed_tools);
    const legacyDeny = asStringArray(frontmatter.blocked_tools);
    if ((legacyAllow.length > 0 || legacyDeny.length > 0) && !this.warnedLegacyPerms.has(name)) {
      this.warnedLegacyPerms.add(name);
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
      env: this.parseEnvMap(frontmatter.env),
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

  private parseSkill(path: string, content: string): SkillConfig | null {
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    const name = asString(frontmatter.name);
    if (!name) {
      this.setIssue(path, "Skill requires string field `name`.");
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

  private parseTask(path: string, content: string): TaskConfig | null {
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    const taskId = asString(frontmatter.task_id);
    const agent = asString(frontmatter.agent);
    const type = asString(frontmatter.type) as TaskConfig["type"] | undefined;
    if (!taskId || !agent || !type) {
      this.setIssue(path, "Task requires `task_id`, `agent`, and `type`.");
      return null;
    }
    if (type === "recurring" && !asString(frontmatter.schedule)) {
      this.setIssue(path, "Recurring task requires `schedule`.");
      return null;
    }
    if (type === "once" && !asString(frontmatter.run_at)) {
      this.setIssue(path, "One-time task requires `run_at`.");
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
      catchUp: asBoolean(frontmatter.catch_up, this.settings.catchUpMissedTasks),
      effort: asString(frontmatter.effort),
      model: asString(frontmatter.model),
      channel: asString(frontmatter.channel),
      channelTarget: asString(frontmatter.channel_target),
      tags: asStringArray(frontmatter.tags),
      body,
    };
  }

  private parseChannelFile(path: string, content: string): ChannelConfig | null {
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);

    const name = asString(frontmatter.name);
    if (!name) {
      this.setIssue(path, "Channel requires string field `name`.");
      return null;
    }

    const rawType = asString(frontmatter.type);
    const validTypes: readonly string[] = ["slack", "telegram", "discord"];
    if (!rawType || !validTypes.includes(rawType)) {
      this.setIssue(
        path,
        `Channel \`${name}\` requires \`type\` to be one of: ${validTypes.join(", ")}.`,
      );
      return null;
    }
    const type = rawType as ChannelConfig["type"];

    // `default_agent` is the canonical field; `agent` is accepted as a backward-compat alias.
    const defaultAgent = asString(frontmatter.default_agent) ?? asString(frontmatter.agent);
    if (!defaultAgent) {
      this.setIssue(path, `Channel \`${name}\` requires \`default_agent\` (or \`agent\`).`);
      return null;
    }

    const allowedAgents = asStringArray(frontmatter.allowed_agents);

    const credentialRef = asString(frontmatter.credential_ref);
    if (!credentialRef) {
      this.setIssue(
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

  /**
   * Parse one `_fleet/mcp/<name>.md` registry file. The frontmatter holds the
   * non-secret server definition; the body is a human description. Secrets
   * (bearer/OAuth tokens, secret env values) are NEVER read here — they live in
   * SecretStore and are resolved at projection time.
   */
  private parseMcpServerFile(path: string, content: string): McpServer | null {
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);

    const name = asString(frontmatter.name);
    if (!name) {
      this.setIssue(path, "MCP server requires string field `name`.");
      return null;
    }

    // `transport` is the canonical frontmatter key; `type` is accepted as an
    // alias (matches the native config vocabulary).
    const rawTransport = (asString(frontmatter.transport) ?? asString(frontmatter.type) ?? "").toLowerCase();
    const validTransports: readonly string[] = ["stdio", "http", "sse"];
    if (!validTransports.includes(rawTransport)) {
      this.setIssue(
        path,
        `MCP server \`${name}\` requires \`transport\` to be one of: ${validTransports.join(", ")}.`,
      );
      return null;
    }
    const type = rawTransport as McpServer["type"];

    if (type === "stdio") {
      if (!asString(frontmatter.command)) {
        this.setIssue(path, `MCP server \`${name}\` (stdio) requires a \`command\`.`);
        return null;
      }
    } else if (!asString(frontmatter.url)) {
      this.setIssue(path, `MCP server \`${name}\` (${type}) requires a \`url\`.`);
      return null;
    }

    const rawAuth = (asString(frontmatter.auth) ?? "").toLowerCase();
    const auth: McpServer["auth"] =
      rawAuth === "bearer" || rawAuth === "oauth" || rawAuth === "none" ? rawAuth : undefined;

    let oauth: McpServer["oauth"];
    if (isRecord(frontmatter.oauth)) {
      const o = frontmatter.oauth;
      oauth = {
        clientId: asString(o.client_id) ?? asString(o.clientId),
        resource: asString(o.resource),
        scopes: asStringArray(o.scopes),
      };
    }

    return {
      name,
      filePath: path,
      type,
      enabled: asBoolean(frontmatter.enabled, true),
      description: asString(frontmatter.description) ?? (body.trim() || undefined),
      source: asString(frontmatter.source) === "imported" ? "imported" : "manual",
      command: asString(frontmatter.command),
      args: asStringArray(frontmatter.args),
      env: asStringMap(frontmatter.env),
      envSecretKeys: asStringArray(frontmatter.env_secret_keys),
      url: asString(frontmatter.url),
      headers: asStringMap(frontmatter.headers),
      auth,
      oauth,
      // Runtime-only fields — filled in by an on-demand probe, not persisted.
      status: "disconnected",
      scope: "user",
      tools: [],
      toolDetails: [],
    };
  }

  private validateReferences(): void {
    const skillNames = new Set<string>();
    for (const skill of this.skills.values()) {
      if (skillNames.has(skill.name)) {
        this.setIssue(skill.filePath, `Duplicate skill name \`${skill.name}\`.`);
      }
      skillNames.add(skill.name);
    }

    const agentNames = new Set<string>();
    for (const agent of this.agents.values()) {
      if (agentNames.has(agent.name)) {
        this.setIssue(agent.filePath, `Duplicate agent name \`${agent.name}\`.`);
      }
      agentNames.add(agent.name);
      for (const skillName of agent.skills) {
        if (!skillNames.has(skillName)) {
          this.setIssue(agent.filePath, `Agent references missing skill \`${skillName}\`.`);
        }
      }
    }

    for (const task of this.tasks.values()) {
      if (!agentNames.has(task.agent)) {
        this.setIssue(task.filePath, `Task references missing agent \`${task.agent}\`.`);
      }
    }

    const channelNames = new Set<string>();
    const agentsByName = new Map<string, AgentConfig>();
    for (const agent of this.agents.values()) {
      agentsByName.set(agent.name, agent);
    }
    const credentials = this.channelCredentialGetter?.() ?? this.settings.channelCredentials ?? {};

    for (const channel of this.channels.values()) {
      if (channelNames.has(channel.name)) {
        this.setIssue(channel.filePath, `Duplicate channel name \`${channel.name}\`.`);
      }
      channelNames.add(channel.name);

      const boundAgent = agentsByName.get(channel.defaultAgent);
      if (!boundAgent) {
        this.setIssue(
          channel.filePath,
          `Channel \`${channel.name}\` references missing agent \`${channel.defaultAgent}\`.`,
        );
      } else if (boundAgent.approvalRequired.length > 0) {
        // Channels have no approval UI; a channel turn needing approval would deadlock.
        // Block the binding at load time — the channel loads but is treated as disabled.
        this.setIssue(
          channel.filePath,
          `Channel \`${channel.name}\` cannot bind to agent \`${boundAgent.name}\` because the agent has \`approval_required\` set (${boundAgent.approvalRequired.join(", ")}). Clear the approval list on the agent or pick a different agent.`,
        );
      }

      const credential = credentials[channel.credentialRef];
      if (!credential) {
        this.setIssue(
          channel.filePath,
          `Channel \`${channel.name}\` references missing credential \`${channel.credentialRef}\`. Add it under Settings → Channel Credentials.`,
        );
      } else if (credential.type !== channel.type) {
        this.setIssue(
          channel.filePath,
          `Channel \`${channel.name}\` is type \`${channel.type}\` but credential \`${channel.credentialRef}\` is type \`${credential.type}\`.`,
        );
      }
    }

    const mcpNames = new Set<string>();
    for (const server of this.mcpServers.values()) {
      if (mcpNames.has(server.name)) {
        this.setIssue(server.filePath ?? server.name, `Duplicate MCP server name \`${server.name}\`.`);
      }
      mcpNames.add(server.name);
    }
  }

  private parseEnvMap(value: unknown): Record<string, string> {
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

  private parseApprovals(value: unknown): RunLogData["approvals"] {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.flatMap((item) => {
      if (!isRecord(item) || !asString(item.tool)) {
        return [];
      }
      const tool = asString(item.tool);
      if (!tool) {
        return [];
      }
      return [
        {
          tool,
          command: asString(item.command),
          reason: asString(item.reason),
          status: (asString(item.status) as "pending" | "approved" | "rejected") ?? "pending",
          resolvedAt: asString(item.resolvedAt),
          note: asString(item.note),
        },
      ];
    });
  }
}
