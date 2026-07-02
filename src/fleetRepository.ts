import { App, FileSystemAdapter, TFile, Vault, normalizePath } from "obsidian";
import { FLEET_SUBFOLDERS } from "./constants";
import { DEFAULT_FILES } from "./defaults";
import {
  createFileIfMissing,
  ensureFolder,
  getAvailablePath,
  trashPath,
} from "./repository/shared";
import { ConversationStore } from "./repository/conversationStore";
import { EntityMutations } from "./repository/entityMutations";
import type {
  AgentUpdates,
  ChannelUpdates,
  CreateAgentFolderOptions,
  CreateSkillFolderOptions,
  HeartbeatUpdates,
  SkillUpdates,
  TaskUpdates,
} from "./repository/entityMutations";
import { EntityStore } from "./repository/entityStore";
import { MemoryStore } from "./repository/memoryStore";
import { McpRegistry } from "./repository/mcpRegistry";
import { ProposalStore } from "./repository/proposalStore";
import { RunLogStore } from "./repository/runLogStore";
import { UsageLedger } from "./repository/usageLedger";
import type {
  AgentConfig,
  ChannelConfig,
  ChannelCredentialEntry,
  ConversationMeta,
  FleetSettings,
  FleetSnapshot,
  MemoryFile,
  McpServer,
  RunLogData,
  SkillCandidate,
  SkillProposal,
  WorkingMemory,
  SkillConfig,
  TaskConfig,
  UsageRecord,
} from "./types";

/** Fast non-cryptographic hash for change detection on default files. */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return hash.toString(36);
}

/**
 * Facade over the `_fleet/` file tree. All state and behavior lives in the
 * extracted stores under src/repository/ — this class owns the wiring
 * (constructing each store with lazy path getters and cross-store callbacks),
 * fleet-folder structure + default-file management, and the few operations
 * that genuinely span stores (e.g. {@link migrateAllLegacyMemory}, which needs
 * the entity snapshot to drive the memory store).
 *
 * The entity cluster (parsing, load flow, validation issues, entity CRUD) is
 * split across EntityStore (in-memory maps + load/validate),
 * EntityMutations (persisting create/update/delete), and entityParsers
 * (flat + folder frontmatter parsing).
 */
export class FleetRepository {
  private readonly vault: Vault;

  // Extracted stores — the facade delegates to these; construction order is
  // irrelevant because they receive lazy path getters, not computed paths
  // (settings.fleetFolder can change between calls). Cross-store callbacks
  // (mcp → entity issue map, proposal/mcp live lookups) are routed through
  // facade arrow functions so each store sees the other's CURRENT state.
  private readonly entities: EntityStore;
  private readonly mutations: EntityMutations;
  private readonly runLogs: RunLogStore;
  private readonly usage: UsageLedger;
  private readonly conversations: ConversationStore;
  private readonly proposals: ProposalStore;
  private readonly mcp: McpRegistry;
  private readonly memory: MemoryStore;

  constructor(private readonly app: App, private readonly settings: FleetSettings) {
    this.vault = app.vault;
    this.entities = new EntityStore(app, {
      settings,
      getFleetRoot: () => this.getFleetRoot(),
      getSubfolder: (name) => this.getSubfolder(name),
      // Lazy: this.mcp is assigned below, and the callback only fires during
      // load — never during construction.
      parseMcpServerFile: (path, content) => this.mcp.parseMcpServerFile(path, content),
    });
    this.mutations = new EntityMutations(app, {
      store: this.entities,
      getSubfolder: (name) => this.getSubfolder(name),
      // Deleting an agent also trashes its MemoryStore-owned files.
      getMemoryPath: (agentName) => this.getMemoryPath(agentName),
      getMemoryDir: (agentName) => this.getMemoryDir(agentName),
    });
    this.runLogs = new RunLogStore(app, () => this.getRunsRoot());
    this.usage = new UsageLedger(app, () => this.getSubfolder("usage"));
    this.memory = new MemoryStore(app, () => this.getSubfolder("memory"));
    this.conversations = new ConversationStore(app, (agentName) => this.getMemoryPath(agentName));
    this.proposals = new ProposalStore(app, {
      getFleetRoot: () => this.getFleetRoot(),
      getSkillsDir: () => this.getSubfolder("skills"),
      getSkillByName: (name) => this.getSkillByName(name),
    });
    this.mcp = new McpRegistry(app, {
      getMcpDir: () => this.getSubfolder("mcp"),
      getServerByName: (name) => this.getMcpServerByName(name),
      // Registry parse errors land in the entity store's load-time
      // validation-issue map, same as every other parser's.
      reportIssue: (path, message) => this.entities.setIssue(path, message),
    });
  }

