"use client";

import { useEffect, useState } from "react";
import type { LineDirection, LineInput } from "@/lib/projects/types";
import type { LineSuggestion } from "@/lib/ai/projects-finance";
import { todayIso } from "@/lib/projects/period";
import { apiRequest } from "@/lib/shared/api-request";
import { CategorySelect } from "../CategorySelect/CategorySelect";
import styles from "../ImportCsvDialog/ImportCsvDialog.module.css";

type ProjectOption = { id: number; name: string; isOverhead: boolean };

type Props = {
  messageId: string;
  onClose: () => void;
  onSave: (projectId: number, input: LineInput) => void;
};

type SuggestResponse = {
  suggestion: LineSuggestion & { sourceMessageId: string };
  projects: ProjectOption[];
};

export function BookLineDialog({ messageId, onClose, onSave }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [draft, setDraft] = useState<(LineSuggestion & { sourceMessageId: string }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiRequest<SuggestResponse>("/api/ai/mail-to-line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    })
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects);
        setDraft(data.suggestion);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Suggestie ophalen mislukt");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  function submit() {
    if (!draft || !draft.name.trim() || draft.amount <= 0) return;
    const overhead = projects.find((project) => project.isOverhead);
    const projectId = draft.projectId ?? overhead?.id;
    if (!projectId) {
      setError("Geen project om op te boeken");
      return;
    }
    onSave(projectId, {
      direction: draft.direction,
      billing: "one_off",
      name: draft.name.trim(),
      amount: draft.amount,
      hours: null,
      cadence: null,
      occurredOn: draft.occurredOn ?? todayIso(),
      paidOn: null,
      vatRate: draft.vatRate,
      category: draft.direction === "expense" ? draft.category ?? "overig" : draft.category,
      endsOn: null,
      sourceMessageId: draft.sourceMessageId,
      note: draft.note,
    });
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Als uitgave boeken">
      <div className={styles.dialog}>
        <header className={styles.head}>
          <h2 className={styles.title}>Als uitgave boeken</h2>
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
        </header>
        {error && <p className={styles.error}>{error}</p>}
        {!draft ? (
          <p className={styles.hint}>{loading ? "Suggestie wordt opgesteld…" : "Laden…"}</p>
        ) : (
          <>
            <p className={styles.hint}>Controleer de suggestie. Er wordt pas opgeslagen als je bevestigt.</p>
            <label>
              Naam
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label>
              Bedrag
              <input
                inputMode="decimal"
                value={String(draft.amount)}
                onChange={(event) =>
                  setDraft({ ...draft, amount: Number(event.target.value.replace(",", ".")) || 0 })
                }
              />
            </label>
            <label>
              Richting
              <select
                value={draft.direction}
                onChange={(event) => setDraft({ ...draft, direction: event.target.value as LineDirection })}
              >
                <option value="expense">Uitgave</option>
                <option value="income">Inkomst</option>
              </select>
            </label>
            <label>
              Project
              <select
                value={draft.projectId ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, projectId: event.target.value ? Number(event.target.value) : null })
                }
              >
                <option value="">Bedrijf</option>
                {projects
                  .filter((project) => !project.isOverhead)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Categorie
              <CategorySelect
                direction={draft.direction}
                value={draft.category}
                onChange={(category) => setDraft({ ...draft, category })}
                allowEmpty={draft.direction === "income"}
              />
            </label>
            <label>
              Datum
              <input
                type="date"
                value={draft.occurredOn ?? ""}
                onChange={(event) => setDraft({ ...draft, occurredOn: event.target.value || null })}
              />
            </label>
            <div className={styles.actions}>
              <button type="button" disabled={loading || !draft.name.trim()} onClick={submit}>
                Boek regel
              </button>
              <button type="button" onClick={onClose}>
                Annuleren
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
