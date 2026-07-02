import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The shared obsidian stub lacks App/FileSystemAdapter (fleetRepository
// references FileSystemAdapter at runtime via instanceof); extend it here.
// Its parseYaml also lacks inline-list support (`skills: [s1]`), which the
// reference-validation tests need — bolt on a minimal `[a, b]` parser.
vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const baseParseYaml = actual.parseYaml as (input: string) => Record<string, unknown>;
  return {
    ...actual,
    App: class App {},
    FileSystemAdapter: class FileSystemAdapter {},
    parseYaml: (input: string): Record<string, unknown> => {
      const out = baseParseYaml(input);
      for (const [key, value] of Object.entries(out)) {
        if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
          const inner = value.slice(1, -1).trim();
          out[key] = inner
            ? inner.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
            : [];
        }
      }
      return out;
    },
  };
});

import type { App } from "obsidian";
import { TFile, TFolder } from "obsidian";
import { DEFAULT_SETTINGS } from "./constants";
import { FleetRepository } from "./fleetRepository";

/** Minimal in-memory vault: enough surface for the repository paths under test. */
class FakeVault {
  files = new Map<string, TFile>();
  contents = new Map<string, string>();
  folders = new Map<string, TFolder>();
  cachedReadCalls = 0;
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
    this.cachedReadCalls++;
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

function makeApp(vault: FakeVault): App {
  return {
    vault,
    fileManager: {
      trashFile: async (file: TFile | TFolder) => {
        vault.removeTree(file.path);
      },
    },
  } as unknown as App;
}

describe("FleetRepository", () => {
  let vault: FakeVault;
  let repo: FleetRepository;

  beforeEach(() => {
    vault = new FakeVault();
    repo = new FleetRepository(makeApp(vault), { ...DEFAULT_SETTINGS });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("name-keyed lookups", () => {
    it("reflects loads, removals, and reloads (index never goes stale)", async () => {
      vault.addFile("_fleet/agents/foo.md", "---\nname: foo\nmodel: sonnet\n---\n\nBody\n");
      vault.addFile("_fleet/tasks/t1.md", "---\ntask_id: t1\nagent: foo\ntype: immediate\n---\n\nDo it\n");
      vault.addFile("_fleet/skills/s1.md", "---\nname: s1\n---\n\nSkill\n");

      await repo.loadFile("_fleet/agents/foo.md");
      await repo.loadFile("_fleet/tasks/t1.md");
      await repo.loadFile("_fleet/skills/s1.md");

      expect(repo.getAgentByName("foo")?.filePath).toBe("_fleet/agents/foo.md");
      expect(repo.getTaskById("t1")?.filePath).toBe("_fleet/tasks/t1.md");
      expect(repo.getSkillByName("s1")?.filePath).toBe("_fleet/skills/s1.md");

      repo.removeFile("_fleet/agents/foo.md");
      expect(repo.getAgentByName("foo")).toBeUndefined();

      await repo.loadFile("_fleet/agents/foo.md");
      expect(repo.getAgentByName("foo")).toBeDefined();
    });

    it("keeps the first entity when names collide (linear-scan parity)", async () => {
      vault.addFile("_fleet/agents/a1.md", "---\nname: dup\nmodel: sonnet\n---\n\nA\n");
      vault.addFile("_fleet/agents/a2.md", "---\nname: dup\nmodel: sonnet\n---\n\nB\n");
      await repo.loadFile("_fleet/agents/a1.md");
      await repo.loadFile("_fleet/agents/a2.md");
      expect(repo.getAgentByName("dup")?.filePath).toBe("_fleet/agents/a1.md");
    });
  });

  describe("corrupt permissions.json", () => {
    it("loads the folder agent, logs an error, and records a validation issue", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vault.addFile("_fleet/agents/bot/agent.md", "---\nname: bot\n---\n\nPrompt\n");
      vault.addFile("_fleet/agents/bot/permissions.json", "{not json");

      await repo.loadAll();

      const agent = repo.getAgentByName("bot");
      expect(agent).toBeDefined();
      expect(agent?.permissionRules).toEqual({ allow: [], deny: [] });
      expect(errorSpy).toHaveBeenCalled();

      const issues = repo
        .getSnapshot()
        .validationIssues.filter((i) => i.path === "_fleet/agents/bot/permissions.json");
      // Exactly one, even though loadAll also reloads the folder agent via
      // loadFile(agent.md) — the stale issue is cleared before re-parsing.
      expect(issues).toHaveLength(1);
    });
  });

  describe("migrateLegacyMemory", () => {
    const legacyPath = "_fleet/memory/bot.md";
    const workingPath = "_fleet/memory/bot/working.md";

    it("lets concurrent callers await the same in-flight migration", async () => {
      vault.addFile(legacyPath, "---\nagent: bot\n---\n\n## Learned Context\n\n- fact one\n- fact two\n");

      let secondSawWorking = false;
      const first = repo.migrateLegacyMemory("bot");
      const second = repo.migrateLegacyMemory("bot").then(() => {
        secondSawWorking = vault.getAbstractFileByPath(workingPath) !== null;
      });
      await Promise.all([first, second]);

      // The second caller must resolve only after the migration completed.
      expect(secondSawWorking).toBe(true);
      expect(vault.getAbstractFileByPath(workingPath)).toBeInstanceOf(TFile);
      expect(vault.getAbstractFileByPath(legacyPath)).toBeNull();

      const day = new Date().toISOString().slice(0, 10);
      const raw = vault.contents.get(`_fleet/memory/bot/raw/${day}.md`) ?? "";
      expect(raw.match(/\[migrated\] Imported/g)).toHaveLength(1);

      // A later call is a no-op — no double seeding.
      await repo.migrateLegacyMemory("bot");
      const rawAfter = vault.contents.get(`_fleet/memory/bot/raw/${day}.md`) ?? "";
      expect(rawAfter).toBe(raw);
    });
  });

  describe("readRunLog cache", () => {
    it("returns the cached parse until mtime changes", async () => {
      const file = vault.addFile(
        "_fleet/runs/2026-07-01/000000-a-t.md",
        "---\nrun_id: r1\nagent: a\ntask: t\nstatus: success\nstarted: 2026-07-01T00:00:00Z\n---\n\n## Prompt\n\nhi\n\n## Output\n\nok\n",
      );

      const first = await repo.readRunLog(file);
      expect(first?.status).toBe("success");
      const readsAfterFirst = vault.cachedReadCalls;

      const second = await repo.readRunLog(file);
      expect(second).toBe(first); // cached object, no re-read
      expect(vault.cachedReadCalls).toBe(readsAfterFirst);

      // Modifying the file bumps mtime → cache invalidates.
      vault.addFile(
        file.path,
        "---\nrun_id: r1\nagent: a\ntask: t\nstatus: failure\nstarted: 2026-07-01T00:00:00Z\n---\n\n## Prompt\n\nhi\n\n## Output\n\nboom\n",
      );
      const third = await repo.readRunLog(file);
      expect(third?.status).toBe("failure");
      expect(vault.cachedReadCalls).toBe(readsAfterFirst + 1);
    });
  });

  describe("reference validation re-runs after mutations", () => {
    it("flags an agent's dangling skill reference immediately after deleteSkill", async () => {
      vault.addFile("_fleet/agents/foo.md", "---\nname: foo\nmodel: sonnet\nskills: [s1]\n---\n\nBody\n");
      vault.addFile("_fleet/skills/s1.md", "---\nname: s1\n---\n\nSkill\n");
      await repo.loadAll();
      expect(repo.getSnapshot().validationIssues).toHaveLength(0);

      await repo.deleteSkill("s1");

      // No loadAll() in between — the issue must appear from the delete alone.
      const issues = repo.getSnapshot().validationIssues;
      expect(
        issues.some(
          (i) => i.path === "_fleet/agents/foo.md" && i.message.includes("missing skill `s1`"),
        ),
      ).toBe(true);
      expect(repo.getSkillByName("s1")).toBeUndefined();
    });

    it("flags a task's dangling agent reference immediately after deleteAgent", async () => {
      vault.addFile("_fleet/agents/foo.md", "---\nname: foo\nmodel: sonnet\n---\n\nBody\n");
      vault.addFile("_fleet/tasks/t1.md", "---\ntask_id: t1\nagent: foo\ntype: immediate\n---\n\nDo\n");
      await repo.loadAll();
      expect(repo.getSnapshot().validationIssues).toHaveLength(0);

      await repo.deleteAgent("foo", false);

      expect(
        repo.getSnapshot().validationIssues.some(
          (i) => i.path === "_fleet/tasks/t1.md" && i.message.includes("missing agent `foo`"),
        ),
      ).toBe(true);
    });

    it("clears a dangling-skill issue as soon as the skill is created", async () => {
      vault.addFile("_fleet/agents/foo.md", "---\nname: foo\nmodel: sonnet\nskills: [s1]\n---\n\nBody\n");
      await repo.loadAll();
      expect(
        repo.getSnapshot().validationIssues.some((i) => i.message.includes("missing skill `s1`")),
      ).toBe(true);

      await repo.createSkillTemplate("s1");

      expect(
        repo.getSnapshot().validationIssues.some((i) => i.message.includes("missing skill `s1`")),
      ).toBe(false);
    });

    it("re-running validation neither duplicates reference issues nor clears load-time corrupt-file issues", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      // Load-time issue: corrupt permissions.json on a folder agent.
      vault.addFile("_fleet/agents/bot/agent.md", "---\nname: bot\n---\n\nPrompt\n");
      vault.addFile("_fleet/agents/bot/permissions.json", "{not json");
      // Reference issue: task pointing at a missing agent.
      vault.addFile("_fleet/tasks/t1.md", "---\ntask_id: t1\nagent: ghost\ntype: immediate\n---\n\nDo\n");
      await repo.loadAll();

      const count = (issues: Array<{ path: string; message: string }>) => ({
        corrupt: issues.filter((i) => i.path === "_fleet/agents/bot/permissions.json").length,
        dangling: issues.filter((i) => i.message.includes("missing agent `ghost`")).length,
      });
      expect(count(repo.getSnapshot().validationIssues)).toEqual({ corrupt: 1, dangling: 1 });

      // Two mutations, each re-running validation.
      await repo.updateTask("t1", { priority: "high" });
      await repo.updateHeartbeat("bot", { enabled: false });

      expect(count(repo.getSnapshot().validationIssues)).toEqual({ corrupt: 1, dangling: 1 });
    });
  });

  describe("fail-soft reads warn instead of staying silent", () => {
    it("readCandidates returns [] and warns on corrupt JSON", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vault.addFile("_fleet/memory/bot/candidates.json", "{oops");
      expect(await repo.readCandidates("bot")).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
