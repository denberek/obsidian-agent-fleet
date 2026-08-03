import { describe, expect, it } from "vitest";
import {
  formatStructuredOutput,
  isJsonValue,
  normalizeOutputSchema,
  parseStructuredJsonText,
} from "./structuredOutput";

describe("structured output helpers", () => {
  it("normalizes a valid object schema", () => {
    expect(normalizeOutputSchema(' { "type": "object", "required": ["name"] } ')).toBe(
      '{"type":"object","required":["name"]}',
    );
  });

  it("rejects malformed and non-object schemas", () => {
    expect(() => normalizeOutputSchema("{bad")).toThrow("not valid JSON");
    expect(() => normalizeOutputSchema('[{"type":"object"}]')).toThrow("must be a JSON object");
    expect(() => normalizeOutputSchema("null")).toThrow("must be a JSON object");
  });

  it("parses every JSON value, including null and primitives", () => {
    expect(parseStructuredJsonText('{"ok":true}')).toEqual({ ok: true });
    expect(parseStructuredJsonText("null")).toBeNull();
    expect(parseStructuredJsonText('"value"')).toBe("value");
    expect(parseStructuredJsonText("not json")).toBeUndefined();
  });

  it("rejects non-finite provider values and formats valid values", () => {
    expect(isJsonValue({ value: Number.POSITIVE_INFINITY })).toBe(false);
    expect(formatStructuredOutput({ ok: true })).toBe('{\n  "ok": true\n}');
  });
});
