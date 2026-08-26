"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { EmailAccount, EmailConfig } from "@/lib/config/email-config-shared";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import styles from "../MailConfigEditor.module.css";

type MailAccountStatus = {
  id: string;
  email: string;
  label: string;
  active: boolean;
  configured: boolean;
};

type Props = {
  config: EmailConfig;
  setConfig: Dispatch<SetStateAction<EmailConfig>>;
  account?: string;
  googleConnected?: boolean;
  googleConfigured?: boolean;
  googleEmail?: string;
  onGoogleStatusChange?: (status: {
    connected: boolean;
    configured: boolean;
    email?: string;
  }) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
};

export function AccountsTab({
  config,
  setConfig,
  account,
  googleConnected = false,
  googleConfigured = false,
  googleEmail,
  onGoogleStatusChange,
  setError,
  setMessage,
}: Props) {
  const [gConnected, setGConnected] = useState(googleConnected);
  const [gConfigured, setGConfigured] = useState(googleConfigured);
  const [gEmail, setGEmail] = useState(googleEmail);
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [mailAccounts, setMailAccounts] = useState<MailAccountStatus[]>([]);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const { run: runSwitch } = useAsyncAction();
  const { run: runGoogle, loading: gBusy } = useAsyncAction();

  useEffect(() => {
    setGConnected(googleConnected);
    setGConfigured(googleConfigured);
    setGEmail(googleEmail);
  }, [googleConnected, googleConfigured, googleEmail]);

  useEffect(() => {
    void refreshGoogle();
    void loadMailAccounts();
  }, []);

  async function loadMailAccounts() {
    try {
      const data = await apiRequest<{ accounts?: MailAccountStatus[] }>("/api/mail-account");
      setMailAccounts(data.accounts ?? []);
    } catch {
      // ignore initial load errors
    }
  }

  async function switchMailAccount(id: string) {
    setSwitchingAccountId(id);
    setError(null);
    setMessage(null);
    const data = await runSwitch(
      () =>
        apiRequest<{ accounts: MailAccountStatus[] }>("/api/mail-account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
      "Wisselen mislukt"
    );
    if (data) {
      setMailAccounts(data.accounts ?? []);
      setMessage("Actief e-mailadres gewisseld. Herlaad de pagina om de mailbox te synchroniseren.");
    } else {
      setError("Wisselen mislukt");
    }
    setSwitchingAccountId(null);
  }

  async function refreshGoogle() {
    try {
      const data = await apiRequest<{
        connected?: boolean;
        configured?: boolean;
        email?: string;
      }>("/api/google/status");
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
      // ignore status refresh errors
    }
  }

  async function disconnectGoogle() {
    setError(null);
    const data = await runGoogle(
      () => apiRequest<{ ok?: boolean }>("/api/google/disconnect", { method: "POST" }),
      "Ontkoppelen mislukt"
    );
    if (data) {
      setGConnected(false);
      setGEmail(undefined);
      onGoogleStatusChange?.({ connected: false, configured: gConfigured });
      setMessage("Google Agenda ontkoppeld");
    } else {
      setError("Ontkoppelen mislukt");
    }
  }

  function addAccount() {
    const email = newAccountEmail.trim();
    if (!email) return;
    setConfig((c) => ({
      ...c,
      accounts: [...c.accounts, { email, label: newAccountLabel.trim() || undefined }],
    }));
    setNewAccountEmail("");
    setNewAccountLabel("");
  }

  function removeAccount(index: number) {
    setConfig((c) => ({
      ...c,
      accounts: c.accounts.filter((_, i) => i !== index),
    }));
  }

  return (
    <>
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
            <p className={styles.ok}>Gekoppeld{gEmail ? `: ${gEmail}` : ""}</p>
            <button type="button" onClick={() => void disconnectGoogle()} disabled={gBusy}>
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
        <h3>E-mailadres wisselen</h3>
        <p className={styles.subtitle}>
          Kies met welk e-mailadres je verstuurt en ontvangt. Huidig actief: {account ?? "onbekend"}.
          Na het wisselen wordt de mailbox van het gekozen adres gesynchroniseerd.
        </p>
        {mailAccounts.map((acc) => (
          <div key={acc.id} className={styles.googleRow}>
            <p className={styles.metaLine}>
              {acc.email} ({acc.label}){acc.active ? " — actief" : ""}
              {!acc.configured ? " — niet geconfigureerd" : ""}
            </p>
            {!acc.active && (
              <button
                type="button"
                disabled={!acc.configured || switchingAccountId === acc.id}
                onClick={() => void switchMailAccount(acc.id)}
              >
                {switchingAccountId === acc.id ? "Bezig…" : "Wissel naar dit account"}
              </button>
            )}
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>Extra e-mailadressen</h3>
        </div>
        <p className={styles.subtitle}>
          Voeg extra adressen toe die je later aan dit mailprogramma wilt koppelen.
        </p>
        {config.accounts.map((acc: EmailAccount, index) => (
          <div key={`${acc.email}-${index}`} className={styles.googleRow}>
            <p className={styles.metaLine}>
              {acc.email}
              {acc.label ? ` (${acc.label})` : ""}
            </p>
            <button type="button" onClick={() => removeAccount(index)}>
              Verwijderen
            </button>
          </div>
        ))}
        <div className={styles.googleRow}>
          <input
            type="email"
            placeholder="naam@bedrijf.nl"
            value={newAccountEmail}
            onChange={(e) => setNewAccountEmail(e.target.value)}
          />
          <input
            type="text"
            placeholder="Label (optioneel)"
            value={newAccountLabel}
            onChange={(e) => setNewAccountLabel(e.target.value)}
          />
          <button type="button" onClick={addAccount}>
            + Toevoegen
          </button>
        </div>
      </section>
    </>
  );
}
