import { normalizePath, TFile, TFolder, type Vault } from "obsidian";
import { parseMarkdownWithFrontmatter, slugify, stringifyMarkdownWithFrontmatter } from "./utils/markdown";

/** User-supplied inputs when creating a Wiki Keeper instance. */
export interface WikiKeeperCreateInput {
  /** e.g. "acme" — used as the agent-name suffix. Empty = whole-vault default "wiki-keeper". */
  scopeSlug: string;
  /** Folder path relative to vault root. Empty = whole vault. */
  scopeRoot: string;
  inboxPath: string;
  archivePath: string;
  topicsRoot: string;
  indexPath: string;
  logPath: string;
  watchedFolders: string[];
  excludePatterns: string[];
  /** ISO date (YYYY-MM-DD). Empty = no cutoff. Watched-mode ingestion skips
   *  files whose mtime is strictly older than this date. */
  watchedSince: string;
  heartbeatChannel: string;
  fileSubstantiveAnswers: boolean;
  obsidianUrlScheme: boolean;
  maxTokensPerIngest: number;
  /** Hard cap (tokens) for the synthesis-refresh phase. Separate from
   *  ingest budget so a heavy ingest doesn't starve the refresh pass. */
  maxTokensPerRefresh: number;
  /** Pages threshold above which `index.md` splits into per-type sub-MOCs. */
  indexSplitThreshold: number;
  /** Levenshtein-ratio threshold for the lint dedup check. */
  dedupSimilarityThreshold: number;
  /** Days after which a summary is considered stale (lint will chain refresh). */
  summaryStaleDays: number;
  /** Failed-source quarantine path (relative to scope_root). */
  failedPath: string;
  stateFile: string;
}

/** Today in local time as YYYY-MM-DD — used as the default `watched_since`
 *  when the user creates a new keeper. */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Seed schedules baked into HEARTBEAT.md and the sibling lint task file on
 *  creation. After creation, users manage these schedules the same way as any
 *  other agent — via the agent editor (HEARTBEAT.md) and the task editor.
 *  Wiki Keeper's own config.md carries no schedule fields. */
const DEFAULT_INGEST_HEARTBEAT_SCHEDULE = "0 3 * * *";
const DEFAULT_LINT_TASK_SCHEDULE = "0 9 * * 0";

export function defaultWikiKeeperInput(): WikiKeeperCreateInput {
  return {
    scopeSlug: "",
    scopeRoot: "",
    inboxPath: "_sources/inbox",
    archivePath: "_sources/archive",
    topicsRoot: "_topics",
    indexPath: "index.md",
    logPath: "log.md",
    watchedFolders: [],
    excludePatterns: [],
    watchedSince: todayIso(),
    heartbeatChannel: "",
    // Default ON: Karpathy's compounding loop only works when substantive
    // answers file themselves back into the wiki. Users who want pure-Q&A
    // can flip this off per-scope.
    fileSubstantiveAnswers: true,
    obsidianUrlScheme: true,
    maxTokensPerIngest: 60000,
    maxTokensPerRefresh: 30000,
    indexSplitThreshold: 100,
    dedupSimilarityThreshold: 0.82,
    summaryStaleDays: 30,
    failedPath: "_sources/failed",
    stateFile: ".wiki-keeper-state.json",
  };
}

/** Kept for code paths that still reach for a static default. Prefer
 *  `defaultWikiKeeperInput()` so `watched_since` resolves to today. */
export const DEFAULT_WIKI_KEEPER_INPUT: WikiKeeperCreateInput = defaultWikiKeeperInput();

/** Compute the agent name from a scope slug. */
export function agentNameFromSlug(slug: string): string {
  const s = slugify(slug).trim();
  return s ? `wiki-keeper-${s}` : "wiki-keeper";
}

