# Todo: Outreach — matchOutreachReplies() van in-JS scan naar SQL-lookup

## Parallelle uitvoering

> Dit bestand is zelfstandig uitvoerbaar door een aparte Claude Code instantie.

**Hoort bij reeks:** `todo-outreach-panel-refactor.md`, `todo-outreach-leads-tab-ux.md`, `todo-outreach-automail-safety.md`, `todo-outreach-campaign-profile-columns.md`, `todo-outreach-import-preview.md`, `todo-outreach-personalize-retry.md`
**Afhankelijkheden:** geen. Dit bestand raakt alleen `lib/outreach/reply-tracking.ts` — geen overlap met de andere todo's, kan volledig parallel draaien.

---

## Context voor de uitvoerder

> De uitvoerder heeft geen toegang tot het gesprek waarin dit is aangemaakt.

**Project:** Persoonlijke Next.js-mailclient (`d:\code\mail`) — IMAP/SMTP, PostgreSQL, Docker op een VPS.
**Stack:** Next.js 15, React 19, TypeScript, PostgreSQL via `pg`.

**Kernregels (uit CLAUDE.md, van toepassing op dit ticket):**
- **Geen DIY:** dit ticket verplaatst matching-logica die nu in JavaScript wordt gedaan naar SQL — dat is precies het "gebruik de database waar het kan" principe, geen nieuwe abstractie bouwen.
- **Engelse comments, alleen "waarom" niet "wat".**
- Na de wijziging moeten `npm run lint`, `npm test`, `npx tsc --noEmit` en `npx next build` allemaal slagen.

**Betrokken bestanden (lees deze als eerste):**
- `lib/outreach/reply-tracking.ts` — 137 regels. Bevat `matchOutreachReplies()` (rond regel 54-110), de functie die dit ticket herschrijft, en `collectThreadText()` (rond regel 112-137), die **niet** wijzigt.
- `lib/shared/normalize.ts` — bevat `normalizeEmail()` (`trim().toLowerCase()`) en `normalizeMessageId()` (`trim().replace(/^<|>$/g, "").toLowerCase()`), de exacte normalisatie die in SQL gerepliceerd moet worden.
- `lib/outreach/send.ts` — `listCampaignSends()` (rond regel 88-125) bevat al een bestaand voorbeeld van precies dit SQL-idioom voor message-id-vergelijking: `lower(trim(both '<>' from coalesce(m.message_id, ''))) = lower(trim(both '<>' from cs.message_id))`. Hergebruik dit patroon letterlijk, verzin geen andere normalisatie-aanpak.
- `lib/schema.sql` — `messages`-tabel (rond regel 18-43) heeft indexen op `folder`, `date DESC` en `message_id` (regel 41-43). Er is in dit ticket geen reden om een nieuwe index toe te voegen — de winst zit in het niet meer ophalen van tot 5000 rijen per aanroep plus het per-send vroegtijdig stoppen via `LIMIT 1`, niet in een nieuwe index.
- `lib/mail/mail-jobs.ts` — roept `matchOutreachReplies()` aan (dit bestand hoeft niet gewijzigd te worden, de functiesignatuur en het `MatchOutreachResult`-return-type blijven exact hetzelfde).

## Wat er moet gebeuren

`matchOutreachReplies()` haalt nu eenmalig tot 5000 recente `messages`-rijen op en doet vervolgens, voor élke `pending` outreach-send apart, twee keer een `.find()` over die hele in-memory array (header-match, dan een from-email-fallback) — dat is O(pending × 5000) werk in JavaScript, en de rijen worden bovendien helemaal over de wire naar Node gehaald ook als er maar een paar pending sends zijn. Herschrijf dit naar twee gerichte SQL-queries per pending send (header-match, dan from-fallback), die de exact dezelfde matching-logica en voorrangsvolgorde toepassen maar het zoekwerk aan Postgres overlaten in plaats van in JavaScript te scannen. Dit is ook een correctheidsverbetering: de huidige `LIMIT 5000` op de messages-query betekent dat een reply die verder terug ligt dan de 5000 meest recente berichten nooit gematcht kan worden — die harde grens verdwijnt met deze herschrijving vanzelf.

## Stappen

### 1. `matchOutreachReplies()` herschrijven

**Bestand:** `lib/outreach/reply-tracking.ts`

