"use client";

import { useState } from "react";
import type { EmailConfig } from "@/lib/config/email-config-shared";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import { AccountsTab } from "./tabs/AccountsTab";
import { FormattingTab } from "./tabs/FormattingTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { SignatureTab } from "./tabs/SignatureTab";
import styles from "./MailConfigEditor.module.css";

type Tab = "algemeen" | "opmaak" | "handtekening" | "accounts";

const TABS: { id: Tab; label: string }[] = [
  { id: "algemeen", label: "Algemeen" },
  { id: "opmaak", label: "Opmaak" },
  { id: "handtekening", label: "Handtekening" },
  { id: "accounts", label: "Accounts" },
];

type Props = {
  initialConfig: EmailConfig;
  account?: string;
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
  account,
  googleConnected = false,
  googleConfigured = false,
  googleEmail,
  onGoogleStatusChange,
}: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("algemeen");
  const { run, loading: saving } = useAsyncAction();

  function updateFormatting<K extends keyof EmailConfig["formatting"]>(
    key: K,
    value: EmailConfig["formatting"][K]
  ) {
    setConfig((c) => ({
      ...c,
      formatting: { ...c.formatting, [key]: value },
    }));
  }

  function updateSignature(text: string) {
    setConfig((c) => ({
      ...c,
      signature: { ...c.signature, text },
    }));
  }

  async function save() {
    setError(null);
    setMessage(null);
    const data = await run(
      () =>
        apiRequest<EmailConfig>("/api/email-config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        }),
      "Opslaan mislukt"
    );
    if (data) {
      setConfig(data);
      setMessage("Opgeslagen");
    } else {
      setError("Opslaan mislukt");
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

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "algemeen" && (
        <GeneralTab
          config={config}
          setConfig={setConfig}
          setError={setError}
          setMessage={setMessage}
        />
      )}
      {activeTab === "opmaak" && (
        <FormattingTab config={config} onUpdateFormatting={updateFormatting} />
      )}
      {activeTab === "handtekening" && (
        <SignatureTab config={config} onUpdateSignature={updateSignature} />
      )}
      {activeTab === "accounts" && (
        <AccountsTab
          config={config}
          setConfig={setConfig}
          account={account}
          googleConnected={googleConnected}
          googleConfigured={googleConfigured}
          googleEmail={googleEmail}
          onGoogleStatusChange={onGoogleStatusChange}
          setError={setError}
          setMessage={setMessage}
        />
      )}
    </div>
  );
}
