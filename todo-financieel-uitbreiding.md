# Todo: Financieel-module uitbreiden (trend, cashflow, debiteuren, BTW, categorieën, rendement, CSV import/export, UX/dev-verbeteringen)

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** losstaand
**Afhankelijkheden:** geen — bouwt voort op de bestaande `Financieel`-module (`components/projects/`, `lib/projects/`, `app/api/projects/`)

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) met een ingebouwde ZZP-boekhoudmodule "Financieel" (voorheen "Projecten"), bereikbaar via de knop "Financieel" in `components/mail/FolderRail/FolderRail.tsx`. De module bestaat uit twee tabs: **Projecten** (klantwerk, inkomsten/uitgaven-regels per klant) en **Bedrijf** (één vaste "overhead"-project voor algemene ZZP-kosten).

**Stack:** Next.js 15, React 19, TypeScript, CSS Modules, PostgreSQL (`pg`), OpenRouter voor LLM-calls (`lib/ai/openrouter.ts`).

Dit is een uitbreiding op basis van een financieel-adviseur-review van de bestaande module. Zes verbeterpunten zijn goedgekeurd, met deze verduidelijkingen van de gebruiker:

- **Cashflow (stap 2):** geen nieuw "vervaldatum"-veld. De bestaande "Betaald"-checkbox (`paidOn` voor eenmalige regels, `paidMonths` voor periodieke regels — zie `components/projects/ProjectLineForm/ProjectLineForm.tsx`) is al de bron van waarheid: **niet aangevinkt = nog niet betaald**. Cashflow-inzicht = deze bestaande status dupliceren naar een tijdlijn, niet een nieuw systeem bouwen.
- **Debiteuren/crediteuren-lijst (stap 3):** hoort onder de tab **Bedrijf**, ook al is de inhoud project-overstijgend — dat is de logische plek omdat "Bedrijf" al de plek is voor het totaaloverzicht.

Stappen 8 t/m 14 komen uit een aanvullende UX/dev-review van dezelfde module (zelfde 7 punten, plus twee die specifiek gebruikmaken van het feit dat dit een mailclient is, geen losse boekhoud-app: e-mail↔financiën koppelen en betalingsherinneringen via de bestaande AI-draft-flow).

**Kernregels (project-breed, zie ook CLAUDE.md):**
- Max 500 regels per bestand — nieuwe secties/panelen als eigen component, niet bijproppen in `ProjectsPanel.tsx` of `ProjectDetail.tsx`
- Comments Engels, alleen "waarom"; UI-teksten Nederlands
- Client-side JSON-fetch naar eigen API-routes via `apiRequest`/`useAsyncAction` (`lib/shared/api-request.ts`, `lib/shared/use-async-action.ts`)
- Server-side logging via `logger` uit `lib/shared/logger.ts`, nooit `console.error`
- Geen DIY-parsers/formatters voor problemen die een bewezen library al oplost (CSV parsen/schrijven → library, niet handmatig split-on-comma)
- **Nooit automatisch iets muteren zonder expliciete bevestiging van de gebruiker** — geldt met name voor CSV-import (stap 7): suggesties tonen, pas opslaan na klik

