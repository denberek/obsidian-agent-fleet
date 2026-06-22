import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  normalizePath,
} from "obsidian";
import { DEFAULT_SETTINGS, VIEW_TYPE_AGENTS, VIEW_TYPE_CHAT, VIEW_TYPE_DASHBOARD } from "./constants";
import { FleetRepository } from "./fleetRepository";
import { ConfirmDeleteModal } from "./modals/confirmDeleteModal";
import { AgentFleetSettingTab } from "./settingsTab";
import { FleetRuntime } from "./services/fleetRuntime";
import { McpAuthManager } from "./services/mcpAuth";
import { ChannelManager } from "./services/channelManager";
import { ChannelCredentialStore } from "./services/channelCredentialStore";
import { SecretStore } from "./services/secretStore";
import { parseClaudeMcpServers, parseCodexMcpServers, mergeImports } from "./services/mcpImport";
import { SlackAdapter } from "./services/channels/slackAdapter";
import { TelegramAdapter } from "./services/channels/telegramAdapter";
import { DiscordAdapter } from "./services/channels/discordAdapter";
import type { ChannelAdapter } from "./services/channels/adapter";
import type { ChannelConfig, ChannelCredentialEntry, FleetSettings } from "./types";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter } from "./utils/markdown";
import { spawnCli, resolveClaudeCliCandidates, resolveCodexCliCandidates, isAbsolutePath } from "./utils/platform";
import { normalizeAdapter } from "./adapters";
import { cleanupCodexOverlays, resetCodexPermissionCaches } from "./adapters/codexPermissions";
import { SidebarView } from "./views/sidebarView";
import { FleetDashboardView } from "./views/dashboardView";
import { AgentChatView } from "./views/agentChatView";


export default class AgentFleetPlugin extends Plugin {
  settings: FleetSettings = { ...DEFAULT_SETTINGS };
  repository!: FleetRepository;
  runtime!: FleetRuntime;

  get mcpManager() { return this.runtime.mcpManager; }
  mcpAuth = new McpAuthManager();

  /**
   * Channel credential store (persisted in FleetSettings.channelCredentials) and the
   * long-lived ChannelManager that owns all active transport adapters + ChatSessions.
   * Unlike `runtime`, the channel manager is stable across saveSettings() calls — we
   * reconcile it in place rather than rebuilding, so unrelated settings edits don't
   * tear down live Slack sockets.
   */
  channelCredentials = new ChannelCredentialStore();
  channelManager!: ChannelManager;
  secretStore!: SecretStore;

