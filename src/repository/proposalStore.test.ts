import { beforeEach, describe, expect, it } from "vitest";
import type { SkillConfig, SkillProposal } from "../types";
import { ProposalStore } from "./proposalStore";
import { FakeVault, makeApp } from "./testSupport";

function proposal(overrides: Partial<SkillProposal>): SkillProposal {
  return {
    id: "p1",
    type: "skill_create",
    agent: "bot",
    status: "pending",
    created: "2026-07-01T00:00:00Z",
    evidence: [],
    rationale: "recurring pattern",
    body: "Do the thing.",
    ...overrides,
  };
}

describe("ProposalStore", () => {
  let vault: FakeVault;
  let skills: Map<string, SkillConfig>;
  let store: ProposalStore;

  beforeEach(() => {
    vault = new FakeVault();
    skills = new Map();
    store = new ProposalStore(makeApp(vault), {
      getFleetRoot: () => "_fleet",
      getSkillsDir: () => "_fleet/skills",
      getSkillByName: (name) => skills.get(name),
    });
  });

  it("write → read → setStatus round-trips through the proposal file", async () => {
    await store.writeProposal(proposal({ id: "p1" }));
    expect(vault.files.has("_fleet/proposals/p1.md")).toBe(true);

    const read = await store.readProposal("p1");
    expect(read?.status).toBe("pending");
    expect(read?.agent).toBe("bot");

    await store.setProposalStatus("p1", "accepted");
    expect((await store.readProposal("p1"))?.status).toBe("accepted");
  });

  it("applyProposal (skill_create) uses the de-duplicated filename as the skill name", async () => {
    vault.addFile("_fleet/skills/my-skill.md", "---\nname: my-skill\n---\n\nExisting\n");

    const path = await store.applyProposal(proposal({ targetSkill: "My Skill" }));

    expect(path).toBe("_fleet/skills/my-skill-2.md");
    // Frontmatter name matches the de-duplicated file name, not the original.
    expect(vault.contents.get(path ?? "")).toContain("name: my-skill-2");
  });

  it("applyProposal (skill_modify) appends an addendum to the target skill", async () => {
    const file = vault.addFile("_fleet/skills/target.md", "---\nname: target\n---\n\nOriginal body\n");
    skills.set("target", {
      filePath: file.path,
      name: "target",
      tags: [],
      body: "Original body",
      toolsBody: "",
      referencesBody: "",
      examplesBody: "",
      isFolder: false,
    });

    const path = await store.applyProposal(
      proposal({ type: "skill_modify", targetSkill: "target", body: "New guidance." }),
    );

    expect(path).toBe("_fleet/skills/target.md");
    const content = vault.contents.get("_fleet/skills/target.md") ?? "";
    expect(content).toContain("Original body");
    expect(content).toContain("## Proposed update");
    expect(content).toContain("New guidance.");
  });

  it("applyProposal (skill_modify) is a no-op when the target skill is missing", async () => {
    expect(await store.applyProposal(proposal({ type: "skill_modify", targetSkill: "ghost" }))).toBeNull();
  });

  it("deleteProposal trashes the file; listProposals sorts newest first", async () => {
    await store.writeProposal(proposal({ id: "old", created: "2026-01-01T00:00:00Z" }));
    await store.writeProposal(proposal({ id: "new", created: "2026-07-01T00:00:00Z" }));

    const list = await store.listProposals();
    expect(list.map((p) => p.id)).toEqual(["new", "old"]);

    await store.deleteProposal("old");
    expect(await store.readProposal("old")).toBeNull();
    expect((await store.listProposals()).map((p) => p.id)).toEqual(["new"]);
  });
});