/** Build the `agent.md` body for a Wiki Keeper instance. */
function agentMd(name: string, scopeRoot: string): string {
  const scopeLabel = scopeRoot || "the whole vault";
  const frontmatter: Record<string, unknown> = {
    name,
    description: `Cultivates ${scopeLabel} as a self-maintaining wiki. Ingests new sources, extracts durable claims from watched folders, answers questions with citations, and periodically lints.`,
    avatar: "library",
    enabled: true,
    skills: ["wiki-ingest", "wiki-query", "wiki-lint", "wiki-refresh"],
    tags: scopeRoot ? ["wiki-keeper", `scope:${slugify(scopeRoot)}`] : ["wiki-keeper"],
  };
  const body = `You are the Wiki Keeper for the \`${scopeLabel}\` scope. Maintain it as a persistent, interlinked knowledge base (Karpathy's "LLM wiki" pattern).

## Scope isolation

Your knowledge is bounded to the \`scope_root\` in your config. You do NOT read or write files outside this scope. **Every Write/Edit/Bash(mv) target path must begin with \`<scope_root>/\`** (or be inside watched folders for *reading* only). If a question requires another scope, say you don't know and suggest asking that scope's keeper. If a tool call would target an out-of-scope path, refuse and explain why instead of attempting it.

## Four skills

- **\`wiki-ingest\`** — runs inbox mode + watched mode + chained refresh phase. The default heartbeat invokes this.
- **\`wiki-query\`** — answers questions, cites every claim, compounds substantive answers back into the wiki.
- **\`wiki-lint\`** — weekly health check; bidirectional cross-refs, dedup proposals, stale summaries, schema violations. Chains \`wiki-refresh\` for stale summaries.
- **\`wiki-refresh\`** — regenerates the fenced \`## Summary\` block at the top of topic pages whose claim history has grown. Called automatically at end of ingest and from lint; can also be invoked manually.

## Conventions

- Cross-links are Obsidian wikilinks within this scope.
- Topic pages under \`_topics/\` unless a subfolder exists.
- Topic pages have a fenced \`## Summary\` block at top, then \`## Claims\` (append-only history), then optional \`## Contradictions\`. The summary block is auto-managed by \`wiki-refresh\`; everything else preserves user-authored content.
- Bullets in \`## Claims\` carry a source-type tag: \`[doc]\`, \`[meeting]\`, \`[email]\`, \`[note]\`, \`[web]\`, \`[synthesis]\`, \`[other]\`.
- Preserve user-authored content; only revise/extend inside fenced blocks (\`<!-- wiki-keeper:begin -->\`, \`<!-- wiki-keeper:summary:begin -->\`).
- Log every action to \`log.md\`.

## When invoked

- If prompt names a file in the inbox or mentions watched-folder changes → \`wiki-ingest\`.
- If prompt is a question → \`wiki-query\` (compounding writes apply automatically when the answer is substantive).
- If prompt says "lint" or a periodic lint heartbeat fires → \`wiki-lint\`.
- If prompt says "refresh [[topic]]", "refresh stale", or "refresh all" → \`wiki-refresh\` directly.
- Otherwise ask what the user wants.

## Memory vs. wiki

Use \`memory\` for procedural learning ("user prefers concept pages under sub-folders", "user wants Sunday lint reports broadcast to Slack"). Topical content always goes into \`_topics/\` — never into memory. Memory is for how-to-work; the wiki is what-we-know.

## Non-goals

- Never delete user-authored pages.
- Never rewrite source files.
- Never auto-apply judgment-call lint fixes.
- Never write outside the scope root.
- Never edit \`## Claims\` history (append only).
- Never edit \`## Summary\` blocks by hand — \`wiki-refresh\` owns them.
`;
  return stringifyMarkdownWithFrontmatter(frontmatter, body);
}

/** Build the `config.md` body, which carries the `wiki_keeper:` block. */
function configMd(input: WikiKeeperCreateInput): string {
  const frontmatter: Record<string, unknown> = {
    model: "opus",
    adapter: "claude-code",
    timeout: 900,
    max_retries: 1,
    cwd: "",
    permission_mode: "acceptEdits",
    approval_required: ["Write"],
    // NOTE: allow/deny rules live in permissions.json — see CANONICAL_ALLOW
    // and CANONICAL_DENY below, written by ensureWikiKeeperPermissions().
    // Do NOT add allowed_tools/blocked_tools here — those frontmatter fields
    // are dead at runtime; settingsLocal is built from permissions.json only.
    memory: true,
    memory_max_entries: 200,
    wiki_keeper: {
      scope_root: input.scopeRoot,
      inbox_path: input.inboxPath,
      archive_path: input.archivePath,
      failed_path: input.failedPath,
      topics_root: input.topicsRoot,
      index_path: input.indexPath,
      log_path: input.logPath,
      watched_folders: input.watchedFolders,
      exclude_patterns: input.excludePatterns,
      watched_since: input.watchedSince,
      file_substantive_answers: input.fileSubstantiveAnswers,
      obsidian_url_scheme: input.obsidianUrlScheme,
      max_tokens_per_ingest: input.maxTokensPerIngest,
      max_tokens_per_refresh: input.maxTokensPerRefresh,
      index_split_threshold: input.indexSplitThreshold,
      dedup_similarity_threshold: input.dedupSimilarityThreshold,
      summary_stale_days: input.summaryStaleDays,
      state_file: input.stateFile,
    },
  };
  return stringifyMarkdownWithFrontmatter(frontmatter, "");
}

