export type MailContent = {
  subject: string;
  text: string;
  html: string;
};

export const SIGNATURE_TEXT = `--
John van der Pouw Kraan
+31 6 38306764
john@aiadapt.nl
https://www.aiadapt.nl | https://www.johnpk.nl`;

const SIGNATURE_HTML = `
<table cellpadding="0" cellspacing="0" border="0" width="500" style="margin-top:24px;font-family:Arial,sans-serif;color:#444;line-height:1.4;max-width:500px;">
  <tr>
    <td width="90" valign="top" style="width:90px;min-width:90px;max-width:90px;padding:0 18px 0 0;">
      <img src="https://www.aiadapt.nl/presentator/john.png"
           alt="John van der Pouw Kraan"
           width="90"
           height="90"
           style="display:block;width:90px!important;height:90px!important;max-width:90px;max-height:90px;border-radius:50%;border:0;" />
    </td>
    <td valign="top" style="border-left:2px solid #e0e0e0;padding-left:18px;">
      <p style="margin:0 0 4px 0;font-weight:bold;font-size:16px;color:#111;letter-spacing:-0.3px;">John van der Pouw Kraan</p>
      <p style="margin:0 0 3px 0;font-size:14px;color:#555;">
        <a href="tel:+31638306764" style="text-decoration:none;color:#555;">📞 +31 6 38306764</a>
      </p>
      <p style="margin:0 0 6px 0;font-size:14px;color:#555;">
        <a href="mailto:john@aiadapt.nl" style="text-decoration:none;color:#555;">📧 john@aiadapt.nl</a>
      </p>
      <p style="margin:4px 0 0 0;font-size:13px;">
        <a href="https://www.aiadapt.nl" style="text-decoration:none;color:#0066cc;font-weight:600;">aiadapt.nl</a>
        <span style="color:#ccc;margin:0 6px;">|</span>
        <a href="https://www.johnpk.nl" style="text-decoration:none;color:#0066cc;font-weight:600;">johnpk.nl</a>
      </p>
    </td>
  </tr>
</table>`;

/** Plain body without signature — for editing in the UI. */
export function stripSignatureFromText(text: string): string {
  let out = text.trim();
  const sigIdx = out.indexOf("\n--\n");
  if (sigIdx >= 0) out = out.slice(0, sigIdx).trim();
  return out;
}

/** Append personal signature. */
export function ensureSignature(text: string): string {
  const body = stripSignatureFromText(text);
  return `${body}\n\n${SIGNATURE_TEXT}`;
}

/** HTML body + personal signature. */
export function buildMailHtml(bodyText: string): string {
  const body = stripSignatureFromText(bodyText);
  const paragraphs = body.split(/\n\n+/).filter(Boolean);
  const bodyHtml = paragraphs
    .map((p) => {
      const lines = p.split("\n").map((l) => escapeHtmlText(l));
      return `<p>${lines.join("<br>\n")}</p>`;
    })
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="nl">
<body style="font-family: Arial, sans-serif; color: #222; line-height: 1.6; font-size: 15px;">
${bodyHtml}

${SIGNATURE_HTML}
</body>
</html>`;
}

/** @deprecated Use buildMailHtml */
export const buildReplyHtml = buildMailHtml;

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
