# Wiki Keeper — Setup & Usage Guide

**Turn any folder in your vault into a self-maintaining wiki.**

Wiki Keeper is a feature of [Agent Fleet](README.md) — a scoped agent that ingests sources you drop into an inbox, watches folders you already maintain (like daily notes or meeting transcripts), and builds an interlinked `_topics/` tree with cross-references and citations. It runs on its own schedule, never rewrites your sources, and every output is plain markdown you can read, edit, or walk away from.

This guide covers everything a user needs to set it up and use it day-to-day. If you want the deeper design rationale, see [WIKI_KEEPER_DESIGN.md](WIKI_KEEPER_DESIGN.md).

---

## What it does, in one paragraph

You drop things — PDFs, forwarded emails, clipped articles — into a folder called `_sources/inbox/`. Overnight, a Wiki Keeper agent reads them, extracts entities and decisions, writes (or updates) topic pages like `_topics/vendor-x.md` and `_topics/q3-pricing-decision.md`, cross-links them with Obsidian wikilinks, logs what it did, and archives the raw sources. Separately, you can point the keeper at folders you already maintain (daily notes, meeting transcripts) as **watched** sources — it reads them in place, extracts durable claims, and never moves or modifies them. Ask the keeper a question via chat or Slack → it greps its `_topics/` tree and answers with citations. Every factual claim cites a vault page; it refuses to fabricate beyond what's in the wiki.

---

## When to use it

**Good fit:**
- You collect a lot of web pages, PDFs, meeting notes, or emails related to one project or topic.
- You already use Obsidian and want an AI agent to do the "organize into topic pages" work you keep meaning to do.
- You want a cited, queryable knowledge base that belongs to you and lives in plain markdown.
- You want cross-references emerging without manually managing them.

**Not a fit:**
- You want a general research agent that browses the web. (Wiki Keeper only uses what you feed it.)
- You want to replace Obsidian Bases / Dataview / Templater. Wiki Keeper composes with them, doesn't replace them.
- You're looking for real-time collaborative editing. Wiki Keeper is single-user.

---

## Core concepts

### Scope

A Wiki Keeper instance is tied to a **scope** — a folder in your vault (or the whole vault). All of its operations (inbox, topics, index, log) are relative to that scope. You can run one keeper for the whole vault, or one per project.

### Inbox vs Watched sources

Two ways to feed the keeper:

| Mode | Best for | What happens to the source |
|---|---|---|
| **Inbox** | One-off drops (PDFs, emails, clippings) | Moved to `_sources/archive/YYYY/MM/` after processing, and a summary page is created under `_topics/summaries/` |
| **Watched** | Folders you already maintain (daily notes, meeting transcripts) | Stays in place forever. Re-processed on file changes (mtime diff). No summary page — durable claims append to topic pages directly |

Both modes update `_topics/`, `index.md`, and `log.md`. Both respect `exclude_patterns`.

### Topic pages

Every inbox source and every claim extracted from a watched file ends up cross-linked into a topic page under `_topics/`. Topic pages are markdown with frontmatter like `type: entity | concept | event | summary`. They accumulate dated entries over time.

Filenames are slug-case (`vendor-x.md`, not `Vendor X.md`). Wikilinks (`[[_topics/vendor-x]]`) are how everything connects.

Each topic page also carries a fenced **`## Summary` block** at the top — a 3–7 bullet synthesis maintained by the `wiki-refresh` skill. As claims accrue, the summary regenerates so query-time reads don't need to scan the full claim history. The block is auto-managed; the rest of the page (claims history, contradictions, your own prose) is preserved as-is.

Dated bullets in `## Claims` carry a **source-type tag** — `[doc]`, `[meeting]`, `[email]`, `[note]`, `[web]`, `[synthesis]`, `[other]` — so you can tell at a glance whether a claim came from a vetted contract or a casual meeting note.

### `index.md` and `log.md`

The keeper maintains two files at the scope root:
- **`index.md`** — a running MOC (map of content), grouped by type, so you can see what's in the wiki at a glance.
- **`log.md`** — a dated changelog: what was ingested, what changed, what was created. Lint reports go here too.

Both files use fenced `<!-- wiki-keeper:begin --> ... <!-- wiki-keeper:end -->` markers so any content you add manually is preserved.

### Lint (weekly)

On a schedule you choose (Sundays at 9am by default), the keeper runs a weekly lint pass — finds orphan topic pages, stale events, unresolved contradictions, schema violations, missing cross-links, bidirectional cross-link gaps, dedup candidates (similar topic pages with overlapping sources), and stale summaries (auto-chained to `wiki-refresh` for regeneration). Deterministic fixes are auto-applied; judgment calls are listed in the log for your review. Never destructive.