function heartbeatMd(input: WikiKeeperCreateInput): string {
  const frontmatter: Record<string, unknown> = {
    enabled: true,
    schedule: DEFAULT_INGEST_HEARTBEAT_SCHEDULE,
    notify: true,
  };
  if (input.heartbeatChannel) frontmatter.channel = input.heartbeatChannel;
  const body = `Run wiki-ingest in both modes:

1. Drain every unprocessed file in the configured inbox (inbox mode).
2. Diff watched folders against the state file; process changed or new files (watched mode).

Lint runs on its own schedule via the sibling \`*-lint\` task.

Change the schedule by editing this file's \`schedule:\` frontmatter directly, or via the agent editor in the dashboard.
`;
  return stringifyMarkdownWithFrontmatter(frontmatter, body);
}

/** Build the markdown for the sibling lint task. The task scheduler picks it
 *  up automatically once it's in `_fleet/tasks/`. The user can change the
 *  schedule afterwards via the task editor. */
function lintTaskMd(agentName: string): string {
  const taskId = `${agentName}-lint`;
  const frontmatter: Record<string, unknown> = {
    task_id: taskId,
    agent: agentName,
    type: "recurring",
    schedule: DEFAULT_LINT_TASK_SCHEDULE,
    priority: "low",
    enabled: true,
    created: new Date().toISOString(),
    run_count: 0,
    catch_up: false,
    tags: ["wiki-keeper", "lint"],
  };
  const body = `Run the \`wiki-lint\` skill on the current scope.

Write the report as a new \`## Lint YYYY-MM-DD\` section inside the fenced block in log.md.
`;
  return stringifyMarkdownWithFrontmatter(frontmatter, body);
}

function lintTaskPath(fleetFolder: string, agentName: string): string {
  return normalizePath(`${fleetFolder}/tasks/${agentName}-lint.md`);
}

const CONTEXT_MD = `# Wiki Schema

## Page types

- **Entity pages** — people, orgs, products. Frontmatter: \`type: entity\`.
- **Concept pages** — ideas, techniques, patterns. \`type: concept\`.
- **Event pages** — meetings, releases, decisions. \`type: event, date: YYYY-MM-DD\`.
- **Summary pages** (inbox-mode only) — one per ingested inbox source. \`type: summary, source: <filename>\`.
- **Synthesis pages** — filed answers from \`wiki-query\` substantive responses. \`type: synthesis, question: <q>, refreshed: <ISO>\`. Live under \`_topics/syntheses/\`.

Topic pages of type entity/concept/event SHOULD also carry:
- \`summary_refreshed: <ISO>\` — last time \`wiki-refresh\` regenerated this page's summary block. Empty string on creation.
- \`claims_at_refresh: <int>\` — how many claims existed at last refresh. Drives the staleness threshold.

## Page anatomy

Every entity/concept/event page has this structure:

\`\`\`markdown
---
type: entity
name: Vendor X
summary_refreshed: 2026-04-26
claims_at_refresh: 14
---

<!-- wiki-keeper:summary:begin -->
## Summary

- 3-7 bullet synthesis maintained by wiki-refresh.
- Forward-links to other topics with [[wikilinks]].
<!-- wiki-keeper:summary:end -->

## Claims

- 2026-04-18 [meeting]: from [[meetings/2026-04-18-vendor-sync|vendor-sync]]: Vendor X raised prices 15%
- 2026-04-12 [doc]: from [[summaries/2026-04-12-renewal-brief|renewal-brief]]: contract auto-renews 2026-12-01

## Contradictions

(only present when contradictions exist)
\`\`\`

The fenced summary block is auto-managed by \`wiki-refresh\`. The \`## Claims\` section is append-only history written by \`wiki-ingest\` and \`wiki-query\` compounding. \`## Contradictions\` is created on demand. **Anything outside these structures is user-authored** and must be preserved.

## Source-type tags

Every dated bullet in \`## Claims\` carries a tag indicating the source type:

- \`[doc]\` — PDF, DOCX, XLSX, or other document
- \`[meeting]\` — meeting note or transcript
- \`[email]\` — email forward
- \`[note]\` — markdown daily note or in-vault note
- \`[web]\` — web clipping or URL drop
- \`[synthesis]\` — bullet emitted by \`wiki-query\` compounding (links to a synthesis page)
- \`[other]\` — fallback

Tags help \`wiki-query\` weight evidence quality and help \`wiki-lint\` identify drift.

## Naming

- Slug-case filenames: \`vendor-x.md\`, not \`Vendor X.md\`.
- Group by type under \`_topics/<type>/\` when there are >5 pages of a type.

## Links

- Every entity/concept page MUST have ≥1 inbound link from \`index.md\` (or a sub-MOC) or a sibling.
- Summary pages MUST forward-link to every entity/concept they mention.
- Watched-mode extractions append dated entries to topic pages; forward-link to the source file path so readers can find the raw note.
- Synthesis pages forward-link to every cited topic and earn their place that way (lint exempts them from orphan flagging if they have any outbound links to topics).

## Index split

When the topic count exceeds the \`index_split_threshold\` config value (default 100) or any single type exceeds 30 pages, \`index.md\` becomes a hub of hubs and per-type sub-MOCs live at \`<scope>/index/<type>.md\`. After split, new topic-page entries go into the matching sub-MOC, not the root index.

## Conflict resolution

- New claim contradicts existing? Add a \`## Contradictions\` section with a dated entry. Do NOT overwrite.
- Flag in \`log.md\` for user review.
- \`wiki-refresh\` reflects unresolved contradictions in the summary so query-time readers see them.

## Failed sources

Files that fail ingest 3 times in a row are quarantined to \`<failed_path>/\` (default \`_sources/failed/\`) with a sidecar \`.error.md\`. Lint surfaces the quarantine count weekly.
`;

