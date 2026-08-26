export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalize RFC Message-ID for comparison (with or without angle brackets). */
export function normalizeMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, "").toLowerCase();
}

/** Strip Re:/Fwd: prefixes so replies group with their original. */
export function normalizeSubject(subject: string): string {
  let out = subject.trim();
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out.replace(/^\s*(re|fw|fwd|aw|wg|antw)\s*(\[\d+\])?\s*:\s*/i, "");
  }
  return out.trim().toLowerCase();
}

/** Add a Re: prefix unless one is already present. */
export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  return /^re\s*:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

/** Add a Fwd: prefix unless one is already present. */
export function forwardSubject(subject: string): string {
  const trimmed = subject.trim();
  return /^(fwd?|wg)\s*:/i.test(trimmed) ? trimmed : `Fwd: ${trimmed}`;
}

/** Collect message-ids out of In-Reply-To / References header values. */
export function parseMessageIdList(value?: string | string[] | null): string[] {
  if (!value) return [];
  const chunks = Array.isArray(value) ? value : value.split(/\s+/);
  const ids: string[] = [];
  for (const chunk of chunks) {
    const matches = chunk.match(/<[^>]+>/g) ?? [chunk];
    for (const match of matches) {
      const id = normalizeMessageId(match);
      if (id) ids.push(id);
    }
  }
  return ids;
}
