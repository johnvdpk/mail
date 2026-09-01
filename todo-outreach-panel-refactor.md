# Todo: Outreach — OutreachPanel.tsx opsplitsen vóór de 500-regelgrens

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-leads-tab-ux.md`, `todo-outreach-automail-safety.md`, `todo-outreach-campaign-profile-columns.md`, `todo-outreach-import-preview.md`, `todo-outreach-reply-matching-perf.md`, `todo-outreach-personalize-retry.md`
**Afhankelijkheden:** geen — dit bestand moet juist **als eerste** worden uitgevoerd. `todo-outreach-leads-tab-ux.md` bouwt voort op de structuur die dit bestand oplevert en mag pas starten nadat dit bestand is afgerond en gemerged (beide raken anders `components/outreach/OutreachPanel/OutreachPanel.tsx` gelijktijdig, met gegarandeerde merge-conflicten). De overige todo's in de reeks raken andere bestanden en kunnen wél parallel aan dit bestand draaien.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — IMAP/SMTP, PostgreSQL (`pg`), Docker op een VPS.
**Stack:** Next.js 15 (App Router), React 19, TypeScript, CSS Modules.

**Kernregels (uit CLAUDE.md, van toepassing op dit ticket):**
- **Max ~500 regels per bestand — harde lint-regel.** `eslint.config.mjs` heeft `max-lines: ["error", { max: 500, skipBlankLines: true, skipComments: true }]`. Dit is een build-blokkerende fout, geen richtlijn. Nooit `eslint-disable` toevoegen om dit te omzeilen — split het bestand langs een logische grens.
- **Domain-based mapstructuur:** `components/<domein>/<Component>/<Component>.tsx (+ .module.css)`, `lib/<domein>/<bestand>.ts`. Dit ticket blijft binnen het `outreach`-domein.
- **Engelse comments, alleen "waarom" niet "wat".** Comments zijn in het Engels en leggen alleen uit wat niet vanzelf uit de code blijkt.
- **Taalscheiding:** UI-teksten (labels, foutmeldingen) zijn Nederlands. Code, identifiers, comments zijn Engels.
- **Typed API-contracten:** gebruik `apiRequest<T>` (`lib/shared/api-request.ts`) en `useAsyncAction` (`lib/shared/use-async-action.ts`) voor elke client-side JSON-fetch. Geen kale `fetch`/`res.json()`.
- Na de wijziging moeten `npm run lint`, `npm test`, `npx tsc --noEmit` en `npx next build` allemaal slagen.

**Betrokken bestanden (lees deze als eerste):**
- `components/outreach/OutreachPanel/OutreachPanel.tsx` — 478 regels, bijna tegen de 500-regel-limiet. Bevat naast de campagne-CRUD (create/switch/delete) ook de leads-tab state, modal-orchestratie en tab-navigatie. Dit bestand wordt in dit ticket kleiner gemaakt.
- `components/outreach/OutreachLeads/OutreachLeads.tsx` — bestaand voorbeeld van hoe dit project een presentational subcomponent uit `OutreachPanel` heeft getrokken: puur props in, events uit, geen eigen state/fetch-logica, en hergebruikt `styles` uit `../OutreachPanel/OutreachPanel.module.css` in plaats van een eigen CSS-bestand. Volg dit patroon exact.
- `components/outreach/hooks/useOutreachState.ts` — bestaand voorbeeld van een outreach-hook (gaat over het tonen/verbergen van het hele outreach-paneel binnen `MailApp`, niet over campagnes specifiek — puur ter referentie voor bestandslocatie-conventie, de inhoud is niet relevant voor dit ticket).
- `lib/outreach/types.ts` — bevat de `Campaign`-type die door de nieuwe hook en component gebruikt wordt.
- `lib/shared/api-request.ts` en `lib/shared/use-async-action.ts` — de contracten die de nieuwe hook moet gebruiken.

## Wat er moet gebeuren

`OutreachPanel.tsx` staat op 478 van de maximaal 500 regels. De campagne-CRUD (lijst laden, nieuwe campagne aanmaken, campagne verwijderen — inclusief de bijbehorende toolbar-JSX met de campagne-switcher, het aanmaak-formulier en de verwijderknop) wordt eruit getrokken naar een eigen hook (`useCampaignCrud`) en een eigen presentational component (`CampaignSwitcher`), zodat er weer ruimte is voor toekomstige features in `OutreachPanel.tsx` (zoals de leads-tab-verbeteringen uit `todo-outreach-leads-tab-ux.md`, die dit ticket als voorwaarde heeft). Dit is een pure refactor: het gedrag van de UI mag op geen enkele manier veranderen.

## Stappen

### 1. Nieuwe hook: `useCampaignCrud`

**Bestand:** `components/outreach/hooks/useCampaignCrud.ts` (nieuw bestand)

Verplaats de volgende state en functies uit `OutreachPanel.tsx` naar deze hook, met deze aanpassingen:
- `createCampaign` en `removeCampaign` retourneren een `boolean` (succes/mislukt) in plaats van zelf tab-state of leads-state (`setTab`, `setSelected`, `setDrafts`) aan te passen — die state hoort niet bij deze hook en blijft in `OutreachPanel.tsx`. De aanroeper reageert op de return-waarde.
- `createCampaign` accepteert de naam als parameter (`createCampaign(name: string)`) in plaats van uit lokale `newName`-state te lezen — die state verhuist mee naar de nieuwe `CampaignSwitcher`-component (stap 2).

```ts
"use client";

