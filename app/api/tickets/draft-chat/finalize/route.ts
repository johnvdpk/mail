import { requireAuth } from "@/lib/auth";
import { chatCompletion, getLightModel } from "@/lib/openrouter";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

    const conversation = messages
      .map((m) => `${m.role === "user" ? "Gebruiker" : "Assistent"}: ${m.content}`)
      .join("\n\n");

    const prompt = `Onderstaand is een gesprek tussen een gebruiker en een assistent, waarin de gebruiker een idee voor een ticket heeft besproken voor "mail" (een e-mailclient waarin tickets 's nachts automatisch worden opgelost door een AI-coding-agent).

Gesprek:
${conversation}

Zet dit gesprek om in een ticket. Neem alles mee wat de gebruiker heeft aangegeven (inclusief antwoorden op verduidelijkende vragen), verzin niets nieuws.

Antwoord ALLEEN met JSON-format (geen extra tekst):
{"title": "korte titel", "description": "concrete, volledige omschrijving voor de coding-agent"}`;

    const content = await chatCompletion([{ role: "user", content: prompt }], {
      model: getLightModel(),
      temperature: 0.5,
      jsonMode: true,
    });

    try {
      const parsed = JSON.parse(content) as { title?: string; description?: string };
      if (!parsed.title?.trim() || !parsed.description?.trim()) {
        return NextResponse.json({ error: "LLM leverde geen bruikbaar ticketvoorstel op" }, { status: 500 });
      }
      return NextResponse.json({
        title: parsed.title.trim(),
        description: parsed.description.trim(),
      });
    } catch (_e) {
      return NextResponse.json({ error: "LLM-antwoord was geen geldige JSON" }, { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ticket samenstellen mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
