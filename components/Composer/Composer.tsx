"use client";

import { useRef, useState } from "react";
import type { QuickReplyTemplate } from "@/lib/email-config";
import styles from "./Composer.module.css";

type Props = {
  value: string;
  cc: string;
  bcc: string;
  quickReplies: QuickReplyTemplate[];
  draftingIntent: string | null;
  polishing: boolean;
  sending: boolean;
  notes: string | null;
  aiAvailable: boolean;
  sendAvailable: boolean;
  onChange: (value: string) => void;
  onCcChange: (value: string) => void;
  onBccChange: (value: string) => void;
  onQuickReply: (intent: string) => void;
  onPolish: () => void;
  onSend: () => void;
};

const FORMAT_ACTIONS = [
  { label: "B", title: "Vet", prefix: "**", suffix: "**" },
  { label: "I", title: "Cursief", prefix: "_", suffix: "_" },
  { label: "🔗", title: "Link", prefix: "[", suffix: "](url)" },
  { label: "• ", title: "Lijst", prefix: "- ", suffix: "" },
] as const;

export function Composer({
  value,
  cc,
  bcc,
  quickReplies,
  draftingIntent,
  polishing,
  sending,
  notes,
  aiAvailable,
  sendAvailable,
  onChange,
  onCcChange,
  onBccChange,
  onQuickReply,
  onPolish,
  onSend,
}: Props) {
  const busy = draftingIntent !== null || polishing || sending;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showCcBcc, setShowCcBcc] = useState(false);

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (sendAvailable && value.trim() && !busy) onSend();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "b") {
      event.preventDefault();
      applyFormat("**", "**");
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "i") {
      event.preventDefault();
      applyFormat("_", "_");
    }
  }

  function applyFormat(prefix: string, suffix: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const replacement = `${prefix}${selected || "tekst"}${suffix}`;
    const next = value.slice(0, start) + replacement + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = start + prefix.length;
      const newEnd = start + prefix.length + (selected || "tekst").length;
      el.setSelectionRange(newPos, newEnd);
    });
  }

  return (
    <div className={styles.composer}>
      <div className={styles.quickRow}>
        {quickReplies.map((reply) => (
          <button
            key={reply.id}
            type="button"
            className={styles.quick}
            title={reply.hint}
            disabled={!aiAvailable || busy}
            onClick={() => onQuickReply(reply.id)}
          >
            {draftingIntent === reply.id ? "Schrijft…" : reply.label}
          </button>
        ))}
      </div>

      <div className={styles.ccRow}>
        {!showCcBcc ? (
          <button
            type="button"
            className={styles.ccToggle}
            onClick={() => setShowCcBcc(true)}
          >
            CC / BCC
          </button>
        ) : (
          <>
            <input
              type="text"
              className={styles.ccInput}
              placeholder="CC"
              value={cc}
              onChange={(e) => onCcChange(e.target.value)}
            />
            <input
              type="text"
              className={styles.ccInput}
              placeholder="BCC"
              value={bcc}
              onChange={(e) => onBccChange(e.target.value)}
            />
          </>
        )}
      </div>

      <div className={styles.formatBar}>
        {FORMAT_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className={styles.formatBtn}
            title={action.title}
            onClick={() => applyFormat(action.prefix, action.suffix)}
          >
            {action.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        rows={7}
        value={value}
        placeholder="Schrijf je antwoord, of laat een quick reply het concept maken."
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />

      {notes && <p className={styles.notes}>{notes}</p>}

      <div className={styles.actions}>
        <span className={styles.hint}>Ctrl+Enter verstuurt · Ctrl+B vet · Ctrl+I cursief</span>
        <button
          type="button"
          disabled={!aiAvailable || busy || !value.trim()}
          onClick={onPolish}
        >
          {polishing ? "Nakijken…" : "Spelling en toon"}
        </button>
        <button
          type="button"
          className={styles.send}
          disabled={!sendAvailable || busy || !value.trim()}
          onClick={onSend}
        >
          {sending ? "Versturen…" : "Verstuur"}
        </button>
      </div>
    </div>
  );
}
