import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

// memoryStore references FileSystemAdapter at runtime (instanceof); the shared
// obsidian stub lacks it — extend it here, mirroring fleetRepository.test.ts.
vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    App: class App {},
    FileSystemAdapter: class FileSystemAdapter {},
  };
});

import { MEMORY_SCHEMA_VERSION, emptyWorkingMemory } from "../utils/memoryFormat";
import { MemoryStore } from "./memoryStore";
import { FakeVault, makeApp } from "./testSupport";

const WORKING = "_fleet/memory/bot/working.md";

describe("MemoryStore working-memory schema guard", () => {
  let vault: FakeVault;
  let store: MemoryStore;
  let warnSpy: MockInstance;

  beforeEach(() => {
    vault = new FakeVault();
    store = new MemoryStore(makeApp(vault), () => "_fleet/memory");
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a current-schema working.md normally", async () => {
    vault.addFile(
      WORKING,
      `---\nagent: bot\nschema: ${MEMORY_SCHEMA_VERSION}\n---\n\n## Observations\n- knows things\n`,
    );
    const wm = await store.readWorkingMemory("bot");
    expect(wm?.schema).toBe(MEMORY_SCHEMA_VERSION);
    expect(wm?.sections[0]?.entries[0]?.text).toBe("knows things");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("treats a missing schema field as current (pre-schema files keep working)", async () => {
    vault.addFile(WORKING, "---\nagent: bot\n---\n\n## Observations\n- old fact\n");
    const wm = await store.readWorkingMemory("bot");
    expect(wm?.schema).toBe(MEMORY_SCHEMA_VERSION);
    expect(wm?.sections[0]?.entries[0]?.text).toBe("old fact");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("keeps parsing an OLDER-but-known numeric schema (current behavior)", async () => {
    vault.addFile(WORKING, "---\nagent: bot\nschema: 1\n---\n\n## Observations\n- v1 fact\n");
    const wm = await store.readWorkingMemory("bot");
    expect(wm?.schema).toBe(1);
    expect(wm?.sections[0]?.entries[0]?.text).toBe("v1 fact");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns and returns null on a NEWER schema instead of misparsing it", async () => {
    vault.addFile(
      WORKING,
      `---\nagent: bot\nschema: ${MEMORY_SCHEMA_VERSION + 1}\n---\n\n## Observations\n- future fact\n`,
    );
    expect(await store.readWorkingMemory("bot")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    // getMemory (the back-compat shim) inherits the guard.
    expect(await store.getMemory("bot")).toBeNull();
  });

  it("warns and returns null on a non-numeric schema marker", async () => {
    vault.addFile(WORKING, "---\nagent: bot\nschema: v9-beta\n---\n\n## Observations\n- weird\n");
    expect(await store.readWorkingMemory("bot")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("refuses to overwrite a newer-schema working.md (never destroys data)", async () => {
    const newer =
      `---\nagent: bot\nschema: ${MEMORY_SCHEMA_VERSION + 1}\n---\n\n## Observations\n- future fact\n`;
    vault.addFile(WORKING, newer);

    // Simulate the capture path after the read guard fired: read → null →
    // rebuild from scratch → write. The write must be a warned no-op.
    const rebuilt = emptyWorkingMemory(WORKING, "bot");
    await store.writeWorkingMemory("bot", rebuilt);

    expect(vault.contents.get(WORKING)).toBe(newer);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("still writes normally over a current-schema file", async () => {
    vault.addFile(
      WORKING,
      `---\nagent: bot\nschema: ${MEMORY_SCHEMA_VERSION}\n---\n\n## Observations\n- old\n`,
    );
    const wm = await store.readWorkingMemory("bot");
    expect(wm).not.toBeNull();
    await store.writeWorkingMemory("bot", {
      ...wm!,
      sections: [{ name: "Observations", entries: [{ text: "new fact", pinned: false }] }],
    });
    expect(vault.contents.get(WORKING)).toContain("new fact");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
