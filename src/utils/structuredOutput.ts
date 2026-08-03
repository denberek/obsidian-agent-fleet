import type { JsonValue } from "../types";

/** True when a provider value can be represented losslessly in JSON/YAML. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

/** Parse provider-emitted JSON text. Undefined means it was not valid JSON. */
export function parseStructuredJsonText(text: string | undefined): JsonValue | undefined {
  if (text === undefined || !text.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return isJsonValue(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validate and canonicalize a task's JSON Schema before a CLI is spawned.
 * Agent Fleet deliberately supports object schemas only: both provider CLIs
 * document that shape and it avoids ambiguous YAML/string coercion.
 */
export function normalizeOutputSchema(schema: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(schema);
  } catch (err) {
    throw new Error(`Output schema is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Output schema must be a JSON object.");
  }
  if (!isJsonValue(parsed)) {
    throw new Error("Output schema contains a value JSON cannot represent.");
  }
  return JSON.stringify(parsed);
}

/** Stable, readable text fallback for providers that return only JSON data. */
export function formatStructuredOutput(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}