The dashboard's **Wiki Keepers** tab parses the latest lint report and renders Needs review items as actionable cards, so you don't have to scroll through `log.md` to find what wants your attention.

### Q&A compounding

Karpathy's central insight: a wiki should compound from queries, not just from sources. When you ask a Wiki Keeper a substantive question via chat or Slack, it does more than answer — it files the answer back into the wiki as both a synthesis page (`_topics/syntheses/YYYY-MM-DD-<question>.md`) and dated bullets on every cited topic page. Every meaningful Q&A leaves a per-topic trace, so the wiki gets richer the more you use it. (Toggle off via `file_substantive_answers: false` if you'd rather keep Q&A out of the wiki.)

### Failed-source quarantine

If an inbox file fails ingest 3 times in a row (corrupted PDF, missing skill, unparseable encoding), it's moved to `_sources/failed/` with a sidecar `.error.md` instead of being retried forever. The lint pass surfaces the quarantine count weekly so broken sources don't quietly drain your token budget.

---

## Setup — 3 minutes for the first keeper

### 1. Enable it

Open Obsidian → **Settings → Agent Fleet** → scroll to **Wiki Keepers** → **+ Add**.

### 2. Fill the form (everything is optional)

The Add form opens with a banner stating *"All fields are optional. Click Create with everything blank and you'll get a whole-vault keeper with sensible defaults."*

For a quick start: **leave every field blank and click Create.** You get a keeper named `wiki-keeper` scoped to your whole vault, with `_sources/inbox/`, `_topics/`, `index.md`, `log.md` seeded at the vault root. Nightly ingest at 3 AM, lint Sundays at 9 AM.

For a scoped keeper (e.g. per project), enter:
- **Scope folder:** `projects/acme` (vault-relative path)
- **Watched folders** (optional, comma- or newline-separated): `meetings/, daily-notes/`
- **Heartbeat channel** (optional): pick a Slack or Telegram channel if you want ingest summaries posted there

Click **Create**. The keeper agent folder is generated under `_fleet/agents/wiki-keeper-acme/`, and the scope's inbox + topics folders are seeded.

### 3. Drop something in

