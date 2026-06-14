---
name: wiki-lint
description: "Weekly health check for a scoped wiki. Finds orphans, stale pages, missing cross-links (bidirectional), contradictions, schema violations, index drift, dedup candidates, and stale summaries. Proposes fixes; auto-applies only deterministic ones; can chain wiki-refresh for stale summaries."
tags:
  - wiki-keeper
  - knowledge
  - lint
---

# wiki-lint

You are running the **weekly lint pass** on a scoped wiki. Your job is to find problems, propose fixes, and auto-apply ONLY deterministic ones. Judgment calls go in a "Needs review" list for the user.

## Scope resolution

Read `wiki_keeper:` from the calling agent's `config.md`:
- `scope_root`
- `topics_root`, `index_path`, `log_path`
- `state_file`, `failed_path`
- `watched_folders`
- `dedup_similarity_threshold` (default 0.82) — Levenshtein-similarity ratio above which two page titles get flagged as a possible merge.
- `summary_stale_days` (default 30) — pages whose `summary_refreshed` is older than this with claims since are stale.

All paths resolve relative to `scope_root` unless otherwise noted.

## Checks to run

### 1. Orphan topic pages
For each page under `<scope_root>/<topics_root>/`, check its inbound backlink count via Grep. Flag pages with zero inbound links.

