/**
 * Revision draft persistence (REVISION_MODE_DESIGN.md §8).
 *
 * One JSON sidecar per draft under `_fleet/revisions/<uuid>.json`. The store
 * reads and writes those sidecars and nothing else — it never touches the
 * reviewed markdown, never parses fleet entities, and never triggers a runtime
 * refresh. No UI, prompting, or chat logic lives here.
 *
 * Everything handed to callers is a defensive copy: mutating a returned draft
 * has no effect on the cache until it goes back through `save()`.
 */
import { TFile, TFolder, normalizePath } from "obsidian";
import { randomUUID } from "crypto";
import type { App, Vault } from "obsidian";
import type {
  RevisionAnchor,
  RevisionDestination,
  RevisionDraft,
  RevisionDraftStatus,
  RevisionNote,
  RevisionSubmissionPhase,
  RevisionSubmissionState,
} from "../types";
import { REVISION_LIMITS } from "../utils/revisionAnchors";
import { ensureFolder, isRecord } from "./shared";

/** Schema this build writes. Sidecars with a higher version are read-only. */
export const REVISION_SCHEMA_VERSION = 1;

/** Message stamped on a draft that was interrupted mid-submission (§8.5). */
export const REVISION_INTERRUPTED_MESSAGE =
  "Agent Fleet closed while this revision was in progress. Check the document and conversation before retrying.";

export type RevisionStoreEventType = "created" | "updated" | "deleted" | "renamed";

export interface RevisionStoreEvent {
  type: RevisionStoreEventType;
  draftId: string;
  /** Snapshot of the draft after the change; absent for `deleted`. */
  draft?: RevisionDraft;
  sourcePath: string;
  /** Only on `renamed`: the path the draft pointed at before. */
  previousSourcePath?: string;
}

/**
 * A sidecar written by a newer build. Surfaced so the UI can explain why a
 * document is locked, but never parsed into a `RevisionDraft` and never
 * overwritten.
 */
export interface RevisionUnsupportedDraft {
  id: string;
  path: string;
  schemaVersion: number;
  /** Best-effort — present only when the newer file still carries a string. */
  sourcePath?: string;
}

type Listener = (event: RevisionStoreEvent) => void;

function nowIso(): string {
  return new Date().toISOString();
}

/** Vault-relative, slash-normalized, no leading slash. Absolute filesystem
 *  paths are never persisted (§15), so callers pass vault paths only. */
function normalizeSourcePath(path: string): string {
  return normalizePath(path.trim()).replace(/^\/+/, "");
}

export class RevisionStore {
  private readonly vault: Vault;
  private readonly drafts = new Map<string, RevisionDraft>();
  /** draft id → sidecar path on disk. */
  private readonly paths = new Map<string, string>();
  private readonly unsupported = new Map<string, RevisionUnsupportedDraft>();
  private readonly listeners = new Set<Listener>();
  /** One in-flight first write per source path, so two panes cannot mint
   *  competing sidecars before either durable draft reaches the cache. */
  private readonly creations = new Map<string, Promise<RevisionDraft>>();
  /** Sidecar paths this store just wrote; the next external-change callback
   *  for them is our own echo and is dropped. */
  private readonly selfWrites = new Set<string>();
  private loaded = false;

  constructor(
    private readonly app: App,
    /** Lazy so a later fleet-folder settings change is respected. */
    private readonly getRevisionsDir: () => string,
  ) {
    this.vault = app.vault;
  }

  // ─── paths ───

  private dir(): string {
    return normalizePath(this.getRevisionsDir());
  }

  private pathFor(id: string): string {
    return this.paths.get(id) ?? normalizePath(`${this.dir()}/${id}.json`);
  }

  // ─── reads ───

