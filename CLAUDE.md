# mail

Next.js 15 (App Router) / React 19 / TypeScript webmail-app. IMAP/SMTP via `imapflow`/`nodemailer`, data in PostgreSQL (`pg`), draait in Docker op een VPS.

Een zelfbouw ticket-systeem laat 's nachts autonoom Claude Code (`scripts/run-tickets.sh`) open tickets oplossen: branch `ticket-<id>` → commit → **lint+test gate** → merge naar `main` → `docker-compose build` → health-check → bij succes push + live deploy, bij falen `git reset --hard` rollback. Dit document geldt voor die autonome runs net zo goed als voor handmatig werk — er is geen aparte regelset voor "het ticket-systeem".

## Commando's

- `npm run lint` — ESLint, moet 0 errors zijn (warnings mogen, zie hieronder)
- `npm test` — Vitest, moet groen blijven
- `npx tsc --noEmit` — typecheck
- `npx next build` — productie-build

Alle vier moeten slagen voordat je iets als klaar beschouwt. `run-tickets.sh` forceert lint+test al af als gate vóór merge/deploy — behandel dat niet als een obstakel om te omzeilen.

## Mapstructuur

Domein-georiënteerd, niet laag-georiënteerd — dit spiegelt hoe `app/api/` al is opgezet (`app/api/mail/`, `app/api/ai/`, `app/api/tickets/`, ...).

```
components/<domein>/<Component>/<Component>.tsx (+ .module.css)
lib/<domein>/<bestand>.ts
```

Huidige domeinen: `mail`, `ai`, `auth`, `calendar`, `config`, `notes`, `tickets`, `shared` (generieke helpers zonder domein), plus `components/settings/`, `components/tasks/`, `components/MailApp/` (root-orchestrator).

Nieuwe code hoort in het juiste domein, niet los in de root van `components/`/`lib/`. Twijfel je over het domein: kijk hoe `app/api/` het al indeelt, dat is de bron van waarheid.

## De 8 regels

### 1. Max ~500 regels per bestand — harde lint-regel

`eslint.config.mjs` heeft `max-lines: ["error", { max: 500, skipBlankLines: true, skipComments: true }]`. Dit is geen richtlijn, het is een build-blokkerende fout. Loop je hiertegenaan: splits het bestand langs een logische grens (zie `components/mail/hooks/` en `lib/mail/mail-search/` als voorbeeld van hoe eerdere grote bestanden zijn opgesplitst) — voeg geen `eslint-disable` toe om de regel te omzeilen.

### 2. Domain-based mapstructuur

Zie hierboven. Geen aparte `utils/`- of `helpers/`-grabbag; als iets echt domeinloos is hoort het in `lib/shared/` of `components/shared/`.

### 3. Geen DIY — hergebruik bewezen libraries

Bouw geen eigen parser/formatter/state-manager voor een probleem dat een gangbare library al oplost. Voorbeeld: agenda-uitnodigingen parsen gaat via `node-ical` (`lib/calendar/ics.ts`), niet via een handgeschreven ICS/VEVENT-parser. Voeg een dependency toe in plaats van het wiel opnieuw uit te vinden, tenzij de library duidelijk te zwaar is voor het probleem.

### 4. Engelse comments, alleen "waarom" niet "wat"

Comments zijn in het Engels. Schrijf alleen een comment als de code zelf niet laat zien *waarom* iets zo is (een niet-voor-de-hand-liggende constraint, een workaround voor een specifieke bug, een invariant die een lezer kan missen). Leg nooit uit *wat* de code doet — goede naamgeving doet dat al. Verwijder een comment als je 'm zou kunnen weghalen zonder dat een lezer in de war raakt.

### 5. Taalscheiding: Nederlands vs Engels

- **Nederlands:** UI-teksten (labels, foutmeldingen richting gebruiker), commit messages, ticket-titels/omschrijvingen.
- **Engels:** code, identifiers (variabelen, functies, types, bestandsnamen), comments.

Een foutmelding die de gebruiker ziet (`throw new Error("Toevoegen mislukt")`) is Nederlands. De variabele die 'm bevat (`error`, niet `fout`) is Engels.

### 6. Typed API-contracten i.p.v. kale `fetch`/`res.json()`

Gebruik `apiRequest<T>` en `useAsyncAction` uit `lib/shared/api-request.ts` / `lib/shared/use-async-action.ts` voor elke client-side JSON-fetch naar een eigen API-route:

```ts
const { loading, error, run } = useAsyncAction();

async function submit() {
  const data = await run(
    () => apiRequest<{ id: string }>("/api/thing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Opslaan mislukt"
  );
  if (data) { /* ... */ }
}
```

`apiRequest` gooit een `ApiError` (met `status`) op een non-2xx response, met de server's `data.error`-tekst als message. Typeer altijd het response-shape via het generic — geen `await res.json()` met impliciet `any`.

**Uitzondering — streaming responses:** endpoints die via `consumeAiStream` (`lib/ai/ai-stream.ts`) of een handmatige `res.body.getReader()`-loop worden gelezen (bv. `/api/ai/polish`, `/api/ai/draft`, `/api/tickets/draft-chat`) zijn geen JSON-responses en horen niet naar `apiRequest` gemigreerd te worden — laat die op kale `fetch` staan.

**Uitzondering — fire-and-forget:** een aanroep waarvan de respons-data nooit gelezen wordt (bv. de logout-call in `components/MailApp/MailApp.tsx`) hoeft niet gemigreerd te worden, er valt niets te typeren.

### 7. Structured logging via pino

Server-side (alles onder `app/api/`): gebruik `logger` uit `lib/shared/logger.ts`, nooit los `console.error`/`console.log`.

```ts
import { logger } from "@/lib/shared/logger";
// ...
logger.error({ route: "mail/send", method: "POST", err }, message);
```

`route` is het API-pad zonder `app/api/`-prefix en zonder `/route.ts`, `method` is het HTTP-werkwoord. Niveau is `warn` in productie (blijft grep-baar in `docker-compose logs` zonder ruis) en `debug` in development.

**`lib/shared/logger.ts` (pino) nooit importeren in een `"use client"`-bestand** — pino gebruikt Node-APIs die niet in de browser bestaan. Client-side logging (bv. `ErrorBoundary`) gebruikt gewoon `console.error`, gewikkeld in een `process.env.NODE_ENV !== "production"`-check zodat er niets naar de browser-console van eindgebruikers lekt.

### 8. Lint+test gate vóór merge/deploy

`scripts/run-tickets.sh` draait `npm run lint` en `npm test` op de ticket-branch vóór er gemerged wordt naar `main`. Faalt een van beide, dan wordt niet gemerged en gaat het ticket terug naar `open` voor een volgende poging — geen enkele wijziging bereikt `main`/productie zonder die gate te passeren. Omzeil dit nooit door lint-errors te onderdrukken in plaats van op te lossen.

## Wat (nog) niet hier hoort

Testcode is bewust een apart traject — er is geen verplichting om bij elke feature nieuwe tests te schrijven. Wel geldt onverkort: bestaande tests (`npm test`) moeten groen blijven, dat is een harde gate, geen richtlijn.
