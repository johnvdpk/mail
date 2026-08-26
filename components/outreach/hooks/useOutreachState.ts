import { useState } from "react";

type Args = {
  setShowSettings: (open: boolean) => void;
  setShowTasksLibrary: (open: boolean) => void;
  setShowTickets: (open: boolean) => void;
  setShowNotes: (open: boolean) => void;
  setShowProjects: (open: boolean) => void;
};

export function useOutreachState({
  setShowSettings,
  setShowTasksLibrary,
  setShowTickets,
  setShowNotes,
  setShowProjects,
}: Args) {
  const [showOutreach, setShowOutreach] = useState(false);

  function resetOutreachPanel() {
    setShowOutreach(false);
  }

  function openOutreach() {
    setShowSettings(false);
    setShowTasksLibrary(false);
    setShowTickets(false);
    setShowNotes(false);
    setShowProjects(false);
    setShowOutreach(true);
  }

  return {
    showOutreach,
    setShowOutreach,
    resetOutreachPanel,
    openOutreach,
  };
}
