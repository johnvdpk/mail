import { query, queryOne } from "./db";

export type QuickReplyTemplate = {
  id: string;
  label: string;
  hint?: string;
  text: string;
  /** Extra guidance for the AI when generating this reply */
  personalNote: string;
};

export type EmailConfig = {
  updatedAt?: string;
  toneOfVoice: {
    rules: string;
    avoidWords: string;
    maxWords: number;
  };
  aboutMe: {
    intro: string;
    background: string;
  };
  /** Quick-reply buttons (AI drafts from these templates) */
  replies: QuickReplyTemplate[];
};

export type ReplyIntent = string;

export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  toneOfVoice: {
    rules: `Warm, kort en menselijk. Informeel maar professioneel.
Gebruik je/jij waar dat past, geen salespraat.
Houd mijn toon: nuchter, direct, vriendelijk. Geen AI-lof.
Sluit af met "Groeten,\\nJohn".
Geen telefoonnummer of links in de body (die staan in de handtekening).
Geen streepjes of puntkomma's (dat klinkt AI-achtig).
Houd het kort: liever te kort dan te lang.`,
    avoidWords:
      "garantie, uniek systeem, beste oplossing, revolutionair, spreekt me aan, spreekt mij aan, wat me aansprak",
    maxWords: 180,
  },
  aboutMe: {
    intro: "Ik ben John van der Pouw Kraan. Software developer, eigenaar van aiadapt.nl.",
    background: "Ik mail vanuit john@aiadapt.nl. Kort en duidelijk, geen corporate toon.",
  },
  replies: [
    {
      id: "afronden",
      label: "Afronden",
      hint: "Bedank en rond netjes af — geen verdere actie",
      text: "Hey, geen probleem, snap ik.\nDank voor het terugmailen.\n\nGroeten,\nJohn",
      personalNote: "Blijf vriendelijk en kort. Geen pitch, geen druk, geen vervolgvraag.",
    },
    {
      id: "opvolging",
      label: "Opvolging",
      hint: "Ga in op hun mail en stuur het gesprek verder",
      text: "Bedankt voor je reactie.\n\nIk lees graag wat je bedoelt. Laat het weten als je wilt bellen of mailen.\n\nGroeten,\nJohn",
      personalNote: "Reageer concreet op wat zij schreven. Geen druk.",
    },
    {
      id: "bevestigen",
      label: "Bevestigen",
      hint: "Bevestig kort dat je het begrepen hebt / gaat doen",
      text: "Helder, dank je.\nIk pak dit op en kom erop terug.\n\nGroeten,\nJohn",
      personalNote: "Kort en concreet. Geen extra beloftes die niet in de thread staan.",
    },
  ],
};

export async function readEmailConfig(): Promise<EmailConfig> {
  const row = await queryOne<{ config: EmailConfig; updated_at: Date }>(
    "SELECT config, updated_at FROM email_config WHERE id = 1"
  );
  if (!row) {
    await writeEmailConfig(DEFAULT_EMAIL_CONFIG);
    return structuredClone(DEFAULT_EMAIL_CONFIG);
  }
  const merged = mergeWithDefaults(row.config);
  merged.updatedAt = row.updated_at.toISOString();
  return merged;
}

export async function writeEmailConfig(config: EmailConfig): Promise<EmailConfig> {
  const merged = mergeWithDefaults(config);
  const saved: EmailConfig = {
    ...merged,
    updatedAt: new Date().toISOString(),
  };
  await query(
    `INSERT INTO email_config (id, config, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = NOW()`,
    [JSON.stringify(saved)]
  );
  return saved;
}

function mergeWithDefaults(partial: Partial<EmailConfig>): EmailConfig {
  const defaults = structuredClone(DEFAULT_EMAIL_CONFIG);
  return {
    updatedAt: partial.updatedAt,
    toneOfVoice: { ...defaults.toneOfVoice, ...partial.toneOfVoice },
    aboutMe: { ...defaults.aboutMe, ...partial.aboutMe },
    replies: mergeReplies(partial.replies, defaults.replies),
  };
}

function mergeReplies(
  incoming: QuickReplyTemplate[] | undefined,
  defaults: QuickReplyTemplate[]
): QuickReplyTemplate[] {
  if (!incoming?.length) return defaults;
  // Keep user's custom list if they have edited it; still fill missing default fields per id
  return incoming.map((item) => {
    const def = defaults.find((d) => d.id === item.id);
    return def ? { ...def, ...item } : item;
  });
}

export function buildTonePromptContext(config: EmailConfig): string {
  const lines: string[] = [];
  lines.push("=== TONE OF VOICE ===");
  lines.push(config.toneOfVoice.rules);
  if (config.toneOfVoice.avoidWords.trim()) {
    lines.push(`Vermijd woorden/zinnen: ${config.toneOfVoice.avoidWords}`);
  }
  lines.push(`Maximaal ~${config.toneOfVoice.maxWords} woorden.`);
  lines.push("\n=== OVER MIJ (afzender John) ===");
  lines.push(config.aboutMe.intro);
  lines.push(config.aboutMe.background);
  return lines.join("\n");
}

export function buildReplyPromptContext(config: EmailConfig, intent: string): string {
  const lines: string[] = [buildTonePromptContext(config)];
  const template =
    config.replies.find((r) => r.id === intent) ??
    DEFAULT_EMAIL_CONFIG.replies.find((r) => r.id === intent);

  if (template) {
    lines.push(`\n=== REPLY-TEMPLATE: ${template.label.toUpperCase()} ===`);
    lines.push(template.text);
    if (template.personalNote.trim()) {
      lines.push(`Persoonlijke noot voor AI: ${template.personalNote}`);
    }
    if (template.hint) {
      lines.push(`Doel: ${template.hint}`);
    }
  }

  return lines.join("\n");
}