/** Canonical allow list for every Wiki Keeper. Bash(mv *) and Bash(mkdir *)
 *  are required so inbox mode can MOVE processed sources into the archive
 *  rather than just copying with Write — without mv, the source stays in
 *  the inbox and gets reprocessed on the next ingest. */
const CANONICAL_ALLOW: readonly string[] = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash(mv *)",
  "Bash(mkdir *)",
];

/** Canonical deny list. The defense-in-depth path-traversal patterns
 *  (`Bash(rm -rf /*)`, `Bash(mv * /*)`, `Bash(cp -r * /*)`) catch common
 *  shell misuses if the model gets confused about scope boundaries; the
 *  agent's prompt is the primary enforcer. */
const CANONICAL_DENY: readonly string[] = [
  "Bash(rm -rf *)",
  "Bash(git push *)",
  "Bash(rm -rf /*)",
  "Bash(mv * /*)",
  "Bash(cp -r * /*)",
];

/** Idempotently merge canonical allow/deny into a Wiki Keeper agent's
 *  `permissions.json`. Preserves user-added entries and adds any missing
 *  canonical ones. Creates the file if it doesn't exist.
 *
 *  This is the migration path for older keepers that were created before
 *  Bash(mv *) / Bash(mkdir *) were canonical, and for any keeper whose
 *  permissions drift from the canonical list. Called from both
 *  createWikiKeeperAgent and updateWikiKeeperAgent so a fresh install and
 *  Edit → Save behave identically. */
export async function ensureWikiKeeperPermissions(
  vault: Vault,
  agentFolderPath: string,
): Promise<{ allow: string[]; deny: string[] }> {
  const permPath = normalizePath(`${agentFolderPath}/permissions.json`);
  const existing = vault.getAbstractFileByPath(permPath);

  let current: { allow: string[]; deny: string[] } = { allow: [], deny: [] };
  if (existing instanceof TFile) {
    try {
      const raw = await vault.cachedRead(existing);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const allow = Array.isArray(parsed.allow)
        ? parsed.allow.filter((v): v is string => typeof v === "string")
        : [];
      const deny = Array.isArray(parsed.deny)
        ? parsed.deny.filter((v): v is string => typeof v === "string")
        : [];
      current = { allow, deny };
    } catch {
      // Invalid JSON — treat as empty and overwrite below.
    }
  }

  const merged = {
    allow: dedupeMerge(current.allow, CANONICAL_ALLOW),
    deny: dedupeMerge(current.deny, CANONICAL_DENY),
  };

  const content = JSON.stringify(merged, null, 2) + "\n";
  if (existing instanceof TFile) {
    await vault.modify(existing, content);
  } else {
    await vault.create(permPath, content);
  }
  return merged;
}

