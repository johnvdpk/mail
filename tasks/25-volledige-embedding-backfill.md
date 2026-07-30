# Taak 25: Volledige embedding-backfill als losstaande achtergrondtaak

**Status:** done
**Fase:** 6 — Review-opvolging (klantenzoek, semantische fase)
**Prioriteit:** Medium
**Geschatte inspanning:** 2 uur
**Geblokkeerd door:** niets, maar sluit aan op Taak 16 (semantische verrijking)

## Omschrijving
`runSemanticPhase` roept `backfillRecentEmbeddings(40)` aan, die alleen de 40 meest recente mails zonder embedding oppakt — per zoekopdracht. Bij een bestaande mailbox met een grote achterstand aan niet-geëmbedde mail duurt het dus veel zoekopdrachten voordat de hele mailbox semantisch doorzoekbaar is. Nieuwe mail krijgt al een embedding tijdens sync (`lib/sync.ts`), dus dit gaat specifiek om de historische achterstand.

Voeg een losstaande achtergrondtaak toe (via `processMailJobs` in `lib/mail-jobs.ts`, of een eigen periodieke aanroep) die continu een vaste batch (bijv. 40-100) oudste niet-geëmbedde mails afwerkt, onafhankelijk van of er een actieve zoekopdracht loopt. Optioneel: een voortgangsindicator ("X van Y mails doorzocht") ergens in de instellingen of het zoekpaneel.

## Betrokken bestanden
- `lib/embeddings.ts` (`backfillRecentEmbeddings`)
- `lib/mail-jobs.ts` (`processMailJobs`)
- `app/api/mail-jobs/route.ts`
