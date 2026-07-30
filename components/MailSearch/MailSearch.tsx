"use client";

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react";
import type {
  ContactStatus,
  ContactView,
  SearchJobStatus,
  SearchJobSummary,
  SearchJobView,
  SearchResultView,
} from "@/lib/search-types";
import type { EmbeddingBackfillStatus } from "@/lib/embeddings";
import styles from "./MailSearch.module.css";

type Tab = "jobs" | "contacts";

const CONTACT_STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: "nieuw", label: "Nieuw" },
  { value: "benaderd", label: "Benaderd" },
  { value: "geen_interesse", label: "Geen interesse" },
  { value: "klant", label: "Klant" },
];

type Props = {
  busy: boolean;
  jobs: SearchJobSummary[];
  activeJob: SearchJobView | null;
  embeddingProgress: EmbeddingBackfillStatus | null;
  contacts: ContactView[];
  contactsLoading: boolean;
  contactStatusFilter: ContactStatus | "all";
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  onSelectJob: (id: number) => void;
  onDeleteJob: (id: number) => void;
  onOpenResult: (messageId: string) => void;
  onLoadContacts: () => void;
  onContactStatusFilterChange: (status: ContactStatus | "all") => void;
  onUpdateContactStatus: (id: number, status: ContactStatus) => void;
};

function statusLabel(status: SearchJobStatus): string {
  switch (status) {
    case "pending":
    case "keyword_running":
      return "Zoeken…";
    case "keyword_done":
    case "semantic_running":
      return "Verrijken…";
    case "done":
      return "Klaar";
    case "failed":
      return "Mislukt";
    default:
      return status;
  }
}

