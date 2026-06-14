import { describe, expect, it } from "vitest";
import { extractConcreteModel, extractRememberEntries } from "./executionManager";

describe("execution helpers", () => {
  it("extracts remember directives", () => {
    const entries = extractRememberEntries(`
Before
[REMEMBER]The deployment pipeline lives in GitHub Actions[/REMEMBER]
Middle
[REMEMBER]Staging URL is staging.example.com[/REMEMBER]
`);

    expect(entries).toEqual([
      "The deployment pipeline lives in GitHub Actions",
      "Staging URL is staging.example.com",
    ]);
  });

  describe("extractConcreteModel", () => {
    it("pulls from result.modelUsage keys", () => {
      const result = {
        type: "result",
        total_cost_usd: 0.01,
        modelUsage: {
          "claude-opus-4-7": { inputTokens: 10, outputTokens: 5, contextWindow: 200000 },
        },
      };
      expect(extractConcreteModel(result)).toBe("claude-opus-4-7");
    });

    it("pulls from assistant message.model", () => {
      const assistant = {
        type: "assistant",
        message: { model: "claude-sonnet-4-6", content: [] },
      };
      expect(extractConcreteModel(assistant)).toBe("claude-sonnet-4-6");
    });

    it("pulls from system init top-level model", () => {
      const init = { type: "system", subtype: "init", model: "claude-haiku-4-5" };
      expect(extractConcreteModel(init)).toBe("claude-haiku-4-5");
    });

    it("returns undefined when nothing carries a model", () => {
      expect(extractConcreteModel({ type: "rate_limit_event" })).toBeUndefined();
      expect(extractConcreteModel(null)).toBeUndefined();
      expect(extractConcreteModel("text")).toBeUndefined();
    });

    it("recurses into nested objects", () => {
      const nested = { outer: { inner: { message: { model: "claude-opus-4-7" } } } };
      expect(extractConcreteModel(nested)).toBe("claude-opus-4-7");
    });
  });
});
