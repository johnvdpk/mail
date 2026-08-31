"use client";

import { useEffect, type CSSProperties } from "react";
import type { EmailConfig } from "@/lib/config/email-config-shared";
import type { FolderSummary, Thread } from "@/lib/shared/types";
import { useResizablePanel } from "@/lib/shared/use-resizable-panel";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary/ErrorBoundary";
import { AiDrawer } from "@/components/shared/AiDrawer/AiDrawer";
import { Composer } from "@/components/mail/Composer/Composer";
import { FolderRail } from "@/components/mail/FolderRail/FolderRail";
import { MailConfigEditor } from "@/components/settings/MailConfigEditor";
import { TasksLibrary } from "@/components/tasks/TasksLibrary/TasksLibrary";
import { TasksPanel } from "@/components/tasks/TasksPanel/TasksPanel";
import { TicketsPanel } from "@/components/tickets/TicketsPanel/TicketsPanel";
import { NotesPanel } from "@/components/notes/NotesPanel/NotesPanel";
import { ProjectsPanel } from "@/components/projects/ProjectsPanel/ProjectsPanel";
import { OutreachPanel } from "@/components/outreach/OutreachPanel/OutreachPanel";
import { ThreadList } from "@/components/mail/ThreadList/ThreadList";
import { ThreadView } from "@/components/mail/ThreadView/ThreadView";
import { MailAppOverlays } from "./MailAppOverlays";
import { useMailAppState } from "./useMailAppState";
import { replyAllCc } from "@/lib/mail/reply-all-cc";
import styles from "./MailApp.module.css";

const LIST_WIDTH = { defaultSize: 280, min: 200, max: 480 } as const;
const COMPOSER_HEIGHT = { defaultSize: 260, min: 140, max: 520 } as const;

type Props = {
  account: string;
  emailConfig: EmailConfig;
  initialFolders: FolderSummary[];
  initialFolder: string;
  initialThreads: Thread[];
  initialSyncedAt?: string;
  smtpReady: boolean;
  imapReady: boolean;
  aiReady: boolean;
};

