"use client";

import { useState } from "react";
import type { TicketDetail, TicketSummary } from "@/lib/tickets";
import styles from "./TicketsPanel.module.css";

type Props = {
  items: TicketSummary[];
  active: TicketDetail | null;
  loading: boolean;
  submitting: boolean;
  onSelect: (id: number) => void;
  onCreate: (title: string, description: string) => void;
  onClose: () => void;
};

const STATUS_LABELS: Record<TicketSummary["status"], string> = {
  open: "Open",
  in_progress: "Bezig",
  review: "Klaar voor review",
  done: "Klaar",
  rejected: "Afgewezen",
};

export function TicketsPanel({
  items,
  active,
  loading,
  submitting,
  onSelect,
  onCreate,
  onClose,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>Tickets</h2>
          <p className={styles.sub}>
            Meld iets dat aangepast moet worden. Claude pakt openstaande tickets &apos;s avonds op
            en zet de wijziging klaar op een aparte branch, om te reviewen voor je committed.
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Terug naar mail
        </button>
      </header>

      <div className={styles.grid}>
        <section className={styles.listPane} aria-label="Tickets">
          {creating ? (
            <form
              className={styles.newForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (!title.trim() || !description.trim()) return;
                onCreate(title.trim(), description.trim());
                setTitle("");
                setDescription("");
                setCreating(false);
              }}
            >
              <input
                value={title}
                placeholder="Titel (bijv. 'Mobiel werkt niet goed')"
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
              <textarea
                value={description}
                placeholder="Omschrijving: wat werkt niet, wat moet er gebeuren?"
                rows={5}
                onChange={(event) => setDescription(event.target.value)}
              />
              <div className={styles.newFormActions}>
                <button type="submit" disabled={submitting || !title.trim() || !description.trim()}>
                  {submitting ? "Aanmaken…" : "Ticket aanmaken"}
                </button>
                <button type="button" onClick={() => setCreating(false)}>
                  Annuleren
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={styles.addTicket} onClick={() => setCreating(true)}>
              + Nieuw ticket
            </button>
          )}

          {loading && items.length === 0 ? (
            <p className={styles.empty}>Laden…</p>
          ) : items.length === 0 ? (
            <p className={styles.empty}>Nog geen tickets.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${active?.id === item.id ? styles.itemActive : ""}`}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={`${styles.badge} ${styles[`badge_${item.status}`]}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.detailPane} aria-label="Ticket detail">
          {!active ? (
            <p className={styles.empty}>Kies een ticket om de details en runs te bekijken.</p>
          ) : (
            <>
              <div className={styles.detailHead}>
                <h3 className={styles.detailTitle}>{active.title}</h3>
                <span className={`${styles.badge} ${styles[`badge_${active.status}`]}`}>
                  {STATUS_LABELS[active.status]}
                </span>
              </div>
              <p className={styles.detailDescription}>{active.description}</p>
              {active.branch && (
                <p className={styles.detailBranch}>
                  Branch: <code>{active.branch}</code>
                </p>
              )}

              <h4 className={styles.runsTitle}>Runs ({active.runs.length})</h4>
              {active.runs.length === 0 ? (
                <p className={styles.empty}>
                  Nog geen run. Wordt door de nachtelijke cron opgepakt zolang de status &quot;Open&quot; is.
                </p>
              ) : (
                <ul className={styles.runs}>
                  {active.runs.map((run) => (
                    <li key={run.id} className={styles.run}>
                      <div className={styles.runHead}>
                        <span className={`${styles.badge} ${styles[`badge_run_${run.status}`]}`}>
                          {run.status}
                        </span>
                        <span className={styles.runMeta}>
                          {new Date(run.startedAt).toLocaleString("nl-NL")} · <code>{run.branch}</code>
                        </span>
                      </div>
                      {run.summary && <p className={styles.runSummary}>{run.summary}</p>}
                      {run.diffStat && <pre className={styles.runDiff}>{run.diffStat}</pre>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
