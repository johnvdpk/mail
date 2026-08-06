# Codereview & security-check — 2026-08-06

Algemene doorloop van de codebase (auth, API-routes, database-laag, IMAP/SMTP,
AI-integratie, HTML-rendering van mails) op zoek naar security-problemen en
structurele fouten.

## Resultaat: gezond

- **Authenticatie:** wachtwoord-check met `crypto.timingSafeEqual` (timing-safe),
  sessies via httpOnly/secure/sameSite-cookie, server-side sessietabel met expiry.
- **Database:** overal parameterized queries (`$1`, `$2`, ...); geen enkele plek
  met user-input direct in SQL-string geplakt.
- **API-routes:** alle routes die bij data horen roepen `requireAuth()` aan
  (gecontroleerd voor alle 34 routes onder `app/api`); alleen login/check/logout
  zijn bewust publiek.
- **HTML-mails:** worden in een `<iframe sandbox="allow-same-origin">` gerenderd
  zónder `allow-scripts` — ingebedde `<script>`-tags in een e-mail kunnen dus niet
  draaien. Dit is de juiste aanpak tegen XSS via mailinhoud.
- **Bijlagen / uploads:** bestandsgrootte-limieten aanwezig (10MB/bestand, 25MB
  totaal), geen padmanipulatie mogelijk (bestandsnamen gaan niet los het
  bestandssysteem in, alles via IMAP/DB).
- **E-mailvalidatie:** to/cc/bcc worden met een nette regex gevalideerd voordat
  er verstuurd wordt.
- **Secrets:** `.env` en `.env.local` staan in `.gitignore`, geen hardcoded
  sleutels in de code.

## Gevonden en direct opgelost

**Geen rate limiting op de login-pagina.** Het wachtwoordveld op `/` had geen
enkele bescherming tegen het simpelweg blijven proberen van wachtwoorden
(brute-force). Er was al wel een timing-safe vergelijking, maar dat voorkomt
alleen dat je het wachtwoord via tijdmeting kunt raden — niet dat iemand
duizenden pogingen achter elkaar kan doen.

**Fix:** `app/api/auth/login/route.ts` + nieuwe `lib/login-rate-limit.ts` —
na 5 mislukte pogingen vanaf hetzelfde IP-adres wordt inloggen 15 minuten
geblokkeerd (HTTP 429), teller reset bij een geslaagde login.

## Niet opgelost (geen kritieke bevindingen, alleen ideeën voor later)

- `PROJECT_REVIEW.md` in de root is een oude, deels achterhaalde review
  (bijv. claimt dat MailApp/ThreadView nog gesplitst moeten worden, dat is al
  gebeurd). Kan opgeschoond of vervangen worden.
- Rate-limit hierboven is in-memory (per proces). Prima voor de huidige
  single-instance PM2-deploy; bij meerdere instanties zou dit naar de database
  of Redis moeten.
