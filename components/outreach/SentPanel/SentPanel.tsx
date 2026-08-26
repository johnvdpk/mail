"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { ReplyIntent } from "@/lib/outreach/campaign-profile";
import { RESPONSE_LABELS, type CampaignSendListItem, type ResponseStatus } from "@/lib/outreach/types";
import styles from "./SentPanel.module.css";

type Props = {
  campaignId: number;
  aiReady: boolean;
  onOpenThread?: (inboxMessageId: string, replyDraft?: string) => void;
};

const STATUS_OPTIONS: ResponseStatus[] = ["pending", "replied", "no_interest", "deal"];

export function SentPanel({ campaignId, aiReady, onOpenThread }: Props) {
  const [sends, setSends] = useState<CampaignSendListItem[]>([]);
  const loadAction = useAsyncAction();
  const statusAction = useAsyncAction();
  const draftAction = useAsyncAction();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [draftingId, setDraftingId] = useState<string | null>(null);

  const loadRun = loadAction.run;
  const load = useCallback(async () => {
    await loadRun(async () => {
      const data = await apiRequest<{ sends: CampaignSendListItem[] }>(
        `/api/outreach/campaigns/${campaignId}/sends`
      );
      setSends(data.sends);
    }, "Verzonden mails ophalen mislukt");
  }, [campaignId, loadRun]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchStatus(sendId: number, responseStatus: ResponseStatus) {
    const data = await statusAction.run(
      () =>
        apiRequest<{ send: CampaignSendListItem }>(`/api/outreach/campaigns/${campaignId}/sends`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sendId, responseStatus }),
        }),
      "Status bijwerken mislukt"
    );
    if (!data?.send) return;
    setSends((prev) => prev.map((s) => (s.id === sendId ? { ...s, ...data.send } : s)));
  }

  async function draftReply(send: CampaignSendListItem, intent: ReplyIntent) {
    setDraftingId(`${send.id}:${intent}`);
    const data = await draftAction.run(
      () =>
        apiRequest<{ body: string }>(
          `/api/outreach/campaigns/${campaignId}/sends/${send.id}/reply-draft`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ intent }),
          }
        ),
      "Reply-concept genereren mislukt"
    );
    setDraftingId(null);
    if (!data?.body) return;
    setDrafts((prev) => ({ ...prev, [send.id]: data.body }));
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <p className={styles.count}>{sends.length} verzonden</p>
        <button type="button" onClick={() => void load()} disabled={loadAction.loading}>
          {loadAction.loading ? "Laden…" : "Vernieuwen"}
        </button>
      </div>
      {(loadAction.error || statusAction.error || draftAction.error) && (
        <p className={styles.error}>{loadAction.error || statusAction.error || draftAction.error}</p>
      )}
      {sends.length === 0 && !loadAction.loading ? (
        <p className={styles.empty}>Nog geen verzonden outreach-mails.</p>
      ) : (
        <ul className={styles.list}>
          {sends.map((send) => (
            <li key={send.id} className={styles.item}>
              <div className={styles.itemHead}>
                <strong>{send.targetName}</strong>
                <span className={styles.badge}>{RESPONSE_LABELS[send.responseStatus]}</span>
              </div>
              <p className={styles.meta}>
                {send.targetEmail} · {new Date(send.sentAt).toLocaleString("nl-NL")}
                {send.isTest ? " · test" : ""}
              </p>
              <p className={styles.subject}>{send.subject}</p>
              <div className={styles.actions}>
                <select
                  value={send.responseStatus}
                  disabled={send.isTest}
                  onChange={(e) => void patchStatus(send.id, e.target.value as ResponseStatus)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {RESPONSE_LABELS[status]}
                    </option>
                  ))}
                </select>
                {send.inboxMessageId && onOpenThread && (
                  <button type="button" onClick={() => onOpenThread(send.inboxMessageId!)}>
                    Open thread
                  </button>
                )}
                {aiReady && send.responseStatus === "replied" && (
                  <>
                    <button
                      type="button"
                      disabled={draftingId !== null}
                      onClick={() => void draftReply(send, "afronden")}
                    >
                      {draftingId === `${send.id}:afronden` ? "Bezig…" : "Genereer reply: afronden"}
                    </button>
                    <button
                      type="button"
                      disabled={draftingId !== null}
                      onClick={() => void draftReply(send, "opvolging")}
                    >
                      {draftingId === `${send.id}:opvolging` ? "Bezig…" : "Genereer reply: opvolging"}
                    </button>
                  </>
                )}
              </div>
              {drafts[send.id] && (
                <div className={styles.draft}>
                  <pre>{drafts[send.id]}</pre>
                  {send.inboxMessageId && onOpenThread && (
                    <button
                      type="button"
                      onClick={() => onOpenThread(send.inboxMessageId!, drafts[send.id])}
                    >
                      Open in antwoordveld
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
