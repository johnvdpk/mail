import { describe, expect, it } from "vitest";
import {
  asSearchJobStatus,
  fallbackKeywordsFromPrompt,
  parseAssessedMatchRow,
  parseKeywords,
} from "./mail-search";

describe("mail-search helpers", () => {
  it("parses keyword arrays from LLM JSON", () => {
    expect(parseKeywords([" klant ", "", "offerte", 42, "x"])).toEqual([
      "klant",
      "offerte",
      "x",
    ]);
    expect(parseKeywords("nope")).toEqual([]);
  });

  it("limits keywords to eight entries", () => {
    const many = Array.from({ length: 12 }, (_, i) => `k${i}`);
    expect(parseKeywords(many)).toHaveLength(8);
  });

  it("falls back to prompt words longer than three characters", () => {
    expect(fallbackKeywordsFromPrompt("Zoek potentiële klanten voor SaaS")).toEqual([
      "Zoek",
      "potentiële",
      "klanten",
      "voor",
      "SaaS",
    ]);
  });

  it("maps unknown job statuses to failed", () => {
    expect(asSearchJobStatus("keyword_done")).toBe("keyword_done");
    expect(asSearchJobStatus("unknown")).toBe("failed");
  });

  it("parses assessed matches by batch index only", () => {
    const batch = [
      { id: "msg-1", from_name: "Jan", from_email: "jan@acme.nl" },
      { id: "msg-2", from_name: "Piet", from_email: "piet@beta.nl" },
    ];

    expect(
      parseAssessedMatchRow(
        {
          index: 1,
          isMatch: true,
          relevance: 0.9,
          contactName: "Piet Beta",
          contactEmail: "piet@beta.nl",
          contactCompany: "Beta BV",
          reasoning: "Past bij de zoekopdracht",
        },
        batch
      )
    ).toEqual({
      messageId: "msg-2",
      isMatch: true,
      relevance: 0.9,
      contactName: "Piet Beta",
      contactEmail: "piet@beta.nl",
      contactCompany: "Beta BV",
      reasoning: "Past bij de zoekopdracht",
    });

    expect(parseAssessedMatchRow({ index: 5, isMatch: true }, batch)).toBeNull();
    expect(parseAssessedMatchRow({ index: 0, isMatch: false }, batch)).toBeNull();
  });
});
