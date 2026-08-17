/**
 * Pure routing helpers used by the plugin's Revision mode wiring
 * (REVISION_MODE_DESIGN.md §§8.6, 11.8).
 *
 * These three decisions are the ones that quietly destroy data or steal the
 * wrong workspace tab when they are wrong, and all three are otherwise buried
 * inside `main.ts` where they cannot be tested without booting a plugin. They
 * live here as plain functions over plain values: no Obsidian objects, no
 * vault, no plugin.
 */
import type { RevisionStoreEvent } from "../repository/revisionStore";
import type { RevisionUiEvent } from "../components/revisionModeController";

/**
 * How a vault path relates to the fleet folder.
 *
 * `revision` — a revision sidecar. Routed to `RevisionStore` and NEVER to the
 *              debounced fleet refresh: sidecars are written on every debounced
 *              anchor update, and a full reparse + scheduler reconcile per
 *              keystroke-batch is exactly what §8.6 forbids.
 * `usage`    — the append-per-turn usage ledger, ignored as before.
 * `entity`   — everything else under the fleet folder: the existing refresh.
 * `outside`  — an ordinary vault file (including reviewed source documents).
 */
export type FleetPathKind = "outside" | "revision" | "usage" | "entity";

/** Trailing slashes and duplicated separators would break the prefix tests. */
function normalizeFolder(folder: string): string {
  return folder.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

/**
 * Classify a vault-relative path against the configured fleet folder.
 *
 * Matching is prefix-on-a-slash-boundary in both directions: `_fleet/revisions`
 * (the folder itself) and `_fleet/revisions/x.json` classify as `revision`,
 * while `_fleet/revisions-old/x.json` does not.
 */
export function classifyFleetPath(fleetFolder: string, path: string): FleetPathKind {
  const root = normalizeFolder(fleetFolder);
  const target = normalizeFolder(path);
  if (!root || !target) return "outside";
  if (target !== root && !target.startsWith(`${root}/`)) return "outside";

  const rest = target === root ? "" : target.slice(root.length + 1);
  const segment = rest.split("/")[0] ?? "";
  if (segment === "revisions") return "revision";
  if (segment === "usage") return "usage";
  return "entity";
}

/** The subset of `AgentChatView` that exact chat navigation compares. */
export interface ChatLeafSelection {
  selectedAgentName: string | null;
  selectedConversationId: string;
}

/**
 * Index of the open chat view that already shows a destination, or -1.
 *
 * With a `conversationId`, BOTH values must match. Deduplicating by agent alone
 * — the pre-Revision behavior — reveals whichever tab happens to hold that
 * agent, which is the wrong conversation as soon as one agent has several open
 * (§11.8). Without a `conversationId` the caller has expressed no preference,
 * so the historical agent-only match is correct.
 */
export function findChatLeafForTarget(
  views: readonly ChatLeafSelection[],
  agentName: string,
  conversationId?: string,
): number {
  if (!agentName) return -1;
  return views.findIndex((view) => {
    if (view.selectedAgentName !== agentName) return false;
    if (conversationId === undefined) return true;
    return view.selectedConversationId === conversationId;
  });
}

/**
 * Translate a store-level sidecar change into the UI event Revision mode's
 * controllers consume.
 *
 * `renamed` maps to `draft-updated` deliberately: the draft is the same draft,
 * now pointing at a new source path, and the controller for the renamed pane
 * matches on the NEW path. A `deleted` event carries no draft, so it must not
 * be reported as an update — the controller reads that as "the revision
 * succeeded" and returns the document to Live Preview.
 */
export function toRevisionUiEvent(event: RevisionStoreEvent): RevisionUiEvent | null {
  if (event.type === "deleted") {
    return { type: "draft-deleted", draftId: event.draftId, sourcePath: event.sourcePath };
  }
  return event.draft ? { type: "draft-updated", draft: event.draft } : null;
}
