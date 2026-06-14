import type { ChannelCredentialEntry } from "../types";
import { type SecretStore, SECRET_PREFIX_CHANNEL_CRED } from "./secretStore";

/**
 * In-memory store for channel credentials (Slack bot + app tokens, etc.) backed
 * by Obsidian's SecretStorage API for secure persistence.
 *
 * On first load, migrates plaintext credentials from `data.json` into SecretStorage
 * and clears the plaintext copy. Subsequent loads read directly from SecretStorage.
 */
export class ChannelCredentialStore {
  private credentials = new Map<string, ChannelCredentialEntry>();
  private secretStore?: SecretStore;
  private persistCallback?: (credentials: Record<string, ChannelCredentialEntry>) => void;

  /** Inject SecretStore for secure persistence. Must be called before loadCredentials(). */
  setSecretStore(store: SecretStore): void {
    this.secretStore = store;
  }

  /**
   * Load credentials from SecretStore (preferred) or from a plaintext fallback
   * (used during migration). If fallback has data and SecretStore is empty,
   * credentials are migrated to SecretStore automatically.
   */
  loadCredentials(fallback?: Record<string, ChannelCredentialEntry>): void {
    this.credentials.clear();

    // Try SecretStore first
    if (this.secretStore?.available) {
      const ids = this.secretStore.listByPrefix(SECRET_PREFIX_CHANNEL_CRED);
      for (const id of ids) {
        const prefix = SECRET_PREFIX_CHANNEL_CRED + "-";
        const ref = id.startsWith(prefix) ? id.slice(prefix.length) : id;
        const entry = this.secretStore.getJson<ChannelCredentialEntry & { _ref?: string }>(
          SECRET_PREFIX_CHANNEL_CRED, ref,
        );
        if (entry) {
          const originalRef = entry._ref ?? ref;
          // Remove the _ref helper before using
          const clean = { ...entry };
          delete (clean as Record<string, unknown>)._ref;
          this.credentials.set(originalRef, clean);
        }
      }
    }

    // If SecretStore was empty and fallback has data, migrate
    if (this.credentials.size === 0 && fallback) {
      for (const [key, entry] of Object.entries(fallback)) {
        this.credentials.set(key, entry);
      }
      if (this.secretStore?.available && this.credentials.size > 0) {
        this.persistToSecretStore();
      }
    }
  }

  onChanged(cb: (credentials: Record<string, ChannelCredentialEntry>) => void): void {
    this.persistCallback = cb;
  }

  get(ref: string): ChannelCredentialEntry | undefined {
    return this.credentials.get(ref);
  }

  set(ref: string, entry: ChannelCredentialEntry): void {
    this.credentials.set(ref, entry);
    this.persist();
  }

  delete(ref: string): void {
    this.credentials.delete(ref);
    this.secretStore?.delete(SECRET_PREFIX_CHANNEL_CRED, ref);
    this.persist();
  }

  list(): Array<{ ref: string; entry: ChannelCredentialEntry }> {
    return Array.from(this.credentials.entries()).map(([ref, entry]) => ({ ref, entry }));
  }

  toRecord(): Record<string, ChannelCredentialEntry> {
    const record: Record<string, ChannelCredentialEntry> = {};
    for (const [key, entry] of this.credentials.entries()) {
      record[key] = entry;
    }
    return record;
  }

  private persist(): void {
    this.persistToSecretStore();
    // Legacy callback — used to clear plaintext from settings after migration
    if (this.persistCallback) {
      this.persistCallback(this.toRecord());
    }
  }

  private persistToSecretStore(): void {
    if (!this.secretStore?.available) return;
    for (const [ref, entry] of this.credentials) {
      // Store with _ref so we can recover the original ref from the normalized ID
      this.secretStore.setJson(SECRET_PREFIX_CHANNEL_CRED, ref, { ...entry, _ref: ref });
    }
  }
}
