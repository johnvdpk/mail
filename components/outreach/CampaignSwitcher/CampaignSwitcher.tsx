"use client";

import { useState } from "react";
import type { Campaign } from "@/lib/outreach/types";
import styles from "../OutreachPanel/OutreachPanel.module.css";

type Props = {
  campaigns: Campaign[];
  activeId: number | null;
  campaign: Campaign | null;
  createLoading: boolean;
  deleteLoading: boolean;
  onSelect: (id: number | null) => void;
  onCreate: (name: string) => Promise<boolean>;
  onDelete: () => void;
};

export function CampaignSwitcher({
  campaigns,
  activeId,
  campaign,
  createLoading,
  deleteLoading,
  onSelect,
  onCreate,
  onDelete,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  async function submit() {
    const ok = await onCreate(newName);
    if (ok) {
      setNewName("");
      setCreating(false);
    }
  }

  return (
    <div className={styles.toolbar}>
      <label className={styles.switcher}>
        Campagne
        <select
          value={activeId ?? ""}
          onChange={(e) => onSelect(Number(e.target.value) || null)}
        >
          {campaigns.length === 0 && <option value="">Nog geen campagne</option>}
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {creating ? (
        <form
          className={styles.createForm}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Naam van de campagne"
            autoFocus
          />
          <button type="submit" disabled={createLoading}>
            Aanmaken
          </button>
          <button type="button" onClick={() => setCreating(false)}>
            Annuleren
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)}>
          Nieuwe campagne
        </button>
      )}
      {campaign && (
        <button type="button" className={styles.delete} onClick={onDelete} disabled={deleteLoading}>
          Verwijderen
        </button>
      )}
    </div>
  );
}
