import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import type { FolderSummary, Thread, ThreadDetail } from "@/lib/shared/types";
import type { ThreadFilter } from "@/components/mail/ThreadList/ThreadList";
import type { EmbeddingBackfillStatus } from "@/lib/ai/embeddings";
import { applyUnreadIndicator, notifyNewMail } from "@/components/MailApp/unread-indicator";

const POLL_INTERVAL_MS = 60_000;

export type MailViewPayload = {
  folders?: FolderSummary[];
  folder?: string;
  threads?: Thread[];
  syncedAt?: string;
};

export type MailJobsPayload = {
  embeddingBackfill?: EmbeddingBackfillStatus & { created?: number };
  woken?: unknown[];
  followUps?: unknown[];
  scheduledSent?: number;
};

export type ThreadActionResult = "removed" | "flagged" | "ok" | "error";

type ThreadByMessageResponse = ThreadDetail & { folder?: string };

export function useMailThreadsState(
  initialFolders: FolderSummary[],
  initialFolder: string,
  initialThreads: Thread[],
  initialSyncedAt: string | undefined,
  imapReady: boolean
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
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingBackfillStatus | null>(
    null
  );

  const syncingRef = useRef(false);
  const prevInboxUnreadRef = useRef<number | null>(null);

  const inboxPath = useMemo(() => folders.find((f) => f.role === "inbox")?.path ?? "INBOX", [folders]);

  const applyView = useCallback((data: MailViewPayload) => {
    if (data.folders) setFolders(data.folders);
    if (data.folder) setFolder(data.folder);
    if (data.threads) setThreads(data.threads);
    setSyncedAt(data.syncedAt);
  }, []);

  const sync = useCallback(
    async (targetFolder: string, options?: { refreshFolders?: boolean }) => {
      if (!imapReady || syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      setError(null);
      try {
        const refresh = options?.refreshFolders ? "&refresh=1" : "";
        const data = await apiRequest<MailViewPayload>(
          `/api/sync?folder=${encodeURIComponent(targetFolder)}${refresh}`,
          { method: "POST", credentials: "same-origin" }
        );
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
        const data = await apiRequest<MailViewPayload>(
          `/api/threads?folder=${encodeURIComponent(targetFolder)}`
        );
        applyView(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ophalen mislukt");
      }
    },
    [applyView]
  );

  const applyEmbeddingProgress = useCallback((data: MailJobsPayload) => {
    if (!data.embeddingBackfill) return;
    const { total, embedded, pending } = data.embeddingBackfill;
    setEmbeddingProgress({ total, embedded, pending });
  }, []);

  async function processJobs() {
    try {
      const data = await apiRequest<MailJobsPayload>("/api/mail-jobs");
      applyEmbeddingProgress(data);
      if (Array.isArray(data.woken) && data.woken.length > 0) {
        setNotice(`${data.woken.length} gesnoozede mail(s) terug in Inbox`);
        void loadThreads(folder);
      }
      if (Array.isArray(data.followUps) && data.followUps.length > 0) {
        setNotice(`Follow-up: ${data.followUps.length} conversatie(s) wachten nog op antwoord`);
      }
      if (data.scheduledSent && data.scheduledSent > 0) {
        setNotice(`${data.scheduledSent} geplande mail(s) verstuurd`);
        void sync(folder);
      }
    } catch {
      // Non-blocking
    }
  }

  useEffect(() => {
    void sync(initialFolder);
  }, [initialFolder, sync]);

  useEffect(() => {
    void apiRequest<{ connected?: boolean; configured?: boolean }>("/api/google/status")
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

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const inboxUnread = folders.find((f) => f.role === "inbox")?.unread ?? 0;
    applyUnreadIndicator(inboxUnread);
    const prev = prevInboxUnreadRef.current;
    if (prev !== null && inboxUnread > prev) {
      notifyNewMail(inboxUnread - prev);
    }
    prevInboxUnreadRef.current = inboxUnread;
  }, [folders]);

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

  async function setSeen(threadId: string, seen: boolean, folderOverride?: string) {
    try {
      const data = await apiRequest<MailViewPayload>("/api/thread", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: threadId, folder: folderOverride ?? folder, seen }),
      });
      applyView(data);
    } catch {
      // Retry on next sync
    }
  }

  /** Core open-thread load. Panel/reply resets happen in the orchestrator. */
  async function openThread(threadId: string) {
    setActiveThreadId(threadId);
    setDetailLoading(true);
    setError(null);

    try {
      const data = await apiRequest<ThreadDetail>(`/api/thread?id=${encodeURIComponent(threadId)}`);
      setDetail(data);
      if (data.thread?.unread) void setSeen(threadId, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversatie ophalen mislukt");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function findAdjacentThreadId(direction: 1 | -1): string | null {
    if (visibleThreads.length === 0) return null;
    const currentIndex = visibleThreads.findIndex((t) => t.id === activeThreadId);
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.min(Math.max(currentIndex + direction, 0), visibleThreads.length - 1);
    const next = visibleThreads[nextIndex];
    if (next && next.id !== activeThreadId) return next.id;
    return null;
  }

  /** Open the thread before/after the current one in the visible list (arrow key navigation). */
  function selectAdjacentThread(direction: 1 | -1) {
    const nextId = findAdjacentThreadId(direction);
    if (nextId) void openThread(nextId);
  }

  /** Clear the open thread (used for mobile back-to-list). */
  function closeThread() {
    setActiveThreadId(null);
    setDetail(null);
    setDetailLoading(false);
  }

  function clearActiveThread() {
    setActiveThreadId(null);
    setDetail(null);
  }

  /** Core folder switch. Other-panel closes happen in the orchestrator. */
  async function selectFolder(path: string) {
    setShowSettings(false);
    setFolder(path);
    setActiveThreadId(null);
    setDetail(null);
    await loadThreads(path);
    void sync(path);
  }

  async function openThreadByMessageId(messageId: string) {
    setDetailLoading(true);
    setError(null);

    try {
      const data = await apiRequest<ThreadByMessageResponse>(
        `/api/thread?messageId=${encodeURIComponent(messageId)}`
      );

      const targetFolder =
        (typeof data.folder === "string" && data.folder) || data.thread?.folders?.[0] || null;

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversatie ophalen mislukt");
      setDetail(null);
      setActiveThreadId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function folderAction(action: string, pathOrName: string, newPath?: string) {
    setError(null);
    try {
      const data = await apiRequest<{ folders?: FolderSummary[] }>("/api/folders/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, path: pathOrName, newPath }),
      });
      if (data.folders) setFolders(data.folders);
      if (action === "delete" && pathOrName === folder) {
        const inbox = data.folders?.find((f) => f.role === "inbox")?.path ?? "INBOX";
        await selectFolder(inbox);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Map-actie mislukt");
    }
  }

  async function threadAction(
    threadId: string,
    action: string,
    destination?: string
  ): Promise<ThreadActionResult> {
    setError(null);
    try {
      const data = await apiRequest<MailViewPayload>("/api/thread/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, folder, action, destination }),
      });
      applyView(data);

      if (action === "move" || action === "delete") {
        setActiveThreadId(null);
        setDetail(null);
        return "removed";
      }
      if (action === "flag" || action === "unflag") {
        return "flagged";
      }
      return "ok";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Actie mislukt");
      return "error";
    }
  }

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
    googleConnected,
    googleConfigured,
    setGoogleConnected,
    setGoogleConfigured,
    embeddingProgress,
    inboxPath,
    visibleThreads,
    applyView,
    sync,
    loadThreads,
    applyEmbeddingProgress,
    processJobs,
    openThread,
    findAdjacentThreadId,
    selectAdjacentThread,
    closeThread,
    clearActiveThread,
    selectFolder,
    openThreadByMessageId,
    setSeen,
    folderAction,
    threadAction,
  };
}