function dedupeMerge(existing: string[], canonical: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of existing) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  for (const v of canonical) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Create the `_fleet/agents/<name>/` folder with all populated files. */
export async function createWikiKeeperAgent(
  vault: Vault,
  fleetFolder: string,
  input: WikiKeeperCreateInput,
): Promise<{ path: string; name: string }> {
  const name = agentNameFromSlug(input.scopeSlug || input.scopeRoot);
  const folderPath = normalizePath(`${fleetFolder}/agents/${name}`);

  // Ensure the agent folder exists.
  await ensureFolder(vault, folderPath);

  // Write the files. Fail loudly on any existing agent folder.
  const existing = vault.getAbstractFileByPath(normalizePath(`${folderPath}/agent.md`));
  if (existing) {
    throw new Error(`Wiki Keeper agent already exists at ${folderPath}. Delete it first or choose a different scope slug.`);
  }

  await vault.create(normalizePath(`${folderPath}/agent.md`), agentMd(name, input.scopeRoot));
  await vault.create(normalizePath(`${folderPath}/config.md`), configMd(input));
  await vault.create(normalizePath(`${folderPath}/HEARTBEAT.md`), heartbeatMd(input));
  await vault.create(normalizePath(`${folderPath}/CONTEXT.md`), CONTEXT_MD);
  await ensureWikiKeeperPermissions(vault, folderPath);

  // Sibling lint task — runs independently from the ingest heartbeat on the
  // task scheduler. User manages its cadence via the task editor afterwards.
  const taskPath = lintTaskPath(fleetFolder, name);
  if (!vault.getAbstractFileByPath(taskPath)) {
    await ensureFolder(vault, normalizePath(`${fleetFolder}/tasks`));
    await vault.create(taskPath, lintTaskMd(name));
  }

  // Seed the scope's own folders (inbox + topics + empty index + log).
  const scope = input.scopeRoot.trim();
  const scopePrefix = scope ? `${scope}/` : "";

  await ensureFolder(vault, normalizePath(`${scopePrefix}${input.inboxPath}`));
  await ensureFolder(vault, normalizePath(`${scopePrefix}${input.topicsRoot}`));

  await ensureFileWithDefault(
    vault,
    normalizePath(`${scopePrefix}${input.indexPath}`),
    `# Index\n\n<!-- wiki-keeper:begin -->\n<!-- wiki-keeper:end -->\n`,
  );
  await ensureFileWithDefault(
    vault,
    normalizePath(`${scopePrefix}${input.logPath}`),
    `# Log\n\n<!-- wiki-keeper:begin -->\n<!-- wiki-keeper:end -->\n`,
  );

  return { path: folderPath, name };
}

async function ensureFolder(vault: Vault, path: string): Promise<void> {
  if (vault.getAbstractFileByPath(path)) return;
  const segments = path.split("/");
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    if (vault.getAbstractFileByPath(current)) continue;
    try {
      await vault.createFolder(current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already exists")) throw err;
    }
  }
}

async function ensureFileWithDefault(vault: Vault, path: string, content: string): Promise<void> {
  if (vault.getAbstractFileByPath(path)) return;
  const parent = path.replace(/\/[^/]+$/, "");
  if (parent && parent !== path) await ensureFolder(vault, parent);
  await vault.create(path, content);
}

/** Operational fields a user can safely change after creation. Scope and
 *  paths are intentionally excluded — changing them after topic pages exist
 *  would orphan the content. If a user needs a different scope, delete and
 *  recreate. */
export interface WikiKeeperEditInput {
  watchedFolders: string[];
  excludePatterns: string[];
  watchedSince: string;
  heartbeatChannel: string;
  fileSubstantiveAnswers: boolean;
  obsidianUrlScheme: boolean;
  maxTokensPerIngest: number;
  maxTokensPerRefresh: number;
  indexSplitThreshold: number;
  dedupSimilarityThreshold: number;
  summaryStaleDays: number;
}

/** Update the `wiki_keeper:` block in an existing Wiki Keeper agent's
 *  config.md, plus the HEARTBEAT.md schedule/channel. */
