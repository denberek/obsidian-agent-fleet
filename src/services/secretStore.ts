import type { SecretStorage } from "obsidian";

const PREFIX_SEPARATOR = "-";

/**
 * Normalize a name into a valid SecretStorage ID segment.
 * SecretStorage IDs must be lowercase alphanumeric + dashes only.
 */
function normalizeSegment(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build a full secret ID from prefix + name. */
export function toSecretId(prefix: string, name: string): string {
  return `${prefix}${PREFIX_SEPARATOR}${normalizeSegment(name)}`;
}

export const SECRET_PREFIX_CHANNEL_CRED = "af-channel-cred";

/** Prefix for MCP server secrets (bearer/OAuth tokens, secret env values),
 *  keyed by server name. Tokens never live in the vault or native configs. */
export const SECRET_PREFIX_MCP = "af-mcp-secret";

/**
 * Thin wrapper around Obsidian's SecretStorage API.
 * Provides typed get/set/delete with prefix-based namespacing.
 * Falls back gracefully if SecretStorage is unavailable (older Obsidian).
 */
export class SecretStore {
  constructor(private readonly storage: SecretStorage | undefined) {
    if (!storage) {
      console.warn(
        "Agent Fleet: SecretStorage unavailable (Obsidian < 1.11.4). Secrets will use plaintext fallback.",
      );
    }
  }

  get available(): boolean {
    return !!this.storage;
  }

  setJson<T>(prefix: string, name: string, value: T): void {
    if (!this.storage) return;
    const id = toSecretId(prefix, name);
    this.storage.setSecret(id, JSON.stringify(value));
  }

  getJson<T>(prefix: string, name: string): T | null {
    if (!this.storage) return null;
    const id = toSecretId(prefix, name);
    const raw = this.storage.getSecret(id);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  setString(prefix: string, name: string, value: string): void {
    if (!this.storage) return;
    const id = toSecretId(prefix, name);
    this.storage.setSecret(id, value);
  }

  getString(prefix: string, name: string): string | null {
    if (!this.storage) return null;
    const id = toSecretId(prefix, name);
    return this.storage.getSecret(id) || null;
  }

  delete(prefix: string, name: string): void {
    if (!this.storage) return;
    const id = toSecretId(prefix, name);
    // No removeSecret API — set to empty string to clear
    this.storage.setSecret(id, "");
  }

  /** List all secret IDs that start with the given prefix. */
  listByPrefix(prefix: string): string[] {
    if (!this.storage) return [];
    return this.storage.listSecrets().filter((id) => id.startsWith(prefix + PREFIX_SEPARATOR));
  }
}
