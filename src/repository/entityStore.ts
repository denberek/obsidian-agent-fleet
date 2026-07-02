import { TFile, TFolder, normalizePath } from "obsidian";
import type { App, Vault } from "obsidian";
import type { FLEET_SUBFOLDERS } from "../constants";
import { asStringArray } from "./shared";
import {
  loadFolderAgent,
  loadFolderSkill,
  parseAgent,
  parseChannelFile,
  parseSkill,
  parseTask,
  sidecarPermissionsPath,
} from "./entityParsers";
import type { ParsedEntity, ParserContext } from "./entityParsers";
import type {
  AgentConfig,
  ChannelConfig,
  ChannelCredentialEntry,
  FleetSettings,
  FleetSnapshot,
  McpServer,
  SkillConfig,
  TaskConfig,
  ValidationIssue,
} from "../types";

/** A path-keyed entity map that notifies on every mutation. The store's
 *  name-keyed lookup indexes are invalidated through this callback, so no
 *  mutation site (load, reload, delete, clear) can ever be missed — staleness
 *  is impossible by construction rather than by auditing call sites. */
class MutationTrackedMap<V> extends Map<string, V> {
  constructor(private readonly onMutate: () => void) {
    super();
  }
  override set(key: string, value: V): this {
    this.onMutate();
    return super.set(key, value);
  }
  override delete(key: string): boolean {
    this.onMutate();
    return super.delete(key);
  }
  override clear(): void {
    this.onMutate();
    super.clear();
  }
}

/**
 * The entity cluster extracted from the FleetRepository facade: in-memory
 * agent/skill/task/channel/MCP-server maps, the load flow (flat + folder
 * entities), the two-tier validation-issue bookkeeping, and cross-entity
 * reference validation. The facade delegates here and keeps only wiring and
 * cross-store operations. Persisting mutations (create/update/delete entity
 * files) lives in EntityMutations, which drives this store's maps through
 * loadFile/clearStoredFile/validateReferences.
 */
export class EntityStore {
  private agents = new MutationTrackedMap<AgentConfig>(() => {
    this.nameIndexesStale = true;
  });
  private skills = new MutationTrackedMap<SkillConfig>(() => {
    this.nameIndexesStale = true;
  });
  private tasks = new MutationTrackedMap<TaskConfig>(() => {
    this.nameIndexesStale = true;
  });
  private channels = new Map<string, ChannelConfig>();
  private mcpServers = new Map<string, McpServer>();
  /** Load-time issues (parse failures, corrupt permission/sidecar files),
   *  keyed by file path. Set while loading individual files and cleared only
   *  when that file is re-parsed or removed. */
  private validationIssues = new Map<string, ValidationIssue[]>();
  /** Cross-entity REFERENCE issues (missing skill/agent/credential, duplicate
   *  names), keyed by file path. Kept separate from {@link validationIssues}
   *  so {@link validateReferences} can be re-run after any mutation: it clears
   *  and recomputes only this map, never touching (or duplicating alongside)
   *  the load-time corrupt-file issues. */
  private referenceIssues = new Map<string, ValidationIssue[]>();
  /** True while loadAll() streams files in — suppresses the per-mutation
   *  validateReferences() so a bulk load validates once at the end instead of
   *  once per file. */
  private bulkLoading = false;

  /** Lazily rebuilt name-keyed indexes over agents/skills/tasks. Keeps the
   *  FIRST entity per name (insertion order) so duplicate names resolve the
   *  same way the previous linear `find()` scans did. */
  private nameIndexesStale = true;
  private agentsByName = new Map<string, AgentConfig>();
  private skillsByName = new Map<string, SkillConfig>();
  private tasksById = new Map<string, TaskConfig>();

  private channelCredentialGetter?: () => Record<string, ChannelCredentialEntry>;

  /** Agents we've already logged a folder-model-conflict warning for. */
  private warnedFolderAgentModelConflict = new Set<string>();
  private warnedLegacyPerms = new Set<string>();

