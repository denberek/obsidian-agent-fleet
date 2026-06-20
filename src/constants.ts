import type { FleetSettings } from "./types";

export const VIEW_TYPE_AGENTS = "agent-fleet-agents";
export const VIEW_TYPE_INBOX = "agent-fleet-inbox";
export const VIEW_TYPE_DASHBOARD = "agent-fleet-dashboard";
export const VIEW_TYPE_CHAT = "agent-fleet-chat";

export const DEFAULT_SETTINGS: FleetSettings = {
  fleetFolder: "_fleet",
  claudeCliPath: "claude",
  codexCliPath: "codex",
  defaultModel: "default",
  awsRegion: "us-east-1",
  maxConcurrentRuns: 2,
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

// ─── Memory v2 defaults (see MEMORY_EVOLUTION_DESIGN.md) ───
/** Steady-state token budget for an agent's injected working memory. */
export const DEFAULT_MEMORY_TOKEN_BUDGET = 1500;
/** Default nightly reflection schedule (3am). */
export const DEFAULT_REFLECTION_SCHEDULE = "0 3 * * *";
/** Default recurrence count before a skill candidate becomes a proposal. */
export const DEFAULT_RECURRENCE_THRESHOLD = 3;
