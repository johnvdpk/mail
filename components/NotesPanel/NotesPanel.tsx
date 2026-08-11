"use client";

import { useEffect, useState } from "react";
import type { Note } from "@/lib/notes";
import { MicButton } from "@/components/MicButton/MicButton";
import styles from "./NotesPanel.module.css";

type Props = {
  items: Note[];
  active: Note | null;
  loading: boolean;
  submitting: boolean;
  onSelect: (id: number) => void;
  onCreate: (title: string, body: string) => void;
  onUpdate: (id: number, title: string, body: string) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
};

function appendText(current: string, addition: string): string {
  const trimmed = current.trim();
  return trimmed ? `${trimmed} ${addition}` : addition;
}

export function NotesPanel({
  items,
  active,
  loading,
  submitting,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  useEffect(() => {
    setEditTitle(active?.title ?? "");
    setEditBody(active?.body ?? "");
  }, [active]);

  const dirty = Boolean(active) && (editTitle !== active?.title || editBody !== active?.body);

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>Notities</h2>
          <p className={styles.sub}>Losse aantekeningen, los van je mail en tickets.</p>
        </div>
        <button type="button" onClick={onClose}>
          Terug naar mail
        </button>
      </header>

      <div className={styles.grid}>
        <section className={styles.listPane} aria-label="Notities">
          {creating ? (
            <form
              className={styles.newForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (!newTitle.trim()) return;
                onCreate(newTitle.trim(), newBody.trim());
                setNewTitle("");
                setNewBody("");
                setCreating(false);
              }}
            >
              <div className={styles.inputWithMic}>
                <input
                  value={newTitle}
                  placeholder="Titel"
                  onChange={(event) => setNewTitle(event.target.value)}
                  autoFocus
                />
                <MicButton onText={(text) => setNewTitle((prev) => appendText(prev, text))} />
              </div>
              <div className={styles.inputWithMic}>
                <textarea
                  value={newBody}
                  placeholder="Inhoud van de notitie…"
                  rows={5}
                  onChange={(event) => setNewBody(event.target.value)}
                />
                <MicButton onText={(text) => setNewBody((prev) => appendText(prev, text))} />
              </div>
              <div className={styles.newFormActions}>
                <button type="submit" disabled={submitting || !newTitle.trim()}>
                  {submitting ? "Aanmaken…" : "Notitie aanmaken"}
                </button>
                <button type="button" onClick={() => setCreating(false)}>
                  Annuleren
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className={styles.addNote} onClick={() => setCreating(true)}>
              + Nieuwe notitie
            </button>
          )}

          {loading && items.length === 0 ? (
            <p className={styles.empty}>Laden…</p>
          ) : items.length === 0 ? (
            <p className={styles.empty}>Nog geen notities.</p>
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
                    <span className={styles.itemMeta}>
                      {new Date(item.updatedAt).toLocaleString("nl-NL")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.detailPane} aria-label="Notitie detail">
          {!active ? (
            <p className={styles.empty}>Kies een notitie om te bekijken of te bewerken.</p>
          ) : (
            <form
              className={styles.editForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (!editTitle.trim()) return;
                onUpdate(active.id, editTitle.trim(), editBody.trim());
              }}
            >
              <div className={styles.inputWithMic}>
                <input
                  className={styles.editTitle}
                  value={editTitle}
                  placeholder="Titel"
                  onChange={(event) => setEditTitle(event.target.value)}
                />
                <MicButton onText={(text) => setEditTitle((prev) => appendText(prev, text))} />
              </div>
              <div className={styles.inputWithMic}>
                <textarea
                  className={styles.editBody}
                  value={editBody}
                  placeholder="Inhoud van de notitie…"
                  rows={16}
                  onChange={(event) => setEditBody(event.target.value)}
                />
                <MicButton onText={(text) => setEditBody((prev) => appendText(prev, text))} />
              </div>
              <div className={styles.newFormActions}>
                <button type="submit" disabled={submitting || !editTitle.trim() || !dirty}>
                  {submitting ? "Opslaan…" : "Opslaan"}
                </button>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => {
                    if (window.confirm(`Notitie "${active.title}" verwijderen?`)) {
                      onDelete(active.id);
                    }
                  }}
                >
                  Verwijderen
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
