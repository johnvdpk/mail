# Todo: Categorie als eigen kolom in het totaaloverzicht baten/lasten

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** losstaand, onderdeel van dezelfde review als `todo-periodieke-regel-startdatum.md` en `todo-btw-incl-excl.md`, maar raakt geen enkel bestand dat die twee ook raken.
**Afhankelijkheden:** geen. Mag volledig parallel met de andere twee todo's draaien zonder mergeconflicten.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Next.js 15 / React 19 / TypeScript webmail-app (`d:\code\mail`) met een ingebouwde ZZP-boekhoudmodule "Financieel" (routes/componenten heten intern nog `projects`). De module heeft een tab "Bedrijf" met daarin `LedgerPanel` — een tabel die **alle** inkomsten/uitgaven van **alle** projecten in de gekozen periode toont (bankimport én handmatige regels door elkaar). Dit is wat de gebruiker "het totaaloverzicht baten/lasten" noemt.

**Stack:** Next.js 15, React 19, TypeScript, CSS Modules.

**Kernregels (zie ook CLAUDE.md):**
- Comments in het Engels, alleen "waarom" niet "wat"; UI-teksten in het Nederlands.
- Max ~500 regels per bestand (harde ESLint-regel) — dit bestand blijft ver daaronder, geen actie nodig.
- Geen nieuwe abstracties toevoegen die niet gevraagd zijn.

**Betrokken bestanden (lees deze als eerste):**
- `components/projects/LedgerPanel/LedgerPanel.tsx` — de tabelcomponent die aangepast moet worden
- `components/projects/LedgerPanel/LedgerPanel.module.css` — bijbehorende CSS Module
- `lib/projects/types.ts` — bevat het `LedgerRow`-type (regel 113-129), **niet wijzigen**, `category: string | null` staat er al op
- `app/globals.css` — CSS custom properties zoals `--accent`, `--accent-soft`, `--muted`, `--border` (regels 1-60), theme-aware voor licht/donker, hergebruik deze in plaats van hardcoded kleuren

## Wat er moet gebeuren

De gebruiker heeft feedback gegeven: hij koppelt via "Markeer als…" een categorie (bijv. "reiskosten") aan een banktransactie, en dat werkt ook echt — maar in het totaaloverzicht baten/lasten (`LedgerPanel`) ziet hij dat niet terug, omdat de categorie nu alleen als klein grijs tekstje achter de omschrijving staat (`· reiskosten`), terwijl het Project wél een eigen, prominente kolom heeft. Los dit op door Categorie net als Project een eigen kolom te geven, zodat de koppeling in één oogopslag zichtbaar is.

## Stappen

### 1. Categorie-kolom toevoegen aan de tabel

**Bestand:** `components/projects/LedgerPanel/LedgerPanel.tsx`

Wat er moet gebeuren:
- Voeg een `<th>Categorie</th>` toe aan de `<thead>` header-rij (regels 100-112), direct na de bestaande `<th>Project</th>`.
- Voeg een bijbehorende `<td>` toe aan elke rij in de `<tbody>` (regels 114-155), direct na de bestaande `<td className={styles.meta}>{row.projectName}</td>`. Toon `row.category`, met een duidelijk leesbare placeholder (bijv. een liggend streepje) wanneer er geen categorie is:
  ```tsx
  <td>
    {row.category ? (
      <span className={styles.categoryTag}>{row.category}</span>
    ) : (
      <span className={styles.meta}>—</span>
    )}
  </td>
  ```
- Verwijder de bestaande inline categorie-tekst uit de Omschrijving-kolom (regel ~127-131), die stond er nu:
  ```tsx
  <td>
    {row.name}
    {row.category && <span className={styles.meta}> · {row.category}</span>}
    {row.note && <div className={styles.meta}>{row.note}</div>}
  </td>
  ```
  Dit wordt:
  ```tsx
  <td>
    {row.name}
    {row.note && <div className={styles.meta}>{row.note}</div>}
  </td>
  ```
  (De categorie staat nu alleen nog in de nieuwe eigen kolom, niet dubbel op twee plekken.)
- Pas de `colSpan` in de `<tfoot>`-totaalrij aan (regel ~159: `<td colSpan={4}>Totaal ({rows.length} regels)</td>`) van `4` naar `5`, omdat er nu een kolom bij is gekomen vóór de "In"-kolom.

Voorbeeld van de gewenste kolomvolgorde in de header na deze stap:

```tsx
<thead>
  <tr>
    <th />
    <th>Datum</th>
    <th>Omschrijving</th>
    <th>Project</th>
    <th>Categorie</th>
    <th>In</th>
    <th>Uit</th>
    <th>Betaald</th>
    <th />
  </tr>
</thead>
```

Acceptatiecriterium: elke rij in het totaaloverzicht toont zijn categorie (of een duidelijk "geen categorie"-teken) in een eigen kolom, los van de omschrijving en los van de Project-kolom.

---

### 2. Styling van de categorie-tag

**Bestand:** `components/projects/LedgerPanel/LedgerPanel.module.css`

Voeg een nieuwe class `.categoryTag` toe die de categorie duidelijker laat opvallen dan de bestaande grijze `.meta`-stijl (die was nu juist het probleem — te onopvallend). Gebruik de bestaande theme-aware CSS-variabelen uit `app/globals.css`, geen nieuwe kleuren verzinnen:

```css
.categoryTag {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.75rem;
  white-space: nowrap;
}
```

Voeg deze class toe onderaan het bestand, in dezelfde stijl als de bestaande `.badgePaid`/`.badgePartial`/`.badgeOpen`-classes (regels 69-93) — dat is het bestaande patroon voor kleine statuslabels in deze tabel.

Acceptatiecriterium: de categorie-kolom valt visueel op als een duidelijk label (net zoals de "Betaald"/"Open"-badges dat al doen), niet als grijze bijschrift-tekst.

---

## Gotcha's en beperkingen

- Raak `lib/projects/types.ts` niet aan — `LedgerRow.category` bestaat al, er is geen backend/type-wijziging nodig voor deze taak, puur presentatie.
- Verander niets aan de Project-kolom of aan de matching-logica (`counterparty_rules`, `RuleTagDialog`) — die werkt al correct, dit is uitsluitend een weergave-fix in `LedgerPanel`.
- Zorg dat de tabel niet breder wordt dan het scherm op smalle viewports veroorzaakt geen probleem hoeft op te leveren dat nu ook al niet is opgelost voor de Project-kolom — geen extra responsive-werk nodig, volg het bestaande patroon van de tabel.

## Definitie van klaar

- [ ] Totaaloverzicht (tab Bedrijf → LedgerPanel) toont een eigen "Categorie"-kolom naast "Project"
- [ ] Een regel zonder categorie toont een duidelijk leesbaar "geen categorie"-teken, geen lege cel
- [ ] De categorie staat niet meer dubbel (kolom + inline tekst achter de omschrijving)
- [ ] `npm run lint` en `npx tsc --noEmit` slagen zonder nieuwe errors
- [ ] Visueel gecontroleerd (of beschreven) dat de kolom leesbaar is in zowel licht als donker thema (gebruik `--accent`/`--accent-soft`, geen hardcoded kleuren)
