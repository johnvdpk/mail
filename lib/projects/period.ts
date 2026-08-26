import {
  type BillingType,
  type LineDirection,
  type MoneyTotals,
  type PeriodicCadence,
  type PeriodQuery,
  type PeriodView,
  type Project,
  type ProjectLine,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectsOverview,
} from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function emptyTotals(): MoneyTotals {
  return { income: 0, expense: 0, margin: 0, openIncome: 0, openExpense: 0, vatIncome: 0, vatExpense: 0 };
}

export function withMargin(
  income: number,
  expense: number,
  openIncome = 0,
  openExpense = 0,
  vatIncome = 0,
  vatExpense = 0
): MoneyTotals {
  return {
    income: roundEuros(income),
    expense: roundEuros(expense),
    margin: roundEuros(income - expense),
    openIncome: roundEuros(openIncome),
    openExpense: roundEuros(openExpense),
    vatIncome: roundEuros(vatIncome),
    vatExpense: roundEuros(vatExpense),
  };
}

export function roundEuros(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

export function periodFromSearchParams(
  params: URLSearchParams,
  today = todayIso()
): PeriodQuery {
  const view = parseView(params.get("view"));
  const { year: currentYear, month: currentMonth } = yearMonth(today);
  if (view === "runrate") return { view: "runrate" };
  const year = parseYear(params.get("year"), currentYear);
  if (view === "year") return { view: "year", year };
  return { view: "month", year, month: parseMonth(params.get("month"), currentMonth) };
}

export function periodQueryString(period: PeriodQuery): string {
  const params = new URLSearchParams({ view: period.view });
  if (period.view === "month") {
    params.set("year", String(period.year));
    params.set("month", String(period.month));
  } else if (period.view === "year") {
    params.set("year", String(period.year));
  }
  return params.toString();
}

export function periodLabel(period: PeriodQuery): string {
  if (period.view === "runrate") return "Doorlopend per maand";
  if (period.view === "year") return String(period.year);
  const date = new Date(period.year, period.month - 1, 1);
  return date.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
}

export function shiftPeriod(period: PeriodQuery, delta: number): PeriodQuery {
  if (period.view === "runrate") return period;
  if (period.view === "year") return { view: "year", year: period.year + delta };
  const monthIndex = period.year * 12 + (period.month - 1) + delta;
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return { view: "month", year, month };
}

export type ProjectForTotals = Pick<Project, "status" | "startOn" | "endOn">;

export type LineForTotals = Pick<
  ProjectLine,
  | "direction"
  | "billing"
  | "amount"
  | "hours"
  | "cadence"
  | "occurredOn"
  | "paidOn"
  | "paidMonths"
  | "vatRate"
  | "endsOn"
>;

export function summarizeProjects(
  projects: Array<Project & { lines: ProjectLine[] }>,
  period: PeriodQuery,
  today = todayIso()
): Pick<ProjectsOverview, "period" | "totals" | "projects"> {
  const summaries: ProjectSummary[] = projects.map((project) => {
    const totals = totalsForLines(project, project.lines, period, today);
    return { ...project, totals, lineCount: project.lines.length };
  });
  return {
    period,
    totals: sumTotals(summaries.map((item) => item.totals)),
    projects: summaries,
  };
}

export function totalsForLines(
  project: ProjectForTotals,
  lines: LineForTotals[],
  period: PeriodQuery,
  today = todayIso()
): MoneyTotals {
  let income = 0;
  let expense = 0;
  let openIncome = 0;
  let openExpense = 0;
  let vatIncome = 0;
  let vatExpense = 0;
  for (const line of lines) {
    const value = lineValueInPeriod(project, line, period, today);
    if (value === 0) continue;
    const open = openValueInPeriod(project, line, period, today, value);
    const vat = roundEuros(value * ((line.vatRate ?? 0) / 100));
    if (line.direction === "income") {
      income += value;
      openIncome += open;
      vatIncome += vat;
    } else {
      expense += value;
      openExpense += open;
      vatExpense += vat;
    }
  }
  return withMargin(income, expense, openIncome, openExpense, vatIncome, vatExpense);
}

export function lineValueInPeriod(
  project: ProjectForTotals,
  line: LineForTotals,
  period: PeriodQuery,
  today = todayIso()
): number {
  if (period.view === "runrate") {
    if (!isActiveForRunrate(project, today)) return 0;
    if (line.billing !== "periodic") return 0;
    if (line.endsOn && line.endsOn < today) return 0;
    return monthlyEquivalent(line);
  }

  if (line.billing === "one_off") {
    if (!line.occurredOn) return 0;
    const total = oneOffTotal(line);
    if (period.view === "month") {
      const { year, month } = yearMonth(line.occurredOn);
      return year === period.year && month === period.month ? total : 0;
    }
    return yearMonth(line.occurredOn).year === period.year ? total : 0;
  }

  const monthly = monthlyEquivalent(line);
  if (period.view === "month") {
    return overlapsMonth(project, period.year, period.month, today, line.endsOn) ? monthly : 0;
  }
  return roundEuros(monthly * activeMonthsInYear(project, period.year, today, line.endsOn).length);
}

/**
 * "Open" (unpaid) portion of a line's value in the period. One_off lines are all-or-nothing
 * via `paidOn`; periodic lines are tracked per calendar month via `paidMonths`, so a year can
 * be partly paid (e.g. jan–jul paid, aug–sep still open).
 */
function openValueInPeriod(
  project: ProjectForTotals,
  line: LineForTotals,
  period: PeriodQuery,
  today: string,
  totalValue: number
): number {
  if (line.billing === "one_off") {
    return line.paidOn ? 0 : totalValue;
  }
  if (period.view === "year") {
    const months = activeMonthsInYear(project, period.year, today, line.endsOn);
    const unpaidMonths = months.filter((month) => !line.paidMonths.includes(month)).length;
    return roundEuros(monthlyEquivalent(line) * unpaidMonths);
  }
  const current = period.view === "month" ? { year: period.year, month: period.month } : yearMonth(today);
  return line.paidMonths.includes(monthKey(current.year, current.month)) ? 0 : totalValue;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

/** Hours acts as an entry helper: amount is the rate and the total is amount × hours. */
function oneOffTotal(line: LineForTotals): number {
  if (line.hours != null) return roundEuros(line.amount * line.hours);
  return line.amount;
}

/**
 * We don't track which exact week/quarter a recurring line falls in, so its
 * amount is normalized to a monthly-equivalent for month/year/runrate totals —
 * the same spreading month/year totals already apply to periodic amounts.
 */
const CADENCE_MONTHLY_FACTOR: Record<PeriodicCadence, number> = {
  week: 52 / 12,
  month: 1,
  quarter: 1 / 3,
  year: 1 / 12,
};

function monthlyEquivalent(line: LineForTotals): number {
  const cadence = line.cadence ?? "month";
  return roundEuros(line.amount * CADENCE_MONTHLY_FACTOR[cadence]);
}

function isActiveForRunrate(project: ProjectForTotals, today: string): boolean {
  if (project.status !== "active") return false;
  if (project.startOn && project.startOn > today) return false;
  if (effectiveEndOn(project, today) < today) return false;
  return true;
}

function overlapsMonth(
  project: ProjectForTotals,
  year: number,
  month: number,
  today: string,
  lineEndsOn?: string | null
): boolean {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  if (project.startOn && project.startOn > end) return false;
  if (lineEndsOn && lineEndsOn < start) return false;
  return effectiveEndOn(project, today) >= start;
}

/** ISO "YYYY-MM" months of `year` the project was active in — the months a periodic line's paid-chips cover. */
export function activeMonthsInYear(
  project: ProjectForTotals,
  year: number,
  today: string,
  lineEndsOn?: string | null
): string[] {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const from = maxDate(project.startOn ?? yearStart, yearStart);
  const to = minDate(minDate(effectiveEndOn(project, today), lineEndsOn ?? yearEnd), yearEnd);
  if (from > to) return [];
  const start = yearMonth(from);
  const end = yearMonth(to);
  const months: string[] = [];
  for (let m = start.month; m <= end.month; m++) {
    months.push(monthKey(year, m));
  }
  return months;
}

function effectiveEndOn(project: ProjectForTotals, today: string): string {
  if (project.endOn) return project.endOn;
  if (project.status === "done") return today;
  return "9999-12-31";
}

function monthStart(year: number, month: number): string {
  return `${year}-${pad(month)}-01`;
}

function monthEnd(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(last)}`;
}

export function yearMonth(iso: string): { year: number; month: number } {
  const [year, month] = iso.split("-").map(Number);
  return { year, month };
}

export function yearFromSearchParams(params: URLSearchParams, today = todayIso()): number {
  return parseYear(params.get("year"), yearMonth(today).year);
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function parseView(raw: string | null): PeriodView {
  if (raw === "year" || raw === "runrate" || raw === "month") return raw;
  return "month";
}

function parseYear(raw: string | null, fallback: number): number {
  const year = Number(raw);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : fallback;
}

function parseMonth(raw: string | null, fallback: number): number {
  const month = Number(raw);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : fallback;
}

export function sumTotals(items: MoneyTotals[]): MoneyTotals {
  return withMargin(
    items.reduce((sum, item) => sum + item.income, 0),
    items.reduce((sum, item) => sum + item.expense, 0),
    items.reduce((sum, item) => sum + item.openIncome, 0),
    items.reduce((sum, item) => sum + item.openExpense, 0),
    items.reduce((sum, item) => sum + item.vatIncome, 0),
    items.reduce((sum, item) => sum + item.vatExpense, 0)
  );
}

export function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return roundEuros(raw);
  }
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return roundEuros(value);
}

export function parseOptionalDate(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string" || !isIsoDate(raw)) return undefined;
  return raw;
}

export function parseStatus(raw: unknown): ProjectStatus | null {
  return raw === "active" || raw === "done" ? raw : null;
}

export function parseDirection(raw: unknown): LineDirection | null {
  return raw === "income" || raw === "expense" ? raw : null;
}

export function parseBilling(raw: unknown): BillingType | null {
  return raw === "periodic" || raw === "one_off" ? raw : null;
}

export function parseCadence(raw: unknown): PeriodicCadence | null {
  return raw === "week" || raw === "month" || raw === "quarter" || raw === "year" ? raw : null;
}

/** Missing/empty means "geen BTW" (0), not an error — most lines won't set it explicitly. */
export function parseVatRate(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    return undefined;
  }
  return value;
}

/** Category is now a free-text name from the user-managed `categories` list, not a fixed enum. */
export function parseCategory(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value ? value.slice(0, 60) : null;
}

export function parseSourceMessageId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value ? value.slice(0, 200) : null;
}
