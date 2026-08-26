"use client";

import type { CounterpartyRule } from "@/lib/projects/types";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import styles from "./RuleList.module.css";

type ProjectOption = { id: number; name: string };

type Props = {
  rules: CounterpartyRule[];
  projects: ProjectOption[];
  onDeleted: () => void;
};

export function RuleList({ rules, projects, onDeleted }: Props) {
  const action = useAsyncAction();

  async function remove(id: number) {
    if (!window.confirm("Deze regel verwijderen?")) return;
    const result = await action.run(async () => {
      await apiRequest(`/api/projects/rules/${id}`, { method: "DELETE" });
      return true;
    }, "Regel verwijderen mislukt");
    if (result === true) onDeleted();
  }

  if (rules.length === 0) {
    return <p className={styles.empty}>Nog geen automatische regels — markeer een mutatie in het overzicht.</p>;
  }

  return (
    <ul className={styles.list}>
      {rules.map((rule) => {
        const targetLabel =
          rule.category ??
          (projects.find((project) => project.id === rule.projectId)?.name ?? "onbekend project");
        return (
          <li key={rule.id}>
            <span className={styles.pattern}>{rule.pattern}</span>
            <span className={styles.arrow}>→</span>
            <span className={styles.target}>{targetLabel}</span>
            <button type="button" disabled={action.loading} onClick={() => void remove(rule.id)}>
              Verwijderen
            </button>
          </li>
        );
      })}
    </ul>
  );
}
