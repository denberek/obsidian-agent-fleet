---
name: wiki-ingest
description: "Ingest new sources into a scoped wiki. Two modes: inbox (destructive — summarize and archive) and watched (non-destructive — extract durable claims into topic pages on hash change). Ends by invoking wiki-refresh on touched pages."
tags:
  - wiki-keeper
  - knowledge
  - ingest
---

# wiki-ingest

You are running the **ingestion phase** of a scoped Wiki Keeper. Use this skill when the user or a heartbeat asks you to ingest, or when the prompt references new files in `_sources/inbox/` or changes in watched folders.

## Scope resolution

Your scope config is in the calling agent's `config.md` under the `wiki_keeper:` block. Read it **first**. Resolve every path in this skill relative to `scope_root`:

- `inbox_path` (default `_sources/inbox`)
- `archive_path` (default `_sources/archive`)
- `failed_path` (default `_sources/failed`)
- `topics_root` (default `_topics`)
- `index_path` (default `index.md`)
- `log_path` (default `log.md`)
- `state_file` (default `.wiki-keeper-state.json`)
- `watched_folders` — list, vault-relative
- `exclude_patterns` — glob list, vault-relative
- `watched_since` — optional ISO date (YYYY-MM-DD). In watched mode, skip any file whose mtime is strictly older. Missing or empty = no cutoff.
- `max_tokens_per_ingest` — hard cap on this run
- `max_tokens_per_refresh` (default 30000) — separate budget for the end-of-run refresh phase
- `index_split_threshold` (default 100) — when total topic pages exceeds this, split index into per-type sub-MOCs

(Lint runs on its own schedule via a sibling `*-lint` task — do NOT run wiki-lint as part of this skill.)

**Never write outside `scope_root`.** If scope_root is empty, treat the whole vault as the scope.

## Touched-pages ledger

Maintain an in-memory list `touched_pages: Set<string>` for this run. Every time you create or append to a topic page (in either mode), record its path. The end-of-run **Refresh phase** consumes this list.

## State file shape

The state file lives at `<scope_root>/<state_file>` and tracks both watched-mode mtimes and content hashes plus inbox-mode failure counts:

```json
{
  "mtimes": { "<vault-relative path>": "<ISO8601>" },
  "hashes": { "<vault-relative path>": "<sha1-hex>" },
  "lastIngest": "<ISO8601>",
  "failures": {
    "<inbox-relative filename>": { "count": 2, "lastError": "...", "lastAttempt": "<ISO8601>" }
  }
}
```

If the file is missing, all maps are empty.

## Three phases — run in order

1. **Inbox mode** (destructive)
2. **Watched mode** (non-destructive, hash-gated)
3. **Refresh phase** (synthesis refresh on touched pages)

---

### Phase 1 — Inbox mode (destructive)

1. List every file under `<scope_root>/<inbox_path>/` excluding `exclude_patterns`.
2. For each file, in order:
   1. Check `state.failures[<filename>]`. If `count >= 3`, **quarantine** the file: `mv` it to `<failed_path>/<filename>` and write a sidecar `<failed_path>/<filename>.error.md` containing `count`, `lastError`, `lastAttempt`. Skip processing. Continue.
   2. Read the content. For PDFs use the `pdf` skill; for docx/xlsx use those skills. **Verify** these skills are attached to the agent before invoking — if missing, treat as a failure (see step 7) with error "missing skill: pdf".
   3. Identify the **subjects** the file covers (entities, concepts, events).
   4. Pick a **source-type tag** for bullets emitted from this file: `[email]` (`.eml`/`.msg`), `[doc]` (`.pdf`/`.docx`/`.xlsx`), `[note]` (`.md`), `[web]` (clipped HTML or URL drop), `[other]` otherwise. The tag rides on every dated bullet you append (see the bullet format below).
   5. For each subject, grep `<scope_root>/<topics_root>/` for an existing page. If missing, **create** `<topics_root>/<slug>.md` with:
      - Frontmatter: `type:` (entity / concept / event), plus `summary_refreshed: ""`, `claims_at_refresh: 0`, plus type-specific fields per `CONTEXT.md`.
      - A fenced summary block right after frontmatter:
        ```
        <!-- wiki-keeper:summary:begin -->
        <!-- wiki-keeper:summary:end -->
        ```
      - A `## Claims` section header.
      - Record the page in `touched_pages`.
   6. Write a **summary page** at `<topics_root>/summaries/YYYY-MM-DD-<source-slug>.md` with frontmatter `{ type: summary, source: <original filename>, date: <today> }` and a concise summary of the source. This is *not* a refreshable topic page — it has no fenced summary block.
   7. For each subject, append a dated sub-entry to that topic page's `## Claims` section:
      ```
      - YYYY-MM-DD [doc]: from [[summaries/YYYY-MM-DD-<source-slug>]]: <one-sentence claim>
      ```
      The `[doc]` (or other) tag is the source-type. Add the page to `touched_pages` if not already present.
   8. Update `<index_path>` inside the fenced `<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->` block — see **Index maintenance** below for handling growing indexes.
   9. **Move** (not copy) the source from `<inbox_path>/` to `<archive_path>/YYYY/MM/<original filename>`. Use Bash `mv`, not Write. First run `mkdir -p <archive_path>/YYYY/MM/`, then `mv <inbox_path>/<file> <archive_path>/YYYY/MM/<file>`. Both `YYYY` and `MM` are zero-padded.
   10. On success: clear `state.failures[<filename>]`.