  private readonly vault: Vault;
  private readonly settings: FleetSettings;
  /** Context handed to the extracted entity parsers — same surface the
   *  parsers had as private facade methods (vault reads, issue reporting into
   *  {@link validationIssues}, the one-time-warning sets). */
  private readonly parserCtx: ParserContext;

  constructor(
    app: App,
    private readonly deps: {
      settings: FleetSettings;
      getFleetRoot: () => string;
      getSubfolder: (name: (typeof FLEET_SUBFOLDERS)[number]) => string;
      /** MCP registry files are parsed by McpRegistry; the store only owns the
       *  in-memory server map. Routed through the facade so registry parse
       *  errors keep landing in this store's validation-issue map. */
      parseMcpServerFile: (path: string, content: string) => McpServer | null;
    },
  ) {
    this.vault = app.vault;
    this.settings = deps.settings;
    this.parserCtx = {
      vault: this.vault,
      settings: this.settings,
      reportIssue: (path, message) => this.setIssue(path, message),
      clearIssue: (path) => {
        this.validationIssues.delete(path);
      },
      warnedLegacyPerms: this.warnedLegacyPerms,
      warnedFolderAgentModelConflict: this.warnedFolderAgentModelConflict,
    };
  }

  /** Inject a live credential getter so validation reads from the credential store
   *  instead of the (possibly empty post-migration) settings.channelCredentials. */
  setChannelCredentialGetter(getter: () => Record<string, ChannelCredentialEntry>): void {
    this.channelCredentialGetter = getter;
  }

  async loadAll(): Promise<FleetSnapshot> {
    this.agents.clear();
    this.skills.clear();
    this.tasks.clear();
    this.channels.clear();
    this.mcpServers.clear();
    this.validationIssues.clear();
    this.referenceIssues.clear();

    this.bulkLoading = true;
    try {
      // Load folder-based agents and skills first
      await this.loadFolderAgents();
      await this.loadFolderSkills();

      const files = this.vault
        .getMarkdownFiles()
        .filter((file) => file.path.startsWith(`${this.deps.getFleetRoot()}/`));

      for (const file of files) {
        await this.loadFile(file);
      }
    } finally {
      this.bulkLoading = false;
    }

    this.validateReferences();
    return this.getSnapshot();
  }

  async loadFile(fileOrPath: TFile | string): Promise<void> {
    await this.loadFileInternal(fileOrPath);
    // Entity references may have changed (e.g. an agent's skills list edited on
    // disk, a task retargeted) — recompute reference issues immediately instead
    // of waiting for the next full loadAll(). Skipped inside loadAll's own loop
    // (validated once at the end). Cheap: validateReferences is a pure in-memory
    // pass over the loaded maps.
    if (!this.bulkLoading) this.validateReferences();
  }

