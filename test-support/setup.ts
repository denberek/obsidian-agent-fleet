// Vitest runs in the `node` environment, which has no `window` /
// `activeWindow` / `activeDocument` globals. The plugin uses `window.setTimeout`
// etc. (Obsidian's popout-window guideline) and `activeDocument`; alias them to
// the node globals so that timer-using code runs under tests. In the real
// Electron renderer these globals exist natively.
const g = globalThis as Record<string, unknown>;
if (!g.window) g.window = globalThis;
if (!g.activeWindow) g.activeWindow = globalThis;
if (!g.activeDocument && g.document) g.activeDocument = g.document;
