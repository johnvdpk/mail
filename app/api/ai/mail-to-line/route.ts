import { requireAuth } from "@/lib/auth/auth";
import { suggestMailLine } from "@/lib/ai/projects-finance";
import { isOpenRouterConfigured } from "@/lib/ai/openrouter";
import { getThreadDetail, resolveThreadFromMessage } from "@/lib/mail/mailbox-service";
import { loadAllProjectsWithLines } from "@/lib/projects/projects";
import { logger } from "@/lib/shared/logger";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

    const body = (await request.json()) as { messageId?: string };
    const messageId = body.messageId?.trim();
    if (!messageId) {
      return NextResponse.json({ error: "messageId verplicht" }, { status: 400 });
    }

    const resolved = await resolveThreadFromMessage(messageId);
    if (!resolved) {
      return NextResponse.json({ error: "Bericht niet gevonden" }, { status: 404 });
    }
    const detail = await getThreadDetail(resolved.threadId);
    const message = detail?.messages.find((item) => item.id === messageId);
    if (!message) {
      return NextResponse.json({ error: "Bericht niet gevonden" }, { status: 404 });
    }

    const projects = await loadAllProjectsWithLines();
    const suggestion = await suggestMailLine(
      {
        subject: message.subject,
        from: message.from?.email ?? message.from?.name ?? "",
        date: message.date.slice(0, 10),
        text: (message.body?.text ?? message.snippet).slice(0, 4000),
        attachmentNames: message.body?.attachments.map((file) => file.filename) ?? [],
      },
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        clientName: project.clientName,
        isOverhead: project.isOverhead,
      }))
    );

    return NextResponse.json({
      suggestion: { ...suggestion, sourceMessageId: messageId },
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        isOverhead: project.isOverhead,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mail naar regel mislukt";
    logger.error({ route: "ai/mail-to-line", method: "POST", err }, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