  /** Inject a live credential getter so validation reads from the credential store
   *  instead of the (possibly empty post-migration) settings.channelCredentials. */
  setChannelCredentialGetter(getter: () => Record<string, ChannelCredentialEntry>): void {
    this.entities.setChannelCredentialGetter(getter);
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
    await ensureFolder(this.vault, root);
    for (const subfolder of FLEET_SUBFOLDERS) {
      await ensureFolder(this.vault, this.getSubfolder(subfolder));
    }
    return isFirstRun;
  }

  async ensureSamples(): Promise<void> {
    const root = this.getFleetRoot();
    for (const file of DEFAULT_FILES) {
      const fullPath = normalizePath(`${root}/${file.path}`);
      const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
      await ensureFolder(this.vault, parentDir);
      await createFileIfMissing(this.vault, fullPath, file.content);
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
        await ensureFolder(this.vault, parentDir);
        await createFileIfMissing(this.vault, fullPath, file.content);
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

  // ═══════════════════════════════════════════════════════
  //  Entity load flow + lookups — delegates to EntityStore
  // ═══════════════════════════════════════════════════════

  /** Reload every entity under the fleet root from scratch. See
   *  {@link EntityStore.loadAll} for the bulk-load validation suppression. */
  async loadAll(): Promise<FleetSnapshot> {
    return this.entities.loadAll();
  }

  /** (Re)load one file into the in-memory maps and revalidate references. */
  async loadFile(fileOrPath: TFile | string): Promise<void> {
    return this.entities.loadFile(fileOrPath);
  }

  /** Drop a removed file's entities/issues and revalidate references. */
  removeFile(path: string): void {
    this.entities.removeFile(path);
  }

  getSnapshot(): FleetSnapshot {
    return this.entities.getSnapshot();
  }

  getAgentByName(name: string): AgentConfig | undefined {
    return this.entities.getAgentByName(name);
  }

  getSkillByName(name: string): SkillConfig | undefined {
    return this.entities.getSkillByName(name);
  }

  getTaskById(taskId: string): TaskConfig | undefined {
    return this.entities.getTaskById(taskId);
  }

  getTasksForAgent(agentName: string): TaskConfig[] {
    return this.entities.getTasksForAgent(agentName);
  }

  getChannelByName(name: string): ChannelConfig | undefined {
    return this.entities.getChannelByName(name);
  }

  getChannelsForAgent(agentName: string): ChannelConfig[] {
    return this.entities.getChannelsForAgent(agentName);
  }

  /** All registered MCP servers, sorted by name. */
  getMcpServers(): McpServer[] {
    return this.entities.getMcpServers();
  }

  getMcpServerByName(name: string): McpServer | undefined {
    return this.entities.getMcpServerByName(name);
  }

  getRunsRoot(): string {
    return this.getSubfolder("runs");
  }

  // ═══════════════════════════════════════════════════════
  //  Agent memory (v2 layout + legacy migration) — delegates to MemoryStore
  // ═══════════════════════════════════════════════════════

  /** @deprecated Legacy flat memory file path. New layout uses
   *  {@link getWorkingMemoryPath}. Retained for migration + back-compat. */
  getMemoryPath(agentName: string): string {
    return this.memory.getMemoryPath(agentName);
  }

  /** Folder holding an agent's v2 memory: working.md, candidates.md, raw/. */
  getMemoryDir(agentName: string): string {
    return this.memory.getMemoryDir(agentName);
  }

  /** Path to the curated, injected working-memory file (§6.2). */
  getWorkingMemoryPath(agentName: string): string {
    return this.memory.getWorkingMemoryPath(agentName);
  }

  /** Path to a day's append-only raw archive (§6.3). */
  getRawMemoryPath(agentName: string, dateIso: string): string {
    return this.memory.getRawMemoryPath(agentName, dateIso);
  }

  /** Read an agent's working memory (v2 or legacy migrated in-memory). */
  async readWorkingMemory(agentName: string): Promise<WorkingMemory | null> {
    return this.memory.readWorkingMemory(agentName);
  }

  /** Persist working memory to `working.md` (completes legacy migration). */
  async writeWorkingMemory(agentName: string, wm: WorkingMemory): Promise<void> {
    return this.memory.writeWorkingMemory(agentName, wm);
  }

  /** One-time legacy→v2 memory migration. See
   *  {@link MemoryStore.migrateLegacyMemory} for the raw-seeding and
   *  concurrent-caller (shared promise) semantics. */
  async migrateLegacyMemory(agentName: string): Promise<void> {
    return this.memory.migrateLegacyMemory(agentName);
  }

  /** Migrate every memory-enabled agent's legacy file once (called on load,
   *  before reflection jobs are registered). Stays on the facade because it
   *  needs the loaded agent snapshot. */
  async migrateAllLegacyMemory(): Promise<void> {
    for (const agent of this.getSnapshot().agents) {
      if (!agent.memory) continue;
      try {
        await this.memory.migrateLegacyMemory(agent.name);
      } catch (err) {
        console.warn(`Agent Fleet: legacy memory migration failed for "${agent.name}"`, err);
      }
    }
  }

  /** Vault-relative path to the agent's MCP-tool capture inbox directory (§7.5). */
  getPendingDir(agentName: string): string {
    return this.memory.getPendingDir(agentName);
  }

  /** Absolute on-disk path to the pending inbox dir, for the MCP server's env.
   *  Null when the vault is not a local filesystem (e.g. mobile). */
  getPendingDirAbsolutePath(agentName: string): string | null {
    return this.memory.getPendingDirAbsolutePath(agentName);
  }

  /** Ensure the agent's memory folder exists. */
  async ensureMemoryDir(agentName: string): Promise<void> {
    return this.memory.ensureMemoryDir(agentName);
  }

  /** Drain the MCP-tool capture inbox. See
   *  {@link MemoryStore.readAndClearPending} for the no-loss semantics. */
  async readAndClearPending(agentName: string): Promise<string[]> {
    return this.memory.readAndClearPending(agentName);
  }

  /** Read the recent raw archive (last `days` daily files) for reflection. */
  async readRecentRaw(agentName: string, days = 2): Promise<string> {
    return this.memory.readRecentRaw(agentName, days);
  }

  /** Path to the agent's skill-candidate ledger. */
  getCandidatesPath(agentName: string): string {
    return this.memory.getCandidatesPath(agentName);
  }

  async readCandidates(agentName: string): Promise<SkillCandidate[]> {
    return this.memory.readCandidates(agentName);
  }

  async writeCandidates(agentName: string, candidates: SkillCandidate[]): Promise<void> {
    return this.memory.writeCandidates(agentName, candidates);
  }

  // ═══════════════════════════════════════════════════════
  //  Skill proposals (memory → skills, §9) — delegates to ProposalStore
  // ═══════════════════════════════════════════════════════

  getProposalsDir(): string {
    return this.proposals.getProposalsDir();
  }

  /** List all proposals, newest first. */
  async listProposals(): Promise<SkillProposal[]> {
    return this.proposals.listProposals();
  }

  async readProposal(id: string): Promise<SkillProposal | null> {
    return this.proposals.readProposal(id);
  }

  async writeProposal(p: SkillProposal): Promise<void> {
    return this.proposals.writeProposal(p);
  }

  async setProposalStatus(id: string, status: SkillProposal["status"]): Promise<void> {
    return this.proposals.setProposalStatus(id, status);
  }

  /** Apply an accepted proposal: create the new skill (skill_create) or append
   *  the proposed change to the target skill (skill_modify). Returns the path of
   *  the affected skill, or null on no-op. */
  async applyProposal(p: SkillProposal): Promise<string | null> {
    return this.proposals.applyProposal(p);
  }

  async deleteProposal(id: string): Promise<void> {
    return this.proposals.deleteProposal(id);
  }

  /** Append timestamped lines to the day's raw archive (§6.3). Ground truth —
   *  append-only, never injected. Caller serializes via the MemoryWriter lock. */
  async appendRawMemory(agentName: string, lines: string[], dateIso: string): Promise<void> {
    return this.memory.appendRawMemory(agentName, lines, dateIso);
  }

  // ═══════════════════════════════════════════════════════
  //  Conversation registry — delegates to ConversationStore
  // ═══════════════════════════════════════════════════════

  /** List all conversations for an agent, sorted by lastActive desc. */
  async listConversations(agent: AgentConfig): Promise<ConversationMeta[]> {
    return this.conversations.listConversations(agent);
  }

  /** Create an empty conversation file with a given id + name (idempotent). */
  async createConversation(agent: AgentConfig, id: string, name: string): Promise<void> {
    return this.conversations.createConversation(agent, id, name);
  }

  /** Rename a conversation by writing a new `name` field into its state file. */
  async renameConversation(agent: AgentConfig, conversationId: string, name: string): Promise<void> {
    return this.conversations.renameConversation(agent, conversationId, name);
  }

  /** Delete a conversation (file, threads sidecar, empty parent folder). */
  async deleteConversation(agent: AgentConfig, conversationId: string): Promise<void> {
    return this.conversations.deleteConversation(agent, conversationId);
  }

  /**
   * @deprecated Back-compat shim. Returns a flat {@link MemoryFile} view,
   * preferring the v2 working memory (rendered body) and falling back to the
   * legacy flat file. New code should use {@link readWorkingMemory}.
   */
  async getMemory(agentName: string): Promise<MemoryFile | null> {
    return this.memory.getMemory(agentName);
  }

  /**
   * @deprecated Dead code — no remaining callers. See
   * {@link MemoryStore.appendMemory} for why it must not be resurrected
   * without MemoryWriter's lock.
   */
  async appendMemory(agentName: string, entries: string[]): Promise<void> {
    return this.memory.appendMemory(agentName, entries);
  }

  // ═══════════════════════════════════════════════════════
  //  Run logs + usage ledger — delegates to RunLogStore / UsageLedger
  // ═══════════════════════════════════════════════════════

  async listRecentRuns(limit = 50): Promise<RunLogData[]> {
    return this.runLogs.listRecentRuns(limit);
  }

  /** Return all runs whose date folder is on or after `sinceDate`. See
   *  {@link RunLogStore.listRunsSince}. */
  async listRunsSince(sinceDate: Date): Promise<RunLogData[]> {
    return this.runLogs.listRunsSince(sinceDate);
  }

  /** Append one usage record to the day's JSONL ledger (one line per turn). */
  async appendUsage(record: UsageRecord): Promise<void> {
    return this.usage.appendUsage(record);
  }

  /** Read all usage records on or after `sinceDate` (by ledger file date). */
  async readUsageSince(sinceDate: Date): Promise<UsageRecord[]> {
    return this.usage.readUsageSince(sinceDate);
  }

  /** One-time cumulative→per-turn cost repair. See
   *  {@link UsageLedger.migrateUsageLedgerCosts}. */
  async migrateUsageLedgerCosts(): Promise<{ files: number; rows: number; changed: number } | null> {
    return this.usage.migrateUsageLedgerCosts();
  }

  async readRunLog(file: TFile): Promise<RunLogData | null> {
    return this.runLogs.readRunLog(file);
  }

  async writeRunLog(run: RunLogData): Promise<string> {
    return this.runLogs.writeRunLog(run);
  }

  async setApprovalDecision(runPath: string, tool: string, decision: "approved" | "rejected"): Promise<void> {
    return this.runLogs.setApprovalDecision(runPath, tool, decision);
  }

  // ═══════════════════════════════════════════════════════
  //  Entity create/update/delete — delegates to EntityMutations
  // ═══════════════════════════════════════════════════════

  async updateTaskRunMetadata(task: TaskConfig, updates: Partial<Pick<TaskConfig, "lastRun" | "nextRun" | "runCount">>): Promise<void> {
    return this.mutations.updateTaskRunMetadata(task, updates);
  }

  async createAgentTemplate(name: string): Promise<TFile> {
    return this.mutations.createAgentTemplate(name);
  }

  async createAgentFolder(opts: CreateAgentFolderOptions): Promise<string> {
    return this.mutations.createAgentFolder(opts);
  }

  async createSkillTemplate(name: string): Promise<TFile> {
    return this.mutations.createSkillTemplate(name);
  }

  async createSkillFolder(opts: CreateSkillFolderOptions): Promise<void> {
    return this.mutations.createSkillFolder(opts);
  }

  async updateAgent(agentName: string, updates: AgentUpdates): Promise<void> {
    return this.mutations.updateAgent(agentName, updates);
  }

  async updateTask(taskId: string, updates: TaskUpdates): Promise<void> {
    return this.mutations.updateTask(taskId, updates);
  }

  async updateSkill(skillName: string, updates: SkillUpdates): Promise<void> {
    return this.mutations.updateSkill(skillName, updates);
  }

  async deleteSkill(skillName: string): Promise<void> {
    return this.mutations.deleteSkill(skillName);
  }

  async deleteTask(taskId: string): Promise<void> {
    return this.mutations.deleteTask(taskId);
  }

  async updateChannel(channelName: string, updates: ChannelUpdates): Promise<void> {
    return this.mutations.updateChannel(channelName, updates);
  }

  async deleteChannel(channelName: string): Promise<void> {
    return this.mutations.deleteChannel(channelName);
  }

  async updateHeartbeat(agentName: string, updates: HeartbeatUpdates): Promise<void> {
    return this.mutations.updateHeartbeat(agentName, updates);
  }

  async deleteAgent(agentName: string, deleteTasks: boolean): Promise<{ trashedFiles: string[] }> {
    return this.mutations.deleteAgent(agentName, deleteTasks);
  }

  // ═══════════════════════════════════════════════════════
  //  MCP server registry — delegates to McpRegistry
  // ═══════════════════════════════════════════════════════

  /** Create or update an MCP server registry file. See
   *  {@link McpRegistry.saveMcpServer}. */
  async saveMcpServer(server: McpServer, body = ""): Promise<string> {
    return this.mcp.saveMcpServer(server, body);
  }

  /** Flip an MCP server's `enabled` flag in its registry file. */
  async setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
    return this.mcp.setMcpServerEnabled(name, enabled);
  }

  /** Trash an MCP server's registry file. */
  async deleteMcpServer(name: string): Promise<void> {
    return this.mcp.deleteMcpServer(name);
  }

  async trashFile(path: string): Promise<void> {
    await trashPath(this.app, path);
  }

  async getAvailablePath(folder: string, baseName: string): Promise<string> {
    return getAvailablePath(this.vault, folder, baseName);
  }
}