  /** Scan the revisions folder. Malformed files are warned about and skipped;
   *  they never block startup. Drafts interrupted mid-submission are recovered
   *  into attention state (§8.5). */
  async loadAll(): Promise<void> {
    this.drafts.clear();
    this.paths.clear();
    this.unsupported.clear();

    const folder = this.vault.getAbstractFileByPath(this.dir());
    if (folder instanceof TFolder) {
      const files = folder.children
        .filter((child): child is TFile => child instanceof TFile && child.extension === "json")
        .sort((a, b) => a.path.localeCompare(b.path));
      for (const file of files) {
        await this.ingestFile(file);
      }
    }

    for (const draft of [...this.drafts.values()]) {
      if (draft.status === "submitting") {
        const recovered = this.recoverInterrupted(draft);
        this.drafts.set(recovered.id, recovered);
        await this.write(recovered);
      }
    }
    this.loaded = true;
  }

  /** True once `loadAll()` has completed at least once. */
  isLoaded(): boolean {
    return this.loaded;
  }

  private recoverInterrupted(draft: RevisionDraft): RevisionDraft {
    const submission = draft.submission
      ? { ...draft.submission, error: draft.submission.error ?? REVISION_INTERRUPTED_MESSAGE }
      : undefined;
    const next: RevisionDraft = {
      ...draft,
      status: "attention",
      attentionMessage: REVISION_INTERRUPTED_MESSAGE,
      updatedAt: nowIso(),
    };
    if (submission) next.submission = submission;
    return next;
  }

  private async ingestFile(file: TFile): Promise<RevisionDraft | null> {
    let raw: unknown;
    try {
      raw = JSON.parse(await this.vault.cachedRead(file));
    } catch (err) {
      console.warn(`Agent Fleet: skipping malformed revision sidecar ${file.path}`, err);
      return null;
    }

    const version = isRecord(raw) ? raw.schemaVersion : undefined;
    if (typeof version === "number" && version > REVISION_SCHEMA_VERSION) {
      const id = (isRecord(raw) && typeof raw.id === "string" && raw.id) || file.basename;
      const sourcePath = isRecord(raw) && typeof raw.sourcePath === "string" ? raw.sourcePath : undefined;
      const entry: RevisionUnsupportedDraft = { id, path: file.path, schemaVersion: version };
      if (sourcePath) entry.sourcePath = normalizeSourcePath(sourcePath);
      this.unsupported.set(id, entry);
      console.warn(
        `Agent Fleet: revision sidecar ${file.path} uses schema ${version}; ` +
          "it is shown read-only and will not be modified by this version.",
      );
      return null;
    }

    const draft = parseDraft(raw, file.basename);
    if (!draft) {
      console.warn(`Agent Fleet: skipping invalid revision sidecar ${file.path}`);
      return null;
    }

    // Two *different* files claiming one id can only come from a copied
    // sidecar; keep the newer. Re-reading the file we already know is an
    // ordinary external change and always wins, even when the hand-edit left
    // `updatedAt` alone.
    const existing = this.drafts.get(draft.id);
    if (existing && this.paths.get(draft.id) !== file.path) {
      console.warn(`Agent Fleet: duplicate revision draft id ${draft.id} in ${file.path}; keeping the newer file`);
      if (existing.updatedAt >= draft.updatedAt) return null;
    }
    this.drafts.set(draft.id, draft);
    this.paths.set(draft.id, file.path);
    return draft;
  }

  /** Newest draft for a source path, or null. Only one draft per path is
   *  active; if the folder somehow holds two, the most recently updated wins
   *  and the other stays on disk untouched (visible through `list()`). */
  getBySourcePath(sourcePath: string): RevisionDraft | null {
    const target = normalizeSourcePath(sourcePath);
    let best: RevisionDraft | null = null;
    for (const draft of this.drafts.values()) {
      if (draft.sourcePath !== target) continue;
      if (!best || draft.updatedAt > best.updatedAt || (draft.updatedAt === best.updatedAt && draft.id < best.id)) {
        best = draft;
      }
    }
    return best ? cloneDraft(best) : null;
  }

  getById(id: string): RevisionDraft | null {
    const draft = this.drafts.get(id);
    return draft ? cloneDraft(draft) : null;
  }

  /** All parsed drafts, most recently updated first (id breaks ties so the
   *  order is stable). */
  list(): RevisionDraft[] {
    return [...this.drafts.values()]
      .sort((a, b) => (a.updatedAt === b.updatedAt ? a.id.localeCompare(b.id) : b.updatedAt.localeCompare(a.updatedAt)))
      .map(cloneDraft);
  }

