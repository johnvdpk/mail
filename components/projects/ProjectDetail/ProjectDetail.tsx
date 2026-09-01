"use client";

import { useEffect, useState } from "react";
import { activeMonthsInYear, formatEuro, todayIso } from "@/lib/projects/period";
import { averageHourlyRate, marginPercent } from "@/lib/projects/insights";
import type {
  LineDirection,
  LineInput,
  PeriodQuery,
  ProjectDetail,
  ProjectInput,
  ProjectLine,
  ProjectStatus,
} from "@/lib/projects/types";
import { BILLING_LABELS, CADENCE_LABELS, DIRECTION_LABELS, MONTH_ABBR_LABELS, STATUS_LABELS } from "../labels";
import { ProjectLineForm } from "../ProjectLineForm/ProjectLineForm";
import styles from "../ProjectsPanel/ProjectsPanel.module.css";

type Props = {
  project: ProjectDetail;
  period: PeriodQuery;
  submitting: boolean;
  onUpdate: (id: number, input: ProjectInput) => void;
  onDelete: (id: number) => void;
  onAddLine: (id: number, input: LineInput) => void;
  onUpdateLine: (id: number, lineId: number, input: LineInput) => void;
  onDeleteLine: (id: number, lineId: number) => void;
  onSetLinePaidMonth: (id: number, lineId: number, month: string | string[], paid: boolean) => void;
};

function lineToInput(line: ProjectLine): LineInput {
  return {
    direction: line.direction,
    billing: line.billing,
    name: line.name,
    amount: line.amount,
    hours: line.hours,
    cadence: line.cadence,
    occurredOn: line.occurredOn,
    paidOn: line.paidOn,
    vatRate: line.vatRate,
    category: line.category,
    amountIncludesVat: line.amountIncludesVat,
    startsOn: line.startsOn,
    endsOn: line.endsOn,
    sourceMessageId: line.sourceMessageId,
    note: line.note,
  };
}

function lineMeta(line: ProjectLine): string {
  const parts =
    line.billing === "periodic"
      ? [BILLING_LABELS.periodic, CADENCE_LABELS[line.cadence ?? "month"]]
      : [BILLING_LABELS.one_off];
  if (line.billing === "one_off" && line.hours != null) parts.push(`${formatEuro(line.amount)} × ${line.hours} u`);
  if (line.occurredOn) parts.push(line.occurredOn);
  if (line.startsOn) parts.push(`vanaf ${line.startsOn}`);
  if (line.endsOn) parts.push(`t/m ${line.endsOn}`);
  if (line.vatRate != null) parts.push(`${line.vatRate}% BTW`);
  if (line.category) parts.push(line.category);
  return parts.join(" · ");
}