Drop a PDF into `<scope>/_sources/inbox/`. Or save an article there with [Obsidian Web Clipper](#using-obsidian-web-clipper) (see below).

### 4. Wait for the heartbeat — or trigger ingest manually

Either wait until 3 AM (or whatever schedule you chose), **or** open a chat with the new Wiki Keeper agent and say:

> run wiki-ingest now

It will process everything in the inbox, archive the sources, and update `_topics/` + `index.md` + `log.md`.

### 5. Query the wiki

In the chat, ask:

> what do we know about [your topic]?

The agent greps `_topics/`, reads matches, and answers with `[[_topics/...]]` citations. If it doesn't have the answer, it says so — it won't make things up.

---

## Multi-scope — one keeper per project

For established vaults with multiple projects, run a separate keeper for each project so their topic pages don't cross-contaminate.

Click **+ Add** again for each project:

| Keeper | Scope | Watched folders (example) |
|---|---|---|
| `wiki-keeper-acme` | `projects/acme` | `projects/acme/meetings/`, `daily-notes/` |
| `wiki-keeper-beta` | `projects/beta` | `projects/beta/meetings/` |
| `wiki-keeper-charlie` | `projects/charlie` | `projects/charlie/artifacts/` |

Each runs on its own schedule, has its own `_topics/` tree, answers only from its own scope. To query Acme: `@wiki-keeper-acme: …`. To query Beta: `@wiki-keeper-beta: …`. If you want a cross-project answer, ask each separately (v1 — a cross-scope federator is planned for v2).

---

## Watched folders — for existing note pipelines

If you already use Obsidian with a daily-notes plugin or a meeting-transcript pipeline, you do **not** want the keeper to move those files or create a summary page per day. Watched mode handles this:

1. In **+ Add** (or **Edit** on an existing keeper), set **Watched folders** to the folders you already maintain:
   ```
   daily-notes/
   meetings/transcripts/
   ```
2. Add **Exclude patterns** if there are sub-folders to skip:
   ```
   meetings/drafts/**
   **/*.draft.md
   ```
3. Save.

Next ingest run, the keeper will:
- Walk every watched file.
- Skip ones whose mtime hasn't changed since last run (tracked in a hidden `.wiki-keeper-state.json`).
- For each new/modified file, **extract only durable claims** (decisions, entity mentions, action items, concept introductions) and append dated entries to the relevant topic pages.
- **Never** create a summary page for a watched file (that would flood the wiki).
- **Never** modify or move the source file.

Edit a daily note a week later → next ingest picks up the diff and appends new claims. Nothing is ever reprocessed wastefully.

---

## Using Obsidian Web Clipper

Web Clipper is the fastest way to get web pages, Confluence pages, articles, and HN threads into your keeper's inbox.

### Install

1. Go to [obsidian.md/clipper](https://obsidian.md/clipper) and install the extension for your browser (Chrome / Firefox / Safari / Edge).
2. Open the extension → Settings → pick your vault.

### Configure the template

Create a template per scope. For a keeper scoped to `projects/acme`:

- **Template name:** `Acme Wiki Inbox`
- **Note location / path:** `projects/acme/_sources/inbox/`
- **Note name:** `{{date|date:"YYYY-MM-DD"}}-{{title|kebab}}`
- **Properties (frontmatter):**
  ```
  title: "{{title}}"
  source_url: "{{url}}"
  source_domain: "{{domain}}"
  clipped: "{{date}}"
  author: "{{author}}"
  tags: [clipped]
  ```
- **Note content:** `{{content}}` (or `{{selection}}` if you prefer to clip only highlighted text)

Repeat for each scope. You can set **Trigger** rules so e.g. pages on `acme.atlassian.net` auto-use the Acme template.

### What works well

- Public web pages, docs, blogs, HN, arXiv, GitHub READMEs — clean conversion.
- **Confluence pages behind SSO** — yes, because Web Clipper captures the DOM as your logged-in browser sees it.
- Notion pages — same, via DOM capture when logged in.

### Caveats

- **Confluence macros** (expanded panels, Jira queries, etc.) sometimes convert to raw text. Plain pages clip great; heavily macro'd pages may need cleanup or a selection-only clip.
- **JS-heavy apps** — whatever's rendered at clip-time is what you get. Expand accordions first.
- **PDFs in browser** — download and drop into `_sources/inbox/` directly; the keeper handles PDFs via a bundled skill.

---

## Letting other agents USE your wiki

Any agent in your fleet (e.g. a PM agent, research agent) can read from a wiki. Add a `wiki_references:` block to the consumer agent's `config.md`:

```yaml
# _fleet/agents/pm-acme/config.md
wiki_references:
  - agent: wiki-keeper-acme
```

And attach the `wiki-query` skill in the consumer agent's `agent.md`:

```yaml
skills:
  - wiki-query
```

Now when you chat with `pm-acme`:
- Ask a question → it greps the Acme wiki first, answers with citations.
- Share a durable claim ("remember: vendor Y lowered prices") → it writes a note to `projects/acme/_sources/inbox/` for wiki-keeper-acme to file canonically overnight.
- It never touches `_topics/` directly — that's the keeper's job.

For a strategy agent that spans multiple projects, list multiple references:

```yaml
wiki_references:
  - agent: wiki-keeper-acme
  - agent: wiki-keeper-beta
```

Its citations will name the scope (e.g. *"Per the `acme` wiki…"*) when answering questions that touch multiple wikis.

---

## Editing or deleting a keeper

In **Settings → Wiki Keepers**, each keeper has **Edit** and **Delete** buttons.

- **Edit** opens a form for everything you can safely change after creation — watched folders, exclude patterns, ingest schedule, lint schedule, heartbeat channel, token budget. Scope and paths are locked (changing them after topic pages exist would orphan the content).
- **Delete** removes the keeper agent folder (`_fleet/agents/wiki-keeper-*/`) and its sibling lint task. **Your scope's inbox, topics, index, and log are not deleted** — the keeper built them, but they're yours now.

To "move" a keeper to a different scope: delete and recreate at the new scope. Existing topic pages stay where they are; the new keeper won't inherit them.

---

## Day-to-day usage patterns

### Pattern 1: Drop-and-forget

Throughout the day:
- Forward emails with the right label → auto-routed (via a future Gmail MCP connector).
- Clip articles with Web Clipper → lands in inbox.
- Save meeting transcripts from your recorder → lands in a watched folder.
- Paste random notes into `_sources/inbox/*.md`.

At 3 AM, it all gets processed. Morning: you check `log.md` to see what the keeper did, or open the graph view to see how topics cross-linked.

### Pattern 2: Ask the wiki

Any time:
- In Obsidian: chat with the keeper, ask a question, get cited answers.
- In Slack (if configured): `@wiki-keeper-acme: what were Alice's concerns about vendor X?`
- Forward a Slack message to the bot: it writes the content into the inbox for nightly ingestion.

### Pattern 3: Curate as you go

- Click through the topic graph in Obsidian's graph view.
- Edit topic pages manually (the keeper preserves user-authored content on its next ingest, only appending to dated sections).
- Add a `## Contradictions` section yourself if the keeper missed a conflict.

### Pattern 4: Per-project PM agent

Attach a `wiki-reader`-style setup to your project's PM agent. Now when you brainstorm with the PM agent, it's reading from the project wiki in real time — drafting PRDs grounded in your prior notes, referencing past decisions, dropping new insights into the inbox as it goes.

---

## Troubleshooting

**The inbox isn't being cleared after ingest.**
Your keeper needs the `Bash(mv *)` tool in its `allowed_tools`. Newly created keepers have it by default. For keepers created before v0.9.0: **Settings → Wiki Keepers → Edit → Save** (no fields need to change) — the edit helper syncs the allowlist automatically.

**Topic pages are full of junk, or the wrong things are extracted.**
Edit the keeper's `CONTEXT.md` file at `_fleet/agents/wiki-keeper-*/CONTEXT.md`. This is the schema the keeper follows — what counts as an entity, a concept, an event. Adjust the rules, save. Next ingest will use the updated schema.

**The keeper hallucinates facts not in my sources.**
It shouldn't — the skill prompts are explicit about refusing to draw on training data. If you see this, it's a bug — report it. Meanwhile, you can tighten the agent's system prompt in `agent.md` with an additional "never state a fact not cited from a source" rule.

**I want to query across multiple keepers.**
v1 doesn't do this natively. Ask each keeper separately, or wait for v2 (federated cross-scope queries).

**The nightly ingest is too expensive (tokens).**
Lower `max_tokens_per_ingest` in the keeper's config (Edit form → Advanced). When hit, the keeper stops processing, logs what was skipped, and resumes next cycle. Also consider shrinking the scope, or tightening exclude patterns.

---

## File layout reference

A whole-vault keeper:
```
your-vault/
├── _fleet/agents/wiki-keeper/
│   ├── agent.md
│   ├── config.md             (permission_mode + approval_required + wiki_keeper config)
│   ├── HEARTBEAT.md
│   ├── CONTEXT.md            (the wiki schema document for this scope)
│   └── permissions.json      (canonical allow/deny — runtime reads this only)
├── _sources/
│   ├── inbox/
│   ├── archive/YYYY/MM/
│   └── failed/               (created on demand — sidecar .error.md per file)
├── _topics/
│   ├── <your topic pages>
│   ├── summaries/            (one per ingested inbox source)
│   └── syntheses/            (Q&A compounding output, when filed)
├── index.md
├── log.md
└── .wiki-keeper-state.json   (hidden; mtimes + content hashes + failure counts)
```

A project-scoped keeper:
```
your-vault/
├── _fleet/agents/wiki-keeper-acme/
│   └── (same 5 files)
├── _fleet/tasks/wiki-keeper-acme-lint.md   (sibling lint task)
└── projects/acme/
    ├── _sources/inbox/
    ├── _sources/archive/YYYY/MM/
    ├── _topics/
    ├── index.md
    ├── log.md
    └── .wiki-keeper-state.json
```

---

## Design philosophy (short version)

- **Nothing is a cloud service.** All files are markdown in your vault. If Agent Fleet disappears tomorrow, your wiki stays as plain files.
- **The keeper is a curator, not an author.** It never rewrites your content. Every change is an append to a dated section, and every change is logged.
- **Wiki-grounded answers, or no answer.** Queries refuse to fall back on training-data knowledge. If it's not in your wiki, you don't get a fake answer — you get "not covered, consider adding a source."
- **Scopes are isolated by default.** Per-project keepers cannot cross-contaminate. If you want cross-scope insight, compose it yourself from the separate wikis.

---

## Where to go from here

- Read the full [design spec](WIKI_KEEPER_DESIGN.md) if you want to understand the architecture, skill behavior, safety rails, and planned v2 features.
- Set up a consumer agent (PM agent / research agent) with `wiki_references:` — see the "Letting other agents USE your wiki" section above.
- Experiment with a pilot project scope for 2–4 weeks before expanding to more scopes. Evaluate the quality of the `_topics/` tree that emerges before investing further.
