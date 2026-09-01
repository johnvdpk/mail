# Todo: Incl./excl. BTW-vlag per regel, met bron-afhankelijke default

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-ledger-categorie-kolom.md` (volledig onafhankelijk, mag parallel) en `todo-periodieke-regel-startdatum.md` (**niet** parallel, zie hieronder).
**Afhankelijkheden:** technisch geen, maar dit bestand wijzigt dezelfde kernbestanden als `todo-periodieke-regel-startdatum.md` (`lib/projects/types.ts`, `lib/schema.sql`, `lib/projects/projects.ts`, `lib/projects/period.ts`, `components/projects/ProjectLineForm/ProjectLineForm.tsx`). **Wacht tot die todo is uitgevoerd en gemerged naar `main` voordat je hieraan begint**, en baseer je branch op die nieuwe `main`. Waar dit document een bestaand codefragment citeert, kan het zijn dat dat fragment inmiddels ook een `startsOn`/`starts_on`-toevoeging bevat uit die andere todo — pas je wijziging daar toe zonder die toevoeging ongedaan te maken.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Next.js 15 / React 19 / TypeScript webmail-app (`d:\code\mail`) met een ingebouwde ZZP-boekhoudmodule "Financieel" (interne routes/componenten heten nog `projects`). Regels (`project_lines`) hebben een `vatRate` (BTW-percentage, bijv. 21) en een `amount`. De boekhouding wordt gebruikt door een ZZP'er voor omzet/kosten-inzicht én voor de BTW-aangifte per kwartaal (`components/projects/VatOverview`).

**Stack:** Next.js 15, React 19, TypeScript, CSS Modules, PostgreSQL (`pg`, kale SQL via `lib/shared/db.ts`, geen ORM). Schema-wijzigingen gaan via idempotente `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`-regels onderaan `lib/schema.sql`.

**Het probleem:** de app heeft nu geen begrip van "is dit bedrag incl. of excl. BTW ingevoerd". Overal wordt `amount` behandeld alsof het al het bedrag **exclusief** BTW is, en wordt de BTW er met `amount * vatRate / 100` bovenop berekend (zie `lib/projects/period.ts`, `totalsForLines()`). Dat klopt voor handmatig ingevoerde inkomsten in een klantproject (die worden inderdaad exclusief BTW ingevoerd, bijv. een factuurbedrag), maar niet voor bankmutaties die via CSV-import binnenkomen: een bank toont het bedrag zoals het daadwerkelijk is afgeschreven/bijgeschreven, dus **inclusief** BTW. Nu wordt bij zo'n import de BTW dus dubbel/verkeerd berekend (de 21% wordt er nogmaals bovenop gedaan, terwijl die er al in zat).

**Gekozen aanpak (al afgestemd met de gebruiker, niet ter discussie):**
1. Nieuw veld `amountIncludesVat: boolean` per regel. Het ingevoerde bedrag wordt **nooit** stilzwijgend omgerekend of overschreven — het blijft precies zoals ingevoerd/geïmporteerd. BTW wordt er per regel uit gehaald (incl.) of bij opgeteld (excl.), afhankelijk van deze vlag, op het moment dat totalen worden berekend.
2. Default-waarde hangt af van de **bron**, niet van een AI-gok: handmatige regels (via `ProjectLineForm`, dus zowel projectinkomsten als handmatige Bedrijf-regels) krijgen standaard `false` (bedrag is excl. BTW). CSV-import (`ImportCsvDialog`) en "boek factuurmail" (`BookLineDialog`) krijgen standaard `true` (bedrag is incl. BTW) — in beide gevallen overrideable door de gebruiker vóór opslaan.
3. De totalen die de module overal toont (Inkomsten/Uitgaven/Marge — in het overzicht, de trend, projectdetail, categorie-uitsplitsing) gaan voortaan **altijd het netto (excl. BTW) bedrag** tonen, met de BTW er apart naast/uitgelicht in het bestaande BTW-kwartaaloverzicht. Dit is een bewuste gedragswijziging.
4. **Bestaande regels** (aangemaakt vóór deze wijziging) blijven ongewijzigd gedrag vertonen: de nieuwe kolom krijgt daar `false` als default (= huidig gedrag, bedrag blijft behandeld als excl. BTW). Er is dus **geen** terugwerkende migratie-script nodig dat oude CSV-import-regels omzet.
5. Bewuste uitzondering: de "openstaande posten"-lijst (`lib/projects/insights.ts`, `openLinesAcrossProjects`/`openItemForLine`) en het gemiddelde uurtarief (`averageHourlyRate`) blijven het **bruto/nominale** bedrag tonen zoals nu — dat is het bedrag dat daadwerkelijk nog ontvangen/betaald moet worden resp. het afgesproken tarief, geen omzetcijfer. **Verander deze twee functies niet.**

**Kernregels (project-breed, zie ook CLAUDE.md):**
- Max ~500 regels per bestand — harde ESLint-regel, geen `eslint-disable`. `lib/projects/period.ts` en `lib/projects/insights.ts` zijn al stevig gevuld; als een wijziging een bestand over de grens duwt, splits een logisch stuk eruit (zie hoe `lib/mail/mail-search/` al eerder is opgesplitst als voorbeeld), voeg geen disable toe.
- Comments in het Engels, alleen "waarom" niet "wat"; UI-teksten in het Nederlands.
- Server-side logging via `logger` uit `lib/shared/logger.ts`.

**Betrokken bestanden (lees deze als eerste, in deze volgorde):**
- `lib/schema.sql` — schema
- `lib/projects/types.ts` — `ProjectLine`, `LineInput`, `LedgerRow`, `MoneyTotals` types
- `lib/projects/period.ts` — alle periode-/totalenberekeningen, hier komt de nieuwe splitsingslogica
- `lib/projects/insights.ts` — `categoryBreakdown()` en `ledgerForPeriod()` moeten de nieuwe splitsing gebruiken
- `lib/projects/projects.ts` — DB-laag (`toLine`, `createLine`, `updateLine`, `parseLineInput`)
- `lib/ai/projects-finance.ts` — `LineSuggestion`-type en `normalizeSuggestion()`, gebruikt door zowel CSV-import als "boek factuurmail"
- `components/projects/ProjectLineForm/ProjectLineForm.tsx` — handmatig regel-formulier
- `components/projects/ImportCsvDialog/ImportCsvDialog.tsx` — CSV-import reviewtabel
- `components/projects/BookLineDialog/BookLineDialog.tsx` — factuurmail-naar-regel reviewdialoog

## Wat er moet gebeuren

Voeg `amountIncludesVat: boolean` toe aan `ProjectLine`/`LineInput`, met bron-afhankelijke defaults en een expliciete override-mogelijkheid per regel/rij. Herbereken alle omzet/kosten/marge-totalen (niet de openstaande-postenlijst, niet het uurtarief) op basis van het netto (excl. BTW) bedrag, afgeleid via deze vlag.

## Stappen

### 1. Schema-kolom toevoegen

**Bestand:** `lib/schema.sql`

Zoek de bestaande `ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS ...`-regels (rond regel 296-312) en voeg eronder toe:
```sql
-- Whether `amount` was entered/imported including VAT (bank mutations) or excluding it
-- (manual invoicing). Never silently converts the stored amount; only affects how
-- totals derive net/VAT from it. Existing rows default to false (unchanged behavior).
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS amount_includes_vat BOOLEAN NOT NULL DEFAULT FALSE;
```

Acceptatiecriterium: bij herstart van de app (schema draait opnieuw) faalt niets; bestaande regels krijgen `amount_includes_vat = false`.

---

### 2. Types uitbreiden

**Bestand:** `lib/projects/types.ts`

1. Op `ProjectLine`: voeg toe (naast `vatRate`):
   ```ts
   /** Whether `amount` was entered/imported inclusive of VAT (true) or exclusive (false, the default for manual entries). */
   amountIncludesVat: boolean;
   ```
2. Op `LineInput`: voeg toe: `amountIncludesVat: boolean;`
3. Op `LedgerRow` (rond regel 113-129): het bestaande `amount: number;`-veld gaat voortaan het **netto** bedrag bevatten (zie stap 6). Voeg een nieuw veld toe zodat de BTW nog zichtbaar te maken is:
   ```ts
   /** VAT amount for this row, derived from amount/vatRate/amountIncludesVat — `amount` itself is always net (excl. VAT). */
   vatAmount: number;
   ```
4. Op `MoneyTotals` (rond regel 20-32): het commentaar boven `vatIncome`/`vatExpense` klopt niet meer met de nieuwe, expliciete logica. Vervang:
   ```ts
   /** BTW over de inkomsten in deze periode (over het incl.-bedrag berekend). */
   vatIncome: number;
   /** BTW over de uitgaven in deze periode. */
   vatExpense: number;
   ```
   door:
   ```ts
   /** BTW over de inkomsten in deze periode, afgeleid per regel via amountIncludesVat. */
   vatIncome: number;
   /** BTW over de uitgaven in deze periode, afgeleid per regel via amountIncludesVat. */
   vatExpense: number;
   ```

Acceptatiecriterium: `ProjectLine`, `LineInput` en `LedgerRow` compileren met de nieuwe velden; geen enkele bestaande property is verwijderd.

---

### 3. Kernlogica: netto/BTW-splitsing (nieuwe herbruikbare functie)

**Bestand:** `lib/projects/period.ts`

Voeg een nieuwe, geëxporteerde functie toe (zet 'm bij de andere kleine hulpfuncties zoals `withMargin`/`roundEuros`, rond regel 28-49):

```ts
/**
 * Splits a period value into its net (excl. VAT) part and the VAT amount, based on
 * whether the line's amount was entered/imported inclusive of VAT. The input `value`
 * is never mutated/reinterpreted beyond this — callers store/display it as-is.
 */
