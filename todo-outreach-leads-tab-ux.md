# Todo: Outreach — Leads-tab UX (bevestiging, foutweergave, bulk-selectie, terminologie)

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-panel-refactor.md`, `todo-outreach-automail-safety.md`, `todo-outreach-campaign-profile-columns.md`, `todo-outreach-import-preview.md`, `todo-outreach-reply-matching-perf.md`, `todo-outreach-personalize-retry.md`
**Afhankelijkheden:** **`todo-outreach-panel-refactor.md` moet eerst zijn afgerond en gemerged.** Dat ticket haalt de campagne-CRUD uit `OutreachPanel.tsx` om ruimte te maken onder de 500-regel-lintlimiet; dit ticket voegt in datzelfde bestand nieuwe state en functies toe (foutregistratie bij batch-personalisatie, bulk-selectie). Zonder die refactor eerst loopt `OutreachPanel.tsx` opnieuw tegen de limiet aan of ontstaan er merge-conflicten. Controleer bij de start van dit ticket dat `components/outreach/hooks/useCampaignCrud.ts` en `components/outreach/CampaignSwitcher/CampaignSwitcher.tsx` al bestaan — zo niet, is de afhankelijkheid nog niet gemerged en moet je wachten.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — IMAP/SMTP, PostgreSQL (`pg`), Docker op een VPS. De `outreach`-module is een campagne-gebaseerd systeem voor het benaderen van leads: leads importeren, AI personaliseert per lead een mail op basis van tone-of-voice-instellingen, en de gebruiker verstuurt los of in bulk.
**Stack:** Next.js 15 (App Router), React 19, TypeScript, CSS Modules, PostgreSQL via `pg`.

**Kernregels (uit CLAUDE.md, van toepassing op dit ticket):**
- **Max ~500 regels per bestand — harde lint-regel** (`eslint.config.mjs`, `max-lines: ["error", { max: 500, ... }]`). Bewaak dit bij elke stap; als een bestand erover dreigt te gaan, splits het volgens hetzelfde patroon als `todo-outreach-panel-refactor.md` — voeg nooit een `eslint-disable` toe.
- **Domain-based mapstructuur:** blijft binnen `components/outreach/` en `lib/outreach/` en `app/api/outreach/`.
- **Engelse comments, alleen "waarom" niet "wat".**
- **Taalscheiding:** UI-teksten Nederlands, code/identifiers/comments Engels.
- **Typed API-contracten:** `apiRequest<T>` + `useAsyncAction`, geen kale `fetch`.
- **Structured logging via pino** server-side (`app/api/`): `logger` uit `lib/shared/logger.ts`, nooit `console.error`.
- Na de wijziging moeten `npm run lint`, `npm test`, `npx tsc --noEmit` en `npx next build` allemaal slagen.

**Betrokken bestanden (lees deze als eerste, in de staat ná `todo-outreach-panel-refactor.md`):**
- `components/outreach/OutreachPanel/OutreachPanel.tsx` — orchestrator; bevat de leads-tab-state (`targets`, `selected`, `drafts`, `batchProgress`, `statusFilter`, `appliedQuery`, enz.) en de `personalizeSelected()`-functie.
- `components/outreach/OutreachLeads/OutreachLeads.tsx` — presentational component voor de leads-tabel, filters en bulk-actiebalk. Hergebruikt CSS uit `../OutreachPanel/OutreachPanel.module.css`.
- `components/outreach/BatchSendModal/BatchSendModal.tsx` — modal voor het reviewen en (bulk) versturen van gepersonaliseerde mails.
- `lib/outreach/targets.ts` — bevat `listTargets()` en de niet-geëxporteerde helper `targetWhere()` die de WHERE-clausule opbouwt op basis van `status`/`q`-filters.
- `lib/outreach/types.ts` — `CampaignTarget`, `TargetStatus`, `TARGET_STATUS_LABELS`.
- `lib/shared/api-request.ts` — `apiRequest<T>`.
- `lib/auth/auth.ts` — `requireAuth()`, gebruikt in elke API-route.
- `lib/shared/logger.ts` — `logger`, gebruikt in elke API-route.

## Wat er moet gebeuren

Vier losstaande maar in dezelfde bestanden samenkomende UX-verbeteringen in de leads-tab:
1. Consistente terminologie tussen statuslabels en actieknoppen.
2. Een bevestigingsstap vóór "Verstuur alles" in de batch-modal — de enige onomkeerbare bulk-actie in de module die nu zonder stop-moment direct losgaat.
3. Zichtbare, per-lead foutmeldingen wanneer batch-personalisatie voor een deel van de selectie mislukt (nu wordt dit stil geslikt).
4. Een "selecteer alle leads die aan het filter voldoen"-actie, want bulk-selectie werkt nu alleen binnen de geladen pagina (max 200 leads).

## Stappen

### 1. Terminologie consistent maken

**Bestand:** `components/outreach/OutreachLeads/OutreachLeads.tsx`

De rij-acties in de tabel (rond de `onStatus`-knoppen) zeggen nu "Skip" en "Nee", terwijl de statistiekbalk en `TARGET_STATUS_LABELS` (`lib/outreach/types.ts`) "Uitgesloten" en "Geen interesse" zeggen voor exact dezelfde status. Maak de knoptekst consistent:

Zoek dit blok (in de `<td className={styles.rowActions}>`):
```tsx
<button type="button" onClick={() => onStatus(target, "excluded")}>
  {target.status === "excluded" ? "Terug" : "Skip"}
