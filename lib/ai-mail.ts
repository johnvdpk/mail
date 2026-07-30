import { chatCompletion } from "./openrouter";
import {
  buildReplyPromptContext,
  buildTonePromptContext,
  readEmailConfig,
} from "./email-config";
import { humanizeMailText } from "./humanize-text";
import type { ThreadContext } from "./mailbox-service";

export type ReplyDraftResult = {
  body: string;
  intent: string;
};

export type PolishResult = {
  body: string;
  notes: string;
};

export type TipsResult = {
  tips: string[];
  talkingPoints: string[];
  summary: string;
};

function formatThread(context: ThreadContext): string {
  const lines: string[] = [];
  lines.push(`Gesprek met: ${context.counterpartName ?? context.counterpart}`);
  lines.push(`Onderwerp: ${context.subject}`);

  for (const message of context.messages) {
    lines.push("");
    lines.push(`--- ${message.outbound ? "JOHN" : "ZIJ"} (${message.at}) ---`);
    lines.push(`Van: ${message.from}`);
    lines.push(`Onderwerp: ${message.subject}`);
    lines.push(message.bodyText);
  }

  return lines.join("\n");
}

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

function stringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, limit);
}

const REPLY_SYSTEM = `Je helpt John met een korte e-mail reply.
Je krijgt de volledige conversatie en een reply-template met een intentie.

Schrijf ALLEEN de body van de reply (geen onderwerpregel).
Sluit af met "Groeten,\\nJohn".
KRITISCH: gebruik NOOIT puntkomma's (;) en NOOIT streepjes als leesteken (geen " - ", " — ", " – ").
Gebruik lege regels tussen alinea's (\\n\\n). Houd het kort en menselijk.
Behoud Johns tone of voice strikt.

Antwoord uitsluitend als JSON-object met exact deze key:
- body (string, gebruik \\n voor regeleinden)`;

/**
 * Generate an AI-powered reply draft based on conversation context and intent.
 * Uses OpenRouter to draft professional or casual replies.
 *
 * @param threadId Email thread ID
 * @param context Thread context including messages and counterpart info
 * @param intent User's desired tone/action (e.g., "acknowledge", "apologize", "suggest meeting")
 * @returns Generated reply draft with body and intent confirmation
 * @throws Error if OpenRouter API fails or intent not understood
 */
export async function draftReply(
  context: ThreadContext,
  intent: string
): Promise<ReplyDraftResult> {
  const config = await readEmailConfig();
  const template = config.replies.find((r) => r.id === intent);
  const systemPrompt = `${REPLY_SYSTEM}\n\n${buildReplyPromptContext(config, intent)}`;

  const intentHint = template?.hint
    ? `Intentie: ${template.label}. ${template.hint}`
    : `Intentie: ${intent}`;

  const raw = await chatCompletion(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${intentHint}

=== CONVERSATIE ===
${formatThread(context)}

Schrijf nu de reply-body. Reageer concreet op hun laatste bericht als dat er is.`,
      },
    ],
    { jsonMode: true, temperature: 0.35 }
  );

  const parsed = parseJsonObject(raw);
  const body = humanizeMailText(typeof parsed?.body === "string" ? parsed.body : raw);

  if (!body.trim()) throw new Error("Lege AI-draft");
  return { body: body.trim(), intent };
}

const POLISH_SYSTEM = `Je corrigeert spelling en grammatica van een e-mailconcept van John.
Behoud zijn tone of voice, woordkeuze en intentie. Verander de betekenis niet en voeg geen claims toe.
KRITISCH: gebruik NOOIT puntkomma's (;) en NOOIT streepjes als leesteken.

Antwoord uitsluitend als JSON-object:
- body (string, gecorrigeerde mailbody)
- notes (string, kort wat je aanpaste, leeg als er niets veranderde)`;

/**
 * Refine and improve a draft email for tone, clarity, and professionalism.
 * Preserves the core message while enhancing grammar and structure.
 *
 * @param text Draft email body to improve
 * @returns Improved text with explanation of changes made
 * @throws Error if OpenRouter API fails
 */
export async function polishDraft(
  context: ThreadContext | null,
  draft: string
): Promise<PolishResult> {
  const config = await readEmailConfig();
  const threadBlock = context
    ? `\n=== CONVERSATIE (context) ===\n${formatThread(context)}\n`
    : "";

  const raw = await chatCompletion(
    [
      { role: "system", content: `${POLISH_SYSTEM}\n\n${buildTonePromptContext(config)}` },
      {
        role: "user",
        content: `${threadBlock}\n=== CONCEPT ===\n${draft}\n\nCorrigeer spelling en grammatica met behoud van tone of voice.`,
      },
    ],
    { jsonMode: true, temperature: 0.2 }
  );

  const parsed = parseJsonObject(raw);
  const body = humanizeMailText(typeof parsed?.body === "string" ? parsed.body : draft);
  const notes = typeof parsed?.notes === "string" ? parsed.notes.trim() : "";

  return { body: body.trim(), notes };
}

const TIPS_SYSTEM = `Je analyseert een e-mailconversatie voor John.
Geef een korte samenvatting, praktische tips en concrete talking points.
Let op openstaande vragen, deadlines en beloftes die John of de ander heeft gedaan.
Maximaal 5 tips en 5 talking points. Geen lange teksten.

Antwoord uitsluitend als JSON-object:
- summary (string, 1 tot 3 zinnen)
- tips (array van strings)
- talkingPoints (array van strings, zinnen die John kan gebruiken)`;

/**
 * Generate AI conversation tips: summary, key points, and suggested talking points.
 * Useful for preparing for meetings or follow-ups discussed in email.
 *
 * @param context Thread context including all messages and participants
 * @returns Tips with conversation summary and suggested action points
 * @throws Error if OpenRouter API fails
 */
export async function suggestTips(context: ThreadContext): Promise<TipsResult> {
  const config = await readEmailConfig();

  const raw = await chatCompletion(
    [
      { role: "system", content: `${TIPS_SYSTEM}\n\n${buildTonePromptContext(config)}` },
      {
        role: "user",
        content: `=== CONVERSATIE ===\n${formatThread(context)}\n\nGeef samenvatting, tips en talking points.`,
      },
    ],
    { jsonMode: true, temperature: 0.4 }
  );

  const parsed = parseJsonObject(raw);
  return {
    summary: typeof parsed?.summary === "string" ? parsed.summary.trim() : "",
    tips: stringArray(parsed?.tips, 5),
    talkingPoints: stringArray(parsed?.talkingPoints, 5),
  };
}
