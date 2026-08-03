import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmailConfig } from "@/lib/email-config-shared";
import { buildMailForm } from "@/lib/mail-form-client";
import type { TipsResult } from "@/lib/ai-mail";
import { consumeAiStream } from "@/lib/ai-stream";
import type { ExtractedTasksDoc, ExtractedTasksSummary } from "@/lib/extracted-tasks-types";
import type { FolderSummary, Thread, ThreadDetail } from "@/lib/types";
import type { ThreadFilter } from "@/components/ThreadList/ThreadList";
import type { SortSuggestion } from "@/lib/sort-types";
import type { SortConfirmItem } from "@/components/SortReview/SortReview";
import type { ContactStatus, ContactView, SearchJobSummary, SearchJobView } from "@/lib/search-types";
import type { EmbeddingBackfillStatus } from "@/lib/embeddings";
import type { TicketDetail, TicketSummary } from "@/lib/tickets";

const POLL_INTERVAL_MS = 60_000;
const SEARCH_POLL_MS = 8_000;

export function useMailAppState(
  initialFolders: FolderSummary[],
  initialFolder: string,
  initialThreads: Thread[],
  initialSyncedAt: string | undefined,
  imapReady: boolean,
  aiReady: boolean
) {
  const [folders, setFolders] = useState(initialFolders);
  const [folder, setFolder] = useState(initialFolder);
  const [threads, setThreads] = useState(initialThreads);
  const [syncedAt, setSyncedAt] = useState(initialSyncedAt);
  const [showSettings, setShowSettings] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [replyBcc, setReplyBcc] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<File[]>([]);
  const [replyAttachmentError, setReplyAttachmentError] = useState<string | null>(null);
  const [draftingIntent, setDraftingIntent] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [sending, setSending] = useState(false);
  const [polishNotes, setPolishNotes] = useState<string | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [tips, setTips] = useState<TipsResult | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasksDoc, setTasksDoc] = useState<ExtractedTasksDoc | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksEmptyNotice, setTasksEmptyNotice] = useState<string | null>(null);
  const [showTasksLibrary, setShowTasksLibrary] = useState(false);
  const [tasksLibraryItems, setTasksLibraryItems] = useState<ExtractedTasksSummary[]>([]);
  const [tasksLibraryActive, setTasksLibraryActive] = useState<ExtractedTasksDoc | null>(null);
  const [tasksLibraryLoading, setTasksLibraryLoading] = useState(false);
  const [draftingPoint, setDraftingPoint] = useState<string | null>(null);
  const [sortSuggestions, setSortSuggestions] = useState<SortSuggestion[] | null>(null);
  const [sortingPreview, setSortingPreview] = useState(false);
  const [sortingApply, setSortingApply] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchJobs, setSearchJobs] = useState<SearchJobSummary[]>([]);
  const [activeSearchJob, setActiveSearchJob] = useState<SearchJobView | null>(null);
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingBackfillStatus | null>(
    null
  );
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactStatusFilter, setContactStatusFilter] = useState<ContactStatus | "all">("all");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [suggestedIntentId, setSuggestedIntentId] = useState<string | null>(null);
  const [suggestedConfidence, setSuggestedConfidence] = useState<number | null>(null);
  const [suggestedReason, setSuggestedReason] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLabel, setPreviewLabel] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewStreaming, setPreviewStreaming] = useState(false);
  const [undoSeconds, setUndoSeconds] = useState<number | null>(null);
  const [showTickets, setShowTickets] = useState(false);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [activeTicket, setActiveTicket] = useState<TicketDetail | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  const syncingRef = useRef(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingSendRef = useRef<null | (() => Promise<void>)>(null);
  const pendingDraftRef = useRef<string | null>(null);

  const inboxPath = useMemo(() => folders.find((f) => f.role === "inbox")?.path ?? "INBOX", [folders]);

  const applyView = useCallback(
    (data: { folders?: FolderSummary[]; folder?: string; threads?: Thread[]; syncedAt?: string }) => {
      if (data.folders) setFolders(data.folders);
      if (data.folder) setFolder(data.folder);
      if (data.threads) setThreads(data.threads);
      setSyncedAt(data.syncedAt);
    },
    []
  );

  const sync = useCallback(
    async (targetFolder: string) => {
      if (!imapReady || syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      setError(null);
      try {
        const res = await fetch(`/api/sync?folder=${encodeURIComponent(targetFolder)}`, {
          method: "POST",
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Sync mislukt");
        applyView(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync mislukt");
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [applyView, imapReady]
  );

  const loadThreads = useCallback(
    async (targetFolder: string) => {
      try {
        const res = await fetch(`/api/threads?folder=${encodeURIComponent(targetFolder)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ophalen mislukt");
        applyView(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ophalen mislukt");
      }
    },
    [applyView]
  );

  useEffect(() => {
    void sync(initialFolder);
  }, [initialFolder, sync]);

  useEffect(() => {
    void fetch("/api/google/status")
      .then((res) => res.json())
      .then((data) => {
        setGoogleConnected(Boolean(data.connected));
        setGoogleConfigured(Boolean(data.configured));
      })
      .catch(() => {
        setGoogleConnected(false);
        setGoogleConfigured(false);
      });

    const params = new URLSearchParams(window.location.search);
    const google = params.get("google");
    if (google === "connected") {
      setNotice("Google Agenda gekoppeld");
      setGoogleConnected(true);
      window.history.replaceState({}, "", "/");
    } else if (google === "error" || google === "state" || google === "config") {
      setError(params.get("msg") || "Google-koppeling mislukt");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  useEffect(() => {
    if (!imapReady) return;
    const timer = setInterval(() => {
      void sync(folder);
      void processJobs();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [folder, imapReady, sync]);

  function applyEmbeddingProgress(data: {
    embeddingBackfill?: EmbeddingBackfillStatus & { created?: number };
  }) {
    if (!data.embeddingBackfill) return;
    const { total, embedded, pending } = data.embeddingBackfill;
    setEmbeddingProgress({ total, embedded, pending });
  }

  async function processJobs() {
    try {
      const res = await fetch("/api/mail-jobs");
      const data = await res.json();
      if (!res.ok) return;
      applyEmbeddingProgress(data);
      if (Array.isArray(data.woken) && data.woken.length > 0) {
        setNotice(`${data.woken.length} gesnoozede mail(s) terug in Inbox`);
        void loadThreads(folder);
      }
      if (Array.isArray(data.followUps) && data.followUps.length > 0) {
        setNotice(
          `Follow-up: ${data.followUps.length} conversatie(s) wachten nog op antwoord`
        );
      }
      if (data.scheduledSent > 0) {
        setNotice(`${data.scheduledSent} geplande mail(s) verstuurd`);
        void sync(folder);
      }
    } catch {
      // Non-blocking
    }
  }

  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = threads.filter((thread) => {
      if (filter === "unread" && !thread.unread) return false;
      if (filter === "flagged" && !thread.flagged) return false;
      return true;
    });

    if (!query) return filtered;

    const scored = filtered
      .map((thread) => {
        const emails = thread.participants.map((p) => p.email.toLowerCase()).join(" ");
        const names = thread.participants.map((p) => p.name ?? "").join(" ").toLowerCase();
        const subject = thread.subject.toLowerCase();
        const snippet = thread.snippet.toLowerCase();

        let score = 0;
        if (emails.includes(query)) score += 100;
        if (names.includes(query)) score += 80;
        if (subject.includes(query)) score += 50;
        if (snippet.includes(query)) score += 10;

        return { thread, score };
      })
      .filter((entry) => entry.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.thread);
  }, [threads, filter, search]);

  async function openThread(threadId: string) {
    setActiveThreadId(threadId);
    setDetailLoading(true);
    setReplyText("");
    setReplyCc("");
    setReplyBcc("");
    setReplyAttachments([]);
    setReplyAttachmentError(null);
    setPolishNotes(null);
    setTips(null);
    setTasksDoc(null);
    setTasksEmptyNotice(null);
    setError(null);
    setSuggestedIntentId(null);
    setSuggestedConfidence(null);
    setSuggestedReason(null);
    setPreviewOpen(false);

    try {
      const res = await fetch(`/api/thread?id=${encodeURIComponent(threadId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Conversatie ophalen mislukt");
      setDetail(data);
      if (data.thread?.unread) void setSeen(threadId, true);
      if (aiReady) void loadIntentSuggestion(threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversatie ophalen mislukt");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  /** Open the thread before/after the current one in the visible list (arrow key navigation). */
  function selectAdjacentThread(direction: 1 | -1) {
    if (visibleThreads.length === 0) return;
    const currentIndex = visibleThreads.findIndex((t) => t.id === activeThreadId);
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.min(Math.max(currentIndex + direction, 0), visibleThreads.length - 1);
    const next = visibleThreads[nextIndex];
    if (next && next.id !== activeThreadId) void openThread(next.id);
  }

  /** Clear the open thread (used for mobile back-to-list). */
  function closeThread() {
    setActiveThreadId(null);
    setDetail(null);
    setDetailLoading(false);
    setReplyText("");
    setReplyCc("");
    setReplyBcc("");
    setReplyAttachments([]);
    setReplyAttachmentError(null);
    setPolishNotes(null);
    setTips(null);
    setTasksDoc(null);
    setAiOpen(false);
    setTasksOpen(false);
    setPreviewOpen(false);
  }

  async function loadIntentSuggestion(threadId: string) {
    try {
      const res = await fetch(`/api/ai/intent?threadId=${encodeURIComponent(threadId)}`);
      const data = await res.json();
      if (!res.ok) return;
      setSuggestedIntentId(typeof data.intentId === "string" ? data.intentId : null);
      setSuggestedConfidence(typeof data.confidence === "number" ? data.confidence : null);
      setSuggestedReason(typeof data.reason === "string" ? data.reason : null);
    } catch {
      // Non-blocking
    }
  }

  async function setSeen(threadId: string, seen: boolean, folderOverride?: string) {
    try {
      const res = await fetch("/api/thread", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: threadId, folder: folderOverride ?? folder, seen }),
      });
      const data = await res.json();
      if (res.ok) applyView(data);
    } catch {
      // Retry on next sync
    }
  }

  async function selectFolder(path: string) {
    setShowSettings(false);
    setShowTasksLibrary(false);
    setShowTickets(false);
    setFolder(path);
    setActiveThreadId(null);
    setDetail(null);
    setAiOpen(false);
    setTasksOpen(false);
    await loadThreads(path);
    void sync(path);
  }

  async function quickReply(intent: string, label?: string) {
    if (!activeThreadId) return;
    setDraftingIntent(intent);
    setError(null);
    setPreviewLabel(label ?? intent);
    setPreviewText("");
    setPreviewOpen(true);
    setPreviewStreaming(true);
    setPolishNotes(null);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, intent }),
      });
      const result = await consumeAiStream(res, (body) => setPreviewText(body));
      setPreviewText(result.body);
    } catch (err) {
      setPreviewOpen(false);
      setError(err instanceof Error ? err.message : "AI-draft mislukt");
    } finally {
      setDraftingIntent(null);
      setPreviewStreaming(false);
    }
  }

  function keepEditingPreview() {
    setReplyText(previewText);
    setPreviewOpen(false);
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

    // Keep draft for undo restore
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
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/mail/reply",
        {
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
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Versturen mislukt");
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
    } finally {
      setSending(false);
    }
  }

  async function confirmPreviewSend() {
    if (!activeThreadId || !previewText.trim()) return;
    const text = previewText;
    setPreviewOpen(false);
    setPreviewText("");
    queueSendWithUndo(text, () => performReplySend(text));
  }

  async function polishReply() {
    if (!replyText.trim()) return;
    setPolishing(true);
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
    } finally {
      setPolishing(false);
    }
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
      const res = await fetch("/api/mail-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", threadId: activeThreadId, folder, option }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Snooze mislukt");
      applyView(data);
      setActiveThreadId(null);
      setDetail(null);
      setNotice(`Gesnoozed tot ${new Date(data.wakeAt).toLocaleString("nl-NL")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snooze mislukt");
    }
  }

  async function setFollowUp(days: number) {
    if (!activeThreadId) return;
    setError(null);
    try {
      const res = await fetch("/api/mail-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "followup", threadId: activeThreadId, days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Follow-up mislukt");
      setNotice(`Follow-up gezet op ${new Date(data.remindAt).toLocaleDateString("nl-NL")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow-up mislukt");
    }
  }

  async function scheduleReply(sendAtIso: string) {
    if (!activeThreadId || !replyText.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/mail-jobs", {
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Plannen mislukt");
      setReplyText("");
      setPolishNotes(null);
      setNotice(`Gepland voor ${new Date(data.sendAt).toLocaleString("nl-NL")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plannen mislukt");
    }
  }

  async function loadTips() {
    if (!activeThreadId) return;
    setTipsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tips mislukt");
      setTips({ summary: data.summary ?? "", tips: data.tips ?? [], talkingPoints: data.talkingPoints ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tips mislukt");
    } finally {
      setTipsLoading(false);
    }
  }

  async function extractThreadTasks() {
    if (!activeThreadId) return;
    setTasksLoading(true);
    setError(null);
    setTasksEmptyNotice(null);
    try {
      const res = await fetch("/api/ai/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Taken extraheren mislukt");

      if (data.doc) {
        setTasksDoc(data.doc as ExtractedTasksDoc);
        setNotice("Takenlijst opgeslagen als .md");
      } else {
        setTasksDoc(null);
        setTasksEmptyNotice(
          typeof data.notice === "string" ? data.notice : "Geen taken gevonden."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Taken extraheren mislukt");
    } finally {
      setTasksLoading(false);
    }
  }

  function openTasksPanel() {
    setShowSettings(false);
    setShowTasksLibrary(false);
    setAiOpen(false);
    setTasksOpen(true);
    if (!tasksDoc && !tasksLoading) void extractThreadTasks();
  }

  async function loadTasksLibrary(selectId?: string) {
    setTasksLibraryLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/tasks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Takenlijsten ophalen mislukt");
      const items = (data.items ?? []) as ExtractedTasksSummary[];
      setTasksLibraryItems(items);

      const targetId = selectId ?? tasksLibraryActive?.id ?? items[0]?.id;
      if (targetId) {
        await selectTasksLibraryItem(targetId);
      } else {
        setTasksLibraryActive(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Takenlijsten ophalen mislukt");
    } finally {
      setTasksLibraryLoading(false);
    }
  }

  async function openTasksLibrary(selectId?: string) {
    setShowSettings(false);
    setTasksOpen(false);
    setAiOpen(false);
    setShowTasksLibrary(true);
    await loadTasksLibrary(selectId);
  }

  async function selectTasksLibraryItem(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/ai/tasks?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Takenlijst ophalen mislukt");
      setTasksLibraryActive(data.doc as ExtractedTasksDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Takenlijst ophalen mislukt");
    }
  }

  async function deleteTasksLibraryItem(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/ai/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verwijderen mislukt");
      if (tasksLibraryActive?.id === id) setTasksLibraryActive(null);
      if (tasksDoc?.id === id) setTasksDoc(null);
      await loadTasksLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function loadTickets(selectId?: number) {
    setTicketsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tickets ophalen mislukt");
      const items = (data.tickets ?? []) as TicketSummary[];
      setTickets(items);

      const targetId = selectId ?? activeTicket?.id ?? items[0]?.id;
      if (targetId) {
        await selectTicket(targetId);
      } else {
        setActiveTicket(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tickets ophalen mislukt");
    } finally {
      setTicketsLoading(false);
    }
  }

  async function openTickets() {
    setShowSettings(false);
    setShowTasksLibrary(false);
    setShowTickets(true);
    await loadTickets();
  }

  async function selectTicket(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ticket ophalen mislukt");
      setActiveTicket(data.ticket as TicketDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ticket ophalen mislukt");
    }
  }

  async function createTicket(title: string, description: string) {
    setTicketSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ticket aanmaken mislukt");
      setNotice("Ticket aangemaakt");
      await loadTickets(data.ticket?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ticket aanmaken mislukt");
    } finally {
      setTicketSubmitting(false);
    }
  }

  async function folderAction(action: string, pathOrName: string, newPath?: string) {
    setError(null);
    try {
      const res = await fetch("/api/folders/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, path: pathOrName, newPath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Map-actie mislukt");
      if (data.folders) setFolders(data.folders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Map-actie mislukt");
    }
  }

  async function threadAction(threadId: string, action: string, destination?: string) {
    setError(null);
    try {
      const res = await fetch("/api/thread/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, folder, action, destination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Actie mislukt");
      applyView(data);

      if (action === "move" || action === "delete") {
        setActiveThreadId(null);
        setDetail(null);
        setAiOpen(false);
      } else if (action === "flag" || action === "unflag") {
        await openThread(threadId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Actie mislukt");
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
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/mail/forward",
        {
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
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Doorsturen mislukt");
      applyView(data);
      setForwardOpen(false);
      setNotice(`Doorgestuurd naar ${data.to}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Doorsturen mislukt");
    } finally {
      setSending(false);
    }
  }

  async function draftFromPoint(point: string) {
    if (!activeThreadId) return;
    setDraftingPoint(point);
    setError(null);
    setPolishNotes(null);
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

  async function previewSort() {
    if (!imapReady || !aiReady || sortingPreview) return;
    setSortingPreview(true);
    setError(null);
    try {
      const res = await fetch("/api/sort/preview", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sorteren mislukt");
      setSortSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sorteren mislukt");
    } finally {
      setSortingPreview(false);
    }
  }

  async function applySort(items: SortConfirmItem[]) {
    if (items.length === 0) {
      setSortSuggestions(null);
      return;
    }
    setSortingApply(true);
    setError(null);
    try {
      const res = await fetch("/api/sort/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verplaatsen mislukt");
      applyView(data);
      setSortSuggestions(null);
      setNotice(
        typeof data.moved === "number"
          ? `${data.moved} bericht${data.moved === 1 ? "" : "en"} verplaatst`
          : "Berichten verplaatst"
      );
      if (folder !== inboxPath) {
        await loadThreads(folder);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verplaatsen mislukt");
    } finally {
      setSortingApply(false);
    }
  }

  async function loadSearchJobs() {
    try {
      const res = await fetch("/api/ai/search");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Zoekopdrachten ophalen mislukt");
      setSearchJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoekopdrachten ophalen mislukt");
    }
  }

  async function openSearch() {
    setSearchOpen(true);
    setError(null);
    await loadSearchJobs();
    void processJobs();
  }

  async function selectSearchJob(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/ai/search?id=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Zoekopdracht ophalen mislukt");
      setActiveSearchJob(data.job ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoekopdracht ophalen mislukt");
    }
  }

  async function submitSearch(prompt: string) {
    if (!aiReady || searchBusy) return;
    setSearchBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Zoeken mislukt");
      setActiveSearchJob(data.job ?? null);
      await loadSearchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoeken mislukt");
    } finally {
      setSearchBusy(false);
    }
  }

  async function deleteSearchJob(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/ai/search?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verwijderen mislukt");
      if (activeSearchJob?.id === id) setActiveSearchJob(null);
      await loadSearchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function openSearchResult(messageId: string) {
    setSearchOpen(false);
    setShowSettings(false);
    setDetailLoading(true);
    setReplyText("");
    setReplyCc("");
    setReplyBcc("");
    setReplyAttachments([]);
    setReplyAttachmentError(null);
    setPolishNotes(null);
    setTips(null);
    setTasksDoc(null);
    setTasksEmptyNotice(null);
    setError(null);
    setSuggestedIntentId(null);
    setSuggestedConfidence(null);
    setSuggestedReason(null);
    setPreviewOpen(false);

    try {
      const res = await fetch(
        `/api/thread?messageId=${encodeURIComponent(messageId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Conversatie ophalen mislukt");

      const targetFolder =
        (typeof data.folder === "string" && data.folder) ||
        data.thread?.folders?.[0] ||
        null;

      if (targetFolder && targetFolder !== folder) {
        setFolder(targetFolder);
        await loadThreads(targetFolder);
      }

      const threadId = data.thread?.id as string | undefined;
      if (!threadId) throw new Error("Conversatie ophalen mislukt");

      setActiveThreadId(threadId);
      setDetail(data);
      if (data.thread?.unread) {
        void setSeen(threadId, true, targetFolder ?? undefined);
      }
      if (aiReady) void loadIntentSuggestion(threadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversatie ophalen mislukt");
      setDetail(null);
      setActiveThreadId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadContacts(status?: ContactStatus | "all") {
    const effective = status ?? contactStatusFilter;
    setContactsLoading(true);
    setError(null);
    try {
      const qs = effective !== "all" ? `?status=${effective}` : "";
      const res = await fetch(`/api/ai/contacts${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Contacten ophalen mislukt");
      setContacts(Array.isArray(data.contacts) ? data.contacts : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contacten ophalen mislukt");
    } finally {
      setContactsLoading(false);
    }
  }

  async function changeContactStatusFilter(status: ContactStatus | "all") {
    setContactStatusFilter(status);
    await loadContacts(status);
  }

  async function updateContactStatus(id: number, status: ContactStatus) {
    setError(null);
    try {
      const res = await fetch(`/api/ai/contacts?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bijwerken mislukt");
      setContacts((prev) => prev.map((c) => (c.id === id ? data.contact : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bijwerken mislukt");
    }
  }

  // Poll active search job while semantic enrichment may still run.
  useEffect(() => {
    if (!searchOpen || !activeSearchJob) return;
    const status = activeSearchJob.status;
    if (status !== "keyword_done" && status !== "semantic_running") return;

    const timer = setInterval(() => {
      void (async () => {
        try {
          // Kick background semantic jobs, then refresh the active job.
          const jobsRes = await fetch("/api/mail-jobs");
          const jobsData = await jobsRes.json();
          if (jobsRes.ok) applyEmbeddingProgress(jobsData);
          const res = await fetch(`/api/ai/search?id=${activeSearchJob.id}`);
          const data = await res.json();
          if (!res.ok || !data.job) return;
          setActiveSearchJob(data.job);
          if (data.job.status === "done" || data.job.status === "failed") {
            await loadSearchJobs();
          }
        } catch {
          // Non-blocking
        }
      })();
    }, SEARCH_POLL_MS);

    return () => clearInterval(timer);
  }, [searchOpen, activeSearchJob?.id, activeSearchJob?.status]);

  return {
    folders,
    folder,
    threads,
    syncedAt,
    showSettings,
    setShowSettings,
    composeOpen,
    setComposeOpen,
    activeThreadId,
    detail,
    detailLoading,
    filter,
    setFilter,
    search,
    setSearch,
    syncing,
    error,
    setError,
    notice,
    setNotice,
    undoSeconds,
    undoSend,
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
    draftingIntent,
    suggestedIntentId,
    suggestedConfidence,
    suggestedReason,
    previewOpen,
    setPreviewOpen,
    previewLabel,
    previewText,
    setPreviewText,
    previewStreaming,
    keepEditingPreview,
    confirmPreviewSend,
    polishing,
    sending,
    polishNotes,
    forwardOpen,
    setForwardOpen,
    aiOpen,
    setAiOpen,
    tips,
    tipsLoading,
    tasksOpen,
    setTasksOpen,
    tasksDoc,
    tasksLoading,
    tasksEmptyNotice,
    showTasksLibrary,
    setShowTasksLibrary,
    tasksLibraryItems,
    tasksLibraryActive,
    tasksLibraryLoading,
    draftingPoint,
    sortSuggestions,
    setSortSuggestions,
    sortingPreview,
    sortingApply,
    searchOpen,
    setSearchOpen,
    searchBusy,
    searchJobs,
    activeSearchJob,
    embeddingProgress,
    contacts,
    contactsLoading,
    contactStatusFilter,
    googleConnected,
    googleConfigured,
    inboxPath,
    visibleThreads,
    sync,
    selectFolder,
    openThread,
    selectAdjacentThread,
    closeThread,
    setSeen,
    quickReply,
    polishReply,
    sendReply,
    snoozeThread,
    setFollowUp,
    scheduleReply,
    loadTips,
    extractThreadTasks,
    openTasksPanel,
    openTasksLibrary,
    selectTasksLibraryItem,
    deleteTasksLibraryItem,
    folderAction,
    threadAction,
    forwardMail,
    draftFromPoint,
    previewSort,
    applySort,
    openSearch,
    selectSearchJob,
    submitSearch,
    deleteSearchJob,
    openSearchResult,
    loadContacts,
    changeContactStatusFilter,
    updateContactStatus,
    setGoogleConnected,
    setGoogleConfigured,
    showTickets,
    setShowTickets,
    tickets,
    activeTicket,
    ticketsLoading,
    ticketSubmitting,
    openTickets,
    selectTicket,
    createTicket,
  };
}
