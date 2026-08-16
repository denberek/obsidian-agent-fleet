import { describe, expect, it } from "vitest";
import { filterPiCatalog, parsePiModelList } from "./piModels";

const SAMPLE = [
  "provider        model                                             context  max-out  thinking  images",
  "amazon-bedrock  anthropic.claude-haiku-4-5-20251001-v1:0          200K     64K      yes       yes   ",
  "anthropic       claude-opus-5                                     1M       128K     yes       yes   ",
  "anthropic       claude-haiku-4-5                                  200K     64K      yes       yes   ",
  "openai          gpt-5.5                                           400K     128K     yes       yes   ",
  "openai-codex    gpt-5.6-terra                                     400K     128K     yes       no    ",
  "",
].join("\n");

describe("parsePiModelList", () => {
  it("parses the table, skipping the header", () => {
    const entries = parsePiModelList(SAMPLE);
    expect(entries).toHaveLength(5);
    expect(entries[1]).toEqual({
      provider: "anthropic",
      id: "claude-opus-5",
      value: "anthropic/claude-opus-5",
      context: "1M",
      thinking: true,
    });
  });

  it("tolerates junk lines", () => {
    expect(parsePiModelList("!!!\nnot a table row\n")).toEqual([]);
    expect(parsePiModelList("")).toEqual([]);
  });
});

describe("filterPiCatalog", () => {
  it("groups Anthropic and OpenAI families, dropping other providers", () => {
    const catalog = filterPiCatalog(parsePiModelList(SAMPLE));
    expect(catalog.anthropic.map((e) => e.id)).toEqual(["claude-opus-5", "claude-haiku-4-5"]);
    expect(catalog.openai.map((e) => e.value)).toEqual([
      "openai/gpt-5.5",
      "openai-codex/gpt-5.6-terra",
    ]);
    expect(catalog.unavailable).toBe(false);
  });

  it("marks an empty result unavailable", () => {
    const catalog = filterPiCatalog(
      parsePiModelList("amazon-bedrock  amazon.nova-pro-v1:0  300K  8.2K  no  yes"),
    );
    expect(catalog.unavailable).toBe(true);
  });
});
