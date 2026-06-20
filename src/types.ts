export type AgentHealth = "idle" | "running" | "error" | "pending" | "disabled";
export type RunStatus =
  | "success"
  | "failure"
  | "timeout"
  | "cancelled"
  | "pending_approval"
  | "interrupted";
export type TaskType = "recurring" | "once" | "immediate";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type NotificationLevel = "all" | "failures-only" | "none";
export type ApprovalDecision = "approved" | "rejected";

export interface FleetSettings {
  fleetFolder: string;
  claudeCliPath: string;
  /** Path to the OpenAI Codex CLI binary, used by agents with `adapter: codex`. */
  codexCliPath: string;
  defaultModel: string;
  awsRegion: string;
  maxConcurrentRuns: number;
  runLogRetentionDays: number;
  catchUpMissedTasks: boolean;
  notificationLevel: NotificationLevel;
  showStatusBar: boolean;
  mcpApiKeys: Record<string, string>;
  mcpTokens: Record<string, unknown>;
  channelCredentials: Record<string, ChannelCredentialEntry>;
  maxConcurrentChannelSessions: number;
  channelIdleTimeoutMinutes: number;
  channelRateLimitPerConversation: number;
  channelRateLimitWindowMinutes: number;
  /** Minutes the chat-session watchdog waits without any CLI stream events
   *  before killing the subprocess and rejecting the turn. Guards against
   *  silent hangs on long-running tool calls. */
  chatWatchdogMinutes: number;
  /** Hashes of default files at the time they were last written. Used to detect
   * user customization — if the on-disk hash matches, safe to overwrite on update. */
  defaultFileHashes: Record<string, string>;
  /** Set to true after secrets have been migrated to Obsidian's SecretStorage. */
  secretsMigrated?: boolean;
  /** Set to true after the one-time import of native Claude/Codex MCP servers
   *  into the fleet registry (`_fleet/mcp/`) has run. */
  mcpImported?: boolean;
}

export type ChannelType = "slack" | "telegram" | "discord";

export type ChannelStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "needs-auth"
  | "error"
  | "stopped"
  | "disabled";

export type ChannelCredentialEntry =
  | { type: "slack"; botToken: string; appToken: string }
  | { type: "telegram"; botToken: string }
  | { type: "discord"; botToken: string };

