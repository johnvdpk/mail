"use client";

import { useState } from "react";
import { formatEuro, periodLabel, shiftPeriod, sumTotals } from "@/lib/projects/period";
import { marginPercent } from "@/lib/projects/insights";
import type { LineInput, PeriodQuery, PeriodView, ProjectDetail, ProjectInput, ProjectsOverview } from "@/lib/projects/types";
import { VIEW_LABELS } from "../labels";
import { CompanyFinance } from "../CompanyFinance/CompanyFinance";
import { ProjectDetail as ProjectDetailView } from "../ProjectDetail/ProjectDetail";
import { TrendPanel } from "../TrendPanel/TrendPanel";
import styles from "./ProjectsPanel.module.css";

type Props = {
  overview: ProjectsOverview | null;
  active: ProjectDetail | null;
  period: PeriodQuery;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  onChangePeriod: (period: PeriodQuery) => void;
  onSelect: (id: number) => void;
  onCreate: (input: ProjectInput) => void;
  onUpdate: (id: number, input: ProjectInput) => void;
  onDelete: (id: number) => void;
  onAddLine: (id: number, input: LineInput) => void;
  onUpdateLine: (id: number, lineId: number, input: LineInput) => void;
  onDeleteLine: (id: number, lineId: number) => void;
  onSetLinePaidMonth: (id: number, lineId: number, month: string | string[], paid: boolean) => void;
  onSetLinePaidOn: (id: number, lineId: number, paid: boolean) => void;
  onDeleteLines: (items: Array<{ projectId: number; lineId: number }>) => void;
  onImported: () => void;
  onClose: () => void;
};

