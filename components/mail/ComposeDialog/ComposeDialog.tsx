"use client";

import { useRef, useState } from "react";
import { AddressInput } from "@/components/mail/AddressInput/AddressInput";
import { AttachmentPicker } from "@/components/mail/AttachmentPicker/AttachmentPicker";
import { MicButton } from "@/components/mail/MicButton/MicButton";
import { SpellcheckBackdrop, SpellcheckSuggestions } from "@/components/mail/Spellcheck/SpellcheckMarks";
import { useSpellcheck } from "@/components/mail/Spellcheck/useSpellcheck";
import { consumeAiStream } from "@/lib/ai/ai-stream";
import { isValidEmailList } from "@/lib/shared/email-validation";
import { buildMailForm } from "@/lib/mail/mail-form-client";
import { apiRequest } from "@/lib/shared/api-request";
import styles from "./ComposeDialog.module.css";

type SubjectResponse = { subject?: string };
type SendResponse = { to: string };

type Props = {
  aiAvailable: boolean;
  sendAvailable: boolean;
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  onClose: () => void;
  onSent: (message: string) => void;
};

export function ComposeDialog({
  aiAvailable,
  sendAvailable,
  initialTo = "",
  initialSubject = "",
  initialBody = "",
  onClose,
  onSent,
}: Props) {
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [text, setText] = useState(initialBody);
  const [polishing, setPolishing] = useState(false);
  const [suggestingSubject, setSuggestingSubject] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const spellcheck = useSpellcheck(text, setText);

  const ready = isValidEmailList(to) && subject.trim() && text.trim();

  async function polish() {
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const result = await consumeAiStream(res, (body) => setText(body));
      setText(result.body);
      setNotes(result.notes || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correctie mislukt");
    } finally {
      setPolishing(false);
    }
  }

  async function suggestSubject() {
    setSuggestingSubject(true);
    setError(null);
    try {
      const data = await apiRequest<SubjectResponse>("/api/ai/subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setSubject(data.subject ?? subject);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onderwerp suggereren mislukt");
    } finally {
      setSuggestingSubject(false);
    }
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const data = await apiRequest<SendResponse>("/api/mail/send", {
        method: "POST",
        body: buildMailForm({ to, subject, text, cc: cc || undefined, bcc: bcc || undefined }, attachments),
      });
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
          <AddressInput
            value={to}
            placeholder="naam@voorbeeld.nl (meerdere adressen: gescheiden door komma's)"
            onChange={setTo}
          />
        </label>

        {!showCcBcc ? (
          <button type="button" className={styles.close} onClick={() => setShowCcBcc(true)}>
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
          <span>Onderwerp</span>
          <div className={styles.subjectRow}>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
            <button
              type="button"
              className={styles.subjectSuggest}
              disabled={!aiAvailable || suggestingSubject || !text.trim()}
              title="Laat AI een onderwerp voorstellen op basis van je bericht"
              onClick={() => void suggestSubject()}
            >
              {suggestingSubject ? "…" : "AI-suggestie"}
            </button>
          </div>
        </label>

        <label className={`${styles.field} ${styles.bodyField}`}>
          <span>Bericht</span>
          <div className={styles.textareaWrap}>
            <SpellcheckBackdrop text={text} corrections={spellcheck.corrections} scrollRef={backdropRef} />
            <textarea
              value={text}
              className={spellcheck.corrections.length ? styles.textareaMarked : undefined}
              onChange={(event) => setText(event.target.value)}
              onScroll={(event) => {
                if (backdropRef.current) backdropRef.current.scrollTop = event.currentTarget.scrollTop;
              }}
            />
            <div className={styles.textareaMic}>
              <MicButton
                disabled={sending || polishing}
                onText={(addition) =>
                  setText((prev) => (prev.trim() ? `${prev.trim()} ${addition}` : addition))
                }
              />
            </div>
          </div>
        </label>

        <AttachmentPicker
          files={attachments}
          onChange={setAttachments}
          disabled={sending || polishing}
          error={attachmentError}
          onError={setAttachmentError}
        />

        {spellcheck.error && <p className={styles.notes}>{spellcheck.error}</p>}
        <SpellcheckSuggestions
          corrections={spellcheck.corrections}
          onAccept={spellcheck.accept}
          onDismiss={spellcheck.dismiss}
        />

        {notes && <p className={styles.notes}>{notes}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            disabled={!aiAvailable || polishing || sending || spellcheck.checking || !text.trim()}
            onClick={() => void spellcheck.runCheck()}
          >
            {spellcheck.checking ? "Controleren…" : "Spellingcontrole"}
          </button>
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
