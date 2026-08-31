"use client";

import { useEffect, useState } from "react";
import type {
  CategoryShare,
  CounterpartyRule,
  LedgerRow,
  LineDirection,
  LineInput,
  PeriodQuery,
  VatQuarter,
} from "@/lib/projects/types";
import { apiRequest } from "@/lib/shared/api-request";
import { CategoryBreakdown } from "../CategoryBreakdown/CategoryBreakdown";
import { CategoryManager } from "../CategoryManager/CategoryManager";
import { ImportCsvDialog } from "../ImportCsvDialog/ImportCsvDialog";
import { LedgerPanel } from "../LedgerPanel/LedgerPanel";
import { ProjectLineForm } from "../ProjectLineForm/ProjectLineForm";
import { RuleList } from "../RuleList/RuleList";
import { VatOverview } from "../VatOverview/VatOverview";
import { DIRECTION_LABELS } from "../labels";
import styles from "../ProjectsPanel/ProjectsPanel.module.css";

type ProjectOption = { id: number; name: string; isOverhead: boolean };

type Props = {
  period: PeriodQuery;
  ledger: LedgerRow[];
  expenseCategories: CategoryShare[];
  incomeCategories: CategoryShare[];
  projects: ProjectOption[];
  overheadId: number | null;
  submitting: boolean;
  onAddLine: (id: number, input: LineInput) => void;
  onSetLinePaidMonth: (id: number, lineId: number, month: string | string[], paid: boolean) => void;
  onSetLinePaidOn: (id: number, lineId: number, paid: boolean) => void;
  onDeleteLines: (items: Array<{ projectId: number; lineId: number }>) => void;
  onImported: () => void;
};

type VatResponse = { year: number; quarters: VatQuarter[] };
type RulesResponse = { rules: CounterpartyRule[] };

function periodYear(period: PeriodQuery): number {
  if (period.view === "runrate") return new Date().getFullYear();
  return period.year;
}

export function CompanyFinance({
  period,
  ledger,
  expenseCategories,
  incomeCategories,
  projects,
  overheadId,
  submitting,
  onAddLine,
  onSetLinePaidMonth,
  onSetLinePaidOn,
  onDeleteLines,
  onImported,
}: Props) {
  const [quarters, setQuarters] = useState<VatQuarter[]>([]);
  const [rules, setRules] = useState<CounterpartyRule[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [adding, setAdding] = useState<LineDirection | null>(null);
  const year = periodYear(period);

  function loadRules() {
    void apiRequest<RulesResponse>("/api/projects/rules")
      .then((data) => setRules(data.rules))
      .catch(() => setRules([]));
  }

  useEffect(() => {
    let cancelled = false;
    void apiRequest<VatResponse>(`/api/projects/vat?year=${year}`)
      .then((data) => {
        if (!cancelled) setQuarters(data.quarters);
      })
      .catch(() => {
        if (!cancelled) setQuarters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(loadRules, []);

  async function toggleFiling(quarter: 1 | 2 | 3 | 4, filed: boolean) {
    try {
      await apiRequest(`/api/projects/vat/${year}/${quarter}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filed }),
      });
      const data = await apiRequest<VatResponse>(`/api/projects/vat?year=${year}`);
      setQuarters(data.quarters);
    } catch {
      // Filing status is a soft bookkeeping marker; a failed toggle just leaves the UI unchanged.
    }
  }

  async function exportCsv() {
    const res = await fetch(`/api/projects/export?year=${year}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `financieel-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.companyExtras}>
      {period.view === "month" && (
        <p className={styles.emptyState}>
          Je ziet nu alleen deze maand. Kies <strong>Dit jaar</strong> voor het totaaloverzicht van
          alle bankmutaties en handmatige regels.
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" onClick={() => void exportCsv()}>
          Exporteer CSV
        </button>
        <button type="button" onClick={() => setImportOpen(true)}>
          Importeer bank-CSV
        </button>
      </div>

      <section>
        <h3 className={styles.sectionTitle}>Totaaloverzicht baten en lasten</h3>
        <LedgerPanel
          rows={ledger}
          projects={projects}
          submitting={submitting}
          onSetLinePaidMonth={onSetLinePaidMonth}
          onSetLinePaidOn={onSetLinePaidOn}
          onDelete={onDeleteLines}
          onReload={() => {
            loadRules();
            onImported();
          }}
        />
      </section>

      {overheadId != null && (
        <section>
          {adding ? (
            <ProjectLineForm
              direction={adding}
              submitting={submitting}
              onSubmit={(input) => {
                onAddLine(overheadId, input);
                setAdding(null);
              }}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <div className={styles.actions}>
              <button type="button" onClick={() => setAdding("income")}>
                + {DIRECTION_LABELS.income}
              </button>
              <button type="button" onClick={() => setAdding("expense")}>
                + {DIRECTION_LABELS.expense}
              </button>
            </div>
          )}
        </section>
      )}

      <section>
        <h3 className={styles.sectionTitle}>Categorieën beheren</h3>
        <CategoryManager />
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Kosten per categorie</h3>
        <CategoryBreakdown items={expenseCategories} emptyLabel="Nog geen uitgaven met categorie in deze periode." />
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Baten per categorie</h3>
        <CategoryBreakdown items={incomeCategories} emptyLabel="Nog geen inkomsten met categorie in deze periode." />
      </section>

      <section>
        <h3 className={styles.sectionTitle}>Automatische regels</h3>
        <RuleList rules={rules} projects={projects} onDeleted={loadRules} />
      </section>

      <section>
        <h3 className={styles.sectionTitle}>BTW per kwartaal ({year})</h3>
        <VatOverview quarters={quarters} onToggleFiling={(quarter, filed) => void toggleFiling(quarter, filed)} />
      </section>

      {importOpen && (
        <ImportCsvDialog
          projects={projects}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            onImported();
          }}
        />
      )}
    </div>
  );
}