3. **On per-file failure** (any step throws or returns an error): increment `state.failures[<filename>].count`, set `lastError` to the error message and `lastAttempt` to now ISO. Leave the source in the inbox. Do NOT abort the whole run; continue with the next file. The 3-strikes rule in step 2.1 quarantines persistently failing sources.
4. Append a log entry to `<log_path>` (fenced):
   ```
   - YYYY-MM-DD HH:MM inbox: processed N files; created [[x]], [[y]]; updated [[a]], [[b]]; quarantined K
   ```

### Phase 2 — Watched mode (non-destructive, hash-gated)

1. Load the state file (see shape above).
2. For each path in `watched_folders` (resolved relative to vault root, not scope_root — watched folders may sit anywhere):
   1. List every file in the folder, recursively, excluding `exclude_patterns`.
   2. For each file, read its mtime. Apply the `watched_since` filter (skip strictly older).
   3. **Hash gate.** Compute `sha1` of the normalized content (strip trailing whitespace per line, normalize line endings to `\n`). If `state.hashes[<path>] == new_hash`, skip — file content is unchanged even if mtime moved (handles iCloud/Obsidian Sync touch-without-edit). If different or missing, queue for processing.
3. For each file to process:
   1. Read it.
   2. Pick the source-type tag for the file's folder (e.g. `meetings/` → `[meeting]`; `daily-notes/` → `[note]`; transcripts → `[meeting]`; otherwise `[note]`).
   3. Identify every **distinct subject** the file touches — each person, org, product, project, concept, meeting, decision, or event mentioned is its own subject. A single daily note or meeting transcript typically yields 3–10 subjects, not one.
   4. For **each subject**, locate or create its own topic page under `<topics_root>/` (per `CONTEXT.md`). New pages get the same scaffolding as inbox-mode (frontmatter + fenced summary block + `## Claims` section). Add to `touched_pages`.
   5. Extract ONLY **durable claims** about each subject — decisions, commitments, key facts, entity relationships, concept definitions. Skip small talk, noise, procedural details, and anything not worth remembering in a week.
   6. **Idempotency check.** Before appending, grep the target page's `## Claims` section for an existing line `- YYYY-MM-DD <tag>: from [[<source-path>...` matching today's date AND this source path. If present and the claim text is substantively the same, **skip** — don't append a duplicate. (This is the dedup safety net for re-runs after a hash false-positive or partial failure.)
   7. Append each claim as a dated sub-entry **to the topic page of the subject it's about**, with the source-type tag and forward wikilink back to the source:
      ```
      - YYYY-MM-DD [meeting]: from [[meetings/2026-04-18-vendor-sync|vendor-sync]]: Vendor X raised prices 15%
      ```
   8. **Do NOT** create a summary page for this file.
   9. **Do NOT** open the source file for write. Only read.
