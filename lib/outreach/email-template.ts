import type { CampaignProfile } from "./campaign-profile";

export type OutreachEmail = {
  subject: string;
  text: string;
  html: string;
  bodyText: string;
};

type EmailOptions = {
  subject?: string;
  bodyText?: string;
};

function escapeHtml(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function footerFirstLine(footerText: string): string {
  return footerText.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

export function stripSignatureFromText(text: string, footerText = ""): string {
  let out = text.trim();
  const marker = footerFirstLine(footerText);
  if (marker) {
    const idx = out.indexOf(`\n${marker}`);
    if (idx >= 0) out = out.slice(0, idx).trim();
  }
  const sigIdx = out.indexOf("\n--\n");
  if (sigIdx >= 0) out = out.slice(0, sigIdx).trim();
  return out;
}

function bodyToHtml(bodyText: string, websiteUrl?: string, footerHtml = ""): string {
  const paragraphs = bodyText.split(/\n\n+/).filter(Boolean);
  const bodyHtml = paragraphs
    .map((p) => {
      let html = p
        .split("\n")
        .map((l) => escapeHtmlText(l))
        .join("<br>\n");

      if (websiteUrl && /jullie website/i.test(p)) {
        const link = `<a href="${escapeHtml(websiteUrl)}" style="color:#0066cc;">jullie website</a>`;
        html = html.replace(/jullie website/i, link);
      }

      return `<p>${html}</p>`;
    })
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="nl">
<body style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; font-size: 15px;">
${bodyHtml}
${footerHtml}
</body>
</html>`;
}

export function buildOutreachEmail(
  leadName: string,
  websiteUrl: string | undefined,
  profile: CampaignProfile,
  options?: EmailOptions
): OutreachEmail {
  const body = stripSignatureFromText(
    options?.bodyText ?? "",
    profile.footer.text
  );
  const subject = options?.subject ?? profile.subjectLines.defaultFormat.replace("{naam}", leadName);
  const footerText = profile.footer.text.trim();
  const text = footerText ? `${body.trim()}\n\n${footerText}` : body.trim();
  const html = bodyToHtml(body, websiteUrl, profile.footer.html);

  return { subject, text, html, bodyText: body };
}
