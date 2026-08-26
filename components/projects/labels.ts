import type { BillingType, LineDirection, PeriodicCadence, PeriodView, ProjectStatus } from "@/lib/projects/types";

export const BILLING_LABELS: Record<BillingType, string> = {
  periodic: "Periodiek",
  one_off: "Eenmalig",
};

export const CADENCE_LABELS: Record<PeriodicCadence, string> = {
  week: "Per week",
  month: "Per maand",
  quarter: "Per kwartaal",
  year: "Per jaar",
};

export const VAT_RATE_OPTIONS = [0, 9, 21] as const;

export const DIRECTION_LABELS: Record<LineDirection, string> = {
  income: "Inkomsten",
  expense: "Uitgaven",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Actief",
  done: "Klaar",
};

export const VIEW_LABELS: Record<PeriodView, string> = {
  month: "Deze maand",
  year: "Dit jaar",
  runrate: "Per maand",
};

export const MONTH_ABBR_LABELS = [
  "jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec",
] as const;
