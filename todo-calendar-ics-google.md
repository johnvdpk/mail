# Todo: Agenda-ICS + Google Calendar (handmatig)

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-ai-sort-api.md`, `todo-ai-sort-ui.md`, `todo-calendar-ics-google.md`
**Afhankelijkheden:** geen (parallel met sort-API)

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — Strato IMAP/SMTP, geen Gmail als mailprovider. Google Calendar is een **aparte** OAuth-koppeling.
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules, mailparser, imapflow, pg.

**Kernregels:**
- **NOOIT automatisch accepteren** van agenda-uitnodigingen / RSVP — gebruiker handelt zelf
- Wel: ICS herkennen, details tonen, knop **“Zet in Google Agenda”** die pas event aanmaakt na klik
- OAuth-login: gebruiker koppelt zelf Google (UI-knop “Koppel Google Agenda”); sla refresh tokens veilig op server-side
- CSS modules + tokens uit `app/globals.css`; comments Engels; UI Nederlands
- API met `withAuth`

**Betrokken bestanden** (lees deze als eerste):
- `lib/sync.ts` — `loadBody`, `fetchAttachment` (ICS zit vaak als `text/calendar` attachment)
- `lib/types.ts` — `Attachment`, `MessageBody`, `ThreadMessage`
- `components/ThreadView/ThreadView.tsx` — MessageCard is de plek voor de ICS-banner
- `components/ThreadView/ThreadView.module.css`
- `lib/env.ts` — env helpers
- `.env.example` — documenteer nieuwe Google env vars
- `lib/schema.sql` + `scripts/migrate.ts` — voor token-opslag tabel
- `lib/with-auth.ts`

## Wat er moet gebeuren

1) Detecteer en parse ICS/`text/calendar` in mails. 2) Toon een banner met meeting-details. 3) Google OAuth-koppeling + knop om het event handmatig in Google Calendar te zetten. Geen auto-RSVP, geen auto-insert bij openen van de mail.

## Stappen

### 1. ICS parser

**Bestand:** `lib/ics.ts` (nieuw)

Wat er moet gebeuren:
- Parse minimale VEVENT-velden uit ICS-tekst: `summary`, `dtstart`, `dtend`, `location`, `description`, `organizer`, `uid`, `url` / conference link indien aanwezig
- Geen zware dependency tenzij nodig; een kleine parser of lichte lib is ok (vermijd enorme calendar-frameworks)
- Export type `CalendarInvite` + `parseIcs(raw: string): CalendarInvite | null`
- Ondersteun `text/calendar` content en `.ics` attachments

Acceptatiecriterium: Unit-achtige voorbeelden in comments of een kleine test-script; geldige ICS → typed object.

---

### 2. ICS uit body laden

**Bestanden:** `lib/sync.ts` en/of nieuw `lib/calendar-invite.ts`

Wat er moet gebeuren:
- Bij `loadBody` / of aparte helper: als attachment `contentType` bevat `text/calendar` of filename eindigt op `.ics`, haal raw content op (via bestaande fetch/parse van mailparser — `parsed.attachments[].content`)
- Breid `MessageBody` of `ThreadMessage` uit met optioneel `calendarInvite?: CalendarInvite` (alleen metadata, geen raw secrets)
- Zorg dat attachment-metadata in cache nog steeds werkt; raw ICS hoeft niet permanent in DB als je on-demand kunt parsen, maar metadata op de thread-detail response is handig voor de UI

Acceptatiecriterium: Thread detail van een invite-mail bevat parsebare invite-data voor de UI.

---

### 3. Invite-banner in ThreadView

**Bestanden:**
- `components/ThreadView/ThreadView.tsx`
- `components/ThreadView/ThreadView.module.css`
- eventueel `components/CalendarInviteBanner/CalendarInviteBanner.tsx` + `.module.css`

Wat er moet gebeuren:
- Boven de message body (of boven attachments): banner met titel, datum/tijd (nl-NL), locatie/meet-link
- Knoppen:
  - **“Zet in Google Agenda”** — alleen actief als Google gekoppeld is; anders toon “Koppel eerst Google Agenda” / link naar settings
  - Geen auto-accept
  - Optioneel later: “Download .ics” via bestaande attachment-link is al genoeg
- **Geen** automatische RSVP-mail bij openen
- Als je Accept/Weiger toont: die mogen alleen na expliciete klik iets doen; default liever weglaten in v1 en alleen “Zet in Google Agenda”

Acceptatiecriterium: Invite-mail toont banner; niets gebeurt tot de gebruiker klikt.

---

### 4. Google OAuth + token opslag

**Bestanden:**
- `lib/schema.sql` — tabel bijv. `google_tokens` (single-user: id=1, refresh_token, access_token, expiry, email, updated_at)
- `scripts/migrate.ts` — zorg dat migratie de tabel aanmaakt (volg bestaand migrate-patroon)
- `lib/google-calendar.ts` — OAuth URL, token exchange, refresh, `createEvent(invite)`
- `app/api/google/connect/route.ts` — start OAuth redirect
- `app/api/google/callback/route.ts` — callback, sla tokens op, redirect terug naar app
- `app/api/google/status/route.ts` — `{ connected: boolean, email?: string }`
- `app/api/google/disconnect/route.ts` — tokens wissen
- `.env.example` — documenteer:
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
```
- Scopes: minimaal `https://www.googleapis.com/auth/calendar.events` (niet full mail)

