import {
  type OutgoingAttachment,
  validateAttachmentSizes,
} from "./outgoing-attachments";

export type ParsedMailForm = {
  to: string;
  subject: string;
  text: string;
  cc?: string;
  bcc?: string;
  threadId?: string;
  folder?: string;
  attachments: OutgoingAttachment[];
};

async function attachmentsFromForm(formData: FormData): Promise<OutgoingAttachment[]> {
  const entries = formData.getAll("attachments");
  const sizes = entries
    .filter((entry): entry is File => entry instanceof File && entry.size > 0)
    .map((file) => ({ filename: file.name, size: file.size }));

  validateAttachmentSizes(sizes);

  const attachments: OutgoingAttachment[] = [];
  for (const entry of entries) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    attachments.push({
      filename: entry.name,
      contentType: entry.type || "application/octet-stream",
      content: Buffer.from(await entry.arrayBuffer()),
    });
  }

  return attachments;
}

/** Parse send/reply/forward body as multipart/form-data or legacy JSON. */
export async function parseMailForm(request: Request): Promise<ParsedMailForm> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const attachments = await attachmentsFromForm(formData);

    return {
      to: String(formData.get("to") ?? "").trim(),
      subject: String(formData.get("subject") ?? "").trim(),
      text: String(formData.get("text") ?? "").trim(),
      cc: String(formData.get("cc") ?? "").trim() || undefined,
      bcc: String(formData.get("bcc") ?? "").trim() || undefined,
      threadId: String(formData.get("threadId") ?? "").trim() || undefined,
      folder: String(formData.get("folder") ?? "").trim() || undefined,
      attachments,
    };
  }

  const body = (await request.json()) as {
    to?: string;
    subject?: string;
    text?: string;
    cc?: string;
    bcc?: string;
    threadId?: string;
    folder?: string;
  };

  return {
    to: body.to?.trim() ?? "",
    subject: body.subject?.trim() ?? "",
    text: body.text?.trim() ?? "",
    cc: body.cc?.trim() || undefined,
    bcc: body.bcc?.trim() || undefined,
    threadId: body.threadId?.trim() || undefined,
    folder: body.folder?.trim() || undefined,
    attachments: [],
  };
}
