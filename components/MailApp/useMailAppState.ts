import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmailConfig } from "@/lib/email-config";
import type { TipsResult } from "@/lib/ai-mail";
import type { FolderSummary, Thread, ThreadDetail } from "@/lib/types";
import type { ThreadFilter } from "@/components/ThreadList/ThreadList";
import type { SortSuggestion } from "@/lib/sort-types";
import type { SortConfirmItem } from "@/components/SortReview/SortReview";

const POLL_INTERVAL_MS = 60_000;

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
  const [draftingIntent, setDraftingIntent] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [sending, setSending] = useState(false);
  const [polishNotes, setPolishNotes] = useState<string | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [tips, setTips] = useState<TipsResult | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [draftingPoint, setDraftingPoint] = useState<string | null>(null);
  const [sortSuggestions, setSortSuggestions] = useState<SortSuggestion[] | null>(null);
  const [sortingPreview, setSortingPreview] = useState(false);
  const [sortingApply, setSortingApply] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);

  const syncingRef = useRef(false);

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
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [folder, imapReady, sync]);

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
    setPolishNotes(null);
    setTips(null);
    setError(null);

    try {
      const res = await fetch(`/api/thread?id=${encodeURIComponent(threadId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Conversatie ophalen mislukt");
      setDetail(data);
      if (data.thread?.unread) void setSeen(threadId, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversatie ophalen mislukt");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function setSeen(threadId: string, seen: boolean) {
    try {
      const res = await fetch("/api/thread", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: threadId, folder, seen }),
      });
      const data = await res.json();
      if (res.ok) applyView(data);
    } catch {
      // Retry on next sync
    }
  }

  async function selectFolder(path: string) {
    setShowSettings(false);
    setFolder(path);
    setActiveThreadId(null);
    setDetail(null);
    setAiOpen(false);
    await loadThreads(path);
    void sync(path);
  }

  async function quickReply(intent: string) {
    if (!activeThreadId) return;
    setDraftingIntent(intent);
    setError(null);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, intent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI-draft mislukt");
      setReplyText(data.body ?? "");
      setPolishNotes(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI-draft mislukt");
    } finally {
      setDraftingIntent(null);
    }
  }

  async function polishReply() {
    if (!replyText.trim()) return;
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, text: replyText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Correctie mislukt");
      setReplyText(data.body ?? replyText);
      setPolishNotes(data.notes || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correctie mislukt");
    } finally {
      setPolishing(false);
    }
  }

  async function sendReply() {
    if (!activeThreadId || !replyText.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          folder,
          text: replyText,
          cc: replyCc || undefined,
          bcc: replyBcc || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Versturen mislukt");
      applyView(data);
      setReplyText("");
      setReplyCc("");
      setReplyBcc("");
      setPolishNotes(null);
      setNotice(`Antwoord verstuurd naar ${data.to}`);
      await openThread(activeThreadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versturen mislukt");
    } finally {
      setSending(false);
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

  async function forwardMail(to: string, text: string, cc?: string, bcc?: string) {
    if (!activeThreadId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          folder,
          to,
          text,
          cc: cc || undefined,
          bcc: bcc || undefined,
        }),
      });
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
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId, intent: point }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Concept mislukt");
      setReplyText(data.body ?? "");
      setPolishNotes(null);
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
    replyText,
    setReplyText,
    replyCc,
    setReplyCc,
    replyBcc,
    setReplyBcc,
    draftingIntent,
    polishing,
    sending,
    polishNotes,
    forwardOpen,
    setForwardOpen,
    aiOpen,
    setAiOpen,
    tips,
    tipsLoading,
    draftingPoint,
    sortSuggestions,
    setSortSuggestions,
    sortingPreview,
    sortingApply,
    googleConnected,
    googleConfigured,
    inboxPath,
    visibleThreads,
    sync,
    selectFolder,
    openThread,
    setSeen,
    quickReply,
    polishReply,
    sendReply,
    loadTips,
    folderAction,
    threadAction,
    forwardMail,
    draftFromPoint,
    previewSort,
    applySort,
    setGoogleConnected,
    setGoogleConfigured,
  };
}
