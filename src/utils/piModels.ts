import { captureCli, splitLines } from "./platform";

/**
 * Pi model discovery — powers the dual-vendor model picker for `adapter: pi`
 * agents.
 *
 * `pi --list-models` prints a whitespace-aligned table:
 *
 *   provider        model                        context  max-out  thinking  images
 *   anthropic       claude-opus-5                1M       128K     yes       yes
 *   openai-codex    gpt-5.6-terra                400K     128K     yes       yes
 *
 * The listing is credential-gated: a provider's models appear only when the
 * user has authenticated it (API key or subscription OAuth), so the picker
 * automatically reflects what this machine can actually run. We filter to the
 * Anthropic + OpenAI provider families per the adapter contract (§10.3 of
 * PI_HARNESS_FEASIBILITY.md); free text remains the escape hatch for
 * everything else Pi supports.
 */

export interface PiModelEntry {
  /** Provider id as Pi prints it (e.g. "anthropic", "openai-codex"). */
  provider: string;
  /** Bare model id (e.g. "claude-opus-5", "gpt-5.6-terra"). */
  id: string;
  /** `provider/id` — unambiguous form to store in frontmatter. */
  value: string;
  /** Context-size column as printed (e.g. "1M", "200K"), may be empty. */
  context: string;
  /** Whether the thinking column said yes. */
  thinking: boolean;
}

/** Provider ids that belong to the Anthropic family. */
const ANTHROPIC_PROVIDERS = new Set(["anthropic"]);
/** Provider ids that belong to the OpenAI family (API key and ChatGPT OAuth). */
const OPENAI_PROVIDERS = new Set(["openai", "openai-codex"]);

/** Parse `pi --list-models` table output into entries. Exported for tests. */
export function parsePiModelList(output: string): PiModelEntry[] {
  const entries: PiModelEntry[] = [];
  for (const line of splitLines(output)) {
    const cols = line.trim().split(/\s+/);
    // Real table rows carry provider, model, context, max-out, thinking(, images).
    if (cols.length < 5) continue;
    const provider = cols[0]!;
    const id = cols[1]!;
    if (provider === "provider" && id === "model") continue; // header row
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(provider)) continue;
    entries.push({
      provider,
      id,
      value: `${provider}/${id}`,
      context: cols[2] ?? "",
      thinking: cols[4] === "yes",
    });
  }
  return entries;
}

/** The picker's two groups: Anthropic-family and OpenAI-family models. */
export interface PiModelCatalog {
  anthropic: PiModelEntry[];
  openai: PiModelEntry[];
  /** True when the listing came back empty or failed — the picker shows a
   *  "connect a provider" hint instead of empty groups. */
  unavailable: boolean;
}

export function filterPiCatalog(entries: PiModelEntry[]): PiModelCatalog {
  const anthropic = entries.filter((e) => ANTHROPIC_PROVIDERS.has(e.provider));
  const openai = entries.filter((e) => OPENAI_PROVIDERS.has(e.provider));
  return { anthropic, openai, unavailable: anthropic.length === 0 && openai.length === 0 };
}

// ─── Cached discovery ───

const CACHE_TTL_MS = 5 * 60_000;
let cache: { atMs: number; cliPath: string; catalog: PiModelCatalog } | null = null;
let inflight: Promise<PiModelCatalog> | null = null;
let inflightPath: string | null = null;

/** Test hook — clears the discovery cache. */
export function resetPiModelCache(): void {
  cache = null;
  inflight = null;
  inflightPath = null;
}

const UNAVAILABLE: PiModelCatalog = { anthropic: [], openai: [], unavailable: true };

/**
 * List the Anthropic/OpenAI models Pi can reach on this machine. Shells out to
 * `pi --list-models` with a 15s guard, caches for 5 minutes per CLI path
 * (mirroring the Codex MCP-listing cache), and fails soft to an "unavailable"
 * catalog — the picker degrades to free text, never blocks a form.
 */
export function listPiModels(cliPath: string): Promise<PiModelCatalog> {
  if (cache && cache.cliPath === cliPath && Date.now() - cache.atMs < CACHE_TTL_MS) {
    return Promise.resolve(cache.catalog);
  }
  // Dedup concurrent calls only for the SAME binary — a call for a different
  // path must not be handed (or cache) the other path's catalog.
  if (inflight && inflightPath === cliPath) return inflight;

  const promise = captureCli(cliPath, ["--list-models"], { timeoutMs: 15_000 }).then((result) => {
    // Unlike auth check, the listing is only trusted on a clean exit — a
    // failing CLI can print partial tables.
    const catalog =
      result.ok && result.code === 0
        ? filterPiCatalog(parsePiModelList(result.stdout))
        : UNAVAILABLE;
    cache = { atMs: Date.now(), cliPath, catalog };
    return catalog;
  });
  inflight = promise;
  inflightPath = cliPath;
  void promise.finally(() => {
    if (inflight === promise) {
      inflight = null;
      inflightPath = null;
    }
  });
  return promise;
}
