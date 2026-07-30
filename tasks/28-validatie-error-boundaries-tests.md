# Taak 28: E-mailvalidatie, error boundaries en basis testdekking

**Status:** done
**Fase:** 6 — Review-opvolging (project health, uit PROJECT_REVIEW.md)
**Prioriteit:** Medium
**Geschatte inspanning:** 3-4 uur

## Omschrijving
Drie losstaande, kleine punten uit `PROJECT_REVIEW.md` die nog openstaan en samen de basis-robuustheid verbeteren:

1. **E-mailvalidatie**: API-routes (o.a. `app/api/mail/send/route.ts`) valideren nu alleen met `.includes("@")`. Vervang door een echte regex-check of lichte validatie-utility (geen zware dependency nodig voor dit doel).
2. **Error boundaries**: `MailApp` heeft geen React error boundary. Eén onverwachte crash in bijv. `ThreadView` trekt nu de hele app onderuit i.p.v. een nette foutmelding te tonen.
3. **Basis testdekking**: er is geen enkel testframework in het project (alleen handmatige scripts `test:smtp`/`test:imap`). Voeg een lichte testrunner toe (bijv. `vitest`) en dek in elk geval `lib/send-service.ts` en `lib/mail-search.ts` (keyword-query, contact-extractie-parsing) af — dit zijn de plekken waar een regressie het meest schade doet (mail per ongeluk niet/verkeerd verstuurd, klantdata fout geëxtraheerd).

## Betrokken bestanden
- `app/api/mail/send/route.ts`, `app/api/mail/reply/route.ts`, `app/api/mail/forward/route.ts`
- `components/MailApp/MailApp.tsx` (error boundary wrapper)
- `package.json` (testrunner toevoegen)
- `lib/send-service.ts`, `lib/mail-search.ts` (nieuwe tests)
