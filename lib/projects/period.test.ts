import { describe, expect, it } from "vitest";
import {
  lineValueInPeriod,
  periodLabel,
  shiftPeriod,
  summarizeProjects,
  totalsForLines,
} from "./period";
import type { Project, ProjectLine } from "./types";

const TODAY = "2026-08-24";

function project(partial: Partial<Project> = {}): Project {
  return {
    id: 1,
    name: "Jansen",
    clientName: "Jansen",
    description: "",
    status: "active",
    startOn: null,
    endOn: null,
    isOverhead: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function line(partial: Partial<ProjectLine> & Pick<ProjectLine, "billing" | "direction" | "amount">): ProjectLine {
  return {
    id: 1,
    projectId: 1,
    name: "regel",
    hours: null,
    cadence: partial.billing === "periodic" ? "month" : null,
    occurredOn: null,
    paidOn: null,
    paidMonths: [],
    vatRate: null,
    category: null,
    amountIncludesVat: false,
    startsOn: null,
    endsOn: null,
    sourceMessageId: null,
    note: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("totalsForLines", () => {
  it("counts periodic hosting in the selected month", () => {
    const totals = totalsForLines(
      project(),
      [
        line({ id: 1, billing: "periodic", direction: "income", amount: 20, name: "aap.nl" }),
        line({ id: 2, billing: "periodic", direction: "income", amount: 20, name: "noot.nl" }),
        line({ id: 3, billing: "periodic", direction: "expense", amount: 15, name: "VPS" }),
      ],
      { view: "month", year: 2026, month: 8 },
      TODAY
    );
    expect(totals).toEqual({
      income: 40,
      expense: 15,
      margin: 25,
      openIncome: 40,
      openExpense: 15,
      vatIncome: 0,
      vatExpense: 0,
    });
  });

  it("multiplies periodic lines by overlapping months in a year", () => {
    const totals = totalsForLines(
      project({ startOn: "2026-06-01" }),
      [line({ billing: "periodic", direction: "income", amount: 500 })],
      { view: "year", year: 2026 },
      TODAY
    );
    expect(totals).toEqual({
      income: 3500,
      expense: 0,
      margin: 3500,
      openIncome: 3500,
      openExpense: 0,
      vatIncome: 0,
      vatExpense: 0,
    });
  });

  it("uses hours times rate for a one_off line billed hourly", () => {
    const totals = totalsForLines(
      project(),
      [
        line({
          billing: "one_off",
          direction: "income",
          amount: 80,
          hours: 10,
          occurredOn: "2026-08-10",
        }),
      ],
      { view: "month", year: 2026, month: 8 },
      TODAY
    );
    expect(totals).toEqual({
      income: 800,
      expense: 0,
      margin: 800,
      openIncome: 800,
      openExpense: 0,
      vatIncome: 0,
      vatExpense: 0,
    });
  });

  it("includes a one_off line only in its own month", () => {
    const invoice = line({
      billing: "one_off",
      direction: "income",
      amount: 2500,
      occurredOn: "2026-03-10",
    });
    expect(
      totalsForLines(project(), [invoice], { view: "month", year: 2026, month: 8 }, TODAY)
    ).toEqual({ income: 0, expense: 0, margin: 0, openIncome: 0, openExpense: 0, vatIncome: 0, vatExpense: 0 });
    expect(
      totalsForLines(project(), [invoice], { view: "month", year: 2026, month: 3 }, TODAY)
    ).toEqual({
      income: 2500,
      expense: 0,
      margin: 2500,
      openIncome: 2500,
      openExpense: 0,
      vatIncome: 0,
      vatExpense: 0,
    });
    expect(
      totalsForLines(project(), [invoice], { view: "year", year: 2026 }, TODAY)
    ).toEqual({
      income: 2500,
      expense: 0,
      margin: 2500,
      openIncome: 2500,
      openExpense: 0,
      vatIncome: 0,
      vatExpense: 0,
    });
  });

  it("excludes a paid line from open, for both billing types", () => {
    const paidOneOff = line({
      billing: "one_off",
      direction: "income",
      amount: 2500,
      occurredOn: "2026-03-10",
      paidOn: "2026-03-15",
    });
    expect(
      totalsForLines(project(), [paidOneOff], { view: "month", year: 2026, month: 3 }, TODAY)
    ).toEqual({
      income: 2500,
      expense: 0,
      margin: 2500,
      openIncome: 0,
      openExpense: 0,
      vatIncome: 0,
      vatExpense: 0,
    });

    const paidPeriodic = line({
      billing: "periodic",
      direction: "expense",
      amount: 15,
      name: "VPS (automatische incasso)",
      paidMonths: ["2026-08"],
    });
    expect(
      totalsForLines(project(), [paidPeriodic], { view: "month", year: 2026, month: 8 }, TODAY)
    ).toEqual({ income: 0, expense: 15, margin: -15, openIncome: 0, openExpense: 0, vatIncome: 0, vatExpense: 0 });
  });

  it("tracks periodic paid status per calendar month, so a year can be partly paid", () => {
    const subscription = line({
      billing: "periodic",
      direction: "income",
      amount: 500,
      paidMonths: ["2026-04", "2026-05", "2026-06", "2026-07"],
    });

    expect(
      totalsForLines(project(), [subscription], { view: "month", year: 2026, month: 4 }, TODAY)
    ).toMatchObject({ income: 500, openIncome: 0 });
    expect(
      totalsForLines(project(), [subscription], { view: "month", year: 2026, month: 8 }, TODAY)
    ).toMatchObject({ income: 500, openIncome: 500 });

    // Project has no start/end date, so all 12 months of the year count; apr–jul are paid, the other 8 are open.
    expect(
      totalsForLines(project(), [subscription], { view: "year", year: 2026 }, TODAY)
    ).toMatchObject({ income: 6000, openIncome: 4000 });
  });

  it("computes BTW over the period value of a line", () => {
    const invoice = line({
      billing: "one_off",
      direction: "income",
      amount: 1000,
      occurredOn: "2026-03-10",
      vatRate: 21,
    });
    expect(
      totalsForLines(project(), [invoice], { view: "month", year: 2026, month: 3 }, TODAY)
    ).toEqual({
      income: 1000,
      expense: 0,
      margin: 1000,
      openIncome: 1000,
      openExpense: 0,
      vatIncome: 210,
      vatExpense: 0,
    });
  });

  it("normalizes periodic cadence to a monthly-equivalent amount", () => {
    const quarterly = line({ billing: "periodic", direction: "expense", amount: 300, cadence: "quarter" });
    expect(lineValueInPeriod(project(), quarterly, { view: "month", year: 2026, month: 8 }, TODAY)).toBe(100);
    expect(lineValueInPeriod(project(), quarterly, { view: "runrate" }, TODAY)).toBe(100);

    const yearly = line({ billing: "periodic", direction: "expense", amount: 1200, cadence: "year" });
    expect(lineValueInPeriod(project(), yearly, { view: "month", year: 2026, month: 8 }, TODAY)).toBe(100);
  });

  it("excludes one_off lines from run-rate and ended projects from run-rate", () => {
    const activeOneOff = line({
      billing: "one_off",
      direction: "income",
      amount: 1000,
      occurredOn: TODAY,
    });
    expect(
      lineValueInPeriod(project(), activeOneOff, { view: "runrate" }, TODAY)
    ).toBe(0);

    const periodic = line({ billing: "periodic", direction: "income", amount: 20 });
    expect(
      lineValueInPeriod(project({ status: "done" }), periodic, { view: "runrate" }, TODAY)
    ).toBe(0);
    expect(
      lineValueInPeriod(project(), periodic, { view: "runrate" }, TODAY)
    ).toBe(20);
  });
});

describe("summarizeProjects", () => {
  it("adds every project into the grand total", () => {
    const overview = summarizeProjects(
      [
        {
          ...project({ id: 1, name: "Jansen" }),
          lines: [line({ billing: "periodic", direction: "income", amount: 40 })],
        },
        {
          ...project({ id: 2, name: "Bedrijf", isOverhead: true }),
          lines: [line({ billing: "periodic", direction: "expense", amount: 50, name: "Boekhouder" })],
        },
      ],
      { view: "month", year: 2026, month: 8 },
      TODAY
    );
    expect(overview.totals).toEqual({
      income: 40,
      expense: 50,
      margin: -10,
      openIncome: 40,
      openExpense: 50,
      vatIncome: 0,
      vatExpense: 0,
    });
    expect(overview.projects).toHaveLength(2);
  });
});

describe("period helpers", () => {
  it("labels and shifts month periods", () => {
    expect(periodLabel({ view: "runrate" })).toBe("Doorlopend per maand");
    expect(shiftPeriod({ view: "month", year: 2026, month: 1 }, -1)).toEqual({
      view: "month",
      year: 2025,
      month: 12,
    });
    expect(shiftPeriod({ view: "year", year: 2026 }, 1)).toEqual({ view: "year", year: 2027 });
  });
});