function statusClass(status: SearchJobStatus): string {
  if (status === "done") return styles.statusDone;
  if (status === "failed") return styles.statusFailed;
  if (status === "keyword_done" || status === "semantic_running") {
    return styles.statusEnrich;
  }
  return styles.statusBusy;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ResultCard({
  result,
  onOpen,
}: {
  result: SearchResultView;
  onOpen: (messageId: string) => void;
}) {
  const contact =
    result.contactName ||
    result.contactEmail ||
    result.fromName ||
    result.fromEmail ||
    "Onbekend contact";

  return (
    <li>
      <button
        type="button"
        className={styles.result}
        onClick={() => onOpen(result.messageId)}
      >
        <div className={styles.resultHead}>
          <p className={styles.contact}>{contact}</p>
          <span className={styles.matchBadge}>
            {result.matchType === "semantic" ? "Semantisch" : "Keyword"}
          </span>
        </div>
        {result.contactEmail && result.contactName && (
          <p className={styles.meta}>{result.contactEmail}</p>
        )}
        {result.contactCompany && (
          <p className={styles.meta}>{result.contactCompany}</p>
        )}
        <p className={styles.subject}>{result.subject || "(geen onderwerp)"}</p>
        {result.reasoning && <p className={styles.reason}>{result.reasoning}</p>}
        <div className={styles.resultFooter}>
          {typeof result.relevance === "number" && (
            <p className={styles.relevance}>{Math.round(result.relevance * 100)}% relevant</p>
          )}
          {result.mailCount > 1 && (
            <p className={styles.mailCount}>{result.mailCount} mails gevonden</p>
          )}
        </div>
        <span className={styles.openHint}>Open mail →</span>
      </button>
    </li>
  );
}

export function MailSearch({
  busy,
  jobs,
  activeJob,
  embeddingProgress,
  contacts,
  contactsLoading,
  contactStatusFilter,
  onClose,
  onSubmit,
  onSelectJob,
  onDeleteJob,
  onOpenResult,
  onLoadContacts,
  onContactStatusFilterChange,
  onUpdateContactStatus,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [tab, setTab] = useState<Tab>("jobs");

  useEffect(() => {
    if (activeJob?.prompt) setPrompt(activeJob.prompt);
  }, [activeJob?.id, activeJob?.prompt]);

  function handleTabChange(next: Tab) {
    setTab(next);
    if (next === "contacts") onLoadContacts();
  }

  const results = activeJob?.results ?? [];
  const keywordResults = useMemo(
    () => results.filter((r) => r.matchType === "keyword"),
    [results]
  );
  const semanticResults = useMemo(
    () => results.filter((r) => r.matchType === "semantic"),
    [results]
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    if (!value || busy) return;
    onSubmit(value);
  }

  function handleDelete(event: MouseEvent, id: number) {
    event.stopPropagation();
    if (busy) return;
    if (!window.confirm("Deze zoekopdracht verwijderen?")) return;
    onDeleteJob(id);
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="search-title">
      <div className={styles.dialog}>
        <div className={styles.head}>
          <h2 id="search-title" className={styles.title}>
            Leadradar
          </h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={busy}>
            Sluiten
          </button>
        </div>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "jobs"}
            className={`${styles.tab} ${tab === "jobs" ? styles.tabActive : ""}`}
            onClick={() => handleTabChange("jobs")}
          >
            Zoekopdrachten
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "contacts"}
            className={`${styles.tab} ${tab === "contacts" ? styles.tabActive : ""}`}
            onClick={() => handleTabChange("contacts")}
          >
            Alle contacten
          </button>
        </div>

        {tab === "contacts" ? (
          <div className={styles.contactsView}>
            <div className={styles.contactsToolbar}>
              <label className={styles.label} htmlFor="contact-status-filter">
                Status
              </label>
              <select
                id="contact-status-filter"
                className={styles.statusSelect}
                value={contactStatusFilter}
                onChange={(e) => onContactStatusFilterChange(e.target.value as ContactStatus | "all")}
              >
                <option value="all">Alle</option>
                {CONTACT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {contactsLoading ? (
              <p className={styles.empty}>Laden…</p>
            ) : contacts.length === 0 ? (
              <p className={styles.empty}>Nog geen contacten gevonden.</p>
            ) : (
              <ul className={styles.contactList}>
                {contacts.map((c) => (
                  <li key={c.id} className={styles.contactRow}>
                    <div className={styles.contactInfo}>
                      <p className={styles.contact}>{c.name || c.email}</p>
                      {c.name && <p className={styles.meta}>{c.email}</p>}
                      {c.company && <p className={styles.meta}>{c.company}</p>}
                      <p className={styles.meta}>
                        {c.resultCount} mail{c.resultCount === 1 ? "" : "s"} gevonden
                      </p>
                    </div>
                    <select
                      className={styles.statusSelect}
                      value={c.status}
                      onChange={(e) => onUpdateContactStatus(c.id, e.target.value as ContactStatus)}
                      aria-label={`Status van ${c.name || c.email}`}
                    >
                      {CONTACT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <p className={styles.sideTitle}>Eerdere zoekopdrachten</p>
            {jobs.length === 0 ? (
              <p className={styles.empty}>Nog geen zoekopdrachten.</p>
            ) : (
              <ul className={styles.jobList}>
                {jobs.map((job) => (
                  <li key={job.id} className={styles.jobItem}>
                    <button
                      type="button"
                      className={`${styles.jobBtn} ${
                        activeJob?.id === job.id ? styles.jobActive : ""
                      }`}
                      onClick={() => onSelectJob(job.id)}
                      disabled={busy}
                    >
                      <span className={styles.jobPrompt}>{job.prompt}</span>
                      <span className={styles.jobMeta}>
                        {formatDate(job.createdAt)} · {job.resultCount} resultaat
                        {job.resultCount === 1 ? "" : "en"}
                      </span>
                      <span className={`${styles.status} ${statusClass(job.status)}`}>
                        {statusLabel(job.status)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(e, job.id)}
                      disabled={busy}
                      aria-label="Zoekopdracht verwijderen"
                      title="Verwijderen"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div className={styles.main}>
            {embeddingProgress && embeddingProgress.pending > 0 && (
              <p className={styles.backfillProgress}>
                {embeddingProgress.embedded.toLocaleString("nl-NL")} van{" "}
                {embeddingProgress.total.toLocaleString("nl-NL")} mails doorzocht
              </p>
            )}

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.label} htmlFor="search-prompt">
                Zoekprompt
              </label>
              <textarea
                id="search-prompt"
                className={styles.textarea}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='Bijv. "vind potentiële klanten voor: bouw website"'
                rows={3}
                disabled={busy}
              />
              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={busy || !prompt.trim()}
                >
                  {busy ? "Bezig…" : "Zoeken"}
                </button>
              </div>
            </form>

            {activeJob && (
              <div className={styles.activeMeta}>
                <span className={`${styles.status} ${statusClass(activeJob.status)}`}>
                  {statusLabel(activeJob.status)}
                </span>
                {activeJob.keywords.length > 0 && (
                  <p className={styles.keywords}>
                    Zoektermen: {activeJob.keywords.join(", ")}
                  </p>
                )}
                {activeJob.error && <p className={styles.error}>{activeJob.error}</p>}
              </div>
            )}

            {!activeJob ? (
              <p className={styles.empty}>
                Typ een prompt of open een eerdere zoekopdracht.
              </p>
            ) : results.length === 0 ? (
              <p className={styles.empty}>
                {busy || activeJob.status === "keyword_running"
                  ? "Bezig met zoeken…"
                  : "Geen matches gevonden."}
              </p>
            ) : (
              <div className={styles.results}>
                {keywordResults.length > 0 && (
                  <section>
                    <h3 className={styles.sectionTitle}>
                      Keyword ({keywordResults.length})
                    </h3>
                    <ul className={styles.resultList}>
                      {keywordResults.map((r) => (
                        <ResultCard key={r.id} result={r} onOpen={onOpenResult} />
                      ))}
                    </ul>
                  </section>
                )}
                {semanticResults.length > 0 && (
                  <section>
                    <h3 className={styles.sectionTitle}>
                      Semantisch ({semanticResults.length})
                    </h3>
                    <ul className={styles.resultList}>
                      {semanticResults.map((r) => (
                        <ResultCard key={r.id} result={r} onOpen={onOpenResult} />
                      ))}
                    </ul>
                  </section>
                )}
                {(activeJob.status === "keyword_done" ||
                  activeJob.status === "semantic_running") && (
                  <p className={styles.enrichHint}>
                    Semantische aanvullingen worden op de achtergrond toegevoegd…
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
