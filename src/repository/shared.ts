import { TFile, TFolder, normalizePath } from "obsidian";
import type { App, Vault } from "obsidian";

// ═══════════════════════════════════════════════════════
//  Frontmatter coercion helpers — shared by the FleetRepository facade's
//  entity parsers and the extracted stores. All are tolerant: bad shapes
//  coerce to a safe fallback instead of throwing.
// ═══════════════════════════════════════════════════════

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Coerce a frontmatter value into a `Record<string,string>`, dropping any
 *  non-string values. Returns undefined when there's nothing usable so callers
 *  can omit the field entirely. */
export function asStringMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ═══════════════════════════════════════════════════════
//  Vault helpers — tolerant create/trash/list primitives shared by the
//  facade and the stores.
// ═══════════════════════════════════════════════════════

/** Create a folder if it doesn't exist; tolerate a concurrent create. */
export async function ensureFolder(vault: Vault, path: string): Promise<void> {
  if (vault.getAbstractFileByPath(path)) {
    return;
  }
  try {
    await vault.createFolder(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Folder already exists")) {
      throw error;
    }
  }
}

/** Create a file only when absent; tolerate a concurrent create. */
export async function createFileIfMissing(vault: Vault, path: string, content: string): Promise<void> {
  if (vault.getAbstractFileByPath(path)) {
    return;
  }
  try {
    await vault.create(path, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("File already exists")) {
      throw error;
    }
  }
}

/** Trash the file/folder at `path` if it exists (no-op otherwise). */
export async function trashPath(app: App, path: string): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (file) {
    await app.fileManager.trashFile(file);
  }
}

/** Recursively collect every markdown TFile under `folder` into `acc`. */
export function collectMarkdownChildren(folder: TFolder, acc: TFile[]): void {
  for (const child of folder.children) {
    if (child instanceof TFile && child.extension === "md") {
      acc.push(child);
    }
    if (child instanceof TFolder) {
      collectMarkdownChildren(child, acc);
    }
  }
}

/** First free `<folder>/<baseName>[-N].md` path (N starts at 2). */
export async function getAvailablePath(vault: Vault, folder: string, baseName: string): Promise<string> {
  let attempt = 0;
  while (true) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const candidate = normalizePath(`${folder}/${baseName}${suffix}.md`);
    if (!vault.getAbstractFileByPath(candidate)) {
      return candidate;
    }
    attempt += 1;
  }
}
