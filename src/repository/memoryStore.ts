import { join } from "path";
import { FileSystemAdapter, TFile, TFolder, normalizePath } from "obsidian";
import type { App, Vault } from "obsidian";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter, slugify } from "../utils/markdown";
import {
  MEMORY_SCHEMA_VERSION,
  migrateLegacyBody,
  parseWorkingMemory,
  renderSections,
  serializeWorkingMemory,
} from "../utils/memoryFormat";
import type { MemoryFile, SkillCandidate, WorkingMemory } from "../types";
import { createFileIfMissing, ensureFolder, trashPath } from "./shared";

/**
 * Agent memory store: v2 folder layout (working.md, raw/ archive, pending/
 * capture inbox, candidates.json), the legacy flat-file layout, and the
 * legacy→v2 migration — including the in-flight migration promise map.
 * Extracted verbatim from FleetRepository.
 */
export class MemoryStore {
  /** In-flight legacy→v2 memory migrations keyed by agent name, so the
   *  unlocked reflection path and the lock-held capture path share a single
   *  migration: concurrent callers await the same promise instead of either
   *  double-seeding raw or returning before the migration has finished. */
  private migratingMemory = new Map<string, Promise<void>>();

  private readonly vault: Vault;

  constructor(
    private readonly app: App,
    /** `_fleet/memory` (lazy — the fleet folder is a live setting). */
    private readonly getMemoryRoot: () => string,
  ) {
    this.vault = app.vault;
  }

  /** @deprecated Legacy flat memory file path. New layout uses
   *  {@link getWorkingMemoryPath}. Retained for migration + back-compat. */
  getMemoryPath(agentName: string): string {
    return normalizePath(`${this.getMemoryRoot()}/${slugify(agentName)}.md`);
  }

  /** Folder holding an agent's v2 memory: working.md, candidates.md, raw/. */
  getMemoryDir(agentName: string): string {
    return normalizePath(`${this.getMemoryRoot()}/${slugify(agentName)}`);
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
      // Schema guard: a working.md written by a NEWER plugin version (or with a
      // mangled `schema` field) must not be parsed as if it were the current
      // format — fields could be silently misread. Fail soft the way the other
      // corrupt-file reads here do (warn + treat as absent); the matching guard
      // in writeWorkingMemory keeps the file from being clobbered afterwards.
      if (this.hasIncompatibleSchema(content, workingPath)) return null;
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
    await ensureFolder(this.vault, this.getMemoryDir(agentName));
    const content = serializeWorkingMemory(wm);
    const existing = this.vault.getAbstractFileByPath(workingPath);
    if (existing instanceof TFile) {
      // Write-side schema guard (pairs with readWorkingMemory): if the on-disk
      // file carries a newer/unknown schema, readWorkingMemory returned null and
      // `wm` was rebuilt from scratch — writing it would DESTROY the newer
      // file's data. Skip the write instead; captures still land in the
      // append-only raw archive, so no ground truth is lost.
      if (this.hasIncompatibleSchema(await this.vault.cachedRead(existing), workingPath)) return;
      await this.vault.modify(existing, content);
    } else {
      await createFileIfMissing(this.vault, workingPath, content);
    }

    // Complete migration: retire the legacy flat file once v2 exists.
    const legacyPath = this.getMemoryPath(agentName);
    if (legacyPath !== workingPath && this.vault.getAbstractFileByPath(legacyPath)) {
      await trashPath(this.app, legacyPath);
    }
  }

  /**
   * True when the file's frontmatter `schema` is unrecognized: newer than this
   * plugin's {@link MEMORY_SCHEMA_VERSION} or not a finite number at all. A
   * MISSING field stays compatible — pre-schema files have always parsed as the
   * current version (parseWorkingMemory defaults it), and changing that would
   * orphan them. An older-but-known numeric schema also stays compatible
   * (current behavior: parse it; the value is preserved on write). Warns once
   * per call so both the read and write guards are loud in the console.
   */
  private hasIncompatibleSchema(content: string, path: string): boolean {
    const { frontmatter } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    const raw = frontmatter.schema;
    if (raw === undefined) return false;
    if (typeof raw === "number" && Number.isFinite(raw) && raw <= MEMORY_SCHEMA_VERSION) return false;
    console.warn(
      `Agent Fleet: ${path} has unrecognized memory schema ${JSON.stringify(raw)} ` +
        `(this plugin supports up to ${MEMORY_SCHEMA_VERSION}) — treating working memory as ` +
        `unavailable and leaving the file untouched. Update the plugin to use this memory.`,
    );
    return true;
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
    // A concurrent in-flight migration of the same agent (the reflection path
    // calls this unlocked while a capture may run it under the MemoryWriter
    // lock) is awaited rather than skipped — an early return would let the
    // second caller proceed before the migration had actually completed.
    const inFlight = this.migratingMemory.get(agentName);
    if (inFlight) return inFlight;
    const workingPath = this.getWorkingMemoryPath(agentName);
    if (this.vault.getAbstractFileByPath(workingPath)) return; // already v2
    const legacyPath = this.getMemoryPath(agentName);
    const legacyFile = this.vault.getAbstractFileByPath(legacyPath);
    if (!(legacyFile instanceof TFile)) return;
    const migration = (async () => {
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
    })();
    this.migratingMemory.set(agentName, migration);
    try {
      await migration;
    } finally {
      this.migratingMemory.delete(agentName);
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
    await ensureFolder(this.vault, this.getMemoryDir(agentName));
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
      } catch (err) {
        // skip an unreadable / not-yet-removable file (picked up next drain)
        console.warn(`Agent Fleet: skipping pending capture file ${filePath} (retried next drain)`, err);
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
    } catch (err) {
      console.warn(`Agent Fleet: invalid JSON in ${path} — treating skill-candidate ledger as empty`, err);
      return [];
    }
  }

  async writeCandidates(agentName: string, candidates: SkillCandidate[]): Promise<void> {
    const path = this.getCandidatesPath(agentName);
    await ensureFolder(this.vault, this.getMemoryDir(agentName));
    const content = JSON.stringify(candidates, null, 2);
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.vault.modify(file, content);
    else await createFileIfMissing(this.vault, path, content);
  }

  /** Append timestamped lines to the day's raw archive (§6.3). Ground truth —
   *  append-only, never injected. Caller serializes via the MemoryWriter lock. */
  async appendRawMemory(agentName: string, lines: string[], dateIso: string): Promise<void> {
    if (lines.length === 0) return;
    const path = this.getRawMemoryPath(agentName, dateIso);
    await ensureFolder(this.vault, path.replace(/\/[^/]+$/, ""));
    const block = lines.map((l) => l.trimEnd()).join("\n");
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const existing = await this.vault.cachedRead(file);
      await this.vault.modify(file, `${existing.trimEnd()}\n${block}\n`);
    } else {
      await createFileIfMissing(this.vault, path, `${block}\n`);
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

  /**
   * @deprecated Dead code — no remaining callers. Memory capture now flows
   * through MemoryWriter (per-agent FIFO lock) into the v2 layout. This method
   * does an UNSERIALIZED read-modify-write of the legacy flat memory file, so
   * concurrent calls can lose appends; do not resurrect it without routing it
   * through MemoryWriter's lock.
   */
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

    await createFileIfMissing(this.vault,
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
}
