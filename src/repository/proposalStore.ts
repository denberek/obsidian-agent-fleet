import { TFile, TFolder, normalizePath } from "obsidian";
import type { App, Vault } from "obsidian";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter, slugify } from "../utils/markdown";
import type { SkillConfig, SkillProposal } from "../types";
import { asString, asStringArray, createFileIfMissing, ensureFolder, getAvailablePath, trashPath } from "./shared";

/**
 * Skill proposals (memory → skills, §9): `_fleet/proposals/<id>.md` files.
 * Extracted verbatim from FleetRepository. `applyProposal` needs the live
 * skill index and skills directory, injected as callbacks so the store never
 * holds a stale snapshot.
 */
export class ProposalStore {
  private readonly vault: Vault;

  constructor(
    private readonly app: App,
    private readonly deps: {
      getFleetRoot: () => string;
      getSkillsDir: () => string;
      getSkillByName: (name: string) => SkillConfig | undefined;
    },
  ) {
    this.vault = app.vault;
  }

  getProposalsDir(): string {
    return normalizePath(`${this.deps.getFleetRoot()}/proposals`);
  }

  /** List all proposals, newest first. */
  async listProposals(): Promise<SkillProposal[]> {
    const folder = this.vault.getAbstractFileByPath(this.getProposalsDir());
    if (!(folder instanceof TFolder)) return [];
    const out: SkillProposal[] = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      const p = await this.readProposal(child.basename);
      if (p) out.push(p);
    }
    out.sort((a, b) => b.created.localeCompare(a.created));
    return out;
  }

  async readProposal(id: string): Promise<SkillProposal | null> {
    const path = normalizePath(`${this.getProposalsDir()}/${id}.md`);
    const file = this.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(
      await this.vault.cachedRead(file),
    );
    const type = frontmatter.type === "skill_modify" ? "skill_modify" : "skill_create";
    const status =
      frontmatter.status === "accepted" || frontmatter.status === "rejected"
        ? frontmatter.status
        : "pending";
    return {
      id,
      type,
      agent: asString(frontmatter.agent) ?? "",
      status,
      created: asString(frontmatter.created) ?? "",
      targetSkill: asString(frontmatter.target_skill),
      candidate: asString(frontmatter.candidate),
      evidence: asStringArray(frontmatter.evidence),
      rationale: asString(frontmatter.rationale) ?? "",
      body,
    };
  }

  async writeProposal(p: SkillProposal): Promise<void> {
    await ensureFolder(this.vault, this.getProposalsDir());
    const path = normalizePath(`${this.getProposalsDir()}/${p.id}.md`);
    const fm: Record<string, unknown> = {
      id: p.id,
      type: p.type,
      agent: p.agent,
      status: p.status,
      created: p.created,
      target_skill: p.targetSkill || undefined,
      candidate: p.candidate || undefined,
      evidence: p.evidence.length ? p.evidence : undefined,
      rationale: p.rationale || undefined,
    };
    const content = stringifyMarkdownWithFrontmatter(fm, p.body || "");
    const file = this.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.vault.modify(file, content);
    else await createFileIfMissing(this.vault, path, content);
  }

  async setProposalStatus(id: string, status: SkillProposal["status"]): Promise<void> {
    const p = await this.readProposal(id);
    if (!p) return;
    p.status = status;
    await this.writeProposal(p);
  }

  /** Apply an accepted proposal: create the new skill (skill_create) or append
   *  the proposed change to the target skill (skill_modify). Returns the path of
   *  the affected skill, or null on no-op. */
  async applyProposal(p: SkillProposal): Promise<string | null> {
    if (p.type === "skill_create") {
      const name = p.targetSkill || `learned-${slugify(p.rationale).slice(0, 24) || "skill"}`;
      const path = await getAvailablePath(this.vault, this.deps.getSkillsDir(), slugify(name));
      // Use the actual (de-duplicated) filename as the skill name so two
      // proposals for the same pattern can't mint colliding skill names —
      // getAvailablePath only de-dupes the file path, not the frontmatter name.
      const finalName = path.split("/").pop()?.replace(/\.md$/, "") || slugify(name);
      const fm = {
        name: finalName,
        description: p.rationale || `Auto-proposed from recurring pattern for ${p.agent}.`,
        tags: ["proposed"],
      };
      await this.vault.create(path, stringifyMarkdownWithFrontmatter(fm, p.body || "Skill instructions go here."));
      return path;
    }
    // skill_modify: append the proposed change to the target skill as an addendum.
    if (p.targetSkill) {
      const skill = this.deps.getSkillByName(p.targetSkill);
      if (skill) {
        const file = this.vault.getAbstractFileByPath(skill.filePath);
        if (file instanceof TFile) {
          const existing = await this.vault.cachedRead(file);
          const addendum = `\n\n## Proposed update (${new Date().toISOString().slice(0, 10)})\n${p.body}`;
          await this.vault.modify(file, `${existing.trimEnd()}${addendum}\n`);
          return skill.filePath;
        }
      }
    }
    return null;
  }

  async deleteProposal(id: string): Promise<void> {
    await trashPath(this.app, normalizePath(`${this.getProposalsDir()}/${id}.md`));
  }
}
