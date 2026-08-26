import { useState } from "react";
import type { Note } from "@/lib/notes/notes";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";

type NotesListResponse = { notes?: Note[] };
type NoteResponse = { note?: Note };

type Args = {
  setShowSettings: (open: boolean) => void;
  setShowTasksLibrary: (open: boolean) => void;
  setShowTickets: (open: boolean) => void;
  setNotice: (notice: string | null) => void;
  setError: (error: string | null) => void;
};

export function useNotesState({
  setShowSettings,
  setShowTasksLibrary,
  setShowTickets,
  setNotice,
  setError,
}: Args) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);

  const loadAction = useAsyncAction();
  const submitAction = useAsyncAction();
  const notesLoading = loadAction.loading;
  const noteSubmitting = submitAction.loading;

  function resetNotesPanel() {
    setShowNotes(false);
  }

  async function selectNote(id: number) {
    setError(null);
    try {
      const data = await apiRequest<NoteResponse>(`/api/notes/${id}`);
      setActiveNote(data.note as Note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notitie ophalen mislukt");
    }
  }

  async function loadNotes(selectId?: number) {
    await loadAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<NotesListResponse>("/api/notes");
        const items = data.notes ?? [];
        setNotes(items);

        const targetId = selectId ?? activeNote?.id ?? items[0]?.id;
        const target = targetId ? items.find((n) => n.id === targetId) ?? null : null;
        setActiveNote(target);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Notities ophalen mislukt");
        throw err;
      }
    }, "Notities ophalen mislukt");
  }

  async function openNotes() {
    setShowSettings(false);
    setShowTasksLibrary(false);
    setShowTickets(false);
    setShowNotes(true);
    await loadNotes();
  }

  async function createNote(title: string, body: string) {
    await submitAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<NoteResponse>("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
        setNotice("Notitie aangemaakt");
        await loadNotes(data.note?.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Notitie aanmaken mislukt");
        throw err;
      }
    }, "Notitie aanmaken mislukt");
  }

  async function updateNote(id: number, title: string, body: string) {
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/notes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
        setNotice("Notitie opgeslagen");
        await loadNotes(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Notitie bijwerken mislukt");
        throw err;
      }
    }, "Notitie bijwerken mislukt");
  }

  async function deleteNote(id: number) {
    await submitAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/notes/${id}`, { method: "DELETE" });
        setNotice("Notitie verwijderd");
        if (activeNote?.id === id) setActiveNote(null);
        await loadNotes();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Notitie verwijderen mislukt");
        throw err;
      }
    }, "Notitie verwijderen mislukt");
  }

  return {
    showNotes,
    setShowNotes,
    notes,
    activeNote,
    notesLoading,
    noteSubmitting,
    resetNotesPanel,
    openNotes,
    selectNote,
    createNote,
    updateNote,
    deleteNote,
  };
}
