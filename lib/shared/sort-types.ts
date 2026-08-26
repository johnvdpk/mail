/** AI inbox-sort suggestion (preview only — apply happens after user confirm). */
export type SortSuggestion = {
  /** Thread id when available */
  threadId: string;
  /** Message summary ids to move (inbox messages in this thread) */
  messageIds: string[];
  subject: string;
  fromEmail?: string;
  fromName?: string;
  /** Proposed IMAP folder path / display name */
  proposedFolder: string;
  /** True when this folder does not exist yet */
  createFolder: boolean;
  /** 0..1 */
  confidence: number;
  /** Short Dutch explanation */
  reason: string;
};

export type SortApplyItem = {
  messageIds: string[];
  folder: string;
  createFolder?: boolean;
};
