# Taak 26: Klantenzoek hernoemen naar Leadradar

**Status:** done
**Fase:** 6 — Review-opvolging (naamgeving/UI)
**Prioriteit:** Low
**Geschatte inspanning:** 1 uur
**Geblokkeerd door:** bij voorkeur ná Taak 22 (contacten-laag), zodat de nieuwe naam ook inhoudelijk klopt

## Omschrijving
"Klantenzoek" dekt de lading niet helemaal — de feature doorzoekt de hele mailbox naar potentiële leads, niet alleen bestaande klanten. Voorstel: **"Leadradar"** (of alternatief "Prospects"). Kort, dekt zowel de keyword- als semantische fase, en klinkt minder als een eenmalige zoekactie en meer als een doorlopend overzicht — vooral treffend zodra Taak 22 (contacten-laag) er is.

Dit is puur een labeling-wijziging: knoptekst "Klant zoeken" in `ThreadList`, dialoogtitel in `MailSearch`, en interne verwijzingen in comments/task-namen waar relevant. Geen wijziging aan bestandsnamen of API-routes nodig (die mogen intern "search" blijven heten).

## Betrokken bestanden
- `components/ThreadList/ThreadList.tsx` (knoplabel)
- `components/MailSearch/MailSearch.tsx` (titel "Klant zoeken")
