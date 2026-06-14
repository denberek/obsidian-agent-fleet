import * as crypto from "crypto";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import type { FleetSettings, McpServer, McpTool } from "../types";
import type { McpAuthManager } from "./mcpAuth";
import { homeDir, openBrowser, spawnShell, splitLines } from "../utils/platform";

/** OAuth 2.1 Authorization Server Metadata (RFC 8414). */
interface OAuthMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
}

/** Minimal shape of the JSON-RPC responses we read during an stdio tool probe. */
interface JsonRpcProbeMessage {
  id?: number;
  result?: {
    instructions?: string;
    serverInfo?: { description?: string };
    tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  };
}

/** OAuth discovery result: auth server metadata + resource-level scopes. */
interface OAuthDiscoveryResult {
  metadata: OAuthMetadata;
  /** Scopes from the resource metadata (narrower, preferred over auth server scopes). */
  resourceScopes?: string[];
  /** The resource identifier (used as RFC 8707 resource parameter). */
  resource: string;
}

/**
 * MCP auth + tool prober (MCP v2).
 *
 * The fleet MCP registry (`_fleet/mcp/*.md`) is the source of truth — server
 * discovery no longer shells out to `claude mcp list` and no longer reads or
 * mutates `~/.claude.json` / `~/.codex/config.toml`. What remains here is:
 *
 *  1. The OAuth 2.1 PKCE flow (RFC 8414 discovery, DCR, browser auth, token
 *     exchange + refresh) used to authenticate HTTP/SSE servers. Tokens are
 *     stored in the keychain-backed {@link McpAuthManager} (NOT injected into
 *     native configs) and projected into runs per-spawn by `mcpProjection.ts`.
 *  2. On-demand tool probing for the MCP Servers UI (stdio: spawn + JSON-RPC
 *     initialize/tools/list; HTTP/SSE: streamable-HTTP probe with the token).
 *
 * Probing is a diagnostics concern only — it never gates an agent run.
 */
export class McpManager {
  private authManager?: McpAuthManager;

  // `settings` is retained for construction-site compatibility (the runtime
  // builds this alongside the executor); the manager no longer shells out.
  constructor(private readonly settings: FleetSettings) {
    void this.settings;
  }

  /** Inject the auth manager for token storage + probe token access. */
  setAuthManager(auth: McpAuthManager): void {
    this.authManager = auth;
  }

  // ═══════════════════════════════════════════════════════
  //  On-demand tool probe (UI / diagnostics)
  // ═══════════════════════════════════════════════════════

  /**
   * Probe a single registry server for its tool list. Returns [] on any
   * failure (no token, unreachable, bad transport) — probing never throws into
   * the UI and never affects a run.
   */
  async probeServer(server: McpServer): Promise<McpTool[]> {
    try {
      if (server.type === "stdio" && server.command) {
        const result = await this.probeStdioServer(server.command, server.args);
        return result.tools;
      }
      if ((server.type === "http" || server.type === "sse") && server.url) {
        return await this.probeHttpServer(server);
      }
    } catch (err) {
      console.warn(`McpManager: probe failed for ${server.name}:`, err);
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════
  //  OAuth authentication
  // ═══════════════════════════════════════════════════════

  /**
   * Authenticate an HTTP/SSE MCP server using the plugin's own OAuth 2.1 PKCE
   * flow, then store the token in the (keychain-backed) auth manager.
   *
   * Flow:
   *  1. Discover OAuth metadata (RFC 8414 path-aware)
   *  2. Dynamic Client Registration (DCR) to get client_id
   *  3. PKCE code_verifier + S256 challenge
   *  4. Start local HTTP callback server on random port
   *  5. Open browser for user authorization
   *  6. Receive auth code on callback
   *  7. Exchange code for access_token + refresh_token
   *  8. Store token for plugin probing + projection + refresh
   *
   * Unlike MCP v1, the token is NOT written into ~/.claude.json — it lives only
   * in the keychain-backed store and is projected into runs per-spawn.
   */
  async authenticateServer(name: string, url: string, _transport: "http" | "sse" = "http"): Promise<void> {
    // 1. Discover OAuth metadata (full MCP spec: 401 → resource metadata → auth server)
    const discovery = await this.discoverOAuthMetadata(url);
    if (!discovery) {
      throw new Error("Server does not support OAuth — no authorization metadata found.");
    }
    const { metadata, resourceScopes, resource } = discovery;
    if (!metadata.registration_endpoint) {
      throw new Error("Server does not support Dynamic Client Registration.");
    }

    // 2. Start callback server on random port
    const callback = await this.startOAuthCallbackServer();
    const redirectUri = `http://localhost:${callback.port}/callback`;

    try {
      // 3. Register client via DCR
      const clientId = await this.registerOAuthClient(metadata.registration_endpoint, redirectUri);

      // 4. Generate PKCE verifier + S256 challenge
      const codeVerifier = crypto.randomBytes(32).toString("base64url");
      const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

      // 5. Build authorization URL
      const state = crypto.randomBytes(16).toString("hex");
      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        redirect_uri: redirectUri,
        state,
        resource,
      });
      // Prefer resource-level scopes (narrower) over auth server scopes
      const scopes = resourceScopes ?? metadata.scopes_supported;
      if (scopes?.length) {
        params.set("scope", scopes.join(" "));
      }
      // Use URL to properly merge params (handles endpoints that already have query params)
      const authUrlObj = new URL(metadata.authorization_endpoint);
      for (const [key, value] of params) {
        authUrlObj.searchParams.set(key, value);
      }
      const authUrl = authUrlObj.toString();

      // 6. Open browser
      openBrowser(authUrl);

      // 7. Wait for callback (3-minute timeout)
      const code = await callback.waitForCode(state, 180_000);

      // 8. Exchange code for token
      const tokenResult = await this.exchangeOAuthCode(
        metadata.token_endpoint, code, redirectUri, clientId, codeVerifier,
      );

      // 9. Store in auth manager (persists to SecretStore) for probing,
      //    projection, and future refresh. No native-config mutation.
      this.authManager?.storeOAuthToken(name, {
        accessToken: tokenResult.access_token,
        refreshToken: tokenResult.refresh_token,
        expiresAt: tokenResult.expires_in
          ? Date.now() + tokenResult.expires_in * 1000
          : undefined,
        tokenEndpoint: metadata.token_endpoint,
        clientId,
        resource,
      });
    } finally {
      callback.close();
    }
  }