**Betrokken bestanden (bestaande module, lees deze als eerste):**
- `lib/projects/types.ts` — alle types (`Project`, `ProjectLine`, `MoneyTotals`, `PeriodQuery`, ...)
- `lib/projects/period.ts` — periode- en totalenberekeningen (`totalsForLines`, `summarizeProjects`, `periodFromSearchParams`)
- `lib/projects/projects.ts` — DB-laag (queries, parsers, `parseLineInput`/`parseProjectInput`)
- `lib/schema.sql` — schema voor `projects`, `project_lines`, `project_line_payments`
- `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`, `app/api/projects/[id]/lines/**` — bestaande API
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` (+ `.module.css`) — hoofdscherm met tabs Projecten/Bedrijf
- `components/projects/ProjectDetail/ProjectDetail.tsx` — projectdetail + inkomsten/uitgaven-secties
- `components/projects/ProjectLineForm/ProjectLineForm.tsx` — formulier per regel
- `components/projects/labels.ts` — alle NL-labels/enums voor dit domein
- `components/projects/hooks/useProjectsState.ts` — client state/fetch-orkestratie
- `lib/ai/openrouter.ts`, `lib/ai/llm-json.ts` — bestaand patroon voor LLM-classificatie (zie `lib/ai/ai-sort.ts` als voorbeeld: system-prompt in het Nederlands, JSON-only antwoord, `parseJsonObject`)
- `components/mail/FolderRail/FolderRail.tsx` — navigatieknop "Financieel" (regel ~259-268), aanknopingspunt voor stap 8
- `components/mail/ComposeDialog/ComposeDialog.tsx` — compose-dialoog, momenteel altijd leeg geopend, aanknopingspunt voor stap 14
- `app/api/ai/draft/route.ts` — bestaande streaming AI-draft-route, hergebruiken in stap 14
- `components/MailApp/MailApp.tsx` — orkestreert welke dialogen/panelen open staan (`composeOpen`, `showProjects`, ...), aanknopingspunt voor stap 13/14

## Wat er moet gebeuren

Zeven uitbreidingen uit de oorspronkelijke financieel-adviseur-review, plus zeven uit een aanvullende UX/dev-review op dezelfde module:

1. Trendoverzicht — omzet/kosten/marge per maand over een jaar
2. Cashflow-tijdlijn — wat is al binnen/betaald vs. nog open, gebaseerd op bestaande betaald-status
3. Openstaande-posten-lijst (debiteuren/crediteuren) onder "Bedrijf"
4. BTW-overzicht per NL-aangiftekwartaal, met "aangegeven"-markering
5. Kostencategorieën voor uitgaven
6. Rendement per project (marge% en gemiddeld uurtarief)
7. CSV-export en CSV-import (bankmutaties) met LLM-hulp bij categoriseren
8. Badge met aantal verlopen posten op de "Financieel"-knop in `FolderRail`
9. Bevestiging bij het verwijderen van een regel (consistent met projectverwijderen)
10. Einddatum voor periodieke regels, zodat opgezegde abonnementen niet eeuwig "open" blijven
11. Bulk-actie "markeer heel jaar betaald" voor periodieke regels
12. Duidelijkere empty state voor een nieuwe gebruiker zonder projecten
13. Factuurmail met één klik omzetten naar een uitgave-regel (mail ↔ financiën koppelen)
14. "Stuur herinnering"-knop bij openstaande debiteuren, via de bestaande AI-draft-flow

---

## Stappen

### 1. Trendoverzicht per maand

**Bestanden:**
- `lib/projects/period.ts` — nieuwe functie `monthlyTotals(projects: ProjectWithLines[], year: number): { month: string; totals: MoneyTotals }[]` die voor elke kalendermaand van het gekozen jaar de totalen herberekent (hergebruik de bestaande logica uit `totalsForLines`/`summarizeProjects`, niet opnieuw uitvinden)
- `app/api/projects/trend/route.ts` (nieuw) — `GET ?year=` → array van 12 maandtotalen
- `components/projects/TrendPanel/TrendPanel.tsx` (+ `.module.css`, nieuw) — tabel: maand | inkomsten | uitgaven | marge, met een simpele CSS-breedtebalk per rij (`width: {percentage}%`) als visuele indicator — **geen chart-library toevoegen**, een tabel met balkjes is voldoende en voorkomt een zware dependency voor iets simpels
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` — derde tab "Trend" naast Projecten/Bedrijf

Acceptatiecriterium: tab "Trend" toont 12 rijen voor het gekozen jaar met kloppende maandtotalen (vergelijk handmatig één maand met de bestaande maandweergave).

**Optionele verrijking (UX-review):** een tweede, lichter gekleurde reeks "vorig jaar" naast elke maandrij (zelfde `monthlyTotals`-call met `year - 1`) geeft direct jaar-op-jaar-inzicht zonder een aparte view te bouwen.

---

### 2. Cashflow-tijdlijn (op basis van bestaande betaald-status)

**Bestanden:**
- `lib/projects/period.ts` — breid `monthlyTotals` uit (of nieuwe functie ernaast) met `paidIncome`/`paidExpense` per maand: som van regels waar `paidOn` gezet is (eenmalig) of de maand in `paidMonths` zit (periodiek), tegenover de al bestaande `income`/`expense` (= alles, betaald of niet)
- `components/projects/TrendPanel/TrendPanel.tsx` — extra kolommen "Ontvangen" en "Betaald" naast "Inkomsten"/"Uitgaven", zodat het verschil (nog open) direct zichtbaar is per maand — dit is puur een weergave van bestaande data, geen nieuw datamodel

Acceptatiecriterium: een regel die als "Betaald" is aangevinkt telt mee in de "Ontvangen/Betaald"-kolom van de maand waarin dat vinkje staat; een niet-aangevinkte regel telt daar niet in mee, wel in de kolom "Inkomsten/Uitgaven".

