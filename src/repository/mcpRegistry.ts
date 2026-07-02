import { TFile } from "obsidian";
import type { App, Vault } from "obsidian";
import { parseMarkdownWithFrontmatter, stringifyMarkdownWithFrontmatter, slugify } from "../utils/markdown";
import type { McpServer } from "../types";
import { asBoolean, asString, asStringArray, asStringMap, ensureFolder, getAvailablePath, isRecord, trashPath } from "./shared";

/**
 * MCP server registry: parse + persist `_fleet/mcp/<name>.md` files.
 * Extracted verbatim from FleetRepository. The facade still owns the
 * in-memory server map (load flow + snapshot); parse errors are reported
 * through the injected `reportIssue` so they land in the same
 * validation-issue map as every other parser.
 */
export class McpRegistry {
  private readonly vault: Vault;

  constructor(
    private readonly app: App,
    private readonly deps: {
      getMcpDir: () => string;
      getServerByName: (name: string) => McpServer | undefined;
      reportIssue: (path: string, message: string) => void;
    },
  ) {
    this.vault = app.vault;
  }

  /**
   * Parse one `_fleet/mcp/<name>.md` registry file. The frontmatter holds the
   * non-secret server definition; the body is a human description. Secrets
   * (bearer/OAuth tokens, secret env values) are NEVER read here — they live in
   * SecretStore and are resolved at projection time.
   */
  parseMcpServerFile(path: string, content: string): McpServer | null {
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);

    const name = asString(frontmatter.name);
    if (!name) {
      this.deps.reportIssue(path, "MCP server requires string field `name`.");
      return null;
    }

    // `transport` is the canonical frontmatter key; `type` is accepted as an
    // alias (matches the native config vocabulary).
    const rawTransport = (asString(frontmatter.transport) ?? asString(frontmatter.type) ?? "").toLowerCase();
    const validTransports: readonly string[] = ["stdio", "http", "sse"];
    if (!validTransports.includes(rawTransport)) {
      this.deps.reportIssue(
        path,
        `MCP server \`${name}\` requires \`transport\` to be one of: ${validTransports.join(", ")}.`,
      );
      return null;
    }
    const type = rawTransport as McpServer["type"];

    if (type === "stdio") {
      if (!asString(frontmatter.command)) {
        this.deps.reportIssue(path, `MCP server \`${name}\` (stdio) requires a \`command\`.`);
        return null;
      }
    } else if (!asString(frontmatter.url)) {
      this.deps.reportIssue(path, `MCP server \`${name}\` (${type}) requires a \`url\`.`);
      return null;
    }

    const rawAuth = (asString(frontmatter.auth) ?? "").toLowerCase();
    const auth: McpServer["auth"] =
      rawAuth === "bearer" || rawAuth === "oauth" || rawAuth === "none" ? rawAuth : undefined;

    let oauth: McpServer["oauth"];
    if (isRecord(frontmatter.oauth)) {
      const o = frontmatter.oauth;
      oauth = {
        clientId: asString(o.client_id) ?? asString(o.clientId),
        resource: asString(o.resource),
        scopes: asStringArray(o.scopes),
      };
    }

    return {
      name,
      filePath: path,
      type,
      enabled: asBoolean(frontmatter.enabled, true),
      description: asString(frontmatter.description) ?? (body.trim() || undefined),
      source: asString(frontmatter.source) === "imported" ? "imported" : "manual",
      command: asString(frontmatter.command),
      args: asStringArray(frontmatter.args),
      env: asStringMap(frontmatter.env),
      envSecretKeys: asStringArray(frontmatter.env_secret_keys),
      url: asString(frontmatter.url),
      headers: asStringMap(frontmatter.headers),
      auth,
      oauth,
      // Runtime-only fields — filled in by an on-demand probe, not persisted.
      status: "disconnected",
      scope: "user",
      tools: [],
      toolDetails: [],
    };
  }

  /** Build `_fleet/mcp/<name>.md` frontmatter from a server definition,
   *  omitting empty/runtime fields. Secrets are never written here. */
  private mcpServerFrontmatter(server: McpServer): Record<string, unknown> {
    const fm: Record<string, unknown> = {
      name: server.name,
      transport: server.type,
      enabled: server.enabled,
    };
    if (server.source) fm.source = server.source;
    if (server.type === "stdio") {
      if (server.command) fm.command = server.command;
      if (server.args && server.args.length > 0) fm.args = server.args;
      if (server.env && Object.keys(server.env).length > 0) fm.env = server.env;
      if (server.envSecretKeys && server.envSecretKeys.length > 0) fm.env_secret_keys = server.envSecretKeys;
    } else {
      if (server.url) fm.url = server.url;
      if (server.headers && Object.keys(server.headers).length > 0) fm.headers = server.headers;
      if (server.auth) fm.auth = server.auth;
      if (server.oauth && (server.oauth.clientId || server.oauth.resource || (server.oauth.scopes?.length ?? 0) > 0)) {
        fm.oauth = {
          client_id: server.oauth.clientId || undefined,
          resource: server.oauth.resource || undefined,
          scopes: server.oauth.scopes && server.oauth.scopes.length > 0 ? server.oauth.scopes : undefined,
        };
      }
    }
    return fm;
  }

  /**
   * Create or update an MCP server registry file. When `server.filePath` is set
   * the existing file is rewritten in place; otherwise a new
   * `_fleet/mcp/<slug>.md` is created. Returns the file path. Secrets are NOT
   * handled here — callers store tokens/secret env values in SecretStore.
   */
  async saveMcpServer(server: McpServer, body = ""): Promise<string> {
    const fm = this.mcpServerFrontmatter(server);
    const content = stringifyMarkdownWithFrontmatter(fm, body.trim());
    const existing = server.filePath ? this.vault.getAbstractFileByPath(server.filePath) : null;
    if (existing instanceof TFile) {
      await this.vault.modify(existing, content);
      return existing.path;
    }
    const path = await getAvailablePath(this.vault, this.deps.getMcpDir(), slugify(server.name));
    await ensureFolder(this.vault, this.deps.getMcpDir());
    await this.vault.create(path, content);
    return path;
  }

  /** Flip an MCP server's `enabled` flag in its registry file. */
  async setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
    const server = this.deps.getServerByName(name);
    if (!server?.filePath) return;
    const file = this.vault.getAbstractFileByPath(server.filePath);
    if (!(file instanceof TFile)) return;
    const content = await this.vault.cachedRead(file);
    const { frontmatter, body } = parseMarkdownWithFrontmatter<Record<string, unknown>>(content);
    frontmatter.enabled = enabled;
    await this.vault.modify(file, stringifyMarkdownWithFrontmatter(frontmatter, body));
  }

  /** Trash an MCP server's registry file. */
  async deleteMcpServer(name: string): Promise<void> {
    const server = this.deps.getServerByName(name);
    if (!server?.filePath) return;
    await trashPath(this.app, server.filePath);
  }
}