  /**
   * Refresh expiring OAuth tokens via the refresh_token grant. Called
   * periodically from the plugin's heartbeat interval. Refreshed tokens are
   * persisted to SecretStore so the next run projects the fresh token.
   */
  async refreshProbeTokens(): Promise<void> {
    if (!this.authManager) return;

    const expiring = this.authManager.getExpiringTokens();
    for (const [name, data] of expiring) {
      if (!data.refreshToken) continue;
      try {
        const body = new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: data.refreshToken,
          client_id: data.clientId,
        }).toString();

        const resp = await this.oauthFetch(
          data.tokenEndpoint, "POST", body, "application/x-www-form-urlencoded",
        );

        if (resp.status === 200) {
          const tokenData = JSON.parse(resp.body) as Record<string, unknown>;
          const accessToken = tokenData.access_token as string | undefined;
          if (accessToken) {
            this.authManager.storeOAuthToken(name, {
              accessToken,
              refreshToken: (tokenData.refresh_token as string | undefined) ?? data.refreshToken,
              expiresAt: typeof tokenData.expires_in === "number"
                ? Date.now() + (tokenData.expires_in) * 1000
                : undefined,
              tokenEndpoint: data.tokenEndpoint,
              clientId: data.clientId,
              resource: data.resource,
            });
          }
        }
      } catch (err) {
        console.warn(`McpManager: failed to refresh token for ${name}:`, err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  //  OAuth Helpers
  // ═══════════════════════════════════════════════════════

  /**
   * Full MCP OAuth discovery per the spec:
   *  1. POST to MCP URL → 401 with www-authenticate header
   *  2. Read resource_metadata URL from header → fetch Protected Resource Metadata (RFC 9728)
   *  3. Get authorization_servers[0] from resource metadata
   *  4. Fetch Authorization Server Metadata (RFC 8414) from that server
   *
   * This handles cross-domain auth (e.g. MCP on ai.todoist.net, auth on todoist.com).
   */
  private async discoverOAuthMetadata(serverUrl: string): Promise<OAuthDiscoveryResult | null> {
    const mcpUrl = serverUrl.endsWith("/sse")
      ? serverUrl.replace(/\/sse$/, "/mcp")
      : serverUrl;
    const parsed = new URL(mcpUrl);

    // Step 1: POST to MCP URL to get the www-authenticate header
    let resourceMetaUrl: string | undefined;
    try {
      const challengeResp = await this.oauthFetch(mcpUrl, "POST", "{}", "application/json");
      if (challengeResp.status === 401) {
        // Parse resource_metadata from: Bearer resource_metadata="<url>"
        const match = challengeResp.headers?.["www-authenticate"]
          ?.match(/resource_metadata="([^"]+)"/);
        resourceMetaUrl = match?.[1];
      }
    } catch { /* continue with fallback */ }

    // Fallback: derive resource metadata URL from the MCP URL
    if (!resourceMetaUrl) {
      resourceMetaUrl = `${parsed.origin}/.well-known/oauth-protected-resource${parsed.pathname}`;
    }

    // Step 2: Fetch Protected Resource Metadata (RFC 9728)
    let authServerOrigin = parsed.origin;
    let resourceScopes: string[] | undefined;
    let resource = mcpUrl;
    try {
      const resMeta = await this.oauthFetch(resourceMetaUrl, "GET");
      if (resMeta.status === 200) {
        const resData = JSON.parse(resMeta.body) as Record<string, unknown>;
        // Get the authorization server (may be on a different domain)
        const servers = resData.authorization_servers as string[] | undefined;
        if (servers?.[0]) {
          authServerOrigin = servers[0];
        }
        // Resource-level scopes (narrower than auth server scopes)
        if (Array.isArray(resData.scopes_supported)) {
          resourceScopes = resData.scopes_supported as string[];
        }
        // Resource identifier for RFC 8707
        if (typeof resData.resource === "string") {
          resource = resData.resource;
        }
      }
    } catch { /* continue — try auth server discovery anyway */ }

    // Step 3: Fetch Authorization Server Metadata (RFC 8414)
    const authParsed = new URL(authServerOrigin);
    const authPath = authParsed.pathname === "/" ? "" : authParsed.pathname;

    // Path-aware discovery first
    const pathAwareUrl = `${authParsed.origin}/.well-known/oauth-authorization-server${authPath}`;
    try {
      const resp = await this.oauthFetch(pathAwareUrl, "GET");
      if (resp.status === 200) {
        return {
          metadata: JSON.parse(resp.body) as OAuthMetadata,
          resourceScopes,
          resource,
        };
      }
    } catch { /* try fallback */ }

    // Fallback: root well-known
    if (authPath) {
      const rootUrl = `${authParsed.origin}/.well-known/oauth-authorization-server`;
      try {
        const resp = await this.oauthFetch(rootUrl, "GET");
        if (resp.status === 200) {
          return {
            metadata: JSON.parse(resp.body) as OAuthMetadata,
            resourceScopes,
            resource,
          };
        }
      } catch { /* not found */ }
    }

    return null;
  }

  /**
   * Register a client via Dynamic Client Registration (DCR).
   */
  private async registerOAuthClient(endpoint: string, redirectUri: string): Promise<string> {
    const body = JSON.stringify({
      client_name: "Agent Fleet Obsidian Plugin",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    const resp = await this.oauthFetch(endpoint, "POST", body, "application/json");
    if (resp.status !== 200 && resp.status !== 201) {
      throw new Error(`Client registration failed (HTTP ${resp.status})`);
    }

    const data = JSON.parse(resp.body) as Record<string, unknown>;
    if (!data.client_id) {
      throw new Error("Client registration response missing client_id");
    }
    return data.client_id as string;
  }

  /**
   * Start a local HTTP server to receive the OAuth callback.
   * Listens on a random port on 127.0.0.1.
   */
  private async startOAuthCallbackServer(): Promise<{
    port: number;
    waitForCode: (expectedState: string, timeoutMs: number) => Promise<string>;
    close: () => void;
  }> {
    let onResult: ((code: string, state: string) => void) | null = null;
    let onError: ((err: Error) => void) | null = null;

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", "http://localhost");
      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const error = reqUrl.searchParams.get("error");
      if (error) {
        const desc = reqUrl.searchParams.get("error_description") ?? error;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body style='font-family:system-ui;text-align:center;padding:60px'>"
          + "<h2>Authorization Failed</h2><p>" + desc + "</p>"
          + "<p style='color:#888'>You can close this tab.</p>"
          + "</body></html>",
        );
        onError?.(new Error(`OAuth denied: ${desc}`));
        return;
      }

      const code = reqUrl.searchParams.get("code");
      const state = reqUrl.searchParams.get("state");
      if (!code || !state) {
        res.writeHead(400);
        res.end("Missing code or state");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<html><body style='font-family:system-ui;text-align:center;padding:60px'>"
        + "<h2 style='color:#22c55e'>Authenticated!</h2>"
        + "<p>You can close this tab and return to Obsidian.</p>"
        + "<script>window.setTimeout(()=>window.close(),2000)</script>"
        + "</body></html>",
      );
      onResult?.(code, state);
    });

    const port = await new Promise<number>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("Failed to bind callback server"));
          return;
        }
        resolve(addr.port);
      });
      server.on("error", reject);
    });

    return {
      port,
      waitForCode: (expectedState: string, timeoutMs: number) =>
        new Promise<string>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            reject(new Error("Authentication timed out — complete authorization in your browser and try again."));
          }, timeoutMs);

          onResult = (code: string, state: string) => {
            window.clearTimeout(timer);
            if (state !== expectedState) {
              reject(new Error("OAuth state mismatch — possible CSRF attack"));
            } else {
              resolve(code);
            }
          };
          onError = (err: Error) => {
            window.clearTimeout(timer);
            reject(err);
          };
        }),
      close: () => { try { server.close(); } catch { /* ignore */ } },
    };
  }

  /**
   * Exchange an authorization code for tokens at the token endpoint.
   */
  private async exchangeOAuthCode(
    tokenEndpoint: string,
    code: string,
    redirectUri: string,
    clientId: string,
    codeVerifier: string,
  ): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString();

    const resp = await this.oauthFetch(
      tokenEndpoint, "POST", body, "application/x-www-form-urlencoded",
    );

    if (resp.status !== 200) {
      throw new Error(`Token exchange failed (HTTP ${resp.status}): ${resp.body}`);
    }

    const data = JSON.parse(resp.body) as Record<string, unknown>;
    if (!data.access_token) {
      throw new Error("Token response missing access_token");
    }
    return data as { access_token: string; refresh_token?: string; expires_in?: number };
  }

  /**
   * Generic HTTP(S) fetch for OAuth endpoints.
   */
  private oauthFetch(
    url: string,
    method: "GET" | "POST",
    body?: string,
    contentType?: string,
  ): Promise<{ status: number; body: string; headers?: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isSecure = parsed.protocol === "https:";
      const reqHeaders: Record<string, string> = { Accept: "application/json" };
      if (body) {
        reqHeaders["Content-Type"] = contentType ?? "application/json";
        reqHeaders["Content-Length"] = String(Buffer.byteLength(body));
      }

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isSecure ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers: reqHeaders,
      };

      const transport = isSecure ? https : http;
      const req = transport.request(options, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          // Flatten response headers to simple string record
          const respHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === "string") respHeaders[k] = v;
            else if (Array.isArray(v)) respHeaders[k] = v.join(", ");
          }
          resolve({ status: res.statusCode ?? 0, body: data, headers: respHeaders });
        });
      });

      req.on("error", reject);
      const timer = window.setTimeout(() => { req.destroy(); reject(new Error("OAuth request timed out")); }, 15000);
      req.on("close", () => window.clearTimeout(timer));
      if (body) req.write(body);
      req.end();
    });
  }

  // ═══════════════════════════════════════════════════════
  //  stdio Probe (JSON-RPC)
  // ═══════════════════════════════════════════════════════

  private probeStdioServer(
    command: string,
    args?: string[],
  ): Promise<{ description?: string; tools: McpTool[] }> {
    return new Promise((resolve) => {
      const shellCmd = args && args.length > 0 ? `${command} ${args.join(" ")}` : command;
      const proc = spawnShell(shellCmd, {
        env: { ...process.env },
      });

      let stdout = "";
      let description: string | undefined;
      const tools: McpTool[] = [];
      let resolved = false;
      let gotInit = false;
      let gotTools = false;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        proc.kill();
        resolve({ description, tools });
      };

      const timer = window.setTimeout(finish, 10000);

      proc.stdout!.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        const lines = splitLines(stdout);
        stdout = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed) as JsonRpcProbeMessage;
            if (msg.id === 1 && msg.result) {
              description = msg.result.instructions ?? msg.result.serverInfo?.description;
              gotInit = true;
              try {
                proc.stdin!.write(
                  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
                );
                proc.stdin!.write(
                  JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n",
                );
              } catch {
                window.clearTimeout(timer);
                finish();
                return;
              }
            } else if (msg.id === 2 && msg.result) {
              for (const t of msg.result.tools ?? []) {
                tools.push({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                });
              }
              gotTools = true;
            }
          } catch { /* skip */ }

          if (gotInit && gotTools) {
            window.clearTimeout(timer);
            finish();
          }
        }
      });

      proc.on("error", () => { window.clearTimeout(timer); finish(); });
      proc.on("close", () => { window.clearTimeout(timer); finish(); });

      try {
        proc.stdin!.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "agent-fleet", version: "1.0.0" },
            },
          }) + "\n",
        );
      } catch {
        window.clearTimeout(timer);
        finish();
      }
    });
  }

  // ═══════════════════════════════════════════════════════
  //  HTTP/SSE Probe
  // ═══════════════════════════════════════════════════════

  /**
   * Probe an HTTP/SSE MCP server using the Streamable HTTP protocol.
   * Uses tokens from the auth manager (OAuth or CLI-extracted) or env vars.
   */
  private async probeHttpServer(server: McpServer): Promise<McpTool[]> {
    const token = await this.findServerToken(server);
    if (!token) {
      // No token — skip the probe silently (the UI shows the needs-auth state).
      return [];
    }

    const url = server.url!.endsWith("/sse")
      ? server.url!.replace(/\/sse$/, "/mcp")
      : server.url!;

    try {
      // Initialize
      const initResult = await this.httpRequest(url, token, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "agent-fleet", version: "1.0.0" },
        },
      });

      const sessionId = initResult?._sessionId as string | undefined;

      // Initialized notification
      await this.httpRequest(url, token, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }, sessionId);

      // List tools
      const toolsResult = await this.httpRequest(url, token, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }, sessionId);

      const tools: McpTool[] = [];
      const result = toolsResult;
      const resultObj = result?.result as Record<string, unknown> | undefined;
      const rawTools = (resultObj?.tools as Record<string, unknown>[]) ?? [];
      for (const t of rawTools) {
        tools.push({
          name: t.name as string,
          description: t.description as string | undefined,
          inputSchema: t.inputSchema as Record<string, unknown> | undefined,
        });
      }
      return tools;
    } catch (err) {
      console.warn(`McpManager: HTTP probe failed for ${server.name}:`, err);
      return [];
    }
  }

  /**
   * Try multiple strategies to find an auth token for an HTTP MCP server:
   * the keychain-backed auth manager first, then common env-var patterns, then
   * local .env files. (MCP v1 also read ~/.claude.json headers; that path is
   * gone now that tokens live in the auth manager.)
   */
  private async findServerToken(server: McpServer): Promise<string | undefined> {
    // 0. Check stored tokens (OAuth flow, static bearer, or prior extraction)
    if (this.authManager) {
      const stored = this.authManager.getToken(server.name);
      if (stored) return stored;
    }

    // 1. Try env vars with common patterns
    const normalized = server.name
      .replace(/^claude\.ai\s+/i, "")
      .replace(/\s+/g, "_")
      .toUpperCase();

    const envPatterns = [
      `${normalized}_API_KEY`,
      `${normalized}_API_KEY_MILO`,
      `${normalized}_TOKEN`,
    ];

    for (const envVar of envPatterns) {
      const val = process.env[envVar];
      if (val) return val;
    }

    // 2. Try loading from .env files
    const envPaths = [
      path.join(homeDir(), ".openclaw", "workspace", ".env"),
      path.join(homeDir(), ".env"),
    ];

    for (const envPath of envPaths) {
      try {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of splitLines(content)) {
          const match = line.trim().match(/^(?:export\s+)?([A-Za-z_]\w*)=(.*)$/);
          if (match) {
            const key = match[1]!;
            const value = match[2]!.replace(/^["']|["']$/g, "");
            if (envPatterns.includes(key)) return value;
          }
        }
      } catch { /* skip */ }
    }

    return undefined;
  }

  // ═══════════════════════════════════════════════════════
  //  HTTP Request Helper
  // ═══════════════════════════════════════════════════════

  private httpRequest(
    url: string,
    token: string,
    body: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown> | null> {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
        "Content-Length": String(Buffer.byteLength(bodyStr)),
      };
      if (sessionId) headers["mcp-session-id"] = sessionId;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers,
      };

      const transport = isHttps ? https : http;
      const req = transport.request(options, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          const respSessionId = res.headers["mcp-session-id"];
          const contentType = res.headers["content-type"] ?? "";

          if (contentType.includes("text/event-stream")) {
            for (const line of splitLines(data)) {
              if (line.startsWith("data: ")) {
                try {
                  const parsed = JSON.parse(line.slice(6)) as Record<string, unknown>;
                  if (respSessionId) parsed._sessionId = respSessionId;
                  resolve(parsed);
                  return;
                } catch { /* skip */ }
              }
            }
            resolve(null);
          } else {
            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              if (respSessionId) parsed._sessionId = respSessionId;
              resolve(parsed);
            } catch { resolve(null); }
          }
        });
      });

      req.on("error", reject);
      const timer = window.setTimeout(() => { req.destroy(); resolve(null); }, 15000);
      req.on("close", () => window.clearTimeout(timer));
      req.write(bodyStr);
      req.end();
    });
  }
}