/** Matches the backend's openValueInPeriod: month view uses the selected month, everything else today's. */
function currentMonthKey(period: PeriodQuery): string {
  const today = todayIso();
  const [year, month] = period.view === "month" ? [period.year, period.month] : today.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function ProjectDetail({
  project,
  period,
  submitting,
  onUpdate,
  onDelete,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onSetLinePaidMonth,
}: Props) {
  const [name, setName] = useState(project.name);
  const [clientName, setClientName] = useState(project.clientName);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [startOn, setStartOn] = useState(project.startOn ?? "");
  const [endOn, setEndOn] = useState(project.endOn ?? "");

  useEffect(() => {
    setName(project.name);
    setClientName(project.clientName);
    setDescription(project.description);
    setStatus(project.status);
    setStartOn(project.startOn ?? "");
    setEndOn(project.endOn ?? "");
  }, [project]);

  const dirty =
    name !== project.name ||
    clientName !== project.clientName ||
    description !== project.description ||
    status !== project.status ||
    startOn !== (project.startOn ?? "") ||
    endOn !== (project.endOn ?? "");

  function save() {
    if (!name.trim()) return;
    onUpdate(project.id, {
      name: name.trim(),
      clientName: clientName.trim(),
      description: description.trim(),
      status,
      startOn: startOn || null,
      endOn: endOn || null,
    });
  }

  const income = project.lines.filter((line) => line.direction === "income");
  const expenses = project.lines.filter((line) => line.direction === "expense");
  const hourly = averageHourlyRate(project.lines);
  const margin = marginPercent(project.totals);

  return (
    <>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className={styles.row}>
          <input value={name} placeholder="Projectnaam" onChange={(event) => setName(event.target.value)} />
          {!project.isOverhead && (
            <input
              value={clientName}
              placeholder="Klant"
              onChange={(event) => setClientName(event.target.value)}
            />
          )}
        </div>
        <textarea
          value={description}
          placeholder="Korte beschrijving van het werk"
          rows={2}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className={styles.row}>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            aria-label="Status"
          >
            {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABELS[key]}
              </option>
            ))}
          </select>
          <div className={styles.row}>
            <input
              type="date"
              value={startOn}
              aria-label="Startdatum"
              onChange={(event) => setStartOn(event.target.value)}
            />
            <input
              type="date"
              value={endOn}
              aria-label="Einddatum"
              onChange={(event) => setEndOn(event.target.value)}
            />
          </div>
        </div>
        {project.isOverhead && <span className={styles.badge}>Algemene kosten</span>}
        <p className={styles.itemMeta}>
          In deze periode: {formatEuro(project.totals.income)} in · {formatEuro(project.totals.expense)}{" "}
          uit · marge {formatEuro(project.totals.margin)}
          {margin != null && ` (${margin}%)`}
          {hourly != null && ` · gem. ${formatEuro(hourly)}/u`}
          {(project.totals.openIncome > 0 || project.totals.openExpense > 0) && (
            <span className={styles.openHint}>
              {" "}
              · nog open: {formatEuro(project.totals.openIncome)} in / {formatEuro(project.totals.openExpense)} uit
            </span>
          )}
        </p>
        <div className={styles.actions}>
          <button type="submit" disabled={submitting || !name.trim() || !dirty}>
            {submitting ? "Opslaan…" : "Opslaan"}
          </button>
          {!project.isOverhead && (
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => {
                if (window.confirm(`Project "${project.name}" verwijderen?`)) {
                  onDelete(project.id);
                }
              }}
            >
              Verwijderen
            </button>
          )}
        </div>
      </form>

      <LineSection
        direction="income"
        lines={income}
        project={project}
        period={period}
        submitting={submitting}
        onAdd={(input) => onAddLine(project.id, input)}
        onUpdate={(lineId, input) => onUpdateLine(project.id, lineId, input)}
        onDelete={(lineId) => onDeleteLine(project.id, lineId)}
        onSetPaidMonth={(lineId, month, paid) => onSetLinePaidMonth(project.id, lineId, month, paid)}
      />
      <LineSection
        direction="expense"
        lines={expenses}
        project={project}
        period={period}
        submitting={submitting}
        onAdd={(input) => onAddLine(project.id, input)}
        onUpdate={(lineId, input) => onUpdateLine(project.id, lineId, input)}
        onDelete={(lineId) => onDeleteLine(project.id, lineId)}
        onSetPaidMonth={(lineId, month, paid) => onSetLinePaidMonth(project.id, lineId, month, paid)}
      />
    </>
  );
}

