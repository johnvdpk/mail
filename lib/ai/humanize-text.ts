/**
 * Strip AI-typical punctuation (semicolons, dash-as-pause) from mail copy.
 * Preserves URLs, e-mail addresses, hyphenated words, and natural paragraph grouping.
 */

const URL_TOKEN = "\uE000";
const EMAIL_TOKEN = "\uE001";
const MAX_SENTENCES_PER_PARAGRAPH = 4;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function protectTokens(text: string): { out: string; urls: string[]; emails: string[] } {
  const urls: string[] = [];
  const emails: string[] = [];

  let out = text.replace(/https?:\/\/[^\s<>"']+/gi, (match) => {
    urls.push(match);
    return `${URL_TOKEN}${urls.length - 1}${URL_TOKEN}`;
  });

  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => {
    emails.push(match);
    return `${EMAIL_TOKEN}${emails.length - 1}${EMAIL_TOKEN}`;
  });

  return { out, urls, emails };
}

function restoreTokens(text: string, urls: string[], emails: string[]): string {
  let out = text.replace(new RegExp(`${URL_TOKEN}(\\d+)${URL_TOKEN}`, "g"), (_, i) => urls[Number(i)] ?? "");
  out = out.replace(new RegExp(`${EMAIL_TOKEN}(\\d+)${EMAIL_TOKEN}`, "g"), (_, i) => emails[Number(i)] ?? "");
  return out;
}

function stripAiPunctuation(text: string): string {
  let out = text.replace(/;\s*/g, ". ");
  out = out.replace(/[ \t]*[—–][ \t]*/g, ", ");
  out = out.replace(/(?<!\d)[ \t]+-[ \t]+(?!\d)/g, ", ");
  return collapsePunctuation(out);
}

function collapsePunctuation(text: string): string {
  return text
    .split(/\n\n+/)
    .map((paragraph) =>
      paragraph
        .replace(/,\s*,+/g, ", ")
        .replace(/\.\s*\.+/g, ".")
        .replace(/,\s*\./g, ".")
        .replace(/\.\s*,/g, ".")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("\n\n");
}

function applySignOff(text: string, signOffName: string): string {
  const escapedName = escapeRegExp(signOffName);
  let out = text.replace(
    new RegExp(`\\s*(Groeten,\\s*\\n?\\s*${escapedName})\\s*$`, "i"),
    `\n\nGroeten,\n${signOffName}`
  );
  out = out.replace(
    new RegExp(
      `\\s*((?:Best regards|Kind regards|Cheers|Regards),?\\s*\\n?\\s*${escapedName})\\s*$`,
      "i"
    ),
    (_m, closing: string) => {
      const label = closing
        .replace(new RegExp(`,?\\s*\\n?\\s*${escapedName}\\s*$`, "i"), "")
        .trim()
        .replace(/,$/, "");
      return `\n\n${label},\n${signOffName}`;
    }
  );
  return out.replace(/\n{3,}/g, "\n\n");
}

export function humanizeMailText(text: string, signOffName: string): string {
  if (!text.trim()) return text;

  const { out: protectedText, urls, emails } = protectTokens(text);
  const cleaned = applySignOff(stripAiPunctuation(protectedText), signOffName);
  return restoreTokens(cleaned, urls, emails).trim();
}

function isSectionStart(text: string): boolean {
  return /^(Geen interesse|Wel interesse|Succes met|Wie weet|Groeten,|P\.?\s*S\.?)/i.test(
    text.trim()
  );
}

function isGreeting(text: string): boolean {
  return /^(Beste|Hey|Hoi)\b/i.test(text.trim());
}

function sentenceCount(text: string): number {
  const matches = text.match(/[^.!?…]+[.!?…]+/g);
  return matches?.length ?? 1;
}

function fixGreeting(text: string): string {
  return text
    .replace(/^(Hey|Hoi|Beste)([^,\n]*,)\s*\n(?!\n)/i, "$1$2\n\n")
    .replace(/^(Hey|Hoi|Beste)([^,\n]*,)\s+(?=\S)/i, "$1$2\n\n")
    .replace(/^(Hey|Hoi|Beste),\s*\n(?!\n)/i, "$1,\n\n")
    .replace(/^(Hey|Hoi|Beste),\s+(?=\S)/i, "$1,\n\n");
}

function insertSectionBreaks(text: string): string {
  return text
    .replace(/(?<=[.!?])\s+(?=Geen interesse\?)/gi, "\n\n")
    .replace(/(?<=[.!?])\s+(?=Wel interesse)/gi, "\n\n")
    .replace(/(?<=[.!?])\s+(?=Succes met)/gi, "\n\n")
    .replace(/(?<=[.!?])\s+(?=Wie weet spreken)/gi, "\n\n");
}

function shouldMergeParagraphs(parts: string[]): boolean {
  const bodyParts = parts.filter((p) => !isGreeting(p) && !isSectionStart(p));
  const singleSentenceParas = bodyParts.filter((p) => sentenceCount(p) === 1).length;
  return singleSentenceParas >= 2 && bodyParts.length >= 4;
}

function mergeRunOnParagraphs(text: string): string {
  const parts = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const merged: string[] = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];
    if (isGreeting(part) || isSectionStart(part)) {
      merged.push(part);
      i++;
      continue;
    }

    let block = part;
    i++;
    while (i < parts.length && !isSectionStart(parts[i]) && !isGreeting(parts[i])) {
      if (sentenceCount(block) >= MAX_SENTENCES_PER_PARAGRAPH) break;
      const next = parts[i];
      if (sentenceCount(next) >= 2 && sentenceCount(block) >= 2) break;
      block = `${block} ${next}`;
      i++;
    }
    merged.push(block);
  }

  return merged.join("\n\n");
}

function normalizeEmailParagraphs(text: string, signOffName: string): string {
  const escapedName = escapeRegExp(signOffName);
  let out = fixGreeting(text.trim());
  out = out.replace(
    new RegExp(
      `\\s*(Groeten,\\s*\\n?\\s*${escapedName})\\s*(?:\\n\\s*(P\\.?\\s*S\\.?\\s*[\\s\\S]*))?$`,
      "i"
    ),
    (_m, _sign: string, ps?: string) =>
      ps ? `\n\nGroeten,\n${signOffName}\n\n${ps.trim()}` : `\n\nGroeten,\n${signOffName}`
  );
  out = out.replace(/\n{3,}/g, "\n\n");

  const parts = out.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) {
    out = insertSectionBreaks(out);
  } else if (shouldMergeParagraphs(parts)) {
    out = mergeRunOnParagraphs(out);
  }

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function humanizeOutreachText(text: string, signOffName = "John"): string {
  if (!text.trim()) return text;
  const { out: protectedText, urls, emails } = protectTokens(text);
  const cleaned = normalizeEmailParagraphs(stripAiPunctuation(protectedText), signOffName);
  return restoreTokens(cleaned, urls, emails).trim();
}

export function humanizeOutreachEmail(
  subject: string,
  body: string,
  signOffName = "John"
): { subject: string; body: string } {
  return {
    subject: humanizeOutreachText(subject.replace(/\n+/g, " "), signOffName),
    body: humanizeOutreachText(body, signOffName),
  };
}
