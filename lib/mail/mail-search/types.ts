export type CandidateRow = {
  id: string;
  subject: string;
  snippet: string;
  from_name: string | null;
  from_email: string | null;
  date: Date;
  text_body: string | null;
};

export type AssessedMatch = {
  messageId: string;
  isMatch: boolean;
  relevance: number;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
  reasoning: string;
};

export type SearchCandidateRef = {
  id: string;
  from_name: string | null;
  from_email: string | null;
};

export type ParsedAssessedMatch = {
  messageId: string;
  isMatch: boolean;
  relevance: number;
  contactName: string | null;
  contactEmail: string | null;
  contactCompany: string | null;
  reasoning: string;
};

export type JobRow = {
  id: number;
  prompt: string;
  status: string;
  keywords: unknown;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ResultRow = {
  id: number;
  message_id: string;
  match_type: string;
  relevance: number | null;
  contact_id: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_company: string | null;
  reasoning: string | null;
  subject: string;
  from_name: string | null;
  from_email: string | null;
  date: Date;
  snippet: string;
};

export type ContactRow = {
  id: number;
  email: string;
  name: string | null;
  company: string | null;
  status: string;
  note: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  result_count: string;
};
