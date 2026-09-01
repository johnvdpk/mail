"use client";

import { useCallback, useState } from "react";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import type { Campaign } from "@/lib/outreach/types";

export function useCampaignCrud() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const loadCampaignsAction = useAsyncAction();
  const createAction = useAsyncAction();
  const deleteAction = useAsyncAction();
  const loadCampaignsRun = loadCampaignsAction.run;

  const campaign = campaigns.find((c) => c.id === activeId) ?? null;

  const loadCampaigns = useCallback(async () => {
    const data = await loadCampaignsRun(
      () => apiRequest<{ campaigns: Campaign[] }>("/api/outreach/campaigns"),
      "Campagnes ophalen mislukt"
    );
    if (!data) return;
    setCampaigns(data.campaigns);
    setActiveId((prev) => {
      if (prev && data.campaigns.some((c) => c.id === prev)) return prev;
      return data.campaigns[0]?.id ?? null;
    });
  }, [loadCampaignsRun]);

  async function createCampaign(name: string): Promise<boolean> {
    if (!name.trim()) return false;
    const data = await createAction.run(
      () =>
        apiRequest<{ campaign: Campaign }>("/api/outreach/campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        }),
      "Campagne aanmaken mislukt"
    );
    if (!data?.campaign) return false;
    setCampaigns((prev) => [...prev, data.campaign]);
    setActiveId(data.campaign.id);
    return true;
  }

  async function removeCampaign(): Promise<boolean> {
    if (!campaign) return false;
    if (
      !window.confirm(
        `Campagne "${campaign.name}" verwijderen? Alle leads en verzonden mails van deze campagne gaan mee.`
      )
    ) {
      return false;
    }
    const data = await deleteAction.run(
      () =>
        apiRequest<{ ok: boolean }>(`/api/outreach/campaigns/${campaign.id}`, { method: "DELETE" }),
      "Campagne verwijderen mislukt"
    );
    if (!data?.ok) return false;
    const remaining = campaigns.filter((c) => c.id !== campaign.id);
    setCampaigns(remaining);
    setActiveId(remaining[0]?.id ?? null);
    return true;
  }

  function updateCampaign(updated: Campaign): void {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  return {
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
  };
}
