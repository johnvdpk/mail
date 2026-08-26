import { useEffect, useState } from "react";
import type { ContactStatus, ContactView, SearchJobSummary, SearchJobView } from "@/lib/shared/search-types";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { MailJobsPayload } from "./useMailThreadsState";

const SEARCH_POLL_MS = 8_000;

type SearchJobsResponse = { jobs?: SearchJobSummary[] };
type SearchJobResponse = { job?: SearchJobView };
type ContactsResponse = { contacts?: ContactView[] };
type ContactUpdateResponse = { contact: ContactView };

type Args = {
  applyEmbeddingProgress: (data: MailJobsPayload) => void;
  processJobs: () => Promise<void>;
  aiReady: boolean;
  setError: (error: string | null) => void;
};

export function useSemanticSearchState({
  applyEmbeddingProgress,
  processJobs,
  aiReady,
  setError,
}: Args) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchJobs, setSearchJobs] = useState<SearchJobSummary[]>([]);
  const [activeSearchJob, setActiveSearchJob] = useState<SearchJobView | null>(null);
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [contactStatusFilter, setContactStatusFilter] = useState<ContactStatus | "all">("all");

  const searchAction = useAsyncAction();
  const contactsAction = useAsyncAction();
  const searchBusy = searchAction.loading;
  const contactsLoading = contactsAction.loading;

  function closeSearch() {
    setSearchOpen(false);
  }

  async function loadSearchJobs() {
    try {
      const data = await apiRequest<SearchJobsResponse>("/api/ai/search");
      setSearchJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoekopdrachten ophalen mislukt");
    }
  }

  async function openSearch() {
    setSearchOpen(true);
    setError(null);
    await loadSearchJobs();
    void processJobs();
  }

  async function selectSearchJob(id: number) {
    setError(null);
    try {
      const data = await apiRequest<SearchJobResponse>(`/api/ai/search?id=${id}`);
      setActiveSearchJob(data.job ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zoekopdracht ophalen mislukt");
    }
  }

  async function submitSearch(prompt: string) {
    if (!aiReady || searchBusy) return;
    await searchAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<SearchJobResponse>("/api/ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        setActiveSearchJob(data.job ?? null);
        await loadSearchJobs();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Zoeken mislukt");
        throw err;
      }
    }, "Zoeken mislukt");
  }

  async function deleteSearchJob(id: number) {
    setError(null);
    try {
      await apiRequest(`/api/ai/search?id=${id}`, { method: "DELETE" });
      if (activeSearchJob?.id === id) setActiveSearchJob(null);
      await loadSearchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
    }
  }

  async function loadContacts(status?: ContactStatus | "all") {
    const effective = status ?? contactStatusFilter;
    await contactsAction.run(async () => {
      setError(null);
      try {
        const qs = effective !== "all" ? `?status=${effective}` : "";
        const data = await apiRequest<ContactsResponse>(`/api/ai/contacts${qs}`);
        setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Contacten ophalen mislukt");
        throw err;
      }
    }, "Contacten ophalen mislukt");
  }

  async function changeContactStatusFilter(status: ContactStatus | "all") {
    setContactStatusFilter(status);
    await loadContacts(status);
  }

  async function updateContactStatus(id: number, status: ContactStatus) {
    setError(null);
    try {
      const data = await apiRequest<ContactUpdateResponse>(`/api/ai/contacts?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setContacts((prev) => prev.map((c) => (c.id === id ? data.contact : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bijwerken mislukt");
    }
  }

  useEffect(() => {
    if (!searchOpen || !activeSearchJob) return;
    const status = activeSearchJob.status;
    if (status !== "keyword_done" && status !== "semantic_running") return;

    const timer = setInterval(() => {
      void (async () => {
        try {
          try {
            const jobsData = await apiRequest<MailJobsPayload>("/api/mail-jobs");
            applyEmbeddingProgress(jobsData);
          } catch {
            // Non-blocking — still refresh the active job below
          }
          const data = await apiRequest<SearchJobResponse>(`/api/ai/search?id=${activeSearchJob.id}`);
          if (!data.job) return;
          setActiveSearchJob(data.job);
          if (data.job.status === "done" || data.job.status === "failed") {
            await loadSearchJobs();
          }
        } catch {
          // Non-blocking
        }
      })();
    }, SEARCH_POLL_MS);

    return () => clearInterval(timer);
  }, [searchOpen, activeSearchJob?.id, activeSearchJob?.status]);

  return {
    searchOpen,
    setSearchOpen,
    searchBusy,
    searchJobs,
    activeSearchJob,
    contacts,
    contactsLoading,
    contactStatusFilter,
    closeSearch,
    openSearch,
    selectSearchJob,
    submitSearch,
    deleteSearchJob,
    loadContacts,
    changeContactStatusFilter,
    updateContactStatus,
  };
}
