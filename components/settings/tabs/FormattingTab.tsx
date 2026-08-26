"use client";

import type { EmailConfig } from "@/lib/config/email-config-shared";
import { FONT_FAMILY_OPTIONS } from "@/lib/config/email-config-shared";
import styles from "../MailConfigEditor.module.css";

type Props = {
  config: EmailConfig;
  onUpdateFormatting: <K extends keyof EmailConfig["formatting"]>(
    key: K,
    value: EmailConfig["formatting"][K]
  ) => void;
};

export function FormattingTab({ config, onUpdateFormatting }: Props) {
  return (
    <section className={styles.section}>
      <h3>Opmaak</h3>
      <p className={styles.subtitle}>
        Standaard lettertype en tekstgrootte voor nieuwe mails en drafts.
      </p>
      <label className={styles.field}>
        <span>Lettertype</span>
        <select
          value={config.formatting.fontFamily}
          onChange={(e) => onUpdateFormatting("fontFamily", e.target.value)}
        >
          {FONT_FAMILY_OPTIONS.map((font) => (
            <option key={font} value={font} style={{ fontFamily: font }}>
              {font.split(",")[0]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.field}>
        <span>Tekstgrootte (px)</span>
        <input
          type="number"
          min={10}
          max={24}
          value={config.formatting.fontSize}
          onChange={(e) => onUpdateFormatting("fontSize", Number(e.target.value) || 15)}
        />
      </label>
      <p
        className={styles.metaLine}
        style={{
          fontFamily: config.formatting.fontFamily,
          fontSize: `${config.formatting.fontSize}px`,
        }}
      >
        Voorbeeld: zo ziet de tekst van je mail eruit.
      </p>
    </section>
  );
}