Huidige situatie (volledige relevante inhoud van het bestand, rond regel 1-110):
```ts
import { currentMailAccount } from "../config/mail-accounts";
import { query } from "../shared/db";
import { normalizeEmail, normalizeMessageId } from "../shared/normalize";
import type { ResponseStatus } from "./types";

type PendingSendRow = {
  id: number;
  message_id: string;
  sent_at: Date;
  response_status: ResponseStatus;
  email_normalized: string;
};

type MessageRow = {
  id: string;
  message_id: string | null;
  in_reply_to: string | null;
  references: string[] | null;
  from_email: string | null;
  date: Date;
};

export type MatchOutreachResult = {
  matched: number;
  errors: string[];
};

function idsOf(value: string | null | undefined): string[] {
  if (!value) return [];
  return [normalizeMessageId(value)].filter(Boolean);
}

function refsOf(refs: string[] | null | undefined): string[] {
  if (!refs?.length) return [];
  return refs.map((r) => normalizeMessageId(r)).filter(Boolean);
}

function ownEmail(): string {
  try {
    return normalizeEmail(currentMailAccount().email);
  } catch {
    return "";
  }
}

function headerMatch(sendMessageId: string, message: MessageRow): boolean {
  const sendId = normalizeMessageId(sendMessageId);
  if (!sendId) return false;
  if (idsOf(message.in_reply_to).includes(sendId)) return true;
  if (idsOf(message.message_id).includes(sendId)) return true;
  return refsOf(message.references).includes(sendId);
}

export async function matchOutreachReplies(): Promise<MatchOutreachResult> {
  const errors: string[] = [];
  let matched = 0;

  const pending = await query<PendingSendRow>(
    `SELECT cs.id, cs.message_id, cs.sent_at, cs.response_status, ct.email_normalized
     FROM campaign_sends cs
     JOIN campaign_targets ct ON ct.id = cs.target_id
     WHERE cs.is_test = FALSE
       AND cs.response_status = 'pending'`
  );

  if (pending.rows.length === 0) return { matched: 0, errors };

  const messages = await query<MessageRow>(
    `SELECT id, message_id, in_reply_to, "references", from_email, date
     FROM messages
     ORDER BY date DESC
     LIMIT 5000`
  );

  const mine = ownEmail();

  for (const send of pending.rows) {
    try {
      const byHeader = messages.rows.find(
        (m) =>
          headerMatch(send.message_id, m) &&
          (!m.from_email || normalizeEmail(m.from_email) !== mine)
      );

      const byFrom =
        byHeader ??
        messages.rows.find((m) => {
          if (!m.from_email) return false;
          if (normalizeEmail(m.from_email) !== send.email_normalized) return false;
          if (mine && normalizeEmail(m.from_email) === mine) return false;
          return m.date.getTime() > send.sent_at.getTime();
        });

      if (!byFrom) continue;

      const updated = await query(
        `UPDATE campaign_sends
         SET response_status = 'replied', response_at = $2
         WHERE id = $1 AND response_status = 'pending'`,
        [send.id, byFrom.date]
      );
      if ((updated.rowCount ?? 0) > 0) matched += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Onbekende fout";
      errors.push(`Send ${send.id}: ${message}`);
    }
  }

  return { matched, errors };
}
```

Vervang de sectie van `type MessageRow` tot en met het einde van `matchOutreachReplies()` (dus alles vanaf `type MessageRow = {` t/m de sluitende `}` van `matchOutreachReplies`) door:
```ts
export type MatchOutreachResult = {
  matched: number;
  errors: string[];
};

function ownEmail(): string {
  try {
    return normalizeEmail(currentMailAccount().email);
  } catch {
    return "";
  }
}

/**
 * Most recent inbound message whose In-Reply-To, Message-ID, or References header
 * matches the outreach send's own Message-ID — the strongest possible match. Excludes
 * messages from our own account (a sent copy of the outreach mail itself could otherwise
 * match its own References chain).
 */
async function findHeaderMatch(sendMessageId: string, mine: string): Promise<Date | null> {
  const normalizedSendId = normalizeMessageId(sendMessageId);
  if (!normalizedSendId) return null;

  const result = await query<{ date: Date }>(
    `SELECT date FROM messages
     WHERE (
       lower(trim(both '<>' from coalesce(in_reply_to, ''))) = $2
       OR lower(trim(both '<>' from coalesce(message_id, ''))) = $2
       OR EXISTS (
         SELECT 1 FROM unnest(coalesce("references", '{}')) AS r
         WHERE lower(trim(both '<>' from r)) = $2
       )
     )
     AND (from_email IS NULL OR lower(trim(from_email)) <> $1)
     ORDER BY date DESC
     LIMIT 1`,
    [mine, normalizedSendId]
  );
  return result.rows[0]?.date ?? null;
}

/**
 * Fallback when there is no header match: most recent inbound message from the lead's
 * own address, sent after our outreach mail. Weaker signal than a header match (no
 * thread linkage), used as a last resort exactly like the header-match path prefers.
 */
async function findFromMatch(emailNormalized: string, mine: string, sentAt: Date): Promise<Date | null> {
  const result = await query<{ date: Date }>(
    `SELECT date FROM messages
     WHERE from_email IS NOT NULL
       AND lower(trim(from_email)) = $1
       AND lower(trim(from_email)) <> $2
       AND date > $3
     ORDER BY date DESC
     LIMIT 1`,
    [emailNormalized, mine, sentAt]
  );
  return result.rows[0]?.date ?? null;
}

export async function matchOutreachReplies(): Promise<MatchOutreachResult> {
  const errors: string[] = [];
  let matched = 0;

  const pending = await query<PendingSendRow>(
    `SELECT cs.id, cs.message_id, cs.sent_at, cs.response_status, ct.email_normalized
     FROM campaign_sends cs
     JOIN campaign_targets ct ON ct.id = cs.target_id
     WHERE cs.is_test = FALSE
       AND cs.response_status = 'pending'`
  );

  if (pending.rows.length === 0) return { matched: 0, errors };

  const mine = ownEmail();

  for (const send of pending.rows) {
    try {
      const matchedDate =
        (await findHeaderMatch(send.message_id, mine)) ??
        (await findFromMatch(send.email_normalized, mine, send.sent_at));

      if (!matchedDate) continue;

      const updated = await query(
        `UPDATE campaign_sends
         SET response_status = 'replied', response_at = $2
         WHERE id = $1 AND response_status = 'pending'`,
        [send.id, matchedDate]
      );
      if ((updated.rowCount ?? 0) > 0) matched += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Onbekende fout";
      errors.push(`Send ${send.id}: ${message}`);
    }
  }

  return { matched, errors };
}
```

