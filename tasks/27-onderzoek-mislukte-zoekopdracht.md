# Taak 27: Root cause van mislukte zoekopdracht (status "failed", 0 resultaten)

**Status:** done
**Fase:** 6 — Review-opvolging (robuustheid klantenzoek)
**Prioriteit:** Low
**Geschatte inspanning:** 1 uur (onderzoek, fix is los werk afhankelijk van bevinding)

## Omschrijving
In de lijst met eerdere zoekopdrachten stond een run met status "Mislukt" en 0 resultaten. Dit is geen hypothetische edge-case maar iets dat in de praktijk al is gebeurd. Achterhaal de oorzaak: te brede/te smalle keyword-extractie, een OpenRouter-foutrespons die niet goed werd afgevangen, of een parsing-fout in `assessCandidates`/`extractKeywords`.

Voeg zo nodig meer specifieke logging toe rond `runKeywordPhase` (welke stap faalt: keyword-extractie, kandidaten ophalen, of beoordelen) zodat een volgende mislukte run sneller te diagnosticeren is. Overweeg de foutmelding in `search_jobs.error` specifieker te maken dan de generieke `err.message`.

## Betrokken bestanden
- `lib/mail-search.ts` (`runKeywordPhase`, `extractKeywords`, `assessCandidates`)
