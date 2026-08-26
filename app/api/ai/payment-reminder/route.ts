import { requireAuth } from "@/lib/auth/auth";
import { generatePaymentReminder } from "@/lib/ai/projects-finance";
import { isOpenRouterConfigured } from "@/lib/ai/openrouter";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fallbackReminder(input: {
  clientName: string;
  projectName: string;
  lineName: string;
  amount: number;
  daysOpen: number;
}): string {
  const who = input.clientName || input.projectName;
  return [
    `Beste ${who},`,
    "",
    `Ik zie dat de betaling van €${input.amount.toFixed(2).replace(".", ",")} voor ${input.lineName} nog openstaat (${input.daysOpen} dagen). Zou je dit kunnen voldoen?`,
    "",
    "Groeten,",
    "John",
  ].join("\n");
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      clientName?: unknown;
      projectName?: unknown;
      lineName?: unknown;
      amount?: unknown;
      daysOpen?: unknown;
    };
    const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
    const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
    const lineName = typeof body.lineName === "string" ? body.lineName.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    const daysOpen = typeof body.daysOpen === "number" ? body.daysOpen : Number(body.daysOpen);
    if (!lineName || !Number.isFinite(amount) || !Number.isFinite(daysOpen)) {
      return NextResponse.json({ error: "Ongeldige herinnering" }, { status: 400 });
    }

    const payload = { clientName, projectName, lineName, amount, daysOpen };
    if (!isOpenRouterConfigured()) {
      return NextResponse.json({ body: fallbackReminder(payload) });
    }

    try {
      const text = await generatePaymentReminder(payload);
      return NextResponse.json({ body: text });
    } catch (err) {
      logger.error({ route: "ai/payment-reminder", method: "POST", err }, "AI-herinnering mislukt, val terug op sjabloon");
      return NextResponse.json({ body: fallbackReminder(payload) });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Herinnering opstellen mislukt";
    logger.error({ route: "ai/payment-reminder", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
