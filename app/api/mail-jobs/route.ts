import { requireAuth } from "@/lib/auth";
import {
  cancelScheduledSend,
  createFollowUp,
  processMailJobs,
  scheduleSend,
  snoozeThread,
  type SnoozeOption,
} from "@/lib/mail-jobs";
import { getFolderView, resolveFolderPath } from "@/lib/mailbox-service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const result = await processMailJobs();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Jobs mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      action?: string;
      threadId?: string;
      folder?: string;
      option?: SnoozeOption;
      days?: number;
      note?: string;
      sendAt?: string;
      kind?: "reply" | "new";
      text?: string;
      cc?: string;
      bcc?: string;
      to?: string;
      subject?: string;
      id?: number;
    };

    const action = body.action?.trim();
    if (!action) {
      return NextResponse.json({ error: "action verplicht" }, { status: 400 });
    }

    if (action === "snooze") {
      const threadId = body.threadId?.trim();
      const option = body.option;
      if (!threadId || !option) {
        return NextResponse.json({ error: "threadId en option verplicht" }, { status: 400 });
      }
      const folder = await resolveFolderPath(body.folder);
      const result = await snoozeThread(threadId, folder, option);
      const view = await getFolderView(folder);
      return NextResponse.json({ ok: true, ...result, ...view });
    }

    if (action === "followup") {
      const threadId = body.threadId?.trim();
      const days = typeof body.days === "number" ? body.days : 3;
      if (!threadId) {
        return NextResponse.json({ error: "threadId verplicht" }, { status: 400 });
      }
      const result = await createFollowUp(threadId, days, body.note);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "schedule") {
      const sendAt = body.sendAt ? new Date(body.sendAt) : null;
      if (!sendAt || Number.isNaN(sendAt.getTime()) || sendAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: "sendAt moet in de toekomst liggen" }, { status: 400 });
      }

      if (body.kind === "reply") {
        const threadId = body.threadId?.trim();
        const text = body.text?.trim() ?? "";
        if (!threadId || !text) {
          return NextResponse.json({ error: "threadId en text verplicht" }, { status: 400 });
        }
        const result = await scheduleSend(
          {
            kind: "reply",
            threadId,
            text,
            cc: body.cc,
            bcc: body.bcc,
          },
          sendAt
        );
        return NextResponse.json({ ok: true, ...result });
      }

      const to = body.to?.trim() ?? "";
      const subject = body.subject?.trim() ?? "";
      const text = body.text?.trim() ?? "";
      if (!to || !subject || !text) {
        return NextResponse.json({ error: "to, subject en text verplicht" }, { status: 400 });
      }
      const result = await scheduleSend({ kind: "new", to, subject, text }, sendAt);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "cancel-schedule") {
      if (typeof body.id !== "number") {
        return NextResponse.json({ error: "id verplicht" }, { status: 400 });
      }
      const ok = await cancelScheduledSend(body.id);
      return NextResponse.json({ ok });
    }

    return NextResponse.json({ error: `Onbekende action: ${action}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Actie mislukt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
