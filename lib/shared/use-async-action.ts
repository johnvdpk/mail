"use client";

import { useCallback, useState } from "react";

/**
 * Wraps an async action with loading/error state, matching the
 * try/setLoading/catch/finally pattern used throughout the app's
 * client-side data fetching.
 */
export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(
    action: () => Promise<T>,
    fallbackMessage: string
  ): Promise<T | undefined> => {
    setLoading(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallbackMessage);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
