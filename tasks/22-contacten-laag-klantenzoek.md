# Taak 22: Persistente contacten-laag voor klantenzoek

**Status:** done
**Fase:** 6 — Review-opvolging (klantenzoek → CRM-achtig overzicht)
**Prioriteit:** Medium
**Geschatte inspanning:** 4-6 uur
**Overlapt met:** Taak 18, 19 — deze taak lost beide structureel op door contactgegevens niet per zoekopdracht opnieuw te laten extraheren, maar op te bouwen in één tabel.

## Omschrijving
Klantenzoek levert nu per zoekopdracht losse, wegwerpbare resultaten op. Er is geen manier om te zien met wie je al contact hebt gehad over eerdere zoekopdrachten heen, of om een status bij te houden (benaderd / geen interesse / klant geworden). Dat is precies waar de feature "meer potentie heeft dan hij nu waarmaakt".

Voeg een `contacts`-tabel toe (email uniek, naam, bedrijf, eerste/laatste gezien, status, notitie) en koppel `search_results` eraan via `contact_id` i.p.v. losse tekstvelden. Bij het opslaan van een resultaat: upsert op e-mailadres i.p.v. blind een nieuwe rij toevoegen. UI: toon in `MailSearch` een tabblad "Alle contacten" naast "Zoekopdrachten", met filter op status.

## Database
```sql
CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  status TEXT NOT NULL DEFAULT 'nieuw', -- nieuw | benaderd | geen_interesse | klant
  note TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE search_results ADD COLUMN contact_id INT REFERENCES contacts(id);
```

## Betrokken bestanden
- `lib/schema.sql`
- `lib/mail-search.ts` (`insertResults`, `mapResult`)
- `lib/search-types.ts`
- `components/MailSearch/MailSearch.tsx`
- `app/api/ai/search/route.ts`
