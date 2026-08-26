"use client";

import { useState } from "react";
import type { LedgerRow, Project } from "@/lib/projects/types";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import { CategorySelect } from "../CategorySelect/CategorySelect";
import styles from "./RuleTagDialog.module.css";

type ProjectOption = { id: number; name: string; isOverhead: boolean };
type RuleKind = "category" | "project";

type Props = {
  row: LedgerRow;
  projects: ProjectOption[];
  onClose: () => void;
  onDone: () => void;
};

type ProjectResponse = { project: Project };

export function RuleTagDialog({ row, projects, onClose, onDone }: Props) {
  const action = useAsyncAction();
  const [pattern, setPattern] = useState(row.name);
  const [kind, setKind] = useState<RuleKind>("category");
  const [category, setCategory] = useState<string | null>(row.category);
  const [projectId, setProjectId] = useState<number | "">("");
  const [newProjectName, setNewProjectName] = useState("");
  const [applyExisting, setApplyExisting] = useState(true);

  const selectableProjects = projects.filter((project) => !project.isOverhead);

  async function submit() {
    if (!pattern.trim()) {
      action.setError("Patroon verplicht");
      return;
    }
    if (kind === "category" && !category?.trim()) {
      action.setError("Kies een categorie");
      return;
    }
    const result = await action.run(async () => {
      let resolvedProjectId = typeof projectId === "number" ? projectId : null;
      if (kind === "project" && resolvedProjectId == null) {
        if (!newProjectName.trim()) throw new Error("Kies een project of geef een naam op");
        const created = await apiRequest<ProjectResponse>("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newProjectName.trim(),
            clientName: "",
            description: "",
            status: "active",
            startOn: null,
            endOn: null,
          }),
        });
        resolvedProjectId = created.project.id;
      }
      const targetBody =
        kind === "category" ? { category } : { projectId: resolvedProjectId };

      await apiRequest("/api/projects/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: pattern.trim(), ...targetBody }),
      });
      await apiRequest(`/api/projects/lines/${row.lineId}/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetBody),
      });
      if (applyExisting) {
        await apiRequest("/api/projects/rules/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: pattern.trim(), ...targetBody }),
        });
      }
      return true;
    }, "Markeren mislukt");
    if (result !== true) return;
    onDone();
    onClose();
  }

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Markeer als…">
      <div className={styles.dialog}>
        <header className={styles.head}>
          <h2 className={styles.title}>Markeer als…</h2>
          <button type="button" onClick={onClose}>
            Sluiten
          </button>
        </header>
        {action.error && <p className={styles.error}>{action.error}</p>}
        <p className={styles.hint}>
          Elke toekomstige (en bestaande) mutatie met deze omschrijving krijgt dezelfde tag.
        </p>

        <label className={styles.field}>
          Omschrijving bevat
          <input value={pattern} onChange={(event) => setPattern(event.target.value)} />
        </label>

        <div className={styles.kindTabs}>
          <button
            type="button"
            className={`${styles.kindTab} ${kind === "category" ? styles.kindTabActive : ""}`}
            onClick={() => setKind("category")}
          >
            Categorie
          </button>
          <button
            type="button"
            className={`${styles.kindTab} ${kind === "project" ? styles.kindTabActive : ""}`}
            onClick={() => setKind("project")}
          >
            Project
          </button>
        </div>

        {kind === "category" ? (
          <label className={styles.field}>
            Categorie
            <CategorySelect
              direction={row.direction}
              value={category}
              onChange={setCategory}
              allowEmpty={row.direction === "income"}
            />
          </label>
        ) : (
          <>
            <label className={styles.field}>
              Bestaand project
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : "")}
              >
                <option value="">— Kies of maak nieuw hieronder —</option>
                {selectableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            {projectId === "" && (
              <label className={styles.field}>
                Of nieuw project
                <input
                  value={newProjectName}
                  placeholder="Projectnaam"
                  onChange={(event) => setNewProjectName(event.target.value)}
                />
              </label>
            )}
          </>
        )}

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={applyExisting}
            onChange={(event) => setApplyExisting(event.target.checked)}
          />
          Ook toepassen op bestaande mutaties met deze omschrijving
        </label>

        <div className={styles.actions}>
          <button type="button" disabled={action.loading} onClick={() => void submit()}>
            {action.loading ? "Opslaan…" : "Opslaan"}
          </button>
          <button type="button" onClick={onClose}>
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}
