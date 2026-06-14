#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");

const PLUGIN_ID = "agent-fleet";
const PLUGIN_DIR = path.join(__dirname, "..", "plugin");

function getObsidianConfigPath() {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
    case "win32":
      return path.join(process.env.APPDATA || "", "obsidian", "obsidian.json");
    case "linux":
      return path.join(os.homedir(), ".config", "obsidian", "obsidian.json");
    default:
      return null;
  }
}

function getVaults() {
  const configPath = getObsidianConfigPath();
  if (!configPath || !fs.existsSync(configPath)) return [];

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const vaults = config.vaults || {};
    return Object.values(vaults)
      .filter((v) => v.path && fs.existsSync(v.path))
      .map((v) => ({ path: v.path, open: v.open || false }));
  } catch {
    return [];
  }
}

function resolveClaudePath() {
  const { execSync } = require("child_process");

  if (process.platform === "win32") {
    // Windows: use `where` to find claude on PATH
    try {
      const result = execSync("where claude", {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim().split(/\r?\n/)[0];
      if (result && fs.existsSync(result)) return result;
    } catch { /* skip */ }
    // Check common Windows install locations
    const candidates = [
      path.join(process.env.APPDATA || "", "Claude", "claude.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Claude", "claude.exe"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  // macOS / Linux: use shell login to find claude via `which`
  const shells = ["/bin/zsh", "/bin/bash", "/bin/sh"];
  for (const shell of shells) {
    if (!fs.existsSync(shell)) continue;
    try {
      const result = execSync(`${shell} -l -c "which claude"`, {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (result && fs.existsSync(result)) return result;
    } catch { /* skip */ }
  }
  return null;
}

function writePluginSettings(vaultPath, claudePath) {
  const dataPath = path.join(vaultPath, ".obsidian", "plugins", PLUGIN_ID, "data.json");

  let settings = {};
  if (fs.existsSync(dataPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch { /* start fresh */ }
  }

  if (claudePath && (!settings.claudeCliPath || settings.claudeCliPath === "claude")) {
    settings.claudeCliPath = claudePath;
  }

  fs.writeFileSync(dataPath, JSON.stringify(settings, null, 2));
}

function installToVault(vaultPath) {
  const pluginDir = path.join(vaultPath, ".obsidian", "plugins", PLUGIN_ID);

  fs.mkdirSync(pluginDir, { recursive: true });

  const files = ["main.js", "manifest.json", "styles.css"];
  for (const file of files) {
    const src = path.join(PLUGIN_DIR, file);
    const dst = path.join(pluginDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  return pluginDir;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "install";
  const isAuto = args.includes("--auto");

  if (command === "install" || command === "update") {
    const vaults = getVaults();

    if (vaults.length === 0) {
      if (isAuto) return;
      console.error("❌ No Obsidian vaults found.");
      console.error("   Make sure Obsidian is installed and has at least one vault.");
      console.error("");
      console.error("   Manual install:");
      console.error("   Copy the files from node_modules/obsidian-agent-fleet/plugin/");
      console.error("   to <your-vault>/.obsidian/plugins/agent-fleet/");
      process.exit(1);
    }

    const claudePath = resolveClaudePath();
    if (!isAuto) {
      if (claudePath) {
        console.log(`🔍 Found Claude CLI: ${claudePath}`);
      } else {
        console.log("⚠️  Claude CLI not found. Install it: npm install -g @anthropic-ai/claude-code");
      }
    }

    let installed = 0;
    for (const vault of vaults) {
      try {
        const dest = installToVault(vault.path);
        if (claudePath) {
          writePluginSettings(vault.path, claudePath);
        }
        const vaultName = path.basename(vault.path);
        console.log(`✅ Installed to "${vaultName}" → ${dest}`);
        installed++;
      } catch (err) {
        const vaultName = path.basename(vault.path);
        if (!isAuto) {
          console.error(`❌ Failed to install to "${vaultName}": ${err.message}`);
        }
      }
    }

    if (installed > 0 && !isAuto) {
      console.log("");
      console.log(`🎉 Agent Fleet installed to ${installed} vault${installed > 1 ? "s" : ""}.`);
      if (claudePath) {
        console.log(`   Claude CLI path saved: ${claudePath}`);
      }
      console.log("   Restart Obsidian, then enable Agent Fleet in Settings → Community Plugins.");
    }
  } else if (command === "vaults") {
    const vaults = getVaults();
    if (vaults.length === 0) {
      console.log("No Obsidian vaults found.");
    } else {
      console.log("Obsidian vaults:");
      for (const vault of vaults) {
        const name = path.basename(vault.path);
        console.log(`  ${vault.open ? "🟢" : "⚪"} ${name} → ${vault.path}`);
      }
    }
  } else if (command === "help" || command === "--help" || command === "-h") {
    console.log("Agent Fleet for Obsidian");
    console.log("");
    console.log("Usage: agent-fleet <command>");
    console.log("");
    console.log("Commands:");
    console.log("  install    Install plugin to all Obsidian vaults");
    console.log("  update     Same as install (copies latest files)");
    console.log("  vaults     List detected Obsidian vaults");
    console.log("  help       Show this help message");
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Run 'agent-fleet help' for usage.");
    process.exit(1);
  }
}

main();
