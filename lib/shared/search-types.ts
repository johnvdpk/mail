/** Shared types for AI hybrid mail search (client + server). */

export type SearchJobStatus =
  | "pending"
  | "keyword_running"
  | "keyword_done"
  | "semantic_running"
  | "done"
  | "failed";

export type SearchMatchType = "keyword" | "semantic";

export type SearchResultView = {
  id: number;
  messageId: string;
  matchType: SearchMatchType;
  relevance: number | null;
  contactId: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
  reasoning: string | null;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  date: string;
  snippet: string;
  /** Number of underlying mails deduped into this result (same contact). */
  mailCount: number;
};

/** Lifecycle status of a persistent contact in the CRM-like contacts layer. */
export type ContactStatus = "nieuw" | "benaderd" | "geen_interesse" | "klant";

export type ContactView = {
  id: number;
  email: string;
  name: string | null;
  company: string | null;
  status: ContactStatus;
  note: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Total number of search results linked to this contact, across all jobs. */
  resultCount: number;
};

export type SearchJobView = {
  id: number;
  prompt: string;
  status: SearchJobStatus;
  keywords: string[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
  results: SearchResultView[];
};

export type SearchJobSummary = {
  id: number;
  prompt: string;
  status: SearchJobStatus;
  resultCount: number;
  createdAt: string;
  updatedAt: string;
};
