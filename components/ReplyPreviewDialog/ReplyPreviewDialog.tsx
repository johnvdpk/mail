"use client";

import styles from "./ReplyPreviewDialog.module.css";

type Props = {
  label: string;
  value: string;
  streaming?: boolean;
  sending: boolean;
  sendAvailable: boolean;
  onChange: (value: string) => void;
  onConfirmSend: () => void;
  onKeepEditing: () => void;
  onClose: () => void;
};

export function ReplyPreviewDialog({
  label,
  value,
  streaming = false,
  sending,
  sendAvailable,
  onChange,
  onConfirmSend,
  onKeepEditing,
  onClose,
}: Props) {
  const busy = streaming || sending;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Reply preview">
      <div className={styles.dialog}>
        <header className={styles.head}>
          <h2 className={styles.title}>Preview: {label}</h2>
          <button type="button" className={styles.close} onClick={onClose} disabled={streaming}>
            Sluiten
          </button>
        </header>

        <p className={styles.hint}>
          {streaming
            ? "AI schrijft het concept…"
            : "Controleer of bewerk het AI-concept voordat je verstuurt."}
        </p>

        <textarea
          className={`${styles.body} ${streaming ? styles.bodyStreaming : ""}`}
          rows={12}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          readOnly={streaming}
          aria-busy={streaming}
        />

        <div className={styles.actions}>
          <button type="button" onClick={onKeepEditing} disabled={busy}>
            Bewerk verder
          </button>
          <button
            type="button"
            className={styles.send}
            disabled={!sendAvailable || busy || !value.trim()}
            onClick={onConfirmSend}
          >
            {sending ? "Versturen…" : streaming ? "Schrijft…" : "Verstuur"}
          </button>
        </div>
      </div>
    </div>
  );
}
