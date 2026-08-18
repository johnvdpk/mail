import { chatCompletion, chatCompletionStream, getHeavyModel } from "./openrouter";
import {
  buildReplyPromptContext,
  buildTonePromptContext,
  readEmailConfig,
} from "./email-config";
import { humanizeMailText } from "./humanize-text";
import { parseJsonObject } from "./llm-json";
import { extractPartialJsonStringField } from "./stream-json-body";
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

function stringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, limit);
}

const REPLY_SYSTEM = `Je helpt John met een korte e-mail reply.
Je krijgt de volledige conversatie en een reply-template met een intentie.

Schrijf ALLEEN de body van de reply (geen onderwerpregel).
TAAL: schrijf in de taal van de conversatie (laatste berichten). Engels gesprek → Engels reply. Nederlands → Nederlands. Vertaal niet.
Sluit af passend bij die taal: Nederlands "Groeten,\\nJohn"; Engels "Best regards,\\nJohn" (of korter als de thread informeel is).
KRITISCH: gebruik NOOIT puntkomma's (;) en NOOIT streepjes als leesteken (geen " - ", " — ", " – ").
Gebruik lege regels tussen alinea's (\\n\\n). Houd het kort en menselijk.
Behoud Johns tone of voice strikt (toon/stijl, niet de taal van de regels forceren).

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
    { jsonMode: true, temperature: 0.35, model: getHeavyModel() }
  );

  const parsed = parseJsonObject(raw);
  const body = humanizeMailText(typeof parsed?.body === "string" ? parsed.body : raw);

  if (!body.trim()) throw new Error("Lege AI-draft");
  return { body: body.trim(), intent };
}

/** Streaming variant of draftReply — yields incremental body text, then the final result. */
export async function* streamDraftReply(
  context: ThreadContext,
  intent: string
): AsyncGenerator<{ body: string; final?: ReplyDraftResult }> {
  const config = await readEmailConfig();
  const template = config.replies.find((r) => r.id === intent);
  const systemPrompt = `${REPLY_SYSTEM}\n\n${buildReplyPromptContext(config, intent)}`;

  const intentHint = template?.hint
    ? `Intentie: ${template.label}. ${template.hint}`
    : `Intentie: ${intent}`;

  let raw = "";
  let lastBody = "";

  for await (const delta of chatCompletionStream(
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
    { jsonMode: true, temperature: 0.35, model: getHeavyModel() }
  )) {
    raw += delta;
    const partial = extractPartialJsonStringField(raw, "body");
    if (partial !== null && partial !== lastBody) {
      lastBody = partial;
      yield { body: partial };
    }
  }

  const parsed = parseJsonObject(raw);
  const body = humanizeMailText(typeof parsed?.body === "string" ? parsed.body : raw);
  if (!body.trim()) throw new Error("Lege AI-draft");

  const result = { body: body.trim(), intent };
  yield { body: result.body, final: result };
}

const POLISH_SYSTEM = `Je corrigeert spelling en grammatica van een e-mailconcept van John.
Behoud zijn tone of voice, woordkeuze en intentie. Verander de betekenis niet en voeg geen claims toe.
KRITISCH: gebruik NOOIT puntkomma's (;) en NOOIT streepjes als leesteken.

TAAL (hoogste prioriteit):
- Schrijf ALTIJD in dezelfde taal als het CONCEPT. Engels concept → Engels output. Nederlands → Nederlands.
- Vertaal NOOIT. Pas tone-of-voice regels toe in die taal (bijv. "Groeten" alleen bij Nederlands; bij Engels "Best regards," / "Cheers," / wat bij het concept past).
- Notes in dezelfde taal als het concept.

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
        content: `${threadBlock}\n=== CONCEPT ===\n${draft}\n\nCorrigeer spelling en grammatica. Behoud de taal van het CONCEPT exact (geen vertaling). Behoud tone of voice.`,
      },
    ],
    { jsonMode: true, temperature: 0.2 }
  );

  const parsed = parseJsonObject(raw);
  const body = humanizeMailText(typeof parsed?.body === "string" ? parsed.body : draft);
  const notes = typeof parsed?.notes === "string" ? parsed.notes.trim() : "";

  return { body: body.trim(), notes };
}

/** Streaming variant of polishDraft — yields incremental body text, then the final result. */
export async function* streamPolishDraft(
  context: ThreadContext | null,
  draft: string
): AsyncGenerator<{ body: string; final?: PolishResult }> {
  const config = await readEmailConfig();
  const threadBlock = context
    ? `\n=== CONVERSATIE (context) ===\n${formatThread(context)}\n`
    : "";

  let raw = "";
  let lastBody = "";

  for await (const delta of chatCompletionStream(
    [
      { role: "system", content: `${POLISH_SYSTEM}\n\n${buildTonePromptContext(config)}` },
      {
        role: "user",
        content: `${threadBlock}\n=== CONCEPT ===\n${draft}\n\nCorrigeer spelling en grammatica. Behoud de taal van het CONCEPT exact (geen vertaling). Behoud tone of voice.`,
      },
    ],
    { jsonMode: true, temperature: 0.2 }
  )) {
    raw += delta;
    const partial = extractPartialJsonStringField(raw, "body");
    if (partial !== null && partial !== lastBody) {
      lastBody = partial;
      yield { body: partial };
    }
  }

  const parsed = parseJsonObject(raw);
  const body = humanizeMailText(typeof parsed?.body === "string" ? parsed.body : draft);
  const notes = typeof parsed?.notes === "string" ? parsed.notes.trim() : "";
  const result = { body: body.trim(), notes };
  yield { body: result.body, final: result };
}

