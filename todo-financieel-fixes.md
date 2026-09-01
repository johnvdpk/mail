# Todo: Financieel-module — losse eindjes en bugs herstellen

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie zonder verdere context.

**Hoort bij reeks:** losstaand, vervolg op `todo-financieel-uitbreiding.md` (dat bestand beschrijft de oorspronkelijke uitbreiding van de module; dit bestand repareert concrete gaten die na oplevering daarvan zijn gevonden bij een UX/dev-review)
**Afhankelijkheden:** geen — bouwt voort op de bestaande `Financieel`-module (`components/projects/`, `lib/projects/`, `app/api/projects/`)

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) met een ingebouwde ZZP-boekhoudmodule "Financieel" (in de code heet het domein overal **"projects"**: `components/projects/`, `lib/projects/`, `app/api/projects/`), bereikbaar via de knop "Financieel" in `components/mail/FolderRail/FolderRail.tsx`. De module heeft drie tabs binnen `ProjectsPanel.tsx`: **Projecten** (klantwerk), **Bedrijf** (één vast "overhead"-project voor algemene ZZP-kosten, plus bedrijfsbrede overzichten), **Trend**.

**Stack:** Next.js 15, React 19, TypeScript, CSS Modules, PostgreSQL (`pg`), OpenRouter voor LLM-calls (`lib/ai/openrouter.ts`).

Dit is een reparatieronde na een kritische UX/dev-review van de module zoals die nu in productie staat. De review vond twee categorieën problemen: (a) features die gepland en deels gebouwd zijn maar nooit aan de UI zijn gekoppeld ("dode" componenten), en (b) concrete correctheids-/UX-bugs in bestaande code. Elke stap hieronder is onafhankelijk uitvoerbaar en bevat precies genoeg context om zonder verder graafwerk te starten — lees per stap wel eerst de genoemde bestanden.

**Kernregels (project-breed, zie ook CLAUDE.md — lees dat bestand voor de volledige lijst):**
- Max 500 regels per bestand — nieuwe secties/panelen als eigen component, niet bijproppen in `ProjectsPanel.tsx` of `CompanyFinance.tsx`
- Comments Engels, alleen "waarom"; UI-teksten Nederlands
- Client-side JSON-fetch naar eigen API-routes via `apiRequest`/`useAsyncAction` (`lib/shared/api-request.ts`, `lib/shared/use-async-action.ts`) — streaming endpoints (zoals `/api/ai/draft`) zijn hiervan uitgezonderd, zie stap 2
- Server-side logging via `logger` uit `lib/shared/logger.ts`, nooit `console.error`
- Geen DIY-parsers/formatters voor problemen die een bewezen library al oplost
- **Nooit automatisch iets muteren zonder expliciete bevestiging van de gebruiker** — geldt met name voor stap 2 (herinneringsmail): AI-tekst tonen, pas verzenden na expliciete actie van de gebruiker in de compose-dialoog, nooit automatisch versturen
- `npm run lint`, `npm test`, `npx tsc --noEmit` en `npx next build` moeten alle vier slagen

