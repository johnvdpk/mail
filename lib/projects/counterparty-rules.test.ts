import { describe, expect, it } from "vitest";
import { matchRule, parseRuleTarget } from "./counterparty-rules";
import type { CounterpartyRule } from "./types";

function rule(partial: Partial<CounterpartyRule> & Pick<CounterpartyRule, "pattern">): CounterpartyRule {
  return {
    id: 1,
    category: null,
    projectId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("matchRule", () => {
  it("matches case-insensitively as a substring", () => {
    const rules = [rule({ pattern: "Reuring Groep BV", projectId: 5 })];
    expect(matchRule("SEPA OVERBOEKING reuring groep bv factuur 123", rules)?.id).toBe(1);
  });

  it("returns null when nothing matches", () => {
    expect(matchRule("Onbekende tegenpartij", [rule({ pattern: "Reuring" })])).toBeNull();
  });

  it("prefers the longest matching pattern", () => {
    const rules = [
      rule({ id: 1, pattern: "Reuring", category: "overig" }),
      rule({ id: 2, pattern: "Reuring Groep BV", category: "marketing" }),
    ];
    expect(matchRule("Reuring Groep BV", rules)?.id).toBe(2);
  });
});

describe("parseRuleTarget", () => {
  it("accepts a valid category", () => {
    expect(parseRuleTarget({ category: "reiskosten" })).toEqual({ kind: "category", category: "reiskosten" });
  });

  it("accepts a valid projectId", () => {
    expect(parseRuleTarget({ projectId: 7 })).toEqual({ kind: "project", projectId: 7 });
  });

  it("rejects both category and projectId", () => {
    expect(parseRuleTarget({ category: "reiskosten", projectId: 7 })).toBe(
      "geef precies één van category of projectId op"
    );
  });

  it("rejects neither category nor projectId", () => {
    expect(parseRuleTarget({})).toBe("geef precies één van category of projectId op");
  });

  it("accepts any free-text category name", () => {
    expect(parseRuleTarget({ category: "Eigen categorie" })).toEqual({
      kind: "category",
      category: "Eigen categorie",
    });
  });

  it("rejects a blank category", () => {
    expect(parseRuleTarget({ category: "   " })).toBe("geef precies één van category of projectId op");
  });
});