  private async loadFileInternal(fileOrPath: TFile | string): Promise<void> {
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
    const channelsPrefix = `${this.deps.getSubfolder("channels")}/`;
    if (file.path.startsWith(channelsPrefix)) {
      // Skip nested files (e.g. sessions/<id>.json). Only top-level *.md are channel configs.
      const rel = file.path.slice(channelsPrefix.length);
      if (!rel.includes("/")) {
        const content = await this.vault.cachedRead(file);
        const channel = parseChannelFile(this.parserCtx, file.path, content);
        if (channel) {
          this.channels.set(file.path, channel);
        }
      }
      return;
    }

    // MCP server registry files live under _fleet/mcp/ and, like channels, are
    // parsed through a dedicated path that does NOT flow through parseFile()
    // (they're not part of the ParsedEntity union).
    const mcpPrefix = `${this.deps.getSubfolder("mcp")}/`;
    if (file.path.startsWith(mcpPrefix)) {
      const rel = file.path.slice(mcpPrefix.length);
      if (!rel.includes("/")) {
        const content = await this.vault.cachedRead(file);
        const server = this.deps.parseMcpServerFile(file.path, content);
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
          // clearStoredFile above only clears issues keyed on the .md path;
          // drop any stale sidecar issue before re-evaluating the file.
          this.validationIssues.delete(sidecarPath);
          const sidecarFile = this.vault.getAbstractFileByPath(sidecarPath);
          if (sidecarFile instanceof TFile) {
            try {
              const sidecarContent = await this.vault.cachedRead(sidecarFile);
              const data = JSON.parse(sidecarContent) as Record<string, unknown>;
              parsed.permissionRules = {
                allow: asStringArray(data.allow),
                deny: asStringArray(data.deny),
              };
            } catch (err) {
              // Invalid sidecar JSON — keep whatever permissionRules parseAgent assigned.
              console.error(
                `Agent Fleet: invalid JSON in ${sidecarPath} — agent "${parsed.name}" falls back to legacy frontmatter permission rules`,
                err,
              );
              this.setIssue(
                sidecarPath,
                `Invalid JSON in ${sidecarPath} for agent \`${parsed.name}\` — sidecar permission rules are NOT applied.`,
              );
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
    const agentsDir = `${this.deps.getSubfolder("agents")}/`;
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

    const agent = await loadFolderAgent(this.parserCtx, folderPath, agentMdFile);
    if (agent) {
      this.agents.set(agentMdPath, agent);
    }
  }

  private isInsideAgentFolder(path: string): boolean {
    const agentsDir = `${this.deps.getSubfolder("agents")}/`;
    if (!path.startsWith(agentsDir)) return false;
    const relative = path.slice(agentsDir.length);
    return relative.includes("/");
  }

  private isInsideSkillFolder(path: string): boolean {
    const skillsDir = `${this.deps.getSubfolder("skills")}/`;
    if (!path.startsWith(skillsDir)) return false;
    const relative = path.slice(skillsDir.length);
    return relative.includes("/");
  }

  private async reloadFolderSkillContaining(filePath: string): Promise<void> {
    const skillsDir = `${this.deps.getSubfolder("skills")}/`;
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

    const skill = await loadFolderSkill(this.parserCtx, folderPath, skillMdFile);
    if (skill) {
      this.skills.set(skillMdPath, skill);
    }
  }

  private async loadFolderSkills(): Promise<void> {
    const skillsFolder = this.vault.getAbstractFileByPath(this.deps.getSubfolder("skills"));
    if (!(skillsFolder instanceof TFolder)) return;

    for (const child of skillsFolder.children) {
      if (!(child instanceof TFolder)) continue;
      const skillMdPath = normalizePath(`${child.path}/skill.md`);
      const skillMdFile = this.vault.getAbstractFileByPath(skillMdPath);
      if (!(skillMdFile instanceof TFile)) continue;

      const skill = await loadFolderSkill(this.parserCtx, child.path, skillMdFile);
      if (skill) {
        this.skills.set(skillMdPath, skill);
      }
    }
  }

  private async loadFolderAgents(): Promise<void> {
    const agentsFolder = this.vault.getAbstractFileByPath(this.deps.getSubfolder("agents"));
    if (!(agentsFolder instanceof TFolder)) return;

    for (const child of agentsFolder.children) {
      if (!(child instanceof TFolder)) continue;
      const agentMdPath = normalizePath(`${child.path}/agent.md`);
      const agentMdFile = this.vault.getAbstractFileByPath(agentMdPath);
      if (!(agentMdFile instanceof TFile)) continue;

      const agent = await loadFolderAgent(this.parserCtx, child.path, agentMdFile);
      if (agent) {
        this.agents.set(agentMdPath, agent);
      }
    }
  }

  removeFile(path: string): void {
    this.clearStoredFile(path);
    // A removed entity can orphan references pointing at it — revalidate now.
    if (!this.bulkLoading) this.validateReferences();
  }

  getSnapshot(): FleetSnapshot {
    return {
      agents: Array.from(this.agents.values()).sort((a, b) => a.name.localeCompare(b.name)),
      skills: Array.from(this.skills.values()).sort((a, b) => a.name.localeCompare(b.name)),
      tasks: Array.from(this.tasks.values()).sort((a, b) => a.taskId.localeCompare(b.taskId)),
      channels: Array.from(this.channels.values()).sort((a, b) => a.name.localeCompare(b.name)),
      mcpServers: Array.from(this.mcpServers.values()).sort((a, b) => a.name.localeCompare(b.name)),
      validationIssues: [
        ...Array.from(this.validationIssues.values()).flat(),
        ...Array.from(this.referenceIssues.values()).flat(),
      ],
    };
  }

  private rebuildNameIndexes(): void {
    if (!this.nameIndexesStale) return;
    this.agentsByName.clear();
    this.skillsByName.clear();
    this.tasksById.clear();
    for (const agent of this.agents.values()) {
      if (!this.agentsByName.has(agent.name)) this.agentsByName.set(agent.name, agent);
    }
    for (const skill of this.skills.values()) {
      if (!this.skillsByName.has(skill.name)) this.skillsByName.set(skill.name, skill);
    }
    for (const task of this.tasks.values()) {
      if (!this.tasksById.has(task.taskId)) this.tasksById.set(task.taskId, task);
    }
    this.nameIndexesStale = false;
  }

  getAgentByName(name: string): AgentConfig | undefined {
    this.rebuildNameIndexes();
    return this.agentsByName.get(name);
  }

  getSkillByName(name: string): SkillConfig | undefined {
    this.rebuildNameIndexes();
    return this.skillsByName.get(name);
  }

  getTaskById(taskId: string): TaskConfig | undefined {
    this.rebuildNameIndexes();
    return this.tasksById.get(taskId);
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

  /** Drop every in-memory entity and issue keyed on `path`. Public within the
   *  repository layer: EntityMutations drives it on delete paths. */
  clearStoredFile(path: string): void {
    this.agents.delete(path);
    this.skills.delete(path);
    this.tasks.delete(path);
    this.channels.delete(path);
    this.mcpServers.delete(path);
    this.validationIssues.delete(path);
    this.referenceIssues.delete(path);
  }

  /** Drop every stored issue keyed under `folderPath/` — folder agents/skills
   *  carry issues keyed on member files (e.g. permissions.json), which
   *  clearStoredFile(<entity>.md) alone would leave behind after a delete. */
  clearIssuesUnder(folderPath: string): void {
    const prefix = `${folderPath}/`;
    for (const key of [...this.validationIssues.keys()]) {
      if (key.startsWith(prefix)) this.validationIssues.delete(key);
    }
    for (const key of [...this.referenceIssues.keys()]) {
      if (key.startsWith(prefix)) this.referenceIssues.delete(key);
    }
  }

  /** Drop both load-time and reference issues keyed on exactly `path` — used
   *  when deleting a flat agent to clear its permissions-sidecar issues. */
  clearIssuesFor(path: string): void {
    this.validationIssues.delete(path);
    this.referenceIssues.delete(path);
  }

  /** Record a LOAD-TIME issue (parse failure, corrupt permission/sidecar
   *  file). Public within the repository layer: McpRegistry reports its parse
   *  errors here (wired through the facade) so they land in the same map as
   *  every other parser's. */
  setIssue(path: string, message: string): void {
    const issues = this.validationIssues.get(path) ?? [];
    issues.push({ path, message });
    this.validationIssues.set(path, issues);
  }

  /** Record a cross-entity reference issue. Lives in {@link referenceIssues}
   *  (recomputed wholesale by validateReferences), NOT in the load-time
   *  {@link validationIssues} map. */
  private setReferenceIssue(path: string, message: string): void {
    const issues = this.referenceIssues.get(path) ?? [];
    issues.push({ path, message });
    this.referenceIssues.set(path, issues);
  }

  private parseFile(path: string, content: string): ParsedEntity | null {
    if (path.startsWith(`${this.deps.getSubfolder("agents")}/`)) {
      return parseAgent(this.parserCtx, path, content);
    }
    if (path.startsWith(`${this.deps.getSubfolder("skills")}/`)) {
      return parseSkill(this.parserCtx, path, content);
    }
    if (path.startsWith(`${this.deps.getSubfolder("tasks")}/`)) {
      return parseTask(this.parserCtx, path, content);
    }
    return null;
  }

  /**
   * Recompute every cross-entity reference issue from the in-memory maps.
   * Pure in-memory pass (no vault I/O — only the loaded maps plus the injected
   * credential getter), so it is cheap enough to re-run after every mutation.
   * Idempotent: {@link referenceIssues} is cleared and rebuilt wholesale each
   * run; load-time corrupt-file issues live in the separate
   * {@link validationIssues} map and are never touched here.
   *
   * Public within the repository layer: EntityMutations re-runs it after each
   * delete once all map mutations are done.
   */
  validateReferences(): void {
    this.referenceIssues.clear();

    const skillNames = new Set<string>();
    for (const skill of this.skills.values()) {
      if (skillNames.has(skill.name)) {
        this.setReferenceIssue(skill.filePath, `Duplicate skill name \`${skill.name}\`.`);
      }
      skillNames.add(skill.name);
    }

    const agentNames = new Set<string>();
    for (const agent of this.agents.values()) {
      if (agentNames.has(agent.name)) {
        this.setReferenceIssue(agent.filePath, `Duplicate agent name \`${agent.name}\`.`);
      }
      agentNames.add(agent.name);
      for (const skillName of agent.skills) {
        if (!skillNames.has(skillName)) {
          this.setReferenceIssue(agent.filePath, `Agent references missing skill \`${skillName}\`.`);
        }
      }
    }

    for (const task of this.tasks.values()) {
      if (!agentNames.has(task.agent)) {
        this.setReferenceIssue(task.filePath, `Task references missing agent \`${task.agent}\`.`);
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
        this.setReferenceIssue(channel.filePath, `Duplicate channel name \`${channel.name}\`.`);
      }
      channelNames.add(channel.name);

      const boundAgent = agentsByName.get(channel.defaultAgent);
      if (!boundAgent) {
        this.setReferenceIssue(
          channel.filePath,
          `Channel \`${channel.name}\` references missing agent \`${channel.defaultAgent}\`.`,
        );
      } else if (boundAgent.approvalRequired.length > 0) {
        // Channels have no approval UI; a channel turn needing approval would deadlock.
        // Block the binding at load time — the channel loads but is treated as disabled.
        this.setReferenceIssue(
          channel.filePath,
          `Channel \`${channel.name}\` cannot bind to agent \`${boundAgent.name}\` because the agent has \`approval_required\` set (${boundAgent.approvalRequired.join(", ")}). Clear the approval list on the agent or pick a different agent.`,
        );
      }

      const credential = credentials[channel.credentialRef];
      if (!credential) {
        this.setReferenceIssue(
          channel.filePath,
          `Channel \`${channel.name}\` references missing credential \`${channel.credentialRef}\`. Add it under Settings → Channel Credentials.`,
        );
      } else if (credential.type !== channel.type) {
        this.setReferenceIssue(
          channel.filePath,
          `Channel \`${channel.name}\` is type \`${channel.type}\` but credential \`${channel.credentialRef}\` is type \`${credential.type}\`.`,
        );
      }
    }

    const mcpNames = new Set<string>();
    for (const server of this.mcpServers.values()) {
      if (mcpNames.has(server.name)) {
        this.setReferenceIssue(server.filePath ?? server.name, `Duplicate MCP server name \`${server.name}\`.`);
      }
      mcpNames.add(server.name);
    }
  }
}