  /** Sidecars written by a newer Agent Fleet build. */
  listUnsupported(): RevisionUnsupportedDraft[] {
    return [...this.unsupported.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((entry) => ({ ...entry }));
  }

  // ─── writes ───

  /** Get or create the draft for a source path. Idempotent: an existing draft
   *  for the same path is returned instead of minting a second one. */
  async create(sourcePath: string): Promise<RevisionDraft> {
    const path = normalizeSourcePath(sourcePath);
    if (!path) throw new Error("A revision draft needs a source document path.");

    const existing = this.getBySourcePath(path);
    if (existing) return existing;

    const blocked = [...this.unsupported.values()].find((entry) => entry.sourcePath === path);
    if (blocked) {
      throw new Error(
        `A revision draft for this document was written by a newer version of Agent Fleet (schema ${blocked.schemaVersion}). Update the plugin or remove ${blocked.path}.`,
      );
    }

    const inFlight = this.creations.get(path);
    if (inFlight) return cloneDraft(await inFlight);

    const operation = (async (): Promise<RevisionDraft> => {
      const timestamp = nowIso();
      const draft: RevisionDraft = {
        schemaVersion: REVISION_SCHEMA_VERSION,
        id: randomUUID(),
        sourcePath: path,
        status: "collecting",
        notes: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.write(draft);
      // Cache only durable state. A failed create must not leave a ghost draft
      // that suppresses retries while no sidecar exists on disk.
      this.drafts.set(draft.id, draft);
      this.emit({ type: "created", draftId: draft.id, sourcePath: draft.sourcePath, draft: cloneDraft(draft) });
      return cloneDraft(draft);
    })();
    this.creations.set(path, operation);
    try {
      return cloneDraft(await operation);
    } finally {
      if (this.creations.get(path) === operation) this.creations.delete(path);
    }
  }

  /**
   * Validate and persist a draft. The store stamps `updatedAt`, so callers can
   * hand back a mutated snapshot without maintaining timestamps themselves.
   * Debouncing belongs to the caller (§8.4), not here.
   */
  async save(draft: RevisionDraft): Promise<void> {
    if (this.unsupported.has(draft.id)) {
      throw new Error(`Revision draft ${draft.id} was written by a newer version of Agent Fleet and is read-only.`);
    }
    // A draft already holding more notes than the cap (hand-edited sidecar,
    // or one written before the cap existed) may still be saved as long as it
    // does not grow — otherwise the user could not even delete a note.
    const cached = this.drafts.get(draft.id);
    const allowance = Math.max(REVISION_LIMITS.notesPerDraft, cached?.notes.length ?? 0);
    const validated = validateDraftForSave(draft, allowance);
    const isNew = !this.drafts.has(validated.id);
    await this.write(validated);
    // Listeners and readers must never observe a save that failed on disk.
    this.drafts.set(validated.id, validated);
    this.emit({
      type: isNew ? "created" : "updated",
      draftId: validated.id,
      sourcePath: validated.sourcePath,
      draft: cloneDraft(validated),
    });
  }

  /** Trash a draft's sidecar (user-authored content, so never a hard delete)
   *  and drop the revisions folder if it just emptied. */
  async delete(id: string): Promise<void> {
    const draft = this.drafts.get(id);
    const unsupported = this.unsupported.get(id);
    const path = unsupported?.path ?? this.pathFor(id);
    const sourcePath = draft?.sourcePath ?? unsupported?.sourcePath ?? "";

    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.fileManager.trashFile(file);
    }
    this.drafts.delete(id);
    this.paths.delete(id);
    this.unsupported.delete(id);
    this.selfWrites.add(path);

    const folder = this.vault.getAbstractFileByPath(this.dir());
    if (folder instanceof TFolder && folder.children.length === 0) {
      try {
        await this.app.fileManager.trashFile(folder);
      } catch (err) {
        // Cosmetic only — an orphaned empty folder must not fail a revision.
        console.warn("Agent Fleet: could not remove empty revisions folder", err);
      }
    }

    if (draft || unsupported) {
      this.emit({ type: "deleted", draftId: id, sourcePath });
    }
  }

  /** Follow a source document rename. No-op when nothing points at `oldPath`. */
  async renameSource(oldPath: string, newPath: string): Promise<void> {
    const from = normalizeSourcePath(oldPath);
    const to = normalizeSourcePath(newPath);
    if (!from || !to || from === to) return;

    for (const draft of [...this.drafts.values()]) {
      if (draft.sourcePath !== from) continue;
      const next: RevisionDraft = { ...draft, sourcePath: to, updatedAt: nowIso() };
      await this.write(next);
      this.drafts.set(next.id, next);
      this.emit({
        type: "renamed",
        draftId: next.id,
        sourcePath: to,
        previousSourcePath: from,
        draft: cloneDraft(next),
      });
    }
  }

  // ─── external sidecar changes ───

  /**
   * Re-read one sidecar after an external vault change (sync, another device,
   * manual edit). Echoes of this store's own writes are dropped. Returns the
   * refreshed draft, or null when the file was malformed/newer/absent.
   */
  async reloadFile(path: string): Promise<RevisionDraft | null> {
    const normalized = normalizePath(path);
    if (this.selfWrites.delete(normalized)) return this.findByPath(normalized);

    const file = this.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      this.forgetFile(normalized);
      return null;
    }
    const draft = await this.ingestFile(file);
    if (!draft) return null;
    this.paths.set(draft.id, normalized);
    this.emit({
      type: "updated",
      draftId: draft.id,
      sourcePath: draft.sourcePath,
      draft: cloneDraft(draft),
    });
    return cloneDraft(draft);
  }

