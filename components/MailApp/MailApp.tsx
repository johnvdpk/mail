"use client";

import { useMemo } from "react";
import type { EmailConfig } from "@/lib/email-config-shared";
import { repliesForContact } from "@/lib/email-config-shared";
import type { FolderSummary, Thread } from "@/lib/types";
import { ErrorBoundary } from "@/components/ErrorBoundary/ErrorBoundary";
import { AiDrawer } from "@/components/AiDrawer/AiDrawer";
import { ComposeDialog } from "@/components/ComposeDialog/ComposeDialog";
import { ForwardDialog } from "@/components/ComposeDialog/ForwardDialog";
import { Composer } from "@/components/Composer/Composer";
import { FolderRail } from "@/components/FolderRail/FolderRail";
import { MailConfigEditor } from "@/components/MailConfigEditor/MailConfigEditor";
import { ReplyPreviewDialog } from "@/components/ReplyPreviewDialog/ReplyPreviewDialog";
import { SortReview } from "@/components/SortReview/SortReview";
import { MailSearch } from "@/components/MailSearch/MailSearch";
import { TasksLibrary } from "@/components/TasksLibrary/TasksLibrary";
import { TasksPanel } from "@/components/TasksPanel/TasksPanel";
import { TicketsPanel } from "@/components/TicketsPanel/TicketsPanel";
import { ThreadList } from "@/components/ThreadList/ThreadList";
import { ThreadView } from "@/components/ThreadView/ThreadView";
import { useMailAppState } from "./useMailAppState";
import styles from "./MailApp.module.css";

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

  const counterpartEmail = useMemo(() => {
    if (!state.detail) return null;
    const inbound = [...state.detail.messages].reverse().find((m) => !m.outbound);
    if (inbound?.from?.email) return inbound.from.email;
    const other = state.detail.thread.participants.find(
      (p) => p.email.toLowerCase() !== account.toLowerCase()
    );
    return other?.email ?? null;
  }, [state.detail, account]);

  const quickReplies = useMemo(
    () => repliesForContact(emailConfig, counterpartEmail),
    [emailConfig, counterpartEmail]
  );

  const mobileView =
    state.showSettings || state.showTasksLibrary
      ? "settings"
      : state.activeThreadId
        ? "thread"
        : "list";

  return (
    <div className={styles.shell} data-mobile-view={mobileView}>
      <div className={styles.navCol}>
        <FolderRail
          account={account}
          folders={state.folders}
          activeFolder={state.folder}
          settingsActive={state.showSettings}
          tasksActive={state.showTasksLibrary}
          ticketsActive={state.showTickets}
          onSelectFolder={(path) => void state.selectFolder(path)}
          onCompose={() => state.setComposeOpen(true)}
          onOpenSettings={() => {
            state.setShowTasksLibrary(false);
            state.setShowTickets(false);
            state.setShowSettings(true);
          }}
          onOpenTasks={() => void state.openTasksLibrary()}
          onOpenTickets={() => void state.openTickets()}
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
              onSelect={(id) => void state.selectTicket(id)}
              onCreate={(title, description) => void state.createTicket(title, description)}
              onClose={() => state.setShowTickets(false)}
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
                onSync={() => void state.sync(state.folder)}
                onSortInbox={() => void state.previewSort()}
                onOpenMailSearch={() => void state.openSearch()}
              />
            </div>

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
              aiOpen={state.aiOpen}
              tasksOpen={state.tasksOpen}
              googleConnected={state.googleConnected}
              googleConfigured={state.googleConfigured}
              onBack={state.closeThread}
              onToggleAi={() => {
                const next = !state.aiOpen;
                state.setAiOpen(next);
                if (next) state.setTasksOpen(false);
              }}
              onToggleTasks={() => {
                if (state.tasksOpen) {
                  state.setTasksOpen(false);
                } else {
                  state.openTasksPanel();
                }
              }}
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
            />

            {state.detail && (
              <Composer
                value={state.replyText}
                cc={state.replyCc}
                bcc={state.replyBcc}
                quickReplies={quickReplies}
                draftingIntent={state.draftingIntent}
                suggestedIntentId={state.suggestedIntentId}
                suggestedConfidence={state.suggestedConfidence}
                suggestedReason={state.suggestedReason}
                polishing={state.polishing}
                sending={state.sending}
                notes={state.polishNotes}
                aiAvailable={aiReady}
                sendAvailable={smtpReady}
                onChange={state.setReplyText}
                onCcChange={state.setReplyCc}
                onBccChange={state.setReplyBcc}
                attachments={state.replyAttachments}
                attachmentError={state.replyAttachmentError}
                onAttachmentsChange={state.setReplyAttachments}
                onAttachmentError={state.setReplyAttachmentError}
                onQuickReply={(intent) => {
                  const label = quickReplies.find((r) => r.id === intent)?.label;
                  void state.quickReply(intent, label);
                }}
                onPolish={() => void state.polishReply()}
                onSend={() => void state.sendReply()}
                onScheduleSend={(sendAt) => void state.scheduleReply(sendAt)}
              />
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
              onClose={() => state.setTasksOpen(false)}
            />
          )}
          </>
        </ErrorBoundary>
      )}

      <ErrorBoundary title="Dialoog kon niet worden geladen">
        {state.previewOpen && (
        <ReplyPreviewDialog
          label={state.previewLabel}
          value={state.previewText}
          streaming={state.previewStreaming}
          sending={state.sending}
          sendAvailable={smtpReady}
          onChange={state.setPreviewText}
          onConfirmSend={() => void state.confirmPreviewSend()}
          onKeepEditing={state.keepEditingPreview}
          onClose={() => state.setPreviewOpen(false)}
        />
      )}

      {state.sortSuggestions && (
        <SortReview
          suggestions={state.sortSuggestions}
          busy={state.sortingApply}
          onCancel={() => state.setSortSuggestions(null)}
          onConfirm={(items) => void state.applySort(items)}
        />
      )}

      {state.searchOpen && (
        <MailSearch
          busy={state.searchBusy}
          jobs={state.searchJobs}
          activeJob={state.activeSearchJob}
          embeddingProgress={state.embeddingProgress}
          contacts={state.contacts}
          contactsLoading={state.contactsLoading}
          contactStatusFilter={state.contactStatusFilter}
          onClose={() => state.setSearchOpen(false)}
          onSubmit={(prompt) => void state.submitSearch(prompt)}
          onSelectJob={(id) => void state.selectSearchJob(id)}
          onDeleteJob={(id) => void state.deleteSearchJob(id)}
          onOpenResult={(messageId) => void state.openSearchResult(messageId)}
          onLoadContacts={() => void state.loadContacts()}
          onContactStatusFilterChange={(status) => void state.changeContactStatusFilter(status)}
          onUpdateContactStatus={(id, status) => void state.updateContactStatus(id, status)}
        />
      )}

      {state.forwardOpen && state.detail && (
        <ForwardDialog
          subject={state.detail.thread.subject}
          sending={state.sending}
          sendAvailable={smtpReady}
          onClose={() => state.setForwardOpen(false)}
          onSend={(to, text, attachments, cc, bcc) =>
            void state.forwardMail(to, text, attachments, cc, bcc)
          }
        />
      )}

      {state.composeOpen && (
        <ComposeDialog
          aiAvailable={aiReady}
          sendAvailable={smtpReady}
          onClose={() => state.setComposeOpen(false)}
          onSent={(message) => {
            state.setComposeOpen(false);
            state.setNotice(message);
            void state.sync(state.folder);
          }}
        />
      )}
      </ErrorBoundary>
    </div>
  );
}
