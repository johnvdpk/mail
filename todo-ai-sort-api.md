# Todo: AI inbox-sortering (API)

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-ai-sort-api.md`, `todo-ai-sort-ui.md`, `todo-calendar-ics-google.md`
**Afhankelijkheden:** geen (UI-todo wacht op deze API)

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) voor `john@aiadapt.nl` via Strato IMAP/SMTP + PostgreSQL. AI via OpenRouter (`OPENROUTER_AI`).
**Stack:** Next.js 15, React 19, TypeScript, CSS Modules (geen Tailwind), imapflow, mailparser, nodemailer, pg, OpenRouter.

**Kernregels:**
- CSS via `Component.module.css` naast het component; kort houden, geen dubbele styles
- Code-comments in het Engels
- UI-teksten in het Nederlands
- API-routes wrappen met `withAuth` uit `lib/with-auth.ts`
- Geen auto-move: deze API geeft alleen **voorstellen**; verplaatsen gebeurt pas na bevestiging via bestaande move-flow
- AI mag **nieuwe mapnamen voorstellen** (vrij); map aanmaken + move gebeurt pas bij apply
- Sorteren is **handmatig** getriggerd (geen auto bij sync)
- Geen vaste regels voor Club QT / Bureau Reuring — AI ontdekt zelf op basis van afzender/onderwerp/snippet

**Betrokken bestanden** (lees deze als eerste):
- `lib/openrouter.ts` — `chatCompletion`, `isOpenRouterConfigured`
- `lib/ai-mail.ts` — JSON-parse helpers / AI-stijl om te hergebruiken
- `lib/folders.ts` — `getFolders`, `fetchFolders`
- `lib/mailbox-service.ts` — folder views / threads
- `lib/store.ts` — message summaries lezen
- `lib/types.ts` — `MessageSummary`, `MailFolder`, `Thread`
- `app/api/folders/manage/route.ts` — IMAP create/rename/delete pattern
- `app/api/thread/actions/route.ts` — bestaande `move` actie (hergebruik logica of extract)
- `lib/imap.ts` — `withImap`, `withMailbox`, `isImapConfigured`
- `lib/with-auth.ts`

## Wat er moet gebeuren

Bouw een API die inbox-berichten classificeert met OpenRouter en een lijst voorstellen teruggeeft: welke thread/mail naar welke map (bestaand of nieuw). Een tweede endpoint past goedgekeurde voorstellen toe (map aanmaken indien nodig + IMAP move). Geen stille auto-sortering.

## Stappen

### 1. Types voor sort-voorstellen

**Bestand:** `lib/types.ts` (uitbreiden) of nieuw `lib/sort-types.ts`

Wat er moet gebeuren:
- Definieer types, bijvoorbeeld:

```ts
export type SortSuggestion = {
  /** Thread id if available, else message id */
  threadId: string;
  messageIds: string[];
  subject: string;
  fromEmail?: string;
  fromName?: string;
  /** Proposed IMAP folder path or display name for a new folder */
  proposedFolder: string;
  /** True when this folder does not exist yet */
  createFolder: boolean;
  confidence: number; // 0..1
  reason: string; // short Dutch explanation
};
```

Acceptatiecriterium: Types compileren; geen `any`.

---

### 2. AI-classificatie library

**Bestand:** `lib/ai-sort.ts` (nieuw)

Wat er moet gebeuren:
- Functie `suggestInboxSort(options?: { limit?: number })`:
  1. Haal inbox path via `getInboxPath()`
  2. Lees message summaries uit de inbox-cache/store (recente, bijv. max 40–60)
  3. Haal bestaande custom folder-namen op via `getFolders()` (exclude system roles inbox/sent/drafts/trash/junk/archive)
  4. Roep OpenRouter aan met `jsonMode: true` en een system prompt die:
     - in het Nederlands redeneert
     - bestaande mappen hergebruikt als ze passen
     - nieuwe mapnamen mag voorstellen (kort, menselijk: "Club QT", "Bureau Reuring", "Facturen", …)
     - berichten die in inbox horen te blijven overslaat (`proposedFolder: null` / weglaten)
     - per voorstel: reason + confidence
  5. Parse JSON veilig (zelfde stijl als `lib/ai-mail.ts`)
  6. Valideer mapnamen (geen pad-injectie, geen system-foldernamen overschrijven)
- Temperature laag (~0.2)

Voorbeeld response-shape van de AI:
```json
{
  "suggestions": [
    {
      "messageId": "INBOX_1234",
      "proposedFolder": "Club QT",
      "createFolder": true,
      "confidence": 0.86,
      "reason": "Afzender en onderwerp horen bij Club QT"
    }
  ]
}
```

Acceptatiecriterium: Functie retourneert typed suggestions; faalt netjes als OpenRouter ontbreekt.

---

### 3. Preview-endpoint

**Bestand:** `app/api/sort/preview/route.ts` (nieuw)

Wat er moet gebeuren:
- `export const dynamic = "force-dynamic"`
- `POST` wrapped met `withAuth`
- Check `isImapConfigured()` + `isOpenRouterConfigured()`
- Roep `suggestInboxSort` aan
- Return `{ suggestions: SortSuggestion[] }`
- Errors → JSON `{ error: string }` met juiste status

Acceptatiecriterium: Authenticated POST geeft voorstellen of duidelijke error.

---

### 4. Apply-endpoint (na gebruikersbevestiging)

**Bestand:** `app/api/sort/apply/route.ts` (nieuw)

Wat er moet gebeuren:
- `POST` body: `{ items: Array<{ messageIds: string[]; folder: string; createFolder?: boolean }> }`
- Voor elk item:
  1. Als `createFolder` en map bestaat nog niet → `client.mailboxCreate(folder)` (zelfde patroon als `folders/manage`)
  2. Verplaats berichten via IMAP `messageMove` (logica uit `thread/actions` hergebruiken; bij voorkeur extract naar `lib/mail-actions.ts` om duplicatie te vermijden)
  3. Update lokale store (removeSummaries + sync destination) zoals bestaande move
- Daarna `fetchFolders()` / folder view refresh data teruggeven: `{ ok: true, folders, ... }`
- **Niet** automatisch RSVP of calendar-acties

Acceptatiecriterium: Alleen expliciet meegestuurde items worden verplaatst; nieuwe mappen verschijnen in IMAP.

---

### 5. Optioneel: extract move-helper

**Bestand:** `lib/mail-actions.ts` (nieuw) + update `app/api/thread/actions/route.ts`

Wat er moet gebeuren:
- Verplaats `moveMessages` / `groupByFolder` naar gedeelde helper zodat sort/apply en thread/actions dezelfde code gebruiken.
- Alleen doen als het duplicatie voorkomt; geen grote refactor buiten scope.

Acceptatiecriterium: Bestaande thread-move blijft werken; sort/apply gebruikt dezelfde helper.

---

## Gotcha's en beperkingen

- Strato IMAP: mapnamen simpel houden (geen `/` tenzij parent folders al zo werken); test met platte namen zoals `Club QT`
- Group by thread where possible: meerdere messages in één thread → één suggestion
- Skip outbound/sent noise; alleen inbox
- OpenRouter kosten: limit aantal berichten; stuur alleen subject, from, snippet, date — geen full body tenzij nodig
- Geen wijzigingen aan Google Calendar of ICS in dit bestand

## Definitie van klaar

- [ ] `POST /api/sort/preview` geeft AI-voorstellen zonder iets te verplaatsen
- [ ] `POST /api/sort/apply` maakt ontbrekende mappen aan en verplaatst alleen bevestigde items
- [ ] OpenRouter/IMAP ontbrekend → nette 503
- [ ] Geen TypeScript errors
- [ ] Bestaande draft/polish/tips AI ongemoeid