---

### 3. Openstaande posten (debiteuren/crediteuren) onder "Bedrijf"

**Bestanden:**
- `lib/projects/period.ts` — nieuwe functie `openLinesAcrossProjects(projects: ProjectWithLines[], today: string): OpenLineItem[]` die over **alle** projecten (niet alleen overhead) heen eenmalige regels zonder `paidOn` en periodieke regels met een verstreken maand zonder entry in `paidMonths` verzamelt, met projectnaam en aantal dagen/maanden open
- `components/projects/OpenItemsList/OpenItemsList.tsx` (+ `.module.css`, nieuw) — lijst gesorteerd op ouderdom (oudste eerst), met projectnaam, bedrag, richting (in/uit), en hoe lang open
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` — sectie "Openstaande posten (alle projecten)" onderaan de tab **Bedrijf**, onder het bestaande overhead-detail

Acceptatiecriterium: een onbetaalde factuur van drie maanden geleden op een klantproject verschijnt in deze lijst onder de tab Bedrijf, ook al hoort de regel zelf bij een ander project.

**Optionele verrijking (UX-review):** kleurcodering op ouderdom (bv. neutraal <30 dagen, geel 30-60, rood >60) maakt urgentie in één oogopslag zichtbaar — puur een CSS-klasse op basis van het al berekende aantal dagen open, geen nieuw veld.

---

### 4. BTW-overzicht per kwartaal

**Bestanden:**
- `lib/schema.sql` — nieuwe tabel:
  ```sql
  CREATE TABLE IF NOT EXISTS vat_filings (
    year       INTEGER NOT NULL,
    quarter    INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
    filed_on   DATE,
    PRIMARY KEY (year, quarter)
  );
  ```
- `lib/projects/period.ts` — `quarterlyVat(projects, year)`: groepeer bestaande `vatIncome`/`vatExpense` per kalenderkwartaal (jan-mrt, apr-jun, jul-sep, okt-dec)
- `lib/projects/vat-filings.ts` (nieuw) — DB-laag: ophalen/togglen van `filed_on` per jaar+kwartaal
- `app/api/projects/vat/route.ts` (nieuw) — `GET ?year=` → 4 kwartalen met BTW-saldo + `filedOn`
- `app/api/projects/vat/[year]/[quarter]/route.ts` (nieuw) — `POST` om aan/uit te vinken
- `components/projects/VatOverview/VatOverview.tsx` (+ `.module.css`, nieuw) — 4 rijen (Q1–Q4), saldo te betalen/ontvangen, checkbox "Aangegeven"
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` — sectie onder tab **Bedrijf**, boven of naast de openstaande-postenlijst

Acceptatiecriterium: BTW-saldo per kwartaal klopt met de som van de losse regels in die drie maanden; "Aangegeven" blijft aangevinkt na herladen van de pagina.

---

### 5. Kostencategorieën

**Bestanden:**
- `lib/schema.sql` — `ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS category TEXT;`
- `lib/projects/types.ts` — `category: string | null` op `ProjectLine`/`LineInput`; nieuw type `ExpenseCategory`
- `components/projects/labels.ts` — vaste lijst `EXPENSE_CATEGORY_LABELS` (bijv. `software`, `verzekering`, `huisvesting`, `marketing`, `reiskosten`, `overig`)
- `lib/projects/projects.ts` — `category` meenemen in `parseLineInput`, `createLine`, `updateLine` (alleen relevant/verplicht bij `direction === "expense"`, optioneel bij `income`)
- `components/projects/ProjectLineForm/ProjectLineForm.tsx` — categorie-dropdown, alleen zichtbaar bij `direction === "expense"`
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` (tab **Bedrijf**) — kostenverdeling per categorie (som + percentage van totale uitgaven) onder de bestaande totalen

Acceptatiecriterium: een nieuwe uitgave-regel onder Bedrijf met categorie "software" telt mee in de categorie-uitsplitsing; bestaande regels zonder categorie vallen onder "Overig".

---

### 6. Rendement per project

**Bestanden:**
- `lib/projects/period.ts` — `marginPercent(totals: MoneyTotals): number | null` (`margin / income * 100`, `null` bij `income === 0`) en `averageHourlyRate(lines: ProjectLine[]): number | null` (gewogen gemiddelde van `amount` over `one_off`-inkomstenregels met `hours` gezet)
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` — in de projectenlijst, naast bestaande `itemMeta`-regel: marge% tonen
- `components/projects/ProjectDetail/ProjectDetail.tsx` — gemiddeld uurtarief tonen naast de bestaande "In deze periode"-samenvatting, alleen als er uurbasis-regels zijn