Let op:
- `PendingSendRow`, de imports bovenaan het bestand, en `collectThreadText()` onderaan blijven **ongewijzigd**.
- `idsOf`, `refsOf`, `headerMatch` en `MessageRow` worden volledig verwijderd — ze worden nergens meer gebruikt na deze herschrijving. Laat ze niet ongebruikt staan (dat triggert `@typescript-eslint/no-unused-vars`, een lint-error).
- De SQL gebruikt exact hetzelfde `lower(trim(both '<>' from ...))`-patroon als de bestaande query in `lib/outreach/send.ts`'s `listCampaignSends()` — dit is bewust geen nieuw normalisatie-idioom, maar hergebruik van wat er al in de codebase staat voor message-id-vergelijking.
- `email_normalized` en `mine` zijn al genormaliseerd via `normalizeEmail()`/de database-kolom zelf, dus de SQL-vergelijking gebruikt bewust `lower(trim(from_email))` (niet extra `replace`) voor e-mailadressen — messageids gebruiken wel de `<>`-strip omdat die daadwerkelijk in de header-waarde kunnen voorkomen, e-mailadressen niet.

Acceptatiecriterium: het gedrag van `matchOutreachReplies()` blijft functioneel identisch aan de gebruiker zichtbaar (zelfde `MatchOutreachResult`-vorm, zelfde matching-voorrang: header-match wint van from-match), maar er wordt niet langer een blok van tot 5000 `messages`-rijen in Node-geheugen gehouden en per pending send doorzocht.

---

## Gotcha's en beperkingen

- Er is in deze wijziging bewust **geen** nieuwe database-index toegevoegd. Als dit in de praktijk nog steeds traag blijkt bij een grote `messages`-tabel, is de volgende stap een expressie-index op bijvoorbeeld `lower(trim(both '<>' from message_id))` — maar voeg die niet preventief toe zonder gemeten bewijs dat het nodig is, dat is buiten de scope van dit ticket.
- Dit verwijdert de `LIMIT 5000`-grens op de messages-doorzoeking. Dat is een bewuste, gewenste correctheidsverbetering (zie "Wat er moet gebeuren" hierboven), geen toevallige bijwerking om ongedaan te maken.
- `findHeaderMatch` en `findFromMatch` worden na elkaar aangeroepen (niet parallel via `Promise.all`) omdat de tweede alleen nodig is als de eerste niets oplevert (`??` kortsluit dat al door lazy-evaluatie van `await`-expressies in de `??`-keten) — dat is geen bug, dat is precies de bedoelde volgorde (header-match heeft voorrang).

## Definitie van klaar

- [ ] `matchOutreachReplies()` doet geen in-JS `.find()` meer over een vooraf opgehaalde messages-array.
- [ ] `idsOf`, `refsOf`, `headerMatch`, `MessageRow` zijn verwijderd (geen ongebruikte symbolen).
- [ ] `npm run lint` — 0 errors.
- [ ] `npm test` — groen.
- [ ] `npx tsc --noEmit` — geen fouten.
- [ ] `npx next build` — slaagt.
