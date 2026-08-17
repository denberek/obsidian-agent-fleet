import esbuild from "esbuild";
import { builtinModules } from "node:module";

// Node built-ins (plus their `node:` aliases) are external — the plugin runs in
// Electron's Node context and must not bundle them.
const builtins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

const prod = process.argv.includes("production");

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // CodeMirror 6 is supplied by Obsidian at runtime. Bundling a second copy
  // would give us StateField/Extension/EditorView identities the host editor
  // does not recognize, so the revision editor extension would silently do
  // nothing (REVISION_MODE_DESIGN.md §10.2).
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtins],
  format: "cjs",
  // Obsidian plugins run in an Electron renderer with Node integration enabled,
  // so Node-only npm packages (e.g. `ws` for the Slack adapter's Socket Mode
  // WebSocket) must be resolved against their Node implementation — not their
  // browser shim. Without platform: "node", esbuild honors each package's
  // `browser` field and bundles shims that throw "ws does not work in the
  // browser" at runtime.
  platform: "node",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: "main.js",
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}
