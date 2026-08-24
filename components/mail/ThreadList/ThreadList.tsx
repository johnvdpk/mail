"use client";

import type { Thread } from "@/lib/shared/types";
import { formatDateRelative } from "@/lib/mail/thread-utils";
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
  /** Show Leadradar (lead search) button when OpenRouter is ready. */
  searchAvailable?: boolean;
  /** Collapse to an icon-only rail, e.g. while an email is open, to give the reading pane more room. */
  collapsed?: boolean;
  onSelect: (threadId: string) => void;
  onFilterChange: (filter: ThreadFilter) => void;
  onSearchChange: (value: string) => void;
  onSync: () => void;
  onSortInbox?: () => void;
  onOpenMailSearch?: () => void;
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
  searchAvailable,
  collapsed,
  onSelect,
  onFilterChange,
  onSearchChange,
  onSync,
  onSortInbox,
  onOpenMailSearch,
}: Props) {
  if (collapsed) {
    return (
      <section className={styles.pane} data-collapsed="true" aria-label="Berichten (ingeklapt)">
        <ul className={styles.collapsedList}>
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={[
                  styles.collapsedItem,
                  thread.id === activeThreadId ? styles.itemActive : "",
                  thread.unread ? styles.itemUnread : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={`${describeParticipants(thread, account)} — ${thread.subject}`}
                onClick={() => onSelect(thread.id)}
              >
                {initials(describeParticipants(thread, account))}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

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

        {(sortAvailable && onSortInbox) || (searchAvailable && onOpenMailSearch) ? (
          <div className={styles.actionRow}>
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
            {searchAvailable && onOpenMailSearch && (
              <button
                type="button"
                className={styles.sortBtn}
                onClick={onOpenMailSearch}
                disabled={syncing}
              >
                Leadradar
              </button>
            )}
          </div>
        ) : null}

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
                  <span className={styles.date}>{formatDateRelative(thread.lastDate)}</span>
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

/** First letter of each of the first two words, for the collapsed icon rail. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
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

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}
