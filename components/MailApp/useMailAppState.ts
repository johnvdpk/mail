import { useRef, useState } from "react";
import type { FolderSummary, Thread } from "@/lib/shared/types";
import type { LineInput, OpenLineItem } from "@/lib/projects/types";
import { useMailThreadsState } from "@/components/mail/hooks/useMailThreadsState";
import { useReplyComposeState } from "@/components/mail/hooks/useReplyComposeState";
import { useAiToolsState } from "@/components/mail/hooks/useAiToolsState";
import { useSemanticSearchState } from "@/components/mail/hooks/useSemanticSearchState";
import { useTicketsState } from "@/components/tickets/hooks/useTicketsState";
import { useNotesState } from "@/components/notes/hooks/useNotesState";
import { useProjectsState } from "@/components/projects/hooks/useProjectsState";
import { useOutreachState } from "@/components/outreach/hooks/useOutreachState";
import { apiRequest } from "@/lib/shared/api-request";

export function useMailAppState(
  initialFolders: FolderSummary[],
  initialFolder: string,
  initialThreads: Thread[],
  initialSyncedAt: string | undefined,
  imapReady: boolean,
  aiReady: boolean
) {
  const openThreadRef = useRef<(id: string) => Promise<void>>(async () => {});

  const mail = useMailThreadsState(
    initialFolders,
    initialFolder,
    initialThreads,
    initialSyncedAt,
    imapReady
  );

  const reply = useReplyComposeState({
    activeThreadId: mail.activeThreadId,
    folder: mail.folder,
    openThread: (id) => openThreadRef.current(id),
    setError: mail.setError,
    setNotice: mail.setNotice,
    applyView: mail.applyView,
    clearActiveThread: mail.clearActiveThread,
  });

  const ai = useAiToolsState({
    activeThreadId: mail.activeThreadId,
    folder: mail.folder,
    setError: mail.setError,
    setNotice: mail.setNotice,
    applyView: mail.applyView,
    loadThreads: mail.loadThreads,
    inboxPath: mail.inboxPath,
    setShowSettings: mail.setShowSettings,
    imapReady,
    aiReady,
  });

  const search = useSemanticSearchState({
    applyEmbeddingProgress: mail.applyEmbeddingProgress,
    processJobs: mail.processJobs,
    aiReady,
    setError: mail.setError,
  });

  const tickets = useTicketsState({
    setShowSettings: mail.setShowSettings,
    setShowTasksLibrary: ai.setShowTasksLibrary,
    setNotice: mail.setNotice,
    setError: mail.setError,
  });

  const notes = useNotesState({
    setShowSettings: mail.setShowSettings,
    setShowTasksLibrary: ai.setShowTasksLibrary,
    setShowTickets: tickets.setShowTickets,
    setNotice: mail.setNotice,
    setError: mail.setError,
  });

  const projects = useProjectsState({
    setShowSettings: mail.setShowSettings,
    setShowTasksLibrary: ai.setShowTasksLibrary,
    setShowTickets: tickets.setShowTickets,
    setShowNotes: notes.setShowNotes,
    setNotice: mail.setNotice,
    setError: mail.setError,
  });

  const outreach = useOutreachState({
    setShowSettings: mail.setShowSettings,
    setShowTasksLibrary: ai.setShowTasksLibrary,
    setShowTickets: tickets.setShowTickets,
    setShowNotes: notes.setShowNotes,
    setShowProjects: projects.setShowProjects,
  });

  const [composePrefill, setComposePrefill] = useState<{
    to?: string;
    subject?: string;
    body?: string;
  } | null>(null);
  const [bookMessageId, setBookMessageId] = useState<string | null>(null);

  function openCompose(prefill?: { to?: string; subject?: string; body?: string }) {
    setComposePrefill(prefill ?? null);
    mail.setComposeOpen(true);
  }

  function closeCompose() {
    setComposePrefill(null);
    mail.setComposeOpen(false);
  }

  async function remindOpenItem(item: OpenLineItem) {
    projects.setRemindingId(item.lineId);
    try {
      const data = await apiRequest<{ body: string }>("/api/ai/payment-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: item.clientName,
          projectName: item.projectName,
          lineName: item.name,
          amount: item.amount,
          daysOpen: item.daysOpen,
        }),
      });
      openCompose({
        to: item.clientName.includes("@") ? item.clientName : "",
        subject: `Betalingsherinnering: ${item.name}`,
        body: data.body,
      });
    } catch (err) {
      mail.setError(err instanceof Error ? err.message : "Herinnering opstellen mislukt");
    } finally {
      projects.setRemindingId(null);
    }
  }

  async function bookExpenseLine(projectId: number, input: LineInput) {
    await projects.addLine(projectId, input);
    setBookMessageId(null);
    mail.setNotice("Uitgave geboekt");
  }

  async function openThread(threadId: string) {
    reply.resetForNewThread();
    ai.clearAiThreadContent();
    await mail.openThread(threadId);
  }
  openThreadRef.current = openThread;

  function closeThread() {
    reply.resetForNewThread();
    ai.resetAiPanels();
    mail.closeThread();
  }

  async function selectFolder(path: string) {
    ai.setShowTasksLibrary(false);
    tickets.resetTicketsPanel();
    notes.resetNotesPanel();
    projects.resetProjectsPanel();
    outreach.resetOutreachPanel();
    ai.closeAiPanels();
    await mail.selectFolder(path);
  }

  async function openNotes() {
    projects.setShowProjects(false);
    outreach.setShowOutreach(false);
    await notes.openNotes();
  }

  async function openTickets() {
    projects.setShowProjects(false);
    outreach.setShowOutreach(false);
    await tickets.openTickets();
  }

  async function openOutreach() {
    outreach.openOutreach();
  }

  async function openOutreachThread(messageId: string, replyDraft?: string) {
    outreach.setShowOutreach(false);
    reply.resetForNewThread();
    ai.clearAiThreadContent();
    await mail.openThreadByMessageId(messageId);
    if (replyDraft) {
      reply.setReplyText(replyDraft);
      reply.openComposer();
    }
  }

  async function openTasksLibrary(selectId?: string) {
    projects.setShowProjects(false);
    outreach.setShowOutreach(false);
    await ai.openTasksLibrary(selectId);
  }

  async function openProjects() {
    outreach.setShowOutreach(false);
    await projects.openProjects();
  }

  function selectAdjacentThread(direction: 1 | -1) {
    const nextId = mail.findAdjacentThreadId(direction);
    if (nextId) void openThread(nextId);
  }

  async function threadAction(threadId: string, action: string, destination?: string) {
    const result = await mail.threadAction(threadId, action, destination);
    if (result === "removed") {
      ai.setAiOpen(false);
    } else if (result === "flagged") {
      await openThread(threadId);
    }
  }

  async function openSearchResult(messageId: string) {
    search.closeSearch();
    mail.setShowSettings(false);
    reply.resetForNewThread();
    ai.clearAiThreadContent();
    await mail.openThreadByMessageId(messageId);
  }

  return {
    folders: mail.folders,
    folder: mail.folder,
    threads: mail.threads,
    syncedAt: mail.syncedAt,
    showSettings: mail.showSettings,
    setShowSettings: mail.setShowSettings,
    composeOpen: mail.composeOpen,
    composePrefill,
    openCompose,
    closeCompose,
    activeThreadId: mail.activeThreadId,
    detail: mail.detail,
    detailLoading: mail.detailLoading,
    filter: mail.filter,
    setFilter: mail.setFilter,
    search: mail.search,
    setSearch: mail.setSearch,
    syncing: mail.syncing,
    error: mail.error,
    setError: mail.setError,
    notice: mail.notice,
    setNotice: mail.setNotice,
    undoSeconds: reply.undoSeconds,
    undoSend: reply.undoSend,
    replyText: reply.replyText,
    setReplyText: reply.setReplyText,
    replyCc: reply.replyCc,
    setReplyCc: reply.setReplyCc,
    replyBcc: reply.replyBcc,
    setReplyBcc: reply.setReplyBcc,
    replyAttachments: reply.replyAttachments,
    setReplyAttachments: reply.setReplyAttachments,
    replyAttachmentError: reply.replyAttachmentError,
    setReplyAttachmentError: reply.setReplyAttachmentError,
    drafting: reply.drafting,
    polishNotes: reply.polishNotes,
    forwardOpen: reply.forwardOpen,
    setForwardOpen: reply.setForwardOpen,
    composerExpanded: reply.composerExpanded,
    setComposerExpanded: reply.setComposerExpanded,
    composerFocusNonce: reply.composerFocusNonce,
    openComposer: reply.openComposer,
    draftFromInstruction: reply.draftFromInstruction,
    polishing: reply.polishing,
    sending: reply.sending,
    aiOpen: ai.aiOpen,
    setAiOpen: ai.setAiOpen,
    tips: ai.tips,
    tipsLoading: ai.tipsLoading,
    tasksOpen: ai.tasksOpen,
    setTasksOpen: ai.setTasksOpen,
    tasksDoc: ai.tasksDoc,
    tasksLoading: ai.tasksLoading,
    tasksEmptyNotice: ai.tasksEmptyNotice,
    showTasksLibrary: ai.showTasksLibrary,
    setShowTasksLibrary: ai.setShowTasksLibrary,
    tasksLibraryItems: ai.tasksLibraryItems,
    tasksLibraryActive: ai.tasksLibraryActive,
    tasksLibraryLoading: ai.tasksLibraryLoading,
    draftingPoint: reply.draftingPoint,
    sortSuggestions: ai.sortSuggestions,
    setSortSuggestions: ai.setSortSuggestions,
    sortingPreview: ai.sortingPreview,
    sortingApply: ai.sortingApply,
    searchOpen: search.searchOpen,
    setSearchOpen: search.setSearchOpen,
    searchBusy: search.searchBusy,
    searchJobs: search.searchJobs,
    activeSearchJob: search.activeSearchJob,
    embeddingProgress: mail.embeddingProgress,
    contacts: search.contacts,
    contactsLoading: search.contactsLoading,
    contactStatusFilter: search.contactStatusFilter,
    googleConnected: mail.googleConnected,
    googleConfigured: mail.googleConfigured,
    inboxPath: mail.inboxPath,
    visibleThreads: mail.visibleThreads,
    sync: mail.sync,
    selectFolder,
    openThread,
    selectAdjacentThread,
    closeThread,
    setSeen: mail.setSeen,
    polishReply: reply.polishReply,
    sendReply: reply.sendReply,
    snoozeThread: reply.snoozeThread,
    setFollowUp: reply.setFollowUp,
    scheduleReply: reply.scheduleReply,
    loadTips: ai.loadTips,
    extractThreadTasks: ai.extractThreadTasks,
    openTasksPanel: ai.openTasksPanel,
    openTasksLibrary,
    selectTasksLibraryItem: ai.selectTasksLibraryItem,
    deleteTasksLibraryItem: ai.deleteTasksLibraryItem,
    folderAction: mail.folderAction,
    threadAction,
    forwardMail: reply.forwardMail,
    draftFromPoint: reply.draftFromPoint,
    previewSort: ai.previewSort,
    applySort: ai.applySort,
    openSearch: search.openSearch,
    selectSearchJob: search.selectSearchJob,
    submitSearch: search.submitSearch,
    deleteSearchJob: search.deleteSearchJob,
    openSearchResult,
    loadContacts: search.loadContacts,
    changeContactStatusFilter: search.changeContactStatusFilter,
    updateContactStatus: search.updateContactStatus,
    setGoogleConnected: mail.setGoogleConnected,
    setGoogleConfigured: mail.setGoogleConfigured,
    showTickets: tickets.showTickets,
    setShowTickets: tickets.setShowTickets,
    tickets: tickets.tickets,
    activeTicket: tickets.activeTicket,
    ticketsLoading: tickets.ticketsLoading,
    ticketSubmitting: tickets.ticketSubmitting,
    commentSubmitting: tickets.commentSubmitting,
    openTickets,
    selectTicket: tickets.selectTicket,
    createTicket: tickets.createTicket,
    addTicketComment: tickets.addTicketComment,
    showNotes: notes.showNotes,
    setShowNotes: notes.setShowNotes,
    notes: notes.notes,
    activeNote: notes.activeNote,
    notesLoading: notes.notesLoading,
    noteSubmitting: notes.noteSubmitting,
    openNotes,
    selectNote: notes.selectNote,
    createNote: notes.createNote,
    updateNote: notes.updateNote,
    deleteNote: notes.deleteNote,
    showProjects: projects.showProjects,
    setShowProjects: projects.setShowProjects,
    projectsPeriod: projects.period,
    projectsOverview: projects.overview,
    activeProject: projects.active,
    projectsLoading: projects.loading,
    projectsSubmitting: projects.submitting,
    openProjects,
    changeProjectsPeriod: projects.changePeriod,
    selectProject: projects.selectProject,
    createProject: projects.createProject,
    updateProject: projects.updateProject,
    deleteProject: projects.removeProject,
    addProjectLine: projects.addLine,
    updateProjectLine: projects.updateLine,
    deleteProjectLine: projects.removeLine,
    deleteProjectLines: projects.removeLines,
    setProjectLinePaidMonth: projects.setLinePaidMonth,
    overdueCount: projects.overdueCount,
    remindingId: projects.remindingId,
    remindOpenItem,
    loadProjects: projects.loadProjects,
    bookMessageId,
    setBookMessageId,
    bookExpenseLine,
    showOutreach: outreach.showOutreach,
    setShowOutreach: outreach.setShowOutreach,
    openOutreach,
    openOutreachThread,
  };
}
