import { describe, expect, it } from "vitest";
import {
  classifyFleetPath,
  findChatLeafForTarget,
  toRevisionUiEvent,
} from "./revisionRouting";
import type { RevisionStoreEvent } from "../repository/revisionStore";
import type { RevisionDraft } from "../types";

function draft(overrides: Partial<RevisionDraft> = {}): RevisionDraft {
  return {
    schemaVersion: 1,
    id: "draft-1",
    sourcePath: "notes/brief.md",
    status: "collecting",
    notes: [],
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    ...overrides,
  };
}

describe("classifyFleetPath", () => {
  it("routes revision sidecars away from the fleet refresh", () => {
    expect(classifyFleetPath("_fleet", "_fleet/revisions/abc.json")).toBe("revision");
    expect(classifyFleetPath("_fleet", "_fleet/revisions")).toBe("revision");
    expect(classifyFleetPath("_fleet", "_fleet/revisions/nested/abc.json")).toBe("revision");
  });

  it("still ignores the usage ledger", () => {
    expect(classifyFleetPath("_fleet", "_fleet/usage/2026-08-16.jsonl")).toBe("usage");
  });

  it("treats every other fleet path as an entity path", () => {
    expect(classifyFleetPath("_fleet", "_fleet/agents/writer.md")).toBe("entity");
    expect(classifyFleetPath("_fleet", "_fleet/tasks/daily.md")).toBe("entity");
    expect(classifyFleetPath("_fleet", "_fleet")).toBe("entity");
  });

  it("does not match sibling folders that merely share a prefix", () => {
    expect(classifyFleetPath("_fleet", "_fleet/revisions-old/abc.json")).toBe("entity");
    expect(classifyFleetPath("_fleet", "_fleet/usagestats/x.md")).toBe("entity");
    expect(classifyFleetPath("_fleet", "_fleetwork/revisions/abc.json")).toBe("outside");
  });

  it("classifies ordinary vault documents as outside", () => {
    expect(classifyFleetPath("_fleet", "projects/launch-brief.md")).toBe("outside");
    expect(classifyFleetPath("_fleet", "revisions/abc.json")).toBe("outside");
  });

  it("honors a renamed fleet folder and tolerates stray slashes", () => {
    expect(classifyFleetPath("Fleet/Data", "Fleet/Data/revisions/a.json")).toBe("revision");
    expect(classifyFleetPath("_fleet/", "/_fleet/revisions/a.json")).toBe("revision");
    expect(classifyFleetPath("_fleet", "")).toBe("outside");
  });
});

describe("findChatLeafForTarget", () => {
  const views = [
    { selectedAgentName: "writer", selectedConversationId: "aaa" },
    { selectedAgentName: "writer", selectedConversationId: "bbb" },
    { selectedAgentName: "researcher", selectedConversationId: "ccc" },
  ];

  it("reveals the exact pair", () => {
    expect(findChatLeafForTarget(views, "writer", "bbb")).toBe(1);
  });

  it("does not steal another conversation of the same agent", () => {
    expect(findChatLeafForTarget(views, "writer", "zzz")).toBe(-1);
    expect(findChatLeafForTarget(views, "researcher", "aaa")).toBe(-1);
  });

  it("falls back to agent-only matching when no conversation was requested", () => {
    expect(findChatLeafForTarget(views, "writer")).toBe(0);
    expect(findChatLeafForTarget(views, "nobody")).toBe(-1);
  });

  it("ignores views with no agent selected", () => {
    expect(
      findChatLeafForTarget([{ selectedAgentName: null, selectedConversationId: "" }], "writer"),
    ).toBe(-1);
    expect(findChatLeafForTarget(views, "")).toBe(-1);
  });
});

describe("toRevisionUiEvent", () => {
  it("maps created/updated to a draft update", () => {
    const d = draft();
    for (const type of ["created", "updated"] as const) {
      const event: RevisionStoreEvent = { type, draftId: d.id, sourcePath: d.sourcePath, draft: d };
      expect(toRevisionUiEvent(event)).toEqual({ type: "draft-updated", draft: d });
    }
  });

  it("maps a rename to an update carrying the new source path", () => {
    const moved = draft({ sourcePath: "archive/brief.md" });
    const event: RevisionStoreEvent = {
      type: "renamed",
      draftId: moved.id,
      sourcePath: moved.sourcePath,
      previousSourcePath: "notes/brief.md",
      draft: moved,
    };
    expect(toRevisionUiEvent(event)).toEqual({ type: "draft-updated", draft: moved });
  });

  it("maps a deletion to a deletion, never to an empty update", () => {
    const event: RevisionStoreEvent = {
      type: "deleted",
      draftId: "draft-1",
      sourcePath: "notes/brief.md",
    };
    expect(toRevisionUiEvent(event)).toEqual({
      type: "draft-deleted",
      draftId: "draft-1",
      sourcePath: "notes/brief.md",
    });
  });

  it("drops a non-delete event with no draft payload", () => {
    expect(
      toRevisionUiEvent({ type: "updated", draftId: "draft-1", sourcePath: "notes/brief.md" }),
    ).toBeNull();
  });
});
