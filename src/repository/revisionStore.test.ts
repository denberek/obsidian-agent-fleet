import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import type { RevisionDraft, RevisionNote } from "../types";
import { createAnchor } from "../utils/revisionAnchors";
import {
  REVISION_INTERRUPTED_MESSAGE,
  REVISION_SCHEMA_VERSION,
  RevisionStore,
  type RevisionStoreEvent,
} from "./revisionStore";
import { FakeVault, makeApp } from "./testSupport";

const DIR = "_fleet/revisions";
const SOURCE = "notes/launch-brief.md";
const DOC = "# Launch brief\n\nMost agent tools begin with a chat box.\n\nThis release changes that.\n";

function note(overrides: Partial<RevisionNote> = {}): RevisionNote {
  const anchor = createAnchor(DOC, DOC.indexOf("Most"), DOC.indexOf("Most") + 38);
  return {
    id: "note-1",
    anchor,
    comment: "Name the failure mode.",
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    ...overrides,
  };
}

/** A sidecar exactly as the store writes them, for seeding the fake vault. */
function sidecar(overrides: Partial<RevisionDraft> = {}): RevisionDraft {
  return {
    schemaVersion: REVISION_SCHEMA_VERSION,
    id: "draft-a",
    sourcePath: SOURCE,
    status: "collecting",
    notes: [note()],
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    ...overrides,
  };
}

function seed(vault: FakeVault, draft: RevisionDraft, fileName = `${draft.id}.json`): string {
  const path = `${DIR}/${fileName}`;
  vault.addFile(path, `${JSON.stringify(draft, null, 2)}\n`);
  return path;
}

