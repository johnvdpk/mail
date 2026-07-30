/**
 * Extract a partial string value for a JSON object key from incomplete streamed JSON.
 * Handles escaped characters inside the string value.
 */
export function extractPartialJsonStringField(raw: string, field: string): string | null {
  const keyPattern = new RegExp(`"${field}"\\s*:\\s*"`, "i");
  const match = keyPattern.exec(raw);
  if (!match) return null;

  let i = match.index + match[0].length;
  let result = "";

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '"') break;

    if (ch === "\\") {
      i += 1;
      if (i >= raw.length) break;
      const esc = raw[i];
      if (esc === "n") result += "\n";
      else if (esc === "t") result += "\t";
      else if (esc === "r") result += "\r";
      else if (esc === '"') result += '"';
      else if (esc === "\\") result += "\\";
      else result += esc;
      i += 1;
      continue;
    }

    result += ch;
    i += 1;
  }

  return result;
}