Acceptatiecriterium: een project met €4000 omzet en €1000 kosten toont marge 75%; een project met twee uurbasis-regels (10u à €50, 5u à €80) toont een gewogen gemiddeld tarief, niet het rekenkundig gemiddelde van de tarieven.

---

### 7. CSV-export en CSV-import (bankmutaties) met LLM-hulp

**Dependency:** voeg een bewezen CSV-library toe (bijv. `papaparse` voor parsen en/of `csv-stringify` voor schrijven) — geen handgeschreven CSV-parser (regel 3, DIY).

**Export — bestanden:**
- `app/api/projects/export/route.ts` (nieuw) — `GET ?year=` → CSV-bestand (`Content-Type: text/csv`, `Content-Disposition: attachment`) van alle regels van dat jaar over alle projecten, met kolommen: project, richting, type, naam, bedrag, uren, datum, betaald, BTW%, categorie
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` — knop "Exporteer CSV" in de header, naast tab **Bedrijf**

**Import — bestanden:**
- `components/projects/ImportCsvDialog/ImportCsvDialog.tsx` (+ `.module.css`, nieuw) — bereikbaar vanuit tab **Bedrijf**: bestandskiezer voor een CSV-export van de bank, parse client-side met de CSV-library, toon ruwe rijen
- `lib/ai/projects-import.ts` (nieuw) — system-prompt (Nederlands, JSON-only, zie `lib/ai/ai-sort.ts` als patroon) die per bankmutatie-rij voorstelt: `direction` (income/expense), voorgestelde `name`, gok voor `projectId` (op basis van klantnaam-match met bestaande projecten, anders `null` = overhead/onbekend), `vatRate`-gok
- `app/api/ai/projects-import/route.ts` (nieuw) — `POST` met geparste CSV-rijen → LLM-suggesties per rij (gebruik `chatCompletion`/`parseJsonObject`, geen streaming nodig dus gewoon via `apiRequest`)
- `components/projects/ImportCsvDialog/ImportCsvDialog.tsx` — reviewtabel: elke voorgestelde regel is bewerkbaar (project, richting, naam, bedrag, categorie) vóór opslaan
- `app/api/projects/import/confirm/route.ts` (nieuw) — `POST` met de door de gebruiker bevestigde/aangepaste rijen → bulk-insert via bestaande `createLine`-laag (nieuwe of onbekende projecten worden **niet** automatisch aangemaakt; onbekende rijen gaan naar het overhead-project of worden overgeslagen, gebruiker kiest)

Acceptatiecriterium: een CSV met 20 bankmutaties resulteert in 20 voorstellen die stuk voor stuk aanpasbaar zijn; er wordt niets in de database geschreven vóór expliciete bevestiging per import-batch.

---

### 8. Badge met aantal verlopen posten op de "Financieel"-knop

**Bestanden:**
- `lib/projects/period.ts` — lichte telfunctie die hergebruikt wat stap 3 (`openLinesAcrossProjects`) al berekent, maar dan alleen het aantal posten ouder dan een drempel (bv. 30 dagen) teruggeeft
- `app/api/projects/summary/route.ts` (nieuw, licht endpoint) — `GET` → `{ overdueCount: number }`, bewust **niet** de volledige overview-query, zodat de hoofdmail-UI dit bij app-load kan aanroepen zonder de zware Financieel-query te draaien
- `components/MailApp/useMailAppState.ts` — haalt dit getal op bij het laden van de app (niet pas bij het openen van de Financieel-module) en geeft het door aan `FolderRail`
- `components/mail/FolderRail/FolderRail.tsx` — nieuwe optionele prop `overdueCount?: number`; toont een badge (rond, met getal) naast "Financieel" wanneer `overdueCount > 0`

Acceptatiecriterium: een factuur die langer dan de drempel open staat, toont een badge met een getal op de Financieel-knop zonder dat de module geopend hoeft te zijn; de badge verdwijnt zodra alles is afgehandeld.

---

### 9. Bevestiging bij regel verwijderen

**Bestanden:**
- `components/projects/ProjectDetail/ProjectDetail.tsx` — de `onDelete(item.id)`-call in `LineSection` (huidige `×`-knop, rond regel 306) achter een `window.confirm` zetten, net als bij het bestaande `onDelete(project.id)` in hetzelfde bestand

Acceptatiecriterium: klikken op × bij een regel toont eerst een bevestigingsvraag met de naam van de regel; annuleren laat de regel ongewijzigd. Geen losstaande undo-toast nodig, `window.confirm` volstaat en past bij het bestaande patroon.

---

### 10. Einddatum voor periodieke regels

**Bestanden:**
- `lib/schema.sql` — `ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS ends_on DATE;`
- `lib/projects/types.ts` — `endsOn: string | null` op `ProjectLine` en `LineInput`
- `lib/projects/projects.ts` — meenemen in `parseLineInput`, `createLine`, `updateLine`, `toLine`
- `lib/projects/period.ts` — `monthlyTotals` (stap 1/2) en `openLinesAcrossProjects` (stap 3) moeten maanden ná `endsOn` uitsluiten voor die regel
- `components/projects/ProjectLineForm/ProjectLineForm.tsx` — optioneel datumveld "Eindigt op (optioneel)", alleen zichtbaar bij `billing === "periodic"`

Acceptatiecriterium: een periodieke regel met `endsOn` vorige maand duikt niet meer op als "open" of "verlopen" in de huidige maand, ook al ontbreekt er een `paidMonths`-entry voor die maand.

---

### 11. Bulk "markeer heel jaar betaald" voor periodieke regels

**Bestanden:**
- `components/projects/ProjectDetail/ProjectDetail.tsx` (`LineSection`) — knop naast de maand-chips-rij, alleen zichtbaar bij `period.view === "year"`, die voor alle maanden t/m de huidige maand `onSetPaidMonth(item.id, month, true)` aanroept voor de maanden die nog niet in `paidMonths` staan

Geen nieuwe API-route nodig — dit roept de bestaande `setLinePaidMonth`-actie (`components/projects/hooks/useProjectsState.ts`) meerdere keren sequentieel aan.

Acceptatiecriterium: klikken op "Markeer jaar betaald" bij een periodieke regel zet in één actie alle nog-open maanden t/m nu op betaald, in plaats van chip voor chip.

---

### 12. Duidelijkere empty state

**Bestanden:**
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` — wanneer `clientProjects.length === 0 && !loading`: i.p.v. de huidige lege lijst een korte uitleg tonen (bv. "Hier volg je inkomsten en uitgaven per klant. Begin met een nieuw project.") met de bestaande "+ Nieuw project"-knop als call-to-action

