"use client";

import { useEffect, useState } from "react";
import type { Category, LineDirection } from "@/lib/projects/types";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";
import { DIRECTION_LABELS } from "../labels";
import styles from "./CategoryManager.module.css";

type CategoriesResponse = { categories: Category[] };
type CategoryResponse = { category: Category };

/** Categories are global (not project-scoped) and free-text — renaming cascades to existing lines/rules server-side. */
export function CategoryManager() {
  const [income, setIncome] = useState<Category[]>([]);
  const [expense, setExpense] = useState<Category[]>([]);

  function load() {
    void apiRequest<CategoriesResponse>("/api/projects/categories")
      .then((data) => {
        setIncome(data.categories.filter((category) => category.direction === "income"));
        setExpense(data.categories.filter((category) => category.direction === "expense"));
      })
      .catch(() => {
        setIncome([]);
        setExpense([]);
      });
  }

  useEffect(load, []);

  return (
    <div className={styles.columns}>
      <CategoryColumn direction="income" categories={income} onChanged={load} />
      <CategoryColumn direction="expense" categories={expense} onChanged={load} />
    </div>
  );
}

function CategoryColumn({
  direction,
  categories,
  onChanged,
}: {
  direction: LineDirection;
  categories: Category[];
  onChanged: () => void;
}) {
  const action = useAsyncAction();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const result = await action.run(
      () =>
        apiRequest<CategoryResponse>("/api/projects/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, direction }),
        }),
      "Categorie aanmaken mislukt"
    );
    if (!result) return;
    setNewName("");
    onChanged();
  }

  async function rename(id: number) {
    const name = editName.trim();
    if (!name) return;
    const result = await action.run(
      () =>
        apiRequest<CategoryResponse>(`/api/projects/categories/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      "Categorie hernoemen mislukt"
    );
    if (!result) return;
    setEditingId(null);
    onChanged();
  }

  async function remove(id: number, name: string) {
    if (!window.confirm(`Categorie "${name}" verwijderen? Bestaande regels met deze categorie blijven ongewijzigd.`)) {
      return;
    }
    const result = await action.run(
      () => apiRequest(`/api/projects/categories/${id}`, { method: "DELETE" }),
      "Categorie verwijderen mislukt"
    );
    if (result !== undefined) onChanged();
  }

  return (
    <div>
      <h4 className={styles.columnTitle}>{DIRECTION_LABELS[direction]}</h4>
      {action.error && <p className={styles.error}>{action.error}</p>}
      {categories.length === 0 ? (
        <p className={styles.empty}>Nog geen categorieën.</p>
      ) : (
        <ul className={styles.list}>
          {categories.map((category) =>
            editingId === category.id ? (
              <li key={category.id}>
                <input
                  autoFocus
                  className={styles.editInput}
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void rename(category.id);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={action.loading || !editName.trim()}
                  onClick={() => void rename(category.id)}
                >
                  Opslaan
                </button>
                <button type="button" onClick={() => setEditingId(null)}>
                  Annuleren
                </button>
              </li>
            ) : (
              <li key={category.id}>
                <span className={styles.name}>{category.name}</span>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => {
                    setEditingId(category.id);
                    setEditName(category.name);
                  }}
                >
                  Hernoemen
                </button>
                <button
                  type="button"
                  className={styles.linkBtn}
                  disabled={action.loading}
                  onClick={() => void remove(category.id, category.name)}
                >
                  Verwijderen
                </button>
              </li>
            )
          )}
        </ul>
      )}
      <div className={styles.addRow}>
        <input
          value={newName}
          placeholder="Nieuwe categorienaam"
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add();
            }
          }}
        />
        <button type="button" disabled={action.loading || !newName.trim()} onClick={() => void add()}>
          Toevoegen
        </button>
      </div>
    </div>
  );
}
