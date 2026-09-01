import {
  activeMonthsInYear,
  lineValueInPeriod,
  monthKey,
  roundEuros,
  splitAmountAndVat,
  sumTotals,
  todayIso,
  totalsForLines,
  yearMonth,
} from "./period";
import {
  type CategoryShare,
  type LedgerRow,
  type LineDirection,
  type MonthTotals,
  type MoneyTotals,
  type OpenLineItem,
  type PeriodQuery,
  type ProjectLine,
  type ProjectWithLines,
} from "./types";

export const OVERDUE_DAYS = 30;
const PERIODIC_LOOKBACK_MONTHS = 24;
const MS_PER_DAY = 86_400_000;

export function monthlyTotals(
  projects: ProjectWithLines[],
  year: number,
  today = todayIso()
): MonthTotals[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const period: PeriodQuery = { view: "month", year, month };
    const totals = sumTotals(projects.map((project) => totalsForLines(project, project.lines, period, today)));
    const label = new Date(year, index, 1).toLocaleDateString("nl-NL", { month: "long" });
    return { month, key: monthKey(year, month), label, totals };
  });
}

export function paidIncome(totals: MoneyTotals): number {
  return roundEuros(totals.income - totals.openIncome);
}

export function paidExpense(totals: MoneyTotals): number {
  return roundEuros(totals.expense - totals.openExpense);
}

export function marginPercent(totals: MoneyTotals): number | null {
  if (totals.income === 0) return null;
  return roundEuros((totals.margin / totals.income) * 100);
}

export function averageHourlyRate(lines: ProjectLine[]): number | null {
  let total = 0;
  let hours = 0;
  for (const line of lines) {
    if (line.direction !== "income" || line.billing !== "one_off" || line.hours == null) continue;
    total += line.amount * line.hours;
    hours += line.hours;
  }
  if (hours === 0) return null;
  return roundEuros(total / hours);
}

export function quarterlyVat(
  projects: ProjectWithLines[],
  year: number,
  today = todayIso()
): Array<{ quarter: 1 | 2 | 3 | 4; vatIncome: number; vatExpense: number; balance: number }> {
  return ([1, 2, 3, 4] as const).map((quarter) => {
    const months = [1, 2, 3].map((offset) => (quarter - 1) * 3 + offset);
    const totals = sumTotals(
      months.flatMap((month) =>
        projects.map((project) =>
          totalsForLines(project, project.lines, { view: "month", year, month }, today)
        )
      )
    );
    return {
      quarter,
      vatIncome: totals.vatIncome,
      vatExpense: totals.vatExpense,
      balance: roundEuros(totals.vatIncome - totals.vatExpense),
    };
  });
}

/** Groups a direction's lines by their (free-text) category name, "Overig" as the fallback bucket. */
export function categoryBreakdown(
  projects: ProjectWithLines[],
  period: PeriodQuery,
  direction: LineDirection,
  today = todayIso()
): CategoryShare[] {
  const sums = new Map<string, number>();

  for (const project of projects) {
    for (const line of project.lines) {
      // Uncategorized lines are left out rather than lumped into a synthetic bucket —
      // for income especially, "no category" and "categorized as overig" are different things.
      if (line.direction !== direction || line.category == null) continue;
      const value = lineValueInPeriod(project, line, period, today);
      if (value === 0) continue;
      const { net } = splitAmountAndVat(value, line.vatRate, line.amountIncludesVat);
      sums.set(line.category, (sums.get(line.category) ?? 0) + net);
    }
  }

  const total = [...sums.values()].reduce((sum, value) => sum + value, 0);
  return [...sums.entries()]
    .map(([category, sum]) => {
      const amount = roundEuros(sum);
      return {
        category,
        amount,
        percent: total === 0 ? 0 : roundEuros((amount / total) * 100),
      };
    })
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

/** Which months of the period a line's paid-status applies to, and whether they're (fully/partially) paid. */
function paidStatusInPeriod(
  project: ProjectWithLines,
  line: ProjectLine,
  period: PeriodQuery,
  today: string
): { paid: boolean; partiallyPaid: boolean; periodMonths: string[] | null } {
  if (line.billing === "one_off") {
    return { paid: line.paidOn != null, partiallyPaid: false, periodMonths: null };
  }
  const months =
    period.view === "year"
      ? activeMonthsInYear(project, period.year, today, line.startsOn, line.endsOn)
      : [
          period.view === "month"
            ? monthKey(period.year, period.month)
            : monthKey(yearMonth(today).year, yearMonth(today).month),
        ];
  const paidCount = months.filter((month) => line.paidMonths.includes(month)).length;
  return {
    paid: months.length > 0 && paidCount === months.length,
    partiallyPaid: paidCount > 0 && paidCount < months.length,
    periodMonths: months,
  };
}

export function ledgerForPeriod(
  projects: ProjectWithLines[],
  period: PeriodQuery,
  today = todayIso()
): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const project of projects) {
    for (const line of project.lines) {
      const value = lineValueInPeriod(project, line, period, today);
      if (value === 0) continue;
      const grossAmount =
        line.billing === "one_off" && line.hours != null
          ? roundEuros(line.amount * line.hours)
          : value;
      const { net, vat } = splitAmountAndVat(grossAmount, line.vatRate, line.amountIncludesVat);
      const status = paidStatusInPeriod(project, line, period, today);
      rows.push({
        lineId: line.id,
        projectId: project.id,
        projectName: project.name,
        name: line.name,
        note: line.note,
        direction: line.direction,
        billing: line.billing,
        amount: net,
        occurredOn: line.occurredOn,
        category: line.category,
        paid: status.paid,
        partiallyPaid: status.partiallyPaid,
        periodMonths: status.periodMonths,
        vatAmount: vat,
      });
    }
  }
  rows.sort(
    (a, b) =>
      (b.occurredOn ?? "").localeCompare(a.occurredOn ?? "") || a.name.localeCompare(b.name, "nl")
  );
  return rows;
}