describe("RevisionStore", () => {
  let vault: FakeVault;
  let store: RevisionStore;
  let events: RevisionStoreEvent[];

  beforeEach(() => {
    vault = new FakeVault();
    store = new RevisionStore(makeApp(vault), () => DIR);
    events = [];
    store.subscribe((event) => events.push(event));
  });

  // ─── round trip ───

  it("round-trips create, get, list, update, and delete", async () => {
    const created = await store.create(SOURCE);
    expect(created.schemaVersion).toBe(REVISION_SCHEMA_VERSION);
    expect(created.status).toBe("collecting");
    expect(created.notes).toEqual([]);
    expect(vault.files.has(`${DIR}/${created.id}.json`)).toBe(true);

    expect(store.getById(created.id)?.sourcePath).toBe(SOURCE);
    expect(store.getBySourcePath(SOURCE)?.id).toBe(created.id);
    expect(store.list().map((d) => d.id)).toEqual([created.id]);

    await store.save({ ...created, notes: [note()], destination: { agentName: "writer", conversationId: "c-1" } });
    const updated = store.getById(created.id);
    expect(updated?.notes).toHaveLength(1);
    expect(updated?.destination).toEqual({ agentName: "writer", conversationId: "c-1" });

    const onDisk: unknown = JSON.parse(vault.contents.get(`${DIR}/${created.id}.json`) ?? "{}");
    expect(onDisk).toMatchObject({ id: created.id, sourcePath: SOURCE });

    await store.delete(created.id);
    expect(store.getById(created.id)).toBeNull();
    expect(store.getBySourcePath(SOURCE)).toBeNull();
    expect(store.list()).toEqual([]);
    expect(vault.files.has(`${DIR}/${created.id}.json`)).toBe(false);

    expect(events.map((e) => e.type)).toEqual(["created", "updated", "deleted"]);
  });

  it("does not cache a ghost draft when its first sidecar write fails", async () => {
    const create = vi.spyOn(vault, "create").mockRejectedValueOnce(new Error("disk full"));

    await expect(store.create(SOURCE)).rejects.toThrow("disk full");
    expect(store.getBySourcePath(SOURCE)).toBeNull();
    expect(store.list()).toEqual([]);
    expect(events).toEqual([]);

    create.mockRestore();
    await expect(store.create(SOURCE)).resolves.toMatchObject({ sourcePath: SOURCE });
  });

  it("keeps the last durable cache value when an update write fails", async () => {
    const created = await store.create(SOURCE);
    events.length = 0;
    vi.spyOn(vault, "modify").mockRejectedValueOnce(new Error("write denied"));

    await expect(store.save({ ...created, notes: [note()] })).rejects.toThrow("write denied");
    expect(store.getById(created.id)?.notes).toEqual([]);
    expect(events).toEqual([]);
    const onDisk = JSON.parse(vault.contents.get(`${DIR}/${created.id}.json`) ?? "{}") as RevisionDraft;
    expect(onDisk.notes).toEqual([]);
  });

  it("survives a full reload from disk", async () => {
    const created = await store.create(SOURCE);
    await store.save({ ...created, notes: [note()] });

    const reopened = new RevisionStore(makeApp(vault), () => DIR);
    await reopened.loadAll();

    const loaded = reopened.getById(created.id);
    expect(loaded?.sourcePath).toBe(SOURCE);
    expect(loaded?.notes[0]?.comment).toBe("Name the failure mode.");
    expect(loaded?.notes[0]?.anchor.exactHash).toBe(note().anchor.exactHash);
  });

  it("reports whether an initial load has happened", async () => {
    expect(store.isLoaded()).toBe(false);
    await store.loadAll();
    expect(store.isLoaded()).toBe(true);
  });

  it("loads cleanly when the revisions folder does not exist yet", async () => {
    await expect(store.loadAll()).resolves.toBeUndefined();
    expect(store.list()).toEqual([]);
  });

  // ─── one draft per source path ───

  it("keeps one draft per source path — create returns the existing draft", async () => {
    const first = await store.create(SOURCE);
    const second = await store.create(SOURCE);

    expect(second.id).toBe(first.id);
    expect(store.list()).toHaveLength(1);
    expect([...vault.files.keys()].filter((p) => p.startsWith(DIR))).toHaveLength(1);
    expect(events.filter((e) => e.type === "created")).toHaveLength(1);
  });

  it("shares an in-flight first write across concurrent create calls", async () => {
    const realCreate = vault.create.bind(vault);
    let release: (() => void) | null = null;
    const create = vi.spyOn(vault, "create").mockImplementation(
      (path, content) =>
        new Promise<TFile>((resolve, reject) => {
          release = () => void realCreate(path, content).then(resolve, reject);
        }),
    );

    const first = store.create(SOURCE);
    const second = store.create(SOURCE);
    for (let i = 0; i < 4 && !release; i++) await Promise.resolve();
    expect(create).toHaveBeenCalledTimes(1);
    (release as (() => void) | null)?.();

    const [a, b] = await Promise.all([first, second]);
    expect(a.id).toBe(b.id);
    expect(store.list()).toHaveLength(1);
  });

  it("matches source paths after normalization", async () => {
    const created = await store.create("/notes//launch-brief.md");
    expect(created.sourcePath).toBe(SOURCE);
    expect(store.getBySourcePath(SOURCE)?.id).toBe(created.id);
    expect(store.getBySourcePath("/notes//launch-brief.md")?.id).toBe(created.id);
  });

  it("rejects a draft with no source path", async () => {
    await expect(store.create("   ")).rejects.toThrow(/source document path/i);
  });

  it("prefers the most recently updated draft when a path somehow has two", async () => {
    seed(vault, sidecar({ id: "older", updatedAt: "2026-08-16T10:00:00.000Z" }));
    seed(vault, sidecar({ id: "newer", updatedAt: "2026-08-16T12:00:00.000Z" }));
    await store.loadAll();

    expect(store.getBySourcePath(SOURCE)?.id).toBe("newer");
    // The loser stays on disk untouched rather than being silently deleted.
    expect(store.list().map((d) => d.id)).toEqual(["newer", "older"]);
    expect(vault.files.has(`${DIR}/older.json`)).toBe(true);
  });

  // ─── rename ───

  it("follows a source rename without renaming the sidecar", async () => {
    const created = await store.create(SOURCE);
    events.length = 0;

    await store.renameSource(SOURCE, "archive/launch-brief.md");

    expect(store.getBySourcePath(SOURCE)).toBeNull();
    expect(store.getBySourcePath("archive/launch-brief.md")?.id).toBe(created.id);
    expect(vault.files.has(`${DIR}/${created.id}.json`)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "renamed",
      draftId: created.id,
      sourcePath: "archive/launch-brief.md",
      previousSourcePath: SOURCE,
    });

    const onDisk = JSON.parse(vault.contents.get(`${DIR}/${created.id}.json`) ?? "{}") as RevisionDraft;
    expect(onDisk.sourcePath).toBe("archive/launch-brief.md");
  });

  it("keeps the prior source path when a rename write fails", async () => {
    await store.create(SOURCE);
    events.length = 0;
    vi.spyOn(vault, "modify").mockRejectedValueOnce(new Error("write denied"));

    await expect(store.renameSource(SOURCE, "archive/launch-brief.md")).rejects.toThrow(
      "write denied",
    );
    expect(store.getBySourcePath(SOURCE)).not.toBeNull();
    expect(store.getBySourcePath("archive/launch-brief.md")).toBeNull();
    expect(events).toEqual([]);
  });

  it("ignores a rename that matches no draft, or that goes nowhere", async () => {
    await store.create(SOURCE);
    events.length = 0;

    await store.renameSource("other/doc.md", "other/renamed.md");
    await store.renameSource(SOURCE, SOURCE);

    expect(events).toEqual([]);
  });

  // ─── malformed and newer schemas ───

  it("skips malformed sidecars without blocking the rest of the load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vault.addFile(`${DIR}/broken.json`, "{not json");
    vault.addFile(`${DIR}/empty-object.json`, "{}");
    vault.addFile(`${DIR}/wrong-type.json`, JSON.stringify({ schemaVersion: 1, id: "x", sourcePath: 42 }));
    vault.addFile(`${DIR}/notes.md`, "not a sidecar at all");
    seed(vault, sidecar({ id: "good" }));

    await store.loadAll();

    expect(store.list().map((d) => d.id)).toEqual(["good"]);
    expect(warn).toHaveBeenCalled();
    // Nothing malformed is rewritten or removed.
    expect(vault.contents.get(`${DIR}/broken.json`)).toBe("{not json");
    expect(vault.files.has(`${DIR}/empty-object.json`)).toBe(true);
    warn.mockRestore();
  });

  it("drops individually invalid notes but keeps the rest of the draft", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    seed(
      vault,
      sidecar({
        notes: [
          note({ id: "keep" }),
          { ...note({ id: "no-anchor" }), anchor: undefined } as unknown as RevisionNote,
          { ...note({ id: "" }) },
          note({ id: "keep" }),
        ],
      }),
    );

    await store.loadAll();

    expect(store.getById("draft-a")?.notes.map((n) => n.id)).toEqual(["keep"]);
    warn.mockRestore();
  });

  it("surfaces a newer schema read-only and never rewrites it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = JSON.stringify({ schemaVersion: 99, id: "future", sourcePath: SOURCE, notes: [] }, null, 2);
    vault.addFile(`${DIR}/future.json`, raw);

    await store.loadAll();

    expect(store.list()).toEqual([]);
    expect(store.getById("future")).toBeNull();
    expect(store.listUnsupported()).toEqual([
      { id: "future", path: `${DIR}/future.json`, schemaVersion: 99, sourcePath: SOURCE },
    ]);
    expect(vault.contents.get(`${DIR}/future.json`)).toBe(raw);

    // Neither creating nor saving may clobber it.
    await expect(store.create(SOURCE)).rejects.toThrow(/newer version/i);
    await expect(store.save(sidecar({ id: "future" }))).rejects.toThrow(/read-only/i);
    expect(vault.contents.get(`${DIR}/future.json`)).toBe(raw);
    warn.mockRestore();
  });

  it("lets the user remove an unsupported sidecar explicitly", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vault.addFile(`${DIR}/future.json`, JSON.stringify({ schemaVersion: 99, id: "future", sourcePath: SOURCE }));
    await store.loadAll();
    events.length = 0;

    await store.delete("future");

    expect(store.listUnsupported()).toEqual([]);
    expect(vault.files.has(`${DIR}/future.json`)).toBe(false);
    expect(events.map((e) => e.type)).toEqual(["deleted"]);
    warn.mockRestore();
  });

  // ─── startup recovery (§8.5) ───

  it("recovers a draft interrupted mid-submission into attention state", async () => {
    seed(
      vault,
      sidecar({
        status: "submitting",
        submission: {
          attemptId: "attempt-1",
          phase: "running",
          requestedAt: "2026-08-16T10:05:00.000Z",
          sourceHashBefore: "abc123",
        },
      }),
    );

    await store.loadAll();

    const recovered = store.getById("draft-a");
    expect(recovered?.status).toBe("attention");
    expect(recovered?.attentionMessage).toBe(REVISION_INTERRUPTED_MESSAGE);
    // Notes are retained and the attempt is still inspectable; nothing retries.
    expect(recovered?.notes).toHaveLength(1);
    expect(recovered?.submission?.attemptId).toBe("attempt-1");
    expect(recovered?.submission?.error).toBe(REVISION_INTERRUPTED_MESSAGE);

    const onDisk = JSON.parse(vault.contents.get(`${DIR}/draft-a.json`) ?? "{}") as RevisionDraft;
    expect(onDisk.status).toBe("attention");
  });

  it("leaves collecting and attention drafts alone on load", async () => {
    seed(vault, sidecar({ id: "collecting" }));
    seed(vault, sidecar({ id: "attention", status: "attention", attentionMessage: "Earlier failure." }));

    await store.loadAll();

    expect(store.getById("collecting")?.status).toBe("collecting");
    expect(store.getById("attention")?.attentionMessage).toBe("Earlier failure.");
  });

  // ─── delete ───

  it("trashes the sidecar and drops the emptied revisions folder", async () => {
    const created = await store.create(SOURCE);
    expect(vault.folders.has(DIR)).toBe(true);

    await store.delete(created.id);

    expect(vault.files.has(`${DIR}/${created.id}.json`)).toBe(false);
    expect(vault.folders.has(DIR)).toBe(false);
  });

  it("keeps the folder while another draft remains", async () => {
    const first = await store.create(SOURCE);
    await store.create("notes/other.md");

    await store.delete(first.id);

    expect(vault.folders.has(DIR)).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it("deleting an unknown id is a silent no-op", async () => {
    await store.delete("nope");
    expect(events).toEqual([]);
  });

  it("reports a trash failure instead of dropping the draft from the cache", async () => {
    const created = await store.create(SOURCE);
    const app = makeApp(vault);
    app.fileManager.trashFile = async () => {
      throw new Error("permission denied");
    };
    const failing = new RevisionStore(app, () => DIR);
    await failing.loadAll();

    await expect(failing.delete(created.id)).rejects.toThrow(/permission denied/);
    expect(failing.getById(created.id)).not.toBeNull();
    expect(vault.files.has(`${DIR}/${created.id}.json`)).toBe(true);
  });

  // ─── external sidecar changes (§8.6) ───

  it("re-reads an externally changed sidecar and emits an update", async () => {
    const created = await store.create(SOURCE);
    const path = `${DIR}/${created.id}.json`;
    // Simulate the vault event for our own write being consumed first.
    await store.reloadFile(path);
    events.length = 0;

    vault.addFile(path, `${JSON.stringify({ ...created, notes: [note()] }, null, 2)}\n`);
    const reloaded = await store.reloadFile(path);

    expect(reloaded?.notes).toHaveLength(1);
    expect(store.getById(created.id)?.notes).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual(["updated"]);
  });

  it("re-reads an external edit even when updatedAt was left untouched", async () => {
    const created = await store.create(SOURCE);
    const path = `${DIR}/${created.id}.json`;
    await store.reloadFile(path);
    events.length = 0;

    // A hand edit that adds a note without bumping the timestamp.
    vault.addFile(path, `${JSON.stringify({ ...created, notes: [note({ id: "hand-added" })] }, null, 2)}\n`);
    const reloaded = await store.reloadFile(path);

    expect(reloaded?.notes.map((n) => n.id)).toEqual(["hand-added"]);
    expect(events.map((e) => e.type)).toEqual(["updated"]);
  });

  it("drops the echo of its own write", async () => {
    const created = await store.create(SOURCE);
    events.length = 0;

    const echoed = await store.reloadFile(`${DIR}/${created.id}.json`);

    expect(echoed?.id).toBe(created.id);
    expect(events).toEqual([]);
  });

  it("forgets a sidecar deleted outside the plugin", async () => {
    const created = await store.create(SOURCE);
    const path = `${DIR}/${created.id}.json`;
    await store.reloadFile(path);
    events.length = 0;

    vault.removeTree(path);
    store.forgetFile(path);

    expect(store.getById(created.id)).toBeNull();
    expect(events.map((e) => e.type)).toEqual(["deleted"]);
  });

  it("ignores a reload for a file that is gone and never re-creates it", async () => {
    const reloaded = await store.reloadFile(`${DIR}/missing.json`);
    expect(reloaded).toBeNull();
    expect(vault.files.has(`${DIR}/missing.json`)).toBe(false);
  });

  // ─── validation on save ───

  it("rejects drafts that would corrupt the sidecar", async () => {
    const created = await store.create(SOURCE);

    await expect(store.save({ ...created, id: "  " })).rejects.toThrow(/missing an id/i);
    await expect(store.save({ ...created, sourcePath: "" })).rejects.toThrow(/source document path/i);
    await expect(
      store.save({ ...created, notes: [note({ id: "dup" }), note({ id: "dup" })] }),
    ).rejects.toThrow(/duplicate/i);
    await expect(
      store.save({
        ...created,
        notes: [{ ...note(), anchor: { ...note().anchor, to: 0 } }],
      }),
    ).rejects.toThrow(/invalid anchor/i);
    await expect(
      store.save({ ...created, destination: { agentName: "writer", conversationId: "" } }),
    ).rejects.toThrow(/agent name and a conversation id/i);
  });

  it("caps note count but still lets an over-cap draft shrink", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const many = Array.from({ length: 140 }, (_, i) => note({ id: `n-${i}` }));
    seed(vault, sidecar({ notes: many }));
    await store.loadAll();

    // Nothing is silently discarded on read.
    expect(store.getById("draft-a")?.notes).toHaveLength(140);

    const loaded = store.getById("draft-a");
    if (!loaded) throw new Error("draft missing");
    // Growing past what is already stored is refused...
    await expect(
      store.save({ ...loaded, notes: [...many, note({ id: "one-more" })] }),
    ).rejects.toThrow(/at most 100 notes/i);
    // ...but removing notes always works.
    await store.save({ ...loaded, notes: many.slice(0, 90) });
    expect(store.getById("draft-a")?.notes).toHaveLength(90);
    // And once inside the cap, the ordinary limit applies again.
    await expect(
      store.save({ ...loaded, notes: Array.from({ length: 101 }, (_, i) => note({ id: `m-${i}` })) }),
    ).rejects.toThrow(/at most 100 notes/i);
    warn.mockRestore();
  });

  it("saving an unknown draft id creates it and emits created", async () => {
    await store.save(sidecar({ id: "external" }));

    expect(store.getById("external")?.sourcePath).toBe(SOURCE);
    expect(vault.files.has(`${DIR}/external.json`)).toBe(true);
    expect(events.map((e) => e.type)).toEqual(["created"]);
  });

  it("stamps updatedAt on save and preserves createdAt", async () => {
    const created = await store.create(SOURCE);
    const stale: RevisionDraft = { ...created, updatedAt: "2020-01-01T00:00:00.000Z" };

    await store.save(stale);

    const saved = store.getById(created.id);
    expect(saved?.createdAt).toBe(created.createdAt);
    expect(saved?.updatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  // ─── defensive copies ───

  it("hands out defensive copies — mutating a result never touches the cache", async () => {
    const created = await store.create(SOURCE);
    await store.save({ ...created, notes: [note()], destination: { agentName: "writer", conversationId: "c-1" } });

    const first = store.getById(created.id);
    if (!first?.notes[0]) throw new Error("expected a note");
    first.notes[0].comment = "mutated";
    first.notes[0].anchor.from = -999;
    first.notes.push(note({ id: "sneaky" }));
    first.status = "attention";
    if (first.destination) first.destination.agentName = "hijacked";

    const second = store.getById(created.id);
    expect(second?.notes).toHaveLength(1);
    expect(second?.notes[0]?.comment).toBe("Name the failure mode.");
    expect(second?.notes[0]?.anchor.from).toBe(created.notes[0]?.anchor.from ?? note().anchor.from);
    expect(second?.status).toBe("collecting");
    expect(second?.destination?.agentName).toBe("writer");

    // list() and getBySourcePath() are copies too.
    const listed = store.list()[0];
    if (listed) listed.notes.length = 0;
    expect(store.list()[0]?.notes).toHaveLength(1);
    const byPath = store.getBySourcePath(SOURCE);
    if (byPath) byPath.sourcePath = "elsewhere.md";
    expect(store.getBySourcePath(SOURCE)?.id).toBe(created.id);
  });

  it("does not keep a reference to the draft object passed to save", async () => {
    const created = await store.create(SOURCE);
    const outgoing: RevisionDraft = { ...created, notes: [note()] };

    await store.save(outgoing);
    outgoing.notes[0]!.comment = "mutated after save";
    outgoing.notes.push(note({ id: "extra" }));

    expect(store.getById(created.id)?.notes).toHaveLength(1);
    expect(store.getById(created.id)?.notes[0]?.comment).toBe("Name the failure mode.");
  });

  // ─── events ───

  it("stops delivering events after unsubscribe", async () => {
    const seen: RevisionStoreEvent[] = [];
    const unsubscribe = store.subscribe((event) => seen.push(event));

    const created = await store.create(SOURCE);
    unsubscribe();
    await store.save({ ...created, notes: [note()] });

    expect(seen.map((e) => e.type)).toEqual(["created"]);
  });

  it("one failing listener cannot stop the others", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    store.subscribe(() => {
      throw new Error("listener blew up");
    });
    store.subscribe((event) => seen.push(event.type));

    await expect(store.create(SOURCE)).resolves.toBeTruthy();

    expect(seen).toEqual(["created"]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("carries the source path on every event, including delete", async () => {
    const created = await store.create(SOURCE);
    await store.delete(created.id);

    expect(events.map((e) => e.sourcePath)).toEqual([SOURCE, SOURCE]);
    expect(events[1]?.draft).toBeUndefined();
  });

  // ─── boundaries ───

  it("never writes anything outside the revisions folder", async () => {
    vault.addFile(SOURCE, DOC);
    const before = vault.contents.get(SOURCE);

    const created = await store.create(SOURCE);
    await store.save({ ...created, notes: [note()] });
    await store.renameSource(SOURCE, "notes/renamed.md");
    await store.delete(created.id);

    expect(vault.contents.get(SOURCE)).toBe(before);
    expect([...vault.files.keys()]).toEqual([SOURCE]);
  });

  it("reads the revisions directory lazily, so a fleet-folder change is respected", async () => {
    let dir = DIR;
    const lazy = new RevisionStore(makeApp(vault), () => dir);

    const first = await lazy.create(SOURCE);
    expect(vault.files.has(`${DIR}/${first.id}.json`)).toBe(true);

    dir = "custom/revisions";
    await lazy.loadAll();
    expect(lazy.list()).toEqual([]);

    const second = await lazy.create(SOURCE);
    expect(vault.files.has(`custom/revisions/${second.id}.json`)).toBe(true);
  });
});
