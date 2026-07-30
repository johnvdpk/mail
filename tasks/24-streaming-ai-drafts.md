# Taak 24: Streaming voor AI-drafts en polish

**Status:** done
**Fase:** 6 — Review-opvolging (AI-schrijfassistent)
**Prioriteit:** Medium
**Geschatte inspanning:** 3-4 uur

## Omschrijving
`draftReply`, `polishDraft` en `suggestTips` in `lib/ai-mail.ts` wachten via `chatCompletion` op het volledige antwoord voordat er iets in de UI verschijnt. Dit is de grootste kans om de AI-schrijfassistent responsiever te laten *aanvoelen* zonder de onderliggende logica te veranderen: tekst die woord voor woord verschijnt scheelt drastisch in gepercipieerde wachttijd, ook als de totale tijd gelijk blijft.

Voeg een streaming-variant toe aan `lib/openrouter.ts` (SSE, `stream: true` in de OpenRouter-call) en gebruik die voor `draftReply`/`polishDraft`. Let op: de huidige flow werkt met `jsonMode: true` (JSON-object met `body`/`notes`) — bij streaming moet je incrementeel JSON kunnen tonen, of de aanpak omzetten naar streaming van platte tekst met de JSON-structuur pas aan het eind (of via een lichte JSON-streaming parser).

## Betrokken bestanden
- `lib/openrouter.ts` (nieuwe streaming-functie)
- `lib/ai-mail.ts`
- `components/Composer/Composer.tsx`, `components/ReplyPreviewDialog/ReplyPreviewDialog.tsx`
- `components/MailApp/useMailAppState.ts`
