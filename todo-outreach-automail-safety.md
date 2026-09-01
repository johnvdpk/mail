# Todo: Outreach — Automail: race-proof dedup + filters-validatie

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-panel-refactor.md`, `todo-outreach-leads-tab-ux.md`, `todo-outreach-campaign-profile-columns.md`, `todo-outreach-import-preview.md`, `todo-outreach-reply-matching-perf.md`, `todo-outreach-personalize-retry.md`
**Afhankelijkheden:** geen. Dit bestand raakt `lib/outreach/send.ts`, `lib/outreach/dedup.ts`, `lib/outreach/automail.ts` en `lib/schema.sql` — geen overlap met de andere todo's in de reeks, kan volledig parallel draaien.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — IMAP/SMTP, PostgreSQL (`pg`), draait in Docker op een VPS. De `outreach`-module heeft een "automail"-cron (`instrumentation.ts` → `runAutomail()` in `lib/outreach/automail.ts`) die elke 15 minuten, per campagne met automail aan, maximaal één lead automatisch personaliseert en verstuurt.
**Stack:** Next.js 15, React 19, TypeScript, PostgreSQL via `pg`.

**Kernregels (uit CLAUDE.md, van toepassing op dit ticket):**
- **Geen DIY — hergebruik bewezen mechanismen.** Gebruik Postgres' eigen `UNIQUE`-constraint-afdwinging (via een dedicated tabel) in plaats van een handgeschreven lock-mechanisme te bouwen; dat is robuuster en simpeler dan bijvoorbeeld advisory locks over een pooled connectie (zie de gotcha hieronder over waarom dat laatste niet de gekozen aanpak is).
- **Engelse comments, alleen "waarom" niet "wat".**
- **Taalscheiding:** Nederlandse foutmeldingen richting gebruiker (`throw new Error("...")` met Nederlandse tekst), Engelse code/identifiers/comments.
- Migraties in `lib/schema.sql` zijn **idempotent** — het bestand wordt bij elke deploy opnieuw uitgevoerd via `scripts/migrate.ts` (`pool.query(sql)` van het hele bestand). Nieuwe tabellen gebruiken dus `CREATE TABLE IF NOT EXISTS`; wijzigingen aan bestaande tabellen gebruiken `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` (zie bestaande voorbeelden verderop in `lib/schema.sql`, bijvoorbeeld rond `project_lines`). Voor dit ticket is alleen een **nieuwe tabel** nodig, dus alleen `CREATE TABLE IF NOT EXISTS`.
- Na de wijziging moeten `npm run lint`, `npm test`, `npx tsc --noEmit` en `npx next build` allemaal slagen.

**Betrokken bestanden (lees deze als eerste):**
- `lib/schema.sql` — bevat de bestaande `campaigns`/`campaign_targets`/`campaign_sends`/`campaign_automail_rules`/`campaign_automail_log`-tabellen (rond regel 348-421). Hier komt de nieuwe tabel bij.
- `lib/outreach/dedup.ts` — bevat `assertNotDuplicate()` en `findExistingSend()`, de huidige (race-gevoelige) dedup-check. Hier komt de nieuwe claim/release-logica.
- `lib/outreach/send.ts` — bevat `sendOutreachMail()`, die `assertNotDuplicate()` aanroept vóórdat de mail daadwerkelijk verstuurd wordt via `sendNewMail()` (uit `lib/mail/send-service.ts`).
- `lib/outreach/automail.ts` — bevat `runAutomailTick()` (roept `sendOutreachMail()` aan) en `upsertAutomailRule()` (valideert nu wel `dailyCount`/`windowStart`/`windowEnd`/`statusFilter`, maar niet de vorm van `filters`).
- `lib/outreach/types.ts` — bevat `AttributeFilter` (`{type: "range", min?, max?}` of `{type: "in", values: string[]}`) en `AutomailFilters` (`Record<string, AttributeFilter>`), en `AutomailRuleInput`.
- `app/api/outreach/campaigns/[id]/automail/route.ts` — de `PUT`-handler die `upsertAutomailRule()` aanroept; hoeft in dit ticket **niet** gewijzigd te worden (zie stap 2, de fix hoort in de lib-functie).
- `lib/outreach/campaigns.ts` — bevat een bestaand voorbeeld van hoe dit project een Postgres unique-violation (code `23505`) herkent en omzet naar een leesbare foutmelding (`isUniqueViolation()`, rond regel 36-38). Volg dat patroon.
- `instrumentation.ts` — de setInterval die `runAutomail()` elke 15 minuten aanroept, **niet wachtend** op de vorige aanroep. Dit is de bron van het race-risico: als een tick (AI-call + SMTP-call + DB-writes) langer duurt dan 15 minuten, kunnen twee ticks overlappen.

## Wat er moet gebeuren

Twee robuustheidsfixes in de automail-flow:

1. **Race-proof dedup vóór het versturen.** `assertNotDuplicate()` is een check-then-insert: hij controleert of een e-mailadres al eerder is benaderd, maar er zit geen harde garantie tussen die check en het moment waarop de send daadwerkelijk wordt vastgelegd. Als twee verzend-pogingen voor hetzelfde adres overlappen (bijvoorbeeld twee overlappende automail-ticks, of een handmatige verzending die samenvalt met een automail-tick), kunnen beide de check passeren vóórdat een van beide de send heeft geregistreerd — met een dubbele mail naar dezelfde lead tot gevolg. Dit wordt dichtgezet met een `UNIQUE`-constraint op e-mailadres, geclaimd **vóórdat** de mail daadwerkelijk verstuurd wordt.
2. **Vorm-validatie voor automail-filters.** De `PUT /api/outreach/campaigns/[id]/automail`-route cast de request-body blind naar `AutomailRuleInput` — TypeScript-types checken niets ten tijde van runtime. Alleen `dailyCount`/`windowStart`/`windowEnd`/`statusFilter` worden al gevalideerd in `upsertAutomailRule()`; `filters` (een vrije `Record<string, AttributeFilter>`) niet. Een malformed `filters`-object komt zo ongecontroleerd in de JSONB-kolom terecht.

## Stappen

### 1. Race-proof dedup-claim

**1a. Nieuwe tabel**

**Bestand:** `lib/schema.sql`

Voeg toe, direct na de bestaande `campaign_sends`-tabel en zijn indexen (na regel 394, vóór de `campaign_automail_rules`-sectie):
```sql
-- Claim-ledger voor race-proof dedup: sendOutreachMail() (lib/outreach/send.ts) claimt
-- hier het genormaliseerde e-mailadres VOORDAT de mail daadwerkelijk wordt verstuurd.
-- De UNIQUE-constraint zorgt dat een gelijktijdige tweede poging voor hetzelfde adres
-- hard faalt in plaats van te wachten op een check-then-insert race (zie
-- assertNotDuplicate() in lib/outreach/dedup.ts, die als snelle voorcheck blijft
-- bestaan maar zelf geen harde garantie geeft). Bij een mislukte send wordt de claim
-- weer verwijderd (zie releaseEmailClaim in lib/outreach/dedup.ts).
CREATE TABLE IF NOT EXISTS outreach_sent_emails (
  email_normalized     TEXT PRIMARY KEY,
  campaign_target_id   INTEGER REFERENCES campaign_targets(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Acceptatiecriterium: `npx tsx scripts/migrate.ts` (of hoe de migratie in deze omgeving ook wordt gedraaid — kijk naar `package.json`'s scripts als `tsx` niet direct werkt) faalt niet en de tabel bestaat na afloop. Als er geen lokale database beschikbaar is om dit te testen: controleer in elk geval dat de SQL-syntax correct is en het patroon (`CREATE TABLE IF NOT EXISTS`) exact overeenkomt met de andere tabellen in `lib/schema.sql`.

**1b. Claim/release-functies**

**Bestand:** `lib/outreach/dedup.ts`

Voeg `query` toe aan de bestaande import (nu importeert dit bestand alleen `queryOne`):
```ts
import { query, queryOne } from "../shared/db";
```

Voeg toe, na de bestaande `assertNotDuplicate`-functie:
```ts
function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && err.code === "23505");
}

/**
 * Race-proof claim: the UNIQUE constraint on outreach_sent_emails.email_normalized means
 * only one concurrent call can win this insert, closing the check-then-insert gap left by
 * assertNotDuplicate() above. Must be called BEFORE the actual SMTP send, and the caller
 * must call releaseEmailClaim() if the send afterwards fails, so a genuine retry isn't
 * permanently blocked by a claim from a failed attempt.
 */
export async function claimEmailForSend(emailNormalized: string, targetId: number): Promise<void> {
  try {
    await query(
      `INSERT INTO outreach_sent_emails (email_normalized, campaign_target_id) VALUES ($1, $2)`,
      [emailNormalized, targetId]
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DuplicateSendError(
        "Dit adres is al benaderd (gelijktijdige verzending gedetecteerd)"
      );
    }
    throw err;
  }
}

export async function releaseEmailClaim(emailNormalized: string): Promise<void> {
  await query(`DELETE FROM outreach_sent_emails WHERE email_normalized = $1`, [emailNormalized]);
}
```

Acceptatiecriterium: bestand compileert, `DuplicateSendError` (al gedefinieerd hogerop in dit bestand) wordt hergebruikt, geen nieuwe error-klasse.

**1c. `sendOutreachMail()` gebruikt de claim vóór het versturen**

**Bestand:** `lib/outreach/send.ts`

Huidige code (rond regel 41-81):
```ts
export async function sendOutreachMail(
  targetId: number,
  draft: OutreachDraft,
  options?: { isTest?: boolean; testEmail?: string }
): Promise<CampaignSend> {
  const target = await getTarget(targetId);
  if (!target) throw new Error("Lead niet gevonden");
  if (!target.email.trim()) throw new Error("Deze lead heeft geen e-mailadres");

  const isTest = Boolean(options?.isTest);
  if (isTest) {
    const testEmail = options?.testEmail?.trim();
    if (!testEmail) {
      throw new Error("Stel eerst een testadres in bij de campagne-instellingen");
    }
  } else {
    await assertNotDuplicate(target.emailNormalized);
  }

  const to = isTest ? options!.testEmail!.trim() : target.email;
  const result = await sendNewMail({
    to,
    subject: draft.subject,
    text: draft.text,
    html: draft.html,
  });

  const row = await queryOne<SendRow>(
    `INSERT INTO campaign_sends (target_id, message_id, subject, body_text, is_test)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [targetId, result.messageId, draft.subject, draft.text, isTest]
  );
  if (!row) throw new Error("Verzenden opgeslagen, maar de send-rij ontbreekt");

  if (!isTest) {
    await updateTargetStatus(targetId, "emailed");
  }

  return toSend(row);
}
```

Vervang door (let op: `assertNotDuplicate` blijft staan als snelle, informatieve voorcheck — de nieuwe `claimEmailForSend`-aanroep erna is wat de race daadwerkelijk dichtzet; bij een mislukte send in de `try`-body wordt de claim in de `catch` weer losgelaten):
```ts
export async function sendOutreachMail(
  targetId: number,
  draft: OutreachDraft,
  options?: { isTest?: boolean; testEmail?: string }
): Promise<CampaignSend> {
  const target = await getTarget(targetId);
  if (!target) throw new Error("Lead niet gevonden");
  if (!target.email.trim()) throw new Error("Deze lead heeft geen e-mailadres");

  const isTest = Boolean(options?.isTest);
  if (isTest) {
    const testEmail = options?.testEmail?.trim();
    if (!testEmail) {
      throw new Error("Stel eerst een testadres in bij de campagne-instellingen");
    }
  } else {
    // Fast, human-readable pre-check (names the earlier campaign). The claim below is
    // what actually closes the race under concurrent calls.
    await assertNotDuplicate(target.emailNormalized);
    await claimEmailForSend(target.emailNormalized, target.id);
  }

  try {
    const to = isTest ? options!.testEmail!.trim() : target.email;
    const result = await sendNewMail({
      to,
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
    });

    const row = await queryOne<SendRow>(
      `INSERT INTO campaign_sends (target_id, message_id, subject, body_text, is_test)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [targetId, result.messageId, draft.subject, draft.text, isTest]
    );
    if (!row) throw new Error("Verzenden opgeslagen, maar de send-rij ontbreekt");

    if (!isTest) {
      await updateTargetStatus(targetId, "emailed");
    }

    return toSend(row);
  } catch (err) {
    if (!isTest) await releaseEmailClaim(target.emailNormalized);
    throw err;
  }
}
```

Werk de import bovenaan `send.ts` bij:
```ts
import { assertNotDuplicate, claimEmailForSend, DuplicateSendError, releaseEmailClaim } from "./dedup";
```

Acceptatiecriterium: een tweede, gelijktijdige aanroep van `sendOutreachMail()` voor hetzelfde e-mailadres krijgt een `DuplicateSendError` (409 in de API-laag, zie hoe `app/api/outreach/campaigns/[id]/targets/[targetId]/send/route.ts` dat al afvangt — die route hoeft niet gewijzigd te worden, `DuplicateSendError` wordt daar al herkend). Een mislukte send (bijvoorbeeld SMTP-fout) laat geen "verweesde" claim achter — een volgende, legitieme poging voor hetzelfde adres werkt weer.

---

### 2. Filters-validatie in `upsertAutomailRule`

**Bestand:** `lib/outreach/automail.ts`

Voeg toe, in het importblok bovenaan:
```ts
import type { AttributeFilter, AutomailFilters, AutomailLogEntry, AutomailRule, TargetStatus } from "./types";
```
(vervangt de bestaande `import type { AutomailFilters, AutomailLogEntry, AutomailRule, TargetStatus } from "./types";` — voeg `AttributeFilter` toe aan dezelfde import-regel.)

Voeg deze twee functies toe, vóór `upsertAutomailRule`:
```ts
function isValidAttributeFilter(value: unknown): value is AttributeFilter {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.type === "range") {
    return (
      (v.min === undefined || typeof v.min === "number") &&
      (v.max === undefined || typeof v.max === "number")
    );
  }
  if (v.type === "in") {
    return Array.isArray(v.values) && v.values.every((item) => typeof item === "string");
  }
  return false;
}

/** Rejects a filters object with an unexpected shape before it reaches the JSONB column. */
function validateFilters(filters: unknown): AutomailFilters {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    throw new Error("filters moet een object zijn");
  }
  const result: AutomailFilters = {};
  for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
    if (!isValidAttributeFilter(value)) {
      throw new Error(`Ongeldig filter voor "${key}"`);
    }
    result[key] = value;
  }
  return result;
}
```

Werk `upsertAutomailRule` bij om `validateFilters` te gebruiken. Huidige code (rond regel 67-104):
```ts
export async function upsertAutomailRule(
  campaignId: number,
  input: AutomailRuleInput
): Promise<AutomailRule> {
  if (!Number.isInteger(input.dailyCount) || input.dailyCount < 1 || input.dailyCount > 50) {
    throw new Error("Aantal per dag moet tussen 1 en 50 liggen");
  }
  if (!TIME_RE.test(input.windowStart) || !TIME_RE.test(input.windowEnd)) {
    throw new Error("Ongeldig tijdvenster, gebruik HH:MM");
  }
  if (input.windowStart >= input.windowEnd) {
    throw new Error("Starttijd moet voor eindtijd liggen");
  }
  if (!isTargetStatus(input.statusFilter)) {
    throw new Error("Ongeldige status-filter");
  }

  const row = await queryOne<RuleRow>(
    `INSERT INTO campaign_automail_rules
       (campaign_id, enabled, daily_count, window_start, window_end, status_filter, filters, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     ON CONFLICT (campaign_id) DO UPDATE SET
       enabled = $2, daily_count = $3, window_start = $4, window_end = $5,
       status_filter = $6, filters = $7::jsonb, updated_at = NOW()
     RETURNING *`,
    [
      campaignId,
      input.enabled,
      input.dailyCount,
      input.windowStart,
      input.windowEnd,
      input.statusFilter,
      JSON.stringify(input.filters),
    ]
  );
  if (!row) throw new Error("Automail-regel opslaan mislukt");
  return toRule(row);
}
```

Voeg de validatie toe en gebruik het gevalideerde resultaat (niet `input.filters`) in de query:
```ts
export async function upsertAutomailRule(
  campaignId: number,
  input: AutomailRuleInput
): Promise<AutomailRule> {
  if (!Number.isInteger(input.dailyCount) || input.dailyCount < 1 || input.dailyCount > 50) {
    throw new Error("Aantal per dag moet tussen 1 en 50 liggen");
  }
  if (!TIME_RE.test(input.windowStart) || !TIME_RE.test(input.windowEnd)) {
    throw new Error("Ongeldig tijdvenster, gebruik HH:MM");
  }
  if (input.windowStart >= input.windowEnd) {
    throw new Error("Starttijd moet voor eindtijd liggen");
  }
  if (!isTargetStatus(input.statusFilter)) {
    throw new Error("Ongeldige status-filter");
  }
  const filters = validateFilters(input.filters);

  const row = await queryOne<RuleRow>(
    `INSERT INTO campaign_automail_rules
       (campaign_id, enabled, daily_count, window_start, window_end, status_filter, filters, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
     ON CONFLICT (campaign_id) DO UPDATE SET
       enabled = $2, daily_count = $3, window_start = $4, window_end = $5,
       status_filter = $6, filters = $7::jsonb, updated_at = NOW()
     RETURNING *`,
    [
      campaignId,
      input.enabled,
      input.dailyCount,
      input.windowStart,
      input.windowEnd,
      input.statusFilter,
      JSON.stringify(filters),
    ]
  );
  if (!row) throw new Error("Automail-regel opslaan mislukt");
  return toRule(row);
}
```

De API-route (`app/api/outreach/campaigns/[id]/automail/route.ts`) hoeft **niet** gewijzigd te worden — die geeft een door `upsertAutomailRule` gegooide fout al door als status 400 (zie de bestaande `catch`-afhandeling in de `PUT`-handler).

Acceptatiecriterium: een `PUT`-request met bijvoorbeeld `filters: { score: { type: "onzin" } }` of `filters: "niet een object"` geeft een 400 met een duidelijke Nederlandse foutmelding, in plaats van ongevalideerd in de JSONB-kolom te belanden.

---

## Gotcha's en beperkingen

- **Waarom geen advisory lock (`pg_advisory_lock`)?** Dat is een sessie-gebonden mechanisme: lock en unlock moeten op exact dezelfde database-connectie gebeuren. De gedeelde `query()`/`queryOne()`-helpers in `lib/shared/db.ts` lenen bij elke aanroep een willekeurige connectie uit de pool (`pool.query(...)`), dus een `pg_advisory_lock`-aanroep via die helpers zou op de ene connectie kunnen claimen en de `unlock` op een andere — de lock blijft dan voor altijd hangen tot die specifieke pooled connectie wordt gesloten. Dat vereist een dedicated, langlevende client-checkout die nu niet bestaat in `lib/shared/db.ts` (`transaction()` is er wel, maar commit/release meteen na de callback, ongeschikt om een lock over de hele — trage — personalize+SMTP-flow heen vast te houden). De `UNIQUE`-constraint-aanpak in dit ticket heeft dat probleem niet: elke los `query()`-aanroep is prima, want de garantie zit in de database zelf, niet in een sessie.
- **Restrisico bij een crash tussen claim en release.** Als het proces exact tussen `claimEmailForSend` en de `catch`-afhandeling in `sendOutreachMail` crasht (bijvoorbeeld een `docker restart` middenin), blijft de claim in `outreach_sent_emails` permanent staan zonder bijbehorende send — een latere, legitieme poging voor dat adres zou dan blijven falen met "gelijktijdige verzending gedetecteerd". Dit is een bewuste, geaccepteerde beperking (dit is geen queue-systeem met TTL/expiry) — als dit ooit een probleem blijkt, is de fix een handmatige `DELETE FROM outreach_sent_emails WHERE email_normalized = '...'`. Bouw hier in dit ticket geen automatische expiry voor, dat is disproportioneel voor een persoonlijke tool.
- De claim in `outreach_sent_emails` is **niet** hetzelfde als de bestaande dedup-check in `findExistingSend`/`assertNotDuplicate` (die blijft ongewijzigd bestaan als leesbare voorcheck, gebaseerd op `campaign_sends`). Verwar ze niet met elkaar en verwijder de bestaande check niet.
- Testadressen (`isTest: true`) slaan de hele claim-flow over, exact zoals ze ook de bestaande `assertNotDuplicate`-check al oversloegen — dat gedrag verandert niet.

## Definitie van klaar

- [ ] `outreach_sent_emails`-tabel toegevoegd aan `lib/schema.sql`, idempotent (`CREATE TABLE IF NOT EXISTS`).
- [ ] `claimEmailForSend`/`releaseEmailClaim` toegevoegd aan `lib/outreach/dedup.ts`.
- [ ] `sendOutreachMail` in `lib/outreach/send.ts` claimt vóór het versturen en laat de claim los bij een mislukte poging.
- [ ] `upsertAutomailRule` in `lib/outreach/automail.ts` valideert de vorm van `filters` vóór het wegschrijven.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm test` — groen.
- [ ] `npx tsc --noEmit` — geen fouten.
- [ ] `npx next build` — slaagt.
