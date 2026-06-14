# Claude API — Language-Specific Documentation Directories

The skill includes language-specific code examples and SDK documentation organized by directory. Read the appropriate directory based on the detected project language.

## Directory Structure

### Python (`python/`)

Full SDK support with Claude API and Agent SDK.

- `python/claude-api/README.md` — Installation, quick start, common patterns, error handling
- `python/claude-api/tool-use.md` — Tool runner, manual loop, code execution, memory, structured outputs
- `python/claude-api/streaming.md` — Streaming responses for chat UIs
- `python/claude-api/batches.md` — Batch processing (async, 50% cost)
- `python/claude-api/files-api.md` — File uploads across multiple requests
- `python/agent-sdk/README.md` — Agent SDK: installation, built-in tools, permissions, MCP, hooks
- `python/agent-sdk/patterns.md` — Agent SDK: custom tools, hooks, subagents, MCP integration, session resumption

### TypeScript (`typescript/`)

Full SDK support with Claude API and Agent SDK. Also used for JavaScript projects.

- `typescript/claude-api/README.md` — Installation, quick start, common patterns, error handling
- `typescript/claude-api/tool-use.md` — Tool runner (betaZodTool + Zod), manual loop, code execution, memory, structured outputs
- `typescript/claude-api/streaming.md` — Streaming responses for chat UIs
- `typescript/claude-api/batches.md` — Batch processing (async, 50% cost)
- `typescript/claude-api/files-api.md` — File uploads across multiple requests
- `typescript/agent-sdk/README.md` — Agent SDK: installation, built-in tools, permissions, MCP, hooks
- `typescript/agent-sdk/patterns.md` — Agent SDK: custom tools, hooks, subagents, MCP integration, session resumption

### Java (`java/`)

Single-file SDK documentation. Also used for Kotlin and Scala projects.

- `java/claude-api.md` — Full SDK coverage: installation, quick start, tool use, streaming, batches, files

### Go (`go/`)

Single-file SDK documentation.

- `go/claude-api.md` — Full SDK coverage: installation, quick start, tool use (BetaToolRunner), streaming, batches

### Ruby (`ruby/`)

Single-file SDK documentation.

- `ruby/claude-api.md` — Full SDK coverage: installation, quick start, tool use (BaseTool + tool_runner), streaming

### C# (`csharp/`)

Single-file SDK documentation.

- `csharp/claude-api.md` — Full SDK coverage: installation, quick start, streaming

### PHP (`php/`)

Single-file SDK documentation.

- `php/claude-api.md` — Full SDK coverage: installation, quick start, tool use (BetaRunnableTool + toolRunner())

### cURL (`curl/`)

Raw HTTP examples for unsupported languages or direct API access.

- `curl/examples.md` — cURL examples for all major API operations

### Shared (`shared/`)

Cross-language reference documentation.

- `shared/tool-use-concepts.md` — Conceptual foundations for tool use, code execution, memory, structured outputs
- `shared/prompt-caching.md` — Prefix-stability design, breakpoint placement, anti-patterns
- `shared/error-codes.md` — HTTP error codes, causes, fixes, typed SDK exceptions
- `shared/models.md` — Model catalog, IDs, capabilities, programmatic discovery via Models API
- `shared/live-sources.md` — WebFetch URLs for latest official documentation
