import { chatCompletion, isOpenRouterConfigured } from "./openrouter";
import { getFolders, getInboxPath } from "./folders";
import { ownAddresses } from "./imap";
import { normalizeEmail } from "./normalize";
import { readFolderCache } from "./store";
import { buildThreads } from "./threads";
import type { SortSuggestion } from "./sort-types";
import type { MessageSummary } from "./types";

const DEFAULT_LIMIT = 40;

const SYSTEM_PROMPT = `Je helpt John zijn inbox op te ruimen door mails te groeperen in mappen.

Regels:
- Antwoord ALLEEN als JSON-object met key "suggestions" (array).
- Hergebruik bestaande mappen als ze passen.
- Je MAG nieuwe mapnamen voorstellen (kort, menselijk, Nederlands of merknaam): bijv. "Club QT", "Bureau Reuring", "Facturen".
- Sla over wat in de inbox mag blijven (persoonlijk, eenmalig, onduidelijk).
- Geen system-mappen: Inbox, Sent, Verzonden, Drafts, Concepten, Trash, Prullenbak, Junk, Spam, Archive, Archief.
- Per suggestion: messageId (exact zoals gegeven), proposedFolder, createFolder (bool), confidence (0-1), reason (kort Nederlands).
- Groepeer niet meerdere messageIds in één suggestion; één messageId per suggestion (threads worden server-side samengevoegd).`;

function stripMarkdown(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = stripMarkdown(raw);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

const BLOCKED_NAMES = new Set([
  "inbox",
  "sent",
  "verzonden",
  "drafts",
  "draft",
  "concepten",
  "trash",
  "prullenbak",
  "junk",
  "spam",
  "ongewenst",
  "archive",
  "archief",
]);

/**
 * Validate and sanitize a folder name for IMAP creation.
 * Removes invalid characters, reserved names, and ensures IMAP path compatibility.
 * Blocks system folders (Inbox, Sent, Archive, Trash, etc).
 *
 * @param raw Raw folder name input
 * @returns Sanitized folder name (max 80 chars) or null if invalid/reserved
 */
export function sanitizeFolderName(raw: string): string | null {
  const cleaned = raw
    .replace(/[/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (!cleaned) return null;
  if (BLOCKED_NAMES.has(cleaned.toLowerCase())) return null;
  return cleaned;
}

type Candidate = {
  messageId: string;
  threadId: string;
  subject: string;
  fromEmail?: string;
  fromName?: string;
  snippet: string;
  date: string;
  inboxMessageIds: string[];
};

async function collectCandidates(limit: number): Promise<{
  candidates: Candidate[];
  existingFolders: string[];
  folderPaths: Map<string, string>;
}> {
  const inboxPath = await getInboxPath();
  const cache = await readFolderCache(inboxPath);
  const mine = ownAddresses();

  const inbound = cache.messages.filter((m) => {
    if (m.draft) return false;
    if (!m.from) return true;
    return !mine.has(normalizeEmail(m.from.email));
  });

  const threads = buildThreads(inbound, mine).slice(0, limit);

  const candidates: Candidate[] = threads.map((thread) => {
    const msgs = thread.messageIds
      .map((id) => inbound.find((m) => m.id === id))
      .filter((m): m is MessageSummary => Boolean(m));
    const newest = msgs[msgs.length - 1] ?? msgs[0];

    return {
      messageId: newest?.id ?? thread.messageIds[0],
      threadId: thread.id,
      subject: thread.subject,
      fromEmail: newest?.from?.email,
      fromName: newest?.from?.name,
      snippet: thread.snippet.slice(0, 160),
      date: thread.lastDate,
      inboxMessageIds: msgs.map((m) => m.id),
    };
  });

  const folders = await getFolders();
  const custom = folders.filter((f) => !f.role);
  const existingFolders = custom.map((f) => f.name);
  const folderPaths = new Map<string, string>();
  for (const f of custom) {
    folderPaths.set(f.name.toLowerCase(), f.path);
    folderPaths.set(f.path.toLowerCase(), f.path);
  }

  return { candidates, existingFolders, folderPaths };
}

/**
 * AI-powered inbox organization suggestions.
 * Analyzes inbox threads and suggests which should move to which folders.
 * Can propose creating new folders based on message content.
 * Returns suggestions only — does not move or create anything.
 *
 * @param options Configuration
 * @param options.limit Max threads to analyze (default: 40)
 * @returns Array of folder move suggestions with confidence scores
 * @throws Error if OpenRouter AI not configured
 */
export async function suggestInboxSort(options?: {
  limit?: number;
}): Promise<SortSuggestion[]> {
  if (!isOpenRouterConfigured()) {
    throw new Error("OPENROUTER_AI niet geconfigureerd");
  }

  const limit = options?.limit ?? DEFAULT_LIMIT;
  const { candidates, existingFolders, folderPaths } = await collectCandidates(limit);

  if (candidates.length === 0) return [];

  const catalog = candidates.map((c) => ({
    messageId: c.messageId,
    subject: c.subject,
    from: c.fromName ? `${c.fromName} <${c.fromEmail ?? ""}>` : (c.fromEmail ?? ""),
    snippet: c.snippet,
    date: c.date,
  }));

  const userPrompt = [
    `Bestaande mappen: ${existingFolders.length ? existingFolders.join(", ") : "(nog geen custom mappen)"}`,
    "",
    "Mails (JSON):",
    JSON.stringify(catalog),
  ].join("\n");

  const raw = await chatCompletion(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.2, jsonMode: true }
  );

  const parsed = parseJsonObject(raw);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    throw new Error("AI gaf geen geldige sort-suggestions");
  }

  const byMessageId = new Map(candidates.map((c) => [c.messageId, c]));
  const suggestions: SortSuggestion[] = [];
  const seenThreads = new Set<string>();

  for (const item of parsed.suggestions) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const messageId = typeof row.messageId === "string" ? row.messageId : "";
    const candidate = byMessageId.get(messageId);
    if (!candidate) continue;
    if (seenThreads.has(candidate.threadId)) continue;

    const folderName = sanitizeFolderName(
      typeof row.proposedFolder === "string" ? row.proposedFolder : ""
    );
    if (!folderName) continue;

    const existingPath = folderPaths.get(folderName.toLowerCase());
    const createFolder = !existingPath;
    const confidence =
      typeof row.confidence === "number"
        ? Math.min(1, Math.max(0, row.confidence))
        : 0.5;
    const reason =
      typeof row.reason === "string" && row.reason.trim()
        ? row.reason.trim().slice(0, 200)
        : "Voorgesteld door AI";

    seenThreads.add(candidate.threadId);
    suggestions.push({
      threadId: candidate.threadId,
      messageIds: candidate.inboxMessageIds,
      subject: candidate.subject,
      fromEmail: candidate.fromEmail,
      fromName: candidate.fromName,
      proposedFolder: existingPath ?? folderName,
      createFolder,
      confidence,
      reason,
    });
  }

  return suggestions;
}
