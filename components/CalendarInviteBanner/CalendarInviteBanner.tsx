"use client";

import { useState } from "react";
import type { CalendarInvite } from "@/lib/ics";
import styles from "./CalendarInviteBanner.module.css";

type Props = {
  invite: CalendarInvite;
  folder: string;
  uid: number;
  googleConnected: boolean;
  googleConfigured: boolean;
};

export function CalendarInviteBanner({
  invite,
  folder,
  uid,
  googleConnected,
  googleConfigured,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function addToGoogle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, uid, invite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Toevoegen mislukt");
      setLink(typeof data.htmlLink === "string" ? data.htmlLink : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Toevoegen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.banner}>
      <p className={styles.label}>Agenda-uitnodiging</p>
      <p className={styles.title}>{invite.summary}</p>
      <p className={styles.meta}>{formatWhen(invite)}</p>
      {invite.location && <p className={styles.meta}>{invite.location}</p>}
      {invite.url && (
        <a className={styles.link} href={invite.url} target="_blank" rel="noopener noreferrer">
          Meeting-link openen
        </a>
      )}

      <div className={styles.actions}>
        {!googleConfigured ? (
          <p className={styles.hint}>
            Google Calendar nog niet geconfigureerd (env).
          </p>
        ) : !googleConnected ? (
          <p className={styles.hint}>
            Koppel eerst Google Agenda in Instellingen — uitnodigingen worden niet automatisch geaccepteerd.
          </p>
        ) : link ? (
          <a className={styles.link} href={link} target="_blank" rel="noopener noreferrer">
            Geopend in Google Agenda
          </a>
        ) : (
          <button type="button" className={styles.primary} onClick={() => void addToGoogle()} disabled={busy}>
            {busy ? "Bezig…" : "Zet in Google Agenda"}
          </button>
        )}
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

function formatWhen(invite: CalendarInvite): string {
  const start = new Date(invite.allDay ? `${invite.start}T12:00:00` : invite.start);
  if (Number.isNaN(start.getTime())) return invite.start;

  if (invite.allDay) {
    return start.toLocaleDateString("nl-NL", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  };

  if (!invite.end) return start.toLocaleString("nl-NL", opts);

  const end = new Date(invite.end);
  if (Number.isNaN(end.getTime())) return start.toLocaleString("nl-NL", opts);

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return `${start.toLocaleString("nl-NL", opts)} – ${end.toLocaleTimeString("nl-NL", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return `${start.toLocaleString("nl-NL", opts)} – ${end.toLocaleString("nl-NL", opts)}`;
}