export function openLinesAcrossProjects(
  projects: ProjectWithLines[],
  today = todayIso()
): OpenLineItem[] {
  const items: OpenLineItem[] = [];
  for (const project of projects) {
    for (const line of project.lines) {
      const item = openItemForLine(project, line, today);
      if (item) items.push(item);
    }
  }
  items.sort((a, b) => b.daysOpen - a.daysOpen || a.name.localeCompare(b.name, "nl"));
  return items;
}

export function overdueCount(items: OpenLineItem[], thresholdDays = OVERDUE_DAYS): number {
  return items.filter((item) => item.daysOpen >= thresholdDays).length;
}

function openItemForLine(
  project: ProjectWithLines,
  line: ProjectLine,
  today: string
): OpenLineItem | null {
  if (line.billing === "one_off") {
    if (line.paidOn || !line.occurredOn || line.occurredOn > today) return null;
    const amount = line.hours != null ? roundEuros(line.amount * line.hours) : line.amount;
    return toOpenItem(project, line, amount, daysBetween(line.occurredOn, today), line.occurredOn);
  }

  const unpaidMonths = unpaidPeriodicMonths(project, line, today);
  if (unpaidMonths.length === 0) return null;
  const oldest = unpaidMonths[0];
  const monthly = lineValueInPeriod(
    project,
    line,
    { view: "month", year: Number(oldest.slice(0, 4)), month: Number(oldest.slice(5, 7)) },
    today
  );
  return toOpenItem(
    project,
    line,
    roundEuros(monthly * unpaidMonths.length),
    daysBetween(`${oldest}-01`, today),
    `${oldest}-01`
  );
}

function unpaidPeriodicMonths(project: ProjectWithLines, line: ProjectLine, today: string): string[] {
  const currentKey = today.slice(0, 7);
  const from = lookbackStart(project.startOn, today);
  const years = yearRange(yearMonth(from).year, yearMonth(today).year);
  const months: string[] = [];
  for (const year of years) {
    for (const key of activeMonthsInYear(project, year, today, line.startsOn, line.endsOn)) {
      if (key > currentKey) continue;
      if (key < from.slice(0, 7)) continue;
      if (!line.paidMonths.includes(key)) months.push(key);
    }
  }
  return months;
}

function lookbackStart(startOn: string | null, today: string): string {
  const { year, month } = yearMonth(today);
  const shifted = month - PERIODIC_LOOKBACK_MONTHS;
  const lookbackYear = year + Math.floor((shifted - 1) / 12);
  const lookbackMonth = ((((shifted - 1) % 12) + 12) % 12) + 1;
  const lookback = `${lookbackYear}-${String(lookbackMonth).padStart(2, "0")}-01`;
  if (startOn && startOn > lookback) return startOn;
  return lookback;
}

function yearRange(from: number, to: number): number[] {
  const years: number[] = [];
  for (let year = from; year <= to; year++) years.push(year);
  return years;
}

function toOpenItem(
  project: ProjectWithLines,
  line: ProjectLine,
  amount: number,
  daysOpen: number,
  occurredOn: string | null
): OpenLineItem {
  return {
    lineId: line.id,
    projectId: project.id,
    projectName: project.name,
    clientName: project.clientName,
    name: line.name,
    direction: line.direction,
    amount,
    daysOpen,
    occurredOn,
  };
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / MS_PER_DAY));
}
