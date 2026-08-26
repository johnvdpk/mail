# Todo: Outreach — reply-tracking (via bestaande mail-sync) + reply-drafts

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-schema-import.md`, `todo-outreach-personalize.md`, `todo-outreach-send-dedup.md`, `todo-outreach-reply-tracking.md`
**Afhankelijkheden:** `todo-outreach-schema-import.md` (tabellen, `OutreachPanel`) én `todo-outreach-send-dedup.md` (`campaign_sends` moet gevuld worden bij verzending, anders is er niets om replies tegen te matchen). Voer dit ticket dus als laatste van de reeks uit.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — Strato IMAP/SMTP, PostgreSQL (`pg`), Docker op VPS.
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules.

**Achtergrond:** Zie `todo-outreach-schema-import.md`. Het oude, losse `dashboard/`-project had een **eigen IMAP-poller** (`dashboard/lib/inbox-sync.ts`) die apart de inbox afstruinde om replies te matchen aan verzonden mail. Dat is hier **niet nodig**: omdat outreach-mail nu via het bestaande mailaccount van deze app verstuurd wordt (`sendNewMail`, zie het send-ticket), komt een inbound reply gewoon via de normale, al bestaande IMAP-sync (`lib/mail/sync.ts`) binnen in de `messages`-tabel — net als elke andere mail. Dit ticket voegt alleen een **matchstap** toe die al-gesynchroniseerde `messages` koppelt aan `campaign_sends`, en hangt die in het bestaande onderhouds-job-systeem (`processMailJobs`).

**Kernregels:** zelfde als in `todo-outreach-schema-import.md`.

**Betrokken bestanden (lees deze als eerste):**
- `lib/mail/mail-jobs.ts` — `processMailJobs()`: bestaand periodiek onderhoud (snoozes wekken, follow-ups, scheduled sends, semantic search-jobs, embedding-backfill). Voeg hier een `matchOutreachReplies()`-stap aan toe — bouw geen nieuwe cron/poller, dit systeem draait al periodiek (zie `app/api/mail-jobs/route.ts`, `GET` triggert `processMailJobs()`).
- `lib/schema.sql` — kolommen `messages.message_id`, `messages.in_reply_to`, `messages."references"` (array), `messages.from_email`. Dit is precies wat nodig is voor matching, al aanwezig, geen schema-wijziging nodig.
- `lib/shared/db.ts` — `query`/`queryOne`.
- `lib/shared/normalize.ts` — bevat al `normalizeMessageId` (check dit voordat je 'm opnieuw definieert in `lib/outreach/` — hergebruik als die functie hier al staat).
- `lib/outreach/targets.ts`, campaign_sends-inserts uit het send-ticket.
- **Alleen lezen, als referentie:**
  - `dashboard/lib/inbox-sync.ts` — de matchlogica (`resolveMatch`: eerst op message-id via In-Reply-To/References, dan op from-adres) is het overnemen waard qua **matchstrategie**, maar niet qua **implementatie** (geen eigen IMAP-client/state-bestand hier — dit ticket queryt de al-gesynchroniseerde `messages`-tabel).
  - `dashboard/lib/sent-mails.ts` (`appendThreadMessage`, `findSentMailByMessageId`, `collectOutboundMessageIds`) — thread-opbouw en status-transitie-logica (`pending` → `replied` bij eerste inbound).
  - `dashboard/lib/ai-personalize.ts` (`personalizeReplyDraft`, al geport in `todo-outreach-personalize.md` naar `lib/outreach/personalize.ts` — als dat ticket al gedaan is, hergebruik die functie hier).
  - `dashboard/components/SentMailsPanel/SentMailsPanel.tsx` — UI-referentie voor de verzonden-mails-lijst met thread/response-status.

## Wat er moet gebeuren

1. Matchstap die inbound `messages` koppelt aan `campaign_sends` (via message-id-threading, fallback op from-adres), en `response_status` bijwerkt.
2. Inhaken in `processMailJobs()`.
3. UI: "Verzonden"-tab in `OutreachPanel` met thread-weergave + response-status, en handmatige status-override (afronden/opvolging/deal).
4. Reply-draft-generatie (afronden/opvolging) hergebruikt vanuit het personalize-ticket.

## Stappen

### 1. Matchlogica

**Bestand:** `lib/outreach/reply-tracking.ts` (nieuw)

Wat er moet gebeuren:
- `matchOutreachReplies(): Promise<{ matched: number; errors: string[] }>`:
  - Haal alle `campaign_sends` op met `response_status = 'pending' AND is_test = FALSE` (of alle niet-`deal`/niet-`no_interest` sends — laat `replied` ook opnieuw gecheckt worden voor een ván-thread vervolgbericht, zie punt hieronder over meerdere replies).
  - Voor elke send: query `messages` op `in_reply_to = message_id` OR `message_id = ANY("references")` (gebruik `normalizeMessageId` uit `lib/shared/normalize.ts` consistent aan beide kanten — headers hebben soms wel/niet `<...>`-haken).
  - Fallback als geen header-match: `messages.from_email = target.email_normalized AND date > send.sent_at` (spiegelt de from-adres-fallback in `dashboard/lib/inbox-sync.ts`).
  - Bij match: zet `campaign_sends.response_status = 'replied'` (alleen als 'ie nog `pending` was — niet overschrijven als een gebruiker 'm handmatig al op `deal`/`no_interest` heeft gezet) en `response_at = messages.date`.
  - Dit hoeft geen aparte "thread"-tabel te onderhouden zoals het dashboard deed (`sent-mails.json.thread[]`) — de volledige conversatie staat al gewoon in `messages`/`bodies`, gekoppeld via het bestaande thread-mechanisme van deze app (check `lib/mail/threads.ts`/`lib/mail/thread-utils.tsx` hoe threads normaal worden opgebouwd, en hergebruik dat voor de UI in stap 3 in plaats van een eigen thread-array bij te houden).
- Idempotent: opnieuw draaien op al-gematchte sends mag geen dubbele effecten hebben.

Acceptatiecriterium: een test-fixture met een `campaign_sends`-rij en een bijpassend `messages`-record (met `in_reply_to` gezet op het verzonden `message_id`) resulteert na `matchOutreachReplies()` in `response_status = 'replied'`.

---

### 2. Inhaken in mail-jobs

**Bestand:** `lib/mail/mail-jobs.ts` (uitbreiden)

Wat er moet gebeuren:
- In `processMailJobs()`: naast de bestaande stappen (zie het `try`/`import`-patroon dat al gebruikt wordt voor `mail-search` en `embeddings` — volg exact dat patroon: dynamische import + try/catch zodat een fout in outreach-matching de rest van de jobs niet blokkeert):
  ```ts
  let outreachReplies = { matched: 0, errors: [] as string[] };
  try {
    const { matchOutreachReplies } = await import("../outreach/reply-tracking");
    outreachReplies = await matchOutreachReplies();
  } catch (err) {
    console.error("[mail-jobs] outreach replies", err);
  }
  ```
  (gebruik hier `logger` uit `lib/shared/logger.ts` i.p.v. `console.error`, consistent met regel 7 — check hoe de rest van dit bestand na de logging-migratie-commit (`8060838`) inmiddels logt en volg dat, niet de oude `console.error`-voorbeelden die hierboven ter illustratie staan)
- Retourneer `outreachReplies` in het resultaat-object van `processMailJobs()`.

Acceptatiecriterium: `GET /api/mail-jobs` bevat na afloop een `outreachReplies`-veld, en een handmatig aangemaakte reply-fixture wordt bij de eerstvolgende job-run gematcht.

---

### 3. "Verzonden"-tab UI

**Bestanden:**
- `app/api/outreach/campaigns/[id]/sends/route.ts` (nieuw) — `GET`, lijst van `campaign_sends` voor de campagne met target-info en response-status, `PATCH` voor handmatige status-override (`replied`/`no_interest`/`deal`/terug naar `pending`).
- `components/outreach/SentPanel/SentPanel.tsx` (+ `.module.css`) — poort van `dashboard/components/SentMailsPanel`: lijst verzonden mails met status-badge, klik opent de bijbehorende thread (hergebruik het bestaande `ThreadView`-component / thread-detail-endpoint van de mailapp in plaats van een eigen thread-weergave te bouwen — dit is exact waarom reply-tracking via de bestaande `messages`-tabel loopt: de normale mail-UI kan de conversatie al tonen).
- `components/outreach/OutreachPanel/OutreachPanel.tsx` (uitbreiden) — derde subtab "Verzonden" naast de leadlijst en het campagneprofiel.

Acceptatiecriterium: de Verzonden-tab toont alle outreach-sends met actuele status; klikken op een gematchte reply opent de echte mailthread.

---

### 4. Reply-drafts (afronden/opvolging)

**Bestanden:**
- `app/api/outreach/campaigns/[id]/sends/[sendId]/reply-draft/route.ts` (nieuw) — `POST` met `{ intent: "afronden" | "opvolging" }`, roept `personalizeReplyDraft` aan (uit `lib/outreach/personalize.ts`, personalize-ticket — als dat ticket nog niet gedraaid heeft, implementeer een minimale variant hier en laat een `// TODO(outreach-personalize)`-comment staan voor samenvoeging later, i.p.v. te wachten).
- `components/outreach/SentPanel/SentPanel.tsx` (uitbreiden) — knoppen "Genereer reply: afronden" / "opvolging" bij een `replied`-item, toont het concept, gebruiker verstuurt via de **bestaande** reply-flow van de mailapp (`lib/mail/send-service.ts`'s `sendThreadReply`, gekoppeld aan de echte thread) — niet een parallel verzendpad bouwen, dit is een gewone reply op een gewone thread.

Acceptatiecriterium: bij een `replied`-send kan een reply-concept gegenereerd worden en verzonden via de normale thread-reply-functionaliteit van de app.

---

## Gotcha's en beperkingen

- Bouw **geen** nieuwe IMAP-poller, state-bestand of cron — alles hangt aan de al bestaande sync (`lib/mail/sync.ts`) en het al bestaande job-systeem (`processMailJobs`). Als dat je op enig moment tegenhoudt (bv. sync-timing), los het op door de matchfrequentie van `processMailJobs` te bekijken, niet door een tweede sync-pad te bouwen.
- `response_status`-overschrijving: een handmatige gebruikers-override (bv. naar `deal`) mag nooit door een latere automatische match teruggezet worden naar `replied` — check in `matchOutreachReplies` dat je alleen vanuit `pending` naar `replied` gaat, nooit andersom.
- Een lead kan meerdere keren reageren (heen-en-weer-thread) — dit hoeft niet meerdere `campaign_sends`-rijen te worden; de conversatie leeft in de normale `messages`-tabel, `campaign_sends` houdt alleen de outreach-status bij (pending/replied/no_interest/deal), niet elk los bericht.
- Raak de kern-sync (`lib/mail/sync.ts`) zelf niet aan — dit ticket leest er alleen uit, wijzigt 'm niet.

## Definitie van klaar

- [x] `matchOutreachReplies()` matcht inbound mail aan `campaign_sends` via message-id-threading, met from-adres-fallback
- [x] Matching draait via `processMailJobs()`, geen aparte poller
- [x] Handmatige status-override overschrijft nooit stilzwijgend automatisch
- [x] Verzonden-tab toont status + opent echte mailthread bij een reply
- [x] Reply-draft-generatie (afronden/opvolging) werkt en verstuurt via de bestaande thread-reply-flow
- [x] `npm run lint`, `npm test`, `npx tsc --noEmit`, `npx next build` slagen
- [x] Geen bestand > 500 regels
