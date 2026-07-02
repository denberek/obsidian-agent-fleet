// Shared agent-prompt assembly for the one-shot run path (ExecutionManager)
// and the chat path (ChatSession). Both paths inject the same core context —
// agent body, shared skills, agent-specific skills/context, working memory,
// and wiki references — and this module is the single source of truth for
// that sequence so the two cannot silently diverge.
//
// Genuinely path-specific sections stay with their callers:
//   - ExecutionManager appends the `## Task` section (task body or override).
//   - ChatSession appends the `## Thread Mode` replay (side threads) and frames
//     the first user message as the `## Task` section; its chat-only
//     `## Channel Context` section travels through `opts.channelContext`
//     because it sits BETWEEN memory and wiki access in the sequence.
import type { AgentConfig } from "../types";
import type { FleetRepository } from "../fleetRepository";
import { buildWikiReferencesContext } from "../utils/wikiReferences";
import { buildMemorySection } from "../utils/memoryFormat";

export interface AgentPromptOptions {
  /** Whether the `## Memory` section is injected. The run path passes
   *  `agent.memory && !suppressMemoryCapture` (reflection runs must not see —
   *  or be told to capture into — the memory they are consolidating); the chat
   *  path passes `agent.memory` unchanged. */
  memoryActive: boolean;
  /** Chat-only: channel instructions (e.g. "you are talking via Slack"),
   *  injected after memory and before wiki access. Omitted/blank = no section. */
  channelContext?: string;
}

/**
 * Build the ordered common prompt sections for an agent. Returns the raw
 * section array (possibly containing an empty agent body) — callers append
 * their path-specific sections and then `filter(Boolean).join("\n\n")`.
 */
export async function buildAgentPromptSections(
  repository: FleetRepository,
  agent: AgentConfig,
  opts: AgentPromptOptions,
): Promise<string[]> {
  const sections: string[] = [agent.body.trim()];

  // Shared skills
  for (const skillName of agent.skills) {
    const skill = repository.getSkillByName(skillName);
    if (skill) {
      const parts = [skill.body.trim()];
      if (skill.toolsBody.trim()) parts.push(`### Tools\n${skill.toolsBody.trim()}`);
      if (skill.referencesBody.trim()) parts.push(`### References\n${skill.referencesBody.trim()}`);
      if (skill.examplesBody.trim()) parts.push(`### Examples\n${skill.examplesBody.trim()}`);
      sections.push(`## Skill: ${skill.name}\n${parts.join("\n\n")}`);
    }
  }

  // Agent-specific skills (from SKILLS.md in folder agents)
  if (agent.skillsBody.trim()) {
    sections.push(`## Agent Skills\n${agent.skillsBody.trim()}`);
  }

  // Agent context (from CONTEXT.md in folder agents)
  if (agent.contextBody.trim()) {
    sections.push(`## Agent Context\n${agent.contextBody.trim()}`);
  }

  if (opts.memoryActive) {
    const wm = await repository.readWorkingMemory(agent.name);
    const memorySection = buildMemorySection(agent, wm);
    if (memorySection) sections.push(memorySection);
  }

  // Channel context (chat-only) is appended after the agent's own sections so
  // it takes priority without shadowing the agent's identity.
  if (opts.channelContext && opts.channelContext.trim()) {
    sections.push(`## Channel Context\n${opts.channelContext.trim()}`);
  }

  // Wiki references — consumer-mode access to one or more Wiki Keeper scopes.
  const wikiContext = buildWikiReferencesContext(agent, repository);
  if (wikiContext) sections.push(wikiContext);

  return sections;
}