Acceptatiecriterium: een nieuwe gebruiker zonder projecten ziet uitleg over wat de module doet in plaats van een lege lijst.

---

### 13. Factuurmail met één klik omzetten naar een uitgave-regel

**Context:** dit is een mailclient — een ontvangen factuur zit vaak al als bijlage in de inbox. Dit koppelt de mail rechtstreeks aan een boeking i.p.v. dat de gebruiker bedragen moet overtypen.

**Bestanden:**
- Berichtweergave onder `components/mail/` (waar het bericht-detail met bijlagen rendert) — actie "Als uitgave boeken" op een bericht met bijlage
- `lib/ai/projects-import.ts` (uit stap 7, hergebruiken/uitbreiden) — LLM-suggestie voor bedrag/naam/categorie/richting, nu op basis van mailtekst + bijlagenaam i.p.v. een CSV-rij
- `app/api/ai/mail-to-line/route.ts` (nieuw) — `POST` met thread-/message-ID → LLM-suggestie, zelfde JSON-only patroon als `lib/ai/ai-sort.ts`
- Reviewstap (kan de dialoog uit stap 7 hergebruiken of een lichte variant) — suggestie tonen, bewerkbaar, pas opslaan na expliciete bevestiging (zelfde "nooit auto-muteren"-regel als stap 7)
- `lib/projects/types.ts` / `lib/schema.sql` — optioneel `source_message_id`-veld op `project_lines` zodat een regel herleidbaar blijft naar de mail waar hij vandaan komt

Acceptatiecriterium: vanuit een geopende mail met een factuurbijlage kan de gebruiker met één actie een uitgave-suggestie laten genereren, controleren en pas na bevestiging als regel opslaan; de regel blijft gekoppeld aan de bron-mail.

---

### 14. "Stuur herinnering"-knop bij openstaande debiteuren