export function MailApp({
  account,
  emailConfig,
  initialFolders,
  initialFolder,
  initialThreads,
  initialSyncedAt,
  smtpReady,
  imapReady,
  aiReady,
}: Props) {
  const state = useMailAppState(
    initialFolders,
    initialFolder,
    initialThreads,
    initialSyncedAt,
    imapReady,
    aiReady
  );

  const replyAllCcValue = state.detail ? replyAllCc(state.detail, account) : "";
  const canReplyAll = Boolean(replyAllCcValue);

  const listPanel = useResizablePanel({
    storageKey: "mail-list-width",
    ...LIST_WIDTH,
  });

  const composerPanel = useResizablePanel({
    storageKey: "mail-composer-height",
    axis: "y",
    inverted: true,
    ...COMPOSER_HEIGHT,
  });

  useEffect(() => {
    const dialogOpen =
      state.showSettings ||
      state.showTasksLibrary ||
      state.showTickets ||
      state.showNotes ||
      state.showProjects ||
      state.showOutreach ||
      state.composeOpen ||
      state.forwardOpen ||
      state.searchOpen ||
      Boolean(state.sortSuggestions);

    function onKeyDown(event: KeyboardEvent) {
      if (dialogOpen) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        state.selectAdjacentThread(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        state.selectAdjacentThread(-1);
      } else if ((event.key === "Delete" || event.key === "Backspace") && state.activeThreadId) {
        event.preventDefault();
        void state.threadAction(state.activeThreadId, "delete");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    state.visibleThreads,
    state.activeThreadId,
    state.showSettings,
    state.showTasksLibrary,
    state.showTickets,
    state.showNotes,
    state.showProjects,
    state.showOutreach,
    state.composeOpen,
    state.forwardOpen,
    state.searchOpen,
    state.sortSuggestions,
    state.selectAdjacentThread,
    state.threadAction,
  ]);

  const mobileView =
    state.showSettings ||
    state.showTasksLibrary ||
    state.showTickets ||
    state.showNotes ||
    state.showProjects ||
    state.showOutreach
      ? "settings"
      : state.activeThreadId
        ? "thread"
        : "list";

  return (
    <div
      className={styles.shell}
      data-mobile-view={mobileView}
      style={
        {
          "--list-w": `${listPanel.size}px`,
          "--composer-h": `${composerPanel.size}px`,
        } as CSSProperties
      }
    >
      <div className={styles.navCol}>
        <FolderRail
          account={account}
          folders={state.folders}
          activeFolder={state.folder}
          settingsActive={state.showSettings}
          tasksActive={state.showTasksLibrary}
          ticketsActive={state.showTickets}
          notesActive={state.showNotes}
          projectsActive={state.showProjects}
          overdueCount={state.overdueCount}
          outreachActive={state.showOutreach}
          onSelectFolder={(path) => void state.selectFolder(path)}
          onCompose={() => state.openCompose()}
          onOpenSettings={() => {
            state.setShowTasksLibrary(false); state.setShowTickets(false);
            state.setShowNotes(false); state.setShowProjects(false);
            state.setShowOutreach(false); state.setShowSettings(true);
          }}
          onOpenTasks={() => void state.openTasksLibrary()}
          onOpenTickets={() => void state.openTickets()}
          onOpenNotes={() => void state.openNotes()}
          onOpenProjects={() => void state.openProjects()}
          onOpenOutreach={() => state.openOutreach()}
          onCreateFolder={(name) => void state.folderAction("create", name)}
          onRenameFolder={(path, newName) => void state.folderAction("rename", path, newName)}
          onDeleteFolder={(path) => void state.folderAction("delete", path)}
          onLogout={() => {
            void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
              window.location.reload();
            });
          }}
        />
      </div>

      {state.showSettings ? (
        <ErrorBoundary title="Instellingen konden niet worden geladen">
          <div className={styles.settings}>
            <MailConfigEditor
              initialConfig={emailConfig}
              account={account}
              googleConnected={state.googleConnected}
              googleConfigured={state.googleConfigured}
              googleEmail={undefined}
              onGoogleStatusChange={(status) => {
                state.setGoogleConnected(status.connected);
                state.setGoogleConfigured(status.configured);
              }}
            />
          </div>
        </ErrorBoundary>
      ) : state.showTasksLibrary ? (
        <ErrorBoundary title="Taken konden niet worden geladen">
          <div className={styles.settings}>
            <TasksLibrary
              items={state.tasksLibraryItems}
              active={state.tasksLibraryActive}
              loading={state.tasksLibraryLoading}
              onSelect={(id) => void state.selectTasksLibraryItem(id)}
              onDelete={(id) => void state.deleteTasksLibraryItem(id)}
              onClose={() => state.setShowTasksLibrary(false)}
            />
          </div>
        </ErrorBoundary>
      ) : state.showTickets ? (
        <ErrorBoundary title="Tickets konden niet worden geladen">
          <div className={styles.settings}>
            <TicketsPanel
              items={state.tickets}
              active={state.activeTicket}
              loading={state.ticketsLoading}
              submitting={state.ticketSubmitting}
              commentSubmitting={state.commentSubmitting}
              onSelect={(id) => void state.selectTicket(id)}
              onCreate={(title, description) => void state.createTicket(title, description)}
              onComment={(id, body) => void state.addTicketComment(id, body)}
              onClose={() => state.setShowTickets(false)}
            />
          </div>
        </ErrorBoundary>
      ) : state.showNotes ? (
        <ErrorBoundary title="Notities konden niet worden geladen">
          <div className={styles.settings}>
            <NotesPanel
              items={state.notes}
              active={state.activeNote}
              loading={state.notesLoading}
              submitting={state.noteSubmitting}
              onSelect={(id) => void state.selectNote(id)}
              onCreate={(title, body) => void state.createNote(title, body)}
              onUpdate={(id, title, body) => void state.updateNote(id, title, body)}
              onDelete={(id) => void state.deleteNote(id)}
              onClose={() => state.setShowNotes(false)}
            />
          </div>
        </ErrorBoundary>
      ) : state.showProjects ? (
        <ErrorBoundary title="Financiële gegevens konden niet worden geladen">
          <div className={styles.settings}>
            <ProjectsPanel
              overview={state.projectsOverview}
              active={state.activeProject}
              period={state.projectsPeriod}
              loading={state.projectsLoading}
              submitting={state.projectsSubmitting}
              error={state.error}
              onChangePeriod={(period) => void state.changeProjectsPeriod(period)}
              onSelect={(id) => void state.selectProject(id)}
              onCreate={(input) => void state.createProject(input)}
              onUpdate={(id, input) => void state.updateProject(id, input)}
              onDelete={(id) => void state.deleteProject(id)}
              onAddLine={(id, input) => void state.addProjectLine(id, input)}
              onUpdateLine={(id, lineId, input) => void state.updateProjectLine(id, lineId, input)}
              onDeleteLine={(id, lineId) => void state.deleteProjectLine(id, lineId)}
              onSetLinePaidMonth={(id, lineId, month, paid) =>
                void state.setProjectLinePaidMonth(id, lineId, month, paid)
              }
              onSetLinePaidOn={(id, lineId, paid) => void state.setProjectLinePaidOn(id, lineId, paid)}
              onDeleteLines={(items) => void state.deleteProjectLines(items)}
              onImported={() => void state.loadProjects()}
              onClose={() => state.setShowProjects(false)}
            />
          </div>
        </ErrorBoundary>
      ) : state.showOutreach ? (
        <ErrorBoundary title="Outreach kon niet worden geladen">
          <div className={styles.settings}>
            <OutreachPanel
              aiReady={aiReady}
              smtpReady={smtpReady}
              onClose={() => state.setShowOutreach(false)}
              onOpenThread={(id, draft) => void state.openOutreachThread(id, draft)}
            />
          </div>
        </ErrorBoundary>
      ) : (
        <ErrorBoundary title="De mailbox kon niet worden geladen">
          <>
            <div className={styles.listCol}>
              <ThreadList
                threads={state.visibleThreads}
                account={account}
                activeThreadId={state.activeThreadId}
                filter={state.filter}
                search={state.search}
                syncing={state.syncing}
                syncedAt={state.syncedAt}
                sortAvailable={imapReady && aiReady}
                sorting={state.sortingPreview}
                searchAvailable={aiReady}
                onSelect={(id) => void state.openThread(id)}
                onFilterChange={state.setFilter}
                onSearchChange={state.setSearch}
                onSync={() => void state.sync(state.folder, { refreshFolders: true })}
                onSortInbox={() => void state.previewSort()}
                onOpenMailSearch={() => void state.openSearch()}
              />
            </div>
            <div
              className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`}
              style={{ left: "calc(var(--nav-w) + var(--list-w))", transform: "translateX(-50%)" }}
              role="separator"
              aria-orientation="vertical"
              aria-label="Breedte berichtenlijst"
              aria-valuenow={listPanel.size}
              aria-valuemin={LIST_WIDTH.min}
              aria-valuemax={LIST_WIDTH.max}
              tabIndex={0}
              onPointerDown={listPanel.onPointerDown}
              onPointerMove={listPanel.onPointerMove}
              onPointerUp={listPanel.onPointerUp}
              onPointerCancel={listPanel.onPointerUp}
              onKeyDown={listPanel.onKeyDown}
            />

          <main className={styles.main}>
            {(state.error || state.notice || state.undoSeconds !== null) && (
              <div className={styles.messages}>
                {state.error && <p className={styles.error}>{state.error}</p>}
                {state.notice && <p className={styles.notice}>{state.notice}</p>}
                {state.undoSeconds !== null && (
                  <p className={styles.notice}>
                    Verzenden over {state.undoSeconds}s…{" "}
                    <button type="button" className={styles.undoBtn} onClick={state.undoSend}>
                      Ongedaan maken
                    </button>
                  </p>
                )}
              </div>
            )}

            <ThreadView
              detail={state.detail}
              account={account}
              folders={state.folders}
              loading={state.detailLoading}
              canReplyAll={canReplyAll}
              googleConnected={state.googleConnected}
              googleConfigured={state.googleConfigured}
              onBack={state.closeThread}
              onReply={() => { state.setReplyCc(""); state.openComposer(); }}
              onReplyAll={() => { state.setReplyCc(replyAllCcValue); state.openComposer(); }}
              onMarkUnread={() => {
                if (state.activeThreadId) void state.setSeen(state.activeThreadId, false);
              }}
              onToggleStar={() => {
                if (state.activeThreadId) void state.threadAction(state.activeThreadId, state.detail?.thread.flagged ? "unflag" : "flag");
              }}
              onMove={(destination) => {
                if (state.activeThreadId) void state.threadAction(state.activeThreadId, "move", destination);
              }}
              onDelete={() => {
                if (state.activeThreadId) void state.threadAction(state.activeThreadId, "delete");
              }}
              onForward={() => state.setForwardOpen(true)}
              onSnooze={(option) => void state.snoozeThread(option)}
              onFollowUp={(days) => void state.setFollowUp(days)}
              onBookExpense={(messageId) => state.setBookMessageId(messageId)}
            />

            {state.detail && (
              <>
                <div
                  className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`}
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Hoogte antwoordveld"
                  aria-valuenow={composerPanel.size}
                  aria-valuemin={COMPOSER_HEIGHT.min}
                  aria-valuemax={COMPOSER_HEIGHT.max}
                  tabIndex={0}
                  onPointerDown={composerPanel.onPointerDown}
                  onPointerMove={composerPanel.onPointerMove}
                  onPointerUp={composerPanel.onPointerUp}
                  onPointerCancel={composerPanel.onPointerUp}
                  onKeyDown={composerPanel.onKeyDown}
                />
                <Composer
                  value={state.replyText}
                  cc={state.replyCc}
                  bcc={state.replyBcc}
                  expanded={state.composerExpanded}
                  focusNonce={state.composerFocusNonce}
                  drafting={state.drafting}
                  polishing={state.polishing}
                  sending={state.sending}
                  notes={state.polishNotes}
                  aiAvailable={aiReady}
                  sendAvailable={smtpReady}
                  onExpandedChange={state.setComposerExpanded}
                  onChange={state.setReplyText}
                  onCcChange={state.setReplyCc}
                  onBccChange={state.setReplyBcc}
                  attachments={state.replyAttachments}
                  attachmentError={state.replyAttachmentError}
                  onAttachmentsChange={state.setReplyAttachments}
                  onAttachmentError={state.setReplyAttachmentError}
                  onDraftFromInstruction={(instruction) => {
                    void state.draftFromInstruction(instruction);
                  }}
                  onPolish={() => void state.polishReply()}
                  onSend={() => void state.sendReply()}
                  onScheduleSend={(sendAt) => void state.scheduleReply(sendAt)}
                />
              </>
            )}
          </main>

          {state.aiOpen && state.detail && (
            <AiDrawer
              tips={state.tips}
              loading={state.tipsLoading}
              available={aiReady}
              draftingPoint={state.draftingPoint}
              onRefresh={() => void state.loadTips()}
              onDraftFromPoint={(point) => void state.draftFromPoint(point)}
              onClose={() => state.setAiOpen(false)}
            />
          )}

          {state.tasksOpen && state.detail && (
            <TasksPanel
              doc={state.tasksDoc}
              loading={state.tasksLoading}
              available={aiReady}
              emptyNotice={state.tasksEmptyNotice}
              onExtract={() => void state.extractThreadTasks()}
              onOpenLibrary={() => void state.openTasksLibrary(state.tasksDoc?.id)}
              onDelete={
                state.tasksDoc
                  ? () => void state.deleteTasksLibraryItem(state.tasksDoc!.id)
                  : undefined
              }
              onClose={() => state.setTasksOpen(false)}
            />
          )}
          </>
        </ErrorBoundary>
      )}

      <MailAppOverlays state={state} aiReady={aiReady} smtpReady={smtpReady} />
    </div>
  );
}
