import { TFile, TFolder, normalizePath } from "obsidian";
import type { App, Vault } from "obsidian";
import { slugify } from "../utils/markdown";
import type { AgentConfig, ConversationMeta } from "../types";
import { ensureFolder } from "./shared";

/**
 * Conversation registry (in-app multi-conversation): per-conversation JSON
 * state files under the agent's `conversations/` folder. Extracted verbatim
 * from FleetRepository.
 */
export class ConversationStore {
  private readonly vault: Vault;

  constructor(
    private readonly app: App,
    /** Facade's legacy flat memory path — flat agents park their
     *  conversations beside it (`<memory dir>/<agent>-conversations`). */
    private readonly getLegacyMemoryPath: (agentName: string) => string,
  ) {
    this.vault = app.vault;
  }

  /** Folder that holds per-conversation JSON files for an agent. Folder
   *  agents nest under their own folder; flat agents share the memory dir. */
  private getConversationsDir(agent: AgentConfig): string {
    if (agent.isFolder) {
      const folderPath = agent.filePath.replace(/\/agent\.md$/, "");
      return normalizePath(`${folderPath}/conversations`);
    }
    const memoryDir = this.getLegacyMemoryPath(agent.name).replace(/\/[^/]+$/, "");
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
    } catch (err) {
      console.warn(`Agent Fleet: skipping unreadable conversation file ${file.path}`, err);
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
    await ensureFolder(this.vault, dir);
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
    } catch (err) {
      console.warn(`Agent Fleet: cannot rename conversation — invalid JSON in ${path}`, err);
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
}
