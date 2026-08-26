"use client";

import { useEffect, useState } from "react";
import type { Category, LineDirection } from "@/lib/projects/types";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import styles from "./CategorySelect.module.css";

const NEW_VALUE = "__new__";

type Props = {
  direction: LineDirection;
  value: string | null;
  onChange: (name: string | null) => void;
  /** When true, an explicit "geen categorie" option is offered (used for income, which is optional). */
  allowEmpty?: boolean;
};

type CategoriesResponse = { categories: Category[] };
type CategoryResponse = { category: Category };

/**
 * Self-contained categorie-kiezer: laadt zelf de lijst voor `direction`, en laat de gebruiker
 * inline een nieuwe categorie aanmaken zonder dat de aanroeper de lijst hoeft te beheren.
 */
export function CategorySelect({ direction, value, onChange, allowEmpty }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const action = useAsyncAction();

  useEffect(() => {
    let cancelled = false;
    void apiRequest<CategoriesResponse>(`/api/projects/categories?direction=${direction}`)
      .then((data) => {
        if (!cancelled) setCategories(data.categories);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [direction]);

  async function submitNew() {
    const name = newName.trim();
    if (!name) return;
    const result = await action.run(async () => {
      const data = await apiRequest<CategoryResponse>("/api/projects/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, direction }),
      });
      return data.category;
    }, "Categorie aanmaken mislukt");
    if (!result) return;
    setCategories((current) =>
      current.some((item) => item.id === result.id) ? current : [...current, result]
    );
    onChange(result.name);
    setCreating(false);
    setNewName("");
  }

  if (creating) {
    return (
      <div className={styles.wrap}>
        {action.error && <p className={styles.error}>{action.error}</p>}
        <div className={styles.newRow}>
          <input
            autoFocus
            value={newName}
            placeholder="Nieuwe categorienaam"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submitNew();
              }
            }}
          />
          <button type="button" disabled={action.loading || !newName.trim()} onClick={() => void submitNew()}>
            Toevoegen
          </button>
          <button type="button" onClick={() => setCreating(false)}>
            Annuleren
          </button>
        </div>
      </div>
    );
  }

  return (
    <select
      value={value ?? ""}
      aria-label="Categorie"
      onChange={(event) => {
        const next = event.target.value;
        if (next === NEW_VALUE) {
          setCreating(true);
          return;
        }
        onChange(next || null);
      }}
    >
      {allowEmpty && <option value="">Geen categorie</option>}
      {!allowEmpty && !value && <option value="">Kies een categorie</option>}
      {categories.map((category) => (
        <option key={category.id} value={category.name}>
          {category.name}
        </option>
      ))}
      <option value={NEW_VALUE}>+ Nieuwe categorie…</option>
    </select>
  );
}
