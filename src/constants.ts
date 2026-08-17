import type { FleetSettings } from "./types";

export const VIEW_TYPE_AGENTS = "agent-fleet-agents";
export const VIEW_TYPE_INBOX = "agent-fleet-inbox";
export const VIEW_TYPE_DASHBOARD = "agent-fleet-dashboard";
export const VIEW_TYPE_CHAT = "agent-fleet-chat";

export const DEFAULT_SETTINGS: FleetSettings = {
  fleetFolder: "_fleet",
  claudeCliPath: "claude",
  codexCliPath: "codex",
  piCliPath: "pi",
  defaultModel: "default",
  awsRegion: "us-east-1",
  maxConcurrentRuns: 2,
  // Both off by default — a cap that silently truncates someone's existing
  // scheduled work on upgrade would be a worse surprise than no cap at all.
  maxRunBudgetUsd: 0,
  maxRunTurns: 0,
  claudeSandboxNetworkStrictAllowlist: false,
  claudeSandboxFilesystemDisabled: false,
  runLogRetentionDays: 30,
  catchUpMissedTasks: true,
  notificationLevel: "all",
  showStatusBar: true,
  mcpApiKeys: {},
  mcpTokens: {},
  channelCredentials: {},
  maxConcurrentChannelSessions: 5,
  channelIdleTimeoutMinutes: 15,
  channelRateLimitPerConversation: 20,
  channelRateLimitWindowMinutes: 5,
  chatWatchdogMinutes: 10,
  defaultFileHashes: {},
};

export const FLEET_SUBFOLDERS = ["agents", "skills", "tasks", "runs", "memory", "channels", "mcp", "usage"] as const;

/**
 * Transient revision-draft sidecars (`_fleet/revisions/<uuid>.json`).
 *
 * Deliberately NOT in {@link FLEET_SUBFOLDERS}: the folder is created on demand
 * by RevisionStore and removed again when its last draft is trashed
 * (REVISION_MODE_DESIGN.md §8.4), so `ensureFleetStructure()` must not recreate
 * an empty one on every load. Entity loading only ever parses markdown, so JSON
 * sidecars stay outside the fleet parse path either way.
 */
export const REVISIONS_SUBFOLDER = "revisions";

// ─── Memory v2 defaults (see MEMORY_EVOLUTION_DESIGN.md) ───
/** Steady-state token budget for an agent's injected working memory. */
export const DEFAULT_MEMORY_TOKEN_BUDGET = 1500;
/** Default nightly reflection schedule (3am). */
export const DEFAULT_REFLECTION_SCHEDULE = "0 3 * * *";
/** Default recurrence count before a skill candidate becomes a proposal. */
export const DEFAULT_RECURRENCE_THRESHOLD = 3;
