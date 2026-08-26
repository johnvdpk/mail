import type { CampaignProfile } from "./campaign-profile";
import type { WebsiteScanResult } from "./website-scan";

export type TargetStatus = "new" | "emailed" | "excluded" | "not_interested";
export type ResponseStatus = "pending" | "replied" | "no_interest" | "deal";

export const RESPONSE_LABELS: Record<ResponseStatus, string> = {
  pending: "Pending",
  replied: "Heeft gereageerd",
  no_interest: "Geen interesse",
  deal: "Deal",
};

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  new: "Nieuw",
  emailed: "Gemaild",
  excluded: "Uitgesloten",
  not_interested: "Geen interesse",
};

export type Campaign = {
  id: number;
  name: string;
  slug: string;
  profile: CampaignProfile;
  createdAt: string;
  updatedAt: string;
};

export type CampaignTarget = {
  id: number;
  campaignId: number;
  email: string;
  emailNormalized: string;
  name: string;
  website: string | null;
  status: TargetStatus;
  attributes: Record<string, unknown>;
  importedAt: string;
  emailedAt: string | null;
  excludedAt: string | null;
  notInterestedAt: string | null;
};

export type CampaignSend = {
  id: number;
  targetId: number;
  messageId: string;
  subject: string;
  bodyText: string;
  sentAt: string;
  isTest: boolean;
  responseStatus: ResponseStatus;
  responseAt: string | null;
};

export type CampaignSendListItem = CampaignSend & {
  targetName: string;
  targetEmail: string;
  inboxMessageId: string | null;
};

export type TargetImportRow = {
  email: string;
  name: string;
  website?: string;
  attributes?: Record<string, unknown>;
};

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  skipReasons: string[];
};

export type TargetStats = {
  total: number;
  uniqueEmails: number;
  withEmail: number;
  emailed: number;
  excluded: number;
  notInterested: number;
};

export const TARGET_PAGE_SIZE = 50;

export type EmailDraft = {
  subject: string;
  text: string;
  html: string;
  bodyText: string;
  findings?: string;
  scan?: WebsiteScanResult;
  websiteError?: string;
  usedMetadataFallback?: boolean;
};
