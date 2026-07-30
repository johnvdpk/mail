"use client";

import type { ExtractedTasksDoc } from "@/lib/extracted-tasks-types";
import styles from "./TasksPanel.module.css";

type Props = {
  doc: ExtractedTasksDoc | null;
  loading: boolean;
  available: boolean;
  emptyNotice: string | null;
  onExtract: () => void;
  onOpenLibrary: () => void;
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

async function copyMarkdown(doc: ExtractedTasksDoc) {
  await navigator.clipboard.writeText(doc.markdown);
}

export function TasksPanel({
  doc,
  loading,
  available,
  emptyNotice,
  onExtract,
  onOpenLibrary,
  onClose,
}: Props) {
  return (
    <aside className={styles.drawer} aria-label="Taken uit mail">
      <header className={styles.head}>
        <h3 className={styles.title}>Taken</h3>
        <button type="button" className={styles.close} onClick={onClose}>
          Sluiten
        </button>
      </header>

      <button type="button" disabled={!available || loading} onClick={onExtract}>
        {loading ? "Haalt taken op…" : doc ? "Opnieuw extraheren" : "Taken extraheren"}
      </button>

      {!available && (
        <p className={styles.note}>Zet OPENROUTER_AI in .env.local om AI te gebruiken.</p>
      )}

      {emptyNotice && <p className={styles.note}>{emptyNotice}</p>}

      {doc && (
        <>
          {doc.summary && (
            <section className={styles.block}>
              <h4 className={styles.blockTitle}>Context</h4>
              <p className={styles.summary}>{doc.summary}</p>
            </section>
          )}

          <section className={styles.block}>
            <h4 className={styles.blockTitle}>Checklist ({doc.tasks.length})</h4>
            <ul className={styles.list}>
              {doc.tasks.map((task) => (
                <li key={task.title}>
                  <span className={styles.taskTitle}>{task.title}</span>
                  {task.notes ? <span className={styles.taskNotes}>{task.notes}</span> : null}
                </li>
              ))}
            </ul>
          </section>

          <div className={styles.actions}>
            <button type="button" onClick={() => downloadMarkdown(doc)}>
              Download .md
            </button>
            <button
              type="button"
              onClick={() => {
                void copyMarkdown(doc).catch(() => undefined);
              }}
            >
              Kopieer
            </button>
          </div>

          <button type="button" className={styles.linkBtn} onClick={onOpenLibrary}>
            Alle takenlijsten →
          </button>
        </>
      )}
    </aside>
  );
}
