import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { readEmailConfig, writeEmailConfig, type EmailConfig } from "@/lib/email-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  const config = await readEmailConfig();
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as EmailConfig;
    const saved = await writeEmailConfig(body);
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Opslaan mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