export function splitAmountAndVat(
  value: number,
  vatRate: number | null,
  amountIncludesVat: boolean
): { net: number; vat: number } {
  const rate = (vatRate ?? 0) / 100;
  if (amountIncludesVat && rate > 0) {
    const net = roundEuros(value / (1 + rate));
    return { net, vat: roundEuros(value - net) };
  }
  return { net: value, vat: roundEuros(value * rate) };
}
```

Acceptatiecriterium: `splitAmountAndVat(121, 21, true)` geeft `{ net: 100, vat: 21 }`; `splitAmountAndVat(100, 21, false)` geeft `{ net: 100, vat: 21 }`; `splitAmountAndVat(50, null, false)` geeft `{ net: 50, vat: 0 }`.

---

### 4. `totalsForLines()` gebruikt de nieuwe splitsing

**Bestand:** `lib/projects/period.ts`

1. Voeg `"amountIncludesVat"` toe aan de `LineForTotals`-Pick-type (rond regel 100-112), naast `"vatRate"`.

2. In `totalsForLines()` (rond regel 130-158) staat nu:
   ```ts
   for (const line of lines) {
     const value = lineValueInPeriod(project, line, period, today);
     if (value === 0) continue;
     const open = openValueInPeriod(project, line, period, today, value);
     const vat = roundEuros(value * ((line.vatRate ?? 0) / 100));
     if (line.direction === "income") {
       income += value;
       openIncome += open;
       vatIncome += vat;
     } else {
       expense += value;
       openExpense += open;
       vatExpense += vat;
     }
   }
   ```
   Vervang dit door (totalen tellen voortaan het netto bedrag; het open-bedrag wordt evenredig meegeschaald naar netto, zodat `openIncome`/`openExpense` in dezelfde eenheid blijven als `income`/`expense`):
   ```ts
   for (const line of lines) {
     const value = lineValueInPeriod(project, line, period, today);
     if (value === 0) continue;
     const open = openValueInPeriod(project, line, period, today, value);
     const { net, vat } = splitAmountAndVat(value, line.vatRate, line.amountIncludesVat);
     const openNet = value === 0 ? 0 : roundEuros(open * (net / value));
     if (line.direction === "income") {
       income += net;
       openIncome += openNet;
       vatIncome += vat;
     } else {
       expense += net;
       openExpense += openNet;
       vatExpense += vat;
     }
   }
   ```

Acceptatiecriterium: een CSV-geïmporteerde uitgaveregel van €121 met `vatRate: 21` en `amountIncludesVat: true` telt voor €100 mee in "Uitgaven" in deze periode, en voor €21 in `vatExpense`. Een handmatige inkomstenregel van €100 met `vatRate: 21` en `amountIncludesVat: false` (het huidige/standaard gedrag) telt nog steeds voor €100 mee in "Inkomsten" en €21 in `vatIncome` — ongewijzigd t.o.v. nu.

---

### 5. `categoryBreakdown()` gebruikt dezelfde splitsing

**Bestand:** `lib/projects/insights.ts`

In `categoryBreakdown()` (rond regel 90-121) staat nu:
```ts
const value = lineValueInPeriod(project, line, period, today);
if (value === 0) continue;
sums.set(line.category, (sums.get(line.category) ?? 0) + value);
```
Vervang door (import `splitAmountAndVat` bovenaan het bestand naast de andere imports uit `./period`):
```ts
const value = lineValueInPeriod(project, line, period, today);
if (value === 0) continue;
const { net } = splitAmountAndVat(value, line.vatRate, line.amountIncludesVat);
sums.set(line.category, (sums.get(line.category) ?? 0) + net);
```

Acceptatiecriterium: de categorie-uitsplitsing (Bedrijf-tab) telt op tot hetzelfde totaal als de "Uitgaven"/"Inkomsten"-kaart in dezelfde periode — beide zijn nu netto.

---

### 6. `ledgerForPeriod()` toont netto bedrag + BTW-bedrag

**Bestand:** `lib/projects/insights.ts`

In `ledgerForPeriod()` (rond regel 149-186) staat nu:
```ts
const value = lineValueInPeriod(project, line, period, today);
if (value === 0) continue;
const amount =
  line.billing === "one_off" && line.hours != null
    ? roundEuros(line.amount * line.hours)
    : value;