function LineSection({
  direction,
  lines,
  project,
  period,
  submitting,
  onAdd,
  onUpdate,
  onDelete,
  onSetPaidMonth,
}: {
  direction: LineDirection;
  lines: ProjectLine[];
  project: ProjectDetail;
  period: PeriodQuery;
  submitting: boolean;
  onAdd: (input: LineInput) => void;
  onUpdate: (lineId: number, input: LineInput) => void;
  onDelete: (lineId: number) => void;
  onSetPaidMonth: (lineId: number, month: string | string[], paid: boolean) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const directionLabel = DIRECTION_LABELS[direction].toLowerCase();
  const monthKey = currentMonthKey(period);

  return (
    <section>
      <h3 className={styles.sectionTitle}>{DIRECTION_LABELS[direction]}</h3>
      {lines.length === 0 ? (
        <p className={styles.empty}>Nog geen {directionLabel}.</p>
      ) : (
        <ul className={styles.list}>
          {lines.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className={styles.line}>
                <ProjectLineForm
                  direction={direction}
                  submitting={submitting}
                  initial={item}
                  onSubmit={(input) => {
                    onUpdate(item.id, input);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={item.id} className={styles.line}>
                <div className={styles.lineRow}>
                  <div className={styles.lineMain}>
                    <span className={styles.lineName}>{item.name}</span>
                    <span className={styles.itemMeta}>{lineMeta(item)}</span>
                  </div>
                  <strong className={direction === "income" ? styles.income : styles.expense}>
                    {formatEuro(item.hours != null ? item.amount * item.hours : item.amount)}
                  </strong>
                  {item.billing === "one_off" && (
                    <span className={item.paidOn ? styles.badgePaid : styles.badgeOpen}>
                      {item.paidOn ? `Betaald ${item.paidOn}` : "Open"}
                    </span>
                  )}
                  <div className={styles.lineActions}>
                    <button type="button" className={styles.linkBtn} onClick={() => setEditingId(item.id)}>
                      Bewerken
                    </button>
                    {item.billing === "one_off" && (
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() =>
                          onUpdate(item.id, {
                            ...lineToInput(item),
                            paidOn: item.paidOn ? null : todayIso(),
                          })
                        }
                      >
                        {item.paidOn ? "Markeer open" : "Markeer betaald"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      title="Regel verwijderen"
                      onClick={() => {
                        if (window.confirm(`Regel "${item.name}" verwijderen?`)) {
                          onDelete(item.id);
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {item.billing === "periodic" &&
                  (period.view === "year" ? (
                    <div className={styles.monthChips}>
                      {activeMonthsInYear(project, period.year, todayIso(), item.startsOn, item.endsOn).map((month) => {
                        const paid = item.paidMonths.includes(month);
                        const monthIndex = Number(month.slice(5, 7)) - 1;
                        return (
                          <button
                            key={month}
                            type="button"
                            className={paid ? styles.chipPaid : styles.chipOpen}
                            title={`${MONTH_ABBR_LABELS[monthIndex]} ${paid ? "betaald" : "open"} — klik om te wisselen`}
                            onClick={() => onSetPaidMonth(item.id, month, !paid)}
                          >
                            {MONTH_ABBR_LABELS[monthIndex]}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => {
                          const nowKey = todayIso().slice(0, 7);
                          const unpaid = activeMonthsInYear(project, period.year, todayIso(), item.startsOn, item.endsOn).filter(
                            (month) => !item.paidMonths.includes(month) && month <= nowKey
                          );
                          if (unpaid.length > 0) onSetPaidMonth(item.id, unpaid, true);
                        }}
                      >
                        Markeer jaar betaald
                      </button>
                    </div>
                  ) : (
                    <div className={styles.monthChips}>
                      <button
                        type="button"
                        className={item.paidMonths.includes(monthKey) ? styles.chipPaid : styles.chipOpen}
                        onClick={() => onSetPaidMonth(item.id, monthKey, !item.paidMonths.includes(monthKey))}
                      >
                        {item.paidMonths.includes(monthKey) ? "Betaald deze periode" : "Open deze periode"}
                      </button>
                    </div>
                  ))}
              </li>
            )
          )}
        </ul>
      )}
      {adding ? (
        <ProjectLineForm
          direction={direction}
          submitting={submitting}
          onSubmit={(input) => {
            onAdd(input);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" className={styles.addLineBtn} onClick={() => setAdding(true)}>
          + Toevoegen {directionLabel}
        </button>
      )}
    </section>
  );
}
