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
  toneOfVoice: {
    rules: string;
    avoidWords: string;
    maxWords: number;
  };
  aboutMe: {
    intro: string;
    background: string;
    whyReachOut: string;
  };
  snippets: SnippetItem[];
  replies: SnippetItem[];
  subjectLines: {
    defaultFormat: string;
    alternatives: string;
  };
  promises: {
    doOffer: string;
    dontOffer: string;
  };
  segments: SegmentHint[];
  footer: {
    text: string;
    html: string;
  };
  testEmail: string;
};

const EMPTY_SNIPPET = (id: string, label: string, hint: string): SnippetItem => ({
  id,
  label,
  hint,
  text: "",
  personalNote: "",
});

export const DEFAULT_CAMPAIGN_PROFILE: CampaignProfile = {
  listColumns: [],
  toneOfVoice: {
    rules: `Warm, kort en menselijk. Informeel maar professioneel.
Begin met Hey, houd het kort.
Gebruik je/jij, geen salespraat.
Noem alleen wat je ZEKER weet over de lead. Geen aannames.
Maximaal één concrete observatie. Reageer nuchter.
Geen streepjes of puntkomma's (dat klinkt AI-achtig)
Houd het kort: liever te kort dan te lang`,
    avoidWords: "garantie, uniek systeem, beste oplossing, revolutionair",
    maxWords: 200,
  },
  aboutMe: {
    intro: "",
    background: "",
    whyReachOut: "",
  },
  snippets: [
    EMPTY_SNIPPET("opening", "Opening", "Eerste alinea — kort en persoonlijk"),
    EMPTY_SNIPPET("pitch", "Pitch", "Wie je bent en wat je aanbiedt"),
    EMPTY_SNIPPET("observation", "Observatie", "Eén concreet detail dat je zeker weet"),
    EMPTY_SNIPPET("no_interest", "Geen interesse", "Uitweg als ze niet willen"),
    EMPTY_SNIPPET("yes_interest", "Wel interesse", "Call to action"),
    {
      id: "closing",
      label: "Afsluiting",
      hint: "Laatste zinnen vóór Groeten",
      text: "Wie weet spreken we elkaar.\n\nGroeten,\nJohn",
      personalNote: "",
    },
    EMPTY_SNIPPET("ps", "P.S.", "Optioneel, ná Groeten"),
  ],
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
  subjectLines: {
    defaultFormat: "Even kort, {naam}",
    alternatives: "Aangenaam, {naam}",
  },
  promises: {
    doOffer: "",
    dontOffer: "",
  },
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

export function mergeWithDefaults(partial: Partial<CampaignProfile> | null | undefined): CampaignProfile {
  const defaults = structuredClone(DEFAULT_CAMPAIGN_PROFILE);
  if (!partial || typeof partial !== "object") return defaults;

  return {
    listColumns: Array.isArray(partial.listColumns) ? partial.listColumns : defaults.listColumns,
    toneOfVoice: { ...defaults.toneOfVoice, ...partial.toneOfVoice },
    aboutMe: { ...defaults.aboutMe, ...partial.aboutMe },
    snippets: mergeSnippets(partial.snippets, defaults.snippets),
    replies: mergeSnippets(partial.replies, defaults.replies),
    subjectLines: { ...defaults.subjectLines, ...partial.subjectLines },
    promises: { ...defaults.promises, ...partial.promises },
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
