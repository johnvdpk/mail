"use client";

import { useMemo, useState } from "react";
import type { SortSuggestion } from "@/lib/sort-types";
import styles from "./SortReview.module.css";

export type SortConfirmItem = {
  messageIds: string[];
  folder: string;
  createFolder: boolean;
};

type Row = SortSuggestion & {
  selected: boolean;
  folderEdit: string;
};

type Props = {
  suggestions: SortSuggestion[];
  busy: boolean;
  onConfirm: (selected: SortConfirmItem[]) => void;
  onCancel: () => void;
};

export function SortReview({ suggestions, busy, onConfirm, onCancel }: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    suggestions.map((s) => ({
      ...s,
      selected: true,
      folderEdit: s.proposedFolder,
    }))
  );

  const selectedCount = useMemo(
    () => rows.filter((r) => r.selected && r.folderEdit.trim()).length,
    [rows]
  );

  function toggle(index: number) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, selected: !row.selected } : row))
    );
  }

  function setFolder(index: number, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, folderEdit: value } : row))
    );
  }

  function confirm() {
    const items: SortConfirmItem[] = rows
      .filter((r) => r.selected && r.folderEdit.trim())
      .map((r) => {
        const folder = r.folderEdit.trim();
        const unchanged =
          folder.toLowerCase() === r.proposedFolder.toLowerCase();
        return {
          messageIds: r.messageIds,
          folder,
          createFolder: unchanged ? r.createFolder : true,
        };
      });
    onConfirm(items);
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="sort-title">
      <div className={styles.dialog}>
        <div className={styles.head}>
          <h2 id="sort-title" className={styles.title}>
            Inbox sorteren
          </h2>
          <button type="button" className={styles.close} onClick={onCancel} disabled={busy}>
            Annuleren
          </button>
        </div>

        {rows.length === 0 ? (
          <p className={styles.empty}>Geen voorstellen — inbox ziet er al opgeruimd uit.</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((row, index) => (
              <li key={row.threadId} className={styles.item}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={() => toggle(index)}
                    disabled={busy}
                  />
                </label>
                <div className={styles.body}>
                  <p className={styles.subject}>{row.subject}</p>
                  <p className={styles.from}>
                    {row.fromName || row.fromEmail || "onbekend"}
                    {row.fromName && row.fromEmail ? ` · ${row.fromEmail}` : ""}
                  </p>
                  <p className={styles.reason}>{row.reason}</p>
                  <div className={styles.folderRow}>
                    <input
                      type="text"
                      value={row.folderEdit}
                      onChange={(e) => setFolder(index, e.target.value)}
                      disabled={busy || !row.selected}
                      aria-label="Mapnaam"
                    />
                    {row.createFolder && (
                      <span className={styles.badge}>Nieuwe map</span>
                    )}
                    <span className={styles.confidence}>
                      {Math.round(row.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          <button type="button" onClick={onCancel} disabled={busy}>
            Annuleren
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={confirm}
            disabled={busy || selectedCount === 0}
          >
            {busy
              ? "Bezig…"
              : `Verplaats geselecteerde (${selectedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}
