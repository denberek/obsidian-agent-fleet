import type { AgentConfig } from "../types";
import type { FleetRepository } from "../fleetRepository";

/**
 * Build the "## Wiki Access" markdown block that the prompt builder appends
 * to a consumer agent's system context. Returns null when the agent has no
 * `wiki_references:` configured or when none of the referenced keepers can
 * be resolved.
 *
 * This is the single place that tells a non-keeper agent:
 *   - what wikis it can read
 *   - where each wiki's files live
 *   - the inbox-drop convention for adding durable claims
 *   - the citation rule for every wiki-grounded claim
 */
export function buildWikiReferencesContext(
  agent: AgentConfig,
  repository: FleetRepository,
): string | null {
  const refs = agent.wikiReferences;
  if (!refs || refs.length === 0) return null;

  const resolved: Array<{
    agentName: string;
    scopeRoot: string;
    topicsPath: string;
    inboxPath: string;
    indexPath: string;
  }> = [];

  for (const ref of refs) {
    const refAgent = repository.getAgentByName(ref.agent);
    if (!refAgent || !refAgent.wikiKeeper) continue;
    const wk = refAgent.wikiKeeper;
    const prefix = wk.scopeRoot ? `${wk.scopeRoot.replace(/\/+$/, "")}/` : "";
    resolved.push({
      agentName: refAgent.name,
      scopeRoot: wk.scopeRoot || "(whole vault)",
      topicsPath: `${prefix}${wk.topicsRoot}`,
      inboxPath: `${prefix}${wk.inboxPath}`,
      indexPath: `${prefix}${wk.indexPath}`,
    });
  }

  if (resolved.length === 0) return null;

  const lines: string[] = ["## Wiki Access"];
  lines.push(
    "You have read access to the following wikis maintained by other agents. " +
      "Use the `wiki-query` skill in consumer mode when the user asks something " +
      "a wiki may already cover.",
  );
  lines.push("");

  for (const r of resolved) {
    lines.push(`### Wiki: \`${r.agentName}\``);
    lines.push(`- scope root: \`${r.scopeRoot}\``);
    lines.push(`- topics:     \`${r.topicsPath}/\``);
    lines.push(`- index:      \`${r.indexPath}\``);
    lines.push(`- inbox:      \`${r.inboxPath}/\``);
    lines.push("");
  }

  lines.push("### Rules");
  lines.push(
    "- **Cite every factual claim** from a wiki using `[[<topics-path>/<page>]]`. " +
      "If a claim has no page, say the wiki doesn't cover it — do not fabricate.",
  );
  lines.push(
    "- **When the user shares something durable** that isn't yet in a wiki " +
      "(a decision, a new entity mention, a competitor change, a meeting outcome), " +
      "write a short markdown file to the relevant wiki's inbox at " +
      "`<inbox>/YYYY-MM-DD-<slug>.md` with a one-line note + the source. " +
      "The wiki keeper files it canonically on its next ingest.",
  );
  lines.push(
    "- **Do NOT write to `<topics-path>/` directly.** The wiki keeper is the " +
      "canonical curator of topic pages. Use the inbox as your deposit point.",
  );
  lines.push(
    "- **When the question spans multiple wikis**, be explicit about which " +
      "scope each cited page belongs to.",
  );

  return lines.join("\n");
}
