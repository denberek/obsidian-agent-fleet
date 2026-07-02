import { describe, expect, it } from "vitest";
import { ExecutionManager, extractConcreteModel, extractRememberEntries } from "./executionManager";
import type { AgentConfig, FleetSettings, SkillConfig, TaskConfig, WorkingMemory } from "../types";
import type { FleetRepository } from "../fleetRepository";
import { MEMORY_CAPTURE_INSTRUCTION } from "../utils/memoryFormat";

describe("execution helpers", () => {
  it("extracts remember directives", () => {
    const entries = extractRememberEntries(`
Before
[REMEMBER]The deployment pipeline lives in GitHub Actions[/REMEMBER]
Middle
[REMEMBER]Staging URL is staging.example.com[/REMEMBER]
`);

    expect(entries).toEqual([
      "The deployment pipeline lives in GitHub Actions",
      "Staging URL is staging.example.com",
    ]);
  });

  describe("extractConcreteModel", () => {
    it("pulls from result.modelUsage keys", () => {
      const result = {
        type: "result",
        total_cost_usd: 0.01,
        modelUsage: {
          "claude-opus-4-7": { inputTokens: 10, outputTokens: 5, contextWindow: 200000 },
        },
      };
      expect(extractConcreteModel(result)).toBe("claude-opus-4-7");
    });

    it("pulls from assistant message.model", () => {
      const assistant = {
        type: "assistant",
        message: { model: "claude-sonnet-4-6", content: [] },
      };
      expect(extractConcreteModel(assistant)).toBe("claude-sonnet-4-6");
    });

    it("pulls from system init top-level model", () => {
      const init = { type: "system", subtype: "init", model: "claude-haiku-4-5" };
      expect(extractConcreteModel(init)).toBe("claude-haiku-4-5");
    });

    it("returns undefined when nothing carries a model", () => {
      expect(extractConcreteModel({ type: "rate_limit_event" })).toBeUndefined();
      expect(extractConcreteModel(null)).toBeUndefined();
      expect(extractConcreteModel("text")).toBeUndefined();
    });

    it("recurses into nested objects", () => {
      const nested = { outer: { inner: { message: { model: "claude-opus-4-7" } } } };
      expect(extractConcreteModel(nested)).toBe("claude-opus-4-7");
    });
  });
});

// ─── Shared prompt-assembly test fixtures (also used by chatSession.test.ts's
//     cross-path parity test) ───

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    filePath: "_fleet/agents/test-agent.md",
    name: "test-agent",
    description: "An agent for testing",
    model: "default",
    adapter: "claude-code",
    permissionMode: "bypassPermissions",
    maxRetries: 1,
    skills: [],
    mcpServers: [],
    enabled: true,
    timeout: 300,
    approvalRequired: [],
    memory: false,
    memoryMaxEntries: 100,
    memoryTokenBudget: 1500,
    reflection: { enabled: false, schedule: "0 3 * * *", recurrenceThreshold: 3, proposeSkills: false },
    tags: [],
    avatar: "",
    body: "You are a helpful test agent.",
    contextBody: "",
    skillsBody: "",
    env: {},
    permissionRules: { allow: [], deny: [] },
    isFolder: false,
    heartbeatEnabled: false,
    heartbeatSchedule: "",
    heartbeatBody: "",
    heartbeatNotify: true,
    heartbeatChannel: "",
    heartbeatChannelTarget: "",
    ...overrides,
  };
}