  private statusBarEl?: HTMLElement;
  private subscribedViews = new Set<{ render: () => Promise<void> }>();
  private vaultChangeTimer?: number;
  private suppressVaultEvents = false;
  private suppressTimer?: number;
  private runtimeUnsubscribe?: () => void;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.settings.claudeCliPath = await this.resolveClaudeCliPath(this.settings.claudeCliPath);
    this.repository = new FleetRepository(this.app, this.settings);
    this.repository.setChannelCredentialGetter(() => this.channelCredentials.toRecord());
    this.runtime = new FleetRuntime(this.repository, this.settings, this.mcpAuth);

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new FleetDashboardView(leaf, this));
    this.registerView(VIEW_TYPE_AGENTS, (leaf) => new SidebarView(leaf, this));
    this.registerView(VIEW_TYPE_CHAT, (leaf) => new AgentChatView(leaf, this));

    this.addSettingTab(new AgentFleetSettingTab(this));

    const isFirstRun = await this.repository.ensureFleetStructure();
    if (isFirstRun) {
      await this.repository.ensureSamples();
    }

    // Update default files (fleet-orchestrator, agent-fleet-system skill, etc.)
    // on every load — not just first run. Only overwrites files the user hasn't
    // customized (hash-based freshness check).
    const updatedHashes = await this.repository.updateDefaults(this.settings.defaultFileHashes ?? {});
    if (JSON.stringify(updatedHashes) !== JSON.stringify(this.settings.defaultFileHashes ?? {})) {
      this.settings.defaultFileHashes = updatedHashes;
      await this.saveData(this.settings);
    }

    // One-time repair of historical usage-ledger cost rows (cumulative cost was
    // recorded as per-turn cost before the per-turn-delta fix). Guarded by a
    // marker file; no-op after the first run and fail-soft.
    const costMigration = await this.repository.migrateUsageLedgerCosts();
    if (costMigration && costMigration.changed > 0) {
      console.log(
        `Agent Fleet: repaired ${costMigration.changed} usage-ledger cost rows across ${costMigration.files} day(s).`,
      );
    }

    await this.runtime.initialize();
    await this.verifyClaudeCli(false);
    // Codex path resolution is conditional — only agents with `adapter: codex`
    // need it, and probing a missing binary on every load would slow startup
    // for everyone else.
    await this.maybeResolveCodexCliPath();

    this.addRibbonIcon("bot", "Agent Fleet Dashboard", () => void this.activateDashboardView());
    this.addRibbonIcon("message-circle", "Agent Chat", () => {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
      if (existing.length > 0) {
        void this.app.workspace.revealLeaf(existing[0]!);
      } else {
        void this.openChatView();
      }
    });
    this.addCommands();
    this.registerVaultHandlers();
    this.registerRuntimeListeners();

    // Initialize secure secret store (OS keychain-backed via Obsidian's SecretStorage).
    // Falls back to plaintext in data.json if SecretStorage is unavailable (Obsidian < 1.11.4).
    const secretStorage = (this.app as unknown as { secretStorage?: import("obsidian").SecretStorage }).secretStorage;
    this.secretStore = new SecretStore(secretStorage);

    // Wire SecretStore into channel credential store + MCP auth manager so
    // OAuth/static MCP tokens persist in the OS keychain (never in the vault).
    this.channelCredentials.setSecretStore(this.secretStore);
    this.mcpAuth.setSecretStore(this.secretStore);

    // Migrate secrets from plaintext data.json → SecretStorage on first load
    if (!this.settings.secretsMigrated && this.secretStore.available) {
      this.channelCredentials.loadCredentials(this.settings.channelCredentials ?? {});
      // Carry any legacy plaintext MCP API keys (keyed by server name) into the
      // keychain-backed auth manager before clearing them.
      for (const [name, token] of Object.entries(this.settings.mcpApiKeys ?? {})) {
        if (typeof token === "string" && token.trim()) {
          this.mcpAuth.storeStaticToken(name, token);
        }
      }
      // Clear plaintext from settings
      this.settings.mcpTokens = {};
      this.settings.mcpApiKeys = {};
      this.settings.channelCredentials = {};
      this.settings.secretsMigrated = true;
      await this.saveData(this.settings);
    } else {
      // Normal load — read from SecretStore (or plaintext fallback if unavailable)
      this.channelCredentials.loadCredentials(
        this.secretStore.available ? undefined : (this.settings.channelCredentials ?? {}),
      );
    }

    // Legacy callback — if SecretStore is unavailable, persist to data.json as before
    if (!this.secretStore.available) {
      this.channelCredentials.onChanged((credentials) => {
        this.settings.channelCredentials = credentials;
        void this.saveSettings();
      });
    }

    // Construct the long-lived channel manager and start it. Any channel that
    // fails to connect logs an error and keeps the rest of the plugin running —
    // channel failures MUST NOT block plugin load.
    this.channelManager = new ChannelManager({
      getRepository: () => this.repository,
      vault: this.app.vault,
      getSettings: () => this.settings,
      getChannelCredentials: () => this.channelCredentials.toRecord(),
      getMcpAuth: () => this.mcpAuth,
      recordUsage: (record) => this.runtime.recordUsage(record),
      adapterFactory: (config: ChannelConfig, credential: ChannelCredentialEntry): ChannelAdapter => {
        if (config.type === "slack") {
          return new SlackAdapter(config, credential);
        }
        if (config.type === "telegram") {
          return new TelegramAdapter(config, credential);
        }
        if (config.type === "discord") {
          return new DiscordAdapter(config, credential);
        }
        throw new Error(`Channel type \`${config.type}\` is not yet supported in this version.`);
      },
    });
    try {
      await this.channelManager.start(this.runtime.getSnapshot());
    } catch (err) {
      console.error("Agent Fleet: channel manager failed to start", err);
      new Notice("Agent Fleet: channel manager failed to start — check console.");
    }

    // Wire run results to channels. Fires when an agent's heartbeat completes
    // (using heartbeatChannel) or when a scheduled/manual task sets a `channel`
    // field. `source` is "heartbeat" or the task id, used only to label the post.
    // When `target` is set the post goes to that specific channel id; otherwise it
    // broadcasts (opens a DM with the first allowed user and posts there).
    this.runtime.onChannelResult((agentName, channelName, output, source, target) => {
      const label = source === "heartbeat" ? `Heartbeat — ${agentName}` : `${agentName} — ${source}`;
      const text = `*${label}*\n\n${output}`;
      const delivery = target
        ? this.channelManager?.postToChannelTarget(channelName, target, text)
        : this.channelManager?.broadcastToChannel(channelName, text);
      void delivery?.catch((err: unknown) => {
        console.warn(`Agent Fleet: channel post failed for ${agentName}`, err);
      });
    });

    this.refreshStatusBar();

    // The MCP registry (`_fleet/mcp/*.md`) is loaded by the repository — no
    // eager `claude mcp list` discovery. Run the one-time import of native
    // Claude/Codex servers into the registry on first load.
    void this.importNativeMcpServers();

    // Periodically refresh expiring OAuth tokens (every 30 min) so the next run
    // projects a fresh bearer. Refreshed tokens persist to SecretStore.
    this.registerInterval(
      window.setInterval(() => void this.mcpManager.refreshProbeTokens(), 30 * 60_000),
    );

    new Notice("Agent Fleet loaded.");
  }

  /**
   * One-time import of natively-configured MCP servers into the fleet registry
   * (`_fleet/mcp/*.md`). Reads ~/.claude.json and ~/.codex/config.toml, writes
   * one registry file per discovered server (Claude wins name collisions),
   * and moves any bearer tokens into the keychain. Idempotent — guarded by the
   * `mcpImported` flag and skipped entirely once the registry is non-empty.
   */
  private async importNativeMcpServers(): Promise<void> {
    if (this.settings.mcpImported) return;
    // Never clobber a registry the user already has.
    if (this.repository.getMcpServers().length > 0) {
      this.settings.mcpImported = true;
      await this.saveData(this.settings);
      return;
    }

    const readIf = (p: string): string | null => {
      try {
        return existsSync(p) ? readFileSync(p, "utf-8") : null;
      } catch {
        return null;
      }
    };
    const claudeJson = readIf(join(homedir(), ".claude.json"));
    const codexToml = readIf(join(homedir(), ".codex", "config.toml"));

    try {
      const merged = mergeImports(
        claudeJson ? parseClaudeMcpServers(claudeJson) : { servers: [], tokens: {} },
        codexToml ? parseCodexMcpServers(codexToml) : { servers: [], tokens: {} },
      );

      let imported = 0;
      for (const server of merged.servers) {
        try {
          await this.repository.saveMcpServer(server, server.description ?? "");
          const token = merged.tokens[server.name];
          if (token) this.mcpAuth.storeStaticToken(server.name, token);
          imported++;
        } catch (err) {
          console.warn(`Agent Fleet: failed to import MCP server "${server.name}":`, err);
        }
      }

      this.settings.mcpImported = true;
      await this.saveData(this.settings);
      if (imported > 0) {
        await this.refreshFromVault();
        new Notice(`Agent Fleet: imported ${imported} MCP server${imported === 1 ? "" : "s"}.`);
      }
    } catch (err) {
      console.error("Agent Fleet: MCP import failed", err);
    }
  }

  onunload(): void {
    this.runtimeUnsubscribe?.();
    this.runtimeUnsubscribe = undefined;
    if (this.vaultChangeTimer) {
      window.clearTimeout(this.vaultChangeTimer);
      this.vaultChangeTimer = undefined;
    }
    if (this.suppressTimer) {
      window.clearTimeout(this.suppressTimer);
      this.suppressTimer = undefined;
    }
    // Note: per Obsidian's plugin guidelines we do NOT detach our leaves here —
    // Obsidian reinitializes plugin views at their original positions on update,
    // and detaching in onunload interferes with that.
    // Stop heartbeat + task crons so they don't fire after disable. The JS
    // context usually dies on plugin unload too, but explicit teardown also
    // covers "Disable plugin" without a full reload.
    this.runtime?.shutdown();
    // Fire-and-forget: Obsidian onunload is effectively synchronous. Adapters
    // close their sockets on their own internal timeouts.
    void this.channelManager?.stop();
    // Remove the per-agent CODEX_HOME overlays we created for execpolicy rules.
    cleanupCodexOverlays();
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as Partial<FleetSettings>),
    };
  }

  async saveSettings(): Promise<void> {
    this.settings.claudeCliPath = await this.resolveClaudeCliPath(this.settings.claudeCliPath);
    await this.maybeResolveCodexCliPath();
    // The codex path may have changed — drop cached execpolicy support/validation
    // so the next run re-probes against the new binary.
    resetCodexPermissionCaches();
    await this.saveData(this.settings);
    if (this.repository && this.runtime) {
      // Tear down the outgoing runtime before replacing the reference. Without
      // this, croner timers in the old runtime keep firing forever — every
      // saveSettings() call would otherwise leak a runtime whose heartbeat /
      // task crons run alongside the new one's, producing duplicate runs and
      // making schedule edits appear not to take effect until full reload.
      this.runtime.shutdown();
      this.repository = new FleetRepository(this.app, this.settings);
      this.repository.setChannelCredentialGetter(() => this.channelCredentials.toRecord());
      this.runtime = new FleetRuntime(this.repository, this.settings, this.mcpAuth);
      await this.repository.ensureFleetStructure();
      await this.runtime.initialize();
      this.registerRuntimeListeners();
      this.notifyViews();
      this.refreshStatusBar();
      // Reload credentials and reconcile channels in place. The channel manager is
      // NOT rebuilt — only the delta (credentials, channel files) is applied so live
      // Slack sockets survive unrelated edits.
      this.channelCredentials.loadCredentials(
        this.secretStore.available ? undefined : (this.settings.channelCredentials ?? {}),
      );
      void this.channelManager?.reconcile(this.runtime.getSnapshot());
    }
  }

  subscribeView(view: { render: () => Promise<void> }): void {
    this.subscribedViews.add(view);
  }

  unsubscribeView(view: { render: () => Promise<void> }): void {
    this.subscribedViews.delete(view);
  }

  async activateDashboardView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0]!);
      return;
    }
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
  }

  async navigateDashboard(page: string, context?: string): Promise<void> {
    await this.activateDashboardView();
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
    const dashboardLeaf = leaves[0];
    if (dashboardLeaf) {
      const view = dashboardLeaf.view;
      if (view instanceof FleetDashboardView) {
        view.navigateTo(page as Parameters<FleetDashboardView["navigateTo"]>[0], context);
      }
    }
  }

  async activateAgentsView(): Promise<void> {
    const leaf = this.getLeafForView(VIEW_TYPE_AGENTS, "left");
    await leaf.setViewState({ type: VIEW_TYPE_AGENTS, active: true });
    void this.app.workspace.revealLeaf(leaf);
  }

  async openChatView(agentName?: string): Promise<void> {
    // If a specific agent is requested, check if a tab already has it open
    if (agentName) {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
      for (const leaf of existing) {
        if (leaf.view instanceof AgentChatView && leaf.view.selectedAgentName === agentName) {
          void this.app.workspace.revealLeaf(leaf);
          return;
        }
      }
    }
    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true, state: agentName ? { agentName } : {} });
    void this.app.workspace.revealLeaf(leaf);
    if (agentName && leaf.view instanceof AgentChatView) {
      leaf.view.selectAgent(agentName);
    }
  }

  async refreshFromVault(): Promise<void> {
    this.suppressVaultEvents = true;
    try {
      await this.runtime.refreshFromVault();
      this.notifyViews();
      this.refreshStatusBar();
      // Reconcile channels against the fresh snapshot — editing a _fleet/channels/*.md
      // file live should bring up / tear down / update adapters without a full restart.
      void this.channelManager?.reconcile(this.runtime.getSnapshot());
    } finally {
      // Delay re-enabling to let vault events from our own writes settle
      if (this.suppressTimer) window.clearTimeout(this.suppressTimer);
      this.suppressTimer = window.setTimeout(() => {
        this.suppressTimer = undefined;
        this.suppressVaultEvents = false;
      }, 500);
    }
  }

  refreshStatusBar(): void {
    if (!this.settings.showStatusBar) {
      this.statusBarEl?.detach();
      this.statusBarEl = undefined;
      return;
    }
    if (!this.statusBarEl) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.onclick = () => void this.activateDashboardView();
    }
    const status = this.runtime.getFleetStatus();
    this.statusBarEl.setText(`🤖 ${status.running} running · ${status.pending} pending · ${status.completedToday} completed today`);
  }

  async verifyClaudeCli(showNotice = true): Promise<boolean> {
    const cliPath = await this.resolveClaudeCliPath(this.settings.claudeCliPath);
    this.settings.claudeCliPath = cliPath;
    return await this.verifyCliBinary(cliPath, "Claude", showNotice);
  }

  async verifyCodexCli(showNotice = true): Promise<boolean> {
    const cliPath = await this.resolveCliPathFrom(
      resolveCodexCliCandidates(this.settings.codexCliPath),
      this.settings.codexCliPath,
    );
    this.settings.codexCliPath = cliPath;
    return await this.verifyCliBinary(cliPath, "Codex", showNotice);
  }

  private async verifyCliBinary(cliPath: string, label: string, showNotice: boolean): Promise<boolean> {
    return await new Promise((resolve) => {
      // On macOS/Linux: spawns through login shell so env vars are available.
      // On Windows: spawns directly (env is inherited from the system).
      const proc = spawnCli(cliPath, ["--version"]);
      let stderr = "";
      proc.stderr!.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      proc.on("close", (code) => {
        const ok = code === 0;
        if (!ok) {
          console.error(`Agent Fleet: ${label} CLI verification failed`, stderr);
        }
        if (showNotice) {
          new Notice(ok ? `${label} CLI available.` : `${label} CLI verification failed — check ${label} CLI Path in settings.`);
        }
        resolve(ok);
      });
      proc.on("error", (error) => {
        console.error(`Agent Fleet: ${label} CLI verification error`, error);
        if (showNotice) {
          new Notice(`${label} CLI verification failed — check ${label} CLI Path in settings.`);
        }
        resolve(false);
      });
    });
  }

  async openPath(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf(true).openFile(file);
    }
  }

  async createAgentTemplate(): Promise<void> {
    await this.navigateDashboard("create-agent");
  }

  async createSkillTemplate(): Promise<void> {
    await this.navigateDashboard("create-skill");
  }

  async openCreateTask(): Promise<void> {
    await this.navigateDashboard("create-task");
  }

  async runAgentPrompt(agentName: string): Promise<void> {
    const agent = this.repository.getAgentByName(agentName);
    if (!agent) {
      new Notice(`Unknown agent: ${agentName}`);
      return;
    }
    await this.runtime.runAgentNow(agent, "Run now and summarize the current state.");
  }

  async chatWithAgent(agentName: string): Promise<void> {
    const agent = this.repository.getAgentByName(agentName);
    if (!agent) {
      new Notice(`Unknown agent: ${agentName}`);
      return;
    }
    await this.openChatView(agentName);
  }

  async deleteAgent(agentName: string): Promise<void> {
    const agent = this.repository.getAgentByName(agentName);
    if (!agent) {
      new Notice(`Unknown agent: ${agentName}`);
      return;
    }

    const tasks = this.repository.getTasksForAgent(agentName);
    const runs = this.runtime.getRecentRuns().filter((r) => r.agent === agentName);
    const memoryPath = this.repository.getMemoryPath(agentName);
    const hasMemory = !!this.app.vault.getAbstractFileByPath(memoryPath);

    new ConfirmDeleteModal(
      this.app,
      {
        agentName,
        taskCount: tasks.length,
        runCount: runs.length,
        hasMemory,
      },
      async (deleteTasks: boolean) => {
        const result = await this.repository.deleteAgent(agentName, deleteTasks);
        await new Promise((r) => window.setTimeout(r, 200));
        await this.refreshFromVault();
        new Notice(`Deleted agent "${agentName}" (${result.trashedFiles.length} files moved to trash)`);

        // Navigate back to agents list
        await this.navigateDashboard("agents");
      },
    ).open();
  }

  async toggleAgent(agentName: string, enabled: boolean): Promise<void> {
    const agent = this.repository.getAgentByName(agentName);
    if (!agent) {
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(agent.filePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await this.app.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    frontmatter.enabled = enabled;
    await this.app.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, body));
    await this.refreshFromVault();
  }

  private addCommands(): void {
    this.addCommand({
      id: "open-dashboard",
      name: "Open dashboard",
      callback: () => void this.activateDashboardView(),
    });
    this.addCommand({
      id: "open-agents-panel",
      name: "Open agents panel",
      callback: () => void this.activateAgentsView(),
    });
    this.addCommand({
      id: "open-chat",
      name: "Open agent chat",
      callback: () => {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
        if (existing.length > 0) {
          void this.app.workspace.revealLeaf(existing[0]!);
        } else {
          void this.openChatView();
        }
      },
    });
    this.addCommand({
      id: "new-chat-tab",
      name: "New chat tab",
      callback: () => void this.openChatView(),
    });
    this.addCommand({
      id: "new-agent",
      name: "New agent",
      callback: () => void this.createAgentTemplate(),
    });
    this.addCommand({
      id: "new-skill",
      name: "New skill",
      callback: () => void this.createSkillTemplate(),
    });
    this.addCommand({
      id: "new-task",
      name: "New task",
      callback: () => void this.openCreateTask(),
    });
    this.addCommand({
      id: "run-agent-now",
      name: "Run agent now",
      callback: () => {
        const agent = this.runtime.getSnapshot().agents[0];
        if (agent) {
          void this.runAgentPrompt(agent.name);
        } else {
          new Notice("No agents configured.");
        }
      },
    });
    this.addCommand({
      id: "pause-all",
      name: "Pause all",
      callback: () => {
        this.runtime.scheduler.pauseAll();
        new Notice("Agent Fleet paused.");
      },
    });
    this.addCommand({
      id: "resume-all",
      name: "Resume all",
      callback: () => {
        this.runtime.scheduler.resumeAll();
        new Notice("Agent Fleet resumed.");
      },
    });
    this.addCommand({
      id: "view-fleet-status",
      name: "View status",
      callback: () => {
        const status = this.runtime.getFleetStatus();
        new Notice(`${status.running} running · ${status.pending} pending · ${status.completedToday} completed today`);
      },
    });
  }

  private debouncedVaultRefresh(): void {
    if (this.suppressVaultEvents) return;
    if (this.vaultChangeTimer) window.clearTimeout(this.vaultChangeTimer);
    this.vaultChangeTimer = window.setTimeout(() => {
      if (!this.suppressVaultEvents) {
        void this.refreshFromVault();
      }
    }, 500);
  }

  private registerVaultHandlers(): void {
    // The usage ledger (`_fleet/usage/`) is appended on every chat/channel turn
    // and holds no parsed entities — skip it so the hot path never triggers a
    // full fleet reparse.
    const isLedgerPath = (p: string) => p.startsWith(`${this.settings.fleetFolder}/usage/`);
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.path.startsWith(`${this.settings.fleetFolder}/`) && !isLedgerPath(file.path)) {
          this.debouncedVaultRefresh();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.path.startsWith(`${this.settings.fleetFolder}/`) && !isLedgerPath(file.path)) {
          this.debouncedVaultRefresh();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        if (file.path.startsWith(`${this.settings.fleetFolder}/`)) {
          this.debouncedVaultRefresh();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file.path.startsWith(`${this.settings.fleetFolder}/`)) {
          this.debouncedVaultRefresh();
        }
      }),
    );
  }

  private registerRuntimeListeners(): void {
    // Unsubscribe from previous runtime instance (e.g. after saveSettings() rebuilds it)
    this.runtimeUnsubscribe?.();
    this.runtimeUnsubscribe = this.runtime.subscribe(() => {
      this.notifyViews();
      this.refreshStatusBar();
    });
  }

  private notifyViews(): void {
    for (const view of this.subscribedViews) {
      void view.render();
    }
  }

  private async resolveClaudeCliPath(configuredPath: string): Promise<string> {
    return this.resolveCliPathFrom(resolveClaudeCliCandidates(configuredPath), configuredPath);
  }

  /** Resolve the Codex CLI path, but only when some agent actually uses the
   *  codex adapter — probing a missing binary adds startup/save latency for
   *  everyone else. `verifyCodexCli` resolves unconditionally. */
  private async maybeResolveCodexCliPath(): Promise<void> {
    const hasCodexAgent = this.runtime
      ?.getSnapshot()
      .agents.some((a) => normalizeAdapter(a.adapter) === "codex");
    if (!hasCodexAgent) return;
    this.settings.codexCliPath = await this.resolveCliPathFrom(
      resolveCodexCliCandidates(this.settings.codexCliPath),
      this.settings.codexCliPath,
    );
  }

  private async resolveCliPathFrom(candidates: string[], fallback: string): Promise<string> {
    for (const candidate of candidates) {
      if (isAbsolutePath(candidate) && existsSync(candidate)) {
        return candidate;
      }
      if (!isAbsolutePath(candidate)) {
        const ok = await new Promise<boolean>((resolve) => {
          const proc = spawnCli(candidate, ["--version"]);
          proc.on("close", (code) => resolve(code === 0));
          proc.on("error", () => resolve(false));
        });
        if (ok) {
          return candidate;
        }
      }
    }

    return fallback;
  }

  private getLeafForView(type: string, side: "left" | "right"): WorkspaceLeaf {
    const existing = this.app.workspace.getLeavesOfType(type)[0];
    if (existing) {
      return existing;
    }
    if (side === "right") {
      return this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
    }
    return this.app.workspace.getLeftLeaf(false) ?? this.app.workspace.getLeaf(false);
  }
}
