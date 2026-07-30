# Todo: AI inbox-sortering (UI)

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-ai-sort-api.md`, `todo-ai-sort-ui.md`, `todo-calendar-ics-google.md`
**Afhankelijkheden:** `todo-ai-sort-api.md` moet eerst klaar zijn (endpoints `/api/sort/preview` en `/api/sort/apply`)

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — Strato IMAP + OpenRouter AI.
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules (geen Tailwind).

**Kernregels:**
- Styling: `ComponentName.tsx` + `ComponentName.module.css`; CSS kort, geen duplicatie
- Gebruik CSS-variabelen uit `app/globals.css`: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--muted`, `--accent`, `--accent-hover`, `--accent-soft`, `--green`, `--red`, `--radius`, `--radius-sm`
- Comments in het Engels; UI-tekst in het Nederlands
- Sorteren is **handmatig**: knop “Sorteer inbox” — geen auto bij sync
- Gebruiker moet voorstellen **bevestigen** voordat iets verplaatst wordt (keuze B)
- AI mag nieuwe mappen voorstellen; UI toont dat duidelijk (bijv. badge “nieuw”)

**Betrokken bestanden** (lees deze als eerste):
- `components/MailApp/MailApp.tsx` — hoofdstate, sync, notices, folder actions
- `components/MailApp/MailApp.module.css`
- `components/FolderRail/FolderRail.tsx` — of ThreadList toolbar voor de knop
- `components/ThreadList/ThreadList.tsx` — lijst-header is een logische plek
- `lib/types.ts` / `lib/sort-types.ts` — SortSuggestion types van de API-todo
- Bestaande notice/error pattern in MailApp (`setNotice`, `setError`)

## Wat er moet gebeuren

Voeg een knop “Sorteer inbox” toe die AI-voorstellen ophaalt, toont in een review-UI (aan/uit per item, mapnaam bewerkbaar), en na bevestiging `/api/sort/apply` aanroept. Daarna folders/threads verversen.

## Stappen

### 1. SortReview component

**Bestanden:**
- `components/SortReview/SortReview.tsx` (nieuw)
- `components/SortReview/SortReview.module.css` (nieuw)

Wat er moet gebeuren:
- Props roughly:
```tsx
type Props = {
  suggestions: SortSuggestion[];
  busy: boolean;
  onConfirm: (selected: Array[{ messageIds: string[]; folder: string; createFolder: boolean }]) => void;
  onCancel: () => void;
};
```
- Toon per voorstel: onderwerp, afzender, voorgestelde map, reason, confidence
- Checkbox (default aan) om item mee te nemen
- Mapnaam als editable input (gebruiker mag corrigeren)
- Badge als `createFolder` true: “Nieuwe map”
- Primairy knop: “Verplaats geselecteerde”
- Secundair: “Annuleren”
- Lege staat: “Geen voorstellen — inbox ziet er al opgeruimd uit.”
- Geen cards-overkill: één duidelijke lijst, passend bij bestaande UI-dichtheid

Acceptatiecriterium: Component rendert voorstellen en emit alleen aangevinkte items.

---

### 2. Knop “Sorteer inbox” in de UI

**Bestanden:** `components/MailApp/MailApp.tsx` en/of `components/ThreadList/ThreadList.tsx`

Wat er moet gebeuren:
- Knop zichtbaar wanneer `imapReady && aiReady` (prop `aiReady` bestaat al op MailApp)
- Label: “Sorteer inbox”
- Bij klik:
  1. `POST /api/sort/preview`
  2. Loading-state op de knop (“Bezig met sorteren…”)
  3. Bij succes: open SortReview (dialog/panel overlay of inline in main pane)
  4. Bij fout: `setError(...)`
- Alleen zinvol vanuit inbox-context; als actieve folder ≠ inbox mag de knop disabled zijn of alsnog alleen inbox analyseren (documenteer keuze in code-comment: altijd inbox analyseren)

Acceptatiecriterium: Klik triggert preview zonder iets te verplaatsen.

---

### 3. Bevestigen → apply + refresh

**Bestand:** `components/MailApp/MailApp.tsx`

Wat er moet gebeuren:
- Op confirm: `POST /api/sort/apply` met geselecteerde items
- Bij succes:
  - sluit SortReview
  - update folders via response of `loadThreads` / sync
  - `setNotice` met korte samenvatting (“3 berichten verplaatst”)
- Bij fout: `setError`
- Voorkom dubbele submits (`busy` state)

Acceptatiecriterium: Na confirm staan mails in de juiste map en folder-rail is bijgewerkt.

---

### 4. CSS

**Bestand:** `components/SortReview/SortReview.module.css`

Wat er moet gebeuren:
- Gebruik bestaande tokens; geen nieuwe paarse/glow AI-esthetiek
- Compacte lijst, duidelijke primary button met `--accent`
- Responsive: op smalle schermen full-width overlay

Acceptatiecriterium: Past visueel bij FolderRail/ThreadView; geen Tailwind.

---

## Gotcha's en beperkingen

- Wacht tot API-todo endpoints bestaan; als types nog ontbreken, mirror de response-shape uit `todo-ai-sort-api.md`
- Verplaatsen mag NOOIT zonder gebruiker-confirm
- Raak AI-drawer / compose / calendar-banner niet aan behalve gedeelde MailApp-state
- Geen automatische sort bij de 60s poll-sync

## Definitie van klaar

- [ ] Knop “Sorteer inbox” zichtbaar en werkt
- [ ] Preview-lijst met selectie + bewerkbaar mapnaam
- [ ] Confirm verplaatst; cancel doet niets
- [ ] Notice/error feedback
- [ ] Geen TypeScript errors
- [ ] CSS modules, geen Tailwind
