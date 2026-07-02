/**
 * Test-only fakes for the repository store tests. NOT imported by production
 * code (esbuild never bundles it). Mirrors the FakeVault pattern used in
 * src/fleetRepository.test.ts against the `test-support/obsidian.ts` stub.
 */
import type { App } from "obsidian";
import { TFile, TFolder } from "obsidian";

/** Minimal in-memory vault: enough surface for the store paths under test. */
export class FakeVault {
  files = new Map<string, TFile>();
  contents = new Map<string, string>();
  folders = new Map<string, TFolder>();
  private clock = 1;

  addFile(path: string, content: string): TFile {
    const existing = this.files.get(path);
    if (existing) {
      this.contents.set(path, content);
      existing.stat.mtime = this.clock++;
      existing.stat.size = content.length;
      return existing;
    }
    const file = new TFile();
    file.path = path;
    const base = path.split("/").pop() ?? "";
    file.basename = base.replace(/\.[^.]+$/, "");
    file.extension = base.split(".").pop() ?? "";
    file.stat = { ctime: this.clock, mtime: this.clock++, size: content.length };
    this.files.set(path, file);
    this.contents.set(path, content);
    this.ensureFolderChain(path.slice(0, path.lastIndexOf("/")));
    return file;
  }

  private ensureFolderChain(path: string): void {
    if (!path || this.folders.has(path)) return;
    const folder = new TFolder();
    folder.path = path;
    this.folders.set(path, folder);
    const parent = path.slice(0, path.lastIndexOf("/"));
    if (parent) this.ensureFolderChain(parent);
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    const file = this.files.get(path);
    if (file) return file;
    const folder = this.folders.get(path);
    if (!folder) return null;
    const children: Array<TFile | TFolder> = [];
    for (const candidate of [...this.folders.values(), ...this.files.values()]) {
      if (!candidate.path.startsWith(`${path}/`)) continue;
      if (candidate.path.slice(path.length + 1).includes("/")) continue;
      children.push(candidate);
    }
    folder.children = children;
    return folder;
  }

  async cachedRead(file: TFile): Promise<string> {
    const content = this.contents.get(file.path);
    if (content === undefined) throw new Error(`no such file: ${file.path}`);
    return content;
  }

  async create(path: string, content: string): Promise<TFile> {
    if (this.files.has(path)) throw new Error("File already exists");
    return this.addFile(path, content);
  }

  async createFolder(path: string): Promise<void> {
    if (this.folders.has(path)) throw new Error("Folder already exists");
    this.ensureFolderChain(path);
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.addFile(file.path, content);
  }

  getMarkdownFiles(): TFile[] {
    return [...this.files.values()].filter((f) => f.extension === "md");
  }

  removeTree(path: string): void {
    this.files.delete(path);
    this.contents.delete(path);
    this.folders.delete(path);
    for (const p of [...this.files.keys()]) {
      if (p.startsWith(`${path}/`)) {
        this.files.delete(p);
        this.contents.delete(p);
      }
    }
    for (const p of [...this.folders.keys()]) {
      if (p.startsWith(`${path}/`)) this.folders.delete(p);
    }
  }
}

export function makeApp(vault: FakeVault): App {
  return {
    vault,
    fileManager: {
      trashFile: async (file: TFile | TFolder) => {
        vault.removeTree(file.path);
      },
    },
  } as unknown as App;
}
