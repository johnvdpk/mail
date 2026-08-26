"use client";

import { ComposeDialog } from "@/components/mail/ComposeDialog/ComposeDialog";
import { ForwardDialog } from "@/components/mail/ComposeDialog/ForwardDialog";
import { MailSearch } from "@/components/mail/MailSearch/MailSearch";
import { BookLineDialog } from "@/components/projects/BookLineDialog/BookLineDialog";
import { SortReview } from "@/components/shared/SortReview/SortReview";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary/ErrorBoundary";
import type { LineInput } from "@/lib/projects/types";
import type { useMailAppState } from "./useMailAppState";

type State = ReturnType<typeof useMailAppState>;

type Props = {
  state: State;
  aiReady: boolean;
  smtpReady: boolean;
};

export function MailAppOverlays({ state, aiReady, smtpReady }: Props) {
  return (
    <ErrorBoundary title="Dialoog kon niet worden geladen">
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
          onSend={(to, text, attachments, cc, bcc) => void state.forwardMail(to, text, attachments, cc, bcc)}
        />
      )}

      {state.composeOpen && (
        <ComposeDialog
          key={state.composePrefill ? `prefill-${state.composePrefill.subject}` : "new"}
          aiAvailable={aiReady}
          sendAvailable={smtpReady}
          initialTo={state.composePrefill?.to}
          initialSubject={state.composePrefill?.subject}
          initialBody={state.composePrefill?.body}
          onClose={state.closeCompose}
          onSent={(message) => {
            state.closeCompose();
            state.setNotice(message);
            void state.sync(state.folder);
          }}
        />
      )}
      {state.bookMessageId && (
        <BookLineDialog
          messageId={state.bookMessageId}
          onClose={() => state.setBookMessageId(null)}
          onSave={(id: number, input: LineInput) => void state.bookExpenseLine(id, input)}
        />
      )}
    </ErrorBoundary>
  );
}
