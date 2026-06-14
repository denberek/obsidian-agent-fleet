export function parseYaml(input: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (rawValue === "true") {
      result[key] = true;
    } else if (rawValue === "false") {
      result[key] = false;
    } else if (/^-?\d+$/.test(rawValue)) {
      result[key] = Number(rawValue);
    } else {
      result[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }

  return result;
}

export function stringifyYaml(input: Record<string, unknown>): string {
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join("\n");
}

/** Minimal normalizePath stub — real Obsidian does path normalization we don't need in tests. */
export function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/+$/, "");
}

/** TFile shim — tests use `instanceof TFile` checks; real construction is not needed. */
export class TFile {
  path: string = "";
  basename: string = "";
  extension: string = "";
  stat: { ctime: number; mtime: number; size: number } = { ctime: 0, mtime: 0, size: 0 };
}

/** TFolder shim — mirrors TFile, used in similar instanceof checks. */
export class TFolder {
  path: string = "";
  children: Array<TFile | TFolder> = [];
}

/** Vault shim — tests inject their own fake via `as unknown as Vault`. */
export class Vault {}
