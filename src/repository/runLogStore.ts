import { TFile, TFolder, normalizePath } from "obsidian";
import type { App, Vault } from "obsidian";
import { DEFAULT_SETTINGS } from "../constants";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter, slugify } from "../utils/markdown";
import { splitLines } from "../utils/platform";
import type { RunLogData } from "../types";
import { asNumber, asString, asStringArray, collectMarkdownChildren, ensureFolder, isRecord } from "./shared";

/**
 * Run-log store: reads/writes `_fleet/runs/YYYY-MM-DD/*.md` files and owns
 * the parsed-run cache. Extracted verbatim from FleetRepository — the facade
 * delegates its public run-log methods here.
 */
export class RunLogStore {
  /** Parsed run-log cache keyed by file path, invalidated on mtime/size
   *  mismatch. `vault.cachedRead` already avoids disk I/O, but re-parsing
   *  every run markdown on each dashboard refresh was still O(runs). Cached
   *  objects are shared — callers must not mutate them (none do today). */
  private runLogCache = new Map<string, { mtime: number; size: number; run: RunLogData }>();

  private readonly vault: Vault;

  constructor(
    app: App,
    private readonly getRunsRoot: () => string,
  ) {
    this.vault = app.vault;
  }

  async listRecentRuns(limit = 50): Promise<RunLogData[]> {
    const runsFolder = this.vault.getAbstractFileByPath(this.getRunsRoot());
    if (!(runsFolder instanceof TFolder)) {
      return [];
    }

    const files: TFile[] = [];
    collectMarkdownChildren(runsFolder, files);

    files.sort((a, b) => b.path.localeCompare(a.path));
    const selected = files.slice(0, limit);
    const parsed: RunLogData[] = [];

    for (const file of selected) {
      const run = await this.readRunLog(file);
      if (run) {
        parsed.push(run);
      }
    }

    return parsed.sort((a, b) => b.started.localeCompare(a.started));
  }

