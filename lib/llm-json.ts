/** Strip optional markdown JSON code fences from an LLM response. */
export function stripMarkdown(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

/** Parse a JSON object from an LLM response, with brace-boundary fallback. */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = stripMarkdown(raw);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
