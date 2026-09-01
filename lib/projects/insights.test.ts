import { describe, expect, it } from "vitest";
import {
  averageHourlyRate,
  categoryBreakdown,
  ledgerForPeriod,
  marginPercent,
  monthlyTotals,
  openLinesAcrossProjects,
  overdueCount,
  paidIncome,
  quarterlyVat,
} from "./insights";
import { lineValueInPeriod, totalsForLines } from "./period";
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

describe("endsOn", () => {
  it("excludes periodic months after the line end date", () => {
    const ended = line({
      billing: "periodic",
      direction: "expense",
      amount: 15,
      endsOn: "2026-07-31",
    });
    expect(lineValueInPeriod(project(), ended, { view: "month", year: 2026, month: 7 }, TODAY)).toBe(15);
    expect(lineValueInPeriod(project(), ended, { view: "month", year: 2026, month: 8 }, TODAY)).toBe(0);
    expect(
      totalsForLines(project(), [ended], { view: "year", year: 2026 }, TODAY).expense
    ).toBe(105);
  });
});

describe("insights", () => {
  it("computes monthly totals and paid cashflow from existing paid markers", () => {
    const invoice = line({
      billing: "one_off",
      direction: "income",
      amount: 2500,
      occurredOn: "2026-03-10",
      paidOn: "2026-03-15",
    });
    const months = monthlyTotals([{ ...project(), lines: [invoice] }], 2026, TODAY);
    expect(months).toHaveLength(12);
    expect(months[2]?.totals.income).toBe(2500);
    expect(paidIncome(months[2]!.totals)).toBe(2500);
    expect(months[7]?.totals.income).toBe(0);
  });

  it("lists unpaid one-off income across projects, oldest first", () => {
    const items = openLinesAcrossProjects(
      [
        {
          ...project({ id: 1, name: "Jansen" }),
          lines: [
            line({
              billing: "one_off",
              direction: "income",
              amount: 400,
              occurredOn: "2026-05-01",
              name: "factuur mei",
            }),
          ],
        },
        {
          ...project({ id: 2, name: "Bedrijf", isOverhead: true }),
          lines: [
            line({
              id: 2,
              billing: "one_off",
              direction: "expense",
              amount: 80,
              occurredOn: TODAY,
              name: "recente kosten",
            }),
          ],
        },
      ],
      TODAY
    );
    expect(items[0]?.name).toBe("factuur mei");
    expect(items[0]?.daysOpen).toBeGreaterThan(60);
    expect(overdueCount(items)).toBeGreaterThan(0);
  });

  it("groups VAT per calendar quarter", () => {
    const invoice = line({
      billing: "one_off",
      direction: "income",
      amount: 1000,
      occurredOn: "2026-02-10",
      vatRate: 21,
    });
    const quarters = quarterlyVat([{ ...project(), lines: [invoice] }], 2026, TODAY);
    expect(quarters[0]?.vatIncome).toBe(210);
    expect(quarters[1]?.vatIncome).toBe(0);
  });

  it("computes margin percent and weighted hourly rate", () => {
    expect(marginPercent({ income: 4000, expense: 1000, margin: 3000, openIncome: 0, openExpense: 0, vatIncome: 0, vatExpense: 0 })).toBe(75);
    expect(
      averageHourlyRate([
        line({ billing: "one_off", direction: "income", amount: 50, hours: 10, occurredOn: TODAY }),
        line({ id: 2, billing: "one_off", direction: "income", amount: 80, hours: 5, occurredOn: TODAY }),
      ])
    ).toBe(60);
  });

  it("groups expenses by their free-text category and leaves out uncategorized lines", () => {
    const shares = categoryBreakdown(
      [
        {
          ...project(),
          lines: [
            line({
              billing: "one_off",
              direction: "expense",
              amount: 100,
              occurredOn: "2026-08-01",
              category: "software",
            }),
            line({
              id: 2,
              billing: "one_off",
              direction: "expense",
              amount: 50,
              occurredOn: "2026-08-02",
              category: "overig",
            }),
            line({
              id: 3,
              billing: "one_off",
              direction: "expense",
              amount: 30,
              occurredOn: "2026-08-03",
            }),
          ],
        },
      ],
      { view: "month", year: 2026, month: 8 },
      "expense",
      TODAY
    );
    expect(shares.find((row) => row.category === "software")?.amount).toBe(100);
    expect(shares.find((row) => row.category === "overig")?.amount).toBe(50);
    expect(shares.reduce((sum, row) => sum + row.amount, 0)).toBe(150);
  });

  it("groups income the same way, independently from expenses", () => {
    const shares = categoryBreakdown(
      [
        {
          ...project(),
          lines: [
            line({
              billing: "one_off",
              direction: "income",
              amount: 2000,
              occurredOn: "2026-08-01",
              category: "consultancy",
            }),
            line({
              id: 2,
              billing: "one_off",
              direction: "expense",
              amount: 100,
              occurredOn: "2026-08-01",
              category: "consultancy",
            }),
          ],
        },
      ],
      { view: "month", year: 2026, month: 8 },
      "income",
      TODAY
    );
    expect(shares).toEqual([{ category: "consultancy", amount: 2000, percent: 100 }]);
  });

  it("lists one-off lines in the selected period as a ledger", () => {
    const rows = ledgerForPeriod(
      [
        {
          ...project(),
          lines: [
            line({
              billing: "one_off",
              direction: "income",
              amount: 2500,
              occurredOn: "2026-03-10",
              name: "factuur maart",
            }),
            line({
              id: 2,
              billing: "one_off",
              direction: "expense",
              amount: 80,
              occurredOn: "2026-08-02",
              name: "software",
            }),
          ],
        },
      ],
      { view: "year", year: 2026 },
      TODAY
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.name)).toContain("factuur maart");
  });
});
