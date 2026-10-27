import { useEffect, useState } from 'react';
import { getGamesWindow } from '../services/games';
import type { GamesWindowResponse } from '../types/game';

export function useGameWindow(enabled: boolean, startDate: string, timezone: string) {
  const [data, setData] = useState<GamesWindowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError(null);
    getGamesWindow(startDate, timezone)
      .then(result => { if (active) setData(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Couldn’t load games. Please try again.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, startDate, timezone, attempt]);

  return { data, error, loading, retry: () => setAttempt(value => value + 1) };
}
