"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import { buildOutreachEmail, stripSignatureFromText } from "@/lib/outreach/email-template";
import type { Campaign, CampaignTarget, EmailDraft } from "@/lib/outreach/types";
import type { PersonalizeResult } from "@/lib/outreach/personalize";
import { ScanFindings } from "@/components/outreach/ScanFindings/ScanFindings";
import styles from "./EmailPreviewModal.module.css";

const BUSY_PHASES = [
  "Website van de lead ophalen…",
  "Website scannen op aanknopingspunten…",
  "AI schrijft een persoonlijke mail…",
] as const;

function useBusyPhase(active: boolean): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timers = [window.setTimeout(() => setIndex(1), 8_000), window.setTimeout(() => setIndex(2), 20_000)];
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return BUSY_PHASES[index] ?? BUSY_PHASES[0];
}

type Props = {
  campaign: Campaign;
  target: CampaignTarget;
  initialDraft?: EmailDraft;
  aiReady: boolean;
  smtpReady: boolean;
  onClose: () => void;
  onDraftChange: (targetId: number, draft: EmailDraft) => void;
  onSent?: (targetId: number) => void;
};

export function EmailPreviewModal({
  campaign,
  target,
  initialDraft,
  aiReady,
  smtpReady,
  onClose,
  onDraftChange,
  onSent,
}: Props) {
  const personalizeAction = useAsyncAction();
  const sendAction = useAsyncAction();
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [bodyText, setBodyText] = useState(initialDraft?.bodyText ?? "");
  const [findings, setFindings] = useState(initialDraft?.findings ?? "");
  const [scan, setScan] = useState(initialDraft?.scan);
  const [websiteError, setWebsiteError] = useState(initialDraft?.websiteError ?? "");
  const [metadataFallback, setMetadataFallback] = useState(
    initialDraft?.usedMetadataFallback ?? false
  );
  const [editMode, setEditMode] = useState(!initialDraft);
  const [success, setSuccess] = useState<string | null>(null);
  const [dupError, setDupError] = useState<string | null>(null);
  const [sending, setSending] = useState<"test" | "real" | null>(null);

  const content = useMemo(
    () =>
      buildOutreachEmail(target.name, target.website ?? undefined, campaign.profile, {
        subject,
        bodyText,
      }),
    [campaign.profile, target.name, target.website, subject, bodyText]
  );

  function persist(next: Partial<EmailDraft> = {}) {
    onDraftChange(target.id, {
      subject: next.subject ?? content.subject,
      text: next.text ?? content.text,
      html: next.html ?? content.html,
      bodyText: next.bodyText ?? bodyText,
      findings: next.findings ?? findings,
      scan: next.scan ?? scan,
      websiteError: next.websiteError ?? websiteError,
      usedMetadataFallback: next.usedMetadataFallback ?? metadataFallback,
    });
  }

  async function personalize() {
    const data = await personalizeAction.run(
      () =>
        apiRequest<PersonalizeResult>(
          `/api/outreach/campaigns/${campaign.id}/targets/${target.id}/personalize`,
          { method: "POST" }
        ),
      "Personalisatie mislukt"
    );
    if (!data) return;
    const nextBody = stripSignatureFromText(data.bodyText || data.text, campaign.profile.footer.text);
    setSubject(data.subject);
    setBodyText(nextBody);
    setFindings(data.findings ?? "");
    setScan(data.scan);
    setWebsiteError(data.websiteError ?? "");
    setMetadataFallback(data.usedMetadataFallback ?? false);
    setEditMode(true);
    persist({
      subject: data.subject,
      text: data.text,
      html: data.html,
      bodyText: nextBody,
      findings: data.findings,
      scan: data.scan,
      websiteError: data.websiteError,
      usedMetadataFallback: data.usedMetadataFallback,
    });
  }

  async function send(isTest: boolean) {
    setDupError(null);
    setSuccess(null);
    setSending(isTest ? "test" : "real");
    const data = await sendAction.run(async () => {
      try {
        return await apiRequest<{ send: { sentAt: string } }>(
          `/api/outreach/campaigns/${campaign.id}/targets/${target.id}/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: content.subject,
              text: content.text,
              html: content.html,
              isTest,
            }),
          }
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setDupError(err.message);
          return undefined;
        }
        throw err;
      }
    }, "Versturen mislukt");
    setSending(null);
    if (!data) return;
    setSuccess(isTest ? `Testmail verstuurd (${campaign.profile.testEmail})` : "Mail verstuurd");
    if (!isTest) onSent?.(target.id);
  }

  const ready = Boolean(subject && bodyText);
  const busy =
    personalizeAction.loading ||
    (aiReady && !initialDraft && !subject && !bodyText && !personalizeAction.error);
  const busyPhase = useBusyPhase(busy);
  const autoStarted = useRef(false);
  const personalizeRef = useRef(personalize);
  personalizeRef.current = personalize;

  useEffect(() => {
    if (autoStarted.current || !aiReady || initialDraft) return;
    autoStarted.current = true;
    void personalizeRef.current();
  }, [aiReady, initialDraft]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Mail preview</h2>
            <p className={styles.sub}>{target.name}</p>
          </div>
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
        </header>

        {busy && <p className={styles.status}>{busyPhase}</p>}
        {!aiReady && (
          <p className={styles.warn}>AI niet actief — personalisatie is uitgeschakeld.</p>
        )}
        {(personalizeAction.error || sendAction.error) && (
          <p className={styles.error}>{personalizeAction.error || sendAction.error}</p>
        )}
        {dupError && <p className={styles.error}>{dupError}</p>}
        {success && <p className={styles.ok}>{success}</p>}
        {metadataFallback && !busy && (
          <p className={styles.warn}>
            Website live niet opgehaald. De AI gebruikte metadata. Je kunt de mail nog bewerken.
          </p>
        )}

        <div className={styles.meta}>
          <p>
            <strong>Aan:</strong> {target.email || "— geen e-mail"}
          </p>
        </div>

        {!busy && (findings || scan) && <ScanFindings findings={findings} scan={scan} />}

        <div className={styles.editBar}>
          <button type="button" onClick={() => setEditMode(false)} disabled={busy}>
            Preview
          </button>
          <button type="button" onClick={() => setEditMode(true)} disabled={busy}>
            Bewerken
          </button>
          {aiReady && (
            <button type="button" onClick={() => void personalize()} disabled={busy}>
              {busy ? "AI analyseert…" : "Personaliseer met AI"}
            </button>
          )}
        </div>

        {busy ? (
          <div className={styles.busy} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <p className={styles.busyTitle}>{busyPhase}</p>
            <p className={styles.busyHint}>
              Eerst wordt de website opgehaald, daarna schrijft de AI de mail. Dit kan tot een minuut duren.
            </p>
          </div>
        ) : editMode ? (
          <div className={styles.editPanel}>
            <label className={styles.field}>
              Onderwerp
              <input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  persist({ subject: e.target.value });
                }}
              />
            </label>
            <label className={styles.field}>
              Mailtekst (footer en handtekening worden automatisch toegevoegd)
              <textarea
                value={bodyText}
                onChange={(e) => {
                  setBodyText(e.target.value);
                  persist({ bodyText: e.target.value });
                }}
              />
            </label>
          </div>
        ) : (
          <>
            <div className={styles.previewMeta}>
              <p>
                <strong>Onderwerp:</strong> {subject || "—"}
              </p>
            </div>
            <div className={styles.previewFrame} dangerouslySetInnerHTML={{ __html: content.html }} />
          </>
        )}

        <footer className={styles.footer}>
          {!smtpReady && <p className={styles.hint}>SMTP niet actief — versturen is uitgeschakeld.</p>}
          <div className={styles.footerBtns}>
            <button type="button" onClick={onClose}>
              Sluiten
            </button>
            {smtpReady && (
              <>
                <button
                  type="button"
                  onClick={() => void send(true)}
                  disabled={!ready || sending !== null || !campaign.profile.testEmail}
                >
                  {sending === "test" ? "Versturen…" : `Test → ${campaign.profile.testEmail || "geen testadres"}`}
                </button>
                {onSent && (
                  <button
                    type="button"
                    onClick={() => void send(false)}
                    disabled={!ready || sending !== null || !target.email || Boolean(success && !success.includes("Test"))}
                  >
                    {sending === "real" ? "Versturen…" : `Verstuur → ${target.email}`}
                  </button>
                )}
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
