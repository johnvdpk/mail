# Todo: Outreach — schema, campagnes, leads-import (fundament)

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-schema-import.md`, `todo-outreach-personalize.md`, `todo-outreach-send-dedup.md`, `todo-outreach-reply-tracking.md`
**Afhankelijkheden:** geen — dit is het fundament. De andere drie bestanden in de reeks hebben dit bestand nodig (schema + panel + campagne-model moeten bestaan) voordat ze kunnen starten.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — Strato IMAP/SMTP, PostgreSQL (`pg`), draait in Docker op een VPS.
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules, `pg`, `mailparser`, `imapflow`, `nodemailer`.

**Achtergrond:** Er stond een los "dashboard" (`dashboard/`, eigen Next.js-app, NIET aanraken/verwijderen in dit ticket) dat outreach-mails stuurde naar campings (leads gescraped uit OpenStreetMap door `camping-scraper/`, ook niet aanraken). Dat dashboard had AI-personalisatie, batch-verzending, dedup en reply-tracking, maar sloeg alles op in losse JSON-bestanden en had een eigen IMAP/SMTP-implementatie los van deze mailapp.

Dit ticket bouwt het **fundament** voor een generiek `outreach`-domein in déze mailapp: niet camping-specifiek, herbruikbaar voor een willekeurig toekomstig onderwerp waar je veel mail voor moet versturen/bijhouden. Campings wordt straks gewoon de eerste "campagne" met een eigen leads-import.

**Kernregels (uit `CLAUDE.md`, gelden onverkort):**
- Domain-based structuur: nieuw domein `outreach` → `app/api/outreach/`, `lib/outreach/`, `components/outreach/`.
- Max ~500 regels/bestand (harde lint-regel `max-lines`). Splits vroeg, niet met een `eslint-disable`.
- Geen DIY: gebruik bewezen libraries. `cheerio` mag toegevoegd worden voor HTML-parsing (wordt in het volgende ticket gebruikt, maar zet 'm hier al in `package.json` als je 'm nu al nodig hebt — anders in het personalize-ticket).
- Nederlands: UI-teksten, foutmeldingen richting gebruiker, commit messages. Engels: code, identifiers, comments.
- `apiRequest<T>` + `useAsyncAction` voor elke client-side JSON-fetch naar een eigen API-route (zie `lib/shared/api-request.ts`, `lib/shared/use-async-action.ts`).
- Server-side logging via `logger` uit `lib/shared/logger.ts` (nooit `console.error`/`console.log` in `app/api/`). Nooit pino importeren in een `"use client"`-bestand.

**Betrokken bestanden (lees deze als eerste):**
- `lib/schema.sql` — bestaand schema, `CREATE TABLE IF NOT EXISTS`-stijl, geen aparte migratietool. Nieuwe tabellen hier onderaan toevoegen.
- `scripts/migrate.ts` + `scripts/migrate.mjs` — hoe migraties nu draaien (`npm run db:migrate`). Volg dit patroon, bouw niets nieuws.
- `lib/shared/db.ts` — `query`/`queryOne` helpers, gebruik die (geen losse `pg`-client opzetten).
- `components/MailApp/MailApp.tsx` en `components/MailApp/useMailAppState.ts` — hoe bestaande panelen (Tickets/Notes/Projects) als `showX`/`setShowX`-paar zijn opgezet en in de layout gerenderd worden. Volg exact dit patroon voor Outreach.
- `components/tickets/hooks/useTicketsState.ts` en `components/tickets/TicketsPanel/TicketsPanel.tsx` — beste referentie-voorbeeld: vergelijkbare CRUD-lijst + panel-structuur.
- `components/mail/FolderRail/FolderRail.tsx` — waar de nav-iconen voor Notes/Tickets/Projects staan; hier komt een Outreach-icoon bij.
- `lib/auth/auth.ts` — `requireAuth()`/`withAuth`-patroon voor API-routes.
- Referentie voor het te vervangen JSON-model (alleen lezen, niet aanraken): `dashboard/lib/types.ts`, `dashboard/lib/campings.ts`, `dashboard/lib/email-config.ts`, `dashboard/lib/email-dedup.ts`.

## Wat er moet gebeuren

Drie Postgres-tabellen, een migratie, een leads-upload-flow (JSON-bestand → database), en de kale Outreach-tab in de navigatie (lijst + campagne-switcher, nog zonder AI/verzenden — dat komt in de volgende tickets).

## Stappen

### 1. Schema

**Bestand:** `lib/schema.sql` (uitbreiden, onderaan toevoegen)

```sql
-- Outreach: generieke campagne-gebaseerde leadlijst + AI-personalisatieprofiel
CREATE TABLE IF NOT EXISTS campaigns (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  profile     JSONB NOT NULL DEFAULT '{}',  -- tone of voice, snippets, segments, promises, subject lines (zie personalize-ticket)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eén rij per lead binnen een campagne. attributes bevat alles wat per campagne-type
-- verschilt (voor campings: qualityScore, bookingType, signals, ...) zodat een nieuw
-- onderwerp geen nieuwe tabel nodig heeft.
CREATE TABLE IF NOT EXISTS campaign_targets (
  id                 SERIAL PRIMARY KEY,
  campaign_id        INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  email              TEXT NOT NULL,
  email_normalized   TEXT NOT NULL,  -- lower(trim(email)), voor dedup-lookups
  name               TEXT NOT NULL,
  website            TEXT,
  status             TEXT NOT NULL DEFAULT 'new',  -- new | emailed | excluded | not_interested
  attributes         JSONB NOT NULL DEFAULT '{}',
  imported_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  emailed_at         TIMESTAMPTZ,
  excluded_at        TIMESTAMPTZ,
  not_interested_at  TIMESTAMPTZ,

  UNIQUE (campaign_id, email_normalized)
);

CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign ON campaign_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_email_normalized ON campaign_targets(email_normalized);

-- Verzonden outreach-mails. message_id is onze eigen RFC Message-ID (van sendNewMail),
-- gebruikt door het reply-tracking-ticket om inbound replies te matchen.
CREATE TABLE IF NOT EXISTS campaign_sends (
  id               SERIAL PRIMARY KEY,
  target_id        INTEGER NOT NULL REFERENCES campaign_targets(id) ON DELETE CASCADE,
  message_id       TEXT NOT NULL,
  subject          TEXT NOT NULL,
  body_text        TEXT NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_test          BOOLEAN NOT NULL DEFAULT FALSE,
  response_status  TEXT NOT NULL DEFAULT 'pending',  -- pending | replied | no_interest | deal
  response_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_target ON campaign_sends(target_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_message_id ON campaign_sends(message_id);
```

Belangrijk: `UNIQUE (campaign_id, email_normalized)` voorkomt dubbele leads **binnen** een campagne (import-dedup). De **globale** dedup (nooit twee keer naar hetzelfde adres, over alle campagnes heen) is een query, geen constraint — zie stap 4.

Acceptatiecriterium: `npm run db:migrate` maakt de drie tabellen aan zonder fouten, herhaald draaien is idempotent (`IF NOT EXISTS`).

---

### 2. `lib/outreach/campaigns.ts`

**Bestand:** nieuw

Wat er moet gebeuren:
- `listCampaigns()`, `getCampaign(id)`, `createCampaign({ name, slug })`, `updateCampaignProfile(id, profile)` — CRUD via `query`/`queryOne` uit `lib/shared/db.ts`.
- Types: `Campaign = { id, name, slug, profile: CampaignProfile, createdAt, updatedAt }`. `CampaignProfile` mag in dit ticket een leeg/minimaal type zijn (`Record<string, unknown>` of een kale shape) — het personalize-ticket vult 'm concreet in met tone-of-voice/snippets/segments. Zet een duidelijke `// TODO(outreach-personalize): concrete shape` comment neer zodat het volgende ticket weet waar het moet uitbreiden.
- Slug: afgeleid van naam (kebab-case), moet uniek zijn — geef een Nederlandse foutmelding terug als een slug al bestaat.

Acceptatiecriterium: een campagne "Campings" aanmaken en ophalen werkt end-to-end via een test-script of de API uit stap 5.

---

### 3. `lib/outreach/targets.ts`

**Bestand:** nieuw

Wat er moet gebeuren:
- `normalizeEmail(email: string): string` — trim + lowercase (spiegelt `dashboard/lib/email-dedup.ts`, maar hoort nu in dit domein, niet gekopieerd van het dashboard).
- `listTargets(campaignId, filters?)` — met simpele filters: status, zoekterm (naam/email/website), net als de tabel in `dashboard/components/CampingDashboard/CampingDashboard.tsx` maar dan server-side query i.p.v. client-side array-filter (schaalt beter, en de leadlijst kan groot worden).
- `importTargets(campaignId, rows: { email: string; name: string; website?: string; attributes?: Record<string, unknown> }[])`: bulk-insert met `ON CONFLICT (campaign_id, email_normalized) DO NOTHING` (of `DO UPDATE` om attributes te verversen bij re-import — kies `DO UPDATE SET attributes = EXCLUDED.attributes, name = EXCLUDED.name` zodat een herimport van `campings.json` bestaande leads bijwerkt zonder de status/emailed_at te overschrijven). Retourneer `{ imported: number, updated: number, skipped: number }`.
- `updateTargetStatus(targetId, status: "new" | "emailed" | "excluded" | "not_interested")` — zet het bijbehorende `*_at`-veld, spiegelt `toggleEmailed`/`toggleExcluded`/`toggleNotInterested` uit het dashboard.

Acceptatiecriterium: een array van camping-achtige objecten importeren resulteert in unieke rijen per e-mailadres binnen de campagne; een tweede import met dezelfde data levert 0 nieuwe rijen op.

---

### 4. Import-endpoint + upload-UI

**Bestanden:**
- `app/api/outreach/campaigns/route.ts` — `GET` (lijst), `POST` (aanmaken)
- `app/api/outreach/campaigns/[id]/targets/route.ts` — `GET` (lijst met filters via query params), `POST` (import — zie hieronder)
- `components/outreach/OutreachPanel/OutreachPanel.tsx` (+ `.module.css`) — hoofdpaneel: campagne-switcher bovenaan (dropdown of tabs, met "Nieuwe campagne" knop), daaronder een leads-tabel (naam, e-mail, website, status — géén acties nog, die komen in het send-ticket) en een "Importeer leads"-knop.
- `components/outreach/ImportLeadsModal/ImportLeadsModal.tsx` (+ `.module.css`) — modal met file-input (`.json`), leest client-side, valideert minimaal `email`+`name` per rij, stuurt via `apiRequest` naar de import-route. Toon Nederlandse foutmelding per ongeldige rij (bv. "3 rijen zonder e-mailadres overgeslagen"), geen harde crash op één kapotte rij.

Wat de import-route moet doen:
- Body: `{ rows: { email: string; name: string; website?: string; attributes?: Record<string, unknown> }[] }`.
- Valideer met bestaande `lib/shared/email-validation.ts` (niet zelf een regex verzinnen — regel 3, geen DIY).
- Roep `importTargets` aan, retourneer de counts.
- Dit is bewust generiek: het weet niets van "camping.json"-shape. De upload-UI (of de gebruiker, handmatig) is verantwoordelijk om `camping-scraper/output/campings.json` (`osmId, name, email, scrapedEmail, website, finalUrl, qualityScore, bookingType, signals, ...`) vóór upload te mappen naar `{ email, name, website, attributes: { qualityScore, bookingType, signals, ... } }`. Bouw **geen** camping-specifieke mapper in de mailapp — dat zou het generieke ontwerp meteen weer camping-specifiek maken. Documenteer dit mapping-voorbeeld kort in de modal (of een placeholder/voorbeeldbestand) zodat het duidelijk is hoe een export eruit moet zien.

Acceptatiecriterium: een klein test-JSON-bestand (5 leads) uploaden via de UI toont ze in de tabel; nogmaals uploaden met 1 nieuw + 4 bestaand adres importeert er precies 1 nieuw.

---

### 5. Navigatie-integratie

**Bestanden:**
- `components/outreach/hooks/useOutreachState.ts` (nieuw) — spiegelt `components/tickets/hooks/useTicketsState.ts`: `showOutreach`, `setShowOutreach`, `campaigns`, `activeCampaignId`, `openOutreach()` / `resetOutreachPanel()`.
- `components/MailApp/useMailAppState.ts` — `useOutreachState` erbij composen, precies zoals `tickets`/`notes`/`projects` nu al gebeurt (inclusief: bij het openen van Outreach de andere panelen sluiten, en vice versa — zie regel 98-116 in het huidige bestand voor het patroon).
- `components/MailApp/MailApp.tsx` — `<OutreachPanel />` conditioneel renderen zoals `<TicketsPanel />`.
- `components/mail/FolderRail/FolderRail.tsx` (+ `.module.css`) — nieuw nav-icoon "Outreach" naast Tickets/Notes/Projects.

Acceptatiecriterium: klikken op het Outreach-icoon opent het paneel, sluit andere panelen, en toont de (lege) campagnelijst.

---

## Gotcha's en beperkingen

- Raak `dashboard/` en `camping-scraper/` niet aan — die blijven bestaan als losstaand, ongebruikt archief totdat de gebruiker besluit ze op te ruimen. Dit ticket kopieert concepten, geen code 1-op-1 (andere conventies: `apiRequest`, `lib/shared/db.ts`, Nederlandse UI-teksten met Engelse identifiers).
- Geen AI, geen verzenden, geen dedup-check-bij-verzenden in dit ticket — dat zijn de volgende twee tickets. Dit ticket levert alleen het fundament: schema + campagnes + leads-import + lege lijst-UI.
- `attributes JSONB` heeft geen vast schema — bouw de leads-tabel-UI dus generiek (toon eventueel een paar veelvoorkomende sleutels als kolom, of een simpele "details"-uitklap per rij), niet hardgecodeerd op camping-velden.
- Volg het bestaande migratie-patroon exact (`scripts/migrate.ts`) — bouw geen nieuwe migratietool.

## Definitie van klaar

- [x] `campaigns`, `campaign_targets`, `campaign_sends` tabellen via `npm run db:migrate`
- [x] Campagne aanmaken via UI werkt
- [x] Leads-JSON uploaden en importeren werkt, met dedup binnen de campagne
- [x] Outreach-tab zichtbaar in navigatie, opent/sluit correct t.o.v. andere panelen
- [x] Leads-tabel toont geïmporteerde rijen (naam, e-mail, website, status)
- [x] `npm run lint`, `npm test`, `npx tsc --noEmit`, `npx next build` slagen allemaal
- [x] Geen bestand > 500 regels
