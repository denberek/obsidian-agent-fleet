import { spawn, execSync, type ChildProcess, type SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ═══════════════════════════════════════════════════════
//  Path helpers
// ═══════════════════════════════════════════════════════

/** Cross-platform home directory (works on macOS, Linux, Windows). */
export function homeDir(): string {
  return homedir();
}

/** Path to the Claude config directory (`~/.claude`). */
export function claudeConfigDir(): string {
  return join(homedir(), ".claude");
}

/** Path to the Claude config file (`~/.claude.json`). */
export function claudeConfigFile(): string {
  return join(homedir(), ".claude.json");
}

// ═══════════════════════════════════════════════════════
//  Process spawning
// ═══════════════════════════════════════════════════════

/**
 * Find the login shell to use on Unix systems.
 * macOS → /bin/zsh, Linux → /bin/bash, fallback → /bin/sh.
 */
function findLoginShell(): string {
  if (process.platform === "darwin") {
    return "/bin/zsh";
  }
  for (const sh of ["/bin/bash", "/bin/zsh", "/bin/sh"]) {
    if (existsSync(sh)) return sh;
  }
  return "/bin/sh";
}

/**
 * Shell-escape a single argument for use in a Unix shell command.
 * Wraps in single quotes, escaping embedded single quotes.
 */
function unixShellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Spawn the Claude CLI (or any CLI) cross-platform.
 *
 * - **macOS/Linux:** Wraps in a login shell (`/bin/zsh -l -c` or `/bin/bash -l -c`)
 *   so that `~/.zshenv` / `~/.bashrc` env vars are available even when Obsidian
 *   is launched from the Dock/desktop.
 * - **Windows:** Spawns the command directly — Windows Obsidian inherits env properly.
 */
export function spawnCli(
  command: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string | undefined> },
): ChildProcess {
  const spawnOpts: SpawnOptions = {
    cwd: opts?.cwd,
    env: opts?.env as NodeJS.ProcessEnv,
  };

  if (process.platform === "win32") {
    return spawn(command, args, spawnOpts);
  }

  // Unix: wrap in login shell
  const shell = findLoginShell();
  const shellCmd = [command, ...args].map(unixShellEscape).join(" ");
  return spawn(shell, ["-l", "-c", shellCmd], spawnOpts);
}

/**
 * Spawn a raw shell command string cross-platform.
 * Used when the command is already a complete string (e.g. MCP stdio probe commands).
 *
 * - **macOS/Linux:** `/bin/zsh -l -c '<cmd>'`
 * - **Windows:** `cmd.exe /c <cmd>` (via Node's `shell: true`)
 */
export function spawnShell(
  shellCmd: string,
  opts?: { cwd?: string; env?: Record<string, string | undefined> },
): ChildProcess {
  const spawnOpts: SpawnOptions = {
    cwd: opts?.cwd,
    env: opts?.env as NodeJS.ProcessEnv,
    stdio: ["pipe", "pipe", "pipe"],
  };

  if (process.platform === "win32") {
    return spawn(shellCmd, [], { ...spawnOpts, shell: true });
  }

  const shell = findLoginShell();
  return spawn(shell, ["-l", "-c", shellCmd], spawnOpts);
}

// ═══════════════════════════════════════════════════════
//  Browser launch
// ═══════════════════════════════════════════════════════

