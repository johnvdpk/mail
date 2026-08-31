"use client";

import type { ListColumn } from "@/lib/outreach/campaign-profile";
import { formatListColumnValue } from "@/lib/outreach/list-columns";
import {
  TARGET_STATUS_LABELS,
  type CampaignTarget,
  type EmailDraft,
  type SortDir,
  type TargetStats,
  type TargetStatus,
} from "@/lib/outreach/types";
import styles from "../OutreachPanel/OutreachPanel.module.css";

const PAGE_SIZE_OPTIONS = [50, 100, 200];

type Props = {
  targets: CampaignTarget[];
  stats: TargetStats;
  filteredTotal: number;
  page: number;
  pageSize: number;
  loading: boolean;
  query: string;
  statusFilter: TargetStatus | "";
  sortField: string | null;
  sortDir: SortDir;
  selected: Set<number>;
  drafts: Record<number, EmailDraft>;
  listColumns: ListColumn[];
  aiReady: boolean;
  batchProgress: { current: number; total: number } | null;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onStatusFilter: (value: TargetStatus | "") => void;
  onSort: (field: string) => void;
  onPageSizeChange: (size: number) => void;
  onPage: (page: number) => void;
  onToggle: (id: number) => void;
  onTogglePage: () => void;
  onImport: () => void;
  onPersonalize: () => void;
  onReview: () => void;
  onClearSelection: () => void;
  onPreview: (target: CampaignTarget) => void;
  onStatus: (target: CampaignTarget, status: TargetStatus) => void;
};

export function OutreachLeads({
  targets,
  stats,
  filteredTotal,
  page,
  pageSize,
  loading,
  query,
  statusFilter,
  sortField,
  sortDir,
  selected,
  drafts,
  listColumns,
  aiReady,
  batchProgress,
  onQueryChange,
  onSearch,
  onStatusFilter,
  onSort,
  onPageSizeChange,
  onPage,
  onToggle,
  onTogglePage,
  onImport,
  onPersonalize,
  onReview,
  onClearSelection,
  onPreview,
  onStatus,
}: Props) {
  const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const allOnPageSelected = targets.length > 0 && targets.every((t) => selected.has(t.id));

  return (
    <>
      <div className={styles.stats}>
        <Stat label="Totaal" value={stats.total} />
        <Stat label="Uniek" value={stats.uniqueEmails} />
        <Stat label="Met e-mail" value={stats.withEmail} />
        <Stat label="Gemaild" value={stats.emailed} />
        <Stat label="Uitgesloten" value={stats.excluded} />
        <Stat label="Geen interesse" value={stats.notInterested} />
      </div>

      <div className={styles.filters}>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch();
          }}
          placeholder="Zoek op naam, e-mail of website"
        />
        <button type="button" onClick={onSearch}>
          Zoek
        </button>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilter(e.target.value as TargetStatus | "")}
        >
          <option value="">Alle statussen</option>
          {Object.entries(TARGET_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" onClick={onImport}>
          Importeer leads
        </button>
      </div>

      {batchProgress && (
        <p className={styles.notice} role="status" aria-live="polite">
          AI bezig: {batchProgress.current}/{batchProgress.total} leads. Dit kan per lead tot een minuut duren.
        </p>
      )}

      {selected.size > 0 && (
        <div className={styles.bulk}>
          <span>{selected.size} geselecteerd</span>
          {aiReady && (
            <button type="button" onClick={onPersonalize} disabled={Boolean(batchProgress)}>
              {batchProgress
                ? `AI ${batchProgress.current}/${batchProgress.total}…`
                : "Personaliseer & review"}
            </button>
          )}
          <button type="button" onClick={onReview}>
            Review & verstuur
          </button>
          <button type="button" onClick={onClearSelection}>
            Wis selectie
          </button>
        </div>
      )}

      <div className={styles.tableWrap}>
        {loading && targets.length === 0 ? (
          <p className={styles.empty}>Leads laden…</p>
        ) : targets.length === 0 ? (
          <p className={styles.empty}>Nog geen leads. Importeer een JSON-bestand.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={onTogglePage}
                    aria-label="Selecteer pagina"
                  />
                </th>
                <SortHeader field="name" label="Naam" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="email" label="E-mail" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <SortHeader field="website" label="Website" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                {listColumns.map((col) => (
                  <SortHeader
                    key={col.key}
                    field={col.key}
                    label={col.label}
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                ))}
                <SortHeader field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={onSort} />
                <th>Acties</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(target.id)}
                      onChange={() => onToggle(target.id)}
                      aria-label={`Selecteer ${target.name}`}
                    />
                  </td>
                  <td>{target.name}</td>
                  <td>{target.email}</td>
                  <td>
                    {target.website ? (
                      <a href={target.website} target="_blank" rel="noreferrer">
                        {target.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {listColumns.map((col) => (
                    <td key={col.key}>{formatListColumnValue(col, target.attributes[col.key])}</td>
                  ))}
                  <td>{TARGET_STATUS_LABELS[target.status]}</td>
                  <td className={styles.rowActions}>
                    <button type="button" onClick={() => onPreview(target)}>
                      {drafts[target.id] ? "Preview" : "Personaliseer"}
                    </button>
                    <button type="button" onClick={() => onStatus(target, "excluded")}>
                      {target.status === "excluded" ? "Terug" : "Skip"}
                    </button>
                    <button type="button" onClick={() => onStatus(target, "not_interested")}>
                      {target.status === "not_interested" ? "Terug" : "Nee"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.pager}>
        <label>
          Per pagina{" "}
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        {filteredTotal > pageSize && (
          <>
            <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              Vorige
            </button>
            <span>
              Pagina {page} van {pageCount} ({filteredTotal} leads)
            </span>
            <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
              Volgende
            </button>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: string;
  label: string;
  sortField: string | null;
  sortDir: SortDir;
  onSort: (field: string) => void;
}) {
  const active = sortField === field;
  return (
    <th>
      <button type="button" className={styles.sortBtn} onClick={() => onSort(field)}>
        {label}
        {active && <span aria-hidden="true">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
      </button>
    </th>
  );
}
