"use client";

import type { ExtractedTasksDoc, ExtractedTasksSummary } from "@/lib/ai/extracted-tasks-types";
import styles from "./TasksLibrary.module.css";

type Props = {
  items: ExtractedTasksSummary[];
  active: ExtractedTasksDoc | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

function downloadMarkdown(doc: ExtractedTasksDoc) {
  const blob = new Blob([doc.markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${doc.subject.replace(/[^\w\- ]+/g, "").trim() || "taken"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TasksLibrary({ items, active, loading, onSelect, onDelete, onClose }: Props) {
  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>Taken</h2>
          <p className={styles.sub}>
            Takenlijsten uit mail, als .md klaar voor coderen.
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Terug naar mail
        </button>
      </header>

      <div className={styles.grid}>
        <section className={styles.listPane} aria-label="Opgeslagen takenlijsten">
          {loading && items.length === 0 ? (
            <p className={styles.empty}>Laden…</p>
          ) : items.length === 0 ? (
            <p className={styles.empty}>
              Nog geen takenlijsten. Open een mail en klik op &quot;Taken&quot;.
            </p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id} className={styles.listRow}>
                  <button
                    type="button"
                    className={`${styles.item} ${active?.id === item.id ? styles.itemActive : ""}`}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className={styles.itemSubject}>{item.subject}</span>
                    <span className={styles.itemMeta}>
                      {item.taskCount} taken · {item.counterpart} ·{" "}
                      {new Date(item.createdAt).toLocaleString("nl-NL")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    title="Takenlijst verwijderen"
                    aria-label={`Takenlijst "${item.subject}" verwijderen`}
                    onClick={() => {
                      if (window.confirm(`Takenlijst "${item.subject}" verwijderen?`)) {
                        onDelete(item.id);
                      }
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.previewPane} aria-label="Markdown preview">
          {!active ? (
            <p className={styles.empty}>Kies een takenlijst om de markdown te bekijken.</p>
          ) : (
            <>
              <div className={styles.previewActions}>
                <button type="button" onClick={() => downloadMarkdown(active)}>
                  Download .md
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(active.markdown).catch(() => undefined);
                  }}
                >
                  Kopieer
                </button>
                <button
                  type="button"
                  className={styles.previewDeleteBtn}
                  onClick={() => {
                    if (window.confirm("Deze takenlijst verwijderen?")) onDelete(active.id);
                  }}
                >
                  Verwijder
                </button>
              </div>
              <pre className={styles.markdown}>{active.markdown}</pre>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
