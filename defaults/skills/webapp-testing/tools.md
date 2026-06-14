# Scripts

## scripts/with_server.py

Start one or more servers, wait for them to be ready, run a command, then clean up.

### Usage

```bash
# Single server
python scripts/with_server.py --server "npm run dev" --port 5173 -- python automation.py
python scripts/with_server.py --server "npm start" --port 3000 -- python test.py

# Multiple servers
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "cd frontend && npm run dev" --port 5173 \
  -- python test.py
```

### Arguments

| Argument | Description |
|----------|-------------|
| `--server` | Server command to run (can be repeated for multiple servers) |
| `--port` | Port for each server (must match `--server` count) |
| `--timeout` | Timeout in seconds per server (default: 30) |
| `command` | Command to run after all servers are ready (after `--` separator) |

### Behavior

1. Starts all servers as subprocesses (supports shell commands with `cd` and `&&`)
2. Polls each server's port until it accepts connections (or timeout)
3. Runs the specified command once all servers are ready
4. On completion or error, terminates all server processes (with 5s graceful timeout, then SIGKILL)

### Error Handling

- Exits with error if number of `--server` and `--port` arguments don't match
- Raises `RuntimeError` if a server fails to start within the timeout
- Always cleans up server processes in the `finally` block
- Exits with the return code of the executed command
