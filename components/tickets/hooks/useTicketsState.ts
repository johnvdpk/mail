import { useState } from "react";
import type { TicketDetail, TicketSummary } from "@/lib/tickets/tickets";
import { apiRequest } from "@/lib/shared/api-request";
import { useAsyncAction } from "@/lib/shared/use-async-action";

type TicketsListResponse = { tickets?: TicketSummary[] };
type TicketResponse = { ticket?: TicketDetail };

type Args = {
  setShowSettings: (open: boolean) => void;
  setShowTasksLibrary: (open: boolean) => void;
  setNotice: (notice: string | null) => void;
  setError: (error: string | null) => void;
};

export function useTicketsState({
  setShowSettings,
  setShowTasksLibrary,
  setNotice,
  setError,
}: Args) {
  const [showTickets, setShowTickets] = useState(false);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [activeTicket, setActiveTicket] = useState<TicketDetail | null>(null);

  const loadAction = useAsyncAction();
  const createAction = useAsyncAction();
  const commentAction = useAsyncAction();
  const ticketsLoading = loadAction.loading;
  const ticketSubmitting = createAction.loading;
  const commentSubmitting = commentAction.loading;

  function resetTicketsPanel() {
    setShowTickets(false);
  }

  async function selectTicket(id: number) {
    setError(null);
    try {
      const data = await apiRequest<TicketResponse>(`/api/tickets/${id}`);
      setActiveTicket(data.ticket as TicketDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ticket ophalen mislukt");
    }
  }

  async function loadTickets(selectId?: number) {
    await loadAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<TicketsListResponse>("/api/tickets");
        const items = data.tickets ?? [];
        setTickets(items);

        const targetId = selectId ?? activeTicket?.id ?? items[0]?.id;
        if (targetId) {
          await selectTicket(targetId);
        } else {
          setActiveTicket(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Tickets ophalen mislukt");
        throw err;
      }
    }, "Tickets ophalen mislukt");
  }

  async function openTickets() {
    setShowSettings(false);
    setShowTasksLibrary(false);
    setShowTickets(true);
    await loadTickets();
  }

  async function createTicket(title: string, description: string) {
    await createAction.run(async () => {
      setError(null);
      try {
        const data = await apiRequest<TicketResponse>("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        });
        setNotice("Ticket aangemaakt");
        await loadTickets(data.ticket?.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ticket aanmaken mislukt");
        throw err;
      }
    }, "Ticket aanmaken mislukt");
  }

  async function addTicketComment(ticketId: number, body: string) {
    await commentAction.run(async () => {
      setError(null);
      try {
        await apiRequest(`/api/tickets/${ticketId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        await selectTicket(ticketId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reactie plaatsen mislukt");
        throw err;
      }
    }, "Reactie plaatsen mislukt");
  }

  return {
    showTickets,
    setShowTickets,
    tickets,
    activeTicket,
    ticketsLoading,
    ticketSubmitting,
    commentSubmitting,
    resetTicketsPanel,
    openTickets,
    selectTicket,
    createTicket,
    addTicketComment,
  };
}
