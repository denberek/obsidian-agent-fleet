import { existsSync, readFileSync } from "fs";
import { readdir, readFile, rm, stat } from "fs/promises";
import { homedir, tmpdir } from "os";
import { join } from "path";
import {
  MarkdownView,
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
import type {
  ChannelConfig,
  ChannelCredentialEntry,
  ConversationMeta,
  FleetSettings,
  RevisionDestination,
} from "./types";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter } from "./utils/markdown";
import { spawnCli, resolveClaudeCliCandidates, resolveCodexCliCandidates, resolvePiCliCandidates, isAbsolutePath } from "./utils/platform";
import { normalizeAdapter } from "./adapters";
import {
  CLI_NPM_PACKAGES,
  cliVersionWarning,
  MIN_CLAUDE_CLI_VERSION,
  MIN_CODEX_CLI_VERSION,
  MIN_PI_CLI_VERSION,
  parseCliVersion,
} from "./utils/cliVersion";
import { cleanupCodexOverlays, resetCodexPermissionCaches } from "./adapters/codexPermissions";
import { PI_OVERLAY_PID_FILE, piOverlayRoot } from "./services/mcpProjection";
import { SidebarView } from "./views/sidebarView";
import { FleetDashboardView } from "./views/dashboardView";
import { AgentChatView } from "./views/agentChatView";
import { InAppConversationManager } from "./services/inAppConversationManager";
import { RevisionManager } from "./services/revisionManager";
import type { RevisionEvent } from "./services/revisionManager";
import type { RevisionStore, RevisionStoreEvent } from "./repository/revisionStore";
import {
  REVISION_HEADER_ICON,
  RevisionModeHost,
  type RevisionUiEvent,
} from "./components/revisionModeController";
import { showRevisionCompletionNotice } from "./components/revisionCompletionNotice";
import {
  classifyFleetPath,
  findChatLeafForTarget,
  toRevisionUiEvent,
} from "./utils/revisionRouting";


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

  /**
   * The single owner of in-app `ChatSession` instances — one per exact
   * `agent::conversation` pair. Both `AgentChatView` and Revision mode acquire
   * from here; a second manager would race the provider session id, the
   * conversation file, and `ChatSession`'s single turn slot
   * (REVISION_MODE_DESIGN.md §11.1). Like `channelManager` it is constructed
   * once and refreshed in place — never rebuilt in `saveSettings()`.
   */
  inAppConversations!: InAppConversationManager;
  /** Revision draft lifecycle + submission state machine. */
  revisionManager!: RevisionManager;
  /** Per-`MarkdownView` revision chrome. One host for the whole workspace. */
  revisionHost!: RevisionModeHost;

  /**
   * Live handle on the revision sidecar store. `saveSettings()` rebuilds the
   * repository (and with it a fresh RevisionStore), so this is swapped only
   * once the replacement's cache is loaded — see {@link adoptRevisionStore}.
   */
  private revisionStoreRef!: RevisionStore;
  private revisionStoreUnsub?: () => void;
  /** Fan-out to the revision host/controllers. Plugin-level so a store swap
   *  never invalidates a controller's subscription. */
  private revisionUiListeners = new Set<(event: RevisionUiEvent) => void>();
  /** Header-action elements we added to markdown views, so unload can remove
   *  exactly ours (§25.5). */
  private revisionActions = new Map<MarkdownView, HTMLElement>();
  /** In-flight `RevisionManager.submit()` calls. A store swap waits for these:
   *  `loadAll()` recovers any `submitting` draft into attention, which would
   *  mislabel a revision that is actually still running. */
  private revisionSubmissions = 0;
  private revisionStoreAdoptionPending = false;

  /** Successful CLI verifications, keyed by `${label}:${cliPath}` → timestamp.
   *  Skips re-spawning `--version` for the same binary within the TTL. */
  private cliVerifiedAt = new Map<string, number>();
  private static readonly CLI_VERIFY_TTL_MS = 5 * 60_000;

  private statusBarEl?: HTMLElement;
  private subscribedViews = new Set<{ render: () => Promise<void> }>();
  private vaultChangeTimer?: number;
  private suppressVaultEvents = false;
  private suppressTimer?: number;
  private runtimeUnsubscribe?: () => void;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.settings.claudeCliPath = await this.resolveClaudeCliPath(this.settings.claudeCliPath);
    // Detect feature support before runtime initialization can execute startup
    // catch-up tasks. Known-old CLIs must never receive a silently unsupported
    // spend cap or output contract.
    await this.verifyClaudeCli(true, false);
    this.repository = new FleetRepository(this.app, this.settings);
    this.repository.setChannelCredentialGetter(() => this.channelCredentials.toRecord());
    this.runtime = new FleetRuntime(this.repository, this.settings, this.mcpAuth);

    // Before any view can open: AgentChatView reads `plugin.inAppConversations`
    // on its first render and there must never be a second owner. Every
    // dependency is a live getter because `saveSettings()` replaces both the
    // repository and the runtime underneath this object (§14.7).
    this.inAppConversations = new InAppConversationManager({
      getRepository: () => this.repository,
      getSettings: () => this.settings,
      vault: this.app.vault,
      getMcpAuth: () => this.mcpAuth,
      recordUsage: (record) => this.runtime.recordUsage(record),
    });

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

    // Load once before scheduler startup so Codex can be detected before any
    // catch-up task runs. FleetRuntime.initialize() reloads after migrations;
    // the second pass is intentional and keeps its normal initialization API.
    await this.repository.loadAll();
    // Codex/Pi path/version resolution is conditional — only agents that use
    // the adapter pay the probe cost.
    await this.maybeResolveCodexCliPath(true);
    await this.maybeResolvePiCliPath(true);
    await this.runtime.initialize();

    // Revision mode. Drafts load after the fleet structure exists and before
    // any header action can ask for a pending-note badge; a draft interrupted
    // by a crash is recovered into attention here, never auto-resubmitted (§8.5).
    await this.initializeRevisionMode();

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

    // Sweep temp files a force-quit orphaned (their normal cleanup lives in
    // finally blocks that never ran). Fire-and-forget — must not block load.
    void this.cleanupStaleTempFiles().catch((err) => {
      console.warn("Agent Fleet: stale temp-file sweep failed", err);
    });

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

  // ═══════════════════════════════════════════════════════
  //  Revision mode (REVISION_MODE_DESIGN.md §§7.1, 8.6, 10, 18.2)
  // ═══════════════════════════════════════════════════════

  /** Live handle on the revision sidecar store. Never cache this in a closure —
   *  `saveSettings()` can swap the underlying instance. */
  private get revisionStore(): RevisionStore {
    return this.revisionStoreRef;
  }

  /**
   * Construct the revision services and register their single global hooks.
   *
   * Every collaborator handed to `RevisionManager`/`RevisionModeHost` resolves
   * through `this` rather than being captured, so a `saveSettings()` repository
   * or runtime rebuild can never leave an open draft talking to a dead object
   * (§14.7).
   */
  private async initializeRevisionMode(): Promise<void> {
    this.revisionStoreRef = this.repository.revisionStore;
    try {
      await this.repository.loadRevisionDrafts();
    } catch (err) {
      // A malformed or unreadable sidecar must never block plugin load (§8.4).
      console.error("Agent Fleet: loading revision drafts failed", err);
    }
    this.subscribeRevisionStore();

    this.revisionManager = new RevisionManager({
      store: {
        getById: (id) => this.revisionStore.getById(id),
        getBySourcePath: (path) => this.revisionStore.getBySourcePath(path),
        save: (draft) => this.revisionStore.save(draft),
        delete: (id) => this.revisionStore.delete(id),
        renameSource: (oldPath, newPath) => this.revisionStore.renameSource(oldPath, newPath),
      },
      source: {
        exists: (path) => this.vaultFile(path) !== null,
        read: async (path) => {
          const file = this.vaultFile(path);
          if (!file) throw new Error(`${path} is not a file in this vault.`);
          // vault.read(), never cachedRead(): the cache can still hold the bytes
          // the agent just replaced, which would read as "nothing changed" and
          // turn every successful revision into a no-change failure (§13.3).
          return this.app.vault.read(file);
        },
      },
      conversations: this.inAppConversations,
      directory: {
        getAgent: (agentName) => this.repository.getAgentByName(agentName) ?? null,
        hasConversation: async (agentName, conversationId) => {
          const agent = this.repository.getAgentByName(agentName);
          if (!agent) return false;
          const conversations = await this.repository.listConversations(agent);
          return conversations.some((c) => c.id === conversationId);
        },
      },
      // Flush the open editor before hashing, so the revision is built from the
      // bytes the user can see rather than from the last autosave (§6.7).
      getEditorFlush: (sourcePath) => {
        const view = this.markdownViewForPath(sourcePath);
        return view ? () => view.save() : null;
      },
      // Computed here for the CLI request only — never persisted (§15).
      getVaultBasePath: () => this.repository.getVaultBasePath(),
      onEvent: (event) => this.onRevisionManagerEvent(event),
    });

    this.revisionHost = new RevisionModeHost({
      app: this.app,
      getDraftForPath: (path) => this.revisionStore.getBySourcePath(path),
      createDraft: (path) => this.revisionStore.create(path),
      saveDraft: (draft) => this.revisionStore.save(draft),
      discardDraft: (id) => this.revisionStore.delete(id),
      listAgents: () => this.runtime.getSnapshot().agents,
      listConversations: (agentName) => this.listAgentConversations(agentName),
      createConversation: (agentName, name) => this.createAgentConversation(agentName, name),
      submitDraft: (id) => this.submitRevision(id),
      subscribe: (listener) => {
        this.revisionUiListeners.add(listener);
        return () => {
          this.revisionUiListeners.delete(listener);
        };
      },
      openConversation: (destination) =>
        this.openChatView(destination.agentName, destination.conversationId),
      suggestDestination: () => this.suggestRevisionDestination(),
    });

    // ONE editor extension for the whole plugin. Obsidian removes it and
    // refreshes every editor on unload (§25.2) — nothing to undo by hand.
    this.registerEditorExtension(this.revisionHost.editorExtension);
    this.registerRevisionWorkspaceEvents();
  }

  /** Command, context menu, and the header-action rescans (§10.5). */
  private registerRevisionWorkspaceEvents(): void {
    this.addCommand({
      id: "toggle-revision-mode",
      name: "Toggle revision mode",
      // Editor-aware: the command is offered only for a markdown view with a
      // real file behind it, in Reading view as well as source (entering from
      // Reading switches the leaf first — see toggleRevisionMode).
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return false;
        if (!checking) void this.toggleRevisionMode(view);
        return true;
      },
    });

    // ONE global `editor-menu` handler, delegated to whichever controller owns
    // this editor. Controllers never register workspace events themselves.
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        if (!this.revisionHost?.canAddNote(info, editor)) return;
        menu.addItem((item) =>
          item
            .setTitle("Add revision note")
            .setIcon(REVISION_HEADER_ICON)
            .onClick(() => this.revisionHost.openNoteComposer(info, editor)),
        );
      }),
    );

    const rescan = (): void => {
      // handleLayoutChange prunes closed panes and exits Revision mode in a leaf
      // that switched files — the draft itself is untouched (§10.5).
      this.revisionHost.handleLayoutChange();
      this.syncRevisionHeaderActions();
    };
    this.app.workspace.onLayoutReady(rescan);
    this.registerEvent(this.app.workspace.on("layout-change", rescan));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => rescan()));
    this.registerEvent(this.app.workspace.on("file-open", () => rescan()));
  }

  /**
   * Add the Revision mode action to every open markdown view and drop the ones
   * whose view or element is gone. `MarkdownView.addAction()` binds to a view
   * instance, so new panes need a rescan and unload needs the element back.
   */
  private syncRevisionHeaderActions(): void {
    for (const [view, el] of this.revisionActions) {
      if (view.containerEl.isConnected && el.isConnected) continue;
      el.remove();
      this.revisionActions.delete(view);
      this.revisionHost.unregisterHeaderAction(view);
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      if (this.revisionActions.has(view)) continue;
      const el = view.addAction(REVISION_HEADER_ICON, "Revision mode", () => {
        void this.toggleRevisionMode(view);
      });
      this.revisionActions.set(view, el);
      this.revisionHost.registerHeaderAction(view, el);
    }
    this.revisionHost.refreshHeaderActions();
  }

  /**
   * Enter or leave Revision mode for one markdown view.
   *
   * Invoked from Reading view, the leaf is switched to `source` through the
   * public view state FIRST. Agent Fleet never registers a third
   * `MarkdownViewModeType` and never patches Obsidian's mode switch (§6.1).
   */
  async toggleRevisionMode(view: MarkdownView): Promise<void> {
    if (!this.revisionHost) return;
    if (this.revisionHost.isActive(view)) {
      this.revisionHost.deactivate(view);
      this.syncRevisionHeaderActions();
      return;
    }
    if (!view.file) {
      new Notice("Revision mode needs a saved markdown document.");
      return;
    }
    let target = view;
    if (target.getMode() !== "source") {
      const state = target.leaf.getViewState();
      await target.leaf.setViewState({
        ...state,
        state: { ...(state.state ?? {}), mode: "source" },
      });
      // Re-resolve: the leaf may hand back a different view instance.
      const current = target.leaf.view;
      if (current instanceof MarkdownView) target = current;
    }
    await this.revisionHost.activate(target);
    this.syncRevisionHeaderActions();
  }

  /**
   * Submit a draft as one exclusive conversation turn.
   *
   * A failed turn persists `attention`, and the resulting draft update is what
   * releases the panel's submitting lock. `blocked` (pre-flight refusal —
   * nothing was sent) and `interrupted` persist no such change, so they are
   * rethrown: the panel's own error path unlocks the controls and surfaces the
   * message. Without this the toolbar would sit on "Waiting for conversation"
   * forever after, say, choosing a read-only agent.
   */
  private async submitRevision(draftId: string): Promise<void> {
    this.revisionSubmissions++;
    try {
      const outcome = await this.revisionManager.submit(draftId);
      if (!outcome.ok && (outcome.reason === "blocked" || outcome.reason === "interrupted")) {
        throw new Error(outcome.message);
      }
    } finally {
      this.revisionSubmissions--;
      if (this.revisionSubmissions === 0 && this.revisionStoreAdoptionPending) {
        this.revisionStoreAdoptionPending = false;
        void this.adoptRevisionStore();
      }
    }
  }

  private async listAgentConversations(agentName: string): Promise<ConversationMeta[]> {
    const agent = this.repository.getAgentByName(agentName);
    if (!agent) throw new Error(`Agent "${agentName}" is no longer available.`);
    return this.repository.listConversations(agent);
  }

  private async createAgentConversation(agentName: string, name: string): Promise<ConversationMeta> {
    const agent = this.repository.getAgentByName(agentName);
    if (!agent) throw new Error(`Agent "${agentName}" is no longer available.`);
    // Same id shape the chat view mints: 8 hex chars is plenty per agent folder.
    const id = Math.random().toString(16).slice(2, 10);
    await this.repository.createConversation(agent, id, name);
    return { id, name, lastActive: new Date().toISOString(), messageCount: 0 };
  }

  /**
   * §6.3 allows preselecting the destination when exactly one visible Agent
   * Chat view has a conversation open. Anything ambiguous returns null —
   * guessing would send a document revision into the wrong conversation.
   */
  private suggestRevisionDestination(): RevisionDestination | null {
    const candidates: RevisionDestination[] = [];
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT)) {
      const view = leaf.view;
      if (!(view instanceof AgentChatView)) continue;
      if (!view.containerEl.isShown()) continue;
      const agentName = view.selectedAgentName;
      const conversationId = view.selectedConversationId;
      if (!agentName || !conversationId) continue;
      candidates.push({ agentName, conversationId });
    }
    return candidates.length === 1 ? candidates[0]! : null;
  }

  private subscribeRevisionStore(): void {
    this.revisionStoreUnsub?.();
    this.revisionStoreUnsub = this.revisionStoreRef.subscribe((event) =>
      this.onRevisionStoreEvent(event),
    );
  }

  /** Sidecar change → the UI event both panes' controllers consume. */
  private onRevisionStoreEvent(event: RevisionStoreEvent): void {
    const uiEvent = toRevisionUiEvent(event);
    if (uiEvent) this.emitRevisionUiEvent(uiEvent);
  }

  private emitRevisionUiEvent(event: RevisionUiEvent): void {
    for (const listener of [...this.revisionUiListeners]) {
      try {
        listener(event);
      } catch (err) {
        console.error("Agent Fleet: revision UI listener failed", err);
      }
    }
  }

  /** Submission state → UI. `state` carries queued/running/verifying, so the
   *  toolbar's Waiting/Revising states are driven by the same snapshot that was
   *  persisted rather than by polling. */
  private onRevisionManagerEvent(event: RevisionEvent): void {
    switch (event.type) {
      case "state":
      case "attention":
        this.emitRevisionUiEvent({ type: "draft-updated", draft: event.draft });
        // A failure can land after the user left Revision mode, so it also
        // needs to be visible outside the panel. Notes are always retained.
        if (event.type === "attention") new Notice(event.message, 12000);
        break;
      case "blocked":
        // Deliberately silent here: `blocked` is only reachable through a UI
        // submission, and submitRevision() rethrows it so the panel reports it
        // once, next to the controls the user has to fix.
        break;
      case "completed":
        void this.showRevisionCompleted(event.sourcePath, event.destination, event.noteCount);
        break;
    }
  }

  private async showRevisionCompleted(
    sourcePath: string,
    destination: RevisionDestination,
    noteCount: number,
  ): Promise<void> {
    let conversationName: string | undefined;
    try {
      const conversations = await this.listAgentConversations(destination.agentName);
      conversationName = conversations.find((c) => c.id === destination.conversationId)?.name;
    } catch {
      // Display detail only — never let a listing failure swallow the notice.
    }
    showRevisionCompletionNotice({
      sourcePath,
      destination,
      ...(conversationName ? { conversationName } : {}),
      noteCount,
      // Exact routing: the pair the user selected, never a sibling conversation.
      openConversation: (target) => this.openChatView(target.agentName, target.conversationId),
    });
  }

  /**
   * Point Revision mode at the rebuilt repository's store after `saveSettings()`.
   *
   * The outgoing store stays fully usable (it holds only the vault and a lazy
   * dir getter), so while a submission is in flight we keep reading from it
   * instead of swapping to an empty cache: an empty cache would let a
   * controller mint a SECOND sidecar for a document that already has a draft,
   * and `loadAll()` would recover the running submission into attention.
   */
  private async adoptRevisionStore(): Promise<void> {
    const next = this.repository.revisionStore;
    if (!this.revisionStoreRef || next === this.revisionStoreRef) return;
    if (this.revisionSubmissions > 0) {
      this.revisionStoreAdoptionPending = true;
      return;
    }
    try {
      await next.loadAll();
    } catch (err) {
      // Keep the working store rather than adopting an empty one.
      console.error("Agent Fleet: reloading revision drafts failed", err);
      return;
    }
    this.revisionStoreRef = next;
    this.subscribeRevisionStore();
    this.revisionHost?.refreshHeaderActions();
  }

  private vaultFile(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? file : null;
  }

  /** The open markdown pane showing a document, if any. */
  private markdownViewForPath(path: string): MarkdownView | null {
    const target = normalizePath(path);
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === target) return view;
    }
    return null;
  }

  onunload(): void {
    // ── Revision mode first (§14.8) ──
    // Obsidian's unload is effectively synchronous, so the flushes below are
    // best-effort. That is safe by design: the sidecar on disk still says
    // "submitting", and RevisionStore.loadAll() recovers it into attention on
    // the next load rather than auto-retrying (§8.5).
    if (this.revisionHost) {
      void this.revisionHost.flushPendingSaves();
      this.revisionHost.destroy();
    }
    for (const el of this.revisionActions.values()) el.remove();
    this.revisionActions.clear();
    this.revisionUiListeners.clear();
    this.revisionStoreUnsub?.();
    this.revisionStoreUnsub = undefined;
    if (this.revisionManager) {
      this.revisionManager.shutdown();
      void this.revisionManager.flushPendingWrites();
    }
    // Abort active turns / hibernate idle sessions before the runtime goes.
    this.inAppConversations?.shutdown();

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
    await this.maybeResolvePiCliPath();
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
      // Cached in-app sessions must not keep pointing at the outgoing
      // repository, settings, MCP auth, or usage sink (§14.7). The manager
      // itself is NOT rebuilt — that would orphan live sessions and any queued
      // revision turn.
      this.inAppConversations?.refreshDependencies();
      // Adopt the rebuilt repository's revision store once it has loaded, so
      // open drafts and controllers stay valid across the swap.
      await this.adoptRevisionStore();
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

  /**
   * Open (or reveal) the chat tab for an exact destination (§11.8).
   *
   * With a `conversationId`, deduplication compares BOTH values — deduping by
   * agent alone reveals whichever tab happens to hold that agent, which is the
   * wrong conversation as soon as one agent has several open. A requested
   * conversation that no longer exists produces a Notice and stops: silently
   * falling back to a sibling conversation would send the user to a thread that
   * never saw their revision.
   */
  async openChatView(agentName?: string, conversationId?: string): Promise<void> {
    if (agentName) {
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
      const views = leaves.map((leaf) => leaf.view);
      const chatViews = views.filter((view): view is AgentChatView => view instanceof AgentChatView);
      const match = findChatLeafForTarget(chatViews, agentName, conversationId);
      if (match >= 0) {
        const leaf = leaves[views.indexOf(chatViews[match]!)];
        if (leaf) {
          await this.app.workspace.revealLeaf(leaf);
          this.app.workspace.setActiveLeaf(leaf, { focus: true });
          return;
        }
      }
    }

    if (agentName && conversationId) {
      const agent = this.repository.getAgentByName(agentName);
      if (!agent) {
        new Notice(`Agent "${agentName}" is no longer available.`);
        return;
      }
      const conversations = await this.repository.listConversations(agent);
      if (!conversations.some((c) => c.id === conversationId)) {
        new Notice(`That conversation for "${agentName}" no longer exists.`);
        return;
      }
    }

    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: VIEW_TYPE_CHAT,
      active: true,
      state: agentName ? { agentName, ...(conversationId ? { conversationId } : {}) } : {},
    });
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    if (agentName && leaf.view instanceof AgentChatView) {
      // Awaited: callers reveal or send into the conversation right after, and
      // must know the requested pair is actually loaded.
      const selected = await leaf.view.selectConversation(agentName, conversationId);
      if (!selected && conversationId) {
        new Notice(`Couldn't open that conversation for "${agentName}".`);
      }
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

  async verifyClaudeCli(showNotice = true, showSuccessNotice = showNotice): Promise<boolean> {
    const cliPath = await this.resolveClaudeCliPath(this.settings.claudeCliPath);
    this.settings.claudeCliPath = cliPath;
    return await this.verifyCliBinary(cliPath, "Claude", showNotice, showSuccessNotice);
  }

  async verifyCodexCli(showNotice = true, showSuccessNotice = showNotice): Promise<boolean> {
    const cliPath = await this.resolveCliPathFrom(
      resolveCodexCliCandidates(this.settings.codexCliPath),
      this.settings.codexCliPath,
    );
    this.settings.codexCliPath = cliPath;
    return await this.verifyCliBinary(cliPath, "Codex", showNotice, showSuccessNotice);
  }

  async verifyPiCli(showNotice = true, showSuccessNotice = showNotice): Promise<boolean> {
    const cliPath = await this.resolveCliPathFrom(
      resolvePiCliCandidates(this.settings.piCliPath),
      this.settings.piCliPath,
    );
    this.settings.piCliPath = cliPath;
    return await this.verifyCliBinary(cliPath, "Pi", showNotice, showSuccessNotice);
  }

  /** Per-label version bookkeeping for {@link verifyCliBinary}. */
  private cliVersionSlot(label: "Claude" | "Codex" | "Pi"): {
    get: () => string | null;
    set: (version: string | null) => void;
    minimum: string;
    pkg: string;
  } {
    switch (label) {
      case "Claude":
        return {
          get: () => this.settings.claudeCliVersion ?? null,
          set: (v) => {
            if (v) this.settings.claudeCliVersion = v;
            else delete this.settings.claudeCliVersion;
          },
          minimum: MIN_CLAUDE_CLI_VERSION,
          pkg: CLI_NPM_PACKAGES.Claude,
        };
      case "Codex":
        return {
          get: () => this.settings.codexCliVersion ?? null,
          set: (v) => {
            if (v) this.settings.codexCliVersion = v;
            else delete this.settings.codexCliVersion;
          },
          minimum: MIN_CODEX_CLI_VERSION,
          pkg: CLI_NPM_PACKAGES.Codex,
        };
      case "Pi":
        return {
          get: () => this.settings.piCliVersion ?? null,
          set: (v) => {
            if (v) this.settings.piCliVersion = v;
            else delete this.settings.piCliVersion;
          },
          minimum: MIN_PI_CLI_VERSION,
          pkg: CLI_NPM_PACKAGES.Pi,
        };
    }
  }

  private async verifyCliBinary(
    cliPath: string,
    label: "Claude" | "Codex" | "Pi",
    showNotice: boolean,
    showSuccessNotice = showNotice,
  ): Promise<boolean> {
    const slot = this.cliVersionSlot(label);
    // Skip re-spawning `--version` if this exact binary verified successfully
    // recently — settings edits would otherwise probe on every save.
    const cacheKey = `${label}:${cliPath}`;
    const verifiedAt = this.cliVerifiedAt.get(cacheKey);
    if (verifiedAt !== undefined && Date.now() - verifiedAt < AgentFleetPlugin.CLI_VERIFY_TTL_MS) {
      if (showNotice) {
        const version = slot.get();
        const warning = cliVersionWarning(label, version, slot.minimum);
        if (warning) new Notice(warning, 10000);
        else if (showSuccessNotice) new Notice(`${label} CLI ${version ?? "available"}.`, 5000);
      }
      return true;
    }

    const installHint = `install with: npm install -g ${slot.pkg}`;
    const failureMessage =
      `${label} CLI verification failed (path: ${cliPath || "not set"}). ` +
      `Fix the ${label} CLI Path in settings, or ${installHint}`;

    return await new Promise((resolve) => {
      // On macOS/Linux: spawns through login shell so env vars are available.
      // On Windows: spawns directly (env is inherited from the system).
      const proc = spawnCli(cliPath, ["--version"]);
      let stderr = "";
      let stdout = "";
      proc.stdout!.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      proc.stderr!.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      proc.on("close", (code) => {
        const ok = code === 0;
        if (ok) {
          this.cliVerifiedAt.set(cacheKey, Date.now());
          // The probe already ran, so reading the version off it is free.
          // Some builds print to stderr instead — check both.
          const version = parseCliVersion(stdout) ?? parseCliVersion(stderr);
          slot.set(version);
          // Persist only the detection result. Clearing a stale value when a
          // future CLI prints an unparseable version is as important as caching
          // a known one: unknown versions deliberately pass feature gates.
          // Calling saveSettings() here would rebuild the runtime mid-startup.
          void this.saveData(this.settings);
          const warning = cliVersionWarning(label, version, slot.minimum);
          if (warning) {
            console.warn(`Agent Fleet: ${warning}`);
            if (showNotice) new Notice(warning, 10000);
          } else if (showNotice && showSuccessNotice) {
            new Notice(`${label} CLI ${version ?? "available"}.`, 5000);
          }
        } else {
          console.error(`Agent Fleet: ${label} CLI verification failed`, stderr);
        }
        if (showNotice && !ok) new Notice(failureMessage, 10000);
        resolve(ok);
      });
      proc.on("error", (error) => {
        console.error(`Agent Fleet: ${label} CLI verification error`, error);
        if (showNotice) {
          new Notice(failureMessage, 10000);
        }
        resolve(false);
      });
    });
  }

  /**
   * Best-effort removal of per-run temp files that a force-quit left behind:
   * MCP projection files under `<vaultBase>/.claude/` — `af-mcp.<token>.json`
   * and `af-mcp-<slug>.<token>.cjs` (mcpProjection.ts) plus
   * `af-remember-mcp.<token>.{json,cjs}` (rememberMcpServer.ts) — older than
   * 24h, per-agent CODEX_HOME overlay dirs under the OS temp dir
   * (codexPermissions.ts OVERLAY_ROOT) older than 7 days, and per-run Pi
   * overlay/extension dirs older than 7 days whose owning process is gone.
   * Conservative: only names matching the plugin's own prefixes are touched.
   */
  private async cleanupStaleTempFiles(): Promise<void> {
    const now = Date.now();
    const sweep = async (
      dir: string,
      matches: (name: string) => boolean,
      maxAgeMs: number,
      isLive?: (fullPath: string) => Promise<boolean>,
    ) => {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return; // dir missing/unreadable — nothing to sweep
      }
      for (const name of entries) {
        if (!matches(name)) continue;
        const fullPath = join(dir, name);
        try {
          const info = await stat(fullPath);
          if (now - info.mtimeMs > maxAgeMs) {
            if (isLive && (await isLive(fullPath))) continue;
            await rm(fullPath, { recursive: true, force: true });
          }
        } catch {
          // best-effort — skip entries we can't stat/remove
        }
      }
    };

    const vaultBase = this.repository.getVaultBasePath();
    if (vaultBase) {
      await sweep(
        join(vaultBase, ".claude"),
        (name) => /^(af-mcp|af-remember-mcp)[.-].+\.(json|cjs)$/.test(name),
        24 * 60 * 60 * 1000,
      );
    }
    // Overlays are keyed by agent and rebuilt on demand, so removing old ones
    // is safe even if the agent still exists.
    await sweep(join(tmpdir(), "agent-fleet-codex"), () => true, 7 * 24 * 60 * 60 * 1000);
    // Pi MCP overlays are NOT rebuildable — one holds live symlinks into
    // ~/.pi/agent for the whole life of a chat session, its mtime frozen at
    // spawn, and it may belong to a different Obsidian instance on this
    // machine. Age alone is not proof of death: each overlay carries the
    // owning process's pid, and anything whose owner is still running is
    // skipped no matter how old it is.
    await sweep(
      piOverlayRoot(),
      () => true,
      7 * 24 * 60 * 60 * 1000,
      (fullPath) => this.isTempDirOwnerAlive(fullPath),
    );
    // Legacy pre-namespace Pi dirs in the shared tmpdir, plus the generated
    // extension dirs piExtensions.ts still creates there. Normally removed by
    // their cleanup handles; the sweep catches force-quit leftovers. Kept at
    // the conservative 7-day window because a live chat session's dirs sit
    // here with frozen mtimes too.
    await sweep(
      tmpdir(),
      (name) => /^agent-fleet-pi-(mcp|ext)-/.test(name),
      7 * 24 * 60 * 60 * 1000,
    );
  }

  /** True when a swept temp dir's pid marker names a process that is still
   *  running (possibly another Obsidian instance). Unreadable/absent markers
   *  and dead pids report false; a pid we can't signal (EPERM) reports true —
   *  when in doubt, don't delete. */
  private async isTempDirOwnerAlive(dirPath: string): Promise<boolean> {
    let pid: number;
    try {
      pid = Number.parseInt((await readFile(join(dirPath, PI_OVERLAY_PID_FILE), "utf-8")).trim(), 10);
    } catch {
      return false;
    }
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "EPERM";
    }
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

  /**
   * Vault events, classified before the fleet refresh runs (§8.6).
   *
   *  - `_fleet/revisions/**` → RevisionStore, then RETURN. A debounced anchor
   *    save happens while the user types; a full entity reparse + scheduler
   *    reconcile per save is exactly what the design forbids.
   *  - `_fleet/usage/**` → ignored, as before (appended on every chat turn).
   *  - other fleet paths → the existing debounced refresh.
   *  - everything else → source-document routing (re-anchor, rename, delete),
   *    which never touches the fleet.
   */
  private registerVaultHandlers(): void {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) void this.handleVaultFileChange(file.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) void this.handleVaultFileChange(file.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void this.handleVaultRename(file.path, oldPath, file instanceof TFile);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        void this.handleVaultDelete(file.path, file instanceof TFile);
      }),
    );
  }

  private async handleVaultFileChange(path: string): Promise<void> {
    switch (classifyFleetPath(this.settings.fleetFolder, path)) {
      case "revision":
        // The store drops echoes of its own writes, so only genuinely external
        // sidecar changes (sync, another device, a hand edit) reach the UI.
        await this.revisionStore?.reloadFile(path).catch((err: unknown) => {
          console.warn(`Agent Fleet: re-reading revision sidecar ${path} failed`, err);
          return null;
        });
        return;
      case "usage":
        return;
      case "entity":
        this.debouncedVaultRefresh();
        return;
      case "outside":
        // A reviewed document changed outside this pane's editor: re-anchor its
        // notes. No fleet refresh — the fleet did not change.
        this.notifyRevisionSourceChanged(path);
        return;
    }
  }

  private async handleVaultRename(newPath: string, oldPath: string, isFile: boolean): Promise<void> {
    const folder = this.settings.fleetFolder;
    const fromKind = classifyFleetPath(folder, oldPath);
    const toKind = classifyFleetPath(folder, newPath);

    if (fromKind === "revision" || toKind === "revision") {
      if (fromKind === "revision") this.revisionStore?.forgetFile(oldPath);
      if (toKind === "revision" && isFile) await this.revisionStore?.reloadFile(newPath);
      return;
    }

    // A renamed source keeps its draft — the sidecar stores the path, so only
    // the path moves (§14.4).
    if (this.revisionManager) {
      if (isFile) {
        await this.revisionManager.onSourceRenamed(oldPath, newPath);
      } else {
        // Obsidian reports one event for a renamed folder; its children keep
        // their drafts, so remap every draft that lived underneath it.
        const prefix = `${oldPath}/`;
        for (const draft of this.revisionStore.list()) {
          if (!draft.sourcePath.startsWith(prefix)) continue;
          await this.revisionManager.onSourceRenamed(
            draft.sourcePath,
            `${newPath}/${draft.sourcePath.slice(prefix.length)}`,
          );
        }
      }
    }

    if (toKind !== "outside" || fromKind !== "outside") this.debouncedVaultRefresh();
  }

  private async handleVaultDelete(path: string, isFile: boolean): Promise<void> {
    switch (classifyFleetPath(this.settings.fleetFolder, path)) {
      case "revision":
        this.revisionStore?.forgetFile(path);
        return;
      case "usage":
      case "entity":
        this.debouncedVaultRefresh();
        return;
      case "outside":
        // Keep the notes: an accidental delete followed by a restore must not
        // destroy user-authored comments (§14.4).
        if (isFile) await this.revisionManager?.onSourceDeleted(path);
        return;
    }
  }

  /** Push the current draft back into any pane reviewing this document so its
   *  anchors re-resolve against the new bytes (§9.3). */
  private notifyRevisionSourceChanged(path: string): void {
    const draft = this.revisionStore?.getBySourcePath(path);
    if (!draft) return;
    this.emitRevisionUiEvent({ type: "draft-updated", draft });
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
  private async maybeResolveCodexCliPath(verifyVersion = false): Promise<void> {
    const runtimeAgents = this.runtime?.getSnapshot().agents ?? [];
    const agents = runtimeAgents.length > 0
      ? runtimeAgents
      : (this.repository?.getSnapshot().agents ?? []);
    const hasCodexAgent = agents.some((a) => normalizeAdapter(a.adapter) === "codex");
    if (!hasCodexAgent) return;
    this.settings.codexCliPath = await this.resolveCliPathFrom(
      resolveCodexCliCandidates(this.settings.codexCliPath),
      this.settings.codexCliPath,
    );
    if (verifyVersion) {
      await this.verifyCliBinary(this.settings.codexCliPath, "Codex", true, false);
    }
  }

  /** Resolve the Pi CLI path, but only when some agent actually uses the pi
   *  adapter — same conditional-probe rationale as Codex. `verifyPiCli`
   *  resolves unconditionally. */
  private async maybeResolvePiCliPath(verifyVersion = false): Promise<void> {
    const runtimeAgents = this.runtime?.getSnapshot().agents ?? [];
    const agents = runtimeAgents.length > 0
      ? runtimeAgents
      : (this.repository?.getSnapshot().agents ?? []);
    const hasPiAgent = agents.some((a) => normalizeAdapter(a.adapter) === "pi");
    if (!hasPiAgent) return;
    this.settings.piCliPath = await this.resolveCliPathFrom(
      resolvePiCliCandidates(this.settings.piCliPath),
      this.settings.piCliPath,
    );
    if (verifyVersion) {
      await this.verifyCliBinary(this.settings.piCliPath, "Pi", true, false);
    }
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
