import { query, queryOne } from "./db";

export type TicketStatus = "open" | "in_progress" | "review" | "done" | "rejected";
export type TicketRunStatus = "running" | "success" | "failed";

export type TicketSummary = {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  branch: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketRun = {
  id: number;
  ticketId: number;
  startedAt: string;
  finishedAt: string | null;
  status: TicketRunStatus;
  branch: string;
  summary: string | null;
  agentLog: string | null;
  diffStat: string | null;
};

export type TicketDetail = TicketSummary & { runs: TicketRun[] };

type TicketRow = {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  branch: string | null;
  created_at: Date;
  updated_at: Date;
};

type TicketRunRow = {
  id: number;
  ticket_id: number;
  started_at: Date;
  finished_at: Date | null;
  status: TicketRunStatus;
  branch: string;
  summary: string | null;
  agent_log: string | null;
  diff_stat: string | null;
};

function toTicket(row: TicketRow): TicketSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    branch: row.branch,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toRun(row: TicketRunRow): TicketRun {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
    status: row.status,
    branch: row.branch,
    summary: row.summary,
    agentLog: row.agent_log,
    diffStat: row.diff_stat,
  };
}

export async function listTickets(): Promise<TicketSummary[]> {
  const { rows } = await query<TicketRow>(
    "SELECT * FROM tickets ORDER BY created_at DESC"
  );
  return rows.map(toTicket);
}

export async function createTicket(title: string, description: string): Promise<TicketSummary> {
  const row = await queryOne<TicketRow>(
    `INSERT INTO tickets (title, description) VALUES ($1, $2) RETURNING *`,
    [title, description]
  );
  if (!row) throw new Error("Ticket aanmaken mislukt");
  return toTicket(row);
}

export async function getTicket(id: number): Promise<TicketDetail | null> {
  const ticketRow = await queryOne<TicketRow>("SELECT * FROM tickets WHERE id = $1", [id]);
  if (!ticketRow) return null;

  const { rows: runRows } = await query<TicketRunRow>(
    "SELECT * FROM ticket_runs WHERE ticket_id = $1 ORDER BY started_at DESC",
    [id]
  );

  return { ...toTicket(ticketRow), runs: runRows.map(toRun) };
}