export interface ChannelConfig {
  filePath: string;
  name: string;
  type: ChannelType;
  /** The agent used when no @-prefix is given in a message. */
  defaultAgent: string;
  /** Agents that users can switch to via @-prefix. Empty = all agents allowed. */
  allowedAgents: string[];
  enabled: boolean;
  credentialRef: string;
  allowedUsers: string[];
  perUserSessions: boolean;
  channelContext: string;
  transport: Record<string, unknown>;
  tags: string[];
  body: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * One token-consuming event recorded to the usage ledger
 * (`_fleet/usage/YYYY-MM-DD.jsonl`). Chat and channel turns append these so their
 * token/cost are counted in the dashboard totals (runs/heartbeats/reflections
 * already carry tokens+cost in their run logs). `costUsd` is the CLI-reported
 * dollar cost when available; when absent it's estimated from tokens at read time.
 */
export interface UsageRecord {
  /** ISO-8601 timestamp of the turn. */
  ts: string;
  agent: string;
  /** Origin of the usage — only chat/channel are ledgered; runs live in run logs. */
  source: "chat" | "channel";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  totalTokens: number;
  /** CLI-reported cost for this turn; undefined → estimate from tokens. */
  costUsd?: number;
}

export interface SkillConfig {
  filePath: string;
  name: string;
  description?: string;
  tags: string[];
  body: string;
  toolsBody: string;
  referencesBody: string;
  examplesBody: string;
  isFolder: boolean;
}

/**
 * Per-scope Wiki Keeper configuration. Present only on agents that manage
 * a wiki scope. All paths are vault-relative when `scopeRoot` is empty;
 * otherwise paths are resolved relative to `scopeRoot`.
 * See WIKI_KEEPER_DESIGN.md §4.4.
 */
export interface WikiKeeperConfig {
  /** Folder path relative to vault root. Empty = whole vault. */
  scopeRoot: string;
  inboxPath: string;
  archivePath: string;
  /** Quarantine path for inbox sources that fail ingest 3+ times. */
  failedPath: string;
  topicsRoot: string;
  indexPath: string;
  logPath: string;
  watchedFolders: string[];
  excludePatterns: string[];
  /** ISO date (YYYY-MM-DD). Watched-mode ingestion skips files whose mtime
   *  is strictly older than this date. Empty string = no cutoff. */
  watchedSince: string;
  fileSubstantiveAnswers: boolean;
  obsidianUrlScheme: boolean;
  maxTokensPerIngest: number;
  /** Token budget for the synthesis-refresh phase (separate from ingest). */
  maxTokensPerRefresh: number;
  /** Topic-page count above which `index.md` splits into per-type sub-MOCs. */
  indexSplitThreshold: number;
  /** Levenshtein-ratio threshold for the lint dedup check (0..1). */
  dedupSimilarityThreshold: number;
  /** Days after which a summary is considered stale by lint. */
  summaryStaleDays: number;
  /** Name of the hidden JSON file in the scope that caches watched-source mtimes + hashes + failures. */
  stateFile: string;
}

export interface AgentConfig {
  filePath: string;
  name: string;
  description?: string;
  model: string;
  adapter: string;
  permissionMode: string;
  effort?: string;
  maxRetries: number;
  skills: string[];
  mcpServers: string[];
  cwd?: string;
  enabled: boolean;
  timeout: number;
  approvalRequired: string[];
  memory: boolean;
  /** @deprecated Superseded by `memoryTokenBudget`. Still parsed for backward
   *  compatibility but no longer used for any logic. Remove in a later release. */
  memoryMaxEntries: number;
  /** Steady-state token budget for the injected working-memory file. Reflection
   *  compacts working memory back under this. See MEMORY_EVOLUTION_DESIGN.md §10. */
  memoryTokenBudget: number;
  /** Nightly reflection ("dreaming") configuration. See MEMORY_EVOLUTION_DESIGN.md §8. */
  reflection: ReflectionConfig;
  tags: string[];
  avatar: string;
  body: string;
  contextBody: string;
  skillsBody: string;
  env: Record<string, string>;
  permissionRules: {
    allow: string[];
    deny: string[];
  };
  isFolder: boolean;
  /**
   * Percentage of the context window at which the chat session should
   * automatically run `/compact` before the next user message. 0 disables
   * auto-compaction. Default ~85.
   */
  autoCompactThreshold?: number;
  /** Heartbeat — autonomous periodic run instruction loaded from HEARTBEAT.md */
  heartbeatEnabled: boolean;
  heartbeatSchedule: string;
  heartbeatBody: string;
  heartbeatNotify: boolean;
  /** Channel name to post heartbeat results to (e.g. "my-slack"). Empty = no channel post. */
  heartbeatChannel: string;
  /** Specific channel/conversation id to post heartbeat results to within
   *  heartbeatChannel (e.g. a Discord channel id). Empty = broadcast as a DM to
   *  the channel's first allowed user. Mirrors a task's channelTarget. */
  heartbeatChannelTarget: string;
  /** Wiki Keeper scope config. Present only on agents that manage a wiki
   *  scope. See WIKI_KEEPER_DESIGN.md. */
  wikiKeeper?: WikiKeeperConfig;
  /** Consumer-side references to Wiki Keeper scopes owned by other agents.
   *  Any agent (PM agent, research agent, etc.) can opt in to read+cite from
   *  one or more wikis by listing their keeper agent names here. At prompt-
   *  build time a context block is injected listing the referenced scopes'
   *  paths and conventions. */
  wikiReferences?: Array<{ agent: string }>;
}

export interface TaskConfig {
  filePath: string;
  taskId: string;
  agent: string;
  schedule?: string;
  runAt?: string;
  type: TaskType;
  priority: TaskPriority;
  enabled: boolean;
  created: string;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  catchUp: boolean;
  effort?: string;
  /** Optional per-task model override. Empty/absent = inherit from agent. */
  model?: string;
  /** Channel name to post this task's output to (e.g. "my-discord"). Empty/absent
   *  = no channel post (run log only). Mirrors an agent's heartbeatChannel but is
   *  per-task, so scheduled tasks — not just the heartbeat — can deliver to a
   *  channel. */
  channel?: string;
  /** Optional transport-native destination id within `channel` (Discord/Slack
   *  channel id, Telegram chat id). When set, the task posts directly to that
   *  channel/conversation; when empty, delivery falls back to the channel's
   *  broadcast (DM to the first allowed user). Ignored unless `channel` is set. */
  channelTarget?: string;
  tags: string[];
  body: string;
}

export type ModelSource = "task" | "agent" | "settings" | "cli-default";

export interface ResolvedModel {
  /** The model string to pass as --model, or empty to omit the flag. */
  value: string;
  /** Where the value came from, for audit/UI display. */
  source: ModelSource;
}

export interface ApprovalRecord {
  tool: string;
  command?: string;
  reason?: string;
  status: "pending" | ApprovalDecision;
  resolvedAt?: string;
  note?: string;
}

export interface RunLogData {
  filePath?: string;
  runId: string;
  agent: string;
  task: string;
  status: RunStatus;
  started: string;
  completed?: string;
  durationSeconds: number;
  tokensUsed?: number;
  costUsd?: number;
  model: string;
  /** Where the resolved model came from. Absent on older run logs. */
  modelSource?: ModelSource;
  /**
   * Concrete model ID Claude Code actually routed to. Differs from `model`
   * when the request used an alias (e.g. model="opus",
   * concreteModel="claude-opus-4-7"). Undefined on older run logs.
   */
  concreteModel?: string;
  exitCode: number | null;
  tags: string[];
  prompt: string;
  output: string;
  /** Concise final-answer text from the CLI's `result` event. Distinct from
   *  `output` which is the full assistant narrative across all turns.
   *  Persisted as its own `## Result` section in the run markdown when set.
   *  Undefined on legacy runs created before this field existed. */
  finalResult?: string;
  toolsUsed: string[];
  stderr?: string;
  approvals?: ApprovalRecord[];
}

/** Nightly reflection config. See MEMORY_EVOLUTION_DESIGN.md §8, §15. */
export interface ReflectionConfig {
  enabled: boolean;
  /** Cron expression; default "0 3 * * *". */
  schedule: string;
  /** Min recurrence before a skill candidate becomes a proposal. Default 3. */
  recurrenceThreshold: number;
  /** Gate for the memory→skills loop. */
  proposeSkills: boolean;
  /** Optional model override for the reflection run. Empty = the agent's own model. */
  model?: string;
}

/**
 * @deprecated Legacy flat memory file shape (`_fleet/memory/<slug>.md` with a
 * single `## Learned Context` list). Retained so older readers/tests keep
 * compiling during the v2 migration. New code uses {@link WorkingMemory}.
 */
export interface MemoryFile {
  filePath: string;
  agent: string;
  lastUpdated?: string;
  body: string;
}

export type MemorySectionName = "Preferences" | "Procedures" | "Observations" | "Recent";

/** One curated, injected fact in working memory. */
export interface MemoryEntry {
  text: string;
  /** Provenance, e.g. "chat:conv-abc" | "task:wiki-lint" | "heartbeat" | "reflection". */
  source?: string;
  /** ISO date the entry was recorded/last touched. */
  date?: string;
  /** Pinned entries are never summarized or dropped by reflection. */
  pinned: boolean;
}

export interface MemorySection {
  name: MemorySectionName;
  entries: MemoryEntry[];
}

/** Parsed view of the curated, injected `working.md`. See §6.2. */
export interface WorkingMemory {
  filePath: string;
  agent: string;
  schema: number;
  lastUpdated?: string;
  lastReflection?: string;
  /** Approximate token size of the rendered body, maintained on every write. */
  tokenEstimate: number;
  sections: MemorySection[];
}

/** A recurring-friction pattern tracked across reflections; becomes a skill
 *  proposal once it crosses the recurrence threshold (§9.2). */
export interface SkillCandidate {
  /** Stable key for cross-night merging. */
  key: string;
  /** Human-readable description of the recurring friction. */
  pattern: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  /** Run-file paths (or other refs) evidencing the pattern. */
  evidence: string[];
  /** Set once a proposal has been emitted, so it is not re-proposed. */
  proposed: boolean;
  /** Suggested skill kind, if the agent indicated one. */
  suggestedSkill?: string;
}

/** A skill create/modify proposal emitted by reflection, awaiting approval. §9. */
export interface SkillProposal {
  id: string;
  type: "skill_create" | "skill_modify";
  agent: string;
  status: "pending" | "accepted" | "rejected";
  created: string;
  /** Target skill slug (for skill_modify). */
  targetSkill?: string;
  /** Candidate ledger id this proposal originated from. */
  candidate?: string;
  /** Run-file paths that evidence the recurring pattern. */
  evidence: string[];
  /** Rationale prose. */
  rationale: string;
  /** For skill_create: full skill body. For skill_modify: a unified diff. */
  body: string;
}

export interface FleetSnapshot {
  agents: AgentConfig[];
  skills: SkillConfig[];
  tasks: TaskConfig[];
  channels: ChannelConfig[];
  /** Registered MCP servers (`_fleet/mcp/*.md`), the single source of truth
   *  projected into every adapter at run time. */
  mcpServers: McpServer[];
  validationIssues: ValidationIssue[];
}

export interface PendingRun {
  task: TaskConfig;
  reason: "manual" | "scheduled" | "catch-up" | "heartbeat";
  promptOverride?: string;
}

export interface ExecutionToolUse {
  tool: string;
  command?: string;
  reason?: string;
}

export interface ExecutionResult {
  exitCode: number | null;
  durationSeconds: number;
  stdout: string;
  stderr: string;
  outputText: string;
  rawJson?: unknown;
  tokensUsed?: number;
  costUsd?: number;
  toolsUsed: ExecutionToolUse[];
  timedOut: boolean;
  /**
   * The final `result` field from the CLI's terminal `type: "result"` event —
   * i.e. the last assistant text block without narration, preambles, or
   * tool-use chatter. When present, surfaced as the primary OUTPUT in the
   * run-detail panel; the full `outputText` becomes a collapsible transcript.
   */
  finalResult?: string;
  /** Model string actually passed to the CLI ("" means the flag was omitted). */
  resolvedModel: string;
  /** Which layer the model came from. */
  modelSource: ModelSource;
  /**
   * The concrete model Claude Code actually routed to (e.g. we asked for
   * "opus" and the CLI resolved it to "claude-opus-4-7"). Parsed from
   * stream-json. Undefined when the CLI didn't emit it (rare / errors).
   */
  concreteModel?: string;
}

export interface ChatMessage {
  /** Stable message id. Freshly-created messages get a uuid v4; legacy
   *  messages without an id get one derived from sha1(timestamp+content)
   *  on load, preserved on next save. Used as thread anchor. */
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; command?: string }>;
  attachments?: string[]; // filenames of attached documents
}

