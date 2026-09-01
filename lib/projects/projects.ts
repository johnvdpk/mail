import { query, queryOne } from "../shared/db";
import { categoryBreakdown, ledgerForPeriod, openLinesAcrossProjects } from "./insights";
import {
  parseAmount,
  parseBilling,
  parseCadence,
  parseCategory,
  parseDirection,
  parseOptionalDate,
  parseSourceMessageId,
  parseStatus,
  parseVatRate,
  periodFromSearchParams,
  summarizeProjects,
  totalsForLines,
  todayIso,
} from "./period";
import type {
  LineInput,
  Project,
  ProjectDetail,
  ProjectInput,
  ProjectLine,
  ProjectsOverview,
  ProjectStatus,
  ProjectWithLines,
} from "./types";

type ProjectRow = {
  id: number;
  name: string;
  client_name: string;
  description: string;
  status: ProjectStatus;
  start_on: Date | string | null;
  end_on: Date | string | null;
  is_overhead: boolean;
  created_at: Date;
  updated_at: Date;
};

type LineRow = {
  id: number;
  project_id: number;
  direction: ProjectLine["direction"];
  billing: ProjectLine["billing"];
  name: string;
  amount: string | number;
  hours: string | number | null;
  cadence: ProjectLine["cadence"];
  occurred_on: Date | string | null;
  paid_on: Date | string | null;
  vat_rate: string | number | null;
  category: string | null;
  amount_includes_vat: boolean;
  starts_on: Date | string | null;
  ends_on: Date | string | null;
  source_message_id: string | null;
  note: string | null;
  created_at: Date;
};

type PaymentRow = {
  line_id: number;
  period_month: Date | string;
};

const OVERHEAD_NAME = "Bedrijf";
const OVERHEAD_DESCRIPTION =
  "Algemene ZZP-kosten die niet bij een klantproject horen.";

function toDateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientName: row.client_name,
    description: row.description,
    status: row.status,
    startOn: toDateOnly(row.start_on),
    endOn: toDateOnly(row.end_on),
    isOverhead: row.is_overhead,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toLine(row: LineRow, paidMonths: string[]): ProjectLine {
  return {
    id: row.id,
    projectId: row.project_id,
    direction: row.direction,
    billing: row.billing,
    name: row.name,
    amount: toNumber(row.amount) ?? 0,
    hours: toNumber(row.hours),
    cadence: row.cadence,
    occurredOn: toDateOnly(row.occurred_on),
    paidOn: toDateOnly(row.paid_on),
    paidMonths,
    vatRate: toNumber(row.vat_rate),
    category: row.category ?? null,
    amountIncludesVat: row.amount_includes_vat ?? false,
    startsOn: toDateOnly(row.starts_on),
    endsOn: toDateOnly(row.ends_on),
    sourceMessageId: row.source_message_id ?? null,
    note: row.note ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function groupPaidMonths(rows: PaymentRow[]): Map<number, string[]> {
  const byLine = new Map<number, string[]>();
  for (const row of rows) {
    const month = toDateOnly(row.period_month)?.slice(0, 7);
    if (!month) continue;
    const list = byLine.get(row.line_id) ?? [];
    list.push(month);
    byLine.set(row.line_id, list);
  }
  return byLine;
}

export async function ensureOverheadProject(): Promise<void> {
  const existing = await queryOne<{ id: number }>(
    "SELECT id FROM projects WHERE is_overhead = TRUE"
  );
  if (existing) return;
  await query(
    `INSERT INTO projects (name, client_name, description, is_overhead)
     VALUES ($1, '', $2, TRUE)`,
    [OVERHEAD_NAME, OVERHEAD_DESCRIPTION]
  );
}

export async function loadAllProjectsWithLines(): Promise<ProjectWithLines[]> {
  await ensureOverheadProject();
  const { rows: projectRows } = await query<ProjectRow>(
    `SELECT * FROM projects
     ORDER BY is_overhead DESC,
              CASE WHEN status = 'done' THEN 1 ELSE 0 END,
              lower(name)`
  );
  const { rows: lineRows } = await query<LineRow>(
    "SELECT * FROM project_lines ORDER BY created_at, id"
  );
  const { rows: paymentRows } = await query<PaymentRow>(
    "SELECT line_id, period_month FROM project_line_payments"
  );
  const paidMonthsByLine = groupPaidMonths(paymentRows);

  const linesByProject = new Map<number, ProjectLine[]>();
  for (const row of lineRows) {
    const list = linesByProject.get(row.project_id) ?? [];
    list.push(toLine(row, paidMonthsByLine.get(row.id) ?? []));
    linesByProject.set(row.project_id, list);
  }

  return projectRows.map((row) => {
    const project = toProject(row);
    return { ...project, lines: linesByProject.get(project.id) ?? [] };
  });
}

export async function listProjectOverview(searchParams: URLSearchParams): Promise<ProjectsOverview> {
  const period = periodFromSearchParams(searchParams);
  const projects = await loadAllProjectsWithLines();
  const overview = summarizeProjects(projects, period);
  return {
    ...overview,
    openItems: openLinesAcrossProjects(projects),
    expenseCategories: categoryBreakdown(projects, period, "expense"),
    incomeCategories: categoryBreakdown(projects, period, "income"),
    ledger: ledgerForPeriod(projects, period),
  };
}

export async function getProjectDetail(
  id: number,
  searchParams: URLSearchParams
): Promise<ProjectDetail | null> {
  const row = await queryOne<ProjectRow>("SELECT * FROM projects WHERE id = $1", [id]);
  if (!row) return null;
  const { rows } = await query<LineRow>(
    "SELECT * FROM project_lines WHERE project_id = $1 ORDER BY created_at, id",
    [id]
  );
  const { rows: paymentRows } = await query<PaymentRow>(
    `SELECT p.line_id, p.period_month FROM project_line_payments p
     JOIN project_lines l ON l.id = p.line_id
     WHERE l.project_id = $1`,
    [id]
  );
  const paidMonthsByLine = groupPaidMonths(paymentRows);
  const project = toProject(row);
  const lines = rows.map((lineRow) => toLine(lineRow, paidMonthsByLine.get(lineRow.id) ?? []));
  const period = periodFromSearchParams(searchParams);
  return { ...project, lines, totals: totalsForLines(project, lines, period) };
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const row = await queryOne<ProjectRow>(
    `INSERT INTO projects (name, client_name, description, status, start_on, end_on)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.name, input.clientName, input.description, input.status, input.startOn, input.endOn]
  );
  if (!row) throw new Error("Project aanmaken mislukt");
  return toProject(row);
}

export async function updateProject(id: number, input: ProjectInput): Promise<Project | null> {
  const row = await queryOne<ProjectRow>(
    `UPDATE projects
     SET name = $2,
         client_name = $3,
         description = $4,
         status = $5,
         start_on = $6,
         end_on = $7,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, input.name, input.clientName, input.description, input.status, input.startOn, input.endOn]
  );
  return row ? toProject(row) : null;
}

export async function deleteProject(id: number): Promise<"ok" | "missing" | "overhead"> {
  const row = await queryOne<{ is_overhead: boolean }>(
    "SELECT is_overhead FROM projects WHERE id = $1",
    [id]
  );
  if (!row) return "missing";
  if (row.is_overhead) return "overhead";
  await query("DELETE FROM projects WHERE id = $1", [id]);
  return "ok";
}

export async function createLine(projectId: number, input: LineInput): Promise<ProjectLine | null> {
  const project = await queryOne<{ id: number }>("SELECT id FROM projects WHERE id = $1", [projectId]);
  if (!project) return null;
  const row = await queryOne<LineRow>(
    `INSERT INTO project_lines (
       project_id, direction, billing, name, amount, hours, cadence,
       occurred_on, paid_on, vat_rate, category, amount_includes_vat, starts_on, ends_on, source_message_id, note
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      projectId,
      input.direction,
      input.billing,
      input.name,
      input.amount,
      input.hours,
      input.cadence,
      input.occurredOn,
      input.paidOn,
      input.vatRate,
      input.category,
      input.amountIncludesVat,
      input.startsOn,
      input.endsOn,
      input.sourceMessageId,
      input.note,
    ]
  );
  if (!row) throw new Error("Regel aanmaken mislukt");
  await touchProject(projectId);
  return toLine(row, []);
}

async function getPaidMonths(lineId: number): Promise<string[]> {
  const { rows } = await query<PaymentRow>(
    "SELECT line_id, period_month FROM project_line_payments WHERE line_id = $1",
    [lineId]
  );
  return groupPaidMonths(rows).get(lineId) ?? [];
}

export async function updateLine(
  projectId: number,
  lineId: number,
  input: LineInput
): Promise<ProjectLine | null> {
  const row = await queryOne<LineRow>(
    `UPDATE project_lines
     SET direction = $3,
         billing = $4,
         name = $5,
         amount = $6,
         hours = $7,
         cadence = $8,
         occurred_on = $9,
         paid_on = $10,
         vat_rate = $11,
         category = $12,
         amount_includes_vat = $13,
         starts_on = $14,
         ends_on = $15,
         source_message_id = $16,
         note = $17
     WHERE id = $1 AND project_id = $2
     RETURNING *`,
    [
      lineId,
      projectId,
      input.direction,
      input.billing,
      input.name,
      input.amount,
      input.hours,
      input.cadence,
      input.occurredOn,
      input.paidOn,
      input.vatRate,
      input.category,
      input.amountIncludesVat,
      input.startsOn,
      input.endsOn,
      input.sourceMessageId,
      input.note,
    ]
  );
  if (!row) return null;
  await touchProject(projectId);
  return toLine(row, await getPaidMonths(lineId));
}

export async function deleteLine(projectId: number, lineId: number): Promise<boolean> {
  const result = await query(
    "DELETE FROM project_lines WHERE id = $1 AND project_id = $2",
    [lineId, projectId]
  );
  if ((result.rowCount ?? 0) === 0) return false;
  await touchProject(projectId);
  return true;
}

export async function deleteLines(
  items: Array<{ projectId: number; lineId: number }>
): Promise<number> {
  let count = 0;
  for (const item of items) {
    if (await deleteLine(item.projectId, item.lineId)) count += 1;
  }
  return count;
}

export async function touchProject(id: number): Promise<void> {
  await query("UPDATE projects SET updated_at = NOW() WHERE id = $1", [id]);
}

/** Marks (or unmarks) one calendar month as paid for a periodic line. `month` is "YYYY-MM". */
export async function setLinePaidMonth(
  projectId: number,
  lineId: number,
  month: string,
  paid: boolean
): Promise<"ok" | "missing"> {
  const line = await queryOne<{ id: number }>(
    "SELECT id FROM project_lines WHERE id = $1 AND project_id = $2 AND billing = 'periodic'",
    [lineId, projectId]
  );
  if (!line) return "missing";

  if (paid) {
    await query(
      `INSERT INTO project_line_payments (line_id, period_month, paid_on)
       VALUES ($1, $2, $3)
       ON CONFLICT (line_id, period_month) DO NOTHING`,
      [lineId, `${month}-01`, todayIso()]
    );
  } else {
    await query(
      "DELETE FROM project_line_payments WHERE line_id = $1 AND period_month = $2",
      [lineId, `${month}-01`]
    );
  }
  await touchProject(projectId);
  return "ok";
}

export async function setLinePaidMonths(
  projectId: number,
  lineId: number,
  months: string[],
  paid: boolean
): Promise<"ok" | "missing"> {
  const unique = [...new Set(months)];
  for (const month of unique) {
    const result = await setLinePaidMonth(projectId, lineId, month, paid);
    if (result === "missing") return "missing";
  }
  return "ok";
}

/** Sets (or clears) the paid date for a one_off line. Periodic lines use setLinePaidMonth(s) instead. */
export async function setLinePaidOn(
  projectId: number,
  lineId: number,
  paidOn: string | null
): Promise<"ok" | "missing"> {
  const line = await queryOne<{ id: number }>(
    "SELECT id FROM project_lines WHERE id = $1 AND project_id = $2 AND billing = 'one_off'",
    [lineId, projectId]
  );
  if (!line) return "missing";
  await query("UPDATE project_lines SET paid_on = $3 WHERE id = $1 AND project_id = $2", [
    lineId,
    projectId,
    paidOn,
  ]);
  await touchProject(projectId);
  return "ok";
}

export async function getOverheadProject(): Promise<Project> {
  await ensureOverheadProject();
  const row = await queryOne<ProjectRow>("SELECT * FROM projects WHERE is_overhead = TRUE");
  if (!row) throw new Error("Overhead-project ontbreekt");
  return toProject(row);
}

export function parseMonthKey(raw: unknown): string | null {
  return typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null;
}

export function parseProjectInput(body: Record<string, unknown>): ProjectInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return "name verplicht";
  const status = body.status === undefined ? "active" : parseStatus(body.status);
  if (!status) return "status ongeldig";
  const startOn = parseOptionalDate(body.startOn);
  const endOn = parseOptionalDate(body.endOn);
  if (startOn === undefined) return "startOn ongeldig";
  if (endOn === undefined) return "endOn ongeldig";
  if (startOn && endOn && endOn < startOn) return "einddatum ligt voor startdatum";
  return {
    name,
    clientName: typeof body.clientName === "string" ? body.clientName.trim() : "",
    description: typeof body.description === "string" ? body.description.trim() : "",
    status,
    startOn,
    endOn,
  };
}

export function parseLineInput(body: Record<string, unknown>): LineInput | string {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return "name verplicht";
  const direction = parseDirection(body.direction);
  if (!direction) return "direction ongeldig";
  const billing = parseBilling(body.billing);
  if (!billing) return "billing ongeldig";
  const amount = parseAmount(body.amount);
  if (amount === null) return "amount ongeldig";

  const vatRate = parseVatRate(body.vatRate);
  if (vatRate === undefined) return "vatRate ongeldig";

  const paidOn = parseOptionalDate(body.paidOn);
  if (paidOn === undefined) return "paidOn ongeldig";

  const startsOn = parseOptionalDate(body.startsOn);
  if (startsOn === undefined) return "startsOn ongeldig";

  const endsOn = parseOptionalDate(body.endsOn);
  if (endsOn === undefined) return "endsOn ongeldig";
  if (startsOn && endsOn && endsOn < startsOn) return "einddatum ligt voor startdatum";

  const category = parseCategory(body.category);
  if (category === undefined) return "category ongeldig";
  // Expenses default to "overig" when left blank; income categorization stays fully optional.
  const resolvedCategory: string | null = direction === "expense" ? category ?? "overig" : category;

  const amountIncludesVat = typeof body.amountIncludesVat === "boolean" ? body.amountIncludesVat : false;

  const sourceMessageId = parseSourceMessageId(body.sourceMessageId);
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  if (billing === "periodic") {
    // A recurring definition has no single payment date; paid status is tracked per
    // calendar month in project_line_payments instead (see setLinePaidMonth).
    const cadence = parseCadence(body.cadence ?? "month");
    if (!cadence) return "cadence ongeldig";
    return {
      direction,
      billing,
      name,
      amount,
      hours: null,
      cadence,
      occurredOn: null,
      paidOn: null,
      vatRate,
      category: resolvedCategory,
      amountIncludesVat,
      startsOn,
      endsOn,
      sourceMessageId,
      note,
    };
  }

  const occurredOn = parseOptionalDate(body.occurredOn ?? todayIso());
  if (!occurredOn) return "occurredOn verplicht bij eenmalig";

  let hours: number | null = null;
  if (body.hours !== undefined && body.hours !== null && body.hours !== "") {
    hours = parseAmount(body.hours);
    if (hours === null || hours <= 0) return "hours ongeldig";
  }

  return {
    direction,
    billing,
    name,
    amount,
    hours,
    cadence: null,
    occurredOn,
    paidOn,
    vatRate,
    category: resolvedCategory,
    amountIncludesVat,
    startsOn: null,
    endsOn: null,
    sourceMessageId,
    note,
  };
}
