import { TFile, TFolder, normalizePath } from "obsidian";
import type { App, Vault } from "obsidian";
import type { FLEET_SUBFOLDERS } from "../constants";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter, slugify } from "../utils/markdown";
import { collectMarkdownChildren, createFileIfMissing, ensureFolder, getAvailablePath, trashPath } from "./shared";
import { sidecarPermissionsPath } from "./entityParsers";
import type { EntityStore } from "./entityStore";
import type { TaskConfig } from "../types";

// ═══════════════════════════════════════════════════════
//  Update/create option shapes — structurally identical to the inline object
//  types the facade methods have always taken, so callers are unaffected.
// ═══════════════════════════════════════════════════════

export interface CreateAgentFolderOptions {
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
}

export interface CreateSkillFolderOptions {
  name: string;
  description: string;
  tags: string[];
  body: string;
  toolsBody: string;
  referencesBody: string;
  examplesBody: string;
}

export interface AgentUpdates {
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
}

export interface TaskUpdates {
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
}

export interface SkillUpdates {
  description?: string;
  tags?: string[];
  body?: string;
  toolsBody?: string;
  referencesBody?: string;
  examplesBody?: string;
}

export interface ChannelUpdates {
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
}

export interface HeartbeatUpdates {
  enabled?: boolean;
  schedule?: string;
  notify?: boolean;
  channel?: string;
  channelTarget?: string;
  body?: string;
}

/**
 * Entity create/update/delete: persists changes to the vault files, then
 * drives the EntityStore (loadFile / clearStoredFile / validateReferences) so
 * the in-memory maps and reference issues are fresh without waiting for the
 * debounced vault-event reload. Extracted verbatim from the FleetRepository
 * facade; memory paths are injected because deleting an agent also trashes
 * its MemoryStore-owned files.
 */
export class EntityMutations {
  private readonly vault: Vault;

  constructor(
    private readonly app: App,
    private readonly deps: {
      store: EntityStore;
      getSubfolder: (name: (typeof FLEET_SUBFOLDERS)[number]) => string;
      getMemoryPath: (agentName: string) => string;
      getMemoryDir: (agentName: string) => string;
    },
  ) {
    this.vault = app.vault;
  }

  private get store(): EntityStore {
    return this.deps.store;
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
    await this.store.loadFile(file);
  }

  async createAgentTemplate(name: string): Promise<TFile> {
    const path = await getAvailablePath(this.vault, this.deps.getSubfolder("agents"), slugify(name));
    const content = `---\nname: ${slugify(name)}\ndescription: \nenabled: true\nskills: []\ntags: []\n---\n\nAgent instructions go here.\n`;
    const file = await this.vault.create(path, content);
    // Register the new entity in-memory and revalidate references immediately
    // (a new agent can resolve a task's missing-agent issue) instead of waiting
    // for the debounced vault-event reload.
    await this.store.loadFile(file);
    return file;
  }

  async createAgentFolder(opts: CreateAgentFolderOptions): Promise<string> {
    const slug = slugify(opts.name);
    const folderPath = normalizePath(`${this.deps.getSubfolder("agents")}/${slug}`);
    await ensureFolder(this.vault, folderPath);

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

    // Register the new folder agent in-memory + revalidate references now.
    await this.store.loadFile(agentPath);
    return agentPath;
  }

  async createSkillTemplate(name: string): Promise<TFile> {
    const path = await getAvailablePath(this.vault, this.deps.getSubfolder("skills"), slugify(name));
    const content = `---\nname: ${slugify(name)}\ndescription: \ntags: []\n---\n\nSkill instructions go here.\n`;
    const file = await this.vault.create(path, content);
    // Register in-memory + revalidate (a new skill can resolve an agent's
    // missing-skill issue) without waiting for the debounced vault reload.
    await this.store.loadFile(file);
    return file;
  }

  async createSkillFolder(opts: CreateSkillFolderOptions): Promise<void> {
    const folderPath = normalizePath(`${this.deps.getSubfolder("skills")}/${slugify(opts.name)}`);
    await ensureFolder(this.vault, folderPath);

    const skillFm = {
      name: opts.name,
      description: opts.description || undefined,
      tags: opts.tags.length > 0 ? opts.tags : undefined,
    };
    const skillPath = normalizePath(`${folderPath}/skill.md`);
    await createFileIfMissing(this.vault, skillPath, stringifyMarkdownWithFrontmatter(skillFm, opts.body || "Skill instructions go here."));

    if (opts.toolsBody) {
      const toolsPath = normalizePath(`${folderPath}/tools.md`);
      await createFileIfMissing(this.vault, toolsPath, `# Tools\n\n${opts.toolsBody}`);
    }

    if (opts.referencesBody) {
      const refsPath = normalizePath(`${folderPath}/references.md`);
      await createFileIfMissing(this.vault, refsPath, `# References\n\n${opts.referencesBody}`);
    }

    if (opts.examplesBody) {
      const examplesPath = normalizePath(`${folderPath}/examples.md`);
      await createFileIfMissing(this.vault, examplesPath, `# Examples\n\n${opts.examplesBody}`);
    }

    // Register the new folder skill in-memory + revalidate references now.
    await this.store.loadFile(skillPath);
  }