  /** Drop cache state for a sidecar deleted outside the plugin. */
  forgetFile(path: string): void {
    const normalized = normalizePath(path);
    if (this.selfWrites.delete(normalized)) return;
    for (const [id, filePath] of this.paths) {
      if (filePath !== normalized) continue;
      const draft = this.drafts.get(id);
      this.drafts.delete(id);
      this.paths.delete(id);
      this.emit({ type: "deleted", draftId: id, sourcePath: draft?.sourcePath ?? "" });
    }
    for (const [id, entry] of this.unsupported) {
      if (entry.path === normalized) this.unsupported.delete(id);
    }
  }

  private findByPath(path: string): RevisionDraft | null {
    for (const [id, filePath] of this.paths) {
      if (filePath === path) return this.getById(id);
    }
    return null;
  }

  // ─── events ───

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: RevisionStoreEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (err) {
        console.error("Agent Fleet: revision store listener failed", err);
      }
    }
  }

  // ─── disk ───

  private async write(draft: RevisionDraft): Promise<void> {
    const path = this.pathFor(draft.id);
    const content = `${JSON.stringify(draft, null, 2)}\n`;
    const previousPath = this.paths.get(draft.id);
    this.selfWrites.add(path);
    try {
      const existing = this.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        await this.vault.modify(existing, content);
      } else {
        await ensureFolder(this.vault, this.dir());
        await this.vault.create(path, content);
      }
      this.paths.set(draft.id, path);
    } catch (error) {
      // No vault event will arrive to consume this marker, and a failed first
      // write must not make the nonexistent path look durable.
      this.selfWrites.delete(path);
      if (previousPath === undefined) this.paths.delete(draft.id);
      else this.paths.set(draft.id, previousPath);
      throw error;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Parsing and validation — `JSON.parse()` output is never trusted (§8.4).
// ═══════════════════════════════════════════════════════

function asIsoString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function parseAnchor(value: unknown): RevisionAnchor | null {
  if (!isRecord(value)) return null;
  const { from, to, exact, prefix, suffix, exactHash } = value;
  if (typeof from !== "number" || !Number.isFinite(from) || from < 0) return null;
  if (typeof to !== "number" || !Number.isFinite(to) || to <= from) return null;
  if (typeof exact !== "string" || !exact) return null;
  return {
    from: Math.trunc(from),
    to: Math.trunc(to),
    exact,
    prefix: typeof prefix === "string" ? prefix : "",
    suffix: typeof suffix === "string" ? suffix : "",
    exactHash: typeof exactHash === "string" ? exactHash : "",
  };
}

function parseNote(value: unknown, fallbackTimestamp: string): RevisionNote | null {
  if (!isRecord(value)) return null;
  const { id, comment } = value;
  if (typeof id !== "string" || !id.trim()) return null;
  if (typeof comment !== "string") return null;
  const anchor = parseAnchor(value.anchor);
  if (!anchor) return null;
  const createdAt = asIsoString(value.createdAt, fallbackTimestamp);
  const note: RevisionNote = {
    id,
    anchor,
    comment: comment.slice(0, REVISION_LIMITS.commentChars),
    createdAt,
    updatedAt: asIsoString(value.updatedAt, createdAt),
  };
  if (value.orphaned === true) note.orphaned = true;
  return note;
}

function parseDestination(value: unknown): RevisionDestination | undefined {
  if (!isRecord(value)) return undefined;
  const { agentName, conversationId } = value;
  if (typeof agentName !== "string" || !agentName.trim()) return undefined;
  if (typeof conversationId !== "string" || !conversationId.trim()) return undefined;
  return { agentName, conversationId };
}

function parseStatus(value: unknown): RevisionDraftStatus {
  return value === "submitting" || value === "attention" ? value : "collecting";
}

function parsePhase(value: unknown): RevisionSubmissionPhase {
  return value === "running" || value === "verifying" ? value : "queued";
}

function parseSubmission(value: unknown, fallbackTimestamp: string): RevisionSubmissionState | undefined {
  if (!isRecord(value)) return undefined;
  const attemptId = typeof value.attemptId === "string" && value.attemptId.trim() ? value.attemptId : undefined;
  if (!attemptId) return undefined;
  const state: RevisionSubmissionState = {
    attemptId,
    phase: parsePhase(value.phase),
    requestedAt: asIsoString(value.requestedAt, fallbackTimestamp),
    sourceHashBefore: typeof value.sourceHashBefore === "string" ? value.sourceHashBefore : "",
  };
  if (typeof value.startedAt === "string" && value.startedAt.trim()) state.startedAt = value.startedAt;
  if (typeof value.error === "string" && value.error.trim()) state.error = value.error;
  return state;
}

/**
 * Turn untrusted sidecar JSON into a draft. Returns null when the file cannot
 * describe a usable draft — a missing id or source path, or notes that are all
 * unusable garbage, means there is nothing safe to show.
 */
export function parseDraft(raw: unknown, fallbackId: string): RevisionDraft | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== REVISION_SCHEMA_VERSION) return null;

  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : fallbackId;
  if (!id) return null;
  const sourcePathRaw = raw.sourcePath;
  if (typeof sourcePathRaw !== "string" || !sourcePathRaw.trim()) return null;

  const createdAt = asIsoString(raw.createdAt, nowIso());
  const updatedAt = asIsoString(raw.updatedAt, createdAt);
  const rawNotes = Array.isArray(raw.notes) ? raw.notes : [];
  const notes: RevisionNote[] = [];
  const seen = new Set<string>();
  for (const entry of rawNotes) {
    const note = parseNote(entry, createdAt);
    if (!note || seen.has(note.id)) continue;
    seen.add(note.id);
    notes.push(note);
  }
  // Deliberately NOT truncated to `notesPerDraft`. The cap stops a draft from
  // growing without bound; dropping notes that are already on disk would
  // destroy user-authored comments the moment the draft was saved again.
  if (notes.length > REVISION_LIMITS.notesPerDraft) {
    console.warn(
      `Agent Fleet: revision draft ${id} holds ${notes.length} notes, above the ${REVISION_LIMITS.notesPerDraft}-note cap; ` +
        "all notes are kept, but no further notes can be added until some are removed.",
    );
  }

  const draft: RevisionDraft = {
    schemaVersion: REVISION_SCHEMA_VERSION,
    id,
    sourcePath: normalizeSourcePath(sourcePathRaw),
    status: parseStatus(raw.status),
    notes,
    createdAt,
    updatedAt,
  };
  const destination = parseDestination(raw.destination);
  if (destination) draft.destination = destination;
  const submission = parseSubmission(raw.submission, updatedAt);
  if (submission) draft.submission = submission;
  if (typeof raw.attentionMessage === "string" && raw.attentionMessage.trim()) {
    draft.attentionMessage = raw.attentionMessage;
  }
  return draft;
}

