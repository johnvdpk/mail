# Todo: Startdatum (en optionele einddatum, al aanwezig) voor periodieke inkomsten/uitgaven-regels

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-ledger-categorie-kolom.md` (volledig onafhankelijk, mag parallel) en `todo-btw-incl-excl.md` (**niet** parallel, zie hieronder).
**Afhankelijkheden:** technisch geen, maar dit bestand en `todo-btw-incl-excl.md` wijzigen beide dezelfde kernbestanden (`lib/projects/types.ts`, `lib/schema.sql`, `lib/projects/projects.ts`, `lib/projects/period.ts`, `components/projects/ProjectLineForm/ProjectLineForm.tsx`). **Voer dit bestand eerst uit en zorg dat het gemerged is naar `main` vóórdat `todo-btw-incl-excl.md` start**, anders ontstaan mergeconflicten. Als je dit als losse branch uitvoert: baseer de branch op de laatste `main` en merge meteen na de lint+test-gate.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Next.js 15 / React 19 / TypeScript webmail-app (`d:\code\mail`) met een ingebouwde ZZP-boekhoudmodule "Financieel" (interne routes/componenten heten nog `projects`). Binnen een project (of het vaste "Bedrijf"-overheadproject) kun je regels toevoegen die **periodiek** zijn (bijv. maandelijkse hosting-inkomsten of een terugkerend abonnement-uitgave) of **eenmalig**.

**Stack:** Next.js 15, React 19, TypeScript, CSS Modules, PostgreSQL (`pg`, kale SQL via `lib/shared/db.ts`, geen ORM). Schema-wijzigingen gaan via idempotente `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`-regels onderaan `lib/schema.sql` (dit script draait bij elke opstart opnieuw, dus alles moet herhaalbaar zijn).

**Het probleem:** een periodieke regel (`billing: "periodic"`) heeft al een optioneel `endsOn`-veld ("Eindigt op") waarmee je een regel kunt laten stoppen met meetellen. Er is echter **geen** vergelijkbaar `startsOn`-veld op de regel zelf — periodieke regels tellen nu altijd mee vanaf de startdatum van het *project* (`project.startOn`, in `lib/projects/period.ts`), of vanaf 1 januari van het gekozen jaar als het project geen `startOn` heeft. Een gebruiker die halverwege het jaar (bijv. 1 september) een nieuwe maandelijkse inkomsten- of uitgavenregel toevoegt binnen een al lang lopend project, kan dus niet aangeven dat die regel pas vanaf september meetelt — hij telt met terugwerkende kracht vanaf het begin van het jaar mee.

**Kernregels (project-breed, zie ook CLAUDE.md):**
- Max ~500 regels per bestand — harde ESLint-regel, geen `eslint-disable`.
- Comments in het Engels, alleen "waarom" niet "wat"; UI-teksten in het Nederlands.
- Typed API-contracten via `apiRequest`/`useAsyncAction` voor client-side fetches naar eigen API-routes.
- Server-side logging via `logger` uit `lib/shared/logger.ts`.
- Bouw dit **volledig analoog aan het bestaande `endsOn`-veld** — spiegel dezelfde plekken in dezelfde bestanden, verzin geen nieuw patroon.

**Betrokken bestanden (lees deze als eerste, in deze volgorde):**
- `lib/schema.sql` — schema, zoek de regel `ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS ends_on DATE;`
- `lib/projects/types.ts` — `ProjectLine`, `LineInput` types
- `lib/projects/projects.ts` — DB-laag (`toLine`, `createLine`, `updateLine`, `parseLineInput`)
- `lib/projects/period.ts` — alle periode-/totalenberekeningen (`overlapsMonth`, `activeMonthsInYear`, `lineValueInPeriod`, `LineForTotals`)
- `lib/projects/insights.ts` — gebruikt `activeMonthsInYear` op twee plekken
- `app/api/projects/export/route.ts` — CSV-export, filtert regels op jaar
- `components/projects/ProjectDetail/ProjectDetail.tsx` — toont/bewerkt een regel binnen een project, gebruikt `activeMonthsInYear` voor de betaal-chips
- `components/projects/ProjectLineForm/ProjectLineForm.tsx` — het formulier waar je een regel aanmaakt/bewerkt, heeft al een invoerveld voor `endsOn`
- `components/projects/ImportCsvDialog/ImportCsvDialog.tsx` en `components/projects/BookLineDialog/BookLineDialog.tsx` — bouwen allebei een los `LineInput`-object voor eenmalige (`one_off`) regels; zodra `LineInput` een nieuw verplicht veld krijgt, moeten deze object-literals meegroeien

## Wat er moet gebeuren

Voeg een `startsOn: string | null` toe aan periodieke regels, exact zoals `endsOn` nu al werkt: optioneel, alleen relevant bij `billing === "periodic"`, en het bepaalt vanaf welke kalendermaand de regel meetelt in alle periode-berekeningen (maand/jaar/doorlopend-per-maand-weergave). Zonder `startsOn` (null) blijft het gedrag exact zoals nu (telt vanaf projectstart / begin van het jaar).

## Stappen

### 1. Schema-kolom toevoegen

**Bestand:** `lib/schema.sql`

Zoek de regel (rond regel 297):
```sql
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS ends_on DATE;
```
Voeg er direct onder een identieke regel voor de nieuwe kolom aan toe:
```sql
ALTER TABLE project_lines ADD COLUMN IF NOT EXISTS starts_on DATE;
```

Acceptatiecriterium: bij het opnieuw opstarten van de app (schema wordt opnieuw uitgevoerd) faalt niets — `IF NOT EXISTS` maakt dit herhaalbaar.

---

### 2. Types uitbreiden

**Bestand:** `lib/projects/types.ts`

Op `ProjectLine` (rond regel 34-60) staat:
```ts
/** Periodic lines stop counting after this date (inclusive). */
endsOn: string | null;
```
Voeg er direct boven of onder een symmetrisch veld aan toe:
```ts
/** Periodic lines only start counting from this date (inclusive); null = same as project start. */
startsOn: string | null;
```

Op `LineInput` (rond regel 95-109) staat `endsOn: string | null;` — voeg daar ook `startsOn: string | null;` aan toe, op dezelfde plek relatief aan `endsOn`.

Acceptatiecriterium: `ProjectLine` en `LineInput` hebben allebei een `startsOn: string | null`-veld, direct naast het bestaande `endsOn`-veld.

---

### 3. DB-laag: lezen, aanmaken, bijwerken

**Bestand:** `lib/projects/projects.ts`

Voer deze wijzigingen door, telkens naast de bestaande `ends_on`/`endsOn`-behandeling (zoek naar `ends_on` en `endsOn` in dit bestand — er zijn 5 plekken):

1. **`LineRow`-type** (rond regel 42-59): voeg `starts_on: Date | string | null;` toe naast het bestaande `ends_on: Date | string | null;`.
2. **`toLine()`** (rond regel 100-120): voeg `startsOn: toDateOnly(row.starts_on),` toe naast de bestaande `endsOn: toDateOnly(row.ends_on),`.
3. **`createLine()`** — de `INSERT INTO project_lines (...)`-query (rond regel 253-280): voeg `starts_on` toe aan de kolommenlijst en `input.startsOn` aan de parameter-array, in dezelfde positie relatief aan `ends_on`/`input.endsOn`. Let op: als de kolommenlijst al een extra kolom bevat die niet in dit document genoemd wordt (bijv. door een eerder uitgevoerde andere todo), voeg `starts_on` dan toe zonder de bestaande volgorde te verstoren — tel gewoon het aantal `$n`-placeholders en houd de parameter-array in dezelfde volgorde als de kolommenlijst.
4. **`updateLine()`** — de `UPDATE project_lines SET ...`-query (rond regel 295-329): zelfde aanpak, voeg `starts_on = $n` toe naast `ends_on = $n`, en `input.startsOn` op de bijbehorende plek in de parameter-array.
5. **`parseLineInput()`** (rond regel 454-527): direct naast de bestaande

   ```ts
   const endsOn = parseOptionalDate(body.endsOn);
   if (endsOn === undefined) return "endsOn ongeldig";
   ```

   voeg toe:

   ```ts
   const startsOn = parseOptionalDate(body.startsOn);
   if (startsOn === undefined) return "startsOn ongeldig";
   if (startsOn && endsOn && endsOn < startsOn) return "einddatum ligt voor startdatum";
   ```

   In de `periodic`-tak van de functie (waar nu `endsOn,` in het return-object staat) voeg je `startsOn,` toe. In de `one_off`-tak (waar nu `endsOn: null,` hardcoded staat, want eenmalige regels hebben geen eind/startdatum-concept) voeg je `startsOn: null,` toe.

Acceptatiecriterium: een periodieke regel aanmaken/bijwerken met een `startsOn`-waarde slaat die op en geeft 'm terug via de API; een eenmalige regel heeft altijd `startsOn: null`, ongeacht wat er is meegestuurd.

---

### 4. Periode-berekeningen: `startsOn` laten meetellen

**Bestand:** `lib/projects/period.ts`

Dit is de kern van de functionaliteit — hier wordt bepaald of een regel in een gegeven maand/jaar meetelt.

1. **`LineForTotals`-type** (rond regel 100-112): voeg `"startsOn"` toe aan de `Pick<ProjectLine, ...>`-lijst, naast het al aanwezige `"endsOn"`.

2. **`overlapsMonth()`** (rond regel 248-260) — huidige vorm:
   ```ts
   function overlapsMonth(
     project: ProjectForTotals,
     year: number,
     month: number,
     today: string,
     lineEndsOn?: string | null
   ): boolean {
     const start = monthStart(year, month);
     const end = monthEnd(year, month);
     if (project.startOn && project.startOn > end) return false;
     if (lineEndsOn && lineEndsOn < start) return false;
     return effectiveEndOn(project, today) >= start;
   }
   ```
   Wordt (nieuwe parameter `lineStartsOn` vóór `lineEndsOn`, plus één nieuwe check):
   ```ts
   function overlapsMonth(
     project: ProjectForTotals,
     year: number,
     month: number,
     today: string,
     lineStartsOn?: string | null,
     lineEndsOn?: string | null
   ): boolean {
     const start = monthStart(year, month);
     const end = monthEnd(year, month);
     if (project.startOn && project.startOn > end) return false;
     if (lineStartsOn && lineStartsOn > end) return false;
     if (lineEndsOn && lineEndsOn < start) return false;
     return effectiveEndOn(project, today) >= start;
   }
   ```

3. **`activeMonthsInYear()`** (rond regel 263-281) — huidige vorm:
   ```ts
   export function activeMonthsInYear(
     project: ProjectForTotals,
     year: number,
     today: string,
     lineEndsOn?: string | null
   ): string[] {
     const yearStart = `${year}-01-01`;
     const yearEnd = `${year}-12-31`;
     const from = maxDate(project.startOn ?? yearStart, yearStart);
     const to = minDate(minDate(effectiveEndOn(project, today), lineEndsOn ?? yearEnd), yearEnd);
     ...
   ```
   Wordt (nieuwe parameter `lineStartsOn` vóór `lineEndsOn`, en `from` houdt er ook rekening mee):
   ```ts
   export function activeMonthsInYear(
     project: ProjectForTotals,
     year: number,
     today: string,
     lineStartsOn?: string | null,
     lineEndsOn?: string | null
   ): string[] {
     const yearStart = `${year}-01-01`;
     const yearEnd = `${year}-12-31`;
     const from = maxDate(maxDate(project.startOn ?? yearStart, lineStartsOn ?? yearStart), yearStart);
     const to = minDate(minDate(effectiveEndOn(project, today), lineEndsOn ?? yearEnd), yearEnd);
     ...
   ```
   (de rest van de functie blijft ongewijzigd)

4. **`lineValueInPeriod()`** (rond regel 160-188) — drie plekken aanpassen:
   - De `runrate`-tak (rond regel 166-171): direct naast `if (line.endsOn && line.endsOn < today) return 0;` een nieuwe regel toevoegen: `if (line.startsOn && line.startsOn > today) return 0;` (een regel die nog niet gestart is telt nog niet mee in de doorlopende-per-maand-weergave).
   - De `month`-tak (rond regel 184-186): `overlapsMonth(project, period.year, period.month, today, line.endsOn)` wordt `overlapsMonth(project, period.year, period.month, today, line.startsOn, line.endsOn)`.
   - De `year`-tak (rond regel 187): `activeMonthsInYear(project, period.year, today, line.endsOn).length` wordt `activeMonthsInYear(project, period.year, today, line.startsOn, line.endsOn).length`.

5. **`openValueInPeriod()`** (rond regel 195-212), de `year`-tak (rond regel 206): `activeMonthsInYear(project, period.year, today, line.endsOn)` wordt `activeMonthsInYear(project, period.year, today, line.startsOn, line.endsOn)`.

Acceptatiecriterium: een periodieke regel van €100/maand met `startsOn = "2026-09-01"` telt €0 mee in de maandweergave voor augustus 2026 en €100 mee voor september 2026; in de jaarweergave voor 2026 telt hij voor 4 maanden mee (sep t/m dec), niet voor 12.

---

### 5. `insights.ts` — twee resterende aanroepen van `activeMonthsInYear`

**Bestand:** `lib/projects/insights.ts`

Er zijn twee plekken die `activeMonthsInYear` aanroepen met alleen `line.endsOn` als laatste argument — die moeten nu ook `line.startsOn` doorgeven (als voorlaatste argument, vóór `line.endsOn`, zie de nieuwe signatuur uit stap 4.3):

1. `paidStatusInPeriod()` (rond regel 133-135): `activeMonthsInYear(project, period.year, today, line.endsOn)` → `activeMonthsInYear(project, period.year, today, line.startsOn, line.endsOn)`.
2. `unpaidPeriodicMonths()` (rond regel 242): `activeMonthsInYear(project, year, today, line.endsOn)` → `activeMonthsInYear(project, year, today, line.startsOn, line.endsOn)`.

Acceptatiecriterium: de "openstaande posten"-lijst en de betaald/open-status per regel houden ook rekening met `startsOn` — een regel die pas in september start, verschijnt niet als "open" voor de maanden ervoor.

---

### 6. CSV-export: regels vóór hun startdatum uitsluiten

**Bestand:** `app/api/projects/export/route.ts`

In de `.filter()` (rond regel 20-25) staat nu:
```ts
if (line.billing === "one_off") {
  return line.occurredOn?.startsWith(String(year));
}
if (line.endsOn && line.endsOn < `${year}-01-01`) return false;
return true;
```
Voeg een symmetrische check toe voor `startsOn`:
```ts
if (line.billing === "one_off") {
  return line.occurredOn?.startsWith(String(year));
}
if (line.endsOn && line.endsOn < `${year}-01-01`) return false;
if (line.startsOn && line.startsOn > `${year}-12-31`) return false;
return true;
```

Acceptatiecriterium: een periodieke regel die pas in 2027 begint, verschijnt niet in een CSV-export van 2026.

---

### 7. `ProjectDetail.tsx` — regel bewerken en tonen

**Bestand:** `components/projects/ProjectDetail/ProjectDetail.tsx`

1. **`lineToInput()`** (rond regel 31-47): voeg `startsOn: line.startsOn,` toe naast de bestaande `endsOn: line.endsOn,` — anders geeft TypeScript een compile-fout omdat `LineInput` nu een verplicht `startsOn`-veld heeft.
2. **`lineMeta()`** (rond regel 49-60): voeg naast de bestaande `if (line.endsOn) parts.push(\`t/m ${line.endsOn}\`);` een regel toe die de startdatum toont wanneer die er is:
   ```ts
   if (line.startsOn) parts.push(`vanaf ${line.startsOn}`);
   ```
   Plaats deze vóór de `endsOn`-regel, zodat de volgorde "vanaf X · t/m Y" logisch leest.
3. **`activeMonthsInYear`-aanroepen** (rond regel 329 en 349): beide `activeMonthsInYear(project, period.year, todayIso(), item.endsOn)` wordt `activeMonthsInYear(project, period.year, todayIso(), item.startsOn, item.endsOn)`.

Acceptatiecriterium: een regel met een startdatum toont die datum in de meta-regel onder de regelnaam, en de betaal-chips per maand beginnen pas bij die maand.

---

### 8. `ProjectLineForm.tsx` — invoerveld voor de gebruiker

**Bestand:** `components/projects/ProjectLineForm/ProjectLineForm.tsx`

Dit formulier heeft al een datumveld voor `endsOn` (rond regel 32, 48, 68, 114-121). Voeg er een symmetrisch veld voor `startsOn` naast toe:

1. State (naast `const [endsOn, setEndsOn] = useState(initial?.endsOn ?? "");` op regel 32):
   ```ts
   const [startsOn, setStartsOn] = useState(initial?.startsOn ?? "");
   ```
2. In `reset()` (naast `setEndsOn("");` op regel 48): voeg `setStartsOn("");` toe.
3. In de `onSubmit`-payload (naast `endsOn: billing === "periodic" && endsOn ? endsOn : null,` op regel 68): voeg toe:
   ```ts
   startsOn: billing === "periodic" && startsOn ? startsOn : null,
   ```
4. In de JSX, binnen het `billing === "periodic"`-blok (rond regel 101-123), direct vóór het bestaande `endsOn`-datumveld, een nieuw veld toevoegen dat er hetzelfde uitziet:
   ```tsx
   <input
     type="date"
     value={startsOn}
     aria-label="Start op (optioneel)"
     title="Start op (optioneel)"
     onChange={(event) => setStartsOn(event.target.value)}
   />
   <p className={styles.itemMeta}>Start op (optioneel, leeg = vanaf projectstart)</p>
   ```
   Zet dit vóór het bestaande `endsOn`-veld en zijn `<p className={styles.itemMeta}>Eindigt op (optioneel)</p>`, zodat de volgorde in het formulier "start → eind" is.

Acceptatiecriterium: bij het aanmaken van een periodieke regel kan de gebruiker een optionele "Start op"-datum invullen naast de al bestaande optionele "Eindigt op"-datum; leeg laten geeft exact het huidige gedrag (telt vanaf projectstart).

---

### 9. Overige plekken die een `LineInput`-object bouwen

Omdat `LineInput` nu een verplicht `startsOn: string | null`-veld heeft, geeft TypeScript compile-fouten op elke plek die een `LineInput`-literal bouwt zonder dit veld. Naast `ProjectDetail.tsx` (stap 7) en `ProjectLineForm.tsx` (stap 8) zijn er nog twee plekken:

1. **`components/projects/ImportCsvDialog/ImportCsvDialog.tsx`** — in `confirm()` (rond regel 72-89), de `rows.map((row) => ({ ... }))`-body bevat al `endsOn: null,`. Voeg ernaast toe: `startsOn: null,` (CSV-import maakt altijd eenmalige (`one_off`) regels aan, dus dit is altijd `null`).
2. **`components/projects/BookLineDialog/BookLineDialog.tsx`** — in `submit()` (rond regel 63-77), het `onSave(projectId, { ... })`-object bevat al `endsOn: null,`. Voeg ernaast toe: `startsOn: null,` (dit boekt ook altijd een eenmalige regel vanuit een mail).

Acceptatiecriterium: `npx tsc --noEmit` geeft geen fouten over ontbrekende `startsOn`-property op deze twee bestanden.

---

## Gotcha's en beperkingen

- Volg exact het bestaande `endsOn`-patroon — dit is bewust geen nieuw concept, maar een symmetrische aanvulling. Als je twijfelt hoe iets moet, zoek op `endsOn`/`ends_on` in het betreffende bestand en doe hetzelfde voor `startsOn`/`starts_on`.
- `startsOn` is alleen relevant voor `billing === "periodic"`. Voor `billing === "one_off"` blijft het altijd `null`, exact zoals `endsOn` dat nu al is.
- De volgorde van parameters in `overlapsMonth()` en `activeMonthsInYear()` is `lineStartsOn` vóór `lineEndsOn` — wees consistent op alle aanroepplekken, anders verwissel je per ongeluk start- en einddatum in een boolean-check.
- Dit bestand overlapt in bestanden met `todo-btw-incl-excl.md`. Voer dit bestand eerst uit en merge naar `main` voordat die andere todo start, om mergeconflicten te voorkomen.
- Raak de matching/tagging-logica (`counterparty_rules`, `RuleTagDialog`, `CategorySelect`) niet aan — die valt buiten deze taak.

## Definitie van klaar

- [ ] Een periodieke regel kan een optionele startdatum krijgen via het formulier, naast de al bestaande optionele einddatum
- [ ] Een regel met startdatum 1 september telt niet mee vóór september, in zowel de maand- als jaarweergave, en niet in de "doorlopend per maand"-weergave als de datum in de toekomst ligt
- [ ] De betaal-chips per maand (in `ProjectDetail`) beginnen pas bij de ingestelde startmaand
- [ ] CSV-export sluit regels uit die pas na het geëxporteerde jaar beginnen
- [ ] Leeg laten van het startdatum-veld geeft exact hetzelfde gedrag als vóór deze wijziging
- [ ] Geen TypeScript-errors (`npx tsc --noEmit`), `npm run lint` en `npm test` slagen
- [ ] Alle gewijzigde bestanden blijven onder de 500-regel-grens
