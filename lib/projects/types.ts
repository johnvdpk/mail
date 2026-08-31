export type ProjectStatus = "active" | "done";
export type LineDirection = "income" | "expense";
export type BillingType = "periodic" | "one_off";
export type PeriodicCadence = "week" | "month" | "quarter" | "year";
export type PeriodView = "month" | "year" | "runrate";

/** A user-managed category option, scoped to one direction (see components/projects/CategorySelect). */
export type Category = {
  id: number;
  name: string;
  direction: LineDirection;
  createdAt: string;
};

export type PeriodQuery =
  | { view: "runrate" }
  | { view: "month"; year: number; month: number }
  | { view: "year"; year: number };

export type MoneyTotals = {
  income: number;
  expense: number;
  margin: number;
  /** Sum of unpaid income counted in this period — cashflow still to come. */
  openIncome: number;
  /** Sum of unpaid expense counted in this period — cashflow still due. */
  openExpense: number;
  /** BTW over de inkomsten in deze periode (over het incl.-bedrag berekend). */
  vatIncome: number;
  /** BTW over de uitgaven in deze periode. */
  vatExpense: number;
};

export type ProjectLine = {
  id: number;
  projectId: number;
  direction: LineDirection;
  billing: BillingType;
  name: string;
  amount: number;
  hours: number | null;
  /** Only set for periodic lines — how often `amount` recurs. */
  cadence: PeriodicCadence | null;
  occurredOn: string | null;
  /** Paid/open marker for one_off lines. Periodic lines use `paidMonths` instead. */
  paidOn: string | null;
  /** For periodic lines: ISO "YYYY-MM" months marked paid. Always empty for one_off lines. */
  paidMonths: string[];
  /** BTW-percentage over `amount`, bijv. 21. Null = geen BTW van toepassing. */
  vatRate: number | null;
  /** Free-text category name (see the `categories` table); optional for both directions. */
  category: string | null;
  /** Periodic lines stop counting after this date (inclusive). */
  endsOn: string | null;
  /** Local message id (folder#uid) when the line was booked from mail. */
  sourceMessageId: string | null;
  /** Free-text detail from the source bank mutation (e.g. invoice number) that doesn't fit `name`. */
  note: string | null;
  createdAt: string;
};

export type Project = {
  id: number;
  name: string;
  clientName: string;
  description: string;
  status: ProjectStatus;
  startOn: string | null;
  endOn: string | null;
  isOverhead: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSummary = Project & {
  totals: MoneyTotals;
  lineCount: number;
};

export type ProjectDetail = Project & {
  totals: MoneyTotals;
  lines: ProjectLine[];
};

export type ProjectsOverview = {
  period: PeriodQuery;
  totals: MoneyTotals;
  projects: ProjectSummary[];
  openItems: OpenLineItem[];
  expenseCategories: CategoryShare[];
  incomeCategories: CategoryShare[];
  ledger: LedgerRow[];
};

export type LineInput = {
  direction: LineDirection;
  billing: BillingType;
  name: string;
  amount: number;
  hours: number | null;
  cadence: PeriodicCadence | null;
  occurredOn: string | null;
  paidOn: string | null;
  vatRate: number | null;
  category: string | null;
  endsOn: string | null;
  sourceMessageId: string | null;
  note: string | null;
};

export type ProjectWithLines = Project & { lines: ProjectLine[] };

export type LedgerRow = {
  lineId: number;
  projectId: number;
  projectName: string;
  name: string;
  note: string | null;
  direction: LineDirection;
  billing: BillingType;
  amount: number;
  occurredOn: string | null;
  category: string | null;
  paid: boolean;
  /** Periodic line where some but not all months of the queried period are paid. */
  partiallyPaid: boolean;
  /** Months this row's paid-status covers ("YYYY-MM"); null for one_off (uses paidOn instead). */
  periodMonths: string[] | null;
};

/** Maps a counterparty/description substring to a fixed category or project (mutually exclusive). */
export type CounterpartyRule = {
  id: number;
  pattern: string;
  category: string | null;
  projectId: number | null;
  createdAt: string;
};

export type CounterpartyRuleTarget =
  | { kind: "category"; category: string }
  | { kind: "project"; projectId: number };

export type OpenLineItem = {
  lineId: number;
  projectId: number;
  projectName: string;
  clientName: string;
  name: string;
  direction: LineDirection;
  amount: number;
  daysOpen: number;
  occurredOn: string | null;
};

export type CategoryShare = {
  category: string;
  amount: number;
  percent: number;
};

export type MonthTotals = {
  month: number;
  key: string;
  label: string;
  totals: MoneyTotals;
};

export type VatQuarter = {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  vatIncome: number;
  vatExpense: number;
  balance: number;
  filedOn: string | null;
};

export type ProjectInput = {
  name: string;
  clientName: string;
  description: string;
  status: ProjectStatus;
  startOn: string | null;
  endOn: string | null;
};