/** One conversation listing entry for an agent. Used by the chat side rail
 *  to render parallel in-app conversations. All conversations are equal —
 *  the engine has no special legacy/default fork. */
export interface ConversationMeta {
  id: string;
  name: string;
  lastActive: string;
  messageCount: number;
}

export interface AgentRuntimeState {
  status: AgentHealth;
  currentRunId?: string;
  currentTaskId?: string;
  runStarted?: string;
  lastRun?: RunLogData;
}

export interface FleetStatus {
  running: number;
  pending: number;
  completedToday: number;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Wire transport of an MCP server. `unknown` only appears transiently while
 *  probing a server whose type couldn't be determined. */
export type McpTransport = "stdio" | "http" | "sse";

/** How an HTTP/SSE server authenticates. `bearer`/`oauth` tokens live in
 *  SecretStore (never in the vault). */
export type McpAuthKind = "none" | "bearer" | "oauth";

/** OAuth metadata for an HTTP/SSE server. Tokens are NOT stored here — only the
 *  non-secret discovery hints needed to (re)authenticate and to project the
 *  server into Codex (`oauth_resource` / `oauth.client_id`). */
export interface McpOAuthMeta {
  clientId?: string;
  resource?: string;
  scopes?: string[];
}

/**
 * A registered MCP server. This is BOTH the persisted registry shape
 * (`_fleet/mcp/<name>.md` frontmatter, the non-secret fields) and the runtime
 * view (with `status`/`tools`/`toolDetails` filled in by an on-demand probe).
 * Secrets (bearer/OAuth tokens, secret env values) never live on this object —
 * they're resolved from SecretStore at projection time.
 */
export interface McpServer {
  name: string;
  /** Registry file path (`_fleet/mcp/<name>.md`). Undefined for synthetic
   *  servers (e.g. the per-run `remember` tool) and probe-only results. */
  filePath?: string;
  type: McpTransport | "unknown";
  enabled: boolean;
  description?: string;
  /** Provenance: hand-added in the UI vs auto-imported from a native config. */
  source?: "manual" | "imported";
  // ── stdio ──
  command?: string;
  args?: string[];
  /** Non-secret env passed to the stdio server. */
  env?: Record<string, string>;
  /** Env keys whose VALUES live in SecretStore (merged in at projection time). */
  envSecretKeys?: string[];
  // ── http / sse ──
  url?: string;
  /** Non-secret headers. The Authorization bearer is injected at projection
   *  time from SecretStore, not stored here. */
  headers?: Record<string, string>;
  auth?: McpAuthKind;
  oauth?: McpOAuthMeta;
  // ── runtime-only (not persisted to frontmatter) ──
  status: "connected" | "needs-auth" | "error" | "disconnected";
  scope: "user" | "project" | "unknown";
  tools: string[];
  toolDetails: McpTool[];
}
