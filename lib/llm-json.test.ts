import { describe, expect, it } from "vitest";
import { parseJsonObject, stripMarkdown } from "./llm-json";

describe("llm-json", () => {
  it("strips markdown fences", () => {
    expect(stripMarkdown("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });

  it("parses clean JSON objects", () => {
    expect(parseJsonObject('{"keywords":["klant","offerte"]}')).toEqual({
      keywords: ["klant", "offerte"],
    });
  });

  it("extracts JSON from surrounding text", () => {
    expect(parseJsonObject('Here you go: {"matches":[]} end')).toEqual({ matches: [] });
  });

  it("returns null for invalid payloads", () => {
    expect(parseJsonObject("not json")).toBeNull();
  });
});
