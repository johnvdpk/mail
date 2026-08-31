"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import {
  TARGET_STATUS_LABELS,
  type AttributeFilter,
  type AutomailFilters,
  type AutomailLogEntry,
  type AutomailRule,
  type Campaign,
  type TargetStatus,
} from "@/lib/outreach/types";
import styles from "./AutomailPanel.module.css";

type Props = {
  campaign: Campaign;
};

const STATUS_OPTIONS: TargetStatus[] = ["new", "emailed", "excluded", "not_interested"];

function rangeOf(filter: AttributeFilter | undefined): { min?: number; max?: number } {
  return filter?.type === "range" ? filter : {};
}

function valuesOf(filter: AttributeFilter | undefined): string[] {
  return filter?.type === "in" ? filter.values : [];
}

export function AutomailPanel({ campaign }: Props) {
  const [sentToday, setSentToday] = useState(0);
  const [log, setLog] = useState<AutomailLogEntry[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [dailyCount, setDailyCount] = useState(4);
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  const [statusFilter, setStatusFilter] = useState<TargetStatus>("new");
  const [filters, setFilters] = useState<AutomailFilters>({});
  const [saved, setSaved] = useState(false);

  const loadAction = useAsyncAction();
  const saveAction = useAsyncAction();
  const loadRun = loadAction.run;

  const applyRule = useCallback((rule: AutomailRule) => {
    setEnabled(rule.enabled);
    setDailyCount(rule.dailyCount);
    setWindowStart(rule.windowStart);
    setWindowEnd(rule.windowEnd);
    setStatusFilter(rule.statusFilter);
    setFilters(rule.filters);
  }, []);

  const load = useCallback(async () => {
    await loadRun(async () => {
      const data = await apiRequest<{ rule: AutomailRule; sentToday: number; log: AutomailLogEntry[] }>(
        `/api/outreach/campaigns/${campaign.id}/automail`
      );
      setSentToday(data.sentToday);
      setLog(data.log);
      applyRule(data.rule);
    }, "Automail-status ophalen mislukt");
  }, [campaign.id, loadRun, applyRule]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaved(false);
    const data = await saveAction.run(
      () =>
        apiRequest<{ rule: AutomailRule }>(`/api/outreach/campaigns/${campaign.id}/automail`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled, dailyCount, windowStart, windowEnd, statusFilter, filters }),
        }),
      "Automail-regel opslaan mislukt"
    );
    if (!data) return;
    applyRule(data.rule);
    setSaved(true);
  }

  function updateRange(key: string, part: "min" | "max", raw: string) {
    setFilters((prev) => {
      const current = rangeOf(prev[key]);
      const value = raw === "" ? undefined : Number(raw);
      return { ...prev, [key]: { type: "range", ...current, [part]: value } };
    });
  }

  function toggleValue(key: string, value: string) {
    setFilters((prev) => {
      const current = valuesOf(prev[key]);
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      const copy = { ...prev };
      if (next.length === 0) delete copy[key];
      else copy[key] = { type: "in", values: next };
      return copy;
    });
  }

  const error = loadAction.error || saveAction.error;

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Verstuurt elke dag automatisch een klein aantal leads uit de gekozen categorie: personaliseert
        met AI en verzendt zonder handmatige review, verspreid over het tijdvenster.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <label className={enabled ? styles.enabledRow : styles.toggleRow}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {enabled ? "Automail staat AAN voor deze campagne" : "Automail staat uit"}
      </label>

      <div className={styles.grid}>
        <label className={styles.field}>
          Aantal per dag
          <input
            type="number"
            min={1}
            max={50}
            value={dailyCount}
            onChange={(e) => setDailyCount(Number(e.target.value))}
          />
        </label>
        <label className={styles.field}>
          Vanaf
          <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
        </label>
        <label className={styles.field}>
          Tot
          <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
        </label>
        <label className={styles.field}>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TargetStatus)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {TARGET_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {campaign.profile.listColumns.length > 0 && (
        <div className={styles.filters}>
          <h3 className={styles.filtersTitle}>Categorie</h3>
          {campaign.profile.listColumns.map((col) => {
            const filter = filters[col.key];
            return (
              <div key={col.key} className={styles.filterRow}>
                <span className={styles.filterLabel}>{col.label}</span>
                {col.values ? (
                  <div className={styles.chips}>
                    {Object.entries(col.values).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={valuesOf(filter).includes(value) ? styles.chipActive : styles.chip}
                        onClick={() => toggleValue(col.key, value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.rangeInputs}>
                    <input
                      type="number"
                      placeholder="Min"
                      value={rangeOf(filter).min ?? ""}
                      onChange={(e) => updateRange(col.key, "min", e.target.value)}
                    />
                    <span>–</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={rangeOf(filter).max ?? ""}
                      onChange={(e) => updateRange(col.key, "max", e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" onClick={() => void save()} disabled={saveAction.loading}>
          {saveAction.loading ? "Opslaan…" : "Opslaan"}
        </button>
        {saved && <span className={styles.saved}>Opgeslagen</span>}
        <span className={styles.progress}>
          Vandaag verzonden: {sentToday} / {dailyCount}
        </span>
      </div>

      <div className={styles.log}>
        <h3 className={styles.filtersTitle}>Recente activiteit</h3>
        {log.length === 0 ? (
          <p className={styles.empty}>Nog geen automail-activiteit.</p>
        ) : (
          <ul className={styles.logList}>
            {log.map((entry) => (
              <li key={entry.id} className={styles.logItem}>
                <span className={entry.status === "sent" ? styles.logSent : styles.logError}>
                  {entry.status === "sent" ? "Verzonden" : "Fout"}
                </span>
                <span>{entry.targetName ?? "onbekende lead"}</span>
                <span className={styles.logTime}>{new Date(entry.createdAt).toLocaleString("nl-NL")}</span>
                {entry.message && <span className={styles.logMessage}>{entry.message}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
