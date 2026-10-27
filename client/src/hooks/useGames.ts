import { useCallback, useEffect, useState } from 'react';
import { getGames } from '../services/games';
import type { GamesResponse } from '../types/game';
export function useGames(day: string) {
  const [data, setData] = useState<GamesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    getGames(day, controller.signal).then(setData).catch((e: unknown) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [day, attempt]);
  return { data, error, loading, retry };
}