**Exempt:** `<topics_root>/syntheses/` pages whose frontmatter is `type: synthesis` AND that have at least one outbound forward-link to a topic page they cite. Syntheses earn their place by linking out, not in. (If a synthesis has zero outbound links AND zero inbound links, flag it — it's truly an orphan.)

### 2. Missing forward-links from summaries
For each page under `<topics_root>/summaries/`, read its content. Case-insensitively match against slugs of existing topic pages. If the summary mentions a topic without a `[[wikilink]]` to it, flag — suggest adding the link.

### 3. Bidirectional cross-link gaps (NEW)
Build the wikilink graph: parse every `[[link]]` in every topic page (excluding the `## Claims` history — claim-source links are unidirectional by design, watched-source files don't link back). For each edge `A → B` in topic-summary-or-prose space, check whether `B → A` exists somewhere on `B` (summary, prose, or `## Claims`). When asymmetric:

- If `A` is referenced in `B`'s `## Claims` already — it counts as bidirectional, no flag.
- Otherwise, propose adding a forward-link from `B` to `A` in `B`'s summary block — but **don't auto-apply**: the summary block is `wiki-refresh`'s territory, not ours. Add to `Needs review` with the proposed wording, OR mark for `wiki-refresh` to consider on its next pass.

### 4. Contradictions >30 days old
Grep for `## Contradictions` sections across `<topics_root>/`. Within each, find dated entries older than 30 days. Flag for user review.

### 5. Stale events
For each page with frontmatter `type: event` and `date: YYYY-MM-DD`, compute age. If >12 months AND no other page links forward to it in the last 90 days, flag as stale. Don't auto-archive — just flag.

### 6. Index drift
Compare `<index_path>` content (within our fenced block) — and any sub-MOCs under `<scope_root>/index/<type>.md` if the split layout is in use — to the actual list of pages under `<topics_root>/`. Flag:
- Pages in the topics root but missing from index (suggest adding)
- Index entries whose target file no longer exists (suggest removing)
- Index split threshold reached but no split performed (suggest running `wiki-ingest` to trigger the split, or split manually).

### 7. Schema violations
For each page under `<topics_root>/`, verify required frontmatter per `CONTEXT.md`:
- `type:` field present (entity | concept | event | summary | synthesis)
- `type: event` pages must have `date:`
- `type: summary` pages must have `source:`
- Topic pages of types entity/concept/event SHOULD have `summary_refreshed` and `claims_at_refresh` slots (deterministic auto-fix: add empty values).

**Auto-apply:** add missing `type:` when the path makes it deterministic (`<topics_root>/summaries/X.md` → `type: summary`; `<topics_root>/syntheses/X.md` → `type: synthesis`); add empty `summary_refreshed: ""` and `claims_at_refresh: 0` slots when missing on entity/concept/event pages. Everything else is "Needs review".

### 8. Watched-source drift
Read `<state_file>`. For each entry whose source file no longer exists (user deleted or renamed it), find topic-page entries that forward-link back to that dead source path. Flag — suggest updating the entry. **Auto-apply:** strip the dead entry from `state.mtimes` and `state.hashes` so the source isn't tracked further.

### 9. Stale summaries (NEW)
For each topic page with `summary_refreshed:` set, compute age in days. Flag pages where:
- `summary_refreshed` is older than `summary_stale_days` AND `claim_count_now > claims_at_refresh` (claims accrued since last refresh), OR
- `summary_refreshed` is missing AND the page has ≥1 claim.

If `wiki-refresh` is attached to this agent, **chain it** at the end of the lint run with the stale-page list (subject to `max_tokens_per_refresh`). Otherwise log the list under `Needs review` for the user to trigger manually.

### 10. Dedup candidates (NEW)
For each pair of topic pages of the same `type:` whose slug similarity exceeds `dedup_similarity_threshold` (Levenshtein-ratio over normalized slugs), AND whose claim sources overlap by ≥1 source path, propose a merge.

**Never auto-merge.** Always `Needs review`. Output the proposal in the form:
- *"Possible merge: [[vendor-x]] and [[vendor-X]] (similarity 0.94, 3 shared sources). Suggested canonical: `vendor-x` (older). Manual merge needed — keep one, delete the other, redirect inbound links."*

### 11. Failed-source review (NEW)
List anything in `<failed_path>/` (the inbox quarantine). For each, surface filename, attempt count, and last error. Flag for user review — broken sources are a quality signal worth seeing weekly.

## Reporting

Write ONE dated report to `<log_path>` under a `## Lint YYYY-MM-DD` heading (inside the fenced `<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->` block):

```markdown
## Lint 2026-04-26

### Summary
- Orphans: 2 (1 exempt synthesis)
- Missing forward-links from summaries: 1
- Bidirectional gaps: 4
- Old contradictions: 0
- Stale events: 3
- Index drift: 1 addition / 0 removals (split threshold NOT reached)
- Schema violations: 4 (3 auto-fixed)
- Watched-source drift: 1 (auto-stripped from state)
- Stale summaries: 7 (refresh chained: 5 covered, 2 deferred for budget)
- Dedup candidates: 2
- Failed sources in quarantine: 1

### Auto-applied
- Added `type: summary` to [[_topics/summaries/2026-04-10-vendor-brief]]
- Added `summary_refreshed: ""` slot to [[_topics/vendor-x]]
- Stripped dead path `meetings/2026-02-08-old-sync.md` from state file

### Needs review
- Orphan: [[_topics/old-proposal]] has no inbound links. Consider linking from [[index]] or archiving.
- Bidirectional: [[vendor-x]] mentions [[procurement]] in summary, but [[procurement]] has no link back. Propose adding to procurement's summary.
- Stale event: [[_topics/events/q3-kickoff]] (date: 2025-09-10) with no recent references. Archive?
- Contradiction in [[_topics/vendor-x]] from 2026-03-12 still unresolved (45 days old).
- Possible merge: [[vendor-x]] and [[vendor-X]] (similarity 0.94, 3 shared sources). Suggested canonical: `vendor-x`.
- Failed source: `bad-pdf.pdf` (3 attempts, last error: "missing skill: pdf"). Attach the `pdf` skill or remove the file.

### Refresh chained
- Refreshed: [[vendor-x]], [[pricing-q3]], [[alice]], [[project-acme]], [[vendor-y]]
- Deferred (budget): [[concept-event-sourcing]], [[meeting-cadence]]
```

## Rules

- **Only auto-apply deterministic fixes.** Adding missing `type:` inferable from path = deterministic. Merging two topic pages = judgment call → "Needs review" only.
- **Never delete user content.** Flagging an orphan is fine; deleting the orphan is not.
- **Never auto-rename pages.** That breaks every inbound link.
- **Never modify watched source files.**
- **Never modify summary blocks.** That's `wiki-refresh`'s territory.
- **One lint report per run.** If called twice in the same day, the second run replaces the day's report.

## Optional broadcast

If the agent's heartbeat channel is set, output a short one-paragraph summary of the lint findings suitable for Slack/Telegram. Include a link to the full report in the log.

## What NOT to do

- Never restructure the topic taxonomy as a lint action.
- Never silently fix something that required judgment — log it.
- Never suggest fixes outside `scope_root`.
- Never auto-merge dedup candidates.
- Never overwrite `## Summary` blocks — that's `wiki-refresh`.
