import { chatCompletion, getHeavyModel, isOpenRouterConfigured } from "../ai/openrouter";
import { humanizeOutreachEmail, humanizeOutreachText } from "../ai/humanize-text";
import type { CampaignProfile, ReplyIntent } from "./campaign-profile";
import { extractReplyBody, parseAiJson } from "./ai-json";
import { buildOutreachEmail } from "./email-template";
import { buildConfigPromptContext, buildReplyPromptContext, formatTargetMetadata } from "./prompt-context";
import type { Campaign, CampaignSend, CampaignTarget } from "./types";
import { fetchWebsiteText, normalizeWebsiteUrl } from "./website-content";
import { emptyWebsiteScan, formatScanForPrompt, type WebsiteScanResult } from "./website-scan";

export type PersonalizeResult = {
  subject: string;
  text: string;
  html: string;
  bodyText: string;
  findings: string;
  scan?: WebsiteScanResult;
  websiteError?: string;
  usedMetadataFallback?: boolean;
};

export type ReplyDraftResult = {
  body: string;
  intent: ReplyIntent;
};

const SYSTEM_PROMPT_BASE = `Je helpt een Nederlandse webdeveloper met outreach-mails naar leads.
Je krijgt lead-metadata, eventueel tekst van hun website, en configureerbare teksten/tone of voice.

Zoek persoonlijke details die je ZEKER weet. Als je twijfelt over een detail: weglaten.
Gebruik de meegeleverde tekstblokken en tone of voice als basis. Pas ze aan per lead, niet letterlijk kopiëren.
Respecteer "niet beloven"-regels strikt.

KRITISCH voor subject én body: gebruik NOOIT puntkomma's (;) en NOOIT streepjes als leesteken (geen " - ", " — ", " – "). Alleen komma's en punten. Geen opsommingen met streepjes.
Gebruik lege regels tussen alinea's (dubbele newline \\n\\n), maar groepeer 2 tot 4 zinnen per alinea. Geen lege regel na elke zin.

Antwoord uitsluitend als JSON-object met exact deze keys:
- subject (string)
- body (string, gebruik \\n voor regeleinden)
- findings (string, geen array)`;

const REPLY_SYSTEM_BASE = `Je helpt met een korte reply op een lead die op outreach heeft gereageerd.
Je krijgt de oorspronkelijke outreach, de thread (inbound/outbound), en een reply-template.

Schrijf ALLEEN de body van de reply (geen onderwerpregel).
Sluit af met "Groeten,\\nJohn". Geen telefoonnummer, geen URL in de body.
KRITISCH: gebruik NOOIT puntkomma's (;) en NOOIT streepjes als leesteken (geen " - ", " — ", " – ").
Gebruik lege regels tussen alinea's (\\n\\n). Houd het kort en menselijk.

Antwoord uitsluitend als JSON-object met exact deze key:
- body (string, gebruik \\n voor regeleinden)`;

export async function personalizeOutreachEmail(
  target: CampaignTarget,
  campaign: Campaign
): Promise<PersonalizeResult> {
  if (!isOpenRouterConfigured()) {
    throw new Error("AI is niet geconfigureerd (OPENROUTER_AI ontbreekt)");
  }

  const profile: CampaignProfile = campaign.profile;
  const websiteUrl = normalizeWebsiteUrl(target.website ?? "");
  const altUrl = typeof target.attributes.finalUrl === "string" ? target.attributes.finalUrl : undefined;

  const fetched = websiteUrl
    ? await fetchWebsiteText(websiteUrl, altUrl)
    : { text: "", error: "Geen website-URL", scan: emptyWebsiteScan() };

  const siteText = fetched.text;
  const websiteError = fetched.error;
  const scan = fetched.scan ?? emptyWebsiteScan();
  const usedMetadataFallback = !siteText;

  const configContext = buildConfigPromptContext(profile, target, scan);
  const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${configContext}`;

  const contextBlock = siteText
    ? `${formatScanForPrompt(scan)}\n\nWebsite-inhoud:\n${siteText}`
    : `Geen live website-inhoud beschikbaar. Gebruik onderstaande metadata.`;

  const userPrompt = `${formatTargetMetadata(target)}

${contextBlock}

Schrijf een gepersonaliseerde mail.
Verwijs naar max één concreet detail dat je ZEKER weet (haakje uit scan of website). Liever weglaten dan gissen.
Houd de mail KORT (max ~${profile.toneOfVoice.maxWords} woorden). Liever te kort dan te lang.
Geen URL, geen democode, geen telefoonnummer in de body als die al in de footer staan.
In findings: kort wat je gebruikte + eventuele scan-signalen.`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  let parsed;
  try {
    const raw = await chatCompletion(messages, {
      jsonMode: true,
      temperature: 0.3,
      model: getHeavyModel(),
    });
    parsed = parseAiJson(raw);
  } catch {
    const raw = await chatCompletion(messages, {
      jsonMode: true,
      temperature: 0.1,
      model: getHeavyModel(),
    });
    parsed = parseAiJson(raw);
  }

  const cleaned = humanizeOutreachEmail(parsed.subject, parsed.body);
  const wrapped = buildOutreachEmail(target.name, websiteUrl || undefined, profile, {
    subject: cleaned.subject,
    bodyText: cleaned.body,
  });

  const scanBlock = scan.summaryLines.join("\n");
  const aiFindings = parsed.findings?.trim() ?? "";
  const findings = usedMetadataFallback
    ? [scanBlock, aiFindings, websiteError ? `(Website live niet opgehaald: ${websiteError})` : ""]
        .filter(Boolean)
        .join("\n")
    : [scanBlock, aiFindings].filter(Boolean).join("\n");

  return {
    ...wrapped,
    findings,
    scan,
    websiteError: usedMetadataFallback ? websiteError : undefined,
    usedMetadataFallback,
  };
}

export async function personalizeReplyDraft(input: {
  campaign: Campaign;
  send: CampaignSend;
  target: CampaignTarget;
  intent: ReplyIntent;
  threadText: string;
}): Promise<ReplyDraftResult> {
  if (!isOpenRouterConfigured()) {
    throw new Error("AI is niet geconfigureerd (OPENROUTER_AI ontbreekt)");
  }

  const { campaign, send, target, intent, threadText } = input;
  const configContext = buildReplyPromptContext(campaign.profile, intent);
  const systemPrompt = `${REPLY_SYSTEM_BASE}\n\n${configContext}`;

  const intentHint =
    intent === "afronden"
      ? "Intentie: AFRONDEN. Bedank voor hun reactie. Accepteer hun keuze. Maak duidelijk dat je ze niet meer lastigvalt. Geen pitch, geen demo, geen vervolgvraag."
      : "Intentie: OPVOLGING. Ga in op wat zij schreven. Stuur het gesprek vriendelijk verder. Geen druk.";

  const userPrompt = `Lead: ${target.name}
Intentie: ${intent}

${intentHint}

=== CONVERSATIE ===
Oorspronkelijke outreach (aan ${target.email}):
Onderwerp: ${send.subject}
${send.bodyText}

${threadText}

Schrijf nu de reply-body. Baseer je op het reply-template en de tone of voice. Reageer concreet op hun laatste inbound bericht als die er is.`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  let raw: string;
  try {
    raw = await chatCompletion(messages, { jsonMode: true, temperature: 0.35, model: getHeavyModel() });
  } catch {
    raw = await chatCompletion(messages, { jsonMode: true, temperature: 0.15, model: getHeavyModel() });
  }

  return { body: humanizeOutreachText(extractReplyBody(raw)), intent };
}
