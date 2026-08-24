/**
 * Strip AI-typical punctuation (semicolons, dash-as-pause) from mail copy.
 * Preserves URLs, e-mail addresses, hyphenated words, and natural paragraph grouping.
 */

const URL_TOKEN = "\uE000";
const EMAIL_TOKEN = "\uE001";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function humanizeMailText(text: string, signOffName: string): string {
  if (!text.trim()) return text;

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

  out = out.replace(/;\s*/g, ". ");
  out = out.replace(/[ \t]*[—–][ \t]*/g, ", ");
  out = out.replace(/(?<!\d)[ \t]+-[ \t]+(?!\d)/g, ", ");

  out = out
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

  const escapedName = escapeRegExp(signOffName);
  out = out.replace(
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
  out = out.replace(/\n{3,}/g, "\n\n");

  out = out.replace(new RegExp(`${URL_TOKEN}(\\d+)${URL_TOKEN}`, "g"), (_, i) => urls[Number(i)] ?? "");
  out = out.replace(new RegExp(`${EMAIL_TOKEN}(\\d+)${EMAIL_TOKEN}`, "g"), (_, i) => emails[Number(i)] ?? "");

  return out.trim();
}