const status = paidStatusInPeriod(project, line, period, today);
rows.push({
  lineId: line.id,
  projectId: project.id,
  projectName: project.name,
  name: line.name,
  note: line.note,
  direction: line.direction,
  billing: line.billing,
  amount,
  occurredOn: line.occurredOn,
  category: line.category,
  paid: status.paid,
  partiallyPaid: status.partiallyPaid,
  periodMonths: status.periodMonths,
});
```
Pas aan zodat `amount` het netto bedrag is en er een `vatAmount` bijkomt:
```ts
const value = lineValueInPeriod(project, line, period, today);
if (value === 0) continue;
const grossAmount =
  line.billing === "one_off" && line.hours != null
    ? roundEuros(line.amount * line.hours)
    : value;
const { net, vat } = splitAmountAndVat(grossAmount, line.vatRate, line.amountIncludesVat);
const status = paidStatusInPeriod(project, line, period, today);
rows.push({
  lineId: line.id,
  projectId: project.id,
  projectName: project.name,
  name: line.name,
  note: line.note,
  direction: line.direction,
  billing: line.billing,
  amount: net,
  vatAmount: vat,
  occurredOn: line.occurredOn,
  category: line.category,
  paid: status.paid,
  partiallyPaid: status.partiallyPaid,
  periodMonths: status.periodMonths,
});
```

**Let op:** verander `openItemForLine()` in hetzelfde bestand **niet** — die blijft bewust het bruto bedrag tonen (zie punt 5 van de gekozen aanpak hierboven).

Acceptatiecriterium: de som van `amount` over alle rijen in `LedgerPanel` (het totaaloverzicht) komt overeen met `income`/`expense` uit `totalsForLines()` voor dezelfde periode.

---

### 7. DB-laag: lezen, aanmaken, bijwerken

**Bestand:** `lib/projects/projects.ts`

Voer deze wijzigingen door, telkens naast de bestaande `vat_rate`/`vatRate`-behandeling (zoek daarop in dit bestand):

1. **`LineRow`-type**: voeg `amount_includes_vat: boolean;` toe.
2. **`toLine()`**: voeg `amountIncludesVat: row.amount_includes_vat,` toe.
3. **`createLine()`** — `INSERT INTO project_lines (...)`: voeg `amount_includes_vat` toe aan de kolommenlijst en `input.amountIncludesVat` aan de parameter-array. Als de kolommenlijst er door een eerdere wijziging (bijv. `starts_on`) al anders uitziet dan in dit document beschreven, voeg je kolom toe zonder de bestaande volgorde te verstoren — tel het aantal `$n`-placeholders en houd kolommenlijst en parameter-array in dezelfde volgorde.
4. **`updateLine()`** — `UPDATE project_lines SET ...`: zelfde aanpak, `amount_includes_vat = $n` naast de andere kolommen.
5. **`parseLineInput()`**: voeg toe (bijv. direct naast de bestaande `vatRate`-parsing):
   ```ts
   const amountIncludesVat = body.amountIncludesVat === true;
   ```
   Voeg `amountIncludesVat,` toe aan **beide** return-objecten van de functie (de `periodic`-tak en de `one_off`-tak) — in tegenstelling tot `startsOn`/`endsOn` is dit veld voor **beide** billing-types relevant (ook een eenmalige factuur kan incl. of excl. BTW zijn ingevoerd), dus geen hardcoded `null` hier.

Acceptatiecriterium: een regel aanmaken met `amountIncludesVat: true` in de request body slaat dat op en geeft het terug via de API; ontbreekt het veld in de body, dan is de opgeslagen waarde `false`.

---

### 8. AI-suggesties (CSV-import en factuurmail) krijgen de juiste default

**Bestand:** `lib/ai/projects-finance.ts`

1. Voeg `amountIncludesVat: boolean;` toe aan het `LineSuggestion`-type (rond regel 8-19).
2. In `normalizeSuggestion()` (rond regel 135-166) — dit is de **enige** plek waar zowel CSV-import-suggesties als factuurmail-suggesties doorheen gaan, dus hier hoort de bron-default. Voeg in het return-object toe:
   ```ts
   amountIncludesVat: true,
   ```
   **Waarom altijd `true` hier, niet AI-afhankelijk:** beide bronnen (bankmutatie-CSV en een ontvangen factuurmail) tonen per definitie het daadwerkelijk afgeschreven/gefactureerde bedrag, dus inclusief BTW — dit is een vaste aanname per bron, geen gok die aan het taalmodel overgelaten hoeft te worden. De gebruiker kan het per rij nog overriden vóór opslaan (zie stappen 10-11).

Acceptatiecriterium: elke suggestie die uit `suggestCsvLines()` of `suggestMailLine()` komt heeft `amountIncludesVat: true`.

---

### 9. `ProjectLineForm.tsx` — handmatige invoer, default excl. BTW

**Bestand:** `components/projects/ProjectLineForm/ProjectLineForm.tsx`

1. State toevoegen (naast `const [vatRate, setVatRate] = useState(...)` op regel 28):
   ```ts
   const [amountIncludesVat, setAmountIncludesVat] = useState(initial?.amountIncludesVat ?? false);
   ```
   (Default `false` bij een nieuwe regel — dit formulier is voor **handmatige** invoer, ongeacht of het een projectinkomst of een Bedrijf-uitgave is; per de gekozen aanpak is dat altijd excl. BTW als default.)
2. In `reset()` (naast de andere `set...`-calls rond regel 36-49): voeg `setAmountIncludesVat(false);` toe.
3. In de `onSubmit`-payload (naast `vatRate: vatRate.trim() ? Number(vatRate.replace(",", ".")) : null,` rond regel 66): voeg toe:
   ```ts
   amountIncludesVat,
   ```
4. In de JSX: voeg een checkbox toe die alleen zichtbaar is als er een BTW-percentage gekozen is (zonder BTW-percentage is de vlag betekenisloos). Plaats 'm direct na de bestaande BTW-`<select>` binnen de `.row`-div (rond regel 153-165):
   ```tsx
   <select
     value={vatRate}
     onChange={(event) => setVatRate(event.target.value)}
     aria-label="BTW-percentage"
   >
     <option value="">Geen BTW</option>
     {VAT_RATE_OPTIONS.filter((rate) => rate > 0).map((rate) => (
       <option key={rate} value={rate}>
         {rate}% BTW
       </option>
     ))}
   </select>
   {vatRate.trim() !== "" && (
     <label className={styles.checkboxRow}>
       <input
         type="checkbox"
         checked={amountIncludesVat}
         onChange={(event) => setAmountIncludesVat(event.target.checked)}
       />
       Bedrag is incl. BTW
     </label>
   )}
   ```

Acceptatiecriterium: zodra een BTW-percentage gekozen is, verschijnt een aanvinkbare "Bedrag is incl. BTW"-optie, standaard uit; bij bewerken van een bestaande regel toont de checkbox de opgeslagen waarde.

---

### 10. `ImportCsvDialog.tsx` — CSV-import, default incl. BTW, overrideable per rij

**Bestand:** `components/projects/ImportCsvDialog/ImportCsvDialog.tsx`

1. In de `confirm()`-payload (rond regel 72-89), waar nu `vatRate: row.vatRate,` staat: voeg toe `amountIncludesVat: row.amountIncludesVat,`.
2. Voeg een kolom toe aan de reviewtabel zodat de gebruiker dit per rij kan overriden vóór opslaan. In de `<thead>` (rond regel 133-144), na de kolom "Datum" (of na "Categorie", beide is prima), een nieuwe `<th>Incl. BTW</th>`. In de `<tbody>`-rij (rond regel 146-207) een bijbehorende `<td>`:
   ```tsx
   <td>
     <input
       type="checkbox"
       checked={row.amountIncludesVat}
       aria-label="Bedrag incl. BTW"
       onChange={(event) => update(index, { amountIncludesVat: event.target.checked })}
     />
   </td>
   ```
   `DraftRow` is al `LineSuggestion & { include: boolean }` (regel 14), en `LineSuggestion` heeft na stap 8 al `amountIncludesVat` — geen typewijziging nodig in dit bestand.

Acceptatiecriterium: elke voorgestelde CSV-regel toont een aangevinkte "incl. BTW"-checkbox (bron-default), die de gebruiker per rij kan uitzetten vóór te bevestigen.

---

### 11. `BookLineDialog.tsx` — factuurmail, default incl. BTW, overrideable

**Bestand:** `components/projects/BookLineDialog/BookLineDialog.tsx`

1. In `submit()` (rond regel 63-77), het `onSave(projectId, { ... })`-object: voeg toe naast `vatRate: draft.vatRate,`:
   ```ts
   amountIncludesVat: draft.amountIncludesVat,
   ```
2. Voeg een checkbox toe in de reviewvorm, bijvoorbeeld direct na het bestaande BTW-gerelateerde veld of na "Categorie" (rond regel 140-148):
   ```tsx
   <label className={styles.checkboxRow}>
     <input
       type="checkbox"
       checked={draft.amountIncludesVat}
       onChange={(event) => setDraft({ ...draft, amountIncludesVat: event.target.checked })}
     />
     Bedrag is incl. BTW
   </label>
   ```
   (Dit bestand hergebruikt `styles` van `ImportCsvDialog.module.css`, regel 9 — `checkboxRow` bestaat mogelijk niet in die CSS Module; controleer of de class bestaat, en zo niet, gebruik gewoon een `<label>` zonder extra class, consistent met de andere `<label>`-elementen die al in dit bestand staan zoals regel 95-101.)

Acceptatiecriterium: de "Als uitgave boeken"-dialoog vanuit een mail toont een aangevinkte "incl. BTW"-checkbox die de gebruiker kan uitzetten vóór te boeken.

---

## Gotcha's en beperkingen

- **Verander nooit het ingevoerde `amount` zelf** om incl./excl. te "corrigeren" — de vlag `amountIncludesVat` bepaalt de interpretatie, het opgeslagen bedrag blijft precies wat de gebruiker typte of wat de bank/CSV aanleverde.
- **Verander `openLinesAcrossProjects`/`openItemForLine` (openstaande posten) en `averageHourlyRate` (gemiddeld uurtarief) niet** — die blijven bewust op het bruto/nominale bedrag, zie de uitleg in de contextsectie hierboven.
- `quarterlyVat()` en `monthlyTotals()` in `lib/projects/insights.ts` hergebruiken `totalsForLines()` en hoeven dus **niet** los aangepast te worden — ze krijgen de nieuwe netto/BTW-splitsing automatisch door.
- Dit bestand overlapt in bestanden met `todo-periodieke-regel-startdatum.md`. Zorg dat die todo eerst is gemerged; als een codefragment dat je citeert er door die andere todo net iets anders uitziet (bijv. een extra `starts_on`-kolom in dezelfde `INSERT`/`UPDATE`), pas je wijziging daar overheen toe zonder die andere toevoeging te verwijderen.
- Test met een concreet voorbeeld: een CSV-import van €121 met 21% BTW moet na deze wijziging voor €100 in "Uitgaven" verschijnen en €21 in het BTW-overzicht — vergelijk dit handmatig, dit is de kern van de hele taak.

## Definitie van klaar

- [ ] Nieuwe regels (handmatig, via `ProjectLineForm`) hebben standaard `amountIncludesVat: false`, met een zichtbare override-checkbox zodra een BTW-percentage gekozen is
- [ ] CSV-import-suggesties en factuurmail-suggesties hebben standaard `amountIncludesVat: true`, overrideable per rij vóór opslaan
- [ ] Bestaande regels (aangemaakt vóór deze wijziging) blijven `amountIncludesVat: false` en dus ongewijzigd gedrag vertonen
- [ ] Inkomsten/Uitgaven/Marge-totalen (overzicht, trend, projectdetail, categorie-uitsplitsing) tonen het netto (excl. BTW) bedrag; BTW zelf blijft correct zichtbaar in het BTW-kwartaaloverzicht
- [ ] Het totaaloverzicht (`LedgerPanel`) telt op tot dezelfde Inkomsten/Uitgaven als de samenvattingskaarten in dezelfde periode
- [ ] Openstaande-postenlijst en gemiddeld uurtarief zijn ongewijzigd (nog steeds bruto/nominaal)
- [ ] Geen TypeScript-errors (`npx tsc --noEmit`), `npm run lint` en `npm test` slagen
- [ ] Alle gewijzigde bestanden blijven onder de 500-regel-grens
