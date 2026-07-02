import { afterEach, describe, expect, it, vi } from "vitest";
import { parseJsonLoud, tryParseJson, warnJsonParseFailure } from "./parseHelpers";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tryParseJson", () => {
  it("parses valid JSON of any shape", () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    expect(tryParseJson("[1,2]")).toEqual([1, 2]);
    expect(tryParseJson('"str"')).toBe("str");
    expect(tryParseJson("3")).toBe(3);
  });

  it("returns undefined for non-JSON without logging", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(tryParseJson("Loading model… please wait")).toBeUndefined();
    expect(tryParseJson("")).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("parseJsonLoud", () => {
  it("parses valid JSON silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseJsonLoud("ctx", '{"ok":true}')).toEqual({ ok: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns with context, parse error, and a text preview on failure", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseJsonLoud("final result JSON", "{broken")).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("final result JSON");
    expect(message).toContain("{broken");
  });
});

describe("warnJsonParseFailure", () => {
  it("truncates the preview to ~200 chars", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const long = "x".repeat(500);
    warnJsonParseFailure("ctx", long);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("x".repeat(200));
    expect(message).not.toContain("x".repeat(201));
    expect(message).toContain("…");
  });

  it("includes the error message when an error is given", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnJsonParseFailure("ctx", "text", new Error("Unexpected token"));
    expect(String(warn.mock.calls[0]?.[0])).toContain("Unexpected token");
  });
});
