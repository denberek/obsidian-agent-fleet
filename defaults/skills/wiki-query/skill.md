---
name: wiki-query
description: "Answer a question strictly from wiki content. Works in two modes: keeper (queries your own scope, enforces isolation, compounds substantive answers back into the wiki) and consumer (queries one or more referenced scopes via wiki_references). Every factual claim cites a vault page. Refuses to hallucinate."
tags:
  - wiki-keeper
  - knowledge
  - query
---

# wiki-query

You answer questions against the **current state of one or more wikis**. Your answer is grounded strictly in the wiki pages you have access to — never in training-data knowledge.

You operate in one of two modes, chosen by what's in your agent's `config.md`.

## Mode A — Keeper (your own scope)

Triggered when the agent has a `wiki_keeper:` block.

- Resolve paths relative to `wiki_keeper.scope_root`.
- Search `<scope_root>/<topics_root>/` only. Never cross into another scope.
- If the question seems to relate to a different scope, reply: *"This is outside the `<scope_root>` scope. Ask `@wiki-keeper-<other-scope>` for their take."*
- Respect `file_substantive_answers` (default `true`) and `obsidian_url_scheme`.

## Mode B — Consumer (reference one or more scopes)

Triggered when the agent has a `wiki_references:` block (typically without a `wiki_keeper:` block).

- The prompt-build layer has injected a `## Wiki Access` section listing every wiki you can read, with each one's scope root, topics path, index path, and inbox path. **That section is your source of truth.**
- When answering, **name which scope each citation belongs to** if more than one wiki is referenced.
- When the user shares a durable claim that isn't in any referenced wiki yet, **write a short markdown file to the relevant wiki's inbox** at `<inbox>/YYYY-MM-DD-<slug>.md`. The keeper files it canonically on its next ingest. Do NOT write to `<topics-path>/` directly.
- Never answer from training-data knowledge.

## Shared procedure (both modes)

1. Parse the question. Identify key entities, concepts, timeframes.
2. **Search** the topics path(s) using Grep with keyword variants. Weight results by inbound backlink count — central pages are more authoritative.
3. **Read** the top N candidate pages (default 5, cap 10 for broad questions). Prefer reading just the `## Summary` block first if present — it's the curated synthesis. Only fall back to `## Claims` history when the summary doesn't answer the question.
4. **Follow one hop** — for each candidate, check `[[wikilinks]]` in the summary and optionally read one linked page per candidate if clearly relevant.
5. **Synthesize** the answer. Every factual claim must be followed by a citation `[[path|Display]]`. Multiple citations per claim are welcome.
6. **Provenance line.** For each cited page, note its `summary_refreshed` (or file mtime if no summary). Add a one-line provenance footer at the end of your answer:
   > _Sources: [[vendor-x]] (refreshed 2026-04-25), [[pricing-q3]] (mtime 2026-03-12)_
   This is the user's signal that a cited page is stale.
7. If the wiki doesn't contain the answer, say so **explicitly**: *"I don't see this in the `<scope>` wiki. Last ingest was <lastIngest if available>. You may want to add relevant sources to `<inbox>/`."* Do NOT fabricate.
8. For external-channel replies (Slack/Telegram) when `obsidian_url_scheme` is on, convert `[[topic-path|Display]]` citations to `obsidian://open?vault=<vault>&file=<full-path>` URLs.

## Compounding — Mode A only (Keeper)

Karpathy's central claim: valuable answers should file themselves back into the wiki rather than disappear into chat. When `file_substantive_answers: true` (default) AND the synthesized answer is **substantive** (>500 tokens of unique synthesis, OR introduces a connection between topics that isn't yet in their pages, OR resolves an open contradiction), do BOTH:

1. **Synthesis page.** Write `<topics_root>/syntheses/YYYY-MM-DD-<question-slug>.md` with frontmatter `{ type: synthesis, question: <q>, refreshed: <today> }` and the answer body. Forward-link from this page to every cited topic. Forward-link from `index.md` (or the `index/syntheses.md` sub-MOC if split) so this synthesis isn't an orphan on next lint.
2. **Topic-page bullets.** For each cited topic page, append a dated bullet to its `## Claims` section:
   ```
   - YYYY-MM-DD [synthesis]: from [[syntheses/YYYY-MM-DD-<question-slug>|<short label>]]: <one-sentence takeaway specific to this topic>
   ```
   This is what makes the wiki compound from queries — every substantive Q&A leaves a per-topic trace, not just a sidecar synthesis.

After compounding writes, the next end-of-ingest refresh phase will pick up the touched topic pages naturally (their claim count delta crosses the threshold). No need to invoke `wiki-refresh` directly from this skill.

**Skip compounding** when:
- The answer is short (<500 tokens) and just restates an existing summary.
- The user prefixed the question with `/quick` or asked a yes/no.
- `file_substantive_answers: false`.

In Mode B (Consumer), compounding looks different: drop a markdown file into the relevant wiki's inbox per the consumer-mode rules. Do NOT write to `<topics-path>/` directly — that's the keeper's job.

## Rules

- **Wiki-grounded only.** If a claim isn't in any accessible wiki page, you don't know it.
- **Cite everything.** Un-cited claims are a bug.
- **Provenance footer.** Every answer ends with the sources line including refresh/mtime dates.
- **Name the scope** in consumer mode when citations come from more than one wiki.
- **Be concise.** Long prose with citations beats exhaustive prose. Group related claims under one citation rather than repeating it.
- **Compounding is in Keeper mode only.** Consumer mode files claims to the inbox; the keeper synthesizes.

## Output shape

1. **TL;DR** — one or two sentences that actually answer, with citations.
2. **Details** — bullets of specific claims, each cited.
3. **What the wiki is missing** (if relevant) — explicit note about gaps.
4. **Sources** (provenance footer) — `[[page]] (refreshed YYYY-MM-DD)` per citation, one line.
5. **Filed back** (Keeper compounding only, when triggered) — list the synthesis page path and the topic pages bulleted.
6. **Suggested inbox drop** (Consumer mode only, when the user shared new durable claims mid-answer) — list the file(s) you wrote to the inbox.

## What NOT to do

- Never answer from general knowledge.
- Never cite external URLs (only vault pages).
- Never rewrite topic page summary blocks (`<!-- wiki-keeper:summary:* -->`). Refresh owns those.
- Never modify `## Claims` history.
- In Keeper mode, only append to `## Claims` (compounding bullets) and only write under `<topics_root>/syntheses/`. Never edit other parts of topic pages.
- In Consumer mode, never write outside `<inbox>/`.
- Never cross-reference between scopes unless the user asked a cross-scope question — and even then, be explicit about which scope each page belongs to.
