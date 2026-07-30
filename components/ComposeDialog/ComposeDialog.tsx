"use client";

import { useState } from "react";
import { AttachmentPicker } from "@/components/AttachmentPicker/AttachmentPicker";
import { isValidEmail } from "@/lib/email-validation";
import { buildMailForm } from "@/lib/mail-form-client";
import styles from "./ComposeDialog.module.css";

type Props = {
  aiAvailable: boolean;
  sendAvailable: boolean;
  onClose: () => void;
  onSent: (message: string) => void;
};

export function ComposeDialog({ aiAvailable, sendAvailable, onClose, onSent }: Props) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = isValidEmail(to) && subject.trim() && text.trim();

  async function polish() {
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Correctie mislukt");
      setText(data.body ?? text);
      setNotes(data.notes || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correctie mislukt");
    } finally {
      setPolishing(false);
    }
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/mail/send",
        {
          method: "POST",
          body: buildMailForm({ to, subject, text }, attachments),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Versturen mislukt");
      onSent(`Mail verstuurd naar ${data.to}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versturen mislukt");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Nieuwe mail">
      <div className={styles.dialog}>
        <header className={styles.head}>
          <h2 className={styles.title}>Nieuwe mail</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            Sluiten
          </button>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        <label className={styles.field}>
          <span>Aan</span>
          <input
            type="email"
            value={to}
            placeholder="naam@voorbeeld.nl"
            onChange={(event) => setTo(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>Onderwerp</span>
          <input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </label>

        <label className={`${styles.field} ${styles.bodyField}`}>
          <span>Bericht</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} />
        </label>

        <AttachmentPicker
          files={attachments}
          onChange={setAttachments}
          disabled={sending || polishing}
          error={attachmentError}
          onError={setAttachmentError}
        />

        {notes && <p className={styles.notes}>{notes}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            disabled={!aiAvailable || polishing || sending || !text.trim()}
            onClick={() => void polish()}
          >
            {polishing ? "Nakijken…" : "Spelling en toon"}
          </button>
          <button
            type="button"
            className={styles.send}
            disabled={!sendAvailable || sending || polishing || !ready || !!attachmentError}
            onClick={() => void send()}
          >
            {sending ? "Versturen…" : "Verstuur"}
          </button>
        </div>
      </div>
    </div>
  );
}
