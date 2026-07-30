import type { CalendarInvite } from "./ics";

export type FolderRole = "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive";

export type MailFolder = {
  /** IMAP path, used as the canonical identifier */
  path: string;
  /** Display name (last path segment) */
  name: string;
  role?: FolderRole;
  parentPath: string;
  subscribed: boolean;
};

/** Folder plus locally known counts, used for the folder rail. */
export type FolderSummary = MailFolder & {
  unread: number;
  total: number;
};

export type MailAddress = {
  name?: string;
  email: string;
};

export type Attachment = {
  filename: string;
  contentType: string;
  size: number;
};

/**
 * Header-level data for one message. Cheap to sync in bulk, enough to render a list.
 * The `id` is only stable within one UIDVALIDITY generation of its folder.
 */
export type MessageSummary = {
  id: string;
  folder: string;
  uid: number;
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  from?: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  snippet: string;
  date: string;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  hasAttachments: boolean;
};

/** Full body, fetched on demand and cached separately from the summary. */
export type MessageBody = {
  id: string;
  text: string;
  html?: string;
  attachments: Attachment[];
  /** Parsed ICS invite when the message includes a calendar attachment */
  calendarInvite?: CalendarInvite;
  loadedAt: string;
};

export type Thread = {
  id: string;
  subject: string;
  participants: MailAddress[];
  /** Folders this conversation has messages in */
  folders: string[];
  lastDate: string;
  unread: boolean;
  flagged: boolean;
  hasAttachments: boolean;
  snippet: string;
  messageCount: number;
  /** Summary ids, oldest first */
  messageIds: string[];
};

export type ThreadMessage = MessageSummary & {
  body?: MessageBody;
  /** True when the message was sent by the account owner */
  outbound: boolean;
};

export type ThreadDetail = {
  thread: Thread;
  messages: ThreadMessage[];
};
