"use client";

import { useState } from "react";
import { AddressInput } from "@/components/AddressInput/AddressInput";
import { AttachmentPicker } from "@/components/AttachmentPicker/AttachmentPicker";
import { isValidEmailList } from "@/lib/email-validation";
import styles from "./ComposeDialog.module.css";

type Props = {
  subject: string;
  sending: boolean;
  sendAvailable: boolean;
  onClose: () => void;
  onSend: (to: string, text: string, attachments: File[], cc?: string, bcc?: string) => void;
};

export function ForwardDialog({ subject, sending, sendAvailable, onClose, onSend }: Props) {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const ready = isValidEmailList(to) && !attachmentError;

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
          <AddressInput
            value={to}
            placeholder="naam@voorbeeld.nl (meerdere adressen: gescheiden door komma's)"
            onChange={setTo}
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
              <AddressInput value={cc} placeholder="CC" onChange={setCc} />
            </label>
            <label className={styles.field}>
              <span>BCC</span>
              <AddressInput value={bcc} placeholder="BCC" onChange={setBcc} />
            </label>
          </>
        )}

        <label className={styles.field}>
          <span>Eigen bericht (optioneel)</span>
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </label>

        <AttachmentPicker
          files={attachments}
          onChange={setAttachments}
          disabled={sending}
          error={attachmentError}
          onError={setAttachmentError}
        />

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.send}
            disabled={!sendAvailable || sending || !ready}
            onClick={() => onSend(to, text, attachments, cc || undefined, bcc || undefined)}
          >
            {sending ? "Versturen…" : "Doorsturen"}
          </button>
        </div>
      </div>
    </div>
  );
}