**Context:** hergebruikt de bestaande AI-draft-infrastructuur (`app/api/ai/draft/route.ts`) in plaats van een nieuwe genereer-route te bouwen — dit kan omdat Financieel en mail dezelfde app zijn.

**Bestanden:**
- `components/projects/OpenItemsList/OpenItemsList.tsx` (uit stap 3) — knop "Stuur herinnering" per openstaande inkomsten-regel
- `components/mail/ComposeDialog/ComposeDialog.tsx` — uitbreiden met optionele props `initialTo`/`initialSubject`/`initialBody` (nu altijd leeg geopend)
- `app/api/ai/draft/route.ts` — bestaande streaming-route hergebruiken met een prompt-variant "betalingsherinnering" (bedrag, klant-/projectnaam, aantal dagen open)
- `components/MailApp/MailApp.tsx` / `useMailAppState.ts` — state om `ComposeDialog` vanuit de Financieel-module met deze prefill te openen, analoog aan hoe `composeOpen`/`forwardOpen` nu al werken

Acceptatiecriterium: klikken op "Stuur herinnering" bij een openstaande debiteur opent de compose-dialoog met een door AI opgestelde, aanpasbare herinneringstekst; er wordt nooit automatisch verzonden.

---

## Gotcha's en beperkingen

- Stap 2 hergebruikt bewust de bestaande `paidOn`/`paidMonths`-status — geen nieuw "vervaldatum"-veld toevoegen, dat is een aparte discussie
- Stap 3 leest over alle projecten heen maar leeft UI-technisch onder tab **Bedrijf** — niet onder tab Projecten
- CSV-import mag nooit automatisch schrijven naar de database zonder expliciete gebruikersbevestiging per rij/batch (zelfde principe als "geen auto-accept" bij agenda-uitnodigingen elders in dit project)
- Nieuwe componenten/bestanden blijven onder de 500-regel lint-grens; splits waar nodig
- `vat_filings` en de `category`-kolom zijn additieve schema-wijzigingen (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`), volg het bestaande migratiepatroon in `lib/schema.sql`
- Stap 13/14 mogen dezelfde "nooit auto-muteren zonder bevestiging"-regel als stap 7 niet loslaten: een AI-suggestie voor een boeking of herinneringstekst is altijd controleerbaar/bewerkbaar vóór opslaan/verzenden
- Stap 8's badge-endpoint moet expliciet licht blijven (alleen een getal) — niet de volledige `ProjectsOverview`-query op elke app-load draaien, dat is een bestaand performance-risico dat je hiermee juist voorkomt
- `ComposeDialog.tsx` heeft momenteel geen prefill-props — die uitbreiding in stap 14 is een additieve wijziging (nieuwe optionele props), bestaand gebruik (leeg openen) moet blijven werken

## Definitie van klaar

- [ ] Tab "Trend" toont maandelijkse inkomsten/uitgaven/marge voor een gekozen jaar
- [ ] Cashflow-kolommen (ontvangen/betaald) tonen correct de al-betaalde delen op basis van bestaande vinkjes
- [ ] Tab Bedrijf toont een openstaande-postenlijst over alle projecten
- [ ] Tab Bedrijf toont BTW per kwartaal met aan-/uitvinkbare "Aangegeven"-status
- [ ] Uitgaven kunnen een categorie krijgen; Bedrijf toont een categorie-uitsplitsing
- [ ] Projectenlijst en projectdetail tonen marge% en gemiddeld uurtarief
- [ ] CSV-export werkt voor een gekozen jaar
- [ ] CSV-import toont LLM-suggesties die pas na bevestiging worden opgeslagen
- [ ] Financieel-knop in `FolderRail` toont een badge met aantal verlopen posten, zonder de module te openen
- [ ] Regel verwijderen vraagt om bevestiging, net als project verwijderen
- [ ] Periodieke regels kunnen een einddatum krijgen en tellen daarna niet meer mee als open
- [ ] Periodieke regel kan met één actie "heel jaar betaald" gezet worden
- [ ] Lege projectenlijst toont uitleg + call-to-action i.p.v. alleen "Kies een project..."
- [ ] Een mail met bijlage kan met één actie een controleerbare uitgave-suggestie opleveren, pas opgeslagen na bevestiging
- [ ] Een openstaande debiteur heeft een "Stuur herinnering"-knop die de compose-dialoog met AI-tekst vooraf invult, nooit automatisch verzendt
- [ ] Geen TypeScript-errors, `npm run lint` en `npm test` slagen
- [ ] Alle nieuwe bestanden onder de 500-regel-grens
