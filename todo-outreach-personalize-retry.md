# Todo: Outreach — gedeelde AI-retry-helper in personalize.ts

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-panel-refactor.md`, `todo-outreach-leads-tab-ux.md`, `todo-outreach-automail-safety.md`, `todo-outreach-campaign-profile-columns.md`, `todo-outreach-import-preview.md`, `todo-outreach-reply-matching-perf.md`
**Afhankelijkheden:** geen. Dit bestand raakt alleen `lib/outreach/personalize.ts` — geen overlap met de andere todo's, kan volledig parallel draaien.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — IMAP/SMTP, PostgreSQL, Docker op een VPS.
**Stack:** Next.js 15, React 19, TypeScript.

**Kernregels (uit CLAUDE.md, van toepassing op dit ticket):**
- **Geen DIY / geen duplicatie:** identieke logica die op twee plekken in hetzelfde bestand staat hoort in één gedeelde functie, niet gekopieerd.
- **Engelse comments, alleen "waarom" niet "wat".**
- Na de wijziging moeten `npm run lint`, `npm test`, `npx tsc --noEmit` en `npx next build` allemaal slagen.

**Betrokken bestanden (lees deze als eerste):**
- `lib/outreach/personalize.ts` — 217 regels. Bevat `personalizeOutreachEmail()` en `personalizeReplyDraft()`, die allebei een bijna identiek try/catch-met-retry-op-lagere-temperature-patroon hebben rond een `chatCompletion()`-aanroep. Hier gebeurt de wijziging.
- `lib/ai/openrouter.ts` — bevat `chatCompletion()` en `getHeavyModel()`. De parametertype `ChatMessage` (regel 31) is **niet** geëxporteerd uit dat bestand — gebruik daarom `Parameters<typeof chatCompletion>[0]` om ernaar te verwijzen in plaats van te proberen `ChatMessage` te importeren (dat zou een compile-fout geven, de type bestaat niet buiten dat bestand).
- `lib/outreach/ai-json.ts` — bevat `parseAiJson()` en `extractReplyBody()`, de twee parse-functies die als argument aan de nieuwe gedeelde helper worden meegegeven.

## Wat er moet gebeuren

`personalizeOutreachEmail()` (rond regel 96-111) en `personalizeReplyDraft()` (rond regel 208-213) hebben allebei hun eigen kopie van "probeer een AI-call met `jsonMode`, en als dat een fout geeft, probeer nog eens met een lagere temperature". Trek dit samen in één gedeelde helper `withJsonParseRetry()`.

**Let op, dit is niet 100% een pure refactor — er zit een kleine, gewenste gedragswijziging in:** in `personalizeOutreachEmail()` valt ook een mislukte `parseAiJson(raw)` (niet alleen een mislukte `chatCompletion()`-call) binnen de retry — een parse-fout triggert dus een nieuwe poging op lagere temperature. In `personalizeReplyDraft()` gebeurt dat nu **niet**: `extractReplyBody(raw)` wordt pas ná de try/catch aangeroepen, dus een parse-fout daar wordt niet opnieuw geprobeerd en propageert direct als onafgevangen fout. Na deze refactor gedragen beide zich hetzelfde (parse-fouten tellen mee voor de retry) — dat is de bedoelde consistentie-verbetering uit dit ticket, geen bijwerking om ongedaan te maken.

## Stappen

### 1. Gedeelde helper toevoegen

**Bestand:** `lib/outreach/personalize.ts`

Voeg toe, direct na de `REPLY_SYSTEM_BASE`-constante en vóór `personalizeOutreachEmail`:
```ts
/**
 * Calls chatCompletion in jsonMode and parses the result; retries once at a lower
 * temperature if either the call or the parse fails (AI json-mode output occasionally
 * comes back malformed, and a lower temperature reduces the odds of a repeat failure).
 * `Parameters<typeof chatCompletion>[0]` is used instead of importing ChatMessage
 * because that type isn't exported from lib/ai/openrouter.ts.
 */
