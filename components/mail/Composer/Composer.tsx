"use client";

import { useEffect, useRef, useState } from "react";
import { AddressInput } from "@/components/mail/AddressInput/AddressInput";
import { AttachmentPicker } from "@/components/mail/AttachmentPicker/AttachmentPicker";
import { MicButton } from "@/components/mail/MicButton/MicButton";
import { SpellcheckBackdrop, SpellcheckSuggestions } from "@/components/mail/Spellcheck/SpellcheckMarks";
import { useSpellcheck } from "@/components/mail/Spellcheck/useSpellcheck";
import styles from "./Composer.module.css";

type Props = {
  value: string;
  cc: string;
  bcc: string;
  expanded: boolean;
  focusNonce: number;
  drafting: boolean;
  polishing: boolean;
  sending: boolean;
  notes: string | null;
  aiAvailable: boolean;
  sendAvailable: boolean;
  attachments: File[];
  attachmentError: string | null;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (value: string) => void;
  onCcChange: (value: string) => void;
  onBccChange: (value: string) => void;
  onAttachmentsChange: (files: File[]) => void;
  onAttachmentError: (message: string | null) => void;
  onDraftFromInstruction: (instruction: string) => void;
  onPolish: () => void;
  onSend: () => void;
  onScheduleSend?: (sendAtIso: string) => void;
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
  expanded,
  focusNonce,
  drafting,
  polishing,
  sending,
  notes,
  aiAvailable,
  sendAvailable,
  attachments,
  attachmentError,
  onExpandedChange,
  onChange,
  onCcChange,
  onBccChange,
  onAttachmentsChange,
  onAttachmentError,
  onDraftFromInstruction,
  onPolish,
  onSend,
  onScheduleSend,
}: Props) {
  const busy = drafting || polishing || sending;
  const canSend = sendAvailable && value.trim() && !busy && !attachmentError;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [command, setCommand] = useState("");
  const spellcheck = useSpellcheck(value, onChange);

  useEffect(() => {
    if (cc.trim() || bcc.trim()) setShowCcBcc(true);
  }, [cc, bcc]);

  useEffect(() => {
    if (!focusNonce) return;
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [focusNonce]);

  function openCommand() {
    if (!aiAvailable || busy) return;
    setCommandOpen(true);
    setCommand("");
    requestAnimationFrame(() => commandRef.current?.focus());
  }

  function closeCommand() {
    setCommandOpen(false);
    setCommand("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function submitCommand() {
    const instruction = command.trim();
    if (!instruction || !aiAvailable || busy) return;
    setCommandOpen(false);
    setCommand("");
    onDraftFromInstruction(instruction);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      openCommand();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (canSend) onSend();
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
    <div className={styles.composer} data-expanded={expanded}>
      <button
        type="button"
        className={styles.expandToggle}
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? "▾ Antwoord inklappen" : "✎ Antwoorden"}
      </button>
      <div className={styles.fields}>
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
            <AddressInput
              className={styles.ccInput}
              placeholder="CC"
              value={cc}
              onChange={onCcChange}
            />
            <AddressInput
              className={styles.ccInput}
              placeholder="BCC"
              value={bcc}
              onChange={onBccChange}
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

      {commandOpen && (
        <div className={styles.commandBar}>
          <span className={styles.commandLabel}>AI</span>
          <input
            ref={commandRef}
            className={styles.commandInput}
            value={command}
            placeholder="Kernwoorden, daarna Enter"
            disabled={busy}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitCommand();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeCommand();
              }
            }}
            onBlur={() => {
              if (!command.trim()) closeCommand();
            }}
          />
        </div>
      )}

      <div className={styles.textareaWrap}>
        <SpellcheckBackdrop text={value} corrections={spellcheck.corrections} scrollRef={backdropRef} />
        <textarea
          ref={textareaRef}
          className={
            [(drafting || polishing) && styles.textareaStreaming, spellcheck.corrections.length && styles.textareaMarked]
              .filter(Boolean)
              .join(" ") || undefined
          }
          value={value}
          placeholder="Schrijf je antwoord. Tab + kernwoorden + Enter laat AI een concept maken."
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onScroll={(event) => {
            if (backdropRef.current) backdropRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
          aria-busy={drafting || polishing}
        />
        <div className={styles.textareaMic}>
          <MicButton
            disabled={busy}
            onText={(text) => onChange(value.trim() ? `${value.trim()} ${text}` : text)}
          />
        </div>
      </div>

      <AttachmentPicker
        files={attachments}
        onChange={onAttachmentsChange}
        disabled={busy}
        error={attachmentError}
        onError={onAttachmentError}
      />

      {spellcheck.error && <p className={styles.notes}>{spellcheck.error}</p>}
      <SpellcheckSuggestions
        corrections={spellcheck.corrections}
        onAccept={spellcheck.accept}
        onDismiss={spellcheck.dismiss}
      />

      {drafting && <p className={styles.notes}>AI schrijft…</p>}
      {notes && <p className={styles.notes}>{notes}</p>}

      <div className={styles.actions}>
        <span className={styles.hint}>Tab AI · Ctrl+Enter verstuurt · Ctrl+B vet · Ctrl+I cursief</span>
        <button
          type="button"
          disabled={!aiAvailable || busy || spellcheck.checking || !value.trim()}
          onClick={() => void spellcheck.runCheck()}
        >
          {spellcheck.checking ? "Controleren…" : "Spellingcontrole"}
        </button>
        <button
          type="button"
          disabled={!aiAvailable || busy || !value.trim()}
          onClick={onPolish}
        >
          {polishing ? "Nakijken…" : "Spelling en toon"}
        </button>
        {onScheduleSend && (
          <div className={styles.scheduleWrap}>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => setScheduleOpen(!scheduleOpen)}
            >
              Later
            </button>
            {scheduleOpen && (
              <ul className={styles.scheduleMenu}>
                {[
                  { label: "Morgen 9:00", at: tomorrowNine() },
                  { label: "Over 2 uur", at: hoursFromNow(2) },
                  { label: "Maandag 9:00", at: nextMondayNine() },
                ].map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleOpen(false);
                        onScheduleSend(item.at);
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button
          type="button"
          className={styles.send}
          disabled={!canSend}
          onClick={onSend}
        >
          {sending ? "Versturen…" : "Verstuur"}
        </button>
      </div>
      </div>
    </div>
  );
}

function hoursFromNow(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

function tomorrowNine(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function nextMondayNine(): string {
  const d = new Date();
  const day = d.getDay();
  const days = ((1 - day + 7) % 7) || 7;
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
