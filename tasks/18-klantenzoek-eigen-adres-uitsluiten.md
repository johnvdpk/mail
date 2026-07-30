# Taak 18: Eigen adres uitsluiten van klantenzoek-resultaten

**Status:** done
**Fase:** 6 — Review-opvolging (kwaliteit klantenzoek)
**Prioriteit:** High
**Geschatte inspanning:** 0.5-1 uur

## Omschrijving
Bij een live test kwam de gebruiker zelf (`john@aiadapt.nl`, eigen verzonden mail) meerdere keren naar voren als "gevonden klant" in een zoekopdracht. `findKeywordCandidates` in `lib/mail-search.ts` matcht momenteel op subject/snippet/from/body zonder het eigen account uit te sluiten, en `assessCandidates` valt bij het extraheren van contactgegevens terug op `from_name`/`from_email` van de kandidaat — bij uitgaande mail is dat de gebruiker zelf.

Sluit uitgaande mail (eigen account als afzender) uit van de kandidatenlijst, en laat de LLM-prompt in `assessCandidates` expliciet weten dat de tegenpartij bedoeld wordt, niet de afzender wanneer die de gebruiker zelf is.

## Betrokken bestanden
- `lib/mail-search.ts` (`findKeywordCandidates`, `assessCandidates`)