  async updateAgent(agentName: string, updates: AgentUpdates): Promise<void> {
    const agent = this.store.getAgentByName(agentName);
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

    // Reload the edited entity into the in-memory maps and revalidate — the
    // skills list may now reference a missing skill (or resolve one).
    await this.store.loadFile(agent.filePath);
  }

  async updateTask(taskId: string, updates: TaskUpdates): Promise<void> {
    const task = this.store.getTaskById(taskId);
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

    // Reload + revalidate — the task may have been retargeted to a different
    // (possibly missing) agent.
    await this.store.loadFile(file);
  }

  async updateSkill(skillName: string, updates: SkillUpdates): Promise<void> {
    const skill = this.store.getSkillByName(skillName);
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

    // Reload + revalidate (skill names can't change here, but keep the
    // in-memory entity fresh and the validation pass current).
    await this.store.loadFile(skill.filePath);
  }

  async deleteSkill(skillName: string): Promise<void> {
    const skill = this.store.getSkillByName(skillName);
    if (!skill) return;

    if (skill.isFolder) {
      const folderPath = normalizePath(skill.filePath.replace(/\/skill\.md$/, ""));
      const folder = this.vault.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        await this.app.fileManager.trashFile(folder);
      }
      this.store.clearIssuesUnder(folderPath);
    } else {
      await trashPath(this.app, skill.filePath);
    }

    // Drop the entity from the in-memory maps and revalidate immediately so
    // agents referencing the deleted skill are flagged without a full reload.
    this.store.clearStoredFile(skill.filePath);
    this.store.validateReferences();
  }

  async deleteTask(taskId: string): Promise<void> {
    const task = this.store.getTaskById(taskId);
    if (!task) return;
    await trashPath(this.app, task.filePath);
    this.store.clearStoredFile(task.filePath);
    this.store.validateReferences();
  }

  async updateChannel(channelName: string, updates: ChannelUpdates): Promise<void> {
    const channel = this.store.getChannelByName(channelName);
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

    // Reload + revalidate — default_agent / credential_ref may now dangle.
    await this.store.loadFile(file);
  }

  async deleteChannel(channelName: string): Promise<void> {
    const channel = this.store.getChannelByName(channelName);
    if (!channel) return;
    await trashPath(this.app, channel.filePath);
    this.store.clearStoredFile(channel.filePath);
    this.store.validateReferences();
    // Also trash the channel's sessions folder if it exists
    const sessionsFolder = normalizePath(
      `${this.deps.getSubfolder("channels")}/${slugify(channelName)}/sessions`,
    );
    const folder = this.vault.getAbstractFileByPath(sessionsFolder);
    if (folder instanceof TFolder) {
      await this.app.fileManager.trashFile(folder);
    }
  }

  async updateHeartbeat(agentName: string, updates: HeartbeatUpdates): Promise<void> {
    const agent = this.store.getAgentByName(agentName);
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

    // Reload the owning folder agent so its heartbeat fields are fresh
    // in-memory (reference-neutral, but keeps the snapshot consistent).
    await this.store.loadFile(heartbeatPath);
  }

  async deleteAgent(agentName: string, deleteTasks: boolean): Promise<{ trashedFiles: string[] }> {
    const trashedFiles: string[] = [];
    const agent = this.store.getAgentByName(agentName);
    if (!agent) return { trashedFiles };

    if (agent.isFolder) {
      // Trash the entire agent folder
      const folderPath = normalizePath(agent.filePath.replace(/\/agent\.md$/, ""));
      const folder = this.vault.getAbstractFileByPath(folderPath);
      if (folder instanceof TFolder) {
        const files: TFile[] = [];
        collectMarkdownChildren(folder, files);
        // Trash all files inside the folder first, then the folder
        for (const f of files) {
          trashedFiles.push(f.path);
        }
        await this.app.fileManager.trashFile(folder);
      }
      // Issues keyed on member files (permissions.json, …) go with the folder.
      this.store.clearIssuesUnder(folderPath);
    } else {
      // Trash the single agent definition file
      await trashPath(this.app, agent.filePath);
      trashedFiles.push(agent.filePath);
      // Drop any issue keyed on the flat agent's permissions sidecar.
      this.store.clearIssuesFor(sidecarPermissionsPath(agent.filePath));
    }
    this.store.clearStoredFile(agent.filePath);

    // Trash the agent's memory: legacy flat file + v2 memory folder.
    const memoryPath = this.deps.getMemoryPath(agentName);
    if (this.vault.getAbstractFileByPath(memoryPath)) {
      await trashPath(this.app, memoryPath);
      trashedFiles.push(memoryPath);
    }
    const memoryDir = this.deps.getMemoryDir(agentName);
    const memoryFolder = this.vault.getAbstractFileByPath(memoryDir);
    if (memoryFolder instanceof TFolder) {
      await this.app.fileManager.trashFile(memoryFolder);
      trashedFiles.push(memoryDir);
    }

    // Optionally trash associated tasks
    if (deleteTasks) {
      const tasks = this.store.getTasksForAgent(agentName);
      for (const task of tasks) {
        await trashPath(this.app, task.filePath);
        trashedFiles.push(task.filePath);
        this.store.clearStoredFile(task.filePath);
      }
    }

    // Revalidate once after all map mutations: tasks/channels referencing the
    // deleted agent get flagged immediately, without a full reload.
    this.store.validateReferences();

    return { trashedFiles };
  }
}
