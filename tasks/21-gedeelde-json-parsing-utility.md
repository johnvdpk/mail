# Taak 21: Gedeelde JSON-parsing utility voor LLM-antwoorden

**Status:** done
**Fase:** 6 — Review-opvolging (codekwaliteit)
**Prioriteit:** Medium
**Geschatte inspanning:** 0.5-1 uur

## Omschrijving
De functies `stripMarkdown` en `parseJsonObject` (markdown-codefence strippen + JSON parsen met fallback op eerste/laatste accolade) staan letterlijk gekopieerd in vijf bestanden: `lib/ai-mail.ts`, `lib/detect-intent.ts`, `lib/learn-tone.ts`, `lib/ai-sort.ts`, `lib/mail-search.ts`. Een bugfix of verbetering (bijv. betere fallback-parsing) moet nu vijf keer worden doorgevoerd.

Trek beide functies naar een nieuw bestand `lib/llm-json.ts` en laat alle vijf bestanden dat importeren. Geen gedragswijziging, puur consolidatie.

## Betrokken bestanden
- `lib/llm-json.ts` (nieuw)
- `lib/ai-mail.ts`, `lib/detect-intent.ts`, `lib/learn-tone.ts`, `lib/ai-sort.ts`, `lib/mail-search.ts`
