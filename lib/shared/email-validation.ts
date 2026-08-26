/** Practical single-address check (no heavy dependency). */
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/** Split comma/semicolon-separated recipient fields. */
export function parseEmailList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return EMAIL_RE.test(trimmed);
}

/** Every address in a recipient list must be valid; empty string is allowed. */
export function isValidEmailList(value: string): boolean {
  const emails = parseEmailList(value);
  if (emails.length === 0) return false;
  return emails.every(isValidEmail);
}

/** Required recipient field; accepts one or more comma/semicolon-separated addresses. */
export function validateRequiredEmail(value: string): string | null {
  if (!isValidEmailList(value)) return "Geldig e-mailadres verplicht";
  return null;
}

export function validateOptionalEmailList(value?: string): string | null {
  if (!value?.trim()) return null;
  if (!isValidEmailList(value)) return "Ongeldig e-mailadres in CC/BCC";
  return null;
}

export type OutgoingRecipientFields = {
  to?: string;
  cc?: string;
  bcc?: string;
};

/** Validate to/cc/bcc for send, reply, and forward routes. */
export function validateOutgoingRecipients(
  fields: OutgoingRecipientFields,
  options?: { requireTo?: boolean }
): string | null {
  const requireTo = options?.requireTo ?? true;

  if (requireTo) {
    const toError = validateRequiredEmail(fields.to ?? "");
    if (toError) return toError;
  } else if (fields.to?.trim() && !isValidEmailList(fields.to)) {
    return "Geldig e-mailadres verplicht";
  }

  const ccError = validateOptionalEmailList(fields.cc);
  if (ccError) return ccError;

  const bccError = validateOptionalEmailList(fields.bcc);
  if (bccError) return bccError;

  return null;
}