import { useCallback, useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { Campaign } from "@/lib/outreach/types";

export function useCampaignCrud() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const loadCampaignsAction = useAsyncAction();
  const createAction = useAsyncAction();
  const deleteAction = useAsyncAction();
  const loadCampaignsRun = loadCampaignsAction.run;

  const campaign = campaigns.find((c) => c.id === activeId) ?? null;

  const loadCampaigns = useCallback(async () => {
    const data = await loadCampaignsRun(
      () => apiRequest<{ campaigns: Campaign[] }>("/api/outreach/campaigns"),
      "Campagnes ophalen mislukt"
    );
    if (!data) return;
    setCampaigns(data.campaigns);
    setActiveId((prev) => {
      if (prev && data.campaigns.some((c) => c.id === prev)) return prev;
      return data.campaigns[0]?.id ?? null;
    });
  }, [loadCampaignsRun]);

  async function createCampaign(name: string): Promise<boolean> {
    if (!name.trim()) return false;
    const data = await createAction.run(
      () =>
        apiRequest<{ campaign: Campaign }>("/api/outreach/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        }),
      "Campagne aanmaken mislukt"
    );
    if (!data?.campaign) return false;
    setCampaigns((prev) => [...prev, data.campaign]);
    setActiveId(data.campaign.id);
    return true;
  }

  async function removeCampaign(): Promise<boolean> {
    if (!campaign) return false;
    if (
      !window.confirm(
        `Campagne "${campaign.name}" verwijderen? Alle leads en verzonden mails van deze campagne gaan mee.`
      )
    ) {
      return false;
    }
    const data = await deleteAction.run(
      () =>
        apiRequest<{ ok: boolean }>(`/api/outreach/campaigns/${campaign.id}`, { method: "DELETE" }),
      "Campagne verwijderen mislukt"
    );
    if (!data?.ok) return false;
    const remaining = campaigns.filter((c) => c.id !== campaign.id);
    setCampaigns(remaining);
    setActiveId(remaining[0]?.id ?? null);
    return true;
  }

  return {
    campaigns,
    activeId,
    setActiveId,
    campaign,
    loadCampaigns,
    createCampaign,
    removeCampaign,
    loadCampaignsAction,
    createAction,
    deleteAction,
  };
}
```

Acceptatiecriterium: bestand compileert los, geen ongebruikte imports, geen `console.log`/`console.error` (client-side hook, geen pino nodig, maar ook geen losse logging — fouten gaan via `useAsyncAction`'s `.error`, precies zoals in het origineel).

---

### 2. Nieuwe component: `CampaignSwitcher`

**Bestand:** `components/outreach/CampaignSwitcher/CampaignSwitcher.tsx` (nieuw bestand)

Presentational component voor de toolbar (campagne-select, aanmaak-formulier, verwijderknop). Hergebruikt de bestaande CSS-classes uit `OutreachPanel.module.css` (`.toolbar`, `.switcher`, `.createForm`, `.delete`) via een relatieve import — **maak geen nieuw CSS-modulebestand aan**, exact zoals `OutreachLeads.tsx` dat al doet met `import styles from "../OutreachPanel/OutreachPanel.module.css";`.

De lokale `creating`/`newName`-state (voorheen in `OutreachPanel.tsx`) verhuist naar deze component. `onCreate` is async en retourneert een `boolean`; het formulier sluit en wist zichzelf alleen bij succes (zelfde gedrag als het origineel, waar dit ook alleen bij een geslaagde aanmaak gebeurde).

```tsx
"use client";

import { useState } from "react";
import type { Campaign } from "@/lib/outreach/types";
import styles from "../OutreachPanel/OutreachPanel.module.css";

type Props = {
  campaigns: Campaign[];
  activeId: number | null;
  campaign: Campaign | null;
  createLoading: boolean;
  deleteLoading: boolean;
  onSelect: (id: number | null) => void;
  onCreate: (name: string) => Promise<boolean>;
  onDelete: () => void;
};

export function CampaignSwitcher({
  campaigns,
  activeId,
  campaign,
  createLoading,
  deleteLoading,
  onSelect,
  onCreate,
  onDelete,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function submit() {
    const ok = await onCreate(newName);
    if (ok) {
      setNewName("");
      setCreating(false);
    }
  }

  return (
    <div className={styles.toolbar}>
      <label className={styles.switcher}>
        Campagne
        <select
          value={activeId ?? ""}
          onChange={(e) => onSelect(Number(e.target.value) || null)}
        >
          {campaigns.length === 0 && <option value="">Nog geen campagne</option>}
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {creating ? (
        <form
          className={styles.createForm}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Naam van de campagne"
            autoFocus
          />
          <button type="submit" disabled={createLoading}>
            Aanmaken
          </button>
          <button type="button" onClick={() => setCreating(false)}>
            Annuleren
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)}>
          Nieuwe campagne
        </button>
      )}
      {campaign && (
        <button type="button" className={styles.delete} onClick={onDelete} disabled={deleteLoading}>
          Verwijderen
        </button>
      )}
    </div>
  );
}
```

Acceptatiecriterium: component compileert los, geen ongebruikte imports.

---

### 3. `OutreachPanel.tsx` bijwerken om de hook en component te gebruiken

**Bestand:** `components/outreach/OutreachPanel/OutreachPanel.tsx`

- Verwijder: de `campaigns`/`activeId`-`useState`-regels, `loadCampaignsAction`/`createAction`/`deleteAction`, de `campaign`-derivatie, `loadCampaignsRun`, de `loadCampaigns`-`useCallback`, `createCampaign`-functie, `removeCampaign`-functie, `newName`/`creating`-state.
- Verwijder: de hele toolbar-JSX-blok (`<div className={styles.toolbar}>...</div>`, met de `<select>`, het aanmaak-`<form>` en de verwijderknop).
- Voeg toe: `import { useCampaignCrud } from "@/components/outreach/hooks/useCampaignCrud";` en `import { CampaignSwitcher } from "@/components/outreach/CampaignSwitcher/CampaignSwitcher";`.
- Voeg toe, bovenaan de component:
  ```ts
  const {
    campaigns,
    activeId,
    setActiveId,
    campaign,
    loadCampaigns,
    createCampaign,
    removeCampaign,
    loadCampaignsAction,
    createAction,
    deleteAction,
  } = useCampaignCrud();
  ```
- De bestaande `useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);` blijft ongewijzigd staan (roept nu de hook-versie aan).
- Vervang de weggehaalde toolbar-JSX door:
  ```tsx
  <CampaignSwitcher
    campaigns={campaigns}
    activeId={activeId}
    campaign={campaign}
    createLoading={createAction.loading}
    deleteLoading={deleteAction.loading}
    onSelect={(id) => {
      setActiveId(id);
      setPage(1);
      setSelected(new Map());
      setDrafts({});
    }}
    onCreate={async (name) => {
      const ok = await createCampaign(name);
      if (ok) setTab("profile");
      return ok;
    }}
    onDelete={() => {
      void (async () => {
        const ok = await removeCampaign();
        if (ok) {
          setSelected(new Map());
          setDrafts({});
          setTab("leads");
        }
      })();
    }}
  />
  ```
- De `error`-variabele die alle `useAsyncAction`-fouten combineert (rond regel 278-283 in het origineel) blijft ongewijzigd — die leest nu gewoon `loadCampaignsAction`/`createAction`/`deleteAction` uit de hook-destructuring in plaats van uit lokale `useState`.
- Alle andere state (`targets`, `stats`, `page`, `tab`, `selected`, `drafts`, modals, enz.) en de rest van de JSX (tabs-nav, leads-tab, profile-tab, sent-tab, automail-tab, modals) blijven ongewijzigd in `OutreachPanel.tsx` staan.

Voorbeeld van de gewenste situatie na deze stap (alleen de relevante top van de component, ter illustratie — de rest van het bestand blijft grotendeels hetzelfde):
```tsx
export function OutreachPanel({ aiReady, smtpReady, onClose, onOpenThread }: Props) {
  const {
    campaigns,
    activeId,
    setActiveId,
    campaign,
    loadCampaigns,
    createCampaign,
    removeCampaign,
    loadCampaignsAction,
    createAction,
    deleteAction,
  } = useCampaignCrud();
  const [targets, setTargets] = useState<CampaignTarget[]>([]);
  // ... rest van de bestaande state, ongewijzigd
```

Acceptatiecriterium: `OutreachPanel.tsx` staat merkbaar onder de 400 regels (ruim onder de 500-limiet), en de UI gedraagt zich functioneel identiek aan vóór de refactor: campagne kiezen, nieuwe campagne aanmaken (en automatisch naar het profiel-tabblad springen), campagne verwijderen (met dezelfde confirm-tekst) — niets van dit gedrag mag veranderen.

---

## Gotcha's en beperkingen

- Dit is een **pure refactor**, geen gedragswijziging. Test dat na de wijziging: (1) het aanmaken van een campagne nog steeds automatisch naar het "Campagne-instellingen"-tabblad springt, (2) verwijderen nog steeds dezelfde `window.confirm`-tekst toont en bij annuleren niets doet, (3) het wisselen van campagne nog steeds de leads-tab-state (`selected`, `drafts`, `page`) reset.
- `onDelete` in `CampaignSwitcher` is bewust een synchrone `() => void`-prop (niet async), omdat het knop-element in React geen async `onClick` verwacht — de async-logica zit in een IIFE binnen de `onDelete`-callback in `OutreachPanel.tsx`, precies zoals de rest van het bestand dat al doet voor andere async handlers (zie `onClick={() => void removeCampaign()}`-patroon in het origineel).
- Voeg geen nieuwe features toe in dit ticket (geen bulk-select, geen foutweergave, geen bevestiging bij versturen) — dat is voor `todo-outreach-leads-tab-ux.md`, dat pas na dit ticket start.

## Definitie van klaar

- [ ] `components/outreach/hooks/useCampaignCrud.ts` bestaat en bevat de campagne-CRUD-logica.
- [ ] `components/outreach/CampaignSwitcher/CampaignSwitcher.tsx` bestaat en bevat de toolbar-UI, hergebruikt `OutreachPanel.module.css`.
- [ ] `components/outreach/OutreachPanel/OutreachPanel.tsx` gebruikt beide en staat duidelijk onder de 500-regel-lintlimiet.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm test` — groen.
- [ ] `npx tsc --noEmit` — geen fouten.
- [ ] `npx next build` — slaagt.
- [ ] Handmatig getest (of via `npm run dev` + browser): campagne aanmaken, wisselen, verwijderen werken zoals voorheen.
