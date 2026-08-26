"use client";

import type { EmailConfig } from "@/lib/config/email-config-shared";
import styles from "../MailConfigEditor.module.css";

type Props = {
  config: EmailConfig;
  onUpdateSignature: (text: string) => void;
};

export function SignatureTab({ config, onUpdateSignature }: Props) {
  return (
    <section className={styles.section}>
      <h3>Handtekening</h3>
      <p className={styles.subtitle}>
        Wordt automatisch onder nieuwe mails en reacties geplakt.
      </p>
      <label className={styles.field}>
        <span>Tekst</span>
        <textarea
          rows={6}
          value={config.signature.text}
          onChange={(e) => onUpdateSignature(e.target.value)}
        />
      </label>
    </section>
  );
}
