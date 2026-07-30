"use client";

import type { Thread } from "@/lib/types";
import styles from "./ThreadList.module.css";

export type ThreadFilter = "all" | "unread" | "flagged";

type Props = {
  threads: Thread[];
  account: string;
  activeThreadId: string | null;
  filter: ThreadFilter;
  search: string;
  syncing: boolean;
  syncedAt?: string;
  /** Show AI sort button (inbox + AI ready). Always analyses inbox. */
  sortAvailable?: boolean;
  sorting?: boolean;
  onSelect: (threadId: string) => void;
  onFilterChange: (filter: ThreadFilter) => void;
  onSearchChange: (value: string) => void;
  onSync: () => void;
  onSortInbox?: () => void;
};

const FILTERS: Array<{ id: ThreadFilter; label: string }> = [
  { id: "all", label: "Alles" },
  { id: "unread", label: "Ongelezen" },
  { id: "flagged", label: "Belangrijk" },
];

export function ThreadList({
  threads,
  account,
  activeThreadId,
  filter,
  search,
  syncing,
  syncedAt,
  sortAvailable,
  sorting,
  onSelect,
  onFilterChange,
  onSearchChange,
  onSync,
  onSortInbox,
}: Props) {
  return (
    <section className={styles.pane} aria-label="Berichten">
      <div className={styles.head}>
        <div className={styles.searchRow}>
          <input
            type="search"
            value={search}
            placeholder="Zoeken in afzender, onderwerp of tekst"
            onChange={(event) => onSearchChange(event.target.value)}
          />
          <button type="button" onClick={onSync} disabled={syncing}>
            {syncing ? "Sync" : "Verversen"}
          </button>
        </div>

        {sortAvailable && onSortInbox && (
          <button
            type="button"
            className={styles.sortBtn}
            onClick={onSortInbox}
            disabled={sorting || syncing}
          >
            {sorting ? "Bezig met sorteren…" : "Sorteer inbox"}
          </button>
        )}

        <div className={styles.filters} role="tablist" aria-label="Filter">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={`${styles.filter} ${filter === item.id ? styles.filterActive : ""}`}
              onClick={() => onFilterChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {threads.length === 0 ? (
        <p className={styles.empty}>
          {syncing ? "Mail wordt opgehaald…" : "Geen berichten in deze weergave."}
        </p>
      ) : (
        <ul className={styles.list}>
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={[
                  styles.item,
                  thread.id === activeThreadId ? styles.itemActive : "",
                  thread.unread ? styles.itemUnread : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelect(thread.id)}
              >
                <span className={styles.topRow}>
                  <span className={styles.from}>
                    {describeParticipants(thread, account)}
                  </span>
                  <span className={styles.date}>{formatDate(thread.lastDate)}</span>
                </span>
                <span className={styles.subject}>
                  {thread.subject}
                  {thread.messageCount > 1 && (
                    <span className={styles.count}>{thread.messageCount}</span>
                  )}
                </span>
                <span className={styles.snippet}>{thread.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {syncedAt && (
        <p className={styles.footer}>Laatst gesynchroniseerd {formatTime(syncedAt)}</p>
      )}
    </section>
  );
}

/** Show who the conversation is with, leaving out the account itself. */
function describeParticipants(thread: Thread, account: string): string {
  const others = thread.participants.filter(
    (p) => p.email.toLowerCase() !== account.toLowerCase()
  );
  const names = (others.length > 0 ? others : thread.participants).map(
    (p) => p.name || p.email
  );

  if (names.length === 0) return "(onbekend)";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} en ${names.length - 1} anderen`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}
