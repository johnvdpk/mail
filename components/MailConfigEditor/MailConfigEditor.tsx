"use client";

import { useEffect, useState } from "react";
import type { EmailConfig, QuickReplyTemplate } from "@/lib/email-config";
import styles from "./MailConfigEditor.module.css";

type Props = {
  initialConfig: EmailConfig;
  googleConnected?: boolean;
  googleConfigured?: boolean;
  googleEmail?: string;
  onGoogleStatusChange?: (status: {
    connected: boolean;
    configured: boolean;
    email?: string;
  }) => void;
};

export function MailConfigEditor({
  initialConfig,
  googleConnected = false,
  googleConfigured = false,
  googleEmail,
  onGoogleStatusChange,
}: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gConnected, setGConnected] = useState(googleConnected);
  const [gConfigured, setGConfigured] = useState(googleConfigured);
  const [gEmail, setGEmail] = useState(googleEmail);
  const [gBusy, setGBusy] = useState(false);

  useEffect(() => {
    setGConnected(googleConnected);
    setGConfigured(googleConfigured);
    setGEmail(googleEmail);
  }, [googleConnected, googleConfigured, googleEmail]);

  useEffect(() => {
    void refreshGoogle();
  }, []);

  async function refreshGoogle() {
    try {
      const res = await fetch("/api/google/status");
      const data = await res.json();
      const next = {
        connected: Boolean(data.connected),
        configured: Boolean(data.configured),
        email: typeof data.email === "string" ? data.email : undefined,
      };
      setGConnected(next.connected);
      setGConfigured(next.configured);
      setGEmail(next.email);
      onGoogleStatusChange?.(next);
    } catch {
      // ignore
    }
  }

  async function disconnectGoogle() {
    setGBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/google/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ontkoppelen mislukt");
      setGConnected(false);
      setGEmail(undefined);
      onGoogleStatusChange?.({ connected: false, configured: gConfigured });
      setMessage("Google Agenda ontkoppeld");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ontkoppelen mislukt");
    } finally {
      setGBusy(false);
    }
  }

  function updateTone<K extends keyof EmailConfig["toneOfVoice"]>(
    key: K,
    value: EmailConfig["toneOfVoice"][K]
  ) {
    setConfig((c) => ({
      ...c,
      toneOfVoice: { ...c.toneOfVoice, [key]: value },
    }));
  }

  function updateAbout<K extends keyof EmailConfig["aboutMe"]>(
    key: K,
    value: EmailConfig["aboutMe"][K]
  ) {
    setConfig((c) => ({
      ...c,
      aboutMe: { ...c.aboutMe, [key]: value },
    }));
  }

  function updateReply(index: number, patch: Partial<QuickReplyTemplate>) {
    setConfig((c) => ({
      ...c,
      replies: c.replies.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/email-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Opslaan mislukt");
      setConfig(data);
      setMessage("Opgeslagen");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Tone of voice & quick replies</h2>
          <p className={styles.subtitle}>
            De AI gebruikt dit bij drafts, spelling-check en tips.
          </p>
        </div>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Opslaan…" : "Opslaan"}
        </button>
      </div>

      {message && <p className={styles.ok}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.section}>
        <h3>Google Agenda</h3>
        <p className={styles.subtitle}>
          Uitnodigingen worden niet automatisch geaccepteerd. Je zet ze zelf in je agenda.
        </p>
        {!gConfigured ? (
          <p className={styles.subtitle}>
            Zet GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET en GOOGLE_REDIRECT_URI in .env.local.
          </p>
        ) : gConnected ? (
          <div className={styles.googleRow}>
            <p className={styles.ok}>
              Gekoppeld{gEmail ? `: ${gEmail}` : ""}
            </p>
            <button
              type="button"
              onClick={() => void disconnectGoogle()}
              disabled={gBusy}
            >
              {gBusy ? "Bezig…" : "Ontkoppelen"}
            </button>
          </div>
        ) : (
          <a className={styles.saveBtn} href="/api/google/connect">
            Koppel Google Agenda
          </a>
        )}
      </section>

      <section className={styles.section}>
        <h3>Tone of voice</h3>
        <label className={styles.field}>
          <span>Regels</span>
          <textarea
            rows={8}
            value={config.toneOfVoice.rules}
            onChange={(e) => updateTone("rules", e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Vermijd woorden</span>
          <input
            value={config.toneOfVoice.avoidWords}
            onChange={(e) => updateTone("avoidWords", e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Max woorden</span>
          <input
            type="number"
            value={config.toneOfVoice.maxWords}
            onChange={(e) => updateTone("maxWords", Number(e.target.value) || 180)}
          />
        </label>
      </section>

      <section className={styles.section}>
        <h3>Over mij</h3>
        <label className={styles.field}>
          <span>Intro</span>
          <textarea
            rows={3}
            value={config.aboutMe.intro}
            onChange={(e) => updateAbout("intro", e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span>Achtergrond</span>
          <textarea
            rows={3}
            value={config.aboutMe.background}
            onChange={(e) => updateAbout("background", e.target.value)}
          />
        </label>
      </section>

      <section className={styles.section}>
        <h3>Quick reply knoppen</h3>
        {config.replies.map((reply, index) => (
          <div key={reply.id} className={styles.replyCard}>
            <label className={styles.field}>
              <span>Label</span>
              <input
                value={reply.label}
                onChange={(e) => updateReply(index, { label: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Hint</span>
              <input
                value={reply.hint ?? ""}
                onChange={(e) => updateReply(index, { hint: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>Template</span>
              <textarea
                rows={4}
                value={reply.text}
                onChange={(e) => updateReply(index, { text: e.target.value })}
              />
            </label>
            <label className={styles.field}>
              <span>AI-noot</span>
              <textarea
                rows={2}
                value={reply.personalNote}
                onChange={(e) => updateReply(index, { personalNote: e.target.value })}
              />
            </label>
          </div>
        ))}
      </section>
    </div>
  );
}
