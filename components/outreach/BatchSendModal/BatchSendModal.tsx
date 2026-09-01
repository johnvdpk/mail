"use client";

import { useMemo, useState } from "react";
import { ApiError, apiRequest } from "@/lib/shared/api-request";
import { buildOutreachEmail } from "@/lib/outreach/email-template";
import type { Campaign, CampaignTarget, EmailDraft } from "@/lib/outreach/types";
import styles from "./BatchSendModal.module.css";

type ItemStatus = "ready" | "sent" | "error" | "duplicate" | "skipped";

type Props = {
  campaign: Campaign;
  queue: CampaignTarget[];
  drafts: Record<number, EmailDraft>;
  personalizeErrors?: Record<number, string>;
  smtpReady: boolean;
  onClose: () => void;
  onDraftChange: (targetId: number, draft: EmailDraft) => void;
  onSent: (targetId: number) => void;
};

export function BatchSendModal({
  campaign,
  queue,
  drafts,
  personalizeErrors,
  smtpReady,
  onClose,
  onDraftChange,
  onSent,
}: Props) {
  const [index, setIndex] = useState(0);
  const [statuses, setStatuses] = useState<Record<number, { status: ItemStatus; detail?: string }>>(
    () => {
      const initial: Record<number, { status: ItemStatus; detail?: string }> = {};
      for (const [id, message] of Object.entries(personalizeErrors ?? {})) {
        initial[Number(id)] = { status: "error", detail: `Personalisatie mislukt: ${message}` };
      }
      return initial;
    }
  );
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  const current = queue[index];
  const draft = current ? drafts[current.id] : undefined;
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [bodyText, setBodyText] = useState(draft?.bodyText ?? "");

  const content = useMemo(() => {
    if (!current) return null;
    return buildOutreachEmail(current.name, current.website ?? undefined, campaign.profile, {
      subject,
      bodyText,
    });
  }, [campaign.profile, current, subject, bodyText]);

  function select(nextIndex: number) {
    persistCurrent();
    const next = queue[nextIndex];
    setIndex(nextIndex);
    const nextDraft = next ? drafts[next.id] : undefined;
    setSubject(nextDraft?.subject ?? "");
    setBodyText(nextDraft?.bodyText ?? "");
  }

  function persistCurrent() {
    if (!current || !content) return;
    onDraftChange(current.id, {
      subject: content.subject,
      text: content.text,
      html: content.html,
      bodyText,
    });
  }

  async function sendOne(target: CampaignTarget, wrapped: { subject: string; text: string; html: string }) {
    try {
      await apiRequest(`/api/outreach/campaigns/${campaign.id}/targets/${target.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wrapped),
      });
      setStatuses((prev) => ({ ...prev, [target.id]: { status: "sent" } }));
      onSent(target.id);
      return "sent" as const;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Versturen mislukt";
      const status: ItemStatus = err instanceof ApiError && err.status === 409 ? "duplicate" : "error";
      setStatuses((prev) => ({ ...prev, [target.id]: { status, detail: message } }));
      return status;
    }
  }

  async function sendCurrent() {
    if (!current || !content || !smtpReady) return;
    persistCurrent();
    await sendOne(current, content);
  }

  async function sendAll() {
    if (!smtpReady) return;
    const remaining = queue.filter(
      (t) => statuses[t.id]?.status !== "sent" && statuses[t.id]?.status !== "error"
    );
    if (remaining.length === 0) return;
    if (
      !window.confirm(
        `Weet je zeker dat je ${remaining.length} mail${remaining.length === 1 ? "" : "s"} wilt versturen? Dit kan niet ongedaan worden gemaakt.`
      )
    ) {
      return;
    }
    persistCurrent();
    setSendingAll(true);
    setProgress({ current: 0, total: remaining.length });

    for (let i = 0; i < remaining.length; i++) {
      const target = remaining[i];
      const itemDraft = target.id === current?.id ? content : drafts[target.id];
      const wrapped = buildOutreachEmail(target.name, target.website ?? undefined, campaign.profile, {
        subject: itemDraft?.subject ?? "",
        bodyText: itemDraft?.bodyText ?? "",
      });
      if (!wrapped.subject || !wrapped.bodyText) {
        setStatuses((prev) => ({
          ...prev,
          [target.id]: { status: "skipped", detail: "Geen onderwerp of tekst" },
        }));
      } else {
        await sendOne(target, wrapped);
      }
      setProgress({ current: i + 1, total: remaining.length });
    }

    setSendingAll(false);
    setProgress(null);
  }

  if (!current) return null;
  const currentStatus = statuses[current.id];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Review & verstuur</h2>
            <p className={styles.sub}>
              {index + 1} / {queue.length} · {current.name}
            </p>
          </div>
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
        </header>

        {progress && (
          <p className={styles.status}>
            Versturen {progress.current}/{progress.total}…
          </p>
        )}
        {currentStatus?.detail && (
          <p className={currentStatus.status === "sent" ? styles.ok : styles.error}>
            {currentStatus.detail}
          </p>
        )}
        {currentStatus?.status === "sent" && <p className={styles.ok}>Verstuurd</p>}

        <label className={styles.field}>
          Onderwerp
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onBlur={persistCurrent}
          />
        </label>
        <label className={styles.field}>
          Mailtekst
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            onBlur={persistCurrent}
            rows={12}
          />
        </label>

        <ul className={styles.queue}>
          {queue.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className={i === index ? styles.queueActive : undefined}
                onClick={() => select(i)}
              >
                {item.name}
                {statuses[item.id] ? ` · ${statusLabel(statuses[item.id].status)}` : ""}
              </button>
            </li>
          ))}
        </ul>

        <footer className={styles.footer}>
          {!smtpReady && <p className={styles.hint}>SMTP niet actief.</p>}
          <div className={styles.footerBtns}>
            <button type="button" onClick={() => select(Math.max(0, index - 1))} disabled={index === 0}>
              Vorige
            </button>
            <button
              type="button"
              onClick={() => select(Math.min(queue.length - 1, index + 1))}
              disabled={index >= queue.length - 1}
            >
              Volgende
            </button>
            <button
              type="button"
              onClick={() => void sendCurrent()}
              disabled={!smtpReady || sendingAll || currentStatus?.status === "sent"}
            >
              Verstuur deze
            </button>
            <button type="button" onClick={() => void sendAll()} disabled={!smtpReady || sendingAll}>
              {sendingAll ? "Bezig…" : "Verstuur alles"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function statusLabel(status: ItemStatus): string {
  if (status === "sent") return "verstuurd";
  if (status === "duplicate") return "al benaderd";
  if (status === "skipped") return "overgeslagen";
  if (status === "error") return "mislukt";
  return "";
}