  /** Return all runs whose date folder is on or after `sinceDate`. Used by
   *  the dashboard chart so a busy fleet can't push older days out of the
   *  visible window the way the count-capped `listRecentRuns` does.
   *  Walks only the relevant date subfolders, so cost is bounded by the
   *  window size, not the total number of historical runs. */
  async listRunsSince(sinceDate: Date): Promise<RunLogData[]> {
    const runsFolder = this.vault.getAbstractFileByPath(this.getRunsRoot());
    if (!(runsFolder instanceof TFolder)) {
      return [];
    }

    const sinceStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, "0")}-${String(sinceDate.getDate()).padStart(2, "0")}`;
    const files: TFile[] = [];
    for (const child of runsFolder.children) {
      if (!(child instanceof TFolder)) continue;
      // Date folders are named `YYYY-MM-DD`; lexicographic >= matches calendar >=.
      if (child.name < sinceStr) continue;
      collectMarkdownChildren(child, files);
    }

    const parsed: RunLogData[] = [];
    for (const file of files) {
      const run = await this.readRunLog(file);
      if (run) {
        parsed.push(run);
      }
    }

    return parsed.sort((a, b) => b.started.localeCompare(a.started));
  }

  async readRunLog(file: TFile): Promise<RunLogData | null> {
    const cached = this.runLogCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
      return cached.run;
    }
    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    // `## Prompt` terminates at either `## Result` (new format) or
    // `## Output` (legacy format). `## Result` is optional and missing on
    // runs created before finalResult was extracted — those runs fall back
    // to rendering `output` in the panel.
    const promptMatch = body.match(/## Prompt\n([\s\S]*?)(?:\n## Result\n|\n## Output\n|$)/);
    const resultMatch = body.match(/## Result\n([\s\S]*?)(?:\n## Output\n|$)/);
    const outputMatch = body.match(/## Output\n([\s\S]*?)(?:\n## Tools Used\n|$)/);
    const toolsMatch = body.match(/## Tools Used\n([\s\S]*?)(?:\n## STDERR\n|$)/);
    const run: RunLogData = {
      filePath: file.path,
      runId: asString(frontmatter.run_id) ?? file.basename,
      agent: asString(frontmatter.agent) ?? "unknown",
      task: asString(frontmatter.task) ?? "unknown",
      status: (asString(frontmatter.status) as RunLogData["status"]) ?? "failure",
      started: asString(frontmatter.started) ?? new Date(file.stat.ctime).toISOString(),
      completed: asString(frontmatter.completed),
      durationSeconds: asNumber(frontmatter.duration_seconds, 0),
      tokensUsed: typeof frontmatter.tokens_used === "number" ? frontmatter.tokens_used : undefined,
      costUsd: typeof frontmatter.cost_usd === "number" ? frontmatter.cost_usd : undefined,
      model: asString(frontmatter.model) ?? DEFAULT_SETTINGS.defaultModel,
      modelSource: ((): RunLogData["modelSource"] => {
        const raw = asString(frontmatter.model_source);
        if (raw === "task" || raw === "agent" || raw === "settings" || raw === "cli-default") return raw;
        return undefined;
      })(),
      concreteModel: asString(frontmatter.resolved_concrete_model),
      exitCode: typeof frontmatter.exit_code === "number" ? frontmatter.exit_code : null,
      tags: asStringArray(frontmatter.tags),
      prompt: promptMatch?.[1]?.trim() ?? "",
      output: outputMatch?.[1]?.trim() ?? "",
      finalResult: resultMatch?.[1]?.trim() || undefined,
      toolsUsed: toolsMatch?.[1]
        ? splitLines(toolsMatch[1])
          .map((line) => line.replace(/^- /, "").trim())
          .filter(Boolean)
        : [],
      approvals: this.parseApprovals(frontmatter.approvals),
    };
    // Cheap unbounded-growth guard; a full reset just costs one re-parse pass.
    if (this.runLogCache.size >= 5000) this.runLogCache.clear();
    this.runLogCache.set(file.path, { mtime: file.stat.mtime, size: file.stat.size, run });
    return run;
  }

  async writeRunLog(run: RunLogData): Promise<string> {
    const started = new Date(run.started);
    const dateFolder = normalizePath(`${this.getRunsRoot()}/${started.toISOString().slice(0, 10)}`);
    await ensureFolder(this.vault, dateFolder);
    const filename = `${started.toISOString().slice(11, 19).replace(/:/g, "")}-${slugify(run.agent)}-${slugify(run.task)}.md`;
    const path = normalizePath(`${dateFolder}/${filename}`);
    const content = stringifyMarkdownWithFrontmatter(
      {
        run_id: run.runId,
        agent: run.agent,
        task: run.task,
        status: run.status,
        started: run.started,
        completed: run.completed,
        duration_seconds: run.durationSeconds,
        tokens_used: run.tokensUsed,
        cost_usd: run.costUsd,
        model: run.model,
        model_source: run.modelSource,
        resolved_concrete_model: run.concreteModel,
        exit_code: run.exitCode,
        tags: run.tags,
        approvals: run.approvals,
      },
      [
        "## Prompt",
        "",
        run.prompt.trim(),
        "",
        // `## Result` carries the final answer without narration, from the
        // CLI's `type: "result"` event. Omitted when absent so legacy-format
        // run files stay identical.
        ...(run.finalResult && run.finalResult.trim()
          ? ["## Result", "", run.finalResult.trim(), ""]
          : []),
        "## Output",
        "",
        run.output.trim() || "(no output)",
        "",
        "## Tools Used",
        "",
        ...(run.toolsUsed.length > 0 ? run.toolsUsed.map((tool) => `- ${tool}`) : ["- none"]),
        ...(run.stderr ? ["", "## STDERR", "", run.stderr.trim()] : []),
      ].join("\n"),
    );

    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
    } else {
      await this.vault.create(path, content);
    }
    return path;
  }

  async setApprovalDecision(runPath: string, tool: string, decision: "approved" | "rejected"): Promise<void> {
    const file = this.vault.getAbstractFileByPath(runPath);
    if (!(file instanceof TFile)) {
      return;
    }

    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    const approvals = (this.parseApprovals(frontmatter.approvals) ?? []).map((approval) =>
      approval.tool === tool
        ? {
            ...approval,
            status: decision,
            resolvedAt: new Date().toISOString(),
          }
        : approval,
    );

    await this.vault.modify(
      file,
      stringifyMarkdownWithFrontmatter(
        {
          ...frontmatter,
          approvals,
        },
        body,
      ),
    );
  }

  private parseApprovals(value: unknown): RunLogData["approvals"] {
    if (!Array.isArray(value)) {
      return undefined;
    }

    return value.flatMap((item) => {
      if (!isRecord(item) || !asString(item.tool)) {
        return [];
      }
      const tool = asString(item.tool);
      if (!tool) {
        return [];
      }
      return [
        {
          tool,
          command: asString(item.command),
          reason: asString(item.reason),
          status: (asString(item.status) as "pending" | "approved" | "rejected") ?? "pending",
          resolvedAt: asString(item.resolvedAt),
          note: asString(item.note),
        },
      ];
    });
  }
}
