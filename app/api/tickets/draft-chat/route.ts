import { requireAuth } from "@/lib/auth";
import { chatCompletionStream } from "@/lib/openrouter";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// "Thinking"-model i.p.v. het lichte standaardmodel: dit gesprek moet actief
// meedenken over de app (README) en goed kunnen inschatten wanneer door te
// vragen — dat gaat beter met een redenerend model.
const CHAT_MODEL = "google/gemini-3-flash-preview";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages = body.messages?.filter((m) => m.content?.trim()) ?? [];
    if (messages.length === 0) {
      return NextResponse.json({ error: "messages verplicht" }, { status: 400 });
    }

    const readme = await readFile(join(process.cwd(), "README.md"), "utf-8").catch(() => "");

    const systemPrompt = `Je bent de assistent die een gebruiker helpt om van een los idee een goed ticket te maken voor "mail", een e-mailclient waarin tickets 's nachts automatisch worden opgelost door een AI-coding-agent (Claude Code).

Je hebt twee taken tegelijk, door elkaar heen in hetzelfde gesprek:
1. Als de gebruiker een vraag stelt over hoe de mail-app nu werkt of wat wel/niet kan: beantwoord die op basis van onderstaande documentatie. Verzin niets dat er niet in staat.
2. Als de gebruiker een idee, bug of verzoek noemt: denk actief mee, alsof je meebrainstormt. Is het nog vaag, ambigu, of moet de gebruiker eigenlijk eerst zelf een keuze maken (bijv. tussen twee aanpakken)? Stel dan een gerichte vraag terug in plaats van te gokken — één, hooguit twee vragen per beurt, geen lange vragenlijst.

De gebruiker weet niet vanzelf wanneer een gesprek "klaar" is voor een ticket, dus maak dat elke beurt expliciet: sluit je antwoord bijna altijd af met een korte suggestie voor een vervolgstap — bijvoorbeeld 1-3 concrete opties ("wil je nog A, B of C?") als er meer te verkennen valt, óf, zodra het al concreet genoeg is, een expliciete zin dat het klaar is om als ticket aangemaakt te worden (bijv. "dit is denk ik scherp genoeg — wil je het zo vastleggen via 'Ticket aanmaken', of nog iets aanscherpen?"). Alleen bij een puur informatieve vraag (uitleg over hoe iets werkt, zonder ticket-idee) hoeft dit niet.

Praat als in een gewoon chatgesprek: kort, direct, geen kopjes of opsomming-overkill tenzij dat de duidelijkheid echt helpt. Je verandert nooit zelf iets aan de app — dat gebeurt pas als de gebruiker op "Ticket aanmaken" klikt en het gesprek wordt omgezet in een ticket.

--- Projectdocumentatie (README.md) ---
${readme || "(geen documentatie gevonden)"}
--- Einde documentatie ---`;

    const stream = chatCompletionStream([{ role: "system", content: systemPrompt }, ...messages], {
      model: CHAT_MODEL,
    });

    const encoder = new TextEncoder();

    return new NextResponse(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const delta of stream) {
              controller.enqueue(encoder.encode(delta));
            }
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                `\n\n[Fout: ${err instanceof Error ? err.message : "streaming mislukt"}]\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
