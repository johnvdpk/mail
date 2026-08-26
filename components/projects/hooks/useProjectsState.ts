import { useEffect, useState } from "react";
import {
  periodFromSearchParams,
  periodQueryString,
  todayIso,
} from "@/lib/projects/period";
import type { LineInput, PeriodQuery, ProjectDetail, ProjectInput, ProjectsOverview } from "@/lib/projects/types";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";

type OverviewResponse = ProjectsOverview;
type ProjectResponse = { project?: ProjectDetail };

type Args = {
  setShowSettings: (open: boolean) => void;
  setShowTasksLibrary: (open: boolean) => void;
  setShowTickets: (open: boolean) => void;
  setShowNotes: (open: boolean) => void;
  setNotice: (notice: string | null) => void;
  setError: (error: string | null) => void;
};

function currentMonthPeriod(): PeriodQuery {
  return periodFromSearchParams(new URLSearchParams(), todayIso());
}

export function useProjectsState({
  setShowSettings,
  setShowTasksLibrary,
  setShowTickets,
  setShowNotes,
  setNotice,
  setError,
}: Args) {
  const [showProjects, setShowProjects] = useState(false);
  const [period, setPeriod] = useState<PeriodQuery>(currentMonthPeriod);
  const [overview, setOverview] = useState<ProjectsOverview | null>(null);
  const [active, setActive] = useState<ProjectDetail | null>(null);
  const [overdueCount, setOverdueCount] = useState(0);
  const [remindingId, setRemindingId] = useState<number | null>(null);

  const loadAction = useAsyncAction();
  const submitAction = useAsyncAction();
  const loading = loadAction.loading;
  const submitting = submitAction.loading;

  async function refreshOverdue() {
    try {
      const data = await apiRequest<{ overdueCount: number }>("/api/projects/summary");
      setOverdueCount(data.overdueCount);
    } catch {
      setOverdueCount(0);
    }
  }

  useEffect(() => {
    void refreshOverdue();
  }, []);

  function resetProjectsPanel() {
    setShowProjects(false);
  }

  async function fetchOverview(nextPeriod: PeriodQuery, selectId?: number) {
    const query = periodQueryString(nextPeriod);
    const data = await apiRequest<OverviewResponse>(`/api/projects?${query}`);
    setOverview({
      ...data,
      openItems: data.openItems ?? [],
      expenseCategories: data.expenseCategories ?? [],
      incomeCategories: data.incomeCategories ?? [],
      ledger: data.ledger ?? [],
    });
    const items = data.projects;
    const targetId = selectId ?? active?.id ?? items[0]?.id;
    const target = targetId ? items.find((item) => item.id === targetId) ?? null : null;
    if (!target) {
      setActive(null);
      return data;
    }
    const detail = await apiRequest<ProjectResponse>(`/api/projects/${target.id}?${query}`);
    setActive(detail.project ?? null);
    return data;
  }

  async function loadProjects(selectId?: number, nextPeriod = period) {
    await loadAction.run(async () => {
      setError(null);
      try {
        await fetchOverview(nextPeriod, selectId);
        void refreshOverdue();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Projecten ophalen mislukt");
        throw err;
      }
    }, "Projecten ophalen mislukt");
  }

  async function openProjects() {
    setShowSettings(false);
    setShowTasksLibrary(false);
    setShowTickets(false);
    setShowNotes(false);
    setShowProjects(true);
    await loadProjects();
  }

  async function changePeriod(next: PeriodQuery) {
    setPeriod(next);
    await loadProjects(active?.id, next);
  }

  async function selectProject(id: number) {
    setError(null);
    try {
      const data = await apiRequest<ProjectResponse>(
        `/api/projects/${id}?${periodQueryString(period)}`
      );
      setActive(data.project ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project ophalen mislukt");
    }
  }

  async function createProject(input: ProjectInput) {
    await submitAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<ProjectResponse>("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        setNotice("Project aangemaakt");
        await loadProjects(data.project?.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Project aanmaken mislukt");
        throw err;
      }
    }, "Project aanmaken mislukt");
  }

  async function updateProject(id: number, input: ProjectInput) {
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        setNotice("Project opgeslagen");
        await loadProjects(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Project bijwerken mislukt");
        throw err;
      }
    }, "Project bijwerken mislukt");
  }

  async function removeProject(id: number) {
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/projects/${id}`, { method: "DELETE" });
        setNotice("Project verwijderd");
        if (active?.id === id) setActive(null);
        await loadProjects();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Project verwijderen mislukt");
        throw err;
      }
    }, "Project verwijderen mislukt");
  }

  async function addLine(projectId: number, input: LineInput) {
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/projects/${projectId}/lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        setNotice("Regel toegevoegd");
        await loadProjects(projectId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Regel toevoegen mislukt");
        throw err;
      }
    }, "Regel toevoegen mislukt");
  }

  async function updateLine(projectId: number, lineId: number, input: LineInput) {
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/projects/${projectId}/lines/${lineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        setNotice("Regel bijgewerkt");
        await loadProjects(projectId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Regel bijwerken mislukt");
        throw err;
      }
    }, "Regel bijwerken mislukt");
  }

  async function setLinePaidMonth(projectId: number, lineId: number, month: string | string[], paid: boolean) {
    const months = Array.isArray(month) ? month : [month];
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/projects/${projectId}/lines/${lineId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ months, paid }),
        });
        await loadProjects(projectId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Betaalstatus bijwerken mislukt");
        throw err;
      }
    }, "Betaalstatus bijwerken mislukt");
  }

  async function removeLines(items: Array<{ projectId: number; lineId: number }>) {
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest("/api/projects/lines/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        setNotice(`${items.length} regel(s) verwijderd`);
        await loadProjects(active?.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Regels verwijderen mislukt");
        throw err;
      }
    }, "Regels verwijderen mislukt");
  }

  async function removeLine(projectId: number, lineId: number) {
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/projects/${projectId}/lines/${lineId}`, { method: "DELETE" });
        await loadProjects(projectId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Regel verwijderen mislukt");
        throw err;
      }
    }, "Regel verwijderen mislukt");
  }

  return {
    showProjects,
    setShowProjects,
    period,
    overview,
    active,
    loading,
    submitting,
    resetProjectsPanel,
    openProjects,
    loadProjects,
    changePeriod,
    selectProject,
    createProject,
    updateProject,
    removeProject,
    addLine,
    updateLine,
    removeLine,
    removeLines,
    setLinePaidMonth,
    overdueCount,
    remindingId,
    setRemindingId,
  };
}