async function withJsonParseRetry<T>(
  messages: Parameters<typeof chatCompletion>[0],
  parse: (raw: string) => T,
  options: { temperature: number; retryTemperature: number; model: string }
): Promise<T> {
  try {
    const raw = await chatCompletion(messages, {
      jsonMode: true,
      temperature: options.temperature,
      model: options.model,
    });
    return parse(raw);
  } catch {
    const raw = await chatCompletion(messages, {
      jsonMode: true,
      temperature: options.retryTemperature,
      model: options.model,
    });
    return parse(raw);
  }
}
```

Acceptatiecriterium: functie compileert, generiek genoeg om zowel `parseAiJson` (retourneert een object) als `extractReplyBody` (retourneert een string) als `parse`-argument te accepteren.

---

### 2. `personalizeOutreachEmail()` laat de helper gebruiken

**Bestand:** `lib/outreach/personalize.ts`

Huidige code (rond regel 96-111):
```ts
  let parsed;
  try {
    const raw = await chatCompletion(messages, {
      jsonMode: true,
      temperature: 0.3,
      model: getHeavyModel(),
    });
    parsed = parseAiJson(raw);
  } catch {
    const raw = await chatCompletion(messages, {
      jsonMode: true,
      temperature: 0.1,
      model: getHeavyModel(),
    });
    parsed = parseAiJson(raw);
  }
```

Vervang door:
```ts
  const parsed = await withJsonParseRetry(messages, parseAiJson, {
    temperature: 0.3,
    retryTemperature: 0.1,
    model: getHeavyModel(),
  });
```

De rest van de functie (vanaf `const cleaned = humanizeOutreachEmail(...)`) blijft ongewijzigd — die gebruikt `parsed.subject`/`parsed.body`/`parsed.findings` precies zoals voorheen.

Acceptatiecriterium: `personalizeOutreachEmail` gedraagt zich functioneel hetzelfde als voorheen, alleen via de gedeelde helper.

---

### 3. `personalizeReplyDraft()` laat de helper gebruiken

**Bestand:** `lib/outreach/personalize.ts`

Huidige code (rond regel 208-215):
```ts
  let raw: string;
  try {
    raw = await chatCompletion(messages, { jsonMode: true, temperature: 0.35, model: getHeavyModel() });
  } catch {
    raw = await chatCompletion(messages, { jsonMode: true, temperature: 0.15, model: getHeavyModel() });
  }

  return { body: humanizeOutreachText(extractReplyBody(raw)), intent };
```

Vervang door:
```ts
  const body = await withJsonParseRetry(messages, extractReplyBody, {
    temperature: 0.35,
    retryTemperature: 0.15,
    model: getHeavyModel(),
  });

  return { body: humanizeOutreachText(body), intent };
```

Acceptatiecriterium: `personalizeReplyDraft` retourneert nog steeds `{ body, intent }` met `humanizeOutreachText` toegepast op de geëxtraheerde body — de enige functionele wijziging is dat een parse-fout in `extractReplyBody` nu ook een retry op lagere temperature triggert (zie de toelichting hierboven in "Wat er moet gebeuren").

---

## Gotcha's en beperkingen

- Verander de temperature-waarden zelf niet (0.3/0.1 voor personalisatie, 0.35/0.15 voor reply-drafts) — dat zijn bestaande, ingeregelde waarden, geen onderdeel van dit ticket.
- `withJsonParseRetry` is bewust **niet** geëxporteerd (geen `export` ervoor) — het is een interne helper van dit bestand, gebruikt door beide functies erin. Exporteer 'm niet tenzij een van de twee aanroepende functies naar een ander bestand zou verhuizen (niet het geval in dit ticket).
- Zorg dat `chatCompletion` en `getHeavyModel` nog steeds correct geïmporteerd blijven bovenaan het bestand (regel 1) — die import-regel hoeft niet te veranderen, alleen het gebruik ervan verplaatst naar binnen de nieuwe helper.

## Definitie van klaar

- [ ] `withJsonParseRetry()` toegevoegd, gebruikt door zowel `personalizeOutreachEmail` als `personalizeReplyDraft`.
- [ ] Geen gedupliceerde try/catch-met-retry-logica meer in dit bestand.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm test` — groen.
- [ ] `npx tsc --noEmit` — geen fouten.
- [ ] `npx next build` — slaagt.
