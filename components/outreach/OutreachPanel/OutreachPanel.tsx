"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import { useCampaignCrud } from "@/components/outreach/hooks/useCampaignCrud";
import { CampaignSwitcher } from "@/components/outreach/CampaignSwitcher/CampaignSwitcher";
import { AutomailPanel } from "@/components/outreach/AutomailPanel/AutomailPanel";
import { CampaignProfileEditor } from "@/components/outreach/CampaignProfileEditor/CampaignProfileEditor";
import { EmailPreviewModal } from "@/components/outreach/EmailPreviewModal/EmailPreviewModal";
import { ImportLeadsModal } from "@/components/outreach/ImportLeadsModal/ImportLeadsModal";
import { BatchSendModal } from "@/components/outreach/BatchSendModal/BatchSendModal";
import { SentPanel } from "@/components/outreach/SentPanel/SentPanel";
import { OutreachLeads } from "@/components/outreach/OutreachLeads/OutreachLeads";
import type { PersonalizeResult } from "@/lib/outreach/personalize";
import { stripSignatureFromText } from "@/lib/outreach/email-template";
import {
  TARGET_PAGE_SIZE,
  type CampaignTarget,
  type EmailDraft,
  type ImportResult,
  type SortDir,
  type TargetStats,
  type TargetStatus,
} from "@/lib/outreach/types";
import styles from "./OutreachPanel.module.css";

type Tab = "leads" | "profile" | "sent" | "automail";

type Props = {
  aiReady: boolean;
  smtpReady: boolean;
  onClose: () => void;
  onOpenThread?: (inboxMessageId: string, replyDraft?: string) => void;
};

const EMPTY_STATS: TargetStats = {
  total: 0,
  uniqueEmails: 0,
  withEmail: 0,
  emailed: 0,
  excluded: 0,
  notInterested: 0,
};