function makeSettings(overrides: Partial<FleetSettings> = {}): FleetSettings {
  return {
    fleetFolder: "_fleet",
    claudeCliPath: "claude",
    codexCliPath: "codex",
    defaultModel: "default",
    awsRegion: "us-east-1",
    maxConcurrentRuns: 2,
    runLogRetentionDays: 30,
    catchUpMissedTasks: true,
    notificationLevel: "all",
    showStatusBar: true,
    mcpApiKeys: {},
    mcpTokens: {},
    channelCredentials: {},
    maxConcurrentChannelSessions: 5,
    channelIdleTimeoutMinutes: 15,
    channelRateLimitPerConversation: 20,
    channelRateLimitWindowMinutes: 5,
    chatWatchdogMinutes: 10,
    defaultFileHashes: {},
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskConfig> = {}): TaskConfig {
  return {
    filePath: "_fleet/tasks/summarize.md",
    taskId: "summarize",
    agent: "test-agent",
    type: "recurring",
    priority: "medium",
    enabled: true,
    created: "2026-01-01",
    runCount: 0,
    catchUp: false,
    tags: [],
    body: "Summarize the news.",
    ...overrides,
  };
}

function makeSkill(overrides: Partial<SkillConfig> = {}): SkillConfig {
  return {
    filePath: "_fleet/skills/research.md",
    name: "research",
    tags: [],
    body: "Research things thoroughly.",
    toolsBody: "Use WebSearch.",
    referencesBody: "See RESEARCH.md.",
    examplesBody: "Example: find competitors.",
    isFolder: false,
    ...overrides,
  };
}

function makeWorkingMemory(): WorkingMemory {
  return {
    filePath: "_fleet/memory/test-agent.md",
    agent: "test-agent",
    schema: 2,
    tokenEstimate: 0,
    sections: [
      { name: "Preferences", entries: [{ text: "Prefers concise answers", pinned: true }] },
      {
        name: "Recent",
        entries: [{ text: "Deploy uses GitHub Actions", pinned: false, source: "run", date: "2026-06-30" }],
      },
    ],
  };
}

/** A wiki-keeper agent that `wikiReferences: [{ agent: "wiki-keeper-acme" }]` resolves to. */
function makeKeeperAgent(): AgentConfig {
  return makeAgent({
    name: "wiki-keeper-acme",
    filePath: "_fleet/agents/wiki-keeper-acme.md",
    wikiKeeper: {
      scopeRoot: "Acme",
      inboxPath: "wiki/inbox",
      archivePath: "wiki/archive",
      failedPath: "wiki/failed",
      topicsRoot: "wiki/topics",
      indexPath: "wiki/index.md",
      logPath: "wiki/log.md",
      watchedFolders: [],
      excludePatterns: [],
      watchedSince: "",
      fileSubstantiveAnswers: false,
      obsidianUrlScheme: false,
      maxTokensPerIngest: 4000,
      maxTokensPerRefresh: 4000,
      dedupSimilarityThreshold: 0.8,
      summaryStaleDays: 30,
      indexSplitThreshold: 50,
      stateFile: ".wiki-state.json",
    },
  });
}

function makePromptRepoStub(opts: {
  skills?: SkillConfig[];
  workingMemory?: WorkingMemory | null;
  agents?: AgentConfig[];
} = {}): FleetRepository {
  return {
    getSkillByName: (name: string) => opts.skills?.find((s) => s.name === name),
    readWorkingMemory: async () => opts.workingMemory ?? null,
    getAgentByName: (name: string) => opts.agents?.find((a) => a.name === name),
  } as unknown as FleetRepository;
}

/** The exact `## Memory` block buildPrompt emits for {@link makeWorkingMemory}. */
const EXPECTED_MEMORY_SECTION =
  `## Memory\n${MEMORY_CAPTURE_INSTRUCTION}\n\n### What you've learned so far\n` +
  "## Preferences\n- [pin] Prefers concise answers\n\n" +
  "## Recent (uncurated)\n- Deploy uses GitHub Actions <!-- src:run 2026-06-30 -->";

/** The exact `## Wiki Access` block for {@link makeKeeperAgent}. */
const EXPECTED_WIKI_SECTION = [
  "## Wiki Access",
  "You have read access to the following wikis maintained by other agents. " +
    "Use the `wiki-query` skill in consumer mode when the user asks something " +
    "a wiki may already cover.",
  "",
  "### Wiki: `wiki-keeper-acme`",
  "- scope root: `Acme`",
  "- topics:     `Acme/wiki/topics/`",
  "- index:      `Acme/wiki/index.md`",
  "- inbox:      `Acme/wiki/inbox/`",
  "",
  "### Rules",
  "- **Cite every factual claim** from a wiki using `[[<topics-path>/<page>]]`. " +
    "If a claim has no page, say the wiki doesn't cover it — do not fabricate.",
  "- **When the user shares something durable** that isn't yet in a wiki " +
    "(a decision, a new entity mention, a competitor change, a meeting outcome), " +
    "write a short markdown file to the relevant wiki's inbox at " +
    "`<inbox>/YYYY-MM-DD-<slug>.md` with a one-line note + the source. " +
    "The wiki keeper files it canonically on its next ingest.",
  "- **Do NOT write to `<topics-path>/` directly.** The wiki keeper is the " +
    "canonical curator of topic pages. Use the inbox as your deposit point.",
  "- **When the question spans multiple wikis**, be explicit about which " +
    "scope each cited page belongs to.",
].join("\n");

const EXPECTED_SKILL_SECTION =
  "## Skill: research\nResearch things thoroughly.\n\n" +
  "### Tools\nUse WebSearch.\n\n" +
  "### References\nSee RESEARCH.md.\n\n" +
  "### Examples\nExample: find competitors.";

/** The fully-loaded agent used by the byte-exact characterization tests. */
function makeFullAgent(): AgentConfig {
  return makeAgent({
    skills: ["research"],
    skillsBody: "Custom agent skill notes.",
    contextBody: "Working on Project Apollo.",
    memory: true,
    wikiReferences: [{ agent: "wiki-keeper-acme" }],
  });
}

function makeFullRepoStub(): FleetRepository {
  return makePromptRepoStub({
    skills: [makeSkill()],
    workingMemory: makeWorkingMemory(),
    agents: [makeKeeperAgent()],
  });
}

// Characterization tests — these capture the CURRENT byte-exact prompt output
// of the one-shot run path so the shared prompt-assembly extraction is provably
// behavior-preserving. Do not "improve" the expected strings; they are the spec.
describe("ExecutionManager.buildPrompt — characterization", () => {
  function makeManager(repo: FleetRepository): ExecutionManager {
    return new ExecutionManager(makeSettings(), repo);
  }

  it("assembles body + skill + agent skills + context + memory + wiki + task, byte-exact", async () => {
    const manager = makeManager(makeFullRepoStub());
    const prompt = await manager.buildPrompt(makeFullAgent(), makeTask());

    expect(prompt).toBe(
      [
        "You are a helpful test agent.",
        EXPECTED_SKILL_SECTION,
        "## Agent Skills\nCustom agent skill notes.",
        "## Agent Context\nWorking on Project Apollo.",
        EXPECTED_MEMORY_SECTION,
        EXPECTED_WIKI_SECTION,
        "## Task\nSummarize the news.",
      ].join("\n\n"),
    );
  });

  it("minimal agent: just body + task", async () => {
    const manager = makeManager(makePromptRepoStub());
    const prompt = await manager.buildPrompt(makeAgent(), makeTask());
    expect(prompt).toBe("You are a helpful test agent.\n\n## Task\nSummarize the news.");
  });

  it("promptOverride (heartbeat path) replaces the task body and is trimmed", async () => {
    const manager = makeManager(makePromptRepoStub());
    const prompt = await manager.buildPrompt(
      makeAgent(),
      makeTask(),
      "  Check all site monitors and report anomalies.\n",
    );
    expect(prompt).toBe(
      "You are a helpful test agent.\n\n## Task\nCheck all site monitors and report anomalies.",
    );
  });

  it("memory enabled but no working-memory file yet → fresh-agent placeholder", async () => {
    const manager = makeManager(makePromptRepoStub({ workingMemory: null }));
    const prompt = await manager.buildPrompt(makeAgent({ memory: true }), makeTask());
    expect(prompt).toBe(
      [
        "You are a helpful test agent.",
        `## Memory\n${MEMORY_CAPTURE_INSTRUCTION}\n\n### What you've learned so far\nNothing yet — this is a fresh agent.`,
        "## Task\nSummarize the news.",
      ].join("\n\n"),
    );
  });

  it("memoryActive=false (reflection suppression) omits the memory section even for a memory agent", async () => {
    const manager = makeManager(makePromptRepoStub({ workingMemory: makeWorkingMemory() }));
    const prompt = await manager.buildPrompt(makeAgent({ memory: true }), makeTask(), undefined, false);
    expect(prompt).toBe("You are a helpful test agent.\n\n## Task\nSummarize the news.");
  });

  it("unknown skill names are silently skipped", async () => {
    const manager = makeManager(makePromptRepoStub({ skills: [makeSkill()] }));
    const prompt = await manager.buildPrompt(
      makeAgent({ skills: ["missing-skill", "research"] }),
      makeTask(),
    );
    expect(prompt).toBe(
      ["You are a helpful test agent.", EXPECTED_SKILL_SECTION, "## Task\nSummarize the news."].join("\n\n"),
    );
  });

  it("skill sub-bodies are optional — empty ones drop their heading", async () => {
    const skill = makeSkill({ toolsBody: "", referencesBody: " ", examplesBody: "" });
    const manager = makeManager(makePromptRepoStub({ skills: [skill] }));
    const prompt = await manager.buildPrompt(makeAgent({ skills: ["research"] }), makeTask());
    expect(prompt).toBe(
      [
        "You are a helpful test agent.",
        "## Skill: research\nResearch things thoroughly.",
        "## Task\nSummarize the news.",
      ].join("\n\n"),
    );
  });

  it("empty agent body is filtered out (no leading blank section)", async () => {
    const manager = makeManager(makePromptRepoStub());
    const prompt = await manager.buildPrompt(makeAgent({ body: "  " }), makeTask());
    expect(prompt).toBe("## Task\nSummarize the news.");
  });
});