</button>
<button type="button" onClick={() => onStatus(target, "not_interested")}>
  {target.status === "not_interested" ? "Terug" : "Nee"}
</button>
```
En vervang door:
```tsx
<button type="button" onClick={() => onStatus(target, "excluded")}>
  {target.status === "excluded" ? "Terug" : "Uitsluiten"}
</button>
<button type="button" onClick={() => onStatus(target, "not_interested")}>
  {target.status === "not_interested" ? "Terug" : "Geen interesse"}
</button>
```

Acceptatiecriterium: geen enkele knop of statuslabel in de leads-tab gebruikt nog een ander woord dan `TARGET_STATUS_LABELS` voor dezelfde status.

---

### 2. Bevestiging vóór "Verstuur alles"

**Bestand:** `components/outreach/BatchSendModal/BatchSendModal.tsx`

De `sendAll()`-functie (rond regel 91) verstuurt zonder bevestiging naar alle resterende (nog niet verstuurde) leads in de queue. Dit is de enige bulk-actie in de hele outreach-module die écht mail naar echte mensen verstuurt zonder stop-moment (vergelijk met `removeCampaign()` in de campagne-CRUD, die wél een `window.confirm` heeft). Voeg dezelfde soort bevestiging toe, mét het aantal mails in de tekst.

Huidige code:
```tsx
async function sendAll() {
  if (!smtpReady) return;
  persistCurrent();
  setSendingAll(true);
  const remaining = queue.filter((t) => statuses[t.id]?.status !== "sent");
  setProgress({ current: 0, total: remaining.length });
  ...
```

Nieuwe code — bereken `remaining` vóór de confirm (nodig voor de aantallen in de tekst), en stop vroeg als de gebruiker annuleert:
```tsx
async function sendAll() {
  if (!smtpReady) return;
  const remaining = queue.filter((t) => statuses[t.id]?.status !== "sent");
  if (remaining.length === 0) return;
  if (
    !window.confirm(
      `Weet je zeker dat je ${remaining.length} mail${remaining.length === 1 ? "" : "s"} wilt versturen? Dit kan niet ongedaan worden gemaakt.`
    )
  ) {
    return;
  }
  persistCurrent();
  setSendingAll(true);
  setProgress({ current: 0, total: remaining.length });
  ...
```
(De rest van de functie — de `for`-loop die elke `remaining`-target verstuurt — blijft ongewijzigd; alleen de `remaining`-berekening verhuist naar vóór `persistCurrent()`/de confirm, en de losse `setSendingAll(true)` + oude `remaining`-declaratie eronder vervallen omdat ze al hierboven staan.)

Acceptatiecriterium: klikken op "Verstuur alles" toont eerst een confirm-dialoog met het juiste aantal; op annuleren gebeurt er niets (geen sends, geen progress-state); op bevestigen werkt het verzenden exact zoals voorheen.

---

### 3. Zichtbare fouten bij batch-personalisatie

**Bestanden:** `components/outreach/OutreachPanel/OutreachPanel.tsx` en `components/outreach/BatchSendModal/BatchSendModal.tsx`

Nu vangt `personalizeSelected()` in `OutreachPanel.tsx` fouten per lead stil af:
```tsx
} catch {
  // keep going; per-item errors show in the review modal
}
```
Dat commentaar klopt niet — er gebeurt niets zichtbaars. Los dit op door mislukte personalisaties bij te houden en door te geven aan `BatchSendModal`, die ze al vóór het versturen als "mislukt" in de queue-lijst toont (de modal heeft al een `ItemStatus`-type met een `"error"`-variant en een `statusLabel()`-functie die daar "mislukt" van maakt — hergebruik die, bouw niets nieuws).

**3a. `OutreachPanel.tsx` — fouten registreren**

Huidige `personalizeSelected`:
```tsx
async function personalizeSelected() {
  if (!campaign || !aiReady) return;
  const queue = [...selected.values()].filter((t) => t.status === "new");
  if (queue.length === 0) {
    setNotice("Geen nieuwe leads in de selectie. Al gemaild of overgeslagen tellen niet mee.");
    return;
  }
  setNotice(null);
  setBatchProgress({ current: 0, total: queue.length });
  for (let i = 0; i < queue.length; i++) {
    const target = queue[i];
    try {
      const data = await apiRequest<PersonalizeResult>(
        `/api/outreach/campaigns/${campaign.id}/targets/${target.id}/personalize`,
        { method: "POST" }
      );
      setDrafts((prev) => ({
        ...prev,
        [target.id]: { /* ... */ },
      }));
    } catch {
      // keep going; per-item errors show in the review modal
    }
    setBatchProgress({ current: i + 1, total: queue.length });
  }
  setBatchProgress(null);
  setShowBatch(true);
}
```

Voeg een nieuwe state toe naast de bestaande `drafts`-state:
```tsx
const [personalizeErrors, setPersonalizeErrors] = useState<Record<number, string>>({});
```

Werk `personalizeSelected` bij zodat het de fouten verzamelt en aan het eind in state zet:
```tsx
async function personalizeSelected() {
  if (!campaign || !aiReady) return;
  const queue = [...selected.values()].filter((t) => t.status === "new");
  if (queue.length === 0) {
    setNotice("Geen nieuwe leads in de selectie. Al gemaild of overgeslagen tellen niet mee.");
    return;
  }
  setNotice(null);
  setPersonalizeErrors({});
  setBatchProgress({ current: 0, total: queue.length });
  const failures: Record<number, string> = {};
  for (let i = 0; i < queue.length; i++) {
    const target = queue[i];
    try {
      const data = await apiRequest<PersonalizeResult>(
        `/api/outreach/campaigns/${campaign.id}/targets/${target.id}/personalize`,
        { method: "POST" }
      );
      setDrafts((prev) => ({
        ...prev,
        [target.id]: {
          subject: data.subject,
          text: data.text,
          html: data.html,
          bodyText: stripSignatureFromText(data.bodyText || data.text, campaign.profile.footer.text),
          findings: data.findings,
          scan: data.scan,
          websiteError: data.websiteError,
          usedMetadataFallback: data.usedMetadataFallback,
        },
      }));
    } catch (err) {
      failures[target.id] = err instanceof Error ? err.message : "Personalisatie mislukt";
    }
    setBatchProgress({ current: i + 1, total: queue.length });
  }
  setPersonalizeErrors(failures);
  setBatchProgress(null);
  setShowBatch(true);
}
```

Geef `personalizeErrors` door aan `BatchSendModal` in de JSX waar die al wordt gerenderd:
```tsx
{showBatch && campaign && (
  <BatchSendModal
    campaign={campaign}
    queue={selectedTargets}
    drafts={drafts}
    personalizeErrors={personalizeErrors}
    smtpReady={smtpReady}
    onClose={() => setShowBatch(false)}
    onDraftChange={(id, draft) => setDrafts((prev) => ({ ...prev, [id]: draft }))}
    onSent={() => {
      if (activeId) void loadTargets(activeId, page);
    }}
  />
)}
```

**3b. `BatchSendModal.tsx` — fouten tonen**

Voeg de nieuwe prop toe aan `Props`:
```tsx
type Props = {
  campaign: Campaign;
  queue: CampaignTarget[];
  drafts: Record<number, EmailDraft>;
  personalizeErrors?: Record<number, string>;
  smtpReady: boolean;
  onClose: () => void;
  onDraftChange: (targetId: number, draft: EmailDraft) => void;
  onSent: (targetId: number) => void;
};
```

Seed de bestaande `statuses`-state met deze fouten bij het openen van de modal, in plaats van een lege `{}`:
```tsx
export function BatchSendModal({
  campaign,
  queue,
  drafts,
  personalizeErrors,
  smtpReady,
  onClose,
  onDraftChange,
  onSent,
}: Props) {
  const [index, setIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, { status: ItemStatus; detail?: string }>>(
    () => {
      const initial: Record<number, { status: ItemStatus; detail?: string }> = {};
      for (const [id, message] of Object.entries(personalizeErrors ?? {})) {
        initial[Number(id)] = { status: "error", detail: `Personalisatie mislukt: ${message}` };
      }
      return initial;
    }
  );
  ...
```

In `sendAll()` moet de `remaining`-filter (die je in stap 2 al hebt aangepast) ook leads met een reeds bekende `"error"`-status overslaan, zodat de specifieke personalisatie-foutmelding niet wordt overschreven door de generieke "Geen onderwerp of tekst"-skip-melding (die anders alsnog zou triggeren omdat een mislukte personalisatie een leeg concept oplevert):
```tsx
const remaining = queue.filter(
  (t) => statuses[t.id]?.status !== "sent" && statuses[t.id]?.status !== "error"
);
```

Acceptatiecriterium: als een deel van de batch-personalisatie mislukt, zie je die leads bij het openen van de review-modal meteen als "mislukt" in de queue-lijst staan, met de foutmelding zichtbaar zodra je dat item selecteert (via de bestaande `currentStatus?.detail`-weergave). "Verstuur alles" probeert deze leads niet opnieuw te versturen met een leeg concept.

---

### 4. "Selecteer alle leads die aan het filter voldoen"

**Bestanden:** `lib/outreach/targets.ts`, nieuw bestand `app/api/outreach/campaigns/[id]/targets/select-all/route.ts`, `components/outreach/OutreachPanel/OutreachPanel.tsx`, `components/outreach/OutreachLeads/OutreachLeads.tsx`.

Nu selecteert `togglePage()` alleen de leads die al op de huidige pagina staan (max 200, `PAGE_SIZE_OPTIONS` in `OutreachLeads.tsx`). Bij een filter dat meer dan 200 leads matcht, moet je pagina voor pagina selecteren om bulk te personaliseren/versturen. Voeg een actie toe die in één keer alle leads selecteert die aan het huidige filter (`status`, zoekterm) voldoen, met een harde bovengrens om te voorkomen dat een pathologisch grote resultaatset (duizenden rijen) in één keer naar de browser-tab wordt gehaald.

**4a. `lib/outreach/targets.ts` — nieuwe functie**

Voeg toe, in hetzelfde bestand als `listTargets` (zodat de niet-geëxporteerde `targetWhere()`-helper hergebruikt kan worden — exporteer die zelf niet, roep 'm gewoon aan vanuit de nieuwe functie in hetzelfde bestand):
```ts
const SELECT_ALL_CAP = 2000;

/**
 * All targets matching the status/q filter, not capped by the normal 200-row page
 * limit — used for "select all matching" bulk actions. Capped at SELECT_ALL_CAP to
 * avoid loading a pathologically large result set into the browser tab; `truncated`
 * tells the caller the true count is higher so it can warn the user.
 */
export async function listAllMatchingTargets(
  campaignId: number,
  filters: Pick<TargetFilters, "status" | "q">
): Promise<{ targets: CampaignTarget[]; truncated: boolean }> {
  const { clauses, params } = targetWhere(campaignId, filters);
  const queryParams = [...params, SELECT_ALL_CAP + 1];
  const result = await query<TargetRow>(
    `SELECT * FROM campaign_targets
     WHERE ${clauses.join(" AND ")}
     ORDER BY name ASC, id ASC
     LIMIT $${queryParams.length}`,
    queryParams
  );
  const truncated = result.rows.length > SELECT_ALL_CAP;
  return { targets: result.rows.slice(0, SELECT_ALL_CAP).map(toTarget), truncated };
}
```

**4b. Nieuwe route**

**Bestand:** `app/api/outreach/campaigns/[id]/targets/select-all/route.ts` (nieuw bestand — volg exact het patroon van `app/api/outreach/campaigns/[id]/targets/route.ts`'s bestaande `GET`-handler voor auth/parsing/error-afhandeling):
```ts
import { requireAuth } from "@/lib/auth/auth";
import { getCampaign } from "@/lib/outreach/campaigns";
import { isTargetStatus, listAllMatchingTargets } from "@/lib/outreach/targets";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseId(id: string): number | null {
  const value = Number(id);
  return Number.isInteger(value) ? value : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAuth();
  if (denied) return denied;

  const campaignId = parseId((await params).id);
  if (campaignId === null) {
    return NextResponse.json({ error: "Ongeldig campagne-id" }, { status: 400 });
  }

  try {
    const campaign = await getCampaign(campaignId);
    if (!campaign) return NextResponse.json({ error: "Campagne niet gevonden" }, { status: 404 });

    const search = new URL(request.url).searchParams;
    const statusParam = search.get("status") ?? "";
    const q = search.get("q") ?? undefined;
    const status = isTargetStatus(statusParam) ? statusParam : undefined;

    const result = await listAllMatchingTargets(campaignId, { status, q });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Leads selecteren mislukt";
    logger.error({ route: "outreach/campaigns/[id]/targets/select-all", method: "GET", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**4c. `OutreachPanel.tsx` — client-actie**

Voeg een `useAsyncAction` en functie toe (bij de andere leads-tab-functies zoals `togglePage`):
```tsx
const selectAllAction = useAsyncAction();

async function selectAllMatching() {
  if (!campaign) return;
  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (appliedQuery.trim()) params.set("q", appliedQuery.trim());
  const data = await selectAllAction.run(
    () =>
      apiRequest<{ targets: CampaignTarget[]; truncated: boolean }>(
        `/api/outreach/campaigns/${campaign.id}/targets/select-all?${params}`
      ),
    "Alle leads selecteren mislukt"
  );
  if (!data) return;
  setSelected(new Map(data.targets.map((t) => [t.id, t])));
  if (data.truncated) {
    setNotice(
      `Alleen de eerste ${data.targets.length} leads zijn geselecteerd (limiet bereikt) — verfijn het filter voor de rest.`
    );
  }
}
```
Geef 'm door aan `OutreachLeads` als nieuwe prop, samen met de loading-state:
```tsx
<OutreachLeads
  ...
  selectAllLoading={selectAllAction.loading}
  onSelectAllMatching={() => void selectAllMatching()}
  ...
/>
```

**4d. `OutreachLeads.tsx` — knop**

Voeg de nieuwe props toe aan `Props`:
```tsx
selectAllLoading: boolean;
onSelectAllMatching: () => void;
```
Toon een knop direct onder de `.filters`-balk, alleen zichtbaar als er meer matchende leads zijn dan er op de huidige pagina staan (anders heeft de actie geen toegevoegde waarde boven de bestaande "Selecteer pagina"-checkbox):
```tsx
{filteredTotal > targets.length && (
  <p className={styles.hint}>
    <button type="button" onClick={onSelectAllMatching} disabled={selectAllLoading}>
      {selectAllLoading
        ? "Bezig…"
        : `Selecteer alle ${filteredTotal} leads die aan het filter voldoen`}
    </button>
  </p>
)}
```
Plaats dit blok direct na de `</div>` die de `.filters`-div sluit, vóór het `batchProgress`-blok.

Controleer of `styles.hint` bestaat in `OutreachPanel.module.css` — zo niet, voeg toe:
```css
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}

.hint button {
  font: inherit;
  color: inherit;
}
```

Acceptatiecriterium: bij een filter met meer resultaten dan de huidige paginagrootte verschijnt de knop; klikken selecteert alle matchende leads (tot de cap van 2000) in `selected`, zichtbaar aan de teller in de bulk-actiebalk ("N geselecteerd").

---

## Gotcha's en beperkingen

- Stap 3 en stap 2 raken allebei `BatchSendModal.tsx` — voer ze in de gegeven volgorde (2 vóór 3) uit binnen dit ticket, niet als losse parallelle taken, anders overschrijf je elkaars wijzigingen in hetzelfde bestand.
- De `SELECT_ALL_CAP` van 2000 in stap 4 is een expliciete keuze om te voorkomen dat de browser-tab duizenden `CampaignTarget`-objecten in geheugen houdt én om te voorkomen dat een daaropvolgende "Personaliseer & review" op zo'n selectie duizenden sequentiële AI-calls in de browser probeert te doen (dat kan minuten tot uren duren met de tab open). Verlaag deze cap niet stilzwijgend verder zonder het ook in de UI-tekst te reflecteren.
- `personalizeErrors` in stap 3 is bewust een aparte state naast `drafts`, niet een uitbreiding van `EmailDraft` — een mislukte personalisatie heeft geen concept-inhoud, dus hoort niet in dezelfde structuur als een geslaagd concept.
- Wijzig `ItemStatus` in `BatchSendModal.tsx` niet — die heeft al een `"error"`-variant, precies wat nodig is.

## Definitie van klaar

- [ ] Knoptekst in de leads-tabel komt overeen met `TARGET_STATUS_LABELS`.
- [ ] "Verstuur alles" toont een confirm met het juiste aantal vóór er iets wordt verstuurd; annuleren doet niets.
- [ ] Een mislukte batch-personalisatie is zichtbaar per lead in de review-modal, met foutmelding.
- [ ] "Selecteer alle N leads die aan het filter voldoen" werkt, inclusief de cap-waarschuwing bij een te grote resultaatset.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm test` — groen.
- [ ] `npx tsc --noEmit` — geen fouten.
- [ ] `npx next build` — slaagt.
- [ ] `OutreachPanel.tsx` blijft onder de 500-regel-lintlimiet (reken dit na met `npm run lint`, die faalt hard als het misgaat).
