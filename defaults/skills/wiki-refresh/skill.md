---
name: wiki-refresh
description: "Regenerate the `## Summary` block at the top of topic pages whose append-only claim list has outgrown the existing summary. Bounded by token budget; never touches user prose or claim history."
tags:
  - wiki-keeper
  - knowledge
  - refresh
---

# wiki-refresh

You are running the **synthesis refresh phase** of a scoped Wiki Keeper. Topic pages accrue dated bullets forever in `## Claims` (and sometimes `## Contradictions`); without a refresh, the top-of-page synthesis goes stale and every wiki-query read pays the full claim-history token cost. This skill rewrites a small, fenced summary block at the top of each candidate page so query reads stay cheap and the page actually summarizes what it knows.

## Scope resolution

Read `wiki_keeper:` from the calling agent's `config.md`:
- `scope_root`, `topics_root`, `log_path`
- `max_tokens_per_refresh` (default 30000) — hard cap on this run
- `exclude_patterns`

All paths resolve relative to `scope_root` unless otherwise noted. **Never write outside `scope_root`.**

## When to run

Three triggers, all valid:

1. **End-of-ingest (default).** `wiki-ingest` calls you with the list of pages it touched. Refresh only those that meet the threshold (see below).
2. **Manual.** User says "refresh `[[topic]]`", "refresh stale", or "refresh all". `all` ignores thresholds; `stale` uses them.
3. **Weekly via lint.** `wiki-lint` flags pages with stale summaries; the lint task can chain this skill.

## Refresh threshold

A page is a refresh **candidate** when ANY of:
- `claim_count_now - frontmatter.claims_at_refresh ≥ 5`
- `summary_refreshed` is missing or older than 30 days, AND the page has ≥1 claim
- `## Contradictions` section was added or extended since `summary_refreshed`
- The caller explicitly passed the page in (end-of-ingest mode skips the threshold for caller-supplied pages but still respects token budget)

Pages with zero claims and no user prose are **skipped** — there's nothing to summarize.

## The summary block convention

Every topic page has a fenced summary block immediately after frontmatter, before any user content or `## Claims`. Two HTML comments mark the bounds:

```markdown
---
type: entity
name: Vendor X
summary_refreshed: 2026-04-26
claims_at_refresh: 14
---

<!-- wiki-keeper:summary:begin -->
## Summary

- Vendor X is the incumbent CRM provider for the Acme team since 2024.
- Pricing increased 15% in Q1 2026; renewal negotiation owned by [[procurement]].
- Reliability has been stable but support response degraded over Q4 2025
  (see [[_topics/contradictions/vendor-x-uptime]]).
- Active alternatives evaluated: [[vendor-y]], [[vendor-z]].
<!-- wiki-keeper:summary:end -->

## Claims

- 2026-04-18: from [[meetings/2026-04-18-vendor-sync|vendor-sync]]: Vendor X raised prices 15%
- 2026-04-12: from [[summaries/2026-04-12-renewal-brief|renewal-brief]]: contract auto-renews 2026-12-01
- ...
```

You write **only** within the fenced block. The `## Claims` section, `## Contradictions` section, and any user-authored prose elsewhere on the page are **read-only** to you.

If a candidate page does not yet have the fenced block, create it: insert immediately after the closing `---` of frontmatter (or at top if no frontmatter), with one trailing blank line before the next section.

## Procedure

1. **Candidate list.**
   - If caller passed pages: use those (still apply token budget).
   - If "refresh all": every page under `<topics_root>/` (excluding `exclude_patterns` and `<topics_root>/syntheses/` — those are already syntheses).
   - If "refresh stale" or invoked from lint: scan all pages, keep only those meeting the threshold above.
2. **Order by churn.** Sort candidates by `claim_count_now - claims_at_refresh` descending so the most-changed pages refresh first under a tight token budget.
3. **For each candidate, until budget exhausted:**
   1. Read the full page.
   2. Parse: frontmatter, summary block (if present), `## Claims` bullets, `## Contradictions` bullets, any user prose outside our blocks.
   3. Synthesize a fresh summary:
      - **3–7 bullets**, each one sentence.
      - Cover: what this page is, the most durable facts, current status, key relationships (forward-link to other topics with `[[…]]`), unresolved contradictions if any.
      - Prefer the most recent claims when older claims have been superseded — if a 2026-04 claim contradicts a 2025-09 claim, the summary reflects 2026-04 unless `## Contradictions` flags a still-open dispute.
      - Cite supporting claims by date inline only when ambiguity helps (e.g., "as of 2026-04…"). Don't repeat the claim history.
      - Preserve user-authored prose elsewhere on the page; do NOT pull it into the summary unless it's clearly a fact about the entity. When in doubt, leave it where the user wrote it.
   4. Write back: replace the block contents (or insert a new fenced block at the correct position).
   5. Update frontmatter:
      - `summary_refreshed: <today ISO>`
      - `claims_at_refresh: <current claim count>`
      - Preserve all other frontmatter fields exactly.
   6. Track tokens spent on this page; if running close to budget, finish the current page cleanly then stop.
4. **Log.** Append one consolidated entry to `<log_path>` (inside the fenced `<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->` block):
   ```
   - YYYY-MM-DD HH:MM refresh: regenerated N summaries (covered: [[a]], [[b]], …); skipped M for budget
   ```

## Counting claims

A "claim" is one bullet under `## Claims` or `## Contradictions` matching the dated pattern `- YYYY-MM-DD ...`. Lines without a leading date prefix don't count (they're prose, not append-mode entries).

## Rules

- **Only the summary block is yours.** Never edit `## Claims`, `## Contradictions`, or user-authored sections.
- **No new claims.** This skill never invents facts not already present in the page's claim history or its forward-linked pages. If the claim history is sparse, the summary is sparse — that's fine.
- **No external knowledge.** No training-data facts. The summary is a *synthesis of what's on the page*, nothing else.
- **Idempotent.** Running refresh twice in a row on an unchanged page should produce the same summary (modulo trivial wording). Don't introduce churn for its own sake — if `claims_at_refresh` matches the current count and the existing summary is reasonable, skip and don't bump `summary_refreshed`.
- **Forward-links earn their place.** Any `[[…]]` in the summary must point to a page that actually exists in the scope. Verify before writing.
- **Wiki-keeper marker.** Pages refreshed by this skill carry the `wiki-keeper` tag (already set by ingest); don't re-add it.

## Token budget

- Hard cap: `max_tokens_per_refresh` from config (default 30000).
- When approaching the cap, finish the in-flight page, log how many candidates were skipped, and stop. The next ingest cycle will pick them up.
- Per-page soft cap: ~3000 tokens of read + write. Pages with a huge claim history (>200 claims) get a *capped read* of the most recent 100 claims plus the full `## Contradictions` section — older claims are assumed already reflected in the prior summary.

## Output

Short summary of the refresh pass: count refreshed, count skipped, list of pages touched. The heartbeat broadcasts this if a channel is configured.

## What NOT to do

- Never modify `## Claims` history.
- Never modify `## Contradictions` content.
- Never modify user-authored prose.
- Never change frontmatter fields other than `summary_refreshed` and `claims_at_refresh`.
- Never delete a topic page.
- Never reformat or restructure the page beyond writing your fenced block.
- Never run this on `<topics_root>/syntheses/` pages — those are already syntheses; double-summarizing them adds nothing.
- Never invoke this skill from a consumer agent. It's keeper-mode only; only the keeper that owns the scope refreshes it.
