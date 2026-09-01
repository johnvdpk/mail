# Todo: Outreach — Preview-stap bij het importeren van leads

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-panel-refactor.md`, `todo-outreach-leads-tab-ux.md`, `todo-outreach-automail-safety.md`, `todo-outreach-campaign-profile-columns.md`, `todo-outreach-reply-matching-perf.md`, `todo-outreach-personalize-retry.md`
**Afhankelijkheden:** geen. Dit bestand raakt alleen `components/outreach/ImportLeadsModal/ImportLeadsModal.tsx` en zijn CSS-module — geen overlap met de andere todo's, kan volledig parallel draaien.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — IMAP/SMTP, PostgreSQL, Docker op een VPS.
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules.

**Kernregels (uit CLAUDE.md, van toepassing op dit ticket):**
- **Taalscheiding:** UI-teksten Nederlands, code/identifiers/comments Engels.
- **Typed API-contracten:** `apiRequest<T>` + `useAsyncAction` voor de daadwerkelijke import-POST — dat gebruikt het bestand al correct, blijft zo.
- Na de wijziging moeten `npm run lint`, `npm test`, `npx tsc --noEmit` en `npx next build` allemaal slagen.

**Betrokken bestanden (lees deze als eerste):**
- `components/outreach/ImportLeadsModal/ImportLeadsModal.tsx` — 117 regels. Parsed nu een JSON-bestand client-side (`asRows()`) en post het resultaat direct naar de server zonder tussenstap. Hier gebeurt de wijziging.
- `components/outreach/ImportLeadsModal/ImportLeadsModal.module.css` — bevat al `.overlay`, `.dialog`, `.head`, `.title`, `.sub`, `.error`, `.ok`, `.hint`, `.actions` (die laatste bestaat al maar wordt nu nergens gebruikt — hier komt de nieuwe knoppenrij in). Hier komen twee nieuwe classes bij voor de preview-tabel.
- `lib/outreach/types.ts` — bevat `TargetImportRow` (`{ email, name, website?, attributes? }`) en `ImportResult`, ongewijzigd te gebruiken.
- `lib/shared/api-request.ts` en `lib/shared/use-async-action.ts` — de contracten die dit bestand al gebruikt en moet blijven gebruiken.

## Wat er moet gebeuren

`ImportLeadsModal` parseert nu een JSON-bestand en stuurt het resultaat direct naar de server zodra je een bestand kiest — er is geen moment om te controleren of de parsing klopt (bijvoorbeeld: zijn de juiste velden herkend, kloppen de kolomnamen) vóórdat er echt wordt geïmporteerd. Voeg een preview-stap toe: na het kiezen van een bestand toont de modal een tabel met de eerste rijen (email, naam, website, extra velden) plus een telling, en pas na een expliciete "Importeren"-klik gaat het request naar de server. Een "Ander bestand kiezen"-knop laat je teruggaan naar de bestandskeuze zonder te importeren.

## Stappen

### 1. `ImportLeadsModal.tsx` herstructureren met een preview-stap

**Bestand:** `components/outreach/ImportLeadsModal/ImportLeadsModal.tsx`

Vervang de volledige inhoud van het bestand door:
```tsx
"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { ImportResult, TargetImportRow } from "@/lib/outreach/types";
import styles from "./ImportLeadsModal.module.css";

const PREVIEW_LIMIT = 20;

type Props = {
  campaignId: number;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
};

function asRows(parsed: unknown): { rows: TargetImportRow[]; skipped: number } {
  if (!Array.isArray(parsed)) throw new Error("JSON moet een array van leads zijn");

  const rows: TargetImportRow[] = [];
  let skipped = 0;
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    const rec = item as Record<string, unknown>;
    const email = typeof rec.email === "string" ? rec.email : "";
    const name = typeof rec.name === "string" ? rec.name : "";
    if (!email || !name) {
      skipped += 1;
      continue;
    }
    const website = typeof rec.website === "string" ? rec.website : undefined;
    const attributes =
      rec.attributes && typeof rec.attributes === "object" && !Array.isArray(rec.attributes)
        ? (rec.attributes as Record<string, unknown>)
        : {};
    rows.push({ email, name, website, attributes });
  }
  return { rows, skipped };
}

