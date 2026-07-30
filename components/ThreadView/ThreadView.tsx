"use client";

import { useState } from "react";
import type { FolderSummary, ThreadDetail } from "@/lib/types";
import { MessageCard } from "./MessageCard";
import styles from "./ThreadView.module.css";

type Props = {
  detail: ThreadDetail | null;
  account: string;
  folders: FolderSummary[];
  loading: boolean;
  aiOpen: boolean;
  tasksOpen: boolean;
  googleConnected: boolean;
  googleConfigured: boolean;
  /** Mobile: return to the thread list */
  onBack?: () => void;
  onToggleAi: () => void;
  onToggleTasks: () => void;
  onMarkUnread: () => void;
  onToggleStar: () => void;
  onMove: (destination: string) => void;
  onDelete: () => void;
  onForward: () => void;
  onSnooze: (option: "1h" | "tomorrow" | "friday" | "nextweek") => void;
  onFollowUp: (days: number) => void;
};

export function ThreadView({
  detail,
  account,
  folders,
  loading,
  aiOpen,
  tasksOpen,
  googleConnected,
  googleConfigured,
  onBack,
  onToggleAi,
  onToggleTasks,
  onMarkUnread,
  onToggleStar,
  onMove,
  onDelete,
  onForward,
  onSnooze,
  onFollowUp,
}: Props) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);

  if (loading) {
    return <p className={styles.placeholder}>Conversatie wordt geladen…</p>;
  }
  if (!detail) {
    return <p className={styles.placeholder}>Kies een bericht uit de lijst.</p>;
  }

  return (
    <div className={styles.wrap} key={detail.thread.id}>
      <header className={styles.head}>
        <div className={styles.headText}>
          {onBack && (
            <button type="button" className={styles.backBtn} onClick={onBack}>
              ← Terug
            </button>
          )}
          <h2 className={styles.subject}>{detail.thread.subject}</h2>
          <p className={styles.participants}>
            {detail.thread.participants
              .filter((p) => p.email.toLowerCase() !== account.toLowerCase())
              .map((p) => p.name || p.email)
              .join(", ")}
          </p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={detail.thread.flagged ? styles.starred : ""}
            onClick={onToggleStar}
            title={detail.thread.flagged ? "Ster verwijderen" : "Ster toevoegen"}
          >
            {detail.thread.flagged ? "★" : "☆"}
          </button>
          <button type="button" onClick={onMarkUnread}>
            Ongelezen
          </button>
          <div className={styles.moveWrap}>
            <button type="button" onClick={() => { setMoveOpen(!moveOpen); setSnoozeOpen(false); setFollowOpen(false); }}>
              Verplaatsen
            </button>
            {moveOpen && (
              <ul className={styles.moveMenu}>
                {folders
                  .filter((f) => !detail.thread.folders.includes(f.path))
                  .map((f) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => {
                          setMoveOpen(false);
                          onMove(f.path);
                        }}
                      >
                        {f.role
                          ? { inbox: "Inbox", sent: "Verzonden", drafts: "Concepten", trash: "Prullenbak", junk: "Spam", archive: "Archief" }[f.role] ?? f.name
                          : f.name}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={onForward}>
            Doorsturen
          </button>
          <div className={styles.moveWrap}>
            <button type="button" onClick={() => { setSnoozeOpen(!snoozeOpen); setFollowOpen(false); setMoveOpen(false); }}>
              Snooze
            </button>
            {snoozeOpen && (
              <ul className={styles.moveMenu}>
                {(
                  [
                    ["1h", "Over 1 uur"],
                    ["tomorrow", "Morgen 9:00"],
                    ["friday", "Vrijdag 9:00"],
                    ["nextweek", "Volgende week"],
                  ] as const
                ).map(([option, label]) => (
                  <li key={option}>
                    <button
                      type="button"
                      onClick={() => {
                        setSnoozeOpen(false);
                        onSnooze(option);
                      }}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={styles.moveWrap}>
            <button type="button" onClick={() => { setFollowOpen(!followOpen); setSnoozeOpen(false); setMoveOpen(false); }}>
              Follow-up
            </button>
            {followOpen && (
              <ul className={styles.moveMenu}>
                {[
                  [2, "Over 2 dagen"],
                  [3, "Over 3 dagen"],
                  [7, "Over 1 week"],
                ].map(([days, label]) => (
                  <li key={String(days)}>
                    <button
                      type="button"
                      onClick={() => {
                        setFollowOpen(false);
                        onFollowUp(Number(days));
                      }}
                    >
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={onDelete} className={styles.deleteBtn}>
            Verwijder
          </button>
          <button type="button" onClick={onToggleTasks} aria-pressed={tasksOpen}>
            {tasksOpen ? "Taken verbergen" : "Taken"}
          </button>
          <button type="button" onClick={onToggleAi} aria-pressed={aiOpen}>
            {aiOpen ? "AI verbergen" : "AI-hulp"}
          </button>
        </div>
      </header>

      <div className={styles.messages}>
        {detail.messages.map((message, index) => (
          <MessageCard
            key={message.id}
            message={message}
            defaultOpen={index === detail.messages.length - 1}
            isLast={index === detail.messages.length - 1}
            googleConnected={googleConnected}
            googleConfigured={googleConfigured}
          />
        ))}
      </div>
    </div>
  );
}