export async function updateWikiKeeperAgent(
  vault: Vault,
  fleetFolder: string,
  agentName: string,
  edit: WikiKeeperEditInput,
): Promise<void> {
  const folderPath = normalizePath(`${fleetFolder}/agents/${agentName}`);

  // 1. config.md — update wiki_keeper block
  const configPath = normalizePath(`${folderPath}/config.md`);
  const configFile = vault.getAbstractFileByPath(configPath);
  if (!(configFile instanceof TFile)) {
    throw new Error(`Config file not found for ${agentName} at ${configPath}`);
  }
  const configRaw = await vault.cachedRead(configFile);
  const { frontmatter: cfmRaw, body: configBody } =
    parseMarkdownWithFrontmatter<Record<string, unknown>>(configRaw);
  const wk = (cfmRaw.wiki_keeper as Record<string, unknown> | undefined) ?? {};
  wk.watched_folders = edit.watchedFolders;
  wk.exclude_patterns = edit.excludePatterns;
  if (edit.watchedSince) wk.watched_since = edit.watchedSince;
  else delete wk.watched_since;
  // Schedules are no longer carried in config.md — heartbeat and the sibling
  // lint task own their own schedules. Strip stale fields left over from
  // earlier versions so they don't mislead users reading the file.
  delete wk.ingest_schedule;
  delete wk.lint_schedule;
  delete wk.lint_day;
  wk.file_substantive_answers = edit.fileSubstantiveAnswers;
  wk.obsidian_url_scheme = edit.obsidianUrlScheme;
  wk.max_tokens_per_ingest = edit.maxTokensPerIngest;
  wk.max_tokens_per_refresh = edit.maxTokensPerRefresh;
  wk.index_split_threshold = edit.indexSplitThreshold;
  wk.dedup_similarity_threshold = edit.dedupSimilarityThreshold;
  wk.summary_stale_days = edit.summaryStaleDays;
  // Backfill scope-derived fields that older keepers may lack.
  if (typeof wk.failed_path !== "string" || !wk.failed_path) {
    wk.failed_path = "_sources/failed";
  }
  cfmRaw.wiki_keeper = wk;
  // Strip legacy allowed_tools/blocked_tools from config.md if present —
  // those frontmatter fields are dead at runtime; permissions.json is the
  // canonical surface and we sync it via ensureWikiKeeperPermissions below.
  delete cfmRaw.allowed_tools;
  delete cfmRaw.blocked_tools;
  await vault.modify(configFile, stringifyMarkdownWithFrontmatter(cfmRaw, configBody));

  // Migrate / repair permissions.json to the current canonical allow + deny.
  // Idempotent: preserves user-added entries, adds any missing canonical
  // ones (e.g. Bash(mv *) for keepers created before that was canonical).
  await ensureWikiKeeperPermissions(vault, folderPath);

  // 2. HEARTBEAT.md — sync channel only. Schedule is owned by HEARTBEAT.md
  //    itself and edited via the agent editor; do not overwrite it here.
  const hbPath = normalizePath(`${folderPath}/HEARTBEAT.md`);
  const hbFile = vault.getAbstractFileByPath(hbPath);
  if (hbFile instanceof TFile) {
    const hbRaw = await vault.cachedRead(hbFile);
    const { frontmatter: hbFm, body: hbBody } =
      parseMarkdownWithFrontmatter<Record<string, unknown>>(hbRaw);
    if (edit.heartbeatChannel) hbFm.channel = edit.heartbeatChannel;
    else delete hbFm.channel;
    await vault.modify(hbFile, stringifyMarkdownWithFrontmatter(hbFm, hbBody));
  }

  // 3. Sibling lint task — create if missing. If it already exists, leave its
  //    schedule alone; the user owns it via the task editor.
  const taskPath = lintTaskPath(fleetFolder, agentName);
  const existingTask = vault.getAbstractFileByPath(taskPath);
  if (!(existingTask instanceof TFile)) {
    await ensureFolder(vault, normalizePath(`${fleetFolder}/tasks`));
    await vault.create(taskPath, lintTaskMd(agentName));
  }
}

/** Delete a Wiki Keeper agent folder. Leaves the scope's own content
 *  (inbox, topics, index, log) untouched — that's the user's wiki, not ours. */
export async function deleteWikiKeeperAgent(
  vault: Vault,
  fleetFolder: string,
  agentName: string,
): Promise<void> {
  const folderPath = normalizePath(`${fleetFolder}/agents/${agentName}`);
  const folder = vault.getAbstractFileByPath(folderPath);
  if (!folder) return;
  if (!(folder instanceof TFolder)) {
    throw new Error(`Expected folder at ${folderPath}`);
  }
  await vault.adapter.rmdir(folderPath, true);

  // Also delete the sibling lint task file, if present.
  const taskPath = lintTaskPath(fleetFolder, agentName);
  const taskFile = vault.getAbstractFileByPath(taskPath);
  if (taskFile instanceof TFile) {
    await vault.delete(taskFile);
  }
}