export function ProjectsPanel({
  overview,
  active,
  period,
  loading,
  submitting,
  error,
  onChangePeriod,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onSetLinePaidMonth,
  onSetLinePaidOn,
  onDeleteLines,
  onImported,
  onClose,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [tab, setTab] = useState<"projects" | "company" | "trend">("projects");
  const items = overview?.projects ?? [];
  const clientProjects = items.filter((item) => !item.isOverhead);
  const overheadProject = items.find((item) => item.isOverhead);
  const totals = tab === "projects" ? sumTotals(clientProjects.map((item) => item.totals)) : overview?.totals;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>Financieel</h2>
          <p className={styles.sub}>
            Inkomsten en uitgaven per klantproject en voor je algemene bedrijfskosten. Eenmalige
            bedragen tellen mee in maand en jaar; doorlopend zie je onder Per maand.
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Terug naar mail
        </button>
      </header>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === "projects" ? styles.tabActive : ""}`}
          onClick={() => setTab("projects")}
        >
          Projecten
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "company" ? styles.tabActive : ""}`}
          onClick={() => {
            setTab("company");
            if (period.view !== "year") {
              onChangePeriod({
                view: "year",
                year: period.view === "runrate" ? new Date().getFullYear() : period.year,
              });
            }
          }}
        >
          Bedrijf
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "trend" ? styles.tabActive : ""}`}
          onClick={() => setTab("trend")}
        >
          Trend
        </button>
      </div>

      <div className={styles.period}>
        <nav aria-label="Periode">
          {(Object.keys(VIEW_LABELS) as PeriodView[]).map((view) => (
            <button
              key={view}
              type="button"
              className={period.view === view ? styles.periodActive : undefined}
              onClick={() => {
                if (view === "runrate") onChangePeriod({ view: "runrate" });
                else if (view === "year") {
                  onChangePeriod({
                    view: "year",
                    year: period.view === "runrate" ? new Date().getFullYear() : period.year,
                  });
                } else {
                  const now = new Date();
                  onChangePeriod({
                    view: "month",
                    year: period.view === "month" ? period.year : now.getFullYear(),
                    month: period.view === "month" ? period.month : now.getMonth() + 1,
                  });
                }
              }}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </nav>
        {period.view !== "runrate" && (
          <div className={styles.shift}>
            <button type="button" onClick={() => onChangePeriod(shiftPeriod(period, -1))} aria-label="Vorige">
              ‹
            </button>
            <span>{periodLabel(period)}</span>
            <button type="button" onClick={() => onChangePeriod(shiftPeriod(period, 1))} aria-label="Volgende">
              ›
            </button>
          </div>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <dl className={styles.totals}>
        <div className={styles.total}>
          <dt>Inkomsten</dt>
          <dd className={styles.income}>{formatEuro(totals?.income ?? 0)}</dd>
          {(totals?.openIncome ?? 0) > 0 && (
            <span className={styles.itemMeta}>waarvan open: {formatEuro(totals?.openIncome ?? 0)}</span>
          )}
        </div>
        <div className={styles.total}>
          <dt>Uitgaven</dt>
          <dd className={styles.expense}>{formatEuro(totals?.expense ?? 0)}</dd>
          {(totals?.openExpense ?? 0) > 0 && (
            <span className={styles.itemMeta}>waarvan open: {formatEuro(totals?.openExpense ?? 0)}</span>
          )}
        </div>
        <div className={styles.total}>
          <dt>Marge</dt>
          <dd className={(totals?.margin ?? 0) < 0 ? styles.expense : styles.income}>
            {formatEuro(totals?.margin ?? 0)}
          </dd>
        </div>
        <div className={styles.total}>
          <dt>BTW</dt>
          <dd>{formatEuro((totals?.vatIncome ?? 0) - (totals?.vatExpense ?? 0))}</dd>
          <span className={styles.itemMeta}>
            {formatEuro(totals?.vatIncome ?? 0)} te ontvangen / {formatEuro(totals?.vatExpense ?? 0)} te betalen
          </span>
        </div>
      </dl>

      {tab === "trend" ? (
        <TrendPanel year={period.view === "runrate" ? new Date().getFullYear() : period.year} />
      ) : tab === "company" ? (
        <CompanyFinance
          period={period}
          ledger={overview?.ledger ?? []}
          expenseCategories={overview?.expenseCategories ?? []}
          incomeCategories={overview?.incomeCategories ?? []}
          projects={items}
          overheadId={overheadProject?.id ?? null}
          submitting={submitting}
          onAddLine={onAddLine}
          onSetLinePaidMonth={onSetLinePaidMonth}
          onSetLinePaidOn={onSetLinePaidOn}
          onDeleteLines={onDeleteLines}
          onImported={onImported}
        />
      ) : (
      <div className={styles.grid}>
        <section className={styles.listPane} aria-label="Projecten">
          {creating ? (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                if (!newName.trim()) return;
                onCreate({
                  name: newName.trim(),
                  clientName: newClient.trim(),
                  description: newDescription.trim(),
                  status: "active",
                  startOn: null,
                  endOn: null,
                });
                setNewName("");
                setNewClient("");
                setNewDescription("");
                setCreating(false);
              }}
            >
              <input
                value={newName}
                placeholder="Projectnaam"
                onChange={(event) => setNewName(event.target.value)}
                autoFocus
              />
              <input
                value={newClient}
                placeholder="Klant (optioneel)"
                onChange={(event) => setNewClient(event.target.value)}
              />
              <textarea
                value={newDescription}
                placeholder="Wat houdt dit project in?"
                rows={3}
                onChange={(event) => setNewDescription(event.target.value)}
              />
              <div className={styles.actions}>
                <button type="submit" disabled={submitting || !newName.trim()}>
                  {submitting ? "Aanmaken…" : "Project aanmaken"}
                </button>
                <button type="button" onClick={() => setCreating(false)}>
                  Annuleren
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setCreating(true)}>
              + Nieuw project
            </button>
          )}

          {loading && clientProjects.length === 0 ? (
            <p className={styles.empty}>Laden…</p>
          ) : clientProjects.length === 0 && !creating ? (
            <p className={styles.emptyState}>
              Hier volg je inkomsten en uitgaven per klant. Begin met een nieuw project.
            </p>
          ) : (
            <ul className={styles.list}>
              {clientProjects.map((item) => {
                const margin = marginPercent(item.totals);
                return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${active?.id === item.id ? styles.itemActive : ""}`}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className={styles.itemTitle}>{item.name}</span>
                    <span className={styles.itemMeta}>
                      {item.clientName || "Geen klant"}
                      {item.status === "done" ? " · klaar" : ""}
                    </span>
                    <span className={styles.itemMeta}>
                      {formatEuro(item.totals.income)} in · {formatEuro(item.totals.expense)} uit
                      {margin != null ? ` · ${margin}% marge` : ""}
                    </span>
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.detailPane} aria-label="Projectdetail">
          {!active || active.isOverhead ? (
            <p className={styles.empty}>Kies een project of maak er een aan.</p>
          ) : (
            <ProjectDetailView
              project={active}
              submitting={submitting}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddLine={onAddLine}
              onUpdateLine={onUpdateLine}
              onDeleteLine={onDeleteLine}
              onSetLinePaidMonth={onSetLinePaidMonth}
              period={period}
            />
          )}
        </section>
      </div>
      )}
    </div>
  );
}
