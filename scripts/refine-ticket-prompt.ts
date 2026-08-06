// Herschrijft een ruwe ticket-omschrijving tot een beknopte, heldere opdracht
// voor Claude Code, via een licht/goedkoop model op OpenRouter. Doel: minder
// ruis (typefouten, herhalingen) in de prompt die naar de coding agent gaat,
// zodat die minder tokens nodig heeft om het ticket te begrijpen.
//
// Input: JSON op stdin, {"title": string, "description": string}
// Output: de herschreven omschrijving op stdout (of, bij ontbrekende
// configuratie of een fout, de originele omschrijving ongewijzigd).

import { chatCompletion, isOpenRouterConfigured } from "../lib/openrouter";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const raw = await readStdin();
  const { title, description } = JSON.parse(raw) as { title: string; description: string };

  if (!isOpenRouterConfigured() || !description.trim()) {
    process.stdout.write(description);
    return;
  }

  try {
    const refined = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Je herschrijft een door een gebruiker geschreven ticket-omschrijving tot een heldere, beknopte opdracht voor een coding agent (Claude Code) die de wijziging in een Next.js/TypeScript codebase gaat doorvoeren. Corrigeer typefouten en verwijder ruis en herhaling, maar behoud alle functionele eisen en context uit het origineel en verzin niets nieuws. Geef alleen de herschreven opdracht terug, in het Nederlands, zonder aanhalingstekens, koppen of uitleg eromheen.",
        },
        {
          role: "user",
          content: `Titel: ${title}\n\nOmschrijving:\n${description}`,
        },
      ],
      { temperature: 0.2 }
    );
    const cleaned = refined.trim();
    process.stdout.write(cleaned || description);
  } catch (err) {
    process.stderr.write(
      `refine-ticket-prompt: kon omschrijving niet herschrijven, val terug op origineel: ${String(err)}\n`
    );
    process.stdout.write(description);
  }
}

main();
