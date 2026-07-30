# Taak 29: Licht/zwaar model configureerbaar per AI-taak

**Status:** done
**Fase:** 6 — Review-opvolging (AI-schrijfassistent)
**Prioriteit:** Medium
**Geschatte inspanning:** 1-2 uur

## Omschrijving
Alle AI-taken gebruiken nu impliciet hetzelfde model (`DEFAULT_MODEL = "google/gemini-2.5-flash"` in `lib/openrouter.ts`), ook al accepteert `chatCompletion` al een `options.model`-override. OpenRouter routeert alle modellen via één en dezelfde API key (`OPENROUTER_AI`) — er is dus geen tweede key nodig, alleen een tweede model-naam.

Voeg twee env-vars toe:
- `OPENROUTER_MODEL` — licht/snel model, default blijft `google/gemini-2.5-flash`.
- `OPENROUTER_MODEL_HEAVY` — zwaarder model voor kwaliteitskritische taken, default bijv. `anthropic/claude-sonnet-4.5` (aanpasbaar zonder codewijziging).

Beide via dezelfde `OPENROUTER_AI`-key aanroepen (geen aparte auth-configuratie nodig).

**Gebruik het zware model in:**
- `draftReply` (`lib/ai-mail.ts`) — gaat direct naar klanten, kwaliteit weegt hier het zwaarst.
- `generateDetectedRules` in `learn-tone.ts` — vraagt nuance bij het afleiden van schrijfstijl-regels.
- `assessCandidates` in `lib/mail-search.ts` — relevantiebeoordeling + contactextractie bij Leadradar; een sterker model maakt classificatiefouten (zoals de eerder gevonden "eigen adres als match"-bug) minder waarschijnlijk.

**Licht model laten voor:** `detectBestIntent`, `extractKeywords`, `polishDraft`, `suggestTips` — classificatie-achtig werk waar snelheid boven diepgang gaat.

## Betrokken bestanden
- `lib/openrouter.ts` (`getHeavyModel()`-achtige helper, analoog aan bestaande `getEmbeddingModel()` in `lib/embeddings.ts`)
- `lib/ai-mail.ts` (`draftReply`)
- `lib/learn-tone.ts` (`generateDetectedRules`)
- `lib/mail-search.ts` (`assessCandidates`)
- `.env.example` (nieuwe vars documenteren)
