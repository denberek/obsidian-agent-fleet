import { Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import { ConfirmModal } from "./modals/confirmModal";
import { renderModelPicker } from "./components/modelPicker";
import { DEFAULT_SETTINGS } from "./constants";
import type AgentFleetPlugin from "./main";
import type { AgentConfig, ChannelCredentialEntry } from "./types";
import {
  agentNameFromSlug,
  createWikiKeeperAgent,
  DEFAULT_WIKI_KEEPER_INPUT,
  defaultWikiKeeperInput,
  deleteWikiKeeperAgent,
  updateWikiKeeperAgent,
  type WikiKeeperCreateInput,
  type WikiKeeperEditInput,
} from "./wikiKeeperTemplate";

export class AgentFleetSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: AgentFleetPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Fleet folder")
      .addText((text) =>
        text.setValue(this.plugin.settings.fleetFolder).onChange(async (value) => {
          this.plugin.settings.fleetFolder = value.trim() || DEFAULT_SETTINGS.fleetFolder;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Claude CLI path")
      .addText((text) =>
        text.setValue(this.plugin.settings.claudeCliPath).onChange(async (value) => {
          this.plugin.settings.claudeCliPath = value.trim() || DEFAULT_SETTINGS.claudeCliPath;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Codex CLI path")
      .setDesc(
        "Used by agents with adapter “codex”. Install via `npm i -g @openai/codex` " +
        "and authenticate with `codex login` in a terminal first.",
      )
      .addText((text) =>
        text.setValue(this.plugin.settings.codexCliPath).onChange(async (value) => {
          this.plugin.settings.codexCliPath = value.trim() || DEFAULT_SETTINGS.codexCliPath;
          await this.plugin.saveSettings();
        }),
      );

    const modelSetting = new Setting(containerEl)
      .setName("Default model")
      .setDesc(
        "Fallback for agents that don\u2019t set their own. Aliases (opus/sonnet/haiku) work on any backend; use Custom for pinned IDs or Bedrock/Vertex/Foundry.",
      );
    const modelPickerHost = modelSetting.controlEl.createDiv();
    renderModelPicker(modelPickerHost, {
      value: this.plugin.settings.defaultModel,
      onChange: async (value) => {
        this.plugin.settings.defaultModel = value || DEFAULT_SETTINGS.defaultModel;
        await this.plugin.saveSettings();
      },
    });

    new Setting(containerEl)
      .setName("AWS region")
      .addText((text) =>
        text.setValue(this.plugin.settings.awsRegion).onChange(async (value) => {
          this.plugin.settings.awsRegion = value.trim() || DEFAULT_SETTINGS.awsRegion;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Max concurrent runs")
      .addSlider((slider) =>
        slider.setLimits(1, 10, 1).setValue(this.plugin.settings.maxConcurrentRuns).setDynamicTooltip().onChange(async (value) => {
          this.plugin.settings.maxConcurrentRuns = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Run log retention")
      .setDesc("Days to keep run logs before auto-prune.")
      .addSlider((slider) =>
        slider.setLimits(1, 365, 1).setValue(this.plugin.settings.runLogRetentionDays).setDynamicTooltip().onChange(async (value) => {
          this.plugin.settings.runLogRetentionDays = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Catch up missed tasks")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.catchUpMissedTasks).onChange(async (value) => {
          this.plugin.settings.catchUpMissedTasks = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Notification level")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("all", "All")
          .addOption("failures-only", "Failures only")
          .addOption("none", "None")
          .setValue(this.plugin.settings.notificationLevel)
          .onChange(async (value) => {
            this.plugin.settings.notificationLevel = value as typeof this.plugin.settings.notificationLevel;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Status bar")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showStatusBar).onChange(async (value) => {
          this.plugin.settings.showStatusBar = value;
          await this.plugin.saveSettings();
          this.plugin.refreshStatusBar();
        }),
      );

    new Setting(containerEl)
      .setName("Chat watchdog timeout (minutes)")
      .setDesc(
        "How long a chat session waits for any output from the Claude CLI before " +
        "killing the subprocess and surfacing a timeout error. Raise this if your " +
        "agents run long tools (e.g. large web fetches, builds) and you're seeing " +
        "spurious 'no response' errors.",
      )
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.chatWatchdogMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.chatWatchdogMinutes = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Verify Claude CLI")
      .setDesc("Checks that the configured binary is reachable.")
      .addButton((button) =>
        button.setButtonText("Verify").onClick(async () => {
          const ok = await this.plugin.verifyClaudeCli();
          new Notice(ok ? "Claude CLI detected." : "Claude CLI check failed. See console for details.");
        }),
      );

    new Setting(containerEl)
      .setName("Verify Codex CLI")
      .setDesc("Checks that the configured Codex binary is reachable.")
      .addButton((button) =>
        button.setButtonText("Verify").onClick(async () => {
          const ok = await this.plugin.verifyCodexCli();
          new Notice(ok ? "Codex CLI detected." : "Codex CLI check failed. See console for details.");
        }),
      );

    this.renderWikiKeepersSection(containerEl);
    this.renderChannelsSection(containerEl);
  }

  // ═══════════════════════════════════════════════════════
  //  Channels section
  // ═══════════════════════════════════════════════════════

  private renderChannelsSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Channels").setHeading();

    // SECURITY WARNING — credentials live in plugin data.json, inside the
    // vault's .obsidian folder. Users who sync .obsidian sync credentials too.
    const warning = containerEl.createDiv({ cls: "af-settings-warning" });
    warning.setCssStyles({ padding: "12px" });
    warning.setCssStyles({ margin: "8px 0 16px 0" });
    warning.setCssStyles({ border: "1px solid var(--background-modifier-border)" });
    warning.setCssStyles({ borderRadius: "6px" });
    warning.setCssStyles({ background: "var(--background-secondary)" });
    warning.createEl("strong", { text: "Credential storage: " });
    const configDir = this.plugin.app.vault.configDir;
    warning.createSpan({
      text:
        `Channel credentials are stored in this plugin's data.json inside your vault's ${configDir} folder. ` +
        `If you sync your ${configDir} folder across devices, credentials will sync with it. ` +
        "Do not commit this file to a public git repository.",
    });

    new Setting(containerEl)
      .setName("Max concurrent channel sessions")
      .setDesc("Hard cap on live claude subprocesses across all channels. Oldest idle session is hibernated when exceeded.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settings.maxConcurrentChannelSessions)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxConcurrentChannelSessions = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Idle timeout (minutes)")
      .setDesc("Channel sessions with no activity for this long get their subprocess hibernated. State is preserved and the next message resumes transparently.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 120, 1)
          .setValue(this.plugin.settings.channelIdleTimeoutMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.channelIdleTimeoutMinutes = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Rate limit per conversation")
      .setDesc("Maximum messages allowed per external conversation within the rolling window.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 100, 1)
          .setValue(this.plugin.settings.channelRateLimitPerConversation)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.channelRateLimitPerConversation = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Rate limit window (minutes)")
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.channelRateLimitWindowMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.channelRateLimitWindowMinutes = value;
            await this.plugin.saveSettings();
          }),
      );

    // Credentials list + add form
    new Setting(containerEl).setName("Channel credentials").setHeading();

    const list = containerEl.createDiv({ cls: "af-channel-credentials" });
    this.renderCredentialList(list);

    // Add new credential
    const addForm = containerEl.createDiv({ cls: "af-channel-credential-add" });
    addForm.setCssStyles({ marginTop: "12px" });
    addForm.setCssStyles({ padding: "12px" });
    addForm.setCssStyles({ border: "1px dashed var(--background-modifier-border)" });
    addForm.setCssStyles({ borderRadius: "6px" });
    addForm.createEl("strong", { text: "Add a channel credential" });

    const state: { ref: string; type: string; botToken: string; appToken: string } = {
      ref: "",
      type: "slack",
      botToken: "",
      appToken: "",
    };

    new Setting(addForm)
      .setName("Reference name")
      .setDesc("Used by `credential_ref` in _fleet/channels/*.md files.")
      .addText((text) =>
        text.setPlaceholder("my-creds").onChange((value) => {
          state.ref = value.trim();
        }),
      );

    new Setting(addForm)
      .setName("Type")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("slack", "Slack")
          .addOption("telegram", "Telegram")
          .setValue("slack")
          .onChange((value) => {
            state.type = value;
            slackFields.setCssStyles({ display: value === "slack" ? "" : "none" });
            telegramFields.setCssStyles({ display: value === "telegram" ? "" : "none" });
          }),
      );

    // Slack-specific fields
    const slackFields = addForm.createDiv();
    new Setting(slackFields)
      .setName("Bot token (xoxb-...)")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("xoxb-...").onChange((value) => {
          state.botToken = value.trim();
        });
      });

    new Setting(slackFields)
      .setName("App-level token (xapp-...)")
      .setDesc("Generated in your Slack app's Basic Information → App-Level Tokens.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("xapp-...").onChange((value) => {
          state.appToken = value.trim();
        });
      });

    // Telegram-specific fields
    const telegramFields = addForm.createDiv();
    telegramFields.setCssStyles({ display: "none" });
    new Setting(telegramFields)
      .setName("Bot token")
      .setDesc("From @BotFather on Telegram.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("123456:ABC-DEF1234...").onChange((value) => {
          state.botToken = value.trim();
        });
      });

    new Setting(addForm).addButton((button) =>
      button
        .setButtonText("Add credential")
        .setCta()
        .onClick(async () => {
          if (!state.ref || !state.botToken) {
            new Notice("Fill in the reference name and bot token.");
            return;
          }
          let entry: ChannelCredentialEntry;
          if (state.type === "telegram") {
            entry = { type: "telegram", botToken: state.botToken };
          } else {
            if (!state.appToken) {
              new Notice("Slack requires both bot token and app-level token.");
              return;
            }
            entry = { type: "slack", botToken: state.botToken, appToken: state.appToken };
          }
          this.plugin.channelCredentials.set(state.ref, entry);
          new Notice(`Added credential \`${state.ref}\`.`);
          this.display(); // re-render
        }),
    );
  }

  private renderCredentialList(container: HTMLElement): void {
    const credentials = this.plugin.channelCredentials.list();
    if (credentials.length === 0) {
      container
        .createDiv({ text: "No channel credentials configured yet.", cls: "af-muted" })
        .setCssStyles({ color: "var(--text-muted)" });
      return;
    }
    for (const { ref, entry } of credentials) {
      const row = container.createDiv({ cls: "af-channel-credential-row" });
      row.setCssStyles({ display: "flex" });
      row.setCssStyles({ justifyContent: "space-between" });
      row.setCssStyles({ alignItems: "center" });
      row.setCssStyles({ padding: "8px 12px" });
      row.setCssStyles({ border: "1px solid var(--background-modifier-border)" });
      row.setCssStyles({ borderRadius: "6px" });
      row.setCssStyles({ marginBottom: "6px" });

      const info = row.createDiv();
      info.createEl("strong", { text: ref });
      info
        .createEl("span", {
          text: `  ·  ${entry.type}  ·  ${maskToken(tokenOf(entry))}`,
          cls: "af-muted",
        })
        .setCssStyles({ color: "var(--text-muted)" });

      const button = row.createEl("button", { text: "Remove" });
      button.onclick = () => {
        this.plugin.channelCredentials.delete(ref);
        new Notice(`Removed credential \`${ref}\`.`);
        this.display();
      };
    }
  }

  // ═══════════════════════════════════════════════════════
  //  Wiki Keepers section
  // ═══════════════════════════════════════════════════════

  private renderWikiKeepersSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Wiki Keepers").setHeading();
    const hint = containerEl.createEl("p", {
      cls: "af-settings-hint",
      text:
        "Per-scope wiki agents. Each runs its own inbox + watched folders + " +
        "topics + heartbeat. All fields on the Add form are optional — click " +
        "Create with everything blank to get a whole-vault keeper with defaults.",
    });
    hint.setCssStyles({ color: "var(--af-text-secondary)" });
    hint.setCssStyles({ fontSize: "12px" });

    const snapshot = this.plugin.runtime.getSnapshot();
    const instances = snapshot.agents.filter((a): a is AgentConfig & { wikiKeeper: NonNullable<AgentConfig["wikiKeeper"]> } =>
      a.wikiKeeper !== undefined,
    );

    const list = containerEl.createDiv({ cls: "af-wk-list" });
    if (instances.length === 0) {
      list.createDiv({
        cls: "af-wk-empty",
        text: "No Wiki Keepers yet. Click Add to create one.",
      });
    } else {
      for (const agent of instances) {
        const row = list.createDiv({ cls: "af-wk-row" });
        const left = row.createDiv({ cls: "af-wk-row-left" });
        left.createSpan({ cls: "af-wk-name", text: agent.name });
        const scope = agent.wikiKeeper.scopeRoot || "(whole vault)";
        left.createSpan({ cls: "af-wk-scope", text: `scope: ${scope}` });

        const actions = row.createDiv({ cls: "af-wk-row-actions" });
        const editBtn = actions.createEl("button", { text: "Edit", cls: "af-wk-row-btn" });
        editBtn.onclick = () => {
          new EditWikiKeeperModal(this.plugin, agent, () => {
            this.scheduleRerender();
          }).open();
        };
        const deleteBtn = actions.createEl("button", {
          text: "Delete",
          cls: "af-wk-row-btn af-wk-row-btn-danger",
        });
        deleteBtn.onclick = () => {
          new ConfirmModal(this.plugin.app, {
            title: `Delete Wiki Keeper "${agent.name}"?`,
            body:
              `This removes the agent folder at _fleet/agents/${agent.name}/.\n\n` +
              `Your scope's inbox, topics, index, and log are NOT deleted.`,
            confirmText: "Delete",
            danger: true,
            onConfirm: async () => {
              try {
                await deleteWikiKeeperAgent(
                  this.plugin.app,
                  this.plugin.settings.fleetFolder,
                  agent.name,
                );
                await this.plugin.refreshFromVault();
                new Notice(`Wiki Keeper "${agent.name}" deleted.`);
                this.scheduleRerender();
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                new Notice(`Failed to delete: ${msg}`);
              }
            },
          }).open();
        };
      }
    }

    new Setting(containerEl)
      .setName("Add Wiki Keeper")
      .setDesc("Create a new scoped wiki agent. All fields optional.")
      .addButton((btn) =>
        btn.setButtonText("+ Add").onClick(() => {
          new AddWikiKeeperModal(this.plugin, () => {
            this.scheduleRerender();
          }).open();
        }),
      );
  }

  /** Wait for the debounced vault-events loop to flush (500ms), force a
   *  repository refresh, then re-render the settings tab. Used after any
   *  Wiki Keeper create/edit/delete so the list immediately reflects the
   *  on-disk state without the user having to close and reopen settings. */
  private scheduleRerender(): void {
    window.setTimeout(() => {
      void (async () => {
        try {
          await this.plugin.refreshFromVault();
        } catch {
          /* non-fatal */
        }
        this.display();
      })();
    }, 600);
  }
}

// ═══════════════════════════════════════════════════════
//  Add Wiki Keeper modal
// ═══════════════════════════════════════════════════════

class AddWikiKeeperModal extends Modal {
  private input: WikiKeeperCreateInput;

  constructor(
    private readonly plugin: AgentFleetPlugin,
    private readonly onCreated: () => void,
  ) {
    super(plugin.app);
    this.input = defaultWikiKeeperInput();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("af-wk-modal");
    contentEl.createEl("h2", { text: "Add Wiki Keeper" });

    // Banner — makes it unambiguous that everything is optional.
    const banner = contentEl.createDiv({ cls: "af-wk-banner" });
    banner.createEl("strong", { text: "All fields are optional. " });
    banner.createSpan({
      text:
        "Click Create with everything blank and you'll get a whole-vault " +
        "keeper with sensible defaults (inbox at _sources/inbox, topics at " +
        "topics/, nightly ingest at 3am, Sunday lint).",
    });

    // ── Core (scope/slug) ──
    contentEl.createEl("h3", { text: "Scope", cls: "af-wk-section-h" });

    new Setting(contentEl)
      .setName("Scope folder")
      .setDesc("Optional. Vault-relative path. Empty = whole vault.")
      .addText((t) =>
        t
          .setPlaceholder("(empty = whole vault)")
          .setValue(this.input.scopeRoot)
          .onChange((v) => {
            this.input.scopeRoot = v.trim();
            this.renderPreview();
          }),
      );

    new Setting(contentEl)
      .setName("Slug")
      .setDesc("Optional. Agent name suffix. Default: derived from scope folder name, or 'wiki-keeper' for whole-vault.")
      .addText((t) =>
        t
          .setPlaceholder("(auto)")
          .setValue(this.input.scopeSlug)
          .onChange((v) => {
            this.input.scopeSlug = v.trim();
            this.renderPreview();
          }),
      );

    this.renderPreview();

    // ── Sources (watched folders / excludes) ──
    contentEl.createEl("h3", { text: "Sources", cls: "af-wk-section-h" });

    new Setting(contentEl)
      .setName("Watched folders")
      .setDesc(
        "Optional. Comma- or newline-separated vault-relative paths. Read-only " +
          "— claims are extracted but files are never moved. Leave empty for " +
          "inbox-only mode (you drop files into _sources/inbox/ and they get archived after processing).",
      )
      .addTextArea((ta) =>
        ta
          .setPlaceholder("(empty = inbox-only)")
          .setValue(this.input.watchedFolders.join(", "))
          .onChange((v) => {
            this.input.watchedFolders = v
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean);
          }),
      );

    new Setting(contentEl)
      .setName("Exclude patterns")
      .setDesc("Optional. Glob patterns to skip. Leave empty to process everything under watched + inbox.")
      .addTextArea((ta) =>
        ta
          .setPlaceholder("(empty = no excludes)")
          .setValue(this.input.excludePatterns.join(", "))
          .onChange((v) => {
            this.input.excludePatterns = v
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean);
          }),
      );

    new Setting(contentEl)
      .setName("Watch files modified since")
      .setDesc(
        "Watched mode only — files whose last modification date is before this " +
          "are skipped. Defaults to today so an established vault doesn't flood " +
          "the keeper on first run. Clear the field to process everything.",
      )
      .addText((t) => {
        t.inputEl.type = "date";
        t.setValue(this.input.watchedSince).onChange((v) => {
          this.input.watchedSince = v.trim();
        });
      });

    // Scheduling: the keeper gets a sensible default heartbeat (for ingest)
    // and a sibling lint task on creation. Cadence is managed afterwards via
    // the agent editor (HEARTBEAT.md) and the task editor — same as any other
    // agent. Wiki Keeper config.md carries no schedule fields.

    // Channels come from the fleet repository (`_fleet/channels/*.md`), not
    // from the credentials map — a channel definition is what the heartbeat
    // actually posts to, and credentials are a separate concept keyed
    // independently.
    const channels = this.plugin.runtime.getSnapshot().channels.map((c) => c.name);
    new Setting(contentEl)
      .setName("Heartbeat channel")
      .setDesc("Optional. Slack/Telegram channel for ingest + lint summaries. Leave as (none) to disable.")
      .addDropdown((dd) => {
        dd.addOption("", "(none)");
        for (const c of channels) dd.addOption(c, c);
        dd.setValue(this.input.heartbeatChannel).onChange((v) => {
          this.input.heartbeatChannel = v;
        });
      });

    // ── Advanced ──
    contentEl.createEl("h3", { text: "Advanced", cls: "af-wk-section-h" });

    new Setting(contentEl)
      .setName("Max tokens per ingest")
      .setDesc("Hard cap on token spend per run. Unprocessed files resume next cycle.")
      .addText((t) =>
        t
          .setValue(String(this.input.maxTokensPerIngest))
          .onChange((v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n > 0) this.input.maxTokensPerIngest = n;
          }),
      );

    new Setting(contentEl)
      .setName("File substantive answers")
      .setDesc("If on, wiki-query files long answers under _topics/syntheses/. Off = answers live only in chat.")
      .addToggle((t) =>
        t.setValue(this.input.fileSubstantiveAnswers).onChange((v) => {
          this.input.fileSubstantiveAnswers = v;
        }),
      );

    new Setting(contentEl)
      .setName("Obsidian URL scheme for citations")
      .setDesc("If on, external-channel (Slack/Telegram) replies rewrite [[wikilinks]] as obsidian:// URLs.")
      .addToggle((t) =>
        t.setValue(this.input.obsidianUrlScheme).onChange((v) => {
          this.input.obsidianUrlScheme = v;
        }),
      );

    // ── Paths (expert) ──
    // Scope and paths are fixed after creation — changing them would orphan
    // existing topic pages. Defaults are fine for ~every user; override only
    // if you have a specific layout in mind.
    const pathsHeader = contentEl.createEl("h3", { text: "Paths (expert)", cls: "af-wk-section-h" });
    pathsHeader.title =
      "Paths are relative to scope_root. Defaults work for almost everyone. Override only if your vault layout demands it — these cannot be changed after creation.";

    const pathField = (name: string, desc: string, key: keyof WikiKeeperCreateInput): void => {
      new Setting(contentEl)
        .setName(name)
        .setDesc(desc)
        .addText((t) =>
          t
            .setPlaceholder(String(this.input[key] ?? ""))
            .setValue(String(this.input[key] ?? ""))
            .onChange((v) => {
              (this.input as unknown as Record<string, unknown>)[key] = v.trim() || DEFAULT_WIKI_KEEPER_INPUT[key];
            }),
        );
    };
    pathField("Inbox path", "Where one-off source drops land.", "inboxPath");
    pathField("Archive path", "Where processed inbox files are moved after summarization.", "archivePath");
    pathField("Topics root", "Folder under scope_root that holds the generated topic pages.", "topicsRoot");
    pathField("Index path", "Relative file path for the curated index.", "indexPath");
    pathField("Log path", "Relative file path for the keeper's activity log.", "logPath");
    pathField("State file", "Hidden JSON file that tracks watched-source mtimes.", "stateFile");

    // Footer
    const footer = contentEl.createDiv({ cls: "af-wk-modal-footer" });
    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    const createBtn = footer.createEl("button", { text: "Create", cls: "mod-cta" });
    createBtn.onclick = async () => {
      createBtn.setText("Creating…");
      createBtn.disabled = true;
      try {
        const { name } = await createWikiKeeperAgent(
          this.app.vault,
          this.plugin.settings.fleetFolder,
          this.input,
        );
        // Force an immediate repository reparse + runtime snapshot emission so
        // the new agent is visible to subsequent operations (e.g. an immediate
        // "Run now") without waiting on the 500ms vault-watcher debounce.
        await this.plugin.refreshFromVault();
        this.close();
        new Notice(`Wiki Keeper "${name}" created.`);
        this.onCreated();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to create Wiki Keeper: ${msg}`);
        createBtn.setText("Create");
        createBtn.disabled = false;
      }
    };
  }

  private renderPreview(): void {
    let previewEl = this.contentEl.querySelector(".af-wk-name-preview");
    if (!previewEl) {
      previewEl = this.contentEl.createDiv({ cls: "af-wk-name-preview" });
    }
    const derivedSlug = this.input.scopeSlug || this.input.scopeRoot;
    previewEl.setText(`→ Will create agent: ${agentNameFromSlug(derivedSlug)}`);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ═══════════════════════════════════════════════════════
//  Edit Wiki Keeper modal
// ═══════════════════════════════════════════════════════

class EditWikiKeeperModal extends Modal {
  private edit: WikiKeeperEditInput;

  constructor(
    private readonly plugin: AgentFleetPlugin,
    private readonly agent: AgentConfig & { wikiKeeper: NonNullable<AgentConfig["wikiKeeper"]> },
    private readonly onSaved: () => void,
  ) {
    super(plugin.app);
    const wk = agent.wikiKeeper;
    this.edit = {
      watchedFolders: [...wk.watchedFolders],
      excludePatterns: [...wk.excludePatterns],
      watchedSince: wk.watchedSince,
      heartbeatChannel: agent.heartbeatChannel ?? "",
      fileSubstantiveAnswers: wk.fileSubstantiveAnswers,
      obsidianUrlScheme: wk.obsidianUrlScheme,
      maxTokensPerIngest: wk.maxTokensPerIngest,
      maxTokensPerRefresh: wk.maxTokensPerRefresh,
      indexSplitThreshold: wk.indexSplitThreshold,
      dedupSimilarityThreshold: wk.dedupSimilarityThreshold,
      summaryStaleDays: wk.summaryStaleDays,
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("af-wk-modal");
    contentEl.createEl("h2", { text: `Edit ${this.agent.name}` });

    // Read-only scope header
    const scopeInfo = contentEl.createDiv({ cls: "af-wk-banner" });
    const scopeLabel = this.agent.wikiKeeper.scopeRoot || "(whole vault)";
    scopeInfo.createEl("strong", { text: "Scope: " });
    scopeInfo.createSpan({ text: scopeLabel });
    scopeInfo.createEl("br");
    scopeInfo.createSpan({
      text:
        "Scope and paths are fixed after creation — changing them would " +
        "orphan existing topic pages. To move a Wiki Keeper, delete this one " +
        "and create a new one at the new scope.",
    });

    // Sources
    contentEl.createEl("h3", { text: "Sources", cls: "af-wk-section-h" });

    new Setting(contentEl)
      .setName("Watched folders")
      .setDesc("Comma- or newline-separated vault-relative paths.")
      .addTextArea((ta) =>
        ta
          .setValue(this.edit.watchedFolders.join(", "))
          .onChange((v) => {
            this.edit.watchedFolders = v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
          }),
      );

    new Setting(contentEl)
      .setName("Exclude patterns")
      .setDesc("Glob patterns to skip.")
      .addTextArea((ta) =>
        ta
          .setValue(this.edit.excludePatterns.join(", "))
          .onChange((v) => {
            this.edit.excludePatterns = v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
          }),
      );

    new Setting(contentEl)
      .setName("Watch files modified since")
      .setDesc("Watched mode skips files older than this date. Clear to process everything.")
      .addText((t) => {
        t.inputEl.type = "date";
        t.setValue(this.edit.watchedSince).onChange((v) => {
          this.edit.watchedSince = v.trim();
        });
      });

    // Schedule fields live outside this modal — heartbeat cadence is edited
    // via the agent editor (HEARTBEAT.md) and the lint cadence via the task
    // editor for `<agent>-lint`.

    const channels = this.plugin.runtime.getSnapshot().channels.map((c) => c.name);
    new Setting(contentEl)
      .setName("Heartbeat channel")
      .addDropdown((dd) => {
        dd.addOption("", "(none)");
        for (const c of channels) dd.addOption(c, c);
        dd.setValue(this.edit.heartbeatChannel).onChange((v) => { this.edit.heartbeatChannel = v; });
      });

    // Advanced
    contentEl.createEl("h3", { text: "Advanced", cls: "af-wk-section-h" });

    new Setting(contentEl)
      .setName("Max tokens per ingest")
      .addText((t) =>
        t.setValue(String(this.edit.maxTokensPerIngest)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) this.edit.maxTokensPerIngest = n;
        }),
      );

    new Setting(contentEl)
      .setName("Max tokens per refresh")
      .setDesc("Separate budget for the synthesis-refresh phase that regenerates topic-page summaries.")
      .addText((t) =>
        t.setValue(String(this.edit.maxTokensPerRefresh)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) this.edit.maxTokensPerRefresh = n;
        }),
      );

    new Setting(contentEl)
      .setName("Index split threshold")
      .setDesc("Topic-page count above which index.md splits into per-type sub-MOCs.")
      .addText((t) =>
        t.setValue(String(this.edit.indexSplitThreshold)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) this.edit.indexSplitThreshold = n;
        }),
      );

    new Setting(contentEl)
      .setName("Summary stale (days)")
      .setDesc("Lint flags topic-page summaries older than this and chains wiki-refresh.")
      .addText((t) =>
        t.setValue(String(this.edit.summaryStaleDays)).onChange((v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) this.edit.summaryStaleDays = n;
        }),
      );

    new Setting(contentEl)
      .setName("Dedup similarity threshold")
      .setDesc("Levenshtein-ratio above which lint proposes merging two same-type pages (0.0–1.0).")
      .addText((t) =>
        t.setValue(String(this.edit.dedupSimilarityThreshold)).onChange((v) => {
          const n = parseFloat(v);
          if (!isNaN(n) && n > 0 && n <= 1) this.edit.dedupSimilarityThreshold = n;
        }),
      );

    new Setting(contentEl)
      .setName("File substantive answers")
      .setDesc("Compounding: wiki-query files long answers under _topics/syntheses/ and bullets each cited topic page. Default ON.")
      .addToggle((t) =>
        t.setValue(this.edit.fileSubstantiveAnswers).onChange((v) => {
          this.edit.fileSubstantiveAnswers = v;
        }),
      );

    new Setting(contentEl)
      .setName("Obsidian URL scheme for citations")
      .setDesc("Rewrite [[wikilinks]] as obsidian:// URLs when replying via Slack/Telegram.")
      .addToggle((t) =>
        t.setValue(this.edit.obsidianUrlScheme).onChange((v) => {
          this.edit.obsidianUrlScheme = v;
        }),
      );

    // Footer
    const footer = contentEl.createDiv({ cls: "af-wk-modal-footer" });
    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.onclick = () => this.close();

    const saveBtn = footer.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.onclick = async () => {
      saveBtn.setText("Saving…");
      saveBtn.disabled = true;
      try {
        await updateWikiKeeperAgent(
          this.app.vault,
          this.plugin.settings.fleetFolder,
          this.agent.name,
          this.edit,
        );
        // Force reparse so permissions.json migration + frontmatter changes
        // are visible to the next run/chat without waiting on the watcher.
        await this.plugin.refreshFromVault();
        this.close();
        new Notice(`Saved.`);
        this.onSaved();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        new Notice(`Failed to save: ${msg}`);
        saveBtn.setText("Save");
        saveBtn.disabled = false;
      }
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function tokenOf(entry: ChannelCredentialEntry): string {
  if (entry.type === "slack") return entry.botToken;
  return entry.botToken;
}

function maskToken(token: string): string {
  if (token.length <= 10) return "***";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
