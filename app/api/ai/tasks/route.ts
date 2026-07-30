import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { extractTasks } from "@/lib/ai-mail";
import {
  deleteExtractedTasks,
  getExtractedTasks,
  listExtractedTasks,
  saveExtractedTasks,
} from "@/lib/extracted-tasks";
import { getThreadDetail, toThreadContext } from "@/lib/mailbox-service";
import { isOpenRouterConfigured } from "@/lib/openrouter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    const download = searchParams.get("download") === "1";

    if (id) {
      const doc = await getExtractedTasks(id);
      if (!doc) {
        return NextResponse.json({ error: "Takenlijst niet gevonden" }, { status: 404 });
      }

      if (download) {
        const filename = `${doc.id}-${doc.subject.replace(/[^\w\- ]+/g, "").trim() || "taken"}.md`;
        return new NextResponse(doc.markdown, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
          },
        });
      }

      return NextResponse.json({ ok: true, doc });
    }

    const items = await listExtractedTasks();
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Taken ophalen mislukt";
    console.error("[ai/tasks GET]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    if (!isOpenRouterConfigured()) {
      return NextResponse.json(
        { error: "OPENROUTER_AI niet geconfigureerd in .env.local" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { threadId?: string };
    const threadId = body.threadId?.trim();
    if (!threadId) {
      return NextResponse.json({ error: "threadId verplicht" }, { status: 400 });
    }

    const detail = await getThreadDetail(threadId);
    if (!detail) {
      return NextResponse.json({ error: "Conversatie niet gevonden" }, { status: 404 });
    }

    const context = toThreadContext(detail);
    const result = await extractTasks(context);

    if (result.tasks.length === 0) {
      return NextResponse.json({
        ok: true,
        summary: result.summary,
        tasks: [],
        doc: null,
        notice: "Geen taken gevonden in deze conversatie.",
      });
    }

    const counterpart =
      context.counterpartName?.trim() || context.counterpart?.trim() || "Onbekend";

    const doc = await saveExtractedTasks({
      subject: context.subject || detail.thread.subject || "Zonder onderwerp",
      counterpart,
      threadId,
      summary: result.summary,
      tasks: result.tasks,
    });

    return NextResponse.json({ ok: true, summary: result.summary, tasks: result.tasks, doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Taken extraheren mislukt";
    console.error("[ai/tasks POST]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) {
      return NextResponse.json({ error: "id verplicht" }, { status: 400 });
    }

    const ok = await deleteExtractedTasks(id);
    if (!ok) {
      return NextResponse.json({ error: "Takenlijst niet gevonden" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verwijderen mislukt";
    console.error("[ai/tasks DELETE]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