export function ImportLeadsModal({ campaignId, onClose, onImported }: Props) {
  const parseAction = useAsyncAction();
  const importAction = useAsyncAction();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<TargetImportRow[] | null>(null);
  const [clientSkipped, setClientSkipped] = useState(0);

  async function onFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Bestand is geen geldige JSON");
    }

    const { rows, skipped } = asRows(parsed);
    if (rows.length === 0) {
      throw new Error("Geen geldige rijen gevonden (email + name verplicht)");
    }
    setClientSkipped(skipped);
    setParsedRows(rows);
  }

  function reset() {
    setParsedRows(null);
    setClientSkipped(0);
    setFileName(null);
  }

  async function confirmImport() {
    if (!parsedRows) return;
    const result = await importAction.run(
      () =>
        apiRequest<ImportResult>(`/api/outreach/campaigns/${campaignId}/targets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: parsedRows }),
        }),
      "Importeren mislukt"
    );
    if (!result) return;
    onImported({
      ...result,
      skipped: result.skipped + clientSkipped,
      skipReasons: [
        ...(clientSkipped ? [`${clientSkipped} rijen zonder e-mailadres of naam overgeslagen`] : []),
        ...result.skipReasons,
      ],
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>Importeer leads</h2>
            <p className={styles.sub}>
              JSON-array met objecten <code>{`{ email, name, website?, attributes? }`}</code>.
              Camping-exports: map <code>scrapedEmail</code> naar <code>email</code> en extra
              velden naar <code>attributes</code> vóór je uploadt.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
        </header>

        {!parsedRows ? (
          <>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void parseAction.run(() => onFile(file), "Bestand lezen mislukt");
              }}
            />
            {fileName && <p className={styles.hint}>{fileName}</p>}
            {parseAction.loading && <p className={styles.hint}>Bestand lezen…</p>}
            {parseAction.error && <p className={styles.error}>{parseAction.error}</p>}
          </>
        ) : (
          <>
            <p className={styles.hint}>
              {parsedRows.length} geldige rijen gevonden
              {clientSkipped > 0 ? `, ${clientSkipped} overgeslagen (geen e-mailadres of naam)` : ""}.
              Controleer de eerste {Math.min(PREVIEW_LIMIT, parsedRows.length)} hieronder vóór je
              importeert.
            </p>
            <div className={styles.previewWrap}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Naam</th>
                    <th>Website</th>
                    <th>Extra velden</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, PREVIEW_LIMIT).map((row, index) => (
                    <tr key={`${row.email}-${index}`}>
                      <td>{row.email}</td>
                      <td>{row.name}</td>
                      <td>{row.website || "—"}</td>
                      <td>
                        {row.attributes && Object.keys(row.attributes).length > 0
                          ? Object.keys(row.attributes).join(", ")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRows.length > PREVIEW_LIMIT && (
              <p className={styles.hint}>en {parsedRows.length - PREVIEW_LIMIT} meer…</p>
            )}
            {importAction.error && <p className={styles.error}>{importAction.error}</p>}
            <div className={styles.actions}>
              <button type="button" onClick={reset} disabled={importAction.loading}>
                Ander bestand kiezen
              </button>
              <button type="button" onClick={() => void confirmImport()} disabled={importAction.loading}>
                {importAction.loading ? "Importeren…" : `Importeer ${parsedRows.length} leads`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Belangrijkste verschillen met het origineel:
- `onFile` post niet langer direct naar de server — het zet alleen `parsedRows`/`clientSkipped`/`fileName` in state.
- Een nieuwe `confirmImport()`-functie doet de daadwerkelijke `POST` (identieke request-body en response-afhandeling als voorheen), aangeroepen via de nieuwe "Importeer N leads"-knop.
- `reset()` laat de gebruiker teruggaan naar de bestandskeuze zonder te importeren.
- Twee `useAsyncAction`-instanties in plaats van één: `parseAction` voor het lezen/parsen van het bestand, `importAction` voor de daadwerkelijke server-import — zo blijven de foutmeldingen van "bestand is geen geldige JSON" en "server wees het import-request af" apart zichtbaar in plaats van door elkaar te lopen.

Acceptatiecriterium: een JSON-bestand kiezen toont eerst de preview-tabel (max 20 rijen zichtbaar, met een "en N meer…"-regel erbij als er meer zijn) zonder dat er al iets naar de server is gestuurd; pas op "Importeer N leads" gaat het echte request eruit; "Ander bestand kiezen" reset naar de bestandskeuze.

---

### 2. CSS voor de preview-tabel

**Bestand:** `components/outreach/ImportLeadsModal/ImportLeadsModal.module.css`

Voeg toe, aan het eind van het bestand:
```css
.previewWrap {
  max-height: 40vh;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.previewTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.previewTable th,
.previewTable td {
  padding: 0.4rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 14rem;
}

.previewTable th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.72rem;
  position: sticky;
  top: 0;
  background: var(--card);
}
```

Acceptatiecriterium: de preview-tabel scrollt binnen zijn eigen container bij veel rijen of brede content (geen horizontale scroll van de hele modal, consistent met de "wide content moet in eigen overflow-container scrollen"-eis voor dit soort UI), en blijft leesbaar in zowel het lichte als het donkere thema (gebruikt bestaande CSS-custom-properties zoals `var(--border)`, `var(--muted)`, `var(--card)` — geen losse kleurwaarden).

---

## Gotcha's en beperkingen

- De server-side validatie (`isValidEmail` in de `POST /api/outreach/campaigns/[id]/targets`-route, en de dedup-logica in `importTargets` in `lib/outreach/targets.ts`) verandert niet — de preview is puur een client-side weergave van wat er *gestuurd gaat worden*, geen vervanging van de server-side validatie. Rijen die er in de preview geldig uitzien kunnen nog steeds als "overgeslagen" terugkomen in het uiteindelijke `ImportResult` (bijvoorbeeld een ongeldig e-mailadres dat client-side niet gecontroleerd wordt) — dat bestaande gedrag (de `skipReasons`-melding na afloop in `OutreachPanel.tsx`'s `onImported`) blijft ongewijzigd.
- Verander de `asRows()`-parsing-logica zelf niet — die blijft functioneel identiek, alleen het moment waarop de server-POST plaatsvindt verschuift.

## Definitie van klaar

- [ ] Na het kiezen van een JSON-bestand verschijnt een preview-tabel met de eerste 20 rijen, vóórdat er iets naar de server gestuurd wordt.
- [ ] "Importeer N leads" stuurt het request en roept `onImported` aan zoals voorheen.
- [ ] "Ander bestand kiezen" reset de modal naar de bestandskeuze.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm test` — groen.
- [ ] `npx tsc --noEmit` — geen fouten.
- [ ] `npx next build` — slaagt.