/** Open a URL in the default browser, cross-platform. */
export function openBrowser(url: string): void {
  // Use Electron's shell.openExternal — handles URL encoding correctly on all
  // platforms without cmd.exe & parsing issues on Windows.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require("electron") as { shell: { openExternal: (url: string) => Promise<void> } };
    void electron.shell.openExternal(url);
  } catch {
    // Fallback if electron module is unavailable
    switch (process.platform) {
      case "darwin":
        spawn("open", [url], { stdio: "ignore" });
        break;
      case "win32":
        spawn("cmd.exe", ["/c", "start", "", url.replace(/&/g, "^&")], { stdio: "ignore" });
        break;
      default:
        spawn("xdg-open", [url], { stdio: "ignore" });
        break;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Line splitting
// ═══════════════════════════════════════════════════════

/** Split text into lines, handling both Unix (`\n`) and Windows (`\r\n`) endings. */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

// ═══════════════════════════════════════════════════════
//  CLI path resolution
// ═══════════════════════════════════════════════════════

/**
 * Return platform-appropriate candidate paths for the Claude CLI.
 * Filters out empty/invalid entries.
 */
export function resolveClaudeCliCandidates(configuredPath: string): string[] {
  const home = homedir();

  if (process.platform === "win32") {
    return [
      configuredPath,
      join(process.env.APPDATA ?? "", "Claude", "claude.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Claude", "claude.exe"),
      join(home, ".local", "bin", "claude.exe"),
      "claude.exe",
      "claude",
    ].filter((c) => !!c && isValidCliPath(c));
  }

  // macOS + Linux
  const candidates = [
    configuredPath,
    join(home, ".local", "bin", "claude"),
  ];

  if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin/claude");
  }

  candidates.push("/usr/local/bin/claude", "/usr/bin/claude", "claude");

  return candidates.filter((c) => !!c && isValidCliPath(c));
}

/**
 * Return platform-appropriate candidate paths for the OpenAI Codex CLI.
 * Covers the curl installer (~/.local/bin), Homebrew cask, npm global, and
 * bare PATH resolution. Filters out empty/invalid entries.
 */
export function resolveCodexCliCandidates(configuredPath: string): string[] {
  const home = homedir();

  if (process.platform === "win32") {
    return [
      configuredPath,
      join(home, ".local", "bin", "codex.exe"),
      "codex.exe",
      "codex",
    ].filter((c) => !!c && isValidCliPath(c));
  }

  // macOS + Linux
  const candidates = [
    configuredPath,
    join(home, ".local", "bin", "codex"),
  ];

  if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin/codex");
  }

  candidates.push("/usr/local/bin/codex", "/usr/bin/codex", "codex");

  return candidates.filter((c) => !!c && isValidCliPath(c));
}

/** Reject paths containing newlines, null bytes, or unexpected shell metacharacters. */
export function isValidCliPath(p: string): boolean {
  if (!p || /[\n\r\0]/.test(p)) return false;
  // Unix absolute paths
  if (p.startsWith("/")) return /^[\w/.@+-]+$/.test(p);
  // Unix home-relative
  if (p.startsWith("~")) return /^~[\w/.@+-]*$/.test(p);
  // Windows drive-letter paths (C:\... or C:/...)
  if (/^[a-zA-Z]:[\\/]/.test(p)) return /^[a-zA-Z]:[\\/][\w\\/. @+-]+$/.test(p);
  // Windows UNC paths (\\server\share)
  if (p.startsWith("\\\\")) return /^\\\\[\w\\/. @+-]+$/.test(p);
  // Bare command names (resolved via PATH)
  if (!p.includes("/") && !p.includes("\\")) return /^[\w.@+-]+$/.test(p);
  return false;
}

/** Check whether a path looks like an absolute or drive-letter path (not a bare command). */
export function isAbsolutePath(p: string): boolean {
  if (p.includes("/")) return true;
  if (p.includes("\\")) return true;
  return false;
}

/**
 * Try to resolve a bare command name to a full path using the system's command locator.
 * Returns the resolved path or null on failure.
 */
export function whichCommand(name: string): string | null {
  try {
    if (process.platform === "win32") {
      const result = execSync(`where ${name}`, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      // `where` may return multiple lines — take the first
      const first = result.split(/\r?\n/)[0];
      return first && existsSync(first) ? first : null;
    }

    // Unix: try each shell
    const shells = ["/bin/zsh", "/bin/bash", "/bin/sh"];
    for (const shell of shells) {
      if (!existsSync(shell)) continue;
      try {
        const result = execSync(`${shell} -l -c "which ${name}"`, {
          encoding: "utf8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        if (result && existsSync(result)) return result;
      } catch { /* try next shell */ }
    }
  } catch { /* ignore */ }
  return null;
}
