import { useState } from "react";
import type { TipsResult } from "@/lib/ai/ai-mail";
import type { ExtractedTasksDoc, ExtractedTasksSummary } from "@/lib/ai/extracted-tasks-types";
import type { SortSuggestion } from "@/lib/shared/sort-types";
import type { SortConfirmItem } from "@/components/shared/SortReview/SortReview";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { MailViewPayload } from "./useMailThreadsState";

type TipsResponse = {
  summary?: string;
  tips?: string[];
  talkingPoints?: string[];
};

type TasksExtractResponse = {
  doc?: ExtractedTasksDoc;
  notice?: string;
};

type TasksLibraryResponse = {
  items?: ExtractedTasksSummary[];
};

type TaskDocResponse = {
  doc?: ExtractedTasksDoc;
};

type SortPreviewResponse = {
  suggestions?: SortSuggestion[];
};

type SortApplyResponse = MailViewPayload & {
  moved?: number;
};

type Args = {
  activeThreadId: string | null;
  folder: string;
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
  applyView: (data: MailViewPayload) => void;
  loadThreads: (targetFolder: string) => Promise<void>;
  inboxPath: string;
  setShowSettings: (open: boolean) => void;
  imapReady: boolean;
  aiReady: boolean;
};

export function useAiToolsState({
  activeThreadId,
  folder,
  setError,
  setNotice,
  applyView,
  loadThreads,
  inboxPath,
  setShowSettings,
  imapReady,
  aiReady,
}: Args) {
  const [aiOpen, setAiOpen] = useState(false);
  const [tips, setTips] = useState<TipsResult | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasksDoc, setTasksDoc] = useState<ExtractedTasksDoc | null>(null);
  const [tasksEmptyNotice, setTasksEmptyNotice] = useState<string | null>(null);
  const [showTasksLibrary, setShowTasksLibrary] = useState(false);
  const [tasksLibraryItems, setTasksLibraryItems] = useState<ExtractedTasksSummary[]>([]);
  const [tasksLibraryActive, setTasksLibraryActive] = useState<ExtractedTasksDoc | null>(null);
  const [sortSuggestions, setSortSuggestions] = useState<SortSuggestion[] | null>(null);

  const tipsAction = useAsyncAction();
  const tasksAction = useAsyncAction();
  const libraryAction = useAsyncAction();
  const sortPreviewAction = useAsyncAction();
  const sortApplyAction = useAsyncAction();

  const tipsLoading = tipsAction.loading;
  const tasksLoading = tasksAction.loading;
  const tasksLibraryLoading = libraryAction.loading;
  const sortingPreview = sortPreviewAction.loading;
  const sortingApply = sortApplyAction.loading;

  /** Clear AI docs when opening a different thread (panels stay as they are). */
  function clearAiThreadContent() {
    setTips(null);
    setTasksDoc(null);
    setTasksEmptyNotice(null);
  }

  /** Clear AI docs and close thread-scoped AI panels (closeThread). */
  function resetAiPanels() {
    setTips(null);
    setTasksDoc(null);
    setAiOpen(false);
    setTasksOpen(false);
  }

  /** Close AI drawers without clearing loaded docs (folder switch). */
  function closeAiPanels() {
    setAiOpen(false);
    setTasksOpen(false);
  }

  async function loadTips() {
    if (!activeThreadId) return;
    await tipsAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<TipsResponse>("/api/ai/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: activeThreadId }),
        });
        setTips({
          summary: data.summary ?? "",
          tips: data.tips ?? [],
          talkingPoints: data.talkingPoints ?? [],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Tips mislukt");
        throw err;
      }
    }, "Tips mislukt");
  }

  async function extractThreadTasks() {
    if (!activeThreadId) return;
    await tasksAction.run(async () => {
      setError(null);
      setTasksEmptyNotice(null);
      try {
        const data = await apiRequest<TasksExtractResponse>("/api/ai/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: activeThreadId }),
        });

        if (data.doc) {
          setTasksDoc(data.doc);
          setNotice("Takenlijst opgeslagen als .md");
        } else {
          setTasksDoc(null);
          setTasksEmptyNotice(typeof data.notice === "string" ? data.notice : "Geen taken gevonden.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Taken extraheren mislukt");
        throw err;
      }
    }, "Taken extraheren mislukt");
  }

  function openTasksPanel() {
    setShowSettings(false);
    setShowTasksLibrary(false);
    setAiOpen(false);
    setTasksOpen(true);
    if (!tasksDoc && !tasksLoading) void extractThreadTasks();
  }

  async function selectTasksLibraryItem(id: string) {
    setError(null);
    try {
      const data = await apiRequest<TaskDocResponse>(`/api/ai/tasks?id=${encodeURIComponent(id)}`);
      setTasksLibraryActive(data.doc as ExtractedTasksDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Takenlijst ophalen mislukt");
    }
  }

  async function loadTasksLibrary(selectId?: string) {
    await libraryAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<TasksLibraryResponse>("/api/ai/tasks");
        const items = data.items ?? [];
        setTasksLibraryItems(items);

        const targetId = selectId ?? tasksLibraryActive?.id ?? items[0]?.id;
        if (targetId) {
          await selectTasksLibraryItem(targetId);
        } else {
          setTasksLibraryActive(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Takenlijsten ophalen mislukt");
        throw err;
      }
    }, "Takenlijsten ophalen mislukt");
  }

  async function openTasksLibrary(selectId?: string) {
    setShowSettings(false);
    setTasksOpen(false);
    setAiOpen(false);
    setShowTasksLibrary(true);
    await loadTasksLibrary(selectId);
  }

  async function deleteTasksLibraryItem(id: string) {
    setError(null);
    try {
      await apiRequest(`/api/ai/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (tasksLibraryActive?.id === id) setTasksLibraryActive(null);
      if (tasksDoc?.id === id) setTasksDoc(null);
      await loadTasksLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function previewSort() {
    if (!imapReady || !aiReady || sortingPreview) return;
    await sortPreviewAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<SortPreviewResponse>("/api/sort/preview", { method: "POST" });
        setSortSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sorteren mislukt");
        throw err;
      }
    }, "Sorteren mislukt");
  }

  async function applySort(items: SortConfirmItem[]) {
    if (items.length === 0) {
      setSortSuggestions(null);
      return;
    }
    await sortApplyAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<SortApplyResponse>("/api/sort/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
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
        throw err;
      }
    }, "Verplaatsen mislukt");
  }

  return {
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
    sortSuggestions,
    setSortSuggestions,
    sortingPreview,
    sortingApply,
    clearAiThreadContent,
    resetAiPanels,
    closeAiPanels,
    loadTips,
    extractThreadTasks,
    openTasksPanel,
    openTasksLibrary,
    selectTasksLibraryItem,
    deleteTasksLibraryItem,
    previewSort,
    applySort,
  };
}