export function OutreachPanel({ aiReady, smtpReady, onClose, onOpenThread }: Props) {
  const {
    campaigns,
    activeId,
    setActiveId,
    campaign,
    loadCampaigns,
    createCampaign,
    removeCampaign,
    updateCampaign,
    loadCampaignsAction,
    createAction,
    deleteAction,
  } = useCampaignCrud();
  const [targets, setTargets] = useState<CampaignTarget[]>([]);
  const [stats, setStats] = useState<TargetStats>(EMPTY_STATS);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(TARGET_PAGE_SIZE);
  const [tab, setTab] = useState<Tab>("leads");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TargetStatus | "">("");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Map<number, CampaignTarget>>(new Map());
  const [drafts, setDrafts] = useState<Record<number, EmailDraft>>({});
  const [personalizeErrors, setPersonalizeErrors] = useState<Record<number, string>>({});
  const [previewTarget, setPreviewTarget] = useState<CampaignTarget | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTargetsAction = useAsyncAction();
  const statusAction = useAsyncAction();
  const selectAllAction = useAsyncAction();
  const loadTargetsRun = loadTargetsAction.run;

  const loadTargets = useCallback(
    async (campaignId: number, nextPage = page) => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (appliedQuery.trim()) params.set("q", appliedQuery.trim());
      if (sortField) {
        params.set("sort", sortField);
        params.set("dir", sortDir);
      }
      params.set("page", String(nextPage));
      params.set("limit", String(pageSize));
      const data = await loadTargetsRun(
        () =>
          apiRequest<{
            targets: CampaignTarget[];
            stats: TargetStats;
            total: number;
          }>(`/api/outreach/campaigns/${campaignId}/targets?${params}`),
        "Leads ophalen mislukt"
      );
      if (!data) return;
      setTargets(data.targets);
      setStats(data.stats);
      setFilteredTotal(data.total);
    },
    [loadTargetsRun, appliedQuery, statusFilter, page, pageSize, sortField, sortDir]
  );

  function handleSort(field: string) {
    setPage(1);
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (activeId) void loadTargets(activeId, page);
  }, [activeId, loadTargets, page]);

  async function patchStatus(target: CampaignTarget, status: TargetStatus) {
    if (!campaign) return;
    const next = target.status === status ? "new" : status;
    const data = await statusAction.run(
      () =>
        apiRequest<{ target: CampaignTarget; stats: TargetStats }>(
          `/api/outreach/campaigns/${campaign.id}/targets`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetId: target.id, status: next }),
          }
        ),
      "Status bijwerken mislukt"
    );
    if (!data) return;
    setTargets((prev) => prev.map((t) => (t.id === target.id ? data.target : t)));
    setStats(data.stats);
    setSelected((prev) => {
      if (!prev.has(target.id)) return prev;
      const copy = new Map(prev);
      copy.set(target.id, data.target);
      return copy;
    });
  }

  function toggleSelect(id: number) {
    const target = targets.find((t) => t.id === id);
    if (!target) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, target);
      return next;
    });
  }

  function togglePage() {
    const allOn = targets.length > 0 && targets.every((t) => selected.has(t.id));
    setSelected((prev) => {
      const next = new Map(prev);
      for (const target of targets) {
        if (allOn) next.delete(target.id);
        else next.set(target.id, target);
      }
      return next;
    });
  }

  async function selectAllMatching() {
    if (!campaign) return;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (appliedQuery.trim()) params.set("q", appliedQuery.trim());
    const data = await selectAllAction.run(
      () =>
        apiRequest<{ targets: CampaignTarget[]; truncated: boolean }>(
          `/api/outreach/campaigns/${campaign.id}/targets/select-all?${params}`
        ),
      "Alle leads selecteren mislukt"
    );
    if (!data) return;
    setSelected(new Map(data.targets.map((t) => [t.id, t])));
    if (data.truncated) {
      setNotice(
        `Alleen de eerste ${data.targets.length} leads zijn geselecteerd (limiet bereikt) — verfijn het filter voor de rest.`
      );
    }
  }

  async function personalizeSelected() {
    if (!campaign || !aiReady) return;
    const queue = [...selected.values()].filter((t) => t.status === "new");
    if (queue.length === 0) {
      setNotice("Geen nieuwe leads in de selectie. Al gemaild of overgeslagen tellen niet mee.");
      return;
    }
    setNotice(null);
    setPersonalizeErrors({});
    setBatchProgress({ current: 0, total: queue.length });
    const failures: Record<number, string> = {};
    for (let i = 0; i < queue.length; i++) {
      const target = queue[i];
      try {
        const data = await apiRequest<PersonalizeResult>(
          `/api/outreach/campaigns/${campaign.id}/targets/${target.id}/personalize`,
          { method: "POST" }
        );
        setDrafts((prev) => ({
          ...prev,
          [target.id]: {
            subject: data.subject,
            text: data.text,
            html: data.html,
            bodyText: stripSignatureFromText(data.bodyText || data.text, campaign.profile.footer.text),
            findings: data.findings,
            scan: data.scan,
            websiteError: data.websiteError,
            usedMetadataFallback: data.usedMetadataFallback,
          },
        }));
      } catch (err) {
        failures[target.id] = err instanceof Error ? err.message : "Personalisatie mislukt";
      }
      setBatchProgress({ current: i + 1, total: queue.length });
    }
    setPersonalizeErrors(failures);
    setBatchProgress(null);
    setShowBatch(true);
  }

  function onImported(result: ImportResult) {
    setShowImport(false);
    setNotice(
      `Geïmporteerd: ${result.imported} nieuw, ${result.updated} bijgewerkt, ${result.skipped} overgeslagen`
    );
    setPage(1);
    if (activeId) void loadTargets(activeId, 1);
  }

  const selectedTargets = useMemo(() => [...selected.values()], [selected]);
  const error =
    loadCampaignsAction.error ||
    loadTargetsAction.error ||
    createAction.error ||
    deleteAction.error ||
    statusAction.error;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>Outreach</h2>
          <p className={styles.sub}>Campagnes, leads en verzonden mails.</p>
        </div>
        <button type="button" onClick={onClose}>
          Terug naar mail
        </button>
      </header>

      <CampaignSwitcher
        campaigns={campaigns}
        activeId={activeId}
        campaign={campaign}
        createLoading={createAction.loading}
        deleteLoading={deleteAction.loading}
        onSelect={(id) => {
          setActiveId(id);
          setPage(1);
          setSelected(new Map());
          setDrafts({});
        }}
        onCreate={async (name) => {
          const ok = await createCampaign(name);
          if (ok) setTab("profile");
          return ok;
        }}
        onDelete={() => {
          void (async () => {
            const ok = await removeCampaign();
            if (ok) {
              setSelected(new Map());
              setDrafts({});
              setTab("leads");
            }
          })();
        }}
      />

      <nav className={styles.tabs} aria-label="Outreach onderdelen">
        {(["leads", "profile", "sent", "automail"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            className={tab === id ? styles.tabActive : undefined}
            onClick={() => setTab(id)}
            disabled={!campaign && id !== "leads"}
          >
            {id === "leads"
              ? "Leads"
              : id === "profile"
                ? "Campagne-instellingen"
                : id === "sent"
                  ? "Verzonden"
                  : "Automail"}
          </button>
        ))}
      </nav>

      {error && <p className={styles.error}>{error}</p>}
      {notice && <p className={styles.notice}>{notice}</p>}

      {!campaign ? (
        <p className={styles.empty}>Maak eerst een campagne aan.</p>
      ) : tab === "profile" ? (
        <CampaignProfileEditor
          key={`${campaign.id}-${campaign.updatedAt}`}
          campaign={campaign}
          onSaved={updateCampaign}
        />
      ) : tab === "sent" ? (
        <SentPanel campaignId={campaign.id} aiReady={aiReady} onOpenThread={onOpenThread} />
      ) : tab === "automail" ? (
        <AutomailPanel key={campaign.id} campaign={campaign} />
      ) : (
        <OutreachLeads
          targets={targets}
          stats={stats}
          filteredTotal={filteredTotal}
          page={page}
          pageSize={pageSize}
          loading={loadTargetsAction.loading}
          query={query}
          statusFilter={statusFilter}
          sortField={sortField}
          sortDir={sortDir}
          selected={new Set(selected.keys())}
          drafts={drafts}
          listColumns={campaign.profile.listColumns}
          aiReady={aiReady}
          batchProgress={batchProgress}
          selectAllLoading={selectAllAction.loading}
          onQueryChange={setQuery}
          onSearch={() => {
            setPage(1);
            setAppliedQuery(query);
          }}
          onStatusFilter={(value) => {
            setPage(1);
            setStatusFilter(value);
          }}
          onSort={handleSort}
          onPageSizeChange={(size) => {
            setPage(1);
            setPageSize(size);
          }}
          onPage={setPage}
          onToggle={toggleSelect}
          onTogglePage={togglePage}
          onSelectAllMatching={() => void selectAllMatching()}
          onImport={() => setShowImport(true)}
          onPersonalize={() => void personalizeSelected()}
          onReview={() => setShowBatch(true)}
          onClearSelection={() => setSelected(new Map())}
          onPreview={setPreviewTarget}
          onStatus={(target, status) => void patchStatus(target, status)}
        />
      )}

      {showImport && campaign && (
        <ImportLeadsModal
          campaignId={campaign.id}
          onClose={() => setShowImport(false)}
          onImported={onImported}
        />
      )}
      {previewTarget && campaign && (
        <EmailPreviewModal
          key={previewTarget.id}
          campaign={campaign}
          target={previewTarget}
          initialDraft={drafts[previewTarget.id]}
          aiReady={aiReady}
          smtpReady={smtpReady}
          onClose={() => setPreviewTarget(null)}
          onDraftChange={(id, draft) => setDrafts((prev) => ({ ...prev, [id]: draft }))}
          onSent={(id) => {
            setPreviewTarget(null);
            if (activeId) void loadTargets(activeId, page);
            setSelected((prev) => {
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
          }}
        />
      )}
      {showBatch && campaign && (
        <BatchSendModal
          campaign={campaign}
          queue={selectedTargets}
          drafts={drafts}
          personalizeErrors={personalizeErrors}
          smtpReady={smtpReady}
          onClose={() => setShowBatch(false)}
          onDraftChange={(id, draft) => setDrafts((prev) => ({ ...prev, [id]: draft }))}
          onSent={() => {
            if (activeId) void loadTargets(activeId, page);
          }}
        />
      )}
    </div>
  );
}
