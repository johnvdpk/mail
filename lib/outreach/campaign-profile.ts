export type SnippetItem = {
  id: string;
  label: string;
  hint?: string;
  text: string;
  personalNote: string;
};

export type SegmentHint = {
  id: string;
  label: string;
  hint: string;
};

export type ReplyIntent = "afronden" | "opvolging";

export const REPLY_INTENT_LABELS: Record<ReplyIntent, string> = {
  afronden: "Afronden",
  opvolging: "Opvolging",
};

export type ListColumn = {
  key: string;
  label: string;
  values?: Record<string, string>;
};

export type CampaignProfile = {
  listColumns: ListColumn[];
  /** Vrije AI-context: tone of voice, over mij, tekstblokken, beloftes, onderwerpalternatieven. */
  context: string;
  maxWords: number;
  subjectLine: string;
  /** Voorbeeld-mail met variabelen ({naam}, {email}, {website}, + custom attributes). AI gebruikt dit als basis. */
  emailTemplate: string;
  replies: SnippetItem[];
  segments: SegmentHint[];
  footer: {
    text: string;
    html: string;
  };
  testEmail: string;
};

const DEFAULT_CONTEXT = `=== TONE OF VOICE ===
Warm, kort en menselijk. Informeel maar professioneel.
Begin met Hey, houd het kort.
Gebruik je/jij, geen salespraat.
Noem alleen wat je ZEKER weet over de lead. Geen aannames.
Maximaal één concrete observatie. Reageer nuchter.
Geen streepjes of puntkomma's (dat klinkt AI-achtig)
Houd het kort: liever te kort dan te lang

Vermijd woorden/zinnen: garantie, uniek systeem, beste oplossing, revolutionair

=== OVER MIJ (afzender) ===


=== TEKSTBLOKKEN (gebruik als basis, pas aan per lead) ===

[Opening]
Eerste alinea — kort en persoonlijk

[Pitch]
Wie je bent en wat je aanbiedt

[Observatie]
Eén concreet detail dat je zeker weet

[Geen interesse]
Uitweg als ze niet willen

[Wel interesse]
Call to action

[Afsluiting]
Wie weet spreken we elkaar.

Groeten,
John

[P.S.]
Optioneel, ná Groeten

=== WAT MAG / MAG NIET BELOOFD WORDEN ===
Wel aanbieden:

Niet beloven:


=== ONDERWERPREGELS - ALTERNATIEVEN ===
Aangenaam, {naam}`;

export const DEFAULT_CAMPAIGN_PROFILE: CampaignProfile = {
  listColumns: [],
  context: DEFAULT_CONTEXT,
  maxWords: 200,
  subjectLine: "Even kort, {naam}",
  emailTemplate: `Hey {naam},

[Jouw waarneming]

[Pitch]

Zou je interesse hebben?

Groeten,
John`,
  replies: [
    {
      id: "afronden",
      label: "Afronden",
      hint: "Bedank voor de reactie en rond netjes af",
      text: "Hey geen probleem, snap ik.\nDank voor het terugmailen.\n\nGroeten,\nJohn",
      personalNote: "Blijf vriendelijk en kort. Geen pitch, geen druk.",
    },
    {
      id: "opvolging",
      label: "Opvolging",
      hint: "Ga in op hun mail en stuur het gesprek verder",
      text: "Bedankt voor je reactie, fijn dat je terugmailt.\n\nIk lees graag wat je bedoelt.\n\nGroeten,\nJohn",
      personalNote: "Reageer concreet op wat zij schreven. Geen druk.",
    },
  ],
  segments: [
    { id: "multi_location", label: "Meerdere locaties / keten", hint: "" },
    { id: "known_platform", label: "Al een bekend platform", hint: "" },
    { id: "email_booking", label: "Reserveren via e-mail", hint: "" },
    { id: "facebook_only", label: "Alleen Facebook", hint: "" },
    { id: "no_website", label: "Geen website", hint: "" },
    { id: "online", label: "Al online aanwezig", hint: "" },
  ],
  footer: {
    text: "",
    html: "",
  },
  testEmail: "",
};

