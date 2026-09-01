# Todo: Outreach — Waarde-labels toevoegen aan de kolommen-editor

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-panel-refactor.md`, `todo-outreach-leads-tab-ux.md`, `todo-outreach-automail-safety.md`, `todo-outreach-import-preview.md`, `todo-outreach-reply-matching-perf.md`, `todo-outreach-personalize-retry.md`
**Afhankelijkheden:** geen. Dit bestand raakt alleen `components/outreach/CampaignProfileEditor/CampaignProfileEditor.tsx` en zijn CSS-module — geen overlap met de andere todo's, kan volledig parallel draaien.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — IMAP/SMTP, PostgreSQL, Docker op een VPS.
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules.

**Kernregels (uit CLAUDE.md, van toepassing op dit ticket):**
- **Taalscheiding:** UI-teksten Nederlands, code/identifiers/comments Engels.
- **Geen DIY:** dit ticket voegt puur UI toe rond een al bestaande datastructuur (`ListColumn.values`) — er verandert niets aan het datamodel of de opslaglaag.
- Na de wijziging moeten `npm run lint`, `npm test`, `npx tsc --noEmit` en `npx next build` allemaal slagen.

**Betrokken bestanden (lees deze als eerste):**
- `components/outreach/CampaignProfileEditor/CampaignProfileEditor.tsx` — bevat de `ColumnEditor`-component (helemaal onderaan het bestand, rond regel 294-339). Hier gebeurt de wijziging.
- `components/outreach/CampaignProfileEditor/CampaignProfileEditor.module.css` — bevat al `.columnRow`, `.snippetCard`, `.snippetHint`, `.snippetList` die hergebruikt kunnen worden; hier komen een paar nieuwe classes bij.
- `lib/outreach/campaign-profile.ts` — bevat de `ListColumn`-type: `{ key: string; label: string; values?: Record<string, string> }`. Deze type hoeft **niet** te veranderen, `values` bestaat al.
- `lib/outreach/list-columns.ts` — `formatListColumnValue()` leest `column.values` om een ruwe attribute-waarde te vertalen naar een leesbaar label in de leadtabel. Dit is de reden waarom `values` er al is, maar nergens door de gebruiker in te vullen is.
- `components/outreach/AutomailPanel/AutomailPanel.tsx` — toont per kolom chips (`col.values ? <chips> : <range-inputs>`) voor de automail-categoriefilter. Dit is de tweede plek die stil blijft zonder deze editor — als `values` leeg blijft, krijgt de gebruiker daar altijd de min/max-inputs, ook voor een kolom die eigenlijk categorisch is.

## Wat er moet gebeuren

`ColumnEditor` in `CampaignProfileEditor.tsx` laat nu alleen `key` en `label` van een kolom instellen. De onderliggende `ListColumn`-type ondersteunt ook `values: Record<string, string>` (ruwe waarde → leesbaar label), maar daar is nergens een UI voor. Zonder die waarde-labels blijft de leadtabel ruwe attribute-waarden tonen in plaats van labels, en blijft de categorie-chip-filter in Automail onbereikbaar (die kiest alleen chips als `col.values` bestaat, anders een numeriek min/max-filter). Voeg een sub-editor toe waarmee je per kolom waarde→label-paren kunt toevoegen, hernoemen en verwijderen.

## Stappen

### 1. `ColumnEditor` uitbreiden met een waarden-sub-editor

**Bestand:** `components/outreach/CampaignProfileEditor/CampaignProfileEditor.tsx`

Huidige `ColumnEditor` (helemaal onderaan het bestand):
```tsx
function ColumnEditor({
  columns,
  onChange,
}: {
  columns: ListColumn[];
  onChange: (columns: ListColumn[]) => void;
}) {
  return (
    <div className={styles.snippetList}>
      <p className={styles.snippetHint}>
        Extra kolommen in de leadtabel, per campagne. De sleutel moet matchen met een veld in
        attributes (bijv. qualityScore of bookingType).
      </p>
      {columns.map((column, index) => (
        <div key={`${column.key}-${index}`} className={styles.columnRow}>
          <input
            value={column.key}
            placeholder="sleutel"
            onChange={(e) =>
              onChange(columns.map((c, i) => (i === index ? { ...c, key: e.target.value } : c)))
            }
          />
          <input
            value={column.label}
            placeholder="kolomtitel"
            onChange={(e) =>
              onChange(columns.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))
            }
          />
          <button
            type="button"
            onClick={() => onChange(columns.filter((_, i) => i !== index))}
          >
            Weg
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...columns, { key: "", label: "" }])}
      >
        Kolom toevoegen
      </button>
    </div>
  );
}
```

Vervang door onderstaande versie. De structuur per kolom verandert van een platte `.columnRow` naar een `.snippetCard` (zoals elders in dit bestand al gebruikt, bijvoorbeeld in `SnippetList`) met daarbinnen de key/label-rij plus een nieuwe waarden-sub-sectie:
```tsx
function ColumnEditor({
  columns,
  onChange,
}: {
  columns: ListColumn[];
  onChange: (columns: ListColumn[]) => void;
}) {
  function updateColumn(index: number, patch: Partial<ListColumn>) {
    onChange(columns.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addValue(index: number) {
    updateColumn(index, { values: { ...(columns[index].values ?? {}), "": "" } });
  }

  function renameValueKey(index: number, oldKey: string, newKey: string) {
    const current = { ...(columns[index].values ?? {}) };
    const label = current[oldKey] ?? "";
    delete current[oldKey];
    current[newKey] = label;
    updateColumn(index, { values: current });
  }

  function updateValueLabel(index: number, key: string, label: string) {
    updateColumn(index, { values: { ...(columns[index].values ?? {}), [key]: label } });
  }

  function removeValue(index: number, key: string) {
    const current = { ...(columns[index].values ?? {}) };
    delete current[key];
    updateColumn(index, { values: Object.keys(current).length > 0 ? current : undefined });
  }

  return (
    <div className={styles.snippetList}>
      <p className={styles.snippetHint}>
        Extra kolommen in de leadtabel, per campagne. De sleutel moet matchen met een veld in
        attributes (bijv. qualityScore of bookingType).
      </p>
      {columns.map((column, index) => (
        <div key={`${column.key}-${index}`} className={styles.snippetCard}>
          <div className={styles.columnRow}>
            <input
              value={column.key}
              placeholder="sleutel"
              onChange={(e) => updateColumn(index, { key: e.target.value })}
            />
            <input
              value={column.label}
              placeholder="kolomtitel"
              onChange={(e) => updateColumn(index, { label: e.target.value })}
            />
            <button type="button" onClick={() => onChange(columns.filter((_, i) => i !== index))}>
              Weg
            </button>
          </div>

          <div className={styles.columnValues}>
            <p className={styles.snippetHint}>
              Waarde-labels (optioneel). Vul dit in als de kolom categorisch is (bijv. bookingType
              met waarden als "tommy" of "recranet") — dan toont Automail keuze-chips in plaats van
              een min/max-filter, en toont de leadtabel het label in plaats van de ruwe waarde.
              Laat leeg voor een numerieke kolom (bijv. qualityScore).
            </p>
            {Object.entries(column.values ?? {}).map(([rawValue, label]) => (
              <div key={rawValue} className={styles.columnValueRow}>
                <input
                  value={rawValue}
                  placeholder="ruwe waarde (bijv. tommy)"
                  onChange={(e) => renameValueKey(index, rawValue, e.target.value)}
                />
                <input
                  value={label}
                  placeholder="label (bijv. Tommy)"
                  onChange={(e) => updateValueLabel(index, rawValue, e.target.value)}
                />
                <button type="button" onClick={() => removeValue(index, rawValue)}>
                  Weg
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addValue(index)}>
              Waarde toevoegen
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...columns, { key: "", label: "" }])}>
        Kolom toevoegen
      </button>
    </div>
  );
}
```

Acceptatiecriterium: het toevoegen van een waarde bij een kolom, het invullen van ruwe waarde + label, en het verwijderen van een waarde werken allemaal en persisteren correct in de `profile.listColumns`-state (via de bestaande `markDirty("listColumns", ...)`-aanroep die al in de ouder-component staat — die hoeft niet aangepast te worden, `ColumnEditor` krijgt zijn `onChange`-prop al door via `<ColumnEditor columns={profile.listColumns} onChange={(listColumns) => markDirty("listColumns", listColumns)} />`, dat blijft ongewijzigd).

---

### 2. CSS voor de nieuwe sub-sectie

**Bestand:** `components/outreach/CampaignProfileEditor/CampaignProfileEditor.module.css`

Voeg toe, na de bestaande `.columnRow`-regel:
```css
.columnValues {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-left: 0.6rem;
  border-left: 2px solid var(--border);
}

.columnValueRow {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
```

Acceptatiecriterium: de nieuwe waarden-rijen zijn visueel onderscheiden van de key/label-rij erboven (lichte inspringing met een verticale lijn), consistent met de rest van de sectie-styling in dit bestand.

---

## Gotcha's en beperkingen

- Het hernoemen van een ruwe waarde (`renameValueKey`) werkt door de oude sleutel te verwijderen en een nieuwe toe te voegen in hetzelfde `values`-object. Als je tijdens het typen tijdelijk een sleutel intikt die al bestaat bij een andere waarde-rij, wordt die andere rij op dat moment overschreven — dit is een inherente eigenschap van het bewerken van object-sleutels via losse tekstvelden, en precies hetzelfde geldt al voor het bovenliggende `key`-veld van een kolom zelf (ook een los tekstveld zonder uniekheidscontrole). Bouw hier geen aparte oplossing voor in dit ticket — dat past bij het bestaande detailniveau van deze editor.
- Verander de `ListColumn`-type in `lib/outreach/campaign-profile.ts` niet — `values?: Record<string, string>` bestaat al en is precies wat nodig is.
- Dit ticket is puur UI. De server-side opslag (`updateCampaignProfile` in `lib/outreach/campaigns.ts`, via `mergeWithDefaults`) accepteert `listColumns` al ongewijzigd als JSON — er is geen route- of lib-wijziging nodig.

## Definitie van klaar

- [ ] Elke kolom in de campagne-instellingen (tabblad "Tabelkolommen") heeft een sub-sectie waarin je waarde→label-paren kunt toevoegen, hernoemen en verwijderen.
- [ ] Na opslaan en herladen van de campagne blijven de ingevulde waarde-labels behouden.
- [ ] De leadtabel (`OutreachLeads.tsx`, via `formatListColumnValue`) toont het label in plaats van de ruwe waarde voor een kolom met ingevulde `values`.
- [ ] De Automail-tab (`AutomailPanel.tsx`) toont chips in plaats van min/max-inputs voor een kolom met ingevulde `values`.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm test` — groen.
- [ ] `npx tsc --noEmit` — geen fouten.
- [ ] `npx next build` — slaagt.
