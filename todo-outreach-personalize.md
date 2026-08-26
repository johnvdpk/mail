# Todo: Outreach — campagneprofiel + AI-personalisatie

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-schema-import.md`, `todo-outreach-personalize.md`, `todo-outreach-send-dedup.md`, `todo-outreach-reply-tracking.md`
**Afhankelijkheden:** `todo-outreach-schema-import.md` (tabellen `campaigns`/`campaign_targets`, `lib/outreach/campaigns.ts`, `lib/outreach/targets.ts`, `OutreachPanel` moeten al bestaan). Kan parallel met `todo-outreach-send-dedup.md` als die zijn eigen UI-vlak niet laat afhangen van AI-drafts (zie dat bestand).

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — Strato IMAP/SMTP, PostgreSQL (`pg`), Docker op VPS.
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules.

**Achtergrond:** Zie `todo-outreach-schema-import.md` voor de volledige achtergrond van dit outreach-domein. Dit ticket portteert de AI-personalisatie-logica van het losse `dashboard/`-project (alleen lezen, niet aanraken) naar het nieuwe `lib/outreach/`-domein, en maakt 'm generiek: geen "camping" meer hardgecodeerd, maar een campagne-config (`campaigns.profile`) die per campagne anders kan zijn.

**Kernregels:** zelfde als in `todo-outreach-schema-import.md` — domain-structuur, max 500 regels/bestand, geen DIY (cheerio voor HTML-parsing), NL/EN taalscheiding, `apiRequest`/`useAsyncAction`, `logger` server-side.

**Betrokken bestanden (lees deze als eerste):**
- `lib/ai/openrouter.ts` — `chatCompletion(messages, options)`, `isOpenRouterConfigured()`. Zelfde signature als het dashboard's eigen `dashboard/lib/openrouter.ts` — dit is een drop-in vervanging, geen nieuwe client bouwen.
- `lib/ai/humanize-text.ts` — bestaande tekst-opschoning (vergelijk met `dashboard/lib/humanize-text.ts`; check of de dashboard-versie extra regels heeft die hier nog ontbreken, bv. het weren van streepjes/puntkomma's, en voeg ontbrekende regels toe in plaats van een tweede humanizer te bouwen).
- **Alleen lezen, als referentie voor de portering:**
  - `dashboard/lib/ai-personalize.ts` — de kern: system-prompt-opbouw, JSON-parsing met fallback-strategieën, reply-draft-generatie.
  - `dashboard/lib/website-scan.ts` — regex-based detectie van boekingsplatforms/keten-signalen/hooks uit ruwe HTML. Dit is domeinloos genoeg (werkt op willekeurige HTML) om vrijwel 1-op-1 over te nemen, maar de platform/hook-lijsten (`BOOKING_PLATFORMS`, `HOOK_KEYWORDS`, ...) zijn camping-specifiek en horen dus niet hardgecodeerd in de generieke `lib/outreach/`-laag — zie stap 2.
  - `dashboard/lib/website-content.ts` — website ophalen + tekst extraheren met `cheerio`.
  - `dashboard/lib/email-config.ts` — het volledige configureerbare profiel (tone of voice, snippets, segment-hints, promises, subject-formats) — dit wordt `campaigns.profile`.
  - `dashboard/lib/email-template.ts` — hoe subject/body in een uiteindelijke mail-envelop worden gewrapt (footer met demo-link/code etc. — dit stuk is zelf ook config-waardig, niet hardgecodeerd "campingbooking.pro").
- `lib/outreach/campaigns.ts`, `lib/outreach/targets.ts` (uit het schema-ticket) — hierop bouw je voort.

## Wat er moet gebeuren

1. `campaigns.profile` krijgt een concreet, generiek type (tone of voice, snippets, segments, promises, subject-formats — precies wat `dashboard/lib/email-config.ts` al had, maar zonder de camping-specifieke default-inhoud hardgecoded verplicht; een lege/starter-config moet ook werken).
2. Een campagneprofiel-editor in de UI (tab binnen `OutreachPanel`, spiegelt `dashboard/components/EmailConfigEditor`).
3. Website-scan + AI-personalisatie als `lib/outreach/`-module, met platform/hook-detectie-lijsten die **per campagne** meegegeven kunnen worden (niet hardgecodeerd `BOOKING_PLATFORMS` voor campings) — of, als dat te veel scope toevoegt, minimaal: verplaats de camping-specifieke lijsten naar een duidelijk gelabeld "camping preset"-bestand zodat een volgende campagne een eigen preset kan toevoegen zonder de scan-engine aan te raken.
4. Endpoint + UI om één lead te personaliseren (preview) en in batch te personaliseren (progress-indicator), spiegelt `personalizeSelected` in `dashboard/components/CampingDashboard/CampingDashboard.tsx`.

## Stappen

### 1. `CampaignProfile`-type + defaults

**Bestand:** `lib/outreach/campaign-profile.ts` (nieuw)

Wat er moet gebeuren:
- Type `CampaignProfile` met exact dezelfde vorm als `EmailConfig` in `dashboard/lib/email-config.ts` (`toneOfVoice`, `aboutMe`, `snippets`, `replies`, `subjectLines`, `promises`, `segments`) — dit is al goed doordacht en generiek genoeg (niets in de typedefinitie zelf is camping-specifiek, alleen de standaardwaarden).
- `DEFAULT_CAMPAIGN_PROFILE`: een **neutrale** starter-config (geen campingbooking.pro-tekst, geen horeca-P.S.) — dat specifieke campings-profiel vult de gebruiker zelf in via de editor-UI na het aanmaken van de "Campings"-campagne, of je zet 'm als losse voorbeeld-JSON klaar die de gebruiker kan plakken. Niet de dashboard-teksten hardcoderen als systeembreed default.
- `mergeWithDefaults`-achtige functie (partial → volledig, spiegelt `mergeSnippets`/`mergeSegments` in `dashboard/lib/email-config.ts`) zodat een halfleeg profiel (net aangemaakte campagne) altijd een valide volledige config oplevert voor de prompt-opbouw.
- Update `lib/outreach/campaigns.ts` (`createCampaign`/`updateCampaignProfile`) om dit type te gebruiken i.p.v. de placeholder uit het schema-ticket.

Acceptatiecriterium: een nieuw aangemaakte campagne heeft direct een valide, compleet `CampaignProfile` (met defaults), ook zonder dat de gebruiker iets heeft ingevuld.

---

### 2. Website-scan

**Bestanden:**
- `lib/outreach/website-scan.ts` (nieuw) — poort van `dashboard/lib/website-scan.ts`: `scanWebsiteContent`, `formatScanForPrompt`, `emptyWebsiteScan`, types. Functie-signatures ongewijzigd overnemen.
- `lib/outreach/presets/camping.ts` (nieuw) — de camping-specifieke `BOOKING_PLATFORMS`, `CHAIN_BRANDS`, `MULTI_LOCATION_PATTERNS`, `HOOK_KEYWORDS` lijsten, geïmporteerd door `website-scan.ts` als het **enige** preset voor nu (geen generiek preset-selectiemechanisme bouwen zolang er maar één campagnetype is — YAGNI, maar wél de lijsten in een apart bestand zodat een tweede campagne straks zijn eigen preset-bestand kan toevoegen zonder `website-scan.ts` te hoeven aanpassen buiten een import-regel).
- `lib/outreach/website-content.ts` (nieuw) — poort van `dashboard/lib/website-content.ts` (cheerio-based fetch+extract). Voeg `cheerio` toe aan `package.json` als dat nog niet gebeurd is in het schema-ticket.

Acceptatiecriterium: `scanWebsiteContent(html)` op een voorbeeld-HTML-fixture geeft dezelfde soort output als het dashboard (platforms/hooks/multiLocation).

---

### 3. AI-personalisatie

**Bestand:** `lib/outreach/personalize.ts` (nieuw)

Wat er moet gebeuren:
- Poort van `dashboard/lib/ai-personalize.ts`: `personalizeOutreachEmail(target, campaign)` — input is nu een `CampaignTarget` (generiek: `email`, `name`, `website`, `attributes`) + het `CampaignProfile` van de campagne, in plaats van een hardgecodeerde `Camping`.
- De system-prompt-opbouw (`SYSTEM_PROMPT_BASE`, `buildConfigPromptContext`) mag inhoudelijk grotendeels hetzelfde blijven (de "geen puntkomma's, geen streepjes, nuchtere afsluiting"-regels zijn campagne-config, niet code) maar verwijs niet meer naar "camping" in de code-comments/identifiers — gebruik "lead"/"target".
- Segment-hint-picking (`pickSegmentHint` in `dashboard/lib/email-config.ts`) gebruikt nu `target.attributes` in plaats van vaste `Camping`-velden (`bookingType`, `signals`) — lees deze generiek uit `attributes` met een fallback als een sleutel ontbreekt (niet crashen op een target zonder die attributes, want een toekomstige campagne heeft andere attributes).
- De JSON-parsing-robuustheid (`parseAiJson`, `repairJsonNewlines`, `extractJsonObject`, etc.) 1-op-1 overnemen — dat is generieke, bewezen code, geen reden om te herschrijven.
- `personalizeReplyDraft` ook overnemen (nodig voor het reply-tracking-ticket) met dezelfde generalisatie (campagne-profiel i.p.v. hardgecodeerd `emailConfig`).
- Gebruik `lib/ai/openrouter.ts` (niet een nieuwe client) en `lib/ai/humanize-text.ts`.

Acceptatiecriterium: voor een testtarget met wat `attributes` levert personalisatie een subject+body op, met dezelfde kwaliteitsregels (geen puntkomma's/streepjes) als het dashboard.

---

### 4. Mail-envelop (footer/template)

**Bestand:** `lib/outreach/email-template.ts` (nieuw)

Wat er moet gebeuren:
- Poort van `dashboard/lib/email-template.ts`: subject/body wrappen tot `{ subject, text, html, bodyText }`.
- De vaste footer (demo-link, inlogcode, "P.S."-plek) hoort **in het campagneprofiel** te zitten, niet hardgecodeerd op campingbooking.pro — voeg een `footer`-veld toe aan `CampaignProfile` (of hergebruik `promises`/`aboutMe` als dat al voldoende dekt; kijk goed naar wat er nu letterlijk hardgecodeerd staat in `dashboard/lib/email-template.ts` en til dat over naar profiel-config).
- `stripSignatureFromText` overnemen (nodig voor de send-UI in het volgende ticket).

Acceptatiecriterium: gegenereerde mail bevat de campagne-specifieke footer/demo-info uit het profiel, niet een hardgecodeerde string.

---

### 5. API + UI

**Bestanden:**
- `app/api/outreach/campaigns/[id]/route.ts` — `PATCH` om `profile` te updaten (naast de al bestaande `GET`/lijst uit het schema-ticket).
- `app/api/outreach/campaigns/[id]/targets/[targetId]/personalize/route.ts` — `POST`, roept `personalizeOutreachEmail` aan, retourneert `{ subject, text, html, findings, scan, websiteError, usedMetadataFallback }` — zelfde response-shape als `dashboard`'s `/api/campings/personalize` zodat de UI-poort hieronder minimaal hoeft te wijzigen.
- `components/outreach/CampaignProfileEditor/CampaignProfileEditor.tsx` (+ `.module.css`) — poort van `dashboard/components/EmailConfigEditor`, als nieuwe subtab in `OutreachPanel` ("Campagne-instellingen" o.i.d.).
- `components/outreach/OutreachPanel/OutreachPanel.tsx` — uitbreiden met: per-lead "Personaliseer"-knop (enkel) + batch-selectie met "Analyseer batch met AI"-knop en progress-indicator (`current/total`), spiegelt `personalizeSelected` in `dashboard/components/CampingDashboard/CampingDashboard.tsx`. Drafts client-side bijhouden (`Record<targetId, Draft>`) totdat het send-ticket ze daadwerkelijk verstuurt.
- `components/outreach/EmailPreviewModal/EmailPreviewModal.tsx` (+ `.module.css`) — poort van `dashboard/components/EmailPreviewModal`, toont subject/body-preview, editable vóór verzenden (verzend-knop zelf hoort bij het send-ticket, laat 'm hier disabled/placeholder of laat het send-ticket 'm invullen).

Gebruik `apiRequest`/`useAsyncAction` voor alle bovenstaande fetches (regel 6, geen kale `fetch`+`res.json()`).

Acceptatiecriterium: voor een geïmporteerde lead met website kun je op "Personaliseer" klikken en krijg je een AI-gegenereerde subject+body te zien in de preview, gebaseerd op het campagneprofiel.

---

## Gotcha's en beperkingen

- Geen verzend-knop-functionaliteit hier — dat hoort bij `todo-outreach-send-dedup.md`. Als beide tickets gelijktijdig draaien: laat de preview-modal een `onSend`-callback-prop accepteren die dit ticket niet zelf implementeert (`undefined`/no-op is prima), zodat het send-ticket 'm kan invullen zonder deze modal opnieuw te hoeven bouwen.
- `OPENROUTER_AI` env-var: al aanwezig/gedocumenteerd in de hoofdapp (`lib/ai/openrouter.ts` gebruikt 'm al voor andere AI-features) — niet opnieuw documenteren, wel checken dat 'n ontbrekende sleutel een nette Nederlandse melding geeft (`isOpenRouterConfigured()`), geen crash.
- Raak bestaande AI-endpoints (`app/api/ai/*`) niet aan — dit is een nieuw, apart pad onder `app/api/outreach/`.
- Website-scan doet een live `fetch` naar externe sites — zorg voor een timeout (kijk hoe `dashboard/lib/website-content.ts` dat al afhandelt) en vang fouten af zodat één onbereikbare website de batch niet blokkeert (`usedMetadataFallback`-pad, al aanwezig in de dashboard-logica, gewoon overnemen).

## Definitie van klaar

- [x] Campagneprofiel-editor werkt (tone of voice, snippets, segments, promises, subject-formats bewerkbaar en opslaan)
- [x] Website-scan geeft platform/hook-detectie voor camping-achtige HTML
- [x] Eén lead personaliseren via UI geeft een bruikbare AI-preview
- [x] Batch-personalisatie met progress-indicator werkt voor een selectie leads
- [x] Geen hardgecodeerde "camping"/"campingbooking.pro"-strings in `lib/outreach/*.ts` buiten het preset-bestand
- [x] `npm run lint`, `npm test`, `npx tsc --noEmit`, `npx next build` slagen
- [x] Geen bestand > 500 regels
