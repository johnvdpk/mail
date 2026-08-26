type AiResponse = {
  subject: string;
  body: string;
  findings: string;
};

function stripMarkdown(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```$/m, "")
    .trim();
}

export function extractJsonObject(text: string): string | null {
  const cleaned = stripMarkdown(text);
  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }

  return null;
}

function repairJsonNewlines(json: string): string {
  return json.replace(
    /("(?:subject|body|findings)"\s*:\s*")([\s\S]*?)("(?=\s*[,}]))/g,
    (_match, prefix: string, value: string, suffix: string) => {
      const fixed = value
        .replace(/\r\n/g, "\\n")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\n")
        .replace(/\t/g, "\\t");
      return `${prefix}${fixed}${suffix}`;
    }
  );
}

export function decodeJsonString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .trim();
}

function formatFindings(findings: string | string[] | undefined): string {
  if (!findings) return "";
  if (Array.isArray(findings)) return findings.map(String).join(" · ");
  return String(findings).trim();
}

function matchJsonStringField(text: string, key: string): string | null {
  const re = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,|})`, "i");
  return text.match(re)?.[1] ?? null;
}

function tryParseCandidate(candidate: string): AiResponse | null {
  for (const attempt of [candidate, repairJsonNewlines(candidate)]) {
    try {
      const data = JSON.parse(attempt) as Partial<AiResponse> & { findings?: string | string[] };
      if (data.subject && data.body) {
        return {
          subject: decodeJsonString(String(data.subject)),
          body: decodeJsonString(String(data.body)),
          findings: formatFindings(data.findings),
        };
      }
    } catch {
      // try next repair strategy
    }
  }
  return null;
}

function parseLooseFields(raw: string): AiResponse | null {
  const cleaned = stripMarkdown(raw);
  const subject =
    matchJsonStringField(cleaned, "subject") ?? cleaned.match(/"subject"\s*:\s*"([^"]+)"/i)?.[1];
  const body =
    matchJsonStringField(cleaned, "body") ??
    cleaned.match(/"body"\s*:\s*"([\s\S]*?)"\s*,\s*"findings"/i)?.[1];
  const findings =
    matchJsonStringField(cleaned, "findings") ?? cleaned.match(/"findings"\s*:\s*"([\s\S]*?)"\s*}/i)?.[1];

  if (!subject || !body) return null;
  return {
    subject: decodeJsonString(subject),
    body: decodeJsonString(body),
    findings: findings ? decodeJsonString(findings) : "",
  };
}

export function parseAiJson(raw: string): AiResponse {
  const candidates = [extractJsonObject(raw), stripMarkdown(raw)].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const parsed = tryParseCandidate(candidate);
    if (parsed) return parsed;
  }
  const loose = parseLooseFields(raw);
  if (loose) return loose;
  throw new Error("AI gaf geen geldig JSON terug");
}

export function extractReplyBody(raw: string): string {
  const candidates = [extractJsonObject(raw), stripMarkdown(raw)].filter(Boolean) as string[];
  for (const candidate of candidates) {
    for (const attempt of [candidate, repairJsonNewlines(candidate)]) {
      try {
        const data = JSON.parse(attempt) as { body?: string };
        if (data.body?.trim()) return decodeJsonString(String(data.body));
      } catch {
        // try next
      }
    }
  }
  const loose =
    matchJsonStringField(stripMarkdown(raw), "body") ??
    stripMarkdown(raw).match(/"body"\s*:\s*"([\s\S]*)"\s*}/i)?.[1];
  if (loose) return decodeJsonString(loose);
  throw new Error("AI gaf geen geldige reply-body terug");
}