/** Shape used before the profile editor collapsed tone/about/snippets/promises/subjects into one free-text `context`. */
type LegacyProfileFields = {
  toneOfVoice?: { rules?: string; avoidWords?: string; maxWords?: number };
  aboutMe?: { intro?: string; background?: string; whyReachOut?: string };
  snippets?: SnippetItem[];
  subjectLines?: { defaultFormat?: string; alternatives?: string };
  promises?: { doOffer?: string; dontOffer?: string };
};

/** Reconstructs a `context` blob from a pre-migration profile so existing campaigns (e.g. "Campings") keep their content. */
function migrateLegacyContext(legacy: LegacyProfileFields): string | undefined {
  if (!legacy.toneOfVoice && !legacy.aboutMe && !legacy.snippets && !legacy.promises && !legacy.subjectLines) {
    return undefined;
  }

  const lines: string[] = [];
  if (legacy.toneOfVoice?.rules) lines.push(legacy.toneOfVoice.rules);
  if (legacy.toneOfVoice?.avoidWords) lines.push(`Vermijd woorden/zinnen: ${legacy.toneOfVoice.avoidWords}`);

  const about = legacy.aboutMe;
  if (about?.intro || about?.background || about?.whyReachOut) {
    lines.push("\n=== OVER MIJ ===");
    if (about.intro) lines.push(about.intro);
    if (about.background) lines.push(about.background);
    if (about.whyReachOut) lines.push(about.whyReachOut);
  }

  if (legacy.snippets?.length) {
    lines.push("\n=== TEKSTBLOKKEN ===");
    for (const snippet of legacy.snippets) {
      lines.push(`\n[${snippet.label}]`);
      if (snippet.text) lines.push(snippet.text);
      if (snippet.personalNote) lines.push(`Persoonlijke noot voor AI: ${snippet.personalNote}`);
    }
  }

  const promises = legacy.promises;
  if (promises?.doOffer || promises?.dontOffer) {
    lines.push("\n=== WAT MAG / MAG NIET BELOOFD WORDEN ===");
    if (promises.doOffer) lines.push(`Wel aanbieden:\n${promises.doOffer}`);
    if (promises.dontOffer) lines.push(`Niet beloven:\n${promises.dontOffer}`);
  }

  if (legacy.subjectLines?.alternatives) {
    lines.push("\n=== ONDERWERPREGELS - ALTERNATIEVEN ===");
    lines.push(legacy.subjectLines.alternatives);
  }

  return lines.join("\n").trim();
}

export function mergeWithDefaults(partial: Partial<CampaignProfile> | null | undefined): CampaignProfile {
  const defaults = structuredClone(DEFAULT_CAMPAIGN_PROFILE);
  if (!partial || typeof partial !== "object") return defaults;
  const legacy = partial as LegacyProfileFields;

  return {
    listColumns: Array.isArray(partial.listColumns) ? partial.listColumns : defaults.listColumns,
    context: partial.context ?? migrateLegacyContext(legacy) ?? defaults.context,
    maxWords: partial.maxWords ?? legacy.toneOfVoice?.maxWords ?? defaults.maxWords,
    subjectLine: partial.subjectLine ?? legacy.subjectLines?.defaultFormat ?? defaults.subjectLine,
    emailTemplate: partial.emailTemplate ?? defaults.emailTemplate,
    replies: mergeSnippets(partial.replies, defaults.replies),
    segments: mergeSegments(partial.segments, defaults.segments),
    footer: { ...defaults.footer, ...partial.footer },
    testEmail: partial.testEmail ?? defaults.testEmail,
  };
}

function mergeSnippets(incoming: SnippetItem[] | undefined, defaults: SnippetItem[]): SnippetItem[] {
  if (!incoming?.length) return defaults;
  const byId = new Map(incoming.map((s) => [s.id, s]));
  const merged = defaults.map((def) => {
    const item = byId.get(def.id);
    return item ? { ...def, ...item } : def;
  });
  for (const item of incoming) {
    if (!defaults.some((d) => d.id === item.id)) merged.push(item);
  }
  return merged;
}

function mergeSegments(incoming: SegmentHint[] | undefined, defaults: SegmentHint[]): SegmentHint[] {
  if (!incoming?.length) return defaults;
  const byId = new Map(incoming.map((s) => [s.id, s]));
  const merged = defaults.map((def) => {
    const item = byId.get(def.id);
    return item ? { ...def, ...item } : def;
  });
  for (const item of incoming) {
    if (!defaults.some((d) => d.id === item.id)) merged.push(item);
  }
  return merged;
}
