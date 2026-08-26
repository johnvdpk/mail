"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { ImportResult, TargetImportRow } from "@/lib/outreach/types";
import styles from "./ImportLeadsModal.module.css";

type Props = {
  campaignId: number;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
};

function asRows(parsed: unknown): { rows: TargetImportRow[]; skipped: number } {
  if (!Array.isArray(parsed)) throw new Error("JSON moet een array van leads zijn");

  const rows: TargetImportRow[] = [];
  let skipped = 0;
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    const rec = item as Record<string, unknown>;
    const email = typeof rec.email === "string" ? rec.email : "";
    const name = typeof rec.name === "string" ? rec.name : "";
    if (!email || !name) {
      skipped += 1;
      continue;
    }
    const website = typeof rec.website === "string" ? rec.website : undefined;
    const attributes =
      rec.attributes && typeof rec.attributes === "object" && !Array.isArray(rec.attributes)
        ? (rec.attributes as Record<string, unknown>)
        : {};
    rows.push({ email, name, website, attributes });
  }
  return { rows, skipped };
}

export function ImportLeadsModal({ campaignId, onClose, onImported }: Props) {
  const action = useAsyncAction();
  const [fileName, setFileName] = useState<string | null>(null);
  const [clientSkipped, setClientSkipped] = useState(0);

  async function onFile(file: File) {
    setFileName(file.name);
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Bestand is geen geldige JSON");
    }

    const { rows, skipped } = asRows(parsed);
    setClientSkipped(skipped);
    if (rows.length === 0) {
      throw new Error("Geen geldige rijen gevonden (email + name verplicht)");
    }

    const result = await apiRequest<ImportResult>(
      `/api/outreach/campaigns/${campaignId}/targets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      }
    );
    onImported({
      ...result,
      skipped: result.skipped + skipped,
      skipReasons: [
        ...(skipped ? [`${skipped} rijen zonder e-mailadres of naam overgeslagen`] : []),
        ...result.skipReasons,
      ],
    });
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <h2 className={styles.title}>Importeer leads</h2>
            <p className={styles.sub}>
              JSON-array met objecten <code>{`{ email, name, website?, attributes? }`}</code>.
              Camping-exports: map <code>scrapedEmail</code> naar <code>email</code> en extra
              velden naar <code>attributes</code> vóór je uploadt.
            </p>
          </div>
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
        </header>

        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void action.run(() => onFile(file), "Importeren mislukt");
          }}
        />

        {fileName && <p className={styles.hint}>{fileName}</p>}
        {action.loading && <p className={styles.hint}>Bezig met importeren…</p>}
        {action.error && <p className={styles.error}>{action.error}</p>}
        {clientSkipped > 0 && !action.error && (
          <p className={styles.hint}>{clientSkipped} rijen overgeslagen</p>
        )}
      </div>
    </div>
  );
}
