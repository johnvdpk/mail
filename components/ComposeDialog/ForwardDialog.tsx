"use client";

import { useState } from "react";
import styles from "./ComposeDialog.module.css";

type Props = {
  subject: string;
  sending: boolean;
  sendAvailable: boolean;
  onClose: () => void;
  onSend: (to: string, text: string, cc?: string, bcc?: string) => void;
};

export function ForwardDialog({ subject, sending, sendAvailable, onClose, onSend }: Props) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);

  const ready = to.includes("@");

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Doorsturen">
      <div className={styles.dialog}>
        <header className={styles.head}>
          <h2 className={styles.title}>Doorsturen: {subject}</h2>
          <button type="button" className={styles.close} onClick={onClose}>
            Sluiten
          </button>
        </header>

        <label className={styles.field}>
          <span>Aan</span>
          <input
            type="email"
            value={to}
            placeholder="naam@voorbeeld.nl"
            onChange={(e) => setTo(e.target.value)}
            autoFocus
          />
        </label>

        {!showCcBcc ? (
          <button
            type="button"
            className={styles.close}
            onClick={() => setShowCcBcc(true)}
          >
            CC / BCC toevoegen
          </button>
        ) : (
          <>
            <label className={styles.field}>
              <span>CC</span>
              <input
                type="text"
                value={cc}
                placeholder="CC"
                onChange={(e) => setCc(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>BCC</span>
              <input
                type="text"
                value={bcc}
                placeholder="BCC"
                onChange={(e) => setBcc(e.target.value)}
              />
            </label>
          </>
        )}

        <label className={styles.field}>
          <span>Eigen bericht (optioneel)</span>
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </label>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.send}
            disabled={!sendAvailable || sending || !ready}
            onClick={() => onSend(to, text, cc || undefined, bcc || undefined)}
          >
            {sending ? "Versturen…" : "Doorsturen"}
          </button>
        </div>
      </div>
    </div>
  );
}