Acceptatiecriterium: Gebruiker kan koppelen/ontkoppelen; tokens staan in Postgres, niet in localStorage.

---

### 5. API: event handmatig aanmaken

**Bestand:** `app/api/calendar/add/route.ts` (nieuw)

Wat er moet gebeuren:
- `POST` met invite payload of `{ folder, uid }` zodat server ICS opnieuw kan laden/parsen
- Maakt Google Calendar event via Calendar API
- Return `{ ok: true, htmlLink?: string }`
- Als niet gekoppeld → 401/400 met duidelijke NL-fout
- **Geen** RSVP naar de organisator tenzij later expliciet gebouwd

Acceptatiecriterium: Eén klik vanuit UI → event in Google Calendar; geen side effects zonder klik.

---

### 6. Settings UI voor Google-koppeling

**Bestanden:** `components/MailConfigEditor/MailConfigEditor.tsx` (+ css) of klein blok in settings in MailApp

Wat er moet gebeuren:
- Sectie “Google Agenda”: status gekoppeld/niet, knop Koppelen / Ontkoppelen
- Korte uitleg: “Uitnodigingen worden niet automatisch geaccepteerd. Je zet ze zelf in je agenda.”

Acceptatiecriterium: Zichtbaar in bestaande settings; werkt met status-endpoint.

---

## Gotcha's en beperkingen

- Mail blijft via Strato; Google is alleen Calendar
- Timezones in ICS (`DTSTART;TZID=...` / UTC `Z`) correct naar Google `dateTime` + `timeZone` mappen
- Sla geen client secret in frontend
- Raak AI-sort endpoints/UI niet aan
- Installeer `googleapis` alleen als nodig; anders raw fetch naar Google endpoints is ook ok — kies de kleinste nette oplossing
- `AUTH_SECURE` / productie redirect URI vermelden in `.env.example` comments

## Definitie van klaar

- [ ] ICS-invites worden herkend en getoond in ThreadView
- [ ] Geen auto-accept / auto-insert
- [ ] Google OAuth koppelen/ontkoppelen werkt
- [ ] “Zet in Google Agenda” maakt event na klik
- [ ] Env vars gedocumenteerd in `.env.example`
- [ ] Migratie voor token-tabel
- [ ] Geen TypeScript errors
- [ ] CSS modules, tokens uit globals.css
