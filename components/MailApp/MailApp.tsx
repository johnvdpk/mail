"use client";

import type { EmailConfig } from "@/lib/email-config";
import type { FolderSummary, Thread } from "@/lib/types";
import { AiDrawer } from "@/components/AiDrawer/AiDrawer";
import { ComposeDialog } from "@/components/ComposeDialog/ComposeDialog";
import { ForwardDialog } from "@/components/ComposeDialog/ForwardDialog";
import { Composer } from "@/components/Composer/Composer";
import { FolderRail } from "@/components/FolderRail/FolderRail";
import { MailConfigEditor } from "@/components/MailConfigEditor/MailConfigEditor";
import { SortReview } from "@/components/SortReview/SortReview";
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

  return (
    <div className={styles.shell}>
      <FolderRail
        account={account}
        folders={state.folders}
        activeFolder={state.folder}
        settingsActive={state.showSettings}
        onSelectFolder={(path) => void state.selectFolder(path)}
        onCompose={() => state.setComposeOpen(true)}
        onOpenSettings={() => state.setShowSettings(true)}
        onCreateFolder={(name) => void state.folderAction("create", name)}
        onRenameFolder={(path, newName) => void state.folderAction("rename", path, newName)}
        onDeleteFolder={(path) => void state.folderAction("delete", path)}
        onLogout={() => {
          void fetch("/api/auth/logout", { method: "POST" }).finally(() => {
            window.location.reload();
          });
        }}
      />

      {state.showSettings ? (
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
      ) : (
        <>
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
            onSelect={(id) => void state.openThread(id)}
            onFilterChange={state.setFilter}
            onSearchChange={state.setSearch}
            onSync={() => void state.sync(state.folder)}
            onSortInbox={() => void state.previewSort()}
          />

          <main className={styles.main}>
            {(state.error || state.notice) && (
              <div className={styles.messages}>
                {state.error && <p className={styles.error}>{state.error}</p>}
                {state.notice && <p className={styles.notice}>{state.notice}</p>}
              </div>
            )}

            <ThreadView
              detail={state.detail}
              account={account}
              folders={state.folders}
              loading={state.detailLoading}
              aiOpen={state.aiOpen}
              googleConnected={state.googleConnected}
              googleConfigured={state.googleConfigured}
              onToggleAi={() => state.setAiOpen(!state.aiOpen)}
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
            />

            {state.detail && (
              <Composer
                value={state.replyText}
                cc={state.replyCc}
                bcc={state.replyBcc}
                quickReplies={emailConfig.replies}
                draftingIntent={state.draftingIntent}
                polishing={state.polishing}
                sending={state.sending}
                notes={state.polishNotes}
                aiAvailable={aiReady}
                sendAvailable={smtpReady}
                onChange={state.setReplyText}
                onCcChange={state.setReplyCc}
                onBccChange={state.setReplyBcc}
                onQuickReply={(intent) => void state.quickReply(intent)}
                onPolish={() => void state.polishReply()}
                onSend={() => void state.sendReply()}
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
        </>
      )}

      {state.sortSuggestions && (
        <SortReview
          suggestions={state.sortSuggestions}
          busy={state.sortingApply}
          onCancel={() => state.setSortSuggestions(null)}
          onConfirm={(items) => void state.applySort(items)}
        />
      )}

      {state.forwardOpen && state.detail && (
        <ForwardDialog
          subject={state.detail.thread.subject}
          sending={state.sending}
          sendAvailable={smtpReady}
          onClose={() => state.setForwardOpen(false)}
          onSend={(to, text, cc, bcc) => void state.forwardMail(to, text, cc, bcc)}
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
    </div>
  );
}
