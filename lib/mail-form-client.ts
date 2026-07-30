/** Build multipart/form-data for outgoing mail API routes. */
export function buildMailForm(
  fields: Record<string, string | undefined>,
  files: File[]
): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "") form.set(key, value);
  }
  for (const file of files) {
    form.append("attachments", file);
  }
  return form;
}
