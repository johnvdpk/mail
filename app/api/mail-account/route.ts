import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  MAIL_ACCOUNTS,
  getActiveMailAccountId,
  isMailAccountConfigured,
  refreshActiveMailAccount,
  setActiveMailAccount,
  type MailAccountId,
} from "@/lib/mail-accounts";

export const dynamic = "force-dynamic";

function isKnownId(id: unknown): id is MailAccountId {
  return typeof id === "string" && MAIL_ACCOUNTS.some((a) => a.id === id);
}

async function listAccounts() {
  const activeId = await refreshActiveMailAccount();
  return MAIL_ACCOUNTS.map((account) => ({
    ...account,
    active: account.id === activeId,
    configured: isMailAccountConfigured(account.id),
  }));
}

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  return NextResponse.json({ accounts: await listAccounts() });
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = body?.id;
  if (!isKnownId(id)) {
    return NextResponse.json({ error: "Onbekend account" }, { status: 400 });
  }
  if (!isMailAccountConfigured(id)) {
    return NextResponse.json(
      { error: "Dit account is nog niet geconfigureerd — vul de bijbehorende env-variabelen in" },
      { status: 400 }
    );
  }

  await setActiveMailAccount(id);
  return NextResponse.json({ accounts: await listAccounts(), activeId: getActiveMailAccountId() });
}
