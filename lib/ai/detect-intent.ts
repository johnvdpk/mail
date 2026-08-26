import { chatCompletion } from "./openrouter";
import { readEmailConfig } from "../config/email-config";
import { parseJsonObject } from "./llm-json";
import type { ThreadContext } from "../mail/mailbox-service";

export type IntentSuggestion = {
  intentId: string;
  label: string;
  confidence: number;
  reason: string;
};

function formatThread(context: ThreadContext): string {
  const lines = [
    `Gesprek met: ${context.counterpartName ?? context.counterpart}`,
    `Onderwerp: ${context.subject}`,
  ];
  for (const message of context.messages.slice(-6)) {
    lines.push("");
    lines.push(`--- ${message.outbound ? "JOHN" : "ZIJ"} (${message.at}) ---`);
    lines.push(message.bodyText.slice(0, 600));
  }
  return lines.join("\n");
}

/**
 * Detect which quick-reply intent best fits the open thread.
 */
export async function detectBestIntent(context: ThreadContext): Promise<IntentSuggestion> {
  const config = await readEmailConfig();
  const intents = config.replies.map((r) => ({
    id: r.id,
    label: r.label,
    hint: r.hint ?? "",
  }));

  if (intents.length === 0) {
    return {
      intentId: "opvolging",
      label: "Opvolging",
      confidence: 0.3,
      reason: "Geen reply-templates geconfigureerd",
    };
  }

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: `Je kiest de beste reply-intentie voor Johns antwoord op een e-mailthread.
Beschikbare intenties (JSON): ${JSON.stringify(intents)}

Antwoord uitsluitend als JSON:
- intentId (string, moet een van de ids zijn)
- confidence (number 0-1)
- reason (string, 1 korte zin in het Nederlands)`,
      },
      {
        role: "user",
        content: `=== CONVERSATIE ===\n${formatThread(context)}\n\nWelke intentie past het best?`,
      },
    ],
    { jsonMode: true, temperature: 0.2 }
  );

  const parsed = parseJsonObject(raw);
  const intentId =
    typeof parsed?.intentId === "string" && intents.some((i) => i.id === parsed.intentId)
      ? parsed.intentId
      : intents[0].id;
  const match = intents.find((i) => i.id === intentId) ?? intents[0];
  const confidence =
    typeof parsed?.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;
  const reason =
    typeof parsed?.reason === "string" ? parsed.reason.trim() : "Beste match op basis van de thread";

  return {
    intentId: match.id,
    label: match.label,
    confidence,
    reason,
  };
}
