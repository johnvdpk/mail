import { useRef, useState } from "react";
import { buildMailForm } from "@/lib/mail/mail-form-client";
import { consumeAiStream } from "@/lib/ai/ai-stream";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { MailViewPayload } from "./useMailThreadsState";

type ReplySendResponse = MailViewPayload & { to?: string };
type SnoozeResponse = MailViewPayload & { wakeAt: string };
type FollowUpResponse = { remindAt: string };
type ScheduleResponse = { sendAt: string };
type ForwardResponse = MailViewPayload & { to?: string };

type Args = {
  activeThreadId: string | null;
  folder: string;
  openThread: (id: string) => Promise<void>;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  applyView: (data: MailViewPayload) => void;
  clearActiveThread: () => void;
};

export function useReplyComposeState({
  activeThreadId,
  folder,
  openThread,
  setError,
  setNotice,
  applyView,
  clearActiveThread,
}: Args) {
  const [replyText, setReplyText] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [replyBcc, setReplyBcc] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [replyAttachmentError, setReplyAttachmentError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [polishNotes, setPolishNotes] = useState<string | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);
  const [undoSeconds, setUndoSeconds] = useState<number | null>(null);
  const [draftingPoint, setDraftingPoint] = useState<string | null>(null);

  const polishAction = useAsyncAction();
  const sendAction = useAsyncAction();
  const polishing = polishAction.loading;
  const sending = sendAction.loading;

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSendRef = useRef<null | (() => Promise<void>)>(null);
  const pendingDraftRef = useRef<string | null>(null);

  /** Clear reply/preview fields when switching or closing a thread. */
  function resetForNewThread() {
    setReplyText("");
    setReplyCc("");
    setReplyBcc("");
    setReplyAttachments([]);
    setReplyAttachmentError(null);
    setPolishNotes(null);
    setComposerExpanded(false);
  }

  function openComposer() {
    setComposerExpanded(true);
    setComposerFocusNonce((n) => n + 1);
  }

  async function draftFromInstruction(instruction: string) {
    if (!activeThreadId) return;
    const existing = replyText.trim();
    setDrafting(true);
    setError(null);
    setPolishNotes(null);
    setComposerExpanded(true);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          intent: instruction,
          draft: existing || undefined,
        }),
      });
      const result = await consumeAiStream(res, (body) => setReplyText(body));
      setReplyText(result.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI-draft mislukt");
    } finally {
      setDrafting(false);
    }
  }

  function clearUndoTimers() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (undoCountdownRef.current) clearInterval(undoCountdownRef.current);
    undoTimerRef.current = null;
    undoCountdownRef.current = null;
    pendingSendRef.current = null;
    setUndoSeconds(null);
  }

  function queueSendWithUndo(text: string, performSend: () => Promise<void>) {
    clearUndoTimers();
    pendingSendRef.current = performSend;
    setUndoSeconds(8);
    setNotice("Mail wordt over 8 seconden verstuurd…");

    undoCountdownRef.current = setInterval(() => {
      setUndoSeconds((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    undoTimerRef.current = setTimeout(() => {
      const run = pendingSendRef.current;
      clearUndoTimers();
      if (run) void run();
    }, 8000);

    pendingDraftRef.current = text;
  }

  function undoSend() {
    const draft = pendingDraftRef.current;
    clearUndoTimers();
    if (draft) setReplyText(draft);
    pendingDraftRef.current = null;
    setNotice("Verzenden geannuleerd");
  }

  async function performReplySend(text: string) {
    if (!activeThreadId || !text.trim()) return;
    await sendAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<ReplySendResponse>("/api/mail/reply", {
          method: "POST",
          body: buildMailForm(
            {
              threadId: activeThreadId,
              folder,
              text,
              cc: replyCc || undefined,
              bcc: replyBcc || undefined,
            },
            replyAttachments
          ),
        });
        applyView(data);
        setReplyText("");
        setReplyCc("");
        setReplyBcc("");
        setReplyAttachments([]);
        setReplyAttachmentError(null);
        setPolishNotes(null);
        setNotice(`Antwoord verstuurd naar ${data.to}`);
        await openThread(activeThreadId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Versturen mislukt");
        throw err;
      }
    }, "Versturen mislukt");
  }

  async function polishReply() {
    if (!replyText.trim()) return;
    await polishAction.run(async () => {
      setError(null);
      setPolishNotes(null);
      try {
        const res = await fetch("/api/ai/polish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: activeThreadId, text: replyText }),
        });
        const result = await consumeAiStream(res, (body) => setReplyText(body));
        setReplyText(result.body);
        setPolishNotes(result.notes || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Correctie mislukt");
        throw err;
      }
    }, "Correctie mislukt");
  }

  async function sendReply() {
    if (!activeThreadId || !replyText.trim()) return;
    const text = replyText;
    setReplyText("");
    queueSendWithUndo(text, () => performReplySend(text));
  }

  async function snoozeThread(option: "1h" | "tomorrow" | "friday" | "nextweek") {
    if (!activeThreadId) return;
    setError(null);
    try {
      const data = await apiRequest<SnoozeResponse>("/api/mail-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", threadId: activeThreadId, folder, option }),
      });
      applyView(data);
      clearActiveThread();
      setNotice(`Gesnoozed tot ${new Date(data.wakeAt).toLocaleString("nl-NL")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snooze mislukt");
    }
  }

  async function setFollowUp(days: number) {
    if (!activeThreadId) return;
    setError(null);
    try {
      const data = await apiRequest<FollowUpResponse>("/api/mail-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "followup", threadId: activeThreadId, days }),
      });
      setNotice(`Follow-up gezet op ${new Date(data.remindAt).toLocaleDateString("nl-NL")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow-up mislukt");
    }
  }

  async function scheduleReply(sendAtIso: string) {
    if (!activeThreadId || !replyText.trim()) return;
    setError(null);
    try {
      const data = await apiRequest<ScheduleResponse>("/api/mail-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule",
          kind: "reply",
          threadId: activeThreadId,
          text: replyText,
          cc: replyCc || undefined,
          bcc: replyBcc || undefined,
          sendAt: sendAtIso,
        }),
      });
      setReplyText("");
      setPolishNotes(null);
      setNotice(`Gepland voor ${new Date(data.sendAt).toLocaleString("nl-NL")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plannen mislukt");
    }
  }

  async function forwardMail(
    to: string,
    text: string,
    attachments: File[],
    cc?: string,
    bcc?: string
  ) {
    if (!activeThreadId) return;
    await sendAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<ForwardResponse>("/api/mail/forward", {
          method: "POST",
          body: buildMailForm(
            {
              threadId: activeThreadId,
              folder,
              to,
              text,
              cc,
              bcc,
            },
            attachments
          ),
        });
        applyView(data);
        setForwardOpen(false);
        setNotice(`Doorgestuurd naar ${data.to}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Doorsturen mislukt");
        throw err;
      }
    }, "Doorsturen mislukt");
  }

  async function draftFromPoint(point: string) {
    if (!activeThreadId) return;
    setDraftingPoint(point);
    setError(null);
    setPolishNotes(null);
    setComposerExpanded(true);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, intent: point }),
      });
      const result = await consumeAiStream(res, (body) => setReplyText(body));
      setReplyText(result.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Concept mislukt");
    } finally {
      setDraftingPoint(null);
    }
  }

  return {
    replyText,
    setReplyText,
    replyCc,
    setReplyCc,
    replyBcc,
    setReplyBcc,
    replyAttachments,
    setReplyAttachments,
    replyAttachmentError,
    setReplyAttachmentError,
    drafting,
    polishNotes,
    forwardOpen,
    setForwardOpen,
    composerExpanded,
    setComposerExpanded,
    composerFocusNonce,
    undoSeconds,
    draftingPoint,
    polishing,
    sending,
    resetForNewThread,
    openComposer,
    draftFromInstruction,
    undoSend,
    polishReply,
    sendReply,
    snoozeThread,
    setFollowUp,
    scheduleReply,
    forwardMail,
    draftFromPoint,
  };
}