export type SpellingCorrection = {
  original: string;
  suggestion: string;
};

export type SpellcheckResult = {
  corrections: SpellingCorrection[];
};

const SPELLCHECK_SYSTEM = `Je bent een spellingcontrole voor e-mailconcepten van John.
Zoek uitsluitend spel- en typfouten en overduidelijke grammaticale fouten. Bemoei je niet met stijl, toon of woordkeuze.
Voor elke fout geef je het exacte foutieve fragment zoals het LETTERLIJK in de tekst voorkomt (original, kort: een woord of enkele woorden) en de correctie (suggestion).
Geef nooit een correctie waarbij original en suggestion identiek zijn. Als er geen fouten zijn, geef een lege array.

Antwoord uitsluitend als JSON-object:
- corrections (array van objecten met: original (string), suggestion (string))`;

/**
 * Check a draft email body for spelling/typo mistakes.
 * Returns a list of exact substrings found in the text with their suggested correction,
 * so the caller can highlight them inline without rewriting the whole draft.
 *
 * @param text Draft email body to check
 * @returns List of spelling corrections (empty if no mistakes found)
 * @throws Error if OpenRouter API fails
 */
export async function checkSpelling(text: string): Promise<SpellcheckResult> {
  const raw = await chatCompletion(
    [
      { role: "system", content: SPELLCHECK_SYSTEM },
      { role: "user", content: `=== CONCEPT ===\n${text}\n\nGeef alle spelfouten.` },
    ],
    { jsonMode: true, temperature: 0 }
  );

  const parsed = parseJsonObject(raw);
  const rawCorrections = Array.isArray(parsed?.corrections) ? parsed.corrections : [];
  const corrections: SpellingCorrection[] = [];

  for (const item of rawCorrections) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const original = typeof row.original === "string" ? row.original : "";
    const suggestion = typeof row.suggestion === "string" ? row.suggestion : "";
    if (!original || !suggestion || original === suggestion) continue;
    if (!text.includes(original)) continue;
    corrections.push({ original, suggestion });
  }

  return { corrections };
}

const SUBJECT_SYSTEM = `Je bedenkt een korte, duidelijke onderwerpregel voor een nieuwe e-mail van John, op basis van de conceptbody.
Geen aanhalingstekens, geen puntkomma's, geen "Re:"/"Fwd:" prefixes. Maximaal circa 8 woorden.
Schrijf in dezelfde taal als de conceptbody.

Antwoord uitsluitend als JSON-object met exact deze key:
- subject (string)`;

/**
 * Suggest a short subject line for a new email based on its draft body.
 *
 * @param draft Draft email body to base the subject on
 * @returns Suggested subject line
 * @throws Error if OpenRouter API fails
 */
export async function suggestSubject(draft: string): Promise<string> {
  const raw = await chatCompletion(
    [
      { role: "system", content: SUBJECT_SYSTEM },
      { role: "user", content: `=== CONCEPT ===\n${draft}\n\nBedenk een onderwerpregel.` },
    ],
    { jsonMode: true, temperature: 0.4 }
  );

  const parsed = parseJsonObject(raw);
  const subject = typeof parsed?.subject === "string" ? parsed.subject.trim() : "";
  if (!subject) throw new Error("Geen onderwerp gevonden");
  return subject.replace(/^["']|["']$/g, "");
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

export type ExtractedTask = {
  title: string;
  notes?: string;
};

export type ExtractTasksResult = {
  summary: string;
  tasks: ExtractedTask[];
};

const TASKS_SYSTEM = `Je haalt concrete taken/actiepunten uit een e-mailconversatie voor John.
Focus op wat John (of zijn team) moet doen: to-do's, deliverables, deadlines, openstaande acties.
Als er een expliciete takenlijst in de mail staat, neem die zo getrouw mogelijk over.
Negeer praatjes, begroetingen en pure informatie zonder actie.
Maximaal 25 taken. Titels kort en uitvoerbaar (imperatief of checkliststijl).

Antwoord uitsluitend als JSON-object:
- summary (string, 1 tot 3 zinnen context)
- tasks (array van objecten met: title (string), notes (string, optioneel, kort))`;

/**
 * Extract actionable tasks from an email thread for a markdown checklist export.
 */
export async function extractTasks(context: ThreadContext): Promise<ExtractTasksResult> {
  const config = await readEmailConfig();

  const raw = await chatCompletion(
    [
      { role: "system", content: `${TASKS_SYSTEM}\n\n${buildTonePromptContext(config)}` },
      {
        role: "user",
        content: `=== CONVERSATIE ===\n${formatThread(context)}\n\nHaal alle taken/actiepunten eruit.`,
      },
    ],
    { jsonMode: true, temperature: 0.2, model: getHeavyModel() }
  );

  const parsed = parseJsonObject(raw);
  const tasksRaw = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  const tasks: ExtractedTask[] = [];

  for (const item of tasksRaw.slice(0, 25)) {
    if (typeof item === "string" && item.trim()) {
      tasks.push({ title: item.trim() });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!title) continue;
    const notes = typeof row.notes === "string" ? row.notes.trim() : undefined;
    tasks.push(notes ? { title, notes } : { title });
  }

  return {
    summary: typeof parsed?.summary === "string" ? parsed.summary.trim() : "",
    tasks,
  };
}
