/** Max size per attachment (10 MB). */
export const MAX_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024;

/** Max combined size of all attachments (25 MB). */
export const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;

export type OutgoingAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export type AttachmentSizeInput = {
  filename: string;
  size: number;
};

function formatLimitMb(bytes: number): string {
  return `${bytes / (1024 * 1024)} MB`;
}

/** Throws a Dutch error message when limits are exceeded. */
export function validateAttachmentSizes(files: AttachmentSizeInput[]): void {
  if (!files.length) return;

  let total = 0;
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_FILE_BYTES) {
      throw new Error(
        `"${file.filename}" is te groot (max ${formatLimitMb(MAX_ATTACHMENT_FILE_BYTES)} per bestand)`
      );
    }
    total += file.size;
  }

  if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
    throw new Error(
      `Bijlagen te groot in totaal (max ${formatLimitMb(MAX_ATTACHMENT_TOTAL_BYTES)})`
    );
  }
}