/**
 * Validate a caller-supplied draft before it reaches disk. Violations throw
 * with actionable text instead of being silently clamped — quietly dropping a
 * user's note or half of their comment would be worse than a visible error.
 *
 * `maxNotes` defaults to the standard cap; the store raises it for a draft that
 * already exceeds the cap so shrinking edits stay possible.
 */
export function validateDraftForSave(
  draft: RevisionDraft,
  maxNotes: number = REVISION_LIMITS.notesPerDraft,
): RevisionDraft {
  if (!draft.id.trim()) throw new Error("Revision draft is missing an id.");
  const sourcePath = normalizeSourcePath(draft.sourcePath);
  if (!sourcePath) throw new Error("Revision draft is missing a source document path.");
  if (draft.notes.length > maxNotes) {
    throw new Error(
      `A revision draft can hold at most ${REVISION_LIMITS.notesPerDraft} notes (this one has ${draft.notes.length}).`,
    );
  }

  const seen = new Set<string>();
  const notes = draft.notes.map((note) => {
    if (!note.id.trim()) throw new Error("Revision note is missing an id.");
    if (seen.has(note.id)) throw new Error(`Duplicate revision note id ${note.id}.`);
    seen.add(note.id);
    if (note.comment.length > REVISION_LIMITS.commentChars) {
      throw new Error(
        `Revision note comments are capped at ${REVISION_LIMITS.commentChars.toLocaleString()} characters.`,
      );
    }
    const anchor = parseAnchor(note.anchor);
    if (!anchor) throw new Error(`Revision note ${note.id} has an invalid anchor.`);
    if (anchor.exact.length > REVISION_LIMITS.selectionChars) {
      throw new Error(
        `Revision note ${note.id} selects more than ${REVISION_LIMITS.selectionChars.toLocaleString()} characters.`,
      );
    }
    const next: RevisionNote = {
      id: note.id,
      anchor,
      comment: note.comment,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
    if (note.orphaned === true) next.orphaned = true;
    return next;
  });

  const validated: RevisionDraft = {
    schemaVersion: REVISION_SCHEMA_VERSION,
    id: draft.id,
    sourcePath,
    status: draft.status,
    notes,
    createdAt: draft.createdAt,
    updatedAt: nowIso(),
  };
  if (draft.destination) {
    const destination = parseDestination(draft.destination);
    if (!destination) throw new Error("Revision destination needs an agent name and a conversation id.");
    validated.destination = destination;
  }
  if (draft.submission) {
    const submission = parseSubmission(draft.submission, validated.updatedAt);
    if (!submission) throw new Error("Revision submission state needs an attempt id.");
    validated.submission = submission;
  }
  if (draft.attentionMessage?.trim()) validated.attentionMessage = draft.attentionMessage;
  return validated;
}

/** Deep copy — callers may freely mutate what they get back from the store. */
export function cloneDraft(draft: RevisionDraft): RevisionDraft {
  const copy: RevisionDraft = {
    schemaVersion: draft.schemaVersion,
    id: draft.id,
    sourcePath: draft.sourcePath,
    status: draft.status,
    notes: draft.notes.map((note) => {
      const next: RevisionNote = {
        id: note.id,
        anchor: { ...note.anchor },
        comment: note.comment,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      };
      if (note.orphaned === true) next.orphaned = true;
      return next;
    }),
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
  if (draft.destination) copy.destination = { ...draft.destination };
  if (draft.submission) copy.submission = { ...draft.submission };
  if (draft.attentionMessage !== undefined) copy.attentionMessage = draft.attentionMessage;
  return copy;
}
