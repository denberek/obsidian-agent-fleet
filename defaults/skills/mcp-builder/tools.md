# MCP Builder Tools

## Scripts

All scripts are located in the `scripts/` directory relative to the skill.

### evaluation.py

MCP Server Evaluation Harness. Evaluates MCP servers by running test questions against them using Claude.

**Usage:**

```bash
python scripts/evaluation.py [options] eval_file
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `eval_file` | Path to evaluation XML file |
| `-t, --transport` | Transport type: `stdio`, `sse`, or `http` (default: `stdio`) |
| `-m, --model` | Claude model to use (default: `claude-3-7-sonnet-20250219`) |
| `-o, --output` | Output file for report (default: print to stdout) |
| `-c, --command` | Command to run MCP server (stdio only, e.g., `python`, `node`) |
| `-a, --args` | Arguments for the command (stdio only, e.g., `server.py`) |
| `-e, --env` | Environment variables in `KEY=VALUE` format (stdio only) |
| `-u, --url` | MCP server URL (sse/http only) |
| `-H, --header` | HTTP headers in `'Key: Value'` format (sse/http only) |

**Examples:**

```bash
# Local STDIO server
python scripts/evaluation.py -t stdio -c python -a my_server.py evaluation.xml

# With environment variables
python scripts/evaluation.py -t stdio -c python -a my_server.py -e API_KEY=abc123 evaluation.xml

# SSE server
python scripts/evaluation.py -t sse -u https://example.com/mcp -H "Authorization: Bearer token" evaluation.xml

# HTTP server with output file
python scripts/evaluation.py -t http -u https://example.com/mcp -o report.md evaluation.xml
```

**Important:**
- For **stdio** transport: The script automatically launches and manages the MCP server process. Do not run the server manually.
- For **sse/http** transports: You must start the MCP server separately before running the evaluation.

**Output:** Generates a detailed report including accuracy, average task duration, tool call counts, per-task results with feedback.

---

### connections.py

Lightweight connection handling for MCP servers. Provides connection classes for different transport types.

**Classes:**

| Class | Description |
|-------|-------------|
| `MCPConnectionStdio` | MCP connection using standard input/output |
| `MCPConnectionSSE` | MCP connection using Server-Sent Events |
| `MCPConnectionHTTP` | MCP connection using Streamable HTTP |

**Factory function:**

```python
from connections import create_connection

conn = create_connection(
    transport="stdio",  # or "sse", "http"
    command="python",   # stdio only
    args=["server.py"], # stdio only
    url="https://...",  # sse/http only
    headers={...}       # sse/http only
)
```

**Usage as async context manager:**

```python
async with create_connection(transport="stdio", command="python", args=["server.py"]) as conn:
    tools = await conn.list_tools()
    result = await conn.call_tool("tool_name", {"param": "value"})
```

---

### requirements.txt

Dependencies for the evaluation scripts:

```
anthropic>=0.39.0
mcp>=1.1.0
```

Install with: `pip install -r scripts/requirements.txt`

---

### example_evaluation.xml

Example evaluation file demonstrating the XML format for evaluation questions:

```xml
<evaluation>
   <qa_pair>
      <question>Calculate the compound interest on $10,000 invested at 5% annual interest rate, compounded monthly for 3 years. What is the final amount in dollars (rounded to 2 decimal places)?</question>
      <answer>11614.72</answer>
   </qa_pair>
   <!-- More qa_pairs... -->
</evaluation>
```