**Betrokken bestanden (bestaande module, lees deze als eerste):**
- `lib/projects/types.ts` — alle domeintypes (`ProjectLine`, `OpenLineItem`, `MoneyTotals`, `LedgerRow`, ...)
- `lib/projects/period.ts` — periode- en totalenberekeningen
- `lib/projects/insights.ts` — afgeleide inzichten (`ledgerForPeriod`, `openLinesAcrossProjects`, `quarterlyVat`, ...)
- `lib/projects/counterparty-rules.ts` — tegenpartij-regels (auto-categoriseren/toewijzen)
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` — hoofdscherm met tabs
- `components/projects/CompanyFinance/CompanyFinance.tsx` — inhoud van tab "Bedrijf"
- `components/projects/OpenItemsList/OpenItemsList.tsx` — bestaand, **ongebruikt** component (zie stap 1)
- `components/projects/hooks/useProjectsState.ts` — client state/fetch-orkestratie
- `components/MailApp/useMailAppState.ts` — bevat al `openCompose(prefill)` met `initialTo`/`initialSubject`/`initialBody`, en `bookExpenseLine` als voorbeeld van hoe Financieel al met mail-state praat
- `components/mail/ComposeDialog/ComposeDialog.tsx` — compose-dialoog, ondersteunt al prefill-props
- `app/api/ai/draft/route.ts` + `lib/ai/ai-mail.ts` (`streamDraftReply`) — bestaande streaming AI-draft-route, werkt op een bestaand `threadId` (reply-in-thread, geen "compose from scratch")
- `lib/mail/mailbox-service.ts` — bevat `resolveThreadFromMessage(messageId)`, zet een lokaal message-id ("folder#uid", hetzelfde formaat als `ProjectLine.sourceMessageId`) om naar een `threadId`

---

## Wat er moet gebeuren

### 1. `OpenItemsList` aansluiten onder tab "Bedrijf" (hoogste prioriteit)

**Probleem:** `components/projects/OpenItemsList/OpenItemsList.tsx` bestaat, is af, en wordt gevoed door `lib/projects/insights.ts`'s `openLinesAcrossProjects()` (via `ProjectsOverview.openItems`, zie `types.ts:89`) — maar het component wordt **nergens geïmporteerd of gerenderd**. Tegelijk toont `FolderRail.tsx:283-284` wél een rood telbadge (`overdueCount`) op de "Financieel"-knop, gebaseerd op diezelfde onderliggende data (via `app/api/projects/summary/route.ts`). Resultaat: de gebruiker ziet een badge met bv. "3", opent Financieel, en heeft geen enkele plek om te zien wélke 3 posten dat zijn.

**Bestanden:**
- `components/projects/CompanyFinance/CompanyFinance.tsx` — render `<OpenItemsList items={...} />` in een nieuwe `<section>` met kop "Openstaande posten (alle projecten)", logisch geplaatst vóór of na de sectie "BTW per kwartaal"
- Zoek uit waar `ProjectsOverview.openItems` al beschikbaar is in de component-boom (waarschijnlijk via `useProjectsState.ts` → `ProjectsPanel.tsx` → moet nog doorgegeven worden aan `CompanyFinance`, net zoals `expenseCategories`/`incomeCategories` nu al doorgegeven worden) en voeg een `openItems`-prop toe aan `CompanyFinance`'s `Props`-type

**Acceptatiecriterium:** een onbetaalde factuur van drie maanden geleden op een klantproject verschijnt in een zichtbare lijst onder tab "Bedrijf", ook al hoort de regel bij een ander project dan het overhead-project. Het aantal getoonde posten komt overeen met het getal op de badge in `FolderRail`.

---

### 2. "Stuur herinnering"-knop bij openstaande inkomsten-posten

**Context:** dit hergebruikt de bestaande AI-draft-infrastructuur (`app/api/ai/draft/route.ts`) in plaats van een nieuwe genereer-route te bouwen. Let op een belangrijke beperking: die route werkt alleen op een **bestaand** `threadId` (het genereert een antwoord ín een gesprek) — niet op "compose from scratch". Houd de scope daarom bewust beperkt tot posten die aantoonbaar uit een mail komen.

**Bestanden:**
- `lib/projects/types.ts` — voeg `sourceMessageId: string | null` toe aan `OpenLineItem` (mirror van hoe `ProjectLine.sourceMessageId` al werkt)
- `lib/projects/insights.ts` — `toOpenItem()` (rond regel 267) moet `line.sourceMessageId` doorgeven aan het `OpenLineItem` dat het bouwt
- `components/projects/OpenItemsList/OpenItemsList.tsx` — knop "Stuur herinnering" per item met `direction === "income"`. Als `item.sourceMessageId` **ontbreekt**: knop verbergen of disablen (er is geen brongesprek om op te reageren) — bouw hiervoor geen aparte "compose from scratch met AI"-pad, dat is een grotere losse feature
- Klik-handler: roep `resolveThreadFromMessage(item.sourceMessageId)` aan (via een lichte nieuwe API-route, bv. `app/api/projects/open-items/[lineId]/reminder-thread/route.ts`, `GET` → `{ threadId } | 404`) om het `threadId` te vinden
- Met dat `threadId`: open `ComposeDialog` via `state.openCompose({ ... })` (zie `useMailAppState.ts:100`) — of, beter aansluitend bij "reply in thread", triggeren van de bestaande reply-AI-flow met een prompt-variant "betalingsherinnering" (bedrag, klant-/projectnaam, aantal dagen open) als `intent` voor `streamDraftReply`. Volg exact hetzelfde patroon als de bestaande reply/AI-draft-flow in de berichtweergave (zoek naar waar `/api/ai/draft` al vanuit de UI wordt aangeroepen) — geen nieuwe streaming-implementatie bouwen, hergebruiken
- Toon de gegenereerde tekst altijd eerst bewerkbaar in de compose-dialoog; nooit automatisch verzenden

**Acceptatiecriterium:** klikken op "Stuur herinnering" bij een openstaande, uit mail geboekte debiteur (regel heeft `sourceMessageId`) opent de compose-dialoog met een door AI opgestelde, aanpasbare herinneringstekst in het bijbehorende gesprek; er wordt nooit automatisch verzonden. Posten zonder `sourceMessageId` tonen de knop niet.

---

### 3. CSV-import: waarschuwen bij afkappen op 80 rijen

**Probleem:** `components/projects/ImportCsvDialog/ImportCsvDialog.tsx`, functie `suggest()`, stuurt `data.slice(0, 80)` naar `/api/ai/projects-import` zonder de gebruiker te laten weten dat rijen 81+ genegeerd worden. Bij een bank-CSV met honderden mutaties verdwijnt data stilletjes.

**Bestanden:**
- `components/projects/ImportCsvDialog/ImportCsvDialog.tsx` — in `parseFile`/`suggest`: als `result.data.length > 80`, zet een zichtbare melding (bv. via de bestaande `error`/hint-stijl, niet per se als error maar als duidelijke waarschuwing) zoals: `"Alleen de eerste 80 van de ${result.data.length} rijen zijn verwerkt — importeer de rest in een tweede batch."` Toon deze melding blijvend zolang de voorstellen-tabel zichtbaar is, niet alleen als toast

**Acceptatiecriterium:** een CSV met meer dan 80 rijen toont een duidelijke, blijvende melding met het exacte aantal genegeerde rijen; een CSV met 80 of minder rijen toont geen melding.

---

### 4. CSV-export: `paidMonths` filteren op het gevraagde jaar

**Probleem:** `app/api/projects/export/route.ts`, in de `map()` die CSV-rijen bouwt: voor periodieke regels wordt `line.paidMonths.join(" ")` geëxporteerd zonder filter — dat zijn **alle** ooit opgeslagen betaalmaanden van die regel, niet gefilterd op het gevraagde `year`. Een export "financieel-2026.csv" kan dus betaalmaanden uit bv. 2019 bevatten. De `betaald`-kolom voor eenmalige regels is wél correct (die regels zelf zijn al gefilterd op jaar via `occurredOn`).

**Bestanden:**
- `app/api/projects/export/route.ts` — in de rij-mapping: filter `line.paidMonths` tot alleen entries die met `String(year)` beginnen vóór het joinen, bijvoorbeeld `line.paidMonths.filter((m) => m.startsWith(String(year))).join(" ")`

**Acceptatiecriterium:** een periodieke regel die al sinds 2019 loopt en zowel in 2019 als 2026 betaalde maanden heeft, toont in `financieel-2026.csv` uitsluitend de 2026-maanden in de `betaald`-kolom.

---

### 5. `applyRuleToExistingLines`: `touchProject` mist projecten bij multi-project regels

**Probleem:** `lib/projects/counterparty-rules.ts`, functie `applyRuleToExistingLines` (rond regel 73-95): bij een categorie-regel (`target.kind === "category"`) wordt na de bulk-UPDATE alleen `touchProject(rows[0].project_id)` aangeroepen. Raakt de regel meerdere projecten tegelijk (heel plausibel — het patroon matcht op naam/note over alle projecten heen, ongeacht richting), dan wordt `updated_at` van de overige geraakte projecten niet bijgewerkt.

**Bestanden:**
- `lib/projects/counterparty-rules.ts` — vervang de huidige `if (rows.length > 0) await touchProject(...)`-regel door een loop over alle **unieke** `project_id`'s in `rows` (bv. `[...new Set(rows.map((r) => r.project_id))]`) en roep `touchProject` voor elk aan

**Acceptatiecriterium:** een tegenpartij-regel die lijnen op twee verschillende projecten tegelijk categoriseert, werkt `updated_at` van beide projecten bij (te verifiëren via een query op de `projects`-tabel, of een gerichte unit test rond `applyRuleToExistingLines` met lijnen op ≥2 project-id's).

---

### 6. BTW-scope verduidelijken in de totalenbalk

**Probleem:** `components/projects/ProjectsPanel.tsx`, de `<dl className={styles.totals}>`-blok toont een "BTW"-totaal (`totals?.vatIncome - totals?.vatExpense`) voor de **actief geselecteerde periode** (maand/jaar/runrate — afhankelijk van welke periodeknop de gebruiker heeft), terwijl `CompanyFinance.tsx` daaronder een sectie "BTW per kwartaal ({year})" toont die **altijd het hele kalenderjaar** dekt, los van de geselecteerde periode. Klik je op tab "Bedrijf" dan zet de code de periode automatisch op "jaar" (zie `ProjectsPanel.tsx`, de `onClick` van de "Bedrijf"-tab-knop), maar niets weerhoudt de gebruiker ervan om daarna terug te schakelen naar "Deze maand" terwijl tab "Bedrijf" nog open is — dan tonen twee blokken die allebei "BTW" heten twee totaal verschillende getallen, zonder toelichting.

**Bestanden:**
- `components/projects/ProjectsPanel/ProjectsPanel.tsx` — voeg aan het `<dt>BTW</dt>`-blok een expliciete periode-aanduiding toe die meeverandert met `period` (bv. `<dt>BTW ({periodLabel(period)})</dt>` — `periodLabel` bestaat al in `lib/projects/period.ts` en wordt elders in hetzelfde bestand al gebruikt), zodat het voor de gebruiker direct duidelijk is dat dit getal een andere scope heeft dan de kwartaaltabel eronder

**Acceptatiecriterium:** het BTW-totaal bovenaan toont altijd zichtbaar over welke periode het gaat (bv. "BTW (januari 2026)" of "BTW (2026)"), zodat het nooit meer verward kan worden met het jaartotaal in "BTW per kwartaal" eronder.

---

### 7. `RuleTagDialog`: duidelijkere fout bij gedeeltelijk mislukken

**Probleem:** `components/projects/RuleTagDialog/RuleTagDialog.tsx`, functie `submit()` (regel 33-85) doet drie sequentiële, niet-atomaire `apiRequest`-calls: regel aanmaken/upserten → de aangeklikte regel taggen → (optioneel) retroactief toepassen op bestaande regels. Faalt de tweede of derde call nadat de eerste(n) al zijn gelukt, dan ziet de gebruiker alleen de generieke `action.error`-melding ("Markeren mislukt") zonder te weten welk deel al wél is doorgevoerd.

Let op: de onderliggende operaties zijn zelf al idempotent (`upsertRule` gebruikt `ON CONFLICT ... DO UPDATE`, de retroactieve UPDATE-query's zijn herhaalbaar) — een simpele fix is dus niet per se een transactie bouwen, maar de gebruiker vertellen dat opnieuw op "Opslaan" klikken veilig is.

**Bestanden:**
- `components/projects/RuleTagDialog/RuleTagDialog.tsx` — vang de drie calls in `submit()` los op (of geef elke stap een label) zodat de foutmelding specifiek is, bv. "Regel opgeslagen, maar taggen van deze mutatie is mislukt — probeer opnieuw op te slaan" in plaats van het generieke "Markeren mislukt". Gebruik hiervoor gewoon losse `try/catch`-blokken rond elke `apiRequest`-call binnen de bestaande `action.run()`-wrapper, met een aparte foutboodschap per stap

**Acceptatiecriterium:** simuleer (bv. door tijdelijk een van de drie routes een 500 te laten teruggeven) een fout in stap 2 of 3 — de getoonde foutmelding maakt duidelijk welke stap faalde, in plaats van een generieke melding.

---

### 8. `todo-financieel-uitbreiding.md` bijwerken

**Probleem:** het bestaande planningsdocument `todo-financieel-uitbreiding.md` in de repo-root heeft een "Definitie van klaar"-checklist waarvan geen enkel item is afgevinkt, terwijl bij verificatie bleek dat stappen 1 t/m 13 (op stap 3's UI-koppeling en stap 14 na) al gebouwd zijn. Dit stale document zet een volgende sessie (mens of LLM) op het verkeerde been.

**Bestanden:**
- `todo-financieel-uitbreiding.md` — vink in de "Definitie van klaar"-lijst de items af die al klopten vóór dit bestand (`todo-financieel-fixes.md`) werd uitgevoerd, en vink na afronding van stap 1/2 hierboven ook die laatste twee regels af. Voeg bovenaan een korte notitie toe dat de resterende losse eindjes zijn overgenomen in `todo-financieel-fixes.md`

**Acceptatiecriterium:** de checklist in `todo-financieel-uitbreiding.md` reflecteert de werkelijke staat van de code na uitvoering van dit bestand.

---

## Gotcha's en beperkingen

- Stap 2 mag de "nooit auto-muteren/verzenden zonder bevestiging"-regel niet loslaten: een AI-suggestie voor een herinneringstekst is altijd controleerbaar/bewerkbaar vóór verzenden
- Stap 2 bewust beperkt tot posten met `sourceMessageId` — geen nieuwe "compose from scratch met AI"-infrastructuur bouwen voor posten zonder brongesprek, dat is losstaand groter werk
- Nieuwe/gewijzigde bestanden blijven onder de 500-regel lint-grens; splits waar nodig (`CompanyFinance.tsx` is met stap 1 erbij nog ruim onder de grens, maar check na toevoegen)
- Stap 4 en 5 zijn pure logica-fixes zonder schema-wijziging — geen migratie nodig
- Voer na elke stap `npm run lint`, `npm test` en `npx tsc --noEmit` uit voordat je verdergaat naar de volgende stap

## Definitie van klaar

- [ ] Tab "Bedrijf" toont een zichtbare lijst met openstaande posten over alle projecten (`OpenItemsList` aangesloten)
- [ ] Het aantal posten in die lijst komt overeen met de badge op de "Financieel"-knop in `FolderRail`
- [ ] Openstaande, uit mail geboekte debiteuren hebben een werkende "Stuur herinnering"-knop die de compose-dialoog met AI-tekst vooraf invult, nooit automatisch verzendt
- [ ] CSV-import toont een zichtbare waarschuwing met exact aantal genegeerde rijen wanneer een CSV meer dan 80 rijen bevat
- [ ] CSV-export van periodieke regels toont alleen betaalmaanden van het gevraagde jaar
- [ ] Een tegenpartij-regel die meerdere projecten raakt werkt `updated_at` van alle geraakte projecten bij
- [ ] De BTW-totaalregel bovenaan Financieel toont altijd expliciet over welke periode het gaat
- [ ] `RuleTagDialog` toont een specifieke foutmelding per mislukte stap i.p.v. één generieke melding
- [ ] `todo-financieel-uitbreiding.md` is bijgewerkt naar de werkelijke voortgang
- [ ] Geen TypeScript-errors; `npm run lint`, `npm test` en `npx next build` slagen
