/**
 * MCP Auth Manager — probe token cache + OAuth token storage.
 *
 * Stores access tokens for MCP servers. Supports two modes:
 *  1. Simple string tokens (from env vars, CLI extraction, or a user-entered
 *     static bearer token)
 *  2. Full OAuth token data (from the plugin's own PKCE flow) with refresh
 *     support
 *
 * When a {@link SecretStore} is wired in, OAuth tokens and user-entered static
 * tokens are PERSISTED there (OS keychain) so they survive reloads and can be
 * projected into agent runs (Claude `--mcp-config` header / Codex
 * `bearer_token_env_var`). Tokens are looked up lazily by server name, so we
 * never need to reverse the normalized SecretStore IDs. Tokens are never
 * written to the vault or to native `~/.claude.json` / `~/.codex/config.toml`.
 *
 * Probe tokens extracted from the environment are kept in memory only (they're
 * cheap to re-derive) and never persisted.
 */

import type { SecretStore } from "./secretStore";
import { SECRET_PREFIX_MCP } from "./secretStore";

export interface OAuthTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  tokenEndpoint: string;
  clientId: string;
  resource: string;
}

/** Persisted shape under SECRET_PREFIX_MCP/<name>. A bare bearer token only
 *  carries `accessToken`; an OAuth token carries the refresh metadata too. */
interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenEndpoint?: string;
  clientId?: string;
  resource?: string;
}

export class McpAuthManager {
  private tokens = new Map<string, string>();
  private oauthTokens = new Map<string, OAuthTokenData>();
  private secretStore?: SecretStore;

  /** Wire in the SecretStore so OAuth/static tokens persist across reloads. */
  setSecretStore(store: SecretStore): void {
    this.secretStore = store;
  }

  /** Store a simple probe token (from env var or CLI extraction). Memory-only —
   *  these are re-derivable, so we don't persist them. */
  storeProbeToken(name: string, token: string): void {
    this.tokens.set(name, token);
  }

  /** Store a user-entered static bearer token. Persisted to SecretStore. */
  storeStaticToken(name: string, token: string): void {
    this.tokens.set(name, token);
    this.secretStore?.setJson<StoredToken>(SECRET_PREFIX_MCP, name, { accessToken: token });
  }

  /** Store a full OAuth token with refresh metadata. Persisted to SecretStore. */
  storeOAuthToken(name: string, data: OAuthTokenData): void {
    this.oauthTokens.set(name, data);
    this.tokens.set(name, data.accessToken);
    this.secretStore?.setJson<StoredToken>(SECRET_PREFIX_MCP, name, {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      tokenEndpoint: data.tokenEndpoint,
      clientId: data.clientId,
      resource: data.resource,
    });
  }

  /** Hydrate the in-memory caches from SecretStore for a single server (lazy —
   *  keyed by name, so no need to enumerate normalized IDs). */
  private hydrate(name: string): StoredToken | null {
    if (!this.secretStore) return null;
    const stored = this.secretStore.getJson<StoredToken>(SECRET_PREFIX_MCP, name);
    if (!stored?.accessToken) return null;
    this.tokens.set(name, stored.accessToken);
    if (stored.tokenEndpoint && stored.clientId && stored.resource) {
      this.oauthTokens.set(name, {
        accessToken: stored.accessToken,
        refreshToken: stored.refreshToken,
        expiresAt: stored.expiresAt,
        tokenEndpoint: stored.tokenEndpoint,
        clientId: stored.clientId,
        resource: stored.resource,
      });
    }
    return stored;
  }

  /** Get the cached access token for a server (probe, static, or OAuth).
   *  Falls back to SecretStore (lazy hydrate) when not already in memory. */
  getToken(name: string): string | undefined {
    return this.tokens.get(name) ?? this.hydrate(name)?.accessToken ?? undefined;
  }

  /** Get full OAuth token data for refresh. */
  getOAuthToken(name: string): OAuthTokenData | undefined {
    if (this.oauthTokens.has(name)) return this.oauthTokens.get(name);
    this.hydrate(name);
    return this.oauthTokens.get(name);
  }

  /** Check if we have any token for a server (memory or persisted). */
  hasToken(name: string): boolean {
    return this.tokens.has(name) || !!this.hydrate(name);
  }

  /** Remove all tokens for a server (memory + persisted). */
  removeToken(name: string): void {
    this.tokens.delete(name);
    this.oauthTokens.delete(name);
    this.secretStore?.delete(SECRET_PREFIX_MCP, name);
  }

  /** Get OAuth tokens that expire within the given window. Operates on
   *  session-loaded tokens; the run-time opportunistic refresh covers any not
   *  yet hydrated. */
  getExpiringTokens(withinMs = 5 * 60_000): Map<string, OAuthTokenData> {
    const result = new Map<string, OAuthTokenData>();
    const now = Date.now();
    for (const [name, data] of this.oauthTokens) {
      if (data.refreshToken && data.expiresAt && data.expiresAt - now < withinMs) {
        result.set(name, data);
      }
    }
    return result;
  }
}