4. Update `state.mtimes[<path>]` and `state.hashes[<path>]` for every successfully processed file. Update `state.lastIngest`.
5. Append one consolidated log entry: `- YYYY-MM-DD HH:MM watched: processed N files across M folders; updated [[x]], [[y]]`.

#### Anti-patterns for watched mode

- ❌ **One dump page per source.** Topic pages are organized by *subject*, not by *source*. A Monday standup mentioning Alice, Project X, and a pricing decision produces entries on **three different pages**, each linking back to the standup note.
- ❌ **One catch-all concept page.** Concept pages are for specific ideas/techniques/patterns, not for "things from yesterday's meeting."
- ❌ **Rewriting the source.** Watched files are read-only; never modify, move, or delete them.
- ❌ **Creating a summary page** (`type: summary`). Those are inbox-mode only.

### Phase 3 — Refresh phase (synthesis)

After both ingest phases finish, **invoke the `wiki-refresh` skill** with the `touched_pages` set as input.

- Refresh threshold from `wiki-refresh` applies (≥5 new claims, or 30-day stale, or new contradictions). Caller-supplied list bypasses the staleness check but still respects the per-page delta.
- Refresh has its **own** token budget (`max_tokens_per_refresh`). It does not share the ingest budget.
- If `wiki-refresh` is not attached to this agent, log a warning and skip — don't fail the ingest run.

The refresh phase is what keeps every cited topic page query-cheap. Do not skip it routinely.

---

## Index maintenance

The default `index.md` carries a single fenced block listing every topic page alphabetically. As the wiki grows this becomes unwieldy.

**Sub-MOC split.** When the count of pages directly under `<topics_root>/` exceeds `index_split_threshold` (default 100), or when any single `type:` exceeds 30 pages, switch to a hub-of-hubs layout:

- `index.md` becomes a thin top-level hub with one section per page-type, each pointing at a sub-MOC: `[[index/entities]]`, `[[index/concepts]]`, `[[index/events]]`.
- Per-type indexes live at `<topics_root>/index/<type>.md` (or, if `topics_root != "_topics"`, at `<scope_root>/index/<type>.md`). Each is its own fenced-block MOC listing pages of that type.
- Once split, every new topic page goes into the matching sub-MOC, not the root index.

Detect the split state by checking for `<scope_root>/index/` existing. Once present, never write topic-page entries directly into the root `index.md`'s fenced block — only into the relevant sub-MOC.

---

## Rules that apply to all phases

- **Preserve user-authored content.** When updating a page, find the append zone (`## Claims`, `## Contradictions`, end of file). Never rewrite sections you didn't create.
- **Wikilinks only.** All internal links are `[[path|Display]]`.
- **Contradictions.** When a new claim contradicts an existing one on the same topic page, add it under `## Contradictions` with a dated entry. Do NOT silently overwrite. Flag in the log: `- CONFLICT: [[topic]] — new source contradicts earlier claim`.
- **Fenced writes.** `<index_path>` and `<log_path>` may contain user-authored content outside our fenced blocks. Only modify within `<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->`. If the file doesn't yet have those markers, create them and place all your content between them, preserving any pre-existing user content above and below.
- **Token budget.** `max_tokens_per_ingest` caps inbox + watched. If you approach the limit, stop processing new files, log what was skipped, and proceed to the Refresh phase (which has its own budget). The next cycle resumes.
- **Frontmatter conventions.** See `CONTEXT.md` for page types. Always include `type:` on new pages, plus the empty `summary_refreshed`/`claims_at_refresh` slots.

## Output

On success: short summary — counts per phase, main topic names, refresh count. The heartbeat broadcasts this if a channel is configured.

On failure: list what succeeded, what failed, what's quarantined, and log the failures.

## What NOT to do

- Never delete user-authored pages.
- Never modify a watched source file.
- Never move a watched source file.
- Never write outside `scope_root` (except *reading* watched folders).
- Never summarize training-data knowledge — stick to actual sources.
- Never create per-day summary pages for watched-source daily notes — that floods the wiki. Use topic-page updates only.
- Never write the `## Summary` block by hand — that's `wiki-refresh`'s job. Leave the fenced block empty on new pages; refresh fills it.
