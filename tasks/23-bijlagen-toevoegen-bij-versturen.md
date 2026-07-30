# Taak 23: Bijlagen kunnen toevoegen bij versturen/beantwoorden

**Status:** done
**Fase:** 6 — Review-opvolging (kernfunctionaliteit mail)
**Prioriteit:** High
**Geschatte inspanning:** 3-4 uur

## Omschrijving
Live test liet zien dat er nergens een manier is om een bestand toe te voegen aan een nieuwe mail, reply of forward. `ComposeDialog.tsx` en `Composer.tsx` hebben geen file-input; bijlagen kunnen alleen worden bekeken/gedownload uit ontvangen mail. Voor een mailclient is dit een ontbrekende kernfunctie, geen nice-to-have.

Voeg een file-input toe aan `ComposeDialog`, `Composer` (reply) en `ForwardDialog`. Bestanden moeten als multipart/form-data of base64 naar de bijbehorende API-routes (`/api/mail/send`, `/api/mail/reply`, `/api/mail/forward`) en vandaar als nodemailer-attachments worden meegestuurd. Denk aan een redelijke maximale bestandsgrootte en duidelijke foutmelding als die wordt overschreden.

## Betrokken bestanden
- `components/ComposeDialog/ComposeDialog.tsx`, `ForwardDialog.tsx`
- `components/Composer/Composer.tsx`
- `app/api/mail/send/route.ts`, `app/api/mail/reply/route.ts`, `app/api/mail/forward/route.ts`
- `lib/send-service.ts`
