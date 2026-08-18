"use client";

import { useEffect, useState } from "react";
import type { SpellingCorrection } from "@/lib/ai-mail";

/**
 * Runs an AI spelling check on `text` and keeps a list of suggested corrections.
 * Corrections are matched against the live text by exact substring, so manual edits
 * that remove/change a flagged fragment automatically drop that suggestion.
 */
export function useSpellcheck(text: string, onChange: (next: string) => void) {
  const [corrections, setCorrections] = useState<SpellingCorrection[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!text.trim() && corrections.length) setCorrections([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  async function runCheck() {
    if (!text.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/spellcheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Spellingcontrole mislukt");
      setCorrections(Array.isArray(data.corrections) ? data.corrections : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spellingcontrole mislukt");
    } finally {
      setChecking(false);
    }
  }

  function accept(correction: SpellingCorrection) {
    const index = text.indexOf(correction.original);
    if (index !== -1) {
      const next =
        text.slice(0, index) + correction.suggestion + text.slice(index + correction.original.length);
      onChange(next);
    }
    setCorrections((prev) => prev.filter((item) => item !== correction));
  }

  function dismiss(correction: SpellingCorrection) {
    setCorrections((prev) => prev.filter((item) => item !== correction));
  }

  function clear() {
    setCorrections([]);
  }

  const visibleCorrections = corrections.filter((item) => text.includes(item.original));

  return { corrections: visibleCorrections, checking, error, runCheck, accept, dismiss, clear };
}
