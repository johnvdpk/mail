# Todo: Outreach — batch verzenden + globale dedup

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-schema-import.md`, `todo-outreach-personalize.md`, `todo-outreach-send-dedup.md`, `todo-outreach-reply-tracking.md`
**Afhankelijkheden:** `todo-outreach-schema-import.md` (tabellen + `OutreachPanel` + `lib/outreach/targets.ts`). Kan parallel met `todo-outreach-personalize.md` draaien: dit ticket kan losstaand een lead **zonder** AI-draft versturen (handmatig subject/body typen), en koppelt aan een AI-draft via een prop/interface die het personalize-ticket vult — zie "Gotcha's" hieronder over de contactpunten tussen beide tickets.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — Strato IMAP/SMTP, PostgreSQL (`pg`), Docker op VPS.
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules.

**Achtergrond:** Zie `todo-outreach-schema-import.md`. Dit ticket bouwt het verzend-pad: batch-selectie → review → versturen via het **bestaande** mailaccount van deze app (niet een los SMTP-kanaal zoals het oude `dashboard/`-project had), met een **globale** dedup-check (nooit twee keer naar hetzelfde e-mailadres, over alle campagnes heen — expliciete keuze, zie hieronder) vóór elke verzending.

**Kernregels:** zelfde als in `todo-outreach-schema-import.md`.

**Betrokken bestanden (lees deze als eerste):**
- `lib/mail/send-service.ts` — `sendNewMail({ to, subject, text, cc?, bcc?, attachments? }): Promise<{ messageId, to, subject }>`. Dit is de enige manier om te versturen — bouw geen tweede nodemailer-transport. Let op: deze functie zet de mail ook automatisch in de Sent-folder en synct die folder (`appendToSent` + `syncFolder`), dus de verzonden outreach-mail verschijnt vanzelf in de normale `messages`-tabel. Dat is precies wat `todo-outreach-reply-tracking.md` straks nodig heeft om replies te matchen — geen aparte tracking-tabel-sync nodig voor de uitgaande kant.
- `lib/outreach/targets.ts`, `lib/outreach/campaigns.ts` (schema-ticket) — hierop bouw je voort.
- **Alleen lezen, als referentie:**
  - `dashboard/lib/email-dedup.ts` — het bestaande dedup-mechanisme: `normalizeEmail`, "first in queue wins" bij dubbele adressen binnen een batch, blokkeren tegen mail-historie. Dit ticket zet dit om naar een **globale over-alle-campagnes** dedup-check (was in het dashboard impliciet al bijna dat, want er was maar één "campagne").
  - `dashboard/components/BatchReviewModal/BatchReviewModal.tsx` — batch-verzend-UI met per-mail voortgang, fouten tonen zonder de hele batch te laten stoppen.
  - `dashboard/components/EmailPreviewModal/EmailPreviewModal.tsx` — losse verzend-flow voor één lead.

## Wat er moet gebeuren

1. `campaign_sends` vullen bij elke verzending (schema staat al klaar uit het schema-ticket).
2. Globale dedup-check: vóór verzending (single én batch) controleren of `email_normalized` al ooit een niet-test `campaign_sends`-rij heeft, ongeacht welke campagne.
3. Batch-review-UI: selecteren → (optioneel AI-draft, anders handmatige tekst) → versturen, met per-mail voortgang en foutafhandeling die de batch niet blokkeert.
4. Status van de lead bijwerken (`emailed`/`excluded`/`not_interested`) — acties die in het schema-ticket nog ontbraken in de UI.

## Stappen

### 1. Globale dedup-check

**Bestand:** `lib/outreach/dedup.ts` (nieuw)

Wat er moet gebeuren:
- `findExistingSend(emailNormalized: string): Promise<CampaignSend | null>` — query op `campaign_sends JOIN campaign_targets` waar `email_normalized = $1 AND is_test = FALSE`, over alle campagnes (geen `campaign_id`-filter — dat is de expliciete keuze: nooit twee keer mailen naar hetzelfde adres, welk onderwerp dan ook).
- `assertNotDuplicate(emailNormalized: string): Promise<void>` — gooit een `Error` met Nederlandse melding (`"Dit adres is al benaderd op {datum} vanuit campagne {naam}"`) als er een match is. Gebruikt door de send-endpoint hieronder — geen silent skip, de aanroeper (batch-flow) vangt de fout per item af en gaat door met de rest.
- Her-gebruik `normalizeEmail` uit `lib/outreach/targets.ts` (niet opnieuw definiëren).

Acceptatiecriterium: een tweede verzendpoging naar een al-verzonden adres (ongeacht campagne) wordt geblokkeerd met een duidelijke melding.

---

### 2. Send-service voor outreach

**Bestand:** `lib/outreach/send.ts` (nieuw)

Wat er moet gebeuren:
- `sendOutreachMail(targetId: number, draft: { subject: string; text: string; html?: string }, options?: { isTest?: boolean }): Promise<CampaignSend>`:
  1. Haal target op, valideer dat 'ie een e-mailadres heeft.
  2. Als niet `isTest`: `assertNotDuplicate(target.emailNormalized)`.
  3. `sendNewMail({ to: target.email, subject: draft.subject, text: draft.text })` (uit `lib/mail/send-service.ts`).
  4. Insert in `campaign_sends` met het teruggekregen `messageId`.
  5. Als niet `isTest`: `updateTargetStatus(targetId, "emailed")`.
  6. Retourneer de nieuwe `campaign_sends`-rij.
- Test-verzendingen (`isTest: true`) slaan de dedup-check over en zetten de target-status niet op `emailed` — spiegelt hoe het dashboard `isTest`-mails behandelde (naar een vast testadres, telt niet mee voor dedup/tracking). Gebruik voor het testadres een env-var of een instelbaar veld in het campagneprofiel (`profile.testEmail`), niet een hardgecodeerd adres zoals het dashboard had (`info@aiadapt.nl`).

Acceptatiecriterium: versturen naar een nieuw adres zet een `campaign_sends`-rij neer, koppelt het messageId, en zet de target op `emailed`. Testverzending doet dat laatste niet.

---

### 3. API

**Bestanden:**
- `app/api/outreach/campaigns/[id]/targets/[targetId]/send/route.ts` — `POST`, body `{ subject, text, html?, isTest? }`, roept `sendOutreachMail` aan. Bij een dedup-fout: HTTP 409 met de Nederlandse melding uit `assertNotDuplicate`.
- `app/api/outreach/campaigns/[id]/targets/route.ts` (uitbreiden, uit schema-ticket) — `PATCH` voor status-wijzigingen (`excluded`/`not_interested`/terugzetten naar `new`), spiegelt `patchRow` in `dashboard/components/CampingDashboard/CampingDashboard.tsx`.

Acceptatiecriterium: een `POST` naar een al-benaderd adres geeft 409 met duidelijke Nederlandse foutmelding; de UI (stap 4) toont die melding zonder te crashen.

---

### 4. Batch-review-UI

**Bestanden:**
- `components/outreach/BatchSendModal/BatchSendModal.tsx` (+ `.module.css`) — poort van `dashboard/components/BatchReviewModal`: lijst geselecteerde leads met subject/body (uit AI-drafts indien aanwezig — accepteer een `drafts: Record<targetId, Draft>`-prop die leeg kan zijn als het personalize-ticket nog niet gedraaid heeft; leden zonder draft tonen een leeg, handmatig te vullen tekstveld i.p.v. te crashen), per-item verstuur-knop of "verstuur alles"-knop met voortgang (`current/total`), en dedup-conflicten duidelijk gemarkeerd (rood, met de reden) i.p.v. de hele batch te blokkeren.
- `components/outreach/OutreachPanel/OutreachPanel.tsx` (uitbreiden, uit schema/personalize-tickets) — bulk-actiebalk (selectie-teller, "Review & verstuur"-knop, "Wis selectie"), acties per rij (Mail/Skip/Nee-knoppen zoals in `dashboard/components/CampingDashboard/CampingDashboard.tsx`), stats-balkje (totaal/met e-mail/gemaild/uitgesloten/geen interesse) bovenaan het paneel.
- `components/outreach/EmailPreviewModal/EmailPreviewModal.tsx` (uit personalize-ticket, indien al aanwezig — anders hier zelf een minimale versie neerzetten met een verstuur-knop erin) — losse verzend-flow voor één lead, met dezelfde dedup-foutafhandeling.

Gebruik `apiRequest`/`useAsyncAction` voor alle fetches.

Acceptatiecriterium: een batch van 3 geselecteerde leads (met of zonder AI-draft) versturen toont per item een status (verzonden/mislukt/dedup-geblokkeerd), en de leadlijst-status/stats werken bij zonder page-reload.

---

## Gotcha's en beperkingen

- **Contactpunt met `todo-outreach-personalize.md`:** als beide tickets gelijktijdig lopen, kan er een merge-conflict ontstaan op `OutreachPanel.tsx` en `EmailPreviewModal.tsx`. Beide tickets breiden dezelfde bestanden uit — bij conflict: behoud beide functionaliteiten (personalisatie-knoppen + verstuur-knoppen), niet elkaars werk overschrijven. Als dit ticket als eerste draait en het personalize-ticket nog niet bestaat: laat de preview/batch-modals een optionele `onPersonalize`-prop hebben die `undefined` mag zijn (knop dan verborgen/disabled).
- Dedup is **globaal over campagnes**, met opzet — dit is een expliciete productkeuze (niet twee keer dezelfde persoon lastigvallen vanuit verschillende onderwerpen), geen bug als een lead in campagne B geblokkeerd wordt omdat 'ie in campagne A al gemaild is.
- `sendNewMail` heeft geen `html`-parameter in de huidige signature (alleen `text`) — check of dat voor outreach-mails volstaat (het dashboard stuurde ook primair plain-text met een text/html-wrap via nodemailer, maar hier loop je via de bestaande `sendMail`/`OutgoingMail`-laag). Als HTML echt nodig is voor de footer-opmaak, breid `OutgoingMail`/`sendNewMail` uit met een optioneel `html`-veld in `lib/mail/mail.ts` en `lib/mail/send-service.ts` — raak de bestaande call-sites niet stuk (param blijft optioneel).
- Geen reply-tracking hier — dat is `todo-outreach-reply-tracking.md`. `response_status` blijft op `pending` staan na verzending.

## Definitie van klaar

- [x] Eén lead versturen (met of zonder AI-draft) werkt en zet status op `emailed`
- [x] Batch versturen met per-item voortgang en foutafhandeling werkt
- [x] Globale dedup blokkeert een al-benaderd adres, met duidelijke Nederlandse melding, over campagnes heen
- [x] Testverzending omzeilt dedup en telt niet mee voor status/tracking
- [x] Skip/Geen-interesse-acties per lead werken en zijn omkeerbaar
- [x] Stats-balkje in `OutreachPanel` klopt na acties, zonder page-reload
- [x] `npm run lint`, `npm test`, `npx tsc --noEmit`, `npx next build` slagen
- [x] Geen bestand > 500 regels
