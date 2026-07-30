# Taak 20: Kandidaat-batches parallel beoordelen i.p.v. sequentieel

**Status:** done
**Fase:** 6 — Review-opvolging (kwaliteit klantenzoek)
**Prioriteit:** High
**Geschatte inspanning:** 1 uur

## Omschrijving
`assessCandidates` in `lib/mail-search.ts` loopt kandidaten in batches van 8 af met een `for`-loop en `await` per batch (`ASSESS_BATCH_SIZE = 8`). Bij de standaard `KEYWORD_CANDIDATE_LIMIT` van 40 kandidaten betekent dit 5 LLM-round trips na elkaar, wat een zoekopdracht merkbaar traag maakt (kan 15-30s duren). Dezelfde structuur zit in de semantische fase.

Vervang de sequentiële loop door `Promise.all` over alle batches, zodat de LLM-calls gelijktijdig lopen. Let op: OpenRouter rate limits kunnen een max-gelijktijdigheid vereisen (bijv. batches van 3-4 tegelijk i.p.v. alles in één keer) — test dit.

## Betrokken bestanden
- `lib/mail-search.ts` (`assessCandidates`)
