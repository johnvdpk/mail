/**
 * Test SMTP login — run: npm run test:smtp
 * Does NOT print your password, only whether auth succeeds.
 */
import { env, loadEnvFromFile } from "../lib/config/env.js";
import { verifySmtpConnection, isSmtpConfigured } from "../lib/mail/mail.js";

loadEnvFromFile();

console.log("SMTP test\n");
console.log("  Host:", env("SMTP_HOST"));
console.log("  Port:", env("SMTP_PORT") ?? "465");
console.log("  User:", env("SMTP_USER"));
console.log("  Pass:", env("SMTP_PASS") ? `(${env("SMTP_PASS")!.length} tekens)` : "LEEG");
console.log("  From:", env("SMTP_FROM"));
console.log("");

if (!isSmtpConfigured()) {
  console.error("SMTP velden incompleet in .env.local");
  process.exit(1);
}

try {
  await verifySmtpConnection();
  console.log("OK — login gelukt! SMTP werkt.\n");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("FOUT:", msg);
  console.error(`
Tips bij Strato 535:
  1. SMTP_USER = volledig adres: john@aiadapt.nl
  2. SMTP_PASS = wachtwoord van het POSTVAK (Strato → E-mail → wachtwoord)
     Niet je Strato klantenlogin!
  3. Wachtwoord met & tussen dubbele quotes: SMTP_PASS="abc&123"
  4. Probeer poort 587:
       SMTP_PORT=587
       SMTP_SECURE=false
  5. Reset mailbox-wachtwoord in Strato en vul opnieuw in
`);
  process.exit(1);
}
