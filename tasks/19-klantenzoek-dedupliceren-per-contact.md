# Taak 19: Zoekresultaten dedupliceren per contact

**Status:** done
**Fase:** 6 — Review-opvolging (kwaliteit klantenzoek)
**Prioriteit:** High
**Geschatte inspanning:** 1-2 uur

## Omschrijving
Live test liet zien dat dezelfde persoon meerdere keren in de resultatenlijst van een zoekopdracht verschijnt (bijv. 3x dezelfde afzender met hetzelfde onderwerp), omdat matching op individueel bericht-niveau gebeurt (`search_results` is uniek per `(job_id, message_id)`, niet per contact). Voor "vind potentiële klanten" wil de gebruiker één kaart per contact, niet één per e-mail.

Groepeer resultaten in `getSearchJob`/`loadJobResults` (of in de UI-laag `MailSearch.tsx`) op `contact_email` (fallback `from_email`), en toon per contact de mail met de hoogste relevantie plus een teller "N mails gevonden".

## Betrokken bestanden
- `lib/mail-search.ts` (`loadJobResults`, `mapResult`)
- `components/MailSearch/MailSearch.tsx`
